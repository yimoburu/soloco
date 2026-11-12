import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectTestIsolationFlag, inspectRuntimeLibrary } from '../plugins/soloco/runtime/local-sandbox.mjs';

const stable='--test-isolation=none', experimental='--experimental-test-isolation=none';
const okay={status:0,stdout:'',stderr:''};
const unsupported={status:9,stdout:'',stderr:'bad option'};

test('isolation selection prefers stable and falls back only when needed',()=>{
  for(const supported of [stable,experimental]) {
    const calls=[];
    assert.equal(selectTestIsolationFlag((node,args)=>{
      calls.push(args[0]);return args[0]===supported?okay:unsupported;
    }),supported);
    assert.deepEqual(calls,supported===stable?[stable]:[stable,experimental]);
  }
});

test('unsupported, error, signal and timeout probes fail closed with bounded diagnostics',()=>{
  for(const failure of [unsupported,{status:null,error:new Error('spawn failed')},{status:null,signal:'SIGKILL'},
    {status:null,error:Object.assign(new Error('probe timed out'),{code:'ETIMEDOUT'})},
    {status:0,error:new Error('output limit exceeded')},
    {status:9,stderr:'x'.repeat(20000)}]) {
    let calls=0;
    assert.throws(()=>selectTestIsolationFlag(()=>{calls++;return failure;}),error=>{
      assert.match(error.message,/Node test isolation is unavailable/);
      assert.ok(error.message.includes(stable));assert.ok(error.message.includes(experimental));
      assert.match(error.message,/No unsandboxed fallback/);assert.ok(error.message.length<700);return true;
    });
    assert.equal(calls,2);
  }
  assert.equal(selectTestIsolationFlag((node,args)=>{
    if(args[0]===stable)throw new Error('spawn exception');return okay;
  }),experimental);
});

test('probes use only trusted Node and fixed code with scrubbed environment and strict bounds',()=>{
  const keys=['NODE_OPTIONS','NODE_PATH','DYLD_INSERT_LIBRARIES','SOLOCO_PROBE_SECRET'];
  const previous=keys.map(key=>process.env[key]);
  try {
    for(const key of keys)process.env[key]='must-not-be-inherited';
    let calls=0;
    selectTestIsolationFlag((node,args,options)=>{
      calls++;
      assert.equal(node,fs.realpathSync(process.execPath));
      assert.deepEqual(args,[calls===1?stable:experimental,'--eval','']);
      assert.equal(options.cwd,path.dirname(node));
      assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,10000);
      assert.equal(options.killSignal,'SIGKILL');assert.equal(options.encoding,'utf8');
      assert.deepEqual(Object.keys(options.env).sort(),['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','OPENSSL_CONF','NODE_DISABLE_COLORS'].sort());
      for(const key of keys)assert.equal(options.env[key],undefined);
      assert.equal(options.env.OPENSSL_CONF,'/dev/null');
      return calls===1?unsupported:okay;
    });
    assert.equal(calls,2);
  } finally {
    keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  }
});

test('installed trusted Node accepts the selected spelling',()=>{
  assert.ok([stable,experimental].includes(selectTestIsolationFlag()));
});

test('a cold trusted empty Node flag probe completes after one second inside its enforced startup budget',t=>{
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-cold-empty-node-probe-')));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const node=fs.realpathSync(process.execPath),wrapper=path.join(directory,'fixed-cold-node.mjs'),calls=[];
  // This closed test harness replaces itself with the actual trusted Node.
  // The selector's outer timeout therefore covers BOTH the startup delay and
  // the unchanged empty eval, with no descendant or candidate test execution.
  fs.writeFileSync(wrapper,`const node=${JSON.stringify(node)};
const args=process.argv.slice(2);
if(args.length!==3||!${JSON.stringify([stable,experimental])}.includes(args[0])||args[1]!=='--eval'||args[2]!=='')throw Error('Unexpected probe arguments');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1250);
process.execve(node,[node,...args],process.env);
`,{flag:'wx',mode:0o600});
  const selected=selectTestIsolationFlag((executable,args,options)=>{
    assert.equal(executable,node);assert.deepEqual(args.slice(1),['--eval','']);
    assert.deepEqual(Object.keys(options.env).sort(),['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','OPENSSL_CONF','NODE_DISABLE_COLORS'].sort());
    assert.equal(options.cwd,path.dirname(node));assert.equal(options.killSignal,'SIGKILL');
    const began=performance.now();
    // Do not override timeout: an old selector's one-second budget must kill
    // this actual delayed process instead of merely changing an assertion.
    const result=spawnSync(executable,[wrapper,...args],options);
    const observation={flag:args[0],timeout_ms:options.timeout,elapsed_ms:performance.now()-began,
      status:result.status,signal:result.signal,error_code:result.error?.code??null};
    calls.push(observation);t.diagnostic('Trusted empty-probe observation '+JSON.stringify(observation));
    return result;
  });
  assert.deepEqual(calls.map(call=>call.flag),selected===stable?[stable]:[stable,experimental]);
  assert.equal(new Set(calls.map(call=>call.flag)).size,calls.length,'Never retry the same flag');
  for(const call of calls){assert(call.elapsed_ms>=1000);assert.equal(call.error_code,null);assert.equal(call.signal,null);}
  assert.equal(calls.at(-1).status,0);
});

