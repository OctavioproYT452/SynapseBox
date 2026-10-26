# Versión 2.16.1

Lector y editor de código con resaltador de sintaxis local en los archivos del usuario.

## Novedades
- **Resaltador de sintaxis local:** nuevo `public/js/codeview.js`, sin librerías ni CDN (funciona sin Internet). Entiende JavaScript/TypeScript, JSON, HTML/XML, CSS/SCSS, Python, Java/C#/Kotlin, C/C++, PHP, Go, Rust, Shell, SQL, YAML, INI/TOML/.env, Markdown, CSV y registros.
- **«Ver» ahora abre un lector de solo lectura** para JSON, código y texto: resaltado, numeración, copiar, ajustar líneas y, en JSON, validación y vista formateada (el archivo no se modifica). No hay ningún campo de texto, así que en el móvil **no aparece el teclado**. Con permiso de escritura se ofrece **Editar** desde el propio lector.
- **«Editar» parece un editor de verdad:** resaltado mientras escribes, numeración, línea actual marcada, barra de estado (línea/columna, selección, JSON válido o no), punto de cambios sin guardar, aviso al cerrar con cambios, **Ctrl+S**, **Ctrl+/**, **Tab / Mayús+Tab**, sangría automática, cierre automático de paréntesis, corchetes, llaves y comillas, y deshacer del navegador conservado. En móvil usa letra de 15 px y pantalla completa.
- Más extensiones reconocidas como texto/código en el panel: `.ts .tsx .jsx .mjs .cjs .vue .scss .less .go .rs .rb .cs .kt .swift .sh .bash .sql .yaml .toml .conf .cfg .env .properties .tsv .markdown` y otras.

## Compatibilidad
- Sin cambios en el servidor, la base de datos, los plugins ni las rutas: se usan los mismos `/api/file-content` y `/api/edit` (límite de 2 MB para abrir archivos, como antes).
- Los archivos de más de 300 KB se muestran/editan sin colores para no ralentizar; el lector muestra las primeras 5000 líneas.
- Los archivos HTML no resaltan el JavaScript ni el CSS que lleven dentro.

## Archivos modificados
- Nuevos: `public/js/codeview.js`, `public/codeview.css`
- `public/js/panel.js`, `public/panel.html`
- `README.md`, `RELEASE.md`, `package.json`, `data/version.json`
