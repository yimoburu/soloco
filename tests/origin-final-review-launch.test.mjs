import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {digest,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {legacySourceId} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';

// AUTHORED_UNRUN: these tests exercise real SQLite/P1 source state mechanics in disposable fictional
// companies. The lexical dependency relocation below is SYNTHETIC source QA:
// it supplies no human authentication, original native execution, actual drain,
// compiled-context association, production owner qualification or live company.
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-owner-fresh-source-test-'));
const source=fileURLToPath(new URL('../plugins/soloco/runtime/peers/owner-handover.mjs',import.meta.url));
const peers=path.dirname(source),url=p=>pathToFileURL(p).href;
fs.writeFileSync(path.join(directory,'model.mjs'),`export * from ${JSON.stringify(url(path.join(peers,'model.mjs')))};
// Fictional source-only original-origin acceptance; actual model stays held.
export function assertPeerLegacyOriginReady(tx){const c=tx.get('control','company');if(c.value.synthetic_block_origin)throw Object.assign(Error('LEGACY_ORIGIN_HOLD'),{code:'LEGACY_ORIGIN_HOLD'});}
`);
fs.writeFileSync(path.join(directory,'deployment.mjs'),`import {createHash} from 'node:crypto';
import {PEER_OWNER_CONTEXT_POOL_INSTRUCTION} from ${JSON.stringify(url(path.join(peers,'owner-context-pool.mjs')))};
const hash=value=>createHash('sha256').update(value).digest('hex'),plans=new WeakMap();
export const OWNER_MAINTENANCE_INSTRUCTION='SYNTHETIC source-only fixed owner instruction. '+PEER_OWNER_CONTEXT_POOL_INSTRUCTION;
export function inspectOriginalOwnerMaintenanceSupport(){return {protocol:'peer-owner-maintenance-assignment-v1',bridge_sha256:'a'.repeat(64),synthetic_source_test:true};}
export function preflightOriginalOwnerMaintenanceContext({text,native_id}){const input=OWNER_MAINTENANCE_INSTRUCTION+'\\n'+text,frame=JSON.stringify({kind:'owner-maintenance',native_id,input}),plan=Object.freeze({});if(Buffer.byteLength(input)>100000)throw Object.assign(Error('SYNTHETIC fixed wire capacity'),{code:'OWNER_WIRE_CAPACITY'});plans.set(plan,{context_sha256:hash(text),native_id,instruction_sha256:hash(OWNER_MAINTENANCE_INSTRUCTION),frame_sha256:hash(frame),input_utf8_bytes:Buffer.byteLength(input),whole_rpc_utf8_bytes:Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id:1,method:'owner',params:{frame}})),frame_bytes:100000,wire_bytes:4000000,recipe_sha256:hash('SYNTHETIC fixed owner recipe')});return plan;}
export function inspectOriginalOwnerMaintenancePreflight(plan){if(!plans.has(plan))throw Object.assign(Error('SYNTHETIC original wire plan required'),{code:'OWNER_WIRE_ORIGINAL_REQUIRED'});return structuredClone(plans.get(plan));}
const freshPlans=new WeakMap();let freshFailure=null;
export const OWNER_MAINTENANCE_FRESH_INSTRUCTION='SYNTHETIC distinct fresh owner review instruction. '+PEER_OWNER_CONTEXT_POOL_INSTRUCTION;
export function setFreshFailure(value){freshFailure=value;}
export function inspectOriginalOwnerMaintenanceFreshSupport(){return {protocol:'peer-owner-maintenance-fresh-purpose-v1',context_protocol:'peer-owner-maintenance-assignment-v1',creation_mode:'fresh-original-protected-thread',bridge_sha256:'b'.repeat(64),synthetic_source_test:true};}
export function preflightOriginalOwnerMaintenanceFreshContext(text){
 if(freshFailure)throw freshFailure;
 const body=JSON.parse(text),input=OWNER_MAINTENANCE_FRESH_INSTRUCTION+'\\n'+text,frame=JSON.stringify({kind:'owner-maintenance-assignment',input}),rpc=JSON.stringify({id:1,method:'turn/start',params:{threadId:'ffffffff-ffff-7fff-bfff-ffffffffffff',input}}),plan=Object.freeze(Object.create(null));
 freshPlans.set(plan,{protocol:'peer-owner-maintenance-fresh-first-rpc-v1',context_sha256:hash(text),payload_sha256:hash(text),native_identity:'UNOBSERVED_GEOMETRY_ONLY',instruction_sha256:hash(OWNER_MAINTENANCE_FRESH_INSTRUCTION),frame_sha256:hash(frame),recipe_sha256:hash('SYNTHETIC fixed fresh review recipe'),frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:Buffer.byteLength(text),policy_maximum_context_bytes:body.authority.peer_policy.max_context_bytes,input_utf8_bytes:Buffer.byteLength(input),whole_rpc_utf8_bytes:Buffer.byteLength(rpc)});return plan;
}
export function inspectOriginalOwnerMaintenanceFreshPreflight(plan){if(!freshPlans.has(plan))throw Object.assign(Error('SYNTHETIC original fresh plan required'),{code:'OWNER_FRESH_WIRE_ORIGINAL_REQUIRED'});return structuredClone(freshPlans.get(plan));}

`);
fs.writeFileSync(path.join(directory,'domain.mjs'),`
const tokens=new WeakMap(),diagnostics=new WeakMap(),creations=new WeakMap();
export function mintSyntheticCreation(ledger,data){const token=Object.freeze(Object.create(null));creations.set(token,{ledger,data});return token;}
export function assertOriginalProtectedOwnerMaintenanceCreation(token,{ledger,admission_ref,context_sha256,kind}){const r=creations.get(token);if(!r||r.ledger!==ledger||JSON.stringify(r.data.admission_ref)!==JSON.stringify(admission_ref)||r.data.context_sha256!==context_sha256||r.data.kind!==kind)throw Object.assign(Error('SYNTHETIC original creation required'),{code:'SYNTHETIC_ORIGINAL_CREATION_REQUIRED'});return structuredClone(r.data);}
export function mintSyntheticDrain(ledger,data){const token=Object.freeze({});tokens.set(token,{ledger,data});return token;}
export function mintSyntheticDiagnostic(ledger,data){const token=Object.freeze({});diagnostics.set(token,{ledger,data});return token;}
export function assertOriginalProtectedOwnedTaskDiagnostic(token,{ledger,admission_ref,context_sha256,kind}){const r=diagnostics.get(token);if(!r||r.ledger!==ledger||JSON.stringify(r.data.admission_ref)!==JSON.stringify(admission_ref)||r.data.context_sha256!==context_sha256||r.data.kind!==kind)throw Object.assign(Error('ORIGINAL_DIAGNOSTIC_REQUIRED'),{code:'ORIGINAL_DIAGNOSTIC_REQUIRED'});return r.data;}
export function assertOriginalProtectedOwnedTaskDrain(token,{ledger,admission_ref,context_sha256,kind}){const r=tokens.get(token);if(!r||r.ledger!==ledger||JSON.stringify(r.data.admission_ref)!==JSON.stringify(admission_ref)||r.data.context_sha256!==context_sha256||r.data.kind!==kind)throw Object.assign(Error('ORIGINAL_DRAIN_REQUIRED'),{code:'ORIGINAL_DRAIN_REQUIRED'});return r.data;}
`);
let relocated=fs.readFileSync(source,'utf8');
for(const [name,target]of [['ledger',url(path.join(peers,'ledger.mjs'))],['model',url(path.join(directory,'model.mjs'))],['context-component-deployment',url(path.join(directory,'deployment.mjs'))],['review-selection',url(path.join(peers,'review-selection.mjs'))],['legacy-origin',url(path.join(peers,'legacy-origin.mjs'))],['owner-operating-state',url(path.join(peers,'owner-operating-state.mjs'))],['owner-transfer-intent',url(path.join(peers,'owner-transfer-intent.mjs'))],['owner-context-pool',url(path.join(peers,'owner-context-pool.mjs'))],['protected-codex-domain',url(path.join(directory,'domain.mjs'))]])relocated=relocated.replaceAll(`'./${name}.mjs'`,JSON.stringify(target));
fs.writeFileSync(path.join(directory,'owner.mjs'),relocated);
const core=await import(url(path.join(directory,'owner.mjs'))),domain=await import(url(path.join(directory,'domain.mjs'))),deployment=await import(url(path.join(directory,'deployment.mjs')));
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const old={host:'codex',session_id:'outgoing-chat',native_id:'outgoing-native'},incoming={host:'codex',session_id:'incoming-chat',native_id:'incoming-native'};
const ref=(family,r)=>({family,id:r.id,revision:r.revision,sha256:r.sha256});
function get(f,family,id){return f.ledger.read(tx=>tx.get(family,id));}
function seed(f,family,id,value){return f.ledger.write('fictional-source-fixture','founder',tx=>{const previous=tx.get(family,id);return tx.put(family,id,value,previous?.revision??0);});}
function state(f){return f.ledger.db.prepare('SELECT * FROM peer_events ORDER BY seq').all().map(r=>JSON.parse(JSON.stringify(r)));}
function unchanged(f,fn,code){const before=state(f);assert.throws(fn,error=>code?error.code===code:typeof error.code==='string');assert.deepEqual(state(f),before);}
function fixture(t,{module=core,control={},pins=true,reviewerAlias=null,freshReview=true,grantActions=freshReview?['owner/handover-fresh-review-v1']:['owner/handover-review']}={}){
 const f=peerFixture({control,principals:{founder:{...old,legacy_owner:{host:old.host,session_id:old.session_id,epoch:7}},...(reviewerAlias?{reviewer:{native_id:reviewerAlias}}:{})}});t.after(()=>f.close());
 f.n=0;f.op=()=>`owner-test-${++f.n}`;
 const r=seed(f,'work_items','synthetic-reviewer-reconstruction',{kind:'membership_reconstruction',status:'returned',termination_confirmed:true,membership_id:'reviewer-enrollment',principal_id:'reviewer',generation:1,native_id:'reviewer-native'});
 const q=seed(f,'work_items','synthetic-reviewer-qualification',{kind:'membership_qualification',status:'returned',termination_confirmed:true,membership_id:'reviewer-enrollment',principal_id:'cos-b',native_id:'independent-qualifier-native',review:{verdict:'Pass',subject:ref('work_items',r)}});
 const p=get(f,'principals','reviewer'),reviewer=seed(f,'principals','reviewer',{...p.value,native_id:'reviewer-native',...(reviewerAlias?{membership_previous:ref('principals',p)}:{}),enrollment_id:'reviewer-enrollment',membership_qualification:ref('work_items',q)});
 seed(f,'work_items','membership:reviewer-enrollment',{kind:'membership_enrollment',status:'activated',connection_sha256:peerDigest({company_id:f.ledger.company_id,root_sha256:digest(f.ledger.root)}),enrollment_id:'reviewer-enrollment',principal_id:'reviewer',generation:1,role:'reviewer',host:'codex',activation:{principal:ref('principals',reviewer),qualification:ref('work_items',q),reconstruction:ref('work_items',r)}});
 seed(f,'work_items','membership-index:reviewer',{kind:'membership_index',status:'activated',principal_id:'reviewer',enrollment_id:'reviewer-enrollment'});
 execute(f.ledger,{principal_id:'founder'},'grant/create',{operation_id:f.op(),grant_id:'owner-review-grant',to_principal_id:'reviewer',scope:'*',actions:grantActions,resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:3,source_instruction:'SYNTHETIC original bounded grant with an explicit requested action.'});
 if(pins){
  const roles={reviewer:{instructions:'Fictional independent QA.'},cos:{instructions:'Fictional owner reconstruction.'}},bundle={protocol:'peer-pinned-team-bundle-v1',selection:'preserve-pinned-team',company_id:f.ledger.company_id,plugin_version:'fictional-pinned-version',governance:'Fictional bounded governance.',governance_sha256:digest('Fictional bounded governance.'),roles_json:JSON.stringify(roles),cos_instructions:'Fictional canonical instructions preserve all limits.',lineage:{source_layout:4,source_cut_sha256:digest('fictional-complete-origin'),source_owner:{host:'codex',session_id:old.session_id,epoch:7},source_runtime_version:'fictional'},manifest:[]};
  bundle.team_sha256=digest(JSON.stringify([bundle.plugin_version,bundle.governance,roles,bundle.cos_instructions]));
  for(const [position,part]of ['plugin_version','governance','roles','cos_instructions'].entries()){const body=part==='roles'?bundle.roles_json:JSON.stringify(bundle[part]),source={family:'root',key:part,position,encoding:'json',sha256:digest(body)};source.source_id=legacySourceId(source);bundle.manifest.push({part,sha256:source.sha256,characters:body.length,utf8_bytes:Buffer.byteLength(body),source});f.ledger.db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(source.sha256,body);}
  const pinned=seed(f,'control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)}),c=get(f,'control','company');seed(f,'control','company',{...c.value,pinned_team:ref('control',pinned),legacy_source_cut_sha256:bundle.lineage.source_cut_sha256,team_sha256:bundle.team_sha256,governance_sha256:bundle.governance_sha256});
 }
 f.outgoing=module.createPeerOwnerLifecycle({ledger:f.ledger,actor:old});f.incoming=(freshReview?module.createPeerOwnerFreshReviewLifecycle:module.createPeerOwnerLifecycle)({ledger:f.ledger,actor:incoming});
 f.pause=()=>f.outgoing.pause({operation_id:f.op(),epoch:7,source_instruction:'Fictional source test: pause this company.'});
 f.begin=(extra={})=>f.incoming.begin({operation_id:f.op(),epoch:7,source_instruction:'Fictional source test: incoming owning chat takes pending custody.',expires_at:new Date(Date.now()+1800000).toISOString(),reviewer_principal_id:'reviewer',review_grant_id:'owner-review-grant',review_grant_generation:1,max_review_calls:2,...extra});
 f.reconstruct=(content='Retain all original authority, obligations, failed attempts and UNKNOWN reservations. Resume only after exact independent acceptance.')=>{const info=f.incoming.inspect({epoch:8});for(let offset=0;offset<info.total_characters;offset+=1024)f.incoming.read({operation_id:f.op(),epoch:8,sha256:info.subject_sha256,offset,length:Math.min(1024,info.total_characters-offset)});return f.incoming.submit({operation_id:f.op(),epoch:8,subject_sha256:info.subject_sha256,content});};
 return f;
}
function consume(channel){const h=channel.header();let text='';for(let offset=0;offset<h.total_characters;offset+=1024)text+=channel.read({sha256:h.sha256,offset,length:Math.min(1024,h.total_characters-offset)}).text;assert.equal(peerDigest(JSON.parse(text)),h.sha256);return h;}
function prepare(f){const cap=core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id:f.op(),epoch:8}),channel=core.originalPeerOwnerMaintenanceChannel(cap),header=consume(channel);return {cap,channel,header,binding:core.inspectOriginalPeerOwnerMaintenance(cap)};}
function output(a,{verdict='Pass',...extra}={}){return canonical({review:{subject:a.header.review_subject,context_sha256:a.header.sha256,verdict,reason:'Synthetic source state mechanics only.',blockers:verdict==='Pass'?[]:['Retain this exact negative judgment.'],permitted_action:'activate_owner_handover',...extra}});}
function token(f,a,text,extra={}){return domain.mintSyntheticDrain(f.ledger,{protocol:'peer-owned-admitted-task-drain-v1',kind:'owner-handover-review',admission_ref:a.binding.admission_ref,context_sha256:a.binding.context_sha256,native_id:'reviewer-native',thread_id:'reviewer-native',turn_id:'synthetic-turn',group_absent:null,remote_domain_closed:false,terminal_status:'completed',output:text,output_sha256:digest(text),...extra});}
async function qualify(f,a=prepare(f),options={}){const text=output(a,options);a.channel.submit({sha256:a.header.sha256,content:text});return {...a,text,result:await core.completeOriginalPeerOwnerMaintenance(a.cap,token(f,a,text))};}
const code=expected=>error=>error?.code===expected;
function beforeFirstPut(f,fn,expected){
 const before=state(f),guard=f.ledger.guardedWrite;let puts=0;
 f.ledger.guardedWrite=function(type,principal,build,terminal){return Reflect.apply(guard,this,[type,principal,raw=>build(Object.freeze({...raw,put(...args){puts++;return raw.put(...args);}})),terminal]);};
 try{assert.throws(fn,expected);}finally{f.ledger.guardedWrite=guard;}
 assert.equal(puts,0);assert.deepEqual(state(f),before);
}
function reconstructed(t,options){const f=fixture(t,options);f.pause();f.begin();f.reconstruct();return f;}
function freshAdmission(f,args={operation_id:f.op(),epoch:8}){
 const cap=core.prepareOriginalPeerOwnerMaintenanceFreshReview(f.incoming,args);return {cap,args,binding:core.inspectOriginalPeerOwnerMaintenance(cap),channel:core.originalPeerOwnerMaintenanceChannel(cap)};
}
function creation(f,a,{native_id='fresh-owner-review-native',...extra}={}){
 return domain.mintSyntheticCreation(f.ledger,{protocol:'peer-owner-maintenance-original-creation-v1',kind:'owner-handover-review',admission_ref:a.binding.admission_ref,context_sha256:a.binding.context_sha256,native_id,thread_id:native_id,profile_id:'soloco-origin-final-review-readonly-v1',synthetic_source_test:true,...extra});
}
async function born(f,a=freshAdmission(f),extra){await core.bindOriginalPeerOwnerMaintenanceNative(a.cap,creation(f,a,extra));a.binding=core.inspectOriginalPeerOwnerMaintenance(a.cap);return a;}
function freshDrain(f,a,text,extra={}){return token(f,a,text,{native_id:a.binding.native_id,thread_id:a.binding.native_id,whole_domain_closed:false,...extra});}
const phase=(f,a)=>get(f,'work_items',a.binding.admission_ref.id.replace('admission:','phase:'));
function charged(f){return [get(f,'grants','owner-review-grant').value.used_model_calls,get(f,'control','usage')?.value.model_calls??0,get(f,'control','usage:reviewer')?.value.model_calls??0];}

