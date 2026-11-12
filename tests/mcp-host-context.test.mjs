// SOURCE fixtures only. Synthetic HOST metadata proves context plumbing and
// predicates; it is not installed Codex provenance, native QA or permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithMcpHostContext,mcpCallerDiagnostic,requireCodexRootActor} from '../plugins/soloco/runtime/mcp-host-context.mjs';

const ROOT='123e4567-e89b-12d3-a456-426614174000';
const CHILD='123e4567-e89b-42d3-8456-426614174001';
const OTHER='018f22aa-bb1c-7def-8123-123456789abc';
const CODE='MCP_CODEX_ROOT_CALLER_REQUIRED';
const MESSAGE=CODE+': A supported Codex root HOST caller matching the session selector is required.';
const choose=(id=ROOT,host='codex')=>({host,session_id:id});
const meta=(id=ROOT)=>({threadId:id,sessionId:id});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function held(invoke){
 assert.throws(invoke,error=>{
  assert.equal(error.code,CODE);assert.equal(error.message,MESSAGE);
  for(const secret of [ROOT,CHILD,OTHER])assert.equal(error.message.includes(secret),false);
  return true;
 });
}
function diagnostic(input=choose()){
 const value=mcpCallerDiagnostic(input),encoded=JSON.stringify(value);
 assert(Object.isFrozen(value));assert(Buffer.byteLength(encoded)<1024);
 for(const secret of [ROOT,CHILD,OTHER,ROOT.toUpperCase()])assert.equal(encoded.includes(secret),false);
 for(const field of ['threadId','sessionId','native_id','session_id','context','handle','actor'])assert.equal(Object.hasOwn(value,field),false);
 assert.equal(value.authority_granted,false);assert.equal(value.native_qualification,false);
 return value;
}

test('absence of a private request remains legacy unqualified despite selector or diagnostic-shaped DATA',()=>{
 const value=diagnostic();assert.equal(value.identity_basis,'LEGACY_UNQUALIFIED');assert.equal(value.context_active,false);assert.equal(value.observed,false);assert.equal(value.root,false);
 held(()=>requireCodexRootActor(choose()));
 held(()=>requireCodexRootActor({...choose(),threadId:ROOT,sessionId:ROOT,native_id:ROOT,identity_basis:'CODEX_HOST_META_OBSERVED',root:true,observed:true,context:meta(),diagnostic:{...value,root:true,observed:true}}));
});

for(const id of [ROOT,CHILD,OTHER,ROOT.toUpperCase()])test('a source root request accepts the exact generic UUID form '+id.slice(14,18),async()=>{
 const result=await runWithMcpHostContext('codex',meta(id),async()=>{
  await Promise.resolve();const actor=requireCodexRootActor(choose(id));
  assert.deepEqual(actor,{host:'codex',session_id:id,native_id:id});assert.deepEqual(Object.keys(actor).sort(),['host','native_id','session_id']);assert(Object.isFrozen(actor));
  assert.throws(()=>{actor.native_id=OTHER;},TypeError);
  const value=diagnostic(choose(id));assert.equal(value.identity_basis,'CODEX_HOST_META_OBSERVED');assert.equal(value.context_active,true);assert.equal(value.host_supported,true);assert.equal(value.host_matches,true);assert.equal(value.metadata_object,true);assert.equal(value.identity_fields_data,true);assert.equal(value.observed,true);assert.equal(value.root,true);assert.equal(value.selector_matches,true);
  return 42;
 });
 assert.equal(result,42);assert.equal(diagnostic().context_active,false);held(()=>requireCodexRootActor(choose(id)));
});

test('a descendant is held even when its session and selector both name the root',async()=>{
 await runWithMcpHostContext('codex',{threadId:CHILD,sessionId:ROOT},()=>{
  const value=diagnostic();assert.equal(value.observed,true);assert.equal(value.root,false);assert.equal(value.selector_matches,true);
  held(()=>requireCodexRootActor(choose()));held(()=>requireCodexRootActor(choose(CHILD)));
 });
});

test('selector and host mismatches never normalize, infer or override HOST identity',async()=>{
 await runWithMcpHostContext('codex',meta(),()=>{
  for(const input of [choose(OTHER),choose(ROOT,'claude'),choose(ROOT,'Codex'),{},undefined,{host:'codex'}, {session_id:ROOT},{host:'codex',session_id:' '+ROOT},choose(ROOT.toUpperCase())])held(()=>requireCodexRootActor(input));
  const actor=requireCodexRootActor({...choose(),native_id:OTHER,threadId:OTHER,sessionId:OTHER,root:false});assert.equal(actor.native_id,ROOT);
 });
 await runWithMcpHostContext('codex',{threadId:ROOT.toUpperCase(),sessionId:ROOT},()=>{assert.equal(diagnostic().root,false);held(()=>requireCodexRootActor(choose()));});
});

