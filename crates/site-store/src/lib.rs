//! Workspace site navigation storage: one Markdown + YAML file per group and per site under
//! `.marklyra/sites`. The files are the only authority; everything else is derived.
mod frontmatter;
mod model;
mod store;

pub use model::{normalize_url, Group, Site, COLORS};
pub use store::{
    FetchPatch, InvalidFile, ItemsPolicy, Mutation, MutationResult, Result, SiteStore, Snapshot,
    StoreError,
};
