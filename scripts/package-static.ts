import {readFile,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {validateDirectory} from '../src/json-directory';
const source=existsSync('directory.json')?'directory.json':'directory.example.json';
validateDirectory(JSON.parse(await readFile(source,'utf8')));
await copyFile(source,'dist/directory.json');
await copyFile('public/assets/LICENSE_LIBERATION.txt','dist/LICENSE_LIBERATION.txt');
console.log('Static build ready in dist/. Directory source: '+source);
