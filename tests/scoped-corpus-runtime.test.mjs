import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
    const all=p.extractions.flatMap(e=>e.items.map(item=>({key:e.review.id+'/'+item.id,item}))).filter(i=>p.item_keys.includes(i.key));
    r.summary='FICTIONAL ADAPTER: all fixture occurrences and inbound contexts reconciled; all restrictions remain OPEN.';
    r.mappings=all.flatMap(({key})=>(p.corpus_claim?p.corpus_claim.selected_source_ids:[null]).map(sourceId=>({item:key,...(p.corpus_claim?{source_ids:[sourceId],occurrence_ids:p.mapping_occurrence_ids,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'FICTIONAL contextual judgment for '+sourceId+': '+(sourceId==='alias'?'DENY even with consent':'ALLOW only after new consent')+'; every distinct physical ancestor remains binding; LATE_NO_EXPORT overrides all local permission.',unresolved_outcomes:'OPEN remains OPEN; failures retained; retries exhausted; no execution or export permission.'}:{}),...(p.mapping_selection_ids?{selection_ids:p.mapping_selection_ids}:{}),status:'represented',homes:p.homes.map(h=>h.source.id),reason:'Fictional complete source conditions preserved, with all occurrence differences and OPEN restrictions.'})));
    if(p.corpus_claim?.selected_source_ids?.length===1)for(const mapping of r.mappings){mapping.source_set=structuredClone(p.mapping_sets.source_set);delete mapping.source_ids;}
    r.interfaces=p.interface_keys.length?[]:all.flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));
    r.reviewed_interfaces=p.interface_keys;
    if(JSON.stringify(p.extractions).includes('LATE_NO_EXPORT')&&!p.homes.some(h=>h.value.content.includes('LATE_NO_EXPORT'))){r.verdict='Blocked';r.permitted_action='hold';r.reason='Fictional late qualifier missing from current home';r.blockers=[r.reason];}
  }else{r.summary='FICTIONAL ADAPTER: independently scripted complete integration, no action permission.';r.unreviewed_interfaces=[];}
  return envelope(r);
}
async function run(f,args,{review=contractReview,native,modelHook,streamHook,omitTiming=false}={}){
  const t=call(f,{action:'target',...args,plan_id:args.plan_id??f.plan_id});if(t.reused)return t;
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
    if(modelHook)await modelHook(packet);
    return {native_id:native??'contract-native-'+queued.id,text:JSON.stringify(review(packet))};
  });
  const s=read(f),j=s.jobs[queued.id];return {target:t,job:j,review:s.records[j.artifact_id],streamRequests,packet:streamRequests.length?(j.status==='completed'?JSON.parse(streamParts.join('')):null):j.qualification_delivery&&JSON.parse(j.qualification_delivery.wire)};
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


