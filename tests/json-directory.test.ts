import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash,compare} from 'bcryptjs';
import {createJsonDirectory,parseDirectory,validateDirectory,type Directory} from '../src/json-directory';
import {defaultSettings} from '../src/domain';

const passwordHash=(await hash('123',4)).replace('$2b$','$2y$');
const fixture=():Directory=>validateDirectory({format:'sovcom-referrals-directory',version:1,revision:9,publicationId:'base-id',basePublicationId:'',updatedAt:'2026-10-26T12:00:00Z',settings:defaultSettings,users:[{id:'admin',name:'Администратор',role:'admin',hash:passwordHash,authVersion:1},{id:'worker',name:'Тестовый Сотрудник',role:'employee',hash:passwordHash,authVersion:1}]});
function setup(){
  let remote=fixture();const requests:{url:string;init?:RequestInit}[]=[];
  const fetcher=(async(url:any,init?:RequestInit)=>{requests.push({url:String(url),init});return new Response(JSON.stringify(remote));}) as typeof fetch;
  return {client:()=>createJsonDirectory({url:'https://example.test/app/directory.json',fetcher}),requests,get:()=>remote,publish:(next:Directory)=>{remote=structuredClone(next);}};
}
const login=(client:ReturnType<typeof createJsonDirectory>,id='admin',password='123')=>client('login',{id,password});
const edits=(d:Directory)=>d.users.map(({hash,authVersion,...u})=>({...u,password:''}));

