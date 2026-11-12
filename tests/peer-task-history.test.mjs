import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {canonical,PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Fictional committed P1 histories. This proves complete bounded retrieval,
// not per-version event provenance, native acceptance or current authority.
const MAX_BYTES=16*1024*1024;
const ref=row=>({family:'tasks',id:row.id,revision:row.revision,sha256:row.sha256});
const preflight=sql=>sql.includes('peer_versions')&&sql.includes('SUM(');
const body=sql=>sql.includes('SELECT family,id,revision,sha256,bytes FROM peer_versions')&&sql.includes('ORDER BY revision');
const sha=text=>createHash('sha256').update(text).digest('hex');

function fixture(t,values=[{status:'returned',scope:'legacy'},{status:'cancelled',scope:'legacy',authority_epoch:1,authority_previous:'original',authority_event:'cancel'},{status:'cancelled',scope:'legacy'}]){
  const f=peerFixture();t.after(()=>f.close());f.versions=[];
  f.ledger.write('fictional-task-history','founder',tx=>{
    for(const value of values){const row=tx.put('tasks','history-task',value,f.versions.length);f.versions.push(row);}
  });
  f.from=ref(f.versions[0]);f.through=ref(f.versions.at(-1));
  f.history=(from=f.from,through=f.through)=>f.ledger.read(tx=>tx.getTaskHistory(from,through));
  return f;
}
function state(f){
  const names=f.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(names.map(({name})=>[name,f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.parse(JSON.stringify(row))).sort((a,b)=>canonical(a).localeCompare(canonical(b)))]));
}
function corrupt(f,sql,...args){
  const db=new DatabaseSync(f.file);
  try{db.exec('DROP TRIGGER peer_history_update; DROP TRIGGER peer_history_delete;');db.prepare(sql).run(...args);}
  finally{db.close();}
}

test('complete task history retains the modern intermediate revision between fieldless legacy endpoints',t=>{
  const f=fixture(t),before=state(f),rows=f.history();
  assert.deepEqual(rows,f.versions.map(row=>({...ref(row),value:row.value})));
  assert.equal(rows[0].value.authority_epoch,undefined);assert.equal(rows[1].value.authority_epoch,1);assert.equal(rows[2].value.authority_epoch,undefined);
  for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['family','id','revision','sha256','value']);
  rows[1].value.authority_epoch=99;
  assert.equal(f.history()[1].value.authority_epoch,1);
  assert.deepEqual(state(f),before);
});

test('equal and strict subrange endpoints return their complete inclusive ordered ranges',t=>{
  const f=fixture(t);
  assert.deepEqual(f.history(ref(f.versions[1]),ref(f.versions[1])),[{...ref(f.versions[1]),value:f.versions[1].value}]);
  assert.deepEqual(f.history(ref(f.versions[1]),f.through).map(row=>row.revision),[2,3]);
  assert.equal(f.ledger.read(tx=>tx.getVersion(f.from)).sha256,f.from.sha256);
});

test('task endpoints require closed exact refs, one task identity, supported family and ordered safe revisions',t=>{
  const f=fixture(t),queries=[];f.ledger.onQuery=({sql})=>queries.push(sql);
  const malformed=[null,{},[],{...f.from,extra:true},{...f.from,family:'homes'},{...f.from,id:'different-task'},{...f.from,revision:0},{...f.from,revision:1.5},{...f.from,revision:Number.MAX_SAFE_INTEGER+1},{...f.from,sha256:'short'}];
  for(const bad of malformed){
    queries.length=0;assert.throws(()=>f.history(bad,f.through));
    assert.equal(queries.some(sql=>preflight(sql)||body(sql)),false);
  }
  queries.length=0;assert.throws(()=>f.history(f.through,f.from));assert.equal(queries.some(sql=>preflight(sql)||body(sql)),false);
  const accessor={...f.from};Object.defineProperty(accessor,'id',{enumerable:true,get(){assert.fail('must not invoke an endpoint accessor');}});
  assert.throws(()=>f.history(accessor,f.through));
});

test('span above 10000 revisions is denied before history SQL or body materialization',t=>{
  const f=fixture(t),queries=[];f.ledger.onQuery=({sql})=>queries.push(sql);
  assert.throws(()=>f.history(f.from,{...f.through,revision:10001}),/capacity|bound|10000|10,000/i);
  assert.equal(queries.some(sql=>preflight(sql)||body(sql)),false);
});

test('span of exactly 10000 is checked for complete coverage rather than silently narrowed',t=>{
  const f=fixture(t),queries=[];f.ledger.onQuery=({sql})=>queries.push(sql);
  assert.throws(()=>f.history(f.from,{...f.through,revision:10000}),/history|range|incomplete|count/i);
  assert.equal(queries.some(preflight),true);assert.equal(queries.some(body),false);
});

