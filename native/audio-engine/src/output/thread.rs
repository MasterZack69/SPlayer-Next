#[cfg(not(target_os = "windows"))]
use anyhow::Result;

/// 常驻 MTA 工作线程，所有 cpal 调用都派给它执行。
///
/// cpal 的 `com_initialized()` 会把首次触碰的线程初始化成 STA；cpal 的
/// `IMMDeviceEnumerator` 又是进程级单例，创建时所处的 apartment 决定它此后能否跨线程
/// 安全使用。一条永不退出、永不 `CoUninitialize` 的 MTA 线程同时收口这两点，并保证进程
/// MTA 不会在两次调用之间被拆掉——`AudioOutput` 持有的 `cpal::Device` 里缓存着在该
/// apartment 里激活的 `IAudioClient`。
#[cfg(target_os = "windows")]
mod mta {
    use std::panic::{catch_unwind, AssertUnwindSafe};
    use std::sync::mpsc::{channel, sync_channel, SyncSender};
    use std::sync::OnceLock;
    use std::thread;

    use anyhow::{anyhow, Result};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    type Job = Box<dyn FnOnce() + Send + 'static>;

    static WORKER: OnceLock<Option<SyncSender<Job>>> = OnceLock::new();

    fn worker() -> Result<&'static SyncSender<Job>> {
        WORKER
            .get_or_init(|| {
                let (job_tx, job_rx) = sync_channel::<Job>(1);
                thread::Builder::new()
                    .name("audio-mta-worker".into())
                    .spawn(move || {
                        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
                        for job in job_rx {
                            // cpal 的设备枚举路径上有 unwrap/expect，单个任务 panic 不能带走整条线程
                            let _ = catch_unwind(AssertUnwindSafe(job));
                        }
                    })
                    .ok()
                    .map(|_| job_tx)
            })
            .as_ref()
            .ok_or_else(|| anyhow!("启动 MTA 线程失败"))
    }

    /// 把 `f` 派给 MTA 线程执行并等待结果。调用按到达顺序串行执行
    pub(crate) fn run<T: Send + 'static>(
        f: impl FnOnce() -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let (result_tx, result_rx) = channel();
        worker()?
            .send(Box::new(move || {
                let _ = result_tx.send(f());
            }))
            .map_err(|_| anyhow!("MTA 线程已退出"))?;
        result_rx
            .recv()
            .map_err(|_| anyhow!("MTA 线程发生 panic"))?
    }
}

#[cfg(target_os = "windows")]
pub(super) use mta::run as run_in_mta;

#[cfg(not(target_os = "windows"))]
pub(super) fn run_in_mta<T, F: FnOnce() -> Result<T>>(f: F) -> Result<T> {
    f()
}
