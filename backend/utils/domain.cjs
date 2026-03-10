/**
 * Normalizes a domain rule for matching.
 * Handles variants like "*.ru", ".ru", and "ru" by converting them to "ru".
 * @param {string} rule
 * @returns {string}
 */
function normalizeRule(rule) {
  if (!rule) return null;
  // Clean up: remove *. prefixes, leading/trailing dots and asterisks
  return rule
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "") // Remove protocol
    .split("/")[0] // Remove path
    .replace(/^\*+/, "") // Remove all leading asterisks
    .replace(/^\.+/, "") // Remove all leading dots
    .replace(/\*+$/, "") // Remove all trailing asterisks
    .replace(/\.+$/, ""); // Remove all trailing dots
}

/**
 * Checks if a hostname should be whitelisted (bypassed from proxy).
 *
 * Logic (Hierarchical Exceptions):
 * 1. Find all rules in the whitelist that match the hostname (either exact or as a suffix).
 * 2. If no rules match -> Return false (Proxy it).
 * 3. If matching rules are found:
 *    - If there is an EVEN number of unique hierarchical matches (e.g., ".ru" and "avito.ru"),
 *      then the more specific one acts as an exception to the more general one,
 *      resulting in a Proxy decision -> Return false.
 *    - If there is an ODD number of matching rules, the result is Bypass -> Return true.
 *
 * Example:
 * - Whitelist: [".ru"] -> "avito.ru" matches 1 rule -> Bypass (true)
 * - Whitelist: [".ru", "avito.ru"] -> "avito.ru" matches 2 rules -> Proxy (false)
 * - Whitelist: [".ru", "avito.ru", "m.avito.ru"] -> "m.avito.ru" matches 3 rules -> Bypass (true)
 *
 * @param {string} hostname
 * @param {string[]} whitelist
 * @returns {boolean} True if should bypass proxy, False if should use proxy.
 */
function isWhitelisted(hostname, whitelist) {
  if (
    !hostname ||
    !whitelist ||
    !Array.isArray(whitelist) ||
    whitelist.length === 0
  ) {
    return { isWhitelisted: false, matchingRules: [] };
  }

  const h = normalizeRule(hostname);
  if (!h) {
    return { isWhitelisted: false, matchingRules: [] };
  }

  // Normalize whitelist and remove duplicates
  const normalizedWhitelist = [
    ...new Set(whitelist.map(normalizeRule).filter(Boolean)),
  ];

  // Find all rules that match this hostname
  // A rule "ru" matches "yandex.ru" because "yandex.ru".endsWith(".ru")
  // A rule "yandex.ru" matches "yandex.ru" because exact match.
  const matchingRules = normalizedWhitelist.filter((rule) => {
    return h === rule || h.endsWith("." + rule);
  });

  if (matchingRules.length === 0) {
    return { isWhitelisted: false, matchingRules: [] };
  }

  // The number of matching rules determines the state (nested exceptions)
  // 1 match = Bypass
  // 2 matches = Proxy
  // 3 matches = Bypass
  // ...and so on.
  const result = matchingRules.length % 2 === 1;

  // Returning the debug info if needed
  return {
    isWhitelisted: result,
    matchingRules,
  };
}

// Keeping a simple wrapper for backward compatibility if used elsewhere
function isWhitelistedSimple(hostname, whitelist) {
  return isWhitelisted(hostname, whitelist).isWhitelisted;
}

/**
 * Returns a list of domains that are safe to put into the OS-level skip/bypass list.
 * A domain is NOT safe if:
 * 1. It should actually be proxied (isWhitelisted returns false).
 * 2. It's a bypass rule but has sub-exceptions in the whitelist that should be proxied.
 *
 * @param {string[]} whitelist
 * @returns {string[]}
 */
function getSafeOSWhitelist(whitelist) {
  if (!whitelist || !Array.isArray(whitelist)) return [];

  const normalized = [...new Set(whitelist.map(normalizeRule).filter(Boolean))];

  return normalized.filter((rule) => {
    // 1. Must be a bypass rule in the current bridge logic
    const { isWhitelisted: bypassStatus } = isWhitelisted(rule, whitelist);
    if (!bypassStatus) return false;

    // 2. Must NOT have any more specific child rules that would
    // invert the decision back to proxy (or further bypass).
    // If it has children, we MUST send traffic to the bridge to handle it.
    // A rule is "safe" if it's a bypass rule AND there are no more specific
    // rules that would change its bypass status.
    // We need to check if any child rule would cause the parent rule's decision to be inverted.
    const hasInvertingChild = normalized.some((other) => {
      // 'other' is a child of 'rule' if it ends with '.' + rule and is not the same rule
      if (other !== rule && other.endsWith("." + rule)) {
        // If 'rule' is a bypass, and 'other' (a child) is a proxy, then 'rule' is not safe.
        // If 'rule' is a bypass, and 'other' (a child) is also a bypass, then 'rule' is not safe
        // because the child would also be bypassed, but the OS-level rule would cover it.
        // The key is that if a child exists, the decision for the parent might be overridden
        // by the child's presence in the whitelist, making the OS-level rule potentially incorrect.
        // So, if any child exists, the parent rule is not safe for OS-level bypass.
        return true;
      }
      return false;
    });

    return !hasInvertingChild;
  });
}

module.exports = {
  isWhitelisted,
  normalizeRule,
  getSafeOSWhitelist,
};