// Synthetic issuer tokens below are deliberately private WeakMap handles. They
// never represent a real process, FD observation, provider call or Native Pass.

test('fresh owner purpose requires the literal new grant action before every begin put',t=>{
 for(const grantActions of [['*'],['owner/handover-review']]){
  const f=fixture(t,{grantActions});f.pause();
  beforeFirstPut(f,()=>f.begin(),code('OWNER_REVIEW_GRANT_REQUIRED'));
  assert.equal(get(f,'principals','founder').value.status,'active');assert.deepEqual(charged(f),[0,0,0]);
 }
});

test('fresh whole-wire failure propagates before revocation or admission charge',t=>{
 const f=fixture(t);f.pause();const failure=Object.assign(Error('SYNTHETIC exact fresh geometry failure'),{code:'SYNTHETIC_FRESH_GEOMETRY'});
 deployment.setFreshFailure(failure);
 try{beforeFirstPut(f,()=>f.begin(),error=>error===failure);}finally{deployment.setFreshFailure(null);}
 assert.equal(get(f,'principals','founder').value.status,'active');assert.deepEqual(charged(f),[0,0,0]);
 f.begin();f.reconstruct();deployment.setFreshFailure(failure);
 try{beforeFirstPut(f,()=>freshAdmission(f),error=>error===failure);}finally{deployment.setFreshFailure(null);}
 assert.equal(get(f,'principals','founder').value.status,'pending');assert.deepEqual(charged(f),[0,0,0]);
});

