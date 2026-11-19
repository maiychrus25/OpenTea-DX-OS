// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.data

/** Error with a user-facing (Vietnamese) message. */
class ApiException(message: String, val unauthorized: Boolean = false) : Exception(message)

/**
 * Data port used by every view model. [RemoteStaffRepository] talks to the owner's
 * Tea Staff Manager (or, later, the DX-OS core); [DemoStaffRepository] works offline
 * with sample data so the app can be tried without a server.
 */
interface StaffRepository {
    suspend fun login(username: String, password: String): Profile
    suspend fun logout()
    suspend fun profile(): Profile
    suspend fun changePassword(current: String, next: String)

    suspend fun tasks(): List<TaskItem>
    suspend fun updateTask(id: Int, status: TaskStatus, progress: Int?, note: String?): TaskItem

    suspend fun today(): AttendanceRecord?
    suspend fun attendance(month: String): AttendanceMonth
    suspend fun checkIn(): AttendanceRecord
    suspend fun checkOut(): AttendanceRecord

    suspend fun leaves(): LeaveList
    suspend fun submitLeave(request: LeaveCreateRequest): LeaveItem
    suspend fun cancelLeave(id: Int)

    suspend fun payslips(): List<Payslip>
}
