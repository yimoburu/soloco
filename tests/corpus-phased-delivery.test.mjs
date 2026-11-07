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
async function semanticFixture({peers=0,inbound=false}={}){
  const {buildLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');
  const f=fixture({domains:3});
  mutate(f,s=>{delete s.records[f.plan_id];
    s.records.old={id:'old',revision:1,kind:'artifact',content:'GLOBAL: no execution; exact v0.18 gate remains.',historical_global:'HISTORICAL_GLOBAL_EXHAUSTED; prior attempt FAILED; outcome UNKNOWN; renewal required; no retry until reconciliation; distant effects remain OPEN.',locals:[
      {id:'local-a',ancestor:'ALLOW only after consent',body:{id:'shared',content:'SAME_BODY remains OPEN'}},
      {id:'local-b',ancestor:'DENY even with consent',body:{id:'shared',content:'SAME_BODY remains OPEN'}}]};
    s.records.archive={id:'archive',revision:1,kind:'artifact',content:'UNRELATED_ARCHIVE '+('archive evidence '.repeat(250))};
    s.records.late={id:'late',revision:1,kind:'decision',unknown_qualifier:'LATE_NO_EXPORT global prohibition; UNKNOWN; FAILED; allowance EXHAUSTED'};
    for(let n=0;n<peers;n++)s.records['peer-'+n]={id:'peer-'+n,revision:1,kind:'artifact',content:'DISTANT_RAW_SENTINEL_'+n+' '+('disjoint leaf '.repeat(900))};
    if(inbound){const original=retainSnapshot(s,{id:'inbound-original',content:'INBOUND_ORIGINAL_OPEN'});s.records.old.locals[0].original=original;delete s.records.old.locals[0].body;delete s.records.old.locals[1].body;s.records.bridge={id:'bridge',revision:1,kind:'artifact',condition:'INBOUND_DENY_UNTIL_NEW_CONSENT',original};}
    for(const h of ['home-D00','home-D01','home-D02'])s.records[h].content='GLOBAL: no execution; LATE_NO_EXPORT; SAME_BODY remains OPEN; ALLOW only after consent; DENY even with consent; archive retained.';
  });
  const material=buildLegacyCoherentPlan(read(f));
  const selections=['global','A','B','archive',...Array.from({length:peers},(_,n)=>'peer-'+n)].map(id=>({id,scope:id==='global'?'*':id,occurrence_ids:[],incident_ids:[]}));
  for(const o of material.occurrences){const peer=selections.find(q=>q.id.startsWith('peer-')&&o.path.startsWith('/records/'+q.id));const key=o.document.kind==='snapshot-original'?'A':peer?peer.id:o.path.startsWith('/records/bridge')?'B':o.path.startsWith('/records/old/locals/0')||o.path.startsWith('/records/home-D00')?'A':o.path.startsWith('/records/old/locals/1')||o.path.startsWith('/records/home-D01')?'B':o.path.startsWith('/records/archive')||o.path.startsWith('/records/home-D02')?'archive':'global';selections.find(q=>q.id===key).occurrence_ids.push(o.id);}
  for(const q of selections)q.scope='*';
  const partition={plan_sha256:material.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:['global'],selections};
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old'],semantic_partition:partition,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING});f.plan_id=p.id;
  return {f,partition,material};
}

async function extracts(f){const out=[];for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM},{review:p=>{const e=contractReview(p);if(JSON.stringify(p.reviewed_unit_bundle).includes('HISTORICAL_GLOBAL_EXHAUSTED'))e.qualification_result.items[0].text+=' FICTIONAL complete historical condition: HISTORICAL_GLOBAL_EXHAUSTED; prior attempt FAILED; outcome UNKNOWN; renewal required; no retry until reconciliation; distant effects remain OPEN.';return e;}});assert.equal(e.job.status,'completed',e.job.error);out.push(e);}return out;}
const fit=scoped.CORPUS_PHASED_DELIVERY;
function fitReview(p){const e=contractReview(p),r=e.qualification_result;r.reason='FICTIONAL complete judgment.';if(p.phase==='applicability')for(const m of r.mappings){m.occurrence_set=structuredClone(p.mapping_sets.occurrence_set);delete m.occurrence_ids;m.reason='FICTIONAL retained.';m.conditions='Consent required; opposite DENY retained.';m.unresolved_outcomes='UNKNOWN; FAILED; EXHAUSTED; OPEN.';}return envelope(r);}


