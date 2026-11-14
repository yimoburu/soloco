import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {packageComparisonQualification} from '../tools/package-comparison-qualification.mjs';
import * as wrapper from '../tools/issue18/typed-capture.mjs';
import * as canonical from '../plugins/soloco/runtime/qualification/issue18/typed-capture.mjs';
import * as ledgerWrapper from '../tools/issue18-ledger-storage.mjs';
import * as ledgerCanonical from '../plugins/soloco/runtime/qualification/issue18-ledger-storage.mjs';

test('the installed optional qualification namespace has the exact checked Source and helper seal',()=>{
  const result=packageComparisonQualification(true);
  assert.equal(result.files,15);assert.equal(result.helpers_executed,0);assert(result.bytes>0);
});
test('tool compatibility entries and runtime imports share one actual byte-custody brand',()=>{
  assert.equal(wrapper.captureRawText,canonical.captureRawText);
  assert.equal(ledgerWrapper.openIssue18LedgerStorage,ledgerCanonical.openIssue18LedgerStorage);
  const original='\ufeff\u0000\ud800X\udfff',capture=wrapper.captureRawText(original);
  assert.deepEqual(canonical.copyBlobBytes(capture.blob),Buffer.from([255,254,0,0,0,216,88,0,255,223]));
  assert.throws(()=>canonical.copyBlobBytes({...capture.blob}),{code:'ISSUE18_CAPTURE_LOCAL_BLOB'});
});
test('a separately loaded Source module cannot consume the canonical module private capture',async()=>{
  const duplicate=await import('../plugins/soloco/runtime/qualification/issue18/typed-capture.mjs?isolated-source-custody-check');
  assert.notEqual(duplicate.captureRawText,canonical.captureRawText);
  const one=canonical.captureRawText('Source identity'),two=duplicate.captureRawText('Source identity');
  assert.throws(()=>duplicate.copyBlobBytes(one.blob),{code:'ISSUE18_CAPTURE_LOCAL_BLOB'});
  assert.throws(()=>canonical.copyBlobBytes(two.blob),{code:'ISSUE18_CAPTURE_LOCAL_BLOB'});
});
test('cold ordinary Store and worker imports read no Python helper and initialize no comparison',()=>{
  const store=new URL('../plugins/soloco/runtime/store.mjs',import.meta.url).href;
  const worker=new URL('../plugins/soloco/runtime/worker.mjs',import.meta.url).href;
  const script=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const effects=[];const read=fs.readFileSync;
fs.readFileSync=function(file,...args){if(String(file).endsWith('.py')){effects.push('python-helper-read');throw Error('unselected Python helper read');}return Reflect.apply(read,this,[file,...args]);};
for(const name of ['openSync','lstatSync','statSync']){const original=fs[name];fs[name]=function(file,...args){if(String(file).endsWith('.py')){effects.push('python-helper-lookup');throw Error('unselected Python helper lookup');}if(String(file).includes('/tools/issue18')){effects.push('repository-tool-lookup');throw Error('ordinary runtime looked up repository tools');}return Reflect.apply(original,this,[file,...args]);};}
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync'])cp[name]=()=>{effects.push(name);throw Error('unselected process creation');};
for(const name of ['mkdirSync','writeFileSync','appendFileSync','renameSync','linkSync'])fs[name]=()=>{effects.push(name);throw Error('unselected initialization');};
syncBuiltinESMExports();await import(${JSON.stringify(store)});await import(${JSON.stringify(worker)});
if(effects.length)throw Error(JSON.stringify(effects));process.stdout.write('ordinary-import-no-comparison-effects\\n');`;
  const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP','SystemRoot'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
  const output=execFileSync(process.execPath,['--input-type=module','--eval',script],{env,encoding:'utf8',timeout:30000,maxBuffer:16384,stdio:['ignore','pipe','pipe']});
  assert.equal(output,'ordinary-import-no-comparison-effects\n');
});
