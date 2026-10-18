use super::*;
use crate::{EntryMoveConflictPolicy, EntryMovePreparation};
use std::fs;
use uuid::Uuid;

#[test]
fn moved_mounts_follow_owned_destination_and_ancestor_only_finishes_affected_tokens() {
    let fixture = tempfile::tempdir().unwrap();
    fs::create_dir_all(fixture.path().join("workspace/book/assets")).unwrap();
    fs::create_dir(fixture.path().join("outside")).unwrap();
    fs::write(
        fixture.path().join("workspace/book/note.md"),
        b"![x](assets/a.png)",
    )
    .unwrap();
    fs::write(fixture.path().join("workspace/book/assets/a.png"), b"image").unwrap();
    fs::write(fixture.path().join("workspace/other.md"), b"other").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let ancestor = registry
        .select_authorized(&fixture.path().join("workspace"))
        .unwrap();
    let mounted = registry
        .select_authorized(&fixture.path().join("workspace/book"))
        .unwrap();
    let nested = registry
        .select_authorized(&fixture.path().join("workspace/book/assets"))
        .unwrap();
    let source = registry.get(&ancestor.id).unwrap();
    let old_mounted = registry.get(&mounted.id).unwrap();
    let affected = source.inspect_entry("book/note.md").unwrap();
    let unaffected = source.inspect_entry("other.md").unwrap();
    let child_token = old_mounted.inspect_entry("note.md").unwrap();
    let root_token = source.inspect_entry("book").unwrap();
    let destination = fs::canonicalize(fixture.path().join("outside")).unwrap();
    let target =
        Arc::new(Dir::open_ambient_dir(&destination, cap_std::ambient_authority()).unwrap());
    let destination = source
        .inspect_entry_move_destination(&root_token.entry_token, target, &destination)
        .unwrap();
    let move_plan = match source
        .prepare_entry_move(
            &Uuid::new_v4().to_string(),
            &root_token.entry_token,
            destination,
            EntryMoveConflictPolicy::Cancel,
        )
        .unwrap()
    {
        EntryMovePreparation::Ready(plan) => plan,
        _ => panic!("ready"),
    };
    let plans = registry
        .prepare_move_relocation(
            move_plan.source_directory(),
            move_plan.old_name(),
            move_plan.old_display_path(),
            &move_plan.new_display_path(),
            move_plan.kind(),
        )
        .unwrap();
    assert_eq!(plans.len(), 3);
    for (_, plan) in &plans {
        plan.validate().unwrap();
    }
    let commit = source.commit_entry_move(move_plan).unwrap();
    for (_, plan) in &plans {
        plan.validate_commit(&commit.placement).unwrap();
    }
    for (id, plan) in plans {
        registry
            .commit_move_relocation(&id, plan, &commit.placement)
            .unwrap();
    }
    assert!(source.prepare_entry_action(&affected.entry_token).is_err());
    assert!(source.prepare_entry_action(&unaffected.entry_token).is_ok());
    assert!(old_mounted
        .prepare_entry_action(&child_token.entry_token)
        .is_err());
    assert!(old_mounted.bookmark().is_err());
    assert!(registry.get(&ancestor.id).unwrap().bookmark().is_ok());
    let rebound = registry.get(&mounted.id).unwrap();
    assert_eq!(
        rebound.display_root_snapshot().unwrap(),
        fs::canonicalize(fixture.path().join("outside/book")).unwrap()
    );
    assert!(rebound.inspect_entry("note.md").is_ok());
    assert!(registry
        .get(&nested.id)
        .unwrap()
        .inspect_entry("a.png")
        .is_ok());
}

