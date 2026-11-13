// Cold SOURCE lineage only. This reader issues no capability, grant, task or
// runtime attestation. The native consumer separately verifies its actual
// current source/runtime/catalog before selecting a readonly3 owner resume.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {PeerLedger,canonical,peerDigest,FAMILIES} from './ledger.mjs';
import {BOOTSTRAP_ASSIGNMENT,BOOTSTRAP_CONTEXT,BOOTSTRAP_BASIS,bootstrapKind,bootstrapResponseContract,parseBootstrapResponse,validateBootstrapMembershipFirstRpc,validateBootstrapMembershipOwnedClosure} from './bootstrap-membership-contract.mjs';
import {assertPeerOriginPausedBootstrapAccountingFrom} from './origin-paused-bootstrap-accounting.mjs';

const PROFILE='soloco-bootstrap-membership-readonly3-v1';
const owningRead=PeerLedger.prototype.read;
const MAX_EVENTS=10000,MAX_CHANGES=50000,MAX_BYTES=64*1024*1024;
const fail=code=>{throw Object.assign(Error(code),{code});};
const need=(yes,code='BOOTSTRAP_REVIEWER_PROFILE_CHANGED')=>{if(!yes)fail(code);};
const same=(a,b)=>a!==undefined&&b!==undefined&&canonical(a)===canonical(b);
const copy=value=>JSON.parse(canonical(value));
const sha=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=(value,max=2000)=>typeof value==='string'&&value.trim()&&value.length<=max&&!value.includes('\0')&&!/[\ud800-\udfff]/u.test(value);
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
function object(value,required,optional=[]){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'BOOTSTRAP_REVIEWER_PROFILE_INPUT');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 need(required.every(key=>keys.includes(key))&&keys.every(key=>typeof key==='string'&&[...required,...optional].includes(key)&&descriptors[key].enumerable&&Object.hasOwn(descriptors[key],'value')),'BOOTSTRAP_REVIEWER_PROFILE_INPUT');return value;
}
function exactReference(value,family){
 object(value,['family','id','revision','sha256']);need((family?value.family===family:FAMILIES.includes(value.family))&&text(value.id)&&Number.isSafeInteger(value.revision)&&value.revision>0&&hash(value.sha256),'BOOTSTRAP_REVIEWER_PROFILE_REFERENCE');return value;
}
function historical(state,value,kind=null){
 const r=exactReference(value),key=canonical(r);if(state.rows.has(key)){const row=state.rows.get(key);need(!kind||row.value.kind===kind,'BOOTSTRAP_REVIEWER_PROFILE_SOURCE_CHANGED');return row;}
 const row=state.tx.getVersion(r);need(row&&row.id===r.id&&row.revision===r.revision&&row.sha256===r.sha256&&peerDigest(row.value)===r.sha256&&(!kind||row.value.kind===kind),'BOOTSTRAP_REVIEWER_PROFILE_SOURCE_CHANGED');
 state.bytes+=Buffer.byteLength(canonical(row.value));need(state.bytes<=MAX_BYTES,'BOOTSTRAP_REVIEWER_PROFILE_CAPACITY');state.rows.set(key,row);return row;
}
function current(state,family,id){
 const row=state.tx.get(family,id);need(row,'BOOTSTRAP_REVIEWER_PROFILE_SOURCE_REQUIRED');historical(state,reference(family,row));return row;
}
function currentExact(state,value,kind=null){
 const r=exactReference(value),row=historical(state,r,kind),now=current(state,r.family,r.id);need(same(reference(r.family,now),r),'BOOTSTRAP_REVIEWER_PROFILE_SOURCE_CHANGED');return row;
}
function committedEvents(state){
 let cursor=0,total=null,changes=0;
 do{
  const page=state.tx.events({after:cursor,limit:100});need(Number.isSafeInteger(page.total)&&page.total>=0&&page.total<=MAX_EVENTS&&(total===null||total===page.total)&&Array.isArray(page.items),'BOOTSTRAP_REVIEWER_PROFILE_EVENT_SOURCE');total=page.total;
  for(const event of page.items){
   need(event.seq===cursor+1&&event.seq<=total,'BOOTSTRAP_REVIEWER_PROFILE_EVENT_SOURCE');state.bytes+=Buffer.byteLength(canonical(event));need(state.bytes<=MAX_BYTES,'BOOTSTRAP_REVIEWER_PROFILE_CAPACITY');state.events.set(event.seq,event);
   for(const change of event.payload.changes){need(++changes<=MAX_CHANGES,'BOOTSTRAP_REVIEWER_PROFILE_CAPACITY');const r={family:change.family,id:change.id,revision:change.revision,sha256:change.sha256},key=canonical(exactReference(r));need(!state.producers.has(key),'BOOTSTRAP_REVIEWER_PROFILE_PRODUCER_CHANGED');state.producers.set(key,event);}
   cursor=event.seq;
  }
  need(page.complete||page.items.length>0,'BOOTSTRAP_REVIEWER_PROFILE_EVENT_SOURCE');if(page.complete){need(cursor===total,'BOOTSTRAP_REVIEWER_PROFILE_EVENT_SOURCE');break;}
 }while(cursor<total);
 state.cutoff=total;
}
function producer(state,r,type,principal=null){
 exactReference(r);const event=state.producers.get(canonical(r));need(event&&event.type===type&&(principal===null||event.principal_id===principal),'BOOTSTRAP_REVIEWER_PROFILE_PRODUCER_REQUIRED');
 const changes=event.payload.changes.filter(change=>change.family===r.family&&change.id===r.id&&change.revision===r.revision);need(changes.length===1&&changes[0].sha256===r.sha256,'BOOTSTRAP_REVIEWER_PROFILE_PRODUCER_CHANGED');return event;
}
function preceded(state,r,sequence){const event=state.producers.get(canonical(exactReference(r)));need(event&&event.seq<sequence,'BOOTSTRAP_REVIEWER_PROFILE_PRESTATE_REQUIRED');return event;}
// Exact committed prefix for historical cost proof. No caller-selected mask or
// rewritten value: every head is the last original event/version at this cut.
function accountingPrefix(state,through){
 need(Number.isSafeInteger(through)&&through>0&&through<=state.cutoff,'BOOTSTRAP_REVIEWER_PROFILE_PRESTATE_REQUIRED');
 const events=[...state.events.values()].filter(e=>e.seq<=through),heads=new Map(),created=new Map();
 need(events.length===through,'BOOTSTRAP_REVIEWER_PROFILE_EVENT_SOURCE');
 for(const event of events)for(const change of event.payload.changes){const key=canonical([change.family,change.id]);heads.set(key,{family:change.family,id:change.id,revision:change.revision,sha256:change.sha256});if(change.revision===1)created.set(key,event.seq);}
 const get=(family,id)=>{const key=canonical([family,id]),r=heads.get(key);if(!r)return null;const row=historical(state,r),sequence=created.get(key);need(sequence,'BOOTSTRAP_REVIEWER_PROFILE_PRODUCER_REQUIRED');return {...copy(row),created_seq:sequence};};
 return {sequence:through+1,get,getVersion:r=>{const event=state.producers.get(canonical(exactReference(r)));return event&&event.seq<=through?copy(historical(state,r)):null;},events:({after=0,limit=100}={})=>{need(Number.isSafeInteger(after)&&after>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=100,'BOOTSTRAP_REVIEWER_PROFILE_INPUT');const items=events.filter(e=>e.seq>after).slice(0,limit),complete=!events.some(e=>e.seq>(items.at(-1)?.seq??after));return {items:copy(items),total:through,complete,next_cursor:complete?null:String(items.at(-1).seq)};}};
}
function coverage(ranges,length){
 need(Array.isArray(ranges)&&ranges.length<=128,'BOOTSTRAP_REVIEWER_PROFILE_DELIVERY_REQUIRED');let end=0;
 for(const range of ranges){need(Array.isArray(range)&&range.length===2&&Number.isSafeInteger(range[0])&&Number.isSafeInteger(range[1])&&range[0]>=0&&range[1]>range[0]&&range[1]<=length&&range[0]<=end,'BOOTSTRAP_REVIEWER_PROFILE_DELIVERY_REQUIRED');end=Math.max(end,range[1]);}
 need(end===length,'BOOTSTRAP_REVIEWER_PROFILE_DELIVERY_REQUIRED');
}
function response(output,phase,subject,contextSha){
 return parseBootstrapResponse(output,{phase,subject,context_sha256:contextSha}).review;
}
function runtime(facts){
 const value=object(facts.original_runtime,['scope_root','state_root','scratch_root','launch','directory_pins','protocol','read_paths','native_permission_profile','creation_tools_sha256','context_binding']);
 need(value.protocol==='peer-original-protected-readonly-runtime-v1'&&hash(value.creation_tools_sha256),'BOOTSTRAP_REVIEWER_PROFILE_RUNTIME_REQUIRED');
 const binding=object(value.context_binding,['recipe_sha256','resource_sha256','frame_sha256']);need(Object.values(binding).every(hash),'BOOTSTRAP_REVIEWER_PROFILE_RUNTIME_REQUIRED');
 // Preserve and commit to the COMPLETE original assertion DATA. Its nested
 // runtime meanings are validated by the original creation source and again
 // against the actual current runtime by the native consumer, never guessed.
 return value;
}
function phaseLineage(state,enrollment,name,expectedPrincipal,expectedNative,subject=null){
 const e=enrollment.value,phase=current(state,'work_items',`membership-phase:${e.enrollment_id}:${name}`),p=phase.value;
 need(p.kind==='membership_phase'&&p.bootstrap_protocol==='peer-bootstrap-membership-phase-v1'&&p.membership_id===e.enrollment_id&&p.phase===name&&p.status==='closed'&&p.principal_id===expectedPrincipal&&p.native_id===expectedNative&&text(p.attempt_id,200),'BOOTSTRAP_REVIEWER_PROFILE_PHASE_REQUIRED');
 const admission=currentExact(state,exactReference(p.admission_ref,'work_items'),'bootstrap_membership_admission'),a=admission.value;
 need(admission.revision===1&&admission.id===`membership-admission:${p.attempt_id}`&&a.protocol==='peer-bootstrap-membership-admission-v1','BOOTSTRAP_REVIEWER_PROFILE_ADMISSION_REQUIRED');
 const b=a.binding;need(b?.protocol==='peer-bootstrap-membership-binding-v1'&&same(b.connection,state.fullConnection)&&b.enrollment_id===e.enrollment_id&&b.phase===name&&b.attempt_id===p.attempt_id&&b.kind===bootstrapKind(name)&&Number.isSafeInteger(b.epoch)&&b.epoch>0&&Number.isSafeInteger(b.deadline_at_ms)&&b.deadline_at_ms>0&&same(b.principal_ref,p.principal_ref),'BOOTSTRAP_REVIEWER_PROFILE_ADMISSION_REQUIRED');
 const originalEnrollment=historical(state,exactReference(b.enrollment_ref,'work_items'),'membership_enrollment'),oe=originalEnrollment.value;
 need(oe.status==='pending'&&oe.bootstrap_protocol==='peer-bootstrap-membership-enrollment-v1'&&oe.bootstrap_epoch===b.epoch&&oe.enrollment_id===e.enrollment_id&&oe.principal_id===e.principal_id&&oe.generation===e.generation&&oe.connection_sha256===e.connection_sha256&&oe.expires_at===e.expires_at&&Number.isSafeInteger(Date.parse(oe.expires_at))&&b.deadline_at_ms<=Date.parse(oe.expires_at),'BOOTSTRAP_REVIEWER_PROFILE_ENROLLMENT_CHANGED');
 const owner=historical(state,exactReference(oe.operator_ref,'principals')),control=historical(state,exactReference(b.control_ref,'control'));need(owner.value.kind==='founder'&&owner.value.status==='active'&&owner.value.legacy_owner?.epoch===b.epoch&&text(owner.value.native_id,300)&&text(owner.value.legacy_owner.session_id,200)&&['codex','claude'].includes(owner.value.host)&&owner.value.legacy_owner.host===owner.value.host&&same(b.owner_ref,oe.operator_ref)&&same(oe.bootstrap_authority_ref,b.control_ref)&&control.value.protocol==='peer-cos-v1'&&control.value.paused===true&&control.value.founder_principal_id===owner.id&&peerDigest(control.value)===oe.policy_sha256&&control.value.policy_generation===oe.policy_generation&&control.value.pause_generation===oe.pause_generation,'BOOTSTRAP_REVIEWER_PROFILE_OWNER_CHANGED');
 const principal=historical(state,exactReference(p.principal_ref,'principals'));need(principal.id===p.principal_id&&['cos','reviewer','specialist'].includes(principal.value.kind)&&['active','pending'].includes(principal.value.status)&&Number.isSafeInteger(p.generation)&&p.generation>0,'BOOTSTRAP_REVIEWER_PROFILE_PHASE_REQUIRED');
 if(name==='reconstruction')need(p.generation===e.generation&&(oe.base_principal?same(oe.base_principal,p.principal_ref)&&principal.value.status==='active'&&principal.value.generation+1===e.generation:principal.value.status==='pending'&&principal.value.generation===e.generation&&principal.value.enrollment_id===e.enrollment_id),'BOOTSTRAP_REVIEWER_PROFILE_PHASE_REQUIRED');else need(principal.value.generation===p.generation,'BOOTSTRAP_REVIEWER_PROFILE_PHASE_REQUIRED');
 const context=currentExact(state,exactReference(p.context_ref,'work_items'),'membership_context'),c=context.value;
 need(context.revision===1&&same(p.context_ref,b.context_ref)&&c.sha256===b.context_sha256&&typeof c.text==='string'&&sha(c.text)===c.sha256&&c.membership_id===e.enrollment_id&&c.principal_id===expectedPrincipal,'BOOTSTRAP_REVIEWER_PROFILE_CONTEXT_REQUIRED');
 validateBootstrapMembershipFirstRpc(a.preflight_commitment,c.text);
 let assignment;try{assignment=JSON.parse(c.text);}catch{fail('BOOTSTRAP_REVIEWER_PROFILE_CONTEXT_REQUIRED');}
 need(canonical(assignment)===c.text&&assignment.protocol===BOOTSTRAP_ASSIGNMENT&&same(assignment.connection,state.connection)&&assignment.enrollment_id===e.enrollment_id&&assignment.principal_id===p.principal_id&&assignment.generation===p.generation&&assignment.phase===name&&assignment.role===(name==='reconstruction'?e.role:'reviewer')&&same(assignment.response_contract,bootstrapResponseContract(name))&&assignment.source_cut?.protocol===BOOTSTRAP_CONTEXT&&assignment.source_cut.current_meaning?.protocol===BOOTSTRAP_BASIS&&assignment.source_cut_sha256===peerDigest(assignment.source_cut)&&c.source_cut_sha256===assignment.source_cut_sha256&&b.source_cut_sha256===c.source_cut_sha256&&same(assignment.source_cut.control?.reference,b.control_ref)&&same(assignment.source_cut.control?.value,control.value)&&Number.isSafeInteger(control.value.policy?.max_context_bytes)&&Buffer.byteLength(c.text)<=control.value.policy.max_context_bytes,'BOOTSTRAP_REVIEWER_PROFILE_CONTEXT_REQUIRED');
 if(Object.hasOwn(c,'body'))need(same(c.body,assignment),'BOOTSTRAP_REVIEWER_PROFILE_CONTEXT_REQUIRED');
 const stable={...oe};delete stable.used_model_calls;need(same(assignment.enrollment,stable)&&c.enrollment_sha256===peerDigest(stable)&&c.recovery_sha256===peerDigest(assignment.recovery_history),'BOOTSTRAP_REVIEWER_PROFILE_ENROLLMENT_CHANGED');
 const creation=currentExact(state,exactReference(p.creation_ref,'work_items'),'bootstrap_membership_creation'),birth=creation.value;
 object(birth,['kind','protocol','admission_ref','context_ref','facts','created_at_ms']);need(creation.revision===1&&creation.id===`${p.execution_id}:bootstrap-creation`&&birth.protocol==='peer-bootstrap-membership-original-creation-record-v1'&&same(birth.admission_ref,p.admission_ref)&&same(birth.context_ref,p.context_ref)&&Number.isSafeInteger(birth.created_at_ms)&&birth.created_at_ms>=0&&birth.created_at_ms<b.deadline_at_ms,'BOOTSTRAP_REVIEWER_PROFILE_CREATION_REQUIRED');
 const f=birth.facts;need(f?.protocol==='peer-bootstrap-membership-original-creation-v1'&&f.kind===bootstrapKind(name)&&same(f.admission_ref,p.admission_ref)&&f.context_sha256===c.sha256&&f.native_id===expectedNative&&f.thread_id===expectedNative&&/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(expectedNative)&&f.profile_id===PROFILE,'BOOTSTRAP_REVIEWER_PROFILE_CREATION_REQUIRED');const originalRuntime=runtime(f);
 const result=currentExact(state,exactReference(p.result_ref,'work_items'),name==='review'?'membership_qualification':'membership_reconstruction'),r=result.value;
 need(result.revision===1&&result.id===`membership-result:${p.attempt_id}`&&r.protocol==='peer-bootstrap-membership-result-v1'&&r.status==='returned'&&r.membership_id===e.enrollment_id&&r.principal_id===p.principal_id&&r.generation===p.generation&&r.attempt_id===p.attempt_id&&same(r.context_ref,p.context_ref)&&same(r.admission_ref,p.admission_ref)&&same(r.creation_ref,p.creation_ref)&&r.native_id===expectedNative&&r.termination_confirmed===true&&r.error===null&&r.held===null&&r.source_cut_sha256===c.source_cut_sha256&&Number.isSafeInteger(r.accepted_at_ms)&&r.accepted_at_ms>=birth.created_at_ms&&r.accepted_at_ms<b.deadline_at_ms,'BOOTSTRAP_REVIEWER_PROFILE_RESULT_REQUIRED');
 const delivery=object(r.delivery,['reads','submission']),submission=object(delivery.submission,['content','sha256']);coverage(delivery.reads,c.text.length);
 need(same(p.reads,delivery.reads)&&same(p.submission,submission)&&text(r.output,12000)&&r.output===submission.content&&submission.sha256===sha(r.output)&&r.output_sha256===submission.sha256,'BOOTSTRAP_REVIEWER_PROFILE_DELIVERY_REQUIRED');
 const review=response(r.output,name,subject,c.sha256);need(same(r.review,review),'BOOTSTRAP_REVIEWER_PROFILE_OUTPUT_REQUIRED');
 const d=r.drain;need(d?.protocol==='peer-owned-admitted-task-drain-v1'&&d.kind===bootstrapKind(name)&&same(d.admission_ref,p.admission_ref)&&d.context_sha256===c.sha256&&d.native_id===expectedNative&&d.thread_id===expectedNative&&d.terminal_status==='completed'&&d.output===r.output&&d.output_sha256===r.output_sha256&&r.closure?.termination_confirmed===true,'BOOTSTRAP_REVIEWER_PROFILE_DRAIN_REQUIRED');
 validateBootstrapMembershipOwnedClosure(r.closure,{drain:d,kind:bootstrapKind(name),admission_ref:p.admission_ref,context_sha256:c.sha256,native_id:expectedNative});
 const admitted=producer(state,p.admission_ref,'membership/admit',owner.value.legacy_owner.session_id),created=producer(state,p.creation_ref,'bootstrap-membership.native_created','source-observer:bootstrap-membership'),finished=producer(state,p.result_ref,'bootstrap-membership.completed','source-observer:bootstrap-membership');
 const accounting=assertPeerOriginPausedBootstrapAccountingFrom(accountingPrefix(state,admitted.seq),{company_id:state.connection.company_id});
 need(same(accounting.authority_company_ref,b.control_ref)&&accounting.company_authority_sha256===oe.policy_sha256,'BOOTSTRAP_REVIEWER_PROFILE_ACCOUNTING_REQUIRED');
 preceded(state,b.enrollment_ref,admitted.seq);preceded(state,b.owner_ref,admitted.seq);preceded(state,b.control_ref,admitted.seq);
 producer(state,p.context_ref,'membership/admit');need(admitted.seq<created.seq&&created.seq<finished.seq,'BOOTSTRAP_REVIEWER_PROFILE_PRODUCER_CHANGED');
 need(Array.isArray(c.contributors?.principals)&&Array.isArray(c.contributors?.natives)&&c.contributors.principals.length<=10000&&c.contributors.natives.length<=10000&&c.contributors.principals.every(value=>text(value,200))&&c.contributors.natives.every(value=>text(value,300)),'BOOTSTRAP_REVIEWER_PROFILE_CONTRIBUTORS_REQUIRED');
 return {phase,admission,binding:b,enrollment:originalEnrollment,owner,context,assignment,creation,facts:f,runtime:originalRuntime,result,review,finished};
}

