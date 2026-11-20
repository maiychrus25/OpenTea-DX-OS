// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.opentea.staffwork.BuildConfig
import vn.opentea.staffwork.ui.SessionState
import vn.opentea.staffwork.ui.components.Fmt
import vn.opentea.staffwork.ui.components.LabeledRow
import vn.opentea.staffwork.ui.components.Pill
import vn.opentea.staffwork.ui.components.TeaCard
import vn.opentea.staffwork.ui.components.Tone
import vn.opentea.staffwork.ui.theme.Tea

@Composable
fun ProfileScreen(state: SessionState, onChangePassword: (String, String, () -> Unit) -> Unit, onLogout: () -> Unit) {
    val p = state.profile
    var changing by remember { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TeaCard {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(76.dp).clip(CircleShape).background(Tea.PrimarySubtle), contentAlignment = Alignment.Center) {
                    Text(initials(p?.fullName.orEmpty()), color = Tea.Primary, fontWeight = FontWeight.Bold, fontSize = 26.sp)
                }
                Spacer(Modifier.height(10.dp))
                Text(p?.fullName.orEmpty(), style = MaterialTheme.typography.titleLarge)
                Text(listOfNotNull(p?.position, p?.department).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary)
                Spacer(Modifier.height(8.dp))
                Pill(p?.code.orEmpty(), Tone.Brand)
            }
        }
        TeaCard {
            Column {
                Text("Thông tin", style = MaterialTheme.typography.titleSmall, color = Tea.Primary)
                Spacer(Modifier.height(6.dp))
                LabeledRow("Hợp tác xã", p?.htxName.orEmpty())
                LabeledRow("Mã HTX", p?.htxCode.orEmpty())
                LabeledRow("Hợp đồng", p?.contractType.orEmpty())
                LabeledRow("Hình thức lương", p?.salaryType.orEmpty())
                LabeledRow("Ngày vào làm", p?.hireDate?.let { Fmt.fullDate(it) }.orEmpty())
                LabeledRow("Điện thoại", p?.phone ?: "—")
                LabeledRow("Email", p?.email ?: "—")
            }
        }
        TeaCard {
            Column {
                Text("Kết nối", style = MaterialTheme.typography.titleSmall, color = Tea.Primary)
                Spacer(Modifier.height(6.dp))
                LabeledRow("Máy chủ", if (state.demo) "Dữ liệu mẫu (offline)" else state.server)
                LabeledRow("Phiên bản", BuildConfig.VERSION_NAME)
            }
        }
        if (!state.demo) {
            OutlinedButton(onClick = { changing = true }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                Icon(Icons.Outlined.Key, null); Spacer(Modifier.size(8.dp)); Text("Đổi mật khẩu")
            }
        }
        Button(
            onClick = { confirmLogout = true }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Tea.DangerSubtle, contentColor = Tea.Danger),
        ) { Icon(Icons.AutoMirrored.Outlined.Logout, null); Spacer(Modifier.size(8.dp)); Text("Đăng xuất") }
        Text(
            "Tea Work là phần mềm nguồn mở (MIT), kết nối với Tea Staff Manager và lõi OpenTea DX-OS.",
            style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary, modifier = Modifier.padding(top = 4.dp),
        )
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Đăng xuất?") },
            text = { Text("Bạn sẽ cần đăng nhập lại để nhận việc.") },
            confirmButton = { TextButton(onClick = { confirmLogout = false; onLogout() }) { Text("Đăng xuất", color = Tea.Danger) } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Ở lại") } },
            containerColor = Tea.Card,
        )
    }
    if (changing) {
        var current by remember { mutableStateOf("") }
        var next by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { changing = false },
            title = { Text("Đổi mật khẩu") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(current, { current = it }, label = { Text("Mật khẩu hiện tại") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                    OutlinedTextField(next, { next = it }, label = { Text("Mật khẩu mới (≥ 6 ký tự)") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                }
            },
            confirmButton = { TextButton(onClick = { onChangePassword(current, next) { changing = false } }) { Text("Lưu") } },
            dismissButton = { TextButton(onClick = { changing = false }) { Text("Huỷ") } },
            containerColor = Tea.Card,
        )
    }
}

private fun initials(name: String): String {
    val parts = name.split(' ').filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(1).uppercase()
        else -> (parts[parts.size - 2].take(1) + parts.last().take(1)).uppercase()
    }
}
