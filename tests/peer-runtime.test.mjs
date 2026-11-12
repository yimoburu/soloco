import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {peerFixture} from './peer-fixture.mjs';
import {PeerLedger,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {authorize} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerRuntimeAction,stopPeerRuntimeHosts} from '../plugins/soloco/runtime/peer-runtime.mjs';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {call,toolList} from '../plugins/soloco/runtime/main.mjs';

const session='fictional-founder-session';
const founder={legacy_owner:{host:'codex',session_id:session,epoch:7}};
const instruction='Operate only this isolated fictional source fixture.';
const request=(f,action,extra={})=>({root:f.root,session_id:session,epoch:7,action,...(['status','inspect','read'].includes(action)?{}:{source_instruction:instruction}),...extra});
function fixture(t,options={}){const f=peerFixture({principals:{founder},...options});t.after(()=>{stopPeerRuntimeHosts();f.close();});return f;}
const code=expected=>error=>error.code===expected;
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readSelector=(source,extra={})=>({family:source.family,id:source.id,revision:source.revision,sha256:source.sha256,part:source.part,...extra});
const fingerprint=f=>peerDigest(Object.fromEntries(['peer_rows','peer_versions','peer_events','peer_outbox','peer_meta','peer_generations','peer_membership'].map(table=>[table,f.ledger.db.prepare('SELECT * FROM '+table).all()])));

test('peer status reads existing checked storage without starting a provider or changing peer rows',async t=>{
 const f=fixture(t),before=f.ledger.read(tx=>({events:f.ledger.db.prepare('SELECT count(*) n FROM peer_events').get().n,control:tx.get('control','company')}));
 const state=await peerRuntimeAction(request(f,'status'),'codex');
 assert.equal(state.protocol,'peer-production-runtime-v1');assert.equal(state.company_id,f.ledger.company_id);assert.equal(state.started,false);assert.equal(state.starting,false);assert.equal(state.launch_recipe_present,false);assert.equal(state.available_slots,3);
 assert.deepEqual(f.ledger.read(tx=>({events:f.ledger.db.prepare('SELECT count(*) n FROM peer_events').get().n,control:tx.get('control','company')})),before);
 assert.equal(fs.existsSync(path.join(f.root,'.company','peer-execution')),false);
});

test('public peer inspection pages compact exact metadata with real bounded cursors and no context dump',async t=>{
 const f=fixture(t),ids=Array.from({length:12},(_,i)=>String(i).padStart(2,'0')+'x'.repeat(1800));
 f.ledger.write('fixture.large-public-page','founder',tx=>{
  for(const id of ids)tx.put('tasks',id,{status:'returned',scope:'alpha',owner_principal_id:'cos-a',attempt:{context:{text:'SECRET_CONTEXT_MUST_NOT_BE_IN_PAGE'.repeat(300)}},result:{output:'Scoped persisted output.'}},0);
  tx.put('tasks','pending-task',{status:'pending',scope:'beta'},0);
  for(const family of ['notices','messages','proposals','reviews','homes','deliveries','work_items','grants','conflicts'])tx.put(family,'public-row',{kind:'fictional',status:'current',scope:'alpha',content:'Explicitly retrieved source value.'},0);
 });
 const before=fingerprint(f),input={family:'tasks',status:'returned',scope:'alpha',limit:50};
 let page=await peerRuntimeAction(request(f,'inspect',{input}),'codex'),seen=[];
 assert(page.effective_limit<50);assert.equal(page.complete,false);assert.equal(page.total,ids.length);
 assert.equal(JSON.stringify(page).includes('SECRET_CONTEXT_MUST_NOT_BE_IN_PAGE'),false);
 assert.equal(Object.hasOwn(page.items[0],'value'),false);assert.equal(page.items[0].source.content_sha256,page.items[0].source.sha256);
 await assert.rejects(peerRuntimeAction(request(f,'inspect',{input:{...input,scope:'beta',cursor:page.next_cursor}}),'codex'),/cursor/);
 for(let pages=0;pages<20;pages++){
  assert(Buffer.byteLength(JSON.stringify(page))<=24000);seen.push(...page.items.map(item=>item.source.id));
  if(page.complete)break;
  assert(page.next_cursor);page=await peerRuntimeAction(request(f,'inspect',{input:{...input,cursor:page.next_cursor}}),'codex');
 }
 assert.deepEqual(seen,ids);assert.equal(new Set(seen).size,ids.length);
 for(const family of ['notices','messages','proposals','reviews','homes','deliveries','work_items','grants','conflicts'])assert.equal((await peerRuntimeAction(request(f,'inspect',{input:{family,scope:'alpha'}}),'codex')).items[0].source.family,family);
 assert.equal(fingerprint(f),before);
});

