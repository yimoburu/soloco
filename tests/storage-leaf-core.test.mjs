import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as storage from '../plugins/soloco/runtime/store.mjs';
import {readNormalized,readImmutable,readPublicIndex,readPublicRows,readPublicAlias,readPublicHandle,LATEST_LAYOUT} from '../plugins/soloco/runtime/record-storage.mjs';
import {retainSnapshot,retainSnapshotEntry,resolveSnapshot,snapshotBytes,captureSnapshotDependencies,validateSnapshotDependencies,operatingIntake} from '../plugins/soloco/runtime/snapshot.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';
import {digest,bindPublicReader,publicReaderFor,PUBLIC_COLLECTIONS,publicEntries,publicIndexValue,publicCatalog,resourceClaims,usageView,storageSourceId} from '../plugins/soloco/runtime/state-projections.mjs';
import * as team from '../plugins/soloco/runtime/team-source.mjs';

// Only real storage modules and their four declared lazy assets are exercised.
// Presentation/coordination consumers and packaging remain source-review only.
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-leaf-preservation-')));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
const sha=value=>createHash('sha256').update(value).digest('hex');
const newPath=name=>path.join(temporary,name);
const longKey='long-'+ 'x'.repeat(520);
const unsafeKey='exact\0\ud800';
function fixture() {
  const root=fs.mkdtempSync(path.join(temporary,'company-')),store=new storage.Store(root,true);
  store.transaction('fictional.seed',()=>({
    id:'fictional-storage-leaves',name:'Fictional',idea:'Preservation fixture',schema:2,
    plugin_version:'0.7.6',runtime_version:'0.7.6',phase:'Frame',mode:'preparation',paused:true,
    governance:'fictional pinned governance',governance_sha256:sha('fictional pinned governance'),
    roles:{engineer:{name:'Fictional engineer'}},cos_instructions:'fictional pinned instructions',team_sha256:'fixture-only',
    owner:{host:'fictional',session_id:'fictional-owner',epoch:1},
    records:Object.fromEntries([
      ['a',{id:'shared-value-id',revision:1,content:'before',created_at:'2020-01-01T00:00:00.000Z'}],
      ['b',{id:'shared-value-id',revision:1,content:'second',created_at:'2020-01-01T00:00:00.000Z'}],
      ['job:work',{id:'collision',content:'record namespace wins'}],
      ['upgrade:old',{id:'upgrade-collision'}],
      [longKey,{id:'long-value',content:'long storage key'}],
      ['@public:records:reserved',{id:'reserved-value'}],
      [unsafeKey,{id:'unsafe-value'}],
      ['__proto__',{id:'own-proto',content:'ordinary own field'}],
      ['no-id',{content:'no value ID',updated_at:'invalid'}],
      ['nothing',null],
      ['plan',{id:'plan',development:{type:'plan'},prototype:{type:'plan',export:{status:'writing',started_at:'fictional'}}}]
    ]),
    jobs:{
      work:{id:'work',status:'queued',coordination:{resources:['repo','repo']},coordination_release:{termination_confirmed:true},model_selection:{reason:'bounded fixture'},model_evidence:{applied_controls:{fixture:true},reported_models:['fictional']}},
      other:{id:'different-value-id',status:'running',coordination:{resources:['db']}},
      lost:{id:'lost',status:'failed',coordination:{resources:['held']}},
      closed:{id:'closed',status:'completed',coordination:{resources:['released']},coordination_release:{termination_confirmed:true}},
      test:{id:'test',status:'completed',kind:'development_test'}
    },
    notices:[{id:'pending',resolution:null},{id:'settled',resolution:{text:'fixture disposition'}}],
    messages:[{text:'first'},{text:'last',at:'invalid'}],sessions:{one:{id:'one'}},
    upgrade_history:[{id:'old',status:'completed'},{id:'free',status:'recovered'}],
    context_classifications:{one:{disposition:'fixture'}},
    upgrade:{id:'upgrade-fixture',status:'completed',calls:[{text:'prior fixture call'}]},
    handover:{id:'handover-fixture',status:'completed'},unknown:{retain:'uninterpreted'}
  }));
  assert.equal(store.storageInfo().format,'legacy-json');
  const before=JSON.stringify(store.read());store.migrate();
  assert.equal(JSON.stringify(store.read()),before);
  assert.equal(store.storageInfo().format,'normalized-v4');
  return store;
}
const rowView=({key,id,value})=>({key,id,value});
function assertProjectionAgreement(store) {
  store.readSnapshot(()=>{
    const full=store.read(),expected=publicCatalog(full),index=readPublicIndex(store.db);
    assert.ok(index);
    assert.deepEqual(Object.keys(index.collections),PUBLIC_COLLECTIONS);
    assert.deepEqual(index.usage,expected.usage);assert.equal(index.claims,expected.claims);assert.equal(index.exports,1);
    for(const current of [false,true]) {
      const state=store.publicState(current),reader=publicReaderFor(state);
      assert.ok(reader,'Store must bind the canonical registry');
      assert.equal(publicReaderFor({...state}),undefined,'copying JSON must not copy a reader');
      assert.equal(Object.hasOwn(state,'records'),false,'the binding is not full-state hydration');
      assert.deepEqual(reader.usage,index.usage);assert.equal(reader.claims,index.claims);
      for(const collection of PUBLIC_COLLECTIONS) {
        const rows=publicEntries(full,collection).map(rowView),info=expected.collections[collection];
        assert.deepEqual(reader.info(collection),{total:info.total,inventory:info.inventory});
        assert.deepEqual(index.collections[collection],reader.info(collection));
        assert.deepEqual(readPublicRows(store.db,collection,0,rows.length),info.rows);
        const delivered=[];
        for(let offset=0;offset<rows.length;offset+=2)delivered.push(...reader.rows(collection,offset,2));
        assert.deepEqual(delivered,rows,collection);
      }
      assert.throws(()=>reader.info('unrecognized'),/Unknown public collection/);
    }
  });
}

