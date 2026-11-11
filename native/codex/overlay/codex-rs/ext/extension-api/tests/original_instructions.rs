use codex_extension_api::Instructions;
use codex_utils_absolute_path::AbsolutePathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT: AtomicU64 = AtomicU64::new(1);

fn path() -> AbsolutePathBuf {
    AbsolutePathBuf::try_from(std::env::temp_dir().join(format!(
        "soloco-original-instructions-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)
    ))).unwrap()
}

#[tokio::test]
async fn actual_read_retains_original_bytes_across_file_change_delete_and_clone() {
    let path = path();
    let original = b"  original\xff instruction \n";
    tokio::fs::write(path.as_path(), original).await.unwrap();
    let loaded = Instructions::read_original_file(path.clone()).await.unwrap().unwrap();
    let record = loaded.original_source_record().unwrap();
    assert_eq!(record["original_file_bytes_sha256"], codex_api::protected_peer::source_bytes_sha256(original));
    assert_eq!(record["original_file_bytes"], original.len());
    assert_eq!(record["decoded_lossy"], true);
    tokio::fs::write(path.as_path(), b"later different bytes").await.unwrap();
    assert_eq!(loaded.original_source_record(), Some(record.clone()));
    tokio::fs::remove_file(path.as_path()).await.unwrap();
    assert_eq!(loaded.clone().original_source_record(), Some(record));
}

#[tokio::test]
async fn generic_source_path_and_changed_materialization_cannot_mint_original_read() {
    let path = path();
    tokio::fs::write(path.as_path(), b"original").await.unwrap();
    let mut loaded = Instructions::read_original_file(path.clone()).await.unwrap().unwrap();
    let generic = Instructions::unattributed(loaded.text.clone(), Some(path.clone()));
    assert_eq!(generic, loaded, "Existing value equality remains unchanged");
    assert!(generic.original_source_record().is_none());
    loaded.text.push_str(" changed");
    assert!(loaded.original_source_record().is_none());
    let mut loaded = Instructions::read_original_file(path.clone()).await.unwrap().unwrap();
    loaded.source = None;
    assert!(loaded.original_source_record().is_none());
    tokio::fs::remove_file(path.as_path()).await.unwrap();
}

#[tokio::test]
async fn absent_and_blank_original_files_do_not_invent_instructions() {
    let path = path();
    assert_eq!(Instructions::read_original_file(path.clone()).await.unwrap_err().kind(), std::io::ErrorKind::NotFound);
    tokio::fs::write(path.as_path(), b" \n\t ").await.unwrap();
    assert!(Instructions::read_original_file(path.clone()).await.unwrap().is_none());
    tokio::fs::remove_file(path.as_path()).await.unwrap();
}
