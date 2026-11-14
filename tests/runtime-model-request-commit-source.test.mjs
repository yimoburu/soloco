// Authored Source checks only. Fictional SQLite data and a controlled Node
// ChildProcess boundary exercise real Store/token hooks; they are not Native
// execution, historical company provenance, or successful model outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {Store,originalStoreExecutionCustodyFrom} from '../plugins/soloco/runtime/store.mjs';
import {
  recordRuntimeWorkerAssignmentFrom,prepareRuntimeWorkerLaunchFrom,spawnRuntimeWorkerLaunch,
  prepareRuntimeModelRequestFrom,inspectRuntimeModelRequestCommitFrom,assertRuntimeModelRequestCurrentFrom,
  assertLegacyRuntimeModelLaunchFrom,assertRuntimeWorkerStartedFrom,commitRuntimeExecutionWriteFrom,
  approveRuntimeModelProcessObservationFrom,assertRuntimeModelProcessObservedFrom
} from '../plugins/soloco/runtime/runtime-execution.mjs';
import {
  prepareOriginalWorkerLaunchFrom,prepareOriginalModelRequestFrom,spawnOriginalWorkerLaunch,
  assertOriginalModelLaunchToken,retainOriginalModelRequestCommitFrom,inspectOriginalSourceGenerationFrom
} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {executionTiming,normalizeTimeout,STARTUP_TIMEOUT_MS} from '../plugins/soloco/runtime/timeout.mjs';
import {specialistAction,reference,prepareSpecialistAssignment} from '../plugins/soloco/runtime/specialists.mjs';
import {runRuntimeModel,runRuntimeModelWithOutcome,consumeRuntimeModelOutcome,assertRuntimeModelOutcomeEligible,assertRuntimeAdapterModelBirthFrom,assertRuntimeAdapterModelClosureFrom} from '../plugins/soloco/runtime/adapters.mjs';
import {freshInventoryStore,controlledInventoryChild} from './original-global-worker-inventory-fixture.mjs';

