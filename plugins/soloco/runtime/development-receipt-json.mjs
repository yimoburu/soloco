import {createHash} from 'node:crypto';
import {DEVELOPMENT_FILE_BODIES_PROTOCOL, renderDevelopmentReviewContext as renderFileBodies, restoreDevelopmentFileBodies} from './development-file-bodies.mjs';

export const DEVELOPMENT_RECEIPT_JSON_PROTOCOL='development-review-receipt-json-aliases-v1';
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=()=>{throw new Error('Invalid development receipt JSON sharing');};
const baseKeys=['protocol','canonical_context_sha256','assignment_context_sha256','canonical_context_utf8_bytes','canonical_context_utf16_characters','review_of','file_body_aliases','context'];
const aliasKeys=['record_index','record_id','record_revision','serialization','sha256','utf8_bytes','utf16_characters'];
function parse(text){let value;try{value=JSON.parse(text);}catch{fail();}if(JSON.stringify(value)!==text)fail();return value;}
function target(wire,reviewOf){
  if(!exact(reviewOf,['id','revision'])||typeof reviewOf.id!=='string'||!Number.isSafeInteger(reviewOf.revision)||reviewOf.revision<1||!Array.isArray(wire.context?.records))fail();
  const matches=wire.context.records.map((record,index)=>({record,index})).filter(({record})=>record?.id===reviewOf.id);
  if(matches.length!==1)fail();
  const value=matches[0],r=value.record;
  if(r.kind!=='artifact'||r.author_role!=='runtime'||r.revision!==reviewOf.revision||r.development?.type!=='test')fail();
  return value;
}

// The existing codec validates the exact whole canonical context first. Only
// the current runtime test's duplicated JSON string is additionally shared.
// No other string, unknown object, prior failure or result field is transformed.
export function shareDevelopmentReceiptJSON(fileWireText,originalSha,assignmentSha,reviewOf){
  restoreDevelopmentFileBodies(fileWireText,originalSha,assignmentSha,reviewOf);
  const wire=parse(fileWireText),{record,index}=target(wire,reviewOf);
  if(!object(record.development.result))return fileWireText;
  const content=JSON.stringify(record.development.result);
  if(record.content!==content)return fileWireText;
  record.content={receipt_result_json_alias_v1:0};
  wire.protocol=DEVELOPMENT_RECEIPT_JSON_PROTOCOL;
  wire.receipt_json_aliases=[{record_index:index,record_id:record.id,record_revision:record.revision,serialization:'JSON.stringify',sha256:digest(content),utf8_bytes:Buffer.byteLength(content,'utf8'),utf16_characters:content.length}];
  return JSON.stringify(wire);
}

export function restoreDevelopmentReceiptJSON(text,originalSha,assignmentSha,reviewOf){
  const wire=parse(text);
  if(!exact(wire,[...baseKeys,'receipt_json_aliases'])||wire.protocol!==DEVELOPMENT_RECEIPT_JSON_PROTOCOL||!Array.isArray(wire.receipt_json_aliases)||wire.receipt_json_aliases.length!==1)fail();
  const {record,index}=target(wire,reviewOf),alias=wire.receipt_json_aliases[0];
  if(!object(record.development.result))fail();
  if(!exact(alias,aliasKeys)||alias.record_index!==index||alias.record_id!==record.id||alias.record_revision!==record.revision||alias.serialization!=='JSON.stringify'||!exact(record.content,['receipt_result_json_alias_v1'])||record.content.receipt_result_json_alias_v1!==0)fail();
  const content=JSON.stringify(record.development.result);
  if(alias.sha256!==digest(content)||alias.utf8_bytes!==Buffer.byteLength(content,'utf8')||alias.utf16_characters!==content.length)fail();
  record.content=content;
  wire.protocol=DEVELOPMENT_FILE_BODIES_PROTOCOL;
  delete wire.receipt_json_aliases;
  const fileWireText=JSON.stringify(wire),original=restoreDevelopmentFileBodies(fileWireText,originalSha,assignmentSha,reviewOf);
  if(shareDevelopmentReceiptJSON(fileWireText,originalSha,assignmentSha,reviewOf)!==text)fail();
  return original;
}

export function renderDevelopmentReviewContext(context,job){
  const fileText=renderFileBodies(context,job);
  if(fileText===context?.text)return fileText;
  const originalSha=digest(context.text),shared=shareDevelopmentReceiptJSON(fileText,originalSha,context.hash,job.review_of);
  if(shared===fileText)return fileText;
  if(restoreDevelopmentReceiptJSON(shared,originalSha,context.hash,job.review_of)!==context.text)fail();
  return shared.length<fileText.length&&Buffer.byteLength(shared,'utf8')<Buffer.byteLength(fileText,'utf8')?shared:fileText;
}
