import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {withStore,digest,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {resolveSnapshot,inheritSnapshots,retainSnapshot,retainSnapshotEntry} from '../plugins/soloco/runtime/snapshot.mjs';
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
function fixture({count=1,domains=1,extra={},maintenance=false,kind='artifact',homeKind='artifact',operating=false,entry=false,evidenceOld=false,partitioner=scoped.COHERENT_PARTITIONER}={}){
  const root=fs.mkdtempSync(path.join(tmp,'company-')),session_id=id('owner'),f={root,session_id,epoch:1,source_instruction:'Explicit fixture instruction: qualify exact source read-only, preserve all failed evidence and OPEN uncertainty.'};
  engine.bind(root,session_id,'codex');engine.open({...f,idea:'Source-only contract fixture'},'codex');withStore(root,db=>db.migrate());
  const clauses=Array.from({length:count},(_,n)=>token('D'+String(Math.min(domains-1,Math.floor(n*domains/count))).padStart(2,'0'),n));
  mutate(f,s=>{s.roles={qa:{name:'Independent QA'},engineer:{name:'Engineer'}};s.governance='Preparation only. No execution or renewed allowance.';s.cos_instructions='Preserve uncertain effects and exhausted allowances.';s.records.old={id:'old',kind,revision:1,author_instance:'historical-producer',content:'Historical evidence grants no current permission.',clauses,...extra};if(entry)s.records.old=retainSnapshotEntry(s,s.records.old);if(maintenance)s.paused=true;s.team_sha256=teamHash(s);});
  for(let d=0;d<domains;d++){const domain='D'+String(d).padStart(2,'0');engine.save({...f,id:'home-'+domain,kind:homeKind,content:clauses.filter((_,n)=>Math.min(domains-1,Math.floor(n*domains/count))===d).join('\n')||'No additional obligation.',context_obligations:{version:1,scope:domain},...(operating?{operating_record:{version:1,kind:'obligation',scope:domain,owner:'runner',conditions:'Always',exceptions:'None',clearing:'Independent review',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:evidenceOld?['home-'+domain,'old']:['home-'+domain]}}:{})},'codex');}
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
async function finish(f,es,{probeMissing=true}={}){
  const args={phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*',delivery_protocol:scoped.SCOPED_STREAM};
  const d=await run(f,args);assert.equal(d.job.status,'completed',d.job.error);assert.equal(d.review.review.verdict,'Pass',d.review.content);
  const keys=d.review.qualification_result.interfaces.map(i=>i.key);
  if(probeMissing)await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}),/interface coverage/);
  const ir=await run(f,{...args,interface_keys:keys});assert.equal(ir.job.status,'completed',ir.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00'],delivery_protocol:scoped.SCOPED_STREAM});assert.equal(i.job.status,'completed',i.job.error);
  return {d,ir,i};
}

test('FICTIONAL ADAPTER: coherent public create/read -> worker -> independent interface -> canonical apply; repeats have separate provenance',async()=>{
  const body={id:'repeated',content:'No export while OPEN.'};
  const f=fixture({extra:{left:{id:'left',condition:'Consent exhausted.',body},right:{id:'right',condition:'Consent revoked.',body}}});
  const created=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,protocol,partitioner:scoped.COHERENT_PARTITIONER,source_id:'old',action:'plan'},'codex');f.plan_id=created.id;
  const page=await publicCall('company_context',{root:f.root,session_id:f.session_id,action:'inspect',plan_id:f.plan_id,limit:16},'codex');
  assert.equal(page.partitioner,scoped.COHERENT_PARTITIONER);assert.ok(page.units.length<10);
  const readUnit=await publicCall('company_context',{root:f.root,session_id:f.session_id,action:'read',plan_id:f.plan_id,unit_id:page.units[0].id},'codex');assert.equal(readUnit.unit.partitioner,scoped.COHERENT_PARTITIONER);
  const es=await extracts(f),repeated=es.filter(e=>e.packet.reviewed_unit_bundle.primary.sections.some(s=>s.group_id===e.packet.reviewed_unit_bundle.primary.group_id&&s.body.id==='repeated'));
  assert.equal(repeated.length,2);assert.equal(repeated[0].packet.reviewed_unit_bundle.primary.body_root,repeated[1].packet.reviewed_unit_bundle.primary.body_root);
  assert.notEqual(repeated[0].packet.reviewed_unit_bundle.provenance_sha256,repeated[1].packet.reviewed_unit_bundle.provenance_sha256);
  assert.ok(repeated.some(e=>JSON.stringify(e.packet.reviewed_unit_bundle).includes('Consent exhausted.')));
  assert.ok(repeated.some(e=>JSON.stringify(e.packet.reviewed_unit_bundle).includes('Consent revoked.')));
  const {d,ir,i}=await finish(f,es),s=read(f);
  assert.equal(scoped.validateScopedApply(s,{integration_review_id:i.review.id}).source.id,'old');
  const result=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:i.review.id},'codex');assert.equal(result.applied,true);
  for(const e of [...es,d,ir,i]){const wires=e.streamRequests.length?e.streamRequests:[e.job.qualification_delivery.wire];assert.ok(wires.every(w=>bytes(w)<=48000));assert.ok(bytes(JSON.parse(e.review.qualification_output))<=12000);}
  assert.equal(call(f,{action:'target',phase:'extract',unit_id:repeated[0].target.target.unit_id}).review_id,repeated[0].review.id);
  const original=read(f);
  for(const change of [s=>s.jobs[es[0].job.id].native_id='forged',s=>s.jobs[es[0].job.id].coordination_release.termination_confirmed=false,s=>s.records[es[0].review.id].reviewed_unit_bundle.primary.sections=[],s=>s.records[f.plan_id].scoped_context_plan.partitioner='lossless-ranges-v1',s=>s.records[f.plan_id].scoped_context_plan.units.pop(),s=>s.records.old.left.condition='Changed permission',s=>s.jobs[i.job.id].qualification_delivery.ranges.pop(),s=>s.records.newRule={id:'newRule',kind:'decision',revision:1,content:'New prohibition remains mandatory.'}]){const copy=inheritSnapshots(original,structuredClone(original));change(copy);assert.throws(()=>scoped.validateScopedApply(copy,{integration_review_id:i.review.id}),/hold|changed/i);}
});

