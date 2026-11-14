import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';

// SOURCE branch-selection/normalization checks in a complete synthetic graph.
// The existing grant validators are explicit fake dependencies here; these
// cases establish neither real authorization nor Store/process/Native proof.
function fixture(){
  let now=10000;
  let text=fs.readFileSync(new URL('../plugins/soloco/runtime/runtime-execution.mjs',import.meta.url),'utf8');
  text=text.replace(/^import .*;\r?\n/gm,'').replace(/^export \{[^\n]*\};\r?\n/gm,'').replace(/\bexport (?=(?:async )?function|const|let|class)/g,'').replaceAll('import.meta.url',JSON.stringify(new URL('../plugins/soloco/runtime/runtime-execution.mjs',import.meta.url).href));
  const calls={retention:0,continuation:0,operating:0,prospective:0};
  class Clock extends Date{static now(){return now;}}
  const unavailable=()=>{throw Error('Unselected SOURCE dependency');};
  const deps={path,URL,fileURLToPath,createHash,randomUUID,Date:Clock,AbortSignal,EventTarget,process:{pid:23001,execPath:process.execPath},setTimeout:unavailable,clearTimeout:unavailable,normalizeTimeout,
    LEGACY_RUNTIME_PROTOCOL:'unqualified-runtime-processes-v1',validateLegacyRuntimeJobShape:unavailable,legacyRuntimeJobTransition:unavailable,legacyRuntimeJobPhase:unavailable,legacyRetentionModelRequestTransition:unavailable,
    resolveRetentionRepair:(s,j)=>{calls.retention++;const ticket=s.records[j.retention_repair_id];if(!ticket?.development?.proposal)throw Error('Missing active retention ticket');return {proposal:ticket.development.proposal};},
    reviewContinuationAssignment:(s,j)=>{calls.continuation++;const target=s.records[j.review_of.id];if(!target?.development?.proposal)throw Error('Missing active continuation');return target;},
    operatingContext:(s,options)=>{calls.operating++;assert.equal(options.scope,'chosen');return s.syntheticOperating;},
    operatingReviewContext:()=>{calls.prospective++;return {};},
    assertSpecialistEligible:unavailable,developmentAssignment:unavailable,prototypeAssignment:unavailable,
    validModelProcessBirth:value=>value?.protocol==='ordinary-model-process-birth-v1'};
  const context=vm.createContext(deps),api=vm.runInContext(text+'\n;({authorityDeadline,modelExecutionPolicy,actualBirthTimestamp,actualModelObservation,modelResultTiming});',context,{filename:'SOURCE-VM/runtime-execution.mjs',timeout:1000});
  const wire=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context,{timeout:1000});
  return {api,wire,calls,set now(value){now=value;}};
}

test('a new continuation grant is active while its expired input plan remains historical evidence',()=>{
  const f=fixture(),s=f.wire({records:{old:{id:'old',revision:1,development:{type:'plan',scope:{expires_at:new Date(5000).toISOString()}}},next:{id:'next',revision:1,development:{type:'review_continuation',plan_id:'old',proposal:{expires_at:new Date(100000).toISOString()}}}}});
  const job=f.wire({id:'review',role:'qa',review_of:{id:'next',revision:1},inputs:[{id:'old',revision:1}]});
  assert.equal(f.api.authorityDeadline(s,job,'/fictional'),100000);
  assert.equal(f.calls.continuation,1);assert.equal(f.calls.retention,0);
});

test('a retention ticket supplies active expiry without reactivating the old receipt ancestry',()=>{
  const f=fixture(),s=f.wire({records:{old:{id:'old',development:{type:'plan',scope:{expires_at:new Date(5000).toISOString()}}},receipt:{id:'receipt',revision:1,development:{type:'test',plan_id:'old'}},ticket:{id:'ticket',development:{type:'retention_review_repair',proposal:{expires_at:new Date(90000).toISOString()}}}}});
  const job=f.wire({id:'repair',role:'qa',retention_repair_id:'ticket',review_of:{id:'receipt',revision:1},inputs:[{id:'old'}]});
  assert.equal(f.api.authorityDeadline(s,job,'/fictional'),90000);assert.equal(f.calls.retention,1);
  delete s.records.ticket;assert.throws(()=>f.api.authorityDeadline(s,job,'/fictional'),/Missing active retention ticket/);
});

