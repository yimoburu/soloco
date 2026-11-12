// Bounded current-owner read-only preparation for an existing layout-4 company.
// This surface cannot initialize, migrate, apply adoption or start a provider.
import fs from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {readImmutable} from './record-storage.mjs';
import {canonical,peerDigest} from './peers/ledger.mjs';
import {LEGACY_ADOPTION_LIMITS,authenticateLegacyOwner,captureLegacyOrigin,legacyOriginReadiness} from './peers/legacy-origin.mjs';
import {preparePeerAdoptionV2} from './peers/migration-v2.mjs';

const fail=code=>{throw Object.assign(Error(code),{code});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype;
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!value.includes('\0')&&Buffer.from(value).toString('utf8')===value;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function data(value,seen=new Set(),budget={nodes:0},depth=0){
 if(++budget.nodes>1000||depth>10)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0);
 if(!value||typeof value!=='object'||types.isProxy(value)||seen.has(value))return false;
 const array=Array.isArray(value),descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(array?Object.getPrototypeOf(value)!==Array.prototype||keys.length!==value.length+1:!plain(value))return false;
 seen.add(value);
 return keys.every(key=>typeof key==='string'&&(array&&key==='length'||Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable&&data(descriptors[key].value,seen,budget,depth+1)));
}
const fields={readiness:[],plan:['expires_at'],inspect:['kind','limit','cursor','basis_sha256'],read:['target','source_id','sha256','basis_sha256','offset','length','expires_at']};
function request(args,host){
 if(!data(args)||!plain(args)||Object.keys(args).some(key=>!['root','session_id','epoch','action','source_instruction','input'].includes(key))||!['codex','claude'].includes(host)||!path.isAbsolute(args.root??'')||!text(args.root,4000)||!text(args.session_id,200)||!Number.isSafeInteger(args.epoch)||args.epoch<1||!Object.hasOwn(fields,args.action))fail('LEGACY_ADOPTION_INPUT');
 const input=args.input??{};
 if(!plain(input)||Object.keys(input).some(key=>!fields[args.action].includes(key)))fail('LEGACY_ADOPTION_INPUT');
 if(args.source_instruction!==undefined&&!text(args.source_instruction,4000))fail('LEGACY_ADOPTION_INPUT');
 if(args.action==='plan'&&!text(args.source_instruction,4000))fail('LEGACY_PLAN_INSTRUCTION_REQUIRED');
 if(Object.hasOwn(input,'expires_at')&&!text(input.expires_at,100)||Object.hasOwn(input,'cursor')&&!text(input.cursor,2000)||Object.hasOwn(input,'basis_sha256')&&!hex(input.basis_sha256)||Object.hasOwn(input,'sha256')&&!hex(input.sha256)||Object.hasOwn(input,'source_id')&&!/^legacy-source:[a-f0-9]{64}$/.test(input.source_id))fail('LEGACY_ADOPTION_INPUT');
 if(args.action==='inspect'&&!['sources','issues'].includes(input.kind))fail('LEGACY_ADOPTION_INPUT');
 if(args.action==='read'&&(!['source','plan','projection'].includes(input.target)||!hex(input.sha256)||!hex(input.basis_sha256)||input.target==='source'&&!input.source_id||input.target!=='source'&&Object.hasOwn(input,'source_id')||input.target==='plan'&&(!text(args.source_instruction,4000)||!text(input.expires_at,100))||input.target!=='plan'&&Object.hasOwn(input,'expires_at')))fail('LEGACY_ADOPTION_INPUT');
 for(const [key,min,max] of [['limit',1,LEGACY_ADOPTION_LIMITS.page_rows],['offset',0,Number.MAX_SAFE_INTEGER],['length',1,LEGACY_ADOPTION_LIMITS.range_characters]])if(Object.hasOwn(input,key)&&(!Number.isSafeInteger(input[key])||input[key]<min||input[key]>max))fail('LEGACY_ADOPTION_INPUT');
 return input;
}
function noLink(file){try{if(fs.lstatSync(file).isSymbolicLink())fail('LEGACY_LINKED_STATE');}catch(error){if(error.code!=='ENOENT')throw error;}}
function storage(root){
 noLink(root);const real=fs.realpathSync(root);if(!fs.statSync(real).isDirectory())fail('LEGACY_EXISTING_STATE_REQUIRED');
 const directory=path.join(real,'.company'),file=path.join(directory,'company.sqlite');
 noLink(directory);for(const suffix of ['','-wal','-shm'])noLink(file+suffix);
 if(!fs.statSync(directory).isDirectory()||!fs.statSync(file).isFile())fail('LEGACY_EXISTING_STATE_REQUIRED');
 return {root:real,file};
}
function source(text,kind,basis_sha256,extra={}){return {kind,sha256:peerDigest(JSON.parse(text)),characters:text.length,utf8_bytes:Buffer.byteLength(text),basis_sha256,...extra,read:{tool:'company_peer_adoption',action:'read'}};}
function exactRange(body,sha256,input,basis_sha256){
 const split=index=>index>0&&index<body.length&&/[\uD800-\uDBFF]/.test(body[index-1])&&/[\uDC00-\uDFFF]/.test(body[index]);
 if(input.sha256!==sha256)fail('LEGACY_SOURCE_CHANGED');
 const offset=input.offset??0,length=input.length??LEGACY_ADOPTION_LIMITS.range_characters;
 if(offset>=body.length||split(offset))fail('LEGACY_RANGE_INVALID');
 let end=Math.min(body.length,offset+length);if(split(end))end--;
 if(end===offset)fail('LEGACY_RANGE_INVALID');
 return {sha256,basis_sha256,offset,length:end-offset,text:body.slice(offset,end),total_characters:body.length,next_offset:end<body.length?end:null,complete:end===body.length};
}
function page(items,kind,input,basis_sha256){
 let offset=0;
 if(input.cursor){
  let cursor;try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('LEGACY_CURSOR_CHANGED');}
  if(!plain(cursor)||Object.keys(cursor).sort().join(',')!=='basis_sha256,kind,offset'||cursor.basis_sha256!==basis_sha256||cursor.kind!==kind||!Number.isSafeInteger(cursor.offset)||cursor.offset<0||cursor.offset>items.length)fail('LEGACY_CURSOR_CHANGED');
  offset=cursor.offset;
 }
 const limit=input.limit??20,selected=[];let bytes=2;
 for(let index=offset;index<items.length&&selected.length<limit;index++){
  const item=items[index],size=Buffer.byteLength(canonical(item))+1;
  if(bytes+size>LEGACY_ADOPTION_LIMITS.page_bytes){if(!selected.length)fail('LEGACY_PAGE_CAPACITY');break;}
  selected.push(item);bytes+=size;
 }
 const next=offset+selected.length,complete=next===items.length;
 return {kind,basis_sha256,items:selected,total:items.length,offset,returned:selected.length,complete,next_cursor:complete?null:Buffer.from(canonical({kind,basis_sha256,offset:next})).toString('base64url')};
}

