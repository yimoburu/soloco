// SOURCE checker regression fixtures only. The isolated VM runs the unchanged
// checker body against real disposable files and a declared synthetic Git/
// Node/Original-generation boundary. Its handles are FOREIGN to the genuine
// module and cannot supply Store, Native, issuer or installed-package custody.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {captureIntegratedComparisonSource,inspectIntegratedComparisonSourceFrom} from '../plugins/soloco/runtime/integrated-comparison-source.mjs';

const moduleFile=fileURLToPath(new URL('../plugins/soloco/runtime/integrated-comparison-source.mjs',import.meta.url));
const text=fs.readFileSync(moduleFile,'utf8');
const sha=body=>createHash('sha256').update(body).digest('hex');
const oid=(type,body)=>createHash('sha1').update(Buffer.from(type+' '+body.length+'\0')).update(body).digest('hex');
const errorCode=code=>error=>error.code==='ISSUE18_SOURCE_'+code;
const sourceKeys=['source_generation_sha256','source_manifest_sha256','git_head','git_tree','node_executable_sha256','node_version','contract_A_manifest_sha256','contract_B_manifest_sha256','frozen_E3_component_sha256','codec_module_sha256'].sort();
function load(url,dependencies){
 const body=text.replace(/^import [^\n]+;\n/gm,'').replace(/^export (?=function )/gm,'').replaceAll('import.meta.url',JSON.stringify(url));
 const context=vm.createContext({...dependencies,Buffer,URL,WeakMap,Map,Set});
 return vm.runInContext(body+'\n;({captureIntegratedComparisonSource,inspectIntegratedComparisonSourceFrom});',context,{filename:'SOURCE-only-integrated-comparison-source.mjs',timeout:1000});
}
function sourceFixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'soloco-comparison-source-')),runtime=path.join(root,'plugins/soloco/runtime');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const files=new Map(),modes=new Map();
 const put=(name,body,mode=0o644)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body,{mode});fs.chmodSync(file,mode);files.set(name,Buffer.from(body));modes.set(name,mode&0o111?'100755':'100644');return file;};
 for(const name of ['store.mjs','store-precommit-contract.mjs','record-storage.mjs','legacy-storage-proof.mjs','runtime-execution.mjs','runtime-execution-shapes.mjs','worker.mjs','adapters.mjs','develop.mjs','local-sandbox.mjs','peers/prospective-local-worker-inventory-producer.mjs','development-full-file-output.mjs'])put('plugins/soloco/runtime/'+name,'// Controlled Source fixture '+name+'\n');
 put('plugins/soloco/runtime/integrated-comparison-source.mjs',text);
 put('tools/issue18/fixture.mjs','// Controlled optional qualification fixture.\n');
 put('tools/issue18-ledger-storage.mjs','// Controlled ledger wrapper.\n');
 put('tools/issue18-ledger-storage.py','# Controlled ledger helper resource.\n');
 for(const name of ['assets/governance.md','assets/roles.json','skills/soloco/SKILL.md','compat/company-0.1.0.md','.codex-plugin/plugin.json','.claude-plugin/plugin.json','.mcp.codex.json','assets/issue18-qualification-inventory.json'])put('plugins/soloco/'+name,'Controlled package Source fixture: '+name+'\n');
 put('docs/unrelated.md','Unrelated committed Git content still participates in the tree.\n');
 const gitFile=path.join(root,'controlled-git'),nodeFile=path.join(root,'controlled-node');
 fs.writeFileSync(gitFile,'CONTROLLED SOURCE GIT; NEVER EXECUTED\n',{mode:0o755});fs.writeFileSync(nodeFile,'CONTROLLED SOURCE NODE; NEVER EXECUTED\n',{mode:0o755});
 // Independent Git object encoder: preserve nested/empty trees and Git's
 // directory ordering, then construct a commit whose actual SHA1 is the head.
 const tree={entries:new Map()};
 for(const [name,body]of files){const parts=name.split('/');let current=tree;for(const part of parts.slice(0,-1)){if(!current.entries.has(part))current.entries.set(part,{entries:new Map()});current=current.entries.get(part);}current.entries.set(parts.at(-1),{body,mode:modes.get(name)});}
 tree.entries.set('empty-retained-tree',{entries:new Map()});
 const rows=[];
 function encode(node,prefix=''){
  const entries=[...node.entries].sort(([an,a],[bn,b])=>Buffer.compare(Buffer.from(an+(a.entries?'/':'\0')),Buffer.from(bn+(b.entries?'/':'\0')))),encoded=[];
  for(const [name,value]of entries){const directory=Boolean(value.entries),mode=directory?'040000':value.mode,hash=directory?encode(value,prefix+name+'/'):oid('blob',value.body);encoded.push(Buffer.from((directory?'40000':mode)+' '+name+'\0'),Buffer.from(hash,'hex'));rows.push(mode+' '+(directory?'tree':'blob')+' '+hash+'\t'+prefix+name);}
  return oid('tree',Buffer.concat(encoded));
 }
 const treeSha=encode(tree),commit=Buffer.from('tree '+treeSha+'\nauthor SOURCE fixture <source@example.invalid> 0 +0000\ncommitter SOURCE fixture <source@example.invalid> 0 +0000\n\nDeclared synthetic Source object graph.\n'),head=oid('commit',commit),listing=Buffer.from(rows.join('\0')+'\0');
 const sourceFile=path.join(runtime,'store.mjs'),original=fs.readFileSync(sourceFile),generation=sha('DECLARED SOURCE Original-generation seam, never production authority');
 let clock=0n,afterCommand=()=>{},beforeCommand=()=>{},duringGeneration=()=>{},generationCalls=0,generationResult=generation;
 const calls=[];
 const fileSystem=new Proxy(fs,{get(target,key){if(key==='realpathSync')return file=>fs.realpathSync(file==='/usr/bin/git'?gitFile:file);return target[key];}});
 const processView={platform:'linux',execPath:nodeFile,version:'v22.23.2',hrtime:{bigint:()=>clock}};
 const run=(command,args,options)=>{
  const call={command,args,options};calls.push(call);beforeCommand(call);
  assert.equal(options.cwd,root);assert.equal(options.killSignal,'SIGKILL');assert(options.timeout>0&&options.timeout<=10000);assert.equal(options.env.GIT_NO_REPLACE_OBJECTS,'1');assert.equal(options.env.NODE_OPTIONS,undefined);assert.equal(options.shell,undefined);
  let output;
  if(command===nodeFile){assert.deepEqual(Array.from(args),['--version']);output=Buffer.from('v22.23.2\n');}
  else{
   assert.equal(command,gitFile);assert.deepEqual(Array.from(args).slice(0,4),['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']);
   if(args.includes('--show-toplevel'))output=Buffer.from(root+'\n');
   else if(args.includes('rev-parse'))output=Buffer.from(head+'\n');
   else if(args.includes('cat-file'))output=Buffer.from(commit);
   else if(args.includes('ls-tree'))output=Buffer.from(listing);
   else assert.fail('Unrecognized checker Git operation');
  }
  return afterCommand(call,output)??output;
 };
 const dependencies={fs:fileSystem,path,createHash,execFileSync:run,fileURLToPath,process:processView,inspectOriginalSourceGenerationFrom(){generationCalls++;duringGeneration();return generationResult;}};
 const url=pathToFileURL(path.join(runtime,'integrated-comparison-source.mjs')).href,api=load(url,dependencies);
 return {root,runtime,sourceFile,original,head,treeSha,nodeFile,gitFile,calls,api,
  get generationCalls(){return generationCalls;},get generation(){return generationResult;},set generation(value){generationResult=value;},
  advance(ms){clock+=BigInt(ms)*1000000n;},set afterCommand(fn){afterCommand=fn;},set beforeCommand(fn){beforeCommand=fn;},set duringGeneration(fn){duringGeneration=fn;},
  foreign:()=>load(url,dependencies),put};
}

