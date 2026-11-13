import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {Store,withStore,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {reference} from '../plugins/soloco/runtime/specialists.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {operatingContext} from '../plugins/soloco/runtime/operating-state.mjs';
import {developmentAssignment} from '../plugins/soloco/runtime/develop.mjs';
import {sandboxProfile} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

// These fixtures exercise real Engine, normalized Store, context and worker
// transitions. All model outputs/semantic judgments are explicit fictional
// injected doubles. No native process, provider, sandbox test or company data.
const launch={check:()=>({available:true,authenticated:true,version:'FICTIONAL MONITOR ADAPTER'}),launch:()=>({on(){return this;},unref(){}})};
const instruction='Only this fictional bounded preparation; no external execution, authority, retry or spending.';
const future=ms=>new Date(Date.now()+ms).toISOString();
const hash=value=>digest(JSON.stringify(value));
const result=(job,extra={})=>({native_id:'fictional-monitor-'+job.id,text:JSON.stringify({content:'FICTIONAL bounded monitor fixture output; no native acceptance.',messages:[],notices:[],...extra})});
const spawn=(timeout,options)=>options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));

async function fixedCapabilityBoundary(fn){
  // engine.open/plan may inspect the local execution capability. This fixture
  // never runs those OS probes: only the three closed source-owned probe forms
  // below receive SYNTHETIC results. The module's capability cache is therefore
  // fictional for this isolated test process, never OS qualification.
  const methods=['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork','ChildProcess','_forkChild'].filter(name=>Object.hasOwn(childProcess,name));
  const original=Object.fromEntries(methods.map(name=>[name,childProcess[name]])),effects=[],unexpected=[];
  const node=fs.realpathSync(process.execPath);
  const reject=(method,args)=>{unexpected.push({method});throw Error('FICTIONAL monitor boundary denies unknown child_process call: '+method);};
  const environment=scratch=>({PATH:'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,TMP:scratch,TEMP:scratch,LANG:'C',LC_ALL:'C',OPENSSL_CONF:'/dev/null',NODE_DISABLE_COLORS:'1'});
  const optionKeys=(options,keys)=>assert.deepEqual(Object.keys(options).sort(),keys.slice().sort());
  for(const name of methods)childProcess[name]=function(...args){return reject(name,args);};
  childProcess.spawnSync=function(...invocation){
    if(new.target)return reject('spawnSync:new',invocation);
    const [command,args,options]=invocation;
    try{
      assert(Array.isArray(args));assert(options&&typeof options==='object');
      if(command==='/usr/bin/otool'){
        assert.deepEqual(args,['-L',node]);optionKeys(options,['encoding','timeout','maxBuffer','killSignal','env']);
        assert.equal(options.encoding,'utf8');assert(options.timeout>0&&options.timeout<=5000);assert.equal(options.maxBuffer,100000);assert.equal(options.killSignal,'SIGKILL');assert.deepEqual(options.env,{PATH:'/usr/bin:/bin'});
        effects.push({kind:'SYNTHETIC fixed runtime-library capability probe',command,argument_count:args.length});
        return {status:0,signal:null,stdout:node+':\n',stderr:''};
      }
      if(command===node){
        assert.equal(args.length,3);assert(['--test-isolation=none','--experimental-test-isolation=none'].includes(args[0]));assert.deepEqual(args.slice(1),['--eval','']);
        optionKeys(options,['cwd','env','encoding','timeout','maxBuffer','killSignal']);
        assert.equal(options.cwd,path.dirname(node));assert.deepEqual(options.env,environment(os.tmpdir()));assert.equal(options.encoding,'utf8');assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,10000);assert.equal(options.killSignal,'SIGKILL');
        effects.push({kind:'SYNTHETIC fixed Node-flag capability probe',command,argument_count:args.length});
        return {status:0,signal:null,stdout:'',stderr:''};
      }
      if(command==='/usr/bin/sandbox-exec'){
        optionKeys(options,['cwd','env','encoding','timeout','maxBuffer','killSignal']);
        const directory=options.cwd,scratch=path.join(directory,'scratch'),probe=path.join(directory,'probe.test.mjs');
        assert.equal(directory,fs.realpathSync(directory));assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('soloco-sandbox-check-'));
        const fixedProbe="import test from 'node:test';test('sandbox startup',()=>process.stdout.write('SOLOCO_SANDBOX_READY\\n'));\n";
        assert.equal(fs.readFileSync(probe,'utf8'),fixedProbe);
        assert.equal(args.length,12);assert.equal(args[0],'-p');assert.equal(args[1],sandboxProfile(directory,scratch));assert.equal(args[2],node);
        assert.deepEqual(args.slice(3,7),['--permission','--allow-fs-read='+directory,'--allow-fs-write='+scratch,'--test']);
        assert(['--test-isolation=none','--experimental-test-isolation=none'].includes(args[7]));
        assert.deepEqual(args.slice(8),['--test-concurrency=1','--test-reporter=tap','--test-force-exit','./probe.test.mjs']);
        assert.deepEqual(options.env,environment(scratch));assert.equal(options.encoding,'utf8');assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,10000);assert.equal(options.killSignal,'SIGKILL');
        effects.push({kind:'SYNTHETIC fixed Seatbelt-startup capability probe',command,argument_count:args.length});
        return {status:0,signal:null,stdout:'TAP version 13\nSOLOCO_SANDBOX_READY\n',stderr:''};
      }
    }catch(error){unexpected.push({method:'spawnSync'});throw error;}
    return reject('spawnSync',invocation);
  };
  syncBuiltinESMExports();
  try{return await fn(effects);}
  finally{
    for(const name of methods)childProcess[name]=original[name];
    syncBuiltinESMExports();
    assert.deepEqual(unexpected,[],'No child_process operation outside the fixed fictional capability census is allowed');
  }
}

