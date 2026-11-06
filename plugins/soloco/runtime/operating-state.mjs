// Prospective only. Canonical classifications remain the preservation authority.
import {producerClosure} from './scoped-context.mjs';
import {hasSnapshotReferences} from './snapshot.mjs';
import {digest,id,stamp} from './store.mjs';
import {reviewedContext,recordReference,contextSource,currentExtensions,proofJobSafe} from './current-state.mjs';
import {mechanicalOperatingControl} from './operating-control.mjs';
const sha=v=>digest(JSON.stringify(v));
export const OPERATING_PROTOCOL='operating-state-v1';
const fail=m=>{throw Error('Operating state Held: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=v=>typeof v==='string'&&v.trim().length>0;
const list=v=>Array.isArray(v)&&v.every(text);
export function validateOperatingRecord(v){
  const common=['version','kind','scope','owner','conditions','exceptions','clearing','expires_at','dependencies','authority_refs','evidence_refs'];
  const kinds=['objective','rule','obligation','permission','outcome','work'];
  if(!v||v.version!==1||!kinds.includes(v.kind)||!['scope','owner','conditions','exceptions','clearing'].every(k=>text(v[k]))||!list(v.dependencies)||!list(v.authority_refs)||!list(v.evidence_refs)||!v.evidence_refs.length)fail('complete typed conditions, exceptions, clearing and provenance required');
  if(v.expires_at!==null&&!Number.isFinite(Date.parse(v.expires_at)))fail('explicit null or valid expiry required');
  const extra=v.kind==='permission'?['grant_refs','remaining','revoked']:v.kind==='outcome'?['attempted_action','resources','possible_effects','uncertainty','retry_clearing','historical_receipts']:[];
  if(Object.keys(v).some(k=>![...common,...extra].includes(k)))fail('unknown operating record extension');
  if(v.kind==='permission'&&(!list(v.grant_refs)||!v.grant_refs.length||!Number.isSafeInteger(v.remaining)||v.remaining<0||typeof v.revoked!=='boolean'))fail('permission must retain canonical grant refs, remaining allowance and revocation');
  if(v.kind==='outcome'&&(!['attempted_action','possible_effects','uncertainty','retry_clearing'].every(k=>text(v[k]))||!list(v.resources)||!v.resources.length||!list(v.historical_receipts)||!v.historical_receipts.length))fail('complete attempted action/resources/effects/uncertainty/retry conditions and historical receipts required');
  return structuredClone(v);
}
function controls(s){const {operating_state,...rest}=s;return {company_id:s.id,idea:s.idea,team_sha256:s.team_sha256,governance:s.governance,cos_instructions:s.cos_instructions,roles:s.roles,mode:s.mode,phase:s.phase,upgrade:s.upgrade??null,extensions:currentExtensions(rest)};}
function exact(s,r){const v=contextSource(s,r.id);if(!v||!same(recordReference(v,r.id),r))fail('source/receipt changed: '+r.id);return v;}
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
function reviewJobSafe(j,handover=false){
  const {handover_reads,...base}=j;
  if(!proofJobSafe(handover?base:j))return false;
  if(handover_reads!==undefined&&(!handover||!Array.isArray(handover_reads)||!handover_reads.every(r=>closed(r,['session_id','source_id','sha256','offset','end','total','range_sha256','subject_sha256'])&&Object.values(r).every(v=>typeof v==='string'||Number.isSafeInteger(v)))))return false;
  return j.role==='qa'&&['queued','running','completed'].includes(j.status);
}
function reviewRecordSafe(r,j,t,handover){
  if(!closed(r,['id','kind','content','author_role','author_instance','revision','status','job_id','inputs','retrieved_inputs','review_of','review','created_at',...(handover?['handover_evidence']:[])])||r.kind!=='review'||r.status!=='Submitted'||r.author_role!=='qa'||r.author_instance!==j.instance_id||r.job_id!==j.id||j.artifact_id!==r.id||j.status!=='completed'||!j.native_id||[t.author_instance,safeOwner(t)].includes(j.native_id)||r.author_instance===t.author_instance||!same(r.review_of,{id:t.id,revision:t.revision})||j.coordination_release?.termination_confirmed!==true)return false;
  for(const key of ['inputs','retrieved_inputs'])if(r[key]!==undefined&&(!Array.isArray(r[key])||!r[key].every(ref=>closed(ref,key==='inputs'?['id','revision']:['id','revision','sha256','offset','length','total_characters'])&&Object.values(ref).every(v=>v===null||typeof v==='string'||Number.isSafeInteger(v)))))return false;
  const v=r.review;
  if(!closed(v,['verdict','reason','permitted_action','blockers',...(handover?['subject_sha256']:['plan_sha256','preservation_complete','interaction_complete','authority_checked'])])||v.verdict!=='Pass'||!Array.isArray(v.blockers)||v.blockers.length)return false;
  if(!handover)return v.permitted_action==='publish_operating_state'&&v.plan_sha256===sha(t.operating_plan)&&v.preservation_complete===true&&v.interaction_complete===true&&v.authority_checked===true;
  const e=r.handover_evidence;
  return v.permitted_action==='resume_handover'&&v.subject_sha256===t.handover.subject_sha256&&closed(e,['semantic_delivery_complete','subject_sha256','reconstruction_sha256','native_id','citations','reads'])&&e.semantic_delivery_complete===true&&e.subject_sha256===t.handover.subject_sha256&&e.reconstruction_sha256===sha(t)&&e.native_id===j.native_id&&same(e.reads,j.handover_reads)&&Array.isArray(e.citations)&&e.citations.every(c=>closed(c,['source_id','sha256','revision','offset','length','range_sha256']));
}
const safeOwner=t=>t.operating_plan?.snapshot.owner.session_id??t.handover?.incoming_owner?.session_id;
function bookkeeping(s,planId){
  const ids=new Set(),jobs=new Set();
  const add=p=>{
    const t=s.records?.[p];if(!t)return;ids.add(p);
    const handover=t.handover?.evidence_protocol===4;
    const candidates=Object.values(s.jobs??{}).filter(j=>j.epoch===s.owner.epoch&&same(j.review_of,{id:t.id,revision:t.revision})&&reviewJobSafe(j,handover));
    // Only a single current execution may be mechanically self-referential.
    const active=candidates.filter(j=>['queued','running'].includes(j.status));
    if(active.length===1&&((p===planId&&p!==s.operating_state?.plan.id)||(handover&&s.handover?.status==='pending')))jobs.add(active[0].id);
    const proofs=candidates.filter(j=>{const r=s.records[j.artifact_id];return r&&reviewRecordSafe(r,j,t,handover);});
    const accepted=s.operating_state?.plan.id===p?s.operating_state.review.id:null;
    for(const j of proofs)if(accepted?j.artifact_id===accepted:proofs.length===1){jobs.add(j.id);ids.add(j.artifact_id);}
  };
  add(planId);
  const h=s.handover,t=s.records?.[h?.reconstruction_id];if(t?.handover?.evidence_protocol===4&&t.handover.id===h.id)add(t.id);
  const a=s.operating_state;
  if(a){
    validateOperatingIndex(s);
    // Accepted immutable proof is historical evidence across owner epochs.
    // Only new in-flight review admission is fenced to the current epoch.
    for(const refs of [a.receipts,...(a.accepted_snapshot.prior_proofs??[])]){const [t,r,j]=exactProof(s,refs);ids.add(t.id);ids.add(r.id);jobs.add(j.id);}
  }
  return {ids,jobs};
}
// Conservative built-in provider. Every unqualified occurrence is visible. No
// author-supplied inert flag, graph equality or missing provider can clear it.
export function operatingFrontier(s,{plan_id,job_id,consuming=Boolean(s.operating_state)&&!plan_id}={}){
  const p=reviewedContext(s),b=bookkeeping(s,plan_id),entries=[],homes=[];
  for(const [key,r] of Object.entries(s.records??{})){
    if(key!==r.id)fail('ambiguous record occurrence');
    if(consuming&&r.operating_record&&!s.operating_state?.accepted_snapshot.homes.some(ref=>same(ref,recordReference(r))))entries.push({source:recordReference(r),scope:'*',status:'DIRTY',reason:'Typed home is new or changed pending independent acceptance'});
    if(b.ids.has(key)||p.excluded(key)||mechanicalOperatingControl(r))continue;
    if(r.operating_record){validateOperatingRecord(r.operating_record);homes.push({source:recordReference(r),value:r});}
    else entries.push({source:recordReference(r),scope:'*',status:'DIRTY',reason:'Unaccepted consequential or unknown record'});
  }
  for(const [key,j] of Object.entries(s.jobs??{})){if(key!==j.id)fail('ambiguous job occurrence');if(key!==job_id&&!b.jobs.has(key)&&!p.proofJobs.has(key)&&!p.excluded('job:'+key))entries.push({source:recordReference(j,'job:'+key),scope:'*',status:'DIRTY',reason:'Execution/outcome needs independent preservation proof'});}
  for(const u of [...(s.upgrade_history??[]),...(s.upgrade?[s.upgrade]:[])])if(!p.excluded('upgrade:'+u.id))entries.push({source:recordReference(u,'upgrade:'+u.id),scope:'*',status:'DIRTY',reason:'Unknown legacy occurrence context'});
  // Communication remains compulsory in full, including missed requirements.
  const communication={notices:s.notices??[],messages:s.messages??[]};
  const extensions=Object.keys(controls(s).extensions);
  if(extensions.length)entries.push({source:{id:'state_extensions',sha256:sha(controls(s).extensions)},scope:'*',status:'DIRTY',reason:'Unknown state extension: '+extensions.join(',')});
  homes.sort((a,b)=>a.source.id.localeCompare(b.source.id));entries.sort((a,b)=>a.source.id.localeCompare(b.source.id));
  const classifications=Object.entries(s.context_classifications??{}).map(([key,value])=>({id:key,sha256:sha(value)})).sort((a,b)=>a.id.localeCompare(b.id));
  return {protocol:OPERATING_PROTOCOL,provider:'canonical-conservative-v1',complete:entries.length===0,interaction_complete:false,entries,homes,communication,classifications,source_root:sha({entries,homes:homes.map(h=>h.source),communication,classifications}),measurements:{dirty_entries:entries.length,current_homes:homes.length,mandatory_home_bytes:Buffer.byteLength(JSON.stringify(homes))}};
}
// Only provenance reachable from current homes is required, never the whole archive.
// reviewedContext validates canonical classifications before their receipts enter
// this closure; exact parent references are checked rather than re-authored.
function publicationEvidence(s,homes){
  const projection=reviewedContext(s),sources=new Map(),classifications=new Map(),homeSources=[];let seen;
  // Follow only fields owned by canonical preservation/provenance schemas.
  // All other metadata remains in the delivered value without becoming an edge.
  const refs=(value,keys)=>{for(const key of keys)for(const ref of [value?.[key]??[]].flat())if(ref)add({id:ref.id,revision:ref.revision,sha256:ref.sha256});};
  const classification=c=>{
    refs(c,['source','plan','review']);refs(c.qualification,['legacy_dependencies']);
    const scoped=c.scoped_qualification;
    if(scoped){refs(scoped,['source','plan','integration','homes']);for(const receipt of scoped.receipts??[])refs(receipt,['review','job','target']);}
    const partition=c.partition_qualification;
    if(partition)refs(partition,['source','plan','aggregate','roots','counterparts','dependencies']);
  };
  const canonical=value=>{
    const plan=value.context_classification_plan;
    if(plan)refs(plan,['sources','counterparts']);
    const partition=value.context_partition_plan;
    if(partition){refs(partition,['source','producer','counterparts','dependencies']);for(const record of partition.reviewed_subject?.records??[])refs(record,['ref','producer']);}
    const target=value.context_qualification_target;
    if(target)refs(target,['plan','children']);
    const scoped=value.scoped_context_target;
    if(scoped)refs(scoped,['plan','reviews','homes','dependencies']);
    if(value.scoped_context_plan)refs(value.scoped_context_plan,['source']);
    if(value.context_qualification)refs(value.context_qualification,['legacy_dependencies']);
    if(value.qualification_delivery)refs(value.qualification_delivery,['target','plan']);
    if(value.reviewed_unit_bundle)refs(value.reviewed_unit_bundle.provenance,['source']);
    refs(value,['supplemental_sources','retrieved_inputs']);
    if(value.review_of){
      const ref=value.review_of,source=contextSource(s,ref.id);
      if(!source||source.revision!==ref.revision)fail('review parent changed: '+ref.id);
      add(recordReference(source,ref.id));
    }
  };
  const add=ref=>{
    const value=exact(s,ref),prior=sources.get(ref.id);
    if(prior&&!same(prior.source,ref))fail('conflicting evidence reference: '+ref.id);
    if(seen.has(ref.id))return;seen.add(ref.id);
    // These legacy containers require their existing qualification/streaming
    // path. Delivering only a pointer must never count as complete evidence.
    if(hasSnapshotReferences(value))fail('referenced preservation evidence needs canonical snapshot delivery: '+ref.id);
    sources.set(ref.id,{source:ref,value});
    const c=projection.classifications.get(ref.id);
    if(c){classifications.set(ref.id,c);classification(c);}
    canonical(value);
    for(const producer of producerClosure(s,value))add(producer);
    if(value.artifact_id){const record=s.records?.[value.artifact_id];if(!record)fail('preservation artifact missing: '+value.artifact_id);add(recordReference(record));}
  };
  for(const h of homes){seen=new Set();for(const key of [...h.value.operating_record.evidence_refs,...h.value.operating_record.authority_refs,...(h.value.operating_record.grant_refs??[]),...(h.value.operating_record.historical_receipts??[])]){
    const value=contextSource(s,key);if(!value)fail('provenance source missing: '+key);add(recordReference(value,key));
  }
  homeSources.push({home_id:h.source.id,sources:[...seen].sort().map(id=>sources.get(id).source)});}
  return {home_sources:homeSources,sources:[...sources.values()].sort((a,b)=>a.source.id.localeCompare(b.source.id)),classifications:[...classifications].sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>({id,value}))};
}
function capture(s,plan_id){const f=operatingFrontier(s,{plan_id});const evidence=publicationEvidence(s,f.homes);const provenance=f.homes.map(h=>({home_id:h.source.id,sources:[...new Set([...h.value.operating_record.evidence_refs,...h.value.operating_record.authority_refs,...(h.value.operating_record.grant_refs??[]),...(h.value.operating_record.historical_receipts??[])])].map(key=>recordReference(contextSource(s,key),key))}));return {protocol:OPERATING_PROTOCOL,prior_proofs:s.operating_state?[s.operating_state.receipts,...(s.operating_state.accepted_snapshot.prior_proofs??[])]:[],provenance,required_sources:evidence.sources.map(x=>x.source),home_sources:evidence.home_sources,preservation_classifications:evidence.classifications,owner:{...s.owner},paused:s.paused,controls:controls(s),source_root:f.source_root,homes:f.homes.map(h=>h.source),home_predicates:f.homes.map(h=>({id:h.source.id,scope:h.value.operating_record.scope,dependencies:h.value.operating_record.dependencies})),communication:f.communication,classifications:f.classifications,frontier:f.entries};}
export function proposeOperatingState(s,args){
  const key=id('operating-plan'),snapshot=capture(s,key);
  for(const h of snapshot.homes){const v=exact(s,h).operating_record;for(const ref of [...v.evidence_refs,...v.authority_refs,...(v.historical_receipts??[]),...(v.grant_refs??[])])if(!contextSource(s,ref))fail('provenance source missing: '+ref);}
  const plan={protocol:OPERATING_PROTOCOL,version:1,snapshot,maintenance:args.maintenance===true,source_instruction:args.source_instruction,valid_until:args.valid_until??null};
  if(plan.valid_until!==null&&(!Number.isFinite(Date.parse(plan.valid_until))||Date.parse(plan.valid_until)<=Date.now()))fail('publication validity already expired');
  s.records[key]={id:key,kind:'plan',revision:1,status:'Draft',author_role:'runner',author_instance:s.owner.session_id,content:'Proposed current operating meaning; no authority, acceptance or legacy retirement.',operating_plan:plan,created_at:stamp()};
  return {id:key,revision:1,plan_sha256:sha(plan),frontier:snapshot.frontier,held:snapshot.frontier.length>0};
}
function livePlan(s,target){const p=target?.operating_plan;if(p?.protocol!==OPERATING_PROTOCOL||!same(capture(s,target.id),p.snapshot))fail('proposal dependency versions, applicable membership, controls or frontier changed');validTime(p.valid_until);return p;}
function validTime(until,now=Date.now()){if(until!==null&&(!Number.isFinite(Date.parse(until))||now>=Date.parse(until)))fail('wall-clock validity expired');}
export function operatingMaintenanceEligible(s,j){try{const t=s.records?.[typeof j.review_of==='string'?j.review_of:j.review_of?.id],p=livePlan(s,t);return Boolean(s.paused&&p.maintenance&&text(p.source_instruction)&&j.role==='qa'&&!j.prototype_id&&!j.development_id);}catch{return false;}}
export function operatingReviewContext(s,j){
  const t=s.records?.[j.review_of?.id];if(!t?.operating_plan)return null;
  const p=livePlan(s,t);if(j.role!=='qa'||j.prototype_id||j.development_id)fail('existing independent QA role required');
  const f=operatingFrontier(s,{plan_id:t.id});
  const evidence=publicationEvidence(s,f.homes);
  let inlineCharacters=0;const inline=evidence.sources.filter(x=>{const n=JSON.stringify(x.value).length;if(n>16000||inlineCharacters+n>64000)return false;inlineCharacters+=n;return true;});
  const packet={protocol:OPERATING_PROTOCOL,target:t,homes:f.homes,required_evidence:{protocol:'record-reads-v1',sources:evidence.sources.map(x=>({...x.source,total_characters:JSON.stringify(x.value).length})),inline,preservation_classifications:evidence.classifications,rule:'Read every required source completely before Pass; request missing exact ranges through record-reads-v1. Canonical receipts prove preservation provenance, never action authority.'},communication:f.communication,controls:p.snapshot.controls,frontier:f.entries,charter:s.roles.qa,assignment:{task:j.task},response_shape:{verdict:'Pass or Fail or Blocked',reason:'Independent complete conditions, authority boundaries, preservation and cross-home interactions judgment',permitted_action:'publish_operating_state or hold',plan_sha256:sha(p),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]},rule:'DIRTY legacy frontier forbids Pass/publication. Review complete homes, dependencies, conditions/exceptions, communication and applicable canonical preservation proofs. Sources and permission text never grant action authority. Missing understanding holds.'};
  const body=JSON.stringify(packet);if(body.length>200000)fail('coherent review exceeds supported context; decomposition/streamed canonical qualification required');
  return {text:body,hash:digest(body),inputs:[{id:t.id,revision:t.revision},...f.homes.map(h=>({id:h.source.id,revision:h.source.revision}))],required_sources:evidence.sources.map(x=>x.source),inline_sources:inline.map(x=>x.source)};
}
export function validateOperatingDelivery(s,j){
  const context=operatingReviewContext(s,j);
  if(!context||j.context_sha256!==context.hash)fail('publication delivery context changed');
  for(const ref of context.required_sources){
    exact(s,ref);
    if(context.inline_sources.some(x=>same(x,ref)))continue;
    const total=JSON.stringify(contextSource(s,ref.id)).length;let end=0;
    for(const r of (j.retrieved_inputs??[]).filter(r=>r.id===ref.id).sort((a,b)=>a.offset-b.offset)){
      if(r.sha256!==ref.sha256||r.revision!==ref.revision||r.total_characters!==total||!Number.isSafeInteger(r.offset)||!Number.isSafeInteger(r.length)||r.offset<0||r.length<1||r.length>32768||r.offset+r.length>total)fail('invalid required evidence read: '+ref.id);
      if(r.offset>end)break;end=Math.max(end,r.offset+r.length);
    }
    if(end!==total)fail('required evidence not completely delivered: '+ref.id);
  }
  return true;
}
export function publishOperatingState(s,{plan_id,review_id}){
  const target=s.records[plan_id],p=livePlan(s,target),r=s.records[review_id],j=s.jobs[r?.job_id],v=r?.review;
  if(p.snapshot.frontier.length)fail('legacy frontier coverage incomplete: '+p.snapshot.frontier.length+' DIRTY entries');
  if(!r||r.status!=='Submitted'||r.author_role!=='qa'||r.review_of?.id!==target.id||r.review_of.revision!==target.revision||j?.status!=='completed'||j.role!=='qa'||j.epoch!==s.owner.epoch||j.artifact_id!==r.id||j.review_of?.id!==target.id||j.review_of.revision!==target.revision||!j.native_id||r.author_instance!==j.instance_id||[target.author_instance,s.owner.session_id].includes(j.native_id)||r.author_instance===target.author_instance||j.coordination_release?.termination_confirmed!==true||j.context_sha256!==operatingReviewContext(s,j).hash||v?.verdict!=='Pass'||v.permitted_action!=='publish_operating_state'||v.plan_sha256!==sha(p)||v.preservation_complete!==true||v.interaction_complete!==true||v.authority_checked!==true||!Array.isArray(v.blockers)||v.blockers.length)fail('exact independent current-source publication Pass and execution closure required');
  validateOperatingDelivery(s,j);
  for(const h of [...p.snapshot.homes,...p.snapshot.required_sources]){const source=exact(s,h);if([source.author_instance,source.native_id,source.instance_id,s.jobs[source.job_id]?.native_id].some(x=>x&&(x===j.native_id||x===j.instance_id)))fail('reviewer owns current home');}
  if(Object.values(s.records).some(x=>x.status==='Submitted'&&x.review_of?.id===target.id&&x.review_of.revision===target.revision&&['Fail','Blocked'].includes(x.review?.verdict)))fail('unresolved negative publication review');
  const receipts=[recordReference(target),recordReference(r),recordReference(j,'job:'+j.id)];
  s.operating_state={protocol:OPERATING_PROTOCOL,version:1,plan:receipts[0],review:receipts[1],receipts,accepted_snapshot:structuredClone(p.snapshot),valid_until:p.valid_until,at:stamp()};
  return {published:true,protocol:OPERATING_PROTOCOL,plan_id,review_id,authority:'No execution authority; canonical grants and action gates remain required'};
}
function validateAcceptedReceipt(s,a){
  const t=exact(s,a.plan),r=exact(s,a.review),j=s.jobs[r.job_id],v=r.review;
  if(!j||!same(a.receipts,[recordReference(t),recordReference(r),recordReference(j,'job:'+j.id)])||r.status!=='Submitted'||r.author_role!=='qa'||j.role!=='qa'||j.status!=='completed'||j.artifact_id!==r.id||j.coordination_release?.termination_confirmed!==true||!j.native_id||j.native_id===t.author_instance||j.instance_id===t.author_instance||r.author_instance!==j.instance_id||v?.verdict!=='Pass'||v.permitted_action!=='publish_operating_state'||v.plan_sha256!==sha(t.operating_plan)||v.preservation_complete!==true||v.interaction_complete!==true||v.authority_checked!==true||!Array.isArray(v.blockers)||v.blockers.length)fail('accepted receipt invalid');
  if(Object.values(s.records).some(x=>x.status==='Submitted'&&x.review_of?.id===t.id&&x.review_of.revision===t.revision&&['Fail','Blocked'].includes(x.review?.verdict)))fail('negative publication finding remains');
}
// This validator has no frontier/classification recursion and grants no semantic
// acceptance. It permits the prospective index to coexist with frozen proofs.
function exactProof(s,refs){
  if(!Array.isArray(refs)||refs.length!==3)fail('invalid prior mechanical proof');
  const [t,r,j]=refs.map(ref=>exact(s,ref));
  if(!same(refs,[recordReference(t),recordReference(r),recordReference(j,'job:'+j.id)])||!same(j.review_of,{id:t.id,revision:t.revision})||!reviewJobSafe(j)||!reviewRecordSafe(r,j,t,false))fail('prior mechanical proof changed');
  return [t,r,j];
}
export function validateOperatingIndex(s){
  const a=s.operating_state;
  if(!closed(a,['protocol','version','plan','review','receipts','accepted_snapshot','valid_until','at'])||a.protocol!==OPERATING_PROTOCOL||a.version!==1||!text(a.at)||!Array.isArray(a.receipts))fail('invalid mechanical publication index');
  const t=exact(s,a.plan),r=exact(s,a.review),j=s.jobs[r.job_id];
  if(!same(a.accepted_snapshot,t.operating_plan?.snapshot)||a.valid_until!==t.operating_plan?.valid_until||!j||!reviewJobSafe(j)||!reviewRecordSafe(r,j,t,false))fail('mechanical publication index changed');
  validateAcceptedReceipt(s,a);
  for(const refs of a.accepted_snapshot.prior_proofs??[])exactProof(s,refs);
  return true;
}
export function operatingContext(s,{scope='*',now=Date.now(),job_id}={}){
  const a=s.operating_state;if(a?.protocol!==OPERATING_PROTOCOL)fail('no accepted prospective checkpoint');
  for(const ref of a.receipts)exact(s,ref);validTime(a.valid_until,now);
  const plan=exact(s,a.plan).operating_plan;if(!Array.isArray(plan.snapshot.required_sources)||!Array.isArray(plan.snapshot.home_sources))fail('publication evidence delivery requires fresh review');if(a.valid_until!==plan.valid_until)fail('acceptance expiry differs from reviewed contract');if(!same(plan.snapshot,a.accepted_snapshot)||!same(controls(s),a.accepted_snapshot.controls))fail('global policy/control changed');
  validateAcceptedReceipt(s,a);
  const f=operatingFrontier(s,{job_id,consuming:true});if(f.entries.length)fail('unclassified frontier: '+f.entries.length+' DIRTY entries');
  const ids=new Set(f.homes.filter(h=>scope==='*'||h.value.operating_record.scope==='*'||h.value.operating_record.scope===scope).map(h=>h.source.id));
  let changed=true;while(changed){changed=false;for(const h of f.homes.filter(h=>ids.has(h.source.id)))for(const key of h.value.operating_record.dependencies)if(!ids.has(key)){if(!f.homes.some(x=>x.source.id===key))fail('current dependency missing: '+key);ids.add(key);changed=true;}}
  const expected=new Set(a.accepted_snapshot.home_predicates.filter(h=>scope==='*'||h.scope==='*'||h.scope===scope).map(h=>h.id));
  let more=true;while(more){more=false;for(const h of a.accepted_snapshot.home_predicates.filter(h=>expected.has(h.id)))for(const key of h.dependencies)if(!expected.has(key)){expected.add(key);more=true;}}
  if(!same([...ids].sort(),[...expected].sort()))fail('applicable-set membership/predicate changed');
  const homes=f.homes.filter(h=>ids.has(h.source.id));
  for(const h of homes){for(const ref of a.accepted_snapshot.home_sources?.find(p=>p.home_id===h.source.id)?.sources??[])exact(s,ref);for(const ref of a.accepted_snapshot.provenance.find(p=>p.home_id===h.source.id)?.sources??[])exact(s,ref);const accepted=a.accepted_snapshot.homes.find(x=>x.id===h.source.id);if(!same(accepted,h.source))fail('current home unaccepted or changed: '+h.source.id);validTime(h.value.operating_record.expires_at,now);
    for(const ref of [...h.value.operating_record.evidence_refs,...h.value.operating_record.authority_refs,...(h.value.operating_record.grant_refs??[]),...(h.value.operating_record.historical_receipts??[])])if(!contextSource(s,ref))fail('provenance source missing: '+ref);}
  if(!same(f.communication,a.accepted_snapshot.communication))fail('communication changed or missed');
  // Canonical classification validators above recheck every proof on every use.
  const body={protocol:OPERATING_PROTOCOL,company_id:s.id,owner:s.owner,paused:s.paused,scope,controls:controls(s),homes,communication:f.communication,acceptance:a.receipts,valid_until:a.valid_until};
  return {...body,applicable_set_root:sha({scope,homes:homes.map(h=>h.source),communication:f.communication,controls:body.controls})};
}
export function operatingInspection(s){
  let frontier;try{frontier=operatingFrontier(s);}catch(e){return {protocol:OPERATING_PROTOCOL,status:'Held',reason:e.message};}
  try{return {protocol:OPERATING_PROTOCOL,status:'Accepted',checkpoint:operatingContext(s),measurements:frontier.measurements};}catch(e){return {protocol:OPERATING_PROTOCOL,status:'Held',reason:e.message,frontier:frontier.entries,proposed_homes:frontier.homes.map(h=>h.source),measurements:frontier.measurements};}
}
export function requireOperatingHandover(s){const checkpoint=operatingContext(s);return {company_id:s.id,name:s.name,idea:s.idea,owner:s.owner,governance:s.governance,cos_instructions:s.cos_instructions,roles:s.roles,team_sha256:s.team_sha256,mode:s.mode,phase:s.phase,records:Object.fromEntries(checkpoint.homes.map(h=>[h.source.id,h.value])),jobs:{},upgrade:null,upgrade_history:[],notices:checkpoint.communication.notices,messages:checkpoint.communication.messages,operating_checkpoint:checkpoint};}
