#!/usr/bin/env node
// Frozen export in; bounded read-only observations out. This CLI never opens a
// company Store or authenticates an export as a current runtime observation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {implementationObservations,OBSERVATIONS_PROTOCOL,OBSERVATIONS_INPUT_PROTOCOL} from '../plugins/soloco/runtime/implementation-observations.mjs';
const help=`Usage: node tools/implementation-observations.mjs FROZEN_INPUT.json
No manually assembled phase events are required. Supply protocol
${OBSERVATIONS_INPUT_PROTOCOL}, complete state.jobs/state.records, and origin:
{observed_at:UTC,state_sha256:SHA256(JSON.stringify(state)),collections_complete?:true,
 clock_id?:declared-wall-clock,measurement_kind?:observed|synthetic}.
Optional options: {limit:1..50,offset?:0,cursor?:opaque,include_events?:false,external?:[]}.
External entries: {id,kind:merge|install|escaped_defect|founder_intervention,
 subject_id,value,sha256:SHA256(JSON.stringify(value))}. External producer identity
is unverified. CLI origin is always frozen-export. Reports are paged, <=25000 UTF8
bytes; missing phases, founder time and unobserved quality stay unknown.
Exit0: report; exit2: held/invalid input. No writes, native calls or authority.\n`;
function parseJSON(text){
 let value;try{value=JSON.parse(text);}catch{throw Error('Invalid JSON input');}const stack=[];
 for(let i=0;i<text.length;){const c=text[i];if(c==='"'){const begin=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}const o=stack.at(-1);if(o?.keys&&o.nextKey){const key=JSON.parse(text.slice(begin,i));if(o.keys.has(key))throw Error('Duplicate decoded JSON key');o.keys.add(key);o.nextKey=false;}continue;}if(c==='{')stack.push({keys:new Set(),nextKey:true});else if(c==='[')stack.push({});else if(c==='}'||c===']')stack.pop();else if(c===','&&stack.at(-1)?.keys)stack.at(-1).nextKey=true;i++;}return value;
}
export function implementationObservationsCLI(args){
 try{
  if(args.length!==1||args[0].startsWith('-'))throw Error('Use one explicit frozen JSON input file');
  const fd=fs.openSync(path.resolve(args[0]),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let bytes;
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>64*1024*1024)throw Error('Input must be a regular JSON file no larger than64MiB');bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
  if(bytes.length>64*1024*1024)throw Error('Input exceeds64MiB');const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))throw Error('Input must be valid UTF-8');const input=parseJSON(text);
  if(!input||Object.keys(input).some(k=>!['protocol','state','origin','options'].includes(k))||input.protocol!==OBSERVATIONS_INPUT_PROTOCOL||typeof input.origin?.state_sha256!=='string')throw Error('Use the exact frozen observation input schema and state commitment');
  if(input.options?.origin!==undefined)throw Error('Origin belongs in the explicit frozen envelope');
  if(input.options&&Object.hasOwn(input.options,'output_bytes'))throw Error('Output budget is an internal transport setting');
  const report=implementationObservations(input.state,{...(input.options??{}),origin:{...input.origin,kind:'frozen-export'}});return {report,exitCode:0};
 }catch(error){return {report:{protocol:OBSERVATIONS_PROTOCOL,status:'held',producer_authenticity_established:false,execution_authorized:false,hold_code:error.code??'OBSERVATIONS_INPUT_HELD',message:error.code?'Unable to read explicit regular UTF-8 input':String(error.message).slice(0,250)},exitCode:2};}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===3&&['--help','-h'].includes(process.argv[2]))process.stdout.write(help);
 else{const {report,exitCode}=implementationObservationsCLI(process.argv.slice(2));process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=exitCode;}
}
