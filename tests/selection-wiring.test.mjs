import * as developmentBudget from '../plugins/soloco/runtime/development-budget-runtime.mjs';
import {toolCatalogReply} from '../plugins/soloco/runtime/public-response.mjs';
import {outcomeSchema} from '../plugins/soloco/runtime/outcome.mjs';
import {peerRuntimeFields} from '../plugins/soloco/runtime/peer-runtime.mjs';
import {peerAdoptionToolSchema} from '../plugins/soloco/runtime/peer-adoption-runtime.mjs';
import {peerOwnerToolSchema} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
import {peerOriginToolSchema} from '../plugins/soloco/runtime/peer-origin-runtime.mjs';
import {mcpCallerDiagnostic} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {developmentDeliveryContractSchema,developmentDeliveryTransitionFields,boundedDevelopmentAcceptanceReply} from '../plugins/soloco/runtime/development-delivery.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {operatingMaintenanceEligible} from '../plugins/soloco/runtime/operating-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as coordination from '../plugins/soloco/runtime/coordination.mjs';
import {normalizeHandoverReviewWindow,normalizeCodeReviewWindow} from '../plugins/soloco/runtime/timeout.mjs';
import {reviewContinuationAssignment} from '../plugins/soloco/runtime/development-review-continuation.mjs';
import {codeReviewWindowSubject} from '../plugins/soloco/runtime/code-review-window.mjs';
import * as retentionRepair from '../plugins/soloco/runtime/development-retention-repair.mjs';

