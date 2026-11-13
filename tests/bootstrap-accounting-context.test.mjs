import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import {createHash} from 'node:crypto';

const peers=fileURLToPath(new URL('../plugins/soloco/runtime/peers/',import.meta.url));
const url=file=>pathToFileURL(file).href;
const code=value=>error=>error?.code===value;
const held=error=>typeof error?.code==='string';
const textSha=text=>createHash('sha256').update(text,'utf8').digest('hex');

// Real temporary PeerLedger, membership writer and typed accounting replay.
// ONLY selected semantic context/preflight predecessors are fictional. No
// Native creation, native completion token, launcher or original issuer exists
// in this fixture. Conditional reconstruction DATA below is not Native proof.
function denyExternal(){
  const undo=[],calls=[];
  const replace=(object,key)=>{const original=object[key];object[key]=()=>{calls.push(key);throw Error('External operation forbidden: '+key);};undo.push(()=>{object[key]=original;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(childProcess,key);
  replace(childProcess.ChildProcess.prototype,'spawn');replace(net.Socket.prototype,'connect');replace(net.Server.prototype,'listen');
  for(const [object,keys] of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dgram,['createSocket']]])for(const key of keys)replace(object,key);
  for(const key of ['bind','connect','send'])replace(dgram.Socket.prototype,key);
  replace(globalThis,'fetch');replace(process,'kill');syncBuiltinESMExports();
  return {calls,restore(){for(const restore of undo.reverse())restore();syncBuiltinESMExports();}};
}

async function fixture(t,{purpose={},maintenance={},policy={},native_id='founder-native',originFields={}}={}){
  const external=denyExternal(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-bootstrap-accounting-source-'));
  let f;const originals=new Map();
  t.after(()=>{try{f?.close();for(const [file,bytes]of originals)assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(external.calls,[]);}finally{external.restore();fs.rmSync(directory,{recursive:true,force:true});}});
  const boundary=path.join(directory,'fictional-context.mjs');
  fs.writeFileSync(boundary,`// Explicitly SYNTHETIC semantic/preflight predecessors, never Native proof.
import {canonical,peerDigest} from ${JSON.stringify(url(path.join(peers,'ledger.mjs')))};
import {bootstrapMembershipAuthorityFrom} from ${JSON.stringify(url(path.join(peers,'origin-paused-bootstrap-accounting.mjs')))};
import {formatBootstrapMembershipFirstRpcGeometry,BOOTSTRAP_MEMBERSHIP_INSTRUCTION} from ${JSON.stringify(url(path.join(peers,'bootstrap-membership-preflight.mjs')))};
import {digest,validateBootstrapMembershipFirstRpc} from ${JSON.stringify(url(path.join(peers,'bootstrap-membership-contract.mjs')))};
let preflightFailure=null;
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
export function setPreflightFailure(value){preflightFailure=value;}
export function assertPeerBootstrapOperationFrom(tx,{ledger,actor,input}){
 const proof=bootstrapMembershipAuthorityFrom(tx,{ledger}),owner=tx.get('principals','founder');
 need(input.epoch===owner.value.legacy_owner.epoch&&actor.host===owner.value.host&&actor.session_id===owner.value.legacy_owner.session_id&&actor.native_id===owner.value.native_id,'SYNTHETIC_BOOTSTRAP_OWNER');
 return {...proof,deadline_at_ms:Date.parse(tx.get('control','origin').value.maintenance.expires_at)};
}
export function bootstrapMembershipEvidenceFrom(tx,options){
 const proof=assertPeerBootstrapOperationFrom(tx,options),origin=tx.get('control','origin'),company=tx.get('control','company');
 const body={protocol:'peer-bootstrap-membership-context-v1',control:{id:'company',value:proof.authority_company_value},origin:{id:'origin',value:proof.authority_origin_value},current_scope:options.enrollment.value.scope,current_meaning:{protocol:'peer-checked-input-current-meaning-v1',SYNTHETIC_complete_context:['Retain every finite limit and original UNKNOWN.','This fixture qualifies no actual company meaning or Native completion.']},contributors:{principals:['founder'],natives:['founder-native']}};
 const text=canonical(body),accounting={protocol:'SYNTHETIC-bootstrap-accounting-observation-v1',current_origin:origin,current_company:company,authority_company_ref:proof.authority_company_ref,authority_origin_ref:proof.authority_origin_ref,planned_delta:{used_enrollments:0,used_model_calls:1,used_review_calls:options.phase==='review'?1:0}};
 return {body,text,sha256:digest(text),contributors:body.contributors,deadline_at_ms:proof.deadline_at_ms,accounting};
}
export function prepareBootstrapMembershipAssignment(text){
 if(preflightFailure)throw preflightFailure;
 const g=formatBootstrapMembershipFirstRpcGeometry(text),commitment={protocol:'peer-bootstrap-membership-first-rpc-v1',payload_sha256:digest(text),instruction_sha256:digest(BOOTSTRAP_MEMBERSHIP_INSTRUCTION),frame_sha256:g.frame.sha256,recipe_sha256:'e'.repeat(64),input_utf8_bytes:g.input_utf8_bytes,whole_rpc_utf8_bytes:g.whole_rpc_utf8_bytes,frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:g.context_utf8_bytes,policy_maximum_context_bytes:g.policy_maximum_context_bytes,native_identity:'UNOBSERVED_GEOMETRY_ONLY'};
 validateBootstrapMembershipFirstRpc(commitment,text);return {plan:Object.freeze({SYNTHETIC_NONAUTHORIZING_PREFLIGHT_DATA:true}),commitment};
}
`);
  for(const name of ['model.mjs','membership.mjs']){
    const file=path.join(peers,name),original=fs.readFileSync(file,'utf8');originals.set(file,original);
    let replacements=0;
    const relocated=original.split('\n').map(line=>{
      const match=line.match(/^(import .* from )'([^']+)';$/);if(!match)return line;
      const [,prefix,specifier]=match;if(!specifier.startsWith('./'))return line;
      const target=specifier==='./bootstrap-membership-context.mjs'?(replacements++,boundary):specifier==='./model.mjs'?path.join(directory,'model.mjs'):path.resolve(peers,specifier);
      return prefix+JSON.stringify(url(target))+';';
    }).join('\n');
    assert.equal(replacements,1);const body=value=>value.split('\n').filter(line=>!line.startsWith('import ')).join('\n');assert.equal(body(relocated),body(original));
    fs.writeFileSync(path.join(directory,name),relocated);
  }
  const {peerFixture}=await import(new URL('./peer-fixture.mjs',import.meta.url));
  const {canonical,peerDigest}=await import(url(path.join(peers,'ledger.mjs')));
  const accounting=await import(url(path.join(peers,'origin-paused-bootstrap-accounting.mjs')));
  const selected=await import(url(path.join(peers,'origin-maintenance-authority.mjs'))),checkpoint=await import(url(path.join(peers,'input-frontier-checkpoint.mjs')));
  const model=await import(url(path.join(directory,'model.mjs'))),membership=await import(url(path.join(directory,'membership.mjs'))),context=await import(url(boundary));
  let clock=Date.now();t.mock.method(Date,'now',()=>clock);
  const actor={host:'codex',session_id:'SYNTHETIC-accounting-owner',native_id},owner={host:actor.host,session_id:actor.session_id,epoch:7};
  f=peerFixture({control:{paused:true,policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:100,...policy}},principals:{founder:{legacy_owner:owner,native_id},scheduler:{status:'held'},publisher:{status:'held'}}});
  const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
  f.ledger.write('origin.quarantined','founder',tx=>{
    const company=tx.get('control','company'),founder=tx.get('principals','founder'),selectedFields=typeof originFields==='function'?originFields(tx,{ref,peerDigest}):originFields,origin=tx.put('control','origin',{protocol:'peer-origin-quarantine-v1',id:'SYNTHETIC-accounting-origin',status:'quarantined',company_id:f.ledger.company_id,owner,...selectedFields,maintenance:{protocol:'peer-origin-maintenance-authority-v1',status:'active',pause_generation:1,expires_at:new Date(clock+3600000).toISOString(),max_model_calls:10,max_review_calls:5,used_model_calls:0,used_review_calls:0,units:'new-origin-maintenance-model-invocation',old_allowance_conversion:'none',...maintenance,paused_bootstrap:{protocol:'peer-origin-paused-bootstrap-purpose-v1',purpose:'membership-qualification-only',max_enrollments:2,max_model_calls:4,max_review_calls:2,used_enrollments:0,used_model_calls:0,used_review_calls:0,...purpose}}},0);
    tx.put('control','company',{...company.value,origin:ref('control',origin)},company.revision);
    tx.put('principals','founder',{...founder.value,SYNTHETIC_selected_bootstrap_origin:'source-accounting-fixture'},founder.revision);
  });
  const facade=model.createOriginalPeerBootstrapMembershipFacade({ledger:f.ledger,actor});
  const lifecycle=membership.createOriginalPeerBootstrapMembershipLifecycle(f.ledger,facade);
  const get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));let sequence=0;
  const enrollInput=(extra={})=>({operation_id:'accounting-'+(++sequence),epoch:7,enrollment_id:'SYNTHETIC-enrollment',principal_id:'SYNTHETIC-member',role:'reviewer',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(clock+1800000).toISOString(),max_model_calls:2,expected_generation:0,source_instruction:'SYNTHETIC finite accounting fixture only.',...extra});
  const admitInput=(phase='reconstruction',extra={})=>({operation_id:'accounting-'+(++sequence),epoch:7,enrollment_id:'SYNTHETIC-enrollment',phase,...(phase==='review'?{reviewer_principal_id:'reviewer'}:{}),...extra});
  const counters=()=>{const m=get('control','origin').value.maintenance;return {nested:{...m.paused_bootstrap},outer:{used_model_calls:m.used_model_calls,used_review_calls:m.used_review_calls},global:get('control','usage')?.value.model_calls??0};};
  const snapshot=()=>f.ledger.read(tx=>canonical(Object.fromEntries(['control','principals','commands','work_items','slots','effects'].map(family=>[family,tx.list(family,{limit:100}).items]))));
  const conditionalRecon=()=>f.ledger.write('SYNTHETIC.completed-reconstruction-DATA','founder',tx=>{
    const p=tx.get('work_items','membership-phase:SYNTHETIC-enrollment:reconstruction'),c=tx.get('work_items',p.value.context_ref.id),output='SYNTHETIC completed reconstruction DATA; no Native completion was observed.';
    const r=tx.put('work_items','membership-result:'+p.value.attempt_id,{kind:'membership_reconstruction',status:'returned',termination_confirmed:true,source_cut_sha256:c.value.source_cut_sha256,output,output_sha256:model.digest(output)},0);
    tx.put('work_items',p.id,{...p.value,status:'closed',result_ref:ref('work_items',r),reads:[[0,c.value.text.length]],submission:{content:output,sha256:model.digest(output)}},p.revision);
    for(const family of ['slots','effects']){const row=tx.get(family,p.value.execution_id);tx.put(family,row.id,{...row.value,status:family==='slots'?'released':'succeeded',termination_confirmed:true},row.revision);}
  });
  return {...f,model,membership,accounting,selected,checkpoint,context,lifecycle,canonical,peerDigest,ref,get,enrollInput,admitInput,counters,snapshot,conditionalRecon,setClock(value){clock=value;}};
}

