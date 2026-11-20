// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.data

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.delay

/**
 * Offline sample data so the app can be tried without the owner's PC. Mirrors the
 * server's rules (task state machine, check-in/out, leave balance). Names are fictitious.
 */
class DemoStaffRepository(private val session: SessionStore) : StaffRepository {
    private val minute = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
    private val hm = DateTimeFormatter.ofPattern("HH:mm")
    private val today = LocalDate.now()

    private val profile = Profile(
        id = 3, code = "NV003", fullName = "Lê Thị Cúc", position = "Công nhân hái chè", department = "Tổ hái chè",
        phone = "0903023757", email = "nv003@htxchetancuong.example", hireDate = today.minusMonths(8).toString(),
        contractType = "Thời vụ", salaryType = "Theo ngày công", htxCode = "TC", htxName = "HTX Chè Tân Cương (dữ liệu mẫu)",
    )

    private val tasks = mutableListOf(
        task(1, "Hái chè đồi B1", "Hái 1 tôm 2 lá, giao búp về điểm cân trước 11h.", "Đồi B1", TaskPriority.Normal, TaskStatus.Assigned, 0, 0, 17),
        task(2, "Hái chè lứa 6 đồi A3", "Phối hợp tổ trưởng An. Tránh dập búp.", "Đồi A3 - Tân Cương", TaskPriority.High, TaskStatus.InProgress, 40, 0, 17),
        task(3, "Phun chế phẩm sinh học thửa A3", "Ghi thời gian cách ly 7 ngày.", "Thửa TC-A3", TaskPriority.Urgent, TaskStatus.Accepted, 0, -1, 17),
        task(4, "Làm cỏ, xới gốc đồi C2", null, "Đồi C2", TaskPriority.Low, TaskStatus.Assigned, 0, 3, 17),
        task(5, "Phân loại búp tươi", "Tách búp loại 1 và loại 2.", "Điểm thu mua", TaskPriority.Normal, TaskStatus.Completed, 100, -2, 16, "Đã phân loại 120 kg."),
    )

    private val records = mutableMapOf<LocalDate, AttendanceRecord>().apply {
        var d = today.withDayOfMonth(1)
        var i = 0
        while (d.isBefore(today)) {
            if (d.dayOfWeek != DayOfWeek.SUNDAY) {
                val status = if (i % 9 == 4) AttendanceStatus.HalfDay else AttendanceStatus.Present
                put(d, AttendanceRecord(d.toString(), "06:4${i % 10}", if (status == AttendanceStatus.HalfDay) "10:30" else "16:3${i % 10}", status, label(status)))
                i++
            }
            d = d.plusDays(1)
        }
    }

    private val leaves = mutableListOf(
        LeaveItem(1, today.minusDays(20).toString(), today.minusDays(20).toString(), 1, LeaveType.Personal, "Việc riêng", "Đưa con đi tiêm", LeaveStatus.Approved, "Đã duyệt"),
    )

    private val payslips = listOf(
        YearMonth.from(today).minusMonths(1).let { ym ->
            Payslip(1, ym.year, ym.monthValue, "Theo ngày công", 280_000.0, 26.0, 24.5, 0.0, 3.0, 6_860_000.0, 157_500.0, 0.0, 300_000.0, 0.0, 0.0, 1_000_000.0, 7_317_500.0, 6_317_500.0, PayslipStatus.Paid, "Đã trả")
        },
        YearMonth.from(today).minusMonths(2).let { ym ->
            Payslip(2, ym.year, ym.monthValue, "Theo ngày công", 280_000.0, 26.0, 25.0, 0.0, 0.0, 7_000_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 7_000_000.0, 7_000_000.0, PayslipStatus.Paid, "Đã trả")
        },
    )

    override suspend fun login(username: String, password: String): Profile {
        delay(300)
        session.demoMode = true
        session.saveSession("demo", profile)
        return profile
    }

    override suspend fun logout() = session.clearSession()

    override suspend fun profile() = profile

    override suspend fun changePassword(current: String, next: String) {
        if (next.length < 6) throw ApiException("Mật khẩu mới cần ít nhất 6 ký tự.")
    }

    override suspend fun tasks(): List<TaskItem> {
        delay(200)
        return tasks.filter { it.status != TaskStatus.Cancelled }.sortedWith(compareBy({ !it.isOpen }, { it.dueDate }))
    }

    override suspend fun updateTask(id: Int, status: TaskStatus, progress: Int?, note: String?): TaskItem {
        delay(200)
        val index = tasks.indexOfFirst { it.id == id }
        if (index < 0) throw ApiException("Không tìm thấy công việc.")
        val current = tasks[index]
        if (status !in current.nextStatuses) throw ApiException("Không thể chuyển sang \"${label(status)}\".")
        if (status == TaskStatus.Rejected && note.isNullOrBlank()) throw ApiException("Vui lòng ghi lý do từ chối công việc.")
        val newProgress = when (status) {
            TaskStatus.Completed -> 100
            TaskStatus.InProgress -> (progress ?: maxOf(current.progress, 10)).coerceIn(0, 99)
            else -> current.progress
        }
        val updated = current.copy(
            status = status, statusLabel = label(status), progress = newProgress,
            reportNote = note?.takeIf { it.isNotBlank() } ?: current.reportNote,
            nextStatuses = next(status), overdue = isOverdue(status, current.dueDate),
            completedAt = if (status == TaskStatus.Completed) LocalDateTime.now().format(minute) else null,
        )
        tasks[index] = updated
        return updated
    }

    override suspend fun today(): AttendanceRecord? = records[today]