async function fixture(fn,{domainInput=true}={}){
  return fixedCapabilityBoundary(async effects=>{
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-worker-monitor-'))),previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(base,'bindings');
  const args={root:path.join(base,'company'),session_id:'fictional-monitor-founder',epoch:1};fs.mkdirSync(args.root);
  const f={base,args,effects,sequence:0,read:()=>withStore(args.root,db=>db.read())};
  f.change=change=>withStore(args.root,db=>{let value;db.transaction('fictional.monitor.fixture',s=>{value=change(s);return s;});return value;});
  f.action=(action,extra={})=>engine.specialists({...args,action,operation_id:'monitor-'+(++f.sequence),source_instruction:instruction,...extra},'codex');
  try{
    engine.bind(args.root,args.session_id,'codex');engine.open({...args,idea:'Fictional worker-monitor regression only'},'codex');
    engine.control({root:args.root,session_id:args.session_id,expected_epoch:1,action:'pause',source_instruction:'pause'},'codex');
    engine.storageControl({...args,action:'migrate',source_instruction:'Migrate this disposable fictional fixture only.'},'codex');
    engine.control({root:args.root,session_id:args.session_id,expected_epoch:1,action:'resume',source_instruction:'resume'},'codex');
    if(domainInput)engine.save({...args,id:'domain-input',kind:'artifact',content:'FICTIONAL unresolved condition; no measured benefit or permission.'},'codex');
    await fn(f);
  }finally{
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    fs.rmSync(base,{recursive:true,force:true});
  }
  });
}
function ordinary(f,extra={}){
  return engine.dispatch({...f.args,role:'engineer',task:'Read the exact fictional input and retain its uncertainty.',input_ids:['domain-input'],timeout_ms:600000,timeout_reason:'Bounded fictional monitor controls, not an actual model call.',...extra},'codex',launch);
}
function specialist(f,{profileExpires=future(60000),policyExpires=future(120000)}={}){
  const policyReceipt=f.action('authorize',{policy:{base_roles:['engineer'],input_ids:['domain-input'],scope:'*',expires_at:policyExpires,max_profiles:3,max_assignments:6}});
  const policy=f.read().records[policyReceipt.id];
  const definition={base_role:'engineer',charter:{name:'Fictional monitor specialist',mission:'Retain the supplied unresolved condition.',inputs:'Exact fictional input only.',outputs:'One bounded read-only report.',block:'Missing inputs or authority.',success:'Preserve uncertainty.',failure:'Claim execution or permission.',phase:'This monitor fixture only.'},task:'Preserve the fictional unresolved condition.',acceptance:'No omission or new authority.',input_ids:['domain-input'],expires_at:profileExpires,max_assignments:3};
  const profileReceipt=f.action('create',{policy_ref:reference(policy),definition}),profile=f.read().records[profileReceipt.id];
  const job=engine.dispatch({...f.args,role:'engineer',task:definition.task,input_ids:definition.input_ids,specialist_ref:reference(profile),timeout_ms:600000,timeout_reason:'Bounded fictional specialist monitor control.'},'codex',launch);
  return {job,profile,policy};
}
function home(f,id,scope='*',{expires_at=null,dependencies=[]}={}){
  engine.save({...f.args,id,kind:'artifact',content:'FICTIONAL current obligation '+id,
    operating_record:{version:1,kind:'obligation',scope,owner:'runner',conditions:'Always retain the condition.',exceptions:'None',clearing:'Independent exact disposition',expires_at,dependencies,authority_refs:[],evidence_refs:[id]}},'codex');
}
async function operating(f,{validUntil=null,homeExpires=null,dependencyExpires=null,reviewOnly=false}={}){
  // All unqualified fixture input is deliberately represented as an explicit
  // current home before the real operating publication protocol is exercised.
  assert.equal(f.read().records['domain-input'],undefined,'operating fixture starts without an unqualified legacy input');
  f.change(s=>{s.roles={qa:{name:'QA'},engineer:{name:'Engineering'}};s.governance='Read only; no external authority.';s.cos_instructions='Preserve every condition and unknown.';s.team_sha256=teamHash(s);});
  home(f,'condition','a',{expires_at:homeExpires,dependencies:['dependency']});home(f,'dependency','b',{expires_at:dependencyExpires});home(f,'unrelated','c');
  const plan=await call('company_context',{...f.args,protocol:'operating-state-v1',action:'plan',source_instruction:instruction,valid_until:validUntil},'codex');
  assert.deepEqual(plan.frontier,[]);
  const queued=engine.dispatch({...f.args,role:'qa',review_of:plan.id,task:'Independently review every fictional operating condition.',timeout_ms:600000,timeout_reason:'Fictional publication and monitor fixture.'},'codex',launch);
  if(reviewOnly)return {job:queued,plan};
  const packet=assignmentContext(f.read(),f.read().jobs[queued.id]),evidence=packet.operating_evidence;
  const ranges=evidence?Object.values(evidence.sources).flatMap(source=>{const out=[];for(let offset=0;offset<source.length;offset+=16000)out.push({source_id:source.source_id,sha256:source.sha256,offset,length:Math.min(16000,source.length-offset)});return out;}):[];
  let first=true;
  await work(f.args.root,queued.id,async(_h,_n,_p,_d,timeout,_s,options)=>{
    if(first){spawn(timeout,options);first=false;}
    if(ranges.length)return {native_id:'fictional-monitor-'+queued.id,text:JSON.stringify({reads:ranges.splice(0,4)})};
    return result(queued,{review:{verdict:'Pass',reason:'FICTIONAL semantic judgment only.',permitted_action:'publish_operating_state',plan_sha256:hash(f.read().records[plan.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}});
  });
  const done=f.read().jobs[queued.id];assert.equal(done.status,'completed',done.error);
  await call('company_context',{...f.args,protocol:'operating-state-v1',action:'apply',plan_id:plan.id,review_id:done.artifact_id,source_instruction:instruction},'codex');
  assert.doesNotThrow(()=>operatingContext(f.read(),{scope:'a'}));
  const job=engine.dispatch({...f.args,role:'engineer',task:'Use only the accepted fictional operating conditions.',context_scope:'a',timeout_ms:600000,timeout_reason:'Fictional operating monitor fixture.'},'codex',launch);
  assert.equal(f.read().jobs[job.id].context_format,6);return {job,plan};
}
async function development(f){
  fs.writeFileSync(path.join(f.args.root,'sum.mjs'),'export const sum = values => 0;\n');
  fs.writeFileSync(path.join(f.args.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:100000}));
  const plan=await engine.develop({...f.args,action:'plan',model_data_approved:true,read_paths:['sum.mjs'],write_paths:['sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],acceptance:'A retained fictional candidate only; no tests are run by this fixture.',stop_conditions:'Stop on undeclared files or external action.',data_policy:'Only these manually authored fictional files.',source_instruction:instruction,max_attempts:1,timeout_ms:3000,max_output_bytes:10000,max_bytes:20000,expires_at:future(60000)},'codex');
  await engine.develop({...f.args,action:'authorize',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,model_data_approved:true,source_instruction:instruction},'codex');
  // Match the existing real development-worker fixture: queue and bind through
  // the actual development admission, without launching a development test.
  const key='fictional-development-'+(++f.sequence),instance='fictional-instance-'+key;
  f.change(s=>{const job={id:key,role:'engineer',instance_id:instance,session_key:instance,host:'codex',native_id:null,epoch:1,status:'queued',task:'Honor the complete fictional development scope.',inputs:[],review_of:null,development_id:plan.id,created_at:new Date().toISOString()};developmentAssignment(s,job,true,f.args.root);const context=assignmentContext(s,job);s.jobs[key]={...job,inputs:context.inputs,context_sha256:context.hash};s.sessions[instance]={instance_id:instance,role:'engineer',host:'codex',native_id:null};});
  return {job:{id:key},plan,files:[{path:'sum.mjs',content:'export const sum = values => values.reduce((a,b)=>a+b,0);\n'},{path:'sum.test.mjs',content:"import test from 'node:test';test('fictional source only',()=>{});\n"}]};
}

async function monitoring(fn){
  const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval,originalRead=Store.prototype.read;
  const handles=[];let active=null;const reads=new Map();
  globalThis.setInterval=(callback,delay,...args)=>{
    if(delay!==100)return originalSet(callback,delay,...args);
    const handle={callback:()=>callback(...args),active:true};handles.push(handle);return handle;
  };
  globalThis.clearInterval=handle=>{if(handles.includes(handle))handle.active=false;else originalClear(handle);};
  Store.prototype.read=function(...args){if(active!==null)reads.set(this.root,(reads.get(this.root)??0)+1);return originalRead.apply(this,args);};
  const control={
    tick(index=handles.length-1){const handle=handles[index];assert(handle?.active,'the actual worker timer is active');active=index;try{handle.callback();}finally{active=null;}},
    reads:root=>reads.get(fs.realpathSync(root))??0,
    inTick:()=>active!==null,
    live:()=>handles.filter(handle=>handle.active).length,
    handles
  };
  try{return await fn(control);}finally{Store.prototype.read=originalRead;globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear;for(const handle of handles)assert.equal(handle.active,false,'every actual worker monitor was cleared');}
}
async function controlled(f,job,control,invoke,{files,review}={}){
  let entered=false,completed=false,callbackFailed=false,callbackError;
  await work(f.args.root,job.id,async(_h,_n,_p,_d,timeout,_s,options)=>{
    try{
      spawn(timeout,options);control.tick();
      assert.equal(options.signal.aborted,false,'the worker must be healthy before the monitor stimulus');
      entered=true;await invoke(options);completed=true;
      return result(job,{...(files?{files}:{}),...(review?{review}: {})});
    }catch(error){callbackFailed=true;callbackError=error;throw error;}
  });
  // work retains callback failures as failed attempts; assertions still fail this test.
  if(callbackFailed)throw callbackError;
  assert.equal(entered,true,'worker must reach the intended monitor stimulus');
  assert.equal(completed,true,'every monitor stimulus assertion must complete');
  return f.read().jobs[job.id];
}
function held(f,job){const current=f.read().jobs[job.id];assert.notEqual(current.status,'completed',current.error);assert.equal(Object.values(f.read().records).filter(r=>r.job_id===job.id&&r.status==='Submitted').length,0);return current;}

// 1. Hydration counts, including the specialized and operating paths that used
// to hydrate lifetime state on every unchanged monitor tick.
for(const lane of ['ordinary','specialist','operating','operating-review'])test(lane+': unchanged canonical token does not rehydrate whole state',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});
  await fixture(async f=>{
    const selected=lane==='specialist'?specialist(f):lane==='operating'?await operating(f):lane==='operating-review'?await operating(f,{reviewOnly:true}):{job:ordinary(f)};
    await monitoring(async control=>{
      const review=lane==='operating-review'?{verdict:'Blocked',reason:'FICTIONAL review intentionally withheld.'}:undefined;
      const done=await controlled(f,selected.job,control,async options=>{
        const before=control.reads(f.args.root);for(let i=0;i<12;i++)control.tick();
        assert.equal(control.reads(f.args.root),before);assert.equal(options.signal.aborted,false);
      },{review});assert.equal(done.status,'completed',done.error);
      assert.equal(control.live(),0);
    });
  },{domainInput:!lane.startsWith('operating')});
});

test('revisionless public controls retain exact nullable inputs through JSON, completion and review dispatch',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const {job}=specialist(f),state=f.read(),controls=Object.values(state.records).filter(r=>r.kind==='decision'&&['pause','resume'].includes(r.action));
    assert.equal(controls.length,2,'the real public pause/resume setup remains present');
    for(const record of controls)assert.equal(Object.hasOwn(record,'revision'),false,'canonical public control rows remain revisionless');
    const roundtrip=JSON.parse(JSON.stringify(state)),current=roundtrip.jobs[job.id],packet=assignmentContext(roundtrip,current);
    assert.equal(packet.hash,current.context_sha256);assert.deepEqual(packet.inputs,current.inputs);
    for(const input of current.inputs)assert.deepEqual(Object.keys(input).sort(),['id','revision'],'input DTOs have exactly two keys');
    for(const record of controls)assert.deepEqual(current.inputs.find(ref=>ref.id===record.id),{id:record.id,revision:null});
    assert.deepEqual(current.inputs.find(ref=>ref.id==='domain-input'),{id:'domain-input',revision:1});
    for(const mode of ['missing-revision','wrong-revision','missing-record','extra-key']){
      const changed=structuredClone(roundtrip),changedJob=changed.jobs[job.id],ref=changedJob.inputs.find(value=>value.id===controls[0].id);
      if(mode==='missing-revision')delete ref.revision;
      else if(mode==='wrong-revision')ref.revision=1;
      else if(mode==='missing-record')delete changed.records[ref.id];
      else ref.sha256='0'.repeat(64);
      assert.throws(()=>assignmentContext(changed,changedJob),/job inputs missing|Assignment input version changed/,mode+' must remain rejected');
    }
    let done;
    await monitoring(async control=>{done=await controlled(f,job,control,async options=>{assert.equal(options.signal.aborted,false);});assert.equal(done.status,'completed',done.error);assert.equal(control.live(),0);});
    const review=engine.dispatch({...f.args,role:'qa',review_of:done.artifact_id,task:'Independently review the fictional specialist output without accepting it.'},'codex',launch);
    const assertReviewInputs=selected=>{
      const queued=f.read(),reviewJob=queued.jobs[selected.id],reviewPacket=assignmentContext(JSON.parse(JSON.stringify(queued)),JSON.parse(JSON.stringify(reviewJob)));
      assert.equal(reviewPacket.hash,reviewJob.context_sha256);
      for(const record of controls)assert.deepEqual(reviewJob.inputs.find(ref=>ref.id===record.id),{id:record.id,revision:null});
      assert.equal(reviewJob.specialist,undefined,'generic comparison negatives must bypass specialist shape validation');
      for(const mode of ['missing-revision','wrong-revision']){
        const changed=JSON.parse(JSON.stringify(queued)),changedJob=changed.jobs[selected.id],ref=changedJob.inputs.find(value=>value.id===controls[0].id);
        if(mode==='missing-revision')delete ref.revision;else ref.revision=1;
        assert.throws(()=>assignmentContext(changed,changedJob),/Assignment input version changed/,mode+' must fail the generic canonical comparison');
      }
    };
    const blocked={verdict:'Blocked',reason:'FICTIONAL judgment only; no semantic acceptance selected.',permitted_action:'hold',blockers:['The fictional output remains unaccepted.']};
    assertReviewInputs(review);
    await monitoring(async control=>{const finished=await controlled(f,review,control,async options=>{assert.equal(options.signal.aborted,false);},{review:blocked});assert.equal(finished.status,'completed',finished.error);assert.equal(control.live(),0);});
    const controlReview=engine.dispatch({...f.args,role:'qa',review_of:controls[0].id,task:'Inspect the exact fictional public control record without accepting it.'},'codex',launch);
    assertReviewInputs(controlReview);assert.deepEqual(f.read().jobs[controlReview.id].review_of,{id:controls[0].id,revision:null});
    await monitoring(async control=>{const finished=await controlled(f,controlReview,control,async options=>{assert.equal(options.signal.aborted,false);},{review:blocked});assert.equal(finished.status,'completed',finished.error);assert.equal(control.live(),0);});
  });
});

