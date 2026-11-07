import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
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
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-proof-storage-'));
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
    r.summary='FICTIONAL ADAPTER: all fixture occurrences and inbound contexts reconciled; all restrictions remain OPEN.';
    r.mappings=all.flatMap(({key})=>(p.corpus_claim?p.corpus_claim.selected_source_ids:[null]).map(sourceId=>({item:key,...(p.corpus_claim?{source_ids:[sourceId],occurrence_ids:p.mapping_occurrence_ids,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'FICTIONAL contextual judgment for '+sourceId+': '+(sourceId==='alias'?'DENY even with consent':'ALLOW only after new consent')+'; every distinct physical ancestor remains binding; LATE_NO_EXPORT overrides all local permission.',unresolved_outcomes:'OPEN remains OPEN; failures retained; retries exhausted; no execution or export permission.'}:{}),...(p.mapping_selection_ids?{selection_ids:p.mapping_selection_ids}:{}),status:'represented',homes:p.homes.map(h=>h.source.id),reason:'Fictional complete source conditions preserved, with all occurrence differences and OPEN restrictions.'})));
    if(p.corpus_claim?.selected_source_ids?.length===1)for(const mapping of r.mappings){mapping.source_set=structuredClone(p.mapping_sets.source_set);delete mapping.source_ids;}
    r.interfaces=p.interface_keys.length?[]:all.flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));
    r.reviewed_interfaces=p.interface_keys;
    if(JSON.stringify(p.extractions).includes('LATE_NO_EXPORT')&&!p.homes.some(h=>h.value.content.includes('LATE_NO_EXPORT'))){r.verdict='Blocked';r.permitted_action='hold';r.reason='Fictional late qualifier missing from current home';r.blockers=[r.reason];}
  }else{r.summary='FICTIONAL ADAPTER: independently scripted complete integration, no action permission.';r.unreviewed_interfaces=[];}
  return envelope(r);
}
async function run(f,args,{review=contractReview,native,modelHook,streamHook,omitTiming=false,legacy=false}={}){
  const t=call(f,{action:'target',...args,plan_id:args.plan_id??f.plan_id});if(t.reused)return t;
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
  const s=read(f),j=s.jobs[queued.id];
  if(process.env.CORPUS_CONSTRUCTION_BASELINE_MODULE&&j.status==='completed'){
    const baseline=await import(process.env.CORPUS_CONSTRUCTION_BASELINE_MODULE);
    // A deliberately Blocked receipt can itself change current governance.
    // Compare both exact assignments and exact live-validation Hold outcomes.
    const outcome=fn=>{try{return {assignment:fn()};}catch(error){return {hold:error.message};}};
    assert.deepEqual(outcome(()=>scoped.scopedAssignment(s,j)),outcome(()=>baseline.scopedAssignment(s,j)),'exact assignment/result/native claim, stream bytes or live Hold against incoming construction');
  }
  const out={target:t,job:j,review:s.records[j.artifact_id],streamRequests,packet:streamRequests.length?(j.status==='completed'?JSON.parse(streamParts.join('')):null):j.qualification_delivery&&JSON.parse(j.qualification_delivery.wire)};
  if(out.packet?.protocol==='corpus-readable-structure-v1')out.packet=scoped.expandCorpusStructure(out.packet);return out;
}

async function extracts(f){const es=[];for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}return es;}
async function finish(f,es){
  const args={phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM};
  const d=await run(f,args);assert.equal(d.job.status,'completed',d.job.error);assert.equal(d.review.review.verdict,'Pass',d.review.content);
  const keys=d.review.qualification_result.interfaces.map(i=>i.key);
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}),/interface coverage/);
  const ir=await run(f,{...args,domain_review_ids:[d.review.id],interface_keys:keys});assert.equal(ir.job.status,'completed',ir.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00'],delivery_protocol:scoped.SCOPED_STREAM});assert.equal(i.job.status,'completed',i.job.error);
  return {d,ir,i};
}


