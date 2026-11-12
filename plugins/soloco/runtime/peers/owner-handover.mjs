// Trusted host composition only. `actor` must be captured from the actual
// startup/normal-prompt binding by the fixed MCP host, never copied from tool
// input. This factory is not an authentication tool or a native QA producer.
import {types} from 'node:util';
import {PeerLedger,FAMILIES,canonical,peerDigest} from './ledger.mjs';
import * as model from './model.mjs';
import * as deployment from './context-component-deployment.mjs';
import {parseReviewOutput} from './review-selection.mjs';
import {inspectPeerPinnedTeamFrom} from './legacy-origin.mjs';

const PROTOCOL='peer-owner-handover-v1',CONTEXT='peer-owner-maintenance-assignment-v1';
const MAX_ROWS=10000,MAX_SUBJECT=65536,MAX_RECONSTRUCTION=8192,READ_UNITS=1024;
const lifecycles=new WeakMap(),maintenance=new WeakMap();
class OwnerError extends Error{}
const fail=code=>{throw Object.assign(new OwnerError(code),{code});};
const need=(yes,code)=>{if(!yes)fail(code);};
const copy=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const key=(family,id)=>canonical([family,id]);
const bytes=value=>Buffer.byteLength(canonical(value));
const text=(value,max=200)=>typeof value==='string'&&value.trim()&&value.length<=max&&!value.includes('\0')&&Buffer.from(value).toString('utf8')===value;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function data(value,required,optional=[]){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'OWNER_INPUT');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 need(required.every(k=>keys.includes(k))&&keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')),'OWNER_INPUT');
 return copy(value);
}
function providerFailures(raw){const failures=new Set(),provider={...raw};for(const name of ['get','getVersion','list','resolveLegacy'])if(typeof raw[name]==='function')provider[name]=(...args)=>{try{return raw[name](...args);}catch(error){failures.add(error);throw error;}};return {provider,failures};}
function all(tx,family){
 const out=[];let cursor;
 for(;;){const page=tx.list(family,{limit:16,...(cursor?{cursor}:{})});out.push(...page.items);need(out.length<=MAX_ROWS,'OWNER_SUBJECT_CAPACITY');if(page.complete)return out;need(page.next_cursor&&page.next_cursor!==cursor,'OWNER_SUBJECT_INCOMPLETE');cursor=page.next_cursor;}
}
function company(tx){const c=tx.get('control','company');need(c?.value.protocol==='peer-cos-v1','OWNER_COMPANY_REQUIRED');return c;}
function principal(tx,c){const p=tx.get('principals',c.value.founder_principal_id),v=p?.value,o=v?.legacy_owner;need(v?.kind==='founder'&&o&&['codex','claude'].includes(o.host)&&v.host===o.host&&text(o.session_id)&&text(v.native_id,300)&&Number.isSafeInteger(o.epoch)&&o.epoch>0&&Number.isSafeInteger(v.generation)&&v.generation>0,'OWNER_CANONICAL_REQUIRED');return p;}
function bound(record){
 for(const k of ['root','company_id','directory'])need(Object.getOwnPropertyDescriptor(record.ledger,k)?.value===record.connection[k],'OWNER_CONNECTION_CHANGED');
}
function actorOwns(record,p,epoch,{pending=false}={}){
 const o=p.value.legacy_owner,a=record.actor;
 need((p.value.status==='active'||pending&&p.value.status==='pending')&&o.host===a.host&&o.session_id===a.session_id&&p.value.native_id===a.native_id&&o.epoch===epoch,'OWNER_CHANGED');
}
function exact(tx,r){const row=tx.getVersion(r);need(row&&row.sha256===r.sha256&&peerDigest(row.value)===r.sha256,'OWNER_SOURCE_CHANGED');return row;}
function handover(tx,c){const id=c.value.owner_handover?.id,h=id&&tx.get('work_items',id);need(h?.value.protocol===PROTOCOL,'OWNER_HANDOVER_REQUIRED');return h;}
function fresh(h){need(Number.isSafeInteger(h.value.expires_at_ms)&&h.value.expires_at_ms>Date.now(),'OWNER_HANDOVER_EXPIRED');}
function reviewGrant(tx,id,generation,reviewer){
 const g=tx.get('grants',id),v=g?.value,c=company(tx),p=tx.get('principals',reviewer);
 need(p?.value.status==='active'&&p.value.kind==='reviewer'&&p.value.membership_qualification&&text(p.value.native_id,300),'OWNER_REVIEWER_REQUIRED');
 need(v?.status==='active'&&v.principal_id===reviewer&&v.generation===generation&&v.policy_generation===c.value.policy_generation&&v.scope==='*'&&v.actions?.some(a=>a==='*'||a==='owner/handover-review')&&Date.parse(v.expires_at)>Date.now(),'OWNER_REVIEW_GRANT_REQUIRED');
 const qualification=exact(tx,p.value.membership_qualification);
 const e=tx.get('work_items','membership:'+p.value.enrollment_id),index=tx.get('work_items','membership-index:'+p.id),q=qualification.value;
 need(e?.value.kind==='membership_enrollment'&&e.value.status==='activated'&&e.value.principal_id===p.id&&e.value.enrollment_id===p.value.enrollment_id&&e.value.generation===p.value.generation&&e.value.role===p.value.kind&&e.value.host===p.value.host&&same(e.value.activation?.principal,ref('principals',p))&&same(e.value.activation?.qualification,p.value.membership_qualification)&&index?.value.status==='activated'&&index.value.principal_id===p.id&&index.value.enrollment_id===p.value.enrollment_id,'OWNER_REVIEWER_REQUIRED');
 const reconstruction=exact(tx,e.value.activation.reconstruction).value;
 need(e.value.connection_sha256===peerDigest({company_id:tx.connection.company_id,root_sha256:model.digest(tx.connection.root)})&&reconstruction.kind==='membership_reconstruction'&&reconstruction.status==='returned'&&reconstruction.termination_confirmed===true&&reconstruction.membership_id===p.value.enrollment_id&&reconstruction.principal_id===p.id&&reconstruction.generation===p.value.generation&&reconstruction.native_id===p.value.native_id&&q.kind==='membership_qualification'&&q.status==='returned'&&q.termination_confirmed===true&&q.membership_id===p.value.enrollment_id&&q.review?.verdict==='Pass'&&same(q.review.subject,e.value.activation.reconstruction)&&q.principal_id!==p.id&&q.native_id!==p.value.native_id,'OWNER_REVIEWER_REQUIRED');
 return {p,g};
}
function usage(tx,id){const r=tx.get('control',id),used=r?.value.model_calls??0;need(Number.isSafeInteger(used)&&used>=0,'OWNER_REVIEW_BUDGET');return {r,used};}
function independent(tx,owner,reviewer,incomingNative){const interested=model.membershipPrincipalAliases(tx,owner.id),reviewing=model.membershipPrincipalAliases(tx,reviewer.id),excluded=new Set([...interested.natives,incomingNative]);need(owner.id!==reviewer.id&&reviewing.natives.every(native=>!excluded.has(native)),'OWNER_REVIEW_INDEPENDENCE');}
function reviewCapacity(tx,c,p,g){
 const global=usage(tx,'usage'),personal=usage(tx,'usage:'+p.id),used=g.value.used_model_calls??0;
 need(Number.isSafeInteger(used)&&used>=0&&Number.isSafeInteger(g.value.max_model_calls)&&used<g.value.max_model_calls&&global.used<c.value.policy.max_model_calls&&personal.used<(c.value.policy.principal_model_calls??c.value.policy.max_model_calls),'OWNER_REVIEW_BUDGET');
 const occupied=all(tx,'slots').filter(r=>['active','unknown'].includes(r.value.status));
 need(occupied.length<c.value.policy.worker_cap,'OWNER_REVIEW_CAPACITY');return {global,personal,used};
}
function support(){
 // Fixed original deployment must explicitly implement the NEW owner form.
 // A request flag or a matching JSON support record is never consulted.
 need(typeof deployment.inspectOriginalOwnerMaintenanceSupport==='function','OWNER_REVIEW_SOURCE_UNAVAILABLE');
 const value=deployment.inspectOriginalOwnerMaintenanceSupport();
 need(value?.protocol===CONTEXT&&sha(value.bridge_sha256),'OWNER_REVIEW_SOURCE_UNAVAILABLE');return copy(value);
}
function snapshot(tx,record,incoming){
 const current=[],historical=[],queue=[],seen=new Set();let total=0;
 const add=(family,row,target)=>{
  const r=ref(family,row),k=canonical(r);if(seen.has(k))return;seen.add(k);need(seen.size<=MAX_ROWS,'OWNER_SUBJECT_CAPACITY');
  const item={...r,value:copy(row.value)};
  if(row.value.source?.kind==='legacy'){need(typeof tx.resolveLegacy==='function','OWNER_LEGACY_SOURCE_REQUIRED');item.legacy_value=tx.resolveLegacy({sha256:row.value.source.sha256});need(item.legacy_value!==undefined,'OWNER_LEGACY_SOURCE_REQUIRED');}
  total+=bytes(item);need(total<=MAX_SUBJECT,'OWNER_SUBJECT_CAPACITY');target.push(item);queue.push(item.value);if(item.legacy_value!==undefined)queue.push(item.legacy_value);
 };
 for(const family of FAMILIES)for(const row of all(tx,family))add(family,row,current);
 const walk=value=>{
  if(!value||typeof value!=='object')return;
  if(!Array.isArray(value)&&FAMILIES.includes(value.family)&&text(value.id,2000)&&Number.isSafeInteger(value.revision)&&value.revision>0&&sha(value.sha256)){
   const r={family:value.family,id:value.id,revision:value.revision,sha256:value.sha256};if(!seen.has(canonical(r)))add(r.family,exact(tx,r),historical);
  }
  for(const child of Object.values(value))walk(child);
 };
 for(let i=0;i<queue.length;i++)walk(queue[i]);
 const body={protocol:'peer-owner-subject-v1',company_id:record.connection.company_id,root_sha256:model.digest(record.connection.root),incoming,current,historical};
 need(bytes(body)<=MAX_SUBJECT,'OWNER_SUBJECT_CAPACITY');return {body,text:canonical(body),sha256:peerDigest(body),heads:current.map(({value,legacy_value,...r})=>r)};
}
function currentSubject(tx,h){
 const v=h.value,allowed=new Set(v.own_keys.map(([f,id])=>key(f,id))),heads=[];
 need(same(inspectPeerPinnedTeamFrom(tx,{company_id:v.company_id}),v.pinned_team),'OWNER_PINNED_TEAM_CHANGED');
 for(const family of FAMILIES)for(const row of all(tx,family)){
  if(allowed.has(key(family,row.id)))continue;
  const override=v.expected_overrides.find(o=>o.family===family&&o.id===row.id);
  if(override){need(same(ref(family,row),override.current),'OWNER_SUBJECT_CHANGED');if(override.original)heads.push(override.original);}
  else heads.push(ref(family,row));
 }
 need(same(heads,v.base_heads),'OWNER_SUBJECT_CHANGED');
 const s=exact(tx,v.subject_ref);need(s.value.sha256===v.subject_sha256&&peerDigest(s.value.body)===v.subject_sha256&&canonical(s.value.body)===s.value.text,'OWNER_SOURCE_CHANGED');return s;
}
function complete(ranges,length){let end=0;for(const r of [...ranges].sort((a,b)=>a.offset-b.offset)){if(r.offset>end)return false;end=Math.max(end,r.offset+r.length);}return end===length;}
function merge(ranges,part){const result=[];for(const r of [...ranges,{offset:part.offset,length:part.length}].sort((a,b)=>a.offset-b.offset)){const last=result.at(-1);if(last&&r.offset<=last.offset+last.length)last.length=Math.max(last.offset+last.length,r.offset+r.length)-last.offset;else result.push({...r});}need(result.length<=128,'OWNER_READ_CAPACITY');return result;}
function range(textValue,offset,length){
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>0&&length<=READ_UNITS&&offset+length<=textValue.length,'OWNER_READ_RANGE');
 for(const n of [offset,offset+length])need(!(n>0&&n<textValue.length&&/[\uD800-\uDBFF]/.test(textValue[n-1])&&/[\uDC00-\uDFFF]/.test(textValue[n])),'OWNER_READ_RANGE');
 return {offset,length,text:textValue.slice(offset,offset+length)};
}
// Read-first planning: every immutable/provider read precedes the first P1 put.
// The public write seal also fences unknown rows appended by a late callback.
function write(record,action,input,build){
 bound(record);let expected,deadline=Date.now()+120000;
 return record.ledger.guardedWrite('owner/'+action,record.actor.session_id,raw=>{
  const latest=new Map(),changes=[],events=[],reads=new Map(),checks=[],snapshot=company(raw);
  let totalRows=0;for(const family of FAMILIES)for(const row of all(raw,family)){need(++totalRows<=MAX_ROWS,'OWNER_SUBJECT_CAPACITY');reads.set(key(family,row.id),{family,id:row.id,row});}
  const tx={...raw,connection:record.connection,get(f,id){const k=key(f,id);if(latest.has(k))return copy(latest.get(k));if(!reads.has(k))reads.set(k,{family:f,id,row:raw.get(f,id)});return copy(reads.get(k).row);},
   put(f,id,value){const old=this.get(f,id),normalized=copy(value),row={id,revision:(old?.revision??0)+1,sha256:peerDigest(normalized),created_seq:old?.created_seq??raw.sequence,value:normalized};changes.push({family:f,row,expected:old?.revision??0});latest.set(key(f,id),row);return copy(row);},finalCheck(check){checks.push(check);},event(type,value){events.push({type,value:copy(value)});}};
  const result=build(tx,limit=>{deadline=Math.min(deadline,limit);});
  // getVersion is an owning pre-write snapshot capability. A real late put,
  // including one caught by a provider hook, poisons this probe and rolls back.
  exact(raw,ref('control',snapshot));
  expected=[...reads.values()].map(r=>({...r,row:latest.get(key(r.family,r.id))??r.row}));
  for(const c of changes){const row=raw.put(c.family,c.row.id,c.row.value,c.expected);need(row.revision===c.row.revision&&row.sha256===c.row.sha256,'OWNER_PLAN_CHANGED');}
  for(const e of events)raw.event(e.type,e.value);
  need(typeof raw.sealWrites==='function','OWNER_COMMIT_CAPABILITY_REQUIRED');raw.sealWrites();
  // P1 forbids collection reads after modifying puts. Namespace completeness
  // was checked before the snapshot probe; P1 poisons any reentrant put during
  // each flush, and the public seal fences all subsequent new/unknown rows.
  // Recheck every dependency after the public seal, so even a caught late
  // attempted mutation cannot be normalized into successful owner authority.
  for(const r of expected)need(same(raw.get(r.family,r.id),r.row),'OWNER_CHANGED');for(const check of checks)check(raw);
  return copy(result);
 },terminal=>{bound(record);for(const r of expected)need(same(terminal.get(r.family,r.id),r.row),'OWNER_CHANGED');return deadline;});
}
function current(record,tx,epoch,{pending=false}={}){bound(record);const c=company(tx),p=principal(tx,c);actorOwns(record,p,epoch,{pending});return {c,p};}
function command(record,tx,action,input,result,h=null){
 const id=peerDigest(['peer-owner-command-v1',record.connection,record.actor,action,input.operation_id]);
 const prior=tx.get('commands',id),request_sha256=peerDigest(input);if(prior){need(prior.value.request_sha256===request_sha256,'OWNER_REPLAY_MISMATCH');return {prior:prior.value.result,id};}
 if(result!==undefined)tx.put('commands',id,{kind:'owner_command',action,principal_id:record.actor.session_id,request_sha256,result:copy(result),...(h?{owner_handover_id:h.id}:{})});return {id};
}
function own(h,family,id){if(!h.own_keys.some(([f,k])=>f===family&&k===id))h.own_keys.push([family,id]);}
function override(h,family,before,after){
 let entry=h.expected_overrides.find(o=>o.family===family&&o.id===after.id);
 if(!entry){entry={family,id:after.id,original:before?ref(family,before):null,current:ref(family,after)};h.expected_overrides.push(entry);}
 else {need(same(entry.current,before?ref(family,before):null),'OWNER_SUBJECT_CHANGED');entry.current=ref(family,after);}
}

