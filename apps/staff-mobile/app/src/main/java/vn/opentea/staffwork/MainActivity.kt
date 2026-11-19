// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.StateFlow
import vn.opentea.staffwork.ui.AttendanceViewModel
import vn.opentea.staffwork.ui.BaseViewModel
import vn.opentea.staffwork.ui.LeavesViewModel
import vn.opentea.staffwork.ui.PayslipsViewModel
import vn.opentea.staffwork.ui.SessionViewModel
import vn.opentea.staffwork.ui.TasksViewModel
import vn.opentea.staffwork.ui.appViewModelFactory
import vn.opentea.staffwork.ui.components.LeafLogo
import vn.opentea.staffwork.ui.screens.AttendanceScreen
import vn.opentea.staffwork.ui.screens.LeavesScreen
import vn.opentea.staffwork.ui.screens.LoginScreen
import vn.opentea.staffwork.ui.screens.PayslipsScreen
import vn.opentea.staffwork.ui.screens.ProfileScreen
import vn.opentea.staffwork.ui.screens.TasksScreen
import vn.opentea.staffwork.ui.theme.Tea
import vn.opentea.staffwork.ui.theme.TeaWorkTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Tea.Card.toArgb(), Tea.Card.toArgb()),
            navigationBarStyle = SystemBarStyle.light(Tea.Card.toArgb(), Tea.Card.toArgb()),
        )
        super.onCreate(savedInstanceState)
        val container = (application as TeaWorkApp).container
        setContent {
            TeaWorkTheme {
                val factory = remember { appViewModelFactory(container) }
                val session: SessionViewModel = viewModel(factory = factory)
                val state by session.state.collectAsStateWithLifecycle()
                if (state.signedIn) {
                    // Keyed on the user so another sign-in gets fresh view models.
                    MainShell(factory, session, userKey = "${state.profile?.id}-${state.demo}")
                } else {
                    LoginScreen(state, onLogin = session::login, onDemo = session::loginDemo)
                }
            }
        }
    }
}

private enum class Tab(val label: String, val title: String, val icon: ImageVector) {
    Tasks("Công việc", "Việc của tôi", Icons.AutoMirrored.Outlined.Assignment),
    Attendance("Chấm công", "Chấm công", Icons.Outlined.Fingerprint),
    Leaves("Nghỉ phép", "Nghỉ phép", Icons.Outlined.BeachAccess),
    Payslips("Lương", "Phiếu lương", Icons.Outlined.Payments),
    Profile("Tôi", "Tài khoản", Icons.Outlined.AccountCircle),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(factory: androidx.lifecycle.ViewModelProvider.Factory, session: SessionViewModel, userKey: String) {
    val owner = androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner.current!!
    val tasks: TasksViewModel = viewModel(owner, key = "tasks-$userKey", factory = factory)
    val attendance: AttendanceViewModel = viewModel(owner, key = "attendance-$userKey", factory = factory)
    val leaves: LeavesViewModel = viewModel(owner, key = "leaves-$userKey", factory = factory)
    val payslips: PayslipsViewModel = viewModel(owner, key = "payslips-$userKey", factory = factory)

    var tab by rememberSaveable { mutableStateOf(Tab.Tasks) }
    val snackbar = remember { SnackbarHostState() }
    BackHandler(enabled = tab != Tab.Tasks) { tab = Tab.Tasks }

    for (vm in listOf<BaseViewModel>(session, tasks, attendance, leaves, payslips)) MessageEffect(vm.message, snackbar, vm::consumeMessage)

    val sessionState by session.state.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = Tea.Background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            CenterAlignedTopAppBar(
                navigationIcon = { Row(Modifier.padding(start = 12.dp)) { LeafLogo(32.dp) } },
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(tab.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(sessionState.profile?.htxName.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Tea.InkTertiary, maxLines = 1)
                    }
                },
                actions = {
                    if (tab != Tab.Profile) IconButton(onClick = {
                        when (tab) {
                            Tab.Tasks -> tasks.refresh()
                            Tab.Attendance -> attendance.refresh()
                            Tab.Leaves -> leaves.refresh()
                            Tab.Payslips -> payslips.refresh()
                            Tab.Profile -> Unit
                        }
                    }) { Icon(Icons.Outlined.Refresh, "Làm mới") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Tea.Card),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Tea.Card, tonalElevation = 0.dp) {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t, onClick = { tab = t },
                        icon = { Icon(t.icon, null) }, label = { Text(t.label, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Tea.Primary, selectedTextColor = Tea.Primary, indicatorColor = Tea.PrimarySubtle,
                            unselectedIconColor = Tea.InkTertiary, unselectedTextColor = Tea.InkTertiary,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        androidx.compose.foundation.layout.Box(Modifier.padding(padding)) {
            when (tab) {
                Tab.Tasks -> {
                    val s by tasks.state.collectAsStateWithLifecycle()
                    TasksScreen(s, tasks::refresh, tasks::setFilter) { task, status, progress, note, done -> tasks.update(task, status, progress, note, done) }
                }
                Tab.Attendance -> {
                    val s by attendance.state.collectAsStateWithLifecycle()
                    AttendanceScreen(s, attendance::refresh, attendance::checkIn, attendance::checkOut, attendance::changeMonth)
                }
                Tab.Leaves -> {
                    val s by leaves.state.collectAsStateWithLifecycle()
                    LeavesScreen(s, leaves::refresh, leaves::submit, leaves::cancel)
                }
                Tab.Payslips -> {
                    val s by payslips.state.collectAsStateWithLifecycle()
                    PayslipsScreen(s, payslips::refresh)
                }
                Tab.Profile -> ProfileScreen(sessionState, session::changePassword, session::logout)
            }
        }
    }
}

@Composable
private fun MessageEffect(message: StateFlow<String?>, host: SnackbarHostState, consume: () -> Unit) {
    val text by message.collectAsStateWithLifecycle()
    LaunchedEffect(text) {
        val value = text ?: return@LaunchedEffect
        consume()
        host.showSnackbar(value)
    }
}

