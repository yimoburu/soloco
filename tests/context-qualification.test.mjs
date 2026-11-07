import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {
  QUALIFICATION_PROTOCOL as protocol,QUALIFICATION_LIMITS as limits,QUALIFICATION_PROFILES,QUALIFICATION_PROFILE,qualificationLimits,qualificationWorkload,validateQualificationOutput,QualificationHold,
  qualificationReference as ref,createQualificationPlan,validateQualificationPlan,
  createQualificationTarget,qualificationAssignment,qualificationMatches,
  qualificationDelivery,qualificationProof,validateQualificationEnvelope,validateQualificationResponse,
  validateQualificationApply,validateQualificationExclusion,qualificationOriginal,qualificationPlanView,qualificationReadUnit,qualificationReadEvidence,
} from '../plugins/soloco/runtime/context-qualification.mjs';
import {Store,digest,withStore,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {contextPlan,validateContextPlan,contextRead,governingRecords} from '../plugins/soloco/runtime/current-state.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {buildEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {TIMEOUT_POLICY_VERSION,normalizeTimeout,executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
const sha=v=>digest(JSON.stringify(v)),size=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const clone=structuredClone;
function immutableJSON(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))immutableJSON(child);Object.freeze(value);}
  return value;
}
function seed(content='Do not exceed the exhausted allowance. Prior failure remains failed.'){
  return {id:'fixture',schema:2,runtime_version:'0.6.12',owner:{epoch:1,session_id:'cos-native'},governance:'Preparation only; no execution authority.',roles:{qa:{name:'QA'},engineer:{name:'Engineer'}},records:{old:{id:'old',kind:'artifact',revision:1,author_instance:'source-author',content},current:{id:'current',kind:'decision',revision:1,author_instance:'current-author',content:'Retain the exhausted allowance, prior negative verdict, and all restrictions.'}},jobs:{},sessions:{},notices:[],messages:[]};
}
function plan(s,args={}){const p={id:'plan',kind:'plan',revision:1,author_instance:'plan-author',context_partition_plan:createQualificationPlan(s,{source_id:'old',counterpart_ids:['current'],...args})};s.records[p.id]=p;return p;}
let serial=0;
function queue(s,p,args={}){
  const n=++serial,t={id:'target-'+n,kind:'qualification_target',revision:1,context_qualification_target:createQualificationTarget(s,{plan_id:p.id,...args})};s.records[t.id]=t;
  const j={id:'job-'+n,role:'qa',instance_id:'instance-'+n,session_key:'instance-'+n,native_id:null,epoch:1,status:'queued',timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout(),host:'codex',task:'Independently preserve every restriction and failure.',inputs:[],context_format:3,review_of:{id:t.id,revision:1},created_at:new Date().toISOString()};s.jobs[j.id]=j;s.sessions[j.session_key]={instance_id:j.instance_id,role:'qa',native_id:null};return j;
}
// Deterministic CONTRACT DOUBLES only. They exercise shape, DAG, delivery and
// bounds; their invented semantic judgments are not real QA or acceptance.
function result(a,{empty=false,verdict='Pass'}={}){
  const p=a.packet,r={protocol,kind:p.kind,plan_sha256:p.plan_sha256,verdict,reason:'Contract double: exhaustive semantics including cross-scope boundaries.',permitted_action:verdict==='Pass'?(p.kind==='aggregate'?'represented-by':'continue'):'hold',exhaustive:true,boundaries_complete:true,blockers:verdict==='Pass'?[]:['Concrete distinct semantic scope cannot be judged here.']};
  if(p.kind==='unit')Object.assign(r,{unit_id:p.unit.id,unit_sha256:p.unit_header.sha256,items:empty?[]:[{id:'restriction',kind:'exhausted_allowance',text:'Never retry the exhausted allowance.',provenance:[{fragment:0,path:p.unit.fragments[0].path,range:p.unit.fragments[0].range??null}],basis:'All exact framed values and global conditions reviewed by a contract double.'}]});
  if(p.kind==='reconcile'){
    const groups=new Map();
    for(const c of p.children)for(const i of c.result.items){const key=JSON.stringify([i.kind,i.text]);if(!groups.has(key))groups.set(key,{id:'item-'+groups.size,kind:i.kind,text:i.text,supports:[],basis:'Contract double: complete semantic equivalence including conditions.'});groups.get(key).supports.push(c.slot+'/'+i.id);}
    r.items=[...groups.values()];
  }
  if(p.kind==='aggregate'){r.current_resolutions=[];r.mappings=p.children[0].result.items.map(i=>({historical:i.id,current:p.children[1].result.items.map(c=>c.id),non_applicability:null,resolution:null,status:'represented',reason:'Contract double: complete conditions retained in the exact current-root evidence.'}));}
  return r;
}
const unitResult=result;
function workflow(content,{empty=false,current,measure=false,setup,review,dependency_ids=[],profile,immutable=false}={}){
  const s=seed(content);if(current!==undefined)s.records.current.content=current;if(setup)setup(s);
  if(immutable)for(const record of Object.values(s.records))immutableJSON(record);
  const start=performance.now(),p=plan(s,{dependency_ids,...(profile?{profile}:{})}),proofs=new Map(),packets=[];
  if(immutable)immutableJSON(p);
  const run=args=>{const j=queue(s,p,args);if(immutable)immutableJSON(s.records[j.review_of.id]);const a=qualificationAssignment(s,j);packets.push({kind:a.packet.kind,bytes:size(a.text)});if(process.env.QUALIFICATION_MEASURE&&packets.length%64===0)process.stderr.write('contract progress '+packets.length+'\n');const value=result(a,{empty}),r=complete(s,j,a,review?review(value,a):value);if(immutable){immutableJSON(r);immutableJSON(j);}return {j,a,r};};
  for(const u of p.context_partition_plan.units)proofs.set(u.id,run({unit_id:u.id}).r);
  for(const n of p.context_partition_plan.nodes)proofs.set(n.id,run({node_id:n.id,child_review_ids:n.children.map(id=>proofs.get(id).id)}).r);
  const roots=p.context_partition_plan.roots;
  const f=run({root_review_ids:[proofs.get(roots.historical).id,proofs.get(roots.current).id]});
  const proof=validateQualificationApply(s,{aggregate_review_id:f.r.id});
  s.context_classifications={old:{partition_qualification:clone(proof)}};
  return {s,p,proofs,packets,proof,...f,metrics:{raw_bytes:size(s.records.old),units:p.context_partition_plan.units.length,reconciliation_nodes:p.context_partition_plan.nodes.length,levels:Math.max(0,...p.context_partition_plan.nodes.map(n=>n.level))+2,sessions:packets.length,max_full_prompt_bytes:Math.max(...packets.map(p=>p.bytes)),aggregate_bytes:size(f.a.text),total_input_bytes:packets.reduce((n,p)=>n+p.bytes,0),total_output_bytes:[...proofs.values(),f.r].reduce((n,r)=>n+size(output(r.qualification_result)),0),retained_wire_bytes:Object.values(s.jobs).filter(j=>j.qualification_delivery).reduce((n,j)=>n+size(j.qualification_delivery.wire),0),plan_bytes:size(p),logical_state_bytes:size(s),elapsed_ms:Math.round(performance.now()-start)}};
}
function first(s,p){const j=queue(s,p,{unit_id:p.context_partition_plan.units[0].id});return {j,a:qualificationAssignment(s,j)};}
function allFragments(s,p){return p.context_partition_plan.units.flatMap(u=>qualificationReadUnit(s,{plan_id:p.id,unit_id:u.id}).unit.fragments.map(f=>({...f,domain:u.domain})));}
// Contract-only injected reviewer. This is NOT independent native acceptance.
function complete(s,j,a,r,native='native-'+j.id){
  validateQualificationResponse(s,j,a,native,r);
  Object.assign(j,{started_at:new Date().toISOString(),...executionTiming(Date.now(),normalizeTimeout())});
  const d=qualificationDelivery(a,j,native,a.text),record={id:'review-'+j.id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:j.instance_id,job_id:j.id,review_of:j.review_of,content:r.reason,qualification_output:JSON.stringify(output(r)),review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r,qualification_proof:null};
  s.records[record.id]=record;Object.assign(j,{native_id:native,artifact_id:record.id,status:'completed',context_sha256:a.hash,qualification_delivery:d,finished_at:new Date().toISOString(),coordination_release:{termination_confirmed:true,reason:'model_process_closed'}});record.qualification_proof=qualificationProof(d,j);s.sessions[j.session_key].native_id=native;return record;
}

test('complete extraction, independent reconciliation and final mapping; immutable original retained',()=>{
  const f=workflow('Never retry.');assert.equal(f.proof.classification,'represented-by');assert.deepEqual(validateQualificationExclusion(f.s,f.proof),f.proof);
  assert.deepEqual(f.proof.counterparts,[ref(f.s.records.current)]);assert.equal(f.s.records.old.content,'Never retry.');
  assert.equal(f.a.packet.children.length,2);assert.equal(f.a.packet.units,undefined);assert.ok(!f.a.text.includes('unit_header'));
  const capture=qualificationOriginal(f.s,{source_id:'old'});assert.equal(capture.raw,JSON.stringify(f.s.records.old));assert.equal(capture.sha256,sha(f.s.records.old));
  assert.throws(()=>validateContextPlan(f.s,f.p.context_partition_plan));
  const legacy=contextPlan(f.s,{record_ids:['old'],disposition:'resolved'});assert.equal(legacy.version,1);assert.equal(validateContextPlan(f.s,legacy),true);
  assert.equal(contextRead(f.s,{id:'old',sha256:ref(f.s.records.old).sha256,length:20}).text,JSON.stringify(f.s.records.old).slice(0,20));
});

