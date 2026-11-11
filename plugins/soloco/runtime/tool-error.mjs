// Diagnostic presentation only. A preflight hold creates no job, source handle,
// reserved attempt, permission or durable evidence of a model's understanding.
import {createHash} from 'node:crypto';

const limit=24000;
const digest=text=>createHash('sha256').update(text).digest('hex');
const plain=value=>value!==null&&Object.getPrototypeOf(value)===Object.prototype;
const clip=value=>String(value??'').slice(0,2000);

export function toolError(error){
  const message=clip(error?.message??error);
  const basic={isError:true,content:[{type:'text',text:message}]};
  if(error?.code!=='REVIEW_PREFLIGHT_HELD'||!plain(error.preflight)||error.preflight.status!=='held')return basic;
  try{
    const raw=JSON.stringify(error.preflight),sha256=digest(raw);
    const diagnostic={code:error.code,message,status:'held',execution_authorized:false,
      preflight_reference:{sha256,total_characters:raw.length,UTF8_bytes:Buffer.byteLength(raw),retention:'Ephemeral diagnostic returned by this call; no persisted source or retrieval handle is promised.'},
      preflight:error.preflight};
    let body=JSON.stringify(diagnostic);
    if(Buffer.byteLength(body)>limit){
      delete diagnostic.preflight;
      diagnostic.preflight_not_inlined=true;
      diagnostic.hold_reasons=(Array.isArray(error.preflight.hold_reasons)?error.preflight.hold_reasons:[]).slice(0,8).map(value=>({code:clip(value?.code).slice(0,100),message:clip(value?.message).slice(0,500)}));
      diagnostic.retrieval='No complete report was delivered. Use the supported read-only preflight on a complete frozen input; a hash alone is not actionable evidence.';
      body=JSON.stringify(diagnostic);
    }
    return {isError:true,content:[{type:'text',text:body}]};
  }catch{return basic;}
}
