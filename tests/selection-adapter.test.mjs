import test from 'node:test';
import assert from 'node:assert/strict';
import {commandArgs, parseOutput, sanitizeCodexModel, claudeFastOffSupport} from '../plugins/soloco/runtime/adapters.mjs';

// Synthetic capability metadata prevents discovery and provider calls.
const supported={speed_support:{fast_disabled:true}};
const unsupported={speed_support:{fast_disabled:false}};
const flag=(args,name)=>args[args.indexOf(name)+1];

test('only undefined speed defaults; whole null/undefined selections stay compatible',()=>{
  for(const host of ['codex','claude'])for(const nativeId of [null,'saved-session']) {
    const baseline=commandArgs(host,nativeId);
    for(const selection of [null,undefined,{mode:'default'},{mode:'default',speed:undefined},{mode:'default',speed:'host_default'}])
      assert.deepEqual(commandArgs(host,nativeId,selection),baseline);
    for(const speed of [null,'','fast','priority','standard',false,true,0,1,{},[],['host_default']])
      for(const selection of [{mode:'default',speed},{mode:'explicit',model:'sonnet',speed}])
        assert.throws(()=>commandArgs(host,nativeId,selection,supported),/Unsupported speed/);
    assert.deepEqual(commandArgs(host,nativeId,{mode:'explicit',model:'sonnet',speed:undefined}),
      commandArgs(host,nativeId,{mode:'explicit',model:'sonnet',speed:'host_default'}));
  }
});

test('Claude fast-off gates launch and resume while preserving isolation',()=>{
  for(const nativeId of [null,'saved-session']) {
    for(const capability of [unsupported,{}, {speed_support:{fast_disabled:'true'}}])
      assert.throws(()=>commandArgs('claude',nativeId,{mode:'default',speed:'fast_disabled'},capability),/requires verified installed version/);
    for(const selection of [{mode:'default',speed:'fast_disabled'},{mode:'explicit',model:'sonnet',speed:'fast_disabled'}]) {
      const args=commandArgs('claude',nativeId,selection,supported);
      assert.deepEqual(JSON.parse(flag(args,'--settings')),{disableAllHooks:true,fastMode:false});
      assert.equal(flag(args,'--tools'),'');
      assert.ok(args.includes('--strict-mcp-config'));
      assert.deepEqual(JSON.parse(flag(args,'--mcp-config')),{mcpServers:{}});
      assert.equal(flag(args,'--setting-sources'),'');
      assert.equal(flag(args,'--permission-mode'),'plan');
      assert.equal(flag(args,'--output-format'),'json');
      assert.equal(args.includes('--resume'),Boolean(nativeId));
      if(nativeId)assert.equal(flag(args,'--resume'),nativeId);
      if(selection.model)assert.equal(flag(args,'--model'),selection.model);
    }
    assert.deepEqual(JSON.parse(flag(commandArgs('claude',nativeId),'--settings')),{disableAllHooks:true});
    assert.throws(()=>commandArgs('claude',nativeId,{mode:'explicit',model:'sonnet',effort:'high'},supported),/model-specific effort support is unverified/);
  }
});

test('Codex launch and resume preserve controls and reject unverified fast-off',()=>{
  for(const nativeId of [null,'saved-session']) {
    assert.throws(()=>commandArgs('codex',nativeId,{mode:'default',speed:'fast_disabled'},supported),/fast-off reset is unverified/);
    const args=commandArgs('codex',nativeId,{mode:'explicit',model:'gpt-example',effort:'high'});
    assert.deepEqual(args.slice(0,nativeId?2:1),nativeId?['exec','resume']:['exec']);
    for(const item of ['--ignore-user-config','--skip-git-repo-check','--json'])assert.ok(args.includes(item));
    const configs=args.flatMap((value,i)=>value==='-c'?[args[i+1]]:[]);
    for(const config of ['sandbox_mode="read-only"','approval_policy="never"','features.shell_tool=false','features.unified_exec=false','features.multi_agent=false','web_search="disabled"','model_reasoning_effort="high"'])assert.ok(configs.includes(config));
    assert.equal(flag(args,'--model'),'gpt-example');
    assert.equal(args.at(-1),'-');
    if(nativeId)assert.equal(args.at(-2),nativeId);
    assert.ok(!configs.some(value=>value.startsWith('service_tier=')));
  }
});