test('FICTIONAL ADAPTER: omissions, omitted occurrence interfaces, source producer and negative receipts hold',async()=>{
  const f=fixture(),es=await extracts(f),args={phase:'applicability',extraction_review_ids:es.slice(1).map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*'};
  const d=await run(f,args),ir=await run(f,{...args,interface_keys:d.review.qualification_result.interfaces.map(i=>i.key)});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id],interface_review_ids:[ir.review.id],counterpart_ids:['home-D00']}),/coherent occurrence coverage/);
  const g=fixture(),bad=await run(g,{phase:'extract',unit_id:unitPages(g)[0].id},{review:p=>{const e=contractReview(p);e.qualification_result.items=[];return e;}});assert.equal(bad.job.status,'failed');assert.match(bad.job.error,/occurrence requires/);
  assert.throws(()=>fixture({extra:{job_id:'missing-producer'}}),/source missing/);
});

test('archived rejected contributors cannot review scoped extraction while company-shaped application examples stay data',async()=>{
 for(const partitioner of [scoped.COHERENT_PARTITIONER,scoped.CORPUS_PARTITIONER])for(const mode of ['absent','different','external']){
  const f=fixture(),native='fictional-archived-rejected-scoped';
  mutate(f,s=>{
   delete s.records[f.plan_id];
   const old={id:'retired',role:'qa',status:'failed',native_id:null,rejected_native_ids:[native],rejected_output:{text:'Original failed contribution stays failed.'}};
   const example={id:s.id,governance:'External application example',roles:{qa:{}},records:{},jobs:{retired:old}};
   const body={id:s.id,governance:s.governance,roles:s.roles,records:{},jobs:mode==='external'?{}:{retired:old},...(mode==='external'?{external_catalog:example}:{})};
   s.upgrade={id:'historical',status:'recovered',checkpoint:retainSnapshot(s,body),checkpoint_sha256:sha(body)};
   if(mode==='different')s.jobs.retired={id:'retired',role:'engineer',status:'completed',instance_id:'new-instance',native_id:'new-native',rejected_native_ids:[]};
  });
  const p=call(f,{action:'plan',protocol,partitioner,source_id:partitioner===scoped.CORPUS_PARTITIONER?'old':'upgrade:historical',...(partitioner===scoped.CORPUS_PARTITIONER?{selected_source_ids:['old']}:{})});f.plan_id=p.id;
  const unit=unitPages(f).find(u=>JSON.stringify(call(f,{action:'read',plan_id:f.plan_id,unit_id:u.id}).unit).includes(native));assert.ok(unit,'exact reviewed unit contains the rejected contribution');
  const result=await run(f,{phase:'extract',unit_id:unit.id},{native,modelHook:p=>{assert.ok(JSON.stringify(p.reviewed_unit_bundle).includes(native),'reviewed batch contains the historical rejected contribution or external example');}});
  assert.equal(result.job.status,mode==='external'?'completed':'failed',result.job.error);
  if(mode!=='external'){assert.match(result.job.error,/independent reviewer owns/);assert.equal(result.review,undefined);assert.ok(result.job.rejected_native_ids.includes(native));}
 }
});

