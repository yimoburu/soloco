// Pure observation projection. It cannot validate authority or mutate company state.
import {createHash} from 'node:crypto';
import {validModelProcessTracking} from './model-process-closure.mjs';

export const TIMING_PROTOCOL='implementation-timing-events-v1';
export const TIMING_PHASES=['queued','preparation','execution','test','qa','acceptance','handoff','merge','install','adoption'];
const outcomes=['running','completed','failed','blocked','cancelled'];
const need=(condition,message)=>{if(!condition)throw Error('Implementation timing: '+message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
const key=v=>JSON.stringify([v.task_id,v.attempt_id]);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fields=(v,required,optional=[])=>{
 need(object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k)),'invalid fields');
};
function timestamp(v){
 need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v),'timestamps require UTC ISO seconds or milliseconds');
 const n=Date.parse(v),normalized=v.includes('.')?v:v.slice(0,-1)+'.000Z';
 need(Number.isFinite(n)&&new Date(n).toISOString()===normalized,'invalid timestamp');return n;
}
function source(v,seen,observation){
 fields(v,['id','sha256','field']);
 need(text(v.id)&&text(v.field)&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256),'invalid attributable source reference');
 const id=JSON.stringify([v.id,v.sha256,v.field]),prior=seen.get(id)??[];
 if(prior.length)need(observation?.kind==='timestamp'&&prior.every(p=>p.kind==='timestamp'&&p.at===observation.at&&p.clock_id===observation.clock_id&&p.attempt===observation.attempt&&p.phase!==observation.phase),'duplicate or conflicting source observation');
 seen.set(id,[...prior,observation]);
}
function union(ranges){
 let occupied=0,end=-Infinity;
 for(const [start,finish]of ranges.toSorted((a,b)=>a[0]-b[0])){occupied+=Math.max(0,finish-Math.max(start,end));end=Math.max(end,finish);}
 return occupied;
}
function intervals(spans){
 const completed=spans.filter(s=>s.duration_ms!==null),complete=spans.length>0&&completed.length===spans.length;
 const clocks=new Set(spans.map(s=>s.clock_id));
 const basis=complete&&clocks.size===1?(spans.every(s=>s.monotonic_start_ms!==null&&s.monotonic_finish_ms!==null)?'monotonic':'wall'):null;
 const ranges=basis?spans.map(s=>basis==='monotonic'?[s.monotonic_start_ms,s.monotonic_finish_ms]:[s.wall_start_ms,s.wall_finish_ms]):[];
 const work=complete?(basis?ranges.reduce((n,[a,b])=>n+b-a,0):spans.reduce((n,s)=>n+s.duration_ms,0)):null;
 const occupied=basis?union(ranges):null;
 // A mixed monotonic/wall group uses one wall basis for both work and union.
 return {spans:spans.length,completed_spans:completed.length,incomplete_spans:spans.length-completed.length,work_ms:work,
  occupied_ms:occupied,overlap_work_ms:basis?work-occupied:null,overlap_clock:basis};
}
const percentile=(values,p)=>values.length?values.toSorted((a,b)=>a-b)[Math.ceil(p*values.length)-1]:null;

