// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"resultproxy-wails/internal/adblock"
	"resultproxy-wails/internal/config"
	"resultproxy-wails/internal/logger"
	"resultproxy-wails/internal/proxy"
	"resultproxy-wails/internal/system"
)

// App is the main application struct — coordinator of all services.
// Bound methods on this struct become the frontend API via Wails bindings.
type App struct {
	ctx    context.Context
	cancel context.CancelFunc

	log        *logger.Logger
	crypto     *config.CryptoService
	config     *config.Manager
	proxy      *proxy.Manager
	adblock    *adblock.Blocker
	tray       *system.Tray
	killSwitch system.KillSwitch
	netmon     *system.NetMonitor

	// Embedded icon for the system tray (set by main).
	trayIcon []byte
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{
		log:     logger.New(),
		adblock: adblock.New(),
	}
}

// SetTrayIcon sets the icon bytes for the system tray (call before startup).
func (a *App) SetTrayIcon(icon []byte) {
	a.trayIcon = icon
}

// startup is called when the Wails app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx, a.cancel = context.WithCancel(ctx)

	// Wire up the logger to push events to the frontend.
	a.log.SetEmitter(func(eventName string, data any) {
		wailsRuntime.EventsEmit(a.ctx, eventName, data)
	})

	a.log.Info("ResultProxy запускается...")

	// Initialize crypto service.
	cs, err := config.NewCryptoService()
	if err != nil {
		a.log.Error(fmt.Sprintf("Ошибка инициализации шифрования: %v", err))
		return
	}
	a.crypto = cs

	// Initialize config manager.
	a.config = config.NewManager(cs)
	userDataPath := a.getUserDataPath()
	if err := a.config.Init(userDataPath); err != nil {
		a.log.Error(fmt.Sprintf("Ошибка загрузки конфигурации: %v", err))
	} else {
		a.log.Success("Конфигурация загружена")
	}

	// Initialize proxy manager.
	a.proxy = proxy.NewManager(a.log)
	a.proxy.Init(a.ctx)

	// Load blocked domain lists for smart mode.
	rootDir := a.getAppRootDir()
	a.proxy.LoadBlockedLists(
		filepath.Join(rootDir, "list-general.txt"),
		filepath.Join(rootDir, "list-google.txt"),
	)

	// Load adblock cache.
	if err := a.adblock.LoadFromCache(userDataPath); err != nil {
		a.log.Warning(fmt.Sprintf("Кэш AdBlock не загружен: %v", err))
	}

	// Initialize kill switch.
	a.killSwitch = system.NewKillSwitch()

	// Initialize network monitor.
	a.netmon = system.NewNetMonitor(func(status system.NetworkStatus) {
		wailsRuntime.EventsEmit(a.ctx, "network:status", status)
		if status.Online {
			a.log.Info("[СЕТЬ] Интернет-соединение восстановлено")
		} else {
			a.log.Warning("[СЕТЬ] Интернет-соединение потеряно")
		}
	})
	a.netmon.Start(a.ctx)

	// Initialize system tray.
	a.tray = system.NewTray(a.trayIcon, system.TrayCallbacks{
		OnShowWindow: func() {
			wailsRuntime.WindowShow(a.ctx)
			wailsRuntime.WindowSetAlwaysOnTop(a.ctx, true)
			wailsRuntime.WindowSetAlwaysOnTop(a.ctx, false)
		},
		OnDisconnect: func() {
			if err := a.Disconnect(); err != nil {
				a.log.Error(fmt.Sprintf("Ошибка отключения из трея: %v", err))
			}
		},
		OnQuit: func() {
			wailsRuntime.Quit(a.ctx)
		},
	})
	a.tray.Start()

	// Check for GPO conflicts.
	if system.DetectGPOConflict() {
		a.log.Warning("[СИСТЕМА] Обнаружен конфликт с групповой политикой (GPO). Настройки прокси могут быть переопределены.")
		wailsRuntime.EventsEmit(a.ctx, "system:gpo-conflict", true)
	}

	a.log.Success("ResultProxy готов к работе")
}

// shutdown is called when the Wails app is closing.
func (a *App) shutdown(ctx context.Context) {
	a.log.Info("ResultProxy завершает работу...")

	// Stop network monitor.
	if a.netmon != nil {
		a.netmon.Stop()
	}

	// Stop system tray.
	if a.tray != nil {
		a.tray.Stop()
	}

	// Disable kill switch if active.
	if a.killSwitch != nil && a.killSwitch.IsEnabled() {
		_ = a.killSwitch.Disable()
	}

	// Critical: clean up proxy and system proxy settings.
	if a.proxy != nil {
		a.proxy.Shutdown()
	}

	if a.cancel != nil {
		a.cancel()
	}
}

