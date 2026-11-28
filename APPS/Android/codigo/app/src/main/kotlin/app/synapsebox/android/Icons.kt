package app.synapsebox.android

import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ImageSpan
import android.widget.TextView
import androidx.core.content.ContextCompat

/**
 * Iconos vectoriales (SVG de Android) en lugar de emojis. En los textos se escriben como marcas {nombre}:
 * en pantallas se dibujan con [ic] (teñidos del color del texto); en notificaciones y portapapeles se usa [plain].
 */
object Ic {
    private val res = mapOf(
        "ok" to R.drawable.ic_check, "warn" to R.drawable.ic_warn, "err" to R.drawable.ic_err, "up" to R.drawable.ic_up, "down" to R.drawable.ic_down,
        "del" to R.drawable.ic_trash, "dir" to R.drawable.ic_folder, "mv" to R.drawable.ic_swap, "skip" to R.drawable.ic_skip,
        "on" to R.drawable.ic_dot_on, "off" to R.drawable.ic_dot_off, "back" to R.drawable.ic_back, "file" to R.drawable.ic_file, "eye" to R.drawable.ic_eye, "users" to R.drawable.ic_users,
    )
    private val plainMap = mapOf("ok" to "OK", "warn" to "!", "err" to "x", "up" to "↑", "down" to "↓", "del" to "-", "dir" to "+", "mv" to "↔", "skip" to "»", "on" to "", "off" to "", "back" to "", "file" to "", "eye" to "", "users" to "")
    private val tag = Regex("\\{(" + res.keys.joinToString("|") + ")\\}")

    fun plain(t: String): String = tag.replace(t) { plainMap[it.groupValues[1]].orEmpty() }.replace("  ", " ").trim()

    fun render(tv: TextView, t: String): CharSequence {
        if (!t.contains('{')) return t
        val sb = SpannableStringBuilder(); var last = 0
        val size = (tv.textSize * 1.05f).toInt()
        for (m in tag.findAll(t)) {
            sb.append(t, last, m.range.first); last = m.range.last + 1
            val d = ContextCompat.getDrawable(tv.context, res[m.groupValues[1]]!!)?.mutate() ?: continue
            d.setTint(tv.currentTextColor); d.setBounds(0, 0, size, size)
            val at = sb.length; sb.append("\u200A\u200A") // hueco que ocupa la imagen
            sb.setSpan(ImageSpan(d, ImageSpan.ALIGN_BASELINE), at, at + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        sb.append(t, last, t.length); return sb
    }
}

/** Asigna texto con marcas {icono} dibujando los iconos SVG. */
fun TextView.ic(t: String) { text = Ic.render(this, t) }
