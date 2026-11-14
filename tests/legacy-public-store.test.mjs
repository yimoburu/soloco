// SOURCE plumbing over fictional temporary SQLite only. No owning-chat,
// configuration, native/provider/model or actual company operation is selected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {withLegacyPublicStore,withPeerPublicStorage} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {publicReaderFor} from '../plugins/soloco/runtime/state-projections.mjs';

const code=expected=>error=>error?.code===expected;
function temp(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SOURCE-legacy-store-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
const seed=()=>({id:'fictional-SOURCE',name:'Original',idea:'Original source only',phase:'Frame',mode:'preparation',owner:{host:'codex',session_id:'source-founder',epoch:7},paused:true,governance:'Fictional rules',cos_instructions:'Fictional instructions',roles:{qa:{}},records:{},jobs:{},sessions:{},notices:[],messages:[],upgrade_history:[]});
function fixture(t,{normalized=true}={}){
  const root=temp(t),store=new Store(root,true);
  try{store.transaction('company.created',()=>seed());if(normalized)store.migrate();}finally{store.close();}
  return {root,file:path.join(root,'.company','company.sqlite')};
}
function sql(file){const db=new DatabaseSync(file,{readOnly:true});try{
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  return JSON.stringify({schema,rows:schema.filter(r=>r.type==='table').map(r=>({name:r.name,rows:db.prepare('SELECT * FROM "'+r.name.replaceAll('"','""')+'" ORDER BY rowid').all()}))});
}finally{db.close();}}

test('actual layout4 writer uses one original connection and awaits exactly one callback before lifetime revocation',async t=>{
  const f=fixture(t);let calls=0,held,connection;
  const result=await withLegacyPublicStore(f.root,async store=>{
    calls++;held=store;connection=store.db;assert.equal(Object.getPrototypeOf(store),Store.prototype);
    assert.equal(store.storageInfo().format,'normalized-v4');assert.equal(store.read().name,'Original');
    await Promise.resolve();assert.strictEqual(store.db,connection);
    store.transaction('SOURCE.actual-write',state=>{state.name='Written through original Store';return state;});
    return {written:true,epoch:store.read().owner.epoch};
  });
  assert.deepEqual(result,{written:true,epoch:7});assert.equal(calls,1);
  assert.throws(()=>held.read(),code('STORE_CONNECTION_EXPIRED'));
  assert.throws(()=>held.transaction('SOURCE.late',s=>s),code('STORE_CONNECTION_EXPIRED'));
  assert.throws(()=>connection.prepare('SELECT 1').get(),/not open|closed/i);
  const reopened=new Store(f.root);try{assert.equal(reopened.read().name,'Written through original Store');}finally{reopened.close();}
});

test('direct Store attachment validates original path/layout and leaves external connection lifetime with its owner',t=>{
  const f=fixture(t),other=fixture(t),db=new DatabaseSync(f.file),wrong=new DatabaseSync(other.file),memory=new DatabaseSync(':memory:');
  let guards=0;
  try{
    const before=sql(f.file),store=new Store(f.root,false,{connection:db,connectionGuard:()=>{guards++;}});
    assert.strictEqual(store.db,db);assert.equal(store.read().name,'Original');store.close();
    assert.equal(db.prepare('SELECT 1 AS value').get().value,1);
    assert.throws(()=>store.changeToken(),code('STORE_CONNECTION_EXPIRED'));
    assert.equal(sql(f.file),before);assert.ok(guards>0);
    for(const connection of [wrong,memory])assert.throws(()=>new Store(f.root,false,{connection,connectionGuard:()=>{}}),code('STORE_CONNECTION_PATH'));
    assert.throws(()=>new Store(f.root,true,{connection:db,connectionGuard:()=>{}}),code('STORE_CONNECTION_INPUT'));
    assert.throws(()=>new Store(f.root,false,{connection:{prepare:()=>db.prepare('SELECT 1')},connectionGuard:()=>{}}),code('STORE_CONNECTION_INPUT'));
    assert.throws(()=>new Store(f.root,false,{connection:Object.create(DatabaseSync.prototype),connectionGuard:()=>{}}));
    assert.equal(wrong.prepare('SELECT 1 AS value').get().value,1);
    assert.equal(memory.prepare('SELECT 1 AS value').get().value,1);
  }finally{db.close();wrong.close();memory.close();}
});

test('attached source guard rejects accessors, async guards and returned values without closing the external DB',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file);let getters=0;
  try{
    const accessor={connection:db};Object.defineProperty(accessor,'connectionGuard',{enumerable:true,get(){getters++;return ()=>{};}});
    assert.throws(()=>new Store(f.root,false,accessor),code('STORE_CONNECTION_INPUT'));assert.equal(getters,0);
    for(const connectionGuard of [async()=>{},()=>true,()=>Promise.reject(Error('SYNTHETIC late guard failure'))])
      assert.throws(()=>new Store(f.root,false,{connection:db,connectionGuard}),code('STORE_CONNECTION_GUARD'));
    assert.equal(db.prepare('SELECT 1 AS value').get().value,1);
  }finally{db.close();}
});