const sha=(text,encoding='utf8')=>createHash('sha256').update(text,encoding).digest('hex');
const policy=Object.freeze({timeout_ms:60000,timeout_reason:'Fictional Source request commit proof; no model invocation selected.'});
const expiryPolicy=Object.freeze({timeout_ms:10000,timeout_reason:'Fictional cross-request expiry oracle; controlled Source route only, no provider execution.'});
const sourceNow=Date.now,sourceTimer=setTimeout,nativeAccessSync=fs.accessSync,nativeLstatSync=fs.lstatSync;
const commitHeld=error=>/^(LEGACY_RUNTIME|ORIGINAL_EXECUTION)_MODEL_REQUEST_COMMIT_REQUIRED$/.test(error?.code??'');
function controlledCreation(t){
  const children=[],calls=[],control={children,calls,onCreate:null,resolverCleanup:[]},mock=t.mock.method(childProcess,'spawn',(...args)=>{
    calls.push(args);assert.ok(children.length,'no unselected subprocess may be created');const child=children.shift();control.onCreate?.(child,args);return child;
  });
  syncBuiltinESMExports();t.after(()=>{mock.mock.restore();for(const restore of control.resolverCleanup.reverse())restore();syncBuiltinESMExports();assert.equal(children.length,0);});
  return control;
}
async function runningFixture(t,lane,control,{scoped=false,timeoutPolicy=policy}={}){
  const child=controlledInventoryChild(process.pid);let childClosed=false;
  // Register before database disposal so actual Source close observers still
  // have their fictional database. Disposal never supplies a model receipt.
  t.after(()=>{if(!childClosed){child.emit('exit',0,null);child.emit('close',0,null);childClosed=true;}});
  child.once('close',()=>{childClosed=true;});
  let root,store,job,scopedInfo=null;
  if(lane==='original'){
    const f=await freshInventoryStore(t,{stateOptions:{extra:{paused:false}}});root=f.root;store=f.store;
    if(scoped){scopedInfo=prepareScopedSpecialist(store);job=f.queue({...timeoutPolicy,...scopedInfo.job});}else job=f.queue({...timeoutPolicy});
  }else{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-model-commit-LEGACY-SOURCE-'));
    const directory=path.join(root,'.company');fs.mkdirSync(directory,{mode:0o700});
    const at=new Date().toISOString(),state={id:'fictional-request-'+randomUUID(),revision:0,owner:{host:'codex',session_id:'fictional-owner',epoch:1},paused:false,mode:'preparation',phase:'Frame',roles:{research:{name:'Fictional researcher'}},records:{},jobs:{},sessions:{},messages:[],notices:[],created_at:at,updated_at:at};
    const raw=new DatabaseSync(path.join(directory,'company.sqlite'));
    try{
      raw.exec('BEGIN IMMEDIATE');
      raw.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
      raw.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));
      raw.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fictional.historical_unqualified',JSON.stringify({revision:0,owner:state.owner}));raw.exec('COMMIT');
    }finally{if(raw.isTransaction)raw.exec('ROLLBACK');raw.close();}
    store=new Store(root);t.after(()=>{try{if(!store.closed)store.close();}finally{fs.rmSync(root,{recursive:true,force:true});}});
    job={id:'fictional-job',instance_id:'fictional-instance',role:'research',host:'codex',epoch:1,status:'queued',native_id:null,created_at:at,...timeoutPolicy};
    store.transaction('job.queued',s=>{recordRuntimeWorkerAssignmentFrom(store,s,job);s.jobs[job.id]=job;return s;});
  }
  let worker;
  store.transaction('job.worker_launch_requested',s=>{worker=lane==='original'?prepareOriginalWorkerLaunchFrom(store,s,{job_id:job.id,kind:'worker'}):prepareRuntimeWorkerLaunchFrom(store,s,{job_id:job.id,kind:'worker'});return s;});
  control.children.push(child);
  if(lane==='original')spawnOriginalWorkerLaunch(worker,process.execPath,['SOURCE-controlled-worker'],{cwd:root,stdio:'ignore'});
  else spawnRuntimeWorkerLaunch(worker);
  child.emit('spawn');
  store.transaction('job.started',s=>{assertRuntimeWorkerStartedFrom(store,s,job.id);const j=s.jobs[job.id];j.status='running';j.worker_pid=process.pid;j.started_at=new Date().toISOString();return s;});
  return {lane,root,store,job,child,scoped:scopedInfo};
}
function prepareScopedSpecialist(store){
  let result;
  store.transaction('fictional.specialist.prepare',state=>{
    state.records['fictional-input']={id:'fictional-input',revision:1,kind:'artifact',content:'Fictional scoped evidence, no measured outcome.'};let sequence=0;
    const action=(name,args)=>specialistAction(state,{session_id:state.owner.session_id,epoch:state.owner.epoch,action:name,operation_id:'fictional-request-grant-'+(++sequence),source_instruction:'Fictional Source fixture instruction for scoped preparation; no actual founder or execution claim.',...args},{host:'codex'});
    const creation=action('authorize',{policy:{base_roles:['engineer'],input_ids:['fictional-input'],scope:'Only this fictional preparation input.',expires_at:new Date(Date.now()+7200000).toISOString(),max_profiles:1,max_assignments:1}});
    const definition={base_role:'engineer',charter:{name:'Fictional scoped reviewer',mission:'Review one fictional input.',inputs:'Exact fictional record.',outputs:'Bounded preparation.',block:'Missing evidence.',success:'Retained uncertainty.',failure:'Invented outcome.',phase:'Source fixture only.'},task:'Assess only the fictional scoped input.',acceptance:'Preserve missing evidence.',input_ids:['fictional-input'],expires_at:new Date(Date.now()+3600000).toISOString(),max_assignments:1};
    const profile=action('create',{policy_ref:reference(creation),definition}),prepared=prepareSpecialistAssignment(state,{role:'engineer',task:definition.task,specialist_ref:reference(profile),input_ids:['fictional-input']},{reserve:true});
    result={profile,creation,definition,job:{role:'engineer',task:definition.task,specialist:prepared.binding,inputs:prepared.input_ids.map(id=>({id,revision:state.records[id].revision})),supplemental_sources:[],context_sha256:sha('fictional-context')}};return state;
  });return result;
}
function revokeScoped(f){
  f.store.transaction('fictional.specialist.revoke',state=>{specialistAction(state,{session_id:state.owner.session_id,epoch:state.owner.epoch,action:'revoke',operation_id:'fictional-request-revoke',source_instruction:'Fictional Source revocation; retain old request DATA and allowances.',target_ref:reference(f.scoped.profile)},{host:'codex'});return state;});
}
function request(f,prompt,{pending,options,unbound=false,rollback=false}={}){
  const invocation={invocation_id:'fictional-invocation-'+randomUUID(),job_id:f.job.id,instance_id:f.job.instance_id,worker_pid:process.pid,host:'codex',requested_at:new Date().toISOString()};
  const input={job_id:f.job.id,invocation_id:invocation.invocation_id,host:'codex',native_id:null,prompt,cwd:f.root,selection:{mode:'default'}};
  let token,scope;
  if(f.lane==='original')f.store.transaction('job.model_process.requested',s=>{requestModelProcess(s.jobs[f.job.id],invocation);return s;});
  const type=f.lane==='original'?'job.model_process.launch_requested':'job.model_process.requested';
  const write=()=>f.store.transaction(type,s=>{
    if(f.lane==='legacy')requestModelProcess(s.jobs[f.job.id],invocation);
    scope=originalStoreExecutionCustodyFrom(f.store).scope;
    token=f.lane==='legacy'?prepareRuntimeModelRequestFrom(f.store,s,input):unbound?prepareOriginalWorkerLaunchFrom(f.store,s,{job_id:f.job.id,kind:'model',invocation_id:invocation.invocation_id}):prepareOriginalModelRequestFrom(f.store,s,input);
    pending?.({token,scope,input});if(rollback)throw Error('Fictional selected rollback');return s;
  },options);
  return {write,get token(){return token;},get scope(){return scope;},input,invocation,type};
}
function sourceExecutableMetadata(t,f,control){
  if(f.executableMetadata)return;
  const root=f.root,bin=path.join(root,'bin'),file=path.join(bin,'codex');
  fs.mkdirSync(bin,{mode:0o700});fs.writeFileSync(file,'Source fixture; never execute this file.\n',{mode:0o700});
  // Exact resolver metadata only. Node creation remains controlled; this
  // private dummy is never executed and does not attest OS executability.
  const access=t.mock.method(fs,'accessSync',function(...args){
    if(args.length!==2||args[0]!==file||args[1]!==fs.constants.X_OK)return Reflect.apply(nativeAccessSync,fs,args);
    for(const directory of [root,bin]){Reflect.apply(nativeAccessSync,fs,[directory,fs.constants.F_OK]);const info=nativeLstatSync(directory);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0,'private real fixture directory');}
    Reflect.apply(nativeAccessSync,fs,[file,fs.constants.F_OK]);const info=nativeLstatSync(file);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&(info.mode&0o111)!==0,'regular nonlinked executable-mode dummy');
  });
  const hadPath=Object.hasOwn(process.env,'PATH'),savedPath=process.env.PATH;process.env.PATH=bin;
  control.resolverCleanup.push(()=>{access.mock.restore();if(hadPath)process.env.PATH=savedPath;else delete process.env.PATH;});
  f.executableMetadata={bin,file};syncBuiltinESMExports();
}
// Complete one actual private Source route, including canonical observers and
// the first real adapter onSpawn timing. Only Node creation is controlled;
// these emitters and fixed JSONL are not an OS/provider/Native execution.
async function completeSourceInvocation(t,f,control,label){
  sourceExecutableMetadata(t,f,control);
  const job=f.store.read().jobs[f.job.id],callPolicy=normalizeTimeout({timeout_ms:job.timeout_ms,timeout_reason:job.timeout_reason});
  const r=request(f,label);r.write();const model=controlledInventoryChild(process.pid+91000+control.calls.length);let closed=false,birth=null,receipt=null,timing=null;
  model.stdin=new PassThrough();model.stdout=new PassThrough();model.stderr=new PassThrough();model.once('close',()=>{closed=true;});control.children.push(model);
  const options={...(f.lane==='legacy'?{runtimeExecutionLaunch:r.token}:{originalExecutionLaunch:r.token}),timeoutReason:callPolicy.timeout_reason,
    onModelProcess:value=>{
      assertRuntimeAdapterModelBirthFrom(r.token,value);
      f.store.transaction('job.model_process.born',state=>{recordModelProcessBirth(state.jobs[f.job.id],r.invocation,value);approveRuntimeModelProcessObservationFrom(f.store,state,r.token,'birth',value);return state;});birth=value;
    },
    onModelClosure:(value,close)=>{
      assertRuntimeAdapterModelClosureFrom(r.token,value,close);
      f.store.transaction('job.model_process.closed',state=>{recordModelProcessClosure(state.jobs[f.job.id],r.invocation,value,close);approveRuntimeModelProcessObservationFrom(f.store,state,r.token,'closure',value,close);return state;});receipt=close;
    },
    onSpawn:value=>{
      timing=value;const current=f.store.read().jobs[f.job.id];
      if(!Object.hasOwn(current,'execution_deadline_at'))f.store.transaction('job.execution_started',state=>{Object.assign(state.jobs[f.job.id],value);return state;});
      else assert.ok(Date.parse(value.execution_deadline_at)<=Date.parse(current.execution_deadline_at),'a later call cannot replace the first overall deadline');
    }
  };
  assert.equal(Object.hasOwn(options,'signal'),false,'no optional worker/controller signal protects this test');
  const operation=runRuntimeModelWithOutcome(f.store,'codex',null,r.input.prompt,f.root,callPolicy.timeout_ms,r.input.selection,options);
  const observed=operation.completion.then(value=>({value,failed:false}),error=>({error,failed:true}));
  try{
    assert.equal(control.calls.at(-1)[0],f.executableMetadata.file,'the actual facade resolved the exact private dummy, with no host CLI fallback');
    model.emit('spawn');
    const thread='fictional-cross-request-thread-'+r.invocation.invocation_id,turn='fictional-cross-request-turn';
    model.stdout.end([{type:'thread.started',thread_id:thread},{type:'turn.started',thread_id:thread,turn_id:turn},{type:'item.completed',thread_id:thread,turn_id:turn,item:{id:'fictional-answer',type:'agent_message',phase:'final_answer',text:'Fictional complete Source answer.'}},{type:'turn.completed',thread_id:thread,turn_id:turn}].map(value=>JSON.stringify(value)+'\n').join(''));
    model.emit('exit',0,null);model.emit('close',0,null);
    const settled=await observed;if(settled.failed)throw settled.error;
    assert.equal(settled.value.text,'Fictional complete Source answer.');assert.ok(birth);assert.ok(receipt);assert.ok(timing);
    const capture=consumeRuntimeModelOutcome(operation.call,settled.value);assert.equal(capture.kind,'returned');assert.equal(capture.process.closed,true);assert.equal(assertRuntimeModelOutcomeEligible(capture),true,'A/B used the actual opt-in private eligibility route');
    assert.equal(assertRuntimeModelProcessObservedFrom(r.token,birth,receipt),true,'A completed the genuine private and canonical Source guard');
    const current=f.store.read().jobs[f.job.id],entry=current.model_process_tracking.invocations.find(value=>value.invocation_id===r.invocation.invocation_id);
    assert.deepEqual(entry.birth,birth);assert.deepEqual(entry.closure,receipt);assert.equal(current.status,'running');
    return {invocation_id:r.invocation.invocation_id,entry:JSON.parse(JSON.stringify(entry)),overall:current.execution_deadline_at,call_deadline_at_ms:Date.parse(timing.execution_deadline_at)};
  }finally{if(!closed){model.emit('exit',1,null);model.emit('close',1,null);}await observed;}
}
function reopenIssuer(f){const previous=f.store;previous.close();f.store=new Store(f.root);return f.store;}
function adapterInput(input){const {host,native_id,prompt,cwd,selection}=input;return {host,native_id,prompt,cwd,selection};}
function assertActive(f,token,input){return f.lane==='legacy'?assertLegacyRuntimeModelLaunchFrom(token,adapterInput(input)):assertOriginalModelLaunchToken(token,adapterInput(input));}

