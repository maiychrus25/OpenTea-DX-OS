// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.data

import android.content.Context
import androidx.core.content.edit

/** Remembers the server, the session token and the last profile between launches. */
class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("tea_work_session", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER, null) ?: DEFAULT_SERVER
        set(value) = prefs.edit { putString(KEY_SERVER, value.trim().trimEnd('/')) }

    var demoMode: Boolean
        get() = prefs.getBoolean(KEY_DEMO, false)
        set(value) = prefs.edit { putBoolean(KEY_DEMO, value) }

    val token: String? get() = prefs.getString(KEY_TOKEN, null)

    val profile: Profile?
        get() = prefs.getString(KEY_PROFILE, null)?.let {
            runCatching { RemoteStaffRepository.DefaultJson.decodeFromString<Profile>(it) }.getOrNull()
        }

    val isSignedIn: Boolean get() = token != null && profile != null

    fun saveSession(token: String, profile: Profile) = prefs.edit {
        putString(KEY_TOKEN, token)
        putString(KEY_PROFILE, RemoteStaffRepository.DefaultJson.encodeToString(profile))
    }

    fun saveProfile(profile: Profile) = prefs.edit {
        putString(KEY_PROFILE, RemoteStaffRepository.DefaultJson.encodeToString(profile))
    }

    fun clearToken() = prefs.edit { remove(KEY_TOKEN) }

    fun clearSession() = prefs.edit {
        remove(KEY_TOKEN)
        remove(KEY_PROFILE)
        putBoolean(KEY_DEMO, false)
    }

    companion object {
        /** Android emulator alias for the host PC; replace with the PC's LAN address on a phone. */
        const val DEFAULT_SERVER = "http://10.0.2.2:5080"
        private const val KEY_SERVER = "server"
        private const val KEY_DEMO = "demo"
        private const val KEY_TOKEN = "token"
        private const val KEY_PROFILE = "profile"
    }
}
