'use strict';

// Fixed local CLI protocol fixture. This is neither Codex nor a provider.
// Install by prepending one approved absolute Node shebang to these exact
// bytes and writing the result to the isolated test bin/codex (mode 0700).
// Read this file as bytes; requiring it would execute the program below.
// It never reports process-birth or closure evidence; the real parent owns
// those observations. No project imports, filesystem access or network exist.
const {Buffer}=require('node:buffer');

const TASK='FICTIONAL_ONLY_RUNTIME_SOURCE_LIFECYCLE_V1';
const SESSION='fictional-runtime-source-cli-session-v1';
const TURN='fictional-runtime-source-cli-turn-v1';
const ARTIFACT=Object.freeze({
  content:'FICTIONAL fixed local CLI artifact for Source process lifecycle testing. No model, provider, Native qualification, independent QA or execution authority is claimed.',
  messages:[],
  notices:[]
});
const MODEL_ARGS=Object.freeze([
  'exec','--ignore-user-config','--skip-git-repo-check','--json',
  '-c','sandbox_mode="read-only"',
  '-c','approval_policy="never"',
  '-c','features.shell_tool=false',
  '-c','features.unified_exec=false',
  '-c','features.multi_agent=false',
  '-c','web_search="disabled"','-'
]);
const args=process.argv.slice(2);
const sameArgs=expected=>args.length===expected.length&&args.every((value,index)=>value===expected[index]);
const mode=sameArgs(['--version'])?'version':sameArgs(['exec','--help'])?'help':sameArgs(['login','status'])?'status':sameArgs(MODEL_ARGS)?'model':sameArgs(['app-server','--stdio'])?'naming':null;
const deadline=setTimeout(()=>process.exit(70),mode==='model'?5000:1000);
let finished=false;

function finish(code,output='',error=''){
  if(finished)return;
  finished=true;
  process.stdin.pause();process.stdin.destroy();
  const text=error||output,stream=error?process.stderr:process.stdout;
  if(Buffer.byteLength(text,'utf8')>8192){clearTimeout(deadline);process.exit(74);}
  stream.write(text,writeError=>{
    clearTimeout(deadline);
    if(writeError)process.exit(74);
    process.exitCode=code;
  });
}
function reject(){finish(64,'','Fixed local Source CLI fixture rejected this invocation.\n');}
process.stdin.on('error',()=>finish(74,'','Fixed local Source CLI fixture input failed.\n'));
process.stdout.on('error',()=>process.exit(74));
process.stderr.on('error',()=>process.exit(74));

function readInput(limit,onInput,{line=false}={}){
  const chunks=[];let bytes=0;
  const complete=()=>{
    if(finished)return;
    const raw=Buffer.concat(chunks,bytes),text=raw.toString('utf8');
    if(!Buffer.from(text,'utf8').equals(raw)){reject();return;}
    onInput(text);
  };
  process.stdin.on('data',chunk=>{
    if(finished)return;
    if(!Buffer.isBuffer(chunk)||bytes+chunk.length>limit){reject();return;}
    chunks.push(chunk);bytes+=chunk.length;
    if(line&&chunk.includes(10))complete();
  });
  process.stdin.on('end',complete);
}
const closed=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');

if(mode==='version')finish(0,'SoloCo fixed local Source CLI fixture v1; no provider.\n');
else if(mode==='help')finish(0,'Fixed local Source fixture grammar: --ignore-user-config --json --sandbox\n');
else if(mode==='status')finish(0,'Local fixture ready; no Codex account or provider authentication.\n');
else if(mode==='model'){
  if(process.env.COMPANY_WORKER!=='1')reject();
  else readInput(65536,prompt=>{
    if(!prompt.includes(TASK)){reject();return;}
    const events=[
      {type:'thread.started',thread_id:SESSION},
      {type:'turn.started',thread_id:SESSION,turn_id:TURN},
      {type:'item.completed',thread_id:SESSION,turn_id:TURN,item:{id:'fictional-final-answer',type:'agent_message',phase:'final_answer',text:JSON.stringify(ARTIFACT)}},
      {type:'turn.completed',thread_id:SESSION,turn_id:TURN}
    ];
    finish(0,events.map(value=>JSON.stringify(value)+'\n').join(''));
  });
}else if(mode==='naming'){
  if(process.env.COMPANY_WORKER!=='1')reject();
  else readInput(4096,input=>{
    const lines=input.split('\n'),first=lines.shift();
    if(!first||lines.some(value=>value.trim())){reject();return;}
    let request;try{request=JSON.parse(first);}catch{reject();return;}
    if(!closed(request,['id','method','params'])||request.id!==1||request.method!=='initialize'
      ||!closed(request.params,['clientInfo','capabilities'])
      ||!closed(request.params.clientInfo,['name','version'])
      ||request.params.clientInfo.name!=='soloco-session-naming'||request.params.clientInfo.version!=='1'
      ||!closed(request.params.capabilities,[])){reject();return;}
    finish(0,JSON.stringify({id:1,error:{code:-32601,message:'Fixed local Source fixture has no session naming service.'}})+'\n');
  },{line:true});
}else reject();
