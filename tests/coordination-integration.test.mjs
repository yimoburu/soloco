import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';import {withStore,id,stamp} from '../plugins/soloco/runtime/store.mjs';import {work} from '../plugins/soloco/runtime/worker.mjs';import {bindCoordination} from '../plugins/soloco/runtime/coordination.mjs';import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';

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
