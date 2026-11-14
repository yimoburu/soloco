import {seedPreexistingLegacyData} from './preexisting-legacy-data-fixture.mjs';
// Controlled source fixtures in REAL temporary Stores. These tests invoke no
// model, child executor, product company or canonical validation API. The small
// synthetic historical receipt is test data, never actual P4/326 evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest,id,installedTeam,teamHash,VERSION,withStore,Store} from '../plugins/soloco/runtime/store.mjs';
import {validationManifest} from '../plugins/soloco/runtime/validation-cache.mjs';
import {developmentReviewAuthority,developmentReviewSubject} from '../plugins/soloco/runtime/develop.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {fits,rpcReply,toolResult} from '../plugins/soloco/runtime/public-response.mjs';
import {developmentDeliveryAction,DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL,developmentDeliverySnapshotValue,createDevelopmentDeliveryContract,DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL} from '../plugins/soloco/runtime/development-delivery.mjs';
import {prepareReviewContinuation,authorizeReviewContinuation,reviewContinuationSubject,reviewContinuationAssignment,reviewContinuationContextInputs,reviewContinuationCandidate,reviewContinuationRequiredEvidence,validateReviewContinuationPublication,acceptReviewContinuation,developmentReviewContinuationAction} from '../plugins/soloco/runtime/development-review-continuation.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-review-continuation-')),oldData=process.env.COMPANY_PLUGIN_DATA;
process.env.COMPANY_PLUGIN_DATA=path.join(base,'isolated-registry');
test.after(()=>{if(oldData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=oldData;fs.rmSync(base,{recursive:true,force:true});});
const hash=x=>digest(JSON.stringify(x)),read=a=>withStore(a.root,db=>db.read());
async function publicReport(a,source){let text='',offset=0;do{const page=await call('company_context',{root:a.root,session_id:a.session_id,epoch:a.epoch,action:'read',id:source.record.id,sha256:source.record.sha256,offset,length:16000},'codex');assert.equal(page.offset,text.length);assert.equal(page.sha256,source.record.sha256);text+=page.text;offset=page.next_offset;}while(offset!==null);assert.equal(digest(text),source.record.sha256);const report=source.path_in_record.reduce((value,key)=>value[key],JSON.parse(text));assert.equal(hash(report),source.sha256);return report;}
const change=(a,fn)=>withStore(a.root,db=>db.transaction('controlled.continuation-fixture',s=>{fn(s);return s;}));
function fixture({recovery=true,legacy=true,delivery=false}={}) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(base,'case-'))),a={root,session_id:id('owner'),host:'codex',epoch:1},team=installedTeam();
  const originals=[{path:'helper.mjs',content:'export const helper=1;\n'},{path:'value.mjs',content:'export const value=0;\n'},{path:'value.test.mjs',content:'// Controlled historical test source, never executed by this fixture.\n'}],files=structuredClone(originals);files[1].content='export const value=42;\n';
  for(const f of originals)fs.writeFileSync(path.join(root,f.path),f.content);
  const scope={read_paths:originals.map(f=>f.path),write_paths:['value.mjs'],test_paths:['value.test.mjs'],sources:originals.map(f=>({...f,sha256:digest(f.content)})),max_bytes:20000,max_attempts:2,timeout_ms:1000,max_output_bytes:10000,transport_max_characters:360000,expires_at:'2001-01-01T00:00:00.000Z',acceptance:'All scoped controlled code and strong assertions.',stop_conditions:'No execution or integration rights from review.',data_policy:'Synthetic controlled fixtures only.',output_format:'patches'};
  if(delivery){const contact=name=>({host:'codex',session_id:'controlled-'+name,name});scope.delivery_contract=createDevelopmentDeliveryContract({records:{}},scope,{protocol:DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL,interfaces:[],dependency_refs:[],required_test_roots:scope.test_paths,integrator:contact('integrator'),observer:contact('observer'),installer:contact('installer')});}
  const patch={path:'value.mjs',base_sha256:digest(originals[1].content),edits:[{start:0,end:originals[1].content.length,text:files[1].content}]};
  const p={id:'plan',kind:'artifact',revision:1,status:'Draft',content:'Expired original controlled scope.',development:{type:'plan',scope,scope_sha256:hash(scope),attempts:['old-generation-1','producer']}};
  const producer={id:'producer',role:'engineer',instance_id:'engineer-original',native_id:'native-original',status:'completed',development_id:p.id,artifact_id:'candidate',inputs:[],supplemental_sources:[],coordination_release:{termination_confirmed:true,reason:'model_process_closed'}};
  const c={id:'candidate',kind:'artifact',revision:1,status:'Submitted',author_role:'engineer',author_instance:producer.instance_id,job_id:producer.id,content:'Native controlled candidate fixture.',development:{type:'candidate',plan_id:p.id,scope_sha256:p.development.scope_sha256,files,candidate_sha256:hash(files),generation:{format:'patches',patches:[patch],patch_sha256:hash([patch])},run:{job_id:'controller',status:'completed',receipt_id:'receipt'}}};
  const directory=path.join(root,'.company','development',p.id,c.id,'source');fs.mkdirSync(directory,{recursive:true});for(const f of files)fs.writeFileSync(path.join(directory,f.path),f.content);
  const manifest=validationManifest({files:files.map(f=>({path:f.path,sha256:digest(f.content)})),tests:scope.test_paths,command:['node','--test','./value.test.mjs'],runtime:{node:'controlled-historical-node',platform:'controlled',arch:'controlled',os_release:'controlled',system_build:'controlled',dependencies:[{path:'/controlled/node',sha256:digest('node')}],executable_sha256:digest('node'),runner_sha256:digest('historical-runner')},sandbox:{backend:'controlled-historical-fixture',policy_sha256:digest('policy')},environment:{LANG:'C'},limits:{timeout_ms:1000,max_output_bytes:10000}});
  const result={status:'passed',exit_code:0,tests_executed:true,signal:null,output_truncated:false,stdout:'Controlled historical fixture only; no tests executed by fixture construction.',stderr:'',directory,test_paths:scope.test_paths,timeout_ms:1000,max_output_bytes:10000,validation_manifest_sha256:hash(manifest)};
  const t={id:'receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'controller',content:JSON.stringify(result),development:{type:'test',plan_id:p.id,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,result,receipt_sha256:hash(result),validation_manifest:manifest,validation_fingerprint:manifest.validation_fingerprint}};
  const old={id:'old-failed-receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'old-controller',content:'Controlled original preflight failure',development:{type:'test',receipt_sha256:digest('old-result'),result:{status:'failed',tests_executed:false}}};
  const oldController={id:'old-controller',kind:'development_test',status:'completed',artifact_id:old.id};
  const controller={id:'controller',kind:'development_test',status:'completed',artifact_id:t.id,candidate_id:c.id,development_id:p.id};
  const contract={id:'contract',kind:'artifact',revision:1,status:'Draft',content:'Whole contract '+'x'.repeat(120)};
  const oldQA={id:'prior-unknown',role:'qa',instance_id:'qa-old',native_id:'native-old-unknown',status:'failed',started_at:'2001-01-01T00:00:00.000Z',session_key:'qa:review:receipt:1',review_of:{id:t.id,revision:1},inputs:[{id:'contract',revision:1}],supplemental_sources:[],execution_failure:{termination_confirmed:false,outcome:'timeout',code:'ROLE_TIMEOUT'}};
  const failureHome={id:'failure-home',kind:'artifact',revision:1,status:'Draft',content:JSON.stringify({canonical_public_terminal_job:{complete_data:{value:oldQA}}})};
  const records={plan:p,candidate:c,receipt:t,contract,'failure-home':failureHome},jobs={producer,'controller':controller,'prior-unknown':oldQA};
  withStore(root,db=>seedPreexistingLegacyData(db,'controlled.company.created',()=>({schema:2,runtime_version:VERSION,id:id('company'),name:'Controlled continuation source test',idea:'No product authority',phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:a.session_id,epoch:1},records,sessions:{[oldQA.session_key]:{instance_id:oldQA.instance_id,native_id:oldQA.native_id}},jobs,messages:[],notices:[],created_at:new Date().toISOString()})),true);
  change(a,s=>{
    p.development.authorization={decision_id:'old-authorization',authority_sha256:developmentReviewAuthority(s,p.id)};
    s.records[p.id]=p;
    if(recovery) {
      const diagResult={status:'passed',tests_executed:false,launch_intent:false},diag={id:'diagnostic',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'diagnostic-controller',content:JSON.stringify(diagResult),development:{type:'preflight_diagnostic',result:diagResult,receipt_sha256:hash(diagResult)}};
      s.records[old.id]=old;s.jobs[oldController.id]=oldController;s.records[diag.id]=diag;s.jobs[diag.author_instance]={id:diag.author_instance,kind:'development_preflight',status:'completed',artifact_id:diag.id};
      const originalCandidate=structuredClone(s.records.candidate);originalCandidate.development.run={job_id:oldController.id,status:'completed',receipt_id:old.id};
      const proof=legacy?{legacy:{id:'legacy-qa',revision:1,sha256:null,producer_sha256:null,evidence:[],input_records:[],context_sha256:digest('historical-context'),candidate_record_sha256:hash(originalCandidate),candidate_run:originalCandidate.development.run}}:{execution_provenance:{protocol:'controlled-zero-launch'}};
      if(legacy) {
        const target={id:'legacy-target',kind:'artifact',revision:1,status:'Submitted',content:'Controlled complete historical qualification target'};
        const qj={id:'legacy-qa-job',role:'qa',instance_id:'legacy-reviewer',native_id:'legacy-native',status:'completed',artifact_id:'legacy-qa',coordination_release:{termination_confirmed:true},context_sha256:proof.legacy.context_sha256};
        const q={id:'legacy-qa',kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:qj.instance_id,job_id:qj.id,review_of:{id:target.id,revision:1},review:{verdict:'Pass',permitted_action:'qualify_preflight_recovery',blockers:[],preflight_recovery:{receipt_sha256:old.development.receipt_sha256,candidate_sha256:c.development.candidate_sha256,target_sha256:hash(target),basis:'qualified-exact-source-first-fingerprint-inference',uncertainty:'historical-launch-not-attested'}}};
        s.records[target.id]=target;s.records[q.id]=q;s.jobs[qj.id]=qj;proof.legacy.sha256=hash(q);proof.legacy.producer_sha256=hash(qj);
      } else old.development.result.execution_provenance=proof.execution_provenance;
      const r={type:'preflight_recovery_request',protocol:'original-grant-validation-recovery-v1',subject:{plan_id:p.id,scope_sha256:p.development.scope_sha256,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,receipt_id:old.id,receipt_sha256:old.development.receipt_sha256,receipt_record_sha256:hash(old),job_id:oldController.id,job_sha256:hash(oldController)},proof,diagnostic_id:diag.id,diagnostic_sha256:diag.development.receipt_sha256,authority_sha256:p.development.authorization.authority_sha256,expires_at:scope.expires_at,status:'consumed',job_id:controller.id,generation_permission:false,allowance_reset:false};
      s.records.recovery={id:'recovery',kind:'artifact',revision:1,status:'Recorded',author_role:'human_founder',content:'Controlled historical consumed recovery',development:r};
      s.records.receipt.development.preflight_recovery_id='recovery';s.records.candidate.development.preflight_recovery='recovery';s.records.candidate.development.run_history=[originalCandidate.development.run];
    }
  });
  return {...a,plan_id:p.id,candidate_id:c.id,receipt_id:t.id,receipt_sha256:t.development.receipt_sha256,prior_job_id:oldQA.id,prior_job_sha256:hash(oldQA),failure_evidence_id:failureHome.id,source_instruction:'CONTROLLED NEW HUMAN PRIMARY FIXTURE: one read-only review and local acceptance, explicit old UNKNOWN reservation retained.',approval_reference:id('controlled-primary-approval'),model_data_approved:true,unknown_prior_replacement_approved:true,expires_at:new Date(Date.now()+3600000).toISOString(),code_review_window_minutes:30};
}
function authorized(a) {const proposal=prepareReviewContinuation(read(a),a,a.root);let t;change(a,s=>{t=authorizeReviewContinuation(s,{...a,proposal_sha256:hash(proposal)},a.root);});return t;}
function queued(a,t,{defer=true}={}) {
  const state=read(a),required=reviewContinuationRequiredEvidence(state,t,{root:a.root});
  const job={id:id('controlled-qa'),role:'qa',instance_id:id('controlled-qa-instance'),native_id:null,host:'codex',epoch:1,status:'queued',review_of:{id:t.id,revision:t.revision},session_key:`qa:review:${t.id}:${t.revision}`,code_review_window_minutes:30,timeout_ms:600000,task:'Controlled complete code review, no tools or actual model.',context_format:3,inputs:required.filter(r=>!defer||r.id!=='contract').map(r=>({id:r.id,revision:r.revision})),supplemental_sources:defer?[required.find(r=>r.id==='contract')]:[]};
  reviewContinuationAssignment(state,job,{reserve:true,root:a.root});
  const context=assignmentContext(state,job);job.inputs=context.inputs;job.context_sha256=context.hash;
  change(a,s=>{s.jobs[job.id]=job;s.sessions[job.session_key]={instance_id:job.instance_id,native_id:null};});return job.id;
}
function closedPair(a,key,{defer=true}={}) {
  const s=read(a),j=structuredClone(s.jobs[key]),target=s.records[j.review_of.id],p=target.development.proposal,native='controlled-new-independent-native';
  j.status='completed';j.native_id=native;j.execution_started_at=new Date(Date.now()-100).toISOString();j.execution_deadline_at=new Date(Date.parse(j.execution_started_at)+1800000).toISOString();j.finished_at=new Date().toISOString();j.coordination_release={termination_confirmed:true,reason:'model_process_closed',at:j.finished_at};j.artifact_id=id('controlled-review');
  j.delivered_record_reads={version:1,protocol:'record-reads-v1-runtime-delivery',native_id:native,initial_delivery:{assignment_context_sha256:j.context_sha256,request_sha256:digest('controlled-initial-request'),delivered_at:new Date().toISOString()},ranges:[]};
  if(defer){const r=reviewContinuationRequiredEvidence(s,target,{root:a.root}).find(r=>r.id==='contract'),text=JSON.stringify(s.records.contract),middle=Math.floor(text.length/2);for(const [round,offset,length] of [[1,0,middle],[2,middle,text.length-middle]])j.delivered_record_reads.ranges.push({...r,offset,length,range_sha256:digest(text.slice(offset,offset+length)),request_sha256:digest('controlled-request-'+round),round,delivered_at:new Date().toISOString()});}
  const record={id:j.artifact_id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:j.instance_id,job_id:j.id,review_of:j.review_of,content:'Controlled review response fixture, not actual code acceptance.',review:{verdict:'Pass',reason:'All controlled fixture bindings checked.',permitted_action:'accept_local_development',candidate_sha256:p.subject.candidate_sha256,receipt_sha256:p.subject.receipt_sha256,continuation_target_sha256:hash(target),continuation_grant_sha256:target.development.authorization.decision.sha256,continuation_authorization_sha256:target.development.authorization.authority_sha256,blockers:[]}};
  j.finished_at=new Date().toISOString();j.coordination_release.at=j.finished_at;
  return {j,record};
}
function publish(a,pair) {change(a,s=>{validateReviewContinuationPublication(s,pair.j,pair.record,{root:a.root});s.jobs[pair.j.id]=pair.j;s.records[pair.record.id]=pair.record;});}