for(const lane of ['legacy','original']){
  test(`${lane} actual request commit retains the exact issuing scope and strong prepared input`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control),r=request(f,'Fictional exact input',{pending:({token})=>{
      assert.throws(()=>inspectRuntimeModelRequestCommitFrom(token,f.store),commitHeld);
      assert.throws(()=>commitRuntimeExecutionWriteFrom(f.store,Object.freeze({})),error=>error?.code==='LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED');
      assert.throws(()=>retainOriginalModelRequestCommitFrom(f.store,Object.freeze({})),error=>error?.code==='LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED');
    }});
    r.write();const proof=inspectRuntimeModelRequestCommitFrom(r.token,f.store);
    assert.equal(proof.protocol,'runtime-model-request-commit-v1');assert.equal(proof.stage,'request');assert.equal(proof.lane,lane);assert.equal(proof.type,r.type);
    assert.equal(proof.store,f.store);assert.equal(proof.db,f.store.db);assert.equal(proof.root,f.root);assert.equal(proof.scope,r.scope);
    assert.equal(proof.job_id,f.job.id);assert.equal(proof.instance_id,f.job.instance_id);assert.equal(proof.invocation_id,r.invocation.invocation_id);
    assert.deepEqual(proof.input_binding,{host:'codex',native_id:null,prompt_sha256:sha(r.input.prompt),cwd:f.root,selection_sha256:sha(JSON.stringify(r.input.selection)),prompt_utf16_sha256:sha(r.input.prompt,'utf16le'),prompt_utf16_units:r.input.prompt.length});
    assert.deepEqual(proof.timeout_policy,policy);assert.ok(Object.isFrozen(proof));assert.ok(Object.isFrozen(proof.input_binding));assert.ok(Object.isFrozen(proof.timeout_policy));
    assert.equal(Object.hasOwn(proof,'child'),false);assert.equal(Object.hasOwn(proof,'launch_committed'),false);
    assert.equal(control.calls.length,1,'only the controlled worker was created; request proof is not a model launch');
    assertActive(f,r.token,r.input);
    assert.throws(()=>assertActive(f,r.token,{...r.input,prompt:r.input.prompt+' changed'}),/MODEL_INPUT_CHANGED/);
    assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store),proof,'reading does not replace or reissue the retained confirmation');
    const another=new Store(f.root);try{assert.throws(()=>inspectRuntimeModelRequestCommitFrom(r.token,another),commitHeld);}finally{another.close();}
    assert.throws(()=>inspectRuntimeModelRequestCommitFrom(Object.freeze({...r.token}),f.store),commitHeld);
  });
  test(`${lane} rollback cannot manufacture request confirmation or active eligibility`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control),r=request(f,'Fictional rolled back',{rollback:true});
    assert.throws(r.write,/Fictional selected rollback/);assert.throws(()=>inspectRuntimeModelRequestCommitFrom(r.token,f.store),commitHeld);
    assert.throws(()=>assertActive(f,r.token,r.input),/PRIVATE_(CAPABILITY|LAUNCH)_REQUIRED/);assert.equal(control.calls.length,1);
  });
  test(`${lane} snapshot failure after physical COMMIT leaves request spent and token unarmed`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control),snapshot=f.store.snapshotState;
    const r=request(f,'Fictional committed but failed return'),failure=Error('Fictional postcommit snapshot binding failure');let afterCommit=false;
    f.store.snapshotState=function(state){if(this.inTransaction&&this.db.isTransaction===false){afterCommit=true;throw failure;}return Reflect.apply(snapshot,this,[state]);};
    try{assert.throws(r.write,error=>error===failure);}finally{f.store.snapshotState=snapshot;}
    assert.equal(afterCommit,true,'the failure is after the actual physical COMMIT');
    assert.throws(()=>inspectRuntimeModelRequestCommitFrom(r.token,f.store),commitHeld);assert.throws(()=>assertActive(f,r.token,r.input),/PRIVATE_(CAPABILITY|LAUNCH)_REQUIRED/);
    const persisted=f.store.read().jobs[f.job.id];assert.equal(persisted.model_process_tracking.current,r.invocation.invocation_id);
    if(lane==='original')assert.ok(persisted.original_execution_assignment.launches.some(l=>l.invocation_id===r.invocation.invocation_id));
    assert.throws(()=>f.store.transaction(r.type,s=>{if(lane==='original')prepareOriginalModelRequestFrom(f.store,s,r.input);else prepareRuntimeModelRequestFrom(f.store,s,r.input);return s;}),/MODEL_REQUEST_REQUIRED/);
    assert.equal(control.calls.length,1,'no model child or replacement allowance is inferred from durable request DATA');
  });
  test(`${lane} failed retained registration after physical COMMIT cannot arm a token`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control),r=request(f,'Fictional registration failure');
    const failure=Error('Fictional retained registration failed'),nativeSet=WeakMap.prototype.set;let registered=0,afterCommit=false;
    const mocked=t.mock.method(WeakMap.prototype,'set',function(key,value){
      const result=Reflect.apply(nativeSet,this,[key,value]);
      if(value?.protocol==='runtime-model-request-commit-v1'&&value.store===f.store){registered++;afterCommit=f.store.inTransaction&&f.store.db.isTransaction===false;throw failure;}
      return result;
    });
    try{assert.throws(r.write,error=>error===failure);}finally{mocked.mock.restore();}
    assert.equal(registered,1);assert.equal(afterCommit,true,'the actual private registration was reached after physical COMMIT');
    assert.throws(()=>inspectRuntimeModelRequestCommitFrom(r.token,f.store),commitHeld,'a partial private map entry is not an armed confirmation');
    assert.throws(()=>assertActive(f,r.token,r.input),/PRIVATE_(CAPABILITY|LAUNCH)_REQUIRED/);
    const persisted=f.store.read().jobs[f.job.id];assert.equal(persisted.model_process_tracking.current,r.invocation.invocation_id);
    assert.throws(()=>f.store.transaction(r.type,s=>{if(lane==='original')prepareOriginalModelRequestFrom(f.store,s,r.input);else prepareRuntimeModelRequestFrom(f.store,s,r.input);return s;}),/MODEL_REQUEST_REQUIRED/);
    assert.equal(control.calls.length,1,'retainer failure creates no model process or replacement allowance');
  });
  test(`${lane} retained request remains historical after issuer closes without reviving active launch`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control),r=request(f,'Fictional history');r.write();const proof=inspectRuntimeModelRequestCommitFrom(r.token,f.store);
    f.store.close();assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store),proof);
    assert.throws(()=>assertActive(f,r.token,r.input),/PRIVATE_CAPABILITY_REQUIRED|STORE_EXPIRED/);assert.equal(control.calls.length,1);
  });
  test(`${lane} request proof distinguishes exact lone-surrogate code units despite UTF8 collision`,async t=>{
    const control=controlledCreation(t),a=await runningFixture(t,lane,control),b=await runningFixture(t,lane,control);
    const first=request(a,'\ud800'),second=request(b,'\ud801');first.write();second.write();
    const p=inspectRuntimeModelRequestCommitFrom(first.token,a.store),q=inspectRuntimeModelRequestCommitFrom(second.token,b.store);
    assert.equal(p.input_binding.prompt_sha256,q.input_binding.prompt_sha256,'UTF8 replacement bytes collide for these different primitive strings');
    assert.equal(p.input_binding.prompt_utf16_units,1);assert.equal(q.input_binding.prompt_utf16_units,1);
    assert.notEqual(p.input_binding.prompt_utf16_sha256,q.input_binding.prompt_utf16_sha256);
    assert.equal(p.input_binding.prompt_utf16_sha256,sha('\ud800','utf16le'));assert.equal(q.input_binding.prompt_utf16_sha256,sha('\ud801','utf16le'));
    if(lane==='original')assert.throws(()=>assertActive(a,first.token,{...first.input,prompt:'\ud801'}),/MODEL_INPUT_CHANGED/);
    assert.equal(control.calls.length,2,'both controlled workers are Source fixtures, with no model creation');
  });
}

