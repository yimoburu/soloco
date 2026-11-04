import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as timeout from '../plugins/soloco/runtime/timeout.mjs';

// Evaluate actual module bodies with explicit boundary doubles. No runtime
// dependency closure, subprocess, CLI, network, or production store is loaded.
const runtime=new URL('../plugins/soloco/runtime/',import.meta.url);
function load(name,deps,names) {
  let source=fs.readFileSync(new URL(name,runtime),'utf8').replace(/^import .*;\r?\n/gm,'');
  const entry=source.indexOf('if(process.argv[1]');
  if(entry>=0)source=source.slice(0,entry);
  source=source.replace(/\bexport (?=(?:async )?function|const|let|class)/g,'');
  return vm.runInNewContext(source+'\n;({'+names.join(',')+'});',deps,{filename:name});
}
function harness() {
  let now=1000000,sequence=0,state={schema:2,plugin_version:'test',owner:{epoch:1,session_id:'founder',host:'codex'},paused:false,roles:{engineer:{name:'Engineer'}},records:{},jobs:{},sessions:{},notices:[],messages:[]};
  let matches=true,scope=true,beforeTransaction;
  const intervals=new Set(),launches=[];
  const iso=()=>new Date(now).toISOString();
  const deps={...timeout,path,os:{homedir:()=>'/unused'},fs:{existsSync:()=>true,mkdirSync:()=>{}},process:{env:{},pid:42,execPath:'/unused/node',argv:[]},Date:class extends Date {static now(){return now;}},AbortController,
    PACKAGE:'/unused',VERSION:'test',SCHEMA:2,stamp:iso,id:p=>p+'-'+(++sequence),digest:()=> 'binding',folder:x=>x,noLink:()=>{},
    withStore:(root,fn)=>fn({read:()=>structuredClone(state),transaction:(type,change)=>{if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=undefined;hook(type);}const next=change(structuredClone(state));state=structuredClone(next);return structuredClone(state);}}),
    owner:(s,session,host,epoch)=>{if(s.owner.session_id!==session || s.owner.host!==host || (epoch!==undefined && s.owner.epoch!==epoch))throw new Error('Stale owner');},
    notice:(s,kind,summary,reference)=>{const n={kind,summary,reference};s.notices.push(n);return n;},
    requireText:(v,label,max=20000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('Invalid '+label);return v;},
    compatibleRuntime:()=>true,upgradePending:()=>false,teamHash:()=> 'team',installedTeam:()=>({}),
    readiness:()=>({available:true,authenticated:true,version:'test'}),modelCatalog:()=>({}),
    normalizeSelection:()=>({mode:'default'}),selectionKey:()=> 'default',activityFor:s=>Object.values(s.jobs).map(j=>({job_id:j.id})),
    assignmentContext:()=>({hash:'context',inputs:[],text:'fixture context'}),contextMatches:()=>matches,
    developmentAssignment:()=>{if(!scope)throw new Error('Scope revoked');},prototypeAssignment:()=>{},
    developmentCapability:()=>({}),prototypeCapability:()=>({}),developmentAction:()=>{},prototypeAction:()=>{},
    developmentBundle:()=>null,prototypeBundle:()=>null,developmentPrompt:()=>'',prototypePrompt:()=>'',
    parseArtifact:JSON.parse,runModel:()=>{throw new Error('Real model forbidden');},dataDir:()=>'/unused',
    setInterval:(fn,ms)=>{assert.equal(ms,100);intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),
    spawn:(...args)=>{launches.push(args);return {on:()=>{},unref:()=>{}};},hooks:()=>{},upgrade:()=>{},upgradeGuidance:''};
  const engine=load('engine.mjs',deps,['dispatch','status','control']);
  const worker=load('worker.mjs',deps,['work']);
  const main=load('main.mjs',{...deps,engine},['toolList','call']);
  const args={root:'/fixture',session_id:'founder',epoch:1,role:'engineer',task:'A bounded fixture assignment'};
  return {engine,worker,main,args,intervals,launches,get state(){return state;},set now(v){now=v;},get now(){return now;},mutate:fn=>fn(state),tick:()=>{for(const fn of [...intervals])fn();},mismatch:()=>{matches=false;},revoke:()=>{scope=false;},before:fn=>{beforeTransaction=fn;},dispatch:settings=>engine.dispatch({...args,...settings},'codex')};
}
const response=()=>({native_id:'native-fixture',text:JSON.stringify({content:'Fixture output',messages:[],notices:[]})});
const spawnAt=(h,options,limit,reason)=>options.onSpawn(timeout.executionTiming(h.now,{timeout_ms:limit,timeout_reason:reason}));

