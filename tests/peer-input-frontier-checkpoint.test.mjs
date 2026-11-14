// Negative SOURCE constructor contracts on fictional P1. No original semantic
// proof, native/profile/model call or production execution grant is fabricated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerFixture} from './peer-fixture.mjs';
import * as checkpoint from '../plugins/soloco/runtime/peers/input-frontier-checkpoint.mjs';
const reference={family:'work_items',id:'not-a-qualified-root',revision:1,sha256:'a'.repeat(64)};
function fixture(t){const f=peerFixture({control:{paused:true}});t.after(()=>f.close());return f;}
function input(f){return {ledger:f.ledger,frontier_ref:reference,root_result_ref:reference,purpose:'origin-frontier-seal',operation_id:'test-operation',command_id:'test-command'};}
test('checkpoint preimage requires original owning write snapshot, not a read handle',t=>{const f=fixture(t);assert.throws(()=>f.ledger.read(tx=>checkpoint.preparePeerInputFrontierCheckpointFrom(tx,input(f))),e=>e.code==='FRONTIER_CHECKPOINT_OWNING_WRITE_REQUIRED');});
test('missing actual quarantine/selected purpose Holds before any checkpoint row',t=>{const f=fixture(t),before=f.ledger.events();assert.throws(()=>f.ledger.guardedWrite('fictional','founder',tx=>checkpoint.preparePeerInputFrontierCheckpointFrom(tx,input(f)),()=>Date.now()+10000),e=>e.code==='FRONTIER_CHECKPOINT_SELECTED_PURPOSE_REQUIRED');assert.deepEqual(f.ledger.events(),before);});
test('caller flags, masks and pending purpose cannot select checkpoint equivalence',t=>{const f=fixture(t),before=f.ledger.events();for(const extra of [{exclude:['notices']},{ready:true},{allow_pending:true}])assert.throws(()=>f.ledger.read(tx=>checkpoint.preparePeerInputFrontierCheckpointFrom(tx,{...input(f),...extra})),e=>e.code==='FRONTIER_CHECKPOINT_INPUT');assert.throws(()=>f.ledger.read(tx=>checkpoint.preparePeerInputFrontierCheckpointFrom(tx,{...input(f),purpose:'owner-pending-frontier-refresh'})),e=>e.code==='FRONTIER_CHECKPOINT_INPUT');assert.deepEqual(f.ledger.events(),before);});
test('plain/copied/inherited stage plans and a JSON ledger never mint original staging',t=>{const f=fixture(t),before=f.ledger.events();for(const prepared of [{},{protocol:'peer-input-frontier-checkpoint-v1'},Object.create({protocol:'peer-input-frontier-checkpoint-v1'})])assert.throws(()=>f.ledger.guardedWrite('fictional','founder',tx=>checkpoint.stagePeerInputFrontierCheckpointFrom(tx,{ledger:f.ledger,prepared}),()=>Date.now()+10000),e=>e.code==='FRONTIER_CHECKPOINT_ORIGINAL_PLAN_REQUIRED');assert.throws(()=>f.ledger.read(tx=>checkpoint.preparePeerInputFrontierCheckpointFrom(tx,{...input(f),ledger:{root:f.root,company_id:f.ledger.company_id}})),e=>e.code==='FRONTIER_CHECKPOINT_INPUT');assert.deepEqual(f.ledger.events(),before);});

