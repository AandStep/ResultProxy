// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package proxy

import (
	"bufio"
	"os"
	"strings"
	"sync"
)

// RoutingMode determines how traffic is routed.
type RoutingMode string

const (
	ModeGlobal    RoutingMode = "global"    // all traffic through proxy
	ModeWhitelist RoutingMode = "whitelist" // only non-whitelisted through proxy
	ModeSmart     RoutingMode = "smart"     // only blocked resources through proxy
)

// WhitelistResult holds the outcome of a whitelist check.
type WhitelistResult struct {
	IsWhitelisted bool     // true = bypass proxy (go direct)
	MatchingRules []string // rules that matched
}

// Router implements hierarchical domain whitelist matching and smart routing.
// Port of domain.cjs + blocked.cjs logic.
type Router struct {
	mu             sync.RWMutex
	blockedDomains []string
}

// NewRouter creates a Router and loads blocked domain lists.
func NewRouter() *Router {
	return &Router{
		blockedDomains: defaultBlockedDomains(),
	}
}

// LoadBlockedLists loads additional blocked domains from text files.
func (r *Router) LoadBlockedLists(paths ...string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range paths {
		domains := loadDomainFile(p)
		for _, d := range domains {
			if !r.containsBlocked(d) {
				r.blockedDomains = append(r.blockedDomains, d)
			}
		}
	}
}

// IsWhitelisted checks if a hostname should bypass the proxy.
//
// Hierarchical Exceptions logic (port of domain.cjs):
//   - Find all rules matching hostname (exact or suffix match).
//   - 0 matches → proxy (false)
//   - Odd matches → bypass (true)
//   - Even matches → proxy (false)
//
// Example:
//   - Whitelist: [".ru"]                     → "avito.ru" matches 1 → bypass
//   - Whitelist: [".ru", "avito.ru"]         → "avito.ru" matches 2 → proxy
//   - Whitelist: [".ru", "avito.ru", "m.avito.ru"] → "m.avito.ru" matches 3 → bypass
func (r *Router) IsWhitelisted(hostname string, whitelist []string) WhitelistResult {
	if hostname == "" || len(whitelist) == 0 {
		return WhitelistResult{IsWhitelisted: false, MatchingRules: nil}
	}

	h := normalizeRule(hostname)
	if h == "" {
		return WhitelistResult{IsWhitelisted: false, MatchingRules: nil}
	}

	// Normalize and deduplicate whitelist.
	seen := make(map[string]struct{}, len(whitelist))
	normalized := make([]string, 0, len(whitelist))
	for _, rule := range whitelist {
		n := normalizeRule(rule)
		if n == "" {
			continue
		}
		if _, exists := seen[n]; !exists {
			seen[n] = struct{}{}
			normalized = append(normalized, n)
		}
	}

	// Find all matching rules.
	var matching []string
	for _, rule := range normalized {
		if h == rule || strings.HasSuffix(h, "."+rule) {
			matching = append(matching, rule)
		}
	}

	if len(matching) == 0 {
		return WhitelistResult{IsWhitelisted: false, MatchingRules: nil}
	}

	// Odd count → bypass, even count → proxy.
	return WhitelistResult{
		IsWhitelisted: len(matching)%2 == 1,
		MatchingRules: matching,
	}
}

// ShouldProxy determines if traffic for hostname should go through the proxy.
// This is the main routing decision function used by the proxy engine.
func (r *Router) ShouldProxy(hostname string, mode RoutingMode, whitelist []string) (useProxy bool, reason string) {
	result := r.IsWhitelisted(hostname, whitelist)

	switch mode {
	case ModeSmart:
		if !result.IsWhitelisted && len(result.MatchingRules) > 0 {
			return true, "Nested exception: [" + strings.Join(result.MatchingRules, ", ") + "]"
		}
		blocked := r.IsBlockedDomain(hostname)
		if result.IsWhitelisted {
			if blocked {
				return true, "Blocked resource in Smart mode"
			}
			return false, "Bypass (Whitelisted)"
		}
		if blocked {
			return true, "Blocked resource (No match)"
		}
		return false, "Direct (Not blocked)"

	case ModeWhitelist:
		fallthrough
	default: // ModeGlobal
		if result.IsWhitelisted {
			return false, "Whitelisted (Bypass)"
		}
		return true, "Not whitelisted (Proxy)"
	}
}

// IsBlockedDomain checks if hostname is in the blocked domains list (for smart mode).
// Uses substring matching to cover subdomains (e.g., "ytimg.com" blocks "i.ytimg.com").
func (r *Router) IsBlockedDomain(hostname string) bool {
	if hostname == "" {
		return false
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	h := strings.ToLower(hostname)
	for _, d := range r.blockedDomains {
		if strings.Contains(h, d) {
			return true
		}
	}
	return false
}

// GetSafeOSWhitelist returns domains safe for OS-level proxy bypass.
// A domain is safe only if it's a bypass rule AND has no child rules
// that would invert the decision (port of getSafeOSWhitelist from domain.cjs).
func (r *Router) GetSafeOSWhitelist(whitelist []string) []string {
	if len(whitelist) == 0 {
		return nil
	}

	// Normalize and deduplicate.
	seen := make(map[string]struct{}, len(whitelist))
	normalized := make([]string, 0, len(whitelist))
	for _, rule := range whitelist {
		n := normalizeRule(rule)
		if n == "" {
			continue
		}
		if _, exists := seen[n]; !exists {
			seen[n] = struct{}{}
			normalized = append(normalized, n)
		}
	}

	var safe []string
	for _, rule := range normalized {
		// Must be a bypass rule.
		result := r.IsWhitelisted(rule, whitelist)
		if !result.IsWhitelisted {
			continue
		}

		// Must not have any child rules that could invert.
		hasChild := false
		for _, other := range normalized {
			if other != rule && strings.HasSuffix(other, "."+rule) {
				hasChild = true
				break
			}
		}
		if !hasChild {
			safe = append(safe, rule)
		}
	}
	return safe
}

// GetBlockedDomains returns the current blocked domains list.
func (r *Router) GetBlockedDomains() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]string, len(r.blockedDomains))
	copy(result, r.blockedDomains)
	return result
}

// --- helpers ---

// normalizeRule cleans up a domain rule for matching.
// Handles variants like "*.ru", ".ru", "https://example.com/path" → "example.com".
func normalizeRule(rule string) string {
	if rule == "" {
		return ""
	}
	r := strings.TrimSpace(rule)
	r = strings.ToLower(r)

	// Remove protocol.
	if idx := strings.Index(r, "://"); idx >= 0 {
		r = r[idx+3:]
	}
	// Remove path.
	if idx := strings.IndexByte(r, '/'); idx >= 0 {
		r = r[:idx]
	}
	// Remove leading wildcards and dots.
	r = strings.TrimLeft(r, "*.")
	// Remove trailing wildcards and dots.
	r = strings.TrimRight(r, "*.")

	return r
}

func (r *Router) containsBlocked(domain string) bool {
	for _, d := range r.blockedDomains {
		if d == domain {
			return true
		}
	}
	return false
}

func defaultBlockedDomains() []string {
	return []string{
		"instagram.com",
		"facebook.com",
		"twitter.com",
		"x.com",
		"t.me",
		"discord.com",
		"netflix.com",
	}
}

func loadDomainFile(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var domains []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		line = strings.ToLower(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			domains = append(domains, line)
		}
	}
	return domains
}
