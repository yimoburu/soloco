// Profiles specialize judgment; they never grant execution permissions.
import {digest,owner,stamp,requireText,teamHash} from './store.mjs';
import {resolveSnapshot} from './snapshot.mjs';
const copy=v=>structuredClone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=m=>{throw Error('Specialist Held: '+m);};
const object=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const closed=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const exact=(v,keys)=>closed(v,keys)&&keys.every(k=>Object.hasOwn(v,k));
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const text=(v,max=20000)=>typeof v==='string'&&Boolean(v.trim())&&v.length<=max;
const hash=v=>digest(JSON.stringify(v));
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const names=(v,max=100)=>Array.isArray(v)&&v.length<=max&&v.every(x=>text(x,200))&&new Set(v).size===v.length;
const who=v=>exact(v,['host','session_id','epoch'])&&['codex','claude'].includes(v.host)&&text(v.session_id,200)&&Number.isSafeInteger(v.epoch)&&v.epoch>0;
const ref=v=>exact(v,['id','revision','sha256'])&&text(v.id,200)&&(v.revision===null||Number.isSafeInteger(v.revision)&&v.revision>0)&&sha(v.sha256);
const charterKeys=['name','mission','inputs','outputs','block','success','failure','phase'];
const policyKeys=['base_roles','input_ids','scope','expires_at','max_profiles','max_assignments'];
const definitionKeys=['base_role','charter','task','acceptance','input_ids','expires_at','max_assignments'];
const common=['version','type','company_id','owner','team_sha256','operation_id','request_sha256','source_instruction'];
const types={policy:['policy'],profile:['policy','definition','input_refs','base_charter'],revocation:['target','completed_outputs'],assessment:['profile','policy','output','review','producer','reviewer','disposition']};
const statuses={policy:'Specialist:policy',profile:'Specialist:profile',revocation:'Specialist:revoked'};
const identityKeys=['job_id','instance_id','native_id','context_sha256'];
const completionKeys=[...identityKeys,'finished_at','output'];
const DAY=86400000;
export function reference(record){return {id:record.id,revision:record.revision??null,sha256:hash(record)};}
export function validateSpecialistBindingShape(binding){return exact(binding,['version','profile','policy'])&&binding.version===1&&ref(binding.profile)&&ref(binding.policy);}
function policyShape(p){return exact(p,policyKeys)&&names(p.base_roles)&&p.base_roles.length>0&&!p.base_roles.includes('runner')&&names(p.input_ids)&&text(p.scope,4000)&&date(p.expires_at)&&Number.isSafeInteger(p.max_profiles)&&p.max_profiles>=1&&p.max_profiles<=20&&Number.isSafeInteger(p.max_assignments)&&p.max_assignments>=1&&p.max_assignments<=20;}
function definitionShape(d){return exact(d,definitionKeys)&&text(d.base_role,100)&&d.base_role!=='runner'&&exact(d.charter,charterKeys)&&charterKeys.every(k=>text(d.charter[k],k==='name'?80:2000))&&text(d.task)&&text(d.acceptance,4000)&&names(d.input_ids)&&date(d.expires_at)&&Number.isSafeInteger(d.max_assignments)&&d.max_assignments>=1&&d.max_assignments<=3;}
function recordShape(r){
 if(!exact(r,['id','kind','content','author_role','author_instance','revision','status','created_at','specialist'])||!/^specialist-[a-f0-9]{32}$/.test(r.id)||r.kind!=='artifact'||r.author_role!=='runner'||r.revision!==1||!text(r.content,30000)||!date(r.created_at))return false;
 const v=r.specialist;if(!v||!types[v.type]||!exact(v,[...common,...types[v.type]])||v.version!==1||!text(v.company_id,200)||!who(v.owner)||v.owner.session_id!==r.author_instance||!sha(v.team_sha256)||!text(v.operation_id,160)||!sha(v.request_sha256)||!text(v.source_instruction,4000))return false;
 if(v.type==='policy')return r.status===statuses.policy&&policyShape(v.policy)&&Date.parse(v.policy.expires_at)>Date.parse(r.created_at)&&Date.parse(v.policy.expires_at)<=Date.parse(r.created_at)+30*DAY;
 if(v.type==='profile')return r.status===statuses.profile&&ref(v.policy)&&definitionShape(v.definition)&&Array.isArray(v.input_refs)&&v.input_refs.every(ref)&&same(v.input_refs.map(x=>x.id),v.definition.input_ids)&&object(v.base_charter)&&Date.parse(v.definition.expires_at)>Date.parse(r.created_at)&&Date.parse(v.definition.expires_at)<=Date.parse(r.created_at)+7*DAY;
 if(v.type==='revocation')return r.status===statuses.revocation&&ref(v.target)&&Array.isArray(v.completed_outputs)&&v.completed_outputs.length<=20&&v.completed_outputs.every(p=>exact(p,completionKeys)&&identityKeys.every(k=>text(p[k],200))&&sha(p.context_sha256)&&date(p.finished_at)&&ref(p.output));
 return ref(v.profile)&&ref(v.policy)&&ref(v.output)&&ref(v.review)&&['accepted_preparation','rejected','held'].includes(v.disposition)&&r.status==='Specialist:'+v.disposition&&[v.producer,v.reviewer].every(x=>exact(x,identityKeys)&&identityKeys.every(k=>text(x[k],200))&&sha(x.context_sha256));
}
export function isSpecialistRecord(record){try{return recordShape(record);}catch{return false;}}
function records(state){return Object.entries(state.records??{}).filter(([key,r])=>/^specialist-[a-f0-9]{32}$/.test(key)||r?.specialist!==undefined).map(([key,r])=>{if(key!==r?.id||!isSpecialistRecord(r))fail('invalid canonical profile record: '+key);return r;});}
function resolve(state,r,type){if(!ref(r))fail('exact record reference required');const value=Object.hasOwn(state.records??{},r.id)?state.records[r.id]:null;if(!value||value.id!==r.id||!same(reference(value),r))fail('missing or changed record: '+r.id);if(type&&(!isSpecialistRecord(value)||value.specialist.type!==type))fail('expected '+type+' record');return value;}
function inputs(state,refs){for(const r of refs)resolve(state,r);}
function identity(job){return {job_id:job.id,instance_id:job.instance_id,native_id:job.native_id,context_sha256:job.context_sha256};}
function profileOf(state,binding){
 if(!validateSpecialistBindingShape(binding))fail('invalid assignment binding');
 const profile=resolve(state,binding.profile,'profile'),policy=resolve(state,binding.policy,'policy'),p=profile.specialist,q=policy.specialist;
 if(!same(p.policy,binding.policy)||p.company_id!==state.id||q.company_id!==state.id||!same(p.owner,q.owner)||p.team_sha256!==q.team_sha256||!q.policy.base_roles.includes(p.definition.base_role)||p.definition.input_ids.some(x=>!q.policy.input_ids.includes(x))||Date.parse(profile.created_at)<Date.parse(policy.created_at)||Date.parse(profile.created_at)>=Date.parse(q.policy.expires_at)||Date.parse(p.definition.expires_at)>Date.parse(q.policy.expires_at))fail('profile/policy authorization binding changed');
 inputs(state,p.input_refs);return {profile,policy};
}
function completedOutput(state,job){
 if(!closedJob(job))return null;
 const output=state.records?.[job.artifact_id];
 if(!output||output.job_id!==job.id||output.author_role!==job.role||output.author_instance!==job.instance_id||output.status!=='Submitted'||!same(output.inputs,job.inputs))return null;
 return {...identity(job),finished_at:job.finished_at,output:reference(output)};
}
function revoked(state,refs,cut=Infinity,job){return records(state).some(r=>{if(r.specialist.type!=='revocation')return false;const target=r.specialist.target,match=refs.find(x=>x.id===target.id);if(!match)return false;if(!same(match,target))fail('revocation subject changed');
 // Wall-clock timestamps cannot order two commits in the same millisecond.
 // Preserve only exact closed outputs already observed by the revoking writer.
 if(job){const proof=completedOutput(state,job);if(proof&&r.specialist.completed_outputs.some(p=>same(p,proof)))return false;}
 return Date.parse(r.created_at)<=cut;});}
