import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createPolicySupervisor,inspectOriginalCompiledCodexPlan,claimOriginalCompiledCodexPlan,originalCompiledPeerContextInterpreter,inspectOriginalCompiledBootstrapScope} from '../plugins/soloco/runtime/peers/policy-supervisor.mjs';
import {isOriginalBootstrapMembershipInterpreter} from '../plugins/soloco/runtime/peers/protected-source-build-slot.mjs';

// Pure policy DATA and rejection tests only. No selected interpreter, compiled
// plan, original native capability, credential read, process or network exists.
const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/policy-supervisor.mjs',import.meta.url));
const code=expected=>error=>error?.code===expected;
async function helpers(t){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-pure-policy-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=fs.readFileSync(production,'utf8').replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(pathToFileURL(path.resolve(path.dirname(production),specifier)).href));
  const file=path.join(root,'pure-profile-under-test.mjs');fs.writeFileSync(file,source+'\nexport const __testOnlyPolicyData=Object.freeze({compileProfile,fixedArgv,fixedEnvironment,validateRequest});\n');
  return (await import(pathToFileURL(file).href)).__testOnlyPolicyData;
}
function profile(){return {executable:'/synthetic/runtime/companion',runtime:[{path:'/synthetic/runtime/companion'},{path:'/synthetic/runtime/node'},{path:'/usr/bin/sandbox-exec'}],reads:[{path:'/synthetic/repo/docs',directory:true},{path:'/synthetic/repo/input.json',directory:false}],original_home:'/synthetic/original-codex',state_root:'/synthetic/scope/state',scratch_root:'/synthetic/scope/scratch',cwd:'/synthetic/repo',gateway_port:54321};}
function parse(text){
  const tokens=text.match(/\(|\)|"(?:\\.|[^"\\])*"|[^\s()]+/g)??[];let offset=0;
  const value=()=>{const token=tokens[offset++];if(token==='('){const items=[];while(tokens[offset]!==')'){assert.ok(offset<tokens.length,'unterminated expression');items.push(value());}offset++;return items;}assert.notEqual(token,')');return token.startsWith('"')?JSON.parse(token):token;};
  const forms=[];while(offset<tokens.length)forms.push(value());return forms;
}
const allowed=(forms,permission)=>forms.filter(form=>form[0]==='allow'&&form[1]===permission);

test('the pure profile permits only the exact selected IPv4 broker port',async t=>{
  const api=await helpers(t),p=profile(),forms=parse(api.compileProfile(p));
  assert.deepEqual(allowed(forms,'network-outbound'),[['allow','network-outbound',['remote','tcp4','127.0.0.1:54321']]]);
  assert.deepEqual(allowed(forms,'network-inbound'),[]);assert.deepEqual(allowed(forms,'network-bind'),[]);
  p.gateway_port=54322;assert.deepEqual(allowed(parse(api.compileProfile(p)),'network-outbound'),[['allow','network-outbound',['remote','tcp4','127.0.0.1:54322']]]);
  for(const port of [0,65536,Infinity,'443'])assert.throws(()=>api.compileProfile({...p,gateway_port:port}),code('SUPERVISOR_ARGUMENT'));
});

test('the pure profile reads original config and auth as literals and writes only scoped state and scratch',async t=>{
  const api=await helpers(t),p=profile(),forms=parse(api.compileProfile(p)),reads=allowed(forms,'file-read*').flatMap(form=>form.slice(2));
  for(const name of ['config.toml','auth.json'])assert.ok(reads.some(rule=>rule[0]==='literal'&&rule[1]===path.join(p.original_home,name)));
  assert.equal(reads.some(rule=>rule[0]==='subpath'&&rule[1]===p.original_home),false);
  assert.deepEqual(allowed(forms,'file-write*'),[['allow','file-write*',['subpath',p.state_root],['subpath',p.scratch_root],['literal','/dev/null']]]);
  assert.equal(allowed(forms,'file-write*').flat(2).includes(p.original_home),false);
});

test('the pure profile keeps one selected executable and no process-fork allowance',async t=>{
  const api=await helpers(t),p=profile(),forms=parse(api.compileProfile(p));
  assert.deepEqual(allowed(forms,'process-exec'),[['allow','process-exec',['literal',p.executable]]]);
  assert.deepEqual(allowed(forms,'process-fork'),[]);assert.ok(forms.some(form=>form[0]==='deny'&&form[1]==='default'));
});

test('fixed argv and environment preserve original homes without proxy variables or caller commands',async t=>{
  const api=await helpers(t),args=api.fixedArgv('/synthetic/scope/state','/synthetic/repo'),environment=api.fixedEnvironment('/synthetic/user','/synthetic/original-codex','/synthetic/scope/scratch');
  assert.deepEqual(args,['--soloco-protected-host-v2','--state-root','/synthetic/scope/state','--cwd','/synthetic/repo']);
  assert.deepEqual(Object.keys(environment).sort(),['CODEX_HOME','HOME','LANG','LC_ALL','PATH','TEMP','TMP','TMPDIR']);
  assert.equal(environment.HOME,'/synthetic/user');assert.equal(environment.CODEX_HOME,'/synthetic/original-codex');
  assert.ok(Object.isFrozen(args)&&Object.isFrozen(environment));assert.throws(()=>{args.push('--command');},TypeError);assert.throws(()=>{environment.HTTPS_PROXY='http://example.invalid';},TypeError);
});

