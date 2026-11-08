import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {canonical,PeerLedger,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerFixture} from './peer-fixture.mjs';

function mutate(f,sql){const db=new DatabaseSync(f.file);try{db.exec(sql);}finally{db.close();}}
function snapshot(f){const db=new DatabaseSync(f.file);try{return Object.fromEntries(['peer_rows','peer_versions','peer_generations','peer_membership','peer_events','peer_outbox','peer_meta'].map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));}finally{db.close();}}

test('canonical JSON preserves prototype-named keys and rejects silent data loss',()=>{
 const v=JSON.parse('{"__proto__":{"safe":true},"constructor":"value","a":1}');
 assert.deepEqual(JSON.parse(canonical(v)),v);
 assert.notEqual(peerDigest(v),peerDigest({a:1,constructor:'value'}));
 const sparse=[];sparse.length=1;
 const extra=[];extra.named=1;
 const hidden={};Object.defineProperty(hidden,'x',{value:1});
 const accessor={};let accessed=false;Object.defineProperty(accessor,'x',{enumerable:true,get(){accessed=true;return 1;}});
 const symbol={a:1};symbol[Symbol('hidden')]=1;
 const cycle={};cycle.self=cycle;
 for(const bad of [undefined,NaN,Infinity,-0,1n,()=>{},new Date(),sparse,extra,hidden,accessor,symbol,cycle,{a:undefined},[undefined]])assert.throws(()=>canonical(bad));
 assert.equal(accessed,false);
 assert.equal(canonical({b:2,a:1}),'{'+'"a":1,"b":2}');
});

test('CAS rollback includes versions, memberships, generations, outbox and head',()=>{
 const f=peerFixture();try{
  const row=f.ledger.write('task.proposed','cos-a',tx=>tx.put('tasks','task-a',{state:'planned',principal_id:'cos-a',scope:'repo/app'},0));
  assert.equal(row.revision,1);assert.equal(row.sha256,peerDigest(row.value));
  assert.deepEqual(f.ledger.read(tx=>tx.get('tasks','task-a')),row);
  const before=snapshot(f);
  assert.throws(()=>f.ledger.write('stale','cos-a',tx=>{
   tx.put('notices','notice-a',{status:'unresolved',scope:'*'},0);
   tx.event('notice.created',{id:'notice-a'});
   tx.put('tasks','task-a',{state:'accepted'},0);
  }),/revision conflict/);
  assert.deepEqual(snapshot(f),before);
  assert.equal(f.ledger.read(tx=>tx.get('notices','notice-a')),null);
  const page=f.ledger.events();assert.equal(page.items.length,2);assert.equal(page.complete,true);
  assert.equal(page.items[1].payload.changes[0].id,'task-a');
  for(const sql of ["UPDATE peer_versions SET bytes='{}' WHERE family='tasks'",'DELETE FROM peer_versions',"UPDATE peer_events SET type='forged'",'DELETE FROM peer_events'])assert.throws(()=>mutate(f,sql),/immutable/);
 }finally{f.close();}
});

test('two connections cannot publish from one revision',()=>{
 const f=peerFixture(),other=new PeerLedger(f.root);try{
  f.ledger.write('home.initial','founder',tx=>tx.put('homes','home-a',{scope:'domain-a',content:'initial'},0));
  const a=f.ledger.read(tx=>tx.get('homes','home-a')),b=other.read(tx=>tx.get('homes','home-a'));
  f.ledger.write('home.a','cos-a',tx=>tx.put('homes','home-a',{scope:'domain-a',content:'first'},a.revision));
  assert.throws(()=>other.write('home.b','cos-b',tx=>tx.put('homes','home-a',{scope:'domain-a',content:'second'},b.revision)),/revision conflict/);
  assert.equal(other.read(tx=>tx.get('homes','home-a')).value.content,'first');
 }finally{other.close();f.close();}
});

test('transaction handles expire after success, failure, and delayed callbacks',async()=>{
 const f=peerFixture();try{
  let handle;
  const before=snapshot(f);
  f.ledger.read(tx=>{handle=tx;});
  const operations=[()=>handle.get('tasks','x'),()=>handle.list('tasks'),()=>handle.count('tasks'),()=>handle.events(),()=>handle.resolveLegacy({sha256:'0'.repeat(64)}),()=>handle.put('tasks','x',{},0),()=>handle.event('late',{})];
  for(const op of operations)assert.throws(op,/expired/);
  assert.throws(()=>f.ledger.write('failure','cos-a',tx=>{handle=tx;tx.put('tasks','x',{},0);throw Error('deliberate');}),/deliberate/);
  assert.throws(()=>handle.put('tasks','late',{},0),/expired/);
  let delayed;
  f.ledger.write('schedule','cos-a',tx=>{delayed=Promise.resolve().then(()=>assert.throws(()=>tx.put('tasks','late',{},0),/expired/));});
  await delayed;
  f.ledger.write('new.transaction','cos-a',()=>assert.throws(()=>handle.get('tasks','x'),/expired/));
  assert.deepEqual(snapshot(f),before);
 }finally{f.close();}
});

test('async functions are rejected before invocation and thenables roll back',async()=>{
 const f=peerFixture();try{
  let entered=false;const before=snapshot(f);
  assert.throws(()=>f.ledger.write('bad.async','cos-a',async tx=>{entered=true;tx.put('tasks','bad',{},0);}),/asynchronous work/);
  assert.equal(entered,false);
  let continuation;
  assert.throws(()=>f.ledger.write('promise','cos-a',tx=>{
   tx.put('tasks','bad',{},0);
   continuation=Promise.resolve().then(()=>assert.throws(()=>tx.put('tasks','late',{},0),/expired/));
   return continuation;
  }),/asynchronous work/);
  await continuation;
  assert.throws(()=>f.ledger.write('thenable','cos-a',tx=>{tx.put('tasks','bad',{},0);return {then(){}};}),/asynchronous work/);
  assert.throws(()=>f.ledger.read(tx=>tx.put('tasks','read-write',{},0)),/cannot write/);
  assert.deepEqual(snapshot(f),before);
 }finally{f.close();}
});

test('no-op writes create no event and repeated same-row writes preserve exact versions',()=>{
 const f=peerFixture();try{
  const before=snapshot(f);
  f.ledger.write('unchanged','founder',tx=>{const c=tx.get('control','company');tx.put('control',c.id,c.value,c.revision);});
  assert.deepEqual(snapshot(f),before);
  f.ledger.write('two.revisions','cos-a',tx=>{
   const one=tx.put('tasks','x',{state:'planned'},0);one.value.state='mutated';
   assert.equal(tx.get('tasks','x').value.state,'planned');
   tx.put('tasks','x',{state:'completed'},1);
  });
  assert.equal(f.ledger.read(tx=>tx.get('tasks','x')).revision,2);
  assert.equal(f.ledger.verify().complete,true);
 }finally{f.close();}
});

test('filtered pagination is explicit, exact, and invalidated by writes',()=>{
 const f=peerFixture();try{
  f.ledger.write('homes','founder',tx=>{for(const id of ['a','b','c'])tx.put('homes',id,{scope:'*',status:'accepted',content:id},0);tx.put('homes','z',{scope:'other',status:'accepted'},0);});
  const p=f.ledger.read(tx=>tx.list('homes',{scope:'*',status:'accepted',limit:1}));
  assert.equal(p.complete,false);assert.equal(p.total,3);assert.equal(p.items[0].id,'a');
  const q=f.ledger.read(tx=>tx.list('homes',{scope:'*',status:'accepted',limit:1,cursor:p.next_cursor}));
  assert.equal(q.items[0].id,'b');assert.equal(q.complete,false);
  const r=f.ledger.read(tx=>tx.list('homes',{scope:'*',status:'accepted',limit:1,cursor:q.next_cursor}));
  assert.equal(r.items[0].id,'c');assert.equal(r.complete,true);assert.equal(r.next_cursor,null);assert.equal(r.total,3);
  const empty=f.ledger.read(tx=>tx.list('homes',{scope:'absent'}));assert.deepEqual(empty,{items:[],total:0,complete:true,next_cursor:null});
  assert.throws(()=>f.ledger.read(tx=>tx.list('homes',{scope:'other',cursor:p.next_cursor})),/mismatched/);
  f.ledger.write('new.home','founder',tx=>tx.put('homes','d',{scope:'*',status:'accepted'},0));
  assert.throws(()=>f.ledger.read(tx=>tx.list('homes',{scope:'*',status:'accepted',cursor:q.next_cursor})),/Stale/);
  mutate(f,"DELETE FROM peer_rows WHERE family='homes' AND id='b'");
  assert.throws(()=>f.ledger.read(tx=>tx.list('homes',{scope:'*',status:'accepted'})),/membership is incomplete/);
  assert.throws(()=>f.ledger.read(tx=>tx.get('homes','b')),/history remains/);
 }finally{f.close();}
});

test('filtered membership overflow fails closed with an actual bounded SQL scan',()=>{
 const queries=[],f=peerFixture({onQuery:q=>queries.push(q.sql)});try{
  // Corruption fixture: overfill canonical index without adding valid history.
  // A list must reject capacity before returning any unverified row.
  const db=new DatabaseSync(f.file);try{
   db.exec("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO peer_rows SELECT 'tasks',printf('bulk-%05d',x),1,'invalid','{}',1,'planned','','','bulk' FROM n");
  }finally{db.close();}
  queries.length=0;
  assert.throws(()=>f.ledger.read(tx=>tx.list('tasks',{status:'planned',limit:1})),/overflow/);
  assert.ok(queries.some(q=>q.includes('SELECT COUNT(*) AS n FROM (SELECT 1 FROM peer_rows')&&q.includes('LIMIT ?')));
  assert.ok(!queries.some(q=>q.startsWith('SELECT * FROM peer_rows')));
  assert.throws(()=>f.ledger.read(tx=>tx.count('tasks',{status:'planned'})),/overflow/);
 }finally{f.close();}
});

test('selected reads reject row hash, index, revision, creation and immutable-byte tampering',()=>{
 for(const sql of [
  "UPDATE peer_rows SET bytes='{}' WHERE family='principals' AND id='cos-a'",
  "UPDATE peer_rows SET scope='wrong' WHERE family='principals' AND id='cos-a'",
  "UPDATE peer_rows SET revision=99 WHERE family='principals' AND id='cos-a'",
  "UPDATE peer_rows SET created_seq=999 WHERE family='principals' AND id='cos-a'",
  "DROP TRIGGER peer_history_update; UPDATE peer_versions SET bytes='{}' WHERE family='principals' AND id='cos-a'"
 ]){
  const f=peerFixture();try{mutate(f,sql);assert.throws(()=>f.ledger.read(tx=>tx.get('principals','cos-a')),/hash|index|version|metadata/);}finally{f.close();}
 }
});

test('event hash, chain, head, missing history and metadata corruption fail closed',()=>{
 for(const sql of [
  "DROP TRIGGER peer_events_update; UPDATE peer_events SET type='forged' WHERE seq=1",
  "DROP TRIGGER peer_events_update; UPDATE peer_events SET bytes='{}' WHERE seq=1",
  "DROP TRIGGER peer_events_update; UPDATE peer_events SET previous_sha256='wrong' WHERE seq=1",
  "DROP TRIGGER peer_events_delete; DELETE FROM peer_outbox WHERE seq=1; DELETE FROM peer_events WHERE seq=1",
  "UPDATE peer_meta SET last_event_sha256='wrong'",
  "UPDATE peer_meta SET company_id='other'",
  "DROP TRIGGER peer_history_update; UPDATE peer_versions SET bytes='{}' WHERE family='control'"
 ]){
  const f=peerFixture();try{mutate(f,sql);assert.throws(()=>f.ledger.verify());}finally{f.close();}
 }
 const f=peerFixture();try{
  mutate(f,"UPDATE peer_meta SET last_event_sha256='wrong'");
  const before=snapshot(f);
  assert.throws(()=>f.ledger.write('bad.head','founder',tx=>tx.put('tasks','x',{},0)),/event head/);
  assert.deepEqual(snapshot(f),before);
  // Failed transaction setup must release its transaction and lifecycle flag.
  mutate(f,"UPDATE peer_meta SET last_event_sha256=(SELECT sha256 FROM peer_events ORDER BY seq DESC LIMIT 1)");
  assert.equal(f.ledger.verify().complete,true);
 }finally{f.close();}
});

test('event pagination retains chain continuity and terminal semantics',()=>{
 const f=peerFixture();try{
  for(let i=0;i<3;i++)f.ledger.write('event','cos-a',tx=>tx.event('step',{i}));
  const a=f.ledger.events({limit:2});assert.equal(a.complete,false);assert.equal(a.total,4);
  const b=f.ledger.events({after:a.next_cursor,limit:2});assert.equal(b.complete,true);assert.equal(b.next_cursor,4);
  assert.equal(b.items[0].previous_sha256,a.items[1].sha256);
  assert.deepEqual(f.ledger.events({after:4}),{items:[],complete:true,next_cursor:4,total:4});
  assert.throws(()=>f.ledger.events({after:5}),/unavailable/);
 }finally{f.close();}
});

test('writeWithin requires a real external transaction and participates in outer rollback',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file),shared=new PeerLedger(f.root,{connection:db});
 try{
  assert.equal(typeof db.isTransaction,'boolean','Runtime must expose SQLite transaction state; no emulated migration pass');
  assert.throws(()=>shared.writeWithin('migration','founder',tx=>tx.put('tasks','x',{},0)),/Active external transaction/);
  assert.throws(()=>f.ledger.writeWithin('migration','founder',()=>{}),/External migration/);
  const before=snapshot(f);let handle;
  db.exec('BEGIN IMMEDIATE');
  db.exec('CREATE TABLE fictional_migration_marker(value TEXT)');
  shared.writeWithin('migration','founder',tx=>{handle=tx;tx.put('tasks','x',{state:'planned'},0);});
  assert.equal(db.isTransaction,true);
  assert.throws(()=>handle.get('tasks','x'),/expired/);
  assert.equal(f.ledger.read(tx=>tx.get('tasks','x')),null);
  db.exec('ROLLBACK');
  assert.deepEqual(snapshot(f),before);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='fictional_migration_marker'").get(),undefined);
  db.exec('BEGIN IMMEDIATE');
  db.exec('CREATE TABLE fictional_migration_marker(value TEXT)');
  assert.throws(()=>shared.writeWithin('failed.migration','founder',tx=>{tx.put('tasks','failed',{},0);throw Error('abort migration write');}),/abort migration/);
  assert.equal(db.isTransaction,true);
  assert.equal(db.prepare("SELECT 1 FROM peer_rows WHERE family='tasks' AND id='failed'").get(),undefined);
  shared.writeWithin('migration','founder',tx=>tx.put('tasks','committed',{state:'planned'},0));
  db.exec('COMMIT');
  assert.equal(f.ledger.read(tx=>tx.get('tasks','committed')).revision,1);
  assert.equal(f.ledger.verify().complete,true);
 }finally{if(db.isTransaction)db.exec('ROLLBACK');shared.close();db.close();f.close();}
});

test('selected hot reads do not hydrate unrelated historical bodies',()=>{
 const queries=[],f=peerFixture({onQuery:q=>queries.push(q.sql)});try{
  f.ledger.write('history','founder',tx=>{for(let i=0;i<1000;i++)tx.put('tasks','history-'+i,{state:'completed',scope:'old',content:'x'.repeat(1000)},0);});
  f.ledger.write('ready','founder',tx=>tx.put('tasks','ready',{state:'planned',scope:'new',principal_id:'cos-a'},0));
  queries.length=0;
  const page=f.ledger.read(tx=>tx.list('tasks',{status:'planned',limit:10}));
  assert.equal(page.items.length,1);assert.equal(page.complete,true);assert.equal(page.total,1);assert.equal(page.items[0].id,'ready');
  assert.ok(queries.filter(sql=>sql.includes('FROM peer_versions')).every(sql=>sql.includes('family=? AND id=?')));
  assert.ok(queries.filter(sql=>sql.includes('SELECT * FROM peer_rows')).every(sql=>sql.includes('status IN')));
  assert.ok(queries.length<20,JSON.stringify(queries));
 }finally{f.close();}
});

// Historical lookup proves exact bytes, not event membership or current authority.
import {createHash as historyCreateHash} from 'node:crypto';
const historyReference=(row,family='tasks')=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const historyBytesHash=bytes=>historyCreateHash('sha256').update(bytes).digest('hex');

test('historical lookup returns the exact old version with detached values and keyed access',()=>{
 const queries=[],f=peerFixture({onQuery:q=>queries.push(q)});try{
  const value={state:'planned',payload:JSON.parse('{"__proto__":{"safe":true},"constructor":"own","items":[1,2]}')};
  const old=f.ledger.write('history.old','cos-a',tx=>tx.put('tasks','history-target',value,0));
  const latest=f.ledger.write('history.new','cos-b',tx=>tx.put('tasks',old.id,{state:'completed',payload:{changed:true}},old.revision));
  const ref=historyReference(old),before=snapshot(f);
  assert.equal(typeof f.ledger.getVersion,'undefined');
  f.ledger.read(tx=>{
   assert.equal(Object.isFrozen(tx),true);
   assert.deepEqual(tx.get('tasks',old.id),latest);
   queries.length=0;
   const historical=tx.getVersion(ref);
   assert.deepEqual(historical,{...ref,value});
   assert.deepEqual(Object.keys(historical).sort(),['family','id','revision','sha256','value']);
   assert.equal(queries.length,1,'historical lookup performs one keyed query');
   assert.match(queries[0].sql,/FROM peer_versions WHERE family=\? AND id=\? AND revision=\?/);
   // onQuery observes query(sql) at preparation, not the later StatementSync.get bindings.
   assert.equal(queries[0].parameters,0,'preparation telemetry does not measure bound argument count');
   assert.doesNotMatch(queries[0].sql,/ORDER BY|JOIN|peer_rows|peer_events/);
   historical.value.payload.__proto__.safe=false;
   historical.value.payload.items.push(3);
   historical.sha256='0'.repeat(64);
   assert.deepEqual(tx.getVersion(ref),{...ref,value});
   assert.equal(Object.prototype.hasOwnProperty.call(tx.getVersion(ref).value.payload,'__proto__'),true);
   assert.deepEqual(tx.getVersion(historyReference(latest)),{...historyReference(latest),value:latest.value});
   assert.deepEqual(tx.get('tasks',old.id),latest);
  });
  assert.deepEqual(snapshot(f),before);
 }finally{f.close();}
});

test('historical references fail closed for missing fields, invalid types and wrong tuples without fallback',()=>{
 const f=peerFixture();try{
  const row=f.ledger.write('history.reference','cos-a',tx=>tx.put('tasks','reference-target',{state:'planned'},0));
  const ref=historyReference(row),before=snapshot(f);
  const missing=Object.keys(ref).map(key=>{const copy={...ref};delete copy[key];return copy;});
  let accessed=false;
  const accessor={...ref};Object.defineProperty(accessor,'id',{enumerable:true,get(){accessed=true;return row.id;}});
  const invalid=[
   null,undefined,[],42,'reference',Object.create(ref),accessor,...missing,
   {...ref,extra:true},{...ref,family:'not-a-family'},{...ref,family:7},
   {...ref,id:''},{...ref,id:' '},{...ref,id:7},{...ref,id:'x\0y'},
   {...ref,revision:0},{...ref,revision:-1},{...ref,revision:1.5},
   {...ref,revision:'1'},{...ref,revision:Number.MAX_SAFE_INTEGER+1},
   {...ref,sha256:null},{...ref,sha256:'A'.repeat(64)},{...ref,sha256:'0'.repeat(63)}
  ];
  for(const bad of invalid)assert.throws(()=>f.ledger.read(tx=>tx.getVersion(bad)));
  assert.equal(accessed,false,'reference validation must not invoke an accessor');
  for(const wrong of [
   {...ref,family:'homes'}, {...ref,id:'absent'}, {...ref,revision:2}
  ])assert.throws(()=>f.ledger.read(tx=>tx.getVersion(wrong)),/historical version is unavailable/);
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion({...ref,sha256:'0'.repeat(64)})),/historical reference hash or identity mismatch/);
  assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',row.id)),row);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:row.value});
  assert.deepEqual(snapshot(f),before);
 }finally{f.close();}
});

test('historical lookup rejects missing history, corrupt bytes, noncanonical JSON and stored hash corruption',()=>{
 const modes=['missing','bytes','noncanonical','invalid-json','stored-hash','invalid-stored-hash','rebound-content'];
 for(const mode of modes){
  const f=peerFixture();try{
   const old=f.ledger.write('history.corruption.old','cos-a',tx=>tx.put('tasks','corrupt-target',{a:1,b:2},0));
   const current=f.ledger.write('history.corruption.new','cos-a',tx=>tx.put('tasks',old.id,{a:2,b:2},old.revision));
   let ref=historyReference(old);
   // Deliberate corruption is confined to the isolated fictional fixture.
   const db=new DatabaseSync(f.file);try{
    if(mode==='missing'){
     db.exec('DROP TRIGGER peer_history_delete');
     db.prepare('DELETE FROM peer_versions WHERE family=? AND id=? AND revision=?').run('tasks',old.id,old.revision);
    }else{
     let bytes=canonical(old.value),sha256=old.sha256;
     if(mode==='bytes')bytes=canonical({a:9,b:2});
     if(mode==='noncanonical'){bytes='{"b":2,"a":1}';sha256=historyBytesHash(bytes);ref={...ref,sha256};}
     if(mode==='invalid-json'){bytes='{"a":';sha256=historyBytesHash(bytes);ref={...ref,sha256};}
     if(mode==='stored-hash'){sha256='0'.repeat(64);ref={...ref,sha256};}
     if(mode==='invalid-stored-hash')sha256='invalid';
     if(mode==='rebound-content'){bytes=canonical({a:9,b:2});sha256=historyBytesHash(bytes);}
     db.exec('DROP TRIGGER peer_history_update');
     db.prepare('UPDATE peer_versions SET bytes=?,sha256=? WHERE family=? AND id=? AND revision=?').run(bytes,sha256,'tasks',old.id,old.revision);
    }
   }finally{db.close();}
   const before=snapshot(f);
   assert.throws(()=>f.ledger.read(tx=>tx.getVersion(ref)),mode);
   assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',old.id)),current,'a valid current row must not substitute for corrupt historical evidence');
   assert.deepEqual(snapshot(f),before,mode+' rejection must not mutate any ledger table');
  }finally{f.close();}
 }
});

test('historical reads precede modifying puts and failed historical reads roll back the entire write',()=>{
 const f=peerFixture();try{
  const old=f.ledger.write('history.policy.old','cos-a',tx=>tx.put('tasks','policy-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);
  let uncommitted;
  assert.throws(()=>f.ledger.write('history.policy.rollback','cos-a',tx=>{
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   uncommitted=tx.put('tasks',old.id,{state:'completed'},old.revision);
   tx.put('notices','history-policy-notice',{status:'unresolved'},0);
   tx.event('history.policy.event',{task_id:old.id});
   assert.deepEqual(tx.get('tasks',old.id),uncommitted);
   assert.throws(()=>tx.getVersion(ref),/before pending writes/);
   assert.throws(()=>tx.list('tasks'),/List after pending writes/);
   tx.getVersion(historyReference(uncommitted));
  }),/before pending writes/);
  assert.deepEqual(snapshot(f),before);
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(historyReference(uncommitted))),/unavailable/);
  assert.deepEqual(snapshot(f),before);
  assert.throws(()=>f.ledger.write('history.policy.bad-reference','cos-a',tx=>{
   tx.event('buffered.before.read.failure',{task_id:old.id});
   tx.getVersion({...ref,sha256:'0'.repeat(64)});
  }),/hash or identity mismatch/);
  assert.deepEqual(snapshot(f),before);
  const latest=f.ledger.write('history.policy.commit','cos-a',tx=>{
   // A no-op put introduces no uncommitted version and does not disable lookup.
   tx.put('tasks',old.id,old.value,old.revision);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   return tx.put('tasks',old.id,{state:'completed'},old.revision);
  });
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(historyReference(latest))),{...historyReference(latest),value:latest.value});
  assert.equal(f.ledger.verify().complete,true);
 }finally{f.close();}
});

test('historical lookup handles expire on commit and rollback and retain synchronous transaction guards',async()=>{
 const f=peerFixture();try{
  const row=f.ledger.write('history.lifecycle','cos-a',tx=>tx.put('tasks','lifecycle-target',{state:'planned'},0));
  const ref=historyReference(row),before=snapshot(f);
  let handle,escaped;
  f.ledger.read(tx=>{handle=tx;escaped=tx.getVersion;assert.deepEqual(escaped(ref),{...ref,value:row.value});});
  assert.throws(()=>handle.getVersion(ref),/expired/);
  assert.throws(()=>escaped(ref),/expired/);
  f.ledger.read(tx=>{
   assert.throws(()=>escaped(ref),/expired/);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:row.value});
  });
  assert.throws(()=>f.ledger.write('history.lifecycle.rollback','cos-a',tx=>{
   handle=tx;escaped=tx.getVersion;
   assert.deepEqual(tx.getVersion(ref),{...ref,value:row.value});
   tx.put('notices','lifecycle-notice',{status:'unresolved'},0);
   throw Error('intentional historical rollback');
  }),/intentional historical rollback/);
  assert.throws(()=>handle.getVersion(ref),/expired/);
  assert.throws(()=>escaped(ref),/expired/);
  let entered=false;
  assert.throws(()=>f.ledger.read(async tx=>{entered=true;tx.getVersion(ref);}),/asynchronous work/);
  assert.throws(()=>f.ledger.write('history.async','cos-a',async tx=>{entered=true;tx.getVersion(ref);}),/asynchronous work/);
  assert.equal(entered,false);
  assert.throws(()=>f.ledger.write('history.thenable','cos-a',tx=>{
   handle=tx;
   tx.getVersion(ref);
   tx.put('notices','thenable-notice',{status:'unresolved'},0);
   return {then(){}};
  }),/asynchronous work/);
  assert.throws(()=>handle.getVersion(ref),/expired/);
  let delayed;
  f.ledger.read(tx=>{delayed=Promise.resolve().then(()=>assert.throws(()=>tx.getVersion(ref),/expired/));});
  await delayed;
  let continuation;
  assert.throws(()=>f.ledger.write('history.promise','cos-a',tx=>{
   tx.getVersion(ref);
   tx.put('notices','promise-notice',{status:'unresolved'},0);
   continuation=Promise.resolve().then(()=>assert.throws(()=>tx.getVersion(ref),/expired/));
   return continuation;
  }),/asynchronous work/);
  await continuation;
  assert.deepEqual(snapshot(f),before);
 }finally{f.close();}
});

