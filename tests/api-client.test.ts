import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,createApiClient} from '../src/api-client';
const endpoint='https://example.test/rest/v1/rpc/referral_api';
const client=(fetcher:typeof fetch,extra:object={})=>createApiClient({endpoint,cloudKey:'public-key',fetcher,timeoutMs:25,readToken:()=>'',storeToken:()=>{},...extra});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
test('Недоступный сервер не превращается в пустой справочник',async()=>{
  await assert.rejects(client(async()=>{throw new TypeError('Failed to fetch');})('employees'),(e:ApiError)=>e.code==='NETWORK'&&e.action==='employees'&&e.endpoint===endpoint);
});
test('Зависший запрос отменяется и позволяет повторную загрузку',async()=>{
  let aborted=false;
  const request=client(async(_url,options)=>new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));})));
  await assert.rejects(request('employees'),(e:ApiError)=>e.code==='TIMEOUT');assert.equal(aborted,true);
});
test('Ограничение ожидания действует и на загрузку тела ответа',async()=>{
  const request=client(async(_url,options)=>({ok:true,status:200,json:()=>new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))}) as Response);
  await assert.rejects(request('employees'),(e:ApiError)=>e.code==='TIMEOUT');
});
test('HTML вместо API и повреждённый справочник дают разные ошибки',async()=>{
  await assert.rejects(client(async()=>new Response('<html>blocked</html>'))('employees'),(e:ApiError)=>e.code==='RESPONSE_FORMAT');
  await assert.rejects(client(async()=>json({status:200}))('employees'),(e:ApiError)=>e.code==='DIRECTORY_FORMAT');
  await assert.rejects(client(async()=>json({status:200,employees:[]}))('employees'),(e:ApiError)=>e.code==='DIRECTORY_EMPTY');
});
test('Повторная попытка после сетевой ошибки получает серверный список',async()=>{
  let attempts=0;const users=[{id:'admin',name:'Администратор',role:'admin'}];
  const request=client(async()=>{if(++attempts===1)throw new TypeError('offline');return json({status:200,employees:users});});
  await assert.rejects(request('employees'));assert.deepEqual((await request('employees')).employees,users);
});
test('Облачные вход и отказ с HTTP 200 корректно управляют токеном',async()=>{
  let token='old';let payload:any;
  const request=client(async(_url,options)=>{payload=JSON.parse(options!.body as string);return json(payload.action==='login'?{status:200,token:'new'}:{status:401,error:'Войдите в приложение'});},{readToken:()=>token,storeToken:(value:string)=>token=value});
  await request('login',{id:'admin',password:'123'});assert.equal(token,'new');
  await assert.rejects(request('state'),(e:ApiError)=>e.status===401);assert.equal(payload.session_token,'new');assert.equal(token,'');
});
test('PHP-режим сохраняет cookie и CSRF без облачного токена',async()=>{
  const request=client(async(url,options)=>{assert.equal(new URL(String(url)).searchParams.get('action'),'settings');assert.equal(options?.credentials,'same-origin');assert.equal((options?.headers as Record<string,string>)['X-CSRF-Token'],'csrf-value');assert.equal(JSON.parse(options?.body as string).revision,9);return json({revision:10});},{endpoint:'http://localhost/api.php',cloudKey:undefined});
  assert.equal((await request('settings',{revision:9},'csrf-value')).revision,10);
});
