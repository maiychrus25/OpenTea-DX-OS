// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import vn.opentea.staffwork.ui.AttendanceState
import vn.opentea.staffwork.ui.components.EmptyState
import vn.opentea.staffwork.ui.components.Fmt
import vn.opentea.staffwork.ui.components.Pill
import vn.opentea.staffwork.ui.components.StatBox
import vn.opentea.staffwork.ui.components.TeaCard
import vn.opentea.staffwork.ui.components.Tone
import vn.opentea.staffwork.ui.components.tone
import vn.opentea.staffwork.ui.theme.Tea

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(state: AttendanceState, onRefresh: () -> Unit, onCheckIn: () -> Unit, onCheckOut: () -> Unit, onMonth: (Long) -> Unit) {
    var clock by remember { mutableStateOf(LocalTime.now()) }
    LaunchedEffect(Unit) { while (true) { clock = LocalTime.now(); delay(1_000) } }

    PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            item {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                        .background(Brush.linearGradient(listOf(Tea.Primary, Color(0xFF1F8A5F))))
                        .padding(20.dp),
                ) {
                    Text(Fmt.todayLabel(), color = Color(0xFFD9EFE2), style = MaterialTheme.typography.bodyMedium)
                    Text(clock.format(DateTimeFormatter.ofPattern("HH:mm:ss")), color = Color.White, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(10.dp))
                    val today = state.today
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        TimeChip("Giờ vào", today?.checkIn ?: "--:--", Modifier.weight(1f))
                        TimeChip("Giờ ra", today?.checkOut ?: "--:--", Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(14.dp))
                    val canIn = today?.checkIn == null
                    val canOut = today?.checkIn != null && today.checkOut == null
                    Button(
                        onClick = if (canIn) onCheckIn else onCheckOut,
                        enabled = !state.acting && (canIn || canOut),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Tea.Lime, contentColor = Tea.PrimaryDark, disabledContainerColor = Color(0x33FFFFFF), disabledContentColor = Color.White),
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                    ) {
                        Icon(if (canIn) Icons.AutoMirrored.Outlined.Login else Icons.AutoMirrored.Outlined.Logout, null)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            when {
                                canIn -> "Chấm công vào"
                                canOut -> "Chấm công ra"
                                else -> "Đã chấm đủ hôm nay"
                            },
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                    if (today != null && today.checkIn == null) {
                        Spacer(Modifier.height(8.dp))
                        Text("Hôm nay: ${today.statusLabel}", color = Color.White, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { onMonth(-1) }) { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, "Tháng trước") }
                    Text("Tháng ${state.month.monthValue}/${state.month.year}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    IconButton(onClick = { onMonth(1) }, enabled = state.month.isBefore(YearMonth.now())) { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, "Tháng sau") }
                }
            }

            val summary = state.summary
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatBox("Ngày công", Fmt.number(summary?.workDays ?: 0.0), Modifier.weight(1f))
                    StatBox("Ngày nghỉ", (summary?.leaveDays ?: 0).toString(), Modifier.weight(1f), Tone.Info)
                    StatBox("Giờ tăng ca", Fmt.number(summary?.overtimeHours ?: 0.0), Modifier.weight(1f), Tone.Warning)
                }
            }

            if (summary != null && summary.records.isEmpty() && !state.loading) {
                item { EmptyState(Icons.Outlined.EventAvailable, "Chưa có ngày công", "Bấm Chấm công vào khi bắt đầu làm việc.") }
            }
            items(summary?.records?.reversed().orEmpty(), key = { it.workDate }) { r ->
                TeaCard(padding = 14.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(r.status.tone().bg), contentAlignment = Alignment.Center) {
                            Text(Fmt.dayMonth(r.workDate).take(2), fontWeight = FontWeight.Bold, color = r.status.tone().fg, fontSize = 17.sp)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(Fmt.fullDate(r.workDate), style = MaterialTheme.typography.titleSmall)
                            val times = listOfNotNull(r.checkIn?.let { "Vào $it" }, r.checkOut?.let { "Ra $it" }).joinToString(" · ")
                            Text(
                                listOf(times, if (r.overtimeHours > 0) "Tăng ca ${Fmt.number(r.overtimeHours)} giờ" else "", r.note.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "Chủ HTX chấm công" },
                                style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary,
                            )
                        }
                        Pill(r.statusLabel, r.status.tone())
                    }
                }
            }
        }
    }
}

@Composable
private fun TimeChip(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(Color(0x26FFFFFF)).padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(label, color = Color(0xFFD9EFE2), style = MaterialTheme.typography.bodySmall)
        Text(value, color = Color.White, style = MaterialTheme.typography.titleMedium)
    }
}