test('old unbound Original preparation remains outside the new committed-input proof',async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,'original',control),r=request(f,'Fictional old preparation',{unbound:true});r.write();
  assert.throws(()=>inspectRuntimeModelRequestCommitFrom(r.token,f.store),commitHeld);assertActive(f,r.token,r.input);assert.equal(control.calls.length,1);
});


test('new Original currentness reuses actual scoped specialist producers across first timing and revocation',async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,'original',control,{scoped:true}),r=request(f,'Fictional scoped currentness');r.write();
  const before=assertRuntimeModelRequestCurrentFrom(r.token,f.store),expiry=Date.parse(f.scoped.definition.expires_at);
  assert.deepEqual(before,{authority_deadline_at_ms:expiry,execution_deadline_at_ms:null});assert.ok(Object.isFrozen(before));
  assert.equal(assertActive(f,r.token,r.input).deadline_at_ms,expiry,'Source grant expiry is an operation bound; creation startup cutoff is separate');
  // Canonical fictional timing tests projection compatibility only. No model
  // spawn or successful outcome is inferred from this manually written DATA.
  f.store.transaction('job.execution_started',state=>{Object.assign(state.jobs[f.job.id],executionTiming(Date.now(),policy));return state;});
  const after=assertRuntimeModelRequestCurrentFrom(r.token,f.store);assert.equal(after.authority_deadline_at_ms,expiry);assert.equal(after.execution_deadline_at_ms,Date.parse(f.store.read().jobs[f.job.id].execution_deadline_at));
  const canonicalDeadline=f.store.read().jobs[f.job.id].execution_deadline_at;
  f.store.transaction('fictional.partial_timing',state=>{delete state.jobs[f.job.id].execution_deadline_at;return state;});
  assert.throws(()=>assertRuntimeModelRequestCurrentFrom(r.token,f.store),/MODEL_OVERALL_DEADLINE_REQUIRED/,'partial timing cannot erase the Source overall bound');
  f.store.transaction('fictional.restore_timing',state=>{state.jobs[f.job.id].execution_deadline_at=canonicalDeadline;return state;});
  assert.equal(assertRuntimeModelRequestCurrentFrom(r.token,f.store).execution_deadline_at_ms,after.execution_deadline_at_ms);
  revokeScoped(f);
  assert.throws(()=>assertRuntimeModelRequestCurrentFrom(r.token,f.store),/Specialist Held:.*expired\/revoked/);
  assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store).scope,r.scope,'factual request confirmation does not repair revoked authority');assert.equal(control.calls.length,1);
});

