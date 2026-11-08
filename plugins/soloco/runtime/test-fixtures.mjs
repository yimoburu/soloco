// Trusted parent-only fixtures. A selector never supplies a path, target or code.
// The two-link fixture follows the independently retained P5 real-transfer
// prototype; this implementation and its attestations are qualified separately.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const hash=value=>createHash('sha256').update(value).digest('hex');
// Capture the qualified loaded module's source immediately, not on its first
// later call. Import performs no mutation or privileged fixture preparation.
const loadedSourceHash=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const PROTOCOL='scratch-fixture-contract-v1',FACTORY='p5-transfer-two-real-links-v1';
const COMPANY='cases/transfer-faults/company';
const TARGET=COMPANY+'/.company/evidence.txt';
export const TEST_FIXTURE_MANIFEST='fixtures/manifest.json';
const LINKS=Object.freeze([
  Object.freeze({id:'company-entry',staged_relative_path:'fixtures/links/company-entry',target_relative_path:TARGET,target_absent_at_setup:true}),
  Object.freeze({id:'backup-entry',staged_relative_path:'fixtures/links/backup-entry',target_relative_path:TARGET,target_absent_at_setup:true})
]);
const TEMPLATE=Object.freeze({protocol:PROTOCOL,factory:FACTORY,company_root:COMPANY,target_relative_path:TARGET,target_absent_at_setup:true,links:LINKS});
function exactObject(value,keys,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label} must be a closed plain object`);
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw Error(`${label} has unsupported fields`);
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw Error(`${label} requires plain own fields`);}
}
export function normalizeTestFixture(value) {
  if(value===undefined)return null;
  exactObject(value,['protocol','factory'],'Test fixture selection');
  if(value.protocol!==PROTOCOL||value.factory!==FACTORY)throw Error('Unsupported test fixture protocol or factory');
  return Object.freeze({protocol:PROTOCOL,factory:FACTORY});
}
function factorySourceHash() {
  const actual=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  if(actual!==loadedSourceHash)throw Error('Test fixture factory source changed after loading; reload the qualified runtime');
  return actual;
}
export function testFixtureIdentity(value) {
  const selection=normalizeTestFixture(value);if(!selection)return null;
  return Object.freeze({selection,template_sha256:hash(JSON.stringify(TEMPLATE)),factory_source_sha256:factorySourceHash()});
}
export function assertTestFixtureIdentity(value) {
  exactObject(value,['selection','template_sha256','factory_source_sha256'],'Test fixture identity');
  const expected=testFixtureIdentity(value.selection);
  if(value.template_sha256!==expected.template_sha256||value.factory_source_sha256!==expected.factory_source_sha256)throw Error('Test fixture identity does not match the qualified factory');
  return expected;
}
function absent(file) {
  try{fs.lstatSync(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}
}
export function scratchIdentity(scratch) {
  if(typeof scratch!=='string'||!path.isAbsolute(scratch)||path.resolve(scratch)!==scratch)throw Error('Fixture scratch must be an exact absolute directory');
  const stat=fs.lstatSync(scratch,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(scratch)!==scratch)throw Error('Fixture scratch must be a real canonical directory');
  return {path:scratch,dev:String(stat.dev),ino:String(stat.ino)};
}
function sameScratch(scratch,expected) {
  const actual=scratchIdentity(scratch);
  if(!expected||actual.path!==expected.path||actual.dev!==expected.dev||actual.ino!==expected.ino)throw Error('Fixture scratch identity changed; cleanup refused');
  return actual;
}
// Caller owns a newly created empty scratch directory, after candidate checking.
// Failure leaves truthful partial output for the caller's guarded cleanup.
export function prepareTestFixture(scratch,identity) {
  const current=assertTestFixtureIdentity(identity),owned=scratchIdentity(scratch);
  if(fs.readdirSync(scratch).length)throw Error('Fixture requires a newly owned empty scratch directory');
  const company=path.join(scratch,COMPANY),target=path.join(scratch,TARGET);
  fs.mkdirSync(company,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(scratch,'fixtures/links'),{recursive:true,mode:0o700});
  if(fs.readdirSync(company).length||!absent(target))throw Error('Fixture company root or future target was already populated');
  const links=LINKS.map(link=>{
    const file=path.join(scratch,link.staged_relative_path);
    fs.symlinkSync(target,file);
    const stat=fs.lstatSync(file,{bigint:true}),readlink=fs.readlinkSync(file);
    if(!stat.isSymbolicLink()||readlink!==target||!absent(target))throw Error('Fixed real-link fixture setup mismatch');
    return {...link,symbolic_link:true,dev:String(stat.dev),ino:String(stat.ino),readlink_target:readlink};
  });
  const manifest={...TEMPLATE,identity:current,scratch_root:scratch,links};
  const bytes=Buffer.from(JSON.stringify(manifest));
  if(bytes.length>4096)throw Error('Fixed fixture manifest exceeds 4096 bytes');
  const file=path.join(scratch,TEST_FIXTURE_MANIFEST);
  fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  const saved=fs.readFileSync(file);
  if(!saved.equals(bytes))throw Error('Fixture manifest verification failed');
  return {protocol:'scratch-fixture-setup-v1',identity:current,scratch:owned,
    company_root:COMPANY,target_relative_path:TARGET,target_absent_at_setup:true,
    company_root_empty_at_setup:true,links,manifest_path:file,
    manifest_sha256:hash(bytes),manifest_bytes:bytes.length,prepared_before_child:true};
}
// Never follow or delete a replaced root. Consumed link inodes are deliberately
// not re-attested: successful child code may rename both real links.
export function cleanupTestFixture(scratch,owned) {
  try {
    sameScratch(scratch,owned);fs.rmSync(scratch,{recursive:true,force:false});
    if(!absent(scratch))throw Error('Fixture scratch remains after cleanup');
    return {status:'confirmed',root_absent:true};
  } catch(error) {
    let root_absent=null;try{root_absent=absent(scratch);}catch{}
    return {status:'failed',root_absent,error:String(error.message)};
  }
}
export function fixtureEnvironmentBindings(identity) {
  assertTestFixtureIdentity(identity);
  return {SOLOCO_TEST_FIXTURE_MANIFEST:{scratch_relative:TEST_FIXTURE_MANIFEST},
    SOLOCO_TEST_FIXTURE_MANIFEST_SHA256:{runtime_result:'test_fixture.setup.manifest_sha256'}};
}