test('historical lookup excludes external transactions containing uncommitted history',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file),shared=new PeerLedger(f.root,{connection:db});
 try{
  const old=f.ledger.write('history.external.old','cos-a',tx=>tx.put('tasks','external-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);
  let staged,handle;
  db.exec('BEGIN IMMEDIATE');
  shared.writeWithin('history.external.stage','cos-a',tx=>{
   handle=tx;
   assert.throws(()=>tx.getVersion(ref),/external transactions are excluded/);
   staged=tx.put('tasks',old.id,{state:'completed'},old.revision);
  });
  assert.throws(()=>handle.getVersion(ref),/expired/);
  assert.equal(db.isTransaction,true);
  shared.writeWithin('history.external.inspect','cos-a',tx=>{
   assert.deepEqual(tx.get('tasks',old.id),staged);
   assert.throws(()=>tx.getVersion(ref),/external transactions are excluded/);
   assert.throws(()=>tx.getVersion(historyReference(staged)),/external transactions are excluded/);
  });
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(historyReference(staged))),/unavailable/);
  db.exec('ROLLBACK');
  assert.deepEqual(snapshot(f),before);
  assert.deepEqual(shared.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
 }finally{if(db.isTransaction)db.exec('ROLLBACK');shared.close();db.close();f.close();}
});

test('historical lookup shares the owning WAL snapshot across another connection write and commit',()=>{
 const f=peerFixture(),other=new PeerLedger(f.root);try{
  const old=f.ledger.write('history.snapshot.old','cos-a',tx=>tx.put('tasks','snapshot-target',{state:'planned'},0));
  const ref=historyReference(old);
  let future,committedState;
  f.ledger.read(tx=>{
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   assert.deepEqual(tx.get('tasks',old.id),old);
   other.write('history.snapshot.new','cos-b',writer=>{
    future=writer.put('tasks',old.id,{state:'completed'},old.revision);
    // Both handles are live, but belong to different SQLite connections.
    // The reader cannot observe even the writer's not-yet-committed version.
    assert.throws(()=>tx.getVersion(historyReference(future)),/unavailable/);
    assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
    assert.deepEqual(tx.get('tasks',old.id),old);
   });
   // A committed version still cannot enter the already-established snapshot.
   assert.throws(()=>tx.getVersion(historyReference(future)),/unavailable/);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   assert.deepEqual(tx.get('tasks',old.id),old);
   committedState=snapshot(f);
  });
  assert.deepEqual(snapshot(f),committedState,'historical reads and failures must not change the writer commit');
  f.ledger.read(tx=>{
   assert.deepEqual(tx.get('tasks',old.id),future);
   assert.deepEqual(tx.getVersion(historyReference(future)),{...historyReference(future),value:future.value});
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
  });
  assert.equal(f.ledger.verify().complete,true);
  assert.deepEqual(snapshot(f),committedState);
 }finally{other.close();f.close();}
});

test('caught failure after history insertion cannot expose uncommitted history and explicit rollback restores every table',()=>{
 let armed=false,injected=0;
 const queries=[],f=peerFixture({onQuery:q=>{
  queries.push(q.sql);
  if(armed&&q.sql.startsWith('INSERT INTO peer_rows')){
   armed=false;injected++;
   throw Error('injected post-history failure');
  }
 }});
 try{
  const old=f.ledger.write('history.partial.old','cos-a',tx=>tx.put('tasks','partial-target',{state:'planned'},0));
  const ref=historyReference(old),value={state:'completed'},proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)};
  const before=snapshot(f);let handle;
  assert.throws(()=>f.ledger.write('history.partial.rollback','cos-a',tx=>{
   handle=tx;
   assert.deepEqual(tx.put('tasks',old.id,old.value,old.revision),old);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   queries.length=0;armed=true;
   assert.throws(()=>tx.put('tasks',old.id,value,old.revision),/injected post-history failure/);
   assert.equal(injected,1);
   const historyIndex=queries.findIndex(sql=>sql.startsWith('INSERT INTO peer_versions'));
   const rowIndex=queries.findIndex(sql=>sql.startsWith('INSERT INTO peer_rows'));
   assert.ok(historyIndex>=0&&rowIndex>historyIndex,'the canonical-row hook is reached after the history INSERT has returned');
   queries.length=0;
   assert.throws(()=>tx.getVersion(proposed),/failed row mutation/);
   assert.throws(()=>tx.getVersion(ref),/failed row mutation/);
   assert.equal(queries.length,0,'poisoned lookup must reject before querying history');
   throw Error('explicit rollback after caught mutation failure');
  }),/explicit rollback after caught mutation failure/);
  assert.equal(injected,1);
  assert.deepEqual(snapshot(f),before);
  assert.throws(()=>handle.getVersion(proposed),/expired/);
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',old.id)),old);
  assert.equal(f.ledger.verify().complete,true);
  assert.deepEqual(snapshot(f),before);
 }finally{f.close();}
});

test('swallowed modifying-put failures poison the transaction and roll back prior writes at each mutation stage',()=>{
 const stages=['INSERT INTO peer_versions','INSERT INTO peer_rows','UPDATE peer_membership','INSERT INTO peer_membership','UPDATE peer_generations'];
 for(const stage of stages)for(const priorWrites of [false,true]){
  let armed=false,injected=0;
  const queries=[],f=peerFixture({onQuery:q=>{
   queries.push(q.sql);
   if(armed&&q.sql.startsWith(stage)){
    armed=false;injected++;
    throw Error('injected mutation-stage failure');
   }
  }});
  try{
   const old=f.ledger.write('history.poison.old','cos-a',tx=>tx.put('tasks','poison-target',{state:'planned',principal_id:'cos-a',scope:'old'},0));
   const ref=historyReference(old),value={state:'completed',principal_id:'cos-b',scope:'new'};
   const proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
   let handle,returnedNormally=false;
   assert.throws(()=>f.ledger.write('history.poison.swallowed','cos-a',tx=>{
    handle=tx;
    if(priorWrites){
     tx.put('notices','poison-prior-notice',{status:'unresolved'},0);
     tx.event('history.poison.prior-event',{task_id:old.id});
    }
    armed=true;
    assert.throws(()=>tx.put('tasks',old.id,value,old.revision),/injected mutation-stage failure/);
    assert.equal(injected,1);
    queries.length=0;
    const operations=[
     ()=>tx.getVersion(proposed),()=>tx.getVersion(ref),
     ()=>tx.get('tasks',old.id),()=>tx.list('tasks'),()=>tx.count('tasks'),
     ()=>tx.events(),()=>tx.resolveLegacy({sha256:old.sha256}),
     ()=>tx.put('tasks',old.id,old.value,old.revision),
     ()=>tx.put('notices','poison-late-notice',{status:'unresolved'},0),
     ()=>tx.event('history.poison.late-event',{})
    ];
    for(const operation of operations)assert.throws(operation,/failed row mutation/);
    assert.equal(queries.length,0,'a failed mutation disables all subsequent handle operations');
    returnedNormally=true;
    return 'callback swallowed the mutation failure';
   }),/failed row mutation/);
   assert.equal(returnedNormally,true,'the transaction must reject even when the callback returns normally');
   assert.equal(injected,1);
   assert.deepEqual(snapshot(f),before,stage+' priorWrites='+priorWrites);
   assert.throws(()=>handle.getVersion(ref),/expired/);
   assert.throws(()=>f.ledger.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
   assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
   assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',old.id)),old);
   assert.equal(f.ledger.read(tx=>tx.get('notices','poison-prior-notice')),null);
   assert.equal(f.ledger.read(tx=>tx.get('notices','poison-late-notice')),null);
   assert.equal(f.ledger.verify().complete,true);
   assert.deepEqual(snapshot(f),before);
  }finally{f.close();}
 }
});

test('caught failures before mutation and successful no-op puts preserve committed historical lookup',()=>{
 let armed=false,injected=0;
 const f=peerFixture({onQuery:q=>{
  if(armed&&q.sql==='SELECT * FROM peer_rows WHERE family=? AND id=?'){
   armed=false;injected++;
   throw Error('injected pre-mutation read failure');
  }
 }});
 try{
  const old=f.ledger.write('history.pre-mutation.old','cos-a',tx=>tx.put('tasks','pre-mutation-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);
  const result=f.ledger.write('history.pre-mutation.recovery','cos-a',tx=>{
   armed=true;
   assert.throws(()=>tx.put('tasks',old.id,{state:'completed'},old.revision),/injected pre-mutation read failure/);
   assert.equal(injected,1);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   assert.throws(()=>tx.put('tasks',old.id,{state:'completed'},old.revision+1),/revision conflict/);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   assert.throws(()=>tx.put('tasks',old.id,{state:undefined},old.revision),/JSON/);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   assert.deepEqual(tx.put('tasks',old.id,old.value,old.revision),old);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   assert.equal(tx.list('tasks').items.length,1);
   return 'no mutation began';
  });
  assert.equal(result,'no mutation began');
  assert.equal(injected,1);
  assert.deepEqual(snapshot(f),before);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
 }finally{f.close();}
});

test('swallowed partial mutation in writeWithin rolls back its savepoint before the caller commits',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file);
 let armed=false,injected=0;
 const shared=new PeerLedger(f.root,{connection:db,onQuery:q=>{
  if(armed&&q.sql.startsWith('INSERT INTO peer_rows')){
   armed=false;injected++;
   throw Error('injected external partial mutation');
  }
 }});
 try{
  const old=f.ledger.write('history.external-poison.old','cos-a',tx=>tx.put('tasks','external-poison-target',{state:'planned'},0));
  const ref=historyReference(old),value={state:'completed'},proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)};
  const before=snapshot(f);let handle,returnedNormally=false;
  db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>shared.writeWithin('history.external-poison.failed','cos-a',tx=>{
   handle=tx;
   tx.put('notices','external-poison-notice',{status:'unresolved'},0);
   tx.event('history.external-poison.event',{});
   armed=true;
   assert.throws(()=>tx.put('tasks',old.id,value,old.revision),/injected external partial mutation/);
   assert.throws(()=>tx.getVersion(proposed),/failed row mutation/);
   returnedNormally=true;
  }),/failed row mutation/);
  assert.equal(returnedNormally,true);
  assert.equal(injected,1);
  assert.equal(db.isTransaction,true,'the caller retains its outer transaction');
  assert.throws(()=>handle.getVersion(ref),/expired/);
  shared.writeWithin('history.external-poison.inspect','cos-a',tx=>{
   assert.deepEqual(tx.get('tasks',old.id),old);
   assert.equal(tx.get('notices','external-poison-notice'),null);
   assert.deepEqual(tx.put('tasks',old.id,old.value,old.revision),old);
   assert.throws(()=>tx.getVersion(ref),/external transactions are excluded/);
  });
  db.exec('COMMIT');
  assert.deepEqual(snapshot(f),before,'committing the outer transaction must not retain any part of the failed savepoint');
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
  assert.deepEqual(shared.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.equal(f.ledger.verify().complete,true);
  assert.deepEqual(snapshot(f),before);
 }finally{if(db.isTransaction)db.exec('ROLLBACK');shared.close();db.close();f.close();}
});