test('exact public result ranges bind the current parent and selected hash, respect Unicode and reject drift',async t=>{
 const f=fixture(t),result={output:'α😀'+'z'.repeat(5000),accepted:false};
 f.ledger.write('fixture.public-result','founder',tx=>{tx.put('tasks','read-task',{status:'returned',scope:'alpha',attempt:{context:{text:'PRIVATE_CONTEXT_NOT_IN_RESULT'}},result},0);tx.put('tasks','no-result',{status:'pending'},0);});
 const before=fingerprint(f),page=await peerRuntimeAction(request(f,'inspect',{input:{family:'tasks',part:'result',status:'returned'}}),'codex'),source=page.items[0].source;
 assert.equal(source.available,true);assert.equal(source.content_sha256,peerDigest(result));assert.notEqual(source.content_sha256,source.sha256);
 const first=await peerRuntimeAction(request(f,'read',{input:readSelector(source)}),'codex');assert(first.text.length<=4096);assert.equal(first.complete,false);assert.equal(first.text.includes('PRIVATE_CONTEXT_NOT_IN_RESULT'),false);
 const emoji=first.text.indexOf('😀');assert(emoji>=0);
 await assert.rejects(peerRuntimeAction(request(f,'read',{input:readSelector(source,{offset:emoji+1,length:2})}),'codex'),code('PEER_RECORD_RANGE'));
 await assert.rejects(peerRuntimeAction(request(f,'read',{input:readSelector(source,{offset:emoji,length:1})}),'codex'),code('PEER_RECORD_RANGE'));
 const beforeEmoji=await peerRuntimeAction(request(f,'read',{input:readSelector(source,{offset:0,length:emoji+1})}),'codex');assert.equal(beforeEmoji.next_offset,emoji);
 let offset=0,body='';for(let ranges=0;ranges<10;ranges++){
  const part=await peerRuntimeAction(request(f,'read',{input:readSelector(source,{offset})}),'codex');assert.equal(part.offset,offset);assert.deepEqual(part.source,source);body+=part.text;offset=part.next_offset;if(part.complete)break;assert(offset>part.offset);
 }
 assert.equal(offset,source.total_characters);assert.equal(Buffer.byteLength(body),source.utf8_bytes);assert.equal(peerDigest(JSON.parse(body)),source.content_sha256);assert.deepEqual(JSON.parse(body),result);
 const pending=(await peerRuntimeAction(request(f,'inspect',{input:{family:'tasks',part:'result',status:'pending'}}),'codex')).items[0].source;assert.equal(pending.available,false);
 await assert.rejects(peerRuntimeAction(request(f,'read',{input:readSelector(pending)}),'codex'),code('PEER_RECORD_PART_MISSING'));
 await assert.rejects(peerRuntimeAction(request(f,'read',{input:readSelector(source,{sha256:'0'.repeat(64)})}),'codex'),code('PEER_RECORD_CHANGED'));
 assert.equal(fingerprint(f),before);
 f.ledger.write('fixture.public-result-drift','founder',tx=>{const old=tx.get('tasks',source.id);tx.put('tasks',old.id,{...old.value,result:{output:'Current correction'}},old.revision);});
 assert(f.ledger.read(tx=>tx.getVersion({family:source.family,id:source.id,revision:source.revision,sha256:source.sha256})));
 await assert.rejects(peerRuntimeAction(request(f,'read',{input:readSelector(source)}),'codex'),code('PEER_RECORD_CHANGED'));
 const current=(await peerRuntimeAction(request(f,'inspect',{input:{family:'tasks',part:'result',status:'returned'}}),'codex')).items[0].source;assert(current.revision>source.revision);assert.notEqual(current.content_sha256,source.content_sha256);
});

test('public read requests reject unbounded families, paths, ranges and accessor or proxy selectors',async()=>{
 const base={root:'/does-not-exist-public-peer-read',session_id:session,epoch:7,action:'read',input:{family:'tasks',id:'t',revision:1,sha256:'0'.repeat(64)}};
 for(const extra of [{family:'control'},{part:'result.output'},{path:['result']},{revision:0},{sha256:'bad'},{offset:-1},{length:0},{length:4097},{provider:{}},{principal_id:'founder'}])await assert.rejects(peerRuntimeAction({...base,input:{...base.input,...extra}},'codex'),code('PEER_RUNTIME_INPUT'));
 await assert.rejects(peerRuntimeAction({...base,input:{...base.input,family:'notices',part:'result'}},'codex'),code('PEER_RUNTIME_INPUT'));
 await assert.rejects(peerRuntimeAction({...base,action:'inspect',input:{family:'tasks',limit:51}},'codex'),code('PEER_RUNTIME_INPUT'));
 let observed=0;const proxy=new Proxy(base.input,{getOwnPropertyDescriptor(){observed++;throw Error('Proxy trap must not execute');}});
 await assert.rejects(peerRuntimeAction({...base,input:proxy},'codex'),code('PEER_RUNTIME_INPUT'));assert.equal(observed,0);
});

test('operator status rejects another chat, wrong host, stale epoch and revoked canonical founder',async t=>{
 const f=fixture(t);
 for(const extra of [{session_id:'another-chat'},{epoch:6}])await assert.rejects(peerRuntimeAction(request(f,'status',extra),'codex'),code('PEER_OPERATOR_REQUIRED'));
 await assert.rejects(peerRuntimeAction(request(f,'status'),'claude'),code('PEER_OPERATOR_REQUIRED'));
 f.ledger.write('fixture.revoke','founder',tx=>{const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,status:'revoked'},p.revision);});
 await assert.rejects(peerRuntimeAction(request(f,'status'),'codex'),code('PEER_OPERATOR_REQUIRED'));
});

test('canonical founder selection comes from control rather than a request actor',async t=>{
 const f=fixture(t,{control:{founder_principal_id:'real-founder'},principals:{founder}});
 f.ledger.write('fixture.founder','founder',tx=>tx.put('principals','real-founder',{principal_id:'real-founder',kind:'founder',status:'active',generation:1,native_id:'real-founder-native',host:'codex',legacy_owner:founder.legacy_owner},0));
 assert.equal((await peerRuntimeAction(request(f,'status'),'codex')).company_id,f.ledger.company_id);
 await assert.rejects(peerRuntimeAction(request(f,'status',{input:{principal_id:'founder'}}),'codex'),code('PEER_RUNTIME_INPUT'));
});

