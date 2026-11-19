// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import vn.opentea.staffwork.data.AttendanceStatus
import vn.opentea.staffwork.data.LeaveStatus
import vn.opentea.staffwork.data.PayslipStatus
import vn.opentea.staffwork.data.TaskPriority
import vn.opentea.staffwork.data.TaskStatus
import vn.opentea.staffwork.ui.theme.Tea

/** The tea-leaf mark shared with the desktop app (same 24×24 path). */
@Composable
fun LeafLogo(size: Dp = 48.dp, background: Color = Tea.Primary, leaf: Color = Tea.Lime) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(size * 0.28f)).background(background),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size * 0.6f)) {
            val k = this.size.width / 24f
            fun p(x: Float, y: Float) = Offset(x * k, y * k)
            val path = Path().apply {
                moveTo(p(12f, 2f).x, p(12f, 2f).y)
                cubicTo(p(5f, 6f).x, p(5f, 6f).y, p(3f, 12f).x, p(3f, 12f).y, p(5f, 19f).x, p(5f, 19f).y)
                cubicTo(p(5.5f, 20.5f).x, p(5.5f, 20.5f).y, p(6.5f, 21.5f).x, p(6.5f, 21.5f).y, p(8f, 22f).x, p(8f, 22f).y)
                cubicTo(p(15f, 22f).x, p(15f, 22f).y, p(20f, 16f).x, p(20f, 16f).y, p(20f, 8f).x, p(20f, 8f).y)
                cubicTo(p(20f, 5f).x, p(20f, 5f).y, p(18f, 3f).x, p(18f, 3f).y, p(12f, 2f).x, p(12f, 2f).y)
                close()
            }
            drawPath(path, leaf)
            val vein = Path().apply {
                moveTo(p(7f, 20f).x, p(7f, 20f).y)
                cubicTo(p(9f, 15f).x, p(9f, 15f).y, p(12f, 10f).x, p(12f, 10f).y, p(17f, 6f).x, p(17f, 6f).y)
            }
            drawPath(vein, background, style = Stroke(width = 1.3f * k, cap = StrokeCap.Round))
        }
    }
}

enum class Tone(val fg: Color, val bg: Color) {
    Success(Tea.Success, Tea.SuccessSubtle),
    Info(Tea.Info, Tea.InfoSubtle),
    Warning(Tea.Warning, Tea.WarningSubtle),
    Danger(Tea.Danger, Tea.DangerSubtle),
    Neutral(Tea.Neutral, Tea.NeutralSubtle),
    Brand(Tea.Primary, Tea.PrimarySubtle),
}

fun TaskStatus.tone() = when (this) {
    TaskStatus.Completed -> Tone.Success
    TaskStatus.InProgress, TaskStatus.Accepted -> Tone.Info
    TaskStatus.Assigned -> Tone.Warning
    TaskStatus.Rejected -> Tone.Danger
    TaskStatus.Cancelled -> Tone.Neutral
}

fun TaskPriority.tone() = when (this) {
    TaskPriority.Urgent -> Tone.Danger
    TaskPriority.High -> Tone.Warning
    TaskPriority.Normal -> Tone.Brand
    TaskPriority.Low -> Tone.Neutral
}

fun LeaveStatus.tone() = when (this) {
    LeaveStatus.Approved -> Tone.Success
    LeaveStatus.Pending -> Tone.Warning
    LeaveStatus.Rejected -> Tone.Danger
    LeaveStatus.Cancelled -> Tone.Neutral
}

fun PayslipStatus.tone() = when (this) {
    PayslipStatus.Paid -> Tone.Success
    PayslipStatus.Approved -> Tone.Info
    PayslipStatus.Draft -> Tone.Warning
}

fun AttendanceStatus.tone() = when (this) {
    AttendanceStatus.Present -> Tone.Success
    AttendanceStatus.HalfDay -> Tone.Warning
    AttendanceStatus.PaidLeave -> Tone.Info
    AttendanceStatus.UnpaidLeave -> Tone.Neutral
    AttendanceStatus.Absent -> Tone.Danger
}

@Composable
fun Pill(text: String, tone: Tone, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.clip(CircleShape).background(tone.bg).padding(horizontal = 10.dp, vertical = 3.dp),
        color = tone.fg,
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
    )
}

/** White card with a thin border, the basic surface of every screen. */
@Composable
fun TeaCard(modifier: Modifier = Modifier, padding: Dp = 16.dp, content: @Composable () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Tea.Card)
            .border(1.dp, Tea.Border, RoundedCornerShape(16.dp))
            .padding(padding),
    ) { content() }
}

@Composable
fun IconBadge(icon: ImageVector, tone: Tone = Tone.Brand, size: Dp = 40.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(12.dp)).background(tone.bg), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = tone.fg, modifier = Modifier.size(size * 0.5f))
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, message: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 48.dp, horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        IconBadge(icon, Tone.Brand, 64.dp)
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = Tea.InkTertiary, textAlign = TextAlign.Center)
    }
}

@Composable
fun StatBox(label: String, value: String, modifier: Modifier = Modifier, tone: Tone = Tone.Brand) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).background(tone.bg).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = tone.fg, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(label, style = MaterialTheme.typography.bodySmall, color = Tea.InkSecondary, maxLines = 1)
    }
}

@Composable
fun LabeledRow(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color = Tea.Ink, bold: Boolean = false) {
    Row(modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = valueColor, fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold)
    }
}

object Fmt {
    private val vi = Locale.forLanguageTag("vi-VN")
    private val money = NumberFormat.getNumberInstance(vi)
    private val dayMonth = DateTimeFormatter.ofPattern("dd/MM")
    private val full = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    private val weekday = DateTimeFormatter.ofPattern("EEEE, dd/MM/yyyy", vi)

    fun money(value: Double): String = money.format(value) + " ₫"
    fun number(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else String.format(vi, "%.1f", value)

    fun dateTime(iso: String): LocalDateTime? = runCatching { LocalDateTime.parse(iso) }.getOrNull()
    fun date(iso: String): LocalDate? = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull()

    fun due(iso: String): String {
        val dt = dateTime(iso) ?: return iso
        val today = LocalDate.now()
        val day = when (dt.toLocalDate()) {
            today -> "Hôm nay"
            today.plusDays(1) -> "Ngày mai"
            today.minusDays(1) -> "Hôm qua"
            else -> dt.format(dayMonth)
        }
        return "$day ${"%02d:%02d".format(dt.hour, dt.minute)}"
    }

    fun dayMonth(iso: String) = date(iso)?.format(dayMonth) ?: iso
    fun fullDate(iso: String) = date(iso)?.format(full) ?: iso
    fun todayLabel(): String = LocalDate.now().format(weekday).replaceFirstChar { it.uppercase(vi) }
}
