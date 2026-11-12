import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ownerGateFixture,disposeOwnerGateFixture,core} from './peer-owner-operating-gate-fixture.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import * as main from '../plugins/soloco/runtime/main.mjs';

// Actual public source handlers + actual hook + disposable real SQLite.
// HOST metadata, founder instruction and native support are SYNTHETIC fixtures.
// No live company or native/provider call occurs.
test.after(disposeOwnerGateFixture);
const previousCache=process.env.COMPANY_PLUGIN_DATA,cache=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-pending-stop-hooks-')));
process.env.COMPANY_PLUGIN_DATA=cache;
test.after(()=>{if(previousCache===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previousCache;fs.rmSync(cache,{recursive:true,force:true});});
const OUT='11111111-1111-4111-8111-111111111111',IN='22222222-2222-4222-8222-222222222222';
const actor=session_id=>({host:'codex',session_id,native_id:session_id});
const source='SYNTHETIC founder stop-path fixture only.';
const invoke=(name,args)=>runWithMcpHostContext('codex',{threadId:IN,sessionId:IN},()=>main.call(name,args,'codex'));
test('a genuine pending founder retains a supported authenticated public pause boundary',async t=>{
 const f=ownerGateFixture(t);f.root=fs.realpathSync(f.root);
 const p=f.get('principals','founder');f.seed('principals','founder',{...p.value,host:'codex',native_id:OUT,legacy_owner:{host:'codex',session_id:OUT,epoch:7}});
 const outgoing=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:actor(OUT)}),incoming=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:actor(IN)});
 outgoing.pause({operation_id:f.op(),epoch:7,source_instruction:source});
 const quote='SYNTHETIC primary founder approves this exact fictional target-bound transfer within its existing independent reviewer, grant and expiry.';
 const decision=outgoing.recordTransferDecision({operation_id:f.op(),epoch:7,source_instruction:source,basis:'explicit',target:actor(IN),reviewer_principal_id:'reviewer',review_grant_id:'owner-review-grant',review_grant_generation:1,max_review_calls:2,expires_at:new Date(Date.now()+1800000).toISOString(),primary_human_message:{host:'codex',chat_id:OUT,turn_id:OUT,message_id:IN,content_sha256:createHash('sha256').update(quote).digest('hex'),quote}});
 const intent=outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:source,decision_ref:decision.decision_ref});
 incoming.beginFromIntent({operation_id:f.op(),epoch:7,source_instruction:source,intent_ref:intent.intent_ref});
 assert.equal(f.get('principals','founder').value.status,'pending');
 main.hook({cwd:f.root,session_id:IN,hook_event_name:'SessionStart'},'codex');
 const status=await invoke('company_owner',{root:f.root,session_id:IN,action:'status',epoch:8,input:{}});
 assert.equal(status.caller_relation,'owner');assert.equal(status.custody.status,'pending');
 const before=f.get('control','company').value.pause_generation,attempts=[];
 try{await invoke('company_owner',{root:f.root,session_id:IN,action:'pause',epoch:8,source_instruction:source,input:{operation_id:f.op()}});attempts.push({route:'company_owner',returned:true});}catch(e){attempts.push({route:'company_owner',code:e.code,message:e.message});}
 if(f.get('control','company').value.pause_generation===before){
  try{await invoke('company_control',{root:f.root,session_id:IN,action:'pause',expected_epoch:8,source_instruction:source});attempts.push({route:'company_control',returned:true});}catch(e){attempts.push({route:'company_control',code:e.code,message:e.message});}
 }
 if(f.get('control','company').value.pause_generation===before){
  const hint=main.hook({cwd:f.root,session_id:IN,hook_event_name:'UserPromptSubmit',prompt:'pause'},'codex');
  attempts.push({route:'hook',context:JSON.parse(hint.hookSpecificOutput.additionalContext)});
 }
 console.log('ACTUAL_PUBLIC_STOP '+JSON.stringify({before,after:f.get('control','company').value.pause_generation,attempts}));
 assert(f.get('control','company').value.pause_generation>before,'At least one supported actual public stop route must establish a NEW pause boundary for the pending founder');
 assert.equal(f.get('principals','founder').value.status,'pending','Pause cannot activate ordinary ownership');
 assert.equal(f.get('control','company').value.paused,true);
});

function pendingFounder(t,{uncertain=false}={}){
 const f=ownerGateFixture(t);f.root=fs.realpathSync(f.root);
 const p=f.get('principals','founder');f.seed('principals','founder',{...p.value,host:'codex',native_id:OUT,legacy_owner:{host:'codex',session_id:OUT,epoch:7}});
 if(uncertain){f.seed('slots','SYNTHETIC-old-unknown',{status:'unknown',termination_confirmed:false,used_calls:3});f.seed('effects','SYNTHETIC-old-unknown',{status:'unknown',termination_confirmed:false,used_calls:3});f.seed('control','usage',{model_calls:1});}
 const outgoing=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:actor(OUT)}),incoming=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:actor(IN)});
 outgoing.pause({operation_id:f.op(),epoch:7,source_instruction:source});
 const quote='SYNTHETIC primary instruction approves only this fictional target-bound transfer with original limits.';
 const decision=outgoing.recordTransferDecision({operation_id:f.op(),epoch:7,source_instruction:source,basis:'explicit',target:actor(IN),reviewer_principal_id:'reviewer',review_grant_id:'owner-review-grant',review_grant_generation:1,max_review_calls:2,expires_at:new Date(Date.now()+1800000).toISOString(),primary_human_message:{host:'codex',chat_id:OUT,turn_id:OUT,message_id:IN,content_sha256:createHash('sha256').update(quote).digest('hex'),quote}});
 const intent=outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:source,decision_ref:decision.decision_ref});
 const begun=incoming.beginFromIntent({operation_id:f.op(),epoch:7,source_instruction:source,intent_ref:intent.intent_ref});
 return {f,incoming,outgoing,begun};
}
function sqlState(f){
 const db=f.ledger.db,schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 return JSON.stringify({schema,tables:schema.filter(r=>r.type==='table').map(({name})=>({name,rows:db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all()}))});
}
const hook=(f,who=IN)=>main.hook({cwd:f.root,session_id:who,hook_event_name:'SessionStart'},'codex');
const request=(f,input={operation_id:f.op()},who=IN,epoch=8)=>({root:f.root,session_id:who,action:'pause',epoch,source_instruction:source,input});
const call=(args,who=args.session_id)=>runWithMcpHostContext('codex',{threadId:who,sessionId:who},()=>main.call('company_owner',args,'codex'));

