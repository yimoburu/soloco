import {recordReadDeliveryPhase,recordReadDeliveryAdvance} from './record-read-delivery.mjs';
import {modelProcessTransition,modelProcessPhase} from './model-process-closure.mjs';
// Prospective only. Canonical classifications remain the preservation authority.
import {producerClosure,scopedPlanView,CORPUS_PARTITIONER} from './scoped-context.mjs';
import {retainSnapshot,captureSnapshotDependencies,validateSnapshotDependencies,operatingIntake,inheritSnapshots,hasSnapshotReferences,snapshotReference,snapshotEntryReference,resolveSnapshot,resolveSnapshotEntry,legacyHandoverSource} from './snapshot.mjs';
import {buildEvidence,readEvidence,validateSemanticDelivery} from './upgrade-evidence.mjs';
import {digest,id,stamp} from './store.mjs';
import {reviewedContext,recordReference,contextSource,currentExtensions,proofJobSafe,rejectedJobIdentities,canonicalEvidenceNodes} from './current-state.mjs';
import {mechanicalOperatingControl} from './operating-control.mjs';
import {specialistContext,validateSpecialistBindingShape} from './specialists.mjs';
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
// A terminal label alone never qualifies an upgrade. Only the existing exact
// canonical validator may establish this narrow recovered-source boundary.
function representedCurrent(s,id,projection=reviewedContext(s)){
  const source=contextSource(s,id);
  if(id.startsWith('upgrade:')&&source?.status!=='recovered')return null;
  const c=projection.classifications.get(id);
  if(c?.disposition!=='represented'||!projection.excluded(id))return null;
  const scoped=c.scoped_qualification??c.corpus_qualification;
  const plan=s.records?.[c.plan?.id],v=plan?.context_classification_plan;
  if(!scoped&&(!hasSnapshotReferences(source)&&!id.startsWith('upgrade:')||v?.version!==2||c.qualification?.protocol!==2||s.jobs?.[s.records?.[c.review.id]?.job_id]?.context_format!==4))return null;
  const p=scoped?{counterparts:scoped.homes}:v;
  if(!p.counterparts.length||!p.counterparts.every(ref=>{const h=s.records[ref.id];return h?.operating_record&&!hasSnapshotReferences(h)&&same(recordReference(h),ref);}))return null;
  for(const ref of p.counterparts)validateOperatingRecord(s.records[ref.id].operating_record);
  // Check exact vault availability without redelivering accepted bytes. No new
  // semantic classification is created by this traversal.
  const todo=[source],seen=new Set(),snapshots=new Set();
  while(todo.length){const value=todo.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
    const legacy=legacyHandoverSource(s,value);if(legacy){todo.push(legacy);continue;}
    const entry=snapshotEntryReference(value),ref=entry??snapshotReference(value);
    if(ref){const key=entry?entry.immutable_snapshot.sha256:ref.sha256;if(!snapshots.has(key)){snapshots.add(key);todo.push(entry?resolveSnapshotEntry(s,value):resolveSnapshot(s,value));}continue;}
    for(const child of Object.values(value))if(child&&typeof child==='object')todo.push(child);
  }
  return {c,p,scoped};
}
function currentUpgrade(s){
  const u=s.upgrade;if(!u||u.status!=='recovered')return u??null;
  const accepted=representedCurrent(s,'upgrade:'+u.id);if(!accepted)return u;
  return {source:recordReference(u,'upgrade:'+u.id),status:u.status,id:u.id,epoch:u.epoch??null,host:u.host??null,candidate_hash:u.candidate_hash??null,recovered_at:u.recovered_at??null,
    deadline_ms:u.deadline_ms??null,call_timeout_minutes:u.call_timeout_minutes??null,review_window_minutes:u.review_window_minutes??null,review_deadline_policy:u.review_deadline_policy??null,
    worker:u.worker??null,probe_status:u.probe_status??null,review_status:u.review_status??null,
    consumed:{cos_pages:u.cos_pages?.length??0,qa_pages:u.qa_pages?.length??0,cos_final:u.probe?1:0,qa_final:u.review?1:0},
    current_homes:accepted.p.counterparts,rule:'Recovered attempt remains historical evidence. No retry or remaining grant is inferred; all original gates still apply.'};
}
function controls(s,frozen){const {operating_state,...rest}=s;return {company_id:s.id,idea:s.idea,team_sha256:s.team_sha256,governance:s.governance,cos_instructions:s.cos_instructions,roles:s.roles,mode:s.mode,phase:s.phase,upgrade:frozen?(same(frozen.upgrade_source,s.upgrade?recordReference(s.upgrade,'upgrade:'+s.upgrade.id):null)?frozen.controls.upgrade:s.upgrade??null):currentUpgrade(s),extensions:currentExtensions(rest)};}
function exact(s,r){const v=contextSource(s,r.id);if(!v||!same(recordReference(v,r.id),r))fail('source/receipt changed: '+r.id);return v;}
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
function reviewJobSafe(j,handover=false){
  const {handover_reads,operating_delivery,...base}=j;
  if(operating_delivery!==undefined){try{if(handover)return false;validateFrozenOperatingDelivery(j,operating_delivery);}catch{return false;}}
  if(!proofJobSafe(base))return false;
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
  // Preserve only the exact receipt issued by successful v4 resume. Historical
  // acceptance is not a new review admission and does not renew owner authority.
  if(h?.status==='completed'&&t?.handover?.evidence_protocol===4){
    const a=h.acceptance;
    if(!closed(a,['reconstruction_id','review_id','subject_sha256','incoming_owner','at','receipts'])||a.reconstruction_id!==t.id||a.subject_sha256!==t.handover.subject_sha256||!same(a.incoming_owner,t.handover.incoming_owner)||!Number.isFinite(Date.parse(a.at))||!Array.isArray(a.receipts)||a.receipts.length!==3)fail('historical handover acceptance changed');
    const [target,review,job]=a.receipts.map(ref=>exact(s,ref));
    if(target.id!==t.id||review.id!==a.review_id||job.epoch!==a.incoming_owner.epoch||!same(a.receipts,[recordReference(t),recordReference(review),recordReference(job,'job:'+job.id)])||!reviewJobSafe(job,true)||!reviewRecordSafe(review,job,t,true))fail('historical handover receipt changed');
    ids.add(t.id);ids.add(review.id);jobs.add(job.id);
  }
  const a=s.operating_state;
  if(a){
    validateOperatingIndex(s);
    // Accepted immutable proof is historical evidence across owner epochs.
    // Only new in-flight review admission is fenced to the current epoch.
    for(const refs of [a.receipts]){const [t,r,j]=refs.map(ref=>exact(s,ref));ids.add(t.id);ids.add(r.id);jobs.add(j.id);}
  }
  return {ids,jobs};
}
// Corpus membership may admit only existing mechanical publication bookkeeping.
// This grants no exclusion: operatingFrontier still requires independent acceptance.
export function operatingProofOccurrences(s){
  const ids=new Set(),jobs=new Set();
  for(const r of Object.values(s.records??{})){
    const p=r.operating_plan;
    if(!p||!closed(r,['id','kind','revision','status','author_role','author_instance','content','operating_plan','created_at'])||r.kind!=='plan'||r.author_role!=='runner'||!closed(p,['protocol','version','snapshot','maintenance','source_instruction','valid_until'])||p.protocol!==OPERATING_PROTOCOL||p.version!==1)continue;
    const b=bookkeeping(s,r.id);
    for(const key of b.ids)if(key===r.id||s.records[key]?.review_of?.id===r.id)ids.add(key);
    for(const key of b.jobs)if(s.jobs[key]?.review_of?.id===r.id)jobs.add(key);
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
  for(const u of [...(s.upgrade_history??[]),...(s.upgrade?[s.upgrade]:[])])if((u===s.upgrade&&['queued','checking','ready','applied'].includes(u.status))||!p.excluded('upgrade:'+u.id))entries.push({source:recordReference(u,'upgrade:'+u.id),scope:'*',status:'DIRTY',reason:'Unknown legacy occurrence context'});
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
  const projection=reviewedContext(s),sources=new Map(),classifications=new Map(),homeSources=[],accepted_semantics=[];let seen;
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
    const accepted=representedCurrent(s,ref.id,projection);
    if(accepted){
      // SCOPED references identify resolved originals. Retain the independent
      // stored-envelope binding too; never compare an original hash to its
      // immutable-entry wrapper or discard the wrapper from the proof closure.
      const {c,p,scoped}=accepted,corpus=c.corpus_qualification;
      const stored=r=>{const raw=contextSource(s,r.id),resolved=resolveSnapshotEntry(s,raw);if(!resolved||!same(recordReference(resolved,r.id),r))fail('scoped original changed: '+r.id);return recordReference(raw,r.id);};
      const readScoped=r=>resolveSnapshotEntry(s,exact(s,stored(r)));
      const review=scoped?readScoped(c.review):exact(s,c.review),job=s.jobs[review.job_id];
      const resolvedProof=scoped?[c.source,c.plan,...(corpus?(corpus.claim.protocol==='corpus-preservation-claim-reference-v1'?corpus.source_mappings.map(x=>x.source):corpus.claim.sources.map(x=>x.source)):[]),...scoped.receipts.flatMap(r=>[r.review,r.job,r.target]),...scoped.receipts.map(r=>readScoped(r.target).scoped_context_target.plan)]:null;
      const proof=scoped?resolvedProof.map(stored):[c.source,c.plan,c.review,recordReference(job,'job:'+job.id),...(c.qualification.legacy_dependencies??[])];
      // Resolve originals before collecting canonical producer edges. Explicit
      // source lists intentionally leave producer_dependencies empty.
      const producers=new Map(),historicalProducers=new Map();
      for(const r of proof){const closure=originalProducers(s,exact(s,r));for(const producer of closure.current)producers.set(producer.id,producer);for(const producer of closure.historical)historicalProducers.set(JSON.stringify([producer.company_sha256,producer.source]),producer);}
      const originals=[...new Map([...proof,...producers.values()].map(r=>[r.id,r])).values()];
      for(const r of originals){exact(s,r);sources.set(r.id,{source:r,accepted_original:true});seen.add(r.id);}
      classifications.set(ref.id,c);
      // Full canonical semantic judgments are current evidence; extraction raw
      // bundles and frozen proof plans remain exact retrievable originals.
      const judgments=scoped?scoped.receipts.map(r=>{const record=readScoped(r.review),target=readScoped(r.target).scoped_context_target;return {review:stored(r.review),job:readScoped(r.job),target:stored(r.target),phase:target.phase,result:record.qualification_result};}):undefined;
      if(!accepted_semantics.some(x=>corpus?x.corpus_integration?.id===corpus.integration.id:x.source.id===ref.id))accepted_semantics.push({source:ref,classification:c,...(corpus?{corpus_integration:corpus.integration,source_mappings:corpus.source_mappings,source_set:corpus.selected_source_ids}:{}),...(scoped?{judgments,resolved_originals:resolvedProof}:{coverage:p.coverage,review,job}),counterparts:p.counterparts,producer_refs:[...producers.values()],historical_producers:[...historicalProducers.values()],author_identities:[...new Set(originals.flatMap(r=>[...originalIdentities(s,exact(s,r))]))].sort(),exact_originals:originals,retrieval:'company_context read with exact ID/hash; historical producer envelopes use exact immutable snapshot reads and remain bound to their frozen containing company; no historical reference is a current source or permission'});
      return;
    }
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
  for(const h of homes){seen=new Set();
    // Initial homes can cite canonical extraction receipts by plain ID. Seed
    // their already accepted corpus closure through its stored source envelope
    // before walking receipt parents containing immutable snapshot plans. Only
    // exact independently accepted counterparts and runtime plan bindings qualify.
    // Plan records may differ when their fully validated frozen extraction identity is shared.
    if(h.value.bootstrap_home_provenance){
      const homePlan=exact(s,h.value.bootstrap_home_provenance.plan);
      const homeView=scopedPlanView(s,{plan_id:homePlan.id,limit:1});
      for(const c of projection.classifications.values()){
        const corpus=c.corpus_qualification;
        if(corpus&&homeView.partitioner===CORPUS_PARTITIONER&&homeView.extraction_identity===corpus.extraction_identity&&corpus.homes.some(ref=>same(ref,h.source))){
          const stored=contextSource(s,c.source.id);if(!stored)fail('provenance source missing: '+c.source.id);
          add(recordReference(stored,c.source.id));
        }
      }
    }
    for(const key of [...h.value.operating_record.evidence_refs,...h.value.operating_record.authority_refs,...(h.value.operating_record.grant_refs??[]),...(h.value.operating_record.historical_receipts??[])]){
    const value=contextSource(s,key);if(!value)fail('provenance source missing: '+key);add(recordReference(value,key));
  }
  homeSources.push({home_id:h.source.id,sources:[...seen].sort().map(id=>sources.get(id).source)});}
  return {accepted_semantics,home_sources:homeSources,sources:[...sources.values()].sort((a,b)=>a.source.id.localeCompare(b.source.id)),classifications:[...classifications].sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>({id,value}))};
}
// Frozen envelopes are version-qualified through their own immutable map, never
// today's contextSource. Historical applicability is evaluated only at bootstrap.
function census(s){
  const values=[];
  for(const [key,value] of Object.entries(s.records??{})){if(key!==value.id)fail('ambiguous record occurrence');values.push([key,value]);}
  for(const [key,value] of Object.entries(s.jobs??{})){if(key!==value.id)fail('ambiguous job occurrence');values.push(['job:'+key,value]);}
  for(const value of [...(s.upgrade_history??[]),...(s.upgrade?[s.upgrade]:[])])values.push(['upgrade:'+value.id,value]);
  if(new Set(values.map(([key])=>key)).size!==values.length)fail('ambiguous source census');
  return values.map(([key,value])=>({source:recordReference(value,key),envelope:retainSnapshot(s,value)})).sort((a,b)=>a.source.id.localeCompare(b.source.id));
}
function envelopes(s,entries){return resolveSnapshot(s,entries).map(x=>{const value=resolveSnapshot(s,x.envelope);if(!same(recordReference(value,x.source.id),x.source))fail('frozen envelope changed');return {source:x.source,value};});}
function archiveCheck(s,snapshot){
  const seen=new Set();let oldest=snapshot;
  for(;;){
    const key=sha(oldest);if(seen.has(key))fail('cyclic accepted checkpoint ancestry');seen.add(key);
    archiveCheckpoint(s,oldest);
    if(!oldest.previous_index)break;
    oldest=resolveSnapshot(s,oldest.previous_index).accepted_snapshot;
  }
  // Reuse the storage-owned validator for old normalized values and journal
  // children, including versions no longer present in today's baseline. This is
  // mechanical archive work; none of these bytes reenter native review.
  operatingIntake(s,oldest.intake_baseline);
}
function archiveCheckpoint(s,snapshot){
  const preservation=resolveSnapshot(s,snapshot.preservation);
  for(const [entries,root] of [[preservation.census,snapshot.preservation],[snapshot.census,{census:snapshot.census,homes:snapshot.home_envelopes,delta:snapshot.delta,previous:snapshot.previous}]]){
    const view=frozenState(s,entries),captured=captureSnapshotDependencies(view,()=>true,{root});validateSnapshotDependencies(view,captured.dependencies);
    envelopes(view,entries);
  }
  envelopes(s,snapshot.home_envelopes);
  const intake=resolveSnapshot(s,snapshot.delta),previous=snapshot.previous_index?resolveSnapshot(s,snapshot.previous_index):null;
  if(!same(intake.cut,snapshot.input_cut)||['version','layout','seq','event_sha256','root'].some(key=>!same(snapshot.input_cut[key],snapshot.intake_baseline[key]))||snapshot.base!==(previous?sha(previous):null)||intake.baseline_sha256!==(previous?previous.accepted_snapshot.intake_baseline.sha256:snapshot.intake_baseline.sha256))fail('frozen intake/base cut changed');
  // Storage verifies each raw envelope. Application references inside its JSON
  // STRING must additionally be parsed and checked under the exact before/after
  // record version map, including intermediate versions later changed again.
  visitIntakeBoundaries(frozenState(s,snapshot.census),intake);
}
function visitIntakeBoundaries(endpoint,intake,visit=()=>{}){
  const view=inheritSnapshots(endpoint,{...endpoint,records:Object.assign(Object.create(null),endpoint.records)});
  const check=ref=>{if(!ref)return;if(typeof ref.raw!=='string')fail('complete storage intake bytes required');const value=JSON.parse(ref.raw);if(hasSnapshotReferences(value)){const captured=captureSnapshotDependencies(view,()=>true,{root:value});validateSnapshotDependencies(view,captured.dependencies);}visit(ref,value,view);};
  // One storage event is atomic: inspect its entire after set before restoring
  // the entire before set. Never resolve a locator against a mixed record map.
  for(const event of [...intake.events].reverse()){
    for(const change of event.changes)check(change.after);
    for(const change of event.changes){const ref=change.before??change.after;if(ref?.family!=='records')continue;if(change.before)view.records[ref.key]=JSON.parse(change.before.raw);else delete view.records[ref.key];}
    for(const change of event.changes)check(change.before);
  }
}
function negatives(s){
  // Full negative bodies are retained in the immutable census. Unchanged paid
  // history reuses its independently accepted meaning; any new/changed negative
  // has a different exact reference and its full before/after bytes enter delta.
  const collect=(values,job)=>Object.entries(values??{}).filter(([,raw])=>{const value=resolveSnapshotEntry(s,raw);return job?Boolean(value.rejected_output):value.status==='Submitted'&&['Fail','Blocked'].includes(value.review?.verdict);}).map(([key,raw])=>recordReference(raw,job?'job:'+key:key)).sort((a,b)=>a.id.localeCompare(b.id));
  return {reviews:collect(s.records,false),rejected:collect(s.jobs,true)};
}
function boundary(s,frozen){return {owner:s.owner,paused:s.paused,controls:controls(s,frozen),communication:{notices:s.notices??[],messages:s.messages??[]},classifications:s.context_classifications??{},negative_findings:negatives(s)};}
function frozenState(s,entries){const v=inheritSnapshots(s,{...s,records:Object.create(null),jobs:Object.create(null),upgrade:null,upgrade_history:[]});for(const {source,value} of envelopes(s,entries)){if(source.id.startsWith('job:'))v.jobs[source.id.slice(4)]=value;else if(source.id.startsWith('upgrade:'))v.upgrade_history.push(value);else v.records[source.id]=value;}return v;}
function capture(s,plan_id){
  let f,evidence,preservation;
  if(!s.operating_state){
    // BEFORE writing even the proposal: canonical validators qualify the entire
    // old census. Unqualified occurrences stay explicitly DIRTY.
    f=operatingFrontier(s,{plan_id});evidence=publicationEvidence(s,f.homes);
    preservation=retainSnapshot(s,{census:census(s),classifications:s.context_classifications??{},evidence,controls:controls(s),upgrade_source:s.upgrade?recordReference(s.upgrade,'upgrade:'+s.upgrade.id):null});
  }else{
    validateOperatingIndex(s);archiveCheck(s,s.operating_state.accepted_snapshot);
    preservation=s.operating_state.accepted_snapshot.preservation;
    f={homes:Object.values(s.records??{}).filter(r=>r.operating_record).map(value=>({source:recordReference(value),value})),entries:[]};
    for(const h of f.homes)validateOperatingRecord(h.value.operating_record);
  }
  const frozen=resolveSnapshot(s,preservation),cut=operatingIntake(s,s.operating_state?.accepted_snapshot.intake_baseline);
  const homes=f.homes.sort((a,b)=>a.source.id.localeCompare(b.source.id));
  for(const h of homes)for(const key of h.value.operating_record.dependencies)if(!homes.some(x=>x.source.id===key))fail('current dependency missing: '+key);
  const all=census(s),home_envelopes=homes.map(h=>all.find(x=>same(x.source,h.source)));
  const snapshot={protocol:OPERATING_PROTOCOL,preservation,predecessor:s.operating_state?.plan??null,base:s.operating_state?sha(s.operating_state):null,previous_index:s.operating_state?retainSnapshot(s,s.operating_state):null,intake_baseline:cut.baseline,input_cut:cut.intake.cut,delta:retainSnapshot(s,cut.intake),previous:s.operating_state?retainSnapshot(s,{homes:s.operating_state.accepted_snapshot.home_envelopes,communication:s.operating_state.accepted_snapshot.communication,controls:s.operating_state.accepted_snapshot.controls}):null,census:retainSnapshot(s,all),home_envelopes,homes:homes.map(h=>h.source),home_predicates:homes.map(h=>({id:h.source.id,scope:h.value.operating_record.scope,dependencies:h.value.operating_record.dependencies})),frontier:f.entries,...boundary(s,frozen),handover:structuredClone(s.handover??null),required_sources:[],home_sources:[],provenance:[]};
  archiveCheck(s,snapshot);return snapshot;
}
export function proposeOperatingState(s,args){
  const key=id('operating-plan'),snapshot=capture(s,key);
  for(const h of envelopes(s,snapshot.home_envelopes))for(const key of [...h.value.operating_record.evidence_refs,...h.value.operating_record.authority_refs,...(h.value.operating_record.historical_receipts??[]),...(h.value.operating_record.grant_refs??[])])if(!contextSource(s,key))fail('provenance source missing: '+key);
  const plan={protocol:OPERATING_PROTOCOL,version:1,snapshot,maintenance:args.maintenance===true,source_instruction:args.source_instruction,valid_until:args.valid_until??null};validTime(plan.valid_until);
  s.records[key]={id:key,kind:'plan',revision:1,status:'Draft',author_role:'runner',author_instance:s.owner.session_id,content:'Proposed current operating meaning; no authority, acceptance or legacy retirement.',operating_plan:plan,created_at:stamp()};
  return {id:key,revision:1,plan_sha256:sha(plan),frontier:snapshot.frontier,held:snapshot.frontier.length>0};
}
// Runtime-owned bounded preparation assignment. The immutable admission binds
// every static field and exact input body; lifecycle metadata grants no authority.
const assignmentMutable=['delivered_record_reads','model_process_tracking','native_id','status','worker_pid','started_at','finished_at','execution_started_at','execution_deadline_at','termination_deadline_at','model_evidence','retrieved_inputs','proposal_reads','artifact_id','coordination_release'];
const assignmentStatic=j=>Object.fromEntries(Object.entries(j).filter(([k])=>!assignmentMutable.includes(k)&&k!=='operating_admission'));
export function admitOperatingAssignment(s,j){
  operatingContext(s);
  if(s.paused||s.mode!=='preparation'||j.context_format!==6||j.review_of||j.prototype_id||j.development_id||j.coordination||j.fresh_session)fail('only bounded runtime preparation assignments supported');
  j.operating_admission=retainSnapshot(s,{producer:j.output_contract==='operating-proposal-v1'?'runtime-bounded-proposal-v1':'runtime-bounded-read-only-v1',checkpoint:s.operating_state.plan,owner:s.owner,assignment:JSON.parse(JSON.stringify(assignmentStatic(j))),inputs:j.inputs.map(r=>recordReference(s.records[r.id])),...(j.output_contract==='operating-proposal-v1'?{input_bodies:j.inputs.map(r=>s.records[r.id])}:{}),authority:'preparation only; native tools disabled; no spending or exposure authority'});
}
function assignmentSafe(s,j){
  try{
    if(j.specialist!==undefined)specialistContext(s,j);
    const {operating_admission,output_contract,proposal_reads,...base}=j,a=resolveSnapshot(s,operating_admission);
    const producer=output_contract===undefined?'runtime-bounded-read-only-v1':output_contract==='operating-proposal-v1'?'runtime-bounded-proposal-v1':null;
    if(!closed(a,['producer','checkpoint','owner','assignment','inputs','authority',...(output_contract==='operating-proposal-v1'?['input_bodies']:[])])||(!producer||a.producer!==producer)||a.authority!=='preparation only; native tools disabled; no spending or exposure authority'||!same(a.checkpoint,s.operating_state?.plan)||!same(a.owner,s.owner)||!same(a.assignment,assignmentStatic(j))||!proofJobSafe(base)||j.context_format!==6||j.review_of!==null||!['queued','running','completed'].includes(j.status)||s.mode!=='preparation')return false;
    if(!same(a.inputs,j.inputs.map(r=>recordReference(s.records[r.id]))))return false;
    if(output_contract==='operating-proposal-v1'&&!same(a.input_bodies,j.inputs.map(r=>s.records[r.id])))return false;
    if(proposal_reads!==undefined&&(output_contract!=='operating-proposal-v1'||!Array.isArray(proposal_reads)||proposal_reads.some(r=>!closed(r,['id','sha256','body'])||sha(resolveSnapshot(s,r.body))!==r.sha256||!j.retrieved_inputs?.some(ref=>ref.id===r.id&&ref.sha256===r.sha256))))return false;
    if(output_contract==='operating-proposal-v1'&&j.retrieved_inputs?.some(ref=>!proposal_reads?.some(r=>r.id===ref.id&&r.sha256===ref.sha256)))return false;
    if(j.supplemental_sources?.some(r=>!same(recordReference(contextSource(s,r.id),r.id),r)))return false;
    if(j.status==='queued'&&(j.started_at||j.execution_started_at||j.artifact_id||j.coordination_release))return false;
    if(j.status==='running'&&(!j.started_at||!Number.isSafeInteger(j.worker_pid)||j.artifact_id||j.coordination_release))return false;
    if(j.status==='completed'&&(!j.artifact_id||j.coordination_release?.termination_confirmed!==true||!j.native_id))return false;
    return true;
  }catch{return false;}
}
// A proposal is attributable evidence for declared consumers, never a new rule
// or an accepted home. Only this opt-in producer and exact completion event can
// establish it; legacy/free-form artifacts keep the original reconciliation path.
function operatingProposal(s,j,r){
  return j?.output_contract==='operating-proposal-v1'&&assignmentSafe(s,j)&&j.status==='completed'
    &&closed(r,['id','kind','content','author_role','author_instance','revision','status','job_id','inputs','retrieved_inputs','review_of','review','created_at'])
    &&r.id===j.artifact_id&&r.kind==='artifact'&&r.status==='Submitted'&&r.revision===1&&typeof r.content==='string'
    &&r.job_id===j.id&&r.author_role===j.role&&r.author_instance===j.instance_id&&r.review_of===null&&r.review===null
    &&same(r.inputs,j.inputs)&&same(r.retrieved_inputs??[],j.retrieved_inputs??[])
    &&!(j.model_evidence?.cli_observed_negative_outputs?.length);
}
// Only exact producer bookkeeping can commute. Check every intermediate old/new
// value, including mutations that are subsequently reverted.
function inputUnchanged(s,snapshot,planId){
  const frozen=resolveSnapshot(s,snapshot.preservation),intake=operatingIntake(s,snapshot.intake_baseline).intake;
  visitIntakeBoundaries(s,intake);
  const baseline=new Map(envelopes(s,snapshot.census).map(x=>[x.source.id,x.source]));
  const b=bookkeeping(s,planId),commands=new Set(),targets=new Set();
  let paused=snapshot.paused,handover=snapshot.handover??null;
  const roots=new Map([['paused',[paused]],['handover',[handover]]]);
  const targetSafe=t=>t&&closed(t,['id','kind','revision','status','author_role','author_instance','content','created_at','handover'])&&t.kind==='artifact'&&t.revision===1&&t.status==='Submitted'&&t.author_role==='runner'&&t.author_instance===s.owner.session_id&&text(t.content)&&closed(t.handover,['id','evidence_protocol','subject_sha256','subject','incoming_owner','input_refs'])&&t.handover.id===handover?.id&&t.handover.evidence_protocol===4&&same(t.handover.incoming_owner,s.owner)&&sha(t.handover.subject)===t.handover.subject_sha256&&same(t.handover.subject.operating_checkpoint?.acceptance,s.operating_state?.receipts);
  for(const event of intake.events){
    if(event.payload?.storage_delta&&(!closed(event.payload,['revision','owner','storage_delta'])||!same(event.payload.owner,snapshot.owner)||!Number.isSafeInteger(event.payload.revision)))fail('DIRTY unknown storage producer payload');
    const changes=event.changes.map(c=>({before:c.before?{...c.before,value:JSON.parse(c.before.raw)}:null,after:c.after?{...c.after,value:JSON.parse(c.after.raw)}:null}));
    const audits=changes.filter(c=>!c.before&&c.after?.family==='records'&&mechanicalOperatingControl(c.after.value)&&event.type==='company.'+c.after.value.action&&c.after.value.recorded_by===snapshot.owner.session_id&&same(c.after.value,s.records[c.after.key]));
    for(const c of audits)commands.add(c.after.key);
    for(const c of changes){
      const ref=c.after??c.before;
      if(ref.family!=='root'||!['paused','handover'].includes(ref.key))continue;
      if(ref.key==='paused'){
        if(!same(c.before?.value,paused)||!audits.some(a=>['pause','resume'].includes(a.after.value.action)&&c.after?.value===(a.after.value.action==='pause')))fail('DIRTY unvalidated pause/resume transition');
        paused=c.after.value;roots.get('paused').push(paused);
      }else{
        if(!same(c.before?.value??null,handover))fail('DIRTY handover transition base changed');
        const after=c.after?.value;
        if(event.type==='handover.reconstruction_submitted'){
          const t=s.records[after?.reconstruction_id];
          if(!handover||handover.status!=='pending'||!targetSafe(t)||!same(after,{...handover,reconstruction_id:t.id})||!changes.some(x=>!x.before&&x.after?.family==='records'&&x.after.key===t.id&&same(x.after.value,t)))fail('DIRTY reconstruction bookkeeping changed');
          targets.add(t.id);
        }else if(event.type==='company.resume'){
          if(!audits.some(a=>a.after.value.action==='resume')||handover?.status!=='pending'||!same(after,{...handover,status:'completed',acceptance:after?.acceptance}))fail('DIRTY handover completion changed');
          const a=after.acceptance,t=s.records[handover.reconstruction_id];
          if(!a||a.reconstruction_id!==t?.id||a.subject_sha256!==t.handover.subject_sha256||!same(a.incoming_owner,s.owner)||!same(a.receipts,[recordReference(t),recordReference(s.records[a.review_id]),recordReference(s.jobs[s.records[a.review_id]?.job_id],'job:'+s.records[a.review_id]?.job_id)]))fail('DIRTY handover acceptance changed');
        }else fail('DIRTY unsupported handover transition');
        handover=after;roots.get('handover').push(after);
      }
    }
  }
  if(!same(boundary(s,frozen),{owner:snapshot.owner,paused,controls:snapshot.controls,communication:snapshot.communication,classifications:snapshot.classifications,negative_findings:snapshot.negative_findings})||!same(s.handover??null,handover))fail('DIRTY proposal controls, communication or negative findings changed');
  // The reconstruction target is subject to independent exact resume QA; it is
  // admitted only by its producer event, never by an arbitrary artifact label.
  for(const key of targets)b.ids.add(key);
  const ordinary=new Set(Object.values(s.jobs??{}).filter(j=>assignmentSafe(s,j)&&intake.events.some(event=>event.type==='job.queued'&&event.changes.some(c=>!c.before&&c.after?.family==='jobs'&&c.after.key===j.id&&same(JSON.parse(c.after.raw).operating_admission,j.operating_admission)&&assignmentSafe(s,JSON.parse(c.after.raw))))).map(j=>j.id));
  for(const event of intake.events)for(const change of event.changes){
    const ref=change.after??change.before;
    if(ref?.family==='jobs'&&b.jobs.has(ref.key)&&event.payload?.storage_delta&&!['job.queued','job.started','job.execution_started','job.model_process.requested','job.model_process.born','job.model_process.closed','job.record_reads_delivered','job.evidence_read','job.evidence_delivered','job.operating_evidence_delivered','job.completed'].includes(event.type))fail('DIRTY unsupported proof metadata producer');
    if(ref?.family==='jobs'&&event.type.startsWith('job.model_process.')){const before=change.before?JSON.parse(change.before.raw):null,after=change.after?JSON.parse(change.after.raw):null;if(!modelProcessTransition(before,after,event.type)||!same(Object.fromEntries(Object.entries(before??{}).filter(([k])=>k!=='model_process_tracking')),Object.fromEntries(Object.entries(after??{}).filter(([k])=>k!=='model_process_tracking'))))fail('DIRTY original model process producer changed');}
    if(ref?.family==='jobs'&&event.type==='job.record_reads_delivered'){
      const before=change.before?JSON.parse(change.before.raw):null,after=change.after?JSON.parse(change.after.raw):null;
      if(!before||!after||!recordReadDeliveryAdvance(before.delivered_record_reads,after.delivered_record_reads)||!same(Object.fromEntries(Object.entries(before).filter(([k])=>k!=='delivered_record_reads')),Object.fromEntries(Object.entries(after).filter(([k])=>k!=='delivered_record_reads'))))fail('DIRTY record READ delivery producer changed');
    }
    if(ref?.family!=='jobs'||!ordinary.has(ref.key))continue;
    const before=change.before?JSON.parse(change.before.raw):null,after=change.after?JSON.parse(change.after.raw):null;
    const fields={
      'job.queued':null,
      'job.started':['status','started_at','worker_pid'],
      'job.model_process.requested':['model_process_tracking'],
      'job.model_process.born':['model_process_tracking'],
      'job.model_process.closed':['model_process_tracking'],
      'job.execution_started':['execution_started_at','execution_deadline_at','termination_deadline_at'],
      'job.evidence_read':['retrieved_inputs','proposal_reads'],
      'job.record_reads_delivered':['delivered_record_reads'],
      'job.completed':['status','artifact_id','finished_at','native_id','coordination_release','model_evidence']
    };
    if(!Object.hasOwn(fields,event.type)||!after)fail('DIRTY unsupported assignment metadata producer');
    if(event.type==='job.queued'){
      if(before||after.status!=='queued')fail('DIRTY assignment admission event changed');
    }else{
      const keys=fields[event.type];
      if(!before||!same(Object.fromEntries(Object.entries(before).filter(([k])=>!keys.includes(k))),Object.fromEntries(Object.entries(after).filter(([k])=>!keys.includes(k)))))fail('DIRTY assignment phase changed bound metadata');
      if(event.type==='job.started'?(before.status!=='queued'||after.status!=='running'):event.type==='job.completed'?(before.status!=='running'||after.status!=='completed'):before.status!=='running'||after.status!=='running')fail('DIRTY assignment phase changed');
    }
  }
  const proposals=new Set();
  for(const key of ordinary){
    const j=s.jobs[key],r=s.records[j.artifact_id];
    if(!operatingProposal(s,j,r))continue;
    const created=intake.events.filter(event=>event.type==='job.completed'&&event.changes.some(c=>!c.before&&c.after?.family==='records'&&c.after.key===r.id&&same(JSON.parse(c.after.raw),r))&&event.changes.some(c=>c.after?.family==='jobs'&&c.after.key===j.id&&same(JSON.parse(c.after.raw),j)));
    if(created.length===1)proposals.add(r.id);
  }
  const stable=j=>Object.fromEntries(Object.entries(j??{}).filter(([k])=>!assignmentMutable.includes(k)&&!['handover_reads','operating_delivery'].includes(k)));
  const phaseSafe=(value,current)=>{
    for(const key of [...assignmentMutable,'handover_reads','operating_delivery']){
      if(!Object.hasOwn(value,key)||key==='status')continue;
      if(key==='native_id'&&value[key]===null)continue;
      if(key==='delivered_record_reads'){if(!recordReadDeliveryPhase(value[key],current[key]))return false;continue;}
      if(key==='model_process_tracking'){if(!modelProcessPhase(value[key],current[key]))return false;continue;}
      if(['retrieved_inputs','handover_reads','proposal_reads'].includes(key)){
        if(!Array.isArray(value[key])||!Array.isArray(current[key])||!value[key].every((v,i)=>same(v,current[key][i])))return false;
      }else if(!same(value[key],current[key]))return false;
    }
    return true;
  };
  const allowed=(family,key,value)=>{
    if(family==='records')return (b.ids.has(key)||commands.has(key)||proposals.has(key))&&same(value,s.records[key]);
    if(family==='jobs')return (b.jobs.has(key)&&reviewJobSafe(value,Boolean(s.records[value.review_of?.id]?.handover))||ordinary.has(key)&&assignmentSafe(s,value))&&same(stable(value),stable(s.jobs[key]))&&phaseSafe(value,s.jobs[key]);
    if(family==='sessions')return Object.values(s.jobs??{}).some(j=>(b.jobs.has(j.id)||ordinary.has(j.id))&&j.session_key===key&&closed(value,['instance_id','role','native_id','host','model_selection','specialist'])&&(value.specialist===undefined?j.specialist===undefined:validateSpecialistBindingShape(value.specialist)&&same(value.specialist,j.specialist))&&value.instance_id===j.instance_id&&value.role===j.role&&value.host===j.host&&same(value.model_selection,j.model_selection)&&[null,j.native_id].includes(value.native_id));
    if(family==='root'&&roots.has(key))return roots.get(key).some(v=>same(v,value));
    if(family==='root'&&key==='operating_state')return sha(value)===snapshot.base||same(value,s.operating_state);
    if(family==='shape')return ['records','jobs','sessions'].includes(key)&&value==='object';
    if(family==='root'&&['revision','updated_at'].includes(key))return typeof value===(key==='revision'?'number':'string');
    if(family==='root'&&key==='runtime_version')return value===s.runtime_version;
    return false;
  };
  for(const x of census(s))if(!same(x.source,baseline.get(x.source.id))&&!allowed(x.source.id.startsWith('job:')?'jobs':'records',x.source.id.replace(/^job:/,''),resolveSnapshot(s,x.envelope)))fail('DIRTY semantic intake changed: '+x.source.id);
  for(const [key] of baseline)if(!contextSource(s,key))fail('source deleted after proposal: '+key);
  for(const event of intake.events)for(const change of event.changes){
    const ref=change.after??change.before,sourceId=ref?.family==='jobs'?'job:'+ref.key:ref?.key;
    if(['records','jobs'].includes(ref?.family)&&(!change.after||!change.before&&baseline.has(sourceId)))fail('DIRTY source deleted or recreated during intake: '+sourceId);
  }
  for(const event of intake.events)for(const change of event.changes)for(const ref of [change.before,change.after])if(ref){
    if(typeof ref.raw!=='string')fail('complete storage intake bytes required');
    const value=JSON.parse(ref.raw),sourceId=ref.family==='jobs'?'job:'+ref.key:ref.key;
    if(['records','jobs'].includes(ref.family)&&baseline.has(sourceId)&&same(recordReference(value,sourceId),baseline.get(sourceId)))continue;
    if(!allowed(ref.family,ref.key,value))fail('DIRTY concurrent storage intake requires new proposal: '+ref.family+':'+ref.key);
  }
}
function livePlan(s,target){
  const p=target?.operating_plan;if(p?.protocol!==OPERATING_PROTOCOL)fail('proposal protocol changed');
  if(p.snapshot.base!==(s.operating_state?sha(s.operating_state):null))fail('exact base checkpoint changed');
  archiveCheck(s,p.snapshot);inputUnchanged(s,p.snapshot,target.id);validTime(p.valid_until);return p;
}
function validTime(until,now=Date.now()){if(until!==null&&(!Number.isFinite(Date.parse(until))||now>=Date.parse(until)))fail('wall-clock validity expired');}
export function operatingMaintenanceEligible(s,j){try{const t=s.records?.[typeof j.review_of==='string'?j.review_of:j.review_of?.id],p=livePlan(s,t);return Boolean(s.paused&&p.maintenance&&text(p.source_instruction)&&j.role==='qa'&&!j.prototype_id&&!j.development_id);}catch{return false;}}
function deltaReviewView(s,snapshot){
  const delta=resolveSnapshot(s,snapshot.delta),accepted=snapshot.previous_index?resolveSnapshot(s,snapshot.previous_index):null;
  if(!accepted)return delta;
  const originals=new Map();
  const expanded=new Map();
  const expand=(ref,parsed,view)=>{
    if(!ref)return null;
    const todo=[parsed],seen=new Set(),bindings=[];
    while(todo.length){const value=todo.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
      const legacy=legacyHandoverSource(view,value),entry=snapshotEntryReference(value),snapshotRef=entry??snapshotReference(value);
      if(legacy||snapshotRef){
        const body=legacy??(entry?resolveSnapshotEntry(view,value):resolveSnapshot(view,value)),raw=JSON.stringify(body),sha256=digest(raw),source_id='delta-original:'+sha256;
        bindings.push({source_id,sha256});if(!originals.has(sha256)){originals.set(sha256,{source_id,sha256,original_reference:value,raw,rule:'Complete changed-source original; required semantic evidence, not a delivered pointer.'});todo.push(body);}continue;
      }
      for(const child of Object.values(value))if(child&&typeof child==='object')todo.push(child);
    }
    return bindings.length?{...ref,required_originals:bindings}:ref;
  };
  // These are the exact producer-owned plan/index writes of the already
  // accepted publication. Its complete meaning is delivered as previous S.
  // Keep original bytes in the verified intake/vault, and expose exact handles
  // instead of replaying its captured archive indexes as new semantic material.
  const plan=exact(s,accepted.plan);
  const compact=ref=>({original:{family:ref.family,key:ref.key,position:ref.position,sha256:ref.sha256,encoding:ref.encoding,snapshot:{immutable_snapshot:{version:1,sha256:ref.sha256,characters:ref.raw.length,shape:'object'}}},accepted_publication:accepted.plan,meaning:'Previously independently accepted publication bookkeeping only; complete current meaning is in previous S. The exact original remains retrievable.'});
  const publication=(event,{before,after})=>event.type==='operating.apply'&&after?.family==='root'&&after.key==='operating_state'&&same(JSON.parse(after.raw),accepted)&&(before?before.sha256===accepted.accepted_snapshot.base:accepted.accepted_snapshot.base===null);
  const priorPlan=(event,{before,after})=>event.type==='operating.plan'&&!before&&after?.family==='records'&&after.key===accepted.plan.id&&same(JSON.parse(after.raw),plan);
  const compactRefs=new Set(delta.events.flatMap(event=>event.changes.filter(change=>publication(event,change)||priorPlan(event,change)).flatMap(change=>[change.before,change.after])));
  visitIntakeBoundaries(frozenState(s,snapshot.census),delta,(ref,value,view)=>{if(!compactRefs.has(ref))expanded.set(ref,expand(ref,value,view));});
  const events=delta.events.map(event=>({...event,changes:event.changes.map(change=>{
    const after=change.after,before=change.before;
    return publication(event,change)?{before:before?compact(before):null,after:compact(after)}:priorPlan(event,change)?{before:null,after:compact(after)}:{before:before?expanded.get(before):null,after:after?expanded.get(after):null};
  })}));
  return {...delta,projection:'operating-semantic-intake-v1',events,required_originals:[...originals.values()]};
}
function negativeReviewView(s,snapshot){
  const current=snapshot.negative_findings,previous=snapshot.previous_index?resolveSnapshot(s,snapshot.previous_index).accepted_snapshot.negative_findings:null;
  if(!previous)return current;
  const refs=v=>[...v.reviews,...v.rejected],old=refs(previous),now=refs(current),summary=v=>({sha256:sha(v),reviews:v.reviews.length,rejected:v.rejected.length});
  return {accepted_inventory:summary(previous),current_inventory:summary(current),changed:now.filter(ref=>!old.some(before=>same(before,ref))),removed:old.filter(ref=>!now.some(after=>same(after,ref))),rule:'Unchanged negatives reuse complete accepted obligations in previous S. Every new/changed/deleted source has complete before/after intake bytes; these references grant no permission or resolution.'};
}
export function operatingReviewContext(s,j){
  const t=s.records?.[j.review_of?.id];if(!t?.operating_plan)return null;
  const p=livePlan(s,t);if(j.role!=='qa'||j.prototype_id||j.development_id)fail('existing independent QA role required');
  const frozen=resolveSnapshot(s,p.snapshot.preservation);
  const f={homes:envelopes(s,p.snapshot.home_envelopes),communication:p.snapshot.communication,entries:p.snapshot.frontier};
  const evidence=s.operating_state?{sources:[],accepted_semantics:[],classifications:[]}:frozen.evidence;
  let inlineCharacters=0;const inline=evidence.sources.filter(x=>{if(x.accepted_original)return false;const n=JSON.stringify(x.value).length;if(n>16000||inlineCharacters+n>64000)return false;inlineCharacters+=n;return true;});
  const target=s.operating_state?{source:recordReference(t),kind:t.kind,status:t.status,author_role:t.author_role,author_instance:t.author_instance,content:t.content,created_at:t.created_at,operating_plan:{protocol:p.protocol,version:p.version,maintenance:p.maintenance,source_instruction:p.source_instruction,valid_until:p.valid_until,plan_sha256:sha(p),snapshot_sha256:sha(p.snapshot),base:p.snapshot.base,input_cut:p.snapshot.input_cut,preservation:p.snapshot.preservation},rule:'Exact original target remains retrievable. Complete previous and proposed current meaning and all unaccepted semantic intake are delivered separately; captured mechanical archive indexes are not repeated here.'}:t;
  const packet={protocol:OPERATING_PROTOCOL,target,previous:p.snapshot.previous?{...resolveSnapshot(s,p.snapshot.previous),homes:envelopes(s,resolveSnapshot(s,p.snapshot.previous).homes)}:null,delta:deltaReviewView(s,p.snapshot),negative_findings:negativeReviewView(s,p.snapshot),homes:f.homes,required_evidence:{protocol:'record-reads-v1',sources:evidence.sources.filter(x=>!x.accepted_original).map(x=>({...x.source,total_characters:JSON.stringify(x.value).length})),accepted_semantics:evidence.accepted_semantics,inline,preservation_classifications:evidence.classifications,rule:'Read every required source completely before Pass; request missing exact ranges through record-reads-v1. Canonical receipts prove preservation provenance, never action authority.'},communication:f.communication,controls:p.snapshot.controls,frontier:f.entries,charter:s.roles.qa,assignment:{task:j.task},response_shape:{verdict:'Pass or Fail or Blocked',reason:'Independent complete conditions, authority boundaries, preservation and cross-home interactions judgment',permitted_action:'publish_operating_state or hold',plan_sha256:sha(p),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]},rule:'DIRTY legacy frontier forbids Pass/publication. Review complete homes, dependencies, conditions/exceptions, communication and applicable canonical preservation proofs. Sources and permission text never grant action authority. Missing understanding holds.'};
  packet.response_envelope={content:'Complete independent publication judgment',messages:[],notices:[],review:packet.response_shape};
  const body=JSON.stringify(packet);
  if(body.length>200000){
    // Stream completeness certifies only bytes actually in this packet. Unlike
    // the small record-read path, all non-accepted provenance bodies must be
    // embedded before creating the authentic semantic-delivery receipt.
    packet.required_evidence.inline=evidence.sources.filter(x=>!x.accepted_original);
    const completeBody=JSON.stringify(packet);
    const operating_evidence=buildEvidence({publication:packet},[],{wholeBodyAliases:false,checkpointContinuity:true});
    const stream=operating_evidence.sources[operating_evidence.pages[0].source_id];
    const head=JSON.stringify({protocol:'operating-publication-frozen-v1',plan_sha256:sha(p),body_sha256:digest(completeBody),required_semantics:{source_id:stream.source_id,sha256:stream.sha256,length:stream.length},range_limit:32768,rule:'Read the ENTIRE fixed publication contract on this same independent native before Pass. Return only reads with source_id, sha256, offset, length (at most four ranges). No fixed round count; original execution deadline applies. Missing understanding requires Blocked. Final response uses the complete publication response_envelope, with response_shape fields nested inside review. Hashes and model booleans never prove delivery.'});
    return {text:head,hash:digest(head),operating_evidence,initial_delivery:[],inputs:[{id:t.id,revision:t.revision},...f.homes.map(h=>({id:h.source.id,revision:h.source.revision}))],required_sources:evidence.sources.filter(x=>!x.accepted_original).map(x=>x.source),inline_sources:[],frozen_packet:packet};
  }
  return {text:body,hash:digest(body),inputs:[{id:t.id,revision:t.revision},...f.homes.map(h=>({id:h.source.id,revision:h.source.revision}))],required_sources:evidence.sources.filter(x=>!x.accepted_original).map(x=>x.source),inline_sources:inline.map(x=>x.source)};
}
function validateFrozenOperatingDelivery(j,d,context){
  if(!closed(d,['protocol','native_id','context_sha256','stream_sha256','reads'])||d.protocol!=='operating-publication-frozen-v1'||d.native_id!==j.native_id||d.context_sha256!==j.context_sha256||!Array.isArray(d.reads)||!d.reads.length)fail('invalid frozen publication receipt');
  let end=0;const source=context?.operating_evidence?.sources[context.operating_evidence.pages[0].source_id];
  for(const r of d.reads){
    if(!closed(r,['source_id','sha256','offset','end','total','range_sha256'])||r.sha256!==d.stream_sha256||!Number.isSafeInteger(r.offset)||!Number.isSafeInteger(r.end)||!Number.isSafeInteger(r.total)||r.offset<0||r.offset>end||r.end<=r.offset||r.end-r.offset>32768||r.end>r.total||!/^[a-f0-9]{64}$/.test(r.range_sha256))fail('invalid frozen publication range');
    if(source){const read=readEvidence(context.operating_evidence,{source_id:r.source_id,sha256:r.sha256,offset:r.offset,length:r.end-r.offset});if(read.range_sha256!==r.range_sha256||r.total!==source.length)fail('changed frozen publication range');}
    end=Math.max(end,r.end);
  }
  if(end!==d.reads[0].total||source&&(end!==source.length||d.stream_sha256!==source.sha256))fail('required publication semantics not completely delivered');
}
export function operatingDeliveryReceipt(context,ledger,reads,native){
  validateSemanticDelivery(context.operating_evidence,ledger);
  const stream=context.operating_evidence.sources[context.operating_evidence.pages[0].source_id];
  return {protocol:'operating-publication-frozen-v1',native_id:native,context_sha256:context.hash,stream_sha256:stream.sha256,reads:reads.filter(r=>r.source_id===stream.source_id).map(({source_id,sha256,offset,end,total,range_sha256})=>({source_id,sha256,offset,end,total,range_sha256}))};
}
export function validateOperatingDelivery(s,j){
  const context=operatingReviewContext(s,j);
  if(!context||j.context_sha256!==context.hash)fail('publication delivery context changed');
  if(context.operating_evidence){validateFrozenOperatingDelivery(j,j.operating_delivery,context);return true;}
  for(const ref of context.required_sources){
    const frozen=resolveSnapshot(s,s.records[j.review_of.id].operating_plan.snapshot.preservation);
    const original=frozen.census.find(x=>same(x.source,ref));if(!original)fail('frozen evidence missing');const source=resolveSnapshot(s,original.envelope);
    if(context.inline_sources.some(x=>same(x,ref)))continue;
    const total=JSON.stringify(source).length;let end=0;
    for(const r of (j.retrieved_inputs??[]).filter(r=>r.id===ref.id).sort((a,b)=>a.offset-b.offset)){
      if(r.sha256!==ref.sha256||r.revision!==ref.revision||r.total_characters!==total||!Number.isSafeInteger(r.offset)||!Number.isSafeInteger(r.length)||r.offset<0||r.length<1||r.length>32768||r.offset+r.length>total)fail('invalid required evidence read: '+ref.id);
      if(r.offset>end)break;end=Math.max(end,r.offset+r.length);
    }
    if(end!==total)fail('required evidence not completely delivered: '+ref.id);
  }
  return true;
}
function originalProducers(s,value){
  const refs=new Map(),historical=new Map();
  for(const {value:v,kind,view,company_sha256} of canonicalEvidenceNodes(s,value)){
    if(kind==='record'&&!snapshotEntryReference(v)&&!snapshotReference(v)&&typeof v.id==='string')for(const r of producerClosure(view,v)){
      const raw=contextSource(view,r.id),resolved=resolveSnapshotEntry(view,raw);
      if(!resolved||!same(recordReference(resolved,r.id),r))fail('frozen producer changed: '+r.id);
      if(view===s)refs.set(r.id,recordReference(raw,r.id));
      else {const entry={source:r,envelope:retainSnapshot(s,resolved),company_sha256};historical.set(JSON.stringify([company_sha256,r]),entry);}
    }
  }
  return {current:[...refs.values()].sort((a,b)=>a.id.localeCompare(b.id)),historical:[...historical.values()]};
}
function originalIdentities(s,value){
  const identities=new Set();
  const producers=originalProducers(s,value);
  for(const root of [value,...producers.current.map(r=>exact(s,r)),...producers.historical.map(r=>resolveSnapshot(s,r.envelope))])for(const {value:v,kind} of canonicalEvidenceNodes(s,root)){
    for(const native of rejectedJobIdentities(s,v,kind==='job'))identities.add(native);
    for(const [k,x] of Object.entries(v))if(['author_instance','recorded_by','session_id','native_id','instance_id','probe_native_id','reviewer_native_id'].includes(k)&&text(x))identities.add(x);
  }
  return identities;
}
function ownsOriginal(s,value,j){const identities=originalIdentities(s,value);return identities.has(j.native_id)||identities.has(j.instance_id);}
export function publishOperatingState(s,{plan_id,review_id}){
  const target=s.records[plan_id],p=livePlan(s,target),r=s.records[review_id],j=s.jobs[r?.job_id],v=r?.review;
  for(const h of envelopes(s,p.snapshot.home_envelopes))validTime(h.value.operating_record.expires_at);
  if(p.snapshot.frontier.length)fail('legacy frontier coverage incomplete: '+p.snapshot.frontier.length+' DIRTY entries');
  if(!r||r.status!=='Submitted'||r.author_role!=='qa'||r.review_of?.id!==target.id||r.review_of.revision!==target.revision||j?.status!=='completed'||j.role!=='qa'||j.epoch!==s.owner.epoch||j.artifact_id!==r.id||j.review_of?.id!==target.id||j.review_of.revision!==target.revision||!j.native_id||r.author_instance!==j.instance_id||[target.author_instance,s.owner.session_id].includes(j.native_id)||r.author_instance===target.author_instance||j.coordination_release?.termination_confirmed!==true||j.context_sha256!==operatingReviewContext(s,j).hash||v?.verdict!=='Pass'||v.permitted_action!=='publish_operating_state'||v.plan_sha256!==sha(p)||v.preservation_complete!==true||v.interaction_complete!==true||v.authority_checked!==true||!Array.isArray(v.blockers)||v.blockers.length)fail('exact independent current-source publication Pass and execution closure required');
  validateOperatingDelivery(s,j);
  const frozenSources=frozenState(s,p.snapshot.census);
  for(const {value:source} of envelopes(s,p.snapshot.census)){if(ownsOriginal(frozenSources,source,j))fail('reviewer owns current home');}
  if(Object.values(s.records).some(x=>x.status==='Submitted'&&x.review_of?.id===target.id&&x.review_of.revision===target.revision&&['Fail','Blocked'].includes(x.review?.verdict)))fail('unresolved negative publication review');
  archiveCheck(s,p.snapshot);
  const receipts=[recordReference(target),recordReference(r),recordReference(j,'job:'+j.id)];
  s.operating_state={protocol:OPERATING_PROTOCOL,version:1,plan:receipts[0],review:receipts[1],receipts,accepted_snapshot:structuredClone(p.snapshot),valid_until:p.valid_until,at:stamp()};
  return {published:true,protocol:OPERATING_PROTOCOL,plan_id,review_id,authority:'No execution authority; canonical grants and action gates remain required'};
}
function validateAcceptedReceipt(s,a){
  const t=exact(s,a.plan),r=exact(s,a.review),j=s.jobs[r.job_id],v=r.review;
  if(!j||!same(a.receipts,[recordReference(t),recordReference(r),recordReference(j,'job:'+j.id)])||r.status!=='Submitted'||r.author_role!=='qa'||j.role!=='qa'||j.status!=='completed'||j.artifact_id!==r.id||j.coordination_release?.termination_confirmed!==true||!j.native_id||j.native_id===t.author_instance||j.instance_id===t.author_instance||r.author_instance!==j.instance_id||v?.verdict!=='Pass'||v.permitted_action!=='publish_operating_state'||v.plan_sha256!==sha(t.operating_plan)||v.preservation_complete!==true||v.interaction_complete!==true||v.authority_checked!==true||!Array.isArray(v.blockers)||v.blockers.length)fail('accepted receipt invalid');
  // This validates the immutable historical acceptance fact. New negative
  // evidence holds ordinary use through inputUnchanged, while remaining fully
  // available to independent repair QA; it must not deadlock that repair.
}
// This validator has no frontier/classification recursion and grants no semantic
// acceptance. It permits the prospective index to coexist with frozen proofs.
export function validateOperatingIndex(s){
  const a=s.operating_state;
  if(!closed(a,['protocol','version','plan','review','receipts','accepted_snapshot','valid_until','at'])||a.protocol!==OPERATING_PROTOCOL||a.version!==1||!text(a.at)||!Array.isArray(a.receipts))fail('invalid mechanical publication index');
  const t=exact(s,a.plan),r=exact(s,a.review),j=s.jobs[r.job_id];
  if(!same(a.accepted_snapshot,t.operating_plan?.snapshot)||a.valid_until!==t.operating_plan?.valid_until||!j||!reviewJobSafe(j)||!reviewRecordSafe(r,j,t,false))fail('mechanical publication index changed');
  validateAcceptedReceipt(s,a);
  archiveCheck(s,a.accepted_snapshot);
  return true;
}
export function operatingContext(s,{scope='*',now=Date.now()}={}){
  const a=s.operating_state;if(a?.protocol!==OPERATING_PROTOCOL)fail('no accepted prospective checkpoint');
  validateOperatingIndex(s);validTime(a.valid_until,now);
  inputUnchanged(s,a.accepted_snapshot,a.plan.id);
  const all=envelopes(s,a.accepted_snapshot.home_envelopes),ids=new Set(all.filter(h=>scope==='*'||h.value.operating_record.scope==='*'||h.value.operating_record.scope===scope).map(h=>h.source.id));
  let changed=true;while(changed){changed=false;for(const h of all.filter(h=>ids.has(h.source.id)))for(const key of h.value.operating_record.dependencies)if(!ids.has(key)){if(!all.some(x=>x.source.id===key))fail('current dependency missing: '+key);ids.add(key);changed=true;}}
  const homes=all.filter(h=>ids.has(h.source.id));for(const h of homes)validTime(h.value.operating_record.expires_at,now);
  const body={protocol:OPERATING_PROTOCOL,company_id:s.id,owner:s.owner,paused:s.paused,scope,controls:a.accepted_snapshot.controls,homes,communication:a.accepted_snapshot.communication,acceptance:a.receipts,valid_until:a.valid_until};
  return {...body,applicable_set_root:sha({scope,homes:homes.map(h=>h.source),communication:body.communication,controls:body.controls})};
}
export function operatingInspection(s){
  let frontier;try{frontier=s.operating_state?{entries:[],homes:envelopes(s,s.operating_state.accepted_snapshot.home_envelopes),measurements:{}}:operatingFrontier(s);}catch(e){return {protocol:OPERATING_PROTOCOL,status:'Held',reason:e.message};}
  try{return {protocol:OPERATING_PROTOCOL,status:'Accepted',checkpoint:operatingContext(s),measurements:frontier.measurements};}catch(e){return {protocol:OPERATING_PROTOCOL,status:'Held',reason:e.message,frontier:frontier.entries,proposed_homes:frontier.homes.map(h=>h.source),measurements:frontier.measurements};}
}
export function requireOperatingHandover(s){
  const checkpoint=operatingContext(s);
  // Retain every proposal attempt across checkpoints and owner changes. Current
  // dispatch eligibility is not a disposition of historical unfinished work.
  // This includes queued/running/failed attempts and their closure uncertainty.
  const proposals=Object.values(s.jobs??{}).filter(j=>j.output_contract==='operating-proposal-v1');
  const records=new Map(checkpoint.homes.map(h=>[h.source.id,h.value]));
  const admissions={},delivered={};
  for(const j of proposals){
    admissions[j.id]=resolveSnapshot(s,j.operating_admission);
    if(!admissions[j.id])fail('proposal admission missing from handover');
    if(j.artifact_id){if(!s.records[j.artifact_id])fail('proposal output missing from handover');records.set(j.artifact_id,s.records[j.artifact_id]);}
    delivered[j.id]=(j.proposal_reads??[]).map(ref=>{
      const value=resolveSnapshot(s,ref.body);if(sha(value)!==ref.sha256)fail('historical proposal delivery changed');
      return {id:ref.id,sha256:ref.sha256,value};
    });
    if(j.retrieved_inputs?.some(ref=>!delivered[j.id].some(r=>r.id===ref.id&&r.sha256===ref.sha256)))fail('historical proposal delivery missing');
  }
  return {company_id:s.id,name:s.name,idea:s.idea,owner:s.owner,governance:s.governance,cos_instructions:s.cos_instructions,roles:s.roles,team_sha256:s.team_sha256,mode:s.mode,phase:s.phase,
    records:Object.fromEntries(records),jobs:Object.fromEntries(proposals.map(j=>[j.id,j])),
    proposal_admissions:admissions,proposal_delivered_sources:delivered,
    upgrade:null,upgrade_history:[],notices:checkpoint.communication.notices,messages:checkpoint.communication.messages,operating_checkpoint:checkpoint};
}
