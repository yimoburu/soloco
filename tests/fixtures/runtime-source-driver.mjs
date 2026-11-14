// Fixed controlled-Source driver. Run only in the separately selected outer
// controller/profile. This program does not establish that a profile is active.
// Every launch below uses the real native function; observations confer no
// company, provider, Native, or independent-QA authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import childProcess, {ChildProcess} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {dispatch} from '../../plugins/soloco/runtime/engine.mjs';
import {Store} from '../../plugins/soloco/runtime/store.mjs';

const TASK='FICTIONAL_ONLY_RUNTIME_SOURCE_LIFECYCLE_V1';
const DRIVER_MS=20000,CLEANUP_MS=6500,REPORT_BYTES=32768;
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const workerFile=path.join(sourceRoot,'plugins/soloco/runtime/worker.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const closed=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function emit(value){const text=JSON.stringify(value)+'\n';assert.ok(Buffer.byteLength(text)<=REPORT_BYTES);process.stdout.write(text);}
function groupGone(pid){
  try{process.kill(-pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}
}
function readState(root){const store=new Store(root,false,{readOnly:true});try{return store.read();}finally{store.close();}}

export async function runRuntimeSourceDriver(base){
  assert.ok(path.isAbsolute(base));assert.equal(fs.realpathSync(base),base);
  const ownerFile=path.join(base,'fixture-owner.json'),ownerStat=fs.lstatSync(ownerFile);
  assert.ok(ownerStat.isFile()&&!ownerStat.isSymbolicLink()&&ownerStat.size<=4096);
  const owner=JSON.parse(fs.readFileSync(ownerFile,'utf8'));
  assert.ok(closed(owner,['protocol','nonce','base','root']));
  assert.equal(owner.protocol,'fictional-runtime-source-process-fixture-v1');assert.equal(owner.base,base);
  const root=path.join(base,'company'),cli=path.join(base,'bin','codex');assert.equal(owner.root,root);
  const expectedEnv={PATH:path.join(base,'bin'),TMPDIR:path.join(base,'tmp'),TMP:path.join(base,'tmp'),TEMP:path.join(base,'tmp'),COMPANY_PLUGIN_DATA:path.join(base,'plugin-data'),LANG:'C',LC_ALL:'C',TZ:'UTC',OPENSSL_CONF:'/dev/null',NODE_DISABLE_COLORS:'1'};
  assert.deepEqual(Object.entries(process.env).sort(),Object.entries(expectedEnv).sort());
  assert.equal(process.cwd(),base);assert.equal(fs.realpathSync(cli),cli);
  assert.ok(['darwin','linux'].includes(process.platform),'POSIX process-group observation required');
  const originalSpawn=childProcess.spawn,originalSpawnSync=childProcess.spawnSync;
  let worker=null,observation=null,aborted=false,job=null,failure=null;
  const probes=[],start=performance.now();
  const abort=()=>{aborted=true;};process.once('SIGTERM',abort);process.once('SIGINT',abort);
  const deadline=setTimeout(abort,DRIVER_MS);
  const checkDeadline=()=>{if(aborted||performance.now()-start>=DRIVER_MS)throw Error('Fixed Source driver deadline or controller abort');};
  const observeSpawnSync=function(command,args,options){
    checkDeadline();
    assert.equal(command,cli,'host CLI fallback is outside this fixture');
    const expected=[['--version'],['exec','--help'],['login','status']][probes.length];
    assert.ok(expected,'only the three normal readiness probes are selected');assert.deepEqual(args,expected);
    const result=Reflect.apply(originalSpawnSync,this,arguments);
    checkDeadline();
    const stdout=Buffer.from(result.stdout??''),stderr=Buffer.from(result.stderr??'');
    assert.ok(stdout.length+stderr.length<=8192);assert.equal(result.status,0);assert.equal(result.signal,null);assert.equal(result.error,undefined);
    probes.push({argv:[...args],pid:result.pid,status:result.status,stdout_bytes:stdout.length,stderr_bytes:stderr.length,stdout_sha256:sha(stdout),stderr_sha256:sha(stderr)});
    return result;
  };
  const observeSpawn=function(command,args,options){
    checkDeadline();
    assert.equal(worker,null,'one actual default worker launch only');assert.equal(command,process.execPath);
    assert.equal(fs.realpathSync(command),fs.realpathSync(process.execPath));
    assert.ok(Array.isArray(args)&&args.length===4);assert.equal(args[0],'--no-warnings');assert.equal(args[1],workerFile);assert.equal(args[2],root);assert.ok(typeof args[3]==='string'&&args[3].length>0);
    assert.equal(options.cwd,base);assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');
    assert.deepEqual(options.env,{...expectedEnv,COMPANY_WORKER:'1'});assert.ok(options.shell===undefined||options.shell===false);
    checkDeadline();
    const actual=Reflect.apply(originalSpawn,this,arguments);assert.ok(actual instanceof ChildProcess);
    worker=actual;observation={pid:actual.pid??null,job_id:args[3],spawn:false,exit:false,close:false,exit_code:null,signal:null,error:null};
    actual.once('spawn',()=>{observation.spawn=true;emit({type:'worker_spawn',pid:actual.pid,driver_pid:process.pid});});
    actual.once('error',error=>{observation.error={code:error.code??null,message:String(error.message).slice(0,500)};});
    actual.once('exit',()=>{observation.exit=true;});
    actual.once('close',(code,signal)=>{observation.close=true;observation.exit_code=code??null;observation.signal=signal??null;});
    return actual;
  };
  let safeExecDenial=null;
  try{
    // A necessary actual-OS precondition, not a profile identity or network
    // attestation. A normal unconfined /usr/bin/true succeeds and MUST stop
    // here before readiness, dispatch, or any worker/model launch. Use only
    // the captured native function; no caller callback or environment flag
    // can report this denial. AF must also select the complete inherited
    // allow/deny policy, including host CLI and provider exclusions.
    const deniedProgram='/usr/bin/true',deniedFile=fs.lstatSync(deniedProgram);
    assert.ok(deniedFile.isFile()&&!deniedFile.isSymbolicLink()&&(deniedFile.mode&0o111)!==0);
    assert.equal(fs.realpathSync(deniedProgram),deniedProgram);
    // Exec denial can also deny X_OK. The captured native spawn result below,
    // rather than an access precheck, is the required denial observation.
    checkDeadline();
    const denied=Reflect.apply(originalSpawnSync,childProcess,[deniedProgram,[],{cwd:base,env:expectedEnv,stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:1000,maxBuffer:1024,killSignal:'SIGKILL',shell:false}]);
    checkDeadline();
    assert.ok(denied.error instanceof Error,'Fixed safe exec was not denied; stop before engine launch');
    assert.equal(denied.error.code,'EPERM');assert.equal(denied.error.path,deniedProgram);
    assert.equal(denied.error.syscall,'spawnSync /usr/bin/true');assert.deepEqual(denied.error.spawnargs,[]);
    assert.equal(denied.pid,0);assert.equal(denied.status,null);assert.equal(denied.signal,null);
    assert.equal(Buffer.byteLength(denied.stdout??''),0);assert.equal(Buffer.byteLength(denied.stderr??''),0);
    safeExecDenial={path:deniedProgram,code:denied.error.code,pid:denied.pid};
    childProcess.spawnSync=observeSpawnSync;childProcess.spawn=observeSpawn;syncBuiltinESMExports();
    const state=readState(root);checkDeadline();assert.equal(Object.hasOwn(state,'original_execution_origin'),false);assert.equal(Object.keys(state.jobs).length,0);
    job=dispatch({root,session_id:'fictional-runtime-source-owner',epoch:1,role:'engineer',task:TASK+': return only the predetermined fictional local preparation artifact.',input_ids:['fictional-input'],timeout_ms:10000,timeout_reason:'Fixed local Source lifecycle fixture; no provider calls.'},'codex');
    assert.equal(probes.length,3);assert.ok(worker);assert.equal(observation.job_id,job.id);
    for(;;){
      checkDeadline();
      const current=readState(root).jobs[job.id];
      checkDeadline();
      if(current&&['failed','cancelled','interrupted','quarantined'].includes(current.status))throw Error('Ordinary worker failed: '+String(current.error??current.status));
      if(current?.status==='completed'&&current.legacy_runtime?.worker?.closure&&observation.close)break;
      await delay(25);
    }
    assert.equal(observation.spawn,true);assert.equal(observation.exit_code,0);assert.equal(observation.signal,null);assert.equal(observation.error,null);
  }catch(error){failure=error;}
  finally{
    clearTimeout(deadline);
    // Signal only the retained actual child handle, never a PID from DATA.
    // Descendants are fixed bounded CLI programs in the worker's POSIX group.
    // After the leader closes we only observe group disappearance; an unknown
    // or reused group is never signaled and never counted as cleaned up.
    try{
      if(worker&&!observation.close){
        try{worker.kill('SIGTERM');}catch{}
        const termUntil=performance.now()+250;while(!observation.close&&performance.now()<termUntil)await delay(10);
        if(!observation.close)try{worker.kill('SIGKILL');}catch{}
      }
      const hasPid=Number.isInteger(worker?.pid)&&worker.pid>0;
      const gone=()=>!worker||(hasPid?groupGone(worker.pid):observation.close);
      const cleanupUntil=performance.now()+CLEANUP_MS;
      while(worker&&(!observation.close||!gone())&&performance.now()<cleanupUntil)await delay(25);
      if(worker&&(!observation.close||!gone()))failure??=Error('Actual worker close or detached group disappearance is UNKNOWN');
    }catch(error){failure??=error;}
    finally{
      childProcess.spawn=originalSpawn;childProcess.spawnSync=originalSpawnSync;syncBuiltinESMExports();
      process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort);
    }
  }
  if(failure){emit({type:'held',message:String(failure.message).slice(0,2000),job_id:job?.id??null,worker:observation,probes});throw failure;}
  const final=readState(root),current=final.jobs[job.id];
  assert.equal(current.coordination_release?.termination_confirmed,true);
  emit({type:'completed',job_id:job.id,driver_pid:process.pid,worker:observation,probes,worker_group_absent:true,safe_exec_denial:safeExecDenial});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3){process.stderr.write('One owned fictional fixture base is required.\n');process.exitCode=64;}
  else runRuntimeSourceDriver(process.argv[2]).catch(error=>{process.stderr.write(String(error.message).slice(0,2000)+'\n');process.exitCode=1;});
}
