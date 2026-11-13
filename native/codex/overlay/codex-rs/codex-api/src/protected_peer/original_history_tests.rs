//! AUTHORED_UNRUN. Controlled API-owner/source fixtures are not native/account
//! qualification or proof that Core's concrete integration has executed.
use super::*;
use super::super::{SourceRuntime,SourceProvenance,OriginalSessionIngress,OriginalAcceptedInputWitness};
use super::super::original_native_decoder::{controlled_identity,OriginalNativeDecoderIssuer,OriginalNativeClientReturn};
use codex_history::{OriginalInputCapture,ResponseItemEnvelope,OriginalItemReceipt};
use codex_protocol::user_input::UserInput;
use serde_json::json;
type Owner=dyn std::any::Any+Send+Sync;
struct Fixture {runtime:SourceRuntime,ingress:OriginalSessionIngress,owner:Arc<Owner>,user:ResponseItemEnvelope,accepted:OriginalAcceptedInputWitness,decoder:OriginalResponseDecoder}
fn capture(envelopes:&[ResponseItemEnvelope])->OriginalInputCapture {
    let mut envelopes=envelopes.to_vec();
    for e in &mut envelopes{e.observe_original_prompt_projection();}
    let items=envelopes.iter().map(|e|e.item.clone()).collect::<Vec<_>>();
    OriginalInputCapture::from_original_projection(&envelopes,&items).unwrap()
}
fn receipt(e:&ResponseItemEnvelope)->&OriginalItemReceipt {e.metadata.as_ref().unwrap().original_item_receipt.as_deref().unwrap()}
fn body(input:&[u8])->Vec<u8> {
    let mut bytes=b"{\"input\":".to_vec();bytes.extend_from_slice(input);
    bytes.extend_from_slice(b",\"tools\":");bytes.extend_from_slice(include_bytes!("../protected_peer_responses_tools.json"));bytes.push(b'}');bytes
}
async fn fixture()->Fixture {
    let runtime=SourceRuntime::new();let owner:Arc<Owner>=Arc::new("controlled API source owner");
    let ingress=runtime.original_session_ingress_for_core(owner.clone());
    let typed=vec![UserInput::Text{text:"task".into(),text_elements:Vec::new()}];
    ingress.observe_accepted_input(1,&typed).await.unwrap();
    let mut user=ResponseItemEnvelope::new(serde_json::from_value(json!({"type":"message","role":"user","content":[{"type":"input_text","text":"task"}]})).unwrap());
    user.observe_original_user_input(&typed);
    let accepted=ingress.bind_accepted_materialization(1,&typed,receipt(&user)).await.unwrap();
    let input=capture(&[user.clone()]);let projection=ingress.seal_original_projection(&input,&[(0,accepted.clone())]).unwrap();
    let provenance=SourceProvenance::from_original_session_input_capture(&input,projection,json!({}),Vec::new());
    let step=runtime.step("fixture".into(),None,None,None,None,Some(Arc::new(provenance)));
    let decoder=OriginalResponseDecoder::returned(&step,&body(input.serialized_input()),controlled_identity("same")).unwrap();
    Fixture{runtime,ingress,owner,user,accepted,decoder}
}
fn function_payload()->String {
    json!({"type":"response.output_item.done","item":{"type":"function_call","call_id":"call","name":"soloco_context_header","arguments":"{\"opaque\":9007199254740993,\"text\":\"雪\\n\"}"}}).to_string()
}
fn done(f:&mut Fixture)->OriginalResponseItem {
    let payload=function_payload();let ordinal=f.decoder.observe_payload(&payload).unwrap();
    let item:ResponseItem=serde_json::from_value(serde_json::from_str::<Value>(&payload).unwrap()["item"].clone()).unwrap();
    let mut original=f.decoder.done(&payload,ordinal,item).unwrap();
    original.assign_missing_id(Some(ResponseItemId::new("fc")));original
}
fn envelope(item:ResponseItem)->ResponseItemEnvelope {let mut e=ResponseItemEnvelope::new(item);e.observe_original_materialization();e}