export function createPeerOwnerLifecycle({ledger,actor}){
 need(Object.getPrototypeOf(ledger)===PeerLedger.prototype&&typeof ledger.guardedWrite==='function','OWNER_DEPENDENCY');
 const a=data(actor,['host','session_id','native_id']);need(['codex','claude'].includes(a.host)&&text(a.session_id)&&text(a.native_id,300),'OWNER_HOST_BINDING_REQUIRED');
 const record={ledger,actor:Object.freeze(a),connection:{root:ledger.root,company_id:ledger.company_id,directory:ledger.directory},caps:new Map()};
 const api={
  pause(args){const input=data(args,['operation_id','epoch','source_instruction']);need(text(input.operation_id,160)&&text(input.source_instruction,4000),'OWNER_INPUT');
   return write(record,'pause',input,tx=>{const {c,p}=current(record,tx,input.epoch),prior=command(record,tx,'pause',input);if(prior.prior)return prior.prior;const h=c.value.owner_handover?handover(tx,c):null;if(h?.value.status==='activated')currentSubject(tx,h);const row=tx.put('control',c.id,{...c.value,paused:true,pause_generation:c.value.pause_generation+1});const result={paused:true,epoch:p.value.legacy_owner.epoch,control:ref('control',row),physical_closure:'UNKNOWN'};const cmd=command(record,tx,'pause',input,result,h);if(h?.value.status==='activated'){const v=copy(h.value);override(v,'control',c,row);own(v,'commands',cmd.id);tx.put('work_items',h.id,v);}tx.event('owner.paused',{source_instruction:input.source_instruction,owner:record.actor});return result;});},
  resume(args){const input=data(args,['operation_id','epoch','source_instruction']);need(text(input.operation_id,160)&&text(input.source_instruction,4000),'OWNER_INPUT');
   return write(record,'resume',input,tx=>{const {c}=current(record,tx,input.epoch),prior=command(record,tx,'resume',input);if(prior.prior)return prior.prior;
    need(typeof model.assertPeerLegacyOriginReady==='function','OWNER_RESUME_CAPABILITY_REQUIRED');model.assertPeerLegacyOriginReady(tx);tx.finalCheck(provider=>model.assertPeerLegacyOriginReady(provider));
    const h=c.value.owner_handover?handover(tx,c):null;if(h&&h.value.status!=='resumed'){need(h.value.status==='activated','OWNER_ACCEPTANCE_REQUIRED');fresh(h);currentSubject(tx,h);}
    const row=tx.put('control',c.id,{...c.value,paused:false,pause_generation:c.value.pause_generation+1});const result={paused:false,epoch:input.epoch,control:ref('control',row)};const cmd=command(record,tx,'resume',input,result,h);if(h&&h.value.status!=='resumed'){const v=copy(h.value);override(v,'control',c,row);v.status='resumed';own(v,'commands',cmd.id);tx.put('work_items',h.id,v);}tx.event('owner.resumed',{source_instruction:input.source_instruction,owner:record.actor});return result;});},
  begin(args){const input=data(args,['operation_id','epoch','source_instruction','expires_at','reviewer_principal_id','review_grant_id','review_grant_generation'],['max_review_calls']);
   need(text(input.operation_id,160)&&text(input.source_instruction,4000),'OWNER_INPUT');
   return write(record,'handover.begin',input,(tx,limit)=>{
    const c=company(tx),p=principal(tx,c),old=p.value.legacy_owner;
    if(p.value.status==='pending'){actorOwns(record,p,old.epoch,{pending:true});const h=handover(tx,c);fresh(h);currentSubject(tx,h);need(h.value.begin_operation_id===input.operation_id&&h.value.previous_owner.epoch===input.epoch,'OWNER_CHANGED');const prior=command(record,tx,'handover.begin',input);need(prior.prior,'OWNER_REPLAY_MISMATCH');limit(h.value.expires_at_ms);return prior.prior;}
    need(p.value.status==='active'&&old.epoch===input.epoch&&c.value.paused===true,'OWNER_SAFE_BOUNDARY_REQUIRED');
    need(old.host!==a.host||old.session_id!==a.session_id,'OWNER_DISTINCT_INCOMING_REQUIRED');need(p.value.native_id!==a.native_id,'OWNER_DISTINCT_INCOMING_REQUIRED');
    need(!c.value.owner_handover||handover(tx,c).value.status==='resumed','OWNER_HANDOVER_PENDING');
    need(!all(tx,'slots').some(r=>r.value.status==='active'),'OWNER_SAFE_BOUNDARY_REQUIRED');
    const expires=Date.parse(input.expires_at),{p:reviewer,g}=reviewGrant(tx,input.review_grant_id,input.review_grant_generation,input.reviewer_principal_id);reviewCapacity(tx,c,reviewer,g);
    independent(tx,p,reviewer,a.native_id);
    const max=input.max_review_calls??1;need(Number.isSafeInteger(max)&&max>0&&max<=g.value.max_model_calls-(g.value.used_model_calls??0),'OWNER_REVIEW_BUDGET');
    need(Number.isSafeInteger(expires)&&expires>Date.now()&&expires<=Date.parse(g.value.expires_at)&&expires<=Date.now()+7*86400000,'OWNER_HANDOVER_EXPIRED');limit(expires);
    const native=support(),pinned=inspectPeerPinnedTeamFrom(tx,{company_id:record.connection.company_id}),subject=snapshot(tx,record,a),id='owner-handover:'+peerDigest([record.connection,a,input.operation_id]),subjectId=id+':subject';
    // Reserve the complete reconstruction envelope before revoking the old
    // owner; no preview/hash-only packet can pass a too-large subject.
    need(bytes({protocol:CONTEXT,subject:subject.body,reconstruction:'x'.repeat(MAX_RECONSTRUCTION),prior_attempts:[],authority:{source:native}})+4096<=Math.min(MAX_SUBJECT,c.value.policy.max_context_bytes),'OWNER_QA_CONTEXT_CAPACITY');
    const epoch=old.epoch+1,generation=p.value.generation+1;need(Number.isSafeInteger(epoch)&&Number.isSafeInteger(generation),'OWNER_GENERATION_CAPACITY');
    const revoked=tx.put('principals',p.id,{...p.value,status:'revoked',generation,revoked_for:id});
    const incoming=tx.put('principals',p.id,{...p.value,status:'pending',generation,native_id:a.native_id,host:a.host,legacy_owner:{host:a.host,session_id:a.session_id,epoch},membership_previous:ref('principals',revoked),owner_handover:id});
    const controlled=tx.put('control',c.id,{...c.value,paused:true,pause_generation:c.value.pause_generation+1,owner_handover:{id,epoch}});
    const source=tx.put('work_items',subjectId,{kind:'owner_handover_subject',body:subject.body,text:subject.text,sha256:subject.sha256});
    const h={protocol:PROTOCOL,status:'pending',company_id:record.connection.company_id,pinned_team:pinned,founder_id:p.id,begin_operation_id:input.operation_id,previous_owner:copy(old),incoming:a,epoch,expires_at_ms:expires,
     expected_overrides:[{family:'control',id:c.id,original:ref('control',c),current:ref('control',controlled)},{family:'principals',id:p.id,original:ref('principals',p),current:ref('principals',incoming)}],base_heads:subject.heads,
     subject_ref:ref('work_items',source),subject_sha256:subject.sha256,native_source:native,reviewer:ref('principals',reviewer),review_grant:ref('grants',g),max_review_calls:max,used_review_calls:0,
     reads:[],reconstruction_ref:null,reconstruction_history:[],review_history:[],own_keys:[['work_items',id],['work_items',subjectId]]};
    const result={handover_id:id,status:'pending',epoch,paused:true,subject_sha256:subject.sha256};const cmd=command(record,tx,'handover.begin',input,result,{id});own(h,'commands',cmd.id);tx.put('work_items',id,h);
    tx.event('owner.outgoing_revoked',{previous:ref('principals',p),revoked:ref('principals',revoked),incoming:ref('principals',incoming),source_instruction:input.source_instruction});return result;
   });},
  inspect(args){const input=data(args,['epoch']);bound(record);return ledger.read(raw=>{const {provider:tx,failures}=providerFailures(raw),{c}=current(record,tx,input.epoch,{pending:true}),h=handover(tx,c);let held=null;try{fresh(h);currentSubject(tx,h);}catch(error){if(failures.has(error)||!((error instanceof OwnerError&&['OWNER_HANDOVER_EXPIRED','OWNER_SUBJECT_CHANGED','OWNER_SOURCE_CHANGED','OWNER_PINNED_TEAM_CHANGED'].includes(error.code))||['PEER_PINNED_TEAM_REQUIRED','PEER_PINNED_TEAM_CHANGED','LEGACY_PINNED_TEAM_REQUIRED','LEGACY_PINNED_TEAM_CHANGED'].includes(error.code)))throw error;held=error.code;}const s=exact(tx,h.value.subject_ref);return {protocol:PROTOCOL,handover_id:h.id,status:h.value.status,epoch:h.value.epoch,paused:c.value.paused,held,subject_sha256:h.value.subject_sha256,total_characters:s.value.text.length,reconstruction_ref:h.value.reconstruction_ref,review_history:h.value.review_history,expires_at_ms:h.value.expires_at_ms,used_review_calls:h.value.used_review_calls,max_review_calls:h.value.max_review_calls,physical_closure:'UNKNOWN'};});},
  read(args){const input=data(args,['operation_id','epoch','sha256','offset','length']);need(text(input.operation_id,160),'OWNER_INPUT');return write(record,'handover.read',input,(tx,limit)=>{const {c}=current(record,tx,input.epoch,{pending:true}),h=handover(tx,c);need(!['activated','resumed'].includes(h.value.status),'OWNER_HANDOVER_CLOSED');fresh(h);limit(h.value.expires_at_ms);const s=currentSubject(tx,h);need(input.sha256===s.value.sha256,'OWNER_SOURCE_CHANGED');const part=range(s.value.text,input.offset,input.length),prior=command(record,tx,'handover.read',input);if(prior.prior)return prior.prior;
    const result={handover_id:h.id,sha256:input.sha256,...part,next_offset:part.offset+part.length,complete:part.offset+part.length===s.value.text.length};need(bytes(result)<16000,'OWNER_READ_CAPACITY');const v=copy(h.value);v.reads=merge(v.reads,part);const cmd=command(record,tx,'handover.read',input,result,h);own(v,'commands',cmd.id);tx.put('work_items',h.id,v);return result;});},
  submit(args){const input=data(args,['operation_id','epoch','subject_sha256','content']);need(text(input.operation_id,160),'OWNER_INPUT');need(text(input.content,MAX_RECONSTRUCTION)&&bytes(input.content)<=MAX_RECONSTRUCTION,'OWNER_RECONSTRUCTION_CAPACITY');return write(record,'handover.submit',input,(tx,limit)=>{const {c}=current(record,tx,input.epoch,{pending:true}),h=handover(tx,c);need(!['activated','resumed'].includes(h.value.status),'OWNER_HANDOVER_CLOSED');fresh(h);limit(h.value.expires_at_ms);const s=currentSubject(tx,h);need(input.subject_sha256===s.value.sha256&&complete(h.value.reads,s.value.text.length),'OWNER_DELIVERY_INCOMPLETE');const prior=command(record,tx,'handover.submit',input);if(prior.prior)return prior.prior;
    need(!h.value.review_history.some(r=>['reserved','running','unknown'].includes(tx.get('work_items',r.phase_id)?.value.status)),'OWNER_REVIEW_UNCLOSED');
    if(h.value.reconstruction_ref){const old=exact(tx,h.value.reconstruction_ref);need(old.value.content_sha256!==model.digest(input.content),'OWNER_RECONSTRUCTION_UNCHANGED');}
    const id=h.id+':reconstruction:'+peerDigest(input.operation_id),r=tx.put('work_items',id,{kind:'owner_handover_reconstruction',owner_handover_id:h.id,subject_sha256:s.value.sha256,incoming:a,epoch:input.epoch,content:input.content,content_sha256:model.digest(input.content),delivered_ranges:copy(h.value.reads)}),v=copy(h.value);
    if(v.reconstruction_ref)v.reconstruction_history.push(v.reconstruction_ref);v.reconstruction_ref=ref('work_items',r);v.status='reconstructed';own(v,'work_items',id);const result={handover_id:h.id,status:v.status,reconstruction_ref:v.reconstruction_ref};const cmd=command(record,tx,'handover.submit',input,result,h);own(v,'commands',cmd.id);tx.put('work_items',h.id,v);return result;});},
  activate(args){const input=data(args,['operation_id','epoch','review_ref','source_instruction']);need(text(input.operation_id,160)&&text(input.source_instruction,4000),'OWNER_INPUT');return write(record,'handover.activate',input,(tx,limit)=>{const {c,p}=current(record,tx,input.epoch,{pending:true}),h=handover(tx,c);fresh(h);limit(h.value.expires_at_ms);currentSubject(tx,h);const prior=command(record,tx,'handover.activate',input);if(prior.prior)return prior.prior;
    const entry=h.value.review_history.at(-1);need(entry?.result_ref&&same(entry.result_ref,input.review_ref),'OWNER_ACCEPTANCE_REQUIRED');const r=exact(tx,entry.result_ref);
    need(r.value.status==='accepted'&&same(r.value.reconstruction_ref,h.value.reconstruction_ref)&&r.value.subject_sha256===h.value.subject_sha256&&r.value.review?.verdict==='Pass'&&r.value.review.permitted_action==='activate_owner_handover','OWNER_ACCEPTANCE_REQUIRED');
    for(const previous of h.value.review_history){if(!previous.result_ref)fail('OWNER_REVIEW_UNCLOSED');const q=exact(tx,previous.result_ref);if(same(q.value.reconstruction_ref,h.value.reconstruction_ref))need(q.value.status==='accepted','OWNER_NEGATIVE_REVIEW');}
    const v=copy(h.value),active=tx.put('principals',p.id,{...p.value,status:'active',owner_acceptance:input.review_ref});override(v,'principals',p,active);v.status='activated';
    const result={handover_id:h.id,status:'activated',epoch:input.epoch,paused:true,principal:ref('principals',active),acceptance:input.review_ref};const cmd=command(record,tx,'handover.activate',input,result,h);own(v,'commands',cmd.id);tx.put('work_items',h.id,v);tx.event('owner.incoming_activated',{principal:ref('principals',active),review:input.review_ref,source_instruction:input.source_instruction});return result;});}
 };
 const handle=Object.freeze(api);lifecycles.set(handle,record);return handle;
}

