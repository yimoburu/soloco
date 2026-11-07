import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {digest} from '../plugins/soloco/runtime/store.mjs';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
import {retainSnapshot,resolveSnapshot,inheritSnapshots,snapshotBytes,pendingSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
const sha=v=>digest(JSON.stringify(v)),bytes=v=>Buffer.byteLength(JSON.stringify(v));
const runtime=new URL('../plugins/soloco/runtime/scoped-context.mjs',import.meta.url);
const currentSource=fs.readFileSync(runtime,'utf8');
// Verbatim incoming capture, validation and claim functions, not a renamed
// descriptor. This executable oracle actually issues old inline capsules.
const incoming={
  "capture": "function captureCorpus(s,{source_id,corpus_plan_id,selected_source_ids,semantic_partition}){\n  let c,m;\n  if(corpus_plan_id){const prior=plan(s,source(s,corpus_plan_id));if(prior.v.partitioner!==CORPUS_PARTITIONER)fail('exact corpus plan required');c=prior.c;m=prior.material;if(semantic_partition&&!same(semantic_partition,c.semantic_partition))fail('frozen semantic partition changed');if(selected_source_ids&&!same(selected_source_ids,c.selected_sources))fail('selected corpus membership changed');}\n  else {\n    ids(selected_source_ids,'explicit selected corpus sources',false);\n    m=buildLegacyCoherentPlan(s);\n    for(const id of selected_source_ids)if(m.sources.filter(r=>r.source.id===id).length!==1)fail('exact selected corpus source required');\n    if(semantic_partition)validateCorpusPartition(m,semantic_partition);\n    c={...(semantic_partition?{semantic_partition}:{}),projection:retainSnapshot(s,m),original:retainSnapshot(s,s),selected_sources:[...selected_source_ids],units:corpusUnits(m,semantic_partition),producer_closures:Object.fromEntries(m.sources.map(r=>[r.source.id,producerClosure(s,source(s,r.source.id))]))};\n  }\n  if(!corpus_plan_id)c.incidence=corpusIncidence(m,c.selected_sources,c.producer_closures);\n  if(!c.selected_sources.includes(source_id))fail('source outside explicit selected corpus membership');\n  corpusLive(s,c,m);\n  return {protocol:SCOPED_PROTOCOL,version:1,partitioner:CORPUS_PARTITIONER,source:scopedReference(source(s,c.selected_sources[0]),c.selected_sources[0]),selected_source_ids:[...c.selected_sources],...(c.incidence?{incidence_protocol:CORPUS_INCIDENCE}:{}),extraction_identity:corpusIdentity(c),projection_sha256:sha(m),capsule:retainSnapshot(s,c),units:c.units};\n}\n",
  "plan": "function plan(s,p){\n  if(evaluation?.plans.has(p))return evaluation.plans.get(p);\n  const v=p?.scoped_context_plan;if(v?.protocol!==SCOPED_PROTOCOL||v.version!==1)fail('scoped plan missing');\n  if(v.partitioner!==undefined&&v.partitioner!==COHERENT_PARTITIONER&&v.partitioner!==CORPUS_PARTITIONER)fail('unknown frozen partitioner');\n  if(v.partitioner===CORPUS_PARTITIONER){\n    const c=resolveSnapshot(s,v.capsule),{material,units,projection_sha256}=corpusGraph(s,c.projection);\n    closed(c,['projection','original','selected_sources','units','producer_closures',...(c.incidence?['incidence']:[]),...(c.semantic_partition?['semantic_partition']:[])],'corpus capsule');\n    if(c.incidence&&(c.incidence.protocol!==CORPUS_INCIDENCE||v.incidence_protocol!==CORPUS_INCIDENCE||!same(c.incidence,corpusIncidence(material,c.selected_sources,c.producer_closures)))||!c.incidence&&v.incidence_protocol!==undefined)fail('incompatible corpus incidence claim');\n    if(c.semantic_partition)validateCorpusPartition(material,c.semantic_partition);\n    ids(c.selected_sources,'explicit selected corpus sources',false);\n    if(c.selected_sources.some(id=>material.sources.filter(r=>r.source.id===id).length!==1)||!material.sources.some(r=>same(r.source,v.source)))fail('corpus selected source membership changed');\n    if(digest(snapshotBytes(s,c.original))!==material.baseline.state_sha256)fail('corpus complete original changed');\n    corpusLive(s,c,material);exact(s,v.source);\n    if(!same(v.selected_source_ids,c.selected_sources)||v.source.id!==c.selected_sources[0]||!same(c.units,c.semantic_partition?corpusUnits(material,c.semantic_partition):units)||!same(v.units,c.units)||v.extraction_identity!==corpusIdentity(c)||v.projection_sha256!==projection_sha256)fail('corpus identity/coverage changed');\n    const result={v,c,material};evaluation?.plans.set(p,result);return result;\n  }\n  if(v.partitioner===COHERENT_PARTITIONER){\n    const original=exact(s,v.source),c=resolveSnapshot(s,v.capsule),material=resolveSnapshot(s,c.projection);\n    const decoded=decodeLegacyCoherentPlan(material),closure=producerClosure(s,original),units=coherentUnits(material);\n    if(!same(resolveSnapshot(s,c.original),original)||!same(decoded.state,{records:{[original.id]:original},jobs:{}})||sha(material)!==v.projection_sha256||!same(c.producer_closure,closure)||!same(c.producer,closure[0]??null)||!same(c.units,c.semantic_partition?corpusUnits(material,c.semantic_partition):units)||!same(v.units,units)||v.extraction_identity!==coherentIdentity(v.source,closure,material,units))fail('coherent source/coverage/producer identity changed');\n    const result={v,c,material};evaluation?.plans.set(p,result);return result;\n  }\n  exact(s,v.source);const c=resolveSnapshot(s,v.capsule),original=resolveSnapshot(s,c.original),raw=json(resolveSnapshot(s,c.projection));\n  if(!same(scopedReference(original,v.source.id),v.source)||digest(raw)!==v.projection_sha256||!same(c.units,v.units))fail('frozen original/projection/manifest changed');\n  validateSnapshotDependencies(s,c.dependencies);for(const r of c.retained)exact(s,r);if(c.producer)exact(s,c.producer);\n  const closure=producerClosure(s,original);\n  if(!same(closure,c.producer_closure??(c.producer?[c.producer]:[])))fail('producer closure changed');\n  if(v.extraction_identity!==sha(extractionSubject(v.source,c.producer,c.producer_closure,raw,c.units)))fail('extraction identity changed');\n  // Validate deterministic gap-free manifest without re-projecting company state.\n  if(!same(manifest(raw),v.units))fail('unit manifest changed');\n  const result={v,c,raw};evaluation?.plans.set(p,result);return result;\n}\n",
  "claim": "function corpusClaim(s,p){\n  const {v,c,material:m}=plan(s,p);\n  return {protocol:CORPUS_PRESERVATION,selected_source_ids:c.selected_sources,sources:c.selected_sources.map(id=>m.sources.find(r=>r.source.id===id)),...(c.incidence?{incidence:c.incidence}:{}),baseline:m.baseline,source_census:m.sources,producer_closures:c.producer_closures,census_sha256:sha({occurrences:m.occurrences,inbound:m.snapshot_inbound,collections:m.collection_indexes,sections:m.groups,documents:m.documents}),extraction_identity:v.extraction_identity};\n}\n"
};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-incidence-storage-'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function replaceFunction(code,start,end,value){return code.slice(0,code.indexOf(start))+value+code.slice(code.indexOf(end));}
async function load(old=false){
 let code=currentSource;
 if(old){code=replaceFunction(code,'function captureCorpus(','function corpusUnit(',incoming.capture);code=replaceFunction(code,'function plan(','function coherentUnit(',incoming.plan);code=replaceFunction(code,'function corpusClaim(','function corpusCensus(',incoming.claim);}
 code=code.replace(/from '(\.\/[^']+)'/g,(_m,p)=>"from '"+new URL(p,runtime).href+"'");
 code+='\nexport {plan as checked,corpusIncidence as relation,corpusClaim as claim,corpusIdentity as identity,validateCorpusIncidenceCoverage as coverage};\n';
 const file=path.join(tmp,old?'incoming.mjs':'current.mjs');fs.writeFileSync(file,code);return import(pathToFileURL(file).href);
}
const current=await load(),old=await load(true);
function state(n=4){
 const s={id:'FICTIONAL-ONLY',owner:{epoch:1,session_id:'fictional-owner'},roles:{qa:{}},governance:'Paused real company; fixture only. No permission.',records:{},jobs:{}};
 const original={id:'fictional-original',content:'RAW exact \u2603: failed attempt retained; allowance exhausted.'};
 const archive=retainSnapshot(s,original);
 for(let i=0;i<n;i++)s.records['s'+i]={id:'s'+i,revision:1,author_instance:'fictional-producer-'+i,next:{id:'s'+((i+1)%n),revision:1},archive,content:'OPEN; no adoption.'};
 return {s,original,archive};
}
const args=s=>({partitioner:current.CORPUS_PARTITIONER,source_id:'s0',selected_source_ids:Object.keys(s.records)});
function capture(api,s){return api.captureScopedPlan(s,args(s));}
function install(s,v){const p={id:'plan',kind:'artifact',revision:1,scoped_context_plan:v};s.records.plan=p;return p;}
function jobFor(api,s,p){
 const t=api.createScopedTarget(s,{plan_id:p.id,phase:'extract',unit_id:p.scoped_context_plan.units[0].id,delivery_protocol:api.SCOPED_STREAM});
 s.records.target={id:'target',kind:'artifact',revision:1,scoped_context_target:t};
 return {id:'qa',role:'qa',epoch:1,instance_id:'fictional-independent-worker',review_of:api.scopedReference(s.records.target)};
}
test('FICTIONAL fresh descriptor is bounded, reconstructs exact old relation, originals remain exact',t=>{
 const observations=[];
 for(const n of [8,32,64]){
  const {s,original,archive}=state(n),start=performance.now(),v=capture(current,s),capture_ms=performance.now()-start,c=resolveSnapshot(s,v.capsule),p=install(s,v);
  const then=performance.now(),r=current.checked(s,p),revalidate_ms=performance.now()-then;
  assert.equal(c.incidence.protocol,'corpus-incidence-derivation-v1');assert.ok(!Object.hasOwn(c.incidence,'sources'));
  assert.deepEqual(r.c,c);assert.equal(r.c.incidence.protocol,'corpus-incidence-derivation-v1');
  const exact=old.relation(r.material,c.selected_sources,c.producer_closures);
  assert.equal(JSON.stringify(r.incidence),JSON.stringify(exact));assert.deepEqual(current.claim(s,p).incidence,exact);
  assert.equal(c.incidence.relation_sha256,sha(exact));assert.deepEqual(resolveSnapshot(s,archive),original);
  assert.deepEqual(resolveSnapshot(s,c.original).records.s0,s.records.s0);
  assert.ok(bytes(c.incidence)<600);assert.ok(bytes(c)<bytes({...c,incidence:exact})/2);
  assert.ok(![...pendingSnapshots(s).values()].includes(JSON.stringify(exact)),'no separate persisted derived closure');
  observations.push({sources:n,occurrences:r.material.occurrences.length,descriptor_bytes:bytes(c.incidence),capsule_bytes:bytes(c),inline_capsule_bytes:bytes({...c,incidence:exact}),relation_bytes:bytes(exact),capture_ms,revalidate_ms});
 }
 t.diagnostic(JSON.stringify({fictional_only:true,native_acceptance:false,observations}));
});
test('genuine incoming inline and no-incidence issued plans preserve exact identity and packet bytes',()=>{
 for(const incidence of [true,false]){
  const {s}=state(),v=capture(old,s),c=resolveSnapshot(s,v.capsule);
  assert.equal(c.incidence.protocol,'corpus-provenance-incidence-v1');assert.ok(c.incidence.sources.length);
  if(!incidence){delete c.incidence;delete v.incidence_protocol;v.extraction_identity=old.identity(c);v.capsule=retainSnapshot(s,c);}
  const issued=JSON.stringify(v),capsule=snapshotBytes(s,v.capsule),p=install(s,v),j=jobFor(old,s,p);
  assert.deepEqual(current.scopedAssignment(s,j),old.scopedAssignment(s,j),'exact packet, wire, stream and hash');
  assert.deepEqual(current.claim(s,p),old.claim(s,p),'full canonical claim stays exact');
  assert.equal(current.checked(s,p).v.extraction_identity,v.extraction_identity);
  assert.equal(JSON.stringify(v),issued);assert.equal(snapshotBytes(s,v.capsule),capsule);
  const reused=current.captureScopedPlan(s,{source_id:'s0',corpus_plan_id:'plan',partitioner:current.CORPUS_PARTITIONER});
  assert.equal(reused.extraction_identity,v.extraction_identity);assert.deepEqual(reused.capsule,v.capsule);
 }
});
test('descriptor reuse keeps stored representation and extraction identity exact',()=>{
 const {s}=state(),v=capture(current,s),p=install(s,v),before=snapshotBytes(s,v.capsule);
 const r=current.checked(s,p);assert.notEqual(r.incidence.protocol,r.c.incidence.protocol);
 const reuse=current.captureScopedPlan(s,{source_id:'s0',corpus_plan_id:'plan',partitioner:current.CORPUS_PARTITIONER});
 assert.equal(reuse.extraction_identity,v.extraction_identity);assert.deepEqual(reuse.capsule,v.capsule);assert.equal(snapshotBytes(s,reuse.capsule),before);
});
test('missing, substituted, mixed and unknown descriptors or frozen inputs Hold even if identity is rebound',()=>{
 const {s}=state(),v=capture(current,s);install(s,v);
 const edits=[c=>delete c.projection,c=>delete c.selected_sources,c=>delete c.producer_closures,c=>c.unknown=true,c=>delete c.incidence.protocol,c=>c.incidence.relation_protocol='unknown',c=>delete c.incidence.relation_sha256,c=>delete c.incidence.basis_sha256,c=>c.incidence.relation_sha256='0'.repeat(64),c=>c.incidence.basis_sha256='0'.repeat(64),c=>c.incidence.protocol='unknown',c=>c.incidence.extra=true,c=>c.incidence.sources=[],c=>c.incidence.source_count++,c=>c.incidence.occurrence_count++,c=>c.selected_sources.reverse(),c=>c.producer_closures.s0.push({id:'s1',revision:1,sha256:'0'.repeat(64)}),c=>c.units[0].group_ids.pop(),c=>c.projection=retainSnapshot(s,{}),c=>delete c.incidence];
 for(const edit of edits){const bad=inheritSnapshots(s,structuredClone(s)),p=bad.records.plan,c=resolveSnapshot(bad,p.scoped_context_plan.capsule);edit(c);p.scoped_context_plan.capsule=retainSnapshot(bad,c);p.scoped_context_plan.extraction_identity=current.identity(c);assert.throws(()=>current.checked(bad,p),/hold|Held|coherent|manifest/i);}
 // Complete valid projection replacement must also invalidate the bound basis.
 const bad=inheritSnapshots(s,structuredClone(s)),p=bad.records.plan,c=resolveSnapshot(bad,p.scoped_context_plan.capsule);
 const other=state(5),otherV=capture(current,other.s),otherC=resolveSnapshot(other.s,otherV.capsule);
 c.projection=retainSnapshot(bad,resolveSnapshot(other.s,otherC.projection));p.scoped_context_plan.capsule=retainSnapshot(bad,c);p.scoped_context_plan.extraction_identity=current.identity(c);
 assert.throws(()=>current.checked(bad,p),/hold|Held/i);
});
test('full cell coverage, conservative unknown and final STRING boundary remain exact',()=>{
 const {s}=state();s.records.s0.unknown={id:'missing',revision:1};s.records.s1.quoted=JSON.stringify({id:'missing-quoted',revision:1});
 const v=capture(current,s),p=install(s,v),r=current.checked(s,p),inc=r.incidence;
 assert.equal(inc.sources[0].conservative,true);assert.equal(inc.sources[1].conservative,true,'typed cyclic reachability still reaches unknown');
 assert.ok(inc.sources.every(q=>q.references.every(e=>!e.path.includes('/@json-text'))));
 const rows=[{sources:r.c.selected_sources,occurrences:r.material.occurrences.map(o=>o.id),item:'item'}];
 current.coverage(rows,['item'],r.c.selected_sources,r.material.occurrences,inc);
 const missing=structuredClone(rows);missing[0].occurrences.pop();assert.throws(()=>current.coverage(missing,['item'],r.c.selected_sources,r.material.occurrences,inc),/missing corpus incidence/);
 const duplicate=[...rows,...rows];assert.throws(()=>current.coverage(duplicate,['item'],r.c.selected_sources,r.material.occurrences,inc),/duplicate corpus incidence/);
 const f=state(1);delete f.s.records.s0.next;f.s.records.s0.quoted=JSON.stringify({id:'missing',revision:1});const fv=capture(current,f.s),fr=current.checked(f.s,install(f.s,fv));assert.equal(fr.incidence.sources[0].conservative,false);
});
test('cached derivations never suppress live source, membership, owner or native contributor checks',()=>{
 const {s}=state(),v=capture(current,s),p=install(s,v),j=jobFor(current,s,p);
 current.checked(s,p);assert.equal(current.validateScopedNativeAdmission(s,j,'fictional-fresh-native'),true);
 for(const native of ['fictional-owner','fictional-producer-0','fictional-producer-3'])assert.throws(()=>current.validateScopedNativeAdmission(s,j,native),/hold/i);
 for(const edit of [s=>s.records.s0.content+=' changed',s=>s.records.s3.author_instance='substituted',s=>s.records.added={id:'added',revision:1},s=>s.owner.epoch++]){const bad=inheritSnapshots(s,structuredClone(s));edit(bad);assert.throws(()=>current.scopedAssignment(bad,j),/hold/i);}
});

