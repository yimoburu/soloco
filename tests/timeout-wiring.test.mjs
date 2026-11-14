import * as developmentBudget from '../plugins/soloco/runtime/development-budget-runtime.mjs';
import * as reviewContinuation from '../plugins/soloco/runtime/development-review-continuation.mjs';
import * as retentionRepair from '../plugins/soloco/runtime/development-retention-repair.mjs';
import * as modelProcessClosure from '../plugins/soloco/runtime/model-process-closure.mjs';
import {outcomeSchema} from '../plugins/soloco/runtime/outcome.mjs';
import {peerRuntimeFields} from '../plugins/soloco/runtime/peer-runtime.mjs';
import {peerAdoptionToolSchema} from '../plugins/soloco/runtime/peer-adoption-runtime.mjs';
import {peerOwnerToolSchema} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
import {peerOriginToolSchema} from '../plugins/soloco/runtime/peer-origin-runtime.mjs';
import {mcpCallerDiagnostic} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {developmentDeliveryContractSchema,developmentDeliveryTransitionFields,boundedDevelopmentAcceptanceReply} from '../plugins/soloco/runtime/development-delivery.mjs';
import * as scopedStream from '../plugins/soloco/runtime/scoped-stream.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import * as publicResponse from '../plugins/soloco/runtime/public-response.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as coordination from '../plugins/soloco/runtime/coordination.mjs';
import * as timeout from '../plugins/soloco/runtime/timeout.mjs';
import {renderDevelopmentReviewContext} from '../plugins/soloco/runtime/development-receipt-json.mjs';
import {isOriginMechanicalQaTarget,workPeerOriginMechanicalQa} from '../plugins/soloco/runtime/origin-mechanical-qa-worker.mjs';