function original(capability,ledger){const r=maintenance.get(capability);need(r&&(!ledger||ledger===r.record.ledger),'OWNER_MAINTENANCE_ORIGINAL_REQUIRED');bound(r.record);return r;}
export function inspectOriginalPeerOwnerMaintenance(capability){const r=original(capability);return copy(r.binding);}
function admitted(r,tx){
 const b=r.binding,{c,p:owner}=current(r.record,tx,b.owner_epoch,{pending:true}),h=handover(tx,c);fresh(h);currentSubject(tx,h);
 need(owner.value.status==='pending'&&c.value.paused===true&&h.id===b.owner_handover_id&&same(h.value.reconstruction_ref,b.reconstruction_ref)&&same(h.value.native_source,support()),'OWNER_MAINTENANCE_CHANGED');
 const admission=exact(tx,b.admission_ref),{admission_ref,...body}=b;
 need(admission.value.kind==='owner_maintenance_admission'&&same(admission.value.binding,body),'OWNER_MAINTENANCE_CHANGED');
 const phase=tx.get('work_items',r.phase_id);
 need(phase?.value.kind==='owner_maintenance_phase'&&same(phase.value.admission_ref,b.admission_ref)&&['reserved','running'].includes(phase.value.status),'OWNER_MAINTENANCE_INACTIVE');
 const {p,g}=reviewGrant(tx,b.grant_ref.id,b.grant_generation,b.reviewer_principal_ref.id);
 need(same(ref('principals',p),b.reviewer_principal_ref)&&g.value.expires_at===b.grant_expires_at,'OWNER_REVIEW_CHANGED');
 independent(tx,owner,p,r.record.actor.native_id);
 need(Date.now()<b.deadline_at_ms,'OWNER_MAINTENANCE_EXPIRED');
 const context=exact(tx,phase.value.context_ref);need(context.value.kind==='owner_maintenance_context'&&context.value.sha256===b.context_sha256&&peerDigest(context.value.body)===b.context_sha256&&canonical(context.value.body)===context.value.text,'OWNER_MAINTENANCE_CHANGED');
 return {c,h,phase,context};
}
export function assertOriginalPeerOwnerMaintenance(capability,{ledger}={}){
 const r=original(capability,ledger);return r.record.ledger.read(raw=>{admitted(r,{...raw,connection:r.record.connection});return copy(r.binding);});
}

