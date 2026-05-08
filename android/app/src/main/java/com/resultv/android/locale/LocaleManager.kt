package com.resultv.android.locale

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import java.util.Locale

/**
 * Persists the user-chosen UI locale and applies it via Configuration override
 * on Activity attach. Pure DIY — we avoid pulling in androidx.appcompat just
 * for `AppCompatDelegate.setApplicationLocales`. Works back to API 26.
 *
 * Flow:
 *  - [setLocale] saves the code, calls [Activity.recreate] so the activity
 *    re-enters [Activity.attachBaseContext] with the new configuration.
 *  - [wrap] is called from `attachBaseContext(newBase)` — returns a context
 *    whose `Configuration.locales` is forced to the chosen locale.
 *  - [currentLocale] returns the saved code (or null = system default).
 *
 * Strings consumed via Compose `stringResource()` automatically pick the
 * right `values-<lang>/strings.xml` because Compose reads from the Activity
 * context, which is the wrapped one.
 */
object LocaleManager {
    private const val PREFS = "resultv_locale"
    private const val KEY_LOCALE = "locale"

    /** "EN", "RU", "ES", "DE", "FR", "ZH" — case-insensitive. null = system default. */
    fun currentLocale(context: Context): String? =
        prefs(context).getString(KEY_LOCALE, null)?.takeIf { it.isNotBlank() }

    /**
     * Save the chosen locale and recreate the activity. The activity's
     * `attachBaseContext` will then call [wrap] with the new value.
     * Pass `null` (or empty) to follow the system locale.
     */
    fun setLocale(activity: Activity, code: String?) {
        prefs(activity).edit().apply {
            if (code.isNullOrBlank()) remove(KEY_LOCALE)
            else putString(KEY_LOCALE, code.uppercase(Locale.ROOT))
            apply()
        }
        activity.recreate()
    }

    /**
     * Wrap a base context with the saved locale's configuration. Call from
     * `Activity.attachBaseContext(newBase)`. If no locale is saved, the
     * original context is returned unchanged.
     */
    fun wrap(base: Context): Context {
        val code = currentLocale(base) ?: return base
        val locale = Locale.forLanguageTag(code.lowercase(Locale.ROOT))
        Locale.setDefault(locale)
        val cfg = Configuration(base.resources.configuration)
        cfg.setLocale(locale)
        cfg.setLayoutDirection(locale)
        return base.createConfigurationContext(cfg)
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
