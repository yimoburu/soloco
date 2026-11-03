// Real Codex installation/discovery smoke test in a disposable profile. No auth, model calls, or trust writes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { executable } from '../plugins/soloco/runtime/adapters.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=process.env.SOLOCO_TEST_CODEX || executable('codex');
const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-native-hooks-')));
const source=path.join(base,'repo'),profile=path.join(base,'profile'),root=path.join(base,'venture');
fs.mkdirSync(profile);fs.mkdirSync(root);
fs.cpSync(repo,source,{recursive:true,filter:p=>!p.split(path.sep).includes('.git')});
const env={...process.env,CODEX_HOME:profile};
function run(args) {const r=spawnSync(cli,args,{env,cwd:base,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout;}
async function rpc(method,params) {
  const p=spawn(cli,['app-server','--stdio'],{env,cwd:base,stdio:['pipe','pipe','ignore']});
  return await new Promise((resolve,reject)=>{
    let buffer='';const timer=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('RPC timeout'));},15000);
    const done=(error,result)=>{clearTimeout(timer);p.kill('SIGTERM');error?reject(error):resolve(result);};
    const send=value=>p.stdin.write(JSON.stringify(value)+'\n');
    p.on('error',e=>done(e));p.stdin.on('error',e=>done(e));
    p.stdout.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')) {const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
      const m=JSON.parse(line);if(m.error)return done(new Error(m.error.message));
      if(m.id===1){send({method:'initialized'});send({id:2,method,params});}
      if(m.id===2)return done(null,m.result);
    }});
    send({id:1,method:'initialize',params:{clientInfo:{name:'soloco-hook-smoke',version:'1'},capabilities:{experimentalApi:true}}});
  });
}
try {
  console.log(run(['--version']).trim());
  run(['plugin','marketplace','add',source,'--json']);run(['plugin','add','soloco@soloco','--json']);
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'plugins/soloco/.codex-plugin/plugin.json')));
  let details=await rpc('plugin/read',{pluginName:'soloco',marketplacePath:path.join(source,'.agents/plugins/marketplace.json')});
  assert.equal(details.plugin.hooks.length,2);assert.deepEqual(details.plugin.mcpServers,['company']);assert.ok(details.plugin.skills.some(s=>s.name==='soloco:setup')); 
  
  const inventory=await rpc('mcpServerStatus/list',{});
  const server=inventory.data.find(s=>s.name==='company');
  assert.ok(server && !server.toolsError,JSON.stringify(inventory));assert.equal(server.serverInfo.version,manifest.version);assert.ok(Object.keys(server.tools).some(k=>k.includes('company_hooks')));
  let entry=(await rpc('hooks/list',{cwds:[root]})).data[0];
  assert.equal(entry.errors.length,0);assert.equal(entry.warnings.length,0);assert.equal(entry.hooks.length,2);
  for(const h of entry.hooks){assert.equal(h.source,'plugin');assert.equal(h.trustStatus,'untrusted');assert.equal(h.enabled,true);assert.ok(h.command.includes('/'+manifest.version+'/'));}
  // Seed ONLY project hook configuration, never trust or lifecycle binding.
  fs.mkdirSync(path.join(root,'.codex'));
  const file=path.join(root,'.codex/hooks.json');
  const old='env COMPANY_PLUGIN_DATA="/old/data" /bin/sh "/old/plugins/cache/ai-operated-startup/company/0.2.1/scripts/run.sh" hook codex';
  const cfg={hooks:{SessionStart:[{hooks:[{type:'command',command:old},{type:'command',command:'echo unrelated'}]}],UserPromptSubmit:[{hooks:[{type:'command',command:old}]}]}};
  fs.writeFileSync(file,JSON.stringify(cfg));
  const pkg=path.join(profile,'plugins/cache/soloco/soloco',manifest.version);
  const saved={CODEX_HOME:process.env.CODEX_HOME,COMPANY_PLUGIN_DATA:process.env.COMPANY_PLUGIN_DATA};
  process.env.CODEX_HOME=profile;process.env.COMPANY_PLUGIN_DATA=path.join(profile,'plugins/data/soloco');
  const bindingDir=path.join(process.env.COMPANY_PLUGIN_DATA,'bindings');
  try {
    const {hooks}=await import(pathToFileURL(path.join(pkg,'runtime/hooks.mjs')));
    const preview=await hooks({root,action:'inspect',session_id:'not-invoked'},'codex');
    assert.equal(preview.recognized_project_hooks.length,2);assert.equal(preview.binding.status,'missing');
    const migrated=await hooks({root,action:'migrate',source_instruction:'Remove fixture legacy hooks',expected_file_sha256:preview.expected_file_sha256},'codex');
    assert.equal(migrated.removed,2);assert.deepEqual(JSON.parse(fs.readFileSync(file)).hooks.SessionStart[0].hooks,[{type:'command',command:'echo unrelated'}]);
    assert.equal(fs.existsSync(bindingDir),false);
  } finally {for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  const migratedBytes=fs.readFileSync(file);
  // Simulate the next package release. Host discovery must follow the new install without project edits.
  const store=path.join(source,'plugins/soloco/runtime/store.mjs');fs.writeFileSync(store,fs.readFileSync(store,'utf8').replace("VERSION = '"+manifest.version+"'", "VERSION = '0.3.99'"));
  const build=spawnSync(process.execPath,[path.join(source,'tools/build-plugin.mjs')],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
  run(['plugin','add','soloco@soloco','--json']);
  entry=(await rpc('hooks/list',{cwds:[root]})).data[0];
  const bundled=entry.hooks.filter(h=>h.source==='plugin');
  assert.equal(bundled.length,2);for(const h of bundled){assert.ok(h.command.includes('/0.3.99/'));assert.notEqual(h.trustStatus,'trusted');}
  assert.ok(fs.readFileSync(file).equals(migratedBytes));assert.deepEqual(JSON.parse(fs.readFileSync(file)).hooks.SessionStart[0].hooks,[{type:'command',command:'echo unrelated'}]);
  const upgraded=(await rpc('mcpServerStatus/list',{})).data.find(s=>s.name==='company');assert.ok(!upgraded.toolsError,upgraded.toolsError);assert.equal(upgraded.serverInfo.version,'0.3.99');
  console.log('PASS: native plugin/read + hooks/list, normal untrusted hooks, safe migration, and next-version discovery without project path edits.');
  console.log('Live lifecycle invocation after HUMAN hook trust remains a separate acceptance check; no bindings or trust were fabricated.');
} finally {fs.rmSync(base,{recursive:true,force:true});}
