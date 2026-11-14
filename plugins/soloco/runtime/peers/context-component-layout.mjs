// Fixed original developer/package paths. These SOURCE-owned handles and DATA
// are not execution permission or an installed-host/native attestation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {dataDir} from '../plugin-data.mjs';

const PACKAGE=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const REPO=path.resolve(PACKAGE,'../..');
const SELF=fileURLToPath(import.meta.url);
const NATIVE_PREFIX='producer-inputs/native/codex';
const SEAL='producer-inputs/native-recipe-inventory.json';
const C='plugins/soloco/helpers/origin-sidecar-capture.c';
const states=new WeakMap(),errors=new WeakMap();let developer,packaged;
const fail=code=>{const e=Object.assign(Error(code),{code});errors.set(e,code);throw e;};
export const originalComponentLayoutErrorCode=e=>errors.get(e);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
const sha=b=>createHash('sha256').update(b).digest('hex'),ref=b=>({bytes:b.length,sha256:sha(b)}),same=(a,b)=>canonical(a)===canonical(b);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function relative(v){if(typeof v!=='string'||!v||v.length>4096||v.includes('\\')||v.includes('\0')||path.isAbsolute(v)||v.split('/').some(x=>!x||x==='.'||x==='..'))fail('COMPONENT_LAYOUT_CHANGED');return v;}
function noLinks(file){if(typeof file!=='string'||!path.isAbsolute(file)||path.resolve(file)!==file)fail('COMPONENT_LAYOUT_CHANGED');for(let p=file;;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())fail('COMPONENT_LAYOUT_CHANGED');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===path.dirname(p))break;}}
function read(file,maximum=128*1024*1024){
 noLinks(file);const s=fs.lstatSync(file),fields=['dev','ino','size','mode','uid','gid','nlink','mtimeMs','ctimeMs'];
 if(!s.isFile()||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size<0||s.size>maximum)fail('COMPONENT_LAYOUT_CHANGED');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let error;
 try{const before=fs.fstatSync(fd);if(fields.some(k=>before[k]!==s[k]))fail('COMPONENT_LAYOUT_CHANGED');const b=Buffer.alloc(s.size);let n=0;while(n<b.length){const k=fs.readSync(fd,b,n,b.length-n,n);if(!k)fail('COMPONENT_LAYOUT_CHANGED');n+=k;}if(fs.readSync(fd,Buffer.alloc(1),0,1,b.length)||[fs.fstatSync(fd),fs.lstatSync(file)].some(x=>fields.some(k=>x[k]!==s[k])))fail('COMPONENT_LAYOUT_CHANGED');return b;}catch(e){error=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!error)throw e;}}
}
function directory(file,{privateMode=false,managed=false}={}){
 noLinks(file);let s;try{s=fs.lstatSync(file,{bigint:true});}catch(e){if(e.code==='ENOENT')fail('COMPONENT_NOT_PREPARED');throw e;}
 if(!s.isDirectory()||fs.realpathSync(file)!==file||(managed&&(s.uid!==BigInt(process.getuid())||(s.mode&0o022n)!==0n))||(privateMode&&(s.uid!==BigInt(process.getuid())||(s.mode&0o777n)!==0o700n)))fail('COMPONENT_PRIVATE_ROOT_CHANGED');
 return {path:file,dev:String(s.dev),ino:String(s.ino),uid:String(s.uid),gid:String(s.gid),mode:String(s.mode)};
}
function state(h){const s=states.get(h);if(!s)fail('COMPONENT_LAYOUT_ORIGINAL_REQUIRED');return s;}
function mint(kind){
 const installed=kind==='packaged-plugin-v1',managed=installed?dataDir():null,home=installed?path.resolve(process.env.CODEX_HOME??path.join(os.homedir(),'.codex')):null;
 if(installed&&(typeof managed!=='string'||!path.isAbsolute(managed)||path.resolve(managed)!==managed||managed!==path.join(home,'plugins/data/soloco')))fail('COMPONENT_MANAGED_DATA_UNAVAILABLE');
 const s={kind,paths:Object.freeze({protocol:'soloco-context-component-layout-v1',kind,source_root:installed?PACKAGE:REPO,package_root:PACKAGE,native_root:installed?path.join(PACKAGE,NATIVE_PREFIX):path.join(REPO,'native/codex'),entry:installed?path.join(PACKAGE,'producer/build-peer-context.mjs'):path.join(REPO,'tools/build-peer-context.mjs'),durable_root:installed?path.join(managed,'peer-context-component/v1'):path.join(REPO,'work/peer-context-component'),managed_data_root:managed,layout_source:SELF}),home,physical:null,observedJournal:false,witnesses:new Map()};
 const h=Object.freeze(Object.create(null));states.set(h,s);return h;
}
export function originalDeveloperComponentLayout(...args){if(args.length)fail('COMPONENT_NO_ARGUMENTS');return developer??=mint('developer-source-v1');}
export function originalPackagedComponentLayout(...args){if(args.length)fail('COMPONENT_NO_ARGUMENTS');return packaged??=mint('packaged-plugin-v1');}
export function originalComponentLayoutPaths(h){return state(h).paths;}
export function originalComponentNodePath(h,logical){
 const s=state(h),v=relative(logical);if(v.startsWith('plugins/soloco/'))return path.join(PACKAGE,v.slice('plugins/soloco/'.length));
 if(s.kind==='developer-source-v1'&&v==='tools/build-peer-context.mjs')return s.paths.entry;fail('COMPONENT_LAYOUT_CHANGED');
}
export function originalComponentNativePath(h,name){return path.join(state(h).paths.native_root,relative(name));}
function physical(h){
 const s=state(h),p=s.paths,source=directory(p.source_root),pkg=directory(PACKAGE);let durable=null,managed=null,parent=null;
 if(s.kind==='packaged-plugin-v1'){
  if(dataDir()!==p.managed_data_root||path.resolve(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'))!==s.home)fail('COMPONENT_LAYOUT_CHANGED');
  managed=directory(p.managed_data_root,{managed:true});
  if(PACKAGE===p.managed_data_root||PACKAGE.startsWith(p.managed_data_root+path.sep)||p.managed_data_root.startsWith(PACKAGE+path.sep))fail('COMPONENT_LAYOUT_CHANGED');
  parent=directory(path.dirname(p.durable_root),{privateMode:true});durable=directory(p.durable_root,{privateMode:true});
 }
 return {source,pkg,managed,parent,durable};
}
export function inspectOriginalComponentLayout(h){
 const s=state(h),now=physical(h);if(s.physical&&!same(s.physical,now))fail('COMPONENT_LAYOUT_CHANGED');if(!s.physical)s.physical=now;
 return Object.freeze({...s.paths,source_identity:Object.freeze({...now.source}),package_identity:Object.freeze({...now.pkg}),durable_identity:now.durable?Object.freeze({...now.durable}):null,managed_identity:now.managed?Object.freeze({...now.managed}):null});
}
function sync(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_DIRECTORY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function prepareOriginalPackagedComponentWorkspace(...args){
 if(args.length)fail('COMPONENT_NO_ARGUMENTS');const h=originalPackagedComponentLayout(),s=state(h),p=s.paths;
 // Only the explicit fixed Source operation publishes the two private children.
 directory(PACKAGE);if(dataDir()!==p.managed_data_root||path.resolve(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'))!==s.home)fail('COMPONENT_LAYOUT_CHANGED');
 const d=directory(p.managed_data_root,{managed:true});if(PACKAGE===p.managed_data_root||PACKAGE.startsWith(p.managed_data_root+path.sep)||p.managed_data_root.startsWith(PACKAGE+path.sep))fail('COMPONENT_LAYOUT_CHANGED');
 let createdB=false;for(const child of [path.dirname(p.durable_root),p.durable_root]){
  try{fs.mkdirSync(child,{mode:0o700});if(child===p.durable_root)createdB=true;sync(child);sync(path.dirname(child));}catch(e){if(e.code!=='EEXIST')throw e;}
  directory(child,{privateMode:true});if(!same(directory(p.managed_data_root,{managed:true}),d))fail('COMPONENT_LAYOUT_CHANGED');
 }
 inspectOriginalComponentLayout(h);
 // Only the winning new B publication may write its immutable original claim.
 // A crash leaving B without this witness is held, never repaired on retry.
 if(createdB)immutableWitness(path.join(p.durable_root,'workspace-origin.json'),workspaceOrigin(s));
 readWorkspaceOrigin(h);return h;
}
function immutableWitness(file,value){const body=Buffer.from(canonical(value)),fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,body);fs.fchmodSync(fd,0o444);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(path.dirname(file));}
function workspaceOrigin(s){return {protocol:'soloco-context-component-workspace-origin-v1',managed:directory(s.paths.managed_data_root,{managed:true}),parent:directory(path.dirname(s.paths.durable_root),{privateMode:true}),workspace:directory(s.paths.durable_root,{privateMode:true})};}
function witness(h,name){const s=state(h),file=path.join(s.paths.durable_root,name),body=read(file,16384),st=fs.lstatSync(file,{bigint:true});if(!st.isFile()||st.nlink!==1n||st.uid!==BigInt(process.getuid())||(st.mode&0o777n)!==0o444n)fail('COMPONENT_JOURNAL_CHANGED');const id={dev:String(st.dev),ino:String(st.ino),uid:String(st.uid),gid:String(st.gid),mode:String(st.mode),mtime:String(st.mtimeNs),ctime:String(st.ctimeNs),...ref(body)},prior=s.witnesses.get(name);if(prior&&!same(prior,id))fail('COMPONENT_JOURNAL_CHANGED');s.witnesses.set(name,id);return {body,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body))};}
function readWorkspaceOrigin(h){const s=state(h),r=witness(h,'workspace-origin.json');if(!same(r.value,workspaceOrigin(s))||!r.body.equals(Buffer.from(canonical(r.value))))fail('COMPONENT_JOURNAL_CHANGED');return r;}
export function assertOriginalComponentJournalInitialization(h){
 const s=state(h);if(s.kind!=='packaged-plugin-v1')return;inspectOriginalComponentLayout(h);const origin=readWorkspaceOrigin(h),p=s.paths;
 if(s.observedJournal||fs.existsSync(path.join(p.durable_root,'journal.sqlite'))||fs.existsSync(path.join(p.durable_root,'journal-anchor.json'))||fs.existsSync(path.join(p.durable_root,'journal-init.claim')))fail('COMPONENT_JOURNAL_CHANGED');
 // This claim is durably consumed BEFORE the first SQLite/anchor creation and
 // never deleted or renewed. Crash/partial publication retains a finite Hold.
 immutableWitness(path.join(p.durable_root,'journal-init.claim'),{protocol:'soloco-context-component-journal-initialization-v1',workspace_origin:ref(origin.body),workspace:directory(p.durable_root,{privateMode:true})});
 assertOriginalComponentJournalWitnesses(h);
}
export function assertOriginalComponentJournalWitnesses(h){const s=state(h);if(s.kind!=='packaged-plugin-v1')return;inspectOriginalComponentLayout(h);const origin=readWorkspaceOrigin(h),claim=witness(h,'journal-init.claim'),expected={protocol:'soloco-context-component-journal-initialization-v1',workspace_origin:ref(origin.body),workspace:directory(s.paths.durable_root,{privateMode:true})};if(!same(claim.value,expected)||!claim.body.equals(Buffer.from(canonical(expected))))fail('COMPONENT_JOURNAL_CHANGED');}
export function retainOriginalComponentJournalObservation(h){const s=state(h);s.observedJournal=true;assertOriginalComponentJournalWitnesses(h);}
export function syncOriginalComponentRootAncestry(h){
 const s=state(h),p=s.paths;if(s.kind==='developer-source-v1'){for(let at=p.durable_root;;at=path.dirname(at)){sync(at);if(at===p.source_root)break;if(at===path.dirname(at))fail('COMPONENT_LAYOUT_CHANGED');}return;}
 inspectOriginalComponentLayout(h);for(const at of [p.durable_root,path.dirname(p.durable_root),p.managed_data_root])sync(at);
}

export function inspectOriginalPackagedRecipeInventory(h,packageBytes,driverBytes){
 const s=state(h);
 const pkg=JSON.parse(packageBytes.toString('utf8')),expected=new Map(),root=path.join(PACKAGE,NATIVE_PREFIX);
 function add(pin,mode='100644'){if(!['100644','100755'].includes(mode)||!exact(pin,['path','bytes','sha256'])||!Number.isSafeInteger(pin.bytes)||pin.bytes<0||pin.bytes>128*1024*1024||!/^[a-f0-9]{64}$/.test(pin.sha256))fail('COMPONENT_SOURCE_CHANGED');const key=relative(pin.path),row={...pin,mode};if(expected.has(key))fail('COMPONENT_SOURCE_CHANGED');expected.set(key,row);}
 add({path:'source-package.json',...ref(packageBytes)});add({path:'tools/protected_native.py',...ref(driverBytes)});
 for(const pin of [pkg.source_cut.handoff,pkg.source_cut.bindings,pkg.source_cut.patch,pkg.upstream.inventory,...pkg.upstream.attribution,pkg.cargo_lock,pkg.toolchain.inventory,pkg.toolchain.official_manifest])add(pin);
 for(const overlay of pkg.overlay)add(overlay.payload,overlay.mode);
 const files=[...expected.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);if(files.length!==174)fail('COMPONENT_SOURCE_CHANGED');
 const sealPath=path.join(PACKAGE,SEAL),sealBytes=read(sealPath,16*1024*1024),seal=JSON.parse(sealBytes.toString('utf8'));if((fs.lstatSync(sealPath).mode&0o777)!==0o644)fail('COMPONENT_SOURCE_CHANGED');
 if(!exact(seal,['protocol','source_package','build_driver','files'])||seal.protocol!=='soloco-packaged-native-recipe-v1'||!same(seal.source_package,ref(packageBytes))||!same(seal.build_driver,ref(driverBytes))||!same(seal.files,files))fail('COMPONENT_SOURCE_CHANGED');
 const actual=[];let visited=0,total=0;
 function walk(dir,prefix='',depth=0){if(depth>32)fail('COMPONENT_SOURCE_CHANGED');noLinks(dir);for(const name of fs.readdirSync(dir).sort()){if(++visited>40000)fail('COMPONENT_SOURCE_CHANGED');relative(name);const file=path.join(dir,name),st=fs.lstatSync(file),key=prefix?prefix+'/'+name:name;if(st.isDirectory())walk(file,key,depth+1);else if(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1){const b=read(file);total+=b.length;if(total>128*1024*1024)fail('COMPONENT_SOURCE_CHANGED');const mode=(st.mode&0o777)===0o644?'100644':(st.mode&0o777)===0o755?'100755':null;if(!mode)fail('COMPONENT_SOURCE_CHANGED');actual.push({path:key,...ref(b),mode});}else fail('COMPONENT_SOURCE_CHANGED');}}
 walk(root);actual.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);if(!same(actual,files))fail('COMPONENT_SOURCE_CHANGED');
 return Object.freeze({seal:ref(sealBytes),files:Object.freeze(files),excluded:Object.freeze([SEAL,...files.map(v=>NATIVE_PREFIX+'/'+v.path)])});
}
export function hasOriginalPackagedRecipeNamespace(h){state(h);return fs.existsSync(path.join(PACKAGE,'producer-inputs'));}
export function inspectOriginalComponentNodeInventory(h,recipe){
 const s=state(h),excluded=new Set(recipe?.excluded??[]),assignedDirectories=new Set(),rows=[];let visited=0,total=0;
 for(const name of excluded){for(let at=path.posix.dirname(name);at!=='.';at=path.posix.dirname(at))assignedDirectories.add(at);}
 // A generated Native namespace is NEVER an unchecked ignore glob, even for
 // the developer service sharing this package source tree.
 if((s.kind==='packaged-plugin-v1'||recipe)&&excluded.size!==175)fail('COMPONENT_SOURCE_CHANGED');
 function walk(dir,prefix='',depth=0){if(depth>32)fail('COMPONENT_SOURCE_CHANGED');noLinks(dir);for(const name of fs.readdirSync(dir).sort()){if(++visited>40000)fail('COMPONENT_SOURCE_CHANGED');relative(name);const file=path.join(dir,name),key=prefix?prefix+'/'+name:name,st=fs.lstatSync(file);
  if(st.isDirectory()){if((key==='producer-inputs'||key.startsWith('producer-inputs/'))&&!assignedDirectories.has(key))fail('COMPONENT_SOURCE_CHANGED');if(name.startsWith('.')&&!['.codex-plugin','.claude-plugin'].includes(name))fail('COMPONENT_INPUT_COMPOSITION_UNAVAILABLE');walk(file,key,depth+1);continue;}
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)fail('COMPONENT_SOURCE_CHANGED');if(key.startsWith('producer-inputs/')&&!excluded.has(key))fail('COMPONENT_SOURCE_CHANGED');if(excluded.delete(key))continue;
  const logical='plugins/soloco/'+key;if(name.startsWith('.env')||(logical!==C&&!/\.(mjs|json|md|sh|svg|txt)$/.test(name)&&!['LICENSE','NOTICE'].includes(name)))fail('COMPONENT_INPUT_COMPOSITION_UNAVAILABLE');
  const b=read(file,64*1024*1024);total+=b.length;if(total>64*1024*1024||rows.length>=20000)fail('COMPONENT_SOURCE_CHANGED');rows.push({path:logical,...ref(b),mode:st.mode&0o111?'100755':'100644'});
 }}walk(PACKAGE);if(excluded.size)fail('COMPONENT_SOURCE_CHANGED');
 if(s.kind==='developer-source-v1'){const b=read(s.paths.entry,64*1024*1024);total+=b.length;if(total>64*1024*1024)fail('COMPONENT_SOURCE_CHANGED');rows.push({path:'tools/build-peer-context.mjs',...ref(b),mode:'100644'});}
 rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);return rows;
}