test('core vault fixture: snapshot/entry references resolve all historical and current semantics, raw bytes remain exact',async t=>{
  const core=fileURLToPath(new URL('../plugins/soloco/runtime',import.meta.url));
  if(!fs.existsSync(path.join(core,'snapshot.mjs'))){t.skip('Core snapshot API fixture unavailable');return;}
  const fixture=fs.mkdtempSync(path.join(tmp,'core-vault-')),runtime=path.join(fixture,'runtime');
  fs.cpSync(fileURLToPath(new URL('../plugins/soloco/runtime',import.meta.url)),runtime,{recursive:true});
  for(const name of ['snapshot.mjs','upgrade-evidence.mjs','current-state.mjs'])fs.copyFileSync(path.join(core,name),path.join(runtime,name));
  const api=await import(pathToFileURL(path.join(runtime,'context-qualification.mjs'))),snap=await import(pathToFileURL(path.join(runtime,'snapshot.mjs')));
  const s=snap.bindSnapshots(seed());
  const hidden=snap.retainSnapshotEntry(s,{id:'hidden',kind:'decision',revision:1,content:'ENTRY_UNIQUE_NEVER_RETRY'});
  const checkpoint=snap.retainSnapshot(s,{id:'fixture',records:{hidden},jobs:{},notices:[],messages:[]});
  const attempt={id:'u',checkpoint,checkpoint_sha256:checkpoint.immutable_snapshot.sha256,old_team:{rule:'TEAM_UNIQUE_NEVER_EXECUTE'}};
  s.upgrade_history=[snap.retainSnapshotEntry(s,attempt)];
  const handoverSubject={company_id:'fixture',records:{hidden:{id:'hidden',kind:'decision',content:'SUBJECT_UNIQUE_NO_FOURTH_ATTEMPT'}},jobs:{},notices:[],messages:[]};
  const subject=snap.retainSnapshot(s,handoverSubject);
  s.records.handover=snap.retainSnapshotEntry(s,{id:'handover',kind:'artifact',author_role:'runner',author_instance:'incoming',revision:1,handover:{id:'h',incoming_owner:{session_id:'incoming'},input_refs:[],subject_sha256:subject.immutable_snapshot.sha256,subject}});
  s.records.reconstruction=snap.retainSnapshotEntry(s,{id:'reconstruction',kind:'artifact',author_role:'runner',author_instance:'incoming',revision:1,handover:{id:'r',incoming_owner:{session_id:'incoming'},input_refs:[],subject_sha256:subject.immutable_snapshot.sha256,subject:{retained_handover_subject:{record_id:'handover',sha256:subject.immutable_snapshot.sha256}}}});
  for(const [source_id,markers] of [['upgrade:u',['ENTRY_UNIQUE_NEVER_RETRY','TEAM_UNIQUE_NEVER_EXECUTE']],['handover',['SUBJECT_UNIQUE_NO_FOURTH_ATTEMPT']],['reconstruction',['SUBJECT_UNIQUE_NO_FOURTH_ATTEMPT']]]){
    const plan=api.createQualificationPlan(s,{source_id,counterpart_ids:['handover'] .filter(id=>id!==source_id)}),p={id:'core-plan-'+source_id,revision:1,author_instance:'planner',context_partition_plan:plan};s.records[p.id]=p;
    const texts={historical:'',current:''};for(const u of plan.units)texts[u.domain]+=JSON.stringify(api.qualificationReadUnit(s,{plan_id:p.id,unit_id:u.id}));
    for(const marker of markers)assert.ok(texts.historical.includes(marker),marker);
    if(source_id==='upgrade:u')assert.ok(texts.current.includes('SUBJECT_UNIQUE_NO_FOURTH_ATTEMPT'));
    const original=api.qualificationOriginal(s,{source_id});assert.equal(original.sha256,plan.source.sha256);assert.equal(original.raw,JSON.stringify(source_id==='upgrade:u'?attempt:snap.resolveSnapshotEntry(s,s.records[source_id])));
    assert.equal(api.validateQualificationPlan(s,plan),true);
    if(source_id==='upgrade:u'){
      let descriptor;function find(v){if(!v||typeof v!=='object')return;if(v.source_id&&v.sha256===checkpoint.immutable_snapshot.sha256&&v.reason==='immutable-snapshot-original')descriptor=v;for(const c of Object.values(v))if(c&&typeof c==='object')find(c);}
      for(const u of plan.units.filter(u=>u.domain==='historical'))find(api.qualificationReadUnit(s,{plan_id:p.id,unit_id:u.id}));assert.ok(descriptor);
      const read=api.qualificationReadEvidence(s,{plan_id:p.id,source_id:descriptor.source_id,sha256:descriptor.sha256,offset:0,length:Math.min(100,descriptor.length)});
      assert.equal(read.evidence.text,snap.snapshotBytes(s,checkpoint).slice(0,Math.min(100,descriptor.length)));assert.equal(read.retrieval_only,true);
    }
    const legacy=await import(pathToFileURL(path.join(runtime,'current-state.mjs')));assert.throws(()=>legacy.validateContextPlan(s,plan));
  }
  const raw=snap.snapshotBytes(s,checkpoint);assert.ok(raw.includes('immutable_entry'));assert.equal(snap.readSnapshot(s,checkpoint,{length:Math.min(100,raw.length)}).text,raw.slice(0,Math.min(100,raw.length)));
  const lost=structuredClone(s);assert.throws(()=>api.createQualificationPlan(lost,{source_id:'upgrade:u'}),/snapshot.*missing|snapshot.*corrupt/i);
  t.diagnostic(JSON.stringify({fixture:'core modules copied ONLY to temporary directory',sha256:Object.fromEntries(['snapshot.mjs','upgrade-evidence.mjs','current-state.mjs'].map(n=>[n,digest(fs.readFileSync(path.join(runtime,n)))]))}));
});

test('historical checkpoint, handover subject and old team UNIQUE restrictions are compulsory',()=>{
  const s=seed();const checkpoint={id:'fixture',records:{hidden:{id:'hidden',kind:'decision',content:'CHECKPOINT_UNIQUE_NEVER_RETRY'}},jobs:{},notices:[],messages:[]};
  const subject={company_id:'fixture',records:{hidden:{id:'hidden',kind:'decision',content:'HANDOVER_UNIQUE_DO_NOT_EXECUTE'}},jobs:{},notices:[],messages:[]};
  s.upgrade_history=[{id:'u',checkpoint,old_team:{rules:'OLD_TEAM_UNIQUE_EXHAUSTED'}}];
  s.records.handover={id:'handover',kind:'artifact',author_role:'runner',author_instance:'incoming',revision:1,handover:{id:'h',incoming_owner:{session_id:'incoming'},subject_sha256:sha(subject),input_refs:[],subject}};
  for(const [source_id,markers] of [['upgrade:u',['CHECKPOINT_UNIQUE_NEVER_RETRY','OLD_TEAM_UNIQUE_EXHAUSTED']],['handover',['HANDOVER_UNIQUE_DO_NOT_EXECUTE']]]){
    const p={id:'plan-'+source_id,revision:1,author_instance:'planner',context_partition_plan:createQualificationPlan(s,{source_id})};s.records[p.id]=p;
    const text=p.context_partition_plan.units.filter(u=>u.domain==='historical').map(u=>{const j=queue(s,p,{unit_id:u.id});return qualificationAssignment(s,j).text;}).join('');
    for(const marker of markers)assert.ok(text.includes(marker),marker);
  }
});

test('exact source, counterpart, dependency, producer, governance and semantic notice freshness; informational history independent',()=>{
  for(const mutate of [s=>s.records.old.content+='changed',s=>s.records.current.content+='changed',s=>s.governance+='changed',s=>s.cos_instructions='new restriction',s=>s.unknown_extension={restriction:'Never execute'},s=>s.paused='unknown',s=>s.roles.qa.name='changed',s=>s.notices.push({id:'n',summary:'new dependency'})]){
    const f=workflow();mutate(f.s);assert.throws(()=>validateQualificationExclusion(f.s,f.proof),/stale|corrupt|subject|epoch/);
  }
  const f=workflow();f.s.upgrade_history=[{id:'unrelated',notes:'informational archive append'}];f.s.records.info={id:'info',kind:'artifact',content:'informational'};assert.deepEqual(validateQualificationExclusion(f.s,f.proof),f.proof);
  const s=seed();s.records.dep={id:'dep',content:'exact'};s.records.old.job_id='producer';s.jobs.producer={id:'producer',native_id:'source-native'};
  const p=createQualificationPlan(s,{source_id:'old',dependency_ids:['dep']});s.records.dep.content='change';assert.throws(()=>validateQualificationPlan(s,p),/stale|corrupt/);s.records.dep.content='exact';s.jobs.producer.native_id='change';assert.throws(()=>validateQualificationPlan(s,p),/stale|corrupt/);
});

test('exclude only exact-plan proof outputs; unrelated qualification negatives stay current',()=>{
  const f=workflow();assert.equal(validateQualificationPlan(f.s,f.p.context_partition_plan),true);
  f.s.records.negative={id:'negative',kind:'review',review:{verdict:'Blocked'},qualification_result:{verdict:'Blocked'},content:'NEW hard stop'};
  assert.throws(()=>validateQualificationPlan(f.s,f.p.context_partition_plan),/subject/);
  const p=createQualificationPlan(f.s,{source_id:'old',counterpart_ids:['current']});f.s.records.p2={id:'p2',revision:1,author_instance:'planner',context_partition_plan:p};
  assert.ok(p.units.filter(u=>u.domain==='current').some(u=>qualificationReadUnit(f.s,{plan_id:'p2',unit_id:u.id}).unit.fragments.some(f=>JSON.stringify(f).includes('NEW hard stop'))));
});

test('notice deliveries and seen are mechanical; changed notice semantics invalidate exclusion',()=>{
  const s=seed();s.notices=[{id:'n',summary:'Do not execute',deliveries:[],seen:[]}];const p=plan(s);
  s.notices[0].deliveries.push({at:'now'});s.notices[0].seen.push('qa');s.notices[0].seen_at='now';assert.equal(validateQualificationPlan(s,p.context_partition_plan),true);
  s.notices[0].summary+='changed';assert.throws(()=>validateQualificationPlan(s,p.context_partition_plan),/subject/);
});

test('applied complete representation survives owner identity, epoch, real handover and additive governing context',()=>{
  const f=workflow('Never retry.');
  for(const mutate of [
    s=>{s.owner.session_id='replacement';},
    s=>{s.owner.epoch++;},
    s=>{s.owner.host='claude';},
    s=>{s.owner={session_id:'replacement',instance_id:'new-instance',epoch:2};s.handover={from:'cos-native',to:'replacement'};},
    s=>{s.records.info={id:'info',kind:'artifact',revision:1,content:'Informational append.'};},
    s=>{s.records.display={id:'display',kind:'decision',revision:1,content:'Use 18 point dashboard text.'};},
    // Independence belongs to review time, including a reviewer later becoming CoS.
    s=>{s.owner={session_id:f.j.native_id,instance_id:f.j.instance_id,epoch:2};s.jobs.later={id:'later',native_id:f.j.native_id,instance_id:f.j.instance_id};},
  ]){
    const s=clone(f.s);mutate(s);assert.deepEqual(validateQualificationExclusion(s,f.proof),f.proof);
    assert.equal(s.records.old.content,'Never retry.');
  }
});