test('pending STOP creates each new pause barrier without changing custody, allowance, UNKNOWN or subject overrides',async t=>{
 const {f,incoming,begun}=pendingFounder(t,{uncertain:true});hook(f);
 const c=f.get('control','company'),p=f.get('principals','founder'),h=f.get('work_items',begun.handover_id),grant=f.get('grants','owner-review-grant'),usage=f.get('control','usage'),slot=f.get('slots','SYNTHETIC-old-unknown'),effect=f.get('effects','SYNTHETIC-old-unknown');
 const input={operation_id:f.op()},args=request(f,input),result=await call(args);
 assert.deepEqual(f.get('control','company').value,{...c.value,paused:true,pause_generation:c.value.pause_generation+1});
 for(const [family,id,before]of [['principals','founder',p],['work_items',h.id,h],['grants','owner-review-grant',grant],['control','usage',usage],['slots','SYNTHETIC-old-unknown',slot],['effects','SYNTHETIC-old-unknown',effect]])assert.deepEqual(f.get(family,id),before);
 assert.equal(result.physical_closure,'UNKNOWN');assert.equal(incoming.inspect({epoch:8}).held,'OWNER_SUBJECT_CHANGED');
 const after=sqlState(f);assert.deepEqual(await call(args),result);assert.equal(sqlState(f),after,'Exact replay adds no new barrier or spend');
 await call(request(f));assert.equal(f.get('control','company').value.pause_generation,c.value.pause_generation+2,'A new STOP increments generation even while paused');
 assert.deepEqual(f.get('work_items',h.id),h,'Pending STOP cannot make a pause-neutral source override');
 const beforeRead=sqlState(f);await assert.rejects(()=>call({...request(f),action:'read_subject',input:{operation_id:f.op(),sha256:h.value.subject_sha256,offset:0,length:1}}),e=>e.code==='OWNER_SUBJECT_CHANGED');assert.equal(sqlState(f),beforeRead);
 assert.throws(()=>f.run('founder','grant/create',{grant_id:'SYNTHETIC-no-new-authority',to_principal_id:'cos-a',scope:'*',actions:['task/*'],resources:[],expires_at:new Date(Date.now()+60000).toISOString(),source_instruction:source}),e=>e.code==='PRINCIPAL_INACTIVE');
 assert.equal(sqlState(f),beforeRead);
});

test('pending STOP keeps the original expired handover and calls unchanged',async t=>{
 const {f,begun}=pendingFounder(t),h=f.get('work_items',begun.handover_id),now=Date.now;
 Date.now=()=>h.value.expires_at_ms+1;
 try{hook(f);await call(request(f));}finally{Date.now=now;}
 assert.deepEqual(f.get('work_items',h.id),h);assert.equal(f.get('principals','founder').value.status,'pending');assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('pending STOP rejects missing hook, stale epoch, foreign/revoked callers and JSON actor spoofing without writes',async t=>{
 const {f}=pendingFounder(t),beforeHook=sqlState(f);
 await assert.rejects(()=>call(request(f)),e=>e.code==='PEER_CURRENT_HOOK_REQUIRED');assert.equal(sqlState(f),beforeHook);hook(f);
 const OTHER='33333333-3333-4333-8333-333333333333';hook(f,OTHER);hook(f,OUT);
 const previous=f.get('principals','founder').value.membership_previous;assert.equal(f.ledger.read(tx=>tx.getVersion(previous)).value.status,'revoked');
 for(const [args,who,expected]of [[request(f,undefined,IN,7),IN,'OWNER_CHANGED'],[request(f,undefined,OTHER),OTHER,'OWNER_CHANGED'],[request(f,undefined,OUT),OUT,'OWNER_CHANGED'],[request(f),OTHER,'MCP_CODEX_ROOT_CALLER_REQUIRED'],[{...request(f),actor:actor(IN)},IN,'Unknown argument: actor']]){
  const before=sqlState(f);await assert.rejects(()=>call(args,who),error=>error.code===expected||error.message===expected);assert.equal(sqlState(f),before);
 }
 const noHost=sqlState(f);await assert.rejects(()=>main.call('company_owner',request(f),'codex'),e=>e.code==='MCP_CODEX_ROOT_CALLER_REQUIRED');assert.equal(sqlState(f),noHost);
});

test('a pending-looking founder without an original handover cannot use STOP',async t=>{
 const f=ownerGateFixture(t);f.root=fs.realpathSync(f.root);const p=f.get('principals','founder');
 f.seed('principals','founder',{...p.value,status:'pending',host:'codex',native_id:IN,legacy_owner:{host:'codex',session_id:IN,epoch:8}});hook(f);
 const before=sqlState(f);await assert.rejects(()=>call(request(f)),e=>e.code==='OWNER_CHANGED');assert.equal(sqlState(f),before);
});
