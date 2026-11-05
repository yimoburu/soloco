import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { digest } from '../plugins/soloco/runtime/store.mjs';
import { reconstructPatch,validText } from '../plugins/soloco/runtime/development-patch.mjs';
import { developmentLimits,assertByteBudget,developmentTransportBudget } from '../plugins/soloco/runtime/development-limits.mjs';
import { makeCandidate,developmentCapability } from '../plugins/soloco/runtime/develop.mjs';
import { toolListFor,call } from '../plugins/soloco/runtime/main.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-patch-unit-'));
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const root=()=>{const p=fs.mkdtempSync(path.join(base,'project-'));fs.mkdirSync(path.join(p,'.company'));return p;};
const configure=(p,value)=>fs.writeFileSync(path.join(p,'.company','development.json'),JSON.stringify(value));
test('patches use exact unshifted positions, preserve CRLF/Unicode and support empty identity edits',()=>{
  const source='😀a\r\nbcd\n';
  assert.equal(reconstructPatch(source,{path:'a',base_sha256:digest(source),edits:[{start:2,end:3,text:'z'},{start:5,end:8,text:'XY'}]}),'😀z\r\nXY\n');
  assert.equal(reconstructPatch(source,{path:'a',base_sha256:digest(source),edits:[]}),source);
  assert.equal(reconstructPatch(undefined,{path:'new',base_sha256:null,content:'你好\n'}),'你好\n');
});
test('patches reject stale bases, ambiguous/overlapping ranges, undeclared operations and invalid text',()=>{
  const source='😀abc',patch={path:'x',base_sha256:digest(source),edits:[{start:2,end:3,text:'X'}]};
  for(const bad of [
    {...patch,base_sha256:digest('other')},{...patch,delete:true},{...patch,content:'replacement'},
    {...patch,edits:[{start:1,end:2,text:'bad'}]},
    {...patch,edits:[{start:2,end:4,text:'x'},{start:3,end:4,text:'y'}]},
    {...patch,edits:[{start:2,end:2,text:'x'},{start:2,end:2,text:'y'}]},
    {...patch,edits:[{start:0,end:100,text:'x'}]},
    {...patch,edits:[{start:0.5,end:2,text:'x'}]},
    {...patch,edits:[{start:2,end:3,text:'\ud800'}]},
    {...patch,edits:[{start:2,end:3,text:'\0'}]}
  ])assert.throws(()=>reconstructPatch(source,bad));
  assert.throws(()=>reconstructPatch(undefined,{path:'x',base_sha256:patch.base_sha256,content:'x'}));
  assert.equal(validText('\ud800'),false);
});
test('UTF-8/JSON budgets report exact boundary, one-byte excess and escaping overhead',()=>{
  const value=[{path:'x',content:'你好\n"\\'}],bytes=Buffer.byteLength(JSON.stringify(value));
  assert.equal(assertByteBudget(value,bytes,'Fixture'),bytes);
  assert.throws(()=>assertByteBudget(value,bytes-1,'Fixture'),new RegExp(`actual ${bytes}, permitted ${bytes-1}, excess 1`));
  assert.ok(bytes>Buffer.byteLength(value[0].content));
});
test('persistent ceilings default safely, support larger budgets and reject malformed values/links',()=>{
  const p=root();assert.equal(developmentLimits(p).max_bytes,100000);
  configure(p,{max_bytes_ceiling:250000});assert.equal(developmentLimits(p).max_bytes,250000);
  for(const value of [null,[],{}, {max_bytes_ceiling:0},{max_bytes_ceiling:1.2},{max_bytes_ceiling:1000001},{max_bytes_ceiling:'200000'},{max_bytes_ceiling:200000,unknown:1}]){configure(p,value);assert.throws(()=>developmentLimits(p));}
  fs.writeFileSync(path.join(p,'.company','development.json'),' '.repeat(4097));assert.throws(()=>developmentLimits(p),/4096/);
  fs.rmSync(path.join(p,'.company','development.json'));fs.symlinkSync('/etc/hosts',path.join(p,'.company','development.json'));assert.throws(()=>developmentLimits(p),/symbolic/);
});
test('schema is root-specific and call validation cannot inherit another company ceiling',async()=>{
  const a=root(),b=root();configure(a,{max_bytes_ceiling:300000});
  const max=p=>toolListFor(p).find(t=>t.name==='company_develop').inputSchema.properties.max_bytes.maximum;
  assert.equal(max(a),300000);assert.equal(max(b),100000);
  await assert.rejects(call('company_develop',{root:b,session_id:'not-bound',epoch:1,action:'plan',max_bytes:200000},'codex'),/this company configured ceiling/);
  assert.equal(developmentTransportBudget(300000),2600000);
});


test('failed materialization retains staging evidence and never exposes a partial candidate',()=>{
  const p=root(),plan={id:'plan'},candidate={id:'candidate',development:{files:[{path:'a.mjs',content:'A'},{path:'b.mjs',content:'B'}]}};
  fs.writeFileSync(path.join(p,'original.mjs'),'ORIGINAL');
  const write=fs.writeFileSync;let writes=0;
  fs.writeFileSync=(file,...args)=>{
    if(String(file).includes('source-writing-')&&++writes===2)throw new Error('Synthetic second-file write failure');
    return write(file,...args);
  };
  try{assert.throws(()=>makeCandidate(p,plan,candidate),/inspect retained staging directory/);}finally{fs.writeFileSync=write;}
  const container=path.join(p,'.company','development','plan','candidate');
  assert.equal(fs.existsSync(path.join(container,'source')),false);
  const stages=fs.readdirSync(container);assert.equal(stages.length,1);
  assert.equal(fs.readFileSync(path.join(container,stages[0],'a.mjs'),'utf8'),'A');
  assert.equal(fs.readFileSync(path.join(p,'original.mjs'),'utf8'),'ORIGINAL');
});


test('invalid configuration blocks development without hiding pause and diagnostic schemas',()=>{
  const p=root();configure(p,{max_bytes_ceiling:'invalid'});
  assert.match(developmentCapability(undefined,p).blocker,/safe integer/);
  const tools=toolListFor(p);assert.ok(tools.some(t=>t.name==='company_control'));assert.ok(tools.some(t=>t.name==='company_doctor'));
});