test('prospective operating review and applicable accepted homes have distinct active bounds',()=>{
  const f=fixture(),s=f.wire({records:{proposal:{id:'proposal',revision:1,operating_plan:{valid_until:new Date(80000).toISOString()}},unrelated:{id:'unrelated',operating_record:{expires_at:new Date(5000).toISOString()}}},syntheticOperating:{valid_until:null,homes:[{value:{operating_record:{expires_at:new Date(70000).toISOString()}}}]}});
  assert.equal(f.api.authorityDeadline(s,f.wire({id:'prospective',role:'qa',review_of:{id:'proposal',revision:1}}),'/fictional'),80000,'no accepted index is required for a prospective review');
  assert.equal(f.api.authorityDeadline(s,f.wire({id:'ordinary',context_format:6,context_scope:'chosen',inputs:[{id:'unrelated'}]}),'/fictional'),70000,'unrelated expired historical homes are not active grants');
  assert.equal(f.calls.prospective,1);assert.equal(f.calls.operating,1);
  assert.throws(()=>f.api.authorityDeadline(s,f.wire({id:'missing',role:'engineer',development_id:'absent'}),'/fictional'),/DEVELOPMENT_SCOPE_REQUIRED/);
});

test('per-call execution cannot exceed its captured approved policy even below the global ten-minute limit',()=>{
  const f=fixture(),record=f.wire({approved_call_timeout_ms:3000});
  assert.equal(f.api.modelExecutionPolicy(record,f.wire({execution_timeout_ms:1000})),1000);
  assert.equal(f.api.modelExecutionPolicy(record,f.wire({execution_timeout_ms:3000})),3000);
  for(const value of [3001,600000,2700000])assert.throws(()=>f.api.modelExecutionPolicy(record,f.wire({execution_timeout_ms:value})),/EXECUTION_POLICY_REQUIRED/);
});

test('callback timestamps must equal the private observation in the same creation/request phase',()=>{
  const f=fixture(),record=f.wire({spawn_observed_at_ms:10000,create_before_ms:9998,create_return_ms:9999,request:{requested_at:new Date(9000).toISOString()}});
  assert.doesNotThrow(()=>f.api.actualBirthTimestamp(record,f.wire({spawned_at:new Date(10000).toISOString()})));
  for(const value of [9000,10001,11000])assert.throws(()=>f.api.actualBirthTimestamp(record,f.wire({spawned_at:new Date(value).toISOString()})),/MODEL_PHYSICAL_TIMESTAMP_CHANGED/);
  record.request.requested_at=new Date(11000).toISOString();assert.throws(()=>f.api.actualBirthTimestamp(record,f.wire({spawned_at:new Date(10000).toISOString()})),/MODEL_PHYSICAL_TIMESTAMP_CHANGED/);
});

test('a late captured close remains factual after failure and expiry without becoming a usable result',()=>{
  const f=fixture();f.now=12000;
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const descriptor={command:'/synthetic/provider',args:['--fictional'],options:{cwd:'/synthetic/company'}};
  const birth={protocol:'ordinary-model-process-birth-v1',launch_id:'fictional',host:'codex',pid:740003,worker_pid:23001,spawned_at:new Date(10000).toISOString(),command_sha256:hash(descriptor.command),argv_sha256:hash(JSON.stringify(descriptor.args)),cwd_sha256:hash(descriptor.options.cwd)};
  const receipt={protocol:'ordinary-model-process-close-v1',birth_sha256:hash(JSON.stringify(birth)),closed_at:new Date(11000).toISOString(),exit_code:1,signal:'SIGTERM',observation:'original-child-close'};
  const record=f.wire({kind:'model',committed:true,consumed:true,invalid:true,child:{},birth:{pid:740003},host:'codex',closed:true,close:{code:1,signal:'SIGTERM'},closed_at_ms:11000,spawn_observed_at_ms:10000,create_before_ms:9998,create_return_ms:9999,request:{requested_at:new Date(9000).toISOString()},descriptor,store:{closed:true},execution_started:true,operation_expired:true,operation_deadline_at_ms:10500});
  // These are declared synthetic private facts; no WeakMap or real Store is
  // populated. Exercise the factual and positive-result gates separately.
  f.api.actualModelObservation(record,f.wire(birth),f.wire(receipt));
  assert.throws(()=>f.api.modelResultTiming(record),/MODEL_LAUNCH_FAILED/);
  const future={...receipt,closed_at:new Date(12001).toISOString()};assert.throws(()=>f.api.actualModelObservation(record,f.wire(birth),f.wire(future)),/MODEL_PHYSICAL_CLOSURE_CHANGED/);
});
