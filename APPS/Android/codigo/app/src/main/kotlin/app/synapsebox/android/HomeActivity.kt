package app.synapsebox.android

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/** Pantalla de inicio: espacio usado, estado de la sincronización y accesos rápidos. */
class HomeActivity : SecureActivity() {
    private lateinit var usageText: TextView
    private lateinit var usageBar: ProgressBar
    private lateinit var srvInfo: TextView
    private val pick = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isEmpty()) return@registerForActivityResult
        android.widget.Toast.makeText(this, "Subiendo ${uris.size} archivo(s)…", android.widget.Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            val msg = try {
                val r = withContext(Dispatchers.IO) { Uploader.upload(this@HomeActivity, uris) }
                if (r.failed.isEmpty()) "Subido: ${r.ok} archivo(s) a «${Uploader.FOLDER}»" else "Subidos ${r.ok}; fallaron: ${r.failed.joinToString()}"
            } catch (e: Exception) { "No se pudo subir: ${e.message ?: e.javaClass.simpleName}" }
            android.widget.Toast.makeText(this@HomeActivity, msg, android.widget.Toast.LENGTH_LONG).show()
        }
    }
    private val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, k -> if (k == "status" || k == "lastSync" || k == "syncEnabled") refreshSync() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.token == null || Prefs.server.isEmpty()) { startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        val server = Prefs.server.removePrefix("https://").removePrefix("http://") + if (Ngrok.isNgrokUrl(Prefs.server)) "  ·  ngrok" else ""
        fun body() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fun syncCard(b: LinearLayout) { val c = card(b); val pill = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; c.addView(pill); syncViews.add(pill to label(c, "", 13f, alpha = .8f)) }
        val goSync = { startActivity(Intent(this, SyncSettingsActivity::class.java)) }
        val syncNow = {
            if (Prefs.localPath.isBlank() || !Storage.hasAccess(this)) goSync()
            else { Prefs.syncEnabled = true; SyncScheduler.apply(this); SyncScheduler.now(this) }
        }

        // Inicio: espacio y estado de un vistazo
        val home = body()
        val c1 = card(home, "Mi espacio")
        usageText = label(c1, "Calculando…", 18f, bold = true)
        usageBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 1000; visibility = View.GONE; layoutParams = LinearLayout.LayoutParams(-1, px(10)).apply { topMargin = px(8) } }
        c1.addView(usageBar)
        section(home, "Sincronización"); syncCard(home)
        tileRow(home, tl(R.drawable.ic_upload, "Subir archivos") { pick.launch("*/*") }, tl(R.drawable.ic_sync, "Sincronizar ahora") { syncNow() })

        // Archivos
        val files = body()
        tileRow(files, tl(R.drawable.ic_upload, "Subir archivos") { pick.launch("*/*") }, tl(R.drawable.ic_folder, "Mis archivos") { startActivity(Intent(this, MainActivity::class.java)) })
        tileRow(files, tl(R.drawable.ic_search, "Explorar") { startActivity(Intent(this, ExploreActivity::class.java)) }, tl(R.drawable.ic_eye, "Abrir en el navegador") { Browse.open(this, Prefs.server + "/panel.html") })
        label(files, "Explorar busca por nombre y filtra por tipo, recientes o carpetas vacías.", 13f, alpha = .65f, top = 14)

        // Sincronización
        val sync = body()
        syncCard(sync)
        tileRow(sync, tl(R.drawable.ic_sync, "Sincronizar ahora") { syncNow() }, tl(R.drawable.ic_settings, "Configurar") { goSync() })

        // Administración (solo admins)
        val admin = body()
        tileRow(admin, tl(R.drawable.ic_users, "Archivos de usuarios") { startActivity(Intent(this, AdminFilesActivity::class.java)) })
        label(admin, "Ver, descargar y eliminar archivos de cualquier usuario. No se crea ni modifica nada.", 13f, alpha = .65f, top = 14)

        // Ajustes
        val set = body()
        tileRow(set, tl(R.drawable.ic_grid, "Más funciones") { startActivity(Intent(this, ExtrasActivity::class.java)) }, tl(R.drawable.ic_palette, "Apariencia") { startActivity(Intent(this, AppearanceActivity::class.java)) })
        tileRow(set, tl(R.drawable.ic_shield, "Seguridad") { startActivity(Intent(this, SecurityActivity::class.java)) }, tl(R.drawable.ic_update, "Actualizaciones") { startActivity(Intent(this, UpdateActivity::class.java)) })
        section(set, "Cuenta")
        val c3 = card(set)
        srvInfo = label(c3, "", 12f, alpha = .65f)
        btn(c3, "Cambiar de servidor", 1) { confirm("Cambiar de servidor", "Se cerrará la sesión actual.") { logout(true) } }
        btn(c3, "Cerrar sesión", 2) { confirm("Cerrar sesión", "La sincronización se detendrá hasta que vuelvas a entrar.") { logout(false) } }

        allTabs = listOf(
            Tab("home", R.drawable.ic_home, "Inicio", hero("Hola, ${Prefs.username.ifEmpty { "bienvenido" }}", server), home),
            Tab("files", R.drawable.ic_folder, "Archivos", hero("Archivos", "Sube, busca y explora", true), files),
            Tab("sync", R.drawable.ic_sync, "Sync", hero("Sincronización", "Tu carpeta, siempre al día", true), sync),
            Tab("admin", R.drawable.ic_users, "Admin", hero("Administración", "Solo administradores", true), admin),
            Tab("settings", R.drawable.ic_settings, "Ajustes", hero("Ajustes", "Personaliza y protege la app", true), set),
        )
        host = body()
        scroll = android.widget.ScrollView(this).apply { isFillViewport = true; addView(host) }
        nav = BottomNav(this, emptyList()) { i -> show(visibleTabs()[i].id) }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(if (Look.black(context)) 0xFF000000.toInt() else themeColor(com.google.android.material.R.attr.colorSurface, 0xFF121212.toInt()))
            addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f)); addView(nav, LinearLayout.LayoutParams(-1, -2))
        }
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root) { v, ins ->
            val b = ins.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() or androidx.core.view.WindowInsetsCompat.Type.displayCutout())
            v.setPadding(b.left, 0, b.right, 0); topInset = b.top; nav.bottomInset = b.bottom.toFloat(); inset(allTabs.first { it.id == cur }.hero)
            androidx.core.view.WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
        refreshNav(); show("home")
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (cur != "home") { cur = "home"; refreshNav(); show("home") } else finish() }
        })
    }

    private class Tab(val id: String, val icon: Int, val label: String, val hero: View, val body: LinearLayout)
    private lateinit var allTabs: List<Tab>
    private lateinit var nav: BottomNav
    private lateinit var host: LinearLayout
    private lateinit var scroll: android.widget.ScrollView
    private val syncViews = mutableListOf<Pair<LinearLayout, TextView>>()
    private var cur = "home"
    private var topInset = 0

    private fun visibleTabs() = allTabs.filter { it.id != "admin" || Prefs.isAdmin }
    private fun inset(h: View) { val base = (h.tag as? Int) ?: h.paddingTop.also { h.tag = it }; h.setPadding(h.paddingLeft, base + topInset, h.paddingRight, h.paddingBottom) }
    private fun refreshNav() { val v = visibleTabs(); if (v.none { it.id == cur }) cur = "home"; nav.setItems(v.map { it.icon to it.label }, v.indexOfFirst { it.id == cur }) }
    private fun show(id: String) {
        cur = id; val t = allTabs.first { it.id == id }
        host.removeAllViews(); inset(t.hero); host.addView(t.hero)
        t.body.setPadding(px(16), px(16), px(16), px(24)); host.addView(t.body); scroll.scrollTo(0, 0)
    }

    override fun onResume() {
        super.onResume()
        if (Prefs.token == null) return
        refreshSync(); Prefs.raw.registerOnSharedPreferenceChangeListener(listener)
        lifecycleScope.launch {
            try {
                val u = withContext(Dispatchers.IO) { Api.renewIfNeeded(); Api.usage() }
                withContext(Dispatchers.IO) { Api.serverInfo(true) }.let { i ->
                    srvInfo.text = if (i.version.isNotEmpty()) "Servidor SynapseBox v${i.version} · API ${i.api}" + (if (i.features.size >= 5) " · funciones avanzadas de sincronización activas" else "") else "Servidor antiguo (sin funciones avanzadas): actualiza SynapseBox a la 2.25 para subidas reanudables y más"
                }
                if (u.maxMb > 0) {
                    usageText.text = "${fmtBytes(u.used)} de ${fmtBytes(u.maxMb * 1024 * 1024)}"
                    usageBar.visibility = View.VISIBLE; usageBar.progress = (u.used * 1000 / (u.maxMb * 1024 * 1024)).toInt().coerceIn(0, 1000)
                } else usageText.text = "${fmtBytes(u.used)} usados (sin límite)"
                val adm = withContext(Dispatchers.IO) { try { Api.isAdmin() } catch (e: ApiException) { false } }
                if (adm != Prefs.isAdmin) { Prefs.isAdmin = adm; refreshNav() }
            } catch (e: AuthException) { Prefs.clearSession(); startActivity(Intent(this@HomeActivity, LoginActivity::class.java)); finish() }
            catch (e: Exception) { usageText.text = "Sin conexión con el servidor" }
        }
    }

    override fun onPause() { super.onPause(); Prefs.raw.unregisterOnSharedPreferenceChangeListener(listener) }

    private fun refreshSync() = runOnUiThread {
        for ((box, status) in syncViews) {
            box.removeAllViews()
            pill(box, if (Prefs.syncEnabled) "{on} Activa · " + Prefs.mode.let { when (it) { "upload" -> "solo subir"; "download" -> "solo bajar"; else -> "bidireccional" } } else "{off} Desactivada", Prefs.syncEnabled)
            val last = if (Prefs.lastSync > 0) "\nÚltima vez: " + DateFormat.getDateTimeInstance().format(Date(Prefs.lastSync)) else ""
            status.ic((if (Prefs.localPath.isBlank()) "Aún no has elegido una carpeta." else Prefs.localPath) + "\n" + Prefs.status + last)
        }
    }

    private fun confirm(t: String, m: String, ok: () -> Unit) =
        AlertDialog.Builder(this).setTitle(t).setMessage(m).setPositiveButton("Continuar") { _, _ -> ok() }.setNegativeButton("Cancelar", null).show()

    private fun logout(changeServer: Boolean) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { try { Api.logout() } catch (e: Exception) { } }
            SyncScheduler.stop(this@HomeActivity); Prefs.clearSession()
            if (changeServer) Prefs.server = ""
            android.webkit.CookieManager.getInstance().removeAllCookies(null); android.webkit.WebStorage.getInstance().deleteAllData()
            startActivity(Intent(this@HomeActivity, LoginActivity::class.java)); finish()
        }
    }
}
