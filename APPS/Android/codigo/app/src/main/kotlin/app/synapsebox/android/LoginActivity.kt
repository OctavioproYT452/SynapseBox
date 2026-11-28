package app.synapsebox.android

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Entrar o crear cuenta (si el servidor permite el registro), con código 2FA cuando la cuenta lo tiene. */
class LoginActivity : AppCompatActivity() {
    private lateinit var user: TextInputEditText
    private lateinit var pass: TextInputEditText
    private lateinit var pass2: TextInputEditText
    private lateinit var code: TextInputEditText
    private lateinit var msg: TextView
    private lateinit var go: MaterialButton
    private lateinit var switchBtn: MaterialButton
    private lateinit var bar: ProgressBar
    private lateinit var title: TextView
    private var codeBox: View? = null
    private var pass2Box: View? = null
    private var ticket: String? = null
    private var registering = false
    private var regOpen = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.server.isEmpty() && Prefs.token == null) { startActivity(Intent(this, SetupActivity::class.java)); finish(); return }
        if (Prefs.token != null) { startActivity(Intent(this, HomeActivity::class.java)); finish(); return }

        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val hero = hero("SynapseBox", "Tu nube, en tu bolsillo")
        val c = card(b)
        title = label(c, "Iniciar sesión", 20f, bold = true)
        label(c, Prefs.server.removePrefix("https://").removePrefix("http://"), 12f, alpha = .6f, top = 2)

        user = input(c, "Usuario", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, Prefs.username)
        pass = input(c, "Contraseña", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        pass2 = input(c, "Repite la contraseña", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        pass2Box = pass2.parent.parent as View; pass2Box!!.visibility = View.GONE
        code = input(c, "Código de verificación (2FA)", InputType.TYPE_CLASS_TEXT)
        codeBox = code.parent.parent as View; codeBox!!.visibility = View.GONE

        msg = label(c, "", 14f, top = 12).apply { setTextColor(0xFFD93025.toInt()) }
        go = btn(c, "Entrar") { submit() }
        bar = ProgressBar(this).apply { visibility = View.GONE }; c.addView(bar)
        switchBtn = btn(c, "¿No tienes cuenta? Crear una", 2) { toggle() }
        switchBtn.visibility = View.GONE

        val c2 = card(b)
        btn(c2, "Cambiar de servidor", 2) { startActivity(Intent(this, SetupActivity::class.java)); finish() }
        setContentView(page(hero, b))

        // ¿el servidor permite registrarse? (en segundo plano; si no responde, solo se muestra el inicio de sesión)
        lifecycleScope.launch {
            regOpen = withContext(Dispatchers.IO) { Api.registrationOpen(Prefs.server) } == true
            if (regOpen) switchBtn.visibility = View.VISIBLE
        }
    }

    private fun toggle() {
        registering = !registering; ticket = null; codeBox?.visibility = View.GONE; msg.text = ""
        pass2Box?.visibility = if (registering) View.VISIBLE else View.GONE
        title.text = if (registering) "Crear cuenta" else "Iniciar sesión"
        go.text = if (registering) "Crear cuenta" else "Entrar"
        switchBtn.text = if (registering) "¿Ya tienes cuenta? Iniciar sesión" else "¿No tienes cuenta? Crear una"
    }

    private fun submit() {
        val srv = Prefs.server.ifEmpty { return show("Falta configurar el servidor") }
        val usr = user.text.toString().trim(); val pw = pass.text.toString()
        if (ticket == null && (usr.isEmpty() || pw.isEmpty())) return show("Escribe usuario y contraseña")
        if (registering && pw != pass2.text.toString()) return show("Las contraseñas no coinciden")
        if (Net.cleartextBlocked(android.net.Uri.parse(srv))) {
            AlertDialog.Builder(this).setTitle("Servidor sin cifrar")
                .setMessage("Esta dirección usa http:// y no es de tu red local: tu contraseña viajaría sin cifrar. Lo recomendable es usar https://.")
                .setPositiveButton("Permitir HTTP") { _, _ -> Prefs.httpsOnly = false; submit() }
                .setNegativeButton("Cancelar", null).show()
            return
        }
        if (srv.startsWith("http://")) Toast.makeText(this, "Aviso: la conexión no está cifrada (http). Usa https si el servidor es accesible desde Internet.", Toast.LENGTH_LONG).show()
        show(""); go.isEnabled = false; bar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                if (registering) {
                    val r = withContext(Dispatchers.IO) { Api.register(srv, usr, pw, pass2.text.toString()) }
                    if (r.login.token == null) { show("Cuenta creada. Inicia sesión."); toggle() }
                    else { enter(srv, usr, r.login); if (r.codes.isNotEmpty()) showCodes(r.codes) else goHome() }
                } else {
                    val tk = ticket
                    val r = withContext(Dispatchers.IO) { if (tk == null) Api.login(srv, usr, pw) else Api.login2fa(srv, tk, code.text.toString().trim()) }
                    if (r.need2fa && r.ticket != null) {
                        ticket = r.ticket; codeBox?.visibility = View.VISIBLE; code.requestFocus(); show("Introduce el código de tu app de autenticación (o un código de recuperación)")
                    } else if (r.token != null) { enter(srv, usr, r); goHome() }
                    else show("Respuesta inesperada del servidor. ¿Es la dirección correcta y tiene la versión 2.23 o superior?")
                }
            } catch (e: ApiException) {
                if (e.code == 401 && ticket != null && e.message?.contains("caducó") == true) ticket = null
                show(e.message ?: "Error")
            } catch (e: Exception) { show("No se pudo conectar: ${e.message ?: e.javaClass.simpleName}") }
            go.isEnabled = true; bar.visibility = View.GONE
        }
    }

    private fun enter(srv: String, usr: String, r: Api.Login) {
        Prefs.server = srv; Prefs.username = usr.ifEmpty { Prefs.username }; Prefs.token = r.token
        Prefs.expiresAt = if (r.expiresAt > 0) r.expiresAt else System.currentTimeMillis() + 7L * 24 * 3600 * 1000
        AppLock.unlock(); SyncScheduler.apply(this)
    }

    private fun goHome() { startActivity(Intent(this, HomeActivity::class.java)); finish() }

    /** Los códigos de recuperación solo se ven una vez: se muestran y se pueden copiar. */
    private fun showCodes(codes: List<String>) {
        val txt = codes.joinToString("\n")
        AlertDialog.Builder(this).setTitle("Guarda tus códigos de recuperación")
            .setMessage("Sirven para recuperar la cuenta si olvidas la contraseña. Se muestran solo ahora; guárdalos en un lugar seguro.\n\n$txt")
            .setCancelable(false)
            .setNeutralButton("Copiar") { _, _ ->
                (getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("codes", txt))
                Toast.makeText(this, "Copiados", Toast.LENGTH_SHORT).show(); goHome()
            }
            .setPositiveButton("Los he guardado") { _, _ -> goHome() }.show()
    }

    private fun show(t: String) { msg.text = t }
}
