# SPDX-License-Identifier: MIT
# kotlinx.serialization ships its own consumer rules; keep our DTO serializers explicitly as well.
-keep,includedescriptorclasses class vn.opentea.staffwork.data.**$$serializer { *; }
-keepclassmembers class vn.opentea.staffwork.data.** {
    *** Companion;
}
