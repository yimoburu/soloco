// Actual disposable C/POSIX SOURCE tests. No company/native/provider launch.
// Interposition changes only syscall timing/names on real temporary files; it
// fabricates no stat, read body, frame, directory FD or production selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureOriginSidecarContents,originSidecars,buildSidecarSourceFixture,originalSidecarSourceFixture} from './origin-sidecar-fixture.mjs';
import {originHash} from '../plugins/soloco/runtime/peers/origin-plan.mjs';
import * as actual from '../plugins/soloco/runtime/peers/origin-sidecar-capture.mjs';
const q=JSON.stringify;
const headers='#define _DARWIN_C_SOURCE 1\n#define _POSIX_C_SOURCE 200809L\n#include <sys/types.h>\n#include <sys/stat.h>\n#include <fcntl.h>\n#include <dirent.h>\n#include <unistd.h>\n#include <stdlib.h>\n#include <stdio.h>\n#include <string.h>\n';
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-sidecar-source-'))),inside=path.join(root,'inside'),sub=path.join(inside,'sub'),saved=path.join(root,'saved'),marker=path.join(root,'marker');fs.mkdirSync(sub,{recursive:true});const target=path.join(sub,'held.txt');fs.writeFileSync(target,'ORIGINAL');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,inside,sub,saved,target,marker};}
const changed=e=>e.code==='ORIGIN_SIDECAR_CHANGED';
const captureOf=f=>directory=>f.module.captureOriginSidecarContents(directory);
function hook(symbol,prototype,body){return {header:headers+prototype+'\n#define '+symbol+' source_test_'+symbol+'\n',interposer:'#undef '+symbol+'\n'+headers+body};}

test('fixed FD3 capture retains exact UTF8/binary bytes and source/binary pins',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.inside,'binary'),Buffer.from([0xff,0,0xfe]));fs.writeFileSync(path.join(f.inside,'雪😀'),'Exact UTF8 雪😀 "\\\n');fs.writeFileSync(path.join(f.inside,'company.sqlite'),'Declared SQLite snapshot.');const values=captureOriginSidecarContents(f.inside);assert.deepEqual(values.map(({content,...v})=>v),originSidecars(f.inside));assert.deepEqual(values.find(v=>v.path==='binary').content,Buffer.from([0xff,0,0xfe]));assert.equal(values.find(v=>v.path==='雪😀').content.toString(),'Exact UTF8 雪😀 "\\\n');assert.equal(values.find(v=>v.path==='sub/held.txt').content.toString(),'ORIGINAL');for(const v of values){assert.equal(v.bytes,v.content.length);assert.equal(v.sha256,originHash(v.content));}assert.equal(originalSidecarSourceFixture.metadata.native_qualified,false);assert.equal(originalSidecarSourceFixture.metadata.production_selection,'SYNTHETIC');
});

test('production missing verified helper Holds before directory capture',t=>{const f=fixture(t);assert.throws(()=>actual.captureOriginSidecarContents(f.inside));assert.equal(fs.readFileSync(f.target,'utf8'),'ORIGINAL');});

test('repeated actual NONSELECTED ancestor swaps inside fdopendir cannot redirect or omit original FD contents',async t=>{
 const top=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-fd-ancestor-'))),ancestor=path.join(top,'ancestor'),directory=path.join(ancestor,'selected'),external=path.join(top,'external'),saved=path.join(top,'saved'),marker=path.join(top,'marker');fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(path.join(external,'selected'),{recursive:true});fs.writeFileSync(path.join(directory,'original.txt'),'Original UNKNOWN must remain present.');t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const binary=await buildSidecarSourceFixture(hook('fdopendir','DIR *source_test_fdopendir(int);',`DIR *source_test_fdopendir(int fd){if(rename(${q(ancestor)},${q(saved)})||symlink(${q(external)},${q(ancestor)}))_exit(91);DIR *result=fdopendir(fd);if(unlink(${q(ancestor)})||rename(${q(saved)},${q(ancestor)}))_exit(92);int out=open(${q(marker)},O_WRONLY|O_CREAT|O_APPEND,0600);if(out<0||write(out,"1",1)!=1)_exit(93);close(out);return result;}`));
 const result=captureOf(binary)(directory);assert.ok(fs.readFileSync(marker,'utf8').length>=2);assert.equal(result.length,1);assert.equal(result[0].path,'original.txt');assert.equal(result[0].content.toString(),'Original UNKNOWN must remain present.');assert.equal(fs.readFileSync(path.join(directory,'original.txt'),'utf8'),result[0].content.toString());
});

