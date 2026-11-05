import { createHash } from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
function exact(v,keys,label) {
  if(!plain(v)||Object.keys(v).some(k=>!keys.includes(k))||Object.getOwnPropertySymbols(v).length||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,'value')))throw new Error(`Invalid ${label} fingerprint fields`);
}
function text(v,label) {if(typeof v!=='string'||!v.length||v.includes('\0'))throw new Error(`Missing ${label}`);return v;}
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
// Pure identity only: callers must supply the complete hermetic inputs and
// establish canonical execution provenance separately. No IO or model calls.
export function fingerprintValidation(input) {
  exact(input,['files','tests','command','runtime','sandbox','environment','limits'],'validation');
  if(!Array.isArray(input.files)||!input.files.length)throw new Error('Missing candidate manifest');
  const files=input.files.map(f=>{exact(f,['path','sha256'],'file');text(f.path,'file path');if(!sha(f.sha256))throw new Error('Invalid file hash');return {...f};}).sort((a,b)=>a.path.localeCompare(b.path));
  if(new Set(files.map(f=>f.path)).size!==files.length)throw new Error('Duplicate file path');
  if(!Array.isArray(input.tests)||!input.tests.length||new Set(input.tests).size!==input.tests.length||input.tests.some(p=>!files.some(f=>f.path===p)))throw new Error('Tests must reference complete manifest');
  if(!Array.isArray(input.command)||!input.command.length)throw new Error('Missing validation command');
  input.command.forEach(v=>text(v,'command argument'));
  exact(input.runtime,['node','platform','arch','os_release','system_build','dependencies','executable_sha256','runner_sha256'],'runtime');
  for(const k of ['node','platform','arch','os_release','system_build'])text(input.runtime[k],k);
  if(!Array.isArray(input.runtime.dependencies)||!input.runtime.dependencies.length)throw Error('Missing runtime dependencies');
  for(const d of input.runtime.dependencies){exact(d,['path','sha256'],'runtime dependency');text(d.path,'dependency path');if(!sha(d.sha256))throw Error('Missing runtime dependency bytes');}
  if(new Set(input.runtime.dependencies.map(d=>d.path)).size!==input.runtime.dependencies.length)throw Error('Duplicate runtime dependency');
  if(!sha(input.runtime.executable_sha256)||!sha(input.runtime.runner_sha256))throw new Error('Missing runtime/toolchain bytes');
  exact(input.sandbox,['backend','policy_sha256'],'sandbox');text(input.sandbox.backend,'sandbox backend');
  if(!sha(input.sandbox.policy_sha256))throw new Error('Missing sandbox policy hash');
  if(!plain(input.environment))throw new Error('Missing hermetic environment');
  exact(input.environment,Object.keys(input.environment),'environment');
  for(const [key,value] of Object.entries(input.environment)){text(key,'environment key');text(value,'environment value');}
  exact(input.limits,['timeout_ms','max_output_bytes'],'limits');
  for(const n of Object.values(input.limits))if(!Number.isSafeInteger(n)||n<1)throw new Error('Invalid validation limit');
  if(Object.keys(input.limits).length!==2)throw new Error('Missing validation limits');
  // Values, including explicitly supplied environment, are hashed only; never
  // put raw secrets or environment data into a durable reuse receipt.
  return hash(JSON.stringify(canonical({...input,files,tests:[...input.tests].sort()})));
}
export function validateReusableReceipt(receipt,fingerprint) {
  if(!sha(fingerprint)||!plain(receipt)||receipt.kind!=='artifact'||receipt.status!=='Submitted'||receipt.author_role!=='runtime')return false;
  const d=receipt.development,r=d?.result;
  return d?.type==='test' && d.validation_fingerprint===fingerprint && plain(r)
    && r.status==='passed' && r.exit_code===0 && r.tests_executed===true
    && r.reused!==true && !r.reuse && !r.error && !r.output_truncated && r.signal==null
    && sha(d.receipt_sha256) && d.receipt_sha256===hash(JSON.stringify(r))
    && receipt.content===JSON.stringify(r);
}
export function confirmValidationFingerprint(before,after) {
  if(!sha(before)||!sha(after)||before!==after)throw Error('Validation environment changed during execution; result cannot qualify for acceptance or reuse');
}
