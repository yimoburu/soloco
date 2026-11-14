import {seedPreexistingLegacyData} from './preexisting-legacy-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store,withStore,VERSION,digest} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {currentView,publicPage,publicCatalog,exactRead,PUBLIC_COLLECTIONS} from '../plugins/soloco/runtime/public-response.mjs';
import {readPublicIndex} from '../plugins/soloco/runtime/record-storage.mjs';

const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'indexed-public-')));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'bindings-data');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const now=Date.now(),recent=new Date(now-1000).toISOString(),old='2020-01-01T00:00:00Z';
function seed(n=10,bodySize=1000) {
  const s={schema:2,id:'fictional-index',revision:1,name:'Fixture',idea:'Synthetic only',plugin_version:VERSION,runtime_version:VERSION,phase:'Frame',mode:'preparation',paused:true,owner:{host:'codex',session_id:'founder',epoch:1},governance:'Pinned limits',governance_sha256:'fixture',team_sha256:'fixture',cos_instructions:'Pinned instructions',roles:{engineer:{}},records:{},jobs:{},notices:[],messages:[],sessions:{},upgrade_history:[],context_classifications:{}};
  for(let i=0;i<n;i++) {
    s.records['archive'+i]={id:'archive'+i,revision:1,content:'Archived body '+i+'x'.repeat(i<3?100:bodySize),created_at:old};
    s.jobs['archive'+i]={id:'archive'+i,status:'completed',task:'x'.repeat(bodySize),created_at:old,model_selection:{reason:i%2?'Recorded reason':''},model_evidence:{applied_controls:i%2===0,reported_models:i%3===0?['requested']:[]}};
    s.notices.push({id:'archive'+i,summary:'x'.repeat(bodySize),resolution:{text:'resolved'}});
    s.messages.push({id:'archive'+i,content:'x'.repeat(bodySize),at:old});
    s.sessions['archive'+i]={id:'archive'+i,history:'x'.repeat(bodySize)};
    s.upgrade_history.push({id:'archive'+i,checkpoint:{content:'x'.repeat(bodySize)},created_at:old});
  }
  // The active assignment is deliberately older than every recent completed job.
  s.jobs.active={id:'active',status:'running',started_at:recent,created_at:old};
  s.jobs.uncertain={id:'uncertain',status:'cancelled',created_at:old,coordination:{resources:['held']},coordination_release:{termination_confirmed:false}};
  for(let i=0;i<3;i++) {
    s.records['recent'+i]={id:'recent'+i,revision:1,content:'Recent exact body '+i,created_at:recent};
    s.jobs['recent'+i]={id:'recent'+i,status:'completed',created_at:recent};
    s.notices.push({id:'recent'+i,summary:'Unresolved notice '+i,resolution:null});
    s.messages.push({id:'recent'+i,content:'Recent message '+i,at:recent});
  }
  return s;
}
function fixture(state=seed()) {
  const root=fs.mkdtempSync(path.join(base,'fixture-')),args={root,session_id:'founder'};
  engine.bind(root,'founder','codex');
  withStore(root,db=>{seedPreexistingLegacyData(db,'synthetic.seed',()=>state);db.migrate();},true);
  return args;
}
const inspect=(args,options={})=>engine.contextControl({...args,action:'inspect',...options},'codex');
const read=(args,source,options={})=>engine.contextControl({...args,action:'read',id:source.id,sha256:source.sha256,...options},'codex');

