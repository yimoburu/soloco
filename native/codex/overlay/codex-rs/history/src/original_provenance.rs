//! Runtime-only observations made before history truncation and prompt projection.
//! These types deliberately have no Deserialize implementation. Persisted metadata,
//! client JSON and a matching semantic hash cannot manufacture an original receipt.
use crate::{ResponseItemEnvelope, RolloutItem};
use codex_protocol::models::ResponseItem;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};

const MAX_ORIGINAL_BYTES: usize = 4_000_000;
static NEXT_OCCURRENCE: AtomicU64 = AtomicU64::new(1);

/// Runtime-only transport for a producer's private typed witness. The carrier
/// itself is not authority: the original consumer must downcast its private
/// type and verify the actual owning Session. Persisted JSON cannot restore it.
#[derive(Clone)]
pub struct OriginalProducerWitness(Arc<dyn std::any::Any + Send + Sync>);

impl OriginalProducerWitness {
    pub fn new<T: std::any::Any + Send + Sync>(value: Arc<T>) -> Self { Self(value) }
    pub fn downcast_ref<T: std::any::Any>(&self) -> Option<&T> { self.0.downcast_ref() }
}
impl std::fmt::Debug for OriginalProducerWitness {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalProducerWitness").finish_non_exhaustive()
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct OriginalItemReceipt {
    occurrence: u64,
    materialized: Arc<[u8]>,
    projected: Arc<[u8]>,
    read: Option<OriginalRolloutRead>,
    user_input: Option<Arc<[u8]>>,
}

#[derive(Clone, PartialEq, Eq)]
struct OriginalRolloutRead {
    path: String,
    line: usize,
    bytes: Arc<[u8]>,
    thread_metadata: Option<Arc<[u8]>>,
    thread_id: Option<String>,
}

impl std::fmt::Debug for OriginalItemReceipt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalItemReceipt").field("occurrence", &self.occurrence)
            .field("materialized_bytes", &self.materialized.len())
            .field("projected_bytes", &self.projected.len())
            .field("restored_original_read", &self.read.is_some()).finish()
    }
}

impl OriginalItemReceipt {
    fn materialize(item: &ResponseItem) -> Option<Self> {
        let bytes = serde_json::to_vec(item).ok()?;
        if bytes.len() > MAX_ORIGINAL_BYTES { return None; }
        let occurrence = NEXT_OCCURRENCE.fetch_update(Ordering::Relaxed, Ordering::Relaxed,
            |value| value.checked_add(1)).ok()?;
        let bytes: Arc<[u8]> = bytes.into();
        Some(Self { occurrence, materialized: bytes.clone(), projected: bytes, read: None, user_input: None })
    }
    pub fn occurrence(&self) -> u64 { self.occurrence }
    pub fn original_materialized_bytes(&self) -> &[u8] { &self.materialized }
    pub fn projected_bytes(&self) -> &[u8] { &self.projected }
    pub fn original_read(&self) -> Option<(&str, usize, &[u8])> {
        self.read.as_ref().map(|read| (read.path.as_str(), read.line, read.bytes.as_ref()))
    }
    pub fn original_thread_metadata_bytes(&self) -> Option<&[u8]> {
        self.read.as_ref()?.thread_metadata.as_deref()
    }
    pub fn original_thread_id(&self) -> Option<&str> {
        self.read.as_ref()?.thread_id.as_deref()
    }
    pub fn original_user_input_bytes(&self) -> Option<&[u8]> { self.user_input.as_deref() }
}

impl ResponseItemEnvelope {
    /// The original live history producer calls this BEFORE truncation. Replay
    /// never calls it: otherwise old JSON would become a new live observation.
    pub fn observe_original_materialization(&mut self) {
        let retain = self.metadata.as_ref().and_then(|metadata|metadata.original_item_receipt.as_ref())
            .filter(|receipt|receipt.user_input.is_some())
            .is_some_and(|receipt|serde_json::to_vec(&self.item).is_ok_and(|bytes|bytes.as_slice()==receipt.original_materialized_bytes()));
        if !retain {
            self.metadata.get_or_insert_default().original_item_receipt =
                OriginalItemReceipt::materialize(&self.item).map(Arc::new);
        }
    }

