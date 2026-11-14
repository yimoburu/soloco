// Optional qualification-tool tests. Disposable synthetic DATA and real local
// files only: no company, run issuer, model allowance or Native call is minted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {ISSUE18_LEDGER_FILES,encodeIssue18LedgerData,openIssue18LedgerStorage,initializeIssue18LedgerStorage,publishIssue18LedgerSlot,inspectIssue18LedgerStorage,readIssue18LedgerStorage,closeIssue18LedgerStorage} from '../tools/issue18-ledger-storage.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const onDarwin={skip:process.platform!=='darwin',timeout:60000};
function fixturePythonSha(){
  const fd=fs.openSync('/usr/bin/python3',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),end=Date.now()+10000;
  try{
    const before=fs.fstatSync(fd,{bigint:true});assert.ok(before.isFile()&&before.nlink>0n&&before.uid===0n&&(before.mode&0o022n)===0n&&before.size>0n&&before.size<=150000000n);
    const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);let offset=0;
    while(offset<Number(before.size)){assert.ok(Date.now()<end,'bounded fixture interpreter hash');const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);assert.ok(n>0);digest.update(buffer.subarray(0,n));offset+=n;}
    const after=fs.fstatSync(fd,{bigint:true});for(const k of ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'])assert.equal(after[k],before[k]);assert.ok(Date.now()<end);return digest.digest('hex');
  }finally{fs.closeSync(fd);}
}
function fixture(){
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-issue18-storage-'));fs.chmodSync(parent,0o700);
  const handles=[],fds=[];let complete=false;
  const preserved=reason=>process.stderr.write(JSON.stringify({fixture_preserved:parent,reason})+'\n');
  try{
    const name='run',directory=path.join(parent,name);fs.mkdirSync(directory,{mode:0o700});
    const flags=fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW;
    const parentFd=fs.openSync(parent,flags);fds.push(parentFd);const directoryFd=fs.openSync(directory,flags);fds.push(directoryFd);
    const policy={parentFd,directoryFd,directoryName:name,pythonSha256:fixturePythonSha(),deadlineAtMs:Date.now()+60000};
    return {parent,directory,policy,open(){const h=openIssue18LedgerStorage(policy);handles.push(h);return h;},done(){complete=true;},close({preserve=false}={}){
      const errors=[];for(const h of handles)try{closeIssue18LedgerStorage(h);}catch(e){errors.push(e);}for(const fd of fds.reverse())try{fs.closeSync(fd);}catch(e){errors.push(e);}
      if(!complete||preserve||errors.length){preserved(errors.length?'descriptor cleanup failed':'unexpected qualification failure or uncertain child cleanup');if(errors.length)throw new AggregateError(errors,'Fixture preserved after cleanup failure');return;}
      try{fs.rmSync(parent,{recursive:true,force:true});}catch(e){preserved('completed case cleanup failed; cleanup may be partial');throw e;}
    }};
  }catch(e){for(const fd of fds.reverse())try{fs.closeSync(fd);}catch{}preserved('fixture setup failed');throw e;}
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
    f.done();
  }finally{f.close();}
});
test('same-session duplicate, foreign handle and rekey attempts never overwrite or add a tenth leaf',onDarwin,()=>{
  const f=fixture();try{
    const h=initialized(f);publishIssue18LedgerSlot(h,'1-files','engineer',slot('1-files','engineer'));const before=fs.readFileSync(path.join(f.directory,'slot-1-files-engineer.json'));
    assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',{replacement:true}),{code:'ISSUE18_STORAGE_SPENT'});
    assert.throws(()=>publishIssue18LedgerSlot(h,'other','engineer',{}),{code:'ISSUE18_STORAGE_SLOT'});assert.throws(()=>publishIssue18LedgerSlot({...h},'1-files','qa',{}),{code:'ISSUE18_STORAGE_FOREIGN_HANDLE'});
    assert.ok(fs.readFileSync(path.join(f.directory,'slot-1-files-engineer.json')).equals(before));assert.equal(fs.readdirSync(f.directory).length,2);
    f.done();
  }finally{f.close();}
});
test('cold read audits retained files but cannot adopt the original publishing session',onDarwin,()=>{
  const f=fixture();try{
    initialized(f);const cold=f.open();assert.equal(inspectIssue18LedgerStorage(cold).rows.length,1);assert.equal(readIssue18LedgerStorage(cold,'RUN.json').authority_claim,false);
    assert.throws(()=>publishIssue18LedgerSlot(cold,'1-files','engineer',{}),{code:'ISSUE18_STORAGE_SPENT'});
    assert.throws(()=>initializeIssue18LedgerStorage(cold,manifest),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});
    assert.equal(fs.readdirSync(f.directory).length,1);
    f.done();
  }finally{f.close();}
});
test('a partial preexisting manifest is preserved and cannot be repaired or reinitialized',onDarwin,()=>{
  const f=fixture();try{
    const file=path.join(f.directory,'RUN.json');fs.writeFileSync(file,'{"partial":',{mode:0o600});const before=fs.readFileSync(file);
    const h=f.open();assert.throws(()=>initializeIssue18LedgerStorage(h,manifest),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.ok(fs.readFileSync(file).equals(before));
    assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',{}),{code:'ISSUE18_STORAGE_SPENT'});
    f.done();
  }finally{f.close();}
});
test('actual symlink hardlink nonfile and changed-mode leaves hold without replacement',onDarwin,()=>{
  for(const kind of ['symlink','hardlink','directory','mode']){
    const f=fixture();try{
      const h=initialized(f),name=path.join(f.directory,'slot-1-files-engineer.json'),external=path.join(f.parent,'outside');fs.writeFileSync(external,'unchanged');
      if(kind==='symlink')fs.symlinkSync(external,name);else if(kind==='hardlink')fs.linkSync(external,name);else if(kind==='directory')fs.mkdirSync(name);else fs.writeFileSync(name,'{}\n',{mode:0o600});
      assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',slot('1-files','engineer')),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.equal(fs.readFileSync(external,'utf8'),'unchanged');
      assert.equal(fs.readdirSync(f.directory).length,2);
      f.done();
    }finally{f.close();}
  }
});
test('original directory FDs do not permit publishing through a replaced parent name',onDarwin,()=>{
  const f=fixture();try{
    const h=initialized(f);fs.renameSync(f.directory,path.join(f.parent,'retired'));fs.mkdirSync(f.directory,{mode:0o700});
    assert.throws(()=>publishIssue18LedgerSlot(h,'1-files','engineer',{}),{code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN'});assert.equal(fs.readdirSync(f.directory).length,0);assert.deepEqual(fs.readdirSync(path.join(f.parent,'retired')),['RUN.json']);
    f.done();
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
      f.done();
    }finally{f.close();}
  }
});
test('interpreter pin, explicit descriptor policy and closed storage lifetime cannot be bypassed',onDarwin,()=>{
  const f=fixture();try{
    assert.throws(()=>openIssue18LedgerStorage({...f.policy,pythonSha256:'0'.repeat(64)}),{code:'ISSUE18_STORAGE_PROGRAM'});
    assert.throws(()=>openIssue18LedgerStorage({...f.policy,callerProgram:'anything'}),{code:'ISSUE18_STORAGE_DATA'});
    const h=f.open();closeIssue18LedgerStorage(h);assert.throws(()=>inspectIssue18LedgerStorage(h),{code:'ISSUE18_STORAGE_CLOSED_OR_EXPIRED'});assert.equal(fs.readdirSync(f.directory).length,0);
    f.done();
  }finally{f.close();}
});

const contenderSource=`
import {openIssue18LedgerStorage,initializeIssue18LedgerStorage,closeIssue18LedgerStorage} from ${JSON.stringify(new URL('../tools/issue18-ledger-storage.mjs',import.meta.url).href)};
const supplied=JSON.parse(process.argv[1]),tag=process.argv[2];
const handle=openIssue18LedgerStorage({...supplied,parentFd:3,directoryFd:4,deadlineAtMs:Date.now()+20000});
process.stdout.write('READY\\n');
let command='';process.stdin.on('data',b=>{command+=b.toString();if(command.length>16)process.exitCode=3;});
process.stdin.on('end',()=>{
  try{
    if(command!=='GO\\n')throw Error('fixed barrier command required');
    const receipt=initializeIssue18LedgerStorage(handle,{contender:tag,fixture:'two-process synthetic storage-only contention'});
    process.stdout.write('RESULT '+JSON.stringify({status:receipt.status,authority_claim:receipt.authority_claim})+'\\n');
  }catch(error){
    const expected=error.code==='ISSUE18_STORAGE_OUTCOME_UNCERTAIN'&&error.receipt?.authority_claim===false;
    process.stdout.write('RESULT '+JSON.stringify({status:expected?'held':'unexpected_error',code:error.code??'UNEXPECTED',receipt:error.receipt??null,name:error.name??null,message:typeof error.message==='string'?error.message.slice(0,1024):null})+'\\n');process.exitCode=expected?2:3;
  }
  finally{closeIssue18LedgerStorage(handle);}
});
`;
function bounded(promise,milliseconds){
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Source contention child bound exceeded')),milliseconds);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
}
function contender(f,tag){
  const supplied={parentFd:3,directoryFd:4,directoryName:f.policy.directoryName,pythonSha256:f.policy.pythonSha256,deadlineAtMs:f.policy.deadlineAtMs};
  const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
  const child=spawn(process.execPath,['--no-warnings','--input-type=module','-e',contenderSource,JSON.stringify(supplied),tag],{env,stdio:['pipe','pipe','pipe',f.policy.parentFd,f.policy.directoryFd]});
  const state={child,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),overflow:false,terminal:null};let readyResolve,readyReject;
  state.ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  child.stdin.on('error',e=>{state.stdinError=e.code;});
  for(const [stream,key] of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',b=>{
    if(state.stdout.length+state.stderr.length+b.length>16384){state.overflow=true;if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');return;}
    state[key]=Buffer.concat([state[key],b]);if(state.stdout.toString().includes('READY\n'))readyResolve();
  });
  state.closed=new Promise((resolve,reject)=>{child.once('error',e=>{readyReject(e);reject(e);});child.once('close',(code,signal)=>{state.terminal={code,signal};if(!state.stdout.toString().includes('READY\n'))readyReject(Error('Source contender did not reach fixed barrier'));resolve(state.terminal);});});
  // Attach immediately, including while the other contender starts. The parent
  // still observes every rejection via the bounded awaits below.
  state.closed.catch(()=>{});state.ready.catch(()=>{});return state;
}
async function stopContender(state){
  const c=state.child;if(c.exitCode===null&&c.signalCode===null)c.kill('SIGTERM');
  try{await bounded(state.closed,1000);}catch{
    if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL');
    await bounded(state.closed,1000);
  }
}
test('two real Source processes contend for one O_EXCL manifest and retain exactly one immutable payload',onDarwin,async()=>{
  const f=fixture(),children=[];
  try{
    children.push(contender(f,'first'));children.push(contender(f,'second'));
    await bounded(Promise.all(children.map(c=>c.ready)),10000);
    for(const c of children)c.child.stdin.end('GO\n');
    await bounded(Promise.all(children.map(c=>c.closed)),25000);
    const results=children.map(c=>{
      assert.equal(c.overflow,false);assert.equal(c.terminal.signal,null);assert.equal(c.stderr.length,0);
      const lines=c.stdout.toString().trimEnd().split('\n');assert.equal(lines[0],'READY');assert.equal(lines.length,2);assert.ok(lines[1].startsWith('RESULT '));return JSON.parse(lines[1].slice(7));
    });
    assert.equal(results.filter(r=>r.status==='committed'&&r.authority_claim===false).length,1);
    assert.equal(results.filter(r=>r.status==='held').length,1);assert.deepEqual(children.map(c=>c.terminal.code).sort(),[0,2]);
    const loser=results.find(r=>r.status==='held');assert.equal(loser.code,'ISSUE18_STORAGE_OUTCOME_UNCERTAIN');assert.equal(loser.receipt?.code,'ISSUE18_STORAGE_OUTCOME_UNCERTAIN');
    assert.equal(loser.receipt?.status,'held');assert.equal(loser.receipt.authority_claim,false);assert.equal(loser.receipt.child_status,2);assert.equal(loser.receipt.child_signal,null);assert.equal(loser.receipt.child_error_code,null);
    // Complete manifest observed, transient create->write->0400 mode, or the
    // actual losing O_EXCL syscall. Pin/ABI/deadline/ReferenceError is NOT this.
    assert.ok((['EXISTING_NAMESPACE','LEAF_TYPE_LINK_MODE'].includes(loser.receipt.helper_code)&&loser.receipt.errno===null)||(loser.receipt.helper_code==='OS_IO_OR_PROTOCOL'&&loser.receipt.errno===17),JSON.stringify(loser));
    assert.deepEqual(fs.readdirSync(f.directory),['RUN.json']);const actual=fs.readFileSync(path.join(f.directory,'RUN.json'));
    const winner=results.findIndex(r=>r.status==='committed');assert.ok(actual.equals(encodeIssue18LedgerData({contender:winner===0?'first':'second',fixture:'two-process synthetic storage-only contention'})));
    const s=fs.lstatSync(path.join(f.directory,'RUN.json'));assert.equal(s.nlink,1);assert.equal(s.mode&0o777,0o400);f.done();
  }finally{
    const cleanup=await Promise.allSettled(children.map(stopContender));
    const errors=cleanup.filter(r=>r.status==='rejected').map(r=>r.reason);
    try{for(let i=0;i<children.length;i++){
      const c=children[i];fs.writeFileSync(path.join(f.parent,`contender-${i}.stdout.log`),c.stdout,{mode:0o600});fs.writeFileSync(path.join(f.parent,`contender-${i}.stderr.log`),c.stderr,{mode:0o600});
      fs.writeFileSync(path.join(f.parent,`contender-${i}.terminal.json`),JSON.stringify({pid:c.child.pid??null,terminal:c.terminal,overflow:c.overflow,cleanup:cleanup[i].status,descendant_closure:'not claimed'})+'\n',{mode:0o600});
    }}catch(e){errors.push(e);}
    f.close({preserve:errors.length>0});
    if(errors.length)throw new AggregateError(errors,'Source contender cleanup/evidence incomplete; fixture preserved');
  }
});
