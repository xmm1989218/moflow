use git2::{Repository, Oid, Signature, TreeBuilder, Tree, ObjectType};
use tauri::Manager;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::Mutex;

const DIR_MODE: i32 = 0o40000;
const FILE_MODE: i32 = 0o100644;

struct SnapshotInfo {
    workspace: String,
    file_paths: Option<Vec<String>>,
}

pub struct SnapshotState {
    infos: Mutex<HashMap<String, SnapshotInfo>>,
}

impl SnapshotState {
    pub fn new() -> Self {
        SnapshotState {
            infos: Mutex::new(HashMap::new()),
        }
    }
}

fn path_to_posix(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn split_path_parts(s: &str) -> Vec<&str> {
    s.split(|c| c == '/' || c == '\\').filter(|p| !p.is_empty()).collect()
}

fn safe_file_name(chat_key: &str) -> String {
    chat_key.replace([':', '/', '\\'], "_")
}

fn snapshot_dir(app_data_dir: &Path, chat_key: &str) -> PathBuf {
    app_data_dir.join("chats").join(safe_file_name(chat_key)).join("snapshots")
}

fn open_repo(app_data_dir: &Path, chat_key: &str) -> Result<Repository, String> {
    let dir = snapshot_dir(app_data_dir, chat_key);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Create snapshot dir: {}", e))?;
    }
    if dir.join("HEAD").exists() {
        Repository::open_bare(&dir).map_err(|e| format!("Open snapshot repo: {}", e))
    } else {
        Repository::init_bare(&dir).map_err(|e| format!("Init snapshot repo: {}", e))
    }
}

fn build_tree_from_dir(repo: &Repository, dir: &Path, base: &Path, skip_git: bool) -> Result<Oid, String> {
    let mut tb = repo.treebuilder(None).map_err(|e| format!("TreeBuilder: {}", e))?;
    walk_dir_to_tree(&mut tb, repo, dir, base, skip_git)?;
    tb.write().map_err(|e| format!("Write tree: {}", e))
}

fn walk_dir_to_tree(tb: &mut TreeBuilder, repo: &Repository, current: &Path, base: &Path, skip_git: bool) -> Result<(), String> {
    let entries = std::fs::read_dir(current).map_err(|e| format!("Read dir {}: {}", current.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Dir entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();

        if skip_git && name == ".git" { continue; }
        if name == ".moflow-snapshots" { continue; }
        if name == "node_modules" { continue; }

        if path.is_dir() {
            let mut sub_tb = repo.treebuilder(None).map_err(|e| format!("Sub TreeBuilder: {}", e))?;
            walk_dir_to_tree(&mut sub_tb, repo, &path, base, skip_git)?;
            let sub_oid = sub_tb.write().map_err(|e| format!("Sub write tree: {}", e))?;
            tb.insert(&name, sub_oid, DIR_MODE).map_err(|e| format!("Insert dir {}: {}", name, e))?;
        } else {
            let content = std::fs::read(&path).map_err(|e| format!("Read file {}: {}", path.display(), e))?;
            let blob_oid = repo.blob(&content).map_err(|e| format!("Create blob {}: {}", name, e))?;
            tb.insert(&name, blob_oid, FILE_MODE).map_err(|e| format!("Insert file {}: {}", name, e))?;
        }
    }
    Ok(())
}

fn build_tree_from_files(repo: &Repository, workspace: &Path, file_paths: &[String]) -> Result<Oid, String> {
    let mut tb = repo.treebuilder(None).map_err(|e| format!("TreeBuilder: {}", e))?;
    for file_path in file_paths {
        let abs_path = if Path::new(file_path).is_absolute() {
            PathBuf::from(file_path)
        } else {
            workspace.join(file_path)
        };
        if !abs_path.exists() { continue; }
        let content = std::fs::read(&abs_path).map_err(|e| format!("Read {}: {}", abs_path.display(), e))?;
        let blob_oid = repo.blob(&content).map_err(|e| format!("Blob {}: {}", file_path, e))?;
        let relative = abs_path.strip_prefix(workspace).unwrap_or(Path::new(file_path));
        let rel_str = path_to_posix(relative);
        let parts = split_path_parts(&rel_str);
        if parts.len() == 1 {
            tb.insert(parts[0], blob_oid, FILE_MODE).map_err(|e| format!("Insert {}: {}", rel_str, e))?;
        } else {
            insert_nested_path(&mut tb, repo, &parts, blob_oid)?;
        }
    }
    tb.write().map_err(|e| format!("Write tree: {}", e))
}

fn insert_nested_path(tb: &mut TreeBuilder, repo: &Repository, parts: &[&str], blob_oid: Oid) -> Result<(), String> {
    if parts.len() == 1 {
        tb.insert(parts[0], blob_oid, FILE_MODE).map_err(|e| format!("Insert {}: {}", parts[0], e))?;
        return Ok(());
    }
    let dir_name = parts[0];
    let existing_tree_oid = tb.get(dir_name)
        .map_err(|e| format!("Get {}: {}", dir_name, e))?
        .map(|entry| entry.id());
    let mut sub_tb = if let Some(oid) = existing_tree_oid {
        let existing_tree = repo.find_tree(oid).map_err(|e| format!("Find tree {}: {}", dir_name, e))?;
        repo.treebuilder(Some(&existing_tree)).map_err(|e| format!("Sub TreeBuilder: {}", e))?
    } else {
        repo.treebuilder(None).map_err(|e| format!("Sub TreeBuilder new: {}", e))?
    };
    insert_nested_path(&mut sub_tb, repo, &parts[1..], blob_oid)?;
    let sub_oid = sub_tb.write().map_err(|e| format!("Write sub tree: {}", e))?;
    tb.insert(dir_name, sub_oid, DIR_MODE).map_err(|e| format!("Insert dir {}: {}", dir_name, e))?;
    Ok(())
}

fn create_commit(repo: &Repository, tree_oid: Oid, message: &str) -> Result<Oid, String> {
    let tree = repo.find_tree(tree_oid).map_err(|e| format!("Find tree: {}", e))?;
    let sig = Signature::now("MoFlow", "moflow@moflow.app").map_err(|e| format!("Signature: {}", e))?;

    let parent_commit = repo.head().ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok());

    let commit_oid = if let Some(parent) = parent_commit {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
            .map_err(|e| format!("Commit: {}", e))?
    } else {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])
            .map_err(|e| format!("Commit (initial): {}", e))?
    };

    Ok(commit_oid)
}

