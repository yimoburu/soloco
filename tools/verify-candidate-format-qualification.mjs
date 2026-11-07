import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,withStore} from '../plugins/soloco/runtime/store.mjs';
import {fixture} from './candidate-format-qualification.mjs';
import {publicReport} from './workflow-runtime.mjs';

export function verifyCase(report,state){
  const expected=[...fixture(report.count).expected,fixture(report.count).test].sort((a,b)=>a.path.localeCompare(b.path));
  const producerCall=report.calls.find(c=>c.role==='engineer'),reviewCall=report.calls.find(c=>c.role==='qa'),producer=state.jobs[producerCall?.job_id];
  const candidate=state.records[producer?.artifact_id],attempt=report.attempts.at(-1),testJob=state.jobs[attempt?.test_job_id],receipt=state.records[testJob?.artifact_id],review=state.records[report.review?.id],reviewJob=state.jobs[review?.job_id];
  const complete=candidate?.development?.files,exact=Array.isArray(complete)&&JSON.stringify(complete)===JSON.stringify(expected);
  const candidateHash=complete?digest(JSON.stringify(complete)):null;
  const result=receipt?.development?.result,plan=state.records[candidate?.development?.plan_id];
  const checks={
    clean_accepted_lifecycle:report.errors.length===0&&!report.calls.some(c=>c.error)&&!report.events.some(e=>e.type==='held'),
    expected_calls:report.calls.length===2&&report.calls.filter(c=>c.role==='engineer').length===1&&report.calls.filter(c=>c.role==='qa').length===1&&report.attempts.length===1&&report.repairs===0,
    fixed_model_settings:report.calls.every(c=>c.requested?.mode==='explicit'&&c.requested.model==='gpt-6.1-sol'&&c.requested.speed==='host_default'&&c.requested.effort===(c.role==='engineer'?'medium':'high')),
    exact_fixture_identity:report.fixture_sha256===digest(JSON.stringify(fixture(report.count)))&&report.module_bytes.length===report.count&&report.module_bytes.every(n=>n===32768),
    exact_fixture:exact,
    candidate_hash:!!candidate&&candidate.development.candidate_sha256===candidateHash&&report.generation?.candidate_sha256===candidateHash,
    candidate_provenance:!!candidate&&candidate.kind==='artifact'&&candidate.status==='Submitted'&&candidate.author_role==='engineer'&&candidate.job_id===producer?.id&&candidate.author_instance===producer?.instance_id&&report.generation?.candidate_id===candidate.id&&report.generation?.native_id===producer?.native_id&&producerCall.native_id===producer?.native_id,
    exact_scope_format:!!plan&&candidate?.development?.scope_sha256===plan.development.scope_sha256&&report.scope_sha256===plan.development.scope_sha256&&plan.development.scope.output_format===report.format&&candidate.development.generation?.format===report.format&&report.generation?.byte_accounting?.format===report.format,
    producer_complete:producer?.status==='completed'&&!!producer.native_id&&producer.coordination_release?.termination_confirmed===true,
    tests_executed:!!receipt&&testJob?.status==='completed'&&result?.tests_executed===true&&result.status==='passed'&&result.exit_code===0&&result.candidate_sha256===candidateHash,
    receipt_hash:!!receipt&&receipt.development.receipt_sha256===digest(receipt.content)&&report.attempts.at(-1)?.receipt_sha256===receipt.development.receipt_sha256,
    exact_receipt_candidate:!!receipt&&receipt.development.candidate_id===candidate?.id&&receipt.development.candidate_sha256===candidateHash&&report.attempts[0]?.receipt_id===receipt.id&&report.attempts[0].result?.candidate_sha256===candidateHash&&JSON.stringify(report.attempts[0].result)===JSON.stringify(result),
    runtime_test_provenance:!!receipt&&receipt.status==='Submitted'&&receipt.author_role==='runtime'&&receipt.author_instance===testJob?.id&&testJob.kind==='development_test'&&candidate?.development?.run?.job_id===testJob.id&&candidate.development.run.receipt_id===receipt.id&&receipt.development.plan_id===plan?.id,
    independent_review:review?.review?.verdict==='Pass'&&review.review.permitted_action==='accept_local_development'&&Array.isArray(review.review.blockers)&&review.review.blockers.length===0&&reviewJob?.status==='completed'&&!!reviewJob.native_id&&reviewJob.native_id!==producer?.native_id&&reviewJob.coordination_release?.termination_confirmed===true,
    review_binding:!!review&&review.review_of?.id===receipt?.id&&review.review_of.revision===receipt?.revision&&review.review.candidate_sha256===candidateHash&&review.review.receipt_sha256===receipt?.development?.receipt_sha256,
    review_provenance:!!review&&review.kind==='review'&&review.status==='Submitted'&&review.author_role==='qa'&&review.author_instance===reviewJob?.instance_id&&review.author_instance!==candidate?.author_instance&&reviewJob?.artifact_id===review.id&&reviewCall?.job_id===reviewJob?.id&&reviewCall?.native_id===reviewJob?.native_id,
    reported_review_binding:!!review&&report.review?.verdict===review.review.verdict&&report.review.candidate_sha256===review.review.candidate_sha256&&report.review.receipt_sha256===review.review.receipt_sha256&&report.review.native_id===reviewJob?.native_id&&report.review.author_native_id===producer?.native_id,
    accepted_binding:report.accepted===true&&report.acceptance?.review_id===review?.id&&report.acceptance?.candidate_sha256===candidateHash&&report.acceptance?.receipt_sha256===receipt?.development?.receipt_sha256&&report.acceptance.source_integrated===false&&receipt?.development?.acceptance?.review_id===review?.id&&receipt.development.acceptance.candidate_sha256===candidateHash&&receipt.development.acceptance.receipt_sha256===receipt.development.receipt_sha256&&receipt.development.acceptance.source_integrated===false,
    originals_unchanged:report.original_source_unchanged===true,
    original_test_failure:report.precheck?.tests_executed===true&&report.precheck.status==='failed'&&Number.isInteger(report.precheck.exit_code)&&report.precheck.exit_code!==0
  };
  let rejected;try{rejected=JSON.parse(producer?.rejected_output?.text??'null');}catch{}
  const producerStage=producer?.status==='completed'?'candidate_returned':rejected?.blocked?'producer_blocked':producer?.rejected_output?'invalid_or_incomplete_output':producerCall?.error?'provider_or_backend_failure':'admission_or_runtime_failure';
  const stage=report.accepted?'accepted':!candidate?producerStage:!exact?'exact_fixture_mismatch':!receipt?'test_outcome_unavailable':result?.status!=='passed'?'test_failed_or_uncertain':!review?'review_outcome_unavailable':review.review?.verdict!=='Pass'?'independent_review_hold':'acceptance_held';
  return {count:report.count,format:report.format,stage,accepted:report.accepted,acceptance_verified:report.accepted&&Object.values(checks).every(Boolean),checks,
    generation_validation:{producer_stage:producerStage,explicit_block:rejected?.blocked??null,rejected_output:producer?.rejected_output?{text:producer.rejected_output.text,truncated:producer.rejected_output.truncated,reason:producer.rejected_output.reason}:null,exact_fixture_match:candidate?exact:null,invalid_or_incomplete_outputs:producerStage==='invalid_or_incomplete_output'?1:0,producer_blocks:producerStage==='producer_blocked'?1:0,exact_fixture_mismatches:candidate&&!exact?1:0,provider_or_backend_failures:producerStage==='provider_or_backend_failure'?1:0},
    metrics:{...report.metrics,invalid_or_incomplete_generations:undefined},byte_accounting:candidate?.development?.generation??null,
    canonical:{producer_job_id:producer?.id??null,candidate_id:candidate?.id??null,candidate_sha256:candidateHash,test_job_id:testJob?.id??null,receipt_id:receipt?.id??null,receipt_sha256:receipt?.development?.receipt_sha256??null,review_job_id:reviewJob?.id??null,review_id:review?.id??null,native_id:producer?.native_id??null,author_native_id:reviewJob?.native_id??null,producer_closed:producer?.coordination_release?.termination_confirmed??null,reviewer_closed:reviewJob?.coordination_release?.termination_confirmed??null},errors:report.errors,elapsed_ms:report.elapsed_ms};
}

