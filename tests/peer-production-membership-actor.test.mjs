import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerProductionScheduler} from '../plugins/soloco/runtime/peers/model.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Synthetic P1/P2 component tests for the production membership writer join.
// No Original company adoption, worker, model, provider or native execution is
// established by this isolated peer ledger or its fictional legacy_owner DATA.
const code=expected=>error=>error?.code===expected;
const customFounder='canonical-membership-founder';
function fixture(t,founderId='founder'){
  const legacy_owner={host:'codex',session_id:'synthetic-membership-owner',epoch:1};
  const f=peerFixture({principals:{founder:{legacy_owner}}});
  t.after(()=>f.close());
  if(founderId!=='founder')f.ledger.write('synthetic.custom-founder','founder',tx=>{
    const c=tx.get('control','company');
    tx.put('control',c.id,{...c.value,founder_principal_id:founderId},c.revision);
    tx.put('principals',founderId,{principal_id:founderId,kind:'founder',status:'active',generation:1,host:'codex',native_id:'synthetic-custom-founder',legacy_owner},0);
  });
  const facade=bindPeerProductionScheduler(f.ledger);
  const row=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  const history=()=>canonical(f.ledger.events({after:0,limit:100}));
  const lifecycle=()=>createMembershipLifecycle(f.ledger,founderId==='founder'?{}:{operator_principal_id:founderId},facade);
  const input=()=>({operation_id:'enroll',enrollment_id:'incoming-enrollment',principal_id:'incoming-cos',role:'cos',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:2,expected_generation:0,source_instruction:'Synthetic protected operator instruction for this component test.'});
  return {...f,founderId,facade,row,history,lifecycle,input};
}

for(const founderId of ['founder',customFounder])test(`production membership plans and records its canonical actor: ${founderId}`,t=>{
  const f=fixture(t,founderId),membership=f.lifecycle(),args=f.input();
  assert.equal(f.row('principals','operator'),null,'the role channel is not a principal alias');
  if(founderId!== 'founder')assert.equal(f.row('principals','founder').value.status,'active','a noncanonical founder row remains present');
  const founder=f.row('principals',founderId),enrollment=membership.operator.enroll(args);
  assert.deepEqual(enrollment.value.operator_ref,{family:'principals',id:founder.id,revision:founder.revision,sha256:founder.sha256});
  let event=f.ledger.events({after:0,limit:100}).items.at(-1);
  assert.equal(event.type,'membership/enroll');
  assert.equal(event.principal_id,founderId);
  const commandChange=event.payload.changes.find(change=>change.family==='commands');
  assert.ok(commandChange,'the original membership command is committed');
  assert.equal(f.row('commands',commandChange.id).value.principal_id,founderId);
  const committed=f.history();
  assert.deepEqual(membership.operator.enroll(args),enrollment,'exact command replay remains idempotent');
  assert.equal(f.history(),committed);
  const revoked=membership.operator.revoke({operation_id:'revoke',enrollment_id:args.enrollment_id,source_instruction:'Synthetic protected operator revocation.'});
  assert.equal(revoked.value.status,'revoked');
  event=f.ledger.events({after:0,limit:100}).items.at(-1);
  assert.equal(event.type,'membership/revoke');
  assert.equal(event.principal_id,founderId);
});

test('production membership rejects a principal ID or host role in place of the operator channel',t=>{
  const f=fixture(t,customFounder),before=f.history();let called=false;
  for(const channel of [customFounder,'founder','host','scheduler',''])assert.throws(()=>f.facade.membershipWrite('membership/enroll',channel,()=>{called=true;}),code('PRODUCTION_ACTION_HELD'));
  assert.throws(()=>f.facade.membershipWrite('membership/unknown','operator',()=>{called=true;}),code('PRODUCTION_ACTION_HELD'));
  assert.equal(called,false);
  assert.equal(f.history(),before);
});

test('production membership rejects an active founder row that is not the canonical actor',t=>{
  const f=fixture(t,customFounder),before=f.history();
  assert.equal(f.row('principals','founder').value.status,'active');
  assert.throws(()=>createMembershipLifecycle(f.ledger,{operator_principal_id:'founder'},f.facade),code('AUTHENTICATION_REQUIRED'));
  assert.equal(f.history(),before);
});

test('a changed canonical founder invalidates the captured production membership writer before mutation',t=>{
  const f=fixture(t,customFounder),membership=f.lifecycle();
  f.ledger.write('synthetic.owner-change',customFounder,tx=>{
    const p=tx.get('principals',customFounder);
    tx.put('principals',p.id,{...p.value,generation:p.value.generation+1},p.revision);
  });
  const before=f.history();
  assert.throws(()=>membership.operator.enroll(f.input()),code('PRODUCTION_OWNER_CHANGED'));
  assert.equal(f.history(),before);
  assert.equal(f.row('principals','incoming-cos'),null);
  assert.equal(f.row('work_items','membership:incoming-enrollment'),null);
});