test('PHP bcrypt $2y$: correct password accepted, wrong password rejected',async()=>{
  const s=setup(),c=s.client();assert.equal((await c('employees')).employees.length,2);
  await assert.rejects(login(c,'admin','wrong'),/Неверный/);
  const state=await login(c);assert.equal(state.user.role,'admin');assert.equal(state.settings.profile.name,'Администратор');
  assert.equal(JSON.stringify(state).includes(passwordHash),false);
});
test('all network requests are GET to the same-origin directory; no password sent',async()=>{
  const s=setup(),c=s.client();await login(c);await c('state');
  for(const r of s.requests){assert.equal(new URL(r.url).origin,'https://example.test');assert.equal(new URL(r.url).pathname,'/app/directory.json');assert.equal(r.init?.method,'GET');assert.equal(r.init?.body,undefined);assert.equal(r.init?.cache,'no-store');}
});
test('employee cannot edit, export, import or discard administrative data',async()=>{
  const s=setup(),c=s.client();await login(c,'worker');
  for(const action of ['settings','users','export','backup','import','discard'])await assert.rejects(c(action,{}),/администратору/);
});
test('draft export does not publish; after publishing another client sees the shared changes',async()=>{
  const s=setup(),admin=s.client(),employee=s.client();await login(admin);await login(employee,'worker');
  const settings={...s.get().settings,subject:'Новая общая тема'};
  const draft=await admin('settings',{settings,revision:9});assert.equal(draft.directory.dirty,true);assert.equal(draft.revision,10);
  const exported=parseDirectory((await admin('export')).text);assert.equal(exported.settings.subject,settings.subject);
  assert.equal((await employee('state')).settings.subject,defaultSettings.subject);
  assert.equal((await admin('state')).directory.dirty,true);
  s.publish(exported);
  assert.equal((await admin('state')).directory.dirty,false);assert.equal((await employee('state')).settings.subject,settings.subject);
});
test('new employee defaults to 123; blank preserves old hash; changed password is actually checked',async()=>{
  const s=setup(),c=s.client();await login(c);
  const users=[...edits(s.get()),{id:'new',name:'Новый Сотрудник',role:'employee',password:''}];users[1].password='new-test-password';
  await c('users',{employees:users,revision:9});const d=parseDirectory((await c('export')).text);
  assert.equal(d.users[0].hash,passwordHash);assert.equal(d.users[1].authVersion,2);assert(await compare('new-test-password',d.users[1].hash));assert(await compare('123',d.users[2].hash));
  const text=JSON.stringify(d);assert.equal(text.includes('new-test-password'),false);assert.equal(text.includes('"password"'),false);
  s.publish(d);const worker=s.client();await assert.rejects(login(worker,'worker','123'),/Неверный/);await login(worker,'worker','new-test-password');await login(s.client(),'new');
});
test('administrator cannot be deleted/renamed; duplicate names and role escalation rejected',async()=>{
  const s=setup(),c=s.client();await login(c);const users=edits(s.get());
  await assert.rejects(c('users',{employees:users.slice(1),revision:9}),/администратора/);
  await assert.rejects(c('users',{employees:users.map(u=>({...u,name:'Одинаковый'})),revision:9}),/уже есть/);
  await assert.rejects(c('users',{employees:users.map(u=>({...u,role:'admin'})),revision:9}),/роль/);
  await assert.rejects(c('users',{employees:users.map(u=>({...u,password:'я'.repeat(37)})),revision:9}),/72 байт/);
});
test('draft can be imported in a new session; mismatched base cannot overwrite fresh shared data',async()=>{
  const s=setup(),a=s.client();await login(a);await a('settings',{settings:{...s.get().settings,subject:'Черновик'},revision:9});
  const text=(await a('export')).text;await a('logout');const b=s.client();await login(b);const restored=await b('import',{text,revision:9});assert.equal(restored.settings.subject,'Черновик');assert.equal(restored.directory.dirty,true);
  s.publish({...s.get(),publicationId:'new-published',revision:10});const c=s.client();await login(c);await assert.rejects(c('import',{text,revision:10}),/другой версии/);
});
test('concurrent publication preserves draft, blocks export, permits backup and discard',async()=>{
  const s=setup(),a=s.client();await login(a);await a('settings',{settings:{...s.get().settings,subject:'Local draft'},revision:9});
  s.publish({...s.get(),publicationId:'changed',revision:10,settings:{...s.get().settings,subject:'Someone else'}});
  const conflicted=await a('state');assert.equal(conflicted.directory.conflict,true);assert.equal(conflicted.settings.subject,'Local draft');
  await assert.rejects(a('export'),/другая версия/);assert.equal(parseDirectory((await a('backup')).text).settings.subject,'Local draft');
  const fresh=await a('discard');assert.equal(fresh.settings.subject,'Someone else');assert.equal(fresh.directory.dirty,false);
});
test('published password changes and removed employees invalidate an existing session',async()=>{
  const s=setup(),a=s.client();await login(a,'worker');
  s.publish({...s.get(),users:s.get().users.map(u=>({...u,authVersion:2}))});await assert.rejects(a('state'),/Войдите/);
  await login(a,'worker');s.publish({...s.get(),users:s.get().users.filter(u=>u.id!=='worker')});await assert.rejects(a('state'),/Войдите/);
});
test('schema strips runtime metadata, rejects plaintext passwords, corrupt JSON and oversized input',()=>{
  const d=fixture();assert.equal('attempts' in validateDirectory({...d,attempts:['secret'],sessions:[]}),false);
  assert.throws(()=>parseDirectory('{broken'),/прочитать JSON/);
  assert.throws(()=>parseDirectory(' '.repeat(1_000_001)),/большой/);
  assert.throws(()=>validateDirectory({...d,users:d.users.map(u=>({...u,password:'123'}))}),/открытым текстом/);
  assert.throws(()=>parseDirectory(JSON.stringify({...d,users:[]})),/администратор/);
});
test('missing and invalid remote files show errors without fallback employees',async()=>{
  for(const response of [new Response('not found',{status:404}),new Response('<html>error</html>')]){
    const c=createJsonDirectory({url:'https://example.test/directory.json',fetcher:(async()=>response) as typeof fetch});
    await assert.rejects(c('employees'),/directory.json|прочитать JSON/);
  }
});
test('network reset and timeout release the client for a successful retry',async()=>{
  let mode='reset';const fetcher=(async(_url:any,init:any)=>{if(mode==='reset')throw new TypeError('fetch failed');if(mode==='timeout')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('abort'))));return new Response(JSON.stringify(fixture()));}) as typeof fetch;
  const c=createJsonDirectory({url:'https://example.test/directory.json',fetcher,timeoutMs:15});
  await assert.rejects(c('employees'),/загрузить справочник/);mode='timeout';await assert.rejects(c('employees'),/вовремя/);mode='ok';assert.equal((await c('employees')).employees.length,2);
});
