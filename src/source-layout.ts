import original from '../tests/fixtures/layout.json';
import type {TextItem} from './pdf';

type Fields=typeof original.fields;
// The LibreOffice export has a graphical title and a different table geometry.
// Match printed labels, not claim/customer values, before trusting these boxes.
export const writerAnchors:[string,number,number][]=[
  ['Дата направления',35.5,107.2],['Действует до',163,107.2],['Марка/',302.3,107.2],
  ['VIN/шасси/',302.3,135.5],['Страхователь',35.5,160.9],['Договор',35.5,185.6],
  ['Список повреждений',34.8,213.8],['Примечания:',301.5,213.8],
  ['СТОА',303.1,346.5],['Адрес',303.1,357.2],['Телефон',303.1,377.1],
  ['Потерпевший',300.3,769.3],
];
const writerFields:Fields={
  issueDate:[109,97,48,26],validUntil:[243,97,54,26],carModel:[350,97,218,26],
  eventDate:[72,126,47,23],inspectionDate:[159,126,48,23],claimNumber:[243,126,54,23],
  vin:[350,126,109,23],mileage:[505,126,63,23],
  policyholder:[109,151,188,23],registration:[375,151,84,23],year:[505,151,63,23],
  policyNumber:[72,177,85,15],deductible:[209,177,88,15],color:[350,177,218,15],
  notes:[300,226,268,88],stationName:[337,338,231,10],
  stationAddress:[337,349,231,20],stationPhone:[337,369,231,12],
  insurerRepresentative:[117,759,128,28],victimName:[355,759,151,28],
};
export const originalAnchors:[string,number,number][]=[
 ['Дата направления',20.75,87.2],['Действует до',169.5,87.2],['Марка/',298.25,87.2],
 ['VIN/шасси/',298.25,111.45],['Страхователь',20.75,133.95],['Договор',20.75,159.45],
 ['Список повреждений',24.55,185.5],['Примечания:',298.25,185.5],
 ['СТОА',299.75,391.8],['Адрес',299.75,406.8],['Телефон',299.75,431.3],
 ['Потерпевший',298.25,792.15],
];
export class SourceRecognitionError extends Error {
 constructor(public reason:'foreign'|'manual',message:string){super(message);}
}
export const cleanText=(s:string)=>s.normalize('NFC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\u00ad]/g,'').replace(/\u00a0/g,' ');
const compact=(s:string)=>cleanText(s).normalize('NFKC').toLowerCase().replace(/\s/g,'');
type Point={x:number;y:number};
type Anchor=[string,number,number];
// Text order in the PDF stream is irrelevant. Assemble geometric lines, retaining
// each character's source location so labels also work across separate glyph runs.
function textLines(items:TextItem[]){
 const lines:{y:number;items:TextItem[]}[]=[];
 for(const i of [...items].sort((a,b)=>b.transform[5]-a.transform[5])){
  if(!i.str.trim()||Math.abs(i.transform[1])>Math.abs(i.transform[0])*.1)continue;
  const y=842-i.transform[5];let l=lines.find(l=>Math.abs(l.y-y)<.45);
  if(!l){l={y,items:[]};lines.push(l);}l.items.push(i);
 }
 return lines.map(l=>{let text='';const points:Point[]=[];let right=-Infinity;
  for(const i of l.items.sort((a,b)=>a.transform[4]-b.transform[4])){
   if(i.transform[4]-right>Math.max(12,i.height*2)){text+='|';points.push({x:i.transform[4],y:l.y});}
   const chars=Array.from(i.str);chars.forEach((c,n)=>{for(const ch of compact(c)){text+=ch;points.push({x:i.transform[4]+i.width*n/chars.length,y:842-i.transform[5]});}});
   right=i.transform[4]+i.width;
  }return {text,points};
 });
}
function upright(input:TextItem[]):TextItem[]{
 const weights=[0,0,0,0];for(const i of input){const angle=Math.atan2(i.transform[1],i.transform[0]);weights[(Math.round(angle/(Math.PI/2))+4)%4]+=i.str.length;}
 const quadrant=weights.indexOf(Math.max(...weights)),angle=-quadrant*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
 return input.map(i=>{const [a,b,d,e,x,y]=i.transform;return {...i,str:cleanText(i.str),transform:[c*a-s*b,s*a+c*b,c*d-s*e,s*d+c*e,c*x-s*y,s*x+c*y]};});
}
function regression(pairs:{from:number;to:number}[]){
 const x=pairs.reduce((s,p)=>s+p.from,0)/pairs.length,y=pairs.reduce((s,p)=>s+p.to,0)/pairs.length;
 const denom=pairs.reduce((s,p)=>s+(p.from-x)**2,0);
 const scale=denom?pairs.reduce((s,p)=>s+(p.from-x)*(p.to-y),0)/denom:1;
 return {scale,offset:y-scale*x};
}
export function sourceLayout(input:TextItem[]){
 const items=upright(input),lines=textLines(items);
 const find=(label:string):Point[]=>lines.flatMap(l=>{const out:Point[]=[];const key=compact(label);let start=0,index;
  while((index=l.text.indexOf(key,start))>=0){out.push(l.points[index]);start=index+key.length;}return out;});
 const evidence=['Дата направления','Действует до','Марка/','VIN/шасси/','Страхователь','Договор','Список повреждений','Примечания:','СТОА'].filter(s=>find(s).length);
 const all=lines.map(l=>l.text).join('');const insurer=/совкомбанк|sovcomins/.test(all);
 const alternative=insurer&&/направлени.*ремонт/.test(all)&&/vin|вин|шасси/.test(all)&&/убыт|страхов.*случ/.test(all)&&/договор|полис|страхователь/.test(all)&&/стоа|станци/.test(all);
 if(!insurer||evidence.length<5){const manual=evidence.length>=5||alternative;throw new SourceRecognitionError(manual?'manual':'foreign',manual?'Бланк похож на направление, но его структуру или страховщика не удалось уверенно прочитать. Заполните данные по исходнику вручную.':'В документе не найдена структура направления Совкомбанк Страхование. Выберите направление или заполните данные вручную.');}
 const profiles=[{anchors:originalAnchors,fields:original.fields},{anchors:writerAnchors,fields:writerFields}];
 const fitted=profiles.flatMap(profile=>{
  const anchors=profile.anchors.slice(0,8);const matches=anchors.map(a=>find(a[0]));
  // Enumerate the two far-apart header labels to propose translation/scale.
  const proposals=[];
  for(const left of matches[0])for(const right of matches[2])for(const bottom of matches[5]){
   const sx=(right.x-left.x)/(anchors[2][1]-anchors[0][1]),sy=(bottom.y-left.y)/(anchors[5][2]-anchors[0][2]);
   if(sx<.3||sx>3||sy<.3||sy>3||Math.abs(sx/sy-1)>.12)continue;
   let tx=left.x-sx*anchors[0][1],ty=left.y-sy*anchors[0][2];
   const pairs=anchors.map((a,n)=>{const near=matches[n].map(p=>({p,err:Math.hypot((p.x-tx)/sx-a[1],(p.y-ty)/sy-a[2])})).sort((a,b)=>a.err-b.err)[0];return near&&near.err<3?{a,p:near.p}:null;}).filter(p=>p!==null);
   if(pairs.length<8)continue;
   const fx=regression(pairs.map(({a,p})=>({from:a[1],to:p.x}))),fy=regression(pairs.map(({a,p})=>({from:a[2],to:p.y})));
   const error=Math.max(...pairs.map(({a,p})=>Math.hypot((p.x-fx.offset)/fx.scale-a[1],(p.y-fy.offset)/fy.scale-a[2])));
   if(error>.8)continue;
   proposals.push({profile,sx:fx.scale,sy:fy.scale,tx:fx.offset,ty:fy.offset,error});
  }return proposals;
 }).sort((a,b)=>a.error-b.error);
 if(!fitted.length)throw new SourceRecognitionError('manual','Направление найдено, но расположение полей отличается от известных бланков. Заполните данные вручную, сверяясь с исходником.');
 const fit=fitted[0],fields=structuredClone(fit.profile.fields),warnings:string[]=[];
 // Independent lower blocks may move when a note/address expands. Align them
 // separately, never extrapolate a header fit into an unverified station block.
 const adjust=(anchors:Anchor[],keys:(keyof Fields)[],maxDistance:number)=>{
  const points=anchors.map(a=>find(a[0]).map(p=>({x:(p.x-fit.tx)/fit.sx-a[1],y:(p.y-fit.ty)/fit.sy-a[2]})).filter(p=>Math.abs(p.x)<maxDistance&&Math.abs(p.y)<maxDistance));
  let offset:Point|undefined;
  for(const p of points[0]||[]){if(points.every(ps=>ps.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1.2))){offset=p;break;}}
  if(offset){for(const key of keys){fields[key][0]+=offset.x;fields[key][1]+=offset.y;}}
  else {for(const key of keys)fields[key]=[-10000,-10000,0,0];warnings.push(`Не удалось уверенно прочитать ${keys.includes('stationName')?'реквизиты основной СТО':'ФИО потерпевшего внизу бланка'}. Перенесите их из исходника вручную.`);}
 };
 adjust(fit.profile.anchors.slice(8,11),['stationName','stationAddress','stationPhone'],120);
 adjust(fit.profile.anchors.slice(11),['victimName'],45);
 const normalized=items.map(i=>({...i,width:i.width/fit.sx,height:i.height/fit.sy,transform:[i.transform[0]/fit.sx,i.transform[1]/fit.sy,i.transform[2]/fit.sx,i.transform[3]/fit.sy,(i.transform[4]-fit.tx)/fit.sx,842-(842-i.transform[5]-fit.ty)/fit.sy]}));
 return {items:normalized,fields,warnings};
}
