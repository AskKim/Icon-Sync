# Keep Icon Sync Kotlin Serialization models
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class com.iconsync.android.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.iconsync.android.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
