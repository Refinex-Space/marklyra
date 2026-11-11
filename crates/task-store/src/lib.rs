//! Workspace task storage: Markdown + YAML frontmatter files under `.marklyra/tasks`.
//! The files are the only authority; everything else is derived and rebuildable.
pub mod cli;
mod frontmatter;
pub mod import;
pub mod mcp;
mod model;
pub mod query;
mod store;
pub mod tools;

pub use model::{
    builtin_statuses, Category, Comment, Cycle, CycleSummary, Dictionary, Project, Settings,
    Status, Task, Template, View, PRIORITIES,
};
pub use store::{
    new_id, now_iso, revision, valid_key, Detail, Draft, InvalidFile, Mutation, MutationResult,
    Result, Snapshot, StoreError, TaskStore,
};
