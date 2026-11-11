import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Installed-plugin layout has runtime code, but no repository tools/native tree.
// Importing general P2 software must not eagerly initialize the source builder.
test('installed peer libraries import and hold without repository-only producer inputs',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-installed-peer-boundary-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url));
 const target=path.join(root,'plugins/soloco/runtime');fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true});
 const model=await import(pathToFileURL(path.join(target,'peers/model.mjs')).href);
 const membership=await import(pathToFileURL(path.join(target,'peers/membership.mjs')).href);
 const slot=await import(pathToFileURL(path.join(target,'peers/protected-source-build-slot.mjs')).href);
 assert.equal(typeof model.execute,'function');assert.equal(typeof membership.createMembershipLifecycle,'function');
 assert.throws(()=>slot.resolveOriginalPeerContextInterpreter(),error=>slot.isOriginalContextInterpreterUnavailable(error));
 for(const name of ['tools','native','work','.company'])assert.equal(fs.existsSync(path.join(root,name)),false);
});