// Run wiring checks in fresh processes so builtin mocks and per-process caches
// cannot affect other tests. No candidate code or OS sandbox is executed here.
async function wiringScenario(moduleURL,mode,supported,probeFailure=null) {
  const assert=(await import('node:assert/strict')).default;
  const fs=(await import('node:fs')).default;
  const os=(await import('node:os')).default;
  const path=(await import('node:path')).default;
  const cp=(await import('node:child_process')).default;
  const {syncBuiltinESMExports}=await import('node:module');
  const {fileURLToPath}=await import('node:url');
  const {EventEmitter}=await import('node:events');
  const {createHash,randomBytes}=await import('node:crypto');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-flag-wiring-')));
  const scratch=path.join(root,'.scratch');fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(root,'sample.test.mjs'),'throw new Error("must never execute");');
  const probes=[],launches=[];
  const exists=fs.existsSync;
  fs.existsSync=file=>file==='/usr/bin/sandbox-exec'||exists(file);
  Object.defineProperty(process,'platform',{value:'darwin'});
  const checkLaunch=args=>{
    assert.equal(args[0],'-p');assert.match(args[1],/\(deny default\)/);
    assert.match(args[1],/\(allow process-exec \(literal /);
    assert.equal(args[2],fs.realpathSync(process.execPath));
    assert.ok(args.includes(supported));
    assert.equal(args.filter(arg=>/test-isolation=/.test(arg)).length,1);
    for(const flag of ['--permission','--test','--test-concurrency=1','--test-reporter=tap','--test-force-exit'])assert.ok(args.includes(flag));
    assert.ok(args.some(arg=>arg.startsWith('--allow-fs-read=')));
    assert.ok(args.some(arg=>arg.startsWith('--allow-fs-write=')));
  };
  cp.spawnSync=(file,args,options)=>{
    if(file===process.execPath || file===fs.realpathSync(process.execPath)) {
      probes.push(args[0]);assert.deepEqual(args.slice(1),['--eval','']);
      assert.equal(options.env.NODE_OPTIONS,undefined);assert.equal(options.timeout,5000);
      if(probeFailure==='timeout')return {status:null,signal:'SIGKILL',error:Object.assign(Error('fixed empty Node probe ETIMEDOUT'),{code:'ETIMEDOUT'}),stdout:'',stderr:''};
      return {status:args[0]===supported?0:9,stdout:'',stderr:'unsupported spelling'};
    }
    if(file==='/usr/bin/otool')return {status:0,stdout:'Node:\n'};
    assert.equal(mode,'startup');assert.equal(file,'/usr/bin/sandbox-exec');
    launches.push(args);checkLaunch(args);
    assert.equal(options.timeout,5000);
    return {status:0,stdout:'TAP version 13\nSOLOCO_SANDBOX_READY\n'};
  };
  cp.spawn=(file,args,options)=>{
    assert.equal(mode,'watchdog');assert.equal(file,'/usr/bin/sandbox-exec');
    launches.push(args);checkLaunch(args);assert.equal(options.detached,true);
    assert.equal(options.cwd,root);assert.equal(options.env.NODE_OPTIONS,undefined);
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.pid=123456;
    setImmediate(()=>{child.emit('spawn');child.stdout.emit('data',Buffer.from('TAP version 13\n'));child.emit('close',0,null);});
    return child;
  };
  syncBuiltinESMExports();
  let receipt,payload,expectedBinding;
  const messages=[];
  if(mode==='watchdog') {
    // This is supplied/mock wiring evidence, not actual IPC or OS authentication.
    // Construct the production request shape without relaxing its source guards.
    const st=fs.lstatSync(scratch,{bigint:true});
    payload={root,scratch,paths:['./sample.test.mjs'],timeout_ms:100,max_output_bytes:1024,
      scratch_identity:{path:fs.realpathSync(scratch),dev:String(st.dev),ino:String(st.ino)}};
    const request={protocol:'owned-scratch-close-v1',request_id:randomBytes(32).toString('hex'),
      runner_sha256:digest(fs.readFileSync(fileURLToPath(moduleURL))),
      request_sha256:digest(JSON.stringify(payload)),controller_pid:process.ppid};
    expectedBinding={...request,watchdog_pid:process.pid};
    process.argv=[process.execPath,fileURLToPath(moduleURL),'--watch-tests',JSON.stringify({request,payload})];
    Object.defineProperty(process,'connected',{value:true});
    process.send=(message,callback)=>{
      messages.push(structuredClone(message));
      if(message.type==='result')receipt=message.result;
      callback?.();
    };
    process.disconnect=()=>{};
  }
  try {
    const module=await import(moduleURL);
    if(mode==='startup') {
      const available=module.sandboxCapability();
      assert.equal(available.supported,Boolean(supported),available.blocker);
      assert.deepEqual(module.sandboxCapability(),available);
      if(!supported) {
        assert.match(available.blocker,/Node test isolation is unavailable/);
        if(probeFailure==='timeout')assert.match(available.blocker,/ETIMEDOUT/);
        const blocked=await module.runLocalTests({directory:root,test_paths:['sample.test.mjs'],timeout_ms:100,max_output_bytes:1024});
        assert.equal(blocked.status,'blocked');assert.equal(blocked.tests_executed,false);
        assert.equal(blocked.local_execution.closure_basis,'never_started');
        assert.deepEqual(blocked.local_execution.child,{launch_attempted:false,spawn_observed:false,close_observed:false,pid:null});
      }
    } else {
      assert.equal(receipt.status,supported?'passed':'error',JSON.stringify(receipt));
      if(!supported)assert.match(receipt.error,/Node test isolation is unavailable/);
      if(probeFailure==='timeout')assert.match(receipt.error,/ETIMEDOUT/);
      assert.deepEqual(messages.map(message=>message.type),supported?['ready','started','result']:['ready','result']);
      for(const message of messages){
        assert.deepEqual(message.binding,expectedBinding);
        assert.deepEqual(Object.keys(message).sort(),
          (message.type==='result'?['type','binding','result']:message.type==='started'?['type','binding','pid']:['type','binding']).sort());
      }
      assert.match(expectedBinding.request_id,/^[a-f0-9]{64}$/);
      assert.equal(expectedBinding.controller_pid,process.ppid);assert.equal(expectedBinding.watchdog_pid,process.pid);
      assert.equal(expectedBinding.runner_sha256,digest(fs.readFileSync(fileURLToPath(moduleURL))));
      assert.equal(expectedBinding.request_sha256,digest(JSON.stringify(payload)));
      const execution=receipt.local_execution;
      assert.equal(execution.protocol,'owned-scratch-close-v1');
      assert.deepEqual(execution.watchdog,expectedBinding);
      assert.deepEqual(execution.scratch,payload.scratch_identity);
      assert.equal(execution.termination_confirmed,true);
      assert.equal(execution.closure_basis,supported?'child_close':'never_started');
      assert.deepEqual(execution.child,supported
        ?{launch_attempted:true,spawn_observed:true,close_observed:true,pid:123456}
        :{launch_attempted:false,spawn_observed:false,close_observed:false,pid:null});
      if(supported)assert.equal(messages[1].pid,execution.child.pid);
      assert.deepEqual(execution.cleanup,{status:'confirmed',root_absent:true});
      assert.equal(fs.existsSync(scratch),false);
      assert.equal(receipt.test_execution_attempted,Boolean(supported));
      assert.equal(receipt.tests_executed,Boolean(supported));assert.equal(receipt.output_truncated,false);
      assert.equal(receipt.exit_code,supported?0:null);assert.equal(receipt.signal,null);
      assert.deepEqual(receipt.limits,{timeout_ms:payload.timeout_ms,max_output_bytes:payload.max_output_bytes});
      const captured=supported?Buffer.byteLength('TAP version 13')+1:0;
      assert.deepEqual(receipt.output_bytes,{captured,observed:captured});
    }
    assert.deepEqual(probes,supported==='--test-isolation=none'?['--test-isolation=none']:['--test-isolation=none','--experimental-test-isolation=none']);
    assert.equal(new Set(probes).size,probes.length,'Neither timed-out nor unsupported flags are retried');
    assert.equal(launches.length,supported?1:0);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}

for(const mode of ['startup','watchdog'])for(const {supported,probeFailure}of [
  {supported:stable},{supported:experimental},{supported:null},{supported:null,probeFailure:'timeout'}
]) {
  test(`${mode} wiring selects ${probeFailure==='timeout'?'neither spelling after both probes time out':supported??'neither spelling and fails closed'}`,()=>{
    const url=new URL('../plugins/soloco/runtime/local-sandbox.mjs',import.meta.url).href;
    const code=`(${wiringScenario.toString()})(${JSON.stringify(url)},${JSON.stringify(mode)},${JSON.stringify(supported)},${JSON.stringify(probeFailure??null)})`;
    // Associate only defined temp selectors with the reviewed private parent TMP.
    // Do not inherit arbitrary host/preload/secret/provider environment variables.
    const wiringEnvironment={PATH:'/usr/bin:/bin',OPENSSL_CONF:'/dev/null'};
    for(const key of ['TMPDIR','TMP','TEMP'])if(process.env[key]!==undefined)wiringEnvironment[key]=process.env[key];
    const result=spawnSync(process.execPath,['--input-type=module','--eval',`await ${code}`],{
      env:wiringEnvironment,encoding:'utf8',timeout:10000,maxBuffer:20000,
    });
    assert.equal(result.status,0,result.error?.message||result.stderr);
  });
}


test('trusted library inspection tolerates one cold-start timeout with a finite scrubbed probe',()=>{
  let calls=0;
  const output=inspectRuntimeLibrary('/trusted/node',(tool,args,options)=>{
    calls++;assert.equal(tool,'/usr/bin/otool');assert.deepEqual(args,['-L','/trusted/node']);
    assert.equal(options.timeout,5000);assert.equal(options.killSignal,'SIGKILL');
    assert.deepEqual(options.env,{PATH:'/usr/bin:/bin'});assert.equal(options.maxBuffer,100000);
    return calls===1?{status:null,error:Object.assign(Error('cold tool startup'),{code:'ETIMEDOUT'})}:{status:0,stdout:'node:\n /usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n'};
  },{deadline:15000,now:()=>0});
  assert.equal(calls,2);assert.match(output,/libSystem/);
});

test('trusted library inspection retains real errors and stops at its shared deadline',()=>{
  for(const failure of [{status:1,stderr:'cannot inspect Mach-O'},{status:null,error:Object.assign(Error('not allowed'),{code:'EPERM'})},{status:null,signal:'SIGTERM'}]){
    let calls=0;assert.throws(()=>inspectRuntimeLibrary('/trusted/node',()=>{calls++;return failure;}),/otool -L \/trusted\/node:/);assert.equal(calls,1);
  }
  let calls=0,clock=0;
  assert.throws(()=>inspectRuntimeLibrary('/trusted/node',(_f,_a,options)=>{calls++;assert.equal(options.timeout,1000);clock=1000;return {status:null,error:Object.assign(Error('timed out'),{code:'ETIMEDOUT'})};},{deadline:1000,now:()=>clock}),/discovery timed out/);assert.equal(calls,1);
  calls=0;assert.throws(()=>inspectRuntimeLibrary('/trusted/node',()=>{calls++;return {status:null,error:Object.assign(Error('timed out'),{code:'ETIMEDOUT'})};}),/timed out/);assert.equal(calls,2);
});


test('trusted library inspection rejects even successful completion at the shared deadline',()=>{
  for(const elapsed of [1000,1001]){
    let now=0,calls=0;
    assert.throws(()=>inspectRuntimeLibrary('/trusted/node',()=>{calls++;now=elapsed;return {status:0,stdout:'node:\n'};},{deadline:1000,now:()=>now}),/discovery timed out/);
    assert.equal(calls,1);
  }
});
