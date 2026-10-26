//! Windows source implementation. Requires real Windows build/runtime validation.
use super::*;
use ::windows::{
    core::{implement, Error, Ref, Result as WinResult, HRESULT, PCWSTR},
    Win32::{
        Foundation::HANDLE,
        Storage::FileSystem::{GetFinalPathNameByHandleW, GETFINALPATHNAMEBYHANDLE_FLAGS},
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
        UI::Shell::{
            FileOperation, IFileOperation, IFileOperationProgressSink,
            IFileOperationProgressSink_Impl, IShellItem, SHCreateItemFromParsingName,
            FOFX_EARLYFAILURE, FOFX_RECYCLEONDELETE, FOF_NOERRORUI, FOF_SILENT, SIGDN_FILESYSPATH,
        },
    },
};
use std::{
    ffi::c_void,
    os::windows::{ffi::OsStrExt, io::AsRawHandle},
    sync::Mutex,
};

const ABORT: HRESULT = HRESULT(0x80004004_u32 as i32);
fn abort() -> Error {
    Error::from_hresult(ABORT)
}

struct ComApartment;
impl Drop for ComApartment {
    fn drop(&mut self) {
        // SAFETY: created only after successful CoInitializeEx on this thread.
        unsafe { CoUninitialize() };
    }
}

#[derive(Default)]
struct Completion {
    pre_seen: bool,
    result: Option<Result<PathBuf, String>>,
}

#[implement(IFileOperationProgressSink)]
struct RecycleSink {
    source: Arc<AuthorizedTrashSource>,
    completion: Arc<Mutex<Completion>>,
}

// Names and signatures implement the Windows SDK COM interface verbatim.
#[allow(non_snake_case)]
impl IFileOperationProgressSink_Impl for RecycleSink_Impl {
    fn StartOperations(&self) -> WinResult<()> {
        Ok(())
    }
    fn FinishOperations(&self, _result: HRESULT) -> WinResult<()> {
        Ok(())
    }
    fn PreRenameItem(&self, _: u32, _: Ref<IShellItem>, _: &PCWSTR) -> WinResult<()> {
        Err(abort())
    }
    fn PostRenameItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        _: &PCWSTR,
        _: HRESULT,
        _: Ref<IShellItem>,
    ) -> WinResult<()> {
        Err(abort())
    }
    fn PreMoveItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        _: Ref<IShellItem>,
        _: &PCWSTR,
    ) -> WinResult<()> {
        Err(abort())
    }
    fn PostMoveItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        _: Ref<IShellItem>,
        _: &PCWSTR,
        _: HRESULT,
        _: Ref<IShellItem>,
    ) -> WinResult<()> {
        Err(abort())
    }
    fn PreCopyItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        _: Ref<IShellItem>,
        _: &PCWSTR,
    ) -> WinResult<()> {
        Err(abort())
    }
    fn PostCopyItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        _: Ref<IShellItem>,
        _: &PCWSTR,
        _: HRESULT,
        _: Ref<IShellItem>,
    ) -> WinResult<()> {
        Err(abort())
    }
    fn PreDeleteItem(&self, flags: u32, item: Ref<IShellItem>) -> WinResult<()> {
        // Do not approve a callback that no longer describes recycling. This
        // supplements, rather than replaces, FOFX_RECYCLEONDELETE.
        if flags & 0x80 == 0 || self.source.verify().is_err() {
            return Err(abort());
        }
        let item = item.as_ref().ok_or_else(abort)?;
        let path = shell_path(item)?;
        let expected = current_path(self.source.parent.as_ref())
            .map_err(|_| abort())?
            .join(&self.source.name);
        if path != expected {
            return Err(abort());
        }
        let mut completion = self.completion.lock().map_err(|_| abort())?;
        if completion.pre_seen {
            return Err(abort());
        }
        completion.pre_seen = true;
        Ok(())
    }
    fn PostDeleteItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        result: HRESULT,
        new_item: Ref<IShellItem>,
    ) -> WinResult<()> {
        let observed = result
            .ok()
            .and_then(|()| shell_path(new_item.as_ref().ok_or_else(abort)?))
            .map_err(|error| error.to_string());
        let mut completion = self.completion.lock().map_err(|_| abort())?;
        if !completion.pre_seen || completion.result.is_some() {
            return Err(abort());
        }
        completion.result = Some(observed);
        Ok(())
    }
    fn PreNewItem(&self, _: u32, _: Ref<IShellItem>, _: &PCWSTR) -> WinResult<()> {
        Err(abort())
    }
    fn PostNewItem(
        &self,
        _: u32,
        _: Ref<IShellItem>,
        _: &PCWSTR,
        _: &PCWSTR,
        _: u32,
        _: HRESULT,
        _: Ref<IShellItem>,
    ) -> WinResult<()> {
        Err(abort())
    }
    fn UpdateProgress(&self, _: u32, _: u32) -> WinResult<()> {
        Ok(())
    }
    fn ResetTimer(&self) -> WinResult<()> {
        Ok(())
    }
    fn PauseTimer(&self) -> WinResult<()> {
        Ok(())
    }
    fn ResumeTimer(&self) -> WinResult<()> {
        Ok(())
    }
}

