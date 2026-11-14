// Extracted exact V2 controlled fixture prefix; only helper-body/output padding added for meaningful alias activation.
// Controlled source fixtures in REAL temporary Stores. The supported authorizer
// may run its fixed cached sandbox readiness probe (5s/10KB); candidate execution
// and model/provider calls stay controlled. The small synthetic historical
// receipt is test data, never actual P4/326 evidence or public HOST qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest,id,installedTeam,teamHash,VERSION,withStore,Store} from '../plugins/soloco/runtime/store.mjs';
import {validationManifest} from '../plugins/soloco/runtime/validation-cache.mjs';
import {developmentAction,developmentReviewSubject} from '../plugins/soloco/runtime/develop.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {prepareReviewContinuation,authorizeReviewContinuation,reviewContinuationSubject,reviewContinuationAssignment,reviewContinuationContextInputs,reviewContinuationCandidate,reviewContinuationRequiredEvidence,validateReviewContinuationPublication,acceptReviewContinuation,developmentReviewContinuationAction} from '../plugins/soloco/runtime/development-review-continuation.mjs';
import {recordOriginalWorkerAssignmentFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {stageOriginalHistoricalJob,stageOriginalWorker,disposeOriginalProcessFixtures} from './original-adapter-process-fixture.mjs';
import {stageOriginalReviewController} from './original-worker-model-fixture.mjs';
import {TIMEOUT_POLICY_VERSION} from '../plugins/soloco/runtime/timeout.mjs';
import {codeReviewWindowSubject} from '../plugins/soloco/runtime/code-review-window.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-review-continuation-'));
const originalRoots=[];
test.after(()=>{for(const root of originalRoots)disposeOriginalProcessFixtures(root);fs.rmSync(base,{recursive:true,force:true});});
const hash=x=>digest(JSON.stringify(x)),read=a=>withStore(a.root,db=>db.read());
const change=(a,fn)=>withStore(a.root,db=>db.transaction('controlled.continuation-fixture',s=>{fn(s);return s;}));
async function fixture({recovery=true,legacy=true}={}) {
  const RealDate=Date,stagingTime=RealDate.now();
  // The genuine issuers see one coherent initially-live Source clock. No
  // historical private token is backdated, and no original expiry is renewed.
  globalThis.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[stagingTime]));}static now(){return stagingTime;}};
  try{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(base,'case-'))),a={root,session_id:id('owner'),host:'codex',epoch:1},team=installedTeam();
  originalRoots.push(root);
  const originals=[{path:'helper.mjs',content:'export const helper=1;\n'+'// Whole preserved controlled helper body.\n'.repeat(120)},{path:'value.mjs',content:'export const value=0;\n'},{path:'value.test.mjs',content:'// Controlled historical test source, never executed by this fixture.\n'}],files=structuredClone(originals);files[1].content='export const value=42;\n';
  for(const f of originals)fs.writeFileSync(path.join(root,f.path),f.content);
  const scope={read_paths:originals.map(f=>f.path),write_paths:['value.mjs'],test_paths:['value.test.mjs'],sources:originals.map(f=>({...f,sha256:digest(f.content)})),max_bytes:20000,max_attempts:2,timeout_ms:1000,max_output_bytes:10000,transport_max_characters:360000,expires_at:new Date(stagingTime+600000).toISOString(),acceptance:'All scoped controlled code and strong assertions.',stop_conditions:'No execution or integration rights from review.',data_policy:'Synthetic controlled fixtures only.',output_format:'patches'};
  const patch={path:'value.mjs',base_sha256:digest(originals[1].content),edits:[{start:0,end:originals[1].content.length,text:files[1].content}]};
  const p={id:'plan',kind:'artifact',revision:1,status:'Draft',content:'Expired original controlled scope.',development:{type:'plan',scope,scope_sha256:hash(scope),attempts:['old-generation-1','producer']}};
  const producer={id:'producer',role:'engineer',instance_id:'engineer-original',native_id:'native-original',status:'completed',development_id:p.id,artifact_id:'candidate',inputs:[],supplemental_sources:[],coordination_release:{termination_confirmed:true,reason:'model_process_closed'}};
  const c={id:'candidate',kind:'artifact',revision:1,status:'Submitted',author_role:'engineer',author_instance:producer.instance_id,job_id:producer.id,content:'Native controlled candidate fixture.',development:{type:'candidate',plan_id:p.id,scope_sha256:p.development.scope_sha256,files,candidate_sha256:hash(files),generation:{format:'patches',patches:[patch],patch_sha256:hash([patch])},run:{job_id:'controller',status:'completed',receipt_id:'receipt'}}};
  const directory=path.join(root,'.company','development',p.id,c.id,'source');fs.mkdirSync(directory,{recursive:true});for(const f of files)fs.writeFileSync(path.join(directory,f.path),f.content);
  const manifest=validationManifest({files:files.map(f=>({path:f.path,sha256:digest(f.content)})),tests:scope.test_paths,command:['node','--test','./value.test.mjs'],runtime:{node:'controlled-historical-node',platform:'controlled',arch:'controlled',os_release:'controlled',system_build:'controlled',dependencies:[{path:'/controlled/node',sha256:digest('node')}],executable_sha256:digest('node'),runner_sha256:digest('historical-runner')},sandbox:{backend:'controlled-historical-fixture',policy_sha256:digest('policy')},environment:{LANG:'C'},limits:{timeout_ms:1000,max_output_bytes:10000}});
  const result={status:'passed',exit_code:0,tests_executed:true,signal:null,output_truncated:false,stdout:'Controlled historical fixture only; no tests executed by fixture construction.'.repeat(80),stderr:'',directory,test_paths:scope.test_paths,timeout_ms:1000,max_output_bytes:10000,validation_manifest_sha256:hash(manifest)};
  const t={id:'receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'controller',content:JSON.stringify(result),development:{type:'test',plan_id:p.id,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,result,receipt_sha256:hash(result),validation_manifest:manifest,validation_fingerprint:manifest.validation_fingerprint}};
  const old={id:'old-failed-receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'old-controller',content:'Controlled original preflight failure',development:{type:'test',receipt_sha256:digest('old-result'),result:{status:'failed',tests_executed:false}}};
  const oldController={id:'old-controller',kind:'development_test',status:'completed',artifact_id:old.id,candidate_id:c.id,development_id:p.id};
  const controller={id:'controller',kind:'development_test',status:'completed',artifact_id:t.id,candidate_id:c.id,development_id:p.id};
  const contract={id:'contract',kind:'artifact',revision:1,status:'Draft',content:'Whole contract '+'x'.repeat(120)};
  const oldQA={id:'prior-unknown',role:'qa',instance_id:'qa-old',native_id:'native-old-unknown',status:'failed',started_at:'2001-01-01T00:00:00.000Z',session_key:'qa:review:receipt:1',review_of:{id:t.id,revision:1},inputs:[{id:'contract',revision:1}],supplemental_sources:[],execution_failure:{termination_confirmed:false,outcome:'timeout',code:'ROLE_TIMEOUT'}};
  const failureHome={id:'failure-home',kind:'artifact',revision:1,status:'Draft',content:JSON.stringify({canonical_public_terminal_job:{complete_data:{value:oldQA}}})};
  const records={plan:p,candidate:c,receipt:t,contract,'failure-home':failureHome},jobs={producer,'controller':controller,'prior-unknown':oldQA};
  withStore(root,db=>db.transaction('company.created',()=>({schema:2,runtime_version:VERSION,id:id('company'),name:'Controlled continuation source test',idea:'No product authority',phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:a.session_id,epoch:1},records,sessions:{[oldQA.session_key]:{instance_id:oldQA.instance_id,native_id:oldQA.native_id}},jobs:{},messages:[],notices:[],created_at:new Date().toISOString()})),true);
  Object.assign(p,await developmentAction({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:'Controlled fictional Source fixture: authorize this exact initially-live carrier scope only; no candidate execution, real model or Native acceptance.'},'codex'));
  // The business history remains fictional DATA. Each operational carrier is
  // newly staged through the actual Original writer, never backfilled onto an
  // existing prefix. In particular the old failed/UNKNOWN unit stays occupied.
  const stage=job=>job.kind==='development_test'?stageOriginalReviewController(root,{jobId:job.id,planId:p.id,candidateId:c.id,receiptId:job.artifact_id}):stageOriginalHistoricalJob(root,job);
  for(const job of Object.values(jobs))Object.assign(job,stage(job));
  const pendingHistorical=[];
  change(a,s=>{
    s.records['failure-home'].content=JSON.stringify({canonical_public_terminal_job:{complete_data:{value:s.jobs[oldQA.id]}}});
    if(recovery) {
      const diagResult={status:'passed',tests_executed:false,launch_intent:false},diag={id:'diagnostic',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'diagnostic-controller',content:JSON.stringify(diagResult),development:{type:'preflight_diagnostic',result:diagResult,receipt_sha256:hash(diagResult)}};
      s.records[old.id]=old;s.records[diag.id]=diag;
      pendingHistorical.push(oldController,{id:diag.author_instance,kind:'development_preflight',status:'completed',artifact_id:diag.id});
      const originalCandidate=structuredClone(s.records.candidate);originalCandidate.development.run={job_id:oldController.id,status:'completed',receipt_id:old.id};
      const proof=legacy?{legacy:{id:'legacy-qa',revision:1,sha256:null,producer_sha256:null,evidence:[],input_records:[],context_sha256:digest('historical-context'),candidate_record_sha256:hash(originalCandidate),candidate_run:originalCandidate.development.run}}:{execution_provenance:{protocol:'controlled-zero-launch'}};
      if(legacy) {
        const target={id:'legacy-target',kind:'artifact',revision:1,status:'Submitted',content:'Controlled complete historical qualification target'};
        const qj={id:'legacy-qa-job',role:'qa',instance_id:'legacy-reviewer',native_id:'legacy-native',status:'completed',artifact_id:'legacy-qa',coordination_release:{termination_confirmed:true},context_sha256:proof.legacy.context_sha256};
        const q={id:'legacy-qa',kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:qj.instance_id,job_id:qj.id,review_of:{id:target.id,revision:1},review:{verdict:'Pass',permitted_action:'qualify_preflight_recovery',blockers:[],preflight_recovery:{receipt_sha256:old.development.receipt_sha256,candidate_sha256:c.development.candidate_sha256,target_sha256:hash(target),basis:'qualified-exact-source-first-fingerprint-inference',uncertainty:'historical-launch-not-attested'}}};
        s.records[target.id]=target;s.records[q.id]=q;proof.legacy.sha256=hash(q);proof.legacy.producer_sha256=hash(qj);pendingHistorical.push(qj);
      } else old.development.result.execution_provenance=proof.execution_provenance;
      const r={type:'preflight_recovery_request',protocol:'original-grant-validation-recovery-v1',subject:{plan_id:p.id,scope_sha256:p.development.scope_sha256,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,receipt_id:old.id,receipt_sha256:old.development.receipt_sha256,receipt_record_sha256:hash(old),job_id:oldController.id,job_sha256:hash(oldController)},proof,diagnostic_id:diag.id,diagnostic_sha256:diag.development.receipt_sha256,authority_sha256:p.development.authorization.authority_sha256,expires_at:scope.expires_at,status:'consumed',job_id:controller.id,generation_permission:false,allowance_reset:false};
      s.records.recovery={id:'recovery',kind:'artifact',revision:1,status:'Recorded',author_role:'human_founder',content:'Controlled historical consumed recovery',development:r};
      s.records.receipt.development.preflight_recovery_id='recovery';s.records.candidate.development.preflight_recovery='recovery';s.records.candidate.development.run_history=[originalCandidate.development.run];
    }
  });
  for(const job of pendingHistorical)Object.assign(job,stage(job));
  if(recovery)change(a,s=>{
    const r=s.records.recovery.development;r.subject.job_sha256=hash(s.jobs[oldController.id]);
    if(legacy)r.proof.legacy.producer_sha256=hash(s.jobs['legacy-qa-job']);
  });
  const reviewStart=Date.parse(scope.expires_at)+1000;
  return {...a,reviewStart,plan_id:p.id,candidate_id:c.id,receipt_id:t.id,receipt_sha256:t.development.receipt_sha256,prior_job_id:oldQA.id,prior_job_sha256:hash(oldQA),failure_evidence_id:failureHome.id,source_instruction:'CONTROLLED NEW HUMAN PRIMARY FIXTURE: one read-only review and local acceptance, explicit old UNKNOWN reservation retained.',approval_reference:id('controlled-primary-approval'),model_data_approved:true,unknown_prior_replacement_approved:true,expires_at:new Date(reviewStart+3600000).toISOString(),code_review_window_minutes:30};
  }finally{globalThis.Date=RealDate;}
}
function authorized(a) {const proposal=prepareReviewContinuation(read(a),a,a.root);let t;change(a,s=>{t=authorizeReviewContinuation(s,{...a,proposal_sha256:hash(proposal)},a.root);});return t;}
function queued(a,t,{defer=true}={}) {
  const state=read(a),required=reviewContinuationRequiredEvidence(state,t,{root:a.root});
  const job={id:id('controlled-qa'),role:'qa',instance_id:id('controlled-qa-instance'),native_id:null,host:'codex',epoch:1,status:'queued',review_of:{id:t.id,revision:t.revision},session_key:`qa:review:${t.id}:${t.revision}`,code_review_window_minutes:30,timeout_ms:600000,task:'Controlled complete code review, no tools or actual model.',context_format:3,inputs:required.filter(r=>!defer||r.id!=='contract').map(r=>({id:r.id,revision:r.revision})),supplemental_sources:defer?[required.find(r=>r.id==='contract')]:[]};
  job.created_at=new Date().toISOString();job.timeout_policy_version=TIMEOUT_POLICY_VERSION;job.timeout_reason='Controlled finite Source review invocation';job.code_review_reason='Controlled complete Source review window';
  const {id:unusedId,...request}=job;job.code_review_subject=codeReviewWindowSubject(state,{...request,review_of:job.review_of.id},{root:a.root});
  reviewContinuationAssignment(state,job,{reserve:true,root:a.root});
  const context=assignmentContext(state,job);job.inputs=context.inputs;job.context_sha256=context.hash;
  withStore(a.root,store=>store.transaction('job.queued',s=>{recordOriginalWorkerAssignmentFrom(store,s,job);s.jobs[job.id]=job;s.sessions[job.session_key]={instance_id:job.instance_id,native_id:null};return s;}));stageOriginalWorker(a.root,job.id);return job.id;
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

export {fixture,authorized,read,change,hash,base};