test('fresh constructor creates a genuinely original purpose-bound handover using an actual grant-create action',t=>{
 const f=fixture(t);f.pause();const result=f.begin(),h=get(f,'work_items',result.handover_id);
 assert.equal(h.value.fresh_review_purpose,'peer-owner-maintenance-fresh-purpose-v1');assert.equal(h.value.creation_mode,'fresh-original-protected-thread');
 assert.equal(h.value.native_source.protocol,'peer-owner-maintenance-fresh-purpose-v1');
 const event=f.ledger.read(tx=>tx.events({after:h.created_seq-1,limit:1}).items[0]);
 assert.equal(event.type,'owner/handover.begin');assert.equal(event.principal_id,incoming.session_id);
 const first=event.payload.changes.find(c=>c.family==='work_items'&&c.id===h.id&&c.revision===1);
 const original=f.ledger.read(tx=>tx.getVersion({family:'work_items',id:h.id,revision:1,sha256:first.sha256}));
 assert.equal(original.value.fresh_review_purpose,'peer-owner-maintenance-fresh-purpose-v1');
 assert.deepEqual(get(f,'grants','owner-review-grant').value.actions,['owner/handover-fresh-review-v1']);
 assert.equal(result.paused,true);assert.deepEqual(charged(f),[0,0,0]);
});