function corpusFixture(repeats=1){
  const body={id:'shared-body',revision:1,content:'BODY_RULE: never export while OPEN; retries exhausted.'};
  const f=fixture({deferPlan:true,operating:true,extra:{ancestor:'ALLOW only after new consent',copies:Array(repeats).fill(body)}});
  mutate(f,s=>{s.records['home-D00'].content+='\nBODY_RULE: never export while OPEN; retries exhausted.\nold: ALLOW only after new consent\nalias: DENY even with consent; distant exception remains OPEN\nNo execution permission.';s.records.alias={id:'alias',revision:1,kind:'artifact',ancestor:'DENY even with consent; distant exception remains OPEN',copies:Array(repeats).fill(body)};});
  mutate(f,s=>{const original=retainSnapshot(s,{id:'shared-original',content:'GLOBAL ORIGINAL: failure retained; retries exhausted; no export.'});s.records.old.archive=original;s.records.alias.archive=original;s.records.late={id:'late',revision:1,kind:'decision',unknown_qualifier:'LATE_NO_EXPORT global prohibition'};s.records['home-D00'].content+=' LATE_NO_EXPORT global prohibition; GLOBAL ORIGINAL: failure retained; retries exhausted; no export.';});
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old','alias']});f.plan_id=p.id;
  return f;
}
function corpusReview(p){
  const e=contractReview(p);
  if(p.phase==='applicability'){
    assert.deepEqual(p.corpus_claim.selected_source_ids,['old','alias']);
    assert.equal(p.occurrence_context.source.id,p.source.id);
    const wire=JSON.stringify(p.occurrence_context);
    assert.ok(wire.includes('ALLOW only after new consent'));
    assert.ok(wire.includes('DENY even with consent'));
    assert.ok(p.occurrence_context.occurrences.length>0);
    const homes=p.homes.map(h=>h.value.content).join('\n');
    for(const required of ['BODY_RULE: never export while OPEN; retries exhausted.','old: ALLOW only after new consent','alias: DENY even with consent; distant exception remains OPEN'])assert.ok(homes.includes(required));
    e.qualification_result.summary='FICTIONAL: '+p.source.id+' independently preserves opposite ancestors; DENY and OPEN confer no permission.';
  }
  return e;
}
async function corpusFinish(f,es){
  const args={phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM};
  const d=await run(f,args,{review:corpusReview});assert.equal(d.job.status,'completed',d.job.error);
  const ir=await run(f,{...args,domain_review_ids:[d.review.id],interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)},{review:corpusReview});assert.equal(ir.job.status,'completed',ir.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00'],delivery_protocol:scoped.SCOPED_STREAM});assert.equal(i.job.status,'completed',i.job.error);
  return {d,ir,i};
}
test('FICTIONAL public vector pipeline shares extraction, independently judges context, aggregates once and applies atomically',async()=>{
  const f=corpusFixture(),first=f.plan_id;
  const es=[];for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}
  const a=await corpusFinish(f,es);
  const proof=scoped.validateCorpusPreservation(read(f),{integration_review_id:a.i.review.id});
  assert.equal(proof.protocol,scoped.CORPUS_PRESERVATION);assert.deepEqual(proof.selected_source_ids,['old','alias']);
  assert.deepEqual(proof.source_mappings.map(m=>m.source.id),['old','alias']);
  assert.notEqual(a.d.job.native_id,a.ir.job.native_id);assert.notEqual(a.ir.job.native_id,a.i.job.native_id);
  assert.ok(a.ir.packet.domain_conclusions.some(d=>d.review.id===a.d.review.id));
  assert.deepEqual(a.i.packet.source_mappings,proof.source_mappings);
  for(const e of [...es,a.d,a.ir,a.i]){assert.ok(e.streamRequests.every(w=>bytes(w)<=48000));assert.ok(bytes(JSON.parse(e.review.qualification_output))<=12000);assert.ok(bytes(e.review.qualification_output)<=48000);assert.ok(e.job.timeout_ms<=600000);}
  assert.ok(a.i.packet.complete_corpus_context.evidence.snapshot_inbound.count>=2);
  assert.ok(a.i.packet.complete_corpus_context.evidence.collections.count>0);
  assert.ok(JSON.stringify(a.i.packet.domains??a.i.packet).includes('LATE_NO_EXPORT'));
  assert.ok(!Object.hasOwn(a.i.packet.complete_corpus_context,'sections'),'aggregate accounting does not replay raw accepted section bodies');
  const original=read(f),job=original.jobs[a.d.job.id],assignment=scoped.scopedAssignment(original,job);
  const referenced=structuredClone(a.d.review.qualification_result);
  for(const mapping of referenced.mappings){mapping.occurrence_set=structuredClone(a.d.packet.mapping_sets.occurrence_set);delete mapping.occurrence_ids;}
  assert.equal(scoped.validateScopedResponse(original,job,assignment,job.native_id,referenced,job.qualification_delivery),true);
  for(const change of [m=>m.occurrence_set.count++,m=>m.occurrence_set.sha256='0'.repeat(64),m=>m.occurrence_ids=['extra']]){const bad=structuredClone(referenced);change(bad.mappings[0]);assert.throws(()=>scoped.validateScopedResponse(original,job,assignment,job.native_id,bad,job.qualification_delivery),/hold/i);}
  const aggregateResult=structuredClone(a.i.review.qualification_result),aggregateAssignment=scoped.scopedAssignment(original,original.jobs[a.i.job.id]);
  for(const change of [r=>r.source_mappings_count++,r=>r.source_mappings_sha256='0'.repeat(64)]){const bad=structuredClone(aggregateResult);change(bad);assert.throws(()=>scoped.validateScopedResponse(original,original.jobs[a.i.job.id],aggregateAssignment,a.i.job.native_id,bad,a.i.job.qualification_delivery),/hold/i);}

  assert.equal(scoped.validateScopedResponse(original,job,assignment,job.native_id,a.d.review.qualification_result,job.qualification_delivery),true);
  for(const native of [f.session_id,'historical-producer',a.ir.job.native_id])assert.throws(()=>scoped.validateScopedNativeAdmission(original,job,native),/hold/i);
  for(const edit of [r=>r.selected_source_count++,r=>r.mappings[0].source_ids=[],r=>r.mappings[0].occurrence_ids.pop(),r=>r.mappings[0].typed_homes[0].kind='permission',r=>r.mapping_context_sha256='omitted ancestry',r=>r.interaction_completeness.declared_complete=false,r=>r.interaction_completeness.undeclared_complete=false,r=>r.interaction_completeness.global_complete=false,r=>delete r.interaction_completeness,r=>r.corpus_claim_sha256='borrowed single-source',r=>r.mappings[0].conditions='',r=>r.mappings[0].unresolved_outcomes='']){
    const result=structuredClone(a.d.review.qualification_result);edit(result);assert.throws(()=>scoped.validateScopedResponse(original,job,assignment,job.native_id,result,job.qualification_delivery),/hold/i);
  }
  for(const change of [s=>s.context_classifications={alias:{disposition:'current'}},s=>s.records.alias.ancestor='changed',s=>s.records.newSource={id:'newSource',revision:1,content:'unknown'},s=>s.records[first].unknown_qualifier='No permission',s=>s.records.alias.copies.pop(),s=>s.records['home-D00'].content+='changed',s=>{const v=s.records[first].scoped_context_plan;v.selected_source_ids.pop();},s=>{const v=s.records[first].scoped_context_plan,c=resolveSnapshot(s,v.capsule);c.original=retainSnapshot(s,{});v.capsule=retainSnapshot(s,c);},s=>s.jobs[es[0].job.id].coordination_release.termination_confirmed=false,s=>s.jobs[a.ir.job.id].qualification_delivery.complete=false,s=>s.jobs[a.ir.job.id].native_id=a.d.job.native_id,s=>s.jobs[a.ir.job.id].rejected_output={text:'negative',qualification_negative:'Blocked'},s=>s.records.old.author_instance='changed producer',s=>s.upgrade_history=[{id:'new-upgrade',status:'recovered'}]]){
    const bad=inheritSnapshots(original,structuredClone(original));change(bad);assert.throws(()=>scoped.validateCorpusPreservation(bad,{integration_review_id:a.i.review.id}),/changed|membership|unproven|hold/i);
  }
  mutate(f,s=>{s.records.alias.ancestor+=' CHANGED';});
  await assert.rejects(publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:a.i.review.id},'codex'),/hold/i);assert.equal(read(f).context_classifications?.old,undefined);
  mutate(f,s=>{s.records.alias.ancestor=original.records.alias.ancestor;});
  const applied=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:a.i.review.id},'codex');assert.equal(applied.applied,true);
  const state=read(f);assert.equal(Object.keys(state.context_classifications).length,1);assert.equal(state.context_classifications.alias,undefined);
  const view=reviewedContext(state);for(const id of ['old','alias']){assert.equal(view.excluded(id),true);const c=classificationFor(state,state.records[id],id);assert.equal(c.corpus_qualification.protocol,scoped.CORPUS_PRESERVATION);assert.equal(c.scoped_qualification,undefined);}
  assert.deepEqual(view.scopedHomes.get('home-D00'),['*']);
  assert.throws(()=>scoped.validateScopedExclusion(state,proof),/missing|changed/);
  for(const edit of [p=>p.selected_source_ids.pop(),p=>p.source_mappings.pop(),p=>p.domain_mappings[0].mappings[0].source_ids.pop(),p=>p.home_scopes[0].scopes=['local'],p=>p.protocol=scoped.SCOPED_PROTOCOL]){const bad=inheritSnapshots(state,structuredClone(state));edit(bad.context_classifications.old.scoped_qualification);assert.throws(()=>reviewedContext(bad),/hold|changed|missing|identity/i);}
  const denied=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM},{review:p=>{const e=corpusReview(p),r=e.qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL conflicting distant authority remains unresolved';r.blockers=[r.reason];return envelope(r);}});
  assert.equal(denied.review.review.verdict,'Blocked');assert.throws(()=>scoped.validateCorpusPreservation(read(f),{integration_review_id:a.i.review.id}),/negative|governing/);
});
test('corpus growth deduplicates intrinsic sections while keeping all repeated physical obligations unaccepted',t=>{
  const one=corpusFixture(1),ten=corpusFixture(10);
  const inspect=f=>{const s=read(f),v=s.records[f.plan_id].scoped_context_plan,c=resolveSnapshot(s,v.capsule);return {v,m:resolveSnapshot(s,c.projection)};};
  const a=inspect(one),b=inspect(ten);
  const body=m=>m.groups.filter(g=>g.section.body?.id==='shared-body');
  assert.equal(body(a.m).length,1);assert.equal(body(b.m).length,1);
  assert.ok(b.m.occurrences.filter(o=>o.group_id===body(b.m)[0].id).length>=20);
  assert.ok(b.v.units.length<a.v.units.length*10);
  assert.equal(b.m.semantic_acceptance,false);
  t.diagnostic(JSON.stringify({fictional_only:true,one:{intrinsic_batches:a.v.units.length,shared_body_sections:body(a.m).length,physical_occurrences:a.m.occurrences.length},ten:{intrinsic_batches:b.v.units.length,shared_body_sections:body(b.m).length,physical_occurrences:b.m.occurrences.length},semantic_acceptance:false}));
  assert.throws(()=>call(ten,{action:'target',phase:'extract',unit_id:b.v.units[0].id+'/0'}),/no range subdivision/);
  assert.throws(()=>call(ten,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'home-D00',corpus_plan_id:ten.plan_id}),/selected corpus membership/);
});

