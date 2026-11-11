// Buffered wire validation only. An allowlist is private policy input, never an
// authentication, native-delivery, instruction-assembly or enforcement proof.
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';

const BYTE_LIMIT=100000,EVENT_LIMIT=1000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reject=kind=>{throw Object.assign(Error(kind==='json'?'Gateway JSON rejected':'Gateway response stream rejected'),{code:kind==='json'?'GATEWAY_JSON_INVALID':'GATEWAY_SSE_INVALID'});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function keys(value,required,optional=[]){if(!plain(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))reject('sse');}
const scalarText=value=>typeof value==='string';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
function inputBytes(bytes,limit){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>limit||bytes.byteLength<1||typeof SharedArrayBuffer!=='undefined'&&bytes.buffer instanceof SharedArrayBuffer)reject('json');
 const result=Buffer.from(bytes);if(result.length>limit)reject('json');return result;
}
function utf8(bytes){return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}

export function parseGatewayJSON(bytes,options={}){
 try{
  keys(options,[],['max_bytes','max_depth']);const {max_bytes=BYTE_LIMIT,max_depth=32}=options;
  if(!Number.isSafeInteger(max_bytes)||max_bytes<1||max_bytes>BYTE_LIMIT||!Number.isSafeInteger(max_depth)||max_depth<1||max_depth>128)reject('json');
  const text=utf8(inputBytes(bytes,max_bytes));let at=0;
  const ws=()=>{while(at<text.length&&' \t\r\n'.includes(text[at]))at++;};
  function string(){
   if(text[at++]!=='"')reject('json');let result='';
   while(at<text.length){
    const c=text.charCodeAt(at++);if(c===34)return result;if(c<32)reject('json');
    if(c===92){
     const escape=text[at++],simple={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
     if(Object.hasOwn(simple,escape)){result+=simple[escape];continue;}
     if(escape!=='u'||!/^[0-9A-Fa-f]{4}$/.test(text.slice(at,at+4)))reject('json');
     let unit=parseInt(text.slice(at,at+4),16);at+=4;
     if(unit>=0xD800&&unit<=0xDBFF){
      if(text.slice(at,at+2)!=='\\u'||!/^[0-9A-Fa-f]{4}$/.test(text.slice(at+2,at+6)))reject('json');
      const low=parseInt(text.slice(at+2,at+6),16);if(low<0xDC00||low>0xDFFF)reject('json');at+=6;result+=String.fromCharCode(unit,low);
     }else{if(unit>=0xDC00&&unit<=0xDFFF)reject('json');result+=String.fromCharCode(unit);}
    }else if(c>=0xD800&&c<=0xDBFF){const low=text.charCodeAt(at++);if(low<0xDC00||low>0xDFFF)reject('json');result+=String.fromCharCode(c,low);}
    else{if(c>=0xDC00&&c<=0xDFFF)reject('json');result+=String.fromCharCode(c);}
   }
   reject('json');
  }
  function value(depth){
   ws();const c=text[at];
   if(c==='"')return string();
   if(c==='{'||c==='['){
    if(depth>=max_depth)reject('json');at++;const object=c==='{',result=object?{}:[],seen=new Set(),end=object?'}':']';ws();if(text[at]===end){at++;return result;}
    for(;;){
     ws();if(object){if(text[at]!=='"')reject('json');const name=string();if(seen.has(name))reject('json');seen.add(name);ws();if(text[at++]!==':')reject('json');Object.defineProperty(result,name,{value:value(depth+1),enumerable:true,writable:true,configurable:true});}
     else result.push(value(depth+1));
     ws();if(text[at]===end){at++;return result;}if(text[at++]!==',')reject('json');
    }
   }
   for(const [literal,result]of [['true',true],['false',false],['null',null]])if(text.startsWith(literal,at)){at+=literal.length;return result;}
   const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
   if(!number)reject('json');at+=number[0].length;const result=Number(number[0]);if(!Number.isFinite(result)||Number.isInteger(result)&&!Number.isSafeInteger(result))reject('json');return result;
  }
  const result=value(0);ws();if(at!==text.length)reject('json');return result;
 }catch{reject('json');}
}

const stable=value=>JSON.stringify(value,(_key,current)=>plain(current)?Object.fromEntries(Object.keys(current).sort().map(k=>[k,current[k]])):current);
const equal=(a,b)=>stable(a)===stable(b);
const empty=value=>Array.isArray(value)&&value.length===0;
function optionalEmpty(value,key){if(Object.hasOwn(value,key)&&!empty(value[key]))reject('sse');}
function outputText(part,initial=false){
 keys(part,['type','text','annotations'],['logprobs']);if(part.type!=='output_text'||!scalarText(part.text)||!empty(part.annotations)||initial&&part.text!=='')reject('sse');optionalEmpty(part,'logprobs');return part;
}
function summaryText(part,initial=false){keys(part,['type','text']);if(part.type!=='summary_text'||!scalarText(part.text)||initial&&part.text!=='')reject('sse');return part;}
function item(value,initial,allowed){
 if(!plain(value)||!id(value.id))reject('sse');
 if(value.type==='function_call'){
  keys(value,['type','id','call_id','name','arguments','status']);
  if(!id(value.call_id)||!allowed.has(value.name)||!scalarText(value.arguments)||value.status!==(initial?'in_progress':'completed')||initial&&value.arguments!=='')reject('sse');
 }else if(value.type==='message'){
  keys(value,['type','id','role','status','content'],['phase']);
  if(value.role!=='assistant'||value.status!==(initial?'in_progress':'completed')||!Array.isArray(value.content)||initial&&value.content.length||Object.hasOwn(value,'phase')&&value.phase!==null&&!['commentary','final_answer'].includes(value.phase))reject('sse');
  value.content.forEach(part=>outputText(part));
 }else if(value.type==='reasoning'){
  keys(value,['type','id','summary'],['content','encrypted_content','status']);
  if(!Array.isArray(value.summary)||initial&&value.summary.length)reject('sse');value.summary.forEach(part=>summaryText(part));
  if(Object.hasOwn(value,'content')&&!empty(value.content)||Object.hasOwn(value,'encrypted_content')&&value.encrypted_content!==null&&(!scalarText(value.encrypted_content)||initial)||Object.hasOwn(value,'status')&&value.status!==(initial?'in_progress':'completed'))reject('sse');
 }else reject('sse');
 return value;
}
function response(value,status){
 // Explicit ordinary HTTP metadata subset HOLD: the exact SSE decoder has not
 // been audited for additional root instructions/tools/catalog/control fields.
 // Do not infer that unreviewed root metadata is ignored by the consumer.
 keys(value,['id','object','status','output'],['error','incomplete_details','background']);
 if(!id(value.id)||value.object!=='response'||value.status!==status||!Array.isArray(value.output)||value.error!==undefined&&value.error!==null||value.incomplete_details!==undefined&&value.incomplete_details!==null||Object.hasOwn(value,'background')&&value.background!==false)reject('sse');return value;
}
function sseFrames(bytes,maxEvents){
 const source=utf8(bytes);if(source.startsWith('\uFEFF')||/\r(?!\n)/.test(source))reject('sse');
 const text=source.replaceAll('\r\n','\n');if(!text.endsWith('\n\n'))reject('sse');const result=[];
 for(const block of text.split('\n\n')){
  if(!block)continue;let name=null;const data=[];let meaningful=false;
  for(const line of block.split('\n')){
   if(line.startsWith(':'))continue;const colon=line.indexOf(':');if(colon<0)reject('sse');const field=line.slice(0,colon),value=line.slice(colon+1).replace(/^ /,'');meaningful=true;
   if(field==='event'){if(name!==null||!/^response\.[a-z_]+(?:\.[a-z_]+)*$/.test(value))reject('sse');name=value;}
   else if(field==='data')data.push(value);else reject('sse');
  }
  if(!meaningful)continue;if(!data.length||result.length>=maxEvents)reject('sse');
  const event=parseGatewayJSON(Buffer.from(data.join('\n')));if(!plain(event)||typeof event.type!=='string'||name!==null&&name!==event.type)reject('sse');result.push(event);
 }
 return result;
}

export function validateGatewaySSE(bytes,options={}){
 try{
  keys(options,['allowed_calls','validate_arguments'],['max_events']);const {allowed_calls,validate_arguments,max_events=EVENT_LIMIT}=options;
  if(!Array.isArray(allowed_calls)||allowed_calls.length>32||new Set(allowed_calls).size!==allowed_calls.length||allowed_calls.some(name=>typeof name!=='string'||!/^[A-Za-z_][A-Za-z0-9_.:/-]{0,159}$/.test(name))||typeof validate_arguments!=='function'||!Number.isSafeInteger(max_events)||max_events<1||max_events>EVENT_LIMIT)reject('sse');
  const raw=inputBytes(bytes,BYTE_LIMIT),events=sseFrames(raw,max_events),allowed=new Set(allowed_calls),items=new Map(),ids=new Set(),calls=new Set(),argumentsToValidate=[];
  let native=null,inProgress=false,terminal=false,sequence=0;
  function row(event,type){
   if(!Number.isSafeInteger(event.output_index)||event.output_index<0||event.output_index>=EVENT_LIMIT||!id(event.item_id))reject('sse');
   const state=items.get(event.output_index);if(!state||state.added.id!==event.item_id||state.done||type&&state.added.type!==type)reject('sse');return state;
  }
  function part(state,index){if(!Number.isSafeInteger(index)||index<0||index>=EVENT_LIMIT||!state.parts.has(index))reject('sse');return state.parts.get(index);}
  for(const event of events){
   if(terminal||!Number.isSafeInteger(event.sequence_number)||event.sequence_number!==sequence++)reject('sse');
   if(event.type==='response.created'||event.type==='response.in_progress'){
    keys(event,['type','sequence_number','response']);const r=response(event.response,'in_progress');if(r.output.length)reject('sse');
    if(event.type==='response.created'){if(native!==null||sequence!==1)reject('sse');native=r.id;}
    else{if(native===null||r.id!==native||inProgress)reject('sse');inProgress=true;}
    continue;
   }
   if(native===null)reject('sse');
   if(event.type==='response.output_item.added'){
    keys(event,['type','sequence_number','output_index','item']);if(!Number.isSafeInteger(event.output_index)||event.output_index<0||event.output_index>=EVENT_LIMIT||items.has(event.output_index))reject('sse');
    const added=item(event.item,true,allowed);if(ids.has(added.id)||added.type==='function_call'&&calls.has(added.call_id))reject('sse');ids.add(added.id);if(added.type==='function_call')calls.add(added.call_id);
    items.set(event.output_index,{added,done:null,arguments:'',argumentsDone:false,parts:new Map()});continue;
   }
   if(event.type==='response.function_call_arguments.delta'){
    keys(event,['type','sequence_number','item_id','output_index','delta']);const state=row(event,'function_call');if(state.argumentsDone||!scalarText(event.delta))reject('sse');state.arguments+=event.delta;continue;
   }
   if(event.type==='response.function_call_arguments.done'){
    keys(event,['type','sequence_number','item_id','output_index','arguments']);const state=row(event,'function_call');if(state.argumentsDone||!scalarText(event.arguments)||event.arguments!==state.arguments)reject('sse');state.argumentsDone=true;continue;
   }
   if(['response.content_part.added','response.content_part.done','response.reasoning_summary_part.added','response.reasoning_summary_part.done'].includes(event.type)){
    const summary=event.type.startsWith('response.reasoning_'),indexKey=summary?'summary_index':'content_index';
    keys(event,['type','sequence_number','item_id','output_index',indexKey,'part']);const state=row(event,summary?'reasoning':'message'),index=event[indexKey];
    if(!Number.isSafeInteger(index)||index<0||index>=EVENT_LIMIT)reject('sse');
    if(event.type.endsWith('.added')){if(state.parts.has(index))reject('sse');(summary?summaryText:outputText)(event.part,true);state.parts.set(index,{text:'',textDone:false,done:null});}
    else{const p=part(state,index);(summary?summaryText:outputText)(event.part);if(p.done||!p.textDone||event.part.text!==p.text)reject('sse');p.done=event.part;}
    continue;
   }
   if(['response.output_text.delta','response.output_text.done','response.reasoning_summary_text.delta','response.reasoning_summary_text.done'].includes(event.type)){
    const summary=event.type.startsWith('response.reasoning_'),indexKey=summary?'summary_index':'content_index',done=event.type.endsWith('.done'),valueKey=done?'text':'delta';
    keys(event,['type','sequence_number','item_id','output_index',indexKey,valueKey],summary?[]:['logprobs']);if(!summary)optionalEmpty(event,'logprobs');
    const state=row(event,summary?'reasoning':'message'),p=part(state,event[indexKey]);if(p.done||p.textDone||!scalarText(event[valueKey]))reject('sse');
    if(done){if(event.text!==p.text)reject('sse');p.textDone=true;}else p.text+=event.delta;continue;
   }
   if(event.type==='response.output_item.done'){
    keys(event,['type','sequence_number','output_index','item']);if(!Number.isSafeInteger(event.output_index))reject('sse');const state=items.get(event.output_index);if(!state||state.done)reject('sse');
    const done=item(event.item,false,allowed),added=state.added;if(done.id!==added.id||done.type!==added.type)reject('sse');
    if(done.type==='function_call'){
     if(done.name!==added.name||done.call_id!==added.call_id||!state.argumentsDone||done.arguments!==state.arguments)reject('sse');
     const args=parseGatewayJSON(Buffer.from(done.arguments));if(!plain(args))reject('sse');argumentsToValidate.push({name:done.name,args,item_id:done.id,call_id:done.call_id,arguments_sha256:hash(Buffer.from(done.arguments))});
    }else{
     const content=done.type==='message'?done.content:done.summary;if(content.length!==state.parts.size)reject('sse');
     for(let index=0;index<content.length;index++)if(!state.parts.get(index)?.done||!equal(content[index],state.parts.get(index).done))reject('sse');
     if(done.type==='message'&&(done.role!==added.role||done.phase!==added.phase))reject('sse');
    }
    state.done=done;continue;
   }
   if(event.type==='response.completed'){
    keys(event,['type','sequence_number','response']);const r=response(event.response,'completed');if(r.id!==native||r.output.length!==items.size)reject('sse');
    for(let index=0;index<r.output.length;index++){const done=item(r.output[index],false,allowed),state=items.get(index);if(!state?.done||!equal(done,state.done))reject('sse');}
    terminal=true;continue;
   }
   // Provider failures/incomplete responses, Lite/WS, hosted/custom/shell/MCP
   // events and unrecognized future event variants all hold the entire buffer.
   reject('sse');
  }
  if(!terminal)reject('sse');
  // Never call even a private argument validator for an unsafe partial stream.
  for(const {name,args,...binding}of argumentsToValidate){const result=validate_arguments(name,args,Object.freeze(binding));if(result!==undefined){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});reject('sse');}}
  return Object.freeze({protocol:'protected-responses-sse-validation-v1',bytes:raw.length,events:events.length,items:items.size,function_calls:argumentsToValidate.length,sha256:hash(raw)});
 }catch{reject('sse');}
}
