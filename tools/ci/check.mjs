import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inventory,lanes,requireThat,selectedTests} from './evidence.mjs';

// Ordinary CI and local checks use command results. Provenance receipts are optional.
export function check(lane,root=process.cwd()) {
  requireThat(lanes.includes(lane),'unknown check lane');
  const tests=lane==='build'?[]:selectedTests(lane,inventory(root));
  requireThat(lane==='build'||tests.length>0,'no tests selected');
  const commands=lane==='build'
    ? [[process.execPath,['tools/build-plugin.mjs','--check']],['git',['diff','--check']]]
    : [[process.execPath,['--no-warnings','--test','--test-concurrency=4','--test-reporter=tap',...tests]]];
  const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP','SystemRoot'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  for(const [command,args] of commands) {
    const result=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});
    if(result.error)console.error(result.error.message);
    if(result.error||result.signal||result.status!==0)return result.status||1;
  }
  return 0;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {process.exitCode=check(process.argv[2]);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
