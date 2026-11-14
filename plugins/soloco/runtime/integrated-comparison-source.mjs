// Explicit optional PHYSICAL SOURCE CHECKOUT custody only. Import defines
// functions; it performs no lookup, helper execution or installed-state read.
// This is not loaded-module closure, Native qualification or model authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectOriginalSourceGenerationFrom} from './peers/prospective-local-worker-inventory-producer.mjs';

const RUNTIME=path.resolve(fileURLToPath(new URL('./',import.meta.url)));
const ROOT=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const GIT=process.platform==='darwin'?'/Library/Developer/CommandLineTools/usr/bin/git':'/usr/bin/git';
// Pinned contract DATA identities. Their spelling grants no authority; the
// actual complete code/resource bytes are independently bound below.
const A='6016550e2052de17c001b40d60a99bb42ea52f0a3c4941a429b2f4504d9d8a03';
const B='673415b5c573d42305d2541eb5d96e6dae5c2b08e8b64bca34af495ac144b2f6';
const snapshots=new WeakMap(),MiB=1024*1024;
const LIMITS=Object.freeze({files:8192,directories:4096,depth:32,file_bytes:2*MiB,source_bytes:128*MiB,executable_bytes:256*MiB,total_read_bytes:512*MiB,helper_output_bytes:16*MiB,helpers:8,milliseconds:30000});
const monotonic=process.hrtime.bigint;
const NAMESPACES=Object.freeze(['plugins/soloco/runtime/','tools/issue18/']);
const EXPLICIT=Object.freeze(['tools/issue18-ledger-storage.mjs','tools/issue18-ledger-storage.py',
  'plugins/soloco/assets/governance.md','plugins/soloco/assets/roles.json',
  'plugins/soloco/skills/soloco/SKILL.md','plugins/soloco/compat/company-0.1.0.md',
  'plugins/soloco/.codex-plugin/plugin.json','plugins/soloco/.claude-plugin/plugin.json',
  'plugins/soloco/.mcp.codex.json','plugins/soloco/assets/issue18-qualification-inventory.json']);
