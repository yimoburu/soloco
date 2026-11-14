// AUTHORED/UNRUN SOURCE negatives. A genuine fresh peer positive is PLANNED:
// it requires the actual Original Store -> mechanical decision/plan/packet/
// grant/worker/model/result -> guarded origin.quarantined Source fixture.
// No fake origin issuer, test.bootstrap qualification or Native claim appears.
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {freshInventoryStore} from './original-global-worker-inventory-fixture.mjs';
import {createNativeExecutor} from '../plugins/soloco/runtime/peers/scheduler.mjs';
import {PeerLedger,installPeerSchema} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {runModel,inspectOriginalAdapterModelCutoffFrom} from '../plugins/soloco/runtime/adapters.mjs';

function denyChildren(t){
  const attempted=[];for(const name of ['spawn','spawnSync','fork','exec','execFile','execSync','execFileSync'])t.mock.method(childProcess,name,()=>{attempted.push(name);throw Error('SOURCE negative must not create a child or metadata subprocess');});
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();assert.deepEqual(attempted,[]);});return attempted;
}
const task={id:'SYNTHETIC-task',value:{role:'research',host:'codex',attempt:{id:'SYNTHETIC-attempt'}}};
const context={text:'SYNTHETIC exact Source fixture context',sha256:'a'.repeat(64)};

test('default native executor without an original ledger cannot start a raw model',{concurrency:false},async t=>{
  denyChildren(t);const f=await freshInventoryStore(t),executor=createNativeExecutor({cwd:f.root,evidence_dir:f.root+'/evidence',probe:async()=>({available:true,authenticated:true})});
  const result=await executor.execute({task,context});assert.equal(result.error.code,'ORIGINAL_EXECUTION_PEER_ADMISSION_REQUIRED');assert.equal(result.observed_process,null);assert.equal(result.termination_confirmed,true);assert.equal(f.inspect().occupied,0);
});

test('physical peer schema and a fresh Legacy Original prefix do not supply origin quarantine',{concurrency:false},async t=>{
  denyChildren(t);const f=await freshInventoryStore(t);const companyId=f.state().id;f.store.migrate();f.store.close();
  // Deliberately UNQUALIFIED physical setup, used only to prove the negative.
  const db=new DatabaseSync(f.file);try{db.prepare('UPDATE company_layout SET version=5 WHERE id=1').run();installPeerSchema(db,{company_id:companyId});}finally{db.close();}
  const ledger=new PeerLedger(f.root);t.after(()=>ledger.close());
  const before=ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_events').get().n;
  const executor=createNativeExecutor({ledger,cwd:f.root,evidence_dir:f.root+'/evidence',probe:async()=>({available:true,authenticated:true})});
  const result=await executor.execute({task,context,admission_ref:{family:'commands',id:'SYNTHETIC-absent-admission',revision:1,sha256:'0'.repeat(64)}});
  assert.equal(result.error.code,'ORIGINAL_EXECUTION_LEGACY_WRITER_FENCE_CHANGED');assert.equal(result.observed_process,null);assert.equal(ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_events').get().n,before);
});

test('ordinary task-looking JSON is not an opaque original model token',{concurrency:false},async t=>{
  denyChildren(t);const f=await freshInventoryStore(t),shape={kind:'peer-model',task_id:task.id,attempt_id:task.value.attempt.id,context_sha256:context.sha256,admission_launch_coverage_complete:true,deadline_at_ms:Date.now()+60000};
  await assert.rejects(runModel('codex',null,context.text,f.root,60000,null,{originalExecutionLaunch:shape}),/PRIVATE_LAUNCH_REQUIRED/);assert.equal(f.inspect().occupied,0);
});

test('copied adapter cutoff DATA cannot confer model deadline or cancellation authority',{concurrency:false},async t=>{
  denyChildren(t);const controller=new AbortController(),token=Object.freeze({});
  assert.throws(()=>inspectOriginalAdapterModelCutoffFrom({token,deadline_at_ms:Date.now()+60000,signal:controller.signal},token),/Canonical original model cutoff required/);controller.abort();
  assert.throws(()=>inspectOriginalAdapterModelCutoffFrom({token,deadline_at_ms:null,signal:null},token),/Canonical original model cutoff required/);
});