export function reportImplementationTiming(input){
 fields(input,['protocol','measurement_kind','attempts','events']);
 need(input.protocol===TIMING_PROTOCOL&&['observed','synthetic'].includes(input.measurement_kind),'unsupported protocol or measurement kind');
 need(Array.isArray(input.attempts)&&Array.isArray(input.events),'attempts and events must be arrays');
 const attempts=new Map(),evidence=new Map(),events=new Set(),spanMap=new Map();
 for(const a of input.attempts){
  fields(a,['task_id','attempt_id','comparison_key','outcome','source'],['rework_of']);
  need(text(a.task_id)&&text(a.attempt_id)&&text(a.comparison_key)&&outcomes.includes(a.outcome),'invalid attempt identity, comparison key or outcome');
  need(!attempts.has(key(a)),'duplicate attempt');source(a.source,evidence,{kind:'outcome'});attempts.set(key(a),a);
 }
 for(const a of attempts.values())if(Object.hasOwn(a,'rework_of')){
  need(text(a.rework_of)&&a.rework_of!==a.attempt_id,'invalid rework predecessor');
  const previous=attempts.get(key({...a,attempt_id:a.rework_of}));need(previous&&['failed','blocked','cancelled'].includes(previous.outcome),'rework must name a supplied adverse attempt of the same task');
  const visited=new Set([a.attempt_id]);let p=previous;
  while(p){need(!visited.has(p.attempt_id),'cyclic rework lineage');visited.add(p.attempt_id);p=p.rework_of===undefined?null:attempts.get(key({...p,attempt_id:p.rework_of}));}
 }
 for(const e of input.events){
  fields(e,['id','task_id','attempt_id','span_id','phase','event','at','clock_id','source'],['monotonic_ms']);
  need(text(e.id)&&text(e.span_id)&&text(e.clock_id)&&attempts.has(key(e))&&TIMING_PHASES.includes(e.phase)&&['start','finish'].includes(e.event),'invalid event identity or phase');
  need(!events.has(e.id),'duplicate event id');events.add(e.id);source(e.source,evidence,{kind:'timestamp',at:e.at,clock_id:e.clock_id,attempt:key(e),phase:e.phase});
  const at=timestamp(e.at);if(Object.hasOwn(e,'monotonic_ms'))need(Number.isFinite(e.monotonic_ms)&&e.monotonic_ms>=0,'invalid monotonic observation');
  const id=JSON.stringify([e.task_id,e.attempt_id,e.span_id]),span=spanMap.get(id)??{task_id:e.task_id,attempt_id:e.attempt_id,span_id:e.span_id,phase:e.phase};
  need(span.phase===e.phase&&!span[e.event],'duplicate or inconsistent span event');span[e.event]={...e,wall_ms:at};spanMap.set(id,span);
 }
 const spans=[...spanMap.values()].map(s=>{
  const {start,finish}=s,clocksMatch=start&&finish&&start.clock_id===finish.clock_id;
  if(clocksMatch){need(finish.wall_ms>=start.wall_ms,'finish precedes start');if(start.monotonic_ms!==undefined&&finish.monotonic_ms!==undefined)need(finish.monotonic_ms>=start.monotonic_ms,'monotonic finish precedes start');}
  const mono=clocksMatch&&start.monotonic_ms!==undefined&&finish.monotonic_ms!==undefined;
  return {span_id:s.span_id,task_id:s.task_id,attempt_id:s.attempt_id,phase:s.phase,clock_id:clocksMatch?start.clock_id:null,
   duration_ms:clocksMatch?(mono?finish.monotonic_ms-start.monotonic_ms:finish.wall_ms-start.wall_ms):null,duration_clock:clocksMatch?(mono?'monotonic':'wall'):null,
   wall_start_ms:start?.wall_ms??null,wall_finish_ms:finish?.wall_ms??null,monotonic_start_ms:start?.monotonic_ms??null,monotonic_finish_ms:finish?.monotonic_ms??null,
   incomplete_reason:!start?'missing_start':!finish?'missing_finish':!clocksMatch?'different_clocks':null,
   source_events:[start?.id,finish?.id].filter(Boolean)};
 });
 const reports=[...attempts.values()].map(a=>{
  const selected=spans.filter(s=>key(s)===key(a)),complete=selected.length>0&&selected.every(s=>s.duration_ms!==null),clocks=new Set(selected.map(s=>s.clock_id));
  const wall=complete&&clocks.size===1?Math.max(...selected.map(s=>s.wall_finish_ms))-Math.min(...selected.map(s=>s.wall_start_ms)):null;
  const phases=Object.fromEntries(TIMING_PHASES.map(phase=>[phase,intervals(selected.filter(s=>s.phase===phase))]));
  return {...a,complete_observed_spans:complete,wall_elapsed_ms:wall,wall_clock_id:wall===null?null:selected[0].clock_id,
   queued_work_ms:phases.queued.work_ms,queued_occupied_ms:phases.queued.occupied_ms,phases,spans:selected};
 });
 const comparisons=[...new Set(reports.map(a=>a.comparison_key))].map(comparison_key=>{
  const group=reports.filter(a=>a.comparison_key===comparison_key),values=group.filter(a=>a.outcome==='completed'&&a.complete_observed_spans&&a.wall_elapsed_ms!==null).map(a=>a.wall_elapsed_ms);
  return {comparison_key,reported_attempts:group.length,completed_samples:values.length,percentile_method:'nearest-rank',p50_wall_elapsed_ms:percentile(values,.5),p95_wall_elapsed_ms:percentile(values,.95)};
 });
 return {protocol:'implementation-timing-report-v1',measurement_kind:input.measurement_kind,input_sha256:hash(input),attempts:reports,comparisons,
  summary:{attempts:reports.length,adverse_attempts:reports.filter(a=>['failed','blocked','cancelled'].includes(a.outcome)).length,explicit_rework_attempts:reports.filter(a=>a.rework_of!==undefined).length},
  limitations:['Only supplied attributable observations are counted; absent phases and open spans remain unknown. Wall elapsed is the window from the first supplied start to the last supplied finish, not proof that the entire implementation lifecycle was observed.',
   'Wall elapsed spans use one declared clock. Monotonic values are compared only within that same clock; clock identities and source authenticity are supplied, not verified here.',
   'Accumulated phase work, occupied time and end-to-end wall elapsed are different quantities. Different clocks cannot establish overlap.',
   'Completed outcomes and comparison keys are supplied labels, not proof of native QA, owner acceptance, equal workloads, quality, retry authority or release readiness.',
   'Sample percentiles use nearest-rank (sorted index ceil(p*N)-1), not an interpolated median, and are descriptive, including synthetic samples; no production speedup, founder effort, cost or business outcome is inferred.']};
}