test('raw canonical Pass is not applied authority; stale plans cannot dispatch, return or freshly apply',()=>{
  const f=workflow(),raw=clone(f.s);delete raw.context_classifications;
  assert.equal(validateQualificationApply(raw,{aggregate_review_id:f.r.id}).classification,'represented-by');
  assert.throws(()=>validateQualificationExclusion(raw,f.proof),/applied classification missing/);
  for(const mutate of [s=>{s.owner.session_id='replacement';},s=>{s.owner.epoch++;},s=>{s.owner={session_id:'replacement',epoch:2};}]){
    const s=clone(f.s);mutate(s);
    assert.deepEqual(validateQualificationExclusion(s,f.proof),f.proof);
    assert.throws(()=>validateQualificationPlan(s,f.p.context_partition_plan),/subject|epoch/);
    assert.throws(()=>createQualificationTarget(s,{plan_id:f.p.id,unit_id:f.p.context_partition_plan.units[0].id}),/subject|epoch/);
    assert.throws(()=>qualificationAssignment(s,s.jobs[f.j.id]),/subject|epoch/);
    assert.throws(()=>validateQualificationResponse(s,s.jobs[f.j.id],f.a,f.j.native_id,f.r.qualification_result),/subject|epoch/);
    assert.throws(()=>validateQualificationApply(s,{aggregate_review_id:f.r.id}),/subject|epoch/);
  }
});

test('applied proof retains exact original subject and reproduces historical/current units and evidence after handover',()=>{
  const f=workflow(),plan=f.p.context_partition_plan;
  const units=plan.units.map(u=>qualificationReadUnit(f.s,{plan_id:f.p.id,unit_id:u.id}));
  const source=qualificationOriginal(f.s,{source_id:'old'});
  // Use the evidence source descriptor actually produced by the existing grammar.
  const unit=units.find(u=>u.unit.domain==='historical');let descriptor;
  function find(v){if(!v||typeof v!=='object')return;if(v.source_id&&v.sha256&&Number.isSafeInteger(v.length)&&v.length>0)descriptor??=v;for(const c of Object.values(v))find(c);}
  find(unit);assert.ok(descriptor);
  const args={plan_id:f.p.id,source_id:descriptor.source_id,sha256:descriptor.sha256,offset:0,length:Math.min(20,descriptor.length)};
  const evidence=qualificationReadEvidence(f.s,args);
  f.s.owner={session_id:'replacement',epoch:2};f.s.records.extra={id:'extra',kind:'decision',content:'New mandatory restriction.'};
  assert.deepEqual(plan.units.map(u=>qualificationReadUnit(f.s,{plan_id:f.p.id,unit_id:u.id})),units);
  assert.deepEqual(qualificationReadEvidence(f.s,args),evidence);
  assert.equal(qualificationPlanView(f.s,{plan_id:f.p.id}).total_units,plan.units.length);
  assert.deepEqual(qualificationOriginal(f.s,{source_id:'old'}),source);
  assert.ok(plan.reviewed_subject.records.every(r=>r.ref.sha256&&!Object.hasOwn(r,'evidence')));
  const lost=clone(f.s);delete lost.records.current;assert.throws(()=>validateQualificationExclusion(lost,f.proof),/missing|stale|corrupt/);
  const tampered=clone(f.s);tampered.records.plan.context_partition_plan.reviewed_subject.company.governance='invented';assert.throws(()=>validateQualificationExclusion(tampered,f.proof),/stale|corrupt/);
});

test('present exact homes, dependencies, producers, authority, native bindings and negatives still hold after handover',()=>{
  const f=workflow(undefined,{dependency_ids:['home'],setup:s=>{
    s.records.home={id:'home',kind:'artifact',revision:1,content:'Mandatory home.'};
    s.records.current.job_id='producer';s.jobs.producer={id:'producer',instance_id:'producer-instance',native_id:'producer-native'};
  }});
  // Current ordinary governing records, even when not explicitly listed homes,
  // are exact retained inputs; source and declared homes use the same resolver.
  for(const mutate of [
    s=>{s.records.current.content+=' changed';},s=>{s.records.home.content+=' changed';},s=>{s.records.old.revision++;},
    s=>{s.jobs.producer.native_id='changed';},s=>{s.governance+=' changed';},
    s=>{s.cos_instructions='Changed rules';},s=>{s.roles.qa.instructions='Changed role rules';},
    s=>{s.team_sha256='different-team';},s=>{s.owner.grant='New semantic authority';},
    s=>{s.jobs[f.j.id].epoch++;},s=>{s.jobs[f.j.id].native_id='changed';},
    s=>{s.jobs[f.j.id].qualification_delivery.wire+=' ';},
    s=>{s.records.newNegative={id:'newNegative',kind:'review',review:{verdict:'Blocked'},content:'Representation incomplete.'};},
    s=>{s.records.sourceNegative={id:'sourceNegative',kind:'review',review_of:{id:'old',revision:1},review:{verdict:'Fail'}};},
    s=>{s.jobs.rejected={id:'rejected',review_of:{id:'old',revision:1},rejected_output:{qualification_negative:'Blocked',text:'truncated'}};},
  ]){
    const s=clone(f.s);s.owner={session_id:'replacement',epoch:2};mutate(s);
    assert.throws(()=>validateQualificationExclusion(s,f.proof),/hold:/);
  }
});

test('pure preservation tolerates only exact unrelated negative scopes; full dependency and canonical proof closure vetoes',()=>{
  const f=workflow(undefined,{dependency_ids:['dependency'],setup:s=>{
    s.records.dependency={id:'dependency',kind:'artifact',revision:1,content:'Exact mandatory domain input.'};
    s.records.current.job_id='producer';s.jobs.producer={id:'producer',revision:1,native_id:'producer-native'};
  }});
  const unrelated=clone(f.s);unrelated.paused=true;
  unrelated.records.dashboard={id:'dashboard',kind:'artifact',revision:1,content:'Fictional dashboard font proposal.'};
  unrelated.records.fontFail={id:'fontFail',kind:'review',revision:1,status:'Submitted',review_of:{id:'dashboard',revision:1},review:{verdict:'Fail',reason:'The dashboard font is unreadable.'}};
  assert.deepEqual(validateQualificationExclusion(unrelated,f.proof),f.proof);
  const context=JSON.parse(assignmentContext(unrelated,{role:'engineer',context_format:3,inputs:[],task:'Independent current work'}).text);
  assert.ok(context.records.some(r=>r.id==='fontFail'));assert.ok(context.records.some(r=>r.id==='dependency'));assert.ok(!context.records.some(r=>r.id==='old'));
  assert.equal(unrelated.records.fontFail.review.verdict,'Fail');assert.equal(unrelated.paused,true);
  assert.throws(()=>validateQualificationApply(unrelated,{aggregate_review_id:f.r.id}),/subject/);
  const closure=['old','current','dependency','plan','job:producer',f.r.id,f.j.review_of.id,...f.proofs.values()].map(v=>typeof v==='string'?v:v.id);
  for(const id of closure){const s=clone(f.s),target=id.startsWith('job:')?s.jobs[id.slice(4)]:s.records[id];s.records.failed={id:'failed',kind:'review',status:'Submitted',review_of:{id,revision:target.revision??null},review:{verdict:'Fail'}};assert.throws(()=>validateQualificationExclusion(s,f.proof),/negative/,id);}
  for(const mutate of [s=>{delete s.records.fontFail.review_of;},s=>{s.records.fontFail.review_of.revision=2;},s=>{s.records.fontFail.qualification_result={verdict:'Blocked'};}]){const s=clone(unrelated);mutate(s);assert.throws(()=>validateQualificationExclusion(s,f.proof),/negative/);}
});

test('non-applicability and global boundary resolutions keep semantic freshness while notice bookkeeping stays stable',()=>{
  for(const kind of ['non_applicable','boundary']){
    const f=workflow(undefined,{setup:s=>{s.notices=[{id:'n',summary:'Never execute',deliveries:[],seen:[]}];},review:(r,a)=>{
      if(kind==='boundary'&&r.items)for(const i of r.items)i.kind='boundary';
      if(r.kind==='aggregate'){
        if(kind==='non_applicable')for(const m of r.mappings)Object.assign(m,{status:'non_applicable',current:[],non_applicability:'Contract double judgment dependent on the complete reviewed current state.'});
        else{
          const evidence=a.packet.children[1].result.items.map(i=>i.id),resolution={status:'resolved',evidence,reason:'Contract double resolution depends on global current scope.'};
          for(const m of r.mappings)m.resolution=clone(resolution);
          r.current_resolutions=evidence.map(item=>({item,...clone(resolution)}));
        }
      }
      return r;
    }});
    f.s.owner={session_id:'replacement',epoch:2};f.s.notices[0].deliveries.push({to:'replacement'});f.s.notices[0].seen.push('replacement');f.s.notices[0].seen_at='now';
    assert.deepEqual(validateQualificationExclusion(f.s,f.proof),f.proof);
    f.s.records.info={id:'info',kind:'artifact',content:'Information only'};assert.deepEqual(validateQualificationExclusion(f.s,f.proof),f.proof);
    f.s.records.display={id:'display',kind:'decision',content:'Use 18 point dashboard text.'};
    assert.throws(()=>validateQualificationExclusion(f.s,f.proof),/semantic subject changed/);
  }
});

test('projection wiring contract double keeps mandatory homes plus new governing records without the represented archive',()=>{
  const f=workflow(undefined,{dependency_ids:['home'],setup:s=>{s.records.home={id:'home',kind:'artifact',content:'Mandatory dependency home: never retry.'};}});f.s.records.display={id:'display',kind:'decision',content:'New mandatory dashboard restriction.'};f.s.owner={session_id:'replacement',epoch:2};
  // The current-state producer must implement this union in production. This
  // contract double demonstrates required retention, not native/integrated QA.
  const proof=validateQualificationExclusion(f.s,f.proof);
  const mandatory=new Map(governingRecords(f.s,{role:'engineer'}).map(r=>[r.id,r]));
  for(const r of proof.counterparts){assert.deepEqual(ref(f.s.records[r.id]),r);mandatory.set(r.id,f.s.records[r.id]);}
  assert.deepEqual([...mandatory.keys()].sort(),['current','display','home']);
  assert.ok([...mandatory.values()].some(r=>r.content.includes('exhausted allowance')));
  assert.ok(mandatory.get('display').content.includes('New mandatory'));
  assert.equal(mandatory.has(proof.source.id),false);assert.ok(f.s.records.old,'original retained for retrieval');
});

test('byte packing preserves exact framed coverage and Unicode, including control-heavy JSON',()=>{
  for(const text of [('a😀 line\n').repeat(5000),('\u0000\u0001\t😀').repeat(5000)]){
    const s=seed(text),p=plan(s),groups=new Map();assert.ok(p.context_partition_plan.units.every(u=>u.bytes<=limits.unit_bytes));
    for(const f of allFragments(s,p).filter(f=>f.domain==='historical'&&f.range)){
      const rs=groups.get(f.path)??[];rs.push(f);groups.set(f.path,rs);
      assert.equal(f.value,text.slice(f.range.delivered_start,f.range.delivered_end));
      assert.ok(!/[\uD800-\uDBFF]$/.test(f.value));assert.ok(!/^[\uDC00-\uDFFF]/.test(f.value));
    }
    assert.ok(groups.size);for(const fs of groups.values()){let end=0;for(const f of fs){assert.equal(f.range.start,end);end=f.range.end;}assert.equal(end,text.length);}
    assert.ok(size(qualificationPlanView(s,{plan_id:p.id}))<limits.input_bytes);
  }
  const s=seed({tiny:Array.from({length:1000},(_,i)=>({rule:'r'+i}))}),p=plan(s);assert.ok(p.context_partition_plan.units.length<100,'small siblings packed into usable units');
});

