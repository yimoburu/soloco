import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { reconstructPatch } from '../plugins/soloco/runtime/development-patch.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const results=[];
for(const files of [1,4]) {
  const sources=Array.from({length:files},(_,i)=>({path:`module-${i}.mjs`,content:'export const value = 0;\n'+'// fictional unchanged padding\n'.repeat(4000)}));
  const complete=sources.map(s=>({...s,content:s.content.replace('= 0;','= 1;')}));
  const patches=sources.map(s=>({path:s.path,base_sha256:hash(s.content),edits:[{start:s.content.indexOf('0;'),end:s.content.indexOf('0;')+1,text:'1'}]}));
  const samples=[];let matches=true;
  for(let trial=0;trial<30;trial++) {
    const start=performance.now();
    const rebuilt=sources.map((s,i)=>({path:s.path,content:reconstructPatch(s.content,patches[i])}));
    samples.push(performance.now()-start);matches&&=JSON.stringify(rebuilt)===JSON.stringify(complete);
  }
  samples.sort((a,b)=>a-b);
  results.push({files,full_output_bytes:bytes(complete),patch_output_bytes:bytes(patches),reconstructed_candidate_bytes:bytes(complete),reconstruction_median_ms:Number(samples[15].toFixed(3)),exact_candidate_match:matches});
}
console.log(JSON.stringify({kind:'fictional_candidate_transport_comparison',results,limitations:['No model generation was executed','No generation latency, invalid-output rate, repairs, accepted-task quality or spending improvement is inferred','Runtime reconstruction time is not time to accepted outcome']},null,2));
if(results.some(r=>!r.exact_candidate_match))process.exitCode=1;
