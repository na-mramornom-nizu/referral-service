import {getDocument,OPS,type PDFPageProxy} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parseItems,type TextItem} from './pdf';
import {emptyData} from './domain';
import {SourceRecognitionError} from './source-layout';
export interface SourceOptions {password?:string;page?:number}
async function hasFormImage(page:PDFPageProxy){
 const operators=await page.getOperatorList(),stack:number[][]=[];let m=[1,0,0,1,0,0];
 const area=Math.abs((page.view[2]-page.view[0])*(page.view[3]-page.view[1]));
 for(let i=0;i<operators.fnArray.length;i++){
  const op=operators.fnArray[i],v=operators.argsArray[i];
  if(op===OPS.save)stack.push([...m]);
  else if(op===OPS.restore)m=stack.pop()||[1,0,0,1,0,0];
  else if(op===OPS.transform){const[a,b,c,d,e,f]=m,[g,h,j,k,l,n]=v;m=[a*g+c*h,b*g+d*h,a*j+c*k,b*j+d*k,a*l+c*n+e,b*l+d*n+f];}
  else if([OPS.paintImageXObject,OPS.paintInlineImageXObject].includes(op)&&Math.abs(m[0]*m[3]-m[1]*m[2])>area*.4)return true;
 }return false;
}
export async function readSource(bytes:Uint8Array,options:SourceOptions={}){
 if(bytes.length>20*1024*1024)throw new Error('PDF больше 20 МБ. Выберите нужную страницу и сохраните её отдельным PDF или заполните направление вручную.');
 // Readers permit a short preamble/BOM before the PDF header.
 if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('Файл не является PDF. Выберите PDF-направление или заполните его вручную.');
 const task=getDocument({data:bytes.slice(),password:options.password,useSystemFonts:true});
 try{
  const doc=await task.promise,pageCount=doc.numPages;
  if(options.page!==undefined&&(!Number.isInteger(options.page)||options.page<1||options.page>pageCount))throw new Error('Указана несуществующая страница PDF.');
  const manual=(message:string,pageNumber=options.page||1)=>({data:{...emptyData},warnings:[message],automatic:false,pageNumber,pageCount});
  const found=[];const unknown:{page:number;message:string}[]=[];
  const pages=options.page?[options.page]:Array.from({length:Math.min(pageCount,50)},(_,i)=>i+1);
  for(const n of pages){
   const page=await doc.getPage(n),v=page.getViewport({scale:1}),content=await page.getTextContent();
   const items=content.items.filter(i=>'str'in i) as TextItem[];
   if(!items.some(i=>i.str.trim())){unknown.push({page:n,message:'На странице нет читаемого текста: это может быть скан или текст в виде рисунка. Откройте исходник и заполните направление вручную.'});continue;}
   try{found.push({...parseItems(items,v.width,v.height),automatic:true,pageNumber:n,pageCount});}
   catch(e){if(!(e instanceof SourceRecognitionError))throw e;if(e.reason==='manual')unknown.push({page:n,message:e.message});else if(await hasFormImage(page))unknown.push({page:n,message:'Бланк содержит крупное изображение, а подписи полей не читаются как текст. Откройте исходник и заполните данные вручную.'});}
   finally{page.cleanup();}
  }
  if(found.length===1){const result=found[0];if(pageCount>1)result.warnings.push(`Данные прочитаны со страницы ${result.pageNumber} из ${pageCount}. Проверьте, что выбрано нужное направление.`);if(pageCount>50&&!options.page)result.warnings.push('Автоматически просмотрены первые 50 страниц. При необходимости выберите другую страницу.');return result;}
  if(found.length>1)return manual('В PDF несколько направлений. Выберите нужную страницу в списке; данные разных направлений не объединяются.',found[0].pageNumber);
  if(unknown.length)return manual(unknown[0].message,unknown[0].page);
  if(pageCount>1&&!options.page)return manual('Автоматически найти направление не удалось. Выберите его страницу или заполните данные по исходнику вручную.');
  throw new SourceRecognitionError('foreign','В документе не найдена структура направления Совкомбанк Страхование. Выберите направление или заполните данные вручную.');
 }catch(e){const error=e as Error;
  if(error.name==='PasswordException')throw new Error(options.password?'Неверный пароль PDF. Проверьте пароль и повторите попытку.':'PDF защищён паролем. Введите пароль для чтения на этом компьютере.');
  if(error.name==='InvalidPDFException')throw new Error('PDF повреждён или имеет неверную структуру. Выберите другой файл или заполните направление вручную.');
  throw e;
 }finally{await task.destroy();}
}