test('deterministic coverage rejects deleted, duplicated, substituted, overlapping leaves and proof cycles',()=>{
  const f=workflow('semantic source '.repeat(1600));
  for(const mutate of [p=>p.units.pop(),p=>p.units.push(clone(p.units[0])),p=>p.units[0].sha256='forged',p=>p.nodes[0].children.reverse(),p=>p.coverage_sha256='forged']){const p=clone(f.p.context_partition_plan);mutate(p);assert.throws(()=>validateQualificationPlan(f.s,p),/coverage|manifest/);}
  const n=f.p.context_partition_plan.nodes[0];const ids=n.children.map(id=>f.proofs.get(id).id);
  assert.throws(()=>queue(f.s,f.p,{node_id:n.id,child_review_ids:[ids[0],ids[0]]}),/unique/);
  const j=queue(f.s,f.p,{node_id:n.id,child_review_ids:ids.toReversed()});assert.throws(()=>qualificationAssignment(f.s,j),/substituted|overlapping/);
  const missing=queue(f.s,f.p,{root_review_ids:[...f.proof.roots].reverse().map(r=>r.id)});assert.throws(()=>qualificationAssignment(f.s,missing),/substituted/);
});

test('every unique finding, contradiction, allowance and distant boundary retains explicit parent provenance',()=>{
  const s=seed('Restriction-UNIQUE '.repeat(1800)),p=plan(s),proofs=new Map();
  for(const [index,u] of p.context_partition_plan.units.entries()){
    const j=queue(s,p,{unit_id:u.id}),a=qualificationAssignment(s,j),r=result(a);if(u.domain==='historical')r.items=[{id:'unique-'+index,kind:index===0?'contradiction':index===1?'boundary':'exhausted_allowance',text:'Unique complete restriction '+index+' with distant qualifier',provenance:[{fragment:0,path:a.packet.unit.fragments[0].path,range:a.packet.unit.fragments[0].range??null}],basis:'Exact fragment range'}];proofs.set(u.id,complete(s,j,a,r));
  }
  for(const n of p.context_partition_plan.nodes){
    const j=queue(s,p,{node_id:n.id,child_review_ids:n.children.map(id=>proofs.get(id).id)}),a=qualificationAssignment(s,j),r=result(a);
    if(r.items.length){for(const mutate of [r=>r.items.pop(),r=>r.items[0].supports.push('0/invented'),r=>r.items[0].kind='authority']){const bad=clone(r);mutate(bad);assert.throws(()=>validateQualificationResponse(s,j,a,'fresh',bad),/preserved|provenance|kind/);}}
    proofs.set(n.id,complete(s,j,a,r));
  }
  const root=proofs.get(p.context_partition_plan.roots.historical);assert.ok(root.qualification_result.items.length>2);assert.ok(root.qualification_result.items.some(i=>i.kind==='contradiction'));assert.ok(root.qualification_result.items.some(i=>i.kind==='boundary'));
  const j=queue(s,p,{root_review_ids:[root.id,proofs.get(p.context_partition_plan.roots.current).id]}),a=qualificationAssignment(s,j),r=result(a);
  assert.throws(()=>validateQualificationResponse(s,j,a,'independent-final',r),/unresolved/);
  const blocked=result(a,{verdict:'Blocked'});blocked.blockers=['The unique distant qualifier and contradiction have no evidenced current resolution.'];
  const negative=complete(s,j,a,blocked);assert.throws(()=>validateQualificationApply(s,{aggregate_review_id:negative.id}),/negative|Blocked/);
});

test('no current applicability at extraction; final missing mappings and unresolved effects block',()=>{
  const f=workflow();const u=[...f.proofs.values()][0];assert.equal(u.qualification_result.permitted_action,'continue');
  for(const mutate of [r=>r.mappings.pop(),r=>r.mappings[0].current=[],r=>r.mappings[0].current=['invented'],r=>r.mappings[0].status='blocked',r=>r.boundaries_complete=false]){const r=result(f.a);mutate(r);assert.throws(()=>validateQualificationResponse(f.s,f.j,f.a,f.j.native_id,r),/mapping|counterpart|attestation/);}
  const s=seed(),p=plan(s),{j,a}=first(s,p),r=result(a);r.permitted_action='represented-by';assert.throws(()=>validateQualificationResponse(s,j,a,'fresh',r),/attestation/);
});

test('new exact-plan negatives and retained rejected negatives cannot be overwritten by later Pass',()=>{
  const f=workflow();const j=queue(f.s,f.p,{unit_id:f.p.context_partition_plan.units[0].id}),a=qualificationAssignment(f.s,j);complete(f.s,j,a,result(a,{verdict:'Blocked'}));assert.throws(()=>validateQualificationExclusion(f.s,f.proof),/negative/);
  const g=workflow();g.s.jobs.rejected={id:'rejected',status:'failed',rejected_output:{text:'truncated',qualification_negative:'Fail',qualification_plan:ref(g.p)}};assert.throws(()=>validateQualificationExclusion(g.s,g.proof),/rejected negative/);
});

test('independent fresh natives for every leaf, merge and root; producers and CoS excluded',()=>{
  for(const native of ['cos-native','source-author','current-author','plan-author']){const s=seed(),p=plan(s),{j,a}=first(s,p);assert.throws(()=>validateQualificationResponse(s,j,a,native,result(a)),/independence/);}
  const f=workflow(),prior=[...f.proofs.values()][0];assert.throws(()=>validateQualificationResponse(f.s,f.j,f.a,f.s.jobs[prior.job_id].native_id,result(f.a)),/independence|reused/);
  const s=seed(JSON.stringify({calls:[{native_id:'nested-producer'}],unknown:'retain'})),p=plan(s),{j,a}=first(s,p);assert.throws(()=>validateQualificationResponse(s,j,a,'nested-producer',result(a)),/independence/);
  s.retired_sessions=[{instance_id:'retired-instance',native_id:'retired-native'}];assert.throws(()=>validateQualificationResponse(s,j,a,'retired-native',result(a)),/retired.*reused/);
});

test('canonical native receipt/job/artifact corruption always invalidates exclusion',()=>{
  for(const mutate of [f=>delete f.s.jobs[[...f.proofs.values()][0].job_id],f=>f.s.jobs[[...f.proofs.values()][0].job_id].status='failed',f=>f.s.jobs[[...f.proofs.values()][0].job_id].native_id='change',f=>delete f.s.jobs[[...f.proofs.values()][0].job_id].qualification_delivery,f=>[...f.proofs.values()][0].qualification_result.items[0].text='tamper',f=>[...f.proofs.values()][0].qualification_proof.delivery_sha256='forged',f=>f.s.jobs[[...f.proofs.values()][0].job_id].model_evidence={changed:true}]){const f=workflow();mutate(f);assert.throws(()=>validateQualificationExclusion(f.s,f.proof),/canonical|corrupt|missing|changed/);}
  const f=workflow(),proof=clone(f.proof);proof.roots[0].sha256='forged';assert.throws(()=>validateQualificationExclusion(f.s,proof),/proof changed/);
});

test('represented-by counterpart/dependency cycles cannot become exclusion authority',()=>{
  const f=workflow();f.s.context_classifications={current:{partition_qualification:{...f.proof,source:ref(f.s.records.current),counterparts:[ref(f.s.records.old)]}}};
  assert.throws(()=>validateQualificationApply(f.s,{aggregate_review_id:f.r.id}),/cyclic/);
});

test('large current decision is extracted once in bounded units; historical leaves do not repeat current context',t=>{
  const f=workflow('11-char-old',{current:'Retain the exhausted allowance. '.repeat(2400)});assert.ok(size(f.s.records.current)>72500);assert.ok(f.p.context_partition_plan.units.length<20);assert.ok(f.metrics.max_full_prompt_bytes<limits.input_bytes);
  const h=[...f.proofs.values()].find(r=>r.qualification_result.unit_id?.startsWith('historical'));const wire=f.s.jobs[h.job_id].qualification_delivery.wire;assert.ok(!wire.includes('Retain the exhausted allowance.'));
  t.diagnostic(JSON.stringify({label:'contract double current-context convergence',...f.metrics}));
});

test('100K zero findings converges despite per-leaf boilerplate; maximum child responses fit full schema packet',t=>{
  const f=workflow('x'.repeat(100000),{empty:true});assert.ok(f.metrics.units<20);assert.ok(f.metrics.aggregate_bytes<9000);assert.ok(f.metrics.max_full_prompt_bytes<limits.input_bytes);assert.equal(f.r.qualification_result.mappings.length,0);
  t.diagnostic(JSON.stringify({label:'contract double zero findings',...f.metrics}));
});

test('two near-limit child results fit the complete packet; genuinely distinct union holds instead of truncating',t=>{
  const s=seed('full semantics '.repeat(1600)),p=plan(s),n=p.context_partition_plan.nodes[0],proofs=[];
  for(const id of n.children){const j=queue(s,p,{unit_id:id}),a=qualificationAssignment(s,j),r=result(a);r.items[0].text=id+' unique obligation: '+('x'.repeat(10000));assert.ok(size(output(r))<limits.output_bytes);proofs.push(complete(s,j,a,r));}
  const j=queue(s,p,{node_id:n.id,child_review_ids:proofs.map(r=>r.id)}),a=qualificationAssignment(s,j);assert.ok(size(a.text)<limits.input_bytes);assert.ok(size(a.text)>24000);
  assert.throws(()=>validateQualificationResponse(s,j,a,'fresh',result(a)),QualificationHold);
  const blocked=result(a,{verdict:'Blocked'});blocked.items=[];blocked.blockers=['Node '+n.id+': two distinct full requirements exceed output capacity; preserve '+n.children.join(', ')+' and decompose the actual requirements by explicit subsystem before any exclusion.'];assert.equal(validateQualificationResponse(s,j,a,'fresh',blocked),true);
  t.diagnostic(JSON.stringify({label:'contract double near-output-limit reconciliation',full_prompt_bytes:size(a.text),children:proofs.length}));
});

