package app.synapsebox.android

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.util.concurrent.CancellationException
import java.util.concurrent.TimeUnit

/** Una pasada de sincronización en segundo plano (periódica o manual). */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    companion object { private val lock = Mutex() }

    private fun info(text: String): ForegroundInfo {
        val n = Notif.progress(applicationContext, text)
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(Notif.ID_PROGRESS, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else ForegroundInfo(Notif.ID_PROGRESS, n)
    }

    override suspend fun getForegroundInfo() = info("Buscando cambios…")

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Prefs.init(applicationContext)
        if (!Prefs.syncEnabled || Prefs.token == null || Prefs.localPath.isBlank()) return@withContext Result.success()
        if (Prefs.pausedUntil > System.currentTimeMillis()) { Prefs.status = "En pausa hasta las " + java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(Prefs.pausedUntil)); return@withContext Result.success() }
        SyncLog.init(applicationContext)
        // Android 12+ no deja pasar a primer plano desde el fondo salvo en trabajos «expedited»: si falla, se sigue igual (hasta 10 min)
        try { setForeground(info("Buscando cambios…")) } catch (e: Exception) { }
        val scope = this
        // Estado visible en la notificación. Un refresco cada 0,5 s garantiza que siempre muestre lo último (antes se descartaban
        // actualizaciones cercanas y se quedaba en el archivo anterior), y cada cambio de archivo se publica al instante.
        class Ui { @Volatile var text = "Buscando cambios…"; @Volatile var done = 0; @Volatile var total = 0; @Volatile var last = 0L }
        val ui = Ui()
        fun render() { ui.last = System.currentTimeMillis(); Notif.updateProgress(applicationContext, ui.text + (Live.pct.takeIf { it >= 0 }?.let { " · $it %" } ?: ""), ui.done, ui.total) }
        fun push() { if (System.currentTimeMillis() - ui.last >= 250) render() }
        val ticker = scope.launch { while (isActive) { delay(500); render() } }
        lock.withLock {
            try {
                val ctx = applicationContext
                if (Prefs.syncStrategy == "initial_only" && Prefs.initialDone) {
                    Prefs.status = "La copia inicial ya está hecha. Usa «Reiniciar» en Sincronización para repetirla."; Prefs.syncEnabled = false; SyncScheduler.apply(ctx)
                    return@withLock Result.success()
                }
                Api.renewIfNeeded()
                val initial = !Prefs.initialDone
                val key = Prefs.syncKey()
                val state = File(ctx.filesDir, "sync_state_" + key.hashCode() + ".json")
                val opts = SyncOptions(Prefs.mode, Prefs.syncStrategy, initial, Prefs.optNew, Prefs.optMod, Prefs.optDel, Prefs.optDirs, Prefs.exclude.lines(), Prefs.maxFileMb * 1024L * 1024L)
                Prefs.status = if (initial) "Copia inicial en curso…" else "Sincronizando…"
                val st = SyncEngine(File(Prefs.localPath), Prefs.remotePath, opts, state).run({ scope.ensureActive() }, { Prefs.status = "Sincronizando: $it"; Live.reset(); ui.text = it; render() }, { d, t -> ui.done = d; ui.total = t; push() })
                Prefs.status = st.summary(); Prefs.lastSync = System.currentTimeMillis()
                SyncLog.add("Sincronización: " + st.summary())
                if (st.errors > 0 && Prefs.notifyErrors) Notif.alert(ctx, "Sincronización con " + st.errors + " errores: " + (st.lastError ?: ""))
                else if (Prefs.notifyDone && (st.up + st.down + st.del + st.moved) > 0) Notif.alert(ctx, "Sincronización completada: " + st.summary())
                if (initial && st.errors == 0) {
                    Prefs.initialKey = key
                    if (Prefs.syncStrategy == "initial_only") { // copia única terminada: se detiene
                        Prefs.status = "Copia inicial completada (" + st.summary() + "). Sincronización detenida."
                        Prefs.syncEnabled = false; SyncScheduler.apply(ctx); Notif.alert(ctx, "Copia inicial completada. La sincronización se ha detenido.")
                    }
                }
                Result.success()
            } catch (e: AuthException) {
                Prefs.status = "Sesión caducada: vuelve a iniciar sesión"
                Notif.alert(applicationContext, "La sesión de SynapseBox ha caducado. Abre la app para volver a entrar y seguir sincronizando.")
                Result.success()
            } catch (e: CancellationException) { Prefs.status = "Sincronización interrumpida"; throw e
            } catch (e: IOException) {
                Prefs.status = "Error: ${e.message ?: "sin conexión"}"; SyncLog.add("Error de red: ${e.message}")
                if (runAttemptCount < 3) Result.retry() else Result.success()
            } catch (e: Exception) {
                Prefs.status = "Error: ${e.message ?: e.javaClass.simpleName}"; Result.success()
            } finally { ticker.cancel(); Live.reset() }
        }
    }
}

object SyncScheduler {
    private const val PERIODIC = "synapsebox-sync"; private const val NOW = "synapsebox-sync-now"

    /** (Re)programa la sincronización periódica según los ajustes, o la cancela si está desactivada. */
    fun apply(c: Context) {
        Prefs.init(c)
        val wm = WorkManager.getInstance(c)
        if (!Prefs.syncEnabled || Prefs.token == null || Prefs.localPath.isBlank()) { wm.cancelUniqueWork(PERIODIC); return }
        val cons = Constraints.Builder()
            .setRequiredNetworkType(if (Prefs.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresCharging(Prefs.chargingOnly).build()
        val req = PeriodicWorkRequestBuilder<SyncWorker>(maxOf(15, Prefs.intervalMin).toLong(), TimeUnit.MINUTES)
            .setConstraints(cons).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build()
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    /** Sincroniza ahora, sin esperar al intervalo (solo necesita conexión). */
    fun now(c: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST).build()
        WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP, req)
    }

    /** Vuelve a hacer la copia inicial: borra las «fotos» guardadas y la marca de copia inicial. */
    fun reset(c: Context) { Prefs.initialKey = ""; c.filesDir.listFiles()?.filter { it.name.startsWith("sync_state_") }?.forEach { it.delete() } }

    fun stop(c: Context) { val wm = WorkManager.getInstance(c); wm.cancelUniqueWork(PERIODIC); wm.cancelUniqueWork(NOW) }
}
