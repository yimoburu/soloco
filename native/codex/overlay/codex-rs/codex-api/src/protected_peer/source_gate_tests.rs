//! Controlled source scheduling cases, no native transport/auth/model operation.
use super::*;
#[tokio::test]
async fn cancelled_sender_cannot_be_overtaken_by_already_queued_sender() {
    let unknown=AtomicBool::new(false);let mutex=tokio::sync::Mutex::new(());
    let owned=mutex.lock().await;let a=OperationGuard {armed:true,unknown:&unknown};
    let entered=tokio::sync::Notify::new();let started=AtomicBool::new(false);
    let queued=async {
        ensure_known(&unknown)?;entered.notify_one();
        let _original=lock_original_known(&mutex,&unknown).await?;
        started.store(true,Ordering::SeqCst);Ok::<(),TransportError>(())
    };
    let cancelled=async { entered.notified().await;drop(a);drop(owned); };
    let (result,())=tokio::join!(queued,cancelled);
    assert!(result.is_err());assert!(!started.load(Ordering::SeqCst));
}
#[tokio::test]
async fn cancellation_during_awaited_permit_prevents_transport_poll() {
    let unknown=AtomicBool::new(false);let entered=tokio::sync::Notify::new();let released=tokio::sync::Notify::new();
    let started=AtomicBool::new(false);let a=OperationGuard {armed:true,unknown:&unknown};
    let waiting=async {
        let result=await_original_known(&unknown,async {entered.notify_one();released.notified().await;}).await;
        if result.is_ok() {started.store(true,Ordering::SeqCst);}result
    };
    let cancelled=async {entered.notified().await;drop(a);released.notify_one();};
    let (result,())=tokio::join!(waiting,cancelled);
    assert!(result.is_err());assert!(!started.load(Ordering::SeqCst));
}
