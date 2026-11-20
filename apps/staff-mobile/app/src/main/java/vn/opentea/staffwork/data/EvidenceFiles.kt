// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
package vn.opentea.staffwork.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Turns a picked photo or PDF into an [AttachmentUpload]: photos are rotated upright, scaled to 1600 px and saved as JPEG. */
object EvidenceFiles {
    private const val MAX_SIDE = 1600
    private const val MAX_BYTES = 5 * 1024 * 1024

    /** A temporary file the camera app can write to, exposed through the app's FileProvider. */
    fun newCameraUri(context: Context): Uri {
        val dir = File(context.cacheDir, "evidence").apply { mkdirs() }
        val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
        return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    }

    suspend fun load(context: Context, uri: Uri): AttachmentUpload = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri).orEmpty()
        val name = displayName(context, uri) ?: "minh-chung"
        if (mime == "application/pdf" || name.endsWith(".pdf", ignoreCase = true)) {
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw ApiException("Không đọc được tệp đã chọn.")
            if (bytes.size > MAX_BYTES) throw ApiException("Tệp PDF tối đa 5 MB.")
            return@withContext AttachmentUpload(name, Base64.encodeToString(bytes, Base64.NO_WRAP))
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) throw ApiException("Chỉ nhận ảnh hoặc tệp PDF.")
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: throw ApiException("Không đọc được ảnh đã chọn.")
        val rotation = runCatching {
            resolver.openInputStream(uri)?.use { ExifInterface(it).rotationDegrees } ?: 0
        }.getOrDefault(0)
        val scale = minOf(1f, MAX_SIDE.toFloat() / maxOf(decoded.width, decoded.height))
        val matrix = Matrix().apply { postScale(scale, scale); postRotate(rotation.toFloat()) }
        val bitmap = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 82, out)
        val jpgName = name.substringBeforeLast('.') + ".jpg"
        AttachmentUpload(jpgName, Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
    }

    private fun displayName(context: Context, uri: Uri): String? =
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
}