test('non-layout4 and peer sources never enter the legacy writer; existing public writable-legacy rejection remains',async t=>{
  const old=fixture(t,{normalized:false}),before=sql(old.file);let calls=0;
  await assert.rejects(withLegacyPublicStore(old.root,()=>calls++),code('OWNER_LEGACY_LAYOUT4_REQUIRED'));
  assert.equal(calls,0);assert.equal(sql(old.file),before);
  const legacy=fixture(t);
  await assert.rejects(withPeerPublicStorage(legacy.root,false,()=>calls++),code('OWNER_LEGACY_READONLY_REQUIRED'));
  const peer=peerFixture();const peerRoot=peer.ledger.root,peerFile=peer.ledger.file;peer.ledger.close();t.after(()=>fs.rmSync(peerRoot,{recursive:true,force:true}));
  const peerBefore=sql(peerFile);
  await assert.rejects(withLegacyPublicStore(peerRoot,()=>calls++),code('OWNER_LEGACY_LAYOUT4_REQUIRED'));
  const db=new DatabaseSync(peerFile);try{assert.throws(()=>new Store(peerRoot,false,{connection:db,connectionGuard:()=>{}}));assert.equal(db.prepare('SELECT 1 AS value').get().value,1);}finally{db.close();}
  assert.equal(calls,0);assert.equal(sql(peerFile),peerBefore);
});

test('ordinary two-argument Stores still create, write, migrate, close and reopen independently',t=>{
  const f=fixture(t,{normalized:false});let store=new Store(f.root);
  assert.equal(store.storageInfo().format,'legacy-json');store.transaction('SOURCE.ordinary',s=>{s.name='Ordinary';return s;});
  assert.equal(store.migrate().format,'normalized-v4');const db=store.db;store.close();
  assert.throws(()=>db.prepare('SELECT 1').get(),/not open|closed/i);
  store=new Store(f.root);try{assert.equal(store.read().name,'Ordinary');assert.equal(store.storageInfo().format,'normalized-v4');}finally{store.close();}
});

test('every attached mutator is fenced or refused, with the private fence last after caller precommit',t=>{
  const f=fixture(t),db=new DatabaseSync(f.file),before=sql(f.file),sentinel=Error('SYNTHETIC final storage guard');let last=false,guards=0;
  const store=new Store(f.root,false,{connection:db,connectionGuard:()=>{guards++;if(last)throw sentinel;}});
  try{
    for(const method of ['transaction','selectedTransaction']){
      let caller=0;last=false;
      const fn=state=>{state.name='MUST ROLLBACK';return state;},options={beforeCommit(){caller++;last=true;}};
      assert.throws(()=>method==='transaction'?store.transaction('SOURCE.fenced',fn,options):store.selectedTransaction('SOURCE.fenced',{rootKeys:['name','revision','owner'],entities:{}},fn,options),error=>error===sentinel);
      assert.equal(caller,1);last=false;assert.equal(db.isTransaction,false);assert.equal(sql(f.file),before);
    }
    assert.throws(()=>store.migrate(),code('STORE_ATTACHED_OPERATION_UNSUPPORTED'));
    assert.throws(()=>store.appendUpgradeCall('not-selected',{}),code('STORE_ATTACHED_OPERATION_UNSUPPORTED'));
    last=true;assert.throws(()=>store.readSnapshot(()=>{throw Error('unreachable');}),error=>error===sentinel);
    assert.ok(guards>0);assert.equal(sql(f.file),before);
  }finally{store.close();db.close();}
});

