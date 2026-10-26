plugins {
    id("com.android.application")
    // No kotlin.android — Kotlin is built into AGP 9.x.
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.holypadel.wear"
    compileSdk = 36

    defaultConfig {
        // Must match the phone app's applicationId so the Wearable Data Layer pairs them.
        applicationId = "com.holypadel.app"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    signingConfigs {
        getByName("debug") {
            storeFile = file("../../mobile/android/app/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    lint {
        checkReleaseBuilds = false
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")
    implementation(composeBom)

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.13.0")
    // core-ktx 1.19.0 requires compileSdk 37; 1.18.0 is the latest that builds
    // against the stable API 36 platform (and is what activity-compose pulls anyway).
    implementation("androidx.core:core-ktx:1.18.0")

    // Wearable Data Layer API — receives phone match state, sends score/undo intents.
    implementation("com.google.android.gms:play-services-wearable:20.0.1")

    // Health Services — workout-grade heart rate + calories during the live match.
    implementation("androidx.health:health-services-client:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.10.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")

    // Tile (score / START LAST one swipe from the watch face). Signatures checked
    // against the 1.6.2 / 1.4.2 release AARs; both need compileSdk >= 35.
    implementation("androidx.wear.tiles:tiles:1.6.2")
    implementation("androidx.wear.protolayout:protolayout:1.4.2")

    // Wear ongoing activity — the live match shows on the watch face and in the ongoing
    // slot. Signatures checked against the 1.1.0 release AAR; core-ktx stays pinned above.
    implementation("androidx.wear:wear-ongoing:1.1.0")
}
