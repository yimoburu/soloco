// Pure original-input boundaries only: no storage, Native or model operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {recordPeerOriginMechanicalQaDecisionFrom,grantPeerOriginMechanicalQaPacketFrom} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs';
import {qaRawHash} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
const actor={host:'codex',session_id:'synthetic-source-root',native_id:'synthetic-source-root'};
const quote='SYNTHETIC pure input validation; no actual consent or execution.';
const common={operation_id:'source-input-boundary',source_instruction:quote,primary_human_message:{host:'codex',chat_id:actor.session_id,turn_id:'source-turn',message_id:'source-message',content_sha256:qaRawHash(quote),quote}};
const choices=[
 ['decision',recordPeerOriginMechanicalQaDecisionFrom,{...common,limits:{max_attempts:1,max_native_calls:1,max_context_utf8_bytes:200000,timeout_ms:1000},model_selection:{mode:'explicit',model:'source-fixture',reason:'SOURCE only'}}],
 ['grant',grantPeerOriginMechanicalQaPacketFrom,{...common,packet_ref:{id:'source-packet',revision:1,sha256:'a'.repeat(64)}}]
];
for(const [name,invoke,input]of choices)test(name+' expiry requires primitive DATA before any coercion or storage access',()=>{
 let observed=0,storage=0;
 const coercive={};Object.defineProperty(coercive,Symbol.toPrimitive,{get(){observed++;return ()=>{observed++;return new Date(Date.now()+60000).toISOString();};}});
 const proxy=new Proxy({},{get(){observed++;throw Error('Proxy must not run');}});
 const store={transaction(){storage++;throw Error('Storage must not be accessed for invalid input');}};
 for(const value of [coercive,proxy,new Date(),new String('future'),null,undefined,123,Symbol('expiry')])assert.throws(()=>invoke(store,actor,1,{...input,expires_at:value}),error=>error?.code==='ORIGIN_MECHANICAL_QA_EXPIRED');
 assert.equal(observed,0);assert.equal(storage,0);
 const sentinel=new AggregateError([Error('original source provider child')],'original source provider');
 assert.throws(()=>invoke({transaction(){storage++;throw sentinel;}},actor,1,{...input,expires_at:new Date(Date.now()+60000).toISOString()}),error=>error===sentinel);
 assert.equal(storage,1,'Valid primitive input reaches the original transaction without replacing its exception');
});
