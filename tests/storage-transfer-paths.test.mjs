import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';

const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'transfer-paths-')));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
let sequence=0;
function fixture(){
  const directory=path.join(temporary,String(++sequence));fs.mkdirSync(directory);
  const root=path.join(directory,'company');fs.mkdirSync(root);
  const store=new Store(root,true);
  store.transaction('fictional.paths',()=>({id:'fictional-path-contract',schema:2,paused:true,
    owner:{host:'fictional',session_id:'fixture-only',epoch:1},records:{},jobs:{},notices:[]}));
  return {directory,store};
}
function withMethod(object,key,replacement,run){
  const original=object[key];object[key]=replacement(original);
  try{return run();}finally{object[key]=original;}
}

test('canonical nested transfer destinations preserve real database state',()=>{
  const {directory,store}=fixture();let restored;
  try{
    const before=JSON.stringify(store.read()),backup=path.join(directory,'nested','backup');
    const manifest=backupCompany(store,backup);
    assert.ok(manifest.files.some(file=>file.path==='.company/company.sqlite'));
    const destination=path.join(directory,'other','restored');
    assert.equal(restoreCompany(backup,destination).restored,true);
    restored=new Store(destination);assert.equal(JSON.stringify(restored.read()),before);
  }finally{restored?.close();store.close();}
});

test('raw parent components are refused before normalization even for an ordinary directory',()=>{
  const {directory,store}=fixture();
  try{
    fs.mkdirSync(path.join(directory,'plain'));
    for(const spelling of [directory+'/plain/../backup',directory+'/missing/../backup']){
      assert.throws(()=>backupCompany(store,spelling),/Parent traversal/);
      assert.equal(fs.existsSync(path.join(directory,'backup')),false);
    }
  }finally{store.close();}
});

test('dot, repeated separator and trailing destination spellings are refused without output',()=>{
  const {directory,store}=fixture();
  try{
    for(const spelling of [directory+'/./backup',directory+'//backup',directory+'/backup/']){
      assert.throws(()=>backupCompany(store,spelling),/Canonical absolute/);
      assert.equal(fs.existsSync(path.join(directory,'backup')),false);
    }
  }finally{store.close();}
});

test('an existing target is never overwritten and a non-directory ancestor propagates its error',()=>{
  const {directory,store}=fixture();
  try{
    const destination=path.join(directory,'existing');fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination,'sentinel'),'retain me');
    assert.throws(()=>backupCompany(store,destination),/new absolute directory/);
    assert.equal(fs.readFileSync(path.join(destination,'sentinel'),'utf8'),'retain me');
    const file=path.join(directory,'file');fs.writeFileSync(file,'ordinary file');
    assert.throws(()=>backupCompany(store,path.join(file,'backup')),error=>error.code==='ENOTDIR');
    assert.equal(fs.readFileSync(file,'utf8'),'ordinary file');
  }finally{store.close();}
});

test('lstat access, loop and I/O failures are propagated rather than treated as absent parents',()=>{
  const {directory,store}=fixture();
  try{
    for(const code of ['EACCES','ERR_ACCESS_DENIED','ELOOP','EIO']){
      const destination=path.join(directory,'failure-'+code),failure=Object.assign(Error('injected '+code),{code});
      withMethod(fs,'lstatSync',original=>function(file,...args){
        if(file===destination)throw failure;return Reflect.apply(original,this,[file,...args]);
      },()=>assert.throws(()=>backupCompany(store,destination),error=>error===failure));
      assert.equal(fs.existsSync(destination),false);
    }
  }finally{store.close();}
});

test('native realpath errors and changed canonical prefix spellings cannot create a destination',()=>{
  const {directory,store}=fixture();
  try{
    const destination=path.join(directory,'backup'),failure=Object.assign(Error('injected realpath failure'),{code:'EIO'});
    withMethod(fs.realpathSync,'native',original=>function(file,...args){
      if(file===directory)throw failure;return Reflect.apply(original,this,[file,...args]);
    },()=>assert.throws(()=>backupCompany(store,destination),error=>error===failure));
    withMethod(fs.realpathSync,'native',original=>function(file,...args){
      if(file===directory)return directory+'-different';return Reflect.apply(original,this,[file,...args]);
    },()=>assert.throws(()=>backupCompany(store,destination),/noncanonical transfer ancestor/));
    assert.equal(fs.existsSync(destination),false);
  }finally{store.close();}
});

test('a concurrent final mkdir reports EEXIST and retains the other writer output',()=>{
  const {directory,store}=fixture();
  try{
    const destination=path.join(directory,'raced');let injected=0;
    withMethod(fs,'mkdirSync',original=>function(file,options){
      if(file===destination&&!injected++){
        Reflect.apply(original,this,[file,options]);fs.writeFileSync(path.join(file,'sentinel'),'other writer');
      }
      return Reflect.apply(original,this,[file,options]);
    },()=>assert.throws(()=>backupCompany(store,destination),error=>error.code==='EEXIST'));
    assert.equal(injected,1);
    assert.equal(fs.readFileSync(path.join(destination,'sentinel'),'utf8'),'other writer');
    assert.equal(fs.existsSync(path.join(destination,'.company')),false);
  }finally{store.close();}
});

test('errors after creating missing parents retain truthful partial output',()=>{
  const {directory,store}=fixture();
  try{
    const parent=path.join(directory,'created-parent'),destination=path.join(parent,'backup');
    const failure=Object.assign(Error('injected second-prefix check failure'),{code:'EACCES'});
    withMethod(fs.realpathSync,'native',original=>function(file,...args){
      if(file===parent)throw failure;return Reflect.apply(original,this,[file,...args]);
    },()=>assert.throws(()=>backupCompany(store,destination),error=>error===failure));
    assert.equal(fs.statSync(parent).isDirectory(),true);
    assert.equal(fs.existsSync(destination),false);
  }finally{store.close();}
});