// Count real SQLite results and inspect query plans, in addition to prohibiting
// canonical hydration. A bounded response alone would not detect the old path.
function trace(fn) {
  const prepare=DatabaseSync.prototype.prepare,full=Store.prototype.read;
  const metrics={queries:0,rows:0,bytes:0,plans:[]};
  Store.prototype.read=()=>{throw Error('Unexpected canonical reconstruction');};
  DatabaseSync.prototype.prepare=function(sql,...rest) {
    const statement=prepare.call(this,sql,...rest),db=this;
    if(!/^SELECT/i.test(sql))return statement;
    return new Proxy(statement,{get(target,key) {
      const method=Reflect.get(target,key,target);
      if(!['get','all'].includes(key))return typeof method==='function'?method.bind(target):method;
      return (...parameters)=>{
        const result=method.apply(target,parameters),rows=key==='all'?result:result?[result]:[];
        metrics.queries++;metrics.rows+=rows.length;metrics.bytes+=Buffer.byteLength(JSON.stringify(rows));
        if(/FROM (?:state_entries|public_read_rows)/.test(sql))metrics.plans.push({sql,details:prepare.call(db,'EXPLAIN QUERY PLAN '+sql).all(...parameters).map(r=>r.detail)});
        return result;
      };
    }});
  };
  try {return {result:fn(),metrics};}
  finally {DatabaseSync.prototype.prepare=prepare;Store.prototype.read=full;}
}

test('public current/status/page reads use indexed selections independent of archive count and body volume',async t=>{
  const measurements=[];
  for(const [count,bodySize] of [[10,100],[100,1000],[1000,4000]]) {
    const args=fixture(seed(count,bodySize));
    const token=withStore(args.root,db=>db.changeToken());
    const status=trace(()=>engine.status(args,'codex'));
    const current=trace(()=>engine.current(args,'codex'));
    const page=trace(()=>inspect(args,{collection:'records',offset:count,limit:2}));
    const ref=inspect(args,{collection:'records',limit:1}).items[0].source;
    const exact=trace(()=>read(args,ref,{length:4}));
    const waited=trace(()=>engine.wait({...args,seconds:0},'codex'));
    assert.equal((await waited.result).active_jobs.total,1);
    assert.equal(exact.result.text,'{"id');
    assert.equal(status.result.active_jobs.total,1);assert.equal(status.result.active_jobs.items[0].id,'active');
    assert.equal(status.result.jobs.items.some(j=>j.id==='active'),false);
    assert.equal(status.result.resource_claims.total,1);assert.equal(status.result.resource_claims.jobs.items[0].id,'uncertain');
    assert.equal(status.result.records.total,count+3);assert.equal(status.result.selection_usage.assignments,count+5);
    assert.equal(page.result.offset,count);assert.equal(page.result.returned,2);
    for(const operation of [status,current,page,exact,waited]) {
      for(const plan of operation.metrics.plans) {
        assert.ok(!plan.details.some(d=>/SCAN (?:e|v|state_entries|public_read_rows)\b/.test(d)),JSON.stringify(plan));
        if(plan.sql.includes('FROM public_read_rows'))assert.ok(plan.details.some(d=>/SEARCH .*USING INDEX/.test(d)),JSON.stringify(plan));
      }
      delete operation.metrics.plans;
    }
    assert.equal(withStore(args.root,db=>db.changeToken()),token,'read paths must not write receipts or install indexes');
    measurements.push({count,bodySize,status:status.metrics,current:current.metrics,page:page.metrics,exact:exact.metrics,wait:waited.metrics});
  }
  for(const operation of ['status','current','page','exact','wait']) {
    assert.equal(new Set(measurements.map(m=>m[operation].queries)).size,1,operation+' query count');
    assert.equal(new Set(measurements.map(m=>m[operation].rows)).size,1,operation+' returned SQL rows');
    assert.ok(Math.max(...measurements.map(m=>m[operation].bytes))-Math.min(...measurements.map(m=>m[operation].bytes))<1000,operation+' returned SQL bytes');
  }
  t.diagnostic(JSON.stringify(measurements));
});

