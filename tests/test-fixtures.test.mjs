import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
  TEST_FIXTURE_MANIFEST,normalizeTestFixture,testFixtureIdentity,
  assertTestFixtureIdentity,scratchIdentity,prepareTestFixture,
  cleanupTestFixture,fixtureEnvironmentBindings
} from '../plugins/soloco/runtime/test-fixtures.mjs';

const source=fileURLToPath(new URL('../plugins/soloco/runtime/test-fixtures.mjs',import.meta.url));
const selection=()=>({protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'});
const company='cases/transfer-faults/company';
const futureTarget=company+'/.company/evidence.txt';
const linkPaths=['fixtures/links/company-entry','fixtures/links/backup-entry'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const absent=file=>assert.throws(()=>fs.lstatSync(file),error=>error.code==='ENOENT');

function workspace(t) {
  // Resolve the host's temporary-directory alias before exercising canonical paths.
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-fixture-contract-')));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return dir;
}
function emptyScratch(t) {
  const root=path.join(workspace(t),'scratch');
  fs.mkdirSync(root);
  return root;
}
function inventory(root,relative='') {
  const entries=[];
  for(const name of fs.readdirSync(path.join(root,relative)).sort()) {
    const item=relative?relative+'/'+name:name;
    const stat=fs.lstatSync(path.join(root,item));
    const kind=stat.isSymbolicLink()?'link':stat.isDirectory()?'directory':stat.isFile()?'file':'other';
    entries.push([item,kind]);
    if(kind==='directory')entries.push(...inventory(root,item));
  }
  return entries;
}
const preparedInventory=()=>[
  ['cases','directory'],['cases/transfer-faults','directory'],[company,'directory'],
  ['fixtures','directory'],['fixtures/links','directory'],
  ...linkPaths.map(relative=>[relative,'link']),['fixtures/manifest.json','file']
].sort(([a],[b])=>a.localeCompare(b));
const sortedInventory=root=>inventory(root).sort(([a],[b])=>a.localeCompare(b));

test('the optional selector is closed, immutable and cannot supply paths, targets or code',t=>{
  assert.equal(normalizeTestFixture(undefined),null);
  assert.equal(testFixtureIdentity(undefined),null);
  const requested=selection(),before=structuredClone(requested),normalized=normalizeTestFixture(requested);
  assert.deepEqual(normalized,before);
  assert.deepEqual(requested,before);
  assert.notEqual(normalized,requested);
  assert.ok(Object.isFrozen(normalized));
  requested.factory='changed after selection';
  assert.deepEqual(normalized,selection());

  const root=workspace(t),uncreated=path.join(root,'must-not-be-created');
  let getterCalls=0;
  const accessor={...selection()};
  Object.defineProperty(accessor,'factory',{enumerable:true,get(){getterCalls++;throw Error('selector getter executed');}});
  const hidden={...selection()};
  Object.defineProperty(hidden,'protocol',{value:hidden.protocol,enumerable:false});
  const invalid=[
    null,[],42,'scratch-fixture-contract-v1',Object.create(selection()),
    Object.assign(Object.create({inherited:true}),selection()),accessor,hidden,
    {...selection(),[Symbol('extra')]:true},
    {...selection(),protocol:'unknown'}, {...selection(),factory:'unknown'},
    {protocol:selection().protocol},{factory:selection().factory},{}
  ];
  for(const field of ['path','target','command','content'])invalid.push({...selection(),[field]:uncreated});
  for(const value of invalid)assert.throws(()=>normalizeTestFixture(value));
  assert.equal(getterCalls,0);
  absent(uncreated);
  assert.deepEqual(fs.readdirSync(root),[]);
});

test('identity commits to current factory bytes and requires every exact commitment before staging',t=>{
  const identity=testFixtureIdentity(selection());
  assert.deepEqual(identity.selection,selection());
  assert.equal(identity.factory_source_sha256,sha(fs.readFileSync(source)));
  assert.match(identity.template_sha256,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(identity));
  assert.ok(Object.isFrozen(identity.selection));
  assert.deepEqual(assertTestFixtureIdentity(structuredClone(identity)),identity);

  let getterCalls=0;
  const accessor=structuredClone(identity);
  Object.defineProperty(accessor,'template_sha256',{enumerable:true,get(){getterCalls++;throw Error('identity getter executed');}});
  const invalid=[null,undefined,[],{},accessor,Object.assign(Object.create({inherited:true}),identity)];
  for(const field of ['selection','template_sha256','factory_source_sha256']){
    const missing=structuredClone(identity);delete missing[field];invalid.push(missing);
  }
  invalid.push(
    {...identity,template_sha256:sha('other template')},
    {...identity,factory_source_sha256:sha('other source')},
    {...identity,selection:null},
    {...identity,selection:{...selection(),factory:'other'}},
    {...identity,selection:{...selection(),path:'/unrequested'}},
    {...identity,extra:'uncommitted'},
    {...identity,[Symbol('extra')]:true}
  );
  const root=emptyScratch(t);
  for(const value of invalid){
    assert.throws(()=>assertTestFixtureIdentity(value));
    assert.throws(()=>prepareTestFixture(root,value));
    assert.deepEqual(fs.readdirSync(root),[],'invalid identity must fail before filesystem staging');
  }
  assert.equal(getterCalls,0);
});

test('setup contains only the fixed directories, two real dangling links and a verified bounded manifest',t=>{
  const root=emptyScratch(t),identity=testFixtureIdentity(selection());
  const before=fs.lstatSync(root,{bigint:true});
  assert.deepEqual(fs.readdirSync(root),[]);
  const setup=prepareTestFixture(root,identity);
  assert.deepEqual(sortedInventory(root),preparedInventory());
  assert.deepEqual(fs.readdirSync(path.join(root,company)),[]);
  absent(path.join(root,futureTarget));
  assert.equal(setup.protocol,'scratch-fixture-setup-v1');
  assert.deepEqual(setup.identity,identity);
  assert.deepEqual(setup.scratch,{path:root,dev:String(before.dev),ino:String(before.ino)});
  assert.deepEqual(scratchIdentity(root),setup.scratch);
  assert.equal(setup.company_root,company);
  assert.equal(setup.target_relative_path,futureTarget);
  assert.equal(setup.target_absent_at_setup,true);
  assert.equal(setup.company_root_empty_at_setup,true);
  assert.equal(setup.prepared_before_child,true);
  assert.equal(setup.manifest_path,path.join(root,'fixtures/manifest.json'));
  assert.equal(TEST_FIXTURE_MANIFEST,'fixtures/manifest.json');

  const bytes=fs.readFileSync(setup.manifest_path),manifest=JSON.parse(bytes);
  assert.ok(bytes.length<=4096);
  assert.equal(setup.manifest_bytes,bytes.length);
  assert.equal(setup.manifest_sha256,sha(bytes));
  assert.deepEqual(manifest.identity,identity);
  assert.equal(manifest.scratch_root,root);
  assert.equal(manifest.protocol,selection().protocol);
  assert.equal(manifest.factory,selection().factory);
  assert.equal(manifest.company_root,company);
  assert.equal(manifest.target_relative_path,futureTarget);
  assert.equal(manifest.target_absent_at_setup,true);
  assert.deepEqual(manifest.links,setup.links);
  assert.deepEqual(setup.links.map(link=>link.id),['company-entry','backup-entry']);
  assert.deepEqual(setup.links.map(link=>link.staged_relative_path),linkPaths);
  for(const link of setup.links){
    const staged=path.join(root,link.staged_relative_path),stat=fs.lstatSync(staged,{bigint:true});
    assert.equal(stat.isSymbolicLink(),true);
    assert.equal(link.symbolic_link,true);
    assert.equal(link.dev,String(stat.dev));
    assert.equal(link.ino,String(stat.ino));
    assert.equal(link.target_relative_path,futureTarget);
    assert.equal(link.target_absent_at_setup,true);
    assert.equal(link.readlink_target,path.join(root,futureTarget));
    assert.equal(fs.readlinkSync(staged),link.readlink_target);
    assert.throws(()=>fs.statSync(staged),error=>error.code==='ENOENT');
  }
  const logicalTemplate={
    protocol:manifest.protocol,factory:manifest.factory,company_root:manifest.company_root,
    target_relative_path:manifest.target_relative_path,target_absent_at_setup:manifest.target_absent_at_setup,
    links:manifest.links.map(({id,staged_relative_path,target_relative_path,target_absent_at_setup})=>({id,staged_relative_path,target_relative_path,target_absent_at_setup}))
  };
  assert.equal(identity.template_sha256,sha(JSON.stringify(logicalTemplate)));
  assert.deepEqual(cleanupTestFixture(root,setup.scratch),{status:'confirmed',root_absent:true});
  absent(root);
});

test('both links can be consumed by real renames without requiring their staged inodes after the run',t=>{
  const root=emptyScratch(t),setup=prepareTestFixture(root,testFixtureIdentity(selection()));
  const target=path.join(root,futureTarget);
  fs.mkdirSync(path.dirname(target));
  fs.writeFileSync(target,'real evidence written after setup');
  const consumed=path.join(root,'consumed');fs.mkdirSync(consumed);
  for(const link of setup.links){
    const staged=path.join(root,link.staged_relative_path),destination=path.join(consumed,link.id);
    const before=fs.lstatSync(staged,{bigint:true});
    fs.renameSync(staged,destination);
    absent(staged);
    const after=fs.lstatSync(destination,{bigint:true});
    assert.equal(after.isSymbolicLink(),true);
    assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);
    assert.equal(String(after.dev),link.dev);assert.equal(String(after.ino),link.ino);
    assert.equal(fs.readlinkSync(destination),target);
    assert.equal(fs.readFileSync(destination,'utf8'),'real evidence written after setup');
  }
  assert.deepEqual(fs.readdirSync(path.join(root,'fixtures/links')),[]);
  assert.deepEqual(cleanupTestFixture(root,setup.scratch),{status:'confirmed',root_absent:true});
  absent(root);
});

test('setup refuses nonempty, linked and noncanonical scratch paths without changing their contents',t=>{
  const base=workspace(t),identity=testFixtureIdentity(selection());
  const nonempty=path.join(base,'nonempty');fs.mkdirSync(nonempty);
  fs.writeFileSync(path.join(nonempty,'keep.txt'),'keep existing data');
  assert.throws(()=>prepareTestFixture(nonempty,identity),/empty scratch/);
  assert.deepEqual(fs.readdirSync(nonempty),['keep.txt']);
  assert.equal(fs.readFileSync(path.join(nonempty,'keep.txt'),'utf8'),'keep existing data');
  const real=path.join(base,'real');fs.mkdirSync(real);
  const alias=path.join(base,'alias');fs.symlinkSync(real,alias,'dir');
  const file=path.join(base,'file');fs.writeFileSync(file,'ordinary file');
  const nested=path.join(real,'nested');fs.mkdirSync(nested);
  const rejected=[alias,path.join(alias,'nested'),file,'relative/scratch',real+'/',real+'/.',real+'/../real'];
  for(const scratch of rejected){
    assert.throws(()=>scratchIdentity(scratch));
    assert.throws(()=>prepareTestFixture(scratch,identity));
  }
  assert.deepEqual(fs.readdirSync(real),['nested']);
  assert.deepEqual(fs.readdirSync(nested),[]);
  assert.equal(fs.readlinkSync(alias),real);
  const missing=path.join(base,'missing');
  assert.throws(()=>prepareTestFixture(missing,identity),error=>error.code==='ENOENT');
  absent(missing);
});

test('a real manifest byte-limit failure retains partial staging for guarded cleanup',t=>{
  // Quotes are legal POSIX path characters. JSON escaping reaches the manifest
  // limit while keeping every actual filesystem path below macOS PATH_MAX.
  let parent=workspace(t);
  for(let index=0;index<4;index++){
    parent=path.join(parent,'quoted-'+ '"'.repeat(120));fs.mkdirSync(parent);
  }
  const root=path.join(parent,'scratch');fs.mkdirSync(root);
  const owned=scratchIdentity(root);
  assert.throws(()=>prepareTestFixture(root,testFixtureIdentity(selection())),/manifest exceeds 4096 bytes/);
  const expected=preparedInventory().filter(([,kind])=>kind!=='file');
  assert.deepEqual(sortedInventory(root),expected);
  absent(path.join(root,TEST_FIXTURE_MANIFEST));
  absent(path.join(root,futureTarget));
  assert.deepEqual(fs.readdirSync(path.join(root,company)),[]);
  for(const relative of linkPaths){
    const link=path.join(root,relative);
    assert.equal(fs.lstatSync(link).isSymbolicLink(),true);
    assert.equal(fs.readlinkSync(link),path.join(root,futureTarget));
  }
  assert.deepEqual(cleanupTestFixture(root,owned),{status:'confirmed',root_absent:true});
  absent(root);
});

test('cleanup refuses absent or changed ownership commitments and leaves the actual root intact',t=>{
  const root=emptyScratch(t),owned=scratchIdentity(root);
  const marker=path.join(root,'keep.txt');fs.writeFileSync(marker,'owned fixture data');
  for(const wrong of [undefined,null,{...owned,path:root+'-other'},{...owned,dev:'wrong'},{...owned,ino:'wrong'}]){
    const result=cleanupTestFixture(root,wrong);
    assert.equal(result.status,'failed');assert.equal(result.root_absent,false);
    assert.match(result.error,/identity changed/);
    assert.equal(fs.readFileSync(marker,'utf8'),'owned fixture data');
  }
  assert.deepEqual(cleanupTestFixture(root,owned),{status:'confirmed',root_absent:true});
  const repeated=cleanupTestFixture(root,owned);
  assert.equal(repeated.status,'failed');assert.equal(repeated.root_absent,true);
  assert.match(repeated.error,/ENOENT/);
});

test('cleanup refuses a directory replacement even when its path is unchanged',t=>{
  const root=emptyScratch(t),owned=scratchIdentity(root),retired=root+'-retired';
  fs.writeFileSync(path.join(root,'original.txt'),'original directory');
  fs.renameSync(root,retired);
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'foreign.txt'),'replacement directory');
  assert.notEqual(String(fs.lstatSync(root,{bigint:true}).ino),owned.ino);
  const result=cleanupTestFixture(root,owned);
  assert.equal(result.status,'failed');assert.equal(result.root_absent,false);
  assert.match(result.error,/identity changed/);
  assert.equal(fs.readFileSync(path.join(root,'foreign.txt'),'utf8'),'replacement directory');
  assert.equal(fs.readFileSync(path.join(retired,'original.txt'),'utf8'),'original directory');
});

