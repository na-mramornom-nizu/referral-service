import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const issues=[];
for(const file of files){
 if(/(^|\/)(private-local|dist|output|node_modules|server|release|\.playwright-cli)(\/|$)|\.(pdf|eml|zip)$/i.test(file)||file==='directory.json')issues.push(file+': excluded data');
 if(file==='scripts/check-publication.mjs'||! /\.(ts|tsx|js|mjs|json|py|md|txt|html|css)$/.test(file))continue;
 const text=readFileSync(file,'utf8');
 if(/(?:[А-ЯЁ][а-яё]{2,}(?:ович|евич|овна|евна|ична))(?![а-яё])/u.test(text))issues.push(file+': possible personal name');
 if(/(?:C|D):[\\/](?:Users|remont_project)|@gmail\.com|sb_publishable_|supabase\.co|beget\.tech/i.test(text))issues.push(file+': local/deployment identifier');
}
if(issues.length)throw Error(issues.join('\n'));
console.log(`Checked ${files.length} tracked files: no excluded data or personal-name patterns.`);
