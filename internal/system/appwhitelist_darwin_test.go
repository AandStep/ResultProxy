//go:build darwin

package system

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBundleRoot(t *testing.T) {
	cases := map[string]string{
		"/Applications/Brave.app":                                  "/Applications/Brave.app",
		"/Applications/Brave.app/":                                 "/Applications/Brave.app",
		"/Applications/Brave.app/Contents/MacOS/Brave":             "/Applications/Brave.app",
		"/Applications/Visual Studio Code.app/Contents/Info.plist": "/Applications/Visual Studio Code.app",
		"/usr/bin/firefox":                                         "",
		"/Applications/Foo.application/x":                          "",
	}
	for in, want := range cases {
		if got := bundleRoot(in); got != want {
			t.Errorf("bundleRoot(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeAppEntryDarwinFallsBackToBundleName(t *testing.T) {
	// No Info.plist on disk -> falls back to "Brave".
	got := normalizeAppEntry("/Applications/Brave.app")
	if got != "Brave" {
		t.Errorf("normalizeAppEntry without plist = %q, want %q", got, "Brave")
	}
}

func TestNormalizeAppEntryDarwinReadsPlist(t *testing.T) {
	tmp := t.TempDir()
	bundle := filepath.Join(tmp, "Visual Studio Code.app")
	if err := os.MkdirAll(filepath.Join(bundle, "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Electron</string>
</dict>
</plist>`
	if err := os.WriteFile(filepath.Join(bundle, "Contents", "Info.plist"), []byte(plist), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := normalizeAppEntry(bundle); got != "Electron" {
		t.Errorf("normalizeAppEntry with plist = %q, want %q", got, "Electron")
	}
}

func TestNormalizeAppEntryDarwinNonBundle(t *testing.T) {
	if got := normalizeAppEntry("/usr/bin/curl"); got != "curl" {
		t.Errorf("normalizeAppEntry(/usr/bin/curl) = %q, want %q", got, "curl")
	}
}

func TestSearchInstalledAppFromFakeDir(t *testing.T) {
	// Build a fake Applications directory with "Google Chrome.app".
	tmp := t.TempDir()
	bundle := filepath.Join(tmp, "Google Chrome.app")
	if err := os.MkdirAll(filepath.Join(bundle, "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Google Chrome</string>
</dict>
</plist>`
	if err := os.WriteFile(filepath.Join(bundle, "Contents", "Info.plist"), []byte(plist), 0o644); err != nil {
		t.Fatal(err)
	}

	got := searchInstalledAppInDir("chrome", tmp)
	if got != "Google Chrome" {
		t.Errorf("searchInstalledAppInDir(%q) = %q, want %q", "chrome", got, "Google Chrome")
	}

	// Exact match also works.
	if got2 := searchInstalledAppInDir("Google Chrome", tmp); got2 != "Google Chrome" {
		t.Errorf("searchInstalledAppInDir(%q) = %q, want %q", "Google Chrome", got2, "Google Chrome")
	}

	// Unknown name returns empty string.
	if got3 := searchInstalledAppInDir("zzz_unknown", tmp); got3 != "" {
		t.Errorf("searchInstalledAppInDir(unknown) = %q, want empty", got3)
	}
}
