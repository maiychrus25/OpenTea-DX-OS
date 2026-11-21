// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AssignmentTurnedIn
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import vn.opentea.staffwork.data.TaskItem
import vn.opentea.staffwork.data.TaskStatus
import vn.opentea.staffwork.ui.TaskFilter
import vn.opentea.staffwork.ui.TasksState
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
fun TasksScreen(
    state: TasksState,
    onRefresh: () -> Unit,
    onFilter: (TaskFilter) -> Unit,
    onUpdate: (TaskItem, TaskStatus, Int?, String?, (TaskItem) -> Unit) -> Unit,
) {
    var selectedId by remember { mutableStateOf<Int?>(null) }
    val selected = state.tasks.firstOrNull { it.id == selectedId }

    PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatBox("Việc cần làm", state.openCount.toString(), Modifier.weight(1f))
                    StatBox("Quá hạn", state.overdueCount.toString(), Modifier.weight(1f), if (state.overdueCount > 0) Tone.Danger else Tone.Neutral)
                    StatBox("Đã xong", state.tasks.count { it.status == TaskStatus.Completed }.toString(), Modifier.weight(1f), Tone.Success)
                }
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(TaskFilter.entries) { f ->
                        FilterChip(
                            selected = state.filter == f, onClick = { onFilter(f) }, label = { Text(f.label) },
                            leadingIcon = if (state.filter == f) ({ Icon(Icons.Outlined.Check, null, Modifier.size(16.dp)) }) else null,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Tea.PrimarySubtle, selectedLabelColor = Tea.Primary, selectedLeadingIconColor = Tea.Primary,
                                containerColor = Tea.Card,
                            ),
                        )
                    }
                }
            }
            if (!state.loading && state.visible.isEmpty()) {
                item {
                    EmptyState(
                        Icons.Outlined.TaskAlt,
                        if (state.filter == TaskFilter.Open) "Bạn đã xong hết việc!" else "Chưa có công việc",
                        "Kéo xuống để làm mới khi chủ HTX giao việc mới.",
                    )
                }
            }
            items(state.visible, key = { it.id }) { task ->
                TaskCard(task, onClick = { selectedId = task.id })
            }
        }
    }

    if (selected != null) {
        TaskDetailSheet(
            task = selected,
            busy = state.updatingId == selected.id,
            onDismiss = { selectedId = null },
            onUpdate = { status, progress, note -> onUpdate(selected, status, progress, note) { if (!it.isOpen) selectedId = null } },
        )
    }
}

