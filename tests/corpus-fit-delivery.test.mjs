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
  const partition={plan_sha256:material.plan_sha256,selections};
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old'],semantic_partition:partition});f.plan_id=p.id;
  return {f,partition,material};
}

async function extracts(f){const out=[];for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM},{review:p=>{const e=contractReview(p);if(JSON.stringify(p.reviewed_unit_bundle).includes('HISTORICAL_GLOBAL_EXHAUSTED'))e.qualification_result.items[0].text+=' FICTIONAL complete historical condition: HISTORICAL_GLOBAL_EXHAUSTED; prior attempt FAILED; outcome UNKNOWN; renewal required; no retry until reconciliation; distant effects remain OPEN.';return e;}});assert.equal(e.job.status,'completed',e.job.error);out.push(e);}return out;}
const fit=scoped.CORPUS_FIT_DELIVERY;
function fitReview(p){const e=contractReview(p),r=e.qualification_result;r.reason='FICTIONAL complete judgment.';if(p.phase==='applicability')for(const m of r.mappings){m.occurrence_set=structuredClone(p.mapping_sets.occurrence_set);delete m.occurrence_ids;m.reason='FICTIONAL retained.';m.conditions='Consent required; opposite DENY retained.';m.unresolved_outcomes='UNKNOWN; FAILED; EXHAUSTED; OPEN.';}return envelope(r);}

test('exact deterministic readable factoring retains physical duplicates, unknowns and semantic growth',t=>{
 const ref={id:'source:long-identity-000000000',revision:1,sha256:'a'.repeat(64)};
 const make=n=>({semantic:{text:'UNKNOWN FAILED EXHAUSTED',conditions:'retain both qualifiers'},occurrences:Array.from({length:n},(_,i)=>({id:'occurrence-'+i,source:ref,document:ref,path:'/same/long/physical/path/'+i,qualifier_groups:['qualifier-long-allowance-remaining','qualifier-long-exhausted'],unknown:{'$r':3},condition:i%2?'allowance exhausted; renewal required':'remaining allowance available'}))});
 for(const n of [2,100,500]){const logical=make(n),p=scoped.factorCorpusStructure(logical);assert.equal(JSON.stringify(p),JSON.stringify(scoped.factorCorpusStructure(logical)));assert.deepEqual(scoped.expandCorpusStructure(p),logical);assert.equal(scoped.validateCorpusStructure(p,logical),true);assert.equal(scoped.expandCorpusStructure(p).occurrences.length,n);t.diagnostic(JSON.stringify({fictional_structural_only:true,n,logical_bytes:bytes(logical),factored_bytes:bytes(p)}));if(n===500)assert.ok(bytes(p)<bytes(logical));}
 const p=scoped.factorCorpusStructure(make(100));
 for(const edit of [p=>p.tables.pop(),p=>{p.tables[0]='substituted';},p=>{p.tables[0]={$r:0};},p=>{p.logical_packet.occurrences[0].source={$r:99999};}]){const bad=structuredClone(p);edit(bad);assert.throws(()=>scoped.expandCorpusStructure(bad),/hold/i);}
 const omitted=make(100);omitted.occurrences.pop();assert.throws(()=>scoped.validateCorpusStructure(scoped.factorCorpusStructure(omitted),make(100)),/omission/);
 const semantic=make(100);semantic.semantic.text+=' new consequential meaning '.repeat(1000);assert.ok(bytes(scoped.factorCorpusStructure(semantic))>bytes(p)+20000);
});