test('cleanup refuses a symlink replacement and retains the foreign target',t=>{
  const root=emptyScratch(t),owned=scratchIdentity(root),retired=root+'-retired';
  fs.renameSync(root,retired);
  const foreign=path.join(path.dirname(root),'foreign');fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign,'keep.txt'),'foreign data');
  fs.symlinkSync(foreign,root,'dir');
  const result=cleanupTestFixture(root,owned);
  assert.equal(result.status,'failed');assert.equal(result.root_absent,false);
  assert.match(result.error,/real canonical directory/);
  assert.equal(fs.lstatSync(root).isSymbolicLink(),true);
  assert.equal(fs.readlinkSync(root),foreign);
  assert.equal(fs.readFileSync(path.join(foreign,'keep.txt'),'utf8'),'foreign data');
  assert.equal(fs.lstatSync(retired).isDirectory(),true);
});

test('environment bindings explicitly describe per-run values rather than substituting invented paths or hashes',()=>{
  const identity=testFixtureIdentity(selection()),recipe=fixtureEnvironmentBindings(identity);
  assert.deepEqual(recipe,{
    SOLOCO_TEST_FIXTURE_MANIFEST:{scratch_relative:'fixtures/manifest.json'},
    SOLOCO_TEST_FIXTURE_MANIFEST_SHA256:{runtime_result:'test_fixture.setup.manifest_sha256'}
  });
  recipe.SOLOCO_TEST_FIXTURE_MANIFEST.scratch_relative='changed by caller';
  assert.equal(fixtureEnvironmentBindings(identity).SOLOCO_TEST_FIXTURE_MANIFEST.scratch_relative,TEST_FIXTURE_MANIFEST);
  assert.throws(()=>fixtureEnvironmentBindings({...identity,factory_source_sha256:sha('stale')}));
  assert.throws(()=>fixtureEnvironmentBindings(undefined));
});

