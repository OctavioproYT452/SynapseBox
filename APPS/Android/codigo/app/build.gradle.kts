import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firma de release: crea keystore.properties (ver keystore.properties.example). Sin él, assembleRelease genera un APK sin firmar.
val ksFile = rootProject.file("keystore.properties")
val ks = if (ksFile.exists()) Properties().apply { ksFile.inputStream().use { load(it) } } else null

android {
    namespace = "app.synapsebox.android"
    compileSdk = 36                       // Android 16

    defaultConfig {
        applicationId = "app.synapsebox.android"
        minSdk = 24                       // Android 7.0 y posteriores
        targetSdk = 36                    // Android 16
        versionCode = 18
        versionName = "1.9.0"
    }
    signingConfigs {
        if (ks != null) create("release") {
            storeFile = rootProject.file(ks.getProperty("storeFile"))
            storePassword = ks.getProperty("storePassword")
            keyAlias = ks.getProperty("keyAlias")
            keyPassword = ks.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            if (ks != null) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Para firmar el APK de release configura tu propio keystore (ver LEEME-ANDROID.md)
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