test('provider Error/AggregateError identity survives Store rollback and one awaited callback without operation retry',async t=>{
  const f=fixture(t),before=sql(f.file);
  for(const sentinel of [Error('SYNTHETIC provider EIO'),new AggregateError([Error('member')],'SYNTHETIC provider group',{cause:Error('cause')})]){
    let calls=0;
    await assert.rejects(withLegacyPublicStore(f.root,async store=>{calls++;await Promise.resolve();store.transaction('SOURCE.provider-error',state=>{state.name='MUST ROLLBACK';throw sentinel;});}),error=>error===sentinel);
    assert.equal(calls,1);assert.equal(sql(f.file),before);
  }
});

test('uncommitted SQL at callback return is rejected and rolled back before closing the original connection',async t=>{
  const f=fixture(t),before=sql(f.file);let held,calls=0;
  await assert.rejects(withLegacyPublicStore(f.root,store=>{calls++;held=store;store.db.exec('BEGIN IMMEDIATE');store.db.prepare("INSERT INTO events(at,type,value) VALUES('SOURCE','SOURCE.uncommitted','{}')").run();return 'not complete';}),code('OWNER_STORAGE_TRANSACTION_OPEN'));
  assert.equal(calls,1);assert.equal(sql(f.file),before);assert.throws(()=>held.read(),code('STORE_CONNECTION_EXPIRED'));
});

test('actual path replacement during caller precommit is caught before COMMIT and all row/event changes roll back',async t=>{
  const f=fixture(t),before=sql(f.file),directory=path.dirname(f.file),held=path.join(directory,'original-held.sqlite'),replacement=path.join(directory,'replacement.sqlite');
  fs.copyFileSync(f.file,replacement);let swapped=false,calls=0,precommit=0;
  try{
    await assert.rejects(withLegacyPublicStore(f.root,store=>{calls++;return store.transaction('SOURCE.path-race',state=>{state.name='MUST ROLLBACK';return state;},{beforeCommit(){precommit++;fs.renameSync(f.file,held);fs.renameSync(replacement,f.file);swapped=true;}});}),code('OWNER_STORAGE_CHANGED'));
  }finally{if(swapped){fs.renameSync(f.file,replacement);fs.renameSync(held,f.file);}fs.rmSync(replacement,{force:true});}
  assert.equal(calls,1);assert.equal(precommit,1);assert.equal(sql(f.file),before);
});

test('a hardlink introduced after the callback starts stays a fatal storage Hold and never commits',async t=>{
  const f=fixture(t),before=sql(f.file),link=path.join(f.root,'hardlink.sqlite');let precommit=0;
  try{await assert.rejects(withLegacyPublicStore(f.root,store=>store.transaction('SOURCE.link-race',s=>{s.name='MUST ROLLBACK';return s;},{beforeCommit(){precommit++;fs.linkSync(f.file,link);}})),code('OWNER_STORAGE_LINK'));}
  finally{fs.rmSync(link,{force:true});}
  assert.equal(precommit,1);assert.equal(sql(f.file),before);
});

test('A/B-open-and-restore cannot pass the original descriptor/version fence or reach a Store callback',async t=>{
  const a=fixture(t),b=fixture(t),before=sql(a.file),otherBefore=sql(b.file),held=a.file+'.held',other=a.file+'.replacement';
  fs.copyFileSync(b.file,other);const lstat=fs.lstatSync,rename=fs.renameSync;let attacked=0,swapped=false,calls=0;
  const restore=()=>{if(swapped){rename(a.file,other);rename(held,a.file);swapped=false;}};
  fs.lstatSync=function(file,...args){
    if(swapped&&file===a.root)restore();const result=Reflect.apply(lstat,this,[file,...args]),stack=Error().stack;
    if(!attacked&&file===a.file&&stack.includes('at withLegacyPublicStore (')&&!stack.includes('at storagePreflight (')&&!stack.includes('at pinned (')&&!stack.includes('at location (')){rename(a.file,held);rename(other,a.file);swapped=true;attacked++;}
    return result;
  };
  try{await assert.rejects(withLegacyPublicStore(a.root,()=>calls++),code('OWNER_STORAGE_CHANGED'));}
  finally{fs.lstatSync=lstat;restore();fs.rmSync(other,{force:true});}
  assert.equal(attacked,1);assert.equal(calls,0);assert.equal(sql(a.file),before);assert.equal(sql(b.file),otherBefore);
});