export function derive(directory){
  const base=path.resolve(directory),original=JSON.parse(fs.readFileSync(path.join(base,'report.json'),'utf8'));
  const cases=[],localReports=[];
  for(const count of [1,3])for(const format of ['files','patches']){
    const root=path.join(base,`${count}-${format}`),file=path.join(root,'qualification-local.json');if(!fs.existsSync(file))continue;
    const report=JSON.parse(fs.readFileSync(file,'utf8'));if(!report.metrics)throw Error(`Case ${count}/${format} is still in flight`);if(report.count!==count||report.format!==format)throw Error('Case identity differs from its canonical fixture location');localReports.push(report);
    const state=withStore(root,db=>db.read()),verified=verifyCase(report,state);cases.push(verified);
  }
  const sourceFile=path.join(base,'frozen-source-identity.json'),source=fs.existsSync(sourceFile)?JSON.parse(fs.readFileSync(sourceFile,'utf8')):null;
  const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
  const sourceMatches=source?source.files.every(f=>fs.existsSync(path.join(sourceRoot,f.path))&&digest(fs.readFileSync(path.join(sourceRoot,f.path)))===f.sha256):null;
  const frozenMatches=source?source.files.every(f=>{const archived=path.join(base,path.basename(f.path)+'.frozen'),file=fs.existsSync(archived)?archived:path.join(sourceRoot,f.path);return fs.existsSync(file)&&digest(fs.readFileSync(file))===f.sha256;}):null;
  const originalMatches=JSON.stringify(original.cases)===JSON.stringify(localReports.map(publicReport));
  const matchingExecution=localReports.every(r=>r.execution===original.execution);
  const uniqueCases=new Set(cases.map(c=>`${c.count}-${c.format}`)).size===4;
  return publicReport({schema:1,kind:'derived_candidate_format_validation',derived_at:new Date().toISOString(),derivation:'Read-only validation of terminal local reports against original retained canonical company databases. No model call or test execution is repeated. Original reports remain unchanged. Raw identities stay local; public native identities are SHA-256 hashes.',original_report_sha256:digest(fs.readFileSync(path.join(base,'report.json'))),verifier_sha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),source_identity:source,current_source_bytes_still_match:sourceMatches,frozen_run_source_still_matches:frozenMatches,protocol:original.protocol,cases,
    assessment:{complete_comparison_matrix:cases.length===4&&uniqueCases&&originalMatches&&matchingExecution,original_report_matches_local_reports:originalMatches,matching_execution:matchingExecution,unique_expected_cases:uniqueCases,original_all_four_pass_criterion:original.assessment?.passed??null,accepted_cases:cases.filter(c=>c.acceptance_verified).length,all_accepted_bindings_verified:cases.filter(c=>c.accepted).every(c=>c.acceptance_verified),critical_false_acceptances:cases.filter(c=>c.accepted&&!c.acceptance_verified).length,all_provider_processes_closed:cases.every(c=>c.canonical.producer_closed===true&&(!c.canonical.review_job_id||c.canonical.reviewer_closed===true)),producer_blocks:cases.reduce((n,c)=>n+c.generation_validation.producer_blocks,0),invalid_or_incomplete_outputs:cases.reduce((n,c)=>n+c.generation_validation.invalid_or_incomplete_outputs,0),exact_fixture_mismatches:cases.reduce((n,c)=>n+c.generation_validation.exact_fixture_mismatches,0),statistical_noninferiority_established:false,causal_latency_improvement_established:false}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4)throw Error('Use verify-candidate-format-qualification.mjs ORIGINAL_RUN_DIRECTORY NEW_DERIVED_JSON');
  const result=derive(process.argv[2]);fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.assessment));if(!result.assessment.all_accepted_bindings_verified)process.exitCode=1;
}
