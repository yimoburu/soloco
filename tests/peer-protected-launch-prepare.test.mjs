import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createFixedConnectBroker} from '../plugins/soloco/runtime/peers/protected-connect-broker.mjs';

const MODULE=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url));

async function preparationFixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-launch-prepare-test-'));
  const original=fs.readFileSync(MODULE,'utf8');
  t.after(()=>{
    assert.equal(fs.readFileSync(MODULE,'utf8'),original,'the production module must remain unchanged');
    fs.rmSync(directory,{recursive:true,force:true});
  });
  // Explicit SYNTHETIC predecessor boundary: this object is not a registered
  // source-qualified interpreter, selected component, deployment or capability.
  // Only the two pre-compile static operations are replaced in the test copy.
  const predecessors=path.join(directory,'synthetic-predecessors.mjs');
  fs.writeFileSync(predecessors,`export const syntheticInterpreter=Object.freeze(Object.create(null));
export let finalInspections=0;
export function resolveOriginalPeerContextInterpreter(){return syntheticInterpreter;}
export function assertOriginalPeerContextInterpreterFinal(value){if(value!==syntheticInterpreter)throw Error('unexpected synthetic predecessor');finalInspections++;}
`);
  const expected="import {ORIGINAL_CONTEXT_SELECTION,resolveOriginalPeerContextInterpreter,assertOriginalPeerContextInterpreterFinal,assertOriginalPeerContextSlot,inspectOriginalPeerContextInterpreter} from './protected-source-build-slot.mjs';";
  assert.equal(original.split(expected).length,2,'test transformation must match exactly one original import');
  let body=original.replace(expected,"import {ORIGINAL_CONTEXT_SELECTION,assertOriginalPeerContextSlot,inspectOriginalPeerContextInterpreter} from './protected-source-build-slot.mjs';\nimport {resolveOriginalPeerContextInterpreter,assertOriginalPeerContextInterpreterFinal} from "+JSON.stringify(pathToFileURL(predecessors).href)+';');
  // Relocation preserves every other actual production dependency. In
  // particular createFixedConnectBroker remains the real imported implementation.
  body=body.replace(/from '(\.\/?[^']*)'/g,(_whole,relative)=>'from '+JSON.stringify(new URL(relative,pathToFileURL(MODULE)).href));
  const copy=path.join(directory,'domain.mjs');fs.writeFileSync(copy,body);
  return {domain:await import(pathToFileURL(copy).href),predecessors:await import(pathToFileURL(predecessors).href)};
}

test('actual launch preparation binds loopback and reaches compile before admission, then closes on compile failure',async t=>{
  const {domain,predecessors}=await preparationFixture(t),owner=Symbol('synthetic prepare owner');
  const STOP=Object.assign(Error('STOP_AFTER_COMPILE'),{code:'STOP_AFTER_COMPILE'});
  let calls=0,boundServer=null,port=null;
  const input={cwd:'/synthetic-project',read_paths:['/synthetic-source'],state_root:'/synthetic-state',scratch_root:'/synthetic-scratch'};
  const supervisor={compile(actualOwner,request,context){
    calls++;assert.equal(actualOwner,owner);
    assert.equal(request.kind,'codex-companion');
    for(const [key,value] of Object.entries(input))assert.deepEqual(request[key],value);
    assert.deepEqual(Object.keys(context),['context_interpreter']);
    assert.equal(context.context_interpreter,predecessors.syntheticInterpreter);
    port=request.gateway_port;assert.ok(Number.isSafeInteger(port)&&port>0&&port<=65535);
    // Test-only observation of the pinned Node runtime's real active listener.
    // This avoids introducing a fake broker or opening an authenticated tunnel.
    boundServer=process._getActiveHandles().find(handle=>handle instanceof net.Server&&handle.listening&&handle.address()?.address==='127.0.0.1'&&handle.address()?.port===port);
    assert.ok(boundServer,'compile must receive an actually bound original loopback broker port');
    throw STOP; // Stop before plan/launch minting, process creation or admission.
  }};
  await assert.rejects(domain.prepareOriginalProtectedPeerLaunch(owner,supervisor,input),error=>error===STOP);
  assert.equal(calls,1,'pre-admission preparation must reach the actual compile seam');
  assert.equal(predecessors.finalInspections,1,'the listen stage checks only its explicit static predecessor');
  assert.equal(boundServer.listening,false);assert.equal(boundServer.address(),null,'failed preparation drains its real listener');
  assert.equal(process._getActiveHandles().some(handle=>handle instanceof net.Server&&handle.listening&&handle.address()?.port===port),false);
});

test('a real authenticated CONNECT remains blocked before admission even when loopback preparation is allowed',async t=>{
  // This is independent synthetic domain bookkeeping, not a company admission.
  const owner=Object.freeze({synthetic:true}),token='a'.repeat(64),stages=[];
  const broker=await createFixedConnectBroker({owner,token,deadline:Date.now()+10000,guard:(actualOwner,stage)=>{
    assert.equal(actualOwner,owner);stages.push(stage);
    if(stage!=='listen')throw Object.assign(Error('synthetic admission absent'),{code:'SYNTHETIC_NO_ADMISSION'});
  }});t.after(()=>broker.close());
  const client=net.connect({host:'127.0.0.1',port:broker.port});client.on('error',()=>{});t.after(()=>client.destroy());
  await once(client,'connect');
  const response=[];client.on('data',bytes=>response.push(bytes));
  const localClosed=new Promise(resolve=>client.once('close',resolve));
  client.write('CONNECT chatgpt.com:443 HTTP/1.1\r\nHost: chatgpt.com:443\r\nProxy-Authorization: Basic '+Buffer.from('soloco:'+token).toString('base64')+'\r\n\r\n');
  const result=await broker.closed;await localClosed;
  assert.deepEqual(stages,['listen','connect']);
  assert.equal(Buffer.concat(response).length,0,'no CONNECT acknowledgement or opaque bytes are written without admission');
  assert.equal(result.accepted_connections,1);assert.equal(result.connections[0].upstream_started,false,'guard fails before the fixed external dial');
  assert.equal(result.local_tcp_closure,'OBSERVED');assert.equal(result.remote_domain_closed,false);
  assert.equal(JSON.stringify(result).includes(token),false);
});
