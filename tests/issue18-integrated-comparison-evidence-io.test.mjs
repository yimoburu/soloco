// Prospective real local IO with genuine Source-only budget selections. Four
// fictional normalized Stores and historical B-only policy DATA are disposable.
// No worker, provider, Native model, run slot or actual company is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {SCHEMA,VERSION,installedTeam,teamHash} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {preexistingLegacyStore} from './preexisting-legacy-data-fixture.mjs';
import {captureIntegratedComparisonSource,inspectIntegratedComparisonSourceFrom} from '../plugins/soloco/runtime/integrated-comparison-source.mjs';
import {DATA_CONTRACT} from '../tools/issue18/integrated-comparison-data.mjs';
import {issueComparisonInitEntitlementFrom,initializeComparisonRun,enrollComparisonArmFrom,comparisonStoreBindingFrom,closeComparisonRun} from '../tools/issue18/integrated-comparison-issuer.mjs';
import {capturePrompt,captureRawText,captureCanonicalData,copyBlobBytes} from '../tools/issue18/typed-capture.mjs';
import {createComparisonEvidenceStorageFrom,inspectComparisonEvidenceStorageFrom,publishComparisonEvidenceBlob,pinComparisonEvidenceFrom,assertComparisonEvidencePin,releaseComparisonEvidencePin,chargeComparisonEvidenceMetadata,closeComparisonEvidenceStorage} from '../tools/issue18/integrated-comparison-evidence-io.mjs';

