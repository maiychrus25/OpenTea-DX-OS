// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import java.time.YearMonth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import vn.opentea.staffwork.AppContainer
import vn.opentea.staffwork.data.ApiException
import vn.opentea.staffwork.data.AttendanceMonth
import vn.opentea.staffwork.data.AttendanceRecord
import vn.opentea.staffwork.data.LeaveCreateRequest
import vn.opentea.staffwork.data.LeaveList
import vn.opentea.staffwork.data.LeaveStatus
import vn.opentea.staffwork.data.Payslip
import vn.opentea.staffwork.data.Profile
import vn.opentea.staffwork.data.TaskItem
import vn.opentea.staffwork.data.TaskStatus

/** Shared error handling: a 401 ends the session, other errors become a one-shot message. */
abstract class BaseViewModel(protected val container: AppContainer) : ViewModel() {
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun consumeMessage() { _message.value = null }
    protected fun show(text: String) { _message.value = text }

    protected suspend fun <T> guard(block: suspend () -> T): T? = try {
        block()
    } catch (e: ApiException) {
        if (e.unauthorized) container.onUnauthorized() else show(e.message ?: "Đã có lỗi xảy ra.")
        null
    }
}

// ---------------------------------------------------------------- Session

data class SessionState(
    val signedIn: Boolean = false,
    val profile: Profile? = null,
    val server: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val demo: Boolean = false,
)

class SessionViewModel(container: AppContainer) : BaseViewModel(container) {
    private val _state = MutableStateFlow(
        SessionState(container.session.isSignedIn, container.session.profile, container.session.serverUrl, demo = container.session.demoMode),
    )
    val state: StateFlow<SessionState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.sessionExpired.collect {
                _state.update { it.copy(signedIn = false, profile = null, error = "Phiên đăng nhập đã hết, vui lòng đăng nhập lại.") }
            }
        }
        if (container.session.isSignedIn) viewModelScope.launch {
            guard { container.repository.profile() }?.let { p -> _state.update { it.copy(profile = p) } }
        }
    }

    fun login(server: String, username: String, password: String) {
        val url = normalize(server)
        if (url == null) { _state.update { it.copy(error = "Nhập địa chỉ máy chủ, ví dụ 192.168.1.10:5080.") }; return }
        if (username.isBlank() || password.isEmpty()) { _state.update { it.copy(error = "Vui lòng nhập tên đăng nhập và mật khẩu.") }; return }
        container.session.serverUrl = url
        container.session.demoMode = false
        signIn(url, demo = false) { container.repository.login(username, password) }
    }

    fun loginDemo() {
        container.session.demoMode = true
        signIn(container.session.serverUrl, demo = true) { container.repository.login("nv003", "demo") }
    }

    private fun signIn(url: String, demo: Boolean, block: suspend () -> Profile) {
        _state.update { it.copy(busy = true, error = null, server = url) }
        viewModelScope.launch {
            try {
                val profile = block()
                _state.update { it.copy(signedIn = true, profile = profile, busy = false, demo = demo) }
            } catch (e: ApiException) {
                container.session.demoMode = false
                _state.update { it.copy(busy = false, error = e.message) }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            container.repository.logout()
            _state.update { SessionState(server = container.session.serverUrl) }
        }
    }

    fun changePassword(current: String, next: String, done: () -> Unit) {
        if (next.length < 6) { show("Mật khẩu mới cần ít nhất 6 ký tự."); return }
        viewModelScope.launch {
            if (guard { container.repository.changePassword(current, next) } != null) {
                show("Đã đổi mật khẩu.")
                done()
            }
        }
    }

    companion object {
        /** Accepts "192.168.1.10:5080" or a full URL; defaults to http and port 5080. */
        fun normalize(input: String): String? {
            var s = input.trim().trimEnd('/')
            if (s.isEmpty()) return null
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
            val host = s.substringAfter("://")
            if (host.isBlank() || host.contains(' ')) return null
            if (!host.contains(':') && !host.contains('/')) s = "$s:5080"
            return s
        }
    }
}

// ---------------------------------------------------------------- Tasks

enum class TaskFilter(val label: String) { Open("Cần làm"), Done("Đã xong"), All("Tất cả") }

data class TasksState(
    val loading: Boolean = true,
    val tasks: List<TaskItem> = emptyList(),
    val filter: TaskFilter = TaskFilter.Open,
    val updatingId: Int? = null,
) {
    val visible: List<TaskItem>
        get() = when (filter) {
            TaskFilter.Open -> tasks.filter { it.isOpen }
            TaskFilter.Done -> tasks.filter { !it.isOpen }
            TaskFilter.All -> tasks
        }
    val openCount get() = tasks.count { it.isOpen }
    val overdueCount get() = tasks.count { it.overdue }
}

class TasksViewModel(container: AppContainer) : BaseViewModel(container) {
    private val _state = MutableStateFlow(TasksState())
    val state: StateFlow<TasksState> = _state.asStateFlow()

    init { refresh() }

