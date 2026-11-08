import {createHash} from 'node:crypto';

// Shared storage/presentation projections. No authority or project dependencies.
export const digest = (text) => createHash('sha256').update(text).digest('hex');
const readers=new WeakMap();
export function bindPublicReader(state,reader) { readers.set(state,reader);return state; }
export const publicReaderFor=state=>readers.get(state);
const bytes=value=>Buffer.byteLength(value,'utf8');
const values=x=>Object.values(x??{});
const active=j=>['queued','running'].includes(j?.status);
const activeClaimStatuses=new Set(['queued','running']);

export function resourceClaims(state,excluding=null) {
  const claims=[];
  for(const job of Object.values(state.jobs??{})) {
    if(job.id===excluding || !job.coordination?.resources?.length)continue;
    // A pause/deadline may change status before process closure. Only runtime
    // closure evidence releases claims; no clock or terminal label proves it.
    if(!activeClaimStatuses.has(job.status) && job.coordination_release?.termination_confirmed===true)continue;
    for(const resource of job.coordination.resources)claims.push({resource,job_id:job.id,status:job.status,termination_unverified:!activeClaimStatuses.has(job.status)});
  }
  return claims;
}

// Reserved namespaces always resolve their declared family. Colliding raw record
// keys remain readable through @public:records:<key> or a hashed key locator.
export const storageSourceId=(family,key)=>bytes(key)>512||key.startsWith('@public:')?`@public:key:${family}:${digest(JSON.stringify(key))}`:`@public:${family}:${key}`;
function sourceId(state,family,key,value) {
  if(bytes(key)>512||key.startsWith('@public:'))return storageSourceId(family,key);
  if(family==='records')return key;
  const legacy=family==='jobs'&&value?.id===key?'job:'+key:family==='upgrade_history'&&typeof value?.id==='string'?'upgrade:'+value.id:null;
  return legacy&&bytes(legacy)<=512&&!Object.hasOwn(state.records??{},legacy)?legacy:`@public:${family}:${key}`;
}
export function publicEntries(state,collection) {
  if(collection==='sources')return ['governance','cos_instructions','roles','owner','idea','name','id','plugin_version','runtime_version','team_sha256','governance_sha256','context_classifications'].filter(k=>state[k]!==undefined).map(k=>({key:k,id:'@public:pinned:'+k,value:state[k]})).concat(['upgrade','handover'].filter(k=>state[k]!==undefined).map(k=>({key:k,id:'@public:current:'+k,value:state[k]})));
  const family=['active_jobs','claimed_jobs'].includes(collection)?'jobs':collection==='unresolved_notices'?'notices':['development','prototype_plans'].includes(collection)?'records':collection;
  if(!['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(family))throw Error('Unknown public collection');
  let rows=Object.entries(state[family]??{}).map(([key,value])=>({key,id:sourceId(state,family,key,value),value}));
  if(collection==='development')rows=rows.filter(r=>r.value?.development);
  if(collection==='prototype_plans')rows=rows.filter(r=>r.value?.prototype?.type==='plan');
  if(collection==='active_jobs')rows=rows.filter(r=>active(r.value));
  if(collection==='claimed_jobs'){const held=new Set(resourceClaims(state).map(c=>c.job_id));rows=rows.filter(r=>held.has(r.value?.id));}
  if(collection==='unresolved_notices')rows=rows.filter(r=>!r.value?.resolution);
  // New results/amendments of old objects must appear in the recent window.
  // Missing legacy timestamps fall back to reverse storage order.
  if(['records','jobs','messages','upgrade_history'].includes(collection))rows=rows.map((r,position)=>({...r,position,time:Math.max(0,...['updated_at','finished_at','created_at','at'].map(k=>Date.parse(r.value?.[k])||0))})).sort((a,b)=>b.time-a.time||b.position-a.position);
  return rows;
}
export function usageView(state) {
  let assignments=0,missing_reasons=0,with_applied_controls=0,with_host_reported_models=0;
  for(const job of values(state.jobs)) {
    if(job?.kind==='development_test'||job?.type==='development_test')continue;
    assignments++;if(typeof job?.model_selection?.reason!=='string'||!job.model_selection.reason.trim())missing_reasons++;
    if(job?.model_evidence?.applied_controls)with_applied_controls++;
    if(job?.model_evidence?.reported_models?.length)with_host_reported_models++;
  }
  return {scope:'specialist_assignments_only',unit:'assignment_count',assignments,missing_reasons,with_applied_controls,with_host_reported_models,effective_settings:'not_established_by_requests_or_applied_controls',coordinator_usage:'not_collected_host_ui_controlled',details_collection:'jobs'};
}

// Version 1 of a derived read index, never an authority or canonical state.
// Store only fields that affect membership/order/aggregates, never archived bodies.
export const PUBLIC_COLLECTIONS=['records','jobs','notices','messages','sessions','upgrade_history','context_classifications','active_jobs','claimed_jobs','unresolved_notices','development','prototype_plans','sources'];
export function publicIndexValue(family,value) {
  const v=value??{},out={};
  for(const k of ['id','updated_at','finished_at','created_at','at'])if(v[k]!==undefined)out[k]=v[k];
  if(family==='records') {
    out.development=!!v.development;
    if(v.prototype)out.prototype={type:v.prototype.type,export:v.prototype.export?{status:v.prototype.export.status,started_at:v.prototype.export.started_at}:undefined};
  }
  if(family==='notices')out.resolution=!!v.resolution;
  if(family==='jobs') {
    out.status=v.status;out.kind=v.kind;out.type=v.type;
    out.model_selection={reason:typeof v.model_selection?.reason==='string'&&v.model_selection.reason.trim()?'present':''};
    out.model_evidence={applied_controls:!!v.model_evidence?.applied_controls,reported_models:{length:v.model_evidence?.reported_models?.length??0}};
    if(v.coordination?.resources?.length)out.coordination={resources:Array.from(v.coordination.resources,()=>null)};
    out.coordination_release={termination_confirmed:v.coordination_release?.termination_confirmed};
  }
  return out;
}
export function publicCatalog(state) {
  const collections=Object.fromEntries(PUBLIC_COLLECTIONS.map(collection=>{
    const rows=publicEntries(state,collection);
    return [collection,{total:rows.length,inventory:digest(JSON.stringify([state.id??null,collection,rows.map(r=>[r.id,r.value?.id??null])])),rows:rows.map(({key,id})=>({key,id}))}];
  }));
  return {version:1,collections,usage:usageView(state),claims:resourceClaims(state).length};
}
