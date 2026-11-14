// Optional qualification-tool tests. Disposable synthetic DATA and real local
// files only: no company, run issuer, model allowance or Native call is minted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ISSUE18_LEDGER_FILES,encodeIssue18LedgerData,openIssue18LedgerStorage,initializeIssue18LedgerStorage,publishIssue18LedgerSlot,inspectIssue18LedgerStorage,readIssue18LedgerStorage,closeIssue18LedgerStorage} from '../tools/issue18-ledger-storage.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const onDarwin={skip:process.platform!=='darwin',timeout:60000};
function fixture(){
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-issue18-storage-'));fs.chmodSync(parent,0o700);
  const name='run',directory=path.join(parent,name);fs.mkdirSync(directory,{mode:0o700});
  const flags=fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW;
  const parentFd=fs.openSync(parent,flags),directoryFd=fs.openSync(directory,flags);
  const policy={parentFd,directoryFd,directoryName:name,pythonSha256:sha(fs.readFileSync('/usr/bin/python3')),deadlineAtMs:Date.now()+60000};
  const handles=[];
  return {parent,directory,policy,open(){const h=openIssue18LedgerStorage(policy);handles.push(h);return h;},close(){for(const h of handles)closeIssue18LedgerStorage(h);fs.closeSync(directoryFd);fs.closeSync(parentFd);fs.rmSync(parent,{recursive:true,force:true});}};
}
const manifest={fixture:'synthetic storage metadata; not a selected profile',kind:'manifest'};
const slot=(arm,phase)=>({arm,phase,fixture:'synthetic finite storage DATA; no grant'});
function initialized(f){const h=f.open();assert.equal(initializeIssue18LedgerStorage(h,manifest).status,'committed');return h;}

