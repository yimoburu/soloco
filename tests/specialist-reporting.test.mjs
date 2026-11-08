import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {taskAction,runtimeAction} from '../plugins/soloco/runtime/task-runtime.mjs';
import {SPECIALIST_REPORTING,mutationView,publicPage,exactRead,fits} from '../plugins/soloco/runtime/public-response.mjs';

const child=()=>({on(){return this;},unref(){}});
const ready=()=>({available:true,authenticated:true,version:'fictional-reporting-check'});
const launch={launch:child,check:ready};
const output=native=>async(_host,_session,_prompt,_dir,limit,_selection,options)=>{
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));
  return {native_id:native,text:JSON.stringify({content:'Fictional attributable parser finding.',messages:[],notices:[]})};
};
function fixture(host) {
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-specialist-reporting-'))),previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
  const args={root:path.join(base,'company'),session_id:'fictional-founder',epoch:1};fs.mkdirSync(args.root);
  engine.bind(args.root,args.session_id,host);engine.open({...args,idea:'Fictional reporting contract'},host);withStore(args.root,db=>db.migrate());
  return {args,read:()=>withStore(args.root,db=>db.read()),close:()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(base,{recursive:true,force:true});}};
}

for(const host of ['codex','claude'])test(`${host}: reporting cues follow queued, resumed, fresh and review jobs without changing canonical evidence`,async()=>{
  const f=fixture(host);try {
    const dispatch=(extra={})=>engine.dispatch({...f.args,role:'engineer',task:'Inspect the fictional parser.',task_summary:'Inspect parser',...extra},host,launch);
    const first=dispatch();assert.equal(first.status,'queued');assert.equal(first.founder_response,SPECIALIST_REPORTING);
    assert.equal(f.read().jobs[first.id].founder_response,undefined);
    await work(f.args.root,first.id,output('fictional-native-first'));
    const resumed=dispatch();assert.equal(resumed.native_id,'fictional-native-first');assert.equal(resumed.founder_response,SPECIALIST_REPORTING);
    await work(f.args.root,resumed.id,output('fictional-native-first'));
    const fresh=dispatch({fresh_session:true,fresh_session_reason:'Fictional clean bounded assignment.'});
    assert.equal(fresh.native_id,null);assert.notEqual(fresh.instance_id,resumed.instance_id);assert.equal(fresh.founder_response,SPECIALIST_REPORTING);
    const subject=f.read().jobs[first.id].artifact_id;
    const qa=dispatch({role:'qa',review_of:subject,task:'Independently review the exact fictional parser finding.'});
    assert.equal(qa.founder_response,SPECIALIST_REPORTING);assert.notEqual(qa.instance_id,first.instance_id);
    await work(f.args.root,fresh.id,async()=>{throw Object.assign(new Error('Fictional worker held for missing evidence'),{termination_confirmed:true});});
    assert.equal(f.read().jobs[fresh.id].status,'failed');
    assert.equal(f.read().jobs[fresh.id].founder_response,undefined);
    const failedPage=engine.contextControl({...f.args,action:'inspect',collection:'jobs'},host);
    assert.equal(failedPage.items.find(j=>j.id===fresh.id).status,'failed');
    assert.equal(failedPage.founder_response,SPECIALIST_REPORTING);
    const view=engine.status(f.args,host);assert.equal(view.jobs.founder_response,SPECIALIST_REPORTING);assert.equal(view.active_jobs.founder_response,SPECIALIST_REPORTING);
    const source=engine.contextControl({...f.args,action:'inspect',collection:'jobs'},host).items.find(j=>j.id===qa.id).source;
    const raw=JSON.parse(engine.contextControl({...f.args,action:'read',id:source.id,sha256:source.sha256,length:16000},host).text);
    assert.equal(raw.founder_response,undefined);assert.equal(raw.id,qa.id);
  }finally{f.close();}
});

for(const host of ['codex','claude'])test(`${host}: durable jobs appear with reporting cues only after actual queue admission`,()=>{
  const f=fixture(host);try {
    runtimeAction({...f.args,action:'start',source_instruction:'Run only this fictional task.'},host,{launch:child});
    const task=taskAction({...f.args,action:'submit',operation_id:'fictional-submit',source_instruction:'Prepare this fictional parser finding only.',spec:{role:'engineer',task:'Inspect parser',acceptance:'Attributable supplied-source finding.',expected_deliverable:'Parser finding'}},host,{wake:()=>({started:false})});
    assert.equal(f.read().records[task.id].runtime_task.state,'planned');assert.equal(task.founder_response,undefined);
    assert.equal(engine.status(f.args,host).jobs.total,0);
    const receipt=engine.queueRuntimeTask(f.args.root,task.id,launch);
    const page=engine.contextControl({...f.args,action:'inspect',collection:'jobs'},host);
    assert.equal(page.founder_response,SPECIALIST_REPORTING);assert.equal(page.items[0].id,receipt.job_id);assert.equal(page.items[0].status,'queued');
    const state=f.read();assert.equal(state.jobs[receipt.job_id].founder_response,undefined);assert.equal(state.records[task.id].founder_response,undefined);
  }finally{f.close();}
});

test('failed and oversized job projections retain truthful source/status and the reporting cue',()=>{
  const job={id:'fictional-large',role:'engineer',status:'failed',task:'😀'.repeat(50000),error:'Held for missing evidence',instance_id:'fictional-instance'};
  const state={id:'fictional-company',jobs:{[job.id]:job}};
  const receipt=mutationView(job,'job:'+job.id,'jobs');assert(fits(receipt));assert.equal(receipt.status,'failed');assert.equal(receipt.founder_response,SPECIALIST_REPORTING);
  const read=exactRead(state,{id:receipt.source.id,sha256:receipt.source.sha256,length:100});assert.equal(read.text,JSON.stringify(job).slice(0,100));
  const page=publicPage(state,{collection:'jobs'});assert.equal(page.founder_response,SPECIALIST_REPORTING);assert.equal(page.items[0].status,'failed');
  assert.equal(publicPage({records:{}},{collection:'records'}).founder_response,undefined);
  assert.equal(job.founder_response,undefined);
});
