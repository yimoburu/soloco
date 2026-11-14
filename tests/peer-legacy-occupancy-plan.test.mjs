// FICTIONAL SQLite/vault/source archives. The temporary fixed companion below
// is an explicitly SYNTHETIC source-cut fixture, NOT the accepted origin backend
// or a native/historical-policy producer. It cannot produce a positive review.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {installLegacyWorkerRecipeSourceFixture} from './legacy-worker-recipe-fixture.mjs';

const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),hash=v=>createHash('sha256').update(v).digest('hex');
const required=['.claude-plugin/plugin.json','runtime/adapters.mjs','runtime/coordination.mjs','runtime/develop.mjs','runtime/engine.mjs','runtime/model-process-closure.mjs','runtime/record-storage.mjs','runtime/state-projections.mjs','runtime/store.mjs','runtime/team-source.mjs','runtime/worker.mjs'];
const companion=`// SYNTHETIC SOURCE CUT ONLY. NO ACCEPTED NATIVE OR POLICY PRODUCER.
import {readNormalized,captureStorageBaseline} from '../record-storage.mjs';
import {captureLegacyLocalWorkerOccupancyFrom,inspectOriginalLegacyLocalWorkerOccupancy} from './legacy-worker-occupancy.mjs';
import {canonical,peerDigest} from './ledger.mjs';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
let failure=null;
export const setSYNTHETICProviderFailure=e=>{failure=e;};
export function assertOriginActor(a){if(Object.keys(a).sort().join(',')!=='host,native_id,session_id'||a.host!=='codex'||a.native_id!==a.session_id)throw Error('SYNTHETIC actor');return JSON.parse(canonical(a));}
export function captureOriginSidecarContents(){const content=Buffer.from([0,255,1,65]);return [{path:'SYNTHETIC-binary-sidecar',bytes:content.length,sha256:hash(content),content}];}
export function capturePeerOriginCut(db){
 if(failure)throw failure;
 const state=readNormalized(db),p=inspectOriginalLegacyLocalWorkerOccupancy(captureLegacyLocalWorkerOccupancyFrom(db));
 const authority={company_id:state.id,owner:state.owner},snapshot={authority,execution:{pending_jobs:Object.values(state.jobs).filter(j=>['queued','running'].includes(j.status)).length}};
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const archive=db.prepare('SELECT sha256,bytes FROM immutable_values ORDER BY sha256').all().map(r=>({sha256:r.sha256,characters:r.bytes.length,utf8_bytes:Buffer.byteLength(r.bytes)}));
 const events=db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all().map(r=>({seq:r.seq,at:r.at,type:r.type,sha256:hash(r.value),utf8_bytes:Buffer.byteLength(r.value)}));
 const sidecars=captureOriginSidecarContents().map(({content,...r})=>r),body={protocol:'peer-origin-exact-cut-v1',authority,sources:p.sources,pinned_team:{SYNTHETIC:true,NOT_QUALIFIED:true},projection:{SYNTHETIC:true},schema,archive,events,sidecars};
 return {snapshot,body,sha256:peerDigest(body),baseline:captureStorageBaseline(db)};
}
export function validatePeerOriginMechanicalReview(){throw Object.assign(Error('SYNTHETIC_NATIVE_QA_PRODUCER_UNAVAILABLE'),{code:'SYNTHETIC_NATIVE_QA_PRODUCER_UNAVAILABLE'});}
`;
async function fixture(t,{missingBackend=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-FICTIONAL-occupancy-plan-')),runtimeCopy=path.join(root,'SOURCE-plugin/runtime'),company=path.join(root,'FICTIONAL-company');
  let store;t.after(()=>{if(store&&!store.closed)store.close();fs.rmSync(root,{recursive:true,force:true});});
  fs.mkdirSync(path.dirname(runtimeCopy));fs.cpSync(runtime,runtimeCopy,{recursive:true});installLegacyWorkerRecipeSourceFixture(runtimeCopy);const backendFile=path.join(runtimeCopy,'peers/origin-plan.mjs');if(missingBackend)fs.rmSync(backendFile,{force:true});else fs.writeFileSync(backendFile,companion);fs.mkdirSync(path.join(company,'.company'),{recursive:true});
  const load=relative=>import(pathToFileURL(path.join(runtimeCopy,relative)).href),[api,source,storage,storeModule,models,ledger]=await Promise.all(['peers/legacy-occupancy-plan.mjs','peers/legacy-occupancy-policy.mjs','record-storage.mjs','store.mjs','model-process-closure.mjs','peers/ledger.mjs'].map(load)),backend=missingBackend?null:await load('peers/origin-plan.mjs');
  const actor={host:'codex',native_id:'SYNTHETIC-founder',session_id:'SYNTHETIC-founder'},db=new DatabaseSync(path.join(company,'.company/company.sqlite'));
  db.exec("CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT,type TEXT,value TEXT); CREATE TABLE company_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL); INSERT INTO company_layout VALUES(1,4); CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL); CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL,encoding TEXT NOT NULL DEFAULT 'json',PRIMARY KEY(family,key));");
  const initial={schema:2,runtime_version:'0.7.8',plugin_version:'0.7.8',governance:'SYNTHETIC governance fixture only',roles:{},cos_instructions:'SYNTHETIC instructions fixture only',id:'FICTIONAL-company',paused:true,owner:{host:actor.host,session_id:actor.session_id,epoch:1},revision:0,jobs:{},records:{'SYNTHETIC-old':{status:'expired',used_attempts:7}},notices:[{id:'SYNTHETIC-notice',status:'pending'}]};initial.team_sha256=storeModule.teamHash(initial);
  db.exec('BEGIN IMMEDIATE');try{storage.writeNormalized(db,initial);db.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify({layout:4}));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}db.close();
  store=new storeModule.Store(company);
  const write=(type,change)=>store.transaction(type,s=>{change(s);return s;});write('SYNTHETIC.fixture.created',()=>{});
  const archive={protocol:'legacy-original-policy-source-archive-v1',runtime_version:'0.7.8',files:required.map(name=>{const content=name==='.claude-plugin/plugin.json'?JSON.stringify({name:'soloco',version:'0.7.8'}):'// SYNTHETIC source bytes only '+name+'\n';return {path:name,sha256:hash(content),content};})},file=path.join(root,'SYNTHETIC-source-archive.json');fs.writeFileSync(file,JSON.stringify(archive)+'\n');
  const sourceCap=source.captureOriginalLegacyOccupancyPolicySourceFrom(file),prepare=()=>store.readSnapshot(()=>api.prepareLegacyOccupancyMechanicalPlanFrom(store,sourceCap,actor));
  const addClosedFailure=id=>{
    write('job.started',s=>{s.jobs[id]={id,instance_id:'SYNTHETIC-instance-'+id,host:'codex',worker_pid:123456,status:'running',native_id:'SYNTHETIC-native-'+id,started_at:new Date().toISOString()};});
    const invocation={invocation_id:'SYNTHETIC-invocation-'+id,job_id:id,instance_id:'SYNTHETIC-instance-'+id,host:'codex',worker_pid:123456,requested_at:new Date().toISOString()};
    write('job.model_process.requested',s=>models.requestModelProcess(s.jobs[id],invocation));
    const birth={protocol:'ordinary-model-process-birth-v1',launch_id:'SYNTHETIC-launch-'+id,host:'codex',pid:654321,worker_pid:123456,spawned_at:new Date().toISOString(),command_sha256:hash('SYNTHETIC-command'),argv_sha256:hash('SYNTHETIC-argv'),cwd_sha256:hash('SYNTHETIC-cwd')};
    write('job.model_process.born',s=>models.recordModelProcessBirth(s.jobs[id],invocation,birth));
    write('job.model_process.closed',s=>models.recordModelProcessClosure(s.jobs[id],invocation,birth,{protocol:'ordinary-model-process-close-v1',birth_sha256:hash(JSON.stringify(birth)),closed_at:new Date().toISOString(),exit_code:17,signal:null,observation:'original-child-close'}));
    write('job.failed',s=>{s.jobs[id].status='failed';s.jobs[id].coordination_release={termination_confirmed:true,reason:'model_process_closed',at:new Date().toISOString()};});
  };
  const recordPlan=(cap,change=p=>p)=>{
    const {component,component_sha256}=api.inspectOriginalLegacyOccupancyMechanicalPlan(cap),id='SYNTHETIC-plan';
    const plan=change({protocol:'peer-origin-quarantine-plan-v1',plan_id:id,company_id:'FICTIONAL-company',actor,owner:component.owner,baseline:component.baseline,cut:component.source_cut,cut_sha256:component.source_cut_sha256,legacy_occupancy_component:component,legacy_occupancy_component_sha256:component_sha256,expires_at:new Date(Date.now()+60000).toISOString(),legacy_authority:'retired-without-conversion',execution_resumed:false});
    write('origin.quarantine.planned',s=>{s.records[id]={id,revision:1,kind:'plan',author_instance:actor.native_id,author_role:'cos',content:ledger.canonical(plan),origin_quarantine_plan:plan};});return plan;
  };
  const recordReview=(plan,change=x=>x)=>{
    const p=plan.legacy_occupancy_component,output=change({protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:ledger.peerDigest(plan),cut_sha256:plan.cut_sha256,legacy_authority:'retired-without-conversion',execution_resumed:false,legacy_occupancy:{protocol:'legacy-occupancy-mechanical-review-binding-v1',component_sha256:ledger.peerDigest(p),policy_archive_sha256:p.policy_source.archive_sha256,source_cut_sha256:plan.cut_sha256,partition_sha256:p.partition_sha256,original_policy_association:'UNPROVED',original_policy_witness:null,release_authority:false,whole_domain_qualified:false}});
    write('SYNTHETIC.review.DATA.only',s=>{s.records['SYNTHETIC-review']={id:'SYNTHETIC-review',kind:'review',content:JSON.stringify(output),revision:1};});return output;
  };
  return {root,store,api,actor,source,sourceCap,ledger,backend,prepare,write,addClosedFailure,recordPlan,recordReview,validate:()=>store.readSnapshot(()=>api.validateOriginalLegacyOccupancyMechanicalReviewFrom(store,'SYNTHETIC-plan','SYNTHETIC-review',actor))};
}
function snapshot(db){return JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,rows:db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()})));}

