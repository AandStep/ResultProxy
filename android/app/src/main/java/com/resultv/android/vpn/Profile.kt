package com.resultv.android.vpn

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

private const val TAG = "ResultV/Profiles"
private const val FILE_NAME = "profiles.json"

/**
 * A profile carries either a source URI (URL-pasted imports, share links)
 * or a parsed sing-box ProxyEntry JSON (subscription imports built from
 * Xray JSON, where there is no original URI to round-trip). At least one
 * is populated; Connect prefers entryJson when present.
 */
data class Profile(
    val id: String,
    val name: String,
    val uri: String = "",
    val entryJson: String = "",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("uri", uri)
        .put("entryJson", entryJson)

    companion object {
        fun fromJson(o: JSONObject) = Profile(
            id = o.getString("id"),
            name = o.getString("name"),
            uri = o.optString("uri"),
            entryJson = o.optString("entryJson"),
        )

        fun fromUri(name: String, uri: String) = Profile(
            id = UUID.randomUUID().toString(),
            name = name.ifBlank { "Untitled" },
            uri = uri,
        )

        fun fromEntryJson(name: String, entryJson: String) = Profile(
            id = UUID.randomUUID().toString(),
            name = name.ifBlank { "Untitled" },
            entryJson = entryJson,
        )
    }
}

data class ProfilesState(
    val profiles: List<Profile> = emptyList(),
    val activeId: String? = null,
) {
    val active: Profile? get() = profiles.firstOrNull { it.id == activeId }
}

/**
 * Single-process JSON-backed profile store. All access is synchronized; the
 * file is small (URIs + names) so we always write the whole document.
 */
object ProfileRepository {
    private val _state = MutableStateFlow(ProfilesState())
    val state: StateFlow<ProfilesState> = _state.asStateFlow()

    @Volatile private var file: File? = null

    @Synchronized
    fun init(ctx: Context) {
        if (file != null) return
        val f = File(ctx.filesDir, FILE_NAME)
        file = f
        _state.value = load(f)
    }

    @Synchronized
    fun add(profile: Profile) = mutate { s ->
        val list = s.profiles + profile
        s.copy(profiles = list, activeId = s.activeId ?: profile.id)
    }

    @Synchronized
    fun remove(id: String) = mutate { s ->
        val list = s.profiles.filterNot { it.id == id }
        val active = if (s.activeId == id) list.firstOrNull()?.id else s.activeId
        s.copy(profiles = list, activeId = active)
    }

    @Synchronized
    fun setActive(id: String) = mutate { s ->
        if (s.profiles.none { it.id == id }) s else s.copy(activeId = id)
    }

    private fun mutate(block: (ProfilesState) -> ProfilesState) {
        val next = block(_state.value)
        if (next === _state.value) return
        _state.value = next
        file?.let { save(it, next) }
    }

    private fun load(f: File): ProfilesState {
        if (!f.exists()) return ProfilesState()
        return try {
            val root = JSONObject(f.readText())
            val arr = root.optJSONArray("profiles") ?: JSONArray()
            val list = (0 until arr.length()).map { Profile.fromJson(arr.getJSONObject(it)) }
            ProfilesState(profiles = list, activeId = root.optString("activeId").takeIf { it.isNotEmpty() })
        } catch (t: Throwable) {
            Log.w(TAG, "failed to read $f, starting empty", t)
            ProfilesState()
        }
    }

    private fun save(f: File, s: ProfilesState) {
        try {
            val arr = JSONArray()
            s.profiles.forEach { arr.put(it.toJson()) }
            val root = JSONObject()
                .put("profiles", arr)
                .put("activeId", s.activeId ?: JSONObject.NULL)
            f.writeText(root.toString())
        } catch (t: Throwable) {
            Log.e(TAG, "failed to persist profiles", t)
        }
    }
}
