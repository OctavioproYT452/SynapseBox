//! Iconos SVG simbólicos (se recolorean con el tema, claro u oscuro). Van incluidos en el binario: al abrir la interfaz se
//! escriben en ~/.cache/synapsebox/icons/hicolor/scalable/actions/ y se añaden a la ruta de búsqueda de iconos de GTK.
use crate::config::cache_dir;
use gtk4 as gtk;
use gtk::prelude::*;

/// (nombre sin prefijo, trazado SVG en una cuadrícula de 24×24; iconos de Material Design, licencia Apache 2.0)
const ICONS: &[(&str, &str)] = &[
    ("home", "M10,20v-6h4v6h5v-8h3L12,3 2,12h3v8z"),
    ("sync", "M12,4V1L8,5l4,4V6c3.31,0 6,2.69 6,6 0,1.01 -0.25,1.97 -0.7,2.8l1.46,1.46C19.54,15.03 20,13.57 20,12c0,-4.42 -3.58,-8 -8,-8zM12,18c-3.31,0 -6,-2.69 -6,-6 0,-1.01 0.25,-1.97 0.7,-2.8L5.24,7.74C4.46,8.97 4,10.43 4,12c0,4.42 3.58,8 8,8v3l4,-4 -4,-4v3z"),
    ("update", "M4,12l1.41,1.41L11,7.83V20h2V7.83l5.58,5.59L20,12l-8,-8 -8,8z"),
    ("account", "M12,12c2.21,0 4,-1.79 4,-4s-1.79,-4 -4,-4 -4,1.79 -4,4 1.79,4 4,4zM12,14c-2.67,0 -8,1.34 -8,4v2h16v-2c0,-2.66 -5.33,-4 -8,-4z"),
    ("folder", "M10,4H4c-1.1,0 -1.99,0.9 -1.99,2L2,18c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V8c0,-1.1 -0.9,-2 -2,-2h-8l-2,-2z"),
    ("upload", "M9,16h6v-6h4l-7,-7 -7,7h4zM5,18h14v2H5z"),
    ("check", "M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41,-1.41z"),
    ("warn", "M1,21h22L12,2 1,21zM13,18h-2v-2h2v2zM13,14h-2v-4h2v4z"),
    ("error", "M12,2C6.47,2 2,6.47 2,12s4.47,10 10,10 10,-4.47 10,-10S17.53,2 12,2zM17,15.59L15.59,17 12,13.41 8.41,17 7,15.59 10.59,12 7,8.41 8.41,7 12,10.59 15.59,7 17,8.41 13.41,12 17,15.59z"),
    ("dot-on", "M12,6c-3.31,0 -6,2.69 -6,6s2.69,6 6,6 6,-2.69 6,-6 -2.69,-6 -6,-6z"),
    ("dot-off", "M12,6c-3.31,0 -6,2.69 -6,6s2.69,6 6,6 6,-2.69 6,-6 -2.69,-6 -6,-6zM12,16c-2.21,0 -4,-1.79 -4,-4s1.79,-4 4,-4 4,1.79 4,4 -1.79,4 -4,4z"),
];

fn svg(path: &str) -> String {
    format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"#2e3436\" fill-rule=\"evenodd\" d=\"{}\"/></svg>\n", path)
}

/// Escribe los iconos y los registra en GTK. Llamar una vez, con la pantalla ya inicializada.
pub fn setup() {
    let base = cache_dir().join("icons");
    let dir = base.join("hicolor/scalable/actions");
    if std::fs::create_dir_all(&dir).is_err() { return }
    for (n, p) in ICONS { let _ = std::fs::write(dir.join(format!("sbox-{}-symbolic.svg", n)), svg(p)); }
    if let Some(d) = gtk::gdk::Display::default() { gtk::IconTheme::for_display(&d).add_search_path(&base); }
}

pub fn image(name: &str) -> gtk::Image {
    let i = gtk::Image::from_icon_name(&format!("sbox-{}-symbolic", name)); i.set_pixel_size(16); i
}

/// Icono + texto en una fila (un `gtk::Label` no puede llevar imágenes dentro). Con nombre de icono vacío, solo texto.
#[derive(Clone)]
pub struct IconText { pub root: gtk::Box, img: gtk::Image, pub label: gtk::Label }
impl IconText {
    pub fn new(icon: &str, text: &str) -> IconText {
        let root = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        let img = image(if icon.is_empty() { "dot-off" } else { icon }); img.set_visible(!icon.is_empty());
        let label = gtk::Label::builder().label(text).xalign(0.0).wrap(true).build();
        root.append(&img); root.append(&label);
        IconText { root, img, label }
    }
    pub fn set(&self, icon: &str, text: &str) {
        if icon.is_empty() { self.img.set_visible(false); } else { self.img.set_icon_name(Some(&format!("sbox-{}-symbolic", icon))); self.img.set_visible(true); }
        self.label.set_label(text);
    }
}