for(const lane of ['legacy','original'])test(`${lane} opt-in currentness rejects observed worker closure while retaining request history`,async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,lane,control),r=request(f,'Fictional parent closure');r.write();
  assert.deepEqual(assertRuntimeModelRequestCurrentFrom(r.token,f.store),{authority_deadline_at_ms:null,execution_deadline_at_ms:null});
  f.child.emit('exit',0,null);f.child.emit('close',0,null);
  assert.throws(()=>assertRuntimeModelRequestCurrentFrom(r.token,f.store),/MODEL_(REQUEST_ASSIGNMENT|ASSIGNMENT)_CHANGED/);
  assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store).scope,r.scope);assert.equal(control.calls.length,1);
});

test('new Original fixed launch rechecks revoked scoped grant after a successful caller callback',async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,'original',control,{scoped:true}),r=request(f,'Fictional callback does not authorize');r.write();let checked=0;
  assertRuntimeModelRequestCurrentFrom(r.token,f.store);
  await assert.rejects(runRuntimeModel('codex',null,r.input.prompt,f.root,policy.timeout_ms,r.input.selection,{originalExecutionLaunch:r.token,timeoutReason:policy.timeout_reason,resolveExecutable:()=>process.execPath,beforeOriginalSpawn:()=>{revokeScoped(f);checked++;}}),/Specialist Held:.*expired\/revoked/);
  assert.equal(checked,1);assert.equal(control.calls.length,1,'the fixed Source gate rejects before a model creation despite callback success');
});