// Entirely fictional scripted judgments: these assert mechanics, never native QA.
const compactProtocol='corpus-preservation-claim-reference-v1';
const vault=f=>withStore(f.root,db=>new Map(db.db.prepare('SELECT sha256,bytes FROM immutable_values').all().map(r=>[r.sha256,r.bytes])));
function noDerivedClosure(value){
 const todo=[value];while(todo.length){const v=todo.pop();if(!v||typeof v!=='object')continue;
  assert.ok(!(v.protocol==='corpus-provenance-incidence-v1'&&v.sources?.some(q=>q.regions||q.references)),'new persistent payload contains expanded derived incidence');
  for(const x of Object.values(v))if(x&&typeof x==='object')todo.push(x);
 }
}
function compactReview(p){
 const e=contractReview(p),r=e.qualification_result;
 if(p.phase==='applicability')r.mappings=p.item_keys.map(item=>({item,status:'represented',source_set:p.mapping_sets.source_set,occurrence_set:p.mapping_sets.occurrence_set,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'FICTIONAL: preserve all cyclic source conditions, raw originals and unknowns; no execution.',unresolved_outcomes:'OPEN UNKNOWN FAILED EXHAUSTED; no renewed allowance.',homes:['home-D00'],reason:'FICTIONAL complete cell judgment; no native acceptance.'}));
 return e;
}
async function lifecycle(n,{legacy}={}){
 const f=fixture({deferPlan:true,operating:true});
 const selected=Array.from({length:n},(_,i)=>'s'+i);
 mutate(f,s=>{
  delete s.records.old;
  const archive=retainSnapshot(s,{id:'fictional-original',content:'EXACT RAW: failed attempt; effects unknown; allowance exhausted.'});
  for(let i=0;i<n;i++)s.records['s'+i]={id:'s'+i,revision:1,kind:'artifact',author_instance:'fictional-historical-'+i,next:{id:'s'+((i+1)%n),revision:1},archive,condition:'OPEN UNKNOWN FAILED EXHAUSTED; preserve every condition.'};
  const h=s.records['home-D00'];h.content='FICTIONAL all cyclic source conditions and raw originals remain OPEN UNKNOWN FAILED EXHAUSTED; no execution.';h.context_obligations.scope='*';h.operating_record.scope='*';h.operating_record.evidence_refs=selected;
 });
 const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'s0',selected_source_ids:selected});f.plan_id=p.id;
 if(legacy)mutate(f,s=>{
  const v=s.records[p.id].scoped_context_plan,c=resolveSnapshot(s,v.capsule);
  if(legacy==='inline')c.incidence=scoped.inspectCorpusIncidence(s,{plan_id:p.id});else {delete c.incidence;delete v.incidence_protocol;}
  v.extraction_identity=sha({partitioner:scoped.CORPUS_PARTITIONER,projection:c.projection,selected_sources:c.selected_sources,units:c.units,producer_closures:c.producer_closures,...(c.incidence?{incidence:c.incidence}:{})});v.capsule=retainSnapshot(s,c);
 });
 const initial=read(f),v=initial.records[p.id].scoped_context_plan,c=resolveSnapshot(initial,v.capsule),relation=legacy==='unmarked'?null:scoped.inspectCorpusIncidence(initial,{plan_id:p.id});
 assert.equal(v.units.length,1,'bounded fixture requires one intrinsic batch');
 const es=[];for(const u of v.units)es.push(await run(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM},{review:compactReview}));
 const args={phase:'applicability',delivery_schema:scoped.CORPUS_FIT_DELIVERY,extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM};
 const d=await run(f,args,{review:compactReview});assert.equal(d.job.status,'completed',d.job.error);
 const ir=await run(f,{...args,domain_review_ids:[d.review.id],interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)},{review:compactReview});assert.equal(ir.job.status,'completed',ir.job.error);
 const i=await run(f,{phase:'integration',delivery_schema:scoped.CORPUS_FIT_DELIVERY,domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00'],delivery_protocol:scoped.SCOPED_STREAM},{review:compactReview});assert.equal(i.job.status,'completed',i.job.error);
 return {f,v,c,relation,es,d,ir,i};
}
const incomingApply="export function validateScopedApply(s,{integration_review_id},{adopted=false}={}){return evaluate(()=>{\n  const proof=canonical(s,scopedReference(source(s,integration_review_id))),{x}=proof;if(x.t.phase!=='integration')fail('canonical integration receipt required');if(!adopted)live(s,proof.job,x);\n  const closure=[...evaluation.proofs.values()];for(const p of closure)noNegatives(s,p.x);\n  const reviews=proofChildren(s,x),domains=reviews.filter(p=>x.t.domain_review_ids.includes(p.record.id));\n  const homes=[...new Map([...x.t.homes,...x.t.dependencies].map(r=>[r.id,r])).values()];dependencyCycles(s,x.v.source.id,homes);\n  const home_scopes=homes.map(r=>{\n    const contributing=domains.filter(p=>p.x.t.homes.some(h=>h.id===r.id)),declared=scopeOf(exact(s,r));\n    // Missing/unknown scope, dependencies and cross-domain homes always remain\n    // mandatory. A coordinator cannot relabel a domain dependency at integration.\n    const global=!declared||declared==='*'||!contributing.length\n      ||contributing.some(p=>p.x.t.context_scope!==declared)\n      ||reviews.some(p=>p.x.t.dependencies.some(h=>h.id===r.id)\n        ||p.x.t.interface_keys.length&&p.x.t.homes.some(h=>h.id===r.id))\n      ||contributing.some(p=>p.result.mappings.some(m=>m.homes.includes(r.id)\n        &&extracted(proofChildren(s,p.x)).find(i=>i.key===m.item)?.item.scope==='*'));\n    return {source:r,scopes:global?['*']:contributing.map(p=>p.x.t.context_scope)};\n  });\n  const result={protocol:SCOPED_PROTOCOL,version:1,source:x.v.source,plan:x.t.plan,integration:scopedReference(proof.record),extraction_identity:x.v.extraction_identity,global_sha256:x.t.global_sha256,homes,home_scopes,receipts:closure.map(p=>({review:scopedReference(p.record),job:scopedReference(p.job,'job:'+p.job.id),target:scopedReference(p.x.record)}))};\n  if(x.v.partitioner===CORPUS_PARTITIONER){for(const [id,c] of Object.entries(s.context_classifications??{})){if(id!==x.v.source.id&&(x.v.selected_source_ids.includes(id)||c.scoped_qualification?.protocol===CORPUS_PRESERVATION&&c.scoped_qualification.selected_source_ids.some(member=>x.v.selected_source_ids.includes(member))))fail('competing corpus member classification; atomic application held');}for(const id of x.v.selected_source_ids)dependencyCycles(s,id,homes);return {...result,protocol:CORPUS_PRESERVATION,selected_source_ids:x.v.selected_source_ids,claim:corpusClaim(s,x.p),source_mappings:corpusSourceMappings(s,x,domains),domain_mappings:domains.map(d=>({review:scopedReference(d.record),mapping_context_sha256:d.result.mapping_context_sha256,mappings:d.result.mappings})),home_scopes:homes.map(source=>({source,scopes:['*']})),operating_integration:{status:'requires_independent_publication',interface:'validateCorpusPreservation',reason:'Validated preservation grants no current operating acceptance or action authority; no single-source scoped receipt is issued.'}};}\n  return result;\n});}\n";

test('FICTIONAL 64 cyclic sources: canonical worker apply and storage-backed operating capture never persist derived incidence',async t=>{
 const start=performance.now(),a=await lifecycle(64),{f,v,c,relation,es,d,ir,i}=a;
 assert.ok(bytes(relation)>2000000,'large repeated old relation is exercised');
 const beforeApply=vault(f),pre=read(f),assignment=scoped.scopedAssignment(pre,pre.jobs[d.job.id]);
 const missing=structuredClone(d.review.qualification_result);missing.mappings[0].occurrence_set={basis_sha256:sha(d.packet.mapping_occurrence_ids),ranges:[[0,d.packet.mapping_occurrence_ids.length-1]]};
 assert.throws(()=>scoped.validateScopedResponse(pre,pre.jobs[d.job.id],assignment,d.job.native_id,missing,d.job.qualification_delivery),/missing corpus incidence|coverage|mapping/i);
 const saved=scoped.validateScopedApply(pre,{integration_review_id:i.review.id});assert.equal(saved.claim.protocol,compactProtocol);
 assert.equal((await publicCall('company_context',{...f,action:'apply',integration_review_id:i.review.id},'codex')).applied,true);
 const applied=read(f),proof=applied.context_classifications.s0.scoped_qualification;
 assert.deepEqual(scoped.validateCorpusPreservation(applied,{integration_review_id:i.review.id}),proof);
 assert.equal(proof.claim.canonical_claim_sha256,d.review.qualification_result.corpus_claim_sha256);
 assert.deepEqual(proof.claim.capsule,v.capsule);assert.deepEqual(proof.claim.incidence_derivation,c.incidence);
 assert.equal(proof.claim.source_mappings_sha256,sha(proof.source_mappings));assert.equal(proof.claim.receipts_sha256,sha(proof.receipts));
 assert.equal(bytes(scoped.inspectCorpusIncidence(applied,{plan_id:f.plan_id})),bytes(relation));
 const projection=reviewedContext(applied);for(const id of proof.selected_source_ids)assert.equal(projection.excluded(id),true);
 noDerivedClosure(proof);assert.ok(bytes(proof)<bytes(relation)/4);
 const afterApply=vault(f);for(const [h,raw] of afterApply)if(!beforeApply.has(h))noDerivedClosure(JSON.parse(raw));
 const proposal=await publicCall('company_context',{...f,protocol:'operating-state-v1',action:'plan'},'codex');assert.equal(proposal.held,false,JSON.stringify(proposal.frontier));
 const operating=read(f),plan=operating.records[proposal.id].operating_plan,preservation=resolveSnapshot(operating,plan.snapshot.preservation);
 noDerivedClosure(plan);noDerivedClosure(preservation);assert.equal(preservation.evidence.accepted_semantics.length,1);
 assert.equal(preservation.classifications.s0.scoped_qualification.claim.protocol,compactProtocol);
 assert.equal(preservation.evidence.accepted_semantics[0].source_set.length,64);
 assert.ok(JSON.stringify(preservation.evidence.accepted_semantics).includes('OPEN UNKNOWN FAILED EXHAUSTED'));
 const afterOperating=vault(f);for(const [h,raw] of afterOperating)if(!afterApply.has(h))noDerivedClosure(JSON.parse(raw));
 for(const mutateProof of [p=>p.claim.canonical_claim_sha256='0'.repeat(64),p=>p.claim.capsule=c.original,p=>p.claim.incidence_derivation.basis_sha256='0'.repeat(64),p=>p.claim.selected_sources_sha256='0'.repeat(64),p=>p.selected_source_ids.pop(),p=>p.claim.receipts_sha256='0'.repeat(64),p=>p.receipts.pop(),p=>p.claim.source_mappings_sha256='0'.repeat(64),p=>p.source_mappings.pop(),p=>p.domain_mappings[0].mappings[0].conditions='substituted',p=>p.claim.unknown=true,p=>p.claim.protocol='unknown',p=>p.claim.incidence=relation]){
  const bad=inheritSnapshots(applied,structuredClone(applied));mutateProof(bad.context_classifications.s0.scoped_qualification);assert.throws(()=>scoped.validateCorpusExclusion(bad,bad.context_classifications.s0.scoped_qualification,'s0'),/hold|changed|mapping/i);
 }
 for(const edit of [s=>s.jobs[es[0].job.id].native_id='substituted',s=>s.jobs[ir.job.id].native_id=d.job.native_id,s=>s.jobs[d.job.id].qualification_delivery.complete=false,s=>s.jobs[d.job.id].execution_deadline_at=s.jobs[d.job.id].execution_started_at,s=>s.records.s63.condition+='changed',s=>s.governance+=' Late policy denies export.']){const bad=inheritSnapshots(applied,structuredClone(applied));edit(bad);assert.throws(()=>scoped.validateCorpusExclusion(bad,bad.context_classifications.s0.scoped_qualification,'s0'),/hold|changed/i);}
 t.diagnostic(JSON.stringify({fictional_only:true,native_acceptance:false,sources:64,relation_bytes:bytes(relation),capsule_bytes:bytes(c),stored_proof_bytes:bytes(proof),compact_claim_bytes:bytes(proof.claim),operating_preservation_bytes:bytes(preservation),new_apply_immutable_values:afterApply.size-beforeApply.size,new_operating_immutable_values:afterOperating.size-afterApply.size,elapsed_ms:performance.now()-start,actual_native_fit:null}));
});
test('issued inline and no-incidence full preservation proof bytes remain exact against proof-entry validator',async()=>{
 // Pin the verbatim incoming validateScopedApply function, including full claim.
 const runtime=new URL('../plugins/soloco/runtime/scoped-context.mjs',import.meta.url);
 let code=fs.readFileSync(runtime,'utf8');
 const start=code.indexOf('export function validateScopedApply('),end=code.indexOf('// The public apply transaction',start);
 code=code.slice(0,start)+incomingApply+code.slice(end);
 code=code.replace(/from '(\.\/[^']+)'/g,(_m,p)=>"from '"+new URL(p,runtime).href+"'");
 const file=path.join(tmp,'proof-entry-validator.mjs');fs.writeFileSync(file,code);const incoming=await import(pathToFileURL(file).href);
 for(const legacy of ['inline','unmarked']){
  const {f,i}=await lifecycle(2,{legacy}),s=read(f),before=incoming.validateScopedApply(s,{integration_review_id:i.review.id}),after=scoped.validateScopedApply(s,{integration_review_id:i.review.id});
  assert.equal(JSON.stringify(after),JSON.stringify(before));assert.equal(after.claim.protocol,scoped.CORPUS_PRESERVATION);
  assert.equal(Boolean(after.claim.incidence),legacy==='inline');
  assert.equal((await publicCall('company_context',{...f,action:'apply',integration_review_id:i.review.id},'codex')).applied,true);
  assert.equal(JSON.stringify(read(f).context_classifications.s0.scoped_qualification),JSON.stringify(before));
  assert.equal(scoped.validateCorpusExclusion(read(f),before,'s1').protocol,scoped.CORPUS_PRESERVATION);
 }
});
