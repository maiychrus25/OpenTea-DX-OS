// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import vn.opentea.staffwork.data.Payslip
import vn.opentea.staffwork.ui.PayslipsState
import vn.opentea.staffwork.ui.components.EmptyState
import vn.opentea.staffwork.ui.components.Fmt
import vn.opentea.staffwork.ui.components.LabeledRow
import vn.opentea.staffwork.ui.components.Pill
import vn.opentea.staffwork.ui.components.TeaCard
import vn.opentea.staffwork.ui.components.tone
import vn.opentea.staffwork.ui.theme.Tea

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PayslipsScreen(state: PayslipsState, onRefresh: () -> Unit) {
    var expanded by remember { mutableStateOf<Int?>(state.items.firstOrNull()?.id) }
    PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            if (state.items.isEmpty() && !state.loading) {
                item { EmptyState(Icons.Outlined.Payments, "Chưa có phiếu lương", "Phiếu lương hiện ở đây sau khi chủ HTX duyệt bảng lương tháng.") }
            }
            items(state.items, key = { it.id }) { p ->
                val open = expanded == p.id || (expanded == null && p == state.items.first())
                PayslipCard(p, open) { expanded = if (open) -1 else p.id }
            }
        }
    }
}

@Composable
private fun PayslipCard(p: Payslip, open: Boolean, onToggle: () -> Unit) {
    TeaCard(Modifier.clip(RoundedCornerShape(16.dp)).clickable(onClick = onToggle)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Lương tháng ${p.month}/${p.year}", style = MaterialTheme.typography.titleMedium)
                    Text(Fmt.money(p.netPay), style = MaterialTheme.typography.headlineSmall, color = Tea.Primary)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Pill(p.statusLabel, p.status.tone())
                    Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = Tea.InkTertiary)
                }
            }
            AnimatedVisibility(open) {
                Column {
                    Spacer(Modifier.height(10.dp))
                    HorizontalDivider(color = Tea.BorderSubtle)
                    Spacer(Modifier.height(8.dp))
                    LabeledRow("Lương cơ bản (${p.salaryType.lowercase()})", Fmt.money(p.baseSalary))
                    LabeledRow("Ngày công + nghỉ có lương", "${Fmt.number(p.workDays)} + ${Fmt.number(p.paidLeaveDays)}")
                    LabeledRow("Lương theo công", Fmt.money(p.earnedSalary))
                    if (p.overtimePay > 0) LabeledRow("Tăng ca (${Fmt.number(p.overtimeHours)} giờ)", Fmt.money(p.overtimePay))
                    if (p.allowance > 0) LabeledRow("Phụ cấp", Fmt.money(p.allowance))
                    if (p.bonus > 0) LabeledRow("Thưởng", "+ " + Fmt.money(p.bonus), valueColor = Tea.Success)
                    LabeledRow("Tổng thu nhập", Fmt.money(p.grossPay), bold = true)
                    if (p.insurance > 0) LabeledRow("Bảo hiểm bắt buộc", "− " + Fmt.money(p.insurance), valueColor = Tea.Danger)
                    if (p.deduction > 0) LabeledRow("Khấu trừ khác", "− " + Fmt.money(p.deduction), valueColor = Tea.Danger)
                    if (p.advance > 0) LabeledRow("Đã tạm ứng", "− " + Fmt.money(p.advance), valueColor = Tea.Danger)
                    Spacer(Modifier.height(4.dp))
                    HorizontalDivider(color = Tea.BorderSubtle)
                    LabeledRow("Thực lĩnh", Fmt.money(p.netPay), valueColor = Tea.Primary, bold = true)
                    if (!p.note.isNullOrBlank()) Text(p.note, style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary)
                }
            }
        }
    }
}
