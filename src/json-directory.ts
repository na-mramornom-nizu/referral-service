import {compare,hash as bcryptHash} from 'bcryptjs';
import {ApiError} from './api-client';
import {validateSettings,type Settings} from './domain';
import {validateEmployees} from './employees';
import {newId} from './id';

export interface DirectoryUser {id:string;name:string;role:'admin'|'employee';hash:string;authVersion:number}
export interface Directory {
  format:'sovcom-referrals-directory';version:1;revision:number;
  publicationId:string;basePublicationId:string;updatedAt:string;
  users:DirectoryUser[];settings:Pick<Settings,'stations'|'subject'|'body'>;
}
export interface DirectoryStatus {dirty:boolean;conflict:boolean;publishedRevision:number;publicationId:string}
const ADMIN='Администратор';
const fail=(message:string,status=400)=>new ApiError(message,status,'DIRECTORY');
const account=(u:DirectoryUser)=>({id:u.id,name:u.name,role:u.role});
const same=(a:Directory,b:Directory)=>JSON.stringify(a)===JSON.stringify(b);
function coreSettings(raw:Directory['settings']){
  const s=validateSettings({...raw,version:1,profile:{name:'',email:''},employees:[],selectedEmployeeId:''});
  return {stations:s.stations,subject:s.subject,body:s.body};
}
export function validateDirectory(raw:unknown):Directory {
  const d=raw as Directory;
  if(!d||d.format!=='sovcom-referrals-directory'||d.version!==1||!Number.isSafeInteger(d.revision)||d.revision<1||
    typeof d.publicationId!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(d.publicationId)||
    typeof d.basePublicationId!=='string'||!/^[-a-zA-Z0-9]{0,100}$/.test(d.basePublicationId)||
    typeof d.updatedAt!=='string'||!Number.isFinite(Date.parse(d.updatedAt)))throw fail('Файл не является справочником приложения. Нужен файл directory.json.');
  const entries=validateEmployees(d.users);
  const users=entries.map((u,i)=>{
    const original=d.users[i];
    if(original.role!==(u.id==='admin'?'admin':'employee')||
      (u.id==='admin'&&u.name!==ADMIN)||
      typeof original.hash!=='string'||!/^\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(original.hash)||
      !Number.isSafeInteger(original.authVersion)||original.authVersion<1||Object.hasOwn(original,'password'))
      throw fail('Некорректная роль или хеш пароля сотрудника. Пароли открытым текстом в JSON не допускаются.');
    return {...u,role:original.role,hash:original.hash,authVersion:original.authVersion};
  });
  if(!users.some(u=>u.id==='admin'))throw fail('В справочнике должен оставаться администратор.');
  return {format:d.format,version:1,revision:d.revision,publicationId:d.publicationId,basePublicationId:d.basePublicationId,updatedAt:d.updatedAt,users,settings:coreSettings(d.settings)};
}
export function parseDirectory(text:string):Directory {
  if(new TextEncoder().encode(text).length>1_000_000)throw fail('Справочник слишком большой: максимум 1 МБ.');
  let raw;try{raw=JSON.parse(text);}catch{throw fail('Не удалось прочитать JSON. Выберите исправный файл directory.json.');}
  try{return validateDirectory(raw);}catch(e){if(e instanceof ApiError)throw e;throw fail('Некорректный справочник: '+(e as Error).message);}
}

