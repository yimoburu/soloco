import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {developmentFootprint,developmentCandidateFiles} from '../plugins/soloco/runtime/development-footprint.mjs';
import {MAX_DEVELOPMENT_BYTES} from '../plugins/soloco/runtime/development-limits.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const size=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const source=(path,content)=>({path,content,sha256:hash(content)});
function input(extra={}) {
  return {sources:[source('main.mjs','export const value = "你好😀\\\n";\n'),source('dependency.mjs','export const dependency = 7;\n'),source('main.test.mjs','// selected complete test\n')],
    write_paths:['main.mjs'],test_paths:['main.test.mjs'],output_format:'files',limits:{configured_max_bytes:100000,requested_max_bytes:100000},...extra};
}
const output=[{path:'main.mjs',content:'export const value = "changed 你好😀\\\n";\n'}];
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};

test('complete source accounting includes record hashes, JSON escaping and selected dependency/test membership',()=>{
  const a=input(),before=structuredClone(a),result=developmentFootprint(frozen(a));
  assert.equal(result.phases.sources.encoded_utf8_bytes,size(a.sources));
  assert.equal(result.phases.sources.encoded_sha256,hash(JSON.stringify(a.sources)));
  assert.equal(result.phases.sources.content_utf8_bytes,a.sources.reduce((n,f)=>n+size(f.content),0));
  assert.equal(result.phases.sources.framing_utf8_bytes,size(a.sources)-a.sources.reduce((n,f)=>n+size(f.content),0));
  assert.equal(result.files.find(f=>f.path==='main.mjs').source.record_json_utf8_bytes,size(a.sources[0]));
  assert.equal(result.files.find(f=>f.path==='dependency.mjs').written,false);
  assert.equal(result.files.find(f=>f.path==='main.test.mjs').test,true);
  assert.equal(result.membership.selected_count,3);
  assert.equal(result.status,'incomplete');
  assert.equal(result.phases.generated_output.known,false);
  assert.equal(result.phases.complete_candidate.known,false);
  assert.equal(result.recommendation.complete,false);
  assert.match(result.recommendation.basis,/unknown/);
  assert.equal(result.authority_granted,false);
  assert.equal(result.scope_authorization_checked,false);
  assert.match(result.separate_limits.host_model_context_fit,/unverified/);
  assert.deepEqual(a,before);
});

test('full output reconstructs unchanged dependencies and tests; common budget is a maximum, never a sum',()=>{
  const a=input({output}),files=[{path:'dependency.mjs',content:a.sources[1].content},{path:'main.mjs',content:output[0].content},{path:'main.test.mjs',content:a.sources[2].content}].sort((x,y)=>x.path.localeCompare(y.path));
  const exact=Math.max(size(a.sources),size(output),size(files));
  a.limits={configured_max_bytes:1000,requested_max_bytes:1000,scope_max_bytes:1000};
  const result=developmentFootprint(a);
  assert.equal(result.status,'within_byte_limits');
  assert.equal(result.phases.generated_output.encoded_utf8_bytes,size(output));
  assert.equal(result.phases.complete_candidate.encoded_utf8_bytes,size(files));
  assert.equal(result.phases.generated_output.encoded_sha256,hash(JSON.stringify(output)));
  assert.equal(result.phases.complete_candidate.encoded_sha256,hash(JSON.stringify(files)));
  assert.equal(result.recommendation.minimum_known_max_bytes,1000);
  assert.equal(result.headroom.scope_max_bytes,1000-exact);
  assert.equal(result.files.find(f=>f.path==='dependency.mjs').candidate.sha256,a.sources[1].sha256);
  assert.equal(result.files.find(f=>f.path==='main.test.mjs').candidate.sha256,a.sources[2].sha256);
  assert.deepEqual(developmentCandidateFiles(a.sources,a.write_paths,output),files);
});

test('a tiny patch reports the actual large reconstructed candidate and every unchanged selected file',()=>{
  const content='// unchanged source padding\n'.repeat(5000)+'export const value = 1;\n';
  const original=source('main.mjs',content),a=input({sources:[original,source('dependency.mjs','// dependency\n'),source('main.test.mjs','// complete tests\n')],output_format:'patches',
    output:[{path:'main.mjs',base_sha256:original.sha256,edits:[{start:content.lastIndexOf('1;'),end:content.lastIndexOf('1;')+1,text:'2'}]}]});
  const result=developmentFootprint(a),candidate=[{path:'main.mjs',content:content.replace('value = 1','value = 2')},...a.sources.slice(1).map(({path,content})=>({path,content}))].sort((x,y)=>x.path.localeCompare(y.path));
  assert.ok(result.phases.generated_output.encoded_utf8_bytes<1000);
  assert.equal(result.phases.complete_candidate.encoded_utf8_bytes,size(candidate));
  assert.ok(result.phases.complete_candidate.encoded_utf8_bytes>100000);
  assert.equal(result.status,'held');
  assert.ok(result.blockers.some(b=>b.phase==='complete_candidate'&&b.limit==='configured_max_bytes'));
  assert.equal(result.recommendation.minimum_known_max_bytes,Math.max(size(a.sources),size(a.output),size(candidate)));
  assert.equal(result.membership.selected_count,3);
});