test('indexed pages/current retain exact v2 contracts, offsets, cursors, aliases, unsafe keys and unknown source fields',()=>{
  const s=seed(5,40),long='😀'.repeat(300);
  s.records['job:recent0']={id:'record-collision',content:'Raw records retain precedence'};
  for(const key of ['10','2','__proto__','nul\0suffix','lone\ud800',long,'@public:pinned:owner'])Object.defineProperty(s.records,key,{value:{id:key,revision:1,content:'Exact '+key,unknown:{negative:'Keep this'},development:{type:'plan'},prototype:{type:'plan'}},enumerable:true});
  s.context_classifications.source={disposition:'represented',unknown_future_proof:{blocked:true},at:old};
  for(const id of ['unsafe\0upgrade','unsafe\ud800upgrade','long-upgrade-'+long])s.upgrade_history.push({id,content:'Exact alias '+id});
  s.upgrade={id:'current-upgrade',status:'recovered',calls:[{text:'Retained failure'}],unknown:'Keep exact'};
  s.handover={id:'handover',status:'pending',subject:{negative:'Keep exact'}};
  const args=fixture(s),canonical=withStore(args.root,db=>db.read());
  for(const collection of PUBLIC_COLLECTIONS) {
    let cursor;
    do {
      const options={collection,limit:3,...(cursor?{cursor}:{})},expected=publicPage(canonical,options),actual=inspect(args,options);
      assert.deepEqual(actual,expected,collection);
      cursor=actual.next_cursor;
    }while(cursor);
    assert.deepEqual(inspect(args,{collection,offset:1,limit:1}),publicPage(canonical,{collection,offset:1,limit:1}),collection);
  }
  withStore(args.root,db=>db.readSnapshot(()=>assert.deepEqual(currentView(db.publicState(true)),currentView(canonical))));
  for(const key of ['recent0','nul\0suffix','lone\ud800',long,'@public:pinned:owner']) {
    const source={id:'@public:key:records:'+digest(JSON.stringify(key)),sha256:digest(JSON.stringify(canonical.records[key]))};
    assert.deepEqual(read(args,source),exactRead(canonical,source));
    const keySource={id:source.id.replace(':key:',':keyname:'),sha256:digest(JSON.stringify(key))};
    assert.deepEqual(read(args,keySource),exactRead(canonical,keySource));
  }
  for(const id of ['job:recent0','upgrade:archive2','@public:notices:0','@public:messages:0','@public:sessions:archive0','@public:upgrade_history:0']) {
    const value=id==='job:recent0'?canonical.records[id]:id==='upgrade:archive2'?canonical.upgrade_history[2]:id.includes(':notices:')?canonical.notices[0]:id.includes(':messages:')?canonical.messages[0]:id.includes(':sessions:')?canonical.sessions.archive0:canonical.upgrade_history[0];
    const source={id,sha256:digest(JSON.stringify(value))};assert.deepEqual(read(args,source),exactRead(canonical,source));
  }
  for(const value of canonical.upgrade_history.slice(-3)) {
    const source={id:'upgrade:'+value.id,sha256:digest(JSON.stringify(value))};
    assert.deepEqual(read(args,source),exactRead(canonical,source));
  }
  const currentUpgrade={id:'upgrade:current-upgrade',sha256:digest(JSON.stringify(canonical.upgrade))};
  assert.deepEqual(read(args,currentUpgrade),exactRead(canonical,currentUpgrade));
  for(const options of [{collection:'unknown'},{collection:'records',limit:0},{collection:'records',offset:-1},{collection:'jobs',cursor:'bad'},{collection:'records',cursor:'bad',offset:0}])assert.throws(()=>inspect(args,options));
});

