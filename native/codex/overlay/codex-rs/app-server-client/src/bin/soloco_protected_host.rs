//! Concrete bounded stdio companion. No auth constructor precedes original FD startup.
use codex_app_server::{in_process::InProcessServerEvent, protected_host::OriginalManagedHost};
use codex_app_server_client::{InProcessAppServerClient, InProcessClientStartArgs};
use codex_app_server_protocol::{ClientRequest, InitializeParams, JSONRPCMessage, RequestId};
use codex_arg0::Arg0DispatchPaths;
use codex_config::LoaderOverrides;
use codex_exec_server::EnvironmentManager;
use codex_feedback::CodexFeedback;
use codex_protocol::protocol::SessionSource;
use codex_utils_absolute_path::AbsolutePathBuf;
use codex_utils_cli::CliConfigOverrides;
use serde_json::{Value, json};
use serde::de::{DeserializeSeed, MapAccess, SeqAccess, Visitor};
use std::{collections::BTreeSet, io, path::PathBuf, sync::Arc};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use std::{future::Future, time::Duration};
use tokio::time::Instant;
const FRAME:usize=100_000;
const TOTAL:usize=4_000_000;
const FRAMES:usize=256;

// One final absolute lifetime from BEFORE startup. Cleanup uses this same final
// deadline; it never adds a fresh timeout after the operation budget expires.
const LIFETIME:Duration=Duration::from_secs(120);
const CLEANUP_RESERVE:Duration=Duration::from_secs(5);
async fn before_deadline<T>(deadline:Instant,operation:impl Future<Output=io::Result<T>>)->io::Result<T>{
 tokio::select! {biased;
  _=tokio::time::sleep_until(deadline)=>Err(held("absolute deadline; completion unknown")),
  result=operation=>result,
 }
}
async fn bounded_operation<T>(deadline:Instant,writer_failure:impl Future<Output=io::Result<()>>,operation:impl Future<Output=io::Result<T>>)->io::Result<T>{
 // This select surrounds the WHOLE operation. A selected inner branch awaiting
 // send/resolve/reject cannot suspend polling of writer failure or the deadline.
 tokio::select! {biased;
  _=tokio::time::sleep_until(deadline)=>Err(held("absolute operation deadline; completion unknown")),
  result=writer_failure=>Err(held(if result.is_err(){"original stdout failed; completion unknown"}else{"original stdout closed during operation"})),
  result=operation=>result,
 }
}
async fn write_output<W:AsyncWrite+Unpin>(mut stdout:W,mut output_rx:tokio::sync::mpsc::Receiver<Value>)->io::Result<()>{
 let(mut total,mut frames)=(0usize,0usize);
 while let Some(value)=output_rx.recv().await {
  let mut bytes=serde_json::to_vec(&value).map_err(io::Error::other)?;bytes.push(b'\n');
  total+=bytes.len();frames+=1;if bytes.len()>FRAME||total>TOTAL||frames>FRAMES{return Err(held("original output bound"));}
  stdout.write_all(&bytes).await?;stdout.flush().await?;
 }Ok(())
}
fn held(reason: &'static str)->io::Error {io::Error::new(io::ErrorKind::PermissionDenied,reason)}
fn closed(value:&Value,keys:&[&str])->bool {value.as_object().is_some_and(|v|v.len()==keys.len()&&keys.iter().all(|k|v.contains_key(*k)))}
// The original native boundary rejects duplicate keys itself. It does not rely
// on an upstream Node parser or serde_json::Value's last-key-wins behavior.
struct StrictValue { depth:usize }
struct StrictVisitor { depth:usize }
impl<'de> DeserializeSeed<'de> for StrictValue {
 type Value=Value;
 fn deserialize<D:serde::Deserializer<'de>>(self,d:D)->Result<Value,D::Error>{
  if self.depth>32{return Err(serde::de::Error::custom("original JSON depth"));}
  d.deserialize_any(StrictVisitor{depth:self.depth})
 }
}
impl<'de> Visitor<'de> for StrictVisitor {
 type Value=Value;
 fn expecting(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result{f.write_str("bounded unique-key JSON")}
 fn visit_bool<E:serde::de::Error>(self,v:bool)->Result<Value,E>{Ok(Value::Bool(v))}
 fn visit_i64<E:serde::de::Error>(self,v:i64)->Result<Value,E>{Ok(Value::Number(v.into()))}
 fn visit_u64<E:serde::de::Error>(self,v:u64)->Result<Value,E>{Ok(Value::Number(v.into()))}
 fn visit_f64<E:serde::de::Error>(self,v:f64)->Result<Value,E>{serde_json::Number::from_f64(v).map(Value::Number).ok_or_else(||E::custom("non-finite JSON"))}
 fn visit_str<E:serde::de::Error>(self,v:&str)->Result<Value,E>{Ok(Value::String(v.to_owned()))}
 fn visit_string<E:serde::de::Error>(self,v:String)->Result<Value,E>{Ok(Value::String(v))}
 fn visit_none<E:serde::de::Error>(self)->Result<Value,E>{Ok(Value::Null)}
 fn visit_unit<E:serde::de::Error>(self)->Result<Value,E>{Ok(Value::Null)}
 fn visit_seq<A:SeqAccess<'de>>(self,mut a:A)->Result<Value,A::Error>{let mut v=Vec::new();while let Some(item)=a.next_element_seed(StrictValue{depth:self.depth+1})?{v.push(item);}Ok(Value::Array(v))}
 fn visit_map<A:MapAccess<'de>>(self,mut a:A)->Result<Value,A::Error>{
  let mut v=serde_json::Map::new();while let Some(key)=a.next_key::<String>()?{
   if v.contains_key(&key){return Err(serde::de::Error::custom("duplicate original JSON key"));}
   let item=a.next_value_seed(StrictValue{depth:self.depth+1})?;v.insert(key,item);
  }Ok(Value::Object(v))
 }
}
fn strict_json(bytes:&[u8])->io::Result<Value>{
 let mut d=serde_json::Deserializer::from_slice(bytes);
 let value=StrictValue{depth:0}.deserialize(&mut d).map_err(|_|held("original unique-key JSON"))?;
 d.end().map_err(|_|held("original trailing JSON"))?;Ok(value)
}
struct FrameReader<R> { input:R, pending:Vec<u8>, total:usize, frames:usize }
impl<R:AsyncBufRead+Unpin> FrameReader<R> {
fn new(input:R)->Self {Self {input,pending:Vec::new(),total:0,frames:0}}
async fn next(&mut self)->io::Result<Option<Value>> {
    loop {
        let bytes=self.input.fill_buf().await?;
        if bytes.is_empty(){return if self.pending.is_empty(){Ok(None)}else{Err(held("unterminated original input"))};}
        let end=bytes.iter().position(|b|*b==b'\n');let take=end.unwrap_or(bytes.len());
        let consumed=take+usize::from(end.is_some());
        if self.pending.len()+consumed>FRAME||self.total+consumed>TOTAL{return Err(held("original input frame/total bound"));}
        // Persistent pending bytes survive cancellation when an event wins select!.
        self.pending.extend_from_slice(&bytes[..take]);self.input.consume(consumed);self.total+=consumed;
        if end.is_some(){
            self.frames+=1;if self.frames>FRAMES{return Err(held("original input frame capacity"));}
            if self.pending.is_empty(){return Err(held("empty original input"));}
            let frame=std::mem::take(&mut self.pending);
            let value=strict_json(&frame)?;
            return Ok(Some(value));
        }
    }
}
}
async fn write_frame(output:&tokio::sync::mpsc::Sender<Value>,value:Value)->io::Result<()> {
    output.send(value).await.map_err(|_|held("original stdout unavailable"))
}
fn paths()->io::Result<(PathBuf,PathBuf)> {
    let args:Vec<_>=std::env::args_os().skip(1).collect();
    if args.len()!=5||args[0]!="--soloco-protected-host-v2"||args[1]!="--state-root"||args[3]!="--cwd" {return Err(held("exact companion entry arguments required"));}
    let root=PathBuf::from(&args[2]);let cwd=PathBuf::from(&args[4]);
    if !root.is_absolute()||!cwd.is_absolute()||std::fs::canonicalize(&root)?!=root||std::fs::canonicalize(&cwd)?!=cwd {return Err(held("original canonical scope required"));}
    Ok((root,cwd))
}
async fn run()->io::Result<()> {
    let final_deadline=Instant::now()+LIFETIME;
    let operation_deadline=final_deadline-CLEANUP_RESERVE;
    let(root,cwd)=paths()?;
    let startup=before_deadline(operation_deadline,async {codex_api::protected_peer::begin_original_companion(&root,&cwd).await.map_err(io::Error::other)}).await?;
    let mut input=FrameReader::new(BufReader::new(tokio::io::stdin()));
    let initialize=before_deadline(operation_deadline.min(Instant::now()+Duration::from_secs(5)),input.next()).await?.ok_or_else(||held("original initialize missing"))?;
    if !closed(&initialize,&["id","method","params"])||initialize["method"]!="initialize" {return Err(held("exact original initialize required"));}
    let id:RequestId=serde_json::from_value(initialize["id"].clone()).map_err(|_|held("initialize identity"))?;
    let init:InitializeParams=serde_json::from_value(initialize["params"].clone()).map_err(|_|held("typed initialize"))?;
    let required_human_approval=init.capabilities.as_ref().is_some_and(|caps|caps.required_human_approval);
    if !init.capabilities.as_ref().is_some_and(|caps|caps.experimental_api){return Err(held("original dynamic-tool protocol capability missing"));}
    let arg0=Arg0DispatchPaths::default();
    // This actual native bootstrap consumes the source-owned startup claim and checks
    // unchanged original home BEFORE constructing or loading any AuthManager.
    let host=before_deadline(operation_deadline,OriginalManagedHost::bootstrap(startup,arg0.clone(),CliConfigOverrides::default(),LoaderOverrides::default())).await?;
    let scope=before_deadline(operation_deadline,host.prepare_scope(AbsolutePathBuf::from_absolute_path(root)?,AbsolutePathBuf::from_absolute_path(cwd)?)).await?;
    let config=scope.config();
    let environments=Arc::new(before_deadline(operation_deadline,async {EnvironmentManager::from_env(None,config.http_client_factory()).await.map_err(io::Error::other)}).await?);
    let args=InProcessClientStartArgs {
        required_human_approval,arg0_paths:arg0,config,cli_overrides:Vec::new(),loader_overrides:LoaderOverrides::default(),
        strict_config:true,cloud_config_bundle:Default::default(),embedded_network_policy:Default::default(),feedback:CodexFeedback::new(),
        log_db:None,state_db:None,environment_manager:environments,config_warnings:Vec::new(),session_source:SessionSource::VSCode,
        enable_codex_api_key_env:false,client_name:init.client_info.name,client_version:init.client_info.version,
        experimental_api:true,mcp_server_openai_form_elicitation:false,opt_out_notification_methods:Vec::new(),channel_capacity:32,
    };
    let(mut client,receipt)=before_deadline(operation_deadline,InProcessAppServerClient::start_with_original_host_and_receipt(args,scope)).await?;
    let(output,output_rx)=tokio::sync::mpsc::channel::<Value>(32);
    let mut writer=tokio::spawn(write_output(tokio::io::stdout(),output_rx));
    let mut writer_observed=false;
    let mut pending=BTreeSet::new();let mut server_pending=BTreeSet::new();let mut requests=tokio::task::JoinSet::new();
    let mut initialized=false;let mut inputs=1usize;
    let writer_failure=async {let result=(&mut writer).await;writer_observed=true;result.map_err(io::Error::other)?};
    let outcome:io::Result<()>=bounded_operation(operation_deadline,writer_failure,async {
        write_frame(&output,json!({"id":id,"result":receipt})).await?;
        loop {tokio::select! {
            joined=requests.join_next(),if !requests.is_empty()=>{
                let(key,reply)=joined.ok_or_else(||held("request join missing"))?.map_err(io::Error::other)??;
                if !pending.remove(&key){return Err(held("request identity replay"));}write_frame(&output,reply).await?;
            },
            event=client.next_event()=>{
                match event.ok_or_else(||held("original runtime event stream closed"))? {
                    InProcessServerEvent::ServerNotification(value)=>write_frame(&output,serde_json::to_value(value).map_err(io::Error::other)?).await?,
                    InProcessServerEvent::ServerRequest(value)=>{
                        let value=serde_json::to_value(value).map_err(io::Error::other)?;
                        if value["method"]!="item/tool/call" {return Err(held("unsupported original server request"));}
                        let key=serde_json::to_string(&value["id"]).map_err(io::Error::other)?;
                        if !server_pending.insert(key){return Err(held("server request replay"));}write_frame(&output,value).await?;
                    },
                    InProcessServerEvent::Lagged{..}=>return Err(held("original event loss")),
                }
            },
            value=input.next()=>{
                let Some(value)=value? else{return if pending.is_empty()&&server_pending.is_empty(){Ok(())}else{Err(held("EOF with outstanding original operations"))};};
                inputs+=1;if inputs>FRAMES{return Err(held("original input frame capacity"));}
                if closed(&value,&["method"])&&value["method"]=="initialized" {
                    if initialized{return Err(held("initialized replay"));}initialized=true;continue;
                }
                if !initialized{return Err(held("initialized notification required"));}
                if value.get("method").is_some(){
                    let request:ClientRequest=serde_json::from_value(value).map_err(|_|held("typed original request"))?;
                    if !["config/read","configRequirements/read","permissionProfile/list","mcpServerStatus/list","app/installed","thread/start","thread/resume","turn/start","turn/interrupt"].contains(&request.method_name()){return Err(held("unsupported original method"));}
                    if pending.len()>=4{return Err(held("original request concurrency"));}
                    let id=request.id().clone();let key=serde_json::to_string(&id).map_err(io::Error::other)?;
                    if !pending.insert(key.clone()){return Err(held("request replay"));}let sender=client.request_handle();
                    requests.spawn(async move {let result=sender.request(request).await?;let reply=match result{Ok(value)=>json!({"id":id,"result":value}),Err(error)=>json!({"id":id,"error":error})};Ok::<_,io::Error>((key,reply))});
                }else{
                    let message:JSONRPCMessage=serde_json::from_value(value).map_err(|_|held("typed original tool reply"))?;
                    match message {
                        JSONRPCMessage::Response(response)=>{let key=serde_json::to_string(&response.id).map_err(io::Error::other)?;if !server_pending.remove(&key){return Err(held("unowned tool reply"));}client.resolve_server_request(response.id,response.result).await?;},
                        JSONRPCMessage::Error(response)=>{let key=serde_json::to_string(&response.id).map_err(io::Error::other)?;if !server_pending.remove(&key){return Err(held("unowned tool error"));}client.reject_server_request(response.id,response.error).await?;},
                        _=>return Err(held("unsupported original notification")),
                    }
                }
            }
        }}
    }).await;
    requests.abort_all();drop(output);
    let cleanup=before_deadline(final_deadline,async {
        while requests.join_next().await.is_some(){}
        let shutdown=client.shutdown().await;
        if !writer_observed {let result=(&mut writer).await;writer_observed=true;result.map_err(io::Error::other)??;}
        shutdown
    }).await;
    if cleanup.is_err(){
        // Do not await again after the SAME final deadline. Process failure is
        // containment, never a claim that unresolved native/remote work closed.
        requests.abort_all();if !writer_observed {writer.abort();}
        return Err(held("cleanup unknown within absolute lifetime"));
    }
    outcome
}
#[tokio::main]
async fn main(){
    if let Err(error)=run().await {
        // No stderr write/flush is awaited after the final deadline. Parent
        // observes exit 2 as Held/unknown, never as a local or remote close proof.
        let cleanup_unknown=error.to_string()=="cleanup unknown within absolute lifetime";
        std::process::exit(if cleanup_unknown {3}else{2});
    }
}

