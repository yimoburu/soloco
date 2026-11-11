//! Original typed Session admission ownership. The owner and witness types are
//! private to Core; envelope/JSON metadata and generic history producers cannot
//! issue an acceptance for an actual Session.

use std::sync::{Arc, Weak};

use codex_api::protected_peer::{OriginalAcceptedInputWitness, OriginalSessionInputProjection};
use codex_history::{OriginalInputCapture, OriginalProducerWitness, ResponseItemEnvelope};
use codex_protocol::user_input::UserInput;

use super::session::Session;

/// Compare only the actual runtime Arc. No caller can construct a replacement
/// through a protocol, extension, envelope, source label or serialized field.
#[derive(Debug)]
pub(crate) struct OriginalSessionOwner { _private: () }

pub(super) struct SessionIngress {
    owner: Arc<OriginalSessionOwner>,
    original: codex_api::protected_peer::OriginalSessionIngress,
    admission: tokio::sync::Mutex<()>,
}

struct AcceptedCoreInput {
    owner: Weak<OriginalSessionOwner>,
    original: OriginalAcceptedInputWitness,
}

impl SessionIngress {
    pub(super) fn new(client: &crate::client::ModelClient) -> Self {
        let owner = Arc::new(OriginalSessionOwner { _private: () });
        Self {
            original: client.original_session_ingress(owner.clone()),
            owner,
            admission: tokio::sync::Mutex::new(()),
        }
    }

    pub(super) async fn observe_accepted(&self, order: u64, input: &[UserInput]) {
        let _ = self.original.observe_accepted_input(order, input).await;
    }

    pub(super) async fn bind_materialization(&self, order: Option<u64>, input: &[UserInput], envelope: &mut ResponseItemEnvelope) {
        // Never rebuild a private witness from serialized order/UUID fields.
        envelope.metadata.get_or_insert_default().original_session_ingress = None;
        let Some(order) = order else { return; };
        let receipt = envelope.metadata.as_ref().and_then(|metadata|
            metadata.original_item_receipt.as_ref()).cloned();
        let Some(receipt) = receipt else {
            // Release only this exact unmaterialized pending record. This
            // creates no witness and cannot clear its missing-origin HOLD.
            let _ = self.original.discard_unmaterialized_admission(order, input).await;
            return;
        };
        let Some(original) = self.original.bind_accepted_materialization(order, input, &receipt).await else { return; };
        envelope.metadata.get_or_insert_default().original_session_ingress = Some(
            OriginalProducerWitness::new(Arc::new(AcceptedCoreInput {
                owner: Arc::downgrade(&self.owner), original,
            })));
    }

    #[cfg(test)]
    fn seal(&self, capture: &OriginalInputCapture, envelopes: &[ResponseItemEnvelope]) -> Option<OriginalSessionInputProjection> {
        let mut accepted = Vec::new();
        for span in capture.spans().iter().filter(|span|span.user()) {
            let witness = envelopes.get(span.index())?.metadata.as_ref()?
                .original_session_ingress.as_ref()?.downcast_ref::<AcceptedCoreInput>()?;
            if !Arc::ptr_eq(&self.owner, &witness.owner.upgrade()?) { return None; }
            accepted.push((span.index(), witness.original.clone()));
        }
        self.original.seal_original_projection(capture, &accepted)
    }

    fn seal_mixed(&self, session: &Session, capture: &OriginalInputCapture,
        envelopes: &[ResponseItemEnvelope]) -> Option<OriginalSessionInputProjection> {
        if !Arc::ptr_eq(&self.owner, session.original_provenance_owner()) { return None; }
        let mut accepted = Vec::new();
        let mut generated = Vec::new();
        for span in capture.spans() {
            let envelope = envelopes.get(span.index())?;
            if let Some(witness) = envelope.metadata.as_ref().and_then(|metadata|
                metadata.original_session_ingress.as_ref()).and_then(|witness|
                witness.downcast_ref::<AcceptedCoreInput>()) {
                if !span.user() || !Arc::ptr_eq(&self.owner, &witness.owner.upgrade()?) { return None; }
                accepted.push((span.index(), witness.original.clone()));
                continue;
            }
            // Only this concrete Core validator can construct the typed value.
            // JSON source facts and a generic envelope never select authority.
            let rendering = crate::original_instruction_renderer::validate_history_renderer(session, envelope)?;
            let receipt = span.receipt()?;
            if rendering.occurrence() != receipt.occurrence()
                || rendering.materialized_bytes() != receipt.original_materialized_bytes() {
                return None;
            }
            let original = self.original.bind_original_generated_materialization(receipt, rendering.source_facts())?;
            generated.push((span.index(), original));
        }
        self.original.seal_original_mixed_projection(capture, &accepted, &generated)
    }
}

impl Session {
    /// Called only at actual SubmittedTurnInput::UserInput admission. Recording
    /// a synthesized review item, restoring metadata, or injecting a raw
    /// ResponseItem never calls this issuer.
    pub(super) async fn reserve_original_user_input_order(&self, input: &[UserInput]) -> u64 {
        if !codex_api::protected_peer::enabled() { return self.reserve_user_input_order().await; }
        // Keep the original queue's accepted order and issuer observation in
        // one source-owned sequence, including concurrent steering requests.
        let _admission = self.original_ingress.admission.lock().await;
        let order = self.reserve_user_input_order().await;
        self.original_ingress.observe_accepted(order, input).await;
        order
    }

    pub(crate) fn original_provenance_owner(&self) -> &Arc<OriginalSessionOwner> {
        &self.original_ingress.owner
    }

    pub(crate) fn seal_original_session_input(&self, capture: &OriginalInputCapture, envelopes: &[ResponseItemEnvelope])
        -> Option<OriginalSessionInputProjection> {
        self.original_ingress.seal_mixed(self, capture, envelopes)
    }
}

#[cfg(test)]
mod tests;