test('missing and nonobject HOST metadata preserves legacy callback execution but cannot produce an actor',async()=>{
 let calls=0;
 for(const value of [undefined,null,[],[ROOT],'text',7,true,false])await runWithMcpHostContext('codex',value,()=>{
  calls++;const observed=diagnostic();assert.equal(observed.context_active,true);assert.equal(observed.identity_basis,'LEGACY_UNQUALIFIED');assert.equal(observed.metadata_object,false);assert.equal(observed.observed,false);held(()=>requireCodexRootActor(choose()));
 });
 assert.equal(calls,8);
});

test('missing, malformed and non-DATA identity fields fail with the same non-echoing Hold',async()=>{
 const hidden={};Object.defineProperties(hidden,{threadId:{value:ROOT},sessionId:{value:ROOT}});
 const inherited=Object.create(meta());
 for(const value of [{},{threadId:ROOT},{sessionId:ROOT},{threadId:ROOT,sessionId:7},{threadId:ROOT,sessionId:null},{threadId:'not-a-uuid',sessionId:ROOT},{threadId:ROOT+' ',sessionId:ROOT},{threadId:ROOT.replaceAll('-',''),sessionId:ROOT},hidden,inherited])await runWithMcpHostContext('codex',value,()=>{
  assert.equal(diagnostic().identity_basis,'LEGACY_UNQUALIFIED');held(()=>requireCodexRootActor(choose()));
 });
});

test('unsupported source hosts never become Codex through matching selectors or flags',async()=>{
 for(const host of ['claude','unknown',undefined,{},'Codex'])await runWithMcpHostContext(host,meta(),()=>{
  assert.equal(diagnostic().identity_basis,'LEGACY_UNQUALIFIED');assert.equal(diagnostic().root,false);held(()=>requireCodexRootActor(choose()));
 });
});

test('identity accessors and Proxy metadata are rejected without running getters or traps',async()=>{
 let observed=0;const value={sessionId:ROOT};Object.defineProperty(value,'threadId',{enumerable:true,get(){observed++;return ROOT;}});
 const proxy=new Proxy(meta(),{get(){observed++;throw Error('No property read');},getPrototypeOf(){observed++;throw Error('No prototype read');},getOwnPropertyDescriptor(){observed++;throw Error('No descriptor read');}});
 for(const raw of [value,proxy])await runWithMcpHostContext('codex',raw,()=>{assert.equal(diagnostic().identity_basis,'LEGACY_UNQUALIFIED');held(()=>requireCodexRootActor(choose()));});
 assert.equal(observed,0);
});

test('unrelated HOST metadata and argument accessors are ignored without being invoked',async()=>{
 let observed=0;const raw=meta();Object.defineProperty(raw,'unrelated',{enumerable:true,get(){observed++;throw Error('Unrelated metadata must be ignored');}});
 const input=choose();Object.defineProperty(input,'unrelated',{enumerable:true,get(){observed++;throw Error('Unrelated arguments must be ignored');}});
 await runWithMcpHostContext('codex',raw,()=>{assert.equal(requireCodexRootActor(input).native_id,ROOT);diagnostic(input);});
 assert.equal(observed,0);
});

test('selector identity accessors and Proxy objects cannot run or select a private actor',async()=>{
 let observed=0;const input={host:'codex'};Object.defineProperty(input,'session_id',{enumerable:true,get(){observed++;return ROOT;}});
 const proxy=new Proxy(choose(),{getPrototypeOf(){observed++;throw Error('No selector prototype read');},getOwnPropertyDescriptor(){observed++;throw Error('No selector descriptor read');}});
 await runWithMcpHostContext('codex',meta(),()=>{for(const selected of [input,proxy]){held(()=>requireCodexRootActor(selected));assert.equal(diagnostic(selected).selector_observed,false);}});
 assert.equal(observed,0);
});

