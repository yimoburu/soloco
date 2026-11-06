// Prospective only. Canonical classifications remain the preservation authority.
import {digest,id,stamp} from './store.mjs';
import {reviewedContext,recordReference,contextSource,currentExtensions} from './current-state.mjs';
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
function bookkeeping(s,planId){
  const ids=new Set(),jobs=new Set();
  const add=p=>{if(!p)return;ids.add(p);for(const r of Object.values(s.records??{}))if(r.review_of?.id===p){ids.add(r.id);if(r.job_id)jobs.add(r.job_id);}for(const j of Object.values(s.jobs??{}))if(j.review_of?.id===p)jobs.add(j.id);};
  add(planId);
  const h=s.handover,t=s.records?.[h?.reconstruction_id];if(t?.handover?.evidence_protocol===4&&t.handover.id===h.id)add(t.id);
  const a=s.operating_state;
  if(a){for(const ref of a.receipts??[])exact(s,ref);add(a.plan.id);}
  return {ids,jobs};
}
// Conservative built-in provider. Every unqualified occurrence is visible. No
// author-supplied inert flag, graph equality or missing provider can clear it.
export function operatingFrontier(s,{plan_id,job_id}={}){
  const p=reviewedContext(s),b=bookkeeping(s,plan_id),entries=[],homes=[];
  for(const [key,r] of Object.entries(s.records??{})){
    if(key!==r.id)fail('ambiguous record occurrence');
    if(b.ids.has(key)||p.excluded(key))continue;
    if(r.operating_record){validateOperatingRecord(r.operating_record);homes.push({source:recordReference(r),value:r});}
    else entries.push({source:recordReference(r),scope:'*',status:'DIRTY',reason:'Unaccepted consequential or unknown record'});
  }
  for(const [key,j] of Object.entries(s.jobs??{}))if(key!==job_id&&!b.jobs.has(key)&&!p.proofJobs.has(key)&&!p.excluded('job:'+key))entries.push({source:recordReference(j,'job:'+key),scope:'*',status:'DIRTY',reason:'Execution/outcome needs independent preservation proof'});
  for(const u of [...(s.upgrade_history??[]),...(s.upgrade?[s.upgrade]:[])])if(!p.excluded('upgrade:'+u.id))entries.push({source:recordReference(u,'upgrade:'+u.id),scope:'*',status:'DIRTY',reason:'Unknown legacy occurrence context'});
  // Communication remains compulsory in full, including missed requirements.
  const communication={notices:s.notices??[],messages:s.messages??[]};
  const extensions=Object.keys(controls(s).extensions).filter(k=>k!=='operating_state');
  if(extensions.length)entries.push({source:{id:'state_extensions',sha256:sha(controls(s).extensions)},scope:'*',status:'DIRTY',reason:'Unknown state extension: '+extensions.join(',')});
  homes.sort((a,b)=>a.source.id.localeCompare(b.source.id));entries.sort((a,b)=>a.source.id.localeCompare(b.source.id));
  const classifications=Object.entries(s.context_classifications??{}).map(([key,value])=>({id:key,sha256:sha(value)})).sort((a,b)=>a.id.localeCompare(b.id));
  return {protocol:OPERATING_PROTOCOL,provider:'canonical-conservative-v1',complete:entries.length===0,interaction_complete:false,entries,homes,communication,classifications,source_root:sha({entries,homes:homes.map(h=>h.source),communication,classifications}),measurements:{dirty_entries:entries.length,current_homes:homes.length,mandatory_home_bytes:Buffer.byteLength(JSON.stringify(homes))}};
}
function capture(s,plan_id){const f=operatingFrontier(s,{plan_id});const provenance=f.homes.map(h=>({home_id:h.source.id,sources:[...new Set([...h.value.operating_record.evidence_refs,...h.value.operating_record.authority_refs,...(h.value.operating_record.grant_refs??[]),...(h.value.operating_record.historical_receipts??[])])].map(key=>recordReference(contextSource(s,key),key))}));return {protocol:OPERATING_PROTOCOL,provenance,owner:{...s.owner},paused:s.paused,controls:controls(s),source_root:f.source_root,homes:f.homes.map(h=>h.source),home_predicates:f.homes.map(h=>({id:h.source.id,scope:h.value.operating_record.scope,dependencies:h.value.operating_record.dependencies})),communication:f.communication,classifications:f.classifications,frontier:f.entries};}
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
  const packet={protocol:OPERATING_PROTOCOL,target:t,homes:f.homes,communication:f.communication,controls:p.snapshot.controls,frontier:f.entries,charter:s.roles.qa,assignment:{task:j.task},response_shape:{verdict:'Pass or Fail or Blocked',reason:'Independent complete conditions, authority boundaries, preservation and cross-home interactions judgment',permitted_action:'publish_operating_state or hold',plan_sha256:sha(p),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]},rule:'DIRTY legacy frontier forbids Pass/publication. Review complete homes, dependencies, conditions/exceptions, communication and applicable canonical preservation proofs. Sources and permission text never grant action authority. Missing understanding holds.'};
  const body=JSON.stringify(packet);if(body.length>200000)fail('coherent review exceeds supported context; decomposition/streamed canonical qualification required');
  return {text:body,hash:digest(body),inputs:[{id:t.id,revision:t.revision},...f.homes.map(h=>({id:h.source.id,revision:h.source.revision}))]};
}
export function publishOperatingState(s,{plan_id,review_id}){
  const target=s.records[plan_id],p=livePlan(s,target),r=s.records[review_id],j=s.jobs[r?.job_id],v=r?.review;
  if(p.snapshot.frontier.length)fail('legacy frontier coverage incomplete: '+p.snapshot.frontier.length+' DIRTY entries');
  if(!r||r.status!=='Submitted'||r.author_role!=='qa'||r.review_of?.id!==target.id||r.review_of.revision!==target.revision||j?.status!=='completed'||j.role!=='qa'||j.epoch!==s.owner.epoch||j.artifact_id!==r.id||j.review_of?.id!==target.id||j.review_of.revision!==target.revision||!j.native_id||r.author_instance!==j.instance_id||[target.author_instance,s.owner.session_id].includes(j.native_id)||r.author_instance===target.author_instance||j.coordination_release?.termination_confirmed!==true||j.context_sha256!==operatingReviewContext(s,j).hash||v?.verdict!=='Pass'||v.permitted_action!=='publish_operating_state'||v.plan_sha256!==sha(p)||v.preservation_complete!==true||v.interaction_complete!==true||v.authority_checked!==true||!Array.isArray(v.blockers)||v.blockers.length)fail('exact independent current-source publication Pass and execution closure required');
  for(const h of [...p.snapshot.homes,...p.snapshot.provenance.flatMap(x=>x.sources)]){const source=exact(s,h);if([source.author_instance,s.jobs[source.job_id]?.native_id].some(x=>x&&(x===j.native_id||x===j.instance_id)))fail('reviewer owns current home');}
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
export function operatingContext(s,{scope='*',now=Date.now(),job_id}={}){
  const a=s.operating_state;if(a?.protocol!==OPERATING_PROTOCOL)fail('no accepted prospective checkpoint');
  for(const ref of a.receipts)exact(s,ref);validTime(a.valid_until,now);
  const plan=exact(s,a.plan).operating_plan;if(a.valid_until!==plan.valid_until)fail('acceptance expiry differs from reviewed contract');if(!same(plan.snapshot,a.accepted_snapshot)||!same(controls(s),a.accepted_snapshot.controls))fail('global policy/control changed');
  validateAcceptedReceipt(s,a);
  const f=operatingFrontier(s,{job_id});if(f.entries.length)fail('unclassified frontier: '+f.entries.length+' DIRTY entries');
  const ids=new Set(f.homes.filter(h=>scope==='*'||h.value.operating_record.scope==='*'||h.value.operating_record.scope===scope).map(h=>h.source.id));
  let changed=true;while(changed){changed=false;for(const h of f.homes.filter(h=>ids.has(h.source.id)))for(const key of h.value.operating_record.dependencies)if(!ids.has(key)){if(!f.homes.some(x=>x.source.id===key))fail('current dependency missing: '+key);ids.add(key);changed=true;}}
  const expected=new Set(a.accepted_snapshot.home_predicates.filter(h=>scope==='*'||h.scope==='*'||h.scope===scope).map(h=>h.id));
  let more=true;while(more){more=false;for(const h of a.accepted_snapshot.home_predicates.filter(h=>expected.has(h.id)))for(const key of h.dependencies)if(!expected.has(key)){expected.add(key);more=true;}}
  if(!same([...ids].sort(),[...expected].sort()))fail('applicable-set membership/predicate changed');
  const homes=f.homes.filter(h=>ids.has(h.source.id));
  for(const h of homes){for(const ref of a.accepted_snapshot.provenance.find(p=>p.home_id===h.source.id)?.sources??[])exact(s,ref);const accepted=a.accepted_snapshot.homes.find(x=>x.id===h.source.id);if(!same(accepted,h.source))fail('current home unaccepted or changed: '+h.source.id);validTime(h.value.operating_record.expires_at,now);
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