test('substituting another real DB after a transaction callback cannot stage into it or escape original rollback',t=>{
  const a=fixture(t),b=fixture(t),db=new DatabaseSync(a.file),other=new DatabaseSync(b.file),before=sql(a.file),otherBefore=sql(b.file);
  const store=new Store(a.root,false,{connection:db,connectionGuard:()=>{}});
  try{
    assert.throws(()=>store.transaction('SOURCE.connection-swap',s=>{s.name='MUST NOT STAGE';store.db=other;return s;}),code('STORE_CONNECTION_CHANGED'));
    assert.equal(db.isTransaction,false);assert.equal(sql(a.file),before);assert.equal(sql(b.file),otherBefore);
  }finally{store.close();db.close();other.close();}
});

test('a rollback provider failure retains both original errors and cleanup still rolls back the same original connection',async t=>{
  const f=fixture(t),before=sql(f.file),original=Error('SYNTHETIC original provider failure'),rollback=Error('SYNTHETIC first rollback failure'),exec=DatabaseSync.prototype.exec;
  let connection,rollbacks=0,calls=0;
  DatabaseSync.prototype.exec=function(sql,...args){if(this===connection&&sql==='ROLLBACK'&&++rollbacks===1)throw rollback;return Reflect.apply(exec,this,[sql,...args]);};
  try{
    await assert.rejects(withLegacyPublicStore(f.root,store=>{calls++;connection=store.db;return store.transaction('SOURCE.cleanup-error',s=>{s.name='MUST ROLLBACK';return s;},{beforeCommit(){throw original;}});}),error=>error instanceof AggregateError&&error.cause===original&&error.errors[0]===original&&error.errors[1]===rollback);
  }finally{DatabaseSync.prototype.exec=exec;}
  assert.equal(calls,1);assert.equal(rollbacks,2);assert.equal(sql(f.file),before);
});

test('whole-company-directory A/B open/restore is held even when the original main inode is unchanged',async t=>{
  const a=fixture(t),b=fixture(t),directory=path.dirname(a.file),held=path.join(a.root,'original-company-held'),other=path.join(a.root,'replacement-company');
  fs.cpSync(path.dirname(b.file),other,{recursive:true});const before=sql(a.file),lstat=fs.lstatSync,rename=fs.renameSync;
  let attacked=0,swapped=false,calls=0;
  const restore=()=>{if(swapped){rename(directory,other);rename(held,directory);swapped=false;}};
  fs.lstatSync=function(file,...args){
    if(swapped&&file===a.root)restore();const result=Reflect.apply(lstat,this,[file,...args]),stack=Error().stack;
    if(!attacked&&file===a.file&&stack.includes('at withLegacyPublicStore (')&&!stack.includes('at storagePreflight (')&&!stack.includes('at pinned (')&&!stack.includes('at location (')){rename(directory,held);rename(other,directory);swapped=true;attacked++;}
    return result;
  };
  try{await assert.rejects(withLegacyPublicStore(a.root,()=>calls++),code('OWNER_STORAGE_CHANGED'));}
  finally{fs.lstatSync=lstat;restore();fs.rmSync(other,{recursive:true,force:true});}
  assert.equal(attacked,1);assert.equal(calls,0);assert.equal(sql(a.file),before);
});