test('legacy layout preflight preserves journal mode, schema and original database bytes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-peer-legacy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'.company'));const file=path.join(root,'.company','company.sqlite'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,4);');db.close();
 const before=sha(file),args={root,session_id:session,epoch:7,action:'status'};
 await assert.rejects(peerRuntimeAction(args,'codex'),code('PEER_ADOPTION_REQUIRED'));
 assert.equal(sha(file),before);assert.equal(fs.existsSync(file+'-wal'),false);assert.equal(fs.existsSync(file+'-shm'),false);
 const check=new DatabaseSync(file,{readOnly:true});assert.equal(check.prepare('PRAGMA journal_mode').get().journal_mode,'delete');assert.equal(check.prepare("SELECT count(*) n FROM sqlite_master WHERE name='peer_meta'").get().n,0);check.close();
});

test('missing company and linked storage are held without initialization',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-peer-missing-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 await assert.rejects(peerRuntimeAction({root,session_id:session,epoch:7,action:'status'},'codex'),code('PEER_ADOPTION_REQUIRED'));
 assert.deepEqual(fs.readdirSync(root),[]);
 const f=fixture(t),linked=path.join(root,'.company');fs.symlinkSync(path.join(f.root,'.company'),linked);
 await assert.rejects(peerRuntimeAction({root,session_id:session,epoch:7,action:'status'},'codex'),code('PEER_STORAGE_LINK'));
});

test('explicit start holds without reviewed adoption recipe and creates no execution directories',async t=>{
 const f=fixture(t);
 await assert.rejects(peerRuntimeAction(request(f,'start'),'codex'),code('PEER_REVIEWED_ADOPTION_REQUIRED'));
 const state=await peerRuntimeAction(request(f,'status'),'codex');assert.equal(state.started,false);assert.equal(state.starting,false);
 assert.equal(fs.existsSync(path.join(f.root,'.company','peer-execution')),false);
});

test('closed bounded DATA rejects caller-selected providers, actors, proofs and action field mixing',async()=>{
 const root='/does-not-exist-public-peer-test',base={root,session_id:session,epoch:7,action:'start',source_instruction:instruction};
 for(const extra of [{provider:{}},{actor:{principal_id:'founder'}},{readiness:true},{native_id:'forged'},{proof:{protocol:'peer-runtime-observation-v1'}},{input:{principal_id:'cos-a'}},{epoch:0},{source_instruction:''}])await assert.rejects(peerRuntimeAction({...base,...extra},'codex'),code('PEER_RUNTIME_INPUT'));
 await assert.rejects(peerRuntimeAction({...base,action:'stage',input:{enrollment_id:'e',phase:'review',instruction:'Review'}},'codex'),code('PEER_RUNTIME_INPUT'));
 await assert.rejects(peerRuntimeAction({...base,action:'enroll',input:{operation_id:'op',enrollment_id:'e',principal_id:'cos-a',expires_at:'future',expected_generation:0,input_refs:[{family:'principals',id:'cos-a',revision:1,sha256:'0'.repeat(64)}]}},'codex'));
 await assert.rejects(peerRuntimeAction({...base,action:'assign',input:{operation_id:'op',to_principal_id:'cos-a',grant_id:'g',grant_generation:1,role:'cos',instructions:'x'.repeat(20001),acceptance:'ok'}},'codex'),code('PEER_RUNTIME_INPUT'));
 let getters=0;const getter={...base};Object.defineProperty(getter,'input',{enumerable:true,get(){getters++;return {};}});
 await assert.rejects(peerRuntimeAction(getter,'codex'),code('PEER_RUNTIME_INPUT'));assert.equal(getters,0);
 const symbol={...base,[Symbol('provider')]:true};await assert.rejects(peerRuntimeAction(symbol,'codex'),code('PEER_RUNTIME_INPUT'));
 const cycle={};cycle.self=cycle;await assert.rejects(peerRuntimeAction({...base,input:cycle},'codex'),code('PEER_RUNTIME_INPUT'));
});

test('metadata changes and assignment require explicit source-composition start',async t=>{
 const f=fixture(t),enroll={operation_id:'op',enrollment_id:'e',principal_id:'new-cos',expires_at:new Date(Date.now()+60000).toISOString(),expected_generation:0};
 await assert.rejects(peerRuntimeAction(request(f,'enroll',{input:enroll}),'codex'),code('PEER_RUNTIME_NOT_STARTED'));
 await assert.rejects(peerRuntimeAction(request(f,'assign',{input:{operation_id:'assign',to_principal_id:'cos-a',grant_id:'actual-grant',grant_generation:1,role:'cos',instructions:'Do the bounded task',acceptance:'Exact evidence'}}),'codex'),code('PEER_RUNTIME_NOT_STARTED'));
 assert.equal(f.ledger.read(tx=>tx.get('work_items','membership:e')),null);
 assert.deepEqual(await peerRuntimeAction(request(f,'stop'),'codex'),{stopped:true,already_stopped:true,pending_preparation:false,physical_closure:'UNKNOWN'});
});

