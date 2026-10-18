use super::*;
use cap_std::{ambient_authority, fs::Dir};
use std::{fs, path::Path};

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;

#[test]
fn ordinary_file_move_retains_an_existing_root_but_never_extends_it_outside() {
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    let root = top.join("workspace");
    for path in [
        root.join("left"),
        root.join("right"),
        root.join("images"),
        top.join("outside"),
    ] {
        fs::create_dir_all(path).unwrap();
    }
    fs::write(root.join("images/image.svg"), SVG).unwrap();
    fs::write(root.join("left/image.svg"), SVG).unwrap();
    let other = br#"<svg xmlns="http://www.w3.org/2000/svg" width="2"/>"#;
    fs::write(root.join("right/image.svg"), other).unwrap();
    let scope = ImageScope::workspace(cap(&root), cap(&root.join("left")), Path::new("left"))
        .unwrap()
        .with_logical_root(&root)
        .unwrap();
    let mut registry = ImageRegistry::default();
    let old = registry
        .resolve("doc", &scope, "../images/image.svg")
        .unwrap();
    let old_local = registry.resolve("doc", &scope, "image.svg").unwrap();
    let plan = scope
        .prepare_authorized_file_move(
            &cap(&root.join("left")),
            &root.join("left/A.md"),
            cap(&root.join("right")),
            &root.join("right/A.md"),
        )
        .unwrap();
    let paths = registry.prepare_retarget("doc", &plan);
    let moved = plan.commit();
    paths.commit(&mut registry);
    let next = registry
        .resolve("doc", &moved, "../images/image.svg")
        .unwrap();
    assert_ne!(old.token, next.token);
    assert!(registry.get(&old.token).is_some());
    let new_local = registry.resolve("doc", &moved, "image.svg").unwrap();
    assert_ne!(old_local.token, new_local.token);
    assert_eq!(
        registry.get(&new_local.token).unwrap().bytes.as_ref(),
        other
    );
    registry
        .import_bytes("doc", &moved, "image.svg", SVG.to_vec())
        .unwrap();
    assert!(root.join("right/assets").exists());
    assert!(!root.join("left/assets").exists());
    let legacy = scope
        .prepare_file_move(
            &cap(&root.join("left")),
            &root.join("left/A.md"),
            &root.join("right/A.md"),
        )
        .unwrap()
        .commit();
    assert!(registry
        .resolve("legacy", &legacy, "../images/image.svg")
        .is_err());
    let outside = scope
        .prepare_authorized_file_move(
            &cap(&root.join("left")),
            &root.join("left/A.md"),
            cap(&top.join("outside")),
            &top.join("outside/A.md"),
        )
        .unwrap()
        .commit();
    assert!(registry
        .resolve("outside", &outside, "../workspace/images/image.svg")
        .is_err());
}

fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, ambient_authority()).unwrap())
}

#[test]
fn all_scope_relations_rebase_cache_paths_without_widening_capabilities() {
    for relation in ["above", "equal", "inside"] {
        let temporary = tempfile::tempdir().unwrap();
        let top = fs::canonicalize(temporary.path()).unwrap();
        let old = top.join("old");
        let new = top.join("new");
        fs::create_dir_all(old.join("sub")).unwrap();
        fs::create_dir(top.join("outside")).unwrap();
        fs::write(old.join("sub/image.svg"), SVG).unwrap();
        fs::write(top.join("outside/image.svg"), SVG).unwrap();
        let parent = cap(&old.join("sub"));
        let (root, logical, base) = match relation {
            "above" => (cap(&top), top.clone(), Path::new("old/sub")),
            "equal" => (cap(&old), old.clone(), Path::new("sub")),
            _ => (Arc::clone(&parent), old.join("sub"), Path::new("")),
        };
        let scope = ImageScope::workspace(Arc::clone(&root), Arc::clone(&parent), base)
            .unwrap()
            .with_logical_root(&logical)
            .unwrap();
        let mut registry = ImageRegistry::default();
        let image = registry.resolve("doc", &scope, "image.svg").unwrap();
        let plan = scope.prepare_retarget(&cap(&old), &old, &new).unwrap();
        let cache = registry.prepare_retarget("doc", &plan);
        fs::rename(&old, &new).unwrap();
        // A replacement at the old spelling cannot supply content or receive imports.
        fs::create_dir_all(old.join("sub")).unwrap();
        fs::write(old.join("sub/image.svg"), b"wrong authority").unwrap();
        let rebound = plan.commit();
        cache.commit(&mut registry);
        assert_eq!(
            registry
                .resolve("doc", &rebound, "image.svg")
                .unwrap()
                .token,
            image.token,
            "{relation}"
        );
        assert_eq!(registry.get(&image.token).unwrap().bytes.as_ref(), SVG);
        let imported = registry
            .import_bytes("doc", &rebound, "image.svg", SVG.to_vec())
            .unwrap();
        assert!(imported.source.starts_with("assets/"));
        assert!(new.join("sub/assets").is_dir());
        assert!(!old.join("sub/assets").exists());
        if relation == "above" {
            assert!(registry
                .resolve("doc", &rebound, "../../outside/image.svg")
                .is_ok());
        } else {
            assert!(matches!(
                registry.resolve("doc", &rebound, "../../outside/image.svg"),
                Err(ImageError::OutsideScope)
            ));
        }
    }
}