// Evaluate actual module bodies with explicit boundary doubles. No real
// model, subprocess, CLI, network, or production store is opened. Public
// presentation helpers use their pure production implementations.
const runtime=new URL('../plugins/soloco/runtime/',import.meta.url);
function load(name,deps,names) {
  let source=fs.readFileSync(new URL(name,runtime),'utf8');
  if(name==='engine.mjs') {
    const binding="import {dataDir} from './plugin-data.mjs';",reexport="export {dataDir} from './plugin-data.mjs';";
    assert.equal(source.split(binding).length,2,'engine must import the exact shared data helper once');
    assert.equal(source.split(reexport).length,2,'engine must re-export the exact shared data helper once');
    assert.equal(typeof deps.dataDir,'function','engine VM needs its controlled data helper binding');
    source=source.replace(reexport,'');
  }
  if(name==='main.mjs'||name==='engine.mjs') {
    const names=name==='main.mjs'?['DEVELOPMENT_BUDGET_ACTIONS','developmentBudgetInputSchema','isDevelopmentBudgetRequest','validateDevelopmentBudgetRequest']:['isDevelopmentBudgetRequest','validateDevelopmentBudgetRequest','developmentBudgetRuntimeAction'];
    const binding='import {'+names.join(',')+"} from './development-budget-runtime.mjs';";
    assert.equal(source.split(binding).length,2,'VM must bind the exact current budget import once');
    for(const key of names)assert.notEqual(developmentBudget[key],undefined,'Actual budget export must exist: '+key);
    for(const key of names)assert.equal(deps[key],developmentBudget[key],'VM must use the actual budget export: '+key);
    if(name==='main.mjs'){assert.equal(typeof publicResponse.toolCatalogReply,'function');assert.equal(deps.toolCatalogReply,publicResponse.toolCatalogReply,'VM must use the actual catalog reply export');}
  }
  source=source.replace(/^import .*;\r?\n/gm,'');
  const entry=source.indexOf('if(process.argv[1]');
  if(entry>=0)source=source.slice(0,entry);
  source=source.replace(/\bexport (?=(?:async )?function|const|let|class)/g,'');
  return vm.runInNewContext(source+'\n;({'+names.join(',')+'});',deps,{filename:name});
}
function harness(publicOverrides={}) {
  let now=1000000,sequence=0,state={schema:2,plugin_version:'test',owner:{epoch:1,session_id:'founder',host:'codex'},paused:false,roles:{engineer:{name:'Engineer'}},records:{},jobs:{},sessions:{},notices:[],messages:[]};
  let matches=true,scope=true,beforeTransaction;
  const intervals=new Set(),launches=[];
  // Closed fictional metadata for this stripped-import VM only. These numbers
  // are not actual files, SQLite custody, host identity or closure evidence.
  const vmPhysical=new Map([['/fixture',{ino:1n,directory:true}],['/fixture/.company',{ino:2n,directory:true}],['/fixture/.company/company.sqlite',{ino:3n,directory:false}]]);
  const vmFs={existsSync:()=>true,mkdirSync:()=>{},
    realpathSync:file=>{assert.equal(file,'/fixture','VM monitor may resolve only its fixed fictional root');return file;},
    lstatSync:(file,options)=>{
      assert.equal(options?.bigint,true);assert.deepEqual(Object.keys(options),['bigint']);
      const entry=vmPhysical.get(file);assert.ok(entry,'Unknown VM physical metadata path');
      return {dev:1n,ino:entry.ino,isSymbolicLink:()=>false,isDirectory:()=>entry.directory,isFile:()=>!entry.directory};
    }};
  const iso=()=>new Date(now).toISOString();
  const deps={...developmentBudget,...reviewContinuation,...retentionRepair,...modelProcessClosure,requestModelProcess:(job,value)=>modelProcessClosure.requestModelProcess(job,structuredClone(value)),outcomeSchema,developmentDeliveryContractSchema,developmentDeliveryTransitionFields,boundedDevelopmentAcceptanceReply,renderDevelopmentReviewContext,Buffer,...scopedStream,scoped:{...scoped},...publicResponse,...coordination,...timeout,path,os:{homedir:()=>'/unused'},fs:vmFs,process:{cwd:()=>process.cwd(),env:{},pid:42,execPath:'/unused/node',argv:[]},Date:class extends Date {static now(){return now;}},AbortController,
    PACKAGE:'/unused',VERSION:'test',SCHEMA:2,stamp:iso,id:p=>p+'-'+(++sequence),digest:()=> 'binding',folder:x=>x,noLink:()=>{},
    // No changeToken is supplied: every VM tick must revalidate the mutable
    // controlled state, including non-store context/scope boundary doubles.
    withStore:(root,fn)=>fn({root,readSnapshot:fn=>fn(),publicReconciliationState:()=>null,read:()=>structuredClone(state),transaction:(type,change)=>{if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=undefined;hook(type);}const next=change(structuredClone(state));state=structuredClone(next);return structuredClone(state);}}),
    owner:(s,session,host,epoch)=>{if(s.owner.session_id!==session || s.owner.host!==host || (epoch!==undefined && s.owner.epoch!==epoch))throw new Error('Stale owner');},
    notice:(s,kind,summary,reference)=>{const n={kind,summary,reference};s.notices.push(n);return n;},
    requireText:(v,label,max=20000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('Invalid '+label);return v;},
    compatibleRuntime:()=>true,upgradePending:()=>false,teamHash:()=> 'team',installedTeam:()=>({}),
    readiness:()=>({available:true,authenticated:true,version:'test'}),modelCatalog:()=>({}),
    normalizeSelection:()=>({mode:'default'}),selectionKey:()=> 'default',selectionUsage:()=>({scope:"test_stub"}),activityFor:s=>Object.values(s.jobs).map(j=>({job_id:j.id})),
    contextBudgetForJob:()=>200000,assignmentContext:(s,j)=>({hash:'context',inputs:j.inputs??[],text:'fixture context'}),contextMatches:()=>matches,
    developmentAssignment:()=>{if(!scope)throw new Error('Scope revoked');},prototypeAssignment:()=>{},
    developmentLimits:()=>({max_bytes:100000}),developmentCapability:()=>({}),prototypeCapability:()=>({}),developmentAction:()=>{},prototypeAction:()=>{},
    developmentBundle:()=>null,prototypeBundle:()=>null,developmentPrompt:()=>'',prototypePrompt:()=>'',
    parseArtifact:JSON.parse,runModel:()=>{throw new Error('Real model forbidden');},dataDir:()=>'/unused',
    setInterval:(fn,ms)=>{assert.equal(ms,100);intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),
    // This VM supplies a synthetic legacy Store; peer routing/storage behavior
    // is covered by the actual SQLite and root-ingress suites.
    peerOwnerRoutingStorageKind:()=> 'legacy',
    // Explicit SYNTHETIC ordinary-only classification. Actual original plan
    // target/queue/worker guards run in the dedicated real SQLite source suite.
    isOriginMechanicalQaWorker:()=>false,isOriginMechanicalQaTarget,workPeerOriginMechanicalQa,
    spawn:(...args)=>{launches.push(args);return {on:()=>{},unref:()=>{}};},hooks:()=>{},upgrade:()=>{},upgradeGuidance:'',peerRuntimeFields,peerAdoptionToolSchema,peerOwnerToolSchema,peerOriginToolSchema,mcpCallerDiagnostic};
  Object.assign(deps,load('plugin-data.mjs',deps,['dataDir']));
  const engine=load('engine.mjs',deps,['dispatch','status','control','wait']);
  Object.assign(engine,publicOverrides);
  const worker=load('worker.mjs',deps,['work']);
  const main=load('main.mjs',{...deps,engine},['toolList','call','boundedDevelopmentAcceptanceReply']);
  const args={root:'/fixture',session_id:'founder',epoch:1,role:'engineer',task:'A bounded fixture assignment'};
  return {deps,engine,worker,main,args,intervals,launches,get state(){return state;},set now(v){now=v;},get now(){return now;},mutate:fn=>fn(state),tick:()=>{for(const fn of [...intervals])fn();},mismatch:()=>{matches=false;},revoke:()=>{scope=false;},before:fn=>{beforeTransaction=fn;},dispatch:settings=>engine.dispatch({...args,...settings},'codex')};
}
const response=()=>({native_id:'native-fixture',text:JSON.stringify({content:'Fixture output',messages:[],notices:[]})});
const spawnAt=(h,options,limit,reason)=>options.onSpawn(timeout.executionTiming(h.now,{timeout_ms:limit,timeout_reason:reason}));

