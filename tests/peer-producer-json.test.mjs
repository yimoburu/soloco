import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Parser/format regression only. No descriptor selection, fake build receipt,
// native capability, company state or executable is created by these tests.
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PRODUCTION=path.join(REPO,'plugins/soloco/runtime/peers/protected-source-build-slot.mjs');
const PACKAGE=path.join(REPO,'native/codex/source-package.json');
const override=process.env.SOLOCO_PRODUCER_JSON_READER_BASELINE_PATH;
const SOURCE=override?path.resolve(override):PRODUCTION;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fields=info=>['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'].map(k=>info[k]);
function readStable(file){
 const named=fs.lstatSync(file);assert.ok(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1);
 const descriptor=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const before=fs.fstatSync(descriptor),bytes=fs.readFileSync(descriptor),after=fs.fstatSync(descriptor);assert.equal(bytes.length,before.size);assert.deepEqual(fields(named),fields(before));assert.deepEqual(fields(before),fields(after));assert.deepEqual(fields(after),fields(fs.lstatSync(file)));return bytes;}
 finally{fs.closeSync(descriptor);}
}
const originalSource=readStable(SOURCE),originalPackage=readStable(PACKAGE);
// This optional override is test-only and accepts one exact historical preimage.
// It lets the parent retain an actual failing-before run of the SAME test body.
if(override)assert.equal(sha(originalSource),'297405137d2020775b61bf844d258ec23a3c358242a49bfd023255f9a6a4006f');
const ACCESS='\nexport const __producerJsonReaderTestAccess=Object.freeze({canonical:contextDocument,producer:typeof contextProducerDocument===\'function\'?contextProducerDocument:contextDocument});\n';
const canonical=value=>{
 const sorted=v=>Array.isArray(v)?v.map(sorted):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
 return JSON.stringify(sorted(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
};
function artifact(root,name,bytes){
 const file=path.join(root,name),fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o444);}finally{fs.closeSync(fd);}
 return {path:file,bytes:bytes.length,sha256:sha(bytes)};
}
async function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-producer-json-reader-')));
 // The exact source copy moves to a temporary directory. Resolve its three
 // fixed dependency URLs in the TEST COPY; production bytes stay untouched.
 let testSource=originalSource.toString('utf8');
 const dependencies=[['./context-component-deployment.mjs',false],['./bootstrap-membership-delivery-frame.mjs',true],['./context-component-layout.mjs',true]];
 for(const [specifier,historicalOptional] of dependencies){
  const from="'"+specifier+"'",count=testSource.split(from).length-1;
  // Only the separately SHA-pinned historical failing-before source may omit
  // dependencies added later. Current source must contain each exactly once.
  assert.ok(count===1||(override&&historicalOptional&&count===0),'Resolve the exact copied-module dependency: '+specifier);
  if(count===1){
   const target=pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers',specifier)).href;
   testSource=testSource.replace(from,JSON.stringify(target));
  }
 }
 const moduleRef=artifact(root,'reader-under-test.mjs',Buffer.from(testSource+ACCESS));
 const api=await import(pathToFileURL(moduleRef.path).href);
 t.after(()=>{try{assert.ok(readStable(SOURCE).equals(originalSource));assert.ok(readStable(PACKAGE).equals(originalPackage));assert.equal(sha(readStable(moduleRef.path)),moduleRef.sha256);}finally{fs.rmSync(root,{recursive:true,force:true});}});
 return {root,api,readers:api.__producerJsonReaderTestAccess,pkg:artifact(root,'original-source-package.json',originalPackage)};
}
function held(operation,api){assert.throws(operation,error=>error?.code==='CONTEXT_INTERPRETER_UNAVAILABLE'&&api.isOriginalContextInterpreterUnavailable(error));}

test('producer reader accepts the exact original pretty source-package bytes',async t=>{
 const f=await fixture(t),value=f.readers.producer(f.pkg,f.root);
 assert.equal(value.schema,'soloco-protected-native-source-package-v1');
 assert.equal(value.status,'frozen-source-unqualified');
 assert.ok(readStable(f.pkg.path).equals(originalPackage));
 assert.notEqual(canonical(value),originalPackage.toString('utf8'),'Regression input must use its actual noncanonical producer format');
});

test('producer reader retains raw SHA and exact byte-count checks',async t=>{
 const f=await fixture(t);
 held(()=>f.readers.producer({...f.pkg,sha256:'0'.repeat(64)},f.root),f.api);
 held(()=>f.readers.producer({...f.pkg,bytes:f.pkg.bytes+1},f.root),f.api);
});

test('producer reader retains the immutable artifact mode requirement',async t=>{
 const f=await fixture(t);fs.chmodSync(f.pkg.path,0o644);
 try{held(()=>f.readers.producer(f.pkg,f.root),f.api);}finally{fs.chmodSync(f.pkg.path,0o444);}
});

test('producer reader rejects malformed UTF-8 despite matching raw commitment',async t=>{
 const f=await fixture(t),bad=artifact(f.root,'invalid-utf8.json',Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]));
 held(()=>f.readers.producer(bad,f.root),f.api);
});

test('producer reader rejects malformed JSON despite matching raw commitment',async t=>{
 const f=await fixture(t),bad=artifact(f.root,'invalid-json.json',Buffer.from('{"x":\n'));
 held(()=>f.readers.producer(bad,f.root),f.api);
});

test('compiled-input reader accepts source-derived canonical DATA and rejects reformatting',async t=>{
 const f=await fixture(t),pkg=JSON.parse(originalPackage.toString('utf8'));
 const bindings=JSON.parse(readStable(path.join(REPO,'native/codex',pkg.source_cut.bindings.path)).toString('utf8'));
 // Same declared JSON schema as the public producer, derived from public inputs.
 // This DATA fixture is not a compiled manifest or native build receipt.
 const document={schema:'soloco-compiled-native-inputs-v1',upstream:{commit:pkg.upstream.commit,tree:pkg.upstream.tree},source_package_sha256:sha(originalPackage),files_count:bindings.length,files:bindings};
 const exact=artifact(f.root,'source-derived-canonical-inputs.json',Buffer.from(canonical(document)));
 assert.ok(exact.bytes>1024*1024,'Exercise the full source inventory, not a toy document');
 const parsed=f.readers.canonical(exact,f.root);assert.deepEqual(parsed,document);
 const pretty=artifact(f.root,'noncanonical-inputs.json',Buffer.from(JSON.stringify(document,null,2)+'\n'));
 held(()=>f.readers.canonical(pretty,f.root),f.api);
});

test('canonical reader still rejects the original pretty package format',async t=>{
 const f=await fixture(t);held(()=>f.readers.canonical(f.pkg,f.root),f.api);
});

test('default interpreter slots remain empty and unavailable',async t=>{
 const f=await fixture(t);held(()=>f.api.resolveOriginalPeerContextInterpreter(),f.api);
});
