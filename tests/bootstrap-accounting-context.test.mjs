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

const peers=fileURLToPath(new URL('../plugins/soloco/runtime/peers/',import.meta.url));
const url=file=>pathToFileURL(file).href;
const code=value=>error=>error?.code===value;
const held=error=>typeof error?.code==='string';

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

async function fixture(t,{purpose={},maintenance={},policy={}}={}){
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
  const actor={host:'codex',session_id:'SYNTHETIC-accounting-owner',native_id:'founder-native'},owner={host:actor.host,session_id:actor.session_id,epoch:7};
  f=peerFixture({control:{paused:true,policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:100,...policy}},principals:{founder:{legacy_owner:owner},scheduler:{status:'held'},publisher:{status:'held'}}});
  const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
  f.ledger.write('origin.quarantined','founder',tx=>{
    const company=tx.get('control','company'),founder=tx.get('principals','founder'),origin=tx.put('control','origin',{protocol:'peer-origin-quarantine-v1',id:'SYNTHETIC-accounting-origin',status:'quarantined',company_id:f.ledger.company_id,owner,maintenance:{protocol:'peer-origin-maintenance-authority-v1',status:'active',pause_generation:1,expires_at:new Date(clock+3600000).toISOString(),max_model_calls:10,max_review_calls:5,used_model_calls:0,used_review_calls:0,units:'new-origin-maintenance-model-invocation',old_allowance_conversion:'none',...maintenance,paused_bootstrap:{protocol:'peer-origin-paused-bootstrap-purpose-v1',purpose:'membership-qualification-only',max_enrollments:2,max_model_calls:4,max_review_calls:2,used_enrollments:0,used_model_calls:0,used_review_calls:0,...purpose}}},0);
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
