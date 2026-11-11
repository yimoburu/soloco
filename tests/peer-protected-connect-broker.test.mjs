import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createFixedConnectBroker} from '../plugins/soloco/runtime/peers/protected-connect-broker.mjs';

// SYNTHETIC transport fixtures only. All actual sockets in this suite are IPv4
// loopback. The real chatgpt.com dialer is never reached by these tests.
const TOKEN='a'.repeat(64),OWNER=Object.freeze({synthetic_owner:true});
const source=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-connect-broker.mjs',import.meta.url));
const settings=(extra={})=>({owner:OWNER,token:TOKEN,guard:()=>{},deadline:Date.now()+10000,...extra});
const request=(authorization='Basic '+Buffer.from('soloco:'+TOKEN).toString('base64'))=>Buffer.from('CONNECT chatgpt.com:443 HTTP/1.1\r\nHost: chatgpt.com:443\r\nProxy-Authorization: '+authorization+'\r\n\r\n');
async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-connect-broker-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const copy=path.join(directory,'broker.mjs');
  fs.writeFileSync(copy,fs.readFileSync(source,'utf8')+'\nexport {parseFixedConnectRequest as parseForTest,createBroker as createForTest};\n');
  return import(pathToFileURL(copy).href);
}
async function connect(port){const socket=net.connect({host:'127.0.0.1',port});socket.on('error',()=>{});await once(socket,'connect');return socket;}
async function exchange(port,bytes){
  const socket=await connect(port),chunks=[];socket.on('data',chunk=>chunks.push(chunk));
  const closed=new Promise(resolve=>socket.once('close',resolve));socket.end(bytes);await closed;return Buffer.concat(chunks).toString();
}
async function listen(server){server.listen({host:'127.0.0.1',port:0});await once(server,'listening');return server.address().port;}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function until(predicate){
  const deadline=Date.now()+2500;
  while(!predicate()){assert.ok(Date.now()<deadline,'bounded loopback fixture observation deadline');await delay(5);}
}
async function fixtureServer(t,handler){
  const sockets=new Set(),server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));handler(socket);});
  const port=await listen(server);
  t.after(()=>{for(const socket of sockets)socket.destroy();return new Promise(resolve=>server.close(resolve));});
  return port;
}

test('strict parser accepts only fixed authenticated CONNECT and rejects route/body/header aliases',async t=>{
  const {parseForTest}=await fixture(t);
  assert.equal(parseForTest(request(),TOKEN),undefined);
  const invalid=[
    request().toString().replace('CONNECT chatgpt.com:443','CONNECT example.invalid:443'),
    request().toString().replace('Host: chatgpt.com:443','Host: example.invalid:443'),
    request().toString().replace('CONNECT','GET'),
    request().toString().replace('HTTP/1.1','HTTP/1.0'),
    request().toString().replace('\r\n\r\n','\r\nContent-Length: 1\r\n\r\n'),
    request().toString().replace('\r\n\r\n','\r\nHost: chatgpt.com:443\r\n\r\n'),
    request().toString().replace('\r\n\r\n','\r\nTransfer-Encoding: chunked\r\n\r\n'),
    request().toString().replace(/\r\n/g,'\n'),
    request().toString().replace('Host:',' Host:'),
  ];
  for(const value of invalid)assert.throws(()=>parseForTest(Buffer.from(value),TOKEN),{code:'CONNECT_REQUEST_INVALID'});
  for(const auth of ['', 'Basic '+Buffer.from('soloco:'+'b'.repeat(64)).toString('base64'),'Bearer '+TOKEN])assert.throws(()=>parseForTest(request(auth),TOKEN),{code:'CONNECT_REQUEST_UNAUTHORIZED'});
});

test('public broker rejects unauthenticated and invalid loopback requests without upstream activity',async t=>{
  const broker=await createFixedConnectBroker(settings());t.after(()=>broker.close());
  assert.match(await exchange(broker.port,request('')),/^HTTP\/1\.1 407 /);
  assert.match(await exchange(broker.port,Buffer.from('GET / HTTP/1.1\r\nHost: chatgpt.com\r\n\r\n')),/^HTTP\/1\.1 400 /);
  assert.ok(broker.inspect().connections.every(row=>row.upstream_started===false));
  const result=await broker.close();assert.equal(result.local_tcp_closure,'OBSERVED');assert.equal(result.remote_domain_closed,false);
  assert.equal(JSON.stringify(result).includes(TOKEN),false);
});

test('options reject caller endpoint, dial callback and malformed owner/nonce/deadline',async()=>{
  for(const input of [settings({endpoint:'https://example.invalid'}),settings({dial:()=>{}}),settings({token:'secret'}),settings({owner:null}),settings({deadline:Date.now()+100}),settings({guard:()=>true})]){
    await assert.rejects(createFixedConnectBroker(input),error=>['CONNECT_BROKER_OPTIONS','CONNECT_BROKER_DEADLINE','CONNECT_BROKER_GUARD'].includes(error.code));
  }
});

test('preparation-only listen guard binds loopback but blocks every external connection before admission',async t=>{
  const {createForTest}=await fixture(t);let dials=0;const stages=[];
  const broker=await createForTest(settings({guard:(owner,stage)=>{
    assert.equal(owner,OWNER);stages.push(stage);
    if(stage!=='listen')throw Error('synthetic task is not admitted');
  }}),()=>{dials++;throw Error('must not dial');});t.after(()=>broker.close());
  assert.equal(broker.inspect().phase,'LISTENING');assert.deepEqual(stages,['listen']);
  assert.equal(await exchange(broker.port,request()),'');
  const result=await broker.closed;assert.equal(dials,0);
  assert.deepEqual(stages,['listen','connect']);assert.equal(result.reason,'guard-or-deadline');
  assert.ok(result.connections.every(row=>!row.upstream_started));assert.equal(result.remote_domain_closed,false);
});

