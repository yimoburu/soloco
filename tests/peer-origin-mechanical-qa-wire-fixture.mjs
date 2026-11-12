// Fictional real-SQLite SOURCE fixture. Only empty sidecar support and complete
// execution inventory are SYNTHETIC. No C/compiler/native/model/provider runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Store,withStore,installedTeam,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {qaRecordRef,qaRawHash} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
import {loadMechanicalQueueWorkerSource} from './origin-mechanical-qa-dispatch-fixture.mjs';
const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),peers=path.join(runtime,'peers'),url=p=>pathToFileURL(p).href;
export const actor={host:'codex',session_id:'11111111-1111-4111-8111-111111111111',native_id:'11111111-1111-4111-8111-111111111111'};
export const instruction='SYNTHETIC fictional source only; no actual founder or native permission.';
const message=(id,quote)=>({host:'codex',chat_id:actor.session_id,turn_id:'SYNTHETIC-turn-'+id,message_id:'SYNTHETIC-message-'+id,content_sha256:qaRawHash(quote),quote});
export async function wireFixture(t,{fullTeam=false,legacyV1=false,utf8Limit=200000,changes={}}={}){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-NEW-wire-source-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const sidecars=path.join(temporary,'SYNTHETIC-empty-sidecars.mjs');fs.writeFileSync(sidecars,"export const captureOriginSidecarContents=()=>[];export const originSidecars=()=>[];export const assertOriginSidecarCaptureSupport=()=>({protocol:'SYNTHETIC-EMPTY-SIDECARS-NOT-NATIVE'});");
 const inventory=path.join(temporary,'SYNTHETIC-inventory.mjs');fs.writeFileSync(inventory,`import {readNormalized} from ${JSON.stringify(url(path.join(runtime,'record-storage.mjs')))};let known=true;export function setKnown(v){known=v;}export function inspectOriginalLocalExecutionInventoryFrom(db){const s=readNormalized(db),occupied=Object.values(s.jobs??{}).filter(j=>['queued','running'].includes(j.status)||j.native_id&&j.coordination_release?.termination_confirmed!==true).length;return {protocol:'original-local-execution-inventory-v1',retained_row_census_complete:true,cardinality_known:known,occupied:known?occupied:null,remaining:known?Math.max(0,3-occupied):null,SYNTHETIC_ONLY:true};}`);
 const policyFile=path.join(temporary,'policy.mjs');let policySource=fs.readFileSync(path.join(peers,'origin-mechanical-qa-policy.mjs'),'utf8');
 if(legacyV1){
  // Exact original v1 preparation semantics from base0d2, SOURCE fixture only.
  const from="const job=packetJob(s,d,p.p,randomUUID()),built=originMechanicalQaAssignmentContext(s,job,a.plan_ref),context=built.context;job.inputs=built.inputs;job.context_sha256=context.sha256;assertOriginMechanicalQaPromptFits(job.task,context.text,ORIGIN_MECHANICAL_QA_WIRE,d.v.request.limits.max_context_utf8_bytes);const utf8_bytes=context.utf8_bytes;const value={protocol:PACKET_V2,";
  const to="const job=packetJob(s,d,p.p,randomUUID()),original=assignmentContext(s,job);job.inputs=original.inputs;job.context_sha256=original.hash;const utf8_bytes=Buffer.byteLength(original.text);need(utf8_bytes<=d.v.request.limits.max_context_utf8_bytes,'ORIGIN_MECHANICAL_QA_CONTEXT_CAPACITY');const context={text:original.text,sha256:original.hash,utf8_bytes};const value={protocol:PACKET,";
  if(!policySource.includes(from))throw Error('Fixture source delta no longer matches');policySource=policySource.replace(from,to);
 }
 policySource=policySource.replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(relative==='./prospective-local-worker-inventory-producer.mjs'?url(inventory):url(path.resolve(peers,relative))));fs.writeFileSync(policyFile,policySource);
 const policy=await import(url(policyFile));
 let planSource=fs.readFileSync(path.join(peers,'origin-plan.mjs'),'utf8').replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(relative==='./origin-sidecar-capture.mjs'?url(sidecars):relative==='./origin-mechanical-qa-policy.mjs'?url(policyFile):url(path.resolve(peers,relative))));
 const planFile=path.join(temporary,'plan.mjs');fs.writeFileSync(planFile,planSource);const plan=await import(url(planFile));
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-NEW-wire-company-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const compact={plugin_version:'0.7.8',governance:'SYNTHETIC complete governance; original UNKNOWN.',governance_sha256:digest('SYNTHETIC complete governance; original UNKNOWN.'),roles:{runner:{instructions:'Original owner.'},qa:{instructions:'Independent SOURCE review.'}},cos_instructions:'SYNTHETIC exact original instructions.'};
 const team=fullTeam?installedTeam():compact,store=new Store(root,true);
 try{store.transaction('fixture.genesis',()=>({schema:2,id:'fictional-wire-company',name:'SOURCE only',idea:'Retain original UNKNOWN.',runtime_version:'0.7.8',...team,team_sha256:teamHash(team),owner:{host:actor.host,session_id:actor.session_id,epoch:9},paused:true,records:{original:{id:'original',kind:'artifact',status:'Draft',revision:1,content:'Original failed evidence remains exact. 🌍'}},jobs:{old:{id:'old',status:'failed',native_id:'SYNTHETIC-old-unknown',coordination_release:{termination_confirmed:false}}},sessions:{},messages:[],notices:[{id:'n-original',kind:'decision_required',summary:'Original UNKNOWN 🌍 and spent grant.',resolution:null}],original_grant:{max_attempts:2,used_attempts:2,expires_at:'2020-01-01T00:00:00.000Z'},...changes}));store.migrate();}finally{store.close();}
 const file=path.join(root,'.company/company.sqlite'),state=()=>withStore(root,s=>s.read()),write=(type,fn)=>withStore(root,s=>s.transaction(type,fn));
 const expires_at=new Date(Date.now()+3600000).toISOString(),choice={operation_id:'SYNTHETIC-decision',source_instruction:instruction,primary_human_message:message('decision',instruction),expires_at,limits:{max_attempts:1,max_native_calls:1,max_context_utf8_bytes:utf8Limit,timeout_ms:60000},model_selection:{mode:'explicit',model:'synthetic-source-model',reason:'SOURCE only, no live model'}};
 const decision=plan.recordPeerOriginMechanicalQaDecisionAtEpoch(root,actor,9,choice),input={source_instruction:instruction,expires_at,policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:10},maintenance:{scope:'*',source_instruction:instruction,max_model_calls:4,max_review_calls:2},mechanical_qa:{protocol:'peer-origin-mechanical-qa-purpose-v1',purpose:'quarantine-transition-review-only',decision_ref:decision.decision_ref}},planned=plan.recordPeerOriginQuarantinePlanAtEpoch(root,actor,9,input),plan_ref=qaRecordRef(state().records[planned.plan_id]);
 const packetRequest={operation_id:'SYNTHETIC-packet',plan_ref,source_instruction:instruction};
 const f={root,file,actor,epoch:9,plan,policy,policyModuleUrl:url(policyFile),inventory:await import(url(inventory)),choice,decision,input,planned,plan_ref,packetRequest,state,write,
  raw(){const db=new DatabaseSync(file,{readOnly:true});try{const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();return JSON.stringify({schema,rows:Object.fromEntries(schema.filter(s=>s.type==='table').map(s=>[s.name,db.prepare('SELECT * FROM "'+s.name.replaceAll('"','""')+'"').all()]))});}finally{db.close();}},
  prepare(){f.packet=plan.preparePeerOriginMechanicalQaPacketAtEpoch(root,actor,9,packetRequest);return f.packet;},
  grant(){const r={operation_id:'SYNTHETIC-grant',packet_ref:f.packet.packet_ref,source_instruction:instruction,primary_human_message:message('grant','SYNTHETIC exact packet '+f.packet.context_sha256),expires_at};f.grantRequest=r;f.grantReceipt=plan.grantPeerOriginMechanicalQaPacketAtEpoch(root,actor,9,r);return f.grantReceipt;},
  context(){return state().records[f.packet.packet_ref.id].origin_mechanical_qa.context;},
  async loadWorker(){const modules=await loadMechanicalQueueWorkerSource(t,url(policyFile));Object.assign(f,modules);modules.engine.bind(root,actor.session_id,'codex');return modules;},
  queue(){let launches=0;f.engine.dispatchPeerOriginMechanicalReview({root,session_id:actor.session_id,epoch:9,input:{plan_id:planned.plan_id,grant_ref:f.grantReceipt.grant_ref}},'codex',{check:()=>({available:true,authenticated:true,version:'SYNTHETIC'}),catalog:()=>({supported:true,source:'SYNTHETIC',models:[{id:'synthetic-source-model',supported_efforts:[]}],speed_support:{host_default:true}}),launch:()=>{launches++;return {on(){return this;},unref(){}};}});f.launches=(f.launches??0)+launches;return state().records[f.packet.packet_ref.id].origin_mechanical_qa.job.id;}
 };return f;
}
