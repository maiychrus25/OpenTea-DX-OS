// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.data

import kotlinx.serialization.Serializable

/**
 * Wire models of the staff API (see docs/mobile-api.md). Field names match the JSON the
 * Tea Staff Manager desktop app serves today and that a DX-OS mini-app would serve later.
 */
@Serializable
data class Profile(
    val id: Int,
    val code: String,
    val fullName: String,
    val position: String = "",
    val department: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val hireDate: String = "",
    val contractType: String = "",
    val salaryType: String = "",
    val htxCode: String = "",
    val htxName: String = "",
)

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class LoginResponse(val token: String, val profile: Profile)

@Serializable
data class ApiError(val message: String)

@Serializable
enum class TaskStatus { Assigned, Accepted, InProgress, Completed, Rejected, Cancelled }

@Serializable
enum class TaskPriority { Low, Normal, High, Urgent }

@Serializable
data class TaskItem(
    val id: Int,
    val title: String,
    val description: String? = null,
    val location: String? = null,
    val priority: TaskPriority = TaskPriority.Normal,
    val priorityLabel: String = "",
    val status: TaskStatus,
    val statusLabel: String = "",
    val progress: Int = 0,
    val startDate: String,
    val dueDate: String,
    val overdue: Boolean = false,
    val reportNote: String? = null,
    val assignedBy: String = "",
    val completedAt: String? = null,
    val nextStatuses: List<TaskStatus> = emptyList(),
) {
    val isOpen: Boolean get() = status == TaskStatus.Assigned || status == TaskStatus.Accepted || status == TaskStatus.InProgress
}

@Serializable
data class TaskStatusRequest(val status: TaskStatus, val progress: Int? = null, val note: String? = null)

@Serializable
enum class AttendanceStatus { Present, HalfDay, Absent, PaidLeave, UnpaidLeave }

@Serializable
data class AttendanceRecord(
    val workDate: String,
    val checkIn: String? = null,
    val checkOut: String? = null,
    val status: AttendanceStatus,
    val statusLabel: String = "",
    val overtimeHours: Double = 0.0,
    val note: String? = null,
)

@Serializable
data class AttendanceMonth(
    val month: String,
    val workDays: Double,
    val leaveDays: Int,
    val absentDays: Int,
    val overtimeHours: Double,
    val records: List<AttendanceRecord>,
)

@Serializable
enum class LeaveType { Annual, Sick, Unpaid, Personal }

@Serializable
enum class LeaveStatus { Pending, Approved, Rejected, Cancelled }

@Serializable
data class LeaveItem(
    val id: Int,
    val fromDate: String,
    val toDate: String,
    val days: Int,
    val type: LeaveType,
    val typeLabel: String = "",
    val reason: String? = null,
    val status: LeaveStatus,
    val statusLabel: String = "",
    val reviewNote: String? = null,
)

@Serializable
data class LeaveList(val remainingAnnualDays: Int, val items: List<LeaveItem>)

@Serializable
data class LeaveCreateRequest(val fromDate: String, val toDate: String, val type: LeaveType, val reason: String)

@Serializable
enum class PayslipStatus { Draft, Approved, Paid }

@Serializable
data class Payslip(
    val id: Int,
    val year: Int,
    val month: Int,
    val salaryType: String = "",
    val baseSalary: Double = 0.0,
    val standardDays: Double = 0.0,
    val workDays: Double = 0.0,
    val paidLeaveDays: Double = 0.0,
    val overtimeHours: Double = 0.0,
    val earnedSalary: Double = 0.0,
    val overtimePay: Double = 0.0,
    val allowance: Double = 0.0,
    val bonus: Double = 0.0,
    val insurance: Double = 0.0,
    val deduction: Double = 0.0,
    val advance: Double = 0.0,
    val grossPay: Double = 0.0,
    val netPay: Double = 0.0,
    val status: PayslipStatus,
    val statusLabel: String = "",
    val note: String? = null,
)

@Serializable
data class ChangePasswordRequest(val currentPassword: String, val newPassword: String)

@Serializable
data class HealthResponse(val status: String, val htxCode: String = "", val htxName: String = "", val version: String = "")
