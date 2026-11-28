package app.synapsebox.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Aparece en «Compartir» de cualquier app: sube los archivos recibidos a SynapseBox. */
class ShareActivity : SecureActivity() {
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.token == null || Prefs.server.isEmpty()) { startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        val uris: List<Uri> = when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
            Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
            else -> emptyList()
        }
        if (uris.isEmpty()) { finish(); return }
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val h = hero("Subiendo…", "${uris.size} archivo(s) a «${Uploader.FOLDER}»")
        val c = card(b)
        val t = label(c, "Preparando…", 14f)
        c.addView(ProgressBar(this).apply { isIndeterminate = true })
        setContentView(page(h, b))
        lifecycleScope.launch {
            val msg = try {
                val r = withContext(Dispatchers.IO) { Uploader.upload(this@ShareActivity, uris) { n -> runOnUiThread { t.text = n } } }
                if (r.failed.isEmpty()) "Subido: ${r.ok} archivo(s)" else "Subidos ${r.ok}; fallaron: ${r.failed.joinToString()}"
            } catch (e: AuthException) { "La sesión ha caducado: abre la app e inicia sesión" }
            catch (e: Exception) { "No se pudo subir: ${e.message ?: e.javaClass.simpleName}" }
            android.widget.Toast.makeText(this@ShareActivity, msg, android.widget.Toast.LENGTH_LONG).show()
            finish()
        }
    }
}