export const OBSERVATIONS_PROTOCOL='implementation-observations-v1';
export const OBSERVATIONS_INPUT_PROTOCOL='implementation-observations-input-v1';
export const OBSERVATIONS_MAX_BYTES=25000;
const obNeed=(v,m)=>{if(!v)throw Error('Implementation observations: '+m);};
const obOwn=(v,k)=>Object.hasOwn(v??{},k);
const obText=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\x00-\x1f]/.test(v);
const obHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const obHex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const obTime=v=>{try{return timestamp(v);}catch{return null;}};
const obCopy=v=>JSON.parse(JSON.stringify(v));
const obStatuses=new Set(['queued','running','completed','failed','blocked','cancelled','interrupted','quarantined','expired']);
const obOutcome=v=>v==='completed'?'completed':['failed','expired'].includes(v)?'failed':v==='quarantined'?'blocked':v==='interrupted'?'cancelled':outcomes.includes(v)?v:'running';
function obCollection(value,name){
 obNeed(object(value),name+' must be a complete ID-keyed object, not a preview page');
 const rows=Object.entries(value);for(const[id,row]of rows)obNeed(object(row)&&row.id===id&&obText(id),'invalid '+name+' identity');
 return rows.map(([,row])=>row).sort((a,b)=>a.id.localeCompare(b.id));
}
function obRef(kind,value){const has=obOwn(value,'revision'),valid=Number.isSafeInteger(value.revision)&&value.revision>0;return {kind,id:kind==='job'?'job:'+value.id:value.id,sha256:obHash(value),revision_present:has,...(has?valid||value.revision===null?{revision:value.revision}:{revision_invalid:true}: {})};}
const obRead=(v,p)=>p.split('/').slice(1).reduce((at,k)=>at?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],v);
function obObserved(ref,value,field){const actual=obRead(value,field);obNeed(actual!==undefined,'missing source observation');return {source:{id:ref.id,sha256:ref.sha256,field},value:obCopy(actual),value_sha256:obHash(actual)};}
function obTiming(attempt,parts,kind){
 const input={protocol:TIMING_PROTOCOL,measurement_kind:kind,attempts:[attempt],events:[]};
 for(const part of parts)for(const[event,point]of [['start',part.start],['finish',part.finish]])if(point){
  const e={id:attempt.attempt_id+':'+part.id+':'+event,task_id:attempt.task_id,attempt_id:attempt.attempt_id,span_id:part.id,phase:part.phase,event,at:point.value,clock_id:part.clock_id,source:point.source};
  if(point.monotonic_ms!==undefined)e.monotonic_ms=point.monotonic_ms;input.events.push(e);
 }
 return {input,report:reportImplementationTiming(input).attempts[0]};
}
function obAcceptance(state,record){
 const d=record.development,a=d?.acceptance,c=state.records[d?.candidate_id],p=state.records[d?.plan_id],q=state.records[a?.review_id],j=state.jobs[record.author_instance],qj=state.jobs[q?.job_id],author=state.jobs[c?.job_id];
 const identities=obText(author?.native_id)&&obText(qj?.native_id)&&obText(author?.instance_id)&&obText(qj?.instance_id)&&obText(state.owner?.session_id);
 const independent=identities?author.native_id!==qj.native_id&&author.instance_id!==qj.instance_id&&![author.native_id,qj.native_id,author.instance_id,qj.instance_id].includes(state.owner.session_id):null;
 const revisions=[record,c,p,q].every(r=>Number.isSafeInteger(r?.revision)&&r.revision>0);
 const matches=revisions&&record.author_role==='runtime'&&record.status==='Submitted'&&d?.type==='test'&&c?.development?.type==='candidate'&&c.status==='Submitted'&&p?.development?.type==='plan'
  &&c.development.plan_id===p.id&&c.development.candidate_sha256===d.candidate_sha256&&a?.candidate_sha256===d.candidate_sha256&&a?.receipt_sha256===d.receipt_sha256
  &&j?.kind==='development_test'&&j.status==='completed'&&j.artifact_id===record.id&&j.candidate_id===c.id&&j.development_id===p.id
  &&d.result?.tests_executed===true&&d.result.status==='passed'&&d.result.exit_code===0&&q?.kind==='review'&&q.status==='Submitted'
  &&q.review_of?.id===record.id&&q.review_of.revision===record.revision&&q.review?.verdict==='Pass'&&q.review.permitted_action==='accept_local_development'
  &&q.review.candidate_sha256===d.candidate_sha256&&q.review.receipt_sha256===d.receipt_sha256&&Array.isArray(q.review.blockers)&&q.review.blockers.length===0&&q.author_role==='qa'&&qj?.status==='completed'&&qj.role==='qa'&&qj.artifact_id===q.id&&q.author_instance===qj.instance_id&&qj.coordination_release?.termination_confirmed===true
  &&author?.status==='completed'&&author.artifact_id===c.id&&author.development_id===p.id&&c.author_instance===author.instance_id&&author.coordination_release?.termination_confirmed===true;
 return {record,candidate:c,plan:p,review:q,qa_job:qj,producer_job:author,bindings_match:!!matches,independence_observed:independent,accepted_at:a?.at};
}
function obCursor(value){return Buffer.from(JSON.stringify({...value,sha256:obHash(value)})).toString('base64url');}
function obDecode(cursor,query){
 obNeed(typeof cursor==='string'&&cursor.length<=4096&&/^[A-Za-z0-9_-]+$/.test(cursor),'invalid cursor');
 let item;try{item=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{obNeed(false,'invalid cursor');}
 const {sha256,...body}=item??{};obNeed(sha256===obHash(body)&&Object.keys(body).sort().join(',')==='offset,protocol,query_sha256'&&body.protocol===OBSERVATIONS_PROTOCOL&&body.query_sha256===query&&Number.isSafeInteger(body.offset)&&body.offset>=0,'stale or invalid cursor; restart observations');return body.offset;
}

/** Pure read projection. origin.kind is supplied by the internal read route;
 * CLI imports always force frozen-export. Neither grade authenticates a producer
 * or establishes current company authority, physical clock identity or quality. */
export function implementationObservations(state,options={}){
 obNeed(object(options)&&Object.keys(options).every(k=>['origin','limit','offset','cursor','external','include_events','output_bytes'].includes(k)),'unknown option');
 const origin=options.origin;obNeed(object(origin)&&Object.keys(origin).every(k=>['kind','observed_at','clock_id','state_sha256','collections_complete','measurement_kind'].includes(k))&&['canonical-read-snapshot','frozen-export'].includes(origin.kind),'explicit snapshot origin required');
 obNeed(obTime(origin.observed_at)!==null,'origin requires a UTC observation timestamp');
 const snapshotHash=obHash(state);if(origin.state_sha256!==undefined)obNeed(obHex(origin.state_sha256)&&origin.state_sha256===snapshotHash,'snapshot hash changed');
 const clock=origin.clock_id??'recorded-utc-wall';obNeed(obText(clock),'invalid declared wall clock');
 const measurement=origin.measurement_kind??'observed';obNeed(['observed','synthetic'].includes(measurement),'invalid measurement kind');
 if(origin.collections_complete!==undefined)obNeed(typeof origin.collections_complete==='boolean','invalid collection completeness');
 const full=origin.collections_complete===true;
 const limit=options.limit??10;obNeed(Number.isSafeInteger(limit)&&limit>=1&&limit<=50,'limit must be 1..50');
 const outputBytes=options.output_bytes??OBSERVATIONS_MAX_BYTES;obNeed(Number.isSafeInteger(outputBytes)&&outputBytes>=8000&&outputBytes<=OBSERVATIONS_MAX_BYTES,'internal output budget must be8000..25000');
 if(options.include_events!==undefined)obNeed(typeof options.include_events==='boolean','include_events must be Boolean');
 const jobs=obCollection(state?.jobs,'jobs'),records=obCollection(state?.records,'records');
 const external=options.external??[];obNeed(Array.isArray(external)&&external.length<=100,'at most 100 explicit external observations');
 const externalIds=new Set();
 for(const x of external){
  obNeed(object(x)&&Object.keys(x).sort().join(',')==='id,kind,sha256,subject_id,value'&&obText(x.id)&&obText(x.subject_id)&&['merge','install','escaped_defect','founder_intervention'].includes(x.kind)&&object(x.value)&&obHex(x.sha256)&&x.sha256===obHash(x.value),'invalid external operator observation');
  obNeed(!externalIds.has(x.id),'duplicate external observation');externalIds.add(x.id);
 }
 const query=obHash({snapshot_sha256:snapshotHash,origin_kind:origin.kind,clock_id:clock,measurement_kind:measurement,collections_complete:full,external,limit,include_events:options.include_events===true,output_bytes:outputBytes});
 obNeed(options.cursor===undefined||options.offset===undefined,'choose cursor or offset');
 let offset=options.cursor===undefined?(options.offset??0):obDecode(options.cursor,query);obNeed(Number.isSafeInteger(offset)&&offset>=0,'invalid offset');
 const items=[],allSpans=[],allAttempts=[],counts={jobs:jobs.length,records:records.length,reviews:{Pass:0,Fail:0,Blocked:0,unrecognized:0},rejected_job_outputs:0,unconfirmed_terminal_closure:0,capacity_hold_conditions:0,acceptance_records:0,runtime_tasks:0};
 const acceptanceFacts=[],operatorQuality={escaped:[],interventions:[]};
 function point(ref,value,field,issues){const v=obRead(value,field);if(v===undefined||v===null)return null;if(obTime(v)===null){issues.push({field,code:'invalid_recorded_timestamp'});return null;}return obObserved(ref,value,field);}
 function attach(item,attempt,parts){
  const usable=parts.filter(p=>p.start||p.finish),issues=item.timestamp_issues??=[];
  for(const p of usable)if(p.start&&p.finish&&obTime(p.finish.value)<obTime(p.start.value)){issues.push({field:p.id,code:'reversed_recorded_interval'});p.finish=null;}
  const t=obTiming(attempt,usable,measurement);item.timing=t.report;allSpans.push(...t.report.spans);allAttempts.push(t.report);
  if(options.include_events===true)item.timing_input=t.input;
 }
 for(const job of jobs){
  const ref=obRef('job',job),issues=[],points={};for(const f of ['created_at','started_at','execution_started_at','finished_at'])points[f]=point(ref,job,'/'+f,issues);
  const software=['development_test','development_preflight'].includes(job.kind),launch=software?point(ref,job,'/execution_provenance/launch_intent_at',issues):points.execution_started_at;
  const receipt=state.records[job.artifact_id],result=receipt?.development?.result;
  const phase=software?'test':job.role==='qa'?'qa':'execution';
  const task=job.runtime_task?.id??job.development_id??state.records[job.review_of?.id]?.development?.plan_id??job.id;
  const hold=['queued','running'].includes(job.status)||Boolean(job.runtime_task||job.started_at)&&['failed','cancelled','interrupted'].includes(job.status)&&job.coordination_release?.termination_confirmed!==true;
  const uncertain=Boolean(job.started_at||job.execution_started_at)&&['failed','cancelled','interrupted'].includes(job.status)&&job.coordination_release?.termination_confirmed!==true;
  if(hold)counts.capacity_hold_conditions++;if(uncertain)counts.unconfirmed_terminal_closure++;if(job.rejected_output)counts.rejected_job_outputs++;
  const tracking=job.model_process_tracking,trackingShape=tracking===undefined?null:validModelProcessTracking(tracking),validTracking=trackingShape===null?null:trackingShape&&tracking.invocations.every(x=>x.job_id===job.id&&x.instance_id===job.instance_id&&x.worker_pid===job.worker_pid&&x.host===job.host);
  const item={kind:'job',id:job.id,source:ref,role:obText(job.role)?job.role:null,actor:software?'software':'specialist',recorded_status:obStatuses.has(job.status)?job.status:null,
   native_identity_recorded:obText(job.native_id),effective_provider_controls_verified:false,comparison_basis:obHex(job.context_sha256)?'same recorded context and requested control commitments; effective controls unverified':'isolated attempt; no shared context commitment',
   process:{recorded_termination_confirmed:typeof job.coordination_release?.termination_confirmed==='boolean'?job.coordination_release.termination_confirmed:null,tracking_shape_valid:trackingShape,tracking_job_bindings_match:validTracking,invocations:validTracking?tracking.invocations.length:null,closed_invocations:validTracking?tracking.invocations.filter(x=>x.birth&&x.closure).length:null,producer_authenticity_established:false},
   reservation:{capacity_hold_condition_matches:hold,terminal_closure_unconfirmed:uncertain,recorded_resources:Array.isArray(job.coordination?.resources)?job.coordination.resources.length:0},
   rejected_output_retained:Boolean(job.rejected_output),timestamps:[...Object.values(points),...(software&&launch?[launch]:[])].filter(Boolean),timestamp_issues:issues};
  if(validTracking){
   const ranges=tracking.invocations.filter(x=>x.birth&&x.closure).map(x=>[obTime(x.birth.spawned_at),obTime(x.closure.closed_at)]),complete=ranges.length===tracking.invocations.length&&ranges.every(([a,b])=>a!==null&&b!==null&&b>=a),work=complete?ranges.reduce((n,[a,b])=>n+b-a,0):null,occupied=complete?union(ranges):null;
   item.process.original_cli_wall_timing={measured_invocations:ranges.length,unmeasured_invocations:tracking.invocations.length-ranges.length,work_ms:work,occupied_ms:occupied,overlap_work_ms:complete?work-occupied:null,basis:'recorded direct CLI birth/close UTC fields; not provider inference time',source:{id:ref.id,sha256:ref.sha256,field:'/model_process_tracking',value_sha256:obHash(tracking)}};
  }
  const attempt={task_id:task,attempt_id:job.id,comparison_key:obHash({role:job.role??null,kind:job.kind??null,context:obHex(job.context_sha256)?job.context_sha256:job.id,requested_controls:job.model_selection??null,host:job.host??null,cli_version:job.cli_version??null}),outcome:obOutcome(job.status),source:{id:ref.id,sha256:ref.sha256,field:'/status'}};
  const preparationEnd=launch??(software&&result?.tests_executed===false?points.finished_at:null);
  attach(item,attempt,[{id:'queued',phase:'queued',start:points.created_at,finish:points.started_at,clock_id:clock},{id:'preparation',phase:'preparation',start:points.started_at,finish:preparationEnd,clock_id:clock},{id:phase,phase,start:launch,finish:launch?points.finished_at:null,clock_id:clock}]);
  if(software&&result){const receiptRef=obRef('record',receipt);item.test_observation={tests_executed:typeof result.tests_executed==='boolean'?result.tests_executed:null,recorded_status:['passed','failed','blocked','error','aborted'].includes(result.status)?result.status:null,reused:result.reused===true,reported_duration_ms:Number.isFinite(result.duration_ms)&&result.duration_ms>=0?result.duration_ms:null,duration_clock:'recorded executor wall duration; not monotonic',source:receiptRef,observed_fields:['tests_executed','duration_ms'].filter(k=>typeof result[k]==='boolean'||Number.isFinite(result[k])).map(k=>obObserved(receiptRef,receipt,'/development/result/'+k)),native_qualification:false};}
  items.push(item);
 }
 for(const record of records){
  const ref=obRef('record',record);
  if(record.kind==='review'||record.review){
   const verdict=record.review?.verdict;counts.reviews[obOwn(counts.reviews,verdict)?verdict:'unrecognized']++;
   const producer=state.jobs[record.job_id];items.push({kind:'review',id:record.id,source:ref,recorded_verdict:['Pass','Fail','Blocked'].includes(verdict)?verdict:null,recorded_status:['Submitted','Quarantined'].includes(record.status)?record.status:null,
    target_id:obText(record.review_of?.id)?record.review_of.id:null,producer_job_id:obText(producer?.id)?producer.id:null,native_identity_recorded:obText(producer?.native_id),current_validity:'not_assessed',original_negative_preserved:['Fail','Blocked'].includes(verdict)});
  }
  if(record.development?.acceptance){
   counts.acceptance_records++;const fact=obAcceptance(state,record);acceptanceFacts.push(fact);const a=record.development.acceptance,issues=[];
   const at=point(ref,record,'/development/acceptance/at',issues),qref=fact.qa_job&&obRef('job',fact.qa_job),qaFinish=qref?point(qref,fact.qa_job,'/finished_at',issues):null;
   const item={kind:'acceptance',id:record.id,source:ref,candidate_id:obText(record.development.candidate_id)?record.development.candidate_id:null,review_id:obText(a.review_id)?a.review_id:null,recorded_at:at?.value??null,
    recorded_bindings_match:fact.bindings_match,independence_conditions_observed:fact.independence_observed,current_authority:'not_assessed',native_acceptance_authenticated:false,timestamps:[qaFinish,at].filter(Boolean),timestamp_issues:issues};
   attach(item,{task_id:record.development.plan_id??record.id,attempt_id:'acceptance:'+record.id,comparison_key:obHash({candidate:record.development.candidate_sha256??record.id,phase:'acceptance'}),outcome:'completed',source:{id:ref.id,sha256:ref.sha256,field:'/development/acceptance'}},[{id:'acceptance',phase:'acceptance',start:qaFinish,finish:at,clock_id:clock}]);items.push(item);
  }
  if(record.development?.type==='review_continuation_acceptance'){
   counts.acceptance_records++;const d=record.development,report=d.acceptance_report,issues=[],qa=state.records[d.review?.id],qaJob=state.jobs[qa?.job_id],candidate=state.records[d.candidate_id],receipt=state.records[d.receipt_id];
   const reportMatches=record.status==='Submitted'&&record.author_role==='runtime'&&report?.protocol==='development-acceptance-report-v1'&&obHex(d.acceptance_report_sha256)&&d.acceptance_report_sha256===obHash(report)&&report.acceptance_kind==='review-continuation'&&report.recorded_at===record.created_at&&report.acceptance?.at===record.created_at&&report.acceptance.review_id===qa?.id&&report.acceptance.candidate_sha256===d.candidate_sha256&&report.acceptance.receipt_sha256===d.receipt_sha256&&report.acceptance.continuation?.acceptance_id===record.id;
   const bound=reportMatches&&candidate?.development?.type==='candidate'&&candidate.development.candidate_sha256===d.candidate_sha256&&receipt?.development?.type==='test'&&receipt.development.receipt_sha256===d.receipt_sha256;
   acceptanceFacts.push({record,candidate,bindings_match:!!bound,accepted_at:record.created_at,continuation:true});
   const at=point(ref,record,'/created_at',issues),qaFinish=qaJob?point(obRef('job',qaJob),qaJob,'/finished_at',issues):null;
   const item={kind:'acceptance',id:record.id,source:ref,acceptance_kind:'review-continuation',candidate_id:obText(d.candidate_id)?d.candidate_id:null,original_receipt_id:obText(d.receipt_id)?d.receipt_id:null,recorded_at:at?.value??null,
    recorded_report_commitment_matches:!!reportMatches,recorded_bindings_match:!!bound,first_pass_classification:'unclassifiable; prospective continuation of retained work',old_scope_unchanged:d.old_scope_unchanged===true,old_unknown_reservation_preserved:d.old_unknown_reservation_preserved===true,current_authority:'not_assessed',native_acceptance_authenticated:false,timestamps:[qaFinish,at].filter(Boolean),timestamp_issues:issues};
   attach(item,{task_id:obText(d.plan_id)?d.plan_id:record.id,attempt_id:'acceptance:'+record.id,comparison_key:obHash({candidate:d.candidate_sha256??record.id,phase:'continued-acceptance'}),outcome:'completed',source:{id:ref.id,sha256:ref.sha256,field:'/development/type'}},[{id:'acceptance',phase:'acceptance',start:qaFinish,finish:at,clock_id:clock}]);items.push(item);
  }
  const delivery=record.development?.delivery;
  if(delivery?.protocol==='development-delivery-progress-v1'&&Array.isArray(delivery.transitions)){
   let previous=point(ref,record,record.development.type==='review_continuation_acceptance'?'/created_at':'/development/acceptance/at',[]);
   for(let i=0;i<delivery.transitions.length;i++){
    const transition=delivery.transitions[i],issues=[],at=point(ref,record,'/development/delivery/transitions/'+i+'/recorded_at',issues);
    const item={kind:'handoff',id:record.id+':'+i,source:ref,recorded_sequence:Number.isSafeInteger(transition.sequence)?transition.sequence:null,
     recorded_status:['observed','unobserved','held'].includes(transition.status)?transition.status:null,reported_outcome:['completed','unknown','failed'].includes(transition.request?.reported_outcome)?transition.request.reported_outcome:null,
     from_stage:obText(transition.from?.stage)?transition.from.stage:null,to_stage:obText(transition.to?.stage)?transition.to.stage:null,
     producer_grade:'operator-reported; unauthenticated',source_integration_verified:false,installation_verified:false,timestamps:[previous,at].filter(Boolean),timestamp_issues:issues};
    attach(item,{task_id:record.development.plan_id??record.id,attempt_id:'handoff:'+record.id+':'+i,comparison_key:obHash({subject:record.id,from:item.from_stage,to:item.to_stage}),outcome:transition.status==='observed'?'completed':transition.status==='held'?'blocked':'running',source:{id:ref.id,sha256:ref.sha256,field:'/development/delivery/transitions/'+i+'/status'}},[{id:'handoff',phase:'handoff',start:previous,finish:at,clock_id:clock}]);items.push(item);previous=at??previous;
   }
  }
  if(record.runtime_task){
   counts.runtime_tasks++;const t=record.runtime_task,attempts=Array.isArray(t.attempts)?t.attempts:[],first=attempts[0]&&state.jobs[attempts[0].job_id];
   const from=obTime(t.created_at??record.created_at),to=obTime(first?.created_at);
   items.push({kind:'task',id:record.id,source:ref,recorded_state:['planned','queued','running','returned','accepted','needs_attention','cancelling','cancelled'].includes(t.state)?t.state:null,attempts_recorded:attempts.length,
    first_attempt_job_id:obText(first?.id)?first.id:null,planned_to_dispatch_wall_ms:from!==null&&to!==null&&to>=from?to-from:null,
    timestamps:[point(ref,record,t.created_at===undefined?'/created_at':'/runtime_task/created_at',[]),...(first?[point(obRef('job',first),first,'/created_at',[])]:[])].filter(Boolean),task_acceptance_is_company_development_acceptance:false,definition_revision:Number.isSafeInteger(t.definition_revision)?t.definition_revision:null});
  }
 }
 for(const x of external){
  const value=x.value,ref={kind:'operator-supplied',id:'external:'+x.id,sha256:x.sha256},issues=[],item={kind:'external_observation',id:x.id,source:ref,observation_kind:x.kind,subject_id:x.subject_id,producer_grade:'operator-supplied; unauthenticated',timestamp_issues:issues};
  if(['merge','install'].includes(x.kind)){
   obNeed(outcomes.includes(value.outcome),'external integration observation requires an explicit outcome');
   const externalClock=value.clock_id??'operator:'+x.id;obNeed(obText(externalClock),'invalid external clock');
   const start=point(ref,value,'/started_at',issues),finish=point(ref,value,'/finished_at',issues);item.timestamps=[start,finish].filter(Boolean);
   for(const[side,p]of [['started',start],['finished',finish]])if(value[side+'_monotonic_ms']!==undefined){obNeed(p&&Number.isFinite(value[side+'_monotonic_ms'])&&value[side+'_monotonic_ms']>=0&&obText(value.clock_id),'external monotonic duration requires recorded same-clock observations');p.monotonic_ms=value[side+'_monotonic_ms'];p.monotonic_source=obObserved(ref,value,'/'+side+'_monotonic_ms');}
   attach(item,{task_id:x.subject_id,attempt_id:'external:'+x.id,comparison_key:obHash({kind:x.kind,subject:x.subject_id}),outcome:value.outcome,source:{id:ref.id,sha256:ref.sha256,field:'/outcome'}},[{id:x.kind,phase:x.kind,start,finish,clock_id:externalClock}]);
  }else{
   const at=point(ref,value,'/at',issues);item.recorded_at=at?.value??null;
   if(x.kind==='founder_intervention'){
    obNeed(obText(value.intervention_id)&&value.observed_by==='founder'&&at,'founder intervention requires an explicit dated founder observation');operatorQuality.interventions.push(value.intervention_id);
   }else{
    const accepted=acceptanceFacts.find(f=>f.record.id===x.subject_id||f.candidate?.id===x.subject_id),acceptedAt=obTime(accepted?.accepted_at);
    obNeed(obText(value.defect_id)&&at,'escaped defect requires an explicit dated defect identity');
    item.after_recorded_acceptance=!!accepted&&accepted.bindings_match&&acceptedAt!==null&&obTime(at.value)>acceptedAt;if(item.after_recorded_acceptance)operatorQuality.escaped.push(value.defect_id);
   }
  }items.push(item);
 }
 let known=0,firstPass=0,unknown=0,continued=0;
 for(const fact of acceptanceFacts){
  if(fact.continuation){unknown++;continued++;continue;}
  const generations=fact.plan?.development?.attempts;
  if(!fact.bindings_match||fact.independence_observed!==true||!Array.isArray(generations)||generations.length===0||new Set(generations).size!==generations.length||generations.some(id=>!state.jobs[id])){unknown++;continue;}
  known++;const related=records.filter(r=>r.development?.type==='test'&&r.development.plan_id===fact.plan.id),negative=records.some(r=>['Fail','Blocked'].includes(r.review?.verdict)&&related.some(t=>r.review_of?.id===t.id));
  const rejected=jobs.some(j=>j.rejected_output&&(generations.includes(j.id)||related.some(t=>j.review_of?.id===t.id)));
  if(generations.length===1&&generations[0]===fact.candidate.job_id&&related.length===1&&!negative&&!rejected)firstPass++;
 }
 const plans=records.filter(r=>r.development?.type==='plan'&&Array.isArray(r.development.attempts)),additional=plans.reduce((n,p)=>n+Math.max(0,p.development.attempts.length-1),0);
 const groups=new Map();for(const attempt of allAttempts){const group=groups.get(attempt.comparison_key)??{comparison_key:attempt.comparison_key,reported_attempts:0,values:[]};group.reported_attempts++;if(attempt.outcome==='completed'&&attempt.complete_observed_spans&&attempt.wall_elapsed_ms!==null)group.values.push(attempt.wall_elapsed_ms);groups.set(attempt.comparison_key,group);}
 const comparable=[...groups.values()].sort((a,b)=>a.comparison_key.localeCompare(b.comparison_key)).map(g=>({comparison_key:g.comparison_key,reported_attempts:g.reported_attempts,completed_samples:g.values.length,percentile_method:'nearest-rank',p50_wall_elapsed_ms:percentile(g.values,.5),p95_wall_elapsed_ms:percentile(g.values,.95)}));
 const summary={scope:'supplied snapshot fields; collection completeness is separately declared',counts,phase_timings:Object.fromEntries(TIMING_PHASES.map(phase=>[phase,intervals(allSpans.filter(s=>s.phase===phase))])),comparable_timings:{total:comparable.length,returned:Math.min(5,comparable.length),complete:comparable.length<=5,omitted:Math.max(0,comparable.length-5),groups:comparable.slice(0,5)},quality:{
  first_pass_recorded_local_acceptance:{definition:'one recorded generation reservation, one test receipt and structurally bound independent acceptance; no retained negative or rejected evidence',accepted_subjects:acceptanceFacts.length,classifiable_subjects:known,unknown_subjects:unknown,unclassifiable_reasons:{prospective_continuation:continued,missing_or_inconsistent_lineage:unknown-continued},first_pass_subjects:firstPass,ratio:full&&!unknown&&known?firstPass/known:null,authenticated_native_quality:false},
  additional_generation_reservations_observed:additional,rework_success_rate:null,
  escaped_defects:{reported_after_recorded_acceptance:new Set(operatorQuality.escaped).size||null,complete_period:false,producer_grade:'explicit operator reports only'},
  founder_interventions:{reported_count:new Set(operatorQuality.interventions).size||null,complete_period:false,founder_time_ms:null},billing_cost:null,quality_noninferiority:null}};
 items.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));obNeed(offset<=items.length,'offset exceeds current observations');
 const report={protocol:OBSERVATIONS_PROTOCOL,origin:{kind:origin.kind,observed_at:origin.observed_at,state_sha256:snapshotHash,collections_complete:full,measurement_kind:measurement,producer_authenticity_established:false},
  clock:{id:clock,basis:'declared recorded UTC wall clock; physical-clock comparability not verified',monotonic_values_invented:false},summary,
  collection:'implementation_observations',total:items.length,offset,returned:0,complete:false,omitted_before:offset,omitted_after:items.length-offset,next_cursor:null,items:[],output:{UTF8_bytes:0,maximum_UTF8_bytes:outputBytes},
  limitations:['Read-only stored-field projection; no process provenance, current authority, model understanding or acceptance is authenticated.',
   'All source refs bind the actual supplied JSON value and exact field path; frozen-export hashes do not authenticate an exporter.',
   'Unknown closure, retained rejected outputs and all negative reviews remain observations; measurements cannot release reservations or authorize retry.',
   'Job phase windows include runtime overhead. Software test launch-intent to job finish includes postflight, not only test execution.',
   'Incomplete collection declarations make global rates unknown. Output is paged; omitted rows remain in totals and the unchanged source.',
   'No elapsed estimate is advanced for open spans. Requested models, selection_usage and event counts establish no provider controls, successful calls, spending or founder time saved.',
   'No automatic background monitoring, installation, adoption or company mutation is performed.']};
 function finish(){report.returned=report.items.length;report.complete=offset+report.returned===items.length;report.omitted_after=items.length-offset-report.returned;report.next_cursor=report.complete?null:obCursor({protocol:OBSERVATIONS_PROTOCOL,query_sha256:query,offset:offset+report.returned});for(let i=0;i<5;i++){const n=Buffer.byteLength(JSON.stringify(report));if(n===report.output.UTF8_bytes)break;report.output.UTF8_bytes=n;}return Buffer.byteLength(JSON.stringify(report));}
 for(const item of items.slice(offset,offset+limit)){report.items.push(item);if(finish()>outputBytes){report.items.pop();break;}}
 obNeed(finish()<=outputBytes,'summary exceeds output bound');obNeed(report.returned>0||report.complete,'one observation exceeds output bound; reduce included events');return report;
}
