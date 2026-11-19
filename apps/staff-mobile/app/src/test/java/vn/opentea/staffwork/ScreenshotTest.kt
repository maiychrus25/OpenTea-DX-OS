// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Walks through the app in offline demo mode (login → every tab → task sheet) and saves a PNG
 * of each screen to docs/screenshots. Doubles as an end-to-end smoke test of the UI.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private val outDir = File(System.getProperty("screenshots.dir") ?: "build/screenshots").apply { mkdirs() }

    private fun shot(name: String) {
        rule.waitForIdle()
        val bitmap = rule.onRoot().captureToImage().asAndroidBitmap()
        File(outDir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun waitFor(text: String) = rule.waitUntil(5_000) { rule.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }

    private fun click(text: String) = rule.onAllNodesWithText(text, substring = true)[0].performClick()

    @Test
    fun walkThroughDemo() {
        waitFor("Đăng nhập")
        shot("01-login")

        click("Dùng thử với dữ liệu mẫu")
        waitFor("Hái chè đồi B1")
        shot("02-tasks")

        click("Hái chè đồi B1")
        rule.waitUntil(5_000) { rule.onAllNodes(hasText("Nhận việc")).fetchSemanticsNodes().isNotEmpty() }
        shot("03-task-detail")
        click("Nhận việc")
        rule.waitForIdle()
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }

        click("Chấm công")
        waitFor("Ngày công")
        shot("04-attendance")

        click("Nghỉ phép")
        waitFor("Phép năm còn lại")
        shot("05-leaves")

        click("Lương")
        waitFor("Lương tháng")
        shot("06-payslips")

        click("Tôi")
        waitFor("Đăng xuất")
        shot("07-profile")
    }
}
