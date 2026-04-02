// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

//go:build windows

package system

import (
	"fmt"
	"os/exec"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const taskName = "ResultProxyAutostart"

// EnableAutostart creates a scheduled task that runs the app at logon
// with highest privileges (RUNASADMIN). Requires admin rights.
// Port of windows.cjs enableTaskAutostart().
func EnableAutostart(exePath string, args ...string) error {
	if !IsAdmin() {
		return fmt.Errorf("требуются права администратора для создания задачи в планировщике")
	}

	argsStr := ""
	if len(args) > 0 {
		argsStr = " " + strings.Join(args, " ")
	}

	// schtasks /create with HIGHEST privilege level.
	taskCmd := fmt.Sprintf(`\"%s\"%s`, strings.ReplaceAll(exePath, "/", "\\"), argsStr)
	cmd := exec.Command("schtasks",
		"/create",
		"/tn", taskName,
		"/tr", taskCmd,
		"/sc", "ONLOGON",
		"/rl", "HIGHEST",
		"/f",
	)

	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("создание задачи schtasks: %s: %w", string(out), err)
	}

	return nil
}

// DisableAutostart removes the scheduled task.
func DisableAutostart() error {
	cmd := exec.Command("schtasks", "/delete", "/tn", taskName, "/f")
	_ = cmd.Run() // Ignore errors (task might not exist).
	return nil
}

// IsAutostartEnabled checks if the scheduled task exists.
func IsAutostartEnabled() bool {
	cmd := exec.Command("schtasks", "/query", "/tn", taskName)
	return cmd.Run() == nil
}

// SetRunAsAdminFlag sets/removes the RUNASADMIN compatibility flag in the registry.
// Port of windows.cjs setRunAsAdminFlag().
func SetRunAsAdminFlag(exePath string, enable bool) error {
	regPath := `Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers`

	key, err := registry.OpenKey(registry.CURRENT_USER, regPath, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		// Try to create the key if it doesn't exist.
		key, _, err = registry.CreateKey(registry.CURRENT_USER, regPath, registry.SET_VALUE)
		if err != nil {
			return fmt.Errorf("opening AppCompatFlags registry key: %w", err)
		}
	}
	defer key.Close()

	if enable {
		return key.SetStringValue(exePath, "~ RUNASADMIN")
	}

	_ = key.DeleteValue(exePath) // Ignore error if value doesn't exist.
	return nil
}
