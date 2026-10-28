export interface Employee {id:string;name:string}
export interface EmployeeFile {kind:'sovcom-referrals-employees';version:1;employees:Employee[]}
export const normalizeName=(name:string)=>name.trim().replace(/\s+/g,' ');
export function validateEmployees(raw:unknown):Employee[]{
  if(!Array.isArray(raw)||raw.length>1000)throw new Error('Справочник должен содержать не более 1000 сотрудников');
  const ids=new Set<string>();const names=new Set<string>();
  return raw.map((item,index)=>{
    if(!item||typeof item.id!=='string'||!item.id.trim()||item.id.length>100||typeof item.name!=='string')throw new Error(`Некорректная запись сотрудника № ${index+1}`);
    const name=normalizeName(item.name);
    if(!name||name.length>200||/[\u0000-\u001f\u007f]/.test(item.name))throw new Error(`ФИО сотрудника № ${index+1}: от 1 до 200 знаков, без служебных символов`);
    if(ids.has(item.id))throw new Error('В файле повторяются идентификаторы сотрудников');
    if(names.has(name.toLocaleLowerCase('ru')))throw new Error(`ФИО «${name}» уже есть в справочнике`);
    ids.add(item.id);names.add(name.toLocaleLowerCase('ru'));
    return {id:item.id,name};
  });
}
export function readEmployeeFile(raw:unknown):Employee[]{
  const file=raw as EmployeeFile;
  if(!file||file.kind!=='sovcom-referrals-employees'||file.version!==1)throw new Error('Выберите файл «Сотрудники.json», экспортированный из справочника сотрудников');
  return validateEmployees(file.employees);
}
export function employeeFile(employees:Employee[]):EmployeeFile{return {kind:'sovcom-referrals-employees',version:1,employees:validateEmployees(employees)};}