function captureRolledBackWrite(f,operation){
  const guarded=f.ledger.guardedWrite,marker=Error('SYNTHETIC private capture rollback'),captured={puts:[]},before=f.snapshot();
  f.ledger.guardedWrite=function(type,principal,callback,terminal){
    captured.type=type;captured.principal=principal;
    return Reflect.apply(guarded,this,[type,principal,raw=>{
      callback({...raw,put(family,id,value,revision){captured.puts.push({family,id,value:structuredClone(value),revision});return raw.put(family,id,value,revision);}});
      throw marker; // AFTER the actual callback/physical writes, BEFORE commit.
    },terminal]);
  };
  try{assert.throws(operation,error=>error===marker);}finally{f.ledger.guardedWrite=guarded;}
  assert(captured.puts.length>0);assert.equal(f.snapshot(),before,'capture rolls back every actual writer mutation');return captured;
}

test('enroll spends one nested enrollment unit; exact duplicate operation spends zero',{concurrency:false},async t=>{
  const f=await fixture(t),input=f.enrollInput(),initial=f.ledger.read(tx=>f.accounting.bootstrapMembershipAuthorityFrom(tx,{ledger:f.ledger}));
  const result=f.lifecycle.operator.enroll(input),after=f.counters();assert.equal(after.nested.used_enrollments,1);assert.equal(after.nested.used_model_calls,0);assert.deepEqual(after.outer,{used_model_calls:0,used_review_calls:0});assert.equal(after.global,0);
  assert.equal(result.value.policy_sha256,initial.company_authority_sha256);assert.deepEqual(result.value.bootstrap_authority_ref,initial.authority_company_ref);
  const again=f.lifecycle.operator.enroll(input);assert.deepEqual(again,result);assert.deepEqual(f.counters(),after);
  const command=f.ledger.read(tx=>tx.list('commands',{limit:100}).items.find(row=>row.value.operation_id===input.operation_id));assert.deepEqual(command.value.bootstrap,{protocol:'peer-origin-paused-bootstrap-command-v1',action:'enroll',input});assert.equal(command.value.request_sha256,f.peerDigest({action:'enroll',input}));
});

