import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mymap.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mymap.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 88
        versionName = "0.32.11"
        // indirizzo di partenza del server: vuoto nelle build pubbliche; per le tue metti mymap.serverUrl=https://... in android/local.properties
        val serverUrl = Properties().apply {
            rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
        }.getProperty("mymap.serverUrl", "")
        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
    }

    buildFeatures { buildConfig = true }

    // l'interfaccia è la cartella web/ del repository, inclusa così com'è nell'APK
    sourceSets.getByName("main").assets.srcDir("../../web")

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug") // uso personale, sideload
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
