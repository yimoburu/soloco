//! Per-invocation runtime carrier. The opaque value is not authority: Core must
//! downcast the API's private original decoder proof and verify the actual owner.
//! No writer/decoder issuer or capability is serialized on a public event.
use super::DynamicToolResponse;
use std::sync::{Arc,Weak,Mutex};
type Owner=dyn std::any::Any+Send+Sync;
struct Exchange {owner:Weak<Owner>,state:Mutex<State>}
enum State {Pending,Returned{decoded:Arc<[u8]>,witness:Arc<Owner>},Claimed{witness:Arc<Owner>},Unknown}
#[derive(Clone)]
pub struct OriginalDynamicExchange(Arc<Exchange>);
impl std::fmt::Debug for OriginalDynamicExchange {
    fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {f.debug_struct("OriginalDynamicExchange").finish_non_exhaustive()}
}
impl PartialEq for OriginalDynamicExchange {fn eq(&self,other:&Self)->bool {Arc::ptr_eq(&self.0,&other.0)}}
#[derive(Clone)]
pub struct OriginalDynamicExchangeIdentity(Weak<Exchange>);
impl OriginalDynamicExchangeIdentity {
    pub fn matches(&self,exchange:&OriginalDynamicExchange)->bool {self.0.ptr_eq(&Arc::downgrade(&exchange.0))}
}
impl OriginalDynamicExchange {
    pub fn identity(&self)->OriginalDynamicExchangeIdentity {OriginalDynamicExchangeIdentity(Arc::downgrade(&self.0))}
    /// A different allocation cannot complete the actual handler's pending call.
    /// Creating/forwarding a token alone never proves an original decoder ran.
    pub fn for_original_invocation(owner:Arc<Owner>)->Self {
        Self(Arc::new(Exchange{owner:Arc::downgrade(&owner),state:Mutex::new(State::Pending)}))
    }
    /// Generic carrier only. Supplied JSON/booleans/arbitrary Any cannot pass
    /// the consumer's concrete private original-decoder downcast.
    pub fn retain_original_decoder_result(&self,response:&DynamicToolResponse,witness:Arc<Owner>) {
        let decoded=serde_json::to_vec(response).ok().filter(|b|b.len()<=4_000_000);
        let Ok(mut state)=self.0.state.lock() else{return;};
        if !matches!(*state,State::Pending) {*state=State::Unknown;return;}
        *state=match decoded {Some(decoded)=>State::Returned{decoded:decoded.into(),witness},None=>State::Unknown};
    }
    pub fn observe_unresolved(&self) {if let Ok(mut state)=self.0.state.lock(){*state=State::Unknown;}}
    pub fn claim_return(&self,owner:&Arc<Owner>,response:&DynamicToolResponse)->Option<OriginalDynamicReturn> {
        if !self.0.owner.upgrade().is_some_and(|actual|Arc::ptr_eq(&actual,owner)){return None;}
        let bytes=serde_json::to_vec(response).ok()?;
        let mut state=self.0.state.lock().ok()?;
        match std::mem::replace(&mut *state,State::Unknown) {
            State::Returned{decoded,witness} if decoded.as_ref()==bytes.as_slice()=>{
                *state=State::Claimed{witness:Arc::clone(&witness)};
                Some(OriginalDynamicReturn{exchange:self.clone(),witness})
            },_=>None,
        }
    }
}
#[derive(Clone)]
pub struct OriginalDynamicReturn {exchange:OriginalDynamicExchange,witness:Arc<Owner>}
impl std::fmt::Debug for OriginalDynamicReturn {
    fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {f.debug_struct("OriginalDynamicReturn").finish_non_exhaustive()}
}
impl OriginalDynamicReturn {
    pub fn still_original(&self,owner:&Arc<Owner>)->bool {
        self.exchange.0.owner.upgrade().is_some_and(|actual|Arc::ptr_eq(&actual,owner))
            && self.exchange.0.state.lock().is_ok_and(|state|matches!(&*state,State::Claimed{witness} if Arc::ptr_eq(witness,&self.witness)))
    }
    pub fn exchange(&self)->&OriginalDynamicExchange {&self.exchange}
    pub fn witness<T:std::any::Any>(&self)->Option<&T> {self.witness.downcast_ref()}
}
#[cfg(test)]
#[path="original_exchange_tests.rs"]
mod tests;
