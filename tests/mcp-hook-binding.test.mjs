// Real disposable hook records with SYNTHETIC private HOST metadata. These
// filesystem/transport mechanics tests establish no installed-host identity,
// native qualification, company acceptance, provider access or permissions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bind,peerCallerActor} from '../plugins/soloco/runtime/engine.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';

const ROOT='018f22aa-bb1c-7def-8123-123456789abc';
const CHILD='018f22aa-bb1c-7def-8123-123456789abd';
const code=expected=>error=>error?.code===expected;
const HOOK='PEER_CURRENT_HOOK_REQUIRED';
function fixture(t){
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-mcp-hook-binding-')));
  const root=path.join(temporary,'attached'),data=path.join(temporary,'plugin-data');
  fs.mkdirSync(root);fs.mkdirSync(data);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
  t.after(()=>{
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    fs.rmSync(temporary,{recursive:true,force:true});
  });
  bind(root,ROOT,'codex');
  const bindings=path.join(data,'bindings'),names=fs.readdirSync(bindings);
  assert.equal(names.length,1);const file=path.join(bindings,names[0]);
  const original=fs.readFileSync(file),record=JSON.parse(original);
  const actor=()=>runWithMcpHostContext('codex',{threadId:ROOT,sessionId:ROOT},()=>peerCallerActor({root,session_id:ROOT},'codex'));
  return {temporary,root,data,bindings,file,original,record,actor,refresh:()=>bind(root,ROOT,'codex')};
}
async function accepted(f){
  const actor=await f.actor();assert.deepEqual(actor,{host:'codex',session_id:ROOT,native_id:ROOT});assert(Object.isFrozen(actor));
}

// Mutate a real file namespace only after the production guard has opened its
// original descriptor. Always perform the actual descriptor read afterward.
async function duringRead(f,mutate,invoke){
  const original=fs.readSync,identity=fs.statSync(f.file);let mutations=0,totalRead=0,maxRequested=0;
  fs.readSync=function(fd,buffer,offset,length,position){
    const stat=fs.fstatSync(fd);
    if(stat.dev===identity.dev&&stat.ino===identity.ino){
      if(mutations===0){mutations++;mutate();}
      maxRequested=Math.max(maxRequested,length);
      const count=Reflect.apply(original,this,[fd,buffer,offset,length,position]);totalRead+=count;return count;
    }
    return Reflect.apply(original,this,arguments);
  };
  try{await invoke();}finally{fs.readSync=original;}
  assert.equal(mutations,1,'The on-disk mutation must occur at the actual original-FD read');
  return {totalRead,maxRequested};
}

test('an actual current generated hook record corroborates the exact synthetic root caller',async t=>{
  const f=fixture(t);await accepted(f);
  assert.equal(fs.existsSync(path.join(f.root,'.company')),false);
  assert.equal(f.record.root,f.root);assert.equal(f.record.data_directory,f.data);
  f.refresh();await accepted(f);
});

test('missing or descendant HOST context is denied before opening hook records',async t=>{
  const f=fixture(t),original=fs.openSync;let opens=0;
  fs.openSync=function(){opens++;assert.fail('Unqualified caller must not open a hook record');};
  try{
    for(const metadata of [undefined,{threadId:CHILD,sessionId:ROOT}])await assert.rejects(
      runWithMcpHostContext('codex',metadata,()=>peerCallerActor({root:f.root,session_id:ROOT},'codex')),
      code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  }finally{fs.openSync=original;}
  assert.equal(opens,0);await accepted(f);
});

test('file, bindings-directory and plugin-data symlinks cannot substitute hook provenance',async t=>{
  for(const target of ['file','bindings','data'])await t.test(target,async t=>{
    const f=fixture(t),selected=f[target],saved=path.join(f.temporary,'original-'+target);
    fs.renameSync(selected,saved);fs.symlinkSync(saved,selected,target==='file'?'file':'dir');
    await assert.rejects(f.actor(),code(HOOK));
    fs.unlinkSync(selected);fs.renameSync(saved,selected);f.refresh();await accepted(f);
  });
});

test('a hardlinked hook record is rejected until a normal single-link binding is restored',async t=>{
  const f=fixture(t),alias=path.join(f.temporary,'hook-alias.json');fs.linkSync(f.file,alias);
  assert.equal(fs.statSync(f.file).nlink,2);await assert.rejects(f.actor(),code(HOOK));
  fs.unlinkSync(alias);f.refresh();await accepted(f);
});

test('growth during the actual read stays bounded even when the enlarged JSON is still valid',async t=>{
  const f=fixture(t),initialSize=fs.statSync(f.file).size;
  const observation=await duringRead(f,()=>fs.appendFileSync(f.file,' '.repeat(131072)),()=>assert.rejects(f.actor(),code(HOOK)));
  assert(fs.statSync(f.file).size>65536);
  // A path read after an earlier small lstat would accept these same fields
  // while reading the entire oversized file. The guarded read must not do so.
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file,'utf8')),f.record);
  assert(observation.maxRequested<=initialSize+1);assert(observation.totalRead<=initialSize+1);
  f.refresh();assert(fs.statSync(f.file).size<=65536);await accepted(f);
});

test('identical-byte named replacement during a held-FD read is rejected',async t=>{
  const f=fixture(t),before=fs.statSync(f.file),replacement=path.join(f.temporary,'replacement.json');
  fs.writeFileSync(replacement,f.original,{flag:'wx',mode:0o600});
  await duringRead(f,()=>fs.renameSync(replacement,f.file),()=>assert.rejects(f.actor(),code(HOOK)));
  assert.notEqual(fs.statSync(f.file).ino,before.ino);assert.deepEqual(fs.readFileSync(f.file),f.original);
  f.refresh();await accepted(f);
});

test('replacing plugin-data during a read cannot reuse its original bindings directory and file',async t=>{
  const f=fixture(t),before=fs.statSync(f.file),directoryBefore=fs.statSync(f.bindings),saved=path.join(f.temporary,'displaced-plugin-data');
  await duringRead(f,()=>{
    fs.renameSync(f.data,saved);fs.mkdirSync(f.data);
    fs.renameSync(path.join(saved,'bindings'),f.bindings);
  },()=>assert.rejects(f.actor(),code(HOOK)));
  // File bytes and both file/bindings inodes survived. The containing data
  // directory changed, so file-only provenance checks would miss this swap.
  assert.equal(fs.statSync(f.file).ino,before.ino);assert.equal(fs.statSync(f.bindings).ino,directoryBefore.ino);
  assert.deepEqual(fs.readFileSync(f.file),f.original);f.refresh();await accepted(f);
});

test('a malformed or already oversized record cannot establish current hook evidence',async t=>{
  for(const contents of ['{invalid json',JSON.stringify({padding:'x'.repeat(65537)})])await t.test(contents.startsWith('{invalid')?'malformed':'oversized',async t=>{
    const f=fixture(t);fs.writeFileSync(f.file,contents);await assert.rejects(f.actor(),code(HOOK));
    fs.unlinkSync(f.file);f.refresh();await accepted(f);
  });
});

test('stale hook fields remain held until refreshed through the actual binding producer',async t=>{
  for(const [field,value]of [['root','/synthetic-other-root'],['host','claude'],['session_id',CHILD],['plugin_version','stale-version'],['plugin_root','/synthetic-other-package'],['data_directory','/synthetic-other-data'],['at','invalid-date']])await t.test(field,async t=>{
    const f=fixture(t);fs.writeFileSync(f.file,JSON.stringify({...f.record,[field]:value}));
    await assert.rejects(f.actor(),code(HOOK));f.refresh();await accepted(f);
  });
});
