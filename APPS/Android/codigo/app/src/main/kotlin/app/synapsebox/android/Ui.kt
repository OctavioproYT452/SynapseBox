package app.synapsebox.android

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.color.MaterialColors
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

/** Pequeña biblioteca de vistas con el estilo de la app (Material 3: tarjetas redondeadas, cabecera con degradado, botones grandes). */
fun Context.px(v: Int) = (v * resources.displayMetrics.density).toInt()
fun Context.themeColor(attr: Int, def: Int) = MaterialColors.getColor(this, attr, def)
private fun lp(top: Int = 0, w: Int = -1, h: Int = -2) = LinearLayout.LayoutParams(w, h).apply { topMargin = top }

/** Cabecera con degradado (o color liso / compacta, según Apariencia) y logotipo. */
fun Context.hero(title: String, subtitle: String? = null, noLogo: Boolean = false): LinearLayout {
    val act = this as? AppCompatActivity
    if (act != null && this !is HomeActivity && this !is LoginActivity && this !is SetupActivity) return subHero(act, title, subtitle)
    val r = Look.radius(this, 28); val (c1, c2) = Look.colors(this); val compact = Prefs.heroStyle == 2 || noLogo
    return LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = (if (Prefs.heroStyle == 1) GradientDrawable().apply { setColor(c2) } else GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(c1, c2)))
            .apply { cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r) }
        setPadding(px(24), px(if (compact) 16 else 28), px(24), px(if (compact) 16 else 28))
        if (!compact) addView(ImageView(context).apply {
            setImageResource(R.drawable.ic_launcher_fg); setColorFilter(0xFFFFFFFF.toInt())
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0x26FFFFFF) }
            layoutParams = LinearLayout.LayoutParams(px(64), px(64))
        })
        addView(TextView(context).apply { text = title; textSize = if (compact) 22f else 26f; setTypeface(typeface, Typeface.BOLD); setTextColor(0xFFFFFFFF.toInt()); layoutParams = lp(px(if (compact) 0 else 14)) })
        if (subtitle != null) addView(TextView(context).apply { text = subtitle; textSize = 14f; setTextColor(0xD9FFFFFF.toInt()); layoutParams = lp(px(2)) })
    }
}

/** Barra superior de las pantallas interiores: flecha de volver, título grande y una línea de acento. */
private fun Context.subHero(act: AppCompatActivity, title: String, subtitle: String?): LinearLayout {
    val (c1, c2) = Look.colors(this)
    return LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(if (Look.black(context)) 0xFF000000.toInt() else themeColor(com.google.android.material.R.attr.colorSurface, 0xFF121212.toInt()))
        setPadding(px(8), px(10), px(20), 0)
        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        row.addView(ImageView(context).apply {
            setImageResource(R.drawable.ic_back); setColorFilter(Look.text(context)); setPadding(px(12), px(12), px(12), px(12))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0x1F888888) }
            contentDescription = "Volver"; setOnClickListener { act.onBackPressedDispatcher.onBackPressed() }
            layoutParams = LinearLayout.LayoutParams(px(46), px(46)).apply { marginEnd = px(12); marginStart = px(8) }
        })
        val col = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        col.addView(TextView(context).apply { text = title; textSize = 22f; setTypeface(typeface, Typeface.BOLD) })
        if (subtitle != null) col.addView(TextView(context).apply { text = subtitle; textSize = 13f; alpha = .65f })
        row.addView(col); addView(row)
        addView(View(context).apply { background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(c1, c2, 0x00000000)); layoutParams = LinearLayout.LayoutParams(-1, px(3)).apply { topMargin = px(12); marginStart = px(8) } })
    }
}

