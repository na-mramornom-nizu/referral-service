import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newId} from '../src/id';
import {filename} from '../src/domain';

test('IDs and PDF filenames work when HTTP disables crypto.randomUUID',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  const getRandomValues=crypto.getRandomValues.bind(crypto);
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues}});
  try{
    const ids=new Set(Array.from({length:100},()=>newId()));
    assert.equal(ids.size,100);
    for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(filename('СТО','TEST'),/^Направление_СТО_TEST_.*\.pdf$/);
  }finally{if(original)Object.defineProperty(globalThis,'crypto',original);}
});
