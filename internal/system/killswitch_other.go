// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

//go:build !windows

package system

import "fmt"

// StubKillSwitch is a no-op implementation for non-Windows platforms.
type StubKillSwitch struct{}

// NewKillSwitch creates a platform-specific kill switch.
func NewKillSwitch() KillSwitch {
	return &StubKillSwitch{}
}

func (ks *StubKillSwitch) Enable(proxyAddr string) error {
	return fmt.Errorf("kill switch not implemented on this platform")
}

func (ks *StubKillSwitch) Disable() error {
	return nil
}

func (ks *StubKillSwitch) IsEnabled() bool {
	return false
}

// DetectGPOConflict is a stub for non-Windows platforms.
func DetectGPOConflict() bool {
	return false
}
