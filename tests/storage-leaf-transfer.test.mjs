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
test('real VACUUM backup and restore preserve database, snapshot vault and file inventory without ownership transfer',()=>{
  const store=fixture();let restored;
  try {
    let ref;store.transaction('fixture.snapshot',s=>{ref=retainSnapshot(s,{restriction:'backup this original'});s.unknown={ref};return s;});
    fs.mkdirSync(path.join(store.dir,'candidates'));
    fs.writeFileSync(path.join(store.dir,'candidates','evidence.txt'),'complete fictional candidate bytes\n');
    const external=newPath('external-data');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'notes.txt'),'fictional external evidence');
    const before=JSON.stringify(store.read()),baseline=store.captureIntakeBaseline(),destination=newPath('backup-good');
    const manifest=backupCompany(store,destination,{artifacts:[{source:external,path:'selected'}]});
    assert.equal(manifest.state_sha256,sha(before));
    assert.ok(manifest.files.some(f=>f.path==='.company/company.sqlite'));
    assert.ok(manifest.files.some(f=>f.path==='.company/candidates/evidence.txt'));
    assert.ok(manifest.files.some(f=>f.path==='artifacts/selected/notes.txt'));
    assert.equal(manifest.files.some(f=>f.path.includes('storage-backup-')),false);
    for(const file of manifest.files){const bytes=fs.readFileSync(path.join(destination,file.path));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);}
    assert.deepEqual(store.captureIntakeBaseline(),baseline);
    const target=newPath('restore-good'),receipt=restoreCompany(destination,target);
    assert.equal(receipt.restored,true);assert.equal(receipt.ownership_transferred,false);assert.deepEqual(receipt.manifest,manifest);
    restored=new storage.Store(target);assert.equal(JSON.stringify(restored.read()),before);
    assert.deepEqual(restored.captureIntakeBaseline(),baseline);
    const state=restored.read();assert.deepEqual(resolveSnapshot(state,ref),{restriction:'backup this original'});
    captureSnapshotDependencies(state,()=>undefined);
    assert.equal(fs.readFileSync(path.join(target,'artifacts/selected/notes.txt'),'utf8'),'fictional external evidence');
    assert.throws(()=>backupCompany(store,destination),/new absolute directory/);
    assert.throws(()=>backupCompany(store,path.join(store.dir,'recursive')),/inside company source/);
    assert.throws(()=>backupCompany(store,path.join(external,'recursive'),{artifacts:[{source:external,path:'selected'}]}),/inside selected artifact source/);
    assert.throws(()=>restoreCompany(destination,path.join(destination,'recursive')),/inside backup source/);
    assert.throws(()=>restoreCompany(destination,target),/new absolute directory/);
  }finally{restored?.close();store.close();}
});

test('transfer rejects changed and linked inputs and retains incomplete copies for inspection',()=>{
  const store=fixture();try {
    fs.writeFileSync(path.join(store.dir,'evidence.txt'),'original fixture evidence');
    const backup=newPath('backup-faults');backupCompany(store,backup);
    const source=path.join(backup,'.company','evidence.txt'),raw=fs.readFileSync(source);
    fs.writeFileSync(source,'changed');
    const rejected=newPath('restore-changed');assert.throws(()=>restoreCompany(backup,rejected),/bytes missing or changed/);assert.equal(fs.existsSync(rejected),false);
    fs.writeFileSync(source,raw);
    const copy=fs.copyFileSync,target=newPath('restore-copy-corrupt');let injected=0;
    fs.copyFileSync=function(from,to,...args){
      const result=Reflect.apply(copy,this,[from,to,...args]);
      if(to===path.join(target,'.company','evidence.txt')){injected++;fs.writeFileSync(to,'fault after actual copy');}
      return result;
    };
    try{assert.throws(()=>restoreCompany(backup,target),/Restored file inventory differs/);assert.equal(injected,1);}finally{fs.copyFileSync=copy;}
    assert.equal(fs.existsSync(path.join(target,'.company','company.sqlite')),true);
    assert.equal(fs.readFileSync(path.join(target,'.company','evidence.txt'),'utf8'),'fault after actual copy');
    // Real source link rejection occurs after the database VACUUM is retained.
    fs.symlinkSync(path.join(store.dir,'evidence.txt'),path.join(store.dir,'linked-evidence'));
    const linked=newPath('backup-linked');
    try{assert.throws(()=>backupCompany(store,linked),/Links\/special transfer files refused/);}finally{fs.unlinkSync(path.join(store.dir,'linked-evidence'));}
    assert.equal(fs.existsSync(path.join(linked,'.company','company.sqlite')),true);
    assert.equal(fs.existsSync(path.join(linked,'manifest.json')),false);
    // The input is checked again for links before any destination is created.
    fs.unlinkSync(source);fs.symlinkSync(path.join(store.dir,'evidence.txt'),source);
    const linkRestore=newPath('restore-linked');
    try{assert.throws(()=>restoreCompany(backup,linkRestore),/Linked backup path refused/);assert.equal(fs.existsSync(linkRestore),false);}finally{fs.unlinkSync(source);fs.writeFileSync(source,raw);}
    // A real intervening company commit makes backup completion uncertain.
    const changed=newPath('backup-concurrent');let commits=0;
    fs.copyFileSync=function(from,to,...args){
      const result=Reflect.apply(copy,this,[from,to,...args]);
      if(!commits&&to===path.join(changed,'.company','evidence.txt')){commits++;store.transaction('fixture.concurrent-backup',s=>{s.unknown={later:true};return s;});}
      return result;
    };
    try{assert.throws(()=>backupCompany(store,changed),/Company changed while backing up/);assert.equal(commits,1);}finally{fs.copyFileSync=copy;}
    assert.equal(fs.existsSync(path.join(changed,'.company','company.sqlite')),true);
    assert.equal(fs.existsSync(path.join(changed,'manifest.json')),false);
    assert.deepEqual(store.read().unknown,{later:true});
  }finally{store.close();}
});
