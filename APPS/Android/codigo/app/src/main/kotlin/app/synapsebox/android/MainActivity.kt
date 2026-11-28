package app.synapsebox.android

import android.Manifest
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.appbar.MaterialToolbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Panel completo de SynapseBox dentro de la app: con el token de la sesión se crea la cookie del WebView,
 * así que todo lo del panel web (archivos, compartir, papelera, temas, IA, administración…) funciona igual que en el navegador.
 */
class MainActivity : SecureActivity() {
    private lateinit var web: WebView
    private var chooserCb: ValueCallback<Array<Uri>>? = null

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        chooserCb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data)); chooserCb = null
    }
    private val storagePerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.token == null || Prefs.server.isEmpty()) { startActivity(Intent(this, LoginActivity::class.java)); finish(); return }
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; applyInsets() }
        val bar = MaterialToolbar(this).apply { title = "Mis archivos"; subtitle = Prefs.username; setNavigationIcon(R.drawable.ic_back); setNavigationOnClickListener { finish() } }
        bar.menu.add(0, 1, 0, "Recargar"); bar.menu.add(0, 2, 1, "Sincronización de carpeta")
        bar.menu.add(0, 3, 2, "Abrir en el navegador"); bar.menu.add(0, 4, 3, "Cerrar sesión")
        bar.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> web.reload()
                2 -> startActivity(Intent(this, SyncSettingsActivity::class.java))
                3 -> Browse.open(this, Prefs.server + "/panel.html")
                4 -> logout()
            }
            true
        }
        web = WebView(this)
        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        setupWeb()
        if (Build.VERSION.SDK_INT < 29 && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            storagePerm.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE) // para las descargas en Android 7-9

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() } }
        })
        injectCookie()
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(Prefs.server + "/panel.html", Ngrok.headers(Prefs.server))
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); if (::web.isInitialized) web.saveState(outState) }

    override fun onResume() {
        super.onResume()
        if (Prefs.token == null) return
        lifecycleScope.launch {
            try { withContext(Dispatchers.IO) { Api.renewIfNeeded() }; injectCookie() }
            catch (e: AuthException) { Toast.makeText(this@MainActivity, "La sesión ha caducado", Toast.LENGTH_LONG).show(); logout() }
            catch (e: Exception) { /* sin conexión: se sigue con la sesión actual */ }
        }
    }

    override fun onDestroy() { if (::web.isInitialized) { (web.parent as? ViewGroup)?.removeView(web); web.destroy() }; super.onDestroy() }

    private fun injectCookie() {
        val t = Prefs.token ?: return
        val cm = CookieManager.getInstance(); cm.setAcceptCookie(true)
        val maxAge = ((Prefs.expiresAt - System.currentTimeMillis()) / 1000).coerceAtLeast(3600)
        val secure = if (Prefs.server.startsWith("https")) "; Secure" else ""
        cm.setCookie(Prefs.server, "fc_sid=$t; Path=/; Max-Age=$maxAge; HttpOnly; SameSite=Lax$secure"); cm.flush()
    }

    private fun sameSite(u: Uri): Boolean { val s = Uri.parse(Prefs.server); return u.host == s.host && u.port == s.port }

    private fun setupWeb() {
        web.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            // El WebView hereda el tamaño de letra del sistema (p. ej. 150 %) y eso desborda el panel: se fija al 100 % como en un navegador
            textZoom = 100
            useWideViewPort = true; loadWithOverviewMode = false
            setSupportZoom(false); builtInZoomControls = false; displayZoomControls = false
            allowFileAccess = false; allowContentAccess = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = if (Ngrok.isNgrokUrl(Prefs.server)) "SynapseBoxAndroid/1.2 (WebView)" else "$userAgentString SynapseBoxAndroid/1.2"
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                if (sameSite(r.url)) {
                    if (Net.cleartextBlocked(r.url)) { Toast.makeText(this@MainActivity, Net.BLOCK_MSG, Toast.LENGTH_LONG).show(); return true }
                    // ngrok: las navegaciones del panel llevan la cabecera para saltarse la página de aviso
                    if (r.isForMainFrame && Ngrok.isNgrokUrl(r.url.toString()) && r.requestHeaders[Ngrok.HEADER] == null) { v.loadUrl(r.url.toString(), Ngrok.headers(r.url.toString())); return true }
                    return false
                }
                // solo esquemas seguros hacia fuera (nada de intent:, file:, content:, javascript:…)
                if (r.url.scheme in listOf("http", "https", "mailto", "tel")) try { startActivity(Intent(Intent.ACTION_VIEW, r.url)) } catch (e: Exception) { }
                return true
            }
            override fun onPageFinished(v: WebView, url: String?) {
                // seguridad: nunca permitir desplazamiento horizontal de la página (nombres largos, ventanas anchas)
                v.evaluateJavascript("(function(){if(document.getElementById('sbapp-fix'))return;var s=document.createElement('style');s.id='sbapp-fix';s.textContent='html,body{overflow-x:hidden!important;max-width:100vw!important}';document.head.appendChild(s)})()", null)
            }
            override fun onReceivedError(v: WebView, r: WebResourceRequest, e: android.webkit.WebResourceError) {
                if (r.isForMainFrame) Toast.makeText(this@MainActivity, "No se pudo cargar (${e.description}). Comprueba la conexión.", Toast.LENGTH_LONG).show()
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(w: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                chooserCb?.onReceiveValue(null); chooserCb = cb
                return try { chooser.launch(p.createIntent()); true } catch (e: Exception) { chooserCb = null; false }
            }
        }
        web.setDownloadListener { url, ua, cd, mime, _ ->
            if (url.startsWith("blob:") || url.startsWith("data:")) { Toast.makeText(this, "Esta descarga no es compatible con la app. Ábrelo en el navegador.", Toast.LENGTH_LONG).show(); return@setDownloadListener }
            if (Build.VERSION.SDK_INT < 29 && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                storagePerm.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE); Toast.makeText(this, "Concede el permiso y vuelve a descargar", Toast.LENGTH_LONG).show(); return@setDownloadListener
            }
            val du = Uri.parse(url)
            if (du.scheme != "http" && du.scheme != "https") return@setDownloadListener
            if (Net.cleartextBlocked(du)) { Toast.makeText(this, Net.BLOCK_MSG, Toast.LENGTH_LONG).show(); return@setDownloadListener }
            val name = URLUtil.guessFileName(url, cd, mime)
            val rq = DownloadManager.Request(Uri.parse(url)).apply {
                if (sameSite(du)) addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: ""); // la sesión nunca se envía a otros sitios
                 addRequestHeader("User-Agent", ua); Ngrok.headers(url).forEach { (k, v) -> addRequestHeader(k, v) }
                setMimeType(mime); setTitle(name); setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            }
            try { (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(rq); Toast.makeText(this, "Descargando $name", Toast.LENGTH_SHORT).show() }
            catch (e: Exception) { Toast.makeText(this, "No se pudo descargar: ${e.message}", Toast.LENGTH_LONG).show() }
        }
    }

    private fun logout() {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { try { Api.logout() } catch (e: Exception) { } }
            SyncScheduler.stop(this@MainActivity); Prefs.clearSession()
            CookieManager.getInstance().removeAllCookies(null); WebStorage.getInstance().deleteAllData()
            web.clearCache(true); web.clearHistory(); web.clearFormData()
            startActivity(Intent(this@MainActivity, LoginActivity::class.java)); finish()
        }
    }
}
