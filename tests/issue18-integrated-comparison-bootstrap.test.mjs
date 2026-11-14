// Prospective Source qualification only. Real disposable filesystem operations
// use a genuine Store-issued budget selection. Historical policy DATA is
// explicitly unqualified; no model, Native, Store witness or run is admitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SCHEMA,VERSION,installedTeam,teamHash} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {captureIntegratedComparisonSource,inspectIntegratedComparisonSourceFrom} from '../plugins/soloco/runtime/integrated-comparison-source.mjs';
import {DATA_CONTRACT} from '../tools/issue18/integrated-comparison-data.mjs';
import {issueComparisonInitEntitlementFrom,consumeComparisonBootstrapEntitlement,comparisonStoreBindingFrom} from '../tools/issue18/integrated-comparison-issuer.mjs';
import {createComparisonStorage,inspectComparisonStorage,appendComparisonJournal,closeComparisonStorage,COMPARISON_METADATA_MAX_BYTES,COMPARISON_JOURNAL_ENTRY_MAX_BYTES} from '../tools/issue18/integrated-comparison-bootstrap.mjs';
import {encodeIssue18LedgerData,openIssue18LedgerStorage,initializeIssue18LedgerStorage,inspectIssue18LedgerStorage,closeIssue18LedgerStorage} from '../tools/issue18-ledger-storage.mjs';
import {preexistingLegacyStore} from './preexisting-legacy-data-fixture.mjs';

const sha=body=>createHash('sha256').update(body).digest('hex');
const optionalDarwin={skip:process.platform!=='darwin',timeout:60000};
const flags=fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW;
let snapshot,pythonSha;
function sourceSnapshot(){return snapshot??=captureIntegratedComparisonSource();}
function pythonHash(){
 if(pythonSha)return pythonSha;
 const fd=fs.openSync('/usr/bin/python3',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),deadline=Date.now()+10000;
 try{
  const before=fs.fstatSync(fd,{bigint:true});assert(before.isFile()&&before.uid===0n&&before.nlink>0n&&(before.mode&0o022n)===0n&&before.size>0n&&before.size<=150000000n);
  const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);let offset=0;
  while(offset<Number(before.size)){assert(Date.now()<deadline);const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);assert(n>0);digest.update(buffer.subarray(0,n));offset+=n;}
  const after=fs.fstatSync(fd,{bigint:true});for(const key of ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'])assert.equal(after[key],before[key]);
  assert(Date.now()<deadline);return pythonSha=digest.digest('hex');
 }finally{fs.closeSync(fd);}
}
const physicalIdentity=s=>Object.fromEntries(['dev','ino','mode','uid','gid'].map(key=>[key,String(s[key])]));
function fixture(t,{decisionChange=null}={}){
 const scratch=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'issue18-bootstrap-'));fs.chmodSync(scratch,0o700);
 const root=path.join(scratch,'fictional-company'),ancestor=path.join(scratch,'storage-ancestor'),parentPath=path.join(ancestor,'selected-parent');fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(ancestor,{mode:0o700});fs.mkdirSync(parentPath,{mode:0o700});
 const previousPluginData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(scratch,'fictional-plugin-data');
 const parentFd=fs.openSync(parentPath,flags),handles=[],ledgerHandles=[];let complete=false,store;
 t.after(()=>{
  const errors=[];for(const h of ledgerHandles)try{closeIssue18LedgerStorage(h);}catch(e){errors.push(e);}for(const h of handles)try{closeComparisonStorage(h);}catch(e){errors.push(e);}
  try{store?.close();}catch(e){errors.push(e);}try{fs.closeSync(parentFd);}catch(e){errors.push(e);}
  if(previousPluginData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previousPluginData;
  if(complete&&!errors.length)fs.rmSync(scratch,{recursive:true,force:true});else process.stderr.write(JSON.stringify({fictional_fixture_retained:scratch,reason:'unexpected Source failure or unconfirmed descriptor cleanup'})+'\n');
  if(errors.length)throw new AggregateError(errors,'Bootstrap fixture cleanup held; files retained');
 });
 const at=new Date().toISOString(),owner={host:'codex',session_id:'fictional-founder',epoch:1};
 const policy={id:'fictional-B-only-policy',revision:1,kind:'decision',author_role:'human_founder',recorded_by:owner.session_id,status:'Recorded',content:JSON.stringify({protocol:'issue18-comparison-model-policy-v1',profile_sha256:DATA_CONTRACT.profile_sha256,engineer:{model:'gpt-6.1-sol',effort:'medium',speed:'host_default'},qa:{model:'gpt-6.1-sol',effort:'high',speed:'host_default'},same_host:true,independent_native_id:true,independent_instance:true,independent_role:'qa',execution_authority:false}),created_at:at};
 const team=installedTeam();
 store=preexistingLegacyStore(root,'fictional.historical_unqualified',()=>({schema:SCHEMA,runtime_version:VERSION,id:'fictional-'+randomUUID(),name:'Fictional bootstrap Source check',idea:'Disposable B-only storage selection',phase:'Frame',mode:'preparation',owner,paused:false,...team,team_sha256:teamHash(team),sessions:{},jobs:{},records:{[policy.id]:policy},messages:[],notices:[],created_at:at}));
 store.migrate();
 engine.bind(root,owner.session_id,'codex');
 const state=store.read(),bound=comparisonStoreBindingFrom(store),source=sourceSnapshot(),ref={id:policy.id,revision:1,sha256:sha(JSON.stringify(state.records[policy.id]))};
 const selection={purpose:'issue18-integrated-comparison-budget-v1',company_id:state.id,owner:state.owner,selection_root_sha256:bound.root_sha256,profile_sha256:DATA_CONTRACT.profile_sha256,run_id:'fictional-'+randomUUID(),source:inspectIntegratedComparisonSourceFrom(source),parent_path:parentPath,directory_name:'selected-run',expires_at:new Date(Date.now()+120000).toISOString(),model_policy_ref:ref,durability_profile_ref:ref,retention_policy_ref:ref};
 decisionChange?.(selection);
 engine.control({root,session_id:owner.session_id,expected_epoch:1,action:'pause',source_instruction:JSON.stringify(selection)},'codex');
 const decision=Object.values(store.read().records).find(record=>record.kind==='decision'&&record.action==='pause');assert(decision);assert.equal(Object.hasOwn(decision,'revision'),false,'The original public control stays revisionless');
 const issue=()=>issueComparisonInitEntitlementFrom(store,{decision_id:decision.id,decision_sha256:sha(JSON.stringify(decision)),parentFd,pythonSha256:pythonHash(),source});
 return {root,ancestor,parentPath,parentFd,store,selection,decision,issue,handles,ledgerHandles,
  create(){const entitlement=issue(),handle=createComparisonStorage(entitlement);handles.push(handle);return {entitlement,handle,facts:inspectComparisonStorage(handle)};},
  done(){complete=true;}};
}

