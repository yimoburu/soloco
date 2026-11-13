// Fixed SOURCE recipe packaging only. This module never imports a producer,
// prepares Rust/toolchains, invokes a driver/compiler, or installs a plugin.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const REPO=fileURLToPath(new URL('../',import.meta.url));
const SOURCE=path.join(REPO,'native/codex'),PACKAGE=path.join(REPO,'plugins/soloco');
const OUTPUT=path.join(PACKAGE,'producer-inputs'),NATIVE=path.join(OUTPUT,'native/codex');
const SEAL=path.join(OUTPUT,'native-recipe-inventory.json');
const MANIFEST_SHA='b040811c46db685f647bfaf5bac3db26aa055035553ee83b8e2bc228f048f55c';
// Updated with the original source driver, never learned from package DATA.
const DRIVER_SHA='36e1b6409a300fbdb064bc0912edab9aba1dd4c97528746df87887854b0a68f0';
const MAX_FILE=128*1024*1024,MAX_TOTAL=128*1024*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const need=(ok,message)=>{if(!ok)throw Error('CONTEXT_PRODUCER_PACKAGE: '+message);};
function relative(name){need(typeof name==='string'&&name.length>0&&name.length<=4096&&!/[\\\x00-\x1f\x7f]/.test(name)&&!path.isAbsolute(name)&&!name.split('/').some(v=>!v||v==='.'||v==='..'),'noncanonical recipe path');return name;}
function noLinks(file){for(let p=file;;p=path.dirname(p)){try{need(!fs.lstatSync(p).isSymbolicLink(),'linked package path');}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}return file;}
function read(file,mode){
 noLinks(file);const named=fs.lstatSync(file);need(named.isFile()&&named.nlink===1&&named.size<=MAX_FILE,'nonregular or oversized recipe file');
 if(mode)need((named.mode&0o777)===Number.parseInt(mode==='100755'?'755':'644',8),'recipe mode changed');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const before=fs.fstatSync(fd),bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),now=fs.lstatSync(file);need(bytes.length===before.size&&['dev','ino','size','mode','nlink','mtimeMs','ctimeMs'].every(k=>named[k]===before[k]&&before[k]===after[k]&&before[k]===now[k]),'recipe changed during read');return bytes;}finally{fs.closeSync(fd);}
}
function sourceRows(){
 const manifest=read(path.join(SOURCE,'source-package.json'),'100644'),driver=read(path.join(SOURCE,'tools/protected_native.py'),'100644');
 need(sha(manifest)===MANIFEST_SHA&&sha(driver)===DRIVER_SHA,'original manifest or driver changed');
 const pkg=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifest));
 need(pkg.schema==='soloco-protected-native-source-package-v1'&&pkg.status==='frozen-source-unqualified'&&pkg.qualified_binary===null&&pkg.overlay.length===159,'original source recipe required');
 const pins=[...['handoff','bindings','patch'].map(k=>[pkg.source_cut[k],'100644']),[pkg.upstream.inventory,'100644'],...pkg.upstream.attribution.map(v=>[v,'100644']),...pkg.overlay.map(v=>[v.payload,v.mode]),[pkg.cargo_lock,'100644'],[pkg.toolchain.inventory,'100644'],[pkg.toolchain.official_manifest,'100644']];
 need(pins.length===168,'exact 168 declared payloads required');
 const rows=[{path:'source-package.json',bytes:manifest,mode:'100644'},{path:'tools/protected_native.py',bytes:driver,mode:'100644'}],seen=new Set(rows.map(v=>v.path));
 for(const [pin,mode] of pins){need(exact(pin,['path','bytes','sha256'])&&Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&pin.bytes<=MAX_FILE&&/^[a-f0-9]{64}$/.test(pin.sha256)&&['100644','100755'].includes(mode),'closed payload pin required');const key=relative(pin.path);need(!seen.has(key),'duplicate recipe destination');seen.add(key);const bytes=read(path.join(SOURCE,key),mode);need(bytes.length===pin.bytes&&sha(bytes)===pin.sha256,'declared payload changed: '+key);rows.push({path:key,bytes,mode});}
 rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);need(rows.length===170&&rows.reduce((n,v)=>n+v.bytes.length,0)<=MAX_TOTAL,'bounded exact recipe required');
 return {rows,seal:{protocol:'soloco-packaged-native-recipe-v1',source_package:{bytes:manifest.length,sha256:sha(manifest)},build_driver:{bytes:driver.length,sha256:sha(driver)},files:rows.map(v=>({path:v.path,bytes:v.bytes.length,sha256:sha(v.bytes),mode:v.mode}))}};
}
function allowedDirectories(rows){const dirs=new Set(['native','native/codex']);for(const row of rows){for(let p=path.posix.dirname('native/codex/'+row.path);p!=='.';p=path.posix.dirname(p))dirs.add(p);}return dirs;}
function checkNames(rows){
 const files=new Set(['native-recipe-inventory.json',...rows.map(v=>'native/codex/'+v.path)]),dirs=allowedDirectories(rows);let visited=0;
 if(!fs.existsSync(OUTPUT))return;noLinks(OUTPUT);need(fs.lstatSync(OUTPUT).isDirectory(),'recipe namespace is not a directory');
 function walk(p,base){for(const name of fs.readdirSync(p)){need(++visited<1000,'recipe namespace exceeds bound');relative(name);const key=base?base+'/'+name:name,file=path.join(p,name),st=fs.lstatSync(file);if(st.isDirectory()){need(dirs.has(key),'unassigned recipe directory: '+key);walk(file,key);}else need(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&files.has(key),'unassigned recipe file: '+key);}}
 walk(OUTPUT,'');
}
function publish(file,bytes,mode,check){
 const numeric=mode==='100755'?0o755:0o644;noLinks(file);
 if(check){need(fs.existsSync(file)&&read(file,mode).equals(bytes),'missing or stale packaged file: '+path.relative(PACKAGE,file));return;}
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o755});noLinks(file);
 if(fs.existsSync(file))need(fs.lstatSync(file).isFile()&&fs.lstatSync(file).nlink===1,'nonregular package destination');
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,numeric);
 try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,numeric);}finally{fs.closeSync(fd);}
}
export function packageContextProducer(check=false){
 need(typeof check==='boolean','only fixed check mode is supported');const {rows,seal}=sourceRows();checkNames(rows);
 for(const row of rows)publish(path.join(NATIVE,row.path),row.bytes,row.mode,check);
 publish(SEAL,Buffer.from(JSON.stringify(seal,null,2)+'\n'),'100644',check);
 checkNames(rows);for(const row of rows)need(read(path.join(NATIVE,row.path),row.mode).equals(row.bytes),'packaged recipe readback changed');
 need(read(SEAL,'100644').equals(Buffer.from(JSON.stringify(seal,null,2)+'\n')),'recipe inventory readback changed');
 return {files:rows.length,bytes:rows.reduce((n,v)=>n+v.bytes.length,0)};
}
// The loader resolves entry-path aliases; argv may retain their logical spelling.
// Compare the same physical file so an explicit CLI call cannot silently no-op.
function invokedAsMain(){
 if(!process.argv[1])return false;
 let entry;
 try{entry=fs.realpathSync(path.resolve(process.argv[1]));}
 catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return false;throw error;}
 return entry===fs.realpathSync(fileURLToPath(import.meta.url));
}
if(invokedAsMain()){
 need(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--check'),'only --check is supported');
 packageContextProducer(process.argv[2]==='--check');
}