// Explicit SOURCE-only lexical export of the unchanged private pure predicate.
// Synthetic vectors test resource arithmetic only; they never create a branded
// plan, semantic qualification, original authority or a capacity receipt.
const sourceURL=new URL('../plugins/soloco/runtime/peers/input-frontier-checkpoint.mjs',import.meta.url),directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-checkpoint-boundary-')),modulePath=path.join(directory,'checkpoint-resource.mjs');
fs.writeFileSync(modulePath,fs.readFileSync(sourceURL,'utf8').replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_m,_q,relative)=>JSON.stringify(new URL(relative,sourceURL).href))+'\nexport {preflightNamespace as SOURCE_ONLY_resourcePredicate};\n');
const {SOURCE_ONLY_resourcePredicate:capacity}=await import(pathToFileURL(modulePath).href);test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const shape=(family,id)=>({family,id,revision:1,sha256:'a'.repeat(64)}),many=(family,n)=>Array.from({length:n},(_,i)=>shape(family,'source-'+i)),custody=[shape('work_items','checkpoint:page:0'),shape('work_items','checkpoint:page:1'),shape('work_items','checkpoint')],check=(heads,pages=custody)=>capacity({heads},pages),capacityError=e=>e.code==='FRONTIER_CHECKPOINT_CAPACITY';
test('fixed resource envelope counts all checkpoint pages/main and eight seal lifecycle work items',()=>{assert.doesNotThrow(()=>check(many('work_items',9989)));assert.throws(()=>check(many('work_items',9990)),capacityError);assert.doesNotThrow(()=>check(many('work_items',9992),[]));assert.throws(()=>check(many('work_items',9992)),capacityError);});
test('fixed resource envelope preserves the complete total namespace cap independently of family caps',()=>{const heads=[...many('work_items',9987),...many('commands',9999),...many('slots',9999)];assert.doesNotThrow(()=>check(heads));assert.throws(()=>check([...heads,shape('effects','one-extra-current-head')]),capacityError);});
test('fixed resource envelope includes actual checkpoint refs, positive future refs and revision growth in the byte cap',()=>{
 const heads=many('homes',6000).map(r=>({...r,id:'x'.repeat(1000)+r.id})),size=r=>Buffer.byteLength(canonical(r)),reserve=12*256+3,target=8*1024*1024-custody.reduce((n,r)=>n+size(r),0)-reserve;let remaining=target-heads.reduce((n,r)=>n+size(r),0);assert.ok(remaining>0);for(const r of heads){const add=Math.min(remaining,2000-r.id.length);r.id='y'.repeat(add)+r.id;remaining-=add;if(!remaining)break;}assert.equal(remaining,0);assert.doesNotThrow(()=>check(heads));const last=heads.find(r=>r.id.length<2000);assert.ok(last);last.id+='z';assert.throws(()=>check(heads),capacityError);
});

