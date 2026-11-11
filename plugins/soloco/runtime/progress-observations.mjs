// Called only inside engine.progress's existing read-only canonical snapshot.
// Observer access does not confer company ownership or execution authority.
import {stamp} from './store.mjs';
import {publicPage,fits} from './public-response.mjs';
import {implementationObservations,OBSERVATIONS_MAX_BYTES} from './implementation-observations.mjs';

// A fixed reserve keeps page/cursor semantics independent of preview size.
// publicPage bounds one notice item to5k plus its collection envelope.
const attentionReserve=6000;

export function progressObservations(state,args={}){
  if(args.action!==undefined)throw Error('Observations use cursor pages, not progress artifact reads');
  if(args.cursor!==undefined&&args.offset!==undefined)throw Error('Choose observations cursor or offset, not both');
  const report=implementationObservations(state,{
    origin:{kind:'canonical-read-snapshot',observed_at:stamp(),collections_complete:true},
    limit:args.recent_jobs??20,
    output_bytes:OBSERVATIONS_MAX_BYTES-attentionReserve,
    ...(args.offset===undefined?{}:{offset:args.offset}),
    ...(args.cursor===undefined?{}:{cursor:args.cursor}),
  });
  const result={...report,attention:publicPage(state,{collection:'unresolved_notices',limit:1}),output:{...report.output,maximum_UTF8_bytes:OBSERVATIONS_MAX_BYTES,reserved_attention_UTF8_bytes:attentionReserve}};
  for(let i=0;i<5;i++){const n=Buffer.byteLength(JSON.stringify(result));if(n===result.output.UTF8_bytes)break;result.output.UTF8_bytes=n;}
  if(result.output.UTF8_bytes>OBSERVATIONS_MAX_BYTES||!fits(result))throw Error('Complete observations and attention exceed the public budget; no page delivered');
  return result;
}
