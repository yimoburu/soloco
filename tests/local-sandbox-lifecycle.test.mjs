// SOURCE PROPOSAL: every case is authored UNRUN. Pure receipt predicates below
// test supplied-data consistency only; they do not simulate actual IPC/OS faults.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {channel} from 'node:diagnostics_channel';
import {fileURLToPath} from 'node:url';
import {ordinaryExecutionLifecycleProtocol,ordinaryExecutionReceiptMatches,runLocalTests,sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {testFixtureIdentity} from '../plugins/soloco/runtime/test-fixtures.mjs';

function supplied() {
  const binding={protocol:'owned-scratch-close-v1',request_id:'1'.repeat(64),runner_sha256:'2'.repeat(64),request_sha256:'3'.repeat(64),controller_pid:101,watchdog_pid:102};
  const scratch={path:'/supplied/candidate/.scratch',dev:'7',ino:'8'};
  const expected={binding,scratch,child_pid:103,timeout_ms:5000,max_output_bytes:20000};
  const result={status:'passed',exit_code:0,signal:null,stdout:'TAP version 13\n',stderr:'',duration_ms:10,isolation:'macos-seatbelt-node',tests_executed:true,test_execution_attempted:true,output_truncated:false,output_bytes:{captured:15,observed:15},limits:{timeout_ms:5000,max_output_bytes:20000},
    local_execution:{protocol:'owned-scratch-close-v1',scratch:{...scratch},watchdog:{...binding},child:{launch_attempted:true,spawn_observed:true,close_observed:true,pid:103},termination_confirmed:true,closure_basis:'child_close',cleanup:{status:'confirmed',root_absent:true}}};
  return {message:{type:'result',binding:{...binding},result},expected};
}
const clone=value=>JSON.parse(JSON.stringify(value));

test('ordinary lifecycle capability is explicitly versioned',()=>{
  assert.equal(ordinaryExecutionLifecycleProtocol,'owned-scratch-close-v1');
});
test('PURE supplied-evidence: exact pass and known-failure receipts are consistent',()=>{
  const {message,expected}=supplied();assert.equal(ordinaryExecutionReceiptMatches(message,expected),true);
  message.result.status='failed';message.result.exit_code=1;
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),true);
});
test('PURE supplied-evidence: missing or mismatched request/watchdog/source/payload bindings cannot validate',()=>{
  const {message,expected}=supplied();
  for(const key of ['request_id','runner_sha256','request_sha256','controller_pid','watchdog_pid']){
    for(const where of ['envelope','receipt']){
      const bad=clone(message),target=where==='envelope'?bad.binding:bad.result.local_execution.watchdog;
      target[key]=typeof target[key]==='number'?target[key]+1:'f'.repeat(64);
      assert.equal(ordinaryExecutionReceiptMatches(bad,expected),false,where+':'+key);
      delete target[key];assert.equal(ordinaryExecutionReceiptMatches(bad,expected),false);
    }
  }
  assert.equal(ordinaryExecutionReceiptMatches(null,expected),false);
  assert.equal(ordinaryExecutionReceiptMatches({type:'result',result:message.result},expected),false);
});
test('PURE supplied-evidence: an error/kill/terminal label after spawn is not close',()=>{
  const {message,expected}=supplied();message.result.status='error';message.result.error='supplied post-spawn error';
  message.result.exit_code=null;message.result.signal=null;message.result.tests_executed=false;
  message.result.local_execution.child.close_observed=false;
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),false);
  message.result.local_execution.termination_confirmed=false;
  message.result.local_execution.closure_basis='unconfirmed';
  message.result.local_execution.cleanup={status:'not_attempted',root_absent:null,reason:'supplied unknown closure'};
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),true);
  message.result.status='passed';assert.equal(ordinaryExecutionReceiptMatches(message,expected),false);
});
test('PURE supplied-evidence: prelaunch never-start is distinct from a completed test',()=>{
  const {message,expected}=supplied();expected.child_pid=null;
  Object.assign(message.result,{status:'error',exit_code:null,stdout:'',output_bytes:{captured:0,observed:0},tests_executed:false,test_execution_attempted:false,error:'supplied prelaunch failure'});
  Object.assign(message.result.local_execution,{child:{launch_attempted:false,spawn_observed:false,close_observed:false,pid:null},closure_basis:'never_started'});
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),true);
  const impossiblePass=clone(message);Object.assign(impossiblePass.result,{status:'passed',exit_code:0,tests_executed:true});
  assert.equal(ordinaryExecutionReceiptMatches(impossiblePass,expected),false);
  message.result.local_execution.child.launch_attempted=true;
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),false);
});
test('PURE supplied-evidence: response loss/watchdog loss provide no trustworthy closure receipt',()=>{
  const {message,expected}=supplied();
  assert.equal(ordinaryExecutionReceiptMatches(undefined,expected),false);
  for(const replacement of [{type:'exit',pid:102},{type:'timeout',killed:true},{type:'result',binding:message.binding,result:{status:'passed'}}])
    assert.equal(ordinaryExecutionReceiptMatches(replacement,expected),false);
  // This checks absent/inadequate evidence only. No actual watchdog is killed,
  // no response is dropped, and scratch permanence is not asserted by this test.
});
test('PURE supplied-evidence: cleanup failure or ownership uncertainty cannot retain Pass',()=>{
  const {message,expected}=supplied();
  message.result.local_execution.cleanup={status:'failed',root_absent:false,error:'supplied denial'};
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),false);
  message.result.status='error';message.result.error='cleanup failed';
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),true);
  Object.assign(message.result.local_execution,{termination_confirmed:true,closure_basis:'child_close',cleanup:{status:'not_attempted',root_absent:null,reason:'supplied ownership refusal'}});
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),true);
  message.result.local_execution.cleanup.root_absent=true;
  assert.equal(ordinaryExecutionReceiptMatches(message,expected),false);
});
test('PURE supplied-evidence: different scratch inode, different child, and malformed fields fail closed',()=>{
  const {message,expected}=supplied();
  for(const mutate of [m=>m.result.local_execution.scratch.ino='9',m=>m.result.local_execution.child.pid=104,
    m=>m.result.local_execution.child.close_observed='true',m=>m.result.local_execution.termination_confirmed=1,
    m=>m.result.local_execution.child.spawn_observed=false,m=>m.result.limits.timeout_ms=1,
    m=>m.result.stdout='x'.repeat(20001),m=>m.result.output_bytes.captured=20001,m=>m.result.output_truncated=true]){
    const bad=clone(message);mutate(bad);assert.equal(ordinaryExecutionReceiptMatches(bad,expected),false);
  }
});

