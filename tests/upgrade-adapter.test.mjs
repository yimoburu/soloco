import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runModel, commandArgs } from '../plugins/soloco/runtime/adapters.mjs';

test('nonzero native exit preserves bounded stderr instead of replacing it with an artifact parse error',async()=>{
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
  const promise=runModel('codex',null,'private prompt never included','/tmp',180000,null,{
    resolveExecutable:()=>'/mock/codex',spawn:()=>{
      process.nextTick(()=>{child.emit('spawn');child.stderr.write('x'.repeat(4000)+' input_too_large: Input exceeds maximum1048576 characters, actual2254398');child.emit('close',1);});return child;
    }
  });
  await assert.rejects(promise,error=>{
    assert.match(error.message,/input_too_large.*maximum1048576/);
    assert.doesNotMatch(error.message,/private prompt|no completed artifact/);
    assert.ok(error.message.length<1000);return true;
  });
});

test('real adapter resumes existing native IDs with model tools disabled for both hosts',()=>{
  const codex=commandArgs('codex','stable-cos');
  assert.deepEqual(codex.slice(0,2),['exec','resume']);
  assert.equal(codex.at(-2),'stable-cos');
  assert.ok(codex.includes('features.shell_tool=false'));
  const claude=commandArgs('claude','stable-qa');
  assert.deepEqual(claude.slice(-2),['--resume','stable-qa']);
  assert.equal(claude[claude.indexOf('--tools')+1],'');
});