test('content-addressed cache never bypasses exact JSON integrity or mutable-state freshness',()=>{
  const s=seed('cacheable exact source'),p=plan(s),{a}=first(s,p);assert.throws(()=>{a.packet.unit.fragments[0].path='tamper';},TypeError);
  s.records.old.toJSON=()=>({id:'old',kind:'artifact',revision:1,author_instance:'source-author',content:'cacheable exact source'});
  assert.throws(()=>validateQualificationPlan(s,p.context_partition_plan),/JSON/);
  for(const value of [NaN,undefined,new Date(),[,'sparse']]){const state=seed();state.records.old.unknown=value;assert.throws(()=>createQualificationPlan(state,{source_id:'old'}),/JSON/);}
});

test('frozen JSON memoization preserves shallow mutation, replacements and exact descriptor checks',()=>{
  const s=seed();s.records.old.nested={restriction:'Never retry'};Object.freeze(s.records.old);
  const p=plan(s);assert.equal(validateQualificationPlan(s,p.context_partition_plan),true);
  s.records.old.nested.restriction='Changed';assert.throws(()=>validateQualificationPlan(s,p.context_partition_plan),/stale|corrupt/);
  const frozen=seed();immutableJSON(frozen.records.old);const fp=plan(frozen);assert.equal(validateQualificationPlan(frozen,fp.context_partition_plan),true);
  frozen.records.old={...frozen.records.old,content:'Changed'};assert.throws(()=>validateQualificationPlan(frozen,fp.context_partition_plan),/stale|corrupt/);
  const hidden=Object.freeze(Object.defineProperty({},'hidden',{value:'Never retry'})),accessor=Object.freeze({get meaning(){throw new Error('must not invoke getter');}});
  for(const value of [hidden,accessor,Object.freeze([,'sparse']),Object.freeze(Object.assign([,'sparse'],{extra:'not a dense index'}))]){const bad=seed();bad.records.old.extra=value;assert.throws(()=>createQualificationPlan(bad,{source_id:'old'}),/JSON/);}
});

test('frozen JSON memoization never trusts Proxy or custom array serialization',()=>{
  const s=seed();let changed=false;
  const proxy=new Proxy(Object.freeze({restriction:'Never retry'}),{get(target,key,receiver){if(key==='toJSON'&&changed)return ()=>({restriction:'Changed'});return Reflect.get(target,key,receiver);}});
  s.records.old.extra=proxy;immutableJSON(s.records.old);const p=plan(s);assert.equal(validateQualificationPlan(s,p.context_partition_plan),true);
  changed=true;assert.throws(()=>validateQualificationPlan(s,p.context_partition_plan),/stale|corrupt/);
  const arrayState=seed(),prototype=Object.create(Array.prototype),array=Object.freeze(Object.setPrototypeOf(['Never retry'],prototype));
  arrayState.records.old.extra=array;immutableJSON(arrayState.records.old);const ap=plan(arrayState);
  prototype.toJSON=()=>['Changed'];assert.throws(()=>validateQualificationPlan(arrayState,ap.context_partition_plan),/stale|corrupt/);
});

test('frozen arrays cannot replace missing own indices with mutable inherited values',()=>{
  const s=seed();s.records.old.extra=Object.freeze(Object.assign([,'present'],{extra:'compensating key'}));immutableJSON(s.records.old);
  assert.throws(()=>createQualificationPlan(s,{source_id:'old'}),/sparse\/extended JSON array/);
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'0');
  try{Object.defineProperty(Array.prototype,'0',{configurable:true,writable:true,value:'Changed inherited value'});assert.throws(()=>createQualificationPlan(s,{source_id:'old'}),/sparse\/extended JSON array/);}
  finally{if(descriptor)Object.defineProperty(Array.prototype,'0',descriptor);else delete Array.prototype[0];}
});

test('frozen JSON hashes follow changed inherited hooks and keep nesting bounds',()=>{
  const s=seed();s.records.old.extra=['Never retry'];immutableJSON(s.records.old);plan(s);
  const original=ref(s.records.old).sha256;
  for(const prototype of [Object.prototype,Array.prototype]){
    const descriptor=Object.getOwnPropertyDescriptor(prototype,'toJSON');
    try{Object.defineProperty(prototype,'toJSON',{configurable:true,value:()=> 'CHANGED inherited serialization'});const changed=ref(s.records.old).sha256;assert.equal(changed,sha(s.records.old));assert.notEqual(changed,original);}
    finally{if(descriptor)Object.defineProperty(prototype,'toJSON',descriptor);else delete prototype.toJSON;}
    assert.equal(ref(s.records.old).sha256,original);
  }
  const nested=seed();let deep='leaf';for(let i=0;i<200;i++)deep=Object.freeze({child:deep});nested.records.old.extra=deep;
  createQualificationPlan(nested,{source_id:'old'});let wrapped=deep;for(let i=0;i<57;i++)wrapped={wrapped};nested.records.old.extra=wrapped;
  assert.throws(()=>createQualificationPlan(nested,{source_id:'old'}),/nesting/);
});

test('genuinely distinct oversized semantics hold with concrete node/subdomain next action',()=>{
  const s=seed(),p=plan(s),{j,a}=first(s,p),r=result(a);r.items[0].text='Unique constraint '.repeat(1500);
  assert.throws(()=>validateQualificationResponse(s,j,a,'fresh',r),e=>e instanceof QualificationHold&&e.held.next_action.includes('subdomains'));
  const negative=result(a,{verdict:'Blocked'});negative.blockers=['At '+a.packet.unit.id+' split the 1500 distinct constraints by subsystem; no lossless complete result fits.'];assert.equal(validateQualificationResponse(s,j,a,'fresh',negative),true);
});

test('complete 1x/10x/100x UNKNOWN semantic archive workflows, fixed current obligations',t=>{
  for(const factor of [1,10,100]){const f=workflow('No retry after exhausted allowance. '.repeat(30*factor));assert.ok(f.metrics.max_full_prompt_bytes<=limits.input_bytes);assert.ok(f.metrics.aggregate_bytes<9000);t.diagnostic(JSON.stringify({label:'contract double unknown archive',factor,...f.metrics}));}
});

test('complete multi-million unknown semantic workflow converges with every receipt, not sampling', {timeout:600000},t=>{
  const text='No retry after exhausted allowance. 😀\n '.repeat(84000);assert.ok(text.length>3000000);
  // Completed fixture entries are immutable, like retained snapshots. Keep the
  // entire source, every target/reviewer and full canonical receipt traversal.
  const f=workflow(text,{immutable:true});assert.equal(f.proof.reviewers.length,f.metrics.sessions);assert.ok(f.metrics.units<700);assert.ok(f.metrics.sessions<1400);assert.ok(f.metrics.max_full_prompt_bytes<=limits.input_bytes);assert.ok(f.metrics.aggregate_bytes<9000);assert.equal(f.r.qualification_result.mappings.length,1);
  t.diagnostic(JSON.stringify({label:'contract double multi-million COMPLETE workflow; not native QA',source_utf16:text.length,...f.metrics}));
});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-qualification-'));test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function runtimeFixture(content,profile){const root=fs.mkdtempSync(path.join(tmp,'worker-')),session_id=id('founder');process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');engine.bind(root,session_id,'codex');engine.open({root,session_id,epoch:1,idea:'Synthetic partition qualification'},'codex');withStore(root,db=>db.migrate());withStore(root,db=>db.transaction('fixture',s=>{s.governance=seed().governance;s.cos_instructions='No additional authority.';s.roles=seed().roles;s.records.old=seed(content).records.old;s.records.current=seed().records.current;plan(s,profile?{profile}:{});return s;}));return root;}
function runtimeQueue(root,args){let jobId;withStore(root,db=>db.transaction('fixture.queue',s=>{const j=queue(s,s.records.plan,args);j.context_sha256=qualificationAssignment(s,j).hash;jobId=j.id;return s;}));return jobId;}
function output(r){return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};}
const hiddenMarker='UNIQUE_NEGATIVE_NEVER_RETRY_THE_EXHAUSTED_ALLOWANCE';
const hiddenChannels={
  content:v=>{v.content=hiddenMarker;},
  result_unknown_property:v=>{v.qualification_result.hidden_restriction=hiddenMarker;},
  item_unknown_property:v=>{v.qualification_result.items[0].hidden_restriction=hiddenMarker;},
  message_to_engineer:v=>{v.messages=[{to:'engineer',content:hiddenMarker}];},
  message_to_qa:v=>{v.messages=[{to:'qa',content:hiddenMarker}];},
  notice:v=>{v.notices=[{kind:'must_know',summary:hiddenMarker}];},
};
test('injected worker rejects all omitted output channels before persistence and retains exact bad output/provenance',async t=>{
  for(const [channel,inject] of Object.entries(hiddenChannels))await t.test(channel,async()=>{
    const root=runtimeFixture(),s=withStore(root,db=>db.read()),jobId=runtimeQueue(root,{unit_id:s.records.plan.context_partition_plan.units[0].id});
    let raw,calls=0;
    await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{
      calls++;options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
      const value=output(result({packet:JSON.parse(wire)}));inject(value);raw='\n '+JSON.stringify(value,null,1)+'\n';
      return {native_id:'hidden-channel-'+jobId,text:raw};
    });
    const after=withStore(root,db=>db.read()),j=after.jobs[jobId],target=after.records[j.review_of.id];
    assert.equal(calls,1);assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);
    assert.match(j.error,/closed (result|item) keys|must be empty|content disagrees/);
    assert.equal(j.rejected_output.text,raw);assert.equal(j.rejected_output.truncated,false);
    assert.equal(j.rejected_output.author_instance,j.instance_id);assert.equal(j.rejected_output.context_sha256,j.context_sha256);
    assert.deepEqual(j.rejected_output.qualification_plan,target.context_qualification_target.plan);
    assert.deepEqual(j.rejected_output.qualification_target,ref(target));
    assert.ok(!after.messages.some(m=>m.content===hiddenMarker));assert.ok(!after.notices.some(n=>n.summary===hiddenMarker));
    assert.equal(after.context_classifications?.old,undefined);
    assert.throws(()=>validateQualificationApply(after,{aggregate_review_id:j.artifact_id??'missing'}),/missing/);
  });
});

test('malformed raw qualification JSON retains exact text and target provenance through the worker failure path',async()=>{
  const root=runtimeFixture(),s=withStore(root,db=>db.read()),jobId=runtimeQueue(root,{unit_id:s.records.plan.context_partition_plan.units[0].id}),raw='\n {"qualification_result": {"verdict":"Blocked", "reason":"'+hiddenMarker+'"}, BROKEN';
  await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));return {native_id:'malformed-'+jobId,text:raw};});
  const after=withStore(root,db=>db.read()),j=after.jobs[jobId];
  assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);assert.equal(j.rejected_output.text,raw);
  assert.deepEqual(j.rejected_output.qualification_target,ref(after.records[j.review_of.id]));
});

