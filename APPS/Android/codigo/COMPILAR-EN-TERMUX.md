# Compilar y firmar SynapseBox en Termux (sin root)

Necesitas: Android 7+ con **unos 5 GB libres**, **6 GB de RAM o más** recomendado, y Termux de **F-Droid o GitHub** (la de Google Play está obsoleta). Todo se hace en la carpeta personal de Termux (`~`), nunca en `/sdcard`.

> Honestidad: compilar apps de Android dentro de Android es posible pero delicado. El único binario nativo de Google que no existe para ARM es `aapt2`; aquí se sustituye por el de Termux. Si algo falla, usa el flujo de GitHub Actions (`.github/workflows/android.yml`) o un PC.

## 1. Herramientas
```bash
pkg update && pkg upgrade -y
pkg install -y openjdk-17 aapt2 unzip curl wget
echo 'export JAVA_HOME=$PREFIX/lib/jvm/java-17-openjdk' >> ~/.bashrc
echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
source ~/.bashrc
java -version        # debe decir 17
ls $PREFIX/bin/aapt2 # debe existir (si no: pkg search aapt2)
```

## 2. Gradle 8.14.3 (el de Termux puede ser antiguo)
```bash
cd ~ && curl -LO https://services.gradle.org/distributions/gradle-8.14.3-bin.zip
unzip -q gradle-8.14.3-bin.zip && rm gradle-8.14.3-bin.zip
echo 'export PATH=$HOME/gradle-8.14.3/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
gradle -v
```

## 3. SDK de Android (solo la parte en Java)
Mira en https://developer.android.com/studio#command-line-tools-only el número actual de «Command line tools only» para Linux (aquí `11076708`):
```bash
mkdir -p $ANDROID_HOME/cmdline-tools && cd $ANDROID_HOME/cmdline-tools
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q commandlinetools-linux-*_latest.zip && mv cmdline-tools latest && rm *.zip
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses
sdkmanager "platforms;android-36" "build-tools;36.0.0"
```
(Los ejecutables x86 de `build-tools` no funcionan en ARM y no se usan; solo hace falta que la carpeta exista.)

## 4. Ajustes de Gradle para Termux (globales, no tocan el proyecto)
```bash
mkdir -p ~/.gradle && cat >> ~/.gradle/gradle.properties <<EOF2
android.aapt2FromMavenOverride=$PREFIX/bin/aapt2
org.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8
org.gradle.workers.max=2
kotlin.daemon.jvmargs=-Xmx1024m
EOF2
```
Si el móvil tiene poca RAM baja `-Xmx` a 1024m y usa siempre `--no-daemon`.

## 5. Traer el proyecto
```bash
termux-setup-storage            # acepta el permiso
mkdir -p ~/synapsebox && cd ~/synapsebox
unzip -q ~/storage/downloads/SynapseBox-Android_*.zip
echo "sdk.dir=$ANDROID_HOME" > local.properties
```

## 6. Compilar
APK de prueba (se firma solo con la clave de depuración; sirve para instalar y usar):
```bash
gradle assembleDebug --no-daemon
# resultado: app/build/outputs/apk/debug/app-debug.apk
```
La primera vez tarda bastante (descarga dependencias). Si falla por falta de `build-tools;X`, instala justo esa versión con `sdkmanager`.

## 7. Firmar para release (tu propia clave)
```bash
cd ~/synapsebox
keytool -genkeypair -v -keystore synapsebox.jks -alias synapsebox -keyalg RSA -keysize 2048 -validity 10000
cp keystore.properties.example keystore.properties && nano keystore.properties   # contraseñas que pusiste
gradle assembleRelease --no-daemon
# resultado firmado: app/build/outputs/apk/release/app-release.apk
```
**Guarda `synapsebox.jks` y sus contraseñas en un lugar seguro** (copia fuera de Termux): sin la misma clave no podrás actualizar la app instalada. Para comprobar la firma: `pkg install apksigner && apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk`.

## 8. Instalar
```bash
cp app/build/outputs/apk/release/app-release.apk ~/storage/downloads/SynapseBox.apk
```
Abre el APK desde el gestor de archivos y permite «Instalar apps desconocidas» a ese gestor. Si ya tenías instalada otra versión firmada con otra clave (p. ej. la de depuración), desinstálala antes.

## Problemas típicos
| Síntoma | Solución |
| --- | --- |
| `AAPT2 ... Syntax error` / `cannot execute binary` | Falta el override del paso 4 o `aapt2` de Termux no está instalado. |
| `OutOfMemoryError` / Termux se cierra | Baja `-Xmx`, cierra otras apps, usa `--no-daemon`, compila primero `assembleDebug`. |
| `SDK location not found` | Crea `local.properties` con `sdk.dir=...` (paso 5). |
| `Failed to install the following SDK components` | Ejecuta `sdkmanager` con el paquete que indica el error y reintenta. |
| `Unsupported class file major version` | Estás usando un JDK distinto de 17: revisa `JAVA_HOME`. |