test('canonical digest and Store compatibility exports preserve identity and byte semantics',()=>{
  assert.equal(storage.digest,digest);
  for(const name of ['PACKAGE','VERSION','skillBody','installedTeam','teamHash'])assert.equal(storage[name],team[name],name);
  for(const value of ['', 'abc', 'é', 'e\u0301', '\ud800', '\0',Buffer.from([0,255,128,65])])assert.equal(digest(value),sha(value));
  assert.notEqual(digest('é'),digest('e\u0301'));
  assert.notEqual(digest('{"a":1,"b":2}'),digest('{"b":2,"a":1}'));
  assert.equal(team.VERSION,'0.7.6');assert.equal(LATEST_LAYOUT,4);assert.equal(storage.SCHEMA,2);
  assert.equal(team.PACKAGE,path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../plugins/soloco'));
  assert.throws(()=>storage.folder(team.PACKAGE),/outside the installed plugin/);
  const object={},reader={fixture:true};assert.equal(bindPublicReader(object,reader),object);assert.equal(publicReaderFor(object),reader);
  assert.equal(publicReaderFor({}),undefined);
});

test('real lazy team assets, policy selection, fallback and exact hash tuple survive extraction',()=>{
  const assets=[
    ['assets/governance.md','4bd0af7032d870195b2992e850b1dc9a50a9b9e59a3ec27267b7b0752cca57a9'],
    ['assets/roles.json','7e9f4f387f3622123fe8dbd69dd3cf0aa17943628d71ff03971d4ab4a8abd7ba'],
    ['skills/soloco/SKILL.md','e7031d075ecb3380c8ba683b66269ddba5c27144ce806dd2cd12b43a1b3132ff'],
    ['compat/company-0.1.0.md','bb6c3dbb6e7a03d033b7c39dccc59c31738369ffccc4fe6ff609d679e0eacc74']
  ];
  const texts=assets.map(([relative,expected])=>{const value=fs.readFileSync(path.join(team.PACKAGE,relative),'utf8');assert.equal(sha(value),expected);return value;});
  const expected={plugin_version:'0.7.6',governance:texts[0],governance_sha256:sha(texts[0]),roles:JSON.parse(texts[1]),cos_instructions:texts[2].replace(/^---[\s\S]*?---\s*/,'')};
  const read=fs.readFileSync,reads=[];
  fs.readFileSync=function(file,...args){reads.push(String(file));return Reflect.apply(read,this,[file,...args]);};
  try {
    const first=team.installedTeam(),second=team.installedTeam();
    assert.deepEqual(first,expected);assert.deepEqual(Object.keys(first),Object.keys(expected));
    assert.notEqual(first.roles,second.roles);
    assert.deepEqual(reads,[...assets.slice(0,3),...assets.slice(0,3)].map(([p])=>path.join(team.PACKAGE,p)));
    const pinned={plugin_version:'0.7.5',governance:'pinned',governance_sha256:'supplied-pin',roles:{qa:{name:'pinned'}},cos_instructions:'pinned skill'};
    reads.length=0;assert.deepEqual(team.publicTeam(pinned,'pinned'),pinned);assert.equal(reads.length,0);
    // Pinned selection historically ignores the candidate-policy argument.
    assert.deepEqual(team.publicTeam(pinned,'pinned','unrecognized'),pinned);
    assert.deepEqual(team.publicTeam(pinned,'installed'),expected);
    assert.deepEqual(team.publicTeam(pinned,'candidate','installed'),expected);
    assert.deepEqual(team.publicTeam(pinned,'candidate'),{...expected,governance:'pinned',governance_sha256:'supplied-pin'});
    const absent={...pinned};delete absent.cos_instructions;
    assert.deepEqual(team.publicTeam(absent,'pinned'),{...absent,cos_instructions:team.skillBody(texts[3])});
    assert.equal(reads.at(-1),path.join(team.PACKAGE,'compat/company-0.1.0.md'));
    reads.length=0;assert.equal(team.publicTeam({...pinned,cos_instructions:''},'pinned').cos_instructions,'');assert.equal(reads.length,0);
    for(const [kind,policy] of [['bad','preserve'],['candidate','bad'],['installed','bad']])assert.throws(()=>team.publicTeam(pinned,kind,policy),/Unknown public team source/);
    assert.equal(team.teamHash(pinned),sha(JSON.stringify(['0.7.5','pinned',pinned.roles,'pinned skill'])));
    assert.equal(team.teamHash({...pinned,governance_sha256:'changed'}),team.teamHash(pinned));
    assert.notEqual(team.teamHash({...pinned,cos_instructions:'changed'}),team.teamHash(pinned));
    const ownerState={...pinned,schema:2,runtime_version:'0.7.6',owner:{host:'fictional',session_id:'owner',epoch:7}};
    ownerState.team_sha256=team.teamHash(ownerState);
    assert.doesNotThrow(()=>storage.owner(ownerState,'owner','fictional',7));
    assert.throws(()=>storage.owner(ownerState,'owner','fictional',8),/does not own/);
    assert.throws(()=>storage.owner({...ownerState,governance:'changed'},'owner','fictional',7),/integrity/);
  }finally{fs.readFileSync=read;}
});

test('claim retention, exclusion, multiplicity and iteration order retain exact status semantics',()=>{
  const state={jobs:{
    q:{id:'q',status:'queued',coordination:{resources:['b','a','b']},coordination_release:{termination_confirmed:true}},
    r:{id:'r',status:'running',coordination:{resources:['r']},coordination_release:{termination_confirmed:true}},
    f:{id:'f',status:'failed',coordination:{resources:['f']},coordination_release:{termination_confirmed:false}},
    u:{id:'u',status:'future-status',coordination:{resources:['u']},coordination_release:{termination_confirmed:'true'}},
    m:{id:'m',coordination:{resources:['m']}},
    c:{id:'c',status:'cancelled',coordination:{resources:['c']},coordination_release:{termination_confirmed:true}},
    empty:{id:'empty',status:'running',coordination:{resources:[]}}
  }};
  const expected=[
    {resource:'b',job_id:'q',status:'queued',termination_unverified:false},
    {resource:'a',job_id:'q',status:'queued',termination_unverified:false},
    {resource:'b',job_id:'q',status:'queued',termination_unverified:false},
    {resource:'r',job_id:'r',status:'running',termination_unverified:false},
    {resource:'f',job_id:'f',status:'failed',termination_unverified:true},
    {resource:'u',job_id:'u',status:'future-status',termination_unverified:true},
    {resource:'m',job_id:'m',status:undefined,termination_unverified:true}
  ];
  assert.deepEqual(resourceClaims(state),expected);
  assert.deepEqual(resourceClaims(state,'q'),expected.slice(3));
  assert.deepEqual(resourceClaims({}),[]);
  assert.deepEqual(publicEntries(state,'active_jobs').map(r=>r.key),['q','r','empty']);
  assert.deepEqual(publicEntries(state,'claimed_jobs').map(r=>r.key),['q','r','f','u','m']);
  assert.deepEqual(publicIndexValue('jobs',state.jobs.q).coordination,{resources:[null,null,null]});
  const usage=usageView({jobs:{a:{kind:'development_test'},b:{type:'development_test'},c:{model_selection:{reason:'  '},model_evidence:{applied_controls:true,reported_models:['x']}},d:{model_selection:{reason:'valid'}}}});
  assert.equal(usage.assignments,2);assert.equal(usage.missing_reasons,1);assert.equal(usage.with_applied_controls,1);assert.equal(usage.with_host_reported_models,1);
});

test('real indexed Store reader agrees with full projections including keys, collisions, aliases and order',()=>{
  const store=fixture();try {
    assertProjectionAgreement(store);
    const full=store.read();
    const records=publicEntries(full,'records');
    assert.deepEqual(records.slice(0,2).map(r=>r.key),['b','a'],'equal timestamps retain reverse storage order');
    assert.deepEqual(publicEntries(full,'messages').map(r=>r.key),['1','0'],'missing/invalid dates use reverse storage order');
    assert.equal(publicEntries(full,'jobs').find(r=>r.key==='work').id,'@public:jobs:work');
    assert.equal(publicEntries(full,'jobs').find(r=>r.key==='other').id,'@public:jobs:other');
    assert.equal(publicEntries(full,'upgrade_history').find(r=>r.key==='0').id,'@public:upgrade_history:0');
    assert.equal(publicEntries(full,'upgrade_history').find(r=>r.key==='1').id,'upgrade:free');
    for(const key of [longKey,'@public:records:reserved']) {
      const expected='@public:key:records:'+sha(JSON.stringify(key));
      assert.equal(storageSourceId('records',key),expected);assert.equal(records.find(r=>r.key===key).id,expected);
      assert.equal(store.publicHandle('records',sha(JSON.stringify(key))),key);
      assert.equal(readPublicHandle(store.db,'records',sha(JSON.stringify(key))),key);
    }
    assert.equal(readPublicAlias(store.db,'records','shared-value-id'),'a','alias uses first position, not recent sort');
    assert.equal(store.publicAlias('records','unsafe-value'),unsafeKey);
    assert.equal(readPublicAlias(store.db,'records','absent'),null);
    assert.equal(Object.hasOwn(full.records,'__proto__'),true);
    assert.equal(full.records.__proto__.id,'own-proto');
    const before=readPublicIndex(store.db).collections.records.inventory;
    store.selectedTransaction('fixture.body-only',{rootKeys:['revision','owner'],entities:{records:['a']}},s=>{s.records.a.content='changed body';});
    assert.equal(readPublicIndex(store.db).collections.records.inventory,before);
    assertProjectionAgreement(store);
    store.transaction('fixture.reorder',s=>{s.records=Object.fromEntries([['b',s.records.b],...Object.entries(s.records).filter(([k])=>k!=='b')]);return s;});
    assert.equal(store.publicAlias('records','shared-value-id'),'b');
    assertProjectionAgreement(store);
    const entry=store.db.prepare("SELECT * FROM public_read_values WHERE family='records' AND key='b'").get();
    store.db.prepare("UPDATE public_read_values SET bytes='{}' WHERE family='records' AND key='b'").run();
    assert.throws(()=>readPublicAlias(store.db,'records','shared-value-id'),/metadata hash mismatch/);
    store.db.prepare("UPDATE public_read_values SET bytes=? WHERE family='records' AND key='b'").run(entry.bytes);
    assert.equal(store.publicAlias('records','shared-value-id'),'b');
    store.db.exec('UPDATE public_read_catalog SET version=99');
    assert.throws(()=>store.publicState(),/Unknown public read index version/);
    store.db.exec('UPDATE public_read_catalog SET version=1');
    assertProjectionAgreement(store);
  }finally{store.close();}
});

// Compare every real storage table, including retained immutable values,
// journal children, all derived indexes/catalog rows and the event log.
const tables=['company','events','company_layout','immutable_values','state_entries','public_read_values','public_read_rows','public_read_catalog'];
function dump(store) {
  return Object.fromEntries(tables.map(name=>[name,store.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()]));
}
const selected={rootKeys:['revision','owner'],entities:{records:['a'],upgrade:['calls']}};
function mutate(s,label) {
  const nested=retainSnapshot(s,{evidence:'new snapshot '+label});
  s.records.a={...s.records.a,content:label,updated_at:'2030-01-01T00:00:00.000Z',snapshot:nested};
  s.upgrade.calls.push({text:'new journal '+label});
  return s;
}
for(const method of ['full','selected'])for(const stage of ['callback','immutable','index','afterWrite','event']) {
  test(method+' transaction rolls back every storage table after '+stage+' failure',()=>{
    const store=fixture(),before=dump(store),logical=store.read(),baseline=store.captureIntakeBaseline();
    const prepare=store.db.prepare;let faultHits=0,afterWriteHits=0,immutableInserts=0;
    store.db.prepare=function(sql,...args) {
      if(stage==='immutable'&&sql.startsWith('INSERT OR IGNORE INTO immutable_values')&&++immutableInserts===2){faultHits++;throw Error('fictional immutable failure');}
      if(stage==='index'&&sql.startsWith('INSERT OR REPLACE INTO public_read_values')){faultHits++;throw Error('fictional index failure');}
      if(stage==='event'&&sql.startsWith('INSERT INTO events')){faultHits++;throw Error('fictional event failure');}
      return Reflect.apply(prepare,this,[sql,...args]);
    };
    try {
      const callback=s=>{mutate(s,method+'-'+stage);if(stage==='callback'){faultHits++;throw Error('fictional callback failure');}return s;};
      const options={afterWrite(db,s){
        afterWriteHits++;
        const written=readNormalized(db);
        assert.equal(written.records.a.content,method+'-'+stage);
        assert.equal(written.upgrade.calls.length,2);
        assert.equal(readImmutable(db,s.records.a.snapshot.immutable_snapshot.sha256),JSON.stringify({evidence:'new snapshot '+method+'-'+stage}));
        assert.equal(store.changeToken(),baseline.seq,'event must follow afterWrite');
        if(stage==='afterWrite'){faultHits++;throw Error('fictional afterWrite failure');}
      }};
      assert.throws(()=>method==='full'?store.transaction('fixture.fail',callback,options):store.selectedTransaction('fixture.fail',selected,callback,options),new RegExp('fictional '+stage+' failure'));
      assert.equal(faultHits,1);
      assert.equal(afterWriteHits,['afterWrite','event'].includes(stage)?1:0);
    }finally{store.db.prepare=prepare;}
    try {
      assert.equal(store.inTransaction,false);
      assert.deepEqual(dump(store),before);
      assert.deepEqual(store.read(),logical);
      assert.deepEqual(store.captureIntakeBaseline(),baseline);
      assert.equal(store.readIntake(baseline).events.length,0);
      const reopened=new storage.Store(store.root);
      try{assert.deepEqual(dump(reopened),before);assert.deepEqual(reopened.read(),logical);}finally{reopened.close();}
      // A successful later write demonstrates a usable connection after rollback.
      if(method==='full')store.transaction('fixture.recover',s=>mutate(s,'recovered'));
      else store.selectedTransaction('fixture.recover',selected,s=>mutate(s,'recovered'));
      assert.equal(store.read().records.a.content,'recovered');assert.equal(store.readIntake(baseline).events.length,1);
    }finally{store.close();}
  });
}

test('frozen originals survive mutation and reopen; intake envelopes do not replace nested dependency validation',()=>{
  let store=fixture();const root=store.root;let inner,outer;
  try {
    store.transaction('fixture.retain',s=>{
      inner=retainSnapshot(s,{restriction:'retain original restriction',unicode:'é\0'});
      outer=retainSnapshotEntry(s,{id:'original',revision:1,nested:inner});
      s.unknown={archive:outer};return s;
    });
    const frozen=store.read(),baseline=store.captureIntakeBaseline();
    const captured=captureSnapshotDependencies(frozen,()=>resolveSnapshot(frozen,inner),{root:outer});
    assert.equal(captured.dependencies.length,2);
    store.transaction('fixture.replace',s=>{s.unknown={replacement:true};s.records.a.content='later';return s;});
    assert.deepEqual(resolveSnapshot(frozen,inner),captured.value);
    store.close();store=new storage.Store(root);
    assert.deepEqual(resolveSnapshot(frozen,inner),captured.value,'old vault binding resolves durable originals after reopen');
    validateSnapshotDependencies(frozen,captured.dependencies);
    const intact=store.readIntake(baseline,{values:true});
    const change=intact.events[0].changes.find(c=>c.before?.family==='root'&&c.before.key==='unknown');
    assert.deepEqual(JSON.parse(change.before.raw),{archive:outer});
    const envelope=JSON.parse(change.before.raw),current=store.read();
    const checked=captureSnapshotDependencies(current,()=>true,{root:envelope});
    assert.equal(checked.dependencies.length,2);
    const innerHash=inner.immutable_snapshot.sha256,raw=readImmutable(store.db,innerHash);
    for(const damage of ['corrupt','missing']) {
      try {
        if(damage==='corrupt')store.db.prepare("UPDATE immutable_values SET bytes='null' WHERE sha256=?").run(innerHash);
        else store.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(innerHash);
        assert.deepEqual(store.readIntake(baseline,{values:true}),intact,'intake verifies row envelopes, not hidden nested originals');
        assert.throws(()=>snapshotBytes(frozen,inner),/missing|hash mismatch|corrupt/);
        assert.throws(()=>captureSnapshotDependencies(current,()=>true,{root:envelope}),/missing|hash mismatch|corrupt/);
        assert.throws(()=>validateSnapshotDependencies(current,checked.dependencies),/missing|hash mismatch|corrupt/);
      }finally{store.db.prepare('INSERT OR REPLACE INTO immutable_values VALUES(?,?)').run(innerHash,raw);}
    }
    validateSnapshotDependencies(current,checked.dependencies);
    const result=operatingIntake(current,baseline);assert.deepEqual(result.intake,intact);
    assert.deepEqual(resolveSnapshot(frozen,inner),captured.value);
  }finally{store.close();}
});

