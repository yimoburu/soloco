// Closed DATA shapes shared by the writer and cold readers. No Store,
// process creation, permission or private issuance is available in this module.
export const LEGACY_RUNTIME_PROTOCOL='unqualified-runtime-processes-v1';
const slots=['worker','watchdog','test_child'];
const recipes=new Set(['ordinary_worker','development_worker','watchdog','sandbox_test_child']);
const queueTypes=new Set(['job.queued','task.job_queued','development.test_reserved','development.preflight_recovery_reserved','development.preflight_diagnostic_reserved']);
const own=(value,key)=>value!==null&&typeof value==='object'&&Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const closed=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const same=(a,b)=>a===undefined||b===undefined?a===b:JSON.stringify(a)===JSON.stringify(b);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nat=value=>Number.isSafeInteger(value)&&value>=0;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const instant=value=>typeof value==='string'&&Number.isSafeInteger(Date.parse(value))&&Date.parse(value)>=0;
function validSlot(slot,name){
  if(slot===null)return true;
  if(!closed(slot,['launch_id','controller_pid','requested_at','deadline_at_ms','recipe','descriptor_sha256','parent_launch_id','request_sha256','birth','closure'])||!uuid(slot.launch_id)||!positive(slot.controller_pid)||!instant(slot.requested_at)||!nat(slot.deadline_at_ms)||slot.deadline_at_ms>8640000000000000||slot.deadline_at_ms<Date.parse(slot.requested_at)||!recipes.has(slot.recipe)||!hex(slot.descriptor_sha256))return false;
  if(name==='worker'?!['ordinary_worker','development_worker'].includes(slot.recipe)||slot.parent_launch_id!==null||slot.request_sha256!==null:name==='watchdog'?slot.recipe!=='watchdog'||!uuid(slot.parent_launch_id)||!hex(slot.request_sha256):slot.recipe!=='sandbox_test_child'||!uuid(slot.parent_launch_id)||!hex(slot.request_sha256))return false;
  if(slot.birth!==null&&(!closed(slot.birth,['pid','observed_at'])||!positive(slot.birth.pid)||!instant(slot.birth.observed_at)||Date.parse(slot.birth.observed_at)<Date.parse(slot.requested_at)))return false;
  if(slot.closure!==null){const c=slot.closure;if(!closed(c,['pid','observed_at','exit_code','signal','never_started'])||!instant(c.observed_at)||Date.parse(c.observed_at)<Date.parse(slot.birth?.observed_at??slot.requested_at)||(c.exit_code!==null&&!Number.isInteger(c.exit_code))||(c.signal!==null&&(typeof c.signal!=='string'||!/^SIG[A-Z0-9]{1,16}$/.test(c.signal)))||typeof c.never_started!=='boolean'||(c.never_started?slot.birth!==null||c.pid!==null:slot.birth===null||c.pid!==slot.birth.pid))return false;}
  return true;
}
export function validateLegacyRuntimeJobShape(job){
  const value=job?.legacy_runtime;
  if(!closed(value,['protocol',...slots])||value.protocol!==LEGACY_RUNTIME_PROTOCOL||!slots.every(name=>validSlot(value[name],name)))return false;
  if(!['development_test','development_preflight'].includes(job.kind)&&value.worker?.recipe==='development_worker')return false;
  if(['development_test','development_preflight'].includes(job.kind)&&value.worker?.recipe==='ordinary_worker')return false;
  if(job.kind!=='development_test'||job.reuse_receipt_id){if(value.watchdog!==null||value.test_child!==null)return false;}
  if(value.watchdog&&(value.worker?.birth?.pid!==value.watchdog.controller_pid||value.watchdog.parent_launch_id!==value.worker.launch_id))return false;
  if(value.test_child&&(value.watchdog?.birth?.pid!==value.test_child.controller_pid||value.test_child.parent_launch_id!==value.watchdog.launch_id))return false;
  return true;
}
export function legacyRuntimeJobTransition(before,after,type){
  const a=before?.legacy_runtime,b=after?.legacy_runtime;
  if(a===undefined&&b===undefined)return true;
  if(!validateLegacyRuntimeJobShape(after))return false;
  if(a===undefined)return !before&&queueTypes.has(type)&&slots.every(name=>b[name]===null);
  if(!validateLegacyRuntimeJobShape(before))return false;
  if(same(a,b))return true;
  let changes=0;
  for(const name of slots){const old=a[name],next=b[name];if(same(old,next))continue;changes++;
    if(old===null){if(!((name==='worker'&&type==='job.worker_launch_requested'||name!=='worker'&&type==='development.execution_launch_requested')&&next&&next.birth===null&&next.closure===null))return false;}
    else if(!next||!same({...old,birth:null,closure:null},{...next,birth:null,closure:null}))return false;
    else if(type==='job.legacy_runtime.born'){if(old.birth!==null||old.closure!==null||next.birth===null||next.closure!==null)return false;}
    else if(type==='job.legacy_runtime.closed'){if(old.closure!==null||next.closure===null||!same(old.birth,next.birth))return false;}
    else return false;
  }
  return changes===1;
}
export function legacyRuntimeJobPhase(before,current){
  if(!validateLegacyRuntimeJobShape(before)||!validateLegacyRuntimeJobShape(current))return false;
  return slots.every(name=>{const a=before.legacy_runtime[name],b=current.legacy_runtime[name];if(a===null)return true;if(b===null||!same({...a,birth:null,closure:null},{...b,birth:null,closure:null}))return false;return (a.birth===null||same(a.birth,b.birth))&&(a.closure===null||same(a.closure,b.closure));});
}
