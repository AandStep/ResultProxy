// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package system

import (
	"sync"

	"github.com/getlantern/systray"
)

// TrayCallbacks defines the actions the system tray can trigger back to the app.
type TrayCallbacks struct {
	OnShowWindow func()
	OnDisconnect func()
	OnQuit       func()
}

// Tray manages the system tray icon and context menu.
// Uses github.com/getlantern/systray — runs in a background goroutine.
// On Windows, this does NOT require the main thread (unlike macOS).
type Tray struct {
	mu        sync.Mutex
	icon      []byte
	callbacks TrayCallbacks
	running   bool

	// Menu items (set during onReady, accessed under mu).
	mStatus     *systray.MenuItem
	mShow       *systray.MenuItem
	mDisconnect *systray.MenuItem
	mQuit       *systray.MenuItem
}

// NewTray creates a new system tray manager.
// icon is the tray icon bytes (PNG or ICO format).
func NewTray(icon []byte, cb TrayCallbacks) *Tray {
	return &Tray{
		icon:      icon,
		callbacks: cb,
	}
}

// Start initializes the system tray in a background goroutine.
// Must be called after Wails startup (from OnStartup).
func (t *Tray) Start() {
	go systray.Run(t.onReady, t.onExit)
}

// Stop removes the tray icon. Call from OnShutdown.
func (t *Tray) Stop() {
	t.mu.Lock()
	running := t.running
	t.mu.Unlock()

	if running {
		systray.Quit()
	}
}

func (t *Tray) onReady() {
	t.mu.Lock()
	t.running = true
	t.mu.Unlock()

	// Set the tray icon and tooltip.
	if len(t.icon) > 0 {
		systray.SetIcon(t.icon)
	}
	systray.SetTitle("ResultProxy")
	systray.SetTooltip("ResultProxy — Отключено")

	// Build the context menu.
	t.mStatus = systray.AddMenuItem("⚪ Отключено", "Статус подключения")
	t.mStatus.Disable() // Status line is not clickable.

	systray.AddSeparator()

	t.mShow = systray.AddMenuItem("Показать окно", "Открыть окно ResultProxy")
	t.mDisconnect = systray.AddMenuItem("Отключить", "Отключить прокси")
	t.mDisconnect.Disable() // Disabled until connected.

	systray.AddSeparator()

	t.mQuit = systray.AddMenuItem("Выход", "Закрыть ResultProxy")

	// Event loop — handles menu item clicks.
	go t.eventLoop()
}

func (t *Tray) eventLoop() {
	for {
		select {
		case <-t.mShow.ClickedCh:
			if t.callbacks.OnShowWindow != nil {
				t.callbacks.OnShowWindow()
			}
		case <-t.mDisconnect.ClickedCh:
			if t.callbacks.OnDisconnect != nil {
				t.callbacks.OnDisconnect()
			}
		case <-t.mQuit.ClickedCh:
			if t.callbacks.OnQuit != nil {
				t.callbacks.OnQuit()
			}
			return
		}
	}
}

func (t *Tray) onExit() {
	t.mu.Lock()
	t.running = false
	t.mu.Unlock()
}

// SetConnected updates the tray to show connected state.
func (t *Tray) SetConnected(serverName string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.running || t.mStatus == nil {
		return
	}

	t.mStatus.SetTitle("🟢 " + serverName)
	systray.SetTooltip("ResultProxy — " + serverName)
	t.mDisconnect.Enable()
}

// SetDisconnected updates the tray to show disconnected state.
func (t *Tray) SetDisconnected() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.running || t.mStatus == nil {
		return
	}

	t.mStatus.SetTitle("⚪ Отключено")
	systray.SetTooltip("ResultProxy — Отключено")
	t.mDisconnect.Disable()
}

// SetKillSwitchActive shows the kill switch warning in the tray.
func (t *Tray) SetKillSwitchActive() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.running || t.mStatus == nil {
		return
	}

	t.mStatus.SetTitle("🔴 Kill Switch — интернет заблокирован")
	systray.SetTooltip("ResultProxy — Kill Switch активен")
}
