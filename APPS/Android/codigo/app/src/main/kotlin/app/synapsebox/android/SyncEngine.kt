package app.synapsebox.android

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CancellationException
import kotlin.math.abs

/** Opciones de una pasada. [initialPass] = todavía no se ha hecho la copia inicial de esta configuración. */
class SyncOptions(
    val mode: String,            // two_way | upload | download
    val strategy: String,        // full_then_changes | initial_only | changes_only
    val initialPass: Boolean,
    val optNew: Boolean, val optMod: Boolean, val optDel: Boolean, val optDirs: Boolean,
    val exclude: List<String> = emptyList(),   // patrones (*, ?) sobre el nombre o la ruta
    val maxBytes: Long = 0,                     // 0 = sin límite; los archivos mayores se omiten (no se borran)
)

/**
 * Sincronización de una carpeta local con una carpeta de SynapseBox.
 *
 * Se guarda una «foto» de lo sincronizado la última vez (tamaño y fecha de cada lado). En cada pasada se compara cada ruta con esa foto:
 *  · cambió solo un lado → se copia al otro;  · cambiaron los dos → conflicto: la copia local se conserva como «nombre (conflicto …)»;
 *  · desapareció de un lado y no cambió en el otro → se propaga el borrado (al servidor va a su papelera; en el móvil a «.sync-trash»).
 * Estrategias: «copia completa y luego cambios», «solo copia inicial» (la hace el Worker y se detiene) y «solo cambios desde ahora»
 * (la primera pasada solo guarda una línea base: lo que ya existe se ignora; las entradas de un solo lado llevan -1 en el otro).
 * Durante la copia inicial nunca se borra nada. Cada tipo de cambio (nuevos, modificados, borrados, carpetas) se puede desactivar.
 */
