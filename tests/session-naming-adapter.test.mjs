import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const title='SoloCo — QA & Eval · fictional';
function harness(host,{native=null,supported=true,displayTitle=title,renameSession=async()=>({status:'named',verification:'fictional'})}={}) {
  const child=new EventEmitter();child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>true;
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-name-adapter-')));
  let args;
  const result=runModel(host,native,'Fictional prompt','/tmp',180000,null,{sessionTitle:displayTitle,sessionNameDirectory:directory,sessionNameSupport:supported,renameSession,resolveExecutable:()=>'/fictional/'+host,spawn:(_command,argv)=>{args=argv;return child;}});
  child.emit('spawn');
  const complete=(id=native??'fictional-native')=>{
    const output=host==='claude'?JSON.stringify({subtype:'success',session_id:id,result:'Fictional result'}):[
      {type:'thread.started',thread_id:id},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:'Fictional result'}},{type:'turn.completed'}
    ].map(JSON.stringify).join('\n')+'\n';
    child.stdout.emit('data',output);child.emit('close',0);
  };
  return {child,result,args,complete,directory,close:()=>fs.rmSync(directory,{recursive:true,force:true})};
}

test('Codex names an observed native early without waiting for naming completion or changing model evidence',async()=>{
  let finishNaming;const calls=[];
  const h=harness('codex',{renameSession:(...args)=>{calls.push(args);return new Promise(resolve=>{finishNaming=resolve;});}});
  try {
    h.child.stdout.emit('data','{"type":"thread.started","thread_id":"fictional');
    await tick();assert.equal(calls.length,0);
    h.child.stdout.emit('data','-native"}\n');await tick();
    assert.equal(calls.length,1);assert.deepEqual(calls[0],['/fictional/codex','fictional-native',title]);
    h.child.stdout.emit('data','{"type":"turn.started"}\n{"type":"item.completed","item":{"type":"agent_message","text":"Fictional result"}}\n{"type":"turn.completed"}\n');h.child.emit('close',0);
    const output=await h.result;assert.equal(output.text,'Fictional result');assert.equal(output.native_id,'fictional-native');
    assert.equal(output.sessionTitle,undefined);assert.equal(output.model_evidence.session_name,undefined);assert.equal(calls.length,1);
    finishNaming({host:'codex',native_id:'fictional-native',title,status:'named',verification:'fictional'});await tick();
  }finally{h.close();}
});

test('Codex naming failure stays cosmetic and resumed identity mismatches never rename another native',async()=>{
  const h=harness('codex',{renameSession:async()=>{throw Error('Fictional metadata outage');}});
  try{h.complete();assert.equal((await h.result).text,'Fictional result');await tick();await tick();}finally{h.close();}
  const calls=[],wrong=harness('codex',{native:'expected-native',renameSession:async(...args)=>{calls.push(args);return {status:'named'};}});
  try{wrong.complete('unexpected-native');await assert.rejects(wrong.result,/identity changed/);await tick();assert.equal(calls.length,0);}finally{wrong.close();}
});
test('synchronous optional naming preflight cannot launch a model after its absolute deadline',async()=>{
  let now=1000,spawns=0;
  await assert.rejects(runModel('claude',null,'fictional','/tmp',1000,null,{
    sessionTitle:title,timeoutReason:'Fictional absolute deadline check.',executionDeadlineAt:2000,now:()=>now,
    resolveExecutable:()=>'/fictional/claude',probeSessionName:()=>{now=2500;return true;},spawn:()=>{spawns++;throw Error('must not spawn');}
  }),error=>error.code==='ROLE_TIMEOUT'&&error.termination_confirmed===true);
  assert.equal(spawns,0);
});

for(const native of [null,'fictional-native'])for(const supported of [true,false])test(`Claude fresh/resume ${native??'fresh'} applies names only when supported=${supported}`,async()=>{
  const h=harness('claude',{native,supported});try {
    assert.equal(h.args.includes('--name'),supported);
    if(supported)assert.equal(h.args[h.args.indexOf('--name')+1],title);
    assert.equal(h.args[h.args.indexOf('--permission-mode')+1],'plan');
    assert.ok(h.args.includes('--strict-mcp-config'));assert.equal(h.args[h.args.indexOf('--tools')+1],'');
    assert.deepEqual(JSON.parse(h.args[h.args.indexOf('--settings')+1]),{disableAllHooks:true});
    if(native)assert.equal(h.args[h.args.indexOf('--resume')+1],native);
    h.complete();const result=await h.result;assert.equal(result.text,'Fictional result');assert.equal(result.model_evidence.session_name,undefined);
    await tick();await tick();
    const files=fs.readdirSync(h.directory);assert.equal(files.length,1);
    const receipt=JSON.parse(fs.readFileSync(path.join(h.directory,files[0])));assert.equal(receipt.status,supported?'requested':'unsupported');
    assert.equal(receipt.native_id,'fictional-native');
  }finally{h.close();}
});

 test('later role names serialize after earlier metadata writes without delaying either model result',async()=>{
  let finishFirst;const calls=[];
  const renameSession=async(_command,native_id,title)=>{calls.push(title);if(calls.length===1)await new Promise(resolve=>{finishFirst=resolve;});return {host:'codex',native_id,title,status:'named',verification:'fictional'};};
  const first=harness('codex',{native:'shared-native',displayTitle:'SoloCo — Engineering',renameSession});
  let second;try {
    first.complete();await first.result;await tick();assert.deepEqual(calls,['SoloCo — Engineering']);
    second=harness('codex',{native:'shared-native',displayTitle:'SoloCo — Independent QA',renameSession});
    second.complete();assert.equal((await second.result).text,'Fictional result');await tick();assert.equal(calls.length,1);
    finishFirst();await tick();await tick();assert.deepEqual(calls,['SoloCo — Engineering','SoloCo — Independent QA']);
  }finally{finishFirst?.();first.close();second?.close();}
});
