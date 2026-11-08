import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runLocalTests,sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {testFixtureIdentity} from '../plugins/soloco/runtime/test-fixtures.mjs';

const selection={protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'};
const identity=testFixtureIdentity(selection);
const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-fixture-executor-')));
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const capability=sandboxCapability(),live={skip:!capability.supported&&capability.blocker};
function candidate(code){const directory=fs.mkdtempSync(path.join(base,'candidate-'));fs.writeFileSync(path.join(directory,'sample.test.mjs'),code);return {directory,test_paths:['sample.test.mjs'],timeout_ms:5000,max_output_bytes:30000};}
function cleaned(result,directory){
  assert.equal(result.test_fixture.identity.factory_source_sha256,identity.factory_source_sha256);
  assert.equal(result.test_fixture.setup.prepared_before_child,true);
  assert.equal(result.test_fixture.termination_confirmed,true);
  assert.equal(result.test_fixture.cleanup.status,'confirmed',JSON.stringify(result));
  assert.equal(result.test_fixture.cleanup.root_absent,true);
  assert.equal(fs.existsSync(path.join(directory,'.scratch')),false);
}

test('fixture identity and regular-candidate validation precede any setup or execution',async()=>{
  const a=candidate('');
  await assert.rejects(runLocalTests({...a,testFixture:null}),/identity/);
  await assert.rejects(runLocalTests({...a,testFixture:{...identity,factory_source_sha256:'0'.repeat(64)}}),/identity/);
  assert.equal(fs.existsSync(path.join(a.directory,'.scratch')),false);
  fs.symlinkSync('/etc/passwd',path.join(a.directory,'untrusted-source-link'));
  await assert.rejects(runLocalTests({...a,testFixture:identity}),/links/);
  assert.equal(fs.existsSync(path.join(a.directory,'.scratch')),false);
});

test('unavailable fixture execution records no invented setup and never falls back',async()=>{
  if(capability.supported)return;
  const a=candidate("throw Error('must not execute')");
  const result=await runLocalTests({...a,testFixture:identity});
  assert.equal(result.status,'blocked');assert.equal(result.tests_executed,false);
  assert.deepEqual(result.test_fixture.identity,identity);
  assert.equal(result.test_fixture.setup,null);
  assert.equal(result.test_fixture.cleanup.status,'not_needed');
  assert.equal(fs.existsSync(path.join(a.directory,'.scratch')),false);
});

test('selected fixture gives constrained child exactly two real pre-staged links and manifest binding',live,async()=>{
  const a=candidate(`
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
test('consume actual staged inodes',()=>{
 const raw=fs.readFileSync(process.env.SOLOCO_TEST_FIXTURE_MANIFEST);
 assert.equal(createHash('sha256').update(raw).digest('hex'),process.env.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256);
 const m=JSON.parse(raw),scratch=fs.realpathSync(process.env.TMPDIR);
 assert.equal(m.protocol,'scratch-fixture-contract-v1');assert.equal(m.factory,'p5-transfer-two-real-links-v1');assert.equal(m.scratch_root,scratch);
 assert.equal(m.company_root,'cases/transfer-faults/company');assert.equal(m.target_relative_path,'cases/transfer-faults/company/.company/evidence.txt');
 assert.equal(m.target_absent_at_setup,true);assert.equal(m.links.length,2);
 assert.deepEqual(fs.readdirSync(path.join(scratch,m.company_root)),[]);
 const target=path.join(scratch,m.target_relative_path);assert.equal(fs.existsSync(target),false);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'real evidence');
 for(const link of m.links){
  assert.equal(link.symbolic_link,true);assert.equal(link.target_absent_at_setup,true);
  assert.equal(link.target_relative_path,m.target_relative_path);
  const staged=path.join(scratch,link.staged_relative_path),s=fs.lstatSync(staged,{bigint:true});
  assert.equal(s.isSymbolicLink(),true);assert.equal(String(s.dev),link.dev);assert.equal(String(s.ino),link.ino);
  assert.equal(fs.readlinkSync(staged),target);assert.equal(link.readlink_target,target);
  const consumed=path.join(scratch,'consumed-'+link.id);fs.renameSync(staged,consumed);
  const after=fs.lstatSync(consumed,{bigint:true});assert.equal(String(after.dev),link.dev);assert.equal(String(after.ino),link.ino);
  assert.equal(fs.readFileSync(consumed,'utf8'),'real evidence');
 }
 assert.ok(process.execArgv.includes('--permission'));
 assert.ok(process.execArgv.includes('--allow-fs-read='+path.dirname(scratch)));
 assert.ok(process.execArgv.includes('--allow-fs-write='+scratch));
 assert.equal(process.execArgv.some(x=>x==='--allow-child-process'||x==='--allow-worker'||x==='--allow-addons'),false);
});`);
  const source=fs.readFileSync(path.join(a.directory,'sample.test.mjs'));
  const result=await runLocalTests({...a,testFixture:identity});
  assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.tests_executed,true);
  cleaned(result,a.directory);
  const setup=result.test_fixture.setup;
  assert.equal(setup.links.length,2);assert.equal(setup.manifest_bytes<=4096,true);
  assert.match(setup.manifest_sha256,/^[a-f0-9]{64}$/);assert.match(setup.child_environment_sha256,/^[a-f0-9]{64}$/);
  // These are retained PRE-child observations, not claims that consumed paths
  // remained unchanged after the child renamed their actual inodes.
  assert.equal(setup.links.every(x=>typeof x.dev==='string'&&typeof x.ino==='string'),true);
  assert.deepEqual(fs.readFileSync(path.join(a.directory,'sample.test.mjs')),source);
});

