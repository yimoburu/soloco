import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {peerFixture} from './peer-fixture.mjs';

// Isolated fictional ledgers only. These checks establish the physical P1
// cutoff mechanics, not a qualified task/executor authority or native session.
function snapshot(f){
  const db=new DatabaseSync(f.file);
  try{return Object.fromEntries(['peer_rows','peer_versions','peer_generations','peer_membership','peer_events','peer_outbox','peer_meta','peer_review_selection','peer_review_errors','peer_review_dirty'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));}
  finally{db.close();}
}
function traceCommits(ledger){
  const db=ledger.db,original=db.exec,trace=[];
  db.exec=function(sql){trace.push(sql);return original.call(this,sql);};
  return {trace,restore(){db.exec=original;}};
}
function put(tx){return tx.put('notices','guarded-notice',{status:'pending',scope:'fictional',content:'verified staging'},0);}
const future=()=>Date.now()+60000;

test('guarded write observes physical postimages and fully staged event/outbox/meta before COMMIT',()=>{
  const queries=[],f=peerFixture({onQuery:q=>queries.push(q.sql)}),exec=traceCommits(f.ledger);
  try{
    queries.length=0;let view,publicTx;
    const deadline=future();
    const result=f.ledger.guardedWrite('task.effect','cos-a',tx=>{publicTx=tx;const row=put(tx);tx.event('effect.prepared',{id:row.id});return row;},final=>{
      view=final;
      assert.equal(Object.isFrozen(final),true);
      assert.deepEqual(Object.keys(final),['get']);
      assert.equal(final.put,undefined);
      for(const sql of ['INSERT INTO peer_events VALUES(?,?,?,?,?,?)','INSERT INTO peer_outbox(seq) VALUES(?)','UPDATE peer_meta SET last_event_sha256=? WHERE id=1'])assert.ok(queries.includes(sql),sql);
      assert.throws(()=>publicTx.get('control','company'),/expired/);
      const row=final.get('notices','guarded-notice');
      assert.equal(row.value.content,'verified staging');
      row.value.content='detached';
      assert.equal(final.get('notices','guarded-notice').value.content,'verified staging');
      assert.equal(exec.trace.includes('COMMIT'),false);
      return deadline;
    });
    assert.equal(result.value.content,'verified staging');
    assert.deepEqual(exec.trace,['BEGIN IMMEDIATE','COMMIT']);
    assert.equal(f.ledger.read(tx=>tx.get('notices','guarded-notice')).sha256,result.sha256);
    assert.equal(f.ledger.verify().complete,true);
    assert.throws(()=>view.get('control','company'),/expired/);
  }finally{exec.restore();f.close();}
});

test('guarded inspection/no-op still owns BEGIN IMMEDIATE and runs terminal guard without adding an event',()=>{
  const f=peerFixture(),exec=traceCommits(f.ledger);
  try{
    const before=snapshot(f),deadline=future();let calls=0;
    const result=f.ledger.guardedWrite('task.inspect','cos-a',tx=>tx.get('principals','cos-a'),final=>{calls++;assert.equal(final.get('principals','cos-a').id,'cos-a');return deadline;});
    assert.equal(result.id,'cos-a');assert.equal(calls,1);
    assert.deepEqual(exec.trace,['BEGIN IMMEDIATE','COMMIT']);
    assert.deepEqual(snapshot(f),before);
  }finally{exec.restore();f.close();}
});

test('expiry after actual final meta staging rolls back all rows/history/events/outbox with no COMMIT',()=>{
  const f=peerFixture(),exec=traceCommits(f.ledger),originalQuery=f.ledger.query,originalNow=Date.now;
  let clock=1000,staged=0,guardCalls=0;
  try{
    const before=snapshot(f);
    Date.now=()=>clock;
    f.ledger.query=function(sql,...args){
      const statement=originalQuery.call(this,sql,...args);
      if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
      return {run(...parameters){const result=statement.run(...parameters);staged++;clock=2000;return result;}};
    };
    assert.throws(()=>f.ledger.guardedWrite('task.expiring','cos-a',put,view=>{guardCalls++;assert.ok(view.get('notices','guarded-notice'));return 2000;}),error=>error.code==='TASK_EFFECT_EXPIRED');
    assert.equal(staged,1);assert.equal(guardCalls,1);
    assert.deepEqual(exec.trace,['BEGIN IMMEDIATE','ROLLBACK']);
    assert.deepEqual(snapshot(f),before);
  }finally{Date.now=originalNow;f.ledger.query=originalQuery;exec.restore();f.close();}
});

