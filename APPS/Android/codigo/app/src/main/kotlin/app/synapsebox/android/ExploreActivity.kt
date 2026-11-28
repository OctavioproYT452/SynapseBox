package app.synapsebox.android

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.webkit.MimeTypeMap
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.DateFormat
import java.util.Date

/** Explorar: busca por nombre y filtra tus archivos por tipo, recientes o carpetas vacías (necesita servidor 2.26 o superior). */
class ExploreActivity : SecureActivity() {
    private lateinit var box: LinearLayout
    private var pending: Api.Item? = null

    private val save = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val it = pending ?: return@registerForActivityResult; pending = null
        if (uri == null) return@registerForActivityResult
        toast("Descargando…")
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val tmp = File(cacheDir, "adminview").apply { mkdirs() }.let { File(it, "dl.tmp") }
                    Api.download(it.path, tmp)
                    (contentResolver.openOutputStream(uri) ?: throw java.io.IOException("No se pudo abrir el destino")).use { o -> tmp.inputStream().use { i -> i.copyTo(o) } }
                    tmp.delete()
                }
                toast("Guardado")
            } catch (e: Exception) { fail(e) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.token == null) { startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        File(cacheDir, "adminview").deleteRecursively()
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val h = hero("Explorar", "Busca y filtra tus archivos")
        val q = input(b, "Buscar por nombre (2 letras o más)", InputType.TYPE_CLASS_TEXT)
        q.imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH
        q.setOnEditorActionListener { _, _, _ -> run("api/search", "q" to q.text.toString().trim()); true }
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val chips = listOf<Pair<String, () -> Unit>>(
            "Buscar" to { run("api/search", "q" to q.text.toString().trim()) },
            "Recientes" to { run("api/recent") },
            "Imágenes" to { run("api/by-type", "type" to "images") },
            "Vídeos" to { run("api/by-type", "type" to "video") },
            "Audio" to { run("api/by-type", "type" to "audio") },
            "Documentos" to { run("api/by-type", "type" to "docs") },
            "Comprimidos" to { run("api/by-type", "type" to "archives") },
            "Carpetas vacías" to { run("api/empty-folders") },
        )
        for ((t, act) in chips) btn(bar, t, 1) { act() }.apply { layoutParams = LinearLayout.LayoutParams(-2, -2).apply { marginEnd = px(8); topMargin = px(10) } }
        b.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(bar) })
        box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; b.addView(box)
        label(box, "Elige un filtro o escribe para buscar.", 14f, alpha = .7f, top = 16)
        setContentView(page(h, b))
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun fail(e: Exception) {
        if (e is AuthException) { Prefs.clearSession(); startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        val m = if (e is ApiException && e.code == 404) "Tu servidor es antiguo: Explorar necesita SynapseBox 2.26 o superior" else e.message ?: e.javaClass.simpleName
        Toast.makeText(this, m, Toast.LENGTH_LONG).show()
    }

    private fun run(ep: String, vararg q: Pair<String, String>) {
        box.removeAllViews(); label(box, "Cargando…", 14f, alpha = .7f, top = 16)
        lifecycleScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { Api.renewIfNeeded(); Api.items(ep, *q) }
                box.removeAllViews()
                if (items.isEmpty()) { label(box, "Sin resultados.", 14f, alpha = .7f, top = 16); return@launch }
                label(box, "${items.size} resultado(s)", 12f, alpha = .6f, top = 12)
                val df = DateFormat.getDateInstance(DateFormat.SHORT)
                for (it in items) row(if (it.isDir) R.drawable.ic_folder else R.drawable.ic_file, it.name,
                    (if (it.isDir) "Carpeta" else fmtBytes(it.size)) + (if (it.mtime > 0) " · " + df.format(Date(it.mtime)) else "") + " · " + it.path.substringBeforeLast('/', "/")) { options(it) }
            } catch (e: Exception) { box.removeAllViews(); fail(e) }
        }
    }

    private fun options(it: Api.Item) {
        val items = if (it.isDir) arrayOf("Copiar ruta") else arrayOf("Ver", "Descargar", "Copiar ruta")
        AlertDialog.Builder(this).setTitle(it.name).setItems(items) { _, i ->
            when (items[i]) {
                "Ver" -> view(it)
                "Descargar" -> { pending = it; save.launch(it.name) }
                else -> { (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("ruta", it.path)); toast("Ruta copiada") }
            }
        }.show()
    }

    private fun view(it: Api.Item) {
        toast("Abriendo…")
        lifecycleScope.launch {
            try {
                val f = File(File(cacheDir, "adminview").apply { mkdirs() }, it.name.replace('/', '_'))
                withContext(Dispatchers.IO) { Api.download(it.path, f) }
                val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(it.name.substringAfterLast('.', "").lowercase()) ?: "*/*"
                val uri = FileProvider.getUriForFile(this@ExploreActivity, packageName + ".files", f)
                try { startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
                catch (x: android.content.ActivityNotFoundException) { toast("No hay ninguna app para abrir este tipo de archivo; usa Descargar") }
            } catch (e: Exception) { fail(e) }
        }
    }

    private fun row(icon: Int, title: String, sub: String, onTap: () -> Unit) {
        val r = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(px(8), px(12), px(8), px(12))
            val tv = TypedValue(); theme.resolveAttribute(android.R.attr.selectableItemBackground, tv, true); setBackgroundResource(tv.resourceId)
            isClickable = true; setOnClickListener { onTap() }
        }
        r.addView(ImageView(this).apply { setImageResource(icon); setColorFilter(Look.text(context)); layoutParams = LinearLayout.LayoutParams(px(26), px(26)).apply { marginEnd = px(14) } })
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; layoutParams = LinearLayout.LayoutParams(0, -2, 1f) }
        col.addView(TextView(this).apply { text = title; textSize = 15f; maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.MIDDLE })
        col.addView(TextView(this).apply { text = sub; textSize = 12f; alpha = .65f; maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.MIDDLE })
        r.addView(col); box.addView(r)
    }
}
