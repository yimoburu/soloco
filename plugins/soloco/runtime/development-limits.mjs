import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_DEVELOPMENT_BYTES=100000;
export const MAX_DEVELOPMENT_BYTES=1000000;
export const DEVELOPMENT_CONFIG='development.json';
const unlinked=file=>{try{if(fs.lstatSync(file).isSymbolicLink())throw new Error(`Development configuration refuses symbolic links: ${file}`);}catch(error){if(error.code!=='ENOENT')throw error;}};
export function developmentLimits(root=process.cwd()) {
  const resolved=fs.realpathSync(root),dir=path.join(resolved,'.company'),file=path.join(dir,DEVELOPMENT_CONFIG);
  unlinked(dir);unlinked(file);
  let max_bytes=DEFAULT_DEVELOPMENT_BYTES,source='default';
  if(fs.existsSync(file)) {
    const stat=fs.statSync(file);
    if(!stat.isFile()||stat.size>4096)throw new Error('Development configuration must be a regular JSON file at most 4096 bytes');
    let value,fd;try {
      fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      const buffer=Buffer.alloc(4097),length=fs.readSync(fd,buffer,0,buffer.length,0);
      if(length>4096)throw new Error('Configuration exceeds 4096 bytes');
      const text=buffer.subarray(0,length).toString('utf8');
      if(!Buffer.from(text).equals(buffer.subarray(0,length)))throw new Error('Configuration is not UTF-8');
      value=JSON.parse(text);
    }catch(error){throw new Error('Invalid .company/development.json: expected {"max_bytes_ceiling": integer}; '+error.message);}finally{if(fd!==undefined)fs.closeSync(fd);}
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='max_bytes_ceiling')||!Number.isSafeInteger(value.max_bytes_ceiling)||value.max_bytes_ceiling<1000||value.max_bytes_ceiling>MAX_DEVELOPMENT_BYTES)throw new Error(`Development max_bytes_ceiling must be a safe integer from 1000 to ${MAX_DEVELOPMENT_BYTES}`);
    max_bytes=value.max_bytes_ceiling;source='.company/'+DEVELOPMENT_CONFIG;
  }
  return {max_bytes,source,hard_max_bytes:MAX_DEVELOPMENT_BYTES,per_file_max_bytes:max_bytes};
}
export function assertByteBudget(value,permitted,label) {
  const actual=Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
  if(actual>permitted)throw new Error(`${label} exceeds byte limit: actual ${actual}, permitted ${permitted}, excess ${actual-permitted}`);
  return actual;
}
// JSON escaping and simultaneous original/candidate review are explicitly budgeted.
// These are transport admission bounds, not a claim about any model context window.
export function developmentTransportBudget(maxBytes) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1000||maxBytes>MAX_DEVELOPMENT_BYTES)throw new Error('Invalid development transport scope');
  return Math.max(200000,8*maxBytes+200000);
}
