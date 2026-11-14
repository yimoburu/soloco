import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { normalizeSelection, selectionKey, activityFor } from '../plugins/soloco/runtime/selection.mjs';
import { commandArgs, parseOutput, sanitizeCodexModel, claudeFastOffSupport } from '../plugins/soloco/runtime/adapters.mjs';
import {createOriginalAdapterProcessFixture} from './original-adapter-process-fixture.mjs';

const catalog={supported:true,source:'host_catalog',models:[
  {id:'test-small',supported_efforts:['low','medium'],default_effort:'low'},
  {id:'test-review',supported_efforts:['medium','high','ultra'],default_effort:'medium'},
]};
const claudeCatalog={supported:true,source:'documented_aliases',speed_support:{fast_disabled:true},models:[
  {id:'haiku',supported_efforts:[],effort_support:'alias_specific_support_unverified'},
  {id:'sonnet',supported_efforts:[],effort_support:'alias_specific_support_unverified'},
  {id:'opus',supported_efforts:[],effort_support:'alias_specific_support_unverified'},
]};
const explicit=(extra={})=>({mode:'explicit',model:'test-small',effort:'low',reason:'Clear scoped task with objective checks',...extra});
const claudeChoice=(extra={})=>({mode:'explicit',model:'haiku',reason:'Scoped task; effective host settings remain unverified',...extra});

test('selection preserves the legacy default and admits only advertised model/effort choices',()=>{
  assert.deepEqual(normalizeSelection(undefined,'codex'),{mode:'default'});
  assert.deepEqual(normalizeSelection(null,'codex'),{mode:'default'});
  assert.deepEqual(normalizeSelection(null,'claude'),{mode:'default'});
  const choice=normalizeSelection(explicit(),'codex',catalog);
  assert.equal(choice.model,'test-small');assert.equal(choice.effort,'low');
  assert.equal(choice.reason,'Clear scoped task with objective checks');
  assert.equal(normalizeSelection(explicit({model:'test-review',effort:'ultra'}),'codex',catalog).effort,'ultra');
  assert.throws(()=>normalizeSelection(explicit({model:'invented-model'}),'codex',catalog));
  assert.throws(()=>normalizeSelection(explicit({effort:'high'}),'codex',catalog));
  assert.throws(()=>normalizeSelection(explicit(),'codex',{supported:false,models:[],error:'Catalog unavailable'}));
});

test('selection rejects malformed requests and reset cannot carry a stale explicit setting',()=>{
  for(const value of [[],true,'test-small',{},explicit({reason:''}),explicit({reason:'x'.repeat(301)}),explicit({model:''}),
    explicit({effort:4}),explicit({fallback:'test-review'}),{mode:'default',model:'test-small',reason:'Reset'},
    {mode:'default',effort:'low',reason:'Reset'},{mode:'surprise',reason:'Invalid'}]) {
    assert.throws(()=>normalizeSelection(value,'codex',catalog),JSON.stringify(value));
  }
  const reset=normalizeSelection({mode:'default',reason:'Return to host default'},'codex',catalog);
  assert.equal(reset.mode,'default');assert.equal(reset.model,undefined);assert.equal(reset.effort,undefined);
});

