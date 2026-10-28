import {newId} from './id';
import {type Employee,validateEmployees,normalizeName} from './employees';
export type Service = 'lights' | 'wheels' | 'parts' | 'harness';
export type LightSide = 'left' | 'right';
export type WheelPosition = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';
export interface RepairSelection {lights:LightSide[];wheels:WheelPosition[]}
export const lightOptions:{id:LightSide;label:string}[]=[{id:'left',label:'Левая фара'},{id:'right',label:'Правая фара'}];
export const wheelOptions:{id:WheelPosition;label:string}[]=[{id:'frontLeft',label:'Передний левый'},{id:'frontRight',label:'Передний правый'},{id:'rearLeft',label:'Задний левый'},{id:'rearRight',label:'Задний правый'}];
export const emptyRepairSelection=():RepairSelection=>({lights:[],wheels:[]});
export function repairDescription(service:Service,selection:RepairSelection):string {
  if(service==='lights'){
    if(!selection.lights.length)return 'Выберите фару для ремонта';
    return selection.lights.length===2?'Ремонт левой и правой фары':selection.lights[0]==='left'?'Ремонт левой фары':'Ремонт правой фары';
  }
  if(service==='wheels'){
    const selected=wheelOptions.filter(o=>selection.wheels.includes(o.id));
    if(!selected.length)return 'Выберите диски для ремонта и окраски';
    return `Ремонт и окраска ${selected.length===1?'колесного диска':'колесных дисков'}:\n${selected.map(o=>o.label.toLowerCase()).join('; ')}.\nКоличество дисков: ${selected.length} шт.`;
  }
  return services[service].title;
}
export interface Station { id: string; name: string; address: string; phone: string; email: string; services: Service[]; draft: boolean }
export interface Profile { name: string; email: string }
export interface Settings { version: 1; profile: Profile; employees:Employee[]; selectedEmployeeId:string; stations: Station[]; subject: string; body: string }
export interface ReferralData {
  sourceIssueDate: string; sourceValidUntil: string; eventDate: string; inspectionDate: string;
  claimNumber: string; policyholder: string; policyNumber: string; deductible: string;
  carModel: string; vin: string; registration: string; year: string; mileage: string; color: string;
  mainStationName: string; mainStationAddress: string; mainStationPhone: string;
  victimName: string; victimPhone: string; sourceNotes: string;
}
export interface Part { number: string; name: string; cost: string; quantity?:string }
// Older callers without quantity describe a single item; an explicitly empty value is invalid.
export function partQuantity(part:Part):number|null {
  const value=part.quantity===undefined?'1':part.quantity.trim();
  return /^\d{1,6}$/.test(value)&&Number(value)>0?Number(value):null;
}
export interface Issue { field: string; message: string }
export const services: Record<Service, {title:string; short:string; description:string}> = {
  lights:{title:'Ремонт фар',short:'Фары',description:'Ремонт выбранных фар'},
  wheels:{title:'Ремонт и окраска дисков',short:'Диски',description:'Ремонт и окраска колесных дисков'},
  parts:{title:'Поставка детали',short:'Детали',description:'Номер, название и стоимость детали'},
  harness:{title:'Поставка ремкомплекта жгута проводов',short:'Ремкомплект жгута',description:'Поставка по номеру ремкомплекта'},
};
export const emptyData: ReferralData = {sourceIssueDate:'',sourceValidUntil:'',eventDate:'',inspectionDate:'',claimNumber:'',policyholder:'',policyNumber:'',deductible:'',carModel:'',vin:'',registration:'',year:'',mileage:'',color:'',mainStationName:'',mainStationAddress:'',mainStationPhone:'',victimName:'',victimPhone:'',sourceNotes:''};
export const defaultSettings: Settings = {version:1,profile:{name:'',email:''},employees:[],selectedEmployeeId:'',stations:[
  {id:'station-1',name:'СТО 1',address:'Тестовый город, ул. Сервисная, д. 1',phone:'+7 (000) 000-00-01',email:'',services:['wheels','harness'],draft:true},
  {id:'sales',name:'ООО «СЕЙЛС-ПАРТС»',address:'Тестовый город, ул. Сервисная, д. 2',phone:'+7 (000) 000-00-01',email:'',services:['parts','lights','wheels'],draft:true},
  {id:'light',name:'ООО «ЛУЧШИЙ СВЕТ»',address:'Тестовый город, ул. Сервисная, д. 3',phone:'+7 (000) 000-00-03',email:'',services:['lights'],draft:true}
],subject:'Направление на {service} — убыток {claim}',body:'Добрый день!\n\nНаправляем документ на {service}.\nНомер убытка: {claim}.\nАвтомобиль: {car}, госномер {registration}.\nИсполнитель: {station}.\n\nПросим подтвердить получение.\n\nС уважением,\n{employee}'};
export const isSupply=(s:Service)=>s==='parts'||s==='harness';
export function dateISO(date=new Date()):string {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function validDate(value:string):boolean {if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function addMonths(iso:string,amount=2):string {if(!validDate(iso))throw new Error('Некорректная дата направления');const [y,m,d]=iso.split('-').map(Number);const first=new Date(Date.UTC(y,m-1+amount,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(d,last));return first.toISOString().slice(0,10);}
export function formatDate(iso:string):string {if(!validDate(iso))return iso;return iso.split('-').reverse().join('.');}
export function parseDate(raw:string):string {const m=raw.match(/\b(\d{2})\.(\d{2})\.(\d{4}|\d{2})\b/);if(!m)return '';const out=`${m[3].length===2?'20'+m[3]:m[3]}-${m[2]}-${m[1]}`;return validDate(out)?out:'';}
export function money(value:string):number|null {const cleaned=value.trim().replace(/[\s\u00a0]/g,'').replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(cleaned))return null;const n=Number(cleaned);return Number.isFinite(n)&&n<=999999999.99?n:null;}
export function formatMoney(value:string):string {const n=money(value);return n===null?value:new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
export function emailValid(value:string):boolean {return value.length<=254&&!/[\r\n]/.test(value)&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value);}
export function validate(data:ReferralData,service:Service,station:Station|undefined,profile:Profile,part:Part,issued:string,repair:RepairSelection):Issue[]{
  const errors:Issue[]=[];
  if(service==='lights'||service==='wheels'){
    const selected=repair[service];const options=service==='lights'?lightOptions:wheelOptions;
    if(!selected.length)errors.push({field:'repair',message:service==='lights'?'Выберите хотя бы одну фару для ремонта':'Выберите хотя бы один диск для ремонта и окраски'});
    else if(new Set(selected).size!==selected.length||selected.some(id=>!options.some(o=>o.id===id)))errors.push({field:'repair',message:'Проверьте выбранные позиции ремонта'});
  }
  // Missing source fields stay empty. Validate only values the user supplied.
  for(const [key,value] of Object.entries(data))if(value.length>1500)errors.push({field:key,message:'Слишком длинное значение: максимум 1500 знаков'});
  for(const key of ['eventDate','inspectionDate'] as const)if(data[key]&&!validDate(data[key]))errors.push({field:key,message:'Укажите существующую дату'});
  if(!validDate(issued))errors.push({field:'issued',message:'Некорректная дата направления'});
  if(data.vin&&!/^[A-HJ-NPR-Z0-9]{17}$/i.test(data.vin.trim()))errors.push({field:'vin',message:'VIN должен содержать 17 латинских букв и цифр, без I, O, Q'});
  if(data.year&&(!/^\d{4}$/.test(data.year)||Number(data.year)<1900||Number(data.year)>new Date().getFullYear()+1))errors.push({field:'year',message:'Проверьте год выпуска'});
  if(data.mileage&&!/^\d{1,8}$/.test(data.mileage.trim()))errors.push({field:'mileage',message:'Пробег: целое неотрицательное число'});
  if(data.deductible&&money(data.deductible)===null)errors.push({field:'deductible',message:'Франшиза: сумма в рублях, до двух знаков после запятой'});
  if(!profile.name.trim())errors.push({field:'employee',message:'Выберите сотрудника из справочника в настройках или ниже'});
  if(profile.name.length>200)errors.push({field:'employee',message:'ФИО сотрудника: максимум 200 знаков'});
  if(!station)errors.push({field:'station',message:'Выберите СТО'});
  else {if(!station.services.includes(service))errors.push({field:'station',message:'Выбранная СТО не оказывает эту услугу'});if(!station.name.trim()||!station.address.trim()||!station.phone.trim())errors.push({field:'station',message:'В карточке СТО нужны название, адрес и телефон'});}
  if(isSupply(service)){for(const [key,label] of [['number','номер'],['name','название'],['cost','стоимость']] as const)if(!part[key].trim())errors.push({field:'part.'+key,message:`Укажите ${label} детали`});if(part.cost&&(money(part.cost)===null||money(part.cost)!<=0))errors.push({field:'part.cost',message:'Стоимость должна быть больше нуля, до двух знаков после запятой'});if(part.name.length>700||part.number.length>200)errors.push({field:'part.name',message:'Название: до 700 знаков; номер: до 200 знаков'});}
  if(isSupply(service)&&partQuantity(part)===null)errors.push({field:'part.quantity',message:'Количество: целое число от 1 до 999999'});
  return errors;
}
export function validateSettings(raw:unknown):Settings {
  const s=raw as Settings;
  if(!s||s.version!==1||!s.profile||typeof s.profile.name!=='string'||typeof s.profile.email!=='string'||!Array.isArray(s.stations)||typeof s.subject!=='string'||typeof s.body!=='string')throw new Error('Файл не является настройками приложения версии 1');
  if(s.stations.length>100||s.profile.name.length>200||s.subject.length>500||s.body.length>10000)throw new Error('Превышен допустимый размер настроек');
  if(s.profile.email&&!emailValid(s.profile.email))throw new Error('Некорректный email сотрудника');
  const ids=new Set<string>();
  const stations=s.stations.map(st=>{if(!st||!['id','name','address','phone','email'].every(k=>typeof(st as unknown as Record<string,unknown>)[k]==='string'))throw new Error('Некорректная карточка СТО');if(!st.id||ids.has(st.id))throw new Error('Идентификаторы СТО должны быть уникальны');ids.add(st.id);if(!st.name.trim()||!st.address.trim()||!st.phone.trim())throw new Error('Заполните название, адрес и телефон СТО');if([st.name,st.address,st.phone,st.email,st.id].some(v=>v.length>1000))throw new Error('Реквизиты СТО слишком длинные');if(st.email&&!emailValid(st.email))throw new Error('Проверьте email СТО');if(!Array.isArray(st.services)||!st.services.length||st.services.some(v=>!Object.hasOwn(services,v)))throw new Error('Укажите допустимые услуги СТО');return {id:st.id,name:st.name,address:st.address,phone:st.phone,email:st.email,services:[...new Set(st.services)],draft:st.draft!==false};});
  // Keep the existing browser key and migrate saved profiles from version 1.1.
  const legacy=!Object.hasOwn(s,'employees')&&!Object.hasOwn(s,'selectedEmployeeId');
  const employees=legacy?(s.profile.name.trim()?[{id:'legacy-employee',name:normalizeName(s.profile.name)}]:[]):validateEmployees(s.employees);
  const selectedEmployeeId=legacy?(employees[0]?.id||''):s.selectedEmployeeId;
  if(typeof selectedEmployeeId!=='string'||(selectedEmployeeId&&!employees.some(e=>e.id===selectedEmployeeId)))throw new Error('Выбранного сотрудника нет в справочнике');
  return {version:1,profile:{name:employees.find(e=>e.id===selectedEmployeeId)?.name||'',email:s.profile.email},employees,selectedEmployeeId,stations,subject:s.subject,body:s.body};
}
export function selectEmployee(settings:Settings,id:string):Settings {
  if(id&&!settings.employees.some(e=>e.id===id))throw new Error('Сотрудник отсутствует в справочнике');
  return {...settings,selectedEmployeeId:id,profile:{...settings.profile,name:settings.employees.find(e=>e.id===id)?.name||''}};
}
export function replaceEmployees(settings:Settings,raw:unknown):Settings {
  const employees=validateEmployees(raw);
  const current=employees.find(e=>e.id===settings.selectedEmployeeId)
    ||employees.find(e=>e.name.toLocaleLowerCase('ru')===normalizeName(settings.profile.name).toLocaleLowerCase('ru'));
  return selectEmployee({...settings,employees},current?.id||'');
}
export function filename(station:string,claim:string,date=new Date()):string {const safe=(s:string)=>s.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,65);const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);const stamp=local.replace(/[-:]/g,'').replace(' ','_')+'.'+String(date.getMilliseconds()).padStart(3,'0');return `Направление_${safe(station)}_${safe(claim)}_${stamp}_${newId().slice(0,4)}.pdf`;}
export function renderMailTemplate(template:string,data:ReferralData,service:Service,station:Station,profile:Profile):string {const vars:Record<string,string>={service:services[service].title,claim:data.claimNumber,car:data.carModel,registration:data.registration,station:station.name,employee:profile.name};return template.replace(/\{(service|claim|car|registration|station|employee)\}/g,(_,key:string)=>vars[key]);}