test('a new fresh constructor cannot convert an original old handover or current relabelled DATA',t=>{
 const f=reconstructed(t,{freshReview:false,grantActions:['owner/handover-review','owner/handover-fresh-review-v1']});
 const fresh=core.createPeerOwnerFreshReviewLifecycle({ledger:f.ledger,actor:incoming});
 beforeFirstPut(f,()=>core.prepareOriginalPeerOwnerMaintenanceFreshReview(fresh,{operation_id:f.op(),epoch:8}),code('OWNER_FRESH_REVIEW_PURPOSE_REQUIRED'));
 const c=get(f,'control','company'),h=get(f,'work_items',c.value.owner_handover.id);
 seed(f,'work_items',h.id,{...h.value,fresh_review_purpose:'peer-owner-maintenance-fresh-purpose-v1',creation_mode:'fresh-original-protected-thread',native_source:deployment.inspectOriginalOwnerMaintenanceFreshSupport()});
 beforeFirstPut(f,()=>core.prepareOriginalPeerOwnerMaintenanceFreshReview(fresh,{operation_id:f.op(),epoch:8}),code('OWNER_FRESH_ORIGINAL_HANDOVER_REQUIRED'));
 assert.deepEqual(charged(f),[0,0,0]);
});

test('fresh opaque admission separates immutable qualified reviewer identity from unobserved fresh execution',t=>{
 const f=reconstructed(t),reviewer=get(f,'principals','reviewer'),a=freshAdmission(f),b=a.binding;
 assert.equal(b.kind,'owner-handover-review');assert.equal(b.fresh_review_purpose,'peer-owner-maintenance-fresh-purpose-v1');
 assert.equal(b.native_id,null);assert.equal(b.reviewer_native_id,'reviewer-native');assert.deepEqual(b.reviewer_principal_ref,ref('principals',reviewer));
 assert.equal(b.wire_commitment.native_identity,'UNOBSERVED_GEOMETRY_ONLY');assert.deepEqual(charged(f),[1,1,1]);
 const prepared=core.prepareOriginalPeerOwnerMaintenanceContext(a.cap),body=JSON.parse(prepared.text),admission=get(f,'work_items',b.admission_ref.id);
 assert.equal(body.protocol,'peer-owner-maintenance-assignment-v1');assert.equal(body.kind,'owner-handover-review');assert.equal(body.fresh_review_purpose,b.fresh_review_purpose);
 assert.equal(body.authority.peer_policy.max_context_bytes,65536);assert.equal(Object.hasOwn(admission.value.binding,'native_id'),false);assert.deepEqual(phase(f,a).value.reads,[]);
 for(const action of [()=>a.channel.header(),()=>a.channel.read({sha256:b.context_sha256,offset:0,length:1}),()=>a.channel.submit({sha256:b.context_sha256,content:'No creation witness.'})])beforeFirstPut(f,action,code('OWNER_FRESH_NATIVE_REQUIRED'));
 assert.deepEqual(get(f,'principals','reviewer'),reviewer);
 for(const fake of [{},structuredClone(a.cap),structuredClone(b)])assert.throws(()=>core.assertOriginalPeerOwnerMaintenance(fake),code('OWNER_MAINTENANCE_ORIGINAL_REQUIRED'));
});

