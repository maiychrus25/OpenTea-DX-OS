// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import vn.opentea.staffwork.data.LeaveCreateRequest
import vn.opentea.staffwork.data.LeaveType
import vn.opentea.staffwork.data.RemoteStaffRepository
import vn.opentea.staffwork.data.SessionStore
import vn.opentea.staffwork.data.TaskStatus

/**
 * Contract test against a running Tea Staff Manager (`TeaStaffManager.exe --serve`).
 * Skipped unless -Dteawork.server=http://127.0.0.1:5080 is passed, e.g.
 * `./gradlew testDebugUnitTest -Pteawork.server=http://127.0.0.1:5080`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RemoteApiContractTest {
    @Test
    fun fullStaffFlowAgainstDesktopServer() = runBlocking {
        val server = System.getProperty("teawork.server").orEmpty()
        assumeTrue("teawork.server not set", server.isNotBlank())
        val session = SessionStore(ApplicationProvider.getApplicationContext()).apply { serverUrl = server }
        val repo = RemoteStaffRepository(session)

        assertEquals("ok", repo.health(server).status)
        val profile = repo.login("nv008", "123456")
        assertEquals("NV008", profile.code)

        val tasks = repo.tasks()
        assertTrue(tasks.isNotEmpty())
        val open = tasks.first { TaskStatus.Accepted in it.nextStatuses }
        val accepted = repo.updateTask(open.id, TaskStatus.Accepted, null, null)
        assertEquals(TaskStatus.Accepted, accepted.status)
        val started = repo.updateTask(open.id, TaskStatus.InProgress, 30, "Đang làm")
        assertEquals(30, started.progress)

        val record = repo.today() ?: repo.checkIn()
        assertTrue(record.checkIn != null)
        val month = repo.attendance(java.time.YearMonth.now().toString())
        assertTrue(month.records.isNotEmpty())

        val leaves = repo.leaves()
        val leave = repo.submitLeave(LeaveCreateRequest(java.time.LocalDate.now().plusDays(10).toString(), java.time.LocalDate.now().plusDays(10).toString(), LeaveType.Personal, "Kiểm thử"))
        assertEquals(leaves.items.size + 1, repo.leaves().items.size)
        repo.cancelLeave(leave.id)

        // Sick leave of two days needs evidence; a tiny PNG is accepted and flagged.
        val day = java.time.LocalDate.now().plusDays(12).toString()
        val two = java.time.LocalDate.now().plusDays(13).toString()
        val refused = runCatching { repo.submitLeave(LeaveCreateRequest(day, two, LeaveType.Sick, "Ốm")) }
        assertTrue(refused.isFailure)
        val png = android.util.Base64.encodeToString(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0), android.util.Base64.NO_WRAP)
        val sick = repo.submitLeave(LeaveCreateRequest(day, two, LeaveType.Sick, "Ốm", vn.opentea.staffwork.data.AttachmentUpload("giay-kham.png", png)))
        assertTrue(sick.hasAttachment)
        repo.cancelLeave(sick.id)

        repo.payslips()
        repo.logout()
    }
}