/** Pantalla desplazable con cabecera opcional, respetando barras del sistema y teclado (Android 15+ dibuja de borde a borde). */
fun AppCompatActivity.page(hero: View?, body: LinearLayout): ScrollView {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    hero?.let { root.addView(it) }
    body.setPadding(px(16), px(16), px(16), px(24)); root.addView(body)
    val sv = ScrollView(this).apply { isFillViewport = true; addView(root); setBackgroundColor(if (Look.black(this@page)) 0xFF000000.toInt() else themeColor(com.google.android.material.R.attr.colorSurface, 0xFFFFFFFF.toInt())) }
    val baseTop = hero?.paddingTop ?: 0
    ViewCompat.setOnApplyWindowInsetsListener(sv) { _, ins ->
        val b = ins.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
        root.setPadding(b.left, 0, b.right, b.bottom)
        if (hero != null) hero.setPadding(hero.paddingLeft, baseTop + b.top, hero.paddingRight, hero.paddingBottom) else body.setPadding(body.paddingLeft, px(16) + b.top, body.paddingRight, body.paddingBottom)
        WindowInsetsCompat.CONSUMED
    }
    return sv
}

/** Tarjeta redondeada con título opcional; devuelve la columna interior donde añadir contenido. */
fun Context.card(parent: LinearLayout, title: String? = null): LinearLayout {
    val c = MaterialCardView(this).apply {
        radius = Look.radius(context, 24); cardElevation = 0f; strokeWidth = px(1)
        val black = Look.black(context)
        setStrokeColor(if (black) 0x33FFFFFF else themeColor(com.google.android.material.R.attr.colorOutlineVariant, 0x33888888))
        setCardBackgroundColor(if (black) 0xFF101010.toInt() else themeColor(com.google.android.material.R.attr.colorSurfaceContainerLow, 0x0D888888))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(12) }
    }
    val inner = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(18), px(16), px(18), px(16)) }
    c.addView(inner); parent.addView(c)
    if (title != null) label(inner, title, 15f, bold = true).setTextColor(Look.text(this))
    return inner
}

fun Context.label(parent: LinearLayout, t: String, size: Float = 14f, bold: Boolean = false, alpha: Float = 1f, top: Int = 6): TextView =
    TextView(this).apply {
        text = t; textSize = size; this.alpha = alpha; if (bold) setTypeface(typeface, Typeface.BOLD)
        layoutParams = lp(px(top))
    }.also { parent.addView(it) }

/** style: 0 = relleno, 1 = con borde, 2 = solo texto */
fun Context.btn(parent: LinearLayout, t: String, style: Int = 0, onClick: () -> Unit): MaterialButton {
    val b = when (style) {
        1 -> MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle)
        2 -> MaterialButton(this, null, android.R.attr.borderlessButtonStyle)
        else -> MaterialButton(this)
    }
    return b.apply {
        text = t; isAllCaps = false; textSize = 15f; setOnClickListener { onClick() }; minimumHeight = px(48); layoutParams = lp(px(10)); cornerRadius = Look.radius(context, 24).toInt()
        when (style) { // el color de acento elegido en Apariencia
            1 -> { setTextColor(Look.text(context)); strokeWidth = 0; backgroundTintList = ColorStateList.valueOf(androidx.core.graphics.ColorUtils.setAlphaComponent(Look.primary(context), 0x40)) }
            2 -> setTextColor(Look.text(context))
            else -> { backgroundTintList = Look.tint(context); setTextColor(0xFFFFFFFF.toInt()) }
        }
    }.also { parent.addView(it) }
}

fun Context.input(parent: LinearLayout, hint: String, type: Int = InputType.TYPE_CLASS_TEXT, value: String = ""): TextInputEditText {
    val box = TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle).apply { this.hint = hint; layoutParams = lp(px(10)); boxStrokeColor = Look.text(context); hintTextColor = ColorStateList.valueOf(Look.text(context)) }
    val e = TextInputEditText(box.context).apply { inputType = type; setText(value); setSingleLine() }
    box.addView(e); parent.addView(box)
    if (type and InputType.TYPE_TEXT_VARIATION_PASSWORD != 0) box.endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
    return e
}

