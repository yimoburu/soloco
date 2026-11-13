//! Canonical JSON-specific decoder shared by rollout readers and original read receipts.

use crate::RolloutLine;
use serde::de::Error as _;
use serde_json::Value;

/// Decodes a persisted rollout record without Serde's flattened-envelope buffering.
///
/// With `serde_json/arbitrary_precision`, Serde's generic buffer cannot replay
/// floating-point values nested inside flattened or internally tagged fields:
/// https://github.com/serde-rs/json/issues/721
/// https://github.com/serde-rs/serde/issues/1183
///
/// Keep this JSON-specific workaround shared by persistence and original read
/// receipts so resume and projection use the same full typed item decoder.
/// Remove it once Serde supports format-specific buffering.
pub fn decode_rollout_line(value: Value) -> serde_json::Result<RolloutLine> {
    let Value::Object(mut fields) = value else {
        return Err(serde_json::Error::custom(
            "rollout line must be a JSON object",
        ));
    };
    let timestamp = fields
        .remove("timestamp")
        .ok_or_else(|| serde_json::Error::missing_field("timestamp"))
        .and_then(serde_json::from_value)?;
    let ordinal = fields
        .remove("ordinal")
        .map(serde_json::from_value::<Option<u64>>)
        .transpose()?
        .flatten();
    let item = serde_json::from_value(Value::Object(fields))?;

    Ok(RolloutLine {
        timestamp,
        ordinal,
        item,
    })
}

/// Parses a persisted JSONL rollout record through the canonical JSON decoder.
pub fn parse_rollout_line(line: &str) -> serde_json::Result<RolloutLine> {
    serde_json::from_str::<Value>(line).and_then(decode_rollout_line)
}

/// Parses persisted JSONL rollout record bytes through the canonical JSON decoder.
pub fn parse_rollout_line_bytes(bytes: &[u8]) -> serde_json::Result<RolloutLine> {
    serde_json::from_slice::<Value>(bytes).and_then(decode_rollout_line)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ResponseItemEnvelope, RolloutItem};

    const RESPONSE: &str = r#"{"timestamp":"2026-11-10T00:00:00Z","ordinal":9,"type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"original π"}]},"metadata":{"client_authored":true}}"#;

    // Authored source regressions only; this source-preparation cut does not run tests.
    #[test]
    fn canonical_decoder_preserves_complete_typed_lines_and_nested_decimals() {
        let event = r#"{"timestamp":"2025-01-03T12:00:00.000Z","ordinal":7,"type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":{"limit_id":null,"limit_name":null,"primary":{"used_percent":0.0,"window_minutes":60,"resets_at":1800000000},"secondary":{"used_percent":12.5,"window_minutes":10080,"resets_at":1800100000},"credits":null,"individual_limit":null,"spend_control_reached":null,"plan_type":null,"rate_limit_reached_type":null}}}"#;
        for original in [event, RESPONSE] {
            let expected: Value = serde_json::from_str(original).unwrap();
            let decoded = parse_rollout_line_bytes(original.as_bytes()).unwrap();
            assert_eq!(decoded.timestamp, expected["timestamp"].as_str().unwrap());
            assert_eq!(decoded.ordinal, expected["ordinal"].as_u64());
            assert_eq!(serde_json::to_value(&decoded).unwrap(), expected);
            assert_eq!(serde_json::to_value(parse_rollout_line(original).unwrap()).unwrap(), expected);
            assert_eq!(serde_json::to_value(decode_rollout_line(expected.clone()).unwrap()).unwrap(), expected);
            if let RolloutItem::ResponseItem(envelope) = decoded.item {
                assert!(envelope.metadata.as_ref().unwrap().client_authored);
                let mut observed = ResponseItemEnvelope::new(envelope.item);
                observed.observe_original_rollout_read("/original/rollout.jsonl", 9, original.as_bytes(), None);
                let metadata = observed.metadata.as_ref().unwrap();
                let receipt = metadata.original_item_receipt.as_ref().unwrap();
                assert_eq!(receipt.original_read().unwrap(), ("/original/rollout.jsonl", 9, original.as_bytes()));
                assert_eq!(receipt.original_materialized_bytes(), serde_json::to_vec(&observed.item).unwrap());
            }
        }
    }

    #[test]
    fn malformed_envelopes_and_raw_or_different_items_cannot_issue_read_receipts() {
        let line = parse_rollout_line(RESPONSE).unwrap();
        let RolloutItem::ResponseItem(envelope) = line.item else { panic!("response item"); };
        let original: Value = serde_json::from_str(RESPONSE).unwrap();
        let mut invalid = Vec::new();
        let mut timestamp = original.clone(); timestamp["timestamp"] = Value::from(17); invalid.push(timestamp);
        let mut missing_timestamp = original.clone(); missing_timestamp.as_object_mut().unwrap().remove("timestamp"); invalid.push(missing_timestamp);
        let mut ordinal = original.clone(); ordinal["ordinal"] = Value::from(-1); invalid.push(ordinal);
        let mut fractional_ordinal = original.clone(); fractional_ordinal["ordinal"] = serde_json::from_str("1.5").unwrap(); invalid.push(fractional_ordinal);
        // A raw ResponseItem is not a complete typed RolloutLine.
        invalid.push(original["payload"].clone());
        for value in invalid {
            let bytes = serde_json::to_vec(&value).unwrap();
            assert!(parse_rollout_line_bytes(&bytes).is_err());
            let mut observed = ResponseItemEnvelope::new(envelope.item.clone());
            observed.observe_original_materialization();
            observed.observe_original_rollout_read("/original/rollout.jsonl", 9, &bytes, None);
            assert!(observed.metadata.unwrap().original_item_receipt.is_none());
        }
        let mut different = original;
        different["payload"]["content"][0]["text"] = Value::from("different original item");
        let mut observed = ResponseItemEnvelope::new(envelope.item);
        observed.observe_original_rollout_read("/original/rollout.jsonl", 9, &serde_json::to_vec(&different).unwrap(), None);
        assert!(observed.metadata.unwrap().original_item_receipt.is_none());
    }
}
