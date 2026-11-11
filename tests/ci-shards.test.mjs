import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {check} from '../tools/ci/check.mjs';
import {inventory,qualificationTests,selectedTests} from '../tools/ci/evidence.mjs';
import {parseShard,partitionTests,regressionShardCount,selectShard,validatePartition} from '../tools/ci/shards.mjs';
import {partitionQualification,selectQualificationShard,qualificationPrelude,qualificationSummary,collectQualification} from '../tools/ci/qualification-shards.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=['tests/z.test.mjs','tests/a.test.mjs','tests/m.test.mjs','tests/b.test.mjs','tests/new.test.mjs'];
const fixtureBase=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-ci-shards-'));
test.after(()=>fs.rmSync(fixtureBase,{recursive:true,force:true}));
const fixture=()=>fs.mkdtempSync(path.join(fixtureBase,'case-'));

test('whole-file shards are deterministic, nonoverlapping and cover every current regression file',()=>{
  const selected=selectedTests('regression-22',inventory(root));
  const partition=partitionTests(selected);
  assert.equal(partition.length,regressionShardCount);
  assert.deepEqual(partition,partitionTests([...selected].reverse()));
  const flattened=partition.flatMap(shard=>shard.files);
  assert.equal(new Set(flattened).size,selected.length);
  assert.deepEqual(flattened.sort(),[...selected].sort());
  for(const file of qualificationTests)assert.equal(flattened.includes(file),false);
  assert.ok(flattened.includes('tests/ci-shards.test.mjs'),'new regression files enter automatically');
  const [first,second]=['1/2','2/2'].map(value=>selectShard(selected,value));
  assert.equal(first.inventory_sha256,second.inventory_sha256);
  assert.equal(first.selected_total,selected.length);
  assert.equal(first.files.length+second.files.length,selected.length);
});

test('missing, duplicate, empty and wrong-identity shards cannot certify coverage',()=>{
  const partition=partitionTests(files);
  const alter=fn=>{const value=structuredClone(partition);fn(value);return value;};
  for(const value of [
    partition.slice(0,1),[...partition,partition[0]],
    alter(p=>{p[1].index=1;}),alter(p=>{p[1].index=3;}),alter(p=>{p[1].total=3;}),
    alter(p=>{p[0].files=[];}),alter(p=>{p[0].files.pop();}),
    alter(p=>{p[1].files.push(p[0].files[0]);}),
    alter(p=>{p[0].files[0]='tests/unselected.test.mjs';}),
    alter(p=>{p[0].files[0]='../outside.test.mjs';}),
  ])assert.throws(()=>validatePartition(files,value));
  for(const count of [0,-1,1.5,33,files.length+1,NaN])assert.throws(()=>partitionTests(files,count));
  assert.throws(()=>partitionTests([...files,files[0]]),/duplicate/);
  assert.throws(()=>partitionTests([]),/no tests/);
});

test('shard arguments reject malformed or executable text without coercion',()=>{
  assert.deepEqual(parseShard('1/2'),{index:1,total:2});
  for(const value of [undefined,null,1,'0/2','3/2','1/0','01/2','1/02','1/33','1/2; touch /tmp/no','$(id)','1/2\n','1.0/2','1/-2','1/Infinity','9007199254740993/9007199254740994'])assert.throws(()=>parseShard(value));
  assert.throws(()=>check('build',root,()=>{throw Error('must not probe');},{shard:'1/2'}),/only for regression/);
});

