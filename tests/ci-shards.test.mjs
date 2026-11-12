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
import qualificationReporter from '../tools/ci/qualification-reporter.mjs';

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

test('routine selection separates long pipelines without dropping current or future files',()=>{
  const selected=selectedTests('regression-22',inventory(root));
  const values=['1/2','2/2'],partition=values.map(value=>selectShard(selected,value));
  assert.deepEqual(partition,values.map(value=>selectShard([...selected].reverse(),value)));
  const flattened=partition.flatMap(shard=>shard.files);
  assert.equal(new Set(flattened).size,selected.length);
  assert.deepEqual([...flattened].sort(),[...selected].sort());
  assert.deepEqual(partition.map(shard=>shard.files[0]),[
    'tests/peer-input-frontier.test.mjs','tests/peer-origin-frontier-seal.test.mjs',
  ],'the two advisory pipelines are first in separate selected argument lists');
  assert.equal(partition[0].inventory_sha256,partition[1].inventory_sha256);
  assert.equal(partition[0].selected_total,selected.length);
  const future='tests/future-unmeasured-pipeline.test.mjs';
  const expanded=values.map(value=>selectShard([...selected,future],value));
  assert.deepEqual(expanded.flatMap(shard=>shard.files).sort(),[...selected,future].sort());
  assert.equal(expanded.flatMap(shard=>shard.files).filter(file=>file===future).length,1);
  for(const total of [1,2,3])validatePartition(selected,Array.from({length:total},(_,i)=>selectShard(selected,`${i+1}/${total}`)),total);
  // Generic lexical partitions remain the input to full qualification. With no
  // advisory pipelines present, routine fixture selection keeps that behavior.
  for(const [i,value]of values.entries())assert.deepEqual(selectShard(files,value).files,partitionTests(files)[i].files);
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

const localSummary=stdout=>{
  const rows=stdout.split('\n').filter(line=>line.startsWith('{"schema":"ci-qualification-shard-summary-v2",'));
  assert.equal(rows.length,1,'exactly one outer local summary printed by the check wrapper');
  return JSON.parse(rows[0]);
};

test('real tiny full-shard commands execute each fixture once and collect complete outer events',()=>{
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
    const selected=selectQualificationShard(names,shard),summary=localSummary(result.stdout);
    assert.ok(result.stdout.startsWith(qualificationPrelude(selected)+'\nTAP version 13\n'));
    assert.equal(summary.counts.tests,selected.files.length);assert.deepEqual(summary.files,selected.files);
    assert.equal(summary.measured_speedup,null);total+=summary.counts.tests;
  }
  assert.equal(total,names.length);assert.deepEqual(fs.readFileSync(marker,'utf8').trim().split('\n').sort(),names);
  const failed=selectQualificationShard(names,'2/2').files[0];
  fs.writeFileSync(path.join(repo,failed),"import test from 'node:test';test('retained failure',()=>{throw Error('fixture failure');});\n");
  assert.equal(spawnSync(process.execPath,['--no-warnings',runner,'2/2'],{cwd:repo,encoding:'utf8',timeout:10000}).status,1);
});

const tinyOuter=()=>({schema:'ci-qualification-outer-events-v1',node_version:'22.23.2',completed:true,
  root:path.resolve(process.cwd()),files:['tests/a.test.mjs'],
  summary:{counts:{tests:1,suites:0,passed:1,failed:0,cancelled:0,skipped:0,todo:0,topLevel:1},duration_ms:1,success:true}});
const encode=value=>JSON.stringify(value)+'\n';
test('full shard collector rejects mismatched, incomplete, skipped, failed and special-file evidence',()=>{
  const selected=selectQualificationShard(['tests/a.test.mjs','tests/b.test.mjs'],'1/2');
  const good=encode(tinyOuter());
  assert.equal(qualificationSummary(good,selected).counts.pass,1);
  const alter=fn=>{const value=tinyOuter();fn(value);return encode(value);};
  for(const text of ['',good.slice(0,-1),good+'trailing junk\n',good+good,good.replace('outer-events-v1','wrong-schema'),
    alter(v=>v.completed=false),alter(v=>v.node_version='26.0.0'),alter(v=>v.summary.success=false),
    alter(v=>v.root='/fictional/wrong-root'),alter(v=>v.files=[]),alter(v=>v.files=['tests/b.test.mjs']),
    alter(v=>v.files=['tests/a.test.mjs','tests/a.test.mjs']),alter(v=>v.files=['../tests/a.test.mjs']),
    alter(v=>v.summary.counts.passed=0),alter(v=>v.summary.counts.tests=2),alter(v=>v.summary.counts.topLevel=0),
    alter(v=>v.summary.counts.tests=0),alter(v=>v.summary.counts.suites=-1),alter(v=>v.summary.duration_ms=-1),
    alter(v=>v.summary.file='not-the-cumulative-summary'),alter(v=>delete v.summary.counts.cancelled),
    ...['failed','cancelled','skipped','todo'].map(key=>alter(v=>{v.summary.counts[key]=1;}))])assert.throws(()=>qualificationSummary(text,selected));
  const dir=fixture(),log=path.join(dir,'outer.json');fs.writeFileSync(log,good);
  assert.deepEqual(collectQualification(log,selected),qualificationSummary(good,selected));
  const link=path.join(dir,'link.json');fs.symlinkSync(log,link);assert.throws(()=>collectQualification(link,selected));
  assert.throws(()=>collectQualification(dir,selected));
  fs.writeFileSync(log,Buffer.from([0xff]));assert.throws(()=>collectQualification(log,selected),/UTF-8/);
  fs.truncateSync(log,65537);assert.throws(()=>collectQualification(log,selected),/64KiB/);
});

test('reporter requires one cumulative summary and event-stream EOF rather than fixture stdout',async()=>{
  async function* events(values){yield*values;}
  const read=async values=>{let text='';for await(const chunk of qualificationReporter(events(values)))text+=chunk;return text;};
  const actual={type:'test:summary',data:tinyOuter().summary};
  const raw=await read([{type:'test:stdout',data:{message:'not ok 1 - expected inner failure\n# fail 1\n'}},
    {type:'test:summary',data:{...actual.data,file:path.resolve('tests/a.test.mjs')}},actual]);
  assert.equal(JSON.parse(raw).summary.counts.failed,0);
  assert.deepEqual(JSON.parse(raw).files,['tests/a.test.mjs']);
  await assert.rejects(read([]),/missing cumulative/);
  await assert.rejects(read([{...actual,data:{...actual.data,file:path.resolve('tests/a.test.mjs')}}]),/missing cumulative/);
  await assert.rejects(read([actual,actual]),/duplicate cumulative/);
  const fileEvent={type:'test:summary',data:{...actual.data,file:path.resolve('tests/a.test.mjs')}};
  await assert.rejects(read([fileEvent,fileEvent,actual]),/duplicate qualification file/);
  async function* truncated(){yield actual;throw Error('retained stream failure');}
  await assert.rejects(async()=>{for await(const chunk of qualificationReporter(truncated()))assert.fail('must not emit before EOF');},/retained stream failure/);
});

test('real expected inner TAP failures pass while genuine outer failures, skips and todos hold',()=>{
  const repo=fixture();fs.mkdirSync(path.join(repo,'tests'));
  const names=['tests/a.test.mjs','tests/b.test.mjs'],selected=selectQualificationShard(names,'1/2');
  const inner=path.join(repo,'inner.mjs');
  fs.writeFileSync(inner,"import test from 'node:test';test('expected inner failure',()=>{throw Error('intentional inner fixture');});\n");
  const positive=`import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';test('outer asserts inner failure',()=>{const {NODE_TEST_CONTEXT,...env}=process.env;const inner=spawnSync(process.execPath,['--test','--test-reporter=tap',${JSON.stringify(inner)}],{stdio:'inherit',env});assert.equal(inner.status,1);});\n`;
  for(const file of names)fs.writeFileSync(path.join(repo,file),positive);
  const runner=path.join(repo,'run.mjs');
  fs.writeFileSync(runner,`import {check} from ${JSON.stringify(new URL('../tools/ci/check.mjs',import.meta.url).href)};try{process.exitCode=check('tests-22',process.cwd(),()=>({supported:true,backend:'macos-seatbelt-node'}),{shard:'1/2'});}catch(error){console.error(error.message);process.exitCode=1;}\n`);
  const run=()=>spawnSync(process.execPath,['--no-warnings',runner],{cwd:repo,encoding:'utf8',timeout:10000});
  const passed=run();assert.equal(passed.status,0,passed.stderr);assert.match(passed.stdout,/not ok 1 - expected inner failure/);
  assert.ok((passed.stdout.match(/# tests 1/g)||[]).length>=2,'both the inner and outer TAP summaries remain diagnostic');
  const summary=localSummary(passed.stdout);assert.equal(summary.counts.tests,1);assert.equal(summary.counts.fail,0);
  for(const [body,diagnostic] of [
    ["test('actual outer failure',()=>{throw Error('retain outer failure');});",/not ok 1 - actual outer failure/],
    ["test.skip('actual outer skip',()=>{});",/SKIP/],
    ["test.todo('actual outer todo');",/TODO/],
    ["test('actual outer cancellation',()=>new Promise(()=>{}));",/cancelledByParent/],
  ]) {
    fs.writeFileSync(path.join(repo,selected.files[0]),"import test from 'node:test';"+body+'\n');
    const held=run();assert.equal(held.status,1,held.stderr);assert.match(held.stdout,diagnostic);
    assert.equal(held.stdout.includes('{"schema":"ci-qualification-shard-summary-v2",'),false,'never print a success summary for a held outer result');
  }
});

test('full qualification aggregate requires every macOS shard while compatibility and public gates stay separate',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/qualification.yml'),'utf8');
  const worker=workflow.split('\n  qualification22:\n')[1].split('\n  full22:\n')[0];
  assert.match(worker,/shard: \[1, 2\]/);assert.match(worker,/timeout-minutes: 40/);assert.match(worker,/runs-on: macos-15/);
  assert.match(worker,/check\.mjs tests-22 --shard "\$CI_SHARD"/);assert.doesNotMatch(worker,/qualification-shards\.mjs --collect/);
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
