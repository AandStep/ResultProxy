// Copyright (C) 2026 ResultV
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package config

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

const exportPrefix = "RESULTPROXY:"



type ExportableConfig struct {
	Version      int          `json:"version"`
	Proxies      []ProxyEntry `json:"proxies"`
	RoutingRules RoutingRules `json:"routingRules"`
}


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


func ImportConfig(input string) (*ExportableConfig, error) {
	input = strings.TrimSpace(input)

	
	if strings.HasPrefix(input, exportPrefix) {
		input = strings.TrimPrefix(input, exportPrefix)
	}

	data, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		
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



func MergeImport(existing AppConfig, imported *ExportableConfig) AppConfig {
	
	existing.RoutingRules = imported.RoutingRules

	
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
