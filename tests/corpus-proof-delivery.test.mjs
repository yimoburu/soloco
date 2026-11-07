import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
import {retainSnapshot,resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {digest} from '../plugins/soloco/runtime/store.mjs';
const json=JSON.stringify,sha=v=>digest(json(v)),bytes=v=>Buffer.byteLength(json(v));
function captured(n=3){
  const s={id:'fictional',owner:{session_id:'fictional-owner',epoch:1},records:{},jobs:{}};
  for(let i=0;i<n;i++)s.records['s'+i]={id:'s'+i,revision:1,qualifier:i%2?'DENY even with consent; EXHAUSTED; UNKNOWN; FAILED':'ALLOW only after consent',body:{id:'shared-body',text:'SAME BODY remains OPEN'},next:{id:'s'+((i+1)%n),revision:1}};
  s.records.s0.stale={id:'s1',revision:99};
  s.records.s0.quoted=JSON.stringify({shared_typed_definition:{id:'s1',revision:1},example:{id:'missing-string-example',revision:1},nested:JSON.stringify({id:'also-string',revision:1})});
  const original=retainSnapshot(s,{id:'original',revision:4,condition:'NO RETRY until reconciliation',link:{id:'s1',revision:1}});
  s.records.s0.original=original;s.records.s1.original=original;
  s.records.outside={id:'outside',revision:1,unowned:{id:'missing-unowned',revision:1}};
  const plan=scoped.captureScopedPlan(s,{source_id:'s0',selected_source_ids:Array.from({length:n},(_,i)=>'s'+i),partitioner:scoped.CORPUS_PARTITIONER});
  s.records['fixture-plan']={id:'fixture-plan',revision:1,scoped_context_plan:plan};
  const c=resolveSnapshot(s,plan.capsule),m=resolveSnapshot(s,c.projection);
  const claim={protocol:scoped.CORPUS_PRESERVATION,selected_source_ids:c.selected_sources,sources:c.selected_sources.map(id=>m.sources.find(r=>r.source.id===id)),incidence:scoped.inspectCorpusIncidence(s,{plan_id:'fixture-plan'}),baseline:m.baseline,source_census:m.sources,producer_closures:c.producer_closures,census_sha256:sha({occurrences:m.occurrences,inbound:m.snapshot_inbound,collections:m.collection_indexes,sections:m.groups,documents:m.documents}),extraction_identity:plan.extraction_identity};
  return {s,plan,c,m,claim};
}
test('proof projection removes repeated computed closure, retaining complete distinct DIRECT and unknown routes',t=>{
  const {m,claim}=captured(40),before=json(claim),p=scoped.projectCorpusProofDelivery(m,claim);
  assert.equal(json(claim),before,'canonical claim bytes unchanged');
  assert.equal(p.canonical_claim_sha256,sha(claim));assert.equal(p.incidence.canonical_relation.sha256,sha(claim.incidence));
  assert.deepEqual(p.source_census,claim.source_census);assert.deepEqual(p.producer_closures,claim.producer_closures);
  assert.deepEqual(p.incidence.unowned_occurrence_ids,claim.incidence.unowned_occurrence_ids);
  assert.equal(p.incidence.sources.length,40);
  for(const s of p.incidence.sources){assert.equal(s.references,undefined);assert.equal(s.regions,undefined);assert.equal(s.seed_regions.length,1);assert.equal(s.conservative,true);}
  const direct=p.incidence.direct_references;
  assert.equal(new Set(direct.map(json)).size,direct.length);
  assert.ok(direct.some(e=>e.path==='/records/s0/next'&&e.target_source.id==='s1'&&e.target_source.revision===1&&e.target_source.sha256===claim.source_census.find(r=>r.source.id==='s1').source.sha256));
  assert.ok(direct.some(e=>e.path==='/records/s0/stale'&&e.reference.revision===99&&e.unknown===true&&!e.target));
  assert.ok(direct.some(e=>e.path==='/records/outside/unowned'&&e.unknown===true),'unowned direct evidence is explicit');
  assert.ok(direct.some(e=>e.document.kind==='snapshot-original'&&e.path==='/link'));
  assert.ok(direct.every(e=>!e.path.includes('@json-text')&&!e.path.includes('/quoted')&&!json(e.reference).includes('string-example')));
  const physical=claim.incidence.sources.flatMap(s=>s.references.filter(e=>e.kind==='source-reference'));
  for(const edge of physical)assert.ok(direct.some(({target_source,...e})=>json(e)===json(edge)));
  assert.ok(bytes(p)<bytes(claim)/4);
  assert.equal(scoped.validateCorpusProofDelivery(p,m,claim),true);
  t.diagnostic(json({synthetic_only:true,sources:40,full_claim_bytes:bytes(claim),projected_claim_bytes:bytes(p),full_edge_copies:physical.length,direct_edges:direct.length,full_factored_bytes:bytes(scoped.factorCorpusStructure(claim)),projected_factored_bytes:bytes(scoped.factorCorpusStructure(p)),actual_native_fit:null}));
});
test('deterministic external revalidation rejects route, endpoint, flag, seed and unowned omissions even after resealing',()=>{
  const {m,claim}=captured(),p=scoped.projectCorpusProofDelivery(m,claim);
  for(const edit of [p=>p.incidence.direct_references.pop(),p=>p.incidence.direct_references[0].reference.revision++,p=>{p.incidence.direct_references.find(e=>e.target_source).target_source.sha256='f'.repeat(64);},p=>{p.incidence.sources[0].conservative=false;},p=>p.incidence.sources.pop(),p=>{p.incidence.sources[0].seed_regions[0].path='/records/outside';},p=>p.incidence.unowned_occurrence_ids.pop(),p=>{delete p.producer_closures.s0;}]){
    const bad=structuredClone(p);edit(bad);
    // Generic transport can be resealed, but cannot pass against the exact expected packet.
    const sealed=scoped.factorCorpusStructure(bad);assert.deepEqual(scoped.expandCorpusStructure(sealed),bad);
    assert.throws(()=>scoped.validateCorpusProofDelivery(bad,m,claim),/omission or substitution/);
    assert.throws(()=>scoped.validateCorpusStructure(sealed,p),/omission or substitution/);
  }
  const bad=structuredClone(claim);bad.incidence.sources[0].conservative=false;
  assert.throws(()=>scoped.projectCorpusProofDelivery(m,bad),/canonical proof delivery input changed/);
  const forged=structuredClone(m);forged.occurrences.pop();
  assert.throws(()=>scoped.projectCorpusProofDelivery(forged,claim),/identity|coverage/);
});
test('opposite physical qualifiers, immutable originals and producer associations survive projection',()=>{
  const {s}=captured();
  s.jobs.producer={id:'producer',instance_id:'historical-producer',artifact_id:'s0'};
  s.records.s0.job_id='producer';s.records.s0.author_instance='historical-producer';
  const p=scoped.captureScopedPlan(s,{source_id:'s0',selected_source_ids:['s0','s1'],partitioner:scoped.CORPUS_PARTITIONER});
  s.records['second-fixture-plan']={id:'second-fixture-plan',revision:1,scoped_context_plan:p};
  const c=resolveSnapshot(s,p.capsule),m=resolveSnapshot(s,c.projection);
  const claim={selected_source_ids:c.selected_sources,sources:c.selected_sources.map(id=>m.sources.find(r=>r.source.id===id)),source_census:m.sources,producer_closures:c.producer_closures,incidence:scoped.inspectCorpusIncidence(s,{plan_id:'second-fixture-plan'})};
  const delivered=scoped.projectCorpusProofDelivery(m,claim);
  assert.equal(delivered.producer_closures.s0[0].id,'job:producer');
  assert.equal(delivered.incidence.sources[0].seed_regions[1].path,'/jobs/producer');
  assert.ok(m.snapshot_inbound.length>=2);assert.notEqual(m.snapshot_inbound[0].path,m.snapshot_inbound[1].path);
  const a=m.occurrences.find(o=>o.path==='/records/s0/body'),b=m.occurrences.find(o=>o.path==='/records/s1/body');
  assert.ok(a&&b);assert.equal(a.group_id,b.group_id);assert.notDeepEqual(a.qualifier_groups,b.qualifier_groups);
  assert.equal(scoped.validateCorpusProofDelivery(delivered,m,claim),true);
});

// FICTIONAL public worker adapter: validates delivery mechanics, never native QA.
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {withStore,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {buildScopedStream} from '../plugins/soloco/runtime/scoped-stream.mjs';
test('FICTIONAL worker chain binds projected routes to full proof and rejects a resealed native packet',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-proof-projection-'));
  const priorCache=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(root,'cache');
  try{
    const f={root,session_id:id('owner'),epoch:1,source_instruction:'FICTIONAL authorized source-only test.'};
    engine.bind(root,f.session_id,'codex');engine.open({...f,idea:'FICTIONAL source test'},'codex');withStore(root,db=>db.migrate());
    const mutate=fn=>withStore(root,db=>db.transaction('proof.fixture',s=>{fn(s);return s;})),read=()=>withStore(root,db=>db.read());
    mutate(s=>{s.roles={qa:{name:'Independent QA'},engineer:{name:'Engineer'}};s.governance='No execution; failures retained.';s.records.old={id:'old',revision:1,kind:'artifact',qualifier:'ALLOW after consent',body:{id:'same',content:'OPEN; UNKNOWN; FAILED; EXHAUSTED'},next:{id:'alias',revision:1}};s.records.alias={id:'alias',revision:1,kind:'artifact',qualifier:'DENY even with consent',body:{id:'same',content:'OPEN; UNKNOWN; FAILED; EXHAUSTED'},stale:{id:'old',revision:9}};const original=retainSnapshot(s,{id:'original',revision:1,condition:'Unknown effects require reconciliation',link:{id:'old',revision:1}});s.records.old.original=original;s.records.alias.original=original;s.team_sha256=teamHash(s);});
    engine.save({...f,id:'home',kind:'artifact',content:'FICTIONAL complete conditions: ALLOW after consent; DENY even with consent; OPEN UNKNOWN FAILED EXHAUSTED; no execution.'},'codex');
    const control=args=>engine.contextControl({...f,...args},'codex');
    const plan=control({action:'plan',protocol:scoped.SCOPED_PROTOCOL,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old','alias']});
    const v=read().records[plan.id].scoped_context_plan,c=resolveSnapshot(read(),v.capsule),material=resolveSnapshot(read(),c.projection),canonicalBytes=json(c.incidence);
    async function run(args){
      const target=control({action:'target',plan_id:plan.id,delivery_protocol:scoped.SCOPED_STREAM,...args});
      const job=engine.dispatch({...f,role:'qa',review_of:target.id,task:'FICTIONAL mechanical review'},'codex',{check:()=>({available:true,authenticated:true,version:'fictional'}),launch:()=>({on(){},unref(){}})});
      const parts=[];let logical;
      await work(root,job.id,async(host,session,prompt,dir,timeout,selection,options)=>{
        const now=Date.now();
        options.onSpawn(executionTiming(now,{timeout_ms:Math.min(timeout,options.executionDeadlineAt?options.executionDeadlineAt-now:timeout),timeout_reason:options.timeoutReason}));
        let p=JSON.parse(prompt),native_id='fictional-native-'+job.id;
        if(p.protocol===scoped.SCOPED_STREAM){parts.push(p.text);if(!p.final)return {native_id,text:json({scoped_stream_ack:{body_sha256:p.body_sha256,sequence:p.sequence,range_sha256:p.range_sha256}})};p=JSON.parse(parts.join(''));}
        if(p.protocol==='corpus-readable-structure-v1')p=scoped.expandCorpusStructure(p);logical=p;
        const r={...p.response_shape,verdict:'Pass',reason:'FICTIONAL mechanical adapter only.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',blockers:[]};
        if(p.phase==='extract'){const b=p.reviewed_unit_bundle;r.items=[{id:'coherent-occurrence',kind:'boundary',text:'FICTIONAL: ALLOW after consent; DENY even with consent; OPEN UNKNOWN FAILED EXHAUSTED; no execution; reconcile unknown effects.',scope:'*',provenance:b.provenance_sha256,interfaces:[b.primary.required_interface]}];}
        else if(p.phase==='applicability'){r.summary='FICTIONAL complete interaction conditions remain OPEN.';r.mappings=p.item_keys.map(item=>({item,status:'represented',source_set:p.mapping_sets.source_set,occurrence_set:p.mapping_sets.occurrence_set,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'FICTIONAL: ALLOW after consent; DENY even with consent; no execution.',unresolved_outcomes:'OPEN UNKNOWN FAILED EXHAUSTED',homes:['home'],reason:'FICTIONAL complete physical distinctions.'}));r.interfaces=p.interface_keys.length?[]:p.extractions.flatMap(e=>e.result.items.flatMap(item=>item.interfaces.map(i=>({key:e.review.id+'/'+item.id+'/'+i.id,item:e.review.id+'/'+item.id,scope:item.scope,...i}))));r.reviewed_interfaces=p.interface_keys;}
        else {r.summary='FICTIONAL integration preserves unknowns and holds execution.';r.unreviewed_interfaces=[];}
        return {native_id,text:json({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r})};
      });
      const state=read(),j=state.jobs[job.id];assert.equal(j.status,'completed',j.error);return {packet:logical,job:j,review:state.records[j.artifact_id]};
    }
    const extracts=[];for(const u of v.units)extracts.push(await run({phase:'extract',unit_id:u.id}));
    const common={phase:'applicability',delivery_schema:scoped.CORPUS_FIT_DELIVERY,extraction_review_ids:extracts.map(e=>e.review.id),counterpart_ids:['home'],context_scope:'*'};
    const d=await run(common),ir=await run({...common,domain_review_ids:[d.review.id],interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)});
    const final=await run({phase:'integration',delivery_schema:scoped.CORPUS_FIT_DELIVERY,domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home']});
    for(const a of [d,ir,final]){
      assert.deepEqual(a.packet.global_occurrence_context.snapshot_inbound,material.snapshot_inbound);
      assert.deepEqual(a.packet.corpus_claim.producer_closures,c.producer_closures);
      assert.equal(a.packet.corpus_claim.incidence.sources[0].references,undefined);
      assert.ok(a.packet.corpus_claim.incidence.direct_references.some(e=>e.path==='/records/alias/stale'&&e.unknown));
      assert.equal(a.packet.response_shape.corpus_claim_sha256,a.packet.corpus_claim.canonical_claim_sha256);
      if(a.packet.complete_corpus_context)assert.deepEqual(a.packet.complete_corpus_context.claim,a.packet.corpus_claim);
    }
    const state=read();assert.equal(json(resolveSnapshot(state,v.capsule).incidence),canonicalBytes);
    assert.equal(scoped.validateCorpusPreservation(state,{integration_review_id:final.review.id}).protocol,scoped.CORPUS_PRESERVATION);
    for(const edit of [p=>p.corpus_claim.incidence.direct_references.pop(),p=>{p.corpus_claim.incidence.sources[0].conservative=false;}]){
      const a=scoped.scopedAssignment(state,state.jobs[d.job.id]),bad=structuredClone(d.packet);edit(bad);
      const stream=buildScopedStream(scoped.factorCorpusStructure(bad),state.records[d.job.review_of.id].scoped_context_target.plan);
      const forged={...a,packet:bad,stream,text:stream.pages[0].wire,hash:digest(stream.pages[0].wire)};
      assert.throws(()=>scoped.validateScopedResponse(state,state.jobs[d.job.id],forged,d.job.native_id,d.review.qualification_result,d.job.qualification_delivery),/stale assignment|changed frozen delivery/);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});if(priorCache===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=priorCache;}
});