test('test-owned exact-source copy tunnels opaque bytes using only its private loopback dial fixture',async t=>{
  const {createForTest}=await fixture(t),seen=[];
  const port=await fixtureServer(t,socket=>{socket.on('data',data=>{seen.push(Buffer.from(data));socket.write(Buffer.from([0x16,0x03,0x03,0xff]));});});
  let guards=0,dials=0;
  const broker=await createForTest(settings({guard:owner=>{assert.equal(owner,OWNER);guards++;}}),()=>{dials++;return net.connect({host:'127.0.0.1',port});});t.after(()=>broker.close());
  const client=await connect(broker.port);t.after(()=>client.destroy());const chunks=[];client.on('data',chunk=>chunks.push(chunk));
  client.write(request());
  await until(()=>Buffer.concat(chunks).includes(Buffer.from('\r\n\r\n')));
  assert.match(Buffer.concat(chunks).toString(),/^HTTP\/1\.1 200 Connection Established/);
  const opaque=Buffer.from([0x16,0x03,0x01,0x00,0xff,0x80]);client.write(opaque);
  await until(()=>Buffer.concat(chunks).includes(Buffer.from([0x16,0x03,0x03,0xff])));
  assert.deepEqual(Buffer.concat(seen),opaque);assert.ok(Buffer.concat(chunks).includes(Buffer.from([0x16,0x03,0x03,0xff])));
  assert.equal(dials,1);assert.ok(guards>=5);
  assert.equal((await broker.close()).local_tcp_closure,'OBSERVED');
});

test('a guard revoked after CONNECT prevents the next client write and retains local closure only',async t=>{
  const {createForTest}=await fixture(t);let revoked=false,dials=0;const received=[];
  const port=await fixtureServer(t,socket=>{socket.on('data',chunk=>received.push(chunk));});
  const broker=await createForTest(settings({guard:()=>{if(revoked)throw Error('synthetic revoked');}}),()=>{dials++;return net.connect({host:'127.0.0.1',port});});t.after(()=>broker.close());
  const client=await connect(broker.port);client.on('data',()=>{});client.write(request());
  await until(()=>broker.inspect().connections[0]?.outcome==='TUNNELED');
  revoked=true;client.write(Buffer.from('synthetic blocked bytes'));
  const result=await broker.closed;assert.equal(dials,1);assert.equal(Buffer.concat(received).length,0);
  assert.equal(result.reason,'guard-or-deadline');assert.equal(result.remote_domain_closed,false);assert.equal(result.local_tcp_closure,'OBSERVED');
});

test('normal upstream EOF drains queued response bytes through backpressure before closing',async t=>{
  const {createForTest}=await fixture(t),body=Buffer.alloc(512*1024,0x16);
  const port=await fixtureServer(t,socket=>{socket.once('data',()=>socket.end(body));});
  const broker=await createForTest(settings(),()=>net.connect({host:'127.0.0.1',port,allowHalfOpen:true}));t.after(()=>broker.close());
  const client=await connect(broker.port);t.after(()=>client.destroy());const chunks=[];
  client.on('data',chunk=>chunks.push(chunk));client.write(request());
  await until(()=>Buffer.concat(chunks).includes(Buffer.from('\r\n\r\n')));
  client.pause();client.write(Buffer.from([0x16]));await delay(20);client.resume();
  await new Promise(resolve=>client.once('close',resolve));
  const output=Buffer.concat(chunks),boundary=output.indexOf('\r\n\r\n')+4;
  assert.deepEqual(output.subarray(boundary),body,'normal FIN cannot discard a queued opaque response');
});

test('the four-connection lifetime bound never opens a fifth upstream socket',async t=>{
  const {createForTest}=await fixture(t);let dials=0;
  const broker=await createForTest(settings(),()=>{dials++;throw Error('must not dial');});t.after(()=>broker.close());
  for(let i=0;i<4;i++)assert.match(await exchange(broker.port,request('')),/^HTTP\/1\.1 407 /);
  assert.equal(await exchange(broker.port,request()),'');assert.equal(dials,0);assert.equal(broker.inspect().accepted_connections,4);
});

test('stream byte ceiling closes a valid synthetic tunnel rather than clipping or forwarding excess',async t=>{
  const {createForTest}=await fixture(t);let received=0;
  const port=await fixtureServer(t,socket=>{socket.on('data',chunk=>{received+=chunk.length;});});
  const broker=await createForTest(settings(),()=>net.connect({host:'127.0.0.1',port}));t.after(()=>broker.close());
  const client=await connect(broker.port);client.on('data',()=>{});client.write(request());
  await until(()=>broker.inspect().connections[0]?.outcome==='TUNNELED');
  const ended=once(client,'close');client.end(Buffer.alloc(4*1024*1024+1,0x16));await ended;
  assert.equal(broker.inspect().connections[0].outcome,'stream-limit');assert.ok(received<4*1024*1024+1);
});

test('absolute deadline includes startup and destroys retained owned TCP sockets',async t=>{
  const broker=await createFixedConnectBroker(settings({deadline:Date.now()+1200}));t.after(()=>broker.close());
  const client=await connect(broker.port);client.on('data',()=>{});
  const result=await broker.closed;assert.equal(result.reason,'deadline');assert.equal(result.local_tcp_closure,'OBSERVED');assert.equal(result.remote_domain_closed,false);
});
