import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeerHostProtocol,stablePeerHostTools,stableTaskHostTools} from '../plugins/soloco/runtime/peers/host-protocol.mjs';

// In-process protocol fixtures only. Receipts, owner, transport, process and
// native IDs below are synthetic DATA; no provider or host is authenticated.
const code=expected=>error=>error?.code===expected;
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(overrides={}){
  const owner=Symbol('synthetic instruction owner'),sent=[],calls=[];
  const observed={pid:12345,started_at:'2026-11-11T00:00:00.000Z'};
  const context={sha256:'a'.repeat(64),text:'complete synthetic context'};
  const receipt={admitted:true,task:{id:'task-1',value:{status:'running',owner_principal_id:'peer-1',attempt:{id:'attempt-1'}}},context};
  let callbacks,admissions=0,finishes=0,unsubscribed=0;
  const transport={send:frame=>sent.push(clone(frame)),attach:value=>{callbacks=value;return()=>{unsubscribed++;};}};
  const options={owner,transport,process:observed,mode:'peer',resume_native_id:'synthetic-native',
    admit:()=>{admissions++;return receipt;},
    bindNative:()=>({guard:()=>calls.push(['guard']),client:{
      inspect:(action,args)=>{calls.push(['inspect',action,clone(args)]);return action==='task/context'?context:{ok:true};},
      execute:(action,args)=>{calls.push(['execute',action,clone(args)]);return {committed:true};}
    }}),
    finish:packet=>{finishes++;return {recorded:clone(packet)};},...overrides};
  const protocol=createPeerHostProtocol(options);
  const request=method=>{const frame=sent.findLast(frame=>frame.method===method);assert.ok(frame,method);return frame;};
  return {owner,observed,context,receipt,transport,options,protocol,sent,calls,request,
    get admissions(){return admissions;},get finishes(){return finishes;},get unsubscribed(){return unsubscribed;},
    message:frame=>callbacks.message(clone(frame)),close:packet=>callbacks.close(packet)};
}
function running(f){
  f.protocol.start(f.owner);
  f.message({id:f.request('initialize').id,result:{}});
  f.message({id:f.request('thread/resume').id,result:{thread:{id:'synthetic-native',parentThreadId:null,forkedFromId:null,turns:[]}}});
  f.protocol.beginTurn(f.owner,'Use the complete synthetic context.');
  f.message({id:f.request('turn/start').id,result:{turn:{id:'synthetic-turn',status:'inProgress'}}});
  assert.equal(f.protocol.snapshot(f.owner).state,'running');
  return f;
}
function tool(f,args,overrides={}){
  return {id:'rpc-1',method:'item/tool/call',params:{threadId:'synthetic-native',turnId:'synthetic-turn',callId:'call-1',namespace:null,tool:'soloco_peer_execute',arguments:args,...overrides}};
}

test('fixed five-tool schemas are detached and the task profile advertises its bounded preparation action',()=>{
  const peer=stablePeerHostTools(),task=stableTaskHostTools();
  assert.deepEqual(peer.map(t=>t.name),['soloco_context_header','soloco_context_read','soloco_context_submit','soloco_peer_execute','soloco_peer_inspect']);
  assert.equal(task.length,5);
  const schema=task.find(t=>t.name==='soloco_peer_execute').inputSchema;
  assert.ok(schema.properties.action.enum.includes('software-publication/prepare'));
  assert.equal(schema.properties.action.enum.includes('grant/create'),false);
  schema.properties.action.enum.push('grant/create');
  peer[0].name='changed';
  assert.equal(stablePeerHostTools()[0].name,'soloco_context_header');
  assert.equal(stableTaskHostTools().find(t=>t.name==='soloco_peer_execute').inputSchema.properties.action.enum.includes('grant/create'),false);
});

test('only the original owner controls the connection and the transport cannot be claimed twice',()=>{
  const f=fixture(),other=Symbol('synthetic instruction owner');
  for(const method of ['start','beginTurn','yield','snapshot','evidence','result','failure'])
    assert.throws(()=>f.protocol[method](other,'instruction'),code('INSTRUCTION_OWNER'));
  assert.equal(f.admissions,0);assert.equal(f.sent.length,0);
  assert.throws(()=>createPeerHostProtocol(f.options),code('CONNECTION_OWNED'));
});