test('same original operation reuses only its live capsule and a cold lifecycle cannot rearm it',t=>{
 const f=reconstructed(t),a=freshAdmission(f),before=state(f);
 assert.equal(core.prepareOriginalPeerOwnerMaintenanceFreshReview(f.incoming,a.args),a.cap);assert.deepEqual(state(f),before);
 const cold=core.createPeerOwnerFreshReviewLifecycle({ledger:f.ledger,actor:incoming});
 beforeFirstPut(f,()=>core.prepareOriginalPeerOwnerMaintenanceFreshReview(cold,a.args),code('OWNER_REVIEW_UNCLOSED'));
 const oldMode=core.createPeerOwnerLifecycle({ledger:f.ledger,actor:incoming,freshReview:true});
 beforeFirstPut(f,()=>core.prepareOriginalPeerOwnerMaintenanceFreshReview(oldMode,a.args),code('OWNER_FRESH_REVIEW_LIFECYCLE_REQUIRED'));
 assert.deepEqual(charged(f),[1,1,1]);
});

test('copied foreign or wrongly bound creation tokens cannot manufacture a fresh native',async t=>{
 const f=reconstructed(t),a=freshAdmission(f),valid=creation(f,a),before=state(f);
 for(const fake of [{},structuredClone(valid),{...valid},domain.mintSyntheticCreation({},{}),creation(f,a,{admission_ref:{...a.binding.admission_ref,id:'foreign-admission'}})]){
  await assert.rejects(core.bindOriginalPeerOwnerMaintenanceNative(a.cap,fake),code('SYNTHETIC_ORIGINAL_CREATION_REQUIRED'));assert.deepEqual(state(f),before);
 }
 await assert.rejects(core.bindOriginalPeerOwnerMaintenanceNative(a.cap,creation(f,a,{profile_id:':read-only'})),code('OWNER_FRESH_CREATION_BINDING'));
 assert.deepEqual(state(f),before);assert.equal(core.inspectOriginalPeerOwnerMaintenance(a.cap).native_id,null);assert.deepEqual(charged(f),[1,1,1]);
});

