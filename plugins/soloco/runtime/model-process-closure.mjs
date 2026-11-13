// Runtime-owned ordinary CLI process journal. No model/public proof input.
// ChildProcess.close proves this original CLI child closed, not descendants,
// native success, QA acceptance, fresh permission, refund or an extended scope.
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sha=v=>hash(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const closed=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\x00-\x1f]/.test(v);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const positive=v=>Number.isSafeInteger(v)&&v>0;
const fail=()=>{throw Object.assign(Error('Original runtime model-process closure evidence required'),{code:'MODEL_PROCESS_CLOSURE_HELD'});};
const entryKeys=['invocation_id','job_id','instance_id','worker_pid','host','requested_at','birth','closure'];
const birthKeys=['protocol','launch_id','host','pid','worker_pid','spawned_at','command_sha256','argv_sha256','cwd_sha256'];
const closureKeys=['protocol','birth_sha256','closed_at','exit_code','signal','observation'];
export function validModelProcessBirth(v){return closed(v,birthKeys)&&v.protocol==='ordinary-model-process-birth-v1'&&text(v.launch_id)&&['codex','claude'].includes(v.host)&&positive(v.pid)&&positive(v.worker_pid)&&time(v.spawned_at)&&['command_sha256','argv_sha256','cwd_sha256'].every(k=>hex(v[k]));}
function validClosure(v,b){return validModelProcessBirth(b)&&closed(v,closureKeys)&&v.protocol==='ordinary-model-process-close-v1'&&v.birth_sha256===sha(b)&&time(v.closed_at)&&Date.parse(v.closed_at)>=Date.parse(b.spawned_at)&&(v.exit_code===null||Number.isInteger(v.exit_code))&&(v.signal===null||typeof v.signal==='string'&&/^SIG[A-Z0-9]{1,16}$/.test(v.signal))&&v.observation==='original-child-close';}
export function validModelProcessTracking(v){
 return closed(v,['version','current','invocations'])&&v.version===1&&text(v.current)&&Array.isArray(v.invocations)&&v.invocations.length>0&&v.current===v.invocations.at(-1)?.invocation_id&&new Set(v.invocations.map(x=>x.invocation_id)).size===v.invocations.length&&v.invocations.every(x=>closed(x,entryKeys)&&text(x.invocation_id)&&text(x.job_id)&&text(x.instance_id)&&positive(x.worker_pid)&&['codex','claude'].includes(x.host)&&time(x.requested_at)&&(x.birth===null||validModelProcessBirth(x.birth)&&x.birth.worker_pid===x.worker_pid&&x.birth.host===x.host&&Date.parse(x.birth.spawned_at)>=Date.parse(x.requested_at))&&(x.closure===null||validClosure(x.closure,x.birth)));
}
function owned(job,invocation){if(!job||job.id!==invocation.job_id||job.instance_id!==invocation.instance_id||job.worker_pid!==invocation.worker_pid||job.host!==invocation.host)fail();}
export function requestModelProcess(job,invocation){
 owned(job,invocation);if(!closed(invocation,['invocation_id','job_id','instance_id','worker_pid','host','requested_at'])||!text(invocation.invocation_id)||!time(invocation.requested_at))fail();
 // A later request cannot turn an earlier unobserved birth/close into free
 // capacity. Native requests remain lineage within one assignment unit.
 const before=job.model_process_tracking;if(before&&(!validModelProcessTracking(before)||before.invocations.some(x=>!x.birth||!x.closure)))fail();if(before?.invocations.some(x=>x.invocation_id===invocation.invocation_id))fail();
 job.model_process_tracking={version:1,current:invocation.invocation_id,invocations:[...(before?.invocations??[]),{...invocation,birth:null,closure:null}]};
}
export function recordModelProcessBirth(job,invocation,birth){
 owned(job,invocation);if(!validModelProcessTracking(job.model_process_tracking)||!validModelProcessBirth(birth))fail();
 const entry=job.model_process_tracking.invocations.find(x=>x.invocation_id===invocation.invocation_id);if(!entry||job.model_process_tracking.current!==invocation.invocation_id||entry.birth!==null||entry.closure!==null||birth.worker_pid!==invocation.worker_pid||birth.host!==invocation.host||Date.parse(birth.spawned_at)<Date.parse(entry.requested_at))fail();entry.birth=JSON.parse(JSON.stringify(birth));
}
export function recordModelProcessClosure(job,invocation,birth,receipt){
 owned(job,invocation);if(!validModelProcessTracking(job.model_process_tracking)||!validClosure(receipt,birth))fail();
 const entry=job.model_process_tracking.invocations.find(x=>x.invocation_id===invocation.invocation_id);if(!entry||!same(entry.birth,birth))fail();if(entry.closure!==null){if(!same(entry.closure,receipt))fail();return false;}entry.closure=JSON.parse(JSON.stringify(receipt));return true;
}
export function modelProcessTransition(before,after,type){
 const a=before?.model_process_tracking,b=after?.model_process_tracking;if(!validModelProcessTracking(b))return false;
 if(type==='job.model_process.requested')return (!a||validModelProcessTracking(a)&&a.invocations.every(x=>x.birth&&x.closure))&&b.invocations.length===(a?.invocations.length??0)+1&&same(b.invocations.slice(0,-1),a?.invocations??[])&&b.invocations.at(-1).birth===null&&b.invocations.at(-1).closure===null;
 if(!validModelProcessTracking(a)||a.current!==b.current||a.invocations.length!==b.invocations.length)return false;
 let changed=0;
 for(let i=0;i<a.invocations.length;i++){
  const x=a.invocations[i],y=b.invocations[i];if(same(x,y))continue;changed++;
  if(type==='job.model_process.born'){if(x.birth!==null||x.closure!==null||y.closure!==null||!validModelProcessBirth(y.birth)||!same(x,{...y,birth:null}))return false;}
  else if(type==='job.model_process.closed'){if(x.closure!==null||!validClosure(y.closure,y.birth)||!same(x,{...y,closure:null}))return false;}
  else return false;
 }
 return changed===1;
}
// Earlier actual intake boundaries may precede later read-round births/closes.
// Only monotone null-to-observation changes commute; producer transitions are
// separately checked against every actual storage event.
export function modelProcessPhase(before,current){
 if(!validModelProcessTracking(before)||!validModelProcessTracking(current)||before.invocations.length>current.invocations.length)return false;
 return before.invocations.every((entry,i)=>{const next=current.invocations[i];return same({...entry,birth:null,closure:null},{...next,birth:null,closure:null})&&(entry.birth===null||same(entry.birth,next.birth))&&(entry.closure===null||same(entry.closure,next.closure));});
}
function rawJSON(db,ref){
 const row=db.prepare('SELECT bytes,CAST(bytes AS BLOB) AS raw FROM immutable_values WHERE sha256=?').get(ref.sha256);if(typeof row?.bytes!=='string'||!(row.raw instanceof Uint8Array)||!Buffer.from(row.bytes).equals(Buffer.from(row.raw))||hash(row.raw)!==ref.sha256)fail();return JSON.parse(row.bytes);
}
function producedTracking(store,job){
 if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_layout'").get()===undefined||store.db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==4)fail();
 const types=['job.model_process.requested','job.model_process.born','job.model_process.closed'];
 const where="type IN (?,?,?) AND EXISTS(SELECT 1 FROM json_each(events.value,'$.storage_delta.changes') AS change WHERE json_extract(change.value,'$.after.family')='jobs' AND json_extract(change.value,'$.after.key')=?)";
 const count=store.db.prepare('SELECT COUNT(*) AS n FROM events WHERE '+where).get(...types,job.id).n;if(count>10000)fail();
 const rows=store.db.prepare('SELECT seq,at,type,value,CAST(value AS BLOB) AS raw FROM events WHERE '+where+' ORDER BY seq').all(...types,job.id),proofs=new Map();
 for(const event of rows){
  if(typeof event.value!=='string'||!(event.raw instanceof Uint8Array)||!Buffer.from(event.value).equals(Buffer.from(event.raw)))fail();
  const payload=JSON.parse(event.value),delta=payload.storage_delta;if(!delta||!Array.isArray(delta.changes))fail();const committed=delta.sha256;delete delta.sha256;if(sha([event.seq,event.at,event.type,payload])!==committed)fail();
  const prior=store.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(event.seq-1);if(delta.previous_event_sha256!==(prior?sha([prior.seq,prior.at,prior.type,prior.value]):null))fail();
  for(const change of delta.changes){
   if(change.after?.family!=='jobs'||change.after.key!==job.id)continue;
   const before=change.before?rawJSON(store.db,change.before):null,after=rawJSON(store.db,change.after);
   if(after.id!==job.id||after.instance_id!==job.instance_id||after.worker_pid!==job.worker_pid||!modelProcessTransition(before,after,event.type)||!same(Object.fromEntries(Object.entries(before??{}).filter(([k])=>k!=='model_process_tracking')),Object.fromEntries(Object.entries(after??{}).filter(([k])=>k!=='model_process_tracking'))))fail();
   const field=event.type.split('.').at(-1);
   for(const entry of after.model_process_tracking.invocations){
    const old=before?.model_process_tracking?.invocations.find(x=>x.invocation_id===entry.invocation_id);
    if(field==='requested'&&!old||field==='born'&&old?.birth===null&&entry.birth||field==='closed'&&old?.closure===null&&entry.closure){const item=proofs.get(entry.invocation_id)??{};if(item[field])fail();item[field]={seq:event.seq,entry};proofs.set(entry.invocation_id,item);}
   }
  }
 }
 for(const entry of job.model_process_tracking.invocations){const p=proofs.get(entry.invocation_id);if(!p?.requested||!p.born||!p.closed||!(p.requested.seq<p.born.seq&&p.born.seq<p.closed.seq)||!same(p.closed.entry,entry))fail();}
}
export function reconcileStoredModelProcessClosure(store,job){
 if(!job||!['failed','cancelled','interrupted'].includes(job.status)||!validModelProcessTracking(job.model_process_tracking)||job.model_process_tracking.invocations.some(x=>!x.birth||!x.closure))fail();
 if(job.model_process_tracking.invocations.some(x=>x.job_id!==job.id||x.instance_id!==job.instance_id||x.worker_pid!==job.worker_pid||x.host!==job.host))fail();
 producedTracking(store,job);
 if(job.coordination_release?.termination_confirmed===true)return false;
 const at=new Date().toISOString();job.coordination_release={termination_confirmed:true,reason:'model_process_closed',at};if(['cancelled','interrupted'].includes(job.status))job.finished_at??=at;return true;
}
