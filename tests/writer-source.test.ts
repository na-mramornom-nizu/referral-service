import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parseItems,type TextItem} from '../src/pdf';
const items=JSON.parse(await readFile('tests/fixtures/writer-text-items.json','utf8')) as TextItem[];
const parse=(a=items)=>parseItems(a,595.304,841.89).data;
test('LibreOffice: бланк без текстового заголовка, все заполненные и пустые поля',()=>{
  assert(!/направление\s*на\s*ремонт/i.test(items.map(i=>i.str).join(' ')));
  const {sourceNotes,...fields}=parse();
  assert.deepEqual(fields,{sourceIssueDate:'2026-10-26',sourceValidUntil:'2026-12-23',eventDate:'2026-08-10',inspectionDate:'',claimNumber:'TEST-900/2026',policyholder:'ООО «Тестовый страхователь»',policyNumber:'POLICY-TEST-25',deductible:'',carModel:'LADA',vin:'XTAKS045LK1228531',registration:'А123ВС198',year:'2019',mileage:'',color:'',mainStationName:'ООО "Тестовая основная СТО"',mainStationAddress:'Санкт-Петербург, Тестовая улица, 10',mainStationPhone:'7 (812) 5550101',victimName:'ЗАЯВИТЕЛЬ 001\nПРЕДСТАВИТЕЛЬ',victimPhone:'9000000001'});
  assert(sourceNotes.includes('Необходимо провести дефектовку'));assert(!sourceNotes.includes('8 800 100 2 100'));assert(!sourceNotes.includes('Тестовая основная СТО'));
});
test('LibreOffice: отсутствующие значения не заменяются подписями полей',()=>{
  const withoutValues=items.filter(i=>!['TEST-900/2026','LADA','XTAKS045LK1228531','А123ВС198','2019','POLICY-TEST-25','ООО «Тестовый страхователь»'].includes(i.str));
  const data=parse(withoutValues);for(const key of ['claimNumber','carModel','vin','registration','year','policyNumber','policyholder'] as const)assert.equal(data[key],'');
});
test('LibreOffice: значения ранее пустых полей и многострочный адрес читаются отдельно',()=>{
  const row=(str:string,x:number,baseline:number):TextItem=>({str,transform:[8,0,0,8,x,841.89-baseline],width:30,height:8});
  const data=parse([...items,row('12.08.2026',161,135.5),row('12500',211,185.6),row('50000',508.6,135.5),row('СЕРЫЙ',353,185.6),row('корпус 2',339.3,366.4)]);
  assert.equal(data.inspectionDate,'2026-08-12');assert.equal(data.deductible,'12500');assert.equal(data.mileage,'50000');assert.equal(data.color,'СЕРЫЙ');assert.equal(data.mainStationAddress,'Санкт-Петербург, Тестовая улица, 10\nкорпус 2');
});
test('LibreOffice: сомнительные блоки не дают выдуманных значений',()=>{
  assert.throws(()=>parse(items.filter(i=>!/совкомбанк|sovcomins/i.test(i.str))),/страховщика не удалось/);
  const missing=parseItems(items.filter(i=>i.str!=='СТОА'),595.304,841.89);
  assert.equal(missing.data.mainStationName,'');assert(missing.warnings.some(w=>w.includes('реквизиты основной СТО')));
  const moved=items.map(i=>i.str==='СТОА'?{...i,transform:i.transform.map((v,n)=>n===5?v-20:v)}:i);
  assert.equal(parse(moved).mainStationName,'');
  assert.equal(parse([...moved,{str:'НАПРАВЛЕНИЕ НА РЕМОНТ КАСКО',transform:[8,0,0,8,360,810],width:180,height:8}]).mainStationName,'');
});
