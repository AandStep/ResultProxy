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

//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ensureAdmin checks whether the process is running as root (UID 0).
// If not, it relaunches the same binary with elevated privileges using
// macOS Authorization Services (via osascript "do shell script … with
// administrator privileges"). The command is run synchronously so the
// elevated process inherits the user's WindowServer/GUI session and the
// application window appears normally. The original non-elevated process
// stays alive inside cmd.Run() until the app exits — it holds no locks
// and is otherwise harmless.
//
// If the user cancels the macOS credentials dialog, the function returns
// normally and the application continues to run without elevation.
func ensureAdmin() {
	if os.Getuid() == 0 {
		return
	}

	executable, err := os.Executable()
	if err != nil {
		return
	}
	if executable, err = filepath.EvalSymlinks(executable); err != nil {
		return
	}

	// Only elevate when running as a proper installed .app bundle.
	// When invoked by wails build / wails dev (bare binary, temp dirs,
	// or source-tree paths), skip elevation entirely so the build
	// toolchain does not write files as root.
	if !strings.Contains(executable, ".app/Contents/MacOS/") {
		return
	}

	// Build a properly shell-escaped argument list.
	allArgs := append([]string{executable}, os.Args[1:]...)
	shellParts := make([]string, len(allArgs))
	for i, a := range allArgs {
		// Single-quote escaping: replace every ' with '\''
		shellParts[i] = "'" + strings.ReplaceAll(a, "'", `'\''`) + "'"
	}

	// Run synchronously (no & or nohup) so that the elevated process is
	// launched inside the user's WindowServer/GUI session via
	// AuthorizationExecuteWithPrivileges. Detaching with nohup/& would
	// cut the process off from the window server and the window would
	// never appear.
	//
	// As a result, the original non-elevated process stays alive inside
	// cmd.Run() until the user closes the app, then exits via os.Exit(0).
	// That zombie holds no locks (it exits before wails.Run), so it is
	// harmless.
	shellCmd := strings.Join(shellParts, " ")

	// Embed the shell command inside an AppleScript double-quoted string.
	scriptStr := strings.ReplaceAll(shellCmd, `\`, `\\`)
	scriptStr = strings.ReplaceAll(scriptStr, `"`, `\"`)

	script := fmt.Sprintf(`do shell script "%s" with administrator privileges`, scriptStr)

	cmd := exec.Command("osascript", "-e", script)
	if err := cmd.Start(); err != nil {
		// Could not launch osascript — continue without elevation.
		return
	}
	// Exit immediately. osascript is reparented to launchd, continues
	// showing the credentials dialog, and then launches the elevated
	// process. Not waiting here prevents the non-elevated process from
	// appearing as a second instance in the Dock.
	os.Exit(0)
}
