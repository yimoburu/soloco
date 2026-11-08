import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOutput} from '../plugins/soloco/runtime/adapters.mjs';

// Pure synthetic protocol fixtures: no discovery, process launch or provider calls.
const thread=()=>({type:'thread.started',thread_id:'thread-example'});
const turn=()=>({type:'turn.started'});
const message=(text='artifact',id='message-1')=>({type:'item.completed',item:{id,type:'agent_message',text}});
const diagnostic=(overrides={})=>({type:'item.completed',item:{id:'diagnostic-1',type:'error',message:'Generic CLI warning',...overrides}});
const complete=()=>({type:'turn.completed'});
const stream=(before=[],during=[])=>[thread(),...before,turn(),...during,message(),complete()];
const parse=events=>parseOutput('codex',events.map(event=>JSON.stringify(event)).join('\n'));
function rejects(events,pattern,retainedText) {
  assert.throws(()=>parse(events),error=>{
    assert.match(error.message,pattern);
    assert.ok(error.rejected_output);
    if(retainedText!==undefined)assert.equal(error.rejected_output.text,retainedText);
    return true;
  });
}

test('generic completed diagnostics before and during a turn preserve the accepted artifact',()=>{
  const baseline=parse(stream());
  for(const [before,during] of [
    [[diagnostic()],[]],
    [[],[diagnostic()]],
    [[diagnostic({id:'startup-warning'})],[diagnostic({id:'turn-warning'})]]
  ]) {
    const result=parse(stream(before,during));
    assert.equal(result.native_id,baseline.native_id);
    assert.equal(result.text,baseline.text);
    assert.deepEqual(result.model_evidence.cli_warnings,[...before,...during].map(event=>({type:'error',message:event.item.message})));
    assert.equal(result.model_evidence.verification,'unverified');
  }
});

test('unknown boolean, null and structured diagnostic fields reject despite valid completion',()=>{
  const extras=[
    {unknown:true},
    {unknown:false},
    {unknown:null},
    {unknown:{condition:'UNRESOLVED'}},
    {unknown:{nested:{condition:'UNRESOLVED'}}},
    {conditions:[{status:'UNRESOLVED'}]}
  ];
  for(const extra of extras)for(const beforeTurn of [true,false]) {
    const warning=diagnostic(extra);
    rejects(beforeTurn?stream([warning]):stream([],[warning]),/Invalid Codex diagnostic item/,'artifact');
  }
});

test('blank or malformed diagnostic identities and messages reject',()=>{
  const malformed=[
    ...[undefined,null,0,'',' \t '].map(id=>({id})),
    ...[undefined,null,false,7,{},[],'',' \t '].map(message=>({message}))
  ];
  for(const fields of malformed)for(const beforeTurn of [true,false]) {
    const warning=diagnostic(fields);
    rejects(beforeTurn?stream([warning]):stream([],[warning]),/Invalid Codex diagnostic item/,'artifact');
  }
});

test('completed diagnostic identities cannot replay or become message identities',()=>{
  for(const events of [
    stream([diagnostic()],[diagnostic()]),
    stream([],[diagnostic(),diagnostic()])
  ])rejects(events,/Invalid Codex diagnostic item/,'artifact');
  rejects([
    thread(),turn(),diagnostic(),message('artifact','diagnostic-1'),complete()
  ],/Completed Codex diagnostic item cannot be reused/,'artifact');
  rejects([
    thread(),turn(),diagnostic(),
    {type:'item.started',item:{id:'diagnostic-1',type:'agent_message'}},
    message('artifact','diagnostic-1'),complete()
  ],/Completed Codex diagnostic item cannot be reused/,'artifact');
  rejects([
    thread(),turn(),message('intermediate','shared'),diagnostic({id:'shared'}),message(),complete()
  ],/Invalid Codex diagnostic item/,'artifact');
});

test('post-terminal diagnostics and warnings cannot yield success',()=>{
  rejects([...stream(),diagnostic()],/Invalid Codex diagnostic item/,'artifact');
  rejects([...stream(),{type:'error',message:'Late CLI warning'}],/no completed artifact/,'artifact');
});

test('diagnostics cannot repair incomplete or failed terminal streams',()=>{
  rejects([thread(),diagnostic(),turn(),message()],/no completed artifact/,'artifact');
  rejects([thread(),diagnostic(),turn(),complete()],/no completed artifact/);
  for(const type of ['turn.failed','turn.interrupted','turn.cancelled']) {
    rejects([
      thread(),turn(),diagnostic(),message(),
      {type,error:{message:'Terminal failure'}},complete()
    ],/Codex session failed/,'artifact');
    rejects([
      thread(),turn(),message(),{type},diagnostic(),complete()
    ],/Codex session failed/,'artifact');
  }
});

test('later completion cannot replace observed negative review or qualification evidence',()=>{
  for(const field of ['review','qualification_result'])for(const verdict of ['Fail','Blocked']) {
    const negative=JSON.stringify({content:'Retained negative evidence',[field]:{verdict}});
    rejects([
      thread(),turn(),diagnostic(),message(negative,'negative'),message('artifact','later'),complete()
    ],/conflicting artifacts after observed negative evidence/,negative);
  }
});

test('Claude successful and failed terminal handling remains unchanged',()=>{
  const result=parseOutput('claude',JSON.stringify({subtype:'success',session_id:'session-example',result:'artifact'}));
  assert.equal(result.native_id,'session-example');
  assert.equal(result.text,'artifact');
  assert.equal(result.model_evidence.source,'result.modelUsage');
  assert.equal(result.model_evidence.verification,'unverified');
  for(const terminal of [
    {subtype:'success',is_error:true},
    {subtype:'error_during_execution',is_error:true},
    {subtype:'error_max_turns'}
  ]) {
    assert.throws(()=>parseOutput('claude',JSON.stringify({session_id:'session-example',result:'Provider failure',...terminal})),error=>{
      assert.match(error.message,/Claude session did not finish successfully/);
      assert.equal(error.rejected_output.native_id,'session-example');
      assert.equal(error.rejected_output.text,'Provider failure');
      return true;
    });
  }
  assert.throws(()=>parseOutput('claude',JSON.stringify({subtype:'success',result:'artifact'})),/no native session identity/);
  assert.throws(()=>parseOutput('claude',JSON.stringify({subtype:'success',session_id:'session-example',result:' \t '})),/no completed artifact/);
});
