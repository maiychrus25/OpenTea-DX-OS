// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import vn.opentea.staffwork.ui.SessionState
import vn.opentea.staffwork.ui.components.LeafLogo
import vn.opentea.staffwork.ui.theme.Tea

@Composable
fun LoginScreen(
    state: SessionState,
    onLogin: (server: String, username: String, password: String) -> Unit,
    onDemo: () -> Unit,
) {
    var server by rememberSaveable { mutableStateOf(state.server.removePrefix("http://")) }
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPassword by rememberSaveable { mutableStateOf(false) }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        unfocusedContainerColor = Tea.Card, focusedContainerColor = Tea.Card,
        unfocusedBorderColor = Tea.Border, focusedBorderColor = Tea.Primary,
    )

    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Tea.PrimarySubtle, Tea.Background, Tea.Background))),
    ) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
        ) {
            Spacer(Modifier.height(40.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LeafLogo(56.dp)
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("Tea Work", style = MaterialTheme.typography.titleLarge, color = Tea.Primary, fontWeight = FontWeight.Bold)
                    Text("Ứng dụng nhận việc của HTX", style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary)
                }
            }
            Spacer(Modifier.height(36.dp))
            Text("Xin chào!", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(6.dp))
            Text(
                "Đăng nhập bằng tài khoản chủ HTX cấp cho bạn để nhận việc, chấm công và xem lương.",
                style = MaterialTheme.typography.bodyMedium, color = Tea.InkSecondary,
            )
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = server, onValueChange = { server = it.trim() },
                label = { Text("Máy chủ của HTX") },
                placeholder = { Text("192.168.1.10:5080") },
                supportingText = { Text("Xem địa chỉ ở góc trên ứng dụng Tea Staff Manager trên máy tính.") },
                leadingIcon = { Icon(Icons.Outlined.Dns, null) },
                singleLine = true, colors = fieldColors, shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = username, onValueChange = { username = it },
                label = { Text("Tên đăng nhập") }, placeholder = { Text("ví dụ nv003") },
                supportingText = { Text("Dùng tài khoản Tea Work hoặc tài khoản chung OpenTea DX-OS của HTX.") },
                leadingIcon = { Icon(Icons.Outlined.Person, null) },
                singleLine = true, colors = fieldColors, shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                label = { Text("Mật khẩu") },
                leadingIcon = { Icon(Icons.Outlined.Lock, null) },
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, if (showPassword) "Ẩn mật khẩu" else "Hiện mật khẩu")
                    }
                },
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                singleLine = true, colors = fieldColors, shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onLogin(server, username, password) }),
                modifier = Modifier.fillMaxWidth(),
            )

            if (state.error != null) {
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Tea.DangerSubtle).padding(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(Icons.Outlined.ErrorOutline, null, tint = Tea.Danger, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(state.error, color = Tea.Danger, style = MaterialTheme.typography.bodyMedium)
                }
            }

            Spacer(Modifier.height(22.dp))
            Button(
                onClick = { onLogin(server, username, password) },
                enabled = !state.busy,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                if (state.busy) CircularProgressIndicator(Modifier.size(22.dp), color = Tea.Card, strokeWidth = 2.dp)
                else Text("Đăng nhập", style = MaterialTheme.typography.titleSmall)
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onDemo, enabled = !state.busy, shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) { Text("Dùng thử với dữ liệu mẫu (không cần máy chủ)") }

            Spacer(Modifier.height(28.dp))
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Tea.LeafLight).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("Tài khoản thử nghiệm", style = MaterialTheme.typography.labelLarge, color = Tea.Primary)
                Text("nv001 … nv008, mật khẩu 123456 (dữ liệu mẫu của Tea Staff Manager).", style = MaterialTheme.typography.bodySmall, color = Tea.InkSecondary)
                Text("Máy ảo Android: dùng 10.0.2.2:5080 để trỏ về máy tính.", style = MaterialTheme.typography.bodySmall, color = Tea.InkSecondary)
            }
            Spacer(Modifier.height(24.dp))
            Text(
                "Phần mềm nguồn mở · Giấy phép MIT · Trên nền OpenTea DX-OS",
                style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