const optionalDarwin={skip:process.platform!=='darwin',timeout:60000},MAX=9975424;
const sha=body=>createHash('sha256').update(body).digest('hex');
let source,pythonSha;
function pythonHash(){
 if(pythonSha)return pythonSha;const fd=fs.openSync('/usr/bin/python3',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),deadline=Date.now()+10000;
 try{const before=fs.fstatSync(fd,{bigint:true});assert(before.isFile()&&before.uid===0n&&before.nlink>0n&&before.size>0n&&before.size<=150000000n&&(before.mode&0o022n)===0n);const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);let offset=0;
  while(offset<Number(before.size)){assert(Date.now()<deadline);const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);assert(n>0);digest.update(buffer.subarray(0,n));offset+=n;}
  const after=fs.fstatSync(fd,{bigint:true});for(const k of ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'])assert.equal(after[k],before[k]);return pythonSha=digest.digest('hex');
 }finally{fs.closeSync(fd);}
}
function fixture(t){
 const scratch=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'issue18-A-io-'));fs.chmodSync(scratch,0o700);const ancestor=path.join(scratch,'storage-ancestor'),parentPath=path.join(ancestor,'selected-parent');fs.mkdirSync(ancestor,{mode:0o700});fs.mkdirSync(parentPath,{mode:0o700});
 const parentFd=fs.openSync(parentPath,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW),stores=[],handles=[],pins=[];let run,complete=false;
 const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(scratch,'fictional-plugin-data');
 t.after(()=>{
  const errors=[];for(const pin of pins)try{releaseComparisonEvidencePin(pin);}catch(e){errors.push(e);}for(const h of handles)try{closeComparisonEvidenceStorage(h);}catch(e){errors.push(e);}if(run)try{closeComparisonRun(run);}catch(e){errors.push(e);}for(const store of stores.reverse())try{store.close();}catch(e){errors.push(e);}try{fs.closeSync(parentFd);}catch(e){errors.push(e);}
  if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
  if(complete&&!errors.length)fs.rmSync(scratch,{recursive:true,force:true});else process.stderr.write(JSON.stringify({fictional_fixture_retained:scratch,reason:'unexpected Source failure or unconfirmed cleanup'})+'\n');if(errors.length)throw new AggregateError(errors,'A IO fixture cleanup held');
 });
 const at=new Date().toISOString(),owner={host:'codex',session_id:'fictional-founder',epoch:1},team=installedTeam();
 const policy={id:'fictional-B-only-policy',revision:1,kind:'decision',author_role:'human_founder',recorded_by:owner.session_id,status:'Recorded',content:JSON.stringify({protocol:'issue18-comparison-model-policy-v1',profile_sha256:DATA_CONTRACT.profile_sha256,engineer:{model:'gpt-6.1-sol',effort:'medium',speed:'host_default'},qa:{model:'gpt-6.1-sol',effort:'high',speed:'host_default'},same_host:true,independent_native_id:true,independent_instance:true,independent_role:'qa',execution_authority:false}),created_at:at};
 function armStore(label){const root=path.join(scratch,label);fs.mkdirSync(root,{mode:0o700});const store=preexistingLegacyStore(root,'fictional.historical_unqualified',()=>({schema:SCHEMA,runtime_version:VERSION,id:'fictional-'+randomUUID(),name:'Fictional A IO',idea:'Disposable selection only',phase:'Frame',mode:'preparation',owner,paused:false,...team,team_sha256:teamHash(team),records:{[policy.id]:policy},sessions:{},jobs:{},messages:[],notices:[],created_at:at}));store.migrate();stores.push(store);return store;}
 const selectionStore=armStore('1-files'),state=selectionStore.read(),ref={id:policy.id,revision:1,sha256:sha(JSON.stringify(state.records[policy.id]))};source??=captureIntegratedComparisonSource();
 const selection={purpose:'issue18-integrated-comparison-budget-v1',company_id:state.id,owner:state.owner,selection_root_sha256:comparisonStoreBindingFrom(selectionStore).root_sha256,profile_sha256:DATA_CONTRACT.profile_sha256,run_id:'fictional-'+randomUUID(),source:inspectIntegratedComparisonSourceFrom(source),parent_path:parentPath,directory_name:'selected-B',expires_at:new Date(Date.now()+120000).toISOString(),model_policy_ref:ref,durability_profile_ref:ref,retention_policy_ref:ref};
 engine.bind(selectionStore.root,owner.session_id,'codex');engine.control({root:selectionStore.root,session_id:owner.session_id,expected_epoch:1,action:'pause',source_instruction:JSON.stringify(selection)},'codex');
 const decision=Object.values(selectionStore.read().records).find(r=>r.action==='pause');assert(decision);assert.equal(Object.hasOwn(decision,'revision'),false);
 run=initializeComparisonRun(issueComparisonInitEntitlementFrom(selectionStore,{decision_id:decision.id,decision_sha256:sha(JSON.stringify(decision)),parentFd,pythonSha256:pythonHash(),source}));
 enrollComparisonArmFrom(run,selectionStore,'1-files');for(const arm of ['1-patches','3-files','3-patches'])enrollComparisonArmFrom(run,armStore(arm),arm);
 return {ancestor,parentPath,selectionStore,run,handles,pins,ref,create(phase='engineer'){
  const h=createComparisonEvidenceStorageFrom(run,selectionStore,{arm_id:'1-files',phase,deadline_at_ms:Date.parse(selection.expires_at),capacity_reserved_bytes:MAX});handles.push(h);return h;
 },done(){complete=true;}};
}
function evidenceDefinitions(body,{input,stdio=['ignore','pipe','pipe']}={}){
 // A controlled Source namespace executes the actual Python definitions at a
 // declared boundary. It is never a typed capture, issuer or Native witness.
 const helper=fs.readFileSync(new URL('../plugins/soloco/runtime/qualification/issue18/integrated-comparison-evidence-io.py',import.meta.url),'utf8'),marker='\ntry:\n    raw = sys.stdin.buffer.read(MAX_REQUEST + 1)\n';assert.equal(helper.split(marker).length,2);
 const definitions=Buffer.from(helper.slice(0,helper.indexOf(marker))).toString('base64');
 const script=`import base64,json,types\nns={"__name__":"SOURCE_only_evidence_fault_fixture"}\nexec(compile(base64.b64decode("${definitions}"),"SOURCE-only-evidence-definitions","exec"),ns)\n${body}`;
 const child=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',script],{input,cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio,timeout:10000,maxBuffer:8192,killSignal:'SIGKILL'});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr.toString());assert.equal(child.stderr.length,0);return JSON.parse(child.stdout.toString());
}
function helperPublishRequest(facts,body){
 const initPath=path.join(facts.parentPath,facts.directoryName+'.init.json'),initFd=fs.openSync(initPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),init=fs.readFileSync(initFd),s=fs.fstatSync(initFd,{bigint:true});
 const identity=Object.fromEntries(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].map(k=>[k==='mtimeNs'?'mtime_ns':k==='ctimeNs'?'ctime_ns':k,String(s[k])]));
 return {initFd,request:{protocol:'issue18-comparison-evidence-io-v1',operation:'publish',parent_path:facts.parentPath,parent_identity:facts.parentIdentity,directory_name:facts.directoryName,deadline_at_ms:facts.deadlineAtMs,directory_identity:facts.directoryIdentity,objects_identity:facts.objectsIdentity,init:{bytes:init.length,sha256:sha(init),identity},expected_objects:[],body_base64:body.toString('base64'),body_sha256:sha(body)}};
}
test('Source-controlled ACL failure precedes first init and pending evidence bytes',optionalDarwin,()=>{
 const result=evidenceDefinitions(`
real_os=ns["os"]
stat=ns["stat"]
ops=[]
item=types.SimpleNamespace(st_dev=1,st_ino=2,st_mode=stat.S_IFREG|0o600,st_uid=real_os.geteuid(),st_gid=42,st_nlink=1,st_size=0,st_mtime_ns=0,st_ctime_ns=0)
class OS:
 def __getattr__(self,name): return getattr(real_os,name)
 def open(self,*a,**k): ops.append("open"); return 100
 def fstat(self,fd): return item
 def stat(self,*a,**k): return item
 def close(self,fd): ops.append("close")
 def write(self,*a): ops.append("WRITE"); raise AssertionError("Sensitive write before ACL validation")
ns["os"]=OS()
ns["exclusive_rename_backend"]=lambda:object()
ns["parent_guard"]=lambda request:None
ns["directory_guard"]=lambda request:None
ns["census"]=lambda request:None
def acl(fd):
 ops.append("acl")
 raise ns["Held"]("ACL_INJECTED")
ns["empty_acl"]=acl
body=b"{}\\n"
common={"protocol":ns["PROTOCOL"],"parent_path":"/Source-only","parent_identity":{"gid":"42"},"directory_name":"a-"+"a"*64,"deadline_at_ms":9999999999999}
for operation in ("create","publish"):
 ops.clear()
 request={**common,"operation":operation}
 if operation=="create":
  request.update(init_base64=ns["base64"].b64encode(body).decode("ascii"),init_sha256=ns["hashlib"].sha256(body).hexdigest())
 else:
  request.update(directory_identity={},objects_identity={},init={},expected_objects=[],body_base64=ns["base64"].b64encode(body).decode("ascii"),body_sha256=ns["hashlib"].sha256(body).hexdigest())
 try:
  ns["run"](request)
  raise AssertionError("Expected ACL Hold")
 except ns["Held"] as error:
  assert str(error)=="ACL_INJECTED"
 assert ops==["open","acl","close"]
assert ns["burn_attempted"] is True and ns["publication_attempted"] is True and ns["mkdir_attempted"] is False
print(json.dumps({"source_only":True,"first_write_count":ops.count("WRITE"),"both_slots_spent":True}))
`);assert.equal(result.source_only,true);assert.equal(result.first_write_count,0);assert.equal(result.both_slots_spent,true);
});
test('missing exclusive rename backend holds before evidence initialization burn',optionalDarwin,()=>{
 const result=evidenceDefinitions(`
ns["ctypes"]=types.SimpleNamespace(CDLL=lambda *a,**k:types.SimpleNamespace())
try:
 ns["run"]({"protocol":ns["PROTOCOL"]})
 raise AssertionError("Expected unsupported backend")
except ns["Held"] as error:
 assert str(error)=="ATOMIC_PUBLICATION_UNSUPPORTED"
assert ns["burn_attempted"] is False and ns["mkdir_attempted"] is False and ns["publication_attempted"] is False
print(json.dumps({"source_only":True,"burn_spent":False}))
`);assert.equal(result.source_only,true);assert.equal(result.burn_spent,false);
});
test('a destination racing actual exclusive publication survives without overwritten bytes or temp cleanup',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h),body=copyBlobBytes(captureRawText('ORIGINAL\0\ud800\r\n').blob),{initFd,request}=helperPublishRequest(facts,body);
 try{
  const result=evidenceDefinitions(`
request=json.load(ns["sys"].stdin)
original=ns["exclusive_rename"]
def racing_destination(rename,fd,source,target):
 os=ns["os"]
 foreign=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
 try:
  assert os.write(foreign,b"FOREIGN_DESTINATION")==19
  os.fsync(foreign)
 finally: os.close(foreign)
 original(rename,fd,source,target)
ns["exclusive_rename"]=racing_destination
try:
 ns["run"](request)
 raise AssertionError("Expected exclusive collision")
except OSError as error:
 assert error.errno==ns["errno"].EEXIST
print(json.dumps({"source_only":True,"publication_attempted":ns["publication_attempted"],"exclusive_collision":True}))
`,{input:JSON.stringify(request),stdio:['pipe','pipe','pipe',facts.parentFd,facts.directoryFd,facts.objectsFd,initFd]});
  assert.equal(result.exclusive_collision,true);assert.equal(result.publication_attempted,true);
  const objects=path.join(facts.parentPath,facts.directoryName,'objects'),name=request.body_sha256+'.blob';assert.equal(fs.readFileSync(path.join(objects,name),'utf8'),'FOREIGN_DESTINATION');assert(fs.readFileSync(path.join(objects,'.pending-'+name)).equals(body));assert.equal(fs.lstatSync(path.join(objects,name)).nlink,1);assert.throws(()=>inspectComparisonEvidenceStorageFrom(h));f.done();
 }finally{fs.closeSync(initFd);}
});
test('source-name replacement at actual rename cannot delete either original or substituted evidence',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h),body=copyBlobBytes(captureRawText('ORIGINAL source race').blob),{initFd,request}=helperPublishRequest(facts,body);
 try{
  const result=evidenceDefinitions(`
request=json.load(ns["sys"].stdin)
original=ns["exclusive_rename"]
def racing_source(rename,fd,source,target):
 os=ns["os"]
 os.rename(source,"retained-original",src_dir_fd=fd,dst_dir_fd=fd)
 foreign=os.open(source,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
 try:
  assert os.write(foreign,b"FOREIGN_SOURCE")==14
  os.fchmod(foreign,0o400)
  os.fsync(foreign)
 finally: os.close(foreign)
 original(rename,fd,source,target)
ns["exclusive_rename"]=racing_source
try:
 ns["run"](request)
 raise AssertionError("Expected original descriptor/name Hold")
except ns["Held"] as error:
 assert str(error)=="OBJECT_NAME_CHANGED"
print(json.dumps({"source_only":True,"held":True}))
`,{input:JSON.stringify(request),stdio:['pipe','pipe','pipe',facts.parentFd,facts.directoryFd,facts.objectsFd,initFd]});
  assert.equal(result.held,true);const objects=path.join(facts.parentPath,facts.directoryName,'objects');assert(fs.readFileSync(path.join(objects,'retained-original')).equals(body));assert.equal(fs.readFileSync(path.join(objects,request.body_sha256+'.blob'),'utf8'),'FOREIGN_SOURCE');assert.throws(()=>inspectComparisonEvidenceStorageFrom(h));f.done();
 }finally{fs.closeSync(initFd);}
});
test('a retained pin rejects a same-UID symlinked ancestor and stays held after restoration',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),ref=publishComparisonEvidenceBlob(h,captureRawText('ANCESTOR').blob),pin=pinComparisonEvidenceFrom(h,[ref]);f.pins.push(pin);const retained=f.ancestor+'.retained';fs.renameSync(f.ancestor,retained);fs.symlinkSync(retained,f.ancestor);
 try{assert.throws(()=>assertComparisonEvidencePin(pin));}
 finally{fs.unlinkSync(f.ancestor);fs.renameSync(retained,f.ancestor);}
 assert.throws(()=>assertComparisonEvidencePin(pin));f.done();
});
test('a controlled ancestor replacement during the evidence walk fails the reverse original-FD joins',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h),request={parent_path:facts.parentPath,parent_identity:facts.parentIdentity,deadline_at_ms:Date.now()+10000,controlled_ancestor:f.ancestor};
 const result=evidenceDefinitions(`
request=json.load(ns["sys"].stdin)
real_os=ns["os"]
opened=set()
replaced=False
class OS:
 def __getattr__(self,name): return getattr(real_os,name)
 def open(self,name,*a,**k):
  global replaced
  fd=real_os.open(name,*a,**k)
  opened.add(fd)
  if name=="selected-parent" and not replaced:
   real_os.rename(request["controlled_ancestor"],request["controlled_ancestor"]+".retained")
   real_os.symlink(request["controlled_ancestor"]+".retained",request["controlled_ancestor"])
   replaced=True
  return fd
 def close(self,fd):
  real_os.close(fd)
  opened.remove(fd)
ns["os"]=OS()
try:
 try:
  ns["parent_guard"](request)
  raise AssertionError("Expected rebound ancestor Hold")
 except ns["Held"] as error:
  assert str(error)=="PARENT_COMPONENT_CHANGED"
finally:
 if replaced:
  real_os.unlink(request["controlled_ancestor"])
  real_os.rename(request["controlled_ancestor"]+".retained",request["controlled_ancestor"])
assert not opened
print(json.dumps({"source_only":True,"replaced":replaced,"transient_descriptors_closed":True}))
`,{input:JSON.stringify(request),stdio:['pipe','pipe','pipe',facts.parentFd]});assert.equal(result.replaced,true);assert.equal(result.transient_descriptors_closed,true);f.done();
});
test('an added objects directory ACL holds an existing pin with unchanged mode bits',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h),ref=publishComparisonEvidenceBlob(h,captureRawText('ACL retained').blob),pin=pinComparisonEvidenceFrom(h,[ref]);f.pins.push(pin);const objects=path.join(facts.parentPath,facts.directoryName,'objects'),mode=fs.lstatSync(objects).mode;
 const chmod=args=>{const r=spawnSync('/bin/chmod',args,{cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:8192,killSignal:'SIGKILL'});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stderr.length,0);};
 try{chmod(['+a','everyone allow readattr',objects]);assert.equal(fs.lstatSync(objects).mode,mode);assert.throws(()=>assertComparisonEvidencePin(pin));}
 finally{chmod(['-N',objects]);}
 assert.throws(()=>assertComparisonEvidencePin(pin));f.done();
});
test('forged run/storage/pin values do not become IO or retention authority',()=>{
 let traps=0;const proxy=new Proxy({}, {get(){traps++;throw Error('No caller inspection');},ownKeys(){traps++;throw Error('No caller inspection');}});
 for(const value of [{},proxy]){assert.throws(()=>inspectComparisonEvidenceStorageFrom(value));assert.throws(()=>publishComparisonEvidenceBlob(value,{}));assert.throws(()=>pinComparisonEvidenceFrom(value,[]));assert.throws(()=>assertComparisonEvidencePin(value));assert.throws(()=>releaseComparisonEvidencePin(value));assert.throws(()=>closeComparisonEvidenceStorage(value));}
 assert.equal(traps,0);
});
test('genuine four-arm selected budget creates A sibling and preserves exact prompt rawUTF16 and derived bytes',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),initial=inspectComparisonEvidenceStorageFrom(h);assert.equal(initial.capacityReservedBytes,MAX);assert.deepEqual(initial.retention_ref,f.ref);assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-B')),['RUN.json']);
 const prompt=capturePrompt('Exact prompt \uFEFF雪😀\r\n'),raw=captureRawText('\0\ud800RAW\udc00\r\n'),derived=captureCanonicalData('{"result":"derived"}');
 const refs=[prompt.blob,raw.blob,derived].map(blob=>{const ref=publishComparisonEvidenceBlob(h,blob),body=fs.readFileSync(path.join(initial.parentPath,initial.directoryName,ref.object_name));assert(body.equals(copyBlobBytes(blob)));assert.equal(sha(body),ref.sha256);assert.equal(fs.lstatSync(path.join(initial.parentPath,initial.directoryName,ref.object_name)).nlink,1);return ref;});
 assert.equal(refs[1].encoding,'js-utf16le-code-units-v1');const after=inspectComparisonEvidenceStorageFrom(h);assert.equal(after.accounting.blob_staging_and_publication_bytes,2*[prompt.blob,raw.blob,derived].reduce((n,b)=>n+copyBlobBytes(b).length,0));assert.equal(after.accounting.objects_count,3);assert.equal(after.accounting.open_capture,0);
 const pin=pinComparisonEvidenceFrom(h,refs);f.pins.push(pin);const proof=assertComparisonEvidencePin(pin);assert.deepEqual(proof.refs,refs);assert.equal(proof.expires_at_ms,initial.expires_at_ms);assert.equal(proof.accounting.active_pins,1);assert(proof.accounting.charged_bytes<=MAX);assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-B')),['RUN.json']);f.done();
});
test('metadata charges are cumulative, never reset, and capacity holds before another object is written',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),before=inspectComparisonEvidenceStorageFrom(h);const charged=chargeComparisonEvidenceMetadata(h,{header_bytes:123,event_bytes:456,pin_copy_bytes:78});assert.equal(charged.charged_bytes,before.accounting.charged_bytes+657);
 const full=chargeComparisonEvidenceMetadata(h,{header_bytes:MAX-charged.charged_bytes,event_bytes:0,pin_copy_bytes:0});assert.equal(full.charged_bytes,MAX);
 assert.throws(()=>publishComparisonEvidenceBlob(h,capturePrompt('No remaining capacity').blob),{code:'ISSUE18_EVIDENCE_IO_CAPACITY'});assert.deepEqual(fs.readdirSync(path.join(before.parentPath,before.directoryName,'objects')),[]);f.done();
});
test('a foreign typed-capture handle cannot publish ref-shaped bytes or a caller getter',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h);let reads=0;const fake={get ref(){reads++;throw Error('No getter');}};assert.throws(()=>publishComparisonEvidenceBlob(h,fake));assert.equal(reads,0);assert.deepEqual(fs.readdirSync(path.join(facts.parentPath,facts.directoryName,'objects')),[]);f.done();
});
test('pinning requires an actually published ref and copied private pins are rejected',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),ref=publishComparisonEvidenceBlob(h,capturePrompt('retained').blob),pin=pinComparisonEvidenceFrom(h,[ref]);f.pins.push(pin);assert.throws(()=>assertComparisonEvidencePin({...pin}));const charged=assertComparisonEvidencePin(pin).accounting.charged_bytes;releaseComparisonEvidencePin(pin);assert.throws(()=>assertComparisonEvidencePin(pin));assert.equal(inspectComparisonEvidenceStorageFrom(h).accounting.charged_bytes,charged);f.done();
});
test('modified bytes cannot be restored into a valid retained original-file pin',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h),ref=publishComparisonEvidenceBlob(h,captureRawText('ORIGINAL').blob),pin=pinComparisonEvidenceFrom(h,[ref]);f.pins.push(pin);const file=path.join(facts.parentPath,facts.directoryName,ref.object_name),body=fs.readFileSync(file);fs.chmodSync(file,0o600);fs.writeFileSync(file,Buffer.alloc(body.length));fs.writeFileSync(file,body);fs.chmodSync(file,0o400);assert.throws(()=>assertComparisonEvidencePin(pin));assert(fs.readFileSync(file).equals(body));f.done();
});
test('initialization is one-shot per selected slot and closing preserves immutable objects and burns',optionalDarwin,t=>{
 const f=fixture(t),h=f.create(),facts=inspectComparisonEvidenceStorageFrom(h),ref=publishComparisonEvidenceBlob(h,capturePrompt('preserved').blob);assert.throws(()=>f.create());const file=path.join(facts.parentPath,facts.directoryName,ref.object_name),before=fs.readFileSync(file);closeComparisonEvidenceStorage(h);assert.throws(()=>inspectComparisonEvidenceStorageFrom(h));assert(fs.readFileSync(file).equals(before));assert(fs.existsSync(path.join(facts.parentPath,facts.directoryName+'.init.json')));f.done();
});
