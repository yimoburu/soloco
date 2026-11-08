import { createHash } from 'node:crypto';
import { normalizeTestFixture } from './test-fixtures.mjs';
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
function fixtureIdentity(value) {
  exact(value,['selection','template_sha256','factory_source_sha256'],'test fixture');
  if(Object.keys(value).length!==3||!sha(value.template_sha256)||!sha(value.factory_source_sha256))throw Error('Missing test fixture static identity');
  if(normalizeTestFixture(value.selection)===null)throw Error('Missing test fixture selector');
  return canonical(value);
}
const fixtureEnvironment={SOLOCO_TEST_FIXTURE_MANIFEST:{scratch_relative:'fixtures/manifest.json'},SOLOCO_TEST_FIXTURE_MANIFEST_SHA256:{runtime_result:'test_fixture.setup.manifest_sha256'}};
function fixtureEnvironmentBinding(value) {
  exact(value,Object.keys(fixtureEnvironment),'fixture environment');
  for(const [key,expected] of Object.entries(fixtureEnvironment))exact(value[key],Object.keys(expected),'fixture environment binding');
  if(JSON.stringify(canonical(value))!==JSON.stringify(canonical(fixtureEnvironment)))throw Error('Invalid fixture environment binding');
  return canonical(value);
}
// Pure identity only: callers must supply the complete hermetic inputs and
// establish canonical execution provenance separately. No IO or model calls.
export function fingerprintValidation(input) {
  exact(input,['files','tests','command','runtime','sandbox','environment','limits','test_fixture','fixture_environment'],'validation');
  if(Object.hasOwn(input,'test_fixture')){fixtureIdentity(input.test_fixture);fixtureEnvironmentBinding(input.fixture_environment);}
  else if(Object.hasOwn(input,'fixture_environment'))throw Error('Fixture environment requires a planned test fixture');
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
  if(Object.hasOwn(input,'test_fixture')&&Object.keys(fixtureEnvironment).some(key=>Object.hasOwn(input.environment,key)))throw Error('Per-run fixture environment values belong in runtime setup evidence');
  for(const [key,value] of Object.entries(input.environment)){text(key,'environment key');text(value,'environment value');}
  exact(input.limits,['timeout_ms','max_output_bytes'],'limits');
  for(const n of Object.values(input.limits))if(!Number.isSafeInteger(n)||n<1)throw new Error('Invalid validation limit');
  if(Object.keys(input.limits).length!==2)throw new Error('Missing validation limits');
  // Values, including explicitly supplied environment, are hashed only; never
  // put raw secrets or environment data into a durable reuse receipt.
  return hash(JSON.stringify(canonical({...input,files,tests:[...input.tests].sort()})));
}
// Runtime-attested, inspectable evidence for independent reuse qualification.
// Raw environment values and host dependency/permission paths remain hashed.
// Redacted commitments do not let a reviewer recompute the private fingerprint.
export function validationManifest(input) {
  const validation_fingerprint=fingerprintValidation(input);
  const visible=new Set(['node','--permission','--test','--test-isolation=none','--experimental-test-isolation=none','--test-concurrency=1','--test-reporter=tap','--test-force-exit',...input.tests.map(p=>'./'+p)]);
  return {version:Object.hasOwn(input,'test_fixture')?2:1,validation_fingerprint,attestation:'runtime_captured_inputs; redacted commitments are not independent recomputation',
    ...(Object.hasOwn(input,'test_fixture')?{test_fixture:fixtureIdentity(input.test_fixture),fixture_environment:fixtureEnvironmentBinding(input.fixture_environment),environment_binding:'base environment committed below; fixture environment values attested in per-run setup',reuse_policy:'fixture_reuse_not_qualified'}:{}),
    files:input.files.map(f=>({...f})).sort((a,b)=>a.path.localeCompare(b.path)),tests:[...input.tests].sort(),
    command:input.command.map(argument=>visible.has(argument)?{argument}:{argument_sha256:hash(argument)}),command_sha256:hash(JSON.stringify(input.command)),
    runtime:{node:input.runtime.node,platform:input.runtime.platform,arch:input.runtime.arch,os_release:input.runtime.os_release,system_build:input.runtime.system_build,executable_sha256:input.runtime.executable_sha256,runner_sha256:input.runtime.runner_sha256,dependencies:input.runtime.dependencies.map(d=>({path_sha256:hash(d.path),sha256:d.sha256}))},
    sandbox:{...input.sandbox},environment_sha256:hash(JSON.stringify(canonical(input.environment))),limits:{...input.limits}};
}
export function validationManifestMatches(receipt) {
  const d=receipt?.development,manifest=d?.validation_manifest,bound=d?.result?.validation_manifest_sha256;
  if(manifest===undefined&&bound===undefined)return d?.result?.test_fixture===undefined; // Preserve legacy no-fixture receipts.
  if(!plain(manifest)||!sha(bound)||hash(JSON.stringify(manifest))!==bound||manifest.validation_fingerprint!==d.validation_fingerprint)return false;
  if(manifest.version===1)return !Object.hasOwn(manifest,'test_fixture')&&!Object.hasOwn(manifest,'fixture_environment')&&!Object.hasOwn(d.result??{},'test_fixture');
  if(manifest.version!==2||manifest.reuse_policy!=='fixture_reuse_not_qualified')return false;
  try{const fixture=d.result?.test_fixture,setup=fixture?.setup;fixtureEnvironmentBinding(manifest.fixture_environment);return fixture?.termination_confirmed===true&&fixture.cleanup?.status==='confirmed'&&setup?.prepared_before_child===true&&sha(setup.manifest_sha256)&&sha(setup.child_environment_sha256)&&JSON.stringify(fixtureIdentity(manifest.test_fixture))===JSON.stringify(fixtureIdentity(fixture.identity));}catch{return false;}
}
export function validateReusableReceipt(receipt,fingerprint) {
  if(!sha(fingerprint)||!plain(receipt)||receipt.kind!=='artifact'||receipt.status!=='Submitted'||receipt.author_role!=='runtime')return false;
  const d=receipt.development,r=d?.result;
  if(d?.validation_manifest?.test_fixture!==undefined||r?.test_fixture!==undefined)return false;
  return d?.type==='test' && d.validation_fingerprint===fingerprint && validationManifestMatches(receipt) && plain(r)
    && r.status==='passed' && r.exit_code===0 && r.tests_executed===true
    && r.reused!==true && !r.reuse && !r.error && !r.output_truncated && r.signal==null
    && sha(d.receipt_sha256) && d.receipt_sha256===hash(JSON.stringify(r))
    && receipt.content===JSON.stringify(r);
}
export function confirmValidationFingerprint(before,after) {
  if(!sha(before)||!sha(after)||before!==after)throw Error('Validation environment changed during execution; result cannot qualify for acceptance or reuse');
}
