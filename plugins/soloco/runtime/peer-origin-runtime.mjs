// Trusted public SOURCE adapter. The engine supplies the current managed-hook
// gate; HOST ingress supplies identity. JSON is bounded DATA, never authority.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonical,peerDigest} from './peers/ledger.mjs';
import {owner as requireLegacyOwner} from './store.mjs';
import {readNormalized,readNormalizedValue} from './record-storage.mjs';
import {requireCodexRootActor} from './mcp-host-context.mjs';
import {withPeerPublicStorage} from './peer-owner-runtime.mjs';
import {authenticateLegacyOwner,legacyEncodedReplyBytes} from './peers/legacy-origin.mjs';
import {assertPeerPublicOwnerCustody} from './peers/owner-handover.mjs';
import * as planSource from './peers/origin-plan.mjs';
import * as quarantine from './peers/origin-quarantine.mjs';
import * as maintenance from './peers/origin-maintenance.mjs';

const MAX_REPLY=24576,MAX_REQUEST=100000;
const FRONTIER_URL=new URL('./peers/input-frontier-maintenance.mjs',import.meta.url);
const SEAL_URL=new URL('./peers/origin-frontier-seal.mjs',import.meta.url);
const LAUNCH_URL=new URL('./peers/maintenance-launch.mjs',import.meta.url);
const ENGINE_URL=new URL('./engine.mjs',import.meta.url);
const AUTHORITY_URL=new URL('./peers/origin-maintenance-authority.mjs',import.meta.url);
const MECHANICAL_URL=new URL('./peers/origin-mechanical-qa-policy.mjs',import.meta.url);
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const need=(value,code,message)=>{if(!value)fail(code,message);};
const same=(a,b)=>canonical(a)===canonical(b);
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
const str=max=>({type:'string',minLength:1,maxLength:max});
const integer=(minimum=1,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const sha={...str(64),pattern:'^[a-f0-9]{64}$'};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const ref=object({family:{enum:['work_items']},id:str(2000),revision:integer(),sha256:sha});
const strings={type:'array',minItems:1,maxItems:1,items:str(2000)};
const range={sha256:sha,offset:integer(0),length:integer(1,4096)};
const section={enum:['sources','archive','schema','sidecars','events','original_sources','projection']};
const policy=object({worker_cap:integer(1,3),queue_limit:integer(1,1000),principal_queue_limit:integer(1,1000),max_context_bytes:integer(512,65536),max_model_calls:integer()});
const budgets=object({scope:{enum:['*']},source_instruction:str(4000),max_model_calls:integer(2),max_review_calls:integer()});
const frontier=object({protocol:{enum:['peer-origin-input-frontier-v1']},max_model_calls:integer(),max_review_calls:integer()});
const frontierSeal=object({protocol:{enum:['peer-origin-frontier-seal-purpose-v1']},purpose:{enum:['bounded-preparation-bootstrap']},max_reviews:integer()});
const segment=object({source_id:str(2000),sha256:sha,offset:integer(0),length:integer()});
const legacyRef=object({id:str(200),revision:integer(),sha256:sha});
const primaryMessage=object({host:{enum:['codex']},chat_id:str(300),turn_id:str(300),message_id:str(300),content_sha256:sha,quote:str(20000)});
const mechanicalLimits=object({max_attempts:{enum:[1]},max_native_calls:integer(1,17),max_context_utf8_bytes:integer(512,200000),timeout_ms:integer(1000,600000)});
const mechanicalModel=object({mode:{enum:['explicit']},model:{...str(128),pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'},reason:str(300),effort:{enum:['none','minimal','low','medium','high','xhigh','max','ultra']},speed:{enum:['host_default']}},['mode','model','reason']);
const mechanicalPurpose=object({protocol:{enum:['peer-origin-mechanical-qa-purpose-v1']},purpose:{enum:['quarantine-transition-review-only']},decision_ref:legacyRef});
const mechanicalActions=Object.freeze({mechanical_decision:'recordPeerOriginMechanicalQaDecisionAtEpoch',mechanical_packet:'preparePeerOriginMechanicalQaPacketAtEpoch',mechanical_grant:'grantPeerOriginMechanicalQaPacketAtEpoch',mechanical_packet_inspect:'inspectPeerOriginMechanicalQaPacketAtEpoch',mechanical_packet_read:'readPeerOriginMechanicalQaPacketAtEpoch'});
const fields={
 status:object({}),
 plan:object({expires_at:str(100),policy,maintenance:budgets,frontier,frontier_seal:frontierSeal,mechanical_qa:mechanicalPurpose},['expires_at','policy','maintenance']),
 plan_inspect:object({plan_id:str(2000)}),plan_read:object({plan_id:str(2000),...range}),
 mechanical_decision:object({operation_id:str(160),primary_human_message:primaryMessage,expires_at:str(100),limits:mechanicalLimits,model_selection:mechanicalModel}),
 mechanical_packet:object({operation_id:str(160),plan_ref:legacyRef}),
 mechanical_grant:object({operation_id:str(160),packet_ref:legacyRef,primary_human_message:primaryMessage,expires_at:str(100)}),
 mechanical_packet_inspect:object({packet_ref:legacyRef}),mechanical_packet_read:object({packet_ref:legacyRef,...range}),
 mechanical_review:object({plan_id:str(2000),grant_ref:legacyRef}),mechanical_preflight:object({plan_id:str(2000),review_ids:strings}),
 quarantine:object({plan_id:str(2000),review_ids:strings}),
 manifest_inspect:object({section,page:integer(0)},['section']),manifest_read:object({section,page:integer(0),...range},['section','sha256','offset','length']),
 source_read:object({source_id:str(2000),...range}),observe_sidecars:object({}),
 maintenance_status:object({}),maintenance_operation:object({operation_id:str(160)}),
 maintenance_run:object({operation_id:str(160),kind:{enum:['peer-origin-reconstruction','peer-origin-review']},segments:{type:'array',minItems:1,maxItems:64,items:segment},reconstruction_ref:ref},['operation_id','kind','segments']),
 range_seal:object({qualification_refs:{type:'array',minItems:1,maxItems:10000,items:ref}}),
 frontier_capture:object({operation_id:str(160)}),frontier_inspect:object({frontier_id:str(2000)}),
 frontier_run:object({operation_id:str(160),frontier_id:str(2000),node_id:str(2000),stage:{enum:['produce','review']}}),
 frontier_sources:object({frontier_ref:ref,source_vector_sha256:sha,offset:integer(0),limit:integer(1,8)}),
 frontier_source_read:object({frontier_ref:ref,source_id:str(2000),...range}),
 frontier_archive_read:object({frontier_ref:ref,...range}),
 final_seal_review:object({operation_id:str(160),frontier_ref:ref,root_result_ref:ref}),final_seal_apply:object({review_ref:ref})
};
const sourceActions=new Set(['plan','mechanical_decision','mechanical_packet','mechanical_grant','mechanical_review','quarantine','observe_sidecars','maintenance_run','range_seal','frontier_capture','frontier_run','final_seal_review','final_seal_apply']);
const mutatingPeerActions=new Set(['observe_sidecars','maintenance_run','range_seal','frontier_capture','frontier_run','final_seal_review','final_seal_apply']);
const union=Object.assign({},...Object.values(fields).map(s=>s.properties));
export const peerOriginToolSchema=Object.freeze({name:'company_origin',description:'Checked original origin plan/mechanical review/quarantine and bounded peer-origin retrieval through the actual root HOST caller and current managed-hook. Original current owner/epoch, typed custody, genuine review, fixed native source, finite purpose, context and physical fences remain required. No caller actor/provider/launch/native proof/readiness flag. Missing supported producers Hold before admission; reading never selects a policy or grants authority.',inputSchema:object({root:str(4000),session_id:str(200),epoch:integer(),action:{enum:Object.keys(fields)},source_instruction:str(4000),input:object(union,[])},['root','session_id','epoch','action'])});
function rule(value,schema){
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(schema.type==='string')return text(value,schema.maxLength)&&value.length>=schema.minLength&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(schema.type==='integer')return Number.isSafeInteger(value)&&value>=schema.minimum&&value<=schema.maximum;
 if(schema.type==='array')return Array.isArray(value)&&value.length>=(schema.minItems??0)&&value.length<=schema.maxItems&&value.every(v=>rule(v,schema.items));
 if(schema.type==='object')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&rule(value[k],schema.properties[k]))&&schema.required.every(k=>Object.hasOwn(value,k));
 return true;
}
export function validatePeerOriginRequest(request,host){
 const args=planSource.originSafeData(request);
 need(['codex','claude'].includes(host)&&rule(args,peerOriginToolSchema.inputSchema)&&path.isAbsolute(args.root),'ORIGIN_PUBLIC_INPUT');
 need(rule(args.input??{},fields[args.action]),'ORIGIN_PUBLIC_INPUT');
 need(!sourceActions.has(args.action)||text(args.source_instruction,4000),'ORIGIN_PUBLIC_INSTRUCTION_REQUIRED');
 need(!args.input?.operation_id||args.input.operation_id===args.input.operation_id.trim(),'ORIGIN_PUBLIC_INPUT');
 need(Buffer.byteLength(canonical(args))<=MAX_REQUEST,'ORIGIN_PUBLIC_INPUT');return args;
}
const bounded=value=>{need(legacyEncodedReplyBytes(value)<=MAX_REPLY,'ORIGIN_PUBLIC_REPLY_CAPACITY');return value;};
const rowRef=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const split=(s,n)=>n>0&&n<s.length&&/[\uD800-\uDBFF]/.test(s[n-1])&&/[\uDC00-\uDFFF]/.test(s[n]);
function rangeReply(body,input,metadata){
 need(input.sha256===hash(body),'ORIGIN_PUBLIC_SOURCE_CHANGED');
 need(input.offset<body.length&&!split(body,input.offset),'ORIGIN_PUBLIC_RANGE');
 let end=Math.min(body.length,input.offset+input.length);if(split(body,end))end--;
 for(;;){
  need(end>input.offset,'ORIGIN_PUBLIC_RANGE');
  const result={protocol:'peer-origin-public-exact-range-v1',...metadata,sha256:input.sha256,offset:input.offset,length:end-input.offset,text:body.slice(input.offset,end),total_characters:body.length,next_offset:end===body.length?null:end,complete:end===body.length,qualification_by_read:false};
  if(legacyEncodedReplyBytes(result)<=MAX_REPLY)return result;
  end=input.offset+Math.floor((end-input.offset)/2);if(split(body,end))end--;
 }
}
function legacyHead(db,args,host){
 authenticateLegacyOwner(db,args,host);
 const state=readNormalized(db,{rootKeys:['id','owner','paused','schema','runtime_version','plugin_version','team_sha256','governance','governance_sha256','cos_instructions','roles','upgrade','handover'],entities:{},validateKeys:false});
 requireLegacyOwner(state,args.session_id,host,args.epoch);
 need(text(state.id,2000)&&same(state.owner,{host,session_id:args.session_id,epoch:args.epoch}),'ORIGIN_PUBLIC_OWNER_REQUIRED');
 need(!state.handover||state.handover.status==='completed','ORIGIN_LEGACY_HANDOVER_UNQUALIFIED');return state;
}
function legacyPlan(db,args,host,planId){
 const state=legacyHead(db,args,host),selected=readNormalized(db,{rootKeys:[],entities:{records:[planId]},validateKeys:false}),record=selected.records?.[planId],p=record?.origin_quarantine_plan;
 need(record?.id===planId&&record.kind==='plan'&&record.status==='Draft'&&record.author_role==='cos'&&record.author_instance===args.session_id&&record.revision===1&&p?.protocol===planSource.ORIGIN_PLAN_PROTOCOL&&p.plan_id===planId&&p.company_id===state.id&&same(p.owner,state.owner)&&same(p.actor,{host,session_id:args.session_id,native_id:args.session_id})&&record.content===canonical(p),'ORIGIN_PLAN_CHANGED');
 const raw=readNormalizedValue(db,{family:'records',key:planId});need(raw&&Buffer.byteLength(raw.raw)<=planSource.ORIGIN_LIMITS.value_bytes,'ORIGIN_PLAN_CAPACITY');
 return {state,record,plan:p,body:canonical(record),storage_ref:{family:'records',key:planId,sha256:raw.sha256}};
}
function peerOwner(tx,ledger,args,actor){
 const c=tx.get('control','company'),p=c&&tx.get('principals',c.value.founder_principal_id),o=p?.value.legacy_owner;
 need(c?.value.protocol==='peer-cos-v1'&&p?.value.kind==='founder'&&['active','pending'].includes(p.value.status)&&p.value.host===actor.host&&p.value.native_id===actor.native_id&&o?.host===actor.host&&o.session_id===actor.session_id&&o.epoch===args.epoch,'ORIGIN_PUBLIC_OWNER_REQUIRED');
 assertPeerPublicOwnerCustody({...tx,connection:{root:ledger.root,directory:ledger.directory,company_id:ledger.company_id}});
 return {c,p};
}
async function fixedModule(url,code){
 let stat;try{stat=fs.lstatSync(fileURLToPath(url));}catch(error){if(error.code==='ENOENT')fail(code);throw error;}
 need(stat.isFile()&&!stat.isSymbolicLink(),code);
 // A PRESENT entry's own, transitive or provider exception is never recast as
 // an unavailable entry, even with a matching ERR_MODULE_NOT_FOUND/code/url.
 return import(url.href);
}
async function fixedLaunch(name){const module=await fixedModule(LAUNCH_URL,'ORIGIN_NATIVE_LAUNCH_SOURCE_UNAVAILABLE');need(typeof module[name]==='function','ORIGIN_NATIVE_LAUNCH_SOURCE_UNAVAILABLE');return module[name];}
async function selectedMaintenance(ledger,args,actor){
 const module=await fixedModule(AUTHORITY_URL,'ORIGIN_SELECTED_MAINTENANCE_SOURCE_UNAVAILABLE');
 need(typeof module.assertPeerOriginSelectedMaintenanceFrom==='function','ORIGIN_SELECTED_MAINTENANCE_SOURCE_UNAVAILABLE');
 // Observational outer preflight only. Original factories/capabilities retain
 // their per-use checks, including the SAME original selected pause generation.
 return ledger.read(tx=>{peerOwner(tx,ledger,args,actor);return module.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:ledger.company_id});});
}
function recordPointer(row){return {tool:'company_owner',action:'context_read',input:{...rowRef('control',row),offset:0,length:4096}};}
function peerStatus(tx,ledger){
 const c=tx.get('control','company'),o=tx.get('control','origin');
 if(o)need(o.value.protocol===quarantine.ORIGIN_QUARANTINE_PROTOCOL&&same(c.value.origin,rowRef('control',o))&&o.value.manifest&&Object.values(o.value.manifest).every(v=>v&&Number.isSafeInteger(v.count)&&v.count>=0&&Array.isArray(v.pages)),'ORIGIN_QUARANTINE_CHANGED');
 return bounded({protocol:'peer-origin-public-status-v1',storage_layout:5,company_id:ledger.company_id,paused:c.value.paused,origin:o?{reference:rowRef('control',o),protocol:o.value.protocol,status:o.value.status,manifest:Object.fromEntries(Object.entries(o.value.manifest??{}).map(([key,value])=>[key,{items:value.count,pages:value.pages.length}])),seal_ref:o.value.seal_ref??null,late_obligations:o.value.late_obligation_refs?.length??0,read:recordPointer(o)}:null,ordinary_authority:false,execution_resumed:false,qualification:'Status and exact retrieval do not establish native qualification, policy selection or permission.'});
}
function manifest(tx,input){const value=quarantine.readPeerOriginManifestFrom(tx,{section:input.section,page:input.page??0}),body=canonical(value);return {value,body,sha256:hash(body)};}
function exactBoundedRead(read,input,key='length'){
 let size=input[key];
 for(;;){const result=read({...input,[key]:size});if(legacyEncodedReplyBytes(result)<=MAX_REPLY)return result;need(size>1,'ORIGIN_PUBLIC_REPLY_CAPACITY');size=Math.max(1,Math.floor(size/2));}
}
function returned(result,args,extra={}){
 if(legacyEncodedReplyBytes(result)<=MAX_REPLY)return result;
 return bounded({protocol:'peer-origin-operation-returned-v1',action:args.action,operation_returned:true,result_not_inlined:true,...(args.input?.operation_id?{operation_id:args.input.operation_id}:{}),...extra,retrieval:{tool:'company_origin',action:'status',epoch:args.epoch},note:'Inspect persisted origin state; do not repeat a mutation or native admission for presentation. This receipt establishes no acceptance or authority.'});
}

// Fixed request DATA only; no dispatch happened. The engine's dedicated source
// wrapper must revalidate eligibility/max-one-attempt in its queue transaction.
export async function preparePeerOriginMechanicalReviewRequest(request,host){
 const args=validatePeerOriginRequest(request,host);need(args.action==='mechanical_review','ORIGIN_PUBLIC_INPUT');requireCodexRootActor({host,session_id:args.session_id});
 return withPeerPublicStorage(args.root,true,async where=>{
  need(where.kind==='legacy','ORIGIN_LAYOUT4_REQUIRED');where.db.exec('BEGIN');
  const {plan:p,state}=legacyPlan(where.db,args,host,args.input.plan_id);need(state.paused===true&&Date.parse(p.expires_at)>Date.now(),'ORIGIN_PLAN_EXPIRED');
  const source=await fixedModule(MECHANICAL_URL,'ORIGIN_MECHANICAL_QA_SOURCE_UNAVAILABLE');
  need(typeof source.preparePeerOriginMechanicalQaDispatchFrom==='function','ORIGIN_MECHANICAL_QA_SOURCE_UNAVAILABLE');
  const prepared=source.preparePeerOriginMechanicalQaDispatchFrom(where.db,readNormalized(where.db),{expected_epoch:args.epoch,grant_ref:args.input.grant_ref});
  need(prepared.plan_ref?.id===p.plan_id,'ORIGIN_MECHANICAL_QA_PLAN_CHANGED');
  return bounded({protocol:'peer-origin-mechanical-dispatch-request-v1',planned_not_dispatched:true,plan_id:p.plan_id,plan_sha256:peerDigest(p),cut_sha256:p.cut_sha256,
   grant_ref:args.input.grant_ref,packet_ref:prepared.packet_ref,context_sha256:prepared.context.sha256,context_utf8_bytes:prepared.context.utf8_bytes,deadline_at_ms:prepared.deadline_at_ms,
   arguments:{root:args.root,session_id:args.session_id,epoch:args.epoch,input:{plan_id:p.plan_id,grant_ref:args.input.grant_ref}},
   required_dispatch_guard:'Revalidate the exact original decision, packet, grant and execution inventory inside the owning queue write; retain its original private reservation receipt for the LAST commit fence. This DATA alone cannot enqueue.'});
 });
}

export async function peerOriginRuntimeAction(request,host){
 const args=validatePeerOriginRequest(request,host),actor=requireCodexRootActor({host,session_id:args.session_id}),input=args.input??{};
 if(args.action==='mechanical_review'){
  await preparePeerOriginMechanicalReviewRequest(args,host);
  const engine=await fixedModule(ENGINE_URL,'ORIGIN_MECHANICAL_DISPATCH_SOURCE_UNAVAILABLE');need(typeof engine.dispatchPeerOriginMechanicalReview==='function','ORIGIN_MECHANICAL_DISPATCH_SOURCE_UNAVAILABLE');
  return returned(await engine.dispatchPeerOriginMechanicalReview({root:args.root,session_id:args.session_id,epoch:args.epoch,input:{plan_id:input.plan_id,grant_ref:input.grant_ref}},host),args);
 }
 if(Object.hasOwn(mechanicalActions,args.action)){
  await withPeerPublicStorage(args.root,true,where=>{need(where.kind==='legacy','ORIGIN_LAYOUT4_REQUIRED');where.db.exec('BEGIN');legacyHead(where.db,args,host);});
  const name=mechanicalActions[args.action];need(typeof planSource[name]==='function','ORIGIN_MECHANICAL_QA_SOURCE_UNAVAILABLE');
  const read=args.action==='mechanical_packet_read',historical=args.action==='mechanical_packet_inspect'||read;
  const invoke=value=>{const result=planSource[name](args.root,actor,args.epoch,historical?value:{...value,source_instruction:args.source_instruction});return read?{...result,next_offset:result.complete?null:result.offset+result.length}:result;};
  return read?exactBoundedRead(invoke,input):returned(await invoke(input),args);
 }
 if(['plan','mechanical_preflight','quarantine'].includes(args.action)){
  await withPeerPublicStorage(args.root,true,where=>{need(where.kind==='legacy','ORIGIN_LAYOUT4_REQUIRED');where.db.exec('BEGIN');legacyHead(where.db,args,host);if(args.action!=='plan')legacyPlan(where.db,args,host,input.plan_id);});
  if(args.action==='plan'){
   need(typeof planSource.recordPeerOriginQuarantinePlanAtEpoch==='function','ORIGIN_PUBLIC_PLAN_EPOCH_PRODUCER_UNAVAILABLE');
   return returned(await planSource.recordPeerOriginQuarantinePlanAtEpoch(args.root,actor,args.epoch,{...input,source_instruction:args.source_instruction}),args);
  }
  if(args.action==='mechanical_preflight')return planSource.withOriginLegacyStore(args.root,actor,store=>store.readSnapshot(()=>{
   authenticateLegacyOwner(store.db,args,host);need(typeof planSource.validateSelectedPeerOriginMechanicalReviewAtEpoch==='function','ORIGIN_MECHANICAL_QA_SOURCE_UNAVAILABLE');const checked=planSource.validateSelectedPeerOriginMechanicalReviewAtEpoch(store,input,actor,args.epoch);
   need(checked.plan.owner.epoch===args.epoch,'ORIGIN_PUBLIC_OWNER_REQUIRED');
   return bounded({protocol:'peer-origin-mechanical-preflight-v1',plan_id:checked.plan.plan_id,plan_sha256:peerDigest(checked.plan),cut_sha256:checked.current.sha256,review_ids:input.review_ids,observed:checked.observed,mechanical_preflight_passed:true,quarantine_requires_current_revalidation:true,execution_resumed:false,authority_issued:false});
  }));
  need(typeof quarantine.quarantinePeerOriginAtEpoch==='function','ORIGIN_PUBLIC_QUARANTINE_EPOCH_PRODUCER_UNAVAILABLE');
  const result=quarantine.quarantinePeerOriginAtEpoch(args.root,actor,args.epoch,{...input,source_instruction:args.source_instruction});
  // Apply has crossed the layout fence. Reopen through the strict H5 path,
  // never through the legacy Store, and project the original persisted row.
  // An oversized backup manifest is available by exact current row reference;
  // presentation must never cause another apply/backup/admission.
  return withPeerPublicStorage(args.root,true,where=>{
   need(where.kind==='peer','ORIGIN_POST_APPLY_LAYOUT_CHANGED');
   return where.ledger.read(tx=>{
    peerOwner(tx,where.ledger,args,actor);const row=tx.get('control','origin');
    need(row&&same(result.origin_ref,rowRef('control',row)),'ORIGIN_POST_APPLY_SOURCE_CHANGED');
    return bounded({protocol:'peer-origin-applied-receipt-v1',status:result.status,company_id:where.ledger.company_id,origin_ref:rowRef('control',row),persisted:true,legacy_writers_fenced:result.legacy_writers_fenced,execution_resumed:false,backup:{protocol:row.value.backup.protocol,sha256:row.value.backup.sha256,manifest_sha256:row.value.backup.manifest_sha256,cut_sha256:row.value.backup.cut_sha256,files_count:row.value.backup.files.length},full_origin_record:recordPointer(row),authority_issued:false});
   });
  });
 }
 return withPeerPublicStorage(args.root,!mutatingPeerActions.has(args.action),async where=>{
  if(where.kind==='legacy'){
   where.db.exec('BEGIN');const state=legacyHead(where.db,args,host);
   if(args.action==='status')return bounded({protocol:'peer-origin-public-status-v1',storage_layout:4,company_id:state.id,owner:state.owner,paused:state.paused,quarantine_applied:false,read_only:true});
   need(['plan_inspect','plan_read'].includes(args.action),'ORIGIN_PEER_QUARANTINE_REQUIRED');
   const selected=legacyPlan(where.db,args,host,input.plan_id),metadata={plan_id:input.plan_id,representation:'canonical-origin-plan-record-v1',storage_reference:selected.storage_ref};
   if(args.action==='plan_read')return rangeReply(selected.body,input,metadata);
   return bounded({protocol:'peer-origin-plan-source-v1',...metadata,plan_sha256:peerDigest(selected.plan),cut_sha256:selected.plan.cut_sha256,expires_at:selected.plan.expires_at,sha256:hash(selected.body),total_characters:selected.body.length,utf8_bytes:Buffer.byteLength(selected.body),read:{tool:'company_origin',action:'plan_read',input:{plan_id:input.plan_id,sha256:hash(selected.body),offset:0,length:4096}},authority_issued:false});
  }
  const {ledger}=where;ledger.read(tx=>peerOwner(tx,ledger,args,actor));
  need(!['plan_inspect','plan_read'].includes(args.action),'ORIGIN_LAYOUT4_REQUIRED');
  if(args.action==='status')return ledger.read(tx=>{peerOwner(tx,ledger,args,actor);return peerStatus(tx,ledger);});
  if(['manifest_inspect','manifest_read','source_read'].includes(args.action))return ledger.read(tx=>{
   peerOwner(tx,ledger,args,actor);
   if(args.action==='source_read')return exactBoundedRead(selected=>quarantine.readPeerOriginSourceFrom(tx,selected),input);
   const {value,body,sha256}=manifest(tx,input);
   if(args.action==='manifest_read')return rangeReply(body,input,{origin_ref:value.origin_ref,section:value.section,page:value.page});
   return bounded({protocol:'peer-origin-manifest-source-v1',origin_ref:value.origin_ref,section:value.section,page:value.page,total_items:value.total_items,next_page:value.next_page,sha256,total_characters:body.length,utf8_bytes:Buffer.byteLength(body),read:{tool:'company_origin',action:'manifest_read',input:{section:value.section,page:value.page,sha256,offset:0,length:4096}},qualification_by_read:false});
  });
  if(args.action==='observe_sidecars')return returned(quarantine.observePeerOriginSidecars(ledger,actor),args);
  if(['maintenance_status','maintenance_operation','maintenance_run','range_seal'].includes(args.action)){
   const run=args.action==='maintenance_run'?await fixedLaunch('runOriginalPeerOriginMaintenance'):null;
   if(run)need(typeof maintenance.originalPeerOriginMaintenanceLedger==='function','ORIGIN_ORIGINAL_API_LEDGER_UNAVAILABLE');
   if(run||args.action==='range_seal')await selectedMaintenance(ledger,args,actor);
   const api=maintenance.createPeerOriginMaintenance({ledger,actor});
   if(args.action==='maintenance_status')return returned(api.inspect(),args);
   if(args.action==='maintenance_operation')return returned(maintenance.inspectPeerOriginMaintenanceOperation(api,input),args);
   if(run)return returned(await run(api,input),args);
   return returned(maintenance.sealPeerOrigin(api,{...input,source_instruction:args.source_instruction}),args);
  }
  const isSeal=args.action.startsWith('final_seal_'),module=await fixedModule(isSeal?SEAL_URL:FRONTIER_URL,isSeal?'ORIGIN_FRONTIER_SEAL_SOURCE_UNAVAILABLE':'ORIGIN_INPUT_FRONTIER_SOURCE_UNAVAILABLE');
  if(['frontier_sources','frontier_source_read','frontier_archive_read'].includes(args.action)){
   const name={frontier_sources:'inspectPeerInputFrontierSourcesFrom',frontier_source_read:'readPeerInputFrontierSourceFrom',frontier_archive_read:'readPeerInputLegacyArchiveFrom'}[args.action];need(typeof module[name]==='function','ORIGIN_INPUT_FRONTIER_SOURCE_UNAVAILABLE');
   return ledger.read(tx=>{peerOwner(tx,ledger,args,actor);return exactBoundedRead(selected=>module[name](tx,selected),input,args.action==='frontier_sources'?'limit':'length');});
  }
  const factory=isSeal?'createPeerOriginFrontierSeal':'createPeerInputFrontierMaintenance';need(typeof module[factory]==='function','ORIGIN_SOURCE_FACTORY_UNAVAILABLE');
  let run=null;if(args.action==='frontier_run')run=await fixedLaunch('runOriginalPeerInputFrontier');if(args.action==='final_seal_review')run=await fixedLaunch('runOriginalPeerOriginFrontierSealReview');
  if(run||args.action==='frontier_capture'||args.action==='final_seal_apply')await selectedMaintenance(ledger,args,actor);
  const api=module[factory]({ledger,actor});
  if(run)return returned(await run(api,input),args);
  if(args.action==='frontier_capture')return returned(api.capture({...input,source_instruction:args.source_instruction}),args);
  if(args.action==='frontier_inspect')return returned(api.inspect(input),args);
  need(args.action==='final_seal_apply'&&typeof module.sealPeerOriginFromCheckedFrontier==='function','ORIGIN_PUBLIC_ACTION_HELD');return returned(module.sealPeerOriginFromCheckedFrontier(api,{...input,source_instruction:args.source_instruction}),args);
 });
}