test('MCP entrypoint advertises closed DATA, requires hook binding and keeps status bounded',async t=>{
 const f=fixture(t),data=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-peer-binding-')),old=process.env.COMPANY_PLUGIN_DATA;
 process.env.COMPANY_PLUGIN_DATA=data;t.after(()=>{if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(data,{recursive:true,force:true});});
 const schema=toolList.find(v=>v.name==='company_peers').inputSchema;
 assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.input.additionalProperties,false);assert(schema.required.includes('epoch'));assert.equal(Object.hasOwn(schema.properties,'provider'),false);
 assert(schema.properties.action.enum.includes('grant_create'));assert(schema.properties.action.enum.includes('grant_revoke'));assert.equal(schema.properties.input.properties.actions.maxItems,100);
 await assert.rejects(call('company_peers',request(f,'status'),'codex'),/No startup-hook binding/);
 for(const [action,input]of [['inspect',{family:'tasks'}],['read',{family:'tasks',id:'missing',revision:1,sha256:'0'.repeat(64)}]])await assert.rejects(call('company_peers',request(f,action,{input}),'codex'),/No startup-hook binding/);
 bind(f.root,session,'codex');const result=await call('company_peers',request(f,'status'),'codex');assert.equal(result.protocol,'peer-production-runtime-v1');assert.equal(result.started,false);assert(Buffer.byteLength(JSON.stringify(result))<4096);
 assert.equal((await call('company_peers',request(f,'inspect',{input:{family:'tasks'}}),'codex')).returned,0);
 await assert.rejects(call('company_peers',{...request(f,'status'),actor:'founder'},'codex'),/Unknown argument/);
});

test('grant routes accept only their bounded grant DATA and reject assignment or identity selectors',async()=>{
 const base={root:'/does-not-exist-public-peer-grant',session_id:session,epoch:7,action:'grant_create',source_instruction:instruction};
 const input={operation_id:'grant-create',grant_id:'scoped-grant',to_principal_id:'cos-a',scope:'alpha',actions:['task/submit'],expires_at:new Date(Date.now()+60000).toISOString(),resources:['home:fact'],max_model_calls:2};
 for(const extra of [{task_id:'forged-task'},{grant_generation:1},{actor:'founder'},{principal_id:'founder'},{native_id:'forged'},{provider:{}},{instructions:'Assignment text does not belong here'},{actions:[]},{actions:Array(101).fill('task/submit')},{actions:['x'.repeat(101)]},{max_model_calls:Number.MAX_SAFE_INTEGER+1}])await assert.rejects(peerRuntimeAction({...base,input:{...input,...extra}},'codex'),code('PEER_RUNTIME_INPUT'));
 await assert.rejects(peerRuntimeAction({...base,action:'grant_revoke',input:{operation_id:'revoke',grant_id:'g',to_principal_id:'cos-a'}},'codex'),code('PEER_RUNTIME_INPUT'));
 await assert.rejects(peerRuntimeAction({...base,action:'assign',input:{operation_id:'assign',grant_id:'g',grant_generation:1,to_principal_id:'cos-a',role:'cos',instructions:'Assignment',acceptance:'Evidence',actions:['*']}},'codex'),code('PEER_RUNTIME_INPUT'));
});

