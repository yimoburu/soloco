import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {sessionTitle,claudeNameSupport,nameCodexSession,writeNamingReceipt,SESSION_NAMING_RECEIPT} from '../plugins/soloco/runtime/session-naming.mjs';

const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-session-naming-')));
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const script=path.join(base,'metadata-double.mjs');
fs.writeFileSync(script,`import fs from 'node:fs';import readline from 'node:readline';
const [mode,log]=process.argv.slice(2);let thread;
if(mode==='stall'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
const lines=readline.createInterface({input:process.stdin});
function reply(id,result){process.stdout.write(JSON.stringify({id,result})+'\\n');}
for await(const line of lines){const r=JSON.parse(line);fs.appendFileSync(log,JSON.stringify(r)+'\\n');
 if(mode==='stall')continue;
 if(mode==='malformed'){process.stdout.write('not json\\n');continue;}
 if(mode==='overflow'){process.stdout.write('x'.repeat(270000)+'\\n');continue;}
 if(r.method==='initialize'){process.stdout.write(JSON.stringify({method:'notice',params:{unrelated:true}})+'\\n');reply(r.id,{});}
 else if(r.method==='thread/name/set'){
  if(mode==='unsupported'||mode==='error'){process.stdout.write(JSON.stringify({id:r.id,error:{code:mode==='unsupported'?-32601:-32000,message:'Bearer do-not-retain sk-privatefixture'}})+'\\n');continue;}
  thread={id:r.params.threadId,name:r.params.name};reply(r.id,{});
 }else if(r.method==='thread/read'){
  if(r.params.includeTurns!==false)throw Error('Metadata must not hydrate turns');
  const value=mode==='wrong-id'?{...thread,id:'other-native'}:mode==='wrong-name'?{...thread,name:'Other name'}:thread;
  const wire=JSON.stringify({id:r.id,result:{thread:value}})+'\\n';
  const split=Math.floor(wire.length/2);process.stdout.write(wire.slice(0,split));setTimeout(()=>process.stdout.write(wire.slice(split)),1);
 }
}
`);
function double(t,mode) {
  const log=path.join(base,mode+'-'+Math.random().toString(16).slice(2)+'.jsonl');
  let child,args,command;
  const start=(requested,argv,options)=>{
    command=requested;args=argv;child=spawn(process.execPath,[script,mode,log],options);return child;
  };
  t.after(()=>{try{child?.kill('SIGKILL');}catch{}});
  return {start,requests:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],launched:()=>({command,args}),get child(){return child;}};
}