test('fixture does not permit host reads, source mutation, new link escapes or child/worker execution',live,async()=>{
  const secret=path.join(base,'outside');fs.writeFileSync(secret,'PRIVATE');
  const a=candidate(`
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import net from 'node:net';import {spawnSync} from 'node:child_process';import {Worker} from 'node:worker_threads';
test('same child boundaries',async()=>{
 assert.throws(()=>fs.readFileSync(${JSON.stringify(secret)}));
 assert.throws(()=>fs.writeFileSync(new URL('./sample.test.mjs',import.meta.url),'changed'));
 assert.throws(()=>fs.symlinkSync(${JSON.stringify(secret)},process.env.TMPDIR+'/escape'));
 assert.throws(()=>fs.linkSync(${JSON.stringify(secret)},process.env.TMPDIR+'/hard-escape'));
 assert.throws(()=>spawnSync(process.execPath,['-e','console.log("escaped")']));
 assert.throws(()=>new Worker('console.log("escaped")',{eval:true}));
 assert.throws(()=>process.dlopen({exports:{}},new URL('./fixture-addon.node',import.meta.url).pathname),error=>['ERR_DLOPEN_DISABLED','ERR_ACCESS_DENIED'].includes(error.code));
 await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:9});socket.on('connect',()=>{socket.destroy();reject(Error('network escaped'));});socket.on('error',error=>{try{assert.ok(['EPERM','EACCES'].includes(error.code),error.code);resolve();}catch(e){reject(e);}});});
});`);
  fs.writeFileSync(path.join(a.directory,'fixture-addon.node'),'not a native addon; the permission check must run before loading');
  const result=await runLocalTests({...a,testFixture:identity});
  assert.equal(result.status,'passed',JSON.stringify(result));cleaned(result,a.directory);
  assert.equal(fs.readFileSync(secret,'utf8'),'PRIVATE');
});

test('fixture variables are scrubbed when no fixture was selected',live,async()=>{
  const names=['SOLOCO_TEST_FIXTURE_MANIFEST','SOLOCO_TEST_FIXTURE_MANIFEST_SHA256'];
  const saved=names.map(name=>process.env[name]);
  try{
    for(const name of names)process.env[name]='inherited-value-must-not-leak';
    const result=await runLocalTests(candidate("import test from 'node:test';import assert from 'node:assert/strict';test('no fixture env',()=>{assert.equal(process.env.SOLOCO_TEST_FIXTURE_MANIFEST,undefined);assert.equal(process.env.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256,undefined);});"));
    assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(Object.hasOwn(result,'test_fixture'),false);
  }finally{names.forEach((name,i)=>{if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i];});}
});