test('speed is independent of model and effort; unsupported or paid requests fail closed',()=>{
  for(const speed of ['fast','priority','standard','arbitrary',null,1]) {
    for(const host of ['codex','claude']) {
      assert.throws(()=>normalizeSelection({mode:'default',reason:'Assess defaults',speed},host,claudeCatalog));
      assert.throws(()=>commandArgs(host,null,{mode:'default',speed},claudeCatalog));
    }
  }
  assert.throws(()=>normalizeSelection(explicit({speed:'fast_disabled'}),'codex',catalog));
  assert.throws(()=>commandArgs('codex',null,explicit({speed:'fast_disabled'})));
  const defaultOff={mode:'default',reason:'Explicitly disable fast mode',speed:'fast_disabled'};
  assert.deepEqual(normalizeSelection(defaultOff,'claude',claudeCatalog),defaultOff);
  for(const support of [undefined,{}, {fast_disabled:false}]) {
    const unavailable={...claudeCatalog,speed_support:support};
    assert.throws(()=>normalizeSelection(defaultOff,'claude',unavailable));
    assert.throws(()=>commandArgs('claude',null,defaultOff,unavailable));
  }
  assert.equal(normalizeSelection(claudeChoice({speed:'fast_disabled'}),'claude',claudeCatalog).model,'haiku');
  assert.equal(normalizeSelection(explicit({speed:'host_default'}),'codex',catalog).effort,'low');
  for(const model of ['haiku','sonnet','opus']) {
    assert.equal(normalizeSelection(claudeChoice({model}),'claude',claudeCatalog).model,model);
    for(const effort of ['low','medium','high','xhigh','max']) {
      assert.throws(()=>normalizeSelection(claudeChoice({model,effort}),'claude',claudeCatalog),/unverified/);
      assert.throws(()=>commandArgs('claude',null,claudeChoice({model,effort}),claudeCatalog),/unverified/);
    }
  }
  const claimedEffortCatalog={...claudeCatalog,models:[{id:'haiku',supported_efforts:['high']}]};
  assert.throws(()=>normalizeSelection(claudeChoice({effort:'high'}),'claude',claimedEffortCatalog),/unverified/);
  assert.throws(()=>normalizeSelection(claudeChoice({model:'invented',speed:'fast_disabled'}),'claude',claudeCatalog));
  assert.throws(()=>normalizeSelection(explicit({effort:'high',speed:'host_default'}),'codex',catalog));
});

test('session keys preserve legacy/default compatibility and change only for setting changes',()=>{
  const first=normalizeSelection(explicit(),'codex',catalog);
  assert.equal(selectionKey(first),JSON.stringify(['explicit','test-small','low']));
  assert.equal(selectionKey(first),selectionKey({...first,reason:'Equivalent task rationale'}));
  assert.equal(selectionKey(first),selectionKey({...first,speed:'host_default'}));
  assert.notEqual(selectionKey(first),selectionKey({...first,effort:'medium'}));
  assert.notEqual(selectionKey(first),selectionKey({...first,model:'test-review'}));
  assert.notEqual(selectionKey(first),selectionKey({mode:'default'}));
  assert.equal(selectionKey(undefined),JSON.stringify(['default']));
  assert.equal(selectionKey(undefined),selectionKey({mode:'default',speed:'host_default'}));
  assert.equal(selectionKey({mode:'explicit',model:'haiku'}),JSON.stringify(['explicit','haiku',null]));
  const off=normalizeSelection(claudeChoice({speed:'fast_disabled'}),'claude',claudeCatalog);
  assert.notEqual(selectionKey(off),selectionKey({...off,speed:'host_default'}));
  assert.equal(selectionKey(off),selectionKey({...off,reason:'Another explanation'}));
  assert.notEqual(selectionKey({mode:'default',speed:'fast_disabled'}),selectionKey({mode:'default'}));
});

test('explicit flags reach fresh/resumed commands and fast-off preserves all isolation settings',()=>{
  for(const native of [undefined,'native-prior']) {
    const codex=commandArgs('codex',native,explicit());
    const claude=commandArgs('claude',native,claudeChoice({speed:'fast_disabled'}),claudeCatalog);
    assert.equal(codex[codex.indexOf('--model')+1],'test-small');
    assert.ok(codex.includes('model_reasoning_effort="low"'));
    for(const required of ['--ignore-user-config','--skip-git-repo-check','--json','sandbox_mode="read-only"','approval_policy="never"','features.shell_tool=false','features.unified_exec=false','features.multi_agent=false','web_search="disabled"'])assert.ok(codex.includes(required),required);
    assert.equal(claude[claude.indexOf('--model')+1],'haiku');
    assert.ok(!claude.includes('--effort'));
    assert.equal(claude[claude.indexOf('--tools')+1],'');
    assert.ok(claude.includes('--strict-mcp-config'));
    assert.equal(claude[claude.indexOf('--mcp-config')+1],'{"mcpServers":{}}');
    assert.equal(claude[claude.indexOf('--setting-sources')+1],'');
    assert.deepEqual(JSON.parse(claude[claude.indexOf('--settings')+1]),{disableAllHooks:true,fastMode:false});
    assert.equal(claude[claude.indexOf('--permission-mode')+1],'plan');
    assert.ok(!claude.includes('--fallback-model'));assert.ok(!JSON.stringify(codex).includes('dangerously'));
    assert.ok(!JSON.stringify(codex).includes('service_tier'));
    if(native){assert.ok(codex.includes(native));assert.ok(claude.includes(native));assert.ok(codex.includes('resume'));}
  }
  for(const host of ['codex','claude'])for(const selection of [null,{mode:'default'},{mode:'default',speed:'host_default'}]) {
    const args=commandArgs(host,null,selection);
    assert.ok(!args.includes('--model'));assert.ok(!args.includes('--effort'));
    if(host==='claude')assert.deepEqual(JSON.parse(args[args.indexOf('--settings')+1]),{disableAllHooks:true});
  }
});

