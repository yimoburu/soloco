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
