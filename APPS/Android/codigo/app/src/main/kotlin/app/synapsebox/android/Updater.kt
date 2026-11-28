package app.synapsebox.android

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Actualizaciones de la app: mira la carpeta APPS/Android del repositorio de GitHub (rama main) y busca el APK SynapseBox-vX.Y.Z.apk más reciente. */
object Updater {
    const val REPO = "OctavioproYT452/SynapseBox"
    const val PATH = "APPS/Android"; const val BRANCH = "main"
    const val FOLDER_PAGE = "https://github.com/$REPO/tree/$BRANCH/$PATH"
    const val RELEASES_PAGE = FOLDER_PAGE
    private val ASSET = Regex("^SynapseBox-v(\\d+(?:\\.\\d+)*)\\.apk$", RegexOption.IGNORE_CASE)
    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).followRedirects(true).build()

    class Release(val version: String, val tag: String, val notes: String, val apkUrl: String, val size: Long, val page: String, val shaUrl: String = "")
    /** [release] = la última publicada; [newer] = es más nueva que la instalada. */
    class Result(val installed: String, val release: Release?, val newer: Boolean)

    fun installedVersion(c: Context): String = try { c.packageManager.getPackageInfo(c.packageName, 0).versionName ?: "0" } catch (e: Exception) { "0" }

    /** Compara versiones numéricas («1.10.0» > «1.9.2»). */
    fun compare(a: String, b: String): Int {
        val x = a.removePrefix("v").split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        val y = b.removePrefix("v").split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) { val d = x.getOrElse(i) { 0 }.compareTo(y.getOrElse(i) { 0 }); if (d != 0) return d }
        return 0
    }

    /** Bloqueante (usar desde un hilo de fondo). Lista la carpeta APPS/Android de la rama main y elige el SynapseBox-vX.Y.Z.apk de versión más alta. */
    fun check(c: Context): Result {
        val rq = Request.Builder().url("https://api.github.com/repos/$REPO/contents/$PATH?ref=$BRANCH")
            .header("Accept", "application/vnd.github+json").header("User-Agent", "SynapseBox-Android").build()
        http.newCall(rq).execute().use { r ->
            if (r.code == 404) throw IOException("No se encontró la carpeta $PATH en GitHub")
            if (r.code == 403 || r.code == 429) throw IOException("GitHub limitó las consultas; inténtalo más tarde")
            if (!r.isSuccessful) throw IOException("GitHub respondió ${r.code}")
            val arr = JSONArray(r.body?.string().orEmpty())
            var best: Release? = null
            val shas = HashMap<String, String>() // nombre.apk → URL de su .sha256 (opcional)
            for (i in 0 until arr.length()) { val a = arr.getJSONObject(i); val n = a.optString("name"); if (n.endsWith(".sha256", true)) shas[n.dropLast(7).lowercase()] = a.optString("download_url") }
            for (i in 0 until arr.length()) {
                val a = arr.getJSONObject(i); if (a.optString("type") != "file") continue
                val m = ASSET.matchEntire(a.optString("name")) ?: continue
                val url = a.optString("download_url"); if (url.isEmpty()) continue
                if (best == null || compare(m.groupValues[1], best.version) > 0)
                    best = Release(m.groupValues[1], "v" + m.groupValues[1], "", url, a.optLong("size"), FOLDER_PAGE, shas[a.optString("name").lowercase()].orEmpty())
            }
            val inst = installedVersion(c)
            if (best == null) throw IOException("No hay ningún archivo SynapseBox-vX.Y.Z.apk en $PATH")
            return Result(inst, best, compare(best.version, inst) > 0)
        }
    }

    /** Descarga el APK a la caché (con progreso 0..100) y comprueba el tamaño. */
    fun download(c: Context, rel: Release, progress: (Int) -> Unit): File {
        val dir = File(c.cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
        val out = File(dir, "SynapseBox-v${rel.version}.apk")
        http.newCall(Request.Builder().url(rel.apkUrl).header("User-Agent", "SynapseBox-Android").build()).execute().use { r ->
            if (!r.isSuccessful) throw IOException("No se pudo descargar (${r.code})")
            val body = r.body ?: throw IOException("Descarga vacía"); val total = body.contentLength().takeIf { it > 0 } ?: rel.size
            var done = 0L; var last = -1
            body.byteStream().use { i -> out.outputStream().use { o ->
                val buf = ByteArray(64 * 1024); while (true) { val n = i.read(buf); if (n < 0) break; o.write(buf, 0, n); done += n
                    if (total > 0) { val p = (done * 100 / total).toInt(); if (p != last) { last = p; progress(p) } } }
            } }
            if (rel.size > 0 && out.length() != rel.size) { out.delete(); throw IOException("La descarga quedó incompleta") }
        }
        if (rel.shaUrl.isNotEmpty()) { // si junto al APK hay un .sha256, se exige que coincida (protege contra descargas corruptas o manipuladas)
            val want = http.newCall(Request.Builder().url(rel.shaUrl).header("User-Agent", "SynapseBox-Android").build()).execute().use { r ->
                if (!r.isSuccessful) throw IOException("No se pudo leer la suma de verificación (${r.code})")
                r.body?.string().orEmpty().trim().split(Regex("\\s+")).firstOrNull().orEmpty().lowercase()
            }
            val md = java.security.MessageDigest.getInstance("SHA-256")
            out.inputStream().use { i -> val buf = ByteArray(64 * 1024); while (true) { val n = i.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
            val got = md.digest().joinToString("") { "%02x".format(it) }
            if (want.isNotEmpty() && got != want) { out.delete(); throw IOException("La suma SHA-256 no coincide: el APK se descartó") }
        }
        return out
    }

    /** ¿Puede la app instalar APK? En Android 8+ hay que permitirlo en «Instalar apps desconocidas». */
    fun canInstall(c: Context) = Build.VERSION.SDK_INT < 26 || c.packageManager.canRequestPackageInstalls()
    fun permissionIntent(c: Context) = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.packageName))

    fun install(c: Context, apk: File) {
        val uri = FileProvider.getUriForFile(c, c.packageName + ".files", apk)
        c.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** Comprobación periódica (una vez al día): si hay versión nueva, avisa con una notificación (una vez por versión). */
class UpdateWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result {
        Prefs.init(applicationContext)
        if (!Prefs.updateAuto) return Result.success()
        return try {
            val r = Updater.check(applicationContext)
            if (r.newer && r.release != null && Prefs.updateNotified != r.release.version) {
                Prefs.updateNotified = r.release.version
                Notif.update(applicationContext, "Hay una actualización disponible: v${r.release.version} (tienes la v${r.installed}). Toca para actualizar.")
            }
            Result.success()
        } catch (e: IOException) { Result.success() }
    }
}

object UpdateScheduler {
    private const val NAME = "synapsebox-update"
    fun apply(c: Context) {
        Prefs.init(c); val wm = WorkManager.getInstance(c)
        if (!Prefs.updateAuto) { wm.cancelUniqueWork(NAME); return }
        val req = PeriodicWorkRequestBuilder<UpdateWorker>(1, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }
}