// 2. A supported canonical mutation invalidates all reused structural facts.
test('changed event token hydrates once and a relevant source change aborts',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const {job}=specialist(f);
    await monitoring(async control=>{
      await controlled(f,job,control,async options=>{
        const before=control.reads(f.args.root);f.change(s=>{s.records['domain-input'].content+=' New unresolved condition.';s.records['domain-input'].revision++;});
        control.tick();assert.equal(control.reads(f.args.root),before+1);assert.equal(options.signal.aborted,true);
      });held(f,job);
    });
  });
});
test('a disjoint canonical artifact save refreshes the token without cancelling work',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const job=ordinary(f);
    await monitoring(async control=>{
      const done=await controlled(f,job,control,async options=>{
        const before=control.reads(f.args.root),name=f.read().name;
        // Public rename rejects active work and the ordinary context binds name.
        assert.throws(()=>engine.control({...f.args,expected_epoch:1,action:'rename',name:'Fictional renamed company',expected_name:name,source_instruction:'Rename the company to Fictional renamed company'},'codex'),/Assignments are active/);
        assert.equal(f.read().name,name);
        // A new unrelated artifact is a supported write outside this job's inputs.
        engine.save({...f.args,id:'unrelated-monitor-observation',kind:'artifact',content:'FICTIONAL unrelated observation only; no condition, permission or task input.'},'codex');
        const current=f.read();assert.equal(assignmentContext(current,current.jobs[job.id]).hash,current.jobs[job.id].context_sha256);
        control.tick();assert.equal(control.reads(f.args.root),before+1);assert.equal(options.signal.aborted,false);
        control.tick();assert.equal(control.reads(f.args.root),before+1);
      });assert.equal(done.status,'completed',done.error);
    });
  });
});