test('an exact byte boundary passes and one-byte excess reports its exact blocking limit',()=>{
  const a=input({sources:[source('main.mjs','x'.repeat(1500)),source('main.test.mjs','// tests')],output:[{path:'main.mjs',content:'y'.repeat(1500)}]});
  const known=developmentFootprint(a),boundary=known.recommendation.minimum_known_max_bytes;
  a.limits={configured_max_bytes:boundary,requested_max_bytes:boundary,scope_max_bytes:boundary};
  const exact=developmentFootprint(a);assert.equal(exact.status,'within_byte_limits');assert.equal(exact.headroom.scope_max_bytes,0);
  const one=developmentFootprint({...a,limits:{...a.limits,scope_max_bytes:boundary-1}});
  assert.equal(one.status,'held');assert.equal(one.headroom.scope_max_bytes,-1);
  assert.ok(one.blockers.some(b=>b.limit==='scope_max_bytes'&&b.excess_bytes===1&&b.actual_bytes===boundary));
  assert.equal(one.recommendation.new_scope_required,true);
  assert.match(one.recommendation.scope_requirement,/separately authorized new scope/);
});

test('a larger configured ceiling never enlarges the supplied immutable scope budget',()=>{
  const a=input({sources:[source('main.mjs','x'.repeat(25000)),source('main.test.mjs','// tests')],output:[{path:'main.mjs',content:'y'.repeat(25000)}],limits:{configured_max_bytes:400000,requested_max_bytes:50000,scope_max_bytes:20000}}),before=structuredClone(a);
  const result=developmentFootprint(frozen(a));
  assert.equal(result.status,'held');assert.equal(result.limits.scope_max_bytes,20000);
  assert.ok(result.blockers.every(b=>b.limit==='scope_max_bytes'));
  assert.equal(result.recommendation.configuration_change_required,false);
  assert.equal(result.recommendation.new_scope_required,true);
  assert.equal(result.recommendation.changes_existing_scope,false);
  assert.equal(result.authority_granted,false);assert.deepEqual(a,before);
  const lower=developmentFootprint({...a,limits:{...a.limits,configured_max_bytes:1000}});
  assert.ok(lower.blockers.some(b=>b.limit==='configured_max_bytes'));
});

test('finite over-hard-maximum measurements remain distinct from malformed input and never recommend an unsupported ceiling',()=>{
  const a=input({sources:[source('main.mjs','x'.repeat(MAX_DEVELOPMENT_BYTES)),source('main.test.mjs','// tests')],limits:{configured_max_bytes:MAX_DEVELOPMENT_BYTES,requested_max_bytes:MAX_DEVELOPMENT_BYTES},headroom_bytes:5000});
  const result=developmentFootprint(a);
  assert.equal(result.status,'held');assert.ok(result.blockers.some(b=>b.limit==='hard_max_bytes'));
  assert.equal(result.recommendation.supported_maximum_exceeded,true);
  assert.equal(result.recommendation.recommended_max_bytes,null);
  assert.ok(result.recommendation.required_with_headroom_bytes>MAX_DEVELOPMENT_BYTES);
  assert.equal(result.recommendation.complete,false);
  assert.throws(()=>developmentFootprint({...a,limits:{...a.limits,requested_max_bytes:MAX_DEVELOPMENT_BYTES+1}}),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});
});

test('headroom is an explicit finite recommendation and never a configuration or authority mutation',()=>{
  const a=input({headroom_bytes:4000}),result=developmentFootprint(a);
  assert.equal(result.recommendation.recommended_max_bytes,result.recommendation.minimum_known_max_bytes+4000);
  assert.equal(result.recommendation.changes_configuration,false);
  assert.equal(result.recommendation.changes_existing_scope,false);
  assert.equal(result.recommendation.complete,false);
  assert.equal(result.separate_limits.development_context_admission_characters,1000000);
  assert.match(result.separate_limits.test_output_time_attempts_expiry,/unchanged/);
  assert.throws(()=>developmentFootprint({...a,headroom_bytes:null}),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});
});