test('fresh creation excludes the reviewer incoming outgoing and other existing principal natives',async t=>{
 const f=reconstructed(t),a=freshAdmission(f),before=state(f);
 for(const native_id of ['reviewer-native','incoming-native','outgoing-native','cos-a-native']){
  await assert.rejects(core.bindOriginalPeerOwnerMaintenanceNative(a.cap,creation(f,a,{native_id})),code('OWNER_FRESH_REVIEW_INDEPENDENCE'));assert.deepEqual(state(f),before);
 }
 assert.equal(phase(f,a).value.status,'reserved');assert.deepEqual(charged(f),[1,1,1]);
});

test('original synthetic creation owns its new row and permits full readonly delivery plus exact fresh drain',async t=>{
 const f=fixture(t);seed(f,'slots','prior-UNKNOWN',{status:'unknown',termination_confirmed:false});f.pause();f.begin();f.reconstruct();
 const reviewer=get(f,'principals','reviewer'),a=freshAdmission(f),immutable=get(f,'work_items',a.binding.admission_ref.id);
 await born(f,a);a.header=consume(a.channel);const text=output(a);a.channel.submit({sha256:a.header.sha256,content:text});
 const p=phase(f,a),c=get(f,'control','company'),h=get(f,'work_items',c.value.owner_handover.id);
 assert(h.value.own_keys.some(([family,id])=>family==='work_items'&&id===p.value.creation_ref.id));assert.equal(f.incoming.inspect({epoch:8}).held,null);
 assert.equal(a.binding.native_id,'fresh-owner-review-native');assert.notEqual(a.binding.native_id,a.binding.reviewer_native_id);assert.deepEqual(get(f,'work_items',a.binding.admission_ref.id),immutable);
 const result=await core.completeOriginalPeerOwnerMaintenance(a.cap,freshDrain(f,a,text));const qualification=get(f,'work_items',result.result_ref.id);
 assert.equal(result.accepted,true);assert.equal(result.owner_activated,false);assert.equal(result.paused,true);assert.equal(result.whole_domain_closed,false);
 assert.equal(qualification.value.native_id,'fresh-owner-review-native');assert.equal(qualification.value.reviewer_native_id,'reviewer-native');assert.deepEqual(qualification.value.creation_ref,p.value.creation_ref);
 assert.equal(get(f,'slots',p.value.execution_id).value.status,'released');assert.equal(get(f,'slots','prior-UNKNOWN').value.status,'unknown');assert.deepEqual(charged(f),[1,1,1]);assert.deepEqual(get(f,'principals','reviewer'),reviewer);
});

