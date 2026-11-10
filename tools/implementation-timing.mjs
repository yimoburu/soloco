// Read-only accounting of explicitly supplied observations. This report neither
// creates an execution receipt nor grants acceptance, retry or spending authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const TIMING_PROTOCOL='implementation-timing-events-v1';
export const TIMING_PHASES=['queued','preparation','execution','test','qa','acceptance','merge','install','adoption'];
const outcomes=['running','completed','failed','blocked','cancelled'];
const need=(condition,message)=>{if(!condition)throw Error('Implementation timing: '+message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
const key=v=>JSON.stringify([v.task_id,v.attempt_id]);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fields=(v,required,optional=[])=>{
 need(object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k)),'invalid fields');
};
function timestamp(v){
 need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v),'timestamps require UTC ISO seconds or milliseconds');
 const n=Date.parse(v),normalized=v.includes('.')?v:v.slice(0,-1)+'.000Z';
 need(Number.isFinite(n)&&new Date(n).toISOString()===normalized,'invalid timestamp');return n;
}
function source(v,seen){
 fields(v,['id','sha256','field']);
 need(text(v.id)&&text(v.field)&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256),'invalid attributable source reference');
 const id=JSON.stringify([v.id,v.sha256,v.field]);need(!seen.has(id),'duplicate source observation');seen.add(id);
}
function union(ranges){
 let occupied=0,end=-Infinity;
 for(const [start,finish]of ranges.toSorted((a,b)=>a[0]-b[0])){occupied+=Math.max(0,finish-Math.max(start,end));end=Math.max(end,finish);}
 return occupied;
}
function intervals(spans){
 const completed=spans.filter(s=>s.duration_ms!==null),complete=spans.length>0&&completed.length===spans.length;
 const clocks=new Set(spans.map(s=>s.clock_id));
 const basis=complete&&clocks.size===1?(spans.every(s=>s.monotonic_start_ms!==null&&s.monotonic_finish_ms!==null)?'monotonic':'wall'):null;
 const ranges=basis?spans.map(s=>basis==='monotonic'?[s.monotonic_start_ms,s.monotonic_finish_ms]:[s.wall_start_ms,s.wall_finish_ms]):[];
 const work=complete?(basis?ranges.reduce((n,[a,b])=>n+b-a,0):spans.reduce((n,s)=>n+s.duration_ms,0)):null;
 const occupied=basis?union(ranges):null;
 // A mixed monotonic/wall group uses one wall basis for both work and union.
 return {spans:spans.length,completed_spans:completed.length,incomplete_spans:spans.length-completed.length,work_ms:work,
  occupied_ms:occupied,overlap_work_ms:basis?work-occupied:null,overlap_clock:basis};
}
const percentile=(values,p)=>values.length?values.toSorted((a,b)=>a-b)[Math.ceil(p*values.length)-1]:null;

