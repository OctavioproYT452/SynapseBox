package app.synapsebox.android

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Configuración inicial: dónde está tu servidor. Tres formas: URL, búsqueda en la red local o IP y puerto a mano. */
class SetupActivity : AppCompatActivity() {
    private lateinit var col: LinearLayout
    private lateinit var urlBox: LinearLayout
    private lateinit var lanBox: LinearLayout
    private lateinit var manualBox: LinearLayout
    private lateinit var urlEdit: TextInputEditText
    private lateinit var portsEdit: TextInputEditText
    private lateinit var hostEdit: TextInputEditText
    private lateinit var portEdit: TextInputEditText
    private lateinit var httpsSw: MaterialSwitch
    private lateinit var results: LinearLayout
    private lateinit var scanInfo: TextView
    private lateinit var bar: ProgressBar
    private lateinit var msg: TextView
    private lateinit var go: MaterialButton
    private lateinit var scanBtn: MaterialButton
    private var method = 0
    private var scanJob: Job? = null
    private var force = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val outer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val hero = hero("Conectar", "Elige dónde está tu SynapseBox")
        col = card(outer)

        val rg = RadioGroup(this).apply { setPadding(0, dp(12), 0, 0) }
        listOf("Tengo una dirección (URL)", "Buscarlo en mi red local (Wi-Fi)", "Escribir IP y puerto a mano").forEachIndexed { i, t ->
            rg.addView(RadioButton(this).apply { id = 200 + i; text = t; isChecked = i == 0 })
        }
        col.addView(rg)

        urlBox = box(); urlEdit = field(urlBox, "Dirección (https://nube.ejemplo.com o 192.168.1.20:3001)", InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_CLASS_TEXT, Prefs.server)
        label("Sin «http://» ni «https://»: las IP y nombres de red local usan http; los dominios de Internet, https.", 12f, false, .6f, urlBox)

        lanBox = box(); portsEdit = field(lanBox, "Puerto(s) del servidor, separados por comas", InputType.TYPE_CLASS_TEXT, "3001,3000,8080")
        scanBtn = button(lanBox, "Buscar en la red") { startScan() }
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { visibility = View.GONE }; lanBox.addView(bar)
        scanInfo = label("Prueba todas las direcciones de tu red Wi-Fi (por ejemplo 192.168.1.1 – 254) en esos puertos. Debes estar en la misma red que el servidor.", 12f, false, .6f, lanBox)
        results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; lanBox.addView(results)

        manualBox = box(); hostEdit = field(manualBox, "IP o nombre del servidor (192.168.1.20)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, "")
        portEdit = field(manualBox, "Puerto (3001)", InputType.TYPE_CLASS_NUMBER, "3001")
        httpsSw = MaterialSwitch(this).apply { text = "Usar HTTPS" }; manualBox.addView(httpsSw)

        msg = label("", 14f, false, 1f).apply { setTextColor(0xFFD93025.toInt()) }
        go = button(col, "Probar y continuar") { next() }
        setContentView(page(hero, outer))

        rg.setOnCheckedChangeListener { _, id -> method = id - 200; force = false; go.text = "Probar y continuar"; msg.text = ""; show() }
        show()
    }

    private fun show() {
        urlBox.visibility = if (method == 0) View.VISIBLE else View.GONE
        lanBox.visibility = if (method == 1) View.VISIBLE else View.GONE
        manualBox.visibility = if (method == 2) View.VISIBLE else View.GONE
        go.visibility = if (method == 1) View.GONE else View.VISIBLE // en la búsqueda se elige un resultado
    }

    private fun buildUrl(): String? = when (method) {
        0 -> Api.normalize(urlEdit.text.toString())
        else -> {
            val h = hostEdit.text.toString().trim(); val p = portEdit.text.toString().trim()
            if (h.isEmpty()) null else Api.normalize((if (httpsSw.isChecked) "https://" else "http://") + h + (if (p.isNotEmpty()) ":$p" else ""))
        }
    }

    private fun next() {
        val url = buildUrl() ?: return fail("La dirección no es válida")
        if (force) return save(url)
        msg.text = ""; go.isEnabled = false; go.text = "Comprobando…"
        lifecycleScope.launch {
            var v = withContext(Dispatchers.IO) { Api.probe(url, fast = false) }
            var final = url
            if (v == null && url.startsWith("https://") && method == 0 && !urlEdit.text.toString().contains("://")) { // quizá es http
                val alt = "http://" + url.removePrefix("https://")
                withContext(Dispatchers.IO) { Api.probe(alt, fast = false) }?.let { v = it; final = alt }
            }
            go.isEnabled = true
            if (v != null) save(final)
            else { force = true; go.text = "Continuar de todos modos"; fail("No se encontró SynapseBox en $url. Comprueba la dirección, el puerto y que estés en la misma red; o pulsa «Continuar de todos modos».") }
        }
    }

    private fun save(url: String) { Prefs.server = url; startActivity(Intent(this, LoginActivity::class.java)); finish() }
    private fun fail(t: String) { msg.text = t }

    private fun startScan() {
        if (scanJob?.isActive == true) { scanJob?.cancel(); return }
        val ports = portsEdit.text.toString().split(',', ' ', ';').mapNotNull { it.trim().toIntOrNull() }.filter { it in 1..65535 }.distinct().take(8)
        if (ports.isEmpty()) return fail("Escribe al menos un puerto válido")
        msg.text = ""; results.removeAllViews(); bar.visibility = View.VISIBLE; bar.progress = 0; scanBtn.text = "Detener búsqueda"
        scanInfo.text = "Buscando…"
        var count = 0
        scanJob = lifecycleScope.launch {
            try {
                Discovery.scan(ports,
                    onProgress = { d, t -> runOnUiThread { bar.max = t; bar.progress = d } },
                    onFound = { f -> runOnUiThread { count++; addResult(f) } })
                scanInfo.text = if (count == 0) "No se encontró ningún SynapseBox. Comprueba el puerto, que el servidor esté encendido y que el teléfono esté en su misma red Wi-Fi (o usa «IP y puerto a mano»)." else "Búsqueda terminada."
            } catch (e: kotlinx.coroutines.CancellationException) { scanInfo.text = "Búsqueda detenida." }
            bar.visibility = View.GONE; scanBtn.text = "Buscar en la red"
        }
    }

    private fun addResult(f: Discovery.Found) {
        results.addView(MaterialButton(this).apply {
            text = "${f.url.removePrefix("http://")}  ·  SynapseBox ${f.version}"; isAllCaps = false
            setOnClickListener { scanJob?.cancel(); save(f.url) }
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
        })
    }

    // ---- ayudas de interfaz ----
    private fun box() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, 0) }.also { col.addView(it) }
    private fun label(t: String, size: Float, bold: Boolean, alpha: Float = 1f, parent: LinearLayout = col) = TextView(this).apply {
        text = t; textSize = size; this.alpha = alpha; if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
    }.also { parent.addView(it) }
    private fun field(parent: LinearLayout, hint: String, type: Int, value: String): TextInputEditText {
        val b = TextInputLayout(this).apply { this.hint = hint; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) } }
        val e = TextInputEditText(b.context).apply { inputType = type; setText(value); setSingleLine() }
        b.addView(e); parent.addView(b); return e
    }
    private fun button(parent: LinearLayout, t: String, f: () -> Unit) = MaterialButton(this).apply {
        text = t; isAllCaps = false; setOnClickListener { f() }; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) }
    }.also { parent.addView(it) }
}
