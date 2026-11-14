// SOURCE-only real Store/SQLite constructors over fictional temporary records.
// These tests select no company, Native issuer, model or external provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store,originalStoreExecutionCustodyFrom} from '../plugins/soloco/runtime/store.mjs';

const code=expected=>error=>error?.code===expected;
function fixture(t){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SOURCE-store-custody-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=new Store(root,true);
  try{
    store.transaction('company.created',()=>({id:'fictional-store-custody',name:'Original',idea:'Source constructor fixture',phase:'Frame',mode:'preparation',owner:{host:'codex',session_id:'fictional-source-founder',epoch:1},paused:true,governance:'Fictional rules',cos_instructions:'Fictional instructions',roles:{},records:{},jobs:{},sessions:{},notices:[],messages:[],upgrade_history:[]}));
    store.migrate();
  }finally{store.close();}
  return {root,file:path.join(root,'.company','company.sqlite')};
}
function custody(store,db){
  return store.readSnapshot(()=>{
    const fromStore=originalStoreExecutionCustodyFrom(store),fromDb=originalStoreExecutionCustodyFrom(db);
    assert.strictEqual(fromStore.store,store);assert.strictEqual(fromDb.store,store);
    assert.strictEqual(fromStore.db,db);assert.strictEqual(fromDb.db,db);
    assert.strictEqual(fromStore.scope,fromDb.scope);fromStore.assert();fromDb.assert();
    return fromStore;
  });
}

test('attachment reserves custody before its guard can synchronously construct a second wrapper',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file);let store,nested,attempted=false,nestedGuardCalls=0;
  try{
    store=new Store(f.root,false,{connection:db,connectionGuard:()=>{
      if(attempted)return;attempted=true;
      assert.throws(()=>{nested=new Store(f.root,false,{connection:db,connectionGuard:()=>{nestedGuardCalls++;}});},code('STORE_CONNECTION_INPUT'));
    }});
    assert.equal(attempted,true);assert.equal(nestedGuardCalls,0);assert.equal(nested,undefined);
    custody(store,db);assert.equal(store.read().name,'Original');
  }finally{nested?.close();store?.close();db.close();}
});

test('attachment reserves custody before an original connection method can reenter its constructor',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file),exec=db.exec;let store,nested,attempted=false,nestedGuardCalls=0;
  // Controlled reentrancy on an actual native connection, not a fake DB/Store.
  db.exec=function(sql){
    if(!attempted){
      attempted=true;
      assert.throws(()=>{nested=new Store(f.root,false,{connection:db,connectionGuard:()=>{nestedGuardCalls++;}});},code('STORE_CONNECTION_INPUT'));
    }
    return Reflect.apply(exec,this,[sql]);
  };
  try{
    store=new Store(f.root,false,{connection:db,connectionGuard:()=>{}});
    assert.equal(attempted,true);assert.equal(nestedGuardCalls,0);assert.equal(nested,undefined);
    custody(store,db);assert.equal(store.read().name,'Original');
  }finally{db.exec=exec;nested?.close();store?.close();db.close();}
});

test('duplicate rejection preserves the live owner and close permits reattachment without reviving old loans',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file);let first,second,rejected,duplicateGuardCalls=0;
  try{
    first=new Store(f.root,false,{connection:db,connectionGuard:()=>{}});
    const oldLoan=custody(first,db);
    assert.throws(()=>{rejected=new Store(f.root,false,{connection:db,connectionGuard:()=>{duplicateGuardCalls++;}});},code('STORE_CONNECTION_INPUT'));
    assert.equal(duplicateGuardCalls,0);assert.equal(rejected,undefined);custody(first,db);
    first.close();assert.equal(db.prepare('SELECT 1 AS value').get().value,1);
    second=new Store(f.root,false,{connection:db,connectionGuard:()=>{}});
    second.readSnapshot(()=>{
      assert.strictEqual(originalStoreExecutionCustodyFrom(db).store,second);
      assert.strictEqual(originalStoreExecutionCustodyFrom(second).store,second);
      assert.throws(()=>oldLoan.assert(),code('STORE_CONNECTION_EXPIRED'));
      assert.throws(()=>originalStoreExecutionCustodyFrom(first),code('STORE_CONNECTION_EXPIRED'));
    });
    assert.equal(second.read().name,'Original');
  }finally{rejected?.close();second?.close();first?.close();db.close();}
});

test('failed guard or connection callback releases only its reservation and allows a clean reattachment',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file),exec=db.exec;let store;
  try{
    for(const phase of ['guard','connection']){
      const failure=Object.assign(Error('SYNTHETIC construction failure: '+phase),{code:'SYNTHETIC_CONSTRUCTOR_FAILURE'});
      if(phase==='connection')db.exec=function(){throw failure;};
      try{
        assert.throws(()=>new Store(f.root,false,{connection:db,connectionGuard:()=>{if(phase==='guard')throw failure;}}),error=>error===failure);
      }finally{db.exec=exec;}
      assert.equal(db.isTransaction,false);assert.equal(db.prepare('SELECT 1 AS value').get().value,1);
      assert.throws(()=>originalStoreExecutionCustodyFrom(db),code('ORIGINAL_EXECUTION_STORE_REQUIRED'));
      store=new Store(f.root,false,{connection:db,connectionGuard:()=>{}});
      custody(store,db);assert.equal(store.read().name,'Original');store.close();store=undefined;
    }
  }finally{db.exec=exec;store?.close();db.close();}
});
