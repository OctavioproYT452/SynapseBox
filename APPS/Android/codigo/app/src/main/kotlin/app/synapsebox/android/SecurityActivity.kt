package app.synapsebox.android

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/** Seguridad: bloqueo de la app, ocultar contenido, HTTPS, sesiones abiertas y contraseña. */
class SecurityActivity : SecureActivity() {
    private lateinit var sessBox: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val h = hero("Seguridad", "Protege tu cuenta en este teléfono")

        val c1 = card(b, "Acceso a la app")
        val timeouts = listOf(0 to "Al instante", 30 to "30 segundos", 60 to "1 minuto", 300 to "5 minutos", 900 to "15 minutos")
        val tv = label(c1, "", 13f, alpha = .7f)
        fun upd() { tv.text = "Pedir desbloqueo tras: " + (timeouts.firstOrNull { it.first == Prefs.lockTimeoutSec }?.second ?: "${Prefs.lockTimeoutSec} s") }
        switchRow(c1, "Bloquear la app", "Pide el PIN, patrón o huella del teléfono al abrirla", Prefs.appLock) { on ->
            if (on && !AppLock.deviceSecure(this)) {
                Toast.makeText(this, "Primero configura un PIN, patrón o huella en los ajustes del teléfono", Toast.LENGTH_LONG).show()
                recreate(); return@switchRow
            }
            Prefs.appLock = on; if (on) AppLock.unlock()
        }
        upd()
        btn(c1, "Tiempo hasta bloquear", 1) {
            AlertDialog.Builder(this).setTitle("Pedir desbloqueo tras")
                .setItems(timeouts.map { it.second }.toTypedArray()) { _, i -> Prefs.lockTimeoutSec = timeouts[i].first; upd() }.show()
        }
        switchRow(c1, "Ocultar contenido", "Bloquea capturas de pantalla y oculta la app en recientes", Prefs.secureScreen) { Prefs.secureScreen = it; Toast.makeText(this, "Se aplica al reabrir las pantallas", Toast.LENGTH_SHORT).show() }

        val c2 = card(b, "Red")
        switchRow(c2, "Solo HTTPS", "Bloquea servidores con http:// (excepto red local: 192.168.x.x, .local…)", Prefs.httpsOnly) { Prefs.httpsOnly = it }

        val c3 = card(b, "Sesiones abiertas")
        label(c3, "Dispositivos con tu cuenta iniciada.", 12f, alpha = .65f)
        sessBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; c3.addView(sessBox)
        btn(c3, "Cerrar las demás sesiones", 1) {
            confirm("Cerrar las demás sesiones", "Se cerrará la sesión en todos los dispositivos menos este.") {
                lifecycleScope.launch { try { withContext(Dispatchers.IO) { Api.revokeOthers() } } catch (e: Exception) { toast(e) }; loadSessions() }
            }
        }

        val c4 = card(b, "Contraseña")
        btn(c4, "Cambiar contraseña", 1) { changePass() }

        val c5 = card(b, "Datos en este teléfono")
        label(c5, "Cierra la sesión y borra cookies, caché, registro y la caché de la web.", 12f, alpha = .65f)
        btn(c5, "Borrar datos locales y cerrar sesión", 1) {
            confirm("Borrar datos locales", "Se cerrará la sesión y se borrará todo lo guardado por la app. Tus archivos sincronizados no se tocan.") { wipe() }
        }
        setContentView(page(h, b))
        loadSessions()
    }

    private fun confirm(t: String, m: String, ok: () -> Unit) =
        AlertDialog.Builder(this).setTitle(t).setMessage(m).setPositiveButton("Continuar") { _, _ -> ok() }.setNegativeButton("Cancelar", null).show()

    private fun loadSessions() {
        lifecycleScope.launch {
            sessBox.removeAllViews()
            try {
                val list = withContext(Dispatchers.IO) { Api.sessions() }
                for (s in list) {
                    val t = if (s.createdAt > 0) DateFormat.getDateTimeInstance().format(Date(if (s.createdAt < 100_000_000_000L) s.createdAt * 1000 else s.createdAt)) else ""
                    val row = label(sessBox, "", 12f, top = 10); row.ic((if (s.current) "{on} Este dispositivo\n" else "") + s.ua.take(70).ifEmpty { "Dispositivo" } + "\n${s.ip} · $t")
                    if (!s.current) row.setOnClickListener {
                        confirm("Cerrar sesión", "¿Cerrar esta sesión?") {
                            lifecycleScope.launch { try { withContext(Dispatchers.IO) { Api.revokeSession(s.id) } } catch (e: Exception) { toast(e) }; loadSessions() }
                        }
                    }
                    if (!s.current) row.append("\n(toca para cerrarla)")
                }
            } catch (e: Exception) { label(sessBox, "No disponible: ${e.message ?: "servidor sin esta función"}", 12f, alpha = .7f) }
        }
    }

    private fun toast(e: Exception) = Toast.makeText(this, e.message ?: e.javaClass.simpleName, Toast.LENGTH_LONG).show()

    private fun changePass() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(20), px(8), px(20), 0) }
        val t = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        val a = input(box, "Contraseña actual", t); val n = input(box, "Nueva contraseña", t); val n2 = input(box, "Repetir nueva", t)
        AlertDialog.Builder(this).setTitle("Cambiar contraseña").setView(box)
            .setPositiveButton("Cambiar") { _, _ ->
                lifecycleScope.launch {
                    try {
                        withContext(Dispatchers.IO) { Api.changePassword(a.text.toString(), n.text.toString(), n2.text.toString()) }
                        Toast.makeText(this@SecurityActivity, "Contraseña cambiada; las demás sesiones se cerraron", Toast.LENGTH_LONG).show(); loadSessions()
                    } catch (e: Exception) { toast(e) }
                }
            }.setNegativeButton("Cancelar", null).show()
    }

    private fun wipe() {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { try { Api.logout() } catch (_: Exception) { } }
            SyncScheduler.stop(this@SecurityActivity); Prefs.clearSession(); SyncLog.clear()
            android.webkit.CookieManager.getInstance().removeAllCookies(null); android.webkit.WebStorage.getInstance().deleteAllData()
            try { android.webkit.WebView(this@SecurityActivity).apply { clearCache(true); clearHistory(); clearFormData() } } catch (_: Exception) { }
            cacheDir.deleteRecursively()
            startActivity(Intent(this@SecurityActivity, LoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)); finish()
        }
    }
}