// 3. Unknown/error token and an incomplete refresh never reuse a prior success.
for(const mode of ['unknown-token','token-error','refresh-error'])test(mode+': no stale monitor success survives',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const {job}=specialist(f);
    await monitoring(async control=>{
      const token=Store.prototype.changeToken,read=Store.prototype.read;
      try{
        const done=await controlled(f,job,control,async options=>{
          const before=control.reads(f.args.root);
          if(mode==='unknown-token')Store.prototype.changeToken=()=>undefined;
          else if(mode==='token-error')Store.prototype.changeToken=()=>{throw Error('FICTIONAL token read failure');};
          else {f.change(s=>{s.monitor_fixture_revision=true;});Store.prototype.read=function(...args){if(this.root===f.args.root)throw Error('FICTIONAL complete refresh failure');return read.apply(this,args);};}
          control.tick();
          if(mode==='unknown-token'){assert.equal(options.signal.aborted,false);assert.equal(control.reads(f.args.root),before+1);control.tick();assert.equal(control.reads(f.args.root),before+2);}
          else {assert.equal(options.signal.aborted,true);control.tick();assert.equal(options.signal.aborted,true);}
          Store.prototype.changeToken=token;Store.prototype.read=read;
        });if(mode==='unknown-token')assert.equal(done.status,'completed',done.error);else held(f,job);
      }finally{Store.prototype.changeToken=token;Store.prototype.read=read;}
    });
  });
});

