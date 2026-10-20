use super::*;
use cap_std::fs::File;
use document_service::{DocumentService, NativeMovePublicationEntry};
use std::{fs, path::Path};
use uuid::Uuid;

fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
}
fn held(path: &Path, kind: RenameKind) -> Arc<File> {
    Arc::new(if kind == RenameKind::Directory {
        File::from_std(cap(path).try_clone().unwrap().into_std_file())
    } else {
        File::open_ambient(path, cap_std::ambient_authority()).unwrap()
    })
}
fn target(old: &Path, new: &Path, kind: RenameKind) -> NativeMoveTarget {
    NativeMoveTarget {
        source_parent: cap(old.parent().unwrap()),
        source_name: old.file_name().unwrap().into(),
        destination_parent: cap(new.parent().unwrap()),
        destination_name: new.file_name().unwrap().into(),
        source_display: old.to_owned(),
        destination_display: new.to_owned(),
        kind,
    }
}
fn document(path: &Path) -> DocumentBookmark {
    let mut service = DocumentService::new();
    let doc = service.open_authorized(path).unwrap();
    service.bookmark(&doc.id).unwrap()
}
fn publish(
    old: &Path,
    new: &Path,
    kind: RenameKind,
    copied: bool,
) -> Option<NativeMovePublication> {
    let descendant = |root: &Path, suffix: &str| {
        if suffix.is_empty() {
            root.to_owned()
        } else {
            root.join(suffix)
        }
    };
    let paths = if kind == RenameKind::Directory {
        vec![
            ("", RenameKind::Directory),
            ("child", RenameKind::Directory),
            ("child/note.md", RenameKind::File),
        ]
    } else {
        vec![("", RenameKind::File)]
    };
    let sources: Vec<_> = paths
        .iter()
        .map(|(suffix, kind)| held(&descendant(old, suffix), *kind))
        .collect();
    if copied {
        if kind == RenameKind::Directory {
            fs::create_dir_all(new.join("child")).unwrap();
            fs::copy(old.join("child/note.md"), new.join("child/note.md")).unwrap();
        } else {
            fs::copy(old, new).unwrap();
        }
        let retained = old.with_file_name(format!("retained-{}", Uuid::new_v4()));
        if kind == RenameKind::Directory {
            if !crate::test_support::rename_retained_directory(old, &retained) {
                return None;
            }
        } else {
            fs::rename(old, retained).unwrap();
        }
    } else if kind == RenameKind::Directory {
        if !crate::test_support::rename_retained_directory(old, new) {
            return None;
        }
    } else {
        fs::rename(old, new).unwrap();
    }
    let entries = paths
        .iter()
        .zip(sources)
        .map(|((suffix, kind), source)| {
            NativeMovePublicationEntry::from_owned_handles(
                Path::new(suffix),
                *kind,
                source,
                held(&descendant(new, suffix), *kind),
            )
            .unwrap()
        })
        .collect();
    Some(
        NativeMovePublication::verify(
            Uuid::new_v4(),
            cap(old.parent().unwrap()),
            Path::new(old.file_name().unwrap()),
            cap(new.parent().unwrap()),
            Path::new(new.file_name().unwrap()),
            kind,
            entries,
        )
        .unwrap(),
    )
}

#[test]
fn typed_recipes_cover_file_and_directory_parent_changes_and_copied_identity_maps() {
    for kind in [RenameKind::File, RenameKind::Directory] {
        for cross_parent in [false, true] {
            for copied in [false, true] {
                let temp = tempfile::tempdir().unwrap();
                let root = fs::canonicalize(temp.path()).unwrap();
                fs::create_dir(root.join("left")).unwrap();
                fs::create_dir(root.join("right")).unwrap();
                let left = root.join("left");
                let right = if cross_parent {
                    root.join("right")
                } else {
                    left.clone()
                };
                let old = left.join(if kind == RenameKind::File {
                    "old.md"
                } else {
                    "old"
                });
                let new = right.join(if kind == RenameKind::File {
                    "new.md"
                } else {
                    "new"
                });
                let doc_path = if kind == RenameKind::Directory {
                    fs::create_dir_all(old.join("child")).unwrap();
                    old.join("child/note.md")
                } else {
                    old.clone()
                };
                let bytes = b"\xef\xbb\xbfsource\r\nTail  \n";
                fs::write(&doc_path, bytes).unwrap();
                let doc = document(&doc_path);
                let directory =
                    DirectoryBookmark::from_native_selection(if kind == RenameKind::Directory {
                        &old
                    } else {
                        &left
                    })
                    .unwrap();
                let input = MoveMetadataInput::new(vec![target(&old, &new, kind)]).unwrap();
                assert_eq!(input.document(&doc).unwrap(), Some(doc.clone()));
                assert_eq!(
                    input.directory(&directory).unwrap(),
                    if kind == RenameKind::Directory {
                        Some(directory.clone())
                    } else {
                        None
                    }
                );
                assert!(input.affects_document(&doc_path));
                assert!(!input.affects_document(&old.with_file_name("old-neighbor/note.md")));
                let Some(publication) = publish(&old, &new, kind, copied) else {
                    assert!(doc.probe().unwrap());
                    assert_eq!(fs::read(&doc_path).unwrap(), bytes);
                    continue;
                };
                let mapping = input.finalize(&[&publication]).unwrap();
                let next = mapping.document(&doc);
                let expected = if kind == RenameKind::Directory {
                    new.join("child/note.md")
                } else {
                    new.clone()
                };
                assert_eq!(next.path(), expected);
                assert!(next.probe().unwrap());
                assert_eq!(fs::read(&expected).unwrap(), bytes);
                let next_directory = mapping.directory(&directory);
                if kind == RenameKind::Directory {
                    assert_eq!(next_directory.path(), new);
                    next_directory.reopen().unwrap();
                    assert!(directory.reopen().is_err());
                } else {
                    assert_eq!(next_directory, directory);
                }
            }
        }
    }
}