fn current_path(file: &impl AsRawHandle) -> io::Result<PathBuf> {
    let mut buffer = vec![0_u16; 32768];
    // SAFETY: borrowed valid handle, bounded writable buffer, DOS normalized path.
    let length = unsafe {
        GetFinalPathNameByHandleW(
            HANDLE(file.as_raw_handle()),
            &mut buffer,
            GETFINALPATHNAMEBYHANDLE_FLAGS(0),
        )
    } as usize;
    if length == 0 {
        return Err(io::Error::last_os_error());
    }
    if length >= buffer.len() {
        return Err(changed());
    }
    Ok(normalize_path(
        String::from_utf16(&buffer[..length]).map_err(io::Error::other)?,
    ))
}

fn normalize_path(value: String) -> PathBuf {
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else {
        PathBuf::from(value.strip_prefix(r"\\?\").unwrap_or(&value))
    }
}

fn shell_path(item: &IShellItem) -> WinResult<PathBuf> {
    // SAFETY: owned COM object, API allocates the returned string with COM task
    // allocator; free it exactly once after decoding, including the error path.
    let value = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH)? };
    let path = unsafe { value.to_string() };
    unsafe { CoTaskMemFree(Some(value.0.cast::<c_void>())) };
    Ok(normalize_path(path?))
}

pub(super) fn trash(source: &AuthorizedTrashSource) -> Result<TrashPlacement, TrashFailure> {
    let retained = AuthorizedTrashSource::new(
        Arc::clone(&source.parent),
        source.name.clone(),
        Arc::clone(&source.source),
        Arc::clone(&source.identity),
        source.kind,
    )
    .map_err(not_moved)?;
    // A fresh thread guarantees STA even when the host's reusable blocking
    // worker previously initialized COM as MTA. No COM object crosses threads.
    std::thread::spawn(move || trash_sta(&retained))
        .join()
        .map_err(|_| uncertain("Recycle worker terminated without a receipt", None))?
}

fn trash_sta(source: &AuthorizedTrashSource) -> Result<TrashPlacement, TrashFailure> {
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
        .ok()
        .map_err(not_moved)?;
    let _apartment = ComApartment;
    let path = current_path(source.parent.as_ref())
        .map_err(not_moved)?
        .join(&source.name);
    if current_path(source.source.as_ref()).map_err(not_moved)? != path {
        return Err(not_moved(changed()));
    }
    source.verify().map_err(not_moved)?;
    let retained = Arc::new(
        AuthorizedTrashSource::new(
            Arc::clone(&source.parent),
            source.name.clone(),
            Arc::clone(&source.source),
            Arc::clone(&source.identity),
            source.kind,
        )
        .map_err(not_moved)?,
    );
    let completion = Arc::new(Mutex::new(Completion::default()));
    let sink: IFileOperationProgressSink = RecycleSink {
        source: retained,
        completion: Arc::clone(&completion),
    }
    .into();
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: initialized COM apartment and NUL-terminated validated native path.
    let operation: IFileOperation =
        unsafe { CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER) }
            .map_err(not_moved)?;
    let item: IShellItem =
        unsafe { SHCreateItemFromParsingName(PCWSTR(path.as_ptr()), None) }.map_err(not_moved)?;
    unsafe {
        operation.SetOperationFlags(
            FOFX_RECYCLEONDELETE | FOF_NOERRORUI | FOFX_EARLYFAILURE | FOF_SILENT,
        )
    }
    .map_err(not_moved)?;
    unsafe { operation.DeleteItem(&item, &sink) }.map_err(not_moved)?;
    let performed = unsafe { operation.PerformOperations() };
    let aborted = unsafe { operation.GetAnyOperationsAborted() };
    let observed = completion
        .lock()
        .map_err(|_| uncertain("Recycle sink poisoned", None))?
        .result
        .take();
    match observed {
        Some(Ok(path)) => {
            if performed.is_err() || !aborted.is_ok_and(|value| !value.as_bool()) {
                return Err(uncertain(
                    "Recycle completion was aborted or failed",
                    Some(path),
                ));
            }
            capture_result(source, path)
        }
        Some(Err(error)) => Err(recycle_failure(source, error)),
        None => Err(recycle_failure(source, "No confirmed Recycle Bin result")),
    }
}

