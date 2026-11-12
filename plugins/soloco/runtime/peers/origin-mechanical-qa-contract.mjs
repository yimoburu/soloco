// SOURCE-fixed finite pre-quarantine QA contracts. These recorded decisions are
// founder-attributed by the current owning CoS, not host-authenticated humans.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {canonical,peerDigest} from './ledger.mjs';
export const ORIGIN_MECHANICAL_QA_PURPOSE='peer-origin-mechanical-qa-purpose-v1';
export const ORIGIN_MECHANICAL_QA_DECISION='peer-origin-mechanical-qa-decision-v1';
export const ORIGIN_MECHANICAL_QA_GRANT='peer-origin-mechanical-qa-grant-v1';
export const ORIGIN_MECHANICAL_QA_AUTHORITY='owning-cos-recorded-founder-instruction';
export const ORIGIN_MECHANICAL_QA_HUMAN_AUTHENTICITY='not mechanically established';
export const qaNeed=(ok,code='ORIGIN_MECHANICAL_QA_INPUT')=>{if(!ok)throw Object.assign(Error(code),{code});};
export const qaCopy=value=>JSON.parse(canonical(value));
export const qaSame=(a,b)=>canonical(a)===canonical(b);
export const qaRawHash=value=>createHash('sha256').update(value).digest('hex');
export function qaData(value,keys,optional=[]){qaNeed(value&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);const d=Object.getOwnPropertyDescriptors(value);qaNeed(Reflect.ownKeys(d).every(k=>typeof k==='string'&&[...keys,...optional].includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value'))&&keys.every(k=>Object.hasOwn(d,k)));return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.value]));}
export const qaText=(v,max=4000)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
export function qaRef(value){const r=qaData(value,['id','revision','sha256']);qaNeed(qaText(r.id,200)&&Number.isSafeInteger(r.revision)&&r.revision>0&&/^[a-f0-9]{64}$/.test(r.sha256??''),'ORIGIN_MECHANICAL_QA_REFERENCE');return r;}
export const qaRecordRef=record=>({id:record.id,revision:record.revision,sha256:qaRawHash(JSON.stringify(record))});
export function qaPrimaryMessage(value){const v=qaData(value,['host','chat_id','turn_id','message_id','content_sha256','quote']);qaNeed(v.host==='codex'&&['chat_id','turn_id','message_id'].every(k=>qaText(v[k],300)&&!/(?:^file:|^artifact:|^@public:|[\/\\])/.test(v[k]))&&qaText(v.quote,20000)&&Buffer.byteLength(v.quote)<=20000&&/^[a-f0-9]{64}$/.test(v.content_sha256??'')&&qaRawHash(v.quote)===v.content_sha256,'ORIGIN_MECHANICAL_QA_PRIMARY_REQUIRED');return qaCopy(v);}
export function qaPurpose(value){const v=qaData(value,['protocol','purpose','decision_ref']);qaNeed(v.protocol===ORIGIN_MECHANICAL_QA_PURPOSE&&v.purpose==='quarantine-transition-review-only','ORIGIN_MECHANICAL_QA_PURPOSE_REQUIRED');v.decision_ref=qaRef(v.decision_ref);return qaCopy(v);}
export function qaLimits(value){const v=qaData(value,['max_attempts','max_native_calls','max_context_utf8_bytes','timeout_ms']);qaNeed(v.max_attempts===1&&Number.isSafeInteger(v.max_native_calls)&&v.max_native_calls>=1&&v.max_native_calls<=17&&Number.isSafeInteger(v.max_context_utf8_bytes)&&v.max_context_utf8_bytes>=512&&v.max_context_utf8_bytes<=200000&&Number.isSafeInteger(v.timeout_ms)&&v.timeout_ms>=1000&&v.timeout_ms<=600000,'ORIGIN_MECHANICAL_QA_LIMITS');return qaCopy(v);}
export function qaModelSelection(value){const v=qaData(value,['mode','model','reason'],['effort','speed']);qaNeed(v.mode==='explicit'&&typeof v.model==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v.model)&&qaText(v.reason,300)&&(!Object.hasOwn(v,'speed')||v.speed==='host_default')&&(!Object.hasOwn(v,'effort')||['none','minimal','low','medium','high','xhigh','max','ultra'].includes(v.effort)),'ORIGIN_MECHANICAL_QA_MODEL_SELECTION');return qaCopy(v);}
export const qaPrimaryKey=(company_id,message)=>peerDigest([company_id,message.host,message.chat_id,message.turn_id,message.message_id]);
