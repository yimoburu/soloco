import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {TIMING_PROTOCOL,reportImplementationTiming} from '../tools/implementation-timing.mjs';

const source=field=>({id:'fixture',sha256:'a'.repeat(64),field});
const at=n=>new Date(Date.UTC(2026,10,10)+n).toISOString();
function fixture(){return {protocol:TIMING_PROTOCOL,measurement_kind:'synthetic',attempts:[{task_id:'task',attempt_id:'first',comparison_key:'same-frozen-subject',outcome:'completed',source:source('outcome')}],events:[]};}
function span(input,id,phase,start,finish,{attempt='first',clock='process-one',monotonic=true}={}){
 for(const [event,ms]of [['start',start],['finish',finish]])if(ms!==undefined)input.events.push({id:id+'-'+event,task_id:'task',attempt_id:attempt,span_id:id,phase,event,at:at(ms),clock_id:clock,source:source(id+'-'+event),...(monotonic?{monotonic_ms:ms}:{})});
 return input;
}

test('separates phase work, occupied overlap and end-to-end elapsed without mutating observations',()=>{
 const input=span(span(span(fixture(),'queue','queued',0,10),'model-a','execution',10,30),'model-b','execution',20,40),before=JSON.stringify(input),r=reportImplementationTiming(input),a=r.attempts[0];
 assert.equal(a.wall_elapsed_ms,40);assert.equal(a.queued_work_ms,10);assert.equal(a.queued_occupied_ms,10);
 assert.deepEqual(a.phases.execution,{spans:2,completed_spans:2,incomplete_spans:0,work_ms:40,occupied_ms:30,overlap_work_ms:10,overlap_clock:'monotonic'});
 assert.equal(a.phases.qa.work_ms,null);assert.equal(a.phases.qa.occupied_ms,null);assert.equal(JSON.stringify(input),before);
 assert.equal(r.measurement_kind,'synthetic');assert.equal(r.comparisons[0].completed_samples,1);
 assert.equal(r.comparisons[0].p95_wall_elapsed_ms,40);
});

test('missing starts, finishes, phases and mixed clocks retain unknown durations',()=>{
 const input=span(span(span(fixture(),'no-finish','qa',5,undefined),'no-start','acceptance',undefined,20),'different','merge',30,40);
 input.events.at(-1).clock_id='a-different-process';
 const a=reportImplementationTiming(input).attempts[0];
 assert.equal(a.wall_elapsed_ms,null);assert.equal(a.queued_work_ms,null);assert.equal(a.queued_occupied_ms,null);assert.equal(a.phases.qa.work_ms,null);
 assert.deepEqual(a.spans.map(s=>s.incomplete_reason),['missing_finish','missing_start','different_clocks']);
 assert.equal(reportImplementationTiming(input).comparisons[0].completed_samples,0);
});

test('wall-only observations are explicitly labeled and disjoint clock spans cannot establish overlap',()=>{
 const input=span(span(fixture(),'a','execution',0,10,{monotonic:false}),'b','execution',5,15,{clock:'other-process',monotonic:false});
 const a=reportImplementationTiming(input).attempts[0];
 assert.equal(a.spans[0].duration_clock,'wall');assert.equal(a.phases.execution.work_ms,20);
 assert.equal(a.phases.execution.occupied_ms,null);assert.equal(a.phases.execution.overlap_work_ms,null);assert.equal(a.wall_elapsed_ms,null);
});

test('overlapping queue work is distinct from occupied queue time, which is unknown across clocks',()=>{
 const input=span(span(fixture(),'queue-a','queued',0,10),'queue-b','queued',5,15);
 const a=reportImplementationTiming(input).attempts[0];
 assert.equal(a.queued_work_ms,20);assert.equal(a.queued_occupied_ms,15);
 assert.equal(Object.hasOwn(a,'queued_wait_ms'),false);
 for(const e of input.events.filter(e=>e.span_id==='queue-b'))e.clock_id='another-process';
 const b=reportImplementationTiming(input).attempts[0];
 assert.equal(b.queued_work_ms,20);assert.equal(b.queued_occupied_ms,null);
 assert.equal(b.phases.queued.overlap_work_ms,null);assert.equal(b.wall_elapsed_ms,null);
});

test('mixed clock bases use one wall basis for aggregate work and overlap; no events are not a zero-duration completion',()=>{
 const input=span(span(fixture(),'a','execution',0,10),'b','execution',5,15,{monotonic:false});
 input.events.find(e=>e.id==='a-finish').monotonic_ms=9;
 const a=reportImplementationTiming(input).attempts[0];
 assert.equal(a.spans[0].duration_ms,9);assert.equal(a.phases.execution.work_ms,20);
 assert.equal(a.phases.execution.occupied_ms,15);assert.equal(a.phases.execution.overlap_work_ms,5);assert.equal(a.phases.execution.overlap_clock,'wall');
 const empty=reportImplementationTiming(fixture());assert.equal(empty.attempts[0].wall_elapsed_ms,null);assert.equal(empty.comparisons[0].completed_samples,0);
});