#[test]
fn dropped_or_wrong_publication_recipes_do_not_write_metadata_or_upgrade_old_authority() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir(root.join("right")).unwrap();
    let old = root.join("old");
    let new = root.join("right/new");
    fs::create_dir_all(old.join("child")).unwrap();
    fs::write(old.join("child/note.md"), b"Source").unwrap();
    let book = DirectoryBookmark::from_native_selection(&old).unwrap();
    let doc = document(&old.join("child/note.md"));
    let persisted = root.join("session.json");
    let original = serde_json::to_vec(&(book.clone(), doc.clone())).unwrap();
    fs::write(&persisted, &original).unwrap();
    let input = MoveMetadataInput::new(vec![target(&old, &new, RenameKind::Directory)]).unwrap();
    input.directory(&book).unwrap();
    input.document(&doc).unwrap();
    drop(input);
    assert_eq!(fs::read(&persisted).unwrap(), original);
    assert!(doc.probe().unwrap());
    assert!(!new.exists());

    let input = MoveMetadataInput::new(vec![target(&old, &new, RenameKind::Directory)]).unwrap();
    input.directory(&book).unwrap();
    input.document(&doc).unwrap();
    assert!(input.finalize(&[]).is_err());
    let unrelated = root.join("unrelated");
    let unrelated_new = root.join("right/unrelated-new");
    fs::create_dir_all(unrelated.join("child")).unwrap();
    fs::write(unrelated.join("child/note.md"), b"Source").unwrap();
    let Some(wrong) = publish(&unrelated, &unrelated_new, RenameKind::Directory, false) else {
        assert_eq!(fs::read(&persisted).unwrap(), original);
        book.reopen().unwrap();
        return;
    };
    assert!(input.finalize(&[&wrong]).is_err());
    assert_eq!(fs::read(&persisted).unwrap(), original);
    assert_eq!(book.path(), old);
    book.reopen().unwrap();
}

#[test]
fn an_old_same_byte_directory_bookmark_cannot_grant_its_replacement() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir(root.join("right")).unwrap();
    let old = root.join("old");
    let new = root.join("right/new");
    fs::create_dir_all(old.join("child")).unwrap();
    fs::write(old.join("child/note.md"), b"Same").unwrap();
    let old_book = DirectoryBookmark::from_native_selection(&old).unwrap();
    let old_document = document(&old.join("child/note.md"));
    fs::rename(&old, root.join("retained")).unwrap();
    fs::create_dir_all(old.join("child")).unwrap();
    fs::write(old.join("child/note.md"), b"Same").unwrap();
    let new_book = DirectoryBookmark::from_native_selection(&old).unwrap();
    let new_document = document(&old.join("child/note.md"));
    assert_ne!(new_book, old_book);
    let input = MoveMetadataInput::new(vec![target(&old, &new, RenameKind::Directory)]).unwrap();
    assert!(input.directory(&old_book).is_err());
    assert!(input.document(&old_document).is_err());
    input.directory(&new_book).unwrap();
    input.document(&new_document).unwrap();
    let Some(publication) = publish(&old, &new, RenameKind::Directory, true) else {
        assert!(new_document.probe().unwrap());
        assert!(old_document.probe().is_err() || !old_document.probe().unwrap());
        return;
    };
    let mapping = input.finalize(&[&publication]).unwrap();
    assert_eq!(mapping.directory(&old_book), old_book);
    assert_eq!(mapping.document(&old_document), old_document);
    assert_eq!(mapping.directory(&new_book).path(), new);
    assert_eq!(
        mapping.document(&new_document).path(),
        new.join("child/note.md")
    );
    assert!(old_book.reopen().is_err());
}
