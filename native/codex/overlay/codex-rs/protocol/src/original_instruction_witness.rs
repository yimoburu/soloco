//! Runtime-only data transport for source-owned instruction renderer capsules.
//! This carrier is not an authority: Core validates its private concrete value,
//! actual Session owner, original occurrence and exact rendered bytes.
use std::any::Any;
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct OriginalInstructionWitness(Option<Arc<dyn Any + Send + Sync>>);
impl OriginalInstructionWitness {
    pub fn new<T: Any + Send + Sync>(value: Arc<T>) -> Self { Self(Some(value)) }
    pub fn downcast_ref<T: Any>(&self) -> Option<&T> { self.0.as_deref()?.downcast_ref() }
    pub fn is_present(&self) -> bool { self.0.is_some() }
}
impl std::fmt::Debug for OriginalInstructionWitness {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalInstructionWitness").field("present", &self.is_present()).finish_non_exhaustive()
    }
}
// Runtime evidence never changes persisted/model-facing value equality.
impl PartialEq for OriginalInstructionWitness { fn eq(&self, _: &Self) -> bool { true } }
impl Eq for OriginalInstructionWitness {}
