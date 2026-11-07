import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {withStore,digest,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {resolveSnapshot,inheritSnapshots,retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {classificationFor,reviewedContext} from '../plugins/soloco/runtime/current-state.mjs';
import {operatingContext} from '../plugins/soloco/runtime/operating-state.mjs';
const protocol=scoped.SCOPED_PROTOCOL,sha=v=>digest(JSON.stringify(v)),bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coherent-runtime-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('contract.fixture',s=>{fn(s);return s;}));
const read=f=>withStore(f.root,db=>db.read());
const call=(f,args)=>engine.contextControl({...f,...args},'codex');
const token=(domain,n,status='OPEN')=>`OBL~${domain}~${String(n).padStart(3,'0')}~CUSTOMER_${n}_NO_EXPORT_ABOVE_${17*n+3}_ROWS_UNTIL_CONSENT_${n%7}_IN_REGION_${n%11}~${status}~END`;
function fixture({count=1,domains=1,extra={},maintenance=false,kind='artifact',homeKind='artifact',operating=false,deferPlan=false,partitioner=scoped.COHERENT_PARTITIONER}={}){
  const root=fs.mkdtempSync(path.join(tmp,'company-')),session_id=id('owner'),f={root,session_id,epoch:1,source_instruction:'Explicit fixture instruction: qualify exact source read-only, preserve all failed evidence and OPEN uncertainty.'};
  engine.bind(root,session_id,'codex');engine.open({...f,idea:'Source-only contract fixture'},'codex');withStore(root,db=>db.migrate());
  const clauses=Array.from({length:count},(_,n)=>token('D'+String(Math.min(domains-1,Math.floor(n*domains/count))).padStart(2,'0'),n));
  mutate(f,s=>{s.roles={qa:{name:'Independent QA'},engineer:{name:'Engineer'}};s.governance='Preparation only. No execution or renewed allowance.';s.cos_instructions='Preserve uncertain effects and exhausted allowances.';s.records.old={id:'old',kind,revision:1,author_instance:'historical-producer',content:'Historical evidence grants no current permission.',clauses,...extra};if(maintenance)s.paused=true;s.team_sha256=teamHash(s);});
  for(let d=0;d<domains;d++){const domain='D'+String(d).padStart(2,'0');engine.save({...f,id:'home-'+domain,kind:homeKind,content:clauses.filter((_,n)=>Math.min(domains-1,Math.floor(n*domains/count))===d).join('\n')||'No additional obligation.',context_obligations:{version:1,scope:domain},...(operating?{operating_record:{version:1,kind:'obligation',scope:domain,owner:'runner',conditions:'Always',exceptions:'None',clearing:'Independent review',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['home-'+domain]}}:{})},'codex');}
  if(deferPlan)return f;
  const p=call(f,{action:'plan',protocol,source_id:'old',maintenance,partitioner});f.plan_id=p.id;f.original=p.original;f.units=p.units;f.all_units=call(f,{action:'inspect',plan_id:p.id,limit:16});f.extraction_identity=p.extraction_identity;f.clauses=clauses;return f;
}
function unitPages(f){const units=[];let offset=0;do{const page=call(f,{action:'inspect',plan_id:f.plan_id,offset,limit:16});units.push(...page.units);offset=page.next_offset;}while(offset!==null);return units;}
function envelope(r){return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};}
// CONTRACT DOUBLES, not real independent semantic QA. They implement a tiny
// explicit obligation language, check exact source/home strings and conflicts,
// and exercise the REAL public engine/store/worker/delivery/closure pipeline.
// FICTIONAL ADAPTER: scripted contract judgments, never independent/native QA evidence.
function contractReview(p){
  const r={...p.response_shape,verdict:'Pass',reason:'FICTIONAL ADAPTER: complete scripted source contract; no live QA claim.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
  if(p.phase==='extract'){
    const b=p.reviewed_unit_bundle,u=b.primary;
    r.items=[{id:'coherent-occurrence',kind:'boundary',text:'Fictional occurrence '+u.id+' retains all local restrictions and remains OPEN; no current permission.',scope:'*',provenance:b.provenance_sha256,interfaces:[u.required_interface]}];
    r.unit_id=u.id;r.unit_sha256=sha(u);r.reviewed_unit_bundle_sha256=sha(b);
  }else if(p.phase==='applicability'){
    const all=p.extractions.flatMap(e=>(e.result?.items??e.items).map(item=>({key:e.review.id+'/'+item.id,item}))).filter(i=>p.item_keys.includes(i.key));
    r.summary='HISTORICAL_GLOBAL_EXHAUSTED; FAILED; UNKNOWN; no retry until reconciliation; FICTIONAL ADAPTER: all fixture occurrences and inbound contexts reconciled; all restrictions remain OPEN.';
    r.mappings=all.flatMap(({key})=>(p.corpus_claim?p.corpus_claim.selected_source_ids:[null]).map(sourceId=>({item:key,...(p.corpus_claim?{source_ids:[sourceId],occurrence_ids:p.mapping_occurrence_ids,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'FICTIONAL contextual judgment for '+sourceId+': '+(sourceId==='alias'?'DENY even with consent':'ALLOW only after new consent')+'; every distinct physical ancestor remains binding; LATE_NO_EXPORT overrides all local permission.',unresolved_outcomes:'OPEN remains OPEN; failures retained; retries exhausted; no execution or export permission.'}:{}),...(p.mapping_selection_ids?{selection_ids:p.mapping_selection_ids}:{}),status:'represented',homes:p.homes.map(h=>h.source.id),reason:'Fictional complete source conditions preserved, with all occurrence differences and OPEN restrictions.'})));
    if(p.corpus_claim?.selected_source_ids?.length===1)for(const mapping of r.mappings){mapping.source_set=structuredClone(p.mapping_sets.source_set);delete mapping.source_ids;}
    r.interfaces=p.interface_keys.length?[]:all.flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));
    r.reviewed_interfaces=p.interface_keys;
    if(JSON.stringify(p.extractions).includes('LATE_NO_EXPORT')&&!p.homes.some(h=>h.value.content.includes('LATE_NO_EXPORT'))){r.verdict='Blocked';r.permitted_action='hold';r.reason='Fictional late qualifier missing from current home';r.blockers=[r.reason];}
  }else{r.summary='FICTIONAL ADAPTER: independently scripted complete integration, no action permission.';r.unreviewed_interfaces=[];}
  return envelope(r);
}
async function run(f,args,{review=contractReview,native,modelHook,streamHook,omitTiming=false,legacy=false}={}){
  const t=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'target',...args,plan_id:args.plan_id??f.plan_id},'codex');if(t.reused)return t;
  if(legacy)mutate(f,s=>{delete s.records[t.id].scoped_context_target.delivery_schema;});
  const queued=engine.dispatch({...f,role:'qa',review_of:t.id,task:'Independent scoped contract review.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
  const streamParts=[],streamRequests=[];
  await work(f.root,queued.id,async(host,session,prompt,dir,timeout,selection,options)=>{
    const start=Date.now();if(!omitTiming)options.onSpawn(executionTiming(start,{timeout_ms:Math.min(timeout,options.executionDeadlineAt?options.executionDeadlineAt-start:timeout),timeout_reason:options.timeoutReason}));
    let packet=JSON.parse(prompt);
    if(packet.protocol==='scoped-stream-v1'){
      streamRequests.push(prompt);streamParts.push(packet.text);
      if(streamHook){const override=await streamHook(packet,{session,options,queued});if(override)return override;}
      if(!packet.final)return {native_id:native??'contract-native-'+queued.id,text:JSON.stringify({scoped_stream_ack:{body_sha256:packet.body_sha256,sequence:packet.sequence,range_sha256:packet.range_sha256}})};
      packet=JSON.parse(streamParts.join(''));
    }
    if(packet.protocol==='corpus-readable-structure-v1')packet=scoped.expandCorpusStructure(packet);
    if(modelHook)await modelHook(packet);
    return {native_id:native??'contract-native-'+queued.id,text:JSON.stringify(review(packet))};
  });
  const s=read(f),j=s.jobs[queued.id];return {target:t,job:j,review:s.records[j.artifact_id],streamRequests,packet:streamRequests.length?(j.status==='completed'?decodePacket(JSON.parse(streamParts.join(''))):null):j.qualification_delivery&&decodePacket(JSON.parse(j.qualification_delivery.wire))};
}

const decodePacket=p=>p.protocol==='corpus-readable-structure-v1'?scoped.expandCorpusStructure(p):p;

import {buildScopedStream} from '../plugins/soloco/runtime/scoped-stream.mjs';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
const fit=scoped.CORPUS_PHASED_DELIVERY;
const meaning='ALLOW only after consent; DENY even with consent; UNKNOWN; FAILED; EXHAUSTED; OPEN; no retry.';
async function setup({twoSources=false}={}){
 const f=fixture({deferPlan:true});
 mutate(f,s=>{s.records.old.content=meaning;s.records['home-D00'].content=meaning;if(twoSources)s.records.alias={id:'alias',revision:1,kind:'artifact',content:meaning};});
 const m=buildLegacyCoherentPlan(read(f)),partition={plan_sha256:m.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:[],selections:[{id:'all',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
 const plan=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:twoSources?['old','alias']:['old'],semantic_partition:partition,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING});f.plan_id=plan.id;
 const units=unitPages(f);assert.equal(units.length,1,'fixture must use one real canonical batch');
 const e=await run(f,{phase:'extract',unit_id:units[0].id,delivery_protocol:scoped.SCOPED_STREAM},{review:p=>{
  const r=contractReview(p).qualification_result;
  r.items.push(...Array.from({length:30},(_,n)=>({id:'effect-'+n,kind:n%2?'uncertain_effect':'exhausted_allowance',scope:'*',text:'FICTIONAL effect '+n+' remains OPEN.',provenance:p.reviewed_unit_bundle.provenance_sha256,interfaces:[{id:'edge',with_scope:'*',text:meaning}]})));
  const output=envelope(r);assert.ok(bytes(output)<=12000,'complete extraction fits its own cap');return output;
 }});assert.equal(e.job.status,'completed',e.job.error);
 const args={phase:'applicability',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,selection_ids:['all'],extraction_review_ids:[e.review.id],counterpart_ids:['home-D00'],context_scope:'*'};
 return {f,e,args};
}
function compactReview(p){
 const r=contractReview(p).qualification_result;
 if(p.phase==='applicability'){
  // FICTIONAL native semantics: require every opposite qualifier in the home.
  if(!p.homes.some(h=>h.value.content.includes(meaning)))throw Error('fictional missing full conditions');
  const m=r.mappings[0];delete m.item;delete m.occurrence_ids;
  delete m.source_ids;m.source_set=structuredClone(p.mapping_sets.source_set);m.item_set=structuredClone(p.mapping_sets.item_set);m.occurrence_set=structuredClone(p.mapping_sets.occurrence_set);
  m.conditions=meaning;m.unresolved_outcomes='UNKNOWN; FAILED; EXHAUSTED; OPEN; no retry.';m.reason='FICTIONAL every selected cell retains all varied conditions above.';
  r.mappings=[m];r.summary=meaning;
  if(!p.interface_keys.length)r.interfaces=structuredClone(p.interface_set);
 }
 return envelope(r);
}
function validateResult(state,d,result){return scoped.validateScopedResponse(state,state.jobs[d.job.id],scoped.scopedAssignment(state,state.jobs[d.job.id]),d.job.native_id,result,d.job.qualification_delivery);}

test('FICTIONAL compact v3 output fits while complete explicit output exceeds cap; canonical interface/final delivery preserves meaning',async t=>{
 const {f,e,args}=await setup();let explicitBytes;
 const d=await run(f,args,{review:p=>{explicitBytes=bytes(contractReview(p));assert.ok(explicitBytes>12000);return compactReview(p);}});assert.equal(d.job.status,'completed',d.job.error);
 const state=read(f),r=d.review.qualification_result;
 assert.equal(validateResult(state,d,r),true);assert.equal(r.mappings.length,1);assert.equal(r.interfaces.count,31);
 assert.deepEqual(d.packet.item_keys,e.review.qualification_result.items.map(i=>e.review.id+'/'+i.id));
 assert.ok(bytes(d.review.qualification_output)<=12000);assert.ok(bytes(JSON.parse(d.review.qualification_output))<=12000);
 // Old explicit v3 remains valid, using the very same exact result validator.
 const explicit=structuredClone(r);explicit.interfaces=d.packet.extractions.flatMap(e=>e.result.items.map(item=>({key:e.review.id+'/'+item.id,item}))).flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));
 explicit.mappings=r.mappings.flatMap(m=>d.packet.item_keys.map(item=>{const v={...m,item};delete v.item_set;return v;}));
 // Coverage and exact explicit-list interpretation are exercised with a small
 // v3 receipt in the existing phased suite; this deliberately large form holds.
 assert.throws(()=>validateResult(state,d,explicit),/exceeds 12000/);
 const keys=d.packet.extractions.flatMap(e=>e.result.items.flatMap(i=>i.interfaces.map(edge=>e.review.id+'/'+i.id+'/'+edge.id)));
 const ir=await run(f,{...args,domain_review_ids:[d.review.id],interface_keys:keys},{review:compactReview});assert.equal(ir.job.status,'completed',ir.job.error);
 const final=await run(f,{phase:'integration',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00']},{review:compactReview});assert.equal(final.job.status,'completed',final.job.error);
 for(const result of [ir,final]){
  const cat=result.packet.interface_catalog;assert.equal(cat.interfaces.length,31);assert.deepEqual(cat.domains[0].interface_keys,keys);
  assert.deepEqual(cat.domains[0].extraction_reviews,[scoped.scopedReference(e.review)]);
  assert.deepEqual(cat.interfaces,explicit.interfaces);
  assert.ok(cat.interfaces.slice(1).every(i=>i.text===meaning));
  const domains=result.packet.domain_conclusions??result.packet.domains;assert.deepEqual(domains[0].result,r);
  assert.ok(result.packet.homes[0].value.content.includes(meaning));
  assert.ok(result.streamRequests.every(w=>bytes(w)<=48000));
 }
 assert.equal(scoped.validateCorpusPreservation(read(f),{integration_review_id:final.review.id}).protocol,scoped.CORPUS_PRESERVATION);
 assert.equal(final.packet.source_mappings[0].mapping_sha256,sha([{review:scoped.scopedReference(d.review),context_sha256:d.packet.mapping_context_sha256,mappings:r.mappings}]));
 for(const change of [r=>r.source_mappings_sha256='forged',r=>r.source_mappings_count++]){const result=structuredClone(final.review.qualification_result);change(result);assert.throws(()=>validateResult(read(f),final,result),/hold/i);}
 const emptySelector=structuredClone(ir.review.qualification_result);emptySelector.interfaces={count:0,sha256:sha([])};assert.throws(()=>validateResult(read(f),ir,emptySelector),/hold/i);
 // Original delivery authenticity binds the catalog and every membership/value.
 for(const change of [p=>delete p.interface_catalog,p=>p.interface_catalog.interfaces.pop(),p=>p.interface_catalog.domains[0].interface_keys.pop(),p=>p.interface_catalog.interfaces[1].text='ALLOW',p=>p.interface_catalog.domains[0].extraction_reviews=[]]){
  const bad=inheritSnapshots(read(f),structuredClone(read(f))),job=bad.jobs[ir.job.id],delivery=job.qualification_delivery;
  const packet=structuredClone(ir.packet);change(packet);
  const forged=buildScopedStream(scoped.factorCorpusStructure(packet),job.qualification_delivery.plan);
  Object.assign(delivery,forged.manifest,{assignment_sha256:digest(forged.pages[0].wire),ranges:forged.pages.map((page,n)=>({...delivery.ranges[Math.min(n,delivery.ranges.length-1)],...page,wire:undefined}))});
  delivery.ranges=JSON.parse(JSON.stringify(delivery.ranges));
  job.context_sha256=delivery.assignment_sha256;
  // Reseal the attacker-controlled receipt; expected assignment reconstruction
  // still requires the canonical same-packet full catalog and memberships.
  bad.records[ir.review.id].qualification_proof=scoped.scopedProof(delivery,job);
  assert.throws(()=>scoped.validateCorpusPreservation(bad,{integration_review_id:final.review.id}),/hold/i);
 }
 t.diagnostic(JSON.stringify({fictional_only:true,extraction_bytes:bytes(e.review.qualification_output),old_output_bytes:explicitBytes,compact_output_bytes:bytes(d.review.qualification_output),strict_fixture_reduction:explicitBytes-bytes(d.review.qualification_output),actual_native_fit:null,semantic_acceptance:false}));
});

test('v3 selector forgeries, omissions, duplicate cells and incomplete judgments Hold',async()=>{
 const {f,args}=await setup({twoSources:true}),d=await run(f,args,{review:compactReview});assert.equal(d.job.status,'completed',d.job.error);const state=read(f),original=d.review.qualification_result;
 const changes=[
  r=>r.mappings[0].item_set.count++,r=>r.mappings[0].item_set.sha256='wrong',
  r=>r.mappings[0].item_set={basis_sha256:sha(d.packet.item_keys),ranges:[]},
  r=>r.mappings[0].item_set={basis_sha256:'wrong',ranges:[[0,31]]},
  r=>r.mappings[0].item_set={basis_sha256:sha(d.packet.item_keys),ranges:[[0,32]]},
  r=>r.mappings[0].item_set={basis_sha256:sha(d.packet.item_keys),ranges:[[0,20],[19,31]]},
  r=>r.mappings[0].item_set={basis_sha256:sha(d.packet.item_keys),ranges:[[0,30]]},
  r=>r.mappings[0].item='forged',r=>{delete r.mappings[0].item_set;r.mappings[0].item='outside';},
  r=>r.mappings.push(structuredClone(r.mappings[0])),r=>r.mappings=[],
  r=>r.mappings[0].conditions='',r=>r.mappings[0].unresolved_outcomes='',
  r=>r.interfaces.count++,r=>r.interfaces.sha256='wrong',r=>r.interfaces=[],
  r=>r.interfaces={basis_sha256:original.interfaces.sha256,ranges:[[0,30]]},
  r=>r.interfaces={...r.interfaces,values:[]},r=>r.interfaces={},r=>delete r.delivery_schema,
  r=>r.delivery_schema=scoped.CORPUS_FIT_DELIVERY,
  r=>r.mappings[0].source_set={count:0,sha256:sha([])},
  r=>r.mappings[0].occurrence_set={basis_sha256:sha(d.packet.mapping_occurrence_ids),ranges:[]}
 ];
 for(const change of changes){const r=structuredClone(original);change(r);assert.throws(()=>validateResult(state,d,r),/hold/i);}
 const unrelated=d.packet.occurrence_context.occurrences.find(o=>o.path==='/records/alias');assert.ok(unrelated);
 const emptyIntersection=structuredClone(original);emptyIntersection.mappings[0].source_set={basis_sha256:sha(d.packet.corpus_claim.selected_source_ids),ranges:[[0,1]]};emptyIntersection.mappings[0].occurrence_set={basis_sha256:sha(d.packet.mapping_occurrence_ids),ranges:[[d.packet.mapping_occurrence_ids.indexOf(unrelated.id),d.packet.mapping_occurrence_ids.indexOf(unrelated.id)+1]]};
 assert.throws(()=>validateResult(state,d,emptyIntersection),/empty corpus incidence intersection/i);
 const ranged=structuredClone(original);ranged.mappings[0].item_set={basis_sha256:sha(d.packet.item_keys),ranges:[[0,10],[10,31]]};assert.equal(validateResult(state,d,ranged),true);
 const split=structuredClone(original);split.mappings=[0,1].map(n=>({...original.mappings[0],item_set:{basis_sha256:sha(d.packet.item_keys),ranges:n?[[10,31]]:[[0,10]]}}));assert.equal(validateResult(state,d,split),true);
});


test('FICTIONAL native missing varied conditions blocks, with complete unknown/exhausted semantics retained',async()=>{
 const {f,args}=await setup();
 const d=await run(f,args,{review:p=>{
  const r=compactReview(p).qualification_result;
  r.mappings[0].conditions='ALLOW only after consent';
  // Scripted semantic judgment, not software equivalence or actual native QA.
  if(!r.mappings[0].conditions.includes('DENY even with consent')){
   r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL opposite condition omitted; no retry; UNKNOWN; EXHAUSTED';r.blockers=[r.reason];
  }
  return envelope(r);
 }});
 assert.equal(d.job.status,'completed',d.job.error);assert.equal(d.review.review.verdict,'Blocked');
 assert.ok(d.review.qualification_result.mappings[0].unresolved_outcomes.includes('EXHAUSTED'));
 const state=read(f);assert.throws(()=>scoped.validateCorpusPreservation(state,{integration_review_id:d.review.id}),/hold/i);
});