fn recycle_failure(source: &AuthorizedTrashSource, error: impl fmt::Display) -> TrashFailure {
    // A directory's root identity alone cannot rule out partial child effects
    // after the Shell ran; never label that case safely retryable NotMoved.
    if source.kind == EntryKind::Directory {
        uncertain(error, None)
    } else {
        failed_system_call(source, error)
    }
}

// Mirrors FILE_RENAME_INFO; ReplaceIfExists and RootDirectory stay zero.
#[allow(dead_code)]
#[repr(C)]
struct RenameInfo {
    replace: u32,
    root: *mut c_void,
    name_bytes: u32,
    name: [u16; 1],
}
#[link(name = "kernel32")]
unsafe extern "system" {
    fn SetFileInformationByHandle(
        handle: *mut c_void,
        class: i32,
        info: *const c_void,
        size: u32,
    ) -> i32;
}

/// FILE_READ_DATA/LIST_DIRECTORY + FILE_READ_ATTRIBUTES + FILE_WRITE_ATTRIBUTES + SYNCHRONIZE,
/// every share mode, and no DELETE: a retained handle holding DELETE would make cap-std directory
/// opens (which share only READ|WRITE) fail with ERROR_SHARING_VIOLATION, and Win32 only needs
/// DELETE on the short-lived handle that performs a rename.
const RETAINED_ACCESS: u32 = 0x0010_0181;
const RENAME_ACCESS: u32 = 0x0011_0181;
// FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT.
const ENTRY_FLAGS: u32 = 0x0200_0000 | 0x0020_0000;

fn open_path(path: &Path, access: u32) -> io::Result<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .access_mode(access)
        .share_mode(7)
        .custom_flags(ENTRY_FLAGS)
        .open(path)
}

pub(super) fn open_entry(directory: &Dir, name: &Path) -> io::Result<File> {
    single_name(name)?;
    Ok(File::from_std(open_path(
        &current_path(directory)?.join(name),
        RETAINED_ACCESS,
    )?))
}

/// Win32 rejects a RootDirectory handle for FILE_RENAME_INFO, so the destination is the source
/// parent's full path plus the name. The retained handle holds no DELETE right: a short-lived
/// handle to the same object, checked against it, performs the rename.
pub(super) fn restore(placement: &TrashPlacement) -> io::Result<()> {
    let target = current_path(placement.original_parent.as_ref())?.join(&placement.original_name);
    let handle = open_path(&current_path(placement.source.as_ref())?, RENAME_ACCESS)?;
    if same_file::Handle::from_file(handle.try_clone()?)? != *placement.identity {
        return Err(changed());
    }
    let name: Vec<u16> = target.as_os_str().encode_wide().collect();
    let length = std::mem::offset_of!(RenameInfo, name) + (name.len() + 1) * 2;
    let mut storage = vec![0_usize; length.div_ceil(std::mem::size_of::<usize>())];
    let info = storage.as_mut_ptr().cast::<RenameInfo>();
    // SAFETY: aligned zeroed buffer contains FILE_RENAME_INFO with ReplaceIfExists false and a null
    // RootDirectory; the verified short-lived handle outlives this synchronous call.
    unsafe {
        (*info).name_bytes = (name.len() * 2) as u32;
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            std::ptr::addr_of_mut!((*info).name).cast(),
            name.len(),
        );
        if SetFileInformationByHandle(handle.as_raw_handle(), 3, info.cast(), length as u32) == 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}
