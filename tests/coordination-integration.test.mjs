import { exactStatus, exactCollection } from './helpers/public-exact.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';import {withStore,id} from '../plugins/soloco/runtime/store.mjs';import {work} from '../plugins/soloco/runtime/worker.mjs';import {bindCoordination,resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';import {recordReference} from '../plugins/soloco/runtime/current-state.mjs';import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {launchOriginalWorker,startOriginalModel,disposeOriginalProcessFixtures} from './original-worker-model-fixture.mjs';

// Source-controlled ChildProcess events exercise the real assignment, adapter,
// worker and Store producers; they do not establish OS/Native/provider execution.
const controlledDispatch={launch:launchOriginalWorker,check:()=>({available:true,authenticated:true,version:'SOURCE-controlled'})};

test('actual store and worker admit concurrent disjoint roles and retain independent output lineage',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-integration-')),cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-cache-')),old=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
 try {
  const args={root,session_id:id('founder'),idea:'Fictional scheduling fixture'};engine.bind(root,args.session_id,'codex');engine.open(args,'codex');
  const queue=(role,resources)=>{
   engine.dispatch({...args,epoch:1,role,task:'Prepare bounded fictional evidence',resources},'codex',controlledDispatch);
   return withStore(root,db=>Object.values(db.read().jobs).find(j=>j.role===role));
  };
  const first=queue('engineer',['source/one']);
  const second=queue('research',['source/two']);
  let firstDone,secondDone;
  const model=(role,set)=>(...callArgs)=>{
   const call=startOriginalModel(callArgs,{nativeId:'fictional-'+role});let released=false;
   set(()=>{if(released)return;released=true;call.respond(JSON.stringify({content:'Bounded fixture findings',messages:[],notices:[]}));});
   return call.promise;
  };
  const a=work(root,first.id,model('engineering',resolve=>{firstDone=resolve;}));
  const b=work(root,second.id,model('research',resolve=>{secondDone=resolve;}));
  try {
  const observed=exactStatus(args,'codex');assert.equal(observed.jobs.filter(j=>j.status==='running').length,2);
  assert.equal(observed.resource_claims.total,2);firstDone();await a;
  let state=exactStatus(args,'codex');assert.equal(state.jobs.find(j=>j.id===first.id).status,'completed');assert.equal(state.jobs.find(j=>j.id===second.id).status,'running');
  assert.deepEqual(exactCollection(args,'codex','claimed_jobs').flatMap(row=>row.value.coordination.resources),['source/two']);assert.equal(state.resource_claims.total,1);secondDone();await b;
  state=exactStatus(args,'codex');assert.equal(state.jobs.filter(j=>j.status==='completed').length,2);assert.equal(state.resource_claims.total,0);
  assert.notEqual(state.jobs[0].native_id,state.jobs[1].native_id);
  } finally {firstDone?.();secondDone?.();await Promise.allSettled([a,b]);}
 } finally {disposeOriginalProcessFixtures(root);if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});}
});

test('format-3 supplemental failure keeps exclusive resources until that invocation closes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-reads-')),cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-cache-')),old=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
 try {
  const args={root,session_id:id('founder'),idea:'Fictional bounded evidence fixture'};engine.bind(root,args.session_id,'codex');engine.open(args,'codex');
  let source;
  withStore(root,db=>db.transaction('fixture.source',s=>{
   source={id:'source',kind:'artifact',revision:1,content:'Exact fictional supplemental evidence'};s.records.source=source;
   return s;
  }));
  engine.dispatch({...args,epoch:1,role:'research',task:'Inspect exact optional evidence',evidence_ids:[source.id],resources:['shared-read-output']},'codex',controlledDispatch);
  const key=withStore(root,db=>Object.values(db.read().jobs).find(j=>j.role==='research').id);
  let calls=0,lastCall;
  await work(root,key,(...callArgs)=>{
   const [,native,prompt,,limit]=callArgs;
   if(calls++===0){const call=startOriginalModel(callArgs,{nativeId:'fictional-read-session'});call.respond(JSON.stringify({reads:[{...recordReference(source),offset:0,length:20}]}));return call.promise;}
   assert.equal(native,'fictional-read-session');assert.match(prompt,/record-reads-v1/);
   lastCall=startOriginalModel(callArgs,{nativeId:'fictional-read-session'});
   lastCall.clock.move(lastCall.clock.time+limit+3000);return lastCall.promise;
  });
  let state=withStore(root,db=>db.read());assert.equal(calls,2);assert.equal(state.jobs[key].status,'failed');assert.equal(state.jobs[key].retrieved_inputs.length,1);
  assert.equal(state.jobs[key].execution_failure.termination_confirmed,false);assert.equal(state.jobs[key].model_process_tracking.invocations.length,2);assert.ok(state.jobs[key].model_process_tracking.invocations[0].closure);assert.equal(state.jobs[key].model_process_tracking.invocations[1].closure,null);
  assert.equal(state.jobs[key].coordination_release,undefined);assert.deepEqual(resourceClaims(state).map(c=>c.resource),['shared-read-output']);
 } finally {disposeOriginalProcessFixtures(root);if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});}
});

test('format-3 dependency artifacts remain explicit inputs and coordination stays immutable',()=>{
 const record={id:'evidence',revision:1,kind:'artifact',content:'Completed exact producer output',status:'Submitted',job_id:'producer',author_instance:'producer-instance'};
 const state={id:'fixture',records:{evidence:record},jobs:{producer:{id:'producer',instance_id:'producer-instance',epoch:1,status:'completed',artifact_id:'evidence'}},owner:{epoch:1},roles:{research:{name:'Research'}},notices:[],messages:[]};
 const coordination=bindCoordination(state,{depends_on:['producer'],resources:['output']});
 const job={role:'research',task:'Use the prerequisite',context_format:3,coordination,inputs:[{id:'evidence',revision:1}]};
 const before=assignmentContext(state,job),pack=JSON.parse(before.text);assert.deepEqual(pack.assignment.coordination,coordination);assert.deepEqual(before.inputs,[{id:'evidence',revision:1}]);
 job.coordination={...coordination,resources:['changed']};assert.notEqual(assignmentContext(state,job).hash,before.hash);
});