test('new Original request commit uses captured native clock despite a replaced final Date.now entry',async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,'original',control),nativeNow=Date.now;let calls=0;
  const r=request(f,'Fictional native final clock',{options:{beforeCommit:()=>{Date.now=()=>{calls++;throw Error('Mutable final clock must not run');};}}});
  try{r.write();}finally{Date.now=nativeNow;}
  assert.equal(calls,0);assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store).scope,r.scope,'the actual fixed Store COMMIT armed this request');assert.equal(control.calls.length,1);
});

test('new Original request commit refuses mutable COMMIT entry without arming the request',async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,'original',control),nativeExec=f.store.db.exec;let commits=0;
  const r=request(f,'Fictional mutable COMMIT',{options:{beforeCommit:()=>{f.store.db.exec=function(sql){if(sql==='COMMIT')commits++;return Reflect.apply(nativeExec,this,[sql]);};}}});
  try{assert.throws(r.write,error=>error?.code==='LEGACY_RUNTIME_COMMIT_ENTRY_CHANGED');}finally{f.store.db.exec=nativeExec;}
  assert.equal(commits,0);assert.throws(()=>inspectRuntimeModelRequestCommitFrom(r.token,f.store),commitHeld);assert.throws(()=>assertActive(f,r.token,r.input),/PRIVATE_LAUNCH_REQUIRED/);assert.equal(control.calls.length,1);
});