class SyncEngine(
    private val root: File,
    private val remoteBase: String,
    private val o: SyncOptions,
    private val stateFile: File,
) {
    private data class L(val dir: Boolean, val size: Long, val mtime: Long)
    /** ls/rs = -1 → en esa foto solo existía en el otro lado (línea base de «solo cambios»). */
    private data class S(val dir: Boolean, val ls: Long, val lm: Long, val rs: Long, val rm: Long)

    class Stats {
        var up = 0; var down = 0; var del = 0; var moved = 0; var dirs = 0; var conflicts = 0; var errors = 0; var lastError: String? = null; var baseline = false; var skipped = 0
        fun summary() = if (baseline) "Línea base guardada: desde ahora se sincronizarán solo los cambios"
        else "{up}${up} {down}${down} {del}${del}" + (if (moved > 0) " {mv}${moved}" else "") + (if (dirs > 0) " {dir}${dirs}" else "") + (if (conflicts > 0) " {warn}${conflicts} conflictos" else "") + (if (skipped > 0) " {skip}${skipped} omitidos" else "") +
            (if (errors > 0) " · ${errors} errores (${lastError ?: ""})" else "")
    }

    private val TOL = 2000L
    private val BIG = 8L * 1024 * 1024
    private val TRASH = ".sync-trash"
    private val up = o.mode != "download"
    private val down = o.mode != "upload"
    private val allowNew = o.initialPass || o.optNew
    private val allowMod = o.initialPass || o.optMod
    private val allowDirs = o.initialPass || o.optDirs
    private val allowDel = !o.initialPass && o.optDel          // la copia inicial nunca borra
    private val globs = o.exclude.map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }.map { g ->
        Regex(g.trim('/').map { ch -> when (ch) { '*' -> ".*"; '?' -> "."; else -> Regex.escape(ch.toString()) } }.joinToString(""), RegexOption.IGNORE_CASE)
    }
    /** true si algún segmento de la ruta (o la ruta entera) coincide con un patrón de exclusión. */
    private fun excluded(rel: String): Boolean = globs.isNotEmpty() && (globs.any { it.matches(rel) } || rel.split('/').any { seg -> globs.any { it.matches(seg) } })
    private fun tooBig(size: Long) = o.maxBytes > 0 && size > o.maxBytes
    private fun rp(rel: String) = if (remoteBase.isEmpty()) rel else "$remoteBase/$rel"
    private fun changed(size: Long, mtime: Long, s0: Long, m0: Long) = size != s0 || abs(mtime - m0) > TOL

    private fun scanLocal(): Map<String, L> {
        val out = HashMap<String, L>()
        fun walk(d: File, rel: String) {
            val fs = d.listFiles() ?: return
            for (f in fs) {
                val n = f.name
                if ((rel.isEmpty() && n == TRASH) || n.endsWith(".sbpart")) continue
                if (isLink(f)) continue
                val r = if (rel.isEmpty()) n else "$rel/$n"
                if (excluded(r)) continue
                if (f.isDirectory) { out[r] = L(true, 0, f.lastModified()); walk(f, r) }
                else if (f.isFile) out[r] = L(false, f.length(), f.lastModified())
            }
        }
        walk(root, ""); return out
    }
    private fun isLink(f: File) = try { f.canonicalPath != File(f.absoluteFile.parentFile?.canonicalPath ?: "/", f.name).path } catch (e: IOException) { true }

    private fun load(): Map<String, S> = try {
        val j = JSONObject(stateFile.readText()); val m = HashMap<String, S>()
        for (k in j.keys()) { val a = j.getJSONArray(k); m[k] = S(a.getInt(0) == 1, a.getLong(1), a.getLong(2), a.getLong(3), a.getLong(4)) }
        m
    } catch (e: Exception) { emptyMap() }

    private fun save(m: Map<String, S>) {
        val j = JSONObject()
        for ((k, s) in m) j.put(k, JSONArray().put(if (s.dir) 1 else 0).put(s.ls).put(s.lm).put(s.rs).put(s.rm))
        val tmp = File(stateFile.path + ".tmp"); tmp.writeText(j.toString()); tmp.renameTo(stateFile)
    }

    private fun trashLocal(rel: String) {
        val f = File(root, rel)
        val d = File(File(File(root, TRASH), SimpleDateFormat("yyyyMMdd", Locale.US).format(Date())), rel)
        d.parentFile?.mkdirs()
        if (!f.renameTo(d)) { f.copyTo(d, overwrite = true); f.delete() }
    }

    private fun purgeTrash() {
        val t = File(root, TRASH); val limit = System.currentTimeMillis() - 30L * 24 * 3600 * 1000
        t.listFiles()?.forEach { if (it.lastModified() < limit) it.deleteRecursively() }
    }

    private fun conflictCopy(rel: String): String {
        val f = File(root, rel); val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val dot = f.name.lastIndexOf('.')
        val name = if (dot > 0) f.name.substring(0, dot) + " (conflicto $stamp)" + f.name.substring(dot) else f.name + " (conflicto $stamp)"
        f.renameTo(File(f.parentFile, name))
        return (rel.substringBeforeLast('/', "").let { if (it.isEmpty()) "" else "$it/" }) + name
    }

    private fun <T> retry(block: () -> T): T {
        try { return block() } catch (e: AuthException) { throw e } catch (e: ApiException) { throw e } catch (e: IOException) { Thread.sleep(1500); return block() }
    }

    /** Crea en el servidor la carpeta remota elegida (y las que la contienen) si no existe. */
    private fun ensureRemoteBase() {
        if (remoteBase.isEmpty()) return
        var parent = ""
        for (seg in remoteBase.split('/').filter { it.isNotEmpty() }) {
            try { Api.mkdir(parent, seg) } catch (e: ApiException) { /* ya existe */ }
            parent = if (parent.isEmpty()) seg else "$parent/$seg"
        }
    }

    /** Renombrados: un archivo que «desaparece» de un lado y aparece con el mismo tamaño y fecha en otro sitio se mueve en el otro lado en vez de borrar y volver a copiar (servidor 2.25+). */
    private fun detectRenames(local: Map<String, L>, remote: Map<String, Api.Remote>, snap: Map<String, S>, handled: MutableSet<String>, st: Stats, progress: (String) -> Unit) {
        if (o.initialPass || !allowNew || !allowDel || !Api.has("sync-move")) return
        fun near(a: Long, b: Long) = abs(a - b) <= TOL
        if (up) {
            val fresh = local.filter { (p, l) -> !l.dir && l.size > 0 && snap[p] == null && remote[p] == null }
            for ((p, s) in snap) {
                if (s.dir || s.ls < 0 || s.rs < 0 || local[p] != null || p in handled) continue
                val r = remote[p] ?: continue
                if (changed(r.size, r.mtime, s.rs, s.rm)) continue
                val m = fresh.entries.firstOrNull { it.key !in handled && it.value.size == s.ls && near(it.value.mtime, s.lm) } ?: continue
                try { progress("{mv} $p → ${m.key}"); retry { Api.move(rp(p), rp(m.key)) }; handled += p; handled += m.key; st.moved++ } catch (e: AuthException) { throw e } catch (e: Exception) { }
            }
        }
        if (down) {
            val fresh = remote.filter { (p, r) -> !r.isDir && r.size > 0 && snap[p] == null && local[p] == null }
            for ((p, s) in snap) {
                if (s.dir || s.ls < 0 || s.rs < 0 || remote[p] != null || p in handled) continue
                val l = local[p] ?: continue
                if (changed(l.size, l.mtime, s.ls, s.lm)) continue
                val m = fresh.entries.firstOrNull { it.key !in handled && it.value.size == s.rs && near(it.value.mtime, s.rm) } ?: continue
                try {
                    val to = File(root, m.key); to.parentFile?.mkdirs()
                    if (File(root, p).renameTo(to)) { progress("{mv} $p → ${m.key}"); handled += p; handled += m.key; st.moved++ }
                } catch (e: Exception) { }
            }
        }
    }

    /** Borra en el servidor lo acumulado: por lotes si el servidor lo permite (a la papelera), si no uno a uno. */
    private fun flushDeletes(paths: List<String>, done: MutableSet<String>, st: Stats, fail: (String, Exception) -> Unit, progress: (String) -> Unit) {
        if (paths.isEmpty()) return
        if (Api.has("sync-delete-batch")) {
            for (chunk in paths.chunked(200)) {
                progress("{del} ${chunk.size} elementos")
                try {
                    val bad = retry { Api.deleteBatch(chunk.map { rp(it) }) }
                    for (p in chunk) { val e = bad[rp(p)]; if (e == null) { done += p; st.del++ } else fail(p, IOException(e)) }
                } catch (e: AuthException) { throw e } catch (e: Exception) { chunk.forEach { fail(it, e) } }
            }
        } else for (p in paths) {
            try { progress("{del} $p"); retry { Api.delete(rp(p)) }; done += p; st.del++ } catch (e: AuthException) { throw e } catch (e: Exception) { fail(p, e) }
        }
    }

    fun run(check: () -> Unit, progress: (String) -> Unit, step: (Int, Int) -> Unit = { _, _ -> }): Stats {
        val st = Stats()
        if (!root.exists()) root.mkdirs()
        if (!root.isDirectory || !root.canWrite()) throw IOException("No se puede escribir en la carpeta local: concede el acceso a todos los archivos o elige otra carpeta")
        purgeTrash()
        // la carpeta remota solo se crea si aún no existe (antes se comprobaba en cada pasada)
        var remote0 = try { Api.tree(remoteBase) } catch (e: ApiException) { emptyMap() }
        if (remote0.isEmpty()) { ensureRemoteBase(); remote0 = Api.tree(remoteBase) }
        val remote = remote0.filterKeys { !excluded(it) }
        val local = scanLocal()
        val snap = load()
        if (snap.size > 10 && local.isEmpty()) throw IOException("La carpeta local aparece vacía (¿almacenamiento sin montar o sin permiso?): sincronización cancelada por seguridad")
        if (snap.size > 10 && remote.isEmpty()) throw IOException("La carpeta remota aparece vacía: sincronización cancelada por seguridad")

        // «Solo cambios desde ahora»: la primera pasada solo guarda la línea base y no copia nada
        if (o.strategy == "changes_only" && o.initialPass) {
            val ns = HashMap<String, S>()
            for (p in local.keys + remote.keys) {
                val l = local[p]; val r = remote[p]
                ns[p] = S(l?.dir ?: r!!.isDir, l?.size ?: -1, l?.mtime ?: -1, r?.size ?: -1, r?.mtime ?: -1)
            }
            save(ns); st.baseline = true; return st
        }

        val failed = HashSet<String>(); val deletedRemote = HashSet<String>(); val pendingDel = ArrayList<String>(); val handled = HashSet<String>()
        val localDirDel = ArrayList<String>(); val remoteDirDel = ArrayList<String>(); val extraUploads = ArrayList<String>()

        fun fail(p: String, e: Exception) { failed += p; st.errors++; st.lastError = (e.message ?: e.javaClass.simpleName).take(80); SyncLog.add("{err} $p: ${st.lastError}") }
        fun upload(p: String) {
            progress("{up} $p"); val f = File(root, p)
            if (tooBig(f.length())) { st.skipped++; SyncLog.add("{skip} $p supera el tamaño máximo"); return }
            if (f.length() > BIG && Api.has("resumable-upload")) { // archivos grandes: por trozos y reanudable
                try { Api.uploadResumable(rp(p), f) { Live.set(it, f.length()) }; st.up++; return } catch (e: AuthException) { throw e } catch (e: ApiException) { /* si el servidor la rechaza, se prueba la subida simple */ }
            }
            retry { Api.upload(rp(p), f) }; st.up++
        }
        fun download(p: String, r: Api.Remote) {
            progress("{down} $p")
            if (tooBig(r.size)) { st.skipped++; SyncLog.add("{skip} $p supera el tamaño máximo"); return }
            val dest = File(root, p); dest.parentFile?.mkdirs()
            val tmp = File(dest.parentFile, dest.name + ".sbpart")
            tmp.delete() // un parcial viejo podría ser de otra versión del archivo: solo se reanuda dentro de esta misma descarga
            try { retry { Api.download(rp(p), tmp, resume = true) { Live.set(it, r.size) } } } catch (e: Exception) { tmp.delete(); throw e }
            if (dest.exists()) dest.delete()
            if (!tmp.renameTo(dest)) { tmp.delete(); throw IOException("No se pudo guardar $p") }
            dest.setLastModified(r.mtime); st.down++
        }
        fun mkdirRemote(p: String) { progress("{dir} $p"); retry { Api.mkdir(rp(p.substringBeforeLast('/', "")).trim('/'), p.substringAfterLast('/')) }; st.dirs++ }
        fun mkdirLocal(p: String) { if (File(root, p).mkdirs()) st.dirs++ }

        detectRenames(local, remote, snap, handled, st, progress)
        val all = (local.keys + remote.keys).toSortedSet(); var idx = 0
        for (p in all) {
            check(); step(idx++, all.size)
            if (p in handled) continue
            val l = local[p]; val r = remote[p]; val s = snap[p]
            try {
                when {
                    l != null && r != null -> {
                        if (l.dir != r.isDir) throw IOException("tipo distinto (archivo/carpeta) en $p")
                        if (l.dir) continue
                        if (l.size == r.size && abs(l.mtime - r.mtime) <= TOL) continue
                        val known = s != null && !s.dir && s.ls >= 0 && s.rs >= 0
                        val lc = !known || changed(l.size, l.mtime, s!!.ls, s.lm)
                        val rc = !known || changed(r.size, r.mtime, s!!.rs, s.rm)
                        if (lc && !rc) { if (up && allowMod) upload(p) }
                        else if (!lc && rc) { if (down && allowMod) download(p, r) }
                        else if (known && !allowMod) { /* modificados desactivado */ }
                        else when (o.mode) { // cambiaron los dos lados
                            "upload" -> upload(p)
                            "download" -> { conflictCopy(p); download(p, r); st.conflicts++; SyncLog.add("{warn} conflicto: $p") }
                            else -> { val c = conflictCopy(p); download(p, r); extraUploads += c; st.conflicts++; SyncLog.add("{warn} conflicto: $p (copia local conservada)") }
                        }
                    }
                    l != null -> if (l.dir) { // solo existe en el móvil
                        if (s == null) { if (up && allowDirs) mkdirRemote(p) }
                        else if (s.rs < 0) { /* ya existía al guardar la línea base: se ignora */ }
                        else if (allowDel && allowDirs && down) localDirDel += p
                    } else {
                        if (s != null && !s.dir && s.rs < 0) { // existía solo aquí en la línea base: solo cuenta si se modificó
                            if (changed(l.size, l.mtime, s.ls, s.lm) && up && allowMod) upload(p)
                        } else {
                            val known = s != null && !s.dir
                            if (known && !changed(l.size, l.mtime, s!!.ls, s.lm) && allowDel && down) { trashLocal(p); st.del++ }
                            else if (up && allowNew) upload(p)
                        }
                    }
                    r != null -> if (r.isDir) { // solo existe en el servidor
                        if (s == null) { if (down && allowDirs) mkdirLocal(p) }
                        else if (s.ls < 0) { /* línea base: se ignora */ }
                        else if (allowDel && allowDirs && up) remoteDirDel += p
                        else if (down && allowDirs) mkdirLocal(p)
                    } else {
                        if (s != null && !s.dir && s.ls < 0) {
                            if (changed(r.size, r.mtime, s.rs, s.rm) && down && allowMod) download(p, r)
                        } else {
                            val known = s != null && !s.dir
                            if (known && !changed(r.size, r.mtime, s!!.rs, s.rm) && allowDel && up) pendingDel.add(p)
                            else if (down && allowNew) download(p, r)
                        }
                    }
                }
            } catch (e: AuthException) { throw e } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(p, e) }
        }
        check()
        flushDeletes(pendingDel, deletedRemote, st, ::fail, progress)
        for (c in extraUploads) try { upload(c) } catch (e: AuthException) { throw e } catch (e: Exception) { fail(c, e) }
        for (d in localDirDel.sortedByDescending { it.length }) if (File(root, d).delete()) st.dirs++ // solo si ya está vacía
        for (d in remoteDirDel.sortedByDescending { it.length }) {
            if (remote.keys.none { it.startsWith("$d/") && it !in deletedRemote && it !in remoteDirDel }) // nunca borra una carpeta que aún tenga algo
                try { retry { Api.delete(rp(d)) }; deletedRemote += d; st.dirs++ } catch (e: AuthException) { throw e } catch (e: Exception) { fail(d, e) }
        }

        // Nueva foto: lo que existe en los dos lados y no falló, más las entradas de línea base que siguen sin tocarse
        val remote2 = Api.tree(remoteBase).filterKeys { !excluded(it) }; val local2 = scanLocal(); val ns = HashMap<String, S>()
        for (p in local2.keys + remote2.keys) {
            if (p in failed) continue
            val l = local2[p]; val r = remote2[p]
            if (l != null && r != null) { if (l.dir == r.isDir) ns[p] = S(l.dir, l.size, l.mtime, r.size, r.mtime) }
            else { val old = snap[p] ?: continue; if ((l != null && old.rs < 0) || (r != null && old.ls < 0)) ns[p] = old }
        }
        save(ns)
        return st
    }
}


/** Porcentaje del archivo que se está transfiriendo ahora (−1 si no se conoce); lo lee la notificación de sincronización. */
object Live {
    @Volatile var pct = -1
    fun set(done: Long, total: Long) { pct = if (total > 0) (done * 100 / total).toInt().coerceIn(0, 100) else -1 }
    fun reset() { pct = -1 }
}
