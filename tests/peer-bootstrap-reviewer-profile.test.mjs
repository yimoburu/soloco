import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {PeerLedger,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {assertOriginalPeerBootstrapReviewerProfile as inspect} from '../plugins/soloco/runtime/peers/bootstrap-reviewer-profile.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {bootstrapFixture,loadBootstrapProfile,disposeBootstrapFixture,core,model} from './peer-bootstrap-membership-fixture.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';

// Disposable real SQLite SOURCE fixtures. These negative boundary tests mint
// no runtime/native source witness, founder permission or lifecycle authority.
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const hold=error=>/^BOOTSTRAP_REVIEWER_PROFILE_/.test(error?.code??'');
const bootstrapHold=error=>/^BOOTSTRAP_/.test(error?.code??'');
const composed=await loadBootstrapProfile();
test.after(disposeBootstrapFixture);
function fixture(t){const f=peerFixture();t.after(()=>f.close());return f;}
function binding(f){const p=f.ledger.read(tx=>tx.get('principals','reviewer'));return {reviewer_principal_ref:ref('principals',p),native_id:p.value.native_id};}
async function activated(t){const f=bootstrapFixture(t);f.enroll();const reconstruction=await f.completePhase(),qualification=await f.completePhase('review'),activation=f.activate();return {f,reconstruction,qualification,activation,binding:{reviewer_principal_ref:ref('principals',activation.principal),native_id:activation.principal.value.native_id}};}

test('closed profile binding is validated before any ledger or actor property access',()=>{
 let touched=0;const ledger=new Proxy({},{get(){touched++;throw Error('Unexpected ledger read');},getPrototypeOf(){touched++;throw Error('Unexpected ledger inspection');}}),r={family:'principals',id:'reviewer',revision:1,sha256:'a'.repeat(64)};
 for(const input of [{reviewer_principal_ref:r,native_id:'fixture-native',ready:true},{reviewer_principal_ref:{...r,family:'work_items'},native_id:'fixture-native'},{reviewer_principal_ref:r,native_id:'fixture-native',provider:()=>true},Object.defineProperty({},'reviewer_principal_ref',{get(){touched++;return r;},enumerable:true})])assert.throws(()=>inspect(ledger,input),hold);
 assert.equal(touched,0);
});
test('a prototype/JSON-shaped ledger cannot substitute a read callback or mint a profile',()=>{
 let reads=0;const fake=Object.assign(Object.create(PeerLedger.prototype),{root:'/SYNTHETIC',directory:'/SYNTHETIC/.company',company_id:'fictional-peer-company',read(){reads++;return {protocol:'peer-original-bootstrap-reviewer-profile-v1'};}});
 assert.throws(()=>inspect(fake,{reviewer_principal_ref:{family:'principals',id:'reviewer',revision:1,sha256:'a'.repeat(64)},native_id:'fixture-native'}));assert.equal(reads,0);
});
test('ordinary active reviewer labels and five-tool-shaped JSON are not original bootstrap lineage',t=>{
 const f=bootstrapFixture(t),a=binding(f);assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(f.ledger,a),e=>e?.code==='BOOTSTRAP_REVIEWER_PROFILE_ACTIVE_REQUIRED');
 f.ledger.write('SYNTHETIC-profile-negative','founder',tx=>{const row=tx.get('principals','reviewer');tx.put('principals',row.id,{...row.value,enrollment_id:'SYNTHETIC-manual',membership_qualification:{family:'work_items',id:'SYNTHETIC-self-described',revision:1,sha256:peerDigest({profile_id:'readonly-five'})}},row.revision);});
 assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(f.ledger,binding(f)),hold);
});
function backendEntryFixture(t,body=null){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-bootstrap-profile-entry-')),source=fileURLToPath(new URL('../plugins/soloco/runtime/peers/bootstrap-reviewer-profile.mjs',import.meta.url)),peers=path.dirname(source),backend=path.join(directory,'origin-maintenance.mjs'),entry=path.join(directory,'profile.mjs');
 // Reuse this fixture's explicitly fictional historical accounting predecessor.
 // The separate CURRENT purpose backend remains absent or throwing as selected.
 const accounting=path.join(directory,'accounting.mjs'),accountingDependency="'./origin-paused-bootstrap-accounting.mjs'",accountingUrl=JSON.stringify(pathToFileURL(accounting).href);
 fs.writeFileSync(accounting,`import {boundary} from ${JSON.stringify(new URL('./peer-bootstrap-membership-fixture.mjs',import.meta.url).href)};export const assertPeerOriginPausedBootstrapAccountingFrom=boundary.assertPeerOriginPausedBootstrapAccountingFrom;\n`);
 const original=fs.readFileSync(source,'utf8');assert.equal(original.split(accountingDependency).length,2);let content=original.replace(accountingDependency,accountingUrl);assert.equal(content.replace(accountingUrl,accountingDependency),original);
 content=content.replace(/from '([^']+)'/g,(all,spec)=>spec==='./origin-maintenance.mjs'?`from ${JSON.stringify(pathToFileURL(backend).href)}`:spec.startsWith('./')?`from ${JSON.stringify(pathToFileURL(path.resolve(peers,spec)).href)}`:all);content=content.replaceAll("'./origin-maintenance.mjs'",JSON.stringify(pathToFileURL(backend).href));fs.writeFileSync(entry,content);if(body!==null)fs.writeFileSync(backend,body);t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return {directory,load:()=>import(pathToFileURL(entry).href)};
}
test('historical profile DATA does not import or depend on a missing or failing CURRENT purpose backend',async t=>{
 const r=await activated(t),expected=composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding);
 for(const body of [null,"throw new AggregateError([Error('SYNTHETIC unavailable current backend')],'SYNTHETIC current backend');\n"]){const module=await backendEntryFixture(t,body).load();assert.deepEqual(module.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding),expected);}
});
test('actual SQLite provider Error and AggregateError identities propagate unchanged',t=>{
 const f=fixture(t),a=binding(f),query=f.ledger.query;
 for(const error of [Object.assign(Error('SYNTHETIC original provider'),{code:'SOURCE_PROVIDER'}),new AggregateError([Error('SYNTHETIC original'),Error('SYNTHETIC boundary')],'SYNTHETIC aggregate')]){
  f.ledger.query=function(sql){if(sql.includes('peer_rows'))throw error;return Reflect.apply(query,this,[sql]);};
  try{assert.throws(()=>inspect(f.ledger,a),cause=>cause===error);}finally{f.ledger.query=query;}
 }
});