test('fast-off support requires documented version threshold and settings control',()=>{
  for(const version of ['2.1.205','2.1.206 (Claude Code)','2.2.0','3.0.0'])assert.equal(claudeFastOffSupport(version,'  --settings <json>\n'),true);
  for(const version of ['2.1.204','2.0.999','1.99.999','unknown','2.1.205-beta','version 2.1.205','2.1.205\nsecret'])assert.equal(claudeFastOffSupport(version,'--settings <json>'),false);
  assert.equal(claudeFastOffSupport('2.1.205','--model --effort'),false);
  assert.equal(claudeFastOffSupport('2.1.205','--settings-file <path>'),false);
});

test('Codex advertised speed metadata is bounded and never becomes an execution control',()=>{
  const source={model:'test-small',displayName:'Small',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low',
    serviceTiers:[{id:'priority',name:'Fast',description:'Advertised only',account:'discard'},null,{id:'bad tier'},{id:'priority',name:'Duplicate'}],
    defaultServiceTier:'priority',additionalSpeedTiers:['fast','fast','invalid tier'],secret:'discard'};
  const model=sanitizeCodexModel(source);
  assert.deepEqual(model.serviceTiers,[{id:'priority',name:'Fast',description:'Advertised only'}]);
  assert.equal(model.defaultServiceTier,'priority');assert.deepEqual(model.additionalSpeedTiers,['fast']);
  assert.equal(model.secret,undefined);assert.equal(model.serviceTiers[0].account,undefined);
  const advertised={...catalog,models:[model]};
  assert.equal(normalizeSelection(explicit(),'codex',advertised).model,'test-small');
  assert.ok(!commandArgs('codex',null,explicit()).some(a=>a.includes('service_tier')));
  assert.throws(()=>normalizeSelection(explicit({speed:'priority'}),'codex',advertised));
  const minimal=sanitizeCodexModel({model:'test-small',supportedReasoningEfforts:[{reasoningEffort:'low'}]});
  assert.equal(minimal.defaultServiceTier,undefined);assert.equal(minimal.serviceTiers,undefined);
  const bounded=sanitizeCodexModel({...source,serviceTiers:Array.from({length:30},(_,i)=>({id:`tier-${i}`,name:'x'.repeat(300),description:'x'.repeat(800)})),additionalSpeedTiers:Array.from({length:30},(_,i)=>`speed-${i}`)});
  assert.equal(bounded.serviceTiers.length,16);assert.equal(bounded.serviceTiers[0].name.length,150);assert.equal(bounded.serviceTiers[0].description.length,500);assert.equal(bounded.additionalSpeedTiers.length,16);
  assert.equal(sanitizeCodexModel({...source,hidden:true}),null);
  assert.throws(()=>sanitizeCodexModel({...source,model:'bad model'}));
});

test('host output does not turn successful exit or usage into effective model/effort/tier proof',()=>{
  const codex=parseOutput('codex','{"type":"thread.started","thread_id":"native"}\n{"type":"turn.started"}\n{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}\n{"type":"turn.completed"}');
  assert.deepEqual(codex.model_evidence.reported_models,[]);
  assert.equal(codex.model_evidence.reported_effort,null);
  assert.equal(codex.model_evidence.reported_service_tier,null);
  assert.equal(codex.model_evidence.applied_controls,null);
  assert.equal(codex.model_evidence.verification,'unverified');
  const withoutUsage=parseOutput('claude',JSON.stringify({subtype:'success',session_id:'native',result:'ok'}));
  assert.deepEqual(withoutUsage.model_evidence.reported_models,[]);
  assert.equal(withoutUsage.model_evidence.verification,'unverified');
  const withUsage=parseOutput('claude',JSON.stringify({subtype:'success',session_id:'native',result:'ok',effort:'high',service_tier:'priority',modelUsage:{
    'claude-test-old':{inputTokens:10,outputTokens:2,costUSD:0.01,private_field:'must not retain'},
    'claude-test-new':{inputTokens:20,outputTokens:3,costUSD:0.02},
  }}));
  assert.deepEqual(withUsage.model_evidence.reported_models.sort(),['claude-test-new','claude-test-old']);
  assert.match(withUsage.model_evidence.scope,/session/);
  assert.equal(withUsage.model_evidence.reported_effort,null);
  assert.equal(withUsage.model_evidence.reported_service_tier,null);
  assert.equal(withUsage.model_evidence.applied_controls,null);
  assert.equal(withUsage.model_evidence.verification,'host_reported');
  assert.ok(!JSON.stringify(withUsage).includes('must not retain'));
});