function live(state,{profile,policy}){
 const p=profile.specialist,q=policy.specialist;
 if(state.mode!=='preparation'||state.paused||!same(state.owner,p.owner)||state.team_sha256!==p.team_sha256||state.team_sha256!==teamHash(state)||!same(state.roles?.[p.definition.base_role],p.base_charter))fail('current preparation owner, team or pause changed');
 const revocation=revoked(state,[reference(profile),reference(policy)]);
 // Time is sampled AFTER hashes/scans: a slow read must not admit an expired role.
 if(revocation||Date.now()>=Date.parse(p.definition.expires_at)||Date.now()>=Date.parse(q.policy.expires_at))fail('profile or policy expired/revoked');
}
function usage(state,policyRef,profileRef){
 let policy=0,profile=0;
 for(const j of Object.values(state.jobs??{})){if(j.specialist===undefined)continue;if(!validateSpecialistBindingShape(j.specialist))fail('unknown assignment usage');if(j.specialist.policy.id===policyRef.id){if(!same(j.specialist.policy,policyRef))fail('policy usage binding changed');policy++;}if(j.specialist.profile.id===profileRef.id){if(!same(j.specialist.profile,profileRef))fail('profile usage binding changed');profile++;}}
 return {policy,profile};
}
function forbidden(args){if(args.review_of||args.prototype_id||args.development_id||args.handover_review_window_minutes||args.handover_review_reason)fail('specialized generation/review lane unsupported');}
export function prepareSpecialistAssignment(state,args,{reserve=false}={}){
 if(args.specialist_ref===undefined)return {binding:null,input_ids:args.input_ids??[]};
 const profile=resolve(state,args.specialist_ref,'profile'),binding={version:1,profile:reference(profile),policy:copy(profile.specialist.policy)},pair=profileOf(state,binding),d=profile.specialist.definition;
 forbidden(args);
 if(args.role!==d.base_role||args.task!==d.task)fail('assignment must match exact base role and task');
 if(args.acceptance!==undefined&&args.acceptance!==d.acceptance)fail('assignment acceptance differs from the frozen specialist criteria');
 const auto=[binding.policy.id,binding.profile.id],allowed=new Set([...d.input_ids,...auto]);
 const explicit=args.input_ids??d.input_ids,evidence=args.evidence_ids??[];
 if(!names(explicit,102)||explicit.some(x=>!allowed.has(x)))fail('explicit inputs exceed profile definition');
 if(!names(evidence)||evidence.some(x=>!d.input_ids.includes(x)))fail('supplemental inputs exceed profile data definition');
 const used=usage(state,binding.policy,binding.profile);
 if(reserve&&(used.policy>=pair.policy.specialist.policy.max_assignments||used.profile>=d.max_assignments))fail('assignment allowance exhausted');
 live(state,pair);
 return {binding,input_ids:[...new Set([...d.input_ids,...(args.input_ids??[]),...auto])]};
}
export function assertSpecialistEligible(state,job,{historical=false}={}){
 if(job.specialist===undefined)return true;
 const pair=profileOf(state,job.specialist),p=pair.profile.specialist,d=p.definition,q=pair.policy.specialist;
 forbidden(job);
 if(job.role!==d.base_role||job.task!==d.task||job.epoch!==p.owner.epoch||job.host!==p.owner.host||!date(job.created_at))fail('job/profile provenance changed');
 if(!Array.isArray(job.inputs)||job.inputs.some(x=>!exact(x,['id','revision'])||!text(x.id,200)||!(x.revision===null||Number.isSafeInteger(x.revision)&&x.revision>0)))fail('job inputs missing');
 for(const r of [job.specialist.profile,job.specialist.policy])if(!job.inputs.some(x=>x.id===r.id&&x.revision===r.revision))fail('profile/policy not delivered');
 for(const r of p.input_refs)if(!job.inputs.some(x=>x.id===r.id&&x.revision===r.revision))fail('complete profile data revision not delivered');
 for(const input of job.inputs){const frozen=p.input_refs.find(x=>x.id===input.id);if(frozen&&input.revision!==frozen.revision)fail('delivered profile data revision changed');}
 for(const r of job.supplemental_sources??[])if(!d.input_ids.includes(r.id)||!p.input_refs.some(x=>x.id===r.id&&x.sha256===r.sha256&&(r.revision===undefined||r.revision===x.revision)))fail('supplemental profile input changed');
 const cuts=[job.created_at,...['started_at','execution_started_at','finished_at'].flatMap(k=>job[k]===undefined?[]:[job[k]])];
 if(cuts.some(x=>!date(x)||Date.parse(x)<Date.parse(pair.profile.created_at)||Date.parse(x)>=Date.parse(d.expires_at)||Date.parse(x)>=Date.parse(q.policy.expires_at)))fail('job outside recorded profile authorization cut');
 if(revoked(state,[job.specialist.profile,job.specialist.policy],Math.max(...cuts.map(Date.parse)),historical?job:undefined))fail('profile revoked at job cut');
 if(!historical){const current=state.jobs?.[job.id];if(!current||!same(current.specialist,job.specialist)||!['queued','running'].includes(current.status))fail('no live canonical assignment');const u=usage(state,job.specialist.policy,job.specialist.profile);if(u.policy>q.policy.max_assignments||u.profile>d.max_assignments)fail('assignment allowance exceeded');live(state,pair);}
 return true;
}
export function specialistContext(state,job){if(job.specialist===undefined)return null;assertSpecialistEligible(state,job,{historical:true});const {profile,policy}=profileOf(state,job.specialist);return copy({version:1,profile:{source:reference(profile),definition:profile.specialist.definition,input_refs:profile.specialist.input_refs},policy:{source:reference(policy),policy:policy.specialist.policy,source_instruction:policy.specialist.source_instruction},base_charter:profile.specialist.base_charter,authority:'Bounded preparation specialization only; base-role authority and independent result review remain required. Creation is not competence certification.'});}
// Only a specialist assignment and exact independent QA of its canonical output
// share the specialist's explicit-null input protocol. Ordinary references keep
// their original revision presence; this classification grants no acceptance.
export function usesSpecialistInputRevisions(state,job){
 if(job.specialist!==undefined)return true;
 if(job.role!=='qa'||!job.review_of)return false;
 const output=state.records?.[job.review_of.id],producer=state.jobs?.[output?.job_id];
 if(producer?.specialist===undefined)return false;
 if(!exact(job.review_of,['id','revision'])||!Object.hasOwn(state.records,job.review_of.id)||output.id!==job.review_of.id||output.revision!==job.review_of.revision||!Object.hasOwn(state.jobs,output.job_id)||producer.id!==output.job_id||producer.artifact_id!==output.id||output.kind!=='artifact'||output.status!=='Submitted'||output.author_role!==producer.role||output.author_instance!==producer.instance_id||output.review_of||output.review||output.prototype||output.development||output.handover||!same(output.inputs,producer.inputs))fail('specialist review target lacks its exact producer output binding');
 assertSpecialistEligible(state,producer,{historical:true});
 return true;
}
export function specialistName(state,job){if(job.specialist===undefined)return state.roles?.[job.role]?.name??job.role;const {profile}=profileOf(state,job.specialist);return profile.specialist.definition.charter.name;}
export function specialistSessionKey(role,binding){if(binding===undefined||binding===null)return role;if(!validateSpecialistBindingShape(binding))fail('invalid session profile binding');return role+':specialist:'+binding.profile.id;}
const commonArgs=['root','session_id','epoch','action','operation_id','source_instruction'];
const actionArgs={authorize:['policy'],create:['policy_ref','definition'],revoke:['target_ref'],assess:['profile_ref','output_ref','review_ref']};
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function closedJob(j){return j?.status==='completed'&&text(j.native_id,200)&&text(j.instance_id,200)&&sha(j.context_sha256)&&j.coordination_release?.termination_confirmed===true&&j.coordination_release.reason==='model_process_closed'&&date(j.finished_at);}
function rejectedNegative(state,subject){
 for(const job of Object.values(state.jobs??{})){
  if(!same(job.review_of,subject))continue;
  // The native adapter may retain an earlier negative even when a later turn
  // supplies the selected envelope. Selection never resolves that finding.
  if(job.model_evidence?.cli_observed_negative_outputs!==undefined&&(!Array.isArray(job.model_evidence.cli_observed_negative_outputs)||job.model_evidence.cli_observed_negative_outputs.length))return true;
  if(!job.rejected_output)continue;
  const rejected=job.rejected_output;
  if([rejected.qualification_negative,rejected.operating_negative].some(v=>['Fail','Blocked'].includes(v)))return true;
  let raw=rejected.text;
  if(rejected.truncated){
   if(!rejected.original)return true;
   try{raw=resolveSnapshot(state,rejected.original);}catch{return true;}
  }
  if(typeof raw!=='string')return true;
  let parsed;try{parsed=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return true;}
  if(!object(parsed?.review)||!['Pass','Fail','Blocked'].includes(parsed.review.verdict)||!text(parsed.review.reason))return true;
  if(parsed.review.verdict==='Pass'&&parsed.review.blockers!==undefined&&(!Array.isArray(parsed.review.blockers)||parsed.review.blockers.length))return true;
  if([parsed?.review?.verdict,parsed?.qualification_result?.verdict].some(v=>['Fail','Blocked'].includes(v)))return true;
 }
 return false;
}
function assess(state,args,reviewCurrent){
 const profile=resolve(state,args.profile_ref,'profile'),output=resolve(state,args.output_ref),review=resolve(state,args.review_ref),producer=state.jobs?.[output.job_id],reviewer=state.jobs?.[review.job_id];
 if(!producer||!same(producer.specialist?.profile,args.profile_ref)||producer.artifact_id!==output.id||!closedJob(producer)||output.kind!=='artifact'||output.status!=='Submitted'||output.author_role!==producer.role||output.author_instance!==producer.instance_id||output.review_of||output.review||output.prototype||output.development||output.handover||!same(output.inputs,producer.inputs))fail('actual ordinary profile output and closed native producer required');
 assertSpecialistEligible(state,producer,{historical:true});
 if(!reviewer||reviewer.artifact_id!==review.id||!closedJob(reviewer)||reviewer.role!=='qa'||reviewer.specialist!==undefined||reviewer.prototype_id||reviewer.development_id||review.kind!=='review'||review.status!=='Submitted'||review.author_role!=='qa'||review.author_instance!==reviewer.instance_id||!same(review.review_of,{id:output.id,revision:output.revision})||!same(reviewer.review_of,review.review_of))fail('exact independent completed QA output required');
 const natives=[producer.native_id,producer.instance_id,profile.specialist.owner.session_id,state.owner.session_id];
 if(natives.includes(reviewer.native_id)||natives.includes(reviewer.instance_id)||producer.native_id===profile.specialist.owner.session_id||producer.instance_id===profile.specialist.owner.session_id)fail('review or producer identity is not standalone/independent');
 for(const input of producer.inputs)if(!reviewer.inputs?.some(x=>same(x,input)))fail('QA did not receive original profile/data inputs');
 if(!reviewer.inputs?.some(x=>x.id===output.id&&x.revision===output.revision)||typeof reviewCurrent!=='function'||reviewCurrent(state,reviewer,reviewer.context_sha256)!==true)fail('current complete reviewer context required');
 const r=review.review;if(!r||!['Pass','Fail','Blocked'].includes(r.verdict)||!text(r.reason)||r.verdict==='Pass'&&(r.permitted_action!=='accept_specialist_output'||!Array.isArray(r.blockers)||r.blockers.length))fail('explicit exact preparation-result QA judgment required');
 if(r.verdict==='Pass'&&(Object.values(state.records).some(x=>same(x.review_of,review.review_of)&&['Fail','Blocked'].includes(x.review?.verdict))||rejectedNegative(state,review.review_of)))fail('unresolved negative or uninspectable rejected output review');
 return {profile:reference(profile),policy:copy(profile.specialist.policy),output:reference(output),review:reference(review),producer:identity(producer),reviewer:identity(reviewer),disposition:{Pass:'accepted_preparation',Fail:'rejected',Blocked:'held'}[r.verdict]};
}
function inspect(state,args){
 if(!closed(args,[...commonArgs,'profile_ref','filter','limit','cursor']))fail('unknown inspect option');
 const limit=args.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('inspect limit must be1..50');
 if(args.filter!==undefined&&!Object.hasOwn(types,args.filter))fail('unknown inspection filter');
 let list=records(state);if(args.profile_ref!==undefined){const p=resolve(state,args.profile_ref,'profile');list=list.filter(r=>r.id===p.id||r.id===p.specialist.policy.id||r.specialist.profile?.id===p.id||r.specialist.target?.id===p.id);}
 if(args.filter)list=list.filter(r=>r.specialist.type===args.filter);list.sort((a,b)=>a.id.localeCompare(b.id));
 const membership=hash(list.map(reference));let offset=0;if(args.cursor!==undefined){let c;try{c=JSON.parse(args.cursor);}catch{fail('invalid inspect cursor');}if(!exact(c,['offset','membership'])||c.membership!==membership||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>list.length)fail('stale inspect cursor');offset=c.offset;}
 const jobs=Object.values(state.jobs??{}).filter(j=>j.specialist!==undefined&&(!args.profile_ref||j.specialist?.profile?.id===args.profile_ref.id));
 return {items:copy(list.slice(offset,offset+limit)),total:list.length,returned:Math.min(limit,list.length-offset),complete:offset+limit>=list.length,next_cursor:offset+limit<list.length?JSON.stringify({offset:offset+limit,membership}):null,observed:{assignments:jobs.length,completed:jobs.filter(j=>j.status==='completed').length,failed:jobs.filter(j=>['failed','interrupted','quarantined','cancelled'].includes(j.status)).length,assessments:list.filter(r=>r.specialist.type==='assessment').length},outcomes:{competence_certificate:false,business_benefit:'unmeasured',cost:'unmeasured',missed_issues:'unmeasured',founder_workload:'unmeasured'}};
}
export function specialistAction(state,args,{host,reviewCurrent}={}){
 if(args.action==='inspect')return inspect(state,args);
 if(!actionArgs[args.action]||!closed(args,[...commonArgs,...actionArgs[args.action]]))fail('unknown action or arguments');
 if(!Number.isSafeInteger(args.epoch))fail('current ownership epoch required');owner(state,args.session_id,host??state.owner.host,args.epoch);requireText(args.source_instruction,'source_instruction',4000);requireText(args.operation_id,'operation_id',160);
 const key='specialist-'+hash([state.id,state.owner,args.operation_id]).slice(0,32),request=hash(canonical(args)),existing=state.records?.[key];
 if(existing){if(!isSpecialistRecord(existing)||existing.specialist.request_sha256!==request)fail('operation replay differs');return copy(existing);}
 records(state);if(state.mode!=='preparation')fail('preparation capability only');if(state.paused&&['authorize','create'].includes(args.action))fail('company paused');
 if(['authorize','create'].includes(args.action)&&state.team_sha256!==teamHash(state))fail('pinned team integrity changed');
 const at=stamp();let type,payload,content;
 if(args.action==='authorize'){
  const p=args.policy;if(!policyShape(p)||p.base_roles.some(x=>!Object.hasOwn(state.roles??{},x))||Date.parse(p.expires_at)<=Date.parse(at)||Date.parse(p.expires_at)>Date.parse(at)+30*DAY)fail('invalid bounded policy');for(const id of p.input_ids)if(!Object.hasOwn(state.records??{},id)||state.records[id]?.id!==id)fail('policy input missing: '+id);
  type='policy';payload={policy:copy(p)};content='Founder-instruction-attributed temporary preparation creation policy; no execution, spending or competence grant. '+p.scope;
 }else if(args.action==='create'){
  const p=resolve(state,args.policy_ref,'policy'),q=p.specialist,d=args.definition;
  if(q.company_id!==state.id||!same(q.owner,state.owner)||q.team_sha256!==state.team_sha256||Date.now()>=Date.parse(q.policy.expires_at)||revoked(state,[reference(p)]))fail('creation policy is not current');
  if(!definitionShape(d)||!q.policy.base_roles.includes(d.base_role)||!Object.hasOwn(state.roles??{},d.base_role)||d.input_ids.some(x=>!q.policy.input_ids.includes(x))||Date.parse(d.expires_at)<=Date.parse(at)||Date.parse(d.expires_at)>Date.parse(at)+7*DAY||Date.parse(d.expires_at)>Date.parse(q.policy.expires_at))fail('invalid bounded profile definition');
  if(records(state).filter(r=>r.specialist.type==='profile'&&same(r.specialist.policy,reference(p))).length>=q.policy.max_profiles)fail('profile allowance exhausted');
  type='profile';payload={policy:reference(p),definition:copy(d),input_refs:d.input_ids.map(id=>{const r=Object.hasOwn(state.records??{},id)?state.records[id]:null;if(!r||r.id!==id)fail('profile data missing: '+id);return reference(r);}),base_charter:copy(state.roles[d.base_role])};content='Temporary '+d.charter.name+' owns this bounded preparation judgment: '+d.task+' Creation is not evidence of competence or result acceptance.';
 }else if(args.action==='revoke'){
  const target=resolve(state,args.target_ref);if(!isSpecialistRecord(target)||!['policy','profile'].includes(target.specialist.type)||target.specialist.company_id!==state.id)fail('exact policy/profile revocation target required');
  const completed_outputs=Object.values(state.jobs??{}).filter(j=>validateSpecialistBindingShape(j.specialist)&&same(j.specialist[target.specialist.type],args.target_ref)).map(j=>completedOutput(state,j)).filter(Boolean);
  if(completed_outputs.length>20)fail('revocation completion history exceeds the policy assignment bound');
  type='revocation';payload={target:reference(target),completed_outputs};content='Revoked future/active temporary specialist use; original definitions, completed evidence and uncertain execution remain retained.';
 }else {type='assessment';payload=assess(state,args,reviewCurrent);content='Receiver disposition of this exact independently reviewed preparation result: '+payload.disposition+' after QA '+resolve(state,payload.review).review.verdict+'. No general competence, business authority or publication.';}
 const body={version:1,type,company_id:state.id,owner:copy(state.owner),team_sha256:state.team_sha256,operation_id:args.operation_id,request_sha256:request,source_instruction:args.source_instruction,...payload};
 const record={id:key,kind:'artifact',content,author_role:'runner',author_instance:state.owner.session_id,revision:1,status:statuses[type]??'Specialist:'+payload.disposition,created_at:at,specialist:body};
 if(!isSpecialistRecord(record))fail('invalid canonical specialist record');
 if(type==='policy'&&Date.now()>=Date.parse(payload.policy.expires_at))fail('policy expired before creation');
 if(type==='profile')live(state,{profile:record,policy:resolve(state,payload.policy,'policy')});
 state.records[key]=record;return copy(record);
}