// 4. Both specialist clocks remain live even when no database value changes.
// A valid profile cannot outlive its policy: the policy case uses their shared cutoff.
for(const which of ['profile','policy'])test(which+': unchanged-token expiry aborts and retains definition',{concurrency:false},async t=>{
  const start=Date.now();t.mock.timers.enable({apis:['Date'],now:start});await fixture(async f=>{
    const cut=start+60000,{job,profile,policy}=specialist(f,{profileExpires:new Date(cut).toISOString(),policyExpires:new Date(which==='policy'?cut:cut+60000).toISOString()}),before=f.read().records;
    await monitoring(async control=>{
      await controlled(f,job,control,async options=>{const reads=control.reads(f.args.root);t.mock.timers.tick(cut-Date.now());control.tick();assert.equal(options.signal.aborted,true);assert.equal(control.reads(f.args.root),reads);});
      held(f,job);assert.deepEqual(f.read().records[profile.id],before[profile.id]);assert.deepEqual(f.read().records[policy.id],before[policy.id]);
    });
  });
});

// 5. Revocation remains a current canonical fact, never a cached allowance.
for(const which of ['profile','policy'])test(which+': canonical revocation invalidates the monitor cache',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const selected=specialist(f),before=f.read().records[selected.profile.id];
    await monitoring(async control=>{
      await controlled(f,selected.job,control,async options=>{const reads=control.reads(f.args.root);f.action('revoke',{target_ref:reference(selected[which])});control.tick();assert.equal(options.signal.aborted,true);assert.equal(control.reads(f.args.root),reads+1);});
      held(f,selected.job);assert.deepEqual(f.read().records[selected.profile.id],before);
    });
  });
});