/** Trusted source-only admission. No caller validator, proof, native identity,
 * executor factory or new permission is accepted. This spends existing budget
 * exactly once before a process may be launched. */
export function prepareOriginalPeerOwnerMaintenance(lifecycle,args){
 const record=lifecycles.get(lifecycle);need(record,'OWNER_LIFECYCLE_ORIGINAL_REQUIRED');
 const input=data(args,['operation_id','epoch']);need(text(input.operation_id,160),'OWNER_INPUT');
 const existing=record.caps.get(input.operation_id);
 if(existing){assertOriginalPeerOwnerMaintenance(existing);need(maintenance.get(existing).binding.owner_epoch===input.epoch,'OWNER_REPLAY_MISMATCH');return existing;}
 const result=write(record,'maintenance.admit',input,(tx,limit)=>{
  const {c,p:owner}=current(record,tx,input.epoch,{pending:true}),h=handover(tx,c);fresh(h);currentSubject(tx,h);limit(h.value.expires_at_ms);
  need(owner.value.status==='pending'&&c.value.paused===true&&h.value.status==='reconstructed'&&h.value.reconstruction_ref,'OWNER_RECONSTRUCTION_REQUIRED');
  need(same(h.value.native_source,support()),'OWNER_REVIEW_SOURCE_CHANGED');
  need(h.value.used_review_calls<h.value.max_review_calls,'OWNER_REVIEW_BUDGET');
  need(!h.value.review_history.some(v=>['reserved','running','unknown'].includes(tx.get('work_items',v.phase_id)?.value.status)),'OWNER_REVIEW_UNCLOSED');
  const originalGrant=exact(tx,h.value.review_grant),{p,g}=reviewGrant(tx,originalGrant.id,originalGrant.value.generation,h.value.reviewer.id);
  need(same(ref('principals',p),h.value.reviewer)&&p.value.native_id!==owner.value.native_id,'OWNER_REVIEW_CHANGED');
  independent(tx,owner,p,record.actor.native_id);
  const capacity=reviewCapacity(tx,c,p,g),subject=exact(tx,h.value.subject_ref),reconstruction=exact(tx,h.value.reconstruction_ref);
  const previous=[];
  for(const entry of h.value.review_history){
   const phase=tx.get('work_items',entry.phase_id);need(phase?.value.status==='closed'&&phase.value.result_ref,'OWNER_REVIEW_UNCLOSED');
   const oldAdmission=exact(tx,phase.value.admission_ref),oldContext=exact(tx,phase.value.context_ref),oldResult=exact(tx,phase.value.result_ref);
   previous.push({admission:{ref:phase.value.admission_ref,body:oldAdmission.value},context:{ref:phase.value.context_ref,body:oldContext.value},phase:{ref:ref('work_items',phase),body:phase.value},result:{ref:phase.value.result_ref,body:oldResult.value}});
  }
  const priorReconstructions=h.value.reconstruction_history.map(v=>({ref:v,body:exact(tx,v).value}));
  const context={protocol:CONTEXT,connection:copy(record.connection),owner_handover_id:h.id,owner_epoch:h.value.epoch,
   subject:{ref:h.value.subject_ref,sha256:h.value.subject_sha256,body:subject.value.body},
   reconstruction:{ref:h.value.reconstruction_ref,sha256:reconstruction.value.content_sha256,content:reconstruction.value.content,incoming:copy(record.actor)},
   reviewer:{principal_ref:ref('principals',p),native_id:p.value.native_id},prior_attempts:previous,prior_reconstructions:priorReconstructions,
   authority:{grant_ref:h.value.review_grant,expires_at:new Date(h.value.expires_at_ms).toISOString()}};
  const contextText=canonical(context);need(Buffer.byteLength(contextText)<=Math.min(MAX_SUBJECT,c.value.policy.max_context_bytes),'OWNER_QA_CONTEXT_CAPACITY');
  const id=peerDigest(['peer-owner-maintenance-v1',record.connection,h.id,input.operation_id]),admissionId='owner-maintenance-admission:'+id,phaseId='owner-maintenance-phase:'+id,contextId='owner-maintenance-context:'+id,execution='owner-maintenance-execution:'+id;
  need(!tx.get('work_items',admissionId)&&!tx.get('slots',execution)&&!tx.get('effects',execution),'OWNER_MAINTENANCE_CONSUMED');
  const cv=tx.put('work_items',contextId,{kind:'owner_maintenance_context',body:context,text:contextText,sha256:peerDigest(context)});
  const binding={kind:'owner-handover-review',owner_handover_id:h.id,owner_epoch:h.value.epoch,subject_ref:h.value.subject_ref,subject_sha256:h.value.subject_sha256,reconstruction_ref:h.value.reconstruction_ref,
   reviewer_principal_ref:ref('principals',p),native_id:p.value.native_id,grant_ref:h.value.review_grant,grant_generation:g.value.generation,grant_expires_at:g.value.expires_at,deadline_at_ms:h.value.expires_at_ms,context_sha256:cv.value.sha256,context_ref:ref('work_items',cv)};
  const av=tx.put('work_items',admissionId,{kind:'owner_maintenance_admission',binding}),admissionRef=ref('work_items',av);
  tx.put('work_items',phaseId,{kind:'owner_maintenance_phase',status:'reserved',admission_ref:admissionRef,context_ref:binding.context_ref,execution_id:execution,reads:[],submission:null,result_ref:null});
  tx.put('slots',execution,{kind:'owner_maintenance_slot',status:'active',principal_id:p.id,admission_ref:admissionRef,termination_confirmed:false});
  tx.put('effects',execution,{kind:'owner_maintenance_effect',status:'running',principal_id:p.id,action:'owner/handover-review',admission_ref:admissionRef,termination_confirmed:false});
  const v=copy(h.value),chargedGrant=tx.put('grants',g.id,{...g.value,used_model_calls:capacity.used+1});override(v,'grants',g,chargedGrant);
  for(const [usageId,observed]of [['usage',capacity.global],['usage:'+p.id,capacity.personal]]){const charged=tx.put('control',usageId,{...(observed.r?.value??{}),model_calls:observed.used+1});override(v,'control',observed.r,charged);}
  for(const [family,rowId]of [['work_items',contextId],['work_items',admissionId],['work_items',phaseId],['slots',execution],['effects',execution]])own(v,family,rowId);
  v.used_review_calls++;v.review_history.push({admission_ref:admissionRef,phase_id:phaseId,result_ref:null});tx.put('work_items',h.id,v);
  tx.event('owner.review_admitted',{admission_ref:admissionRef,reviewer:binding.reviewer_principal_ref,context_sha256:binding.context_sha256});
  return {binding:{...binding,admission_ref:admissionRef},phase_id:phaseId};
 });
 const capability=Object.freeze(Object.create(null));maintenance.set(capability,{record,...result});record.caps.set(input.operation_id,capability);return capability;
}

