import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {peerOriginRuntimeAction,validatePeerOriginRequest,peerOriginToolSchema} from '../plugins/soloco/runtime/peer-origin-runtime.mjs';
import {qaRawHash,qaRecordRef} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
import {legacyEncodedReplyBytes} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {SESSION,instruction,legacyFixture,preparePlan,mechanical,logicalState,relocatedOriginRuntime,disposeOriginPublicFixture} from './peer-origin-public-fixture.mjs';
import {fixture,unselectedFixture,inventory,policySourceSha256,disposeMechanicalPublicFixture} from './peer-origin-mechanical-public-fixture.mjs';

// Actual public source, original SQLite journals and complete fictional team.
// HOST metadata, attribution and execution census are explicitly SYNTHETIC.
// No native/company execution, human authenticity or real capacity is proved.
test.after(disposeMechanicalPublicFixture);
test.after(disposeOriginPublicFixture);
const code=expected=>error=>error?.code===expected;
const req=(f,action,input={},extra={})=>({root:f.root,session_id:SESSION,epoch:9,action,input,...extra});
const invoke=(request,source=peerOriginRuntimeAction)=>runWithMcpHostContext('codex',{threadId:SESSION,sessionId:SESSION},()=>source(request,'codex'));
const primary=(id,quote)=>({host:'codex',chat_id:SESSION,turn_id:'source-public-turn-'+id,message_id:'source-public-message-'+id,content_sha256:qaRawHash(quote),quote});
const choice=()=>({operation_id:'public-decision',primary_human_message:primary('A','SYNTHETIC explicit one bounded mechanical SOURCE review; no actual human consent.'),expires_at:new Date(Date.now()+3600000).toISOString(),limits:{max_attempts:1,max_native_calls:2,max_context_utf8_bytes:200000,timeout_ms:600000},model_selection:{mode:'explicit',model:'synthetic-source-model',reason:'Fictional source-only public protocol'}});
async function unchanged(f,operation,predicate){const before=logicalState(f);await assert.rejects(operation,predicate);assert.deepEqual(logicalState(f),before);}

test('closed public schemas expose distinct decision, packet, grant and original range operations',()=>{
 const actions=peerOriginToolSchema.inputSchema.properties.action.enum;
 for(const action of ['mechanical_decision','mechanical_packet','mechanical_grant','mechanical_packet_inspect','mechanical_packet_read'])assert(actions.includes(action));
 const f={root:'/fictional-nonexistent-source-root'},input=choice(),request=req(f,'mechanical_decision',input,{source_instruction:instruction});
 assert.deepEqual(validatePeerOriginRequest(request,'codex'),request);
 assert.throws(()=>validatePeerOriginRequest(req(f,'mechanical_review',{plan_id:'legacy-bare-plan'},{source_instruction:instruction}),'codex'),code('ORIGIN_PUBLIC_INPUT'));
 for(const limits of [{...input.limits,max_attempts:2},{...input.limits,max_native_calls:18},{...input.limits,max_context_utf8_bytes:200001}])assert.throws(()=>validatePeerOriginRequest({...request,input:{...input,limits}},'codex'),code('ORIGIN_PUBLIC_INPUT'));
 for(const key of ['provider','authority','capacity','native_proof','actor'])assert.throws(()=>validatePeerOriginRequest({...request,input:{...input,[key]:true}},'codex'),code('ORIGIN_PUBLIC_INPUT'));
 let observed=0;const getter={...input};Object.defineProperty(getter,'expires_at',{enumerable:true,get(){observed++;throw Error('must not execute');}});
 assert.throws(()=>validatePeerOriginRequest({...request,input:getter},'codex'));assert.equal(observed,0);
});