test('policy path injection and executable-kind widening are rejected before formatting',async t=>{
  const api=await helpers(t),p=profile();
  for(const executable of ['/synthetic/../escape','relative','/synthetic/quote"','/synthetic/null\0'])assert.throws(()=>api.compileProfile({...p,executable}),code('SUPERVISOR_PATH'));
  const request={kind:'codex-companion',cwd:p.cwd,read_paths:[],state_root:p.state_root,scratch_root:p.scratch_root,gateway_port:p.gateway_port};
  for(const kind of ['codex','node-fixture','arbitrary'])assert.throws(()=>api.validateRequest({...request,kind}),code('SUPERVISOR_ARGUMENT'));
  assert.throws(()=>api.validateRequest({...request,command:'anything'}),code('SUPERVISOR_ARGUMENT'));
  let getters=0;const accessor={...request};Object.defineProperty(accessor,'kind',{enumerable:true,get(){getters++;return 'codex-companion';}});
  assert.throws(()=>api.validateRequest(accessor),code('SUPERVISOR_ARGUMENT'));assert.equal(getters,0);
  const pathAccessor=[];Object.defineProperty(pathAccessor,'0',{enumerable:true,get(){getters++;return '/synthetic/repo';}});
  const iterator=['/synthetic/repo'];iterator[Symbol.iterator]=function*(){getters++;yield '/synthetic/repo';};
  for(const read_paths of [pathAccessor,iterator,[,],['/synthetic/repo','/synthetic/repo']])assert.throws(()=>api.validateRequest({...request,read_paths}),code('SUPERVISOR_ARGUMENT'));
  assert.equal(getters,0);
});

test('public constructors expose only compilation and reject callbacks, symlink roots and foreign owners',t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-policy-owner-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const owner=Symbol('source test owner'),supervisor=createPolicySupervisor({owner,directory:root});assert.deepEqual(Object.keys(supervisor),['compile']);
  let callbacks=0;assert.throws(()=>createPolicySupervisor({owner,directory:root,before_spawn(){callbacks++;}}),code('SUPERVISOR_ARGUMENT'));assert.equal(callbacks,0);
  assert.throws(()=>supervisor.compile(Symbol('source test owner'),{}),code('SUPERVISOR_OWNER'));
  const linked=path.join(root,'linked-root');fs.symlinkSync(root,linked);assert.throws(()=>createPolicySupervisor({owner,directory:linked}),code('SUPERVISOR_PATH'));
});

test('an unprepared compile or forged interpreter cannot issue a companion plan',t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-policy-held-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const owner=Symbol('source test owner'),supervisor=createPolicySupervisor({owner,directory:root}),p=profile();
  const request={kind:'codex-companion',cwd:p.cwd,read_paths:[],state_root:p.state_root,scratch_root:p.scratch_root,gateway_port:p.gateway_port};
  assert.throws(()=>supervisor.compile(owner,request),code('SUPERVISOR_CONTEXT_INTERPRETER_REQUIRED'));
  assert.throws(()=>supervisor.compile(owner,request,{context_interpreter:{protocol:'source-associated'}}),code('CONTEXT_INTERPRETER_UNAVAILABLE'));
  assert.throws(()=>supervisor.compile(owner,{...request,kind:'node-fixture'},{context_interpreter:{}}),code('SUPERVISOR_ARGUMENT'));
});

test('serialized plan DATA never replaces an original owner-bound handle',()=>{
  const owner=Symbol('source test owner'),fake=Object.freeze({protocol:'original-compiled-codex-plan-v1',launch_mode:'companion-v2',consumed:false});
  for(const handle of [fake,{},null,undefined])for(const operation of [inspectOriginalCompiledCodexPlan,claimOriginalCompiledCodexPlan,originalCompiledPeerContextInterpreter])assert.throws(()=>operation(owner,handle),code('SUPERVISOR_CODEX_PLAN_REQUIRED'));
});

test('copied bootstrap descriptor DATA cannot select the private interpreter brand or compile a plan',t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-policy-bootstrap-held-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const owner=Symbol('synthetic bootstrap policy owner'),supervisor=createPolicySupervisor({owner,directory:root}),p=profile(),request={kind:'codex-companion',cwd:p.cwd,read_paths:[],state_root:p.state_root,scratch_root:p.scratch_root,gateway_port:p.gateway_port};
  const selection={protocol:'soloco-bootstrap-membership-context-contract-v1',contract_id:'bootstrap-membership-readonly3-whole-assignment-v1',resource_sha256:'cd1ce3adaad300721e47238292ce15dc41f7007b6e415b76c005e93419656ed4',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:'soloco-bootstrap-membership-readonly3-v1'};
  for(const copied of [{},selection,JSON.parse(JSON.stringify(selection)),Object.freeze({selection,protocol:'soloco-bootstrap-membership-interpreter-binding-v1'})]){assert.equal(isOriginalBootstrapMembershipInterpreter(copied),false);assert.throws(()=>supervisor.compile(owner,request,{context_interpreter:copied}),code('CONTEXT_INTERPRETER_UNAVAILABLE'));}
  assert.throws(()=>supervisor.compile(owner,request,{context_interpreter:{},scope_profile_id:selection.scope_profile_id}),code('SUPERVISOR_ARGUMENT'));
  assert.throws(()=>supervisor.compile(owner,{...request,kind:'bootstrap-companion'},{context_interpreter:{}}),code('SUPERVISOR_ARGUMENT'));
});

test('bootstrap scope inspection requires the same original compiled plan rather than matching JSON',()=>{
  const owner=Symbol('synthetic bootstrap plan owner');
  for(const handle of [{},null,undefined,Object.freeze({protocol:'original-compiled-codex-plan-v1',context_interpreter:{scope_profile_id:'soloco-bootstrap-membership-readonly3-v1'},scope_root:'/SYNTHETIC/scope'})])assert.throws(()=>inspectOriginalCompiledBootstrapScope(owner,handle),code('SUPERVISOR_CODEX_PLAN_REQUIRED'));
});
