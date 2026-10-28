import {copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
try{await copyFile('directory.example.json','directory.json',constants.COPYFILE_EXCL);console.log('Created local demo directory.json.');}
catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;console.log('Existing local directory.json preserved.');}
