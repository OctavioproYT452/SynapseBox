package app.synapsebox.android

import android.content.Context
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate

/** Temas y colores locales de la app (no cambian nada en el servidor ni en el panel web). */
object Look {
    class Accent(val name: String, val c1: Int, val c2: Int)
    val accents = listOf(
        Accent("Sistema", 0, 0), // Material You en Android 12+; en versiones anteriores, índigo
        Accent("Índigo", 0xFF6D7CFF.toInt(), 0xFF3F4DD1.toInt()),
        Accent("Esmeralda", 0xFF2FBF8F.toInt(), 0xFF0F7A5A.toInt()),
        Accent("Naranja", 0xFFFF9D4D.toInt(), 0xFFC4500A.toInt()),
        Accent("Rosa", 0xFFFF6FA5.toInt(), 0xFFB5174F.toInt()),
        Accent("Turquesa", 0xFF35C4D9.toInt(), 0xFF0A7C8C.toInt()),
        Accent("Grafito", 0xFF8A93A3.toInt(), 0xFF2F3541.toInt()),
    )

    /** (color claro, color oscuro) del acento elegido. */
    fun colors(c: Context): Pair<Int, Int> {
        val i = Prefs.accent.coerceIn(0, accents.size - 1)
        if (i == 0) return if (Build.VERSION.SDK_INT >= 31) c.getColor(android.R.color.system_accent1_400) to c.getColor(android.R.color.system_accent1_700) else accents[1].c1 to accents[1].c2
        return accents[i].c1 to accents[i].c2
    }
    /** Relleno de botones y de interruptores (oscuro: buen contraste con texto blanco). */
    fun primary(c: Context) = colors(c).second
    /** Color de texto/enlaces: más claro en modo oscuro. */
    fun text(c: Context) = if (isNight(c)) colors(c).first else colors(c).second
    fun isNight(c: Context) = (c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    fun black(c: Context) = Prefs.amoled && isNight(c)

    fun applyMode() = AppCompatDelegate.setDefaultNightMode(when (Prefs.themeMode) { 1 -> AppCompatDelegate.MODE_NIGHT_NO; 2 -> AppCompatDelegate.MODE_NIGHT_YES; else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM })

    /** Radio de esquinas según la preferencia. */
    fun radius(c: Context, base: Int): Float = c.resources.displayMetrics.density * base * when (Prefs.corners) { 0 -> 0.35f; 2 -> 1.35f; else -> 1f }

    fun tint(c: Context) = ColorStateList.valueOf(primary(c))
}
