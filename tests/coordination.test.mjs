import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../plugins/soloco/runtime/store.mjs';
import { normalizeCoordination,bindCoordination,coordinationEligible,resourceClaims } from '../plugins/soloco/runtime/coordination.mjs';

function fixture() {
 const artifact={id:'output',kind:'artifact',revision:1,status:'Submitted',job_id:'producer',author_instance:'author',content:'Exact prepared input'};
 return {records:{output:artifact},jobs:{producer:{id:'producer',instance_id:'author',native_id:'native-author',epoch:1,status:'completed',artifact_id:'output'}}};
}
function dependent(s,args={}) {
 const coordination=bindCoordination(s,{depends_on:['producer'],...args});
 return {id:'dependent',status:'queued',inputs:coordination.dependencies.map(d=>({id:d.artifact_id,revision:d.revision})),coordination};
}
test('legacy dispatch stays compatible; bounded identifiers reject ambiguous declarations',()=>{
 assert.deepEqual(normalizeCoordination(),{depends_on:[],resources:[]});assert.equal(bindCoordination(fixture(),{}),null);
 for(const value of [null,'producer',[''],['producer','producer'],Array(17).fill('x'),['with space']])assert.throws(()=>normalizeCoordination({depends_on:value}));
 assert.throws(()=>normalizeCoordination({resources:['shared','shared']}));
});
test('dependencies bind completed producer, epoch, output bytes and mandatory context input',()=>{
 const s=fixture(),job=dependent(s);assert.equal(coordinationEligible(s,job),true);
 for(const mutate of [
  x=>x.jobs.producer.status='running',x=>x.jobs.producer.status='quarantined',
  x=>x.jobs.producer.epoch=2,x=>x.jobs.producer.artifact_id='different',
  x=>x.records.output.author_instance='other',x=>x.records.output.content='Mutated without revision',
  x=>x.records.output.status='Quarantined',x=>x.jobs.producer.inputs=[{id:'missing-input',revision:1}]
 ]) {const copy=structuredClone(s);mutate(copy);assert.throws(()=>coordinationEligible(copy,job));}
 assert.throws(()=>coordinationEligible(s,{...job,inputs:[]}));
});
test('review readiness requires exact subject and independent Pass but does not grant acceptance',()=>{
 const s=fixture();s.records.review={id:'review',revision:1,kind:'review',status:'Submitted',job_id:'reviewer',author_instance:'qa-instance',content:'Independent review',review_of:{id:'output',revision:1},review:{verdict:'Pass',blockers:[]}};
 s.jobs.reviewer={id:'reviewer',instance_id:'qa-instance',native_id:'native-qa',epoch:1,status:'completed',artifact_id:'review',review_of:{id:'output',revision:1}};
 const job=dependent(s,{depends_on:['reviewer']});assert.equal(coordinationEligible(s,job),true);
 assert.equal(s.records.review.review.permitted_action,undefined);
 for(const mutate of [x=>x.records.review.review.verdict='Fail',x=>x.records.review.review.blockers=['Unresolved'],x=>x.records.output.content='Changed',x=>x.records.output.revision=2,x=>x.jobs.reviewer.native_id='native-author',x=>delete x.jobs.reviewer.native_id,x=>x.jobs.reviewer.native_id=x.records.output.author_instance]) {
  const copy=structuredClone(s);mutate(copy);assert.throws(()=>coordinationEligible(copy,job));
 }
});
test('software-test prerequisites require real canonical receipt/candidate producer bindings',()=>{
 const s=fixture(),files=[{path:'candidate.mjs',content:'export const x=1;'}],hash=digest(JSON.stringify(files)),result={status:'passed',exit_code:0,tests_executed:true,candidate_sha256:hash,test_paths:['candidate.test.mjs']};
 s.records.plan={id:'plan',development:{type:'plan',scope_sha256:'scope',scope:{test_paths:['candidate.test.mjs']}}};
 s.records.candidate={id:'candidate',status:'Submitted',author_instance:'author',job_id:'producer',development:{type:'candidate',plan_id:'plan',scope_sha256:'scope',files,candidate_sha256:hash,run:{job_id:'tests',receipt_id:'receipt',status:'completed'}}};
 s.jobs.producer.artifact_id='candidate';
 s.records.receipt={id:'receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'tests',development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256:hash,result,receipt_sha256:digest(JSON.stringify(result))}};
 s.jobs.tests={id:'tests',epoch:1,status:'completed',kind:'development_test',artifact_id:'receipt',development_id:'plan',candidate_id:'candidate'};
 const job=dependent(s,{depends_on:['tests']});assert.equal(coordinationEligible(s,job),true);
 s.records.review={id:'review',revision:1,kind:'review',status:'Submitted',job_id:'qa-job',author_instance:'qa-instance',review_of:{id:'receipt',revision:1},review:{verdict:'Pass',blockers:[],permitted_action:'accept_local_development',candidate_sha256:hash,receipt_sha256:s.records.receipt.development.receipt_sha256}};
 s.jobs['qa-job']={id:'qa-job',instance_id:'qa-instance',native_id:'native-qa',epoch:1,status:'completed',artifact_id:'review',review_of:{id:'receipt',revision:1}};
 const reviewed=dependent(s,{depends_on:['qa-job']});assert.equal(coordinationEligible(s,reviewed),true);
 const unbound=structuredClone(s);delete unbound.records.review.review.receipt_sha256;assert.throws(()=>bindCoordination(unbound,{depends_on:['qa-job']}),/binding/);
 const self=structuredClone(s);self.jobs['qa-job'].native_id='native-author';assert.throws(()=>bindCoordination(self,{depends_on:['qa-job']}),/independent/);

 for(const mutate of [x=>x.records.receipt.development.result.tests_executed=false,x=>x.records.candidate.development.run.receipt_id='different',x=>x.jobs.tests.candidate_id='other',x=>x.records.receipt.author_role='engineer',x=>{x.records.receipt.development.result.candidate_sha256='different';x.records.receipt.development.receipt_sha256=digest(JSON.stringify(x.records.receipt.development.result));},x=>x.records.candidate.development.files[0].content='tampered',x=>x.records.plan.development.scope.test_paths=['other.test.mjs'],x=>x.records.candidate.status='Quarantined']) {
  const copy=structuredClone(s);mutate(copy);assert.throws(()=>coordinationEligible(copy,job));
 }
});
test('disjoint resources run concurrently; cancelled uncertain work continues to hold claims',()=>{
 const s=fixture(),first=dependent(s,{resources:['workspace/a']});s.jobs[first.id]=first;
 assert.throws(()=>bindCoordination(s,{resources:['workspace/a']}),/reserved/);
 assert.ok(bindCoordination(s,{resources:['workspace/b']}));
 first.status='cancelled';assert.equal(resourceClaims(s)[0].termination_unverified,true);
 assert.throws(()=>bindCoordination(s,{resources:['workspace/a']}),/reserved/);
 first.coordination_release={termination_confirmed:false};assert.throws(()=>bindCoordination(s,{resources:['workspace/a']}));
 first.coordination_release={termination_confirmed:true};assert.ok(bindCoordination(s,{resources:['workspace/a']}));
 first.status='running';assert.throws(()=>bindCoordination(s,{resources:['workspace/a']}));
});
test('resource conflict arising after admission invalidates dependent launch/publication',()=>{
 const s=fixture(),job=dependent(s,{resources:['fixture']});
 s.jobs.other={id:'other',status:'running',coordination:{version:1,dependencies:[],resources:['fixture']}};
 assert.throws(()=>coordinationEligible(s,job),/Conflicting/);
});

test('behavior evaluation covers proportionate delegation, parallel checks, authority and concise notices',async()=>{
 const {coordinationCases,gradeCoordination,buildCoordinationPrompt}=await import('../tools/coordination-eval.mjs');
 const value={decisions:coordinationCases.map(c=>({id:c.id,...c.expected,reason:'Evidence-specific rationale'}))};
 assert.equal(gradeCoordination(value).passed,true);
 const wrong=structuredClone(value);wrong.decisions.find(d=>d.id==='material-update').show_notice=false;
 assert.equal(gradeCoordination(wrong).passed,false);
 const ceremony=structuredClone(value);ceremony.decisions.find(d=>d.id==='covered-repair').ask_founder=true;
 assert.equal(gradeCoordination(ceremony).passed,false);
 assert.doesNotMatch(buildCoordinationPrompt('policy'),/"expected"/);
});
