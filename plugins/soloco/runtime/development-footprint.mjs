import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {assertByteBudget,developmentTransportBudget,MAX_DEVELOPMENT_BYTES} from './development-limits.mjs';
import {reconstructPatch,validText} from './development-patch.mjs';

export const DEVELOPMENT_FOOTPRINT_MAX_RESULT_BYTES=24000;
const MAX_FILES=32;
const hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=value=>assertByteBudget(value,Number.MAX_SAFE_INTEGER,'Footprint');
function invalid(message) {throw Object.assign(new Error(message),{code:'DEVELOPMENT_FOOTPRINT_INPUT'});}
function object(value,allowed,required,label) {
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid(`${label} must be a plain data object`);
  const result={};
  for(const key of Reflect.ownKeys(value)) {
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!allowed.includes(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))invalid(`${label} has unsupported fields or descriptors`);
    result[key]=descriptor.value;
  }
  for(const key of required)if(!Object.hasOwn(result,key))invalid(`${label} is missing ${key}`);
  return result;
}
function array(value,label,max=MAX_FILES) {
  if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)invalid(`${label} must be a plain array`);
  const length=Object.getOwnPropertyDescriptor(value,'length').value;
  if(length>max||Reflect.ownKeys(value).length!==length+1)invalid(`${label} exceeds its bound or is sparse`);
  const result=[];
  for(let i=0;i<length;i++) {
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))invalid(`${label} must contain data elements`);
    result.push(descriptor.value);
  }
  return result;
}
function filePath(value) {
  if(typeof value!=='string'||!value.length||value.length>180||value.split('/').some(part=>!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part)||part.endsWith('.')||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)||/^(AGENTS|CLAUDE)\.md$/i.test(part)))invalid('Use exact portable file paths, excluding hidden paths and host instructions');
  return value;
}
function paths(value,label,empty=false) {
  const result=array(value,label).map(filePath).sort();
  if(!empty&&!result.length)invalid(`${label} must not be empty`);
  if(new Set(result.map(p=>p.toLowerCase())).size!==result.length)invalid(`Duplicate ${label}`);
  return result;
}
function text(value,label) {if(!validText(value))invalid(`${label} must be valid UTF-8 text without NUL`);return value;}
function limit(value,label) {if(!Number.isSafeInteger(value)||value<1000||value>MAX_DEVELOPMENT_BYTES)invalid(`${label} must be an integer from 1000 to ${MAX_DEVELOPMENT_BYTES}`);return value;}

// Shared with the actual development bundle. Keep this composition and ordering
// identical: unchanged selected dependencies/tests are part of the full candidate.
export function developmentCandidateFiles(sources,writePaths,changed) {
  return [...sources.filter(f=>!writePaths.includes(f.path)).map(({path,content})=>({path,content})),...changed].sort((a,b)=>a.path.localeCompare(b.path));
}

