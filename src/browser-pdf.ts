// Both bundles must include the same compatibility shims, including Uint8Array.toHex.
// Workers have a separate global scope: patching only the page does not fix PDF loading.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw';
import template from '../public/assets/template.png?inline';
import regular from '../public/assets/regular.ttf?inline';
import bold from '../public/assets/bold.ttf?inline';
import {fromDataUrl} from './mail';
import {type PdfAssets} from './pdf';
import {readSource,type SourceOptions} from './read-source';
// Let PDF.js fall back to its in-page worker when the hosting CSP blocks workers.
// The same embedded module works without any external network request.
pdfjs.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
export const assets:PdfAssets={template:fromDataUrl(template),regular:fromDataUrl(regular),bold:fromDataUrl(bold)};
export async function extract(file:File,options:SourceOptions={}){return readSource(new Uint8Array(await file.arrayBuffer()),options);}
export async function renderPage(bytes:Uint8Array,canvas:HTMLCanvasElement,width=900,pageNumber=1,password=''){const task=pdfjs.getDocument({data:bytes.slice(),password,useSystemFonts:true});try{const doc=await task.promise;const page=await doc.getPage(pageNumber);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:width/base.width});canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvas,viewport}).promise;}finally{await task.destroy();}}
