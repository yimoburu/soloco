// Source-owned component build operation. Trusted source/host is an explicit
// assumption; ordinary filesystem/Seatbelt boundaries do NOT resist arbitrary
// same-UID/source-editor actors. No API registers caller roots, issuers, paths,
// commands or receipts. This module never issues an active interpreter handle.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {formatContextBuildInputData,formatContextBuildOutputData,createContextBuildIntentData,advanceContextBuildIntentData,inspectContextBuildIntentData} from './context-build-data.mjs';

const HERE=fileURLToPath(import.meta.url),REPO=path.resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const ENTRY=path.join(REPO,'tools/build-peer-context.mjs'),NATIVE=path.join(REPO,'native/codex');
const ROOT=path.join(REPO,'work/peer-context-component'),JOURNAL=path.join(ROOT,'journal.sqlite'),ANCHOR=path.join(ROOT,'journal-anchor.json');
const PACKAGE_SHA='c103b27a9c458c0989c7766a769ab1644e3663307e72274906c6d362fdd64c15';
const DRIVER_SHA='99c1723444f39e73059b5eadc1f089751739832dfafba2a0a149cadf172298b5';
const DATA_SHA='64b3b0cd592956a1effc2971350c4d4b66a861b4de0eee361e1024d2418184c8';
const COMMIT='c40729ea5cf8e947481b130c59807273eda2f8e9',TREE='078c14cecf94b522a2eff48b30996bf3f4d1bf7a';
const TARGET='aarch64-apple-darwin',PYTHON='/usr/bin/python3',BUILD_SECONDS=1200;
const SIDECAR='plugins/soloco/helpers/origin-sidecar-capture.c';
const SIDECAR_FLAGS=['-std=c11','-O2','-Wall','-Wextra','-Werror','-target','arm64-apple-macos11.0'];
const SELECTED_CLANG='/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang';
const SELECTED_SDK='/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk';
const MAX_FILE=128*1024*1024,MAX_NODE=64*1024*1024;
const errors=new WeakMap(),pending=new Map();let issuer;
// These handles identify inspected component DATA only, never executable support.
const selectedDataHandles=new WeakMap(),SELECTED_COMPONENT_DATA=Object.freeze(Object.create(null));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail(code){const e=Error(code);errors.set(e,code);throw e;}
export const contextComponentErrorCode=e=>errors.get(e)??'COMPONENT_INTERNAL_ERROR';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function canonical(value){const sort=v=>Array.isArray(v)?v.map(sort):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';}
const same=(a,b)=>canonical(a)===canonical(b);
const ref=bytes=>({bytes:bytes.length,sha256:sha(bytes)});
function relative(name){if(typeof name!=='string'||!name||name.length>4096||name.includes('\\')||path.isAbsolute(name)||name.split('/').some(v=>!v||v==='.'||v==='..'))fail('COMPONENT_SOURCE_CHANGED');return name;}
function noLinks(file){if(!path.isAbsolute(file)||path.resolve(file)!==file)fail('COMPONENT_PATH_CHANGED');for(let p=file;;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())fail('COMPONENT_PATH_CHANGED');}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}return file;}
function stableRead(file,maximum=MAX_FILE){
 noLinks(file);const named=fs.lstatSync(file);if(!named.isFile()||named.nlink!==1||named.size>maximum)fail('COMPONENT_ARTIFACT_CHANGED');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const before=fs.fstatSync(fd),bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),now=fs.lstatSync(file);if(bytes.length!==before.size||['dev','ino','size','mtimeMs','ctimeMs','mode','uid','nlink'].some(k=>named[k]!==before[k]||before[k]!==after[k]||before[k]!==now[k]))fail('COMPONENT_ARTIFACT_CHANGED');return bytes;}finally{fs.closeSync(fd);}
}
// The fixed root-owned macOS public launcher legitimately has multiple hard
// links. This private, noargs reader applies ONLY to PYTHON, never artifacts.
// Bind every non-access-time stat field; the read itself may update atime.
function readFixedPublicPython(){
 noLinks(PYTHON);const named=fs.lstatSync(PYTHON,{bigint:true});
 const valid=s=>s.isFile()&&s.uid===0n&&(s.mode&0o022n)===0n&&s.nlink>0n&&s.size>=0n&&s.size<=BigInt(MAX_FILE);
 const fields=['dev','ino','mode','nlink','uid','gid','rdev','size','blksize','blocks','mtimeNs','ctimeNs','birthtimeNs'];
 const matches=s=>valid(s)&&fields.every(k=>s[k]===named[k]);
 if(!valid(named))fail('COMPONENT_PUBLIC_RUNTIME_CHANGED');
 const fd=fs.openSync(PYTHON,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const before=fs.fstatSync(fd,{bigint:true});if(!matches(before))fail('COMPONENT_PUBLIC_RUNTIME_CHANGED');
  const bytes=Buffer.alloc(Number(before.size));let offset=0;
  while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(n===0)fail('COMPONENT_PUBLIC_RUNTIME_CHANGED');offset+=n;}
  if(fs.readSync(fd,Buffer.alloc(1),0,1,bytes.length)!==0||!matches(fs.fstatSync(fd,{bigint:true}))||!matches(fs.lstatSync(PYTHON,{bigint:true})))fail('COMPONENT_PUBLIC_RUNTIME_CHANGED');
  return bytes;
 }finally{fs.closeSync(fd);}
}
// Captured by this loaded original module, before any caller operation. The
// trusted loader/source assumption is explicit; this is not an attestation
// against a hostile runtime or a source editor racing Node's own module read.
const STARTUP_IMPL=[HERE,ENTRY,path.join(path.dirname(HERE),'context-build-data.mjs')].map(file=>({file,sha256:sha(stableRead(file))}));
function readPin(root,pin){if(!exact(pin,['path','bytes','sha256'])||!Number.isSafeInteger(pin.bytes)||pin.bytes<0||pin.bytes>MAX_FILE||!hash(pin.sha256))fail('COMPONENT_SOURCE_CHANGED');const bytes=stableRead(path.join(root,relative(pin.path)));if(bytes.length!==pin.bytes||sha(bytes)!==pin.sha256)fail('COMPONENT_SOURCE_CHANGED');return bytes;}
function parse(bytes){try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);return JSON.parse(text);}catch{fail('COMPONENT_ARTIFACT_CHANGED');}}
function rows(value,maximum=128*1024*1024){
 if(!Array.isArray(value)||!value.length||value.length>20000)fail('COMPONENT_SOURCE_CHANGED');let prior='',total=0;
 for(const row of value){if(!exact(row,['path','bytes','sha256','mode'])||relative(row.path)<=prior||!Number.isSafeInteger(row.bytes)||row.bytes<0||!hash(row.sha256)||!['100644','100755'].includes(row.mode))fail('COMPONENT_SOURCE_CHANGED');prior=row.path;total+=row.bytes;if(total>maximum)fail('COMPONENT_SOURCE_CHANGED');}return value;
}
function treeRows(root,prefix='',maximumFile=MAX_FILE,maximumTotal=MAX_FILE,sourceOnly=false){
 noLinks(root);if(!fs.lstatSync(root).isDirectory())fail('COMPONENT_INPUT_COMPOSITION_UNAVAILABLE');const result=[];let total=0,visited=0;
 function walk(directory,base,depth=0){if(depth>32)fail('COMPONENT_SOURCE_CHANGED');for(const name of fs.readdirSync(directory).sort()){if(++visited>40000)fail('COMPONENT_SOURCE_CHANGED');relative(name);const p=path.join(directory,name),st=fs.lstatSync(p),key=base?base+'/'+name:name;
  if(sourceOnly&&(name.startsWith('.env')||(st.isDirectory()&&name.startsWith('.')&&!['.codex-plugin','.claude-plugin'].includes(name))||(st.isFile()&&key!==SIDECAR&&!/\.(mjs|json|md|sh|svg|txt)$/.test(name)&&!['LICENSE','NOTICE'].includes(name))))fail('COMPONENT_INPUT_COMPOSITION_UNAVAILABLE');
  if(st.isDirectory())walk(p,key,depth+1);else if(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1){total+=st.size;if(result.length>=20000||total>maximumTotal)fail('COMPONENT_SOURCE_CHANGED');const b=stableRead(p,maximumFile);result.push({path:key,bytes:b.length,sha256:sha(b),mode:st.mode&0o111?'100755':'100644'});}else fail('COMPONENT_SOURCE_CHANGED');}}
 walk(root,prefix);return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function verifyTree(root,inventory,maximum){const actual=treeRows(root,'',maximum,maximum);rows(actual,maximum);if(!same(actual,inventory))fail('COMPONENT_SOURCE_CHANGED');}
function fixedIssuer(){
 for(const p of STARTUP_IMPL)if(sha(stableRead(p.file))!==p.sha256)fail('COMPONENT_SOURCE_CHANGED');
 const moduleBytes=stableRead(HERE),entryBytes=stableRead(ENTRY),dataBytes=stableRead(path.join(path.dirname(HERE),'context-build-data.mjs'));
 if(sha(dataBytes)!==DATA_SHA)fail('COMPONENT_SOURCE_CHANGED');
 noLinks(REPO);const realm=fs.lstatSync(REPO,{bigint:true});if(!realm.isDirectory())fail('COMPONENT_PATH_CHANGED');
 const identity=sha(canonical({module:ref(moduleBytes),entry:ref(entryBytes),data:ref(dataBytes),source_root:{path:REPO,dev:String(realm.dev),ino:String(realm.ino)}}));
 if(issuer&&issuer.owner_sha256!==identity)fail('COMPONENT_SOURCE_CHANGED');
 // Same pinned implementation has the SAME durable epoch on cold restart.
 // A fresh process/WeakMap identity must never reset one-use reservation keys.
 if(!issuer)issuer=Object.freeze({owner_sha256:identity,generation:0});return issuer;
}
function collectInputs(){
 const owner=fixedIssuer(),packagePath=path.join(NATIVE,'source-package.json'),driver=path.join(NATIVE,'tools/protected_native.py');let packageBytes,driverBytes;
 try{packageBytes=stableRead(packagePath);driverBytes=stableRead(driver);}catch{fail('COMPONENT_INPUT_COMPOSITION_UNAVAILABLE');}
 if(sha(packageBytes)!==PACKAGE_SHA||sha(driverBytes)!==DRIVER_SHA)fail('COMPONENT_SOURCE_CHANGED');const pkg=parse(packageBytes);
 if(pkg.schema!=='soloco-protected-native-source-package-v1'||pkg.status!=='frozen-source-unqualified'||pkg.qualified_binary!==null||pkg.upstream?.commit!==COMMIT||pkg.upstream?.tree!==TREE)fail('COMPONENT_SOURCE_CHANGED');
 const bindings=rows(parse(readPin(NATIVE,pkg.source_cut.bindings))),toolchain=rows(parse(readPin(NATIVE,pkg.toolchain.inventory)),2*1024*1024*1024);
 for(const r of bindings)if(!r.path.startsWith('codex-rs/'))fail('COMPONENT_SOURCE_CHANGED');
 const compiledBytes=Buffer.from(canonical({schema:'soloco-compiled-native-inputs-v1',upstream:{commit:COMMIT,tree:TREE},source_package_sha256:PACKAGE_SHA,files_count:bindings.length,files:bindings}));
 for(const pin of [pkg.source_cut.handoff,pkg.source_cut.patch,pkg.upstream.inventory,...pkg.upstream.attribution,...pkg.overlay.map(v=>v.payload),pkg.cargo_lock,pkg.toolchain.official_manifest])readPin(NATIVE,pin);
 const sidecarSource=stableRead(path.join(REPO,SIDECAR)),helper=pkg.sidecar_capture;
 if(!exact(helper,['protocol','source','binary','arguments','target','flags'])||helper.protocol!=='soloco-origin-sidecar-source-build-v1'||!same(helper.source,{path:SIDECAR,...ref(sidecarSource)})||helper.binary!=='origin-sidecar-capture'||!same(helper.arguments,['origin-sidecar-capture-v1'])||helper.target!=='arm64-apple-macos11.0'||!same(helper.flags,SIDECAR_FLAGS))fail('COMPONENT_SOURCE_CHANGED');
 const nodeRows=treeRows(path.join(REPO,'plugins/soloco'),'plugins/soloco',MAX_NODE,MAX_NODE,true);nodeRows.push({path:'tools/build-peer-context.mjs',...ref(stableRead(ENTRY)),mode:'100644'});nodeRows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);rows(nodeRows,MAX_NODE);
 const nodeBytes=Buffer.from(canonical({schema:'soloco-node-peer-context-inputs-v1',files:nodeRows,roots:nodeRows.map(v=>v.path),edges:[]}));
 const codec=stableRead(path.join(path.dirname(HERE),'peer-delivery-frame.mjs')),resource=stableRead(path.join(path.dirname(HERE),'peer-context-contract-v2.json'));
 if(sha(codec)!=='e174dee61f38567b3c01ae4a2593612a664b8434a775478c091aae532ef30746'||sha(resource)!=='832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc')fail('COMPONENT_SOURCE_CHANGED');
 const runtimeBytes=stableRead(fs.realpathSync(process.execPath),256*1024*1024),pythonBytes=readFixedPublicPython(),profileBytes=Buffer.from(canonical({protocol:'context-component-build-profile-v1',version:process.version,platform:process.platform,arch:process.arch,node:ref(runtimeBytes),exec_argv:process.execArgv,python:ref(pythonBytes),python_flags:['-I','-S'],entry:'tools/build-peer-context.mjs',target:TARGET,driver_timeout_seconds:BUILD_SECONDS}));
 const selectionBytes=Buffer.from(canonical({protocol:'context-component-selection-v1',entry:'codex-soloco-protected-host',target:TARGET,resource:ref(resource),result_kind:'COMPILED_COMPONENT',domain_closure:'unestablished'}));
 const inputs={protocol:'soloco-context-build-input-data-v1',owner_epoch:owner,native:{source_package:ref(packageBytes),compiled_manifest:ref(compiledBytes),cargo_lock:ref(readPin(NATIVE,pkg.cargo_lock)),toolchain_manifest:ref(readPin(NATIVE,pkg.toolchain.official_manifest)),build_driver:ref(driverBytes)},node:{manifest:ref(nodeBytes),executable:ref(runtimeBytes),codec:ref(codec),resource:ref(resource),profile:ref(profileBytes)},selection:ref(selectionBytes)};
 return {owner,inputs,commitment:formatContextBuildInputData(inputs),pkg,bindings,toolchain,compiledBytes,nodeBytes,nodeRows,profileBytes,selectionBytes,driver,python:ref(pythonBytes)};
}
function preparedInputs(c){
 const prepared=path.join(ROOT,'inputs',PACKAGE_SHA,'prepared'),toolchain=path.join(ROOT,'toolchain'),cache=path.join(ROOT,'cargo-home');
 try{
  const record=parse(stableRead(path.join(prepared,'prepared-source.json')));if(!same(record,{schema:'soloco-prepared-native-source-v1',manifest_sha256:PACKAGE_SHA,files:c.bindings,source_compiled:false,native_qualified:false}))fail('COMPONENT_SOURCE_CHANGED');
  verifyTree(path.join(prepared,'source'),c.bindings,128*1024*1024);verifyTree(toolchain,c.toolchain,2*1024*1024*1024);
  noLinks(cache);const names=fs.readdirSync(cache);if(!names.some(v=>['registry','git'].includes(v))||names.some(v=>!['registry','git','.package-cache','.package-cache-mutate','.global-cache','.global-cache-shm','.global-cache-wal','.global-cache-journal'].includes(v)))fail('COMPONENT_SOURCE_CHANGED');
 }catch(e){if(errors.has(e))throw e;fail('COMPONENT_PREPARED_INPUTS_UNAVAILABLE');}
 return {prepared,toolchain,cache};
}
function privateDirectory(directory){
 noLinks(directory);const absent=[];for(let p=directory;!fs.existsSync(p);p=path.dirname(p))absent.push(p);
 for(const p of absent.reverse()){try{fs.mkdirSync(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}if(!fs.lstatSync(p).isDirectory())fail('COMPONENT_PRIVATE_ROOT_CHANGED');fsyncDirectory(p);fsyncDirectory(path.dirname(p));}
 const st=fs.lstatSync(directory);if(!st.isDirectory()||(st.mode&0o077)!==0||st.uid!==process.getuid())fail('COMPONENT_PRIVATE_ROOT_CHANGED');return directory;
}
const fsyncDirectory=directory=>{const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
function syncRootAncestry(){for(let p=ROOT;;p=path.dirname(p)){fsyncDirectory(p);if(p===REPO)break;if(path.dirname(p)===p)fail('COMPONENT_PATH_CHANGED');}}
function syncDirectoryTree(root){let visited=0;function walk(p,depth){if(depth>32||++visited>40000)fail('COMPONENT_ARTIFACT_CHANGED');noLinks(p);for(const name of fs.readdirSync(p)){const child=path.join(p,name),st=fs.lstatSync(child);if(st.isDirectory())walk(child,depth+1);else if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)fail('COMPONENT_ARTIFACT_CHANGED');}fsyncDirectory(p);}walk(root,0);}
function writeImmutable(file,bytes){privateDirectory(path.dirname(file));const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o444);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fsyncDirectory(path.dirname(file));}
function openJournal(mode='write'){
 const create=mode==='create',readOnly=mode==='read';
 if(!create&&!fs.existsSync(JOURNAL))fail('COMPONENT_NOT_PREPARED');
 if(readOnly){noLinks(ROOT);const st=fs.lstatSync(ROOT);if(!st.isDirectory()||(st.mode&0o077)!==0||st.uid!==process.getuid())fail('COMPONENT_PRIVATE_ROOT_CHANGED');}
 else{privateDirectory(ROOT);syncRootAncestry();}noLinks(JOURNAL);let created=false;
 if(!fs.existsSync(JOURNAL)){if(readOnly)fail('COMPONENT_NOT_PREPARED');if(fs.existsSync(ANCHOR))fail('COMPONENT_JOURNAL_CHANGED');const fd=fs.openSync(JOURNAL,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);fs.fsyncSync(fd);fs.closeSync(fd);fsyncDirectory(ROOT);created=true;}
 const st=fs.lstatSync(JOURNAL);if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077)!==0)fail('COMPONENT_PRIVATE_ROOT_CHANGED');
 const raw=fs.lstatSync(JOURNAL,{bigint:true}),identity={protocol:'context-component-journal-anchor-v1',dev:String(raw.dev),ino:String(raw.ino)};
 if(created)writeImmutable(ANCHOR,Buffer.from(canonical(identity)));else if(!fs.existsSync(ANCHOR)||!same(parse(stableRead(ANCHOR,4096)),identity))fail('COMPONENT_JOURNAL_CHANGED');
 const db=new DatabaseSync(JOURNAL,{readOnly});try{db.exec('PRAGMA busy_timeout=1000; PRAGMA trusted_schema=OFF;');
  if(!readOnly)db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
  if(create)db.exec('CREATE TABLE IF NOT EXISTS intents(intent_key TEXT PRIMARY KEY,owner_sha256 TEXT NOT NULL,generation INTEGER NOT NULL,input_key TEXT NOT NULL,revision INTEGER NOT NULL,record TEXT NOT NULL,record_sha256 TEXT NOT NULL,UNIQUE(owner_sha256,generation,input_key)); CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,intent_key TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL);');
  if(db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('trigger','view') LIMIT 1").get())fail('COMPONENT_JOURNAL_CHANGED');return db;
 }catch(e){db.close();throw e;}
}
function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}}
function rowState(row){if(!row)fail('COMPONENT_NOT_PREPARED');const state=parse(Buffer.from(row.record));const checked=inspectContextBuildIntentData(state);if(checked.encoded!==row.record||checked.sha256!==row.record_sha256||state.revision!==row.revision||state.intent_key!==row.intent_key||state.input_key!==row.input_key||state.inputs.owner_epoch.owner_sha256!==row.owner_sha256||state.inputs.owner_epoch.generation!==row.generation)fail('COMPONENT_JOURNAL_CHANGED');return checked.record;}
function readState(db,key){return rowState(db.prepare('SELECT * FROM intents WHERE intent_key=?').get(key));}
function event(db,key,kind,body){return Number(db.prepare('INSERT INTO events(intent_key,kind,body) VALUES(?,?,?)').run(key,kind,canonical(body)).lastInsertRowid);}
function prepareIntent(db,inputs){
 const fresh=createContextBuildIntentData(inputs),checked=inspectContextBuildIntentData(fresh);
 return transaction(db,()=>{db.prepare('INSERT OR IGNORE INTO intents VALUES(?,?,?,?,?,?,?)').run(fresh.intent_key,inputs.owner_epoch.owner_sha256,inputs.owner_epoch.generation,fresh.input_key,0,checked.encoded,checked.sha256);const state=readState(db,fresh.intent_key);if(!same(state.inputs,inputs))fail('COMPONENT_JOURNAL_CHANGED');return state;});
}
function advance(db,state,operation,details){
 return transaction(db,()=>{
  if(operation==='select-output')details={...details,selection_sequence:Number(db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS n FROM events').get().n)};
  const next=advanceContextBuildIntentData(state,{expected_revision:state.revision,operation,details}),cas=next.compare_and_swap,checked=inspectContextBuildIntentData(next.next);
  const changed=db.prepare('UPDATE intents SET revision=?,record=?,record_sha256=? WHERE intent_key=? AND input_key=? AND revision=? AND record_sha256=?').run(next.next.revision,checked.encoded,checked.sha256,cas.intent_key,cas.input_key,cas.expected_revision,cas.expected_sha256);if(Number(changed.changes)!==1)fail('COMPONENT_RESERVATION_LOST');
  const sequence=event(db,state.intent_key,operation,{revision:next.next.revision,record_sha256:checked.sha256});if(operation==='select-output'&&sequence!==next.next.selection_sequence)fail('COMPONENT_JOURNAL_CHANGED');return next.next;
 });
}
function withJournal(fn,mode='write'){const db=openJournal(mode);try{return fn(db);}finally{db.close();}}
function unknown(key){try{return withJournal(db=>{const s=readState(db,key);return ['SPAWN_RESERVED','BORN'].includes(s.phase)?advance(db,s,'record-unknown',{reason:s.phase==='BORN'?'PROCESS_OUTCOME_UNKNOWN':'BIRTH_UNOBSERVED'}):s;});}catch{return null;}}
function audit(key,kind,body){try{withJournal(db=>transaction(db,()=>event(db,key,kind,body)));return true;}catch{return false;}}
const held=state=>({protocol:'soloco-context-component-command-v1',status:'HELD',code:['SPAWN_RESERVED','BORN','UNKNOWN'].includes(state?.phase)?'COMPONENT_OUTCOME_UNKNOWN':'COMPONENT_RETAINED_WITHOUT_RETRY',intent_key:state?.intent_key??null,phase:state?.phase??'UNKNOWN',domain_closure:'unestablished'});
function fixedRequest(c,paths,work){return {file:PYTHON,args:['-I','-S',c.driver,'build','--prepared',paths.prepared,'--toolchain',paths.toolchain,'--cargo-home',paths.cache,'--output',path.join(work,'compiler-output'),'--timeout',String(BUILD_SECONDS)],cwd:NATIVE,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',OPENSSL_CONF:'/dev/null'},shell:false};}
function persistIntentInputs(c,paths,state,work){
 const root=path.join(work,'intent-source');fs.mkdirSync(root,{mode:0o700});
 for(const row of c.nodeRows){const bytes=stableRead(path.join(REPO,row.path));if(!same(ref(bytes),{bytes:row.bytes,sha256:row.sha256}))fail('COMPONENT_SOURCE_CHANGED');writeImmutable(path.join(root,'node-source',row.path),bytes);}
 writeImmutable(path.join(root,'node-inputs.json'),c.nodeBytes);writeImmutable(path.join(root,'node-profile.json'),c.profileBytes);writeImmutable(path.join(root,'selection.json'),c.selectionBytes);writeImmutable(path.join(root,'expected-rust-inputs.json'),c.compiledBytes);
 const pkg=stableRead(path.join(NATIVE,'source-package.json')),driver=stableRead(c.driver);if(sha(pkg)!==PACKAGE_SHA||sha(driver)!==DRIVER_SHA)fail('COMPONENT_SOURCE_CHANGED');writeImmutable(path.join(root,'native-source-package.json'),pkg);writeImmutable(path.join(root,'native-build-driver.py'),driver);
 writeImmutable(path.join(root,'original-request.json'),Buffer.from(canonical({protocol:'context-component-original-request-v1',intent_key:state.intent_key,input_key:state.input_key,reservation_sha256:state.reservation_sha256,request:fixedRequest(c,paths,work),stdio:{stdin:'ignore',stdout:path.join(work,'driver-stdout.log'),stderr:path.join(work,'driver-stderr.log')},domain_closure:'unestablished'})));fsyncDirectory(root);fsyncDirectory(work);
}
function runDriver(c,paths,state,work){
 // The caller already COMMITTED the winning reserve CAS. No provider chosen
 // argv/env/transport exists on this original production path.
 const output=path.join(work,'compiler-output');let stdout,stderr;
 return new Promise(resolve=>{
  let child,born=false,closed=false,finished=false,persistenceFailed=false,errorSeen=false,timeout=false,termTimer,killTimer;
  const finish=value=>{if(!finished){finished=true;resolve(value);}};
  try{
   stdout=fs.openSync(path.join(work,'driver-stdout.log'),'wx',0o600);stderr=fs.openSync(path.join(work,'driver-stderr.log'),'wx',0o600);
   // LAST complete source check occurs after intent/log I/O and before spawn.
   if(collectInputs().commitment.input_key!==c.commitment.input_key||sha(readFixedPublicPython())!==c.python.sha256)fail('COMPONENT_SOURCE_CHANGED');
   const request=fixedRequest(c,paths,work);child=spawn(request.file,request.args,{cwd:request.cwd,env:request.env,stdio:['ignore',stdout,stderr],shell:request.shell});
   pending.set(state.intent_key,child);
   child.on('error',()=>{errorSeen=true;unknown(state.intent_key);});
   child.once('spawn',()=>{born=true;const process_sha256=sha(canonical({intent_key:state.intent_key,reservation_sha256:state.reservation_sha256,pid:child.pid,started_at:new Date().toISOString(),python:c.python,driver_sha256:DRIVER_SHA}));
    try{state=withJournal(db=>advance(db,readState(db,state.intent_key),'observe-birth',{reservation_sha256:state.reservation_sha256,process_sha256}));}catch{persistenceFailed=true;unknown(state.intent_key);}
   });
   child.once('close',(code,signal)=>{
    closed=true;clearTimeout(termTimer);clearTimeout(killTimer);pending.delete(state.intent_key);for(const fd of [stdout,stderr])try{fs.closeSync(fd);}catch{persistenceFailed=true;}
    // File log descriptors are closed here; no pipe EOF or descendant proof.
    const observation={pid:Number.isSafeInteger(child.pid)?child.pid:null,exit_code:Number.isSafeInteger(code)?code:null,signal:typeof signal==='string'?signal:null,born,timeout,error_seen:errorSeen,domain_closure:'unestablished'};
    if(!audit(state.intent_key,'original-driver-direct-close',observation))persistenceFailed=true;
    try{const prior=withJournal(db=>readState(db,state.intent_key));if(!born||timeout||errorSeen||persistenceFailed||prior.phase!=='BORN'){finish({state:unknown(state.intent_key)??prior,output:null});return;}
     state=withJournal(db=>advance(db,prior,'observe-direct-close',{process_sha256:prior.process_sha256,exit_code:observation.exit_code,signal:observation.signal,error_code:null}));
     finish({state,output:code===0&&signal===null?output:null});
    }catch{finish({state:unknown(state.intent_key),output:null});}
   });
   termTimer=setTimeout(()=>{timeout=true;unknown(state.intent_key);if(!closed)try{child.kill('SIGTERM');}catch{}killTimer=setTimeout(()=>{if(!closed)try{child.kill('SIGKILL');}catch{}finish({state:unknown(state.intent_key),output:null});},5000);},BUILD_SECONDS*1000);
  }catch{if(!child)for(const fd of [stdout,stderr])if(fd!==undefined)try{fs.closeSync(fd);}catch{}unknown(state.intent_key);finish({state:unknown(state.intent_key),output:null});}
 });
}
function verifyReceipt(receipt,output,manifestBytes,binaryBytes,helperBytes){
 const binary=path.join(output,'target',TARGET,'release/codex-soloco-protected-host');
 if(!object(receipt)||receipt.schema!=='soloco-native-source-build-receipt-v1'||receipt.status!=='compiled-source-only'||receipt.exit_code!==0||receipt.manifest_sha256!==PACKAGE_SHA||receipt.native_qualified!==false||receipt.source_slot_populated!==false||receipt.descendant_or_remote_closure!=='not established'||!same(receipt.compiled_source_manifest,{schema:'soloco-compiled-native-inputs-v1',path:path.join(output,'compiled-source-manifest.json'),...ref(manifestBytes)})||!same(receipt.binary,{path:binary,...ref(binaryBytes)}))fail('COMPONENT_BUILD_RECEIPT_CHANGED');
 const h=receipt.sidecar_capture,source=stableRead(path.join(REPO,SIDECAR)),helperBinary=path.join(output,'origin-sidecar-capture'),sourceCopy=path.join(output,'origin-sidecar-capture.c');
 if(!h||h.protocol!=='soloco-origin-sidecar-source-build-v1'||h.status!=='compiled-source-only'||h.exit_code!==0||h.native_qualified!==false||!same(h.source,{path:SIDECAR,...ref(source)})||h.source_copy!==sourceCopy||!same(h.arguments,['origin-sidecar-capture-v1'])||!same(h.compiler_argv,[SELECTED_CLANG,...SIDECAR_FLAGS,'-isysroot',SELECTED_SDK,sourceCopy,'-o',helperBinary])||!same(h.binary,{path:helperBinary,...ref(helperBytes),mode:'100555'})||receipt.selected_sdk?.compiler!==SELECTED_CLANG||receipt.selected_sdk?.sdk_root!==SELECTED_SDK)fail('COMPONENT_BUILD_RECEIPT_CHANGED');
}
function successfulReceipt(c,output){
 const receiptBytes=stableRead(path.join(output,'receipt.json'),16*1024*1024),receipt=parse(receiptBytes),manifestBytes=stableRead(path.join(output,'compiled-source-manifest.json'),16*1024*1024);
 const binary=path.join(output,'target',TARGET,'release/codex-soloco-protected-host');
 if(!manifestBytes.equals(c.compiledBytes))fail('COMPONENT_BUILD_RECEIPT_CHANGED');
 const binaryBytes=stableRead(binary,256*1024*1024),helperBytes=stableRead(path.join(output,'origin-sidecar-capture'),16*1024*1024);if((fs.lstatSync(path.join(output,'origin-sidecar-capture')).mode&0o777)!==0o555)fail('COMPONENT_BUILD_RECEIPT_CHANGED');verifyReceipt(receipt,output,manifestBytes,binaryBytes,helperBytes);return {receiptBytes,manifestBytes,binaryBytes,helperBytes,receipt,binary};
}
function sealComponent(c,state,output){
 if(collectInputs().commitment.input_key!==c.commitment.input_key)fail('COMPONENT_SOURCE_CHANGED');const built=successfulReceipt(c,output);
 const final=path.join(ROOT,'sealed',state.intent_key),staging=path.join(ROOT,'sealing',state.intent_key);privateDirectory(path.dirname(staging));privateDirectory(path.dirname(final));if(fs.existsSync(staging)||fs.existsSync(final))fail('COMPONENT_UNSELECTED_ORPHAN');fs.mkdirSync(staging,{mode:0o700});
 const mappings=[];function copy(from,to,expected){const bytes=stableRead(from,256*1024*1024);if(expected&&!same(ref(bytes),expected))fail('COMPONENT_ARTIFACT_CHANGED');relative(to);writeImmutable(path.join(staging,to),bytes);mappings.push({original_path:from,sealed_path:to,...ref(bytes)});return ref(bytes);}
 const manifest=copy(path.join(output,'compiled-source-manifest.json'),'native/compiled-source-manifest.json',ref(built.manifestBytes));
 const receipt=copy(path.join(output,'receipt.json'),'native/build-receipt.json',ref(built.receiptBytes));
 const executable=copy(built.binary,'native/executable',ref(built.binaryBytes));
 copy(path.join(output,'origin-sidecar-capture'),'native/origin-sidecar-capture',ref(built.helperBytes));
 copy(path.join(NATIVE,'source-package.json'),'native/source-package.json',c.inputs.native.source_package);copy(path.join(NATIVE,c.pkg.cargo_lock.path),'native/Cargo.lock',c.inputs.native.cargo_lock);copy(path.join(NATIVE,c.pkg.toolchain.official_manifest.path),'native/toolchain-manifest.toml',c.inputs.native.toolchain_manifest);
 for(const row of c.nodeRows)copy(path.join(REPO,row.path),'node-source/'+row.path,{bytes:row.bytes,sha256:row.sha256});
 writeImmutable(path.join(staging,'node-inputs.json'),c.nodeBytes);writeImmutable(path.join(staging,'node-profile.json'),c.profileBytes);writeImmutable(path.join(staging,'selection.json'),c.selectionBytes);
 const recipe={protocol:'soloco-context-component-copy-recipe-v1',result_kind:'COMPILED_COMPONENT',input_key:state.input_key,intent_key:state.intent_key,reservation_sha256:state.reservation_sha256,process_sha256:state.process_sha256,domain_closure:'unestablished',original_build_receipt:ref(built.receiptBytes),copies:mappings,node_manifest:c.inputs.node.manifest};
 const recipeBytes=Buffer.from(canonical(recipe));writeImmutable(path.join(staging,'recipe.json'),recipeBytes);
 const files=treeRows(staging,'',256*1024*1024,512*1024*1024);rows(files,512*1024*1024);const capsule={protocol:'soloco-context-component-capsule-v1',input_key:state.input_key,intent_key:state.intent_key,result_kind:'COMPILED_COMPONENT',domain_closure:'unestablished',files};const capsuleBytes=Buffer.from(canonical(capsule));writeImmutable(path.join(staging,'capsule-manifest.json'),capsuleBytes);
 const association={protocol:'soloco-context-build-output-data-v1',result_kind:'COMPILED_COMPONENT',input_key:state.input_key,intent_key:state.intent_key,reservation_sha256:state.reservation_sha256,process_sha256:state.process_sha256,compiled_manifest:manifest,node_manifest:c.inputs.node.manifest,executable,build_receipt:receipt,recipe:ref(recipeBytes),capsule_manifest:ref(capsuleBytes)};
 const formatted=formatContextBuildOutputData(c.inputs,association);writeImmutable(path.join(staging,'output.json'),Buffer.from(formatted.encoded));
 // Sealed path depends on PREEXISTING intent, never on output's own digest.
 // Full capsule durability precedes journal selection; crash orphans stay raw.
 syncDirectoryTree(staging);fs.renameSync(staging,final);fsyncDirectory(path.dirname(staging));fsyncDirectory(path.dirname(final));
 return association;
}
function lookupComponent(c,state,selection){
 if(state.phase!=='OUTPUT_SELECTED'||!same(state.inputs,c.inputs))fail('COMPONENT_NOT_SELECTED');const directory=path.join(ROOT,'sealed',state.intent_key),outputBytes=stableRead(path.join(directory,'output.json'),16*1024*1024),record=parse(outputBytes);
 const formatted=formatContextBuildOutputData(c.inputs,record);if(!same(record,state.output))fail('COMPONENT_ARTIFACT_CHANGED');
 const capsuleBytes=stableRead(path.join(directory,'capsule-manifest.json'),16*1024*1024);if(!same(ref(capsuleBytes),record.capsule_manifest))fail('COMPONENT_ARTIFACT_CHANGED');const capsule=parse(capsuleBytes);
 if(!exact(capsule,['protocol','input_key','intent_key','result_kind','domain_closure','files'])||capsule.protocol!=='soloco-context-component-capsule-v1'||capsule.input_key!==state.input_key||capsule.intent_key!==state.intent_key||capsule.result_kind!=='COMPILED_COMPONENT'||capsule.domain_closure!=='unestablished')fail('COMPONENT_ARTIFACT_CHANGED');rows(capsule.files,512*1024*1024);
 const expected=new Set([...capsule.files.map(v=>v.path),'capsule-manifest.json','output.json']);const actual=treeRows(directory,'',256*1024*1024,512*1024*1024);if(actual.length!==expected.size||actual.some(v=>!expected.has(v.path)||(fs.lstatSync(path.join(directory,v.path)).mode&0o777)!==0o444))fail('COMPONENT_ARTIFACT_CHANGED');for(const r of capsule.files){const bytes=stableRead(path.join(directory,r.path),256*1024*1024);if(!same(ref(bytes),{bytes:r.bytes,sha256:r.sha256}))fail('COMPONENT_ARTIFACT_CHANGED');}
 if(!stableRead(path.join(directory,'node-inputs.json'),16*1024*1024).equals(c.nodeBytes)||!stableRead(path.join(directory,'node-profile.json'),16*1024*1024).equals(c.profileBytes)||!stableRead(path.join(directory,'selection.json'),16*1024*1024).equals(c.selectionBytes))fail('COMPONENT_ARTIFACT_CHANGED');
 const recipeBytes=stableRead(path.join(directory,'recipe.json'),16*1024*1024);if(!same(ref(recipeBytes),record.recipe))fail('COMPONENT_ARTIFACT_CHANGED');const recipe=parse(recipeBytes);
 if(!exact(recipe,['protocol','result_kind','input_key','intent_key','reservation_sha256','process_sha256','domain_closure','original_build_receipt','copies','node_manifest'])||recipe.protocol!=='soloco-context-component-copy-recipe-v1'||recipe.result_kind!=='COMPILED_COMPONENT'||recipe.input_key!==state.input_key||recipe.intent_key!==state.intent_key||recipe.reservation_sha256!==state.reservation_sha256||recipe.process_sha256!==state.process_sha256||recipe.domain_closure!=='unestablished'||!same(recipe.node_manifest,c.inputs.node.manifest)||!Array.isArray(recipe.copies)||recipe.copies.length!==c.nodeRows.length+7)fail('COMPONENT_ARTIFACT_CHANGED');
 const originals=new Map([[path.join(ROOT,'operations',state.intent_key,'compiler-output/origin-sidecar-capture'),'native/origin-sidecar-capture'],[path.join(ROOT,'operations',state.intent_key,'compiler-output/compiled-source-manifest.json'),'native/compiled-source-manifest.json'],[path.join(ROOT,'operations',state.intent_key,'compiler-output/receipt.json'),'native/build-receipt.json'],[path.join(ROOT,'operations',state.intent_key,'compiler-output/target',TARGET,'release/codex-soloco-protected-host'),'native/executable'],[path.join(NATIVE,'source-package.json'),'native/source-package.json'],[path.join(NATIVE,c.pkg.cargo_lock.path),'native/Cargo.lock'],[path.join(NATIVE,c.pkg.toolchain.official_manifest.path),'native/toolchain-manifest.toml'],...c.nodeRows.map(v=>[path.join(REPO,v.path),'node-source/'+v.path])]);
 for(const mapping of recipe.copies){if(!exact(mapping,['original_path','sealed_path','bytes','sha256'])||originals.get(mapping.original_path)!==mapping.sealed_path)fail('COMPONENT_ARTIFACT_CHANGED');originals.delete(mapping.original_path);const b=stableRead(path.join(directory,relative(mapping.sealed_path)),256*1024*1024);if(!same(ref(b),{bytes:mapping.bytes,sha256:mapping.sha256}))fail('COMPONENT_ARTIFACT_CHANGED');}if(originals.size)fail('COMPONENT_ARTIFACT_CHANGED');
 const receiptBytes=stableRead(path.join(directory,'native/build-receipt.json'),16*1024*1024),receipt=parse(receiptBytes),manifestBytes=stableRead(path.join(directory,'native/compiled-source-manifest.json'),16*1024*1024),binaryBytes=stableRead(path.join(directory,'native/executable'),256*1024*1024);
 if(!same(ref(receiptBytes),record.build_receipt)||!same(recipe.original_build_receipt,record.build_receipt)||!same(ref(manifestBytes),record.compiled_manifest)||!manifestBytes.equals(c.compiledBytes)||!same(ref(binaryBytes),record.executable))fail('COMPONENT_ARTIFACT_CHANGED');verifyReceipt(receipt,path.join(ROOT,'operations',state.intent_key,'compiler-output'),manifestBytes,binaryBytes,stableRead(path.join(directory,'native/origin-sidecar-capture'),16*1024*1024));
 const command=Object.freeze({protocol:'soloco-context-component-command-v1',status:'COMPILED_COMPONENT',result_kind:'COMPILED_COMPONENT',input_key:state.input_key,intent_key:state.intent_key,output_sha256:formatted.sha256,domain_closure:'unestablished',qualified_interpreter:'HELD',claims_released:false});
 if(selection===SELECTED_COMPONENT_DATA){
  // Retain original bytes and documents from this SAME verified lookup. This
  // data branch does not rewrite receipt paths, modes, Node closure or authority.
  if(!outputBytes.equals(Buffer.from(formatted.encoded))||sha(outputBytes)!==formatted.sha256)fail('COMPONENT_ARTIFACT_CHANGED');
  const document=(name,bytes,value)=>({path:path.join(directory,name),...ref(bytes),record:value});
  return {protocol:'soloco-selected-context-component-data-v1',kind:'SELECTED_COMPILED_COMPONENT_DATA',command,owner_epoch:c.owner,input_key:state.input_key,intent_key:state.intent_key,journal_selection:{phase:state.phase,revision:state.revision,selection_sequence:state.selection_sequence,state_record_sha256:inspectContextBuildIntentData(state).sha256},component_root:directory,
   output:document('output.json',outputBytes,record),recipe:document('recipe.json',recipeBytes,recipe),capsule:document('capsule-manifest.json',capsuleBytes,capsule),
   node_inputs:document('node-inputs.json',c.nodeBytes,parse(c.nodeBytes)),node_profile:document('node-profile.json',c.profileBytes,parse(c.profileBytes)),selection:document('selection.json',c.selectionBytes,parse(c.selectionBytes)),copies:recipe.copies,
   domain_closure:'unestablished',qualified_interpreter:'HELD',claims_released:false,native_qualified:false};
 }
 return command;
}
function selectedJournalIdentity(){
 noLinks(ROOT);noLinks(JOURNAL);noLinks(ANCHOR);
 let directory,journal,anchor;
 try{directory=fs.lstatSync(ROOT,{bigint:true});journal=fs.lstatSync(JOURNAL,{bigint:true});anchor=fs.lstatSync(ANCHOR,{bigint:true});}
 catch(e){if(e.code==='ENOENT')fail('COMPONENT_NOT_PREPARED');throw e;}
 if(!directory.isDirectory()||(directory.mode&0o077n)!==0n||directory.uid!==BigInt(process.getuid())||!journal.isFile()||journal.nlink!==1n||(journal.mode&0o077n)!==0n||journal.uid!==BigInt(process.getuid()))fail('COMPONENT_PRIVATE_ROOT_CHANGED');
 if(!anchor.isFile()||anchor.nlink!==1n||anchor.uid!==BigInt(process.getuid())||(anchor.mode&0o777n)!==0o444n)fail('COMPONENT_JOURNAL_CHANGED');
 const bytes=stableRead(ANCHOR,4096),after=fs.lstatSync(ANCHOR,{bigint:true});
 for(const k of ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'])if(anchor[k]!==after[k])fail('COMPONENT_JOURNAL_CHANGED');
 if(!same(parse(bytes),{protocol:'context-component-journal-anchor-v1',dev:String(journal.dev),ino:String(journal.ino)}))fail('COMPONENT_JOURNAL_CHANGED');
 return {root:{dev:String(directory.dev),ino:String(directory.ino)},journal:{dev:String(journal.dev),ino:String(journal.ino)},anchor:{dev:String(anchor.dev),ino:String(anchor.ino),...ref(bytes)}};
}
function frozenSelectedData(value){
 const detached=JSON.parse(JSON.stringify(value));
 const freeze=v=>{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
 return freeze(detached);
}
function currentSelectedComponentData(){
 const c=collectInputs(),identity=selectedJournalIdentity();
 return withJournal(db=>{
  const before=readState(db,c.commitment.intent_key),data=lookupComponent(c,before,SELECTED_COMPONENT_DATA);
  // A read-only inspection cannot promote a stale source or an old SQLite
  // connection after journal/anchor replacement. This is a finite observed cut,
  // under the module's existing trusted-source/host assumption, not attestation.
  const current=collectInputs(),after=readState(db,c.commitment.intent_key);
  if(!same(current.inputs,c.inputs)||!same(current.owner,c.owner)||!same(after,before)||!same(selectedJournalIdentity(),identity))fail('COMPONENT_SELECTED_DATA_CHANGED');
  return frozenSelectedData({...data,journal_identity:identity});
 },'read');
}
export function lookupOriginalSelectedContextComponentData(...args){
 if(args.length)fail('COMPONENT_NO_ARGUMENTS');
 const data=currentSelectedComponentData(),handle=Object.freeze(Object.create(null));
 selectedDataHandles.set(handle,{selection_sha256:sha(canonical(data))});return handle;
}
export function inspectOriginalSelectedContextComponentData(handle,...args){
 if(args.length)fail('COMPONENT_NO_ARGUMENTS');const retained=selectedDataHandles.get(handle);if(!retained)fail('COMPONENT_DATA_HANDLE_REQUIRED');
 const data=currentSelectedComponentData();if(sha(canonical(data))!==retained.selection_sha256)fail('COMPONENT_SELECTED_DATA_CHANGED');return data;
}
export function inspectOriginalContextComponent(...args){if(args.length)fail('COMPONENT_NO_ARGUMENTS');const c=collectInputs();return withJournal(db=>{const s=readState(db,c.commitment.intent_key);return s.phase==='OUTPUT_SELECTED'?lookupComponent(c,s):held(s);},'read');}
export async function buildOriginalContextComponent(...args){
 if(args.length)fail('COMPONENT_NO_ARGUMENTS');const c=collectInputs(),paths=preparedInputs(c);let state=withJournal(db=>prepareIntent(db,c.inputs),'create');
 if(state.phase!=='PREPARED')return state.phase==='OUTPUT_SELECTED'?lookupComponent(c,state):held(state);
 state=withJournal(db=>advance(db,state,'reserve-spawn',{reservation_sha256:sha(randomBytes(32))}));
 let work;try{work=path.join(ROOT,'operations',state.intent_key);privateDirectory(path.dirname(work));fs.mkdirSync(work,{mode:0o700});fsyncDirectory(path.dirname(work));persistIntentInputs(c,paths,state,work);}catch{unknown(state.intent_key);return held(unknown(state.intent_key));}
 const ran=await runDriver(c,paths,state,work);if(!ran.output)return held(ran.state);state=ran.state;
 try{
  const association=sealComponent(c,state,ran.output);state=withJournal(db=>advance(db,state,'seal-output',{association}));
  state=withJournal(db=>advance(db,state,'select-output',{output_sha256:formatContextBuildOutputData(c.inputs,association).sha256}));
  return lookupComponent(c,state);
 }catch(e){audit(state.intent_key,'component-output-held',{code:contextComponentErrorCode(e)});return held(state);}
}
