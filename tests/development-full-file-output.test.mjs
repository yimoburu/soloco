import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {assembleFullFileOutput,createFullFileProducer,FULL_FILE_OUTPUT_PROTOCOL,FULL_FILE_INPUT_CODEC,prepareFullFileInput,normalizePreparedFullFileResult} from '../plugins/soloco/runtime/development-full-file-output.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

// Only controlled outputs/process events and disposable fictional companies.
// No real model/CLI/account, installed state, canonical source or Git operation.
const hash=text=>createHash('sha256').update(text).digest('hex');
const copy=x=>JSON.parse(JSON.stringify(x));
const code=c=>e=>e.code===c;
const config=paths=>({write_paths:paths,max_bytes:200000});
const binding=paths=>({...config(paths),job_id:'controlled-job',instance_id:'controlled-engineer',plan_id:'controlled-plan',scope_sha256:'a'.repeat(64)});
function wire(files){
  const frames=[];const add=f=>frames.push({seq:frames.length,...f});
  for(const f of files){add({type:'file_start',path:f.path});let text='';for(const scalar of f.content){if(Buffer.byteLength(text+scalar)>2048){add({type:'chunk',path:f.path,text});text='';}text+=scalar;}if(text)add({type:'chunk',path:f.path,text});add({type:'file_end',path:f.path});}add({type:'output_end'});
  return JSON.stringify({content:'Controlled complete emitted postimages; no native quality claim.',messages:[],notices:[],full_file_output:{protocol:FULL_FILE_OUTPUT_PROTOCOL,frames}});
}

// Preserved ORIGINAL evaluator fixture body (only export/name adjusted), not the
// newer BOM/CRLF fixture below. Frozen evaluator SHA256:
// f14c8356e3f364104f712548ef58c015aba4e9ec9674d54cd70989d96d2da0e2.
// Separate literal old files are absent; independent retained fixture/candidate
// hashes pin this deterministic definition, including its expected postimages.
const protocol={fixture:{module_bytes:32768}},digest=hash;
const originalControlPins={
 1:{fixture_sha256:'491835db654f1899f8d84ef708824ed5b3bcd4aa4225dfcc6da7e68f92f88296',candidate_sha256:'14591e4ef821625f21a0f2120453a5570d8e1c59267b75515e44f21138d2ed38',candidate_bytes:34032},
 3:{fixture_sha256:'6ac1ff6793b49be70e19d31260e8bfcec21e5813e70e8e7a2a3e01009e6aeaaf',candidate_sha256:'fddafee2e21c49325791a7b90768f6c3a987e91d09697bb4d6873d5a131e86fe',candidate_bytes:101610}
};
const originalBaselineSha='092aaf1d41c4ed97dac065053aa75da9c664c5df467e79b3287c04b84d51a818';
function originalFixture(count){
  if(![1,3].includes(count))throw Error('Supported module counts are one or three');
  const prefix='export const value = 0;\n',line='// fixed fictional padding preserved exactly\n';
  const padBytes=protocol.fixture.module_bytes-Buffer.byteLength(prefix)-5;
  const padding=line.repeat(Math.floor(padBytes/line.length))+'x'.repeat(padBytes%line.length);
  const sources=Array.from({length:count},(_,i)=>({path:`module-${i}.mjs`,content:prefix+'/*'+padding+'*/\n'}));
  // A trailing comment is generated as one exact byte sequence; every module has
  // a known complete expected digest, so elided or altered padding cannot pass.
  const expected=sources.map(f=>({...f,content:f.content.replace('= 0;','= 1;')}));
  const testContent="import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';\n"+
    sources.map((f,i)=>`import {value as value${i}} from './${f.path}';`).join('\n')+
    `\ntest('exact values and complete unchanged module bytes',()=>{${expected.map((f,i)=>`assert.equal(value${i},1);assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./${f.path}',import.meta.url))).digest('hex'),'${digest(f.content)}');`).join('')}});\n`;
  return {sources,expected,test:{path:'fixture.test.mjs',content:testContent}};
}

const mutate=(raw,fn)=>{const value=JSON.parse(raw);fn(value.full_file_output.frames,value);return JSON.stringify(value);};
const invokeText=text=>async(_h,n,_p,_d,timeout,_s,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason??'Controlled single-call timing fixture.'}));return {native_id:n??'controlled-native',text,model_evidence:{verification:'controlled_double_not_native'}};};
const files=[{path:'a.mjs',content:'\uFEFFexport const value = 1;\r\n// 雪😀\r\n'},{path:'b.mjs',content:'line1\nline2\r\n'},{path:'empty.txt',content:''}];