/** Fixed neutral cold prerequisite. No capability, grant or native runtime
 * attestation is minted from canonical DATA; later consumers retain all their
 * actual current custody/epoch/grant/fit/runtime/catalog checks. */
function bootstrapLineageFrom(tx,ledger,binding,{activation=false,enrollment_ref=null}={}){
 object(binding,['reviewer_principal_ref','native_id']);const selected=exactReference(binding.reviewer_principal_ref,'principals');need(text(binding.native_id,300),'BOOTSTRAP_REVIEWER_PROFILE_INPUT');
 need(ledger&&!types.isProxy(ledger)&&Object.getPrototypeOf(ledger)===PeerLedger.prototype,'BOOTSTRAP_REVIEWER_PROFILE_LEDGER_REQUIRED');
 const descriptors=Object.getOwnPropertyDescriptors(ledger),root=descriptors.root?.value,companyId=descriptors.company_id?.value,directory=descriptors.directory?.value;
 need(text(root,4000)&&root.startsWith('/')&&text(companyId,300)&&directory===root+'/.company','BOOTSTRAP_REVIEWER_PROFILE_LEDGER_REQUIRED');
 const connection={company_id:companyId,root_sha256:sha(root)},fullConnection={root,company_id:companyId,directory};
  // This cold prerequisite verifies immutable ORIGINAL qualification. A later
  // pause/owner begin may change current control without erasing this history.
  // Only the actual helper/controller can qualify a CURRENT purpose or cap.
  const state={tx,connection,fullConnection,rows:new Map(),events:new Map(),producers:new Map(),bytes:0};
  const p=currentExact(state,selected),v=p.value;
  need((activation?['cos','reviewer','specialist'].includes(v.kind):v.kind==='reviewer')&&v.status==='active'&&v.native_id===binding.native_id&&Number.isSafeInteger(v.generation)&&v.generation>0&&text(v.enrollment_id,200),'BOOTSTRAP_REVIEWER_PROFILE_ACTIVE_REQUIRED');
  const enrollment=current(state,'work_items',`membership:${v.enrollment_id}`),e=enrollment.value,index=current(state,'work_items',`membership-index:${p.id}`);
  need(e.kind==='membership_enrollment'&&e.bootstrap_protocol==='peer-bootstrap-membership-enrollment-v1'&&e.status==='activated'&&e.role===v.kind&&e.enrollment_id===v.enrollment_id&&e.principal_id===p.id&&e.generation===v.generation&&e.host===v.host&&e.connection_sha256===peerDigest(connection)&&same(e.activation?.principal,selected)&&same(e.activation?.qualification,v.membership_qualification)&&index.value.kind==='membership_index'&&index.value.status==='activated'&&index.value.principal_id===p.id&&index.value.enrollment_id===e.enrollment_id&&(!activation||same(reference('work_items',enrollment),enrollment_ref)),'BOOTSTRAP_REVIEWER_PROFILE_ENROLLMENT_REQUIRED');
  committedEvents(state);const reconstruction=phaseLineage(state,enrollment,'reconstruction',p.id,v.native_id),qrow=historical(state,exactReference(e.activation.qualification,'work_items'),'membership_qualification');
  need(text(qrow.value.principal_id,200)&&text(qrow.value.native_id,300),'BOOTSTRAP_REVIEWER_PROFILE_QUALIFICATION_REQUIRED');const review=phaseLineage(state,enrollment,'review',qrow.value.principal_id,qrow.value.native_id,reference('work_items',reconstruction.result));
  need(same(e.activation.reconstruction,reference('work_items',reconstruction.result))&&same(e.activation.qualification,reference('work_items',review.result))&&review.review?.verdict==='Pass'&&review.review.blockers.length===0&&same(review.assignment.source_cut,reconstruction.assignment.source_cut)&&review.runtime.creation_tools_sha256===reconstruction.runtime.creation_tools_sha256&&review.assignment.reconstruction&&same(review.assignment.reconstruction.reference,e.activation.reconstruction)&&same(review.assignment.reconstruction.value,reconstruction.result.value)&&same(review.assignment.reconstruction.assignment.context_ref,reference('work_items',reconstruction.context))&&review.assignment.reconstruction.assignment.sha256===reconstruction.context.value.sha256&&review.assignment.reconstruction.assignment.text===reconstruction.context.value.text&&same(review.assignment.reconstruction.delivery.read_ranges,reconstruction.result.value.delivery.reads)&&review.assignment.reconstruction.delivery.submission_sha256===reconstruction.result.value.output_sha256,'BOOTSTRAP_REVIEWER_PROFILE_QUALIFICATION_REQUIRED');
  const excludedPrincipals=new Set([p.id,reconstruction.owner.id,...reconstruction.context.value.contributors.principals,...review.context.value.contributors.principals]),excludedNatives=new Set([v.native_id,reconstruction.owner.value.native_id,...reconstruction.context.value.contributors.natives,...review.context.value.contributors.natives]);
  need(!excludedPrincipals.has(review.result.value.principal_id)&&!excludedNatives.has(review.result.value.native_id),'BOOTSTRAP_REVIEWER_PROFILE_INDEPENDENCE');
  const activated=producer(state,selected,'membership/activate',reconstruction.owner.value.legacy_owner.session_id);need(activated.seq>review.finished.seq&&review.finished.seq>reconstruction.finished.seq&&state.producers.get(canonical(reference('work_items',enrollment)))?.seq===activated.seq,'BOOTSTRAP_REVIEWER_PROFILE_PRODUCER_CHANGED');
  need(Object.getOwnPropertyDescriptor(ledger,'root')?.value===root&&Object.getOwnPropertyDescriptor(ledger,'company_id')?.value===companyId&&Object.getOwnPropertyDescriptor(ledger,'directory')?.value===directory,'BOOTSTRAP_REVIEWER_PROFILE_LEDGER_CHANGED');
  const output={protocol:'peer-original-bootstrap-reviewer-profile-v1',reviewer_principal_ref:copy(selected),native_id:v.native_id,profile_id:PROFILE,tool_inventory_sha256:reconstruction.runtime.creation_tools_sha256,enrollment_ref:reference('work_items',enrollment),reconstruction_ref:reference('work_items',reconstruction.result),creation_ref:reference('work_items',reconstruction.creation),independent_qualification_ref:reference('work_items',review.result),qualification_native_id:review.result.value.native_id,source_runtime_commitment:peerDigest(reconstruction.runtime),creation_fact_sha256:peerDigest(reconstruction.facts)};
  need(Buffer.byteLength(canonical(output))<=8192,'BOOTSTRAP_REVIEWER_PROFILE_CAPACITY');const final=tx.getVersion(selected);need(final&&same(reference('principals',final),selected)&&same(final.value,p.value),'BOOTSTRAP_REVIEWER_PROFILE_SOURCE_CHANGED');return copy(output);
}