test('FICTIONAL ADAPTER: late qualifier remains complete and missing home preservation is Blocked',async()=>{
  const f=fixture({extra:{nested:{id:'nested',content:'Conditional export claim.'},late_qualifier:'LATE_NO_EXPORT'}}),es=await extracts(f);
  assert.ok(es.some(e=>e.packet.reviewed_unit_bundle.primary.sections.some(s=>s.body?.id==='nested')&&JSON.stringify(e.packet.reviewed_unit_bundle).includes('LATE_NO_EXPORT')));
  const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'*'});assert.equal(d.review.review.verdict,'Blocked');
  assert.throws(()=>call(f,{action:'target',phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}),/negative receipt|global governing/);
});

test('FICTIONAL ADAPTER: prospective coherent streaming carries complete oversized section; old extraction still rejects opt-in',async()=>{
  const f=fixture({extra:{complete_text:'No permission. 🧪 '.repeat(3500)}}),unit=unitPages(f).find(u=>u.group_id!==unitPages(f)[0].group_id);
  const e=await run(f,{phase:'extract',unit_id:unit.id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(e.job.status,'completed',e.job.error);assert.ok(e.streamRequests.length>1);assert.ok(e.streamRequests.every(w=>bytes(w)<=48000));assert.ok(JSON.stringify(e.packet).includes('No permission. 🧪 '));
  assert.throws(()=>call(f,{action:'read',unit_id:unit.id}),/complete coherent/);
  const old=fixture(); // unchanged range contract is selected explicitly below
  const p=call(old,{action:'plan',protocol,source_id:'old',partitioner:'lossless-ranges-v1'});
  assert.throws(()=>call(old,{action:'target',plan_id:p.id,phase:'extract',unit_id:'u0',delivery_protocol:scoped.SCOPED_STREAM}),/non-extraction/);
});

test('FICTIONAL ADAPTER: snapshot inbound native path and resealed omissions cannot enter canonical scoped plan',async()=>{
  const f=fixture();mutate(f,s=>{const snap=retainSnapshot(s,{id:'original',content:'No retry.'});s.records.old.a={id:'a',condition:'No export.',snapshot:snap};s.records.old.b={id:'b',condition:'Revoked.',snapshot:snap};});
  const p=call(f,{action:'plan',protocol,partitioner:scoped.COHERENT_PARTITIONER,source_id:'old'});f.plan_id=p.id;
  const state=read(f),desc=state.records[p.id].scoped_context_plan,c=resolveSnapshot(state,desc.capsule),material=resolveSnapshot(state,c.projection);
  assert.equal(material.snapshot_inbound.length,2);
  const packet=unitPages(f).map(u=>call(f,{action:'read',unit_id:u.id}).unit).find(u=>u.snapshot_inbound.length);
  assert.equal(packet.snapshot_inbound.length,2);assert.ok(JSON.stringify(packet).includes('Revoked.'));assert.ok(JSON.stringify(packet).includes('No export.'));
  const es=await extracts(f),q=await finish(f,es);assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:q.i.review.id}).source.id,'old');
  for(const change of [m=>m.snapshot_inbound.pop(),m=>m.occurrences.pop(),m=>m.groups.pop()]){
    const copy=inheritSnapshots(state,structuredClone(state)),bad=structuredClone(material);change(bad);delete bad.plan_sha256;bad.plan_sha256=sha(bad);
    const capsule={...c,projection:retainSnapshot(copy,bad)};copy.records[p.id].scoped_context_plan.capsule=retainSnapshot(copy,capsule);
    assert.throws(()=>scoped.scopedPlanView(copy,{plan_id:p.id}),/coverage|identity|changed|missing/i);
  }
});


