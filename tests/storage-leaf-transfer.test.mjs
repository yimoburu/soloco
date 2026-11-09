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
function fixture(root=fs.mkdtempSync(path.join(temporary,'company-'))) {
  const store=new storage.Store(root,true);
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

const selection={protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'};
const expectedIdentity={selection,template_sha256:'e161c3ed5a5588305c5d77cc99edc0e21d9fa88bf23a292a145948891ef28093',factory_source_sha256:'43b9656ec3b5c1e50cfb5a49aa1f032fe915c4ebf27b6fb8c6b5eec0e0fa5134'};
const companyRelative='cases/transfer-faults/company';
const targetRelative=companyRelative+'/.company/evidence.txt';
function closed(value,keys){
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(),[...keys].sort());
}
function absent(file){
  assert.throws(()=>fs.lstatSync(file),error=>error.code==='ENOENT');
}
function linkIdentity(file,link,target){
  const stat=fs.lstatSync(file,{bigint:true});
  assert.equal(stat.isSymbolicLink(),true);
  assert.equal(String(stat.dev),link.dev);assert.equal(String(stat.ino),link.ino);
  assert.equal(fs.readlinkSync(file),target);
  return stat;
}
let selectedCache;
function selectedFixture(){
  if(selectedCache!==undefined)return selectedCache;
  const manifestPath=process.env.SOLOCO_TEST_FIXTURE_MANIFEST;
  if(manifestPath===undefined){
    assert.equal(process.env.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256,undefined);
    selectedCache=null;return selectedCache;
  }
  const scratch=fs.realpathSync(os.tmpdir());
  assert.equal(manifestPath,path.join(scratch,'fixtures','manifest.json'));
  assert.equal(fs.realpathSync.native(manifestPath),manifestPath);
  const manifestStat=fs.lstatSync(manifestPath);
  assert.equal(manifestStat.isFile(),true);assert.equal(manifestStat.isSymbolicLink(),false);assert.equal(manifestStat.nlink,1);
  const raw=fs.readFileSync(manifestPath);
  assert.ok(raw.length>0&&raw.length<=4096);
  assert.match(process.env.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256??'',/^[a-f0-9]{64}$/);
  assert.equal(sha(raw),process.env.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256);
  const manifest=JSON.parse(raw);
  closed(manifest,['protocol','factory','company_root','target_relative_path','target_absent_at_setup','links','identity','scratch_root']);
  closed(manifest.identity,['selection','template_sha256','factory_source_sha256']);
  closed(manifest.identity.selection,['protocol','factory']);
  assert.deepEqual(manifest.identity,expectedIdentity);
  assert.equal(manifest.protocol,selection.protocol);assert.equal(manifest.factory,selection.factory);
  assert.equal(manifest.scratch_root,scratch);
  assert.equal(manifest.company_root,companyRelative);
  assert.equal(manifest.target_relative_path,targetRelative);
  assert.equal(manifest.target_absent_at_setup,true);
  assert.ok(Array.isArray(manifest.links));assert.equal(manifest.links.length,2);
  assert.deepEqual(manifest.links.map(link=>link.id),['company-entry','backup-entry']);
  const target=path.join(scratch,targetRelative);
  for(const link of manifest.links){
    closed(link,['id','staged_relative_path','target_relative_path','target_absent_at_setup','symbolic_link','dev','ino','readlink_target']);
    assert.equal(link.staged_relative_path,'fixtures/links/'+link.id);
    assert.equal(link.target_relative_path,targetRelative);
    assert.equal(link.target_absent_at_setup,true);assert.equal(link.symbolic_link,true);
    assert.match(link.dev,/^\d+$/);assert.match(link.ino,/^\d+$/);
    assert.equal(link.readlink_target,target);
    linkIdentity(path.join(scratch,link.staged_relative_path),link,target);
  }
  assert.equal(process.permission.has('fs'),false,'selected fixture must retain partial Node filesystem grants');
  assert.equal(process.permission.has('fs.read',scratch),true);
  assert.equal(process.permission.has('fs.write',scratch),true);
  const root=path.join(scratch,companyRelative),rootStat=fs.lstatSync(root,{bigint:true});
  assert.equal(rootStat.isDirectory(),true);assert.equal(rootStat.isSymbolicLink(),false);
  assert.equal(fs.realpathSync.native(root),root);
  assert.deepEqual(fs.readdirSync(root),[],'trusted fixture must supply an empty company root');
  absent(target);
  selectedCache={manifest,scratch,root,target,rootStat};return selectedCache;
}
function selectedEmptyCompanyRoot(){
  const selected=selectedFixture();if(!selected)return undefined;
  assert.deepEqual(fs.readdirSync(selected.root),[],'check emptiness before Store initialization');
  absent(selected.target);
  return selected.root;
}
function linkFixture(store){
  const selected=selectedFixture();
  if(selected){assert.equal(store.root,selected.root);assert.equal(path.join(store.dir,'evidence.txt'),selected.target);return selected;}
  // Ordinary host tests create two links themselves. The selected child never
  // enters this branch or creates/retargets a symlink.
  const stage=newPath('ordinary-fixture-links'),target=path.join(store.dir,'evidence.txt');
  fs.mkdirSync(stage);
  const links=['company-entry','backup-entry'].map(id=>{
    const staged=path.join(stage,id);fs.symlinkSync(target,staged);
    const stat=fs.lstatSync(staged,{bigint:true});
    return {id,staged_relative_path:path.relative(temporary,staged),target_relative_path:path.relative(temporary,target),dev:String(stat.dev),ino:String(stat.ino),readlink_target:target};
  });
  absent(target);
  return {scratch:temporary,root:store.root,target,manifest:{links},rootStat:fs.lstatSync(store.root,{bigint:true})};
}
function stagedLink(f,id){
  const link=f.manifest.links.find(value=>value.id===id);assert.ok(link);
  return {link,file:path.join(f.scratch,link.staged_relative_path)};
}
function attestStaged(f){
  for(const link of f.manifest.links)linkIdentity(path.join(f.scratch,link.staged_relative_path),link,f.target);
  const root=fs.lstatSync(f.root,{bigint:true});
  assert.equal(root.isDirectory(),true);assert.equal(root.isSymbolicLink(),false);
  assert.equal(root.dev,f.rootStat.dev);assert.equal(root.ino,f.rootStat.ino);
  assert.equal(fs.realpathSync.native(f.root),f.root);
}
function sameDirectory(file,identity){
  const actual=fs.lstatSync(file,{bigint:true});
  assert.equal(actual.isDirectory(),true);assert.equal(actual.isSymbolicLink(),false);
  assert.equal(actual.dev,identity.dev);assert.equal(actual.ino,identity.ino);
}
function realDestinationScenarios(store,f){
  const {link,file:staged}=stagedLink(f,'company-entry');
  const parent=newPath('intervening-parent'),moved=parent+'-moved';
  const escaped=path.join(path.dirname(staged),'escaped');
  const child=path.join(f.target,'existing-child');
  const before=JSON.stringify(store.read()),baseline=store.captureIntakeBaseline();
  const companyEntries=fs.readdirSync(store.dir).sort();
  let targetIdentity=null,movedIdentity=null,relocated=false,injected=0;
  const mkdir=fs.mkdirSync;
  attestStaged(f);absent(f.target);absent(parent);absent(moved);absent(escaped);
  try{
    // Both fixed links are genuinely dangling while E is absent.
    for(const entry of f.manifest.links){
      const actual=path.join(f.scratch,entry.staged_relative_path);
      linkIdentity(actual,entry,f.target);
      assert.equal(fs.existsSync(actual),false);
      assert.throws(()=>backupCompany(store,actual),/Linked transfer ancestor/);
      assert.throws(()=>backupCompany(store,path.join(actual,'new-output')),/Linked transfer ancestor/);
    }
    assert.throws(()=>backupCompany(store,staged+'/../escaped'),/Parent traversal/);
    absent(escaped);absent(f.target);
    attestStaged(f);

    // Change only the fixed target's ordinary scratch contents, never either
    // link's readlink bytes. Direct and ancestor links now have an existing target.
    fs.mkdirSync(f.target,{mode:0o700});targetIdentity=fs.lstatSync(f.target,{bigint:true});
    fs.mkdirSync(child,{mode:0o700});
    assert.equal(fs.statSync(staged).isDirectory(),true);
    assert.throws(()=>backupCompany(store,staged),/Linked transfer ancestor/);
    assert.throws(()=>backupCompany(store,path.join(staged,'new-output')),/Linked transfer ancestor/);
    assert.throws(()=>backupCompany(store,staged+'/../escaped'),/Parent traversal/);
    absent(escaped);absent(path.join(f.target,'new-output'));

    const destination=path.join(staged,'existing-child','output');
    const nearest=path.dirname(destination),nearestStat=fs.lstatSync(nearest);
    assert.equal(nearestStat.isSymbolicLink(),false);assert.equal(nearestStat.isDirectory(),true);
    assert.equal(fs.realpathSync.native(nearest),child);
    assert.notEqual(fs.realpathSync.native(nearest),nearest);
    assert.throws(()=>backupCompany(store,destination),/noncanonical transfer ancestor/);
    absent(path.join(child,'output'));attestStaged(f);

    // The hook performs real mkdir and real inode-preserving renames. The
    // subsequent production recheck must observe an actual intervening link.
    fs.mkdirSync=function(file,...options){
      const result=Reflect.apply(mkdir,this,[file,...options]);
      if(file===parent){
        injected++;
        assert.equal(injected,1);
        const created=fs.lstatSync(parent,{bigint:true});
        assert.equal(created.isDirectory(),true);assert.equal(created.isSymbolicLink(),false);
        fs.renameSync(parent,moved);movedIdentity=created;
        linkIdentity(staged,link,f.target);
        fs.renameSync(staged,parent);relocated=true;
        linkIdentity(parent,link,f.target);
      }
      return result;
    };
    try{assert.throws(()=>backupCompany(store,path.join(parent,'output')),/Linked transfer ancestor/);}
    finally{fs.mkdirSync=mkdir;}
    assert.equal(injected,1);
    linkIdentity(parent,link,f.target);
    sameDirectory(moved,movedIdentity);
    assert.deepEqual(fs.readdirSync(moved),[],'the actually created parent remains inspectable');
    absent(path.join(moved,'output'));absent(path.join(f.target,'output'));
    assert.equal(JSON.stringify(store.read()),before);
    assert.deepEqual(store.captureIntakeBaseline(),baseline);
  }finally{
    fs.mkdirSync=mkdir;
    // Restore the same inode before either original material link is consumed.
    // No unlink/recreation or fabricated lstat/realpath result is used here.
    if(relocated){
      linkIdentity(parent,link,f.target);absent(staged);
      fs.renameSync(parent,staged);relocated=false;
    }
    if(movedIdentity){
      sameDirectory(moved,movedIdentity);assert.deepEqual(fs.readdirSync(moved),[]);fs.rmdirSync(moved);
    }
    if(targetIdentity){
      sameDirectory(f.target,targetIdentity);
      assert.deepEqual(fs.readdirSync(child),[]);fs.rmdirSync(child);
      assert.deepEqual(fs.readdirSync(f.target),[]);fs.rmdirSync(f.target);
    }
    attestStaged(f);absent(f.target);absent(parent);absent(moved);absent(escaped);
    assert.deepEqual(fs.readdirSync(store.dir).sort(),companyEntries,'temporary directory entries must not contaminate material inventory');
    assert.equal(JSON.stringify(store.read()),before);
    assert.deepEqual(store.captureIntakeBaseline(),baseline);
  }
}
function createRealEvidenceLink(f,id,destination,store){
  const {link,file:staged}=stagedLink(f,id),target=path.join(store.dir,'evidence.txt');
  assert.equal(target,f.target);assert.equal(store.root,f.root);
  assert.equal(destination,id==='company-entry'?path.join(store.dir,'linked-evidence'):path.join(newPath('backup-faults'),'.company','evidence.txt'));
  const evidence=fs.lstatSync(target);
  assert.equal(evidence.isFile(),true);assert.equal(evidence.isSymbolicLink(),false);assert.equal(evidence.nlink,1);
  assert.equal(fs.readFileSync(target,'utf8'),'original fixture evidence');
  absent(destination);
  const before=linkIdentity(staged,link,target);
  fs.renameSync(staged,destination);
  const after=linkIdentity(destination,link,target);
  assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);
  absent(staged);
  assert.equal(fs.readFileSync(destination,'utf8'),'original fixture evidence');
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
  const store=fixture(selectedEmptyCompanyRoot());try {
    const links=linkFixture(store);
    realDestinationScenarios(store,links);
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
    createRealEvidenceLink(links,'company-entry',path.join(store.dir,'linked-evidence'),store);
    const linked=newPath('backup-linked');
    try{assert.throws(()=>backupCompany(store,linked),/Links\/special transfer files refused/);}finally{fs.unlinkSync(path.join(store.dir,'linked-evidence'));}
    assert.equal(fs.existsSync(path.join(linked,'.company','company.sqlite')),true);
    assert.equal(fs.existsSync(path.join(linked,'manifest.json')),false);
    // The input is checked again for links before any destination is created.
    fs.unlinkSync(source);createRealEvidenceLink(links,'backup-entry',source,store);
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