test('typed command witness preserves omitted defaults and authenticates their original derived enrollment',{concurrency:false},async t=>{
  const f=await fixture(t),input=f.enrollInput();for(const key of ['role','host','scope','input_refs','max_model_calls'])delete input[key];
  const enrolled=f.lifecycle.operator.enroll(input);assert.equal(enrolled.value.role,'cos');assert.equal(enrolled.value.host,'codex');assert.equal(enrolled.value.scope,'*');assert.deepEqual(enrolled.value.input_refs,[]);assert.equal(enrolled.value.max_model_calls,2);
  const command=f.ledger.read(tx=>tx.list('commands',{limit:100}).items.find(row=>row.value.operation_id===input.operation_id));assert.deepEqual(command.value.bootstrap.input,input);assert.equal(command.value.request_sha256,f.peerDigest({action:'enroll',input}));
  assert.equal(f.ledger.read(tx=>f.accounting.bootstrapMembershipAuthorityFrom(tx,{ledger:f.ledger})).purpose.used_enrollments,1);
});

test('reconstruction preserves authority baseline and charges nested, outer, global, personal and enrollment once',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());const input=f.admitInput(),admitted=f.lifecycle.operator.admit(input),after=f.counters();
  assert.equal(after.nested.used_enrollments,1);assert.equal(after.nested.used_model_calls,1);assert.equal(after.nested.used_review_calls,0);assert.deepEqual(after.outer,{used_model_calls:1,used_review_calls:0});assert.equal(after.global,1);assert.equal(f.get('control','usage:SYNTHETIC-member').value.model_calls,1);assert.equal(f.get('work_items','membership:SYNTHETIC-enrollment').value.used_model_calls,1);
  const c=f.get('work_items',admitted.phase.value.context_ref.id),assignment=JSON.parse(c.value.text),e=f.get('work_items','membership:SYNTHETIC-enrollment'),a=f.get('work_items',admitted.phase.value.admission_ref.id);
  assert.deepEqual(a.value.binding.control_ref,e.value.bootstrap_authority_ref);assert.equal(f.peerDigest(assignment.source_cut.control.value),e.value.policy_sha256);assert.deepEqual(assignment.bootstrap_accounting.planned_delta,{used_enrollments:0,used_model_calls:1,used_review_calls:0});assert.equal(assignment.bootstrap_accounting.current_origin.value.maintenance.used_model_calls,0);
  assert.deepEqual(f.lifecycle.operator.admit(input),admitted);assert.deepEqual(f.counters(),after);
});

test('conditional Source review retains one semantic source cut and spends both review/model units',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());const recon=f.lifecycle.operator.admit(f.admitInput());f.conditionalRecon();
  const review=f.lifecycle.operator.admit(f.admitInput('review')),after=f.counters(),rc=f.get('work_items',recon.phase.value.context_ref.id),qc=f.get('work_items',review.phase.value.context_ref.id);
  assert.equal(after.nested.used_enrollments,1);assert.equal(after.nested.used_model_calls,2);assert.equal(after.nested.used_review_calls,1);assert.deepEqual(after.outer,{used_model_calls:2,used_review_calls:1});assert.equal(after.global,2);assert.equal(f.get('control','usage:reviewer').value.model_calls,1);assert.equal(f.get('work_items','membership:SYNTHETIC-enrollment').value.used_model_calls,2);
  assert.equal(rc.value.source_cut_sha256,qc.value.source_cut_sha256);const r=JSON.parse(rc.value.text),q=JSON.parse(qc.value.text);assert.deepEqual(r.source_cut,q.source_cut);assert.notDeepEqual(r.bootstrap_accounting,q.bootstrap_accounting);assert.deepEqual(q.bootstrap_accounting.planned_delta,{used_enrollments:0,used_model_calls:1,used_review_calls:1});assert.equal(q.bootstrap_accounting.current_origin.value.maintenance.used_model_calls,1);assert.equal(q.reconstruction.assignment.text,rc.value.text);
});

test('pending recovery consumes a new enrollment identity without renewing expiry or unspent allowance',{concurrency:false},async t=>{
  const f=await fixture(t),input=f.enrollInput();f.lifecycle.operator.enroll(input);f.lifecycle.operator.admit(f.admitInput());
  f.lifecycle.operator.revoke({operation_id:'revoke-source',epoch:7,enrollment_id:input.enrollment_id,source_instruction:'SYNTHETIC revoke retains all spent/UNKNOWN.'});const revoked=f.get('work_items','membership:'+input.enrollment_id),before=f.counters();
  const recovered=f.lifecycle.operator.enroll(f.enrollInput({enrollment_id:'SYNTHETIC-recovery',expected_generation:1,expires_at:input.expires_at,max_model_calls:1}));
  assert.equal(f.counters().nested.used_enrollments,before.nested.used_enrollments+1);assert.equal(f.counters().nested.used_model_calls,before.nested.used_model_calls);assert.deepEqual(f.counters().outer,before.outer);assert.equal(recovered.value.max_model_calls,1);assert.equal(recovered.value.expires_at,input.expires_at);assert.deepEqual(recovered.value.recovered_from,f.ref('work_items',revoked));assert.deepEqual(recovered.value.bootstrap_authority_ref,revoked.value.bootstrap_authority_ref);
  assert.equal(f.counters().global,before.global);const priorPhase=f.get('work_items','membership-phase:'+input.enrollment_id+':reconstruction');assert.equal(f.get('slots',priorPhase.value.execution_id).value.status,'unknown');
});

test('preflight failure is before all physical puts and retains every accounting unit',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());const before=f.snapshot(),failure=Object.assign(Error('SYNTHETIC complete first RPC overflow'),{code:'SYNTHETIC_WIRE_CAPACITY'});f.context.setPreflightFailure(failure);
  let puts=0;const guarded=f.ledger.guardedWrite;f.ledger.guardedWrite=function(type,actor,callback,terminal){return Reflect.apply(guarded,this,[type,actor,raw=>callback({...raw,put(...args){puts++;return raw.put(...args);}}),terminal]);};
  try{assert.throws(()=>f.lifecycle.operator.admit(f.admitInput()),error=>error===failure);}finally{f.ledger.guardedWrite=guarded;}
  assert.equal(puts,0);assert.equal(f.snapshot(),before);
});

for(const exhausted of ['nested-model','outer-model','nested-review','outer-review'])test('unproven '+exhausted+' spend cannot charge or partially admit',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());if(exhausted.includes('review')){f.lifecycle.operator.admit(f.admitInput());f.conditionalRecon();}
  // Deliberately unauthenticated counter mutation is itself a provenance
  // negative. A genuine maximal-budget positive is covered separately below.
  f.ledger.write('SYNTHETIC-unproven-spend','founder',tx=>{const o=tx.get('control','origin'),m=structuredClone(o.value.maintenance);if(exhausted==='nested-model')m.paused_bootstrap.used_model_calls=m.paused_bootstrap.max_model_calls;if(exhausted==='outer-model')m.used_model_calls=m.max_model_calls;if(exhausted==='nested-review')m.paused_bootstrap.used_review_calls=m.paused_bootstrap.max_review_calls;if(exhausted==='outer-review')m.used_review_calls=m.max_review_calls;const next=tx.put('control','origin',{...o.value,maintenance:m},o.revision),c=tx.get('control','company');tx.put('control','company',{...c.value,origin:f.ref('control',next)},c.revision);});
  const before=f.snapshot();assert.throws(()=>f.lifecycle.operator.admit(f.admitInput(exhausted.includes('review')?'review':'reconstruction')),held);assert.equal(f.snapshot(),before);
});