test('two shard executions run each selected fixture exactly once and propagate failures',()=>{
  const repo=fixture();fs.mkdirSync(path.join(repo,'tests'));
  const marker=path.join(repo,'executed.txt');
  const fixtureFiles=['a','b','c'].map(name=>`tests/${name}.test.mjs`);
  for(const file of fixtureFiles)fs.writeFileSync(path.join(repo,file),`import fs from 'node:fs';import test from 'node:test';test(${JSON.stringify(file)},()=>fs.appendFileSync(${JSON.stringify(marker)},${JSON.stringify(file+'\n')}));\n`);
  let probes=0;
  const probe=()=>{probes++;return {supported:true,backend:'macos-seatbelt-node'};}; // Controlled tiny command fixture, not sandbox qualification.
  assert.equal(check('regression-22',repo,probe,{shard:'1/2'}),0);
  assert.deepEqual(fs.readFileSync(marker,'utf8').trim().split('\n').sort(),selectShard(fixtureFiles,'1/2').files);
  assert.equal(check('regression-22',repo,probe,{shard:'2/2'}),0);
  assert.deepEqual(fs.readFileSync(marker,'utf8').trim().split('\n').sort(),fixtureFiles);
  assert.equal(probes,2,'every shard probes the actual backend before executing tests');
  const failing=selectShard(fixtureFiles,'2/2').files[0];
  fs.writeFileSync(path.join(repo,failing),"import test from 'node:test';test('actual fixture failure',()=>{throw Error('retain failure');});\n");
  assert.equal(check('regression-22',repo,probe,{shard:'2/2'}),1);
});

test('unsupported Seatbelt holds both shards before any fixture executes',()=>{
  const repo=fixture();fs.mkdirSync(path.join(repo,'tests'));
  const marker=path.join(repo,'executed');
  for(const name of ['a','b'])fs.writeFileSync(path.join(repo,'tests',`${name}.test.mjs`),`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'ran');\n`);
  for(const shard of ['1/2','2/2'])assert.throws(()=>check('regression-22',repo,()=>({supported:false,blocker:'controlled denial'}),{shard}),/actual macOS Seatbelt required: controlled denial/);
  assert.equal(fs.existsSync(marker),false);
});

const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
function stepScript(workflow,name) {
  const step=workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(step,`missing ${name} step`);
  const match=/        run: \|\n((?:          .*\n)*)/.exec(step);
  assert.ok(match,`missing ${name} script`);
  return match[1].replace(/^          /gm,'');
}
function bash(script,env={}) {
  return spawnSync('bash',['-e','-o','pipefail','-c',script],{env:{PATH:process.env.PATH,...env},encoding:'utf8'});
}

test('both public CI gates fail closed for every non-success dependency result',()=>{
  assert.match(ci,/shard: \[1, 2\]/);
  assert.match(ci,/CI_SHARD: \$\{\{ matrix.shard \}\}\/2/);
  const aggregate=ci.split('\n  tests:\n')[1].split('\n  build:\n')[0];
  assert.match(aggregate,/name: Tests Node 22/);
  assert.match(aggregate,/if: always\(\)/);
  assert.match(aggregate,/needs: \[regression\]/);
  assert.doesNotMatch(aggregate,/uses:|checkout|setup-node/);
  const shards=stepScript(ci,'Require every regression shard');
  const gate=stepScript(ci,'Require regression and build success');
  assert.equal(bash(shards,{REGRESSION:'success'}).status,0);
  assert.equal(bash(gate,{TESTS:'success',BUILD:'success'}).status,0);
  for(const value of ['failure','cancelled','skipped','', 'success\n', 'success; exit 0']) {
    assert.notEqual(bash(shards,{REGRESSION:value}).status,0);
    for(const key of ['TESTS','BUILD'])assert.notEqual(bash(gate,{TESTS:'success',BUILD:'success',[key]:value}).status,0);
  }
  const final=ci.split('\n  gate:\n')[1];
  assert.match(final,/name: CI gate/);
  assert.match(final,/if: always\(\)/);
  assert.match(final,/needs: \[tests, build\]/);
  assert.doesNotMatch(final,/uses:|checkout|setup-node/);
});

