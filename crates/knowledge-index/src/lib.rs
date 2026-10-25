//! Derived, rebuildable knowledge index. User Markdown is the only relationship authority.
mod parse;
mod resolve;
mod service;
mod store;
pub use parse::{fingerprint, parse, AnchorLocation, Parsed, Reference};
pub use resolve::{Catalog, Resolution};
pub use service::*;
pub use store::*;
