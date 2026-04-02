// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package config

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

const exportPrefix = "RESULTPROXY:"

// ExportableConfig is the structure exported/imported between devices.
// It intentionally omits machine-specific settings (autostart, killswitch).
type ExportableConfig struct {
	Version      int          `json:"version"`
	Proxies      []ProxyEntry `json:"proxies"`
	RoutingRules RoutingRules `json:"routingRules"`
}

// ExportConfig serializes the exportable portion of config to a Base64 string.
func ExportConfig(cfg AppConfig) (string, error) {
	export := ExportableConfig{
		Version:      1,
		Proxies:      cfg.Proxies,
		RoutingRules: cfg.RoutingRules,
	}

	data, err := json.Marshal(export)
	if err != nil {
		return "", fmt.Errorf("marshaling export: %w", err)
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return exportPrefix + encoded, nil
}

// ImportConfig parses a Base64-encoded config string and returns an ExportableConfig.
func ImportConfig(input string) (*ExportableConfig, error) {
	input = strings.TrimSpace(input)

	// Strip prefix if present.
	if strings.HasPrefix(input, exportPrefix) {
		input = strings.TrimPrefix(input, exportPrefix)
	}

	data, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		// Try URL-safe base64 as fallback.
		data, err = base64.URLEncoding.DecodeString(input)
		if err != nil {
			return nil, fmt.Errorf("decoding base64: %w", err)
		}
	}

	var export ExportableConfig
	if err := json.Unmarshal(data, &export); err != nil {
		return nil, fmt.Errorf("parsing import data: %w", err)
	}

	if err := validateImport(&export); err != nil {
		return nil, fmt.Errorf("validating import: %w", err)
	}

	return &export, nil
}

// MergeImport applies imported config onto existing config.
// Proxies are merged (no duplicates by ID), routing rules are replaced.
func MergeImport(existing AppConfig, imported *ExportableConfig) AppConfig {
	// Replace routing rules entirely.
	existing.RoutingRules = imported.RoutingRules

	// Merge proxies — add new ones, skip duplicates by ID.
	existingIDs := make(map[string]struct{}, len(existing.Proxies))
	for _, p := range existing.Proxies {
		existingIDs[p.ID] = struct{}{}
	}
	for _, p := range imported.Proxies {
		if _, exists := existingIDs[p.ID]; !exists {
			existing.Proxies = append(existing.Proxies, p)
		}
	}

	return existing
}

// validateImport checks that imported data is sane.
func validateImport(export *ExportableConfig) error {
	if export.Version < 1 {
		return fmt.Errorf("unsupported export version: %d", export.Version)
	}

	for i, p := range export.Proxies {
		if p.IP == "" && p.URI == "" {
			return fmt.Errorf("proxy %d: must have IP or URI", i)
		}
		if p.Port < 0 || p.Port > 65535 {
			return fmt.Errorf("proxy %d: invalid port %d", i, p.Port)
		}
	}

	validModes := map[string]bool{"global": true, "whitelist": true, "smart": true}
	if export.RoutingRules.Mode != "" && !validModes[export.RoutingRules.Mode] {
		return fmt.Errorf("invalid routing mode: %q", export.RoutingRules.Mode)
	}

	return nil
}
