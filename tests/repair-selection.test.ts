import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {generatePdf,type TextItem,type PdfAssets} from '../src/pdf';
import {validate,defaultSettings,emptyRepairSelection,type ReferralData,type RepairSelection,type LightSide,type WheelPosition} from '../src/domain';

const fixtures=JSON.parse(await readFile('tests/fixtures/expected.json','utf8')) as {file:string;data:ReferralData}[];
const data=fixtures[0].data;
const profile={name:'Проверяющий сотрудник',email:''};
const part={number:'TEST-123',name:'Тестовая деталь',cost:'12500,75'};
const assets:PdfAssets={template:new Uint8Array(await readFile('public/assets/template.png')),regular:new Uint8Array(await readFile('public/assets/regular.ttf')),bold:new Uint8Array(await readFile('public/assets/bold.ttf'))};
await mkdir('output/repair-pdf',{recursive:true});
async function extract(bytes:Uint8Array){const task=getDocument({data:bytes.slice(),useSystemFonts:true});try{const pdf=await task.promise;assert.equal(pdf.numPages,1);const page=await pdf.getPage(1);const content=await page.getTextContent();const items=content.items.filter(i=>'str'in i) as TextItem[];return {text:items.map(i=>i.str).join(' ').replace(/\s+/g,' '),marks:items.filter(i=>i.str==='X')};}finally{await task.destroy();}}
for(const lights of [['left'],['right'],['left','right']] as LightSide[][])test(`Выбор фар: ${lights.join('+')}`,async()=>{
  const repair:RepairSelection={lights,wheels:['frontLeft','rearRight']};
  const result=await generatePdf(data,'lights',defaultSettings.stations[1],profile,part,'2026-10-25',assets,repair);
  const pdf=await extract(result.bytes);assert.equal(pdf.marks.length,lights.length);
  const expected=lights.map(s=>s==='left'?290.1:268.7).sort((a,b)=>a-b);
  const actual=pdf.marks.map(m=>842-m.transform[5]-3.3).sort((a,b)=>a-b);
  expected.forEach((y,i)=>assert.ok(Math.abs(y-actual[i])<.1));
  assert.ok(pdf.marks.every(m=>Math.abs(m.transform[4]-(245.825-3.2))<.1));
  assert.ok(pdf.text.includes(lights.length===2?'Ремонт левой и правой фары':lights[0]==='left'?'Ремонт левой фары':'Ремонт правой фары'));
  assert.ok(!pdf.text.includes('Количество дисков'));
  await writeFile(`output/repair-pdf/lights-${lights.join('-')}.pdf`,result.bytes);
});
const wheels:WheelPosition[]=['frontLeft','frontRight','rearLeft','rearRight'];
const labels=['передний левый','передний правый','задний левый','задний правый'];
for(let mask=1;mask<16;mask++)test(`Выбор дисков: комбинация ${mask}/15`,async()=>{
  const selected=wheels.filter((_,i)=>mask&(1<<i));
  const result=await generatePdf(data,'wheels',defaultSettings.stations[0],profile,part,'2026-10-25',assets,{lights:['left','right'],wheels:selected});
  const pdf=await extract(result.bytes);
  assert.equal(pdf.marks.length,2);assert.ok(pdf.marks.every(m=>Math.abs(m.transform[5]-(842-763.2-3.3))<.1));
  assert.ok(Math.abs(pdf.marks[0].transform[4]-(245.825-3.2))<.1);assert.ok(Math.abs(pdf.marks[1].transform[4]-(285.3-3.2))<.1);
  labels.forEach((label,i)=>assert.equal(pdf.text.includes(label),Boolean(mask&(1<<i))));
  assert.ok(pdf.text.includes(`Количество дисков: ${selected.length} шт.`));
  assert.ok(!pdf.text.includes('Ремонт левой'));
  await writeFile(`output/repair-pdf/wheels-${String(mask).padStart(2,'0')}.pdf`,result.bytes);
});
test('Пустой, повторный и неизвестный выбор блокируется до генерации PDF',async()=>{
  for(const service of ['lights','wheels'] as const){
    const station=defaultSettings.stations[1];
    assert.ok(validate(data,service,station,profile,part,'2026-10-25',emptyRepairSelection()).some(i=>i.field==='repair'));
    await assert.rejects(generatePdf(data,service,station,profile,part,'2026-10-25',assets,emptyRepairSelection()),/Выберите хотя бы/);
    for(const selected of [['unknown'],service==='lights'?['left','left']:['frontLeft','frontLeft']]){
      const repair={...emptyRepairSelection(),[service]:selected} as RepairSelection;
      await assert.rejects(generatePdf(data,service,station,profile,part,'2026-10-25',assets,repair),/Проверьте выбранные позиции/);
    }
  }
});
test('Поставка не требует выбора фар или дисков и не переносит старые позиции',async()=>{
  for(const repair of [emptyRepairSelection(),{lights:['left'],wheels:['rearRight']}] as RepairSelection[]){
    const result=await generatePdf(data,'parts',defaultSettings.stations[1],profile,part,'2026-10-25',assets,repair);
    const pdf=await extract(result.bytes);assert.equal(pdf.marks.length,0);assert.ok(!pdf.text.includes('задний правый'));assert.ok(!pdf.text.includes('Ремонт левой фары'));
  }
});
test('Четыре диска и длинные реквизиты помещаются на одной странице',async()=>{
  const long=fixtures.find(f=>f.file.startsWith('02'))!.data;
  const result=await generatePdf(long,'wheels',defaultSettings.stations[0],profile,part,'2026-10-25',assets,{lights:[],wheels});
  const pdf=await extract(result.bytes);for(const label of labels)assert.ok(pdf.text.includes(label));
  assert.ok(pdf.text.includes(long.mainStationAddress));
  await writeFile('output/repair-pdf/wheels-long-fields.pdf',result.bytes);
});
