//! AUTHORED_UNRUN. Generic carrier tests confer no original decoder authority.
use super::*;
use serde_json::json;
fn response()->DynamicToolResponse {DynamicToolResponse{content_items:Vec::new(),success:false}}
#[test]
fn only_the_original_pending_owner_can_claim_once() {
    let owner:Arc<Owner>=Arc::new("owner");let foreign:Arc<Owner>=Arc::new("foreign");
    let token=OriginalDynamicExchange::for_original_invocation(owner.clone());let value=response();
    token.retain_original_decoder_result(&value,Arc::new(json!({"data":"not proof"})));
    assert!(token.claim_return(&foreign,&value).is_none());
    let first=token.claim_return(&owner,&value).unwrap();assert!(first.still_original(&owner));
    assert!(token.clone().claim_return(&owner,&value).is_none());assert!(!first.still_original(&owner));
}
#[test]
fn another_pending_token_cannot_complete_this_one() {
    let owner:Arc<Owner>=Arc::new("owner");let left=OriginalDynamicExchange::for_original_invocation(owner.clone());
    let right=OriginalDynamicExchange::for_original_invocation(owner.clone());
    left.retain_original_decoder_result(&response(),Arc::new(42u32));
    assert!(right.claim_return(&owner,&response()).is_none());assert_ne!(left,right);
}
#[test]
fn changed_response_and_repeated_completion_poison_the_original_exchange() {
    let owner:Arc<Owner>=Arc::new("owner");let token=OriginalDynamicExchange::for_original_invocation(owner.clone());
    token.retain_original_decoder_result(&response(),Arc::new(1u32));
    let mut changed=response();changed.success=true;assert!(token.claim_return(&owner,&changed).is_none());
    token.retain_original_decoder_result(&response(),Arc::new(1u32));assert!(token.claim_return(&owner,&response()).is_none());
}
#[test]
fn closed_owner_and_unresolved_exchange_cannot_become_returned() {
    let owner:Arc<Owner>=Arc::new("owner");let token=OriginalDynamicExchange::for_original_invocation(owner.clone());
    token.observe_unresolved();token.retain_original_decoder_result(&response(),Arc::new(true));
    assert!(token.claim_return(&owner,&response()).is_none());drop(owner);
    let other:Arc<Owner>=Arc::new("owner");assert!(token.claim_return(&other,&response()).is_none());
}