// 6. Scope dependency closure contributes every applicable home expiry.
for(const which of ['checkpoint','home','dependency'])test('operating '+which+': expiry is checked without hydration',{concurrency:false},async t=>{
  const start=Date.now();t.mock.timers.enable({apis:['Date'],now:start});await fixture(async f=>{
    const cut=new Date(start+60000).toISOString(),selected=await operating(f,{validUntil:which==='checkpoint'?cut:null,homeExpires:which==='home'?cut:null,dependencyExpires:which==='dependency'?cut:null});
    await monitoring(async control=>{
      await controlled(f,selected.job,control,async options=>{const reads=control.reads(f.args.root);t.mock.timers.tick(Date.parse(cut)-Date.now());control.tick();assert.equal(options.signal.aborted,true);assert.equal(control.reads(f.args.root),reads);});held(f,selected.job);
    });
  },{domainInput:false});
});

// 7. A publication review retains its own plan clock, without changing which
// proposed home expiries the original review/publication protocols enforce.
test('operating plan review expires without a canonical write',{concurrency:false},async t=>{
  const start=Date.now();t.mock.timers.enable({apis:['Date'],now:start});await fixture(async f=>{
    const cut=new Date(start+60000).toISOString(),selected=await operating(f,{validUntil:cut,reviewOnly:true});
    await monitoring(async control=>{
      await controlled(f,selected.job,control,async options=>{t.mock.timers.tick(Date.parse(cut)-Date.now());control.tick();assert.equal(options.signal.aborted,true);},{review:{verdict:'Blocked',reason:'FICTIONAL expired review; no publication.'}});held(f,selected.job);assert.equal(f.read().operating_state,undefined);
    });
  },{domainInput:false});
});

