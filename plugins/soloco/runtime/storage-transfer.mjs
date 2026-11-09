import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=p=>typeof p==='string'&&p.length<=500&&!p.startsWith('/')&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.includes('\\'));
// Reject raw traversal and aliases before any normalization or filesystem work.
function transferPath(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute transfer path required');
 const components=(path.sep==='/'?directory:directory.replaceAll('\\','/')).split('/');
 if(components.includes('..'))throw Error('Parent traversal in transfer path refused');
 if(directory!==path.resolve(directory))throw Error('Canonical absolute transfer path required');
 return directory;
}
function prospective(directory){
 let parent=transferPath(directory),suffix=[];
 for(;;){
  let stat;
  try{stat=fs.lstatSync(parent);}
  catch(error){
   if(error?.code!=='ENOENT')throw error;
   const next=path.dirname(parent);
   if(next===parent)throw Error('Transfer ancestor missing');
   suffix.unshift(path.basename(parent));parent=next;continue;
  }
  if(stat.isSymbolicLink())throw Error('Linked transfer ancestor refused');
  if(!stat.isDirectory())throw Error('Transfer ancestor must be a directory');
  // Resolve the complete existing prefix without probing above the read grant.
  const real=fs.realpathSync.native(parent);
  if(real!==parent)throw Error('Linked or noncanonical transfer ancestor refused');
  return path.join(real,...suffix);
 }
}
const within=(child,parent)=>child===parent||child.startsWith(parent+path.sep);
function fresh(directory){
 directory=transferPath(directory);
 try{fs.lstatSync(directory);throw Error('Choose a new absolute directory');}
 catch(error){if(error?.code!=='ENOENT')throw error;}
 prospective(directory);
 fs.mkdirSync(path.dirname(directory),{recursive:true,mode:0o700});
 // Observe intervening changes after mkdir; this is not an atomic link-swap fence.
 prospective(directory);
 fs.mkdirSync(directory,{mode:0o700});
}
function copyTree(source,target){const stat=fs.lstatSync(source);if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||(stat.isFile()&&stat.nlink!==1))throw Error('Links/special transfer files refused');if(stat.isDirectory()){fs.mkdirSync(target,{recursive:true,mode:0o700});for(const name of fs.readdirSync(source))copyTree(path.join(source,name),path.join(target,name));}else{fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);}}
function inventory(directory){const entries=[];function walk(dir,rel=''){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),key=rel?rel+'/'+name:name,st=fs.lstatSync(file);if(st.isSymbolicLink()||(!st.isDirectory()&&!st.isFile()))throw Error('Invalid transfer file');if(st.isDirectory())walk(file,key);else entries.push({path:key,bytes:st.size,sha256:hash(fs.readFileSync(file))});}}walk(directory);return entries.sort((a,b)=>a.path.localeCompare(b.path));}
export function backupCompany(db,directory,{artifacts=[]}={}){
 if(!Array.isArray(artifacts)||artifacts.length>100)throw Error('At most 100 explicitly selected external artifacts');
 const destination=prospective(directory);if(within(destination,fs.realpathSync(db.dir)))throw Error('Backup output cannot be inside company source');
 for(const a of artifacts){if(!a||!path.isAbsolute(a.source??'')||!safe(a.path))throw Error('External artifacts need explicit absolute source and portable path');const source=fs.realpathSync(a.source);if(fs.statSync(source).isDirectory()&&within(destination,source))throw Error('Backup output cannot be inside selected artifact source');}
 fresh(directory);const before=db.changeToken(),stateHash=hash(JSON.stringify(db.read()));
 const company=path.join(directory,'.company');fs.mkdirSync(company,{mode:0o700});const target=path.join(company,'company.sqlite');
 db.db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");
 // Runtime candidates and project-owned configuration travel with the database.
 for(const name of fs.readdirSync(db.dir)){if(name==='company.sqlite'||name.startsWith('company.sqlite-')||name.startsWith('storage-backup-'))continue;copyTree(path.join(db.dir,name),path.join(company,name));}
 for(const a of artifacts){if(!a||!path.isAbsolute(a.source??'')||!safe(a.path))throw Error('External artifacts need explicit absolute source and portable path');copyTree(a.source,path.join(directory,'artifacts',a.path));}
 if(db.changeToken()!==before)throw Error('Company changed while backing up; retained incomplete output for inspection');
 const manifest={format:'soloco-company-backup-v1',state_sha256:stateHash,inventory_scope:'company database, project-owned .company files and explicitly selected external artifacts only',external_reference_completeness:'requires caller review; not inferred from prose',files:inventory(directory)};
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return manifest;
}
export function restoreCompany(backup,directory){
 if(within(prospective(directory),fs.realpathSync(backup)))throw Error('Restore output cannot be inside backup source');
 const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));if(manifest.format!=='soloco-company-backup-v1'||!Array.isArray(manifest.files))throw Error('Unsupported backup manifest');
 const unique=new Set();for(const f of manifest.files){if(!safe(f.path)||unique.has(f.path))throw Error('Invalid or duplicate backup path');unique.add(f.path);const source=path.join(backup,f.path);let ancestor=backup;for(const part of f.path.split('/')){ancestor=path.join(ancestor,part);if(fs.lstatSync(ancestor).isSymbolicLink())throw Error('Linked backup path refused');}const st=fs.lstatSync(source);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size!==f.bytes||hash(fs.readFileSync(source))!==f.sha256)throw Error('Backup bytes missing or changed');}
 if(!unique.has('.company/company.sqlite'))throw Error('Backup database missing');
 fresh(directory);for(const f of manifest.files)copyTree(path.join(backup,f.path),path.join(directory,f.path));
 // Source validation does not pin mutable backup bytes across the copy. Check
 // the complete destination before reporting success, including non-DB files
 // that the subsequent logical database readback cannot validate.
 const expected=new Map(manifest.files.map(f=>[f.path,f])),copied=inventory(directory);
 if(copied.length!==expected.size||copied.some(f=>{const original=expected.get(f.path);return !original||f.bytes!==original.bytes||f.sha256!==original.sha256;}))throw Error('Restored file inventory differs from backup manifest; retained destination for inspection');
 return {directory,manifest,restored:true,ownership_transferred:false};
}