/** The fixed native bridge retains this channel and registers it only for the
 * exact admitted reviewer. It is never returned as a public founder factory. */
export function originalPeerOwnerMaintenanceChannel(capability){
 const r=original(capability);
 const perform=(action,args,fn)=>write(r.record,'maintenance.'+action,args,(tx,limit)=>{const state=admitted(r,tx);limit(r.binding.deadline_at_ms);return fn(tx,state);});
 return Object.freeze({
  header(){return r.record.ledger.read(raw=>{const {phase:p,context:c}=admitted(r,{...raw,connection:r.record.connection});return {sha256:c.value.sha256,total_characters:c.value.text.length,utf8_bytes:Buffer.byteLength(c.value.text),context_ref:p.value.context_ref,coverage:p.value.reads,review_subject:{protocol:'peer-owner-handover-review-subject-v1',owner_handover_id:r.binding.owner_handover_id,subject_ref:r.binding.subject_ref,subject_sha256:r.binding.subject_sha256,reconstruction_ref:r.binding.reconstruction_ref}};});},
  read(args){const input=data(args,['sha256','offset','length']);return perform('read',input,(tx,{phase,context})=>{
   need(input.sha256===context.value.sha256,'OWNER_SOURCE_CHANGED');const part=range(context.value.text,input.offset,input.length);
   tx.put('work_items',phase.id,{...phase.value,status:'running',reads:merge(phase.value.reads,part)});
   return {sha256:input.sha256,...part,next_offset:part.offset+part.length,complete:part.offset+part.length===context.value.text.length};
  });},
  submit(args){const input=data(args,['sha256','content']);need(text(input.content,8192)&&bytes(input.content)<=8192,'OWNER_REVIEW_OUTPUT_CAPACITY');return perform('submit',input,(tx,{phase,context})=>{
   need(input.sha256===context.value.sha256&&complete(phase.value.reads,context.value.text.length),'OWNER_DELIVERY_INCOMPLETE');
   if(phase.value.submission){need(phase.value.submission.content===input.content,'OWNER_REVIEW_OUTPUT_IMMUTABLE');return {submitted:true,sha256:model.digest(input.content)};}
   tx.put('work_items',phase.id,{...phase.value,status:'running',submission:{content:input.content,sha256:model.digest(input.content)}});return {submitted:true,sha256:model.digest(input.content)};
  });}
 });
}

