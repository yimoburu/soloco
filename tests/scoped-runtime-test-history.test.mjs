// Synthetic JSON provenance fixtures only. No company, worker, provider or
// candidate test execution is initialized by this suite. A completed software
// controller may retain a failed result; source closure grants no acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {producerClosure,captureScopedPlan,scopedPlanView,scopedReference} from '../plugins/soloco/runtime/scoped-context.mjs';
import {resolveSnapshot,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';

const json=JSON.stringify,sha=value=>createHash('sha256').update(json(value)).digest('hex');
const clone=value=>structuredClone(value),hold=/Scoped context hold:/;
const ids=closure=>closure.map(ref=>ref.id);

function fixture({historical=true,replacement='completed'}={}){
 const scope={test_paths:['synthetic.test.mjs'],timeout_ms:1000,max_output_bytes:4096,expires_at:'2001-01-01T00:00:00.000Z'};
 const plan={id:'plan',kind:'artifact',revision:1,status:'Draft',author_role:'human_founder',content:'SYNTHETIC expired original scope; no current permission.',development:{type:'plan',scope,scope_sha256:sha(scope),authorization:{authority_sha256:sha('synthetic original authority')}}};
 const files=[{path:'synthetic.mjs',content:'export const synthetic=1;\n'}];
 const generation={id:'generation',kind:'development_generation',role:'engineer',instance_id:'synthetic-engineer',native_id:'SYNTHETIC-no-native-call',status:'completed',development_id:plan.id,artifact_id:'candidate'};
 const candidate={id:'candidate',kind:'artifact',revision:1,status:'Submitted',author_role:'engineer',author_instance:generation.instance_id,job_id:generation.id,content:'SYNTHETIC fixed candidate; no execution.',development:{type:'candidate',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,files,candidate_sha256:sha(files),run:{job_id:'old-test',status:'completed',receipt_id:'old-receipt'}}};
 const oldJob={id:'old-test',kind:'development_test',status:'completed',artifact_id:'old-receipt',candidate_id:candidate.id,development_id:plan.id,epoch:1,session_id:'SYNTHETIC-original-owner',host:'codex'};
 const result={status:'failed',exit_code:null,tests_executed:false,signal:null,error:'SYNTHETIC retained preflight failure; no retry or allowance refund.',stdout:'',stderr:'',directory:'/SYNTHETIC/retained/candidate',test_paths:clone(scope.test_paths),timeout_ms:scope.timeout_ms,max_output_bytes:scope.max_output_bytes};
 const receipt={id:'old-receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:oldJob.id,content:json(result),development:{type:'test',plan_id:plan.id,candidate_id:candidate.id,candidate_sha256:candidate.development.candidate_sha256,result,receipt_sha256:sha(result)}};
 const state={id:'SYNTHETIC-company',name:'Synthetic historical producer closure',mode:'preparation',phase:'Frame',paused:true,owner:{host:'codex',session_id:'SYNTHETIC-successor-owner',epoch:2},governance:'Retain every failed result and spent allowance.',cos_instructions:'Read-only source discovery does not grant execution.',roles:{engineer:{name:'Engineer'},qa:{name:'Independent QA'}},records:{plan,candidate,[receipt.id]:receipt},jobs:{[generation.id]:generation,[oldJob.id]:oldJob},notices:[],messages:[]};
 if(historical){
  const terminal=['completed','quarantined'].includes(replacement);
  const newJob={id:'replacement-test',kind:'development_test',status:replacement,candidate_id:candidate.id,development_id:plan.id,preflight_recovery_id:'recovery',epoch:1,session_id:'SYNTHETIC-original-owner',host:'codex',...(terminal?{artifact_id:'replacement-receipt'}:{})};
  state.jobs[newJob.id]=newJob;
  candidate.development.run_history=[clone(candidate.development.run)];
  candidate.development.run={job_id:newJob.id,status:replacement,...(terminal?{receipt_id:'replacement-receipt'}:{})};
  candidate.development.preflight_recovery='recovery';
  const recovery={id:'recovery',kind:'artifact',revision:1,status:'Recorded',author_role:'human_founder',recorded_by:'SYNTHETIC-original-owner',content:'SYNTHETIC original recovery selection, already consumed; not current authority.',development:{type:'preflight_recovery_request',protocol:'original-grant-validation-recovery-v1',subject:{},proof:{execution_provenance:{protocol:'SYNTHETIC-preflight',phase:'preflight',launch_intent:false,runner_entered:false}},diagnostic_id:'diagnostic',diagnostic_sha256:sha('synthetic diagnostic'),authority_sha256:plan.development.authorization.authority_sha256,owner:{host:'codex',session_id:'SYNTHETIC-original-owner',epoch:1},expires_at:scope.expires_at,status:'consumed',job_id:newJob.id,generation_permission:false,allowance_reset:false}};
  state.records[recovery.id]=recovery;
  if(terminal){
   const currentResult=replacement==='quarantined'?{status:'failed',exit_code:1,tests_executed:true,signal:null,error:'SYNTHETIC retained failed/quarantined outcome; no acceptance.',stdout:'',stderr:'SYNTHETIC negative result.'}:{status:'passed',exit_code:0,tests_executed:true,signal:null,stdout:'SYNTHETIC result data only.',stderr:''};
   state.records['replacement-receipt']={id:'replacement-receipt',kind:'artifact',revision:1,status:replacement==='quarantined'?'Quarantined':'Submitted',author_role:'runtime',author_instance:newJob.id,content:json(currentResult),development:{type:'test',preflight_recovery_id:recovery.id,plan_id:plan.id,candidate_id:candidate.id,candidate_sha256:candidate.development.candidate_sha256,result:currentResult,receipt_sha256:sha(currentResult)}};
  }
  sealRecovery(state);
 }
 return state;
}

function sealRecovery(s){
 const p=s.records.plan,c=s.records.candidate,r=s.records['old-receipt'],j=s.jobs['old-test'],g=s.records.recovery.development;
 g.subject={plan_id:p.id,scope_sha256:p.development.scope_sha256,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,receipt_id:r.id,receipt_sha256:r.development.receipt_sha256,receipt_record_sha256:sha(r),job_id:j.id,job_sha256:sha(j)};
}
function sealTerminal(s){const r=s.records['replacement-receipt'];r.development.receipt_sha256=sha(r.development.result);r.content=json(r.development.result);}
function checkedClosure(s,id='old-receipt'){
 const before=clone(s),out=producerClosure(s,s.records[id]);assert.deepEqual(s,before,'source discovery must not mutate historical state');return out;
}
function rejects(s){const before=clone(s);assert.throws(()=>producerClosure(s,s.records['old-receipt']),hold);assert.deepEqual(s,before);}
function contains(closure,required){for(const id of required)assert.ok(ids(closure).includes(id),'missing exact producer support '+id);}

test('current runtime receipt keeps the existing exact producer closure',()=>{
 const s=fixture({historical:false}),closure=checkedClosure(s);
 assert.deepEqual(new Set(ids(closure)),new Set(['job:old-test','candidate','plan','job:generation']));
 assert.deepEqual(closure.find(ref=>ref.id==='job:old-test'),scopedReference(s.jobs['old-test'],'job:old-test'));
 assert.equal(s.records['old-receipt'].development.result.status,'failed');
});

test('current-run compatibility does not retroactively require historical recovery scope fields',()=>{
 const s=fixture({historical:false});
 delete s.records.candidate.development.plan_id;
 delete s.records.candidate.development.scope_sha256;
 s.records.plan={id:'plan',kind:'artifact',revision:1,content:'SYNTHETIC original minimal producer plan.'};
 assert.deepEqual(new Set(ids(checkedClosure(s))),new Set(['job:old-test','candidate','plan','job:generation']));
});

test('historical completed controller keeps its failed receipt after the candidate points to a later completed run',()=>{
 const s=fixture(),old=clone(s.records['old-receipt']),closure=checkedClosure(s);
 contains(closure,['job:old-test','candidate','plan','job:generation','recovery','job:replacement-test']);
 assert.deepEqual(s.records['old-receipt'],old);
 assert.equal(s.records['old-receipt'].development.result.status,'failed');
 assert.equal(s.records['old-receipt'].development.result.tests_executed,false);
 assert.equal(s.records.candidate.development.run.job_id,'replacement-test');
 assert.deepEqual(s.records.candidate.development.run_history,[{job_id:'old-test',status:'completed',receipt_id:'old-receipt'}]);
 assert.equal(s.records.recovery.development.generation_permission,false);
 assert.equal(s.records.recovery.development.allowance_reset,false);
});

test('historical receipt remains discoverable while its exact replacement is queued without a new receipt',()=>{
 const s=fixture({replacement:'queued'}),closure=checkedClosure(s);
 contains(closure,['job:old-test','candidate','plan','job:generation','recovery','job:replacement-test']);
 assert.equal(s.records.candidate.development.run.receipt_id,undefined);
 assert.equal(s.jobs['replacement-test'].artifact_id,undefined);
});

test('historical receipt survives the original queued pointer while its replacement worker is running',()=>{
 const s=fixture({replacement:'queued'});s.jobs['replacement-test'].status='running';
 const closure=checkedClosure(s);
 contains(closure,['job:old-test','candidate','plan','job:generation','recovery','job:replacement-test']);
 assert.equal(s.records.candidate.development.run.status,'queued');
 assert.equal(s.jobs['replacement-test'].status,'running');
 assert.equal(s.records.candidate.development.run.receipt_id,undefined);
 assert.equal(s.jobs['replacement-test'].artifact_id,undefined);
});

test('historical receipt remains discoverable after its exact replacement fails before producing a new receipt',()=>{
 const s=fixture({replacement:'failed'}),closure=checkedClosure(s);
 contains(closure,['job:old-test','candidate','plan','job:generation','recovery','job:replacement-test']);
 assert.equal(s.records.candidate.development.run.status,'failed');
 assert.equal(s.records.candidate.development.run.receipt_id,undefined);
 assert.equal(s.jobs['replacement-test'].artifact_id,undefined);
 assert.equal(s.records['old-receipt'].development.result.status,'failed');
});

test('scoped source capture retains the failed original and revalidates its complete historical producer closure',()=>{
 const s=fixture(),before=clone(s),captured=captureScopedPlan(s,{source_id:'old-receipt'});
 assert.deepEqual(s,before,'capture must not alter the logical state or history');
 const capsule=resolveSnapshot(s,captured.capsule);
 assert.deepEqual(resolveSnapshot(s,capsule.original),before.records['old-receipt']);
 contains(capsule.producer_closure,['job:old-test','candidate','plan','job:generation','recovery','job:replacement-test']);
 s.records['captured-history']={id:'captured-history',kind:'artifact',revision:1,scoped_context_plan:captured};
 assert.doesNotThrow(()=>scopedPlanView(s,{plan_id:'captured-history'}));
 const bad=inheritSnapshots(s,clone(s));bad.records.recovery.development.subject.job_sha256='0'.repeat(64);
 assert.throws(()=>scopedPlanView(bad,{plan_id:'captured-history'}),hold);
 const changedTerminal=inheritSnapshots(s,clone(s));changedTerminal.records['replacement-receipt'].development.result.stdout+=' changed canonical result';sealTerminal(changedTerminal);
 assert.throws(()=>scopedPlanView(changedTerminal,{plan_id:'captured-history'}),hold,'the full terminal receipt ref must remain frozen even when its own content/hash are internally consistent');
 assert.equal(s.records['old-receipt'].development.result.status,'failed');
});

test('historical lookup preserves all existing canonical receipt, job, candidate and producer joins',async t=>{
 const cases={
  'runtime author role':s=>s.records['old-receipt'].author_role='engineer',
  'controller artifact':s=>s.jobs['old-test'].artifact_id='other',
  'controller kind':s=>s.jobs['old-test'].kind='ordinary',
  'controller candidate':s=>s.jobs['old-test'].candidate_id='other',
  'controller plan':s=>s.jobs['old-test'].development_id='other',
  'controller status':s=>s.jobs['old-test'].status='failed',
  'receipt optional job alias':s=>s.records['old-receipt'].job_id='different-controller',
  'receipt candidate hash':s=>s.records['old-receipt'].development.candidate_sha256='0'.repeat(64),
  'receipt result hash':s=>s.records['old-receipt'].development.receipt_sha256='0'.repeat(64),
  'receipt result bytes':s=>s.records['old-receipt'].development.result.error+='changed',
  'receipt content':s=>s.records['old-receipt'].content+='changed',
  'candidate hash':s=>s.records.candidate.development.candidate_sha256='0'.repeat(64),
  'candidate scope differs from original plan':s=>s.records.candidate.development.scope_sha256='0'.repeat(64),
  'plan scope body differs from its declared hash':s=>s.records.plan.development.scope.acceptance='SYNTHETIC altered original acceptance rule',
  'candidate producer identity':s=>s.records.candidate.author_instance='different-instance',
  'candidate producer artifact':s=>s.jobs.generation.artifact_id='other',
  'plan canonical identity':s=>s.records.plan.id='different-plan'
 };
 for(const [name,change]of Object.entries(cases))await t.test(name,()=>{const s=fixture();change(s);sealRecovery(s);rejects(s);});
});

test('malformed, duplicate and competing run-history claims cannot replace an exact unique historical run',async t=>{
 const cases={
  'missing history':s=>delete s.records.candidate.development.run_history,
  'non-array history':s=>s.records.candidate.development.run_history={},
  'empty history':s=>s.records.candidate.development.run_history=[],
  'null entry':s=>s.records.candidate.development.run_history=[null],
  'missing receipt field':s=>delete s.records.candidate.development.run_history[0].receipt_id,
  'extra history field':s=>s.records.candidate.development.run_history[0].trusted=true,
  'wrong history status':s=>s.records.candidate.development.run_history[0].status='quarantined',
  'forged prior job':s=>s.records.candidate.development.run_history[0].job_id='other',
  'forged prior receipt':s=>s.records.candidate.development.run_history[0].receipt_id='other',
  'duplicate exact tuple':s=>s.records.candidate.development.run_history.push(clone(s.records.candidate.development.run_history[0])),
  'same job claims another receipt':s=>s.records.candidate.development.run_history.push({job_id:'old-test',status:'completed',receipt_id:'other'}),
  'same receipt claims another job':s=>s.records.candidate.development.run_history.push({job_id:'other',status:'completed',receipt_id:'old-receipt'}),
  'current and history claim the same run':s=>s.records.candidate.development.run=clone(s.records.candidate.development.run_history[0])
 };
 for(const [name,change]of Object.entries(cases))await t.test(name,()=>{const s=fixture();change(s);rejects(s);});
});

test('history cannot relabel a different receipt category or executed, reused or out-of-scope result as original preflight failure',async t=>{
 const cases={
  'original receipt kind':s=>s.records['old-receipt'].kind='decision',
  'original receipt status':s=>s.records['old-receipt'].status='Quarantined',
  'original receipt revision':s=>s.records['old-receipt'].revision=2,
  'old controller reuses another receipt':s=>s.jobs['old-test'].reuse_receipt_id='other',
  'receipt claims otherwise valid reused provenance':s=>{
   const origin=s.records['replacement-receipt'],qa={id:'SYNTHETIC-reuse-review',kind:'review',revision:1,author_role:'qa',review_of:{id:origin.id,revision:origin.revision},content:'SYNTHETIC structural review fixture; grants no reuse.'};
   s.records[qa.id]=qa;s.records['old-receipt'].development.reused_from=origin.id;s.records['old-receipt'].development.reuse_qualification=scopedReference(qa);
  },
  'result claims reuse':s=>s.records['old-receipt'].development.result.reused=true,
  'result claims passed':s=>s.records['old-receipt'].development.result.status='passed',
  'result records execution exit':s=>s.records['old-receipt'].development.result.exit_code=0,
  'result records executed tests':s=>s.records['old-receipt'].development.result.tests_executed=true,
  'missing retained directory':s=>delete s.records['old-receipt'].development.result.directory,
  'nontext retained directory':s=>s.records['old-receipt'].development.result.directory=7,
  'empty retained directory':s=>s.records['old-receipt'].development.result.directory='',
  'different test paths':s=>s.records['old-receipt'].development.result.test_paths=['different.test.mjs'],
  'different original timeout':s=>s.records['old-receipt'].development.result.timeout_ms++,
  'different original output limit':s=>s.records['old-receipt'].development.result.max_output_bytes++
 };
 for(const [name,change]of Object.entries(cases))await t.test(name,()=>{
  const s=fixture();change(s);const r=s.records['old-receipt'];
  r.development.receipt_sha256=sha(r.development.result);r.content=json(r.development.result);sealRecovery(s);rejects(s);
 });
});

test('historical retention requires the canonical consumed recovery and its exact original and replacement bindings',async t=>{
 const cases={
  'missing recovery selector':s=>delete s.records.candidate.development.preflight_recovery,
  'missing recovery record':s=>delete s.records.recovery,
  'recovery record role':s=>s.records.recovery.author_role='runner',
  'recovery record kind':s=>s.records.recovery.kind='decision',
  'recovery record status':s=>s.records.recovery.status='Draft',
  'recorded founder differs from captured owner':s=>s.records.recovery.recorded_by='SYNTHETIC-different-owner',
  'captured owner host':s=>s.records.recovery.development.owner.host='other',
  'captured owner session':s=>s.records.recovery.development.owner.session_id='SYNTHETIC-different-owner',
  'captured owner epoch':s=>s.records.recovery.development.owner.epoch++,
  'recovery protocol':s=>s.records.recovery.development.protocol='unknown',
  'recovery type':s=>s.records.recovery.development.type='ordinary',
  'unconsumed recovery':s=>s.records.recovery.development.status='proposed',
  'generation permission':s=>s.records.recovery.development.generation_permission=true,
  'allowance reset':s=>s.records.recovery.development.allowance_reset=true,
  'subject plan':s=>s.records.recovery.development.subject.plan_id='other',
  'subject scope hash':s=>s.records.recovery.development.subject.scope_sha256='0'.repeat(64),
  'subject candidate':s=>s.records.recovery.development.subject.candidate_id='other',
  'subject candidate hash':s=>s.records.recovery.development.subject.candidate_sha256='0'.repeat(64),
  'subject receipt':s=>s.records.recovery.development.subject.receipt_id='other',
  'subject receipt result hash':s=>s.records.recovery.development.subject.receipt_sha256='0'.repeat(64),
  'subject full receipt hash':s=>s.records.recovery.development.subject.receipt_record_sha256='0'.repeat(64),
  'subject old job':s=>s.records.recovery.development.subject.job_id='other',
  'subject full old job hash':s=>s.records.recovery.development.subject.job_sha256='0'.repeat(64),
  'recovery expiry':s=>s.records.recovery.development.expires_at='2099-01-01T00:00:00.000Z',
  'recovery replacement selector':s=>s.records.recovery.development.job_id='other',
  'replacement canonical job missing':s=>delete s.jobs['replacement-test'],
  'replacement kind':s=>s.jobs['replacement-test'].kind='ordinary',
  'replacement candidate':s=>s.jobs['replacement-test'].candidate_id='other',
  'replacement plan':s=>s.jobs['replacement-test'].development_id='other',
  'replacement recovery':s=>s.jobs['replacement-test'].preflight_recovery_id='other',
  'replacement current receipt':s=>s.jobs['replacement-test'].artifact_id='other',
  'completed replacement lacks both receipt pointers':s=>{delete s.jobs['replacement-test'].artifact_id;delete s.records.candidate.development.run.receipt_id;},
  'quarantined replacement lacks both receipt pointers':s=>{s.jobs['replacement-test'].status='quarantined';s.records.candidate.development.run.status='quarantined';delete s.jobs['replacement-test'].artifact_id;delete s.records.candidate.development.run.receipt_id;},
  'queued replacement retains completed receipt pointers':s=>{s.jobs['replacement-test'].status='queued';s.records.candidate.development.run.status='queued';},
  'failed replacement retains completed receipt pointers':s=>{s.jobs['replacement-test'].status='failed';s.records.candidate.development.run.status='failed';},
  'replacement status':s=>s.jobs['replacement-test'].status='quarantined',
  'replacement owner host':s=>s.jobs['replacement-test'].host='other',
  'replacement owner session':s=>s.jobs['replacement-test'].session_id='SYNTHETIC-different-owner',
  'replacement owner epoch':s=>s.jobs['replacement-test'].epoch++
 };
 for(const [name,change]of Object.entries(cases))await t.test(name,()=>{const s=fixture();change(s);rejects(s);});
});

test('missing original producers or canonical records remain holds instead of silently dropping historical evidence',async t=>{
 for(const [collection,id]of [['jobs','old-test'],['jobs','generation'],['records','candidate'],['records','plan']])await t.test(collection+':'+id,()=>{const s=fixture();delete s[collection][id];rejects(s);});
});

test('resealing changed historical result or job DATA cannot replace the frozen original receipt and job hashes',async t=>{
 await t.test('changed result with internally consistent result hash and content',()=>{
  const s=fixture(),r=s.records['old-receipt'];r.development.result.error+=' changed';
  r.development.receipt_sha256=sha(r.development.result);r.content=json(r.development.result);rejects(s);
 });
 await t.test('changed job with otherwise unchanged canonical identity joins',()=>{
  const s=fixture();s.jobs['old-test'].retained_note='SYNTHETIC changed historical job body';rejects(s);
 });
});

test('unsupported reverse and failed-worker pointer mismatches remain holds',async t=>{
 await t.test('reverse running pointer with queued worker is not the original writer transition',()=>{
  const s=fixture({replacement:'queued'});s.records.candidate.development.run.status='running';rejects(s);
 });
 await t.test('queued pointer cannot hide a failed worker as an arbitrary status mismatch',()=>{
  const s=fixture({replacement:'queued'});s.jobs['replacement-test'].status='failed';rejects(s);
 });
});

test('replacement pointer, job status and receipt presence obey exactly the six writer transitions',async t=>{
 const statuses=['queued','running','cancelled','failed','completed','quarantined'];
 const allowed=new Set(['queued/queued/none','queued/running/none','queued/cancelled/none','failed/failed/none','completed/completed/matching','quarantined/quarantined/matching']);
 for(const pointer of statuses)for(const job of statuses)for(const receipt of ['none','matching']){
  const key=pointer+'/'+job+'/'+receipt;
  await t.test(key,()=>{
   const s=fixture({replacement:job}),run=s.records.candidate.development.run,current=s.jobs['replacement-test'];run.status=pointer;
   if(receipt==='none'){
    delete run.receipt_id;delete current.artifact_id;delete s.records['replacement-receipt'];
   }else{
    if(!s.records['replacement-receipt'])s.records['replacement-receipt']=clone(fixture().records['replacement-receipt']);
    run.receipt_id='replacement-receipt';current.artifact_id='replacement-receipt';
   }
   if(allowed.has(key)){
    const closure=checkedClosure(s);contains(closure,['job:old-test','candidate','plan','job:generation','recovery','job:replacement-test']);
    if(receipt==='matching')assert.deepEqual(closure.find(ref=>ref.id==='replacement-receipt'),scopedReference(s.records['replacement-receipt']));
    else assert.equal(ids(closure).includes('replacement-receipt'),false);
   }else rejects(s);
  });
 }
});

test('terminal replacement receipts retain failed outcomes without pass, execution-success or current-authority requirements',async t=>{
 for(const replacement of ['completed','quarantined'])await t.test(replacement,()=>{
  const s=fixture({replacement}),r=s.records['replacement-receipt'];
  r.development.result={status:'failed',exit_code:1,tests_executed:true,signal:null,error:'SYNTHETIC executed negative outcome must remain evidence.',stdout:'',stderr:'Retain failure, grants no acceptance.',reused:false};sealTerminal(s);
  const before=clone(r),closure=checkedClosure(s);
  assert.deepEqual(closure.find(ref=>ref.id===r.id),scopedReference(r));assert.deepEqual(s.records[r.id],before);
  assert.equal(r.status,replacement==='quarantined'?'Quarantined':'Submitted');assert.equal(r.development.result.status,'failed');
  assert.equal(s.paused,true);assert.notEqual(s.owner.session_id,s.records.recovery.development.owner.session_id);
 });
});

test('terminal replacement body, producer joins and nonreuse fields cannot be substituted',async t=>{
 const cases=[
  ['terminal receipt missing',s=>delete s.records['replacement-receipt']],
  ['terminal canonical identity',s=>s.records['replacement-receipt'].id='other'],
  ['terminal receipt kind',s=>s.records['replacement-receipt'].kind='decision'],
  ['terminal receipt revision',s=>s.records['replacement-receipt'].revision=2],
  ['completed receipt row status',s=>s.records['replacement-receipt'].status='Quarantined'],
  ['terminal receipt author role',s=>s.records['replacement-receipt'].author_role='engineer'],
  ['terminal receipt author instance',s=>s.records['replacement-receipt'].author_instance='other'],
  ['terminal receipt type',s=>s.records['replacement-receipt'].development.type='preflight_diagnostic'],
  ['terminal receipt plan',s=>s.records['replacement-receipt'].development.plan_id='other'],
  ['terminal receipt candidate',s=>s.records['replacement-receipt'].development.candidate_id='other'],
  ['terminal receipt candidate hash',s=>s.records['replacement-receipt'].development.candidate_sha256='0'.repeat(64)],
  ['terminal receipt recovery request',s=>s.records['replacement-receipt'].development.preflight_recovery_id='other'],
  ['terminal receipt optional job alias',s=>s.records['replacement-receipt'].job_id='other'],
  ['replacement job requests receipt reuse',s=>s.jobs['replacement-test'].reuse_receipt_id='old-receipt'],
  ['terminal receipt reused_from',s=>s.records['replacement-receipt'].development.reused_from='old-receipt'],
  ['terminal receipt reuse_qualification',s=>s.records['replacement-receipt'].development.reuse_qualification=scopedReference(s.records['old-receipt'])],
  ['terminal receipt reuse_qualification_producer',s=>s.records['replacement-receipt'].development.reuse_qualification_producer='other'],
  ['terminal receipt reuse_candidate_producer',s=>s.records['replacement-receipt'].development.reuse_candidate_producer='other'],
  ['terminal result claims reused',s=>s.records['replacement-receipt'].development.result.reused=true],
  ['terminal result claims reused_from',s=>s.records['replacement-receipt'].development.result.reused_from='old-receipt'],
  ['terminal result hash',s=>s.records['replacement-receipt'].development.receipt_sha256='0'.repeat(64),false],
  ['terminal result body without its matching hash',s=>s.records['replacement-receipt'].development.result.stdout+=' changed',false],
  ['terminal content without its matching result',s=>s.records['replacement-receipt'].content+=' changed',false]
 ];
 for(const [name,change,reseal=true]of cases)await t.test(name,()=>{
  const s=fixture();change(s);if(reseal&&s.records['replacement-receipt'])sealTerminal(s);rejects(s);
 });
 await t.test('quarantined receipt row must remain Quarantined',()=>{const s=fixture({replacement:'quarantined'});s.records['replacement-receipt'].status='Submitted';rejects(s);});
});