#[test]
fn retarget_does_not_change_other_documents_cached_paths_or_bytes() {
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(top.join("old/sub")).unwrap();
    fs::write(top.join("old/sub/image.svg"), SVG).unwrap();
    let scope = ImageScope::workspace(cap(&top), cap(&top.join("old/sub")), Path::new("old/sub"))
        .unwrap()
        .with_logical_root(&top)
        .unwrap();
    let mut registry = ImageRegistry::default();
    let affected = registry.resolve("affected", &scope, "image.svg").unwrap();
    let other = registry.resolve("other", &scope, "image.svg").unwrap();
    let plan = scope
        .prepare_retarget(&cap(&top.join("old")), &top.join("old"), &top.join("new"))
        .unwrap();
    let cache = registry.prepare_retarget("affected", &plan);
    fs::rename(top.join("old"), top.join("new")).unwrap();
    let scope = plan.commit();
    cache.commit(&mut registry);
    assert_eq!(
        registry.images[&affected.token].path.as_deref(),
        Some(Path::new("new/sub/image.svg"))
    );
    assert_eq!(
        registry.images[&other.token].path.as_deref(),
        Some(Path::new("old/sub/image.svg"))
    );
    assert_eq!(registry.get(&other.token).unwrap().bytes.as_ref(), SVG);
    assert_eq!(
        registry
            .resolve("affected", &scope, "image.svg")
            .unwrap()
            .token,
        affected.token
    );
}

#[test]
fn prepared_scope_drop_is_inert_and_wrong_source_root_parent_or_cross_parent_fails() {
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(top.join("old/sub")).unwrap();
    fs::create_dir(top.join("other")).unwrap();
    fs::write(top.join("old/sub/image.svg"), SVG).unwrap();
    let root = cap(&top);
    let parent = cap(&top.join("old/sub"));
    let scope = ImageScope::workspace(Arc::clone(&root), Arc::clone(&parent), Path::new("old/sub"))
        .unwrap()
        .with_logical_root(&top)
        .unwrap();
    let old = top.join("old");
    let new = top.join("new");
    drop(scope.prepare_retarget(&cap(&old), &old, &new).unwrap());
    let mut registry = ImageRegistry::default();
    assert!(registry.resolve("doc", &scope, "image.svg").is_ok());
    assert!(scope
        .prepare_retarget(&cap(&top.join("other")), &old, &new)
        .is_err());
    assert!(scope
        .prepare_retarget(&cap(&old), &old, &top.join("other/new"))
        .is_err());
    let wrong_parent = ImageScope::workspace(
        Arc::clone(&root),
        cap(&top.join("other")),
        Path::new("old/sub"),
    )
    .unwrap()
    .with_logical_root(&top)
    .unwrap();
    assert!(wrong_parent
        .prepare_retarget(&cap(&old), &old, &new)
        .is_err());
    let wrong_display = ImageScope::workspace(root, parent, Path::new("old/sub"))
        .unwrap()
        .with_logical_root(&top.join("other"))
        .unwrap();
    assert!(wrong_display
        .prepare_retarget(&cap(&old), &old, &new)
        .is_err());
    assert!(!new.exists());
}