// Execute the actual main/engine bodies with controlled boundary dependencies.
// No production store operation, adapter call, subprocess, CLI, network or timer is executed.
// Selection functions below are the supplied accepted component contract,
// frozen here because selection.mjs is outside this sparse source scope.
// Full dependency integration and timeout.test.mjs run separately.
function normalizeSelection(value,host,catalog) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  if(value===undefined || value===null)return {mode:'default'};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','model','effort','speed','reason'].includes(k)))throw new Error('Invalid model_selection fields');
  if(!['default','explicit'].includes(value.mode))throw new Error('Choose default or explicit model selection');
  if(typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>300)throw new Error('Model selection needs a reason up to 300 characters');
  // Undefined means the same request as the legacy omitted speed, never Standard.
  const speed=value.speed===undefined?'host_default':value.speed;
  if(!['host_default','fast_disabled'].includes(speed))throw new Error('Unsupported speed; choose host_default or supported fast_disabled');
  if(speed==='fast_disabled') {
    if(host!=='claude')throw new Error('Codex fast-off reset is unverified');
    if(catalog?.speed_support?.fast_disabled!==true)throw new Error('Claude fast_disabled requires verified installed version and settings control');
  }
  const common={reason:value.reason.trim(),...(value.speed===undefined?{}:{speed})};
  if(value.mode==='default') {
    if(value.model!==undefined||value.effort!==undefined)throw new Error('Default selection cannot specify model or effort');
    return {mode:'default',...common};
  }
  if(typeof value.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.model))throw new Error('Invalid model identifier');
  if(!catalog?.supported)throw new Error(`Model selection unavailable: ${catalog?.error??'inspect company_doctor models first'}`);
  const option=catalog.models?.find(m=>m.id===value.model);
  if(!option)throw new Error('Model is not an advertised permitted choice; inspect company_doctor models');
  if(host==='claude' && value.effort!==undefined)throw new Error('Claude model-specific effort support is unverified');
  if(value.effort!==undefined && (typeof value.effort!=='string'||!option.supported_efforts?.includes(value.effort)))throw new Error('Unsupported effort for this model');
  return {mode:'explicit',model:value.model,...(value.effort===undefined?{}:{effort:value.effort}),...common};
}
function selectionKey(value) {
  const key=value?.mode==='explicit'?['explicit',value.model,value.effort??null]:['default'];
  // Preserve historical keys for the legacy/default request. An actual speed
  // change rotates the key; rationale alone never does.
  const speed=value?.speed??'host_default';
  if(speed!=='host_default')key.push(speed);
  return JSON.stringify(key);
}
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
    if(name==='main.mjs'){assert.equal(typeof toolCatalogReply,'function');assert.equal(deps.toolCatalogReply,toolCatalogReply,'VM must use the actual catalog reply export');}
  }
  source=source.replace(/^import .*;\r?\n/gm,'');
  const entry=source.indexOf('if(process.argv[1]');
  if(entry>=0)source=source.slice(0,entry);
  source=source.replace(/\bexport (?=(?:async )?function|const|let|class)/g,'');
  return vm.runInNewContext(source+'\n;({'+names.join(',')+'});',deps,{filename:name,timeout:1000});
}
const plain=value=>JSON.parse(JSON.stringify(value));
function catalogFor(host) {
  return {
    supported:true,source:host==='claude'?'documented_aliases':'host_catalog',
    models:host==='claude'?[{id:'sonnet',supported_efforts:[],effort_support:'alias_specific_support_unverified'}]:[{id:'fixture-model',supported_efforts:['medium','high'],effort_support:'host_catalog'}],
    speed_support:{host_default:true,fast_disabled:host==='claude',evidence:host==='claude'?'documented_fastMode_false_with_installed_version_and_settings_control':'no_verified_explicit_fast_off_control',default_service_tier:null,default_speed:'unverified',paid_tiers_enabled:false},
    account_availability:'unverified'
  };
}
function harness(host='claude') {
  let sequence=0,catalog=catalogFor(host),scopeAllowed=true;
  let state={schema:2,plugin_version:'fixture',runtime_version:'fixture',owner:{epoch:1,session_id:'founder',host},paused:false,roles:{engineer:{name:'Engineer'}},records:{},jobs:{},sessions:{},notices:[],messages:[]};
  const catalogs=[],launches=[],contexts=[],normalizations=[],transactions=[];
  let readinessCalls=0;
  const requireText=(value,label,max=20000)=>{
    if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid '+label);
    return value;
  };
  const deps={...developmentBudget,toolCatalogReply,outcomeSchema,developmentDeliveryContractSchema,developmentDeliveryTransitionFields,boundedDevelopmentAcceptanceReply,scoped,...coordination,...retentionRepair,operatingMaintenanceEligible,reviewContinuationAssignment,codeReviewWindowSubject,
    path,os:{homedir:()=>'/unused'},fs:{existsSync:()=>true},
    process:{cwd:()=>process.cwd(),env:{},execPath:'/unused/node',argv:[]},
    PACKAGE:'/unused',VERSION:'fixture',SCHEMA:2,
    stamp:()=>new Date(1000000).toISOString(),id:prefix=>prefix+'-'+(++sequence),
    digest:()=> 'binding',folder:value=>value,noLink:()=>{},requireText,
    withStore:(root,fn)=>{
      assert.equal(root,'/fixture');
      return fn({read:()=>structuredClone(state),transaction:(type,change)=>{
        const next=change(structuredClone(state));
        state=structuredClone(next);
        transactions.push(type);
        return structuredClone(state);
      }});
    },
    owner:(s,session,actualHost,epoch)=>{
      if(s.owner.session_id!==session||s.owner.host!==actualHost||(epoch!==undefined&&s.owner.epoch!==epoch))throw new Error('Stale owner');
    },
    notice:(s,kind,summary,reference)=>s.notices.push({kind,summary,reference}),
    installedTeam:()=>({}),teamHash:()=> 'team',upgradePending:()=>false,compatibleRuntime:()=>true,
    mutationView:value=>value,fits:()=>true,handoverReviewEligible:()=>false,qualificationMaintenanceEligible:()=>false,
    readiness:actualHost=>{
      assert.equal(actualHost,host);readinessCalls++;
      return {available:true,authenticated:true,version:'fixture-cli'};
    },
    modelCatalog:actualHost=>{catalogs.push(actualHost);return structuredClone(catalog);},
    normalizeSelection:(value,actualHost,metadata)=>{
      normalizations.push({value:structuredClone(value),host:actualHost,catalog:structuredClone(metadata)});
      return normalizeSelection(value,actualHost,metadata);
    },selectionKey,selectionUsage:()=>({scope:"test_stub"}),activityFor:()=>[],
    contextBudgetForJob:()=>200000,assignmentContext:(s,job)=>{contexts.push(structuredClone(job));return {hash:'fixture-context',inputs:job.inputs};},
    developmentAction:()=>{},developmentLimits:()=>({max_bytes:100000}),developmentCapability:()=>({}),
    developmentAssignment:()=>{if(!scopeAllowed)throw new Error('Scope revoked');},
    prototypeAction:()=>{},prototypeCapability:()=>({}),prototypeAssignment:()=>{},
    TIMEOUT_POLICY_VERSION:1,MIN_EXECUTION_TIMEOUT_MS:1000,MAX_EXECUTION_TIMEOUT_MS:600000,
    // Timeout is an unchanged boundary in this focused wiring test.
    normalizeTimeout:({timeout_ms,timeout_reason})=>({timeout_ms:timeout_ms??180000,timeout_reason:timeout_reason??'Fixture default'}),normalizeHandoverReviewWindow,normalizeCodeReviewWindow,
    jobTimeoutState:()=>({state:'terminal'}),
    spawn:(...args)=>{launches.push(args);return {on:()=>{},unref:()=>{}};},
    // This VM supplies a synthetic legacy Store; peer routing/storage behavior
    // is covered by the actual SQLite and root-ingress suites.
    peerOwnerRoutingStorageKind:()=> 'legacy',
    hooks:()=>{},upgrade:()=>{},upgradeGuidance:'',peerRuntimeFields,peerAdoptionToolSchema,peerOwnerToolSchema,peerOriginToolSchema,mcpCallerDiagnostic
  };
  Object.assign(deps,load('plugin-data.mjs',deps,['dataDir']));
  const engine=load('engine.mjs',deps,['dispatch']);
  const main=load('main.mjs',{...deps,engine},['toolList','call','boundedDevelopmentAcceptanceReply']);
  const args={root:'/fixture',session_id:'founder',epoch:1,role:'engineer',task:'A bounded fixture assignment'};
  return {main,args,catalogs,launches,contexts,normalizations,transactions,
    call:settings=>main.call('company_dispatch',{...args,...settings},host),
    get state(){return structuredClone(state);},get readinessCalls(){return readinessCalls;},
    setCatalog:value=>{catalog=structuredClone(value);},
    mutate:fn=>fn(state),revoke:()=>{scopeAllowed=false;},
    finish:job=>{state.jobs[job.id].status='completed';state.sessions[job.session_key].native_id='native-fixture';}
  };
}

