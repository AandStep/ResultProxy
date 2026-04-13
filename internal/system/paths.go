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

//go:build !windows

package system

import (
	"os"
	"path/filepath"
)

func UserDataDir() string {
	newPath, _ := userDataPaths()
	return newPath
}

func WebviewUserDataPath() string {
	newPath, _ := webviewDataPaths()
	return newPath
}

func userDataPaths() (string, string) {
	appData := os.Getenv("APPDATA")
	if appData != "" {
		newPath := filepath.Join(appData, "ResultV")
		legacyPath := filepath.Join(appData, "ResultProxy")
		return newPath, legacyPath
	}
	home, _ := os.UserHomeDir()
	newPath := filepath.Join(home, ".config", "ResultV")
	legacyPath := filepath.Join(home, ".config", "ResultProxy")
	return newPath, legacyPath
}

func webviewDataPaths() (string, string) {
	newUserDataPath, legacyUserDataPath := userDataPaths()
	return filepath.Join(newUserDataPath, "webview"), filepath.Join(legacyUserDataPath, "webview")
}
