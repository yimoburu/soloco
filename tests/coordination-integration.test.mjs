import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';import {withStore,id,stamp} from '../plugins/soloco/runtime/store.mjs';import {work} from '../plugins/soloco/runtime/worker.mjs';import {bindCoordination,resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';import {recordReference} from '../plugins/soloco/runtime/current-state.mjs';import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';

test('actual store and worker admit concurrent disjoint roles and retain independent output lineage',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-integration-')),cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-cache-')),old=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
 try {
  const args={root,session_id:id('founder'),idea:'Fictional scheduling fixture'};engine.bind(root,args.session_id,'codex');engine.open(args,'codex');
  const queue=(role,resources)=>withStore(root,db=>db.transaction('fixture.queued',s=>{
   const jid=id('job'),instance=id(role);s.sessions[role]={instance_id:instance,role,native_id:null,host:'codex'};
   s.jobs[jid]={id:jid,role,session_key:role,instance_id:instance,host:'codex',epoch:1,status:'queued',task:'Prepare bounded fictional evidence',inputs:[],review_of:null,coordination:bindCoordination(s,{resources}),created_at:stamp()};return s;
  })).jobs;
  const first=Object.values(queue('engineer',['source/one'])).find(j=>j.role==='engineer');
  const second=Object.values(queue('research',['source/two'])).find(j=>j.role==='research');
  let firstDone,secondDone;
  const model=(role,set)=>async(host,native,prompt,dir,limit,selection,options)=>{
   options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));
   return new Promise(resolve=>set(()=>resolve({native_id:'fictional-'+role,text:JSON.stringify({content:'Bounded fixture findings',messages:[],notices:[]})})));
  };
  const a=work(root,first.id,model('engineering',resolve=>{firstDone=resolve;}));
  const b=work(root,second.id,model('research',resolve=>{secondDone=resolve;}));
  const observed=engine.status(args,'codex');assert.equal(observed.jobs.filter(j=>j.status==='running').length,2);
  assert.equal(observed.resource_claims.length,2);firstDone();await a;
  let state=engine.status(args,'codex');assert.equal(state.jobs.find(j=>j.id===first.id).status,'completed');assert.equal(state.jobs.find(j=>j.id===second.id).status,'running');
  assert.deepEqual(state.resource_claims.map(c=>c.resource),['source/two']);secondDone();await b;
  state=engine.status(args,'codex');assert.equal(state.jobs.filter(j=>j.status==='completed').length,2);assert.equal(state.resource_claims.length,0);
  assert.notEqual(state.jobs[0].native_id,state.jobs[1].native_id);
 } finally {if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});}
});

test('format-3 supplemental failure keeps exclusive resources until that invocation closes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-reads-')),cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-coordination-cache-')),old=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
 try {
  const args={root,session_id:id('founder'),idea:'Fictional bounded evidence fixture'};engine.bind(root,args.session_id,'codex');engine.open(args,'codex');
  const key=id('job'),instance=id('research');let source;
  withStore(root,db=>db.transaction('fixture.queued',s=>{
   source={id:'source',kind:'artifact',revision:1,content:'Exact fictional supplemental evidence'};s.records.source=source;
   const job={id:key,role:'research',session_key:instance,instance_id:instance,host:'codex',epoch:1,status:'queued',task:'Inspect exact optional evidence',inputs:[],review_of:null,context_format:3,supplemental_sources:[recordReference(source)],coordination:bindCoordination(s,{resources:['shared-read-output']}),created_at:stamp()};
   s.sessions[instance]={instance_id:instance,role:'research',native_id:null,host:'codex'};s.jobs[key]={...job,context_sha256:assignmentContext(s,job).hash};return s;
  }));
  let calls=0;
  await work(root,key,async(_host,native,prompt,_dir,limit,_selection,options)=>{
   if(calls++===0){options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-read-session',text:JSON.stringify({reads:[{...recordReference(source),offset:0,length:20}]})};}
   assert.equal(native,'fictional-read-session');assert.match(prompt,/record-reads-v1/);
   throw Object.assign(new Error('Second invocation closure unknown'),{termination_confirmed:false});
  });
  const state=withStore(root,db=>db.read());assert.equal(calls,2);assert.equal(state.jobs[key].status,'failed');assert.equal(state.jobs[key].retrieved_inputs.length,1);
  assert.equal(state.jobs[key].coordination_release,undefined);assert.deepEqual(resourceClaims(state).map(c=>c.resource),['shared-read-output']);
 } finally {if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});}
});

test('format-3 dependency artifacts remain explicit inputs and coordination stays immutable',()=>{
 const record={id:'evidence',revision:1,kind:'artifact',content:'Completed exact producer output',status:'Submitted',job_id:'producer',author_instance:'producer-instance'};
 const state={id:'fixture',records:{evidence:record},jobs:{producer:{id:'producer',instance_id:'producer-instance',epoch:1,status:'completed',artifact_id:'evidence'}},owner:{epoch:1},roles:{research:{name:'Research'}},notices:[],messages:[]};
 const coordination=bindCoordination(state,{depends_on:['producer'],resources:['output']});
 const job={role:'research',task:'Use the prerequisite',context_format:3,coordination,inputs:[{id:'evidence',revision:1}]};
 const before=assignmentContext(state,job),pack=JSON.parse(before.text);assert.deepEqual(pack.assignment.coordination,coordination);assert.deepEqual(before.inputs,[{id:'evidence',revision:1}]);
 job.coordination={...coordination,resources:['changed']};assert.notEqual(assignmentContext(state,job).hash,before.hash);
});
