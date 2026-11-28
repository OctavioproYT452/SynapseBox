package app.synapsebox.android

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.webkit.MimeTypeMap
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.addCallback
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

/**
 * Gestor de archivos para administradores: lista los usuarios y permite ver, descargar y borrar sus archivos y carpetas.
 * Es de solo lectura salvo el borrado (que va a la papelera del usuario): no crea, modifica ni renombra nada.
 */
class AdminFilesActivity : SecureActivity() {
    private var user: String? = null
    private var path = ""
    private var entries: List<Api.Entry> = emptyList()
    private var filter = ""
    private lateinit var body: LinearLayout
    private lateinit var head: LinearLayout
    private lateinit var listBox: LinearLayout
    private var pending: Pair<String, String>? = null // (usuario, ruta) a guardar con el selector de archivos

    private val save = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val (u, p) = pending ?: return@registerForActivityResult; pending = null
        if (uri == null) return@registerForActivityResult
        toast("Descargando…")
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { (contentResolver.openOutputStream(uri) ?: throw java.io.IOException("No se pudo abrir el destino")).use { Api.adminDownload(u, p, it) } }
                toast("Guardado")
            } catch (e: Exception) { fail(e) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.token == null) { startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        File(cacheDir, "adminview").deleteRecursively() // restos de vistas anteriores
        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        head = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        listBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        body.addView(head); body.addView(listBox)
        val h = hero("Archivos de usuarios", "Solo administradores")
        setContentView(page(h, body))
        onBackPressedDispatcher.addCallback(this) {
            when {
                path.isNotEmpty() -> { path = path.substringBeforeLast('/', ""); loadFiles() }
                user != null -> { user = null; loadUsers() }
                else -> finish()
            }
        }
        loadUsers()
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun fail(e: Exception) {
        if (e is AuthException) { Prefs.clearSession(); startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        val m = if (e is ApiException && e.code == 403) { Prefs.isAdmin = false; "Esta cuenta ya no es de administrador" } else e.message ?: e.javaClass.simpleName
        Toast.makeText(this, m, Toast.LENGTH_LONG).show()
    }

    private fun message(t: String) { listBox.removeAllViews(); label(listBox, t, 14f, alpha = .7f, top = 16) }

    // ---------- Lista de usuarios ----------
    private fun loadUsers() {
        head.removeAllViews(); listBox.removeAllViews(); filter = ""
        label(head, "Elige un usuario para ver sus archivos", 13f, alpha = .7f)
        message("Cargando…")
        lifecycleScope.launch {
            try {
                val us = withContext(Dispatchers.IO) { Api.renewIfNeeded(); Api.adminUsers() }
                listBox.removeAllViews()
                if (us.isEmpty()) message("No hay usuarios.")
                for (u in us) {
                    val sub = (if (u.maxMb > 0) "${fmtBytes(u.used)} de ${fmtBytes((u.maxMb * 1048576).toLong())}" else "${fmtBytes(u.used)} (sin límite)") +
                        (if (u.isAdmin) " · admin" else "") + (if (u.suspended) " · suspendido" else "")
                    row(R.drawable.ic_users, u.username, sub) { user = u.username; path = ""; loadFiles() }
                }
            } catch (e: Exception) { message("No se pudo cargar la lista."); fail(e) }
        }
    }

    // ---------- Archivos de un usuario ----------
    private fun loadFiles() {
        val u = user ?: return
        head.removeAllViews(); listBox.removeAllViews(); filter = ""
        label(head, "$u  /  " + path.replace("/", "  /  "), 13f, bold = true)
        val f = input(head, "Filtrar por nombre")
        f.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { filter = s?.toString().orEmpty().trim(); renderFiles() }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        message("Cargando…")
        lifecycleScope.launch {
            try {
                entries = withContext(Dispatchers.IO) { Api.adminList(u, path) }.sortedWith(compareByDescending<Api.Entry> { it.isDir }.thenBy { it.name.lowercase() })
                renderFiles()
            } catch (e: Exception) { message("No se pudo abrir la carpeta."); fail(e) }
        }
    }

    private fun renderFiles() {
        listBox.removeAllViews()
        val shown = if (filter.isEmpty()) entries else entries.filter { it.name.contains(filter, true) }
        if (shown.isEmpty()) { label(listBox, if (entries.isEmpty()) "Carpeta vacía." else "Sin resultados.", 14f, alpha = .7f, top = 16); return }
        val df = DateFormat.getDateInstance(DateFormat.SHORT)
        for (e in shown) {
            val sub = (if (e.isDir) "Carpeta" else fmtBytes(e.size)) + (if (e.mtime > 0) " · " + df.format(Date(e.mtime)) else "")
            row(if (e.isDir) R.drawable.ic_folder else R.drawable.ic_file, e.name, sub, { options(e) }) { if (e.isDir) { path = rel(e.name); loadFiles() } else options(e) }
        }
    }

    private fun rel(name: String) = if (path.isEmpty()) name else "$path/$name"

    private fun options(e: Api.Entry) {
        val u = user ?: return; val p = rel(e.name)
        val items = if (e.isDir) arrayOf("Abrir", "Eliminar") else arrayOf("Ver", "Descargar", "Eliminar")
        AlertDialog.Builder(this).setTitle(e.name).setItems(items) { _, i ->
            when (items[i]) {
                "Abrir" -> { path = p; loadFiles() }
                "Ver" -> view(u, p, e.name)
                "Descargar" -> { pending = u to p; save.launch(e.name) }
                "Eliminar" -> AlertDialog.Builder(this).setTitle("Eliminar")
                    .setMessage("«${e.name}»" + (if (e.isDir) " y todo su contenido" else "") + " de la cuenta de $u. Irá a la papelera de ese usuario.")
                    .setPositiveButton("Eliminar") { _, _ -> delete(u, p) }.setNegativeButton("Cancelar", null).show()
            }
        }.show()
    }

    private fun delete(u: String, p: String) {
        lifecycleScope.launch {
            try { withContext(Dispatchers.IO) { Api.adminDelete(u, p) }; toast("Eliminado"); loadFiles() } catch (e: Exception) { fail(e) }
        }
    }

    /** Descarga a la caché y lo abre con la app que el sistema elija. */
    private fun view(u: String, p: String, name: String) {
        toast("Abriendo…")
        lifecycleScope.launch {
            try {
                val dir = File(cacheDir, "adminview").apply { mkdirs() }
                val f = File(dir, name.replace('/', '_'))
                withContext(Dispatchers.IO) { f.outputStream().use { Api.adminDownload(u, p, it) } }
                val ext = name.substringAfterLast('.', "").lowercase()
                val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
                val uri = FileProvider.getUriForFile(this@AdminFilesActivity, packageName + ".files", f)
                try { startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
                catch (x: android.content.ActivityNotFoundException) { toast("No hay ninguna app para abrir este tipo de archivo; usa Descargar") }
            } catch (e: Exception) { fail(e) }
        }
    }

    /** Fila pulsable: icono, título y subtítulo. */
    private fun row(icon: Int, title: String, sub: String, onLong: (() -> Unit)? = null, onTap: () -> Unit) {
        val r = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(px(8), px(12), px(8), px(12))
            val tv = TypedValue(); theme.resolveAttribute(android.R.attr.selectableItemBackground, tv, true); setBackgroundResource(tv.resourceId)
            isClickable = true; setOnClickListener { onTap() }
            if (onLong != null) setOnLongClickListener { onLong(); true }
        }
        r.addView(ImageView(this).apply { setImageResource(icon); setColorFilter(Look.text(context)); layoutParams = LinearLayout.LayoutParams(px(26), px(26)).apply { marginEnd = px(14) } })
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; layoutParams = LinearLayout.LayoutParams(0, -2, 1f) }
        col.addView(TextView(this).apply { text = title; textSize = 15f; maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.MIDDLE })
        col.addView(TextView(this).apply { text = sub; textSize = 12f; alpha = .65f })
        r.addView(col); listBox.addView(r)
    }
}