test('new selection actions require original root HOST before inspecting or creating storage',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-mechanical-public-empty-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const request=req({root},'mechanical_decision',choice(),{source_instruction:instruction});
 await assert.rejects(peerOriginRuntimeAction(request,'codex'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 assert.deepEqual(fs.readdirSync(root),[]);
 await assert.rejects(invoke(request),code('OWNER_EXISTING_STORAGE_REQUIRED'));assert.deepEqual(fs.readdirSync(root),[]);
});

test('actual public decision then plan then original packet then separate grant preserves old spend and launches nothing',async t=>{
 t.diagnostic('Actual source policy SHA256='+policySourceSha256+'; execution inventory is explicitly SYNTHETIC, not real cardinality proof.');
 const f=unselectedFixture(t),runtime=await f.runtime(),original=f.state(),selected=choice();
 const decision=await invoke(req(f,'mechanical_decision',selected,{source_instruction:instruction}),runtime.peerOriginRuntimeAction);
 assert.equal(decision.authority_issued,false);assert.equal(decision.human_producer_authenticity,'not mechanically established');
 const planned=await invoke(req(f,'plan',{...f.input,mechanical_qa:{protocol:'peer-origin-mechanical-qa-purpose-v1',purpose:'quarantine-transition-review-only',decision_ref:decision.decision_ref}},{source_instruction:instruction}),runtime.peerOriginRuntimeAction);
 const plan_ref=qaRecordRef(f.state().records[planned.plan_id]);
 const packet=await invoke(req(f,'mechanical_packet',{operation_id:'public-packet',plan_ref},{source_instruction:instruction}),runtime.peerOriginRuntimeAction);
 assert.equal(packet.authority_issued,false);assert(packet.context_utf8_bytes<200000);assert.equal(packet.context,undefined);
 const handle=await invoke(req(f,'mechanical_packet_inspect',{packet_ref:packet.packet_ref}),runtime.peerOriginRuntimeAction);
 assert.equal(handle.historical_original,true);assert.equal(handle.execution_authority,false);assert.equal(handle.current_eligibility,'not asserted');
 let body='',offset=0;
 while(offset<handle.characters){const part=await invoke(req(f,'mechanical_packet_read',{packet_ref:packet.packet_ref,sha256:handle.context_sha256,offset,length:4096}),runtime.peerOriginRuntimeAction);assert(legacyEncodedReplyBytes(part)<=24576);assert.equal(Buffer.from(part.text).toString('utf8'),part.text);body+=part.text;offset+=part.length;assert.equal(part.next_offset,part.complete?null:offset);}
 assert.equal(qaRawHash(body),packet.context_sha256);assert.equal(Buffer.byteLength(body),packet.context_utf8_bytes);
 const grant=await invoke(req(f,'mechanical_grant',{operation_id:'public-grant',packet_ref:packet.packet_ref,primary_human_message:primary('B','SYNTHETIC exact source packet '+packet.context_sha256),expires_at:new Date(packet.deadline_at_ms).toISOString()},{source_instruction:instruction}),runtime.peerOriginRuntimeAction);
 const state=f.state();assert.equal(state.records[grant.grant_ref.id].origin_mechanical_qa.used_attempts,0);assert.deepEqual(state.jobs,original.jobs);assert.deepEqual(state.sessions,original.sessions);assert.deepEqual(state.original_grant,original.original_grant);assert.deepEqual(state.notices,original.notices);assert.equal(state.paused,true);
});

test('wrong primary quote and owner epoch reject before policy or grant changes',async t=>{
 const f=unselectedFixture(t),runtime=await f.runtime(),input=choice();
 await unchanged(f,()=>invoke(req(f,'mechanical_decision',{...input,primary_human_message:{...input.primary_human_message,quote:'Changed quote with original SHA'}},{source_instruction:instruction}),runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_QA_PRIMARY_REQUIRED'));
 await unchanged(f,()=>invoke(req(f,'mechanical_decision',input,{epoch:8,source_instruction:instruction}),runtime.peerOriginRuntimeAction));
 assert.equal(Object.keys(f.state().records).length,1);
});

test('original packet reads retain historical DATA after a new business row without asserting eligibility',async t=>{
 const f=fixture(t,{},f=>{f.input.maintenance.source_instruction='Complete fictional maintenance 😀 漢字 \\"';}),runtime=await f.runtime();
 const original=f.state().records[f.packet.packet_ref.id].origin_mechanical_qa.context;
 f.write('SOURCE.new_business_claim',s=>{s.records.new_claim={id:'new_claim',kind:'artifact',status:'Draft',revision:1,content:'New claim must remain outside old context eligibility.'};return s;});
 const before=logicalState(f),handle=await invoke(req(f,'mechanical_packet_inspect',{packet_ref:f.packet.packet_ref}),runtime.peerOriginRuntimeAction);
 assert.equal(handle.current_eligibility,'not asserted');assert.equal(handle.execution_authority,false);
 let body='',offset=0;
 while(offset<handle.characters){const part=await invoke(req(f,'mechanical_packet_read',{packet_ref:f.packet.packet_ref,sha256:handle.context_sha256,offset,length:4096}),runtime.peerOriginRuntimeAction);body+=part.text;offset+=part.length;}
 assert.equal(body,original.text);assert.deepEqual(logicalState(f),before);
 await unchanged(f,()=>invoke(req(f,'mechanical_packet_read',{packet_ref:f.packet.packet_ref,sha256:'0'.repeat(64),offset:0,length:4096}),runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_QA_RANGE'));
 const split=body.indexOf('😀')+1;assert(split>0);await unchanged(f,()=>invoke(req(f,'mechanical_packet_read',{packet_ref:f.packet.packet_ref,sha256:handle.context_sha256,offset:split,length:3}),runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_QA_RANGE'));
});

test('missing actual inventory and UNKNOWN synthetic census both Hold public review before queue or spend',async t=>{
 const f=fixture(t),runtime=await f.runtime(),request=req(f,'mechanical_review',{plan_id:f.plan_id,grant_ref:f.grant_ref},{source_instruction:instruction});
 await unchanged(f,()=>invoke(request),code('ORIGIN_MECHANICAL_QA_EXECUTION_INVENTORY_SOURCE_REQUIRED'));
 inventory.setSyntheticCardinality(false);
 try{await unchanged(f,()=>invoke(request,runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN'));}finally{inventory.setSyntheticCardinality(true);}
 assert.equal(f.state().records[f.grant_ref.id].origin_mechanical_qa.used_attempts,0);
});

test('old bare plan and historical-shaped QA cannot replace new selected purpose at public apply',async t=>{
 const f=legacyFixture(t),planned=preparePlan(f),review_ids=mechanical(f,planned),runtime=await relocatedOriginRuntime();
 for(const action of ['mechanical_preflight','quarantine'])await unchanged(f,()=>invoke(req(f,action,{plan_id:planned.plan_id,review_ids},{source_instruction:instruction}),runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_QA_PURPOSE_REQUIRED'));
});
