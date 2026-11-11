// Read-only timing CLI; the pure reporter also ships in the runtime package.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TIMING_PROTOCOL,TIMING_PHASES,reportImplementationTiming} from '../plugins/soloco/runtime/implementation-observations.mjs';
export {TIMING_PROTOCOL,TIMING_PHASES,reportImplementationTiming};
const need=(v,m)=>{if(!v)throw Error('Implementation timing: '+m);};
const outcomes=['running','completed','failed','blocked','cancelled'];

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
