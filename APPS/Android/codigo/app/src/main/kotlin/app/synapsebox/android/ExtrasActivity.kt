package app.synapsebox.android

import android.content.ClipData
import android.content.ClipboardManager
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
import java.io.File
import java.text.DateFormat
import java.util.Date

/** «Más funciones»: registro de actividad, exclusiones, límites, avisos, pausa, papelera local y diagnóstico. */
class ExtrasActivity : SecureActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val h = hero("Más funciones", "Herramientas extra de la app")

        // Pausa
        val c0 = card(b, "Pausar sincronización")
        val pst = label(c0, "", 13f, alpha = .75f)
        fun pauseText() { pst.text = if (Prefs.pausedUntil > System.currentTimeMillis()) "En pausa hasta " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(Prefs.pausedUntil)) else "No está en pausa" }
        pauseText()
        btn(c0, "Pausar…", 1) {
            val o = listOf(1 to "1 hora", 8 to "8 horas", 24 to "24 horas")
            AlertDialog.Builder(this).setTitle("Pausar durante").setItems(o.map { it.second }.toTypedArray()) { _, i -> Prefs.pausedUntil = System.currentTimeMillis() + o[i].first * 3600_000L; pauseText() }.show()
        }
        btn(c0, "Reanudar", 2) { Prefs.pausedUntil = 0; pauseText(); SyncScheduler.now(this) }

        // Exclusiones y límites
        val c1 = card(b, "Qué no sincronizar")
        label(c1, "Un patrón por línea (* y ?). Se compara con el nombre de cada archivo/carpeta o con su ruta. Ejemplos: *.tmp · node_modules · Cache/*", 12f, alpha = .65f)
        btn(c1, "Editar exclusiones", 1) { editExclude() }
        btn(c1, "Tamaño máximo de archivo: " + if (Prefs.maxFileMb > 0) "${Prefs.maxFileMb} MB" else "sin límite", 1) { editMax() }

        // Avisos
        val c2 = card(b, "Avisos")
        switchRow(c2, "Avisar al terminar", "Notificación cuando se haya copiado algo", Prefs.notifyDone) { Prefs.notifyDone = it }
        switchRow(c2, "Avisar de errores", "Notificación si alguna sincronización falla", Prefs.notifyErrors) { Prefs.notifyErrors = it }

        // Subidas
        val c3 = card(b, "Subidas rápidas")
        label(c3, "Carpeta del servidor para «Subir archivos» y «Compartir con SynapseBox». Nunca pisa archivos existentes.", 12f, alpha = .65f)
        val up = input(c3, "Carpeta de destino", InputType.TYPE_CLASS_TEXT, Prefs.uploadFolder)
        btn(c3, "Guardar carpeta", 1) { Prefs.uploadFolder = up.text.toString(); Toast.makeText(this, "Guardado: " + Prefs.uploadFolder, Toast.LENGTH_SHORT).show() }

        // Papelera local
        val c4 = card(b, "Papelera local de la sincronización")
        val tv = label(c4, "", 13f, alpha = .75f)
        fun trash() = if (Prefs.localPath.isBlank()) null else File(Prefs.localPath, ".sync-trash")
        fun size(f: File?): Long = if (f == null || !f.exists()) 0 else f.walkTopDown().filter { it.isFile }.sumOf { it.length() }
        fun refresh() { lifecycleScope.launch { val s = withContext(Dispatchers.IO) { size(trash()) }; tv.text = "Ocupa " + fmtBytes(s) + " (se vacía sola a los 30 días)" } }
        refresh()
        btn(c4, "Vaciar ahora", 1) {
            AlertDialog.Builder(this).setTitle("Vaciar papelera").setMessage("Se borrarán definitivamente los archivos que la sincronización apartó en este teléfono.")
                .setPositiveButton("Vaciar") { _, _ -> lifecycleScope.launch { withContext(Dispatchers.IO) { trash()?.deleteRecursively() }; SyncLog.add("Papelera local vaciada"); refresh() } }
                .setNegativeButton("Cancelar", null).show()
        }

        // Registro
        val c5 = card(b, "Registro de actividad")
        label(c5, "Errores, conflictos y resúmenes de cada sincronización (solo en este teléfono).", 12f, alpha = .65f)
        btn(c5, "Ver registro", 1) { showLog() }

        // Diagnóstico
        val c6 = card(b, "Diagnóstico")
        label(c6, "Comprueba conexión, versión del servidor, sesión y permisos.", 12f, alpha = .65f)
        btn(c6, "Ejecutar diagnóstico", 1) { diagnose() }
        setContentView(page(h, b))
    }

    private fun editExclude() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(20), px(8), px(20), 0) }
        val e = com.google.android.material.textfield.TextInputEditText(this).apply { setText(Prefs.exclude); minLines = 5; gravity = android.view.Gravity.TOP; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS }
        box.addView(e)
        AlertDialog.Builder(this).setTitle("Exclusiones").setView(box)
            .setPositiveButton("Guardar") { _, _ -> Prefs.exclude = e.text.toString().lines().map { it.trim() }.filter { it.isNotEmpty() }.joinToString("\n") }
            .setNeutralButton("Restablecer") { _, _ -> Prefs.exclude = ".thumbnails\n*.tmp\n*.part\n*.crdownload" }
            .setNegativeButton("Cancelar", null).show()
    }

    private fun editMax() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(20), px(8), px(20), 0) }
        val e = input(box, "Megabytes (0 = sin límite)", InputType.TYPE_CLASS_NUMBER, Prefs.maxFileMb.toString())
        AlertDialog.Builder(this).setTitle("Tamaño máximo").setView(box)
            .setPositiveButton("Guardar") { _, _ -> Prefs.maxFileMb = (e.text.toString().toIntOrNull() ?: 0).coerceIn(0, 1_000_000); recreate() }
            .setNegativeButton("Cancelar", null).show()
    }

    private fun showLog() {
        val t = SyncLog.read().ifBlank { "Aún no hay actividad registrada." }
        val tv = TextView(this).apply { textSize = 11f; typeface = android.graphics.Typeface.MONOSPACE; setPadding(px(20), px(8), px(20), px(8)); setTextIsSelectable(true); ic(t) }
        val sv = android.widget.ScrollView(this).apply { addView(tv); post { fullScroll(android.view.View.FOCUS_DOWN) } }
        AlertDialog.Builder(this).setTitle("Registro").setView(sv)
            .setPositiveButton("Cerrar", null)
            .setNeutralButton("Copiar") { _, _ -> (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("log", Ic.plain(t))); Toast.makeText(this, "Copiado", Toast.LENGTH_SHORT).show() }
            .setNegativeButton("Borrar") { _, _ -> SyncLog.clear() }.show()
    }

    private fun diagnose() {
        val dlg = AlertDialog.Builder(this).setTitle("Diagnóstico").setMessage("Comprobando…").setPositiveButton("Cerrar", null).show()
        lifecycleScope.launch {
            val out = withContext(Dispatchers.IO) {
                val sb = StringBuilder()
                fun ln(s: String) { sb.append(s).append('\n') }
                ln("App: v" + Updater.installedVersion(this@ExtrasActivity))
                ln("Servidor: " + Prefs.server)
                if (Ngrok.isNgrokUrl(Prefs.server)) ln("Túnel ngrok: sí")
                ln("Cifrado: " + if (Prefs.server.startsWith("https://")) "HTTPS {ok}" else "HTTP (sin cifrar)")
                val t0 = System.currentTimeMillis()
                val v = Api.probe(Prefs.server, fast = false)
                ln(if (v != null) "Conexión {ok} (${System.currentTimeMillis() - t0} ms) · SynapseBox v$v" else "Conexión {err} no responde")
                try { val i = Api.serverInfo(true); ln("API ${i.api} · funciones: " + (i.features.joinToString(", ").ifEmpty { "ninguna (servidor antiguo)" })) } catch (e: Exception) { ln("Info del servidor: ${e.message}") }
                val exp = Prefs.expiresAt
                ln("Sesión: " + if (exp > 0) "caduca el " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(exp)) else "sin fecha")
                try { Api.usage(); ln("Token válido {ok}") } catch (e: AuthException) { ln("Token inválido {err} (vuelve a iniciar sesión)") } catch (e: Exception) { ln("Token: no se pudo comprobar") }
                ln("Carpeta local: " + Prefs.localPath.ifBlank { "sin elegir" })
                ln("Acceso a archivos: " + if (Storage.hasAccess(this@ExtrasActivity)) "concedido {ok}" else "falta {err}")
                ln("Notificaciones: " + if (androidx.core.app.NotificationManagerCompat.from(this@ExtrasActivity).areNotificationsEnabled()) "activadas {ok}" else "desactivadas {err}")
                ln("Ahorro de batería: " + if ((getSystemService(POWER_SERVICE) as android.os.PowerManager).isIgnoringBatteryOptimizations(packageName)) "sin restricción {ok}" else "optimizada (puede retrasar la sincronización)")
                sb.toString()
            }
            dlg.setMessage(Ic.render(dlg.findViewById<TextView>(android.R.id.message) ?: TextView(this@ExtrasActivity), out))
        }
    }
}
