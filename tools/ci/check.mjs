import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventory,lanes,requireThat,selectedTests} from './evidence.mjs';
import {sandboxCapability} from '../../plugins/soloco/runtime/local-sandbox.mjs';
import {selectShard} from './shards.mjs';
import {selectQualificationShard,qualificationPrelude,collectQualification} from './qualification-shards.mjs';

// Ordinary CI and local checks use command results. Provenance receipts are optional.
export function check(lane,root=process.cwd(),probe=sandboxCapability,{shard}={}) {
  requireThat(lanes.includes(lane),'unknown check lane');
  requireThat(shard===undefined||['regression-22','tests-22'].includes(lane),'sharding is supported only for regression-22 or tests-22');
  let tests=lane==='build'?[]:selectedTests(lane,inventory(root));
  let fullSelection;
  requireThat(lane==='build'||tests.length>0,'no tests selected');
  if(shard!==undefined) {
    const selected=lane==='tests-22'?selectQualificationShard(tests,shard):selectShard(tests,shard);
    if(lane==='tests-22')fullSelection=selected;
    tests=selected.files;
    console.log(lane==='tests-22'?qualificationPrelude(selected):`CI shard ${selected.index}/${selected.total}: ${tests.length}/${selected.selected_total} whole test files; selected inventory sha256=${selected.inventory_sha256}`);
  }
  if(lane!=='build') {
    const capability=probe();
    requireThat(capability.supported && capability.backend==='macos-seatbelt-node',
      `actual macOS Seatbelt required: ${capability.blocker??'unsupported sandbox backend'}`);
  }
  const summaryDir=fullSelection?fs.mkdtempSync(path.join(os.tmpdir(),'soloco-ci-outer-summary-')):undefined;
  try {
    const summaryFile=summaryDir&&path.join(summaryDir,'outer.json');
    if(summaryFile)fs.closeSync(fs.openSync(summaryFile,'wx',0o600));
    const reporters=summaryFile?['--test-reporter=tap','--test-reporter-destination=stdout',
      `--test-reporter=${fileURLToPath(new URL('./qualification-reporter.mjs',import.meta.url))}`,
      `--test-reporter-destination=${summaryFile}`]:['--test-reporter=tap'];
    const commands=lane==='build'
      ? [[process.execPath,['tools/build-plugin.mjs','--check']],['git',['diff','--check']]]
      : [[process.execPath,['--no-warnings','--test','--test-concurrency=4',...reporters,...tests]]];
    const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP','SystemRoot'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
    for(const [command,args] of commands) {
      const result=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});
      if(result.error)console.error(result.error.message);
      if(result.error||result.signal||result.status!==0)return result.status||1;
    }
    if(summaryFile)console.log(JSON.stringify(collectQualification(summaryFile,fullSelection,root)));
    return 0;
  } finally {if(summaryDir)fs.rmSync(summaryDir,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    const [lane,...args]=process.argv.slice(2);
    requireThat(args.length===0||(args.length===2&&args[0]==='--shard'),'usage: check.mjs LANE [--shard INDEX/TOTAL]');
    process.exitCode=check(lane,process.cwd(),sandboxCapability,args.length?{shard:args[1]}:{});
  }
  catch(error){console.error(error.message);process.exitCode=1;}
}
