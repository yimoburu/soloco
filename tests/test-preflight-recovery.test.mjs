import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {digest,id,installedTeam,teamHash,VERSION,withStore} from '../plugins/soloco/runtime/store.mjs';
import {developmentAction,developmentAssignment,developmentBundle,executeDevelopmentTest,executePreflightDiagnostic,executeDevelopmentWorker,validTestExecution} from '../plugins/soloco/runtime/develop.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {selectionUsage,activityFor} from '../plugins/soloco/runtime/selection.mjs';
import {usageView} from '../plugins/soloco/runtime/state-projections.mjs';
import {currentView} from '../plugins/soloco/runtime/public-response.mjs';
import {progressFor} from '../plugins/soloco/runtime/progress.mjs';
import {progressSnapshot,renderProgress} from '../plugins/soloco/runtime/progress-view.mjs';
import {fingerprintValidation,validationManifest} from '../plugins/soloco/runtime/validation-cache.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-preflight-recovery-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'bindings-cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const read=a=>withStore(a.root,db=>db.read());
const mutate=(a,fn)=>withStore(a.root,db=>db.transaction('controlled.test',s=>{fn(s);return s;}));
const launches=[];
const transport={spawnWorker(binary,args,options){launches.push({binary,args,options});const child=new EventEmitter();child.unref=()=>{};return child;}};
const scopeArgs={model_data_approved:true,read_paths:['value.mjs'],write_paths:['value.mjs','value.test.mjs'],test_paths:['value.test.mjs'],acceptance:'Retained source has one correct value test.',stop_conditions:'No undeclared files, network, installs or increased allowances.',data_policy:'Only declared synthetic source.',source_instruction:'Create the bounded synthetic source scope.',max_attempts:2,timeout_ms:1000,max_output_bytes:10000,max_bytes:20000};
const files=[{path:'value.mjs',content:'export const value=42;\n'},{path:'value.test.mjs',content:"import test from 'node:test';import assert from 'node:assert/strict';import {value} from './value.mjs';test('value',()=>assert.equal(value,42));\n"}];
const environment=()=>({command:['node','--test','./value.test.mjs'],runtime:{node:'controlled-node',platform:'darwin',arch:'arm64',os_release:'controlled-os',system_build:'25G241',system_descriptor:{protocol:'apple-system-version-plist-v1',sha256:digest('controlled descriptor')},dependencies:[{path:'/controlled/node',sha256:digest('node')}],executable_sha256:digest('node'),runner_sha256:digest('runner')},sandbox:{backend:'controlled-transport-only',policy_sha256:digest('policy')},environment:{LANG:'C',HOME:'/redacted/controlled-home'},limits:undefined});
function fingerprintEnvironment(){const e=environment();delete e.limits;return e;}
const preflightFailure=()=>{throw Object.assign(new Error('Controlled descriptor read failed'),{code:'EIO',phase:'read',method:'system-version-plist'});};
const pass={status:'passed',exit_code:0,signal:null,stdout:'TAP version 13\n# tests 1\n# pass 1\n',stderr:'',duration_ms:1,isolation:'controlled-transport-only',test_execution_attempted:true,tests_executed:true,output_truncated:false};
function setup(){
  const root=fs.mkdtempSync(path.join(base,'company-')),a={root,session_id:id('owner'),epoch:1},team=installedTeam();
  withStore(root,db=>db.transaction('company.created',()=>({schema:2,runtime_version:VERSION,id:id('company'),name:'Controlled recovery',idea:'Synthetic test maintenance only',phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:a.session_id,epoch:1},records:{},sessions:{},jobs:{},messages:[],notices:[],created_at:new Date().toISOString()})),true);
  fs.writeFileSync(path.join(root,'value.mjs'),'export const value=0;\n');return a;
}
async function candidate(a,extra={}){
  let p=await developmentAction({...a,...scopeArgs,...extra,action:'plan',expires_at:new Date(Date.now()+3600000).toISOString()},'codex');
  p=await developmentAction({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:'Authorize exactly two source-generation attempts.'},'codex');
  let c;
  mutate(a,s=>{
    for(let n=0;n<2;n++){
      const key=id('producer'),j={id:key,role:'engineer',instance_id:id('engineer'),session_key:id('session'),host:'codex',native_id:id('controlled-native'),epoch:1,status:'queued',task:'Prepare the synthetic candidate',inputs:[],development_id:p.id,created_at:new Date().toISOString()};
      developmentAssignment(s,j,true,a.root);j.status='completed';j.coordination_release={termination_confirmed:true};s.jobs[key]=j;
      if(n===1){const bundle=developmentBundle(s,j,{files},a.root),context=assignmentContext(s,j);j.inputs=context.inputs;j.context_sha256=context.hash;
        const cid=id('artifact');c=s.records[cid]={id:cid,kind:'artifact',author_role:'engineer',author_instance:j.instance_id,job_id:key,revision:1,status:'Submitted',created_at:new Date().toISOString(),content:'Synthetic proposal',development:bundle};j.artifact_id=cid;}
    }
  });return {p:read(a).records[p.id],c};
}
async function failBeforeRun(a,p,c){
  const j=await developmentAction({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex',transport);let calls=0;
  const t=await executeDevelopmentTest(a.root,j.id,{validationEnvironment:preflightFailure,runLocalTests:async()=>{calls++;return pass;}});
  assert.equal(calls,0);assert.equal(t.development.result.execution_provenance.phase,'preflight');assert.equal(t.development.result.execution_provenance.launch_intent,false);return t;
}
async function diagnose(a,provider=fingerprintEnvironment){
  const j=await developmentAction({...a,action:'diagnose_preflight',source_instruction:'Explicitly request fixed candidate-free worker fingerprint diagnosis.'},'codex',transport);
  return executePreflightDiagnostic(a.root,j.id,{validationEnvironment:provider});
}
function recoveryArgs(a,p,c,t,d){return {...a,action:'recover_preflight',plan_id:p.id,scope_sha256:p.development.scope_sha256,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,receipt_id:t.id,receipt_sha256:t.development.receipt_sha256,diagnostic_id:d.id,diagnostic_sha256:d.development.receipt_sha256,source_instruction:'Recover this exact proven pre-execution failure once under its unchanged original grant.'};}
async function prepared(){const a=setup(),{p,c}=await candidate(a),t=await failBeforeRun(a,p,c),d=await diagnose(a);return {a,p,c,t,d,args:recoveryArgs(a,p,c,t,d)};}

test('future preflight failure has durable zero-launch facts before any runner entry',async()=>{
  const {a,p,c,t}=await prepared(),s=read(a),j=s.jobs[t.author_instance],proof=t.development.result.execution_provenance;
  assert.deepEqual(proof,j.execution_provenance);assert.equal(proof.runner_entered,false);assert.equal(proof.worker_pid,process.pid);assert.match(proof.implementation_sha256,/^[a-f0-9]{64}$/);assert.match(proof.worker_nonce,/preflight-worker-/);
  assert.equal(t.development.result.tests_executed,false);assert.equal(t.development.result.exit_code,null);assert.equal(t.development.validation_manifest,undefined);assert.equal(validTestExecution(s,t),false);
  assert.equal(fs.existsSync(path.join(t.development.result.directory,'.scratch')),false);assert.equal(s.records[p.id].development.attempts.length,2);assert.equal(s.records[c.id].development.run.receipt_id,t.id);
});
test('explicit recovery preserves original jobs, receipts, source, grant, expiry and spent generation',async()=>{
  const {a,p,c,t,d,args}=await prepared(),before=read(a),priorRun=before.records[c.id].development.run,priorJob=before.jobs[t.author_instance],oldGrant=before.records[p.id].development.authorization;
  const original=fs.readFileSync(path.join(a.root,'value.mjs'));
  await assert.rejects(developmentAction({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex',transport),/already has a test attempt/);
  const j=await developmentAction(args,'codex',transport),reserved=read(a),request=reserved.records[reserved.records[c.id].development.preflight_recovery];
  assert.deepEqual(reserved.records[c.id].development.run_history,[priorRun]);assert.deepEqual(reserved.records[t.id],before.records[t.id]);assert.deepEqual(reserved.jobs[t.author_instance],priorJob);assert.deepEqual(reserved.records[p.id],before.records[p.id]);assert.deepEqual(reserved.records[p.id].development.authorization,oldGrant);assert.equal(request.development.generation_permission,false);assert.equal(request.development.allowance_reset,false);assert.equal(request.development.diagnostic_id,d.id);
  let runnerCalls=0;
  const next=await executeDevelopmentTest(a.root,j.id,{validationEnvironment:fingerprintEnvironment,runLocalTests:async()=>{runnerCalls++;const proof=read(a).jobs[j.id].execution_provenance;assert.equal(proof.phase,'launch_intent');assert.equal(proof.launch_intent,true);assert.equal(proof.runner_entered,true);return pass;}});
  assert.equal(runnerCalls,1);assert.equal(next.status,'Submitted');assert.equal(next.development.result.status,'passed');assert.equal(next.development.result.tests_executed,true);assert.equal(validTestExecution(read(a),next),true);
  assert.deepEqual(fs.readFileSync(path.join(a.root,'value.mjs')),original);assert.deepEqual(read(a).records[t.id],before.records[t.id]);assert.deepEqual(read(a).records[p.id],before.records[p.id]);
  await assert.rejects(developmentAction(args,'codex',transport),/Only one recovery/);
  assert.throws(()=>mutate(a,s=>developmentAssignment(s,{id:id('producer'),role:'engineer',development_id:p.id},true,a.root)),/attempt limit/);
  const reviewJob={id:id('qa'),role:'qa',inputs:[],review_of:{id:next.id,revision:next.revision},task:'Review new actual runtime receipt'};
  const context=assignmentContext(read(a),reviewJob),ids=context.inputs.map(r=>r.id);
  for(const id of [p.id,c.id,next.id,t.id,d.id,request.id])assert.ok(ids.includes(id),id);
  await assert.rejects(developmentAction({...a,action:'accept',plan_id:p.id,receipt_id:next.id,receipt_sha256:next.development.receipt_sha256,review_id:'absent'},'codex'),/fresh independent QA/);
});
test('candidate-free diagnostic uses fixed worker route, redacts environment and cannot execute tests',async()=>{
  const a=setup(),start=launches.length,d=await diagnose(a),j=read(a).jobs[d.author_instance],launch=launches[start];
  assert.equal(j.kind,'development_preflight');assert.equal(j.candidate_id,undefined);assert.equal(launch.options.timeout,45000);assert.equal(launch.options.killSignal,'SIGKILL');assert.equal(launch.options.detached,true);assert.equal(d.development.result.tests_executed,false);assert.equal(d.development.result.launch_intent,false);assert.equal(d.development.result.status,'passed');
  assert.ok(!d.content.includes('/redacted/controlled-home'));assert.match(d.development.result.environment_sha256,/^[a-f0-9]{64}$/);
  assert.equal(fs.readdirSync(path.join(a.root,'.company','diagnostics')).length,0);
  await assert.rejects(developmentAction({...a,action:'diagnose_preflight',candidate_id:'forbidden',source_instruction:'diagnose'},'codex',transport),/candidate-free/);
  await assert.rejects(executePreflightDiagnostic(a.root,j.id,{validationEnvironment:fingerprintEnvironment}),/started/);
});
test('every post-entry/no-TAP/unknown/malformed runner result remains ineligible even with false tests_executed',async t=>{
  for(const mode of ['postflight','no-tap','empty-ipc','throw','unknown','cancelled'])await t.test(mode,async()=>{
    const a=setup(),{p,c}=await candidate(a),j=await developmentAction({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex',transport);let reads=0;
    const receipt=await executeDevelopmentTest(a.root,j.id,{validationEnvironment:()=>{reads++;if(reads===2&&['postflight','empty-ipc'].includes(mode))return preflightFailure();return fingerprintEnvironment();},runLocalTests:async()=>{if(mode==='throw')throw Error('Unknown runner completion');if(['unknown','cancelled'].includes(mode))mutate(a,s=>s.jobs[j.id].status=mode);if(mode==='empty-ipc')return undefined;return {...pass,status:'failed',exit_code:null,tests_executed:false,stdout:'',error:'No harness evidence'};}});
    const d=await diagnose(a);assert.equal(receipt.development.result.execution_provenance.launch_intent,true);
    await assert.rejects(developmentAction(recoveryArgs(a,p,c,receipt,d),'codex',transport),/canonical failed|uncertain|durably established|stale/);
    assert.equal(read(a).records[c.id].development.run_history,undefined);
  });
});
test('recovery eligibility fails atomically for source, receipt, provenance, decisions, claims and currentness changes',async t=>{
  const cases={
    'source bytes':x=>fs.writeFileSync(path.join(x.a.root,'value.mjs'),'changed'),
    'materialized bytes':x=>{const file=path.join(x.t.development.result.directory,'value.mjs');fs.chmodSync(file,0o600);fs.writeFileSync(file,'changed');},
    'scratch present':x=>fs.mkdirSync(path.join(x.t.development.result.directory,'.scratch')),
    'unexpected retained file':x=>fs.writeFileSync(path.join(x.t.development.result.directory,'extra.txt'),'unknown'),
    'paused':x=>mutate(x.a,s=>s.paused=true),
    'revoked':x=>mutate(x.a,s=>s.records[x.p.id].development.revoked={at:new Date().toISOString()}),
    'epoch':x=>mutate(x.a,s=>s.owner.epoch++),
    'authority':x=>mutate(x.a,s=>s.records.extra={id:'extra',kind:'decision',revision:1,status:'Recorded',content:'New governing decision'}),
    'receipt hash':x=>{x.args.receipt_sha256=digest('wrong');},
    'diagnostic hash':x=>{x.args.diagnostic_sha256=digest('wrong');},
    'diagnostic failed':async x=>{const d=await diagnose(x.a,preflightFailure);x.args.diagnostic_id=d.id;x.args.diagnostic_sha256=d.development.receipt_sha256;},
    'unknown original job':x=>mutate(x.a,s=>s.jobs[x.t.author_instance].status='unknown'),
    'cancelled original job':x=>mutate(x.a,s=>s.jobs[x.t.author_instance].status='cancelled'),
    'active scope work':x=>mutate(x.a,s=>s.jobs.active={id:'active',development_id:x.p.id,status:'running'}),
    'unclosed claim':x=>mutate(x.a,s=>s.jobs.claim={id:'claim',status:'failed',coordination:{resources:['retained-source']}}),
    'negative candidate QA':x=>mutate(x.a,s=>s.records.negative={id:'negative',kind:'review',status:'Submitted',review_of:{id:x.c.id,revision:1},review:{verdict:'Fail'}}),
    'accepted candidate':x=>mutate(x.a,s=>s.records[x.t.id].development.acceptance={at:'retained'}),
    'missing worker provenance':x=>mutate(x.a,s=>{delete s.records[x.t.id].development.result.execution_provenance;}),
    'different worker phase':x=>mutate(x.a,s=>s.jobs[x.t.author_instance].execution_provenance.phase='postflight'),
    'wrong exact candidate':x=>{x.args.candidate_sha256=digest('wrong');},
  };
  for(const [name,change] of Object.entries(cases))await t.test(name,async()=>{const x=await prepared();await change(x);const before=read(x.a),launched=launches.length;await assert.rejects(developmentAction(x.args,'codex',transport));const after=read(x.a);assert.equal(launches.length,launched);assert.deepEqual(after,before);assert.equal(after.records[x.c.id].development.run_history,undefined);});
});
test('ordinary scope authority cannot be revived by maintenance or recovered validation',async()=>{
  const x=await prepared();mutate(x.a,s=>s.records.maintenance={id:'maintenance',kind:'decision',revision:1,status:'Recorded',content:'New governing maintenance authorization'});
  await assert.rejects(developmentAction(x.args,'codex',transport),/authority changed/);
  assert.throws(()=>mutate(x.a,s=>developmentAssignment(s,{id:id('producer'),role:'engineer',development_id:x.p.id},true,x.a.root)),/authority changed/);
  assert.equal(read(x.a).records[x.c.id].development.run.receipt_id,x.t.id);assert.equal(read(x.a).records[x.p.id].development.attempts.length,2);
});
test('legacy false/no-manifest shape without independent exact-source native qualification is held',async()=>{
  const x=await prepared();mutate(x.a,s=>{const t=s.records[x.t.id],r=t.development.result;delete r.execution_provenance;delete r.preflight_error;r.error='Cannot fingerprint system build for validation reuse';delete s.jobs[t.author_instance].execution_provenance;t.content=JSON.stringify(r);t.development.receipt_sha256=digest(t.content);});
  x.args.receipt_sha256=read(x.a).records[x.t.id].development.receipt_sha256;
  await assert.rejects(developmentAction(x.args,'codex',transport),/qualification target/);
  assert.equal(read(x.a).records[x.c.id].development.run_history,undefined);
});
test('descriptor commitment is fingerprinted and redacted manifest retains exact protocol/hash',()=>{
  const input={files:files.map(f=>({path:f.path,sha256:digest(f.content)})),tests:['value.test.mjs'],...fingerprintEnvironment(),limits:{timeout_ms:1000,max_output_bytes:10000}},before=fingerprintValidation(input),manifest=validationManifest(input);
  assert.deepEqual(manifest.runtime.system_descriptor,input.runtime.system_descriptor);input.runtime.system_descriptor.sha256=digest('changed descriptor');assert.notEqual(fingerprintValidation(input),before);
  for(const value of [{protocol:'unknown',sha256:digest('x')},{protocol:'apple-system-version-plist-v1',sha256:'bad'},{protocol:'apple-system-version-plist-v1',sha256:digest('x'),path:'/caller'}])assert.throws(()=>fingerprintValidation({...input,runtime:{...input.runtime,system_descriptor:value}}),/descriptor/);
});

const legacyFiles=Object.fromEntries(['develop.mjs','local-sandbox.mjs'].map(name=>[name,fs.readFileSync(new URL('./fixtures/preflight-M98-'+name+'.txt',import.meta.url),'utf8')]));
async function legacyPrepared({large=false}={}){
  const a=setup();engine.bind(a.root,a.session_id,'codex');
  if(large)fs.writeFileSync(path.join(a.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:700000}));
  if(large)fs.writeFileSync(path.join(a.root,'value.mjs'),'// '+ 'synthetic original source '.repeat(10000)+'\nexport const value=0;\n');
  const {p,c}=await candidate(a,large?{max_bytes:700000}:{}),t=await failBeforeRun(a,p,c);
  // This fixture represents the exact old serialized result, never a live phase
  // attestation. Production callers cannot replace runtime records this way.
  mutate(a,s=>{const old=s.records[t.id],r=old.development.result;delete r.execution_provenance;delete r.preflight_error;r.error='Cannot fingerprint system build for validation reuse';delete s.jobs[t.author_instance].execution_provenance;old.content=JSON.stringify(r);old.development.receipt_sha256=digest(old.content);});
  const old=read(a).records[t.id],sourceId=id('legacy-source'),installationId=id('installation');
  engine.save({...a,id:sourceId,kind:'artifact',content:JSON.stringify({protocol:'legacy-M98-preflight-runtime-sources-v1',files:legacyFiles}),source_reference:'Exact immutable published M98 fixture bodies; source-only controlled test.'},'codex');
  engine.save({...a,id:installationId,kind:'artifact',content:'CONTROLLED installation provenance evidence. This fixture is not a native historical attestation.',source_reference:'Synthetic controlled transport only'},'codex');
  const target=await developmentAction({...a,action:'prepare_preflight_qualification',plan_id:p.id,candidate_id:c.id,receipt_id:old.id,receipt_sha256:old.development.receipt_sha256,legacy_source_id:sourceId,installation_ids:[installationId],source_instruction:'Prepare narrowly bounded independent source qualification; no test retry is authorized here.'},'codex');
  return {a,p,c,t:old,target,sourceId,installationId};
}
async function qualify(x,extra={}){
  const before=Object.keys(read(x.a).jobs);
  engine.dispatch({...x.a,role:'qa',review_of:x.target.id,task:'Independently assess the complete typed legacy first-fingerprint source qualification; no code acceptance.'},'codex',{check:()=>({available:true,authenticated:true,version:'controlled-transport'}),launch:()=>{const c=new EventEmitter();c.unref=()=>{};return c;}});
  const job=Object.values(read(x.a).jobs).find(j=>!before.includes(j.id));
  await work(x.a.root,job.id,async(_host,_native,prompt,_directory,remaining,_selection,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
    assert.match(prompt,/LEGACY PREFLIGHT SOURCE QUALIFICATION ONLY/);assert.ok(prompt.includes(legacyFiles['develop.mjs'].slice(0,100).replaceAll('\n','\\n')));
    const body=JSON.parse(x.target.content);
    return {native_id:id('controlled-independent-qa'),text:JSON.stringify({content:'Controlled independent source assessment only; no native historical qualification claimed.',messages:[],notices:[],review:{verdict:'Pass',reason:'Controlled source qualification transport and exact bindings verified.',permitted_action:'qualify_preflight_recovery',blockers:[],preflight_recovery:{protocol:'legacy-M98-preflight-qualification-v1',target_sha256:digest(JSON.stringify(x.target)),receipt_sha256:body.subject.receipt.result_sha256,receipt_record_sha256:body.subject.receipt.sha256,candidate_sha256:body.subject.candidate.candidate_sha256,basis:'qualified-exact-source-first-fingerprint-inference',uncertainty:'historical-launch-not-attested'},...extra}})};
  });
  const s=read(x.a),q=s.records[s.jobs[job.id].artifact_id];assert.equal(q?.status,'Submitted',JSON.stringify(s.jobs[job.id]));return q;
}
test('supported save/prepare/assign-QA/recover path qualifies compact provenance with >200k original source',async()=>{
  const x=await legacyPrepared({large:true}),q=await qualify(x),s=read(x.a),qj=s.jobs[q.job_id],context=assignmentContext(s,qj);
  assert.ok(JSON.stringify(s.records[x.p.id]).length>200000);assert.ok(context.text.length<200000);assert.ok(!qj.inputs.some(ref=>[x.p.id,x.c.id,x.t.id].includes(ref.id)),'compact phase qualification does not inline full code scopes');
  assert.ok(context.text.includes('CONTROLLED installation provenance'));assert.equal(qj.coordination_release.termination_confirmed,true);assert.equal(contextMatches(s,qj,qj.context_sha256),true);
  const d=await diagnose(x.a),args={...recoveryArgs(x.a,x.p,x.c,x.t,d),legacy_qualification_id:q.id};
  const run=await developmentAction(args,'codex',transport),next=await executeDevelopmentTest(x.a.root,run.id,{validationEnvironment:fingerprintEnvironment,runLocalTests:async()=>pass});
  assert.equal(next.status,'Submitted');assert.equal(next.development.result.status,'passed');assert.equal(read(x.a).records[x.t.id].development.result.error,'Cannot fingerprint system build for validation reuse');assert.equal(read(x.a).records[x.p.id].development.attempts.length,2);
  await assert.rejects(developmentAction({...x.a,action:'accept',plan_id:x.p.id,receipt_id:next.id,receipt_sha256:next.development.receipt_sha256,review_id:q.id},'codex'),/fresh independent QA/);
});
test('qualified legacy evidence and full inline QA context remain current through reserve and worker publication',async t=>{
  for(const changed of ['source-record','installation-inline','qa-inline-governor','qa-native','partial-only-target','late-inline-during-run'])await t.test(changed,async()=>{
    const x=await legacyPrepared(),q=await qualify(x),d=await diagnose(x.a),args={...recoveryArgs(x.a,x.p,x.c,x.t,d),legacy_qualification_id:q.id};
    if(changed==='late-inline-during-run'){
      const j=await developmentAction(args,'codex',transport),receipt=await executeDevelopmentTest(x.a.root,j.id,{validationEnvironment:fingerprintEnvironment,runLocalTests:async()=>{mutate(x.a,s=>s.records[x.installationId].content+=' changed');return pass;}});
      assert.equal(receipt.status,'Quarantined');assert.equal(read(x.a).records[x.c.id].development.run_history[0].receipt_id,x.t.id);return;
    }
    mutate(x.a,s=>{if(changed==='source-record')s.records[x.sourceId].content+=' changed';if(changed==='installation-inline')s.records[x.installationId].content+=' changed';if(changed==='qa-inline-governor')s.records.governor={id:'governor',kind:'preference',revision:1,status:'Draft',content:'New current obligation'};if(changed==='qa-native')s.jobs[q.job_id].native_id=s.jobs[s.records[x.c.id].job_id].native_id;if(changed==='partial-only-target'){const j=s.jobs[q.job_id];j.inputs=j.inputs.filter(ref=>ref.id!==x.target.id);j.retrieved_inputs=[{id:x.target.id,revision:1,sha256:digest(JSON.stringify(x.target)),offset:0,length:1,total_characters:JSON.stringify(x.target).length}];}});
    await assert.rejects(developmentAction(args,'codex',transport));assert.equal(read(x.a).records[x.c.id].development.run_history,undefined);
  });
});

test('last fingerprint provider cannot cross expiry or change authority before durable launch admission',async t=>{
  for(const changed of ['expiry','authority'])await t.test(changed,async()=>{
    const a=setup(),{p,c}=await candidate(a),job=await developmentAction({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex',transport),now=Date.now;let calls=0;
    try{
      const receipt=await executeDevelopmentTest(a.root,job.id,{validationEnvironment:()=>{if(changed==='expiry')Date.now=()=>Date.parse(p.development.scope.expires_at)+1;else mutate(a,s=>s.records.late={id:'late',kind:'decision',revision:1,status:'Recorded',content:'Late governing change'});return fingerprintEnvironment();},runLocalTests:async()=>{calls++;return pass;}});
      assert.equal(calls,0);assert.equal(receipt.status,'Quarantined');assert.equal(receipt.development.result.execution_provenance.launch_intent,false);
    }finally{Date.now=now;}
  });
});
test('terminal postflight expiry retains executed outcome quarantined and cannot qualify recovery',async()=>{
  const a=setup(),{p,c}=await candidate(a),job=await developmentAction({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex',transport),now=Date.now;let reads=0;
  try{const receipt=await executeDevelopmentTest(a.root,job.id,{validationEnvironment:()=>{if(++reads===2)Date.now=()=>Date.parse(p.development.scope.expires_at)+1;return fingerprintEnvironment();},runLocalTests:async()=>pass});assert.equal(receipt.status,'Quarantined');assert.equal(receipt.development.result.tests_executed,true);assert.equal(receipt.development.result.execution_provenance.launch_intent,true);}finally{Date.now=now;}
});
test('failed or late diagnostics are retained without becoming recovery proof',async()=>{
  const a=setup(),d=await diagnose(a,()=>{mutate(a,s=>s.records.change={id:'change',kind:'decision',revision:1,status:'Recorded',content:'Changed during diagnostic'});return fingerprintEnvironment();});
  assert.equal(d.status,'Quarantined');assert.equal(d.development.result.tests_executed,false);assert.equal(d.development.result.launch_intent,false);
});

test('late directory lookup cannot publish a current test receipt after expiry',async()=>{
  const a=setup(),{p,c}=await candidate(a),job=await developmentAction({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex',transport),realpath=fs.realpathSync,now=Date.now;let reads=0,armed=false,triggered=false;
  fs.realpathSync=function(...args){const value=realpath.apply(this,args);if(armed&&new Error().stack.includes('candidateDir')){triggered=true;Date.now=()=>Date.parse(p.development.scope.expires_at)+1;}return value;};
  try{const receipt=await executeDevelopmentTest(a.root,job.id,{validationEnvironment:()=>{if(++reads===2)armed=true;return fingerprintEnvironment();},runLocalTests:async()=>pass});assert.equal(triggered,true);assert.equal(receipt.status,'Quarantined');}finally{fs.realpathSync=realpath;Date.now=now;}
});
async function codeReview(a,receipt){
  engine.bind(a.root,a.session_id,'codex');const before=new Set(Object.keys(read(a).jobs));
  engine.dispatch({...a,role:'qa',review_of:receipt.id,task:'Independently review exact full local candidate and runtime test receipt.'},'codex',{check:()=>({available:true,authenticated:true,version:'controlled-transport'}),launch:()=>{const c=new EventEmitter();c.unref=()=>{};return c;}});
  const job=Object.values(read(a).jobs).find(j=>!before.has(j.id));
  await work(a.root,job.id,async(_host,_native,_prompt,_directory,remaining,_selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));return {native_id:id('controlled-code-qa'),text:JSON.stringify({content:'Controlled exact full code review transport only.',messages:[],notices:[],review:{verdict:'Pass',reason:'Controlled exact source/receipt bindings inspected.',permitted_action:'accept_local_development',candidate_sha256:receipt.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:[]}})};});
  const s=read(a),q=s.records[s.jobs[job.id].artifact_id];assert.equal(q?.status,'Submitted',JSON.stringify(s.jobs[job.id]));return q;
}
test('late directory lookup cannot accept recovered validation after expiry',async()=>{
  const {a,p,args}=await prepared(),job=await developmentAction(args,'codex',transport),receipt=await executeDevelopmentTest(a.root,job.id,{validationEnvironment:fingerprintEnvironment,runLocalTests:async()=>pass}),q=await codeReview(a,receipt),realpath=fs.realpathSync,now=Date.now;let calls=0;
  fs.realpathSync=function(...values){const result=realpath.apply(this,values);if(new Error().stack.includes('candidateDir')&&++calls===2)Date.now=()=>Date.parse(p.development.scope.expires_at)+1;return result;};
  try{await assert.rejects(developmentAction({...a,action:'accept',plan_id:p.id,receipt_id:receipt.id,receipt_sha256:receipt.development.receipt_sha256,review_id:q.id},'codex'),/expired|expiry/);assert.equal(calls,2);assert.equal(read(a).records[receipt.id].development.acceptance,undefined);}finally{fs.realpathSync=realpath;Date.now=now;}
});

test('fingerprint diagnostic failures persist typed metadata and message commitment without private dependency paths',async()=>{
  const a=setup(),privatePath='/Users/synthetic-private-runtime/library-path-canary/libSensitiveNodeLibrary.dylib',message=`Cannot establish Node runtime library allowlist: otool -L ${privatePath}: synthetic denied dependency`,failure=Object.assign(new Error(message),{code:'EACCES'});
  const receipt=await diagnose(a,()=>{throw failure;}),result=receipt.development.result,persisted=read(a);
  assert.equal(receipt.status,'Submitted');assert.equal(result.status,'failed');assert.equal(result.tests_executed,false);assert.equal(result.launch_intent,false);
  for(const value of [receipt,persisted.records[receipt.id],persisted.jobs[receipt.author_instance]]){assert.equal(JSON.stringify(value).includes(privatePath),false);assert.equal(JSON.stringify(value).includes('/Users/synthetic-private-runtime'),false);assert.equal(JSON.stringify(value).includes(message),false);}
  assert.deepEqual(result.error,{protocol:'runtime-diagnostic-error-v1',message_sha256:digest(message)});
  assert.deepEqual(result.preflight_error,{name:'Error',code:'EACCES',phase:'unknown',method:'runtime-fingerprint'});
  assert.deepEqual(persisted.records[receipt.id],receipt);assert.equal(JSON.parse(receipt.content).error.message_sha256,digest(message));
});

test('diagnostic spawn failure persists bounded commitments and returns no private path',async()=>{
  const a=setup(),privatePath='/Users/synthetic-private-runtime/spawn-path-canary/node',message=`spawn ${privatePath} EACCES`,failure=Object.assign(new Error(message),{code:'EACCES'});let returned;
  try{await developmentAction({...a,action:'diagnose_preflight',source_instruction:'Explicit controlled diagnostic start failure.'},'codex',{spawnWorker:()=>{throw failure;}});}catch(error){returned=error;}
  assert.ok(returned);assert.equal(returned.message.includes(privatePath),false);
  const s=read(a),job=Object.values(s.jobs).find(j=>j.kind==='development_preflight');assert.equal(job.status,'failed');
  assert.deepEqual(job.error,{protocol:'runtime-diagnostic-error-v1',message_sha256:digest(message)});assert.equal(job.preflight_error.code,'EACCES');
  assert.equal(JSON.stringify({job,notices:s.notices}).includes(privatePath),false);assert.equal(job.artifact_id,undefined);
});
test('diagnostic early identity read failure uses actual outer dispatcher without leaking job or notice paths',async()=>{
  const a=setup(),privatePath='/Users/synthetic-private-runtime/identity-path-canary/develop.mjs',message=`ENOENT: no such file or directory, open '${privatePath}'`,failure=Object.assign(new Error(message),{code:'ENOENT'});
  const job=await developmentAction({...a,action:'diagnose_preflight',source_instruction:'Explicit controlled early identity failure.'},'codex',transport);
  const output=await executeDevelopmentWorker(a.root,job.id,{runtimeIdentity:()=>{throw failure;}}),s=read(a),persisted=s.jobs[job.id];
  assert.equal(output,undefined);assert.equal(persisted.status,'failed');assert.equal(persisted.started_at,undefined);assert.equal(persisted.artifact_id,undefined);
  assert.deepEqual(persisted.error,{protocol:'runtime-diagnostic-error-v1',message_sha256:digest(message)});assert.equal(persisted.preflight_error.code,'ENOENT');
  assert.ok(s.notices.some(n=>n.reference===job.id));assert.equal(JSON.stringify({job:persisted,notices:s.notices}).includes(privatePath),false);assert.equal(JSON.stringify(s.notices).includes(message),false);
});

test('asynchronous diagnostic spawn error redacts the retained job after the queued response',async()=>{
  const a=setup(),privatePath='/Users/synthetic-private-runtime/async-spawn-canary/node',message=`spawn ${privatePath} ENOENT`,failure=Object.assign(new Error(message),{code:'ENOENT'}),child=new EventEmitter();child.unref=()=>{};
  const response=await developmentAction({...a,action:'diagnose_preflight',source_instruction:'Explicit controlled asynchronous diagnostic spawn failure.'},'codex',{spawnWorker:()=>child});
  assert.equal(response.status,'queued');child.emit('error',failure);
  const s=read(a),job=s.jobs[response.id];assert.equal(job.status,'failed');assert.deepEqual(job.error,{protocol:'runtime-diagnostic-error-v1',message_sha256:digest(message)});assert.equal(job.preflight_error.code,'ENOENT');assert.equal(JSON.stringify({job,notices:s.notices}).includes(privatePath),false);
});

test('diagnostic software contributes zero specialist assignments or model observations',()=>{
  const diagnostic={id:'diagnostic',kind:'development_preflight',role:'runtime',status:'completed',host:'codex',created_at:'2026-01-01T00:00:00Z',model_selection:{mode:'explicit',model:'stale-diagnostic-model',effort:'high',reason:'must not count'},model_evidence:{applied_controls:{model:'stale-diagnostic-model'},reported_models:['stale-diagnostic-model'],verification:'host_reported'}};
  const s={jobs:{diagnostic},records:{},roles:{runtime:{name:'Runtime'}}},usage=selectionUsage(s),view=usageView(s),activity=activityFor(s)[0];
  for(const value of [usage,view]){assert.equal(value.scope,'specialist_assignments_only');for(const key of ['assignments','missing_reasons','with_applied_controls','with_host_reported_models'])assert.equal(value[key],0);}
  assert.deepEqual(usage.groups,[]);assert.match(activity.agent,/diagnostic.*software/i);assert.match(activity.task,/fingerprint/i);assert.ok(!activity.task.includes('local tests'));assert.equal(activity.model_evidence.scope,'no_model_call');assert.equal(activity.model_evidence.verification,'not_applicable');assert.deepEqual(activity.model_evidence.reported_models,[]);for(const key of ['requested_model','requested_effort','requested_speed','selection_reason','applied_controls'])assert.equal(activity[key],null);
  const specialist={id:'specialist',role:'qa',status:'completed',host:'codex'},testJob={id:'test',kind:'development_test',role:'engineer',status:'completed',host:'codex'};
  const mixed={...s,jobs:{specialist,testJob,diagnostic}};assert.deepEqual(selectionUsage(mixed),selectionUsage({...s,jobs:{specialist,testJob}}));assert.deepEqual(usageView(mixed),usageView({...s,jobs:{specialist,testJob}}));assert.equal(selectionUsage(mixed).assignments,1);assert.equal(usageView(mixed).assignments,1);
});
test('old diagnostic notice retains only its canonically bound software producer outside the recent window',()=>{
  const at='2026-01-01T00:00:00Z',state={jobs:{d:{id:'d',kind:'development_preflight',role:'runtime',status:'completed',artifact_id:'receipt',inputs:[],native_id:null,created_at:at,started_at:at,finished_at:at}},records:{receipt:{id:'receipt',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',author_instance:'d',created_at:at,development:{type:'preflight_diagnostic',result:{status:'passed',tests_executed:false,launch_intent:false}}}},notices:[{id:'notice',kind:'must_know',summary:'Inspect this old diagnostic',reference:'receipt',created_at:at}]};
  for(let i=0;i<20;i++)state.jobs['newer-'+i]={id:'newer-'+i,role:'engineer',status:'completed',inputs:[],created_at:new Date(Date.parse(at)+1000+i).toISOString()};
  const view=progressSnapshot(state,{recentJobs:1});assert.equal(view.graph.valid,true);assert.ok(view.nodes.some(n=>n.id==='d'));assert.equal(view.nodes.length,2);assert.equal(view.evidence.find(r=>r.id==='receipt').acceptance,null);
});
test('actual qualification diagnose recover flow remains software-only for diagnostics and has complete raw/public lineage',async()=>{
  const x=await legacyPrepared(),q=await qualify(x),d=await diagnose(x.a),args={...recoveryArgs(x.a,x.p,x.c,x.t,d),legacy_qualification_id:q.id},run=await developmentAction(args,'codex',transport),receipt=await executeDevelopmentTest(x.a.root,run.id,{validationEnvironment:fingerprintEnvironment,runLocalTests:async()=>pass});
  const qa=await codeReview(x.a,receipt),s=read(x.a),withoutDiagnostics={...s,jobs:Object.fromEntries(Object.entries(s.jobs).filter(([,j])=>j.kind!=='development_preflight'))};
  assert.deepEqual(selectionUsage(s),selectionUsage(withoutDiagnostics));assert.deepEqual(usageView(s),usageView(withoutDiagnostics));assert.equal(currentView(s).selection_usage.assignments,selectionUsage(s).assignments);
  const activity=activityFor(s).find(row=>row.job_id===d.author_instance);assert.equal(activity.model_evidence.scope,'no_model_call');assert.equal(activity.requested_model,null);
  for(const graph of [progressFor(s),progressSnapshot(s,{recentJobs:50})]){
    assert.equal(graph.graph.valid,true,JSON.stringify(graph.diagnostics));assert.equal(graph.nodes.find(row=>row.id===d.author_instance).actor,'software');assert.equal(graph.evidence.find(row=>row.id===x.target.id).context,true);assert.equal(graph.evidence.find(row=>row.id===s.records[x.c.id].development.preflight_recovery).context,true);assert.equal(graph.evidence.find(row=>row.id===d.id).acceptance,null);assert.equal(graph.graph.edges.some(edge=>edge.type==='candidate'&&edge.to===d.author_instance),false);assert.equal(graph.graph.edges.some(edge=>edge.type==='candidate'&&edge.to===x.t.author_instance),true);
  }
  const publicProgress=progressSnapshot(s,{recentJobs:50}),text=renderProgress(publicProgress,'text'),html=renderProgress(publicProgress,'html',{renderId:'diagnostic-flow'}),index=publicProgress.nodes.findIndex(node=>node.id===d.author_instance),card=html.match(new RegExp('<article id=\"soloco-progress-diagnostic-flow-work-'+(index+1)+'\"[\\s\\S]*?</article>'))?.[0];
  assert.ok(card);assert.match(text,/Task label: Fingerprint validation environment \(runtime diagnostic\)/);assert.match(card,/Runtime diagnostic/);assert.match(card,/Fingerprint validation environment/);assert.equal(card.includes('Runtime tests'),false);assert.equal(card.includes('Run candidate tests'),false);
  assert.ok(html.includes('Runtime tests'));assert.ok(html.includes('Run candidate tests'),'existing development_test labels stay unchanged');
  const noticeState=structuredClone(s);noticeState.notices.push({id:'old-diagnostic-notice',kind:'must_know',summary:'Inspect this exact old diagnostic result',reference:d.id,created_at:new Date().toISOString()});
  for(let i=0;i<20;i++)noticeState.jobs['newer-'+i]={id:'newer-'+i,role:'engineer',status:'completed',inputs:[],created_at:new Date(Date.now()+10000+i).toISOString()};
  const oldNotice=progressSnapshot(noticeState,{recentJobs:1});assert.ok(oldNotice.nodes.some(node=>node.id===d.author_instance));assert.equal(oldNotice.nodes.length,2);assert.ok(oldNotice.coverage.omitted_jobs>0);assert.equal(oldNotice.attention.find(row=>row.notice.id==='old-diagnostic-notice').link.id,d.id);
  for(const mismatch of ['role','artifact','duplicate-claim']){
    const bad=structuredClone(noticeState);if(mismatch==='role')bad.records[d.id].author_role='engineer';if(mismatch==='artifact')bad.jobs[d.author_instance].artifact_id='different-result';if(mismatch==='duplicate-claim')bad.jobs['another-claim']={id:'another-claim',role:'engineer',status:'completed',artifact_id:d.id,created_at:'2020-01-01T00:00:00Z',inputs:[]};
    assert.equal(progressSnapshot(bad,{recentJobs:1}).nodes.some(node=>node.id===d.author_instance),false,mismatch);
  }
  for(const malformed of ['qualifier-protocol','qualifier-status','request-protocol','context-job-claim','diagnostic-test-label','diagnostic-role','history-receipt']){
    const bad=structuredClone(s),requestId=bad.records[x.c.id].development.preflight_recovery;
    if(malformed==='qualifier-protocol')bad.records[x.target.id].preflight_qualification.protocol='unknown';
    if(malformed==='qualifier-status')bad.records[x.target.id].status='Draft';
    if(malformed==='request-protocol')bad.records[requestId].development.protocol='unknown';
    if(malformed==='context-job-claim')bad.records[x.target.id].job_id=q.job_id;
    if(malformed==='diagnostic-test-label')bad.records[d.id].development.type='test';
    if(malformed==='diagnostic-role')bad.records[d.id].author_role='engineer';
    if(malformed==='history-receipt')bad.records[x.c.id].development.run_history[0].receipt_id='unknown';
    for(const graph of [progressFor(bad),progressSnapshot(bad,{recentJobs:50})])assert.equal(graph.graph.valid,false,malformed);
    assert.equal(validTestExecution(bad,bad.records[d.id]),false,malformed);
  }
  withStore(x.a.root,db=>db.migrate());
  const normalized=withStore(x.a.root,db=>currentView(db.publicState(true)));assert.equal(normalized.selection_usage.assignments,selectionUsage(s).assignments);assert.equal(normalized.selection_usage.with_applied_controls,selectionUsage(s).with_applied_controls);assert.equal(normalized.selection_usage.with_host_reported_models,selectionUsage(s).with_host_reported_models);
  assert.equal(read(x.a).records[receipt.id].development.acceptance,undefined);assert.equal(qa.review.permitted_action,'accept_local_development');assert.equal(validTestExecution(read(x.a),d),false);
});