test('premature COMMIT or ROLLBACK at each trusted callback boundary cannot make an attached Store continue in autocommit',async t=>{
  for(const method of ['transaction','selectedTransaction'])for(const phase of ['callback','afterWrite','beforeCommit'])for(const end of ['COMMIT','ROLLBACK']){
    const f=fixture(t),before=sql(f.file);let hit=0;
    await assert.rejects(withLegacyPublicStore(f.root,store=>{
      const stop=()=>{hit++;store.db.exec(end);},fn=state=>{state.name='Trusted callback already committed this only when explicitly noted';if(phase==='callback')stop();return state;};
      const options=phase==='callback'?{}:{[phase]:stop};
      return method==='transaction'?store.transaction('SOURCE.premature-end',fn,options):store.selectedTransaction('SOURCE.premature-end',{rootKeys:['name','owner','revision'],entities:{}},fn,options);
    }),code('STORE_CONNECTION_TRANSACTION'),`${method}/${phase}/${end}`);
    assert.equal(hit,1);
    if(end==='ROLLBACK'||phase==='callback')assert.equal(sql(f.file),before,'No later Store write may escape into autocommit');
    else{
      // SOURCE callbacks are trusted code. The fence cannot undo arbitrary raw
      // SQL they already committed; the operation must still Hold, not succeed.
      const store=new Store(f.root);try{
        assert.equal(store.read().name,'Trusted callback already committed this only when explicitly noted');
        const events=store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='SOURCE.premature-end'").get().n;
        assert.equal(events,phase==='beforeCommit'?1:0,'No event may be appended after an afterWrite callback already committed');
      }finally{store.close();}
    }
  }
});

test('a native readonly connection is refused before any trusted write callback, retaining external ownership',t=>{
  const f=fixture(t),before=sql(f.file),db=new DatabaseSync(f.file,{readOnly:true});let store,calls=0,failure;
  try{
    try{store=new Store(f.root,false,{connection:db,connectionGuard:()=>{}});store.transaction('SOURCE.readonly',state=>{calls++;return state;});}
    catch(error){failure=error;}
    assert.ok(failure);assert.equal(calls,0);assert.equal(db.isTransaction,false);
    assert.equal(db.prepare('SELECT 1 AS n').get().n,1);
  }finally{store?.close();db.close();}
  assert.equal(sql(f.file),before);
});

test('the actual writable-main probe changes no SQLite rows/schema/events and leaves no transaction behind',t=>{
  const f=fixture(t),before=sql(f.file),db=new DatabaseSync(f.file),exec=DatabaseSync.prototype.exec;let probes=0;
  const changes=db.prepare('SELECT total_changes() AS n').get().n;
  DatabaseSync.prototype.exec=function(sql,...args){if(this===db&&sql==='UPDATE main.company_layout SET version=version WHERE 0;')probes++;return Reflect.apply(exec,this,[sql,...args]);};
  let store;
  try{store=new Store(f.root,false,{connection:db,connectionGuard:()=>{}});assert.equal(probes,1);assert.equal(db.isTransaction,false);assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);assert.equal(sql(f.file),before);}
  finally{DatabaseSync.prototype.exec=exec;store?.close();db.close();}
});

test('writability probe provider errors retain identity and failed cleanup keeps both errors while ending its own transaction',t=>{
  const f=fixture(t),before=sql(f.file),exec=DatabaseSync.prototype.exec;
  for(const original of [Error('SYNTHETIC writability EIO'),new AggregateError([Error('member')],'SYNTHETIC writability group',{cause:Error('cause')})])for(const failCleanup of [false,true]){
    const db=new DatabaseSync(f.file),cleanup=Error('SYNTHETIC savepoint rollback EIO');let probes=0,rollbacks=0;
    DatabaseSync.prototype.exec=function(sql,...args){
      if(this===db&&sql==='UPDATE main.company_layout SET version=version WHERE 0;'){probes++;throw original;}
      if(this===db&&sql==='ROLLBACK TO SAVEPOINT soloco_attached_writability;'){rollbacks++;if(failCleanup)throw cleanup;}
      return Reflect.apply(exec,this,[sql,...args]);
    };
    try{
      assert.throws(()=>new Store(f.root,false,{connection:db,connectionGuard:()=>{}}),error=>failCleanup?error instanceof AggregateError&&error.cause===original&&error.errors[0]===original&&error.errors[1]===cleanup:error===original);
      assert.equal(probes,1);assert.equal(rollbacks,1);assert.equal(db.isTransaction,false);assert.equal(db.prepare('SELECT 1 AS n').get().n,1);
    }finally{DatabaseSync.prototype.exec=exec;db.close();}
    assert.equal(sql(f.file),before);
  }
});

