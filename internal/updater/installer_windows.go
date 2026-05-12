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

//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

// currentPlatformKey returns the platforms map key for the current Windows binary.
func currentPlatformKey() string {
	if isInstalledBuild() {
		return "windows-amd64-installer"
	}
	return "windows-amd64-portable"
}

// isInstalledBuild returns true when the running exe lives under Program Files.
func isInstalledBuild() bool {
	exePath, err := os.Executable()
	if err != nil {
		return false
	}
	exePath = strings.ToLower(filepath.Clean(exePath))
	for _, env := range []string{"ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"} {
		pf := os.Getenv(env)
		if pf != "" && strings.HasPrefix(exePath, strings.ToLower(filepath.Clean(pf))+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

// installUpdate installs the downloaded artifact.
// For portable builds: writes a batch handover script and exits.
// For NSIS installer builds: runs the silent installer and exits.
// This function calls os.Exit on success and never returns normally.
func installUpdate(newExePath string) error {
	if isInstalledBuild() {
		return installNSIS(newExePath)
	}
	return installPortable(newExePath)
}

// installPortable performs the bat-handover update for the portable exe.
// It backs up the current exe, writes a .bat that copies the new exe over it,
// starts the bat asynchronously, then exits. The bat restarts the app after copying.
func installPortable(newExePath string) error {
	currentExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get current exe: %w", err)
	}
	currentExe = filepath.Clean(currentExe)

	batPath := filepath.Join(os.TempDir(), "resultv-update.bat")

	// Windows batch lines must use CRLF and paths must be double-quoted.
	// %%~f0 expands to the bat's own full path (for self-deletion).
	bat := "@echo off\r\n" +
		"timeout /t 2 /nobreak > NUL\r\n" +
		fmt.Sprintf("if exist \"%s.bak\" del /f /q \"%s.bak\"\r\n", currentExe, currentExe) +
		fmt.Sprintf("copy /Y \"%s\" \"%s.bak\" > NUL\r\n", currentExe, currentExe) +
		fmt.Sprintf("copy /Y \"%s\" \"%s\" > NUL\r\n", newExePath, currentExe) +
		fmt.Sprintf("del /f /q \"%s\"\r\n", newExePath) +
		fmt.Sprintf("start \"\" \"%s\"\r\n", currentExe) +
		"del \"%%~f0\"\r\n"

	if err := os.WriteFile(batPath, []byte(bat), 0o600); err != nil {
		return fmt.Errorf("write updater bat: %w", err)
	}

	cmd := exec.Command("cmd.exe", "/C", batPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		os.Remove(batPath)
		return fmt.Errorf("start updater bat: %w", err)
	}

	os.Exit(0)
	return nil // unreachable
}

// installNSIS runs the NSIS installer silently and exits the current process.
func installNSIS(installerPath string) error {
	cmd := exec.Command(installerPath, "/S")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("NSIS silent install: %w", err)
	}
	os.Exit(0)
	return nil // unreachable
}
