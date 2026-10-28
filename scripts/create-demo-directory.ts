import {writeFile} from 'node:fs/promises';
import {hash} from 'bcryptjs';
import {defaultSettings} from '../src/domain';
import {validateDirectory} from '../src/json-directory';
const demoHash=await hash('123',10);
const directory=validateDirectory({format:'sovcom-referrals-directory',version:1,revision:1,publicationId:'demo-v1',basePublicationId:'',updatedAt:'2026-10-28T00:00:00Z',users:[
 {id:'admin',name:'Администратор',role:'admin',hash:demoHash,authVersion:1},
 {id:'demo-user',name:'Сотрудник 001',role:'employee',hash:demoHash,authVersion:1},
],settings:{stations:defaultSettings.stations,subject:defaultSettings.subject,body:defaultSettings.body}});
await writeFile('directory.example.json',JSON.stringify(directory,null,2)+'\n',{flag:'wx'});
