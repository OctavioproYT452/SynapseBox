package app.synapsebox.android

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File

/** Sube archivos elegidos en el teléfono (selector o «Compartir») a la carpeta «Subidas del móvil» de SynapseBox. Bloqueante: usar desde Dispatchers.IO. */
object Uploader {
    val FOLDER: String get() = Prefs.uploadFolder
    class Result(val ok: Int, val failed: List<String>)

    private fun nameOf(c: Context, u: Uri): String {
        var n: String? = null
        try { c.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) n = it.getString(0) } } catch (e: Exception) { }
        return (n ?: u.lastPathSegment ?: "archivo").substringAfterLast('/').replace(Regex("[\\\\:*?\"<>|]"), "_").ifBlank { "archivo" }
    }

    fun upload(c: Context, uris: List<Uri>, progress: (String) -> Unit = {}): Result {
        Api.renewIfNeeded()
        try { Api.mkdir("", FOLDER) } catch (e: ApiException) { /* ya existe */ }
        var ok = 0; val bad = ArrayList<String>()
        val taken = try { Api.tree(FOLDER).filterValues { !it.isDir }.keys.map { it.lowercase() }.toHashSet() } catch (e: Exception) { HashSet<String>() }
        for (u in uris) {
            var name = nameOf(c, u); progress(name)
            if (name.lowercase() in taken) { // nunca pisa un archivo existente: añade (1), (2)…
                val base = name.substringBeforeLast('.', name); val ext = if (name.contains('.')) "." + name.substringAfterLast('.') else ""
                var n = 1; while ("$base ($n)$ext".lowercase() in taken) n++
                name = "$base ($n)$ext"
            }
            taken += name.lowercase()
            val tmp = File(c.cacheDir, "up_" + System.nanoTime())
            try {
                c.contentResolver.openInputStream(u)!!.use { i -> tmp.outputStream().use { o -> i.copyTo(o, 64 * 1024) } }
                Api.upload("$FOLDER/$name", tmp); ok++
            } catch (e: AuthException) { throw e } catch (e: Exception) { bad += name } finally { tmp.delete() }
        }
        return Result(ok, bad)
    }
}
