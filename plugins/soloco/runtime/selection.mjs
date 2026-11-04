// Selection is an assignment request, never proof of the model that answered.
export function normalizeSelection(value,host,catalog) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  if(value===undefined || value===null)return {mode:'default'};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','model','effort','reason'].includes(k)))throw new Error('Invalid model_selection fields');
  if(!['default','explicit'].includes(value.mode))throw new Error('Choose default or explicit model selection');
  if(typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>300)throw new Error('Model selection needs a reason up to 300 characters');
  if(value.mode==='default') {
    if(value.model!==undefined||value.effort!==undefined)throw new Error('Default selection cannot specify model or effort');
    return {mode:'default',reason:value.reason.trim()};
  }
  if(typeof value.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.model))throw new Error('Invalid model identifier');
  if(!catalog?.supported)throw new Error(`Model selection unavailable: ${catalog?.error??'inspect company_doctor models first'}`);
  const option=catalog.models?.find(m=>m.id===value.model);
  if(!option)throw new Error('Model is not an advertised permitted choice; inspect company_doctor models');
  if(value.effort!==undefined && (typeof value.effort!=='string'||!option.supported_efforts?.includes(value.effort)))throw new Error('Unsupported effort for this model');
  return {mode:'explicit',model:value.model,...(value.effort===undefined?{}:{effort:value.effort}),reason:value.reason.trim()};
}
export function selectionKey(value) {
  return JSON.stringify(value?.mode==='explicit'?['explicit',value.model,value.effort??null]:['default']);
}
export function activityFor(state) {
  const jobs=Object.values(state.jobs??{}).sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''));
  const current=new Set([...jobs.filter(j=>['queued','running'].includes(j.status)),...jobs.slice(0,8)].map(j=>j.id));
  return jobs.filter(j=>current.has(j.id)).map(j=>{
    const artifact=state.records?.[j.artifact_id],review=artifact?.kind==='review'&&artifact.status==='Submitted'?artifact.review:null;
    const selection=j.model_selection??{mode:'default'},software=j.kind==='development_test';
    return {job_id:j.id,agent:software?'Test runner (software)':state.roles?.[j.role]?.name??j.role,
      instance_id:j.instance_id??null,task:j.task_summary??(j.task??'Run authorized local tests').replace(/\s+/g,' ').slice(0,160),
      status:j.status==='completed'?'returned':j.status,
      requested_model:software?null:selection.mode==='explicit'?selection.model:'Host default',requested_effort:software?null:selection.effort??null,
      model_evidence:software?{reported_models:[],reported_effort:null,verification:'not_applicable',source:'software',scope:'no_model_call'}:j.model_evidence??{reported_models:[],reported_effort:null,verification:'unverified',source:'not_reported',scope:'unknown'},
      review:review?{verdict:review.verdict,subject_id:artifact.review_of?.id??null}:null,
      next_handoff:j.next_handoff?{description:j.next_handoff,status:'planned'}:null,
      ...(j.error?{error:j.error}:{}),artifact_id:j.artifact_id??null};
  });
}
