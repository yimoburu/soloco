import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fingerprintValidation,validationManifest,validationManifestMatches,validateReusableReceipt,confirmValidationFingerprint} from '../plugins/soloco/runtime/validation-cache.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const input=()=>({files:[{path:'x.mjs',sha256:hash('code')},{path:'x.test.mjs',sha256:hash('test')}],tests:['x.test.mjs'],command:['node','--test','x.test.mjs'],runtime:{node:'v25',platform:'darwin',arch:'arm64',os_release:'fixture-kernel',system_build:'fixture-build',dependencies:[{path:'/fixture/library',sha256:'a'.repeat(64)}],executable_sha256:hash('node'),runner_sha256:hash('runner')},sandbox:{backend:'seatbelt',policy_sha256:hash('policy')},environment:{LANG:'C'},limits:{timeout_ms:1000,max_output_bytes:10000}});
const fixtureIdentity=()=>({selection:{protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'},template_sha256:hash('fixed template'),factory_source_sha256:hash('factory source')});
const fixtureEnvironment=()=>({SOLOCO_TEST_FIXTURE_MANIFEST:{scratch_relative:'fixtures/manifest.json'},SOLOCO_TEST_FIXTURE_MANIFEST_SHA256:{runtime_result:'test_fixture.setup.manifest_sha256'}});
const fixtureInput=()=>({...input(),test_fixture:fixtureIdentity(),fixture_environment:fixtureEnvironment()});
function receipt(fingerprint){const result={status:'passed',exit_code:0,tests_executed:true,signal:null};return {kind:'artifact',status:'Submitted',author_role:'runtime',content:JSON.stringify(result),development:{type:'test',validation_fingerprint:fingerprint,result,receipt_sha256:hash(JSON.stringify(result))}};}
test('fingerprints bind complete source/test/runtime/policy/command/env/limits, canonicalize maps only',()=>{
 const a=input(),base=fingerprintValidation(a),reordered=input();reordered.files.reverse();reordered.runtime=Object.fromEntries(Object.entries(reordered.runtime).reverse());assert.equal(fingerprintValidation(reordered),base);
 for(const mutate of [x=>x.files[0].sha256=hash('changed'),x=>x.files[1].sha256=hash('new test'),x=>x.command.push('--extra'),x=>x.runtime.node='v26',x=>x.runtime.system_build='other-build',x=>x.runtime.os_release='new-kernel',x=>x.runtime.dependencies[0].sha256=hash('updated dylib'),x=>x.runtime.executable_sha256=hash('other node'),x=>x.runtime.runner_sha256=hash('new runner'),x=>x.sandbox.policy_sha256=hash('new policy'),x=>x.environment.LANG='EN',x=>x.limits.timeout_ms++]){const v=input();mutate(v);assert.notEqual(fingerprintValidation(v),base);}
 assert.ok(!base.includes('LANG'));assert.match(base,/^[a-f0-9]{64}$/);
});
test('missing and untracked fingerprint components are non-reusable',()=>{
 for(const mutate of [x=>delete x.environment,x=>delete x.runtime.runner_sha256,x=>delete x.runtime.system_build,x=>delete x.runtime.dependencies,x=>x.files.push(x.files[0]),x=>x.tests=['missing'],x=>x.runtime.unknown='ignore me',x=>delete x.limits.timeout_ms,x=>x.limits.timeout_ms=Infinity]){const v=input();mutate(v);assert.throws(()=>fingerprintValidation(v));}
 const v=input();Object.defineProperty(v.runtime,'node',{get(){throw Error('must not execute');},enumerable:true});assert.throws(()=>fingerprintValidation(v),/Invalid runtime/);
});
test('only exact original successful runtime evidence is eligible, never acceptance or chained reuse',()=>{
 const fp=fingerprintValidation(input());assert.equal(validateReusableReceipt(receipt(fp),fp),true);
 for(const mutate of [r=>r.status='Quarantined',r=>r.author_role='engineer',r=>r.content='fake',r=>r.development.validation_fingerprint=hash('stale'),r=>r.development.result.tests_executed=false,r=>r.development.result.status='failed',r=>r.development.result.reused=true,r=>r.development.result.output_truncated=true,r=>r.development.receipt_sha256=hash('tamper')]){const r=receipt(fp);mutate(r);assert.equal(validateReusableReceipt(r,fp),false);}
 assert.equal(validateReusableReceipt(null,fp),false);
});
test('post-execution confirmation holds toolchain changes and incomplete rediscovery',()=>{
 const before=fingerprintValidation(input());assert.doesNotThrow(()=>confirmValidationFingerprint(before,fingerprintValidation(input())));
 const changed=input();changed.runtime.dependencies.push({path:'/fixture/newly-discovered-library',sha256:hash('new load command')});
 assert.throws(()=>confirmValidationFingerprint(before,fingerprintValidation(changed)),/changed during execution/);
 changed.runtime.dependencies[1].sha256=hash('in-place update');assert.throws(()=>confirmValidationFingerprint(before,fingerprintValidation(changed)),/changed during execution/);
 assert.throws(()=>confirmValidationFingerprint(before,undefined),/changed during execution/);
});
test('new review manifests expose exact toolchain commitments without raw host paths or environment values',()=>{
 const v=input();v.environment.PRIVATE_FIXTURE_KEY='never-publish-this-value';v.runtime.dependencies[0].path='/private/fictional-owner/library';v.command.push('/private/fictional-owner/argument');
 const fp=fingerprintValidation(v),manifest=validationManifest(v),wire=JSON.stringify(manifest);
 assert.equal(manifest.validation_fingerprint,fp);assert.equal(manifest.runtime.node,v.runtime.node);assert.deepEqual(manifest.files,v.files);
 for(const hidden of ['never-publish-this-value','PRIVATE_FIXTURE_KEY','/private/fictional-owner'])assert(!wire.includes(hidden));
 const r=receipt(fp);r.development.validation_manifest=manifest;r.development.result.validation_manifest_sha256=hash(wire);r.content=JSON.stringify(r.development.result);r.development.receipt_sha256=hash(r.content);
 assert.equal(validationManifestMatches(r),true);assert.equal(validateReusableReceipt(r,fp),true);
 for(const mutate of [r=>r.development.validation_manifest.runtime.node='changed',r=>delete r.development.validation_manifest,r=>r.development.result.validation_manifest_sha256=hash('fake')]){const altered=structuredClone(r);mutate(altered);assert.equal(validateReusableReceipt(altered,fp),false);}
 const old=receipt(fp),before=JSON.stringify(old);assert.equal(validateReusableReceipt(old,fp),true);assert.equal(JSON.stringify(old),before);
 delete v.runtime.dependencies;assert.throws(()=>validationManifest(v),/dependencies/);
});
test('fixture identity and result-bound environment policy change the fingerprint without pretending per-run values are static',()=>{
 const a=fixtureInput(),base=fingerprintValidation(a);
 assert.notEqual(base,fingerprintValidation(input()));
 for(const mutate of [x=>x.test_fixture.template_sha256=hash('changed template'),x=>x.test_fixture.factory_source_sha256=hash('changed factory')]){const changed=fixtureInput();mutate(changed);assert.notEqual(fingerprintValidation(changed),base);}
 const manifest=validationManifest(a);assert.equal(manifest.version,2);assert.deepEqual(manifest.test_fixture,a.test_fixture);assert.deepEqual(manifest.fixture_environment,a.fixture_environment);
 assert.equal(manifest.reuse_policy,'fixture_reuse_not_qualified');assert.match(manifest.environment_binding,/per-run/);
 const legacy=validationManifest(input());assert.equal(legacy.version,1);assert.equal(Object.hasOwn(legacy,'test_fixture'),false);assert.equal(Object.hasOwn(legacy,'fixture_environment'),false);
});
test('fixture fingerprints reject untracked selectors, identities and environment values',()=>{
 for(const mutate of [x=>delete x.fixture_environment,x=>x.test_fixture.selection.path='/outside',x=>x.test_fixture.selection.factory='other',x=>delete x.test_fixture.selection,x=>x.test_fixture.template_sha256='unknown',x=>x.test_fixture.inode=1,x=>x.fixture_environment.SOLOCO_TEST_FIXTURE_MANIFEST.scratch_relative='../outside',x=>x.fixture_environment.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256.runtime_result='child_supplied_hash',x=>x.fixture_environment.EXTRA='untracked',x=>x.environment.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256=hash('dynamic value')]){const v=fixtureInput();mutate(v);assert.throws(()=>fingerprintValidation(v));}
 for(const value of [null,undefined])assert.throws(()=>fingerprintValidation({...input(),test_fixture:value,fixture_environment:fixtureEnvironment()}));
 assert.throws(()=>fingerprintValidation({...input(),fixture_environment:fixtureEnvironment()}));
});
test('fixture runtime manifests bind actual setup identity but never qualify deterministic reuse',()=>{
 const v=fixtureInput(),manifest=validationManifest(v),r=receipt(manifest.validation_fingerprint);
 r.development.validation_manifest=manifest;
 r.development.result.test_fixture={identity:fixtureIdentity(),setup:{prepared_before_child:true,manifest_sha256:hash('actual per-run manifest'),child_environment_sha256:hash('actual child environment')},termination_confirmed:true,cleanup:{status:'confirmed'}};
 r.development.result.validation_manifest_sha256=hash(JSON.stringify(manifest));r.content=JSON.stringify(r.development.result);r.development.receipt_sha256=hash(r.content);
 assert.equal(validationManifestMatches(r),true);assert.equal(validateReusableReceipt(r,manifest.validation_fingerprint),false);
 for(const mutate of [x=>x.development.result.test_fixture.identity.factory_source_sha256=hash('other factory'),x=>delete x.development.result.test_fixture.setup.child_environment_sha256,x=>x.development.result.test_fixture.setup.prepared_before_child=false,x=>x.development.result.test_fixture.termination_confirmed=false,x=>x.development.result.test_fixture.cleanup.status='failed',x=>delete x.development.validation_manifest.fixture_environment]){const altered=structuredClone(r);mutate(altered);if(altered.development.validation_manifest)altered.development.result.validation_manifest_sha256=hash(JSON.stringify(altered.development.validation_manifest));assert.equal(validationManifestMatches(altered),false);}
 const missing=structuredClone(r);delete missing.development.validation_manifest;delete missing.development.result.validation_manifest_sha256;assert.equal(validationManifestMatches(missing),false);
 const downgraded=structuredClone(r);downgraded.development.validation_manifest.version=1;downgraded.development.result.validation_manifest_sha256=hash(JSON.stringify(downgraded.development.validation_manifest));assert.equal(validationManifestMatches(downgraded),false);
});
