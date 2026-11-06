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
const protocol=scoped.SCOPED_PROTOCOL,sha=v=>digest(JSON.stringify(v)),bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coherent-runtime-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('contract.fixture',s=>{fn(s);return s;}));
const read=f=>withStore(f.root,db=>db.read());
const call=(f,args)=>engine.contextControl({...f,...args},'codex');
const token=(domain,n,status='OPEN')=>`OBL~${domain}~${String(n).padStart(3,'0')}~CUSTOMER_${n}_NO_EXPORT_ABOVE_${17*n+3}_ROWS_UNTIL_CONSENT_${n%7}_IN_REGION_${n%11}~${status}~END`;
function fixture({count=1,domains=1,extra={},maintenance=false,kind='artifact',homeKind='artifact',operating=false,partitioner=scoped.COHERENT_PARTITIONER}={}){
  const root=fs.mkdtempSync(path.join(tmp,'company-')),session_id=id('owner'),f={root,session_id,epoch:1,source_instruction:'Explicit fixture instruction: qualify exact source read-only, preserve all failed evidence and OPEN uncertainty.'};
  engine.bind(root,session_id,'codex');engine.open({...f,idea:'Source-only contract fixture'},'codex');withStore(root,db=>db.migrate());
  const clauses=Array.from({length:count},(_,n)=>token('D'+String(Math.min(domains-1,Math.floor(n*domains/count))).padStart(2,'0'),n));
  mutate(f,s=>{s.roles={qa:{name:'Independent QA'},engineer:{name:'Engineer'}};s.governance='Preparation only. No execution or renewed allowance.';s.cos_instructions='Preserve uncertain effects and exhausted allowances.';s.records.old={id:'old',kind,revision:1,author_instance:'historical-producer',content:'Historical evidence grants no current permission.',clauses,...extra};if(maintenance)s.paused=true;s.team_sha256=teamHash(s);});
  for(let d=0;d<domains;d++){const domain='D'+String(d).padStart(2,'0');engine.save({...f,id:'home-'+domain,kind:homeKind,content:clauses.filter((_,n)=>Math.min(domains-1,Math.floor(n*domains/count))===d).join('\n')||'No additional obligation.',context_obligations:{version:1,scope:domain},...(operating?{operating_record:{version:1,kind:'obligation',scope:domain,owner:'runner',conditions:'Always',exceptions:'None',clearing:'Independent review',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['home-'+domain]}}:{})},'codex');}
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
    r.mappings=all.map(({key})=>({item:key,status:'represented',homes:p.homes.map(h=>h.source.id),reason:'Fictional complete source conditions preserved, with all occurrence differences and OPEN restrictions.'}));
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
  const ir=await run(f,{...args,interface_keys:keys});assert.equal(ir.job.status,'completed',ir.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00'],delivery_protocol:scoped.SCOPED_STREAM});assert.equal(i.job.status,'completed',i.job.error);
  return {d,ir,i};
}


function corpusFixture(repeats=1){
  const body={id:'shared-body',revision:1,content:'BODY_RULE: never export while OPEN; retries exhausted.'};
  const f=fixture({extra:{ancestor:'ALLOW only after new consent',copies:Array(repeats).fill(body)}});
  mutate(f,s=>{s.records['home-D00'].content+='\nBODY_RULE: never export while OPEN; retries exhausted.\nold: ALLOW only after new consent\nalias: DENY even with consent; distant exception remains OPEN\nNo execution permission.';s.records.alias={id:'alias',revision:1,kind:'artifact',ancestor:'DENY even with consent; distant exception remains OPEN',copies:Array(repeats).fill(body)};});
  const p=call(f,{action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'old',selected_source_ids:['old','alias']});f.plan_id=p.id;
  return f;
}
function corpusReview(p){
  const e=contractReview(p);
  if(p.phase==='applicability'){
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
  const ir=await run(f,{...args,interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)},{review:corpusReview});assert.equal(ir.job.status,'completed',ir.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00'],delivery_protocol:scoped.SCOPED_STREAM});assert.equal(i.job.status,'completed',i.job.error);
  return {d,ir,i};
}
test('FICTIONAL public corpus adapter shares intrinsic receipts but independently reviews both source claims',async()=>{
  const f=corpusFixture(),first=f.plan_id;
  const es=[];for(const u of unitPages(f)){const e=await run(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}
  const a=await corpusFinish(f,es);
  const p=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'plan',protocol,partitioner:scoped.CORPUS_PARTITIONER,source_id:'alias',corpus_plan_id:first},'codex');f.plan_id=p.id;
  const state=read(f);assert.deepEqual(state.records[first].scoped_context_plan.capsule,state.records[p.id].scoped_context_plan.capsule);
  for(const u of unitPages(f)){const reused=call(f,{action:'target',phase:'extract',unit_id:u.id});assert.equal(reused.reused,true);assert.equal(reused.review_id,es.find(e=>e.target.target.unit_id===u.id).review.id);}
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[a.d.review.id],interface_review_ids:[a.ir.review.id],counterpart_ids:['home-D00']}),/another source claim/);
  const b=await corpusFinish(f,es);
  assert.notEqual(a.d.job.native_id,b.d.job.native_id);assert.notEqual(a.ir.job.native_id,b.ir.job.native_id);
  for(const [claim,q] of [['old',a],['alias',b]])assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:q.i.review.id}).source.id,claim);
  for(const e of [...es,a.d,a.ir,a.i,b.d,b.ir,b.i]){assert.ok(e.streamRequests.every(w=>bytes(w)<=48000));assert.ok(bytes(JSON.parse(e.review.qualification_output))<=12000);assert.ok(bytes(e.review.qualification_output)<=48000);assert.ok(e.job.timeout_ms<=600000);}
  const original=read(f);
  for(const change of [s=>s.records.alias.ancestor='changed',s=>s.records.newSource={id:'newSource',revision:1,content:'unknown'},s=>s.records[first].unknown_qualifier='No permission',s=>s.records.alias.copies.pop(),s=>{const v=s.records[first].scoped_context_plan,c=resolveSnapshot(s,v.capsule);c.original=retainSnapshot(s,{});v.capsule=retainSnapshot(s,c);},s=>s.jobs[es[0].job.id].coordination_release.termination_confirmed=false]){
    const bad=inheritSnapshots(original,structuredClone(original));change(bad);assert.throws(()=>scoped.validateScopedApply(bad,{integration_review_id:a.i.review.id}),/changed|membership|unproven|hold/i);
  }
  // Publication is exact-source only; the other claim remains independently required.
  const applied=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:a.i.review.id},'codex');assert.equal(applied.applied,true);
  assert.equal(read(f).context_classifications.alias,undefined);
  // A retained failed judgment on the other alias fences this source too.
  const denied=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM},{review:p=>{const e=corpusReview(p),r=e.qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL conflicting distant authority remains unresolved';r.blockers=[r.reason];return envelope(r);}});
  assert.equal(denied.review.review.verdict,'Blocked');
  assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:a.i.review.id}),/negative|governing/);

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