// API-F2: actual shared DatabaseSync objects, never synthetic ledger providers.
function connectionTableState(db){
 return Object.fromEntries(['peer_rows','peer_versions','peer_generations','peer_membership','peer_events','peer_outbox','peer_meta'].map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
}

test('shared wrappers cannot enter an owning read or write, including construction inside the callback',()=>{
 for(const mode of ['read','write'])for(const timing of ['before','during']){
  const f=peerFixture(),db=f.ledger.db,rawExec=db.exec,execCalls=[];
  let helper,helperQueries=0,handle,entered=0;
  try{
   const old=f.ledger.write('fence.seed','cos-a',tx=>tx.put('tasks','fence-target',{state:'planned'},0));
   const ref=historyReference(old),value={state:'completed'};
   const proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
   const makeHelper=()=>new PeerLedger(f.root,{connection:db,onQuery:()=>helperQueries++});
   if(timing==='before')helper=makeHelper();
   db.exec=function(sql){execCalls.push(sql);return rawExec.call(this,sql);};
   const callback=tx=>{
    handle=tx;
    if(timing==='during')helper=makeHelper();
    assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
    const nested=inner=>{
     entered++;
     inner.put('tasks',old.id,value,old.revision);
     inner.put('notices','helper-notice',{status:'unresolved'},0);
     inner.event('helper.event',{});
    };
    for(const invoke of [
     ()=>helper.read(nested),
     ()=>helper.write('helper.write','cos-b',nested),
     ()=>helper.writeWithin('helper.savepoint','cos-b',nested)
    ]){
     const localBefore=connectionTableState(db),sqlBefore=execCalls.length,queriesBefore=helperQueries;
     assert.throws(invoke,/active transaction owner/);
     assert.equal(entered,0,'a rejected sibling must never enter its callback');
     assert.equal(execCalls.length,sqlBefore,'a rejected sibling must not issue BEGIN, SAVEPOINT, COMMIT or ROLLBACK');
     assert.equal(helperQueries,queriesBefore,'a rejected sibling must not issue startup or row queries');
     assert.equal(db.isTransaction,true);
     assert.deepEqual(connectionTableState(db),localBefore);
     assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
     assert.throws(()=>tx.getVersion(proposed),/unavailable/);
    }
    helper.close();
    assert.throws(()=>helper.writeWithin('helper.after-close','cos-b',nested),/active transaction owner/);
    assert.equal(entered,0,'nonowning close cannot clear another wrapper token');
    if(mode==='write'){
     assert.deepEqual(tx.put('tasks',old.id,old.value,old.revision),old);
     assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
     tx.put('tasks',old.id,value,old.revision);
     tx.put('notices','owner-rollback-notice',{status:'unresolved'},0);
     tx.event('owner.rollback.event',{});
    }
    throw Error('deliberate owner rollback');
   };
   assert.throws(()=>mode==='read'?f.ledger.read(callback):f.ledger.write('fence.owner','cos-a',callback),/deliberate owner rollback/);
   assert.equal(db.isTransaction,false);
   assert.deepEqual(snapshot(f),before,'every ledger table must return to its committed state');
   assert.throws(()=>handle.getVersion(ref),/expired/);
   assert.throws(()=>helper.read(tx=>tx.getVersion(proposed)),/unavailable/);
   assert.deepEqual(helper.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
   assert.deepEqual(helper.write('fence.sequential','cos-b',tx=>{
    tx.put('tasks',old.id,old.value,old.revision);
    return tx.getVersion(ref);
   }),{...ref,value:old.value});
   assert.equal(f.ledger.verify().complete,true);
   assert.deepEqual(snapshot(f),before);
  }finally{db.exec=rawExec;helper?.close();f.close();}
 }
});

test('connection ownership precedes hook-capable head reads during owning transaction startup',()=>{
 let armed=false,helper,owner,entered=false,hooks=0,helperQueries=0;
 const f=peerFixture({onQuery:q=>{
  if(!armed||q.sql!=='SELECT * FROM peer_meta WHERE id=1')return;
  armed=false;hooks++;
  assert.equal(entered,false,'the hook runs before the owning callback');
  const db=owner.db,before=connectionTableState(db);
  let nestedEntered=false;
  const nested=()=>{nestedEntered=true;};
  assert.throws(()=>helper.writeWithin('startup.nested','cos-b',nested),/active transaction owner/);
  assert.throws(()=>helper.read(nested),/active transaction owner/);
  assert.throws(()=>helper.write('startup.write','cos-b',nested),/active transaction owner/);
  const late=new PeerLedger(f.root,{connection:db});
  late.close();
  assert.throws(()=>late.writeWithin('startup.late','cos-b',nested),/active transaction owner/);
  assert.equal(nestedEntered,false);
  assert.equal(helperQueries,0);
  assert.equal(db.isTransaction,true);
  assert.deepEqual(connectionTableState(db),before);
 }});
 try{
  owner=f.ledger;
  helper=new PeerLedger(f.root,{connection:owner.db,onQuery:()=>helperQueries++});
  const old=owner.write('startup.seed','cos-a',tx=>tx.put('tasks','startup-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);
  for(const mode of ['read','write']){
   entered=false;armed=true;
   const callback=tx=>{
    entered=true;
    assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
    if(mode==='write'){
     tx.put('tasks',old.id,old.value,old.revision);
     assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
    }
   };
   if(mode==='read')owner.read(callback);else owner.write('startup.owner','cos-a',callback);
   assert.equal(entered,true);
   assert.equal(owner.db.isTransaction,false);
   assert.deepEqual(snapshot(f),before);
  }
  assert.equal(hooks,2);
  assert.deepEqual(helper.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.deepEqual(snapshot(f),before);
 }finally{helper?.close();f.close();}
});

test('physical owner close and connection reassignment cannot invalidate a borrowing wrapper transaction',()=>{
 const f=peerFixture(),db=f.ledger.db,borrower=new PeerLedger(f.root,{connection:db});
 let third,handle;
 try{
  const old=f.ledger.write('close.seed','cos-a',tx=>tx.put('tasks','close-target',{state:'planned'},0));
  const ref=historyReference(old);
  const latest=borrower.write('close.borrower','cos-b',tx=>{
   handle=tx;
   const before=connectionTableState(db);
   assert.throws(()=>f.ledger.close(),/active peer transaction owner/);
   assert.throws(()=>{borrower.db=null;},TypeError);
   assert.throws(()=>{borrower.ownsDb=true;},TypeError);
   assert.throws(()=>Object.defineProperty(borrower,'db',{value:null}),TypeError);
   third=new PeerLedger(f.root,{connection:db});
   third.close();
   let entered=false;
   assert.throws(()=>third.writeWithin('close.third','cos-a',()=>{entered=true;}),/active transaction owner/);
   assert.equal(entered,false);
   assert.equal(db.isOpen,true);
   assert.equal(db.isTransaction,true);
   assert.deepEqual(connectionTableState(db),before);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
   return tx.put('tasks',old.id,{state:'completed'},old.revision);
  });
  assert.equal(db.isTransaction,false);
  assert.throws(()=>handle.getVersion(ref),/expired/);
  assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',old.id)),latest);
  assert.deepEqual(third.read(tx=>tx.getVersion(historyReference(latest))),{...historyReference(latest),value:latest.value});
  const before=snapshot(f);
  db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>f.ledger.close(),/active external transaction/);
  assert.equal(db.isTransaction,true);
  db.exec('ROLLBACK');
  assert.deepEqual(snapshot(f),before);
  assert.equal(f.ledger.verify().complete,true);
 }finally{if(db.isTransaction)db.exec('ROLLBACK');third?.close();borrower.close();f.close();}
});

test('duplicate ESM cache instances and derived classes share actual connection ownership',async()=>{
 const duplicate=await import(new URL('../plugins/soloco/runtime/peers/ledger.mjs?connection-fence-regression=1',import.meta.url).href);
 assert.notEqual(duplicate.PeerLedger,PeerLedger,'exercise a distinct class from a distinct ESM cache entry');
 class DerivedLedger extends duplicate.PeerLedger{}
 const f=peerFixture(),db=f.ledger.db,copy=new duplicate.PeerLedger(f.root,{connection:db});
 let derived;
 try{
  const old=f.ledger.write('duplicate.seed','cos-a',tx=>tx.put('tasks','duplicate-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);
  f.ledger.read(tx=>{
   derived=new DerivedLedger(f.root,{connection:db});
   const localBefore=connectionTableState(db);let entered=false;
   assert.throws(()=>copy.writeWithin('duplicate.copy','cos-b',()=>{entered=true;}),/active transaction owner/);
   assert.throws(()=>derived.read(()=>{entered=true;}),/active transaction owner/);
   derived.close();
   assert.throws(()=>copy.writeWithin('duplicate.after-close','cos-b',()=>{entered=true;}),/active transaction owner/);
   assert.equal(entered,false);
   assert.deepEqual(connectionTableState(db),localBefore);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
  });
  copy.write('duplicate.reverse','cos-b',tx=>{
   const localBefore=connectionTableState(db);let entered=false;
   assert.throws(()=>f.ledger.read(()=>{entered=true;}),/active transaction owner/);
   assert.throws(()=>derived.writeWithin('duplicate.derived','cos-a',()=>{entered=true;}),/active transaction owner/);
   assert.throws(()=>f.ledger.close(),/active peer transaction owner/);
   assert.equal(entered,false);
   assert.deepEqual(connectionTableState(db),localBefore);
   tx.put('tasks',old.id,old.value,old.revision);
   assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
  });
  assert.deepEqual(derived.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.deepEqual(snapshot(f),before);
 }finally{derived?.close();copy.close();f.close();}
});

test('failed BEGIN and rejected owning entry into an external transaction release only their own reservation',()=>{
 const f=peerFixture(),db=f.ledger.db,helper=new PeerLedger(f.root,{connection:db}),other=new PeerLedger(f.root);
 try{
  const old=f.ledger.write('begin.seed','cos-a',tx=>tx.put('tasks','begin-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);let entered=false;
  other.write('begin.lock-holder','cos-b',()=>{
   assert.throws(()=>f.ledger.write('begin.blocked','cos-a',()=>{entered=true;}),/locked|busy/i);
   assert.equal(entered,false);
   assert.equal(db.isTransaction,false);
   assert.deepEqual(helper.read(tx=>tx.getVersion(ref)),{...ref,value:old.value},'failed BEGIN must release the shared connection token');
  });
  assert.deepEqual(snapshot(f),before);
  assert.deepEqual(helper.write('begin.recovered','cos-a',tx=>{
   tx.put('tasks',old.id,old.value,old.revision);
   return tx.getVersion(ref);
  }),{...ref,value:old.value});
  db.exec('BEGIN IMMEDIATE');
  const insideBefore=connectionTableState(db);
  assert.throws(()=>f.ledger.read(()=>{entered=true;}),/Caller-owned transaction requires writeWithin/);
  assert.equal(entered,false);
  assert.equal(db.isTransaction,true);
  assert.deepEqual(connectionTableState(db),insideBefore);
  helper.writeWithin('begin.external-supported','cos-a',tx=>{
   assert.deepEqual(tx.get('tasks',old.id),old);
   assert.throws(()=>tx.getVersion(ref),/external transactions are excluded/);
  });
  assert.equal(db.isTransaction,true);
  db.exec('ROLLBACK');
  assert.deepEqual(helper.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.deepEqual(snapshot(f),before);
 }finally{if(db.isTransaction)db.exec('ROLLBACK');helper.close();other.close();f.close();}
});

test('startup failure and callback rollback expire handles and release the connection for sibling use',()=>{
 let armed=false;
 const f=peerFixture({onQuery:q=>{
  if(armed&&q.sql==='SELECT * FROM peer_meta WHERE id=1'){
   armed=false;throw Error('injected startup head failure');
  }
 }}),helper=new PeerLedger(f.root,{connection:f.ledger.db});
 try{
  const old=f.ledger.write('release.seed','cos-a',tx=>tx.put('tasks','release-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);let entered=false,handle;
  armed=true;
  assert.throws(()=>f.ledger.read(()=>{entered=true;}),/injected startup head failure/);
  assert.equal(entered,false);
  assert.equal(f.ledger.db.isTransaction,false);
  assert.deepEqual(snapshot(f),before);
  assert.deepEqual(helper.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  const proposed={...ref,revision:old.revision+1,sha256:peerDigest({state:'completed'})};
  assert.throws(()=>helper.write('release.callback','cos-b',tx=>{
   handle=tx;
   tx.put('tasks',old.id,{state:'completed'},old.revision);
   tx.put('notices','release-notice',{status:'unresolved'},0);
   tx.event('release.event',{});
   throw Error('injected callback failure');
  }),/injected callback failure/);
  assert.throws(()=>handle.getVersion(ref),/expired/);
  assert.equal(f.ledger.db.isTransaction,false);
  assert.deepEqual(snapshot(f),before);
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(proposed)),/unavailable/);
  assert.deepEqual(f.ledger.write('release.recovered','cos-a',tx=>{
   tx.put('tasks',old.id,old.value,old.revision);
   return tx.getVersion(ref);
  }),{...ref,value:old.value});
  assert.equal(f.ledger.verify().complete,true);
  assert.deepEqual(snapshot(f),before);
 }finally{helper.close();f.close();}
});

test('rollback errors release known-ended ownership but quarantine an uncertain active connection',()=>{
 for(const point of ['before','after']){
  const f=peerFixture(),db=f.ledger.db,helper=new PeerLedger(f.root,{connection:db}),rawExec=db.exec;
  let handle,armed=true;
  try{
   const old=f.ledger.write('rollback-fault.seed','cos-a',tx=>tx.put('tasks','rollback-fault-target',{state:'planned'},0));
   const ref=historyReference(old),value={state:'completed'},proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
   db.exec=function(sql){
    if(armed&&sql==='ROLLBACK'){
     armed=false;
     if(point==='after')rawExec.call(this,sql);
     throw Error('injected '+point+' rollback error');
    }
    return rawExec.call(this,sql);
   };
   assert.throws(()=>f.ledger.write('rollback-fault.owner','cos-a',tx=>{
    handle=tx;
    tx.put('tasks',old.id,value,old.revision);
    tx.put('notices','rollback-fault-notice',{status:'unresolved'},0);
    tx.event('rollback-fault.event',{});
    throw Error('original callback failure');
   }),error=>{
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length,2);
    assert.match(error.errors[0].message,/original callback failure/);
    assert.match(error.errors[1].message,/injected .* rollback error/);
    return true;
   });
   assert.throws(()=>handle.getVersion(ref),/expired/);
   if(point==='before'){
    assert.equal(db.isTransaction,true);
    const localBefore=connectionTableState(db);let entered=false;
    assert.throws(()=>helper.writeWithin('rollback-fault.unsafe','cos-b',()=>{entered=true;}),/quarantined/);
    assert.throws(()=>f.ledger.read(()=>{entered=true;}),/quarantined/);
    assert.equal(entered,false);
    assert.deepEqual(connectionTableState(db),localBefore);
    // Fixture cleanup alone does not constitute ledger recovery authority and
    // must not reset the persistent-in-memory quarantine on this object.
    rawExec.call(db,'ROLLBACK');
    assert.equal(db.isTransaction,false);
    assert.throws(()=>helper.read(()=>{entered=true;}),/quarantined/);
    const fresh=new PeerLedger(f.root);
    try{
     assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/unavailable/);
     assert.deepEqual(fresh.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
    }finally{fresh.close();}
   }else{
    assert.equal(db.isTransaction,false);
    assert.throws(()=>helper.read(tx=>tx.getVersion(proposed)),/unavailable/);
    assert.deepEqual(helper.write('rollback-fault.recovered','cos-b',tx=>{
     tx.put('tasks',old.id,old.value,old.revision);
     return tx.getVersion(ref);
    }),{...ref,value:old.value});
   }
   assert.deepEqual(snapshot(f),before);
  }finally{
   db.exec=rawExec;
   if(db.isTransaction)rawExec.call(db,'ROLLBACK');
   helper.close();f.close();
  }
 }
});

test('external migration wrappers reject overlapping savepoints and retain sequential commit and rollback',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file),a=new PeerLedger(f.root,{connection:db}),b=new PeerLedger(f.root,{connection:db});
 let handle;
 try{
  const old=f.ledger.write('migration-fence.seed','cos-a',tx=>tx.put('tasks','migration-fence-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);let proposed;
  db.exec('BEGIN IMMEDIATE');
  a.writeWithin('migration-fence.first','cos-a',tx=>{
   handle=tx;
   const localBefore=connectionTableState(db);let entered=false;
   assert.throws(()=>b.writeWithin('migration-fence.nested','cos-b',()=>{entered=true;}),/active transaction owner/);
   assert.throws(()=>b.read(()=>{entered=true;}),/active transaction owner/);
   assert.throws(()=>b.write('migration-fence.owning','cos-b',()=>{entered=true;}),/active transaction owner/);
   assert.equal(entered,false);
   assert.deepEqual(connectionTableState(db),localBefore);
   assert.throws(()=>tx.getVersion(ref),/external transactions are excluded/);
   proposed=tx.put('tasks',old.id,{state:'completed'},old.revision);
  });
  assert.throws(()=>handle.get('tasks',old.id),/expired/);
  b.writeWithin('migration-fence.second','cos-b',tx=>{
   assert.deepEqual(tx.get('tasks',old.id),proposed);
   assert.throws(()=>tx.getVersion(historyReference(proposed)),/external transactions are excluded/);
   tx.put('notices','migration-fence-notice',{status:'unresolved'},0);
  });
  assert.equal(db.isTransaction,true);
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(historyReference(proposed))),/unavailable/);
  db.exec('ROLLBACK');
  assert.deepEqual(snapshot(f),before);
  assert.throws(()=>b.read(tx=>tx.getVersion(historyReference(proposed))),/unavailable/);
  db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>a.writeWithin('migration-fence.failed','cos-a',tx=>{
   tx.put('notices','migration-fence-failed',{status:'unresolved'},0);
   throw Error('migration callback rollback');
  }),/migration callback rollback/);
  assert.equal(db.isTransaction,true);
  b.writeWithin('migration-fence.commit','cos-b',tx=>{
   assert.equal(tx.get('notices','migration-fence-failed'),null);
   tx.put('notices','migration-fence-committed',{status:'unresolved'},0);
  });
  db.exec('COMMIT');
  assert.equal(f.ledger.read(tx=>tx.get('notices','migration-fence-committed')).revision,1);
  assert.equal(f.ledger.read(tx=>tx.get('notices','migration-fence-failed')),null);
  assert.deepEqual(a.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.equal(f.ledger.verify().complete,true);
 }finally{if(db.isTransaction)db.exec('ROLLBACK');a.close();b.close();db.close();f.close();}
});

test('loss of the raw connection cannot return a successful owning transaction or revive its handle',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file),owner=new PeerLedger(f.root,{connection:db}),sibling=new PeerLedger(f.root,{connection:db});
 let handle;
 try{
  const old=f.ledger.write('connection-loss.seed','cos-a',tx=>tx.put('tasks','connection-loss-target',{state:'planned'},0));
  const ref=historyReference(old),value={state:'completed'},proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
  // Deliberately simulate trusted-host connection loss in the fictional fixture.
  // Direct raw connection operations are not claimed to be prevented by a ledger.
  assert.throws(()=>owner.write('connection-loss.owner','cos-a',tx=>{
   handle=tx;
   tx.put('tasks',old.id,value,old.revision);
   tx.put('notices','connection-loss-notice',{status:'unresolved'},0);
   db.close();
   assert.throws(()=>tx.getVersion(ref));
   return 'must not be reported as committed';
  }));
  assert.equal(db.isOpen,false);
  assert.throws(()=>handle.getVersion(ref),/expired/);
  let entered=false;
  assert.throws(()=>sibling.read(()=>{entered=true;}));
  assert.equal(entered,false);
  assert.deepEqual(snapshot(f),before);
  assert.throws(()=>f.ledger.read(tx=>tx.getVersion(proposed)),/unavailable/);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.equal(f.ledger.verify().complete,true);
 }finally{owner.close();sibling.close();if(db.isOpen)db.close();f.close();}
});

// API-F3: same-handle reentry through the ordinary synchronous query hook.
const f3HistorySQL='SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?';

test('historical query hooks cannot introduce history or return old evidence after a modifying put',()=>{
 for(const requested of ['proposed','committed','missing']){
  let armed=false,active,old,value,changed,hooks=0;
  const f=peerFixture({onQuery:q=>{
   if(!armed||q.sql!==f3HistorySQL)return;
   armed=false;hooks++;
   changed=active.put('tasks',old.id,value,old.revision);
   active.put('notices','f3-hook-notice',{status:'unresolved'},0);
   active.event('f3.hook.event',{task_id:old.id});
  }});
  try{
   old=f.ledger.write('f3.hook.seed','cos-a',tx=>tx.put('tasks','f3-hook-target',{state:'planned',principal_id:'cos-a',scope:'old'},0));
   value={state:'completed',principal_id:'cos-b',scope:'new'};
   const ref=historyReference(old),proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)};
   const selected=requested==='proposed'?proposed:requested==='committed'?ref:{...ref,id:'f3-missing-target'};
   const before=snapshot(f);let handle;
   assert.throws(()=>f.ledger.write('f3.hook.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('f3.buffered.before.lookup',{});
    armed=true;
    assert.throws(()=>tx.getVersion(selected),/before pending writes/);
    assert.equal(hooks,1);
    assert.deepEqual(historyReference(changed),proposed,'the normal nested put really introduced the requested next version');
    assert.deepEqual(tx.get('tasks',old.id),changed);
    assert.throws(()=>tx.getVersion(ref),/before pending writes/);
    throw Error('deliberate F3 outer rollback');
   }),/deliberate F3 outer rollback/);
   active=null;
   assert.equal(hooks,1);
   assert.equal(f.ledger.db.isTransaction,false);
   assert.deepEqual(snapshot(f),before,'all seven ledger tables must roll back for '+requested);
   assert.throws(()=>handle.getVersion(ref),/expired/);
   const fresh=new PeerLedger(f.root);
   try{
    assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
    assert.deepEqual(fresh.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
    assert.deepEqual(fresh.read(tx=>tx.get('tasks',old.id)),old);
    assert.equal(fresh.read(tx=>tx.get('notices','f3-hook-notice')),null);
    assert.equal(fresh.verify().complete,true);
   }finally{fresh.close();}
   assert.deepEqual(snapshot(f),before);
  }finally{armed=false;active=null;f.close();}
 }
});

test('a historical hook swallowing a post-history put failure cannot return partial or old history',()=>{
 for(const requested of ['proposed','committed']){
  let armed=false,faultArmed=false,active,old,value,hooks=0,faults=0,nestedError;
  const injected=Error('F3 injected failure after history insertion');
  const queries=[],f=peerFixture({onQuery:q=>{
   queries.push(q.sql);
   if(faultArmed&&q.sql.startsWith('INSERT INTO peer_rows')){
    faultArmed=false;faults++;throw injected;
   }
   if(!armed||q.sql!==f3HistorySQL)return;
   armed=false;hooks++;faultArmed=true;
   try{active.put('tasks',old.id,value,old.revision);}catch(error){nestedError=error;}
   assert.equal(nestedError,injected,'the hook catches and retains the original modifying-put failure');
   assert.equal(faults,1);
  }});
  try{
   old=f.ledger.write('f3.poison.seed','cos-a',tx=>tx.put('tasks','f3-poison-target',{state:'planned'},0));
   value={state:'completed'};
   const ref=historyReference(old),proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
   let handle,callbackReturned=false;
   assert.throws(()=>f.ledger.write('f3.poison.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('f3.poison.buffered',{});
    queries.length=0;armed=true;
    assert.throws(()=>tx.getVersion(requested==='proposed'?proposed:ref),/failed row mutation/);
    assert.equal(hooks,1);
    assert.equal(nestedError,injected);
    const historyInsert=queries.findIndex(sql=>sql.startsWith('INSERT INTO peer_versions'));
    const rowInsert=queries.findIndex(sql=>sql.startsWith('INSERT INTO peer_rows'));
    assert.ok(historyInsert>=0&&rowInsert>historyInsert,'the row fault occurs after the real history INSERT returned');
    queries.length=0;
    assert.throws(()=>tx.getVersion(ref),/failed row mutation/);
    assert.throws(()=>tx.getVersion(proposed),/failed row mutation/);
    assert.throws(()=>tx.get('tasks',old.id),/failed row mutation/);
    assert.throws(()=>tx.event('f3.poison.late',{}),/failed row mutation/);
    assert.equal(queries.length,0);
    callbackReturned=true;
    return 'swallowed failures must still force outer rollback';
   }),/failed row mutation/);
   active=null;
   assert.equal(callbackReturned,true);
   assert.equal(hooks,1);assert.equal(faults,1);assert.equal(nestedError,injected);
   assert.equal(f.ledger.db.isTransaction,false);
   assert.deepEqual(snapshot(f),before,'poisoning during lookup must roll back every ledger table');
   assert.throws(()=>handle.getVersion(ref),/expired/);
   const fresh=new PeerLedger(f.root);
   try{
    assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
    assert.deepEqual(fresh.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
    assert.deepEqual(fresh.read(tx=>tx.get('tasks',old.id)),old);
    assert.equal(fresh.verify().complete,true);
   }finally{fresh.close();}
   assert.deepEqual(snapshot(f),before);
  }finally{armed=false;faultArmed=false;active=null;f.close();}
 }
});

test('read-only telemetry and a successful no-op put inside a historical hook preserve lookup',()=>{
 for(const mode of ['read','write']){
  let armed=false,active,old,hooks=0;
  const queries=[],f=peerFixture({onQuery:q=>{
   queries.push(q.sql);
   if(!armed||q.sql!==f3HistorySQL)return;
   armed=false;hooks++;
   assert.deepEqual(active.get('tasks',old.id),old);
   if(mode==='write')assert.deepEqual(active.put('tasks',old.id,old.value,old.revision),old);
  }});
  try{
   old=f.ledger.write('f3.noop.seed','cos-a',tx=>tx.put('tasks','f3-noop-target',{state:'planned'},0));
   const ref=historyReference(old),before=snapshot(f);let handle;
   const callback=tx=>{
    active=tx;handle=tx;
    queries.length=0;armed=true;
    const result=tx.getVersion(ref);
    assert.equal(hooks,1);
    assert.equal(queries.filter(sql=>sql===f3HistorySQL).length,1);
    assert.deepEqual(result,{...ref,value:old.value});
    assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value});
    return result;
   };
   const result=mode==='read'?f.ledger.read(callback):f.ledger.write('f3.noop.owner','cos-a',callback);
   active=null;
   assert.deepEqual(result,{...ref,value:old.value});
   assert.throws(()=>handle.getVersion(ref),/expired/);
   assert.deepEqual(snapshot(f),before,'telemetry and no-op hooks introduce no ledger change');
   assert.equal(f.ledger.verify().complete,true);
  }finally{armed=false;active=null;f.close();}
 }
});

test('historical query hook exceptions retain their original error and enforce changed boundaries',()=>{
 for(const modifies of [false,true]){
  let armed=false,active,old,value,hooks=0;
  const injected=Error('F3 historical query hook exception');
  const f=peerFixture({onQuery:q=>{
   if(!armed||q.sql!==f3HistorySQL)return;
   armed=false;hooks++;
   if(modifies)active.put('tasks',old.id,value,old.revision);
   throw injected;
  }});
  try{
   old=f.ledger.write('f3.exception.seed','cos-a',tx=>tx.put('tasks','f3-exception-target',{state:'planned'},0));
   value={state:'completed'};
   const ref=historyReference(old),proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
   let handle;
   assert.throws(()=>f.ledger.write('f3.exception.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('f3.exception.buffered',{});
    armed=true;
    assert.throws(()=>tx.getVersion(ref),error=>{
     if(modifies){
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length,2);
      assert.equal(error.errors[0],injected);
      assert.match(error.errors[1].message,/before pending writes/);
     }else assert.equal(error,injected);
     return true;
    });
    assert.equal(hooks,1);
    if(modifies)assert.throws(()=>tx.getVersion(ref),/before pending writes/);
    else assert.deepEqual(tx.getVersion(ref),{...ref,value:old.value},'a query exception without mutation remains recoverable');
    throw Error('deliberate F3 exception rollback');
   }),/deliberate F3 exception rollback/);
   active=null;
   assert.deepEqual(snapshot(f),before);
   assert.throws(()=>handle.getVersion(ref),/expired/);
   const fresh=new PeerLedger(f.root);
   try{
    assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
    assert.deepEqual(fresh.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
    assert.equal(fresh.verify().complete,true);
   }finally{fresh.close();}
   assert.deepEqual(snapshot(f),before);
  }finally{armed=false;active=null;f.close();}
 }
});

test('historical row retrieval revalidates mutation state even after a real SELECT has returned',()=>{
 for(const throwsAfter of [false,true]){
  const f=peerFixture(),originalQuery=f.ledger.query;
  let armed=false,active,hooks=0,handle;
  const injected=Error('F3 injected retrieval completion error');
  try{
   const old=f.ledger.write('f3.retrieval.seed','cos-a',tx=>tx.put('tasks','f3-retrieval-target',{state:'planned'},0));
   const ref=historyReference(old),value={state:'completed'},proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)},before=snapshot(f);
   // Controlled host seam around the real StatementSync.get. No rows or ledger
   // results are fabricated: the actual SELECT runs before the ordinary put.
   f.ledger.query=function(sql,...parameters){
    const statement=originalQuery.call(this,sql,...parameters);
    if(!armed||sql!==f3HistorySQL)return statement;
    armed=false;
    return {get(...bindings){
     const row=statement.get(...bindings);
     assert.equal(row.sha256,old.sha256);
     hooks++;
     active.put('tasks',old.id,value,old.revision);
     if(throwsAfter)throw injected;
     return row;
    }};
   };
   assert.throws(()=>f.ledger.write('f3.retrieval.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('f3.retrieval.buffered',{});
    armed=true;
    assert.throws(()=>tx.getVersion(ref),error=>{
     if(throwsAfter){
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length,2);
      assert.equal(error.errors[0],injected);
      assert.match(error.errors[1].message,/before pending writes/);
     }else assert.match(error.message,/before pending writes/);
     return true;
    });
    assert.equal(hooks,1);
    assert.equal(tx.get('tasks',old.id).sha256,proposed.sha256);
    throw Error('deliberate F3 retrieval rollback');
   }),/deliberate F3 retrieval rollback/);
   active=null;f.ledger.query=originalQuery;
   assert.deepEqual(snapshot(f),before);
   assert.throws(()=>handle.getVersion(ref),/expired/);
   const fresh=new PeerLedger(f.root);
   try{
    assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
    assert.deepEqual(fresh.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
    assert.equal(fresh.verify().complete,true);
   }finally{fresh.close();}
   assert.deepEqual(snapshot(f),before);
  }finally{armed=false;active=null;f.ledger.query=originalQuery;f.close();}
 }
});

test('connection loss inside a historical query hook cannot return evidence or successful completion',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file);
 let armed=false,hooks=0,handle,lookupError,transactionReturned=false;
 const owner=new PeerLedger(f.root,{connection:db,onQuery:q=>{
  if(!armed||q.sql!==f3HistorySQL)return;
  armed=false;hooks++;
  // Controlled connection-loss fault, not a claim of raw-host confinement.
  db.close();
 }}),sibling=new PeerLedger(f.root,{connection:db});
 try{
  const old=f.ledger.write('f3.loss.seed','cos-a',tx=>tx.put('tasks','f3-loss-target',{state:'planned'},0));
  const ref=historyReference(old),before=snapshot(f);
  assert.throws(()=>{
   owner.write('f3.loss.owner','cos-a',tx=>{
    handle=tx;
    tx.event('f3.loss.buffered',{});
    armed=true;
    assert.throws(()=>tx.getVersion(ref),error=>{
     lookupError=error;
     assert.ok(error instanceof AggregateError);
     assert.equal(error.errors.length,2,'retain the query failure and failed boundary validation');
     return true;
    });
    return 'a swallowed lookup failure cannot make a lost transaction succeed';
   });
   transactionReturned=true;
  });
  assert.equal(transactionReturned,false);
  assert.equal(hooks,1);
  assert.ok(lookupError instanceof AggregateError);
  assert.equal(db.isOpen,false);
  assert.throws(()=>handle.getVersion(ref),/expired/);
  let entered=false;
  assert.throws(()=>sibling.read(()=>{entered=true;}));
  assert.equal(entered,false);
  assert.deepEqual(snapshot(f),before);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.equal(f.ledger.verify().complete,true);
  assert.deepEqual(snapshot(f),before);
 }finally{armed=false;owner.close();sibling.close();if(db.isOpen)db.close();f.close();}
});

// Collection-only regressions. The preceding 39 tests remain unchanged.
const collectionGenerationSQL='SELECT generation FROM peer_generations WHERE family=?';
const collectionHooks={
 generation:sql=>sql===collectionGenerationSQL,
 membership:sql=>sql.startsWith('SELECT COALESCE(SUM(count),0) AS n FROM peer_membership'),
 count:sql=>sql.startsWith('SELECT COUNT(*) AS n FROM (SELECT 1 FROM peer_rows'),
 body:sql=>sql.startsWith('SELECT * FROM peer_rows WHERE ')&&sql.includes(' AND id>? ORDER BY id LIMIT ?'),
 anchor:sql=>sql==='SELECT * FROM peer_rows WHERE family=? AND id=?',
 version:sql=>sql==='SELECT revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? ORDER BY revision DESC LIMIT 1',
 creation:sql=>sql==='SELECT bytes FROM peer_events WHERE seq=?',
 event:sql=>sql==='SELECT * FROM peer_events WHERE seq=?'
};
function collectionHasError(error,expected){
 if(expected instanceof RegExp?expected.test(String(error?.message)):error===expected)return true;
 return error instanceof AggregateError&&error.errors.some(item=>collectionHasError(item,expected));
}
function collectionBoundaryError(error){
 assert.ok(collectionHasError(error,/List after pending writes|failed row mutation/),String(error));
 return true;
}
function collectionState(db){return JSON.parse(JSON.stringify(connectionTableState(db)));}
function collectionSeed(f){
 return f.ledger.write('collection.seed','cos-a',tx=>['a','b','c'].map(id=>tx.put('tasks',id,{status:'planned',principal_id:'cos-a',scope:'collection-scope',content:id},0)));
}
function collectionOptions(f,shape){
 const base={status:'planned',scope:'collection-scope',limit:1};
 if(shape==='continued')return {...base,cursor:f.ledger.read(tx=>tx.list('tasks',base)).next_cursor};
 if(shape==='empty')return {...base,status:'absent'};
 return base;
}
function collectionExpectedMutation(before,old,value,partial=false){
 // These cases change content only, so membership and indexed dimensions stay
 // unchanged. Predict the actual uncommitted SQL state, including unchanged
 // event/outbox/head tables, rather than substituting synthetic query results.
 const expected=JSON.parse(JSON.stringify(before));
 const revision=old.revision+1,sha256=peerDigest(value),bytes=canonical(value);
 expected.peer_versions.push({family:'tasks',id:old.id,revision,sha256,bytes});
 if(!partial){
  const row=expected.peer_rows.find(item=>item.family==='tasks'&&item.id===old.id);
  assert.ok(row);
  Object.assign(row,{revision,sha256,bytes});
  expected.peer_generations.find(item=>item.family==='tasks').generation++;
 }
 return expected;
}
function collectionAssertRollback(f,before,old,value){
 assert.deepEqual(snapshot(f),before,'all seven ledger tables return to the original committed state');
 const ref=historyReference(old),proposed={...ref,revision:old.revision+1,sha256:peerDigest(value)};
 const fresh=new PeerLedger(f.root);
 try{
  assert.deepEqual(fresh.read(tx=>tx.get('tasks',old.id)),old);
  assert.deepEqual(fresh.read(tx=>tx.getVersion(ref)),{...ref,value:old.value});
  assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/historical version is unavailable/);
  assert.equal(fresh.verify().complete,true);
 }finally{fresh.close();}
 assert.deepEqual(snapshot(f),before);
}

test('collection query hooks reject successful same-handle writes on initial continued filtered and empty pages',()=>{
 for(const shape of ['initial','continued','empty']){
  const points=shape==='empty'?['generation','membership','count','body']:['generation','membership','count','body','version','creation','event',...(shape==='continued'?['anchor']:[])];
  for(const point of points){
   let armed=false,active,old,value,changed,hits=0;
   const f=peerFixture({onQuery:q=>{
    if(!armed||!collectionHooks[point](q.sql))return;
    armed=false;hits++;
    changed=active.put('tasks',old.id,value,old.revision);
   }});
   try{
    const rows=collectionSeed(f),options=collectionOptions(f,shape);
    old=rows[shape==='continued'?1:0];value={...old.value,content:'pending '+shape+' '+point};
    const before=snapshot(f),sqlBefore=collectionState(f.ledger.db),expected=collectionExpectedMutation(sqlBefore,old,value);
    let handle,escaped=false;
    assert.throws(()=>f.ledger.write('collection.hook.rollback','cos-a',tx=>{
     active=tx;handle=tx;
     tx.event('collection.buffered.before.list',{shape,point});
     armed=true;
     assert.throws(()=>{tx.list('tasks',options);escaped=true;},collectionBoundaryError);
     assert.equal(escaped,false);
     assert.equal(hits,1,'reach the actual '+point+' hook on '+shape);
     assert.equal(changed.revision,old.revision+1);
     assert.equal(changed.created_seq,old.created_seq,'the pre-existing creation event remains valid');
     assert.equal(changed.sha256,peerDigest(value));
     assert.deepEqual(collectionState(f.ledger.db),expected,'enumeration rejection preserves exactly the successful nested write');
     assert.deepEqual(tx.get('tasks',old.id),changed);
     assert.throws(()=>tx.list('tasks',options),/List after pending writes/);
     throw Error('deliberate collection hook rollback');
    }),/deliberate collection hook rollback/);
    active=null;
    assert.equal(hits,1);assert.equal(escaped,false);
    assert.equal(f.ledger.db.isTransaction,false);
    assert.throws(()=>handle.list('tasks',options),/expired/);
    collectionAssertRollback(f,before,old,value);
   }finally{armed=false;active=null;f.close();}
  }
 }
});

test('collection hooks swallowing a real post-history put failure reject pages and poison normal callback completion',()=>{
 for(const point of ['generation','body','version']){
  let armed=false,faultArmed=false,active,old,value,hits=0,faults=0,nestedError;
  const injected=Error('collection post-history canonical-row preparation failure');
  const f=peerFixture({onQuery:q=>{
   if(faultArmed&&q.sql.startsWith('INSERT INTO peer_rows')){
    faultArmed=false;faults++;throw injected;
   }
   if(!armed||!collectionHooks[point](q.sql))return;
   armed=false;hits++;faultArmed=true;
   try{active.put('tasks',old.id,value,old.revision);}catch(error){nestedError=error;}
  }});
  try{
   old=collectionSeed(f)[0];value={...old.value,content:'partial '+point};
   const options=collectionOptions(f,'initial'),before=snapshot(f);
   const expected=collectionExpectedMutation(collectionState(f.ledger.db),old,value,true);
   let handle,callbackReturned=false,escaped=false;
   assert.throws(()=>f.ledger.write('collection.poison.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('collection.poison.buffered',{});
    armed=true;
    assert.throws(()=>{tx.list('tasks',options);escaped=true;},error=>{
     assert.ok(collectionHasError(error,/failed row mutation/));return true;
    });
    assert.equal(hits,1);assert.equal(faults,1);assert.equal(nestedError,injected);
    assert.equal(escaped,false);
    assert.deepEqual(collectionState(f.ledger.db),expected,'the real history INSERT occurred, but canonical row and all remaining tables are unchanged');
    for(const operation of [
     ()=>tx.list('tasks',options),()=>tx.get('tasks',old.id),
     ()=>tx.getVersion(historyReference(old)),()=>tx.count('tasks'),
     ()=>tx.event('collection.poison.late',{})
    ])assert.throws(operation,/failed row mutation/);
    callbackReturned=true;
    return 'a caught partial put must still force rollback';
   }),/failed row mutation/);
   active=null;
   assert.equal(callbackReturned,true);assert.equal(escaped,false);
   assert.equal(f.ledger.db.isTransaction,false);
   assert.throws(()=>handle.list('tasks'),/expired/);
   collectionAssertRollback(f,before,old,value);
  }finally{armed=false;faultArmed=false;active=null;f.close();}
 }
});