function bootstrapDefinitions(body,{input,stdio=['ignore','pipe','pipe']}={}){
 // Controlled Source-only namespace: the fixed entrypoint is not executed and
 // the declared OS/ACL boundary is replaced, never a runtime/issuer witness.
 const helper=fs.readFileSync(new URL('../plugins/soloco/runtime/qualification/issue18/integrated-comparison-bootstrap.py',import.meta.url),'utf8'),marker='\ntry:\n    raw = sys.stdin.buffer.read(MAX_REQUEST + 1)\n';assert.equal(helper.split(marker).length,2);
 const definitions=Buffer.from(helper.slice(0,helper.indexOf(marker))).toString('base64');
 const script=`import base64,json,types\nns={"__name__":"SOURCE_only_bootstrap_fault_fixture"}\nexec(compile(base64.b64decode("${definitions}"),"SOURCE-only-bootstrap-definitions","exec"),ns)\n${body}`;
 const child=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',script],{input,cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio,timeout:10000,maxBuffer:8192,killSignal:'SIGKILL'});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr.toString());assert.equal(child.stderr.length,0);return JSON.parse(child.stdout.toString());
}
test('Source-controlled fresh ACL failure precedes every bootstrap metadata byte',optionalDarwin,()=>{
 const result=bootstrapDefinitions(`
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
def acl(fd):
 ops.append("acl")
 raise ns["Held"]("ACL_INJECTED")
ns["empty_acl"]=acl
try:
 ns["create_file"]({"parent_identity":{"gid":"42"}},"selected.selection.json",b"SENSITIVE",0o400)
 raise AssertionError("Expected ACL Hold")
except ns["Held"] as error:
 assert str(error)=="ACL_INJECTED"
assert ops==["open","acl","close"]
print(json.dumps({"source_only":True,"writes":ops.count("WRITE"),"burn_spent":ns["burned"]}))
`);assert.equal(result.source_only,true);assert.equal(result.writes,0);assert.equal(result.burn_spent,true);
});
test('missing exclusive-publication symbol holds before bootstrap initialization burn',optionalDarwin,()=>{
 const result=bootstrapDefinitions(`
ns["ctypes"]=types.SimpleNamespace(CDLL=lambda *a,**k:types.SimpleNamespace())
try:
 ns["run"]({"protocol":ns["PROTOCOL"]})
 raise AssertionError("Expected unsupported backend")
except ns["Held"] as error:
 assert str(error)=="ATOMIC_PUBLICATION_UNSUPPORTED"
assert ns["burned"] is False and ns["mkdir_attempted"] is False
print(json.dumps({"source_only":True,"burn_spent":ns["burned"]}))
`);assert.equal(result.source_only,true);assert.equal(result.burn_spent,false);
});
test('after creation a same-UID symlinked ancestor permanently holds bootstrap custody',optionalDarwin,t=>{
 const f=fixture(t),{handle}=f.create(),retained=f.ancestor+'.retained';fs.renameSync(f.ancestor,retained);fs.symlinkSync(retained,f.ancestor);
 try{assert.throws(()=>inspectComparisonStorage(handle));}
 finally{fs.unlinkSync(f.ancestor);fs.renameSync(retained,f.ancestor);}
 assert.throws(()=>inspectComparisonStorage(handle));f.done();
});
test('a controlled ancestor replacement during the bootstrap walk fails the reverse original-FD joins',optionalDarwin,t=>{
 const f=fixture(t),request={parent_path:f.parentPath,parent_identity:physicalIdentity(fs.fstatSync(f.parentFd,{bigint:true})),deadline_at_ms:Date.now()+10000,controlled_ancestor:f.ancestor};
 const result=bootstrapDefinitions(`
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
`,{input:JSON.stringify(request),stdio:['pipe','pipe','pipe',f.parentFd]});assert.equal(result.replaced,true);assert.equal(result.transient_descriptors_closed,true);f.done();
});
test('an ACL added to the selected run holds bootstrap custody while mode bits stay private',optionalDarwin,t=>{
 const f=fixture(t),{handle}=f.create(),directory=path.join(f.parentPath,'selected-run'),mode=fs.lstatSync(directory).mode;
 const chmod=args=>{const r=spawnSync('/bin/chmod',args,{cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:8192,killSignal:'SIGKILL'});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stderr.length,0);};
 try{chmod(['+a','everyone allow readattr',directory]);assert.equal(fs.lstatSync(directory).mode,mode);assert.throws(()=>inspectComparisonStorage(handle));}
 finally{chmod(['-N',directory]);}
 assert.throws(()=>inspectComparisonStorage(handle));f.done();
});

