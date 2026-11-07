import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,digest} from '../plugins/soloco/runtime/store.mjs';
import {createWorkflow,waitTest,read,publicReport} from './workflow-runtime.mjs';
export {publicReport} from './workflow-runtime.mjs';
import {readiness,modelCatalog} from '../plugins/soloco/runtime/adapters.mjs';
import {sandboxCapability,runLocalTests} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';

export const protocol=Object.freeze({version:1,kind:'matched_accepted_workflow',fixture:'independent-extraction-and-port-repair',
 criteria:{critical_false_acceptances:0,all_expected_results_correct:true,noninferiority_margin_errors:0,max_generation_attempts_per_arm:2,max_native_calls_total:8,latency_improvement_required:false},
 comparison:'Serial extraction then repair versus concurrent extraction and repair. Same data, model controls, tests, QA and acceptance gates. Software harness chooses the schedule; this is not a model planning evaluation.',
 limitations:['Fictional small paired workload; no production quality, cost savings or natural founder-workload inference','One pair is descriptive; order and provider variance prevent causal latency or reliable tail claims','Original-source repair is required; later model repairs occur only after known deterministic test failure and within the fixed grant','Requested/applied settings are distinct from effective provider settings; missing observations remain unknown','Initial fixture setup and grant are synthetic test data, not actual-company or founder authorization','No detached autonomous scheduler claim; the harness calls real dispatch, worker, test and acceptance paths']});