test('VM main binds the actual exported delivery schemas on both host selection paths',async()=>{
  for(const host of ['codex','claude']){
    const h=harness(host),schema=plain(h.main.toolList.find(tool=>tool.name==='company_develop').inputSchema);
    assert.equal(h.main.boundedDevelopmentAcceptanceReply,boundedDevelopmentAcceptanceReply);
    assert.deepEqual(schema.properties.delivery_contract,developmentDeliveryContractSchema);
    assert.deepEqual(schema.properties.budget_input,plain(developmentBudget.developmentBudgetInputSchema));
    for(const action of developmentBudget.DEVELOPMENT_BUDGET_ACTIONS)assert(schema.properties.action.enum.includes(action));
    await assert.rejects(h.main.call('company_develop',{root:'/fixture',session_id:'founder',epoch:1,action:'budget_inspect',budget_input:{},max_bytes:1000},host),error=>error.code==='DEVELOPMENT_BUDGET_REQUEST');
    for(const [name,value]of Object.entries(developmentDeliveryTransitionFields))assert.deepEqual(schema.properties[name],value);
    assert.equal(h.launches.length,0);assert.equal(h.catalogs.length,0);
  }
});

test('dispatch schema admits only optional supported speed choices and preserves legacy requirements',()=>{
  const h=harness();
  const schema=plain(h.main.toolList.find(tool=>tool.name==='company_dispatch').inputSchema);
  const selection=schema.properties.model_selection;
  assert.deepEqual(selection.properties.speed,{enum:['host_default','fast_disabled']});
  assert.deepEqual(selection.required,['mode','reason']);
  assert.equal(selection.additionalProperties,false);
  assert.deepEqual(schema.required,['root','session_id','epoch','role','task']);
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.timeout_ms.minimum,1000);
  assert.equal(schema.properties.timeout_ms.maximum,600000);
});