// Pure measurement of supplied DATA, not a source reader or authority checker.
// The adapter must bind actual selected sources/configuration/scope authority.
// No model/context/transport fit or dependency completeness is inferred here.
export function developmentFootprint(input) {
  const a=object(input,['sources','write_paths','test_paths','output_format','output','limits','headroom_bytes'],['sources','write_paths','test_paths','output_format','limits'],'Footprint');
  const selected=array(a.sources,'sources').map(value=>{
    const source=object(value,['path','content','sha256'],['path','content','sha256'],'Source');
    filePath(source.path);text(source.content,'Source content');
    if(typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256)||source.sha256!==hash(source.content))invalid('Source hash does not match its complete content');
    return {path:source.path,content:source.content,sha256:source.sha256};
  });
  paths(selected.map(f=>f.path),'source paths',true);
  const writePaths=paths(a.write_paths,'write_paths'),testPaths=paths(a.test_paths,'test_paths');
  const all=[...new Set([...selected.map(f=>f.path),...writePaths])].sort(),lower=all.map(p=>p.toLowerCase());
  if(all.length>MAX_FILES||new Set(lower).size!==all.length||lower.some(p=>lower.some(q=>q!==p&&q.startsWith(p+'/'))))invalid('Conflicting or excessive selected paths');
  if(testPaths.some(p=>!all.includes(p)))invalid('Every test path must be a selected source or generated path');
  if(!['files','patches'].includes(a.output_format))invalid('Unsupported output_format');
  const limits=object(a.limits,['configured_max_bytes','requested_max_bytes','scope_max_bytes'],['configured_max_bytes','requested_max_bytes'],'Limits');
  for(const name of Object.keys(limits))limit(limits[name],name);
  const headroom=Object.hasOwn(a,'headroom_bytes')?a.headroom_bytes:0;
  if(!Number.isSafeInteger(headroom)||headroom<0||headroom>MAX_DEVELOPMENT_BYTES)invalid('headroom_bytes must be a nonnegative integer at most 1000000');
  let output,changed,files;
  if(Object.hasOwn(a,'output')) {
    output=array(a.output,'output').map(value=>{
      const item=object(value,a.output_format==='files'?['path','content']:['path','base_sha256','edits','content'],a.output_format==='files'?['path','content']:['path','base_sha256'],'Output');
      filePath(item.path);
      if(a.output_format==='files')text(item.content,'Output content');
      else {
        if(Object.hasOwn(item,'content'))text(item.content,'New path content');
        if(Object.hasOwn(item,'edits'))item.edits=array(item.edits,'patch edits',10000).map(value=>{
          const edit=object(value,['start','end','text'],['start','end','text'],'Edit');
          text(edit.text,'Edit text');return edit;
        });
      }
      return item;
    });
    changed=output.map(item=>{
      const source=selected.find(f=>f.path===item.path);
      let content;
      try {content=a.output_format==='files'?item.content:reconstructPatch(source?.content,item);}
      catch(error) {invalid(error.message);}
      return {path:item.path,content};
    }).sort((x,y)=>x.path.localeCompare(y.path));
    if(JSON.stringify(changed.map(f=>f.path).sort())!==JSON.stringify(writePaths))invalid('Output must match every declared write path exactly');
    files=developmentCandidateFiles(selected,writePaths,changed);
  }
  const summary=(value,contentBytes)=>{
    const encoded=JSON.stringify(value),encodedBytes=bytes(encoded);
    return {known:true,encoded_sha256:hash(encoded),encoded_utf8_bytes:encodedBytes,content_utf8_bytes:contentBytes,framing_utf8_bytes:encodedBytes-contentBytes};
  };
  const sources=summary(selected,selected.reduce((n,f)=>n+bytes(f.content),0));
  const generated=output===undefined?{known:false,reason:'Generated output is not supplied; its size and growth are unknown'}:summary(output,output.reduce((n,f)=>n+bytes(f.content??'')+(f.edits??[]).reduce((m,e)=>m+bytes(e.text),0),0));
  const candidate=files===undefined?{known:false,reason:'Complete reconstructed candidate requires every generated write path; its final size and growth are unknown'}:summary(files,files.reduce((n,f)=>n+bytes(f.content),0));
  const phases={sources,generated_output:generated,complete_candidate:candidate};
  const measured=Math.max(...Object.values(phases).filter(p=>p.known).map(p=>p.encoded_utf8_bytes));
  const ceilings={...limits,hard_max_bytes:MAX_DEVELOPMENT_BYTES};
  const blockers=[];
  for(const [phase,measurement] of Object.entries(phases))if(measurement.known)for(const [name,ceiling] of Object.entries(ceilings))if(measurement.encoded_utf8_bytes>ceiling)blockers.push({phase,limit:name,actual_bytes:measurement.encoded_utf8_bytes,permitted_bytes:ceiling,excess_bytes:measurement.encoded_utf8_bytes-ceiling});
  const required=Math.max(1000,measured)+headroom,complete=files!==undefined;
  const scopeChange=Object.hasOwn(limits,'scope_max_bytes')&&required>limits.scope_max_bytes;
  const result={protocol:'development-footprint-v1',status:blockers.length?'held':complete?'within_byte_limits':'incomplete',output_format:a.output_format,authority_granted:false,scope_authorization_checked:false,
    membership:{selected_count:all.length,source_count:selected.length,write_count:writePaths.length,test_count:testPaths.length,representation:'Every selected path occurs once in files; source presence, written and test fields preserve its exact membership',dependency_completeness:'not inferred; the adapter must supply the complete selected dependency/test set'},
    files:all.map(p=>{
      const source=selected.find(f=>f.path===p),out=output?.find(f=>f.path===p),candidateFile=files?.find(f=>f.path===p);
      return {path:p,test:testPaths.includes(p),written:writePaths.includes(p),source:source?{sha256:source.sha256,content_utf8_bytes:bytes(source.content),record_json_utf8_bytes:bytes(source)}:null,
        generated:out?{text_utf8_bytes:bytes(out.content??'')+(out.edits??[]).reduce((n,e)=>n+bytes(e.text),0),record_json_utf8_bytes:bytes(out)}:null,candidate:candidateFile?{sha256:hash(candidateFile.content),content_utf8_bytes:bytes(candidateFile.content),record_json_utf8_bytes:bytes(candidateFile)}:null};
    }),phases,limits:{...ceilings,max_files:MAX_FILES},headroom:Object.fromEntries(Object.entries(ceilings).map(([name,value])=>[name,value-measured])),blockers,
    recommendation:{basis:complete?'maximum of the three separate measured phases':'known measurements only; future output and complete candidate remain unknown',complete,minimum_known_max_bytes:Math.max(1000,measured),requested_headroom_bytes:headroom,recommended_max_bytes:required<=MAX_DEVELOPMENT_BYTES?required:null,required_with_headroom_bytes:required,supported:required<=MAX_DEVELOPMENT_BYTES,supported_maximum_exceeded:required>MAX_DEVELOPMENT_BYTES,configuration_change_required:required>limits.configured_max_bytes,new_scope_required:scopeChange,scope_requirement:scopeChange?'A separately authorized new scope is required; an existing scope cannot grow':'Scope authority must be checked separately; this measurement grants none',changes_configuration:false,changes_existing_scope:false},
    separate_limits:{development_context_admission_characters:developmentTransportBudget(limits.requested_max_bytes),model_assignment_and_qa_framing:'not supplied or measured',host_model_context_fit:'unverified',public_transport_fit:'not inferred from artifact bytes',test_output_time_attempts_expiry:'unchanged; not measured as source bytes'}};
  if(bytes(result)>DEVELOPMENT_FOOTPRINT_MAX_RESULT_BYTES)throw Object.assign(new Error('Complete footprint metadata exceeds its result budget; no partial footprint returned'),{code:'DEVELOPMENT_FOOTPRINT_RESULT_CAPACITY'});
  return result;
}