#[test]
fn direct_scope_leave_and_return_uses_its_rebased_boundary() {
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(top.join("old/sub")).unwrap();
    fs::write(top.join("old/sub/image.svg"), SVG).unwrap();
    let scope = ImageScope::document_directory(cap(&top.join("old/sub")))
        .with_logical_root(&top.join("old/sub"))
        .unwrap();
    let mut registry = ImageRegistry::default();
    let image = registry
        .resolve("doc", &scope, "../../old/sub/image.svg")
        .unwrap();
    let plan = scope
        .prepare_retarget(&cap(&top.join("old")), &top.join("old"), &top.join("new"))
        .unwrap();
    let cache = registry.prepare_retarget("doc", &plan);
    fs::rename(top.join("old"), top.join("new")).unwrap();
    let scope = plan.commit();
    cache.commit(&mut registry);
    assert_eq!(
        registry
            .resolve("doc", &scope, "../../new/sub/image.svg")
            .unwrap()
            .token,
        image.token
    );
    assert!(matches!(
        registry.resolve("doc", &scope, "../../old/sub/image.svg"),
        Err(ImageError::OutsideScope)
    ));
}

#[cfg(unix)]
#[test]
fn symbolic_alias_of_source_or_a_scope_base_is_not_a_retarget_proof() {
    use std::os::unix::fs::symlink;
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(top.join("old/sub")).unwrap();
    symlink(top.join("old"), top.join("alias")).unwrap();
    symlink(top.join("old/sub"), top.join("old/link")).unwrap();
    let scope = ImageScope::workspace(cap(&top), cap(&top.join("old/sub")), Path::new("old/sub"))
        .unwrap()
        .with_logical_root(&top)
        .unwrap();
    assert!(scope
        .prepare_retarget(&cap(&top.join("old")), &top.join("alias"), &top.join("new"))
        .is_err());
    let bad_base =
        ImageScope::workspace(cap(&top), cap(&top.join("old/sub")), Path::new("old/link"))
            .unwrap()
            .with_logical_root(&top)
            .unwrap();
    assert!(bad_base
        .prepare_retarget(&cap(&top.join("old")), &top.join("old"), &top.join("new"))
        .is_err());
}

#[test]
fn cross_parent_directory_move_preserves_or_intersects_each_prior_scope() {
    for relation in ["above", "equal", "inside"] {
        let temporary = tempfile::tempdir().unwrap();
        let top = fs::canonicalize(temporary.path()).unwrap();
        let source = top.join("Old/Folder");
        let destination = top.join("New/Folder");
        fs::create_dir_all(source.join("sub")).unwrap();
        fs::create_dir(top.join("New")).unwrap();
        fs::write(source.join("sub/image.svg"), SVG).unwrap();
        fs::write(top.join("Old/outside.svg"), SVG).unwrap();
        fs::write(top.join("New/outside.svg"), SVG).unwrap();
        let parent = cap(&source.join("sub"));
        let (root, logical, base) = match relation {
            "above" => (
                cap(&top.join("Old")),
                top.join("Old"),
                Path::new("Folder/sub"),
            ),
            "equal" => (cap(&source), source.clone(), Path::new("sub")),
            _ => (Arc::clone(&parent), source.join("sub"), Path::new("")),
        };
        let scope = ImageScope::workspace(root, parent, base)
            .unwrap()
            .with_logical_root(&logical)
            .unwrap();
        let mut registry = ImageRegistry::default();
        let inside = registry.resolve("doc", &scope, "image.svg").unwrap();
        let outside = if relation == "above" {
            Some(
                registry
                    .resolve("doc", &scope, "../../outside.svg")
                    .unwrap(),
            )
        } else {
            None
        };
        let plan = scope
            .prepare_directory_move(cap(&source), &source, &destination)
            .unwrap();
        let cache = registry.prepare_retarget("doc", &plan);
        let bytes = registry.bytes;
        fs::rename(&source, &destination).unwrap();
        fs::create_dir_all(source.join("sub")).unwrap();
        fs::write(
            source.join("sub/image.svg"),
            b"replacement, not a granted image",
        )
        .unwrap();
        let scope = plan.commit();
        cache.commit(&mut registry);
        assert_eq!(registry.bytes, bytes);
        assert_eq!(
            registry.resolve("doc", &scope, "image.svg").unwrap().token,
            inside.token,
            "{relation}"
        );
        assert!(matches!(
            registry.resolve("doc", &scope, "../../outside.svg"),
            Err(ImageError::OutsideScope)
        ));
        if let Some(outside) = outside {
            assert!(registry.images[&outside.token].path.is_none());
            assert_eq!(registry.get(&outside.token).unwrap().bytes.as_ref(), SVG);
        }
        let imported = registry
            .import_bytes("doc", &scope, "image.svg", SVG.to_vec())
            .unwrap();
        assert!(imported.source.starts_with("assets/"));
        assert!(destination.join("sub/assets").is_dir());
        assert!(!source.join("sub/assets").exists());
        assert!(!top.join("New/assets").exists());
        registry.close_document("doc");
        assert!(registry.images.is_empty());
        assert_eq!(registry.bytes, 0);
    }
}

