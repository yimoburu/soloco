//! Authored source-only; no execution receipt is implied.
use super::*;

fn stack(layers: Vec<ConfigLayerEntry>) -> ConfigLayerStack {
    ConfigLayerStack::new(layers, Default::default(), Default::default()).unwrap()
}
async fn original_layer(raw: &str) -> (tempfile::TempDir, ConfigLayerEntry) {
    let dir = tempfile::tempdir().unwrap();
    let file = AbsolutePathBuf::from_absolute_path(dir.path().join("config.toml")).unwrap();
    tokio::fs::write(file.as_path(), raw).await.unwrap();
    let entry = load_config_toml_for_required_layer(&tests::TestFileSystem, &file, false, |config|
        ConfigLayerEntry::new(ConfigLayerSource::User { file:file.clone(),profile:None }, config)).await.unwrap();
    (dir, entry)
}

#[tokio::test]
async fn actual_original_file_loader_retains_bytes_and_exact_toml_token_without_reread() {
    let raw = "developer_instructions = \"actual original \\u03bb\"\n";
    let (dir, entry) = original_layer(raw).await;
    let layers = stack(vec![entry]);
    tokio::fs::write(dir.path().join("config.toml"), "developer_instructions='changed on disk'").await.unwrap();
    let source = layers.original_direct_instruction("developer_instructions", "actual original λ").unwrap();
    assert_eq!(source.original_utf8(), raw);
    let token = source.original_token_range();
    assert_eq!(&raw[token], "\"actual original \\u03bb\"");
    assert!(source.original_occurrence() > 0);
}

#[tokio::test]
async fn public_raw_constructor_and_equal_later_override_never_mint_original_reads() {
    let raw = "base_instructions='same'";
    let (dir, entry) = original_layer(raw).await;
    let file = AbsolutePathBuf::from_absolute_path(dir.path().join("forged.toml")).unwrap();
    let forged = ConfigLayerEntry::new_with_raw_toml(ConfigLayerSource::User { file,profile:None },
        toml::from_str(raw).unwrap(),raw.into(),AbsolutePathBuf::from_absolute_path(dir.path()).unwrap());
    assert!(stack(vec![forged]).original_direct_instruction("base_instructions","same").is_none());
    let override_layer = ConfigLayerEntry::new(ConfigLayerSource::SessionFlags,toml::from_str(raw).unwrap());
    assert!(stack(vec![entry,override_layer]).original_direct_instruction("base_instructions","same").is_none());
}

#[tokio::test]
async fn changed_materialized_layer_cannot_reuse_original_file_receipt() {
    let (_dir, mut entry) = original_layer("base_instructions='original'").await;
    entry.config["base_instructions"] = TomlValue::String("changed".into());
    assert!(stack(vec![entry]).original_direct_instruction("base_instructions","changed").is_none());
}

#[tokio::test]
async fn unresolved_profile_table_remains_held_even_for_equal_direct_field() {
    let raw="base_instructions='same'\n[profiles.custom]\nbase_instructions='same'";
    let (_dir,entry)=original_layer(raw).await;
    assert!(stack(vec![entry]).original_direct_instruction("base_instructions","same").is_none());
}

#[tokio::test]
async fn highest_genuine_original_layer_is_selected_not_a_matching_lower_layer() {
    let (_dir,entry)=original_layer("base_instructions='lower'").await;
    let top=ConfigLayerEntry::new(ConfigLayerSource::SessionFlags,toml::from_str("base_instructions='upper'").unwrap());
    assert!(stack(vec![entry,top]).original_direct_instruction("base_instructions","lower").is_none());
}
