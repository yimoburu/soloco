//! Exact whole-delivery framing. Whole assignment, inner source-cut and P1 row
//! references are DIFFERENT subjects. Business payload values remain opaque.
use super::super::{TransportError, hash, hold};
use serde::Deserialize;
use serde_json::value::RawValue;
use std::collections::BTreeMap;

const FRAME_PROTOCOL: &str = "soloco-peer-context-frame-v2";
const MAX_PAYLOAD_UTF8: usize = 200_000;
const MAX_PROFILE_FRAME_BYTES: usize = 4_000_000;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawFrame<'a> {
    protocol: String,
    contract_sha256: String,
    delivery_kind: String,
    payload_protocol: String,
    payload_sha256: String,
    payload_utf8_bytes: usize,
    source_cut_protocol: Option<String>,
    source_cut_sha256: Option<String>,
    source_cut_utf8_bytes: Option<usize>,
    #[serde(borrow)]
    payload: &'a RawValue,
}

/// Mechanical DATA only. No P1 row authenticity, semantic acceptance, readiness
/// or authority follows from this type or its digest fields.
pub(super) struct DecodedOriginalFrame<'a> {
    pub(super) payload: &'a str,
    pub(super) payload_sha256: String,
    pub(super) payload_utf8_bytes: usize,
    pub(super) source_cut: Option<&'a str>,
    pub(super) source_cut_sha256: Option<String>,
    pub(super) source_cut_utf8_bytes: Option<usize>,
}

fn whitespace(bytes: &[u8], position: &mut usize) {
    while bytes.get(*position).is_some_and(|b|matches!(*b,b' '|b'\t'|b'\r'|b'\n')) { *position += 1; }
}

// JS keys are UTF16 sequences. This preserves escaped lone surrogates and
// identifies escaped-key aliases without Rust String replacement/normalization.
fn key_units(raw: &str) -> Result<Vec<u16>, TransportError> {
    if raw.len()<2 || !raw.starts_with('"') || !raw.ends_with('"') { return Err(hold("original delivery key shape")); }
    let mut chars=raw[1..raw.len()-1].chars();let mut result=Vec::new();
    while let Some(ch)=chars.next() {
        if ch!='\\' { let mut units=[0u16;2];result.extend_from_slice(ch.encode_utf16(&mut units));continue; }
        match chars.next() {
            Some('"')=>result.push(b'"' as u16),Some('\\')=>result.push(b'\\' as u16),Some('/')=>result.push(b'/' as u16),
            Some('b')=>result.push(8),Some('f')=>result.push(12),Some('n')=>result.push(10),Some('r')=>result.push(13),Some('t')=>result.push(9),
            Some('u')=>{let mut unit=0u16;for _ in 0..4 { let digit=chars.next().and_then(|c|c.to_digit(16)).ok_or_else(||hold("original delivery key escape"))?;unit=(unit<<4)|(digit as u16); }result.push(unit);}
            _=>return Err(hold("original delivery key escape")),
        }
    }
    Ok(result)
}
fn ascii_key(key: &str) -> Vec<u16> { key.encode_utf16().collect() }

// Validate syntax with RawValue, then retain exact top-level value spans. Only
// keys/selectors are inspected; business numbers/values are NEVER materialized
// or serialized. Duplicate outer/inner keys reject, including escaped aliases.
fn object_spans(text: &str) -> Result<BTreeMap<Vec<u16>, &str>, TransportError> {
    let _: &RawValue=serde_json::from_str(text).map_err(|_|hold("original delivery raw JSON"))?;
    let bytes=text.as_bytes();let mut position=0usize;let mut spans=BTreeMap::new();
    whitespace(bytes,&mut position);
    if bytes.get(position)!=Some(&b'{') { return Err(hold("original delivery payload must be object")); }
    position+=1;
    loop {
        whitespace(bytes,&mut position);
        if bytes.get(position)==Some(&b'}') { position+=1;break; }
        let key_start=position;
        if bytes.get(position)!=Some(&b'"') { return Err(hold("original delivery key boundary")); }
        position+=1;
        loop { match bytes.get(position) {
            Some(b'\\')=>{position=position.checked_add(2).ok_or_else(||hold("original delivery key overflow"))?;}
            Some(b'"')=>{position+=1;break;}
            Some(_)=>position+=1,
            None=>return Err(hold("original delivery key unavailable")),
        }}
        let key=key_units(&text[key_start..position])?;
        if spans.contains_key(&key) { return Err(hold("duplicate original delivery top-level key")); }
        whitespace(bytes,&mut position);
        if bytes.get(position)!=Some(&b':') { return Err(hold("original delivery key separator")); }
        position+=1;whitespace(bytes,&mut position);
        let mut values=serde_json::Deserializer::from_str(&text[position..]).into_iter::<&RawValue>();
        let value=values.next().ok_or_else(||hold("original delivery raw value unavailable"))?
            .map_err(|_|hold("original delivery raw value shape"))?;
        position=position.checked_add(values.byte_offset()).ok_or_else(||hold("original delivery value overflow"))?;
        spans.insert(key,value.get());whitespace(bytes,&mut position);
        match bytes.get(position) {
            Some(b',')=>position+=1,
            Some(b'}')=>{position+=1;break;}
            _=>return Err(hold("original delivery member boundary")),
        }
    }
    whitespace(bytes,&mut position);
    if position!=bytes.len() { return Err(hold("original delivery trailing bytes")); }
    Ok(spans)
}
fn selector(spans: &BTreeMap<Vec<u16>, &str>, key: &str) -> Result<String,TransportError> {
    let raw=spans.get(&ascii_key(key)).ok_or_else(||hold("original delivery selector unavailable"))?;
    serde_json::from_str(raw).map_err(|_|hold("original delivery selector type"))
}
fn sha(value: &str) -> bool { value.len()==64&&value.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)) }
fn optional_string(value: Option<&str>) -> String { value.map(|v|format!("\"{v}\"")).unwrap_or_else(||"null".into()) }