test('selected writes refresh inventory and usage; content-only changes preserve cursors; rollback is atomic',()=>{
  const args=fixture(),first=inspect(args,{limit:1}),before=withStore(args.root,db=>db.read());
  withStore(args.root,db=>db.selectedTransaction('synthetic.content',{rootKeys:['revision','updated_at'],entities:{records:['recent0'],jobs:['recent0']}},s=>{s.records.recent0.content+=' Updated';s.jobs.recent0.model_selection={reason:'Explicit reason'};return s;}));
  assert.doesNotThrow(()=>inspect(args,{cursor:first.next_cursor}));
  assert.throws(()=>read(args,{id:'recent0',sha256:digest(JSON.stringify(before.records.recent0))}),/changed/);
  const canonical=withStore(args.root,db=>db.read());
  assert.deepEqual(inspect(args),publicPage(canonical));
  withStore(args.root,db=>db.readSnapshot(()=>assert.deepEqual(currentView(db.publicState(true)),currentView(canonical))));
  const page=inspect(args,{limit:1});
  withStore(args.root,db=>db.selectedTransaction('synthetic.add',{rootKeys:['revision'],entities:{records:['added']}},s=>{s.records.added={id:'added',content:'Membership changed'};return s;}));
  assert.throws(()=>inspect(args,{cursor:page.next_cursor}),/Stale/);
  const after=inspect(args);
  withStore(args.root,db=>assert.throws(()=>db.selectedTransaction('synthetic.rollback',{rootKeys:['revision'],entities:{records:['added']}},s=>{delete s.records.added;throw Error('Rollback');}),/Rollback/));
  assert.deepEqual(inspect(args),after);
  withStore(args.root,db=>db.transaction('synthetic.upgrade',s=>{s.upgrade={id:'attempt',status:'recovered',calls:[]};return s;}));
  withStore(args.root,db=>assert.equal(db.appendUpgradeCall('attempt',{role:'cos',text:'Retained negative result'}),true));
  assert.doesNotThrow(()=>trace(()=>inspect(args)),'native append must retain the read index');
});

test('status still reconciles archived active jobs and writing exports through canonical transactions',()=>{
  const s=seed(20,50);s.jobs.active.started_at=old;
  s.records.export={id:'export',created_at:old,prototype:{export:{status:'writing',started_at:old}}};
  const args=fixture(s);let transactions=0;const original=Store.prototype.transaction;
  Store.prototype.transaction=function(...a){transactions++;return original.apply(this,a);};
  try {
    const status=engine.status(args,'codex');
    assert.equal(status.active_jobs.total,0);assert.equal(transactions,2);
  }finally{Store.prototype.transaction=original;}
  const state=withStore(args.root,db=>db.read());
  assert.equal(state.jobs.active.status,'interrupted');assert.equal(state.jobs.active.timeout_reconciliation.termination_confirmed,false);
  assert.equal(state.records.export.prototype.export.status,'failed');assert.equal(state.notices.filter(n=>n.kind==='must_know').length,2);
});