test('final cutoff follows every terminal SQL/provider operation and directly precedes COMMIT',()=>{
  const trace=[],f=peerFixture({onQuery:({sql})=>trace.push('sql:'+sql)}),db=f.ledger.db,originalExec=db.exec,originalNow=Date.now;
  try{
    db.exec=function(sql){trace.push(sql);return originalExec.call(this,sql);};
    trace.length=0;Date.now=()=>{trace.push('clock');return 1000;};
    f.ledger.guardedWrite('task.cutoff','cos-a',put,view=>{view.get('control','company');return 2000;});
    const clock=trace.indexOf('clock');
    assert.ok(clock>trace.findIndex(v=>v.startsWith('sql:UPDATE peer_meta')));
    assert.ok(trace.slice(0,clock).some(v=>v==='sql:SELECT * FROM peer_rows WHERE family=? AND id=?'));
    assert.deepEqual(trace.slice(clock),['clock','COMMIT']);
  }finally{Date.now=originalNow;db.exec=originalExec;f.close();}
});

test('expiry during the last terminal provider read is checked after that read',()=>{
  const f=peerFixture(),exec=traceCommits(f.ledger),originalNow=Date.now;
  let clock=1000,terminal=false,reads=0;
  try{
    const before=snapshot(f);Date.now=()=>clock;
    f.ledger.onQuery=({sql})=>{if(terminal&&sql==='SELECT * FROM peer_events WHERE seq=?'){reads++;clock=2001;}};
    assert.throws(()=>f.ledger.guardedWrite('task.last-read-expiry','cos-a',put,view=>{terminal=true;view.get('control','company');return 2000;}),error=>error.code==='TASK_EFFECT_EXPIRED');
    assert.equal(reads,1);
    assert.deepEqual(exec.trace,['BEGIN IMMEDIATE','ROLLBACK']);
    assert.deepEqual(snapshot(f),before);
  }finally{Date.now=originalNow;f.ledger.onQuery=null;exec.restore();f.close();}
});

for(const cutoff of [2000,2001,NaN,Infinity])test(`invalid or expired final clock ${cutoff} fails closed`,()=>{
  const f=peerFixture(),originalNow=Date.now;
  try{const before=snapshot(f);Date.now=()=>cutoff;assert.throws(()=>f.ledger.guardedWrite('task.clock','cos-a',put,()=>2000),error=>error.code==='TASK_EFFECT_EXPIRED');assert.deepEqual(snapshot(f),before);}
  finally{Date.now=originalNow;f.close();}
});

for(const deadline of [undefined,null,'2000',NaN,Infinity,-Infinity,{},new Number(2000)])test(`nonprimitive or invalid deadline ${String(deadline)} rolls back`,()=>{
  const f=peerFixture();
  try{const before=snapshot(f);assert.throws(()=>f.ledger.guardedWrite('task.deadline','cos-a',put,()=>deadline),/primitive finite deadline/);assert.deepEqual(snapshot(f),before);}
  finally{f.close();}
});

test('async, generator and thenable guards are rejected before callback or transaction startup',()=>{
  const f=peerFixture(),exec=traceCommits(f.ledger);let calls=0;
  const thenableFunction=()=>future();thenableFunction.then=()=>{};
  try{
    const before=snapshot(f);
    for(const guard of [undefined,null,{},async()=>{calls++;return future();},function*(){calls++;yield 1;},async function*(){calls++;yield 1;},{then(){}},thenableFunction])assert.throws(()=>f.ledger.guardedWrite('task.async-guard','cos-a',()=>{calls++;},guard),/Synchronous peer terminal guard/);
    assert.equal(calls,0);assert.deepEqual(exec.trace,[]);assert.deepEqual(snapshot(f),before);
  }finally{exec.restore();f.close();}
});

test('promise and thenable terminal results reject after staging and expire the escaped view',async()=>{
  const f=peerFixture();
  try{
    const before=snapshot(f);let view,continuation;
    assert.throws(()=>f.ledger.guardedWrite('task.promise-guard','cos-a',put,final=>{
      view=final;continuation=Promise.resolve().then(()=>assert.throws(()=>final.get('control','company'),/expired/));return continuation;
    }),/Asynchronous work/);
    await continuation;
    assert.throws(()=>view.get('control','company'),/expired/);
    assert.throws(()=>f.ledger.guardedWrite('task.thenable-guard','cos-a',put,final=>{view=final;return {then(){assert.fail('must not invoke a thenable');}};}),/Asynchronous work/);
    assert.throws(()=>view.get('control','company'),/expired/);
    assert.deepEqual(snapshot(f),before);
  }finally{f.close();}
});