test('escaped cached public reader callbacks are revoked before SQL or cache access after Store.close',t=>{
  const f=fixture(t),ordinary=new Store(f.root);ordinary.transaction('SOURCE.cached-record',state=>{state.records.r={id:'r',kind:'note',content:'Fictional cached body'};return state;});ordinary.close();
  const db=new DatabaseSync(f.file),store=new Store(f.root,false,{connection:db,connectionGuard:()=>{}}),state=store.readSnapshot(()=>store.publicState()),reader=publicReaderFor(state);
  assert.ok(reader);assert.equal(store.readSnapshot(()=>reader.rows('records',0,1))[0].value.content,'Fictional cached body');
  assert.ok(reader.info('records'));store.close();
  const prepare=DatabaseSync.prototype.prepare;let sqlCalls=0;
  DatabaseSync.prototype.prepare=function(...args){if(this===db)sqlCalls++;return Reflect.apply(prepare,this,args);};
  try{
    assert.throws(()=>reader.rows('records',0,1),code('STORE_CONNECTION_EXPIRED'));
    assert.throws(()=>reader.info('records'),code('STORE_CONNECTION_EXPIRED'));
    assert.equal(sqlCalls,0,'Revocation precedes native reads as well as warmed-cache access');
  }finally{DatabaseSync.prototype.prepare=prepare;db.close();}
});

test('readonly preflight preserves provider failure and attempts every DB/FD cleanup even when closing also fails',async t=>{
  const scenarios=[
    {primary:Object.assign(Error('SYNTHETIC preflight EIO'),{code:'EIO'}),dbFailure:false,fdFailure:false},
    {primary:new AggregateError([Error('member')],'SYNTHETIC preflight provider group',{cause:Error('provider cause')}),dbFailure:false,fdFailure:false},
    {primary:Object.assign(Error('SYNTHETIC preflight EIO'),{code:'EIO'}),dbFailure:true,fdFailure:false},
    {primary:new AggregateError([Error('member')],'SYNTHETIC preflight provider group',{cause:Error('provider cause')}),dbFailure:true,fdFailure:false},
    {primary:Object.assign(Error('SYNTHETIC preflight EIO'),{code:'EIO'}),dbFailure:true,fdFailure:true},
    {primary:null,dbFailure:true,fdFailure:false},
    {primary:null,dbFailure:true,fdFailure:true}
  ];
  for(const scenario of scenarios){
    const f=fixture(t),before=sql(f.file),selected=new Set([f.root,path.dirname(f.file),f.file]),acquired=[],attempted=[];
    const prepare=DatabaseSync.prototype.prepare,closeDb=DatabaseSync.prototype.close,openFd=fs.openSync,closeFd=fs.closeSync;
    const dbError=Object.assign(Error('SYNTHETIC preflight DB close EIO'),{code:'EIO'}),fdError=Object.assign(Error('SYNTHETIC preflight FD close EIO'),{code:'EIO'});
    let originalDb,preflightCalls=0,dbCloses=0,fdFailures=0,callbacks=0;
    DatabaseSync.prototype.prepare=function(query,...args){
      if(query==='PRAGMA database_list'){
        preflightCalls++;originalDb=this;
        if(scenario.primary)throw scenario.primary;
      }
      return Reflect.apply(prepare,this,[query,...args]);
    };
    DatabaseSync.prototype.close=function(...args){
      const result=Reflect.apply(closeDb,this,args);
      if(this===originalDb){dbCloses++;if(scenario.dbFailure)throw dbError;}
      return result;
    };
    fs.openSync=function(file,...args){const fd=Reflect.apply(openFd,this,[file,...args]);if(selected.has(String(file)))acquired.push(fd);return fd;};
    fs.closeSync=function(fd,...args){
      if(acquired.includes(fd))attempted.push(fd);
      const result=Reflect.apply(closeFd,this,[fd,...args]);
      // Close the actual fixture descriptor before simulating acknowledgement
      // failure. Remaining original descriptors must still receive an attempt.
      if(acquired.includes(fd)&&scenario.fdFailure&&fdFailures++===0)throw fdError;
      return result;
    };
    try{
      await assert.rejects(withLegacyPublicStore(f.root,()=>{callbacks++;}),error=>{
        const cleanup=[...(scenario.dbFailure?[dbError]:[]),...(scenario.fdFailure?[fdError]:[])];
        if(scenario.primary&&cleanup.length){
          assert.ok(error instanceof AggregateError);assert.strictEqual(error.cause,scenario.primary);assert.deepEqual(error.errors,[scenario.primary,...cleanup]);
        }else if(scenario.primary)assert.strictEqual(error,scenario.primary);
        else if(cleanup.length===1)assert.strictEqual(error,cleanup[0]);
        else {assert.ok(error instanceof AggregateError);assert.equal(error.cause,undefined);assert.deepEqual(error.errors,cleanup);}
        return true;
      });
      assert.equal(preflightCalls,1,'No alternate diagnosis or opener is attempted');assert.equal(callbacks,0);assert.equal(dbCloses,1);
      assert.equal(acquired.length,3);assert.deepEqual(attempted,[...acquired].reverse());
      for(const fd of acquired)assert.throws(()=>fs.fstatSync(fd),{code:'EBADF'});
      assert.throws(()=>Reflect.apply(prepare,originalDb,['SELECT 1']),/not open|closed/i);
    }finally{
      DatabaseSync.prototype.prepare=prepare;DatabaseSync.prototype.close=closeDb;fs.openSync=openFd;fs.closeSync=closeFd;
      // Keep a deliberately broken preimage from leaking fixture FDs when an
      // assertion detects that its production finally skipped their cleanup.
      for(const fd of acquired)try{closeFd(fd);}catch(error){if(error.code!=='EBADF')throw error;}
    }
    assert.equal(sql(f.file),before,'Preflight failures may not change SQL rows, schema or events');
  }
});