test('new Original actual model creation selects native COMMIT fence and preserves failed child custody',async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,'original',control),r=request(f,'Fictional model creation fence');r.write();
  const child=controlledInventoryChild(process.pid+90000),nativeExec=f.store.db.exec;let commits=0;
  control.children.push(child);control.onCreate=created=>{if(created===child)f.store.db.exec=function(sql){if(sql==='COMMIT')commits++;return Reflect.apply(nativeExec,this,[sql]);};};
  const pending=runRuntimeModel('codex',null,r.input.prompt,f.root,policy.timeout_ms,r.input.selection,{originalExecutionLaunch:r.token,timeoutReason:policy.timeout_reason,resolveExecutable:()=>process.execPath});
  const observed=pending.then(value=>({value}),error=>({error}));
  try{
    f.store.db.exec=nativeExec;
    const uncommitted=f.store.read().jobs[f.job.id].original_execution_assignment.launches.find(x=>x.invocation_id===r.invocation.invocation_id);assert.equal(uncommitted.birth,null,'failed creation COMMIT itself did not persist a birth');
    child.emit('exit',1,null);child.emit('close',1,null);
    const result=await observed;assert.equal(result.error?.code,'LEGACY_RUNTIME_COMMIT_ENTRY_CHANGED');assert.equal(commits,0);assert.equal(control.calls.length,2);
    assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store).scope,r.scope,'only the prior request commit remains factual');
    assert.throws(()=>assertRuntimeModelRequestCurrentFrom(r.token,f.store),/MODEL_REQUEST_CURRENT_REQUIRED/);
    assert.equal(f.store.read().jobs[f.job.id].model_process_tracking.current,r.invocation.invocation_id,'late factual child observations do not create a replacement request');
  }finally{f.store.db.exec=nativeExec;control.onCreate=null;}
});


test('fixed Original Source-generation metadata accepts no caller selectors or Native lookup',()=>{
  const current=inspectOriginalSourceGenerationFrom();assert.match(current,/^[a-f0-9]{64}$/);assert.equal(inspectOriginalSourceGenerationFrom(),current);
  for(const selector of [undefined,null,{},[],['adapters.mjs']])assert.throws(()=>inspectOriginalSourceGenerationFrom(selector),error=>error?.code==='ORIGINAL_EXECUTION_SOURCE_GENERATION_ARGUMENTS');
});


for(const lane of ['legacy','original'])test(`${lane} prepared known overall timing cannot be erased before a later call`,async t=>{
  const control=controlledCreation(t),f=await runningFixture(t,lane,control);
  // This is canonical fictional timing DATA, not evidence of a model spawn.
  f.store.transaction('fictional.known_execution',state=>{Object.assign(state.jobs[f.job.id],executionTiming(Date.now(),policy));return state;});
  const r=request(f,'Fictional known overall bound');r.write();const before=assertRuntimeModelRequestCurrentFrom(r.token,f.store);assert.notEqual(before.execution_deadline_at_ms,null);
  f.store.transaction('fictional.erase_all_timing',state=>{const job=state.jobs[f.job.id];delete job.execution_started_at;delete job.execution_deadline_at;delete job.termination_deadline_at;return state;});
  assert.throws(()=>assertRuntimeModelRequestCurrentFrom(r.token,f.store),/MODEL_OVERALL_DEADLINE_CHANGED/);
  assert.equal(inspectRuntimeModelRequestCommitFrom(r.token,f.store).scope,r.scope);assert.equal(control.calls.length,1);
});


