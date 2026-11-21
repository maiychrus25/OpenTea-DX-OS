// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Tokens from OpenTea DX-OS DESIGN.md: tea green primary, white surfaces, soft leaf-green tints. */
object Tea {
    val Primary = Color(0xFF176C4B)
    val PrimaryDark = Color(0xFF125C3F)
    val PrimarySubtle = Color(0xFFE7F0EA)
    val LeafLight = Color(0xFFF1F7F2)
    val Lime = Color(0xFFD6F05C)
    val Background = Color(0xFFF5F7F3)
    val Card = Color(0xFFFFFFFF)
    val Border = Color(0xFFDCE3DD)
    val BorderSubtle = Color(0xFFE8EEE9)
    val Ink = Color(0xFF19231E)
    val InkSecondary = Color(0xFF475569)
    val InkTertiary = Color(0xFF5F6B7A)
    val Accent = Color(0xFFB45309)
    val AccentSubtle = Color(0xFFFEF3C7)
    val Success = Color(0xFF15803D)
    val SuccessSubtle = Color(0xFFDCFCE7)
    val Warning = Color(0xFF854D0E)
    val WarningSubtle = Color(0xFFFEF3C7)
    val Danger = Color(0xFFB91C1C)
    val DangerSubtle = Color(0xFFFEE2E2)
    val Info = Color(0xFF1D4ED8)
    val InfoSubtle = Color(0xFFDBEAFE)
    val Neutral = Color(0xFF5F6B7A)
    val NeutralSubtle = Color(0xFFEEF1ED)
}

private val Colors = lightColorScheme(
    primary = Tea.Primary,
    onPrimary = Color.White,
    primaryContainer = Tea.PrimarySubtle,
    onPrimaryContainer = Tea.PrimaryDark,
    secondary = Tea.Primary,
    onSecondary = Color.White,
    secondaryContainer = Tea.PrimarySubtle,
    onSecondaryContainer = Tea.PrimaryDark,
    tertiary = Tea.Accent,
    tertiaryContainer = Tea.AccentSubtle,
    background = Tea.Background,
    onBackground = Tea.Ink,
    surface = Tea.Card,
    onSurface = Tea.Ink,
    surfaceVariant = Tea.LeafLight,
    onSurfaceVariant = Tea.InkSecondary,
    surfaceContainer = Tea.Card,
    surfaceContainerLow = Tea.Card,
    surfaceContainerHigh = Tea.Card,
    surfaceContainerHighest = Tea.LeafLight,
    outline = Tea.Border,
    outlineVariant = Tea.BorderSubtle,
    error = Tea.Danger,
    errorContainer = Tea.DangerSubtle,
)

private val Type = Typography(
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.5.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
fun TeaWorkTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type, shapes = AppShapes, content = content)
}