test('all emitted BOM/CRLF/astral/multifile bytes survive; offsets and hashes are runtime computed',()=>{
 const raw=wire(files),r=assembleFullFileOutput(raw,config(files.map(f=>f.path)));assert.deepEqual(r.artifact.files,files);assert.equal(r.accounting.wire_utf8_bytes,Buffer.byteLength(raw));assert.equal(r.accounting.wire_utf16_characters,raw.length);assert.equal(r.accounting.emitted_body_utf8_bytes,files.reduce((n,f)=>n+Buffer.byteLength(f.content),0));assert.equal(r.accounting.files_sha256,hash(JSON.stringify(files)));assert.equal(r.accounting.ranges[0].offset_utf8,0);assert.equal(r.accounting.semantic_full_byte_fidelity,'UNVERIFIED_REQUIRES_TASK_TESTS_AND_INDEPENDENT_QA');
});
for(const [name,change]of [
 ['sequence gap',f=>{f[1].seq++;}],['duplicate/replayed sequence',f=>{f[1].seq=0;}],['missing chunk frame',f=>{f.splice(1,1);}],['missing output end',f=>{f.pop();}],['premature completion',f=>{f[1]={seq:1,type:'output_end'};}],['duplicate path',f=>{f[f.findIndex(x=>x.type==='file_start'&&x.path==='b.mjs')].path='a.mjs';}],['reordered files',f=>{f[0].path='b.mjs';}],['foreign path',f=>{f[0].path='../outside';}],['chunk outside file',f=>{f[0]={seq:0,type:'chunk',path:'a.mjs',text:'x'};}],['wrong chunk path',f=>{f[1].path='b.mjs';}],['base copy',f=>{f[1].copy_from_base=true;}],['model offset claim',f=>{f[1].offset_utf8=0;}],['model hash claim',f=>{f[1].sha256='b'.repeat(64);}],['frame after completion',f=>{f.push({seq:f.length,type:'file_end',path:'empty.txt'});}],['NUL',f=>{f[1].text='\0';}],['split surrogate',f=>{f[1].text='\ud83d';}]
])test(name+' rejects without filling any missing source bytes',()=>assert.throws(()=>assembleFullFileOutput(mutate(wire(files),change),config(files.map(f=>f.path)))));
test('duplicate JSON keys cannot hide frames or another output route',()=>assert.throws(()=>assembleFullFileOutput(wire(files).replace('{"content":','{"content":"hidden","content":'),config(files.map(f=>f.path))),code('FULL_FILE_DUPLICATE_KEY')));
test('mixed files/patches/ref-copy envelope is rejected',()=>{for(const key of ['files','patches','reference'])assert.throws(()=>assembleFullFileOutput(mutate(wire(files),(_f,v)=>v[key]=[]),config(files.map(f=>f.path))),code('FULL_FILE_SHAPE'));});
test('wire/body/chunk/frame budgets reject; none clips',()=>{
 const raw=wire([{path:'a.mjs',content:'x'.repeat(2000)}]);assert.throws(()=>assembleFullFileOutput(raw,{write_paths:['a.mjs'],max_bytes:1000}),code('FULL_FILE_WIRE_LIMIT'));
 assert.throws(()=>assembleFullFileOutput(raw,{...config(['a.mjs']),limits:{chunk_bytes:100}}),code('FULL_FILE_BODY_LIMIT'));
 assert.throws(()=>assembleFullFileOutput(raw,{...config(['a.mjs']),limits:{frames:1}}),code('FULL_FILE_FRAMES'));
});
test('an end frame is syntax only; partial/elided postimage stays independently unverified',()=>{
 const r=assembleFullFileOutput(wire([{path:'a.mjs',content:'// omitted padding'}]),config(['a.mjs']));assert.equal(r.artifact.files[0].content,'// omitted padding');assert.equal(r.accounting.semantic_full_byte_fidelity,'UNVERIFIED_REQUIRES_TASK_TESTS_AND_INDEPENDENT_QA');
});
test('one call gets added protocol instructions plus literal complete canonical prompt; ORIGINAL raw retained before transform',async()=>{
 const raw=wire(files),events=[];let calls=0,spawn=0;const canonical='CANONICAL SOURCE/TASK: \uFEFF雪😀\r\n';
 const model=createFullFileProducer({binding:binding(files.map(f=>f.path)),record:e=>{events.push(e);},invoke:async(...args)=>{calls++;assert(args[2].startsWith(canonical));assert(args[2].includes(FULL_FILE_OUTPUT_PROTOCOL));return invokeText(raw)(...args);}});
 const out=await model('codex',null,canonical,'/controlled',10000,null,{onSpawn(){spawn++;}});assert.equal(calls,1);assert.equal(spawn,1);assert.deepEqual(JSON.parse(out.text).files,files);assert.equal(events[0].canonical_prompt,canonical);assert(events[0].actual_prompt_utf8_bytes>Buffer.byteLength(canonical));assert.equal(events[2].original_model_text,raw);assert.equal(events[3].stage,'assembled');assert.equal(out.model_evidence.full_file_output.wire_utf8_bytes,Buffer.byteLength(raw));assert.equal(out.model_evidence.full_file_output.raw_model_text,raw);assert.equal(out.model_evidence.full_file_output.evidence_record_utf8_bytes_total,events.reduce((n,x)=>n+Buffer.byteLength(JSON.stringify(x)),0));await assert.rejects(model('codex',null,'again','/controlled',10000,null,{}),code('FULL_FILE_ATTEMPT_CONSUMED'));
});
test('malformed output retains full raw original and cannot return a partial candidate or call again',async()=>{
 const raw=mutate(wire(files),f=>{f[1].seq=9;}),events=[];let calls=0;
 const model=createFullFileProducer({binding:binding(files.map(f=>f.path)),record:e=>{events.push(e);},invoke:async(...args)=>{calls++;return invokeText(raw)(...args);}});
 await assert.rejects(model('codex',null,'complete source','/controlled',10000,null,{}),error=>error.code==='FULL_FILE_SEQUENCE'&&error.rejected_output.text===raw);
 assert.equal(calls,1);assert.equal(events.at(-1).original_model_text,raw);assert(!events.some(x=>x.stage==='assembled'));
 const retained=JSON.stringify(events);
 await assert.rejects(model('codex',null,'second call after malformed output','/controlled',10000,null,{}),code('FULL_FILE_ATTEMPT_CONSUMED'));
 assert.equal(calls,1);assert.equal(JSON.stringify(events),retained,'Consumed failure cannot invoke or append another request');
});
test('producer Blocked remains Blocked with original output and counted call; no fabricated files',async()=>{
 const raw=JSON.stringify({content:'Cannot guarantee exact unchanged bytes',messages:[],notices:[],blocked:'Full-file fidelity is unproved'}),events=[],model=createFullFileProducer({binding:binding(['a.mjs']),record:e=>{events.push(e);},invoke:invokeText(raw)});const out=await model('codex',null,'full source','/controlled',10000,null,{});assert.equal(out.text,raw);assert.equal(out.model_evidence.full_file_output.status,'PRODUCER_BLOCKED');assert.equal(out.model_evidence.full_file_output.native_calls,1);assert.equal(JSON.parse(out.text).files,undefined);
});
test('changed native, missing/duplicate spawn, late return, cancellation and prompt overflow fail closed',async()=>{
 const raw=wire([{path:'a.mjs',content:'x'}]);
 for(const mode of ['native','missing','duplicate','late','cancel']){const abort=new AbortController();let clock=1000;const model=createFullFileProducer({binding:binding(['a.mjs']),now:()=>clock,record(){},invoke:async(_h,_n,_p,_d,timeout,_s,o)=>{const timing=executionTiming(clock,{timeout_ms:timeout,timeout_reason:'Controlled negative timing fixture.'});if(mode!=='missing')o.onSpawn(timing);if(mode==='duplicate')o.onSpawn(timing);if(mode==='late')clock=11000;if(mode==='cancel')abort.abort(Error('Exact cancellation'));return {native_id:mode==='native'?'foreign':'expected',text:raw};}});await assert.rejects(model('codex','expected','source','/controlled',10000,null,{signal:abort.signal}),e=>mode==='cancel'?e===abort.signal.reason:e.code===({native:'FULL_FILE_PROVENANCE',missing:'FULL_FILE_PROVENANCE',duplicate:'FULL_FILE_SPAWN_REPLAY',late:'FULL_FILE_DEADLINE'}[mode]));}
 let calls=0;const model=createFullFileProducer({binding:binding(['a.mjs']),record(){},limits:{prompt_bytes:20},invoke:async()=>{calls++;}});await assert.rejects(model('codex',null,'source','/controlled',10000,null,{}),code('FULL_FILE_PROMPT_LIMIT'));assert.equal(calls,0);
});
test('factory and adapter clock injections are marked on every retained timing record and returned outcome',async()=>{
 for(const mode of ['default','factory','adapter','both','factory-default','factory-undefined','factory-inherited','factory-removing-own','factory-removing-inherited','factory-binding-installs','factory-proxy-custom','factory-proxy-own-custom'])for(const blocked of [false,true]){
  const events=[],factoryInjected=['factory','both','factory-default','factory-undefined','factory-inherited','factory-removing-own','factory-removing-inherited','factory-proxy-custom','factory-proxy-own-custom'].includes(mode),adapterInjected=['adapter','both'].includes(mode);
  const fixed=1000,effectiveNow=['factory','both','factory-inherited','factory-removing-own','factory-removing-inherited','factory-proxy-custom','factory-proxy-own-custom'].includes(mode)?()=>fixed:Date.now;let clockReads=0,lateClockReads=0;
  const raw=blocked?JSON.stringify({content:'Controlled blocked output',messages:[],notices:[],blocked:'No fidelity claim'}):wire([{path:'a.mjs',content:'complete'}]);
  let configuration={binding:binding(['a.mjs']),record:e=>{events.push(e);},invoke:async(_h,_n,_p,_d,timeout,_s,options)=>{
   options.onSpawn(executionTiming(effectiveNow(),{timeout_ms:timeout,timeout_reason:'Controlled clock disclosure fixture.'}));
   return {native_id:'controlled-clock',text:raw};
  }};
  if(['factory','both'].includes(mode))configuration.now=effectiveNow;
  if(mode==='factory-default')configuration.now=Date.now;
  if(mode==='factory-undefined')configuration.now=undefined;
  if(mode==='factory-inherited')Object.setPrototypeOf(configuration,{now:effectiveNow});
  if(mode==='factory-removing-own')Object.defineProperty(configuration,'now',{configurable:true,get(){clockReads++;delete configuration.now;return effectiveNow;}});
  if(mode==='factory-removing-inherited'){const parent={};Object.defineProperty(parent,'now',{configurable:true,get(){clockReads++;delete parent.now;return effectiveNow;}});Object.setPrototypeOf(configuration,parent);}
  if(mode==='factory-binding-installs'){const originalBinding=configuration.binding;Object.defineProperty(configuration,'binding',{configurable:true,get(){Object.defineProperty(configuration,'now',{configurable:true,get(){lateClockReads++;return ()=>fixed;}});return originalBinding;}});}
  if(mode==='factory-proxy-custom'||mode==='factory-proxy-own-custom'){
   if(mode==='factory-proxy-own-custom')Object.defineProperty(configuration,'now',{value:effectiveNow,configurable:true,writable:true});
   configuration=new Proxy(configuration,{has(target,key){return key==='now'?false:Reflect.has(target,key);},get(target,key,receiver){if(key==='now'){clockReads++;return effectiveNow;}return Reflect.get(target,key,receiver);}});
  }
  const producer=createFullFileProducer(configuration),expectedClockReads=mode.startsWith('factory-removing-')||mode.startsWith('factory-proxy-')?1:0;
  assert.equal(clockReads,expectedClockReads,'Clock getter is evaluated exactly once');assert.equal(lateClockReads,0,'Unrelated binding getter cannot replace the captured default clock');
  if(factoryInjected)configuration.now=()=>{throw Error('Factory dependency must already be captured');};
  const out=await producer('codex',null,'complete source','/controlled',10000,null,adapterInjected?{now:Date.now}:{});
  assert.deepEqual(events.map(e=>e.stage),blocked?['request','spawn','response']:['request','spawn','response','assembled']);
  for(const event of events){const accounting=event.stage==='assembled'?event.accounting:event;assert.equal(accounting.factory_clock_injected,factoryInjected,mode);assert.equal(accounting.injected_lifecycle_dependencies,factoryInjected||adapterInjected,mode);}
  assert.equal(out.model_evidence.full_file_output.factory_clock_injected,factoryInjected,mode);
  assert.equal(out.model_evidence.full_file_output.injected_lifecycle_dependencies,factoryInjected||adapterInjected,mode);
  if(!blocked)assert.equal(out.model_evidence.full_file_output.native_authentication_or_semantic_fidelity_claim,false);
  assert.equal(clockReads,expectedClockReads,'Invocation cannot re-read factory clock configuration');assert.equal(lateClockReads,0);
 }
});
test('recorder rejection prevents invocation; exact provider Error/cause identities survive',async()=>{
 let calls=0;const a=createFullFileProducer({binding:binding(['a.mjs']),record:()=>true,invoke:async()=>{calls++;}});await assert.rejects(a('codex',null,'source','/controlled',10000,null,{}),code('FULL_FILE_RECORDER_RESULT'));assert.equal(calls,0);
 const error=Object.freeze(Object.assign(Error('provider failed'),{cause:Error('original cause')}));const b=createFullFileProducer({binding:binding(['a.mjs']),record(){},invoke:async()=>{throw error;}});await assert.rejects(b('codex',null,'source','/controlled',10000,null,{}),e=>e===error&&e.cause===error.cause);
});
test('expiry during final evidence retention cannot return an assembled candidate',async()=>{
 let clock=1000;const raw=wire([{path:'a.mjs',content:'complete'}]),events=[];const model=createFullFileProducer({binding:binding(['a.mjs']),now:()=>clock,record:e=>{events.push(e);if(e.stage==='assembled')clock=11000;},invoke:async(_h,_n,_p,_d,timeout,_s,o)=>{o.onSpawn(executionTiming(clock,{timeout_ms:timeout,timeout_reason:'Controlled final-cutoff fixture.'}));return {native_id:'controlled',text:raw};}});await assert.rejects(model('codex',null,'source','/controlled',10000,null,{}),e=>e.code==='FULL_FILE_DEADLINE'&&e.rejected_output.text===raw);assert.equal(events[2].original_model_text,raw);
});
test('request-recorder expiry or cancellation cannot start a provider invocation',async()=>{
 for(const mode of ['expiry','cancel']){let clock=1000,calls=0;const abort=new AbortController();const model=createFullFileProducer({binding:binding(['a.mjs']),now:()=>clock,record:e=>{if(e.stage==='request'){if(mode==='expiry')clock=11000;else abort.abort(Error('Recorder cancellation'));}},invoke:async()=>{calls++;}});await assert.rejects(model('codex',null,'complete source','/controlled',10000,null,{signal:abort.signal}),e=>mode==='expiry'?e.code==='FULL_FILE_DEADLINE':e===abort.signal.reason);assert.equal(calls,0);}
});
test('actual unchanged runModel parser waits for owned close; no CLI is launched',async()=>{
 const raw=wire([{path:'a.mjs',content:'full emitted body'}]);let child,settled=false;const events=[];const model=createFullFileProducer({binding:binding(['a.mjs']),record:e=>{events.push(e);}});
 const pending=model('codex',null,'complete canonical task','/controlled',10000,null,{timeoutReason:'Controlled actual adapter timing fixture.',resolveExecutable:()=>'/controlled/not-executed',spawn(){child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin={end(){queueMicrotask(()=>{child.emit('spawn');for(const e of [{type:'thread.started',thread_id:'controlled-native'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',id:'final',phase:'final_answer',text:raw}},{type:'turn.completed'}])child.stdout.write(JSON.stringify(e)+'\n');});},on(){},removeListener(){}};child.kill=()=>true;return child;}}).then(x=>{settled=true;return x;});
 await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert(!events.some(x=>x.stage==='response'));child.emit('close',0);const out=await pending;assert.equal(out.model_evidence.full_file_output.invoke_kind,'existing_runModel');assert.equal(events[2].original_model_text,raw);
});

// Pure factoring controls add no filesystem, clock, recorder or model seam.
const assertFrozenData=value=>{
 if(!value||typeof value!=='object'){assert.notEqual(typeof value,'function');return;}
 assert.equal(Object.getPrototypeOf(value),Array.isArray(value)?Array.prototype:Object.prototype);
 assert(Object.isFrozen(value));for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert(Object.hasOwn(d,'value'));assertFrozenData(d.value);}
};
test('pure preparation is deterministic frozen DATA with exact fixed instruction and prompt measurements',()=>{
 const input={canonical_prompt:'CANONICAL: \uFEFF雪😀\r\n',binding:binding(['empty.txt','b.mjs','a.mjs']),limits:{}},original=copy(input);
 const prepared=prepareFullFileInput(input);assert.deepEqual(prepared,prepareFullFileInput(copy(input)));assert.deepEqual(input,original);assertFrozenData(prepared);
 assert.deepEqual(prepared.binding.write_paths,['a.mjs','b.mjs','empty.txt']);assert.equal(prepared.protocol,FULL_FILE_OUTPUT_PROTOCOL);assert.equal(prepared.codec.id,FULL_FILE_INPUT_CODEC);
 // Independent frozen4f849 builder/render commitments, not a new encoder oracle.
 assert.equal(prepared.codec.instruction_builder_sha256,'ab903785b16cf4db540f893516429ca137326e301e1d7e05ccdea07f634d04cb');
 assert.equal(prepared.encoding_instruction_metrics.sha256,'4d6fd6e9e1b7ca2b91d0223ab08b9f9bf491ad4f1cb34cba6795815f40257f88');assert.equal(prepared.encoding_instruction_metrics.utf8_bytes,1324);
 assert.equal(prepared.actual_prompt,prepared.canonical_prompt+prepared.encoding_instruction);
 for(const [text,metrics]of [[prepared.canonical_prompt,prepared.canonical_prompt_metrics],[prepared.encoding_instruction,prepared.encoding_instruction_metrics],[prepared.actual_prompt,prepared.actual_prompt_metrics]])assert.deepEqual(metrics,{sha256:hash(text),utf8_bytes:Buffer.byteLength(text),utf16_characters:text.length});
 input.binding.write_paths.push('later.mjs');input.limits.prompt_bytes=1;assert.deepEqual(prepared.binding.write_paths,['a.mjs','b.mjs','empty.txt']);assert.equal(Object.hasOwn(prepared,'capability'),false);
});
test('pure preparation rejects callbacks accessors cycles and non-DATA without invoking supplied code',()=>{
 let calls=0;const getter={binding:binding(['a.mjs'])};Object.defineProperty(getter,'canonical_prompt',{enumerable:true,get(){calls++;return 'source';}});
 assert.throws(()=>prepareFullFileInput(getter),code('FULL_FILE_DATA'));assert.equal(calls,0);
 const callback=()=>{calls++;return 1;};assert.throws(()=>prepareFullFileInput({canonical_prompt:'source',binding:binding(['a.mjs']),limits:{chunk_bytes:callback}}),code('FULL_FILE_DATA'));assert.equal(calls,0);
 const cyclic={canonical_prompt:'source',binding:binding(['a.mjs'])};cyclic.binding.loop=cyclic;assert.throws(()=>prepareFullFileInput(cyclic),code('FULL_FILE_DATA'));
 assert.throws(()=>prepareFullFileInput({canonical_prompt:'source',binding:binding(['a.mjs']),limits:new Date(0)}),code('FULL_FILE_DATA'));
 assert.throws(()=>prepareFullFileInput({canonical_prompt:'source',binding:binding(['a.mjs']),limits:null}),code('FULL_FILE_SHAPE'));
});
test('pure preparation enforces exact UTF8 UTF16 prompt boundaries and invalid input guards',()=>{
 const input={canonical_prompt:'雪😀\r\n',binding:binding(['a.mjs'])},prepared=prepareFullFileInput(input),b=prepared.actual_prompt_metrics.utf8_bytes,n=prepared.actual_prompt_metrics.utf16_characters;assert(b>n);
 assert.equal(prepareFullFileInput({...input,limits:{prompt_bytes:b,prompt_characters:n}}).actual_prompt,prepared.actual_prompt);
 assert.throws(()=>prepareFullFileInput({...input,limits:{prompt_bytes:b-1,prompt_characters:n}}),code('FULL_FILE_PROMPT_LIMIT'));
 assert.throws(()=>prepareFullFileInput({...input,limits:{prompt_bytes:b,prompt_characters:n-1}}),code('FULL_FILE_PROMPT_LIMIT'));
 for(const canonical_prompt of ['bad\0source','\ud83d'])assert.throws(()=>prepareFullFileInput({...input,canonical_prompt}),code('FULL_FILE_REQUEST'));
 assert.throws(()=>prepareFullFileInput({...input,callback:()=>{throw Error('Not called');}}),code('FULL_FILE_DATA'));
 assert.throws(()=>prepareFullFileInput({...input,binding:{...input.binding,write_paths:['../outside']}}),code('FULL_FILE_PATHS'));
});
test('pure normalization recomputes every prepared join and never treats frozen DATA as authority',()=>{
 const prepared=prepareFullFileInput({canonical_prompt:'complete source',binding:binding(files.map(f=>f.path))}),raw=wire(files),normalized=normalizePreparedFullFileResult(prepared,raw);assert.equal(normalized.status,'ASSEMBLED');assert.deepEqual(normalized.artifact.files,files);assertFrozenData(normalized);
 const reordered=Object.fromEntries(Object.entries(copy(prepared)).reverse());assert.deepEqual(normalizePreparedFullFileResult(reordered,raw),normalized);
 for(const mutate of [p=>p.actual_prompt+='x',p=>p.canonical_prompt_metrics.sha256='0'.repeat(64),p=>p.encoding_instruction+='x',p=>p.codec.instruction_builder_sha256='0'.repeat(64),p=>p.binding.write_paths=['changed.mjs']]){
  const forged=copy(prepared);mutate(forged);Object.freeze(forged);assert.throws(()=>normalizePreparedFullFileResult(forged,raw),code('FULL_FILE_PREPARED'));
 }
 // A caller can recompute consistent different labels. The pure result still
 // supplies no Store/current-subject/issuer decision or launch capability.
 const other=prepareFullFileInput({canonical_prompt:'complete source',binding:{...binding(files.map(f=>f.path)),job_id:'different-untrusted-label'}});assert.deepEqual(normalizePreparedFullFileResult(other,raw),normalized);
 let reads=0;const accessor={...prepared};Object.defineProperty(accessor,'actual_prompt',{enumerable:true,get(){reads++;return prepared.actual_prompt;}});assert.throws(()=>normalizePreparedFullFileResult(accessor,raw),code('FULL_FILE_DATA'));assert.equal(reads,0);
});
test('pure normalization preserves original one and three module bytes and exposes unchanged-byte corruption',()=>{
 for(const count of [1,3]){
  const data=originalFixture(count),pins=originalControlPins[count];assert.equal(hash(JSON.stringify(data)),pins.fixture_sha256);
  const prepared=prepareFullFileInput({canonical_prompt:'Exact original fixed source and task',binding:binding(data.expected.map(f=>f.path))}),result=normalizePreparedFullFileResult(prepared,wire(data.expected));
  const complete=[...result.artifact.files,data.test].sort((a,b)=>a.path.localeCompare(b.path));assert.equal(Buffer.byteLength(JSON.stringify(complete)),pins.candidate_bytes);assert.equal(hash(JSON.stringify(complete)),pins.candidate_sha256);
  const corrupt=copy(data.expected);corrupt[0].content=corrupt[0].content.replace('fixed fictional','Fixed fictional');const raw=wire(corrupt),bad=normalizePreparedFullFileResult(prepared,raw);
  assert.deepEqual(bad.artifact.files,corrupt);assert.notEqual(hash(JSON.stringify([...bad.artifact.files,data.test].sort((a,b)=>a.path.localeCompare(b.path)))),pins.candidate_sha256);assert.equal(bad.accounting.wire_sha256,hash(raw));assert.equal(bad.accounting.semantic_full_byte_fidelity,'UNVERIFIED_REQUIRES_TASK_TESTS_AND_INDEPENDENT_QA');
 }
});
test('pure normalization preserves honest Blocked raw DATA without fabricated files or acceptance',()=>{
 const prepared=prepareFullFileInput({canonical_prompt:'source',binding:binding(['a.mjs'])}),raw=JSON.stringify({content:'Cannot preserve unchanged bytes',messages:[],notices:[],blocked:'Held; no additional call'}),result=normalizePreparedFullFileResult(prepared,raw);
 assert.equal(result.status,'PRODUCER_BLOCKED');assert.equal(result.original_output_text,raw);assert.deepEqual(result.artifact,JSON.parse(raw));assert.equal(Object.hasOwn(result.artifact,'files'),false);assertFrozenData(result);
 assert.deepEqual(result.accounting,{wire_utf8_bytes:Buffer.byteLength(raw),wire_utf16_characters:raw.length,wire_sha256:hash(raw)});
 assert.throws(()=>normalizePreparedFullFileResult(prepared,raw.replace('{"content":','{"content":"hidden","content":')),code('FULL_FILE_DUPLICATE_KEY'));
 assert.throws(()=>normalizePreparedFullFileResult(prepared,JSON.stringify({...JSON.parse(raw),files:[]})),code('FULL_FILE_SHAPE'));
});
test('pure normalization retains wire frame path Unicode and serialized-output rejection boundaries',()=>{
 const input={canonical_prompt:'source',binding:binding(['a.mjs'])},raw=wire([{path:'a.mjs',content:'雪😀\r\n'}]),prepared=prepareFullFileInput(input),size=Buffer.byteLength(raw);
 assert.equal(normalizePreparedFullFileResult(prepareFullFileInput({...input,limits:{wire_bytes:size}}),raw).accounting.wire_utf8_bytes,size);
 assert.throws(()=>normalizePreparedFullFileResult(prepareFullFileInput({...input,limits:{wire_bytes:size-1}}),raw),code('FULL_FILE_WIRE_LIMIT'));
 assert.throws(()=>normalizePreparedFullFileResult(prepareFullFileInput({...input,limits:{chunk_bytes:1}}),raw),code('FULL_FILE_BODY_LIMIT'));
 assert.throws(()=>normalizePreparedFullFileResult(prepareFullFileInput({...input,limits:{frames:1}}),raw),code('FULL_FILE_FRAMES'));
 assert.throws(()=>normalizePreparedFullFileResult(prepared,raw.slice(0,-1)),code('FULL_FILE_JSON'));
 assert.throws(()=>normalizePreparedFullFileResult(prepared,mutate(raw,f=>{f[0].path='../outside';})),code('FULL_FILE_FILE_ORDER'));
 assert.throws(()=>normalizePreparedFullFileResult(prepared,mutate(raw,f=>{f[1].seq=0;})),code('FULL_FILE_SEQUENCE'));
 for(const text of ['\0','\ud83d'])assert.throws(()=>normalizePreparedFullFileResult(prepared,wire([{path:'a.mjs',content:text}])),code('FULL_FILE_UNICODE'));
 const tiny=prepareFullFileInput({...input,binding:{...input.binding,max_bytes:1000}});assert.throws(()=>normalizePreparedFullFileResult(tiny,wire([{path:'a.mjs',content:'x'.repeat(2000)}])),code('FULL_FILE_WIRE_LIMIT'));
});
test('opt-in wrapper composes the pure codec with unchanged request raw-retention and output behavior',async()=>{
 const canonical='Canonical source/task \uFEFF雪😀\r\n',bound=binding(files.map(f=>f.path)),prepared=prepareFullFileInput({canonical_prompt:canonical,binding:bound}),raw=wire(files),events=[];let calls=0;
 const model=createFullFileProducer({binding:bound,record:e=>{events.push(e);},invoke:async(...args)=>{calls++;assert.equal(args[2],prepared.actual_prompt);return invokeText(raw)(...args);}});
 const out=await model('codex',null,canonical,'/controlled',10000,null,{}),pure=normalizePreparedFullFileResult(prepared,raw);assert.equal(calls,1);assert.equal(out.text,JSON.stringify(pure.artifact));assert.deepEqual(events.map(e=>e.stage),['request','spawn','response','assembled']);assert.equal(events[2].original_model_text,raw);
 assert.equal(events[0].canonical_prompt_sha256,prepared.canonical_prompt_metrics.sha256);assert.equal(events[0].actual_prompt_sha256,prepared.actual_prompt_metrics.sha256);assert.equal(events[0].actual_prompt_utf8_bytes,prepared.actual_prompt_metrics.utf8_bytes);assert.equal(events[0].actual_prompt_utf16_characters,prepared.actual_prompt_metrics.utf16_characters);assert.equal(out.model_evidence.full_file_output.files_sha256,pure.accounting.files_sha256);
});

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-full-file-output-'));process.env.COMPANY_PLUGIN_DATA=path.join(base,'fictional-plugin-data');test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const read=a=>withStore(a.root,db=>db.read());
const catalog={supported:true,source:'controlled_double',models:[{id:'gpt-6.1-sol',supported_efforts:['high']}],speed_support:{host_default:true}};
function queue(a,role,extra={}){return engine.dispatch({...a,role,task:'Controlled full-file transport/acceptance integration',model_selection:{mode:'explicit',model:'gpt-6.1-sol',effort:'high',reason:'Controlled fixture only'},timeout_ms:20000,timeout_reason:'Controlled integration fixture.',...extra},'codex',{launch:()=>({on(){},unref(){}}),check:()=>({available:true,authenticated:true,version:'controlled'}),catalog:()=>catalog});}
async function integration(t,bad=false,originalCount=null){
 const original=originalCount===null?null:originalFixture(originalCount),pins=original?originalControlPins[originalCount]:null;
 if(original){
  assert.equal(hash(JSON.stringify(original)),pins.fixture_sha256,'Exact preserved whole original source/expected/test oracle');
  for(const source of original.sources){assert.equal(Buffer.byteLength(source.content),32768);assert.equal(hash(source.content),originalBaselineSha);}
  const candidate=[...original.expected,original.test].sort((a,b)=>a.path.localeCompare(b.path));
  assert.equal(Buffer.byteLength(JSON.stringify(candidate)),pins.candidate_bytes);assert.equal(hash(JSON.stringify(candidate)),pins.candidate_sha256);
 }
 const root=fs.mkdtempSync(path.join(base,'company-')),a={root,session_id:id('fictional-founder'),epoch:1};engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Fictional exact byte fidelity test'},'codex');fs.writeFileSync(path.join(root,'.company/development.json'),JSON.stringify({max_bytes_ceiling:200000}));
 const originals=original?original.sources:['a','b','c'].map((name,i)=>{const pre=(i===0?'\uFEFF':'')+'export const value = 0;\r\n/* unchanged 雪😀\r\n',end='*/\r\n',line='fixed fictional padding preserved exactly\r\n',n=32768-Buffer.byteLength(pre+end),padding=line.repeat(Math.floor(n/Buffer.byteLength(line)))+'x'.repeat(n%Buffer.byteLength(line));return {path:name+'.mjs',content:pre+padding+end};});assert(originals.every(f=>Buffer.byteLength(f.content)===32768));const expected=original?original.expected:originals.map(f=>({...f,content:f.content.replace('= 0;','= 1;')}));for(const f of originals)fs.writeFileSync(path.join(root,f.path),f.content);fs.writeFileSync(path.join(root,'private.txt'),'NOT_AUTHORIZED');
 const fixedTestName=original?.test.path??'fixed.test.mjs',fixedTest=original?original.test.content:"import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';\n"+expected.map((f,i)=>`import {value as v${i}} from './${f.path}';`).join('\n')+"\ntest('exact complete original-arm bytes',()=>{"+expected.map((f,i)=>`assert.equal(v${i},1);assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./${f.path}',import.meta.url))).digest('hex'),'${hash(f.content)}');`).join('')+'});\n';fs.writeFileSync(path.join(root,fixedTestName),fixedTest);
 const p=await engine.develop({...a,action:'plan',read_paths:[...originals.map(f=>f.path),fixedTestName],write_paths:originals.map(f=>f.path),test_paths:[fixedTestName],output_format:'files',model_data_approved:true,data_policy:'Only disposable fictional exact-byte fixtures.',source_instruction:'Controlled fixture source sharing only.',acceptance:'Every output byte must match known complete postimage; actual fixed tests plus independent review required.',stop_conditions:'No retry/repair or original mutation.',max_attempts:1,max_bytes:200000,timeout_ms:10000,max_output_bytes:10000,expires_at:new Date(Date.now()+60000).toISOString()},'codex');await engine.develop({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,source_instruction:'Fictional one-attempt scope only.',model_data_approved:true},'codex');
 const j=queue(a,'engineer',{development_id:p.id}),emitted=copy(expected);if(bad){const before=emitted[0].content;emitted[0].content=original?before.replace('fixed fictional','Fixed fictional'):before.replace('unchanged','unchangEd');assert.notEqual(emitted[0].content,before);assert.equal(Buffer.byteLength(emitted[0].content),Buffer.byteLength(before));}const raw=wire(emitted),recordFile=path.join(root,'runtime-wire-evidence.jsonl');let calls=0;
 const model=createFullFileProducer({binding:{...binding(originals.map(f=>f.path)),job_id:j.id,instance_id:j.instance_id,plan_id:p.id,scope_sha256:p.development.scope_sha256},record:e=>{fs.appendFileSync(recordFile,JSON.stringify(e)+'\n',{mode:0o600});},invoke:async(...args)=>{calls++;assert(!args[2].includes('NOT_AUTHORIZED'));return invokeText(raw)(...args);}});
 await work(root,j.id,model);let s=read(a),candidate=s.records[s.jobs[j.id].artifact_id];assert.equal(s.jobs[j.id].status,'completed',s.jobs[j.id].error);if(original){assert.equal(candidate.development.generation.candidate_bytes,pins.candidate_bytes);if(bad)assert.notEqual(candidate.development.candidate_sha256,pins.candidate_sha256);else assert.equal(candidate.development.candidate_sha256,pins.candidate_sha256);}else assert(candidate.development.generation.candidate_bytes>100000);assert.equal(candidate.development.generation.format,'files');assert.deepEqual(candidate.development.files.filter(f=>originals.some(x=>x.path===f.path)),emitted);assert.equal(calls,1);assert.equal(s.records[p.id].development.attempts.length,1);const captured=fs.readFileSync(recordFile,'utf8').trim().split('\n').map(JSON.parse);assert.equal(captured[2].original_model_text,raw);assert.equal(s.jobs[j.id].model_evidence.full_file_output.raw_model_text,raw);
 const testJob=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:candidate.id},'codex');let receipt;const until=Date.now()+20000;while(Date.now()<until){s=read(a);if(s.jobs[testJob.id].artifact_id){receipt=s.records[s.jobs[testJob.id].artifact_id];break;}await new Promise(r=>setTimeout(r,25));}assert(receipt,'actual isolated test receipt required');assert.equal(receipt.development.result.tests_executed,true);
 for(const f of originals)assert.equal(fs.readFileSync(path.join(root,f.path),'utf8'),f.content);
 if(bad){assert.equal(receipt.development.result.status,'failed');assert.equal(receipt.development.acceptance,undefined);return;}
 assert.equal(receipt.development.result.status,'passed');const q=queue(a,'qa',{review_of:receipt.id});const qaText=JSON.stringify({content:'Controlled independent exact-candidate review; not native QA.',messages:[],notices:[],review:{verdict:'Pass',reason:'Verified complete fixture bytes and actual receipt.',permitted_action:'accept_local_development',candidate_sha256:candidate.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:[]}});await work(root,q.id,async(...args)=>({...await invokeText(qaText)(...args),native_id:'controlled-independent-qa'}));s=read(a);const review=s.records[s.jobs[q.id].artifact_id];assert.notEqual(s.jobs[q.id].native_id,s.jobs[j.id].native_id);const accepted=await engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:receipt.id,review_id:review.id,receipt_sha256:receipt.development.receipt_sha256},'codex');assert.equal(accepted.source_integrated,false);
}
test('actual worker/development/test/independent-review/accept path consumes emitted full files above100k',async t=>integration(t));
test('declared output end cannot hide changed unchanged bytes: actual fixed tests fail without acceptance',async t=>integration(t,true));

for(const count of [1,3]){
 test(`preserved original ${count}-module 32KiB files pass literal emission and unchanged consumer with exact candidate bytes`,async t=>integration(t,false,count));
 test(`preserved original ${count}-module unchanged-byte corruption fails fixed tests with one consumed attempt`,async t=>integration(t,true,count));
}
