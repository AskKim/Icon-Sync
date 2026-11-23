# Icon Sync Release R8 / ProGuard Rules (GPL-3.0-or-later)

# Preserve annotations, generic signatures, and inner classes required by kotlinx.serialization
-keepattributes *Annotation*, InnerClasses, Signature, RuntimeVisibleAnnotations
-dontnote kotlinx.serialization.AnnotationsKt

# Keep kotlinx.serialization runtime serializers
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep @Serializable classes, $$serializer inner classes, Companion objects,
# and Companion.serializer() methods in com.iconsync.android.model.** and com.iconsync.android.grid.**
-keep @kotlinx.serialization.Serializable class com.iconsync.android.model.** { *; }
-keepclassmembers class com.iconsync.android.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.iconsync.android.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.iconsync.android.model.**$$serializer { *; }
-keepclassmembers class com.iconsync.android.model.**$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep @kotlinx.serialization.Serializable class com.iconsync.android.grid.** { *; }
-keepclassmembers class com.iconsync.android.grid.** {
    *** Companion;
}
-keepclasseswithmembers class com.iconsync.android.grid.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.iconsync.android.grid.**$$serializer { *; }
-keepclassmembers class com.iconsync.android.grid.**$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}