// Exact source-copy fixture: only the fixed provider import is replaced by a
// controlled no-native dependency. Actual public request/authentication/routing
// and actual SQLite/P3 software still execute. The private registry seam exists
// only in this temporary copy, never in the production module or MCP schema.
async function sourceCopy(t,{syntheticFlow=false}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-peer-route-copy-'));
 const dependency=path.join(directory,'provider.mjs');
 const original=new URL('../plugins/soloco/runtime/peer-runtime.mjs',import.meta.url),provider=new URL('./peers/production-host.mjs',original);
 fs.writeFileSync(dependency,`
import assert from 'node:assert/strict';
import {canonical} from '${new URL('./peers/ledger.mjs',original).href}';
import {createMembershipLifecycle} from '${new URL('./peers/membership.mjs',original).href}';
import {bindPeerProductionScheduler} from '${new URL('./peers/model.mjs',original).href}';
const SYNTHETIC_FLOW=${syntheticFlow};
let gate=null,release=null,calls=0,prepares=0,serial=0,pid=8100;
const stats={stages:[],executions:[],stops:0},op=prefix=>'public-source-flow-'+prefix+'-'+(++serial);
export function hold(){gate=new Promise(r=>release=r);}
export function resume(){release?.();gate=null;}
export function count(){return calls;}
export function prepareCount(){return prepares;}
export function flowStats(){return JSON.parse(JSON.stringify(stats));}
export function createOriginalPeerProductionProvider({owner,ledger}){
 const founder=SYNTHETIC_FLOW?ledger.read(tx=>tx.get('control','company').value.founder_principal_id):null;
 const membership=SYNTHETIC_FLOW?createMembershipLifecycle(ledger,{operator_principal_id:founder},bindPeerProductionScheduler(ledger)):null;
 function syntheticStage(input){
  stats.stages.push(input.phase);
  const admitted=membership.operator.admit({operation_id:op('admit'),enrollment_id:input.enrollment_id,phase:input.phase,...(input.reviewer_principal_id?{reviewer_principal_id:input.reviewer_principal_id}:{})});
  const binding={enrollment_id:input.enrollment_id,phase:input.phase,attempt_id:admitted.phase.value.attempt_id};
  const observed_process={pid:++pid,started_at:new Date().toISOString()};
  membership.host.bind({operation_id:op('bind'),...binding,native_id:'synthetic-public-native-'+pid,observed_process});
  const channel=membership.host.channel(binding),header=channel.header();let offset=0;
  while(offset<header.total_characters){const part=channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});assert(part.next_offset>offset);offset=part.next_offset;}
  const output=input.phase==='review'?canonical({review:{subject:header.subject,verdict:'Pass',reason:'Independent synthetic source-flow review only; no native qualification.',blockers:[]}}):'Synthetic reconstruction retains complete current scope and uncertainty; no native qualification.';
  channel.submit({operation_id:op('submit'),sha256:header.sha256,content:output});
  return membership.host.finish({operation_id:op('finish'),...binding,output,termination_confirmed:true,observed_process:{...observed_process,close_observed:true}});
 }
 return {async initialize(){calls++;if(gate)await gate;},async readiness({host}){return {host,available:true,authenticated:true};},async prepare(){
  prepares++;if(!SYNTHETIC_FLOW)throw Error('Native/provider execution forbidden in public route fixture');
  return {runtime:{stage(token,input){assert.equal(token,owner);return syntheticStage(input);},executor:{execute(args){
   stats.executions.push(args.task.value.attempt.id);
   const observed_process={pid:++pid,started_at:new Date().toISOString()};args.onProcess(observed_process);
   const native_id=ledger.read(tx=>tx.get('principals',args.task.value.owner_principal_id).value.native_id);
   return {native_id,output:'Synthetic public source-flow task output; no native/model execution.',termination_confirmed:true,observed_process:{...observed_process,close_observed:true}};
  }}},stop(){stats.stops++;}};
 }};
}
`);
 let source=fs.readFileSync(original,'utf8').replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,original).href}'`);
 source=source.replace(`import {createOriginalPeerProductionProvider,peerProductionRecipe} from '${provider.href}';`,`import {peerProductionRecipe} from '${provider.href}';\nimport {createOriginalPeerProductionProvider} from '${pathToFileURL(dependency).href}';`);
 source+='\nexport function __installFixtureService(root,service){services.set(root,service);}\nexport function __fixtureService(root){return services.get(root);}\n';
 const file=path.join(directory,'peer-runtime-copy.mjs');fs.writeFileSync(file,source);
 const runtime=await import(pathToFileURL(file).href),fake=await import(pathToFileURL(dependency).href);
 t.after(async()=>{fake.resume();runtime.stopPeerRuntimeHosts();await new Promise(setImmediate);fs.rmSync(directory,{recursive:true,force:true});});
 return {runtime,fake};
}
function recipeControl(){
 const environment={boundary_mode:'enforced',worker_boundary:'broker-only-native',peer_runtime:{protocol:'peer-production-host-v1',bridge_sha256:'0'.repeat(64),launch:{profile_id:'fictional-source-only',instruction_sources:[],base_instructions:'Fictional original recipe',developer_instructions:'No native execution in this fixture'}}};
 return {activation:{environment,environment_sha256:peerDigest(environment),review_id:'fictional-source-review',native_reviewer_id:'fictional-review-native'}};
}

test('controlled source-copy start routes actual enrollment and cancels a pending load without later starting',async t=>{
 const f=fixture(t,{control:recipeControl(),principals:{founder}}),{runtime,fake}=await sourceCopy(t);
 fake.hold();const pending=runtime.peerRuntimeAction(request(f,'start'),'codex');
 await new Promise(setImmediate);assert.equal(fake.count(),1);assert.equal((await runtime.peerRuntimeAction(request(f,'status'),'codex')).starting,true);
 const stopped=await runtime.peerRuntimeAction(request(f,'stop'),'codex');assert.equal(stopped.pending_preparation,true);assert.equal(stopped.physical_closure,'UNKNOWN');
 fake.resume();await assert.rejects(pending,code('PEER_RUNTIME_START_CANCELLED'));
 assert.equal((await runtime.peerRuntimeAction(request(f,'status'),'codex')).started,false);
 assert.equal((await runtime.peerRuntimeAction(request(f,'start'),'codex')).started,true);
 const enrolled=await runtime.peerRuntimeAction(request(f,'enroll',{input:{operation_id:'new-enrollment',enrollment_id:'route-enrollment',principal_id:'new-cos',expires_at:new Date(Date.now()+60000).toISOString(),expected_generation:0}}),'codex');
 assert.equal(enrolled.value.status,'pending');assert.equal(enrolled.value.principal_id,'new-cos');assert.equal(enrolled.value.source_instruction,instruction);
 await runtime.peerRuntimeAction(request(f,'stop'),'codex');await new Promise(setImmediate);
});