test('worker retains the negative verdict when rejecting unknown qualification output keys',async()=>{
  const root=runtimeFixture(),s=withStore(root,db=>db.read()),jobId=runtimeQueue(root,{unit_id:s.records.plan.context_partition_plan.units[0].id});let raw;
  await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
    const value=output(result({packet:JSON.parse(wire)},{verdict:'Blocked'}));hiddenChannels.result_unknown_property(value);raw=JSON.stringify(value);
    return {native_id:'rejected-negative-'+jobId,text:raw};
  });
  const after=withStore(root,db=>db.read()),j=after.jobs[jobId];
  assert.equal(j.status,'failed');assert.match(j.error,/closed result keys/);assert.equal(j.rejected_output.qualification_negative,'Blocked');assert.equal(j.rejected_output.text,raw);
  assert.deepEqual(j.rejected_output.qualification_plan,after.records[j.review_of.id].context_qualification_target.plan);
});

test('canonical apply rechecks closed leaf envelopes even with refreshed child references',()=>{
  const f=workflow();
  for(const [channel,inject] of Object.entries(hiddenChannels)){
    const s=clone(f.s),leaf=s.records[[...f.proofs.values()][0].id],value=JSON.parse(leaf.qualification_output);
    inject(value);leaf.qualification_output=JSON.stringify(value);leaf.content=value.content;leaf.review=value.review;leaf.qualification_result=value.qualification_result;
    // Refresh the direct parent reference so rejection must come from the output
    // grammar itself, rather than merely an obsolete artifact hash.
    for(const r of Object.values(s.records))for(const [i,child] of (r.context_qualification_target?.children??[]).entries())if(child.id===leaf.id)r.context_qualification_target.children[i]=ref(leaf);
    assert.throws(()=>validateQualificationApply(s,{aggregate_review_id:f.r.id}),/closed (result|item) keys|must be empty|content disagrees/,channel);
    assert.ok(leaf.qualification_output.includes(hiddenMarker));assert.equal(leaf.status,'Submitted');
  }
});

test('closed node-specific grammar covers nested outputs and explicit negatives without filtering source fields',()=>{
  const f=workflow('Bound restriction. '.repeat(1300)),leaf=[...f.proofs.values()].find(r=>r.qualification_result.kind==='unit'),merge=[...f.proofs.values()].find(r=>r.qualification_result.kind==='reconcile');
  const mutations={
    unit:[v=>{v.extra=hiddenMarker;},v=>{v.review.extra=hiddenMarker;},v=>{delete v.notices;},v=>{v.content+=' ';},v=>{v.qualification_result.mappings=[];},v=>{v.qualification_result.items[0].supports=[];},v=>{v.qualification_result.items[0].provenance[0].extra=hiddenMarker;},v=>{v.qualification_result.items[0].provenance[0].range={start:0,end:1,total:1,delivered_start:0,delivered_end:1,encoding:'UTF-16',reconciliation_required:true,extra:hiddenMarker};},v=>{v.qualification_result.blockers=[{hidden_restriction:hiddenMarker}];}],
    reconcile:[v=>{v.qualification_result.unit_id='inappropriate';},v=>{v.qualification_result.items[0].provenance=[];}],
    aggregate:[v=>{v.qualification_result.items=[];},v=>{v.qualification_result.mappings[0].extra=hiddenMarker;},v=>{v.qualification_result.mappings[0].resolution={status:'resolved',evidence:['current'],reason:'Complete evidence',extra:hiddenMarker};},v=>{v.qualification_result.current_resolutions=[{item:'current',status:'resolved',evidence:['current'],reason:'Complete evidence',extra:hiddenMarker}];}],
  };
  for(const record of [leaf,merge,f.r]){
    const valid=JSON.parse(record.qualification_output);assert.equal(validateQualificationEnvelope(valid),valid);
    for(const verdict of ['Pass','Blocked'])for(const mutate of mutations[record.qualification_result.kind]){
      const bad=clone(valid);if(verdict==='Blocked'){Object.assign(bad.qualification_result,{verdict,permitted_action:'hold',blockers:['Cannot judge this scope.']});Object.assign(bad.review,{verdict,permitted_action:'hold'});}
      mutate(bad);assert.throws(()=>validateQualificationEnvelope(bad),/closed|content disagrees|invalid blockers/);
    }
  }
  const s=seed();s.records.old.extra={hidden_restriction:hiddenMarker};s.unknown_input={restriction:'UNKNOWN_CURRENT_INPUT_MUST_BE_REVIEWED'};
  const p=plan(s),fragments=allFragments(s,p);
  assert.ok(fragments.some(v=>v.domain==='historical'&&JSON.stringify(v).includes(hiddenMarker)));
  assert.ok(fragments.some(v=>v.domain==='current'&&JSON.stringify(v).includes('UNKNOWN_CURRENT_INPUT_MUST_BE_REVIEWED')));
  assert.equal(s.records.old.extra.hidden_restriction,hiddenMarker);
});
test('actual paused engine handover admission and QA preserve applied representation before resume',async()=>{
  const root=runtimeFixture();
  const f=workflow(undefined,{setup:s=>{Object.assign(s,withStore(root,db=>db.read()));s.team_sha256=teamHash(s);}});
  withStore(root,db=>db.transaction('fixture.applied',()=>f.s));
  const incoming={root,session_id:id('incoming'),epoch:2};engine.bind(root,incoming.session_id,'codex');
  engine.control({...incoming,action:'handover',expected_epoch:1,source_instruction:'Continue preparation in this coordinator.'},'codex');
  const pending=withStore(root,db=>db.read());assert.equal(pending.owner.epoch,2);assert.equal(pending.handover.status,'pending');
  assert.deepEqual(validateQualificationExclusion(pending,f.proof),f.proof);
  assert.equal(pending.paused,true);
  assert.throws(()=>engine.control({...incoming,action:'resume',expected_epoch:2,source_instruction:'Premature resume must hold.'},'codex'),/reconstruction|QA/);
  assert.throws(()=>validateQualificationApply(pending,{aggregate_review_id:f.r.id}),/stale epoch/);
  const receipt=engine.handover({...incoming,action:'submit',content:'Objectives: preserve the project. Rules: preparation only. Authority: no execution. Pending work: preserve every restriction and failure. Uncertainty: outcomes unknown. Next action: independent review before resuming.'},'codex');
  let job,context,target;
  withStore(root,db=>db.transaction('fixture.handover-review',s=>{
    target=s.records[receipt.id];const key=id('handover-review'),instance=id('handover-qa');
    job={id:key,role:'qa',instance_id:instance,session_key:instance,native_id:null,host:'codex',epoch:2,status:'queued',timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout(),task:'Independently review the complete frozen handover.',inputs:[],review_of:{id:target.id,revision:target.revision},created_at:new Date().toISOString()};
    s.sessions[instance]={instance_id:instance,role:'qa',native_id:null,host:'codex'};context=assignmentContext(s,job);job.context_sha256=context.hash;s.jobs[key]=job;return s;
  }));
  const stream=context.handover_evidence.sources[context.handover_evidence.pages[0].source_id];let offset=0;
  assert.ok(stream.length<10000,'pending QA stream excludes the represented archive and its proof graph');
  assert.ok(stream.raw.includes('Retain the exhausted allowance'));
  assert.equal(withStore(root,db=>db.read()).paused,true);
  await work(root,job.id,async(host,native,wire,dir,remaining,selection,options)=>{
    if(!native)options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
    const reads=[];while(offset<stream.length&&reads.length<4){let length=Math.min(16000,stream.length-offset);if(/[\uD800-\uDBFF]/.test(stream.raw[offset+length-1]))length--;reads.push({source_id:stream.source_id,sha256:stream.sha256,offset,length});offset+=length;}
    const value=reads.length?{reads}:{content:'Contract double: reviewed complete frozen handover.',messages:[],notices:[],citations:JSON.parse(context.text).evidence_protocol.citations.slice(0,1),review:{verdict:'Pass',reason:'Contract double exact handover review; not native acceptance.',permitted_action:'resume_handover',subject_sha256:target.handover.subject_sha256,blockers:[]}};
    return {native_id:'handover-contract-native',text:JSON.stringify(value)};
  });
  const reviewed=withStore(root,db=>db.read());assert.equal(reviewed.jobs[job.id].status,'completed',reviewed.jobs[job.id].error);
  engine.control({...incoming,action:'resume',expected_epoch:2,source_instruction:'Resume preparation after the contract-double handover review.'},'codex');
  const after=withStore(root,db=>db.read());assert.equal(after.handover.status,'completed');assert.equal(after.paused,false);
  assert.deepEqual(validateQualificationExclusion(after,f.proof),f.proof);
  assert.throws(()=>validateQualificationApply(after,{aggregate_review_id:f.r.id}),/stale epoch/);
});

