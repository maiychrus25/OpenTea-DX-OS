# SPDX-License-Identifier: MIT
# Keep the API models and their generated serializers intact under R8 (JSON field names must not change).
-keepattributes *Annotation*, InnerClasses, Signature
-keep class vn.opentea.staffwork.data.** { *; }
-keep,includedescriptorclasses class vn.opentea.staffwork.data.**$$serializer { *; }
-keepclassmembers class vn.opentea.staffwork.data.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