test('module definition and invalid-input rejection perform zero Source lookup or helper execution',()=>{
 let effects=0;const forbidden=()=>{effects++;throw Error('Unexpected Source effect');};
 const api=load(pathToFileURL(moduleFile).href,{fs:new Proxy({},{get:forbidden}),path,createHash,execFileSync:forbidden,fileURLToPath,process:{platform:'linux',execPath:'/unread/node',version:'v22.23.2',hrtime:{bigint:()=>0n}},inspectOriginalSourceGenerationFrom:forbidden});
 assert.equal(effects,0);assert.throws(()=>api.captureIntegratedComparisonSource({}),errorCode('INPUT'));
 for(const handle of [{},null,undefined,'a'.repeat(64),Object.freeze({source_manifest_sha256:'a'.repeat(64)})])assert.throws(()=>api.inspectIntegratedComparisonSourceFrom(handle),errorCode('FOREIGN_SNAPSHOT'));
 assert.throws(()=>api.inspectIntegratedComparisonSourceFrom({},{}),errorCode('INPUT'));assert.equal(effects,0);
});
test('installed-package layout cannot borrow an unrelated checkout or run a lookup helper',()=>{
 let effects=0;const forbidden=()=>{effects++;throw Error('Unexpected installed-package lookup');};
 const api=load('file:///SOURCE-installed/soloco/runtime/integrated-comparison-source.mjs',{fs:new Proxy({},{get:forbidden}),path,createHash,execFileSync:forbidden,fileURLToPath,process:{platform:'linux',execPath:'/unread/node',version:'v22.23.2',hrtime:{bigint:()=>0n}},inspectOriginalSourceGenerationFrom:forbidden});
 assert.throws(()=>api.captureIntegratedComparisonSource(),errorCode('SOURCE_CHECKOUT_REQUIRED'));assert.equal(effects,0);
});
test('physical Source fixture yields an opaque snapshot and exact frozen ten-key DATA projection',t=>{
 const f=sourceFixture(t),handle=f.api.captureIntegratedComparisonSource();assert(Object.isFrozen(handle));assert.deepEqual(Object.keys(handle),[]);
 const source=f.api.inspectIntegratedComparisonSourceFrom(handle);assert(Object.isFrozen(source));assert.deepEqual(Object.keys(source).sort(),sourceKeys);
 assert.equal(source.git_head,f.head);assert.equal(source.git_tree,f.treeSha);assert.equal(source.source_generation_sha256,f.generation);assert.equal(source.node_version,'v22.23.2');assert.equal(source.node_executable_sha256,sha(fs.readFileSync(f.nodeFile)));
 for(const key of sourceKeys.filter(key=>!['git_head','git_tree','node_version'].includes(key)))assert.match(source[key],/^[a-f0-9]{64}$/);
 assert.equal(f.generationCalls,1);assert.equal(f.calls.length,8);
 assert(f.calls.slice(-2).every(call=>call.command===f.gitFile&&call.args.slice(-3).join(' ')==='rev-parse --verify HEAD'),'reinspection reuses verified immutable byte identity and never starts a second Node version process');
 assert.throws(()=>f.api.inspectIntegratedComparisonSourceFrom({...handle}),errorCode('FOREIGN_SNAPSHOT'));
 assert.throws(()=>f.api.inspectIntegratedComparisonSourceFrom(source),errorCode('FOREIGN_SNAPSHOT'));
 assert.throws(()=>f.foreign().inspectIntegratedComparisonSourceFrom(handle),errorCode('FOREIGN_SNAPSHOT'));
 assert.throws(()=>inspectIntegratedComparisonSourceFrom(handle),errorCode('FOREIGN_SNAPSHOT'),'A fixture snapshot is never production authority');
});
for(const [name,mutate,code]of [
 ['missing committed file',f=>fs.unlinkSync(f.sourceFile),'CENSUS_CHANGED'],
 ['extra untracked Source file',f=>fs.writeFileSync(path.join(f.runtime,'extra.mjs'),'untracked'),'CENSUS_CHANGED'],
 ['changed committed body',f=>fs.writeFileSync(f.sourceFile,'Changed controlled body\n'),'UNSEALED_FILE'],
 ['symbolic Source file',f=>{fs.unlinkSync(f.sourceFile);fs.symlinkSync(path.join(f.root,'docs/unrelated.md'),f.sourceFile);},'SYMLINK'],
 ['hardlinked Source file',f=>fs.linkSync(f.sourceFile,path.join(f.root,'extra-alias')),'FILE_IDENTITY'],
 ['executable-mode mismatch',f=>fs.chmodSync(f.sourceFile,0o755),'MODE']
])test(name+' cannot be sealed by hash-shaped supplied labels',t=>{const f=sourceFixture(t);mutate(f);assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode(code));});
test('a source change after its read is caught before issuing a snapshot',t=>{
 const f=sourceFixture(t);f.afterCommand=call=>{if(call.command===f.nodeFile)fs.chmodSync(f.sourceFile,0o744);};
 assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode('CHANGED'));
});
test('Git commit and all nested tree objects are recomputed rather than trusted by name',t=>{
 for(const type of ['commit','tree']){
  const f=sourceFixture(t);f.afterCommand=(call,output)=>{
   if(type==='commit'&&call.args.includes('cat-file'))return Buffer.concat([output,Buffer.from('changed')]);
   if(type==='tree'&&call.args.includes('ls-tree'))return Buffer.from(output.toString().replace('empty-retained-tree','other-retained-tree'));
  };
  assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode(type==='commit'?'GIT_COMMIT_HASH':'GIT_TREE_HASH'));
 }
});
test('oversized helper output and malformed Git UTF8 fail before source admission',t=>{
 for(const mode of ['oversized','encoding']){
  const f=sourceFixture(t);f.afterCommand=()=>mode==='oversized'?Buffer.alloc(8*1024*1024+1):Buffer.from([0xff]);
  assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode(mode==='oversized'?'HELPER_OUTPUT':'GIT_ENCODING'));
  assert.equal(f.calls.length,1);
 }
});
test('executable version and physical helper identity remain bound through their execution',t=>{
 for(const mode of ['node-version','node-inode','git-mode']){
  const f=sourceFixture(t);f.afterCommand=(call,output)=>{
   if(mode==='node-version'&&call.command===f.nodeFile)return Buffer.from('v0.0.0\n');
   if(mode==='node-inode'&&call.command===f.nodeFile){fs.renameSync(f.nodeFile,f.nodeFile+'.old');fs.writeFileSync(f.nodeFile,'Replacement executable DATA\n',{mode:0o755});}
   if(mode==='git-mode'&&call.command===f.gitFile)fs.chmodSync(f.gitFile,0o700);
  };
  assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode(mode==='node-version'?'NODE_VERSION_CHANGED':'CHANGED'));
 }
});
test('Source checkout mismatch and malformed Original generation cannot issue a handle',t=>{
 for(const mode of ['root','generation']){
  const f=sourceFixture(t);if(mode==='root')f.afterCommand=(call,output)=>call.args.includes('--show-toplevel')?Buffer.from(f.root+'/other\n'):output;else f.generation='caller-selected-label';
  assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode(mode==='root'?'SOURCE_CHECKOUT_REQUIRED':'ORIGINAL_GENERATION'));
 }
});
test('helper work consumes one aggregate deadline and later commands receive only remaining time',t=>{
 const f=sourceFixture(t);f.afterCommand=()=>{f.advance(11000);};
 assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode('DEADLINE'));
 assert.equal(f.calls.length,3);assert.equal(f.calls[2].options.timeout,8000);
});
test('Original generation work cannot carry capture past the aggregate deadline',t=>{
 const f=sourceFixture(t);f.afterCommand=call=>{if(call.command===f.nodeFile)f.advance(29999);};
 f.duringGeneration=()=>f.advance(2);
 assert.throws(()=>f.api.captureIntegratedComparisonSource(),errorCode('DEADLINE'));assert.equal(f.generationCalls,1);assert.equal(f.calls.length,5);
});
test('a failed reinspection permanently revokes the private snapshot even after bytes are restored',t=>{
 const f=sourceFixture(t),handle=f.api.captureIntegratedComparisonSource();fs.writeFileSync(f.sourceFile,'Changed after capture\n');
 assert.throws(()=>f.api.inspectIntegratedComparisonSourceFrom(handle),errorCode('CHANGED'));fs.writeFileSync(f.sourceFile,f.original);
 const calls=f.calls.length;assert.throws(()=>f.api.inspectIntegratedComparisonSourceFrom(handle),errorCode('FOREIGN_SNAPSHOT'));assert.equal(f.calls.length,calls);
});
