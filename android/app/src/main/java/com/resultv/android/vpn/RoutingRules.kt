package com.resultv.android.vpn

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

private const val TAG = "ResultV/Rules"
private const val FILE_NAME = "routing_rules.json"

/**
 * Top-level routing strategy.
 *
 * - [Global]: every packet from the device is sent through the proxy.
 * - [Smart]: only known-blocked resources go through the proxy; everything
 *   else stays direct. Backed by an Antizapret-style domain ruleset on
 *   desktop. The mobile build accepts the toggle but currently behaves the
 *   same as [Global] until the geosite ruleset is wired in.
 */
enum class RoutingMode { Global, Smart }

data class RoutingRulesState(
    val mode: RoutingMode = RoutingMode.Global,
    /** Domains that always bypass the proxy (resolved direct). */
    val domainExclusions: List<String> = listOf(
        "localhost", "127.0.0.1", "*.ru", "*.рф",
    ),
)

object RoutingRulesRepository {
    private val _state = MutableStateFlow(RoutingRulesState())
    val state: StateFlow<RoutingRulesState> = _state.asStateFlow()

    @Volatile private var file: File? = null

    @Synchronized
    fun init(ctx: Context) {
        if (file != null) return
        val f = File(ctx.filesDir, FILE_NAME)
        file = f
        _state.value = load(f)
    }

    @Synchronized
    fun setMode(mode: RoutingMode) = mutate { it.copy(mode = mode) }

    @Synchronized
    fun addDomain(domain: String) = mutate {
        val trimmed = domain.trim()
        if (trimmed.isEmpty() || trimmed in it.domainExclusions) it
        else it.copy(domainExclusions = it.domainExclusions + trimmed)
    }

    @Synchronized
    fun removeDomain(domain: String) = mutate {
        it.copy(domainExclusions = it.domainExclusions.filterNot { d -> d == domain })
    }

    private fun mutate(block: (RoutingRulesState) -> RoutingRulesState) {
        val next = block(_state.value)
        if (next == _state.value) return
        _state.value = next
        file?.let { save(it, next) }
    }

    private fun load(f: File): RoutingRulesState {
        if (!f.exists()) return RoutingRulesState()
        return try {
            val root = JSONObject(f.readText())
            val mode = RoutingMode.entries.firstOrNull { it.name == root.optString("mode") }
                ?: RoutingMode.Global
            val arr = root.optJSONArray("domainExclusions") ?: JSONArray()
            val domains = (0 until arr.length()).map { arr.getString(it) }
            RoutingRulesState(mode = mode, domainExclusions = domains)
        } catch (t: Throwable) {
            Log.w(TAG, "failed to read $f, starting empty", t)
            RoutingRulesState()
        }
    }

    private fun save(f: File, s: RoutingRulesState) {
        try {
            val arr = JSONArray()
            s.domainExclusions.forEach { arr.put(it) }
            val root = JSONObject()
                .put("mode", s.mode.name)
                .put("domainExclusions", arr)
            f.writeText(root.toString())
        } catch (t: Throwable) {
            Log.e(TAG, "failed to persist routing rules", t)
        }
    }
}