/** Closure requires the fixed original drain producer; matching DATA cannot
 * release a slot, qualify a review or activate an owner. */
export async function completeOriginalPeerOwnerMaintenance(capability,drainToken){
 const r=original(capability);assertOriginalPeerOwnerMaintenance(capability);
 const domain=await import('./protected-codex-domain.mjs');
 need(typeof domain.assertOriginalProtectedOwnedTaskDrain==='function','OWNER_DRAIN_SOURCE_UNAVAILABLE');
 const drain=domain.assertOriginalProtectedOwnedTaskDrain(drainToken,{ledger:r.record.ledger,admission_ref:r.binding.admission_ref,context_sha256:r.binding.context_sha256,kind:r.binding.kind});
 need(drain?.protocol==='peer-owned-admitted-task-drain-v1'&&drain.kind===r.binding.kind&&same(drain.admission_ref,r.binding.admission_ref)&&drain.context_sha256===r.binding.context_sha256&&drain.native_id===r.binding.native_id&&drain.thread_id===r.binding.native_id&&drain.group_absent===null&&drain.remote_domain_closed===false&&drain.terminal_status==='completed'&&typeof drain.output==='string'&&drain.output_sha256===model.digest(drain.output),'OWNER_DRAIN_BINDING');
 need(bytes(drain)<=MAX_SUBJECT,'OWNER_DRAIN_CAPACITY');
 return write(r.record,'maintenance.complete',{},(tx,limit)=>{
  const {h,phase,context}=admitted(r,tx);limit(r.binding.deadline_at_ms);
  need(phase.value.submission&&phase.value.submission.content===drain.output&&phase.value.submission.sha256===drain.output_sha256&&complete(phase.value.reads,context.value.text.length),'OWNER_REVIEW_TERMINAL_MISMATCH');
  const subject={protocol:'peer-owner-handover-review-subject-v1',owner_handover_id:h.id,subject_ref:h.value.subject_ref,subject_sha256:h.value.subject_sha256,reconstruction_ref:h.value.reconstruction_ref};
  let review=null,error=null;
  try{const parsed=JSON.parse(drain.output),v=data(parsed,['review']),fields=data(v.review,['subject','context_sha256','verdict','reason','blockers','permitted_action']);
   need(fields.context_sha256===r.binding.context_sha256&&fields.permitted_action==='activate_owner_handover','OWNER_REVIEW_OUTPUT');
   review={...parseReviewOutput(drain.output,subject,{canonical}),context_sha256:fields.context_sha256,permitted_action:fields.permitted_action};
  }catch(caught){if(!(caught instanceof OwnerError)&&caught.name!=='SyntaxError'&&caught.constructor.name!=='FactError')throw caught;error='OWNER_REVIEW_OUTPUT';}
  const accepted=review?.verdict==='Pass'&&!error,resultId=r.phase_id+':result';
  const result=tx.put('work_items',resultId,{kind:'owner_handover_qualification',status:accepted?'accepted':error?'failed':'rejected',admission_ref:r.binding.admission_ref,subject_sha256:h.value.subject_sha256,reconstruction_ref:h.value.reconstruction_ref,context_ref:phase.value.context_ref,context_sha256:r.binding.context_sha256,native_id:r.binding.native_id,output:drain.output,output_sha256:drain.output_sha256,review,error,drain:copy(drain),termination_confirmed:true,whole_domain_closed:false});
  const slot=tx.get('slots',phase.value.execution_id),effect=tx.get('effects',phase.value.execution_id);
  need(slot?.value.kind==='owner_maintenance_slot'&&effect?.value.kind==='owner_maintenance_effect'&&same(slot.value.admission_ref,r.binding.admission_ref)&&same(effect.value.admission_ref,r.binding.admission_ref),'OWNER_MAINTENANCE_CHANGED');
  const resultRef=ref('work_items',result);tx.put('work_items',phase.id,{...phase.value,status:'closed',result_ref:resultRef});
  tx.put('slots',slot.id,{...slot.value,status:'released',termination_confirmed:true,owned_task_drained:true});
  tx.put('effects',effect.id,{...effect.value,status:accepted?'succeeded':'failed',result_ref:resultRef,termination_confirmed:true,owned_task_drained:true});
  const v=copy(h.value);own(v,'work_items',resultId);const entry=v.review_history.find(e=>same(e.admission_ref,r.binding.admission_ref));need(entry,'OWNER_MAINTENANCE_CHANGED');entry.result_ref=resultRef;tx.put('work_items',h.id,v);
  return {accepted,result_ref:resultRef,owner_activated:false,paused:true,whole_domain_closed:false};
 });
}