// Event-only child: no subprocess, filesystem, provider call, or real timer.
async function syntheticRun(host,selection,nativeId) {
  const child=new EventEmitter();
  child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  let argv,launch,timing,nextTimer=0;
  const timers=new Map();
  child.kill=()=>{throw new Error('Unexpected termination on success');};
  child.stdin.end=prompt=>{
    assert.equal(prompt,'test prompt');
    child.emit('spawn');
    child.stdout.emit('data',host==='codex'?[{type:'thread.started',thread_id:nativeId??'synthetic-native'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:'ok'}},{type:'turn.completed'}].map(e=>JSON.stringify(e)).join('\n'):JSON.stringify({subtype:'success',session_id:'synthetic-native',result:'ok'}));
    child.emit('close',0);
  };
  const original=createOriginalAdapterProcessFixture({host,child,now:()=>1000,onLaunch:(command,args,options)=>{assert.equal(command,'synthetic-cli');argv=args;launch=options;}});
  const result=await original.run(host,nativeId,'test prompt','/synthetic',180000,selection,{
    resolveExecutable:()=> 'synthetic-cli',now:()=>1000,
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    onSpawn:record=>{timing=record;},
  });
  assert.equal(timers.size,0);
  assert.deepEqual(Object.keys(timing).sort(),['timeout_policy_version','timeout_ms','timeout_reason','execution_started_at','execution_deadline_at','termination_deadline_at'].sort());
  assert.equal(launch.env.COMPANY_WORKER,'1');assert.equal(launch.env.CLAUDECODE,undefined);
  original.dispose();
  return {result,argv};
}

test('runModel retains positional/options contract and distinguishes applied argv from observations',async()=>{
  for(const native of [null,'native-prior']) {
    const {result}=await syntheticRun('codex',explicit(),native);
    assert.equal(result.native_id,native??'synthetic-native');
    assert.equal(result.model_evidence.applied_controls.model,'test-small');
    assert.equal(result.model_evidence.applied_controls.effort,'low');
    assert.equal(result.model_evidence.applied_controls.service_tier,null);
    assert.equal(result.model_evidence.applied_controls.fast_mode,null);
    assert.equal(result.model_evidence.reported_effort,null);
    assert.equal(result.model_evidence.reported_service_tier,null);
    assert.equal(result.model_evidence.verification,'unverified');
  }
  for(const host of ['codex','claude']) {
    const {result}=await syntheticRun(host,null,null);
    assert.equal(result.model_evidence.applied_controls.model,null);
    assert.equal(result.model_evidence.applied_controls.effort,null);
    assert.equal(result.model_evidence.applied_controls.fast_mode,null);
    assert.equal(result.model_evidence.applied_controls.switch_models_on_flag,null);
    assert.equal(result.model_evidence.applied_controls.scope,'child_launch_argv');
    assert.equal(result.model_evidence.applied_controls.verification,'applied_controls_not_effective_settings');
  }
});

function stateWithJobs(jobs,records={}) {
  return {roles:{pm:{name:'Product Manager'},qa:{name:'QA & Eval'},engineer:{name:'Software Engineer'}},
    jobs:Object.fromEntries(jobs.map((j,i)=>[j.id,{role:'pm',instance_id:'pm-instance',task:'Detailed private implementation instructions',task_summary:'Define the next useful change',created_at:new Date(1000+i).toISOString(),...j}])),records};
}

