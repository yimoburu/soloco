import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDeterministicAuditCache,captureDeterministicPackageIdentity} from '../plugins/soloco/runtime/deterministic-audit-cache.mjs';

const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const copy=v=>JSON.parse(JSON.stringify(v));
function setup(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-cache-package-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'runtime'));fs.writeFileSync(path.join(root,'runtime','renderer.mjs'),'export const policy=1;\n');fs.writeFileSync(path.join(root,'policy.json'),'{"whole":true}\n');return {root,dependency_identity:captureDeterministicPackageIdentity(root)};}
const geometry=()=>({protocol:'retention-review-geometry-v1',sources:[],frames:{initial:{sha256:hash('whole')}},coverage:{planned_complete:true,delivery_observed:false},traffic:{bytes:17},hold_reasons:[]});
const key=dependency_identity=>({kind:'retention-review-geometry-v1',input_sha256:hash('complete exact frozen input'),dependency_identity,options:{protocol:'fixture-policy-v1',range:32768}});

test('identical full structural identity hits and current guards run on EVERY lookup',t=>{
  const {dependency_identity}=setup(t),cache=createDeterministicAuditCache();let computed=0,validated=0;const options={validateCurrent:()=>{validated++;},compute:()=>{computed++;return geometry();}};
  const first=cache.getOrCompute(key(dependency_identity),options),second=cache.getOrCompute(key(dependency_identity),options);assert.equal(first.cache.hit,false);assert.equal(second.cache.hit,true);assert.equal(computed,1);assert.equal(validated,4);assert.deepEqual(first.value,second.value);
});
test('changed input, options, source, asset, Node or package-root identity always misses',t=>{
  const {root,dependency_identity}=setup(t),cache=createDeterministicAuditCache();const options={validateCurrent(){},compute:geometry},original=key(dependency_identity);cache.getOrCompute(original,options);
  const changedInput={...original,input_sha256:hash('changed exact bytes')};assert.equal(cache.getOrCompute(changedInput,options).cache.hit,false);
  assert.equal(cache.getOrCompute({...original,options:{...original.options,range:32767}},options).cache.hit,false);
  fs.appendFileSync(path.join(root,'runtime','renderer.mjs'),'// renderer changed\n');assert.equal(cache.getOrCompute(key(captureDeterministicPackageIdentity(root)),options).cache.hit,false);
  fs.appendFileSync(path.join(root,'policy.json'),' ');assert.equal(cache.getOrCompute(key(captureDeterministicPackageIdentity(root)),options).cache.hit,false);
  const changedNode=copy(dependency_identity);changedNode.node.version+='-different';delete changedNode.sha256;changedNode.sha256=hash(changedNode);assert.equal(cache.getOrCompute(key(changedNode),options).cache.hit,false);
  const changedRoot=copy(dependency_identity);changedRoot.package_path_sha256=hash('different installation');delete changedRoot.sha256;changedRoot.sha256=hash(changedRoot);assert.equal(cache.getOrCompute(key(changedRoot),options).cache.hit,false);
});
test('current expiry/revocation/unknown guards cannot be bypassed by a populated cache',t=>{
  const {dependency_identity}=setup(t),cache=createDeterministicAuditCache(),k=key(dependency_identity);cache.getOrCompute(k,{validateCurrent(){},compute:geometry});
  for(const reason of ['scope expired','owner changed','revoked','paused','source changed','adverse review','ticket already spent','original process closure unknown']){
    let computed=false;assert.throws(()=>cache.getOrCompute(k,{validateCurrent(){throw Error(reason);},compute(){computed=true;return geometry();}}),new RegExp(reason));assert.equal(computed,false);
  }
});
test('cached outputs are detached and deeply frozen against caller/computation mutation',t=>{
  const {dependency_identity}=setup(t),cache=createDeterministicAuditCache(),k=key(dependency_identity),source=geometry();
  const first=cache.getOrCompute(k,{validateCurrent(){},compute:()=>source});source.frames.initial.sha256=hash('caller mutation');assert.throws(()=>{first.value.frames.initial.sha256='changed';},TypeError);
  const next=cache.getOrCompute(k,{validateCurrent(){},compute:geometry});assert.equal(next.value.frames.initial.sha256,hash('whole'));assert.notEqual(first.value,next.value);
});
test('bounded LRU evicts old entries and oversized results are returned without being retained',t=>{
  const {dependency_identity}=setup(t),cache=createDeterministicAuditCache({max_entries:2,max_bytes:4096}),options={validateCurrent(){},compute:geometry},k=key(dependency_identity);
  for(const n of [1,2,3])cache.getOrCompute({...k,input_sha256:hash('input'+n)},options);assert.equal(cache.statistics().entries,2);assert.equal(cache.getOrCompute({...k,input_sha256:hash('input1')},options).cache.hit,false);
  const small=createDeterministicAuditCache({max_entries:1,max_bytes:8});small.getOrCompute(k,options);assert.equal(small.statistics().entries,0);assert.equal(small.statistics().bytes,0);
});
test('bad or missing identities fail closed; no semantic verdict or authority is cacheable',t=>{
  const {dependency_identity}=setup(t),cache=createDeterministicAuditCache(),k=key(dependency_identity),options={validateCurrent(){},compute:geometry};
  for(const bad of [null,{}, {...dependency_identity,sha256:hash('false')},{...dependency_identity,files:[]}] )assert.throws(()=>cache.getOrCompute({...k,dependency_identity:bad},options));
  assert.throws(()=>cache.getOrCompute({...k,input_sha256:null},options));assert.throws(()=>cache.getOrCompute({...k,kind:'semantic-acceptance'},options));
  for(const field of ['verdict','acceptance','authority','authorization','permissions','permitted_action','execution_authorized'])assert.throws(()=>cache.getOrCompute(k,{validateCurrent(){},compute:()=>({...geometry(),frames:{[field]:'Pass'}})}),/not cacheable/);
  assert.equal(cache.statistics().entries,0);
});
test('guards run after a fresh computation too; a changed current state is never inserted',t=>{
  const {dependency_identity}=setup(t),cache=createDeterministicAuditCache();let valid=true;
  assert.throws(()=>cache.getOrCompute(key(dependency_identity),{validateCurrent(){if(!valid)throw Error('changed while computing');},compute(){valid=false;return geometry();}}),/changed while computing/);assert.equal(cache.statistics().entries,0);
});
test('complete package identity rejects linked dependencies and nonregular input',t=>{
  const {root}=setup(t);fs.symlinkSync(path.join(root,'policy.json'),path.join(root,'linked.json'));assert.throws(()=>captureDeterministicPackageIdentity(root),/linked/);fs.rmSync(path.join(root,'linked.json'));
  const alias=path.join(path.dirname(root),path.basename(root)+'-link');fs.symlinkSync(root,alias);t.after(()=>fs.rmSync(alias,{force:true}));assert.throws(()=>captureDeterministicPackageIdentity(alias),/real directory/);
});
test('package traversal and asynchronous cache callbacks cannot escape fixed computation bounds',t=>{
  const {root,dependency_identity}=setup(t),cache=createDeterministicAuditCache(),k=key(dependency_identity);let nested=root;for(let n=0;n<33;n++){nested=path.join(nested,'nested');fs.mkdirSync(nested);}assert.throws(()=>captureDeterministicPackageIdentity(root),/traversal exceeds/);
  assert.throws(()=>cache.getOrCompute(k,{validateCurrent:async()=>{},compute:geometry}),/synchronously/);assert.throws(()=>cache.getOrCompute(k,{validateCurrent(){},compute:async()=>geometry()}),/plain JSON/);assert.equal(cache.statistics().entries,0);
});