test('last genuine enrollment unit remains readable and idempotent at the maximum',{concurrency:false},async t=>{
  const f=await fixture(t,{purpose:{max_enrollments:1,max_model_calls:2,max_review_calls:1}}),input=f.enrollInput();const first=f.lifecycle.operator.enroll(input);assert.equal(f.counters().nested.used_enrollments,1);assert.deepEqual(f.lifecycle.operator.enroll(input),first);
  const before=f.snapshot();assert.throws(()=>f.lifecycle.operator.enroll(f.enrollInput({enrollment_id:'SYNTHETIC-over-limit',principal_id:'SYNTHETIC-second-member'})),held);assert.equal(f.snapshot(),before);
});

test('genuine final model/review units remain readable and duplicate admission cannot spend again',{concurrency:false},async t=>{
  const f=await fixture(t,{purpose:{max_enrollments:1,max_model_calls:2,max_review_calls:1},maintenance:{max_model_calls:2,max_review_calls:1}});f.lifecycle.operator.enroll(f.enrollInput());f.lifecycle.operator.admit(f.admitInput());f.conditionalRecon();
  const input=f.admitInput('review'),admitted=f.lifecycle.operator.admit(input),before=f.counters();assert.equal(before.nested.used_model_calls,2);assert.equal(before.nested.used_review_calls,1);assert.deepEqual(before.outer,{used_model_calls:2,used_review_calls:1});
  const proof=f.ledger.read(tx=>f.accounting.bootstrapMembershipAuthorityFrom(tx,{ledger:f.ledger}));assert.equal(proof.purpose.used_model_calls,proof.purpose.max_model_calls);assert.equal(proof.purpose.used_review_calls,proof.purpose.max_review_calls);assert.deepEqual(f.lifecycle.operator.admit(input),admitted);assert.deepEqual(f.counters(),before);
});

for(const drift of ['expiry','pause','owner','unknown-field'])test(drift+' drift remains Held rather than entering the stable baseline',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());
  if(drift==='expiry')f.setClock(Date.parse(f.get('control','origin').value.maintenance.expires_at));
  else f.ledger.write('SYNTHETIC-invalid-authority-change','founder',tx=>{if(drift==='owner'){const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,legacy_owner:{...p.value.legacy_owner,epoch:8}},p.revision);}else{const c=tx.get('control','company');tx.put('control','company',{...c.value,...(drift==='pause'?{pause_generation:c.value.pause_generation+1}:{SYNTHETIC_unknown_authority:true})},c.revision);}});
  const before=f.snapshot();assert.throws(()=>f.lifecycle.operator.admit(f.admitInput()),held);assert.equal(f.snapshot(),before);
});

test('actual selected-maintenance reader rejects unproven spend despite an equal normalized authority hash',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());f.lifecycle.operator.admit(f.admitInput());
  const read=()=>f.ledger.read(tx=>f.selected.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:f.ledger.company_id}));
  const original=read(),beforeHash=f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance);assert.equal(original.maintenance_authority_sha256,beforeHash);
  f.ledger.write('SYNTHETIC-unproven-bootstrap-charge','founder',tx=>{
    const o=tx.get('control','origin'),m=o.value.maintenance,next=tx.put('control','origin',{...o.value,maintenance:{...m,used_model_calls:m.used_model_calls+1,paused_bootstrap:{...m.paused_bootstrap,used_model_calls:m.paused_bootstrap.used_model_calls+1}}},o.revision),c=tx.get('control','company');
    tx.put('control','company',{...c.value,origin:f.ref('control',next)},c.revision);
  });
  assert.equal(f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance),beforeHash,'normalization alone cannot establish typed cost provenance');
  const before=f.snapshot();assert.throws(read,code('BOOTSTRAP_ACCOUNTING_REQUIRED'));assert.equal(f.snapshot(),before);
});

for(const negative of ['unrelated-message','unknown','late-evidence','unreviewed-result','revoke'])test('actual checkpoint refuses '+negative+' namespace before original seal lookup',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());
  if(negative==='revoke')f.lifecycle.operator.revoke({operation_id:'namespace-revoke',epoch:7,enrollment_id:'SYNTHETIC-enrollment',source_instruction:'SYNTHETIC negative namespace control; no refund.'});
  else if(negative==='unknown'){
    f.ledger.write('bootstrap-membership.unknown','source-observer:bootstrap-membership',tx=>{
      const execution='SYNTHETIC-unproved-unknown-unit',unit={kind:'membership_execution',membership_id:'SYNTHETIC-enrollment',principal_id:'SYNTHETIC-member',attempt_id:'SYNTHETIC-unproved-attempt',status:'unknown',termination_confirmed:false};
      tx.put('work_items','SYNTHETIC-unknown-phase',{kind:'membership_phase',bootstrap_protocol:'peer-bootstrap-membership-phase-v1',membership_id:unit.membership_id,phase:'reconstruction',status:'unknown',execution_id:execution,error:'SYNTHETIC unresolved unqualified obligation',termination_confirmed:false},0);
      for(const family of ['slots','effects'])tx.put(family,execution,unit,0);
    });
  }else f.ledger.write(negative==='late-evidence'?'bootstrap-membership.late_evidence':'SYNTHETIC-'+negative,'source-observer:bootstrap-membership',tx=>{
    if(negative==='unrelated-message')tx.put('messages','SYNTHETIC-new-message',{scope:'*',content:'An unrelated new business fact must remain applicable.'},0);
    else tx.put('work_items','SYNTHETIC-'+negative,{kind:negative==='late-evidence'?'bootstrap_membership_late_evidence':'membership_qualification',qualifies:false,review:{verdict:'Fail',blockers:['SYNTHETIC unreviewed or adverse evidence remains raw.']}},0);
  });
  // This correct-shaped DATA reference is intentionally absent. The exact
  // namespace refusal must occur BEFORE any original checkpoint/seal lookup;
  // a missing-seal error cannot satisfy this regression.
  const checkpoint_ref={family:'work_items',id:'SYNTHETIC-unused-checkpoint',revision:1,sha256:'f'.repeat(64)},before=f.snapshot(),cost=f.counters();
  assert.throws(()=>f.ledger.read(tx=>f.checkpoint.assertPeerBootstrapInputFrontierCheckpointFrom(tx,{ledger:f.ledger,checkpoint_ref})),code('BOOTSTRAP_CHECKPOINT_UNSUPPORTED_TRANSITION'));
  assert.equal(f.snapshot(),before);assert.deepEqual(f.counters(),cost);
});

