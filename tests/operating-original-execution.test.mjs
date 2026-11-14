// Source component regressions. Store history, assignment issuers, launch tokens,
// adapter observers and operating validators are original. Only the retained
// ChildProcess emitters/model text are controlled; no OS child, provider, Native
// acceptance or actual company is exercised by this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store,SCHEMA,VERSION,installedTeam,teamHash,stamp,digest} from '../plugins/soloco/runtime/store.mjs';
import {proposeOperatingState,operatingReviewContext,publishOperatingState,operatingContext,admitOperatingAssignment} from '../plugins/soloco/runtime/operating-state.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {TIMEOUT_POLICY_VERSION,normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';
import {recordOriginalWorkerAssignmentFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {stageOriginalWorker,disposeOriginalProcessFixtures} from './original-adapter-process-fixture.mjs';
import {startOriginalModel} from './original-worker-model-fixture.mjs';

const instruction='Controlled Source operating bookkeeping only; no external execution or new authority.';
const hash=value=>digest(JSON.stringify(value));
function fixture(t){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-operating-original-SOURCE-'))),store=new Store(root,true),team={...installedTeam(),roles:{qa:{name:'QA'},engineer:{name:'Engineering'}},governance:'Read only; no external authority.',cos_instructions:'Retain all conditions and uncertainty.'};
  t.after(()=>{disposeOriginalProcessFixtures(root);store.close();fs.rmSync(root,{recursive:true,force:true});});
  store.transaction('company.created',()=>({schema:SCHEMA,runtime_version:VERSION,id:'SOURCE-operating-'+randomUUID(),name:'Controlled operating Source fixture',idea:instruction,phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:'SOURCE-operating-founder',epoch:1},records:{},sessions:{},jobs:{},messages:[],notices:[],created_at:stamp()}));
  if(store.storageInfo().format!=='normalized-v4')store.migrate();
  store.transaction('SOURCE.operating-home',s=>{
    s.records.home={id:'home',kind:'artifact',revision:1,status:'Submitted',author_role:'runner',author_instance:s.owner.session_id,content:'Retain this fictional unresolved obligation.',created_at:stamp(),operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'Always preserve uncertainty.',exceptions:'None',clearing:'Independent exact disposition.',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['home']}};return s;
  });
  let plan;store.transaction('SOURCE.operating-plan',s=>{plan=proposeOperatingState(s,{source_instruction:instruction,valid_until:null});return s;});
  assert.deepEqual(plan.frontier,[]);
  return {root,store,plan,read:()=>store.read()};
}
function queue(f,{ordinary=false}={}){
  const id='SOURCE-operating-job-'+randomUUID(),instance='SOURCE-instance-'+randomUUID();
  f.store.transaction('job.queued',s=>{
    const job={id,role:ordinary?'engineer':'qa',instance_id:instance,session_key:instance,host:'codex',epoch:1,native_id:null,status:'queued',task:ordinary?'Read the accepted fictional operating conditions.':'Independently review the complete fictional operating conditions.',context_format:ordinary?6:3,review_of:ordinary?null:{id:f.plan.id,revision:1},inputs:[],created_at:stamp(),timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout()};
    recordOriginalWorkerAssignmentFrom(f.store,s,job);
    const context=assignmentContext(s,job);job.inputs=context.inputs;job.context_sha256=context.hash;
    if(ordinary)admitOperatingAssignment(s,job);
    s.jobs[id]=job;s.sessions[instance]={instance_id:instance,role:job.role,host:'codex',native_id:null};return s;
  });
  return id;
}
const reviewContext=(f,id)=>{const s=f.read();return operatingReviewContext(s,s.jobs[id]);};
async function completeReview(f,id){
  const carrier=stageOriginalWorker(f.root,id);
  await work(f.root,id,async(...args)=>{
    assert.doesNotThrow(()=>reviewContext(f,id),'original launch/request/birth bookkeeping must preserve the same plan');
    const model=startOriginalModel(args,{nativeId:'SOURCE-independent-operating-reviewer'});
    assert.doesNotThrow(()=>reviewContext(f,id),'the original model birth must preserve the same plan');
    model.respond(JSON.stringify({content:'Controlled Source judgment only.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete review, not Native acceptance.',permitted_action:'publish_operating_state',plan_sha256:hash(f.read().records[f.plan.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}}));
    return model.promise;
  });
  const done=f.read().jobs[id];assert.equal(done.status,'completed',done.error);
  carrier.dispose();
  assert.doesNotThrow(()=>reviewContext(f,id),'original model and carrier close events retain the exact review');
  return f.read().jobs[id];
}

test('genuine Original queue, retained worker and model lifecycle preserve the exact operating review',async t=>{
  const f=fixture(t),id=queue(f),before=reviewContext(f,id);
  const done=await completeReview(f,id),after=reviewContext(f,id);
  assert.equal(after.hash,before.hash);
  assert.equal(done.original_execution_assignment.launches.filter(l=>l.kind==='model').length,1);
  assert(done.original_execution_assignment.launches.every(l=>l.birth&&l.closure));
  assert.equal(done.coordination_release.termination_confirmed,true);
});

test('accepted operating checkpoint admits an ordinary Original assignment across launch phases',async t=>{
  const f=fixture(t),review=await completeReview(f,queue(f));
  f.store.transaction('SOURCE.operating-apply',s=>{assert.equal(publishOperatingState(s,{plan_id:f.plan.id,review_id:review.artifact_id}).published,true);return s;});
  assert.doesNotThrow(()=>operatingContext(f.read()));
  const id=queue(f,{ordinary:true}),carrier=stageOriginalWorker(f.root,id);
  assert.doesNotThrow(()=>operatingContext(f.read()),'the queued static admission remains valid after the original worker birth');
  carrier.dispose();
  assert.doesNotThrow(()=>operatingContext(f.read()),'an observed close changes no admitted business field');
});

test('copied Original bookkeeping DATA does not acquire the private history proof',t=>{
  const f=fixture(t),id=queue(f);stageOriginalWorker(f.root,id);
  const original=f.read(),copied=inheritSnapshots(original,structuredClone(original));
  assert.throws(()=>operatingReviewContext(copied,copied.jobs[id]),/Held|DIRTY/);
  assert.doesNotThrow(()=>reviewContext(f,id));
});

test('an Original event name and journal cannot hide an intermediate business mutation that is reverted',t=>{
  const f=fixture(t),id=queue(f),task=f.read().jobs[id].task;
  // Real Store events/journal, but no real Original birth is asserted here.
  // The deliberately wrong business write must remain DIRTY even after revert.
  f.store.transaction('job.original_execution.born',s=>{s.jobs[id].task='An undeclared replacement task.';return s;});
  f.store.transaction('job.original_execution.born',s=>{s.jobs[id].task=task;return s;});
  assert.throws(()=>reviewContext(f,id),/DIRTY/);
});

test('failed uncreated Original model intent retains UNKNOWN and cannot qualify an operating review',async t=>{
  const f=fixture(t),id=queue(f),carrier=stageOriginalWorker(f.root,id);
  await work(f.root,id,async()=>{throw Error('Controlled failure before Node model creation.');});
  carrier.dispose();const state=f.read(),job=state.jobs[id],models=job.original_execution_assignment.launches.filter(l=>l.kind==='model');
  assert.equal(job.status,'failed');assert.equal(models.length,1);assert.equal(models[0].birth,null);assert.equal(models[0].closure,null);
  assert.notEqual(job.coordination_release?.termination_confirmed,true);
  assert.throws(()=>operatingReviewContext(state,job),/Held|DIRTY/);
});
