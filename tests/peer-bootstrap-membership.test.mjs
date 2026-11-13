import test from 'node:test';
import assert from 'node:assert/strict';
import * as actual from '../plugins/soloco/runtime/peers/bootstrap-membership.mjs';
import {PeerLedger,canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';
import {digest,validateBootstrapMembershipFirstRpc} from '../plugins/soloco/runtime/peers/bootstrap-membership-contract.mjs';
import {bootstrapFixture,disposeBootstrapFixture,core,native,actor,reference} from './peer-bootstrap-membership-fixture.mjs';
test.after(disposeBootstrapFixture);
const hold=e=>typeof e?.code==='string'&&e.code.startsWith('BOOTSTRAP_');
test('the complete outgoing first RPC obeys its 100000-byte limit inside the broader 4000000-byte delivery allowance',()=>{
 const text=canonical({source_cut:{control:{value:{policy:{max_context_bytes:65536}}}}}),receipt={protocol:'peer-bootstrap-membership-first-rpc-v1',payload_sha256:digest(text),instruction_sha256:'1'.repeat(64),frame_sha256:'2'.repeat(64),recipe_sha256:'3'.repeat(64),input_utf8_bytes:Buffer.byteLength(text),whole_rpc_utf8_bytes:100000,frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:Buffer.byteLength(text),policy_maximum_context_bytes:65536,native_identity:'UNOBSERVED_GEOMETRY_ONLY'};
 // Metadata validation creates no original preflight or native capability.
 assert.equal(validateBootstrapMembershipFirstRpc(receipt,text).whole_rpc_utf8_bytes,100000);
 for(const size of [100001,4000000])assert.throws(()=>validateBootstrapMembershipFirstRpc({...receipt,whole_rpc_utf8_bytes:size},text),e=>e?.code==='BOOTSTRAP_PREFLIGHT_CHANGED');
});
function unchanged(f,fn,predicate=hold){const before=logicalSQLState(f);assert.throws(fn,predicate);assert.deepEqual(logicalSQLState(f),before);}

test('actual default constructor/getter are non-authorizing and missing original selection Holds before writes',t=>{
 const f=bootstrapFixture(t),api=actual.createPeerBootstrapMembership({ledger:f.ledger,actor});assert.equal(actual.originalPeerBootstrapMembershipLedger(api),f.ledger);assert.throws(()=>actual.originalPeerBootstrapMembershipLedger({}),hold);
 const input={operation_id:f.op(),epoch:7,enrollment_id:'never',principal_id:'never',role:'reviewer',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(Date.now()+1800000).toISOString(),max_model_calls:2,expected_generation:0,source_instruction:'SYNTHETIC input cannot select a missing producer.'};unchanged(f,()=>api.enroll(input),e=>e?.code==='ORIGIN_MAINTENANCE_SELECTION_REQUIRED');
});
test('real paused controller/model/membership completes both original phases and activates only after exact independent Pass',async t=>{
 const f=bootstrapFixture(t);f.enroll();const reconstruction=await f.completePhase(),review=await f.completePhase('review'),activated=f.activate();
 assert.equal(reconstruction.result.accepted,true);assert.equal(review.result.accepted,true);assert.equal(activated.principal.value.status,'active');assert.equal(activated.principal.value.kind,'reviewer');assert.equal(f.get('control','company').value.paused,true);assert.equal(f.get('principals','scheduler').value.status,'held');assert.equal(f.get('principals','publisher').value.status,'held');assert.equal(f.get('control','usage').value.model_calls,2);assert.equal(f.get('work_items','membership:SYNTHETIC-reviewer-enrollment').value.used_model_calls,2);assert.equal(f.get('work_items',reconstruction.birth.result.creation_ref.id).value.facts.original_runtime.protocol,'peer-original-protected-readonly-runtime-v1');assert.equal(f.get('grants','owner-review-grant'),null);
});
test('copied capabilities, preflight plans and mismatched/cross-ledger original creation tokens fail',t=>{
 const f=bootstrapFixture(t),other=bootstrapFixture(t);f.enroll();const cap=f.prepare(),binding=core.inspectOriginalPeerBootstrapMembership(cap),before=logicalSQLState(f);assert.throws(()=>core.inspectOriginalPeerBootstrapMembership({}),hold);assert.equal(core.originalPeerBootstrapMembershipLedger(f.api),f.ledger);
 assert.throws(()=>core.bindOriginalPeerBootstrapMembershipNative(cap,{}),e=>e?.code==='SYNTHETIC_ORIGINAL_NATIVE_REQUIRED');assert.throws(()=>f.birth(cap,{ledger:other.ledger}),e=>e?.code==='SYNTHETIC_ORIGINAL_NATIVE_REQUIRED');assert.deepEqual(logicalSQLState(f),before);
 assert.throws(()=>core.assertOriginalPeerBootstrapMembership(cap,{ledger:other.ledger,stage:'reserved'}),hold);assert.equal(core.assertOriginalPeerBootstrapMembership(cap,{ledger:f.ledger,stage:'reserved'}).context_sha256,binding.context_sha256);
});
test('full delivery, 4096 range cap, exact strict review and immutable first submission are enforced',async t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare();f.birth(cap);const channel=core.originalPeerBootstrapMembershipChannel(cap),h=channel.header();unchanged(f,()=>channel.submit({sha256:h.sha256,content:'SYNTHETIC premature text'}),e=>e?.code==='BOOTSTRAP_DELIVERY_INCOMPLETE');unchanged(f,()=>channel.read({sha256:h.sha256,offset:0,length:4097}),e=>e?.code==='BOOTSTRAP_READ_RANGE');const submitted=f.submit(cap);unchanged(f,()=>channel.submit({sha256:h.sha256,content:'Changed first text'}),e=>e?.code==='BOOTSTRAP_FIRST_SUBMISSION_REQUIRED');await core.completeOriginalPeerBootstrapMembership(cap,f.drain(cap,submitted.output));
 const review=f.prepare('review');f.birth(review);const r=f.consume(review),wrong=canonical({content:'SYNTHETIC wrong context',review:{subject:r.header.review_subject,context_sha256:'f'.repeat(64),verdict:'Pass',reason:'Must reject.',blockers:[]}});unchanged(f,()=>r.channel.submit({sha256:r.header.sha256,content:wrong}),e=>e?.code==='BOOTSTRAP_REVIEW_OUTPUT');
});
test('turn-only drain cannot release a slot; UNKNOWN hold and late diagnostics retain original reservation and spend',async t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare();f.birth(cap);const submitted=f.submit(cap),binding=core.inspectOriginalPeerBootstrapMembership(cap),before=logicalSQLState(f),token=f.drain(cap,submitted.output,{closure:false});await assert.rejects(()=>core.completeOriginalPeerBootstrapMembership(cap,token),e=>e?.code==='BOOTSTRAP_CLOSURE_SOURCE_REQUIRED');assert.deepEqual(logicalSQLState(f),before);
 const held=core.holdOriginalPeerBootstrapMembership(cap,{error:'SYNTHETIC actual closure missing; preserve UNKNOWN.'});assert.equal(held.status,'unknown');const p=f.get('work_items','membership-phase:SYNTHETIC-reviewer-enrollment:reconstruction'),slot=f.get('slots',p.value.execution_id),usage=f.get('control','usage');assert.equal(slot.value.status,'unknown');assert.equal(usage.value.model_calls,1);
 const facts={qualifies:false,kind:binding.kind,admission_ref:binding.admission_ref,context_sha256:binding.context_sha256,observation_sha256:'c'.repeat(64),output:'SYNTHETIC late facts do not establish whole closure.'},diagnostic=native.mintSyntheticDiagnostic(f.ledger,facts),late=await core.recordOriginalPeerBootstrapMembershipLateEvidence(cap,diagnostic);assert.equal(late.closure,'UNKNOWN');assert.deepEqual(f.get('slots',slot.id),slot);assert.deepEqual(f.get('control','usage'),usage);unchanged(f,()=>f.prepare(),e=>e?.code==='ATTEMPT_CONSUMED');
});
test('a second pause invalidates original selection across every reserved API and a new constructor cannot renew it',t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare(),c=f.get('control','company');f.seed('control','company',{...c.value,pause_generation:c.value.pause_generation+1,paused:true});
 for(const fn of [()=>core.assertOriginalPeerBootstrapMembership(cap,{ledger:f.ledger,stage:'reserved'}),()=>core.originalPeerBootstrapMembershipPreflight(cap),()=>core.prepareOriginalPeerBootstrapMembershipContext(cap),()=>f.birth(cap)])unchanged(f,fn,e=>e?.code==='BOOTSTRAP_ORIGINAL_SELECTION_CHANGED');
 const successor=core.createPeerBootstrapMembership({ledger:f.ledger,actor});unchanged(f,()=>successor.activate({operation_id:f.op(),epoch:7,enrollment_id:'SYNTHETIC-reviewer-enrollment',source_instruction:'SYNTHETIC constructor cannot backfill selection.'}),e=>e?.code==='BOOTSTRAP_ORIGINAL_SELECTION_CHANGED');
});
test('original generation also fences live delivery, submission and drain without spend or release',async t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare();f.birth(cap);const submitted=f.submit(cap),channel=core.originalPeerBootstrapMembershipChannel(cap),token=f.drain(cap,submitted.output),c=f.get('control','company');f.seed('control','company',{...c.value,pause_generation:c.value.pause_generation+1});
 for(const fn of [()=>channel.header(),()=>channel.read({sha256:submitted.header.sha256,offset:0,length:1}),()=>channel.submit({sha256:submitted.header.sha256,content:submitted.output}),()=>core.assertOriginalPeerBootstrapMembership(cap,{ledger:f.ledger,stage:'execution'})])unchanged(f,fn,e=>e?.code==='BOOTSTRAP_ORIGINAL_SELECTION_CHANGED');
 const before=logicalSQLState(f);await assert.rejects(()=>core.completeOriginalPeerBootstrapMembership(cap,token),e=>e?.code==='BOOTSTRAP_ORIGINAL_SELECTION_CHANGED');assert.deepEqual(logicalSQLState(f),before);
});
test('a changed complete current meaning invalidates the original assignment before delivery or completion',async t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare();f.birth(cap);const channel=core.originalPeerBootstrapMembershipChannel(cap);f.seed('messages','SYNTHETIC-new-business-fact',{content:'A new applicable fact must enter the complete reconstruction.'});unchanged(f,()=>channel.header(),e=>e?.code==='CONTEXT_CHANGED');
});
test('negative independent review remains immutable and cannot activate or buy another attempt',async t=>{
 const f=bootstrapFixture(t);f.enroll();await f.completePhase();const review=await f.completePhase('review',{submission:{verdict:'Fail'}});assert.equal(review.result.accepted,true);unchanged(f,()=>f.activate(),e=>e?.code==='QUALIFICATION_REQUIRED');unchanged(f,()=>f.prepare('review'),e=>e?.code==='ATTEMPT_CONSUMED');assert.equal(f.get('control','usage').value.model_calls,2);
});
test('global budgets and all original active/UNKNOWN slots fence admission before a new charge',t=>{
 const f=bootstrapFixture(t);f.enroll();for(let i=0;i<3;i++)f.seed('slots','SYNTHETIC-old-UNKNOWN-'+i,{status:'unknown',principal_id:'founder'});const before=f.get('control','usage');unchanged(f,()=>f.prepare(),e=>e?.code==='CAPACITY_BUSY');assert.deepEqual(f.get('control','usage'),before);for(let i=0;i<3;i++)assert.equal(f.get('slots','SYNTHETIC-old-UNKNOWN-'+i).value.status,'unknown');
});
test('original provider Error and AggregateError identities survive paused guarded admission',t=>{
 const f=bootstrapFixture(t);f.enroll();const query=f.ledger.query;
 for(const error of [Object.assign(Error('SYNTHETIC provider'),{code:'PROVIDER_FAILURE'}),new AggregateError([Error('SYNTHETIC first'),Error('SYNTHETIC boundary')],'SYNTHETIC aggregate')]){f.ledger.query=function(sql){if(sql.includes('peer_rows'))throw error;return Reflect.apply(query,this,[sql]);};try{assert.throws(()=>f.prepare(),e=>e===error);}finally{f.ledger.query=query;}}
});
test('physical admission expiry after a real first put rolls back the entire attempt and all three charges',t=>{
 const f=bootstrapFixture(t);f.enroll();const before=logicalSQLState(f),enrollment=f.get('work_items','membership:SYNTHETIC-reviewer-enrollment'),expiry=Date.parse(enrollment.value.expires_at),guarded=f.ledger.guardedWrite;let clock=Date.now(),puts=0;t.mock.method(Date,'now',()=>clock);
 f.ledger.guardedWrite=function(type,principal,callback,terminal){return Reflect.apply(guarded,this,[type,principal,raw=>callback({...raw,put(...args){const row=raw.put(...args);if(type==='membership/admit'&&++puts===1)clock=expiry+1;return row;}}),terminal]);};
 try{assert.throws(()=>f.prepare());}finally{f.ledger.guardedWrite=guarded;}assert(puts>0,'expiry crossed after a genuine original first put');assert.deepEqual(logicalSQLState(f),before);
});
test('closed nested DATA rejects getters/callbacks before any provider read or source write',t=>{
 const f=bootstrapFixture(t),query=f.ledger.query;let reads=0,getters=0;const bad={family:'work_items',id:'bad',revision:1,sha256:'f'.repeat(64),get proof(){getters++;throw Error('Nested getter must not run.');}};
 f.ledger.query=function(...args){reads++;return Reflect.apply(query,this,args);};try{assert.throws(()=>f.enroll({input_refs:[bad]}),e=>e?.code==='BOOTSTRAP_INPUT');assert.throws(()=>f.enroll({input_refs:[{callback(){}}]}),e=>e?.code==='BOOTSTRAP_INPUT');}finally{f.ledger.query=query;}assert.equal(reads,0);assert.equal(getters,0);
});
test('ordinary model and bootstrap modules import without a top-level-await dependency cycle',async()=>{
 const {spawnSync}=await import('node:child_process');const result=spawnSync(process.execPath,['--input-type=module','-e','const m=await import(\"./plugins/soloco/runtime/peers/bootstrap-membership.mjs\");process.stdout.write(String(typeof m.createPeerBootstrapMembership));'],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'function');
});
for(const condition of ['expired','later-pause'])test('genuine negative diagnostic custody survives '+condition+' while old positive caps stay fenced',async t=>{
 const f=bootstrapFixture(t);f.enroll();const cap=f.prepare();f.birth(cap);const submitted=f.submit(cap),b=core.inspectOriginalPeerBootstrapMembership(cap),usage=f.get('control','usage');
 const facts={qualifies:false,kind:b.kind,admission_ref:b.admission_ref,context_sha256:b.context_sha256,native_id:b.native_id,thread_id:b.native_id,observation_sha256:(condition==='expired'?'a':'b').repeat(64),output:'SYNTHETIC original nonqualifying failure must remain in custody.'},token=native.mintSyntheticDiagnostic(f.ledger,facts);
 if(condition==='expired')t.mock.method(Date,'now',()=>b.deadline_at_ms+1);else {const {model}=await import('./peer-bootstrap-membership-fixture.mjs');model.execute(f.ledger,{principal_id:'founder'},'company/pause',{operation_id:f.op(),source_instruction:'SYNTHETIC genuine later software pause.'});}
 assert.throws(()=>submitted.channel.header());const before=logicalSQLState(f);await assert.rejects(()=>core.recordOriginalPeerBootstrapMembershipLateEvidence(cap,{}),e=>e?.code==='SYNTHETIC_ORIGINAL_NATIVE_REQUIRED');assert.deepEqual(logicalSQLState(f),before);
 const result=await core.recordOriginalPeerBootstrapMembershipLateEvidence(cap,token);assert.equal(result.closure,'UNKNOWN');assert.equal(f.get('work_items','membership-phase:SYNTHETIC-reviewer-enrollment:reconstruction').value.status,'unknown');assert.equal(f.get('slots','membership-execution:'+b.attempt_id).value.status,'unknown');assert.deepEqual(f.get('control','usage'),usage);assert.equal(f.get('work_items',result.evidence_ref.id).value.original_deadline_at_ms,b.deadline_at_ms);assert.equal(f.get('work_items',result.evidence_ref.id).value.acceptance_authority,false);const recorded=logicalSQLState(f);assert.deepEqual(await core.recordOriginalPeerBootstrapMembershipLateEvidence(cap,token),{evidence_ref:result.evidence_ref,closure:'UNKNOWN',authority_issued:false});assert.deepEqual(logicalSQLState(f),recorded);assert.throws(()=>f.prepare());
});
