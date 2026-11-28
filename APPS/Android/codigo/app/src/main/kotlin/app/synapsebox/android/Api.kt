package app.synapsebox.android

import android.os.Build
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink
import okio.source
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.io.IOException
import java.util.concurrent.TimeUnit

class AuthException : IOException("La sesión ha caducado")
class ApiException(msg: String, val code: Int) : IOException(msg)

/** Cliente de la API de SynapseBox. Todas las llamadas son bloqueantes: usar desde Dispatchers.IO. */
object Api {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).writeTimeout(120, TimeUnit.SECONDS)
        .addInterceptor { c -> val r = c.request(); if (Net.cleartextBlocked(r.url)) throw IOException(Net.BLOCK_MSG); c.proceed(if (Ngrok.isNgrok(r.url.host)) r.newBuilder().header(Ngrok.HEADER, "true").build() else r) }
        .retryOnConnectionFailure(true).build()
    private val JSON = "application/json".toMediaType()
    private val BIN = "application/octet-stream".toMediaType()

    data class Login(val need2fa: Boolean, val ticket: String?, val token: String?, val expiresAt: Long, val user: String?)
    data class Remote(val path: String, val isDir: Boolean, val size: Long, val mtime: Long)

    /** Añade https:// si falta y quita la barra final. Devuelve null si no es una dirección válida. */
    fun normalize(s: String): String? {
        var t = s.trim().trimEnd('/')
        if (t.isEmpty()) return null
        if (!t.contains("://")) { // sin esquema: red local (IP, nombre sin punto, .local/.lan/.home) → http; dominio de Internet → https
            val host = t.substringBefore('/').substringBefore(':')
            val local = Regex("""\d{1,3}(\.\d{1,3}){3}""").matches(host) || !host.contains('.') || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".home")
            t = (if (local) "http://" else "https://") + t
        }
        return t.toHttpUrlOrNull()?.toString()?.trimEnd('/')
    }

    private val quick = OkHttpClient.Builder().connectTimeout(700, TimeUnit.MILLISECONDS).readTimeout(1500, TimeUnit.MILLISECONDS)
        .callTimeout(2500, TimeUnit.MILLISECONDS).retryOnConnectionFailure(false).followRedirects(false).build()
    private val slow = OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS).callTimeout(12, TimeUnit.SECONDS).build()

    /**
     * Comprueba si en esa dirección hay un SynapseBox. Devuelve su versión, "?" si responde pero no dice quién es (servidor anterior a 2.24.1),
     * o null si no es SynapseBox / no responde. Con strict = true solo se acepta si se identifica como SynapseBox (búsqueda en la red).
     */
    fun probe(base: String, fast: Boolean, strict: Boolean = false): String? = try {
        val u = base.toHttpUrl().newBuilder().addPathSegments("api/health").build()
        (if (fast) quick else slow).newCall(Request.Builder().url(u).apply { Ngrok.headers(base).forEach { (k, v) -> header(k, v) } }.get().build()).execute().use { r ->
            if (!r.isSuccessful) null else {
                val j = JSONObject(r.body?.string().orEmpty().take(2000))
                if (j.optString("app") == "SynapseBox") j.optString("version", "?").ifEmpty { "?" }
                else if (!strict && j.optBoolean("ok")) "?" else null
            }
        }
    } catch (e: Exception) { null }

    private fun errorOf(r: Response): String {
        val t = try { r.body?.string().orEmpty() } catch (e: Exception) { "" }
        val m = try { JSONObject(t).optString("error") } catch (e: Exception) { "" }
        return m.ifEmpty { "Error ${r.code}" }
    }

    private fun <T> call(rb: Request.Builder, auth: Boolean = true, f: (Response) -> T): T {
        if (auth) rb.header("Authorization", "Bearer " + (Prefs.token ?: throw AuthException()))
        http.newCall(rb.build()).execute().use { r ->
            if (r.code == 401 && auth) throw AuthException()
            if (!r.isSuccessful) throw ApiException(errorOf(r), r.code)
            return f(r)
        }
    }

    private fun url(path: String, vararg q: Pair<String, String>): HttpUrl {
        val b = Prefs.server.toHttpUrl().newBuilder().addPathSegments(path.trim('/'))
        for ((k, v) in q) b.addQueryParameter(k, v)
        return b.build()
    }

    private fun parse(j: JSONObject) = Login(j.optBoolean("need2fa"), j.optString("ticket").ifEmpty { null }, j.optString("token").ifEmpty { null },
        j.optLong("expires_at"), j.optJSONObject("user")?.optString("username"))

    /** ¿El servidor permite crear cuentas desde la app? null si no se pudo comprobar. */
    fun registrationOpen(server: String): Boolean? = try {
        val u = server.toHttpUrl().newBuilder().addPathSegments("api/session").build()
        call(Request.Builder().url(u).get(), false) { r -> JSONObject(r.body?.string().orEmpty()).optBoolean("registration") }
    } catch (e: Exception) { null }

    class Registered(val login: Login, val codes: List<String>)
    /** Crea una cuenta nueva (y la deja con la sesión iniciada). Devuelve también los códigos de recuperación, que solo se ven una vez. */
    fun register(server: String, user: String, pass: String, pass2: String): Registered {
        val u = server.toHttpUrl().newBuilder().addPathSegments("api/register").build()
        val body = JSONObject().put("username", user).put("password", pass).put("password2", pass2).put("client", "android").put("device", Build.MODEL ?: "Android")
        return call(Request.Builder().url(u).post(body.toString().toRequestBody(JSON)), false) { r ->
            val j = JSONObject(r.body?.string().orEmpty()); val a = j.optJSONArray("codes")
            Registered(parse(j).copy(user = user), (0 until (a?.length() ?: 0)).map { a!!.getString(it) })
        }
    }

    class Usage(val used: Long, val maxMb: Long)
    fun usage(): Usage = call(Request.Builder().url(url("api/list", "path" to "")).get()) { r ->
        val j = JSONObject(r.body?.string().orEmpty()); Usage(j.optLong("usedBytes"), j.optLong("maxMB", -1))
    }

    fun mkdir(parent: String, name: String) {
        val b = JSONObject().put("path", parent).put("name", name).toString().toRequestBody(JSON)
        call(Request.Builder().url(url("api/mkdir")).post(b)) { }
    }

    private fun login(server: String, path: String, body: JSONObject): Login {
        val u = server.toHttpUrl().newBuilder().addPathSegments(path).build()
        body.put("client", "android").put("device", Build.MODEL ?: "Android")
        return call(Request.Builder().url(u).post(body.toString().toRequestBody(JSON)), false) { r ->
            parse(JSONObject(r.body?.string().orEmpty()))
        }
    }
    fun login(server: String, user: String, pass: String) = login(server, "api/login", JSONObject().put("username", user).put("password", pass))
    fun login2fa(server: String, ticket: String, code: String) = login(server, "api/login/2fa", JSONObject().put("ticket", ticket).put("code", code))

    /** Alarga la sesión en el servidor si ha pasado más de la mitad de su vida. */
    fun renewIfNeeded() {
        val left = Prefs.expiresAt - System.currentTimeMillis()
        if (Prefs.expiresAt != 0L && left > 3L * 24 * 3600 * 1000) return
        val u = url("api/session/renew")
        call(Request.Builder().url(u).post("{}".toRequestBody(JSON))) { r ->
            val j = JSONObject(r.body?.string().orEmpty()); Prefs.expiresAt = j.optLong("expires_at", Prefs.expiresAt)
        }
    }

    fun logout() { call(Request.Builder().url(url("api/logout")).post("{}".toRequestBody(JSON))) { } }

    /** Todo el contenido de una carpeta remota (rutas relativas a ella). Una carpeta que no existe devuelve un mapa vacío. */
    fun tree(remote: String): Map<String, Remote> {
        val u = url("api/sync/tree", "path" to remote)
        return call(Request.Builder().url(u).get()) { r ->
            val a = JSONObject(r.body?.string().orEmpty()).getJSONArray("items")
            val out = HashMap<String, Remote>(a.length() * 2)
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                out[o.getString("path")] = Remote(o.getString("path"), o.getBoolean("isDir"), o.optLong("size"), o.optLong("mtime"))
            }
            out
        }
    }

    /** Descarga a [dest]. Con [resume] y un servidor con `download-range`, continúa un archivo parcial ya existente (Range). */
    fun download(remotePath: String, dest: File, resume: Boolean = false, onBytes: (Long) -> Unit = {}) {
        val have = if (resume && dest.exists() && dest.length() > 0 && has("download-range")) dest.length() else 0L
        val rb = Request.Builder().url(url("api/download", "path" to remotePath)).get()
        if (have > 0) rb.header("Range", "bytes=$have-")
        call(rb) { r ->
            val body = r.body ?: throw IOException("Respuesta vacía")
            val append = have > 0 && r.code == 206
            body.byteStream().use { i -> java.io.FileOutputStream(dest, append).use { o ->
                val buf = ByteArray(64 * 1024); var tot = if (append) have else 0L; var lastTick = 0L
                while (true) { val n = i.read(buf); if (n < 0) break; o.write(buf, 0, n); tot += n; val t = System.currentTimeMillis(); if (t - lastTick > 300) { lastTick = t; onBytes(tot) } }
            } }
        }
    }

    fun upload(remotePath: String, file: File) {
        val len = file.length()
        val body = object : RequestBody() {
            override fun contentType() = BIN
            override fun contentLength() = len
            override fun writeTo(sink: BufferedSink) { file.source().use { sink.writeAll(it) } }
        }
        val u = url("api/sync/file", "path" to remotePath, "mtime" to file.lastModified().toString())
        call(Request.Builder().url(u).put(body)) { }
    }

    fun delete(remotePath: String) {
        val b = JSONObject().put("path", remotePath).toString().toRequestBody(JSON)
        call(Request.Builder().url(url("api/delete")).post(b)) { } // el servidor lo manda a su papelera
    }

    // ---------- Funciones del servidor (SynapseBox 2.25+) ----------
    class ServerInfo(val version: String, val api: Int, val features: Set<String>)
    private var info: ServerInfo? = null; private var infoServer = ""; private var infoAt = 0L

    /** Pregunta al servidor qué sabe hacer (`GET /api/client/info`). Un servidor antiguo (404) se trata como «sin funciones extra». Se guarda 10 min. */
    @Synchronized fun serverInfo(force: Boolean = false): ServerInfo {
        val now = System.currentTimeMillis()
        info?.let { if (!force && infoServer == Prefs.server && now - infoAt < 600_000) return it }
        val r = try {
            call(Request.Builder().url(url("api/client/info")).get(), Prefs.token != null) { r ->
                val j = JSONObject(r.body?.string().orEmpty()); val f = j.optJSONArray("features")
                ServerInfo(j.optString("version"), j.optInt("api", 0), (0 until (f?.length() ?: 0)).map { f!!.getString(it) }.toSet())
            }
        } catch (e: ApiException) { ServerInfo("", 0, emptySet()) }
        info = r; infoServer = Prefs.server; infoAt = now; return r
    }
    /** ¿Este servidor tiene la función? Si no se puede preguntar (sin conexión), se asume que no. */
    fun has(feature: String): Boolean = try { serverInfo().features.contains(feature) } catch (e: IOException) { false }

    fun move(from: String, to: String) {
        val b = JSONObject().put("from", from).put("to", to).toString().toRequestBody(JSON)
        call(Request.Builder().url(url("api/sync/move")).post(b)) { }
    }

    /** Borra varias rutas a la papelera en una sola llamada. Devuelve las que fallaron (ruta → motivo). */
    fun deleteBatch(paths: List<String>): Map<String, String> {
        val b = JSONObject().put("paths", org.json.JSONArray(paths)).toString().toRequestBody(JSON)
        return call(Request.Builder().url(url("api/sync/delete-batch")).post(b)) { r ->
            val a = JSONObject(r.body?.string().orEmpty()).optJSONArray("results"); val bad = HashMap<String, String>()
            for (i in 0 until (a?.length() ?: 0)) { val o = a!!.getJSONObject(i); if (!o.optBoolean("ok")) bad[o.getString("path")] = o.optString("error", "error") }
            bad
        }
    }

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256"); val buf = ByteArray(64 * 1024)
        f.inputStream().use { i -> while (true) { val n = i.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** Subida por trozos que se continúa si la conexión se corta; al final el servidor comprueba el SHA-256. */
    fun uploadResumable(remotePath: String, file: File, progress: (Long) -> Unit = {}) {
        val size = file.length()
        val init = JSONObject().put("path", remotePath).put("size", size).put("mtime", file.lastModified()).toString().toRequestBody(JSON)
        val (id, max) = call(Request.Builder().url(url("api/sync/upload")).post(init)) { r -> JSONObject(r.body?.string().orEmpty()).let { it.getString("id") to it.optLong("chunkMax", 4L shl 20) } }
        val chunk = minOf(max, 4L shl 20); var offset = 0L; var fails = 0
        while (offset < size) {
            try {
                val off = offset; val len = minOf(chunk, size - off)
                val body = object : RequestBody() {
                    override fun contentType() = "application/offset+octet-stream".toMediaType()
                    override fun contentLength() = len
                    override fun writeTo(sink: BufferedSink) {
                        RandomAccessFile(file, "r").use { raf ->
                            raf.seek(off); val buf = ByteArray(64 * 1024); var left = len
                            while (left > 0) { val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt()); if (n < 0) throw IOException("El archivo cambió mientras se subía"); sink.write(buf, 0, n); left -= n }
                        }
                    }
                }
                offset = call(Request.Builder().url(url("api/sync/upload/$id")).header("Upload-Offset", off.toString()).patch(body)) { r -> JSONObject(r.body?.string().orEmpty()).getLong("offset") }
                fails = 0; progress(offset)
            } catch (e: AuthException) { throw e } catch (e: IOException) {
                if ((e is ApiException && e.code in 400..499 && e.code != 409) || ++fails > 5) throw e
                Thread.sleep(1500L * fails)
                offset = try { call(Request.Builder().url(url("api/sync/upload/$id")).get()) { r -> JSONObject(r.body?.string().orEmpty()).getLong("offset") } } catch (e2: AuthException) { throw e2 } catch (e2: IOException) { offset }
            }
        }
        val c = JSONObject().put("sha256", sha256(file)).toString().toRequestBody(JSON)
        call(Request.Builder().url(url("api/sync/upload/$id/commit")).post(c)) { }
    }

    // ---------- Seguridad de la cuenta ----------
    class SessionInfo(val id: String, val current: Boolean, val createdAt: Long, val ip: String, val ua: String)
    fun sessions(): List<SessionInfo> = call(Request.Builder().url(url("api/sessions")).get()) { r ->
        val a = JSONObject(r.body?.string().orEmpty()).optJSONArray("sessions")
        (0 until (a?.length() ?: 0)).map { val o = a!!.getJSONObject(it); SessionInfo(o.optString("id"), o.optBoolean("current"), o.optLong("created_at"), o.optString("ip"), o.optString("ua")) }
    }
    fun revokeSession(id: String) { call(Request.Builder().url(url("api/sessions/revoke")).post(JSONObject().put("id", id).toString().toRequestBody(JSON))) { } }
    fun revokeOthers() { call(Request.Builder().url(url("api/sessions/revoke")).post(JSONObject().put("others", true).toString().toRequestBody(JSON))) { } }
    fun changePassword(current: String, next: String, next2: String) {
        val b = JSONObject().put("current", current).put("next", next).put("next2", next2).toString().toRequestBody(JSON)
        call(Request.Builder().url(url("api/password")).post(b)) { }
    }

    // ---------- Administración (solo cuentas de administrador; el servidor lo vuelve a comprobar) ----------
    class AdminUser(val username: String, val isAdmin: Boolean, val suspended: Boolean, val used: Long, val maxMb: Double)
    class Entry(val name: String, val isDir: Boolean, val size: Long, val mtime: Long)

    fun isAdmin(): Boolean = call(Request.Builder().url(url("api/session")).get()) { r -> JSONObject(r.body?.string().orEmpty()).optBoolean("admin") }

    fun adminUsers(): List<AdminUser> = call(Request.Builder().url(url("api/admin/users")).get()) { r ->
        val a = JSONObject(r.body?.string().orEmpty()).optJSONArray("users")
        (0 until (a?.length() ?: 0)).map { val o = a!!.getJSONObject(it); AdminUser(o.optString("username"), o.optInt("is_admin") == 1, o.optInt("suspended") == 1, o.optLong("used_bytes"), o.optDouble("max_space_mb", -1.0)) }
    }

    /** Contenido de una carpeta del usuario [user] (solo lectura). */
    fun adminList(user: String, path: String): List<Entry> = call(Request.Builder().url(url("api/admin/files", "user" to user, "path" to path)).get()) { r ->
        val a = JSONObject(r.body?.string().orEmpty()).optJSONArray("items")
        (0 until (a?.length() ?: 0)).map { val o = a!!.getJSONObject(it); Entry(o.optString("name"), o.optBoolean("isDir"), o.optLong("size"), o.optLong("mtime")) }
    }

    /** Descarga un archivo de [user] en [out]. */
    fun adminDownload(user: String, path: String, out: java.io.OutputStream) {
        call(Request.Builder().url(url("api/admin/file", "user" to user, "path" to path, "dl" to "1")).get()) { r ->
            val body = r.body ?: throw IOException("Respuesta vacía")
            body.byteStream().use { it.copyTo(out, 64 * 1024) }
        }
    }

    /** Borra un archivo o carpeta de [user]: va a la papelera de ese usuario. */
    fun adminDelete(user: String, path: String) {
        val b = JSONObject().put("user", user).put("path", path).toString().toRequestBody(JSON)
        call(Request.Builder().url(url("api/admin/delete-file")).post(b)) { }
    }

    // ---------- Explorar (búsqueda y filtros del servidor 2.26+) ----------
    class Item(val name: String, val path: String, val isDir: Boolean, val size: Long, val mtime: Long)

    /** Lista de resultados de un endpoint que devuelve {items:[{name,path,isDir,size,mtime}]}. */
    fun items(endpoint: String, vararg q: Pair<String, String>): List<Item> = call(Request.Builder().url(url(endpoint, *q)).get()) { r ->
        val a = JSONObject(r.body?.string().orEmpty()).optJSONArray("items")
        (0 until (a?.length() ?: 0)).map { val o = a!!.getJSONObject(it); Item(o.optString("name"), o.optString("path"), o.optBoolean("isDir"), o.optLong("size"), o.optLong("mtime")) }
    }
}
