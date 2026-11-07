import {schedulingRecovery} from './recovery.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {withStore,owner,stamp,id,digest,PACKAGE,VERSION,folder,notice,requireText} from './store.mjs';
import {taskKeys,taskCursor,messageKeys,installTaskIndex,readTaskState,updateTaskIndex,requireTaskStorage,TASK_ROOT_KEYS} from './task-index.mjs';
import {RUNTIME_CONTROL_ID,runtimeControl,runtimeControlBinding,setRuntimeControl,runtimeGrant} from './task-runtime-authority.mjs';
import {submitTask,amendTask,cancelTask,taskRecord,taskView,taskReady,reconcileTask,commandRecordId,sendTaskMessage,messagesForTask,disposeTaskMessage} from './tasks.mjs';
import {portfolioContext,taskCheckpoint} from './task-context.mjs';
import {jobTimeoutState} from './timeout.mjs';
import {contextMatches} from './context.mjs';

const registered=new Set();
const alive=pid=>{if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
const options=state=>({rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:Object.keys(state.records??{}),jobs:Object.keys(state.jobs??{}),sessions:Object.keys(state.sessions??{}),notices:null,messages:[]}});
function selected(db,type,state,fn){return db.selectedTransaction(type,options(state),fn,{afterWrite:updateTaskIndex});}
const source=record=>({id:record.id,revision:record.revision,sha256:digest(JSON.stringify(record))});
function compactTask(record,state){const {task,acceptance,...view}=taskView(record);return {...view,...(state&&record.runtime_task.state==='planned'?{readiness:taskReady(state,record)}:{}),task_summary:task.slice(0,160),acceptance_preview:acceptance.slice(0,320),source:source(record),display_fields_are_previews:true,acceptance_freshness:'A recorded review outcome; current reuse always requires fresh runtime validation'};}
function viewControl(state,db){
  let r;try{r=runtimeControl(state);}catch(e){return {enabled:false,state:'needs_attention',reason:e.message};}
  const c=r.runtime_control,hasLease=db?.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='async_runtime_lease'").get(),lease=hasLease?db.db.prepare('SELECT pid,heartbeat_at FROM async_runtime_lease WHERE instance_id=?').get(c.instance_id):null,live=alive(c.pid),fresh=Boolean(lease&&lease.pid===c.pid&&Date.now()-Date.parse(lease.heartbeat_at)<10000);
  return {enabled:c.enabled,state:state.paused?'paused':!c.enabled?'stopped':c.error?'needs_attention':live&&fresh?'running':live?'needs_attention':'awaiting_host_wakeup',instance_id:c.instance_id,pid:c.pid??null,last_heartbeat:lease?.heartbeat_at??null,error:c.error??null,host_requirement:'A running supported local host; offline progress and background founder delivery are not promised',supervisor_is_model:false};
}
function extraRecords(db,state,args,host){
  const needed=new Set(Object.keys(state.records??{}));
  if(args.operation_id){const command=commandRecordId(state,args,host);needed.add(command);needed.add(command.replace('async-command-','async-task-'));needed.add(command.replace('async-command-','async-message-'));}
  if(args.message_id)needed.add(args.message_id);
  for(const key of [...(args.spec?.input_ids??args.input_ids??[]),...(args.spec?.evidence_ids??[]),...(args.spec?.peer_task_ids??[]),...(args.spec?.depends_on??args.depends_on??[]).map(d=>d.task_id),args.spec?.review_task_id,args.review_task_id,args.to_task_id].filter(Boolean))needed.add(key);
  const merged=db.readPublicSelected({rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:[...needed],jobs:Object.keys(state.jobs??{}),sessions:[],notices:null,messages:[]}});
  const command=args.operation_id&&merged.records[commandRecordId(merged,args,host)];
  if(command?.runtime_command?.task_id&&!merged.records[command.runtime_command.task_id]){
    const more=db.readPublicSelected({rootKeys:[],entities:{records:[command.runtime_command.task_id]}});Object.assign(merged.records,more.records);
  }
  return merged;
}
export function taskAction(args,host,{wake=ensureSupervisor}={}) {
  const readOnly=['inspect','context','checkpoint','inbox'].includes(args.action);
  if(!readOnly)requireText(args.source_instruction,'source_instruction',4000);
  const result=withStore(args.root,db=>{
    requireTaskStorage(db);
    if(!['submit','amend','cancel','inspect','context','checkpoint','message','inbox','dispose'].includes(args.action))throw Error('Unknown async task action');
    if(!readOnly&&!db.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='async_task_index'").get())throw Error('Initialize the runtime with company_runtime start before submitting tasks');
    return db.readSnapshot(()=>{
      const requested=[args.task_id,args.to_task_id,...(args.spec?.depends_on??[]).map(d=>d.task_id),args.spec?.review_task_id].filter(Boolean);
      const loaded=readTaskState(db,{task_ids:requested,message_ids:args.message_id?[args.message_id]:[],include_messages:false,limit:Math.min(args.limit??12,100),cursor:args.action==='context'?'':args.cursor??'',semantic:args.action==='context'});
      if(readOnly){
        if(args.action==='context'){
          // Scope membership and its cursor belong to the same semantic
          // projection. Filtering one unrelated SQL page can otherwise emit a
          // zero-progress partial page with no usable continuation.
          return portfolioContext(loaded.state,{task_ids:args.task_id?[args.task_id]:undefined,scope:args.context_scope,limit:args.limit??12,budget:args.budget,cursor:args.cursor||undefined});
        }
        if(args.action==='checkpoint')return taskCheckpoint(loaded.state,taskRecord(loaded.state,args.task_id));
        if(args.action==='inbox'){
          const page=messageKeys(db,args.task_id,{after:args.after??null,limit:args.limit??20});
          const inbox=readTaskState(db,{task_ids:[args.task_id],message_ids:page.ids,include_messages:false}).state;
          const result={task_id:args.task_id,total:page.total,returned:page.ids.length,complete:page.complete,next_cursor:page.cursor,items:page.ids.map(key=>{const r=inbox.records[key];return {id:r.id,revision:r.revision,status:r.runtime_message.state,from_task_id:r.runtime_message.from_task_id,to_task_id:r.runtime_message.to_task_id,content_preview:r.content.slice(0,160),source:source(r),content_complete:false};})};
          result.rule='Preview delivery is not processing. Retrieve exact message bodies through company_context before disposition.';
          return result;
        }
        const ids=args.task_id?[args.task_id]:loaded.page.ids,result={protocol:'async-tasks-v1',runtime:viewControl(loaded.state,db),tasks:[],total:args.task_id?1:loaded.page.total,complete:false,next_cursor:null};
        for(const key of ids){const item=compactTask(taskRecord(loaded.state,key),loaded.state);if(Buffer.byteLength(JSON.stringify({...result,tasks:[...result.tasks,item]}))>16000)break;result.tasks.push(item);}
        result.complete=result.tasks.length===ids.length&&Boolean(args.task_id||loaded.page.complete);
        result.next_cursor=result.complete?null:result.tasks.length?taskCursor(db,result.tasks.at(-1).id):null;
        if(!result.tasks.length&&ids.length)result.hold='Task brief exceeds the bounded reply; read the exact task source.';
        return result;
      }
      // End the read snapshot before acquiring the write transaction below.
      return {writeState:extraRecords(db,loaded.state,args,host)};
    });
  });
  if(!result.writeState)return result;
  const written=withStore(args.root,db=>selected(db,'task.'+args.action,result.writeState,state=>{
    let r;
    if(args.action==='submit')r=submitTask(state,args,host);
    else if(args.action==='amend')r=amendTask(state,args,host);
    else if(args.action==='cancel')r=cancelTask(state,args,host);
    else if(args.action==='message')r=sendTaskMessage(state,args,host);
    else r=disposeTaskMessage(state,args,host);
    return r.runtime_task?compactTask(r):{id:r.id,status:r.status,revision:r.revision,source:source(r)};
  }));
  registered.add(folder(args.root));
  let wakeup;try{wakeup=wake(args.root);}catch(e){wakeup={started:false,needs_attention:e.message};}
  return {...written,wakeup};
}
export function runtimeAction(args,host,{launch=launchSupervisor}={}) {
  if(args.action==='status')return withStore(args.root,db=>{
    const state=db.readSelected({rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:[RUNTIME_CONTROL_ID]}}),view=viewControl(state,db);
    try{const {page}=readTaskState(db,{active:true,limit:100,include_messages:false});return {protocol:'async-runtime-v1',...view,active_tasks:page.total,complete:page.complete};}
    catch(error){return {protocol:'async-runtime-v1',...view,state:'needs_attention',active_tasks:null,complete:false,index_error:String(error.message).slice(0,1000)};}
  });
  if(!['start','stop','reconcile'].includes(args.action))throw Error('Runtime action must be start, stop, status or reconcile');
  if(!Number.isInteger(args.epoch))throw Error('Supply current ownership epoch');
  withStore(args.root,db=>{
    requireTaskStorage(db);
    const s=db.readSelected({rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:[RUNTIME_CONTROL_ID]}});owner(s,args.session_id,host,args.epoch);
    if(args.action==='start'||args.action==='stop'&&!db.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='async_index_meta'").get())installTaskIndex(db);
    // Lifecycle control is independent of task-index health. In particular,
    // stop must never be held by a corrupt disposable task index.
    if(args.action!=='reconcile')db.selectedTransaction('runtime.'+args.action,options(s),state=>setRuntimeControl(state,args,host));
  });
  registered.add(folder(args.root));
  if(args.action==='reconcile')return tickRuntime(args.root,{dispatch:false});
  const wakeup=args.action==='start'?ensureSupervisor(args.root,{launch}):{started:false,reason:'stop recorded; workers retain their own closure evidence'};
  return {...runtimeAction({...args,action:'status'},host),wakeup};
}
function launchSupervisor(root,instance){return spawn(process.execPath,['--no-warnings',path.join(PACKAGE,'runtime/supervisor.mjs'),root,instance],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_SUPERVISOR:'1'}});}
export function ensureSupervisor(root,{launch=launchSupervisor}={}) {
  const control=withStore(root,db=>{const state=db.readPublicSelected({rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:[RUNTIME_CONTROL_ID]}});try{const c=runtimeControl(state,{enabled:true}).runtime_control;const lease=db.db.prepare('SELECT pid,heartbeat_at FROM async_runtime_lease WHERE instance_id=?').get(c.instance_id);return {...c,heartbeat_at:lease?.heartbeat_at};}catch{return null;}});
  if(!control)return {started:false,reason:'runtime not enabled or company held'};
  if(control.error)return {started:false,reason:'supervisor needs explicit attention; automatic restart suppressed',error:control.error};
  if(alive(control.pid))return {started:false,reason:Date.now()-Date.parse(control.heartbeat_at??0)<10000?'supervisor observed live':'supervisor process outcome needs inspection; no duplicate started'};
  const child=launch(folder(root),control.instance_id);child.on('error',()=>{});child.unref();
  return {started:true,instance_id:control.instance_id,pid:child.pid??null,native_identity:'not_applicable_software_process'};
}
export function claimSupervisor(root,instance,pid=process.pid) {
  return withStore(root,db=>{
    const state=db.readPublicSelected({rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:[RUNTIME_CONTROL_ID]}});
    const claimed=selected(db,'runtime.claimed',state,s=>{const r=runtimeControl(s,{enabled:true}),c=r.runtime_control;if(c.instance_id!==instance)throw Error('Supervisor generation is superseded');if(c.pid!==pid&&alive(c.pid))return false;c.pid=pid;c.heartbeat_at=stamp();r.updated_at=stamp();r.revision++;return true;});
    if(claimed)db.db.prepare('INSERT INTO async_runtime_lease VALUES(?,?,?) ON CONFLICT(instance_id) DO UPDATE SET pid=excluded.pid,heartbeat_at=excluded.heartbeat_at').run(instance,pid,stamp());
    return claimed;
  });
}
export function supervisorAttention(root,instance,pid,error){
  try{return withStore(root,db=>{
    const selection={rootKeys:TASK_ROOT_KEYS,entities:{upgrade:['id','status'],records:[RUNTIME_CONTROL_ID],notices:null}};
    const observed=db.readSelected(selection),c=runtimeControl(observed).runtime_control;
    if(observed.paused||!c.enabled||c.instance_id!==instance||c.pid!==pid)return false;
    return db.selectedTransaction('runtime.needs_attention',selection,s=>{
      const r=runtimeControl(s),current=r.runtime_control;
      if(s.paused||!current.enabled||current.instance_id!==instance||current.pid!==pid)throw Error('Supervisor generation changed before fatal disposition');
      current.error=String(error?.message??error).slice(0,1000);r.revision++;r.updated_at=stamp();
      notice(s,'must_know','Runtime supervisor needs attention: '+current.error,RUNTIME_CONTROL_ID);return true;
    });
  });}catch{return false;}
}
export function tickRuntime(root,{instance=null,pid=process.pid,dispatch=true,cursor='',queue}={}) {
  const summary=withStore(root,db=>{
    const loaded=readTaskState(db,{active:true,limit:100,cursor,live:true,include_messages:false});
    const calculate=(s,verify=false)=>{
      const r=runtimeControl(s,{enabled:dispatch}),c=r.runtime_control;
      if(instance&&(c.instance_id!==instance||c.pid!==pid))throw Error('Supervisor lease or generation changed');
      const ready=[];let changed=false;
      for(const key of loaded.page.ids){
        const task=taskRecord(s,key),before=JSON.stringify(task);
        for(const attempt of task.runtime_task.attempts){
          const job=s.jobs?.[attempt.job_id];if(!job||!['queued','running'].includes(job.status))continue;
          const timing=jobTimeoutState(job,Date.now());
          if(['overdue','inspection'].includes(timing.state)){
            job.status='interrupted';job.finished_at=stamp();job.timeout_reconciliation={...timing,at:stamp(),termination_confirmed:false};
            job.error='Async attempt timing requires reconciliation; process closure is unverified';changed=true;
          }
        }
        const completed=s.jobs?.[task.runtime_task.attempts[0]?.job_id];
        if(verify&&completed?.status==='completed'&&completed.context_sha256&&!contextMatches(s,completed,completed.context_sha256)){
          task.runtime_task.state='needs_attention';task.runtime_task.attention_code='CONTEXT_CHANGED';task.runtime_task.attention='Completed result context changed before runtime acceptance';task.status='Async:needs_attention';task.revision++;task.updated_at=stamp();
        }else reconcileTask(s,task);
        if(task.runtime_task.state==='planned'){
          const status=taskReady(s,task);
          if(status.ready)ready.push(key);
        }
        if(before!==JSON.stringify(task)){changed=true;if(task.runtime_task.state==='needs_attention')notice(s,'must_know','Async task needs CoS attention: '+(task.runtime_task.attention??'inspect exact task'),key);}
      }
      return {ready,next_cursor:loaded.page.cursor,complete:loaded.page.complete,active_tasks:loaded.page.total,changed};
    };
    const observed=calculate(loaded.state);
    // Heartbeat is disposable host-liveness metadata, never company meaning or
    // execution permission. It does not advance the canonical event stream or
    // invalidate every worker's context on each idle poll.
    if(instance)db.db.prepare('UPDATE async_runtime_lease SET heartbeat_at=? WHERE instance_id=? AND pid=?').run(stamp(),instance,pid);
    if(!observed.changed)return observed;
    let persisted;
    db.transaction('runtime.reconciled',s=>{persisted=calculate(s,true);return s;},{afterWrite:updateTaskIndex});
    return persisted;
  });
  const dispatched=[];
  if(dispatch){
    for(const key of summary.ready){
      try{if(!queue)throw Error('A supervisor dispatch function is required');dispatched.push(queue(root,key,instance?{runtime_instance_id:instance,supervisor_pid:pid}:{}));}
      catch(e){
        const recovery=schedulingRecovery(e);
        if(recovery.code==='GENERATION_CHANGED')throw e;
        if(recovery.automatic)continue;
        withStore(root,db=>{const {state}=readTaskState(db,{task_ids:[key],limit:1});selected(db,'task.attention',state,s=>{const c=runtimeControl(s,{enabled:true}).runtime_control;if(instance&&(c.instance_id!==instance||c.pid!==pid))throw Error('Supervisor generation changed while handling dispatch failure');const r=taskRecord(s,key);if(r.runtime_task.state==='planned'){r.runtime_task.state='needs_attention';r.runtime_task.attention_code=recovery.code;r.runtime_task.attention=String(e.message).slice(0,1000);r.status='Async:needs_attention';r.revision++;r.updated_at=stamp();notice(s,'must_know','Async task could not start: '+r.runtime_task.attention,r.id);}return null;});});
      }
    }
  }
  return {...summary,dispatched};
}
export function watchRuntimeHosts(root) {
  if(root&&fs.existsSync(path.join(root,'.company','company.sqlite')))registered.add(folder(root));
  for(const entry of registered){try{ensureSupervisor(entry);}catch{}}
  const timer=setInterval(()=>{for(const entry of registered){try{ensureSupervisor(entry);}catch{}}},2000);timer.unref();return ()=>clearInterval(timer);
}