test('failure history and explicit rework remain separate from completed comparable samples',()=>{
 const input=span(fixture(),'failed-model','execution',0,20);input.attempts[0].outcome='failed';
 input.attempts.push({task_id:'task',attempt_id:'second',comparison_key:'same-frozen-subject',outcome:'completed',source:source('second-outcome'),rework_of:'first'});
 span(input,'second-model','execution',30,40,{attempt:'second'});
 input.attempts.push({task_id:'task',attempt_id:'third',comparison_key:'different-subject',outcome:'completed',source:source('third-outcome')});
 span(input,'third-model','execution',50,150,{attempt:'third'});
 const r=reportImplementationTiming(input);
 assert.deepEqual(r.summary,{attempts:3,adverse_attempts:1,explicit_rework_attempts:1});
 assert.equal(r.attempts[0].outcome,'failed');assert.equal(r.attempts[0].wall_elapsed_ms,20);
 assert.deepEqual(r.comparisons[0],{comparison_key:'same-frozen-subject',reported_attempts:2,completed_samples:1,percentile_method:'nearest-rank',p50_wall_elapsed_ms:10,p95_wall_elapsed_ms:10});
 assert.equal(r.comparisons[1].p50_wall_elapsed_ms,100);
});

test('rejects duplicate observation identities or evidence and inconsistent phase pairs',()=>{
 const input=span(fixture(),'one','test',0,10);
 for(const mutate of [v=>v.events.push({...v.events[0]}),v=>v.events[1].source=v.events[0].source,v=>v.events[1].phase='qa',v=>v.attempts.push({...v.attempts[0]})]){
  const changed=structuredClone(input);mutate(changed);assert.throws(()=>reportImplementationTiming(changed),/duplicate|inconsistent/);
 }
});

test('even-sized comparable samples disclose nearest-rank percentiles rather than an interpolated median',()=>{
 const input=span(fixture(),'first-sample','execution',0,10);
 input.attempts.push({task_id:'task',attempt_id:'second',comparison_key:'same-frozen-subject',outcome:'completed',source:source('second-outcome')});
 span(input,'second-sample','execution',20,120,{attempt:'second'});
 const group=reportImplementationTiming(input).comparisons[0];
 assert.equal(group.completed_samples,2);assert.equal(group.percentile_method,'nearest-rank');
 assert.equal(group.p50_wall_elapsed_ms,10);assert.equal(group.p95_wall_elapsed_ms,100);
});

test('rejects malformed, reversed and non-finite timing values rather than manufacturing elapsed time',()=>{
 const input=span(fixture(),'one','test',0,10);
 for(const mutate of [v=>v.events[1].at='2026-02-30T00:00:00.000Z',v=>v.events[1].at=at(-1),v=>v.events[1].monotonic_ms=-1,v=>v.events[1].monotonic_ms=NaN,v=>v.events[0].monotonic_ms=20,v=>v.events[1].at='2026-11-10T00:00:00+00:00']){
  const changed=structuredClone(input);mutate(changed);assert.throws(()=>reportImplementationTiming(changed),/timestamp|precedes|monotonic/);
 }
});

test('rejects rework without an adverse predecessor and cyclic lineage',()=>{
 const input=fixture();input.attempts[0].rework_of='absent';assert.throws(()=>reportImplementationTiming(input),/adverse attempt/);
 input.attempts[0].outcome='failed';input.attempts[0].rework_of='second';input.attempts.push({...input.attempts[0],attempt_id:'second',rework_of:'first',source:source('second-outcome')});
 assert.throws(()=>reportImplementationTiming(input),/cyclic/);
});

test('CLI prints help, reads explicit input unchanged and refuses malformed input',()=>{
 const script=new URL('../tools/implementation-timing.mjs',import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'implementation-timing-'));
 try{
  const help=spawnSync(process.execPath,[script.pathname,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Read-only report/);
  const file=path.join(dir,'events.json'),body=JSON.stringify(span(fixture(),'one','test',0,10));fs.writeFileSync(file,body);
  const good=spawnSync(process.execPath,[script.pathname,file],{encoding:'utf8'});assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).attempts[0].wall_elapsed_ms,10);assert.equal(fs.readFileSync(file,'utf8'),body);
  fs.writeFileSync(file,'{}');const bad=spawnSync(process.execPath,[script.pathname,file],{encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stderr,/invalid fields/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('CLI rejects symlinks, invalid UTF-8 and a directory rather than treating them as frozen JSON',()=>{
 const script=new URL('../tools/implementation-timing.mjs',import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'implementation-timing-io-'));
 const run=file=>spawnSync(process.execPath,[script.pathname,file],{encoding:'utf8',timeout:2000});
 try{
  const file=path.join(dir,'events.json'),body=Buffer.from(JSON.stringify(span(fixture(),'one','test',0,10)));fs.writeFileSync(file,body);
  const link=path.join(dir,'linked.json');fs.symlinkSync(file,link);assert.equal(run(link).status,1);assert.deepEqual(fs.readFileSync(file),body);
  const invalid=Buffer.from(body);invalid[invalid.indexOf(Buffer.from('fixture'))]=255;fs.writeFileSync(file,invalid);
  const bad=run(file);assert.equal(bad.status,1);assert.match(bad.stderr,/valid UTF-8/);
  const directory=run(dir);assert.equal(directory.status,1);assert.match(directory.stderr,/regular JSON file/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('POSIX named pipe input is rejected without waiting for a writer',{skip:process.platform==='win32'},()=>{
 const script=new URL('../tools/implementation-timing.mjs',import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'implementation-timing-fifo-'));
 try{
  const fifo=path.join(dir,'events.pipe');assert.equal(spawnSync('mkfifo',[fifo],{encoding:'utf8',timeout:2000}).status,0);
  const result=spawnSync(process.execPath,[script.pathname,fifo],{encoding:'utf8',timeout:2000});
  assert.equal(result.error,undefined,'FIFO admission must finish before the test deadline');assert.equal(result.status,1);assert.match(result.stderr,/regular JSON file/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
