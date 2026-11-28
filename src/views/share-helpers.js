// Piezas de HTML y formato para la página pública de un enlace compartido.
const { esc } = require("../lib/utils");
const { themeCss } = require("../services/themes");

const IC = (n, c = "") => `<svg class="i ${c}"><use href="/icons.svg#${n}"/></svg>`;
const page = (t, b, th, scripts = "") => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#3b82f6"><link rel="stylesheet" href="/style.css"><style>${themeCss(th)}</style><script src="/js/bgmedia.js" defer></script></head><body><header class="top"><a class="brand" href="/"><span class="logo">${IC("cloud")}</span>SynapseBox</a></header><main class="wrap share">${b}</main><footer class="foot muted">Compartido con SynapseBox · <a href="/legal.html#privacidad">Privacidad</a> · <a href="/legal.html#terminos">Términos</a> · <a href="/legal.html#creditos">Créditos</a></footer>${scripts}</body></html>`;
const bytes = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(1) + " MB" : (b / 1073741824).toFixed(2) + " GB";
const KINDS = { image: ".png .jpg .jpeg .gif .webp .bmp .svg .ico", video: ".mp4 .webm .mov .mkv .ogg", audio: ".mp3 .wav .flac .m4a .aac", doc: ".pdf .doc .docx .txt .md .odt .csv .xls .xlsx .ppt .pptx .rtf .ods .odp", code: ".js .json .html .htm .css .xml .py .java .c .cpp .h .php .yml" };
const kind = e => Object.keys(KINDS).find(k => KINDS[k].split(" ").includes(e)) || "file";
const expTxt = s => s.expires_at ? "Caduca el " + new Date(s.expires_at).toLocaleDateString("es") : "Sin caducidad";

module.exports = { IC, page, bytes, kind, expTxt };