test('installed-version capability predicate is conservative; inputs are synthetic',()=>{
  for(const version of ['2.1.205','2.1.206 (Claude Code)','2.2.0','3.0.0'])
    assert.equal(claudeFastOffSupport(version,'Options:\n  --settings <json>'),true);
  for(const version of ['2.1.204','2.0.999','1.99.999','2.1.205-beta','unknown','',null])
    assert.equal(claudeFastOffSupport(version,' --settings <json>'),false);
  for(const help of ['',null,' --settings-file <file>','prefix--settings'])
    assert.equal(claudeFastOffSupport('2.1.205',help),false);
});

test('output observations do not infer requested, applied or effective settings',()=>{
  const codex=parseOutput('codex',[
    {type:'thread.started',thread_id:'thread-example'},
    {type:'turn.started'},
    {type:'item.completed',item:{type:'agent_message',text:'artifact'},model:'claimed',service_tier:'priority'},
    {type:'turn.completed'}
  ].map(value=>JSON.stringify(value)).join('\n'));
  const claude=parseOutput('claude',JSON.stringify({subtype:'success',session_id:'session-example',result:'artifact',model:'claimed',effort:'high',service_tier:'priority'}));
  for(const result of [codex,claude]) {
    assert.equal(result.text,'artifact');
    assert.deepEqual(result.model_evidence.reported_models,[]);
    for(const field of ['reported_effort','reported_service_tier','applied_controls'])assert.equal(result.model_evidence[field],null);
    assert.equal(result.model_evidence.verification,'unverified');
  }
  const usage=parseOutput('claude',JSON.stringify({subtype:'success',result:'artifact',modelUsage:{sonnet:{inputTokens:12,outputTokens:-1,cacheReadInputTokens:1.5,costUSD:0.25,service_tier:'priority',secret:'discard'},'bad model':{inputTokens:2}}})).model_evidence;
  assert.equal(usage.scope,'session_cumulative_including_internal_calls');
  assert.equal(usage.verification,'host_reported');
  assert.deepEqual(usage.reported_models,['sonnet']);
  assert.deepEqual(usage.usage,{sonnet:{inputTokens:12,costUSD:0.25}});
  assert.equal(usage.reported_service_tier,null);
  assert.equal(usage.reported_effort,null);
  assert.equal(usage.applied_controls,null);
});

test('Codex advertised metadata is bounded and does not establish entitlement',()=>{
  const base={model:'gpt-example',supportedReasoningEfforts:[null,{reasoningEffort:'high'},{reasoningEffort:'high'},{reasoningEffort:'invalid effort'}]};
  const model=sanitizeCodexModel({...base,displayName:'n'.repeat(200),description:'d'.repeat(600),defaultReasoningEffort:'high',isDefault:true,
    serviceTiers:[{id:'priority',name:'n'.repeat(200),description:'d'.repeat(600),entitled:true},{id:'priority'},{id:'bad tier'},null],
    defaultServiceTier:'priority',additionalSpeedTiers:['priority','priority','bad tier',null],entitled:true,paid_tiers_enabled:true});
  assert.deepEqual(model.supported_efforts,['high']);
  assert.equal(model.effort_support,'host_catalog');
  assert.equal(model.name.length,150);
  assert.equal(model.description.length,500);
  assert.equal(model.default_effort,'high');
  assert.equal(model.is_default,true);
  assert.deepEqual(model.serviceTiers,[{id:'priority',name:'n'.repeat(150),description:'d'.repeat(500)}]);
  assert.equal(model.defaultServiceTier,'priority');
  assert.deepEqual(model.additionalSpeedTiers,['priority']);
  for(const key of ['entitled','paid_tiers_enabled','applied_controls'])assert.equal(Object.hasOwn(model,key),false);
  const bounded=sanitizeCodexModel({...base,serviceTiers:Array.from({length:20},(_,i)=>({id:`tier${i}`})),additionalSpeedTiers:Array.from({length:20},(_,i)=>`speed${i}`)});
  assert.equal(bounded.serviceTiers.length,16);
  assert.equal(bounded.additionalSpeedTiers.length,16);
  const omitted=sanitizeCodexModel({...base,defaultReasoningEffort:'bad effort',defaultServiceTier:null,serviceTiers:'bad',additionalSpeedTiers:{}});
  for(const key of ['default_effort','defaultServiceTier','serviceTiers','additionalSpeedTiers'])assert.equal(Object.hasOwn(omitted,key),false);
  assert.equal(sanitizeCodexModel({...base,hidden:true}),null);
  assert.equal(sanitizeCodexModel({...base,supportedReasoningEfforts:[]}),null);
  for(const item of [null,[],{...base,model:'bad model'},{model:'gpt-example'}])assert.throws(()=>sanitizeCodexModel(item),/Invalid advertised Codex model/);
});
