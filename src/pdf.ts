import {PDFDocument, rgb, type PDFFont, type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import layout from '../tests/fixtures/layout.json';
import {sourceLayout,originalAnchors} from './source-layout';
import {type ReferralData,type Service,type Station,type Profile,type Part,type RepairSelection,repairDescription,services,isSupply,formatDate,formatMoney,addMonths,validate,parseDate,partQuantity} from './domain';
export interface PdfAssets {template:Uint8Array;regular:Uint8Array;bold:Uint8Array}
type Box=number[];
export interface TextItem {str:string;transform:number[];width:number;height:number;hasEOL?:boolean}
export function readBox(items:TextItem[],box:Box,height=842):string {
  const [x,y,w,h]=box;
  const selected=items.filter(t=>{const cx=t.transform[4]+Math.min(t.width,3)/2;const cy=height-t.transform[5]-Math.abs(t.height||t.transform[3])/2;return t.str.trim()&&cx>=x-1&&cx<=x+w+1&&cy>=y-1&&cy<=y+h+1;});
  const lines:{y:number;items:TextItem[]}[]=[];
  for(const t of selected.sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){let line=lines.find(l=>Math.abs(l.y-t.transform[5])<2.3);if(!line){line={y:t.transform[5],items:[]};lines.push(line);}line.items.push(t);}
  return lines.map(l=>{let result='',right=0;for(const item of l.items.sort((a,b)=>a.transform[4]-b.transform[4])){const gap=item.transform[4]-right;if(result&&gap>1.4&&!result.endsWith(' ')&&!item.str.startsWith(' '))result+=' ';result+=item.str;right=item.transform[4]+item.width;}return result.trim();}).join('\n').trim();
}
export function parseItems(items:TextItem[],width:number,height:number):{data:ReferralData;warnings:string[]} {
  const recognized=sourceLayout(items);const f=recognized.fields;items=recognized.items;
  const uncertain:string[]=[];
  const get=(key:keyof typeof f)=>{
    const [x,y,w,h]=f[key];
    // A single text run crossing from a label/adjacent cell into this value cannot
    // be safely split with proportional-font width estimates. Do not guess.
    const crossed=items.some(i=>{const cy=842-i.transform[5]-i.height/2;return i.str.trim()&&cy>=y&&cy<=y+h&&i.transform[4]<x-2&&i.transform[4]+i.width>x+5;});
    if(crossed&&key!=='notes'){uncertain.push(key);return '';}
    return readBox(items,f[key],842);
  };
  const notes=get('notes');
  let victimPhone=notes.match(/Тел\.?\s*:\s*([+\d][\d\s()+-]*)/i)?.[1]?.trim()||'';
  while(victimPhone.endsWith(')')&&(victimPhone.match(/\)/g)?.length||0)>(victimPhone.match(/\(/g)?.length||0))victimPhone=victimPhone.slice(0,-1).trim();
  const victim=get('victimName')||notes.match(/Потерпевший\s*\(представитель\)\s*:\s*([\s\S]*?)(?=\(?Тел\.|СТО основного|$)/i)?.[1]?.trim()||'';
  const data:ReferralData={sourceIssueDate:parseDate(get('issueDate')),sourceValidUntil:parseDate(get('validUntil')),eventDate:parseDate(get('eventDate')),inspectionDate:parseDate(get('inspectionDate')),claimNumber:get('claimNumber'),policyholder:get('policyholder'),policyNumber:get('policyNumber'),deductible:get('deductible'),carModel:get('carModel'),vin:get('vin').replace(/\s/g,''),registration:get('registration').replace(/\s/g,''),year:get('year'),mileage:get('mileage').replace(/\s/g,''),color:get('color'),mainStationName:get('stationName'),mainStationAddress:get('stationAddress'),mainStationPhone:get('stationPhone'),victimName:victim,victimPhone,sourceNotes:notes};
  const warnings=['Проверьте извлечённые данные по исходному документу перед выпуском.',...recognized.warnings];
  if(uncertain.length)warnings.push('Часть текста объединена с соседними ячейками. Некоторые значения оставлены пустыми: проверьте и перенесите их из исходника вручную.');
  for(const [rawKey,dataKey] of [['issueDate','sourceIssueDate'],['validUntil','sourceValidUntil'],['eventDate','eventDate'],['inspectionDate','inspectionDate']] as const){if(get(rawKey)&&!data[dataKey])warnings.push('Не удалось прочитать одну из дат. Сверьте даты с исходником.');}
  if(!data.victimPhone&&/Потерпевший/i.test(notes))warnings.push('Телефон потерпевшего не найден. Если он есть в исходнике, перенесите его вручную.');
  if(Object.values(data).filter(Boolean).length<10)warnings.push('В исходнике мало заполненных полей. Сверьте данные; отсутствующие сведения можно оставить пустыми.');
  return {data,warnings};
}
function splitLines(text:string,font:PDFFont,size:number,width:number):string[]{
  const result:string[]=[];
  for(const paragraph of text.replace(/\r/g,'').split('\n')){
    if(!paragraph){result.push('');continue;}
    let current='';
    for(const word of paragraph.split(/ +/)){
      const candidate=current?current+' '+word:word;
      if(font.widthOfTextAtSize(candidate,size)<=width){current=candidate;continue;}
      if(current){result.push(current);current='';}
      if(font.widthOfTextAtSize(word,size)<=width){current=word;continue;}
      for(const char of word){if(current&&font.widthOfTextAtSize(current+char,size)>width){result.push(current);current='';}current+=char;}
    }
    if(current)result.push(current);
  }
  return result;
}
export function fitText(text:string,font:PDFFont,box:Box,max=10,min=6.5):{lines:string[];size:number;lineHeight:number}{
  for(let size=max;size>=min-.01;size-=.25){const lineHeight=size*1.15;const lines=splitLines(text,font,size,box[2]-4);if(lines.length*lineHeight<=box[3]-2)return {lines,size,lineHeight};}
  throw new Error('Текст не помещается в бланк. Сократите значение или уточните реквизиты: '+text.slice(0,85));
}
function draw(page:PDFPage,text:string,font:PDFFont,box:Box,size=10,min=6.5){if(!text.trim())return;const fit=fitText(text,font,box,size,min);fit.lines.forEach((line,i)=>page.drawText(line,{x:box[0]+2,y:842-box[1]-fit.size-1-i*fit.lineHeight,size:fit.size,font,color:rgb(0,0,0)}));}
export interface Generated {bytes:Uint8Array;notes:string}
export async function generatePdf(data:ReferralData,service:Service,station:Station,profile:Profile,part:Part,issued:string,assets:PdfAssets,repair:RepairSelection):Promise<Generated>{
  const errors=validate(data,service,station,profile,part,issued,repair);if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const regular=await doc.embedFont(assets.regular,{subset:true});const bold=await doc.embedFont(assets.bold,{subset:true});
  const page=doc.addPage([595,842]);const background=await doc.embedPng(assets.template);page.drawImage(background,{x:0,y:0,width:595,height:842});
  // Selectable structural labels for re-import; the visual template is unchanged.
  for(const [label,x,y] of originalAnchors)page.drawText(label,{x,y:842-y,size:8,font:regular,opacity:0});
  page.drawText('Совкомбанк Страхование',{x:445,y:785,size:8,font:regular,opacity:0});
  const fields:Record<string,string>={issueDate:formatDate(issued),validUntil:formatDate(addMonths(issued))+' 0:00',eventDate:formatDate(data.eventDate),inspectionDate:formatDate(data.inspectionDate),claimNumber:data.claimNumber,policyholder:data.policyholder,policyNumber:data.policyNumber,deductible:formatMoney(data.deductible),carModel:data.carModel,vin:data.vin,registration:data.registration,year:data.year,mileage:data.mileage,color:data.color,stationName:station.name,stationAddress:station.address,stationPhone:station.phone,insurerRepresentative:profile.name,victimName:data.victimName};
  for(const [key,value] of Object.entries(fields)){const box=layout.fields[key as keyof typeof layout.fields];draw(page,value,key==='deductible'?bold:regular,box,['eventDate','inspectionDate'].includes(key)?8:['policyNumber','issueDate','validUntil'].includes(key)?8.5:10);}
  const title=isSupply(service)?`${services[service].title}\nНомер: ${part.number}\nНаименование: ${part.name}\nКоличество: ${partQuantity(part)} шт.\nСтоимость: ${formatMoney(part.cost)} руб.`:repairDescription(service,repair);
  const victim=data.victimName?`Потерпевший (представитель): ${data.victimName}${data.victimPhone?'\nТел.: '+data.victimPhone:''}`:data.victimPhone?'Телефон потерпевшего: '+data.victimPhone:'';
  const mainDetails=[data.mainStationName,data.mainStationAddress,data.mainStationPhone].filter(v=>v.trim());
  const main=mainDetails.length?`СТО основного ремонта:\n${mainDetails.join('\n')}`:'';
  const sections=[title,victim,main].filter(Boolean);
  // Fit the complete note first, then reduce the claimant text inside the same layout.
  const noteText=sections.join('\n\n');const notesBox=layout.fields.notes;
  const fit=fitText(noteText,regular,notesBox,9,6.5);
  let top=notesBox[1]+1;
  for(const section of sections){const small=section===victim?Math.max(6.5,fit.size-1):fit.size;const lines=splitLines(section,regular,small,notesBox[2]-4);for(const line of lines){page.drawText(line,{x:notesBox[0]+2,y:842-top-small,size:small,font:regular});top+=fit.lineHeight;}top+=fit.lineHeight;}
  const marks=service==='lights'?(['right','left'] as const).filter(side=>repair.lights.includes(side)).map(side=>[layout.repairMarks.columnCenters.repair,side==='right'?layout.repairMarks.rowCenters.headlightRight:layout.repairMarks.rowCenters.headlightLeft]):service==='wheels'?layout.repairMarks.serviceMarks.wheels:[];
  for(const [x,y] of marks)page.drawText('X',{x:x-3.2,y:842-y-3.3,size:10,font:regular});
  doc.setTitle(`Направление ${data.claimNumber} — ${station.name}`);doc.setAuthor(profile.name);doc.setCreator('Сервис выдачи направлений');doc.setProducer('Sovcom Referrals 1.3');
  return {bytes:await doc.save(),notes:noteText};
}
