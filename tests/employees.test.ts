import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeFile,readEmployeeFile,validateEmployees} from '../src/employees';
import {defaultSettings,validateSettings,replaceEmployees,selectEmployee,renderMailTemplate,emptyData,validate} from '../src/domain';
const people=[{id:'a',name:'Сотрудник 001'},{id:'b',name:'Сотрудник 002'}];
const base=()=>selectEmployee(replaceEmployees(structuredClone(defaultSettings),people),'a');
test('Старый профиль автоматически становится выбранной записью; остальные настройки сохраняются',()=>{
  const {employees,selectedEmployeeId,...legacy}=structuredClone(defaultSettings);legacy.profile={name:'  Сотрудник  001 ',email:'test@example.test'};legacy.subject='Старая тема';
  const result=validateSettings(legacy);assert.deepEqual(result.employees,[{id:'legacy-employee',name:people[0].name}]);assert.equal(result.selectedEmployeeId,'legacy-employee');assert.equal(result.profile.email,legacy.profile.email);assert.equal(result.subject,legacy.subject);assert.deepEqual(result.stations,legacy.stations);assert.deepEqual(validateSettings(result),result);
});
test('Пустой старый профиль не создаёт фиктивного сотрудника',()=>{const {employees,selectedEmployeeId,...legacy}=structuredClone(defaultSettings);assert.deepEqual(validateSettings(legacy),defaultSettings);});
test('Общий файл переносит только справочник и нормализует пробелы',()=>{const file=employeeFile([{id:'a',name:'  Сотрудник   001  '}]);assert.deepEqual(readEmployeeFile(JSON.parse(JSON.stringify(file))),[people[0]]);assert.deepEqual(Object.keys(file).sort(),['employees','kind','version']);assert.deepEqual(Object.keys(file.employees[0]).sort(),['id','name']);});
test('Некорректные формат, версия, записи, повторы и размеры отклоняются',()=>{
  for(const raw of [null,{},defaultSettings,{...employeeFile(people),version:2}])assert.throws(()=>readEmployeeFile(raw));
  for(const raw of [null,[null],[{id:'',name:'А'}],[{id:'x',name:' '}],[{id:'x',name:'А'.repeat(201)}],[{id:'x',name:'А\nБ'}],[people[0],people[0]],[people[0],{id:'c',name:' сотрудник   001 '}],Array(1001).fill(people[0])])assert.throws(()=>validateEmployees(raw));
});
test('Обновление по ID меняет ФИО выбранного сотрудника, сохраняя email, СТО и письмо',()=>{
  const old=base();old.profile.email='private@example.test';old.subject='Личная тема';const next=replaceEmployees(old,[{id:'a',name:'Сотрудник 003'}]);assert.equal(next.selectedEmployeeId,'a');assert.equal(next.profile.name,'Сотрудник 003');assert.equal(next.profile.email,old.profile.email);assert.deepEqual(next.stations,old.stations);assert.equal(next.subject,old.subject);assert.equal(next.body,old.body);assert.equal(old.profile.name,people[0].name);
});
test('После пересоздания ID выбор восстанавливается по ФИО',()=>{const next=replaceEmployees(base(),[{id:'new-id',name:people[0].name}]);assert.equal(next.selectedEmployeeId,'new-id');});
test('Удаление выбранного сотрудника очищает выбор, другой сотрудник не выбирается автоматически',()=>{
  const next=replaceEmployees(base(),[people[1]]);assert.equal(next.selectedEmployeeId,'');assert.equal(next.profile.name,'');assert.ok(validate(emptyData,'lights',next.stations[2],next.profile,{number:'',name:'',cost:''},'2026-10-25',{lights:['left'],wheels:[]}).some(e=>e.field==='employee'));assert.equal(replaceEmployees(defaultSettings,people).selectedEmployeeId,'');
});
test('Очистка справочника и снятие выбора безопасны; неизвестный ID отклоняется',()=>{assert.equal(replaceEmployees(base(),[]).profile.name,'');assert.equal(selectEmployee(base(),'').profile.name,'');assert.throws(()=>selectEmployee(base(),'missing'));assert.throws(()=>validateSettings({...base(),selectedEmployeeId:'missing'}));});
test('Повреждённый импорт не меняет настройки, неполная новая схема отклоняется',()=>{const old=base();const before=structuredClone(old);assert.throws(()=>replaceEmployees(old,[{id:'a',name:''}]));assert.deepEqual(old,before);assert.throws(()=>validateSettings({...old,employees:undefined}));});
test('Резервная копия сохраняет выбор, а ФИО для письма берётся из справочника',()=>{const settings=selectEmployee(base(),'b');const result=validateSettings({...settings,profile:{...settings.profile,name:'Устаревшее ФИО'}});assert.equal(result.profile.name,people[1].name);assert.equal(renderMailTemplate('{employee}',emptyData,'lights',result.stations[2],result.profile),people[1].name);assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(result))),result);});