test('actual accounting/checkpoint provider failures preserve original Error and AggregateError identity',{concurrency:false},async t=>{
  const f=await fixture(t);f.lifecycle.operator.enroll(f.enrollInput());const before=f.snapshot(),checkpoint_ref={family:'work_items',id:'SYNTHETIC-unused-checkpoint',revision:1,sha256:'f'.repeat(64)};
  for(const failure of [Object.assign(Error('SYNTHETIC original event provider'),{code:'SYNTHETIC_PROVIDER'}),new AggregateError([Error('SYNTHETIC original member')],'SYNTHETIC aggregate provider')]){
    assert.throws(()=>f.ledger.read(tx=>f.checkpoint.assertPeerBootstrapInputFrontierCheckpointFrom({...tx,events(){throw failure;}},{ledger:f.ledger,checkpoint_ref})),error=>error===failure);
    assert.equal(f.snapshot(),before);
  }
});

for(const forgery of ['enrollment-principal-extra','admission-slot-principal'])test('actual selected reader refuses captured typed '+forgery+' storage forgery',{concurrency:false},async t=>{
  const f=await fixture(t);if(forgery==='admission-slot-principal')f.lifecycle.operator.enroll(f.enrollInput());
  const normalized=f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance);
  const captured=captureRolledBackWrite(f,()=>forgery==='enrollment-principal-extra'?f.lifecycle.operator.enroll(f.enrollInput()):f.lifecycle.operator.admit(f.admitInput()));
  const target=captured.puts.find(put=>forgery==='enrollment-principal-extra'?put.family==='principals'&&put.id==='SYNTHETIC-member':put.family==='slots');assert(target);
  if(forgery==='enrollment-principal-extra')target.value.SYNTHETIC_unselected_authority=true;
  else target.value.principal_id='SYNTHETIC-foreign-slot-principal';
  // Explicit simulated storage forgery, never an original producer/Native
  // receipt: retain the ACTUAL captured command, input, type, actor and counter
  // pairs, altering only a row body that is not referenced by another SHA.
  f.ledger.write(captured.type,captured.principal,tx=>{for(const put of captured.puts)tx.put(put.family,put.id,put.value,put.revision);});
  assert.equal(f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance),normalized);
  const before=f.snapshot();assert.throws(()=>f.ledger.read(tx=>f.selected.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:f.ledger.company_id})),code('BOOTSTRAP_ACCOUNTING_REQUIRED'));assert.equal(f.snapshot(),before);
});

for(const counter of ['used_model_calls','used_review_calls','used_frontier_calls','used_frontier_reviews','used_frontier_seal_reviews'])test('pre-enrollment '+counter+' rise then refund is rejected before unsupported-event dispatch',{concurrency:false},async t=>{
  const f=await fixture(t,{maintenance:{max_frontier_calls:10,used_frontier_calls:0,max_frontier_reviews:5,used_frontier_reviews:0,max_frontier_seal_reviews:2,used_frontier_seal_reviews:0}});
  const initial=f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance);
  for(const amount of [1,0])f.ledger.write('SYNTHETIC-prebootstrap-'+(amount?'rise':'refund'),'founder',tx=>{
    const o=tx.get('control','origin'),c=tx.get('control','company'),next=tx.put('control','origin',{...o.value,maintenance:{...o.value.maintenance,[counter]:amount}},o.revision);
    tx.put('control','company',{...c.value,origin:f.ref('control',next)},c.revision);
  });
  assert.equal(f.get('work_items','membership:SYNTHETIC-enrollment'),null);assert.equal(f.counters().nested.used_enrollments,0);
  assert.equal(f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance),initial,'same final normalized hash cannot erase an earlier spend');
  const before=f.snapshot(),rollback=code('BOOTSTRAP_ACCOUNTING_COUNTER_ROLLBACK');
  assert.throws(()=>f.ledger.read(tx=>f.accounting.assertPeerOriginPausedBootstrapAccountingFrom(tx,{company_id:f.ledger.company_id})),rollback);
  assert.throws(()=>f.ledger.read(tx=>f.accounting.bootstrapMembershipAuthorityFrom(tx,{ledger:f.ledger})),rollback);
  assert.throws(()=>f.ledger.read(tx=>f.selected.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:f.ledger.company_id})),rollback);
  assert.equal(f.snapshot(),before);
});

test('unsupported monotonic pre-enrollment spend cannot become selected cost provenance',{concurrency:false},async t=>{
  const f=await fixture(t),initial=f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance);
  f.ledger.write('SYNTHETIC-unsupported-prebootstrap-cost','founder',tx=>{
    const o=tx.get('control','origin'),c=tx.get('control','company'),next=tx.put('control','origin',{...o.value,maintenance:{...o.value.maintenance,used_model_calls:o.value.maintenance.used_model_calls+1}},o.revision);
    tx.put('control','company',{...c.value,origin:f.ref('control',next)},c.revision);
  });
  assert.equal(f.get('work_items','membership:SYNTHETIC-enrollment'),null);assert.equal(f.selected.peerOriginSelectedMaintenanceAuthoritySha256(f.get('control','origin').value.maintenance),initial);
  const before=f.snapshot(),unsupported=code('BOOTSTRAP_ACCOUNTING_PREBOOTSTRAP_COST_REQUIRED');
  assert.throws(()=>f.ledger.read(tx=>f.accounting.assertPeerOriginPausedBootstrapAccountingFrom(tx,{company_id:f.ledger.company_id})),unsupported);
  assert.throws(()=>f.ledger.read(tx=>f.accounting.bootstrapMembershipAuthorityFrom(tx,{ledger:f.ledger})),unsupported);
  assert.throws(()=>f.ledger.read(tx=>f.selected.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:f.ledger.company_id})),unsupported);
  assert.equal(f.snapshot(),before);
});

// These three pre-bootstrap compatibility controls simulate persisted Source
// admission prefixes. Their real P1 references/events and actual cold readers
// test storage grammar/accounting only. Support/geometry below is fictional
// DATA, not an issued original plan, qualified context, birth or drain proof.
function sourcePrefixWire(f,text,protocol,instruction,policy){
  const frame=f.canonical({SYNTHETIC_unissued_context:text}),input=[{type:'text',text:'Work instruction:\n'+instruction},{type:'text',text:frame}];
  const first=f.canonical({id:'SYNTHETIC-no-native',method:'turn/start',params:{threadId:'SYNTHETIC-no-native',input}})+'\n';
  return {protocol,payload_sha256:textSha(text),instruction_sha256:textSha(instruction),frame_sha256:textSha(frame),recipe_sha256:textSha('SYNTHETIC-unissued-Source-recipe'),input_utf8_bytes:Buffer.byteLength(JSON.stringify(input)),whole_rpc_utf8_bytes:Buffer.byteLength(first),frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:Buffer.byteLength(text),policy_maximum_context_bytes:policy.max_context_bytes,native_identity:'UNOBSERVED_GEOMETRY_ONLY'};
}
function assertSourcePrefixReadable(f,{model,review,frontier=0,seal=0}){
  assert.equal(f.get('work_items','membership:SYNTHETIC-enrollment'),null);
  const before=f.snapshot(),o=f.get('control','origin'),m=o.value.maintenance;
  assert.equal(m.used_model_calls,model);assert.equal(m.used_review_calls,review);
  assert.equal(m.used_frontier_calls??0,frontier);assert.equal(m.used_frontier_seal_reviews??0,seal);
  assert.equal(f.get('control','usage').value.model_calls,model);
  const proof=f.ledger.read(tx=>f.accounting.assertPeerOriginPausedBootstrapAccountingFrom(tx,{company_id:f.ledger.company_id}));
  assert.deepEqual(proof.current_origin_ref,f.ref('control',o));assert.deepEqual(proof.authority_origin_ref,f.ref('control',o));
  assert.equal(proof.purpose.used_enrollments,0);assert.equal(proof.purpose.used_model_calls,0);assert.equal(proof.purpose.used_review_calls,0);assert.equal(proof.authority_issued,false);assert.deepEqual(proof.transitions,[]);
  assert.deepEqual(f.ledger.read(tx=>f.accounting.bootstrapMembershipAuthorityFrom(tx,{ledger:f.ledger})),proof);
  const selected=f.ledger.read(tx=>f.selected.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:f.ledger.company_id}));assert.deepEqual(selected.origin_ref,proof.current_origin_ref);assert.equal(selected.authority_issued,false);assert.equal(f.snapshot(),before);
}

