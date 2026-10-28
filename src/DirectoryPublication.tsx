import {useRef,useState} from 'react';
import {useCentral} from './central';

export function DirectoryPublication(){
  const {state,exportDirectory,importDirectory,discardDraft,refresh}=useCentral();
  const input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const status=state.directory;
  if(!status||state.user.role!=='admin')return null;
  async function act(fn:()=>Promise<void>,message=''){setBusy(true);setError('');setNotice('');try{await fn();setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel directory-publication">
    <div className="eyebrow">ПУБЛИКАЦИЯ ОБЩИХ ДАННЫХ</div><h2>{status.dirty?'Есть неопубликованные изменения':'Справочник загружен с сайта'}</h2>
    <p>На сайте: версия {status.publishedRevision}{status.dirty?` · Черновик: версия ${state.revision}`:''}.</p>
    <p>Сотрудники, пароли, СТО и шаблон письма объединены в <strong>directory.json</strong>. Формы сохраняют изменения в черновик этого окна. Чтобы их увидели коллеги, замените файл на SourceCraft.</p>
    {status.conflict&&<p className="banner danger" role="alert">На сайте появилась другая версия. Скачайте резервную копию черновика, отмените черновик и повторите нужные правки на свежих данных. Публикация устаревшего файла перезапишет чужие изменения.</p>}
    <ol><li>Сохраните правки в формах сотрудников или СТО.</li><li>Нажмите «Скачать JSON для публикации».</li><li>В <a href="https://sourcecraft.dev/admind9-gmail-com/referral-service" target="_blank" rel="noreferrer">репозитории SourceCraft</a> откройте <strong>directory.json → Редактировать</strong>. Замените всё содержимое текстом скачанного JSON и сохраните изменения в ветке <strong>main</strong>. Имя файла — строго <strong>directory.json</strong>, без «(1)».</li><li>После обновления сайта нажмите «Проверить публикацию». Статус сменится только после загрузки с сайта файла, совпадающего с черновиком.</li></ol>
    <div className="button-row"><button className="primary" disabled={busy||status.conflict} onClick={()=>void act(()=>exportDirectory(),'JSON скачан. Теперь замените файл на SourceCraft. Скачивание само по себе не публикует данные.')}>Скачать JSON для публикации</button><button className="secondary" disabled={busy} onClick={()=>void act(refresh,'Проверка завершена. Текущий статус указан выше.')}>Проверить публикацию</button></div>
    <div className="button-row"><button className="secondary" disabled={busy} onClick={()=>input.current?.click()}>Загрузить JSON-черновик</button>{status.dirty&&<><button className="secondary" disabled={busy} onClick={()=>void act(()=>exportDirectory(true),'Резервная копия скачана.')}>Скачать резервную копию</button><button className="secondary danger-text" disabled={busy} onClick={()=>{if(confirm('Отменить черновик в этом окне и загрузить опубликованный справочник? Сначала скачайте резервную копию, если хотите сохранить правки.'))void act(discardDraft,'Черновик отменён. Загружены опубликованные данные.');}}>Отменить черновик</button></>}</div>
    <input ref={input} type="file" accept="application/json,.json" hidden aria-label="JSON-черновик справочника" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void act(async()=>{if(file.size>1_000_000)throw new Error('Размер JSON — не более 1 МБ.');await importDirectory(await file.text());},'Черновик загружен. Для общего доступа опубликуйте его на SourceCraft.');}}/>
    <p className="small muted">Перед закрытием окна скачайте черновик, иначе правки будут потеряны. Пароли в JSON хранятся в виде хешей; вход и роли проверяются локально и не обеспечивают защиту данных от посетителя сайта.</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