test('expired historical source remains valid without old/current authority equality or rerun',()=>{
  const a=fixture(),before=read(a),subject=developmentReviewSubject(before,a,a.root),t=authorized(a),after=read(a);
  assert.equal(subject.receipt.development.result.tests_executed,true);assert.notEqual(t.development.authorization.authority_sha256,before.records.plan.development.authorization.authority_sha256);
  for(const key of Object.keys(before.records))assert.deepEqual(after.records[key],before.records[key],key);
  assert.deepEqual(after.jobs,before.jobs);assert.deepEqual(after.sessions,before.sessions);assert.equal(t.development.proposal.subject.generations_spent,2);assert.equal(t.development.proposal.subject.generations_remaining,0);
  assert.deepEqual(reviewContinuationContextInputs(after,t),['receipt']);assert.equal(reviewContinuationCandidate(after,t).id,'candidate');
});
test('real Store action creates protected proposal and grant, no duplicate primary approval mint',()=>{
  const a=fixture(),proposal=developmentReviewContinuationAction({...a,action:'prepare_review_continuation'},'codex');
  const t=developmentReviewContinuationAction({...a,action:'authorize_review_continuation',proposal_sha256:hash(proposal)},'codex');
  assert.equal(t.development.type,'review_continuation');const before=read(a);assert.throws(()=>developmentReviewContinuationAction({...a,action:'authorize_review_continuation',proposal_sha256:hash(proposal)},'codex'),/already recorded/);assert.deepEqual(read(a),before);
});
test('read-only proposal is concrete before new human consent; authorization cannot infer that consent',()=>{
  const a=fixture(),before=read(a);delete a.source_instruction;delete a.approval_reference;delete a.model_data_approved;delete a.unknown_prior_replacement_approved;
  const proposal=developmentReviewContinuationAction({...a,action:'prepare_review_continuation'},'codex');assert.equal(proposal.max_review_attempts,1);assert.deepEqual(read(a),before);
  assert.throws(()=>developmentReviewContinuationAction({...a,action:'authorize_review_continuation',proposal_sha256:hash(proposal)},'codex'),/primary source_instruction/);assert.deepEqual(read(a),before);
});
for(const [label,mutate] of [['data approval',a=>a.model_data_approved=false],['UNKNOWN exception',a=>a.unknown_prior_replacement_approved=false],['primary reference',a=>a.approval_reference='']])test('authorization rejects missing/wrong '+label,()=>{const a=fixture(),proposal=prepareReviewContinuation(read(a),a,a.root);mutate(a);assert.throws(()=>change(a,s=>authorizeReviewContinuation(s,{...a,proposal_sha256:hash(proposal)},a.root)));});
for(const [label,mutate] of [['new deadline',a=>a.expires_at='2000-01-01'],['old job exact hash',a=>a.prior_job_sha256=digest('wrong')],['owner',a=>a.session_id='another-owner']])test('proposal rejects missing/wrong '+label,()=>{const a=fixture();mutate(a);assert.throws(()=>prepareReviewContinuation(read(a),a,a.root));});
test('proposal replay with different approval reference cannot duplicate exact UNKNOWN exception',()=>{const a=fixture();authorized(a);a.approval_reference=id('different-primary');const proposal=prepareReviewContinuation(read(a),a,a.root);assert.throws(()=>change(a,s=>authorizeReviewContinuation(s,{...a,proposal_sha256:hash(proposal)},a.root)),/already has a continuation/);});
test('one new QA reservation is derived from jobs without mutating immutable target or old reservation',()=>{
  const a=fixture(),t=authorized(a),before=read(a),key=queued(a,t),after=read(a);
  assert.deepEqual(after.records[t.id],t);assert.deepEqual(after.jobs['prior-unknown'],before.jobs['prior-unknown']);assert.deepEqual(after.sessions['qa:review:receipt:1'],before.sessions['qa:review:receipt:1']);
  assert.equal(Object.values(after.jobs).filter(j=>['queued','running'].includes(j.status)||j.started_at&&j.status==='failed'&&!j.coordination_release?.termination_confirmed).length,2);
  assert.throws(()=>queued(a,t),/one-review allowance/);assert.throws(()=>reviewContinuationSubject(after,{role:'qa',review_of:t.id},{root:a.root}),/ONE fresh/);assert.equal(reviewContinuationAssignment(after,after.jobs[key],{root:a.root}).id,t.id);
});
test('whole closed two-round delivery and exact new-target Pass permit separate local acceptance only',()=>{
  const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key),before=read(a);publish(a,pair);
  const accepted=developmentReviewContinuationAction({...a,action:'accept_review_continuation',target_id:t.id,target_sha256:hash(t),review_id:pair.record.id,candidate_sha256:t.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},'codex'),after=read(a);
  assert.equal(accepted.development.source_integrated,false);assert.equal(accepted.development.old_unknown_reservation_preserved,true);
  for(const key of ['plan','candidate','receipt','recovery','old-failed-receipt'])assert.deepEqual(after.records[key],before.records[key],key);assert.deepEqual(after.jobs['prior-unknown'],before.jobs['prior-unknown']);assert.deepEqual(after.records[t.id],t);
  assert.throws(()=>change(a,s=>acceptReviewContinuation(s,{...a,target_id:t.id,target_sha256:hash(t),review_id:pair.record.id,candidate_sha256:t.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},a.root)),/already locally accepted/);
});
test('all-inline still requires closed initial delivery marker; retrieval journal is never delivery',()=>{
  const a=fixture(),t=authorized(a),key=queued(a,t,{defer:false}),pair=closedPair(a,key,{defer:false});assert.doesNotThrow(()=>validateReviewContinuationPublication(read(a),pair.j,pair.record,{root:a.root}));delete pair.j.delivered_record_reads.initial_delivery;assert.throws(()=>validateReviewContinuationPublication(read(a),pair.j,pair.record,{root:a.root}),/initial\/range delivery/);
  const b=fixture(),u=authorized(b),k=queued(b,u),p=closedPair(b,k);p.j.retrieved_inputs=p.j.delivered_record_reads.ranges;p.j.delivered_record_reads.ranges.pop();assert.throws(()=>validateReviewContinuationPublication(read(b),p.j,p.record,{root:b.root}),/not delivered/);
});
test('own earlier adapter-observed negative blocks a later selected Pass before publication',()=>{const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key);pair.j.model_evidence={cli_observed_negative_outputs:[JSON.stringify({review:{verdict:'Fail',reason:'Earlier exact-subject negative'}})]};assert.throws(()=>validateReviewContinuationPublication(read(a),pair.j,pair.record,{root:a.root}),/adapter-observed negative/);assert.equal(read(a).jobs[key].status,'queued');});
test('honest closed Fail/Blocked publishes as negative evidence and never permits local acceptance',()=>{
  for(const verdict of ['Fail','Blocked']){const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key);pair.record.review.verdict=verdict;pair.record.review.permitted_action='hold';pair.record.review.blockers=['Concrete controlled blocker'];pair.j.delivered_record_reads.ranges=[];pair.j.model_evidence={cli_observed_negative_outputs:[JSON.stringify({review:{verdict}})]};publish(a,pair);assert.equal(read(a).records[pair.record.id].review.verdict,verdict);assert.throws(()=>change(a,s=>acceptReviewContinuation(s,{...a,target_id:t.id,target_sha256:hash(t),review_id:pair.record.id,candidate_sha256:t.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},a.root)));}
});
test('deadline crossing during synchronous publication validation cannot publish',()=>{
  const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key),now=Date.now,cut=Date.parse(a.expires_at);let samples=0;
  try{Date.now=()=>++samples<3?now():cut+1;assert.throws(()=>validateReviewContinuationPublication(read(a),pair.j,pair.record,{root:a.root}),/expired/);}finally{Date.now=now;}
  assert.ok(samples>=3);assert.equal(read(a).records[pair.record.id],undefined);
});
test('deadline crossing after validation cannot commit separate local acceptance',()=>{
  const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key);publish(a,pair);const now=Date.now,cut=Date.parse(a.expires_at);let samples=0;
  try{Date.now=()=>++samples<4?now():cut+1;assert.throws(()=>change(a,s=>acceptReviewContinuation(s,{...a,target_id:t.id,target_sha256:hash(t),review_id:pair.record.id,candidate_sha256:t.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},a.root)),/expired/);}finally{Date.now=now;}
  assert.ok(samples>=4);assert.equal(Object.values(read(a).records).filter(r=>r.development?.type==='review_continuation_acceptance').length,0);
});
for(const [label,mutate] of [['native identity',p=>p.j.native_id='native-original'],['unclosed process',p=>delete p.j.coordination_release],['wrong initial context',p=>p.j.delivered_record_reads.initial_delivery.assignment_context_sha256=digest('other')],['range gap',p=>p.j.delivered_record_reads.ranges[1].offset++],['range hash',p=>p.j.delivered_record_reads.ranges[0].range_sha256=digest('wrong')],['source hash',p=>p.j.delivered_record_reads.ranges[0].sha256=digest('wrong')],['target binding',p=>p.record.review.continuation_target_sha256=digest('wrong')],['new authority binding',p=>p.record.review.continuation_authorization_sha256=digest('wrong')],['candidate binding',p=>p.record.review.candidate_sha256=digest('wrong')],['receipt binding',p=>p.record.review.receipt_sha256=digest('wrong')],['blocker',p=>p.record.review.blockers=['still held']]])test('publication holds '+label,()=>{const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key);mutate(pair);assert.throws(()=>validateReviewContinuationPublication(read(a),pair.j,pair.record,{root:a.root}));});
for(const [label,mutate] of [['scope source',s=>s.records.plan.development.scope.sources[0].content+='tamper'],['manifest',s=>s.records.receipt.development.validation_manifest.files.pop()],['missing manifest',s=>delete s.records.receipt.development.validation_manifest],['canonical controller',s=>s.jobs.controller.artifact_id='other'],['recovery consumed status',s=>s.records.recovery.development.status='queued'],['recovery old receipt',s=>s.records['old-failed-receipt'].content+='tamper'],['legacy qualifier',s=>s.records['legacy-qa'].review.preflight_recovery.uncertainty='certain'],['historical producer closure',s=>delete s.jobs.producer.coordination_release]])test('historical verifier holds changed '+label,()=>{const a=fixture();change(a,mutate);assert.throws(()=>prepareReviewContinuation(read(a),a,a.root));});
test('actual source/materialized bytes and cumulative patches are checked independently',()=>{const a=fixture();fs.appendFileSync(path.join(a.root,'helper.mjs'),'// changed');assert.throws(()=>prepareReviewContinuation(read(a),a,a.root),/Original source changed/);const b=fixture();fs.appendFileSync(path.join(b.root,'.company/development/plan/candidate/source/value.mjs'),'// changed');assert.throws(()=>prepareReviewContinuation(read(b),b,b.root),/Candidate bytes changed/);const c=fixture();change(c,s=>s.records.candidate.development.generation.patches[0].edits[0].text+='// changed');assert.throws(()=>prepareReviewContinuation(read(c),c,c.root),/patches/);});
test('new current authority, expired continuation or altered old UNKNOWN remain holds',()=>{for(const variant of ['authority','old-job','old-session']){const a=fixture(),t=authorized(a);change(a,s=>{if(variant==='authority')s.records.newDecision={id:'newDecision',kind:'decision',content:'Changed authority'};if(variant==='old-job')s.jobs['prior-unknown'].coordination_release={termination_confirmed:true};if(variant==='old-session')s.sessions['qa:review:receipt:1'].native_id='replacement';});assert.throws(()=>reviewContinuationSubject(read(a),{role:'qa',review_of:t.id},{root:a.root}));}});
test('direct, equivalent-window, quarantined and rejected negatives cannot be laundered; other candidate history remains evidence',()=>{
  for(const variant of ['direct','equivalent','quarantined','rejected','uncertain']) {
    const a=fixture();change(a,s=>{
      const target=variant==='equivalent'?'same-bytes-receipt':'receipt';
      if(variant==='equivalent')s.records[target]={id:target,development:{type:'test',candidate_id:'different-id',candidate_sha256:s.records.candidate.development.candidate_sha256}};
      if(variant==='rejected'||variant==='uncertain')s.jobs.newNegative={id:'newNegative',role:'qa',review_of:{id:'receipt',revision:1},status:'failed',rejected_output:{text:variant==='rejected'?JSON.stringify({review:{verdict:'Fail'}}):'{invalid',truncated:false}};
      else s.records.negative={id:'negative',kind:'review',status:variant==='quarantined'?'Quarantined':'Submitted',review_of:{id:target,revision:1},review:{verdict:'Fail'}};
    });assert.throws(()=>prepareReviewContinuation(read(a),a,a.root),/failed\/blocked|rejected or uncertain/);
  }
  const a=fixture();change(a,s=>{s.records.otherReceipt={id:'otherReceipt',development:{type:'test',candidate_id:'other',candidate_sha256:digest('other')}};s.records.old239c={id:'old239c',kind:'review',status:'Submitted',review_of:{id:'otherReceipt',revision:1},review:{verdict:'Fail'}};});assert.doesNotThrow(()=>prepareReviewContinuation(read(a),a,a.root));assert.equal(read(a).records.old239c.review.verdict,'Fail');
});
test('continuation cannot generate/test/reuse/refund or impersonate another role',()=>{
  const a=fixture(),t=authorized(a);assert.deepEqual(t.development.proposal.requested_permissions,{review:true,accept_local_development:true,generation:false,test_execution:false,validation_reuse:false,recovery:false,source_integration:false,allowance_reset:false,prior_release:false});
  for(const role of ['engineer','research'])assert.throws(()=>reviewContinuationSubject(read(a),{role,review_of:t.id},{root:a.root}),/independent QA only/);
  assert.throws(()=>developmentReviewContinuationAction({...a,action:'run'},'codex'),/Unknown continuation action/);
});
test('nonlegacy historical recovery proof remains checkable without current fingerprint invocation',()=>{const a=fixture({legacy:false});assert.doesNotThrow(()=>prepareReviewContinuation(read(a),a,a.root));});
test('compact manifest derives the identical whole source set and names full failure evidence without granting permission',()=>{
  const a=fixture(),proposal=prepareReviewContinuation(read(a),a,a.root),t=authorized(a),refs=reviewContinuationRequiredEvidence(read(a),t,{root:a.root});
  assert.equal(proposal.status,'proposal_only_not_authorized');assert.equal(Object.hasOwn(proposal,'permissions'),false);assert.equal(Object.hasOwn(proposal,'required_evidence'),false);
  const expected=['plan','candidate','receipt','recovery','old-failed-receipt','diagnostic','legacy-qa','legacy-target','contract','failure-home'].sort();assert.deepEqual(refs.map(r=>r.id),expected);
  assert.deepEqual(proposal.required_evidence_manifest,{protocol:'deterministic-prior-review-evidence-v1',count:refs.length,sha256:hash(refs)});assert.equal(proposal.failure_evidence.id,'failure-home');assert.equal(proposal.failure_evidence.sha256,hash(read(a).records['failure-home']));
  assert.ok(JSON.stringify(proposal.required_evidence_manifest).length<JSON.stringify(refs).length);
});
for(const field of ['sha256','count'])test('cannot authorize caller-tampered evidence manifest '+field,()=>{const a=fixture(),p=prepareReviewContinuation(read(a),a,a.root);p.required_evidence_manifest[field]=field==='count'?p.required_evidence_manifest.count-1:digest('wrong');assert.throws(()=>change(a,s=>authorizeReviewContinuation(s,{...a,proposal_sha256:hash(p)},a.root)),/exact current continuation proposal/);});
for(const operation of ['add','remove'])test('bound old-review member '+operation+' invalidates an already authorized target',()=>{
  const a=fixture(),t=authorized(a);change(a,s=>{if(operation==='add'){s.records.newContract={id:'newContract',kind:'artifact',revision:1,status:'Draft',content:'Another whole requirement'};s.jobs['prior-unknown'].inputs.push({id:'newContract',revision:1});}else s.jobs['prior-unknown'].inputs=[];});assert.throws(()=>reviewContinuationRequiredEvidence(read(a),t,{root:a.root}),/UNKNOWN reservation/);
});
for(const operation of ['change','delete'])test('manifest detects ordinary whole source '+operation+' with no governing-decision change',()=>{
  const a=fixture(),t=authorized(a);change(a,s=>{if(operation==='change')s.records.contract.content+='Changed exact ordinary source';else delete s.records.contract;});assert.throws(()=>reviewContinuationRequiredEvidence(read(a),t,{root:a.root}),/manifest changed|evidence missing/);
});
test('new complete member is bound and cannot be omitted from INLINE-or-whole-READ publication coverage',()=>{
  const a=fixture(),old=prepareReviewContinuation(read(a),a,a.root);change(a,s=>{s.records.newContract={id:'newContract',kind:'artifact',revision:1,status:'Draft',content:'Whole additional controlled requirement'};s.jobs['prior-unknown'].inputs.push({id:'newContract',revision:1});s.records['failure-home'].content=JSON.stringify({canonical_public_terminal_job:{complete_data:{value:s.jobs['prior-unknown']}}});});a.prior_job_sha256=hash(read(a).jobs['prior-unknown']);
  const p=prepareReviewContinuation(read(a),a,a.root);assert.equal(p.required_evidence_manifest.count,old.required_evidence_manifest.count+1);assert.notEqual(p.required_evidence_manifest.sha256,old.required_evidence_manifest.sha256);
  const t=authorized(a),key=queued(a,t),state=read(a),job=structuredClone(state.jobs[key]);assert.ok(reviewContinuationRequiredEvidence(state,t,{root:a.root}).some(r=>r.id==='newContract'));job.inputs=job.inputs.filter(r=>r.id!=='newContract');assert.throws(()=>reviewContinuationAssignment(state,job,{root:a.root}),/neither INLINE nor declared: newContract/);
});
test('timely closed QA may be locally accepted after its window but before the separate new grant expires',()=>{
  const a=fixture(),target=authorized(a),key=queued(a,target),pair=closedPair(a,key);publish(a,pair);const before=read(a),now=Date.now,afterWindow=Date.parse(pair.j.execution_deadline_at)+1;assert.ok(afterWindow<Date.parse(a.expires_at));
  try {Date.now=()=>afterWindow;const accepted=developmentReviewContinuationAction({...a,action:'accept_review_continuation',target_id:target.id,target_sha256:hash(target),review_id:pair.record.id,candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},'codex');assert.equal(accepted.development.type,'review_continuation_acceptance');}finally{Date.now=now;}
  const after=read(a);for(const key of ['plan','candidate','receipt','recovery'])assert.deepEqual(after.records[key],before.records[key]);assert.deepEqual(after.jobs['prior-unknown'],before.jobs['prior-unknown']);
});
test('historical acceptance never permits a review finishing exactly on or after its original QA cutoff',()=>{
  const a=fixture(),t=authorized(a),key=queued(a,t),pair=closedPair(a,key);pair.j.finished_at=pair.j.execution_deadline_at;pair.j.coordination_release.at=pair.j.finished_at;assert.throws(()=>validateReviewContinuationPublication(read(a),pair.j,pair.record,{root:a.root,phase:'acceptance'}),/exact closed prospective window/);
});
for(const variant of ['Fail','Blocked','malformed-tail','adapter','uncertain'])test('direct-candidate retained '+variant+' cannot be skipped by switching target to a receipt',()=>{
  const a=fixture();change(a,s=>{
    const j={id:'direct-candidate-negative',role:'qa',status:'failed',started_at:'2001-01-01T00:00:00.000Z',review_of:{id:'candidate',revision:1}};
    if(variant==='adapter')j.model_evidence={cli_observed_negative_outputs:[JSON.stringify({review:{verdict:'Fail'}})]};
    else if(variant!=='uncertain')j.rejected_output={text:variant==='malformed-tail'?'{"review":{"verdict":"Fail"} BROKEN':JSON.stringify({review:{verdict:variant}}),truncated:false};
    s.jobs[j.id]=j;
  });assert.throws(()=>prepareReviewContinuation(read(a),a,a.root),/rejected or uncertain|adapter-observed|unfinished or uncertain/);assert.equal(Object.values(read(a).records).filter(r=>r.kind==='review'&&r.review_of?.id==='candidate').length,0);
});
for(const layout of ['legacy','normalized'])for(const action of ['authorize_review_continuation','accept_review_continuation'])test('final pre-COMMIT fence rolls back '+layout+' '+action+' after SQL writes cross new deadline',()=>{
  const a=fixture();if(layout==='normalized')withStore(a.root,db=>db.migrate());
  let args;
  if(action==='authorize_review_continuation'){const p=prepareReviewContinuation(read(a),a,a.root);args={...a,action,proposal_sha256:hash(p)};}
  else {const t=authorized(a),key=queued(a,t),pair=closedPair(a,key);publish(a,pair);args={...a,action,target_id:t.id,target_sha256:hash(t),review_id:pair.record.id,candidate_sha256:t.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256};}
  const before=read(a),original=Store.prototype.transaction,now=Date.now;let crossed=false,clock=now();
  try {
    Date.now=()=>clock;
    Store.prototype.transaction=function(type,fn,options={}){return original.call(this,type,fn,{...options,afterWrite:(db,s)=>{options.afterWrite?.(db,s);if(type==='development.'+action){crossed=true;clock=Date.parse(a.expires_at)+1;}}});};
    assert.throws(()=>developmentReviewContinuationAction(args,'codex'),/expired/);
  } finally {Date.now=now;Store.prototype.transaction=original;}
  assert.equal(crossed,true);assert.deepEqual(read(a),before);
});

