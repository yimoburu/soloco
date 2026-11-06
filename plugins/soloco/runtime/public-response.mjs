// Public presentation only. Never modifies archived evidence or implies acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { digest, VERSION, PACKAGE, installedTeam, skillBody } from './store.mjs';
import { contextSource } from './current-state.mjs';
import { resourceClaims } from './coordination.mjs';
import { jobTimeoutState } from './timeout.mjs';

export const MODEL_MAX_BYTES=30000;
export const REPLY_MAX_BYTES=65536;
export const RESPONSE_FORMAT='soloco-current-v2';
const bytes=value=>Buffer.byteLength(value,'utf8');
export const modelText=value=>JSON.stringify(value);
export function toolResult(value) { return {content:[{type:'text',text:modelText(value)}]}; }
export function fits(value) {
  const text=modelText(value);
  return bytes(text)<=MODEL_MAX_BYTES && bytes(JSON.stringify({jsonrpc:'2.0',id:'x'.repeat(256),result:toolResult(value)}))<=REPLY_MAX_BYTES;
}
export function rpcReply(id,result,error) {
  // IDs are transport metadata, never company evidence. Bound hostile echo IDs too.
  if(!['string','number'].includes(typeof id)||bytes(JSON.stringify(id))>258)id=null;
  let reply={jsonrpc:'2.0',id,...(error?{error}:{result})};
  if(bytes(JSON.stringify(reply))>REPLY_MAX_BYTES || result?.content?.some(c=>c.type==='text'&&bytes(c.text)>MODEL_MAX_BYTES))reply={jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:'Response exceeds public transport budget. Use company_context inspect/read pages.'}]}};
  return JSON.stringify(reply);
}
const readers=new WeakMap();
export function bindPublicReader(state,reader) { readers.set(state,reader);return state; }
const values=x=>Object.values(x??{});
const active=j=>['queued','running'].includes(j?.status);
const cut=(s,n=180)=>typeof s==='string'?s.slice(0,n):(['number','boolean'].includes(typeof s)?s:null);
// Identity/control fields are exact or explicitly withheld. A prefix must never
// become an actionable ID, epoch, model, version or authority field.
const pick=(v,keys)=>{
  const out={},omitted=[];
  for(const k of keys)if(v?.[k]!==undefined) {
    const x=v[k];
    if(typeof x==='string'&&bytes(JSON.stringify(x))>512)omitted.push(k);
    else if(['string','number','boolean'].includes(typeof x)||x===null)out[k]=x;
    else omitted.push(k);
  }
  if(omitted.length){out.fields_not_inlined=omitted;out.hold='Load exact source before using withheld identity/control fields';}
  return out;
};
export function sourceReference(value,id) {
  const text=JSON.stringify(value);
  return {id,revision:Number.isSafeInteger(value?.revision)?value.revision:null,...(value?.revision!==undefined&&!Number.isSafeInteger(value.revision)?{revision_not_inlined:true}:{}),sha256:digest(text),total_characters:text.length,read:{tool:'company_context',action:'read'},consistency:'Hash-checked exact JSON value; changed live/installed sources fail closed. No historical copy is promised.'};
}
export function publicTeam(state,kind,policy='preserve') {
  if(kind==='pinned')return {plugin_version:state.plugin_version,governance:state.governance,governance_sha256:state.governance_sha256,roles:state.roles,cos_instructions:state.cos_instructions??skillBody(fs.readFileSync(path.join(PACKAGE,'compat/company-0.1.0.md'),'utf8'))};
  if(!['installed','candidate'].includes(kind)||!['preserve','installed'].includes(policy))throw Error('Unknown public team source');
  const team=installedTeam();
  if(kind==='candidate'&&policy==='preserve'){team.governance=state.governance;team.governance_sha256=state.governance_sha256;}
  return team;
}
// Reserved namespaces always resolve their declared family. Colliding raw record
// keys remain readable through @public:records:<key> or a hashed key locator.
export const storageSourceId=(family,key)=>bytes(key)>512||key.startsWith('@public:')?`@public:key:${family}:${digest(JSON.stringify(key))}`:`@public:${family}:${key}`;
export function publicSource(state,id) {
  if(!id.startsWith('@public:'))return contextSource(state,id);
  const [,family,...tail]=id.split(':');const key=tail.join(':');
  if(family==='team') {
    const [kind,policy,field]=tail,team=publicTeam(state,kind,policy);
    return field?(['governance','cos_instructions','roles'].includes(field)?team[field]:undefined):team;
  }
  if(['key','keyname'].includes(family)) {
    const [collection,hash]=tail;
    if(!['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(collection))return undefined;
    const matches=Object.keys(state[collection]??{}).filter(k=>digest(JSON.stringify(k))===hash);
    if(matches.length!==1)throw Error('Missing or ambiguous public storage-key handle');
    return family==='keyname'?matches[0]:state[collection][matches[0]];
  }
  if(family==='pinned' && ['governance','cos_instructions','roles','owner','idea','name','id','plugin_version','runtime_version','team_sha256','governance_sha256','context_classifications'].includes(key))return state[key];
  if(family==='current' && ['upgrade','handover'].includes(key))return state[key];
  if(['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(family))return Object.hasOwn(state[family]??{},key)?state[family][key]:undefined;
}
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
export function itemView(value,id,collection='records') {
  const ref=sourceReference(value,id),v=value??{};
  if(collection==='context_classifications'||id==='@public:pinned:context_classifications')return {stored_metadata:true,current_applicability:'Not validated by inspection; exact metadata can contain stale or invalid proofs',...pick(v,['disposition','at']),source:ref};
  const view={...pick(v,['id','revision','kind','role','status','author_role','author_instance','instance_id','native_id','host','epoch','created_at','updated_at','finished_at','artifact_id','to','from','at','seen_at']),source:ref,preview:true};
  // All excerpts explicitly remain previews; source provides exact missing fields.
  if(typeof value==='string')view.text=cut(value,240);
  if(v.content!==undefined)view.content=cut(v.content,240);
  if(v.summary!==undefined)view.summary=cut(v.summary,240);
  if(v.reference!==undefined) {
    const reference=pick(v,['reference']);
    if(Object.hasOwn(reference,'reference'))view.reference=reference.reference;
    else {view.reference_not_inlined=true;view.hold='Load exact source before using withheld reference';}
  }
  if(v.task!==undefined||v.task_summary!==undefined)view.task_summary=cut(v.task_summary??v.task,160);
  if(v.error!==undefined)view.error=cut(v.error,240);
  if(v.next_handoff!==undefined)view.next_handoff={description:cut(v.next_handoff),status:'planned'};
  if(v.review)view.review=pick(v.review,['verdict','permitted_action']);
  if(v.review_of)view.review_of=pick(v.review_of,['id','revision']);
  if(v.acceptance)view.acceptance={recorded:true,preview:true,source:ref};
  if(['jobs','active_jobs','claimed_jobs'].includes(collection)) {
    view.timeout={...pick(v,['timeout_policy_version','timeout_ms','timeout_reason','execution_started_at','execution_deadline_at']),state:jobTimeoutState(v,Date.now())};
    if(v.timeout_reconciliation)view.timeout.reconciliation=pick(v.timeout_reconciliation,['state','phase','at','termination_confirmed']);
    if(v.execution_failure)view.timeout.failure=pick(v.execution_failure,['kind','reason']);
    if(v.model_selection)view.model_selection=pick(v.model_selection,['mode','model','effort','speed','reason']);
    if(v.model_evidence)view.model_evidence={...pick(v.model_evidence,['verification','source','scope','reported_effort','reported_service_tier']),preview:true,exact_source:ref};
    if(v.coordination)view.coordination={dependencies:v.coordination.dependencies?.length??0,resources:v.coordination.resources?.length??0,preview:true,exact_source:ref};
    if(v.coordination_release)view.coordination_release=pick(v.coordination_release,['termination_confirmed','reason','at']);
    view.result_semantics='Lifecycle completion is not QA Pass or receiver acceptance';
  }
  return view;
}
export function mutationView(value,id,collection='records') {
  // Preserve exact small legacy receipts; growing records switch explicitly to
  // a preview and exact handle instead of accumulating revision history in chat.
  if(fits(value))return value;
  const prefix=collection==='jobs'?'job:':`@public:${collection}:`;
  const key=collection==='records'?id:id.startsWith(prefix)?id.slice(prefix.length):id;
  id=storageSourceId(collection,key);
  const view=itemView(value,id,collection);
  if(id.startsWith('@public:key:'))view.storage_key_source=sourceReference(key,id.replace('@public:key:','@public:keyname:'));
  return view;
}
export function upgradeInspectionView(raw,{old,next,installed}) {
  const policy=raw.governance.policy;
  const teamRefs=(team,kind)=>Object.fromEntries(['governance','cos_instructions','roles'].map(field=>[field,sourceReference(team[field],`@public:team:${kind}:${policy}:${field}`)]));
  const result={...raw,response_format:RESPONSE_FORMAT,owner:{...pick(raw.owner,['host','session_id','epoch']),source:sourceReference(raw.owner,'@public:pinned:owner')},
    governance:{policy,current:sourceReference(old.governance,`@public:team:pinned:${policy}:governance`),installed:sourceReference(installed.governance,`@public:team:installed:${policy}:governance`)},
    instruction_sources:{pinned:teamRefs(old,'pinned'),installed:teamRefs(installed,'installed'),candidate:teamRefs(next,'candidate')},
    inspection_semantics:'Measured preview, not reservation, QA acceptance or adoption. Read exact instructions before preparing; changed hashes require reinspection.'};
  delete result.prior_instructions;delete result.candidate_instructions;
  if(typeof result.company_id==='string'&&bytes(result.company_id)>512){delete result.company_id;result.company_source=sourceReference(raw.company_id,'@public:pinned:id');result.hold='Load exact company identity before preparing';}
  // Role names can also be unbounded identities. Exact lists remain in roles.
  if(bytes(JSON.stringify(result.changes.roles))>2000)result.changes={...result.changes,roles:{total:raw.changes.roles.length,returned:0,complete:false,exact_sources:[result.instruction_sources.pinned.roles,result.instruction_sources.candidate.roles]}};
  return result;
}
export function upgradeView(u) {
  if(!u)return null;
  return {...pick(u,['id','status','created_at','updated_at','applied_at','verified_at','error','review_deadline_policy','deadline_ms','review_window_minutes']),...pick({candidate_version:u.candidate?.plugin_version,previous_version:u.previous?.plugin_version},['candidate_version','previous_version']),source:sourceReference(u,'@public:current:upgrade'),preview:true};
}
function decodeCursor(cursor,collection,inventory) {
  if(cursor===undefined)return 0;
  try {const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(c.collection===collection&&c.inventory===inventory&&Number.isSafeInteger(c.offset)&&c.offset>=0)return c.offset;}catch{}
  throw Error('Stale or invalid public cursor; restart this collection from its first page');
}
const encodeCursor=(collection,inventory,offset)=>Buffer.from(JSON.stringify({collection,inventory,offset})).toString('base64url');
export function publicPage(state,{collection='records',cursor,offset,limit=8}={}) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid public page limit');
  if(cursor!==undefined&&offset!==undefined)throw Error('Choose cursor or offset, not both');
  const reader=readers.get(state),rows=reader?null:publicEntries(state,collection);
  const info=reader?.info(collection);
  // Cursor membership binding survives delivery receipts and changed item bytes.
  // Exact item hashes are reissued on each page; changed membership fails closed.
  const inventory=info?.inventory??digest(JSON.stringify([state.id??null,collection,rows.map(r=>[r.id,r.value?.id??null])])),total=info?.total??rows.length;
  const start=cursor===undefined?(offset??0):decodeCursor(cursor,collection,inventory);
  if(!Number.isSafeInteger(start)||start<0||start>total)throw Error('Invalid public page offset');
  const page={response_format:RESPONSE_FORMAT,collection,items:[],total,offset:start,returned:0,complete:false,next_cursor:null,inventory_sha256:inventory,previews:true,consistency:'Live membership; exact item hashes may change. Restart on a stale cursor.'};
  for(const row of reader?reader.rows(collection,start,limit):rows.slice(start,start+limit)) {
    let item=itemView(row.value,row.id,collection);
    if(bytes(JSON.stringify(item))>(collection==='active_jobs'?1800:5000))item={...pick(row.value,['id','kind','role','status']),source:item.source,...(collection==='active_jobs'?{timeout:{state:jobTimeoutState(row.value,Date.now())}}:{}),preview:true,detail_not_inlined:true};
    if(row.id.startsWith('@public:key:'))item.storage_key_source=sourceReference(row.key,row.id.replace('@public:key:','@public:keyname:'));
    if(bytes(JSON.stringify([...page.items,item]))>7000)break;
    page.items.push(item);
  }
  if(total>start&&!page.items.length)throw Error('Source identity exceeds public page budget; use company_storage backup for exact export');
  page.returned=page.items.length;page.complete=start+page.returned===total;
  if(!page.complete)page.next_cursor=encodeCursor(collection,inventory,start+page.returned);
  return page;
}
function collectionInfo(state,collection) {
  const info=readers.get(state)?.info(collection),rows=info?null:publicEntries(state,collection),total=info?.total??rows.length;
  const inventory=info?.inventory??digest(JSON.stringify([state.id??null,collection,rows.map(r=>[r.id,r.value?.id??null])]));
  return {collection,total,returned:0,complete:total===0,next_cursor:total?encodeCursor(collection,inventory,0):null,inspect_collection:collection};
}
export function exactRead(state,{id,sha256,offset=0,length=8000}) {
  const value=publicSource(state,id);
  if(value===undefined)throw Error('Missing or changed supplemental source');
  return exactTextRead(JSON.stringify(value),{id,sha256,offset,length},value);
}
export function exactTextRead(text,{id,sha256,offset=0,length=8000},value=null) {
  if(digest(text)!==sha256)throw Error('Missing or changed supplemental source');
  if(!Number.isSafeInteger(offset)||offset<0||offset>=text.length||!Number.isSafeInteger(length)||length<1||length>32768)throw Error('Invalid supplemental evidence range');
  // UTF-16 offsets match company_context. Adapt only the returned range, never
  // substitute/summarize bytes. next_offset makes full exact reconstruction explicit.
  let end=Math.min(text.length,offset+length);
  // Detach each small slice: V8 substrings can otherwise retain a separate huge
  // backing string for every page accumulated by an exact-read caller.
  const reply=()=>({id,revision:Number.isSafeInteger(value?.revision)?value.revision:null,...(value?.revision!==undefined&&!Number.isSafeInteger(value.revision)?{revision_not_inlined:true}:{}),sha256,offset,length:end-offset,text:JSON.parse(JSON.stringify(text.slice(offset,end))),total_characters:text.length,next_offset:end<text.length?end:null,complete:end===text.length});
  while(!fits(reply())&&end>offset)end=offset+Math.floor((end-offset)/2);
  if(end===offset)throw Error('Source identity exceeds public read budget; use company_storage backup');
  return reply();
}
export function controlView(state) {
  return {...pick(state,['revision','paused','team_sha256']),owner:{...pick(state?.owner,['host','session_id','epoch']),...(state?.owner?{source:sourceReference(state.owner,'@public:pinned:owner')}:{})}};
}
function usageView(state) {
  let assignments=0,missing_reasons=0,with_applied_controls=0,with_host_reported_models=0;
  for(const job of values(state.jobs)) {
    if(job?.kind==='development_test'||job?.type==='development_test')continue;
    assignments++;if(typeof job?.model_selection?.reason!=='string'||!job.model_selection.reason.trim())missing_reasons++;
    if(job?.model_evidence?.applied_controls)with_applied_controls++;
    if(job?.model_evidence?.reported_models?.length)with_host_reported_models++;
  }
  return {scope:'specialist_assignments_only',unit:'assignment_count',assignments,missing_reasons,with_applied_controls,with_host_reported_models,effective_settings:'not_established_by_requests_or_applied_controls',coordinator_usage:'not_collected_host_ui_controlled',details_collection:'jobs'};
}
export function currentView(state,{open=false,capabilities={}}={}) {
  if(!state)throw Error('Company initialization is incomplete; use company_open');
  const result={response_format:RESPONSE_FORMAT,display_fields_are_previews:true,...pick({...state,company_id:state.id,runtime_version:state.runtime_version??state.plugin_version},['name','idea','revision','phase','mode','paused','plugin_version','governance_sha256','team_sha256','company_id','runtime_version']),company_source:state.id===undefined?null:sourceReference(state.id,'@public:pinned:id'),owner:controlView(state).owner,executing_runtime_version:VERSION,upgrade:upgradeView(state.upgrade),handover:state.handover?{...pick(state.handover,['id','status','subject_sha256','created_at']),source:sourceReference(state.handover,'@public:current:handover'),preview:true}:null,
    retrieval:{tool:'company_context',inspect:'Choose collection and follow next_cursor until complete; pages are previews',read:'Supply exact source.id and sha256; concatenate text by next_offset. Changed hashes require a fresh inspect.',archive_export:'company_storage backup (files only)',legacy:'v2 replaces full status arrays; use inspect/read for exact objects'},
    active_jobs:publicPage(state,{collection:'active_jobs',limit:3}),records:publicPage(state,{collection:'records',limit:3}),jobs:publicPage(state,{collection:'jobs',limit:3}),notices:publicPage(state,{collection:'unresolved_notices',limit:3}),messages:publicPage(state,{collection:'messages',limit:2}),sessions:collectionInfo(state,'sessions'),upgrade_history:collectionInfo(state,'upgrade_history'),resource_claims:{total:readers.get(state)?.claims??resourceClaims(state).length,jobs:publicPage(state,{collection:'claimed_jobs',limit:1}),rule:'Claims from uncertain jobs remain held until runtime confirms process closure'},
    capabilities:{standalone_sessions:true,model_selection:{eligible:['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.6.10','0.6.11','0.6.12','0.6.13','0.7.0','0.7.1','0.7.2',VERSION].includes(state.plugin_version),catalog:'company_doctor.models'},...Object.fromEntries(Object.entries(capabilities).map(([key,value])=>[key,{...pick(value,['supported','eligible','blocker']),limits:pick(value?.limits,['max_files','max_bytes','per_file_max_bytes','max_total_bytes','max_attempts','max_test_ms','context_admission_characters','network','package_installation','source_integration','test_execution','external_execution']),preview:true}])),details:'company_doctor and exact plan inspection; installed capability never grants company authority',external_execution:false,background_founder_delivery:false}};
  // Activity deliberately reuses bounded job truth; no evidence/model output spread.
  result.activity={items:[...result.active_jobs.items,...result.jobs.items.filter(j=>!result.active_jobs.items.some(a=>a.source.id===j.source.id))].map(j=>({...pick(j,['id','role','status','artifact_id','task_summary']),source:j.source})),previews:true,complete:result.active_jobs.complete&&result.jobs.complete,inspect_collection:'jobs'};
  result.selection_usage=readers.get(state)?.usage??usageView(state);
  result.pinned=publicPage(state,{collection:'sources',limit:10});
  if(open) {
    result.instruction_loading='Before operational work load exact pinned governance, cos_instructions and roles. company_open is required on initial attachment or changed team; installation grants no authority.';
    for(const key of ['governance','cos_instructions','roles']) {
      // Inline ordinary small pinned teams for legacy callers; explicit handles
      // remain for oversized instructions and exact changes.
      if(bytes(JSON.stringify(state[key]??null))<2000)result[key]=state[key];
    }
  }
  if(!fits(result)||bytes(JSON.stringify(result))>24000) {
    // Bounded defaults have several independent pages. Shrink only previews and
    // retain truthful counts/cursors; no incomplete collection can appear complete.
    for(const key of ['records','jobs','messages','notices'])result[key]=publicPage(state,{collection:key==='notices'?'unresolved_notices':key,limit:1});
    result.activity={items:[],complete:false,inspect_collection:'jobs'};
    for(const key of ['governance','cos_instructions','roles'])delete result[key];
  }
  if(!fits(result))throw Error('Current view identity exceeds public budget; use company_context inspect pages or company_storage backup');
  return result;
}

// Diagnostic catalogs are computed host metadata, never company_context sources.
// Remove prose only; IDs, eligibility, defaults, tiers and observability stay exact.
export function doctorView(raw,{cursor,limit=100}={}) {
  if(cursor===undefined&&raw.models.models.length<=limit&&fits(raw))return raw;
  const models=raw.models.models.map(({name,description,serviceTiers,...model})=>({...model,...(serviceTiers?{serviceTiers:serviceTiers.map(({name,description,...tier})=>tier)}:{})}));
  const inventory=digest(JSON.stringify(raw.models));
  const start=decodeCursor(cursor,'doctor_models',inventory);
  if(start>models.length)throw Error('Invalid doctor catalog offset');
  const result={...raw,models:{...raw.models,models:[],window:{total:models.length,offset:start,returned:0,complete:false,next_cursor:null,inventory_sha256:inventory},presentation:'Optional names and descriptions omitted; selection fields and advertised/observed labels retained exactly'}};
  for(const model of models.slice(start,start+limit)) {
    result.models.models.push(model);
    if(!fits(result)){result.models.models.pop();break;}
  }
  const window=result.models.window;
  window.returned=result.models.models.length;window.complete=start+window.returned===models.length;
  if(!window.complete)window.next_cursor=encodeCursor('doctor_models',inventory,start+window.returned);
  // Reserve space for continuation metadata before handing off the page.
  while(!fits(result)&&window.returned>1){result.models.models.pop();window.returned--;window.complete=false;window.next_cursor=encodeCursor('doctor_models',inventory,start+window.returned);}
  if((models.length>start&&!window.returned)||!fits(result))throw Error('Doctor diagnostics exceed the page budget; retry without optional root hook diagnostics');
  return result;
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
