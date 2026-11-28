package app.synapsebox.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.atomic.AtomicInteger

/** Búsqueda del servidor en la red local: prueba cada IP de la subred del teléfono en los puertos indicados. */
object Discovery {
    data class Found(val url: String, val version: String)

    private fun toLong(b: ByteArray) = b.fold(0L) { a, x -> (a shl 8) or (x.toLong() and 0xFF) }
    private fun toIp(v: Long) = "${(v shr 24) and 255}.${(v shr 16) and 255}.${(v shr 8) and 255}.${v and 255}"

    /** IPs a probar: las de la(s) subred(es) privada(s) del teléfono (máx. /22, 1022 equipos por subred) menos la propia. */
    fun targets(): List<String> {
        val out = LinkedHashSet<String>()
        try {
            for (ni in NetworkInterface.getNetworkInterfaces().toList()) {
                if (!ni.isUp || ni.isLoopback) continue
                for (ia in ni.interfaceAddresses) {
                    val a = ia.address as? Inet4Address ?: continue
                    if (!a.isSiteLocalAddress) continue
                    val own = toLong(a.address); val pf = ia.networkPrefixLength.toInt().let { if (it < 22) 24 else it }
                    if (pf > 30) continue
                    val mask = (0xFFFFFFFFL shl (32 - pf)) and 0xFFFFFFFFL
                    val net = own and mask; val last = (net or (mask.inv() and 0xFFFFFFFFL)) - 1
                    for (h in net + 1..last) if (h != own) out += toIp(h)
                }
            }
        } catch (e: Exception) { }
        out += "10.0.2.2" // el equipo anfitrión visto desde el emulador de Android
        return out.toList()
    }

    /** Busca en paralelo. [onFound] y [onProgress] se llaman desde hilos de fondo. */
    suspend fun scan(ports: List<Int>, onProgress: (done: Int, total: Int) -> Unit, onFound: (Found) -> Unit) = coroutineScope {
        val hosts = targets(); val total = hosts.size * ports.size; val done = AtomicInteger(); val sem = Semaphore(48)
        hosts.flatMap { ip ->
            ports.map { port ->
                async(Dispatchers.IO) {
                    sem.withPermit {
                        val base = "http://$ip:$port"
                        Api.probe(base, fast = true, strict = true)?.let { onFound(Found(base, it)) }
                        onProgress(done.incrementAndGet(), total)
                    }
                }
            }
        }.awaitAll()
    }
}