test('upgrade reuses the optional dispatch selection schema with unchanged required arguments',()=>{
  const h=harness('codex');
  const schema=plain(h.main.toolList.find(tool=>tool.name==='company_upgrade').inputSchema);
  const dispatch=plain(h.main.toolList.find(tool=>tool.name==='company_dispatch').inputSchema);
  assert.deepEqual(schema.properties.model_selection,dispatch.properties.model_selection);
  assert.deepEqual(schema.required,['root','session_id','action']);
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.properties.action.enum,['inspect','prepare','resume','apply','verify','recover']);
});

for(const version of ['0.7.6','0.7.7'])test(`compatible patch preserves explicit model-selection dispatch for a pinned ${version} team`,async()=>{
  const h=harness('codex');h.mutate(s=>{s.plugin_version=version;s.runtime_version=version;});
  const job=await h.call({model_selection:{mode:'default',reason:'Retain the supported pinned team'}});
  assert.equal(job.status,'queued');assert.equal(h.launches.length,1);
  assert.equal(h.state.plugin_version,version);
  const unsupported=harness('codex');unsupported.mutate(s=>{s.plugin_version='999.0.0';});
  await assert.rejects(()=>unsupported.call({model_selection:{mode:'default',reason:'Unsupported future team'}}),/adopt the model-selection team/);
});

test('legacy omission and host_default avoid catalog discovery and persist normalized requests',async()=>{
  for(const request of [undefined,{mode:'default',reason:'  keep host choice  '},{mode:'default',speed:'host_default',reason:'  keep host choice  '}]) {
    const h=harness();
    const job=await h.call(request===undefined?{}:{model_selection:request});
    const expected=request===undefined?{mode:'default'}:{...request,reason:'keep host choice'};
    assert.deepEqual(plain(job.model_selection),expected);
    assert.deepEqual(h.state.jobs[job.id].model_selection,expected);
    assert.deepEqual(h.catalogs,[]);
    assert.equal(h.normalizations[0].catalog,null);
    assert.equal(Object.hasOwn(job,'model_catalog'),false);
    assert.equal(job.timeout_policy_version,1);
    assert.equal(job.timeout_ms,180000);
    assert.equal(h.launches.length,1);
  }
});

test('default-mode fast_disabled routes catalog support without manufacturing model or execution evidence',async()=>{
  const h=harness();
  // Default mode needs speed support, not a selectable-model catalog.
  const catalog=catalogFor('claude');
  catalog.supported=false;
  delete catalog.models;
  h.setCatalog(catalog);
  const job=await h.call({model_selection:{mode:'default',speed:'fast_disabled',reason:'  bounded fast-off request  '}});
  assert.deepEqual(h.catalogs,['claude']);
  assert.equal(h.normalizations[0].catalog.speed_support.fast_disabled,true);
  assert.deepEqual(plain(job.model_selection),{mode:'default',speed:'fast_disabled',reason:'bounded fast-off request'});
  assert.deepEqual(plain(job.model_catalog),{source:'documented_aliases',speed_support:catalog.speed_support});
  assert.equal(Object.hasOwn(job.model_catalog,'model'),false);
  assert.equal(Object.hasOwn(job,'model_evidence'),false);
  assert.equal(job.model_catalog.speed_support.default_service_tier,null);
  assert.equal(job.model_catalog.speed_support.default_speed,'unverified');
  assert.equal(job.model_catalog.speed_support.paid_tiers_enabled,false);
  assert.deepEqual(h.state.jobs[job.id].model_catalog,plain(job.model_catalog));
  assert.deepEqual(h.contexts[0].model_catalog,plain(job.model_catalog));
  assert.equal(h.launches.length,1);
});

