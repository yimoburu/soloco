// FICTIONAL companies and SYNTHETIC child facts, never an actual CLI/native.
// Real SQLite/vault/storage journals and P1 are exercised. Canonical quarantine
// records below are test producers, not the missing production backend join.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {writeNormalized,captureStorageMetadata,insertStorageEvent} from '../plugins/soloco/runtime/record-storage.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {PeerLedger,installPeerSchema,canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {captureLegacyLocalWorkerOccupancyFrom as capture,inspectOriginalLegacyLocalWorkerOccupancy as inspect,inspectLegacyMaintenanceWorkerCapacityFrom as capacity} from '../plugins/soloco/runtime/peers/legacy-worker-occupancy.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const at='2026-01-01T00:00:00.000Z';
function snapshot(db){return JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,rows:db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()})));}
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-FICTIONAL-local-worker-')),directory=path.join(root,'.company');fs.mkdirSync(directory);const db=new DatabaseSync(path.join(directory,'company.sqlite'));
  t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
  db.exec("CREATE TABLE company(id TEXT PRIMARY KEY,value TEXT); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT,type TEXT,value TEXT); CREATE TABLE company_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL); INSERT INTO company_layout VALUES(1,4); CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL); CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL,encoding TEXT NOT NULL DEFAULT 'json',PRIMARY KEY(family,key));");
  let state={id:'FICTIONAL-'+path.basename(root),runtime_version:'0.7.8',paused:true,owner:{session_id:'SYNTHETIC-founder',epoch:1,host:'codex'},jobs:{},records:{old:{status:'expired',used_attempts:7,unknown_obligation:'Preserve original failed result and all old units.'}},notices:[{id:'SYNTHETIC-old-notice',status:'pending',summary:'Old uncertainty remains.'}],unrecognized_extension:{preserved:true}};
  const write=(type,change)=>{db.exec('BEGIN IMMEDIATE');try{const before=captureStorageMetadata(db),next=copy(state);change(next);writeNormalized(db,next);insertStorageEvent(db,type,{},before);db.exec('COMMIT');state=next;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}};
  write('fixture.created',()=>{});
  const start=id=>write('job.started',s=>{s.jobs[id]={id,instance_id:'SYNTHETIC-instance-'+id,worker_pid:123456,host:'codex',native_id:'SYNTHETIC-native-'+id,status:'running',started_at:at,task:'Fictional local worker proof',coordination:{resources:['SYNTHETIC-original-resource-'+id]}};});
  const invocation=(id,n=1,{closed=true,dual=false}={})=>{
    const j=state.jobs[id],i={invocation_id:'SYNTHETIC-invocation-'+n+'-'+id,job_id:id,instance_id:j.instance_id,worker_pid:j.worker_pid,host:j.host,requested_at:at};
    write('job.model_process.requested',s=>{requestModelProcess(s.jobs[id],i);if(dual)s.jobs[id].task='Unrelated concurrent field change must not qualify.';});
    const birth={protocol:'ordinary-model-process-birth-v1',launch_id:'SYNTHETIC-launch-'+n+'-'+id,host:'codex',pid:654321,worker_pid:j.worker_pid,spawned_at:at,command_sha256:digest('SYNTHETIC-command'),argv_sha256:digest('SYNTHETIC-argv'),cwd_sha256:digest(root)};
    write('job.model_process.born',s=>recordModelProcessBirth(s.jobs[id],i,birth));
    if(closed)write('job.model_process.closed',s=>recordModelProcessClosure(s.jobs[id],i,birth,{protocol:'ordinary-model-process-close-v1',birth_sha256:digest(JSON.stringify(birth)),closed_at:at,exit_code:17,signal:null,observation:'original-child-close'}));
  };
  const finish=(id,{status='failed',release=true}={})=>write(status==='completed'?'job.completed':'job.failed',s=>{const j=s.jobs[id];j.status=status;j.finished_at=at;j.execution_failure={code:'SYNTHETIC_TIMEOUT',termination_confirmed:false};if(release)j.coordination_release={termination_confirmed:true,reason:'model_process_closed',at};});
  const add=(id,options={})=>{start(id);invocation(id,1,{closed:options.closed!==false,dual:options.dual===true});finish(id,{status:options.status??'failed',release:options.release??options.closed!==false});};
  const readCapture=()=>{db.exec('BEGIN');try{return inspect(capture(db));}finally{db.exec('ROLLBACK');}};
  const quarantine=({projection=null,extras=[],workerCap=3,recordChange=v=>v,outerType='origin.quarantined',attach=true,slotChange=v=>v,omitLegacy=[]}={})=>{
    db.exec('BEGIN IMMEDIATE');try{
      const current=inspect(capture(db)),selected=projection??current;installPeerSchema(db,{company_id:state.id,legacy_snapshot_sha256:digest('SYNTHETIC-original-backup')});db.exec('UPDATE company_layout SET version=5 WHERE id=1');
      for(const table of ['company','events','state_entries','immutable_values','company_layout'])for(const op of ['insert','update','delete'])db.exec(`CREATE TRIGGER peer_origin_legacy_${table}_${op} BEFORE ${op.toUpperCase()} ON ${table} BEGIN SELECT RAISE(ABORT,'Original legacy writer retired: origin quarantine'); END`);
      const ledger=new PeerLedger(root,{connection:db});let recordRef,originRef;
      ledger.writeWithin(outerType,'founder',tx=>{
        const originId='origin:SYNTHETIC',planId='SYNTHETIC-reviewed-plan',planHash=digest('SYNTHETIC-plan'),sourceCut=digest('SYNTHETIC-complete-origin-cut');
        const record=tx.put('work_items','SYNTHETIC-local-occupancy',recordChange({kind:'legacy_local_worker_occupancy',protocol:'legacy-local-worker-occupancy-record-v1',origin_id:originId,plan_id:planId,plan_sha256:planHash,source_cut_sha256:sourceCut,projection:selected,projection_sha256:peerDigest(selected),release_authority:false,whole_domain_qualified:false}),0);recordRef=ref('work_items',record);
        const included=current.jobs.filter(j=>!omitLegacy.includes(j.job_id)),ids=included.map(j=>'legacy-origin-slot:'+peerDigest(j.job_id));
        const origin=tx.put('control','origin',{protocol:'peer-origin-quarantine-v1',id:originId,company_id:state.id,plan_id:planId,plan_sha256:planHash,current_cut_sha256:sourceCut,legacy_unknown_reservations:ids,maintenance:{used_model_calls:2,max_model_calls:4,used_review_calls:1,max_review_calls:2},...(attach?{legacy_worker_occupancy_ref:recordRef}:{})},0);originRef=ref('control',origin);
        tx.put('control','company',{protocol:'peer-cos-v1',paused:true,origin:originRef,policy:{worker_cap:workerCap}},0);tx.put('control','usage',{model_calls:2},0);
        for(const j of included)tx.put('slots','legacy-origin-slot:'+peerDigest(j.job_id),slotChange({kind:'legacy_origin_reservation',origin_id:originId,job_id:j.job_id,status:'unknown',capacity_known:j.capacity_known,original_unit:'legacy-standalone-assignment',original_status:state.jobs[j.job_id]?.status,source:j.source,local_release_proof:j.local_release_proof??null,release_authority:false}),0);
        for(const [n,value]of extras.entries())tx.put('slots','SYNTHETIC-new-slot-'+n,{kind:'origin_maintenance_execution',status:'active',capacity_known:true,...value},0);
        tx.event('origin.paused_quarantine_committed',{origin_ref:originRef,ordinary_authority:false});
      });db.exec('COMMIT');return {ledger,recordRef,originRef,current};
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  };
  return {root,db,write,start,invocation,finish,add,readCapture,quarantine,state:()=>copy(state)};
}

