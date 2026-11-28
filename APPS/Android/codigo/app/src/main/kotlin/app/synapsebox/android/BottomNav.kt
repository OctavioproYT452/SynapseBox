package app.synapsebox.android

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import androidx.appcompat.content.res.AppCompatResources

/**
 * Barra inferior con una burbuja que "flota" sobre la pestaña elegida y deja una muesca en la barra.
 * Se dibuja a mano; la burbuja se desliza al cambiar de pestaña y usa los colores de Apariencia.
 */
class BottomNav(ctx: Context, items: List<Pair<Int, String>>, private val onSelect: (Int) -> Unit) : View(ctx) {
    private val d = resources.displayMetrics.density
    private val over = 30 * d      // lo que sobresale la burbuja por encima de la barra
    private val barH = 68 * d
    private var items = items
    private var icons: List<Drawable> = emptyList()
    private var selected = 0
    private var pos = 0f           // posición animada (índice fraccionario)
    var bottomInset = 0f
        set(v) { field = v; requestLayout() }

    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bubblePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; textSize = 11 * d; typeface = Typeface.DEFAULT_BOLD }
    private val path = Path()
    private val notch = Path()

    init { setItems(items, 0) }

    fun setItems(list: List<Pair<Int, String>>, sel: Int) {
        items = list; selected = sel.coerceIn(0, (list.size - 1).coerceAtLeast(0)); pos = selected.toFloat()
        icons = list.map { AppCompatResources.getDrawable(context, it.first)!!.mutate() }
        invalidate()
    }

    private fun go(i: Int) {
        if (i == selected) return
        selected = i
        ValueAnimator.ofFloat(pos, i.toFloat()).apply { duration = 280; interpolator = DecelerateInterpolator(1.6f); addUpdateListener { pos = it.animatedValue as Float; invalidate() }; start() }
        onSelect(i)
    }

    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), (over + barH + bottomInset).toInt())

    override fun onDraw(c: Canvas) {
        val n = items.size; if (n == 0) return
        val w = width.toFloat(); val iw = w / n; val cx = (pos + .5f) * iw
        val black = Look.black(context)
        barPaint.color = if (black) 0xFF141414.toInt() else context.themeColor(com.google.android.material.R.attr.colorSurfaceContainerHigh, 0xFF1E2130.toInt())
        val r = 28 * d; val bubbleY = over + 2 * d; val br = 29 * d
        path.reset(); path.addRoundRect(RectF(0f, over, w, height.toFloat()), floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f), Path.Direction.CW)
        notch.reset(); notch.addCircle(cx, bubbleY, br + 7 * d, Path.Direction.CW)
        path.op(notch, Path.Op.DIFFERENCE)
        c.drawPath(path, barPaint)
        val (c1, c2) = Look.colors(context)
        bubblePaint.shader = LinearGradient(cx - br, bubbleY - br, cx + br, bubbleY + br, c1, c2, Shader.TileMode.CLAMP)
        c.drawCircle(cx, bubbleY, br, bubblePaint)
        val ic = 24 * d; val fg = Look.text(context)
        for (i in 0 until n) {
            val x = (i + .5f) * iw; val sel = i == selected
            val dr = icons[i]
            val cy = if (sel) bubbleY else over + 27 * d
            dr.setTint(if (sel) 0xFFFFFFFF.toInt() else (fg and 0x00FFFFFF) or 0xB3000000.toInt())
            dr.setBounds((x - ic / 2).toInt(), (cy - ic / 2).toInt(), (x + ic / 2).toInt(), (cy + ic / 2).toInt()); dr.draw(c)
            text.color = if (sel) (if (black) 0xFFFFFFFF.toInt() else c1) else (fg and 0x00FFFFFF) or 0xB3000000.toInt()
            c.drawText(items[i].second, x, over + 52 * d, text)
        }
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> return true
            MotionEvent.ACTION_UP -> { if (items.isNotEmpty()) go((e.x / (width.toFloat() / items.size)).toInt().coerceIn(0, items.size - 1)); performClick() }
        }
        return true
    }
    override fun performClick(): Boolean { super.performClick(); return true }
}