test('explicit models obtain catalog once and retain separate model and speed-support metadata',async()=>{
  for(const [host,request] of [
    ['codex',{mode:'explicit',model:'fixture-model',effort:'high',reason:'  bounded reasoning  '}],
    ['claude',{mode:'explicit',model:'sonnet',speed:'fast_disabled',reason:'  bounded fast-off request  '}]
  ]) {
    const h=harness(host);
    const job=await h.call({model_selection:request,timeout_ms:600000,timeout_reason:'Long bounded fixture'});
    const catalog=catalogFor(host);
    assert.deepEqual(h.catalogs,[host]);
    assert.deepEqual(plain(job.model_selection),{...request,reason:request.reason.trim()});
    assert.deepEqual(plain(job.model_catalog),{source:catalog.source,model:catalog.models[0],speed_support:catalog.speed_support});
    assert.deepEqual(h.state.jobs[job.id].model_selection,plain(job.model_selection));
    assert.deepEqual(h.contexts[0].model_selection,plain(job.model_selection));
    assert.equal(Object.hasOwn(job,'model_evidence'),false);
    assert.equal(job.timeout_ms,600000);
    assert.equal(job.timeout_reason,'Long bounded fixture');
    assert.equal(job.timeout_policy_version,1);
    assert.equal(Object.hasOwn(job,'execution_started_at'),false);
    assert.equal(Object.hasOwn(job,'execution_deadline_at'),false);
    assert.equal(h.launches.length,1);
  }
});

test('unsupported speed, missing fast-off support and unverified effort reject before queuing or launch',async()=>{
  for(const [host,request,metadata] of [
    ['claude',{mode:'default',speed:'fast',reason:'fixture'}],
    ['claude',{mode:'default',speed:'standard',reason:'fixture'}],
    ['claude',{mode:'default',speed:null,reason:'fixture'}],
    ['codex',{mode:'default',speed:'fast_disabled',reason:'fixture'}],
    ['claude',{mode:'default',speed:'fast_disabled',reason:'fixture'},{supported:false,source:'unavailable',models:[]}],
    ['claude',{mode:'default',speed:'fast_disabled',reason:'fixture'},{...catalogFor('claude'),speed_support:{fast_disabled:false}}],
    ['claude',{mode:'explicit',model:'sonnet',effort:'high',reason:'fixture'}],
    ['claude',{mode:'default',model:'sonnet',reason:'fixture'}],
    ['claude',{mode:'default',reason:'fixture',service_tier:'fast'}],
    ['codex',{mode:'explicit',model:'not-advertised',reason:'fixture'}],
    ['claude',{mode:'default',speed:'host_default',reason:'   '}]
  ]) {
    const h=harness(host);
    if(metadata)h.setCatalog(metadata);
    await assert.rejects(h.call({model_selection:request}));
    assert.deepEqual(h.state.jobs,{});
    assert.deepEqual(h.state.sessions,{});
    assert.deepEqual(h.transactions,[]);
    assert.equal(h.readinessCalls,0);
    assert.equal(h.launches.length,0);
  }
});

test('omitted speed, explicit host_default and reason-only changes reuse a finished session',async()=>{
  const h=harness();
  const first=await h.call({});
  h.finish(first);
  const second=await h.call({model_selection:{mode:'default',speed:'host_default',reason:'Explicit legacy-equivalent choice'}});
  assert.equal(second.instance_id,first.instance_id);
  assert.equal(second.native_id,'native-fixture');
  h.finish(second);
  const third=await h.call({model_selection:{mode:'default',reason:'New rationale only'}});
  assert.equal(third.instance_id,first.instance_id);
  assert.equal(third.native_id,'native-fixture');
  assert.deepEqual(h.state.retired_sessions??[],[]);
  assert.deepEqual(h.catalogs,[]);
});