test('genuine fixture lineage qualifies failed and completed local children equally without semantic success',t=>{
  const f=fixture(t);f.add('failed');f.add('completed',{status:'completed'});const before=snapshot(f.db),p=f.readCapture();assert.equal(snapshot(f.db),before);
  assert.equal(p.jobs.length,2);for(const j of p.jobs){assert.equal(j.local_occupied,false);assert.equal(j.local_release_proof.proved,true);assert.equal(j.local_release_proof.whole_domain_qualified,false);assert.equal(j.release_authority,false);}
  assert.equal(f.state().jobs.failed.status,'failed');assert.equal(f.state().jobs.failed.execution_failure.termination_confirmed,false);assert.equal(p.policy_recipe.worker_cap,3);assert.equal(p.authority_issued,false);assert.equal(p.release_authority,false);
});
test('the fixed producer captures full job/event/vault inventory, not a selected or reconstructed proof',t=>{
  const f=fixture(t);f.add('one');f.add('QA-unconfirmed',{closed:false});const p=f.readCapture();
  assert.equal(p.sources.length,f.db.prepare('SELECT COUNT(*) AS n FROM state_entries').get().n);assert.equal(p.events.length,f.db.prepare('SELECT COUNT(*) AS n FROM events').get().n);assert.equal(p.archive.length,f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n);assert.equal(p.jobs.length,2);
  assert.equal(p.jobs.find(j=>j.job_id==='QA-unconfirmed').local_occupied,true);
  f.db.exec('BEGIN');try{assert.throws(()=>capture(f.db,{jobs:[],proved:true}),e=>e.code==='LEGACY_WORKER_INPUT');const cap=capture(f.db);for(const fake of [{},JSON.parse(JSON.stringify(cap)),p])assert.throws(()=>inspect(fake),e=>e.code==='LEGACY_WORKER_ORIGINAL_CAPTURE_REQUIRED');const mutable=inspect(cap);mutable.jobs=[];assert.equal(inspect(cap).jobs.length,2);}finally{f.db.exec('ROLLBACK');}
});
test('seven closed failures preserve UNKNOWN slots while actual unconfirmed QA and both new lanes share the same cap',t=>{
  const f=fixture(t);for(let i=0;i<7;i++)f.add('failed-'+i);f.add('QA-unconfirmed',{closed:false});
  const {ledger}=f.quarantine({extras:[{kind:'input_frontier_execution',status:'unknown'}]}),before=snapshot(f.db),r=ledger.read(tx=>capacity(ledger,tx));
  assert.equal(r.worker_cap,3);assert.equal(r.occupied,2);assert.equal(r.remaining,1);assert.equal(r.admission_available,true);assert.equal(r.legacy.length,8);assert.equal(r.old_reservations_released,false);assert.equal(r.authority_issued,false);assert.equal(snapshot(f.db),before);
  ledger.read(tx=>{for(const s of tx.list('slots').items.filter(r=>r.value.kind==='legacy_origin_reservation')){assert.equal(s.value.status,'unknown');assert.equal(s.value.release_authority,false);}assert.equal(tx.get('control','usage').value.model_calls,2);assert.equal(tx.get('control','origin').value.maintenance.used_review_calls,1);});
});
test('all active and UNKNOWN new slots count, and no second capacity pool appears',t=>{
  const f=fixture(t);f.add('closed');f.add('unconfirmed',{closed:false});const {ledger}=f.quarantine({extras:[{kind:'origin_maintenance_execution',status:'active'},{kind:'input_frontier_execution',status:'unknown'}]});const r=ledger.read(tx=>capacity(ledger,tx));assert.equal(r.occupied,3);assert.equal(r.remaining,0);assert.equal(r.admission_available,false);assert.equal(r.new_execution_refs.length,2);
});
test('a runtime-task-only unproved legacy job is counted even if an old importer omitted its slot',t=>{
  const f=fixture(t);f.write('fixture.unproved-runtime',s=>{s.jobs.only={id:'only',status:'failed',runtime_task:{task_id:'SYNTHETIC-task'}};});const {ledger}=f.quarantine({omitLegacy:['only']});const r=ledger.read(tx=>capacity(ledger,tx));assert.equal(r.occupied,1);assert.equal(r.remaining,2);
});
test('queued/running never become free from a release-looking current Boolean',t=>{
  for(const status of ['queued','running']){const f=fixture(t);f.add(status);f.write('fixture.active',s=>{s.jobs[status].status=status;});assert.equal(f.readCapture().jobs[0].local_occupied,true);}
});
test('missing attempt metadata or a bare release Boolean is not proof of nonoccupancy',t=>{
  const f=fixture(t);f.write('fixture.unproved',s=>{s.jobs.missing={id:'missing',status:'failed'};s.jobs.boolean={id:'boolean',status:'failed',native_id:'SYNTHETIC-only-label',coordination_release:{termination_confirmed:true,reason:'model_process_closed'}};});for(const j of f.readCapture().jobs)assert.equal(j.local_occupied,true);
});
test('a genuine persisted reconciliation qualifies local capacity while keeping the original failure',t=>{
  const f=fixture(t);f.add('late',{release:false});assert.equal(f.readCapture().jobs[0].local_occupied,true);f.write('job.process_closure_reconciled',s=>{s.jobs.late.coordination_release={termination_confirmed:true,reason:'model_process_closed',at};});const p=f.readCapture();assert.equal(p.jobs[0].local_occupied,false);assert.equal(f.state().jobs.late.status,'failed');assert.equal(f.state().jobs.late.execution_failure.termination_confirmed,false);
});
test('all invocations require original ordered producer lineage; earlier closure cannot cover a later attempt',t=>{
  const f=fixture(t);f.start('two');f.invocation('two',1);f.invocation('two',2,{closed:false});f.finish('two');assert.equal(f.readCapture().jobs[0].local_occupied,true);
});
test('a shaped extra invocation without corresponding producer events remains occupied',t=>{
  const f=fixture(t);f.add('extra');f.write('job.failed',s=>{const j=s.jobs.extra,e=copy(j.model_process_tracking.invocations[0]);e.invocation_id='SYNTHETIC-unproduced-extra';j.model_process_tracking.invocations.push(e);j.model_process_tracking.current=e.invocation_id;});assert.equal(f.readCapture().jobs[0].local_occupied,true);
});
test('dual-field process transitions cannot qualify a local release',t=>{const f=fixture(t);f.add('dual',{dual:true});assert.equal(f.readCapture().jobs[0].local_occupied,true);});
test('canonical encoded job identities are preserved without collapsing literal-prefix or Unicode keys',t=>{
  const f=fixture(t);for(const id of ['~json:literal','雪😀'])f.add(id);const p=f.readCapture();assert.deepEqual(p.jobs.map(j=>j.job_id).sort(),['~json:literal','雪😀'].sort());assert.ok(p.jobs.every(j=>!j.local_occupied));assert.ok(p.jobs.find(j=>j.job_id==='~json:literal').source.key.startsWith('~json:'));
});
test('missing or unsupported runtime policy version holds rather than using compatible-version inference',t=>{
  for(const version of [null,'0.7.7','0.8.0']){const f=fixture(t);f.write('fixture.version',s=>{if(version===null)delete s.runtime_version;else s.runtime_version=version;});const before=snapshot(f.db);assert.throws(()=>f.readCapture(),e=>e.code==='LEGACY_WORKER_POLICY_UNAVAILABLE');assert.equal(snapshot(f.db),before);}
});
test('malformed original job yields unknown capacity and blocks the shared consumer',t=>{
  const f=fixture(t);f.write('fixture.malformed',s=>{s.jobs.bad={id:'other',status:'failed',native_id:'SYNTHETIC'};});assert.equal(f.readCapture().jobs[0].capacity_known,false);const {ledger}=f.quarantine();const before=snapshot(f.db);assert.throws(()=>ledger.read(tx=>capacity(ledger,tx)),e=>e.code==='LEGACY_WORKER_RESERVATION_UNQUALIFIED');assert.equal(snapshot(f.db),before);
});
test('original provider errors, including lookalike codes and AggregateError members, propagate unchanged',t=>{
  const f=fixture(t);f.add('provider');const child=Object.assign(Error('SYNTHETIC child EIO'),{code:'LEGACY_WORKER_LOCAL_PROOF'}),aggregate=new AggregateError([child],'SYNTHETIC aggregate',{cause:child});
  for(const error of [child,aggregate,new SyntaxError('SYNTHETIC provider syntax')]){const prepare=f.db.prepare;f.db.prepare=function(sql,...args){if(sql.startsWith('SELECT family,key'))throw error;return prepare.call(this,sql,...args);};try{assert.throws(()=>f.readCapture(),value=>value===error);}finally{f.db.prepare=prepare;}}
  assert.strictEqual(aggregate.cause,child);assert.strictEqual(aggregate.errors[0],child);
});
test('vault tampering prevents local occupancy qualification',t=>{
  const f=fixture(t);f.add('bad-vault');f.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=(SELECT sha256 FROM state_entries WHERE family=\'jobs\' LIMIT 1)').run('{}');const before=snapshot(f.db);assert.throws(()=>f.readCapture(),e=>e.code==='LEGACY_WORKER_VAULT_CHANGED');assert.equal(snapshot(f.db),before);
});
test('raw event delta tampering retains occupancy instead of inventing a proved release',t=>{
  const f=fixture(t);f.add('bad-event');const e=f.db.prepare("SELECT seq,value FROM events WHERE type='job.model_process.closed'").get(),v=JSON.parse(e.value);v.storage_delta.sha256='0'.repeat(64);f.db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(v),e.seq);assert.equal(f.readCapture().jobs[0].local_occupied,true);
});
test('the real event-count bound holds before attempting a partial archived proof',t=>{
  const f=fixture(t);f.db.exec('BEGIN');const insert=f.db.prepare('INSERT INTO events(seq,at,type,value) VALUES(?,?,?,?)');for(let n=2;n<=10001;n++)insert.run(n,at,'SYNTHETIC-bound','{}');f.db.exec('COMMIT');const before=snapshot(f.db);assert.throws(()=>f.readCapture(),e=>e.code==='LEGACY_WORKER_PREPARATION_CAPACITY');assert.equal(snapshot(f.db),before);
});
test('a matching DATA projection or plan label cannot replace the full current original inventory',t=>{
  const f=fixture(t);f.add('closed');const old=f.readCapture();f.add('new-QA',{closed:false});const {ledger}=f.quarantine({projection:old});assert.throws(()=>ledger.read(tx=>capacity(ledger,tx)),e=>e.code==='LEGACY_WORKER_SOURCE_CHANGED');
});
test('missing backend join and wrong producer/plan records hold',t=>{
  for(const options of [{attach:false},{outerType:'fixture.forged-producer'},{recordChange:v=>({...v,plan_sha256:'0'.repeat(64)})},{recordChange:v=>({...v,release_authority:true})}]){const f=fixture(t);f.add('closed');const {ledger}=f.quarantine(options),before=snapshot(f.db);assert.throws(()=>ledger.read(tx=>capacity(ledger,tx)));assert.equal(snapshot(f.db),before);}
});
test('all P1 slot metadata is checked even when a caller view claims an empty complete page',t=>{
  const f=fixture(t);f.add('closed');const {ledger}=f.quarantine({extras:[{status:'unknown'}]});assert.throws(()=>ledger.read(tx=>capacity(ledger,{...tx,list:()=>({items:[],total:0,complete:true,next_cursor:null})})),e=>e.code==='LEGACY_WORKER_SLOT_INVENTORY');
});
test('the planned maintenance view may omit total but cannot omit any physical slot',t=>{
  const f=fixture(t);f.add('closed');const {ledger}=f.quarantine();const r=ledger.read(tx=>capacity(ledger,{...tx,list:(...args)=>{const {total,...page}=tx.list(...args);return page;}}));assert.equal(r.occupied,0);assert.equal(r.remaining,3);
});
test('unqualified capacity, changed UNKNOWN status or an increased cap cannot create a free slot',t=>{
  for(const options of [{extras:[{capacity_known:false,status:'unknown'}]},{slotChange:v=>({...v,status:'released'})},{workerCap:4}]){const f=fixture(t);f.add('closed');const {ledger}=f.quarantine(options);assert.throws(()=>ledger.read(tx=>capacity(ledger,tx)));}
});
test('the shared view remains read-only and preserves original provider error identity',t=>{
  const f=fixture(t);f.add('closed');const {ledger}=f.quarantine(),error=Object.assign(Error('SYNTHETIC source provider error'),{code:'LEGACY_WORKER_SLOT_INVENTORY'}),before=snapshot(f.db);assert.throws(()=>ledger.read(tx=>capacity(ledger,{...tx,list:()=>{throw error;}})),value=>value===error);assert.equal(snapshot(f.db),before);
});
test('a provider-shaped view cannot replace the physically committed company policy',t=>{
  const f=fixture(t);f.add('closed');const {ledger}=f.quarantine({workerCap:1});
  assert.throws(()=>ledger.read(tx=>capacity(ledger,{...tx,get:(family,id)=>{const row=tx.get(family,id);if(family==='control'&&id==='company'){const value={...row.value,policy:{worker_cap:3}};return {...row,value,sha256:peerDigest(value)};}return row;}})),e=>e.code==='LEGACY_WORKER_PHYSICAL_BINDING');
});
test('a provider-shaped event cannot relabel a different canonical writer as quarantine',t=>{
  const f=fixture(t);f.add('closed');const {ledger}=f.quarantine({outerType:'fixture.unqualified-origin'});
  assert.throws(()=>ledger.read(tx=>capacity(ledger,{...tx,events:args=>{const page=tx.events(args);return {...page,items:page.items.map(e=>({...e,type:'origin.quarantined'}))};}})),e=>e.code==='LEGACY_WORKER_PHYSICAL_BINDING');
});
test('expanded current-reference volume is bounded independently of deduplicated vault bytes',t=>{
  const f=fixture(t),bytes=JSON.stringify('SYNTHETIC-expanded-'.repeat(60000)),sha=digest(bytes);f.db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(sha,bytes);const insert=f.db.prepare("INSERT INTO state_entries VALUES('root',?,?,?,'json')");for(let n=0;n<80;n++)insert.run('SYNTHETIC-shared-'+n,1000+n,sha);
  assert.ok(f.db.prepare('SELECT SUM(length(CAST(bytes AS BLOB))) AS n FROM immutable_values').get().n<64*1024*1024);const before=snapshot(f.db);assert.throws(()=>f.readCapture(),e=>e.code==='LEGACY_WORKER_PREPARATION_CAPACITY');assert.equal(snapshot(f.db),before);
});