fn write_tree_to_dir(repo: &Repository, tree: &Tree, target_dir: &Path, prefix: &Path) -> Result<Vec<String>, String> {
    let mut written_files = Vec::new();
    for entry in tree.iter() {
        let name = entry.name().unwrap_or("");
        let rel_path = prefix.join(name);

        match entry.kind() {
            Some(ObjectType::Tree) => {
                let obj = entry.to_object(repo).map_err(|e| format!("To object: {}", e))?;
                let sub_tree = obj.as_tree().ok_or_else(|| format!("Not a tree: {}", name))?;
                let abs_dir = target_dir.join(&rel_path);
                std::fs::create_dir_all(&abs_dir).map_err(|e| format!("Create dir {}: {}", abs_dir.display(), e))?;
                let sub_files = write_tree_to_dir(repo, &sub_tree, target_dir, &rel_path)?;
                written_files.extend(sub_files);
            }
            Some(ObjectType::Blob) => {
                let obj = entry.to_object(repo).map_err(|e| format!("To object: {}", e))?;
                let blob = obj.as_blob().ok_or_else(|| format!("Not a blob: {}", name))?;
                let abs_path = target_dir.join(&rel_path);
                if let Some(parent) = abs_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("Create parent {}: {}", parent.display(), e))?;
                }
                std::fs::write(&abs_path, blob.content()).map_err(|e| format!("Write {}: {}", abs_path.display(), e))?;
                written_files.push(path_to_posix(&abs_path));
            }
            _ => {}
        }
    }
    Ok(written_files)
}

fn collect_tree_paths(repo: &Repository, tree: &Tree, prefix: &Path) -> Vec<String> {
    let mut paths = Vec::new();
    for entry in tree.iter() {
        let name = entry.name().unwrap_or("");
        let rel_path = prefix.join(name);
        match entry.kind() {
            Some(ObjectType::Tree) => {
                if let Ok(obj) = entry.to_object(repo) {
                    if let Some(sub_tree) = obj.as_tree() {
                        paths.extend(collect_tree_paths(repo, &sub_tree, &rel_path));
                    }
                }
            }
            Some(ObjectType::Blob) => {
                paths.push(path_to_posix(&rel_path));
            }
            _ => {}
        }
    }
    paths
}