test('qualification starts only on an explicit candidate label or manual exact commit',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/qualification.yml'),'utf8');
  assert.match(workflow,/types: \[labeled\]/);
  assert.match(workflow,/github\.event\.label\.name == 'qualification-ready'/);
  assert.doesNotMatch(workflow,/synchronize|ready_for_review/);
  assert.match(workflow,/ref: \$\{\{ env\.QUALIFICATION_COMMIT \}\}/);
  assert.match(workflow,/github\.event\.pull_request\.head\.sha \|\| inputs\.commit \|\| github\.sha/);
  const script=stepScript(workflow,'Require an exact candidate commit');
  assert.equal(bash(script,{QUALIFICATION_COMMIT:'a'.repeat(40)}).status,0);
  for(const value of ['', 'main','a'.repeat(39),'a'.repeat(41),'z'.repeat(40),'$(touch /tmp/not-run)','a'.repeat(40)+'\n'])assert.notEqual(bash(script,{QUALIFICATION_COMMIT:value}).status,0);
});

test('balanced full qualification preserves every file and separates measured long cases',()=>{
  const all=selectedTests('tests-22',inventory(root)),partition=partitionQualification(all);
  assert.deepEqual(partition,partitionQualification([...all].reverse()));
  assert.deepEqual(partition.flatMap(p=>p.files).sort(),all);
  assert.equal(new Set(partition.flatMap(p=>p.files)).size,all.length);
  assert.notEqual(partition.find(p=>p.files.includes('tests/bootstrap-home-repair.test.mjs')).index,
    partition.find(p=>p.files.includes('tests/complete-group-extraction.test.mjs')).index);
  const future='tests/future-unmeasured.test.mjs',added=partitionQualification([...all,future]);
  assert.equal(added.flatMap(p=>p.files).filter(f=>f===future).length,1);
  assert.equal(added.flatMap(p=>p.unknown_cost_files).filter(f=>f===future).length,1);
  const [a,b]=['1/2','2/2'].map(s=>selectQualificationShard(all,s));
  assert.equal(a.inventory_sha256,b.inventory_sha256);assert.equal(a.cost_hints_sha256,b.cost_hints_sha256);
  assert.equal(a.selected_total,all.length);assert.equal(a.files.length+b.files.length,all.length);
  for(const value of ['1/1','1/3','2/3','3/3','3/2','0/2','1/2\n'])assert.throws(()=>selectQualificationShard(all,value));
  assert.throws(()=>partitionQualification([]));assert.throws(()=>partitionQualification(['tests/a.test.mjs']));
  assert.throws(()=>partitionQualification([...all,all[0]]));
});

