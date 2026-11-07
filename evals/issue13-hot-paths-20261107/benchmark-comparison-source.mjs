// Actual Store processes against disposable fictional archives. No model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';

const measureSql=!process.argv.includes('--minimal-observation');
const protocol=Object.freeze({version:1,declared_before_trials:true,archive_counts:[10,100,1000],writers:3,writes_per_writer:8,poll_interval_ms:5,sql_result_instrumentation:measureSql,
  acceptance:{lost_or_duplicate_receipts:0,archive_payload_reads_by_children:0,full_state_reads_by_children:0,archive_bytes_changed:false,
    commits_after_pause:0,pause_observation_timeout_ms:5000,trial_timeout_ms:30000},
  timing:'Per-operation diagnostic distributions; timeouts detect nontermination, not production latency targets.',
  exclusions:['No native specialist or model execution','No provider cancellation claim','No semantic classification or company acceptance','No speedup inferred from timing']});
const self=fileURLToPath(import.meta.url),runtime=path.resolve(path.dirname(self),'../plugins/soloco/runtime');
function sourceManifest(){return Object.fromEntries(fs.readdirSync(runtime).filter(n=>n.endsWith('.mjs')).sort().map(n=>[n,digest(fs.readFileSync(path.join(runtime,n)))]));}
function distribution(values){const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,median_ms:sorted[Math.floor(sorted.length/2)]??null,p95_ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]??null,samples_ms:values};}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function instrument(db){
  const metrics={full_state_reads:0,archive_payload_reads:measureSql?0:null,sql_result_bytes:measureSql?0:null,sql_rows:measureSql?0:null,read_ms:[],write_ms:[],writer_lock_ms:[],token_reads:0};
  const originalRead=db.read.bind(db);db.read=(...args)=>{metrics.full_state_reads++;return originalRead(...args);};
  const originalPrepare=db.db.prepare.bind(db.db);
  if(measureSql)db.db.prepare=(...args)=>{
    const statement=originalPrepare(...args);
    const observe=value=>{if(value!==undefined){const raw=JSON.stringify(value);metrics.sql_result_bytes+=Buffer.byteLength(raw);metrics.sql_rows+=Array.isArray(value)?value.length:1;
      if(raw.includes('FICTIONAL-ARCHIVE-BODY-'))metrics.archive_payload_reads++;}return value;};
    return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
      if(key==='get'||key==='all')return (...values)=>observe(value.apply(target,values));
      if(key==='iterate')return function*(...values){for(const row of value.apply(target,values))yield observe(row);};
      return value.bind(target);}});
  };
  const originalExec=db.db.exec.bind(db.db);let lockStart;
  db.db.exec=sql=>{const value=originalExec(sql);if(sql==='BEGIN IMMEDIATE')lockStart=performance.now();
    if(sql==='COMMIT'&&lockStart!==undefined){metrics.writer_lock_ms.push(performance.now()-lockStart);lockStart=undefined;}
    if(sql==='ROLLBACK')lockStart=undefined;return value;};
  return metrics;
}
async function child(root,jobId){
  const db=new Store(root),metrics=instrument(db),selection={rootKeys:['revision','updated_at','owner','paused'],entities:{jobs:[jobId]}};
  try{
    process.send({ready:jobId});await new Promise(resolve=>process.once('message',resolve));
    for(let index=0;index<protocol.writes_per_writer;index++){
      let start=performance.now();const observed=db.readSelected(selection);metrics.read_ms.push(performance.now()-start);
      assert.equal(observed.owner.epoch,1);assert.equal(observed.paused,false);
      start=performance.now();db.selectedTransaction('fixture.hot_path_receipt',selection,state=>{
        assert.equal(state.owner.epoch,1);assert.equal(state.paused,false);assert.equal(state.jobs[jobId].status,'running');
        state.jobs[jobId].receipts.push(index);return state;
      });metrics.write_ms.push(performance.now()-start);await delay(0);
    }
    process.send({written:jobId});const watchStart=performance.now();let token=db.changeToken();metrics.token_reads++;
    while(performance.now()-watchStart<protocol.acceptance.pause_observation_timeout_ms){
      const next=db.changeToken();metrics.token_reads++;
      const state=db.readSelected({rootKeys:['owner','paused'],entities:{}});
      if(state.paused){
        const observed_at=Date.now();assert.equal(state.owner.epoch,1);
        assert.throws(()=>db.selectedTransaction('fixture.forbidden_after_pause',selection,current=>{
          if(current.paused)throw Error('Paused before receipt publication');current.jobs[jobId].receipts.push('forbidden');return current;
        }),/Paused before receipt publication/);
        process.send({result:{jobId,completed:protocol.writes_per_writer,observed_at,pause_token_advanced:next>token,...metrics,
          reads:distribution(metrics.read_ms),writes:distribution(metrics.write_ms),writer_lock:distribution(metrics.writer_lock_ms)}});
        db.close();process.disconnect();return;
      }
      token=next;await delay(protocol.poll_interval_ms);
    }
    throw Error('Pause was not observed before the declared functional timeout');
  }catch(error){try{db.close();}catch{}process.stderr.write(error.stack+'\n');process.exitCode=1;if(process.connected)process.disconnect();}
}
async function trial(work,n){
  const root=path.join(work,String(n));fs.mkdirSync(root);let db=new Store(root,true);const children=[];let timer;
  try{
    const records=Object.fromEntries(Array.from({length:n},(_,i)=>['archive-'+i,{id:'archive-'+i,kind:'artifact',content:'FICTIONAL-ARCHIVE-BODY-'+i+' '+('unique retained history '+i+' ').repeat(40)}]));
    db.transaction('fixture.seed',()=>({id:'fictional-hot-path-'+n,owner:{session_id:'fixture-founder',epoch:1},paused:false,records,
      jobs:Object.fromEntries(Array.from({length:protocol.writers},(_,i)=>['writer-'+i,{id:'writer-'+i,status:'running',receipts:[]}])),notices:[],messages:[],sessions:{}}));
    db.migrate();const archiveHash=digest(JSON.stringify(db.read().records));
    let ready=0,written=0,pauseCommittedAt;const pending=[];
    const results=await Promise.race([
      Promise.all(Array.from({length:protocol.writers},(_,i)=>new Promise((resolve,reject)=>{
        const jobId='writer-'+i,worker=fork(self,['--worker',root,jobId,...(measureSql?[]:['--minimal-observation'])],{silent:true,execArgv:['--no-warnings']});children.push(worker);let result,stderr='';
        worker.stderr.on('data',chunk=>stderr+=chunk);worker.stdout.resume();worker.on('error',reject);
        worker.on('message',message=>{
          try{
            if(message.ready){assert.equal(message.ready,jobId);if(++ready===protocol.writers)for(const participant of children)participant.send({start:true});}
            if(message.written){assert.equal(message.written,jobId);if(++written===protocol.writers){
              db.selectedTransaction('fixture.pause',{rootKeys:['revision','updated_at','owner','paused'],entities:{}},state=>{state.paused=true;return state;});pauseCommittedAt=Date.now();
            }}
            if(message.result)result=message.result;
          }catch(error){reject(error);}
        });
        worker.once('exit',(code,signal)=>{try{assert.equal(code,0,stderr||String(signal));assert.ok(result,'Child closed without a retained measurement');resolve(result);}catch(error){reject(error);}});
        pending.push(worker);
      }))),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Trial exceeded declared functional timeout')),protocol.acceptance.trial_timeout_ms);})
    ]);clearTimeout(timer);
    const state=db.read();assert.equal(digest(JSON.stringify(state.records)),archiveHash);
    for(const job of Object.values(state.jobs))assert.deepEqual(job.receipts,Array.from({length:protocol.writes_per_writer},(_,i)=>i));
    const receiptCount=db.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='fixture.hot_path_receipt'").get().n;
    assert.equal(receiptCount,protocol.writers*protocol.writes_per_writer);
    assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='fixture.forbidden_after_pause'").get().n,0);
    for(const result of results){assert.equal(result.full_state_reads,0);if(measureSql)assert.equal(result.archive_payload_reads,0);
      assert.ok(result.observed_at>=pauseCommittedAt);assert.ok(result.observed_at-pauseCommittedAt<=protocol.acceptance.pause_observation_timeout_ms);}
    return {archive_records:n,archive_scale:n/protocol.archive_counts[0],archive_body_bytes:Buffer.byteLength(JSON.stringify(records)),committed_receipts:receiptCount,
      archive_bytes_unchanged:true,commits_after_pause:0,pause_commit_at:pauseCommittedAt,children_confirmed_closed:results.length,
      measurements:results.map(result=>({...result,pause_observation_ms:result.observed_at-pauseCommittedAt}))};
  }finally{
    clearTimeout(timer);await Promise.all(children.map(child=>new Promise(resolve=>{
      if(child.exitCode!==null||child.signalCode!==null){resolve();return;}child.once('exit',resolve);child.kill('SIGKILL');
    })));db.close();
  }
}
if(process.argv[2]==='--worker')await child(process.argv[3],process.argv[4]);
else{
  const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-hot-path-benchmark-'))),manifest=sourceManifest(),rows=[];
  const report={kind:'fictional_actual_process_storage_growth',protocol,environment:{node:process.version,platform:process.platform,arch:process.arch,os_release:os.release(),
    node_executable_sha256:digest(fs.readFileSync(process.execPath))},benchmark_sha256:digest(fs.readFileSync(self)),runtime_manifest:manifest,rows};
  try{for(const n of protocol.archive_counts)rows.push(await trial(work,n));assert.deepEqual(sourceManifest(),manifest);report.status=measureSql?'passed':'diagnostic_completed';}
  catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
  finally{report.actual_model_calls=0;process.stdout.write(JSON.stringify(report,null,2)+'\n');fs.rmSync(work,{recursive:true,force:true});}
}
