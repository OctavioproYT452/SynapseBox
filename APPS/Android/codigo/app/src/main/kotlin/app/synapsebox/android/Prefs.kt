package app.synapsebox.android

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Cifra el token de sesión con una clave del Android Keystore (AES-GCM): nunca se guarda en claro. */
object Crypto {
    private const val ALIAS = "synapsebox_token_key"
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build()
        )
        return g.generateKey()
    }

    fun enc(s: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        return Base64.encodeToString(c.iv + c.doFinal(s.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    fun dec(s: String): String? = try {
        val b = Base64.decode(s, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b, 0, 12))
        String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
    } catch (e: Exception) { null }
}

/** Ajustes de la app. El token va cifrado; el resto son preferencias normales. */
object Prefs {
    private lateinit var sp: SharedPreferences
    fun init(c: Context) { if (!::sp.isInitialized) sp = c.applicationContext.getSharedPreferences("synapsebox", Context.MODE_PRIVATE) }
    val raw: SharedPreferences get() = sp

    private fun s(k: String, d: String = "") = sp.getString(k, d) ?: d
    private fun put(k: String, v: String) = sp.edit().putString(k, v).apply()

    var server: String get() = s("server"); set(v) = put("server", v)
    var username: String get() = s("username"); set(v) = put("username", v)
    var token: String?
        get() = sp.getString("token", null)?.let { Crypto.dec(it) }
        set(v) { if (v == null) sp.edit().remove("token").apply() else put("token", Crypto.enc(v)) }
    var expiresAt: Long get() = sp.getLong("expiresAt", 0); set(v) = sp.edit().putLong("expiresAt", v).apply()

    var syncEnabled: Boolean get() = sp.getBoolean("syncEnabled", false); set(v) = sp.edit().putBoolean("syncEnabled", v).apply()
    var localPath: String get() = s("localPath"); set(v) = put("localPath", v)
    var remotePath: String get() = s("remotePath"); set(v) = put("remotePath", v.trim().trim('/'))
    /** two_way | upload | download */
    var mode: String get() = s("mode", "two_way"); set(v) = put("mode", v)
    var intervalMin: Int get() = sp.getInt("intervalMin", 60); set(v) = sp.edit().putInt("intervalMin", v).apply()
    var wifiOnly: Boolean get() = sp.getBoolean("wifiOnly", true); set(v) = sp.edit().putBoolean("wifiOnly", v).apply()
    var chargingOnly: Boolean get() = sp.getBoolean("chargingOnly", false); set(v) = sp.edit().putBoolean("chargingOnly", v).apply()
    var optDel: Boolean get() = sp.getBoolean("propagateDeletes", true); set(v) = sp.edit().putBoolean("propagateDeletes", v).apply()
    /** full_then_changes (copia todo y luego cambios) | initial_only (solo la copia inicial) | changes_only (solo cambios desde ahora) */
    var syncStrategy: String get() = s("syncStrategy", "full_then_changes"); set(v) = put("syncStrategy", v)
    var optNew: Boolean get() = sp.getBoolean("optNew", true); set(v) = sp.edit().putBoolean("optNew", v).apply()
    var optMod: Boolean get() = sp.getBoolean("optMod", true); set(v) = sp.edit().putBoolean("optMod", v).apply()
    var optDirs: Boolean get() = sp.getBoolean("optDirs", true); set(v) = sp.edit().putBoolean("optDirs", v).apply()
    /** Huella de la configuración para la que ya se hizo la copia inicial; si cambia la carpeta, el servidor o la estrategia, se repite. */
    var initialKey: String get() = s("initialKey"); set(v) = put("initialKey", v)
    fun syncKey() = "$server|$localPath|$remotePath|$syncStrategy"
    val initialDone: Boolean get() = initialKey == syncKey()
    var status: String get() = s("status", "Sin sincronizar todavía"); set(v) = put("status", v)
    var updateAuto: Boolean get() = sp.getBoolean("updateAuto", true); set(v) = sp.edit().putBoolean("updateAuto", v).apply()
    var updateNotified: String get() = s("updateNotified", ""); set(v) = put("updateNotified", v)
    var lastSync: Long get() = sp.getLong("lastSync", 0); set(v) = sp.edit().putLong("lastSync", v).apply()

    // Apariencia (solo de esta app)
    var themeMode: Int get() = sp.getInt("themeMode", 2); set(v) = sp.edit().putInt("themeMode", v).apply()     // 0 sistema · 1 claro · 2 oscuro (predeterminado)
    var accent: Int get() = sp.getInt("accent", 1); set(v) = sp.edit().putInt("accent", v).apply()
    var amoled: Boolean get() = sp.getBoolean("amoled", false); set(v) = sp.edit().putBoolean("amoled", v).apply()
    var heroStyle: Int get() = sp.getInt("heroStyle", 0); set(v) = sp.edit().putInt("heroStyle", v).apply()     // 0 degradado · 1 color liso · 2 compacta
    var corners: Int get() = sp.getInt("corners", 1); set(v) = sp.edit().putInt("corners", v).apply()           // 0 poco · 1 normal · 2 mucho
    // Seguridad
    var appLock: Boolean get() = sp.getBoolean("appLock", false); set(v) = sp.edit().putBoolean("appLock", v).apply()
    var lockTimeoutSec: Int get() = sp.getInt("lockTimeoutSec", 60); set(v) = sp.edit().putInt("lockTimeoutSec", v).apply()
    var secureScreen: Boolean get() = sp.getBoolean("secureScreen", false); set(v) = sp.edit().putBoolean("secureScreen", v).apply()
    var httpsOnly: Boolean get() = sp.getBoolean("httpsOnly", true); set(v) = sp.edit().putBoolean("httpsOnly", v).apply()
    // Extras
    var uploadFolder: String get() = s("uploadFolder", "Subidas del móvil"); set(v) = put("uploadFolder", v.trim().trim('/').ifEmpty { "Subidas del móvil" })
    var exclude: String get() = s("exclude", ".thumbnails\n*.tmp\n*.part\n*.crdownload"); set(v) = put("exclude", v)
    var maxFileMb: Int get() = sp.getInt("maxFileMb", 0); set(v) = sp.edit().putInt("maxFileMb", v).apply()
    var notifyDone: Boolean get() = sp.getBoolean("notifyDone", false); set(v) = sp.edit().putBoolean("notifyDone", v).apply()
    var notifyErrors: Boolean get() = sp.getBoolean("notifyErrors", true); set(v) = sp.edit().putBoolean("notifyErrors", v).apply()
    var pausedUntil: Long get() = sp.getLong("pausedUntil", 0); set(v) = sp.edit().putLong("pausedUntil", v).apply()

    /** Solo para mostrar u ocultar opciones; el servidor vuelve a comprobar el permiso en cada llamada de administración. */
    var isAdmin: Boolean get() = sp.getBoolean("isAdmin", false); set(v) = sp.edit().putBoolean("isAdmin", v).apply()

    /** Cierra la sesión pero conserva la configuración de la carpeta. */
    fun clearSession() { token = null; expiresAt = 0; isAdmin = false }
}