test('fixture timeout, output limit and abort retain actual setup and confirmed cleanup',live,async()=>{
  for(const [code,options,status] of [
    ['while(true){}',{timeout_ms:150},'timeout'],
    ["while(true)process.stdout.write('x'.repeat(10000));",{max_output_bytes:1024},'output_limit']
  ]){
    const a=candidate(code),result=await runLocalTests({...a,...options,testFixture:identity});
    assert.equal(result.status,status,JSON.stringify(result));cleaned(result,a.directory);
    assert.ok(Buffer.byteLength(result.stdout)+Buffer.byteLength(result.stderr)<=({...a,...options}).max_output_bytes);
  }
  const a=candidate('while(true){}'),controller=new AbortController();
  const pending=runLocalTests({...a,testFixture:identity,signal:controller.signal});
  setTimeout(()=>controller.abort(),250);
  const result=await pending;assert.equal(result.status,'aborted',JSON.stringify(result));cleaned(result,a.directory);
  const b=candidate(''),before=new AbortController();before.abort();
  const stopped=await runLocalTests({...b,testFixture:identity,signal:before.signal});
  assert.equal(stopped.status,'aborted');assert.equal(stopped.test_fixture.setup,null);assert.equal(stopped.test_fixture.cleanup.status,'not_needed');
  assert.equal(fs.existsSync(path.join(b.directory,'.scratch')),false);
});

test('a real cleanup failure cannot turn a passing fixture child into successful validation',
  {...live,skip:live.skip||(process.getuid?.()===0&&'POSIX permission denial requires a non-root test user')},async()=>{
    const a=candidate("import test from 'node:test';import fs from 'node:fs';test('child passes but seals scratch',()=>fs.chmodSync(process.env.TMPDIR,0));");
    const scratch=path.join(a.directory,'.scratch');
    try{
      const result=await runLocalTests({...a,testFixture:identity});
      assert.equal(result.tests_executed,true);assert.match(result.stdout,/child passes but seals scratch/);
      assert.equal(result.original_status,'passed',JSON.stringify(result));assert.equal(result.status,'error');
      assert.equal(result.test_fixture.termination_confirmed,true);
      assert.equal(result.test_fixture.cleanup.status,'failed');
      assert.equal(result.test_fixture.cleanup.root_absent,false);
      assert.equal(fs.existsSync(scratch),true);
    }finally{if(fs.existsSync(scratch))fs.chmodSync(scratch,0o700);}
  });

test('fixture watchdog cleans the owned staged scratch after actual caller death',live,async()=>{
  const a=candidate("import fs from 'node:fs';fs.writeFileSync(process.env.TMPDIR+'/test.pid',String(process.pid));while(true){}");
  const moduleURL=new URL('../plugins/soloco/runtime/local-sandbox.mjs',import.meta.url).href;
  const driver=spawn(process.execPath,['--input-type=module','-e',`import {runLocalTests} from ${JSON.stringify(moduleURL)};await runLocalTests(${JSON.stringify({...a,testFixture:identity,timeout_ms:30000})});`],{stdio:'ignore'});
  const pidFile=path.join(a.directory,'.scratch/test.pid');let pid;
  const alive=id=>{try{process.kill(id,0);return true;}catch{return false;}};
  const until=async fn=>{const end=Date.now()+7000;while(!fn()){if(Date.now()>end)throw Error('Fixture watchdog did not settle');await new Promise(r=>setTimeout(r,20));}};
  try{
    await until(()=>fs.existsSync(pidFile));pid=Number(fs.readFileSync(pidFile,'utf8'));
    assert.ok(alive(pid));assert.ok(fs.existsSync(path.join(a.directory,'.scratch/fixtures/manifest.json')));
    driver.kill('SIGKILL');
    await until(()=>!alive(pid)&&!fs.existsSync(path.join(a.directory,'.scratch')));
  }finally{driver.kill('SIGKILL');if(pid&&alive(pid))try{process.kill(pid,'SIGKILL');}catch{}}
});
