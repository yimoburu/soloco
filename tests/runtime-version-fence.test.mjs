import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {VERSION,id,withStore} from '../plugins/soloco/runtime/store.mjs';

// Keep the compatibility assertion against the immutable published implementation,
// not a second hand-written interpretation of its acceptance checks.
const published='37e82eb';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-version-fence-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const archive=spawnSync('git',['archive',published,'plugins/soloco'],{cwd:repo,maxBuffer:20000000});
assert.equal(archive.status,0,'Runtime fence regression requires published commit '+published+' in local Git history');
const legacyDir=path.join(base,'published');fs.mkdirSync(legacyDir);
const extract=spawnSync('tar',['-xf','-','-C',legacyDir],{input:archive.stdout});
assert.equal(extract.status,0,'Could not extract immutable published runtime');
const legacy=await import(pathToFileURL(path.join(legacyDir,'plugins/soloco/runtime/engine.mjs')));
const state=a=>withStore(a.root,db=>db.read());

test('bounded-handover producer fences actual 0.6.10, 0.6.11, 0.6.12, 0.6.13, 0.7.0 and published 0.7.1/0.7.2/0.7.3/0.7.4/0.7.7/0.7.8 writers without adopting definitions',()=>{
 for(const [version,revision] of [['0.6.10','056c36e'],['0.6.11','b2e3974'],['0.6.12','964f90c'],['0.6.13','76d3e8d'],['0.7.0','7f7f085'],['0.7.1','1347f79c4249c8e4aba39ba372ad1376476f9a79'],['0.7.2','64bd2eb3ea3a047aba0eb284b6629414ae3ddbc6'],['0.7.3','a260eb802692c7f876fa1d35bd899efbd6042c8b'],['0.7.4','886e0e5eb9e0a97201ca7ab51c5002825db82329'],['0.7.5','38d95fd6463fedef68e61737bdb2d4af4b05c756'],['0.7.7','70ca420ac57819c04eb37c9071fda8a5b78c9e27'],['0.7.8','0e78adafacc2e96084d48ac8bd009e7f0d31f51d']]) {
  const archived=spawnSync('git',['archive',revision,'plugins/soloco'],{cwd:repo,maxBuffer:20000000});
  assert.equal(archived.status,0);
  const dir=path.join(base,'producer-'+version);fs.mkdirSync(dir);
  assert.equal(spawnSync('tar',['-xf','-','-C',dir],{input:archived.stdout}).status,0);
  // Each immutable implementation runs in its own process to retain its actual
  // package identity and version rather than patching a second interpretation.
  const root=fs.mkdtempSync(path.join(base,'old-'+version+'-'));
  const oldUrl=pathToFileURL(path.join(dir,'plugins/soloco/runtime/engine.mjs')).href;
  const session=id('fixture-owner');
  const setupScript=`import * as e from ${JSON.stringify(oldUrl)};const a=${JSON.stringify({root,session_id:session,idea:'Fictional runtime fence'})};e.bind(a.root,a.session_id,'codex');e.open(a,'codex');`;
  assert.equal(spawnSync(process.execPath,['--input-type=module','-e',setupScript],{env:process.env}).status,0);
  const a={root,session_id:session,epoch:1},before=state(a);
  engine.bind(root,session,'codex');
  const opened=engine.open(a,'codex');
  assert.equal(opened.plugin_version,version);assert.equal(opened.runtime_version,version);
  assert.equal(opened.capabilities.model_selection.eligible,true);
  assert.equal(opened.capabilities.local_prototype.eligible,true);
  if(opened.capabilities.local_development.supported)assert.equal(opened.capabilities.local_development.eligible,true);
  assert.deepEqual(state(a),before,'Read-only opening retains the published producer and pinned team');
  engine.save({...a,kind:'decision',content:'Fictional operation under corrected handover runtime'},'codex');
  assert.equal(state(a).runtime_version,VERSION);assert.equal(state(a).plugin_version,version);
  for(const field of ['governance','governance_sha256','roles','cos_instructions','team_sha256','owner'])assert.deepEqual(state(a)[field],before[field]);
  const staleScript=`import * as e from ${JSON.stringify(oldUrl)};const a=${JSON.stringify(a)};e.bind(a.root,a.session_id,'codex');try{e.save({...a,kind:'plan',content:'stale mutation'},'codex');process.exit(9);}catch(err){if(!/runtime upgrade/.test(err.message))throw err;}`;
  const promoted=state(a);
  assert.equal(spawnSync(process.execPath,['--input-type=module','-e',staleScript],{env:process.env}).status,0);
  assert.deepEqual(state(a),promoted,'Rejected published writer must not alter promoted state');
 }
});