test('guard error identity is preserved, its view expires, and subsequent generic transactions remain usable',()=>{
  const f=peerFixture(),cause=Error('original source guard failure');let view;
  try{
    const before=snapshot(f);
    assert.throws(()=>f.ledger.guardedWrite('task.guard-error','cos-a',put,final=>{view=final;throw cause;}),error=>error===cause);
    assert.throws(()=>view.get('control','company'),/expired/);
    assert.deepEqual(snapshot(f),before);
    assert.equal(f.ledger.read(tx=>tx.get('principals','cos-a')).id,'cos-a');
  }finally{f.close();}
});

test('provider Error and AggregateError identities survive terminal reads even when caught by the guard',()=>{
  for(const cause of [Error('provider failure'),new AggregateError([Error('provider detail')],'provider aggregate')]){
    const f=peerFixture();let terminal=false,view;
    try{
      const before=snapshot(f),deadline=future();
      f.ledger.onQuery=({sql})=>{if(terminal&&sql==='SELECT * FROM peer_rows WHERE family=? AND id=?')throw cause;};
      assert.throws(()=>f.ledger.guardedWrite('task.provider-error','cos-a',put,final=>{
        view=final;terminal=true;assert.throws(()=>final.get('control','company'),error=>error===cause);return deadline;
      }),error=>error===cause);
      assert.throws(()=>view.get('control','company'),/expired/);
      assert.deepEqual(snapshot(f),before);
    }finally{f.ledger.onQuery=null;f.close();}
  }
});

test('caught reentrant terminal reads poison the enclosing operation',()=>{
  const f=peerFixture(),exec=traceCommits(f.ledger);let finalView,terminal=false,nested=0;
  try{
    const before=snapshot(f),deadline=future();
    f.ledger.onQuery=({sql})=>{
      if(terminal&&sql==='SELECT * FROM peer_rows WHERE family=? AND id=?'){
        nested++;assert.throws(()=>finalView.get('control','company'),/Reentrant/);
      }
    };
    assert.throws(()=>f.ledger.guardedWrite('task.reentrant-view','cos-a',put,view=>{finalView=view;terminal=true;view.get('control','company');return deadline;}),/Reentrant/);
    assert.equal(nested,1);assert.deepEqual(exec.trace,['BEGIN IMMEDIATE','ROLLBACK']);assert.deepEqual(snapshot(f),before);
  }finally{f.ledger.onQuery=null;exec.restore();f.close();}
});

test('nested transactions from a terminal guard are rejected and roll back the original operation',()=>{
  const f=peerFixture();
  try{
    const before=snapshot(f);
    assert.throws(()=>f.ledger.guardedWrite('task.nested-guard','cos-a',put,()=>f.ledger.read(()=>future())),/Nested peer transaction/);
    assert.deepEqual(snapshot(f),before);
  }finally{f.close();}
});

test('caller-owned external transaction is rejected without SQL, callback, guard or ownership changes',()=>{
  const f=peerFixture(),db=f.ledger.db,exec=traceCommits(f.ledger);let called=0;
  try{
    db.exec('BEGIN');exec.trace.length=0;
    assert.throws(()=>f.ledger.guardedWrite('task.external','cos-a',()=>{called++;},()=>{called++;return future();}),/own physical commit/);
    assert.equal(called,0);assert.deepEqual(exec.trace,[]);assert.equal(db.isTransaction,true);assert.equal(f.ledger.inTransaction,false);
    db.exec('ROLLBACK');
    assert.equal(f.ledger.read(tx=>tx.get('control','company')).id,'company');
  }finally{if(db.isTransaction)db.exec('ROLLBACK');exec.restore();f.close();}
});

test('ordinary read/write APIs retain synchronous behavior and never acquire a terminal guard',()=>{
  const f=peerFixture(),exec=traceCommits(f.ledger);
  try{
    const row=f.ledger.write('ordinary.write','cos-a',put);
    assert.equal(f.ledger.read(tx=>tx.get('notices',row.id)).sha256,row.sha256);
    assert.deepEqual(exec.trace,['BEGIN IMMEDIATE','COMMIT','BEGIN','COMMIT']);
    assert.throws(()=>f.ledger.write('ordinary.async','cos-a',async()=>{}),/asynchronous work/);
  }finally{exec.restore();f.close();}
});