test('synthetic original-range RESERVED admission remains readable before the first bootstrap enrollment',{concurrency:false},async t=>{
  const sourceText=JSON.stringify({SYNTHETIC:'Complete fictional range; original UNKNOWN stays UNKNOWN.'}),source={source_id:'SYNTHETIC-original',family:'records',key:'SYNTHETIC-record',sha256:textSha(sourceText)};
  const f=await fixture(t,{native_id:'SYNTHETIC-accounting-owner',originFields(tx,{ref,peerDigest}){
    const page=tx.put('work_items','SYNTHETIC-original-archive:0',{kind:'origin_archive_page',origin_id:'SYNTHETIC-accounting-origin',section:'original_sources',sequence:0,items:[source]},0);
    return {current_cut_sha256:textSha('SYNTHETIC-original-cut'),manifest:{original_sources:{count:1,sha256:peerDigest([source]),pages:[ref('work_items',page)]}},legacy_unknown_reservations:[],late_obligation_refs:[]};
  }});
  const {ORIGIN_MAINTENANCE_INSTRUCTION}=await import(url(path.join(peers,'origin-maintenance-instruction.mjs')));
  f.ledger.write('origin.maintenance.admitted','founder',tx=>{
    const o=tx.get('control','origin'),c=tx.get('control','company'),m=o.value.maintenance,id='origin-maintenance:11111111-1111-4111-8111-111111111111',kind='peer-origin-reconstruction',operation_id='SYNTHETIC-range-operation';
    const segment={source_id:source.source_id,sha256:source.sha256,offset:0,length:sourceText.length,total_characters:sourceText.length},subject={protocol:'peer-origin-range-subject-v1',origin_id:o.value.id,source_cut_sha256:o.value.current_cut_sha256,segments:[segment],reconstruction_ref:null};
    const response_contract={protocol:'peer-origin-response-contract-v1',grammar_only_not_a_verdict:true,canonical_json:'recursively sorted object keys; no formatting whitespace; exact canonical text submitted first and returned finally',maximum_utf8_bytes:16384,maximum_json_depth:30,maximum_json_nodes:20000,numbers:'finite; negative zero is forbidden',subject_value:subject,text_values:{type:'string',nonempty_trimmed:true,maximum_utf16_characters:4000,nul_forbidden:true},authority_issued:false,output_protocol:'peer-origin-reconstruction-result-v1',required_keys:['mappings','protocol','reason','subject'],optional_keys:[],reason:{type:'text_values'},mappings:{type:'array',exact_count:1,order:'exact subject.segments order',required_entry_keys:['disposition','length','offset','reason','sha256','source_id'],optional_entry_keys:['legacy_classification_id'],coordinates_exactly:[{source_id:source.source_id,sha256:source.sha256,offset:0,length:sourceText.length}],disposition:['retain-global','legacy-represented'],reason:{type:'text_values'},retain_global:{legacy_classification_id:'must be absent; preserves original global applicability/uncertainty'},legacy_represented:{requires:'whole original source, offset0 and length===total_characters; actual legacy_frontier.classifications entry must be represented and its source SHA must match',legacy_classification_id:'exact original canonical classification id; never a caller scope/ready flag'}},uncertainty_encoding:'No verdict field exists. Retain-global with reasons for unknown/unqualified meaning or scope; this is DATA, not a positive scope or approval.'};
    const body={protocol:'peer-origin-maintenance-context-v1',kind,company_id:f.ledger.company_id,subject,subject_sha256:f.peerDigest(subject),pinned_team:{SYNTHETIC_unqualified:true},authority:{owner:o.value.owner,maintenance:m,peer_policy:c.value.policy,original_legacy_units:'retained-without-conversion'},original_source_manifest:o.value.manifest.original_sources,legacy_frontier:{SYNTHETIC_unqualified:true},compulsory_originals:[{source,raw:sourceText}],legacy_reservations:[],late_obligations:[],late_obligation_refs:[],current_obligations:[],current_reservations:[],prior_reviews:[],sources:[{source,offset:0,length:sourceText.length,text:sourceText,total_characters:sourceText.length}],reconstruction:null,response_contract,instructions:'SYNTHETIC Source-prefix accounting only. This DATA qualifies no actual source meaning.'};
    const text=f.canonical(body),context=tx.put('work_items',id+':context',{kind:'origin_maintenance_context',body,text,sha256:textSha(text)},0),{used_model_calls,used_review_calls,...stable}=m;
    const binding={protocol:'peer-origin-maintenance-admission-v1',pause_generation:m.pause_generation,kind,origin_id:o.value.id,company_id:f.ledger.company_id,source_cut_sha256:o.value.current_cut_sha256,context_ref:f.ref('work_items',context),context_sha256:context.value.sha256,subject,subject_sha256:body.subject_sha256,deadline_at_ms:Date.parse(m.expires_at),participant_id:id+':participant',reconstruction_ref:null,maintenance_authority_sha256:f.peerDigest(stable),policy_sha256:f.peerDigest(c.value.policy),prior_reviews_sha256:f.peerDigest([]),obligation_frontier_sha256:f.peerDigest([])};
    const request={operation_id,kind,segments:[{source_id:source.source_id,sha256:source.sha256,offset:0,length:sourceText.length}]},admission=tx.put('work_items',id+':admission',{kind:'origin_maintenance_admission',binding,source_support:{protocol:'peer-origin-maintenance-assignment-v1',bridge_sha256:textSha('SYNTHETIC-unissued-bridge'),creation_mode:'fresh-original-protected-thread',SYNTHETIC_STORAGE_PREFIX_ONLY:true},first_rpc:sourcePrefixWire(f,text,'peer-origin-maintenance-first-rpc-v1',ORIGIN_MAINTENANCE_INSTRUCTION,c.value.policy),operation_id,operation_sha256:f.peerDigest(request)},0),admission_ref=f.ref('work_items',admission);
    const phase=tx.put('work_items',id+':phase',{kind:'origin_maintenance_phase',status:'reserved',admission_ref,context_ref:binding.context_ref,native_id:null,execution_id:id},0),segments=request.segments;
    tx.put('work_items','origin-maintenance-target:'+f.peerDigest([o.value.id,o.value.current_cut_sha256,kind,segments,null]),{kind:'origin_maintenance_target',origin_id:o.value.id,source_cut_sha256:o.value.current_cut_sha256,kind_name:kind,segments,reconstruction_ref:null,admission_ref,phase_id:phase.id,attempts:1},0);
    const founder=tx.get('principals','founder'),actor={host:founder.value.host,session_id:founder.value.legacy_owner.session_id,native_id:founder.value.native_id};
    tx.put('commands','origin-maintenance-operation:'+f.peerDigest([f.ledger.company_id,actor,operation_id]),{kind:'origin_maintenance_command',protocol:'peer-origin-maintenance-operation-v1',operation_id,request_sha256:f.peerDigest(request),admission_ref,phase_id:phase.id,context_ref:binding.context_ref,private_capability_reconstructable:false},0);
    tx.put('work_items',binding.participant_id,{kind:'origin_maintenance_participant',status:'reserved',role:kind,native_id:null,admission_ref,ordinary_membership:false},0);
    tx.put('slots',id,{kind:'origin_maintenance_execution',status:'active',scope:'*',admission_ref,capacity_known:true,original_unit:'new-origin-maintenance-model-invocation'},0);tx.put('effects',id,{kind:'origin_maintenance_execution',status:'reserved',scope:'*',admission_ref,termination_confirmed:false},0);
    const next=tx.put('control','origin',{...o.value,maintenance:{...m,used_model_calls:m.used_model_calls+1}},o.revision);tx.put('control','company',{...c.value,origin:f.ref('control',next)},c.revision);tx.put('control','usage',{model_calls:1},0);
  });
  assertSourcePrefixReadable(f,{model:1,review:0});assert.equal(f.get('work_items','origin-maintenance:11111111-1111-4111-8111-111111111111:phase').value.status,'reserved');
});