test('corrected release fences the actual installed 0.6.9 writer after a semantic mutation',async()=>{
  const archived=spawnSync('git',['archive','df55ac6','plugins/soloco'],{cwd:repo,maxBuffer:20000000});
  assert.equal(archived.status,0);
  const dir=path.join(base,'v069');fs.mkdirSync(dir);
  assert.equal(spawnSync('tar',['-xf','-','-C',dir],{input:archived.stdout}).status,0);
  const old=await import(pathToFileURL(path.join(dir,'plugins/soloco/runtime/engine.mjs')));
  const a={root:fs.mkdtempSync(path.join(base,'v069-company-')),session_id:id('fictional-founder'),epoch:1};
  old.bind(a.root,a.session_id,'codex');old.open({...a,idea:'Fictional installed-version fixture'},'codex');
  assert.equal(state(a).runtime_version,'0.6.9');
  engine.bind(a.root,a.session_id,'codex');
  engine.save({...a,kind:'decision',content:'Fictional corrected-runtime operation'},'codex');
  assert.equal(state(a).runtime_version,VERSION);assert.notEqual(VERSION,'0.6.9');
  old.bind(a.root,a.session_id,'codex');
  assert.throws(()=>old.save({...a,kind:'decision',content:'Fictional obsolete writer'},'codex'),/runtime upgrade/);
  assert.equal(state(a).plugin_version,'0.6.9','Compatible runtime update preserves pinned definitions');
});
function setup(){
  const a={root:fs.mkdtempSync(path.join(base,'company-')),session_id:id('fictional-founder'),epoch:1};
  legacy.bind(a.root,a.session_id,'codex');legacy.open({...a,idea:'Fictional compatibility fixture'},'codex');
  assert.equal(state(a).runtime_version,'0.6.8');
  engine.bind(a.root,a.session_id,'codex');return a;
}

test('explicitly migrated handover fences actual published 0.6.8 resume without adopting pinned definitions',()=>{
  const a=setup(),before=state(a);
  engine.open(a,'codex');assert.deepEqual(state(a),before,'Read-only opening must not adopt or promote');
  // New snapshot storage needs explicit migration; the read-only open above did not do it.
  withStore(a.root,db=>db.migrate());
  const b={...a,session_id:id('fictional-successor'),epoch:2};engine.bind(a.root,b.session_id,'codex');
  engine.control({...b,action:'handover',expected_epoch:1,source_instruction:'Fictional authorized replacement'},'codex');
  const pending=state(b);
  assert.equal(pending.runtime_version,VERSION);assert.notEqual(VERSION,'0.6.8');
  assert.equal(pending.handover.status,'pending');assert.equal(pending.paused,true);
  for(const key of ['plugin_version','governance','governance_sha256','roles','cos_instructions','team_sha256'])assert.deepEqual(pending[key],before[key],key+' must stay pinned');
  legacy.bind(b.root,b.session_id,'codex');
  assert.throws(()=>legacy.control({...b,action:'resume',expected_epoch:2,source_instruction:'Fictional stale-runtime resume'},'codex'),/upgrade|company version|storage/i);
  assert.throws(()=>legacy.save({...b,kind:'decision',content:'Fictional stale-runtime mutation'},'codex'),/runtime upgrade|company version|storage/i);
  assert.deepEqual(state(b),pending,'Rejected old-runtime operations must preserve pending QA gate');
  engine.bind(b.root,b.session_id,'codex');
  assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Fictional premature resume'},'codex'),/reconstruction/);
});

test('successful new semantic mutations promote an older producer; rejected mutations do not',()=>{
  const a=setup(),before=state(a);
  assert.throws(()=>engine.save({...a,kind:'intent',content:''},'codex'),/nonempty/);
  assert.deepEqual(state(a),before);
  const r=engine.save({...a,kind:'decision',content:'Fictional resolved source'},'codex');
  assert.equal(state(a).runtime_version,VERSION);assert.equal(state(a).plugin_version,'0.6.8');
  withStore(a.root,db=>db.transaction('fixture.prior_producer',s=>{s.runtime_version='0.6.8';return s;}));
  engine.contextControl({...a,action:'plan',record_ids:[r.id],disposition:'resolved',source_instruction:'Propose fictional exact classification'},'codex');
  assert.equal(state(a).runtime_version,VERSION);
  legacy.bind(a.root,a.session_id,'codex');assert.throws(()=>legacy.save({...a,kind:'plan',content:'Fictional stale plan'},'codex'),/runtime upgrade/);
});

test('future-version emergency pause never downgrades its producer fence',()=>{
  const a=setup();withStore(a.root,db=>db.transaction('fixture.future',s=>{s.runtime_version='999.0.0';return s;}));
  engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Fictional emergency pause'},'codex');
  assert.equal(state(a).paused,true);assert.equal(state(a).runtime_version,'999.0.0');
  assert.throws(()=>engine.control({...a,action:'resume',expected_epoch:1,source_instruction:'Fictional unsupported resume'},'codex'),/upgrade/);
});

test('new code retains 0.6.8 team capabilities while inspecting without adoption',()=>{
  const a=setup(),before=state(a),s=engine.status(a,'codex');
  assert.equal(s.plugin_version,'0.6.8');assert.equal(s.runtime_version,'0.6.8');
  assert.equal(s.capabilities.model_selection.eligible,true);
  assert.equal(s.capabilities.local_prototype.eligible,true);
  if(s.capabilities.local_development.supported)assert.equal(s.capabilities.local_development.eligible,true);
  assert.deepEqual(state(a),before);
});