/** A failed/uncertain original launch consumes its admission and retains its
 * reservation. This records uncertainty; it is not cancellation or closure. */
export function holdOriginalPeerOwnerMaintenance(capability,args){
 const r=original(capability),input=data(args,['error']);need(text(input.error,2000),'OWNER_INPUT');
 return write(r.record,'maintenance.hold',input,tx=>{const {c,p}=current(r.record,tx,r.binding.owner_epoch,{pending:true}),h=handover(tx,c),phase=tx.get('work_items',r.phase_id);
  need(p.value.status==='pending'&&c.value.paused===true&&h.id===r.binding.owner_handover_id&&phase?.value.kind==='owner_maintenance_phase'&&same(phase.value.admission_ref,r.binding.admission_ref)&&['reserved','running','unknown'].includes(phase.value.status),'OWNER_MAINTENANCE_CHANGED');
  // An expired/revoked admission may record ONLY uncertainty, never acceptance
  // or release. This remains useful after a deadline; original spend persists.
  const slot=tx.get('slots',phase.value.execution_id),effect=tx.get('effects',phase.value.execution_id);need(slot&&effect&&same(slot.value.admission_ref,r.binding.admission_ref)&&same(effect.value.admission_ref,r.binding.admission_ref),'OWNER_MAINTENANCE_CHANGED');
  if(phase.value.status==='unknown')return {status:'unknown',reservation_retained:true,accepted:false};
  tx.put('work_items',phase.id,{...phase.value,status:'unknown',error:input.error});tx.put('slots',slot.id,{...slot.value,status:'unknown',termination_confirmed:false});tx.put('effects',effect.id,{...effect.value,status:'unknown',termination_confirmed:false});tx.event('owner.review_held',{handover_id:h.id,admission_ref:r.binding.admission_ref,error:input.error});return {status:'unknown',reservation_retained:true,accepted:false};
 });
}