test('collection boundaries reject writes after actual SQLite generation and body retrieval including empty and continued pages',()=>{
 const cases=[['generation','initial'],['body','initial'],['body','continued'],['body','empty']];
 for(const [point,shape] of cases)for(const throwsAfter of [false,true]){
  const f=peerFixture(),originalQuery=f.ledger.query;
  let armed=false,active,changed,hits=0,handle,escaped=false;
  const injected=Error('collection retrieval completion fault');
  try{
   const rows=collectionSeed(f),options=collectionOptions(f,shape),old=rows[shape==='continued'?1:0];
   const value={...old.value,content:'retrieval '+point+' '+shape};
   const before=snapshot(f),expected=collectionExpectedMutation(collectionState(f.ledger.db),old,value);
   // A controlled seam around the real StatementSync method. The real query
   // runs first and its original result is returned, never fabricated rows.
   f.ledger.query=function(sql,...parameters){
    const statement=originalQuery.call(this,sql,...parameters);
    if(!armed||!collectionHooks[point](sql))return statement;
    armed=false;
    const method=point==='body'?'all':'get';
    return {[method](...bindings){
     const result=statement[method](...bindings);
     hits++;
     if(point==='body')assert.equal(result.length===0,shape==='empty');
     else assert.ok(Number.isSafeInteger(result.generation));
     changed=active.put('tasks',old.id,value,old.revision);
     if(throwsAfter)throw injected;
     return result;
    }};
   };
   assert.throws(()=>f.ledger.write('collection.retrieval.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('collection.retrieval.buffered',{});
    armed=true;
    assert.throws(()=>{tx.list('tasks',options);escaped=true;},error=>{
     collectionBoundaryError(error);
     if(throwsAfter)assert.ok(collectionHasError(error,injected),'retain the original retrieval exception');
     return true;
    });
    assert.equal(hits,1);assert.equal(escaped,false);
    assert.equal(changed.sha256,peerDigest(value));
    assert.deepEqual(collectionState(f.ledger.db),expected);
    assert.deepEqual(tx.get('tasks',old.id),changed);
    throw Error('deliberate collection retrieval rollback');
   }),/deliberate collection retrieval rollback/);
   active=null;f.ledger.query=originalQuery;
   assert.equal(hits,1);assert.equal(escaped,false);
   assert.throws(()=>handle.list('tasks'),/expired/);
   collectionAssertRollback(f,before,old,value);
  }finally{armed=false;active=null;f.ledger.query=originalQuery;f.close();}
 }
});

test('read-only collection telemetry and successful no-op hook puts preserve exact pages totals and cursors',()=>{
 for(const mode of ['read','write'])for(const shape of ['initial','continued','empty']){
  const points=shape==='continued'?['generation','anchor','body']:shape==='initial'?['generation','version','body']:['generation','body'];
  for(const point of points){
   let armed=false,active,old,hits=0;
   const f=peerFixture({onQuery:q=>{
    if(!armed||!collectionHooks[point](q.sql))return;
    armed=false;hits++;
    assert.deepEqual(active.get('tasks',old.id),old);
    assert.equal(active.count('tasks',{scope:'collection-scope'}),3);
    if(mode==='write')assert.deepEqual(active.put('tasks',old.id,old.value,old.revision),old);
    if(point==='generation')assert.equal(active.list('tasks',{scope:'collection-scope',limit:1}).total,3,'ordinary nested read-only enumeration remains supported');
   }});
   try{
    old=collectionSeed(f)[0];
    const options=collectionOptions(f,shape),expected=f.ledger.read(tx=>tx.list('tasks',options)),before=snapshot(f);
    let handle;
    const callback=tx=>{
     active=tx;handle=tx;armed=true;
     const result=tx.list('tasks',options);
     assert.equal(hits,1);
     assert.deepEqual(result,expected);
     assert.deepEqual(tx.getVersion(historyReference(old)),{...historyReference(old),value:old.value});
     assert.deepEqual(tx.list('tasks',options),expected);
     return result;
    };
    const result=mode==='read'?f.ledger.read(callback):f.ledger.write('collection.noop','cos-a',callback);
    active=null;
    assert.deepEqual(result,expected);
    assert.equal(result.total,shape==='empty'?0:3);
    assert.equal(result.complete,shape==='empty');
    if(shape==='empty')assert.deepEqual(result,{items:[],total:0,complete:true,next_cursor:null});
    else{
     assert.equal(result.items[0].id,shape==='continued'?'b':'a');
     const cursor=JSON.parse(Buffer.from(result.next_cursor,'base64url').toString('utf8'));
     assert.equal(cursor.generation,before.peer_generations.find(row=>row.family==='tasks').generation);
     assert.equal(cursor.after,result.items[0].id);
     assert.deepEqual(cursor.filters,{scope:['collection-scope'],status:['planned']});
    }
    assert.throws(()=>handle.list('tasks',options),/expired/);
    assert.deepEqual(snapshot(f),before);
    assert.equal(f.ledger.verify().complete,true);
    assert.deepEqual(snapshot(f),before);
   }finally{armed=false;active=null;f.close();}
  }
 }
});

test('collection query errors retain original identity and report a simultaneously changed boundary',()=>{
 for(const point of ['generation','body'])for(const modifies of [false,true]){
  let armed=false,active,old,value,changed,hits=0;
  const injected=Error('collection ordinary query-hook exception');
  const f=peerFixture({onQuery:q=>{
   if(!armed||!collectionHooks[point](q.sql))return;
   armed=false;hits++;
   if(modifies)changed=active.put('tasks',old.id,value,old.revision);
   throw injected;
  }});
  try{
   old=collectionSeed(f)[0];value={...old.value,content:'exception '+point};
   const options=collectionOptions(f,'initial'),expectedPage=f.ledger.read(tx=>tx.list('tasks',options));
   const before=snapshot(f),sqlBefore=collectionState(f.ledger.db);
   let handle;
   assert.throws(()=>f.ledger.write('collection.exception.rollback','cos-a',tx=>{
    active=tx;handle=tx;
    tx.event('collection.exception.buffered',{});
    armed=true;
    assert.throws(()=>tx.list('tasks',options),error=>{
     if(modifies){
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length,2);
      assert.equal(error.errors[0],injected);
      assert.match(error.errors[1].message,/List after pending writes/);
     }else assert.equal(error,injected);
     return true;
    });
    assert.equal(hits,1);
    assert.deepEqual(collectionState(f.ledger.db),modifies?collectionExpectedMutation(sqlBefore,old,value):sqlBefore);
    if(modifies){
     assert.deepEqual(tx.get('tasks',old.id),changed);
     assert.throws(()=>tx.list('tasks',options),/List after pending writes/);
    }else{
     assert.deepEqual(tx.list('tasks',options),expectedPage,'an ordinary query error remains recoverable');
     assert.deepEqual(tx.getVersion(historyReference(old)),{...historyReference(old),value:old.value});
    }
    throw Error('deliberate collection exception rollback');
   }),/deliberate collection exception rollback/);
   active=null;
   assert.throws(()=>handle.list('tasks'),/expired/);
   collectionAssertRollback(f,before,old,value);
  }finally{armed=false;active=null;f.close();}
 }
});

test('catching collection rejection permits explicit reconciliation and commit of a successful nested write',()=>{
 let armed=false,active,old,value,changed,hits=0;
 const f=peerFixture({onQuery:q=>{
  if(!armed||q.sql!==collectionGenerationSQL)return;
  armed=false;hits++;
  changed=active.put('tasks',old.id,value,old.revision);
 }});
 try{
  old=collectionSeed(f)[0];value={...old.value,content:'reconciled and committed'};
  const options=collectionOptions(f,'initial'),oldPage=f.ledger.read(tx=>tx.list('tasks',options));
  const before=snapshot(f),expected=collectionExpectedMutation(collectionState(f.ledger.db),old,value);
  const result=f.ledger.write('collection.reconciled','cos-a',tx=>{
   active=tx;armed=true;
   assert.throws(()=>tx.list('tasks',options),collectionBoundaryError);
   assert.equal(hits,1);
   assert.deepEqual(collectionState(f.ledger.db),expected);
   assert.deepEqual(tx.get('tasks',old.id),changed);
   assert.throws(()=>tx.list('tasks',options),/List after pending writes/);
   tx.event('collection.write.reconciled',{id:old.id,sha256:changed.sha256});
   return changed;
  });
  active=null;
  assert.deepEqual(result,changed);
  const fresh=new PeerLedger(f.root);
  try{
   assert.deepEqual(fresh.read(tx=>tx.get('tasks',old.id)),changed);
   assert.deepEqual(fresh.read(tx=>tx.getVersion(historyReference(changed))),{...historyReference(changed),value});
   assert.deepEqual(fresh.read(tx=>tx.getVersion(historyReference(old))),{...historyReference(old),value:old.value});
   assert.throws(()=>fresh.read(tx=>tx.list('tasks',{...options,cursor:oldPage.next_cursor})),/Stale/);
   const page=fresh.read(tx=>tx.list('tasks',options));
   assert.deepEqual(page.items,[changed]);assert.equal(page.total,3);
   assert.equal(fresh.verify().complete,true);
  }finally{fresh.close();}
  const after=snapshot(f);
  assert.equal(after.peer_events.length,before.peer_events.length+1);
  assert.equal(after.peer_outbox.length,before.peer_outbox.length+1);
  assert.equal(after.peer_versions.length,before.peer_versions.length+1);
 }finally{armed=false;active=null;f.close();}
});

test('connection loss during collection preparation or after real retrieval cannot expose a page or successful transaction',()=>{
 for(const point of ['prepare','retrieval']){
  const f=peerFixture(),db=new DatabaseSync(f.file);
  let armed=false,hits=0,handle,lookupError,escaped=false,transactionReturned=false;
  const owner=new PeerLedger(f.root,{connection:db,onQuery:q=>{
   if(!armed||point!=='prepare'||q.sql!==collectionGenerationSQL)return;
   armed=false;hits++;
   db.close();
  }}),sibling=new PeerLedger(f.root,{connection:db}),originalQuery=owner.query;
  try{
   const old=collectionSeed(f)[0],options=collectionOptions(f,'initial'),before=snapshot(f);
   owner.query=function(sql,...parameters){
    const statement=originalQuery.call(this,sql,...parameters);
    if(!armed||point!=='retrieval'||!collectionHooks.body(sql))return statement;
    armed=false;
    return {all(...bindings){
     const rows=statement.all(...bindings);
     assert.ok(rows.length>0);hits++;
     // Controlled loss of the actual connection after an actual SQLite read.
     db.close();
     return rows;
    }};
   };
   assert.throws(()=>{
    owner.write('collection.connection-loss','cos-a',tx=>{
     handle=tx;
     tx.event('collection.connection-loss.buffered',{});
     armed=true;
     assert.throws(()=>{tx.list('tasks',options);escaped=true;},error=>{lookupError=error;return true;});
     return 'swallowing a lookup error cannot revive a lost transaction';
    });
    transactionReturned=true;
   });
   assert.ok(lookupError);
   assert.equal(hits,1);assert.equal(escaped,false);assert.equal(transactionReturned,false);
   assert.equal(db.isOpen,false);
   assert.throws(()=>handle.list('tasks',options),/expired/);
   let entered=false;
   assert.throws(()=>sibling.read(()=>{entered=true;}));
   assert.equal(entered,false);
   assert.deepEqual(snapshot(f),before);
   const fresh=new PeerLedger(f.root);
   try{
    assert.deepEqual(fresh.read(tx=>tx.get('tasks',old.id)),old);
    assert.deepEqual(fresh.read(tx=>tx.getVersion(historyReference(old))),{...historyReference(old),value:old.value});
    assert.equal(fresh.read(tx=>tx.list('tasks',options)).total,3);
    assert.equal(fresh.verify().complete,true);
   }finally{fresh.close();}
   assert.deepEqual(snapshot(f),before);
  }finally{armed=false;owner.query=originalQuery;owner.close();sibling.close();if(db.isOpen)db.close();f.close();}
 }
});

test('external migration enumeration retains its before-API-write boundary without claiming outer content is committed',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file);
 let armed=false,active,staged,hits=0;
 const shared=new PeerLedger(f.root,{connection:db,onQuery:q=>{
  if(!armed||q.sql!==collectionGenerationSQL)return;
  armed=false;hits++;
  assert.deepEqual(active.put('tasks',staged.id,staged.value,staged.revision),staged);
 }});
 try{
  const old=collectionSeed(f)[0],before=snapshot(f),options=collectionOptions(f,'initial');
  const value={...old.value,content:'outer transaction staged value'};
  db.exec('BEGIN IMMEDIATE');
  staged=shared.writeWithin('collection.external.stage','cos-a',tx=>tx.put('tasks',old.id,value,old.revision));
  assert.equal(db.isTransaction,true);
  const stagedState=collectionState(db);
  const page=shared.writeWithin('collection.external.enumerate','cos-a',tx=>{
   active=tx;armed=true;
   const result=tx.list('tasks',options);
   assert.equal(hits,1);
   assert.deepEqual(result.items,[staged]);assert.equal(result.total,3);
   assert.throws(()=>tx.getVersion(historyReference(staged)),/external transactions are excluded/);
   return result;
  });
  active=null;
  assert.deepEqual(page.items,[staged]);
  assert.deepEqual(collectionState(db),stagedState,'a no-op hook changes no SQL state');
  assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',old.id)),old,'another connection still sees committed state');
  assert.throws(()=>shared.writeWithin('collection.external.abort','cos-a',tx=>{
   tx.put('tasks',old.id,{...value,content:'later savepoint write'},staged.revision);
   assert.throws(()=>tx.list('tasks',options),/List after pending writes/);
   throw Error('deliberate collection external savepoint rollback');
  }),/deliberate collection external savepoint rollback/);
  assert.equal(db.isTransaction,true);
  assert.deepEqual(collectionState(db),stagedState);
  db.exec('ROLLBACK');
  collectionAssertRollback(f,before,old,value);
  assert.deepEqual(shared.read(tx=>tx.list('tasks',options)).items,[old]);
 }finally{armed=false;active=null;if(db.isTransaction)db.exec('ROLLBACK');shared.close();db.close();f.close();}
});

test('collection pagination retains its owning WAL snapshot across another connection commit',()=>{
 let armed=false,other,old,value,future,hits=0,writerState;
 const f=peerFixture({onQuery:q=>{
  if(!armed||q.sql!==collectionGenerationSQL)return;
  armed=false;hits++;
  future=other.write('collection.wal.writer','cos-b',tx=>{
   const updated=tx.put('tasks',old.id,value,old.revision);
   tx.put('tasks','d',{status:'planned',principal_id:'cos-b',scope:'collection-scope',content:'new committed row'},0);
   return updated;
  });
  writerState=snapshot(f);
 }});
 try{
  const rows=collectionSeed(f);old=rows[0];value={...old.value,content:'future WAL value'};
  other=new PeerLedger(f.root);
  const options=collectionOptions(f,'initial'),expectedFirst=f.ledger.read(tx=>tx.list('tasks',options));
  f.ledger.read(tx=>{
   armed=true;
   const first=tx.list('tasks',options);
   assert.equal(hits,1);
   assert.deepEqual(first,expectedFirst,'another connection cannot change the established read snapshot');
   const second=tx.list('tasks',{...options,cursor:first.next_cursor});
   const third=tx.list('tasks',{...options,cursor:second.next_cursor});
   assert.deepEqual(first.items,[rows[0]]);
   assert.deepEqual(second.items,[rows[1]]);
   assert.deepEqual(third.items,[rows[2]]);
   for(const page of [first,second,third])assert.equal(page.total,3);
   assert.equal(first.complete,false);assert.equal(second.complete,false);
   assert.equal(third.complete,true);assert.equal(third.next_cursor,null);
   assert.deepEqual(tx.getVersion(historyReference(old)),{...historyReference(old),value:old.value});
   assert.throws(()=>tx.getVersion(historyReference(future)),/historical version is unavailable/);
   assert.equal(tx.get('tasks','d'),null);
  });
  assert.equal(hits,1);
  assert.deepEqual(snapshot(f),writerState,'read-only enumeration cannot modify the concurrent writer commit');
  assert.throws(()=>f.ledger.read(tx=>tx.list('tasks',{...options,cursor:expectedFirst.next_cursor})),/Stale/);
  const current=f.ledger.read(tx=>tx.list('tasks',options));
  assert.deepEqual(current.items,[future]);assert.equal(current.total,4);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(historyReference(future))),{...historyReference(future),value});
  assert.equal(f.ledger.verify().complete,true);
  assert.deepEqual(snapshot(f),writerState);
 }finally{armed=false;other?.close();f.close();}
});

// External P1 review-selection mechanics. These fixtures exercise the candidate
// index and its integrity boundary; they establish no native review qualification.
const selectionRecipe='peer-review-selection-v1';
const selectionEmpty=()=>({items:[],total:0,complete:true,next_cursor:null,recipe:selectionRecipe});
const selectionRef=row=>({family:row.family??'reviews',id:row.id,revision:row.revision,sha256:row.sha256});
function selectionState(f){
 const db=new DatabaseSync(f.file);
 try{
  const names=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'peer_%' ORDER BY name").all().map(r=>r.name);
  return Object.fromEntries(names.map(name=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
 }finally{db.close();}
}

test('review selection fresh capability is read-only and explicit empty selectors return complete evidence',()=>{
 const f=peerFixture();try{
  const before=selectionState(f);
  for(const options of [{subjects:[],scopes:[]},{subjects:[],scopes:['repo/app']},{subjects:[],scopes:['*','unknown','repo/app'],limit:1}]){
   assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews(options)),selectionEmpty());
   assert.deepEqual(f.ledger.write('selection.empty.noop','founder',tx=>tx.queryCurrentReviews(options)),selectionEmpty());
  }
  assert.deepEqual(selectionState(f),before,'candidate discovery performs no repair or incidental write');
 }finally{f.close();}
});

test('review selection rejects malformed or unbounded selectors while preserving an owning read',()=>{
 const f=peerFixture();try{
  const ref={family:'proposals',id:'selection-subject',revision:1,sha256:'a'.repeat(64)};
  const invalid=[
   {subjects:[],scopes:[],extra:true},
   {subjects:'not-an-array',scopes:[]},
   {subjects:[{...ref,revision:0}],scopes:[]},
   {subjects:[{...ref,sha256:'not-a-hash'}],scopes:[]},
   {subjects:[{...ref,extra:true}],scopes:[]},
   {subjects:Array.from({length:101},(_,i)=>({...ref,id:`s${i}`})),scopes:[]},
   {subjects:[],scopes:'repo/app'},
   {subjects:[],scopes:[42]},
   {subjects:[],scopes:['']},
   {subjects:[],scopes:Array.from({length:17},(_,i)=>`scope-${i}`)},
   ...[0,-1,101,1.5,'1',null].map(limit=>({subjects:[],scopes:[],limit})),
   {subjects:[],scopes:[],cursor:'not-base64-json'}
  ];
  const before=selectionState(f);
  f.ledger.read(tx=>{
   for(const options of invalid){
    assert.throws(()=>tx.queryCurrentReviews(options),undefined,JSON.stringify(options));
    assert.deepEqual(tx.queryCurrentReviews({subjects:[],scopes:[]}),selectionEmpty(),'malformed selection cannot poison a healthy read-only owner');
   }
   assert.deepEqual(tx.queryCurrentReviews({subjects:Array.from({length:100},(_,i)=>({...ref,id:`valid-${i}`})),scopes:Array.from({length:16},(_,i)=>`scope-${i}`),limit:100}),selectionEmpty());
  });
  assert.deepEqual(selectionState(f),before);
 }finally{f.close();}
});

test('review selection handles expire and physical writes fence discovery while successful no-ops preserve it',()=>{
 const f=peerFixture();try{
  const old=f.ledger.write('selection.guard.seed','founder',tx=>tx.put('notices','selection-guard',{status:'open',scope:'repo/app'},0));
  const options={subjects:[],scopes:['repo/app']};
  let escaped;
  f.ledger.read(tx=>{escaped=tx;assert.deepEqual(tx.queryCurrentReviews(options),selectionEmpty());});
  assert.throws(()=>escaped.queryCurrentReviews(options),/expired/i);
  const before=selectionState(f);
  f.ledger.write('selection.guard.noop','founder',tx=>{
   assert.deepEqual(tx.put('notices',old.id,old.value,old.revision),old);
   assert.deepEqual(tx.queryCurrentReviews(options),selectionEmpty());
  });
  assert.deepEqual(selectionState(f),before);
  assert.throws(()=>f.ledger.write('selection.guard.rollback','founder',tx=>{
   escaped=tx;
   tx.put('notices',old.id,{...old.value,content:'real change'},old.revision);
   assert.throws(()=>tx.queryCurrentReviews(options),/pending writes|mutation|after.*write/i);
   throw Error('deliberate selection rollback');
  }),/deliberate selection rollback/);
  assert.throws(()=>escaped.queryCurrentReviews(options),/expired/i);
  assert.deepEqual(selectionState(f),before);
 }finally{f.close();}
});

const {createHash:selectionCreateHash}=await import('node:crypto');
const selectionRawHash=text=>selectionCreateHash('sha256').update(text).digest('hex');
function selectionProduction(label,subject,{scope='foreign-scope',verdict='Pass',definitionScope=scope}={}){
 // Deliberately synthetic P1 structural evidence. These exact records satisfy
 // extraction linkage only and are never used to claim P2 authority/independence.
 const taskId=`selection-task-${label}`,attemptId=`selection-attempt-${label}`,native=`synthetic-selection-native-${label}`;
 const reviewId=peerDigest(['review',taskId,attemptId]);
 const raw={subject,verdict,reason:`Synthetic index mechanics ${label}`,blockers:verdict==='Pass'?[]:[`Synthetic ${verdict}`]};
 const output=canonical({review:raw}),outputHash=selectionRawHash(output),contextHash=peerDigest(['synthetic-context',label]);
 const observation={kind:'runtime_observation',status:'recorded',action:'task/finish',task_id:taskId,attempt_id:attemptId,scope,
  output_sha256:outputHash,native_id:native,context_sha256:contextHash,termination_confirmed:true,review:raw};
 const observationRow={family:'effects',id:peerDigest(['runtime-observation',taskId,attemptId,'task/finish']),revision:1,sha256:peerDigest(observation),value:observation};
 const task={status:'returned',scope,definition:{scope:definitionScope},review_id:reviewId,review_of:subject,
  attempt:{id:attemptId,native_id:native,termination_confirmed:true,context:{sha256:contextHash}},
  result:{output,output_sha256:outputHash,native_id:native,error:null,termination_confirmed:true,observation:selectionRef(observationRow)}};
 const taskRow={family:'tasks',id:taskId,revision:1,sha256:peerDigest(task),value:task};
 const review={status:'accepted',scope,task_id:taskId,...raw,native_id:native,context_sha256:contextHash,output_sha256:outputHash,termination_confirmed:true,
  proof:{protocol:'peer-runtime-observation-v1',task:selectionRef(taskRow),observation:selectionRef(observationRow)}};
 const reviewRow={family:'reviews',id:reviewId,revision:1,sha256:peerDigest(review),value:review};
 return {task:taskRow,observation:observationRow,review:reviewRow};
}
function selectionPutProduction(tx,production,order=['observation','task','review']){
 for(const key of order){const row=production[key];assert.deepEqual(selectionRef({...tx.put(row.family,row.id,row.value,0),family:row.family}),selectionRef(row));}
 return production.review;
}
function selectionSubject(f,label='subject'){
 return selectionRef({...f.ledger.write('selection.synthetic.subject','founder',tx=>tx.put('proposals',`selection-${label}`,{status:'pending',scope:'subject-scope',synthetic:'P1 index mechanics only'},0)),family:'proposals'});
}
function selectionSeed(f,productions,{batch=25,order}={}){
 for(let offset=0;offset<productions.length;offset+=batch)f.ledger.write('selection.synthetic.production','founder',tx=>{
  for(const production of productions.slice(offset,offset+batch))selectionPutProduction(tx,production,order);
 });
}

test('review selection derives protected facts from the final transaction write set in every producer ordering',()=>{
 for(const order of [['observation','task','review'],['review','task','observation'],['task','review','observation']]){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(order.join('-'),subject,{scope:'repo/app',verdict:'Blocked'});
   selectionSeed(f,[production],{order});
   const before=selectionState(f);
   const page=f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['repo/app']}));
   assert.deepEqual(page.items.map(selectionRef),[selectionRef(production.review)]);
   assert.deepEqual(page.items[0].value,production.review.value);
   assert.equal(page.total,1);assert.equal(page.complete,true);assert.equal(page.next_cursor,null);assert.equal(page.recipe,selectionRecipe);
   assert.deepEqual(selectionState(f),before);
  }finally{f.close();}
 }
});

test('review selection unions exact cross-scope subjects with requested global and unknown adverse scopes without duplicate rows',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f),other=selectionSubject(f,'other');
  const productions=[
   selectionProduction('scope-exact-pass',subject,{scope:'unrelated',verdict:'Pass'}),
   selectionProduction('scope-exact-fail',subject,{scope:'repo/app',verdict:'Fail'}),
   selectionProduction('scope-local',other,{scope:'repo/app',verdict:'Blocked'}),
   selectionProduction('scope-global',other,{scope:'*',verdict:'Fail'}),
   selectionProduction('scope-unknown',other,{scope:'unknown',verdict:'Blocked'}),
   selectionProduction('scope-unrelated',other,{scope:'unrelated',verdict:'Blocked'})
  ];
  selectionSeed(f,productions);
  const expected=productions.slice(0,5).map(p=>p.review).sort((a,b)=>a.id.localeCompare(b.id));
  f.ledger.read(tx=>{
   const options={subjects:[subject],scopes:['repo/app'],limit:2};
   const pages=[],items=[];let cursor;
   do{const page=tx.queryCurrentReviews({...options,...(cursor?{cursor}:{})});pages.push(page);items.push(...page.items);cursor=page.next_cursor;}while(cursor);
   assert.deepEqual(items.map(selectionRef),expected.map(selectionRef));
   assert.equal(new Set(items.map(r=>r.id)).size,5);
   for(const page of pages)assert.equal(page.total,5);
   assert.equal(pages.at(-1).complete,true);
   const exact=tx.queryCurrentReviews({subjects:[subject],scopes:[]});
   assert.deepEqual(exact.items.map(selectionRef),productions.slice(0,2).map(p=>p.review).sort((a,b)=>a.id.localeCompare(b.id)).map(selectionRef));
  });
 }finally{f.close();}
});

const selectionIntegrity=error=>{
 assert.equal(error.code,'REVIEW_SELECTION_INTEGRITY');
 assert.match(error.message,/review|selection|projection|integrity|dirty/i);
 assert.notEqual(error.code,'REVIEW_HELD','integrity uncertainty is not a semantic Fail veto');
 return true;
};

