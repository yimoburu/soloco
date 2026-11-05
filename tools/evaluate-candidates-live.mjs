import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { modelCatalog,runModel } from '../plugins/soloco/runtime/adapters.mjs';
import { normalizeSelection } from '../plugins/soloco/runtime/selection.mjs';
import { reconstructPatch } from '../plugins/soloco/runtime/development-patch.mjs';
import { runLocalTests } from '../plugins/soloco/runtime/local-sandbox.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
async function main(argv) {
  if(argv.length!==3||argv[0]!=='--live'||argv[1]!=='--output'||!argv[2])throw new Error('Opt in with --live --output NEW_REPORT.json (four fictional model calls; existing host usage)');
  if(fs.existsSync(argv[2]))throw new Error('Preserve existing receipts; output already exists');
  const catalog=modelCatalog('codex'),selection=normalizeSelection({mode:'explicit',model:'gpt-6.1-sol',effort:'medium',reason:'Bounded four-call fictional candidate-format qualification'},'codex',catalog);
  const report={schema:1,kind:'fictional_live_candidate_format_comparison',created_at:new Date().toISOString(),requested:selection,trials:[],limitations:['Four one-shot observations; not statistical savings or quality non-inferiority proof','No retries; every output/error retained','Exact fixture acceptance and real isolated tests are not independent company QA or integration permission','Codex effective settings remain unverified; requested/applied controls are separately reported']};
  const save=()=>fs.writeFileSync(argv[2],JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  for(const count of [1,3])for(const format of ['files','patches']) {
    const sources=Array.from({length:count},(_,i)=>({path:`module-${i}.mjs`,content:'export const value = 0;\n'+'// unchanged fictional padding\n'.repeat(100)}));
    const expected=sources.map(f=>({...f,content:f.content.replace('= 0;','= 1;')}));
    const prompt=`This is a fictional candidate-format evaluation. No tools, commands, file writes, delegation or external actions. Change each module's exported value from 0 to 1; preserve every other character. Return JSON only with content describing the change and ${format==='files'?'files:[{path,content}] including complete exact file contents without elision':'patches:[{path,base_sha256,edits:[{start,end,text}]}], using exact base hashes and ordered nonoverlapping UTF-16 offsets into original text'}. Do not include the other output format. Sources: ${JSON.stringify(sources.map(f=>({...f,sha256:hash(f.content)})))}`;
    const trial={files:count,format,source_bytes:bytes(sources),prompt_sha256:hash(prompt),started_at:new Date().toISOString()},start=Date.now();
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-format-live-'));
    try {
      const output=await runModel('codex',null,prompt,dir,180000,selection);trial.generation_ms=Date.now()-start;trial.raw_response=output.text;trial.model_evidence=output.model_evidence;
      const artifact=JSON.parse(output.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
      if(artifact[format==='files'?'patches':'files']!==undefined)throw new Error('Mixed/unrequested output format');
      const generated=artifact[format];if(!Array.isArray(generated)||generated.length!==count)throw new Error('Incomplete file list');
      const complete=generated.map(f=>{
        const source=sources.find(s=>s.path===f.path);if(!source)throw new Error('Undeclared path');
        return {path:f.path,content:format==='patches'?reconstructPatch(source.content,f):f.content};
      }).sort((a,b)=>a.path.localeCompare(b.path));
      if(JSON.stringify(complete)!==JSON.stringify(expected))throw new Error('Candidate differs from exact accepted fixture');
      trial.generated_bytes=bytes(generated);trial.candidate_bytes=bytes(complete);trial.candidate_sha256=hash(JSON.stringify(complete));trial.exact_fixture_match=true;
      for(const f of complete)fs.writeFileSync(path.join(dir,f.path),f.content);
      const testPath='fixture.test.mjs',testCode="import test from 'node:test';import assert from 'node:assert/strict';\n"+sources.map((f,i)=>`import {value as v${i}} from './${f.path}';`).join('\n')+`\ntest('values',()=>{${sources.map((_,i)=>`assert.equal(v${i},1);`).join('')}});\n`;
      fs.writeFileSync(path.join(dir,testPath),testCode);
      trial.tests=await runLocalTests({directory:dir,test_paths:[testPath],timeout_ms:10000,max_output_bytes:10000});
      trial.fixture_accepted=trial.tests.tests_executed===true&&trial.tests.status==='passed';
    }catch(error){trial.error=error.message;trial.fixture_accepted=false;}
    finally {trial.total_ms=Date.now()-start;fs.rmSync(dir,{recursive:true,force:true});report.trials.push(trial);save();}
  }
  report.all_fixture_checks_passed=report.trials.every(t=>t.fixture_accepted);save();
  console.log(JSON.stringify({output:argv[2],all_fixture_checks_passed:report.all_fixture_checks_passed,trials:report.trials.map(({files,format,generation_ms,generated_bytes,fixture_accepted,error})=>({files,format,generation_ms,generated_bytes,fixture_accepted,error}))}));
  if(!report.all_fixture_checks_passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
