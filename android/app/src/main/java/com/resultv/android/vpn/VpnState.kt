package com.resultv.android.vpn

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface VpnStatus {
    data object Idle : VpnStatus
    data object Connecting : VpnStatus
    data object Connected : VpnStatus
    data class Error(val message: String) : VpnStatus
}

object VpnState {
    private val _status = MutableStateFlow<VpnStatus>(VpnStatus.Idle)
    val status: StateFlow<VpnStatus> = _status.asStateFlow()

    internal fun set(s: VpnStatus) { _status.value = s }
}
