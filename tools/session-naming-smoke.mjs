// Explicit, fictional native smoke check. No company data or company mutations.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runModel,executable} from '../plugins/soloco/runtime/adapters.mjs';
import {sessionTitle,SESSION_NAMING_RECEIPT} from '../plugins/soloco/runtime/session-naming.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
function codexTitle(nativeId) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable('codex'),['app-server','--stdio'],{stdio:['pipe','pipe','ignore']});let buffer='',done=false;
    const timer=setTimeout(()=>finish(Error('Metadata-only Codex readback timed out')),5000);
    function finish(error,value){if(done)return;done=true;clearTimeout(timer);child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),150).unref();error?reject(error):resolve(value);}
    const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
    child.on('error',()=>finish(Error('Codex metadata readback could not start')));child.on('close',()=>{if(!done)finish(Error('Codex metadata readback closed early'));});child.stdin.on('error',()=>finish(Error('Metadata readback stream failed')));
    child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>300000)return finish(Error('Metadata readback too large'));let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let r;try{r=JSON.parse(line);}catch{return finish(Error('Malformed metadata readback'));}if(r.error)return finish(Error('Codex metadata readback RPC failed'));if(r.id===1){send({method:'initialized'});send({id:2,method:'thread/read',params:{threadId:nativeId,includeTurns:false}});}else if(r.id===2){if(r.result?.thread?.id!==nativeId)return finish(Error('Wrong metadata native identity'));finish(null,r.result.thread.name);}}});
    send({id:1,method:'initialize',params:{clientInfo:{name:'soloco-naming-smoke',version:'1'},capabilities:{}}});
  });
}
function claudeTitle(nativeId) {
  // Read only the exact newly created probe transcript. Never inspect auth or
  // unrelated conversations, and never write host-owned session files.
  const directory=path.join(process.env.CLAUDE_CONFIG_DIR??path.join(os.homedir(),'.claude'),'projects');
  const found=spawnSync('rg',['--files','--hidden','-g',nativeId+'.jsonl',directory],{encoding:'utf8',timeout:5000,maxBuffer:100000});
  if(found.status!==0)throw Error('Could not locate the new Claude probe metadata');
  const files=found.stdout.trim().split('\n').filter(Boolean);if(files.length!==1||path.basename(files[0])!==nativeId+'.jsonl')throw Error('Ambiguous probe metadata');
  let title;
  for(const line of fs.readFileSync(files[0],'utf8').split('\n').filter(Boolean)) {
    const record=JSON.parse(line);
    if(record.type==='custom-title'&&record.sessionId===nativeId)title=record.customTitle;
  }
  return title;
}
export async function namingSmoke(host,output) {
  if(!['codex','claude'].includes(host)||!path.isAbsolute(output)||fs.existsSync(output))throw Error('Choose codex|claude and a new absolute report path');
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-naming-native-'))),report={host,probe_directory:directory,status:'running',source_sha256:Object.fromEntries(['adapters','session-naming','worker','upgrade'].map(name=>[name,hash(fs.readFileSync(new URL('../plugins/soloco/runtime/'+name+'.mjs',import.meta.url)))])),rounds:[],passed:false,limitations:['Fictional native adapter naming check, not actual-company review or adoption','Claude readback inspects only the newly created probe transcript metadata','Display names do not establish role authority, acceptance or model settings']};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  let native=null;const instance='fictional-'+randomUUID();
  try {
    for(const role of ['Naming Probe Engineer','Naming Probe Resumed Engineer']) {
      const title=sessionTitle(role,instance),response=await runModel(host,native,'Fictional metadata-only smoke test. Reply with exactly NAME_PROBE_OK. Do not use tools.',directory,90000,{mode:'default',reason:'One short fictional reply to verify session display-name persistence.'},{sessionTitle:title,sessionNameDirectory:directory,timeoutReason:'Bounded fictional naming smoke check.'});
      if(native&&response.native_id!==native)throw Error('Resume changed native identity');native=response.native_id;
      const until=Date.now()+3500;let receipt;
      do {try{receipt=JSON.parse(fs.readFileSync(path.join(directory,SESSION_NAMING_RECEIPT),'utf8'));}catch{};if(receipt?.native_id===native&&receipt.title===title)break;await pause();}while(Date.now()<until);
      const round={role,native_id:native,requested_title:title,receipt,model_evidence:response.model_evidence};report.rounds.push(round);
      // Retain the completed native call even if an independent readback fails.
      const observed=host==='codex'?await codexTitle(native):claudeTitle(native);round.observed_title=observed;
      if(observed!==title)throw Error('Host did not retain the requested role title');
      if(!receipt||receipt.title!==title)throw Error('Naming receipt missing');
    }
    report.status='passed';report.passed=true;
  }catch(error){report.status='failed';report.error=String(error.message).slice(0,1000);}
  finally{report.finished_at=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [flag,host,output]=process.argv.slice(2);if(flag!=='--run-native')throw Error('Explicit --run-native HOST NEW_ABSOLUTE_REPORT is required');
  const result=await namingSmoke(host,output);console.log(JSON.stringify({host,passed:result.passed,status:result.status,error:result.error??null,output}));if(!result.passed)process.exitCode=1;
}
