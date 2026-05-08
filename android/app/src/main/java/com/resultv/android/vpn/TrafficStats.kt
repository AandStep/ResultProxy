package com.resultv.android.vpn

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class TrafficSnapshot(
    val downloadBytes: Long = 0,
    val uploadBytes: Long = 0,
    val downloadBps: Long = 0,
    val uploadBps: Long = 0,
    /** Recent download bytes/sec samples, oldest → newest. Capped at HISTORY_SIZE. */
    val downloadHistory: List<Long> = emptyList(),
    val uploadHistory: List<Long> = emptyList(),
)

const val TRAFFIC_HISTORY_SIZE = 60

/**
 * Placeholder traffic-stats source. The desktop pulls these from sing-box's
 * `experimental.clash_api.statistic` plus a libbox `CommandClient`
 * subscription; on mobile that wiring is still TODO. UI consumes the flow as
 * if it were live so swapping the implementation later is invisible to
 * Compose code.
 */
object TrafficStats {
    private val _snapshot = MutableStateFlow(TrafficSnapshot())
    val snapshot: StateFlow<TrafficSnapshot> = _snapshot.asStateFlow()

    /** Reset counters when a new connection starts. */
    fun reset() {
        _snapshot.value = TrafficSnapshot()
    }
}