test('speed changes retire identity and repeated fast_disabled reuses the replacement',async()=>{
  const h=harness();
  const first=await h.call({});
  h.finish(first);
  const second=await h.call({model_selection:{mode:'default',speed:'fast_disabled',reason:'Change speed'}});
  assert.notEqual(second.instance_id,first.instance_id);
  assert.equal(second.native_id,null);
  assert.equal(h.state.retired_sessions.length,1);
  assert.equal(h.state.retired_sessions[0].instance_id,first.instance_id);
  assert.equal(h.state.retired_sessions[0].native_id,'native-fixture');
  assert.equal(h.state.retired_sessions[0].reason,'model_selection_changed');
  h.finish(second);
  const third=await h.call({model_selection:{mode:'default',speed:'fast_disabled',reason:'Same choice, new rationale'}});
  assert.equal(third.instance_id,second.instance_id);
  assert.equal(third.native_id,'native-fixture');
  assert.equal(h.state.retired_sessions.length,1);
  h.finish(third);
  const fourth=await h.call({model_selection:{mode:'default',speed:'host_default',reason:'Return to host choice'}});
  assert.notEqual(fourth.instance_id,third.instance_id);
  assert.equal(fourth.native_id,null);
  assert.equal(h.state.retired_sessions.length,2);
  assert.deepEqual(h.catalogs,['claude','claude']);
});

test('explicit model session identity also rotates for speed and reuses unchanged selections',async()=>{
  const h=harness();
  const request={mode:'explicit',model:'sonnet',reason:'Initial choice'};
  const first=await h.call({model_selection:request});
  h.finish(first);
  const second=await h.call({model_selection:{...request,speed:'host_default',reason:'Same choice'}});
  assert.equal(second.instance_id,first.instance_id);
  h.finish(second);
  const third=await h.call({model_selection:{...request,speed:'fast_disabled'}});
  assert.notEqual(third.instance_id,second.instance_id);
  h.finish(third);
  const fourth=await h.call({model_selection:{...request,speed:'fast_disabled',reason:'Same fast-off choice'}});
  assert.equal(fourth.instance_id,third.instance_id);
  assert.equal(h.state.retired_sessions.length,1);
});

test('speed wiring preserves ownership, pause, scope, adoption and independent-review checks',async()=>{
  for(const configure of [
    h=>h.mutate(s=>{s.owner.epoch=2;}),
    h=>h.mutate(s=>{s.paused=true;}),
    h=>h.mutate(s=>{s.plugin_version='older';}),
    h=>h.revoke()
  ]) {
    const h=harness();configure(h);
    await assert.rejects(h.call({model_selection:{mode:'default',speed:'fast_disabled',reason:'Fixture request'}}));
    assert.deepEqual(h.state.jobs,{});
    assert.deepEqual(h.state.sessions,{});
    assert.equal(h.launches.length,0);
  }
  const h=harness();
  const request={mode:'default',speed:'fast_disabled',reason:'Independent review fixture'};
  const first=await h.call({model_selection:request});
  h.finish(first);
  h.mutate(s=>{
    s.records.target={id:'target',revision:1,author_instance:first.instance_id};
    s.sessions['engineer:review:target:1']={...s.sessions.engineer};
  });
  await assert.rejects(h.call({model_selection:request,review_of:'target'}),/Authors cannot independently review/);
  assert.equal(Object.keys(h.state.jobs).length,1);
  assert.equal(h.launches.length,1);
});

