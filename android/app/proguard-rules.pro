# gomobile-generated bindings rely on JNI lookups by exact class/method name.
# Without this, R8 will rename mobile.Mobile and the native side won't find it.
-keep class mobile.** { *; }
-keep class go.** { *; }