test('synthetic frontier produce RESERVED admission preserves its exact pre-bootstrap cost prefix',{concurrency:false},async t=>{
  const f=await fixture(t,{native_id:'SYNTHETIC-accounting-owner',maintenance:{frontier_protocol:'peer-origin-input-frontier-v1',max_frontier_calls:10,used_frontier_calls:0,max_frontier_reviews:5,used_frontier_reviews:0},originFields:{current_cut_sha256:textSha('SYNTHETIC-frontier-cut')}});
  const {buildPeerInputFrontier,peerInputFrontierContext,FRONTIER_INSTRUCTION}=await import(url(path.join(peers,'input-frontier.mjs')));
  const sourceValue={SYNTHETIC:'Unqualified complete source DATA for accounting only.'},sourceText=f.canonical(sourceValue),sourceRow=f.ledger.write('SYNTHETIC.frontier-source-DATA','founder',tx=>tx.put('work_items','SYNTHETIC-frontier-source',sourceValue,0)),source_ref=f.ref('work_items',sourceRow),id='input-frontier:22222222-2222-4222-8222-222222222222';
  const connection={root:f.ledger.root,company_id:f.ledger.company_id,directory:f.ledger.directory},manifestConnection={company_id:f.ledger.company_id,root_sha256:textSha(f.ledger.root)},prepared=buildPeerInputFrontier({connection:manifestConnection,heads:[],pinned_team:{bundle_sha256:textSha('SYNTHETIC-pins')},sources:[{id:'SYNTHETIC-frontier-source',role:'source',reference:source_ref,sha256:textSha(sourceText),characters:sourceText.length,utf8_bytes:Buffer.byteLength(sourceText),required_original:false,text:sourceText}]});
  f.ledger.write('input-frontier.captured','founder',tx=>{
    const m=tx.get('control','origin').value.maintenance,stable=Object.fromEntries(Object.entries(m).filter(([key])=>!['used_model_calls','used_review_calls','used_frontier_calls','used_frontier_reviews','used_frontier_seal_reviews'].includes(key))),text=f.canonical(prepared.manifest);
    const page=tx.put('work_items',id+':manifest:0',{kind:'input_frontier_manifest_page',frontier_id:id,sequence:0,text},0);
    const source_instruction='SYNTHETIC exact Source preparation; no meaning or Native acceptance.',input={operation_id:'SYNTHETIC-frontier-capture',source_instruction},result={frontier_id:id,frontier_sha256:prepared.sha256,source_vector_sha256:prepared.manifest.source_vector_sha256,source_utf8_bytes:prepared.manifest.source_utf8_bytes,source_occurrences:1,archive_occurrences:0,unavailable_archive_occurrences:0,total_nodes:1,total_required_calls:2,total_required_reviews:1,qualified:false},commandId=id+':command:'+f.peerDigest(['capture',input]);
    const command=tx.put('commands',commandId,{kind:'input_frontier_command',frontier_id:id,type:'capture',input_sha256:f.peerDigest(input),result},0),founder=tx.get('principals','founder'),actor={host:founder.value.host,session_id:founder.value.legacy_owner.session_id,native_id:founder.value.native_id},operation='input-frontier-operation:'+f.peerDigest([connection,actor,input.operation_id]);tx.put('commands',operation,{kind:'input_frontier_operation',operation:'capture',request_sha256:f.peerDigest(input),result},0);
    tx.put('work_items',id,{kind:'input_frontier',protocol:'peer-origin-input-frontier-v1',id,origin_id:tx.get('control','origin').value.id,manifest_sha256:prepared.sha256,manifest_text_sha256:textSha(text),manifest_pages:[f.ref('work_items',page)],sidecar_sources:[],own_keys:[['work_items',id],['work_items',page.id],['commands',commandId],['commands',operation]],overrides:[],authority_sha256:f.peerDigest(stable),deadline_at_ms:Date.parse(m.expires_at),results:[],attempts:[],created_natives:[],negative_refs:[],source_instruction,capture_command_ref:f.ref('commands',command)},0);
  });
  f.ledger.write('input-frontier.admitted','founder',tx=>{
    const row=tx.get('work_items',id),state=structuredClone(row.value),o=tx.get('control','origin'),c=tx.get('control','company'),m=o.value.maintenance,node=prepared.manifest.nodes[0],stage='produce',execution=id+':invocation:33333333-3333-4333-8333-333333333333',operation_id='SYNTHETIC-frontier-admit';
    const add=(family,key)=>state.own_keys.push([family,key]),scope={connection:manifestConnection,origin_id:o.value.id,source_cut_sha256:o.value.current_cut_sha256,authority_sha256:state.authority_sha256,kind:node.kind,stage};
    const material=[{source:prepared.sources[0].id,material_sha256:f.peerDigest(sourceValue),ordinal:0}],target={protocol:'peer-input-frontier-logical-target-v1',...scope,material_count:1,material_sha256:f.peerDigest(material)},target_id='input-frontier-target:'+f.peerDigest(target);
    const targetRow=tx.put('commands',target_id,{kind:'input_frontier_logical_target',frontier_id:id,node_id:node.id,stage,target,spent:true,automatic_recovery:false},0);add('commands',target_id);
    const sourceTarget={protocol:'peer-input-frontier-logical-source-v1',...scope,source:{family:source_ref.family,id:source_ref.id},material_sha256:material[0].material_sha256},source_id='input-frontier-source:'+f.peerDigest(sourceTarget),sourceRow=tx.put('commands',source_id,{kind:'input_frontier_logical_source',frontier_id:id,target:sourceTarget,automatic_recovery:false},0);add('commands',source_id);
    const context=peerInputFrontierContext(prepared,{node_id:node.id,stage,authority:{owner:o.value.owner,maintenance:{authority_sha256:state.authority_sha256,expires_at:m.expires_at,remaining_calls:m.max_model_calls-m.used_model_calls,remaining_reviews:m.max_review_calls-m.used_review_calls},peer_policy:c.value.policy}}),contextRow=tx.put('work_items',execution+':context',{kind:'input_frontier_context',frontier_id:id,body:context.body,text:context.text,sha256:context.sha256},0);add('work_items',contextRow.id);
    const binding={protocol:'peer-input-frontier-admission-v1',kind:'input-frontier-produce',frontier_id:id,frontier_sha256:prepared.sha256,node_id:node.id,stage,logical_target_ref:f.ref('commands',targetRow),logical_source_refs:[f.ref('commands',sourceRow)],subject:context.subject,context_ref:f.ref('work_items',contextRow),context_sha256:context.sha256,deadline_at_ms:state.deadline_at_ms,owner_epoch:o.value.owner.epoch,pause_generation:m.pause_generation};
    const nextOrigin={...o.value,maintenance:{...m,used_model_calls:m.used_model_calls+1,used_frontier_calls:m.used_frontier_calls+1}},nextUsage={model_calls:1},authority_after={family:'control',id:'origin',revision:o.revision+1,sha256:f.peerDigest(nextOrigin)},global_after={family:'control',id:'usage',revision:1,sha256:f.peerDigest(nextUsage)};
    const admission=tx.put('work_items',execution+':admission',{kind:'input_frontier_admission',binding,source_support:{protocol:'peer-input-frontier-assignment-v1',bridge_sha256:textSha('SYNTHETIC-unissued-frontier-bridge'),creation_mode:'fresh-original-protected-thread',SYNTHETIC_STORAGE_PREFIX_ONLY:true},first_rpc:sourcePrefixWire(f,context.text,'peer-input-frontier-first-rpc-v1',FRONTIER_INSTRUCTION,c.value.policy),charges:{authority_before:f.ref('control',o),authority_after,global_before:null,global_after,before:{model_calls:0,review_calls:0,frontier_calls:0,frontier_reviews:0},after:{model_calls:1,review_calls:0,frontier_calls:1,frontier_reviews:0}},operation_id},0),admission_ref=f.ref('work_items',admission);add('work_items',admission.id);
    const phase=tx.put('work_items',execution+':phase',{kind:'input_frontier_phase',status:'reserved',frontier_id:id,admission_ref,native_id:null},0);add('work_items',phase.id);
    for(const family of ['slots','effects']){tx.put(family,execution,{kind:'input_frontier_execution',status:family==='slots'?'active':'reserved',scope:'*',frontier_id:id,admission_ref,termination_confirmed:false,capacity_known:true},0);add(family,execution);}
    const next=tx.put('control','origin',nextOrigin,o.revision),company=tx.put('control','company',{...c.value,origin:f.ref('control',next)},c.revision);state.overrides.push({family:'control',id:'origin',original:f.ref('control',o),current:f.ref('control',next)},{family:'control',id:'company',original:f.ref('control',c),current:f.ref('control',company)});tx.put('control','usage',nextUsage,0);add('control','usage');
    const request={operation_id,frontier_id:id,node_id:node.id,stage},command_id=id+':command:'+f.peerDigest(['admit',request]);tx.put('commands',command_id,{kind:'input_frontier_command',frontier_id:id,type:'admit',input_sha256:f.peerDigest(request),result:{admission_ref}},0);add('commands',command_id);
    const founder=tx.get('principals','founder'),actor={host:founder.value.host,session_id:founder.value.legacy_owner.session_id,native_id:founder.value.native_id},operation='input-frontier-operation:'+f.peerDigest([connection,actor,operation_id]);tx.put('commands',operation,{kind:'input_frontier_operation',operation:'admit',request_sha256:f.peerDigest(request),admission_ref,phase_id:phase.id,frontier_id:id},0);add('commands',operation);state.attempts.push({node_id:node.id,stage,admission_ref,phase_id:phase.id});tx.put('work_items',id,state,row.revision);
  });
  assertSourcePrefixReadable(f,{model:1,review:0,frontier:1});assert.equal(f.get('work_items',id).value.attempts.length,1);
});

