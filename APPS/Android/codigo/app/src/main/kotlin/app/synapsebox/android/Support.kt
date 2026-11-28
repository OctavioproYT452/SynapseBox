package app.synapsebox.android

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.Settings
import android.view.View
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

/** Acceso a archivos y selección de carpeta. */
object Storage {
    /** ¿Tiene la app acceso a todos los archivos? (Android 11+: permiso especial; Android 7-10: permiso de almacenamiento) */
    fun hasAccess(c: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
        else ContextCompat.checkSelfPermission(c, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    /** Convierte la carpeta elegida en el selector del sistema (content://…tree/primary:Documentos/X) en una ruta de archivo real. */
    fun pathFromTree(uri: Uri): String? {
        val id = try { DocumentsContract.getTreeDocumentId(uri) } catch (e: Exception) { return null }
        val vol = id.substringBefore(':'); val rel = id.substringAfter(':', "")
        val base = when {
            vol.equals("primary", true) -> Environment.getExternalStorageDirectory().path
            vol.equals("home", true) -> File(Environment.getExternalStorageDirectory(), "Documents").path
            vol.isNotEmpty() && !vol.startsWith("raw") -> "/storage/$vol"
            else -> return null
        }
        return if (rel.isEmpty()) base else "$base/$rel"
    }

    fun allFilesIntent(c: Context): Intent =
        Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + c.packageName))
}

/** Notificaciones: un canal discreto para el progreso y otro para avisos. */
object Notif {
    const val ID_PROGRESS = 1001
    const val ID_ALERT = 1002
    const val ID_UPDATE = 1003
    private const val CH_SYNC = "sync"; private const val CH_ALERT = "alerts"

    fun channels(c: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_SYNC, "Sincronización", NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel(CH_ALERT, "Avisos", NotificationManager.IMPORTANCE_DEFAULT))
    }

    private fun open(c: Context): PendingIntent =
        PendingIntent.getActivity(c, 0, Intent(c, LoginActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Notificación de sincronización: barra animada (indeterminada mientras busca; con porcentaje cuando se conoce el total). Desaparece sola al terminar el trabajo. */
    fun progress(c: Context, text0: String, done: Int = 0, total: Int = 0, title: String = "SynapseBox · Sincronizando"): Notification {
        val text = Ic.plain(text0)
        val b = NotificationCompat.Builder(c, CH_SYNC).setSmallIcon(R.drawable.ic_stat_sync).setContentTitle(title)
            .setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE).setContentIntent(open(c))
        if (total > 0) b.setProgress(total, done.coerceIn(0, total), false).setSubText("${done.coerceIn(0, total) * 100 / total} %") else b.setProgress(0, 0, true)
        return b.build()
    }

    fun updateProgress(c: Context, text: String, done: Int = 0, total: Int = 0, title: String = "SynapseBox · Sincronizando") {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        c.getSystemService(NotificationManager::class.java).notify(ID_PROGRESS, progress(c, text, done, total, title))
    }

    /** Aviso de nueva versión: al tocarlo abre la pantalla de actualizaciones. */
    fun update(c: Context, text0: String) {
        val text = Ic.plain(text0)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val pi = PendingIntent.getActivity(c, 1, Intent(c, UpdateActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(c, CH_ALERT).setSmallIcon(R.drawable.ic_stat_sync).setContentTitle("SynapseBox: actualización")
            .setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi).build()
        c.getSystemService(NotificationManager::class.java).notify(ID_UPDATE, n)
    }

    fun alert(c: Context, text0: String) {
        val text = Ic.plain(text0)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val n = NotificationCompat.Builder(c, CH_ALERT).setSmallIcon(R.drawable.ic_stat_sync).setContentTitle("SynapseBox")
            .setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(open(c)).build()
        c.getSystemService(NotificationManager::class.java).notify(ID_ALERT, n)
    }
}

/** Respeta las barras del sistema y el teclado (Android 15+ dibuja de borde a borde). */
fun View.applyInsets() {
    ViewCompat.setOnApplyWindowInsetsListener(this) { v, ins ->
        val b = ins.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
        v.setPadding(b.left, b.top, b.right, b.bottom)
        WindowInsetsCompat.CONSUMED
    }
}
fun View.dp(v: Int) = (v * resources.displayMetrics.density).toInt()
fun android.content.Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

/** ngrok muestra una página de aviso a los navegadores; con esta cabecera (o un User-Agent propio) se omite. */
object Ngrok {
    const val HEADER = "ngrok-skip-browser-warning"
    fun isNgrok(host: String?): Boolean { val h = host?.lowercase() ?: return false; return h.contains("ngrok") }
    fun isNgrokUrl(url: String): Boolean = try { isNgrok(android.net.Uri.parse(url).host) } catch (e: Exception) { false }
    fun headers(url: String): Map<String, String> = if (isNgrokUrl(url)) mapOf(HEADER to "true") else emptyMap()
}

object Browse {
    /** Abre una dirección en el navegador del sistema; con ngrok intenta pasar la cabecera que omite el aviso (Chrome puede ignorarla: entonces basta pulsar «Visit Site»). */
    fun open(c: Context, url: String) {
        val i = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
        if (Ngrok.isNgrokUrl(url)) i.putExtra("com.android.browser.headers", android.os.Bundle().apply { putString(Ngrok.HEADER, "true") })
        try { c.startActivity(i) } catch (e: Exception) { }
    }
}