fn delete_extra_files(current_dir: &Path, snapshot_paths: &[String], skip_git: bool) -> Result<Vec<String>, String> {
    let mut deleted = Vec::new();
    let entries = std::fs::read_dir(current_dir).map_err(|e| format!("Read dir {}: {}", current_dir.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();

        if skip_git && name == ".git" { continue; }

        if path.is_dir() {
            let sub_snapshot: Vec<String> = snapshot_paths.iter()
                .filter(|p| p.starts_with(&format!("{}/", name)))
                .filter_map(|p| p.strip_prefix(&format!("{}/", name)))
                .map(|s| s.to_string())
                .collect();
            if sub_snapshot.is_empty() && name != "node_modules" {
                std::fs::remove_dir_all(&path).map_err(|e| format!("Remove dir {}: {}", path.display(), e))?;
                deleted.push(name);
            } else {
                let sub_deleted = delete_extra_files(&path, &sub_snapshot, false)?;
                deleted.extend(sub_deleted.iter().map(|s| format!("{}/{}", name, s)));
            }
        } else {
            if !snapshot_paths.contains(&name) {
                std::fs::remove_file(&path).map_err(|e| format!("Remove file {}: {}", path.display(), e))?;
                deleted.push(name);
            }
        }
    }
    Ok(deleted)
}

fn find_blob_in_tree(repo: &Repository, tree: &Tree, parts: &[&str]) -> Result<Oid, String> {
    if parts.len() == 1 {
        let entry = tree.iter()
            .find(|e| e.name() == Some(parts[0]))
            .ok_or_else(|| format!("File not found in tree: {}", parts[0]))?;
        if entry.kind() != Some(ObjectType::Blob) {
            return Err(format!("{} is not a file", parts[0]));
        }
        Ok(entry.id())
    } else {
        let entry = tree.iter()
            .find(|e| e.name() == Some(parts[0]))
            .ok_or_else(|| format!("Dir not found in tree: {}", parts[0]))?;
        if entry.kind() != Some(ObjectType::Tree) {
            return Err(format!("{} is not a directory", parts[0]));
        }
        let obj = entry.to_object(repo).map_err(|e| format!("To object: {}", e))?;
        let sub_tree = obj.as_tree().ok_or_else(|| format!("Not a tree: {}", parts[0]))?;
        find_blob_in_tree(repo, &sub_tree, &parts[1..])
    }
}

#[derive(serde::Serialize)]
pub struct SnapshotCommitResult {
    hash: String,
}

#[derive(serde::Serialize)]
pub struct SnapshotLogEntry {
    hash: String,
    message: String,
    timestamp: i64,
}

#[tauri::command]
pub fn snapshot_init(
    chat_key: String,
    workspace_path: String,
    file_paths: Option<Vec<String>>,
    app: tauri::AppHandle,
    _state: tauri::State<SnapshotState>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _repo = open_repo(&app_data_dir, &chat_key)?;

    let mut infos = _state.infos.lock().map_err(|e| e.to_string())?;
    infos.insert(chat_key, SnapshotInfo {
        workspace: workspace_path,
        file_paths,
    });

    Ok(())
}

#[tauri::command]
pub fn snapshot_commit(
    chat_key: String,
    message: String,
    app: tauri::AppHandle,
    state: tauri::State<SnapshotState>,
) -> Result<SnapshotCommitResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let repo = open_repo(&app_data_dir, &chat_key)?;

    let infos = state.infos.lock().map_err(|e| e.to_string())?;
    let info = infos.get(&chat_key).ok_or_else(|| format!("No snapshot info for {}", chat_key))?;
    let workspace = Path::new(&info.workspace);

    let tree_oid = match &info.file_paths {
        Some(paths) => build_tree_from_files(&repo, workspace, paths)?,
        None => build_tree_from_dir(&repo, workspace, workspace, true)?,
    };

    let commit_oid = create_commit(&repo, tree_oid, &message)?;

    Ok(SnapshotCommitResult {
        hash: commit_oid.to_string(),
    })
}