test('a disposable factory copy detects in-place source drift and rejects old commitments after reload',async t=>{
  const base=workspace(t),copy=path.join(base,'factory-copy.mjs');
  fs.copyFileSync(source,copy);
  const url=pathToFileURL(copy).href;
  const original=await import(url);
  const identity=original.testFixtureIdentity(selection());
  assert.equal(identity.factory_source_sha256,sha(fs.readFileSync(copy)));
  assert.deepEqual(original.assertTestFixtureIdentity(identity),identity);
  fs.appendFileSync(copy,'\n// Disposable source drift fixture.\n');
  assert.notEqual(sha(fs.readFileSync(copy)),identity.factory_source_sha256);
  assert.throws(()=>original.testFixtureIdentity(selection()),/source changed/);
  assert.throws(()=>original.assertTestFixtureIdentity(identity),/source changed/);
  const root=path.join(base,'scratch');fs.mkdirSync(root);
  assert.throws(()=>original.prepareTestFixture(root,identity),/source changed/);
  assert.deepEqual(fs.readdirSync(root),[]);
  const reloaded=await import(url+'?reloaded-after-change');
  const next=reloaded.testFixtureIdentity(selection());
  assert.equal(next.factory_source_sha256,sha(fs.readFileSync(copy)));
  assert.notEqual(next.factory_source_sha256,identity.factory_source_sha256);
  assert.equal(next.template_sha256,identity.template_sha256);
  assert.throws(()=>reloaded.assertTestFixtureIdentity(identity),/does not match/);
  assert.deepEqual(reloaded.assertTestFixtureIdentity(next),next);
});

test('factory import cannot later bind changed disk bytes before its first identity resolution',async t=>{
  const base=workspace(t),copy=path.join(base,'factory-before-first-resolution.mjs');
  fs.copyFileSync(source,copy);
  const original=await import(pathToFileURL(copy).href);
  fs.appendFileSync(copy,'\n// Changed after module evaluation, before first resolution.\n');
  assert.throws(()=>original.testFixtureIdentity(selection()),/source changed/);
  const reloaded=await import(pathToFileURL(copy).href+'?qualified-reload');
  assert.equal(reloaded.testFixtureIdentity(selection()).factory_source_sha256,sha(fs.readFileSync(copy)));
});