#[test]
fn replaced_target_and_source_cohorts_can_commit_to_same_ancestor_without_revoking_it() {
    let fixture = tempfile::tempdir().unwrap();
    fs::create_dir_all(fixture.path().join("from/book")).unwrap();
    fs::create_dir_all(fixture.path().join("to/book")).unwrap();
    fs::write(fixture.path().join("from/book/note.md"), b"source").unwrap();
    fs::write(fixture.path().join("to/book/old.md"), b"target").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let parent = registry.select_authorized(fixture.path()).unwrap();
    let old_target = registry
        .select_authorized(&fixture.path().join("to/book"))
        .unwrap();
    let workspace = registry.get(&parent.id).unwrap();
    let token = workspace.inspect_entry("from/book").unwrap();
    let target = fs::canonicalize(fixture.path().join("to")).unwrap();
    let target_dir =
        Arc::new(Dir::open_ambient_dir(&target, cap_std::ambient_authority()).unwrap());
    let destination = workspace
        .inspect_entry_move_destination(&token.entry_token, target_dir, &target)
        .unwrap();
    let move_plan = match workspace
        .prepare_entry_move(
            &Uuid::new_v4().to_string(),
            &token.entry_token,
            destination,
            EntryMoveConflictPolicy::Replace,
        )
        .unwrap()
    {
        EntryMovePreparation::Ready(plan) => plan,
        _ => panic!("ready"),
    };
    let replacement_plans = registry
        .prepare_move_relocation(
            move_plan.destination_directory(),
            move_plan.new_name(),
            &move_plan.new_display_path(),
            &move_plan.replacement_display_path().unwrap(),
            move_plan.replacement_kind().unwrap(),
        )
        .unwrap();
    let plans = registry
        .prepare_move_relocation(
            move_plan.source_directory(),
            move_plan.old_name(),
            move_plan.old_display_path(),
            &move_plan.new_display_path(),
            move_plan.kind(),
        )
        .unwrap();
    let commit = workspace.commit_entry_move(move_plan).unwrap();
    let replacement = commit.placement.replacement_placement().unwrap();
    for (_, plan) in &replacement_plans {
        plan.validate_commit(&replacement).unwrap();
    }
    for (_, plan) in &plans {
        plan.validate_commit(&commit.placement).unwrap();
    }
    for (id, plan) in replacement_plans {
        registry
            .commit_move_relocation(&id, plan, &replacement)
            .unwrap();
    }
    for (id, plan) in plans {
        registry
            .commit_move_relocation(&id, plan, &commit.placement)
            .unwrap();
    }
    let root = registry.get(&parent.id).unwrap();
    assert!(root.bookmark().is_ok());
    assert_eq!(root.display_root_revision().unwrap(), 2);
    let target_mount = registry.get(&old_target.id).unwrap();
    assert!(target_mount
        .display_root_snapshot()
        .unwrap()
        .to_string_lossy()
        .contains(".marklyra-move-"));
    assert!(target_mount.inspect_entry("old.md").is_ok());
}

#[test]
fn replace_batch_reserves_both_metadata_revision_increments_before_io() {
    let fixture = tempfile::tempdir().unwrap();
    fs::create_dir(fixture.path().join("from")).unwrap();
    fs::create_dir(fixture.path().join("to")).unwrap();
    fs::write(fixture.path().join("from/note.md"), b"source").unwrap();
    fs::write(fixture.path().join("to/note.md"), b"target").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(fixture.path()).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    workspace.location.lock().unwrap().revision = 9_007_199_254_740_990;
    let token = workspace.inspect_entry("from/note.md").unwrap();
    let target = fs::canonicalize(fixture.path().join("to")).unwrap();
    let directory = Arc::new(Dir::open_ambient_dir(&target, cap_std::ambient_authority()).unwrap());
    let destination = workspace
        .inspect_entry_move_destination(&token.entry_token, directory, &target)
        .unwrap();
    let plan = match workspace
        .prepare_entry_move(
            &Uuid::new_v4().to_string(),
            &token.entry_token,
            destination,
            EntryMoveConflictPolicy::Replace,
        )
        .unwrap()
    {
        EntryMovePreparation::Ready(plan) => plan,
        _ => panic!("ready"),
    };
    let main = registry
        .prepare_move_relocation(
            plan.source_directory(),
            plan.old_name(),
            plan.old_display_path(),
            &plan.new_display_path(),
            plan.kind(),
        )
        .unwrap();
    let replaced = registry
        .prepare_move_relocation(
            plan.destination_directory(),
            plan.new_name(),
            &plan.new_display_path(),
            &plan.replacement_display_path().unwrap(),
            plan.replacement_kind().unwrap(),
        )
        .unwrap();
    let batch = main
        .iter()
        .chain(&replaced)
        .map(|(_, plan)| plan)
        .collect::<Vec<_>>();
    assert!(WorkspaceMoveRelocationPlan::validate_batch(&batch).is_err());
    assert_eq!(
        fs::read(fixture.path().join("from/note.md")).unwrap(),
        b"source"
    );
    assert_eq!(
        fs::read(fixture.path().join("to/note.md")).unwrap(),
        b"target"
    );
}