test('new continuation acceptance retains its canonical report at its own home without rewriting the receipt',()=>{
 const a=fixture(),target=authorized(a),key=queued(a,target),pair=closedPair(a,key);publish(a,pair);const before=read(a);
 const accepted=developmentReviewContinuationAction({...a,action:'accept_review_continuation',target_id:target.id,target_sha256:hash(target),review_id:pair.record.id,candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},'codex'),s=read(a),report=accepted.development.acceptance_report;
 assert.equal(report.protocol,DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL);assert.equal(report.acceptance_kind,'review-continuation');assert.equal(accepted.development.acceptance_report_sha256,hash(report));
 assert.deepEqual(s.records.receipt,before.records.receipt);assert.deepEqual(s.records.plan,before.records.plan);assert.deepEqual(s.jobs['prior-unknown'],before.jobs['prior-unknown']);assert.deepEqual(developmentDeliverySnapshotValue(s,report.receipt_before_acceptance),before.records.receipt);assert.equal(report.repository_head.status,'unobserved');
 const args={root:a.root,session_id:a.session_id,epoch:a.epoch,action:'acceptance_report',plan_id:'plan',receipt_id:'receipt',acceptance_id:accepted.id};
 const result=developmentDeliveryAction(args,'codex');assert.equal(result.status,'observed');assert.equal(result.report_sha256,accepted.development.acceptance_report_sha256);assert.equal(result.acceptance_id,accepted.id);assert.equal(result.source_integration,false);
 const unchanged=read(a);assert.throws(()=>change(a,state=>acceptReviewContinuation(state,{...a,target_id:target.id,target_sha256:hash(target),review_id:pair.record.id,candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},a.root)),/already locally accepted/);assert.deepEqual(read(a),unchanged);
 change(a,state=>{delete state.records[accepted.id].development.acceptance_report;delete state.records[accepted.id].development.acceptance_report_sha256;delete state.records[accepted.id].development.plan_id;});
 const legacy=read(a),unavailable=developmentDeliveryAction(args,'codex');assert.equal(unavailable.reason,'legacy_continuation_acceptance_report_unavailable');assert.deepEqual(read(a),legacy);
});

