#!/usr/bin/env node
// Explicit frozen JSON in; deterministic JSON report to stdout. No company,
// ticket, native process, settings or source writes are performed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preflightRetentionReview,auditRetentionReviewDelivery,REVIEW_PREFLIGHT_PROTOCOL,REVIEW_DELIVERY_AUDIT_INPUT_PROTOCOL} from '../plugins/soloco/runtime/review-preflight.mjs';

function parseUniqueJSON(text){
  const value=JSON.parse(text),stack=[];
  for(let i=0;i<text.length;){const c=text[i];
    if(c==='"'){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}const object=stack.at(-1);if(object?.keys&&object.nextKey){const key=JSON.parse(text.slice(start,i));if(object.keys.has(key))throw Error('Duplicate decoded JSON key: '+key);object.keys.add(key);object.nextKey=false;}continue;}
    if(c==='{')stack.push({keys:new Set(),nextKey:true});else if(c==='[')stack.push({});else if(c==='}'||c===']')stack.pop();else if(c===','&&stack.at(-1)?.keys)stack.at(-1).nextKey=true;i++;
  }return value;
}
export function reviewPreflightCLI(args){
  try{
    if(args.length!==1||args[0].startsWith('-'))throw Error('Use: node tools/review-preflight.mjs FROZEN_INPUT.json');
    // O_NONBLOCK makes opening a FIFO reach the regular-file check immediately;
    // O_NOFOLLOW prevents replacing an explicit frozen file with a symlink.
    const fd=fs.openSync(path.resolve(args[0]),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    let bytes;try{if(!fs.fstatSync(fd).isFile())throw Error('Input must be a regular JSON file');bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
    const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))throw Error('Input must be valid UTF-8 JSON');
    const input=parseUniqueJSON(text),report=input?.protocol===REVIEW_DELIVERY_AUDIT_INPUT_PROTOCOL?auditRetentionReviewDelivery(input):preflightRetentionReview(input);return {report,exitCode:['measured','consistent'].includes(report.status)?0:2};
  }catch(error){return {report:{protocol:REVIEW_PREFLIGHT_PROTOCOL,status:'held',dispatch_eligibility:'not_assessed',execution_authorized:false,hold_reasons:[{code:'cli_input_invalid',message:String(error.message)}]},exitCode:2};}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {report,exitCode}=reviewPreflightCLI(process.argv.slice(2));process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=exitCode;
}
