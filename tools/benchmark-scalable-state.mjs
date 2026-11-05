// Disposable fictional fixtures only. This measures runtime work, not LLM quality,
// billed tokens, provider usage, or production latency. Run with Node >=22.13.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {recordReference,contextPlan,contextRead} from '../plugins/soloco/runtime/current-state.mjs';
import {buildEvidence,evidencePage} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';

const protocol={
  version:1,
  declared_before_trials:true,
  archive_counts:[10,100,1000],
  active_obligations:4,
  read_iterations:30,
  token_iterations:300,
  small_write_iterations:15,
  fixed_supplemental_reads:1,
  acceptance:{obligation_recall:1,bounded_context_max_growth_ratio:1.1,
    current_upgrade_max_growth_ratio:1.1,backup_readback_exact:true,
    stale_acceptance_rejected:true,archive_payload_unchanged:true},
  timing_acceptance:'Diagnostic distributions only; no timing pass threshold or production speedup claim',
  actual_model_calls:0,
  actual_model_tokens:null,
  model_quality_evaluation:'Not performed by this deterministic benchmark',
  bootstrap_cost:'Fixture classifications stand in for already retained independent review; no bootstrap work is hidden as model savings',
};
const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-scalability-bench-')));
function timed(fn,n=1){const samples=[];let result;for(let i=0;i<n;i++){const start=performance.now();result=fn(i);samples.push(performance.now()-start);}const sorted=[...samples].sort((a,b)=>a-b);return {result,samples_ms:samples,median_ms:sorted[Math.floor(sorted.length/2)],p95_ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]};}
const timing=result=>({median_ms:result.median_ms,p95_ms:result.p95_ms,iterations:result.samples_ms.length});
function classify(s,source,key=source.id){
  const p={id:'plan-'+key,kind:'plan',revision:1,author_instance:'fixture-cos',context_classification_plan:contextPlan(s,{record_ids:[key],disposition:'resolved'})};s.records[p.id]=p;
  const q={id:'qa-'+key,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:'fixture-reviewer-'+key,job_id:'job-'+key,review_of:{id:p.id,revision:1},review:{verdict:'Pass',permitted_action:'apply_context_classification',plan_sha256:digest(JSON.stringify(p.context_classification_plan)),blockers:[]}};
  s.records[q.id]=q;s.jobs[q.job_id]={id:q.job_id,role:'qa',instance_id:q.author_instance,native_id:'fixture-independent-native-'+key,status:'completed',artifact_id:q.id};
  (s.context_classifications??={})[key]={source:recordReference(source,key),plan:recordReference(p),review:recordReference(q),disposition:'resolved',roles:[],scopes:[]};
}
function seed(n){
  const s={id:'fictional-company',name:'Fictional fixture',revision:1,roles:{engineer:{name:'Engineer'}},records:{},jobs:{},sessions:{},messages:[],notices:[],upgrade_history:[],governance:'Fictional fixture authority only',owner:{session_id:'fixture-cos',epoch:1},paused:true};
  for(let i=0;i<n;i++){
    const r={id:'archive-'+i,kind:'decision',revision:1,content:'Resolved fictional source '+i+' '+('unique history '+i+' ').repeat(60)};s.records[r.id]=r;classify(s,r);
    const u={id:'upgrade-'+i,status:'recovered',calls:[{text:'Retained fictional historical attempt '+i+' '+('original bytes '+i+' ').repeat(30)}]};s.upgrade_history.push(u);classify(s,u,'upgrade:'+u.id);
  }
  for(const [i,content] of ['Old restriction: no external exposure','Withdrawn grant: no spending','Reopened work: parser repair pending','Uncertain external outcome: reconcile before retry'].entries())s.records['open-'+i]={id:'open-'+i,kind:'decision',revision:1,content};
  return s;
}
function upgrade(s,currentState){const checkpoint={...s};delete checkpoint.upgrade_history;const start=performance.now();const subject=buildEvidence(checkpoint,s.upgrade_history,{currentState});const pages=subject.pages.map(p=>evidencePage(subject,p).text);return {elapsed_ms:performance.now()-start,pages:pages.length,delivered_page_characters:pages.reduce((n,p)=>n+p.length,0),mandatory_cos_qa_page_visits:pages.length*2,model_calls_executed:0};}
const rows=[];
try{
  for(const n of protocol.archive_counts){
    const s=seed(n),root=path.join(work,'source-'+n);fs.mkdirSync(root);
    const db=new Store(root,true);db.transaction('fixture.seed',()=>s);
    const serialize=timed(()=>JSON.stringify(s),protocol.read_iterations);
    const baselineRead=timed(()=>db.read(),protocol.read_iterations);
    const before=JSON.stringify(db.read()),migration=timed(()=>db.migrate());assert.equal(JSON.stringify(db.read()),before);
    const current=assignmentContext(s,{id:'active',role:'engineer',context_format:3,inputs:[],task:'Repair parser under all current obligations'});
    const recall=['open-0','open-1','open-2','open-3'].filter(id=>current.inputs.some(r=>r.id===id)).length/4;assert.equal(recall,1);
    let legacy;try{legacy={characters:assignmentContext(s,{id:'active',role:'engineer',context_format:2,inputs:[],task:'Repair parser under all current obligations'}).text.length,overflow:false};}catch(e){assert.match(e.message,/exceeds/);legacy={characters:null,overflow:true,reason:e.message};}
    const source=s.records['archive-0'],raw=JSON.stringify(source),retrieved=contextRead(s,{...recordReference(source),length:raw.length});assert.equal(retrieved.text,raw);
    const job={id:'active',role:'engineer',context_format:3,inputs:[],task:'Repair parser under all current obligations',retrieved_inputs:[recordReference(source)]};s.jobs.active=job;assert.equal(contextMatches(s,job,current.hash),true);source.content+=' changed';assert.equal(contextMatches(s,job,current.hash),false);source.content=source.content.slice(0,-8);
    const read=timed(()=>db.read(),protocol.read_iterations);
    const selected=timed(()=>db.readSelected({rootKeys:['revision','owner','paused'],entities:{records:['open-0'],jobs:[]}}),protocol.read_iterations);
    const idle=timed(()=>db.changeToken(),protocol.token_iterations);
    const threeWatchers=timed(()=>[db.changeToken(),db.changeToken(),db.changeToken()],protocol.token_iterations/3);
    const archiveHash=db.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='archive-0'").get().sha256;
    const writerLocks=[];let lockStart=null;const originalExec=db.db.exec.bind(db.db);
    db.db.exec=sql=>{const result=originalExec(sql);if(sql==='BEGIN IMMEDIATE')lockStart=performance.now();if(sql==='COMMIT'&&lockStart!==null){writerLocks.push(performance.now()-lockStart);lockStart=null;}return result;};
    const writes=timed(i=>db.selectedTransaction('fixture.notice_delivery',{rootKeys:['revision','owner','updated_at'],entities:{notices:null}},state=>{state.notices=[{id:'delivery',deliveries:[{iteration:i}],resolution:null}];return state;}),protocol.small_write_iterations);
    db.db.exec=originalExec;
    assert.equal(db.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='archive-0'").get().sha256,archiveHash);
    const token=db.changeToken();db.selectedTransaction('fixture.pause',{rootKeys:['revision','owner','paused'],entities:{}},state=>{state.paused=false;return state;});assert.ok([db.changeToken(),db.changeToken(),db.changeToken()].every(v=>v>token));
    const backupDir=path.join(work,'backup-'+n),backup=timed(()=>backupCompany(db,backupDir));
    const restoredDir=path.join(work,'restored-'+n),restore=timed(()=>restoreCompany(backupDir,restoredDir)),restored=new Store(restoredDir);assert.equal(digest(JSON.stringify(restored.read())),backup.result.state_sha256);restored.close();
    const baselineUpgrade=upgrade(s,false),currentUpgrade=upgrade(s,true);
    const memory=process.memoryUsage(),fileBytes=name=>{const file=path.join(root,'.company',name);return fs.existsSync(file)?fs.statSync(file).size:0;};
    const row={archive_scale:n/10,archive_decisions:n,historical_attempts:n,stored_json_bytes:Buffer.byteLength(before),ordinary:{legacy,bounded_characters:current.text.length,obligation_recall:recall,retrieval_characters:retrieved.text.length,stale_supplement_rejected:true},upgrade:{baseline:baselineUpgrade,current:currentUpgrade},storage:{legacy_full_read:timing(baselineRead),full_json_serialization:timing(serialize),normalized_full_read:timing(read),normalized_selected_read:timing(selected),idle_event_token:timing(idle),three_simulated_watcher_tokens:timing(threeWatchers),notice_selected_write:timing(writes),notice_writer_lock_ms:writerLocks,db_file_bytes:fileBytes('company.sqlite'),wal_file_bytes:fileBytes('company.sqlite-wal'),immutable_value_count:db.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n,process_memory_snapshot_bytes:{rss:memory.rss,heap_used:memory.heapUsed},migration_ms:migration.median_ms,backup_ms:backup.median_ms,restore_ms:restore.median_ms,exact_restore:true,archive_payload_unchanged:true,all_simulated_watchers_observed_change:true}};
    rows.push(row);db.close();
  }
  assert.ok(rows.at(-1).ordinary.bounded_characters/rows[0].ordinary.bounded_characters<=protocol.acceptance.bounded_context_max_growth_ratio);
  assert.ok(rows.at(-1).upgrade.current.delivered_page_characters/rows[0].upgrade.current.delivered_page_characters<=protocol.acceptance.current_upgrade_max_growth_ratio);
  process.stdout.write(JSON.stringify({protocol,environment:{node:process.version,platform:process.platform,arch:process.arch,os_release:os.release()},rows,limitations:['Scripted exact-provenance fixture dispositions are not live independent model review.','Page visits are deterministic planned delivery counts, not executed model calls, reported tokens or billed usage.','Watcher checks simulate three token readers; they are not three real worker sessions or cancellation-latency evidence.','Backup scope is .company plus explicitly selected external artifacts; completeness of prose references requires separate review.','These local measurements provide no statistical production latency, hardware-capacity, or time-to-accepted-outcome guarantee.']},null,2)+'\n');
}finally{fs.rmSync(work,{recursive:true,force:true});}