#[tauri::command]
pub fn snapshot_checkout_files(
    chat_key: String,
    commit_hash: String,
    file_paths: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<SnapshotState>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let repo = open_repo(&app_data_dir, &chat_key)?;

    let infos = state.infos.lock().map_err(|e| e.to_string())?;
    let info = infos.get(&chat_key).ok_or_else(|| format!("No snapshot info for {}", chat_key))?;
    let workspace = Path::new(&info.workspace);

    let oid = Oid::from_str(&commit_hash).map_err(|e| format!("Invalid hash: {}", e))?;
    let commit = repo.find_commit(oid).map_err(|e| format!("Find commit: {}", e))?;
    let tree = commit.tree().map_err(|e| format!("Commit tree: {}", e))?;

    for file_path in &file_paths {
        let abs_path = if Path::new(file_path).is_absolute() {
            PathBuf::from(file_path)
        } else {
            workspace.join(file_path)
        };
        let relative = abs_path.strip_prefix(workspace).unwrap_or(Path::new(file_path));
        let rel_str = path_to_posix(relative);
        let parts = split_path_parts(&rel_str);

        let blob_oid = find_blob_in_tree(&repo, &tree, &parts)?;
        let blob = repo.find_blob(blob_oid).map_err(|e| format!("Find blob {}: {}", rel_str, e))?;
        if let Some(parent) = abs_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Create parent {}: {}", parent.display(), e))?;
        }
        std::fs::write(&abs_path, blob.content()).map_err(|e| format!("Write {}: {}", abs_path.display(), e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn snapshot_restore(
    chat_key: String,
    commit_hash: String,
    app: tauri::AppHandle,
    state: tauri::State<SnapshotState>,
) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let repo = open_repo(&app_data_dir, &chat_key)?;

    let infos = state.infos.lock().map_err(|e| e.to_string())?;
    let info = infos.get(&chat_key).ok_or_else(|| format!("No snapshot info for {}", chat_key))?;
    let workspace = Path::new(&info.workspace);

    let oid = Oid::from_str(&commit_hash).map_err(|e| format!("Invalid hash: {}", e))?;
    let commit = repo.find_commit(oid).map_err(|e| format!("Find commit: {}", e))?;
    let tree = commit.tree().map_err(|e| format!("Commit tree: {}", e))?;

    let snapshot_paths = collect_tree_paths(&repo, &tree, Path::new(""));
    let written = write_tree_to_dir(&repo, &tree, workspace, Path::new(""))?;
    if info.file_paths.is_none() {
        let _deleted = delete_extra_files(workspace, &snapshot_paths, true)?;
    }

    Ok(written)
}

#[tauri::command]
pub fn snapshot_log(
    chat_key: String,
    app: tauri::AppHandle,
    _state: tauri::State<SnapshotState>,
) -> Result<Vec<SnapshotLogEntry>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let repo = open_repo(&app_data_dir, &chat_key)?;

    let head = repo.head().map_err(|e| format!("Head: {}", e))?;
    let head_oid = head.target().ok_or_else(|| "HEAD has no target".to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk.push(head_oid).map_err(|e| format!("Push: {}", e))?;

    let mut entries = Vec::new();
    for oid in revwalk {
        let oid = oid.map_err(|e| format!("Revwalk oid: {}", e))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("Find commit: {}", e))?;
        entries.push(SnapshotLogEntry {
            hash: commit.id().to_string(),
            message: commit.message().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn snapshot_destroy(
    chat_key: String,
    app: tauri::AppHandle,
    state: tauri::State<SnapshotState>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = snapshot_dir(&app_data_dir, &chat_key);

    {
        let mut infos = state.infos.lock().map_err(|e| e.to_string())?;
        infos.remove(&chat_key);
    }

    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Remove snapshot dir: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn path_to_posix_posix_path() {
        let p = Path::new("/home/user/docs");
        assert_eq!(path_to_posix(p), "/home/user/docs");
    }

    #[test]
    fn path_to_posix_windows_path() {
        let p = Path::new("C:\\Users\\docs");
        assert_eq!(path_to_posix(p), "C:/Users/docs");
    }

    #[test]
    fn path_to_posix_mixed_separators() {
        let p = Path::new("C:\\Users/docs\\file.txt");
        assert_eq!(path_to_posix(p), "C:/Users/docs/file.txt");
    }

    #[test]
    fn path_to_posix_simple_filename() {
        let p = Path::new("file.txt");
        assert_eq!(path_to_posix(p), "file.txt");
    }

    #[test]
    fn path_to_posix_empty() {
        let p = Path::new("");
        assert_eq!(path_to_posix(p), "");
    }

    #[test]
    fn split_path_parts_posix() {
        let parts = split_path_parts("src/components/App.tsx");
        assert_eq!(parts, vec!["src", "components", "App.tsx"]);
    }

    #[test]
    fn split_path_parts_windows() {
        let parts = split_path_parts("src\\components\\App.tsx");
        assert_eq!(parts, vec!["src", "components", "App.tsx"]);
    }

    #[test]
    fn split_path_parts_mixed() {
        let parts = split_path_parts("src\\components/App.tsx");
        assert_eq!(parts, vec!["src", "components", "App.tsx"]);
    }

    #[test]
    fn split_path_parts_empty() {
        let parts = split_path_parts("");
        assert_eq!(parts, Vec::<&str>::new());
    }

    #[test]
    fn split_path_parts_leading_slash() {
        let parts = split_path_parts("/home/user/docs");
        assert_eq!(parts, vec!["home", "user", "docs"]);
    }

    #[test]
    fn split_path_parts_trailing_slash() {
        let parts = split_path_parts("src/components/");
        assert_eq!(parts, vec!["src", "components"]);
    }

    #[test]
    fn split_path_parts_double_slash() {
        let parts = split_path_parts("src//components");
        assert_eq!(parts, vec!["src", "components"]);
    }

    #[test]
    fn safe_file_name_simple() {
        assert_eq!(safe_file_name("abc-123"), "abc-123");
    }

    #[test]
    fn safe_file_name_colon() {
        assert_eq!(safe_file_name("dir:C:/projects"), "dir_C__projects");
    }

    #[test]
    fn safe_file_name_backslash() {
        assert_eq!(safe_file_name("D:\\Users\\docs"), "D__Users_docs");
    }

    #[test]
    fn safe_file_name_forward_slash() {
        assert_eq!(safe_file_name("/home/user"), "_home_user");
    }

    #[test]
    fn safe_file_name_mixed() {
        assert_eq!(safe_file_name("dir:/D:\\docs"), "dir__D__docs");
    }

    #[test]
    fn safe_file_name_empty() {
        assert_eq!(safe_file_name(""), "");
    }

    #[test]
    fn safe_file_name_uuid() {
        assert_eq!(safe_file_name("ba089ae1-7594-4fae-a0c7-067f419121a3"), "ba089ae1-7594-4fae-a0c7-067f419121a3");
    }

    fn setup_temp_workspace() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_path_buf();
        std::fs::write(ws.join("file1.txt"), "hello").unwrap();
        std::fs::write(ws.join("file2.txt"), "world").unwrap();
        std::fs::create_dir(ws.join("sub")).unwrap();
        std::fs::write(ws.join("sub").join("nested.txt"), "nested content").unwrap();
        (tmp, ws)
    }

    fn init_repo_at(path: &Path) -> Repository {
        Repository::init_bare(path).unwrap()
    }

    #[test]
    fn workspace_restore_deletes_extra_files() {
        let (tmp, ws) = setup_temp_workspace();
        let repo_path = ws.join(".moflow-snapshots");
        let repo = init_repo_at(&repo_path);

        let tree_oid = build_tree_from_dir(&repo, &ws, &ws, true).unwrap();
        let commit_oid = create_commit(&repo, tree_oid, "round-1").unwrap();

        std::fs::write(ws.join("new_file.txt"), "added later").unwrap();

        let commit = repo.find_commit(commit_oid).unwrap();
        let tree = commit.tree().unwrap();
        let snapshot_paths = collect_tree_paths(&repo, &tree, Path::new(""));
        let written = write_tree_to_dir(&repo, &tree, &ws, Path::new("")).unwrap();
        let deleted = delete_extra_files(&ws, &snapshot_paths, true).unwrap();

        assert!(deleted.contains(&"new_file.txt".to_string()));
        assert!(!ws.join("new_file.txt").exists());
        assert!(ws.join("file1.txt").exists());
        assert!(ws.join("file2.txt").exists());
        assert!(ws.join("sub").join("nested.txt").exists());
        assert!(written.iter().any(|p| p.contains("file1.txt")));

        tmp.close().unwrap();
    }

    #[test]
    fn single_file_restore_preserves_other_files() {
        let (tmp, ws) = setup_temp_workspace();
        let repo_path = ws.join(".moflow-snapshots");
        let repo = init_repo_at(&repo_path);

        let single_file = path_to_posix(&ws.join("file1.txt"));
        let tree_oid = build_tree_from_files(&repo, &ws, &[single_file]).unwrap();
        let commit_oid = create_commit(&repo, tree_oid, "round-1").unwrap();

        std::fs::write(ws.join("file1.txt"), "modified content").unwrap();

        let commit = repo.find_commit(commit_oid).unwrap();
        let tree = commit.tree().unwrap();
        let _snapshot_paths = collect_tree_paths(&repo, &tree, Path::new(""));
        let written = write_tree_to_dir(&repo, &tree, &ws, Path::new("")).unwrap();

        assert!(ws.join("file2.txt").exists());
        assert!(ws.join("sub").join("nested.txt").exists());

        let content = std::fs::read_to_string(ws.join("file1.txt")).unwrap();
        assert_eq!(content, "hello");

        assert!(written.iter().any(|p| p.contains("file1.txt")));

        tmp.close().unwrap();
    }

    #[test]
    fn single_file_restore_with_delete_extra_would_destroy_other_files() {
        let (tmp, ws) = setup_temp_workspace();
        let repo_path = ws.join(".moflow-snapshots");
        let repo = init_repo_at(&repo_path);

        let single_file = path_to_posix(&ws.join("file1.txt"));
        let tree_oid = build_tree_from_files(&repo, &ws, &[single_file]).unwrap();
        let commit_oid = create_commit(&repo, tree_oid, "round-1").unwrap();

        let commit = repo.find_commit(commit_oid).unwrap();
        let tree = commit.tree().unwrap();
        let snapshot_paths = collect_tree_paths(&repo, &tree, Path::new(""));

        let deleted = delete_extra_files(&ws, &snapshot_paths, true).unwrap();

        assert!(deleted.contains(&"file2.txt".to_string()));
        assert!(!ws.join("file2.txt").exists());
        assert!(!ws.join("sub").exists());

        tmp.close().unwrap();
    }

    #[test]
    fn workspace_restore_after_multiple_changes() {
        let (tmp, ws) = setup_temp_workspace();
        let repo_path = ws.join(".moflow-snapshots");
        let repo = init_repo_at(&repo_path);

        let tree_oid1 = build_tree_from_dir(&repo, &ws, &ws, true).unwrap();
        let _commit_oid1 = create_commit(&repo, tree_oid1, "round-1").unwrap();

        std::fs::write(ws.join("file1.txt"), "changed v2").unwrap();
        std::fs::write(ws.join("extra.txt"), "extra file").unwrap();
        let tree_oid2 = build_tree_from_dir(&repo, &ws, &ws, true).unwrap();
        let commit_oid2 = create_commit(&repo, tree_oid2, "round-2").unwrap();

        std::fs::write(ws.join("file1.txt"), "changed v3").unwrap();
        std::fs::write(ws.join("another.txt"), "yet another").unwrap();

        let commit2 = repo.find_commit(commit_oid2).unwrap();
        let tree2 = commit2.tree().unwrap();
        let snapshot_paths2 = collect_tree_paths(&repo, &tree2, Path::new(""));
        write_tree_to_dir(&repo, &tree2, &ws, Path::new("")).unwrap();
        let deleted = delete_extra_files(&ws, &snapshot_paths2, true).unwrap();

        assert!(ws.join("file1.txt").exists());
        let f1 = std::fs::read_to_string(ws.join("file1.txt")).unwrap();
        assert_eq!(f1, "changed v2");
        assert!(!ws.join("another.txt").exists());
        assert!(deleted.contains(&"another.txt".to_string()));
        assert!(ws.join("extra.txt").exists());

        tmp.close().unwrap();
    }

    #[test]
    fn single_file_restore_does_not_touch_nested_paths() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_path_buf();
        std::fs::create_dir_all(ws.join("deep").join("nested")).unwrap();
        std::fs::write(ws.join("deep").join("nested").join("a.txt"), "aaa").unwrap();
        std::fs::write(ws.join("deep").join("nested").join("b.txt"), "bbb").unwrap();
        std::fs::write(ws.join("top.txt"), "top content").unwrap();

        let repo_path = ws.join(".moflow-snapshots");
        let repo = init_repo_at(&repo_path);

        let target = path_to_posix(&ws.join("deep").join("nested").join("a.txt"));
        let tree_oid = build_tree_from_files(&repo, &ws, &[target]).unwrap();
        let commit_oid = create_commit(&repo, tree_oid, "round-1").unwrap();

        std::fs::write(ws.join("deep").join("nested").join("a.txt"), "modified aaa").unwrap();

        let commit = repo.find_commit(commit_oid).unwrap();
        let tree = commit.tree().unwrap();
        write_tree_to_dir(&repo, &tree, &ws, Path::new("")).unwrap();

        assert!(ws.join("deep").join("nested").join("b.txt").exists());
        assert!(ws.join("top.txt").exists());
        let a = std::fs::read_to_string(ws.join("deep").join("nested").join("a.txt")).unwrap();
        assert_eq!(a, "aaa");

        tmp.close().unwrap();
    }
}