const COMPONENT=Object.freeze(['store.mjs','store-precommit-contract.mjs','record-storage.mjs','legacy-storage-proof.mjs','runtime-execution.mjs','runtime-execution-shapes.mjs','worker.mjs','adapters.mjs','develop.mjs','local-sandbox.mjs','peers/prospective-local-worker-inventory-producer.mjs'].map(name=>'plugins/soloco/runtime/'+name));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error('Issue18 Source Hold: '+code),{code:'ISSUE18_SOURCE_'+code});};
const frozen=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;};
const fields=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
const version=s=>fields.map(k=>String(s[k]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const selected=name=>NAMESPACES.some(prefix=>name.startsWith(prefix))||EXPLICIT.includes(name);
const objectHash=(type,body)=>createHash('sha1').update(Buffer.from(type+' '+body.length+'\0')).update(body).digest('hex');
function budget(){return {deadline:monotonic()+BigInt(LIMITS.milliseconds)*1000000n,read:0,output:0,helpers:0};}
function remaining(b){const value=Number((b.deadline-monotonic())/1000000n);need(value>0,'DEADLINE');return value;}
function charge(b,bytes){remaining(b);b.read+=bytes;need(Number.isSafeInteger(b.read)&&b.read<=LIMITS.total_read_bytes,'CAPACITY');}
function bytesFrom(file,maximum,b,{executable=false}={}){
  remaining(b);const named=fs.lstatSync(file,{bigint:true});
  need(named.isFile()&&!named.isSymbolicLink()&&named.nlink>=1n&&named.size>=0n&&named.size<=BigInt(maximum),'FILE');
  need(executable?(named.mode&0o111n)!==0n:named.nlink===1n,'FILE_IDENTITY');charge(b,Number(named.size));
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
    need(same(version(named),version(fs.fstatSync(fd,{bigint:true}))),'CHANGED');
    const body=Buffer.alloc(Number(named.size));let offset=0;
    while(offset<body.length){remaining(b);const n=fs.readSync(fd,body,offset,Math.min(65536,body.length-offset),offset);need(n>0,'CHANGED');offset+=n;}
    need(fs.readSync(fd,Buffer.alloc(1),0,1,offset)===0,'CHANGED');
    need(same(version(named),version(fs.fstatSync(fd,{bigint:true})))&&same(version(named),version(fs.lstatSync(file,{bigint:true}))),'CHANGED');
    remaining(b);return {body,version:version(named)};
  }finally{fs.closeSync(fd);}
}
function recheck(file,retained,b){remaining(b);const current=fs.lstatSync(file,{bigint:true});need(!current.isSymbolicLink()&&same(version(current),retained),'CHANGED');}
function executable(file,b){
  remaining(b);const resolved=fs.realpathSync(file),retained=bytesFrom(resolved,LIMITS.executable_bytes,b,{executable:true});
  const parent=path.dirname(resolved),directory=fs.lstatSync(parent,{bigint:true});need(directory.isDirectory()&&!directory.isSymbolicLink()&&fs.realpathSync(parent)===parent,'EXECUTABLE_CHANGED');
  return {named:file,resolved,physical:retained.version,parent,parentPhysical:version(directory),sha256:hash(retained.body)};
}
function checkExecutable(retained,b){remaining(b);need(fs.realpathSync(retained.named)===retained.resolved&&fs.realpathSync(retained.parent)===retained.parent,'EXECUTABLE_CHANGED');recheck(retained.resolved,retained.physical,b);recheck(retained.parent,retained.parentPhysical,b);}
function helper(command,args,maximum,b){
  need(++b.helpers<=LIMITS.helpers,'CAPACITY');const timeout=Math.min(10000,remaining(b));
  const maxBuffer=Math.min(maximum,LIMITS.helper_output_bytes-b.output);need(maxBuffer>0,'CAPACITY');
  // No shell or inherited Git/Node environment, and one shared deadline rather
  // than a fresh allowance for each command. SIGKILL avoids a TERM-only child.
  const output=execFileSync(command,args,{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_OPTIONAL_LOCKS:'0'},timeout,maxBuffer,killSignal:'SIGKILL',stdio:['ignore','pipe','ignore']});
  remaining(b);need(Buffer.isBuffer(output)&&output.length<=maxBuffer,'HELPER_OUTPUT');b.output+=output.length;charge(b,output.length);return output;
}
function git(args,b,identity){checkExecutable(identity,b);const output=helper(identity.resolved,['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',...args],8*MiB,b);checkExecutable(identity,b);return output;}
function utf8(bytes){const text=bytes.toString('utf8');need(Buffer.from(text,'utf8').equals(bytes),'GIT_ENCODING');return text;}
function census(b){
  const result=[],directories=new Map();
  function directory(file){
    remaining(b);const s=fs.lstatSync(file,{bigint:true});need(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync(file)===file,'DIRECTORY');
    const prior=directories.get(file);if(prior)need(same(prior,version(s)),'DIRECTORY_CHANGED');else directories.set(file,version(s));
    need(directories.size<=LIMITS.directories,'CAPACITY');return s;
  }
  function walk(file,depth){
    need(depth<=LIMITS.depth,'CAPACITY');const before=directory(file),entries=fs.readdirSync(file);need(entries.length<=LIMITS.files,'CAPACITY');
    for(const entry of entries.sort()){
      remaining(b);need(/^[A-Za-z0-9_.-]+$/.test(entry)&&entry!=='.'&&entry!=='..','PATH');
      const child=path.join(file,entry),s=fs.lstatSync(child,{bigint:true});need(!s.isSymbolicLink(),'SYMLINK');
      if(s.isDirectory())walk(child,depth+1);else{need(s.isFile(),'FILE');result.push(path.relative(ROOT,child).split(path.sep).join('/'));need(result.length<=LIMITS.files,'CAPACITY');}
    }
    need(same(version(before),version(directory(file))),'DIRECTORY_CHANGED');
  }
  // This is deliberately a Source-checkout capability. Packaged/installed
  // support needs its own closed inventory; it never silently borrows a repo.
  need(RUNTIME===path.join(ROOT,'plugins','soloco','runtime'),'SOURCE_CHECKOUT_REQUIRED');
  for(const name of ['', 'plugins','plugins/soloco','tools'])directory(path.join(ROOT,name));
  walk(RUNTIME,0);walk(path.join(ROOT,'tools','issue18'),0);
  for(const name of EXPLICIT){for(let parent=path.dirname(name);parent!=='.';parent=path.dirname(parent))directory(path.join(ROOT,parent));result.push(name);need(result.length<=LIMITS.files,'CAPACITY');}
  need(new Set(result).size===result.length,'PATH');return {names:result.sort(),directories:[...directories].sort(([a],[b])=>a.localeCompare(b))};
}
function trackedTree(bytes,tree,b){
  const tracked=new Map(),trees=new Map([['',tree]]),children=new Map([['',[]]]);
  const text=utf8(bytes);need(text.endsWith('\0'),'GIT_TREE');const rows=text.slice(0,-1).split('\0');need(rows.length<=100000,'CAPACITY');
  for(const row of rows){
    remaining(b);const match=/^(040000|100644|100755|120000|160000) (tree|blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(row);need(match,'GIT_TREE');
    const [,mode,type,sha,name]=match;need(Buffer.byteLength(name)<=4096,'GIT_TREE');const parts=name.split('/');need(parts.length<=64&&parts.every(part=>part&&part!=='.'&&part!=='..')&&!tracked.has(name),'GIT_TREE');
    need(type===(mode==='040000'?'tree':mode==='160000'?'commit':'blob'),'GIT_TREE');tracked.set(name,{mode,blob:sha,type});
    const parent=parts.slice(0,-1).join('/'),base=parts.at(-1);if(!children.has(parent))children.set(parent,[]);children.get(parent).push({name:base,mode,type,sha});
    if(type==='tree'){trees.set(name,sha);if(!children.has(name))children.set(name,[]);}
  }
  // Reconstruct every tree object, including unrelated entries and empty
  // trees. Git's reported IDs alone cannot authenticate replaced object bytes.
  for(const [name,sha]of trees){
    remaining(b);const entries=children.get(name)??[];
    entries.sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.type==='tree'?'/':'\0')),Buffer.from(b.name+(b.type==='tree'?'/':'\0'))));
    const body=Buffer.concat(entries.flatMap(entry=>[Buffer.from((entry.mode==='040000'?'40000':entry.mode)+' '+entry.name+'\0'),Buffer.from(entry.sha,'hex')]));
    charge(b,body.length);
    need(objectHash('tree',body)===sha,'GIT_TREE_HASH');
  }
  for(const name of children.keys())need(trees.has(name),'GIT_TREE');
  return tracked;
}
function observe(){
  const b=budget();need(RUNTIME===path.join(ROOT,'plugins','soloco','runtime'),'SOURCE_CHECKOUT_REQUIRED');need(fs.realpathSync(ROOT)===ROOT,'ROOT');
  const gitIdentity=executable(GIT,b),nodeIdentity=executable(process.execPath,b),nodeVersion=process.version;
  need(/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(nodeVersion),'NODE_VERSION');
  need(utf8(git(['rev-parse','--show-toplevel'],b,gitIdentity)).trim()===ROOT,'SOURCE_CHECKOUT_REQUIRED');
  const head=utf8(git(['rev-parse','--verify','HEAD'],b,gitIdentity)).trim();need(/^[a-f0-9]{40}$/.test(head),'GIT_IDENTITY');
  const commit=git(['cat-file','commit',head],b,gitIdentity);need(objectHash('commit',commit)===head,'GIT_COMMIT_HASH');
  const match=/^tree ([a-f0-9]{40})\n/.exec(utf8(commit));need(match,'GIT_IDENTITY');const tree=match[1];
  const tracked=trackedTree(git(['ls-tree','-rtz','--full-tree',head],b,gitIdentity),tree,b);
  const inventory=census(b),expected=[...tracked].filter(([name,entry])=>selected(name)&&entry.type!=='tree').map(([name])=>name).sort();
  need(same(inventory.names,expected),'CENSUS_CHANGED');
  const rows=[];let total=0;
  for(const name of inventory.names){
    remaining(b);const entry=tracked.get(name);need(entry?.type==='blob'&&['100644','100755'].includes(entry.mode),'UNSEALED_FILE');
    const {body,version:physical}=bytesFrom(path.join(ROOT,name),LIMITS.file_bytes,b);total+=body.length;need(total<=LIMITS.source_bytes,'CAPACITY');
    need(objectHash('blob',body)===entry.blob,'UNSEALED_FILE');
    need((BigInt(physical[2])&0o111n)!==0n?entry.mode==='100755':entry.mode==='100644','MODE');
    rows.push({path:name,sha256:hash(body),bytes:body.length,git_mode:entry.mode,git_blob_sha1:entry.blob,physical});
  }
  checkExecutable(nodeIdentity,b);
  need(utf8(helper(nodeIdentity.resolved,['--version'],4096,b))===nodeVersion+'\n','NODE_VERSION_CHANGED');checkExecutable(nodeIdentity,b);
  // The Original generation inspector has its own fixed 16 MiB Source cap.
  // Charge that entire upper bound, and retain this operation's outer deadline.
  charge(b,16*MiB);const generation=inspectOriginalSourceGenerationFrom();remaining(b);need(typeof generation==='string'&&/^[a-f0-9]{64}$/.test(generation),'ORIGINAL_GENERATION');
  need(utf8(git(['rev-parse','--verify','HEAD'],b,gitIdentity)).trim()===head,'CHANGED');
  const after=census(b);need(same(after,inventory),'DIRECTORY_CHANGED');
  for(const row of rows)recheck(path.join(ROOT,row.path),row.physical,b);
  for(const [directory,physical]of inventory.directories)recheck(directory,physical,b);
  checkExecutable(gitIdentity,b);checkExecutable(nodeIdentity,b);need(process.version===nodeVersion,'NODE_VERSION_CHANGED');remaining(b);
  const manifest=rows.map(({physical,...row})=>row),component=manifest.filter(row=>COMPONENT.includes(row.path));need(component.length===COMPONENT.length,'COMPONENT');
  const codec=manifest.find(row=>row.path==='plugins/soloco/runtime/development-full-file-output.mjs');need(codec,'CODEC');
  const source=frozen({source_generation_sha256:generation,source_manifest_sha256:hash(JSON.stringify({protocol:'issue18-closed-source-manifest-v1',scope:'PHYSICAL_SOURCE_CHECKOUT_ONLY',namespaces:NAMESPACES,explicit:EXPLICIT,git_head:head,git_tree:tree,files:manifest})),git_head:head,git_tree:tree,node_executable_sha256:nodeIdentity.sha256,node_version:nodeVersion,contract_A_manifest_sha256:A,contract_B_manifest_sha256:B,frozen_E3_component_sha256:hash(JSON.stringify(component)),codec_module_sha256:codec.sha256});
  remaining(b);return {source,rows,directories:inventory.directories,gitIdentity,nodeIdentity};
}
export function captureIntegratedComparisonSource(){
  need(arguments.length===0,'INPUT');const observed=observe(),handle=Object.freeze({});snapshots.set(handle,observed);return handle;
}
export function inspectIntegratedComparisonSourceFrom(handle){
  need(arguments.length===1,'INPUT');const retained=snapshots.get(handle);need(retained,'FOREIGN_SNAPSHOT');
  try{
    const b=budget();
    const verify=()=>{
      checkExecutable(retained.gitIdentity,b);checkExecutable(retained.nodeIdentity,b);need(process.version===retained.source.node_version,'NODE_VERSION_CHANGED');
      const current=census(b);need(same(current.directories,retained.directories)&&same(current.names,retained.rows.map(row=>row.path)),'CENSUS_CHANGED');
      for(const row of retained.rows)recheck(path.join(ROOT,row.path),row.physical,b);
      for(const [directory,physical]of retained.directories)recheck(directory,physical,b);
    };
    // Initial capture verified exact bytes/commit/tree and executable version.
    // Retained dev/ino/nlink/size/mode/mtime/ctime plus complete name census
    // reject replacement and mutate/restore. Reinspection need not reread all
    // executable/Source bytes or start Node --version at every effect boundary.
    verify();need(utf8(git(['rev-parse','--verify','HEAD'],b,retained.gitIdentity)).trim()===retained.source.git_head,'CHANGED');
    verify();need(utf8(git(['rev-parse','--verify','HEAD'],b,retained.gitIdentity)).trim()===retained.source.git_head,'CHANGED');verify();
    remaining(b);return retained.source;
  }
  catch(error){snapshots.delete(handle);throw error;} // Restoring names never revives custody.
}