/** Static hosting: GET the shared file; local edits become an explicit export, never a server write. */
export function createJsonDirectory(options:{url:string;fetcher?:typeof fetch;timeoutMs?:number}){
  const {url,fetcher=fetch,timeoutMs=15000}=options;
  let published:Directory|undefined,draft:Directory|undefined,base:Directory|undefined;
  let session:{id:string;hash:string;authVersion:number}|undefined;
  let fetching:Promise<void>|undefined;
  const active=()=>draft||published!;
  const conflict=()=>!!(draft&&base&&published&&!same(base,published));
  function checkSession(){
    const user=published?.users.find(u=>u.id===session?.id);
    if(!session||!user||user.hash!==session.hash||user.authVersion!==session.authVersion){session=undefined;throw fail('Войдите в приложение. Если пароль изменён, используйте новый пароль.',401);}
    return user;
  }
  function checkAdmin(){if(checkSession().role!=='admin')throw fail('Редактирование доступно только администратору.',403);}
  async function pull(){
    if(fetching)return fetching;
    fetching=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const address=new URL(url);address.searchParams.set('v',String(Date.now()));
        const response=await fetcher(address,{method:'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal});
        if(!response.ok)throw new ApiError('Не удалось загрузить directory.json с этого сайта (HTTP '+response.status+'). Нажмите «Обновить список» или сообщите администратору.',response.status,'HTTP_'+response.status,'directory',url);
        const next=parseDirectory(await response.text());
        published=next;
        if(draft&&same(next,draft)){draft=undefined;base=undefined;}
      }catch(e){
        if(e instanceof ApiError)throw e;
        if(controller.signal.aborted)throw new ApiError('Сайт не ответил вовремя при загрузке справочника. Повторите попытку.',0,'TIMEOUT','directory',url);
        throw new ApiError('Не удалось загрузить справочник с этого сайта. Проверьте соединение и нажмите «Обновить список».',0,'NETWORK','directory',url);
      }finally{clearTimeout(timer);}
    })();
    try{await fetching;}finally{fetching=undefined;}
  }
  function state(){
    const logged=checkSession();
    // Drafts belong to the administrator's current window only.
    const d=logged.role==='admin'?active():published!;
    const user=d.users.find(u=>u.id===logged.id)!;
    return {revision:d.revision,user:account(user),csrf:'',settings:validateSettings({version:1,profile:{name:user.name,email:''},selectedEmployeeId:user.id,employees:d.users.map(account),...d.settings}),directory:{dirty:!!draft,conflict:conflict(),publishedRevision:published!.revision,publicationId:d.publicationId} satisfies DirectoryStatus};
  }
  function save(next:Directory){
    if(!base)base=structuredClone(published!);
    draft=validateDirectory({...next,revision:active().revision+1,publicationId:newId(),basePublicationId:base.publicationId,updatedAt:new Date().toISOString()});
    return state();
  }
  async function request(action:string,body:any={},_csrf?:string):Promise<any>{
    if(action==='employees'){await pull();return {employees:published!.users.map(account)};}
    if(action==='login'){
      await pull();
      const user=published!.users.find(u=>u.id===body.id);
      if(!user||typeof body.password!=='string'||!await compare(body.password,user.hash))throw fail('Неверный сотрудник или пароль.',401);
      session={id:user.id,hash:user.hash,authVersion:user.authVersion};draft=undefined;base=undefined;return state();
    }
    if(action==='logout'){session=undefined;draft=undefined;base=undefined;return {};}
    if(action==='state'){await pull();return state();}
    checkAdmin();
    if(action==='discard'){await pull();draft=undefined;base=undefined;return state();}
    if(action==='export'){
      await pull();checkAdmin();
      if(conflict())throw fail('На сайте уже опубликована другая версия. Сохраните резервную копию черновика, отмените его и повторите изменения на свежих данных.',409);
      return {text:JSON.stringify(active(),null,2)+'\n'};
    }
    if(action==='backup')return {text:JSON.stringify(active(),null,2)+'\n'};
    await pull();checkAdmin();
    if(conflict())throw fail('Справочник на сайте изменился. Ваш черновик сохранён в этом окне. Сохраните его резервную копию и обновите данные перед публикацией.',409);
    if(body.revision!==active().revision)throw fail('Данные обновились. Проверьте изменения и повторите сохранение.',409);
    if(action==='import'){
      const incoming=parseDirectory(body.text);
      if(same(incoming,published!)){draft=undefined;base=undefined;return state();}
      if(incoming.basePublicationId!==published!.publicationId||incoming.revision<=published!.revision)throw fail('Этот черновик создан из другой версии справочника. Обновите данные и перенесите нужные изменения через формы.',409);
      base=structuredClone(published!);draft=incoming;return state();
    }
    const d=structuredClone(active());
    if(action==='settings'){d.settings=coreSettings(body.settings);return save(d);}
    if(action==='users'){
      const entries=validateEmployees(body.employees);
      if(!entries.some(u=>u.id==='admin'&&u.name===ADMIN))throw fail('Нельзя удалить или переименовать администратора.');
      const users:DirectoryUser[]=[];
      for(const [i,u] of entries.entries()){
        const incoming=body.employees[i],old=d.users.find(o=>o.id===u.id);
        if(incoming.role!==(u.id==='admin'?'admin':'employee'))throw fail('Недопустимая роль сотрудника.');
        const password=incoming.password??'';
        if(typeof password!=='string'||new TextEncoder().encode(password).length>72)throw fail('Пароль: не более 72 байт UTF-8 (до 72 латинских или 36 русских букв).');
        users.push({...u,role:u.id==='admin'?'admin':'employee',hash:password||!old?await bcryptHash(password||'123',10):old.hash,authVersion:old?old.authVersion+(password?1:0):1});
      }
      d.users=users;return save(d);
    }
    throw fail('Неизвестное действие.');
  }
  // Serialize local saves and refreshes so a slow password hash cannot overwrite a newer edit.
  let queue:Promise<unknown>=Promise.resolve();
  return (action:string,body?:unknown,csrf?:string)=>{
    const pending=queue.then(()=>request(action,body,csrf));queue=pending.catch(()=>{});return pending;
  };
}