// 8. External development limits and time crossing during that file read.
for(const mode of ['lowered-ceiling','expiry-during-config-read'])test(mode+': unchanged-token external checks stay fresh',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const selected=await development(f),config=path.join(f.args.root,'.company','development.json');
    await monitoring(async control=>{
      const read=fs.readSync;
      try{
        await controlled(f,selected.job,control,async options=>{
          const reads=control.reads(f.args.root);
          if(mode==='lowered-ceiling')fs.writeFileSync(config,JSON.stringify({max_bytes_ceiling:1000}));
          else {let crossed=false;fs.readSync=function(...args){const value=read.apply(this,args);if(!crossed){crossed=true;t.mock.timers.tick(Date.parse(selected.plan.development.scope.expires_at)-Date.now());}return value;};}
          control.tick();assert.equal(options.signal.aborted,true);assert.equal(control.reads(f.args.root),reads);
          assert.match(options.signal.reason.message,mode==='lowered-ceiling'?/ceiling.*lowered/:/expired/);fs.readSync=read;
        },{files:selected.files});held(f,selected.job);
      }finally{fs.readSync=read;}
    });
  });
});

// 9. The same event sequence on a copied/replaced root/store is not the same
// canonical incarnation. Replacement is held before old cutoffs can be reused.
for(const which of ['sqlite','company-directory','root','stat-error'])test(which+': physical incarnation loss fails closed',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const {job}=specialist(f);
    await monitoring(async control=>{
      const lstat=fs.lstatSync;
      try{
        await controlled(f,job,control,async options=>{
          const reads=control.reads(f.args.root);
          if(which==='stat-error')fs.lstatSync=function(file,...rest){if(file===path.join(f.args.root,'.company','company.sqlite'))throw Error('FICTIONAL physical stat failure');return lstat.call(this,file,...rest);};
          else {const selected=which==='sqlite'?path.join(f.args.root,'.company','company.sqlite'):which==='company-directory'?path.join(f.args.root,'.company'):f.args.root,old=selected+'-old-monitor';fs.renameSync(selected,old);fs.cpSync(old,selected,{recursive:which!=='sqlite'});}
          control.tick();assert.equal(options.signal.aborted,true);assert.equal(control.reads(f.args.root),reads);fs.lstatSync=lstat;
        });held(f,job);
      }finally{fs.lstatSync=lstat;}
    });
  });
});
for(const phase of ['inside-snapshot','after-snapshot-body'])test(phase+': physical replacement during a check cannot publish cached facts',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const {job}=specialist(f),snapshot=Store.prototype.readSnapshot;let replaced=false;
    const replace=()=>{const selected=path.join(f.args.root,'.company'),old=selected+'-old-snapshot';fs.renameSync(selected,old);fs.cpSync(old,selected,{recursive:true});replaced=true;};
    await monitoring(async control=>{
      try{
        await controlled(f,job,control,async options=>{
          Store.prototype.readSnapshot=function(fn){return snapshot.call(this,()=>{
            if(control.inTick()&&this.root===f.args.root&&!replaced&&phase==='inside-snapshot')replace();
            const value=fn();
            if(control.inTick()&&this.root===f.args.root&&!replaced&&phase==='after-snapshot-body')replace();
            return value;
          });};
          control.tick();assert.equal(replaced,true);assert.equal(options.signal.aborted,true);Store.prototype.readSnapshot=snapshot;
        });held(f,job);
      }finally{Store.prototype.readSnapshot=snapshot;}
    });
  });
});

