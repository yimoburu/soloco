import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('comparison publication keeps the shorter cutoff at physical COMMIT',{
  skip:process.platform!=='darwin',timeout:240000
},()=>{
  // The normal suite shares a project module graph. This fixed child must
  // install its controlled clock before Store/runtime capture Date.now; it
  // cannot safely change the suite's clock or reuse already-loaded modules.
  const file=fileURLToPath(new URL('./issue18-final-publication-cutoff.check.mjs',import.meta.url));
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','SystemRoot'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));
  const output=execFileSync(process.execPath,['--no-warnings',file],{
    env,encoding:'utf8',timeout:210000,maxBuffer:1048576,
    killSignal:'SIGKILL',stdio:['ignore','pipe','pipe']
  });
  assert.match(output,/^ok 1 - same actual publication commits while both deadlines remain live$/m);
  assert.match(output,/^ok 2 - short comparison deadline expires after publication guards and rolls back at physical COMMIT$/m);
  for(const [key,value]of Object.entries({tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0}))assert.match(output,new RegExp('^# '+key+' '+value+'$','m'));
});
