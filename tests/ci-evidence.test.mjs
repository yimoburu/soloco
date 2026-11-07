import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash,source,tapCounts,validateReceipt,compatibilityTests,qualificationTests,laneCoverage,selectedTests} from '../tools/ci/evidence.mjs';
import {execute,run} from '../tools/ci/run.mjs';
import {verify,unzip} from '../tools/ci/verify.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-ci-'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
let serial=0;
const directory=()=>fs.mkdtempSync(path.join(temp,`case-${serial++}-`));
const sha='a'.repeat(40),tree='b'.repeat(40),manifest='c'.repeat(64);
const trustedBodies={'tools/ci/evidence.mjs':'approved evidence validator','tools/ci/gate.mjs':'approved gate','tools/ci/run.mjs':'approved runner','tools/ci/verify.mjs':'approved transitive gate helper'};
const expected={repository:'fictional/repository',run:123,attempt:2,commit:sha,tree,workflow:'.github/workflows/ci.yml',workflowSha:sha,workflowSha256:hash('approved workflow'),trustedFiles:Object.fromEntries(Object.entries(trustedBodies).map(([p,b])=>[p,hash(b)])),gate:'CI gate',lanes:[{lane:'build',job:'Build and drift',labels:['ubuntu-24.04']},{lane:'regression-22',job:'Tests Node 22',labels:['macos-15']},{lane:'compatibility-26',job:'Compatibility Node 26',labels:['macos-15']}]};
const fixture=directory();fs.mkdirSync(path.join(fixture,'tests'));fs.writeFileSync(path.join(fixture,'tests/ci-evidence.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('fictional arithmetic',()=>assert.equal(2+2,4));\n");
const actual=await execute(fixture,fixture,'tests',process.execPath,['--no-warnings','--test','--test-concurrency=4','--test-reporter=tap','tests/ci-evidence.test.mjs']);
function receipt(lane='compatibility-26',configuration=expected) {
  const out=directory();for(const stream of ['stdout','stderr'])fs.copyFileSync(path.join(fixture,actual[stream].file),path.join(out,actual[stream].file));
  const selected=selectedTests(lane,compatibilityTests);
  const r={schema:3,lane,coverage:laneCoverage(lane),test_inventory:selected,omitted_test_inventory:compatibilityTests.filter(file=>!selected.includes(file)),mode:'github',before:{commit:sha,tree,manifest,dirty:false},after:{commit:sha,tree,manifest,dirty:false},inventory:[...compatibilityTests],node:lane==='compatibility-26'?'v26.0.0':'v22.0.0',platform:lane==='build'?'linux':'darwin',arch:'arm64',os_release:'fictional-kernel',runner_image:{os:'fictional-image',version:'fixture'},sandbox:{supported:true,backend:'macos-seatbelt-node'},github:{...configuration},checks:[structuredClone(actual)]};
  if(lane!=='build')r.checks[0].argv=[process.execPath,'--no-warnings','--test','--test-concurrency=4','--test-reporter=tap',...r.test_inventory];
  if(lane==='build')r.checks=['build','diff'].map(name=>{const c=structuredClone(actual);c.name=name;c.argv=name==='build'?[process.execPath,'tools/build-plugin.mjs','--check']:['git','diff','--check'];c.timeout_ms=120000;delete c.tap;for(const stream of ['stdout','stderr']){c[stream]={file:`${name}.${stream}.log`,sha256:hash('')};fs.writeFileSync(path.join(out,c[stream].file),'');}return c;});
  return {r,out};
}
function valid(r,out){return validateReceipt(r,out,{...expected,lane:r.lane,inventory:[...compatibilityTests]});}
test('real tiny Node process produces exact retained TAP accounting through production validator',()=>{
  assert.equal(actual.exit,0);assert.equal(actual.tap.executed,1);assert.equal(actual.tap.pass,1);
  const {r,out}=receipt();assert.equal(valid(r,out).counts.pass,1);
});
test('production validator rejects deliberately invalid receipts and retained logs',()=>{
  const changes=[r=>r.before.commit='d'.repeat(40),r=>r.after.manifest='d'.repeat(64),r=>r.github.workflow='other.yml',r=>r.github.workflowSha='d'.repeat(40),r=>r.github.repository='other/repo',r=>r.github.run=124,r=>r.github.attempt=1,r=>r.before.dirty=true,r=>r.mode='unverified-local',r=>r.checks=[],r=>r.checks.push(r.checks[0]),r=>r.checks[0].exit=1,r=>r.checks[0].signal='SIGTERM',r=>r.checks[0].truncated=true,r=>r.checks[0].tap.pass=0,r=>r.checks[0].stdout.file='../escape',r=>r.checks[0].stdout.file='/tmp/log',r=>r.sandbox.supported=false,r=>r.inventory=[],r=>r.node='v24.0.0'];
  for(const change of changes){const {r,out}=receipt();change(r);assert.throws(()=>valid(r,out));}
  for(const action of ['changed','missing','symlink']){const {r,out}=receipt(),file=path.join(out,r.checks[0].stdout.file);if(action==='changed')fs.appendFileSync(file,'tamper');else {fs.unlinkSync(file);if(action==='symlink')fs.symlinkSync(path.join(fixture,'tests.stdout.log'),file);}assert.throws(()=>valid(r,out));}
});
test('TAP rejects truncation, conflicting summaries, zero execution, skip, cancel, todo and exit disagreement',async()=>{
  const original=fs.readFileSync(path.join(fixture,'tests.stdout.log'),'utf8');
  for(const text of [original.slice(0,-1),original+'# tests 1\n',original.replace('# tests 1','# tests 0'),original.replace('# pass 1','# pass 0'),original.replace('# skipped 0','# skipped 1'),original.replace('# cancelled 0','# cancelled 1'),original.replace('# todo 0','# todo 1'),original.replace('1..1','1..2'),original.replace('ok 1','not ok 1'),original.replace('ok 1 - fictional arithmetic','ok 1 - fictional arithmetic # SKIP'),original+'trailing junk\n'])assert.throws(()=>tapCounts(text));
  const bad=directory();fs.writeFileSync(path.join(bad,'bad.test.mjs'),"import test from 'node:test';test('bad',()=>{throw Error('fictional failure')});");const c=await execute(bad,bad,'tests',process.execPath,['--test','--test-reporter=tap','bad.test.mjs']);assert.notEqual(c.exit,0);assert.ok(c.tapError);assert.ok(fs.statSync(path.join(bad,'tests.stdout.log')).size>0);
});
test('source identities catch dirty and changed fictional source; artifacts cannot enter source',async()=>{
  const repo=directory();fs.mkdirSync(path.join(repo,'tests'));fs.writeFileSync(path.join(repo,'tests/a.test.mjs'),'one');
  for(const args of [['init'],['add','.'],['-c','user.name=Fiction','-c','user.email=fiction@example.invalid','commit','-m','fixture']])assert.equal(spawnSync('git',args,{cwd:repo}).status,0);
  const a=source(repo);assert.equal(a.dirty,false);fs.writeFileSync(path.join(repo,'tests/a.test.mjs'),'two');const b=source(repo);assert.equal(b.dirty,true);assert.notEqual(a.manifest,b.manifest);
  await assert.rejects(run('build',path.join(repo,'artifacts'),repo),/outside source/);
});
// A tiny stored ZIP producer for deterministic API doubles, never a provenance source.
function zip(files){let offset=0;const locals=[],central=[];for(const [name,data] of files){const n=Buffer.from(name),b=Buffer.from(data),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(b.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,6);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);locals.push(l,n,b);central.push(c,n);offset+=l.length+n.length+b.length;}const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,end]);}
function remote(modify=()=>{},configuration=expected){
  const state={run:{id:123,run_attempt:2,repository:{full_name:configuration.repository},head_sha:sha,path:configuration.workflow,status:'completed',conclusion:'success',event:'push'},files:{...trustedBodies},jobs:[],artifacts:[],archives:new Map(),logs:Buffer.from('fictional GitHub job log')};
  for(const [i,lane] of configuration.lanes.entries()){
    state.jobs.push({id:i+1,name:lane.job,run_id:123,run_attempt:2,status:'completed',conclusion:'success',runner_name:'fictional-host',labels:lane.labels,html_url:`https://github.com/fictional/repository/actions/runs/123/job/${i+1}`});
    const {r,out}=receipt(lane.lane,configuration);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(r));const archive=zip(fs.readdirSync(out).map(n=>[n,fs.readFileSync(path.join(out,n))]));state.archives.set(i+1,archive);state.artifacts.push({id:i+1,name:`source-ci-123-2-${lane.lane}`,expired:false,digest:`sha256:${hash(archive)}`,workflow_run:{id:123,head_sha:sha}});
  }
  if(configuration.gate)state.jobs.push({id:4,name:configuration.gate,run_id:123,run_attempt:2,status:'completed',conclusion:'success'});modify(state);
  const seen=[];
  const request=async(endpoint)=>{seen.push(endpoint);if(endpoint.endsWith('/attempts/2'))return state.run;if(endpoint.includes('/git/commits/'))return {tree:{sha:tree}};if(endpoint.includes('/git/trees/'))return {truncated:false,tree:compatibilityTests.map(path=>({path}))};if(endpoint.includes('/contents/')){const file=endpoint.split('/contents/')[1].split('?')[0];return {encoding:'base64',content:Buffer.from(file===configuration.workflow?'approved workflow':state.files[file]).toString('base64')};}if(endpoint.includes('/jobs?'))return {jobs:state.jobs,total_count:state.jobs.length};if(endpoint.includes('/artifacts?'))return {artifacts:state.artifacts,total_count:state.artifacts.length};if(endpoint.endsWith('/zip'))return state.archives.get(Number(endpoint.split('/').at(-2)));if(endpoint.endsWith('/logs'))return state.logs;throw Error(`unexpected endpoint ${endpoint}`);};
  return {request,seen};
}
test('remote verifier owns attempt-specific retrieval and binds artifacts, exact logs and counts',async()=>{
  const {request,seen}=remote();const out=directory();const result=await verify(expected,out,request);assert.match(result.claims.join(' '),/Node 22 regression selection and targeted Node 26 compatibility/);assert.equal(result.coverage.find(x=>x.lane==='compatibility-26').coverage,'compatibility');assert.equal(result.coverage.find(x=>x.lane==='regression-22').coverage,'regression');assert.equal(result.provenance,'github-api-run-attempt');assert.equal(result.coverage.length,3);assert.ok(seen.some(s=>s.includes('/attempts/2/jobs?')));assert.ok(fs.existsSync(path.join(out,'verified.json')));assert.ok(result.retained.every(r=>r.sha256.length===64));
});
test('remote verifier rejects wrong run/source/workflow/attempt and unavailable or failed required lanes',async()=>{
  const modifications=[s=>s.run.id++,s=>s.run.run_attempt--,s=>s.run.head_sha='d'.repeat(40),s=>s.run.path='other.yml',s=>s.run.event='pull_request',s=>s.jobs.pop(),s=>s.jobs.push(s.jobs[0]),s=>s.jobs[0].run_attempt--,...['skipped','failure','cancelled'].map(value=>s=>s.jobs[0].conclusion=value),s=>s.jobs[0].labels=['wrong-host'],s=>s.artifacts.pop(),s=>s.artifacts.push(s.artifacts[0]),s=>s.artifacts[0].expired=true,s=>s.artifacts[0].name='source-ci-123-1-build',s=>s.artifacts[0].digest=`sha256:${'0'.repeat(64)}`,s=>s.logs=Buffer.alloc(0)];
  for(const modify of modifications){const {request}=remote(modify);await assert.rejects(verify(expected,directory(),request));}
  for(const patch of [{tree:'d'.repeat(40)},{workflowSha256:'d'.repeat(64)},{lanes:[]},{workflowSha:'d'.repeat(40)}]){const {request}=remote();await assert.rejects(verify({...expected,...patch},directory(),request));}
  const {request}=remote();await assert.rejects(verify(expected,directory(),async(e,b)=>{if(e.endsWith('/logs'))throw Error('unavailable log');return request(e,b);}));
});
test('forged trusted local JSON cannot gain provenance from production CLI',()=>{
  const out=directory(),file=path.join(out,'forged.json');fs.writeFileSync(file,JSON.stringify({trusted:true,conclusion:'success',scope:'source_ci_evidence'}));
  const result=spawnSync(process.execPath,['tools/ci/verify.mjs',file,path.join(out,'retained')],{cwd:root,encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.match(result.stderr,/HOLD/);assert.equal(fs.existsSync(path.join(out,'retained','verified.json')),false);
});
test('approved workflow alone cannot authorize changed CI helper code or an unexpected command',async()=>{
  for(const file of Object.keys(trustedBodies)){
    const {request}=remote(s=>{s.files[file]='changed executable code';});
    await assert.rejects(verify(expected,directory(),request),/approved CI helper/);
  }
  const {request}=remote();await assert.rejects(verify({...expected,trustedFiles:{}},directory(),request),/helper identities/);
  const {r,out}=receipt();r.checks[0].argv=[process.execPath,'--eval','process.exit(0)'];assert.throws(()=>valid(r,out),/command/);
  const other=receipt();other.r.execution_authorized=true;assert.throws(()=>valid(other.r,other.out),/unrecognized/);
});
test('ZIP parsing rejects traversal and truncated evidence',()=>{assert.throws(()=>unzip(zip([['../escape','x']])));assert.throws(()=>unzip(Buffer.from('truncated')));});
test('final gate independently rejects a cancelled matrix member even if aggregate says success',async()=>{
  const {gate}=await import('../tools/ci/gate.mjs');
  const env={TESTS:'success',BUILD:'success',GITHUB_REPOSITORY:'fictional/repository',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2'};
  const jobs=expected.lanes.map(l=>({name:l.job,run_id:123,run_attempt:2,status:'completed',conclusion:'success'}));
  await gate(env,async()=>({jobs,total_count:3}));
  jobs[1].conclusion='cancelled';await assert.rejects(gate(env,async()=>({jobs,total_count:3})),/cancelled/);
  await assert.rejects(gate({...env,TESTS:'skipped'},async()=>{throw Error('must not fetch');}),/aggregate/);
});
test('remote artifacts cannot hide changed or missing command logs behind a fresh archive digest',async()=>{
  for(const mutation of ['changed','missing']){
    const {request}=remote(s=>{const files=unzip(s.archives.get(2));if(mutation==='changed')files.set('tests.stdout.log',Buffer.from('changed'));else files.delete('tests.stderr.log');const archive=zip([...files]);s.archives.set(2,archive);s.artifacts[1].digest=`sha256:${hash(archive)}`;});
    await assert.rejects(verify(expected,directory(),request));
  }
});
test('dirty candidate runner writes explicit unverified-local receipts and retains command failures',async()=>{
  const repo=directory();fs.mkdirSync(path.join(repo,'tests'));fs.mkdirSync(path.join(repo,'tools'));fs.writeFileSync(path.join(repo,'tests/a.test.mjs'),'');fs.writeFileSync(path.join(repo,'tools/build-plugin.mjs'),"console.error('fictional build failure');process.exitCode=7;");
  for(const args of [['init'],['add','.'],['-c','user.name=Fiction','-c','user.email=fiction@example.invalid','commit','-m','fixture']])assert.equal(spawnSync('git',args,{cwd:repo}).status,0);
  fs.writeFileSync(path.join(repo,'candidate.txt'),'fiction');const out=directory();assert.equal(await run('build',out,repo),1);const r=JSON.parse(fs.readFileSync(path.join(out,'receipt.json')));assert.equal(r.mode,'unverified-local');assert.equal(r.before.dirty,true);assert.equal(r.checks[0].exit,7);assert.match(fs.readFileSync(path.join(out,'build.stderr.log'),'utf8'),/fictional build failure/);
});
test('runner detects source changed by a real fixed build command',async()=>{
  const repo=directory();fs.mkdirSync(path.join(repo,'tests'));fs.mkdirSync(path.join(repo,'tools'));fs.writeFileSync(path.join(repo,'tests/a.test.mjs'),'');fs.writeFileSync(path.join(repo,'tools/build-plugin.mjs'),"import fs from 'node:fs';fs.writeFileSync('changed-source.txt','fictional change');");
  for(const args of [['init'],['add','.'],['-c','user.name=Fiction','-c','user.email=fiction@example.invalid','commit','-m','fixture']])assert.equal(spawnSync('git',args,{cwd:repo}).status,0);
  const out=directory();assert.equal(await run('build',out,repo),1);const r=JSON.parse(fs.readFileSync(path.join(out,'receipt.json')));assert.equal(r.before.dirty,false);assert.equal(r.after.dirty,true);assert.notEqual(r.before.manifest,r.after.manifest);assert.equal(r.checks[0].exit,0);assert.match(fs.readFileSync(path.join(out,'validation-error.log'),'utf8'),/changed/);
});

test('fixed compatibility policy retains full inventory and cannot claim full or accept arbitrary partial coverage',()=>{
  const full=[...compatibilityTests,'tests/zz-future.test.mjs'];
  assert.deepEqual(selectedTests('tests-22',full),full);
  assert.deepEqual(selectedTests('compatibility-26',full),compatibilityTests);
  assert.throws(()=>selectedTests('compatibility-26',full.slice(1)),/missing compatibility/);
  assert.throws(()=>selectedTests('tests-25',full),/unknown fixed lane/);
  for(const lane of ['regression-22','compatibility-26']) {
    const {r,out}=receipt(lane);assert.equal(valid(r,out).coverage,laneCoverage(lane));
    r.test_inventory=r.test_inventory.slice(1);assert.throws(()=>valid(r,out),/selected test inventory/);
  }
  const {r,out}=receipt();r.coverage='full';assert.throws(()=>valid(r,out),/coverage/);
  const newer=receipt();newer.r.node='v25.2.1';assert.throws(()=>valid(newer.r,newer.out),/Node/);
  const legacy=receipt();legacy.r.schema=1;assert.throws(()=>valid(legacy.r,legacy.out),/schema/);
});
test('runner streams exact retained bytes before child completion',async()=>{
  const out=directory(),observed=[];let settled=false;
  const pending=execute(out,out,'stream',process.execPath,['-e',"const fs=require('node:fs');process.stdout.write('first');const t=setInterval(()=>{if(fs.existsSync('release')){clearInterval(t);process.stdout.write('last')}},5);"],{timeout_ms:2000,onOutput:(stream,bytes)=>{
    observed.push([stream,bytes.toString()]);assert.equal(settled,false);
    if(observed.length===1){assert.equal(fs.readFileSync(path.join(out,'stream.stdout.log'),'utf8'),'first');fs.writeFileSync(path.join(out,'release'),'ready');}
  }}).then(result=>{settled=true;return result;});
  const result=await pending;assert.equal(result.exit,0);assert.equal(result.error,null);
  assert.deepEqual(observed,[['stdout','first'],['stdout','last']]);
  assert.equal(fs.readFileSync(path.join(out,result.stdout.file),'utf8'),'firstlast');
});
test('streaming runner bounds retained output and closes timed-out process groups',async()=>{
  const out=directory(),quiet=()=>{};
  const overflow=await execute(out,out,'overflow',process.execPath,['-e',"process.stdout.write('x'.repeat(200));setInterval(()=>{},1000);"],{maxOutputBytes:64,onOutput:quiet});
  assert.equal(overflow.truncated,true);assert.match(overflow.error,/byte limit/);assert.equal(fs.statSync(path.join(out,overflow.stdout.file)).size,64);assert.notEqual(overflow.signal,null);
  const timeout=await execute(out,out,'timeout',process.execPath,['-e',"const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)']);process.stdout.write(String(c.pid));setInterval(()=>{},1000);"],{timeout_ms:2000,onOutput:quiet});
  assert.match(timeout.error,/deadline/);assert.notEqual(timeout.signal,null);
  const pid=Number(fs.readFileSync(path.join(out,timeout.stdout.file),'utf8'));assert.ok(pid>0);
  if(process.platform!=='win32') {
    const deadline=Date.now()+2000;let closed=false;
    while(Date.now()<deadline){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH'){closed=true;break;}throw error;}await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(closed,true,'timed-out descendant was reaped within the closure bound');
  }
});

test('stream forwarding failures retain the error and close the child',async()=>{
  const out=directory();
  const result=await execute(out,out,'forwarding',process.execPath,['-e',"process.stdout.write('retained');setInterval(()=>{},1000);"],{timeout_ms:2000,onOutput:()=>{throw Error('fixture forwarding failure');}});
  assert.match(result.error,/could not retain\/stream stdout: fixture forwarding failure/);assert.notEqual(result.signal,null);
  assert.equal(fs.readFileSync(path.join(out,result.stdout.file),'utf8'),'retained');
});


test('regression selects every new fast file and explicitly inventories every excluded qualification file',()=>{
  const all=[...new Set([...compatibilityTests,...qualificationTests,'tests/new-regression.test.mjs'])].sort();
  const selected=selectedTests('regression-22',all),omitted=all.filter(file=>!selected.includes(file));
  assert.deepEqual(omitted,qualificationTests);
  assert(selected.includes('tests/new-regression.test.mjs'));
  for(const core of ['tests/task-runtime.test.mjs','tests/storage-intake.test.mjs','tests/storage-transfer-integrity.test.mjs','tests/local-sandbox.test.mjs'])assert(selected.includes(core));
  assert.deepEqual(selectedTests('tests-22',all),all);
  const {r,out}=receipt('regression-22');r.inventory=all;r.test_inventory=selected;r.omitted_test_inventory=omitted;r.checks[0].argv=[process.execPath,'--no-warnings','--test','--test-concurrency=4','--test-reporter=tap',...selected];
  const check=()=>validateReceipt(r,out,{...expected,lane:r.lane,inventory:all});
  assert.equal(check().coverage,'regression');
  r.omitted_test_inventory=[];assert.throws(check,/omitted/);r.omitted_test_inventory=omitted;
  r.coverage='full';assert.throws(check,/coverage/);r.coverage='regression';
  r.schema=2;assert.throws(check,/schema/);
});

test('full qualification verifies its own workflow and all tests without pretending to satisfy the PR regression gate',async()=>{
  const configuration={...expected,workflow:'.github/workflows/qualification.yml',gate:null,lanes:[{lane:'tests-22',job:'Full qualification Node 22',labels:['macos-15']}]};
  const {request}=remote(()=>{},configuration),result=await verify(configuration,directory(),request);
  assert.equal(result.coverage.length,1);assert.equal(result.coverage[0].coverage,'full');assert.deepEqual(result.coverage[0].omitted_test_inventory,[]);
  assert.match(result.claims.join(' '),/full Node 22 qualification/);assert(!result.claims.includes('build/generated drift'),'tests-only qualification cannot claim build validation');
  const wrong=remote(()=>{},configuration);await assert.rejects(verify({...configuration,workflow:expected.workflow},directory(),wrong.request),/required lanes/);
  const {r,out}=receipt('tests-22',configuration);r.test_inventory=r.test_inventory.slice(1);
  assert.throws(()=>validateReceipt(r,out,{...configuration,lane:'tests-22',inventory:r.inventory}),/selected test inventory/);
});


test('runner surfaces sandbox preflight failure before any test command starts',async()=>{
  const repo=directory();fs.mkdirSync(path.join(repo,'tests'));fs.mkdirSync(path.join(repo,'plugins/soloco/runtime'),{recursive:true});
  fs.writeFileSync(path.join(repo,'tests/a.test.mjs'),'');
  fs.writeFileSync(path.join(repo,'plugins/soloco/runtime/local-sandbox.mjs'),"export const sandboxCapability=()=>({supported:false,backend:null,blocker:'Fictional otool ETIMEDOUT preflight'});\n");
  for(const args of [['init'],['add','.'],['-c','user.name=Fiction','-c','user.email=fiction@example.invalid','commit','-m','fixture']])assert.equal(spawnSync('git',args,{cwd:repo}).status,0);
  const out=directory(),error=console.error,observed=[];console.error=message=>observed.push(message);
  try{assert.equal(await run('regression-22',out,repo),1);}finally{console.error=error;}
  const r=JSON.parse(fs.readFileSync(path.join(out,'receipt.json')));
  assert.equal(r.checks.length,0);assert.match(r.error,/actual macOS Seatbelt/);
  assert.match(r.sandbox.blocker,/Fictional otool ETIMEDOUT/);
  assert(observed.some(message=>message.includes('Fictional otool ETIMEDOUT')),'preflight cause was hidden from the workflow console');
});