// 10. Final publication still validates real current state, independently of a
// successful monitor tick; per-worker state and timer cleanup remain isolated.
test('revocation after final monitor check is caught by the unchanged publication transaction',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const selected=specialist(f),transaction=Store.prototype.transaction;let changed=false;
    try{
      await monitoring(async control=>{
        Store.prototype.transaction=function(type,...args){if(type==='job.completed'&&this.root===f.args.root&&!changed){changed=true;f.action('revoke',{target_ref:reference(selected.profile)});}return transaction.call(this,type,...args);};
        await controlled(f,selected.job,control,async options=>{assert.equal(options.signal.aborted,false);});held(f,selected.job);assert.equal(changed,true);
      });
    }finally{Store.prototype.transaction=transaction;}
  });
});
test('two live workers keep separate root stamps, deadlines and timer cleanup',{concurrency:false},async t=>{
  const start=Date.now();t.mock.timers.enable({apis:['Date'],now:start});await fixture(async first=>{
    const a=specialist(first,{profileExpires:new Date(start+60000).toISOString()});
    await fixture(async second=>{
      const b=specialist(second,{profileExpires:new Date(start+120000).toISOString(),policyExpires:new Date(start+180000).toISOString()});
      await monitoring(async control=>{
        let releaseA,releaseB,readyA,readyB;const enteredA=new Promise(resolve=>{readyA=resolve;}),enteredB=new Promise(resolve=>{readyB=resolve;});
        let runA,runB;
        try{
          runA=work(first.args.root,a.job.id,async(_h,_n,_p,_d,timeout,_s,options)=>{spawn(timeout,options);control.tick(0);readyA(options);await new Promise(resolve=>{releaseA=resolve;});return result(a.job);});
          const optionsA=await Promise.race([enteredA,runA.then(()=>null)]);assert.ok(optionsA,'first worker must enter its injected model');
          runB=work(second.args.root,b.job.id,async(_h,_n,_p,_d,timeout,_s,options)=>{spawn(timeout,options);control.tick(1);readyB(options);await new Promise(resolve=>{releaseB=resolve;});return result(b.job);});
          const optionsB=await Promise.race([enteredB,runB.then(()=>null)]);assert.ok(optionsB,'second worker must enter its injected model');
          assert.equal(optionsA.signal.aborted,false);assert.equal(optionsB.signal.aborted,false);assert.equal(control.live(),2);
          t.mock.timers.tick(start+60000-Date.now());control.tick(0);control.tick(1);assert.equal(optionsA.signal.aborted,true);assert.equal(optionsB.signal.aborted,false);
        }finally{releaseA?.();releaseB?.();await Promise.all([runA,runB].filter(Boolean));}
        held(first,a.job);assert.equal(second.read().jobs[b.job.id].status,'completed');assert.equal(control.live(),0);
      });
    });
  });
});
test('an injected model error still clears its actual monitor and retains a failed attempt',{concurrency:false},async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});await fixture(async f=>{
    const {job}=specialist(f);
    await monitoring(async control=>{
      let entered=false;
      await work(f.args.root,job.id,async(_h,_n,_p,_d,timeout,_s,options)=>{spawn(timeout,options);control.tick();assert.equal(options.signal.aborted,false);entered=true;throw Error('FICTIONAL injected model error; closure unknown.');});
      assert.equal(entered,true,'the intended injected model error must actually be exercised');
      const stopped=held(f,job);assert.equal(stopped.status,'failed');assert.equal(control.live(),0);assert.match(stopped.error,/FICTIONAL injected model error/);
    });
  });
});