/** Fila con título, explicación y un interruptor a la derecha. */
fun Context.switchRow(parent: LinearLayout, title: String, sub: String?, checked: Boolean, onChange: (Boolean) -> Unit): MaterialSwitch {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; layoutParams = lp(px(8)) }
    val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; layoutParams = LinearLayout.LayoutParams(0, -2, 1f) }
    col.addView(TextView(this).apply { text = title; textSize = 15f })
    if (sub != null) col.addView(TextView(this).apply { text = sub; textSize = 12f; alpha = .65f })
    val sw = MaterialSwitch(this).apply {
        isChecked = checked
        val st = arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf())
        trackTintList = ColorStateList(st, intArrayOf(Look.primary(context), themeColor(com.google.android.material.R.attr.colorSurfaceContainerHighest, 0xFFE0E0E0.toInt())))
        thumbTintList = ColorStateList(st, intArrayOf(0xFFFFFFFF.toInt(), themeColor(com.google.android.material.R.attr.colorOutline, 0xFF79747E.toInt())))
        setOnCheckedChangeListener { _, on -> onChange(on) }
    }
    row.addView(col); row.addView(sw); parent.addView(row)
    return sw
}

/** Etiqueta redondeada de estado (✓ / aviso). */
fun Context.pill(parent: LinearLayout, t: String, ok: Boolean): TextView = TextView(this).apply {
    textSize = 13f; setPadding(px(12), px(6), px(12), px(6))
    setTextColor(if (ok) 0xFF1B5E20.toInt() else 0xFF8A4B00.toInt()); ic(t)
    background = GradientDrawable().apply { cornerRadius = px(20).toFloat(); setColor(if (ok) 0xFFD7F5DC.toInt() else 0xFFFFE8C7.toInt()) }
    layoutParams = lp(px(8), -2, -2)
}.also { parent.addView(it) }

fun fmtBytes(b: Long): String {
    if (b < 1024) return "$b B"
    val u = arrayOf("KB", "MB", "GB", "TB"); var v = b / 1024.0; var i = 0
    while (v >= 1024 && i < u.size - 1) { v /= 1024; i++ }
    return String.format(java.util.Locale.getDefault(), "%.1f %s", v, u[i])
}

/** Título de sección pequeño sobre un grupo de tarjetas. */
fun Context.section(parent: LinearLayout, t: String) = label(parent, t.uppercase(), 12f, bold = true, alpha = .6f, top = 14).also { it.letterSpacing = .08f; it.setPadding(px(4), 0, 0, px(2)) }

/** Fila de 1 o 2 mosaicos (icono redondo + título) con el mismo ancho. */
fun Context.tileRow(parent: LinearLayout, vararg specs: Triple<Int, String, () -> Unit>) {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = px(10) } }
    val black = Look.black(this)
    specs.forEachIndexed { i, (icon, title, act) ->
        val card = MaterialCardView(this).apply {
            radius = Look.radius(context, 20); cardElevation = 0f; strokeWidth = px(1); isClickable = true; isFocusable = true
            setStrokeColor(if (black) 0x33FFFFFF else themeColor(com.google.android.material.R.attr.colorOutlineVariant, 0x33888888))
            setCardBackgroundColor(if (black) 0xFF101010.toInt() else themeColor(com.google.android.material.R.attr.colorSurfaceContainerLow, 0x0D888888))
            layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { if (i > 0) marginStart = px(10) }
            setOnClickListener { act() }
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(16), px(16), px(16), px(16)) }
        col.addView(ImageView(this).apply {
            setImageResource(icon); setColorFilter(0xFFFFFFFF.toInt()); setPadding(px(10), px(10), px(10), px(10))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Look.primary(context)) }
            layoutParams = LinearLayout.LayoutParams(px(44), px(44))
        })
        col.addView(TextView(this).apply { text = title; textSize = 14f; setTypeface(typeface, Typeface.BOLD); layoutParams = lp(px(10)) })
        card.addView(col); row.addView(card)
    }
    if (specs.size == 1) row.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f).apply { marginStart = px(10) } })
    parent.addView(row)
}

/** Mosaico para [tileRow]: icono, título y acción. */
fun tl(icon: Int, title: String, act: () -> Unit) = Triple(icon, title, act)
