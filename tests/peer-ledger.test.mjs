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
