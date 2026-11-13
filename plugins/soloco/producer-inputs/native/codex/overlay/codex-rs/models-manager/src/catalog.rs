//! Tracks the source of model metadata without changing the catalog wire or cache formats.

use std::borrow::Cow;
use std::collections::HashSet;
use std::sync::Arc;

use codex_protocol::openai_models::ModelInfo;

use crate::cache::ModelsCacheEntry;
use crate::original_provenance::OriginalCatalogCapture;
use crate::original_provenance::OriginalCatalogOwner;

pub use codex_protocol::openai_models::CatalogModel;
pub use codex_protocol::openai_models::ModelOrigin;

/// Catalog authority is independent of whether its model metadata is borrowed or owned.
pub(crate) enum SelectedCatalog<'a> {
    CurrentSnapshot(Cow<'a, [ModelInfo]>),
    Fallback(Cow<'a, [ModelInfo]>, Option<OriginalCatalogCapture>),
}

impl<'a> SelectedCatalog<'a> {
    pub fn into_models(self) -> Cow<'a, [ModelInfo]> {
        match self {
            Self::CurrentSnapshot(models) | Self::Fallback(models, _) => models,
        }
    }
}

/// The effective catalog and the IDs in the unmerged provider response share one lock.
#[derive(Debug)]
pub(crate) struct CatalogState {
    pub entry: ModelsCacheEntry,
    pub provider_model_ids: HashSet<String>,
    original: Option<OriginalCatalogCapture>,
    bundled_original: Option<OriginalCatalogCapture>,
    owner: Option<Arc<OriginalCatalogOwner>>,
}

impl CatalogState {
    pub fn bundled(entry: ModelsCacheEntry) -> Self {
        Self {
            entry,
            provider_model_ids: HashSet::new(),
            original: None,
            bundled_original: None,
            owner: None,
        }
    }

    pub fn provider(entry: ModelsCacheEntry) -> Self {
        // Capture raw response IDs before merging, including when loading from disk cache.
        let provider_model_ids = entry
            .models
            .iter()
            .map(|model| model.slug.clone())
            .collect();
        Self {
            entry,
            provider_model_ids,
            original: None,
            bundled_original: None,
            owner: None,
        }
    }

    pub fn with_original(mut self, original: Option<OriginalCatalogCapture>) -> Self {
        self.original = original.filter(|source| source.matches_catalog(&self.entry.models));
        self
    }

    pub fn with_owner(mut self, owner: Arc<OriginalCatalogOwner>) -> Self {
        owner.select_response(self.original.as_ref());
        self.owner = Some(owner);
        self
    }

    pub fn retain_bundled_original(&mut self, original: OriginalCatalogCapture) {
        self.bundled_original = Some(original);
    }

    pub fn clear_original(&mut self) {
        self.original = None;
        self.bundled_original = None;
        if let Some(owner) = &self.owner {
            owner.select_response(None);
        }
    }

    pub fn materialize_model(
        &self,
        selected: &SelectedCatalog<'_>,
        model: ModelInfo,
    ) -> CatalogModel {
        let catalog = CatalogModel {
            origin: self.model_origin(selected, &model.slug),
            model: model.clone().into(),
        };
        let source = match selected {
            SelectedCatalog::Fallback(_, original) => original.as_ref(),
            SelectedCatalog::CurrentSnapshot(_) if catalog.origin == ModelOrigin::Provider => {
                self.original.as_ref()
            }
            SelectedCatalog::CurrentSnapshot(_) => {
                self.bundled_original.as_ref().or(self.original.as_ref())
            }
        };
        if let Some(source) = source {
            source.bind_model(&catalog, &model, self.owner.as_ref());
        }
        catalog
    }

    pub fn model_origin(&self, selected: &SelectedCatalog<'_>, slug: &str) -> ModelOrigin {
        if matches!(selected, SelectedCatalog::CurrentSnapshot(_))
            && self.provider_model_ids.contains(slug)
        {
            ModelOrigin::Provider
        } else {
            ModelOrigin::Bundled
        }
    }

    pub fn model_catalog(&self, selected: SelectedCatalog<'_>) -> Vec<CatalogModel> {
        let models = match &selected {
            SelectedCatalog::CurrentSnapshot(models) | SelectedCatalog::Fallback(models, _) => models,
        };
        models
            .iter()
            .map(|model| self.materialize_model(&selected, model.clone()))
            .collect()
    }
}
