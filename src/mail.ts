import {newId} from './id';
import { emailValid } from './domain';
export function base64(bytes:Uint8Array):string {let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export function fromDataUrl(url:string):Uint8Array {const data=atob(url.split(',')[1]);return Uint8Array.from(data,c=>c.charCodeAt(0));}
const wrap=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
function encodedWords(value:string):string {const chunks:string[]=[];let chunk='';for(const c of value.replace(/[\r\n]/g,' ')){if(new TextEncoder().encode(chunk+c).length>36){chunks.push(chunk);chunk='';}chunk+=c;}if(chunk)chunks.push(chunk);return chunks.map(c=>'=?UTF-8?B?'+base64(new TextEncoder().encode(c))+'?=').join('\r\n ');}
export function buildEml(to:string,subject:string,body:string,pdf:Uint8Array,name:string,from=''):string {
  if(!emailValid(to)||from&&!emailValid(from))throw new Error('Укажите корректный email получателя и отправителя');
  if(/[\r\n]/.test(subject))throw new Error('Тема письма должна быть одной строкой');
  const boundary='referral-'+newId();
  const safeName=name.replace(/[\r\n"\\]/g,'_');
  const encoded=encodeURIComponent(safeName);const segments=encoded.match(/(?:%[0-9A-F]{2}|[^%]){1,45}/g)||[];
  const disp=segments.map((part,i)=>` filename*${i}*=${i===0?"utf-8''":''}${part}`).join(';\r\n');
  return ['X-Unsent: 1','MIME-Version: 1.0',`To: ${to}`,from?`From: ${from}`:'',`Subject: ${encodedWords(subject)}`,`Date: ${new Date().toUTCString()}`,`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset="utf-8"','Content-Transfer-Encoding: base64','',wrap(base64(new TextEncoder().encode(body))),`--${boundary}`,'Content-Type: application/pdf','Content-Transfer-Encoding: base64',`Content-Disposition: attachment;\r\n${disp}`,'',wrap(base64(pdf)),`--${boundary}--`,''].filter((v,i)=>v!==''||i>5).join('\r\n');
}
export function mailto(to:string,subject:string,body:string):string {if(!emailValid(to))throw new Error('Укажите email СТО');return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject.replace(/[\r\n]/g,' '))}&body=${encodeURIComponent(body)}`;}