test('persisted public reads work after stop and a cold module restart without provider calls or writes',async t=>{
 const f=fixture(t,{control:recipeControl(),principals:{founder}}),warm=await sourceCopy(t);
 f.ledger.write('fixture.cold-public-result','founder',tx=>tx.put('tasks','persisted-result',{status:'returned',scope:'alpha',result:{output:'Persisted source result available after host restart.'}},0));
 await warm.runtime.peerRuntimeAction(request(f,'start'),'codex');await warm.runtime.peerRuntimeAction(request(f,'stop'),'codex');await new Promise(setImmediate);
 const before=fingerprint(f),cold=await sourceCopy(t);
 for(const {runtime,fake}of [warm,cold]){
  const page=await runtime.peerRuntimeAction(request(f,'inspect',{input:{family:'tasks',part:'result',status:'returned'}}),'codex'),source=page.items[0].source;
  const part=await runtime.peerRuntimeAction(request(f,'read',{input:readSelector(source)}),'codex');assert.equal(JSON.parse(part.text).output,'Persisted source result available after host restart.');assert.equal(part.complete,true);
  await assert.rejects(runtime.peerRuntimeAction(request(f,'inspect',{session_id:'another-chat',input:{family:'tasks'}}),'codex'),code('PEER_OPERATOR_REQUIRED'));
  await assert.rejects(runtime.peerRuntimeAction(request(f,'read',{epoch:6,input:readSelector(source)}),'codex'),code('PEER_OPERATOR_REQUIRED'));
  assert.equal(fake.prepareCount(),0);
 }
 assert.equal(warm.fake.count(),1);assert.equal(cold.fake.count(),0);assert.equal((await cold.runtime.peerRuntimeAction(request(f,'status'),'codex')).started,false);assert.equal(fingerprint(f),before);
});

test('public status and repeated start retain a router hold after one recoverable authority-read error',async t=>{
 const f=fixture(t,{control:recipeControl(),principals:{founder}}),{runtime,fake}=await sourceCopy(t);
 await runtime.peerRuntimeAction(request(f,'start'),'codex');
 const service=runtime.__fixtureService(fs.realpathSync(f.root));
 // Drain the initial empty tick before inserting one source observation error.
 await service.router.tick(service.owner);
 const original=service.ledger.read;let failures=0;
 service.ledger.read=function(...args){
  if(failures++===0)throw Object.assign(Error('Synthetic recoverable authority read failure'),{code:'SYNTHETIC_AUTHORITY_READ'});
  return Reflect.apply(original,this,args);
 };
 try{await assert.rejects(Promise.resolve().then(()=>service.router.tick(service.owner)),code('SYNTHETIC_AUTHORITY_READ'));}
 finally{service.ledger.read=original;}
 const local=await service.router.status(service.owner);assert.equal(local.router.stopped,true);assert.equal(local.router.authority_held,true);assert.equal(local.router.running,false);
 const events=f.ledger.db.prepare('SELECT count(*) n FROM peer_events').get().n;
 const state=await runtime.peerRuntimeAction(request(f,'status'),'codex');
 assert.equal(state.operator_changed,false);assert.equal(state.started,false);assert.equal(state.router.stopped,true);assert.equal(state.router.authority_held,true);assert.equal(state.router.running,false);
 const repeated=await runtime.peerRuntimeAction(request(f,'start'),'codex');assert.equal(repeated.started,false);assert.equal(repeated.held,true);
 assert.equal(fake.count(),1);assert.equal(fake.prepareCount(),0);assert.equal(runtime.__fixtureService(fs.realpathSync(f.root)),service);
 assert.equal(f.ledger.read(tx=>tx.get('control','usage')),null);assert.equal(f.ledger.db.prepare('SELECT count(*) n FROM peer_events').get().n,events);
 await runtime.peerRuntimeAction(request(f,'stop'),'codex');await new Promise(setImmediate);
});

test('controlled public grant routes retain actual founder attribution, recipient scope and policy, then revoke',async t=>{
 const f=fixture(t,{control:recipeControl(),principals:{founder}}),{runtime}=await sourceCopy(t);
 await runtime.peerRuntimeAction(request(f,'start'),'codex');
 const input={operation_id:'public-grant-create',grant_id:'public-scoped-grant',to_principal_id:'cos-a',scope:'alpha',actions:['task/submit','task/claim','message/send'],resources:['home:fact'],expires_at:new Date(Date.now()+60000).toISOString(),max_model_calls:500};
 const granted=await runtime.peerRuntimeAction(request(f,'grant_create',{input}),'codex');
 assert.equal(granted.value.principal_id,'cos-a');assert.equal(granted.value.scope,'alpha');assert.equal(granted.value.max_model_calls,100);assert.equal(granted.value.used_model_calls,0);assert.equal(granted.value.source_instruction,instruction);
 const event=f.ledger.db.prepare("SELECT principal_id FROM peer_events WHERE type='grant/create' ORDER BY seq DESC LIMIT 1").get();assert.equal(event.principal_id,'founder');
 const total=f.ledger.db.prepare('SELECT count(*) n FROM peer_events').get().n;
 assert.deepEqual(await runtime.peerRuntimeAction(request(f,'grant_create',{input}),'codex'),granted);assert.equal(f.ledger.db.prepare('SELECT count(*) n FROM peer_events').get().n,total);
 const allowed={grant_id:granted.id,grant_generation:1,scope:'alpha',resources:['home:fact']};
 assert.equal(f.ledger.read(tx=>authorize(tx,{principal_id:'cos-a'},'message/send',allowed).grant.id),granted.id);
 assert.throws(()=>f.ledger.read(tx=>authorize(tx,{principal_id:'cos-a'},'message/send',{...allowed,scope:'beta'})),code('GRANT_INVALID'));
 assert.throws(()=>f.ledger.read(tx=>authorize(tx,{principal_id:'cos-a'},'message/send',{...allowed,resources:['home:another']})),code('RESOURCE_AUTHORITY'));
 assert.throws(()=>f.ledger.read(tx=>authorize(tx,{principal_id:'cos-a'},'home/propose',allowed)),code('GRANT_INVALID'));
 await assert.rejects(runtime.peerRuntimeAction(request(f,'grant_create',{session_id:'another-chat',input:{...input,operation_id:'wrong-chat',grant_id:'forged-grant'}}),'codex'),code('PEER_OPERATOR_REQUIRED'));
 assert.equal(f.ledger.read(tx=>tx.get('grants','forged-grant')),null);
 const revoked=await runtime.peerRuntimeAction(request(f,'grant_revoke',{input:{operation_id:'public-grant-revoke',grant_id:granted.id}}),'codex');
 assert.equal(revoked.value.status,'revoked');assert.equal(revoked.value.generation,2);assert.equal(revoked.value.principal_id,'cos-a');
 assert.equal(f.ledger.db.prepare("SELECT principal_id FROM peer_events WHERE type='grant/revoke' ORDER BY seq DESC LIMIT 1").get().principal_id,'founder');
 assert.throws(()=>f.ledger.read(tx=>authorize(tx,{principal_id:'cos-a'},'message/send',allowed)),code('GRANT_INVALID'));
 await runtime.peerRuntimeAction(request(f,'stop'),'codex');await new Promise(setImmediate);
});