    /// Original accepted UserInput -> ResponseItem materialization. The actual
    /// source handler calls this before image/history transformations. No role,
    /// path, or receipt-shaped metadata is accepted as a source claim.
    pub fn observe_original_user_input(&mut self, input: &[codex_protocol::user_input::UserInput]) {
        use codex_protocol::models::{LocalImagePreparation, ResponseInputItem};
        use codex_protocol::user_input::UserInput;
        self.metadata.get_or_insert_default().original_item_receipt = None;
        // The existing converter reads local image/audio files even with
        // LocalImagePreparation::Defer. Re-running it would be a second read,
        // not the original materialization. Keep unsupported media/extension
        // inputs Held until their actual producer supplies a retained cut.
        if !input.iter().all(|item|matches!(item,
            UserInput::Text { .. } | UserInput::Image { .. } | UserInput::Audio { .. })) { return; }
        let Ok(bytes) = serde_json::to_vec(input) else { return; };
        if bytes.len() > MAX_ORIGINAL_BYTES { return; }
        let expected = ResponseItem::from(ResponseInputItem::from_user_input(input.to_vec(),
            LocalImagePreparation::Defer, &mut std::collections::HashMap::new()));
        let agrees = matches!((&expected, &self.item),
            (ResponseItem::Message { role: expected_role, content: expected_content, .. },
             ResponseItem::Message { role, content, .. })
            if role == "user" && role == expected_role && content == expected_content);
        if !agrees { return; }
        if let Some(mut receipt) = OriginalItemReceipt::materialize(&self.item) {
            receipt.user_input = Some(bytes.into());
            self.metadata.get_or_insert_default().original_item_receipt = Some(Arc::new(receipt));
        }
    }

    /// Called with the bytes already returned by the ORIGINAL rollout reader.
    /// It validates the exact decoded item; it never opens a file or trusts
    /// receipt-shaped JSON from the persisted metadata.
    pub fn observe_original_rollout_read(&mut self, path: &str, line: usize,
        original: &[u8], original_thread_metadata: Option<&[u8]>) {
        self.metadata.get_or_insert_default().original_item_receipt = None;
        if original.len() > MAX_ORIGINAL_BYTES { return; }
        let Ok(decoded) = crate::parse_rollout_line_bytes(original) else { return; };
        let RolloutItem::ResponseItem(decoded) = decoded.item else { return; };
        if decoded.item != self.item { return; }
        let thread_metadata = original_thread_metadata.filter(|bytes| {
            bytes.len() <= MAX_ORIGINAL_BYTES && crate::parse_rollout_line_bytes(bytes)
                .is_ok_and(|line| matches!(line.item, RolloutItem::SessionMeta(_)))
        }).map(Arc::from);
        let thread_id = thread_metadata.as_deref().and_then(|bytes| {
            match crate::parse_rollout_line_bytes(bytes).ok()?.item {
                RolloutItem::SessionMeta(meta) => Some(meta.meta.id.to_string()),
                _ => None,
            }
        });
        if let Some(mut receipt) = OriginalItemReceipt::materialize(&self.item) {
            receipt.read = Some(OriginalRolloutRead { path: path.into(), line,
                bytes: Arc::from(original), thread_metadata, thread_id });
            self.metadata.get_or_insert_default().original_item_receipt = Some(Arc::new(receipt));
        }
    }

    /// Original normalization/image materialization calls this once it has
    /// produced the actual prompt item. Later mutations cannot reuse this cut.
    pub fn observe_original_prompt_projection(&mut self) {
        let bytes = match serde_json::to_vec(&self.item) {
            Ok(bytes) if bytes.len() <= MAX_ORIGINAL_BYTES => bytes,
            _ => {
                if let Some(metadata) = &mut self.metadata { metadata.original_item_receipt = None; }
                return;
            }
        };
        if let Some(receipt) = self.metadata.as_mut().and_then(|m| m.original_item_receipt.as_mut()) {
            Arc::make_mut(receipt).projected = bytes.into();
        }
    }
}