test('an actual admission callback and native bind must precede any turn request',()=>{
  const f=fixture();f.protocol.start(f.owner);
  assert.equal(f.admissions,1);
  assert.equal(f.sent.some(frame=>frame.method==='turn/start'),false);
  assert.throws(()=>f.protocol.beginTurn(f.owner,'Too early.'),code('TURN_ORDER'));
  assert.equal(f.protocol.snapshot(f.owner).state,'held');
  assert.equal(f.calls.length,0);assert.equal(f.finishes,0);
});

test('identity supplied by model arguments is rejected before an execution capability runs',()=>{
  for(const args of [{action:'message/send',args:{principal_id:'another-peer'}},{action:'message/send',args:{},actor:'founder'}]){
    const f=running(fixture());
    assert.throws(()=>f.message(tool(f,args)),code('ACTOR_ARGUMENT'));
    assert.equal(f.calls.filter(call=>call[0]==='execute').length,0);
    assert.equal(f.protocol.snapshot(f.owner).state,'held');
  }
});

test('identical tool replay returns the retained result without repeating a side effect',()=>{
  const f=running(fixture()),frame=tool(f,{action:'message/send',args:{content:'synthetic request'}});
  f.message(frame);f.message(frame);
  assert.equal(f.calls.filter(call=>call[0]==='execute').length,1);
  const responses=f.sent.filter(value=>value.id===frame.id&&Object.hasOwn(value,'result'));
  assert.equal(responses.length,2);assert.deepEqual(responses[0],responses[1]);
  assert.throws(()=>f.message({...frame,params:{...frame.params,arguments:{action:'message/send',args:{content:'changed'}}}}),code('CALL_REPLAY_MISMATCH'));
  assert.equal(f.calls.filter(call=>call[0]==='execute').length,1);
});

test('preparation remains unavailable without its separate private capability',()=>{
  const f=running(fixture());
  assert.throws(()=>f.message(tool(f,{action:'software-publication/prepare',args:{}})),code('PREPARATION_UNAVAILABLE'));
  assert.equal(f.calls.filter(call=>call[0]==='execute').length,0);assert.equal(f.finishes,0);
});

test('a wire notification cannot establish physical process closure',()=>{
  const f=running(fixture());
  assert.throws(()=>f.message({method:'process/closed',params:{...f.observed,close_observed:true}}),code('NOTIFICATION_UNKNOWN'));
  assert.equal(f.protocol.snapshot(f.owner).physical_close_observed,false);assert.equal(f.finishes,0);
});

test('logical terminal alone does not finish; the original private close must match the observed process',()=>{
  const f=running(fixture());
  f.message({method:'item/completed',params:{threadId:'synthetic-native',turnId:'synthetic-turn',item:{id:'final-1',type:'agentMessage',phase:'final_answer',text:'Synthetic output only.'}}});
  f.message({method:'turn/completed',params:{threadId:'synthetic-native',turn:{id:'synthetic-turn',status:'completed',error:null}}});
  assert.equal(f.protocol.snapshot(f.owner).state,'terminal');assert.equal(f.finishes,0);
  assert.throws(()=>f.close({...f.observed,pid:f.observed.pid+1,close_observed:true,exit_code:0}),code('PROCESS_CHANGED'));
  assert.equal(f.finishes,0);assert.equal(f.protocol.snapshot(f.owner).physical_close_observed,false);
});

test('a controlled matching close records once and cannot be replayed',()=>{
  const f=running(fixture());
  f.message({method:'item/completed',params:{threadId:'synthetic-native',turnId:'synthetic-turn',item:{id:'final-1',type:'agentMessage',phase:'final_answer',text:'Synthetic output only.'}}});
  f.message({method:'turn/completed',params:{threadId:'synthetic-native',turn:{id:'synthetic-turn',status:'completed',error:null}}});
  const result=f.close({...f.observed,close_observed:true,exit_code:0});
  assert.equal(result.recorded.termination_confirmed,true);assert.equal(f.finishes,1);assert.equal(f.unsubscribed,1);
  assert.throws(()=>f.close({...f.observed,close_observed:true,exit_code:0}),code('CLOSURE_REPLAY'));
  assert.equal(f.finishes,1);
});