test('actual pending paused handover has bounded current QA projection across represented archive growth',()=>{
  const metrics=[];
  for(const scale of [1,10,100]){
    const root=runtimeFixture(),text='Historical restriction: never retry the exhausted allowance. '.repeat(30*scale);
    const f=workflow(text,{setup:s=>{Object.assign(s,withStore(root,db=>db.read()));s.records.old.content=text;s.team_sha256=teamHash(s);}});
    withStore(root,db=>db.transaction('fixture.applied-growth',()=>f.s));
    const incoming={root,session_id:id('incoming'),epoch:2};engine.bind(root,incoming.session_id,'codex');
    const inspection=engine.control({...incoming,action:'handover',expected_epoch:1,source_instruction:'Continue the exact fictional preparation under the same authority.'},'codex');
    assert.equal(inspection.paused,true);
    const receipt=engine.handover({...incoming,action:'submit',content:'Objectives: preserve the company. Rules: all restrictions remain. Authority: preparation only. Pending: independent QA while paused. Uncertainty: unknown outcomes. Next action: hold ordinary work until accepted.'},'codex');
    const s=withStore(root,db=>db.read()),target=s.records[receipt.id];
    const context=assignmentContext(s,{role:'qa',task:'Check the pending paused handover.',inputs:[],review_of:{id:target.id,revision:1}}),stream=context.handover_evidence.sources[context.handover_evidence.pages[0].source_id];
    assert.deepEqual(validateQualificationExclusion(s,f.proof),f.proof);assert.equal(s.paused,true);assert.equal(s.records.old.content,text);
    assert.ok(stream.raw.includes(s.records.current.content));assert.ok(!stream.raw.includes(text));
    assert.throws(()=>validateQualificationApply(s,{aggregate_review_id:f.r.id}),/epoch/);
    metrics.push({scale,archive_utf16:text.length,pending_stream_utf16:stream.length,initial_packet_utf16:context.text.length});
  }
  assert.ok(Math.max(...metrics.map(m=>m.pending_stream_utf16))-Math.min(...metrics.map(m=>m.pending_stream_utf16))<1500);
  console.log('paused pending handover growth '+JSON.stringify(metrics));
});
test('worker delivers complete bounded wire once, retains canonical native proof and supports different aggregate reviewer',async()=>{
  const root=runtimeFixture('Bound restriction. '.repeat(1300)),s=withStore(root,db=>db.read()),ids=new Map();
  for(const u of s.records.plan.context_partition_plan.units){const jobId=runtimeQueue(root,{unit_id:u.id});let calls=0;
    await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));calls++;assert.equal(native,null);assert.ok(size(wire)<=limits.input_bytes);assert.equal(options.maxOutputCharacters,100000);const packet=JSON.parse(wire),r=result({packet});return {native_id:'worker-native-'+jobId,text:JSON.stringify(output(r))};});
    const after=withStore(root,db=>db.read()),j=after.jobs[jobId];assert.equal(j.status,'completed',j.error);assert.equal(calls,1);assert.equal(j.qualification_delivery.wire_sha256,digest(j.qualification_delivery.wire));ids.set(u.id,j.artifact_id);
  }
  for(const n of s.records.plan.context_partition_plan.nodes){
    const jobId=runtimeQueue(root,{node_id:n.id,child_review_ids:n.children.map(id=>ids.get(id))});
    await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));return {native_id:'worker-merge-'+jobId,text:JSON.stringify(output(result({packet:JSON.parse(wire)})))}});
    const j=withStore(root,db=>db.read()).jobs[jobId];assert.equal(j.status,'completed',j.error);ids.set(n.id,j.artifact_id);
  }
  const roots=s.records.plan.context_partition_plan.roots;
  const agg=runtimeQueue(root,{root_review_ids:[ids.get(roots.historical),ids.get(roots.current)]});await work(root,agg,async(host,native,wire,dir,remaining,selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));return {native_id:'worker-aggregate',text:JSON.stringify(output(result({packet:JSON.parse(wire)})))}});
  const after=withStore(root,db=>db.read());assert.equal(after.jobs[agg].status,'completed',after.jobs[agg].error);assert.equal(validateQualificationApply(after,{aggregate_review_id:after.jobs[agg].artifact_id}).classification,'represented-by');
});

test('wire-size accounting: actual worker retains pretty output and canonical apply enforces both independent caps',async()=>{
  const root=runtimeFixture(),initial=withStore(root,db=>db.read()),ids=new Map(),raws=new Map();
  const run=async args=>{
    const jobId=runtimeQueue(root,args);let raw;
    await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{
      options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
      const value=output(result({packet:JSON.parse(wire)}));
      // Complete pretty JSON, with transport whitespace and escaped UTF-8 data.
      value.qualification_result.reason+=' Exact \"quoted\" path \\ and 😀.';
      value.content=value.review.reason=value.qualification_result.reason;
      raw=JSON.stringify(value,null,10)+'\n'.repeat(limits.output_bytes);
      assert.ok(size(raw)>limits.output_bytes&&size(raw)<=limits.output_wire_bytes);
      assert.ok(size(value)<limits.output_bytes);
      return {native_id:'wire-size-'+jobId,text:raw};
    });
    const s=withStore(root,db=>db.read()),j=s.jobs[jobId];assert.equal(j.status,'completed',j.error);
    assert.equal(s.records[j.artifact_id].qualification_output,raw);raws.set(j.artifact_id,raw);return j.artifact_id;
  };
  const p=initial.records.plan.context_partition_plan;
  for(const u of p.units)ids.set(u.id,await run({unit_id:u.id}));
  for(const n of p.nodes)ids.set(n.id,await run({node_id:n.id,child_review_ids:n.children.map(id=>ids.get(id))}));
  const aggregate=await run({root_review_ids:[ids.get(p.roots.historical),ids.get(p.roots.current)]});
  const after=withStore(root,db=>db.read());assert.equal(validateQualificationApply(after,{aggregate_review_id:aggregate}).classification,'represented-by');
  for(const [id,raw] of raws)assert.equal(after.records[id].qualification_output,raw);
  for(const kind of ['semantic','wire']){
    const s=clone(after),record=s.records[aggregate],value=JSON.parse(record.qualification_output);
    if(kind==='semantic')value.content=value.review.reason=value.qualification_result.reason='😀'.repeat(1100);
    const raw=kind==='wire'?JSON.stringify(value)+' '.repeat(limits.output_wire_bytes):JSON.stringify(value,null,2);
    assert.ok(kind==='wire'?size(value)<limits.output_bytes&&size(raw)>limits.output_wire_bytes:size(value)>limits.output_bytes&&size(raw)<limits.output_wire_bytes);
    record.qualification_output=raw;record.content=value.content;record.review=value.review;record.qualification_result=value.qualification_result;
    const boundary=kind==='wire'?'native-response':'review-envelope';
    assert.throws(()=>validateQualificationApply(s,{aggregate_review_id:aggregate}),e=>e instanceof QualificationHold&&e.held.boundary===boundary);
    const badRoot=runtimeFixture(),badState=withStore(badRoot,db=>db.read());
    const jobId=runtimeQueue(badRoot,{unit_id:badState.records.plan.context_partition_plan.units[0].id});let rejectedRaw;
    await work(badRoot,jobId,async(host,native,wire,dir,remaining,selection,options)=>{
      options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
      const v=output(result({packet:JSON.parse(wire)}));
      if(kind==='semantic')v.content=v.review.reason=v.qualification_result.reason='😀'.repeat(1100);
      rejectedRaw=JSON.stringify(v)+(kind==='wire'?' '.repeat(limits.output_wire_bytes):'');
      return {native_id:'wire-size-reject-'+jobId,text:rejectedRaw};
    });
    const rejected=withStore(badRoot,db=>db.read()).jobs[jobId];assert.equal(rejected.status,'failed');assert.equal(rejected.artifact_id,undefined);
    assert.equal(rejected.qualification_hold.boundary,boundary);assert.equal(rejected.rejected_output.text,rejectedRaw);
  }
});

test('worker rejects supplemental growth, invalid response, CoS native and oversized UTF-8 output',async()=>{
  for(const kind of ['reads','shape','cos','overflow']){
    const root=runtimeFixture(),s=withStore(root,db=>db.read()),j=runtimeQueue(root,{unit_id:s.records.plan.context_partition_plan.units[0].id});let calls=0;
    await work(root,j,async(host,native,wire,dir,remaining,selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));calls++;const a={packet:JSON.parse(wire)},r=result(a),value=output(r);if(kind==='shape')delete value.qualification_result;if(kind==='overflow')value.content='😀'.repeat(5000);return {native_id:kind==='cos'?s.owner.session_id:'worker-'+j,text:JSON.stringify(kind==='reads'?{reads:[{id:'old'}]}:value)};});
    const after=withStore(root,db=>db.read());assert.equal(after.jobs[j].status,'failed');assert.equal(calls,1);assert.equal(after.jobs[j].artifact_id,undefined);if(kind==='overflow')assert.equal(after.jobs[j].qualification_hold.boundary,'review-envelope');
  }
});



test('worker requires observed spawn timing and preserves timeout/closure failure evidence',async()=>{
  for(const failure of ['missing-spawn','timeout']){
    const root=runtimeFixture(),s=withStore(root,db=>db.read()),jobId=runtimeQueue(root,{unit_id:s.records.plan.context_partition_plan.units[0].id});
    await work(root,jobId,async(host,native,wire,dir,remaining,selection,options)=>{
      if(failure==='timeout'){options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));throw Object.assign(Error('Contract adapter timeout'),{code:'ROLE_TIMEOUT',termination_confirmed:true});}
      return {native_id:'unobserved-native',text:JSON.stringify(output(result({packet:JSON.parse(wire)})))};
    });
    const j=withStore(root,db=>db.read()).jobs[jobId];assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);
    assert.equal(j.execution_failure.code,failure==='timeout'?'ROLE_TIMEOUT':'MISSING_EXECUTION_TIMING');assert.equal(j.coordination_release.termination_confirmed,true);
  }
});


test('typed log/file-only restrictions enter extraction units as complete payload semantics',()=>{
 for(const payload of [{type:'source-evidence',log:'UNIQUE_LOG_NEVER_RETRY'},{files:[{path:'constraint.md',content:'UNIQUE_FILE_NEVER_RETRY'}],diff:'source evidence'}]) {
  const marker=payload.log??payload.files[0].content,s=seed(JSON.stringify(payload)),p=plan(s);
  assert.ok(allFragments(s,p).some(f=>f.domain==='historical'&&JSON.stringify(f).includes(marker)));
 }
});

test('dependency-only surviving homes remain exact mandatory counterparts',()=>{
 const s=seed();s.records.home={id:'home',kind:'artifact',revision:1,content:'Never retry the exhausted allowance.'};
 const p={id:'plan',kind:'plan',revision:1,author_instance:'plan-author',context_partition_plan:createQualificationPlan(s,{source_id:'old',counterpart_ids:['current'],dependency_ids:['home']})};s.records.plan=p;
 const proofs=new Map(),run=args=>{const j=queue(s,p,args),a=qualificationAssignment(s,j);return complete(s,j,a,result(a));};
 for(const u of p.context_partition_plan.units)proofs.set(u.id,run({unit_id:u.id}));
 for(const n of p.context_partition_plan.nodes)proofs.set(n.id,run({node_id:n.id,child_review_ids:n.children.map(id=>proofs.get(id).id)}));
 const roots=p.context_partition_plan.roots,r=run({root_review_ids:[proofs.get(roots.historical).id,proofs.get(roots.current).id]});
 assert.deepEqual(validateQualificationApply(s,{aggregate_review_id:r.id}).counterparts,[ref(s.records.current),ref(s.records.home)]);
});

test('ordinary format 3 preserves typed job and upgrade homes without replaying unrelated history',()=>{
  const f=workflow(undefined,{dependency_ids:['job:domain','upgrade:domain'],setup:s=>{
    s.records.domainOutput={id:'domainOutput',kind:'artifact',revision:1,content:'Exact domain output.'};
    s.jobs.domain={id:'domain',status:'completed',artifact_id:'domainOutput',restriction:'Never retry the exhausted domain allowance.'};
    s.jobs.unrelated={id:'unrelated',status:'completed',content:'UNRELATED_ARCHIVE_ONLY'};
    s.upgrade_history=[{id:'domain',status:'failed',error:'Retain the exact domain failure.'},{id:'unrelated',status:'failed',error:'UNRELATED_UPGRADE_ONLY'}];
  }});
  const context=assignmentContext(f.s,{role:'engineer',context_format:3,inputs:[],task:'Current bounded work.'}),pack=JSON.parse(context.text);
  assert.deepEqual(pack.mandatory_execution_evidence.map(e=>e.source.id),['job:domain','upgrade:domain']);
  assert.equal(pack.mandatory_execution_evidence[0].value.restriction,f.s.jobs.domain.restriction);
  assert.ok(!context.text.includes('UNRELATED_ARCHIVE_ONLY'));assert.ok(!context.text.includes('UNRELATED_UPGRADE_ONLY'));
  const rejected=clone(f.s);rejected.jobs.unknownFailure={id:'unknownFailure',rejected_output:{qualification_negative:'Blocked',text:'incomplete'}};assert.throws(()=>validateQualificationExclusion(rejected,f.proof),/unscoped|unknown/);
  f.s.records.domainFail={id:'domainFail',kind:'review',revision:1,status:'Submitted',review_of:{id:'domainOutput',revision:1},review:{verdict:'Fail',reason:'Exact dependency output is incomplete.'}};
  assert.throws(()=>validateQualificationExclusion(f.s,f.proof),/negative/);
});

