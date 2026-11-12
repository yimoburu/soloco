// Closed prospective purpose DATA only. No grant, native proof, caller mask or
// selected-authority renewal. Actual typed transition replay validates spending.
import {types} from 'node:util';
import {peerDigest} from './ledger.mjs';
const fail=()=>{throw Object.assign(Error('ORIGIN_PAUSED_BOOTSTRAP_PURPOSE_REQUIRED'),{code:'ORIGIN_PAUSED_BOOTSTRAP_PURPOSE_REQUIRED'});};
const need=yes=>{if(!yes)fail();};
export const ORIGIN_PAUSED_BOOTSTRAP_PURPOSE='peer-origin-paused-bootstrap-purpose-v1';
const selectionKeys=Object.freeze(['protocol','purpose','max_enrollments','max_model_calls','max_review_calls']);
const spendKeys=Object.freeze(['used_enrollments','used_model_calls','used_review_calls']);
function closed(value,keys){need(value&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);const d=Object.getOwnPropertyDescriptors(value);need(Reflect.ownKeys(d).length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value')));return Object.fromEntries(keys.map(k=>[k,d[k].value]));}
function limits(p,m){need(m&&typeof m==='object'&&!types.isProxy(m)&&Object.getPrototypeOf(m)===Object.prototype);const d=Object.getOwnPropertyDescriptors(m);need(['max_model_calls','max_review_calls'].every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value')));m={max_model_calls:d.max_model_calls.value,max_review_calls:d.max_review_calls.value};need(p.protocol===ORIGIN_PAUSED_BOOTSTRAP_PURPOSE&&p.purpose==='membership-qualification-only'&&['max_enrollments','max_model_calls','max_review_calls'].every(k=>Number.isSafeInteger(p[k])&&p[k]>0)&&Number.isSafeInteger(m?.max_model_calls)&&Number.isSafeInteger(m?.max_review_calls)&&p.max_model_calls<=m.max_model_calls&&p.max_review_calls<=m.max_review_calls&&p.max_review_calls<=p.max_model_calls&&p.max_enrollments<=Math.floor(p.max_model_calls/2)&&p.max_enrollments<=p.max_review_calls);return p;}
export function peerOriginPausedBootstrapPurpose(value,maintenance){return limits(closed(value,selectionKeys),maintenance);}
export function peerOriginPausedBootstrapInitialPurpose(value,maintenance){const p=peerOriginPausedBootstrapPurpose(value,maintenance);return {...p,used_enrollments:0,used_model_calls:0,used_review_calls:0};}
export function peerOriginPausedBootstrapCurrentPurpose(value,maintenance){const p=limits(closed(value,[...selectionKeys,...spendKeys]),maintenance);for(const [used,maximum]of [['used_enrollments','max_enrollments'],['used_model_calls','max_model_calls'],['used_review_calls','max_review_calls']])need(Number.isSafeInteger(p[used])&&p[used]>=0&&p[used]<=p[maximum]);need(p.used_review_calls<=p.used_model_calls);return p;}
export function peerOriginPausedBootstrapStableSelection(value,maintenance){const p=peerOriginPausedBootstrapCurrentPurpose(value,maintenance);return {...p,used_enrollments:0,used_model_calls:0,used_review_calls:0};}

// Stable selected-authority DATA hash, never cost provenance or permission.
// Every other field, including limits/expiry/pause/unknown used_* names, stays.
export function peerOriginPausedBootstrapMaintenanceAuthoritySha256(value){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);const d=Object.getOwnPropertyDescriptors(value);need(Reflect.ownKeys(d).every(k=>typeof k==='string'&&d[k].enumerable&&Object.hasOwn(d[k],'value')));const source=Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.value])),excluded=['used_model_calls','used_review_calls','used_frontier_calls','used_frontier_reviews','used_frontier_seal_reviews'],authority=Object.fromEntries(Object.entries(source).filter(([k])=>!excluded.includes(k)));if(Object.hasOwn(authority,'paused_bootstrap'))authority.paused_bootstrap=peerOriginPausedBootstrapStableSelection(authority.paused_bootstrap,source);return peerDigest(authority);
}
