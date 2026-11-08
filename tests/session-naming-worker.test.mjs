import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {sessionTitle} from '../plugins/soloco/runtime/session-naming.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';

for(const host of ['codex','claude'])test(`${host}: workers name the actual role/instance without adding canonical naming fields`,async()=>{
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-role-title-worker-'))),prior=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
  const args={root:path.join(base,'company'),session_id:'fictional-founder',epoch:1};fs.mkdirSync(args.root);
  const read=()=>withStore(args.root,db=>db.read()),launch={check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})};
  try {
    engine.bind(args.root,args.session_id,host);engine.open({...args,idea:'Fictional session name test'},host);withStore(args.root,db=>db.migrate());
    const first=engine.dispatch({...args,role:'engineer',task:'Prepare a fictional source-grounded finding.'},host,launch);
    let reviewOf;
    for(const queued of [first,null]) {
      const job=queued??engine.dispatch({...args,role:'qa',review_of:reviewOf,task:'Independently review the exact fictional finding.'},host,launch);
      const before=read();
      await work(args.root,job.id,async(actualHost,_native,_prompt,dir,limit,_selection,options)=>{
        assert.equal(actualHost,host);
        assert.equal(options.sessionTitle,sessionTitle(before.roles[job.role].name,job.instance_id));
        assert.equal(options.sessionNameDirectory,dir);
        assert(dir.startsWith(path.join(base,'data','sessions')));
        options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));
        return {native_id:'fictional-native-'+job.role,text:JSON.stringify({content:'Fictional exact finding.',messages:[],notices:[],...(job.role==='qa'?{review:{verdict:'Pass',reason:'Exact fictional finding meets the criterion.'}}:{})})};
      });
      const state=read(),finished=state.jobs[job.id];assert.equal(finished.status,'completed',finished.error);
      assert.equal(finished.sessionTitle,undefined);assert.equal(finished.session_name,undefined);
      assert.equal(state.sessions[job.session_key].title,undefined);
      assert.equal(finished.model_evidence?.session_name,undefined);
      reviewOf=finished.artifact_id;
    }
  }finally{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;fs.rmSync(base,{recursive:true,force:true});}
});
