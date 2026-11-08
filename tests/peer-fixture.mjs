import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PeerLedger,installPeerSchema,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';

// Isolated fictional schema fixtures only; not a production adoption entry point.
export function peerFixture({control={},principals={},onQuery}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-peer-fixture-'));
  fs.mkdirSync(path.join(root,'.company'),{mode:0o700});
  const file=path.join(root,'.company','company.sqlite'),db=new DatabaseSync(file);
  db.exec('CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,5); CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);');
  installPeerSchema(db,{company_id:'fictional-peer-company'});db.close();
  const ledger=new PeerLedger(root,{onQuery});
  ledger.write('fixture.genesis','founder',tx=>{
    tx.put('control','company',{protocol:'peer-cos-v1',paused:false,policy_generation:1,pause_generation:1,founder_principal_id:'founder',governance_sha256:peerDigest('fictional-governance'),policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:100},...control},0);
    for(const [id,kind] of [['founder','founder'],['scheduler','scheduler'],['publisher','publisher'],['cos-a','cos'],['cos-b','cos'],['reviewer','reviewer']])tx.put('principals',id,{principal_id:id,kind,status:'active',generation:1,native_id:id+'-native',host:'codex',session_id:id+'-session',...(principals[id]??{})},0);
  });
  return {root,file,ledger,close(){ledger.close();fs.rmSync(root,{recursive:true,force:true});}};
}