test('corpus retains external named handover originals and refuses missing closure',()=>{
  const f=fixture();
  mutate(f,s=>{const original={company_id:s.id,records:{prior:{id:'prior',revision:1,content:'NAMED ORIGINAL: denied, unknown, exhausted'}},jobs:{},messages:[],notices:[]};
    const h=sha(original);s.records.named={id:'named',revision:1,handover:{subject:retainSnapshot(s,original),subject_sha256:h}};
    s.records.old.locator={retained_handover_subject:{record_id:'named',sha256:h}};
  });
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old']});
  const state=read(f),v=state.records[p.id].scoped_context_plan,c=resolveSnapshot(state,v.capsule),m=resolveSnapshot(state,c.projection);
  assert.ok(m.originals.length);assert.ok(JSON.stringify(m).includes('NAMED ORIGINAL'));
  assert.ok(m.sources.some(r=>r.source.id==='named'));
  const bad=inheritSnapshots(state,structuredClone(state));delete bad.records.named;
  assert.throws(()=>scoped.scopedPlanView(bad,{plan_id:p.id}),/missing|changed/);
});


async function acceptedOperatingCorpus({upgrade=false}={}){
 const f=fixture({operating:true,deferPlan:true});
 const sourceId=upgrade?'upgrade:recovered-corpus':'old';
 mutate(f,s=>{
  if(upgrade){delete s.records.old;s.upgrade={id:'recovered-corpus',status:'recovered',epoch:1,host:'codex',error:'FICTIONAL prior QA failed; unknown effects; no retry',probe_status:'failed',review_status:'failed',probe_native_id:'fictional-upgrade-producer',checkpoint:retainSnapshot(s,{content:'RAW-CORPUS-ORIGINAL: failed evidence retained; no renewed allowance.'})};}
  else s.records.old.archive=retainSnapshot(s,{content:'RAW-CORPUS-ORIGINAL: all restrictions and distant exceptions remain OPEN.'});
  const h=s.records['home-D00'];h.content+=' Complete failed outcome remains failed, effects unknown, retries exhausted; current independent resume_handover required.';
  Object.assign(h.operating_record,{evidence_refs:[sourceId],kind:'permission',remaining:0,revoked:true,grant_refs:[sourceId]});
  s.records['home-outcome']={id:'home-outcome',revision:1,kind:'artifact',author_instance:f.session_id,content:'FICTIONAL failed attempt remains failed, effects unknown; current independent resume_handover required.',context_obligations:{version:1,scope:'*'},operating_record:{version:1,kind:'outcome',scope:'*',owner:'runner',conditions:'While unreconciled',exceptions:'None',clearing:'Independent reconciliation',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:[sourceId],attempted_action:'Failed fictional rehearsal',resources:['fictional source'],possible_effects:'Unknown partial effects',uncertainty:'Prior QA remains failed',retry_clearing:'Fresh canonical authority and independent resume_handover required',historical_receipts:[sourceId]}};
 });
 await assert.rejects(publicCall('company_context',{...f,protocol:'operating-state-v1',action:'plan'},'codex'),/canonical snapshot delivery/);
 const p=await publicCall('company_context',{...f,action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:sourceId,selected_source_ids:[sourceId]},'codex');f.plan_id=p.id;
 const es=[];for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}
 const args={phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00','home-outcome'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM};
 const d=await run(f,args),ir=await run(f,{...args,domain_review_ids:[d.review.id],interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)});
 const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00','home-outcome'],delivery_protocol:scoped.SCOPED_STREAM});
 for(const r of [d,ir,i])assert.equal(r.job.status,'completed',r.job.error);
 const proof={d,ir,i};
 assert.equal((await publicCall('company_context',{...f,action:'apply',integration_review_id:proof.i.review.id},'codex')).applied,true);
 return {f,sourceId,proof,es};
}
async function operatingReview(f,plan,native='fictional-operating-corpus-native'){
 const queued=engine.dispatch({...f,role:'qa',review_of:plan,task:'FICTIONAL complete current operating meaning contract'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
 const context=assignmentContext(read(f),read(f).jobs[queued.id]);
 const packet=context.frozen_packet??JSON.parse(context.text),e=context.operating_evidence;
 const ranges=e?Object.values(e.sources).flatMap(v=>{const out=[];for(let offset=0;offset<v.length;offset+=16000)out.push({source_id:v.source_id,sha256:v.sha256,offset,length:Math.min(16000,v.length-offset)});return out;}):[];
 let first=true;await work(f.root,queued.id,async(_h,_n,_p,_d,timeout,_s,options)=>{
  if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
  if(ranges.length)return {native_id:native,text:JSON.stringify({reads:ranges.splice(0,1)})};
  return {native_id:native,text:JSON.stringify({content:'FICTIONAL ADAPTER: scripted complete current meaning, never live QA.',messages:[],notices:[],review:{verdict:'Pass',reason:'FICTIONAL current meaning contract',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[plan].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
 });
 const j=read(f).jobs[queued.id];assert.equal(j.status,'completed',j.error);return {j,packet};
}
test('FICTIONAL corpus preservation feeds independently reviewed operating publication, never a borrowed scoped receipt',async()=>{
 for(const upgrade of [false,true]){
  const {f,sourceId,proof}=await acceptedOperatingCorpus({upgrade});
  const stored=read(f).context_classifications[sourceId].scoped_qualification;
  assert.equal(stored.protocol,scoped.CORPUS_PRESERVATION);
  assert.equal(stored.operating_integration.status,'requires_independent_publication');assert.equal(stored.operating_integration.interface,'validateCorpusPreservation');
  assert.deepEqual(scoped.validateCorpusPreservation(read(f),{integration_review_id:proof.i.review.id}),stored);
  const proposal=await publicCall('company_context',{...f,protocol:'operating-state-v1',action:'plan'},'codex');assert.equal(proposal.held,false,JSON.stringify(proposal.frontier));
  const qa=await operatingReview(f,proposal.id);assert.equal(qa.packet.required_evidence.accepted_semantics.filter(x=>x.corpus_integration?.id===proof.i.review.id).length,1);
  assert.ok(!JSON.stringify(qa.packet).includes('RAW-CORPUS-ORIGINAL'));
  assert.equal((await publicCall('company_context',{...f,protocol:'operating-state-v1',action:'apply',plan_id:proposal.id,review_id:qa.j.artifact_id},'codex')).published,true);
  assert.ok(operatingContext(read(f)).homes.some(h=>h.source.id==='home-outcome'));
 }
});

// Selection tests remain fictional contracts, never model-authored acceptance.
async function semanticFixture(){
  const {buildLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');
  const f=fixture({domains:3});
  mutate(f,s=>{delete s.records[f.plan_id];
    s.records.old={id:'old',revision:1,kind:'artifact',content:'GLOBAL: no execution; exact v0.18 gate remains.',locals:[
      {id:'local-a',ancestor:'ALLOW only after consent',body:{id:'shared',content:'SAME_BODY remains OPEN'}},
      {id:'local-b',ancestor:'DENY even with consent',body:{id:'shared',content:'SAME_BODY remains OPEN'}}]};
    s.records.archive={id:'archive',revision:1,kind:'artifact',content:'UNRELATED_ARCHIVE '+('archive evidence '.repeat(250))};
    s.records.late={id:'late',revision:1,kind:'decision',unknown_qualifier:'LATE_NO_EXPORT global prohibition'};
    for(const h of ['home-D00','home-D01','home-D02'])s.records[h].content='GLOBAL: no execution; LATE_NO_EXPORT; SAME_BODY remains OPEN; ALLOW only after consent; DENY even with consent; archive retained.';
  });
  const material=buildLegacyCoherentPlan(read(f));
  const selections=['global','A','B','archive'].map(id=>({id,scope:id==='global'?'*':id,occurrence_ids:[],incident_ids:[]}));
  for(const o of material.occurrences){const key=o.path.startsWith('/records/old/locals/0')||o.path.startsWith('/records/home-D00')?'A':o.path.startsWith('/records/old/locals/1')||o.path.startsWith('/records/home-D01')?'B':o.path.startsWith('/records/archive')||o.path.startsWith('/records/home-D02')?'archive':'global';selections.find(q=>q.id===key).occurrence_ids.push(o.id);}
  const partition={plan_sha256:material.plan_sha256,selections};
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old'],semantic_partition:partition});f.plan_id=p.id;
  return {f,partition,material};
}
test('semantic selections complete canonical source apply with bounded independent local packets',async t=>{
  const {f,partition,material}=await semanticFixture(),before=JSON.stringify(read(f));
  const workload=await publicCall('company_context',{root:f.root,session_id:f.session_id,action:'inspect',plan_id:f.plan_id,section:'workload'},'codex');
  assert.equal(JSON.stringify(read(f)),before);assert.equal(workload.semantic_acceptance,false);assert.equal(workload.selections.length,4);assert.equal(workload.review_formula,'E+D+I+1');assert.equal(workload.total_selected_source_requests_lower_bound,workload.extraction.length+4+4+1);assert.equal(workload.complete_native_fit,null);
  t.diagnostic(JSON.stringify({fictional_only:true,workload}));
  const a=workload.selections.find(q=>q.id==='A');assert.ok(!a.incident_selection_ids.includes('archive'));
  const es=await extracts(f),byUnit=new Map(es.map(e=>[e.target.target.unit_id,e]));
  const ds=[],irs=[],domainArgs=[];
  for(const selection of workload.selections){
    const args={phase:'applicability',selection_ids:[selection.id],extraction_review_ids:selection.intrinsic_batches.map(id=>byUnit.get(id).review.id),counterpart_ids:[selection.id==='B'?'home-D01':selection.id==='archive'?'home-D02':'home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM};
    if(selection.id==='A')await assert.rejects(run(f,{...args,extraction_review_ids:args.extraction_review_ids.slice(1)}),/missing complete body extraction/);
    const d=await run(f,args);assert.equal(d.job.status,'completed',d.job.error);ds.push(d);domainArgs.push(args);
    if(selection.id==='A'){assert.ok(!JSON.stringify(d.packet).includes('UNRELATED_ARCHIVE'));assert.ok(JSON.stringify(d.packet).includes('LATE_NO_EXPORT'));assert.ok(JSON.stringify(d.packet).includes('ALLOW only after consent'));}
  }
  for(const [n,d] of ds.entries()){
    const ir=await run(f,{...domainArgs[n],counterpart_ids:['home-D00','home-D01','home-D02'],domain_review_ids:ds.map(d=>d.review.id),interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)});assert.equal(ir.job.status,'completed',ir.job.error);irs.push(ir);
    assert.ok(JSON.stringify(ir.packet.homes).includes('archive retained'));assert.ok(ir.packet.domain_conclusions.some(d=>d.review.id===ds[3].review.id));assert.ok(ir.packet.complete_corpus_context.evidence.sections.count>0);assert.equal(ir.packet.domain_conclusions.length,ds.length);
  }
  t.diagnostic(JSON.stringify({fictional_only:true,domain_packet_bytes:ds.map(d=>bytes(d.packet)),interface_packet_bytes:irs.map(d=>bytes(d.packet)),semantic_acceptance:false}));
  const integrationArgs={phase:'integration',delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:ds.map(d=>d.review.id),interface_review_ids:irs.map(d=>d.review.id),counterpart_ids:['home-D00','home-D01','home-D02']};
  await assert.rejects(run(f,{...integrationArgs,interface_review_ids:irs.slice(1).map(d=>d.review.id)}),/interface coverage/);
  const i=await run(f,integrationArgs);assert.equal(i.job.status,'completed',i.job.error);
  assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:i.review.id}).source.id,'old');
  const original=read(f);
  for(const edit of [s=>s.records.late.unknown_qualifier='new prohibition',s=>{delete s.records.late;},s=>{s.records.old.locals[0].body.content='changed physical body';},s=>s.records['home-D00'].context_obligations.scope='changed',s=>s.records.old.locals.pop(),s=>{s.records.new={id:'new',revision:1,content:'unknown neighbor'};},s=>{s.jobs[irs[0].job.id].coordination_release.termination_confirmed=false;},s=>{s.records[irs[0].review.id].author_instance='historical-producer';},s=>{delete s.records[irs[0].review.id];}]){const bad=inheritSnapshots(original,structuredClone(original));edit(bad);assert.throws(()=>scoped.validateScopedApply(bad,{integration_review_id:i.review.id}),/hold|changed|missing/i);}
  const {decodeLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');assert.equal(sha(decodeLegacyCoherentPlan(material).state),material.baseline.state_sha256);
  for(const edit of [p=>p.selections[0].occurrence_ids.pop(),p=>p.selections[1].incident_ids.push('B')]){const bad=structuredClone(partition);edit(bad);assert.throws(()=>scoped.validateCorpusPartition(material,bad),/occurrence|incident/);}
  assert.equal((await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:i.review.id},'codex')).applied,true);
  const denied=await run(f,{phase:'applicability',selection_ids:['A'],extraction_review_ids:a.intrinsic_batches.map(id=>byUnit.get(id).review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM},{review:p=>{const e=contractReview(p),r=e.qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL unresolved distant prohibition';r.blockers=[r.reason];return envelope(r);}});
  assert.equal(denied.review.review.verdict,'Blocked');assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:i.review.id}),/negative|governing/);
});

test('declared distant incident peer cannot be omitted by proposed local scope',async()=>{
  const {f}=await semanticFixture();
  const workload=scoped.inspectCorpusWorkload(read(f),{plan_id:f.plan_id}),a=workload.selections.find(q=>q.id==='A'),es=[];
  for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id},{review:p=>{const e=contractReview(p);if(JSON.stringify(p.reviewed_unit_bundle.primary).includes('ALLOW only after consent'))e.qualification_result.items[0].interfaces.push({id:'distant-peer',with_scope:'B',text:'Explicit interaction with B must be independently reconciled.'});return e;}});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}
  await assert.rejects(run(f,{phase:'applicability',selection_ids:['A'],extraction_review_ids:es.filter(e=>a.intrinsic_batches.includes(e.target.target.unit_id)).map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*'}),/omitted declared incident peer/);
});

test('nested formatting/escape variant file sections fit intrinsic batches without implying complete global request fit',async t=>{
  const {buildLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');
  const sources={'a.mjs':'a'.repeat(21650),'b.mjs':'b'.repeat(17056),'c.mjs':'c'.repeat(12952)};
  const content=JSON.stringify({left:{scope:'Consent exhausted.',sources},right:{scope:'Consent revoked.',sources},late_unknown:'LATE_NO_EXPORT'},null,2).replace('LATE_NO_EXPORT','\\u004cATE_NO_EXPORT');
  const f=fixture({deferPlan:true,extra:{content}}),m=buildLegacyCoherentPlan(read(f));
  const {decodeLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');
  assert.equal(decodeLegacyCoherentPlan(m).state.records.old.content,content);
  assert.ok(m.definitions.some(d=>d[0]==='json-text-string'&&d[2]===content));
  // Explicit fictional global proposal: size and file paths confer no locality.
  const partition={plan_sha256:m.plan_sha256,selections:[{id:'global',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old'],semantic_partition:partition});f.plan_id=p.id;
  const workload=scoped.inspectCorpusWorkload(read(f),{plan_id:p.id}),global=workload.selections[0];
  const extraction=await run(f,{phase:'extract',unit_id:workload.extraction[0].id,delivery_protocol:scoped.SCOPED_STREAM});
  assert.equal(extraction.job.status,'completed',extraction.job.error);assert.ok(extraction.streamRequests.length>1);
  assert.ok(extraction.streamRequests.every(w=>bytes(w)<=48000),'transport request bound remains unchanged for a complete multi-section batch');
  assert.equal(extraction.packet.reviewed_unit_bundle.primary.sections.length>1,true);
  assert.ok(global.context_bytes>48000);assert.ok(global.domain_request_lower_bound>48000);assert.ok(global.interface_request_lower_bound>48000);
  assert.equal(workload.complete_request_bytes,null);assert.equal(workload.native_context_fit,'unproven');
  assert.equal(workload.frontier_complete,false);assert.equal(workload.semantic_acceptance,false);
  const shared=m.groups.find(g=>g.section.body===sources['a.mjs']);
  assert.equal(m.occurrences.filter(o=>o.group_id===shared.id).length,2);
  const bad=structuredClone(partition);bad.selections[0].occurrence_ids.splice(bad.selections[0].occurrence_ids.indexOf(m.occurrences.find(o=>o.group_id===shared.id).id),1);
  assert.throws(()=>scoped.validateCorpusPartition(m,bad),/physical occurrence partition/);
  t.diagnostic(JSON.stringify({fictional_only:true,nested_sources_workload:workload}));
});

test('upgrade journal sections enter corpus workload with complete ordered membership and occurrence guards',async t=>{
  const {buildLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');
  const f=fixture({deferPlan:true});
  mutate(f,s=>{s.upgrade_history=[{id:'failed-attempt',status:'failed',candidate:{unknown:'No adoption'},previous:{unknown:'Revoked consent'},
    probe:{verdict:'Fail'},review:{verdict:'Blocked'},late_unknown:'LATE_NO_EXPORT',
    calls:Array.from({length:28},(_,n)=>({sequence:n,response:'failed '+String(n).padEnd(1900,'x')}))}];});
  const m=buildLegacyCoherentPlan(read(f)),journal=m.occurrences.find(o=>o.path==='/upgrade_history/0/calls'),group=m.groups.find(g=>g.id===journal.group_id);
  assert.equal(group.section.body.length,28);assert.deepEqual(group.section.cuts.map(c=>c.path),Array.from({length:28},(_,n)=>'/'+n));
  const partition={plan_sha256:m.plan_sha256,selections:[{id:'global',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'upgrade:failed-attempt',selected_source_ids:['upgrade:failed-attempt'],semantic_partition:partition});f.plan_id=p.id;
  const workload=scoped.inspectCorpusWorkload(read(f),{plan_id:p.id});
  assert.ok(workload.extraction.every(e=>e.body_bytes<48000));assert.equal(workload.semantic_acceptance,false);
  const bad=structuredClone(partition);bad.selections[0].occurrence_ids.splice(bad.selections[0].occurrence_ids.indexOf(journal.id),1);
  assert.throws(()=>scoped.validateCorpusPartition(m,bad),/physical occurrence partition/);
  t.diagnostic(JSON.stringify({fictional_only:true,journal_members:28,unique_sections:m.measurements.unique_sections,largest_intrinsic_packet:m.measurements.largest_packet_bytes,workload}));
});