// --- Bound methods (frontend API) ---

// GetConfig returns the current application config.
func (a *App) GetConfig() (config.AppConfig, error) {
	if a.config == nil {
		return config.DefaultConfig(), nil
	}
	return a.config.GetConfig(), nil
}

// SaveConfig saves the application config.
func (a *App) SaveConfig(cfg config.AppConfig) error {
	if a.config == nil {
		return fmt.Errorf("config manager not initialized")
	}
	if err := a.config.SaveConfig(cfg); err != nil {
		a.log.Error(fmt.Sprintf("Ошибка сохранения конфигурации: %v", err))
		return err
	}
	a.log.Success("Конфигурация сохранена")
	return nil
}

// Connect establishes a proxy connection.
func (a *App) Connect(proxyDTO proxy.ProxyConfig, rules config.RoutingRules,
	killSwitch, adBlock bool) (proxy.ConnectResultDTO, error) {

	if a.proxy == nil {
		return proxy.ConnectResultDTO{Success: false, Message: "Proxy manager not initialized"}, nil
	}

	cfg := a.config.GetConfig()
	mode := proxy.ProxyMode(cfg.Settings.Mode)

	result := a.proxy.Connect(
		a.ctx,
		proxyDTO,
		mode,
		proxy.RoutingMode(rules.Mode),
		rules.Whitelist,
		rules.AppWhitelist,
		killSwitch,
		adBlock,
	)

	// Update tray and emit events on success.
	if result.Success {
		serverName := fmt.Sprintf("%s:%d", proxyDTO.IP, proxyDTO.Port)
		if a.tray != nil {
			a.tray.SetConnected(serverName)
		}
		wailsRuntime.EventsEmit(a.ctx, "proxy:connected", proxyDTO)
	}

	return result, nil
}

// Disconnect stops the proxy connection.
func (a *App) Disconnect() error {
	if a.proxy == nil {
		return nil
	}
	err := a.proxy.Disconnect()
	if err == nil {
		if a.tray != nil {
			a.tray.SetDisconnected()
		}
		wailsRuntime.EventsEmit(a.ctx, "proxy:disconnected", nil)
	}
	return err
}

// GetStatus returns the current proxy status.
func (a *App) GetStatus() proxy.StatusDTO {
	if a.proxy == nil {
		return proxy.StatusDTO{Mode: proxy.ProxyModeProxy}
	}
	return a.proxy.GetStatus()
}

// SetMode switches the proxy mode (proxy/tunnel).
func (a *App) SetMode(mode string) error {
	if a.proxy == nil {
		return fmt.Errorf("proxy manager not initialized")
	}
	return a.proxy.SetMode(proxy.ProxyMode(mode))
}

// GetMode returns the current proxy mode.
func (a *App) GetMode() string {
	if a.proxy == nil {
		return "proxy"
	}
	return string(a.proxy.GetMode())
}

// PingProxy tests proxy server reachability.
func (a *App) PingProxy(ip string, port int) proxy.PingResultDTO {
	if a.proxy == nil {
		return proxy.PingResultDTO{}
	}
	return a.proxy.Ping(ip, port)
}

// GetLogs returns paginated log entries.
func (a *App) GetLogs(page, size int) logger.LogPage {
	return a.log.GetLogs(page, size)
}

// ToggleKillSwitch enables/disables the kill switch.
func (a *App) ToggleKillSwitch(enable bool) error {
	if a.proxy == nil {
		return fmt.Errorf("proxy manager not initialized")
	}

	// Use the enhanced firewall-based kill switch if admin.
	if enable && a.killSwitch != nil {
		status := a.proxy.GetStatus()
		proxyAddr := ""
		if status.CurrentProxy != nil {
			proxyAddr = fmt.Sprintf("%s:%d", status.CurrentProxy.IP, status.CurrentProxy.Port)
		}
		if err := a.killSwitch.Enable(proxyAddr); err != nil {
			a.log.Warning(fmt.Sprintf("[KILL SWITCH] Firewall недоступен, используем fallback: %v", err))
			// Fallback to dead-proxy kill switch in proxy manager.
			return a.proxy.ToggleKillSwitch(enable)
		}
		if a.tray != nil {
			a.tray.SetKillSwitchActive()
		}
		a.log.Warning("[KILL SWITCH] Активирована полная блокировка интернета (firewall)")
		return nil
	}

	if !enable && a.killSwitch != nil && a.killSwitch.IsEnabled() {
		if err := a.killSwitch.Disable(); err != nil {
			a.log.Error(fmt.Sprintf("[KILL SWITCH] Ошибка отключения: %v", err))
		}
		a.log.Info("[KILL SWITCH] Деактивирован")
	}

	return a.proxy.ToggleKillSwitch(enable)
}

