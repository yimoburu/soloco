// SOURCE-only plan originals and closed mechanical-review binding. No accepted
// historical-policy witness producer exists here; qualification stays Held.
import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {Store,owner} from '../store.mjs';
import {readNormalized,readImmutable,readStorageIntake} from '../record-storage.mjs';
import {canonical,peerDigest} from './ledger.mjs';
import {captureLegacyLocalWorkerOccupancyFrom,inspectOriginalLegacyLocalWorkerOccupancy} from './legacy-worker-occupancy.mjs';
import {inspectOriginalLegacyOccupancyPolicySource,verifyLegacyOccupancyPolicySourceData} from './legacy-occupancy-policy.mjs';

const COMPONENT='legacy-occupancy-mechanical-plan-component-v1',BINDING='legacy-occupancy-mechanical-review-binding-v1';
const MAX_ROWS=10000,MAX_BYTES=64*1024*1024,MAX_PLAN=16*1024*1024,MAX_VALUE=16*1024*1024;
const prepared=new WeakMap(),reviewed=new WeakMap();
const hash=x=>createHash('sha256').update(x).digest('hex');
const copy=x=>JSON.parse(canonical(x));
const same=(a,b)=>canonical(a)===canonical(b);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=1000&&!x.includes('\0');
const fail=code=>{throw Object.assign(Error(code),{code});};
const need=(ok,code='LEGACY_OCCUPANCY_PLAN_INVALID')=>{if(!ok)fail(code);};
const logical=key=>key.startsWith('~json:')?JSON.parse(key.slice(6)):key;
// A missing fixed source dependency is a Hold. An error in its imports or its
// provider is NOT rewritten into an optional/missing-dependency result.
let origin=null;
const originURL=new URL('./origin-plan.mjs',import.meta.url);
if(fs.lstatSync(originURL,{throwIfNoEntry:false}))origin=await import(originURL.href);
function backend(){
  need(origin&&['assertOriginActor','capturePeerOriginCut','captureOriginSidecarContents','validatePeerOriginMechanicalReview'].every(k=>typeof origin[k]==='function'),'LEGACY_OCCUPANCY_ORIGINAL_BACKEND_UNAVAILABLE');return origin;
}
function closed(value,keys){
  need(value&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);
  const all=Reflect.ownKeys(value),d=Object.getOwnPropertyDescriptors(value);
  need(all.length===keys.length&&all.every(k=>typeof k==='string'&&keys.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value')));return value;
}
function actual(store){
  need(store&&!types.isProxy(store)&&Object.getPrototypeOf(store)===Store.prototype,'LEGACY_OCCUPANCY_OWNING_STORE_SNAPSHOT_REQUIRED');
  const d=Object.getOwnPropertyDescriptors(store),db=d.db?.value;
  need(d.db&&Object.hasOwn(d.db,'value')&&d.inTransaction?.value===true&&typeof d.dir?.value==='string'&&db&&!types.isProxy(db)&&Object.getPrototypeOf(db)===DatabaseSync.prototype&&db.isTransaction===true,'LEGACY_OCCUPANCY_OWNING_STORE_SNAPSHOT_REQUIRED');
  need(db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version===4,'LEGACY_OCCUPANCY_ORIGINAL_LAYOUT_REQUIRED');return db;
}
function volume(db,table,column){
  const r=db.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(${column} AS BLOB))),0) AS bytes,COALESCE(MAX(length(CAST(${column} AS BLOB))),0) AS largest FROM ${table}`).get();
  need(['n','bytes','largest'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)&&r.n<=MAX_ROWS&&r.bytes<=MAX_BYTES&&r.largest<=MAX_VALUE,'LEGACY_OCCUPANCY_PLAN_CAPACITY');
}
function fullOriginals(db,directory,cut,b){
  volume(db,'immutable_values','bytes');volume(db,'events','value');
  const vault=db.prepare('SELECT sha256,bytes,CAST(bytes AS BLOB) AS raw FROM immutable_values ORDER BY sha256').all().map(r=>{
    need(typeof r.bytes==='string'&&hex(r.sha256)&&Buffer.from(r.bytes).equals(Buffer.from(r.raw))&&hash(r.raw)===r.sha256,'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');return {sha256:r.sha256,content:r.bytes};
  });
  const events=db.prepare('SELECT seq,at,type,value,CAST(value AS BLOB) AS raw FROM events ORDER BY seq').all().map(r=>{
    need(typeof r.value==='string'&&Buffer.from(r.value).equals(Buffer.from(r.raw)),'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');return {seq:r.seq,at:r.at,type:r.type,sha256:hash(r.raw),content:r.value};
  });
  const sidecars=b.captureOriginSidecarContents(directory).map(r=>{
    need(r.content instanceof Uint8Array&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.content.length===r.bytes&&hash(r.content)===r.sha256,'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');
    return {path:r.path,bytes:r.bytes,sha256:r.sha256,encoding:'base64',content:Buffer.from(r.content).toString('base64')};
  });
  need(sidecars.length<=1000&&sidecars.reduce((n,r)=>n+r.bytes,0)<=MAX_BYTES,'LEGACY_OCCUPANCY_PLAN_CAPACITY');
  need(same(vault.map(r=>({sha256:r.sha256,characters:r.content.length,utf8_bytes:Buffer.byteLength(r.content)})),cut.archive)&&same(events.map(({content,...r})=>({...r,utf8_bytes:Buffer.byteLength(content)})),cut.events)&&same(sidecars.map(({encoding,content,...r})=>r),cut.sidecars),'LEGACY_OCCUPANCY_ORIGINAL_CUT_CHANGED');
  return {vault,events,sidecars};
}
function conservativePartition(p){
  return p.jobs.map(j=>({job_id:j.job_id,source:j.source,capacity_known:j.capacity_known,local_occupied:j.capacity_known===false?null:true,original_unit:j.original_unit,original_policy_applicability:'UNPROVED',original_policy_witness:null,local_observation_sha256:peerDigest(j),release_authority:false}));
}
// Source-owned outer plan writer may inspect/embed this exact component. The
// component itself is read-only preparation and retains all original bytes.
export function prepareLegacyOccupancyMechanicalPlanFrom(store,sourceCap,actor){
  need(arguments.length===3,'LEGACY_OCCUPANCY_PLAN_INPUT');const db=actual(store),policy=inspectOriginalLegacyOccupancyPolicySource(sourceCap),b=backend(),a=b.assertOriginActor(actor);
  const state=readNormalized(db);owner(state,a.session_id,a.host);need(state.paused===true,'LEGACY_OCCUPANCY_PAUSED_REQUIRED');
  const cut=b.capturePeerOriginCut(db,{directory:store.dir});need(cut.body?.protocol==='peer-origin-exact-cut-v1'&&cut.sha256===peerDigest(cut.body)&&same(cut.snapshot.authority.owner,state.owner)&&cut.snapshot.authority.company_id===state.id&&cut.snapshot.execution.pending_jobs===0,'LEGACY_OCCUPANCY_ORIGINAL_CUT_CHANGED');
  const derivative=inspectOriginalLegacyLocalWorkerOccupancy(captureLegacyLocalWorkerOccupancyFrom(db));
  need(derivative.company_id===state.id&&same(derivative.sources,cut.body.sources),'LEGACY_OCCUPANCY_ORIGINAL_CUT_CHANGED');
  const partition=conservativePartition(derivative),body={protocol:COMPONENT,company_id:state.id,owner:copy(state.owner),actor:copy(a),baseline:copy(cut.baseline),source_cut:copy(cut.body),source_cut_sha256:cut.sha256,originals:fullOriginals(db,store.dir,cut.body,b),policy_source:policy,current_derivative_observation:derivative,original_policy_recipe:null,historical_policy_applicability:'UNPROVED',historical_policy_producer:'unavailable',partition,partition_sha256:peerDigest(partition),scope:'original-CLI-child-only',whole_domain_qualified:false,release_authority:false,authority_issued:false};
  const content=canonical(body);need(Buffer.byteLength(content)<=MAX_PLAN,'LEGACY_OCCUPANCY_PLAN_CAPACITY');
  const cap=Object.freeze(Object.create(null));prepared.set(cap,{body,content,sha256:hash(content)});return cap;
}
export function inspectOriginalLegacyOccupancyMechanicalPlan(cap){
  need(arguments.length===1,'LEGACY_OCCUPANCY_PLAN_INPUT');const p=prepared.get(cap);need(p,'LEGACY_OCCUPANCY_ORIGINAL_PLAN_REQUIRED');return {component:copy(p.body),component_sha256:p.sha256,historical_policy_qualified:false,authority_issued:false};
}
export function readOriginalLegacyOccupancyMechanicalPlan(cap,input){
  need(arguments.length===2,'LEGACY_OCCUPANCY_PLAN_INPUT');const p=prepared.get(cap);need(p,'LEGACY_OCCUPANCY_ORIGINAL_PLAN_REQUIRED');closed(input,['component_sha256','offset','length']);
  need(input.component_sha256===p.sha256,'LEGACY_OCCUPANCY_PLAN_CHANGED');need(Number.isSafeInteger(input.offset)&&input.offset>=0&&input.offset<p.content.length&&Number.isSafeInteger(input.length)&&input.length>0&&input.length<=4096,'LEGACY_OCCUPANCY_PLAN_RANGE');
  const split=i=>i>0&&i<p.content.length&&/[\uD800-\uDBFF]/.test(p.content[i-1])&&/[\uDC00-\uDFFF]/.test(p.content[i]);need(!split(input.offset),'LEGACY_OCCUPANCY_PLAN_RANGE');let end=Math.min(p.content.length,input.offset+input.length);if(split(end))end--;need(end>input.offset,'LEGACY_OCCUPANCY_PLAN_RANGE');
  return {component_sha256:p.sha256,offset:input.offset,length:end-input.offset,text:p.content.slice(input.offset,end),total_characters:p.content.length,next_offset:end<p.content.length?end:null,complete:end===p.content.length,authority_issued:false};
}
function boundComponent(db,plan){
  const p=plan.legacy_occupancy_component;
  closed(p,['protocol','company_id','owner','actor','baseline','source_cut','source_cut_sha256','originals','policy_source','current_derivative_observation','original_policy_recipe','historical_policy_applicability','historical_policy_producer','partition','partition_sha256','scope','whole_domain_qualified','release_authority','authority_issued']);
  need(p.protocol===COMPONENT&&p.company_id===plan.company_id&&same(p.owner,plan.owner)&&same(p.actor,plan.actor)&&same(p.baseline,plan.baseline)&&same(p.source_cut,plan.cut)&&p.source_cut_sha256===plan.cut_sha256&&p.source_cut_sha256===peerDigest(p.source_cut)&&plan.legacy_occupancy_component_sha256===peerDigest(p)&&Buffer.byteLength(canonical(p))<=MAX_PLAN,'LEGACY_OCCUPANCY_PLAN_CHANGED');
  verifyLegacyOccupancyPolicySourceData(p.policy_source);
  need(p.original_policy_recipe===null&&p.historical_policy_applicability==='UNPROVED'&&p.historical_policy_producer==='unavailable'&&p.scope==='original-CLI-child-only'&&p.whole_domain_qualified===false&&p.release_authority===false&&p.authority_issued===false,'LEGACY_POLICY_HISTORICAL_PRODUCER_UNAVAILABLE');
  const derivative=p.current_derivative_observation,jobSources=plan.cut.sources.filter(r=>r.family==='jobs');
  need(derivative?.protocol==='legacy-local-worker-occupancy-v1'&&derivative.company_id===plan.company_id&&derivative.release_authority===false&&derivative.whole_domain_qualified===false&&derivative.authority_issued===false&&derivative.policy_recipe_sha256===peerDigest(derivative.policy_recipe)&&same(derivative.sources,plan.cut.sources)&&Array.isArray(derivative.jobs)&&derivative.jobs.length===jobSources.length&&new Set(derivative.jobs.map(j=>j.job_id)).size===jobSources.length&&derivative.jobs.every(j=>jobSources.some(r=>logical(r.key)===j.job_id&&same(r,j.source))),'LEGACY_OCCUPANCY_PARTITION_CHANGED');
  need(Array.isArray(p.partition)&&p.partition.length<=MAX_ROWS&&same(p.partition,conservativePartition(derivative))&&p.partition_sha256===peerDigest(p.partition),'LEGACY_OCCUPANCY_PARTITION_CHANGED');
  closed(p.originals,['vault','events','sidecars']);need(Array.isArray(p.originals.vault)&&Array.isArray(p.originals.events)&&Array.isArray(p.originals.sidecars),'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');
  const vault=p.originals.vault.map(r=>{closed(r,['sha256','content']);need(typeof r.content==='string'&&hash(r.content)===r.sha256&&readImmutable(db,r.sha256)===r.content,'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');return {sha256:r.sha256,characters:r.content.length,utf8_bytes:Buffer.byteLength(r.content)};});
  const events=p.originals.events.map(r=>{closed(r,['seq','at','type','sha256','content']);const actual=db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(r.seq);need(actual&&same({seq:actual.seq,at:actual.at,type:actual.type,value:actual.value},{seq:r.seq,at:r.at,type:r.type,value:r.content})&&hash(r.content)===r.sha256,'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');return {seq:r.seq,at:r.at,type:r.type,sha256:r.sha256,utf8_bytes:Buffer.byteLength(r.content)};});
  const sidecars=p.originals.sidecars.map(r=>{closed(r,['path','bytes','sha256','encoding','content']);need(r.encoding==='base64'&&typeof r.content==='string','LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');const raw=Buffer.from(r.content,'base64');need(raw.toString('base64')===r.content&&raw.length===r.bytes&&hash(raw)===r.sha256,'LEGACY_OCCUPANCY_ORIGINAL_BYTES_CHANGED');return {path:r.path,bytes:r.bytes,sha256:r.sha256};});
  need(same(vault,plan.cut.archive)&&same(events,plan.cut.events)&&same(sidecars,plan.cut.sidecars),'LEGACY_OCCUPANCY_ORIGINAL_CUT_CHANGED');return p;
}
// Cold validator: actual original Store, canonical outer plan, fresh independent
// native QA and its closed journal are read by the fixed backend. No caller Pass,
// exclusion list, policy witness or validator function is accepted here.
export function validateOriginalLegacyOccupancyMechanicalReviewFrom(store,planId,reviewId,actor){
  need(arguments.length===4&&text(planId)&&text(reviewId),'LEGACY_OCCUPANCY_REVIEW_INPUT');const db=actual(store),b=backend(),a=b.assertOriginActor(actor);
  const state=readNormalized(db);owner(state,a.session_id,a.host);need(state.paused===true,'LEGACY_OCCUPANCY_PAUSED_REQUIRED');
  const record=state.records?.[planId],plan=record?.origin_quarantine_plan;
  need(plan?.protocol==='peer-origin-quarantine-plan-v1'&&plan.plan_id===planId&&record.id===planId&&record.revision===1&&record.content===canonical(plan)&&record.author_instance===a.native_id&&same(plan.owner,state.owner)&&same(plan.actor,a)&&Date.parse(plan.expires_at)>Date.now(),'LEGACY_OCCUPANCY_PLAN_CHANGED');
  const component=boundComponent(db,plan),review=state.records?.[reviewId];need(review?.kind==='review'&&typeof review.content==='string','LEGACY_OCCUPANCY_REVIEW_REQUIRED');
  const output=JSON.parse(review.content);closed(output,['protocol','permitted_action','plan_sha256','cut_sha256','legacy_authority','execution_resumed','legacy_occupancy']);
  need(output.protocol==='peer-origin-mechanical-review-v1'&&output.permitted_action==='quarantine_peer_origin'&&output.plan_sha256===peerDigest(plan)&&output.cut_sha256===plan.cut_sha256&&output.legacy_authority==='retired-without-conversion'&&output.execution_resumed===false,'LEGACY_OCCUPANCY_REVIEW_BINDING_CHANGED');
  const binding=closed(output.legacy_occupancy,['protocol','component_sha256','policy_archive_sha256','source_cut_sha256','partition_sha256','original_policy_association','original_policy_witness','release_authority','whole_domain_qualified']);
  need(binding.protocol===BINDING&&binding.component_sha256===peerDigest(component)&&binding.policy_archive_sha256===component.policy_source.archive_sha256&&binding.source_cut_sha256===plan.cut_sha256&&binding.partition_sha256===component.partition_sha256&&binding.original_policy_association==='UNPROVED'&&binding.original_policy_witness===null&&binding.release_authority===false&&binding.whole_domain_qualified===false,'LEGACY_POLICY_HISTORICAL_PRODUCER_UNAVAILABLE');
  // This fixed routine owns actual QA identity/context/closure and the exact
  // permitted plan+QA delta. Neither its output DATA nor Pass proves policy.
  const result=b.validatePeerOriginMechanicalReview(store,{plan_id:planId,review_ids:[reviewId]},a);
  const intake=readStorageIntake(db,plan.baseline,{values:true});need(result&&same(result.plan,plan)&&same(result.record,record)&&same(result.intake,intake)&&Array.isArray(result.observed)&&result.observed.length===1&&result.observed[0].review_id===reviewId,'LEGACY_OCCUPANCY_REVIEW_JOURNAL_CHANGED');
  const data={protocol:'legacy-occupancy-mechanical-review-observation-v1',plan_id:planId,plan_sha256:peerDigest(plan),component_sha256:peerDigest(component),review_id:reviewId,review_sha256:peerDigest(review),observed:copy(result.observed),baseline_sha256:plan.baseline.sha256,intake_sha256:peerDigest(intake),current_cut_sha256:result.current?.sha256,historical_policy_applicability:'UNPROVED',historical_policy_qualified:false,qualification_hold:'LEGACY_POLICY_HISTORICAL_PRODUCER_UNAVAILABLE',all_original_jobs_occupied:true,release_authority:false,authority_issued:false};
  need(hex(data.current_cut_sha256),'LEGACY_OCCUPANCY_REVIEW_JOURNAL_CHANGED');const cap=Object.freeze(Object.create(null));reviewed.set(cap,{db,data});return cap;
}
export function inspectOriginalLegacyOccupancyMechanicalReview(cap){
  need(arguments.length===1,'LEGACY_OCCUPANCY_REVIEW_INPUT');const r=reviewed.get(cap);need(r,'LEGACY_OCCUPANCY_ORIGINAL_REVIEW_REQUIRED');return copy(r.data);
}
// Deliberately no positive writer. A review validates its named source subject;
// it cannot supply absent historical association or accepted native capability.
export function writeOriginalLegacyOccupancyQualificationFrom(cap,ledger,tx){
  need(arguments.length===3&&reviewed.has(cap),'LEGACY_OCCUPANCY_ORIGINAL_REVIEW_REQUIRED');
  fail('LEGACY_POLICY_HISTORICAL_PRODUCER_UNAVAILABLE');
}
