// SOURCE-only actual POSIX helper builds on disposable ordinary files. The
// selection namespace is SYNTHETIC; real C bytes, compiler, binary, FD3 and frame
// reader are used. This never qualifies a production deployment/native host.
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const source=fileURLToPath(new URL('../plugins/soloco/helpers/origin-sidecar-capture.c',import.meta.url));
const wrapper=fileURLToPath(new URL('../plugins/soloco/runtime/peers/origin-sidecar-capture.mjs',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex'),url=p=>pathToFileURL(p).href;
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-sidecar-source-build-')));
let sequence=0;
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
export async function buildSidecarSourceFixture({header='',interposer=''}={}){
 const directory=path.join(temporary,String(++sequence));fs.mkdirSync(directory);const executable=path.join(directory,'origin-sidecar-capture'),found=process.platform==='darwin'?childProcess.spawnSync('/usr/bin/xcrun',['--find','clang'],{encoding:'utf8',timeout:5000}):null,compiler=found?found.stdout.trim():'/usr/bin/clang',args=['-std=c11','-O2','-Wall','-Wextra','-Werror'];if(found&&(found.error||found.status!==0||!path.isAbsolute(compiler)))throw found.error??Error('SOURCE fixture clang resolution unavailable');
 const sdk=found?childProcess.spawnSync('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path'],{encoding:'utf8',timeout:5000}):null;if(sdk){if(sdk.error||sdk.status!==0||!path.isAbsolute(sdk.stdout.trim()))throw sdk.error??Error('SOURCE fixture SDK unavailable');args.push('-isysroot',sdk.stdout.trim());}
 if(header){const p=path.join(directory,'interpose.h');fs.writeFileSync(p,header);args.push('-include',p);}
 args.push(source);if(interposer){const p=path.join(directory,'interpose.c');fs.writeFileSync(p,interposer);args.push(p);}args.push('-o',executable);
 const built=childProcess.spawnSync(compiler,args,{encoding:'utf8',env:{...process.env,TMPDIR:directory},timeout:30000,maxBuffer:1024*1024});if(built.error)throw built.error;if(built.status!==0)throw Error(built.stderr);fs.chmodSync(executable,0o555);
 const source_sha256=hash(fs.readFileSync(source)),binary=fs.readFileSync(executable),record={protocol:'soloco-original-origin-sidecar-capture-program-v1',executable:{path:executable,bytes:binary.length,sha256:hash(binary),mode:'100555'},source_sha256,source_package_sha256:hash(JSON.stringify({source_sha256,header,interposer})),compiled_manifest_sha256:hash(JSON.stringify(args)),component_intent_key:'SYNTHETIC-FICTIONAL-SOURCE-CAPTURE-ONLY',argv:['origin-sidecar-capture-v1'],native_qualified:false};
 const metadata={protocol:'source-only-c-sidecar-build-v1',compiler:{path:compiler,realpath:fs.realpathSync(compiler),sha256:hash(fs.readFileSync(compiler))},sdk:sdk?{path:sdk.stdout.trim(),settings_sha256:hash(fs.readFileSync(path.join(sdk.stdout.trim(),'SDKSettings.json')))}:null,argv:args,source_sha256,binary:record.executable,interposer_sha256:hash(interposer),header_sha256:hash(header),native_qualified:false,production_selection:'SYNTHETIC'};fs.writeFileSync(path.join(directory,'build.DATA.json'),JSON.stringify(metadata,null,2)+'\n');
 fs.writeFileSync(path.join(directory,'deployment.mjs'),`import fs from 'node:fs';import {createHash} from 'node:crypto';const handles=new WeakSet(),record=${JSON.stringify(record)},source=${JSON.stringify(source)},hash=b=>createHash('sha256').update(b).digest('hex');export function prepareOriginalOriginSidecarCaptureProgram(){const h=Object.freeze({});handles.add(h);return h;}export function inspectOriginalOriginSidecarCaptureProgram(h){if(!handles.has(h)||hash(fs.readFileSync(source))!==record.source_sha256||hash(fs.readFileSync(record.executable.path))!==record.executable.sha256)throw Error('SYNTHETIC_ORIGINAL_BUILD_CHANGED');return structuredClone(record);}`);
 const text=fs.readFileSync(wrapper,'utf8').replace("'./context-component-deployment.mjs'",JSON.stringify(url(path.join(directory,'deployment.mjs')))).replace("new URL('../../helpers/origin-sidecar-capture.c',import.meta.url)",`new URL(${JSON.stringify(url(source))},import.meta.url)`),modulePath=path.join(directory,'capture.mjs');fs.writeFileSync(modulePath,text);
 // Optional SOURCE evidence retention only; never read by product runtime.
 if(process.env.SOLOCO_SOURCE_FIXTURE_ARTIFACTS){const retained=path.join(process.env.SOLOCO_SOURCE_FIXTURE_ARTIFACTS,'node-'+process.pid,'build-'+sequence);fs.mkdirSync(path.dirname(retained),{recursive:true});fs.cpSync(directory,retained,{recursive:true,force:false,errorOnExist:true});fs.copyFileSync(source,path.join(retained,'original-origin-sidecar-capture.c'));fs.copyFileSync(wrapper,path.join(retained,'original-wrapper.mjs'));if(sdk)fs.copyFileSync(path.join(sdk.stdout.trim(),'SDKSettings.json'),path.join(retained,'SDKSettings.json'));}
 const module=await import(url(modulePath));return {module,modulePath,metadata,executable};
}
export const originalSidecarSourceFixture=await buildSidecarSourceFixture();
export const sidecarCaptureModulePath=originalSidecarSourceFixture.modulePath;
export const captureOriginSidecarContents=originalSidecarSourceFixture.module.captureOriginSidecarContents;
export const originSidecars=directory=>captureOriginSidecarContents(directory).map(({content,...entry})=>entry);