test('VM main uses the actual exported delivery schemas alongside timeout policy',async()=>{
  const h=harness(),schema=h.main.toolList.find(t=>t.name==='company_develop').inputSchema;
  assert.equal(h.main.boundedDevelopmentAcceptanceReply,boundedDevelopmentAcceptanceReply);
  assert.equal(JSON.stringify(schema.properties.budget_input),JSON.stringify(developmentBudget.developmentBudgetInputSchema));
  for(const action of developmentBudget.DEVELOPMENT_BUDGET_ACTIONS)assert(schema.properties.action.enum.includes(action));
  await assert.rejects(h.main.call('company_develop',{root:'/fixture',session_id:'founder',epoch:1,action:'budget_inspect',budget_input:{},max_bytes:1000},'codex'),error=>error.code==='DEVELOPMENT_BUDGET_REQUEST');
  assert.equal(JSON.stringify(schema.properties.delivery_contract),JSON.stringify(developmentDeliveryContractSchema));
  for(const [name,value]of Object.entries(developmentDeliveryTransitionFields))assert.equal(JSON.stringify(schema.properties[name]),JSON.stringify(value));
  assert.equal(schema.properties.timeout_ms.maximum,120000);
  await assert.rejects(h.main.call('company_develop',{root:'/fixture',session_id:'founder',epoch:1,action:'inspect',delivery_contract:{}},'codex'),/only when creating/);
  assert.equal(h.launches.length,0);
});

test('post-success acceptance formatter failure remains a bounded success receipt even without readback',async()=>{
  let mutations=0;const h=harness({develop:()=>{mutations++;return {source_integrated:false,report:null,retained:'z'.repeat(40000)};},operationReceipt:()=>{throw Error('controlled readback unavailable');}});
  const result=await h.main.call('company_develop',{root:'/fixture',session_id:'founder',epoch:1,action:'accept',plan_id:'plan',receipt_id:'receipt',review_id:'qa',receipt_sha256:'a'.repeat(64)},'codex');
  assert.equal(mutations,1);assert.equal(result.operation_returned,true);assert.equal(result.isError,undefined);assert.equal(result.result_not_inlined,true);assert.match(result.presentation_hold,/returned canonical acceptance report changed/);assert.match(result.current_readback_error,/controlled readback unavailable/);assert.match(result.note,/Do not repeat the mutation/);assert.equal(publicResponse.fits(result),true);
});