#[tokio::test]
async fn original_logical_payload_raw_item_and_structural_id_remain_distinct() {
    let mut f=fixture().await;let original=done(&mut f);
    assert_eq!(original.raw_payload.as_ref(),function_payload().as_bytes());
    assert!(std::str::from_utf8(&original.raw_item).unwrap().contains("9007199254740993"));
    assert_ne!(original.original_materialized,original.materialized);
    assert!(!original.complete_original_response());
    f.decoder.completed("r");assert!(!original.complete_original_response());
    f.decoder.local_eof();assert!(original.complete_original_response());
    assert_eq!(original.source_facts()["remote_domain_closed"],false);
}
#[tokio::test]
async fn model_materialization_claim_is_owner_bound_and_one_use_across_clones() {
    let mut f=fixture().await;let original=done(&mut f);let clone=original.clone();
    let foreign:Arc<Owner>=Arc::new("different");
    assert!(!original.claim_for_original_core(&foreign));
    assert!(original.claim_for_original_core(&f.owner));assert!(!clone.claim_for_original_core(&f.owner));
}
#[tokio::test]
async fn completed_without_eof_parser_unknown_and_negative_revocation_stay_held() {
    let mut f=fixture().await;let original=done(&mut f);f.decoder.completed("r");
    assert!(!original.complete_original_response());f.decoder.local_eof();f.decoder.unknown();
    assert!(!original.complete_original_response());
    let mut f=fixture().await;let original=done(&mut f);f.decoder.completed("r");f.decoder.local_eof();
    original.revoke_unsupported_transform();assert!(!original.complete_original_response());
}
#[tokio::test]
async fn changed_item_or_unimplemented_response_kind_does_not_gain_original_lineage() {
    let mut f=fixture().await;let raw=function_payload();let ordinal=f.decoder.observe_payload(&raw).unwrap();
    let changed:ResponseItem=serde_json::from_value(json!({"type":"function_call","call_id":"call","name":"soloco_context_header","arguments":"changed"})).unwrap();
    assert!(f.decoder.done(&raw,ordinal,changed).is_none());
    let unknown="{\"type\":\"response.output_item.done\",\"item\":{\"type\":\"foreign_kind\",\"arbitrary\":true}}";
    assert!(f.decoder.done(unknown,ordinal,ResponseItem::Other).is_none());
}
#[tokio::test]
async fn complete_live_model_and_original_fixed_decoder_return_seal_one_subsequent_request() {
    let mut f=fixture().await;let model=done(&mut f);f.decoder.completed("r");f.decoder.local_eof();
    assert!(model.claim_for_original_core(&f.owner));
    let call=envelope(model.item().clone());
    let call_witness=f.ingress.bind_original_live_materialization(receipt(&call),f.owner.clone(),model.clone(),json!({}),model.materialized_bytes(),None).unwrap();
    let exchange=codex_protocol::dynamic_tools::original_exchange::OriginalDynamicExchange::for_original_invocation(f.owner.clone());
    let issuer=OriginalNativeDecoderIssuer::new(controlled_identity("same"));
    let decoded=issuer.decode(&exchange,OriginalNativeClientReturn::Value(json!({"contentItems":[{"type":"inputText","text":"opaque business text: 9007199254740993 雪"}],"success":true})));
    let returned=exchange.claim_return(&f.owner,&decoded).unwrap();
    let output=envelope(serde_json::from_value(json!({"type":"function_call_output","call_id":"call","output":[{"type":"input_text","text":"opaque business text: 9007199254740993 雪"}]})).unwrap());
    let output_bytes=serde_json::to_vec(&output.item).unwrap();
    let output_witness=f.ingress.bind_original_live_materialization(receipt(&output),f.owner.clone(),model.clone(),json!({}),&output_bytes,Some(returned)).unwrap();
    let input=capture(&[f.user.clone(),call,output]);
    let projection=f.ingress.seal_original_live_projection(&input,&[(0,f.accepted.clone())],&[],&[(1,call_witness),(2,output_witness)]).unwrap();
    let provenance=SourceProvenance::from_original_session_input_capture(&input,projection,json!({}),Vec::new());
    assert!(provenance.unknown_origins.is_empty());
    let wired=f.runtime.bind_original_wire_projection(&provenance,f.owner.clone(),input.serialized_input(),input.serialized_input(),&json!({"fixture":"controlled identity only"})).unwrap();
    wired.session_projection.as_ref().unwrap().check_final_request(&f.runtime,&body(input.serialized_input())).unwrap();
    // New actual acceptance revokes the old revision; lineage is not a send grant.
    f.ingress.observe_accepted_input(2,&[UserInput::Text{text:"newer".into(),text_elements:Vec::new()}]).await.unwrap();
    assert!(wired.session_projection.as_ref().unwrap().check_final_request(&f.runtime,&body(input.serialized_input())).is_err());
}
#[tokio::test]
async fn foreign_decoder_startup_and_arbitrary_any_carriers_cannot_mint_tool_origin() {
    let mut f=fixture().await;let model=done(&mut f);f.decoder.completed("r");f.decoder.local_eof();
    let exchange=codex_protocol::dynamic_tools::original_exchange::OriginalDynamicExchange::for_original_invocation(f.owner.clone());
    let issuer=OriginalNativeDecoderIssuer::new(controlled_identity("foreign"));
    let decoded=issuer.decode(&exchange,OriginalNativeClientReturn::Value(json!({"contentItems":[],"success":false})));
    let returned=exchange.claim_return(&f.owner,&decoded).unwrap();
    assert!(!returned.witness::<super::super::OriginalNativeDynamicReturn>().unwrap().matches_original(&model,&exchange));
    let fake=codex_protocol::dynamic_tools::original_exchange::OriginalDynamicExchange::for_original_invocation(f.owner.clone());
    fake.retain_original_decoder_result(&decoded,Arc::new(json!({"verified":true})));
    assert!(fake.claim_return(&f.owner,&decoded).unwrap().witness::<super::super::OriginalNativeDynamicReturn>().is_none());
}
#[tokio::test]
async fn exact_five_declaration_and_original_argument_string_are_required() {
    let mut f=fixture().await;let model=done(&mut f);
    let tools:Value=serde_json::from_slice(include_bytes!("../protected_peer_responses_tools.json")).unwrap();
    let spec=tools[0].clone();let ResponseItem::FunctionCall{arguments,..}=model.item() else{panic!()};
    assert!(model.matches_fixed_call("call",None,"soloco_context_header",arguments,&spec));
    let mut changed=spec.clone();changed["description"]=json!("different");
    assert!(!model.matches_fixed_call("call",None,"soloco_context_header",arguments,&changed));
    assert!(!model.matches_fixed_call("call",Some("foreign"),"soloco_context_header",arguments,&spec));
    assert!(!model.matches_fixed_call("call",None,"soloco_context_header","{ }",&spec));
}
#[tokio::test]
async fn public_materialization_serialization_and_changed_projection_do_not_restore_authority() {
    let mut f=fixture().await;let model=done(&mut f);f.decoder.completed("r");f.decoder.local_eof();
    let original=envelope(model.item().clone());
    let mut projected=original.clone();
    if let ResponseItem::FunctionCall{arguments,..}=&mut projected.item{*arguments="changed".into();}
    projected.observe_original_prompt_projection();
    assert!(f.ingress.bind_original_live_materialization(receipt(&projected),f.owner.clone(),model.clone(),json!({"ready":true}),&serde_json::to_vec(&projected.item).unwrap(),None).is_none());
    let other=SourceRuntime::new().original_session_ingress_for_core(f.owner.clone());
    assert!(other.bind_original_live_materialization(receipt(&original),f.owner.clone(),model.clone(),json!({}),model.materialized_bytes(),None).is_none());
}

