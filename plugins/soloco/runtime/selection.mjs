// Selection is an assignment request, never proof of the model that answered.
export function normalizeSelection(value,host,catalog) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  if(value===undefined || value===null)return {mode:'default'};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','model','effort','speed','reason'].includes(k)))throw new Error('Invalid model_selection fields');
  if(!['default','explicit'].includes(value.mode))throw new Error('Choose default or explicit model selection');
  if(typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>300)throw new Error('Model selection needs a reason up to 300 characters');
  // Undefined means the same request as the legacy omitted speed, never Standard.
  const speed=value.speed===undefined?'host_default':value.speed;
  if(!['host_default','fast_disabled'].includes(speed))throw new Error('Unsupported speed; choose host_default or supported fast_disabled');
  if(speed==='fast_disabled') {
    if(host!=='claude')throw new Error('Codex fast-off reset is unverified');
    if(catalog?.speed_support?.fast_disabled!==true)throw new Error('Claude fast_disabled requires verified installed version and settings control');
  }
  const common={reason:value.reason.trim(),...(value.speed===undefined?{}:{speed})};
  if(value.mode==='default') {
    if(value.model!==undefined||value.effort!==undefined)throw new Error('Default selection cannot specify model or effort');
    return {mode:'default',...common};
  }
  if(typeof value.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.model))throw new Error('Invalid model identifier');
  if(!catalog?.supported)throw new Error(`Model selection unavailable: ${catalog?.error??'inspect company_doctor models first'}`);
  const option=catalog.models?.find(m=>m.id===value.model);
  if(!option)throw new Error('Model is not an advertised permitted choice; inspect company_doctor models');
  if(host==='claude' && value.effort!==undefined)throw new Error('Claude model-specific effort support is unverified');
  if(value.effort!==undefined && (typeof value.effort!=='string'||!option.supported_efforts?.includes(value.effort)))throw new Error('Unsupported effort for this model');
  return {mode:'explicit',model:value.model,...(value.effort===undefined?{}:{effort:value.effort}),...common};
}
export function selectionKey(value) {
  const key=value?.mode==='explicit'?['explicit',value.model,value.effort??null]:['default'];
  // Preserve historical keys for the legacy/default request. An actual speed
  // change rotates the key; rationale alone never does.
  const speed=value?.speed??'host_default';
  if(speed!=='host_default')key.push(speed);
  return JSON.stringify(key);
}
// Assignment counts, not tokens, cost, effective model identity or acceptance.
// Use the complete history, not the eight-row activity window. Never count
// software tests or cumulative provider modelUsage as specialist model calls.
export function selectionUsage(state) {
  const groups=new Map();
  let assignments=0,missingReasons=0,withAppliedControls=0,withReportedModels=0;
  for(const job of Object.values(state.jobs??{})) {
    if(['development_test','development_preflight'].includes(job.kind)||['development_test','development_preflight'].includes(job.type))continue;
    assignments++;
    const request=job.model_selection??{mode:'default'};
    if(!request.reason?.trim())missingReasons++;
    if(job.model_evidence?.applied_controls)withAppliedControls++;
    if(job.model_evidence?.reported_models?.length)withReportedModels++;
    const dimensions={host:job.host??null,mode:request.mode,
      model:request.mode==='explicit'?request.model:null,
      effort:request.effort??null,speed:request.speed??'host_default'};
    const key=JSON.stringify(dimensions);
    if(!groups.has(key))groups.set(key,{...dimensions,assignments:0,statuses:{}});
    const group=groups.get(key);group.assignments++;
    const status=job.status??'unknown';
    group.statuses[status]=(group.statuses[status]??0)+1;
  }
  return {scope:'specialist_assignments_only',unit:'assignment_count',assignments,
    missing_reasons:missingReasons,with_applied_controls:withAppliedControls,
    with_host_reported_models:withReportedModels,
    coordinator_usage:'not_collected_host_ui_controlled',
    effective_settings:'not_established_by_requests_or_applied_controls',
    groups:[...groups.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
}
export function activityFor(state) {
  const jobs=Object.values(state.jobs??{}).sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''));
  const current=new Set([...jobs.filter(j=>['queued','running'].includes(j.status)),...jobs.slice(0,8)].map(j=>j.id));
  return jobs.filter(j=>current.has(j.id)).map(j=>{
    const artifact=state.records?.[j.artifact_id],review=artifact?.kind==='review'&&artifact.status==='Submitted'?artifact.review:null;
    const selection=j.model_selection??{mode:'default'},diagnostic=j.kind==='development_preflight',software=j.kind==='development_test'||diagnostic;
    const evidence=software?{reported_models:[],reported_effort:null,reported_service_tier:null,applied_controls:null,verification:'not_applicable',source:'software',scope:'no_model_call'}:{reported_models:[],reported_effort:null,reported_service_tier:null,applied_controls:null,verification:'unverified',source:'not_reported',scope:'unknown',...j.model_evidence};
    return {job_id:j.id,agent:diagnostic?'Fingerprint diagnostic (software)':software?'Test runner (software)':state.roles?.[j.role]?.name??j.role,
      instance_id:j.instance_id??null,task:j.task_summary??(j.task??(diagnostic?'Fingerprint validation environment':'Run authorized local tests')).replace(/\s+/g,' ').slice(0,160),
      status:j.status==='completed'?'returned':j.status,
      requested_model:software?null:selection.mode==='explicit'?selection.model:'Host default',requested_effort:software?null:selection.effort??null,
      requested_speed:software?null:selection.speed??'host_default',selection_reason:software?null:selection.reason??null,
      applied_controls:evidence.applied_controls,model_evidence:evidence,
      review:review?{verdict:review.verdict,subject_id:artifact.review_of?.id??null}:null,
      next_handoff:j.next_handoff?{description:j.next_handoff,status:'planned'}:null,
      ...(j.error?{error:j.error}:{}),artifact_id:j.artifact_id??null};
  });
}
