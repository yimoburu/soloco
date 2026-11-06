import {Store} from '../../plugins/soloco/runtime/store.mjs';
import {rehearse} from '../../plugins/soloco/runtime/upgrade.mjs';
import {contractModel} from './upgrade-incremental-model.mjs';
const [root,uid,mode]=process.argv.slice(2);
const original=Store.prototype.transaction;
Store.prototype.transaction=function(event,edit) {
  if(mode==='returned' && event==='upgrade.call_closed')process.exit(0);
  const result=original.call(this,event,edit);
  if(['page','reads'].includes(mode) && event==='upgrade.cos_page')process.exit(0);
  return result;
};
await rehearse(root,uid,contractModel({readFirstPage:mode==='reads',observe(){if(mode==='call')process.exit(0);}}));