pub(super) fn decode_original_frame<'a>(text: &'a str, source_contract_sha256: &str,
    maximum_frame_bytes: usize) -> Result<DecodedOriginalFrame<'a>, TransportError> {
    decode_selected_frame(text,source_contract_sha256,maximum_frame_bytes,super::OriginalToolProfile::OrdinaryFive)
}
pub(super) fn decode_bootstrap_frame<'a>(text:&'a str,source_contract_sha256:&str,
    maximum_frame_bytes:usize)->Result<DecodedOriginalFrame<'a>,TransportError> {
    if source_contract_sha256!=super::BOOTSTRAP_RESOURCE_SHA256||maximum_frame_bytes==0
        ||maximum_frame_bytes>super::super::MAX_FRAME {
        return Err(hold("original bootstrap frame resource differs from fixed source"));
    }
    decode_selected_frame(text,source_contract_sha256,maximum_frame_bytes,super::OriginalToolProfile::BootstrapReadonlyThree)
}
pub(super) fn decode_input_frontier_frame<'a>(text:&'a str,source_contract_sha256:&str,
    maximum_frame_bytes:usize)->Result<DecodedOriginalFrame<'a>,TransportError> {
    if source_contract_sha256!=super::FRONTIER_RESOURCE_SHA256||maximum_frame_bytes==0
        ||maximum_frame_bytes>super::super::MAX_FRAME {
        return Err(hold("original input frontier frame resource differs from fixed source"));
    }
    decode_selected_frame(text,source_contract_sha256,maximum_frame_bytes,super::OriginalToolProfile::InputFrontierReadonlyThree)
}
pub(super) fn decode_origin_maintenance_frame<'a>(text:&'a str,source_contract_sha256:&str,
    maximum_frame_bytes:usize)->Result<DecodedOriginalFrame<'a>,TransportError> {
    if source_contract_sha256!=super::ORIGIN_MAINTENANCE_RESOURCE_SHA256||maximum_frame_bytes==0
        ||maximum_frame_bytes>super::super::MAX_FRAME {
        return Err(hold("original origin maintenance frame resource differs from fixed source"));
    }
    decode_selected_frame(text,source_contract_sha256,maximum_frame_bytes,super::OriginalToolProfile::OriginMaintenanceReadonlyThree)
}
pub(super) fn decode_origin_final_review_frame<'a>(text:&'a str,source_contract_sha256:&str,
    maximum_frame_bytes:usize)->Result<DecodedOriginalFrame<'a>,TransportError> {
    if source_contract_sha256!=super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256||maximum_frame_bytes==0
        ||maximum_frame_bytes>super::super::MAX_FRAME {
        return Err(hold("original origin final review frame resource differs from fixed source"));
    }
    decode_selected_frame(text,source_contract_sha256,maximum_frame_bytes,super::OriginalToolProfile::OriginFinalReviewReadonlyThree)
}
pub(super) fn decode_origin_ordinary_task_frame<'a>(text:&'a str,source_contract_sha256:&str,
    maximum_frame_bytes:usize)->Result<DecodedOriginalFrame<'a>,TransportError> {
    if source_contract_sha256!=super::ORIGIN_ORDINARY_TASK_RESOURCE_SHA256||maximum_frame_bytes==0
        ||maximum_frame_bytes>super::super::MAX_FRAME {
        return Err(hold("original ordinary origin review frame resource differs from fixed source"));
    }
    decode_selected_frame(text,source_contract_sha256,maximum_frame_bytes,super::OriginalToolProfile::OriginOrdinaryTaskReadonlyThree)
}
fn decode_selected_frame<'a>(text:&'a str,source_contract_sha256:&str,maximum_frame_bytes:usize,
    profile:super::OriginalToolProfile)->Result<DecodedOriginalFrame<'a>,TransportError> {
    let bootstrap=profile==super::OriginalToolProfile::BootstrapReadonlyThree;
    if maximum_frame_bytes==0||maximum_frame_bytes>MAX_PROFILE_FRAME_BYTES||text.len()>maximum_frame_bytes||!sha(source_contract_sha256) {
        return Err(hold("original whole delivery frame capacity"));
    }
    let frame:RawFrame<'_>=serde_json::from_str(text).map_err(|_|hold("closed original whole delivery frame shape"))?;
    if frame.protocol!=FRAME_PROTOCOL||frame.contract_sha256!=source_contract_sha256||!sha(&frame.payload_sha256)
        ||frame.payload_utf8_bytes==0||frame.payload_utf8_bytes>MAX_PAYLOAD_UTF8 {
        return Err(hold("original whole delivery frame binding"));
    }
    let selected_kind=match profile {
        super::OriginalToolProfile::OrdinaryFive=>matches!(frame.delivery_kind.as_str(),"task-context"|"membership-assignment"),
        super::OriginalToolProfile::BootstrapReadonlyThree=>frame.delivery_kind=="bootstrap-membership-assignment",
        super::OriginalToolProfile::InputFrontierReadonlyThree=>frame.delivery_kind=="input-frontier-assignment",
        super::OriginalToolProfile::OriginMaintenanceReadonlyThree=>frame.delivery_kind=="origin-maintenance-assignment",
        super::OriginalToolProfile::OriginFinalReviewReadonlyThree=>matches!(frame.delivery_kind.as_str(),"origin-frontier-seal-assignment"|"owner-maintenance-assignment"),
        super::OriginalToolProfile::OriginOrdinaryTaskReadonlyThree=>frame.delivery_kind=="origin-ordinary-task-assignment",
    };
    if !selected_kind {return Err(hold("original delivery kind differs from constructor profile"));}
    match frame.delivery_kind.as_str() {
        "task-context"=>{
            if !matches!(frame.payload_protocol.as_str(),"peer-task-context-v1"|"peer-task-context-v2")
                ||frame.source_cut_protocol.is_some()||frame.source_cut_sha256.is_some()||frame.source_cut_utf8_bytes.is_some() {
                return Err(hold("original task delivery selector"));
            }
        }
        "membership-assignment"=>{
            if frame.payload_protocol!="peer-membership-assignment-v1"
                ||!matches!(frame.source_cut_protocol.as_deref(),Some("peer-membership-context-v1"|"peer-membership-context-v2"))
                ||!frame.source_cut_sha256.as_deref().is_some_and(sha)
                ||!frame.source_cut_utf8_bytes.is_some_and(|n|n>0&&n<=frame.payload_utf8_bytes) {
                return Err(hold("original whole membership delivery selector"));
            }
        }
        "bootstrap-membership-assignment"=>{
            if frame.payload_protocol!="peer-bootstrap-membership-assignment-v1"
                ||frame.source_cut_protocol.as_deref()!=Some("peer-bootstrap-membership-context-v1")
                ||!frame.source_cut_sha256.as_deref().is_some_and(sha)
                ||!frame.source_cut_utf8_bytes.is_some_and(|n|n>0&&n<=frame.payload_utf8_bytes)
                ||frame.payload_utf8_bytes>65_536 {
                return Err(hold("original whole bootstrap membership delivery selector"));
            }
        }
        "input-frontier-assignment"=>{
            if frame.payload_protocol!="peer-input-frontier-assignment-v1"
                ||frame.source_cut_protocol.is_some()||frame.source_cut_sha256.is_some()
                ||frame.source_cut_utf8_bytes.is_some()||frame.payload_utf8_bytes>65_536 {
                return Err(hold("original whole input frontier delivery selector"));
            }
        }
        "origin-maintenance-assignment"|"origin-frontier-seal-assignment"|"owner-maintenance-assignment"|"origin-ordinary-task-assignment"=>{
            let protocol=match frame.delivery_kind.as_str() {
                "origin-maintenance-assignment"=>"peer-origin-maintenance-context-v1",
                "origin-frontier-seal-assignment"=>"peer-origin-frontier-seal-context-v1",
                "origin-ordinary-task-assignment"=>"peer-origin-ordinary-task-context-v1",
                _=>"peer-owner-maintenance-assignment-v1",
            };
            if frame.payload_protocol!=protocol||frame.source_cut_protocol.is_some()
                ||frame.source_cut_sha256.is_some()||frame.source_cut_utf8_bytes.is_some()
                ||frame.payload_utf8_bytes>65_536 {
                return Err(hold("original whole maintenance delivery selector"));
            }
        }
        _=>return Err(hold("unsupported original delivery kind")),
    }
    let prefix=format!("{{\"protocol\":\"{FRAME_PROTOCOL}\",\"contract_sha256\":\"{}\",\"delivery_kind\":\"{}\",\"payload_protocol\":\"{}\",\"payload_sha256\":\"{}\",\"payload_utf8_bytes\":{},\"source_cut_protocol\":{},\"source_cut_sha256\":{},\"source_cut_utf8_bytes\":{},\"payload\":",
        frame.contract_sha256,frame.delivery_kind,frame.payload_protocol,frame.payload_sha256,frame.payload_utf8_bytes,
        optional_string(frame.source_cut_protocol.as_deref()),optional_string(frame.source_cut_sha256.as_deref()),
        frame.source_cut_utf8_bytes.map(|n|n.to_string()).unwrap_or_else(||"null".into()));
    if !text.starts_with(&prefix)||!text.ends_with('}') { return Err(hold("original whole delivery fixed prefix/order")); }
    let payload=&text[prefix.len()..text.len()-1];
    if payload.len()!=frame.payload_utf8_bytes||hash(payload.as_bytes())!=frame.payload_sha256 {
        return Err(hold("original WHOLE payload bytes changed"));
    }
    let original:&RawValue=serde_json::from_str(payload).map_err(|_|hold("original whole payload JSON"))?;
    if original.get()!=frame.payload.get() { return Err(hold("original whole payload boundary")); }
    let outer=object_spans(payload)?;
    if selector(&outer,"protocol")?!=frame.payload_protocol { return Err(hold("original whole payload protocol mismatch")); }
    // Only the fixed SOURCE-selected family's exact delivery selectors are
    // decoded. All business values retain their original opaque raw bytes.
    match frame.delivery_kind.as_str() {
        "origin-maintenance-assignment"=>{
            if !matches!(selector(&outer,"kind")?.as_str(),"peer-origin-reconstruction"|"peer-origin-review") {
                return Err(hold("original origin maintenance purpose selector"));
            }
        }
        "origin-frontier-seal-assignment"=>{
            if selector(&outer,"kind")?!="peer-origin-frontier-seal-review" {
                return Err(hold("original origin frontier seal purpose selector"));
            }
        }
        "origin-ordinary-task-assignment"=>{
            if selector(&outer,"kind")?!="peer-origin-ordinary-task-review" {
                return Err(hold("original ordinary origin purpose selector"));
            }
        }
        "owner-maintenance-assignment"=>{
            if selector(&outer,"kind")?!="owner-handover-review"
                ||selector(&outer,"fresh_review_purpose")?!="peer-owner-maintenance-fresh-purpose-v1" {
                return Err(hold("original owner fresh maintenance purpose selector"));
            }
        }
        _=>{}
    }
    let source_cut=if matches!(frame.delivery_kind.as_str(),"membership-assignment"|"bootstrap-membership-assignment") {
        let raw=*outer.get(&ascii_key("source_cut")).ok_or_else(||hold("original whole assignment source cut missing"))?;
        let expected_sha=frame.source_cut_sha256.as_deref().ok_or_else(||hold("original source cut digest unavailable"))?;
        if selector(&outer,"source_cut_sha256")?!=expected_sha||raw.len()!=frame.source_cut_utf8_bytes.unwrap_or(0)
            ||hash(raw.as_bytes())!=expected_sha { return Err(hold("original INNER source cut bytes changed")); }
        let inner=object_spans(raw)?;
        let inner_protocol=selector(&inner,"protocol")?;
        if Some(inner_protocol.as_str())!=frame.source_cut_protocol.as_deref() {
            return Err(hold("original inner source cut protocol mismatch"));
        }
        if bootstrap {
            let meaning=*inner.get(&ascii_key("current_meaning"))
                .ok_or_else(||hold("original bootstrap current meaning unavailable"))?;
            let meaning=object_spans(meaning)?;
            if selector(&meaning,"protocol")?!="peer-checked-input-current-meaning-v1" {
                return Err(hold("original bootstrap current meaning protocol mismatch"));
            }
        }
        Some(raw)
    }else{None};
    Ok(DecodedOriginalFrame {payload,payload_sha256:frame.payload_sha256,payload_utf8_bytes:frame.payload_utf8_bytes,
        source_cut,source_cut_sha256:frame.source_cut_sha256,source_cut_utf8_bytes:frame.source_cut_utf8_bytes})
}

#[cfg(test)]
mod tests;