test('new patch paths and exact Unicode offsets preserve the full declared test/dependency membership',()=>{
  const original=source('main.mjs','😀abc\r\n'),a=input({sources:[original,source('dependency.mjs','// unchanged')],write_paths:['main.mjs','main.test.mjs'],output_format:'patches',output:[
    {path:'main.mjs',base_sha256:original.sha256,edits:[{start:2,end:3,text:'你好'}]},
    {path:'main.test.mjs',base_sha256:null,content:'// new tests\r\n'}]});
  const result=developmentFootprint(a);
  assert.equal(result.files.find(f=>f.path==='main.mjs').candidate.sha256,hash('😀你好bc\r\n'));
  assert.equal(result.files.find(f=>f.path==='main.test.mjs').source,null);
  assert.equal(result.files.find(f=>f.path==='main.test.mjs').test,true);
  assert.equal(result.membership.selected_count,3);
  assert.throws(()=>developmentFootprint({...a,output:[{...a.output[0],edits:[{start:1,end:2,text:'x'}]},a.output[1]]}),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});
  assert.throws(()=>developmentFootprint({...a,output:[{...a.output[0],base_sha256:hash('stale')},a.output[1]]}),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});
});

test('incomplete, duplicate, conflicting, undeclared or stale selections fail before any fit claim',()=>{
  for(const a of [
    input({sources:[source('Main.mjs','a'),source('main.mjs','b')]}),
    input({write_paths:['main.mjs','main.mjs']}),
    input({write_paths:['dependency.mjs/child.mjs']}),
    input({write_paths:['../escape']}),input({test_paths:['missing.test.mjs']}),
    input({output:[]}),input({output:[...output,...output]}),
    input({output:[{path:'other.mjs',content:'x'}]}),
    input({sources:[{...source('main.mjs','x'),sha256:hash('wrong')}]}),
    input({sources:[source('main.mjs','\ud800')]}),
    input({output:[{path:'main.mjs',content:'\0'}]}),
    input({sources:Array.from({length:33},(_,i)=>source(`file-${i}.mjs`,'x'))})
  ])assert.throws(()=>developmentFootprint(a),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});
});

test('closed DATA rejects getters, proxies, symbols, sparse arrays and callback or authority injection without invoking them',()=>{
  let invoked=0;
  const accessor=input();Object.defineProperty(accessor,'output',{enumerable:true,get(){invoked++;return output;}});
  const proxy=new Proxy(input(),{get(){invoked++;throw Error('proxy executed');},ownKeys(){invoked++;throw Error('proxy executed');}});
  const arrayAccessor=input();Object.defineProperty(arrayAccessor.sources,'0',{enumerable:true,get(){invoked++;return source('main.mjs','x');}});
  const sparse=input({sources:new Array(1)}),symbol=input();symbol[Symbol('secret')]='x';
  for(const a of [accessor,proxy,arrayAccessor,sparse,symbol,input({authority_granted:true}),input({callback:()=>invoked++}),input({limits:{configured_max_bytes:100000,requested_max_bytes:100000,issuer:true}}),input({output:[{path:'main.mjs',content:'x',hidden:'not counted'}]})])
    assert.throws(()=>developmentFootprint(a),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});
  assert.equal(invoked,0);
});

test('the full existing 32-path bound returns complete bounded metadata without source bodies or clipped memberships',()=>{
  const paths=Array.from({length:32},(_,i)=>`file-${String(i).padStart(2,'0')}-${'x'.repeat(168)}.mjs`);
  assert.ok(paths.every(p=>p.length===180));
  const secret='PRIVATE_SOURCE_BODY_你好😀'.repeat(20),sources=paths.map(p=>source(p,secret)),a={sources,write_paths:paths,test_paths:paths,output_format:'files',output:paths.map(p=>({path:p,content:secret+' changed'})),limits:{configured_max_bytes:MAX_DEVELOPMENT_BYTES,requested_max_bytes:MAX_DEVELOPMENT_BYTES,scope_max_bytes:MAX_DEVELOPMENT_BYTES}};
  const result=developmentFootprint(a),encoded=JSON.stringify(result);
  assert.equal(result.files.length,32);assert.equal(result.membership.selected_count,32);
  assert.ok(result.files.every(f=>f.test&&f.written&&f.source&&f.generated&&f.candidate));
  assert.deepEqual(result.files.map(f=>f.path),paths);
  assert.ok(Buffer.byteLength(encoded)<=24000);
  assert.ok(!encoded.includes(secret));assert.ok(!encoded.includes('PRIVATE_SOURCE_BODY'));
  assert.equal(result.status,'within_byte_limits');
});
