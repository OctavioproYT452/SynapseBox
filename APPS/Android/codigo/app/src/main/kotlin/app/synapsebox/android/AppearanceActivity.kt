package app.synapsebox.android

import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog

/** Diseño y temas: solo afectan a esta app (no al panel web ni al servidor). */
class AppearanceActivity : SecureActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val b = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val h = hero("Apariencia", "Temas y diseño de la app")

        fun choose(title: String, opts: List<String>, cur: Int, set: (Int) -> Unit) =
            AlertDialog.Builder(this).setTitle(title).setSingleChoiceItems(opts.toTypedArray(), cur) { d, i -> set(i); d.dismiss(); recreate() }.show()

        val c1 = card(b, "Tema")
        val modes = listOf("Seguir al sistema", "Claro", "Oscuro")
        label(c1, "Modo: " + modes[Prefs.themeMode.coerceIn(0, 2)], 14f)
        btn(c1, "Cambiar modo", 1) { choose("Modo", modes, Prefs.themeMode) { Prefs.themeMode = it; Look.applyMode() } }
        switchRow(c1, "Negro AMOLED", "Fondo negro puro en modo oscuro (ahorra batería en pantallas OLED)", Prefs.amoled) { Prefs.amoled = it; recreate() }

        val c2 = card(b, "Color de acento")
        val grid = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, px(10), 0, 0) }
        val scroll = android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(grid) }
        Look.accents.forEachIndexed { i, a ->
            if (i == 0 && android.os.Build.VERSION.SDK_INT < 31) return@forEachIndexed
            val (c, d) = if (i == 0) Look.colors(this) else a.c1 to a.c2
            val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = android.view.Gravity.CENTER_HORIZONTAL; setPadding(px(6), 0, px(6), 0) }
            col.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams(px(46), px(46))
                background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(c, d)).apply { shape = GradientDrawable.OVAL; if (Prefs.accent == i) setStroke(px(3), Look.text(this@AppearanceActivity)) }
            })
            col.addView(TextView(this).apply { text = if (i == 0) "Sistema" else a.name; textSize = 11f; gravity = android.view.Gravity.CENTER; alpha = if (Prefs.accent == i) 1f else .65f })
            col.setOnClickListener { Prefs.accent = i; recreate() }
            grid.addView(col)
        }
        c2.addView(scroll)

        val c3 = card(b, "Diseño")
        val heroes = listOf("Degradado", "Color liso", "Compacta")
        label(c3, "Cabecera: " + heroes[Prefs.heroStyle.coerceIn(0, 2)], 14f)
        btn(c3, "Estilo de cabecera", 1) { choose("Cabecera", heroes, Prefs.heroStyle) { Prefs.heroStyle = it } }
        val cor = listOf("Cuadradas", "Normales", "Muy redondas")
        label(c3, "Esquinas: " + cor[Prefs.corners.coerceIn(0, 2)], 14f, top = 14)
        btn(c3, "Redondeo de esquinas", 1) { choose("Esquinas", cor, Prefs.corners) { Prefs.corners = it } }

        val c4 = card(b, "Vista previa")
        label(c4, "Así se verán botones, tarjetas e interruptores.", 13f, alpha = .8f)
        btn(c4, "Botón principal") { }
        btn(c4, "Botón con borde", 1) { }
        switchRow(c4, "Interruptor", null, true) { }
        setContentView(page(h, b))
    }
}