#[cfg(test)]
mod controlled_source_tests {
 use super::*;
 // These controlled cases use actual mpsc/send and write_output paths. They
 // open no native host, auth, provider, network, company or source-build slot.
 #[tokio::test]
 async fn full_output_queue_cannot_hide_operation_deadline(){
  let(output,_rx)=tokio::sync::mpsc::channel(1);output.send(json!({"first":1})).await.unwrap();
  let entered=std::sync::atomic::AtomicBool::new(false);
  let result=bounded_operation(Instant::now()+Duration::from_millis(20),std::future::pending(),async {
   entered.store(true,std::sync::atomic::Ordering::SeqCst);write_frame(&output,json!({"blocked":2})).await
  }).await;
  assert!(entered.load(std::sync::atomic::Ordering::SeqCst));
  assert_eq!(result.unwrap_err().to_string(),"absolute operation deadline; completion unknown");
  assert_eq!(output.capacity(),0); // selected branch really remained backpressured
 }
 #[tokio::test]
 async fn actual_writer_failure_preempts_a_selected_blocked_branch(){
  let(pipe,reader)=tokio::io::duplex(1);let(writer_tx,writer_rx)=tokio::sync::mpsc::channel(1);
  writer_tx.send(json!({"original":"larger than the one byte pipe"})).await.unwrap();
  let mut writer=tokio::spawn(write_output(pipe,writer_rx));
  let(output,_rx)=tokio::sync::mpsc::channel(1);output.send(json!({"first":1})).await.unwrap();
  let entered=std::sync::atomic::AtomicBool::new(false);
  let failure=async {
   // The original writer is polled and blocked on its actual write. Closing
   // the controlled read end produces its real BrokenPipe/IO failure.
   tokio::time::sleep(Duration::from_millis(20)).await;drop(reader);
   (&mut writer).await.map_err(io::Error::other)?
  };
  let result=bounded_operation(Instant::now()+Duration::from_secs(1),failure,async {
   entered.store(true,std::sync::atomic::Ordering::SeqCst);write_frame(&output,json!({"blocked":2})).await
  }).await;
  assert!(entered.load(std::sync::atomic::Ordering::SeqCst));
  assert_eq!(result.unwrap_err().to_string(),"original stdout failed; completion unknown");
 }
 #[tokio::test]
 async fn blocked_original_writer_cleanup_uses_same_final_deadline(){
  let start=Instant::now();let final_deadline=start+Duration::from_millis(60);
  let(pipe,_reader)=tokio::io::duplex(1);let(output,rx)=tokio::sync::mpsc::channel(1);
  output.send(json!({"original":"bytes cannot fit in the controlled unread pipe"})).await.unwrap();
  let mut writer=tokio::spawn(write_output(pipe,rx));
  let operation=bounded_operation(final_deadline-Duration::from_millis(30),std::future::pending(),std::future::pending::<io::Result<()>>()).await;
  assert!(operation.is_err());drop(output);
  let cleanup=before_deadline(final_deadline,async {(&mut writer).await.map_err(io::Error::other)?}).await;
  assert_eq!(cleanup.unwrap_err().to_string(),"absolute deadline; completion unknown");
  writer.abort(); // No unbounded join after the original final deadline.
  assert!(Instant::now()-start<Duration::from_secs(1));
 }
 #[tokio::test]
 async fn already_expired_startup_cut_never_polls_startup_or_cleanup(){
  let entered=std::sync::atomic::AtomicBool::new(false);
  let result=before_deadline(Instant::now()-Duration::from_millis(1),async {
   entered.store(true,std::sync::atomic::Ordering::SeqCst);Ok(())
  }).await;
  assert!(result.is_err());assert!(!entered.load(std::sync::atomic::Ordering::SeqCst));
 }
 #[test]
 fn duplicate_nested_original_keys_hold(){
  assert!(strict_json(br#"{"id":1,"params":{"tool":"safe","tool":"other"}}"#).is_err());
  assert!(strict_json(br#"{"id":1,"id":2}"#).is_err());
 }
 #[test]
 fn exact_initialized_envelope_survives_strict_parser(){
  let value=strict_json(br#"{"method":"initialized"}"#).expect("actual idless envelope");
  assert!(closed(&value,&["method"]));assert_eq!(value["method"],"initialized");
 }
 #[test]
 fn excessive_nested_original_input_holds(){
  let bytes=format!("{}0{}","[".repeat(34),"]".repeat(34));assert!(strict_json(bytes.as_bytes()).is_err());
 }
 #[tokio::test]
 async fn cancelled_reader_retains_original_partial_frame(){
  let(mut producer,consumer)=tokio::io::duplex(256);let mut reader=FrameReader::new(BufReader::new(consumer));
  producer.write_all(br#"{"method":"init"#).await.expect("partial fixture");
  assert!(tokio::time::timeout(std::time::Duration::from_millis(10),reader.next()).await.is_err());
  producer.write_all(b"ialized\"}\n").await.expect("remaining fixture");
  assert_eq!(reader.next().await.expect("actual parser").expect("actual frame"),json!({"method":"initialized"}));
 }
}