function loaderFixture(t,name,dependency,kind){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-checkpoint-fixed-loader-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const entry=path.join(dir,dependency),entryURL=pathToFileURL(entry).href,subject=path.join(dir,'subject.mjs'),original=new URL(name,sourceURL),source=fs.readFileSync(original,'utf8'),literal="'./"+dependency+"'",guard='fixedOptionalEntry('+literal+')';
 // The authority entries are genuinely optional. Quarantine is an ESM static
 // dependency: it cannot exercise a JavaScript stat guard before resolution.
 if(kind==='optional'){assert.ok(source.includes(guard));assert.equal(source.split('\n').some(line=>line.startsWith('import ')&&line.endsWith('from '+literal+';')),false);}
 else {assert.equal(kind,'static');assert.ok(source.split('\n').some(line=>line.startsWith('import ')&&line.endsWith('from '+literal+';')));assert.equal(source.includes(guard),false);}
 const edits=[];let shift=0;
 const relocated=source.replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(before,_q,relative,offset)=>{const after=JSON.stringify(relative==='./'+dependency?entryURL:new URL(relative,original).href);edits.push({at:offset+shift,before,after});shift+=after.length-before.length;return after;});
 // Reversing only those literal URL relocations must recover every production
 // byte; no guard, catch, provider, factory or module body is replaced.
 let restored=relocated;for(const edit of edits.slice().reverse())restored=restored.slice(0,edit.at)+edit.before+restored.slice(edit.at+edit.after.length);
 assert.equal(restored,source);fs.writeFileSync(subject,relocated);return {dir,entry,entryURL,subjectURL:pathToFileURL(subject).href};
}
for(const [name,dependency,kind]of [['input-frontier-checkpoint.mjs','origin-maintenance-authority.mjs','optional'],['input-frontier-maintenance.mjs','origin-maintenance-authority.mjs','optional'],['input-frontier-maintenance.mjs','origin-quarantine.mjs','static']]){
 for(const transitive of [false,true])test(`${name}/${dependency} preserves original existing ${transitive?'transitive':'direct'} AggregateError despite canonical missing-source labels`,async t=>{
  const f=loaderFixture(t,name,dependency,kind),key='SOURCE_ONLY_original_'+name+'_'+dependency+'_'+transitive,cause=Error('Original fixed backend cause'),original=Object.assign(new AggregateError([Error('First original detail'),Error('Second original detail')],'Existing backend failed',{cause}),{code:'ERR_MODULE_NOT_FOUND',url:f.entryURL});globalThis[key]=original;t.after(()=>delete globalThis[key]);const content='throw globalThis['+JSON.stringify(key)+'];\n';if(transitive){fs.writeFileSync(f.entry,"import './transitive.mjs';\n");fs.writeFileSync(path.join(f.dir,'transitive.mjs'),content);}else fs.writeFileSync(f.entry,content);await assert.rejects(import(f.subjectURL),e=>e===original&&e.cause===cause&&e.errors===original.errors);
 });
 test(`${name}/${dependency} propagates genuine missing transitive import from an existing fixed entry`,async t=>{const f=loaderFixture(t,name,dependency,kind);fs.writeFileSync(f.entry,"import './actually-missing-transitive.mjs';\n");await assert.rejects(import(f.subjectURL),e=>e.code==='ERR_MODULE_NOT_FOUND'&&e.url===pathToFileURL(path.join(f.dir,'actually-missing-transitive.mjs')).href);});
 const providerCase=kind==='optional'?'preserves original stat-provider failure without interpreting its public ENOENT label':'preserves exact static module-provider failure while leaving poisoned optional stat untouched';
 test(`${name}/${dependency} ${providerCase}`,async t=>{
  const f=loaderFixture(t,name,dependency,kind),statError=Object.assign(new AggregateError([Error('Original stat detail')],'Source stat provider'),{code:'ENOENT',url:f.entryURL}),before=fs.lstatSync;let original=statError,statCalls=0;
  if(kind==='static'){
   const key='SOURCE_ONLY_static_provider_'+path.basename(f.dir),cause=Error('Original static module cause');
   original=Object.assign(new AggregateError([Error('First static detail'),Error('Second static detail')],'Existing static module failed',{cause}),{code:'ERR_MODULE_NOT_FOUND',url:f.entryURL});
   globalThis[key]=original;t.after(()=>delete globalThis[key]);fs.writeFileSync(f.entry,'throw globalThis['+JSON.stringify(key)+'];\n');
  }
  fs.lstatSync=function(file,...args){if(String(file)===f.entryURL){statCalls++;throw statError;}return before.call(this,file,...args);};
  try{await assert.rejects(import(f.subjectURL),e=>{assert.strictEqual(e,original);assert.strictEqual(e.cause,original.cause);assert.strictEqual(e.errors,original.errors);return true;});assert.equal(statCalls,kind==='optional'?1:0);}finally{fs.lstatSync=before;}
 });
 const entryCase=kind==='optional'?'rejects a nonregular fixed entry without importing it':'rejects a nonregular static dependency through the ESM loader';
 test(`${name}/${dependency} ${entryCase}`,async t=>{const f=loaderFixture(t,name,dependency,kind);fs.mkdirSync(f.entry);await assert.rejects(import(f.subjectURL),e=>e.code===(kind==='optional'?'FRONTIER_OPTIONAL_SOURCE_ENTRY_REQUIRED':'ERR_UNSUPPORTED_DIR_IMPORT'));});
}