test('review selection holds every protected current alias contradiction and repairs only by a retained new exact revision',()=>{
 const changes=[
  ['status',v=>({...v,status:'pending'})],
  ['subject',v=>({...v,subject:{...v.subject,id:'different-subject'}})],
  ['scope',v=>({...v,scope:'different-scope'})],
  ['verdict',v=>({...v,verdict:'Pass',blockers:[]})],
  ['proof-task',v=>({...v,proof:{...v.proof,task:{...v.proof.task,id:'benign-substituted-task'}}})],
  ['stripped-runtime',v=>({...v,verdict:'Pass',blockers:[],proof:{protocol:'peer-native-review-v1'}})],
  ['combined',v=>({...v,status:'pending',scope:'different-scope',subject:{...v.subject,id:'different-subject'},verdict:'Pass',blockers:[],proof:{protocol:'peer-native-review-v1'}})]
 ];
 for(const [label,change] of changes){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`alias-${label}`,subject,{scope:'foreign-scope',verdict:'Fail'});
   selectionSeed(f,[production]);
   assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items.map(selectionRef),[selectionRef(production.review)]);
   let contradictory=change(production.review.value);
   if(label==='proof-task'){
    const benign=selectionProduction('benign-substitute',selectionSubject(f,'benign-subject'),{verdict:'Pass'});
    selectionSeed(f,[benign]);
    contradictory={...production.review.value,proof:{...production.review.value.proof,task:selectionRef(benign.task)}};
   }
   const bad=f.ledger.write('selection.synthetic.alias-change','founder',tx=>tx.put('reviews',production.review.id,contradictory,1));
   assert.equal(bad.revision,2,'generic canonical updates retain the contradictory evidence rather than deleting it');
   const before=selectionState(f);
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated-request']})),selectionIntegrity,label);
   assert.deepEqual(selectionState(f),before);
   const replacement=selectionProduction(`replacement-${label}`,subject,{scope:'foreign-scope',verdict:'Pass'});
   selectionSeed(f,[replacement]);
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),selectionIntegrity,'a different positive review cannot repair lost binding');
   const repaired=f.ledger.write('selection.synthetic.binding-correction','founder',tx=>tx.put('reviews',production.review.id,production.review.value,2));
   assert.equal(repaired.revision,3);
   f.ledger.read(tx=>{
    const selected=tx.queryCurrentReviews({subjects:[subject],scopes:[]});
    assert.equal(selected.total,2);
    assert.deepEqual(selected.items.find(r=>r.id===production.review.id),repaired);
    assert.deepEqual(tx.getVersion(selectionRef(bad)).value,bad.value,'the contradictory historical revision remains available');
    assert.deepEqual(tx.getVersion(selectionRef(production.review)).value,production.review.value);
   });
  }finally{f.close();}
 }
});

test('review selection keeps demonstrably manual legacy Pass discoverable without permitting stripped protected origin to become manual',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f);
  const manual=f.ledger.write('selection.synthetic.manual','founder',tx=>tx.put('reviews','manual',{status:'accepted',scope:'legacy-scope',subject,verdict:'Pass',blockers:[],reviewer_principal_id:'synthetic-manual',termination_confirmed:true,proof:{protocol:'peer-native-review-v1'}},0));
  assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['legacy-scope']})),selectionEmpty());
  assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items,[manual]);
  const production=selectionProduction('manual-coexists-protected',subject,{scope:'repo/app',verdict:'Pass'});
  selectionSeed(f,[production]);
  assert.equal(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).total,2,'manual prefix does not block a separate protected production');
  const impossibleId='a'.repeat(64);
  f.ledger.write('selection.synthetic.ambiguous-origin','founder',tx=>tx.put('reviews',impossibleId,manual.value,0));
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['different']})),selectionIntegrity,'a producer-shaped identifier without complete provenance is never silently exempted');
 }finally{f.close();}
});

test('review selection holds missing malformed or wrong exact protected raw evidence instead of following latest task data',()=>{
 for(const mode of ['missing-output','malformed-output','wrong-task-hash','missing-observation']){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`raw-${mode}`,subject,{verdict:'Blocked'});
   if(mode==='missing-output'||mode==='malformed-output'){
    production.task.value.result.output=mode==='missing-output'?null:'{';
    production.task.sha256=peerDigest(production.task.value);
    production.review.value.proof.task=selectionRef(production.task);
   }
   if(mode==='wrong-task-hash')production.review.value.proof.task.sha256='f'.repeat(64);
   if(mode==='missing-observation')production.review.value.proof.observation.id='missing-exact-observation';
   production.review.sha256=peerDigest(production.review.value);
   selectionSeed(f,[production]);
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated']})),selectionIntegrity,mode);
   assert.deepEqual(f.ledger.read(tx=>tx.get('reviews',production.review.id)).value,production.review.value,'unknown extraction retains canonical evidence for an authorized correction');
  }finally{f.close();}
 }
});

test('review selection scans indexed matches rather than hydrating 10001 unrelated protected bodies and holds 10001 genuine matches',()=>{
 const f=peerFixture();try{
  const foreign=selectionSubject(f,'scale-foreign'),target=selectionSubject(f,'scale-target');
  const unrelated=Array.from({length:10001},(_,i)=>selectionProduction(`scale-${String(i).padStart(5,'0')}`,foreign,{scope:'foreign-scale',verdict:'Fail'}));
  selectionSeed(f,unrelated.slice(0,10000));
  const atBound=f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[foreign],scopes:[],limit:1}));
  assert.equal(atBound.total,10000);assert.equal(atBound.items.length,1);assert.equal(atBound.complete,false);
  const scopeAtBound=f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['foreign-scale'],limit:1}));
  assert.equal(scopeAtBound.total,10000);assert.equal(scopeAtBound.items.length,1);assert.equal(scopeAtBound.complete,false);
  selectionSeed(f,unrelated.slice(10000));
  const relevant=selectionProduction('scale-relevant',target,{scope:'repo/app',verdict:'Blocked'});
  selectionSeed(f,[relevant]);
  const bodyIds=new Set(),plans=[],original=f.ledger.query;
  f.ledger.query=function(sql,...parameters){
   const statement=Reflect.apply(original,this,[sql,...parameters]);
   if(!/^\s*SELECT\b/i.test(sql))return statement;
   return new Proxy(statement,{get(object,key){
    const value=Reflect.get(object,key,object);
    if(typeof value!=='function')return value;
    if(!['get','all'].includes(key))return value.bind(object);
    return (...args)=>{
     if(/peer_review_selection/.test(sql))plans.push(...f.ledger.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(r=>r.detail));
     const result=Reflect.apply(value,object,args);
     for(const row of Array.isArray(result)?result:[result])if(row?.family==='reviews'&&Object.hasOwn(row,'bytes'))bodyIds.add(row.id);
     return result;
    };
   }});
  };
  try{
   const scoped=f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['repo/app']}));
   assert.deepEqual(scoped.items.map(selectionRef),[selectionRef(relevant.review)]);
   assert.equal(scoped.total,1);
   assert.deepEqual([...bodyIds],[relevant.review.id],'no unrelated current review body is hydrated');
   assert.ok(plans.some(detail=>/peer_review_scope/.test(detail)),`scope selection must use its candidate index: ${plans.join('; ')}`);
   bodyIds.clear();plans.length=0;
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[foreign],scopes:[]})),error=>{
    assert.equal(error.code,'LOOKUP_CAPACITY');return true;
   });
   assert.equal(bodyIds.size,0,'capacity overflow is detected before hydrating a truncated candidate page');
   assert.ok(plans.some(detail=>/peer_review_subject/.test(detail)),`exact subject selection must use its candidate index: ${plans.join('; ')}`);
   bodyIds.clear();plans.length=0;
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['foreign-scale']})),error=>{
    assert.equal(error.code,'LOOKUP_CAPACITY');return true;
   });
   assert.equal(bodyIds.size,0,'scope overflow is also detected before current bodies are hydrated');
   assert.ok(plans.some(detail=>/peer_review_scope/.test(detail)),`adverse scope overflow must use its candidate index: ${plans.join('; ')}`);
   assert.equal(plans.some(detail=>/TEMP B-TREE/i.test(detail)),false,'bounded scope arms must not sort the unrelated global candidate population');
   const bounded=f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[target],scopes:['repo/app'],limit:1}));
   assert.equal(bounded.total,1,'overlap is deduplicated before applying the match bound');
   assert.deepEqual(bounded.items.map(selectionRef),[selectionRef(relevant.review)]);
  }finally{f.ledger.query=original;}
 }finally{f.close();}
});

test('review selection cursors bind exact selector and owning snapshot lifetime without silently restarting',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f),productions=Array.from({length:3},(_,i)=>selectionProduction(`cursor-${i}`,subject,{scope:'repo/app'}));
  selectionSeed(f,productions);
  const ordered=productions.map(p=>p.review).sort((a,b)=>a.id.localeCompare(b.id)),options={subjects:[subject],scopes:[],limit:1};
  let escapedCursor,handle;
  const before=selectionState(f);
  f.ledger.read(tx=>{
   handle=tx;
   const first=tx.queryCurrentReviews(options);escapedCursor=first.next_cursor;
   assert.deepEqual(first.items.map(selectionRef),[selectionRef(ordered[0])]);
   assert.throws(()=>tx.queryCurrentReviews({...options,subjects:[{...subject,id:'other-subject'}],cursor:first.next_cursor}),/cursor|selector/i);
   assert.throws(()=>tx.queryCurrentReviews({...options,scopes:['repo/app'],cursor:first.next_cursor}),/cursor|selector/i);
   const parsed=JSON.parse(Buffer.from(first.next_cursor,'base64url').toString('utf8'));
   const forged=Buffer.from(JSON.stringify({...parsed,recipe:'unknown-selection-recipe'})).toString('base64url');
   assert.throws(()=>tx.queryCurrentReviews({...options,cursor:forged}),/cursor|recipe/i);
   const second=tx.queryCurrentReviews({...options,cursor:first.next_cursor}),third=tx.queryCurrentReviews({...options,cursor:second.next_cursor});
   assert.deepEqual(second.items.map(selectionRef),[selectionRef(ordered[1])]);
   assert.deepEqual(third.items.map(selectionRef),[selectionRef(ordered[2])]);
   assert.equal(third.total,3);assert.equal(third.complete,true);assert.equal(third.next_cursor,null);
  });
  assert.throws(()=>handle.queryCurrentReviews({...options,cursor:escapedCursor}),/expired/i);
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({...options,cursor:escapedCursor})),/cursor|snapshot|stale/i,'even an unchanged generation cannot authorize an escaped snapshot cursor');
  assert.deepEqual(selectionState(f),before);
 }finally{f.close();}
});

const {REVIEW_PRODUCER_RECIPE:selectionProducerRecipe}=await import('../plugins/soloco/runtime/peers/review-selection.mjs');
function selectionSQL(f,fn){const db=new DatabaseSync(f.file);try{return fn(db);}finally{db.close();}}
function selectionLegacyCopy(f){
 // A retained isolated fixture is downgraded to the accepted pre-query schema.
 // This is migration mechanics, never an operation on an actual company.
 selectionSQL(f,db=>{
  const objects=db.prepare("SELECT type,name FROM sqlite_schema WHERE name LIKE 'peer_review_%' ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
  for(const {type,name} of objects)db.exec(`DROP ${type.toUpperCase()} "${name}"`);
 });
}
const selectionUpgrade=f=>f.ledger.upgradeReviewSelection({retained_copy:true,producer_recipe:selectionProducerRecipe});

test('review selection requires explicit retained-copy producer admission and audits a complete legacy rebuild without rewriting canonical history',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f),productions=[selectionProduction('upgrade-pass',subject),selectionProduction('upgrade-fail',subject,{scope:'repo/app',verdict:'Fail'})];
  selectionSeed(f,productions);
  const canonicalBefore=snapshot(f);
  selectionLegacyCopy(f);
  const legacy=selectionState(f);
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})),error=>{assert.equal(error.code,'REVIEW_SELECTION_CAPABILITY');return true;});
  for(const options of [{},{retained_copy:true},{retained_copy:false,producer_recipe:selectionProducerRecipe},{retained_copy:true,producer_recipe:'unsupported-production'}])assert.throws(()=>f.ledger.upgradeReviewSelection(options),/retained|producer|admission/i);
  assert.deepEqual(selectionState(f),legacy,'ordinary reads and missing migration authorization never install a fallback');
  const result=selectionUpgrade(f);
  assert.equal(result.reviews,2);assert.equal(result.errors,0);assert.equal(result.clean,true);assert.equal(result.recipe,selectionRecipe);
  assert.deepEqual(snapshot(f),canonicalBefore,'rebuilding derived selection must not rewrite canonical rows, versions, events or memberships');
  assert.deepEqual(f.ledger.auditReviewSelection(),result);
  assert.equal(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).total,2);
 }finally{f.close();}
});

test('review selection audit detects equal-count missing-extra projection coverage and wrong exact hashes',()=>{
 for(const mode of ['missing-extra','wrong-hash']){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`audit-${mode}`,subject);
   selectionSeed(f,[production]);
   selectionSQL(f,db=>{
    if(mode==='missing-extra')db.prepare('UPDATE peer_review_selection SET review_id=? WHERE review_id=?').run('orphan-projection',production.review.id);
    else db.prepare('UPDATE peer_review_selection SET sha256=? WHERE review_id=?').run('e'.repeat(64),production.review.id);
    // Isolated corruption fixture: erase the trigger alarm to prove a full audit
    // compares identities and hashes, rather than accepting equal row counts.
    db.exec('DELETE FROM peer_review_dirty');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM peer_review_selection').get().n,1);
   });
   const before=selectionState(f);
   assert.throws(()=>f.ledger.auditReviewSelection(),error=>{assert.equal(error.code,'REVIEW_SELECTION_INTEGRITY');return true;});
   assert.deepEqual(selectionState(f),before,'a read-only audit cannot repair evidence under inspection');
   assert.equal(selectionUpgrade(f).clean,true,'an explicit full rebuild may repair derived metadata');
   assert.equal(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).total,1);
  }finally{f.close();}
 }
});

test('review selection legacy upgrade rejects orphan missing-first or missing-middle immutable history and publishes no partial capability',()=>{
 for(const mode of ['orphan','missing-first','missing-middle']){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`legacy-${mode}`,subject);
   selectionSeed(f,[production]);
   if(mode==='missing-middle'){
    f.ledger.write('selection.synthetic.legacy-revision-two','founder',tx=>tx.put('reviews',production.review.id,{...production.review.value,synthetic_revision:2},1));
    f.ledger.write('selection.synthetic.legacy-revision-three','founder',tx=>tx.put('reviews',production.review.id,{...production.review.value,synthetic_revision:3},2));
   }
   selectionLegacyCopy(f);
   selectionSQL(f,db=>{
    if(mode==='orphan')db.prepare("DELETE FROM peer_rows WHERE family='reviews' AND id=?").run(production.review.id);
    else{
     db.exec('DROP TRIGGER peer_history_delete');
     db.prepare("DELETE FROM peer_versions WHERE family='reviews' AND id=? AND revision=?").run(production.review.id,mode==='missing-middle'?2:1);
    }
   });
   const before=selectionState(f);
   assert.throws(()=>selectionUpgrade(f),/review|version|history|binding|canonical/i);
   assert.deepEqual(selectionState(f),before,'failed migration rolls back schema admission and all derived writes');
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),error=>{assert.equal(error.code,'REVIEW_SELECTION_CAPABILITY');return true;});
  }finally{f.close();}
 }
});

test('review selection dirty triggers fence older-writer updates and canonical review deletion remains forbidden',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f),production=selectionProduction('old-writer',subject,{scope:'repo/app',verdict:'Fail'});
  selectionSeed(f,[production]);
  const canonicalBefore=snapshot(f);
  selectionSQL(f,db=>{
   // Exercise an older cooperating writer's actual canonical UPDATE boundary;
   // no refresher is invoked. Identical bytes isolate the trigger mechanism.
   db.prepare("UPDATE peer_rows SET bytes=bytes WHERE family='reviews' AND id=?").run(production.review.id);
   assert.equal(db.prepare('SELECT review_id FROM peer_review_dirty').get().review_id,production.review.id);
  });
  const before=selectionState(f);
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['repo/app']})),error=>{assert.equal(error.code,'REVIEW_SELECTION_DIRTY');return true;});
  assert.deepEqual(selectionState(f),before);
  assert.throws(()=>selectionSQL(f,db=>db.prepare("DELETE FROM peer_rows WHERE family='reviews' AND id=?").run(production.review.id)),/deletion|forbidden/i);
  assert.equal(selectionUpgrade(f).clean,true);
  assert.deepEqual(snapshot(f),canonicalBefore);
  assert.equal(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['repo/app']})).total,1);
 }finally{f.close();}
});

test('review selection absence or alteration of an index trigger or capability recipe fails closed without scanning bodies',()=>{
 for(const mode of ['index','trigger','recipe']){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`schema-${mode}`,subject);
   selectionSeed(f,[production]);
   selectionSQL(f,db=>{
    if(mode==='index')db.exec('DROP INDEX peer_review_subject');
    if(mode==='trigger')db.exec('DROP TRIGGER peer_review_update');
    if(mode==='recipe')db.prepare('UPDATE peer_review_recipe SET recipe=? WHERE id=1').run('incompatible-recipe');
   });
   const before=selectionState(f),queries=[],original=f.ledger.query;
   f.ledger.query=function(sql,...args){queries.push(sql);return Reflect.apply(original,this,[sql,...args]);};
   try{
    assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})),error=>{assert.equal(error.code,'REVIEW_SELECTION_CAPABILITY');return true;});
   }finally{f.ledger.query=original;}
   assert.equal(queries.some(sql=>/SELECT .*FROM peer_rows WHERE family='reviews'/i.test(sql)),false,'missing capability cannot invoke a global canonical-body fallback');
   assert.deepEqual(selectionState(f),before);
  }finally{f.close();}
 }
});

test('review selection refresh and later event-flush failures roll back canonical history projection dirty state and generation together',()=>{
 for(const point of ['refresh','event-flush']){
  let armed=false,hits=0;
  const injected=Error(`synthetic selection ${point} failure`),f=peerFixture({onQuery:q=>{
   if(!armed||!(point==='refresh'?q.sql.startsWith('INSERT INTO peer_review_selection'):q.sql.startsWith('INSERT INTO peer_events')))return;
   armed=false;hits++;throw injected;
  }});
  try{
   const subject=selectionSubject(f),production=selectionProduction(`rollback-${point}`,subject,{scope:'repo/app',verdict:'Blocked'}),before=selectionState(f);
   armed=true;
   assert.throws(()=>f.ledger.write('selection.synthetic.rollback','founder',tx=>{
    selectionPutProduction(tx,production,['review','task','observation']);tx.event('synthetic.selection.buffered',{point});
   }),error=>{assert.equal(error,injected);return true;});
   assert.equal(hits,1);assert.deepEqual(selectionState(f),before);
   const fresh=new PeerLedger(f.root);try{
    fresh.read(tx=>{
     for(const row of [production.review,production.task,production.observation])assert.equal(tx.get(row.family,row.id),null);
     assert.deepEqual(tx.queryCurrentReviews({subjects:[subject],scopes:['repo/app']}),selectionEmpty());
    });
    assert.equal(fresh.auditReviewSelection().clean,true);
   }finally{fresh.close();}
  }finally{armed=false;f.close();}
 }
});

test('review selection interrupted retained-copy rebuild rolls back its capability and every partial projection row',()=>{
 let armed=false,hits=0;
 const injected=Error('synthetic second projection refresh failure'),f=peerFixture({onQuery:q=>{
  if(!armed||!q.sql.startsWith('INSERT INTO peer_review_selection'))return;
  if(++hits===2){armed=false;throw injected;}
 }});
 try{
  const subject=selectionSubject(f);
  selectionSeed(f,[selectionProduction('upgrade-interrupt-a',subject),selectionProduction('upgrade-interrupt-b',subject)]);
  selectionLegacyCopy(f);const before=selectionState(f);armed=true;
  assert.throws(()=>selectionUpgrade(f),error=>{assert.equal(error,injected);return true;});
  assert.equal(hits,2);assert.deepEqual(selectionState(f),before);
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})),error=>{assert.equal(error.code,'REVIEW_SELECTION_CAPABILITY');return true;});
  assert.equal(selectionUpgrade(f).reviews,2);
 }finally{armed=false;f.close();}
});

test('review selection refuses an intermediate pending producing-task version despite its retained exact bytes',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f),production=selectionProduction('intermediate-pending',subject,{scope:'repo/app',verdict:'Fail'});
  f.ledger.write('selection.synthetic.intermediate','founder',tx=>{
   selectionPutProduction(tx,production);
   tx.put('tasks',production.task.id,{...production.task.value,synthetic_later_revision:true},1);
  });
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:['repo/app']})),selectionIntegrity,'immutable intermediate evidence cannot replace the producer’s final pending exact version');
  assert.equal(f.ledger.read(tx=>tx.get('tasks',production.task.id)).revision,2);
 }finally{f.close();}
});

const selectionHookPoints={
 capability:sql=>sql.startsWith('SELECT name,sql FROM sqlite_master'),
 dirty:sql=>sql==='SELECT review_id FROM peer_review_dirty LIMIT 1',
 subject:sql=>sql.startsWith('SELECT review_id FROM peer_review_selection INDEXED BY peer_review_subject'),
 body:sql=>sql==='SELECT * FROM peer_rows WHERE family=? AND id=?'
};
test('review selection query hooks cannot return old evidence after a real same-handle mutation at capability candidate or body boundaries',()=>{
 for(const [point,match] of Object.entries(selectionHookPoints)){
  let armed=false,active,hits=0;
  const f=peerFixture({onQuery:q=>{
   if(!armed||!match(q.sql))return;
   armed=false;hits++;active.put('notices',`selection-hook-${point}`,{status:'open',scope:'repo/app'},0);
  }});
  try{
   const subject=selectionSubject(f),production=selectionProduction(`hook-${point}`,subject);selectionSeed(f,[production]);
   const before=selectionState(f);let returned=false;
   assert.throws(()=>f.ledger.write('selection.synthetic.hook.rollback','founder',tx=>{
    active=tx;armed=true;
    assert.throws(()=>{tx.queryCurrentReviews({subjects:[subject],scopes:[]});returned=true;},/pending writes|mutation|after.*write/i);
    assert.equal(hits,1);assert.equal(returned,false);
    assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),/pending writes|mutation|after.*write/i);
    throw Error('deliberate selection hook rollback');
   }),/deliberate selection hook rollback/);
   active=null;assert.deepEqual(selectionState(f),before);
  }finally{armed=false;active=null;f.close();}
 }
});

test('review selection permits guarded read-only telemetry and successful no-op hook writes without changing evidence',()=>{
 for(const [point,match] of Object.entries(selectionHookPoints)){
  let armed=false,active,old,hits=0;
  const f=peerFixture({onQuery:q=>{
   if(!armed||!match(q.sql))return;
   armed=false;hits++;
   assert.deepEqual(active.get('notices',old.id),old);
   assert.deepEqual(active.put('notices',old.id,old.value,old.revision),old);
   assert.deepEqual(active.queryCurrentReviews({subjects:[],scopes:[]}),selectionEmpty(),'nested read-only discovery is supported');
  }});
  try{
   const subject=selectionSubject(f),production=selectionProduction(`noop-${point}`,subject);selectionSeed(f,[production]);
   old=f.ledger.write('selection.synthetic.noop.seed','founder',tx=>tx.put('notices','selection-noop',{status:'open',scope:'repo/app'},0));
   const before=selectionState(f);
   f.ledger.write('selection.synthetic.noop','founder',tx=>{
    active=tx;armed=true;
    assert.deepEqual(tx.queryCurrentReviews({subjects:[subject],scopes:[]}).items.map(selectionRef),[selectionRef(production.review)]);
   });
   active=null;assert.equal(hits,1);assert.deepEqual(selectionState(f),before);
  }finally{armed=false;active=null;f.close();}
 }
});

test('review selection revalidates after actual statement retrieval before returning a candidate page',()=>{
 const f=peerFixture();let active,armed=false,hits=0;const original=f.ledger.query;
 try{
  const subject=selectionSubject(f),production=selectionProduction('post-result',subject);selectionSeed(f,[production]);
  const before=selectionState(f);
  f.ledger.query=function(sql,...parameters){
   const statement=Reflect.apply(original,this,[sql,...parameters]);
   if(!sql.startsWith('SELECT review_id FROM peer_review_selection INDEXED BY peer_review_subject'))return statement;
   return new Proxy(statement,{get(object,key){
    const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
    if(key!=='all')return value.bind(object);
    return (...args)=>{
     const result=Reflect.apply(value,object,args);
     if(armed){armed=false;hits++;active.put('notices','selection-after-result',{status:'open',scope:'repo/app'},0);}
     return result;
    };
   }});
  };
  assert.throws(()=>f.ledger.write('selection.synthetic.post-result','founder',tx=>{
   active=tx;armed=true;
   assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),/pending writes|mutation|after.*write/i);
   assert.equal(hits,1);
   throw Error('deliberate selection post-result rollback');
  }),/deliberate selection post-result rollback/);
  active=null;assert.deepEqual(selectionState(f),before);
 }finally{armed=false;active=null;f.ledger.query=original;f.close();}
});

test('review selection final refresh closes public handles and preserves the physical connection owner against sibling wrappers',()=>{
 let armed=false,active,hits=0,owner,sibling;
 const f=peerFixture(),db=new DatabaseSync(f.file);
 owner=new PeerLedger(f.root,{connection:db,onQuery:q=>{
  if(!armed||!q.sql.startsWith('INSERT INTO peer_review_selection'))return;
  armed=false;hits++;
  assert.throws(()=>active.queryCurrentReviews({subjects:[],scopes:[]}),/closed|maintenance/i);
  assert.throws(()=>active.getVersion({family:'proposals',id:'anything',revision:1,sha256:'a'.repeat(64)}),/closed|maintenance/i);
  assert.throws(()=>active.put('notices','selection-final-reentry',{status:'open'},0),/closed|maintenance/i);
  assert.throws(()=>owner.read(()=>{}),/Nested|active/i);
  assert.throws(()=>sibling.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),/active transaction owner|ownership/i);
 }});
 sibling=new PeerLedger(f.root,{connection:db});
 try{
  const subject=selectionSubject(f),production=selectionProduction('final-refresh',subject);
  armed=true;
  owner.write('selection.synthetic.final-refresh','founder',tx=>{active=tx;selectionPutProduction(tx,production);});
  active=null;assert.equal(hits,1);
  assert.equal(sibling.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).total,1,'the owner releases only after final refresh commits');
  assert.equal(f.ledger.read(tx=>tx.get('notices','selection-final-reentry')),null);
 }finally{armed=false;active=null;owner.close();sibling.close();db.close();f.close();}
});