test('partial pin acquisition retains its original open error and all descriptor-close failures',async t=>{
  for(const grouped of [false,true])for(const failClosing of [false,true]){
    const f=fixture(t),before=sql(f.file),selected=new Set([f.root,path.dirname(f.file)]),acquired=[],attempted=[],cleanup=[];
    const openFd=fs.openSync,closeFd=fs.closeSync,prepare=DatabaseSync.prototype.prepare;
    const original=grouped?new AggregateError([Error('member')],'SYNTHETIC partial-pin provider group',{cause:Error('provider cause')}):Object.assign(Error('SYNTHETIC partial-pin open EIO'),{code:'EIO'});
    let opens=0,sqlCalls=0,callbacks=0;
    fs.openSync=function(file,...args){
      if(String(file)===f.file){opens++;throw original;}
      const fd=Reflect.apply(openFd,this,[file,...args]);if(selected.has(String(file)))acquired.push(fd);return fd;
    };
    fs.closeSync=function(fd,...args){
      if(acquired.includes(fd))attempted.push(fd);
      const result=Reflect.apply(closeFd,this,[fd,...args]);
      if(acquired.includes(fd)&&failClosing){const error=Object.assign(Error('SYNTHETIC partial-pin FD close EIO'),{code:'EIO'});cleanup.push(error);throw error;}
      return result;
    };
    DatabaseSync.prototype.prepare=function(...args){sqlCalls++;return Reflect.apply(prepare,this,args);};
    try{
      await assert.rejects(withLegacyPublicStore(f.root,()=>{callbacks++;}),error=>{
        if(failClosing){assert.ok(error instanceof AggregateError);assert.strictEqual(error.cause,original);assert.equal(cleanup.length,2);assert.deepEqual(error.errors,[original,...cleanup]);}
        else assert.strictEqual(error,original);
        return true;
      });
      assert.equal(opens,1);assert.equal(sqlCalls,0,'No database may open after failed original pin acquisition');assert.equal(callbacks,0);
      assert.equal(acquired.length,2);assert.deepEqual(attempted,[...acquired].reverse());
      for(const fd of acquired)assert.throws(()=>fs.fstatSync(fd),{code:'EBADF'});
    }finally{
      fs.openSync=openFd;fs.closeSync=closeFd;DatabaseSync.prototype.prepare=prepare;
      for(const fd of acquired)try{closeFd(fd);}catch(error){if(error.code!=='EBADF')throw error;}
    }
    assert.equal(sql(f.file),before,'Partial pin failure must preserve SQL rows, schema and events');
  }
});
