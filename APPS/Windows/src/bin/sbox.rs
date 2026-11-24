//! sbox.exe: línea de órdenes de SynapseBox (programa de consola). Ver «sbox help».
use synapsebox_core::cli;

extern "system" { fn SetConsoleOutputCP(code_page: u32) -> i32; }

fn main() {
    unsafe { SetConsoleOutputCP(65001); } // UTF-8 para tildes y eñes en la consola
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(cli::run(args));
}