test('review selection excludes borrowed outer transactions without disturbing supported savepoint writes',()=>{
 const f=peerFixture(),db=new DatabaseSync(f.file),borrowed=new PeerLedger(f.root,{connection:db});
 try{
  const subject=selectionSubject(f),production=selectionProduction('borrowed',subject);selectionSeed(f,[production]);
  const before=selectionState(f);db.exec('BEGIN IMMEDIATE');
  borrowed.writeWithin('selection.synthetic.borrowed','founder',tx=>{
   assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),/external|owning|borrowed/i);
   tx.put('notices','selection-outer-pending',{status:'open',scope:'repo/app'},0);
  });
  assert.equal(db.isTransaction,true);
  assert.equal(f.ledger.read(tx=>tx.get('notices','selection-outer-pending')),null);
  db.exec('ROLLBACK');assert.deepEqual(selectionState(f),before);
 }finally{if(db.isTransaction)db.exec('ROLLBACK');borrowed.close();db.close();f.close();}
});

test('review selection owning WAL snapshot keeps stable pages while another connection commits a new review generation',()=>{
 let armed=false,hits=0,other,future;
 const f=peerFixture({onQuery:q=>{
  if(!armed||q.sql!=='SELECT * FROM peer_review_recipe WHERE id=1')return;
  armed=false;hits++;
  other.write('selection.synthetic.wal.future','founder',tx=>selectionPutProduction(tx,future));
 }});
 try{
  const subject=selectionSubject(f),productions=Array.from({length:3},(_,i)=>selectionProduction(`wal-${i}`,subject));
  selectionSeed(f,productions);future=selectionProduction('wal-future',subject);other=new PeerLedger(f.root);
  const ordered=productions.map(p=>p.review).sort((a,b)=>a.id.localeCompare(b.id)),options={subjects:[subject],scopes:[],limit:1};
  f.ledger.read(tx=>{
   armed=true;
   let cursor;const items=[];
   do{
    const page=tx.queryCurrentReviews({...options,...(cursor?{cursor}:{})});
    assert.equal(page.total,3);items.push(...page.items);cursor=page.next_cursor;
   }while(cursor);
   assert.equal(hits,1);assert.deepEqual(items.map(selectionRef),ordered.map(selectionRef));
   assert.equal(tx.get('reviews',future.review.id),null);
  });
  assert.equal(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).total,4);
  assert.equal(f.ledger.auditReviewSelection().clean,true);
 }finally{armed=false;other?.close();f.close();}
});

test('review selection preserves normalized global production scope and rejects missing or null current scope aliases',()=>{
 for(const mode of ['missing','null']){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`global-scope-${mode}`,subject,{scope:'*',definitionScope:null,verdict:'Pass'});
   selectionSeed(f,[production]);
   assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items.map(selectionRef),[selectionRef(production.review)]);
   const changed={...production.review.value};if(mode==='missing')delete changed.scope;else changed.scope=null;
   f.ledger.write('selection.synthetic.global-scope-alias','founder',tx=>tx.put('reviews',production.review.id,changed,1));
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated']})),selectionIntegrity,'a nonadverse raw result cannot conceal a production alias contradiction');
  }finally{f.close();}
 }
});

test('review selection classifies generic null or array production support as integrity unknown without aborting its canonical write',()=>{
 for(const mode of ['null-task','array-task','invalid-attempt','null-observation','array-observation']){
  const f=peerFixture();try{
   const subject=selectionSubject(f),production=selectionProduction(`shape-${mode}`,subject,{verdict:'Pass'});
   if(mode==='null-task')production.task.value=null;
   if(mode==='array-task')production.task.value=[];
   if(mode==='invalid-attempt')production.task.value.attempt=17;
   if(mode.endsWith('observation')){
    production.observation.value=mode==='null-observation'?null:[];
    production.observation.sha256=peerDigest(production.observation.value);
    production.task.value.result.observation=selectionRef(production.observation);
    production.review.value.proof.observation=selectionRef(production.observation);
   }
   production.task.sha256=peerDigest(production.task.value);
   production.review.value.proof.task=selectionRef(production.task);production.review.sha256=peerDigest(production.review.value);
   selectionSeed(f,[production]);
   assert.deepEqual(f.ledger.read(tx=>tx.get('tasks',production.task.id)).value,production.task.value);
   assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),error=>{assert.equal(error.code,'REVIEW_SELECTION_INTEGRITY');return true;},mode);
  }finally{f.close();}
 }
});

test('review selection query-hook errors retain identity and also report a simultaneously changed ownership boundary',()=>{
 for(const modifies of [false,true]){
  let armed=false,active,hits=0;
  const injected=Error('synthetic selection query failure'),f=peerFixture({onQuery:q=>{
   if(!armed||q.sql!=='SELECT * FROM peer_review_recipe WHERE id=1')return;
   armed=false;hits++;
   if(modifies)active.put('notices','selection-error-mutation',{status:'open'},0);
   throw injected;
  }});
  try{
   const subject=selectionSubject(f),production=selectionProduction(`error-${modifies}`,subject);selectionSeed(f,[production]);
   const before=selectionState(f);
   assert.throws(()=>f.ledger.write('selection.synthetic.error-rollback','founder',tx=>{
    active=tx;armed=true;
    assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),error=>{
     if(modifies){assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],injected);assert.match(error.errors[1].message,/pending writes|mutation|after.*write/i);}
     else assert.equal(error,injected);
     return true;
    });
    assert.equal(hits,1);
    if(modifies)assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),/pending writes|mutation|after.*write/i);
    else assert.equal(tx.queryCurrentReviews({subjects:[subject],scopes:[]}).total,1);
    throw Error('deliberate selection error rollback');
   }),/deliberate selection error rollback/);
   active=null;assert.deepEqual(selectionState(f),before);
  }finally{armed=false;active=null;f.close();}
 }
});

test('review selection detects physical transaction loss before and after actual candidate retrieval and expires the owner handle',()=>{
 for(const point of ['before','after']){
  const f=peerFixture(),db=new DatabaseSync(f.file),owner=new PeerLedger(f.root,{connection:db});
  let armed=false,hits=0,escaped;const original=owner.query;
  try{
   const subject=selectionSubject(f),production=selectionProduction(`physical-${point}`,subject);selectionSeed(f,[production]);
   const before=selectionState(f);
   owner.query=function(sql,...parameters){
    const match=sql.startsWith('SELECT review_id FROM peer_review_selection INDEXED BY peer_review_subject');
    if(armed&&match&&point==='before'){armed=false;hits++;db.exec('ROLLBACK');}
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(!match||point!=='after')return statement;
    return new Proxy(statement,{get(object,key){
     const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
     if(key!=='all')return value.bind(object);
     return (...args)=>{const result=Reflect.apply(value,object,args);if(armed){armed=false;hits++;db.exec('ROLLBACK');}return result;};
    }});
   };
   assert.throws(()=>owner.read(tx=>{escaped=tx;armed=true;return tx.queryCurrentReviews({subjects:[subject],scopes:[]});}),error=>{
    const messages=[error,...(error.errors??[])].map(e=>e.message).join(' ');
    assert.match(messages,/transaction|boundary|rollback|owner/i);return true;
   });
   assert.equal(hits,1);assert.equal(db.isTransaction,false);
   assert.throws(()=>escaped.queryCurrentReviews({subjects:[subject],scopes:[]}),/expired/i);
   assert.deepEqual(selectionState(f),before);
   assert.equal(owner.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).total,1,'an ended owning rollback releases its fence for a fresh snapshot');
  }finally{armed=false;owner.query=original;if(db.isTransaction)db.exec('ROLLBACK');owner.close();db.close();f.close();}
 }
});

test('review selection bounds its own retained classification at 10000 revisions without hydrating oversized history on an ordinary write',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f,'retained-bound');selectionLegacyCopy(f);
  const manual={status:'accepted',scope:'manual-history',subject,verdict:'Pass',blockers:[],proof:{protocol:'peer-native-review-v1'}};
  // Genuine accepted-P1 CAS/history/event writes, batched while capability is
  // absent. This is a synthetic manual record, not a protected native review.
  for(let start=1;start<=10000;start+=50)f.ledger.write('selection.synthetic.manual-history','founder',tx=>{
   for(let revision=start;revision<start+50;revision++)tx.put('reviews','manual-retained-history',{...manual,synthetic_revision:revision},revision-1);
  });
  assert.equal(selectionUpgrade(f).clean,true);
  const atBound=f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}));
  assert.equal(atBound.total,1);assert.equal(atBound.items[0].revision,10000);
  const queries=[],original=f.ledger.query;
  f.ledger.query=function(sql,...args){queries.push(sql);return Reflect.apply(original,this,[sql,...args]);};
  try{
   const retained=f.ledger.write('selection.synthetic.oversized-history','founder',tx=>tx.put('reviews','manual-retained-history',{...manual,synthetic_revision:10001},10000));
   assert.equal(retained.revision,10001);
  }finally{f.ledger.query=original;}
  assert.equal(queries.some(sql=>/FROM peer_versions WHERE family='reviews' AND id=\? ORDER BY revision/.test(sql)),false,'ordinary classification rejects the known oversized revision count before reading retained review bodies');
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated']})),error=>{assert.equal(error.code,'REVIEW_SELECTION_INTEGRITY');return true;});
  selectionSQL(f,db=>{
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM peer_versions WHERE family='reviews' AND id=?").get('manual-retained-history').n,10001);
   assert.match(db.prepare('SELECT message FROM peer_review_errors WHERE review_id=?').get('manual-retained-history').message,/10,000|10000/);
  });
 }finally{f.close();}
});

// Native Engineering additions for the scope-string boundary. All preceding
// accepted and external-proposal tests remain unchanged. These are fictional
// SQLite/extraction mechanics, not native review or business qualification.
const {extractReviewSelection:nativeExtractReviewSelection}=await import('../plugins/soloco/runtime/peers/review-selection.mjs');
function nativeScopeFacts(tx,row){
 const current=tx.getVersion(selectionRef(row));
 assert.equal(current.revision,1,'these fixtures have one exact retained review revision');
 return nativeExtractReviewSelection({current,history:[current],resolve:r=>tx.getVersion(r),canonical,hash:selectionRawHash});
}

test('native: scope selectors reject isolated surrogates before SQL while valid Unicode retains exact indexed identity',()=>{
 const f=peerFixture();
 try{
  const subject=selectionSubject(f,'native-unicode-scopes');
  const scopes=[
   'scope-\ud83d\ude00',
   'scope-\ufffd',
   'scope-\u96ea',
   'scope-\u00e9',
   'scope-e\u0301',
   ' scope-\ud83d\ude00 ',
   'scope-\u{10400}',
   '\u{1f600}\u{1f680}'
  ];
  assert.equal(new Set(scopes).size,scopes.length);
  const productions=scopes.map((scope,i)=>selectionProduction(`native-unicode-${i}`,subject,{scope,verdict:i%2?'Blocked':'Fail'}));
  selectionSeed(f,productions);
  const before=selectionState(f);
  f.ledger.read(tx=>{
   for(let i=0;i<scopes.length;i++){
    const page=tx.queryCurrentReviews({subjects:[],scopes:[scopes[i]]});
    assert.equal(page.total,1,'each exact scope selects only its own adverse record');
    assert.equal(page.complete,true);assert.equal(page.next_cursor,null);
    assert.deepEqual(page.items.map(selectionRef),[selectionRef(productions[i].review)]);
    assert.deepEqual(page.items[0].value,productions[i].review.value);
    const facts=nativeScopeFacts(tx,productions[i].review);
    assert.equal(facts.outcome,'PROTECTED');assert.equal(facts.error,null);
    assert.equal(facts.scope,scopes[i],'no trimming, Unicode normalization or replacement is allowed');
    assert.equal(facts.adverse,true);
    const metadata=before.peer_review_selection.find(row=>row.review_id===productions[i].review.id);
    assert.equal(metadata.scope,scopes[i],'the real SQLite projection preserves the same exact valid string');
    assert.equal(metadata.outcome,'PROTECTED');
   }
   assert.equal(tx.queryCurrentReviews({subjects:[subject],scopes:[]}).total,scopes.length);
  });
  assert.deepEqual(selectionState(f),before);
  const invalid=[
   '\ud800','\udc00',
   'scope-\ud800','scope-\udbff','scope-\udc00','scope-\udfff',
   'scope-\ud800x','scope-\udc00\ud800',
   'scope-\ud800\ud800','scope-\udfff\udfff'
  ];
  const queries=[],originalHook=f.ledger.onQuery;
  f.ledger.onQuery=q=>{queries.push(q.sql);originalHook?.(q);};
  try{
   for(const mode of ['read','write']){
    const callback=tx=>{
     for(const scope of invalid){
      queries.length=0;
      assert.throws(()=>tx.queryCurrentReviews({subjects:[],scopes:[scope]}),/Invalid production scope/);
      assert.deepEqual(queries,[],'invalid scope must reject before preparing selection SQL');
      const recovered=tx.queryCurrentReviews({subjects:[],scopes:[scopes[1]]});
      assert.deepEqual(recovered.items.map(selectionRef),[selectionRef(productions[1].review)],'U+FFFD remains a distinct valid scope and the owner remains usable');
     }
    };
    if(mode==='read')f.ledger.read(callback);
    else f.ledger.write('native.scope-selector.no-mutation','founder',callback);
    assert.deepEqual(selectionState(f),before,'invalid selectors and valid reads change no canonical or projection table');
   }
  }finally{f.ledger.onQuery=originalHook;}
  assert.deepEqual(selectionState(f),before);
 }finally{f.close();}
});

test('native: invalid production scope remains integrity unknown with raw adversity retained even behind a stored Pass',()=>{
 for(const [label,invalidScope] of [['high','production-\ud800'],['low','production-\udfff']]){
  for(const verdict of ['Fail','Blocked'])for(const storedVerdict of [verdict,'Pass']){
   const f=peerFixture();
   try{
    const subject=selectionSubject(f,`native-invalid-${label}-${verdict}-${storedVerdict}`);
    // The malformed scope is inside canonical production evidence. Top-level
    // indexed scopes remain valid, so the real ledger can retain that evidence
    // without relying on any unestablished SQLite surrogate-conversion behavior.
    const production=selectionProduction(`native-invalid-${label}-${verdict}-${storedVerdict}`,subject,{scope:'native-valid-indexed-scope',definitionScope:invalidScope,verdict});
    if(storedVerdict==='Pass'){
     production.review.value={...production.review.value,verdict:'Pass',blockers:[]};
     production.review.sha256=peerDigest(production.review.value);
    }
    selectionSeed(f,[production]);
    const before=selectionState(f),metadata=before.peer_review_selection.find(row=>row.review_id===production.review.id);
    assert.ok(metadata);
    assert.equal(metadata.outcome,'INTEGRITY_UNKNOWN');
    assert.equal(metadata.adverse,1,'known raw Fail/Blocked remains adverse even if the stored alias is Pass');
    assert.equal(metadata.scope,null,'an invalid production scope is not coerced into indexed scope membership');
    assert.equal(metadata.subject_family,subject.family);
    assert.equal(metadata.subject_id,subject.id);
    assert.equal(metadata.subject_revision,subject.revision);
    assert.equal(metadata.subject_sha256,subject.sha256);
    const error=before.peer_review_errors.find(row=>row.review_id===production.review.id);
    assert.ok(error);assert.match(error.message,/Invalid production scope/);
    f.ledger.read(tx=>{
     const facts=nativeScopeFacts(tx,production.review);
     assert.equal(facts.outcome,'INTEGRITY_UNKNOWN');
     assert.equal(facts.origin,'runtime');assert.equal(facts.scope,null);
     assert.equal(facts.adverse,true,'scope validation must not erase an already observed negative verdict');
     assert.deepEqual(facts.subject,subject);
     assert.deepEqual(facts.anchor.review,selectionRef(production.review));
     assert.deepEqual(facts.anchor.task,selectionRef(production.task));
     assert.match(facts.error,/Invalid production scope/);
     assert.equal(tx.getVersion(selectionRef(production.task)).value.definition.scope,invalidScope,'the original UTF-16 evidence remains exact canonical history');
     assert.deepEqual(tx.getVersion(selectionRef(production.review)).value,production.review.value);
     assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),selectionIntegrity);
     assert.throws(()=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated']}),selectionIntegrity);
     assert.throws(()=>tx.queryCurrentReviews({subjects:[],scopes:[]}),selectionIntegrity);
    });
    assert.deepEqual(selectionState(f),before,'extraction and held selection perform no corrective writes');
    const fresh=new PeerLedger(f.root);
    try{
     assert.throws(()=>fresh.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated']})),selectionIntegrity);
     assert.deepEqual(fresh.read(tx=>tx.get('reviews',production.review.id)).value,production.review.value);
    }finally{fresh.close();}
    assert.equal(f.ledger.verify().complete,true,'retained canonical evidence remains ledger-valid despite selection integrity uncertainty');
    assert.deepEqual(selectionState(f),before);
   }finally{f.close();}
  }
 }
});

// Independently adopted external171 capacity/error-origin regression proposal,
// with native framing-cost, complete-history and late-interruption additions.
// External provenance: chat 01a1b6e7-daaf-70c3-b54a-37ad8e16ee51 root/helpers.
// All preceding native79 source remains unchanged. Fictional SQLite mechanics
// establish neither native reviewer qualification nor measured process RSS.
function byteSizedValue(base,ordinal,size,{unicode=true}={}){
 const value={...base,synthetic_revision:ordinal,synthetic_padding:''};
 const overhead=Buffer.byteLength(canonical(value)),available=size-overhead;
 assert.ok(Number.isSafeInteger(available)&&available>=0,'fixture bytes include the complete canonical envelope');
 const unit=unicode?'雪😀':'a',unitBytes=Buffer.byteLength(unit);
 value.synthetic_padding=unit.repeat(Math.floor(available/unitBytes))+'a'.repeat(available%unitBytes);
 assert.equal(Buffer.byteLength(canonical(value)),size);
 assert.ok(size<1_000_000,'each record remains below the existing P1 row limit');
 return value;
}
function byteManualBase(subject){return {status:'accepted',scope:'byte-history',subject,verdict:'Pass',blockers:[],proof:{protocol:'peer-native-review-v1'}};}
function byteHistoryTotals(f,id){return selectionSQL(f,db=>db.prepare("SELECT COUNT(*) AS revisions,SUM(length(CAST(bytes AS BLOB))) AS utf8,SUM(length(bytes)) AS codepoints FROM peer_versions WHERE family='reviews' AND id=?").get(id));}
function byteSQLDigest(f){
 return selectionSQL(f,db=>{
  const result={schema:selectionRawHash(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name LIKE 'peer_%' ORDER BY type,name").all()))},tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'peer_%' ORDER BY name").all();
  for(const {name} of tables){
   const hash=selectionCreateHash('sha256');
   for(const row of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate())hash.update(JSON.stringify(row)+'\n');
   result[name]=hash.digest('hex');
  }
  return result;
 });
}
function byteQueryTrace(ledger){
 const original=ledger.query,calls=[];
 ledger.query=function(sql,...parameters){
  const statement=Reflect.apply(original,this,[sql,...parameters]);
  return new Proxy(statement,{get(object,key){
   const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
   if(!['get','all','run'].includes(key))return value.bind(object);
   return (...args)=>{
    const result=Reflect.apply(value,object,args),rows=key==='all'?result:key==='get'&&result?[result]:[];
    calls.push({sql,method:key,args,rows:rows.length,body_bytes:rows.reduce((sum,row)=>sum+(typeof row?.bytes==='string'?Buffer.byteLength(row.bytes):0),0)});
    return result;
   };
  }});
 };
 return {calls,restore(){ledger.query=original;}};
}
function byteHistoryBodies(trace,id){return trace.calls.filter(call=>call.method==='all'&&/FROM peer_versions/.test(call.sql)&&/\bbytes\b/.test(call.sql)&&call.args.includes(id));}
const {REVIEW_SELECTION_HISTORY_BYTES:byteHistoryLimit,REVIEW_SELECTION_HISTORY_COST:byteHistoryCost,REVIEW_SELECTION_AUDIT_PAGE_SIZE:byteAuditPageSize}=await import('../plugins/soloco/runtime/peers/ledger.mjs');
const byteAggregateCall=call=>/SUM\s*\(/i.test(call.sql)&&/length\s*\(\s*CAST\s*\(\s*bytes\s+AS\s+BLOB\s*\)/i.test(call.sql)&&/peer_versions/.test(call.sql);
function byteSeedManualPrefix(f,id,base){
 const values=Array.from({length:9},(_,i)=>byteSizedValue(base,i+1,900000));
 selectionLegacyCopy(f);
 f.ledger.write('external.byte.manual-prefix','founder',tx=>{
  for(let i=0;i<values.length;i++)tx.put('reviews',id,values[i],i);
 });
 assert.equal(selectionUpgrade(f).clean,true);
 return values;
}
function byteMetadata(f,id){return selectionSQL(f,db=>({metadata:db.prepare('SELECT * FROM peer_review_selection WHERE review_id=?').get(id),error:db.prepare('SELECT * FROM peer_review_errors WHERE review_id=?').get(id)}));}

test('adopted byte bound: below at and above UTF-8 budget count persisted bytes before hydrating history',()=>{
 assert.equal(byteHistoryLimit,8*1024*1024);
 for(const delta of [-1,0,1]){
  const f=peerFixture();try{
   const subject=selectionSubject(f,`byte-bound-${delta}`),id=`manual-byte-bound-${delta}`,base=byteManualBase(subject);
   const values=byteSeedManualPrefix(f,id,base),target=byteHistoryLimit+delta;
   const last=byteSizedValue(base,10,target-values.reduce((sum,value)=>sum+Buffer.byteLength(canonical(value)),0));
   const trace=byteQueryTrace(f.ledger);let current;
   try{current=f.ledger.write('external.byte.threshold-write','founder',tx=>tx.put('reviews',id,last,9));}finally{trace.restore();}
   assert.equal(current.revision,10);assert.equal(current.sha256,peerDigest(last));
   const totals=byteHistoryTotals(f,id);
   assert.equal(totals.revisions,10);assert.equal(totals.utf8,target);
   const jsUnits=[...values,last].reduce((sum,value)=>sum+canonical(value).length,0);
   assert(jsUnits<byteHistoryLimit,'UTF-16 length would incorrectly admit the over-budget Unicode history');
   assert(totals.codepoints<jsUnits);assert(jsUnits<totals.utf8);
   const aggregate=trace.calls.findIndex(byteAggregateCall),bodies=byteHistoryBodies(trace,id);
   assert(aggregate>=0);
   const {metadata,error}=byteMetadata(f,id);
   assert.equal(metadata.revision,current.revision);assert.equal(metadata.sha256,current.sha256);
   if(delta<=0){
    assert.equal(metadata.outcome,'MANUAL_NONADVERSE');assert.equal(error,undefined);
    assert.equal(bodies.reduce((sum,call)=>sum+call.rows,0),10);
    assert.equal(bodies.reduce((sum,call)=>sum+call.body_bytes,0),target);
    assert(trace.calls.indexOf(bodies[0])>aggregate);
    assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items,[current]);
    assert.equal(f.ledger.auditReviewSelection().clean,true);
   }else{
    assert.equal(metadata.outcome,'INTEGRITY_UNKNOWN');assert.ok(error);
    assert.equal(error.revision,current.revision);assert.equal(error.sha256,current.sha256);
    assert(error.message.includes(String(target)));assert(error.message.includes(String(byteHistoryLimit)));
    assert.equal(bodies.length,0,'oversized history cannot reach a body-returning all()');
    assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),selectionIntegrity);
    const beforeNoop=byteSQLDigest(f),noopTrace=byteQueryTrace(f.ledger);
    try{assert.deepEqual(f.ledger.write('external.byte.unknown-noop','founder',tx=>tx.put('reviews',id,last,current.revision)),current);}finally{noopTrace.restore();}
    assert.equal(byteHistoryBodies(noopTrace,id).length,0);
    assert.deepEqual(byteSQLDigest(f),beforeNoop,'a no-op cannot clear uncertainty');
    for(const operation of ['audit','upgrade']){
     if(operation==='upgrade')selectionLegacyCopy(f);
     const before=byteSQLDigest(f),maintenanceTrace=byteQueryTrace(f.ledger);
     try{
      assert.throws(()=>operation==='audit'?f.ledger.auditReviewSelection():selectionUpgrade(f),failure=>{
       assert.equal(failure.code,'REVIEW_SELECTION_CAPACITY');
       assert(failure.message.includes(String(target)));assert(failure.message.includes(String(byteHistoryLimit)));return true;
      });
     }finally{maintenanceTrace.restore();}
     assert.equal(byteHistoryBodies(maintenanceTrace,id).length,0);
     assert.deepEqual(byteSQLDigest(f),before,'capacity rejection restores schema and every canonical/derived table');
    }
    assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),failure=>{assert.equal(failure.code,'REVIEW_SELECTION_CAPABILITY');return true;});
    assert.equal(byteHistoryTotals(f,id).utf8,target);
   }
  }finally{f.close();}
 }
});