test('wrong endpoint hashes and missing endpoint revisions fail instead of following latest rows',t=>{
  const f=fixture(t);
  for(const [from,through]of[[{...f.from,sha256:'0'.repeat(64)},f.through],[f.from,{...f.through,sha256:'0'.repeat(64)}],[{...f.from,revision:4},{...f.through,revision:4}],[f.from,{...f.through,revision:4}]])assert.throws(()=>f.history(from,through),/hash|endpoint|history|range|incomplete|unavailable/i);
});

test('missing intermediate history is denied by count preflight before loading any body',t=>{
  const f=fixture(t),queries=[];
  corrupt(f,"DELETE FROM peer_versions WHERE family='tasks' AND id='history-task' AND revision=2");
  f.ledger.onQuery=({sql})=>queries.push(sql);
  assert.throws(()=>f.history(),/history|range|incomplete|count/i);
  assert.equal(queries.some(preflight),true);assert.equal(queries.some(body),false);
});

for(const kind of ['hash','noncanonical'])test(`late ${kind} corruption prevents returning any history prefix`,t=>{
  const f=fixture(t);
  if(kind==='hash')corrupt(f,"UPDATE peer_versions SET bytes='{}' WHERE family='tasks' AND id='history-task' AND revision=2");
  else{const bytes='{"z":1,"a":2}';corrupt(f,"UPDATE peer_versions SET bytes=?,sha256=? WHERE family='tasks' AND id='history-task' AND revision=2",bytes,sha(bytes));}
  assert.throws(()=>f.history(),/hash|encoding/i);
});

test('all history handles expire after successful, failed and delayed owning callbacks',async t=>{
  const f=fixture(t);let escaped;
  f.ledger.read(tx=>{escaped=tx;assert.equal(tx.getTaskHistory(f.from,f.through).length,3);});
  assert.throws(()=>escaped.getTaskHistory(f.from,f.through),/expired/);
  assert.throws(()=>f.ledger.read(tx=>{escaped=tx;throw Error('original callback failure');}),/original callback/);
  assert.throws(()=>escaped.getTaskHistory(f.from,f.through),/expired/);
  let delayed;
  f.ledger.read(tx=>{delayed=Promise.resolve().then(()=>assert.throws(()=>tx.getTaskHistory(f.from,f.through),/expired/));});
  await delayed;
  f.ledger.read(()=>assert.throws(()=>escaped.getTaskHistory(f.from,f.through),/expired/));
});

test('successful no-op put preserves history while any real row put fences it',t=>{
  const f=fixture(t),before=state(f);
  f.ledger.write('history.noop','founder',tx=>{const row=tx.get('tasks','history-task');tx.put('tasks',row.id,row.value,row.revision);assert.equal(tx.getTaskHistory(f.from,f.through).length,3);});
  assert.deepEqual(state(f),before);
  assert.throws(()=>f.ledger.write('history.after-write','founder',tx=>{tx.put('notices','changed',{status:'pending'},0);tx.getTaskHistory(f.from,f.through);}),/before|pending|write/i);
  assert.deepEqual(state(f),before);
});

test('caught partial put failure still poisons history and rolls back every table',t=>{
  const f=fixture(t),before=state(f);
  f.ledger.db.exec("CREATE TEMP TRIGGER history_put_failure BEFORE INSERT ON peer_rows WHEN NEW.id='failed-notice' BEGIN SELECT RAISE(ABORT,'synthetic partial put failure'); END;");
  assert.throws(()=>f.ledger.write('history.failed-put','founder',tx=>{
    assert.throws(()=>tx.put('notices','failed-notice',{status:'pending'},0),/synthetic partial/);
    assert.throws(()=>tx.getTaskHistory(f.from,f.through),/failed row mutation|rollback|before|pending|write/i);
  }),/failed row mutation|rollback/i);
  assert.deepEqual(state(f),before);
});

test('external savepoint reads are rejected without taking away caller transaction ownership',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file),borrowed=new PeerLedger(f.root,{connection:db});
  try{
    db.exec('BEGIN IMMEDIATE');let called=0;
    assert.throws(()=>borrowed.writeWithin('history.external','founder',tx=>{called++;tx.getTaskHistory(f.from,f.through);}),/owning snapshot|external/i);
    assert.equal(called,1);assert.equal(db.isTransaction,true);db.exec('ROLLBACK');
    assert.equal(borrowed.read(tx=>tx.getTaskHistory(f.from,f.through)).length,3);
  }finally{if(db.isTransaction)db.exec('ROLLBACK');borrowed.close();db.close();}
});

test('owning WAL history remains stable across a second connection committed revision',t=>{
  const f=fixture(t),other=new PeerLedger(f.root);let changed=false;
  try{
    f.ledger.onQuery=({sql})=>{if(!changed&&preflight(sql)){changed=true;other.write('history.concurrent','founder',tx=>{const row=tx.get('tasks','history-task');tx.put('tasks',row.id,{status:'new'},row.revision);});}};
    assert.deepEqual(f.history().map(row=>row.revision),[1,2,3]);
    assert.equal(changed,true);
    f.ledger.onQuery=null;
    assert.equal(other.read(tx=>tx.get('tasks','history-task')).revision,4);
  }finally{f.ledger.onQuery=null;other.close();}
});

