//! Dynamic-tool handlers finish their item lifecycle when cancellation is signalled.

use super::*;
use crate::state::ActiveTurn;
use codex_protocol::protocol::Event;
use codex_protocol::protocol::EventMsg;
use pretty_assertions::assert_eq;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

// AUTHORED_UNRUN Source witness through the ACTUAL SDK handler/converter. This
// creates no Session, child, protected issuer, company admission or Native QA.
#[test]
fn bootstrap_readonly3_materializes_the_literal_responses_catalogue() {
    let resource:Value=serde_json::from_slice(include_bytes!(
        "../../../../codex-api/src/protected_peer/bootstrap_membership_readonly3_contract_v1.json"
    )).unwrap();
    let mut actual=Vec::new();
    for input in resource["tools"].as_array().unwrap() {
        let spec:codex_protocol::dynamic_tools::DynamicToolSpec=serde_json::from_value(input.clone()).unwrap();
        let codex_protocol::dynamic_tools::DynamicToolSpec::Function(tool)=spec else {panic!("fixed bootstrap function required");};
        let handler=DynamicToolHandler::new(&tool).expect("actual fixed bootstrap SDK conversion");
        actual.push(serde_json::to_value(handler.spec()).unwrap());
    }
    let description="Private bootstrap membership context protocol; identity and authority are supplied only by the original protected composition.";
    assert_eq!(Value::Array(actual),json!([
        {"type":"function","name":"soloco_context_header","description":description,"strict":false,
            "parameters":{"type":"object","properties":{},"required":[],"additionalProperties":false}},
        {"type":"function","name":"soloco_context_read","description":description,"strict":false,
            "parameters":{"type":"object","properties":{"sha256":{"type":"string"},"offset":{"type":"integer"},"length":{"type":"integer"}},"required":["sha256","offset","length"],"additionalProperties":false}},
        {"type":"function","name":"soloco_context_submit","description":description,"strict":false,
            "parameters":{"type":"object","properties":{"sha256":{"type":"string"},"content":{"type":"string"}},"required":["sha256","content"],"additionalProperties":false}}
    ]));
    assert_eq!(resource["tools"][1]["inputSchema"]["properties"]["length"],json!({"type":"integer","minimum":1,"maximum":4096}));
}

async fn next_item(receiver: &async_channel::Receiver<Event>) -> DynamicToolCallItem {
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let item = match receiver.recv().await.expect("event channel open").msg {
                EventMsg::ItemStarted(event) => event.item,
                EventMsg::ItemCompleted(event) => event.item,
                _ => continue,
            };
            if let TurnItem::DynamicToolCall(item) = item {
                return item;
            }
        }
    })
    .await
    .expect("dynamic tool item should be emitted")
}

#[tokio::test]
async fn response_cancel_race_completes_once() {
    let (session, turn, receiver) = crate::session::tests::make_session_and_context_with_rx().await;
    *session.active_turn.lock().await = Some(ActiveTurn::default());
    let cancellation = CancellationToken::new();
    let lifecycle = tokio::spawn({
        let session = Arc::clone(&session);
        let cancellation = cancellation.clone();
        async move {
            request_dynamic_tool(
                &session,
                &turn,
                "call-1".to_string(),
                ToolName::plain("gate"),
                json!({}),
                cancellation,None,
            )
            .await
        }
    });
    next_item(&receiver).await;
    let response = DynamicToolResponse {
        content_items: Vec::new(),
        success: true,
    };
    session
        .notify_dynamic_tool_response("call-1", response.clone())
        .await;
    cancellation.cancel();
    let result = lifecycle.await.expect("lifecycle joined");
    assert!(result.is_none() || result == Some(response));
    let item = next_item(&receiver).await;
    assert_eq!(
        (item.status, item.success, item.error),
        if result.is_some() {
            (DynamicToolCallStatus::Completed, Some(true), None)
        } else {
            (
                DynamicToolCallStatus::Failed,
                Some(false),
                Some("dynamic tool call was cancelled before receiving a response".to_string()),
            )
        }
    );
    while let Ok(event) = receiver.try_recv() {
        assert!(!matches!(event.msg, EventMsg::ItemCompleted(_)));
    }
}