for(const racedTransition of [false,true])test('real MCP oversized continuation acceptance preserves artifact facts'+(racedTransition?' while a real handoff precedes readback':' and exact immutable report handles'),async()=>{
 const a=fixture({delivery:true});bind(a.root,a.session_id,'codex');
 change(a,s=>{s.jobs['prior-unknown'].retained_diagnostic='z'.repeat(40000);s.records['failure-home'].content=JSON.stringify({canonical_public_terminal_job:{complete_data:{value:s.jobs['prior-unknown']}}});});a.prior_job_sha256=hash(read(a).jobs['prior-unknown']);
 const target=authorized(a),key=queued(a,target),pair=closedPair(a,key);publish(a,pair);const before=read(a),args={root:a.root,session_id:a.session_id,epoch:a.epoch,action:'accept_review_continuation',target_id:target.id,target_sha256:hash(target),review_id:pair.record.id,candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256};
 const original=Store.prototype.readSnapshot;let result,transition;
 try{
  if(racedTransition)Store.prototype.readSnapshot=function(fn){if(this.inTransaction)return original.call(this,fn);const current=original.call(this,()=>this.read()),accepted=Object.values(current.records).find(r=>r.development?.type==='review_continuation_acceptance');if(accepted&&!transition){transition={pending:true};const selection={root:a.root,session_id:a.session_id,epoch:a.epoch,plan_id:'plan',receipt_id:'receipt',acceptance_id:accepted.id},inspection=developmentDeliveryAction({...selection,action:'delivery_inspect'},'codex'),record=read(a).records.contract;transition=developmentDeliveryAction({...selection,action:'delivery_transition',report_sha256:inspection.report_sha256,expected_handoff_sha256:inspection.handoff_sha256,transition_id:'controlled-raced-transition',to_stage:'integrator',reported_outcome:'completed',evidence_refs:[{id:record.id,revision:record.revision,sha256:hash(record)}],source_instruction:'Controlled attributable handoff observation between acceptance and public readback.'},'codex');}return original.call(this,fn);};
  result=await call('company_develop',args,'codex');
 }finally{Store.prototype.readSnapshot=original;}
 const s=read(a),canonical=s.records[result.id],report=canonical.development.acceptance_report;
 assert.equal(fits(canonical),false);assert.equal(fits(result),true);assert.ok(Buffer.byteLength(JSON.stringify(rpcReply(1,toolResult(result))))<65536);
 const returnedHome=structuredClone(canonical);delete returnedHome.development.delivery;const expected=structuredClone(returnedHome);expected.development.acceptance_report=null;for(const [name,value]of Object.entries(expected))assert.deepEqual(result[name],value);
 assert.equal(result.id,canonical.id);assert.equal(result.development.source_integrated,false);assert.equal(result.development.old_scope_unchanged,true);assert.equal(result.development.old_unknown_reservation_preserved,true);assert.equal(result.acceptance_report_inline,false);assert.equal(result.canonical_acceptance_record_sha256,hash(returnedHome));assert.equal(result.report_sha256,hash(report));assert.equal(result.development.acceptance_report_sha256,hash(report));
 if(racedTransition){assert.equal(transition.current_receiver.stage,'integrator');assert.equal(canonical.development.delivery.transitions.length,1);assert.equal(result.acceptance_source,null);assert.equal(result.report_source,null);assert.match(result.readback_hold,/home changed after acceptance/);assert.notEqual(result.canonical_acceptance_record_sha256,hash(canonical));}
 else{assert.deepEqual(result.acceptance_source.path_in_record,[]);assert.equal(result.acceptance_source.sha256,hash(canonical));assert.equal(result.acceptance_source.record.sha256,hash(canonical));assert.deepEqual(result.report_source.path_in_record,['development','acceptance_report']);assert.equal(result.report_source.sha256,hash(report));assert.equal(result.report_source.record.sha256,hash(canonical));}assert.match(result.retrieval,/do not repeat acceptance/i);
 const reportSource=racedTransition?developmentDeliveryAction({root:a.root,session_id:a.session_id,epoch:a.epoch,action:'acceptance_report',plan_id:'plan',receipt_id:'receipt',acceptance_id:canonical.id},'codex').report_source:result.report_source;assert.deepEqual(await publicReport(a,reportSource),report);
 assert.deepEqual(s.records.receipt,before.records.receipt);assert.deepEqual(s.records.plan,before.records.plan);assert.deepEqual(s.jobs['prior-unknown'],before.jobs['prior-unknown']);
 await assert.rejects(call('company_develop',args,'codex'),/already locally accepted/);assert.deepEqual(read(a),s);
});
