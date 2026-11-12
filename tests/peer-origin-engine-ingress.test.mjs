import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as main from '../plugins/soloco/runtime/main.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {SESSION,OTHER,instruction,legacyFixture,logicalState,disposeOriginPublicFixture} from './peer-origin-public-fixture.mjs';

// Actual public handlers, managed hook producer and disposable SQLite. HOST
// metadata and instructions are SYNTHETIC; no native/model/company action.
test.after(disposeOriginPublicFixture);
const req=(f,more={})=>({root:f.root,session_id:SESSION,epoch:9,action:'status',input:{},...more});
const invoke=(args,metadata={threadId:args.session_id,sessionId:args.session_id})=>runWithMcpHostContext('codex',metadata,()=>main.call('company_origin',args,'codex'));
const code=expected=>error=>error?.code===expected;
function hookData(t){
 const prior=process.env.COMPANY_PLUGIN_DATA,directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-managed-hook-')));
 process.env.COMPANY_PLUGIN_DATA=directory;
 t.after(()=>{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;fs.rmSync(directory,{recursive:true,force:true});});return directory;
}
const hook=f=>main.hook({cwd:f.root,session_id:SESSION,hook_event_name:'SessionStart'},'codex');

test('actual tool inventory registers exactly one closed original origin schema',()=>{
 const tools=main.toolList.filter(tool=>tool.name==='company_origin');assert.equal(tools.length,1);
 assert.equal(tools[0].inputSchema.additionalProperties,false);
 assert.deepEqual(tools[0].inputSchema.required,['root','session_id','epoch','action']);
 assert.equal(tools[0].inputSchema.properties.input.additionalProperties,false);
});
test('actual public origin ingress rejects missing or descendant HOST metadata before storage exists',async()=>{
 const args=req({root:'/fictional-absent-origin-ingress'});
 await assert.rejects(main.call('company_origin',args,'codex'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 await assert.rejects(invoke(args,{threadId:OTHER,sessionId:SESSION}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 await assert.rejects(invoke({...args,actor:{native_id:SESSION}}),/Unknown argument/);
 await assert.rejects(invoke({...args,input:{ready:true}}),code('ORIGIN_PUBLIC_INPUT'));
});
test('actual managed-hook gate precedes legacy storage access and its producer enables read-only status',async t=>{
 hookData(t);const f=legacyFixture(t),before=logicalState(f);
 await assert.rejects(invoke(req(f)),code('PEER_CURRENT_HOOK_REQUIRED'));
 assert.deepEqual(logicalState(f),before);hook(f);const afterHook=logicalState(f);
 const status=await invoke(req(f));assert.equal(status.storage_layout,4);assert.equal(status.owner.epoch,9);assert.equal(status.paused,true);
 assert.deepEqual(logicalState(f),afterHook);
});
test('current managed hook cannot replace owner identity or the original epoch',async t=>{
 hookData(t);const f=legacyFixture(t);hook(f);const before=logicalState(f);
 await assert.rejects(invoke(req(f,{epoch:8})));
 assert.deepEqual(logicalState(f),before);
 main.hook({cwd:f.root,session_id:OTHER,hook_event_name:'SessionStart'},'codex');
 const afterHook=logicalState(f);
 await assert.rejects(invoke(req(f,{session_id:OTHER})));
 assert.deepEqual(logicalState(f),afterHook);
});
test('public checked-epoch writer retains the undeployed original sidecar producer Hold without writes',async t=>{
 hookData(t);const f=legacyFixture(t);hook(f);const before=logicalState(f);
 await assert.rejects(invoke(req(f,{action:'plan',source_instruction:instruction,input:f.input})),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
 assert.deepEqual(logicalState(f),before);
});
