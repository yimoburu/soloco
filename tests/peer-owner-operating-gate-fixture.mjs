import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import * as sharedModel from '../plugins/soloco/runtime/peers/model.mjs';
import {digest,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {legacySourceId} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {createPeerExecutorIncarnationSource} from '../plugins/soloco/runtime/peers/executor-incarnation.mjs';

// Isolated composition of exact frozen ec6795f owner-core logic and the actual
// shared model. The relocation below replaces ONLY explicitly SYNTHETIC
// native/deployment/origin dependencies used by that core's source tests.
// Seeded reviewer qualification/pinned legacy facts are fixture INPUT DATA;
// owner reconstruction/review/activation/resume records come from core commands.
// This module registers no tests. It proves no native host, authenticated human,
// compiled-context association, original physical drain or company adoption.
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-owner-gate-source-test-'));
const source=fileURLToPath(new URL('../plugins/soloco/runtime/peers/owner-handover.mjs',import.meta.url));
const peers=path.dirname(source),url=p=>pathToFileURL(p).href;
fs.writeFileSync(path.join(directory,'model.mjs'),`export * from ${JSON.stringify(url(path.join(peers,'model.mjs')))};
// Fictional source-only original-origin acceptance; actual model stays held.
export function assertPeerLegacyOriginReady(tx){const c=tx.get('control','company');if(c.value.synthetic_block_origin)throw Object.assign(Error('LEGACY_ORIGIN_HOLD'),{code:'LEGACY_ORIGIN_HOLD'});}
`);
fs.writeFileSync(path.join(directory,'deployment.mjs'),`export function inspectOriginalOwnerMaintenanceSupport(){return {protocol:'peer-owner-maintenance-assignment-v1',bridge_sha256:'a'.repeat(64),synthetic_source_test:true};}`);
fs.writeFileSync(path.join(directory,'domain.mjs'),`
const tokens=new WeakMap(),diagnostics=new WeakMap();
export function mintSyntheticDrain(ledger,data){const token=Object.freeze({});tokens.set(token,{ledger,data});return token;}
export function mintSyntheticDiagnostic(ledger,data){const token=Object.freeze({});diagnostics.set(token,{ledger,data});return token;}
export function assertOriginalProtectedOwnedTaskDiagnostic(token,{ledger,admission_ref,context_sha256,kind}){const r=diagnostics.get(token);if(!r||r.ledger!==ledger||JSON.stringify(r.data.admission_ref)!==JSON.stringify(admission_ref)||r.data.context_sha256!==context_sha256||r.data.kind!==kind)throw Object.assign(Error('ORIGINAL_DIAGNOSTIC_REQUIRED'),{code:'ORIGINAL_DIAGNOSTIC_REQUIRED'});return r.data;}
export function assertOriginalProtectedOwnedTaskDrain(token,{ledger,admission_ref,context_sha256,kind}){const r=tokens.get(token);if(!r||r.ledger!==ledger||JSON.stringify(r.data.admission_ref)!==JSON.stringify(admission_ref)||r.data.context_sha256!==context_sha256||r.data.kind!==kind)throw Object.assign(Error('ORIGINAL_DRAIN_REQUIRED'),{code:'ORIGINAL_DRAIN_REQUIRED'});return r.data;}
`);
let relocated=fs.readFileSync(source,'utf8');
for(const [name,target]of [['ledger',url(path.join(peers,'ledger.mjs'))],['model',url(path.join(directory,'model.mjs'))],['context-component-deployment',url(path.join(directory,'deployment.mjs'))],['review-selection',url(path.join(peers,'review-selection.mjs'))],['legacy-origin',url(path.join(peers,'legacy-origin.mjs'))],['owner-operating-state',url(path.join(peers,'owner-operating-state.mjs'))],['protected-codex-domain',url(path.join(directory,'domain.mjs'))]])relocated=relocated.replaceAll(`'./${name}.mjs'`,JSON.stringify(target));
fs.writeFileSync(path.join(directory,'owner.mjs'),relocated);
const core=await import(url(path.join(directory,'owner.mjs'))),domain=await import(url(path.join(directory,'domain.mjs')));
export const disposeOwnerGateFixture=()=>fs.rmSync(directory,{recursive:true,force:true});
const old={host:'codex',session_id:'outgoing-chat',native_id:'outgoing-native'},incoming={host:'codex',session_id:'incoming-chat',native_id:'incoming-native'};
const ref=(family,r)=>({family,id:r.id,revision:r.revision,sha256:r.sha256});
function get(f,family,id){return f.ledger.read(tx=>tx.get(family,id));}
function seed(f,family,id,value){return f.ledger.write('fictional-source-fixture','founder',tx=>{const previous=tx.get(family,id);return tx.put(family,id,value,previous?.revision??0);});}
function state(f){return f.ledger.db.prepare('SELECT * FROM peer_events ORDER BY seq').all().map(r=>JSON.parse(JSON.stringify(r)));}
function unchanged(f,fn,code){const before=state(f);assert.throws(fn,error=>code?error.code===code:typeof error.code==='string');assert.deepEqual(state(f),before);}
function fixture(t,{module=core,control={},pins=true,reviewerAlias=null,prelude=null}={}){
 const f=peerFixture({control,principals:{founder:{...old,legacy_owner:{host:old.host,session_id:old.session_id,epoch:7}},...(reviewerAlias?{reviewer:{native_id:reviewerAlias}}:{})}});t.after(()=>f.close());
 f.n=0;f.op=()=>`owner-gate-${++f.n}`; attachSharedModel(f);
 const r=seed(f,'work_items','synthetic-reviewer-reconstruction',{kind:'membership_reconstruction',status:'returned',termination_confirmed:true,membership_id:'reviewer-enrollment',principal_id:'reviewer',generation:1,native_id:'reviewer-native'});
 const q=seed(f,'work_items','synthetic-reviewer-qualification',{kind:'membership_qualification',status:'returned',termination_confirmed:true,membership_id:'reviewer-enrollment',principal_id:'cos-b',native_id:'independent-qualifier-native',review:{verdict:'Pass',subject:ref('work_items',r)}});
 const p=get(f,'principals','reviewer'),reviewer=seed(f,'principals','reviewer',{...p.value,native_id:'reviewer-native',...(reviewerAlias?{membership_previous:ref('principals',p)}:{}),enrollment_id:'reviewer-enrollment',membership_qualification:ref('work_items',q)});
 seed(f,'work_items','membership:reviewer-enrollment',{kind:'membership_enrollment',status:'activated',connection_sha256:peerDigest({company_id:f.ledger.company_id,root_sha256:digest(f.ledger.root)}),enrollment_id:'reviewer-enrollment',principal_id:'reviewer',generation:1,role:'reviewer',host:'codex',activation:{principal:ref('principals',reviewer),qualification:ref('work_items',q),reconstruction:ref('work_items',r)}});
 seed(f,'work_items','membership-index:reviewer',{kind:'membership_index',status:'activated',principal_id:'reviewer',enrollment_id:'reviewer-enrollment'});
 seed(f,'grants','owner-review-grant',{status:'active',principal_id:'reviewer',generation:1,policy_generation:1,scope:'*',actions:['owner/handover-review'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:3,used_model_calls:0});
 if(prelude)prelude(f);
 if(pins){
  const roles={reviewer:{instructions:'Fictional independent QA.'},cos:{instructions:'Fictional owner reconstruction.'}},bundle={protocol:'peer-pinned-team-bundle-v1',selection:'preserve-pinned-team',company_id:f.ledger.company_id,plugin_version:'fictional-pinned-version',governance:'Fictional bounded governance.',governance_sha256:digest('Fictional bounded governance.'),roles_json:JSON.stringify(roles),cos_instructions:'Fictional canonical instructions preserve all limits.',lineage:{source_layout:4,source_cut_sha256:digest('fictional-complete-origin'),source_owner:{host:'codex',session_id:old.session_id,epoch:7},source_runtime_version:'fictional'},manifest:[]};
  bundle.team_sha256=digest(JSON.stringify([bundle.plugin_version,bundle.governance,roles,bundle.cos_instructions]));
  for(const [position,part]of ['plugin_version','governance','roles','cos_instructions'].entries()){const body=part==='roles'?bundle.roles_json:JSON.stringify(bundle[part]),source={family:'root',key:part,position,encoding:'json',sha256:digest(body)};source.source_id=legacySourceId(source);bundle.manifest.push({part,sha256:source.sha256,characters:body.length,utf8_bytes:Buffer.byteLength(body),source});f.ledger.db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(source.sha256,body);}
  const pinned=seed(f,'control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)}),c=get(f,'control','company');seed(f,'control','company',{...c.value,pinned_team:ref('control',pinned),legacy_source_cut_sha256:bundle.lineage.source_cut_sha256,team_sha256:bundle.team_sha256,governance_sha256:bundle.governance_sha256});
 }
 f.outgoing=module.createPeerOwnerLifecycle({ledger:f.ledger,actor:old});f.incoming=module.createPeerOwnerLifecycle({ledger:f.ledger,actor:incoming});
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
function readRecovery(f){const h=f.incoming.recoveryHeader({epoch:8});let text='';for(let offset=0;offset<h.total_characters;offset+=1024)text+=f.incoming.readRecovery({operation_id:f.op(),epoch:8,sha256:h.sha256,offset,length:Math.min(1024,h.total_characters-offset)}).text;assert.equal(peerDigest(JSON.parse(text)),h.sha256);return {header:h,body:JSON.parse(text)};}
function recover(f,{content='Changed reconstruction explicitly retains UNKNOWN original attempts, actual late evidence, and all original limits.',extra={}}={}){const packet=readRecovery(f),info=f.incoming.inspect({epoch:8});return {packet,result:f.incoming.recover({operation_id:f.op(),epoch:8,source_instruction:'Attributed fictional pending-owner recovery disposition; no claim of human acknowledgement.',subject_sha256:info.subject_sha256,recovery_sha256:packet.header.sha256,attempt_refs:packet.header.attempt_refs,content,...extra})};}
function diagnostic(f,a,extra={}){const body={protocol:'peer-owned-task-observation-v1',qualifies:false,kind:a.binding.kind,admission_ref:a.binding.admission_ref,context_sha256:a.binding.context_sha256,native_id:a.binding.native_id,thread_id:a.binding.native_id,turn_id:'synthetic-old-turn',terminal_status:'completed',output:'Actual late SYNTHETIC original output retained as evidence only.',...extra};return domain.mintSyntheticDiagnostic(f.ledger,{...body,observation_sha256:peerDigest(body)});}


function attachSharedModel(f){
 f.get=(family,id)=>get(f,family,id);
 f.seed=(family,id,value)=>seed(f,family,id,value);
 f.run=(who,action,args={})=>execute(f.ledger,{principal_id:who},action,{operation_id:f.op(),...args});
 for(const who of ['cos-a','cos-b'])f.run('founder','grant/create',{grant_id:'gate-grant-'+who,to_principal_id:who,scope:'*',actions:['task/*','home/*','message/*','handoff/*'],resources:['home:fact','home:other'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'SYNTHETIC bounded pre-handover source authority.'});
 f.client=sharedModel.bindPeerPrincipal(f.ledger,{principal_id:'cos-a',generation:1,native_id:'cos-a-native'});
 f.observer=sharedModel.createRuntimeObserver(f.ledger);
 f.start=(args={})=>{
  const task=f.client.execute('task/submit',{operation_id:f.op(),grant_id:'gate-grant-cos-a',scope:'alpha',role:'engineer',instructions:'Inspect synthetic source evidence only.',acceptance:'Retain original exact output and all uncertainty.',resources:['home:other'],...args});
  f.client.execute('task/claim',{operation_id:f.op(),task_id:task.id});
  const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
  const association={task_id:task.id,attempt_id:admitted.task.value.attempt.id,context_sha256:admitted.context.sha256,principal_id:'cos-a',generation:1,native_id:'cos-a-native',turn_id:'SYNTHETIC-owner-gate-turn',process:{pid:81001,started_at:admitted.task.value.attempt.admitted_at},deadline_at_ms:Date.parse(admitted.task.value.attempt.effect_authority.expires_at)};
  const source=createPeerExecutorIncarnationSource(f.ledger),handle=source.observe(association,()=>association),client=sharedModel.bindPeerTaskEffects(f.client,{task_id:task.id},handle);
  return {...admitted,association,source,handle,client};
 };
 f.observe=(a,action,args={})=>f.observer.record(action,{operation_id:f.op(),task_id:a.task.id,attempt_id:a.task.value.attempt.id,observed_process:{...a.association.process,close_observed:action==='task/closure'},...args});
 f.messageArgs=()=>({operation_id:f.op(),grant_id:'gate-grant-cos-a',scope:'alpha',to_principal_id:'cos-b',content:'SYNTHETIC ordinary source message.'});
 f.proposal=f.client.execute('home/propose',{operation_id:f.op(),grant_id:'gate-grant-cos-a',scope:'alpha',home_id:'fact',expected_revision:0,content:'SYNTHETIC exact candidate; receiver acceptance is separate.'});
}
export function ownerGateFixture(t,options={}){return fixture(t,options);}
export function beginOwnerGate(f){f.pause();return f.begin();}
export async function activateOwnerGate(f){
 if(!get(f,'control','company').value.owner_handover)beginOwnerGate(f);
 f.reconstruct();const q=await qualify(f);
 const activation=f.incoming.activate({operation_id:f.op(),epoch:8,review_ref:q.result.result_ref,source_instruction:'SYNTHETIC exact core activation remains paused.'});
 assert.equal(activation.status,'activated');return q;
}
export async function resumeOwnerGate(f){const q=await activateOwnerGate(f);const resumed=f.incoming.resume({operation_id:f.op(),epoch:8,source_instruction:'SYNTHETIC dedicated exact-core resume; native qualification remains incomplete.'});assert.equal(resumed.paused,false);return {q,resumed};}
export {core,ref,prepare,qualify,recover,diagnostic};