#[test]
fn intersected_cache_does_not_alias_identical_old_outside_bytes_to_a_new_inside_path() {
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    let source = top.join("Old/Folder");
    let destination = top.join("New/Folder");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir(top.join("New")).unwrap();
    for path in [
        source.join("image.svg"),
        top.join("Old/image.svg"),
        top.join("New/image.svg"),
    ] {
        fs::write(path, SVG).unwrap();
    }
    let scope = ImageScope::workspace(cap(&top.join("Old")), cap(&source), Path::new("Folder"))
        .unwrap()
        .with_logical_root(&top.join("Old"))
        .unwrap();
    let mut registry = ImageRegistry::default();
    let inside = registry.resolve("doc", &scope, "image.svg").unwrap();
    let outside = registry.resolve("doc", &scope, "../image.svg").unwrap();
    let other_document = registry.resolve("other", &scope, "../image.svg").unwrap();
    let plan = scope
        .prepare_directory_move(cap(&source), &source, &destination)
        .unwrap();
    let cache = registry.prepare_retarget("doc", &plan);
    fs::rename(&source, &destination).unwrap();
    let scope = plan.commit();
    cache.commit(&mut registry);
    assert_eq!(
        registry.images[&inside.token].path.as_deref(),
        Some(Path::new("image.svg"))
    );
    assert!(registry.images[&outside.token].path.is_none());
    assert_eq!(
        registry.images[&other_document.token].path.as_deref(),
        Some(Path::new("image.svg"))
    );
    assert_eq!(
        registry.resolve("doc", &scope, "image.svg").unwrap().token,
        inside.token
    );
    assert!(matches!(
        registry.resolve("doc", &scope, "../image.svg"),
        Err(ImageError::OutsideScope)
    ));
    assert_eq!(registry.get(&outside.token).unwrap().bytes.as_ref(), SVG);
}

#[test]
fn cross_parent_move_rejects_an_unrelated_scope_or_source_and_cancel_keeps_cache_paths() {
    let temporary = tempfile::tempdir().unwrap();
    let top = fs::canonicalize(temporary.path()).unwrap();
    let source = top.join("Old/Folder");
    let destination = top.join("New/Folder");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir(top.join("Old/Other")).unwrap();
    fs::create_dir(top.join("New")).unwrap();
    fs::write(source.join("image.svg"), SVG).unwrap();
    let scope = ImageScope::workspace(cap(&top.join("Old")), cap(&source), Path::new("Folder"))
        .unwrap()
        .with_logical_root(&top.join("Old"))
        .unwrap();
    let mut registry = ImageRegistry::default();
    let image = registry.resolve("doc", &scope, "image.svg").unwrap();
    let plan = scope
        .prepare_directory_move(cap(&source), &source, &destination)
        .unwrap();
    drop(registry.prepare_retarget("doc", &plan));
    drop(plan);
    assert_eq!(
        registry.images[&image.token].path.as_deref(),
        Some(Path::new("Folder/image.svg"))
    );
    assert_eq!(
        registry.resolve("doc", &scope, "image.svg").unwrap().token,
        image.token
    );
    assert!(scope
        .prepare_directory_move(cap(&top.join("Old/Other")), &source, &destination)
        .is_err());
    let unrelated = ImageScope::document_directory(cap(&top.join("Old/Other")))
        .with_logical_root(&top.join("Old/Other"))
        .unwrap();
    assert!(unrelated
        .prepare_directory_move(cap(&source), &source, &destination)
        .is_err());
    let outside_parent = ImageScope::workspace(
        cap(&top.join("Old")),
        cap(&top.join("Old/Other")),
        Path::new("Other"),
    )
    .unwrap()
    .with_logical_root(&top.join("Old"))
    .unwrap();
    assert!(outside_parent
        .prepare_directory_move(cap(&source), &source, &destination)
        .is_err());
    assert!(!destination.exists());
}
