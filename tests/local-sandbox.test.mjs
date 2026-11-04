import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { sandboxCapability, sandboxProfile, runLocalTests } from '../plugins/soloco/runtime/local-sandbox.mjs';

const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-sandbox-tests-')));
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
function fixture(code) {
  const directory=fs.mkdtempSync(path.join(base,'candidate-'));
  fs.writeFileSync(path.join(directory,'sample.test.mjs'),code);
  return {directory,test_paths:['sample.test.mjs'],timeout_ms:5000,max_output_bytes:20000};
}
const capability=sandboxCapability();
const live={skip:!capability.supported && capability.blocker};

test('sandbox reports explicit unavailable capability and never runs outside it',async()=>{
  assert.equal(typeof capability.supported,'boolean');
  if(capability.supported)assert.equal(capability.backend,'macos-seatbelt-node');
  else {
    assert.ok(capability.blocker);
    const marker=path.join(base,'never-created');
    const result=await runLocalTests(fixture(`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'unsafe');`));
    assert.equal(result.status,'blocked');assert.equal(result.isolation,null);assert.equal(fs.existsSync(marker),false);
  }
});
test('test invocation rejects links, traversal, wildcard arguments and unbounded limits before execution',async()=>{
  const a=fixture('');
  for(const test_paths of [['../outside'],['--eval'],['*.mjs'],['sample.test.mjs','sample.test.mjs']])
    await assert.rejects(runLocalTests({...a,test_paths}));
  await assert.rejects(runLocalTests({...a,timeout_ms:300001}),/timeout/);
  await assert.rejects(runLocalTests({...a,max_output_bytes:1000001}),/output/);
  fs.symlinkSync('/etc/passwd',path.join(a.directory,'linked'));
  await assert.rejects(runLocalTests(a),/links/);
});
test('constrained Node tests return actual pass and failure evidence without modifying source',live,async()=>{
  const a=fixture("import test from 'node:test';import assert from 'node:assert/strict';test('addition',()=>assert.equal(2+2,4));");
  const before=fs.readFileSync(path.join(a.directory,a.test_paths[0]));
  const result=await runLocalTests(a);
  assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.exit_code,0);assert.equal(result.tests_executed,true);assert.match(result.stdout,/addition/);
  assert.deepEqual(fs.readFileSync(path.join(a.directory,a.test_paths[0])),before);
  assert.deepEqual(fs.readdirSync(a.directory),a.test_paths);
  const failed=await runLocalTests(fixture("import test from 'node:test';import assert from 'node:assert/strict';test('failure',()=>assert.equal(2+2,5));"));
  assert.equal(failed.status,'failed');assert.notEqual(failed.exit_code,0);assert.match(failed.stdout,/failure/);
});
test('OS policy independently blocks host files, source writes, links, networking and subprocesses',live,()=>{
  const outside=path.join(base,'outside-private');fs.writeFileSync(outside,'SECRET');
  const a=fixture('');const original=path.join(a.directory,'readonly.txt');fs.writeFileSync(original,'UNCHANGED');
  const scratch=path.join(a.directory,'scratch');fs.mkdirSync(scratch);
  // Deliberately no Node permission flags: prove the OS policy itself is effective.
  const code=`
import fs from 'node:fs';import net from 'node:net';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const outside=${JSON.stringify(outside)}, source=${JSON.stringify(original)}, scratch=${JSON.stringify(scratch)};
assert.throws(()=>fs.readdirSync(${JSON.stringify(base)}));assert.throws(()=>fs.readdirSync(${JSON.stringify(fs.realpathSync(os.homedir()))}));assert.throws(()=>fs.readFileSync(outside));assert.throws(()=>fs.writeFileSync(outside,'CHANGED'));
assert.throws(()=>fs.writeFileSync(source,'CHANGED'));
fs.writeFileSync(scratch+'/okay','temporary');
try {fs.linkSync(source,scratch+'/hardlink');fs.writeFileSync(scratch+'/hardlink','CHANGED');assert.fail('hardlink write escaped');}catch(e){assert.notEqual(e.code,'ERR_ASSERTION');}
try {fs.symlinkSync(outside,scratch+'/symlink');fs.writeFileSync(scratch+'/symlink','CHANGED');assert.fail('symlink write escaped');}catch(e){assert.notEqual(e.code,'ERR_ASSERTION');}
const child=spawnSync(process.execPath,['-e','process.stdout.write("ESCAPED")'],{detached:true,timeout:1000});assert.notEqual(child.status,0);assert.notEqual(child.stdout?.toString(),'ESCAPED');
await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:9});socket.on('connect',()=>reject(new Error('network escaped')));socket.on('error',error=>{try{assert.ok(['EPERM','EACCES'].includes(error.code),error.code);resolve();}catch(e){reject(e);}});});
console.log('BOUNDARIES_VERIFIED');`;
  const result=spawnSync('/usr/bin/sandbox-exec',['-p',sandboxProfile(a.directory,scratch),fs.realpathSync(process.execPath),'--input-type=module','-e',code],{cwd:a.directory,env:{PATH:'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,OPENSSL_CONF:'/dev/null'},encoding:'utf8',timeout:5000,maxBuffer:20000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/BOUNDARIES_VERIFIED/);
  assert.equal(fs.readFileSync(outside,'utf8'),'SECRET');assert.equal(fs.readFileSync(original,'utf8'),'UNCHANGED');
});
test('runner scrubs inherited host secrets and Node options; tests may only write scratch',live,async()=>{
  const key='SOLOCO_SANDBOX_PRIVATE_TEST_VALUE';process.env[key]='not-for-test-process';
  try {
    const result=await runLocalTests(fixture(`import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';test('environment',()=>{assert.equal(process.env.${key},undefined);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.DYLD_INSERT_LIBRARIES,undefined);fs.writeFileSync(process.env.TMPDIR+'/allowed','yes');assert.throws(()=>fs.writeFileSync(new URL('./sample.test.mjs',import.meta.url),'changed'));});`));
    assert.equal(result.status,'passed',JSON.stringify(result));
  } finally {delete process.env[key];}
});
test('timeouts, output limits and revocation stop the child without accepting success',live,async()=>{
  const timeout=await runLocalTests({...fixture('while(true){}'),timeout_ms:150});
  assert.equal(timeout.status,'timeout');assert.ok(timeout.duration_ms<5000);
  const output=await runLocalTests({...fixture("while(true)process.stdout.write('x'.repeat(10000));"),max_output_bytes:1024});
  assert.equal(output.status,'output_limit');assert.equal(output.output_truncated,true);
  assert.ok(Buffer.byteLength(output.stdout)+Buffer.byteLength(output.stderr)<=1024);
  const controller=new AbortController();const running=runLocalTests({...fixture('while(true){}'),signal:controller.signal});
  setTimeout(()=>controller.abort(),150);
  const aborted=await running;assert.equal(aborted.status,'aborted');
  const preaborted=new AbortController();preaborted.abort();
  assert.equal((await runLocalTests({...fixture(''),signal:preaborted.signal})).status,'aborted');
});

test('watchdog kills the sandbox and cleans scratch if its caller is abruptly terminated',live,async()=>{
  const a=fixture("import fs from 'node:fs';fs.writeFileSync(process.env.TMPDIR+'/test.pid',String(process.pid));while(true){}");
  const pidFile=path.join(a.directory,'.scratch/test.pid');
  const moduleURL=new URL('../plugins/soloco/runtime/local-sandbox.mjs',import.meta.url).href;
  const driver=spawn(process.execPath,['--input-type=module','-e',`import {runLocalTests} from ${JSON.stringify(moduleURL)};await runLocalTests(${JSON.stringify({...a,timeout_ms:30000})});`],{stdio:'ignore'});
  let childPid;
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  const until=async predicate=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Sandbox cleanup deadline exceeded');await new Promise(r=>setTimeout(r,20));}};
  try {
    await until(()=>fs.existsSync(pidFile));childPid=Number(fs.readFileSync(pidFile,'utf8'));
    assert.ok(alive(childPid));driver.kill('SIGKILL');
    await until(()=>!alive(childPid) && !fs.existsSync(path.join(a.directory,'.scratch')));
  } finally {
    driver.kill('SIGKILL');if(childPid && alive(childPid))try{process.kill(childPid,'SIGKILL');}catch{}
  }
});
