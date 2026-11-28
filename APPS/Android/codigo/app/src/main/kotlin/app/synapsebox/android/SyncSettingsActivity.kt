package app.synapsebox.android

import android.Manifest
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import java.io.File
import java.text.DateFormat
import java.util.Date

/** Configuración de la carpeta sincronizada y de la sincronización en segundo plano. */
class SyncSettingsActivity : SecureActivity() {
    private lateinit var permText: TextView
    private lateinit var statusText: TextView
    private lateinit var initText: TextView
    private lateinit var localEdit: TextInputEditText
    private lateinit var remoteEdit: TextInputEditText
    private lateinit var enabled: MaterialSwitch
    private var building = true
    private val intervals = intArrayOf(15, 30, 60, 180, 360, 720, 1440)
    private val intervalLabels = arrayOf("Cada 15 minutos", "Cada 30 minutos", "Cada hora", "Cada 3 horas", "Cada 6 horas", "Cada 12 horas", "Una vez al día")

    private val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, k -> if (k == "status" || k == "lastSync" || k == "initialKey") refreshStatus() }

    private val pickFolder = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri == null) return@registerForActivityResult
        val p = Storage.pathFromTree(uri)
        if (p == null) toast("No se pudo obtener la ruta de esa carpeta. Escríbela a mano.") else localEdit.setText(p)
    }
    private val legacyPerm = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refreshPerm() }
    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Sincronización de carpeta"
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val hero = hero("Sincronización", "Tu carpeta del teléfono, igual que tu SynapseBox")

        // Estado + interruptor principal
        val c0 = card(b)
        enabled = switchRow(c0, "Sincronizar en segundo plano", "Se ejecuta aunque cierres la app", Prefs.syncEnabled) { on ->
            if (building) return@switchRow
            if (on && localEdit.text.isNullOrBlank()) { setOff(); toast("Elige primero la carpeta del teléfono"); return@switchRow }
            if (on && !Storage.hasAccess(this)) { setOff(); toast("Concede primero el acceso a todos los archivos"); return@switchRow }
            save(); Prefs.syncEnabled = on; SyncScheduler.apply(this)
        }
        statusText = label(c0, "", 13f, alpha = .8f, top = 10)
        initText = label(c0, "", 12f, alpha = .65f)
        btn(c0, "Sincronizar ahora") {
            if (localEdit.text.isNullOrBlank()) return@btn toast("Elige primero la carpeta del teléfono")
            if (!Storage.hasAccess(this)) return@btn toast("Concede primero el acceso a todos los archivos")
            save(); Prefs.syncEnabled = true; building = true; enabled.isChecked = true; building = false
            SyncScheduler.apply(this); SyncScheduler.now(this); toast("Sincronizando…")
        }

        // Permisos
        val c1 = card(b, "Permisos")
        permText = label(c1, "")
        btn(c1, "Dar acceso a todos los archivos", 1) { askAllFiles() }
        btn(c1, "Permitir notificaciones", 1) {
            if (Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS) else toast("No hace falta en esta versión de Android")
        }
        btn(c1, "Evitar que el ahorro de batería la detenga", 1) {
            val pm = getSystemService(PowerManager::class.java)
            if (pm.isIgnoringBatteryOptimizations(packageName)) toast("Ya está excluida del ahorro de batería")
            else try { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
            catch (e: Exception) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }

        // Carpetas
        val c2 = card(b, "Carpetas")
        localEdit = input(c2, "Carpeta del teléfono (ej.: /storage/emulated/0/SynapseBox)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, Prefs.localPath)
        btn(c2, "Elegir o crear carpeta…", 1) { pickFolder.launch(null) }
        btn(c2, "Crear «SynapseBox» en el almacenamiento interno", 2) {
            val f = File(Environment.getExternalStorageDirectory(), "SynapseBox")
            if (Storage.hasAccess(this) && (f.isDirectory || f.mkdirs())) localEdit.setText(f.path) else toast("No se pudo crear: concede primero el acceso a todos los archivos")
        }
        remoteEdit = input(c2, "Carpeta en SynapseBox (vacío = todo tu espacio)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, Prefs.remotePath)

        // Dirección
        val c3 = card(b, "Dirección")
        radios(c3, listOf("two_way" to "Bidireccional (recomendado)", "upload" to "Solo subir (copia de seguridad del teléfono)", "download" to "Solo bajar (espejo del servidor)"), Prefs.mode) { Prefs.mode = it }

        // Estrategia
        val c4 = card(b, "Qué sincronizar")
        radios(c4, listOf(
            "full_then_changes" to "Copiar todo lo actual y después sincronizar los cambios",
            "initial_only" to "Solo copiar lo actual una vez y detenerse",
            "changes_only" to "Solo los cambios a partir de ahora (ignora lo que ya existe)",
        ), Prefs.syncStrategy) { Prefs.syncStrategy = it; refreshStatus() }
        label(c4, "Tipos de cambio a sincronizar", 14f, bold = true, top = 14)
        switchRow(c4, "Archivos nuevos", "Los que se creen o aparezcan después", Prefs.optNew) { Prefs.optNew = it }
        switchRow(c4, "Archivos modificados", "Cuando cambie su contenido", Prefs.optMod) { Prefs.optMod = it }
        switchRow(c4, "Archivos borrados", "Lo que borres en un lado se borra en el otro (va a la papelera)", Prefs.optDel) { Prefs.optDel = it }
        switchRow(c4, "Carpetas", "Crear y borrar carpetas (también las vacías)", Prefs.optDirs) { Prefs.optDirs = it }
        label(c4, "La copia inicial nunca borra nada. Los archivos que la sincronización borre en el teléfono se guardan 30 días en la carpeta oculta «.sync-trash».", 12f, alpha = .6f, top = 10)
        btn(c4, "Reiniciar sincronización (repetir la copia inicial)", 1) {
            AlertDialog.Builder(this).setTitle("Reiniciar").setMessage("Se olvidará lo sincronizado hasta ahora y se volverá a hacer la copia inicial. No se borra ningún archivo.")
                .setPositiveButton("Reiniciar") { _, _ -> SyncScheduler.reset(this); Prefs.status = "Reiniciada: la próxima sincronización hará la copia inicial"; refreshStatus() }
                .setNegativeButton("Cancelar", null).show()
        }

        // Cuándo
        val c5 = card(b, "Cuándo")
        val sp = Spinner(this); sp.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, intervalLabels)
        sp.setSelection(intervals.indexOf(Prefs.intervalMin).coerceAtLeast(0))
        sp.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) { if (Prefs.intervalMin != intervals[pos]) { Prefs.intervalMin = intervals[pos]; SyncScheduler.apply(this@SyncSettingsActivity) } }
            override fun onNothingSelected(p: AdapterView<*>?) {}
        }
        c5.addView(sp)
        switchRow(c5, "Solo con Wi-Fi", "O red sin límite de datos", Prefs.wifiOnly) { Prefs.wifiOnly = it; SyncScheduler.apply(this) }
        switchRow(c5, "Solo mientras se carga", "Ahorra batería", Prefs.chargingOnly) { Prefs.chargingOnly = it; SyncScheduler.apply(this) }

        btn(b, "Detener la sincronización", 2) { setOff(); SyncScheduler.stop(this); Prefs.status = "Detenida" }
        setContentView(page(hero, b))
        building = false
    }

    private fun radios(parent: LinearLayout, opts: List<Pair<String, String>>, current: String, onPick: (String) -> Unit) {
        val rg = RadioGroup(this)
        opts.forEachIndexed { i, (k, label) -> rg.addView(RadioButton(this).apply { id = 100 + i; text = label; isChecked = current == k; setPadding(px(6), px(8), 0, px(8)) }) }
        rg.setOnCheckedChangeListener { _, id -> onPick(opts[id - 100].first) }
        parent.addView(rg)
    }

    private fun setOff() { Prefs.syncEnabled = false; building = true; enabled.isChecked = false; building = false }

    override fun onResume() { super.onResume(); refreshPerm(); refreshStatus(); Prefs.raw.registerOnSharedPreferenceChangeListener(listener) }
    override fun onPause() { super.onPause(); Prefs.raw.unregisterOnSharedPreferenceChangeListener(listener); save(); SyncScheduler.apply(this) }

    private fun save() { Prefs.localPath = localEdit.text.toString().trim().trimEnd('/'); Prefs.remotePath = remoteEdit.text.toString().trim().trim('/') }

    private fun askAllFiles() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try { startActivity(Storage.allFilesIntent(this)) }
            catch (e: Exception) { startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
        } else legacyPerm.launch(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE))
    }

    private fun refreshPerm() { permText.ic(if (Storage.hasAccess(this)) "{ok} Acceso a todos los archivos concedido" else "{warn} Falta el acceso a todos los archivos (necesario para sincronizar la carpeta que elijas)") }
    private fun refreshStatus() {
        val last = if (Prefs.lastSync > 0) "\nÚltima vez: " + DateFormat.getDateTimeInstance().format(Date(Prefs.lastSync)) else ""
        runOnUiThread {
            statusText.ic(Prefs.status + last)
            initText.ic(if (Prefs.initialDone) "{ok} Copia inicial hecha" else if (Prefs.syncStrategy == "changes_only") "Primera pasada: guardará la línea base sin copiar nada" else "Copia inicial pendiente")
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