test('first immutable submit and exact fresh terminal native remain independent completion guards',async t=>{
 const f=reconstructed(t),a=await born(f);a.header=consume(a.channel);const text=output(a);a.channel.submit({sha256:a.header.sha256,content:text});
 beforeFirstPut(f,()=>a.channel.submit({sha256:a.header.sha256,content:text+' '}),code('OWNER_REVIEW_OUTPUT_IMMUTABLE'));
 const before=state(f);
 await assert.rejects(core.completeOriginalPeerOwnerMaintenance(a.cap,{}),code('ORIGINAL_DRAIN_REQUIRED'));
 await assert.rejects(core.completeOriginalPeerOwnerMaintenance(a.cap,freshDrain(f,a,text,{native_id:'reviewer-native',thread_id:'reviewer-native'})),code('OWNER_DRAIN_BINDING'));
 await assert.rejects(core.completeOriginalPeerOwnerMaintenance(a.cap,freshDrain(f,a,text+' ')),code('OWNER_REVIEW_TERMINAL_MISMATCH'));
 assert.deepEqual(state(f),before);assert.equal(get(f,'slots',phase(f,a).value.execution_id).value.status,'active');assert.deepEqual(charged(f),[1,1,1]);
});

test('a valid synthetic terminal submitted before expiry cannot complete after the original deadline',async t=>{
 const f=reconstructed(t),a=await born(f);a.header=consume(a.channel);const text=output(a);a.channel.submit({sha256:a.header.sha256,content:text});
 const validTerminal=freshDrain(f,a,text),before=state(f),now=Date.now;
 Date.now=()=>a.binding.deadline_at_ms+1;
 try{await assert.rejects(core.completeOriginalPeerOwnerMaintenance(a.cap,validTerminal),code('OWNER_HANDOVER_EXPIRED'));assert.deepEqual(state(f),before);}
 finally{Date.now=now;}
 assert.equal(get(f,'slots',phase(f,a).value.execution_id).value.status,'active');assert.deepEqual(charged(f),[1,1,1]);
 const held=core.holdOriginalPeerOwnerMaintenance(a.cap,{error:'Exact original expiry retained as UNKNOWN.'});assert.equal(held.reservation_retained,true);assert.equal(get(f,'slots',phase(f,a).value.execution_id).value.status,'unknown');assert.deepEqual(charged(f),[1,1,1]);
});

