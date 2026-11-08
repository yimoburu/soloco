import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {id,digest} from '../plugins/soloco/runtime/store.mjs';
import {readiness,modelCatalog} from '../plugins/soloco/runtime/adapters.mjs';
import {sandboxCapability,runLocalTests} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {createWorkflow,read,waitTest,errorEvidence,publicReport} from './workflow-runtime.mjs';

export const protocol=Object.freeze({version:1,kind:'accepted_candidate_format_comparison',
  design_base_revision:'9c0cb8a9d40da42242787b1bbaacfa11ba37acdc',
  fixture:{module_bytes:32768,module_counts:[1,3],formats:['files','patches']},
  criteria:{max_native_calls_total:8,max_generation_attempts_per_case:1,max_test_attempts_per_case:1,max_qa_attempts_per_case:1,critical_false_acceptances:0,quality_error_margin:0,latency_improvement_required:false},
  limits:{scope_max_bytes:200000,configuration_ceiling:200000,native_timeout_ms:300000,test_timeout_ms:10000,test_wait_ms:20000},
  order:'one-file files, one-file patches, three-file files, three-file patches; sequential, no retries',
  acceptance:'Real production dispatch and worker produce a retained exact candidate. Actual sandboxed tests must pass; a different native QA must permit the exact candidate and actual receipt; the fixture receiver then calls production accept. Exact grading additionally compares all complete candidate bytes against the known fixture.',
  limitations:['One observation per arm; descriptive results cannot establish statistical quality noninferiority, production reliability, cost savings or causal latency gains.','Only manually supplied fictional modules and fixed tests are shared with the existing host model. Synthetic company binding and grant are fixture data; no actual company state or authority changes.','Requested/applied model controls differ from effective provider settings; missing observations remain unknown.','All failed or uncertain calls stay retained and hold that case without retry. Source integration, installation and deployment are outside this evaluation.']});
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
export const defaultSelections={engineer:{mode:'explicit',model:'gpt-6.1-sol',effort:'medium',speed:'host_default',reason:'Exact one-character fictional module repairs; identical model controls in all format arms.'},qa:{mode:'explicit',model:'gpt-6.1-sol',effort:'high',speed:'host_default',reason:'Independent complete candidate, actual receipt and exact fixture preservation review; identical controls in all arms.'}};
export function modelSelections(model='gpt-6.1-sol',engineerEffort='medium',qaEffort='high'){
  return Object.fromEntries(Object.entries(defaultSelections).map(([role,value])=>[role,{...value,model,effort:role==='engineer'?engineerEffort:qaEffort}]));
}
export function validateModelSelections(selections,catalog){
  if(!catalog?.supported)throw Error('A supported current host catalog is required');
  for(const role of ['engineer','qa']){const selected=selections?.[role],entry=catalog.models?.find(m=>m.id===selected?.model);
    if(selected?.mode!=='explicit'||selected.speed!=='host_default'||!entry||!entry.supported_efforts?.includes(selected.effort))throw Error('Predeclared '+role+' model/effort is not supported by the inspected host catalog');}
  return true;
}
export function matchesModelPolicy(call,selections=defaultSelections){
  const expected=selections?.[call?.role],actual=call?.requested;
  return !!expected&&!!actual&&['mode','model','effort','speed','reason'].every(key=>actual[key]===expected[key]);
}
export function sourceIdentity(base=fileURLToPath(new URL('../',import.meta.url))){
  const files=[];
  const walk=dir=>{for(const e of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){const p=path.posix.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())files.push({path:p,sha256:digest(fs.readFileSync(path.join(base,p)))});}};
  walk('plugins/soloco');for(const p of ['SPEC.md','tools/candidate-format-qualification.mjs','tools/workflow-runtime.mjs','tools/verify-candidate-format-qualification.mjs','tests/candidate-format-qualification.test.mjs'])files.push({path:p,sha256:digest(fs.readFileSync(path.join(base,p)))});files.sort((a,b)=>a.path.localeCompare(b.path));
  let git_head=null;try{git_head=execFileSync('git',['rev-parse','HEAD'],{cwd:base,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  return {design_base_revision:protocol.design_base_revision,git_head,identity_rule:'Exact file manifest controls applicability; a design baseline or Git HEAD alone is insufficient.',files,manifest_sha256:digest(JSON.stringify(files)),node:{version:process.version,platform:process.platform,arch:process.arch,executable_sha256:digest(fs.readFileSync(process.execPath))}};
}

const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function verifySourceIdentity(before,after){
  const valid=value=>value&&Array.isArray(value.files)&&value.files.length>0&&value.files.every(f=>nonempty(f.path)&&sha(f.sha256))&&new Set(value.files.map(f=>f.path)).size===value.files.length&&value.manifest_sha256===digest(JSON.stringify(value.files))&&nonempty(value.design_base_revision)&&(value.git_head===null||/^[a-f0-9]{40}$/.test(value.git_head))&&sha(value.node?.executable_sha256)&&['version','platform','arch'].every(k=>nonempty(value.node[k]));
  const errors=[];
  if(!valid(before)||!valid(after))errors.push('Missing or invalid source/runtime fingerprint');
  else if(JSON.stringify(before)!==JSON.stringify(after))errors.push('Source or Node runtime fingerprint changed during evaluation');
  return {passed:errors.length===0,status:errors.length?'held':'matched',before_manifest_sha256:before?.manifest_sha256??null,after_manifest_sha256:after?.manifest_sha256??null,errors};
}
export function captureSourceVerification(before,capture=sourceIdentity){
  try{const after=capture();return {after,verification:verifySourceIdentity(before,after)};}
  catch(error){return {after:null,verification:{passed:false,status:'held',before_manifest_sha256:before?.manifest_sha256??null,after_manifest_sha256:null,errors:['Post-run source fingerprint could not be captured: '+error.message]}};}
}

export function fixture(count){
  if(![1,3].includes(count))throw Error('Supported module counts are one or three');
  const prefix='export const value = 0;\n',line='// fixed fictional padding preserved exactly\n';
  const padBytes=protocol.fixture.module_bytes-Buffer.byteLength(prefix)-5;
  const padding=line.repeat(Math.floor(padBytes/line.length))+'x'.repeat(padBytes%line.length);
  const sources=Array.from({length:count},(_,i)=>({path:`module-${i}.mjs`,content:prefix+'/*'+padding+'*/\n'}));
  // A trailing comment is generated as one exact byte sequence; every module has
  // a known complete expected digest, so elided or altered padding cannot pass.
  const expected=sources.map(f=>({...f,content:f.content.replace('= 0;','= 1;')}));
  const testContent="import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';\n"+
    sources.map((f,i)=>`import {value as value${i}} from './${f.path}';`).join('\n')+
    `\ntest('exact values and complete unchanged module bytes',()=>{${expected.map((f,i)=>`assert.equal(value${i},1);assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./${f.path}',import.meta.url))).digest('hex'),'${digest(f.content)}');`).join('')}});\n`;
  return {sources,expected,test:{path:'fixture.test.mjs',content:testContent}};
}

export function contractModel({count=1,format='files',badCandidate=false,qaVerdict='Pass'}={}){return async({job,target},host,native,prompt,cwd,timeout,selection,options)=>{
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
  const output={content:'Synthetic contract exercise only; no native semantic QA.',messages:[],notices:[]};
  if(job.development_id){
    const sources=fixture(count).sources;
    if(format==='patches')output.patches=sources.map(f=>({path:f.path,base_sha256:digest(f.content),edits:[{start:21,end:22,text:badCandidate?'2':'1'}]}));
    else output.files=sources.map(f=>({path:f.path,content:f.content.replace('= 0;',badCandidate?'= 2;':'= 1;')}));
  }else output.review={verdict:qaVerdict,reason:'Synthetic exact binding exercise only.',permitted_action:qaVerdict==='Pass'?'accept_local_development':'hold',candidate_sha256:target.development.candidate_sha256,receipt_sha256:target.development.receipt_sha256,blockers:qaVerdict==='Pass'?[]:['Injected hold']};
  return {native_id:id('contract-double'),text:JSON.stringify(output),model_evidence:{verification:'synthetic_contract_double'}};
};}

export async function runCase({directory,count,format,native=false,model,sharedBudget={calls:0},runtimeReady,runtimeCatalog,sourceManifest=sourceIdentity(),selections=defaultSelections}){
  if(!protocol.fixture.formats.includes(format))throw Error('Unsupported format');
  const root=path.join(directory,`${count}-${format}`);fs.mkdirSync(root,{recursive:true});
  const args={root,session_id:id('fictional-founder'),epoch:1},data=fixture(count);
  engine.bind(root,args.session_id,'codex');engine.open({...args,name:'Fictional candidate format comparison',idea:'Qualify exact small repairs in larger files through actual retained-candidate acceptance.'},'codex');
  fs.writeFileSync(path.join(root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:protocol.limits.configuration_ceiling}));
  for(const file of [...data.sources,data.test])fs.writeFileSync(path.join(root,file.path),file.content);
  const precheck=await runLocalTests({directory:root,test_paths:[data.test.path],timeout_ms:protocol.limits.test_timeout_ms,max_output_bytes:20000});
  if(precheck.tests_executed!==true||precheck.status!=='failed'||precheck.exit_code===0)throw Error('Original fixture must actually fail the fixed tests');
  const failure=engine.save({...args,kind:'artifact',content:JSON.stringify({kind:'executed_original_source_failure',result:precheck})},'codex');
  const plan=await engine.develop({...args,action:'plan',model_data_approved:true,read_paths:[...data.sources.map(f=>f.path),data.test.path],write_paths:data.sources.map(f=>f.path),test_paths:[data.test.path],output_format:format,
    acceptance:'Change every module exported value from0 to1 and preserve every other byte. Fixed tests and exact complete expected hashes must pass; current independent QA must permit the exact candidate and actual test receipt.',
    stop_conditions:'One generation only. Stop on failed tests, invalid/incomplete output, uncertain provider/process outcome, changed source/scope, backend error or nonpassing independent QA. No repairs or automatic retries.',data_policy:'Only the manually supplied fictional modules, their fixed tests and this fixture evidence may be shared with the existing host model.',source_instruction:'Fictional fixture grants inspection/sharing of the declared fictional modules and tests for this bounded format comparison.',max_attempts:1,timeout_ms:protocol.limits.test_timeout_ms,max_output_bytes:20000,max_bytes:protocol.limits.scope_max_bytes,expires_at:new Date(Date.now()+3600000).toISOString()},'codex');
  await engine.develop({...args,action:'authorize',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,model_data_approved:true,source_instruction:'Fictional fixture grant authorizes this exact one-attempt scope, selected output format, actual isolated tests, fresh independent QA and retained-candidate acceptance only.'},'codex');
  const report={count,format,model_selection_policy:structuredClone(selections),model_selection_policy_sha256:digest(JSON.stringify(selections)),execution:native?'native_cli':'synthetic_contract_double',root,source_manifest_sha256:sourceManifest.manifest_sha256,scope_sha256:plan.development.scope_sha256,fixture_sha256:digest(JSON.stringify(data)),module_bytes:data.sources.map(f=>Buffer.byteLength(f.content)),source_bytes:bytes(data.sources),expected_candidate_bytes:bytes([...data.expected,data.test].sort((a,b)=>a.path.localeCompare(b.path))),events:[],calls:[],attempts:[],accepted:false,errors:[],repairs:0,stage:'producer',precheck:{status:precheck.status,exit_code:precheck.exit_code,tests_executed:precheck.tests_executed}};
  const started=performance.now(),checkpoint=()=>fs.writeFileSync(path.join(root,'qualification-local.json'),JSON.stringify(report,null,2)+'\n');
  const {dispatch,event}=createWorkflow({args,report,started,native,model:model??contractModel({count,format}),sharedBudget,maxCalls:protocol.criteria.max_native_calls_total,runtimeReady,runtimeCatalog,checkpoint,selections,timeoutMs:protocol.limits.native_timeout_ms,
    taskByRole:{engineer:`Change each authorized module's exported value from 0 to 1. Preserve every other character including all padding. The fixed read-only tests and original failure are supplied. Return only the selected scope output_format ${format}; never elide unchanged content in full-file mode. This is one attempt without repair.`,qa:'Independently review the entire exact retained candidate, fixed read-only tests, original failure, reconstructed diff and actual runtime receipt. Verify each exported value changed0 to1 and all remaining bytes are preserved. Pass only with real passed tests and no blocker. Return the exact candidate and receipt hashes permitting accept_local_development.'}});
  try{
    const generation=await dispatch('engineer',{development_id:plan.id,input_ids:[failure.id]});
    report.generation={candidate_id:generation.artifact.id,native_id:generation.job.native_id,candidate_sha256:generation.artifact.development.candidate_sha256,byte_accounting:generation.artifact.development.generation};
    const complete=generation.artifact.development.files;
    report.exact_fixture_match=Array.isArray(complete)&&JSON.stringify(complete)===JSON.stringify([...data.expected,data.test].sort((a,b)=>a.path.localeCompare(b.path)));
    report.stage='candidate_validation';
    if(!report.exact_fixture_match)throw Error('Complete generated candidate does not match the known exact fixture; retained without test or retry');
    report.stage='tests';const testStart=performance.now(),job=await engine.develop({...args,action:'run',plan_id:plan.id,candidate_id:generation.artifact.id},'codex');event('tests_queued',{job_id:job.id});
    const ended=await waitTest(root,job.id,protocol.limits.test_wait_ms),receipt=ended.receipt;
    report.attempts.push({test_job_id:job.id,receipt_id:receipt?.id??null,receipt_sha256:receipt?.development?.receipt_sha256??null,result:receipt?.development?.result??null,test_elapsed_ms:performance.now()-testStart});checkpoint();
    if(ended.job.status!=='completed'||receipt?.development?.result?.tests_executed!==true||receipt.development.result.status!=='passed'||receipt.development.result.exit_code!==0)throw Error('Actual sandboxed test receipt is incomplete or nonpassing; no retry');
    report.stage='independent_qa';const qa=await dispatch('qa',{review_of:receipt.id,input_ids:[failure.id],depends_on:[job.id]});
    report.review={id:qa.artifact.id,native_id:qa.job.native_id,author_native_id:generation.job.native_id,verdict:qa.artifact.review?.verdict,candidate_sha256:qa.artifact.review?.candidate_sha256,receipt_sha256:qa.artifact.review?.receipt_sha256};
    if(qa.artifact.review?.verdict!=='Pass')throw Error('Independent QA holds this exact candidate; no review retry');
    report.stage='acceptance';report.acceptance=await engine.develop({...args,action:'accept',plan_id:plan.id,receipt_id:receipt.id,review_id:qa.artifact.id,receipt_sha256:receipt.development.receipt_sha256},'codex');
    report.accepted=true;report.stage='accepted';event('receiver_accepted',{candidate_sha256:report.acceptance.candidate_sha256,receipt_sha256:report.acceptance.receipt_sha256});
  }catch(error){report.errors.push(errorEvidence(error));report.held_stage=report.stage;event('held',{stage:report.stage,reason:error.message});}
  finally{report.elapsed_ms=performance.now()-started;report.original_source_unchanged=data.sources.every(f=>fs.readFileSync(path.join(root,f.path),'utf8')===f.content);const state=read(root),producer=state.jobs[report.calls.find(c=>c.role==='engineer')?.job_id];let rejected;try{rejected=JSON.parse(producer?.rejected_output?.text??'null');}catch{}
    report.generation_validation={outcome:producer?.status==='completed'?'candidate_returned':rejected?.blocked?'producer_blocked':producer?.rejected_output?'invalid_or_incomplete_output':report.calls.some(c=>c.role==='engineer'&&c.error)?'provider_or_backend_failure':'admission_or_runtime_failure',producer_block:rejected?.blocked??null,exact_fixture_match:report.generation?report.exact_fixture_match:null};
    report.metrics={model_calls:report.calls.length,producer_calls:report.calls.filter(c=>c.role==='engineer').length,qa_calls:report.calls.filter(c=>c.role==='qa').length,repairs:0,producer_blocks:report.generation_validation.outcome==='producer_blocked'?1:0,invalid_or_incomplete_outputs:report.generation_validation.outcome==='invalid_or_incomplete_output'?1:0,exact_fixture_mismatches:report.generation&&report.exact_fixture_match===false?1:0,prompt_bytes:report.calls.reduce((n,c)=>n+c.prompt_bytes,0),output_bytes:report.calls.reduce((n,c)=>n+(c.output_bytes??0),0),time_to_accepted_result_ms:report.accepted?report.elapsed_ms:null};checkpoint();}
  return report;
}

export function assess(cases,sourceVerification=null,selections=defaultSelections){
  const list=Array.isArray(cases)?cases:[],expected=new Set(['1-files','1-patches','3-files','3-patches']),seen=new Set(list.map(c=>`${c?.count}-${c?.format}`));
  const identities=list.length===4&&seen.size===4&&[...seen].every(k=>expected.has(k))&&new Set(list.map(c=>c.execution)).size===1&&['native_cli','synthetic_contract_double'].includes(list[0]?.execution)&&new Set(list.map(c=>c.source_manifest_sha256)).size===1&&sha(list[0]?.source_manifest_sha256);
  const valid=c=>{
    if(!c||![1,3].includes(c.count)||!Array.isArray(c.calls)||!Array.isArray(c.attempts)||!Array.isArray(c.errors)||!Array.isArray(c.events))return false;
    const author=c.calls.find(x=>x?.role==='engineer'),reviewer=c.calls.find(x=>x?.role==='qa'),attempt=c.attempts[0],candidateHash=c.generation?.candidate_sha256;
    return c.accepted===true&&c.exact_fixture_match===true&&c.original_source_unchanged===true&&c.repairs===0&&c.errors.length===0&&!c.calls.some(x=>!x||x.error)&&!c.events.some(x=>!x||x.type==='held')&&
      c.calls.length===2&&c.calls.filter(x=>x.role==='engineer').length===1&&c.calls.filter(x=>x.role==='qa').length===1&&c.calls.every(x=>nonempty(x.native_id)&&nonempty(x.job_id)&&matchesModelPolicy(x,selections))&&(c.model_selection_policy===undefined?JSON.stringify(selections)===JSON.stringify(defaultSelections):JSON.stringify(c.model_selection_policy)===JSON.stringify(selections)&&c.model_selection_policy_sha256===digest(JSON.stringify(selections)))&&
      c.fixture_sha256===digest(JSON.stringify(fixture(c.count)))&&c.precheck?.tests_executed===true&&c.precheck.status==='failed'&&Number.isInteger(c.precheck.exit_code)&&c.precheck.exit_code!==0&&Number.isFinite(c.elapsed_ms)&&c.elapsed_ms>0&&
      sha(candidateHash)&&nonempty(c.generation.candidate_id)&&c.generation.native_id===author.native_id&&c.generation.byte_accounting?.format===c.format&&c.review?.verdict==='Pass'&&nonempty(c.review.id)&&c.review.native_id===reviewer.native_id&&c.review.author_native_id===author.native_id&&reviewer.native_id!==author.native_id&&
      c.events.some(e=>e.type==='returned'&&e.role==='engineer'&&e.job_id===author.job_id&&e.artifact_id===c.generation.candidate_id)&&c.events.some(e=>e.type==='returned'&&e.role==='qa'&&e.job_id===reviewer.job_id&&e.artifact_id===c.review.id)&&
      c.attempts.length===1&&nonempty(attempt?.test_job_id)&&nonempty(attempt.receipt_id)&&sha(attempt.receipt_sha256)&&attempt.result?.tests_executed===true&&attempt.result.status==='passed'&&attempt.result.exit_code===0&&attempt.result.candidate_sha256===candidateHash&&
      c.acceptance?.review_id===c.review.id&&c.acceptance.source_integrated===false&&c.acceptance.candidate_sha256===candidateHash&&c.review.candidate_sha256===candidateHash&&c.review.receipt_sha256===attempt.receipt_sha256&&c.acceptance.receipt_sha256===attempt.receipt_sha256;
  };
  const sourceMatched=sourceVerification===null||(sourceVerification?.passed===true&&sourceVerification.status==='matched'&&sourceVerification.errors?.length===0&&sourceVerification.before_manifest_sha256===list[0]?.source_manifest_sha256&&sourceVerification.after_manifest_sha256===list[0]?.source_manifest_sha256);
  return {passed:identities&&sourceMatched&&list.every(valid),unique_expected_cases:identities,source_verification_required:sourceVerification!==null,source_verification_passed:sourceMatched,accepted_cases:list.filter(valid).length,total_cases:list.length,critical_false_acceptances:list.filter(c=>c?.accepted&&!valid(c)).length,statistical_noninferiority_established:false,causal_latency_improvement_established:false};
}
async function main(argv){
  if(![2,5].includes(argv.length)||!['--native','--contract-double'].includes(argv[0]))throw Error('Use --native|--contract-double NEW_OUTPUT_DIRECTORY [MODEL ENGINEER_EFFORT QA_EFFORT]');
  const selections=modelSelections(...argv.slice(2));
  const native=argv[0]==='--native',directory=path.resolve(argv[1]);if(fs.existsSync(directory))throw Error('Preserve evidence: choose a new output directory');fs.mkdirSync(directory,{recursive:true});
  process.env.COMPANY_PLUGIN_DATA=path.join(directory,'fixture-bindings');const sourceManifest=sourceIdentity(),runProtocol={...protocol,model_selection_policy:selections,model_selection_policy_sha256:digest(JSON.stringify(selections)),source_identity:sourceManifest};fs.writeFileSync(path.join(directory,'predeclared-protocol.json'),JSON.stringify(runProtocol,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(directory,'frozen-source-identity.json'),JSON.stringify(sourceManifest,null,2)+'\n',{flag:'wx'});
  for(const file of sourceManifest.files){const destination=path.join(directory,'frozen-source',file.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(fileURLToPath(new URL('../',import.meta.url)),file.path),destination,fs.constants.COPYFILE_EXCL);}
  const capability=sandboxCapability();if(!capability.supported)throw Error(capability.blocker);
  const ready=native?readiness('codex'):null,catalog=native?modelCatalog('codex'):null;if(native&&(!ready.available||!ready.authenticated))throw Error(ready.error??'Native CLI is unavailable or unauthenticated');
  if(native)validateModelSelections(selections,catalog);
  const cases=[],sharedBudget={calls:0};let result;
  for(const [count,format] of protocol.fixture.module_counts.flatMap(count=>protocol.fixture.formats.map(format=>[count,format]))){
    const observation=await runCase({directory,count,format,native,sharedBudget,runtimeReady:ready,runtimeCatalog:catalog,sourceManifest,selections});cases.push(observation);
    const {after:source_identity_after,verification:source_verification}=captureSourceVerification(sourceManifest);
    result=assess(cases,source_verification,selections);
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({protocol:runProtocol,source_identity_after,source_verification,execution:native?'native_cli':'synthetic_contract_double',cases:cases.map(publicReport),assessment:result},null,2)+'\n');console.log(JSON.stringify({count,format,accepted:cases.at(-1).accepted,metrics:cases.at(-1).metrics,errors:cases.at(-1).errors,source_verification}));
    if(!source_verification.passed||cases.at(-1).calls.some(c=>c.error?.termination_confirmed!==true&&c.error))break;
  }
  console.log(JSON.stringify(result));if(!result?.passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
