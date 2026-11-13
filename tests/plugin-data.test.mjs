import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {dataDir} from '../plugins/soloco/runtime/plugin-data.mjs';

test('shared plugin data law preserves original precedence and empty-value fallback',()=>{
 const keys=['COMPANY_PLUGIN_DATA','PLUGIN_DATA','CLAUDE_PLUGIN_DATA','XDG_CACHE_HOME'],before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
  for(const k of keys)delete process.env[k];
  process.env.XDG_CACHE_HOME='/fictional/xdg-must-not-change-engine-law';
  assert.equal(dataDir(),path.join(os.homedir(),'.cache','soloco'));
  process.env.CLAUDE_PLUGIN_DATA='/fictional/claude';assert.equal(dataDir(),'/fictional/claude');
  process.env.PLUGIN_DATA='/fictional/plugin';assert.equal(dataDir(),'/fictional/plugin');
  process.env.COMPANY_PLUGIN_DATA='/fictional/company';assert.equal(dataDir(),'/fictional/company');
  process.env.COMPANY_PLUGIN_DATA='';assert.equal(dataDir(),'/fictional/plugin');
  process.env.PLUGIN_DATA='';assert.equal(dataDir(),'/fictional/claude');
  process.env.CLAUDE_PLUGIN_DATA='';assert.equal(dataDir(),path.join(os.homedir(),'.cache','soloco'));
 } finally {for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
});

test('engine exports and uses the shared data function without a second resolver',()=>{
 const engine=fs.readFileSync(new URL('../plugins/soloco/runtime/engine.mjs',import.meta.url),'utf8');
 assert.match(engine,/import \{dataDir\} from '\.\/plugin-data\.mjs';/);
 assert.match(engine,/export \{dataDir\} from '\.\/plugin-data\.mjs';/);
 assert.doesNotMatch(engine,/function dataDir\(|CLAUDE_PLUGIN_DATA|XDG_CACHE_HOME/);
});