test('the original registered-native prepare and qualification path keeps its positive semantics',async t=>{
 const f=reconstructed(t,{freshReview:false}),a=prepare(f);
 assert.equal(a.binding.native_id,'reviewer-native');assert.equal(Object.hasOwn(a.binding,'fresh_review_purpose'),false);
 const text=output(a);a.channel.submit({sha256:a.header.sha256,content:text});const result=await core.completeOriginalPeerOwnerMaintenance(a.cap,token(f,a,text));
 assert.equal(result.accepted,true);assert.equal(result.owner_activated,false);assert.deepEqual(charged(f),[1,1,1]);
});

test('fresh UNKNOWN and genuine synthetic late evidence retain spend reservations and negative-only status',async t=>{
 const f=reconstructed(t),a=await born(f);const p=phase(f,a),held=core.holdOriginalPeerOwnerMaintenance(a.cap,{error:'SYNTHETIC original execution uncertain.'});
 assert.equal(held.reservation_retained,true);assert.equal(get(f,'slots',p.value.execution_id).value.status,'unknown');
 const body={protocol:'peer-owned-task-observation-v1',kind:a.binding.kind,qualifies:false,admission_ref:a.binding.admission_ref,context_sha256:a.binding.context_sha256,native_id:a.binding.native_id,thread_id:a.binding.native_id,output:'Retain the actual synthetic negative evidence.',group_absent:null,remote_domain_closed:false};
 const late=await core.recordOriginalPeerOwnerMaintenanceLateEvidence(a.cap,domain.mintSyntheticDiagnostic(f.ledger,{...body,observation_sha256:peerDigest(body)}));
 assert.equal(late.accepted,false);assert.equal(late.reservations_released,false);assert.equal(get(f,'slots',p.value.execution_id).value.status,'unknown');assert.deepEqual(charged(f),[1,1,1]);
});
