package app.synapsebox.android

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import okhttp3.HttpUrl

/** Reglas de red: por defecto la app solo habla con servidores por HTTPS (salvo red local/privada). */
object Net {
    const val BLOCK_MSG = "Conexión HTTP bloqueada: activa «Permitir HTTP» en Seguridad o usa HTTPS."

    fun isPrivateHost(h0: String): Boolean {
        val h = h0.lowercase().trim('[', ']')
        if (h == "localhost" || h == "::1" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home") || h.endsWith(".internal")) return true
        if (h.startsWith("fc") && h.contains(':') || h.startsWith("fd") && h.contains(':') || h.startsWith("fe80:")) return true
        val p = h.split('.')
        if (p.size == 4 && p.all { it.toIntOrNull() in 0..255 }) {
            val a = p[0].toInt(); val b = p[1].toInt()
            return a == 10 || a == 127 || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 169 && b == 254) || (a == 100 && b in 64..127)
        }
        return !h.contains('.') && !h.contains(':')
    }
    fun blocked(scheme: String?, host: String?, path: String?): Boolean =
        Prefs.httpsOnly && scheme == "http" && !isPrivateHost(host.orEmpty()) && path != "/api/health"
    fun cleartextBlocked(u: HttpUrl) = blocked(u.scheme, u.host, u.encodedPath)
    fun cleartextBlocked(u: Uri) = blocked(u.scheme, u.host, u.path)
}

/** Bloqueo de la app con el PIN/patrón/huella del propio teléfono (sin contraseñas nuevas ni dependencias). */
object AppLock {
    @Volatile var locked = true
    private var visible = 0
    private var leftAt = 0L
    private var skipNext = false

    fun deviceSecure(c: Context) = (c.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceSecure
    fun unlock() { locked = false; skipNext = true }

    /** Llamado desde onStart de cada pantalla; devuelve true si hay que pedir desbloqueo. */
    fun onStart(): Boolean {
        visible++
        if (!Prefs.appLock) return false
        if (skipNext) { skipNext = false; return false }
        if (!locked && visible == 1 && leftAt > 0 && SystemClock.elapsedRealtime() - leftAt > Prefs.lockTimeoutSec * 1000L) locked = true
        return locked
    }
    fun onStop() { if (visible > 0) visible--; if (visible == 0) leftAt = SystemClock.elapsedRealtime() }
}

/** Base de las pantallas con datos: oculta contenido en recientes/capturas y pide desbloqueo si procede. */
open class SecureActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        if (Prefs.secureScreen) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        super.onCreate(savedInstanceState)
    }
    override fun onStart() {
        super.onStart()
        if (Prefs.token != null && AppLock.onStart()) startActivity(Intent(this, LockActivity::class.java))
    }
    override fun onStop() { super.onStop(); AppLock.onStop() }
}

class LockActivity : AppCompatActivity() {
    private val auth = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == RESULT_OK) { AppLock.unlock(); finish() } else show()
    }
    private var asked = false

    override fun onCreate(savedInstanceState: Bundle?) {
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        super.onCreate(savedInstanceState)
        val b = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.VERTICAL }
        val c = card(b)
        label(c, "SynapseBox está bloqueada", 18f, bold = true)
        label(c, "Usa el desbloqueo de tu teléfono para continuar.", 14f, alpha = .7f)
        btn(c, "Desbloquear") { show() }
        btn(c, "Salir", 2) { finishAffinity() }
        setContentView(page(hero("Bloqueada"), b))
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) { override fun handleOnBackPressed() { finishAffinity() } })
    }
    override fun onResume() { super.onResume(); if (!asked) { asked = true; show() } }

    private fun show() {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (!km.isDeviceSecure) { AppLock.unlock(); finish(); return } // sin bloqueo en el teléfono no se puede exigir nada
        @Suppress("DEPRECATION") val i = km.createConfirmDeviceCredentialIntent("SynapseBox", "Confirma tu identidad")
        if (i == null) { AppLock.unlock(); finish() } else auth.launch(i)
    }
}
