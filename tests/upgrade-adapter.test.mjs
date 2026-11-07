import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runModel, commandArgs } from '../plugins/soloco/runtime/adapters.mjs';

test('nonzero native exit preserves bounded stderr instead of replacing it with an artifact parse error',async()=>{
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
  const promise=runModel('codex',null,'private prompt never included','/tmp',180000,null,{
    resolveExecutable:()=>'/mock/codex',spawn:()=>{
      process.nextTick(()=>{child.emit('spawn');child.stderr.write('x'.repeat(4000)+' input_too_large: Input exceeds maximum1048576 characters, actual2254398');child.emit('close',1);});return child;
    }
  });
  await assert.rejects(promise,error=>{
    assert.match(error.message,/input_too_large.*maximum1048576/);
    assert.doesNotMatch(error.message,/private prompt|no completed artifact/);
    assert.ok(error.message.length<1000);return true;
  });
});

test('real adapter resumes existing native IDs with model tools disabled for both hosts',()=>{
  const codex=commandArgs('codex','stable-cos');
  assert.deepEqual(codex.slice(0,2),['exec','resume']);
  assert.equal(codex.at(-2),'stable-cos');
  assert.ok(codex.includes('features.shell_tool=false'));
  const claude=commandArgs('claude','stable-qa');
  assert.deepEqual(claude.slice(-2),['--resume','stable-qa']);
  assert.equal(claude[claude.indexOf('--tools')+1],'');
});

test('selected upgrade calls apply identical launch and resume flags while observations stay distinct',async()=>{
  for(const host of ['codex','claude'])for(const native of [null,`native-${host}`]) {
    const selection={mode:'explicit',model:'fixture-model',...(host==='codex'?{effort:'high'}:{}),reason:'Synthetic upgrade control check'};
    const child=new EventEmitter();
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
    let launched;
    const result=await runModel(host,native,'fictional upgrade prompt','/tmp',180000,selection,{
      resolveExecutable:()=>`/mock/${host}`,spawn:(command,args)=>{
        launched=args;
        process.nextTick(()=>{
          child.emit('spawn');
          const text=JSON.stringify({content:'Fictional review'});
          if(host==='codex')child.stdout.write([
            {type:'thread.started',thread_id:`native-${host}`},
            {type:'turn.started'},
            {type:'item.completed',item:{type:'agent_message',text}},
            {type:'turn.completed'}
          ].map(value=>JSON.stringify(value)).join('\n'));
          else child.stdout.write(JSON.stringify({subtype:'success',session_id:`native-${host}`,result:text,modelUsage:{'fixture-model':{inputTokens:10}}}));
          child.emit('close',0);
        });
        return child;
      }
    });
    assert.deepEqual(launched,commandArgs(host,native,selection));
    assert.equal(launched[launched.indexOf('--model')+1],selection.model);
    const evidence=result.model_evidence;
    assert.equal(evidence.applied_controls.model,selection.model);
    assert.equal(evidence.applied_controls.effort,selection.effort??null);
    assert.equal(evidence.applied_controls.verification,'applied_controls_not_effective_settings');
    assert.equal(evidence.applied_controls.service_tier,null);
    assert.equal(evidence.reported_effort,null);assert.equal(evidence.reported_service_tier,null);
    assert.deepEqual(evidence.reported_models,host==='codex'?[]:['fixture-model']);
    assert.equal(evidence.verification,host==='codex'?'unverified':'host_reported');
    if(host==='claude')assert.equal(evidence.scope,'session_cumulative_including_internal_calls');
  }
});

test('selected native timeout does not manufacture applied or effective model evidence',async()=>{
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=()=>{process.nextTick(()=>child.emit('close',null));return true;};
  let now=1000;const timers=[];
  const selection={mode:'explicit',model:'fixture-model',effort:'high',reason:'Synthetic timeout'};
  const pending=runModel('codex',null,'fictional prompt','/tmp',1000,selection,{
    timeoutReason:'Synthetic bounded timeout check',
    resolveExecutable:()=>'/mock/codex',now:()=>now,
    setTimeout:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimeout:()=>{},
    spawn:()=>{process.nextTick(()=>{
      child.emit('spawn');now=2000;
      timers.find(timer=>timer.ms===1000).fn();
    });return child;}
  });
  await assert.rejects(pending,error=>{
    assert.match(error.message,/timed out/);
    assert.equal(error.model_evidence,undefined);
    assert.equal(error.applied_controls,undefined);
    return true;
  });
});

test('upgrade adapter schedules the selected or remaining cap for both hosts and resumed calls',async()=>{
  for(const host of ['codex','claude'])for(const native of [null,`native-${host}`])for(const cap of [1800000,90000]) {
    const child=new EventEmitter();
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    const signals=[];child.kill=signal=>{signals.push(signal);return true;};
    let now=1000000,receipt;
    const timers=new Set();
    const pending=runModel(host,native,'Synthetic upgrade timer fixture','/tmp',cap,null,{
      timeoutContext:'upgrade-call',timeoutReason:'Selected ceiling capped by remaining overall window',
      resolveExecutable:()=>`/mock/${host}`,spawn:()=>child,now:()=>now,
      setTimeout:(fn,ms)=>{const timer={fn,ms};timers.add(timer);return timer;},
      clearTimeout:timer=>timers.delete(timer),onSpawn:timing=>{receipt=timing;}
    });
    assert.deepEqual([...timers].map(t=>t.ms),[240000]);
    now+=100;child.emit('spawn');
    assert.equal(receipt.timeout_ms,cap);
    assert.equal(Date.parse(receipt.execution_started_at),now);
    assert.equal(Date.parse(receipt.execution_deadline_at),now+cap);
    assert.equal(Date.parse(receipt.termination_deadline_at),now+cap+3000);
    assert.deepEqual([...timers].map(t=>t.ms),[cap]);
    now+=cap;
    const timer=[...timers][0];timers.delete(timer);timer.fn();
    assert.deepEqual(signals,['SIGTERM']);
    assert.deepEqual([...timers].map(t=>t.ms),[3000]);
    child.emit('close',null);
    await assert.rejects(pending,error=>error.code==='ROLE_TIMEOUT' && error.termination_confirmed===true);
    assert.equal(timers.size,0);
  }
});
