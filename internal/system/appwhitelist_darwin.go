// Copyright (C) 2026 ResultV
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

//go:build darwin

package system

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var bundleExecKeyRe = regexp.MustCompile(
	`(?s)<key>\s*CFBundleExecutable\s*</key>\s*<string>\s*([^<\s][^<]*?)\s*</string>`,
)

// normalizeAppEntry on macOS resolves an .app bundle (or a path inside one)
// to the actual binary basename that appears in process paths. For non-bundle
// inputs it falls back to the basename.
//
// Resolution order:
//  1. If s looks like a bundle path (contains ".app"), read Contents/Info.plist
//     and pull CFBundleExecutable. Handles renames like
//     "Visual Studio Code.app" -> "Electron".
//  2. If s is a bare name (e.g. "Chrome", "safari"), search the standard
//     application directories for a matching .app bundle. This lets users
//     type common short names like "Chrome" and resolve the real bundle
//     ("Google Chrome.app" → binary "Google Chrome").
//  3. Fall back to the raw basename.
func normalizeAppEntry(s string) string {
	if bundle := bundleRoot(s); bundle != "" {
		if exe, ok := bundleExecutableFromPlist(bundle); ok {
			return exe
		}
		base := filepath.Base(bundle)
		return strings.TrimSuffix(base, ".app")
	}
	// Try to resolve a bare name against installed .app bundles so that
	// inputs like "chrome" find "Google Chrome.app" → binary "Google Chrome".
	if found := searchInstalledApp(s); found != "" {
		return found
	}
	return basenameNoExt(s)
}

// bundleRoot returns the .app directory path for s, or "" if s does not
// reference an .app bundle. Handles both "/Applications/Foo.app" and a deep
// path inside the bundle.
func bundleRoot(s string) string {
	idx := strings.Index(s, ".app")
	if idx == -1 {
		return ""
	}
	end := idx + len(".app")
	// Accept ".app" at end of string, followed by '/', or followed by other
	// characters that form a parent path (e.g., ".app/Contents/...").
	if end < len(s) && s[end] != '/' {
		return ""
	}
	return s[:end]
}

// searchInstalledApp looks for an .app bundle in the standard macOS application
// directories whose bundle directory name case-insensitively contains name as a
// substring. Returns the CFBundleExecutable (or bundle name without .app) of
// the first match, or "" if none found.
//
// This lets users type "Chrome" and resolve it to "Google Chrome" (the binary
// inside Google Chrome.app) without knowing the exact bundle name.
func searchInstalledApp(name string) string {
	home, _ := os.UserHomeDir()
	dirs := []string{
		"/Applications",
		filepath.Join(home, "Applications"),
		"/System/Applications",
	}
	for _, dir := range dirs {
		if result := searchInstalledAppInDir(name, dir); result != "" {
			return result
		}
	}
	return ""
}

// searchInstalledAppInDir scans a single directory for a matching .app bundle.
// Extracted for testability.
//
// Matching rules (all case-insensitive):
//   - Exact match:  bundleName == name  (e.g., "Safari" == "Safari")
//   - Word match:   name equals one whole space-delimited word in bundleName
//     (e.g., "Chrome" matches "Google Chrome" because "chrome" is a word in it)
//
// Single-character inputs are ignored to avoid false positives.
func searchInstalledAppInDir(name, dir string) string {
	if len(name) < 2 {
		return ""
	}
	lower := strings.ToLower(name)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".app") {
			continue
		}
		bundleName := strings.TrimSuffix(e.Name(), ".app")
		lowerBundle := strings.ToLower(bundleName)
		matched := lowerBundle == lower
		if !matched {
			for _, word := range strings.Fields(lowerBundle) {
				if word == lower {
					matched = true
					break
				}
			}
		}
		if matched {
			bundlePath := filepath.Join(dir, e.Name())
			if exe, ok := bundleExecutableFromPlist(bundlePath); ok {
				return exe
			}
			return bundleName
		}
	}
	return ""
}

func bundleExecutableFromPlist(bundle string) (string, bool) {
	data, err := os.ReadFile(filepath.Join(bundle, "Contents", "Info.plist"))
	if err != nil {
		return "", false
	}
	m := bundleExecKeyRe.FindSubmatch(data)
	if len(m) < 2 {
		return "", false
	}
	name := strings.TrimSpace(string(m[1]))
	if name == "" {
		return "", false
	}
	return name, true
}