test('FICTIONAL v3 complete chain bounds physical unknown context and reconciles ALL complete conclusions',async t=>{
 const {f,partition,material}=await semanticFixture({peers:3,inbound:true}),es=await extracts(f),workload=scoped.inspectCorpusWorkload(read(f),{plan_id:f.plan_id}),ds=[],irs=[],args=[];
 assert.ok(partition.selections.every(q=>q.scope==='*'));
 assert.deepEqual(new Set(partition.selections.flatMap(q=>q.occurrence_ids)),new Set(material.occurrences.map(o=>o.id)));
 for(const q of workload.selections){
  const a={phase:'applicability',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,selection_ids:[q.id],extraction_review_ids:es.filter(e=>q.intrinsic_batches.includes(e.target.target.unit_id)).map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*'};args.push(a);
  const d=await run(f,a,{review:fitReview});assert.equal(d.job.status,'completed',d.job.error);ds.push(d);
  assert.equal(d.packet.response_shape.interaction_completeness.assessment_scope,'selected-context');
  assert.equal(d.packet.response_shape.interaction_completeness.global_complete,undefined);
  assert.equal(d.packet.delivery_projection.schema,fit);
  assert.deepEqual(d.packet.global_occurrence_context.selection_ids,['global']);
  assert.ok(d.packet.global_occurrence_context.occurrences.length<material.occurrences.length);
  assert.deepEqual(d.packet.occurrence_context.selected_occurrence_ids,partition.selections.find(v=>v.id===q.id).occurrence_ids);
  for(const e of d.packet.extractions)assert.deepEqual(e.result,es.find(x=>x.review.id===e.review.id).review.qualification_result);
  const state=read(f),v=state.records[f.plan_id].scoped_context_plan,c=resolveSnapshot(state,v.capsule),m=resolveSnapshot(state,c.projection);
  const claim={...d.packet.corpus_claim,incidence:scoped.inspectCorpusIncidence(state,{plan_id:f.plan_id})};delete claim.canonical_claim_sha256;
  const descriptor={delivery_schema:fit,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,semantic_partition:partition,phase:'applicability',selection_ids:[q.id]};
  assert.equal(scoped.validateCorpusProofDelivery(d.packet.corpus_claim,m,claim,descriptor),true);
  for(const edit of [d=>d.selection_ids=['missing'],d=>d.batching_policy='unknown',d=>d.semantic_partition.shared_selection_ids.push('missing'),d=>d.phase='unknown']){const bad=structuredClone(descriptor);edit(bad);assert.throws(()=>scoped.projectCorpusProofDelivery(m,claim,bad),/hold/i);}
 }
 for(const [n,a] of args.entries()){
  const ir=await run(f,{...a,domain_review_ids:ds.map(d=>d.review.id),interface_keys:ds[n].review.qualification_result.interfaces.map(i=>i.key)},{review:fitReview});assert.equal(ir.job.status,'completed',ir.job.error);irs.push(ir);
  assert.equal(ir.packet.response_shape.interaction_completeness.global_complete,true);
  assert.equal(ir.packet.domain_conclusions.length,ds.length);
  for(const d of ds)assert.deepEqual(ir.packet.domain_conclusions.find(c=>c.review.id===d.review.id).result,d.review.qualification_result);
  assert.ok(JSON.stringify(ir.packet.domain_conclusions).includes('HISTORICAL_GLOBAL_EXHAUSTED'));
 }
 const final=await run(f,{phase:'integration',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:ds.map(d=>d.review.id),interface_review_ids:irs.map(i=>i.review.id),counterpart_ids:['home-D00']},{review:fitReview});assert.equal(final.job.status,'completed',final.job.error);
 for(const [key,results] of [['domains',ds],['interface_reviews',irs]])for(const d of results)assert.deepEqual(final.packet[key].find(c=>c.review.id===d.review.id).result,d.review.qualification_result);
 const state=read(f);assert.equal(scoped.validateCorpusPreservation(state,{integration_review_id:final.review.id}).protocol,scoped.CORPUS_PRESERVATION);
 for(const edit of [s=>s.jobs[es[0].job.id].native_id='substituted',s=>s.jobs[irs[0].job.id].native_id=ds[0].job.native_id,s=>s.jobs[es[0].job.id].coordination_release.termination_confirmed=false,s=>s.jobs[irs[0].job.id].qualification_delivery.complete=false,s=>s.jobs[ds[0].job.id].rejected_output={text:'negative'},s=>s.records.late.unknown_qualifier='changed',s=>s.records['home-D00'].content+='changed',s=>s.jobs[ds[0].job.id].execution_deadline_at=s.jobs[ds[0].job.id].execution_started_at,s=>s.records[ds[0].target.id].scoped_context_target.delivery_schema=scoped.CORPUS_FIT_DELIVERY,s=>s.records[ds[0].review.id].qualification_result.summary='condition omitted',s=>s.records[final.target.id].scoped_context_target.domain_review_ids.pop(),s=>s.records[f.plan_id].scoped_context_plan.batching_policy='unknown']){const bad=inheritSnapshots(state,structuredClone(state));edit(bad);assert.throws(()=>scoped.validateCorpusPreservation(bad,{integration_review_id:final.review.id}),/hold|changed/i);}
 await assert.rejects(run(f,{...args[0],domain_review_ids:ds.slice(1).map(d=>d.review.id),interface_keys:ds[0].review.qualification_result.interfaces.map(i=>i.key)},{review:fitReview}),/interface complete domain conclusions/);
 const wrong=await run(f,args[0],{review:p=>{const e=fitReview(p);e.qualification_result.interaction_completeness={census_sha256:p.response_shape.interaction_completeness.census_sha256,declared_complete:true,undeclared_complete:true,global_complete:true,reason:'unsupported unseen vector'};return e;}});assert.equal(wrong.job.status,'failed');
 const blocked=await run(f,args[1],{review:p=>{const r=fitReview(p).qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL missing peer condition; explicit raw widening required';r.blockers=[r.reason];return envelope(r);}});assert.equal(blocked.review.review.verdict,'Blocked');
 const wider=await run(f,{...args[1],raw_review_ids:[args[1].extraction_review_ids[0]]},{review:fitReview});assert.equal(wider.job.status,'completed',wider.job.error);assert.notEqual(wider.target.id,blocked.target.id);assert.equal(wider.packet.raw_extractions.length,1);assert.deepEqual(wider.packet.raw_extractions[0].reviewed_unit_bundle,es.find(e=>e.review.id===args[1].extraction_review_ids[0]).review.reviewed_unit_bundle);
 assert.throws(()=>scoped.validateCorpusPreservation(read(f),{integration_review_id:final.review.id}),/negative|governing/i);
 t.diagnostic(JSON.stringify({fictional_only:true,selections:ds.length,shared_physical:final.packet.global_occurrence_context.occurrences.length,all_physical:material.occurrences.length,actual_native_fit:null,semantic_acceptance:false}));
});

test('public prospective options are closed, fresh-only and cannot reinterpret existing plans',async()=>{
 const {f,partition}=await semanticFixture(),common={root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction};
 for(const action of ['inspect','read','target','apply','revoke'])for(const option of [{batching_policy:scoped.CORPUS_INTRINSIC_BATCHING},{semantic_partition:partition}])await assert.rejects(publicCall('company_context',{...common,action,...option},'codex'),/explicit scoped corpus plan/);
 for(const option of [{batching_policy:'unknown'},{batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,partitioner:scoped.COHERENT_PARTITIONER}])await assert.rejects(publicCall('company_context',{...common,action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old'],...option},'codex'),/policy|corpus plan/);
 const state=read(f),v=state.records[f.plan_id].scoped_context_plan;
 const reused=scoped.captureScopedPlan(state,{partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',corpus_plan_id:f.plan_id});assert.equal(reused.extraction_identity,v.extraction_identity);assert.equal(reused.batching_policy,scoped.CORPUS_INTRINSIC_BATCHING);
 assert.throws(()=>scoped.captureScopedPlan(state,{partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',corpus_plan_id:f.plan_id,batching_policy:'other'}),/policy/);
 const es=await extracts(f),q=scoped.inspectCorpusWorkload(read(f),{plan_id:f.plan_id}).selections[0],a={action:'target',plan_id:f.plan_id,phase:'applicability',selection_ids:[q.id],extraction_review_ids:es.filter(e=>q.intrinsic_batches.includes(e.target.target.unit_id)).map(e=>e.review.id),counterpart_ids:['home-D00']};
 for(const marker of [undefined,scoped.CORPUS_DELIVERY,scoped.CORPUS_FIT_DELIVERY,'unknown'])await assert.rejects(publicCall('company_context',{...common,...a,...(marker?{delivery_schema:marker}:{})},'codex'),/phased delivery|schema/);
 for(const edit of [p=>p.context_policy='unknown',p=>p.shared_selection_ids.push('missing'),p=>p.shared_selection_ids.push('global'),p=>p.selections[0].occurrence_ids.pop(),p=>p.extra=true]){const p=structuredClone(partition);edit(p);const c=resolveSnapshot(state,v.capsule);assert.throws(()=>scoped.validateCorpusPartition(resolveSnapshot(state,c.projection),p),/hold/i);}
});

import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
function physicalPartition(m,cap=1000){
 const selections=[];
 for(let start=0;start<m.occurrences.length;start+=cap)selections.push({id:'physical-'+selections.length,scope:'*',occurrence_ids:m.occurrences.slice(start,start+cap).map(o=>o.id),incident_ids:[]});
 return {plan_sha256:m.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:[],selections};
}
test('73 deterministic intrinsic batches are independent of 1000-occurrence physical chunks',()=>{
 const s={id:'FICTIONAL',owner:{session_id:'fictional-owner',epoch:1},records:{},jobs:{}};
 for(let n=0;n<73;n++){
  s.records['large-'+n]={id:'large-'+n,revision:1,content:'x'.repeat(94000)};
  for(let k=0;k<15;k++)s.records['small-'+n+'-'+k]={id:'small-'+n+'-'+k,revision:1,content:'OPEN; UNKNOWN; no permission.'};
 }
 const m=buildLegacyCoherentPlan(s),p=physicalPartition(m),all={...p,selections:[{id:'all',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
 const common={source_id:'large-0',selected_source_ids:['large-0'],partitioner:scoped.CORPUS_PARTITIONER,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING};
 const a=scoped.captureScopedPlan(s,{...common,semantic_partition:p}),b=scoped.captureScopedPlan(s,{...common,semantic_partition:all});
 assert.equal(a.units.length,73);assert.deepEqual(a.units,b.units);assert.notEqual(a.extraction_identity,b.extraction_identity);
 assert.ok(p.selections.length>1);assert.ok(p.selections.every(q=>q.occurrence_ids.length<=1000));
 const oldA=scoped.captureScopedPlan(s,{...common,batching_policy:undefined,semantic_partition:p}),oldB=scoped.captureScopedPlan(s,{...common,batching_policy:undefined,semantic_partition:all});assert.ok(oldA.units.length>oldB.units.length);
 const groups=resolveSnapshot(s,resolveSnapshot(s,a.capsule).projection).groups.map(g=>g.id);assert.deepEqual(a.units.flatMap(u=>u.group_ids),groups);
});

test('exact context routes respect root cuts and preserve selected, stale, unknown and both incoming qualifiers',()=>{
 const s={id:'FICTIONAL',owner:{session_id:'owner',epoch:1},records:{},jobs:{}};
 const original=retainSnapshot(s,{id:'original',revision:1,condition:'UNKNOWN cause material; no retry',next:{id:'a',revision:1}});
 s.records.a={id:'a',revision:1,condition:'ALLOW only after consent',original,next:{id:'b',revision:1},stale:{id:'b',revision:99},unknown:{id:'missing',revision:1}};
 s.records.b={id:'b',revision:1,condition:'DENY even with consent; EXHAUSTED; renewal required',original};
 s.records.distant={id:'distant',revision:1,next:{id:'missing-distant',revision:1}};
 const m=buildLegacyCoherentPlan(s),p={plan_sha256:m.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:['root'],selections:['root','local','distant'].map(id=>({id,scope:'*',occurrence_ids:[],incident_ids:[]}))};
 for(const o of m.occurrences)p.selections.find(q=>q.id===(o.path.startsWith('/records/distant')?'distant':o.document.kind==='snapshot-original'||o.path.startsWith('/records/a')||o.path.startsWith('/records/b')?'local':'root')).occurrence_ids.push(o.id);
 const v=scoped.captureScopedPlan(s,{source_id:'a',selected_source_ids:['a'],partitioner:scoped.CORPUS_PARTITIONER,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,semantic_partition:p});s.records.plan={id:'plan',revision:1,scoped_context_plan:v};
 const c=resolveSnapshot(s,v.capsule),claim={selected_source_ids:['a'],sources:m.sources.filter(r=>r.source.id==='a'),source_census:m.sources,producer_closures:c.producer_closures,incidence:scoped.inspectCorpusIncidence(s,{plan_id:'plan'})};
 const d={delivery_schema:fit,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,semantic_partition:p,phase:'applicability',selection_ids:['local']},projected=scoped.projectCorpusProofDelivery(m,claim,d),routes=projected.incidence.direct_references;
 assert.ok(routes.some(e=>e.path==='/records/a/next'&&e.target_source.id==='b'));
 assert.ok(routes.some(e=>e.path==='/records/a/stale'&&e.unknown));assert.ok(routes.some(e=>e.path==='/records/a/unknown'&&e.unknown));assert.ok(routes.some(e=>e.document.kind==='snapshot-original'&&e.path==='/next'));
 assert.ok(!routes.some(e=>e.path==='/records/distant/next'),'root cut does not broadcast distant routes');
 assert.ok(scoped.projectCorpusProofDelivery(m,claim).incidence.direct_references.some(e=>e.path==='/records/distant/next'),'old full route projection unchanged');
 assert.ok(m.snapshot_inbound.some(e=>e.path==='/records/a/original'));assert.ok(m.snapshot_inbound.some(e=>e.path==='/records/b/original'));
 assert.equal(scoped.validateCorpusProofDelivery(projected,m,claim,d),true);
 for(const edit of [p=>p.incidence.direct_references.pop(),p=>p.incidence.direct_references[0].reference.revision++,p=>p.incidence.context_binding_sha256='wrong']){const bad=structuredClone(projected);edit(bad);assert.throws(()=>scoped.validateCorpusProofDelivery(bad,m,claim,d),/omission or substitution/);}
});

test('public complete-group retrieval preserves frozen sections, STRING evidence and prospective routing',async()=>{
 const {f}=await semanticFixture({inbound:true}),state=read(f),v=state.records[f.plan_id].scoped_context_plan,u=v.units.find(u=>u.group_ids.length>2),before=structuredClone(v);
 const common={root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction};
 const unit_id=u.id+'/g0-2',child=await publicCall('company_context',{...common,action:'read',plan_id:f.plan_id,unit_id},'codex');
 const whole=call(f,{action:'read',plan_id:f.plan_id,unit_id:u.id});assert.deepEqual(child.unit.sections,whole.unit.sections.slice(0,2));assert.equal(child.unit.id,unit_id);
 const work=await publicCall('company_context',{...common,action:'inspect',plan_id:f.plan_id,section:'workload',unit_id},'codex');assert.equal(work.original_intrinsic_batch_count,v.units.length);assert.deepEqual(work.selected_review_unit_ids,[unit_id]);assert.equal(work.complete_native_fit,null);
 for(const bad of [u.id+'/g00-2',u.id+'/g0-0',u.id+'/g0-'+u.group_ids.length,u.id+'/g0-2/g0-1','STRING '+unit_id,'body-batch-999/g0-1'])await assert.rejects(publicCall('company_context',{...common,action:'read',plan_id:f.plan_id,unit_id:bad},'codex'),/group|selection/);
 for(const action of ['inspect','read','plan','apply','revoke'])await assert.rejects(publicCall('company_context',{...common,action,unit_selection_schema:scoped.COMPLETE_GROUP_RANGES},'codex'),/new scoped target/);
 await assert.rejects(publicCall('company_context',{...common,action:'target',plan_id:f.plan_id,phase:'extract',unit_id},'codex'),/marker/);
 await assert.rejects(publicCall('company_context',{...common,action:'target',plan_id:f.plan_id,phase:'extract',unit_id,unit_selection_schema:'unknown'},'codex'),/contract|schema/);
 assert.deepEqual(read(f).records[f.plan_id].scoped_context_plan,before);
});