test('FICTIONAL complete fit chain uses canonical conclusions and bounded compact native requests',async t=>{
 const {f}=await semanticFixture({inbound:true}),es=await extracts(f),workload=scoped.inspectCorpusWorkload(read(f),{plan_id:f.plan_id}),ds=[],irs=[],args=[];
 for(const q of workload.selections){const a={phase:'applicability',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,selection_ids:[q.id],extraction_review_ids:es.filter(e=>q.intrinsic_batches.includes(e.target.target.unit_id)).map(e=>e.review.id),counterpart_ids:[q.id==='B'?'home-D01':q.id==='archive'?'home-D02':'home-D00'],context_scope:'*'};args.push(a);const d=await run(f,a,{review:fitReview});assert.equal(d.job.status,'completed',d.job.error);ds.push(d);
  assert.equal(d.packet.delivery_projection.schema,fit);assert.equal(d.packet.reference_evidence,undefined);
  for(const e of d.packet.extractions){assert.deepEqual(e.result,es.find(x=>x.review.id===e.review.id).review.qualification_result);assert.equal(e.reviewed_unit_bundle,undefined);assert.ok(e.primary.group_ids.length);}
  assert.ok(d.packet.occurrence_context.sections.every(g=>!Object.hasOwn(g,'body')));
  assert.ok(d.packet.global_rules.governing.some(g=>g.source.id==='late'));
  assert.ok(d.packet.global_occurrence_context.sections.every(g=>!Object.hasOwn(g,'body')));
  const byReview=new Map(d.packet.extractions.map(e=>[e.review.id,e]));
  for(const g of [...d.packet.occurrence_context.sections,...d.packet.global_occurrence_context.sections]){assert.ok(g.primary_review_ids.length);for(const id of g.canonical_review_ids)assert.ok(byReview.has(id));}
  assert.ok(d.packet.extractions.some(e=>JSON.stringify(e.result).includes('HISTORICAL_GLOBAL_EXHAUSTED')));
  assert.deepEqual(d.packet.raw_extractions,[]);
  assert.ok(d.packet.instructions.includes('Historical global/unknown'));
  assert.ok(!JSON.stringify(d.packet.global_occurrence_context).includes('HISTORICAL_GLOBAL_EXHAUSTED'));
 }
 for(const [n,a] of args.entries()){const ir=await run(f,{...a,counterpart_ids:['home-D00','home-D01','home-D02'],domain_review_ids:ds.map(d=>d.review.id),interface_keys:ds[n].review.qualification_result.interfaces.map(i=>i.key)},{review:fitReview});assert.equal(ir.job.status,'completed',ir.job.error);irs.push(ir);for(const d of ds)assert.deepEqual(ir.packet.domain_conclusions.find(c=>c.review.id===d.review.id).result,d.review.qualification_result);assert.ok(ir.packet.occurrence_context.sections.every(g=>!Object.hasOwn(g,'body')));assert.ok(ir.packet.global_occurrence_context.sections.every(g=>!Object.hasOwn(g,'body')));assert.ok(ir.packet.extractions.some(e=>JSON.stringify(e.result).includes('HISTORICAL_GLOBAL_EXHAUSTED')));}
 const final=await run(f,{phase:'integration',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:ds.map(d=>d.review.id),interface_review_ids:irs.map(i=>i.review.id),counterpart_ids:['home-D00','home-D01','home-D02']},{review:fitReview});assert.equal(final.job.status,'completed',final.job.error);
 for(const [key,results] of [['domains',ds],['interface_reviews',irs]])for(const d of results)assert.deepEqual(final.packet[key].find(c=>c.review.id===d.review.id).result,d.review.qualification_result);
 const state=read(f);assert.equal(scoped.validateCorpusPreservation(state,{integration_review_id:final.review.id}).protocol,scoped.CORPUS_PRESERVATION);
 for(const r of [...ds,...irs,final]){assert.ok(r.packet.global_rules.governing.some(g=>g.source.id==='late'&&JSON.stringify(g).includes('UNKNOWN; FAILED; allowance EXHAUSTED')));assert.ok(r.packet.global_occurrence_context.sections.every(g=>!Object.hasOwn(g,'body')));const supported=new Map(r.packet.extractions.map(e=>[e.review.id,e]));for(const section of r.packet.global_occurrence_context.sections)for(const id of section.canonical_review_ids)assert.ok(supported.has(id));assert.ok(r.streamRequests.every(w=>bytes(w)<=48000));const encoded=JSON.parse(r.streamRequests.map(w=>JSON.parse(w).text).join(''));assert.equal(encoded.protocol,'corpus-readable-structure-v1');assert.deepEqual(scoped.expandCorpusStructure(encoded),r.packet);assert.ok(bytes(r.review.qualification_output)<=48000);assert.ok(bytes(JSON.parse(r.review.qualification_output))<=12000);}
 for(const edit of [s=>s.jobs[es[0].job.id].native_id='substituted',s=>s.jobs[irs[0].job.id].native_id=ds[0].job.native_id,s=>s.jobs[es[0].job.id].coordination_release.termination_confirmed=false,s=>s.jobs[irs[0].job.id].qualification_delivery.complete=false,s=>s.jobs[ds[0].job.id].rejected_output={text:'negative'},s=>s.records.late.unknown_qualifier='changed',s=>s.records['home-D00'].content+='changed',s=>s.jobs[ds[0].job.id].execution_deadline_at=s.jobs[ds[0].job.id].execution_started_at,s=>s.records[ds[0].target.id].scoped_context_target.delivery_schema=scoped.CORPUS_DELIVERY]){const bad=inheritSnapshots(state,structuredClone(state));edit(bad);assert.throws(()=>scoped.validateCorpusPreservation(bad,{integration_review_id:final.review.id}),/hold|changed/i);}
 for(const native of [f.session_id,'historical-producer',irs[0].job.native_id])assert.throws(()=>scoped.validateScopedNativeAdmission(state,state.jobs[ds[0].job.id],native),/hold/i);
 for(const edit of [r=>delete r.delivery_schema,r=>r.mappings.pop(),r=>r.mappings[0].conditions='',r=>r.mappings[0].unresolved_outcomes='',r=>r.interaction_completeness.undeclared_complete=false]){const result=structuredClone(ds[0].review.qualification_result);edit(result);assert.throws(()=>scoped.validateScopedResponse(state,state.jobs[ds[0].job.id],scoped.scopedAssignment(state,state.jobs[ds[0].job.id]),ds[0].job.native_id,result,ds[0].job.qualification_delivery),/hold/i);}
 await assert.rejects(run(f,{...args[1],extraction_review_ids:args[1].extraction_review_ids.slice(1)}),/missing complete body extraction|selection body|selection extraction|missing canonical primary/);
 const expanded=await run(f,{...args[1],raw_review_ids:[args[1].extraction_review_ids[0]]},{review:fitReview});assert.equal(expanded.job.status,'completed',expanded.job.error);assert.deepEqual(expanded.packet.raw_extractions[0].reviewed_unit_bundle,es.find(e=>e.review.id===args[1].extraction_review_ids[0]).review.reviewed_unit_bundle);
 await assert.rejects(run(f,{...args[1],raw_review_ids:['missing-review']}),/outside canonical/);
 await assert.rejects(run(f,{...args[1],delivery_schema:'unknown'}),/invalid corpus delivery|Invalid delivery_schema/);
 const blocked=await run(f,args[1],{review:p=>{const r=fitReview(p).qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL missing conditions and distant undeclared effect: request complete raw review '+args[1].extraction_review_ids[0]+' in a NEW target';r.blockers=[r.reason];return envelope(r);}});assert.equal(blocked.review.review.verdict,'Blocked');assert.throws(()=>scoped.validateCorpusPreservation(read(f),{integration_review_id:final.review.id}),/negative|governing/i);
 t.diagnostic(JSON.stringify({fictional_only:true,domain_packets:ds.map(d=>bytes(d.packet)),native_requests:[...ds,...irs,final].map(d=>d.streamRequests.length),actual_native_fit:null,semantic_acceptance:false}));
});

test('issued marked and unmarked packet bytes equal the seeded implementation',async t=>{
 const baselinePath=process.env.CORPUS_FIT_BASELINE??new URL('../evals/corpus-fit-delivery/before-fit-scoped-context.mjs',import.meta.url);
 const runtime=new URL('../plugins/soloco/runtime/',import.meta.url);
 const baselineSource=fs.readFileSync(baselinePath,'utf8').replace(/from '(\.\/[^']+)'/g,(_m,p)=>"from '"+new URL(p,runtime).href+"'");
 const baselineFile=path.join(tmp,'before-fit-'+digest(baselineSource)+'.mjs');fs.writeFileSync(baselineFile,baselineSource);
 const baseline=await import(pathToFileURL(baselineFile).href);
 const {f}=await semanticFixture();
 // Issue the genuine incoming inline plan BEFORE any receipts. Replaying current
 // descriptor receipts in the old implementation would not test compatibility.
 mutate(f,s=>{const record=s.records[f.plan_id],c=resolveSnapshot(s,record.scoped_context_plan.capsule);
  const original=inheritSnapshots(s,resolveSnapshot(s,c.original));
  const issued=baseline.captureScopedPlan(original,{source_id:'old',partitioner:scoped.CORPUS_PARTITIONER,selected_source_ids:c.selected_sources,semantic_partition:c.semantic_partition});
  record.scoped_context_plan=issued;
 });
 const es=await extracts(f),q=scoped.inspectCorpusWorkload(read(f),{plan_id:f.plan_id}).selections[0];
 for(const legacy of [false,true]){
  const d=await run(f,{phase:'applicability',selection_ids:[q.id],extraction_review_ids:es.filter(e=>q.intrinsic_batches.includes(e.target.target.unit_id)).map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM},{review:fitReview,legacy});assert.equal(d.job.status,'completed',d.job.error);
  const state=read(f),job=state.jobs[d.job.id],a=scoped.scopedAssignment(state,job),b=baseline.scopedAssignment(state,job);
  assert.equal(a.text,b.text);assert.equal(a.hash,b.hash);assert.deepEqual(a.stream.pages,b.stream.pages);assert.deepEqual(a.packet,b.packet);
 }
});

test('shared body under opposite qualifiers retains both exact locations and full unknown meaning',()=>{
 const body={id:'same-body',text:'Retry at most three times, subject to current permission.'};
 const logical={sections:[{group_id:'one-body',body}],occurrences:[
  {id:'physical-available',path:'/records/a/body',qualifier_groups:['remaining-allowance'],body_id:'same-body'},
  {id:'physical-exhausted',path:'/records/b/body',qualifier_groups:['exhausted-renewal-required'],body_id:'same-body'}],
  qualifier_meaning:{'remaining-allowance':'Only while allowance remains; no renewed authority.','exhausted-renewal-required':'Allowance EXHAUSTED; renewal required; distant outcome UNKNOWN; prior attempt FAILED.'},
  result:{summary:'Conditions remain separate; no unconditional retry.',unknown_future_field:{text:'Keep this full future condition.',value:['OPEN','Blocked']}}};
 const encoded=scoped.factorCorpusStructure(logical),expanded=scoped.expandCorpusStructure(encoded);
 assert.deepEqual(expanded,logical);assert.notEqual(expanded.occurrences[0].path,expanded.occurrences[1].path);
 for(const text of ['EXHAUSTED','UNKNOWN','FAILED','renewal required','Keep this full future condition.'])assert.ok(JSON.stringify(encoded).includes(text));
 const omitted=structuredClone(logical);omitted.occurrences.pop();assert.throws(()=>scoped.validateCorpusStructure(scoped.factorCorpusStructure(omitted),logical),/omission/);
});

test('readable path trie, ordered row templates, exact ordinal runs and all marker collisions',()=>{
 const ids=['coherent-occurrence-0','coherent-occurrence-1','coherent-occurrence-2','coherent-occurrence-8','coherent-occurrence-8','coherent-occurrence-7','coherent-occurrence-9','coherent-occurrence-10'];
 const collisions=['$r','$literal','$row','$ids','$path'].map(k=>({[k]:[99,{unknown:true}],other:'literal data'}));
 const paths=['','/','//','/a~1b/~0/~01//','/a~1b/~0/~01//x','/a~1b/~0/~01//y','/~2/raw~escape/','/','/0/00'];
 const rows=paths.map((path,n)=>n%2?{path,id:'physical-'+n,unknown:collisions[n%5],qualifier_groups:ids}:{id:'physical-'+n,path,qualifier_groups:ids,unknown:collisions[n%5]});
 const logical={occurrences:rows,occurrence_ids:ids,unknown:collisions,semantic:{text:'Complete condition remains readable; no retry.',scope:'*'}};
 const encoded=scoped.factorCorpusStructure(logical);assert.deepEqual(scoped.expandCorpusStructure(encoded),logical);assert.equal(scoped.validateCorpusStructure(encoded,logical),true);
 assert.ok(encoded.paths.some(p=>p?.[1]==='a~1b'));assert.ok(encoded.paths.some(p=>p?.[1]===''));assert.ok(encoded.fields.length>=2);assert.ok(JSON.stringify(encoded).includes('"$ids"'));assert.ok(JSON.stringify(encoded).includes('Complete condition remains readable'));
 for(const edit of [p=>p.paths.push([p.paths.length,'cycle']),p=>{p.paths[1]=[999,'missing'];},p=>{p.fields[0].reverse();},p=>{p.fields[0].pop();},p=>{p.tables.push({$ids:['coherent-occurrence-',[[4,2]]]});},p=>{p.tables.push({$row:[999,[]]});}]){const bad=structuredClone(encoded);edit(bad);assert.throws(()=>scoped.expandCorpusStructure(bad),/hold/i);}
 const leading={occurrence_ids:['coherent-occurrence-00','coherent-occurrence-01','coherent-occurrence-02']};assert.deepEqual(scoped.expandCorpusStructure(scoped.factorCorpusStructure(leading)),leading);assert.ok(!JSON.stringify(scoped.factorCorpusStructure(leading).logical_packet).includes('$ids'));
});

test('repeated complete physical edges share metadata without merging source or route meaning',t=>{
 const document={kind:'snapshot-original',sha256:'a'.repeat(64),root:123};
 const edges=Array.from({length:100},(_,n)=>({document,path:'/records/shared/long/common/prefix/'+n+'/raw~1key//~0',kind:'source-reference',reference:{id:'target-'+n,revision:1},target:{document,path:'/records/target/'+n},unknown_future:{qualifier:'Retain complete route condition.'}}));
 const make=n=>({incidence:{sources:Array.from({length:n},(_,i)=>({source_id:'distinct-source-'+i,conservative:i%2===0,references:[...edges.slice(i%100),...edges.slice(0,i%100)]}))},occurrence_ids:Array.from({length:1000},(_,i)=>'coherent-occurrence-'+i),semantic:{text:'EXHAUSTED; UNKNOWN; FAILED; opposite qualifiers remain binding.'}});
 for(const n of [1,40,120]){const logical=make(n),encoded=scoped.factorCorpusStructure(logical);assert.deepEqual(scoped.expandCorpusStructure(encoded),logical);assert.equal(scoped.validateCorpusStructure(encoded,logical),true);const expanded=scoped.expandCorpusStructure(encoded);assert.equal(expanded.incidence.sources.length,n);assert.equal(expanded.incidence.sources.at(-1).references.length,100);if(n>1)assert.ok(bytes(encoded)<bytes(logical)/4);t.diagnostic(JSON.stringify({fictional_fixed_meaning:true,sources:n,physical_edge_copies:n*100,logical_bytes:bytes(logical),factored_bytes:bytes(encoded),path_nodes:encoded.paths.length,field_templates:encoded.fields.length,shared_entries:encoded.tables.length}));}
});

test('unknown whole-corpus scope cannot compose a section lacking primary canonical support',async()=>{
 const f=fixture({deferPlan:true,extra:{historical:'HISTORICAL_UNKNOWN_EXHAUSTED '+('complete historical clause '.repeat(5000))}});
 const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old']});f.plan_id=p.id;
 const units=unitPages(f);assert.ok(units.length>1);
 const first=await run(f,{phase:'extract',unit_id:units[0].id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(first.job.status,'completed',first.job.error);
 await assert.rejects(run(f,{phase:'applicability',delivery_schema:fit,delivery_protocol:scoped.SCOPED_STREAM,extraction_review_ids:[first.review.id],counterpart_ids:['home-D00'],context_scope:'*'}),/missing canonical primary extraction support.*Blocked.*wider new target/);
});


test('public corpus delivery options reject legacy or read-only actions instead of silently ignoring them',async()=>{
 const f=fixture({deferPlan:true}),common={root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction};
 for(const action of ['inspect','read','plan','apply','revoke'])for(const option of [{delivery_schema:fit},{raw_review_ids:[]}])
  await assert.rejects(publicCall('company_context',{...common,action,...option},'codex'),/new scoped target/);
 await assert.rejects(publicCall('company_context',{...common,action:'target',protocol:'operating-state-v1',delivery_schema:fit},'codex'),/new scoped target/);
 await assert.rejects(publicCall('company_context',{...common,action:'target',plan_id:'missing',delivery_schema:fit,raw_review_ids:['missing-review']},'codex'),/missing source|hold/i);
});
