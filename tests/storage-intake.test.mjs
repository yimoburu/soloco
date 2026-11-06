import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {readImmutable} from '../plugins/soloco/runtime/record-storage.mjs';
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'storage-intake-')));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
function fixture(normalized=true) {
  const root=fs.mkdtempSync(path.join(temporary,'synthetic-')),store=new Store(root,true);
  store.transaction('seed',()=>({owner:{session_id:'synthetic',epoch:1},records:{a:{id:'a',text:'old'},unrelated:{id:'unrelated',text:'historical '.repeat(1000)}},messages:[{text:'first'},{text:'second'}],upgrade:{id:'u',calls:[{text:'prior native report'}]},unknown:{restriction:'retain this'},['exact\0\ud800']:{unknown:true}}));
  if(normalized)store.migrate();
  return store;
}
const change=store=>store.selectedTransaction('selected',{rootKeys:['revision','owner'],entities:{records:['a']}},s=>{s.records.a.text='new';});
function bodyGuard(store,forbidden) {
  const prepare=store.db.prepare,reads=[];
  store.db.prepare=function(sql,...args) {
    const stmt=Reflect.apply(prepare,this,[sql,...args]);
    if(/\bbytes\b/i.test(sql)&&/^SELECT/i.test(sql)) {
      for(const method of ['get','all']) {
        const original=stmt[method];
        stmt[method]=function(...params) {
          const result=Reflect.apply(original,this,params),rows=method==='all'?result:[result];
          for(const row of rows.filter(Boolean))if(typeof row.bytes==='string') {reads.push(row.bytes);assert.ok(!forbidden.includes(row.bytes),'unrelated historical body hydrated');}
          return result;
        };
      }
    }
    return stmt;
  };
  return ()=>{store.db.prepare=prepare;return reads;};
}

test('read-only baseline, exact full/selected deltas, deletion, reorder, shape and unknown fields',()=>{
  const store=fixture();try {
    const before=store.db.prepare('SELECT total_changes() AS n').get().n;
    const baseline=store.captureIntakeBaseline();
    assert.equal(store.db.prepare('SELECT total_changes() AS n').get().n,before);
    assert.equal(store.readIntake(baseline).events.length,0);
    change(store);
    store.transaction('delete and reorder',s=>{delete s.records.a;s.messages.reverse();s.unknown.extra='unknown survives';s.extra_root={future:true};delete s['exact\0\ud800'];return s;});
    store.transaction('shape change',s=>{s.messages={one:s.messages[0]};return s;});
    const intake=store.readIntake(baseline,{values:true});
    assert.equal(intake.events.length,3);assert.equal(intake.cut.seq,store.changeToken());
    const selected=intake.events[0].changes.find(c=>c.after?.family==='records'&&c.after.key==='a');
    assert.equal(JSON.parse(selected.before.raw).text,'old');assert.equal(JSON.parse(selected.after.raw).text,'new');
    const changes=intake.events[1].changes;
    assert.ok(changes.some(c=>c.before?.family==='records'&&c.before.key==='a'&&c.after===null));
    assert.ok(changes.some(c=>c.before?.key==='exact\0\ud800'&&c.after===null));
    assert.ok(changes.some(c=>c.after?.key==='unknown'&&JSON.parse(c.after.raw).extra==='unknown survives'));
    assert.ok(changes.some(c=>c.after?.key==='extra_root'));
    assert.equal(JSON.parse(changes.find(c=>c.after?.family==='messages'&&c.after.key==='0').after.raw).text,'second');
    assert.ok(intake.events[2].changes.some(c=>c.after?.family==='shape'&&c.after.key==='messages'&&JSON.parse(c.after.raw)==='object'));
    for(const e of store.readIntake(baseline).events)for(const c of e.changes)for(const ref of [c.before,c.after].filter(Boolean))assert.equal(digest(readImmutable(store.db,ref.sha256)),ref.sha256);
    assert.deepEqual(intake.events[0].payload.owner,{session_id:'synthetic',epoch:1});
    assert.equal(intake.events[0].payload.revision,1);
  }finally{store.close();}
});

