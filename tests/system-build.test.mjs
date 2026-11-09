import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseSystemBuildDescriptor,readSystemBuildDescriptor} from '../plugins/soloco/runtime/system-build.mjs';

const fixed='/System/Library/CoreServices/SystemVersion.plist';
const xml=(build='25G241',extra='')=>Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>ProductBuildVersion</key><string>${build}</string><key>ProductName</key><string>macOS</string>${extra}</dict></plist>\n`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stat=(bytes,extra={})=>({dev:1n,ino:2n,mode:0o100444n,uid:0n,gid:0n,nlink:1n,size:BigInt(bytes.length),mtimeNs:3n,ctimeNs:4n,isFile:()=>true,isSymbolicLink:()=>false,...extra});
function adapter(bytes=xml(),options={}) {
  const calls=[];let fstats=0,lstats=0,closed=false;
  const io={
    lstatSync(file,flags){calls.push(['lstat',file,flags]);return options.lstat?.(++lstats)??stat(bytes);},
    openSync(file,flags){calls.push(['open',file,flags]);if(options.openError)throw options.openError;return 7;},
    fstatSync(fd,flags){calls.push(['fstat',fd,flags]);return options.fstat?.(++fstats)??stat(bytes);},
    readSync(fd,buffer,offset,length,position){calls.push(['read',fd,offset,length,position]);if(options.readError)throw options.readError;const available=options.readBytes??bytes,n=Math.min(length,Math.max(0,available.length-position),options.chunk??Infinity);available.copy(buffer,offset,position,position+n);return n;},
    closeSync(fd){calls.push(['close',fd]);closed=true;if(options.closeError)throw options.closeError;}
  };
  return {io,calls,closed:()=>closed};
}
function reject(work,code,phase) {
  assert.throws(work,error=>{
    assert.equal(error.method,'system-version-plist');assert.equal(error.code,code);
    if(phase)assert.equal(error.phase,phase);
    return true;
  });
}

test('system descriptor extracts the fresh Apple build and commits exact bytes',()=>{
  const bytes=xml(),result=parseSystemBuildDescriptor(bytes);
  assert.deepEqual(result,{protocol:'apple-system-version-plist-v1',system_build:'25G241',descriptor_sha256:sha(bytes)});
  assert.notEqual(parseSystemBuildDescriptor(Buffer.concat([bytes,Buffer.from('\n')])).descriptor_sha256,result.descriptor_sha256);
});
test('system descriptor supports only standard XML escapes without entity expansion',()=>{
  const bytes=xml('25A5279m','<key>Copyright</key><string>A &amp; B &#x26; C &#38; D &lt; E &gt; F &quot; G &apos;</string>');
  assert.equal(parseSystemBuildDescriptor(bytes).system_build,'25A5279m');
});
test('system descriptor rejects malformed or unsupported XML without partial extraction',async t=>{
  const cases={
    missing:'<plist version="1.0"><dict><key>ProductName</key><string>macOS</string></dict></plist>',
    duplicate:xml('25G241','<key>ProductBuildVersion</key><string>25G242</string>'),
    duplicate_other:xml('25G241','<key>ProductName</key><string>macOS</string>'),
    nonstring:xml().toString().replace('<string>25G241</string>','<integer>25</integer>'),
    extra_dict:xml().toString().replace('</dict>','</dict><dict/>'),
    entity:xml().toString().replace('25G241','&external;'),
    stray_ampersand:xml('25G241','<key>A</key><string>A & B</string>'),
    invalid_numeric_entity:xml('25G241','<key>A</key><string>&#0;</string>'),
    internal_dtd:xml().toString().replace('http://www.apple.com/DTDs/PropertyList-1.0.dtd">','http://www.apple.com/DTDs/PropertyList-1.0.dtd" [<!ENTITY evil "25G241">]>'),
    external_dtd:xml().toString().replace('http://www.apple.com/DTDs/PropertyList-1.0.dtd','https://attacker.invalid/plist.dtd'),
    nested:xml('25G241','<key>Nested</key><dict><key>A</key><string>B</string></dict>'),
    trailing_markup:xml().toString()+'<plist/>',
    instruction:xml().toString().replace('<dict>','<dict><?run evil?>'),
    cdata:xml().toString().replace('25G241','<![CDATA[25G241]]>'),
    forbidden_text:xml('25G241','<key>A</key><string>]]></string>'),
    forbidden_xml_codepoint:xml('25G241','<key>A</key><string>\ufffe</string>'),
    binary:Buffer.from('bplist00ignoredProductBuildVersion25G241'),
    invalid_utf8:Buffer.concat([xml(),Buffer.from([0xff])]),
    empty:Buffer.alloc(0),
    oversized:Buffer.alloc(16385,32)
  };
  for(const [name,value] of Object.entries(cases))await t.test(name,()=>reject(()=>parseSystemBuildDescriptor(Buffer.isBuffer(value)?value:Buffer.from(value)),'SYSBUILD_FORMAT','parse'));
});
test('system descriptor rejects invalid build strings and accepts bounded release and seed forms',()=>{
  for(const value of ['', '25G241\n', ' 25G241','25G241 ', 'macOS 26.6', '../../build', '25G241;id', '25G241<script>', '25gg241', '1234G241', '25G1234567'])reject(()=>parseSystemBuildDescriptor(xml(value)),'SYSBUILD_FORMAT','parse');
  for(const value of ['9A1','22G720','24G90','25A5279m'])assert.equal(parseSystemBuildDescriptor(xml(value)).system_build,value);
});
test('system descriptor opens only the fixed path with no-follow and nonblocking flags',()=>{
  const a=adapter();assert.equal(readSystemBuildDescriptor(a.io).system_build,'25G241');
  for(const call of a.calls.filter(call=>['lstat','open'].includes(call[0])))assert.equal(call[1],fixed);
  const flags=a.calls.find(call=>call[0]==='open')[2];
  assert.equal(flags&fs.constants.O_NOFOLLOW,fs.constants.O_NOFOLLOW);
  assert.equal(flags&fs.constants.O_NONBLOCK,fs.constants.O_NONBLOCK);
  assert.equal(a.closed(),true);
  assert.equal(a.calls.filter(call=>call[0]==='open').length,1);
});
test('system descriptor reads fragmented data within one bounded allocation',()=>{
  const bytes=xml(),a=adapter(bytes,{chunk:7});
  assert.equal(readSystemBuildDescriptor(a.io).descriptor_sha256,sha(bytes));
  const reads=a.calls.filter(call=>call[0]==='read');assert.ok(reads.length>2);
  for(const call of reads){assert.ok(call[2]+call[3]<=16385);assert.equal(call[2],call[4]);}
});
test('system descriptor has no cached success across independent reads',()=>{
  const first=adapter(xml('25G241')),second=adapter(xml('25G242'));
  const a=readSystemBuildDescriptor(first.io),b=readSystemBuildDescriptor(second.io);
  assert.equal(a.system_build,'25G241');assert.equal(b.system_build,'25G242');assert.notEqual(a.descriptor_sha256,b.descriptor_sha256);
  assert.equal(second.calls.filter(call=>call[0]==='read').length,2);
});
test('system descriptor rejects untrusted metadata before open',async t=>{
  const bytes=xml(),cases={
    user_owned:{uid:501n},group_writable:{mode:0o100464n},world_writable:{mode:0o100446n},
    linked:{isSymbolicLink:()=>true},directory:{isFile:()=>false},multiple_links:{nlink:2n},
    empty:{size:0n},large:{size:16385n},unknown_time:{mtimeNs:undefined}
  };
  for(const [name,extra] of Object.entries(cases))await t.test(name,()=>{
    const a=adapter(bytes,{lstat:()=>stat(bytes,extra)});reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_METADATA','metadata');
    assert.equal(a.calls.some(call=>call[0]==='open'),false);assert.equal(a.closed(),false);
  });
});
test('system descriptor rejects replacement between lstat and open',()=>{
  const bytes=xml(),a=adapter(bytes,{fstat:()=>stat(bytes,{ino:9n})});
  reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_RACE','identity');assert.equal(a.closed(),true);
  assert.equal(a.calls.some(call=>call[0]==='read'),false);
});
test('system descriptor rejects every metadata change after the bounded read',async t=>{
  const bytes=xml();
  for(const key of ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'])await t.test(key,()=>{
    const original=stat(bytes),changed=stat(bytes,{[key]:original[key]+1n});
    const a=adapter(bytes,{fstat:n=>n===1?original:changed});
    assert.throws(()=>readSystemBuildDescriptor(a.io),error=>['SYSBUILD_RACE','SYSBUILD_METADATA'].includes(error.code));assert.equal(a.closed(),true);
  });
});
test('system descriptor rejects a new path identity after reading the original fd',()=>{
  const bytes=xml(),a=adapter(bytes,{lstat:n=>stat(bytes,n===1?{}:{ino:8n})});
  reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_RACE','recheck');assert.equal(a.closed(),true);
});
test('system descriptor rejects short reads, growth and overflowing content',()=>{
  let a=adapter(xml(),{readBytes:xml().subarray(0,30)});reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_SIZE','read');assert.equal(a.closed(),true);
  a=adapter(xml(),{readBytes:Buffer.concat([xml(),Buffer.from('extra')])});reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_SIZE','read');
  a=adapter(Buffer.alloc(16384,32),{readBytes:Buffer.alloc(20000,32)});reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_SIZE','read');
  assert.equal(a.calls.filter(call=>call[0]==='read').length,1);
});
test('system descriptor preserves IO error identity privately with bounded public metadata',()=>{
  const cause=Object.assign(new Error('private path should not appear in public message'),{code:'EACCES'}),a=adapter(xml(),{readError:cause});
  assert.throws(()=>readSystemBuildDescriptor(a.io),error=>{assert.equal(error.cause,cause);assert.equal(error.code,'EACCES');assert.equal(error.phase,'read');assert.equal(error.method,'system-version-plist');assert.ok(!error.message.includes(cause.message));return true;});
  assert.equal(a.closed(),true);
});
test('system descriptor preserves the first failure if closing also fails',()=>{
  const a=adapter(xml(),{readError:Object.assign(new Error('read'),{code:'EIO'}),closeError:new Error('close')});
  reject(()=>readSystemBuildDescriptor(a.io),'EIO','read');assert.equal(a.closed(),true);
});
test('system descriptor cannot emit success when closing the descriptor fails',()=>{
  const a=adapter(xml(),{closeError:new Error('close')});reject(()=>readSystemBuildDescriptor(a.io),'SYSBUILD_CLOSE','close');
});