#[derive(Debug, Clone)]
pub struct OriginalInputSpan {
    index: usize,
    start: usize,
    end: usize,
    receipt: Option<Arc<OriginalItemReceipt>>,
    instruction: bool,
    user: bool,
}
impl OriginalInputSpan {
    pub fn index(&self) -> usize { self.index }
    pub fn byte_range(&self) -> (usize, usize) { (self.start, self.end) }
    pub fn receipt(&self) -> Option<&OriginalItemReceipt> { self.receipt.as_deref() }
    pub fn instruction(&self) -> bool { self.instruction }
    pub fn user(&self) -> bool { self.user }
}

/// Exact original sampling serialization and occurrence-preserving item spans.
/// Its constructor requires runtime-only receipts; there is no readiness flag.
#[derive(Clone)]
pub struct OriginalInputCapture {
    bytes: Arc<[u8]>,
    spans: Vec<OriginalInputSpan>,
    complete: bool,
}
impl std::fmt::Debug for OriginalInputCapture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalInputCapture").field("bytes", &self.bytes.len())
            .field("spans", &self.spans.len()).field("complete", &self.complete).finish()
    }
}
impl OriginalInputCapture {
    pub fn from_original_projection(envelopes: &[ResponseItemEnvelope], input: &[ResponseItem]) -> Option<Self> {
        let bytes = serde_json::to_vec(input).ok()?;
        if bytes.len() > MAX_ORIGINAL_BYTES { return None; }
        let mut complete = envelopes.len() == input.len();
        let mut start = 1;
        let mut occurrences = std::collections::HashSet::new();
        let mut spans = Vec::with_capacity(input.len());
        for (index, item) in input.iter().enumerate() {
            let rendered = serde_json::to_vec(item).ok()?;
            let end = start + rendered.len();
            if bytes.get(start..end) != Some(rendered.as_slice()) { return None; }
            let receipt = envelopes.get(index).and_then(|e| e.metadata.as_ref())
                .and_then(|m| m.original_item_receipt.as_ref())
                .filter(|r| r.projected_bytes() == rendered.as_slice()).cloned();
            complete &= receipt.as_ref().is_some_and(|receipt| occurrences.insert(receipt.occurrence()));
            spans.push(OriginalInputSpan { index, start, end, receipt,
                instruction: matches!(item, ResponseItem::Message { role, .. } if role == "developer" || role == "system"),
                user: matches!(item, ResponseItem::Message { role, .. } if role == "user") });
            start = end + 1;
        }
        if (input.is_empty() && bytes.as_slice() != b"[]") || (!input.is_empty() && start != bytes.len()) { return None; }
        Some(Self { bytes: bytes.into(), spans, complete })
    }
    pub fn serialized_input(&self) -> &[u8] { &self.bytes }
    pub fn spans(&self) -> &[OriginalInputSpan] { &self.spans }
    pub fn complete(&self) -> bool { self.complete }
    pub fn live_user_input_chain_unknown(&self) -> bool {
        self.spans.iter().any(|span|span.user && span.receipt().is_some_and(|receipt|
            receipt.read.is_none() && receipt.original_user_input_bytes().is_none()))
    }
    pub fn restored_upstream_chain_unknown(&self) -> bool {
        self.spans.iter().any(|span|span.receipt().is_some_and(|receipt|receipt.read.is_some()))
    }
    /// A container read proves the consumed restored bytes, not an old
    /// instruction's unavailable upstream loader ancestry.
    pub fn restored_instruction_ancestry_unknown(&self) -> bool {
        self.spans.iter().any(|s| s.instruction && s.receipt().is_some_and(|r| r.read.is_some()))
    }
    pub fn restored_thread_metadata_unknown(&self) -> bool {
        self.spans.iter().any(|span| span.receipt().is_some_and(|receipt|
            receipt.read.is_some() && (receipt.original_thread_metadata_bytes().is_none() || receipt.original_thread_id().is_none())))
    }
}

#[cfg(test)]
mod tests;
