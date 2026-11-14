// Packaging only: hash Source/resources already inside the plugin. No imports
// of runtime/issuers, helper calls, Python execution, Native builds or run burns.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const PLUGIN=path.resolve(fileURLToPath(new URL('../plugins/soloco/',import.meta.url)));
const RUNTIME=path.join(PLUGIN,'runtime');
const OUTPUT=path.join(PLUGIN,'assets','issue18-qualification-inventory.json');
const MODULES=Object.freeze(['integrated-comparison-evidence.mjs','integrated-comparison-source.mjs',
  'integrated-comparison-test.mjs','integrated-comparison-worker.mjs','development-full-file-output.mjs',
  'qualification/issue18-ledger-storage.mjs','qualification/issue18-ledger-storage.py',
  ...['typed-capture.mjs','observed-outcome.mjs','integrated-comparison-data.mjs',
    'integrated-comparison-issuer.mjs','integrated-comparison-bootstrap.mjs','integrated-comparison-bootstrap.py',
    'integrated-comparison-evidence-io.mjs','integrated-comparison-evidence-io.py'].map(name=>'qualification/issue18/'+name)]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,message)=>{if(!ok)throw Error('COMPARISON_QUALIFICATION_PACKAGE: '+message);};
const fields=['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'];
function read(relative){
  const file=path.join(RUNTIME,relative);let ancestor=file;
  for(;;){const stat=fs.lstatSync(ancestor);need(!stat.isSymbolicLink(),'linked Source/resource');if(ancestor===PLUGIN)break;ancestor=path.dirname(ancestor);need(ancestor===PLUGIN||ancestor.startsWith(PLUGIN+path.sep),'Source path escaped plugin');}
  const named=fs.lstatSync(file,{bigint:true});need(named.isFile()&&named.nlink===1n&&(named.mode&0o777n)===0o644n&&named.size>0n&&named.size<=2097152n,'Source/resource mode or size');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{const before=fs.fstatSync(fd,{bigint:true}),bytes=fs.readFileSync(fd),after=fs.fstatSync(fd,{bigint:true}),now=fs.lstatSync(file,{bigint:true});need(BigInt(bytes.length)===before.size&&fields.every(key=>named[key]===before[key]&&before[key]===after[key]&&before[key]===now[key]),'Source/resource changed');return bytes;}finally{fs.closeSync(fd);}
}
function names(){
  const output=[];
  function walk(directory,base){for(const name of fs.readdirSync(directory).sort()){const file=path.join(directory,name),relative=base+'/'+name,stat=fs.lstatSync(file);need(!stat.isSymbolicLink(),'linked qualification namespace');if(stat.isDirectory())walk(file,relative);else{need(stat.isFile(),'special qualification resource');output.push(relative);}}}
  walk(path.join(RUNTIME,'qualification'),'qualification');return output.sort();
}
export function packageComparisonQualification(check=false){
  need(typeof check==='boolean','fixed check mode required');
  const expected=MODULES.filter(name=>name.startsWith('qualification/')).sort();need(JSON.stringify(names())===JSON.stringify(expected),'undeclared/missing optional qualification resource');
  const retained=new Map(MODULES.map(name=>[name,read(name)]));
  for(const name of ['qualification/issue18-ledger-storage','qualification/issue18/integrated-comparison-bootstrap','qualification/issue18/integrated-comparison-evidence-io']){
    const module=retained.get(name+'.mjs').toString('utf8'),match=/const HELPER_SHA256='([a-f0-9]{64})'/.exec(module);
    need(match&&match[1]===hash(retained.get(name+'.py')),'helper Source pin mismatch: '+name);
  }
  const rows=[...retained].map(([name,body])=>({path:'runtime/'+name,bytes:body.length,sha256:hash(body),mode:'100644'})).sort((a,b)=>a.path.localeCompare(b.path));
  need(rows.length===15&&rows.reduce((n,row)=>n+row.bytes,0)<=2097152,'closed package capacity');
  const body=Buffer.from(JSON.stringify({protocol:'soloco-issue18-qualification-package-v1',default_enabled:false,native_qualification:false,physical_source_checkout_required_for_selection:true,files:rows},null,2)+'\n');
  if(check)need(fs.existsSync(OUTPUT)&&fs.readFileSync(OUTPUT).equals(body),'qualification inventory is missing or stale');
  else{if(fs.existsSync(OUTPUT)){const stat=fs.lstatSync(OUTPUT);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'invalid inventory destination');}const fd=fs.openSync(OUTPUT,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o644);try{fs.writeFileSync(fd,body);}finally{fs.closeSync(fd);}}
  need(fs.readFileSync(OUTPUT).equals(body),'inventory readback mismatch');
  for(const [name,bytes] of retained)need(read(name).equals(bytes),'packaged Source changed: '+name);
  return {files:rows.length,bytes:rows.reduce((n,row)=>n+row.bytes,0),helpers_executed:0};
}