test('capture snapshots exact primitive fields without mutating or later rereading the HOST object',async()=>{
 const raw=meta();await runWithMcpHostContext('codex',raw,async()=>{
  assert.equal(Object.isFrozen(raw),false);raw.threadId=OTHER;raw.sessionId=OTHER;await Promise.resolve();
  assert.deepEqual(requireCodexRootActor(choose()),{host:'codex',session_id:ROOT,native_id:ROOT});held(()=>requireCodexRootActor(choose(OTHER)));
 });
 const plain=Object.assign(Object.create(null),meta());await runWithMcpHostContext('codex',plain,()=>assert.equal(requireCodexRootActor(choose()).native_id,ROOT));
});

test('concurrent source requests retain their own context across interleaved awaits',async()=>{
 const first=deferred(),second=deferred(),release=deferred();
 const a=runWithMcpHostContext('codex',meta(ROOT),async()=>{first.resolve();await second.promise;assert.equal(requireCodexRootActor(choose(ROOT)).native_id,ROOT);held(()=>requireCodexRootActor(choose(OTHER)));await release.promise;return requireCodexRootActor(choose(ROOT));});
 const b=runWithMcpHostContext('codex',meta(OTHER),async()=>{await first.promise;second.resolve();await Promise.resolve();assert.equal(requireCodexRootActor(choose(OTHER)).native_id,OTHER);held(()=>requireCodexRootActor(choose(ROOT)));release.resolve();return requireCodexRootActor(choose(OTHER));});
 const [left,right]=await Promise.all([a,b]);assert.equal(left.native_id,ROOT);assert.equal(right.native_id,OTHER);held(()=>requireCodexRootActor(choose()));
});

test('nested requests restore the outer context while expired inner async descendants stay revoked',async()=>{
 const release=deferred();let late;
 await runWithMcpHostContext('codex',meta(ROOT),async()=>{
  await runWithMcpHostContext('codex',meta(OTHER),async()=>{
   assert.equal(requireCodexRootActor(choose(OTHER)).native_id,OTHER);
   late=(async()=>{await release.promise;assert.equal(diagnostic(choose(OTHER)).context_active,false);held(()=>requireCodexRootActor(choose(OTHER)));held(()=>requireCodexRootActor(choose(ROOT)));})();
  });
  assert.equal(requireCodexRootActor(choose(ROOT)).native_id,ROOT);
  await runWithMcpHostContext('codex',undefined,()=>held(()=>requireCodexRootActor(choose(ROOT))));
  assert.equal(requireCodexRootActor(choose(ROOT)).native_id,ROOT);release.resolve();await late;
  assert.equal(requireCodexRootActor(choose(ROOT)).native_id,ROOT);
 });
});

test('a detached continuation cannot use a formerly valid context after the awaited invocation returns',async()=>{
 const release=deferred();let late;
 await runWithMcpHostContext('codex',meta(),async()=>{
  late=(async()=>{await release.promise;const value=diagnostic();assert.equal(value.context_active,false);assert.equal(value.identity_basis,'LEGACY_UNQUALIFIED');held(()=>requireCodexRootActor(choose()));})();
 });
 release.resolve();await late;held(()=>requireCodexRootActor(choose()));
});

test('invocation rejection revokes only its own context and preserves the original error',async()=>{
 const error=Object.assign(Error('Synthetic source failure'),{code:'SYNTHETIC_SOURCE_ERROR'}),release=deferred();let late;
 await assert.rejects(runWithMcpHostContext('codex',meta(),async()=>{
  late=(async()=>{await release.promise;held(()=>requireCodexRootActor(choose()));})();await Promise.resolve();throw error;
 }),value=>value===error);
 release.resolve();await late;assert.equal(diagnostic().context_active,false);
 await runWithMcpHostContext('codex',meta(OTHER),()=>assert.equal(requireCodexRootActor(choose(OTHER)).native_id,OTHER));
});

test('a nested rejection leaves the outer source invocation active until its own completion',async()=>{
 await runWithMcpHostContext('codex',meta(ROOT),async()=>{
  const error=Error('Synthetic inner failure');await assert.rejects(runWithMcpHostContext('codex',meta(OTHER),()=>{throw error;}),value=>value===error);
  assert.equal(requireCodexRootActor(choose(ROOT)).native_id,ROOT);
 });
 assert.equal(diagnostic().context_active,false);
});

test('the source entry requires a real callback rather than JSON or a callable Proxy',async()=>{
 let observed=0;const proxy=new Proxy(()=>{observed++;},{apply(){observed++;}});
 for(const invoke of [undefined,{},'invoke',proxy])await assert.rejects(runWithMcpHostContext('codex',meta(),invoke),error=>error.code==='MCP_HOST_CONTEXT_CALLBACK_REQUIRED');
 assert.equal(observed,0);assert.equal(diagnostic().context_active,false);
});
