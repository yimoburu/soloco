import {preexistingLegacyStore} from './preexisting-legacy-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {readNormalized} from '../plugins/soloco/runtime/record-storage.mjs';

const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-normalized-read-')));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));

function fixture() {
  const root=fs.mkdtempSync(path.join(temporary,'company-'));
  const reader=preexistingLegacyStore(root,'fixture.seed',()=>({
    id:'fictional-read-atomicity',commit_marker:'before',owner:{epoch:1},
    records:{evidence:{id:'evidence',revision:1,content:'before'}},
    jobs:{work:{id:'work',epoch:1,status:'queued'}},
    notices:[{id:'notice',summary:'before',resolution:null}],
  }));
  reader.migrate();
  const writer=new Store(root);
  return {reader,writer,close(){writer.close();reader.close();}};
}

// The first query obtains root metadata and collection shapes. Commit a real
// second-connection WAL write after those rows return, before the later entity
// queries run. No timing or threads are needed to reproduce the read boundary.
function commitBetweenQueries(reader,writer) {
  const original=reader.db.prepare;
  let commits=0;
  reader.db.prepare=function(sql,...options) {
    const statement=Reflect.apply(original,this,[sql,...options]);
    if(!sql.startsWith('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values')||!sql.includes("e.family='root'"))return statement;
    return new Proxy(statement,{get(target,key) {
      const value=Reflect.get(target,key,target);
      if(key!=='all')return typeof value==='function'?value.bind(target):value;
      return (...parameters)=>{
        const rows=Reflect.apply(value,target,parameters);
        if(!commits) {
          writer.transaction('fixture.concurrent_commit',state=>{
            state.commit_marker='after';state.owner.epoch=2;
            state.records.evidence={id:'evidence',revision:2,content:'after'};
            state.jobs.work={id:'work',epoch:2,status:'completed'};
            state.notices[0].summary='after';
            return state;
          });
          commits++;
        }
        return rows;
      };
    }});
  };
  return {restore(){reader.db.prepare=original;},commits:()=>commits};
}

test('interception fixture exposes torn normalized reads without a caller snapshot',()=>{
  const f=fixture(),interception=commitBetweenQueries(f.reader,f.writer);
  try {
    const torn=readNormalized(f.reader.db);
    assert.equal(interception.commits(),1);
    assert.equal(torn.commit_marker,'before');assert.equal(torn.owner.epoch,1);
    assert.equal(torn.records.evidence.content,'after');assert.equal(torn.jobs.work.epoch,2);
    assert.equal(torn.notices[0].summary,'after');
  } finally {interception.restore();f.close();}
});

test('Store.read observes one snapshot across normalized root and entity queries',()=>{
  const f=fixture(),before=f.reader.read(),interception=commitBetweenQueries(f.reader,f.writer);
  try {
    assert.deepEqual(f.reader.read(),before);
    assert.equal(interception.commits(),1);
    interception.restore();
    const after=f.reader.read();
    assert.equal(after.commit_marker,'after');assert.equal(after.owner.epoch,2);
    assert.equal(after.records.evidence.content,'after');assert.equal(after.jobs.work.epoch,2);
    assert.equal(after.notices[0].summary,'after');
  } finally {interception.restore();f.close();}
});

test('Store.readSelected snapshots exact entity lookups and collection scans together',()=>{
  const f=fixture();
  const selection={rootKeys:['commit_marker','owner'],entities:{records:['evidence'],jobs:null,notices:null}};
  const before=f.reader.readSelected(selection),interception=commitBetweenQueries(f.reader,f.writer);
  try {
    assert.deepEqual(f.reader.readSelected(selection),before);
    assert.equal(interception.commits(),1);
    interception.restore();
    const after=f.reader.readSelected(selection);
    assert.equal(after.commit_marker,'after');assert.equal(after.owner.epoch,2);
    assert.equal(after.records.evidence.content,'after');assert.equal(after.jobs.work.epoch,2);
    assert.equal(after.notices[0].summary,'after');
  } finally {interception.restore();f.close();}
});

test('normalized reads inside writer transactions reuse the transaction and recover after rollback',()=>{
  const f=fixture();
  try {
    f.reader.transaction('fixture.full_transaction',state=>{
      assert.equal(f.reader.read().commit_marker,state.commit_marker);
      assert.equal(f.reader.readSelected({rootKeys:['owner'],entities:{records:['evidence']}}).records.evidence.content,'before');
      state.commit_marker='committed';return state;
    });
    assert.throws(()=>f.reader.transaction('fixture.interrupted',()=>{
      assert.equal(f.reader.read().commit_marker,'committed');throw Error('fictional interruption');
    }),/fictional interruption/);
    f.writer.transaction('fixture.after_rollback',state=>{state.commit_marker='after rollback';return state;});
    assert.equal(f.reader.read().commit_marker,'after rollback');
    f.reader.selectedTransaction('fixture.selected_transaction',{rootKeys:['revision','owner','commit_marker'],entities:{records:['evidence']}},state=>{
      assert.equal(f.reader.read().commit_marker,'after rollback');
      state.commit_marker='selected committed';return state;
    });
    assert.equal(f.reader.read().commit_marker,'selected committed');
  } finally {f.close();}
});

test('Store.readRawValue checks collection shape and current immutable pointer in one read snapshot',()=>{
  const f=fixture(),prepare=f.reader.db.prepare,before=f.reader.readRawValue({family:'records',key:'evidence'});let commits=0;
  f.reader.db.prepare=function(sql,...rest){
    const statement=Reflect.apply(prepare,this,[sql,...rest]);
    if(!sql.includes("WHERE family='shape'"))return statement;
    return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(key!=='get')return typeof value==='function'?value.bind(target):value;return (...args)=>{
      const row=Reflect.apply(value,target,args);
      if(!commits++){f.writer.transaction('raw concurrent commit',s=>{s.records.evidence={id:'evidence',revision:2,content:'after'};return s;});}
      return row;
    };}});
  };
  try{assert.deepEqual(f.reader.readRawValue({family:'records',key:'evidence'}),before);assert.equal(commits,1);}
  finally{f.reader.db.prepare=prepare;}
  assert.equal(f.reader.readRawValue({family:'records',key:'evidence'}).revision,2);f.close();
});
