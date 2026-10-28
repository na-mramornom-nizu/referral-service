export class ApiError extends Error {
  constructor(message:string,public status:number,public code='API_ERROR',public action='',public endpoint='') {super(message);}
}
interface Options {
  endpoint:string;
  cloudKey?:string;
  fetcher?:typeof fetch;
  timeoutMs?:number;
  readToken:()=>string;
  storeToken:(token:string)=>void;
}
export function createApiClient({endpoint,cloudKey,fetcher=fetch,timeoutMs=15000,readToken,storeToken}:Options){
  return async function request(action:string,body?:unknown,csrf?:string){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const fail=(message:string,status:number,code:string)=>new ApiError(message,status,code,action,endpoint);
    try{
      const url=new URL(endpoint);
      if(!cloudKey)url.searchParams.set('action',action);
      const response=await fetcher(url,cloudKey?{
        method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json',apikey:cloudKey},
        body:JSON.stringify({action,payload:body||{},session_token:readToken()}),
      }:{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:body?{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})}:undefined,
        body:body?JSON.stringify(body):undefined});
      let data;
      try{data=await response.json();}catch(e){
        if(controller.signal.aborted)throw e;
        throw fail('Сервер справочников вернул непонятный ответ. Повторите загрузку списка.',response.status,'RESPONSE_FORMAT');
      }
      if(!data||typeof data!=='object')throw fail('Не удалось прочитать ответ сервера справочников.',response.status,'RESPONSE_FORMAT');
      const status=cloudKey&&typeof data.status==='number'?data.status:response.status;
      if(cloudKey&&(status===401||action==='logout'&&status===200))storeToken('');
      if(!response.ok||status>=400)throw fail(typeof data.error==='string'?data.error:'Сервер справочников временно недоступен. Повторите позже.',status,'HTTP_'+status);
      if(action==='employees'&&(!Array.isArray(data.employees)||data.employees.some((u:any)=>!u||typeof u.id!=='string'||typeof u.name!=='string')))
        throw fail('Сервер не вернул корректный список сотрудников. Повторите загрузку.',status,'DIRECTORY_FORMAT');
      if(action==='employees'&&data.employees.length===0)
        throw fail('Сервер вернул пустой справочник сотрудников. Сообщите администратору.',status,'DIRECTORY_EMPTY');
      if(cloudKey&&action==='login'&&typeof data.token==='string')storeToken(data.token);
      return data;
    }catch(e){
      if(e instanceof ApiError)throw e;
      if(controller.signal.aborted)throw fail(action==='employees'?'Сервер справочников не ответил вовремя. Список сотрудников не загружен. Нажмите «Обновить список» и повторите попытку.':'Сервер справочников не ответил вовремя. Результат операции не подтверждён. Обновите данные перед повторной попыткой.',0,'TIMEOUT');
      throw fail('Не удалось подключиться к серверу справочников. Сам сайт открылся, но для списка сотрудников и входа нужно соединение с сервером. Повторите загрузку списка; если ошибка сохраняется, передайте сведения ниже администратору.',0,'NETWORK');
    }finally{clearTimeout(timer);}
  };
}