test('adopted byte bound: oversized protected negative and a late Pass alias retain history without reusing a clean prefix',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f,'negative-byte-history'),production=selectionProduction('negative-byte-history',subject,{scope:'foreign-byte',verdict:'Fail'});
  selectionSeed(f,[production]);selectionLegacyCopy(f);
  const base=production.review.value,firstBytes=Buffer.byteLength(canonical(base));
  f.ledger.write('external.byte.negative-prefix','founder',tx=>{
   for(let revision=2;revision<=10;revision++)tx.put('reviews',production.review.id,byteSizedValue(base,revision,900000),revision-1);
  });
  assert.equal(selectionUpgrade(f).clean,true);
  const prefix=byteMetadata(f,production.review.id).metadata;
  assert.equal(prefix.outcome,'PROTECTED');assert.equal(prefix.adverse,1);
  const target=byteHistoryLimit+1,last=byteSizedValue(base,11,target-firstBytes-9*900000),trace=byteQueryTrace(f.ledger);let current;
  try{current=f.ledger.write('external.byte.negative-overflow','founder',tx=>tx.put('reviews',production.review.id,last,10));}finally{trace.restore();}
  assert.equal(byteHistoryBodies(trace,production.review.id).length,0);
  assert.equal(byteHistoryTotals(f,production.review.id).utf8,target);
  const {metadata,error}=byteMetadata(f,production.review.id);
  assert.equal(metadata.outcome,'INTEGRITY_UNKNOWN');assert.equal(metadata.adverse,1);assert.equal(metadata.revision,11);assert.equal(metadata.sha256,current.sha256);
  assert.ok(error);assert(error.message.includes(String(target)));
  const alias={...last,verdict:'Pass',blockers:[],scope:'different',subject:{...subject,id:'different'}};
  const late=f.ledger.write('native.byte.late-alias','founder',tx=>tx.put('reviews',production.review.id,alias,11));
  assert.equal(byteMetadata(f,late.id).metadata.outcome,'INTEGRITY_UNKNOWN');
  f.ledger.read(tx=>{
   assert.deepEqual(tx.getVersion(selectionRef(production.review)).value,base);
   assert.deepEqual(tx.getVersion(selectionRef(production.review)).value.proof,base.proof,'the original exact anchor remains canonical evidence');
   const original=tx.getVersion(selectionRef(production.task)).value;
   assert.equal(JSON.parse(original.result.output).review.verdict,'Fail');
   assert.deepEqual(tx.get('reviews',late.id),late);
   assert.throws(()=>tx.queryCurrentReviews({subjects:[],scopes:['unrelated']}),selectionIntegrity);
   assert.throws(()=>tx.queryCurrentReviews({subjects:[subject],scopes:[]}),selectionIntegrity);
  });
  const before=byteSQLDigest(f);
  assert.throws(()=>f.ledger.auditReviewSelection(),failure=>{assert.equal(failure.code,'REVIEW_SELECTION_CAPACITY');return true;});
  assert.deepEqual(byteSQLDigest(f),before);
 }finally{f.close();}
});

function byteAssertOuterPages(trace,total){
 const pages=trace.calls.filter(call=>call.method==='all'&&/FROM peer_rows/.test(call.sql)&&/ORDER BY id/i.test(call.sql));
 assert(pages.length>=2);
 for(const page of pages){
  assert.match(page.sql,/\bLIMIT\b/i);
  assert(page.rows<=byteAuditPageSize);assert.equal(page.body_bytes,0);
 }
 assert(pages.reduce((sum,page)=>sum+page.rows,0)>=total);
 assert.equal(trace.calls.some(call=>call.method==='all'&&/FROM peer_rows/.test(call.sql)&&call.body_bytes>0),false);
}
test('adopted byte bound: maintenance pages current identities and late interruption cannot publish a clean prefix',()=>{
 assert.equal(byteAuditPageSize,100);
 const f=peerFixture();try{
  const subject=selectionSubject(f,'outer-byte-pages'),base=byteManualBase(subject),total=107;
  for(let offset=0;offset<total;offset+=25)f.ledger.write('external.byte.outer-fixtures','founder',tx=>{
   for(let i=offset;i<Math.min(total,offset+25);i++)tx.put('reviews',`manual-byte-page-${String(i).padStart(4,'0')}`,{...base,synthetic_ordinal:i},0);
  });
  const before=byteSQLDigest(f),auditTrace=byteQueryTrace(f.ledger);let audited;
  try{audited=f.ledger.auditReviewSelection();}finally{auditTrace.restore();}
  assert.equal(audited.clean,true);assert.equal(audited.reviews,total);byteAssertOuterPages(auditTrace,total);
  assert.deepEqual(byteSQLDigest(f),before);
  const canonicalBefore=snapshot(f);selectionLegacyCopy(f);
  const upgradeTrace=byteQueryTrace(f.ledger);let upgraded;
  try{upgraded=selectionUpgrade(f);}finally{upgradeTrace.restore();}
  assert.equal(upgraded.clean,true);assert.equal(upgraded.reviews,total);byteAssertOuterPages(upgradeTrace,total);
  assert.deepEqual(snapshot(f),canonicalBefore);
  assert.equal(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[],limit:1})).total,total);
  for(const operation of ['audit','upgrade']){
   if(operation==='upgrade')selectionLegacyCopy(f);
   const saved=byteSQLDigest(f),injected=Error('native late second identity page failure'),original=f.ledger.onQuery;
   let pages=0,refreshed=0;
   f.ledger.onQuery=q=>{
    original?.(q);
    if(q.sql.startsWith('INSERT INTO peer_review_selection'))refreshed++;
    if(q.sql.startsWith("SELECT id FROM peer_rows WHERE family='reviews'")&&++pages===2)throw injected;
   };
   try{assert.throws(()=>operation==='audit'?f.ledger.auditReviewSelection():selectionUpgrade(f),failure=>{assert.equal(failure,injected);return true;});}finally{f.ledger.onQuery=original;}
   assert.equal(pages,2);
   if(operation==='upgrade')assert.equal(refreshed,100,'a complete first page was really refreshed before the fault');
   else assert.equal(refreshed,0);
   assert.deepEqual(byteSQLDigest(f),saved);
   if(operation==='upgrade'){
    assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})),failure=>{assert.equal(failure.code,'REVIEW_SELECTION_CAPABILITY');return true;});
    assert.equal(selectionUpgrade(f).clean,true);
   }
  }
 }finally{f.close();}
});

test('adopted byte bound: preflight closes public handles and preserves physical connection ownership',()=>{
 let armed=false,active,current,sibling,hits=0;
 const f=peerFixture({onQuery:q=>{
  if(!armed||!byteAggregateCall({sql:q.sql}))return;
  armed=false;hits++;
  assert.throws(()=>active.queryCurrentReviews({subjects:[],scopes:[]}),/closed|maintenance/i);
  assert.throws(()=>active.getVersion(selectionRef(current)),/closed|maintenance/i);
  assert.throws(()=>active.list('reviews'),/closed|maintenance/i);
  assert.throws(()=>active.put('reviews',current.id,current.value,current.revision),/closed|maintenance/i);
  assert.throws(()=>sibling.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),/active transaction owner|ownership/i);
 }});
 try{
  const subject=selectionSubject(f,'guarded-byte-preflight'),base=byteManualBase(subject);
  const old=f.ledger.write('external.byte.guard-seed','founder',tx=>tx.put('reviews','manual-byte-guard',{...base,synthetic_revision:1},0));
  sibling=new PeerLedger(f.root,{connection:f.ledger.db});armed=true;
  f.ledger.write('external.byte.guard-refresh','founder',tx=>{active=tx;current=tx.put('reviews',old.id,{...base,synthetic_revision:2},old.revision);});
  assert.equal(hits,1);assert.throws(()=>active.queryCurrentReviews({subjects:[],scopes:[]}),/expired/i);active=null;
  assert.deepEqual(sibling.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items,[current]);
  assert.equal(f.ledger.auditReviewSelection().clean,true);
 }finally{armed=false;active=null;sibling?.close();f.close();}
});

test('adopted byte bound: preflight errors late flush errors and physical loss roll back complete refresh',()=>{
 for(const point of ['byte-preflight','event-flush','physical-loss']){
  let armed=false,active,hits=0;
  const injected=Error(`external byte ${point} fault`),f=peerFixture({onQuery:q=>{
   const match=point==='event-flush'?q.sql.startsWith('INSERT INTO peer_events'):byteAggregateCall({sql:q.sql});
   if(!armed||!match)return;
   armed=false;hits++;
   if(point==='physical-loss')f.ledger.db.exec('ROLLBACK');else throw injected;
  }});
  try{
   const subject=selectionSubject(f,`byte-fault-${point}`),base=byteManualBase(subject);
   const old=f.ledger.write('external.byte.fault-seed','founder',tx=>tx.put('reviews',`manual-byte-fault-${point}`,{...base,synthetic_revision:1},0));
   const before=byteSQLDigest(f),trace=byteQueryTrace(f.ledger);armed=true;
   try{
    assert.throws(()=>f.ledger.write('external.byte.fault-refresh','founder',tx=>{
     active=tx;tx.put('reviews',old.id,{...base,synthetic_revision:2},old.revision);tx.event('external.byte.buffered',{point});
    }),failure=>{
     if(point==='physical-loss')assert.match([failure,...(failure.errors??[])].map(e=>e.message).join(' '),/transaction|boundary|rollback|owner/i);
     else assert.equal(failure,injected);
     return true;
    });
   }finally{trace.restore();}
   assert.equal(hits,1);assert.throws(()=>active.queryCurrentReviews({subjects:[],scopes:[]}),/expired/i);active=null;
   if(point!=='event-flush')assert.equal(byteHistoryBodies(trace,old.id).length,0);
   assert.deepEqual(byteSQLDigest(f),before);
   const fresh=new PeerLedger(f.root);try{
    assert.deepEqual(fresh.read(tx=>tx.get('reviews',old.id)),old);
    assert.deepEqual(fresh.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items,[old]);
    assert.equal(fresh.auditReviewSelection().clean,true);
   }finally{fresh.close();}
  }finally{armed=false;active=null;f.close();}
 }
});

const {reviewScope:callbackValidationScope}=await import('../plugins/soloco/runtime/peers/review-selection.mjs');
const callbackExactHistorySQL='SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?';
function callbackValidationError(){
 let failure;try{callbackValidationScope(42);}catch(error){failure=error;}
 assert.ok(failure instanceof Error);assert.match(failure.message,/Invalid production scope/);return failure;
}
test('adopted callback origin: task or observation hook failure propagates its exact helper error and rolls back production',()=>{
 for(const [target,ordinal] of [['task',1],['observation',2]]){
  const injected=callbackValidationError();let armed=false,reads=0,hits=0,escaped;
  const f=peerFixture({onQuery:q=>{
   if(!armed||q.sql!==callbackExactHistorySQL)return;
   if(++reads!==ordinal)return;
   armed=false;hits++;throw injected;
  }});
  try{
   const subject=selectionSubject(f,`callback-${target}`),production=selectionProduction(`callback-${target}`,subject,{scope:'callback-scope',verdict:'Blocked'}),before=byteSQLDigest(f);
   let observed;armed=true;
   try{f.ledger.write('external.callback.production','founder',tx=>{escaped=tx;selectionPutProduction(tx,production);});}catch(error){observed=error;}
   assert.equal(hits,1);assert.equal(reads,ordinal);
   assert.equal(observed,injected,'a callback-origin FactError cannot be committed as semantic Unknown');
   assert.deepEqual(byteSQLDigest(f),before);
   assert.throws(()=>escaped.queryCurrentReviews({subjects:[],scopes:[]}),/expired/i);
   const fresh=new PeerLedger(f.root);try{
    fresh.read(tx=>{
     for(const row of [production.review,production.task,production.observation])assert.equal(tx.get(row.family,row.id),null);
     assert.deepEqual(tx.queryCurrentReviews({subjects:[subject],scopes:[]}),selectionEmpty());
    });
   }finally{fresh.close();}
  }finally{armed=false;f.close();}
 }
});

test('adopted callback origin: audit and upgrade preserve callback identity and restore all schema and table state',()=>{
 for(const operation of ['audit','upgrade'])for(const [target,ordinal] of [['task',1],['observation',2]]){
  const injected=callbackValidationError();let armed=false,reads=0,hits=0;
  const f=peerFixture({onQuery:q=>{
   if(!armed||q.sql!==callbackExactHistorySQL)return;
   if(++reads!==ordinal)return;
   armed=false;hits++;throw injected;
  }});
  try{
   const subject=selectionSubject(f,`callback-${operation}-${target}`),production=selectionProduction(`callback-${operation}-${target}`,subject,{scope:'callback-scope',verdict:'Fail'});
   selectionSeed(f,[production]);
   assert.equal(byteMetadata(f,production.review.id).metadata.outcome,'PROTECTED');
   if(operation==='upgrade')selectionLegacyCopy(f);
   const before=byteSQLDigest(f);armed=true;
   assert.throws(()=>operation==='audit'?f.ledger.auditReviewSelection():selectionUpgrade(f),failure=>{assert.equal(failure,injected);return true;});
   assert.equal(hits,1);assert.equal(reads,ordinal);assert.deepEqual(byteSQLDigest(f),before);
   if(operation==='upgrade'){
    assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})),failure=>{assert.equal(failure.code,'REVIEW_SELECTION_CAPABILITY');return true;});
    assert.equal(selectionUpgrade(f).clean,true);
   }
   assert.equal(f.ledger.auditReviewSelection().clean,true);
   assert.deepEqual(f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items.map(selectionRef),[selectionRef(production.review)]);
  }finally{armed=false;f.close();}
 }
});

test('adopted callback origin: genuine malformed evidence still commits Unknown and retains raw negativity',()=>{
 const f=peerFixture();try{
  const subject=selectionSubject(f,'genuine-validation-origin'),production=selectionProduction('genuine-validation-origin',subject,{scope:'valid-indexed-scope',definitionScope:42,verdict:'Fail'});
  production.review.value={...production.review.value,verdict:'Pass',blockers:[]};production.review.sha256=peerDigest(production.review.value);
  const before=byteSQLDigest(f);selectionSeed(f,[production]);
  assert.notDeepEqual(byteSQLDigest(f),before);
  const {metadata,error}=byteMetadata(f,production.review.id);
  assert.equal(metadata.outcome,'INTEGRITY_UNKNOWN');assert.equal(metadata.adverse,1);
  assert.equal(error.message,callbackValidationError().message);
  assert.equal(metadata.revision,production.review.revision);assert.equal(metadata.sha256,production.review.sha256);
  f.ledger.read(tx=>{
   assert.deepEqual(tx.get('reviews',production.review.id).value,production.review.value);
   assert.deepEqual(tx.getVersion(selectionRef(production.review)).value,production.review.value);
   const original=tx.getVersion(selectionRef(production.task)).value;
   assert.equal(original.definition.scope,42);assert.equal(JSON.parse(original.result.output).review.verdict,'Fail');
   assert.throws(()=>tx.queryCurrentReviews({subjects:[],scopes:[]}),selectionIntegrity);
  });
  for(const audited of [f.ledger.auditReviewSelection(),selectionUpgrade(f)]){
   assert.equal(audited.clean,false);assert.equal(audited.errors,1);assert.equal(audited.reviews,1);
  }
  assert.equal(f.ledger.verify().complete,true);
 }finally{f.close();}
});

test('native framing admission: tiny unsupported bodies with long identities cannot bypass materialization cost',()=>{
 const f=peerFixture();try{
  const id='manual-'+ '雪'.repeat(1900);
  selectionLegacyCopy(f);
  // Actual supported CAS writes, not fabricated SQL query results. Alternating
  // primitive values force revisions while keeping total canonical payload tiny.
  for(let start=1;start<=2700;start+=50)f.ledger.write('native.framing.prefix','founder',tx=>{
   for(let revision=start;revision<start+50;revision++)tx.put('reviews',id,revision%2===1,revision-1);
  });
  const prefixTrace=byteQueryTrace(f.ledger);let admitted;
  try{admitted=selectionUpgrade(f);}finally{prefixTrace.restore();}
  assert.equal(admitted.clean,false);assert.equal(admitted.errors,1);
  assert.match(byteMetadata(f,id).error.message,/Unsupported review record shape/,'below the resource limit real shape validation remains reachable');
  assert.equal(byteHistoryBodies(prefixTrace,id).some(call=>call.rows===2700),true);
  assert(byteHistoryTotals(f,id).utf8<20000);
  for(let start=2701;start<=3000;start+=50)f.ledger.write('native.framing.extend','founder',tx=>{
   for(let revision=start;revision<start+50;revision++)tx.put('reviews',id,revision%2===1,revision-1);
  });
  const last=f.ledger.read(tx=>tx.get('reviews',id)),trace=byteQueryTrace(f.ledger);
  let next;
  try{next=f.ledger.write('native.framing.over-limit','founder',tx=>tx.put('reviews',id,true,last.revision));}finally{trace.restore();}
  assert.equal(next.revision,3001,'row count remains well below the ordinary 10,000 bound');
  assert(byteHistoryTotals(f,id).utf8<20000,'payload-only admission would incorrectly allow this history');
  const {metadata,error}=byteMetadata(f,id);
  assert.equal(metadata.outcome,'INTEGRITY_UNKNOWN');assert.equal(metadata.revision,next.revision);assert.equal(metadata.sha256,next.sha256);
  assert.match(error.message,/encoded-field\/framing materialization cost/);assert(error.message.includes(String(byteHistoryCost)));
  assert.equal(byteHistoryBodies(trace,id).length,0,'the resource rejection precedes the history body array');
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),selectionIntegrity);
  for(const operation of ['audit','upgrade']){
   const before=byteSQLDigest(f),maintenanceTrace=byteQueryTrace(f.ledger);
   try{assert.throws(()=>operation==='audit'?f.ledger.auditReviewSelection():selectionUpgrade(f),failure=>{
    assert.equal(failure.code,'REVIEW_SELECTION_CAPACITY');assert.match(failure.message,/encoded-field\/framing/);return true;
   });}finally{maintenanceTrace.restore();}
   assert.equal(byteHistoryBodies(maintenanceTrace,id).length,0);
   assert.deepEqual(byteSQLDigest(f),before);
  }
  assert.equal(f.ledger.verify({limit:100}).complete,true);
 }finally{f.close();}
});

test('native complete audit: over-row histories use bounded pages and late corruption or a missing middle never becomes a clean prefix',()=>{
 const f=peerFixture();try{
  const id='manual-small-over-row-history',total=10002;
  selectionLegacyCopy(f);
  for(let start=1;start<=total;start+=50)f.ledger.write('native.audit.small-history','founder',tx=>{
   for(let revision=start;revision<=Math.min(total,start+49);revision++)tx.put('reviews',id,revision%2===1,revision-1);
  });
  const trace=byteQueryTrace(f.ledger);let result;
  try{result=selectionUpgrade(f);}finally{trace.restore();}
  assert.equal(result.clean,false);assert.equal(result.errors,1);assert.equal(result.reviews,1);
  const bodies=byteHistoryBodies(trace,id);
  assert(bodies.length>100);
  assert(bodies.every(call=>call.rows<=100&&/revision>\?/.test(call.sql)&&/LIMIT 100\b/.test(call.sql)));
  assert.equal(bodies.reduce((sum,call)=>sum+call.rows,0),2*total,'refresh and independent audit each inspect the entire retained sequence');
  assert.match(byteMetadata(f,id).error.message,/10,000/);
  assert(byteHistoryTotals(f,id).utf8<100000);
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),selectionIntegrity);
  const stable=byteSQLDigest(f);
  assert.equal(f.ledger.auditReviewSelection().clean,false);
  assert.deepEqual(byteSQLDigest(f),stable);
  // Controlled corruption in the isolated fixture, beyond the first 100 pages.
  // Current head/creation metadata remains intact so the full audit must reach
  // this late historical row instead of failing a convenient current-row check.
  selectionSQL(f,db=>{
   db.exec('DROP TRIGGER peer_history_update');
   db.prepare("UPDATE peer_versions SET sha256=? WHERE family='reviews' AND id=? AND revision=10001").run('e'.repeat(64),id);
  });
  for(const operation of ['audit','upgrade']){
   const before=byteSQLDigest(f),lateTrace=byteQueryTrace(f.ledger);
   try{assert.throws(()=>operation==='audit'?f.ledger.auditReviewSelection():selectionUpgrade(f),/hash|capacity mismatch/);}finally{lateTrace.restore();}
   assert(byteHistoryBodies(lateTrace,id).some(call=>call.args[1]>=10000),'actual late body retrieval occurred');
   assert.deepEqual(byteSQLDigest(f),before);
  }
  selectionSQL(f,db=>{
   db.prepare("UPDATE peer_versions SET sha256=? WHERE family='reviews' AND id=? AND revision=10001").run(peerDigest(true),id);
   db.exec('DROP TRIGGER peer_history_delete');
   db.prepare("DELETE FROM peer_versions WHERE family='reviews' AND id=? AND revision=9999").run(id);
  });
  for(const operation of ['audit','upgrade']){
   const before=byteSQLDigest(f),missingTrace=byteQueryTrace(f.ledger);
   try{assert.throws(()=>operation==='audit'?f.ledger.auditReviewSelection():selectionUpgrade(f),/incomplete|noncontiguous/);}finally{missingTrace.restore();}
   assert.equal(byteHistoryBodies(missingTrace,id).length,0,'scalar complete-count check detects the missing middle before hydration');
   assert.deepEqual(byteSQLDigest(f),before);
  }
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),selectionIntegrity);
 }finally{f.close();}
});

test('native callback origin: changed existing protected review preserves its prior clean projection when resolver telemetry fails',()=>{
 const injected=callbackValidationError();let armed=false,hits=0,escaped;
 const f=peerFixture({onQuery:q=>{
  if(!armed||q.sql!==callbackExactHistorySQL)return;
  armed=false;hits++;throw injected;
 }});
 try{
  const subject=selectionSubject(f,'existing-callback'),production=selectionProduction('existing-callback',subject,{scope:'callback-scope',verdict:'Fail'});
  selectionSeed(f,[production]);
  const old=f.ledger.read(tx=>tx.get('reviews',production.review.id)),nextValue={...old.value,synthetic_revision:2};
  const proposed={family:'reviews',id:old.id,revision:2,sha256:peerDigest(nextValue)},before=byteSQLDigest(f);
  armed=true;
  assert.throws(()=>f.ledger.write('native.callback.existing-change','founder',tx=>{
   escaped=tx;tx.put('reviews',old.id,nextValue,old.revision);tx.event('native.callback.buffered',{});
  }),failure=>{assert.equal(failure,injected);return true;});
  assert.equal(hits,1);assert.deepEqual(byteSQLDigest(f),before);
  assert.throws(()=>escaped.get('reviews',old.id),/expired/);
  const fresh=new PeerLedger(f.root);try{
   assert.deepEqual(fresh.read(tx=>tx.get('reviews',old.id)),old);
   assert.throws(()=>fresh.read(tx=>tx.getVersion(proposed)),/unavailable/);
   assert.deepEqual(fresh.read(tx=>tx.queryCurrentReviews({subjects:[subject],scopes:[]})).items,[old]);
   assert.equal(fresh.auditReviewSelection().clean,true);
  }finally{fresh.close();}
 }finally{armed=false;f.close();}
});

// Public-put call fence. The complete preceding accepted90 prefix is unchanged.
// Independently adopted/revised external proposal 11521b027483ff54:
// chat 01a1b6e7-daaf-70c3-b54a-37ad8e16ee51; root, review_visibility,
// session_naming_review and visibility_evaluator. Native revisions extend early
// canonical, real SELECT-return, error-origin, savepoint and physical-loss cases.
// All fixtures are fictional. Real SQLite results are never fabricated.
const putFencePoints={
 current:sql=>sql==='SELECT * FROM peer_rows WHERE family=? AND id=?',
 history:sql=>sql==='INSERT INTO peer_versions VALUES(?,?,?,?,?)',
 row:sql=>sql.startsWith('INSERT INTO peer_rows VALUES'),
 decrement:sql=>sql.startsWith('UPDATE peer_membership SET count=count-1'),
 membership:sql=>sql.startsWith('INSERT INTO peer_membership'),
 generation:sql=>sql.startsWith('UPDATE peer_generations SET generation=generation+1')
};
function putFenceContains(error,expected){
 if(expected instanceof RegExp?expected.test(String(error?.message)):error===expected)return true;
 return error instanceof AggregateError&&error.errors.some(item=>putFenceContains(item,expected));
}
const putFencePoison=error=>{assert.match(String(error?.message),/failed row mutation.*rollback required/i);return true;};
function putFenceDigest(f,connection=null){
 const db=connection??new DatabaseSync(f.file);
 try{
  const result={schema:selectionRawHash(JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()))};
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for(const {name} of tables){
   const digest=selectionCreateHash('sha256');let rows=0;
   for(const row of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate()){digest.update(JSON.stringify(row)+'\n');rows++;}
   result[name]={rows,sha256:digest.digest('hex')};
  }
  return result;
 }finally{if(!connection)db.close();}
}
function putFenceSeed(f){
 return f.ledger.write('put-fence.seed','founder',tx=>tx.put('homes','put-fence-home',{status:'current',scope:'alpha',principal_id:'founder',content:'Committed home before the call fence.'},0));
}
function putFenceUnexpected(tx){
 return tx.put('notices','put-fence-unexpected',{status:'pending',scope:'alpha',principal_id:'founder',kind:'must_know',content:'Required evidence cannot enter through an active put.'},0);
}
function putFenceTarget(old,mode='update'){
 const id=mode==='create'?'put-fence-created':old.id,expected=mode==='create'?0:old.revision;
 const value=mode==='noop'?old.value:{...old.value,content:'Guarded candidate '+mode};
 return {id,expected,value,reference:{family:'homes',id,revision:expected+1,sha256:peerDigest(value)}};
}
function putFenceStage(tx,old){
 tx.put('commands','put-fence-receipt',{status:'recorded',scope:'alpha',principal_id:'founder',synthetic:'receipt rollback coverage'},0);
 tx.put('reviews','put-fence-staged-review',{status:'accepted',scope:'alpha',subject:historyReference(old,'homes'),verdict:'Pass',blockers:[],proof:{protocol:'peer-native-review-v1'}},0);
 tx.event('put-fence.buffered-receipt',{id:'put-fence-receipt'});
}
function putFenceNoUnexpected(calls){
 assert.equal(calls.some(call=>call.method==='run'&&call.sql==='INSERT INTO peer_versions VALUES(?,?,?,?,?)'&&call.args[0]==='notices'&&call.args[1]==='put-fence-unexpected'),false,'the denied nested call executes no history INSERT');
}
function putFenceAssertRollback(f,before,old,proposed=null){
 assert.equal(f.ledger.db.isTransaction,false);
 assert.deepEqual(putFenceDigest(f),before,'schema and every fixture table return to the original committed state');
 const fresh=new PeerLedger(f.root);
 try{
  fresh.write('put-fence.fresh-noop','founder',tx=>{
   assert.deepEqual(tx.get('homes',old.id),old);
   assert.deepEqual(tx.put('homes',old.id,old.value,old.revision),old);
   assert.deepEqual(tx.getVersion(historyReference(old,'homes')).value,old.value);
   if(proposed){
    assert.throws(()=>tx.getVersion(proposed),/historical version is unavailable/);
    if(proposed.id!==old.id)assert.equal(tx.get('homes',proposed.id),null);
   }
   assert.equal(tx.get('notices','put-fence-unexpected'),null);
   assert.equal(tx.get('commands','put-fence-receipt'),null);
   assert.equal(tx.get('reviews','put-fence-staged-review'),null);
  });
  assert.equal(fresh.verify().complete,true);
  assert.equal(fresh.auditReviewSelection().clean,true);
 }finally{fresh.close();}
 assert.deepEqual(putFenceDigest(f),before,'independent reopen and successful no-op introduce no event or derived-state drift');
}

