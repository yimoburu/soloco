// INTERNAL transport composition only. The source-owned domain retains the real
// task/member guard and nonce. This broker authenticates no model or company
// actor, supplies no interpreter capability, and terminates no remote process.
import net from 'node:net';
import {timingSafeEqual} from 'node:crypto';
import {types} from 'node:util';

const HOST='chatgpt.com',PORT=443,MAX_CONNECTIONS=4,MAX_HEADER=8192;
const MAX_STREAM=4*1024*1024,MAX_LIFETIME=115000,CLOSE_RESERVE=1000;
const UNAUTHORIZED=Buffer.from('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="soloco-private"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
const INVALID=Buffer.from('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
const ESTABLISHED=Buffer.from('HTTP/1.1 200 Connection Established\r\n\r\n');
const fail=code=>{throw Object.assign(Error(code),{code});};
const frozen=value=>Object.freeze(value);
const secret=token=>Buffer.from('Basic '+Buffer.from('soloco:'+token).toString('base64'));
const plain=value=>value!==null&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype;
function options(input){
  if(!plain(input))fail('CONNECT_BROKER_OPTIONS');
  const keys=Reflect.ownKeys(input);
  if(keys.length!==4||keys.some(key=>typeof key!=='string'||!['owner','token','guard','deadline'].includes(key)||!Object.getOwnPropertyDescriptor(input,key)?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value')))fail('CONNECT_BROKER_OPTIONS');
  if(input.owner===null||typeof input.owner!=='object'||types.isProxy(input.owner)||typeof input.guard!=='function'||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token)||!Number.isSafeInteger(input.deadline))fail('CONNECT_BROKER_OPTIONS');
  return {owner:input.owner,token:input.token,guard:input.guard,deadline:input.deadline};
}

// Request headers are discarded after validation; none reach the destination.
// This is deliberately NOT a general HTTP proxy or a request-body parser.
function parseFixedConnectRequest(header,token){
  if(!Buffer.isBuffer(header)||header.length>MAX_HEADER||header.length<4||!header.subarray(-4).equals(Buffer.from('\r\n\r\n'))||header.some(byte=>byte<32&&byte!==13&&byte!==10||byte>126))fail('CONNECT_REQUEST_INVALID');
  const lines=header.toString('ascii').slice(0,-4).split('\r\n');
  if(lines.shift()!=='CONNECT '+HOST+':'+PORT+' HTTP/1.1')fail('CONNECT_REQUEST_INVALID');
  const fields=new Map();
  for(const line of lines){
    const match=/^([A-Za-z][A-Za-z0-9-]*):[ \t]*([^\r\n]*)$/.exec(line);
    if(!match)fail('CONNECT_REQUEST_INVALID');
    const name=match[1].toLowerCase(),value=match[2].trim();
    if(fields.has(name)||!['host','proxy-authorization','user-agent'].includes(name))fail('CONNECT_REQUEST_INVALID');
    fields.set(name,value);
  }
  if(fields.get('host')!==HOST+':'+PORT)fail('CONNECT_REQUEST_INVALID');
  const actual=Buffer.from(fields.get('proxy-authorization')??''),expected=secret(token);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail('CONNECT_REQUEST_UNAUTHORIZED');
}

function dialFixedDestination(){return net.connect({host:HOST,port:PORT,allowHalfOpen:true});}

// The second argument is private lexical composition. It is never reachable
// through the production API; synthetic tests expose only a temporary copy.
async function createBroker(input,dial){
  const {owner,token,guard,deadline}=options(input),started=Date.now();
  const hardDeadline=Math.min(deadline,started+MAX_LIFETIME),stopDeadline=hardDeadline-CLOSE_RESERVE;
  if(stopDeadline<=started)fail('CONNECT_BROKER_DEADLINE');
  const authorizationToken=token;
  let phase='STARTING',reason=null,accepted=0,serverClosed=false,closeTimer=null,workTimer=null,resolveClosed;
  const sockets=new Set(),connections=[];
  const closed=new Promise(resolve=>{resolveClosed=resolve;});
  const inspect=()=>frozen({protocol:'soloco-fixed-connect-broker-data-v1',phase,reason,port:boundPort,
    started_at_ms:started,deadline_ms:hardDeadline,accepted_connections:accepted,maximum_connections:MAX_CONNECTIONS,
    maximum_stream_bytes:MAX_STREAM,local_tcp_closure:phase==='CLOSED'?'OBSERVED':phase==='UNKNOWN'?'UNKNOWN':'PENDING',
    remote_domain_closed:false,connections:frozen(connections.map(row=>frozen({...row})))});
  let boundPort=null;
  function check(stage='io'){
    if(phase==='CLOSING'||phase==='CLOSED'||phase==='UNKNOWN'||Date.now()>=stopDeadline)fail('CONNECT_BROKER_CLOSED');
    if(guard(owner,stage)!==undefined)fail('CONNECT_BROKER_GUARD');
  }
  function finish(unknown=false){
    if(phase==='CLOSED'||phase==='UNKNOWN')return;
    clearTimeout(workTimer);clearTimeout(closeTimer);
    phase=unknown?'UNKNOWN':'CLOSED';resolveClosed(inspect());
  }
  function settled(){if(phase==='CLOSING'&&serverClosed&&sockets.size===0)finish();}
  function stop(why){
    if(['CLOSING','CLOSED','UNKNOWN'].includes(phase))return;
    reason=why;phase='CLOSING';clearTimeout(workTimer);
    try{server.close();}catch{serverClosed=true;}
    for(const socket of sockets)socket.destroy();
    closeTimer=setTimeout(()=>finish(true),Math.max(0,Math.min(CLOSE_RESERVE,hardDeadline-Date.now())));
    settled();
  }
  function guarded(operation,stage='io'){
    try{check(stage);return operation();}catch{stop('guard-or-deadline');return false;}
  }
  function own(socket,row,key){
    sockets.add(socket);
    socket.once('close',()=>{sockets.delete(socket);row[key]=true;settled();});
    socket.on('error',()=>{});
  }
  const server=net.createServer({allowHalfOpen:true},client=>{
    if(phase!=='LISTENING'||accepted>=MAX_CONNECTIONS){client.destroy();return;}
    accepted++;
    const row={number:accepted,upstream_started:false,client_tcp_closed:false,upstream_tcp_closed:true,
      client_received_bytes:0,upstream_received_bytes:0,to_client_bytes:0,to_upstream_bytes:0,outcome:'READING_CONNECT'};
    connections.push(row);own(client,row,'client_tcp_closed');
    let upstream=null,pending=Buffer.alloc(0),connected=false,finished=false,clientEnded=false,upstreamEnded=false;
    const headerTimer=setTimeout(()=>end('header-timeout'),Math.max(1,Math.min(5000,stopDeadline-Date.now())));
    let connectTimer=null;
    function end(outcome){
      if(finished)return;finished=true;row.outcome=outcome;clearTimeout(headerTimer);clearTimeout(connectTimer);
      client.destroy();if(upstream)upstream.destroy();
    }
    function forward(destination,source,bytes,key){
      if(finished)return false;
      if(row[key]+bytes.length>MAX_STREAM){end('stream-limit');return false;}
      let writable=false;
      const wrote=guarded(()=>{row[key]+=bytes.length;writable=destination.write(bytes);return true;});
      if(!wrote)return false;
      if(!writable){source.pause();destination.once('drain',()=>{if(!finished)guarded(()=>{source.resume();return true;});});}
      return true;
    }
    function reject(code){
      if(finished)return;finished=true;
      row.outcome=code==='CONNECT_REQUEST_UNAUTHORIZED'?'unauthorized':'invalid-request';
      clearTimeout(headerTimer);
      const response=code==='CONNECT_REQUEST_UNAUTHORIZED'?UNAUTHORIZED:INVALID;
      guarded(()=>{row.to_client_bytes+=response.length;client.end(response,()=>client.destroy());return true;});
    }
    client.on('error',()=>end('client-error'));
    client.on('close',()=>{clearTimeout(headerTimer);clearTimeout(connectTimer);if(!finished&&!clientEnded)end('client-closed');});
    client.on('end',()=>{
      if(finished)return;
      clientEnded=true;
      if(!connected){end('client-eof');return;}
      guarded(()=>{upstream.end();return true;});
    });
    client.on('data',chunk=>{
      if(finished)return;
      row.client_received_bytes+=chunk.length;
      if(row.client_received_bytes>MAX_STREAM){end('stream-limit');return;}
      if(connected){forward(upstream,client,chunk,'to_upstream_bytes');return;}
      pending=Buffer.concat([pending,chunk]);
      const boundary=pending.indexOf('\r\n\r\n');
      if(boundary===-1){if(pending.length>MAX_HEADER)reject('CONNECT_REQUEST_INVALID');return;}
      const size=boundary+4,header=pending.subarray(0,size),tail=Buffer.from(pending.subarray(size));pending=Buffer.alloc(0);
      try{parseFixedConnectRequest(header,authorizationToken);}catch(error){reject(error.code);return;}
      clearTimeout(headerTimer);client.pause();
      if(!guarded(()=>{upstream=dial();row.upstream_started=true;row.upstream_tcp_closed=false;own(upstream,row,'upstream_tcp_closed');return true;},'connect'))return;
      row.outcome='CONNECTING';
      connectTimer=setTimeout(()=>end('connect-timeout'),Math.max(1,Math.min(5000,stopDeadline-Date.now())));
      upstream.once('connect',()=>{
        clearTimeout(connectTimer);if(finished||!guarded(()=>true))return;
        connected=true;row.outcome='TUNNELED';
        if(!forward(client,upstream,ESTABLISHED,'to_client_bytes'))return;
        if(tail.length&&!forward(upstream,client,tail,'to_upstream_bytes'))return;
        if(!upstream.writableNeedDrain)client.resume();
      });
      upstream.on('data',bytes=>{
        row.upstream_received_bytes+=bytes.length;
        if(row.upstream_received_bytes>MAX_STREAM){end('stream-limit');return;}
        forward(client,upstream,bytes,'to_client_bytes');
      });
      upstream.on('end',()=>{upstreamEnded=true;guarded(()=>{client.end();return true;});});
      upstream.on('error',()=>end('upstream-error'));
      upstream.on('close',()=>{clearTimeout(connectTimer);if(!finished&&!upstreamEnded)end('upstream-closed');});
    });
  });
  server.once('close',()=>{serverClosed=true;settled();});
  server.on('error',()=>{if(phase!=='STARTING')stop('listen-error');});
  workTimer=setTimeout(()=>stop('deadline'),Math.max(1,stopDeadline-Date.now()));
  try{
    // Binding a private loopback listener precedes admission. The domain's
    // 'listen' guard validates original static/deployment state only; 'connect'
    // and every 'io' write still require the domain's actual current admission.
    check('listen');
    await new Promise((resolve,reject)=>{
      const failed=()=>reject(Object.assign(Error('CONNECT_BROKER_LISTEN'),{code:'CONNECT_BROKER_LISTEN'}));
      server.once('error',failed);
      server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{server.removeListener('error',failed);resolve();});
    });
    if(phase!=='STARTING')fail('CONNECT_BROKER_CLOSED');
    const address=server.address();
    if(!address||typeof address==='string'||address.address!=='127.0.0.1')fail('CONNECT_BROKER_LISTEN');
    boundPort=address.port;phase='LISTENING';
  }catch(error){stop('startup-failed');await closed;throw error;}
  return frozen({port:boundPort,closed,inspect,close(why='closed'){
    if(!['closed','cancelled','timeout','io-error'].includes(why))fail('CONNECT_BROKER_CLOSE_REASON');
    stop(why);return closed;
  }});
}

export function createFixedConnectBroker(input){return createBroker(input,dialFixedDestination);}