test('public source lifecycle reaches a scheduled result after activation, grant and assignment without manual claim',async t=>{
 const f=fixture(t,{control:recipeControl(),principals:{founder}}),{runtime,fake}=await sourceCopy(t,{syntheticFlow:true});
 const row=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
 const operation=(action,input)=>runtime.peerRuntimeAction(request(f,action,input===undefined?{}:{input}),'codex');
 // Every process/native/close fact below is supplied by the explicit temporary
 // synthetic provider. Public routing, membership, P1/P2, founder/grant checks,
 // queue selection and observer persistence use their actual implementations.
 await operation('start');
 const enrollment=await operation('enroll',{operation_id:'flow-enroll',enrollment_id:'public-flow-enrollment',principal_id:'public-flow-peer',role:'cos',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:2,expected_generation:0});
 const stage={enrollment_id:enrollment.value.enrollment_id,instruction:'Reconstruct exact source context; retain uncertainty and synthetic provenance.'};
 assert.equal((await operation('stage',{...stage,phase:'reconstruction'})).accepted,true);
 assert.equal((await operation('stage',{...stage,phase:'review',reviewer_principal_id:'public-flow-independent-reviewer'})).accepted,true);
 const activated=await operation('activate',{operation_id:'flow-activate',enrollment_id:enrollment.value.enrollment_id});
 assert.equal(activated.principal.id,'public-flow-peer');assert.equal(activated.principal.value.status,'active');
 assert.notEqual(activated.qualification.id,activated.enrollment.value.activation.reconstruction.id);
 const grant=await operation('grant_create',{operation_id:'flow-grant',grant_id:'public-flow-grant',to_principal_id:activated.principal.id,scope:'alpha',actions:['task/submit','task/claim'],resources:['home:public-flow-output'],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:1});
 const assignment={operation_id:'flow-assign',task_id:'public-flow-task',to_principal_id:activated.principal.id,grant_id:grant.id,grant_generation:grant.value.generation,scope:'alpha',role:'research',stage:'produce',instructions:'Return one bounded synthetic source result.',acceptance:'Retain founder attribution, recipient grant and exact synthetic output.',resources:['home:public-flow-output']};
 const assigned=await operation('assign',assignment);assert.equal(assigned.value.status,'pending');
 assert.equal(assigned.value.owner_principal_id,activated.principal.id);assert.equal(assigned.value.definition.assignment.operator.id,'founder');assert.equal(assigned.value.definition.assignment.source_instruction,instruction);
 const service=runtime.__fixtureService(fs.realpathSync(f.root));
 await operation('tick');await service.router.drain(service.owner);
 const returned=row('tasks',assigned.id);assert.equal(returned.value.status,'returned');assert.equal(returned.value.grant_id,grant.id);
 const page=await operation('inspect',{family:'tasks',part:'result',status:'returned',principal_id:activated.principal.id}),persisted=page.items.find(item=>item.source.id===assigned.id);assert(persisted);
 let resultBody='',offset=0;for(let ranges=0;ranges<10;ranges++){
  const part=await operation('read',readSelector(persisted.source,{offset}));assert.equal(part.offset,offset);resultBody+=part.text;offset=part.next_offset;if(part.complete)break;assert(offset>part.offset);
 }
 assert.equal(offset,persisted.source.total_characters);assert.equal(peerDigest(JSON.parse(resultBody)),persisted.source.content_sha256);assert.equal(JSON.parse(resultBody).output,'Synthetic public source-flow task output; no native/model execution.');
 assert.equal(returned.value.attempt.effect_authority.production_authority.founder.id,'founder');assert.equal(row('slots',assigned.id).value.status,'released');
 const stats=fake.flowStats();assert.deepEqual(stats.stages,['reconstruction','review']);assert.deepEqual(stats.executions,[returned.value.attempt.id]);assert.equal(stats.stops,3);assert.equal(fake.prepareCount(),3);
 assert.equal(row('control','usage').value.model_calls,3);assert.equal(row('control','usage:'+activated.principal.id).value.model_calls,2);assert.equal(row('grants',grant.id).value.used_model_calls,1);assert.equal(row('work_items','membership:'+enrollment.value.enrollment_id).value.used_model_calls,2);
 const commands=f.ledger.read(tx=>tx.list('commands',{limit:100}).items);
 assert.equal(commands.filter(r=>r.value.action==='task/admit'&&r.value.result?.admitted===true).length,1);assert.equal(commands.filter(r=>r.value.action==='task/claim').length,0);
 assert.deepEqual(await operation('assign',assignment),assigned);
 await operation('tick');await service.router.drain(service.owner);assert.equal(fake.flowStats().executions.length,1);assert.equal(row('control','usage').value.model_calls,3);
 await operation('stop');await new Promise(setImmediate);
});

