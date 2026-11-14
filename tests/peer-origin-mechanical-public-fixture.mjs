// Fictional SOURCE lineage with genuine Original Store/inventory identities.
// Standard Node child mocks establish test mechanics, never Native acceptance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {withStore,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {qaCopy,qaRawHash,qaRecordRef} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
import {recordOriginalWorkerAssignmentFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import * as originalInventory from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {originalInventoryFixture,logicalState,actor,instruction,relocatedOriginRuntime} from './peer-origin-public-fixture.mjs';
import {sidecarCaptureModulePath} from './origin-sidecar-fixture.mjs';
import {stageOriginalHistoricalJob} from './original-adapter-process-fixture.mjs';

const peers=fileURLToPath(new URL('../plugins/soloco/runtime/peers/',import.meta.url));
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-mechanical-public-source-')));
const url=p=>pathToFileURL(p).href;
function relocated(source,base,replacements={}) {
 return source.replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(url(replacements[relative]??path.resolve(base,relative))));
}
const policyPath=path.join(peers,'origin-mechanical-qa-policy.mjs');
const policySource=fs.readFileSync(path.join(peers,'origin-mechanical-qa-policy.mjs'),'utf8');
export const policySourceSha256=qaRawHash(policySource);
const planPath=path.join(temporary,'origin-plan.mjs');
fs.writeFileSync(planPath,relocated(fs.readFileSync(path.join(peers,'origin-plan.mjs'),'utf8'),peers,{'./origin-sidecar-capture.mjs':sidecarCaptureModulePath,'./origin-mechanical-qa-policy.mjs':policyPath}));
const quarantinePath=path.join(temporary,'origin-quarantine.mjs');
fs.writeFileSync(quarantinePath,relocated(fs.readFileSync(path.join(peers,'origin-quarantine.mjs'),'utf8'),peers,{'./origin-plan.mjs':planPath}));
export const policy=await import(url(policyPath));
export const inventory=originalInventory;
export const plan=await import(url(planPath));
export const quarantine=await import(url(quarantinePath));
export const policyModuleUrl=url(policyPath);
export const disposeMechanicalPublicFixture=()=>fs.rmSync(temporary,{recursive:true,force:true});

const governance='Complete fictional SOURCE governance: retain every UNKNOWN and original allowance; no real authority.';
const team={plugin_version:'0.7.8',governance,governance_sha256:digest(governance),roles:{cos:{name:'SOURCE coordinator',instructions:'Complete fictional coordinator charter.'},qa:{name:'SOURCE QA',instructions:'Complete fictional independent QA charter.'}},cos_instructions:'Complete fictional SOURCE instructions; no native or actual founder consent.'};
const primary=(suffix,quote)=>({host:'codex',chat_id:actor.session_id,turn_id:'synthetic-mechanical-turn-'+suffix,message_id:'synthetic-mechanical-message-'+suffix,content_sha256:qaRawHash(quote),quote});
export function unselectedFixture(t,changes={}) {
 const f=originalInventoryFixture(t,{...team,team_sha256:teamHash(team),...changes});
 return {...f,actor,epoch:9,raw:()=>logicalState(f),runtime:()=>relocatedOriginRuntime({planModule:planPath,quarantineModule:quarantinePath,mechanical:policyPath})};
}
export function fixture(t,changes={},prepare=()=>{}) {
 const f=unselectedFixture(t,changes);
 prepare(f);
 const quote='SYNTHETIC bounded source mechanics only; no actual founder consent or model invocation.';
 const decision=plan.recordPeerOriginMechanicalQaDecisionAtEpoch(f.root,actor,9,{operation_id:'source-decision',source_instruction:instruction,primary_human_message:primary('A',quote),expires_at:f.input.expires_at,limits:{max_attempts:1,max_native_calls:2,max_context_utf8_bytes:200000,timeout_ms:600000},model_selection:{mode:'explicit',model:'synthetic-source-model',reason:'Fictional SOURCE mechanics only'}});
 f.input.mechanical_qa={protocol:'peer-origin-mechanical-qa-purpose-v1',purpose:'quarantine-transition-review-only',decision_ref:decision.decision_ref};
 const planned=plan.recordPeerOriginQuarantinePlanAtEpoch(f.root,actor,9,{...f.input,source_instruction:instruction}),plan_ref=qaRecordRef(f.state().records[planned.plan_id]);
 const packet=plan.preparePeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{operation_id:'source-packet',source_instruction:instruction,plan_ref});
 const grant=plan.grantPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{operation_id:'source-grant',source_instruction:instruction,packet_ref:packet.packet_ref,primary_human_message:primary('B','SYNTHETIC exact fictional packet '+packet.context_sha256),expires_at:f.input.expires_at});
 return {...f,actor,epoch:9,plan_id:planned.plan_id,plan_ref,planned,decision,packet,grant_ref:grant.grant_ref,policy,policyModuleUrl,policyModulePath:policyPath,inventory,planModulePath:planPath,quarantineModulePath:quarantinePath,raw:()=>logicalState(f),runtime:()=>relocatedOriginRuntime({planModule:planPath,quarantineModule:quarantinePath,mechanical:policyPath})};
}
export function enqueue(f) {
 let receipt,job;
 withStore(f.root,store=>store.transaction('job.queued',state=>{
  job={...qaCopy(state.records[f.packet.packet_ref.id].origin_mechanical_qa.job),created_at:new Date().toISOString(),cli_version:'SYNTHETIC-source-only'};
  recordOriginalWorkerAssignmentFrom(store,state,job);
  receipt=policy.reservePeerOriginMechanicalQaFrom(store,state,job,{expected_epoch:f.epoch,grant_ref:f.grant_ref});
  state.jobs[job.id]=job;state.sessions[job.session_key]={instance_id:job.instance_id,role:'qa',host:'codex',native_id:null,model_selection:job.model_selection};return state;
 },{beforeCommit:(_db,next)=>policy.assertOriginalPeerOriginMechanicalQaReservationCommitFrom(store,next,receipt)}));
 return {job,receipt};
}
export function completeReview(f) {
 const {job}=enqueue(f),id=job.id;
 stageOriginalHistoricalJob(f.root,{...job,status:'completed',native_id:'synthetic-independent-mechanical-native',coordination_release:{termination_confirmed:true,reason:'model_process_closed',at:new Date().toISOString()}},{deferTerminal:true});
 const reviewId='synthetic-selected-mechanical-review';
 f.write('job.completed',state=>{const current=state.jobs[id];Object.assign(current,{status:'completed',native_id:'synthetic-independent-mechanical-native',artifact_id:reviewId,finished_at:new Date().toISOString(),coordination_release:{termination_confirmed:true,reason:'model_process_closed',at:new Date().toISOString()}});state.sessions[current.session_key].native_id=current.native_id;
  state.records[reviewId]={id:reviewId,kind:'review',status:'Submitted',revision:1,author_role:'qa',author_instance:job.instance_id,job_id:id,review_of:job.review_of,inputs:job.inputs,review:{verdict:'Pass',reason:'SYNTHETIC source mechanics only.',blockers:[]},content:JSON.stringify({protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:f.planned.plan_sha256,cut_sha256:f.planned.cut_sha256,maintenance_role:'reviewer',legacy_authority:'retired-without-conversion',execution_resumed:false}),created_at:new Date().toISOString()};return state;
 });
 return [reviewId];
}
