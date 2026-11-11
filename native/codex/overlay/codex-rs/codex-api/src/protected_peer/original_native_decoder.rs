//! Fixed original native decoder. The writer is minted only from the genuine
//! original bootstrap after host observation and kept in private app-server state.
use super::{TransportError,hold};
#[cfg(unix)]
use super::Channel;
use codex_protocol::dynamic_tools::{DynamicToolResponse,DynamicToolCallOutputContentItem};
use codex_protocol::dynamic_tools::original_exchange::{OriginalDynamicExchange,OriginalDynamicExchangeIdentity};
use serde_json::Value;
use std::sync::{Arc,Weak};

#[derive(Clone,PartialEq,Eq)]
pub(super) struct OriginalStartupIdentity {
    nonce:String,pid:u32,slot:String,source:String,executable:String,host:String,
}
impl OriginalStartupIdentity {
    #[cfg(unix)]
    pub(super) fn observe(state:&Channel)->Result<Self,TransportError> {
        let challenge=state.challenge.as_ref().ok_or_else(||hold("original decoder challenge absent"))?;
        let host=state.host_observation.as_ref().and_then(|v|v.get("host_instance_id")).and_then(Value::as_str)
            .ok_or_else(||hold("original decoder host observation absent"))?;
        Ok(Self{nonce:challenge.nonce.clone(),pid:std::process::id(),slot:challenge.slot_id.clone(),
            source:challenge.source_manifest_sha256.clone(),executable:challenge.executable_sha256.clone(),host:host.into()})
    }
    pub(super) fn matches_claim(&self,claim:&super::startup::OriginalBootstrapClaim)->bool {
        self.nonce==claim.nonce&&self.pid==std::process::id()&&self.slot==claim.slot_id
            &&self.source==claim.source_manifest_sha256&&self.executable==claim.executable_sha256
    }
}
struct DecoderOwner {identity:OriginalStartupIdentity}
/// No public constructor, Clone, Deserialize, or writer accessor on an event.
pub struct OriginalNativeDecoderIssuer {owner:Arc<DecoderOwner>}
impl OriginalNativeDecoderIssuer {
    pub(super) fn new(identity:OriginalStartupIdentity)->Self {Self{owner:Arc::new(DecoderOwner{identity})}}
    /// The actual native oneshot receiver selects this concrete input branch.
    /// Decoded fields and success/verdict are never supplied by the caller.
    pub fn decode(&self,exchange:&OriginalDynamicExchange,input:OriginalNativeClientReturn)->DynamicToolResponse {
        let (raw,kind,response)=match input {
            OriginalNativeClientReturn::Value(value)=>{
                let raw=serde_json::to_vec(&value).ok();
                let (kind,response)=decode_fixed(value);
                (raw,kind,response)
            }
            OriginalNativeClientReturn::ClientError=>(None,DecodeKind::ClientError,fallback("dynamic tool request failed")),
            OriginalNativeClientReturn::ChannelClosed=>(None,DecodeKind::ChannelClosed,fallback("dynamic tool request failed")),
        };
        let decoded=serde_json::to_vec(&response).ok();
        if raw.as_ref().is_some_and(|b|b.len()>4_000_000)||decoded.as_ref().is_none_or(|b|b.len()>4_000_000) {
            exchange.observe_unresolved();return response;
        }
        let receipt=OriginalNativeDynamicReturn {owner:Arc::downgrade(&self.owner),exchange:exchange.identity(),
            raw:raw.map(Arc::from),decoded:decoded.unwrap_or_default().into(),kind};
        exchange.retain_original_decoder_result(&response,Arc::new(receipt));
        response
    }
}
pub enum OriginalNativeClientReturn {Value(Value),ClientError,ChannelClosed}
#[derive(Debug,Clone,Copy)]
enum DecodeKind {Decoded,InvalidOutput,RemoteImage,InvalidAudio,ClientError,ChannelClosed}

/// API-private constructor and issuer allocation prevent an arbitrary pending
/// token holder, typed DTO, JSON flag or Any carrier from manufacturing this.
pub struct OriginalNativeDynamicReturn {
    owner:Weak<DecoderOwner>,exchange:OriginalDynamicExchangeIdentity,raw:Option<Arc<[u8]>>,decoded:Arc<[u8]>,kind:DecodeKind,
}
impl OriginalNativeDynamicReturn {
    pub fn matches_original(&self,model:&super::original_history::OriginalResponseItem,exchange:&OriginalDynamicExchange)->bool {
        self.exchange.matches(exchange)&&self.owner.upgrade().is_some_and(|owner|model.matches_startup(&owner.identity))
    }
    pub fn source_facts(&self)->Value {serde_json::json!({"kind":"original_native_fixed_decoder_return",
        "decoder_outcome":format!("{:?}",self.kind),"raw_typed_client_result_sha256":self.raw.as_deref().map(super::hash),
        "decoded_core_response_sha256":super::hash(&self.decoded),
        "external_effects":"unproved; may be partial, adverse or unknown","remote_domain_closed":false})}
}
fn fallback(message:&str)->DynamicToolResponse {DynamicToolResponse {content_items:vec![DynamicToolCallOutputContentItem::InputText{text:message.into()}],success:false}}
fn decode_fixed(value:Value)->(DecodeKind,DynamicToolResponse) {
    match serde_json::from_value::<DynamicToolResponse>(value) {
        Ok(response) if response.content_items.iter().any(|item|matches!(item,
            DynamicToolCallOutputContentItem::InputImage{image_url} if image_url.split_once(':').is_some_and(|(s,_)|s.eq_ignore_ascii_case("http")||s.eq_ignore_ascii_case("https"))))=>
            (DecodeKind::RemoteImage,fallback("remote image URLs are not supported; use an inline data URL instead")),
        Ok(response) if response.content_items.iter().any(|item|matches!(item,
            DynamicToolCallOutputContentItem::InputAudio{audio_url} if !audio_url.get(.."data:".len()).is_some_and(|p|p.eq_ignore_ascii_case("data:"))))=>
            (DecodeKind::InvalidAudio,fallback("audio URLs must use an inline data URL")),
        Ok(response)=>(DecodeKind::Decoded,response),
        Err(_)=>(DecodeKind::InvalidOutput,fallback("dynamic tool response was invalid")),
    }
}
#[cfg(test)]
#[path="original_native_decoder_tests.rs"]
mod tests;

#[cfg(test)]
pub(super) fn controlled_identity(label:&str)->OriginalStartupIdentity {
    // Unqualified source fixture, not a genuine startup/native acceptance.
    OriginalStartupIdentity{nonce:label.into(),pid:1,slot:"fixture".into(),source:"fixture".into(),executable:"fixture".into(),host:"fixture".into()}
}