@Composable
private fun TaskCard(task: TaskItem, onClick: () -> Unit) {
    val stripe = task.priority.tone().fg
    TeaCard(Modifier.clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick), padding = 0.dp) {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            Box(Modifier.width(5.dp).fillMaxHeight().background(stripe))
            Column(Modifier.padding(14.dp).fillMaxWidth()) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(task.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(8.dp))
                    Pill(task.statusLabel, task.status.tone())
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Place, null, tint = Tea.InkTertiary, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(task.location ?: "Không ghi địa điểm", style = MaterialTheme.typography.bodySmall, color = Tea.InkSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Pill(task.priorityLabel, task.priority.tone())
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.AccessTime, null, tint = if (task.overdue) Tea.Danger else Tea.InkTertiary, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "Hạn " + Fmt.due(task.dueDate) + if (task.overdue) " · Quá hạn" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (task.overdue) Tea.Danger else Tea.InkSecondary,
                        fontWeight = if (task.overdue) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LinearProgressIndicator(
                        progress = { task.progress / 100f }, modifier = Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = Tea.Primary, trackColor = Tea.NeutralSubtle, strokeCap = StrokeCap.Round, gapSize = 0.dp, drawStopIndicator = {},
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("${task.progress}%", style = MaterialTheme.typography.labelMedium, color = Tea.InkSecondary)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskDetailSheet(task: TaskItem, busy: Boolean, onDismiss: () -> Unit, onUpdate: (TaskStatus, Int?, String?) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var mode by remember(task.id, task.status) { mutableIntStateOf(0) } // 0 = view, 1 = progress, 2 = reject, 3 = complete
    var note by remember(task.id, task.status) { mutableStateOf("") }
    var progress by remember(task.id, task.status) { mutableFloatStateOf(maxOf(task.progress, 10).toFloat()) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Tea.Card) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).navigationBarsPadding()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Pill(task.statusLabel, task.status.tone())
                Spacer(Modifier.width(8.dp))
                Pill("Ưu tiên " + task.priorityLabel.lowercase(), task.priority.tone())
            }
            Spacer(Modifier.height(12.dp))
            Text(task.title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(14.dp))
            DetailLine(Icons.Outlined.Place, "Địa điểm", task.location ?: "Không ghi")
            DetailLine(Icons.Outlined.AccessTime, "Thời gian", "${Fmt.due(task.startDate)} → ${Fmt.due(task.dueDate)}", if (task.overdue) Tea.Danger else Tea.Ink)
            DetailLine(Icons.Outlined.Person, "Người giao", task.assignedBy.ifBlank { "Chủ HTX" })
            if (!task.description.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                Text("Yêu cầu", style = MaterialTheme.typography.labelLarge, color = Tea.Primary)
                Spacer(Modifier.height(4.dp))
                Text(task.description, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(14.dp))
            Text("Tiến độ ${task.progress}%", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { task.progress / 100f }, modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                color = Tea.Primary, trackColor = Tea.NeutralSubtle, strokeCap = StrokeCap.Round, gapSize = 0.dp, drawStopIndicator = {},
            )
            if (!task.reportNote.isNullOrBlank()) {
                Spacer(Modifier.height(12.dp))
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Tea.LeafLight).padding(12.dp)) {
                    Text("Báo cáo của bạn", style = MaterialTheme.typography.labelMedium, color = Tea.InkTertiary)
                    Text(task.reportNote, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(20.dp))

            val next = task.nextStatuses
            when (mode) {
                1 -> {
                    Text("Cập nhật tiến độ: ${progress.toInt()}%", style = MaterialTheme.typography.titleSmall)
                    Slider(
                        value = progress, onValueChange = { progress = it }, valueRange = 0f..95f, steps = 18,
                        colors = SliderDefaults.colors(thumbColor = Tea.Primary, activeTrackColor = Tea.Primary, inactiveTrackColor = Tea.PrimarySubtle),
                    )
                    NoteField(note, { note = it }, "Ghi chú (không bắt buộc)")
                    ActionRow(busy, "Gửi tiến độ", onCancel = { mode = 0 }) { onUpdate(TaskStatus.InProgress, progress.toInt(), note) }
                }
                2 -> {
                    NoteField(note, { note = it }, "Lý do từ chối *")
                    ActionRow(busy, "Gửi từ chối", danger = true, onCancel = { mode = 0 }) { onUpdate(TaskStatus.Rejected, null, note) }
                }
                3 -> {
                    NoteField(note, { note = it }, "Kết quả (ví dụ: hái được 35 kg búp)")
                    ActionRow(busy, "Xác nhận hoàn thành", onCancel = { mode = 0 }) { onUpdate(TaskStatus.Completed, null, note) }
                }
                else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (TaskStatus.Accepted in next) {
                        Button(onClick = { onUpdate(TaskStatus.Accepted, null, null) }, enabled = !busy, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                            Icon(Icons.Outlined.Check, null); Spacer(Modifier.width(8.dp)); Text("Nhận việc")
                        }
                    }
                    if (TaskStatus.InProgress in next) {
                        val starting = task.status == TaskStatus.Accepted
                        Button(
                            onClick = { if (starting) onUpdate(TaskStatus.InProgress, 10, null) else mode = 1 }, enabled = !busy,
                            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp),
                        ) {
                            Icon(Icons.Outlined.PlayArrow, null); Spacer(Modifier.width(8.dp)); Text(if (starting) "Bắt đầu làm" else "Cập nhật tiến độ")
                        }
                    }
                    if (TaskStatus.Completed in next) {
                        OutlinedButton(onClick = { mode = 3 }, enabled = !busy, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                            Icon(Icons.Outlined.AssignmentTurnedIn, null); Spacer(Modifier.width(8.dp)); Text("Báo hoàn thành")
                        }
                    }
                    if (TaskStatus.Rejected in next) {
                        OutlinedButton(
                            onClick = { mode = 2 }, enabled = !busy, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Tea.Danger),
                        ) { Icon(Icons.Outlined.Close, null); Spacer(Modifier.width(8.dp)); Text("Từ chối") }
                    }
                    if (next.isEmpty()) {
                        Text(
                            if (task.status == TaskStatus.Completed) "Công việc đã hoàn thành. Cảm ơn bạn!" else "Công việc đã đóng.",
                            style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary,
                        )
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun DetailLine(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, color: androidx.compose.ui.graphics.Color = Tea.Ink) {
    Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Tea.PrimarySubtle), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Tea.Primary, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(label, style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary)
            Text(value, style = MaterialTheme.typography.bodyMedium, color = color, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun NoteField(value: String, onChange: (String) -> Unit, label: String) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, minLines = 2, maxLines = 4,
        shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun ActionRow(busy: Boolean, confirm: String, danger: Boolean = false, onCancel: () -> Unit, onConfirm: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = onCancel, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(50.dp)) { Text("Quay lại") }
        Button(
            onClick = onConfirm, enabled = !busy, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1.4f).height(50.dp),
            colors = if (danger) ButtonDefaults.buttonColors(containerColor = Tea.Danger) else ButtonDefaults.buttonColors(),
        ) { Text(confirm) }
    }
}
