//! Original retained directory identities and no-follow pre-open traversal.
//! Legacy path-only consumers still do not gain an atomic descriptor-relative VFS.
use std::{io, path::{Path, PathBuf}, sync::Arc};
#[cfg(unix)]
use std::os::{fd::{AsRawFd, FromRawFd, OwnedFd}, unix::ffi::OsStrExt};

#[cfg(unix)]
struct Directory { fd: OwnedFd, dev: u64, ino: u64 }
#[cfg(unix)]
struct NamedDirectory { parent: Arc<Directory>, name: std::ffi::CString, directory: Arc<Directory> }
pub struct ScopePathBinding {
    #[cfg(unix)]
    chain: Vec<NamedDirectory>,
    root: PathBuf, paths: Vec<PathBuf>,
}
fn denied() -> io::Error { io::Error::new(io::ErrorKind::PermissionDenied, "scoped mutable directory identity/link/containment unavailable") }
#[cfg(unix)]
fn owned(fd: i32) -> io::Result<Arc<Directory>> {
    if fd < 0 { return Err(io::Error::last_os_error()); }
    let fd = unsafe { OwnedFd::from_raw_fd(fd) };
    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe { libc::fstat(fd.as_raw_fd(), stat.as_mut_ptr()) } != 0 { return Err(io::Error::last_os_error()); }
    let stat = unsafe { stat.assume_init() };
    if stat.st_mode & libc::S_IFMT != libc::S_IFDIR { return Err(denied()); }
    Ok(Arc::new(Directory { fd, dev: stat.st_dev as u64, ino: stat.st_ino as u64 }))
}
#[cfg(unix)]
fn open_child(parent: &Directory, name: &std::ffi::CString, create: bool) -> io::Result<Arc<Directory>> {
    let flags = libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC;
    let mut fd = unsafe { libc::openat(parent.fd.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 && create && io::Error::last_os_error().kind()==io::ErrorKind::NotFound {
        if unsafe { libc::mkdirat(parent.fd.as_raw_fd(), name.as_ptr(), 0o700) } != 0 &&
            io::Error::last_os_error().kind()!=io::ErrorKind::AlreadyExists { return Err(io::Error::last_os_error()); }
        // EEXIST is not trusted: the actual next component must open O_NOFOLLOW.
        fd = unsafe { libc::openat(parent.fd.as_raw_fd(), name.as_ptr(), flags) };
    }
    owned(fd)
}
impl ScopePathBinding {
    pub(crate) fn capture(root: &Path, paths: &[PathBuf]) -> io::Result<Arc<Self>> {
        if !root.is_absolute() || root==Path::new("/") || std::fs::canonicalize(root)?!=root ||
            paths.iter().any(|path|!path.is_absolute() || !path.starts_with(root)) { return Err(denied()); }
        #[cfg(not(unix))] { let _=paths; return Err(denied()); }
        #[cfg(unix)] {
            let slash = std::ffi::CString::new("/").map_err(|_|denied())?;
            let first = owned(unsafe { libc::open(slash.as_ptr(), libc::O_RDONLY|libc::O_DIRECTORY|libc::O_NOFOLLOW|libc::O_CLOEXEC) })?;
            let mut chain = Vec::new(); let mut parent=first;
            for component in root.components() {
                let std::path::Component::Normal(component)=component else {
                    if matches!(component,std::path::Component::RootDir) { continue; } return Err(denied());
                };
                let name=std::ffi::CString::new(component.as_bytes()).map_err(|_|denied())?;
                let directory=open_child(&parent,&name,false)?;
                chain.push(NamedDirectory { parent:parent.clone(),name,directory:directory.clone() });parent=directory;
            }
            let root_directory=parent;
            for path in paths {
                let relative=path.strip_prefix(root).map_err(|_|denied())?;
                let mut parent=root_directory.clone();
                for component in relative.components() {
                    let std::path::Component::Normal(component)=component else { return Err(denied()); };
                    let name=std::ffi::CString::new(component.as_bytes()).map_err(|_|denied())?;
                    let directory=open_child(&parent,&name,true)?;
                    chain.push(NamedDirectory { parent:parent.clone(),name,directory:directory.clone() });parent=directory;
                }
            }
            let value=Arc::new(Self { chain,root:root.to_path_buf(),paths:paths.to_vec() });
            value.verify_before_mutable_start()?;Ok(value)
        }
    }
    pub(crate) fn verify_before_mutable_start(&self) -> io::Result<()> {
        #[cfg(not(unix))] { return Err(denied()); }
        #[cfg(unix)] {
            if std::fs::canonicalize(&self.root)?!=self.root { return Err(denied()); }
            for item in &self.chain {
                let actual=open_child(&item.parent,&item.name,false)?;
                if actual.dev!=item.directory.dev || actual.ino!=item.directory.ino { return Err(denied()); }
            }
            for path in &self.paths { if !std::fs::canonicalize(path)?.starts_with(&self.root) { return Err(denied()); } }
            Ok(())
        }
    }
}

#[cfg(all(test,unix))]
mod tests {
    use super::*;
    #[test]
    fn actual_log_symlink_outside_root_is_rejected_before_mutable_open() {
        let test=tempfile::tempdir().unwrap();let root=test.path().join("scope");let outside=test.path().join("outside");
        std::fs::create_dir(&root).unwrap();std::fs::create_dir(&outside).unwrap();let root=std::fs::canonicalize(root).unwrap();
        std::os::unix::fs::symlink(&outside,root.join("log")).unwrap();
        assert!(ScopePathBinding::capture(&root,&[root.join("log")]).is_err());
        assert_eq!(std::fs::read_dir(outside).unwrap().count(),0);
    }
    #[test]
    fn sqlite_ancestor_symlink_cannot_pass_lexical_containment() {
        let test=tempfile::tempdir().unwrap();let root=test.path().join("scope");let outside=test.path().join("outside");
        std::fs::create_dir(&root).unwrap();std::fs::create_dir(&outside).unwrap();let root=std::fs::canonicalize(root).unwrap();
        std::os::unix::fs::symlink(&outside,root.join("db")).unwrap();
        assert!(ScopePathBinding::capture(&root,&[root.join("db/sqlite")]).is_err());
        assert!(!outside.join("sqlite").exists());
    }
    #[test]
    fn replaced_ancestor_invalidates_original_retained_directory_identity() {
        let test=tempfile::tempdir().unwrap();let root=test.path().join("scope");std::fs::create_dir(&root).unwrap();let root=std::fs::canonicalize(root).unwrap();
        let retained=ScopePathBinding::capture(&root,&[root.join("log/cache")]).unwrap();
        std::fs::rename(root.join("log"),root.join("old-log")).unwrap();std::fs::create_dir(root.join("log")).unwrap();
        assert!(retained.verify_before_mutable_start().is_err());
    }
}