test('selected writes and upgrade appends never read unrelated/prior journal bodies',()=>{
  const store=fixture();try {
    const unrelated=JSON.stringify(store.read().records.unrelated),prior=JSON.stringify(store.read().upgrade.calls[0]);
    const restore=bodyGuard(store,[unrelated,prior]);
    let baseline;
    try {baseline=store.captureIntakeBaseline();change(store);assert.equal(store.appendUpgradeCall('u',{role:'qa',native_id:'synthetic-native',text:'new native report'}),true);}finally{restore();}
    const intake=store.readIntake(baseline,{values:true}),append=intake.events[1];
    assert.equal(append.type,'upgrade.native_returned');
    assert.ok(append.changes.some(c=>c.after?.family==='upgrade.calls'&&c.after.key==='1'&&JSON.parse(c.after.raw).text==='new native report'));
    assert.equal(JSON.parse(append.changes.find(c=>c.after?.encoding==='journal-array').after.raw).length,2);
  }finally{store.close();}
});

test('gaps, changed event envelopes/payloads, uncovered writers and unlogged state changes hold',()=>{
  for(const damage of ['gap','type','payload','whitespace','uncovered','state','anchor','tail']) {
    const store=fixture();try {
      const baseline=store.captureIntakeBaseline();change(store);change(store);
      if(damage==='gap')store.db.prepare('DELETE FROM events WHERE seq=?').run(baseline.seq+1);
      if(damage==='tail')store.db.prepare('DELETE FROM events WHERE seq=?').run(baseline.seq+2);
      if(damage==='anchor')store.db.prepare("UPDATE events SET type='changed' WHERE seq=?").run(baseline.seq);
      if(damage==='type')store.db.prepare("UPDATE events SET type='changed' WHERE seq=?").run(baseline.seq+1);
      if(damage==='whitespace')store.db.prepare("UPDATE events SET value=value||' ' WHERE seq=?").run(baseline.seq+2);
      if(damage==='payload')store.db.prepare("UPDATE events SET value=json_set(value,'$.revision',999) WHERE seq=?").run(baseline.seq+2);
      if(damage==='uncovered')store.db.prepare("INSERT INTO events(at,type,value) VALUES('now','old writer','{}')").run();
      if(damage==='state')store.db.prepare("UPDATE state_entries SET position=999 WHERE family='records' AND key='a'").run();
      assert.throws(()=>store.readIntake(baseline),/Storage intake hold/,'damage: '+damage);
    }finally{store.close();}
  }
});

test('missing/corrupt old, intermediate, new and unchanged immutable values hold',()=>{
  for(const target of ['old','intermediate','new','unchanged'])for(const damage of ['missing','corrupt']) {
    const store=fixture();try {
      const baseline=store.captureIntakeBaseline(),old=baseline.entries.find(r=>r.family==='records'&&r.key==='a').sha256;
      change(store);const intermediate=store.readRawValue({family:'records',key:'a'}).sha256;
      store.selectedTransaction('next',{rootKeys:['revision'],entities:{records:['a']}},s=>{s.records.a.text='newest';});
      const newest=store.readRawValue({family:'records',key:'a'}).sha256;
      const sha={old,intermediate,new:newest,unchanged:baseline.entries.find(r=>r.key==='unknown').sha256}[target];
      if(damage==='missing'){store.db.exec('PRAGMA foreign_keys=OFF');store.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(sha);}
      else store.db.prepare("UPDATE immutable_values SET bytes='null' WHERE sha256=?").run(sha);
      assert.throws(()=>store.readIntake(baseline),/missing|hash mismatch/);
    }finally{store.close();}
  }
});

