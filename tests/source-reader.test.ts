import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,degrees} from 'pdf-lib';
import {readSource} from '../src/read-source';
import {parseItems,type TextItem} from '../src/pdf';
import {SourceRecognitionError} from '../src/source-layout';
const read=async(path:string)=>new Uint8Array(await readFile(path));
const base=await read('tests/fixtures/input/01-standard.pdf');
const writer=JSON.parse(await readFile('tests/fixtures/writer-text-items.json','utf8')) as TextItem[];
test('Страница направления после пустой страницы автоматически выбирается',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage((await pdf.copyPages(await PDFDocument.load(base),[0]))[0]);
 const r=await readSource(await pdf.save());assert.equal(r.pageNumber,2);assert.equal(r.pageCount,2);assert.equal(r.data.claimNumber,'TEST-1001/2026');assert(r.automatic);
});
test('Несколько направлений требуют выбора; значения не смешиваются',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage((await pdf.copyPages(await PDFDocument.load(base),[0]))[0]);
 pdf.addPage((await pdf.copyPages(await PDFDocument.load(await read('tests/fixtures/input/07-punctuation.pdf')),[0]))[0]);
 const bytes=await pdf.save(),r=await readSource(bytes);assert(!r.automatic);assert.equal(r.data.claimNumber,'');
 assert.equal((await readSource(bytes,{page:2})).data.claimNumber,'TEST-007/26');
 await assert.rejects(readSource(bytes,{page:3}),/несуществующая/);
});
test('Скан открывается для ручного заполнения без фиктивного распознавания',async()=>{
 const r=await readSource(await read('tests/fixtures/input/13-image-only.pdf'));assert(!r.automatic);assert(Object.values(r.data).every(v=>!v));assert.match(r.warnings[0],/нет читаемого текста/);
});
test('Посторонние и повреждённые файлы отклоняются',async()=>{
 for(const file of ['15-wrong-form.pdf','16-damaged.pdf','17-not-pdf.pdf'])await assert.rejects(readSource(await read('tests/fixtures/input/'+file)));
});
test('Повороты метаданных 90/180/270 не меняют поля',async()=>{
 const expected=(await readSource(base)).data;
 for(const angle of [90,180,270]){const doc=await PDFDocument.load(base);doc.getPage(0).setRotation(degrees(angle));assert.deepEqual((await readSource(await doc.save())).data,expected);}
});
test('PDF с BOM перед заголовком читается',async()=>{
 const withBom=new Uint8Array(base.length+3);withBom.set([239,187,191]);withBom.set(base,3);assert.equal((await readSource(withBom)).data.claimNumber,'TEST-1001/2026');
});
test('Новый неизвестный макет не подставляет данные по старым координатам',()=>{
 const changed=writer.map(i=>i.str==='Договор'?{...i,transform:i.transform.map((v,n)=>n===4?v+17:v)}:i);
 assert.throws(()=>parseItems(changed,595,842),/расположение полей отличается/);
});
test('Фактическое вращение текстовых объектов нормализуется',()=>{
 const expected=parseItems(writer,595,842).data;
 for(const angle of [Math.PI/2,Math.PI,3*Math.PI/2]){const c=Math.cos(angle),s=Math.sin(angle);const rotated=writer.map(i=>{const[a,b,d,e,x,y]=i.transform;return {...i,transform:[c*a-s*b,s*a+c*b,c*d-s*e,s*d+c*e,c*x-s*y,s*x+c*y]};});assert.deepEqual(parseItems(rotated,842,595).data,expected);}
});
test('Объединённые подпись и значение не теряются без предупреждения',()=>{
 const model=writer.find(i=>i.str==='LADA')!;const changed=writer.filter(i=>i!==model).concat({...model,str:'Модель LADA',width:100,transform:model.transform.map((v,n)=>n===4?330:v)});
 const r=parseItems(changed,595,842);assert.equal(r.data.carModel,'');assert(r.warnings.some(w=>w.includes('объединена')));
});
test('Неизвестное направление с другими подписями направляется на ручное заполнение',()=>{
 const text=['Совкомбанк Страхование','Направление на ремонт','VIN автомобиля','Номер убытка','Страховой полис','Станция обслуживания'];
 const items=text.map((str,n)=>({str,width:220,height:10,transform:[10,0,0,10,40,780-n*25]}));
 assert.throws(()=>parseItems(items,595,842),e=>e instanceof SourceRecognitionError&&e.reason==='manual');
});
