// Qualification-only controlled Source check; invoke this exact .check.mjs
// path explicitly. Routine .test.mjs discovery must not select real processes.
// AF must select the exact outer OS
// controller/profile before running: it must deny real host CLI/provider paths
// for this driver and every descendant. This file does not attest that profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {withRuntimeSourceProcessFixture} from './helpers/runtime-source-process-fixture.mjs';

const driver=fileURLToPath(new URL('./fixtures/runtime-source-driver.mjs',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MODEL_ARGS=['exec','--ignore-user-config','--skip-git-repo-check','--json','-c','sandbox_mode="read-only"','-c','approval_policy="never"','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','features.multi_agent=false','-c','web_search="disabled"','-'];
const CONTENT='FICTIONAL fixed local CLI artifact for Source process lifecycle testing. No model, provider, Native qualification, independent QA or execution authority is claimed.';

test('ordinary legacy dispatch retains actual OS worker/model birth and close through the frozen facade', {timeout:35000}, async()=>{
  await withRuntimeSourceProcessFixture(async fixture=>{
    fixture.verifyEnvironment(fixture.env);fixture.verifyPins();
    const child=spawn(process.execPath,['--no-warnings',driver,fixture.base],{cwd:fixture.base,env:fixture.env,stdio:['ignore','pipe','pipe']});
    fixture.trackChild(child,'actual fixed Source driver');
    const chunks={stdout:[],stderr:[]};let bytes=0,closed=false,code=null,signal=null,failure=null,stopSent=false;
    const stop=()=>{if(!stopSent&&!closed){stopSent=true;child.kill('SIGTERM');}};
    const capture=field=>chunk=>{bytes+=chunk.length;if(bytes>32768){failure??=Error('Fixed Source controller output budget exceeded');stop();return;}chunks[field].push(Buffer.from(chunk));};
    child.stdout.on('data',capture('stdout'));child.stderr.on('data',capture('stderr'));
    child.once('error',error=>{failure??=error;});child.once('close',(value,why)=>{closed=true;code=value;signal=why;});
    const deadline=performance.now()+29000;
    while(!closed&&!failure&&performance.now()<deadline)await delay(25);
    if(!closed){
      failure??=Error('Fixed Source driver close deadline exceeded');stop();
      const cleanup=performance.now()+3000;while(!closed&&performance.now()<cleanup)await delay(25);
      if(!closed){child.kill('SIGKILL');const killUntil=performance.now()+1000;while(!closed&&performance.now()<killUntil)await delay(25);}
    }
    if(failure)throw failure;
    const out=Buffer.concat(chunks.stdout),err=Buffer.concat(chunks.stderr),stdout=out.toString('utf8'),stderr=err.toString('utf8');
    assert.ok(Buffer.from(stdout,'utf8').equals(out)&&Buffer.from(stderr,'utf8').equals(err),'controller output must be complete UTF8');
    assert.equal(closed,true);assert.equal(code,0,stderr||stdout);assert.equal(signal,null);assert.equal(stderr,'');
    const reports=stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(reports.filter(item=>item.type==='worker_spawn').length,1);
    const results=reports.filter(item=>item.type==='completed');assert.equal(results.length,1);assert.equal(reports.length,2);
    const result=results[0];assert.equal(result.driver_pid,child.pid);assert.equal(result.worker_group_absent,true);
    assert.deepEqual(result.safe_exec_denial,{path:'/usr/bin/true',code:'EPERM',pid:0});
    const state=fixture.readState(),jobs=Object.values(state.jobs);assert.equal(jobs.length,1);
    const job=jobs[0],worker=job.legacy_runtime.worker;assert.equal(job.id,result.job_id);assert.equal(job.status,'completed');
    assert.equal(Object.hasOwn(state,'original_execution_origin'),false);assert.equal(Object.hasOwn(job,'original_execution_assignment'),false);
    assert.ok(Number.isInteger(worker.birth.pid)&&worker.birth.pid>0);assert.equal(worker.birth.pid,result.worker.pid);
    assert.notEqual(worker.birth.pid,process.pid);assert.notEqual(worker.birth.pid,child.pid);assert.equal(worker.controller_pid,child.pid);
    assert.throws(()=>process.kill(-worker.birth.pid,0),error=>error.code==='ESRCH','the actual detached worker group must be absent, independently of driver report DATA');
    assert.equal(worker.closure.pid,worker.birth.pid);assert.equal(worker.closure.never_started,false);assert.equal(worker.closure.exit_code,0);assert.equal(worker.closure.signal,null);
    assert.equal(job.worker_pid,worker.birth.pid);assert.equal(job.coordination_release.termination_confirmed,true);
    const invocations=job.model_process_tracking.invocations;assert.equal(invocations.length,1);
    const invocation=invocations[0],birth=invocation.birth,closure=invocation.closure;
    assert.equal(invocation.worker_pid,worker.birth.pid);assert.equal(birth.worker_pid,worker.birth.pid);assert.equal(birth.host,'codex');
    assert.ok(Number.isInteger(birth.pid)&&birth.pid>0);assert.notEqual(birth.pid,worker.birth.pid);assert.notEqual(birth.pid,child.pid);
    assert.equal(birth.command_sha256,sha(fixture.cli));assert.equal(birth.argv_sha256,sha(JSON.stringify(MODEL_ARGS)));
    assert.equal(closure.birth_sha256,sha(JSON.stringify(birth)));assert.equal(closure.exit_code,0);assert.equal(closure.signal,null);
    assert.equal(closure.observation,'original-child-close');assert.ok(Date.parse(closure.closed_at)>=Date.parse(birth.spawned_at));
    const artifact=state.records[job.artifact_id];assert.equal(artifact.job_id,job.id);assert.equal(artifact.content,CONTENT);assert.equal(artifact.status,'Submitted');
    assert.equal(result.probes.length,3);assert.ok(result.probes.every(item=>item.status===0&&item.pid>0));
    fixture.verifyPins();
  });
});