test('all frozen unselected and rejected contributors remain independent after descriptor caching',()=>{
 const {s}=state();
 s.records.unselected={id:'unselected',revision:1,author_instance:'fictional-unselected-author',content:'All frozen evidence counts.'};
 s.jobs.failed={id:'failed',status:'failed',rejected_native_ids:['fictional-rejected-native'],instance_id:'fictional-failed-worker',rejected_output:{text:'{"review":{"verdict":"Blocked"}}',native_id:'fictional-rejected-native'}};
 const v=current.captureScopedPlan(s,{...args(s),selected_source_ids:['s0']}),p=install(s,v),j=jobFor(current,s,p);
 current.checked(s,p);
 for(const native of ['fictional-unselected-author','fictional-rejected-native','fictional-failed-worker'])assert.throws(()=>current.validateScopedNativeAdmission(s,j,native),/hold/i);
 assert.equal(current.validateScopedNativeAdmission(s,j,'fictional-clean-independent-native'),true);
});

test('descriptor binds genuine producer closure and exact semantic partition; fresh identities are prospective',()=>{
 const {s}=state();s.jobs.producer={id:'producer',artifact_id:'s0',instance_id:'fictional-producer-0',status:'completed'};s.records.s0.job_id='producer';
 const m=buildLegacyCoherentPlan(s),semantic_partition={plan_sha256:m.plan_sha256,selections:[{id:'all',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
 const options={...args(s),semantic_partition},v=current.captureScopedPlan(s,options),issued=old.captureScopedPlan(s,options);
 assert.notEqual(v.extraction_identity,issued.extraction_identity);assert.equal(v.projection_sha256,issued.projection_sha256);
 const p=install(s,v),r=current.checked(s,p);assert.ok(r.c.producer_closures.s0.length);assert.deepEqual(r.incidence,resolveSnapshot(s,issued.capsule).incidence);
 for(const edit of [c=>c.semantic_partition.selections[0].scope='different-valid-scope',c=>c.producer_closures.s0=[]]){
  const bad=inheritSnapshots(s,structuredClone(s)),bp=bad.records.plan,c=resolveSnapshot(bad,bp.scoped_context_plan.capsule);edit(c);bp.scoped_context_plan.capsule=retainSnapshot(bad,c);bp.scoped_context_plan.extraction_identity=current.identity(c);assert.throws(()=>current.checked(bad,bp),/hold/i);
 }
 const bad=inheritSnapshots(s,structuredClone(s));bad.jobs.producer.instance_id='substituted-current-producer';assert.throws(()=>current.checked(bad,bad.records.plan),/hold/i);
});