test('titles normalize role text, remain bounded and distinguish identical instance tails',()=>{
  const id='engineer-12345678-1234-1234-1234-123456789abc';
  const title=sessionTitle('  Engineering\n\t Review\u0001  ',id);
  assert.match(title,/^SoloCo — Engineering Review · /);assert(!/[\r\n\t\u0001]/u.test(title));
  assert.equal(title,sessionTitle('Engineering Review',id));
  assert.notEqual(sessionTitle('Engineering','first-shared-tail'),sessionTitle('Engineering','second-shared-tail'));
  assert.notEqual(sessionTitle('Engineering',id),sessionTitle('Independent QA',id));
  assert(Array.from(sessionTitle('🧭'.repeat(1000),id)).length<=160);
  for(const args of [['','instance'],['role',''],[null,'instance'],['\u0001','instance']])assert.throws(()=>sessionTitle(...args),/Invalid/);
});
test('Claude name support uses advertised exact flag, bounded help probing and cache',()=>{
  let calls=0;
  const probe=(command,args,options)=>{calls++;assert.equal(command,'/fictional/claude');assert.deepEqual(args,['--help']);assert.equal(options.timeout,1000);assert(options.maxBuffer<=256000);return {status:0,stdout:'  -n, --name <name>  Set a display name'};};
  assert.equal(claudeNameSupport('/fictional/claude',{spawnSync:probe}),true);
  assert.equal(claudeNameSupport('/fictional/claude',{spawnSync:probe}),true);assert.equal(calls,1);
  assert.equal(claudeNameSupport('/fictional/claude',{spawnSync:probe,refresh:true}),true);assert.equal(calls,2);
  for(const result of [{status:0,stdout:'--namespace x --name-file y'},{status:1,stdout:'--name x'},{status:0,stdout:'',stderr:'--name x'},{status:0,stdout:'--name x',error:Error('probe failed')}])assert.equal(claudeNameSupport('/fictional/claude',{spawnSync:()=>result}),false);
  assert.equal(claudeNameSupport('/fictional/claude',{spawnSync:()=>{throw Error('metadata unavailable');}}),false);
});
test('Codex metadata protocol names the exact thread and verifies Unicode readback without turns',async t=>{
  const d=double(t,'success'),title=sessionTitle('工程 QA','fictional-instance');
  const result=await nameCodexSession('/fictional/codex','fictional-native',title,{spawn:d.start});
  assert.deepEqual(result,{host:'codex',native_id:'fictional-native',title,verification:'app_server_readback',status:'named'});
  assert.deepEqual(d.launched(),{command:'/fictional/codex',args:['app-server','--stdio']});
  const requests=d.requests();assert.deepEqual(requests.map(r=>r.method),['initialize','initialized','thread/name/set','thread/read']);
  assert.deepEqual(requests[2].params,{threadId:'fictional-native',name:title});
  assert.deepEqual(requests[3].params,{threadId:'fictional-native',includeTurns:false});
});
for(const mode of ['unsupported','error','wrong-id','wrong-name','malformed','overflow'])test(`Codex ${mode} remains a bounded cosmetic result`,async t=>{
  const d=double(t,mode),result=await nameCodexSession('/fictional/codex','fictional-native','SoloCo — QA',{spawn:d.start});
  assert.equal(result.status,mode==='unsupported'?'unsupported':'failed');assert.equal(result.verification,'unverified');
  assert.equal(result.native_id,'fictional-native');assert.equal(result.title,'SoloCo — QA');
  assert(result.error.length<=300);assert(!JSON.stringify(result).includes('do-not-retain'));assert(!JSON.stringify(result).includes('sk-privatefixture'));
});
test('Codex metadata timeout settles promptly and escalates its own child',async t=>{
  const d=double(t,'stall'),start=Date.now(),pending=nameCodexSession('/fictional/codex','fictional-native','SoloCo — QA',{spawn:d.start,timeoutMs:50});
  const closed=new Promise(resolve=>d.child.once('close',resolve));
  const result=await pending;assert.equal(result.status,'failed');assert.match(result.error,/timed out/);assert(Date.now()-start<1000);
  let timer;try{await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('metadata child did not close')),2000);})]);}finally{clearTimeout(timer);}
});
test('Codex spawn/stream failures are returned, invalid programmer inputs reject before spawning',async()=>{
  const result=await nameCodexSession('/fictional/codex','fictional-native','SoloCo — QA',{spawn:()=>{throw Error('must not retain secret');}});
  assert.equal(result.status,'failed');assert(!JSON.stringify(result).includes('secret'));
  for(const args of [['','native','title'],['codex','','title'],['codex','native',''],['codex','native','x'.repeat(161)]])assert.throws(()=>nameCodexSession(...args),/Invalid/);
  assert.throws(()=>nameCodexSession('codex','native','title',{timeoutMs:2001}),/Invalid/);
});
test('cosmetic receipts publish atomically in an existing directory and retain only bounded safe fields',()=>{
  const directory=path.join(base,'receipts');fs.mkdirSync(directory);
  const receipt={host:'codex',status:'named',native_id:'fictional-native',title:'SoloCo — QA',verification:'app_server_readback',credentials:'must not retain'};
  assert.equal(writeNamingReceipt(directory,receipt),true);
  const file=path.join(directory,SESSION_NAMING_RECEIPT),first=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(first.title,receipt.title);assert.equal(first.credentials,undefined);assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.equal(writeNamingReceipt(directory,{...receipt,status:'failed',error:'Bearer hidden sk-privatefixture '+'.'.repeat(500)}),true);
  const last=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(last.status,'failed');assert(last.error.length<=300);assert(!last.error.includes('sk-privatefixture'));assert(!last.error.includes('hidden'));
  assert.deepEqual(fs.readdirSync(directory),[SESSION_NAMING_RECEIPT]);
  assert.equal(writeNamingReceipt(path.join(base,'missing'),receipt),false);
  assert.equal(writeNamingReceipt(directory,{...receipt,status:'accepted'}),false);
});
test('receipt failures and symlink destinations cannot overwrite unrelated files',()=>{
  const directory=path.join(base,'linked-receipt');fs.mkdirSync(directory);
  const victim=path.join(base,'preserve.txt');fs.writeFileSync(victim,'preserve');
  fs.symlinkSync(victim,path.join(directory,SESSION_NAMING_RECEIPT));
  const receipt={host:'claude',status:'requested',title:'SoloCo — Engineering'};
  assert.equal(writeNamingReceipt(directory,receipt),false);assert.equal(fs.readFileSync(victim,'utf8'),'preserve');
  const linked=path.join(base,'linked-directory');fs.symlinkSync(directory,linked);assert.equal(writeNamingReceipt(linked,receipt),false);
  assert.equal(writeNamingReceipt(directory,null),false);assert.equal(writeNamingReceipt('relative',receipt),false);
});