const large=QUALIFICATION_PROFILES[QUALIFICATION_PROFILE];
test('fresh large profile accepts dense structured extraction; exact output and raw max+1 remain hard holds',()=>{
 const s=seed(),p=plan(s,{profile:QUALIFICATION_PROFILE}),{j,a}=first(s,p),r=result(a);
 r.items=Array.from({length:24},(_,i)=>({...r.items[0],id:'finding-'+i,text:('Condition '+i+' never authorizes retry; allowance exhausted. ').repeat(10)}));
 const v=output(r),raw=JSON.stringify(v);assert.ok(size(raw)>12000&&size(raw)<large.output_bytes);
 validateQualificationOutput(raw,p.context_partition_plan);validateQualificationResponse(s,j,a,'fresh-dense-native',r);
 assert.throws(()=>validateQualificationOutput(raw),/review-envelope/);
 // Pad a structured finding, never an omitted output channel, to the exact cap.
 v.qualification_result.items[0].text+='x'.repeat(large.output_bytes-size(v));
 assert.equal(size(v),large.output_bytes);validateQualificationOutput(JSON.stringify(v),p.context_partition_plan);
 v.qualification_result.items[0].text+='x';assert.throws(()=>validateQualificationOutput(JSON.stringify(v),p.context_partition_plan),e=>e.held.actual_bytes===large.output_bytes+1);
 const small=JSON.stringify(output(result(a))),wire=small+' '.repeat(large.output_wire_bytes-size(small));
 assert.equal(size(wire),large.output_wire_bytes);validateQualificationOutput(wire,p.context_partition_plan);
 assert.throws(()=>validateQualificationOutput(wire+' ',p.context_partition_plan),e=>e.held.actual_bytes===large.output_wire_bytes+1);
});

test('fresh profile immutable binding, exact input max+1, authority fences and failed-job preservation',()=>{
 const s=seed(),p=plan(s,{profile:QUALIFICATION_PROFILE}),{j,a}=first(s,p),old=clone(s);
 for(const mutate of [x=>x.records.plan.context_partition_plan.limits={...large,input_bytes:large.input_bytes+1},x=>delete x.records.plan.context_partition_plan.profile,x=>x.records.plan.context_partition_plan.partitioner='framed-byte-tree-v1',x=>x.records.old.content+=' changed',x=>x.records.current.content+=' changed',x=>x.owner.epoch++,x=>x.paused=true,x=>x.governance+=' changed']){const x=clone(old);mutate(x);assert.equal(qualificationMatches(x,x.jobs[j.id],a.hash),false);}
 assert.throws(()=>createQualificationPlan(s,{source_id:'old',profile:'caller-limits',limits:large}),/unsupported/);
 const legacy=seed(),lp=plan(legacy),prior=clone(lp.context_partition_plan);lp.context_partition_plan.profile=QUALIFICATION_PROFILE;assert.throws(()=>validateQualificationPlan(legacy,lp.context_partition_plan),/legacy/);lp.context_partition_plan=prior;
 legacy.jobs.failed={id:'failed',status:'failed',rejected_output:{text:'original failure'},execution_failure:{code:'ROLE_ABORTED'}};
 const before=JSON.stringify(legacy.jobs.failed);createQualificationPlan(legacy,{source_id:'old',profile:QUALIFICATION_PROFILE});assert.equal(JSON.stringify(legacy.jobs.failed),before);assert.deepEqual(lp.context_partition_plan,prior);
 // Oversized exact target framing must hold before dispatch, even with tiny evidence.
 const t=s.records[j.review_of.id],original=t.id;delete s.records[original];
 t.id='t'.repeat(original.length+large.input_bytes-size(a.text));s.records[t.id]=t;j.review_of.id=t.id;
 const max=qualificationAssignment(s,j);assert.equal(size(max.text),large.input_bytes);
 delete s.records[t.id];t.id+='t';s.records[t.id]=t;j.review_of.id=t.id;
 assert.throws(()=>qualificationAssignment(s,j),e=>e.held.actual_bytes===large.input_bytes+1);
});

test('same complete negative-bearing fictional audit reduces sessions by at least four times with exact retrieval',t=>{
 const text=('Fictional unknown effect; failed allowance remains exhausted; NEVER execute. 😀漢字\n').repeat(2400);
 const setup=s=>{s.records.old.unknown_condition={unless:'owner explicitly authorizes',failure:'prior attempt failed',allowance:0};for(let i=0;i<6;i++)s.records['home'+i]={id:'home'+i,kind:'decision',revision:1,content:('Current home '+i+': no retry, no spending, all unknown conditions bind.\n').repeat(220)};};
 const framed=JSON.stringify({files:[{path:'fictional-audit.txt',content:text}]});
 const before=workflow(framed,{setup}),after=workflow(framed,{setup,profile:QUALIFICATION_PROFILE});
 assert.ok(before.metrics.sessions>=after.metrics.sessions*4,JSON.stringify([before.metrics,after.metrics]));
 for(const f of [before,after]){
  assert.equal(qualificationOriginal(f.s,{source_id:'old'}).raw,JSON.stringify(f.s.records.old));
  const e=buildEvidence({records:{old:f.s.records.old}},[],{wholeBodyAliases:false,checkpointContinuity:true,snapshotState:f.s});
  const payload=Object.values(e.sources).find(v=>v.kind==='payload'&&v.raw===text);
  assert.ok(payload,'exact typed payload must remain retrievable');
  if(payload){let raw='';for(let offset=0;offset<text.length;){const part=qualificationReadEvidence(f.s,{plan_id:'plan',source_id:payload.source_id,sha256:payload.sha256,offset,length:Math.min(8000,text.length-offset)}).evidence;raw+=part.text;offset+=part.length;}assert.equal(raw,text);}
  assert.deepEqual(validateQualificationExclusion(f.s,f.proof),f.proof);
 }
 assert.ok(after.p.context_partition_plan.nodes.some(n=>n.children.length===4));
 t.diagnostic(JSON.stringify({fixture_utf16:text.length,before:before.metrics,after:after.metrics}));
});

test('four maximum child envelopes hold for density before launch; fitting merge retains complete support',()=>{
 for(const maximal of [true,false]){
  const s=seed('Bound unknown effects. '.repeat(7000)),p=plan(s,{profile:QUALIFICATION_PROFILE}),node=p.context_partition_plan.nodes.find(n=>n.children.length===4),reviews=[];
  assert.ok(node);
  for(const id of node.children){const j=queue(s,p,{unit_id:id}),a=qualificationAssignment(s,j),r=result(a);r.items[0].text+='x'.repeat((maximal?large.output_bytes:8000)-size(output(r)));validateQualificationOutput(JSON.stringify(output(r)),p.context_partition_plan);reviews.push(complete(s,j,a,r));}
  const j=queue(s,p,{node_id:node.id,child_review_ids:reviews.map(r=>r.id)});
  if(maximal){assert.throws(()=>qualificationAssignment(s,j),e=>e.held.boundary==='reconciliation-output-density');continue;}
  const a=qualificationAssignment(s,j);assert.equal(a.packet.children.length,4);assert.ok(size(a.text)<large.input_bytes);
  const r=result(a);validateQualificationResponse(s,j,a,'large-parent-native',r);
  r.items[0].supports=[];assert.throws(()=>validateQualificationResponse(s,j,a,'large-parent-native',r),/preserved child/);
 }
 const f=workflow('Never retry.',{profile:QUALIFICATION_PROFILE});
 const incomplete=clone(f.r.qualification_result);incomplete.mappings=[];assert.throws(()=>validateQualificationResponse(f.s,f.j,f.a,f.j.native_id,incomplete),/historical mappings/);
 const bad=clone(f.s);bad.records[f.proofs.values().next().value.id].qualification_result.items[0].kind='contradiction';assert.throws(()=>validateQualificationApply(bad,{aggregate_review_id:f.r.id}),/hold:/);
});

test('actual sibling failure notice invalidates running assignment and retains eligibility-loss abort cause',async()=>{
 const root=runtimeFixture('Fictional never retry. '.repeat(1800),QUALIFICATION_PROFILE),s=withStore(root,db=>db.read()),units=s.records.plan.context_partition_plan.units;
 const sibling=runtimeQueue(root,{unit_id:units[0].id}),running=runtimeQueue(root,{unit_id:units[1].id});let launched=0;
 await work(root,running,async(h,native,wire,dir,remaining,selection,options)=>{
  launched++;options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
  await work(root,sibling,async(h,n,w,d,r,sel,o)=>{o.onSpawn(executionTiming(Date.now(),{timeout_ms:r,timeout_reason:o.timeoutReason}));throw Object.assign(Error('Fictional sibling envelope overflow'),{code:'FIXTURE_OVERFLOW',termination_confirmed:true});});
  const changed=withStore(root,db=>db.read());assert.equal(changed.jobs[sibling].status,'failed');assert.ok(changed.notices.some(n=>n.source_id===sibling||JSON.stringify(n).includes(sibling)));
  await new Promise(resolve=>{const timer=setTimeout(resolve,2500);options.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  assert.equal(options.signal.reason?.code,'ASSIGNMENT_INELIGIBLE');
  throw Object.assign(Error('Adapter reports local process cancellation'),{code:'ROLE_ABORTED',termination_confirmed:true});
 });
 const after=withStore(root,db=>db.read()),j=after.jobs[running];assert.equal(launched,1);assert.equal(j.execution_failure.outcome,'cancellation');assert.equal(j.execution_failure.abort_kind,'eligibility_loss');assert.equal(j.execution_failure.abort.code,'ASSIGNMENT_INELIGIBLE');assert.equal(j.execution_failure.code,'ROLE_ABORTED');assert.equal(j.error,'Assignment is no longer eligible');assert.equal(after.jobs[sibling].execution_failure.code,'FIXTURE_OVERFLOW');assert.equal(after.context_classifications?.old,undefined);assert.ok(after.notices.length>=2);
});