export const peerAdoptionToolSchema=Object.freeze({name:'company_peer_adoption',description:'Read-only current-owner readiness and exact bounded preparation for existing normalized-v4 state. Does not adopt, migrate, resume, grant authority or start sessions.',inputSchema:{type:'object',properties:{root:{type:'string',maxLength:4000},session_id:{type:'string',maxLength:200},epoch:{type:'integer',minimum:1},action:{enum:['readiness','plan','inspect','read']},source_instruction:{type:'string',minLength:1,maxLength:4000},input:{type:'object',properties:{expires_at:{type:'string',maxLength:100},kind:{enum:['sources','issues']},target:{enum:['source','plan','projection']},limit:{type:'integer',minimum:1,maximum:100},cursor:{type:'string',maxLength:2000},basis_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},source_id:{type:'string',pattern:'^legacy-source:[a-f0-9]{64}$'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:16000}},additionalProperties:false}},required:['root','session_id','epoch','action'],additionalProperties:false}});

export function peerAdoptionRuntimeAction(args,host){
 const input=request(args,host),where=storage(args.root);let db,transaction=false;
 try{
  db=new DatabaseSync(where.file,{readOnly:true});db.exec('BEGIN');transaction=true;
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_layout'").get()||db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==4)fail('LEGACY_LAYOUT4_REQUIRED');
  authenticateLegacyOwner(db,args,host);
  const snapshot=captureLegacyOrigin(db);
  if(input.basis_sha256!==undefined&&input.basis_sha256!==snapshot.basis_sha256)fail('LEGACY_SOURCE_CHANGED');
  if(args.action==='readiness')return legacyOriginReadiness(snapshot);
  if(args.action==='inspect')return page(input.kind==='sources'?snapshot.sources.map(({key,...row})=>row):snapshot.issues,input.kind,input,snapshot.basis_sha256);
  if(args.action==='plan'){
   const plan=preparePeerAdoptionV2(snapshot,{expires_at:input.expires_at,source_instruction:args.source_instruction}),body=canonical(plan);
   return {protocol:plan.protocol,status:plan.status,permitted_action:plan.permitted_action,ready_for_apply:false,issue_count:plan.issues.length,source_cut_sha256:plan.source_cut_sha256,source:source(body,'plan',snapshot.basis_sha256,{expires_at:plan.expires_at}),instruction_sha256:peerDigest(args.source_instruction),expires_at:plan.expires_at};
  }
  let body,sha256;
  if(input.target==='source'){
   const reference=snapshot.sources.find(row=>row.source_id===input.source_id);if(!reference)fail('LEGACY_SOURCE_CHANGED');
   body=readImmutable(db,reference.sha256);sha256=reference.sha256;
  }else if(input.target==='plan'){
   body=canonical(preparePeerAdoptionV2(snapshot,{expires_at:input.expires_at,source_instruction:args.source_instruction}));sha256=peerDigest(JSON.parse(body));
  }else{
   if(!snapshot.projection)fail('LEGACY_CONTEXT_QUALIFICATION_HELD');
   body=canonical(snapshot.projection);sha256=snapshot.origin_projection_sha256;
  }
  return exactRange(body,sha256,input,snapshot.basis_sha256);
 }finally{
  if(transaction)try{db.exec('ROLLBACK');}finally{db.close();}
  else db?.close();
 }
}
