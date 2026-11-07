import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {operatingContext,validateOperatingIndex} from '../plugins/soloco/runtime/operating-state.mjs';
import {retainSnapshotEntry,resolveSnapshotEntry,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';

// FICTIONAL scripted judgments exercise real APIs, storage and worker delivery.
// They establish mechanics only: no actual native fit or semantic SOURCE QA.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-bootstrap-publication-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'bindings');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const sha=v=>digest(JSON.stringify(v));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.publication.fixture',s=>{fn(s);return s;}));
const common=f=>({root:f.root,session_id:f.session_id,epoch:f.epoch});
const context=(f,args)=>call('company_context',{...common(f),source_instruction:f.source_instruction,protocol:scoped.SCOPED_PROTOCOL,...args},'codex');
const operating=(f,args)=>context(f,{protocol:'operating-state-v1',...args});
const save=(f,args)=>call('company_save',{...common(f),...args},'codex');
const launch={check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})};
async function fixture({wrapped=false,literalID,partitioner=scoped.CORPUS_PARTITIONER}={}){
 const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'fictional-bootstrap-owner',epoch:1,source_instruction:'FICTIONAL authorized paused preparation and independent read-only reviews; no action grants.'};
 engine.bind(f.root,f.session_id,'codex');engine.open({...common(f),idea:'FICTIONAL initial homes through publication'},'codex');withStore(f.root,db=>db.migrate());
 mutate(f,s=>{s.paused=true;const original={id:'archive',kind:'artifact',revision:7,author_instance:'fictional-original-contributor',content:'UNKNOWN failed action; allowance exhausted. No execution or renewed permission.'};s.records.archive=wrapped?retainSnapshotEntry(s,original):original;if(literalID)s.records[literalID]={...original,id:literalID,content:'Literal JSON-looking ID; UNKNOWN, not a reference to another source.'};});
 const m=buildLegacyCoherentPlan(read(f));
 const args=partitioner===scoped.CORPUS_PARTITIONER?{selected_source_ids:['archive'],semantic_partition:{plan_sha256:m.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:['all'],selections:[{id:'all',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]},batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,home_intake_policy:scoped.INITIAL_PROPOSED_HOMES}:{};
 const p=await context(f,{action:'plan',source_id:'archive',partitioner,maintenance:true,...args});f.plan_id=p.id;return f;
}
function scripted(p){
 const r={...p.response_shape,verdict:'Pass',reason:'FICTIONAL scripted mechanics only; no semantic acceptance.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
 if(p.phase==='extract'){
  const b=p.reviewed_unit_bundle;r.unit_id=b.primary.id;r.unit_sha256=sha(b.primary);r.reviewed_unit_bundle_sha256=sha(b);
  r.items=[{id:'coherent-occurrence',kind:'boundary',text:'UNKNOWN failure and exhausted allowance retained; never grants execution.',scope:'*',provenance:b.provenance_sha256,interfaces:b.primary.required_interface?[b.primary.required_interface]:[]}];
 }else if(p.phase==='applicability'){
  r.summary='FICTIONAL complete unresolved conditions; all permission remains blocked.';
  r.mappings=p.item_keys.map(item=>({item,selection_ids:p.mapping_selection_ids,source_set:p.mapping_sets.source_set,occurrence_set:p.mapping_sets.occurrence_set,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'No execution; exhausted allowance.',unresolved_outcomes:'UNKNOWN failed action remains unresolved.',status:'represented',homes:p.homes.map(h=>h.source.id),reason:'FICTIONAL full conditions retained.'}));
  r.interfaces=p.interface_keys.length?[]:p.extractions.flatMap(e=>(e.result?.items??e.items).map(item=>({key:e.review.id+'/'+item.id,item}))).filter(i=>p.item_keys.includes(i.key)).flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));r.reviewed_interfaces=p.interface_keys;
 }else{r.summary='FICTIONAL full aggregate; no action authority.';r.unreviewed_interfaces=[];}
 return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};
}
async function scopedReview(f,args){
 const target=await context(f,{action:'target',plan_id:f.plan_id,...args});if(target.reused)return target;
 const q=engine.dispatch({...common(f),role:'qa',review_of:target.id,task:'FICTIONAL independent scripted preservation review.'},'codex',launch);
 const admission=read(f);scoped.validateScopedNativeAdmission(admission,admission.jobs[q.id],'fictional-preservation-'+q.id);
 const chunks=[];let packet;
 await work(f.root,q.id,async(_h,_s,prompt,_d,timeout,_selection,options)=>{
  const now=Date.now();options.onSpawn(executionTiming(now,{timeout_ms:Math.min(timeout,options.executionDeadlineAt?options.executionDeadlineAt-now:timeout),timeout_reason:options.timeoutReason}));
  let p=JSON.parse(prompt);const native_id='fictional-preservation-'+q.id;
  if(p.protocol===scoped.SCOPED_STREAM){chunks.push(p.text);if(!p.final)return {native_id,text:JSON.stringify({scoped_stream_ack:{body_sha256:p.body_sha256,sequence:p.sequence,range_sha256:p.range_sha256}})};p=JSON.parse(chunks.join(''));}
  if(p.protocol==='corpus-readable-structure-v1')p=scoped.expandCorpusStructure(p);packet=p;return {native_id,text:JSON.stringify(scripted(p))};
 });
 const s=read(f),job=s.jobs[q.id];assert.equal(job.status,'completed',job.error);return {target,job,record:s.records[job.artifact_id],packet};
}
const homeRecord=evidence_refs=>({version:1,kind:'obligation',scope:'*',owner:'fictional-owner',conditions:'UNKNOWN failed action remains unresolved; allowance exhausted.',exceptions:'No executable permission.',clearing:'Independent reconciliation under existing authority.',expires_at:null,dependencies:[],authority_refs:[],evidence_refs});
const home=(f,id,evidence_refs)=>save(f,{id,kind:'artifact',content:'UNKNOWN failure and exhausted allowance; no execution.',operating_record:homeRecord(evidence_refs),bootstrap_plan_id:f.plan_id});
const extractArgs=(f,unit_id)=>({phase:'extract',unit_id,...(read(f).records[f.plan_id].scoped_context_plan.partitioner?{delivery_protocol:scoped.SCOPED_STREAM}:{})});
async function extracts(f){const es=[];for(const u of read(f).records[f.plan_id].scoped_context_plan.units)es.push(await scopedReview(f,extractArgs(f,u.id)));return es;}
const domainArgs=(es,inventory)=>({phase:'applicability',delivery_schema:scoped.CORPUS_PHASED_DELIVERY,delivery_protocol:scoped.SCOPED_STREAM,selection_ids:['all'],extraction_review_ids:es.map(e=>e.record.id),current_home_inventory:inventory});
async function preserve(f,es){
 const inventory=Object.values(read(f).records).filter(r=>r.bootstrap_home_provenance).map(r=>scoped.scopedReference(r)).sort((a,b)=>a.id.localeCompare(b.id));
 const a=domainArgs(es,inventory),d=await scopedReview(f,a);assert.deepEqual(d.packet.current_home_inventory,inventory);
 const i=await scopedReview(f,{...a,domain_review_ids:[d.record.id],interface_keys:d.record.qualification_result.interfaces.map(i=>i.key)});
 const final=await scopedReview(f,{phase:'integration',delivery_schema:scoped.CORPUS_PHASED_DELIVERY,delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:[d.record.id],interface_review_ids:[i.record.id],current_home_inventory:inventory});
 const result=await context(f,{action:'apply',integration_review_id:final.record.id});assert.equal(result.applied,true);return final;
}
async function publish(f){
 const p=await operating(f,{action:'plan',maintenance:true});assert.equal(p.held,false,JSON.stringify(p.frontier));
 const q=engine.dispatch({...common(f),role:'qa',review_of:p.id,task:'FICTIONAL independent scripted operating publication QA.'},'codex',launch);
 const s=read(f),assignment=assignmentContext(s,s.jobs[q.id]),evidence=assignment.qualification_evidence??assignment.operating_evidence;
 const reads=evidence?Object.values(evidence.sources).flatMap(v=>{const ranges=[];for(let offset=0;offset<v.length;){let length=Math.min(16000,v.length-offset);if(/[\uD800-\uDBFF]/.test(v.raw[offset+length-1]))length--;ranges.push({source_id:v.source_id,sha256:v.sha256,offset,length});offset+=length;}return ranges;}):[];
 let first=true;
 await work(f.root,q.id,async(_h,_s,_p,_d,timeout,_selection,options)=>{
  if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
  const native_id='fictional-publication-'+q.id;
  if(reads.length)return {native_id,text:JSON.stringify({reads:reads.splice(0,4)})};
  return {native_id,text:JSON.stringify({content:'FICTIONAL scripted publication; no native semantic QA.',messages:[],notices:[],review:{verdict:'Pass',reason:'FICTIONAL complete mechanics fixture only.',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[p.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
 });
 const job=read(f).jobs[q.id];assert.equal(job.status,'completed',job.error);
 const result=await operating(f,{action:'apply',plan_id:p.id,review_id:job.artifact_id});assert.equal(result.published,true);return p;
}

for(const wrapped of [false,true])test(`FICTIONAL plain-ID initial-home lifecycle publishes S with frozen and canonical evidence (wrapped=${wrapped})`,async()=>{
 const f=await fixture(),original=read(f),v=original.records[f.plan_id].scoped_context_plan;assert.equal(Object.values(original.records).filter(r=>r.operating_record).length,0);
 const es=await extracts(f);if(wrapped)mutate(f,s=>{s.records.archive=retainSnapshotEntry(s,s.records.archive);});await home(f,'home-frozen',['archive']);await home(f,'home-extraction',[es[0].record.id]);
 const prepared=read(f);assert.deepEqual(prepared.records['home-frozen'].operating_record.evidence_refs,['archive']);assert.deepEqual(prepared.records['home-extraction'].operating_record.evidence_refs,[es[0].record.id]);assert.equal(prepared.records[f.plan_id].scoped_context_plan.extraction_identity,v.extraction_identity);
 const final=await preserve(f,es);const p=await publish(f),accepted=read(f);assert.equal(validateOperatingIndex(accepted),true);const checkpoint=operatingContext(accepted);assert.equal(checkpoint.homes.length,2);assert.equal(accepted.paused,true);assert.equal(accepted.governance,original.governance);
 assert.equal((await scopedReview(f,extractArgs(f,v.units[0].id))).review_id,es[0].record.id);
 if(wrapped){assert.notEqual(sha(accepted.records.archive),sha(resolveSnapshotEntry(accepted,accepted.records.archive)));assert.equal(accepted.records.archive.revision,7);}
 for(const change of [s=>s.records.archive.revision++,s=>s.records.archive.id='substituted',s=>{if(wrapped)s.records.archive.immutable_entry.immutable_snapshot.sha256='0'.repeat(64);else s.records.archive.content+=' changed';},s=>s.records['home-frozen'].bootstrap_home_provenance.owner.epoch++,s=>s.records[es[0].record.id].qualification_result.reason+=' changed',s=>s.jobs[es[0].job.id].native_id='fictional-original-contributor']){
  const bad=inheritSnapshots(accepted,structuredClone(accepted));change(bad);assert.throws(()=>operatingContext(bad),/Held|hold|changed|missing|corrupt/);
 }
 await home(f,'late',['archive']);assert.throws(()=>operatingContext(read(f)),/Held|hold|DIRTY|changed/);
 assert.equal(accepted.records[p.id].operating_plan.snapshot.homes.length,2);assert.ok(final.record.id);
});

test('FICTIONAL missing IDs and JSON-looking reference strings never become provenance edges',async()=>{
 const f=await fixture(),es=await extracts(f),before=read(f);
 for(const id of ['missing',JSON.stringify(scoped.scopedReference(before.records.archive)),JSON.stringify({id:es[0].record.id}),'{"id":"archive"}']){
  await assert.rejects(home(f,'invalid',[id]),/source missing/);assert.deepEqual(read(f),before);
 }
});

test('PUBLIC extraction inventories reject atomically before fresh creation and canonical reuse for range/coherent/corpus',async()=>{
 for(const partitioner of ['lossless-ranges-v1',scoped.COHERENT_PARTITIONER,scoped.CORPUS_PARTITIONER]){
  const f=await fixture({partitioner}),v=read(f).records[f.plan_id].scoped_context_plan,a=extractArgs(f,v.units[0].id),before=read(f);
  await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...a,current_home_inventory:[]}),/only supported on non-extraction/);assert.deepEqual(read(f),before);
  const e=await scopedReview(f,a),completed=read(f);assert.ok(e.record);
  await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...a,current_home_inventory:[]}),/only supported on non-extraction/);assert.deepEqual(read(f),completed);
  assert.equal((await scopedReview(f,a)).review_id,e.record.id);
 }
});


test('FICTIONAL JSON-looking existing frozen IDs stay literal and malformed reference objects reject',async()=>{
 const literalID='{"id":"missing"}',f=await fixture({literalID});await home(f,'literal',[literalID]);assert.deepEqual(read(f).records.literal.operating_record.evidence_refs,[literalID]);
 const before=read(f);await assert.rejects(home(f,'object',[{id:'archive',revision:7,sha256:sha(before.records.archive)}]),/complete typed/);assert.deepEqual(read(f),before);
});

// Explicit retained limitation: canonical independent identity traversal currently
// interprets the transformed immutable_entry in the coherent projection as a raw
// wrapper. No independent reviewer can start this at-capture variant. Do not
// bypass that Hold or mistake the post-extraction storage-wrapper case for it.
test('FICTIONAL wrapper already present at capture retains independent-admission Hold',async()=>{
 const f=await fixture({wrapped:true});await assert.rejects(extracts(f),/Immutable entry reference malformed/);
});
