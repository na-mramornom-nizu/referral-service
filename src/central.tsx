import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import logo from '../public/assets/logo.png?inline';
import {type Settings,validateSettings} from './domain';
import {ApiError,createApiClient} from './api-client';
import {version} from '../package.json';
import {createJsonDirectory,type DirectoryStatus} from './json-directory';

export interface Account {id:string;name:string;role:'admin'|'employee'}
export interface AccountEdit extends Account {password?:string}
interface State {revision:number;user:Account;csrf:string;settings:Settings;directory?:DirectoryStatus}
let memoryToken='';
function storeToken(token:string){memoryToken=token;try{if(token)sessionStorage.setItem('referral-session',token);else sessionStorage.removeItem('referral-session');}catch{/* Session stays in memory when storage is disabled. */}}
export const jsonMode=import.meta.env.VITE_DIRECTORY_MODE==='json';
const request=jsonMode?createJsonDirectory({url:new URL('directory.json',location.href).href}):createApiClient({
  endpoint:new URL('api.php',location.href).href,
  readToken:()=>{try{return sessionStorage.getItem('referral-session')||memoryToken;}catch{return memoryToken;}},
  storeToken,
});
interface Central {state:State;refresh:()=>Promise<void>;saveSettings:(s:Settings)=>Promise<void>;saveUsers:(users:AccountEdit[])=>Promise<void>;logout:()=>Promise<void>;exportDirectory:(backup?:boolean)=>Promise<void>;importDirectory:(text:string)=>Promise<void>;discardDraft:()=>Promise<void>}
const Context=createContext<Central|null>(null);
export const useCentral=()=>useContext(Context)!;
export function CentralAccess({children}:{children:ReactNode}){
  const [state,setState]=useState<State|null>(null);const [employees,setEmployees]=useState<Account[]>([]);const [id,setId]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(true);const [error,setError]=useState('');
  const [diagnostic,setDiagnostic]=useState('');const [copied,setCopied]=useState(false);
  function loginError(e:unknown){
    setError((e as Error).message);setCopied(false);
    setDiagnostic(e instanceof ApiError&&e.status!==401?[
      'Сервис выдачи направлений · '+version,
      'Сайт: '+location.origin+location.pathname,
      'Сервер справочников: '+new URL(e.endpoint||location.href).host,
      'Ошибка: '+e.code+'; действие: '+e.action,
      'Время: '+new Date().toISOString(),
    ].join('\n'):'');
  }
  function accept(next:State){next.settings=validateSettings(next.settings);setState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);}
  async function list(){const data=await request('employees');setEmployees(data.employees);}
  async function boot(){setBusy(true);setError('');setDiagnostic('');try{await list();try{accept(await request('state'));}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;}}catch(e){loginError(e);}finally{setBusy(false);}}
  useEffect(()=>{void boot();},[]);
  async function refresh(){try{accept(await request('state'));setError('');}catch(e){if(e instanceof ApiError&&e.status===401){setState(null);setPassword('');await list();}throw e;}}
  useEffect(()=>{if(!state)return;const update=()=>{if(!document.hidden)void refresh().catch(e=>setError(e.message));};const timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[state?.user.id]);
  useEffect(()=>{if(!state?.directory?.dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[state?.directory?.dirty]);
  async function mutate(action:string,body:object){if(!state)throw new Error('Войдите в приложение');try{accept(await request(action,{...body,revision:state.revision},state.csrf));setError('');}catch(e){if(e instanceof ApiError&&(e.status===409||e.status===401))await refresh().catch(()=>{});throw e;}}
  if(state)return <Context.Provider value={{state,refresh,saveSettings:s=>mutate('settings',{settings:s}),saveUsers:employees=>mutate('users',{employees}),
    importDirectory:text=>mutate('import',{text}),discardDraft:()=>mutate('discard',{}),
    exportDirectory:async(backup=false)=>{try{const data=await request(backup?'backup':'export');const url=URL.createObjectURL(new Blob([data.text],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=backup?'directory-backup.json':'directory.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);await refresh();}catch(e){await refresh().catch(()=>{});throw e;}},
    logout:async()=>{if(state.directory?.dirty&&!confirm('Черновик не опубликован. Перед выходом скачайте JSON, чтобы продолжить позже. Выйти и удалить черновик из этого окна?'))return;await request('logout',{},state.csrf);setState(null);setPassword('');await list();}}}>{error&&<div className="banner warning" role="alert">{error}<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Повторить</button></div>}{children}</Context.Provider>;
  return <main className="login-page"><section className="panel login-card">
    <img className="brand-logo" src={logo} alt="Совкомбанк Страхование"/>
    <h1>Сервис выдачи направлений</h1><p className="muted">Выберите сотрудника и введите пароль.</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setDiagnostic('');try{accept(await request('login',{id,password}));setPassword('');}catch(e){loginError(e);}finally{setBusy(false);}}}>
      <label>Сотрудник<select value={id} onChange={e=>setId(e.target.value)} required disabled={busy||employees.length===0}>
        <option value="">{employees.length?'Выберите сотрудника':busy?'Загрузка сотрудников…':'Список сотрудников не загружен'}</option>
        {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
      </select></label>
      <label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="button-row"><button className="primary" disabled={busy||!id||!password}>{busy?'Загрузка…':'Войти'}</button><button className="secondary" type="button" onClick={()=>void boot()} disabled={busy}>Обновить список</button></div>
      {diagnostic&&<div className="login-diagnostic"><p>Сведения для администратора</p><pre>{diagnostic}</pre><button className="secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(diagnostic);setCopied(true);}catch{setCopied(false);}}}>{copied?'Сведения скопированы':'Скопировать сведения об ошибке'}</button></div>}
    </form>{jsonMode&&<p className="muted small">Справочник загружается с этого сайта. Пароль проверяется в браузере; роли ограничивают только интерфейс.</p>}<p className="login-version muted small">Версия {version}{employees.length>0?' · Сотрудников в справочнике: '+employees.length:''}</p>
  </section></main>;
}
