// Cosmetic host metadata only. Never changes company records, evidence or authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';

export const SESSION_NAMING_RECEIPT='session-name.json';
const MAX_TITLE=160;
const capabilityCaches=new WeakMap();
const control=/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu;
const clipped=(value,length)=>Array.from(value).slice(0,length).join('');
function text(value,label,max=4096) {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000\r\n]/u.test(value))throw new Error('Invalid '+label);
  return value;
}
export function sessionTitle(roleDisplayName,instanceId) {
  if(typeof roleDisplayName!=='string'||!roleDisplayName.trim()||roleDisplayName.length>4096)throw new Error('Invalid role display name');
  text(instanceId,'session instance identity',4096);
  const role=clipped(roleDisplayName.replace(control,' ').replace(/\s+/gu,' ').trim(),80);
  if(!role)throw new Error('Invalid role display name');
  const tail=Array.from(instanceId.replace(/[^\p{L}\p{N}]/gu,'')).slice(-8).join('')||'session';
  const suffix=tail+'-'+createHash('sha256').update(instanceId).digest('hex').slice(0,8);
  return clipped(`SoloCo — ${role} · ${suffix}`,MAX_TITLE);
}

// Advertised CLI support only; this does not establish that a title was retained.
export function claudeNameSupport(command,{spawnSync:probe=spawnSync,refresh=false}={}) {
  text(command,'Claude executable');
  if(typeof probe!=='function')throw new Error('Invalid Claude capability probe');
  let cache=capabilityCaches.get(probe);
  if(!cache){cache=new Map();capabilityCaches.set(probe,cache);}
  const known=cache.get(command);
  if(!refresh&&known&&Date.now()-known.at<30000)return known.supported;
  let supported=false;
  try {
    const result=probe(command,['--help'],{encoding:'utf8',timeout:1000,maxBuffer:256000});
    supported=result?.status===0&&!result.error&&typeof result.stdout==='string'&&/(?:^|\s)--name(?:[\s=]|$)/mu.test(result.stdout);
  }catch{/* Missing optional metadata support must not stop model work. */}
  if(cache.size>=32)cache.clear();
  cache.set(command,{at:Date.now(),supported});
  return supported;
}

// Bounded metadata-only RPC. Callers may launch it without awaiting it on the
// model's critical path; every operational failure is returned as cosmetic state.
export function nameCodexSession(command,nativeId,title,{spawn:start=spawn,timeoutMs=2000}={}) {
  text(command,'Codex executable');text(nativeId,'native session identity',200);text(title,'session title',MAX_TITLE*2);
  if(Array.from(title).length>MAX_TITLE)throw new Error('Invalid session title');
  if(typeof start!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>2000)throw new Error('Invalid naming lifecycle options');
  return new Promise(resolve=>{
    let child,done=false,timer,killTimer,buffer='',size=0,stage=1;
    const base={host:'codex',native_id:nativeId,title,verification:'unverified'};
    const finish=(status,error)=>{
      if(done)return;done=true;clearTimeout(timer);
      const result={...base,status,...(status==='named'?{verification:'app_server_readback'}:{}),...(error?{error}:{} )};
      // The metadata process is never a model worker. End it after readback or
      // failure and escalate promptly, with no indefinitely live child handles.
      if(child){
        try{child.stdin?.end();}catch{}
        try{child.kill('SIGTERM');}catch{}
        killTimer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{};child.stdout?.destroy?.();child.stderr?.destroy?.();child.stdin?.destroy?.();child.unref?.();},150);
        killTimer.unref?.();
      }
      resolve(result);
    };
    const send=value=>{
      if(done)return;
      try{child.stdin.write(JSON.stringify(value)+'\n');}catch{finish('failed','Codex naming request could not be written');}
    };
    try {
      child=start(command,['app-server','--stdio'],{stdio:['pipe','pipe','ignore']});
      if(!child?.stdin||!child?.stdout||typeof child.on!=='function')return finish('failed','Codex naming process was unavailable');
      child.stdout.setEncoding?.('utf8');
      child.on('error',()=>finish('failed','Codex naming process could not start'));
      child.on('close',()=>{clearTimeout(killTimer);if(!done)finish('failed','Codex naming process closed before verification');});
      child.stdin.on('error',()=>finish('failed','Codex naming request stream failed'));
      child.stdout.on('error',()=>finish('failed','Codex naming response stream failed'));
      child.stdout.on('data',chunk=>{
        if(done)return;
        size+=Buffer.byteLength(chunk);buffer+=chunk;
        if(size>262144)return finish('failed','Codex naming response exceeded its metadata budget');
        let at;
        while(!done&&(at=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
          if(!line.trim())continue;
          let response;
          try{response=JSON.parse(line);}catch{return finish('failed','Codex naming response was malformed');}
          if(!response||typeof response!=='object'||Array.isArray(response))return finish('failed','Codex naming response was malformed');
          // Notifications are not RPC acknowledgments or verified readback.
          if(response.id!==stage)continue;
          if(response.error)return finish(response.error.code===-32601?'unsupported':'failed',response.error.code===-32601?'Installed Codex does not support the naming metadata API':'Codex naming metadata RPC failed');
          if(!Object.hasOwn(response,'result'))return finish('failed','Codex naming response had no result');
          if(stage===1){stage=2;send({method:'initialized'});send({id:2,method:'thread/name/set',params:{threadId:nativeId,name:title}});}
          else if(stage===2){stage=3;send({id:3,method:'thread/read',params:{threadId:nativeId,includeTurns:false}});}
          else {
            const thread=response.result?.thread;
            if(thread?.id!==nativeId||thread?.name!==title)return finish('failed','Codex title readback did not match the requested session and name');
            finish('named');
          }
        }
      });
      timer=setTimeout(()=>finish('failed','Codex session naming timed out'),timeoutMs);
      send({id:1,method:'initialize',params:{clientInfo:{name:'soloco-session-naming',version:'1'},capabilities:{}}});
    }catch{finish('failed','Codex naming process could not start');}
  });
}

function unlinkedDirectory(directory) {
  const absolute=path.resolve(directory),parts=absolute.split(path.sep).filter(Boolean);
  let current=path.parse(absolute).root;
  for(const part of parts){current=path.join(current,part);const info=fs.lstatSync(current);if(info.isSymbolicLink()||!info.isDirectory())return false;}
  return true;
}
export function writeNamingReceipt(directory,receipt) {
  let temporary;
  try {
    if(typeof directory!=='string'||!path.isAbsolute(directory)||!receipt||typeof receipt!=='object'||Array.isArray(receipt)||!unlinkedDirectory(directory))return false;
    if(!['codex','claude'].includes(receipt.host)||!['named','requested','unsupported','failed'].includes(receipt.status))return false;
    const value={at:new Date().toISOString(),host:receipt.host,status:receipt.status};
    for(const [key,max] of [['native_id',200],['title',320],['verification',100],['error',300]])if(typeof receipt[key]==='string')value[key]=clipped(receipt[key].replace(/Bearer\s+[^\s"']+|sk-[A-Za-z0-9_-]+/giu,'[credential omitted]'),max);
    const file=path.join(directory,SESSION_NAMING_RECEIPT);
    try{if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())return false;}catch(error){if(error.code!=='ENOENT')return false;}
    temporary=path.join(directory,'.'+SESSION_NAMING_RECEIPT+'.'+randomUUID()+'.tmp');
    fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(temporary,file);temporary=undefined;
    return true;
  }catch{return false;}
  finally{if(temporary){try{fs.unlinkSync(temporary);}catch{}}}
}
