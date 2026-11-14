plugins {
    id("com.android.application")
    // No kotlin.android — Kotlin is built into AGP 9.x.
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.holypadel.wear"
    compileSdk = 37

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
    // Wear Material 3 Expressive: theme, scaffolds, edge buttons, button groups. Also the
    // one-handed gesture API, which lets the match lock swallow the wrist-turn dismiss on
    // Wear OS 7+ (no-op elsewhere). Signatures checked against the 1.7.1 release AARs.
    implementation("androidx.wear.compose:compose-material3:1.7.1")
    implementation("androidx.wear.compose:compose-foundation:1.7.1")
    implementation("androidx.activity:activity-compose:1.13.0")
    // core-ktx stays at 1.18.0 (what activity-compose pulls anyway); 1.19.0 needs compileSdk 37.
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
    // Material 3 Expressive tile layouts (primary layout, edge button), same release train.
    implementation("androidx.wear.protolayout:protolayout-material3:1.4.2")

    // Wear ongoing activity — the live match shows on the watch face and in the ongoing
    // slot. Signatures checked against the 1.1.0 release AAR; core-ktx stays pinned above.
    implementation("androidx.wear:wear-ongoing:1.1.0")
}