test('coherent runtime-test producer uses canonical author_instance, candidate and receipt closure without fabricated job_id',()=>{
  const f=fixture();mutate(f,s=>{
    s.records.devplan={id:'devplan',revision:1,development:{type:'plan'},content:'Fictional test plan.'};
    s.records.candidate={id:'candidate',revision:1,development:{type:'candidate',candidate_sha256:'candidate-hash',run:{job_id:'controller',receipt_id:'old',status:'completed'}},content:'Fictional code.'};
    const result={status:'passed'};
    s.records.old={id:'old',revision:1,author_role:'runtime',author_instance:'controller',content:JSON.stringify(result),development:{type:'test',candidate_id:'candidate',plan_id:'devplan',candidate_sha256:'candidate-hash',receipt_sha256:sha(result),result}};
    s.jobs.controller={id:'controller',kind:'development_test',artifact_id:'old',candidate_id:'candidate',development_id:'devplan',status:'completed'};
  });
  const p=call(f,{action:'plan',protocol,source_id:'old',partitioner:scoped.COHERENT_PARTITIONER});
  const state=read(f);assert.equal(state.records.old.job_id,undefined);
  const c=resolveSnapshot(state,state.records[p.id].scoped_context_plan.capsule);
  assert.deepEqual(c.producer_closure.map(r=>r.id),['job:controller','candidate','devplan']);
  for(const change of [s=>s.records.old.author_instance='forged',s=>s.jobs.controller.kind='model',s=>s.records.candidate.development.run.receipt_id='forged',s=>s.records.old.development.receipt_sha256='forged',s=>s.records.old.development.reused_from='old']){
    const bad=inheritSnapshots(state,structuredClone(state));change(bad);assert.throws(()=>scoped.captureScopedPlan(bad,{source_id:'old',partitioner:scoped.COHERENT_PARTITIONER}),/missing|producer|closure|changed/i);
  }
});

test('nested formatting/escape variant source files retain bounded native bundles and mandatory occurrence interfaces',async t=>{
  const sources={'a.mjs':'a'.repeat(21650),'b.mjs':'b'.repeat(17056),'c.mjs':'c'.repeat(12952)};
  const content=JSON.stringify({left:{scope:'Consent exhausted.',sources},right:{scope:'Consent revoked.',sources},late_unknown:'LATE_NO_EXPORT: no execution.'},null,2).replace('LATE_NO_EXPORT','\\u004cATE_NO_EXPORT');
  assert.ok(bytes(content)>48000);
  const f=fixture({extra:{content}}),units=unitPages(f);
  const state=read(f),capsule=resolveSnapshot(state,state.records[f.plan_id].scoped_context_plan.capsule),material=resolveSnapshot(state,capsule.projection);
  const {decodeLegacyCoherentPlan}=await import('../plugins/soloco/runtime/legacy-operating.mjs');
  assert.equal(decodeLegacyCoherentPlan(material).state.records.old.content,content);
  assert.ok(material.definitions.some(d=>d[0]==='json-text-string'&&d[2]===content));
  const bundles=units.map(u=>call(f,{action:'read',unit_id:u.id}).unit);
  const leaves=bundles.filter(b=>b.sections.some(g=>g.group_id===b.group_id&&g.body===sources['a.mjs']));
  assert.equal(leaves.length,2);assert.equal(leaves[0].body_root,leaves[1].body_root);
  assert.notEqual(leaves[0].occurrence.id,leaves[1].occurrence.id);
  assert.notDeepEqual(leaves[0].occurrence.ancestor_roots,leaves[1].occurrence.ancestor_roots);
  for(const b of leaves){
    assert.ok(JSON.stringify(b).includes('LATE_NO_EXPORT'));
    assert.equal(b.required_interface.id,'coherent-context');assert.equal(b.required_interface.with_scope,'*');
    assert.match(b.required_interface.text,/every snapshot inbound context/);
    assert.ok(bytes(b)<48000);
  }
  assert.ok(leaves.some(b=>JSON.stringify(b).includes('Consent exhausted.')));
  assert.ok(leaves.some(b=>JSON.stringify(b).includes('Consent revoked.')));
  const invalid=await run(f,{phase:'extract',unit_id:leaves[0].id},{review:p=>{const e=contractReview(p);e.qualification_result.items[0].interfaces=[];return e;}});
  assert.equal(invalid.job.status,'failed');assert.match(invalid.job.error,/occurrence requires/);
  assert.ok(bytes(invalid.packet)<48000);
  t.diagnostic(JSON.stringify({fictional_only:true,parent_string_bytes:bytes(content),units:units.length,leaf_bundle_bytes:leaves.map(bytes),extraction_request_bytes:bytes(invalid.packet),semantic_acceptance:false}));
});