export const criteria=['Accept ASCII decimal strings representing integers from 1 through 65535.','Reject nonstrings, signs, whitespace, fractions, hexadecimal, non-ASCII digits and out-of-range values.','Allow leading zeroes and return the integer; return null on rejection.'];
const initialSource='export function parsePort(value) { return Number(value) || null; }\n';
export const correctSource='export function parsePort(value) { if (typeof value !== "string" || value.length===0 || /[^0-9]/.test(value)) return null; const n=Number(value); return Number.isInteger(n) && n>=1 && n<=65535 ? n : null; }\n';
const testSource=`import test from 'node:test'; import assert from 'node:assert/strict'; import {parsePort} from './port.mjs';
test('valid boundaries and leading zeroes',()=>{for(const [v,n] of [['1',1],['65535',65535],['00080',80],['8080',8080]])assert.equal(parsePort(v),n);});
test('reject invalid values',()=>{for(const v of [null,undefined,80,true,{},[], '', '0','65536','-1','+80',' 80','80 ','80\\n','1.0','1e2','0x50','８０'])assert.equal(parsePort(v),null);});\n`;
const safeError=e=>({message:String(e.message).slice(0,2000),code:e.code??null,termination_confirmed:e.termination_confirmed??null});
const elapsed=started=>performance.now()-started;
export const baseRevision='9c0cb8a9d40da42242787b1bbaacfa11ba37acdc';
export function sourceIdentity(base=fileURLToPath(new URL('../',import.meta.url))){const files=[];const walk=dir=>{for(const entry of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){const name=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(name);else if(entry.isFile())files.push({path:name,sha256:digest(fs.readFileSync(path.join(base,name)))});}};walk('plugins/soloco');for(const name of ['SPEC.md','tools/accepted-workflow-eval.mjs','tools/workflow-runtime.mjs','tests/accepted-workflow-eval.test.mjs'])files.push({path:name,sha256:digest(fs.readFileSync(path.join(base,name)))});files.sort((a,b)=>a.path.localeCompare(b.path));let observed_git_revision=null;const top=spawnSync('git',['-C',base,'rev-parse','--show-toplevel'],{encoding:'utf8'});if(top.status===0&&fs.realpathSync(top.stdout.trim())===fs.realpathSync(base)){const head=spawnSync('git',['-C',base,'rev-parse','HEAD'],{encoding:'utf8'});if(head.status===0&&/^[a-f0-9]{40}$/.test(head.stdout.trim()))observed_git_revision=head.stdout.trim();}return {design_base_revision:baseRevision,observed_git_revision,files,manifest_sha256:digest(JSON.stringify(files)),node:{version:process.version,platform:process.platform,arch:process.arch,executable_sha256:digest(fs.readFileSync(process.execPath))}};}
const selections={research:{mode:'explicit',model:'gpt-6.1-sol',effort:'low',speed:'host_default',reason:'Exact fictional extraction with deterministic acceptance; same choice in both matched schedules.'},engineer:{mode:'explicit',model:'gpt-6.1-sol',effort:'medium',speed:'host_default',reason:'Bounded pure parser repair with immutable executed tests; same choice in both schedules.'},qa:{mode:'explicit',model:'gpt-6.1-sol',effort:'high',speed:'host_default',reason:'Independent exact-candidate acceptance and seeded boundary review; same choice in both schedules.'}};
export function contractModel({badFirst=false,qaVerdict='Pass',throwFor=null}={}) {let generation=0;return async ({job,target},host,native,prompt,cwd,timeout,selection,options)=>{
 options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
 if(throwFor===job.role)throw Object.assign(Error('Injected uncertain provider failure'),{termination_confirmed:false});
 const envelope={content:'Contract double only; not native model evidence.',messages:[],notices:[]};
 if(job.role==='research')envelope.content=JSON.stringify({criteria});
 if(job.development_id)envelope.files=[{path:'port.mjs',content:badFirst&&generation++===0?initialSource:correctSource}];
 if(job.role==='qa')envelope.review={verdict:qaVerdict,reason:'Contract-double gate exercise; not semantic model QA.',permitted_action:qaVerdict==='Pass'?'accept_local_development':'hold',candidate_sha256:target.development.candidate_sha256,receipt_sha256:target.development.receipt_sha256,blockers:qaVerdict==='Pass'?[]:['Injected independent review hold']};
 await new Promise(r=>setTimeout(r,10));
 return {native_id:id('contract-double'),text:JSON.stringify(envelope),model_evidence:{verification:'synthetic_contract_double'}};
};}
export async function runArm({directory,mode,native=false,model=contractModel(),sharedBudget={calls:0},runtimeReady,runtimeCatalog}){
 if(!['serial','concurrent'].includes(mode))throw Error('Choose serial or concurrent');
 const root=path.join(directory,mode);fs.mkdirSync(root,{recursive:true});
 const args={root,session_id:id('fictional-founder'),epoch:1};
 engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional matched parser repair and exact extraction evaluation',name:'Fictional workflow evaluation'},'codex');
 fs.writeFileSync(path.join(root,'port.mjs'),initialSource);fs.writeFileSync(path.join(root,'port.test.mjs'),testSource);
 const precheck=await runLocalTests({directory:root,test_paths:['port.test.mjs'],timeout_ms:5000,max_output_bytes:20000});
 if(precheck.tests_executed!==true||precheck.status!=='failed'||precheck.exit_code===0)throw Error('Required actual seeded failure was not established: '+JSON.stringify(precheck));
 const failure=engine.save({...args,kind:'artifact',content:JSON.stringify({kind:'executed_original_source_precheck',result:precheck})},'codex');
 const plan=await engine.develop({...args,action:'plan',model_data_approved:true,read_paths:['port.mjs','port.test.mjs'],write_paths:['port.mjs'],test_paths:['port.test.mjs'],
 acceptance:criteria.join(' '),stop_conditions:'Stop on uncertain execution, changed scope, backend error, failed independent QA or exhausted two generation attempts. No installs, network in tests, source integration or external actions.',data_policy:'Only the manually supplied fictional parser, tests and extraction brief may go to existing host model.',source_instruction:'Fictional fixture authorizes inspection and sharing of these two fixture files for this matched local evaluation.',max_attempts:2,timeout_ms:5000,max_output_bytes:20000,max_bytes:20000,expires_at:new Date(Date.now()+3600000).toISOString()},'codex');
 await engine.develop({...args,action:'authorize',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,model_data_approved:true,source_instruction:'Fictional test grant: allow this exact fixture scope, executed tests, independent review and acceptance; at most two generations.'},'codex');
 const report={mode,execution:native?'native_cli':'synthetic_contract_double',root,fixture_sha256:digest(JSON.stringify({criteria,initialSource,testSource})),selections,events:[],calls:[],attempts:[],accepted:false,errors:[],founder_requests:[],precheck:{status:precheck.status,exit_code:precheck.exit_code,tests_executed:precheck.tests_executed}};
 const started=performance.now();
 const event=(type,extra={})=>{const v={type,at_ms:elapsed(started),...extra};report.events.push(v);return v;};
 const checkpoint=()=>fs.writeFileSync(path.join(root,'workflow-local.json'),JSON.stringify(report,null,2)+'\n');
 const {dispatch}=createWorkflow({args,report,started,native,model,sharedBudget,maxCalls:protocol.criteria.max_native_calls_total,runtimeReady,runtimeCatalog,checkpoint,selections,taskByRole:role=>role==='research'?'Extract these exact fictional criteria in order. Return content as a JSON string containing {"criteria":[...]}. Preserve exact text. Brief: '+JSON.stringify(criteria):role==='engineer'?'Repair parsePort in the exact supplied scope. The original test failure is supplied. Preserve the read-only acceptance tests; return only port.mjs in files.':'Independently inspect exact candidate, immutable tests, actual runtime receipt and extracted criteria. Pass only when all criteria and actual passing execution are evidenced. Return exact required candidate and receipt hashes. No execution claims.'});
 try {
  let extraction,generation;
  if(mode==='serial'){extraction=await dispatch('research');generation=await dispatch('engineer',{development_id:plan.id,input_ids:[failure.id]});}
  else {const both=await Promise.allSettled([dispatch('research'),dispatch('engineer',{development_id:plan.id,input_ids:[failure.id]})]);for(const r of both)if(r.status==='rejected')throw r.reason;[extraction,generation]=both.map(r=>r.value);}
  const extracted=JSON.parse(extraction.artifact.content);report.extraction_correct=JSON.stringify(extracted.criteria)===JSON.stringify(criteria);if(!report.extraction_correct)throw Error('Extraction failed deterministic exact grading; hold without retry');
  let receipt,testJob;
  for(let attempt=1;attempt<=2;attempt++){
   const testStart=performance.now();testJob=await engine.develop({...args,action:'run',plan_id:plan.id,candidate_id:generation.artifact.id},'codex');event('tests_queued',{job_id:testJob.id});
   const ended=await waitTest(root,testJob.id);receipt=ended.receipt;
   const entry={attempt,candidate_id:generation.artifact.id,candidate_sha256:generation.artifact.development.candidate_sha256,test_job_id:testJob.id,test_status:ended.job.status,receipt_id:receipt?.id??null,receipt_sha256:receipt?.development?.receipt_sha256??null,result:receipt?.development?.result??null,test_elapsed_ms:elapsed(testStart)};report.attempts.push(entry);event('tests_returned',{attempt,status:entry.result?.status});checkpoint();
   if(ended.job.status!=='completed'||!receipt||receipt.development.result.tests_executed!==true)throw Error('Runtime test execution incomplete or uncertain; no repair');
   if(receipt.development.result.status==='passed'&&receipt.development.result.exit_code===0)break;
   if(attempt===2)throw Error('Deterministic tests failed and repair allowance exhausted');
   event('repair_requested',{failed_receipt_id:receipt.id});generation=await dispatch('engineer',{development_id:plan.id,input_ids:[failure.id,receipt.id]});
  }
  const qa=await dispatch('qa',{review_of:receipt.id,input_ids:[extraction.artifact.id],depends_on:[testJob.id,extraction.job.id]});
  report.review={id:qa.artifact.id,review_of:qa.artifact.review_of,native_id:qa.job.native_id,author_native_id:generation.job.native_id,verdict:qa.artifact.review?.verdict,candidate_sha256:qa.artifact.review?.candidate_sha256,receipt_sha256:qa.artifact.review?.receipt_sha256};
  if(qa.artifact.review?.verdict!=='Pass')throw Error('Independent review holds; no automatic review retry');
  const accepted=await engine.develop({...args,action:'accept',plan_id:plan.id,receipt_id:receipt.id,review_id:qa.artifact.id,receipt_sha256:receipt.development.receipt_sha256},'codex');
  report.acceptance=accepted;report.accepted=true;event('receiver_accepted',{candidate_sha256:accepted.candidate_sha256,receipt_sha256:accepted.receipt_sha256});
 }catch(e){report.errors.push(safeError(e));event('held',{reason:e.message});report.founder_requests.push({reason:e.message,stage:'held_outcome',kind:'requires_attention',synthetic_harness_decision:true});}
 finally {
  const state=read(root);report.founder_notices=state.notices.filter(n=>n.kind==='decision_required').map(n=>({id:n.id,summary:n.summary,reference:n.reference}));
  report.elapsed_ms=elapsed(started);report.metrics={model_calls:report.calls.length,generation_attempts:report.attempts.length,repairs:report.events.filter(e=>e.type==='repair_requested').length,failed_test_attempts:report.attempts.filter(a=>a.result?.status==='failed').length,founder_requests:report.founder_requests.length,founder_requests_basis:'Software harness needs-attention events; no natural founder behavior measured',decision_required_notices:report.founder_notices.length,prompt_bytes:report.calls.reduce((n,c)=>n+c.prompt_bytes,0),output_bytes:report.calls.reduce((n,c)=>n+(c.output_bytes??0),0),control_path_max_ms:Math.max(0,...report.events.filter(e=>e.type==='dispatch').map(e=>e.control_ms))};
  report.original_source_unchanged=fs.readFileSync(path.join(root,'port.mjs'),'utf8')===initialSource;checkpoint();
 }
 return report;
}
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function verifySourceIdentity(before,after){
 const valid=value=>value&&Array.isArray(value.files)&&value.files.length>0&&value.files.every(f=>typeof f.path==='string'&&sha(f.sha256))&&value.manifest_sha256===digest(JSON.stringify(value.files))&&typeof value.design_base_revision==='string'&&(value.observed_git_revision===null||/^[a-f0-9]{40}$/.test(value.observed_git_revision))&&value.node&&sha(value.node.executable_sha256)&&['version','platform','arch'].every(k=>typeof value.node[k]==='string');
 const errors=[];
 if(!valid(before)||!valid(after))errors.push('Missing or invalid source/runtime fingerprint');
 else if(canonical(before)!==canonical(after))errors.push('Source or Node runtime fingerprint changed during evaluation');
 return {passed:errors.length===0,status:errors.length?'held':'matched',before_manifest_sha256:before?.manifest_sha256??null,after_manifest_sha256:after?.manifest_sha256??null,errors};
}
export function captureSourceVerification(before,capture=sourceIdentity){
 try {const after=capture();return {after,verification:verifySourceIdentity(before,after)};}
 catch(e){return {after:null,verification:{passed:false,status:'held',before_manifest_sha256:before?.manifest_sha256??null,after_manifest_sha256:null,errors:['Post-run source fingerprint could not be captured: '+e.message]}};}
}
export function assessPair(arms,sourceVerification=null){
 const armErrors=a=>{
  const errors=[];
  if(!a||typeof a!=='object')return ['Missing arm'];
  const last=Array.isArray(a.attempts)?a.attempts.at(-1):null,review=a.review,acceptance=a.acceptance,calls=a.calls;
  if(a.accepted!==true||a.extraction_correct!==true||a.original_source_unchanged!==true)errors.push('Outcome was not correctly accepted');
  if(!Array.isArray(a.errors)||a.errors.length||a.held===true||a.status==='held'||!Array.isArray(a.events)||a.events.some(e=>!e||e.type==='held'))errors.push('Held or errored outcome');
  if(!Array.isArray(a.founder_requests)||a.founder_requests.length||!Array.isArray(a.founder_notices)||a.founder_notices.length)errors.push('Unresolved attention or decision event');
  if(!Array.isArray(calls)||!calls.length||calls.some(c=>!c||c.error!=null||!['research','engineer','qa'].includes(c.role)||typeof c.native_id!=='string'||!c.native_id.trim()||canonical(c.requested)!==canonical(a.selections?.[c.role])))errors.push('Missing, errored or mismatched model call evidence');
  if(review?.verdict!=='Pass'||typeof review.native_id!=='string'||!review.native_id.trim()||typeof review.author_native_id!=='string'||!review.author_native_id.trim()||review.native_id===review.author_native_id)errors.push('Missing explicit independent QA Pass');
  if(!last||last.test_status!=='completed'||last.result?.tests_executed!==true||last.result.status!=='passed'||last.result.exit_code!==0||last.result.candidate_sha256!==last.candidate_sha256||!sha(last.candidate_sha256)||!sha(last.receipt_sha256))errors.push('Missing actual passing exact-candidate test');
  if(!last||!review||!acceptance||![last.receipt_id,last.candidate_id,last.test_job_id,review.id,acceptance.review_id].every(value=>typeof value==='string'&&value.trim())||!Number.isInteger(review.review_of?.revision)||review.review_of.revision<1||review.review_of?.id!==last.receipt_id||review.candidate_sha256!==last.candidate_sha256||review.receipt_sha256!==last.receipt_sha256||acceptance.candidate_sha256!==last.candidate_sha256||acceptance.receipt_sha256!==last.receipt_sha256||acceptance.review_id!==review.id||acceptance.source_integrated!==false)errors.push('Review or acceptance binding mismatch');
  if(Array.isArray(calls)){
   const authors=calls.filter(c=>c?.role==='engineer'),reviewers=calls.filter(c=>c?.role==='qa');
   if(calls.filter(c=>c?.role==='research').length!==1||reviewers.length!==1||authors.length!==a.attempts?.length||reviewers[0]?.native_id!==review?.native_id||authors.at(-1)?.native_id!==review?.author_native_id)errors.push('Role call lineage does not match acceptance');
  }
  if(a.precheck?.tests_executed!==true||a.precheck.status!=='failed'||a.precheck.exit_code===0)errors.push('Seeded original failure was not executed');
  if(!Number.isFinite(a.elapsed_ms)||a.elapsed_ms<=0||!sha(a.fixture_sha256)||!['native_cli','synthetic_contract_double'].includes(a.execution)||!a.selections)errors.push('Incomplete arm comparison metadata');
  return errors;
 };
 const errors=[],list=Array.isArray(arms)?arms:[],modes=list.map(a=>a?.mode);
 if(list.length!==2||modes.filter(x=>x==='serial').length!==1||modes.filter(x=>x==='concurrent').length!==1)errors.push('Require exactly one serial and one concurrent arm');
 if(list.length===2&&(!list[0]||!list[1]||list[0].fixture_sha256!==list[1].fixture_sha256||list[0].execution!==list[1].execution||canonical(list[0].selections)!==canonical(list[1].selections)))errors.push('Fixture, execution kind or model settings differ between arms');
 const arm_errors=list.map(a=>({mode:a?.mode??null,errors:armErrors(a)}));
 if(sourceVerification!==null&&(sourceVerification.passed!==true||sourceVerification.status!=='matched'||sourceVerification.errors?.length!==0))errors.push('Source verification held');
 return {passed:errors.length===0&&arm_errors.every(a=>!a.errors.length),quality_errors:arm_errors.filter(a=>a.errors.length).length,errors,arm_errors,source_verification_required:sourceVerification!==null,serial_ms:list.find(a=>a?.mode==='serial')?.elapsed_ms??null,concurrent_ms:list.find(a=>a?.mode==='concurrent')?.elapsed_ms??null,descriptive_only:true,causal_speedup_established:false};
}
async function main(argv){
 if(argv.length<2||!['--native','--contract-double'].includes(argv[0]))throw Error('Use --native|--contract-double NEW_OUTPUT_DIRECTORY');
 const native=argv[0]==='--native',directory=path.resolve(argv[1]);
 if(fs.existsSync(directory))throw Error('Choose a new output directory; preserve prior failures');
 fs.mkdirSync(directory,{recursive:true});process.env.COMPANY_PLUGIN_DATA=path.join(directory,'fixture-bindings');
 fs.writeFileSync(path.join(directory,'predeclared-protocol.json'),JSON.stringify(protocol,null,2)+'\n',{flag:'wx'});
 const capability=sandboxCapability();if(!capability.supported)throw Error(capability.blocker);
 const ready=native?readiness('codex'):null,catalog=native?modelCatalog('codex'):null;if(native&&!ready.available)throw Error(ready.error);
 const source_identity=sourceIdentity();fs.writeFileSync(path.join(directory,'source-identity.json'),JSON.stringify(source_identity,null,2)+'\n',{flag:'wx'});
 const arms=[],sharedBudget={calls:0};let result;
 for(const mode of ['serial','concurrent']){
  const arm=await runArm({directory,mode,native,sharedBudget,runtimeReady:ready,runtimeCatalog:catalog});arms.push(arm);
  const {after:source_identity_after,verification:source_verification}=captureSourceVerification(source_identity);
  result=assessPair(arms,source_verification);
  const report={protocol,source_identity,source_identity_after,source_verification,execution:native?'native_cli':'synthetic_contract_double',arms:arms.map(publicReport),assessment:result};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(directory,'source-verification.json'),JSON.stringify({before:source_identity,after:source_identity_after,verification:source_verification},null,2)+'\n');
  console.log(JSON.stringify({mode,accepted:arm.accepted,metrics:arm.metrics,errors:arm.errors,source_verification}));
  if(!source_verification.passed||arm.calls.some(c=>c.error))break;
 }
 if(!result?.passed)process.exitCode=1;console.log(JSON.stringify(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