test('post-success acceptance formatter overflow retains exact persisted receipt attribution',async()=>{
  let mutations=0,attribution;
  const report={protocol:'development-acceptance-report-v1'},report_sha256=(await import('../plugins/soloco/runtime/store.mjs')).digest(JSON.stringify(report));
  const h=harness({develop:()=>{mutations++;return {source_integrated:false,report,report_sha256,retention_repair:{historical:'z'.repeat(40000)}};},operationReceipt:args=>{attribution=args.plan_id;return {operation_source:{id:'records/receipt',sha256:'b'.repeat(64)}};}});
  const result=await h.main.call('company_develop',{root:'/fixture',session_id:'founder',epoch:1,action:'accept',plan_id:'plan',receipt_id:'receipt',review_id:'qa',receipt_sha256:'a'.repeat(64)},'codex');
  assert.equal(mutations,1);assert.equal(result.operation_returned,true);assert.equal(result.isError,undefined);assert.match(result.presentation_hold,/established acceptance facts exceed/);assert.equal(attribution,'receipt');assert.equal(result.operation_source.id,'records/receipt');assert.equal(publicResponse.fits(result),true);
});

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

test('upgrade review-window schema is bounded and runtime rejects invalid or misplaced requests before binding',()=>{
  const schema=harness().main.toolList.find(t=>t.name==='company_upgrade').inputSchema;
  assert.deepEqual(Array.from(schema.properties.review_window_minutes.type),['integer','null']);
  assert.deepEqual(Array.from(schema.properties.review_window_minutes.enum),[45,90,null]);
  assert.equal(schema.required.includes('review_window_minutes'),false);
  let boundaries=0;
  const forbidden=()=>{boundaries++;throw new Error('Unexpected boundary');};
  const runtime=load('upgrade.mjs',{binding:forbidden,withStore:forbidden},['upgrade']);
  const deps={launch:forbidden,check:forbidden,catalog:forbidden};
  for(const value of [undefined,'90',90.5,Infinity,{},[],false,120]) {
    assert.throws(()=>runtime.upgrade({action:'prepare',review_window_minutes:value},'codex',deps),/review_window_minutes must be 45, 90 or null/);
  }
  for(const action of ['inspect','apply','verify','recover','unknown'])for(const value of [45,90,null]) {
    assert.throws(()=>runtime.upgrade({action,review_window_minutes:value},'codex',deps),/only supported.*prepare/);
  }
  assert.equal(boundaries,0);
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

test('coordination dispatch binds prerequisite evidence, admits disjoint resources and rejects premature/conflicting work',async()=>{
  const h=harness();
  assert.throws(()=>h.dispatch({input_ids:'not-an-array'}),/array/);
  assert.throws(()=>h.dispatch({depends_on:['missing']}),/planned/);
  assert.equal(h.launches.length,0);
  h.mutate(s=>{
    s.jobs.prepared={id:'prepared',status:'completed',epoch:1,instance_id:'preparer',artifact_id:'prepared-output'};
    s.records['prepared-output']={id:'prepared-output',revision:1,status:'Submitted',kind:'artifact',content:'Scoped prepared evidence',job_id:'prepared',author_instance:'preparer'};
  });
  const first=h.dispatch({depends_on:['prepared'],resources:['fixture/one']});
  assert.ok(first.inputs.some(i=>i.id==='prepared-output'&&i.revision===1));
  assert.equal(first.coordination.dependencies[0].artifact_id,'prepared-output');
  h.mutate(s=>{s.roles.research={name:'Research'};});
  assert.throws(()=>h.dispatch({role:'research',resources:['fixture/one']}),/reserved/);
  const second=h.engine.dispatch({...h.args,role:'research',resources:['fixture/two']},'codex');
  assert.equal(h.launches.length,2);assert.equal(second.status,'queued');
  await h.worker.work('/fixture',first.id,async(host,id,prompt,dir,limit,selection,options)=>{
    spawnAt(h,options,limit,first.timeout_reason);return response();
  });
  assert.equal(h.state.jobs[first.id].status,'completed');
  assert.equal(h.state.jobs[first.id].coordination_release.termination_confirmed,true);
  assert.ok(h.dispatch({resources:['fixture/one']}));
});

test('uncertain cancellation keeps resource claim; confirmed closure releases it',async()=>{
  for(const confirmed of [false,true]) {
    const h=harness(),j=h.dispatch({resources:['shared']}),e=Object.assign(new Error('Model process uncertain'),{termination_confirmed:confirmed});
    await h.worker.work('/fixture',j.id,async()=>{throw e;});
    assert.equal(h.state.jobs[j.id].status,'failed');
    h.mutate(s=>{s.sessions={};});
    if(confirmed)assert.ok(h.dispatch({resources:['shared']}));
    else assert.throws(()=>h.dispatch({resources:['shared']}),/reserved/);
  }
});


test('upgrade call ceiling schema and runtime reject invalid options before all boundaries',async()=>{
  const h=harness(),schema=h.main.toolList.find(t=>t.name==='company_upgrade').inputSchema;
  assert.equal(schema.properties.call_timeout_minutes.type,'integer');
  assert.deepEqual(Array.from(schema.properties.call_timeout_minutes.enum),[10,30]);
  assert.equal(schema.required.includes('call_timeout_minutes'),false);
  let effects=0;
  const forbidden=()=>{effects++;throw new Error('Unexpected boundary');};
  const runtime=load('upgrade.mjs',{binding:forbidden,withStore:forbidden},['upgrade']);
  for(const value of [undefined,null,'30',30.1,0,20,60,Infinity,NaN,{},[],true,new Number(30)]) {
    assert.throws(()=>runtime.upgrade({action:'prepare',call_timeout_minutes:value},'codex',{launch:forbidden,check:forbidden,catalog:forbidden}),/call_timeout_minutes/);
  }
  for(const action of ['inspect','apply','verify','recover','unknown']) {
    assert.throws(()=>runtime.upgrade({action,call_timeout_minutes:30},'codex',{launch:forbidden,check:forbidden,catalog:forbidden}),/only supported.*prepare/);
  }
  assert.equal(effects,0);
  await assert.rejects(h.main.call('company_dispatch',{...h.args,timeout_ms:1800000,timeout_reason:'Upgrade context cannot be requested by business dispatch'},'codex'));
  assert.equal(h.launches.length,0);
});


// FICTIONAL CONTRACT DOUBLES: actual worker body and stream transport, explicit
// clock/store/semantic boundary doubles; no actual native qualification.
function streamHarness(){
  const h=harness(),job=h.dispatch({timeout_ms:600000,timeout_reason:'Bounded stream fixture'});
  const packet={target:{id:'target'},text:'x'.repeat(50000)},plan={id:'plan'};
  const a={hash:'context',inputs:[],text:'',packet:{phase:'applicability'},qualification:{protocol:scoped.SCOPED_PROTOCOL,target:packet.target,plan},stream:scopedStream.buildScopedStream(packet,plan)};
  a.text=a.stream.pages[0].wire;
  Object.assign(h.deps.scoped,{isScopedJob:()=>true,scopedAssignment:()=>a,scopedMatches:()=>true,validateScopedStreamNative:()=>true,validateScopedOutput:()=>true,validateScopedResponse:()=>true,scopedProof:()=>({contract_double:true})});
  return {h,job,a};
}
const streamResponse=(p,native='native-fixture')=>({native_id:native,text:JSON.stringify(p.final?{content:'Fictional Pass',messages:[],notices:[],qualification_result:{verdict:'Pass'}}:{scoped_stream_ack:{body_sha256:p.body_sha256,sequence:p.sequence,range_sha256:p.range_sha256}})});

test('stream publication fence quarantines deadline crossed during final validation without session mutation',async()=>{
  for(const elapsed of [600000,600001]){
    const {h,job}=streamHarness(),start=h.now;let validations=0;
    h.deps.scoped.validateScopedResponse=()=>{if(++validations===2)h.now=start+elapsed;return true;};
    await h.worker.work('/fixture',job.id,async(host,session,request,dir,limit,selection,options)=>{spawnAt(h,options,limit,options.timeoutReason);return streamResponse(JSON.parse(request));});
    const j=h.state.jobs[job.id];assert.equal(validations,2,j.error);assert.equal(j.status,'quarantined');assert.equal(j.execution_failure.code,'ROLE_TIMEOUT');
    assert.equal(h.state.records[j.artifact_id].status,'Quarantined');assert.equal(h.state.records[j.artifact_id].qualification_result.verdict,'Pass');
    assert.equal(h.state.sessions[j.session_key].native_id,null);assert.equal(h.state.messages.length,0);assert.equal(j.timeout_ms,600000);
  }
});

test('format4 receipt validation cannot publish after the original execution deadline',async()=>{
 for(const elapsed of [1000,1001]){
  const h=harness();h.mutate(s=>{s.roles.qa={name:'QA'};s.records.target={id:'target',revision:1,author_instance:'source-author',context_classification_plan:{version:2}};});
  const job=h.dispatch({role:'qa',review_of:'target',timeout_ms:1000,timeout_reason:'Fictional format4 deadline seam'}),start=h.now;
  h.deps.assignmentContext=()=>({hash:'context',text:'FICTIONAL complete format4 context',inputs:[],initial_delivery:[],qualification_evidence:{fictional:true}});
  h.deps.createDeliveryLedger=(_e,native)=>({session_id:native});
  // The real worker's final-validation position is tested with explicit receipt
  // and clock doubles. This is not a native semantic qualification receipt.
  h.deps.qualificationDeliveryReceipt=()=>{h.now=start+elapsed;return {protocol:2,fictional:true};};
  await h.worker.work('/fixture',job.id,async(_host,_native,_request,_dir,limit,_selection,options)=>{spawnAt(h,options,limit,options.timeoutReason);return {native_id:'native-fixture',text:JSON.stringify({content:'FICTIONAL Pass',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional boundary judgment',plan_sha256:'binding'}})};});
  const done=h.state.jobs[job.id];assert.equal(done.status,'quarantined',done.error);assert.equal(done.execution_failure.code,'ROLE_TIMEOUT');assert.equal(h.state.records[done.artifact_id].status,'Quarantined');assert.equal(h.state.sessions[done.session_key].native_id,null);assert.equal(done.timeout_ms,1000);
 }
});

test('stream exact deadline closure and delayed timers cannot publish late Pass or renew allowance',async()=>{
  for(const mode of ['exact','delayed-timer','later-spawn','renewed-later-spawn','missing-timing']){
    const {h,job}=streamHarness(),start=h.now;let calls=0,deadline;
    await h.worker.work('/fixture',job.id,async(host,session,request,dir,limit,selection,options)=>{
      const p=JSON.parse(request);calls++;
      if(mode==='missing-timing')return streamResponse(p,'prior-extraction-native');
      if(calls===2){
        assert.equal(options.executionDeadlineAt,deadline);assert.ok(limit<=600000);
        if(['later-spawn','renewed-later-spawn'].includes(mode))h.now=start+599000;
      }
      const cap=Math.min(limit,options.executionDeadlineAt?options.executionDeadlineAt-h.now:limit);
      options.onSpawn(timeout.executionTiming(h.now,{timeout_ms:mode==='renewed-later-spawn'&&calls===2?limit:cap,timeout_reason:options.timeoutReason}));
      deadline??=Date.parse(h.state.jobs[job.id].execution_deadline_at);
      if(mode==='exact'||mode==='delayed-timer')h.now=deadline+(mode==='delayed-timer'?100:0); // deliberately no tick()
      else h.now+=1000;
      return streamResponse(p);
    });
    const j=h.state.jobs[job.id];assert.notEqual(j.status,'completed',mode);assert.equal(h.state.sessions[j.session_key].native_id,null,mode);
    assert.equal(j.timeout_ms,600000);assert.ok(j.rejected_output||j.execution_failure);
    if(mode==='missing-timing'){assert.equal(j.native_id,null);assert.equal(j.rejected_native_id,'prior-extraction-native');assert.equal(calls,1);}
    if(['later-spawn','renewed-later-spawn'].includes(mode)){assert.equal(calls,2);assert.equal(Date.parse(j.execution_deadline_at),start+600000);}
  }
});
