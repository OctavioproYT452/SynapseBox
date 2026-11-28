package app.synapsebox.android

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Registro local de actividad (solo en el teléfono, recortado a ~200 KB). */
object SyncLog {
    private var file: File? = null
    private val fmt = SimpleDateFormat("dd/MM HH:mm:ss", Locale.getDefault())
    fun init(c: Context) { file = File(c.filesDir, "sync.log") }
    @Synchronized fun add(msg: String) {
        val f = file ?: return
        try {
            if (f.length() > 200_000) f.writeText(f.readText().takeLast(100_000).substringAfter('\n'))
            f.appendText("${fmt.format(Date())}  $msg\n")
        } catch (_: Exception) { }
    }
    @Synchronized fun read(): String = try { file?.takeIf { it.exists() }?.readText()?.takeLast(60_000).orEmpty() } catch (_: Exception) { "" }
    @Synchronized fun clear() { try { file?.delete() } catch (_: Exception) { } }
}