#[tokio::test]
async fn actual_protected_sse_decoder_emits_completed_only_after_same_body_eof() {
    let f=fixture().await;
    let wire=format!("data: {}\n\ndata: {{\"type\":\"response.completed\",\"response\":{{\"id\":\"r\"}}}}\n\n",function_payload());
    let stream:codex_client::ByteStream=Box::pin(futures::stream::iter(vec![Ok(bytes::Bytes::from(wire))]));
    let (tx,mut rx)=tokio::sync::mpsc::channel(16);
    crate::sse::responses::process_sse_with_original(stream,tx,std::time::Duration::from_secs(1),None,
        crate::common::SafetyBufferingTreatment::default(),Some(f.decoder)).await;
    let mut seen=None;let mut completed=false;
    while let Some(event)=rx.recv().await {match event.unwrap(){
        crate::ResponseEvent::OriginalOutputItemDone(original)=>seen=Some(original),
        crate::ResponseEvent::Completed{..}=>{completed=true;assert!(seen.as_ref().unwrap().complete_original_response());},_=>{}
    }}
    assert!(completed);assert_eq!(seen.unwrap().source_facts()["remote_domain_closed"],false);
}
#[tokio::test]
async fn done_then_malformed_or_interrupted_sse_preserves_history_unknown() {
    for terminal in ["not-json", "{\"type\":\"response.incomplete\",\"response\":{\"id\":\"r\",\"incomplete_details\":{\"reason\":\"interrupted\"}}}"] {
        let f=fixture().await;
        let wire=format!("data: {}\n\ndata: {terminal}\n\n",function_payload());
        let stream:codex_client::ByteStream=Box::pin(futures::stream::iter(vec![Ok(bytes::Bytes::from(wire))]));
        let (tx,mut rx)=tokio::sync::mpsc::channel(16);
        crate::sse::responses::process_sse_with_original(stream,tx,std::time::Duration::from_secs(1),None,
            crate::common::SafetyBufferingTreatment::default(),Some(f.decoder)).await;
        let mut seen=None;
        while let Some(event)=rx.recv().await {if let Ok(crate::ResponseEvent::OriginalOutputItemDone(original))=event {seen=Some(original);}}
        assert!(!seen.unwrap().complete_original_response());
    }
}
#[tokio::test]
async fn protected_completion_drain_timeout_preserves_partial_done_and_unknown() {
    let f=fixture().await;
    let wire=format!("data: {}\n\ndata: {{\"type\":\"response.completed\",\"response\":{{\"id\":\"r\"}}}}\n\n",function_payload());
    use futures::StreamExt;
    let initial=futures::stream::iter(vec![Ok(bytes::Bytes::from(wire))]);
    let stream:codex_client::ByteStream=Box::pin(initial.chain(futures::stream::pending()));
    let (tx,mut rx)=tokio::sync::mpsc::channel(16);
    crate::sse::responses::process_sse_with_original(stream,tx,std::time::Duration::from_millis(1),None,
        crate::common::SafetyBufferingTreatment::default(),Some(f.decoder)).await;
    let mut seen=None;let mut error=false;
    while let Some(event)=rx.recv().await {match event {
        Ok(crate::ResponseEvent::OriginalOutputItemDone(original))=>seen=Some(original),Err(_)=>error=true,
        Ok(crate::ResponseEvent::Completed{..})=>panic!("Completed must not replace unresolved body"),_=>{}
    }}
    assert!(error);assert!(!seen.unwrap().complete_original_response());
}
#[tokio::test]
async fn original_body_error_after_done_and_completed_is_preserved_not_replaced_by_success() {
    let f=fixture().await;
    let wire=format!("data: {}\n\ndata: {{\"type\":\"response.completed\",\"response\":{{\"id\":\"r\"}}}}\n\n",function_payload());
    let stream:codex_client::ByteStream=Box::pin(futures::stream::iter(vec![
        Ok(bytes::Bytes::from(wire)),Err(codex_client::TransportError::Build("original controlled body failure".into()))]));
    let (tx,mut rx)=tokio::sync::mpsc::channel(16);
    crate::sse::responses::process_sse_with_original(stream,tx,std::time::Duration::from_secs(1),None,
        crate::common::SafetyBufferingTreatment::default(),Some(f.decoder)).await;
    let mut seen=None;let mut original_error=false;
    while let Some(event)=rx.recv().await {match event {
        Ok(crate::ResponseEvent::OriginalOutputItemDone(original))=>seen=Some(original),
        Err(error)=>original_error=error.to_string().contains("original controlled body failure"),
        Ok(crate::ResponseEvent::Completed{..})=>panic!("actual body failure must remain a failure"),_=>{}
    }}
    assert!(original_error);assert!(!seen.unwrap().complete_original_response());
}

