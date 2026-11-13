import fs from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {digest,owner} from './store.mjs';
import {requireCodexRootActor} from './mcp-host-context.mjs';
import {withLegacyPublicStore} from './peer-owner-runtime.mjs';
import {DEFAULT_DEVELOPMENT_BYTES,MAX_DEVELOPMENT_BYTES,developmentTransportBudget} from './development-limits.mjs';
import {developmentFootprint,DEVELOPMENT_FOOTPRINT_MAX_RESULT_BYTES} from './development-footprint.mjs';
import {validText} from './development-patch.mjs';
import {inspectLegacyDevelopmentBudget,proposeLegacyDevelopmentBudget,applyLegacyDevelopmentBudget,restoreLegacyDevelopmentBudget,reconcileLegacyDevelopmentBudget} from './development-budget.mjs';

export const DEVELOPMENT_BUDGET_ACTIONS=Object.freeze(['budget_inspect','budget_propose','budget_apply','budget_restore','budget_reconcile','budget_preflight']);
const SHA=/^[a-f0-9]{64}$/,POLICY='retain-original-explicit-cas-restore';
const MAX_DATA_CHARACTERS=developmentTransportBudget(MAX_DEVELOPMENT_BYTES),MAX_DATA_NODES=2000000;
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const need=(condition,message)=>{if(!condition)fail('DEVELOPMENT_BUDGET_REQUEST',message);};
const str=(maxLength,minLength=1)=>({type:'string',minLength,maxLength});
const integer=(minimum,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const shaSchema={type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64};
const referenceSchema=object({id:{...str(43),pattern:'^budget-[a-f0-9-]{36}$'},revision:integer(1),sha256:shaSchema});
const configSchema=object({exists:{type:'boolean'},sha256:{anyOf:[shaSchema,{type:'null'}]},bytes:integer(0,4096),max_bytes_ceiling:integer(1000,MAX_DEVELOPMENT_BYTES),snapshot_sha256:shaSchema});
const pathsSchema={type:'array',maxItems:32,items:str(180),uniqueItems:true};
const editSchema=object({start:integer(0),end:integer(0),text:{type:'string'}});
const outputSchema={type:'array',maxItems:32,items:{oneOf:[
  object({path:str(180),content:{type:'string'}}),
  object({path:str(180),base_sha256:shaSchema,edits:{type:'array',maxItems:10000,items:editSchema}}),
  object({path:str(180),base_sha256:{type:'null'},content:{type:'string'}})
]}};
const inputSchemas={
  budget_inspect:object({ref:referenceSchema,cursor:str(300),limit:integer(1,20),canonical_sha256:shaSchema,offset:integer(0),length:integer(1,4096)},[]),
  budget_propose:object({max_bytes_ceiling:integer(1000,MAX_DEVELOPMENT_BYTES),expected_config:configSchema,source_instruction:str(1000),restoration_policy:{const:POLICY}}),
  budget_apply:object({proposal_ref:referenceSchema,source_instruction:str(1000)}),
  budget_restore:object({applied_ref:referenceSchema,expected_config:configSchema,source_instruction:str(1000)}),
  budget_reconcile:object({intent_ref:referenceSchema,source_instruction:str(1000)}),
  budget_preflight:object({source_instruction:str(1000),model_data_approved:{const:true},data_policy:str(4000),read_paths:pathsSchema,write_paths:{...pathsSchema,minItems:1},test_paths:{...pathsSchema,minItems:1},output_format:{enum:['files','patches']},requested_max_bytes:integer(1000,MAX_DEVELOPMENT_BYTES),headroom_bytes:integer(0,MAX_DEVELOPMENT_BYTES),output:outputSchema},['source_instruction','model_data_approved','data_policy','read_paths','write_paths','test_paths','output_format','requested_max_bytes','headroom_bytes'])
};
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const developmentBudgetInputSchema=freeze({oneOf:Object.values(inputSchemas)});

function fields(value,allowed,required=allowed){
  need(value&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'Expected a closed plain DATA object');
  const out={};
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    need(typeof key==='string'&&allowed.includes(key)&&descriptor.enumerable&&Object.hasOwn(descriptor,'value'),'Unsupported field or descriptor');
    out[key]=descriptor.value;
  }
  for(const key of required)need(Object.hasOwn(out,key),'Missing '+key);
  return out;
}
function dataCopy(value,budget={nodes:0,characters:0},depth=0){
  need(++budget.nodes<=MAX_DATA_NODES&&depth<=12,'Development budget input exceeds its finite DATA bound');
  if(typeof value==='string'){
    need(validText(value),'Input text must be valid UTF-8 without NUL');
    budget.characters+=value.length;need(budget.characters<=MAX_DATA_CHARACTERS,'Development budget input exceeds its finite text bound');return value;
  }
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){need(Number.isFinite(value)&&!Object.is(value,-0),'Input numbers must be finite');return value;}
  need(value&&typeof value==='object'&&!types.isProxy(value),'Only DATA values are accepted');
  if(Array.isArray(value)){
    need(Object.getPrototypeOf(value)===Array.prototype,'Expected a plain array');
    const length=Object.getOwnPropertyDescriptor(value,'length').value;
    need(Reflect.ownKeys(value).length===length+1,'Sparse or extended arrays are unsupported');
    const out=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'),'Array elements must be DATA');out.push(dataCopy(d.value,budget,depth+1));}return out;
  }
  need([Object.prototype,null].includes(Object.getPrototypeOf(value)),'Expected plain DATA');
  const out={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);need(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'),'Object fields must be DATA');Object.defineProperty(out,key,{value:dataCopy(d.value,budget,depth+1),writable:true,enumerable:true,configurable:true});}return out;
}
function text(value,label,max=1000){need(typeof value==='string'&&value.trim().length>0&&value.length<=max&&validText(value),label+' must be bounded UTF-8 text');return value;}
function number(value,label,min,max=Number.MAX_SAFE_INTEGER){need(Number.isSafeInteger(value)&&value>=min&&value<=max,label+' is outside its supported bounds');return value;}
function reference(value){const r=fields(value,['id','revision','sha256']);need(typeof r.id==='string'&&/^budget-[a-f0-9-]{36}$/.test(r.id),'Invalid budget reference ID');number(r.revision,'revision',1);need(typeof r.sha256==='string'&&SHA.test(r.sha256),'Invalid budget reference hash');return r;}
function configuration(value){
  const r=fields(value,['exists','sha256','bytes','max_bytes_ceiling','snapshot_sha256']);need(typeof r.exists==='boolean','Invalid configuration presence');
  number(r.bytes,'configuration bytes',0,4096);number(r.max_bytes_ceiling,'configuration ceiling',1000,MAX_DEVELOPMENT_BYTES);need(typeof r.snapshot_sha256==='string'&&SHA.test(r.snapshot_sha256),'Invalid configuration snapshot');
  need(r.exists?typeof r.sha256==='string'&&SHA.test(r.sha256):r.sha256===null&&r.bytes===0&&r.max_bytes_ceiling===DEFAULT_DEVELOPMENT_BYTES,'Invalid configuration reference');return r;
}
function portablePath(value){
  text(value,'file path',180);
  need(!value.split('/').some(part=>!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part)||part.endsWith('.')||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)||/^(AGENTS|CLAUDE)\.md$/i.test(part)),'Use exact portable paths excluding links, hidden paths and host instructions');return value;
}
function pathList(value,label,empty=false){
  need(Array.isArray(value)&&value.length<=32&&(empty||value.length>0),label+' must be a bounded path list');
  const out=value.map(portablePath).sort();need(new Set(out.map(p=>p.toLowerCase())).size===out.length,'Duplicate '+label);return out;
}
function suppliedOutput(value,format,writePaths){
  need(Array.isArray(value)&&value.length<=32,'Output must be a bounded complete array');
  for(const entry of value){
    if(format==='files'){const f=fields(entry,['path','content']);portablePath(f.path);need(validText(f.content),'File output must be UTF-8 text');}
    else{
      const p=fields(entry,['path','base_sha256','edits','content'],['path','base_sha256']);portablePath(p.path);
      if(p.base_sha256===null){need(!Object.hasOwn(p,'edits')&&Object.hasOwn(p,'content')&&validText(p.content),'New patch paths require complete content');}
      else{
        need(typeof p.base_sha256==='string'&&SHA.test(p.base_sha256)&&!Object.hasOwn(p,'content')&&Array.isArray(p.edits)&&p.edits.length<=10000,'Invalid patch shape');
        let previous=-1,cursor=0;for(const raw of p.edits){const e=fields(raw,['start','end','text']);number(e.start,'edit start',0);number(e.end,'edit end',e.start);need(e.start>=cursor&&e.start>previous&&validText(e.text),'Patch edits must be ordered, nonoverlapping UTF-8 DATA');previous=e.start;cursor=e.end;}
      }
    }
  }
  need(JSON.stringify(value.map(f=>f.path).sort())===JSON.stringify(writePaths),'Output must contain every selected write path exactly once');return value;
}
// Pure validation is also called by MCP/engine BEFORE legacy config guards or
// actual caller observation. It never reads a path, binding or company.
export function validateDevelopmentBudgetRequest(args){
  const a=fields(args,['root','session_id','epoch','action','budget_input']);
  text(a.root,'root',4096);need(path.isAbsolute(a.root),'root must be absolute');text(a.session_id,'session_id',200);number(a.epoch,'epoch',1);need(DEVELOPMENT_BUDGET_ACTIONS.includes(a.action),'Unsupported development budget action');
  const schema=inputSchemas[a.action],input=dataCopy(fields(a.budget_input,Object.keys(schema.properties),schema.required));
  if(Object.hasOwn(input,'source_instruction'))text(input.source_instruction,'source_instruction');
  if(a.action==='budget_inspect'){
    if(Object.hasOwn(input,'ref'))reference(input.ref);
    need(!(Object.hasOwn(input,'ref')&&(Object.hasOwn(input,'cursor')||Object.hasOwn(input,'limit'))),'Exact record and list modes are separate');
    if(Object.hasOwn(input,'cursor'))text(input.cursor,'cursor',300);
    if(Object.hasOwn(input,'limit'))number(input.limit,'limit',1,20);
    if(['canonical_sha256','offset','length'].some(k=>Object.hasOwn(input,k))){need(input.ref&&input.canonical_sha256===input.ref.sha256,'Ranges require the exact canonical reference');number(input.offset,'offset',0);number(input.length,'length',1,4096);}
  }else if(a.action==='budget_propose'){number(input.max_bytes_ceiling,'max_bytes_ceiling',1000,MAX_DEVELOPMENT_BYTES);configuration(input.expected_config);need(input.restoration_policy===POLICY,'Unsupported restoration policy');}
  else if(a.action==='budget_apply')reference(input.proposal_ref);
  else if(a.action==='budget_restore'){reference(input.applied_ref);configuration(input.expected_config);}
  else if(a.action==='budget_reconcile')reference(input.intent_ref);
  else{
    need(input.model_data_approved===true,'Explicitly approve selected source inspection and sharing');text(input.data_policy,'data_policy',4000);
    input.read_paths=pathList(input.read_paths,'read_paths',true);input.write_paths=pathList(input.write_paths,'write_paths');input.test_paths=pathList(input.test_paths,'test_paths');
    const selected=[...new Set([...input.read_paths,...input.write_paths])].sort(),lower=selected.map(p=>p.toLowerCase());
    need(selected.length<=32&&new Set(lower).size===lower.length&&!lower.some(p=>lower.some(q=>q!==p&&q.startsWith(p+'/'))),'Conflicting or excessive selected paths');
    need(input.test_paths.every(p=>selected.includes(p)),'Every test path must be selected or generated');need(['files','patches'].includes(input.output_format),'Unsupported output_format');
    number(input.requested_max_bytes,'requested_max_bytes',1000,MAX_DEVELOPMENT_BYTES);number(input.headroom_bytes,'headroom_bytes',0,MAX_DEVELOPMENT_BYTES);
    if(Object.hasOwn(input,'output'))suppliedOutput(input.output,input.output_format,input.write_paths);
  }
  return freeze({...a,budget_input:input});
}
function actualActor(source,session){
  const a=fields(source,['host','session_id','native_id']),actual=requireCodexRootActor({host:a.host,session_id:session});
  need(a.host===actual.host&&a.session_id===session&&a.session_id===actual.session_id&&a.native_id===actual.native_id,'Actual root actor and session selector must match');return actual;
}
const READ={rootKeys:['id','schema','runtime_version','plugin_version','governance','team_sha256','roles','cos_instructions','owner','revision','paused'],entities:{upgrade:['status']}};
const VERSION_KEYS=['dev','ino','mode','nlink','size','uid','gid','mtimeNs','ctimeNs'];
const sameVersion=(a,b)=>VERSION_KEYS.every(k=>a[k]===b[k]);
const stat=file=>{try{return fs.lstatSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}};
function selectedFiles(root){
  const fds=[],directories=new Map(),files=new Map(),absent=new Set();
  const c=fs.constants;need([c.O_RDONLY,c.O_DIRECTORY,c.O_NOFOLLOW,c.O_NONBLOCK].every(Number.isInteger),'Descriptor-bound source reads are unsupported on this host');
  const changed=()=>fail('DEVELOPMENT_BUDGET_SOURCE_CHANGED','Selected source or directory changed during preflight');
  const directory=file=>{
    if(directories.has(file))return;
    const before=stat(file);if(!before?.isDirectory()||before.isSymbolicLink())fail('DEVELOPMENT_BUDGET_SOURCE_PATH','Selected source parents must be real directories');
    const fd=fs.openSync(file,c.O_RDONLY|c.O_DIRECTORY|c.O_NOFOLLOW|c.O_NONBLOCK);fds.push(fd);
    const held=fs.fstatSync(fd,{bigint:true}),named=stat(file);if(!named||!sameVersion(before,held)||!sameVersion(held,named))changed();directories.set(file,{fd,before:held});
  };
  const locate=relative=>{
    directory(root);const parts=relative.split('/');let current=root;
    for(let i=0;i<parts.length;i++){
      current=path.join(current,parts[i]);const named=stat(current);
      if(!named){absent.add(current);return null;}
      if(i<parts.length-1){directory(current);continue;}
      return {file:current,named};
    }
  };
  const read=(relative,maximum,required=true)=>{
    const located=locate(relative);
    if(!located){if(required)fail('DEVELOPMENT_BUDGET_SOURCE_MISSING','Missing selected source: '+relative);return null;}
    const {file,named}=located;
    if(!named.isFile()||named.isSymbolicLink()||named.nlink!==1n)fail('DEVELOPMENT_BUDGET_SOURCE_FILE','Selected input must be a regular single-link file: '+relative);
    if(named.size>BigInt(maximum))fail('DEVELOPMENT_BUDGET_SOURCE_LIMIT','Selected input '+relative+' exceeds its read bound: actual '+named.size+', permitted '+maximum);
    const fd=fs.openSync(file,c.O_RDONLY|c.O_NOFOLLOW|c.O_NONBLOCK);fds.push(fd);const before=fs.fstatSync(fd,{bigint:true});if(!sameVersion(before,named))changed();
    const buffer=Buffer.alloc(Number(before.size)+1);let length=0;
    while(length<buffer.length){const n=fs.readSync(fd,buffer,length,buffer.length-length,length);if(!n)break;length+=n;}
    const after=fs.fstatSync(fd,{bigint:true}),now=stat(file);if(length!==Number(before.size)||!now||!sameVersion(before,after)||!sameVersion(after,now))changed();
    const body=buffer.subarray(0,length),content=body.toString('utf8');if(!Buffer.from(content).equals(body)||!validText(content))fail('DEVELOPMENT_BUDGET_SOURCE_UTF8','Selected input must be UTF-8 text without NUL: '+relative);
    files.set(file,{fd,before:after});return {content,sha256:digest(body),bytes:length};
  };
  return {
    read,
    newPath:relative=>{if(locate(relative))fail('DEVELOPMENT_BUDGET_EXISTING_WRITE','Existing write targets must also be declared read paths');},
    assertCurrent:()=>{
      for(const [file,{fd,before}] of [...directories,...files]){const held=fs.fstatSync(fd,{bigint:true}),named=stat(file);if(!named||!sameVersion(before,held)||!sameVersion(held,named))changed();}
      for(const file of absent)if(stat(file))changed();
    },
    close:()=>{const errors=[];for(const fd of fds.reverse())try{fs.closeSync(fd);}catch(error){errors.push(error);}return errors;}
  };
}
function readConfiguration(reader){
  const found=reader.read('.company/development.json',4096,false);if(!found)return {max_bytes:DEFAULT_DEVELOPMENT_BYTES,source:'default',exists:false,sha256:null,bytes:0};
  let value;try{value=JSON.parse(found.content);}catch{fail('DEVELOPMENT_BUDGET_CONFIG_JSON');}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'max_bytes_ceiling')||!Number.isSafeInteger(value.max_bytes_ceiling)||value.max_bytes_ceiling<1000||value.max_bytes_ceiling>MAX_DEVELOPMENT_BYTES)fail('DEVELOPMENT_BUDGET_CONFIG_RANGE');
  return {max_bytes:value.max_bytes_ceiling,source:'.company/development.json',exists:true,sha256:found.sha256,bytes:found.bytes};
}
function preflight(root,actor,epoch,input){
  return withLegacyPublicStore(root,store=>store.readSnapshot(()=>{
    const state=store.readSelected(READ);owner(state,actor.session_id,actor.host,epoch);requireCodexRootActor({host:actor.host,session_id:actor.session_id});
    const reader=selectedFiles(store.root);let value,primary,failed=false;
    try{
      const configuration=readConfiguration(reader),sources=input.read_paths.map(relative=>{const source=reader.read(relative,MAX_DEVELOPMENT_BYTES);return {path:relative,content:source.content,sha256:source.sha256};});
      for(const relative of input.write_paths)if(!input.read_paths.includes(relative))reader.newPath(relative);
      reader.assertCurrent();
      const footprint=developmentFootprint({sources,write_paths:input.write_paths,test_paths:input.test_paths,output_format:input.output_format,limits:{configured_max_bytes:configuration.max_bytes,requested_max_bytes:input.requested_max_bytes},headroom_bytes:input.headroom_bytes,...(Object.hasOwn(input,'output')?{output:input.output}:{})});
      owner(store.readSelected(READ),actor.session_id,actor.host,epoch);requireCodexRootActor({host:actor.host,session_id:actor.session_id});reader.assertCurrent();
      value={...footprint,preflight:{protocol:'legacy-development-budget-preflight-v1',company_id:state.id,read_snapshot_revision:state.revision,owner_epoch:epoch,source_basis:'actual complete selected files in one original legacy Store read snapshot',model_data_approved:true,source_instruction_sha256:digest(input.source_instruction),data_policy_sha256:digest(input.data_policy),configuration,configuration_reference:'Measurement only; budget_inspect supplies the current exact mutation CAS reference',output_basis:Object.hasOwn(input,'output')?'complete caller-supplied preview; not canonical generation or an executed candidate':'not supplied; future generated output and complete candidate remain unknown',canonical_generation:false,tests_executed:false,creates_plan:false,creates_grant:false,changes_configuration:false}};
      if(Buffer.byteLength(JSON.stringify(value))>DEVELOPMENT_FOOTPRINT_MAX_RESULT_BYTES)fail('DEVELOPMENT_BUDGET_PREFLIGHT_RESULT_CAPACITY','Complete preflight metadata exceeds its result budget; no partial result returned');
    }catch(error){primary=error;failed=true;}
    const cleanup=reader.close();if(failed){if(cleanup.length)throw new AggregateError([primary,...cleanup],'Source preflight and descriptor cleanup failed',{cause:primary});throw primary;}
    if(cleanup.length)throw cleanup.length===1?cleanup[0]:new AggregateError(cleanup,'Source preflight descriptor cleanup failed');return freeze(value);
  }));
}
const controls={budget_inspect:inspectLegacyDevelopmentBudget,budget_propose:proposeLegacyDevelopmentBudget,budget_apply:applyLegacyDevelopmentBudget,budget_restore:restoreLegacyDevelopmentBudget,budget_reconcile:reconcileLegacyDevelopmentBudget};
// The engine derives this actor through peerCallerActor BEFORE this fixed
// adapter. Neither JSON, legacy bindings nor a layout diagnostic substitutes it.
export async function developmentBudgetRuntimeAction(args,sourceActor){
  const a=validateDevelopmentBudgetRequest(args),actor=actualActor(sourceActor,a.session_id);
  if(a.action==='budget_preflight')return preflight(a.root,actor,a.epoch,a.budget_input);
  return controls[a.action](a.root,actor,{epoch:a.epoch,...a.budget_input});
}
