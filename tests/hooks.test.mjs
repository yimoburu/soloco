import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PACKAGE, VERSION, digest } from '../plugins/soloco/runtime/store.mjs';
import { hooks, projectCommand } from '../plugins/soloco/runtime/hooks.mjs';
import { call } from '../plugins/soloco/runtime/main.mjs';
import { bind } from '../plugins/soloco/runtime/engine.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-hooks-'));
process.env.CODEX_HOME=path.join(base,'profile');
process.env.COMPANY_PLUGIN_DATA=path.join(process.env.CODEX_HOME,'plugins/data/soloco');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const command=JSON.parse(fs.readFileSync(path.join(PACKAGE,'hooks/codex.json'))).hooks.SessionStart[0].hooks[0].command.replaceAll('${PLUGIN_ROOT}',PACKAGE);
const snapshot=()=>({hooks:['sessionStart','userPromptSubmit'].map(eventName=>({eventName,source:'plugin',pluginId:'soloco@soloco',enabled:true,trustStatus:'untrusted',sourcePath:path.join(PACKAGE,'hooks/codex.json'),command})),errors:[],warnings:[]});
const legacy='env COMPANY_PLUGIN_DATA="/old/data" /bin/sh "/some home/plugins/cache/ai-operated-startup/company/0.2.1/scripts/run.sh" hook codex';
function fixture() {
  const root=fs.mkdtempSync(path.join(base,'venture-'));fs.mkdirSync(path.join(root,'.codex'));
  const file=path.join(root,'.codex/hooks.json');
  const custom={type:'command',command:'echo unrelated',timeout:7};
  const config={description:'preserve',hooks:{SessionStart:[{matcher:'startup',hooks:[{type:'command',command:legacy},custom]}],UserPromptSubmit:[{hooks:[{type:'command',command:legacy}]}],Stop:[{hooks:[custom]}]}};
  fs.writeFileSync(file,JSON.stringify(config));
  return {root,file,custom,config,session_id:'real-session-id'};
}
test('recognizes only complete versioned Company/SoloCo project launchers',()=>{
  assert.equal(projectCommand(legacy).data_directory,'/old/data');
  assert.ok(projectCommand(legacy.replace('ai-operated-startup/company/0.2.1','soloco/soloco/0.3.0')));
  for(const command of [legacy+'; echo extra','echo '+legacy,legacy.replace('/some home','${HOME}'),legacy.replace('hook codex','hook claude')]) assert.equal(projectCommand(command),null);
});
test('diagnostics distinguish discovery, disabled, modified, stale commands, data mismatch and missing binding',async()=>{
  const a=fixture(),original=fs.readFileSync(a.file,'utf8');const s=snapshot();
  s.hooks[0].enabled=false;s.hooks[0].trustStatus='modified';s.hooks.pop();
  const report=await hooks({...a,action:'inspect'},'codex',async()=>s);
  for(const code of ['disabled_hook','modified_hook','missing_plugin_hook','project_hooks_require_migration','data_directory_mismatch']) assert.ok(report.problems.some(p=>p.code===code),code);
  assert.equal(report.binding.status,'missing');assert.equal(fs.readFileSync(a.file,'utf8'),original);
  assert.equal(fs.existsSync(path.join(a.root,'.company')),false);assert.equal(fs.existsSync(process.env.COMPANY_PLUGIN_DATA),false);
});
test('migration removes recognized duplicates with exact backup, preserves unrelated config and company bytes, never creates trust or bindings',async()=>{
  const a=fixture();fs.mkdirSync(path.join(a.root,'.company'));fs.writeFileSync(path.join(a.root,'.company/company.sqlite'),'opaque company bytes');
  const raw=fs.readFileSync(a.file,'utf8'),s=snapshot();
  const args={...a,action:'migrate',expected_file_sha256:digest(raw),source_instruction:'Fix the old hooks'};
  const result=await hooks(args,'codex',async()=>s);
  assert.equal(result.removed,2);assert.equal(fs.readFileSync(result.backup,'utf8'),raw);
  const after=JSON.parse(fs.readFileSync(a.file));
  assert.deepEqual(after,{description:'preserve',hooks:{SessionStart:[{matcher:'startup',hooks:[a.custom]}],Stop:a.config.hooks.Stop}});
  assert.equal(fs.readFileSync(path.join(a.root,'.company/company.sqlite'),'utf8'),'opaque company bytes');
  assert.equal(fs.existsSync(process.env.COMPANY_PLUGIN_DATA),false);assert.equal(s.hooks[0].trustStatus,'untrusted');
  assert.equal((await hooks(args,'codex',async()=>s)).status,'unchanged');
});
test('migration refuses stale previews, missing/disabled replacement, legacy plugin, and unknown compound commands',async()=>{
  for(const mode of ['stale','missing','disabled','legacy','unknown','runtime','command']) {
    const a=fixture(),s=snapshot();
    if(mode==='missing') s.hooks=[];
    if(mode==='disabled') s.hooks[0].enabled=false;
    if(mode==='legacy') s.hooks.push({...s.hooks[0],pluginId:'company@ai-operated-startup'});
    if(mode==='runtime') s.hooks[0].sourcePath='/old/cache/hooks/codex.json';
    if(mode==='command') s.hooks[0].command='sh /old/run.sh hook codex';
    if(mode==='unknown') {a.config.hooks.SessionStart[0].hooks[0].command+='; echo other work';fs.writeFileSync(a.file,JSON.stringify(a.config));}
    const raw=fs.readFileSync(a.file,'utf8');
    await assert.rejects(hooks({...a,action:'migrate',source_instruction:'Repair hooks',expected_file_sha256:mode==='stale'?'wrong':digest(raw)},'codex',async()=>s));
    assert.equal(fs.readFileSync(a.file,'utf8'),raw);
  }
});
test('migration rejects a file changed while host discovery was running and symbolic project config',async()=>{
  const a=fixture(),raw=fs.readFileSync(a.file,'utf8');
  await assert.rejects(hooks({...a,action:'migrate',source_instruction:'Fix',expected_file_sha256:digest(raw)},'codex',async()=>{fs.appendFileSync(a.file,' ');return snapshot();}),/changed/);
  const b=fixture();fs.unlinkSync(b.file);fs.symlinkSync(a.file,b.file);
  await assert.rejects(hooks({...b,action:'inspect'},'codex',async()=>snapshot()),/linked/);
});
test('host discovery failure is explicit and cannot remove project hooks',async()=>{
  const a=fixture(),fail=async()=>{throw new Error('Unsupported host API');};
  assert.equal((await hooks({...a,action:'inspect'},'codex',fail)).status,'discovery_unavailable');
  await assert.rejects(hooks({...a,action:'migrate'},'codex',fail),/Unsupported/);
});
test('packaged lifecycle commands use matching host data, subprocess hook output is usable by MCP, and upgrade paths are relocatable',async()=>{
  for(const host of ['codex','claude']) {
    const root=fs.mkdtempSync(path.join(base,host+'-'));
    const data=host==='codex' ? path.join(process.env.CODEX_HOME,'plugins/data/soloco') : path.join(base,host+'-data');
    const config=JSON.parse(fs.readFileSync(path.join(PACKAGE,`hooks/${host}.json`)));
    const env={...process.env,COMPANY_PLUGIN_DATA:'/deliberately-stale/data',PLUGIN_ROOT:PACKAGE,CLAUDE_PLUGIN_ROOT:PACKAGE,PLUGIN_DATA:data,CLAUDE_PLUGIN_DATA:data};
    const payload={cwd:root,session_id:'lifecycle-test',hook_event_name:'SessionStart'};
    const result=spawnSync('/bin/sh',['-c',config.hooks.SessionStart[0].hooks[0].command],{env,input:JSON.stringify(payload),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext,/Chief of Staff/);
    const old=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
    try {
      const company=await call('company_open',{root,session_id:payload.session_id,idea:'Fixture'},host);
      assert.equal(company.executing_runtime_version,VERSION);
      if(host==='codex') assert.equal((await hooks({root,session_id:payload.session_id,action:'inspect'},host,async()=>({...snapshot(),hooks:snapshot().hooks.map(h=>({...h,trustStatus:'trusted'}))}))).binding.status,'current_runtime');
    } finally {process.env.COMPANY_PLUGIN_DATA=old;}
    assert.ok(!JSON.stringify(config).includes(VERSION));
  }
  // This tests subprocess plumbing with synthetic lifecycle inputs, not host trust or live UI invocation.
});

test('Claude diagnostics distinguish missing, current, stale and wrong-host lifecycle receipts without creating state',async()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(base,'claude-diagnostics-'))),args={root,session_id:'claude-diagnostic-session',action:'inspect'};
  let result=await hooks(args,'claude');
  assert.equal(result.binding.status,'missing');
  assert.equal(result.discovery,'unverified');
  assert.equal(fs.existsSync(path.join(root,'.company')),false);
  bind(root,args.session_id,'codex');
  assert.equal((await hooks(args,'claude')).binding.status,'missing');
  bind(root,args.session_id,'claude');
  result=await hooks(args,'claude');assert.equal(result.binding.status,'current_runtime');
  assert.equal(result.discovery,'unverified','receipt does not prove current host trust');
  const file=path.join(process.env.COMPANY_PLUGIN_DATA,'bindings',digest(JSON.stringify([root,'claude',args.session_id]))+'.json');
  const original=fs.readFileSync(file,'utf8');
  for(const [key,value] of [['plugin_version','old'],['plugin_root','/old'],['data_directory','/wrong'],['host','codex'],['session_id','other'],['root',base]]) {
    fs.writeFileSync(file,JSON.stringify({...JSON.parse(original),[key]:value}));
    assert.equal((await hooks(args,'claude')).binding.status,'old_or_unverified_runtime',key);
  }
  fs.writeFileSync(file,original);
  assert.equal((await hooks({...args,action:'migrate'},'claude')).status,'not_supported');
  assert.equal(fs.readFileSync(file,'utf8'),original);
  assert.equal((await hooks({root,action:'inspect'},'claude')).binding.status,'session_not_supplied');
  fs.unlinkSync(file);fs.symlinkSync(path.join(root,'missing'),file);
  await assert.rejects(hooks(args,'claude'),/linked/);
});