test('fixed original backend is absent in this source composition; shaped stores and Pass DATA cannot substitute',async t=>{
  const f=await fixture(t,{missingBackend:true});
  for(const value of [{},new Proxy({},{get(){throw Error('Must not invoke proxy');}})])assert.throws(()=>f.api.prepareLegacyOccupancyMechanicalPlanFrom(value,{},f.actor),e=>e.code==='LEGACY_OCCUPANCY_OWNING_STORE_SNAPSHOT_REQUIRED');
  assert.throws(()=>f.api.prepareLegacyOccupancyMechanicalPlanFrom(f.store,f.sourceCap,f.actor),e=>e.code==='LEGACY_OCCUPANCY_OWNING_STORE_SNAPSHOT_REQUIRED');
  f.store.readSnapshot(()=>assert.throws(()=>f.api.prepareLegacyOccupancyMechanicalPlanFrom(f.store,f.sourceCap,f.actor),e=>e.code==='LEGACY_OCCUPANCY_ORIGINAL_BACKEND_UNAVAILABLE'));
});
test('present fixed backend import preserves AggregateError identity despite missing-module code and canonical URL',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SYNTHETIC-plan-import-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const runtimeCopy=path.join(root,'runtime');fs.cpSync(runtime,runtimeCopy,{recursive:true});installLegacyWorkerRecipeSourceFixture(runtimeCopy);
  const backendFile=path.join(runtimeCopy,'peers/origin-plan.mjs'),key='SYNTHETIC-plan-import-'+path.basename(root),cause=Error('SYNTHETIC original cause'),member=Error('SYNTHETIC original member');
  const sentinel=Object.assign(new AggregateError([member],'SYNTHETIC present backend import failure',{cause}),{code:'ERR_MODULE_NOT_FOUND',url:pathToFileURL(backendFile).href});
  globalThis[key]=sentinel;t.after(()=>delete globalThis[key]);
  fs.writeFileSync(backendFile,`throw globalThis[${JSON.stringify(key)}];\n`);
  assert.ok(fs.statSync(backendFile).isFile());
  await assert.rejects(import(pathToFileURL(path.join(runtimeCopy,'peers/legacy-occupancy-plan.mjs')).href),error=>{
    assert.strictEqual(error,sentinel);assert.strictEqual(error.cause,cause);assert.strictEqual(error.errors[0],member);return true;
  });
});
test('source plan retains every actual fictional vault/event/binary sidecar byte and changes no database row',async t=>{
  const f=await fixture(t);f.addClosedFailure('SYNTHETIC-old-failure');const before=snapshot(f.store.db),cap=f.prepare(),p=f.api.inspectOriginalLegacyOccupancyMechanicalPlan(cap).component;assert.equal(snapshot(f.store.db),before);
  assert.equal(p.originals.vault.length,f.store.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n);for(const r of p.originals.vault)assert.equal(r.content,f.store.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(r.sha256).bytes);
  assert.equal(p.originals.events.length,f.store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n);for(const r of p.originals.events)assert.equal(r.content,f.store.db.prepare('SELECT value FROM events WHERE seq=?').get(r.seq).value);
  assert.deepEqual(Buffer.from(p.originals.sidecars[0].content,'base64'),Buffer.from([0,255,1,65]));assert.equal(p.historical_policy_applicability,'UNPROVED');assert.equal(p.original_policy_recipe,null);assert.equal(p.release_authority,false);assert.equal(p.authority_issued,false);
});
test('complete observed local closure never substitutes for original-policy applicability or releases original accounting',async t=>{
  const f=await fixture(t);f.addClosedFailure('SYNTHETIC-closed-failed');f.write('SYNTHETIC.missing-proof',s=>{s.jobs['SYNTHETIC-unconfirmed-QA']={id:'SYNTHETIC-unconfirmed-QA',status:'failed',role:'qa',native_id:'SYNTHETIC-unconfirmed-native'};});
  const p=f.api.inspectOriginalLegacyOccupancyMechanicalPlan(f.prepare()).component;assert.equal(p.current_derivative_observation.jobs.find(j=>j.job_id==='SYNTHETIC-closed-failed').local_occupied,false);assert.ok(p.partition.every(j=>j.local_occupied===true&&j.original_policy_applicability==='UNPROVED'&&j.original_policy_witness===null&&j.release_authority===false));
  const state=f.store.read();assert.equal(state.records['SYNTHETIC-old'].used_attempts,7);assert.equal(state.records['SYNTHETIC-old'].status,'expired');assert.equal(state.notices[0].status,'pending');assert.equal(state.jobs['SYNTHETIC-closed-failed'].status,'failed');
});
test('malformed originals are retained with unknown capacity and a Hold rather than zero occupancy',async t=>{
  const f=await fixture(t);f.write('SYNTHETIC.malformed',s=>{s.jobs['SYNTHETIC-malformed']={id:'DIFFERENT',status:'failed'};});const p=f.api.inspectOriginalLegacyOccupancyMechanicalPlan(f.prepare()).component;assert.equal(p.partition[0].capacity_known,false);assert.equal(p.partition[0].local_occupied,null);assert.equal(p.partition[0].original_policy_applicability,'UNPROVED');
});
test('original plan capability is opaque and full bounded pages reconstruct its exact canonical subject',async t=>{
  const f=await fixture(t),cap=f.prepare(),p=f.api.inspectOriginalLegacyOccupancyMechanicalPlan(cap);for(const fake of [{},p,JSON.parse(JSON.stringify(cap))])assert.throws(()=>f.api.inspectOriginalLegacyOccupancyMechanicalPlan(fake),e=>e.code==='LEGACY_OCCUPANCY_ORIGINAL_PLAN_REQUIRED');
  let offset=0,raw='';for(let i=0;i<1000;i++){const r=f.api.readOriginalLegacyOccupancyMechanicalPlan(cap,{component_sha256:p.component_sha256,offset,length:4096});raw+=r.text;if(r.complete)break;assert.ok(r.next_offset>offset);offset=r.next_offset;}
  assert.equal(hash(raw),p.component_sha256);assert.equal(raw,f.ledger.canonical(p.component));p.component.originals.vault=[];assert.notDeepEqual(f.api.inspectOriginalLegacyOccupancyMechanicalPlan(cap),p);
  assert.throws(()=>f.api.readOriginalLegacyOccupancyMechanicalPlan(cap,{component_sha256:'0'.repeat(64),offset:0,length:1}),e=>e.code==='LEGACY_OCCUPANCY_PLAN_CHANGED');
});
test('fixed source-cut provider Error and AggregateError identities propagate unchanged',async t=>{
  const f=await fixture(t);for(const sentinel of [Error('SYNTHETIC original failure'),new AggregateError([Error('SYNTHETIC member')],'SYNTHETIC aggregate')]){f.backend.setSYNTHETICProviderFailure(sentinel);assert.throws(()=>f.prepare(),e=>e===sentinel);}f.backend.setSYNTHETICProviderFailure(null);
});
test('unpaused original companies and active original work cannot enter source preparation',async t=>{
  const paused=await fixture(t);paused.write('SYNTHETIC.unpaused',s=>{s.paused=false;});assert.throws(paused.prepare,e=>e.code==='LEGACY_OCCUPANCY_PAUSED_REQUIRED');
  const active=await fixture(t);active.write('SYNTHETIC.active',s=>{s.jobs['SYNTHETIC-active']={id:'SYNTHETIC-active',status:'running'};});assert.throws(active.prepare,e=>e.code==='LEGACY_OCCUPANCY_ORIGINAL_CUT_CHANGED');
});
test('a closed correctly bound UNPROVED review reaches the missing native producer Hold, without fabricating native acceptance',async t=>{
  const f=await fixture(t),plan=f.recordPlan(f.prepare());f.recordReview(plan);const before=snapshot(f.store.db);assert.throws(f.validate,e=>e.code==='SYNTHETIC_NATIVE_QA_PRODUCER_UNAVAILABLE');assert.equal(snapshot(f.store.db),before);
});
test('Supported labels, fake historical witnesses, extra review keys and changed component references cannot qualify',async t=>{
  for(const mutate of [x=>{x.legacy_occupancy.original_policy_association='SUPPORTED';return x;},x=>{x.legacy_occupancy.original_policy_witness={verdict:'Pass',SYNTHETIC:true};return x;},x=>({...x,proved:true}),x=>{x.legacy_occupancy.component_sha256='0'.repeat(64);return x;}]){const f=await fixture(t),plan=f.recordPlan(f.prepare());f.recordReview(plan,mutate);assert.throws(f.validate,e=>e.code==='LEGACY_POLICY_HISTORICAL_PRODUCER_UNAVAILABLE'||e.code==='LEGACY_OCCUPANCY_PLAN_INVALID');}
});
test('tampered original policy archive and a relabeled component cannot be accepted even with matching outer hashes',async t=>{
  const f=await fixture(t),plan=f.recordPlan(f.prepare(),p=>{p.legacy_occupancy_component.policy_source.original_policy_qualified=true;p.legacy_occupancy_component_sha256=f.ledger.peerDigest(p.legacy_occupancy_component);return p;});f.recordReview(plan);assert.throws(f.validate,e=>e.code==='LEGACY_POLICY_SOURCE_CHANGED');
});
test('cold source validation rejects an omitted original job even when every component and review digest is recomputed',async t=>{
  const f=await fixture(t);f.addClosedFailure('SYNTHETIC-cannot-omit');
  const plan=f.recordPlan(f.prepare(),p=>{const c=p.legacy_occupancy_component;c.current_derivative_observation.jobs=[];c.partition=[];c.partition_sha256=f.ledger.peerDigest([]);p.legacy_occupancy_component_sha256=f.ledger.peerDigest(c);return p;});f.recordReview(plan);
  assert.throws(f.validate,e=>e.code==='LEGACY_OCCUPANCY_PARTITION_CHANGED');
});
test('an old outer plan without the exact component and an expired plan Hold before native QA',async t=>{
  for(const change of [p=>{delete p.legacy_occupancy_component;return p;},p=>{p.expires_at='2000-01-01T00:00:00.000Z';return p;}]){const f=await fixture(t),plan=f.recordPlan(f.prepare(),change);if(plan.legacy_occupancy_component)f.recordReview(plan);assert.throws(f.validate,e=>e.code==='LEGACY_OCCUPANCY_PLAN_INVALID'||e.code==='LEGACY_OCCUPANCY_PLAN_CHANGED');}
});
test('no caller DATA, Pass, plan cap or Boolean can enter the permanently held qualification writer',async t=>{
  const f=await fixture(t);let writes=0;const tx={put(){writes++;}},fakeLedger={write(){writes++;}};for(const cap of [{verdict:'Pass'},true,f.prepare(),{historical_policy_qualified:true}])assert.throws(()=>f.api.writeOriginalLegacyOccupancyQualificationFrom(cap,fakeLedger,tx),e=>e.code==='LEGACY_OCCUPANCY_ORIGINAL_REVIEW_REQUIRED');assert.equal(writes,0);
});
