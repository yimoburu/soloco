// Fixed bootstrap DATA grammar. No issuer, native capability or policy bypass.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {canonical,peerDigest} from './ledger.mjs';
export {canonical,peerDigest};
export const BOOTSTRAP_PROFILE='soloco-bootstrap-membership-readonly3-v1';
export const BOOTSTRAP_ASSIGNMENT='peer-bootstrap-membership-assignment-v1';
export const BOOTSTRAP_CONTEXT='peer-bootstrap-membership-context-v1';
export const BOOTSTRAP_BASIS='peer-checked-input-current-meaning-v1';
export const bootstrapKind=phase=>{need(['reconstruction','review'].includes(phase),'BOOTSTRAP_PHASE');return 'peer-bootstrap-membership-'+phase;};
export const need=(yes,code='BOOTSTRAP_SOURCE_CHANGED')=>{if(!yes)throw Object.assign(Error(code),{code});};
export const digest=value=>typeof value==='string'?createHash('sha256').update(value,'utf8').digest('hex'):peerDigest(value);
export const copy=value=>JSON.parse(canonical(value));
export const same=(a,b)=>canonical(a)===canonical(b);
export const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
export const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const text=(value,max=2000)=>typeof value==='string'&&value.trim()&&value.length<=max&&!value.includes('\0')&&Buffer.from(value).toString('utf8')===value;
function dataOnly(value,depth=0,budget={nodes:0}){
 need(++budget.nodes<=100000&&depth<=64,'BOOTSTRAP_INPUT_CAPACITY');if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){need(Number.isFinite(value),'BOOTSTRAP_INPUT');return;}
 need(value&&typeof value==='object'&&!types.isProxy(value)&&(Array.isArray(value)?Object.getPrototypeOf(value)===Array.prototype:Object.getPrototypeOf(value)===Object.prototype),'BOOTSTRAP_INPUT');
 const descriptors=Object.getOwnPropertyDescriptors(value);for(const key of Reflect.ownKeys(descriptors)){if(Array.isArray(value)&&key==='length')continue;const d=descriptors[key];need(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'),'BOOTSTRAP_INPUT');dataOnly(d.value,depth+1,budget);}
}
export function closed(value,required,optional=[]){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'BOOTSTRAP_INPUT');const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 need(required.every(k=>keys.includes(k))&&keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')),'BOOTSTRAP_INPUT');dataOnly(value);need(Buffer.byteLength(canonical(value))<=16*1024*1024,'BOOTSTRAP_INPUT_CAPACITY');return copy(value);
}
export function reference(value,family='work_items'){const r=closed(value,['family','id','revision','sha256']);need(r.family===family&&text(r.id,2000)&&Number.isSafeInteger(r.revision)&&r.revision>0&&hash(r.sha256),'BOOTSTRAP_REFERENCE');return r;}
export function bootstrapActor(value){const a=closed(value,['host','session_id','native_id']);need(['codex','claude'].includes(a.host)&&text(a.session_id,200)&&text(a.native_id,300),'BOOTSTRAP_ACTOR_REQUIRED');return a;}
export function bootstrapPhaseInput(value){const a=closed(value,['operation_id','epoch','enrollment_id','phase'],['reviewer_principal_id']);need(text(a.operation_id,160)&&Number.isSafeInteger(a.epoch)&&a.epoch>0&&text(a.enrollment_id,200),'BOOTSTRAP_INPUT');bootstrapKind(a.phase);need(a.phase==='review'?text(a.reviewer_principal_id,200):a.reviewer_principal_id===undefined,'BOOTSTRAP_INPUT');return a;}
export const bootstrapResponseContract=phase=>phase==='reconstruction'?{protocol:'peer-bootstrap-membership-response-contract-v1',kind:bootstrapKind(phase),format:'nonempty-utf8-text',maximum_utf8_bytes:12000,final_must_equal_first_submission:true}:{protocol:'peer-bootstrap-membership-response-contract-v1',kind:bootstrapKind(phase),format:'canonical-json',top_keys:['content','review'],review_keys:['subject','context_sha256','verdict','reason','blockers'],maximum_utf8_bytes:12000,final_must_equal_first_submission:true};
export function parseBootstrapResponse(output,{phase,subject,context_sha256}){
 need(text(output,12000)&&Buffer.byteLength(output)<=12000,'BOOTSTRAP_OUTPUT_CAPACITY');if(phase==='reconstruction')return {content:output,review:null};
 let parsed;try{parsed=JSON.parse(output);}catch{need(false,'BOOTSTRAP_REVIEW_OUTPUT');}need(canonical(parsed)===output,'BOOTSTRAP_REVIEW_CANONICAL');const body=closed(parsed,['content','review']),review=closed(body.review,['subject','context_sha256','verdict','reason','blockers']);reference(review.subject);
 need(text(body.content,12000)&&same(review.subject,subject)&&review.context_sha256===context_sha256&&['Pass','Fail','Blocked'].includes(review.verdict)&&text(review.reason,8000)&&Array.isArray(review.blockers)&&review.blockers.length<=64&&review.blockers.every(v=>text(v,1000))&&(review.verdict==='Pass'?review.blockers.length===0:review.blockers.length>0),'BOOTSTRAP_REVIEW_OUTPUT');return {content:body.content,review};
}
export function validateBootstrapMembershipFirstRpc(value,text){
 const c=closed(value,['protocol','payload_sha256','instruction_sha256','frame_sha256','recipe_sha256','input_utf8_bytes','whole_rpc_utf8_bytes','frame_bytes','wire_bytes','context_utf8_bytes','policy_maximum_context_bytes','native_identity']),assignment=JSON.parse(text),maximum=assignment.source_cut?.control?.value?.policy?.max_context_bytes;
 need(c.protocol==='peer-bootstrap-membership-first-rpc-v1'&&c.payload_sha256===digest(text)&&c.context_utf8_bytes===Buffer.byteLength(text)&&c.policy_maximum_context_bytes===maximum&&c.context_utf8_bytes<=maximum&&c.native_identity==='UNOBSERVED_GEOMETRY_ONLY'&&[c.instruction_sha256,c.frame_sha256,c.recipe_sha256].every(hash)&&c.frame_bytes===100000&&c.wire_bytes===4000000&&Number.isSafeInteger(c.input_utf8_bytes)&&c.input_utf8_bytes>0&&c.input_utf8_bytes<=c.frame_bytes&&Number.isSafeInteger(c.whole_rpc_utf8_bytes)&&c.whole_rpc_utf8_bytes>0&&c.whole_rpc_utf8_bytes<=c.frame_bytes,'BOOTSTRAP_PREFLIGHT_CHANGED');return c;
}
export function validateBootstrapMembershipOwnedClosure(value,{drain,kind,admission_ref,context_sha256,native_id}){
 const c=closed(value,['protocol','scope','kind','admission_ref','context_sha256','native_id','thread_id','turn_id','terminal_status','output_sha256','drain_sha256','termination_confirmed','group_absent','remote_domain_closed','whole_domain_qualified','prior_unknown_slots_released']);
 need(c.protocol==='peer-bootstrap-membership-owned-unit-closure-v1'&&c.scope==='original-owned-admitted-bootstrap-unit'&&c.kind===kind&&same(c.admission_ref,admission_ref)&&c.context_sha256===context_sha256&&c.native_id===native_id&&c.thread_id===native_id&&text(c.turn_id,300)&&c.turn_id===drain.turn_id&&c.terminal_status==='completed'&&c.output_sha256===drain.output_sha256&&c.drain_sha256===digest(drain)&&c.termination_confirmed===true&&c.group_absent===null&&c.remote_domain_closed===false&&c.whole_domain_qualified===false&&c.prior_unknown_slots_released===false,'BOOTSTRAP_CLOSURE_CHANGED');return c;
}