test('dispatch validates and persists policy, and main keeps software-test limits separate',async()=>{
  const h=harness();
  await assert.rejects(h.main.call('company_dispatch',{...h.args,timeout_ms:600001,timeout_reason:'Too long'},'codex'),/range/);
  assert.throws(()=>h.dispatch({timeout_ms:600000}),/reason/);
  assert.throws(()=>h.dispatch({timeout_ms:1000,timeout_reason:' '}),/reason/);
  assert.equal(h.launches.length,0);
  const job=await h.main.call('company_dispatch',{...h.args,timeout_ms:600000,timeout_reason:'  Larger bounded output  '},'codex');
  assert.equal(job.timeout_policy_version,timeout.TIMEOUT_POLICY_VERSION);
  assert.equal(job.timeout_ms,600000);
  assert.equal(job.timeout_reason,'Larger bounded output');
  assert.equal(job.execution_started_at,undefined);
  assert.equal(h.launches.length,1);
  const schema=h.main.toolList.find(t=>t.name==='company_develop').inputSchema;
  assert.equal(schema.properties.timeout_ms.maximum,120000);
  assert.equal(schema.properties.max_attempts.maximum,10);
  const d=harness().dispatch();assert.equal(d.timeout_ms,180000);assert.ok(d.timeout_reason);
});

test('status distinguishes long execution, grace, startup, queue, legacy and inspection',()=>{
  const h=harness(),base=h.dispatch({timeout_ms:600000,timeout_reason:'Large output'}),start=h.now;
  h.mutate(s=>{
    s.jobs[base.id]={...base,status:'running',started_at:new Date(start).toISOString(),...timeout.executionTiming(start,{timeout_ms:600000,timeout_reason:'Large output'})};
    s.jobs.short={...base,id:'short',status:'running',...timeout.executionTiming(start,{timeout_ms:1000,timeout_reason:'Small output'})};
    s.jobs.grace={...s.jobs.short,id:'grace',...timeout.executionTiming(start+1000,{timeout_ms:1000,timeout_reason:'Small output'})};
    s.jobs.software={id:'software',kind:'development_test',status:'running',created_at:'bad'};
    s.jobs.legacy={id:'legacy',status:'running',started_at:new Date(start).toISOString(),created_at:new Date(0).toISOString()};
    s.jobs.bad={id:'bad',status:'running',created_at:new Date(start).toISOString()};
  });
  h.now=start+4000;h.engine.status(h.args,'codex');
  assert.equal(h.state.jobs.short.status,'interrupted');
  assert.equal(h.state.jobs.short.timeout_reconciliation.termination_confirmed,false);
  assert.equal(h.state.jobs.grace.status,'running');
  assert.equal(h.state.jobs.bad.timeout_reconciliation.state,'inspection');
  assert.equal(h.state.jobs.software.status,'running');
  h.now=start+240001;h.engine.status(h.args,'codex');
  assert.equal(h.state.jobs[base.id].status,'running');
  assert.equal(h.state.jobs.legacy.status,'interrupted');
  assert.equal(h.state.jobs.legacy.timeout_reconciliation.legacy,true);
  const q=harness(),queued=q.dispatch();q.now+=240000;q.engine.status(q.args,'codex');
  assert.equal(q.state.jobs[queued.id].timeout_reconciliation.phase,'queue');
  const s=harness(),startup=s.dispatch();s.mutate(db=>{db.jobs[startup.id].status='running';db.jobs[startup.id].started_at=new Date(s.now).toISOString();});
  s.now+=243000;s.engine.status(s.args,'codex');
  assert.equal(s.state.jobs[startup.id].timeout_reconciliation.phase,'startup');
});

test('reconciliation rechecks eligibility inside the store transaction',()=>{
  const h=harness(),job=h.dispatch();h.now+=250000;
  h.before(type=>{assert.equal(type,'jobs.interrupted');h.mutate(s=>{s.jobs[job.id].status='completed';});});
  h.engine.status(h.args,'codex');
  assert.equal(h.state.jobs[job.id].status,'completed');assert.equal(h.state.notices.length,0);
});

test('worker queue delay does not consume custom execution time; actual callback is persisted',async()=>{
  const h=harness(),job=h.dispatch({timeout_ms:600000,timeout_reason:'Long fixture'});
  h.now+=230000;
  await h.worker.work('/fixture',job.id,async(host,native,prompt,dir,limit,selection,options)=>{
    assert.equal(limit,600000);assert.equal(options.timeoutReason,'Long fixture');
    assert.equal(h.state.jobs[job.id].execution_started_at,undefined);
    h.now+=2000;const start=h.now;spawnAt(h,options,limit,options.timeoutReason);
    assert.equal(Date.parse(h.state.jobs[job.id].execution_started_at),start);
    assert.equal(Date.parse(h.state.jobs[job.id].execution_deadline_at),start+limit);
    assert.equal(h.state.jobs[job.id].model_pid,undefined);
    h.now+=250000;h.tick();assert.equal(options.signal.aborted,false);
    h.engine.status(h.args,'codex');assert.equal(h.state.jobs[job.id].status,'running');
    return response();
  });
  assert.equal(h.state.jobs[job.id].status,'completed');assert.equal(h.intervals.size,0);
});

