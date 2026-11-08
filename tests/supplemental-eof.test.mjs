import test from 'node:test';
import assert from 'node:assert/strict';
import {contextRead,recordReference} from '../plugins/soloco/runtime/current-state.mjs';
test('default worker read of a short exact source reaches EOF with actual receipt length',()=>{
 const record={id:'source',revision:1,kind:'artifact',content:'A short complete obligation'};
 const ref=recordReference(record),raw=JSON.stringify(record),s={records:{source:record}};
 const page=contextRead(s,ref);assert.equal(page.text,raw);assert.equal(page.length,raw.length);assert.equal(page.next_offset,null);assert.equal(page.complete,true);assert.equal(page.sha256,ref.sha256);
 const last=contextRead(s,{...ref,offset:raw.length-3,length:32768});assert.equal(last.text,raw.slice(-3));assert.equal(last.length,3);assert.equal(last.complete,true);
});
test('bounded pages reconstruct exact long source and retain hash/offset validation',()=>{
 const record={id:'source',revision:1,kind:'artifact',content:'fictional evidence '.repeat(3000)},raw=JSON.stringify(record),ref=recordReference(record),s={records:{source:record}};
 let offset=0,rebuilt='';do{const page=contextRead(s,{...ref,offset,length:16000});assert.equal(page.text.length,page.length);rebuilt+=page.text;offset=page.next_offset;}while(offset!==null);assert.equal(rebuilt,raw);
 for(const change of [{offset:-1},{offset:raw.length},{offset:raw.length+1},{offset:1.1},{length:0},{length:32769},{length:1.1},{sha256:'wrong'}])assert.throws(()=>contextRead(s,{...ref,...change}));
});
test('UTF16 reads preserve complete surrogate pairs, exact next offsets and empty content',()=>{
 const record={id:'source',revision:1,kind:'artifact',content:'prefix🧪suffix'},raw=JSON.stringify(record),ref=recordReference(record),s={records:{source:record}},at=raw.indexOf('🧪');
 const before=contextRead(s,{...ref,length:at+1});assert.equal(before.length,at);assert.equal(before.next_offset,at);assert.equal(before.complete,false);
 const pair=contextRead(s,{...ref,offset:at,length:2});assert.equal(pair.text,'🧪');assert.equal(pair.next_offset,at+2);assert.equal(pair.length,2);
 assert.throws(()=>contextRead(s,{...ref,offset:at+1,length:10}),/range/);assert.throws(()=>contextRead(s,{...ref,offset:at,length:1}),/complete character/);
 const last=contextRead(s,{...ref,offset:pair.next_offset});assert.equal([before,pair,last].map(page=>JSON.parse(JSON.stringify(page)).text).join(''),raw);assert.equal(last.complete,true);
 const empty={...record,content:''};assert.equal(contextRead({records:{source:empty}},recordReference(empty)).text,JSON.stringify(empty));
 record.content+=' A new unresolved restriction';assert.throws(()=>contextRead(s,ref),/changed/);
});
