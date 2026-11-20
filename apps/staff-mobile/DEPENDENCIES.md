# Dependencies

Libraries are resolved by Gradle from Google Maven and Maven Central (see `gradle/libs.versions.toml`); nothing is vendored or modified. Networking uses the platform `HttpURLConnection` and storage uses `SharedPreferences`, so no extra libraries are needed for them.

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| AndroidX Core KTX | 1.19.1 | Apache-2.0 | Kotlin extensions |
| AndroidX Activity Compose | 1.13.0 | Apache-2.0 | Compose host activity, back handling |
| AndroidX Lifecycle (runtime-compose, viewmodel-compose) | 2.11.0 | Apache-2.0 | ViewModel, lifecycle-aware state collection |
| AndroidX Core SplashScreen | 1.2.0 | Apache-2.0 | Launch screen |
| Jetpack Compose BOM (ui, material3, material-icons-extended) | 2026.09.00 | Apache-2.0 | UI toolkit and icons |
| kotlinx.serialization JSON | 1.12.0 | Apache-2.0 | JSON encoding of API models |
| AndroidX ExifInterface | 1.4.2 | Apache-2.0 | Rotate evidence photos upright before upload |
| Kotlin standard library | 2.4.21 | Apache-2.0 | Language runtime |

Build and test only:

| Tool / library | Version | Licence |
| --- | --- | --- |
| Android Gradle Plugin | 9.5.1 | Apache-2.0 |
| Gradle (wrapper) | 9.9.0 | Apache-2.0 |
| JUnit 4 | 4.13.2 | EPL-1.0 |
| Robolectric | 4.17 | MIT |
| AndroidX Test core, Compose UI test | 1.7.0 / BOM | Apache-2.0 |
| kotlinx.coroutines test | 1.11.0 | Apache-2.0 |

The tea-leaf logo is original artwork in this repository (MIT).