// ToggleAdBlock enables/disables ad blocking.
func (a *App) ToggleAdBlock(enable bool) error {
	if a.config == nil {
		return fmt.Errorf("config manager not initialized")
	}
	cfg := a.config.GetConfig()
	cfg.Settings.AdBlock = enable
	return a.config.SaveConfig(cfg)
}

// SetAutostart enables/disables autostart.
func (a *App) SetAutostart(enable bool) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("getting executable path: %w", err)
	}
	if enable {
		if err := system.EnableAutostart(exe); err != nil {
			a.log.Error(fmt.Sprintf("[СИСТЕМА] Ошибка создания автозапуска: %v", err))
			return err
		}
		a.log.Success("[СИСТЕМА] Автозапуск включен")
	} else {
		if err := system.DisableAutostart(); err != nil {
			a.log.Warning(fmt.Sprintf("[СИСТЕМА] Ошибка удаления автозапуска: %v", err))
			return err
		}
		a.log.Info("[СИСТЕМА] Автозапуск отключен")
	}
	return nil
}

// IsAutostartEnabled checks if autostart is configured.
func (a *App) IsAutostartEnabled() bool {
	return system.IsAutostartEnabled()
}

// UpdateRules updates routing rules.
func (a *App) UpdateRules(rules config.RoutingRules) error {
	if a.config == nil {
		return fmt.Errorf("config manager not initialized")
	}
	return a.config.UpdateRoutingRules(rules)
}

// ExportConfig exports the current config as a shareable string.
func (a *App) ExportConfig() (string, error) {
	if a.config == nil {
		return "", fmt.Errorf("config manager not initialized")
	}
	cfg := a.config.GetConfig()
	result, err := config.ExportConfig(cfg)
	if err != nil {
		a.log.Error(fmt.Sprintf("Ошибка экспорта: %v", err))
		return "", err
	}
	a.log.Success("Конфигурация экспортирована")
	return result, nil
}

// ImportConfig imports config from a Base64 string.
func (a *App) ImportConfig(data string) error {
	if a.config == nil {
		return fmt.Errorf("config manager not initialized")
	}
	imported, err := config.ImportConfig(data)
	if err != nil {
		a.log.Error(fmt.Sprintf("Ошибка импорта: %v", err))
		return err
	}
	existing := a.config.GetConfig()
	merged := config.MergeImport(existing, imported)
	if err := a.config.SaveConfig(merged); err != nil {
		return err
	}
	a.log.Success(fmt.Sprintf("Импортировано %d прокси", len(imported.Proxies)))
	wailsRuntime.EventsEmit(a.ctx, "config:updated", merged)
	return nil
}

// GetPlatform returns the current platform identifier.
func (a *App) GetPlatform() string {
	return "windows"
}

// IsAdmin checks if the app is running with admin privileges.
func (a *App) IsAdmin() bool {
	return system.IsAdmin()
}

// RestartAsAdmin restarts the app with elevated privileges.
func (a *App) RestartAsAdmin() error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("getting executable path: %w", err)
	}
	return system.RestartAsAdmin(exe)
}

// GetNetworkTraffic returns current network I/O stats.
func (a *App) GetNetworkTraffic() system.TrafficStats {
	return system.GetNetworkTraffic()
}

// GetNetworkStatus returns current internet connectivity status.
func (a *App) GetNetworkStatus() system.NetworkStatus {
	if a.netmon == nil {
		return system.NetworkStatus{Online: true}
	}
	return a.netmon.GetStatus()
}

// SyncProxies updates the proxy list (used by tray menu).
func (a *App) SyncProxies(proxies []config.ProxyEntry) error {
	if a.config == nil {
		return fmt.Errorf("config manager not initialized")
	}
	cfg := a.config.GetConfig()
	cfg.Proxies = proxies
	return a.config.SaveConfig(cfg)
}

// DetectCountry determines country by IP address via external API.
func (a *App) DetectCountry(ip string) (string, error) {
	// Simple HTTP client to fetch country code from ip-api
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,countryCode", ip))
	if err != nil {
		return "Unknown", err
	}
	defer resp.Body.Close()

	var result struct {
		Status      string `json:"status"`
		CountryCode string `json:"countryCode"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "Unknown", err
	}

	if result.Status == "success" && result.CountryCode != "" {
		return strings.ToLower(result.CountryCode), nil
	}

	return "Unknown", nil
}

// --- Helpers ---

func (a *App) getUserDataPath() string {
	appData := os.Getenv("APPDATA")
	if appData != "" {
		return filepath.Join(appData, "ResultProxy")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "ResultProxy")
}

func (a *App) getAppRootDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