test('fixed storage grammar is exactly one manifest and eight original arm-role leaves',()=>{
  assert.equal(ISSUE18_LEDGER_FILES.length,9);assert.equal(new Set(ISSUE18_LEDGER_FILES).size,9);
  assert.deepEqual(ISSUE18_LEDGER_FILES.slice(1),['1-files','1-patches','3-files','3-patches'].flatMap(a=>['engineer','qa'].map(p=>`slot-${a}-${p}.json`)));
  assert.ok(Object.isFrozen(ISSUE18_LEDGER_FILES));
});
test('canonical finite DATA retains Unicode and exact LF while refusing unsafe values and hidden accessors',()=>{
  assert.equal(encodeIssue18LedgerData({z:'\ufeffé😀\r\n',a:[true,null,42]}).toString(),'{"a":[true,null,42],"z":"\ufeffé😀\\r\\n"}\n');
  for(const value of [NaN,Infinity,-0,1.1,9007199254740992,undefined,1n,'\ud800','\udc00'])assert.throws(()=>encodeIssue18LedgerData({x:value}));
  const cycle={};cycle.x=cycle;assert.throws(()=>encodeIssue18LedgerData(cycle));
  let calls=0;const getter={get x(){calls++;return 1;}};assert.throws(()=>encodeIssue18LedgerData(getter));assert.equal(calls,0);
  assert.throws(()=>encodeIssue18LedgerData({[Symbol('hidden')]:1}));assert.throws(()=>encodeIssue18LedgerData({x:[,1]}));
});
test('canonical DATA enforces exact serialized byte caps before any filesystem operation',()=>{
  const overhead=Buffer.byteLength('{"x":""}\n');assert.equal(encodeIssue18LedgerData({x:'a'.repeat(16384-overhead)},16384).length,16384);
  assert.throws(()=>encodeIssue18LedgerData({x:'a'.repeat(16385-overhead)},16384),{code:'ISSUE18_STORAGE_DATA_LIMIT'});
});
test('unsupported hosts or invalid original descriptors cannot silently use a pathname fallback',()=>{
  assert.throws(()=>openIssue18LedgerStorage({parentFd:-1,directoryFd:4,directoryName:'run',pythonSha256:'a'.repeat(64),deadlineAtMs:Date.now()+1000}),{code:process.platform==='darwin'?'ISSUE18_STORAGE_FD':'ISSUE18_STORAGE_HOST_UNSUPPORTED'});
});
test('actual optional helper publishes and reads all nine immutable leaves with finite shared accounting',onDarwin,()=>{
  const f=fixture();try{
    const h=initialized(f);
    for(const arm of ['1-files','1-patches','3-files','3-patches'])for(const phase of ['engineer','qa'])assert.equal(publishIssue18LedgerSlot(h,arm,phase,slot(arm,phase)).status,'committed');
    const report=inspectIssue18LedgerStorage(h);assert.equal(report.rows.length,9);assert.equal(report.authority_claim,false);
    assert.equal(report.accounting.issuer_metadata_reserved_bytes,32768);assert.equal(report.accounting.B_upper_bytes,196608);assert.equal(report.accounting.run_evidence_upper_bytes,80000000);
    const measured=ISSUE18_LEDGER_FILES.reduce((n,name)=>{const bytes=fs.readFileSync(path.join(f.directory,name));const s=fs.lstatSync(path.join(f.directory,name));assert.equal(s.mode&0o777,0o400);assert.equal(s.nlink,1);assert.equal(report.rows.find(r=>r.name===name).sha256,sha(bytes));return n+bytes.length;},0);
    assert.equal(report.accounting.file_payload_bytes,measured);assert.equal(report.accounting.total_reserved_or_observed_bytes,measured+32768);
    assert.deepEqual(readIssue18LedgerStorage(h,'RUN.json').value,manifest);
  }finally{f.close();}
});
test('same-session duplicate, foreign handle and rekey attempts never overwrite or add a tenth leaf',onDarwin,()=>{
  const f=fixture();try{
    const h=initialized(f);publishIssue18LedgerSlot(h,'1-files','engineer',slot('1-files','engineer'));const before=fs.readFileSync(path.join(f.directory,'slot-1-files-engineer.json'));
    assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',{replacement:true}),{code:'ISSUE18_STORAGE_SPENT'});
    assert.throws(()=>publishIssue18LedgerSlot(h,'other','engineer',{}),{code:'ISSUE18_STORAGE_SLOT'});assert.throws(()=>publishIssue18LedgerSlot({...h},'1-files','qa',{}),{code:'ISSUE18_STORAGE_FOREIGN_HANDLE'});
    assert.ok(fs.readFileSync(path.join(f.directory,'slot-1-files-engineer.json')).equals(before));assert.equal(fs.readdirSync(f.directory).length,2);
  }finally{f.close();}
});
test('cold read audits retained files but cannot adopt the original publishing session',onDarwin,()=>{
  const f=fixture();try{
    initialized(f);const cold=f.open();assert.equal(inspectIssue18LedgerStorage(cold).rows.length,1);assert.equal(readIssue18LedgerStorage(cold,'RUN.json').authority_claim,false);
    assert.throws(()=>publishIssue18LedgerSlot(cold,'1-files','engineer',{}),{code:'ISSUE18_STORAGE_SPENT'});
    assert.throws(()=>initializeIssue18LedgerStorage(cold,manifest),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});
    assert.equal(fs.readdirSync(f.directory).length,1);
  }finally{f.close();}
});
test('a partial preexisting manifest is preserved and cannot be repaired or reinitialized',onDarwin,()=>{
  const f=fixture();try{
    const file=path.join(f.directory,'RUN.json');fs.writeFileSync(file,'{"partial":',{mode:0o600});const before=fs.readFileSync(file);
    const h=f.open();assert.throws(()=>initializeIssue18LedgerStorage(h,manifest),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.ok(fs.readFileSync(file).equals(before));
    assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',{}),{code:'ISSUE18_STORAGE_SPENT'});
  }finally{f.close();}
});
test('actual symlink hardlink nonfile and changed-mode leaves hold without replacement',onDarwin,()=>{
  for(const kind of ['symlink','hardlink','directory','mode']){
    const f=fixture();try{
      const h=initialized(f),name=path.join(f.directory,'slot-1-files-engineer.json'),external=path.join(f.parent,'outside');fs.writeFileSync(external,'unchanged');
      if(kind==='symlink')fs.symlinkSync(external,name);else if(kind==='hardlink')fs.linkSync(external,name);else if(kind==='directory')fs.mkdirSync(name);else fs.writeFileSync(name,'{}\n',{mode:0o600});
      assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',slot('1-files','engineer')),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.equal(fs.readFileSync(external,'utf8'),'unchanged');
      assert.equal(fs.readdirSync(f.directory).length,2);
    }finally{f.close();}
  }
});
test('original directory FDs do not permit publishing through a replaced parent name',onDarwin,()=>{
  const f=fixture();try{
    const h=initialized(f);fs.renameSync(f.directory,path.join(f.parent,'retired'));fs.mkdirSync(f.directory,{mode:0o700});
    assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',{}),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.equal(fs.readdirSync(f.directory).length,0);assert.deepEqual(fs.readdirSync(path.join(f.parent,'retired')),['RUN.json']);
  }finally{f.close();}
});
test('changed prior payload and an unexpected tenth-name candidate poison later publication',onDarwin,()=>{
  for(const mode of ['corrupt','extra','mutate-restore-slot']){
    const f=fixture();try{
      const h=initialized(f);
      if(mode==='extra')fs.writeFileSync(path.join(f.directory,'caller-selected.json'),'{}\n');else if(mode==='corrupt'){const file=path.join(f.directory,'RUN.json');fs.chmodSync(file,0o600);fs.writeFileSync(file,'corrupt');fs.chmodSync(file,0o400);}else{
        publishIssue18LedgerSlot(h,'1-files','engineer',slot('1-files','engineer'));const file=path.join(f.directory,'slot-1-files-engineer.json'),before=fs.readFileSync(file);fs.chmodSync(file,0o600);fs.writeFileSync(file,'{}\n');fs.writeFileSync(file,before);fs.chmodSync(file,0o400);
      }
      const phase=mode==='mutate-restore-slot'?'qa':'engineer';assert.throws(()=>publishIssue18LedgerSlot(h,'1-files',phase,{}),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.equal(fs.existsSync(path.join(f.directory,`slot-1-files-${phase}.json`)),false);
    }finally{f.close();}
  }
});
test('interpreter pin, explicit descriptor policy and closed storage lifetime cannot be bypassed',onDarwin,()=>{
  const f=fixture();try{
    assert.throws(()=>openIssue18LedgerStorage({...f.policy,pythonSha256:'0'.repeat(64)}),{code:'ISSUE18_STORAGE_PROGRAM'});
    assert.throws(()=>openIssue18LedgerStorage({...f.policy,callerProgram:'anything'}),{code:'ISSUE18_STORAGE_DATA'});
    const h=f.open();closeIssue18LedgerStorage(h);assert.throws(()=>inspectIssue18LedgerStorage(h),{code:'ISSUE18_STORAGE_CLOSED_OR_EXPIRED'});assert.equal(fs.readdirSync(f.directory).length,0);
  }finally{f.close();}
});
