// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import vn.opentea.staffwork.data.LeaveCreateRequest
import vn.opentea.staffwork.data.LeaveStatus
import vn.opentea.staffwork.data.LeaveType
import vn.opentea.staffwork.ui.LeavesState
import vn.opentea.staffwork.ui.components.EmptyState
import vn.opentea.staffwork.ui.components.Fmt
import vn.opentea.staffwork.ui.components.IconBadge
import vn.opentea.staffwork.ui.components.Pill
import vn.opentea.staffwork.ui.components.TeaCard
import vn.opentea.staffwork.ui.components.tone
import vn.opentea.staffwork.ui.theme.Tea

private val leaveLabels = mapOf(
    LeaveType.Annual to "Phép năm", LeaveType.Sick to "Nghỉ ốm", LeaveType.Personal to "Việc riêng", LeaveType.Unpaid to "Không lương",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeavesScreen(state: LeavesState, onRefresh: () -> Unit, onSubmit: (LeaveCreateRequest, () -> Unit) -> Unit, onCancel: (Int) -> Unit) {
    var showForm by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
                item {
                    TeaCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconBadge(Icons.Outlined.BeachAccess)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Phép năm còn lại", style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary)
                                Text("${state.data?.remainingAnnualDays ?: "–"} ngày", style = MaterialTheme.typography.headlineSmall, color = Tea.Primary)
                            }
                        }
                    }
                }
                val items = state.data?.items.orEmpty()
                if (items.isEmpty() && !state.loading) {
                    item { EmptyState(Icons.Outlined.CalendarMonth, "Chưa có đơn nghỉ", "Bấm Xin nghỉ để gửi đơn cho chủ HTX duyệt.") }
                }
                items(items, key = { it.id }) { l ->
                    TeaCard(padding = 14.dp) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(l.typeLabel, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                                Pill(l.statusLabel, l.status.tone())
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                if (l.fromDate == l.toDate) "${Fmt.fullDate(l.fromDate)} · 1 ngày" else "${Fmt.dayMonth(l.fromDate)} – ${Fmt.fullDate(l.toDate)} · ${l.days} ngày",
                                style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary,
                            )
                            if (!l.reason.isNullOrBlank()) Text("Lý do: ${l.reason}", style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary)
                            if (!l.reviewNote.isNullOrBlank()) Text("Phản hồi: ${l.reviewNote}", style = MaterialTheme.typography.bodySmall, color = Tea.Primary)
                            if (l.status == LeaveStatus.Pending) {
                                TextButton(onClick = { onCancel(l.id) }, modifier = Modifier.align(Alignment.End)) { Text("Huỷ đơn", color = Tea.Danger) }
                            }
                        }
                    }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = { showForm = true },
            icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Xin nghỉ") },
            containerColor = Tea.Primary, contentColor = Tea.Card,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }

    if (showForm) LeaveForm(submitting = state.submitting, onDismiss = { showForm = false }, onSubmit = { onSubmit(it) { showForm = false } })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LeaveForm(submitting: Boolean, onDismiss: () -> Unit, onSubmit: (LeaveCreateRequest) -> Unit) {
    var type by remember { mutableStateOf(LeaveType.Annual) }
    var from by remember { mutableStateOf(LocalDate.now().plusDays(1)) }
    var to by remember { mutableStateOf(LocalDate.now().plusDays(1)) }
    var reason by remember { mutableStateOf("") }
    var picking by remember { mutableStateOf<Int?>(null) } // 0 = from, 1 = to

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Tea.Card) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).navigationBarsPadding()) {
            Text("Xin nghỉ", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(14.dp))
            Text("Loại nghỉ", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                leaveLabels.forEach { (t, label) ->
                    FilterChip(
                        selected = type == t, onClick = { type = t }, label = { Text(label, maxLines = 1) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Tea.PrimarySubtle, selectedLabelColor = Tea.Primary),
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { picking = 0 }, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(56.dp)) {
                    Column { Text("Từ ngày", style = MaterialTheme.typography.bodySmall); Text(Fmt.fullDate(from.toString())) }
                }
                OutlinedButton(onClick = { picking = 1 }, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(56.dp)) {
                    Column { Text("Đến ngày", style = MaterialTheme.typography.bodySmall); Text(Fmt.fullDate(to.toString())) }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = reason, onValueChange = { reason = it }, label = { Text("Lý do *") }, minLines = 2, maxLines = 4,
                shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { onSubmit(LeaveCreateRequest(from.toString(), to.toString(), type, reason.trim())) },
                enabled = !submitting, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text("Gửi đơn cho chủ HTX") }
            Spacer(Modifier.height(24.dp))
        }
    }

    picking?.let { which ->
        val initial = if (which == 0) from else to
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { ms ->
                        val d = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        if (which == 0) { from = d; if (to.isBefore(d)) to = d } else to = d
                    }
                    picking = null
                }) { Text("Chọn") }
            },
            dismissButton = { TextButton(onClick = { picking = null }) { Text("Huỷ") } },
        ) { DatePicker(pickerState) }
    }
}
