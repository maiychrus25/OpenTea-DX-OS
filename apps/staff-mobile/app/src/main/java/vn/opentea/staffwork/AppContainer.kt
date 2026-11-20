// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork

import android.app.Application
import android.content.Context
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import vn.opentea.staffwork.data.DemoStaffRepository
import vn.opentea.staffwork.data.RemoteStaffRepository
import vn.opentea.staffwork.data.SessionStore
import vn.opentea.staffwork.data.StaffRepository

/** Manual dependency container: small enough that a DI framework would add more than it saves. */
class AppContainer(context: Context) {
    val session = SessionStore(context)
    val remote = RemoteStaffRepository(session)
    private val demo by lazy { DemoStaffRepository(session) }

    val repository: StaffRepository get() = if (session.demoMode) demo else remote

    private val _sessionExpired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val sessionExpired: SharedFlow<Unit> = _sessionExpired

    fun onUnauthorized() {
        session.clearSession()
        _sessionExpired.tryEmit(Unit)
    }
}

class TeaWorkApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
