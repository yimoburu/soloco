//! AUTHORED_UNRUN. Controlled issuer fixtures are not original native startup.
use super::*;
use serde_json::json;
fn first_text(response:&DynamicToolResponse)->&str {match &response.content_items[0]{DynamicToolCallOutputContentItem::InputText{text}=>text,_=>panic!()}}
#[test]
fn fixed_decoder_preserves_opaque_unicode_and_large_numeric_text() {
    let text="{\"n\":9007199254740993, \"snow\":\"雪\\n\"}";
    let (kind,response)=decode_fixed(json!({"contentItems":[{"type":"inputText","text":text}],"success":false}));
    assert!(matches!(kind,DecodeKind::Decoded));assert_eq!(first_text(&response),text);assert!(!response.success);
}
#[test]
fn invalid_remote_media_and_invalid_shape_keep_distinct_fallback_causes() {
    for (input,kind,text) in [
        (json!({"contentItems":[{"type":"inputImage","imageUrl":"HTTPS://example.invalid/x"}],"success":true}),"RemoteImage","remote image URLs are not supported; use an inline data URL instead"),
        (json!({"contentItems":[{"type":"inputAudio","audioUrl":"https://example.invalid/x"}],"success":true}),"InvalidAudio","audio URLs must use an inline data URL"),
        (json!({"verified":true}),"InvalidOutput","dynamic tool response was invalid"),
    ] {let (cause,response)=decode_fixed(input);assert_eq!(format!("{cause:?}"),kind);assert_eq!(first_text(&response),text);assert!(!response.success);}
}
#[test]
fn client_error_channel_close_and_known_false_are_different_source_facts() {
    let owner:Arc<dyn std::any::Any+Send+Sync>=Arc::new("core");let issuer=OriginalNativeDecoderIssuer::new(controlled_identity("same"));
    for (input,kind) in [(OriginalNativeClientReturn::ClientError,"ClientError"),(OriginalNativeClientReturn::ChannelClosed,"ChannelClosed"),
        (OriginalNativeClientReturn::Value(json!({"contentItems":[],"success":false})),"Decoded")] {
        let exchange=OriginalDynamicExchange::for_original_invocation(owner.clone());let response=issuer.decode(&exchange,input);
        let retained=exchange.claim_return(&owner,&response).unwrap();let proof=retained.witness::<OriginalNativeDynamicReturn>().unwrap();
        assert_eq!(proof.source_facts()["decoder_outcome"],kind);assert_eq!(proof.source_facts()["remote_domain_closed"],false);
    }
}