test('actual regular-to-FIFO openat race uses NONBLOCK and cannot hang or return source bytes',async t=>{
 const f=fixture(t),binary=await buildSidecarSourceFixture(hook('openat','int source_test_openat(int,const char *,int);',`int source_test_openat(int fd,const char *name,int flags){static int done=0;if(!done&&strcmp(name,"held.txt")==0){done=1;if(!(flags&O_NONBLOCK))_exit(94);if(renameat(fd,name,fd,"source-saved")||mkfifoat(fd,name,0600))_exit(95);int result=openat(fd,name,flags);if(unlinkat(fd,name,0)||renameat(fd,"source-saved",fd,name))_exit(96);int out=open(${q(f.marker)},O_WRONLY|O_CREAT,0600);if(result<0||out<0||write(out,"FIFO_OPENED_NONBLOCK",20)!=20)_exit(97);close(out);return result;}return openat(fd,name,flags);}`));
 const start=Date.now();assert.throws(()=>captureOf(binary)(f.inside),changed);assert.ok(Date.now()-start<10000);assert.equal(fs.readFileSync(f.marker,'utf8'),'FIFO_OPENED_NONBLOCK');assert.equal(fs.readFileSync(f.target,'utf8'),'ORIGINAL');
});

test('actual held-FD read is bounded to original size plus one and rejects growth',async t=>{
 const f=fixture(t),binary=await buildSidecarSourceFixture(hook('read','ssize_t source_test_read(int,void *,size_t);',`ssize_t source_test_read(int fd,void *body,size_t count){static int done=0;if(!done++){int out=open(${q(f.marker)},O_WRONLY|O_CREAT,0600);dprintf(out,"%zu",count);close(out);int changed=open(${q(f.target)},O_WRONLY|O_APPEND);char bytes[4096];memset(bytes,'G',sizeof bytes);for(int i=0;i<256;i++)if(write(changed,bytes,sizeof bytes)!=(ssize_t)sizeof bytes)_exit(98);close(changed);}return read(fd,body,count);}`));
 assert.throws(()=>captureOf(binary)(f.inside),changed);assert.equal(fs.readFileSync(f.marker,'utf8'),'9');assert.equal(fs.statSync(f.target).size,8+1024*1024);
});

test('actual selected child directory replacement during fdopendir is rejected without an empty accepted inventory',async t=>{
 const f=fixture(t),binary=await buildSidecarSourceFixture(hook('fdopendir','DIR *source_test_fdopendir(int);',`DIR *source_test_fdopendir(int fd){static int calls=0;if(++calls==2){if(rename(${q(f.sub)},${q(f.saved)})||mkdir(${q(f.sub)},0700))_exit(91);DIR *result=fdopendir(fd);if(rmdir(${q(f.sub)})||rename(${q(f.saved)},${q(f.sub)}))_exit(92);int out=open(${q(f.marker)},O_WRONLY|O_CREAT,0600);write(out,"1",1);close(out);return result;}return fdopendir(fd);}`));
 assert.throws(()=>captureOf(binary)(f.inside),changed);assert.equal(fs.readFileSync(f.marker,'utf8'),'1');assert.equal(fs.readFileSync(f.target,'utf8'),'ORIGINAL');
});