test('synthetic RESERVED seal prefix is readable through the real cold transition and bootstrap accounting',{concurrency:false},async t=>{
  const f=await fixture(t,{native_id:'SYNTHETIC-accounting-owner',maintenance:{frontier_seal_protocol:'peer-origin-frontier-seal-purpose-v1',frontier_seal_purpose:'bounded-preparation-bootstrap',max_frontier_seal_reviews:2,used_frontier_seal_reviews:0},originFields:{current_cut_sha256:'a'.repeat(64)}});
  const {stageSyntheticSealCostPrefix}=await import(new URL('./bootstrap-seal-cost-prefix-fixture.mjs',import.meta.url));
  const {assertPeerOriginFrontierSealTransitionFrom}=await import(url(path.join(peers,'origin-frontier-seal-transition.mjs')));
  const prefix=stageSyntheticSealCostPrefix(f),before=f.snapshot();
  assert.equal(prefix.semantic_predecessor_qualified,false);assert.equal(prefix.native_qualified,false);assert.equal(prefix.authority_issued,false);
  const proof=f.ledger.read(tx=>assertPeerOriginFrontierSealTransitionFrom(tx,prefix.command_ref));
  assert.equal(proof.phase.status,'reserved');assert.deepEqual(proof.phase.reference,prefix.phase_ref);assert.equal(proof.owned_event_refs.length,1);assert.equal(proof.owned_event_refs[0].type,'origin.frontier-seal.admitted');assert.deepEqual(proof.charges,prefix.charges);assert.equal(f.snapshot(),before);
  assertSourcePrefixReadable(f,{model:1,review:1,seal:1});
  assert.equal(f.get('work_items',prefix.execution_id+':creation'),null);assert.equal(f.get('work_items',prefix.execution_id+':result'),null);assert.equal(f.get('slots',prefix.execution_id).value.status,'active');assert.equal(f.get('effects',prefix.execution_id).value.status,'reserved');assert.equal(f.get('effects',prefix.execution_id).value.termination_confirmed,false);
});