test('real tiny full-shard commands execute each fixture once and collect complete local TAP',()=>{
  const repo=fixture();fs.mkdirSync(path.join(repo,'tests'));
  const marker=path.join(repo,'executed.txt'),names=['a','b','c','d'].map(n=>`tests/${n}.test.mjs`);
  for(const file of names)fs.writeFileSync(path.join(repo,file),`import fs from 'node:fs';import test from 'node:test';test(${JSON.stringify(file)},()=>fs.appendFileSync(${JSON.stringify(marker)},${JSON.stringify(file+'\n')}));\n`);
  const runner=path.join(repo,'run.mjs');
  fs.writeFileSync(runner,`import {check} from ${JSON.stringify(new URL('../tools/ci/check.mjs',import.meta.url).href)};process.exitCode=check('tests-22',process.cwd(),()=>({supported:true,backend:'macos-seatbelt-node'}),{shard:process.argv[2]});\n`);
  // Injected probe belongs only to this tiny command fixture, never Seatbelt qualification.
  let total=0;
  for(const shard of ['1/2','2/2']) {
    const result=spawnSync(process.execPath,['--no-warnings',runner,shard],{cwd:repo,encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr);assert.equal(result.error,undefined);
    const selected=selectQualificationShard(names,shard),summary=qualificationSummary(result.stdout,selected);
    assert.equal(summary.counts.tests,selected.files.length);assert.deepEqual(summary.files,selected.files);
    assert.equal(summary.measured_speedup,null);total+=summary.counts.tests;
    const log=path.join(repo,shard[0]+'.tap');fs.writeFileSync(log,result.stdout);
    assert.deepEqual(collectQualification(log,selected),summary);
  }
  assert.equal(total,names.length);assert.deepEqual(fs.readFileSync(marker,'utf8').trim().split('\n').sort(),names);
  const failed=selectQualificationShard(names,'2/2').files[0];
  fs.writeFileSync(path.join(repo,failed),"import test from 'node:test';test('retained failure',()=>{throw Error('fixture failure');});\n");
  assert.equal(spawnSync(process.execPath,['--no-warnings',runner,'2/2'],{cwd:repo,encoding:'utf8',timeout:10000}).status,1);
});

const tinyTap='TAP version 13\nok 1 - fictional arithmetic\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';
test('full shard collector rejects mismatched, incomplete, skipped, failed and special-file evidence',()=>{
  const selected=selectQualificationShard(['tests/a.test.mjs','tests/b.test.mjs'],'1/2');
  const good=qualificationPrelude(selected)+'\n'+tinyTap;
  assert.equal(qualificationSummary(good,selected).counts.pass,1);
  for(const text of [tinyTap,good.slice(0,-1),good+'trailing junk\n',good.replace('inventory sha256=','changed sha256='),
    good.replace('# pass 1','# pass 0'),good.replace('# skipped 0','# skipped 1'),good.replace('# cancelled 0','# cancelled 1'),
    good.replace('# todo 0','# todo 1'),good.replace('ok 1 -','not ok 1 -'),good.replace('1..1','1..2'),
    good.replace('fictional arithmetic','fictional arithmetic # SKIP')])assert.throws(()=>qualificationSummary(text,selected));
  const dir=fixture(),log=path.join(dir,'log.tap');fs.writeFileSync(log,good);
  const link=path.join(dir,'link.tap');fs.symlinkSync(log,link);assert.throws(()=>collectQualification(link,selected));
  assert.throws(()=>collectQualification(dir,selected));
  fs.writeFileSync(log,Buffer.from([0xff]));assert.throws(()=>collectQualification(log,selected),/UTF-8/);
  fs.truncateSync(log,64*1024*1024+1);assert.throws(()=>collectQualification(log,selected),/64MiB/);
});

test('full qualification aggregate requires every macOS shard while compatibility and public gates stay separate',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/qualification.yml'),'utf8');
  const worker=workflow.split('\n  qualification22:\n')[1].split('\n  full22:\n')[0];
  assert.match(worker,/shard: \[1, 2\]/);assert.match(worker,/timeout-minutes: 40/);assert.match(worker,/runs-on: macos-15/);
  assert.match(worker,/check\.mjs tests-22 --shard "\$CI_SHARD"/);assert.match(worker,/qualification-shards\.mjs --collect/);
  assert.doesNotMatch(worker,/test-name-pattern|continue-on-error: true[\s\S]*Run complete/);
  const aggregate=workflow.split('\n  full22:\n')[1].split('\n  qualification:\n')[0];
  assert.match(aggregate,/name: Full qualification Node 22/);assert.match(aggregate,/if: always\(\)/);
  assert.match(aggregate,/needs: \[qualification22\]/);assert.doesNotMatch(aggregate,/uses:|checkout|setup-node/);
  const script=stepScript(workflow,'Require every full qualification shard');
  assert.equal(bash(script,{QUALIFICATION:'success'}).status,0);
  for(const value of ['failure','cancelled','skipped','','success\n'])assert.notEqual(bash(script,{QUALIFICATION:value}).status,0);
  const compatibility=workflow.split('\n  qualification:\n')[1];
  assert.match(compatibility,/node: '26'/);assert.doesNotMatch(compatibility,/node: '22'|--shard|--collect/);
  assert.match(compatibility,/lane: compatibility-26/);assert.match(compatibility,/timeout-minutes: 40/);
  assert.throws(()=>check('compatibility-26',root,()=>{throw Error('must not probe');},{shard:'1/2'}),/only for regression-22 or tests-22/);
});