const freshRequest={fresh_session:true,fresh_session_reason:'  Prior native history is unusable  '};
test('fresh-session schema is optional and rejects missing, orphaned or invalid reasons without mutation',async()=>{
  const schema=plain(harness().main.toolList.find(t=>t.name==='company_dispatch').inputSchema);
  assert.deepEqual(schema.properties.fresh_session,{type:'boolean'});
  assert.equal(schema.properties.fresh_session_reason.maxLength,300);
  assert.ok(!schema.required.includes('fresh_session'));
  for(const request of [
    {fresh_session:true},{fresh_session:true,fresh_session_reason:' '},
    {fresh_session:true,fresh_session_reason:'x'.repeat(301)},
    {fresh_session:true,fresh_session_reason:42},{fresh_session:'true'},
    {fresh_session_reason:'orphan'},{fresh_session:false,fresh_session_reason:'orphan'}
  ]) {
    const h=harness();await assert.rejects(h.call(request),/fresh_session/);
    assert.deepEqual(h.state.jobs,{});assert.deepEqual(h.state.sessions,{});assert.equal(h.launches.length,0);
  }
});

test('explicit fresh with identical settings retires exact lineage and queues null native without execution claims',async()=>{
  for(const host of ['codex','claude']) {
    const h=harness(host),choice=host==='codex'
      ?{mode:'explicit',model:'fixture-model',effort:'high',reason:'Same scoped choice'}
      :{mode:'explicit',model:'sonnet',speed:'fast_disabled',reason:'Same scoped choice'};
    const first=await h.call({model_selection:choice});h.finish(first);
    const prior=h.state.sessions.engineer,oldJob=h.state.jobs[first.id];
    const fresh=await h.call({...freshRequest,model_selection:choice});
    assert.notEqual(fresh.instance_id,first.instance_id);assert.equal(fresh.native_id,null);
    assert.equal(h.state.sessions.engineer.native_id,null);assert.deepEqual(plain(fresh.model_selection),choice);
    assert.equal(fresh.fresh_session,true);assert.equal(fresh.fresh_session_reason,freshRequest.fresh_session_reason.trim());
    assert.equal(Object.hasOwn(fresh,'model_evidence'),false);
    const retired=h.state.retired_sessions[0];
    for(const [key,value] of Object.entries(prior))assert.deepEqual(retired[key],value);
    assert.equal(retired.reason,'fresh_session_requested');assert.equal(retired.replacement_job_id,fresh.id);
    assert.equal(retired.fresh_session_reason,fresh.fresh_session_reason);assert.ok(retired.retired_at);
    assert.deepEqual(h.state.jobs[first.id],oldJob);assert.equal(h.launches.length,2);
    assert.equal(h.contexts[1].native_id,null);assert.deepEqual(plain(fresh.inputs),[]);
    h.finish(fresh);const resumed=await h.call({fresh_session:false,model_selection:choice});
    assert.equal(resumed.instance_id,fresh.instance_id);assert.equal(resumed.native_id,'native-fixture');
    assert.equal(Object.hasOwn(resumed,'fresh_session'),false);assert.equal(h.state.retired_sessions.length,1);
  }
  const empty=harness(),first=await empty.call(freshRequest);
  assert.equal(first.native_id,null);assert.equal(empty.state.retired_sessions,undefined);
});

test('fresh after confirmed failure preserves failed job, authority, limits, inputs and attempt evidence',async()=>{
  const h=harness(),first=await h.call({});h.finish(first);
  h.mutate(s=>{
    s.jobs[first.id].status='failed';s.jobs[first.id].error='Context history unusable';
    s.jobs[first.id].coordination_release={termination_confirmed:true};
    s.jobs[first.id].execution_deadline_at='retained original deadline';
    s.records.evidence={id:'evidence',revision:2,content:'Canonical exact input'};
    s.records.grant={id:'grant',revision:1,remaining_attempts:1,max_attempts:2,expires_at:'unchanged expiry'};
    s.notices=[{id:'failure-notice',kind:'must_know',summary:'Retain prior failure'}];
    s.governance='Original authority';
  });
  const before=h.state,fresh=await h.call({...freshRequest,input_ids:['evidence']});
  assert.deepEqual(h.state.jobs[first.id],before.jobs[first.id]);
  for(const key of ['owner','governance','roles','records','notices'])assert.deepEqual(h.state[key],before[key]);
  assert.deepEqual(plain(fresh.inputs),[{id:'evidence',revision:2}]);
  assert.equal(fresh.timeout_ms,first.timeout_ms);assert.equal(fresh.timeout_reason,first.timeout_reason);
  assert.equal(Object.hasOwn(fresh,'execution_deadline_at'),false);
  assert.equal(h.launches.length,2);assert.equal(fresh.native_id,null);
});