for(const lane of ['legacy','original']){
  test(`${lane} a completed prior model cannot renew an erased overall bound in a fresh request`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control,{timeoutPolicy:expiryPolicy});
    const a=await completeSourceInvocation(t,f,control,'Fictional completed A before erased overall timing');assert.equal(control.calls.length,2);assert.equal(typeof a.overall,'string');
    const established=Date.parse(a.overall),startup=Date.parse(f.store.read().jobs[f.job.id].started_at)+STARTUP_TIMEOUT_MS;
    assert.ok(established<startup,'the genuine A overall deadline precedes the existing worker startup cutoff');
    const remaining=Math.max(0,established+1-sourceNow());assert.ok(remaining<=expiryPolicy.timeout_ms+1);
    await new Promise(resolve=>sourceTimer(resolve,remaining));
    const after=sourceNow();assert.ok(after>established,'A actual established execution deadline has expired');assert.ok(after<startup,'the otherwise-valid worker startup window remains live');
    // Only durable DATA crosses this issuer boundary. No A token, adapter
    // object, private result or cancellation signal is supplied to B.
    const successor=reopenIssuer(f);
    try{
      successor.transaction('fictional.erase_completed_overall',state=>{const job=state.jobs[f.job.id];delete job.execution_started_at;delete job.execution_deadline_at;delete job.termination_deadline_at;return state;});
      const ordinary=successor.read(),live=ordinary.jobs[f.job.id];assert.equal(ordinary.paused,false);assert.equal(live.status,'running');assert.equal(live.epoch,ordinary.owner.epoch);assert.equal(live.worker_pid,process.pid);
      const b=request(f,'Fictional B with otherwise-current ordinary authority');
      assert.throws(b.write,error=>error?.code===(lane==='legacy'?'LEGACY_RUNTIME_MODEL_OVERALL_DEADLINE_LOST':'ORIGINAL_EXECUTION_MODEL_OVERALL_DEADLINE_LOST'));
      assert.equal(b.token,undefined,'no new model capability was issued');assert.equal(control.calls.length,2,'B was refused before any second model creation');
      const current=successor.read().jobs[f.job.id];assert.deepEqual(current.model_process_tracking.invocations.find(value=>value.invocation_id===a.invocation_id),a.entry);
      for(const key of ['execution_started_at','execution_deadline_at','termination_deadline_at'])assert.equal(Object.hasOwn(current,key),false,'the refusal does not reconstruct a new allowance');
      if(lane==='original'){
        assert.equal(current.original_execution_assignment.launches.some(value=>value.kind==='model'&&value.invocation_id===b.invocation.invocation_id),false);
        const pending=current.model_process_tracking.invocations.find(value=>value.invocation_id===b.invocation.invocation_id);assert.ok(pending);assert.equal(pending.birth,null);assert.equal(pending.closure,null,'the separately persisted B request remains UNKNOWN/occupied');
      }else assert.equal(current.model_process_tracking.current,a.invocation_id,'the unissued B request write rolled back');
    }finally{successor.close();}
  });
  test(`${lane} a first unknown model request stays unknown without a new allowance`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control);let pending=request(f,'Fictional first unknown A');pending.write();const id=pending.invocation.invocation_id;pending=null;
    const successor=reopenIssuer(f);
    try{
      assert.throws(()=>{const b=request(f,'Fictional B after unknown A');b.write();},error=>error?.code==='MODEL_PROCESS_CLOSURE_HELD');
      const current=successor.read().jobs[f.job.id];assert.equal(current.model_process_tracking.current,id);assert.equal(current.model_process_tracking.invocations.length,1);assert.equal(current.model_process_tracking.invocations[0].birth,null);assert.equal(current.model_process_tracking.invocations[0].closure,null);assert.equal(control.calls.length,1,'neither model was created');
    }finally{successor.close();}
  });
  test(`${lane} successive completed calls retain an intact first overall deadline across issuer reopen`,async t=>{
    const control=controlledCreation(t),f=await runningFixture(t,lane,control),a=await completeSourceInvocation(t,f,control,'Fictional intact A');
    const successor=reopenIssuer(f);
    try{
      const b=await completeSourceInvocation(t,f,control,'Fictional intact B');assert.equal(b.overall,a.overall);assert.ok(b.call_deadline_at_ms<=Date.parse(a.overall));assert.equal(control.calls.length,3,'one controlled worker and exactly A/B model creations');
      const current=successor.read().jobs[f.job.id];assert.equal(current.model_process_tracking.invocations.length,2);assert.deepEqual(current.model_process_tracking.invocations[0],a.entry);assert.equal(current.model_process_tracking.current,b.invocation_id);assert.ok(current.model_process_tracking.invocations[1].birth);assert.ok(current.model_process_tracking.invocations[1].closure);
    }finally{successor.close();}
  });
}
