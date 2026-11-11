//! K2 kill test (T007): a dependency-free contract with one method that logs "K2 ok".
//! Wasm-only; on the host (cargo test --workspace) the crate is empty.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
mod wasm {
    #[link(wasm_import_module = "env")]
    extern "C" {
        fn log_utf8(len: u64, ptr: u64);
    }

    #[no_mangle]
    pub extern "C" fn ping() {
        let msg = b"K2 ok";
        unsafe { log_utf8(msg.len() as u64, msg.as_ptr() as u64) }
    }

    #[panic_handler]
    fn panic(_: &core::panic::PanicInfo) -> ! {
        core::arch::wasm32::unreachable()
    }
}