// Existing supported runner API only. No injected spawn function, arbitrary
// executable selector, altered runtime, extra factory or fault controller.
const cases=[];
function live(t) {
  const available=sandboxCapability();
  if(!available.supported){t.skip(available.blocker);return false;}
  return true;
}
function candidate(code) {
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-lifecycle-case-')));
  const st=fs.lstatSync(directory,{bigint:true});
  const value={directory,dev:String(st.dev),ino:String(st.ino),retained:true};cases.push(value);
  fs.writeFileSync(path.join(directory,'sample.test.mjs'),code);
  return value;
}
const options=value=>({directory:value.directory,test_paths:['sample.test.mjs'],timeout_ms:5000,max_output_bytes:20000});
async function runCase(value,extra={}) {
  let result;
  try{result=await runLocalTests({...options(value),...extra});}
  catch(error){
    const failure={result_received:false,error_name:String(error?.name??''),error_message:String(error?.message??error)};
    try{fs.writeFileSync(path.join(value.directory,'ACTUAL-call-failure.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx',mode:0o600});}
    catch(retentionError){console.error('Call-failure record could not be retained:',value.directory,String(retentionError.message));}
    throw error;
  }
  try{fs.writeFileSync(path.join(value.directory,'ACTUAL-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
  catch(retentionError){
    console.error('Runner result was received but could not be persisted:',value.directory,JSON.stringify(result));
    throw retentionError;
  }
  return result;
}

function closed(result,value) {
  const e=result.local_execution;
  assert.equal(e.protocol,'owned-scratch-close-v1');assert.equal(e.termination_confirmed,true);
  assert.equal(e.closure_basis,'child_close');assert.equal(e.child.close_observed,true);
  assert.equal(e.cleanup.status,'confirmed',JSON.stringify(result));assert.equal(e.cleanup.root_absent,true);
  assert.equal(e.scratch.path,path.join(value.directory,'.scratch'));
  assert.match(e.scratch.dev,/^\d+$/);assert.match(e.scratch.ino,/^\d+$/);
  assert.equal(fs.existsSync(e.scratch.path),false);
}
test.after(()=>{
  // Retain every authored qualification case, including passed/closed cases.
  // A later owner-selected cleanup must inspect the exact retained roots.
  for(const value of cases)console.error('Lifecycle case retained for inspection:',value.directory);
});
test('LIVE planned: actual pass returns child/scratch observations and cleanup only after close',async t=>{
  if(!live(t))return;
  const value=candidate("import test from 'node:test';import fs from 'node:fs';test('observe scratch before close',()=>{const s=fs.lstatSync(process.env.TMPDIR,{bigint:true});console.log('SOLOCO_CHILD_OBS '+JSON.stringify({pid:process.pid,path:fs.realpathSync(process.env.TMPDIR),dev:String(s.dev),ino:String(s.ino)}));});");
  const result=await runCase(value);assert.equal(result.status,'passed',JSON.stringify(result));closed(result,value);
  const match=result.stdout.match(/SOLOCO_CHILD_OBS (\{[^\n]+\})/);assert.ok(match,result.stdout);
  const observed=JSON.parse(match[1]);assert.equal(result.local_execution.child.pid,observed.pid);
  assert.deepEqual(result.local_execution.scratch,{path:observed.path,dev:observed.dev,ino:observed.ino});
  assert.throws(()=>process.kill(observed.pid,0),error=>error.code==='ESRCH');
});
test('LIVE planned: known failed tests keep failure and still attest close/cleanup',async t=>{
  if(!live(t))return;
  const value=candidate("import test from 'node:test';import assert from 'node:assert/strict';test('known failure',()=>assert.fail('expected'));");
  const result=await runCase(value);assert.equal(result.status,'failed');assert.notEqual(result.exit_code,0);closed(result,value);
});
test('LIVE planned: a failed test settles only after its real watchdog close',async t=>{
  if(!live(t))return;
  const value=candidate("import test from 'node:test';import assert from 'node:assert/strict';test('known IPC closure failure',()=>assert.fail('expected'));"),watchdogs=[],errors=[],pending=new Map(),listeners=[];
  const runner=fileURLToPath(new URL('../plugins/soloco/runtime/local-sandbox.mjs',import.meta.url)),publication=channel('child_process');
  const once=(emitter,event,fn)=>{listeners.push([emitter,event,fn]);emitter.once(event,fn);};
  // Node publishes the original ChildProcess before filling spawnargs. Filter
  // at its real spawn event; this observer never wraps spawn or emits events.
  const observe=({process:child})=>{try{
    const onSpawn=()=>{pending.delete(child);try{
      const args=child.spawnargs;
      if(!Array.isArray(args)||args[1]!==runner||args[2]!=='--watch-tests')return;
      if(JSON.parse(args[3]).payload?.root!==value.directory)return;
      const row={child,exit:false,close:false,disconnect:false,stderrEnd:false,stderrClose:false};watchdogs.push(row);
      once(child,'exit',()=>{row.exit=true;});once(child,'close',()=>{row.close=true;});once(child,'disconnect',()=>{row.disconnect=true;});
      once(child.stderr,'end',()=>{row.stderrEnd=true;});once(child.stderr,'close',()=>{row.stderrClose=true;});
    }catch(error){errors.push(error);}};
    pending.set(child,onSpawn);child.once('spawn',onSpawn);
  }catch(error){errors.push(error);}};
  publication.subscribe(observe);
  try{
    const result=await runCase(value);
    assert.deepEqual(errors,[]);assert.equal(watchdogs.length,1,'One actual watchdog for this fixture must be observed');
    const observed=watchdogs[0];
    assert.equal(observed.exit,true,'Watchdog exit must precede runner settlement');
    assert.equal(observed.close,true,'Original watchdog close must precede runner settlement');
    assert.equal(observed.stderrEnd,true);assert.equal(observed.stderrClose,true);assert.equal(observed.child.connected,false);
    // The disconnect notification can be queued by Node after EOF accounting.
    // Check close above before yielding; never wait for a missing close here.
    await new Promise(resolve=>setImmediate(resolve));assert.equal(observed.disconnect,true);
    assert.equal(result.status,'failed',JSON.stringify(result));assert.notEqual(result.exit_code,0);closed(result,value);
  }finally{
    publication.unsubscribe(observe);
    for(const [child,fn]of pending)child.removeListener('spawn',fn);
    for(const [emitter,event,fn]of listeners)emitter.removeListener(event,fn);
  }
});
test('LIVE planned: timeout and output stops await close and preserve bounded output',async t=>{
  if(!live(t))return;
  for(const [code,limits,status] of [['while(true){}',{timeout_ms:150},'timeout'],["while(true)process.stdout.write('x'.repeat(10000));",{max_output_bytes:1024},'output_limit']]){
    const value=candidate(code),result=await runCase(value,limits);
    assert.equal(result.status,status,JSON.stringify(result));closed(result,value);
    assert.ok(Buffer.byteLength(result.stdout)+Buffer.byteLength(result.stderr)<=({...options(value),...limits}).max_output_bytes);
  }
});
test('LIVE planned: abort after launch awaits close; preaborted invocation creates no scratch',async t=>{
  if(!live(t))return;
  const value=candidate("import fs from 'node:fs';fs.writeFileSync(process.env.TMPDIR+'/ready','ready');while(true){}"),controller=new AbortController();
  const pending=runCase(value,{signal:controller.signal});let result;
  try{
    const deadline=Date.now()+4000;
    while(!fs.existsSync(path.join(value.directory,'.scratch/ready'))){if(Date.now()>deadline)throw Error('Abort launch readiness was not observed');await new Promise(r=>setTimeout(r,20));}
    controller.abort();result=await pending;
  }finally{controller.abort();if(!result)await pending;}
  assert.equal(result.status,'aborted',JSON.stringify(result));closed(result,value);
  const before=candidate(''),pre=new AbortController();pre.abort();
  const stopped=await runCase(before,{signal:pre.signal});
  assert.equal(stopped.status,'aborted');assert.equal(stopped.local_execution.closure_basis,'never_started');
  assert.equal(stopped.local_execution.cleanup.status,'not_needed');assert.equal(stopped.local_execution.scratch,null);
  assert.equal(fs.existsSync(path.join(before.directory,'.scratch')),false);
});
test('LIVE planned: a replaced scratch inode is retained and cannot be accepted',async t=>{
  if(!live(t))return;
  const value=candidate("import test from 'node:test';import fs from 'node:fs';test('replacement window',async()=>{fs.writeFileSync(process.env.TMPDIR+'/ready','ready');await new Promise(r=>setTimeout(r,2000));});");
  const scratch=path.join(value.directory,'.scratch'),saved=path.join(value.directory,'saved-owned-scratch');
  const controller=new AbortController(),pending=runCase(value,{signal:controller.signal});let result;
  try{
    const deadline=Date.now()+4000;
    while(!fs.existsSync(path.join(scratch,'ready'))){if(Date.now()>deadline)throw Error('Replacement readiness was not observed');await new Promise(r=>setTimeout(r,20));}
    fs.renameSync(scratch,saved);fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'foreign'),'preserve');
    result=await pending;
    assert.equal(result.status,'error',JSON.stringify(result));assert.equal(result.local_execution.child.close_observed,true);
    assert.equal(result.local_execution.termination_confirmed,true);assert.equal(result.local_execution.closure_basis,'child_close');assert.equal(result.local_execution.cleanup.status,'not_attempted');
    assert.equal(result.local_execution.cleanup.root_absent,null);
    assert.equal(fs.readFileSync(path.join(scratch,'foreign'),'utf8'),'preserve');assert.equal(fs.existsSync(saved),true);
  }finally{controller.abort();if(!result)await pending;}
  // Both remaining roots intentionally retained for inspection, even on success.
});
test('LIVE planned: a cleanup permission failure cannot preserve successful validation',async t=>{
  if(!live(t))return;
  if(process.getuid?.()===0){t.skip('Permission denial needs a non-root test user');return;}
  const value=candidate("import test from 'node:test';import fs from 'node:fs';test('seal scratch',()=>{fs.writeFileSync(process.env.TMPDIR+'/evidence','preserve');fs.chmodSync(process.env.TMPDIR,0);});");
  const scratch=path.join(value.directory,'.scratch');
  try{
    const result=await runCase(value);
    assert.equal(result.status,'error',JSON.stringify(result));assert.equal(result.original_status,'passed');
    assert.equal(result.local_execution.child.close_observed,true);assert.equal(result.local_execution.termination_confirmed,true);
    assert.equal(result.local_execution.cleanup.status,'failed');assert.equal(result.local_execution.cleanup.root_absent,false);
    assert.equal(fs.existsSync(scratch),true);
  }finally{if(fs.existsSync(scratch))fs.chmodSync(scratch,0o700);}
});
test('LIVE planned: P5 still uses its closed real-link fixture, with no ordinary retention toggle',async t=>{
  if(!live(t))return;
  const identity=testFixtureIdentity({protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'});
  const value=candidate("import test from 'node:test';import fs from 'node:fs';import assert from 'node:assert/strict';test('P5 links',()=>{const m=JSON.parse(fs.readFileSync(process.env.SOLOCO_TEST_FIXTURE_MANIFEST));assert.equal(m.links.length,2);assert.equal(m.factory,'p5-transfer-two-real-links-v1');for(const link of m.links)assert.equal(fs.lstatSync(process.env.TMPDIR+'/'+link.staged_relative_path).isSymbolicLink(),true);});");
  const result=await runCase(value,{testFixture:identity});
  assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(Object.hasOwn(result,'local_execution'),false);
  assert.deepEqual(result.test_fixture.identity,identity);assert.equal(result.test_fixture.setup.prepared_before_child,true);
  assert.equal(result.test_fixture.setup.links.length,2);assert.equal(result.test_fixture.termination_confirmed,true);
  assert.equal(result.test_fixture.cleanup.status,'confirmed');assert.equal(result.test_fixture.cleanup.root_absent,true);
  assert.equal(fs.existsSync(path.join(value.directory,'.scratch')),false);
});
