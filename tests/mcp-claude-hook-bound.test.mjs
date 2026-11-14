// SOURCE fixtures only. The hook-bound tier is a WEAKER, read-only Claude tier.
// It is not host-observed identity, native qualification or permission.
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runWithMcpHostContext,mcpCallerDiagnostic,requireCodexRootActor,requireClaudeHookBoundActor} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {bind,peerCallerActor,PEER_HOOK_BOUND_READ_ACTIONS,peers} from '../plugins/soloco/runtime/engine.mjs';

const ID='123e4567-e89b-12d3-a456-426614174000';
const sel=(id=ID,host='claude')=>({host,session_id:id});
const CODE='MCP_CLAUDE_HOOK_BOUND_CALLER_REQUIRED';
const held=fn=>assert.throws(fn,e=>e.code===CODE&&!e.message.includes(ID));

test('no active invocation scope yields no hook-bound actor',()=>{
 held(()=>requireClaudeHookBoundActor(sel()));
});

test('an active Claude invocation with a matching selector yields a frozen weak actor with no native id',async()=>{
 await runWithMcpHostContext('claude',{progressToken:1},()=>{
  const a=requireClaudeHookBoundActor(sel());
  assert.deepEqual(a,{host:'claude',session_id:ID,native_id:null,tier:'HOOK_BOUND'});
  assert(Object.isFrozen(a));
  const d=mcpCallerDiagnostic(sel());
  assert.equal(d.hook_bound_tier_eligible,true);assert.equal(d.identity_basis,'LEGACY_UNQUALIFIED');
  assert.equal(d.root,false);assert.equal(d.authority_granted,false);assert.equal(d.native_qualification,false);
 });
});

test('host mismatch, malformed or missing selectors are held',async()=>{
 await runWithMcpHostContext('claude',{},()=>{
  for(const i of [sel(ID,'codex'),sel(ID,'Claude'),sel('nope'),sel(' '+ID),{},undefined,{host:'claude'},{session_id:ID}])held(()=>requireClaudeHookBoundActor(i));
 });
 await runWithMcpHostContext('codex',{threadId:ID,sessionId:ID},()=>held(()=>requireClaudeHookBoundActor(sel())));
});

test('the weak tier never satisfies the Codex root requirement',async()=>{
 await runWithMcpHostContext('claude',{threadId:ID,sessionId:ID},()=>{
  assert.throws(()=>requireCodexRootActor(sel()),e=>e.code==='MCP_CODEX_ROOT_CALLER_REQUIRED');
 });
});

test('the context expires after the invocation',async()=>{
 await runWithMcpHostContext('claude',{},()=>{});
 held(()=>requireClaudeHookBoundActor(sel()));
});

test('peerCallerActor admits the weak tier only when explicitly requested',async()=>{
 await runWithMcpHostContext('claude',{},()=>{
  assert.throws(()=>peerCallerActor({root:'/x',session_id:ID},'claude'),e=>e.code==='MCP_CODEX_ROOT_CALLER_REQUIRED');
 });
});

test('only read actions are eligible; mutating peer actions stay Codex-root only',async()=>{
 assert.deepEqual([...PEER_HOOK_BOUND_READ_ACTIONS],['status','inspect','read']);
 for(const action of ['start','stop','tick','stage','assign','grant_create','grant_revoke','enroll',undefined,'__proto__'])
  await runWithMcpHostContext('claude',{},async()=>{
   await assert.rejects(Promise.resolve().then(()=>peers({root:'/x',session_id:ID,epoch:1,action},'claude')),e=>e.code==='MCP_CODEX_ROOT_CALLER_REQUIRED');
  });
});

function realHook(t,host='claude'){
 const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-claude-hook-bound-')));
 const root=path.join(tmp,'attached'),data=path.join(tmp,'plugin-data');fs.mkdirSync(root);fs.mkdirSync(data);
 const prev=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
 t.after(()=>{if(prev===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prev;fs.rmSync(tmp,{recursive:true,force:true});});
 bind(root,ID,host);return root;
}

test('a real current Claude hook record plus an active Claude invocation admits the weak actor',async t=>{
 const root=realHook(t);
 const actor=await runWithMcpHostContext('claude',{},()=>peerCallerActor({root,session_id:ID},'claude',{hookBound:true}));
 assert.deepEqual(actor,{host:'claude',session_id:ID,native_id:null,tier:'HOOK_BOUND'});
 // Without the opt-in the same record still never yields a root actor.
 await runWithMcpHostContext('claude',{},()=>assert.throws(()=>peerCallerActor({root,session_id:ID},'claude'),e=>e.code==='MCP_CODEX_ROOT_CALLER_REQUIRED'));
});

test('a hook record for another session or without an invocation scope is held',async t=>{
 const root=realHook(t),OTHER='018f22aa-bb1c-7def-8123-123456789abc';
 await runWithMcpHostContext('claude',{},()=>assert.throws(()=>peerCallerActor({root,session_id:OTHER},'claude',{hookBound:true}),e=>e.code==='PEER_CURRENT_HOOK_REQUIRED'));
 assert.throws(()=>peerCallerActor({root,session_id:ID},'claude',{hookBound:true}),e=>e.code===CODE);
});

test('host-supplied identity metadata naming another session refuses the weak tier',async()=>{
 const OTHER='018f22aa-bb1c-7def-8123-123456789abc';
 await runWithMcpHostContext('claude',{threadId:OTHER,sessionId:OTHER},()=>held(()=>requireClaudeHookBoundActor(sel())));
 await runWithMcpHostContext('claude',{threadId:ID,sessionId:ID},()=>assert.equal(requireClaudeHookBoundActor(sel()).session_id,ID));
});