test('real paused controller lineage yields only the closed original readonly3 profile DATA, without a grant or live capability',async t=>{
 const r=await activated(t),before=logicalSQLState(r.f),out=composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding);
 assert.deepEqual(Object.keys(out).sort(),['protocol','reviewer_principal_ref','native_id','profile_id','tool_inventory_sha256','enrollment_ref','reconstruction_ref','creation_ref','independent_qualification_ref','qualification_native_id','source_runtime_commitment','creation_fact_sha256'].sort());
 assert.equal(out.protocol,'peer-original-bootstrap-reviewer-profile-v1');assert.equal(out.profile_id,'soloco-bootstrap-membership-readonly3-v1');assert.deepEqual(out.reviewer_principal_ref,r.binding.reviewer_principal_ref);assert.equal(out.native_id,r.binding.native_id);assert.deepEqual(out.reconstruction_ref,r.reconstruction.result.result_ref);assert.deepEqual(out.creation_ref,r.reconstruction.birth.result.creation_ref);assert.deepEqual(out.independent_qualification_ref,r.qualification.result.result_ref);assert.equal(out.qualification_native_id,r.qualification.birth.facts.native_id);assert.notEqual(out.qualification_native_id,out.native_id);assert.equal(out.source_runtime_commitment,peerDigest(r.reconstruction.birth.facts.original_runtime));assert.equal(out.creation_fact_sha256,peerDigest(r.reconstruction.birth.facts));
 assert.equal(r.f.get('control','company').value.paused,true);assert.equal(r.f.get('principals','scheduler').value.status,'held');assert.equal(r.f.get('principals','publisher').value.status,'held');assert.deepEqual(logicalSQLState(r.f),before);
 assert.throws(()=>core.originalPeerBootstrapMembershipLedger(JSON.parse(JSON.stringify(out))),bootstrapHold);
 const other=new PeerLedger(r.f.root);t.after(()=>other.close());assert.deepEqual(composed.assertOriginalPeerBootstrapReviewerProfile(other,r.binding),out,'cold source evidence can be read on the same original namespace; no old live token is reconstructed');
});
test('copied complete canonical SQLite DATA cannot transplant the original profile into another root',async t=>{
 const r=await activated(t);r.f.ledger.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-bootstrap-profile-transplant-'));fs.mkdirSync(path.join(root,'.company'));fs.copyFileSync(r.f.file,path.join(root,'.company','company.sqlite'));const copied=new PeerLedger(root);t.after(()=>{copied.close();fs.rmSync(root,{recursive:true,force:true});});
 assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(copied,r.binding),e=>e?.code==='BOOTSTRAP_REVIEWER_PROFILE_ENROLLMENT_REQUIRED');
});
test('profile requires the exact current ACTIVE incarnation and exact native, never a stale copied selector',async t=>{
 const r=await activated(t);assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,{...r.binding,native_id:r.qualification.birth.facts.native_id}),hold);
 const current=r.f.get('principals',r.activation.principal.id);r.f.seed('principals',current.id,{...current.value,status:'revoked'});assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding),hold);
});
test('a genuine later software pause preserves historical profile DATA and still fences every old controller cap',async t=>{
 const r=await activated(t),c=r.f.get('control','company'),expected=composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding);
 model.execute(r.f.ledger,{principal_id:'founder'},'company/pause',{operation_id:r.f.op(),source_instruction:'SYNTHETIC real software pause preserves historical qualification and invalidates old positive units.'});
 assert.equal(r.f.get('control','company').value.pause_generation,c.value.pause_generation+1);const before=logicalSQLState(r.f);assert.deepEqual(composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding),expected);
 for(const cap of [r.reconstruction.cap,r.qualification.cap]){assert.throws(()=>core.originalPeerBootstrapMembershipPreflight(cap),e=>e?.code==='BOOTSTRAP_ORIGINAL_SELECTION_CHANGED');assert.throws(()=>core.originalPeerBootstrapMembershipChannel(cap).header(),e=>e?.code==='BOOTSTRAP_ORIGINAL_SELECTION_CHANGED');}assert.deepEqual(logicalSQLState(r.f),before);
});
test('changed canonical source context, creation or first-delivery evidence cannot qualify through cached activation refs',async t=>{
 for(const field of ['context','creation','coverage']){
  const r=await activated(t),phase=r.f.get('work_items','membership-phase:SYNTHETIC-reviewer-enrollment:reconstruction');
  if(field==='coverage')r.f.seed('work_items',phase.id,{...phase.value,reads:[[0,1]]});
  else{const reference=field==='context'?phase.value.context_ref:phase.value.creation_ref,row=r.f.get(reference.family,reference.id);r.f.seed(reference.family,row.id,{...row.value,SYNTHETIC_unattributed_change:true});}
  const before=logicalSQLState(r.f);assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(r.f.ledger,r.binding),hold);assert.deepEqual(logicalSQLState(r.f),before);
 }
});
test('a turn-only drain cannot create a returned reconstruction or activated profile',async t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare();f.birth(cap);const s=f.submit(cap),token=f.drain(cap,s.output,{closure:false}),before=logicalSQLState(f);
 await assert.rejects(()=>core.completeOriginalPeerBootstrapMembership(cap,token),e=>e?.code==='BOOTSTRAP_CLOSURE_SOURCE_REQUIRED');assert.deepEqual(logicalSQLState(f),before);const phase=f.get('work_items','membership-phase:SYNTHETIC-reviewer-enrollment:reconstruction');assert.equal(f.get('slots',phase.value.execution_id).value.status,'active');assert.equal(f.get('effects',phase.value.execution_id).value.status,'reserved');assert.equal(phase.value.result_ref,null);const pending=f.get('principals','SYNTHETIC-new-reviewer');assert.throws(()=>composed.assertOriginalPeerBootstrapReviewerProfile(f.ledger,{reviewer_principal_ref:ref('principals',pending),native_id:phase.value.native_id}),e=>e?.code==='BOOTSTRAP_REVIEWER_PROFILE_ACTIVE_REQUIRED');
});
test('the single original runtime shape rejects old aliases and dual old/new field sets before canonical birth',t=>{
 const old={protocol:'peer-original-protected-readonly-runtime-v1',scope:{synthetic:true},state:{synthetic:true},scratch:{synthetic:true},read_paths:[],readonly_launch_config:{synthetic:true},native_permission_profile:{synthetic:true},creation_tools_sha256:peerDigest(['header','read','submit']),context_binding:{recipe_sha256:'1'.repeat(64),resource_sha256:'2'.repeat(64),frame_sha256:'3'.repeat(64)}};
 for(const runtime of [old,{...old,scope_root:'/SYNTHETIC-scope',state_root:'/SYNTHETIC-state',scratch_root:'/SYNTHETIC-scratch',launch:{synthetic:true},directory_pins:[]}]){
  const f=bootstrapFixture(t);f.enroll();const cap=f.prepare(),before=logicalSQLState(f);
  assert.throws(()=>f.birth(cap,{original_runtime:runtime}),e=>e?.code==='BOOTSTRAP_INPUT');assert.deepEqual(logicalSQLState(f),before);const phase=f.get('work_items','membership-phase:SYNTHETIC-reviewer-enrollment:reconstruction');assert.equal(phase.value.creation_ref,null);assert.equal(phase.value.native_id,null);assert.equal(f.get('slots',phase.value.execution_id).value.status,'active');assert.equal(f.get('control','usage').value.model_calls,1);
 }
});