test('UTF-8 sum rejects an over-16MiB matching range before body SQL',t=>{
  const f=fixture(t,Array.from({length:17},(_,i)=>({payload:'é'.repeat(499980),version:i}))),queries=[];
  f.ledger.onQuery=({sql})=>queries.push(sql);
  assert.throws(()=>f.history(),/capacity|bound|bytes|MiB/i);
  assert.equal(queries.some(preflight),true);assert.equal(queries.some(body),false);
});

test('exact 16MiB complete range is admitted and unrelated histories are not hydrated',t=>{
  const sizes=[...Array(16).fill(1_000_000),MAX_BYTES-16_000_000],overhead=Buffer.byteLength(canonical({payload:''}));
  const f=fixture(t,sizes.map((size,i)=>({payload:String(i).padStart(2,'0')+'x'.repeat(size-overhead-2)}))),queries=[];
  f.ledger.write('unrelated.history','founder',tx=>tx.put('tasks','unrelated-task',{payload:'unrelated body'},0));
  f.ledger.onQuery=({sql})=>queries.push(sql);
  const rows=f.history();
  assert.equal(rows.length,17);assert.equal(rows.reduce((sum,row)=>sum+Buffer.byteLength(canonical(row.value)),0),MAX_BYTES);
  assert.equal(queries.filter(body).length,1);
  assert.ok(queries.filter(sql=>preflight(sql)||body(sql)).every(sql=>sql.includes('family=?')&&sql.includes('id=?')&&sql.includes('LIMIT')));
});

for(const mismatch of ['count','order','identity'])test(`actual history ${mismatch} is rechecked after physical body retrieval`,t=>{
  const f=fixture(t),original=f.ledger.query;let fired=false;
  f.ledger.query=function(sql,...args){
    const statement=original.call(this,sql,...args);
    if(!body(sql))return statement;
    return {all(...parameters){
      const rows=statement.all(...parameters);fired=true;
      if(mismatch==='count')return rows.slice(0,-1);
      if(mismatch==='order')return rows.reverse();
      return rows.map((row,i)=>i===1?{...row,id:'different-task'}:row);
    }};
  };
  assert.throws(()=>f.history(),/history|range|incomplete|count|order|identity/i);
  assert.equal(fired,true);f.ledger.query=original;
});

for(const point of ['preflight','body'])test(`original provider error identity survives ${point} failure`,t=>{
  const f=fixture(t),causes=[Error('original history provider'),new AggregateError([Error('inner history provider')],'original provider aggregate')];
  for(const cause of causes){
    f.ledger.onQuery=({sql})=>{if((point==='preflight'?preflight:body)(sql))throw cause;};
    assert.throws(()=>f.history(),error=>error===cause);
  }
  f.ledger.onQuery=null;assert.equal(f.history().length,3);
});

test('provider reentry into a real put cannot return stale history or commit a partial prefix',t=>{
  const f=fixture(t),before=state(f);let handle,fired=false;
  f.ledger.onQuery=({sql})=>{if(!fired&&preflight(sql)){fired=true;handle.put('notices','nested-notice',{status:'pending'},0);}};
  assert.throws(()=>f.ledger.write('history.reentrant-put','founder',tx=>{handle=tx;return tx.getTaskHistory(f.from,f.through);}),/before|pending|write/i);
  assert.equal(fired,true);f.ledger.onQuery=null;assert.deepEqual(state(f),before);
});

test('caught recursive history lookup cannot bypass the active history call guard',t=>{
  const f=fixture(t);let handle,fired=0;
  f.ledger.onQuery=({sql})=>{if(preflight(sql)&&fired++===0)assert.throws(()=>handle.getTaskHistory(f.from,f.through),/reentrant/i);};
  assert.throws(()=>f.ledger.read(tx=>{handle=tx;return tx.getTaskHistory(f.from,f.through);}),/reentrant/i);
  assert.equal(fired,1);f.ledger.onQuery=null;assert.equal(f.history().length,3);
});

test('statement-return hook cannot return history after its owning connection ends',t=>{
  const f=fixture(t),original=f.ledger.query;let fired=false;
  f.ledger.query=function(sql,...args){
    const statement=original.call(this,sql,...args);
    if(!body(sql))return statement;
    return {all(...parameters){const result=statement.all(...parameters);fired=true;f.ledger.db.exec('ROLLBACK');return result;}};
  };
  assert.throws(()=>f.history(),/transaction|rollback|active/i);
  assert.equal(fired,true);f.ledger.query=original;assert.equal(f.history().length,3);
});
