package com.resultv.android.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.abs

/**
 * Lightweight sparkline. Renders [values] as a smooth-ish line with a faint
 * fill underneath. If the buffer has fewer than 2 points, draws a flat dashed
 * baseline instead so empty states still occupy the same space.
 *
 * Self-scales — caller controls size via Modifier. Consumer pushes raw values
 * (latency ms, bytes/sec, anything) and the component normalises to the
 * observed [min..max] range.
 */
@Composable
fun Sparkline(
    values: List<Float>,
    color: Color,
    modifier: Modifier = Modifier,
    fillAlpha: Float = 0.18f,
    strokeWidthPx: Float = 2.5f,
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        if (w <= 0f || h <= 0f) return@Canvas

        if (values.size < 2) {
            // Empty / single-point: faint dashed baseline.
            drawLine(
                color = color.copy(alpha = 0.25f),
                start = Offset(0f, h / 2f),
                end = Offset(w, h / 2f),
                strokeWidth = 1f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f)),
            )
            return@Canvas
        }

        val min = values.min()
        val max = values.max()
        val span = (max - min).let { if (abs(it) < 1e-6f) 1f else it }

        val stepX = w / (values.size - 1).toFloat()
        // Inset vertically so the stroke isn't clipped.
        val pad = strokeWidthPx
        val drawH = h - pad * 2

        fun pointAt(i: Int): Offset {
            val x = i * stepX
            val norm = (values[i] - min) / span // 0..1
            val y = pad + (1f - norm) * drawH
            return Offset(x, y)
        }

        // Stroke path.
        val stroke = Path().apply {
            val first = pointAt(0)
            moveTo(first.x, first.y)
            for (i in 1 until values.size) {
                val p = pointAt(i)
                lineTo(p.x, p.y)
            }
        }
        // Fill path = stroke + bottom corners.
        val fill = Path().apply {
            addPath(stroke)
            lineTo(w, h)
            lineTo(0f, h)
            close()
        }

        drawPath(
            path = fill,
            brush = Brush.verticalGradient(
                listOf(color.copy(alpha = fillAlpha), Color.Transparent),
            ),
        )
        drawPath(
            path = stroke,
            color = color,
            style = Stroke(
                width = strokeWidthPx,
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    }
}