// AUTHORED_UNRUN Source-only terminal-custody controls. These exercise the
// actual private parser claim and fixed event encoder, not an inherited FD3,
// a qualified Native build, a live host, or company admission.
fn terminal_payload(response_id:&str)->String {
    json!({"type":"response.completed","response":{"id":response_id}}).to_string()
}
fn complete_terminal(f:&Fixture,response_id:&str)->String {
    let payload=terminal_payload(response_id);
    f.decoder.observe_terminal(&payload,"response.completed");
    f.decoder.completed(response_id);f.decoder.local_eof();payload
}
#[tokio::test]
async fn original_terminal_drained_claim_is_closed_exact_and_one_use() {
    let f=fixture().await;let payload=complete_terminal(&f,"same-response");
    let drained=f.decoder.take_terminal_drained().unwrap();let frame=drained.frame(7);
    assert_eq!(frame,json!({"protocol":"soloco-protected-backend-permit-v2",
        "kind":"original_response_terminal_drained","nonce":"same","pid":1,
        "host_instance_id":"fixture","request_id":f.decoder.source.request_id,
        "request_sha256":f.decoder.source.request_sha256,"sequence":7,"response_id":"same-response",
        "terminal_logical_payload_sha256":super::super::hash(payload.as_bytes()),
        "local_body_eof_observed":true,"remote_domain_closed":false}));
    assert_eq!(frame.as_object().unwrap().len(),12);
    assert!(f.decoder.take_terminal_drained().is_err());
}
#[tokio::test]
async fn terminal_drained_requires_completed_same_body_eof_and_original_terminal_payload() {
    let f=fixture().await;
    assert!(f.decoder.take_terminal_drained().is_err());
    f.decoder.local_eof();assert!(f.decoder.take_terminal_drained().is_err());
    let f=fixture().await;let payload=terminal_payload("r");
    f.decoder.observe_terminal(&payload,"response.completed");f.decoder.completed("r");
    assert!(f.decoder.take_terminal_drained().is_err());
    f.decoder.local_eof();assert!(f.decoder.take_terminal_drained().is_ok());
    let f=fixture().await;f.decoder.completed("r");f.decoder.local_eof();
    assert!(f.decoder.take_terminal_drained().is_err());
}
#[tokio::test]
async fn terminal_drained_unknown_interrupted_duplicate_and_empty_completion_hold() {
    let f=fixture().await;complete_terminal(&f,"r");f.decoder.unknown();
    assert!(f.decoder.take_terminal_drained().is_err());
    let f=fixture().await;f.decoder.observe_terminal("{\"type\":\"response.incomplete\"}","response.incomplete");
    f.decoder.completed("r");f.decoder.local_eof();assert!(f.decoder.take_terminal_drained().is_err());
    let f=fixture().await;let payload=complete_terminal(&f,"r");
    f.decoder.observe_terminal(&payload,"response.completed");assert!(f.decoder.take_terminal_drained().is_err());
    let f=fixture().await;complete_terminal(&f,"r");f.decoder.completed("r");
    assert!(f.decoder.take_terminal_drained().is_err());
    let f=fixture().await;complete_terminal(&f,"");assert!(f.decoder.take_terminal_drained().is_err());
}
#[tokio::test]
async fn terminal_drained_private_claim_cannot_move_to_foreign_startup_request_or_hash() {
    let f=fixture().await;complete_terminal(&f,"r");let drained=f.decoder.take_terminal_drained().unwrap();
    assert!(drained.matches(&controlled_identity("same"),&f.decoder.source.request_id,&f.decoder.source.request_sha256));
    assert!(!drained.matches(&controlled_identity("foreign"),&f.decoder.source.request_id,&f.decoder.source.request_sha256));
    assert!(!drained.matches(&controlled_identity("same"),"foreign-request",&f.decoder.source.request_sha256));
    assert!(!drained.matches(&controlled_identity("same"),&f.decoder.source.request_id,&"0".repeat(64)));
}
#[tokio::test]
async fn original_terminal_payload_hash_preserves_exact_logical_bytes() {
    let f=fixture().await;
    let payload="{ \"type\": \"response.completed\", \"response\": {\"id\":\"r\"} }";
    f.decoder.observe_terminal(payload,"response.completed");f.decoder.completed("r");f.decoder.local_eof();
    let frame=f.decoder.take_terminal_drained().unwrap().frame(1);
    assert_eq!(frame["terminal_logical_payload_sha256"],super::super::hash(payload.as_bytes()));
    assert_ne!(frame["terminal_logical_payload_sha256"],super::super::hash(terminal_payload("r").as_bytes()));
}
