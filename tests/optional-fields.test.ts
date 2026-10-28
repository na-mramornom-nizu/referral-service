import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {emptyData,defaultSettings,validate,type RepairSelection} from '../src/domain';
import {generatePdf,readBox,type TextItem} from '../src/pdf';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import layout from './fixtures/layout.json';
const profile={name:'Сотрудник 003',email:''};
const repair:RepairSelection={lights:['right'],wheels:[]};
const station=defaultSettings.stations[2];
test('Все отсутствующие исходные сведения разрешено оставлять пустыми',()=>{
 assert.deepEqual(validate({...emptyData},'lights',station,profile,{number:'',name:'',cost:''},'2026-10-25',repair),[]);
 assert.ok(validate({...emptyData,vin:'invalid'},'lights',station,profile,{number:'',name:'',cost:''},'2026-10-25',repair).some(e=>e.field==='vin'));
});
test('PDF из ручного ввода не подставляет данные в пустые поля',async()=>{
 const assets={template:new Uint8Array(await readFile('public/assets/template.png')),regular:new Uint8Array(await readFile('public/assets/regular.ttf')),bold:new Uint8Array(await readFile('public/assets/bold.ttf'))};
 const result=await generatePdf({...emptyData,claimNumber:'MANUAL-1'},'lights',station,profile,{number:'',name:'',cost:''},'2026-10-25',assets,repair);
 await writeFile('output/pdf/manual-empty.pdf',result.bytes);
 const task=getDocument({data:result.bytes,useSystemFonts:true});
 try{const doc=await task.promise;assert.equal(doc.numPages,1);const p=await doc.getPage(1);const c=await p.getTextContent();const items=c.items.filter(i=>'str' in i) as TextItem[];
 for(const key of ['vin','carModel','deductible','policyholder','eventDate','inspectionDate','victimName'] as const)assert.equal(readBox(items,layout.fields[key]),'');
 assert.ok(!result.notes.includes('СТО основного ремонта'));assert.ok(result.notes.includes('Ремонт правой фары'));}finally{await task.destroy();}
});