test('activity shows lifecycle, rationale, speed, applied controls, review and handoff separately',()=>{
  const applied={model:'test-small',effort:'low',fast_mode:null,service_tier:null};
  const s=stateWithJobs([
    {id:'queued',status:'queued',next_handoff:'Engineering checks feasibility',model_selection:explicit({speed:'host_default'})},
    {id:'returned',status:'completed',model_selection:explicit(),model_evidence:{reported_models:[],reported_effort:null,reported_service_tier:null,verification:'unverified',applied_controls:applied}},
    {id:'reviewed',role:'qa',instance_id:'qa-instance',status:'completed',artifact_id:'qa-pass'},
    {id:'quarantined',role:'qa',status:'quarantined',artifact_id:'qa-quarantined'},
    {id:'failed',status:'failed',error:'Model unavailable'},
    {id:'interrupted',status:'interrupted'},
    {id:'cancelled',status:'cancelled'},
  ],{
    'qa-pass':{id:'qa-pass',kind:'review',status:'Submitted',review_of:{id:'work',revision:1},review:{verdict:'Pass'}},
    'qa-quarantined':{id:'qa-quarantined',kind:'review',status:'Quarantined',review_of:{id:'work',revision:1},review:{verdict:'Pass'}},
  });
  const rows=activityFor(s),byId=Object.fromEntries(rows.map(r=>[r.job_id,r]));
  assert.equal(byId.queued.agent,'Product Manager');assert.equal(byId.queued.instance_id,'pm-instance');
  assert.equal(byId.queued.task,'Define the next useful change');assert.equal(byId.queued.status,'queued');
  assert.equal(byId.queued.selection_reason,explicit().reason);assert.equal(byId.queued.requested_speed,'host_default');
  assert.equal(byId.queued.applied_controls,null);
  assert.deepEqual(byId.returned.applied_controls,applied);
  assert.equal(byId.returned.model_evidence.reported_service_tier,null);
  assert.equal(byId.returned.status,'returned');assert.equal(byId.reviewed.status,'returned');
  assert.equal(byId.reviewed.review.verdict,'Pass');assert.ok(!byId.quarantined.review);
  for(const status of ['failed','interrupted','cancelled','quarantined'])assert.equal(byId[status].status,status);
  assert.equal(byId.queued.next_handoff.status,'planned');
  assert.match(byId.queued.next_handoff.description,/Engineering/);
  assert.ok(!JSON.stringify(rows).includes('Detailed private implementation instructions'));
  assert.ok(rows.every(r=>r.status!=='accepted' && r.accepted!==true && r.percent===undefined));
  const off=activityFor(stateWithJobs([{id:'off',status:'queued',model_selection:claudeChoice({speed:'fast_disabled'})}]))[0];
  assert.equal(off.requested_speed,'fast_disabled');assert.equal(off.applied_controls,null);
  const legacy=activityFor(stateWithJobs([{id:'legacy',status:'completed'}]))[0];
  assert.equal(legacy.requested_speed,'host_default');assert.equal(legacy.selection_reason,null);
  assert.equal(legacy.applied_controls,null);assert.equal(legacy.model_evidence.verification,'unverified');
  const fallback=activityFor(stateWithJobs([{id:'fallback',status:'queued',task_summary:undefined,task:'Review\n\t scoped   selection'}]))[0];
  assert.equal(fallback.task,'Review scoped selection');
});

test('activity retains active jobs and software rows never inherit model requests or observations',()=>{
  const jobs=[{id:'active-old',status:'running',created_at:new Date(1).toISOString()}];
  for(let i=0;i<25;i++)jobs.push({id:`old-${i}`,status:'completed'});
  const rows=activityFor(stateWithJobs(jobs));
  assert.ok(rows.some(r=>r.job_id==='active-old' && r.status==='running'));
  assert.ok(rows.length<jobs.length);
  const software=activityFor(stateWithJobs([{id:'test',kind:'development_test',role:'engineer',status:'running',model_selection:explicit({speed:'host_default'}),model_evidence:{applied_controls:{model:'stale'},reported_models:['stale'],reported_effort:'high',reported_service_tier:'priority',verification:'host_reported'}}]))[0];
  assert.match(software.agent,/software|test runner/i);
  assert.notEqual(software.agent,'Software Engineer');
  for(const field of ['requested_model','requested_effort','requested_speed','selection_reason','applied_controls'])assert.equal(software[field],null);
  assert.equal(software.model_evidence.verification,'not_applicable');
  assert.deepEqual(software.model_evidence.reported_models,[]);
  assert.equal(software.model_evidence.reported_effort,null);
  assert.equal(software.model_evidence.reported_service_tier,null);
  assert.equal(software.model_evidence.applied_controls,null);
});