export function assertOriginalPeerBootstrapReviewerProfile(ledger,binding){
 object(binding,['reviewer_principal_ref','native_id']);exactReference(binding.reviewer_principal_ref,'principals');need(text(binding.native_id,300),'BOOTSTRAP_REVIEWER_PROFILE_INPUT');
 need(ledger&&!types.isProxy(ledger)&&Object.getPrototypeOf(ledger)===PeerLedger.prototype,'BOOTSTRAP_REVIEWER_PROFILE_LEDGER_REQUIRED');
 return Reflect.apply(owningRead,ledger,[tx=>bootstrapLineageFrom(tx,ledger,binding)]);
}

// Same owning P1, original completed lineage only. This DATA helper does not
// issue a runtime capability or claim actual Native acceptance for any role.
export function assertOriginalPeerBootstrapActivationFrom(tx,options){
 const a=object(options,['ledger','enrollment_ref','principal_ref']),principal=exactReference(a.principal_ref,'principals'),enrollment=exactReference(a.enrollment_ref,'work_items');
 need(a.ledger&&!types.isProxy(a.ledger)&&Object.getPrototypeOf(a.ledger)===PeerLedger.prototype,'BOOTSTRAP_REVIEWER_PROFILE_LEDGER_REQUIRED');
 const row=tx.get('principals',principal.id);need(row&&same(reference('principals',row),principal),'BOOTSTRAP_REVIEWER_PROFILE_SOURCE_CHANGED');
 const lineage=bootstrapLineageFrom(tx,a.ledger,{reviewer_principal_ref:principal,native_id:row.value.native_id},{activation:true,enrollment_ref:enrollment});
 return {...lineage,protocol:'peer-original-bootstrap-activation-lineage-v1',principal_ref:copy(principal),authority_issued:false,native_qualified:false};
}