test('delivered and reconciliation sources fail closed on corruption; consequential writes retain full integrity checks',()=>{
  for(const [family,key,operation] of [['records','recent2',inspect],['jobs','active',engine.status],['records','archive0',null]]) {
    const args=fixture();
    withStore(args.root,db=>{const row=db.db.prepare('SELECT sha256 FROM state_entries WHERE family=? AND key=?').get(family,key);db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{"corrupt":true}',row.sha256);});
    if(operation)assert.throws(()=>operation(args,'codex'),/hash mismatch/);
    else {
      // Unrelated corrupt archive bytes need not be read for an idle view.
      assert.doesNotThrow(()=>engine.current(args,'codex'));
      withStore(args.root,db=>assert.throws(()=>db.transaction('synthetic.consequential',s=>{s.paused=false;return s;}),/hash mismatch/));
    }
  }
  for(const kind of ['version','unknown','unknown-usage','catalog','row','reordered','missing-active']) {
    const args=fixture();
    withStore(args.root,db=>{
      if(kind==='version')db.db.exec('UPDATE public_read_catalog SET version=99');
      if(kind==='catalog')db.db.exec("UPDATE public_read_catalog SET bytes='{}'");
      if(kind.startsWith('unknown')) {const data=JSON.parse(db.db.prepare('SELECT bytes FROM public_read_catalog').get().bytes);if(kind==='unknown')data.unknown_authority=true;else data.usage.unknown_authority=true;const bytes=JSON.stringify(data);db.db.prepare('UPDATE public_read_catalog SET bytes=?,sha256=?').run(bytes,digest(bytes));}
      if(kind==='reordered')db.db.exec("UPDATE public_read_rows SET ordinal=999 WHERE collection='records' AND ordinal=0");
      if(kind==='row')db.db.exec("UPDATE public_read_rows SET id='wrong' WHERE collection='records' AND ordinal=0");
      if(kind==='missing-active')db.db.exec("DELETE FROM public_read_rows WHERE collection='active_jobs'");
    });
    assert.throws(()=>kind==='missing-active'?engine.status(args,'codex'):inspect(args),/index|metadata/i);
  }
});

test('public reads are snapshot-consistent across a second writer; invalidated and absent indexes use exact legacy fallback',()=>{
  const args=fixture(),reader=new Store(args.root),writer=new Store(args.root),before=reader.read();
  const prepare=reader.db.prepare;let committed=false;
  reader.db.prepare=function(sql,...a) {
    const statement=prepare.call(this,sql,...a);
    if(sql!=='SELECT * FROM public_read_catalog WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key){const method=Reflect.get(target,key,target);if(key!=='get')return typeof method==='function'?method.bind(target):method;return (...parameters)=>{const row=method.apply(target,parameters);if(!committed){committed=true;writer.transaction('synthetic.concurrent',s=>{s.records.recent2.content='Second writer';s.records.added={id:'added'};s.owner.epoch++;return s;});}return row;};}});
  };
  try {
    reader.readSnapshot(()=>assert.deepEqual(currentView(reader.publicState(true)),currentView(before)));
    assert.equal(committed,true);reader.db.prepare=prepare;
    assert.deepEqual(reader.readSnapshot(()=>publicPage(reader.publicState())),publicPage(writer.read()));
    // An older writer knows canonical state_entries but not the derived index.
    writer.db.prepare("UPDATE state_entries SET position=position WHERE family='records' AND key='recent0'").run();
    assert.equal(writer.db.prepare('SELECT COUNT(*) AS n FROM public_read_catalog').get().n,0);
    assert.deepEqual(inspect(args),publicPage(writer.read()));
    writer.transaction('synthetic.rebuild',s=>s);
    writer.db.exec('DROP TABLE public_read_catalog');
    assert.deepEqual(inspect(args),publicPage(writer.read()));
  }finally{reader.db.prepare=prepare;writer.close();reader.close();}
});


test('idle status uses the same snapshot for reconciliation decisions and displayed current truth',()=>{
  const args=fixture(),writer=new Store(args.root),prepare=DatabaseSync.prototype.prepare;let committed=false;
  DatabaseSync.prototype.prepare=function(sql,...a) {
    const statement=prepare.call(this,sql,...a);
    if(sql!=='SELECT * FROM public_read_catalog WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key) {
      const method=Reflect.get(target,key,target);
      if(key!=='get')return typeof method==='function'?method.bind(target):method;
      return (...parameters)=>{
        const row=method.apply(target,parameters);
        if(!committed){committed=true;writer.transaction('synthetic.concurrent-overdue',s=>{s.jobs.active.started_at=old;s.owner.epoch++;return s;});}
        return row;
      };
    }});
  };
  try {
    const status=engine.status(args,'codex');
    assert.equal(committed,true);assert.equal(status.owner.epoch,1);
    assert.equal(status.active_jobs.items[0].timeout.state.state,'executing');
  }finally{DatabaseSync.prototype.prepare=prepare;writer.close();}
  assert.equal(engine.status(args,'codex').active_jobs.total,0,'the next status reconciles the later write');
});

test('partial derived schemas fall back without writes and repair on authorized writes',()=>{
  const objects={table:['public_read_catalog','public_read_values','public_read_rows'],index:['public_read_value_ids','public_read_handles'],trigger:['public_read_insert','public_read_update','public_read_delete']};
  for(const mode of ['full','selected','append'])for(const [type,names] of Object.entries(objects))for(const name of names) {
    const state=seed(2,10);state.upgrade={id:'attempt',status:'recovered',calls:[]};
    const args=fixture(state);
    withStore(args.root,db=>{
      const canonical=db.read();
      db.db.exec(`DROP ${type} ${name}`);
      const schema=db.db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
      const changes=db.db.prepare('SELECT total_changes() AS n').get().n;
      db.readSnapshot(()=>assert.deepEqual(publicPage(db.publicState()),publicPage(canonical)));
      assert.deepEqual(db.db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),schema);
      assert.equal(db.db.prepare('SELECT total_changes() AS n').get().n,changes,'fallback must not mutate');
      assert.deepEqual(db.read(),canonical);
      if(mode==='full')db.transaction('synthetic.repair',s=>s);
      if(mode==='selected')db.selectedTransaction('synthetic.repair',{rootKeys:['revision','updated_at'],entities:{records:['recent0']}},s=>{s.records.recent0.content='Authorized edit';return s;});
      if(mode==='append')assert.equal(db.appendUpgradeCall('attempt',{role:'cos',text:'Authorized append'}),true);
      const after=db.read(),expected=structuredClone(canonical);
      expected.revision=after.revision;expected.updated_at=after.updated_at;
      if(mode==='selected')expected.records.recent0.content='Authorized edit';
      if(mode==='append')expected.upgrade.calls.push({role:'cos',text:'Authorized append'});
      assert.deepEqual(after,expected,`${mode}: ${name} canonical preservation`);
      if(mode!=='full'){assert.equal(readPublicIndex(db.db),null,'Selected writes repair schema without hydrating the archive');db.transaction('synthetic.full_rebuild',s=>s);}
      assert.ok(readPublicIndex(db.db),`${mode}: ${name} repaired`);
      db.readSnapshot(()=>assert.deepEqual(publicPage(db.publicState()),publicPage(after)));
      assert.equal(db.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(db.db.prepare('PRAGMA foreign_key_check').all(),[]);
    });
    assert.doesNotThrow(()=>trace(()=>inspect(args)),`${mode}: ${name} indexed again`);
  }
});

test('arbitrary classification ids preserve canonical inventories and fallback-to-index cursors',()=>{
  for(const id of ['metadata-id',42,false,null,['arbitrary','id'],{id:'nested',unknown:{proof:'Retain exactly'}},'nul\0lone\ud800']) {
    const state=seed(2,10);
    for(const key of ['id','__proto__','nul\0key','lone\ud800','@public:pinned:owner'])Object.defineProperty(state.context_classifications,key,{value:key==='id'?id:{id:key,disposition:'represented'},enumerable:true});
    const args=fixture(state);
    withStore(args.root,db=>{
      const canonical=db.read(),expected=publicCatalog(canonical);
      const compare=()=>{
        const actual=readPublicIndex(db.db);
        for(const collection of PUBLIC_COLLECTIONS)assert.deepEqual(actual.collections[collection],{total:expected.collections[collection].total,inventory:expected.collections[collection].inventory},collection);
      };
      compare();
      db.db.exec('DROP TABLE public_read_catalog');
      const cursors=PUBLIC_COLLECTIONS.map(collection=>({collection,page:db.readSnapshot(()=>publicPage(db.publicState(),{collection,limit:1}))}));
      db.transaction('synthetic.rebuild',s=>s);
      compare();
      assert.deepEqual(db.read().context_classifications,canonical.context_classifications);
      for(const {collection,page} of cursors) {
        assert.deepEqual(db.readSnapshot(()=>publicPage(db.publicState(),{collection,limit:1})),page);
        if(page.next_cursor)assert.deepEqual(db.readSnapshot(()=>publicPage(db.publicState(),{collection,cursor:page.next_cursor,limit:1})),publicPage(db.read(),{collection,cursor:page.next_cursor,limit:1}));
      }
      db.selectedTransaction('synthetic.metadata',{rootKeys:['revision','updated_at'],entities:{context_classifications:['id']}},s=>{s.context_classifications.id={arbitrary:'replacement'};return s;});
      const updated=publicCatalog(db.read());
      for(const collection of PUBLIC_COLLECTIONS)assert.equal(readPublicIndex(db.db).collections[collection].inventory,updated.collections[collection].inventory,collection+' after selected write');
    });
  }
});

test('repair of multiple missing objects rolls back with the authorized write',()=>{
  const args=fixture(seed(2,10));
  withStore(args.root,db=>{
    const canonical=db.read();
    db.db.exec(`DROP TABLE public_read_catalog;
      DROP TABLE public_read_values;
      DROP TRIGGER public_read_insert;
      CREATE TRIGGER reject_repair_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'Synthetic write rejected'); END;`);
    const schema=db.db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
    const write=()=>db.selectedTransaction('synthetic.repair',{rootKeys:['revision','updated_at'],entities:{records:['recent0']}},s=>{s.records.recent0.content='Authorized edit';return s;});
    assert.throws(write,/Synthetic write rejected/);
    assert.deepEqual(db.read(),canonical);
    assert.deepEqual(db.db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),schema);
    db.db.exec('DROP TRIGGER reject_repair_event');
    write();
    assert.equal(readPublicIndex(db.db),null);
    db.transaction('synthetic.full_rebuild',s=>s);
    assert.ok(readPublicIndex(db.db));
    assert.equal(db.read().records.recent0.content,'Authorized edit');
  });
});


