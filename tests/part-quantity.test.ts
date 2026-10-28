import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {partQuantity,validate,defaultSettings,emptyData,emptyRepairSelection} from '../src/domain';
import {generatePdf,type PdfAssets} from '../src/pdf';
const part={number:'TEST-QTY-15',name:'Кронштейн крепления фары',cost:'12500,75'};
const profile={name:'Проверяющий сотрудник',email:''};
const assets:PdfAssets={template:new Uint8Array(await readFile('public/assets/template.png')),regular:new Uint8Array(await readFile('public/assets/regular.ttf')),bold:new Uint8Array(await readFile('public/assets/bold.ttf'))};
test('Количество: совместимость единицы, положительные целые, недопустимые значения',()=>{
  assert.equal(partQuantity(part),1);
  for(const value of ['1','2','15','999999'])assert.equal(partQuantity({...part,quantity:value}),Number(value));
  for(const quantity of ['','0','-1','1.5','1,5','abc','1e2','1000000']){
    assert.equal(partQuantity({...part,quantity}),null);
    for(const service of ['parts','harness'] as const)assert(validate(emptyData,service,defaultSettings.stations[service==='parts'?1:0],profile,{...part,quantity},'2026-10-26',emptyRepairSelection()).some(e=>e.field==='part.quantity'));
  }
  assert(!validate(emptyData,'lights',defaultSettings.stations[1],profile,{...part,quantity:''},'2026-10-26',{lights:['left'],wheels:[]}).some(e=>e.field==='part.quantity'));
});
for(const [service,quantity] of [['parts','3'],['harness','12']] as const)test(`PDF ${service}: количество ${quantity} и общая сумма без умножения`,async()=>{
  const result=await generatePdf(emptyData,service,defaultSettings.stations[service==='parts'?1:0],profile,{...part,quantity},'2026-10-26',assets,emptyRepairSelection());
  const task=getDocument({data:result.bytes.slice(),useSystemFonts:true});
  try{const doc=await task.promise;assert.equal(doc.numPages,1);const page=await doc.getPage(1);const content=await page.getTextContent();const text=content.items.filter(i=>'str'in i).map(i=>i.str).join(' ').replace(/\s+/g,' ');assert(text.includes(`Количество: ${quantity} шт.`));assert(text.includes('Стоимость: 12 500,75 руб.'));}finally{await task.destroy();}
  await mkdir('output/pdf',{recursive:true});await writeFile(`output/pdf/quantity-${service}.pdf`,result.bytes);
});