test('sidecar symlinks and hardlinks remain denied',t=>{const f=fixture(t),link=path.join(f.inside,'link');fs.symlinkSync(f.target,link);assert.throws(()=>originSidecars(f.inside),e=>e.code==='ORIGIN_SIDECAR_LINK');fs.unlinkSync(link);fs.linkSync(f.target,link);assert.throws(()=>originSidecars(f.inside),e=>e.code==='ORIGIN_SIDECAR_LINK');});

test('unknown company.sqlite-prefixed files and directories remain complete sidecars; mutations change the cut',t=>{
 const f=fixture(t),folder=path.join(f.inside,'company.sqlite-evidence');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'original.txt'),'Original UNKNOWN directory evidence.');for(const name of ['company.sqlite-extra','company.sqlite-journal'])fs.writeFileSync(path.join(f.inside,name),'Original '+name);for(const name of ['company.sqlite','company.sqlite-wal','company.sqlite-shm'])fs.writeFileSync(path.join(f.inside,name),'Declared DB snapshot body.');const before=captureOriginSidecarContents(f.inside);assert.deepEqual(before.map(v=>v.path),['company.sqlite-evidence/original.txt','company.sqlite-extra','company.sqlite-journal','sub/held.txt']);fs.writeFileSync(path.join(f.inside,'company.sqlite-extra'),'Changed UNKNOWN prefixed evidence.');fs.writeFileSync(path.join(folder,'new.txt'),'New global obligation.');const after=originSidecars(f.inside);assert.equal(after.find(v=>v.path==='company.sqlite-extra').sha256,originHash('Changed UNKNOWN prefixed evidence.'));assert.ok(after.some(v=>v.path==='company.sqlite-evidence/new.txt'));assert.notDeepEqual(before.map(({content,...v})=>v),after);
});

test('depth and byte limits reject the whole capture without partial source output',t=>{
 for(const kind of ['depth','bytes']){const f=fixture(t);if(kind==='depth'){let directory=f.inside;for(let i=0;i<25;i++){directory=path.join(directory,'d');fs.mkdirSync(directory);}fs.writeFileSync(path.join(directory,'pending.txt'),'Original UNKNOWN.');}else{const fd=fs.openSync(path.join(f.inside,'oversized'),'wx');try{fs.ftruncateSync(fd,64*1024*1024+1);}finally{fs.closeSync(fd);}}assert.throws(()=>captureOriginSidecarContents(f.inside),e=>e.code==='ORIGIN_SIDECAR_CAPACITY');assert.equal(fs.readFileSync(f.target,'utf8'),'ORIGINAL');}
});

test('non-UTF8 pathname bytes in an actual helper frame Hold instead of becoming replacement-name data',async t=>{
 const f=fixture(t),binary=await buildSidecarSourceFixture(hook('write','ssize_t source_test_write(int,const void *,size_t);',`ssize_t source_test_write(int fd,const void *body,size_t count){static int calls=0;if(fd==STDOUT_FILENO&&++calls==5){unsigned char *changed=malloc(count);if(!changed||count==0)_exit(99);memcpy(changed,body,count);changed[0]=255;ssize_t result=write(fd,changed,count);free(changed);return result;}return write(fd,body,count);}`));assert.throws(()=>captureOf(binary)(f.inside),e=>e.code==='ORIGIN_SIDECAR_FRAME');assert.equal(fs.readFileSync(f.target,'utf8'),'ORIGINAL');
});

test('an actual completed helper with corrupt binary frame cannot supply accepted partial inventory',async t=>{
 const f=fixture(t),binary=await buildSidecarSourceFixture(hook('write','ssize_t source_test_write(int,const void *,size_t);',`ssize_t source_test_write(int fd,const void *body,size_t count){static int done=0;if(fd==STDOUT_FILENO&&!done++){char bad='X';if(write(fd,&bad,1)!=1)_exit(99);}return write(fd,body,count);}`));assert.throws(()=>captureOf(binary)(f.inside),e=>e.code==='ORIGIN_SIDECAR_FRAME');assert.equal(fs.readFileSync(f.target,'utf8'),'ORIGINAL');
});