test('bootstrap fixed metadata ceilings cannot be raised by a caller',()=>{
 assert.equal(COMPARISON_METADATA_MAX_BYTES,32768);assert.equal(COMPARISON_JOURNAL_ENTRY_MAX_BYTES,4096);
});
test('forged, copied and Proxy initialization values cannot reach the filesystem helper',()=>{
 let traps=0;const hostile=new Proxy({}, {get(){traps++;throw Error('No caller inspection');},ownKeys(){traps++;throw Error('No caller inspection');},getPrototypeOf(){traps++;throw Error('No caller inspection');}});
 for(const value of [undefined,null,Object.freeze({}),{initialization_selected:true},hostile])assert.throws(()=>createComparisonStorage(value));
 assert.equal(traps,0);
 for(const value of [{},hostile]){assert.throws(()=>inspectComparisonStorage(value));assert.throws(()=>appendComparisonJournal(value,{}));assert.throws(()=>closeComparisonStorage(value));}
 assert.equal(traps,0);
});
test('genuine selection creates exactly an empty run and two bounded external files; B borrows original FDs',optionalDarwin,t=>{
 const f=fixture(t),{entitlement,handle,facts}=f.create();
 assert.deepEqual(fs.readdirSync(f.parentPath).sort(),['selected-run','selected-run.journal.jsonl','selected-run.selection.json']);
 assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-run')),[]);
 assert.equal(facts.parentFd,f.parentFd);assert.deepEqual(facts.parentIdentity,physicalIdentity(fs.fstatSync(f.parentFd,{bigint:true})));assert.deepEqual(facts.directoryIdentity,physicalIdentity(fs.fstatSync(facts.directoryFd,{bigint:true})));
 const anchor=fs.readFileSync(path.join(f.parentPath,'selected-run.selection.json')),journal=fs.readFileSync(path.join(f.parentPath,'selected-run.journal.jsonl'));
 assert.equal(anchor.length,facts.anchorBytes);assert.equal(journal.length,facts.journalBytes);assert(journal.length>0);assert.equal(sha(anchor),facts.anchorSha256);assert.equal(sha(journal),facts.journalSha256);
 assert.equal(facts.externalMetadataBytes,anchor.length+journal.length);assert(facts.issuerStoredBytes>0);assert.equal(facts.actualMetadataBytes,facts.issuerStoredBytes+anchor.length+journal.length);assert(facts.actualMetadataBytes<=32768);
 const selected=JSON.parse(anchor);assert.equal(selected.revision,1);assert.deepEqual(facts.selectionRef,{id:selected.id,revision:1,sha256:sha(JSON.stringify(selected))});assert.notEqual(facts.selectionRef.sha256,facts.anchorSha256,'Canonical record and LF physical-file hashes stay in separate domains');
 assert.equal(fs.lstatSync(path.join(f.parentPath,'selected-run.selection.json')).mode&0o777,0o400);assert.equal(fs.lstatSync(path.join(f.parentPath,'selected-run.journal.jsonl')).mode&0o777,0o600);
 assert.throws(()=>createComparisonStorage(entitlement));assert.throws(()=>f.issue(),'Canonical original control remains spent across attempted reissuance');
 const b=openIssue18LedgerStorage({parentFd:facts.parentFd,directoryFd:facts.directoryFd,directoryName:facts.directoryName,pythonSha256:facts.pythonSha256,deadlineAtMs:facts.deadlineAtMs});f.ledgerHandles.push(b);
 assert.equal(initializeIssue18LedgerStorage(b,{fixture:'B-only canonical finite storage DATA; not run admission'}).status,'committed');assert.deepEqual(inspectIssue18LedgerStorage(b).rows.map(row=>row.name),['RUN.json']);
 assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-run')),['RUN.json']);assert.equal(inspectComparisonStorage(handle).actualMetadataBytes,facts.actualMetadataBytes);f.done();
});
test('ordinary pause text is not an explicit issue18 selection and creates no run or metadata',optionalDarwin,t=>{
 const f=fixture(t,{decisionChange:selection=>{selection.purpose='ordinary-pause';}});assert.throws(()=>f.issue());assert.deepEqual(fs.readdirSync(f.parentPath),[]);f.done();
});
test('a partial existing burn is retained and the consumed control cannot retry initialization',optionalDarwin,t=>{
 const f=fixture(t),file=path.join(f.parentPath,'selected-run.selection.json'),partial=Buffer.from('{"partial":');fs.writeFileSync(file,partial,{mode:0o400});
 const entitlement=f.issue();assert.throws(()=>createComparisonStorage(entitlement),error=>error.code==='ISSUE18_BOOTSTRAP_OUTCOME_UNCERTAIN'&&error.receipt.initialization_spent===true&&error.receipt.burn_may_have_occurred===true);
 assert(fs.readFileSync(file).equals(partial));assert.equal(fs.existsSync(path.join(f.parentPath,'selected-run')),false);assert.throws(()=>createComparisonStorage(entitlement));assert.throws(()=>f.issue());f.done();
});
test('an existing directory never becomes adopted; durable selection and initialization journal remain',optionalDarwin,t=>{
 const f=fixture(t);fs.mkdirSync(path.join(f.parentPath,'selected-run'),{mode:0o700});fs.writeFileSync(path.join(f.parentPath,'selected-run','sentinel'),'UNCHANGED');
 const entitlement=f.issue();assert.throws(()=>createComparisonStorage(entitlement),error=>error.code==='ISSUE18_BOOTSTRAP_OUTCOME_UNCERTAIN'&&error.receipt.mkdir_attempted===true);
 assert.equal(fs.readFileSync(path.join(f.parentPath,'selected-run','sentinel'),'utf8'),'UNCHANGED');assert(fs.readFileSync(path.join(f.parentPath,'selected-run.selection.json')).length>0);assert(fs.readFileSync(path.join(f.parentPath,'selected-run.journal.jsonl')).length>0);assert.throws(()=>f.issue());f.done();
});
test('hardlinked anchors poison the live handle without writing or repairing',optionalDarwin,t=>{
 const f=fixture(t),{handle}=f.create(),anchor=path.join(f.parentPath,'selected-run.selection.json'),before=fs.readFileSync(anchor);
 fs.linkSync(anchor,path.join(f.parentPath,'extra-anchor-link'));assert.throws(()=>inspectComparisonStorage(handle));fs.unlinkSync(path.join(f.parentPath,'extra-anchor-link'));
 assert.throws(()=>inspectComparisonStorage(handle),'Restoring a name cannot unpoison this handle');assert(fs.readFileSync(anchor).equals(before));assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-run')),[]);f.done();
});
test('symlinked parent ancestry cannot redirect creation or reset the spent initialization',optionalDarwin,t=>{
 const f=fixture(t),entitlement=f.issue(),retained=f.ancestor+'.retained';fs.renameSync(f.ancestor,retained);fs.symlinkSync(retained,f.ancestor);
 assert.throws(()=>createComparisonStorage(entitlement));assert.deepEqual(fs.readdirSync(path.join(retained,'selected-parent')),[]);assert.throws(()=>createComparisonStorage(entitlement));f.done();
});
test('replacing the run name cannot redirect the original storage handle into another directory',optionalDarwin,t=>{
 const f=fixture(t),{handle}=f.create(),run=path.join(f.parentPath,'selected-run');fs.renameSync(run,path.join(f.parentPath,'retained-run'));fs.mkdirSync(run,{mode:0o700});
 assert.throws(()=>inspectComparisonStorage(handle));assert.deepEqual(fs.readdirSync(run),[]);assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'retained-run')),[]);f.done();
});
test('copied and foreign-module handles cannot become physical custody, and close preserves every file',optionalDarwin,async t=>{
 const f=fixture(t),{handle,facts}=f.create();assert.throws(()=>inspectComparisonStorage({...handle}));
 const alias=await import('../tools/issue18/integrated-comparison-bootstrap.mjs?compatibility-wrapper-alias');assert.equal(alias.inspectComparisonStorage,inspectComparisonStorage,'Compatibility wrappers share the canonical private brand graph');
 const other=await import('../plugins/soloco/runtime/qualification/issue18/integrated-comparison-bootstrap.mjs?independent-negative-module-instance');assert.throws(()=>other.inspectComparisonStorage(handle));
 const names=fs.readdirSync(f.parentPath).sort(),before=names.filter(name=>name!=='selected-run').map(name=>[name,fs.readFileSync(path.join(f.parentPath,name))]);
 closeComparisonStorage(handle);assert.throws(()=>inspectComparisonStorage(handle));assert.throws(()=>fs.fstatSync(facts.directoryFd));assert(fs.fstatSync(f.parentFd).isDirectory());assert.deepEqual(fs.readdirSync(f.parentPath).sort(),names);for(const [name,body]of before)assert(fs.readFileSync(path.join(f.parentPath,name)).equals(body));f.done();
});
test('unissued journal DATA poisons rather than appends, even when it supplies plausible fields',optionalDarwin,t=>{
 const f=fixture(t),{handle}=f.create(),journal=path.join(f.parentPath,'selected-run.journal.jsonl'),before=fs.readFileSync(journal);
 assert.throws(()=>appendComparisonJournal(handle,{text:'{"event":"caller"}\n',maximumTotalBytes:32768}));assert(fs.readFileSync(journal).equals(before));assert.throws(()=>inspectComparisonStorage(handle));f.done();
});
test('fixed helper rejects aggregate metadata over capacity before any creation effect',optionalDarwin,t=>{
 const f=fixture(t),entitlement=f.issue(),loan=consumeComparisonBootstrapEntitlement(entitlement);
 // Low-level negative protocol check, after genuine one-shot consumption. The
 // helper is not a permission API; no forged token or DATA flag is accepted.
 const anchor=encodeIssue18LedgerData({padding:'x'.repeat(32600)}),journal=encodeIssue18LedgerData({event:'initialization_reserved'});
 const request={protocol:'issue18-comparison-bootstrap-io-v1',operation:'create',parent_path:loan.parentPath,parent_identity:physicalIdentity(fs.fstatSync(f.parentFd,{bigint:true})),directory_name:loan.directoryName,deadline_at_ms:Date.now()+10000,issuer_stored_bytes:32768,anchor_base64:anchor.toString('base64'),anchor_sha256:sha(anchor),journal_base64:journal.toString('base64'),journal_sha256:sha(journal)};
 const helper=fs.readFileSync(fileURLToPath(new URL('../plugins/soloco/runtime/qualification/issue18/integrated-comparison-bootstrap.py',import.meta.url)),'utf8');assert.equal(helper,fs.readFileSync(fileURLToPath(new URL('../tools/issue18/integrated-comparison-bootstrap.py',import.meta.url)),'utf8'));
 const child=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',helper],{input:JSON.stringify(request),env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:['pipe','pipe','pipe',f.parentFd],timeout:10000,maxBuffer:8192,killSignal:'SIGKILL'});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,2);assert.equal(child.stderr.length,0);const reply=JSON.parse(child.stdout.toString());assert.equal(reply.code,'METADATA_CAPACITY');assert.equal(reply.burn_may_have_occurred,false);assert.equal(reply.mkdir_attempted,false);assert.deepEqual(fs.readdirSync(f.parentPath),[]);assert.throws(()=>createComparisonStorage(entitlement));assert.throws(()=>f.issue());f.done();
});
