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