test('put fence: escaped nested denial is retained at current lookup and every physical preparation stage',()=>{
 for(const mode of ['create','update'])for(const [point,match] of Object.entries(putFencePoints)){
  if(mode==='create'&&point==='decrement')continue;
  let armed=false,active,escaped,hits=0,nested;
  const f=peerFixture({onQuery:q=>{
   if(!armed||!match(q.sql))return;
   armed=false;hits++;
   try{putFenceUnexpected(active);}catch(error){nested=error;throw error;}
  }});
  try{
   const old=putFenceSeed(f),target=putFenceTarget(old,mode),before=putFenceDigest(f),trace=byteQueryTrace(f.ledger);
   try{
    assert.throws(()=>f.ledger.write('put-fence.escaped','founder',tx=>{
     active=tx;escaped=tx;tx.event('put-fence.buffered-before-denial',{});armed=true;
     tx.put('homes',target.id,target.value,target.expected);
    }),error=>{
     assert.ok(nested);assert.match(nested.message,/Reentrant peer row mutation.*rollback required/);
     assert.ok(putFenceContains(error,nested),'retain the exact nested denial in the boundary error');
     assert.ok(putFenceContains(error,/failed row mutation/));return true;
    });
   }finally{trace.restore();}
   active=null;assert.equal(hits,1);putFenceNoUnexpected(trace.calls);
   if(point==='current'||point==='history')assert.equal(trace.calls.some(call=>call.method==='run'),false,'denial before first execution permits no physical outer write');
   assert.throws(()=>escaped.get('homes',old.id),/expired/);
   assert.throws(()=>escaped.put('notices','expired-put',{},0),/expired/);
   putFenceAssertRollback(f,before,old,target.reference);
  }finally{armed=false;active=null;f.close();}
 }
});

test('put fence: caught nested changes no-ops and malformed attempts poison even normal callback completion',()=>{
 const cases=[...Object.keys(putFencePoints).map(point=>({point,outer:'update',nested:'change'})),
  {point:'current',outer:'create',nested:'change'},
  {point:'current',outer:'noop',nested:'change'},
  {point:'current',outer:'update',nested:'noop'},
  {point:'current',outer:'update',nested:'malformed'}];
 for(const item of cases){
  let armed=false,active,old,hits=0,nested,outerError,escaped,callbackReturned=false,callStart=0;
  const f=peerFixture({onQuery:q=>{
   if(!armed||!putFencePoints[item.point](q.sql))return;
   armed=false;hits++;
   try{
    if(item.nested==='noop')active.put('homes',old.id,old.value,old.revision);
    else if(item.nested==='malformed')active.put('not-a-family',null,undefined,-1);
    else putFenceUnexpected(active);
   }catch(error){nested=error;}
  }});
  try{
   old=putFenceSeed(f);const target=putFenceTarget(old,item.outer),before=putFenceDigest(f),trace=byteQueryTrace(f.ledger);
   try{
    assert.throws(()=>f.ledger.write('put-fence.swallowed','founder',tx=>{
     active=tx;escaped=tx;putFenceStage(tx,old);
     assert.equal(f.ledger.db.prepare('SELECT review_id FROM peer_review_dirty WHERE review_id=?').get('put-fence-staged-review').review_id,'put-fence-staged-review','a real dirty review precedes the denied call');
     callStart=trace.calls.length;armed=true;
     try{tx.put('homes',target.id,target.value,target.expected);}catch(error){outerError=error;}
     assert.ok(nested);assert.match(nested.message,/Reentrant peer row mutation.*rollback required/);
     assert.ok(outerError);putFencePoison(outerError);
     const beforeLate=trace.calls.length;
     for(const operation of [
      ()=>tx.get('homes',old.id),()=>tx.put('notices','after-denial',{},0),
      ()=>tx.getVersion(historyReference(old,'homes')),()=>tx.list('homes'),
      ()=>tx.count('homes'),()=>tx.events(),()=>tx.event('after.denial',{}),
      ()=>tx.resolveLegacy({sha256:old.sha256}),()=>tx.queryCurrentReviews({subjects:[],scopes:[]})
     ])assert.throws(operation,putFencePoison);
     assert.equal(trace.calls.length,beforeLate,'terminal poison rejects later handle calls before SQL');
     callbackReturned=true;return 'every failure was swallowed';
    }),putFencePoison);
   }finally{trace.restore();}
   active=null;assert.equal(callbackReturned,true);assert.equal(hits,1);
   putFenceNoUnexpected(trace.calls);
   if(item.point==='current'||item.point==='history')assert.equal(trace.calls.slice(callStart).some(call=>call.method==='run'),false,'the poisoned outer put adds no physical changes after the earlier staged writes');
   assert.throws(()=>escaped.get('homes',old.id),/expired/);
   putFenceAssertRollback(f,before,old,target.reference);
  }finally{armed=false;active=null;f.close();}
 }
});

test('put fence: real current-row and modifying-statement returns cannot escape a caught denial or replace a provider error',()=>{
 const cases=[];
 for(const mode of ['create','update','noop'])for(const point of Object.keys(putFencePoints)){
  if(mode==='noop'&&point!=='current'||mode==='create'&&point==='decrement')continue;
  cases.push({mode,point});
 }
 for(const {mode,point} of cases)for(const throwsAfter of [false,true]){
  const f=peerFixture(),original=f.ledger.query,runs=[];
  let active,armed=false,hits=0,nested,escaped,callbackReturned=false;
  const injected=Error('put-fence provider completion error');
  try{
   const old=putFenceSeed(f),target=putFenceTarget(old,mode),before=putFenceDigest(f);
   const method=point==='current'?'get':'run';
   f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    return new Proxy(statement,{get(object,key){
     const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
     if(!['get','run'].includes(key))return value.bind(object);
     return (...args)=>{
      const result=Reflect.apply(value,object,args);
      if(key==='run')runs.push({sql,args});
      if(armed&&key===method&&putFencePoints[point](sql)){
       armed=false;hits++;
       if(point==='current')assert.equal(result?.id,mode==='create'?undefined:old.id,'the actual SELECT returned its real current-row result');
       try{putFenceUnexpected(active);}catch(error){nested=error;}
       if(throwsAfter)throw injected;
      }
      return result;
     };
    }});
   };
   assert.throws(()=>f.ledger.write('put-fence.after-provider','founder',tx=>{
    active=tx;escaped=tx;armed=true;
    assert.throws(()=>tx.put('homes',target.id,target.value,target.expected),error=>{
     assert.ok(putFenceContains(error,/failed row mutation/));
     if(throwsAfter)assert.ok(putFenceContains(error,injected),'retain the original provider exception by identity');
     return true;
    });
    assert.ok(nested);assert.match(nested.message,/Reentrant peer row mutation/);
    callbackReturned=true;return 'caught provider boundary failure';
   }),putFencePoison);
   active=null;f.ledger.query=original;
   assert.equal(hits,1);assert.equal(callbackReturned,true);
   if(point==='current')assert.equal(runs.length,0,'no physical statement follows a poisoned current-row retrieval');
   else{assert.ok(runs.length>0);assert.ok(putFencePoints[point](runs.at(-1).sql),'no later physical statement follows the actual targeted execution');}
   assert.equal(runs.some(run=>run.sql==='INSERT INTO peer_versions VALUES(?,?,?,?,?)'&&run.args[0]==='notices'),false);
   assert.throws(()=>escaped.put('homes',target.id,target.value,target.expected),/expired/);
   putFenceAssertRollback(f,before,old,target.reference);
  }finally{armed=false;active=null;f.ledger.query=original;f.close();}
 }
});

test('put fence: early canonical inspection traps cannot admit nested writes or conceal poisoned validation failures',()=>{
 for(const point of ['getPrototypeOf','ownKeys','getOwnPropertyDescriptor'])for(const behavior of ['caught','escaped','provider','malformed']){
  const f=peerFixture();let active,armed=false,hits=0,nested,escaped,callbackReturned=false;
  const injected=Error('put-fence canonical provider failure');
  try{
   const old=putFenceSeed(f),target=putFenceTarget(old),before=putFenceDigest(f),trace=byteQueryTrace(f.ledger);
   const value=behavior==='malformed'?{...target.value,unsupported:undefined}:target.value;
   const proxy=new Proxy(value,{[point](...args){
    if(armed){
     armed=false;hits++;
     try{putFenceUnexpected(active);}catch(error){nested=error;if(behavior==='escaped')throw error;}
     if(behavior==='provider')throw injected;
    }
    return Reflect[point](...args);
   }});
   try{
    assert.throws(()=>f.ledger.write('put-fence.canonical','founder',tx=>{
     active=tx;escaped=tx;armed=true;
     assert.throws(()=>tx.put('homes',old.id,proxy,old.revision),error=>{
      assert.ok(putFenceContains(error,/failed row mutation/));
      if(behavior==='escaped')assert.ok(putFenceContains(error,nested));
      if(behavior==='provider')assert.ok(putFenceContains(error,injected));
      if(behavior==='malformed')assert.ok(putFenceContains(error,/JSON/),'retain the validation error as well as terminal poison');
      return true;
     });
     assert.ok(nested);assert.match(nested.message,/Reentrant peer row mutation/);
     assert.throws(()=>tx.put('homes',old.id,old.value,old.revision),putFencePoison);
     callbackReturned=true;return 'canonical error caught';
    }),putFencePoison);
   }finally{trace.restore();}
   active=null;assert.equal(hits,1);assert.equal(callbackReturned,true);
   assert.equal(trace.calls.some(call=>call.method==='run'),false,'canonical reentry is denied before the first modifying statement');
   putFenceNoUnexpected(trace.calls);
   assert.throws(()=>escaped.getVersion(historyReference(old,'homes')),/expired/);
   putFenceAssertRollback(f,before,old,behavior==='malformed'?null:target.reference);
  }finally{armed=false;active=null;f.close();}
 }
});

test('put fence: validation failures sequential real puts repeated history and successful no-ops release only the call flag',()=>{
 const f=peerFixture();try{
  const old=putFenceSeed(f),ref=historyReference(old,'homes');let accessed=false,first,second,last;
  const accessor={};Object.defineProperty(accessor,'value',{enumerable:true,get(){accessed=true;return 1;}});
  const before=putFenceDigest(f);
  f.ledger.write('put-fence.validation-recovery','founder',tx=>{
   const invalid=[
    ()=>tx.put('not-a-family','x',{},0),()=>tx.put('homes','',{},0),
    ()=>tx.put('homes',old.id,old.value,-1),()=>tx.put('homes',old.id,old.value,old.revision+1),
    ()=>tx.put('homes','invalid-json',{bad:undefined},0),()=>tx.put('homes','invalid-accessor',accessor,0),
    ()=>tx.put('homes','oversized',{text:'x'.repeat(1_000_000)},0)
   ];
   for(const operation of invalid){
    assert.throws(operation);
    assert.deepEqual(tx.put('homes',old.id,old.value,old.revision),old,'a rejected outer call must release its local flag');
    assert.deepEqual(tx.getVersion(ref).value,old.value,'recoverable validation must not set physical mutation or terminal poison');
   }
  });
  assert.equal(accessed,false);assert.deepEqual(putFenceDigest(f),before);
  f.ledger.read(tx=>{
   for(let i=0;i<2;i++){
    assert.throws(()=>tx.put('homes',old.id,old.value,old.revision),/cannot write/);
    assert.deepEqual(tx.getVersion(ref).value,old.value);
   }
  });
  assert.deepEqual(putFenceDigest(f),before);
  f.ledger.write('put-fence.sequential','founder',tx=>{
   first=tx.put('notices','put-fence-sequential-a',{status:'pending',scope:'alpha',content:'First'},0);
   assert.deepEqual(tx.put('notices',first.id,first.value,first.revision),first);
   second=tx.put('notices',first.id,{...first.value,content:'Second'},first.revision);
   assert.deepEqual(tx.put('notices',second.id,second.value,second.revision),second);
   last=tx.put('notices','put-fence-sequential-b',{status:'pending',scope:'beta',content:'Separate row'},0);
  });
  assert.equal(first.revision,1);assert.equal(second.revision,2);assert.equal(last.revision,1);
  const fresh=new PeerLedger(f.root);try{
   fresh.read(tx=>{
    assert.deepEqual(tx.get('notices',second.id),second);assert.deepEqual(tx.get('notices',last.id),last);
    assert.deepEqual(tx.getVersion(historyReference(first,'notices')).value,first.value);
    assert.deepEqual(tx.getVersion(historyReference(second,'notices')).value,second.value);
    for(const id of ['invalid-json','invalid-accessor','oversized'])assert.equal(tx.get('homes',id),null);
   });
   const stable=putFenceDigest(f);
   fresh.write('put-fence.noop-only','founder',tx=>{
    assert.deepEqual(tx.put('notices',second.id,second.value,second.revision),second);
    assert.deepEqual(tx.put('notices',last.id,last.value,last.revision),last);
    assert.deepEqual(tx.getVersion(historyReference(second,'notices')).value,second.value);
   });
   assert.deepEqual(putFenceDigest(f),stable);assert.equal(fresh.verify().complete,true);
  }finally{fresh.close();}
 }finally{f.close();}
});

test('put fence: ordinary get and historical READ hooks still permit real or no-op puts outside an active put',()=>{
 for(const point of ['get','history'])for(const mode of ['change','noop']){
  let active,armed=false,hits=0,notice,changed;
  const match=point==='get'?putFencePoints.current:sql=>sql===callbackExactHistorySQL;
  const f=peerFixture({onQuery:q=>{
   if(!armed||!match(q.sql))return;
   armed=false;hits++;
   changed=active.put('notices',notice.id,mode==='change'?{...notice.value,content:'Explicitly reconciled read-hook change.'}:notice.value,notice.revision);
  }});
  try{
   notice=f.ledger.write('put-fence.read-seed','founder',tx=>tx.put('notices','put-fence-read-notice',{status:'pending',scope:'alpha',content:'Before read hook'},0));
   const source=f.ledger.write('put-fence.history-seed','founder',tx=>tx.put('tasks','put-fence-read-source',{status:'planned',scope:'alpha'},0));
   const reference=historyReference(source),before=putFenceDigest(f);
   f.ledger.write('put-fence.read-hook','founder',tx=>{
    active=tx;armed=true;
    const read=()=>point==='get'?tx.get('tasks',source.id):tx.getVersion(reference);
    if(mode==='change'&&point==='history')assert.throws(read,/owning snapshot before pending writes/i);
    else assert.deepEqual(read().value,source.value);
    if(mode==='change'){
     assert.deepEqual(tx.get('notices',notice.id),changed);
     tx.event('put-fence.read-hook-reconciled',{id:notice.id});
    }
   });
   active=null;assert.equal(hits,1);
   if(mode==='change'){
    assert.equal(changed.revision,2);assert.deepEqual(f.ledger.read(tx=>tx.get('notices',notice.id)),changed);
   }else{assert.deepEqual(changed,notice);assert.deepEqual(putFenceDigest(f),before);}
   assert.equal(f.ledger.verify().complete,true);
  }finally{armed=false;active=null;f.close();}
 }
});

test('put fence: read-only telemetry inside an active put remains supported with the existing historical and collection guards',()=>{
 for(const mode of ['create','update','noop'])for(const point of ['current','history','row','generation']){
  if(mode==='noop'&&point!=='current')continue;
  let active,armed=false,old,hits=0;
  const f=peerFixture({onQuery:q=>{
   if(!armed||!putFencePoints[point](q.sql))return;
   armed=false;hits++;
   assert.equal(active.get('control','company').value.paused,false);
   assert.equal(active.count('tasks'),0);
   if(point==='current'){
    assert.deepEqual(active.getVersion(historyReference(old,'homes')).value,old.value);
    assert.equal(active.list('homes').total,1);
    assert.deepEqual(active.queryCurrentReviews({subjects:[],scopes:[]}),selectionEmpty());
   }else{
    assert.throws(()=>active.getVersion(historyReference(old,'homes')),/before pending writes/);
    assert.throws(()=>active.list('homes'),/List after pending writes/);
    assert.throws(()=>active.queryCurrentReviews({subjects:[],scopes:[]}),/before pending writes/);
   }
  }});
  try{
   old=putFenceSeed(f);const target=putFenceTarget(old,mode),before=putFenceDigest(f);
   const result=f.ledger.write('put-fence.read-only-telemetry','founder',tx=>{
    active=tx;armed=true;return tx.put('homes',target.id,target.value,target.expected);
   });
   active=null;assert.equal(hits,1);
   assert.equal(result.revision,mode==='noop'?old.revision:target.expected+1);
   assert.deepEqual(result.value,target.value);
   const fresh=new PeerLedger(f.root);try{
    assert.deepEqual(fresh.read(tx=>tx.get('homes',target.id)),result);
    assert.deepEqual(fresh.read(tx=>tx.getVersion(historyReference(old,'homes'))).value,old.value);
    assert.equal(fresh.read(tx=>tx.list('homes')).total,mode==='create'?2:1);
    assert.equal(fresh.verify().complete,true);
   }finally{fresh.close();}
   if(mode==='noop')assert.deepEqual(putFenceDigest(f),before);
  }finally{armed=false;active=null;f.close();}
 }
});

test('put fence: poisoned external savepoints roll back receipts and dirty reviews while preserving caller work and later savepoints',()=>{
 for(const point of ['current','history','row','generation']){
  const f=peerFixture(),db=new DatabaseSync(f.file);
  let armed=false,active,hits=0,nested,escaped,callbackReturned=false;
  const shared=new PeerLedger(f.root,{connection:db,onQuery:q=>{
   if(!armed||!putFencePoints[point](q.sql))return;
   armed=false;hits++;
   try{putFenceUnexpected(active);}catch(error){nested=error;}
  }}),sibling=new PeerLedger(f.root,{connection:db});
  try{
   const old=putFenceSeed(f),target=putFenceTarget(old),before=putFenceDigest(f),eventsBefore=f.ledger.events().total;
   db.exec('BEGIN IMMEDIATE');
   const retained=shared.writeWithin('put-fence.caller-before','founder',tx=>tx.put('notices','put-fence-caller-retained',{status:'pending',scope:'alpha',content:'Caller work before failing savepoint'},0));
   const callerState=putFenceDigest(f,db);
   assert.throws(()=>shared.writeWithin('put-fence.failed-savepoint','founder',tx=>{
    active=tx;escaped=tx;putFenceStage(tx,old);armed=true;
    assert.throws(()=>tx.put('homes',target.id,target.value,target.expected),putFencePoison);
    assert.ok(nested);assert.match(nested.message,/Reentrant peer row mutation/);
    callbackReturned=true;return 'savepoint failure swallowed';
   }),putFencePoison);
   active=null;assert.equal(callbackReturned,true);assert.equal(hits,1);
   assert.equal(db.isTransaction,true,'the caller retains its actual outer transaction');
   assert.deepEqual(putFenceDigest(f,db),callerState,'only the failed savepoint is rolled back, including earlier staged receipt and dirty review');
   assert.deepEqual(putFenceDigest(f),before,'another connection still sees the prior committed state');
   assert.throws(()=>escaped.put('homes',old.id,old.value,old.revision),/expired/);
   const following=sibling.writeWithin('put-fence.caller-after','founder',tx=>{
    assert.deepEqual(tx.get('notices',retained.id),retained);
    assert.deepEqual(tx.put('homes',old.id,old.value,old.revision),old);
    assert.throws(()=>tx.getVersion(historyReference(old,'homes')),/external transactions are excluded/);
    return tx.put('notices','put-fence-caller-following',{status:'pending',scope:'beta',content:'Later independent savepoint'},0);
   });
   assert.equal(db.isTransaction,true);db.exec('COMMIT');
   const fresh=new PeerLedger(f.root);try{
    fresh.read(tx=>{
     assert.deepEqual(tx.get('homes',old.id),old);
     assert.deepEqual(tx.get('notices',retained.id),retained);
     assert.deepEqual(tx.get('notices',following.id),following);
     assert.equal(tx.get('notices','put-fence-unexpected'),null);
     assert.equal(tx.get('commands','put-fence-receipt'),null);
     assert.equal(tx.get('reviews','put-fence-staged-review'),null);
     assert.throws(()=>tx.getVersion(target.reference),/unavailable/);
    });
    assert.equal(fresh.events().total,eventsBefore+2,'the failed savepoint contributes no event or receipt');
    assert.equal(fresh.verify().complete,true);assert.equal(fresh.auditReviewSelection().clean,true);
   }finally{fresh.close();}
  }finally{armed=false;active=null;if(db.isTransaction)db.exec('ROLLBACK');shared.close();sibling.close();db.close();f.close();}
 }
});

test('put fence: ordinary provider errors preserve identity and pre-mutation recovery without clearing physical-mutation poison',()=>{
 for(const point of ['current','history'])for(const phase of ['prepare','result']){
  let armed=false,hits=0,escaped,callbackReturned=false;
  const injected=Error('put-fence ordinary provider '+point+' '+phase);
  const f=peerFixture({onQuery:q=>{
   if(!armed||phase!=='prepare'||!putFencePoints[point](q.sql))return;
   armed=false;hits++;throw injected;
  }}),original=f.ledger.query;
  try{
   const old=putFenceSeed(f),target=putFenceTarget(old),before=putFenceDigest(f);
   f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(!armed||phase!=='result'||!putFencePoints[point](sql))return statement;
    armed=false;const method=point==='current'?'get':'run';
    return {[method](...args){
     statement[method](...args);hits++;throw injected;
    }};
   };
   const callback=tx=>{
    escaped=tx;armed=true;
    assert.throws(()=>tx.put('homes',target.id,target.value,target.expected),error=>{assert.equal(error,injected);return true;});
    assert.equal(hits,1);
    if(point==='current'){
     assert.deepEqual(putFenceDigest(f,f.ledger.db),before);
     assert.deepEqual(tx.getVersion(historyReference(old,'homes')).value,old.value);
     assert.deepEqual(tx.put('homes',old.id,old.value,old.revision),old);
     callbackReturned=true;return tx.put('homes',target.id,target.value,target.expected);
    }
    assert.throws(()=>tx.put('homes',old.id,old.value,old.revision),putFencePoison);
    callbackReturned=true;return 'physical failure swallowed';
   };
   if(point==='current'){
    const changed=f.ledger.write('put-fence.provider-recovered','founder',callback);
    assert.equal(changed.revision,2);assert.equal(changed.sha256,target.reference.sha256);
    assert.deepEqual(f.ledger.read(tx=>tx.get('homes',old.id)),changed);
    assert.deepEqual(f.ledger.read(tx=>tx.getVersion(historyReference(old,'homes'))).value,old.value);
    assert.equal(f.ledger.verify().complete,true);
   }else{
    assert.throws(()=>f.ledger.write('put-fence.provider-poison','founder',callback),putFencePoison);
    putFenceAssertRollback(f,before,old,target.reference);
    const fresh=new PeerLedger(f.root);try{
     const changed=fresh.write('put-fence.provider-fresh-write','founder',tx=>tx.put('homes',target.id,target.value,target.expected));
     assert.equal(changed.sha256,target.reference.sha256);assert.equal(fresh.verify().complete,true);
    }finally{fresh.close();}
   }
   assert.equal(callbackReturned,true);assert.equal(hits,1);
   assert.throws(()=>escaped.get('homes',old.id),/expired/);
  }finally{armed=false;f.ledger.query=original;f.close();}
 }
});

test('put fence: physical transaction loss during preparation or real statement return cannot permit an autocommit write or successful result',()=>{
 for(const point of ['current','history'])for(const phase of ['prepare','result'])for(const throwsAfter of [false,true]){
  let armed=false,hits=0,escaped,observed,callbackReturned=false;
  const injected=Error('put-fence provider error with physical transaction loss');
  const f=peerFixture({onQuery:q=>{
   if(!armed||phase!=='prepare'||!putFencePoints[point](q.sql))return;
   armed=false;hits++;
   // Controlled trusted-host loss of the real transaction, not confinement.
   f.ledger.db.exec('ROLLBACK');
   if(throwsAfter)throw injected;
  }}),original=f.ledger.query,runs=[];
  try{
   const old=putFenceSeed(f),target=putFenceTarget(old),before=putFenceDigest(f);
   const method=point==='current'?'get':'run';
   f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    return new Proxy(statement,{get(object,key){
     const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
     if(!['get','run'].includes(key))return value.bind(object);
     return (...args)=>{
      const result=Reflect.apply(value,object,args);
      if(key==='run')runs.push({sql,args});
      if(armed&&phase==='result'&&key===method&&putFencePoints[point](sql)){
       armed=false;hits++;f.ledger.db.exec('ROLLBACK');
       if(throwsAfter)throw injected;
      }
      return result;
     };
    }});
   };
   assert.throws(()=>f.ledger.write('put-fence.physical-loss','founder',tx=>{
    escaped=tx;armed=true;
    assert.throws(()=>tx.put('homes',target.id,target.value,target.expected),error=>{
     observed=error;assert.ok(putFenceContains(error,/transaction.*active|transaction boundary/i));
     if(throwsAfter)assert.ok(putFenceContains(error,injected),'provider identity survives simultaneous physical loss');
     return true;
    });
    assert.throws(()=>tx.get('homes',old.id),/transaction.*active/i);
    callbackReturned=true;return 'lost transaction failure swallowed';
   }),error=>{assert.ok(putFenceContains(error,/transaction|rollback/i));return true;});
   f.ledger.query=original;
   assert.ok(observed);assert.equal(hits,1);assert.equal(callbackReturned,true);
   if(point==='current'||phase==='prepare')assert.equal(runs.length,0,'a prepared statement must not execute after transaction loss');
   else{assert.equal(runs.length,1);assert.ok(putFencePoints.history(runs[0].sql),'the sole executed INSERT was rolled back before its result escaped');}
   assert.throws(()=>escaped.put('homes',target.id,target.value,target.expected),/expired/);
   putFenceAssertRollback(f,before,old,target.reference);
   const recovered=f.ledger.write('put-fence.physical-recovery','founder',tx=>tx.put('homes',target.id,target.value,target.expected));
   assert.equal(recovered.sha256,target.reference.sha256);assert.equal(f.ledger.verify().complete,true);
  }finally{armed=false;f.ledger.query=original;f.close();}
 }
});