test('new jobs require spawn evidence; legacy injected models remain compatible',async()=>{
  const h=harness(),job=h.dispatch();await h.worker.work('/fixture',job.id,async()=>response());
  assert.equal(h.state.jobs[job.id].status,'failed');
  assert.equal(h.state.jobs[job.id].execution_failure.code,'MISSING_EXECUTION_TIMING');
  assert.equal(h.intervals.size,0);
  const legacy=harness(),old=legacy.dispatch();legacy.mutate(s=>{delete s.jobs[old.id].timeout_policy_version;delete s.jobs[old.id].timeout_ms;delete s.jobs[old.id].timeout_reason;});
  await legacy.worker.work('/fixture',old.id,async()=>response());
  assert.equal(legacy.state.jobs[old.id].status,'completed');assert.equal(legacy.intervals.size,0);
});

test('deadline aborts and late output is quarantined even if model ignores cancellation',async()=>{
  const h=harness(),job=h.dispatch({timeout_ms:1000,timeout_reason:'Short fixture'});
  await h.worker.work('/fixture',job.id,async(host,native,prompt,dir,limit,selection,options)=>{
    spawnAt(h,options,limit,options.timeoutReason);h.now+=limit;h.tick();
    assert.equal(options.signal.aborted,true);assert.equal(options.signal.reason.code,'ROLE_TIMEOUT');
    return response();
  });
  const current=h.state.jobs[job.id];assert.equal(current.status,'quarantined');
  assert.equal(h.state.records[current.artifact_id].status,'Quarantined');
  assert.equal(h.state.sessions[job.session_key].native_id,null);assert.equal(h.intervals.size,0);
});

test('pause, ownership loss, context change and scope revocation abort active work',async()=>{
  for(const change of ['pause','owner','context','scope']) {
    const h=harness(),job=h.dispatch();
    await h.worker.work('/fixture',job.id,async(host,native,prompt,dir,limit,selection,options)=>{
      spawnAt(h,options,limit,options.timeoutReason);
      if(change==='pause')h.engine.control({root:'/fixture',session_id:'founder',action:'pause',expected_epoch:1,source_instruction:'Pause fixture'},'codex');
      if(change==='owner')h.mutate(s=>{s.owner.epoch++;});
      if(change==='context')h.mismatch();
      if(change==='scope')h.revoke();
      h.tick();assert.equal(options.signal.aborted,true,change);
      const error=Object.assign(new Error('Adapter aborted'),{code:'ABORT_ERR',termination_confirmed:false});
      throw error;
    });
    const current=h.state.jobs[job.id];
    assert.equal(current.status,change==='pause'?'cancelled':'failed',change);
    assert.equal(current.execution_failure.outcome,'cancellation');
    assert.equal(current.execution_failure.code,'ABORT_ERR');
    assert.equal(current.execution_failure.termination_confirmed,false);
    assert.equal(current.execution_failure.lifecycle,undefined);
    assert.equal(current.execution_failure.abort.termination_confirmed,undefined);
    assert.equal(Object.keys(h.state.records).filter(k=>k.startsWith('artifact-')).length,0);
    assert.equal(h.intervals.size,0);
  }
});

test('startup expiry aborts without inventing spawn timing and launch errors retain evidence',async()=>{
  const h=harness(),job=h.dispatch();
  await h.worker.work('/fixture',job.id,async(host,native,prompt,dir,limit,selection,options)=>{
    h.now+=240000;h.tick();assert.equal(options.signal.aborted,true);
    assert.equal(options.signal.reason.code,'STARTUP_TIMEOUT');throw options.signal.reason;
  });
  assert.equal(h.state.jobs[job.id].execution_started_at,undefined);
  assert.equal(h.state.jobs[job.id].execution_failure.outcome,'timeout');assert.equal(h.intervals.size,0);
  const f=harness(),failed=f.dispatch();
  await f.worker.work('/fixture',failed.id,async()=>{throw Object.assign(new Error('Spawn failed'),{code:'ENOENT'});});
  assert.equal(f.state.jobs[failed.id].execution_started_at,undefined);
  assert.equal(f.state.jobs[failed.id].execution_failure.code,'ENOENT');
  assert.equal(f.state.jobs[failed.id].execution_failure.termination_confirmed,undefined);assert.equal(f.intervals.size,0);
});