test('fresh cannot retire active/uncertain sessions or bypass owner, pause, host, resource or scope holds',async()=>{
  for(const [configure,request,pattern] of [
    [()=>{}, {}, /already has an assignment/],
    [h=>h.mutate(s=>{s.jobs[Object.keys(s.jobs)[0]].status='running';}),{},/already has an assignment/],
    [h=>h.mutate(s=>{s.jobs[Object.keys(s.jobs)[0]].status='failed';}),{},/uncertain/],
    [h=>h.mutate(s=>{s.jobs[Object.keys(s.jobs)[0]].status='cancelled';}),{},/uncertain/],
    [h=>h.mutate(s=>{s.jobs[Object.keys(s.jobs)[0]].status='interrupted';}),{},/uncertain/],
    [h=>{h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]);h.mutate(s=>{s.jobs[Object.keys(s.jobs)[0]].coordination={resources:['held-by-prior-session']};});},{},/uncertain/],
    [h=>h.mutate(s=>{s.owner.epoch=2;}),{},/owner/],
    [h=>h.mutate(s=>{s.owner.session_id='other';}),{},/owner/],
    [h=>h.mutate(s=>{s.paused=true;}),{},/paused/],
    [h=>{h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]);h.mutate(s=>{s.sessions.engineer.host='codex';});},{model_selection:{mode:'default',speed:'fast_disabled',reason:'Changed choice cannot evade host'}},/another host/],
    [h=>{h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]);h.revoke();},{},/Scope revoked/],
    [h=>{h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]);h.mutate(s=>{s.jobs.uncertain={id:'uncertain',status:'failed',coordination:{resources:['shared']}};});},{resources:['shared']},/reserved/],
    [h=>{h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]);h.mutate(s=>{s.jobs.active={id:'active',status:'running',coordination:{resources:['shared']}};});},{resources:['shared']},/reserved/],
    [h=>h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]),{input_ids:['missing']},/input record is missing/],
    [h=>h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]),{role:'invented'},/Role is absent/],
    [h=>h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]),{role:'__proto__'},/Role is absent/],
    [h=>h.finish(h.state.jobs[Object.keys(h.state.jobs)[0]]),{input_ids:['__proto__']},/input record is missing/]
  ]) {
    const h=harness();await h.call({});configure(h);const before=h.state;
    await assert.rejects(h.call({...freshRequest,...request}),pattern);
    assert.deepEqual(h.state,before);assert.equal(h.launches.length,1);
  }
});

test('fresh is ordinary-only and cannot rotate handover reviewers or scoped generation identities',async()=>{
  for(const scope of [{review_of:'handover'},{prototype_id:'scope'},{development_id:'scope'}]) {
    const h=harness();await h.call({});const before=h.state;
    await assert.rejects(h.call({...freshRequest,...scope}),/only for ordinary/);
    assert.deepEqual(h.state,before);assert.equal(h.launches.length,1);
  }
  // Changed selection must still enforce same-author QA before replacing identity.
  const h=harness(),first=await h.call({});h.finish(first);
  h.mutate(s=>{s.records.target={id:'target',revision:1,author_instance:first.instance_id};s.sessions['engineer:review:target:1']={...s.sessions.engineer};});
  const before=h.state;
  await assert.rejects(h.call({review_of:'target',model_selection:{mode:'default',speed:'fast_disabled',reason:'Cannot rotate around author check'}}),/Authors cannot independently review/);
  assert.deepEqual(h.state,before);assert.equal(h.launches.length,1);
});