for(const action of ['assign','grant_create','grant_revoke'])test('public '+action+' uses its captured atomic operator model when ownership changes after precheck',async t=>{
 const f=fixture(t,{control:recipeControl(),principals:{founder}}),{runtime}=await sourceCopy(t);
 await runtime.peerRuntimeAction(request(f,'start'),'codex');
 const grant={operation_id:'setup-scoped-grant',grant_id:'atomic-route-grant',to_principal_id:'cos-a',scope:'alpha',actions:['task/submit'],expires_at:new Date(Date.now()+60000).toISOString()};
 if(action==='grant_revoke')await runtime.peerRuntimeAction(request(f,'grant_create',{input:grant}),'codex');
 const service=runtime.__fixtureService(fs.realpathSync(f.root)),original=service.model;let intercepted=false;
 // This temporary private seam inserts a real second-P1 owner transition
 // precisely between public live() and the original atomic model call. No
 // production caller or MCP request can obtain or replace service.model.
 service.model={execute(...args){
  intercepted=true;
  f.ledger.write('fixture.operator_race','founder',tx=>{const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,generation:p.value.generation+1,legacy_owner:{host:'codex',session_id:'new-session',epoch:8}},p.revision);});
  return original.execute(...args);
 }};
 const input=action==='assign'?{operation_id:'atomic-assign',task_id:'must-not-create',to_principal_id:'cos-a',grant_id:'atomic-route-grant',grant_generation:1,scope:'alpha',role:'cos',instructions:'No native invocation',acceptance:'No admission'}:action==='grant_create'?{...grant,operation_id:'atomic-grant-create'}:{operation_id:'atomic-grant-revoke',grant_id:'atomic-route-grant'};
 await assert.rejects(runtime.peerRuntimeAction(request(f,action,{input}),'codex'),code('PRODUCTION_OWNER_CHANGED'));assert.equal(intercepted,true);
 if(action==='grant_revoke')assert.equal(f.ledger.read(tx=>tx.get('grants',grant.grant_id)).value.status,'active');
 else if(action==='grant_create')assert.equal(f.ledger.read(tx=>tx.get('grants',grant.grant_id)),null);
 else assert.equal(f.ledger.read(tx=>tx.get('tasks','must-not-create')),null);
 await runtime.peerRuntimeAction(request(f,'stop',{session_id:'new-session',epoch:8}),'codex');await new Promise(setImmediate);
});

test('current canonical successor can stop a stale service, with current attribution and no replacement during drain',async t=>{
 const f=fixture(t),{runtime}=await sourceCopy(t),serviceLedger=new PeerLedger(f.root),owner=Symbol('fictional-retained-owner');
 let stops=0,release;const waiting=new Promise(resolve=>release=resolve);
 runtime.__installFixtureService(fs.realpathSync(f.root),{ledger:serviceLedger,owner,principal_id:'founder',authority:'outdated-authority',router:{snapshot(token){assert.equal(token,owner);return {stopped:stops>0,authority_held:false,running:false};},stop(token){assert.equal(token,owner);stops++;return {stopped:true};},drain(token){assert.equal(token,owner);return waiting;}}});
 t.after(()=>release());
 f.ledger.write('fixture.successor','founder',tx=>{
  tx.put('principals','new-founder',{principal_id:'new-founder',kind:'founder',status:'active',generation:1,native_id:'new-founder-native',host:'codex',legacy_owner:{host:'codex',session_id:'new-session',epoch:8}},0);
  const c=tx.get('control','company');tx.put('control',c.id,{...c.value,founder_principal_id:'new-founder'},c.revision);
 });
 const current=action=>request(f,action,{session_id:'new-session',epoch:8});
 await assert.rejects(runtime.peerRuntimeAction(current('tick'),'codex'),code('PEER_OPERATOR_CHANGED'));
 await assert.rejects(runtime.peerRuntimeAction({...current('grant_create'),input:{operation_id:'stale-service-grant',grant_id:'stale-grant',to_principal_id:'cos-a',actions:['task/submit'],expires_at:new Date(Date.now()+60000).toISOString()}},'codex'),code('PEER_OPERATOR_CHANGED'));
 assert.equal(f.ledger.read(tx=>tx.get('grants','stale-grant')),null);
 const stopped=await runtime.peerRuntimeAction(current('stop'),'codex');assert.equal(stops,1);assert.equal(stopped.physical_closure,'UNKNOWN');
 const event=f.ledger.db.prepare("SELECT principal_id,bytes FROM peer_events WHERE type='peer.production.stopped' ORDER BY seq DESC LIMIT 1").get();
 assert.equal(event.principal_id,'new-founder');assert.equal(JSON.parse(event.bytes).events[0].payload.session_id,'new-session');
 assert.equal((await runtime.peerRuntimeAction(current('status'),'codex')).stopping,true);
 await assert.rejects(runtime.peerRuntimeAction(current('start'),'codex'),code('PEER_RUNTIME_STOPPING'));
 release();await new Promise(setImmediate);assert.equal((await runtime.peerRuntimeAction(current('status'),'codex')).stopping,false);
});