// Real public/store/worker mechanics with FICTIONAL judgments only. This covers
// the SCOPED entry identity seam, separately from represented-v2 fixtures.
for(const entry of [false,true])test('SCOPED publication '+(entry?'retains immutable-entry and resolved identities':'ignores colliding external producer metadata'),async()=>{
  const f=fixture({operating:true,entry,evidenceOld:true,extra:entry?{}:{external_metadata:{id:'home-D00',job_id:'external-provider-id'}}});
  const base={root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction};
  const es=await extracts(f),{i}=await finish(f,es,{probeMissing:false});
  await publicCall('company_context',{...base,action:'apply',integration_review_id:i.review.id},'codex');
  const source=read(f).records.old,original=entry?resolveSnapshot(read(f),source.immutable_entry):source;
  const p=await publicCall('company_context',{...base,protocol:'operating-state-v1',action:'plan'},'codex');assert.equal(p.held,false,JSON.stringify(p.frontier));
  const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Fictional independent complete current-meaning publication'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
  const context=(await import('../plugins/soloco/runtime/context.mjs')).assignmentContext(read(f),read(f).jobs[q.id]);
  const evidence=context.operating_evidence,reads=evidence?Object.values(evidence.sources).flatMap(source=>{const out=[];for(let offset=0;offset<source.length;){let length=Math.min(16000,source.length-offset);if(/[\uD800-\uDBFF]/.test(source.raw[offset+length-1]))length--;out.push({source_id:source.source_id,sha256:source.sha256,offset,length});offset+=length;}return out;}):[];
  let first=true;await work(f.root,q.id,async(_host,_native,_wire,_dir,timeout,_selection,options)=>{
   if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
   if(reads.length)return {native_id:'fictional-publisher-'+q.id,text:JSON.stringify({reads:reads.splice(0,4)})};
   return {native_id:'fictional-publisher-'+q.id,text:JSON.stringify({content:'Fictional complete source preservation and current conditions.',messages:[],notices:[],review:{verdict:'Pass',reason:'Scripted fixture judgment only',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[p.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
  });
  const j=read(f).jobs[q.id];assert.equal(j.status,'completed',j.error);
  assert.equal((await publicCall('company_context',{...base,protocol:'operating-state-v1',action:'apply',plan_id:p.id,review_id:j.artifact_id},'codex')).published,true);
  const state=read(f),snapshot=state.operating_state.accepted_snapshot;
  assert.ok(resolveSnapshot(state,snapshot.preservation).evidence.sources.some(x=>x.source.id==='old'&&x.source.sha256===sha(source)&&x.accepted_original),'stored wrapper binding retained');
  const packet=context.frozen_packet??JSON.parse(context.text),accepted=packet.required_evidence.accepted_semantics.find(x=>x.source.id==='old');
  assert.ok(accepted.resolved_originals.some(r=>r.id==='old'&&r.sha256===sha(original)),'resolved original binding retained');
  if(entry)assert.notEqual(sha(source),sha(original));
});