    override suspend fun attendance(month: String): AttendanceMonth {
        delay(150)
        val ym = YearMonth.parse(month)
        val list = records.filterKeys { YearMonth.from(it) == ym }.toSortedMap().values.toList()
        return AttendanceMonth(
            month,
            list.sumOf { if (it.status == AttendanceStatus.Present) 1.0 else if (it.status == AttendanceStatus.HalfDay) 0.5 else 0.0 },
            list.count { it.status == AttendanceStatus.PaidLeave || it.status == AttendanceStatus.UnpaidLeave },
            list.count { it.status == AttendanceStatus.Absent },
            list.sumOf { it.overtimeHours },
            list,
        )
    }

    override suspend fun checkIn(): AttendanceRecord {
        records[today]?.checkIn?.let { throw ApiException("Bạn đã chấm công vào lúc $it.") }
        val record = AttendanceRecord(today.toString(), LocalTime.now().format(hm), null, AttendanceStatus.Present, label(AttendanceStatus.Present))
        records[today] = record
        return record
    }

    override suspend fun checkOut(): AttendanceRecord {
        val record = records[today] ?: throw ApiException("Bạn chưa chấm công vào hôm nay.")
        if (record.checkOut != null) throw ApiException("Bạn đã chấm công ra lúc ${record.checkOut}.")
        val updated = record.copy(checkOut = LocalTime.now().format(hm))
        records[today] = updated
        return updated
    }

    override suspend fun leaves(): LeaveList {
        val used = leaves.filter { it.type == LeaveType.Annual && (it.status == LeaveStatus.Approved || it.status == LeaveStatus.Pending) }.sumOf { it.days }
        return LeaveList(maxOf(0, 12 - used), leaves.sortedByDescending { it.fromDate })
    }

    override suspend fun submitLeave(request: LeaveCreateRequest): LeaveItem {
        val from = LocalDate.parse(request.fromDate)
        val to = LocalDate.parse(request.toDate)
        if (to.isBefore(from)) throw ApiException("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.")
        if (request.reason.isBlank()) throw ApiException("Vui lòng ghi lý do nghỉ.")
        val days = ChronoUnit.DAYS.between(from, to).toInt() + 1
        if (request.type == LeaveType.Annual && days > leaves().remainingAnnualDays) throw ApiException("Không đủ ngày phép năm.")
        if (request.type == LeaveType.Sick && days >= 2 && request.attachment == null) throw ApiException("Nghỉ ốm từ 2 ngày cần kèm ảnh giấy khám bệnh hoặc giấy ra viện.")
        val item = LeaveItem(
            (leaves.maxOfOrNull { it.id } ?: 0) + 1, request.fromDate, request.toDate, days, request.type, label(request.type), request.reason,
            LeaveStatus.Pending, "Chờ duyệt", hasAttachment = request.attachment != null, attachmentName = request.attachment?.fileName,
        )
        leaves.add(item)
        return item
    }

    override suspend fun cancelLeave(id: Int) {
        val index = leaves.indexOfFirst { it.id == id }
        if (index < 0 || leaves[index].status != LeaveStatus.Pending) throw ApiException("Chỉ huỷ được đơn đang chờ duyệt.")
        leaves[index] = leaves[index].copy(status = LeaveStatus.Cancelled, statusLabel = "Đã huỷ")
    }

    override suspend fun payslips() = payslips

    private fun task(id: Int, title: String, description: String?, location: String, priority: TaskPriority, status: TaskStatus, progress: Int, dueInDays: Long, dueHour: Int, note: String? = null): TaskItem {
        val due = today.plusDays(dueInDays).atTime(dueHour, 0).format(minute)
        return TaskItem(
            id, title, description, location, priority, label(priority), status, label(status), progress,
            today.plusDays(minOf(dueInDays, 0)).atTime(7, 0).format(minute), due, isOverdue(status, due), note, "Chủ nhiệm HTX",
            null, next(status),
        )
    }

    private fun isOverdue(status: TaskStatus, due: String) =
        (status == TaskStatus.Assigned || status == TaskStatus.Accepted || status == TaskStatus.InProgress) && LocalDateTime.parse(due, minute).isBefore(LocalDateTime.now())

    companion object {
        fun next(status: TaskStatus): List<TaskStatus> = when (status) {
            TaskStatus.Assigned -> listOf(TaskStatus.Accepted, TaskStatus.Rejected)
            TaskStatus.Accepted -> listOf(TaskStatus.InProgress, TaskStatus.Completed)
            TaskStatus.InProgress -> listOf(TaskStatus.InProgress, TaskStatus.Completed)
            else -> emptyList()
        }

        fun label(value: Enum<*>): String = when (value) {
            TaskStatus.Assigned -> "Mới giao"
            TaskStatus.Accepted -> "Đã nhận"
            TaskStatus.InProgress -> "Đang làm"
            TaskStatus.Completed -> "Hoàn thành"
            TaskStatus.Rejected -> "Từ chối"
            TaskStatus.Cancelled -> "Đã huỷ"
            TaskPriority.Low -> "Thấp"
            TaskPriority.Normal -> "Bình thường"
            TaskPriority.High -> "Cao"
            TaskPriority.Urgent -> "Khẩn cấp"
            AttendanceStatus.Present -> "Có mặt"
            AttendanceStatus.HalfDay -> "Nửa ngày"
            AttendanceStatus.Absent -> "Vắng"
            AttendanceStatus.PaidLeave -> "Nghỉ có lương"
            AttendanceStatus.UnpaidLeave -> "Nghỉ không lương"
            LeaveType.Annual -> "Nghỉ phép năm"
            LeaveType.Sick -> "Nghỉ ốm"
            LeaveType.Unpaid -> "Nghỉ không lương"
            LeaveType.Personal -> "Việc riêng"
            else -> value.name
        }
    }
}