export function reportImplementationTiming(input){
 fields(input,['protocol','measurement_kind','attempts','events']);
 need(input.protocol===TIMING_PROTOCOL&&['observed','synthetic'].includes(input.measurement_kind),'unsupported protocol or measurement kind');
 need(Array.isArray(input.attempts)&&Array.isArray(input.events),'attempts and events must be arrays');
 const attempts=new Map(),evidence=new Set(),events=new Set(),spanMap=new Map();
 for(const a of input.attempts){
  fields(a,['task_id','attempt_id','comparison_key','outcome','source'],['rework_of']);
  need(text(a.task_id)&&text(a.attempt_id)&&text(a.comparison_key)&&outcomes.includes(a.outcome),'invalid attempt identity, comparison key or outcome');
  need(!attempts.has(key(a)),'duplicate attempt');source(a.source,evidence);attempts.set(key(a),a);
 }
 for(const a of attempts.values())if(Object.hasOwn(a,'rework_of')){
  need(text(a.rework_of)&&a.rework_of!==a.attempt_id,'invalid rework predecessor');
  const previous=attempts.get(key({...a,attempt_id:a.rework_of}));need(previous&&['failed','blocked','cancelled'].includes(previous.outcome),'rework must name a supplied adverse attempt of the same task');
  const visited=new Set([a.attempt_id]);let p=previous;
  while(p){need(!visited.has(p.attempt_id),'cyclic rework lineage');visited.add(p.attempt_id);p=p.rework_of===undefined?null:attempts.get(key({...p,attempt_id:p.rework_of}));}
 }
 for(const e of input.events){
  fields(e,['id','task_id','attempt_id','span_id','phase','event','at','clock_id','source'],['monotonic_ms']);
  need(text(e.id)&&text(e.span_id)&&text(e.clock_id)&&attempts.has(key(e))&&TIMING_PHASES.includes(e.phase)&&['start','finish'].includes(e.event),'invalid event identity or phase');
  need(!events.has(e.id),'duplicate event id');events.add(e.id);source(e.source,evidence);
  const at=timestamp(e.at);if(Object.hasOwn(e,'monotonic_ms'))need(Number.isFinite(e.monotonic_ms)&&e.monotonic_ms>=0,'invalid monotonic observation');
  const id=JSON.stringify([e.task_id,e.attempt_id,e.span_id]),span=spanMap.get(id)??{task_id:e.task_id,attempt_id:e.attempt_id,span_id:e.span_id,phase:e.phase};
  need(span.phase===e.phase&&!span[e.event],'duplicate or inconsistent span event');span[e.event]={...e,wall_ms:at};spanMap.set(id,span);
 }
 const spans=[...spanMap.values()].map(s=>{
  const {start,finish}=s,clocksMatch=start&&finish&&start.clock_id===finish.clock_id;
  if(clocksMatch){need(finish.wall_ms>=start.wall_ms,'finish precedes start');if(start.monotonic_ms!==undefined&&finish.monotonic_ms!==undefined)need(finish.monotonic_ms>=start.monotonic_ms,'monotonic finish precedes start');}
  const mono=clocksMatch&&start.monotonic_ms!==undefined&&finish.monotonic_ms!==undefined;
  return {span_id:s.span_id,task_id:s.task_id,attempt_id:s.attempt_id,phase:s.phase,clock_id:clocksMatch?start.clock_id:null,
   duration_ms:clocksMatch?(mono?finish.monotonic_ms-start.monotonic_ms:finish.wall_ms-start.wall_ms):null,duration_clock:clocksMatch?(mono?'monotonic':'wall'):null,
   wall_start_ms:start?.wall_ms??null,wall_finish_ms:finish?.wall_ms??null,monotonic_start_ms:start?.monotonic_ms??null,monotonic_finish_ms:finish?.monotonic_ms??null,
   incomplete_reason:!start?'missing_start':!finish?'missing_finish':!clocksMatch?'different_clocks':null,
   source_events:[start?.id,finish?.id].filter(Boolean)};
 });
 const reports=[...attempts.values()].map(a=>{
  const selected=spans.filter(s=>key(s)===key(a)),complete=selected.length>0&&selected.every(s=>s.duration_ms!==null),clocks=new Set(selected.map(s=>s.clock_id));
  const wall=complete&&clocks.size===1?Math.max(...selected.map(s=>s.wall_finish_ms))-Math.min(...selected.map(s=>s.wall_start_ms)):null;
  const phases=Object.fromEntries(TIMING_PHASES.map(phase=>[phase,intervals(selected.filter(s=>s.phase===phase))]));
  return {...a,complete_observed_spans:complete,wall_elapsed_ms:wall,wall_clock_id:wall===null?null:selected[0].clock_id,
   queued_work_ms:phases.queued.work_ms,queued_occupied_ms:phases.queued.occupied_ms,phases,spans:selected};
 });
 const comparisons=[...new Set(reports.map(a=>a.comparison_key))].map(comparison_key=>{
  const group=reports.filter(a=>a.comparison_key===comparison_key),values=group.filter(a=>a.outcome==='completed'&&a.complete_observed_spans&&a.wall_elapsed_ms!==null).map(a=>a.wall_elapsed_ms);
  return {comparison_key,reported_attempts:group.length,completed_samples:values.length,percentile_method:'nearest-rank',p50_wall_elapsed_ms:percentile(values,.5),p95_wall_elapsed_ms:percentile(values,.95)};
 });
 return {protocol:'implementation-timing-report-v1',measurement_kind:input.measurement_kind,input_sha256:hash(input),attempts:reports,comparisons,
  summary:{attempts:reports.length,adverse_attempts:reports.filter(a=>['failed','blocked','cancelled'].includes(a.outcome)).length,explicit_rework_attempts:reports.filter(a=>a.rework_of!==undefined).length},
  limitations:['Only supplied attributable observations are counted; absent phases and open spans remain unknown. Wall elapsed is the window from the first supplied start to the last supplied finish, not proof that the entire implementation lifecycle was observed.',
   'Wall elapsed spans use one declared clock. Monotonic values are compared only within that same clock; clock identities and source authenticity are supplied, not verified here.',
   'Accumulated phase work, occupied time and end-to-end wall elapsed are different quantities. Different clocks cannot establish overlap.',
   'Completed outcomes and comparison keys are supplied labels, not proof of native QA, owner acceptance, equal workloads, quality, retry authority or release readiness.',
   'Sample percentiles use nearest-rank (sorted index ceil(p*N)-1), not an interpolated median, and are descriptive, including synthetic samples; no production speedup, founder effort, cost or business outcome is inferred.']};
}

const usage=`Usage: node tools/implementation-timing.mjs INPUT.json
Read-only report to stdout; does not modify the input or company state.
Input protocol: ${TIMING_PROTOCOL}; measurement_kind: observed | synthetic.
attempts: [{task_id,attempt_id,comparison_key,outcome,source,rework_of?}]
events: [{id,task_id,attempt_id,span_id,phase,event,at,clock_id,source,monotonic_ms?}]
source: {id,sha256,field}; each source field is one unique observation.
event: start | finish; at: UTC ISO timestamp; clock_id: actual process/clock origin.
phases: ${TIMING_PHASES.join(', ')}.
outcomes: ${outcomes.join(', ')}. A completed label grants no acceptance.
Percentiles use nearest-rank: sorted index ceil(p*N)-1, without interpolation.\n`;
function readInput(file){
 // A FIFO must not block before validation, and a frozen input is an explicit
 // regular file rather than a symlink to changing external state.
 const fd=fs.openSync(path.resolve(file),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 let bytes;try{need(fs.fstatSync(fd).isFile(),'input must be a regular JSON file');bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 const value=bytes.toString('utf8');need(Buffer.from(value,'utf8').equals(bytes),'input must be valid UTF-8 JSON');return JSON.parse(value);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length===3&&['--help','-h'].includes(process.argv[2]))process.stdout.write(usage);
  else{need(process.argv.length===3,usage);process.stdout.write(JSON.stringify(reportImplementationTiming(readInput(process.argv[2])),null,2)+'\n');}}
 catch(error){console.error(error.message);process.exitCode=1;}
}