    /** [silent] refreshes in the background (no spinner) and announces tasks that were not there before. */
    fun refresh(silent: Boolean = false) {
        if (!silent) _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val before = _state.value.tasks.map { it.id }.toSet()
            val tasks = if (silent) runCatching { container.repository.tasks() }.getOrNull() else guard { container.repository.tasks() }
            _state.update { it.copy(loading = false, tasks = tasks ?: it.tasks) }
            val fresh = tasks?.count { it.id !in before && it.isOpen } ?: 0
            if (silent && before.isNotEmpty() && fresh > 0) show("Chủ HTX vừa giao $fresh việc mới cho bạn.")
        }
    }

    fun setFilter(filter: TaskFilter) = _state.update { it.copy(filter = filter) }

    fun update(task: TaskItem, status: TaskStatus, progress: Int? = null, note: String? = null, onDone: (TaskItem) -> Unit = {}) {
        _state.update { it.copy(updatingId = task.id) }
        viewModelScope.launch {
            val updated = guard { container.repository.updateTask(task.id, status, progress, note) }
            _state.update { s ->
                s.copy(updatingId = null, tasks = if (updated == null) s.tasks else s.tasks.map { if (it.id == updated.id) updated else it })
            }
            if (updated != null) {
                show(
                    when (status) {
                        TaskStatus.Accepted -> "Đã nhận việc \"${task.title}\"."
                        TaskStatus.Rejected -> "Đã từ chối và gửi lý do cho chủ HTX."
                        TaskStatus.Completed -> "Tuyệt vời! Đã báo hoàn thành."
                        else -> "Đã cập nhật tiến độ ${updated.progress}%."
                    },
                )
                onDone(updated)
            }
        }
    }
}

// ---------------------------------------------------------------- Attendance

data class AttendanceState(
    val loading: Boolean = true,
    val today: AttendanceRecord? = null,
    val month: YearMonth = YearMonth.now(),
    val summary: AttendanceMonth? = null,
    val acting: Boolean = false,
)

class AttendanceViewModel(container: AppContainer) : BaseViewModel(container) {
    private val _state = MutableStateFlow(AttendanceState())
    val state: StateFlow<AttendanceState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val today = guard { container.repository.today() }
            val summary = guard { container.repository.attendance(_state.value.month.toString()) }
            _state.update { it.copy(loading = false, today = today,summary = summary ?: it.summary) }
        }
    }

    fun changeMonth(delta: Long) {
        val next = _state.value.month.plusMonths(delta)
        if (next.isAfter(YearMonth.now())) return
        _state.update { it.copy(month = next) }
        refresh()
    }

    fun checkIn() = act(true)
    fun checkOut() = act(false)

    private fun act(checkIn: Boolean) {
        _state.update { it.copy(acting = true) }
        viewModelScope.launch {
            val record = guard { if (checkIn) container.repository.checkIn() else container.repository.checkOut() }
            _state.update { it.copy(acting = false, today = record ?: it.today) }
            if (record != null) {
                show(if (checkIn) "Đã chấm công vào lúc ${record.checkIn}. Chúc một ngày làm việc tốt!" else "Đã chấm công ra lúc ${record.checkOut}.")
                refresh()
            }
        }
    }
}

// ---------------------------------------------------------------- Leaves

data class LeavesState(val loading: Boolean = true, val data: LeaveList? = null, val submitting: Boolean = false)

class LeavesViewModel(container: AppContainer) : BaseViewModel(container) {
    private val _state = MutableStateFlow(LeavesState())
    val state: StateFlow<LeavesState> = _state.asStateFlow()

    init { refresh() }

    fun refresh(silent: Boolean = false) {
        if (!silent) _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val pendingBefore = _state.value.data?.items?.filter { it.status == LeaveStatus.Pending }?.map { it.id }?.toSet().orEmpty()
            val data = if (silent) runCatching { container.repository.leaves() }.getOrNull() else guard { container.repository.leaves() }
            _state.update { it.copy(loading = false, data = data ?: it.data) }
            data?.items?.firstOrNull { it.id in pendingBefore && it.status != LeaveStatus.Pending }?.let {
                show("Đơn ${it.typeLabel.lowercase()} từ ngày ${vn.opentea.staffwork.ui.components.Fmt.fullDate(it.fromDate)}: ${it.statusLabel.lowercase()}.")
            }
        }
    }

    fun submit(request: LeaveCreateRequest, onDone: () -> Unit) {
        _state.update { it.copy(submitting = true) }
        viewModelScope.launch {
            val saved = guard { container.repository.submitLeave(request) }
            _state.update { it.copy(submitting = false) }
            if (saved != null) {
                show("Đã gửi đơn ${saved.days} ngày, chờ chủ HTX duyệt.")
                onDone()
                refresh()
            }
        }
    }

    fun cancel(id: Int) {
        viewModelScope.launch {
            if (guard { container.repository.cancelLeave(id) } != null) {
                show("Đã huỷ đơn nghỉ.")
                refresh()
            }
        }
    }
}

// ---------------------------------------------------------------- Payslips

data class PayslipsState(val loading: Boolean = true, val items: List<Payslip> = emptyList())

class PayslipsViewModel(container: AppContainer) : BaseViewModel(container) {
    private val _state = MutableStateFlow(PayslipsState())
    val state: StateFlow<PayslipsState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val items = guard { container.repository.payslips() }
            _state.update { it.copy(loading = false, items = items ?: it.items) }
        }
    }
}

fun appViewModelFactory(container: AppContainer): ViewModelProvider.Factory = viewModelFactory {
    initializer { SessionViewModel(container) }
    initializer { TasksViewModel(container) }
    initializer { AttendanceViewModel(container) }
    initializer { LeavesViewModel(container) }
    initializer { PayslipsViewModel(container) }
}
