// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.data

import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * HTTP adapter built on [HttpURLConnection] to avoid extra network libraries.
 * Base URL example: http://192.168.1.10:5080 (endpoints live under /api).
 */
class RemoteStaffRepository(
    private val session: SessionStore,
    private val json: Json = DefaultJson,
) : StaffRepository {

    override suspend fun login(username: String, password: String): Profile {
        val response: LoginResponse = call("POST", "/api/auth/login", json.encodeToString(LoginRequest(username.trim(), password)), auth = false)
        session.saveSession(response.token, response.profile)
        return response.profile
    }

    override suspend fun logout() {
        runCatching { callRaw("POST", "/api/auth/logout", null, auth = true) }
        session.clearSession()
    }

    override suspend fun profile(): Profile = call<Profile>("GET", "/api/me").also { session.saveProfile(it) }

    override suspend fun changePassword(current: String, next: String) {
        callRaw("POST", "/api/me/password", json.encodeToString(ChangePasswordRequest(current, next)), auth = true)
    }

    override suspend fun tasks(): List<TaskItem> = call("GET", "/api/tasks")

    override suspend fun updateTask(id: Int, status: TaskStatus, progress: Int?, note: String?): TaskItem =
        call("POST", "/api/tasks/$id/status", json.encodeToString(TaskStatusRequest(status, progress, note)))

    override suspend fun today(): AttendanceRecord? {
        val body = callRaw("GET", "/api/attendance/today", null, auth = true)
        return if (body.isBlank() || body == "null") null else json.decodeFromString(body)
    }

    override suspend fun attendance(month: String): AttendanceMonth = call("GET", "/api/attendance?month=$month")

    override suspend fun checkIn(): AttendanceRecord = call("POST", "/api/attendance/check-in", "")

    override suspend fun checkOut(): AttendanceRecord = call("POST", "/api/attendance/check-out", "")

    override suspend fun leaves(): LeaveList = call("GET", "/api/leaves")

    override suspend fun submitLeave(request: LeaveCreateRequest): LeaveItem =
        call("POST", "/api/leaves", json.encodeToString(request))

    override suspend fun cancelLeave(id: Int) {
        callRaw("POST", "/api/leaves/$id/cancel", "", auth = true)
    }

    override suspend fun payslips(): List<Payslip> = call("GET", "/api/payslips")

    /** Checks that a server answers before signing in. */
    suspend fun health(baseUrl: String): HealthResponse = withContext(Dispatchers.IO) {
        val body = request(baseUrl, "GET", "/api/health", null, null)
        json.decodeFromString(body)
    }

    private suspend inline fun <reified T> call(method: String, path: String, body: String? = null, auth: Boolean = true): T {
        val text = callRaw(method, path, body, auth)
        return json.decodeFromString(text)
    }

    private suspend fun callRaw(method: String, path: String, body: String?, auth: Boolean): String = withContext(Dispatchers.IO) {
        val token = if (auth) session.token ?: throw ApiException("Phiên đăng nhập đã hết, vui lòng đăng nhập lại.", unauthorized = true) else null
        request(session.serverUrl, method, path, body, token)
    }

    private fun request(baseUrl: String, method: String, path: String, body: String?, token: String?): String {
        val url = try {
            URL(baseUrl.trimEnd('/') + path)
        } catch (e: Exception) {
            throw ApiException("Địa chỉ máy chủ không hợp lệ.")
        }
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (code in 200..299) return text
            val message = runCatching { json.decodeFromString<ApiError>(text).message }.getOrNull()
            if (code == 401) {
                session.clearToken()
                throw ApiException(message ?: "Phiên đăng nhập đã hết, vui lòng đăng nhập lại.", unauthorized = true)
            }
            throw ApiException(message ?: "Máy chủ báo lỗi ($code).")
        } catch (e: SocketTimeoutException) {
            throw ApiException("Máy chủ không phản hồi. Kiểm tra Wi-Fi và máy tính của chủ HTX.")
        } catch (e: IOException) {
            throw ApiException("Không kết nối được máy chủ $baseUrl. Điện thoại và máy tính cần cùng mạng Wi-Fi.")
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        val DefaultJson = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            coerceInputValues = true
        }
    }
}
