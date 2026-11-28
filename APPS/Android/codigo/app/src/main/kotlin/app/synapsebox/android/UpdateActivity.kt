package app.synapsebox.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Buscar actualizaciones a mano, descargar el APK de la release de GitHub e instalarlo. */
class UpdateActivity : SecureActivity() {
    private lateinit var status: TextView
    private lateinit var notes: TextView
    private lateinit var bar: ProgressBar
    private lateinit var checkBtn: MaterialButton
    private lateinit var installBtn: MaterialButton
    private var release: Updater.Release? = null
    private var apk: File? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val h = hero("Actualizaciones", "Versión instalada: v" + Updater.installedVersion(this))
        val c = card(b)
        status = label(c, "Pulsa «Buscar actualizaciones».", 15f)
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; visibility = View.GONE; layoutParams = LinearLayout.LayoutParams(-1, px(10)).apply { topMargin = px(10) } }
        c.addView(bar)
        checkBtn = btn(c, "Buscar actualizaciones") { check() }
        installBtn = btn(c, "Descargar e instalar") { download() }; installBtn.visibility = View.GONE
        val c2 = card(b, "Detalles")
        notes = label(c2, "—", 13f, alpha = .8f)
        val c3 = card(b)
        switchRow(c3, "Avisarme de nuevas versiones", "Comprueba GitHub una vez al día y manda una notificación", Prefs.updateAuto) { Prefs.updateAuto = it; UpdateScheduler.apply(this) }
        btn(c3, "Ver la carpeta de APK en GitHub", 2) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Updater.RELEASES_PAGE))) }
        setContentView(page(h, b))
        check()
    }

    override fun onResume() { super.onResume(); apk?.let { if (Updater.canInstall(this) && installBtn.text == "Permitir instalar e instalar") installApk(it) } }

    private fun check() {
        checkBtn.isEnabled = false; installBtn.visibility = View.GONE; status.text = "Buscando…"
        lifecycleScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { Updater.check(this@UpdateActivity) }
                release = r.release; notes.text = r.release?.notes?.trim().takeUnless { it.isNullOrEmpty() } ?: "Origen: github.com/${Updater.REPO} → ${Updater.PATH}"
                if (r.newer && r.release != null) {
                    status.text = "Hay una versión nueva: v${r.release.version}  (tienes la v${r.installed})" + if (r.release.size > 0) "\nTamaño: ${fmtBytes(r.release.size)}" else ""
                    installBtn.text = "Descargar e instalar"; installBtn.visibility = View.VISIBLE
                } else status.ic("{ok} Tienes la última versión (v${r.installed}).")
            } catch (e: Exception) { status.text = "No se pudo comprobar: ${e.message ?: e.javaClass.simpleName}" }
            checkBtn.isEnabled = true
        }
    }

    private fun download() {
        val r = release ?: return
        installBtn.isEnabled = false; checkBtn.isEnabled = false; bar.visibility = View.VISIBLE; bar.progress = 0; status.text = "Descargando v${r.version}…"
        lifecycleScope.launch {
            try {
                val f = withContext(Dispatchers.IO) { Updater.download(this@UpdateActivity, r) { p -> runOnUiThread { bar.progress = p; status.text = "Descargando v${r.version}… $p %" } } }
                apk = f; status.text = "Descarga completa."; installApk(f)
            } catch (e: Exception) { status.text = "Error: ${e.message ?: e.javaClass.simpleName}" }
            bar.visibility = View.GONE; installBtn.isEnabled = true; checkBtn.isEnabled = true
        }
    }

    private fun installApk(f: File) {
        if (!Updater.canInstall(this)) {
            status.text = "Android necesita tu permiso para instalar apps desde SynapseBox. Actívalo y vuelve a esta pantalla."
            installBtn.text = "Permitir instalar e instalar"; installBtn.visibility = View.VISIBLE
            startActivity(Updater.permissionIntent(this)); return
        }
        installBtn.text = "Instalar de nuevo"; installBtn.visibility = View.VISIBLE
        try { Updater.install(this, f) } catch (e: Exception) { status.text = "No se pudo abrir el instalador: ${e.message}" }
    }
}