test('unavailable index and corrupt unrelated archive cannot roll back a native return',()=>{
  const state=seed(2,10);state.upgrade={id:'attempt',status:'checking',calls:[]};const args=fixture(state);
  withStore(args.root,db=>{
    const hash=db.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='archive0'").get().sha256;
    db.db.exec('DROP TABLE public_read_catalog');
    db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{"corrupt":"unrelated archive"}',hash);
    const returned={role:'cos',native_id:'observed-native',text:'Exact late returned evidence',call_id:'cos:page:p0:0'};
    assert.equal(db.appendUpgradeCall('attempt',returned),true);
    const retained=db.readSelected({rootKeys:[],entities:{upgrade:['calls','probe_native_id']}}).upgrade;
    assert.deepEqual(retained.calls,[returned]);
    assert.equal(retained.probe_native_id,'observed-native');
    assert.equal(readPublicIndex(db.db),null);
    assert.throws(()=>db.read(),/hash mismatch/,'Canonical integrity still holds on affected reads');
  });
});

test('selected receipt-only writes preserve exact catalog without rebuilding unrelated projections',()=>{
  const args=fixture(seed(100));
  withStore(args.root,store=>{
    const baseline=store.captureIntakeBaseline();
    const before=readPublicIndex(store.db);
    const prepare=store.db.prepare.bind(store.db),queries=[];
    store.db.prepare=sql=>{queries.push(sql);return prepare(sql);};
    try{
      store.selectedTransaction('fictional.receipt',{rootKeys:['revision','updated_at','owner'],entities:{jobs:['active']}},s=>{s.jobs.active.receipts=['exact fictional result'];});
    }finally{store.db.prepare=prepare;}
    assert.deepEqual(readPublicIndex(store.db),before);
    assert(!queries.some(sql=>/DELETE FROM public_read_rows|FROM public_read_values WHERE family (?:NOT )?IN/.test(sql)),'receipt update rebuilt unrelated projections');
    const current=store.read();
    const expected=publicCatalog(current);expected.exports=0;for(const info of Object.values(expected.collections))delete info.rows;
    assert.deepEqual(readPublicIndex(store.db),expected);
    const intake=store.readIntake(baseline,{values:true});
    assert.equal(intake.events.length,1);
    assert.deepEqual(JSON.parse(intake.events[0].changes.find(c=>c.after?.family==='jobs').after.raw).receipts,['exact fictional result']);
    assert.equal(intake.events[0].changes.some(c=>c.after?.family==='records'),false);
    store.selectedTransaction('fictional.membership',{rootKeys:['revision','owner'],entities:{jobs:['active']}},s=>{s.jobs.active.status='completed';});
    const after=publicCatalog(store.read());after.exports=0;for(const info of Object.values(after.collections))delete info.rows;
    assert.deepEqual(readPublicIndex(store.db),after);
    assert.equal(after.collections.active_jobs.total,0);
  });
});
