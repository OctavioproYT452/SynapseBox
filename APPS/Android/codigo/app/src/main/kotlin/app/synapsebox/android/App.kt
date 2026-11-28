package app.synapsebox.android

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Prefs.init(this); SyncLog.init(this); Look.applyMode(); Notif.channels(this); SyncScheduler.apply(this); UpdateScheduler.apply(this)
    }
}

/** Tras reiniciar o actualizar la app se vuelve a programar la sincronización. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) { Prefs.init(c); SyncScheduler.apply(c) }
}