test('legacy/changed layout, ambiguous encoding, inexact identities and rollback hold',()=>{
  const legacy=fixture(false);try {assert.throws(()=>legacy.captureIntakeBaseline(),/legacy JSON.*migration/);legacy.transaction('ordinary',s=>s);assert.equal(legacy.storageInfo().format,'legacy-json');}finally{legacy.close();}
  for(const damage of ['layout','schema','index','fence','encoding','key','rollback','baseline']) {
    const store=fixture();try {
      const baseline=store.captureIntakeBaseline();change(store);
      if(damage==='layout')store.db.exec('UPDATE company_layout SET version=3');
      if(damage==='index')store.db.exec('DROP INDEX state_entries_order');
      if(damage==='fence')store.db.exec('DROP TRIGGER fence_legacy_update');
      if(damage==='schema')store.db.exec('ALTER TABLE state_entries ADD COLUMN unexpected TEXT');
      if(damage==='encoding')store.db.exec("UPDATE state_entries SET encoding='unknown' WHERE family='records' AND key='a'");
      if(damage==='key')store.db.exec("UPDATE state_entries SET key='~json:123' WHERE family='records' AND key='a'");
      if(damage==='rollback')store.db.prepare('DELETE FROM events WHERE seq>=?').run(baseline.seq);
      if(damage==='baseline')baseline.entries[0].position=999;
      assert.throws(()=>store.readIntake(baseline),/hold|key encoding/);
    }finally{store.close();}
  }
});

test('failed writes roll back metadata, immutable inserts and event atomically',()=>{
  const store=fixture();try {
    const baseline=store.captureIntakeBaseline(),count=store.db.prepare('SELECT count(*) AS n FROM immutable_values').get().n,prepare=store.db.prepare;
    store.db.prepare=function(sql,...args){if(sql.startsWith('INSERT INTO events'))throw Error('synthetic event failure');return Reflect.apply(prepare,this,[sql,...args]);};
    try {
      assert.throws(()=>change(store),/synthetic event failure/);
      assert.throws(()=>store.transaction('full',s=>{s.unknown={failed:true};return s;}),/synthetic event failure/);
      assert.throws(()=>store.appendUpgradeCall('u',{text:'failed native return'}),/synthetic event failure/);
    }finally{store.db.prepare=prepare;}
    assert.deepEqual(store.captureIntakeBaseline(),baseline);assert.equal(store.readIntake(baseline).events.length,0);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM immutable_values').get().n,count);
    assert.equal(store.db.prepare('SELECT 1 FROM immutable_values WHERE sha256=?').get(digest(JSON.stringify({failed:true}))),undefined);
  }finally{store.close();}
});


test('position-only object reorder and selected deletion produce exact references; historical old events need no replay',()=>{
  const store=fixture();try {
    // Pre-baseline legacy event is retained as historical bytes, without a delta.
    const historical=store.db.prepare('SELECT * FROM events WHERE seq=1').get();
    const baseline=store.captureIntakeBaseline();
    store.transaction('position only',s=>{s.records={unrelated:s.records.unrelated,a:s.records.a};return s;});
    store.selectedTransaction('delete selected',{rootKeys:['revision'],entities:{records:['a']}},s=>{delete s.records.a;});
    const intake=store.readIntake(baseline);
    const moved=intake.events[0].changes.find(c=>c.after?.family==='records'&&c.after.key==='a');
    assert.equal(moved.before.sha256,moved.after.sha256);assert.equal(moved.before.position,0);assert.equal(moved.after.position,1);
    assert.ok(intake.events[1].changes.some(c=>c.before?.family==='records'&&c.before.key==='a'&&c.after===null));
    assert.deepEqual(store.db.prepare('SELECT * FROM events WHERE seq=1').get(),historical);
    assert.equal(JSON.parse(historical.value).storage_delta,undefined);
  }finally{store.close();}
});


test('re-sealed but inconsistent metadata roots and before/after chains hold',()=>{
  for(const damage of ['before','after','identity','duplicate','chain']) {
    const store=fixture();try {
      const baseline=store.captureIntakeBaseline();change(store);
      const event=store.db.prepare('SELECT * FROM events WHERE seq=?').get(baseline.seq+1),payload=JSON.parse(event.value),delta=payload.storage_delta;
      if(damage==='before')delta.before_root='0'.repeat(64);
      if(damage==='after')delta.after_root='0'.repeat(64);
      if(damage==='chain')delta.previous_event_sha256='0'.repeat(64);
      if(damage==='identity')delta.changes.find(c=>c.after?.family==='records').before.position=999;
      if(damage==='duplicate')delta.changes.push(delta.changes[0]);
      delete delta.sha256;delta.sha256=digest(JSON.stringify([event.seq,event.at,event.type,payload]));
      store.db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(payload),event.seq);
      assert.throws(()=>store.readIntake(baseline),/Storage intake hold/);
    }finally{store.close();}
  }
});
