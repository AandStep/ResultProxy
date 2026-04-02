// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

//go:build !windows

package system

import "fmt"

// EnableAutostart is a stub for non-Windows platforms.
func EnableAutostart(exePath string, args ...string) error {
	return fmt.Errorf("autostart not implemented on this platform")
}

// DisableAutostart is a stub for non-Windows platforms.
func DisableAutostart() error {
	return nil
}

// IsAutostartEnabled is a stub for non-Windows platforms.
func IsAutostartEnabled() bool {
	return false
}

// SetRunAsAdminFlag is a stub for non-Windows platforms.
func SetRunAsAdminFlag(exePath string, enable bool) error {
	return nil
}
