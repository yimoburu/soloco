// Fictional SQLite SOURCE fixture with genuine Original inventory provenance.
// Empty sidecar support remains conditional; Node child mocks are not Native QA.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {installedTeam,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {qaRecordRef,qaRawHash} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
import {loadMechanicalQueueWorkerSource} from './origin-mechanical-qa-dispatch-fixture.mjs';
import {originalInventoryFixture} from './peer-origin-public-fixture.mjs';
import * as originalInventory from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),peers=path.join(runtime,'peers'),url=p=>pathToFileURL(p).href;
export const actor={host:'codex',session_id:'11111111-1111-4111-8111-111111111111',native_id:'11111111-1111-4111-8111-111111111111'};
export const instruction='SYNTHETIC fictional source only; no actual founder or native permission.';
const message=(id,quote)=>({host:'codex',chat_id:actor.session_id,turn_id:'SYNTHETIC-turn-'+id,message_id:'SYNTHETIC-message-'+id,content_sha256:qaRawHash(quote),quote});
export async function wireFixture(t,{fullTeam=false,legacyV1=false,utf8Limit=200000,changes={}}={}){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-NEW-wire-source-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const sidecars=path.join(temporary,'SYNTHETIC-empty-sidecars.mjs');fs.writeFileSync(sidecars,"export const captureOriginSidecarContents=()=>[];export const originSidecars=()=>[];export const assertOriginSidecarCaptureSupport=()=>({protocol:'SYNTHETIC-EMPTY-SIDECARS-NOT-NATIVE'});");
 const canonicalPolicyFile=path.join(peers,'origin-mechanical-qa-policy.mjs');let planPolicyFile=canonicalPolicyFile;
 if(legacyV1){
  let policySource=fs.readFileSync(canonicalPolicyFile,'utf8');
  // Conditional historical packet DATA preserves the old v1 construction
  // recipe. This namespace never issues current cutoff or execution proofs.
  const from="const job=packetJob(s,d,p.p,randomUUID()),built=originMechanicalQaAssignmentContext(s,job,a.plan_ref),context=built.context;job.inputs=built.inputs;job.context_sha256=context.sha256;assertOriginMechanicalQaPromptFits(job.task,context.text,ORIGIN_MECHANICAL_QA_WIRE,d.v.request.limits.max_context_utf8_bytes);const utf8_bytes=context.utf8_bytes;const value={protocol:PACKET_V2,";
  const to="const job=packetJob(s,d,p.p,randomUUID()),original=assignmentContext(s,job);job.inputs=original.inputs;job.context_sha256=original.hash;const utf8_bytes=Buffer.byteLength(original.text);need(utf8_bytes<=d.v.request.limits.max_context_utf8_bytes,'ORIGIN_MECHANICAL_QA_CONTEXT_CAPACITY');const context={text:original.text,sha256:original.hash,utf8_bytes};const value={protocol:PACKET,";
  if(!policySource.includes(from))throw Error('Fixture source delta no longer matches');policySource=policySource.replace(from,to);
  const retained='retainCommitCutoff(store.db,deadline);';
  if(policySource.split(retained).length!==2)throw Error('Historical packet DATA recipe no longer matches');
  policySource=policySource.replace(retained,"if(type!=='origin.mechanical_qa.packet_prepared')throw Error('Historical fixture can only construct v1 packet DATA');");
  policySource=policySource.replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(url(path.resolve(peers,relative))));
  const builderFile=path.join(temporary,'historical-v1-packet-data.mjs');fs.writeFileSync(builderFile,policySource);
  planPolicyFile=path.join(temporary,'historical-v1-selector.mjs');
  fs.writeFileSync(planPolicyFile,'export * from '+JSON.stringify(url(canonicalPolicyFile))+';\nexport {preparePeerOriginMechanicalQaPacketFrom} from '+JSON.stringify(url(builderFile))+';\n');
 }
 const policy=await import(url(canonicalPolicyFile));
 let planSource=fs.readFileSync(path.join(peers,'origin-plan.mjs'),'utf8').replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(relative==='./origin-sidecar-capture.mjs'?url(sidecars):relative==='./origin-mechanical-qa-policy.mjs'?url(planPolicyFile):url(path.resolve(peers,relative))));
 const planFile=path.join(temporary,'plan.mjs');fs.writeFileSync(planFile,planSource);const plan=await import(url(planFile));
 const compact={plugin_version:'0.7.8',governance:'SYNTHETIC complete governance; original UNKNOWN.',governance_sha256:digest('SYNTHETIC complete governance; original UNKNOWN.'),roles:{runner:{instructions:'Original owner.'},qa:{instructions:'Independent SOURCE review.'}},cos_instructions:'SYNTHETIC exact original instructions.'};
 const team=fullTeam?installedTeam():compact,source=originalInventoryFixture(t,{id:'fictional-wire-company',name:'SOURCE only',idea:'Retain original UNKNOWN.',...team,team_sha256:teamHash(team),records:{original:{id:'original',kind:'artifact',status:'Draft',revision:1,content:'Original failed evidence remains exact. 🌍'}},jobs:{old:{id:'old',status:'failed',native_id:'SYNTHETIC-old-unknown',coordination_release:{termination_confirmed:false}}},notices:[{id:'n-original',kind:'decision_required',summary:'Original UNKNOWN 🌍 and spent grant.',resolution:null}],...changes}),{root,file,state,write}=source;
 const expires_at=new Date(Date.now()+3600000).toISOString(),choice={operation_id:'SYNTHETIC-decision',source_instruction:instruction,primary_human_message:message('decision',instruction),expires_at,limits:{max_attempts:1,max_native_calls:1,max_context_utf8_bytes:utf8Limit,timeout_ms:60000},model_selection:{mode:'explicit',model:'synthetic-source-model',reason:'SOURCE only, no live model'}};
 const decision=plan.recordPeerOriginMechanicalQaDecisionAtEpoch(root,actor,9,choice),input={source_instruction:instruction,expires_at,policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:10},maintenance:{scope:'*',source_instruction:instruction,max_model_calls:4,max_review_calls:2},mechanical_qa:{protocol:'peer-origin-mechanical-qa-purpose-v1',purpose:'quarantine-transition-review-only',decision_ref:decision.decision_ref}},planned=plan.recordPeerOriginQuarantinePlanAtEpoch(root,actor,9,input),plan_ref=qaRecordRef(state().records[planned.plan_id]);
 const packetRequest={operation_id:'SYNTHETIC-packet',plan_ref,source_instruction:instruction};
 const f={root,file,actor,epoch:9,plan,policy,policyModuleUrl:url(canonicalPolicyFile),inventory:originalInventory,historical_v1_data_only:legacyV1,choice,decision,input,planned,plan_ref,packetRequest,state,write,
  raw(){const db=new DatabaseSync(file,{readOnly:true});try{const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();return JSON.stringify({schema,rows:Object.fromEntries(schema.filter(s=>s.type==='table').map(s=>[s.name,db.prepare('SELECT * FROM "'+s.name.replaceAll('"','""')+'"').all()]))});}finally{db.close();}},
  prepare(){f.packet=plan.preparePeerOriginMechanicalQaPacketAtEpoch(root,actor,9,packetRequest);return f.packet;},
  grant(){const r={operation_id:'SYNTHETIC-grant',packet_ref:f.packet.packet_ref,source_instruction:instruction,primary_human_message:message('grant','SYNTHETIC exact packet '+f.packet.context_sha256),expires_at};f.grantRequest=r;f.grantReceipt=plan.grantPeerOriginMechanicalQaPacketAtEpoch(root,actor,9,r);return f.grantReceipt;},
  context(){return state().records[f.packet.packet_ref.id].origin_mechanical_qa.context;},
  async loadWorker(){const modules=await loadMechanicalQueueWorkerSource(t,url(canonicalPolicyFile));Object.assign(f,modules);modules.engine.bind(root,actor.session_id,'codex');return modules;},
  queue(){let launches=0;f.engine.dispatchPeerOriginMechanicalReview({root,session_id:actor.session_id,epoch:9,input:{plan_id:planned.plan_id,grant_ref:f.grantReceipt.grant_ref}},'codex',{check:()=>({available:true,authenticated:true,version:'SYNTHETIC'}),catalog:()=>({supported:true,source:'SYNTHETIC',models:[{id:'synthetic-source-model',supported_efforts:[]}],speed_support:{host_default:true}}),launch:()=>{launches++;return {on(){return this;},unref(){}};}});f.launches=(f.launches??0)+launches;return state().records[f.packet.packet_ref.id].origin_mechanical_qa.job.id;}
 };return f;
}
