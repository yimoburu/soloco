// Actual temporary normalized-v4 SQLite; all identities/data are fictional.
// No fixture is a native review, execution permission or migration qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Store,installedTeam,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {canonical,peerDigest,PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerAdoptionRuntimeAction,peerAdoptionToolSchema} from '../plugins/soloco/runtime/peer-adoption-runtime.mjs';
import {authenticateLegacyOwner,captureLegacyOrigin,inspectPeerPinnedTeamFrom,inspectPeerPinnedTeam,readPeerPinnedTeam,LEGACY_ADOPTION_LIMITS} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {preparePeerAdoptionV2,assertPeerAdoptionV2ApplyReady} from '../plugins/soloco/runtime/peers/migration-v2.mjs';
import {fixture as scopedFixture,home,extraction,domainArgs,review as scopedReview,aggregate} from './support/scoped-home-fixture.mjs';
import {peerFixture} from './peer-fixture.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const code=expected=>error=>error.code===expected;
function fixture(t,changes={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-adoption-read-')),team=installedTeam(),store=new Store(root,true);
 const initial={schema:2,id:'fictional-adoption-v2',name:'Fictional preparation only',idea:'Preserve full unknown obligations.',runtime_version:'0.7.8',plugin_version:team.plugin_version,governance:team.governance,governance_sha256:team.governance_sha256,roles:team.roles,cos_instructions:team.cos_instructions,team_sha256:teamHash(team),owner:{host:'codex',session_id:'fictional-owner',epoch:9},paused:true,records:{held:{id:'held',kind:'artifact',revision:1,status:'Draft',content:'Old failure remains OPEN; no retry or new grant.'}},jobs:{},sessions:{},notices:[],messages:[],context_classifications:{},unknown_future:{attempts_used:4,max_attempts:4,expiry:'2020-01-01T00:00:00.000Z',uncertain:true},...changes};
 try{store.transaction('fixture.genesis',()=>initial);store.migrate();}finally{store.close();}
 const file=path.join(root,'.company','company.sqlite'),db=new DatabaseSync(file);
 t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
 const request=(action,input={},extra={})=>({root,session_id:'fictional-owner',epoch:9,action,input,...extra});
 const run=(action,input={},extra={})=>peerAdoptionRuntimeAction(request(action,input,extra),'codex');
 return {root,file,db,initial,request,run};
}
function snapshot(db){return {schema:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),company:db.prepare('SELECT * FROM company ORDER BY id').all(),layout:db.prepare('SELECT * FROM company_layout ORDER BY id').all(),entries:db.prepare('SELECT * FROM state_entries ORDER BY family,key').all(),values:db.prepare('SELECT * FROM immutable_values ORDER BY sha256').all(),events:db.prepare('SELECT * FROM events ORDER BY seq').all()};}
function fullPage(f,kind,limit=2){const all=[];let cursor;do{const p=f.run('inspect',{kind,limit,...(cursor?{cursor}:{})});all.push(...p.items);cursor=p.next_cursor;assert.equal(p.returned,p.items.length);}while(cursor);return all;}
function readBody(f,source,target='plan',options={}){let offset=0,body='';do{const r=f.run('read',{target,sha256:source.sha256,basis_sha256:source.basis_sha256,offset,length:1000,...options},target==='plan'?{source_instruction:'Fictional exact adoption preparation.'}:{});body+=r.text;offset=r.next_offset;assert.equal(r.complete,offset===null);}while(offset!==null);return body;}
function pinnedFixture(t){
 const legacy=fixture(t,{id:'fictional-peer-company'});legacy.db.exec('BEGIN');let source;try{source=captureLegacyOrigin(legacy.db);}finally{legacy.db.exec('ROLLBACK');}
 const peer=peerFixture({control:{legacy_source_cut_sha256:source.source_cut_sha256,team_sha256:source.pinned_team.team_sha256,governance_sha256:source.pinned_team.governance_sha256}});
 t.after(()=>{if(peer.ledger.db.isOpen)peer.ledger.close();fs.rmSync(peer.root,{recursive:true,force:true});});
 for(const item of source.pinned_team.manifest){const value=legacy.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(item.source.sha256);peer.ledger.db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(item.source.sha256,value.bytes);}
 peer.ledger.write('fixture.pinned-sources','founder',tx=>{const row=tx.put('control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle:source.pinned_team,bundle_sha256:peerDigest(source.pinned_team)},0),control=tx.get('control','company');tx.put('control','company',{...control.value,pinned_team:{family:'control',id:row.id,revision:row.revision,sha256:row.sha256}},control.revision);});
 return {legacy,peer,source};
}

test('readiness is current-owner read-only and never implies apply or whole-domain qualification',t=>{
 const f=fixture(t),before=snapshot(f.db),r=f.run('readiness');
 assert.equal(r.company_id,f.initial.id);assert.equal(r.current_source_inventory.complete,true);assert.equal(r.capabilities.apply,false);assert.equal(r.ready_for_apply,false);assert.equal(r.execution.whole_domain_qualified,false);
 assert.equal(r.issue_count,3);assert.deepEqual(snapshot(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
 const codes=fullPage(f,'issues').map(i=>i.code);assert.deepEqual(codes,['FIXED_ADOPTION_ENVIRONMENT_PRODUCER_MISSING','ORIGINAL_OBLIGATION_TRANSITION_PRODUCER_MISSING','NATIVE_ADOPTION_REVIEW_BRIDGE_MISSING']);
 assert.deepEqual(snapshot(f.db),before);
});

for(const [field,value,host] of [['session_id','wrong-owner','codex'],['epoch',8,'codex'],['session_id','fictional-owner','claude']])test(`wrong ${field}/${host} cannot inspect the company`,t=>{
 const f=fixture(t),before=snapshot(f.db);assert.throws(()=>peerAdoptionRuntimeAction({...f.request('readiness'),[field]:value},host),code('LEGACY_OPERATOR_REQUIRED'));assert.deepEqual(snapshot(f.db),before);
});

test('authentication occurs before unrelated full-source corruption can be read',t=>{
 const f=fixture(t);f.db.prepare("UPDATE immutable_values SET bytes='corrupt unrelated data' WHERE sha256=(SELECT sha256 FROM state_entries WHERE family='records' AND key='held')").run();
 assert.throws(()=>peerAdoptionRuntimeAction({...f.request('readiness'),session_id:'wrong'},'codex'),code('LEGACY_OPERATOR_REQUIRED'));
 assert.throws(()=>f.run('readiness'),code('LEGACY_SOURCE_CHANGED'));
});

test('missing company does not initialize state',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-no-adoption-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.throws(()=>peerAdoptionRuntimeAction({root,session_id:'fictional-owner',epoch:9,action:'readiness'},'codex'));assert.equal(fs.existsSync(path.join(root,'.company')),false);
});

test('legacy JSON and layout5 do not silently migrate or enter the legacy reader',t=>{
 const f=fixture(t);f.db.prepare('UPDATE company_layout SET version=5 WHERE id=1').run();const before=snapshot(f.db);
 assert.throws(()=>f.run('readiness'),code('LEGACY_LAYOUT4_REQUIRED'));assert.deepEqual(snapshot(f.db),before);
 f.db.exec('DROP TABLE company_layout');assert.throws(()=>f.run('readiness'),code('LEGACY_LAYOUT4_REQUIRED'));
});

for(const part of ['root','directory','file','wal'])test(`linked ${part} is rejected before opening company data`,t=>{
 const f=fixture(t);let request=f.request('readiness'),link;
 if(part==='root'){link=f.root+'-alias';fs.symlinkSync(f.root,link);request.root=link;}
 if(part==='directory'){link=path.join(f.root,'.company');fs.renameSync(link,link+'-actual');fs.symlinkSync(link+'-actual',link);}
 if(part==='file'){link=f.file;fs.renameSync(link,link+'-actual');fs.symlinkSync(link+'-actual',link);}
 if(part==='wal'){link=f.file+'-wal';try{fs.unlinkSync(link);}catch(error){if(error.code!=='ENOENT')throw error;}fs.symlinkSync(f.file,link);}
 assert.throws(()=>peerAdoptionRuntimeAction(request,'codex'),code('LEGACY_LINKED_STATE'));
 if(part==='root')fs.unlinkSync(link);
});

test('complete current inventory and exact raw bodies preserve encoded identities and unknown values',t=>{
 const strange='unknown\0identity',value={unicode:'雪😀',ordered:[3,1,2],status:'UNKNOWN',spent:4},f=fixture(t,{[strange]:value,jobs:{['job\0encoded']:{id:'job\0encoded',status:'failed',native_id:'fictional-native',coordination_release:{termination_confirmed:false}}}});
 const before=snapshot(f.db),r=f.run('readiness'),sources=fullPage(f,'sources',1);assert.equal(sources.length,r.current_source_inventory.rows);
 const expected=hash(JSON.stringify(value)),source=sources.find(s=>s.sha256===expected);assert.ok(source);assert.equal(Object.hasOwn(source,'key'),false);
 const raw=readBody(f,{...source,basis_sha256:r.basis_sha256},'source',{source_id:source.source_id});assert.deepEqual(JSON.parse(raw),value);assert.equal(hash(raw),source.sha256);assert.equal(r.execution.uncertain_jobs,1);assert.deepEqual(snapshot(f.db),before);
});

test('failed unresourced native work remains UNKNOWN despite no queued/running jobs or claims',t=>{
 const f=fixture(t,{jobs:{timedout:{id:'timedout',status:'failed',native_id:'fictional-old-native',coordination_release:{termination_confirmed:false}}}}),r=f.run('readiness');
 assert.equal(r.execution.pending_jobs,0);assert.equal(r.execution.uncertain_jobs,1);assert.ok(fullPage(f,'issues').some(i=>i.code==='LEGACY_JOB_CLOSURE_UNKNOWN'));
});

test('active unresourced work and malformed invocation evidence have separate holds',t=>{
 const f=fixture(t,{paused:false,jobs:{pending:{id:'pending',status:'queued'},malformed:{id:'malformed',status:'failed',coordination_release:{termination_confirmed:true},model_process_tracking:{ready:true,all_closed:true}}}}),r=f.run('readiness'),issues=fullPage(f,'issues');
 assert.equal(r.execution.pending_jobs,1);assert.equal(r.execution.uncertain_jobs,1);for(const c of ['LEGACY_PAUSE_REQUIRED','LEGACY_JOB_ACTIVE','LEGACY_MODEL_INVOCATION_UNCLOSED'])assert.ok(issues.some(i=>i.code===c));
});

test('legacy child release remains distinct from original-domain qualification and grants no apply',t=>{
 const f=fixture(t,{jobs:{old:{id:'old',status:'completed',native_id:'fictional-old-native',coordination_release:{termination_confirmed:true}}}}),r=f.run('readiness');
 assert.equal(r.execution.closed_child_jobs,1);assert.equal(r.execution.uncertain_jobs,0);assert.equal(r.execution.whole_domain_qualified,false);assert.equal(r.ready_for_apply,false);
});

test('invalid scoped proof holds the projection instead of supplying a clean empty qualification',t=>{
 const f=fixture(t,{context_classifications:{held:{source:{id:'held'},disposition:'represented',plan:{id:'absent'},review:{id:'missing'},scoped_qualification:{protocol:'scoped-context-v1',source:{id:'held'}}}}}),r=f.run('readiness');
 assert.equal(r.origin_projection_sha256,null);assert.ok(fullPage(f,'issues').some(i=>i.code==='LEGACY_CONTEXT_QUALIFICATION_HELD'));
 assert.throws(()=>f.run('read',{target:'projection',basis_sha256:r.basis_sha256,sha256:'a'.repeat(64)}),code('LEGACY_CONTEXT_QUALIFICATION_HELD'));
});

test('actual legacy scoped producer lineage is reused as a frontier without minting a peer/native origin seal',async()=>{
 const f=await scopedFixture(),original=await home(f),extracts=await extraction(f),domain=await scopedReview(f,domainArgs(extracts));
 assert.equal(domain.job.status,'completed');assert.equal(domain.record.review.verdict,'Pass');await aggregate(f,extracts,domain);
 const args={root:f.root,session_id:f.session_id,epoch:f.epoch,action:'readiness'},r=peerAdoptionRuntimeAction(args,'codex');
 if(!r.origin_projection_sha256){const db=new DatabaseSync(path.join(f.root,'.company','company.sqlite'),{readOnly:true});try{db.exec('BEGIN');assert.fail(captureLegacyOrigin(db).qualification_error?.stack??'Missing projection without retained qualification cause');}finally{db.close();}}
 assert.ok(r.origin_projection_sha256);assert.equal(r.ready_for_apply,false);assert.equal(r.execution.whole_domain_qualified,false);
 let offset=0,body='';do{const range=peerAdoptionRuntimeAction({...args,action:'read',input:{target:'projection',sha256:r.origin_projection_sha256,basis_sha256:r.basis_sha256,offset,length:16000}},'codex');body+=range.text;offset=range.next_offset;}while(offset!==null);
 const projection=JSON.parse(body);assert.equal(projection.protocol,'legacy-classification-frontier-v1');assert.ok(projection.classifications.some(c=>c.id==='archive'));assert.ok(projection.mandatory.includes(original.id));assert.ok(projection.proofs.length>0);assert.ok(projection.proof_jobs.length>0);assert.ok(projection.unclassified_sources.length>0);assert.equal(peerDigest(projection),r.origin_projection_sha256);
 const db=new DatabaseSync(path.join(f.root,'.company','company.sqlite'));try{const event=db.prepare("SELECT seq,value FROM events WHERE type='record.saved' ORDER BY seq LIMIT 1").get(),value=JSON.parse(event.value);value.fictional_tampering='Changes no current record but invalidates actual producer proof';db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(value),event.seq);}finally{db.close();}
 const held=peerAdoptionRuntimeAction(args,'codex');assert.equal(held.origin_projection_sha256,null);assert.notEqual(held.basis_sha256,r.basis_sha256);
});

test('plan exact ranges bind all current sources, classifications, instruction and original exhausted authority',t=>{
 const f=fixture(t),before=snapshot(f.db),expires_at=new Date(Date.now()+3600000).toISOString(),p=f.run('plan',{expires_at},{source_instruction:'Fictional exact adoption preparation.'});
 const body=readBody(f,p.source,'plan',{expires_at}),plan=JSON.parse(body);
 assert.equal(peerDigest(plan),p.source.sha256);assert.equal(plan.sources.length,f.run('readiness').current_source_inventory.rows);assert.equal(plan.fresh_execution_authority,false);assert.equal(plan.allowance_conversion,'none');assert.equal(plan.original_authority,'preserved-retired-not-translated');assert.equal(plan.execution_resumed,false);assert.equal(plan.native_qualification,false);assert.equal(plan.permitted_action,'review-preparation-only');assert.equal(p.ready_for_apply,false);assert.deepEqual(snapshot(f.db),before);
});

test('exact reads and pagination reject source changes including same-value reordering',t=>{
 const f=fixture(t),r=f.run('readiness'),p=f.run('inspect',{kind:'sources',limit:1}),source=p.items[0];
 f.db.prepare("UPDATE state_entries SET position=position+1 WHERE family='records' AND key='held'").run();
 assert.throws(()=>f.run('inspect',{kind:'sources',limit:1,cursor:p.next_cursor}),code('LEGACY_CURSOR_CHANGED'));
 assert.throws(()=>f.run('read',{target:'source',source_id:source.source_id,basis_sha256:r.basis_sha256,sha256:source.sha256}),code('LEGACY_SOURCE_CHANGED'));
});

test('exact source ranges reject stale hashes and Unicode splits',t=>{
 const value='prefix😀tail',f=fixture(t,{unknown_future:value}),r=f.run('readiness'),source=fullPage(f,'sources').find(s=>s.sha256===hash(JSON.stringify(value))),raw=JSON.stringify(value),start=raw.indexOf('😀');
 const input={target:'source',source_id:source.source_id,basis_sha256:r.basis_sha256,sha256:source.sha256};
 assert.throws(()=>f.run('read',{...input,sha256:'f'.repeat(64)}),code('LEGACY_SOURCE_CHANGED'));
 assert.throws(()=>f.run('read',{...input,offset:start+1,length:1}),code('LEGACY_RANGE_INVALID'));
 assert.throws(()=>f.run('read',{...input,offset:start,length:1}),code('LEGACY_RANGE_INVALID'));
 const range=f.run('read',{...input,offset:0,length:start+1});assert.equal(range.next_offset,start);assert.equal(range.text,raw.slice(0,start));
});

test('input is closed DATA; getters, proxies, model environment and fake ready flags cannot run',t=>{
 const f=fixture(t),before=snapshot(f.db);let called=0;const getter={...f.request('readiness')};Object.defineProperty(getter,'input',{get(){called++;return {};},enumerable:true});
 assert.throws(()=>peerAdoptionRuntimeAction(getter,'codex'),code('LEGACY_ADOPTION_INPUT'));assert.equal(called,0);
 assert.throws(()=>peerAdoptionRuntimeAction(new Proxy(f.request('readiness'),{}),'codex'),code('LEGACY_ADOPTION_INPUT'));
 for(const input of [{ready:true},{environment:{boundary_mode:'enforced'}},{expires_at:new Date(Date.now()+3600000).toISOString(),review:{verdict:'Pass'}}])assert.throws(()=>f.run('plan',input,{source_instruction:'Fictional preparation.'}),code('LEGACY_ADOPTION_INPUT'));
 for(const action of ['apply','adopt','resume','start'])assert.throws(()=>f.run(action),code('LEGACY_ADOPTION_INPUT'));
 assert.deepEqual(snapshot(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);assert.equal(peerAdoptionToolSchema.inputSchema.properties.action.enum.includes('apply'),false);
});

test('plan preparation enforces expiry; internal apply preflight refuses every missing producer without writes',t=>{
 const f=fixture(t);assert.throws(()=>captureLegacyOrigin(f.db),code('LEGACY_SNAPSHOT_REQUIRED'));f.db.exec('BEGIN');let snapshotValue;try{snapshotValue=captureLegacyOrigin(f.db);}finally{f.db.exec('ROLLBACK');}
 const source_instruction='Fictional exact adoption preparation.',expires_at=new Date(Date.now()+3600000).toISOString(),plan=preparePeerAdoptionV2(snapshotValue,{source_instruction,expires_at}),before=snapshot(f.db);
 assert.deepEqual(authenticateLegacyOwner(f.db,{session_id:'fictional-owner',epoch:9},'codex'),f.initial.owner);
 assert.throws(()=>assertPeerAdoptionV2ApplyReady(snapshotValue,plan),code('LEGACY_ADOPTION_PRODUCER_HELD'));
 assert.throws(()=>assertPeerAdoptionV2ApplyReady(snapshotValue,{...plan,ready:true,complete_current_meaning:true,failures_preserved:true}),code('LEGACY_PLAN_CHANGED'));
 for(const end of ['2020-01-01T00:00:00Z',new Date(Date.now()+8*86400000).toISOString(),'invalid'])assert.throws(()=>f.run('plan',{expires_at:end},{source_instruction}),code('LEGACY_PLAN_EXPIRY_REQUIRED'));
 assert.deepEqual(snapshot(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});

test('source-count admission rejects a complete over-limit inventory before a prefix is exposed',t=>{
 const f=fixture(t),sha=f.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='held'").get().sha256,insert=f.db.prepare("INSERT INTO state_entries(family,key,position,sha256,encoding) VALUES('root',?,?,?,'json')");
 f.db.exec('BEGIN');try{for(let n=0;n<LEGACY_ADOPTION_LIMITS.source_rows;n++)insert.run('extra-'+n,100+n,sha);f.db.exec('COMMIT');}catch(error){f.db.exec('ROLLBACK');throw error;}
 const count=f.db.prepare('SELECT COUNT(*) AS n FROM state_entries').get().n;assert.ok(count>LEGACY_ADOPTION_LIMITS.source_rows);assert.throws(()=>f.run('readiness'),code('LEGACY_PREPARATION_CAPACITY'));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM state_entries').get().n,count);
});

test('per-value byte admission happens before oversized or corrupt immutable data is materialized into a response',t=>{
 const f=fixture(t),sha=f.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='held'").get().sha256;
 f.db.prepare('UPDATE immutable_values SET bytes=zeroblob(?) WHERE sha256=?').run(LEGACY_ADOPTION_LIMITS.source_value_bytes+1,sha);
 assert.throws(()=>f.run('inspect',{kind:'sources',limit:1}),code('LEGACY_PREPARATION_CAPACITY'));
 assert.equal(f.db.prepare('SELECT length(bytes) AS n FROM immutable_values WHERE sha256=?').get(sha).n,LEGACY_ADOPTION_LIMITS.source_value_bytes+1);
});

test('exact legacy pins are required; a missing CoS body or changed legacy team hash never loads installed fallback',t=>{
 const f=fixture(t);f.db.prepare("DELETE FROM state_entries WHERE family='root' AND key='cos_instructions'").run();assert.throws(()=>f.run('readiness'),code('LEGACY_PINNED_TEAM_REQUIRED'));
 const changed=fixture(t,{team_sha256:'a'.repeat(64)});assert.throws(()=>changed.run('readiness'),code('LEGACY_PINNED_TEAM_CHANGED'));
});

test('cold layout5 reads preserve all exact original pinned parts and legacy roles key order',t=>{
 const {peer,source}=pinnedFixture(t),headers=inspectPeerPinnedTeam(peer.ledger);assert.equal(headers.team_sha256,source.pinned_team.team_sha256);
 peer.ledger.close();peer.ledger=new PeerLedger(peer.root);
 const actual={};for(const header of headers.sources){let offset=0,body='';do{const value=readPeerPinnedTeam(peer.ledger,{part:header.part,reference:header.reference,sha256:header.sha256,offset,length:4000});body+=value.text;offset=value.next_offset;}while(offset!==null);assert.equal(hash(body),header.sha256);actual[header.part]=JSON.parse(body);}
 assert.equal(hash(JSON.stringify([actual.plugin_version,actual.governance,actual.roles,actual.cos_instructions])),source.pinned_team.team_sha256);assert.equal(JSON.stringify(actual.roles),source.pinned_team.roles_json);
 const evidence=peer.ledger.read(tx=>inspectPeerPinnedTeamFrom(tx,{company_id:peer.ledger.company_id}));assert.equal(evidence.bundle_sha256,peerDigest(source.pinned_team));assert.equal(JSON.stringify(evidence.roles),source.pinned_team.roles_json);
});

test('missing or drifted canonical pin record/reference/legacy bytes hold cold loading',t=>{
 const missing=peerFixture();t.after(()=>missing.close());assert.throws(()=>inspectPeerPinnedTeam(missing.ledger),code('PEER_PINNED_TEAM_REQUIRED'));
 const {peer}=pinnedFixture(t),headers=inspectPeerPinnedTeam(peer.ledger),header=headers.sources[0];
 assert.throws(()=>readPeerPinnedTeam(peer.ledger,{part:header.part,reference:header.reference,sha256:'f'.repeat(64)}),code('PEER_PINNED_TEAM_CHANGED'));
 const sha=peer.ledger.read(tx=>tx.get('control','pinned-team').value.bundle.manifest[0].source.sha256);peer.ledger.db.prepare("UPDATE immutable_values SET bytes='changed original pin' WHERE sha256=?").run(sha);assert.throws(()=>inspectPeerPinnedTeam(peer.ledger),/Legacy immutable evidence is missing or changed/);
});
