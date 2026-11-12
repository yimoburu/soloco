// SYNTHETIC source archives. These tests observe source bytes; no fixture is a
// historical runtime association, native review or qualification issuer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {captureOriginalLegacyOccupancyPolicySourceFrom as capture,inspectOriginalLegacyOccupancyPolicySource as inspect,readOriginalLegacyOccupancyPolicySource as read,verifyLegacyOccupancyPolicySourceData as verify} from '../plugins/soloco/runtime/peers/legacy-occupancy-policy.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const required=['.claude-plugin/plugin.json','runtime/adapters.mjs','runtime/coordination.mjs','runtime/develop.mjs','runtime/engine.mjs','runtime/model-process-closure.mjs','runtime/record-storage.mjs','runtime/state-projections.mjs','runtime/store.mjs','runtime/team-source.mjs','runtime/worker.mjs'];
function fixture(t,change=x=>x){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SYNTHETIC-policy-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const body=change({protocol:'legacy-original-policy-source-archive-v1',runtime_version:'0.7.8',files:required.map(name=>{const content=name==='.claude-plugin/plugin.json'?JSON.stringify({name:'soloco',version:'0.7.8'}):'// SYNTHETIC original source candidate only: '+name+'\n';return {path:name,sha256:hash(content),content};})});
  const file=path.join(root,'source-archive.json'),raw=JSON.stringify(body,null,2)+'\n';fs.writeFileSync(file,raw);return {file,root,body,raw};
}
test('original file capture preserves complete raw archive and every supplied file without qualifying historical applicability',t=>{
  const f=fixture(t),before=fs.statSync(f.file,{bigint:true}),cap=capture(f.file),p=inspect(cap),after=fs.statSync(f.file,{bigint:true});
  assert.equal(p.archive_text,f.raw);assert.deepEqual(p.archive,f.body);assert.equal(p.archive_sha256,hash(f.raw));assert.equal(p.archive_utf8_bytes,Buffer.byteLength(f.raw));assert.equal(p.source_manifest.length,required.length);assert.equal(p.historical_applicability,'UNPROVED');assert.equal(p.original_policy_qualified,false);assert.equal(p.authority_issued,false);assert.equal(p.coverage,'complete-supplied-archive-only');
  for(const k of ['ino','size','mtimeNs','ctimeNs'])assert.equal(after[k],before[k]);assert.deepEqual(verify(p),p);
});
test('same version and witness-shaped original source DATA cannot issue an original-policy association',t=>{
  const f=fixture(t,b=>{const content=JSON.stringify({SYNTHETIC:true,protocol:'original-source-witness-looking-DATA',verdict:'Pass',original_policy_qualified:true});b.files.push({path:'witness-looking-DATA.json',sha256:hash(content),content});return b;});
  const p=inspect(capture(f.file));assert.equal(p.runtime_version,'0.7.8');assert.equal(p.historical_applicability,'UNPROVED');assert.equal(p.original_policy_qualified,false);assert.ok(p.archive.files.at(-1).content.includes('SYNTHETIC'));
});
test('inspected DATA and file-shaped clones never become original source capabilities',t=>{
  const f=fixture(t),cap=capture(f.file),p=inspect(cap);for(const fake of [{},p,JSON.parse(JSON.stringify(cap))])assert.throws(()=>inspect(fake),e=>e.code==='LEGACY_POLICY_ORIGINAL_SOURCE_REQUIRED');
  p.archive.files=[];assert.equal(inspect(cap).archive.files.length,required.length);assert.throws(()=>capture(f.file,{proved:true}),e=>e.code==='LEGACY_POLICY_SOURCE_INPUT');
});
test('cold DATA verification rejects a qualification flag, changed raw bytes or changed full manifest',t=>{
  const f=fixture(t),p=inspect(capture(f.file));for(const edit of [v=>v.original_policy_qualified=true,v=>v.archive_text+=' ',v=>v.source_manifest.pop(),v=>v.extra=true]){const v=structuredClone(p);edit(v);assert.throws(()=>verify(v));}
  const sentinel=Error('SYNTHETIC getter must not run');assert.throws(()=>verify({...p,get archive_text(){throw sentinel;}}),e=>e!==sentinel);
});
test('range reads bind full file hash and preserve exact Unicode continuation boundaries',t=>{
  const f=fixture(t,b=>{const e=b.files.find(f=>f.path==='runtime/engine.mjs');e.content='雪😀tail';e.sha256=hash(e.content);return b;}),cap=capture(f.file),e=f.body.files.find(f=>f.path==='runtime/engine.mjs');
  const a=read(cap,{path:e.path,sha256:e.sha256,offset:0,length:2});assert.equal(a.text,'雪');assert.equal(a.next_offset,1);const b=read(cap,{path:e.path,sha256:e.sha256,offset:1,length:2});assert.equal(b.text,'😀');assert.equal(b.next_offset,3);assert.equal(read(cap,{path:e.path,sha256:e.sha256,offset:3,length:4096}).text,'tail');
  for(const input of [{path:e.path,sha256:'0'.repeat(64),offset:0,length:1},{path:e.path,sha256:e.sha256,offset:2,length:1},{path:e.path,sha256:e.sha256,offset:1,length:1},{path:e.path,sha256:e.sha256,offset:0,length:4097}])assert.throws(()=>read(cap,input));
});
test('missing source leaves, version mismatch and qualification-looking envelope additions hold',t=>{
  for(const mutate of [b=>{b.files.pop();return b;},b=>{b.runtime_version='0.7.9';return b;},b=>({...b,historical_applicability:'PROVED'})]){const f=fixture(t,mutate);assert.throws(()=>capture(f.file));}
});
test('archive source path order, duplication and traversal are rejected',t=>{
  for(const mutate of [b=>{b.files.reverse();return b;},b=>{b.files.push(b.files.at(-1));return b;},b=>{b.files[0].path='../escape';return b;},b=>{b.files[0].path='runtime\\engine.mjs';return b;},b=>{b.files[0].path='/absolute';return b;}]){const f=fixture(t,mutate);assert.throws(()=>capture(f.file));}
});
test('source content hashes and raw UTF8 must match exact source bytes',t=>{
  const f=fixture(t,b=>{b.files[1].sha256='0'.repeat(64);return b;});assert.throws(()=>capture(f.file),e=>e.code==='LEGACY_POLICY_SOURCE_BYTES');
  const g=fixture(t);fs.writeFileSync(g.file,Buffer.from([0xff,0xfe]));assert.throws(()=>capture(g.file),e=>e.code==='LEGACY_POLICY_SOURCE_BYTES');
  const h=fixture(t,b=>{b.files[1].content='\ud800';b.files[1].sha256=hash(b.files[1].content);return b;});assert.throws(()=>capture(h.file),e=>e.code==='LEGACY_POLICY_SOURCE_BYTES');
});
test('symlink, hardlink, empty, oversized and non-file archive inputs hold',t=>{
  const f=fixture(t),link=path.join(f.root,'link');fs.symlinkSync(f.file,link);assert.throws(()=>capture(link));fs.unlinkSync(link);fs.linkSync(f.file,link);assert.throws(()=>capture(f.file));fs.unlinkSync(link);
  fs.writeFileSync(f.file,'');assert.throws(()=>capture(f.file));fs.truncateSync(f.file,16*1024*1024+1);assert.throws(()=>capture(f.file),e=>e.code==='LEGACY_POLICY_SOURCE_CAPACITY');assert.throws(()=>capture(f.root));assert.throws(()=>capture('relative.json'),e=>e.code==='LEGACY_POLICY_SOURCE_INPUT');
});
test('actual filesystem provider failures retain exact Error and AggregateError identity',t=>{
  const f=fixture(t),original=fs.readSync;try{for(const sentinel of [Error('SYNTHETIC original fs failure'),new AggregateError([Error('SYNTHETIC member')],'SYNTHETIC aggregate')]){fs.readSync=()=>{throw sentinel;};assert.throws(()=>capture(f.file),e=>e===sentinel);}}finally{fs.readSync=original;}
});
test('pathname replacement while the opened archive is read holds instead of accepting another named file',t=>{
  const f=fixture(t),original=fs.readSync;let replaced=false;
  try{fs.readSync=function(...args){const n=original.apply(this,args);if(!replaced){replaced=true;fs.renameSync(f.file,f.file+'.old');fs.writeFileSync(f.file,f.raw);}return n;};assert.throws(()=>capture(f.file),e=>e.code==='LEGACY_POLICY_SOURCE_CHANGED');}finally{fs.readSync=original;}
});
