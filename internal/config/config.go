// Copyright (C) 2026 ResultProxy
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
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)


type RoutingRules struct {
	Mode         string   `json:"mode"`         
	Whitelist    []string `json:"whitelist"`     
	AppWhitelist []string `json:"appWhitelist"`  
}


type ProxyEntry struct {
	ID       string `json:"id"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Type     string `json:"type"`     
	Username string `json:"username"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Country  string `json:"country"`
	
	URI             string          `json:"uri,omitempty"`
	Extra           json.RawMessage `json:"extra,omitempty"`
	Provider        string          `json:"provider,omitempty"`
	SubscriptionURL string          `json:"subscriptionUrl,omitempty"`
}


type Subscription struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	
	TrafficUpload   int64 `json:"trafficUpload,omitempty"`
	TrafficDownload int64 `json:"trafficDownload,omitempty"`
	TrafficTotal    int64 `json:"trafficTotal,omitempty"` 
	ExpireUnix      int64 `json:"expireUnix,omitempty"`     
	
	IconURL string `json:"iconUrl,omitempty"`
}


type AppSettings struct {
	Autostart           bool   `json:"autostart"`
	KillSwitch          bool   `json:"killswitch"`
	AdBlock             bool   `json:"adblock"`
	DisableQUIC         bool   `json:"disableQuic,omitempty"`
	Mode                string   `json:"mode"`                           
	Language            string   `json:"language"`                       
	Theme               string   `json:"theme"`                          
	LastSelectedProxyID string   `json:"lastSelectedProxyId,omitempty"`  
	LocalPort           int      `json:"localPort,omitempty"`            
	DNSServers          []string `json:"dnsServers,omitempty"`           
	TunIPv4             string   `json:"tunIpv4,omitempty"`              
}


type AppConfig struct {
	RoutingRules  RoutingRules   `json:"routingRules"`
	Proxies       []ProxyEntry   `json:"proxies"`
	Settings      AppSettings    `json:"settings"`
	Subscriptions []Subscription `json:"subscriptions,omitempty"`
}


func DefaultConfig() AppConfig {
	return AppConfig{
		RoutingRules: RoutingRules{
			Mode:         "global",
			Whitelist:    []string{"localhost", "127.0.0.1"},
			AppWhitelist: []string{},
		},
		Proxies: []ProxyEntry{},
		Settings: AppSettings{
			Mode:     "proxy",
			Language: "ru",
			Theme:    "dark",
		},
	}
}


type Manager struct {
	mu         sync.RWMutex
	configPath string
	crypto     *CryptoService
	cache      AppConfig
	loaded     bool
}


func NewManager(crypto *CryptoService) *Manager {
	return &Manager{
		crypto: crypto,
		cache:  DefaultConfig(),
	}
}



func (m *Manager) Init(userDataPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.configPath = filepath.Join(userDataPath, "proxy_config.json")

	if err := m.loadLocked(); err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	return nil
}


func (m *Manager) GetConfig() AppConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.cache
}


func (m *Manager) SaveConfig(cfg AppConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.configPath == "" {
		return fmt.Errorf("config manager not initialized")
	}

	
	cfg = ensureDefaults(cfg)

	encrypted, err := m.crypto.Encrypt(cfg)
	if err != nil {
		return fmt.Errorf("encrypting config: %w", err)
	}

	dir := filepath.Dir(m.configPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("creating config dir: %w", err)
	}

	if err := os.WriteFile(m.configPath, []byte(encrypted), 0o600); err != nil {
		return fmt.Errorf("writing config: %w", err)
	}

	m.cache = cfg
	m.loaded = true
	return nil
}


func (m *Manager) UpdateRoutingRules(rules RoutingRules) error {
	m.mu.Lock()
	cfg := m.cache
	m.mu.Unlock()

	cfg.RoutingRules = rules
	return m.SaveConfig(cfg)
}


func (m *Manager) UpdateSettings(settings AppSettings) error {
	m.mu.Lock()
	cfg := m.cache
	m.mu.Unlock()

	cfg.Settings = settings
	return m.SaveConfig(cfg)
}


func (m *Manager) loadLocked() error {
	if m.configPath == "" {
		return nil
	}

	data, err := os.ReadFile(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			
			m.cache = DefaultConfig()
			m.loaded = true
			return nil
		}
		return fmt.Errorf("reading config file: %w", err)
	}

	var cfg AppConfig
	if err := m.crypto.DecryptInto(string(data), &cfg); err != nil {
		
		
		m.cache = DefaultConfig()
		m.loaded = true
		return nil
	}

	m.cache = ensureDefaults(cfg)
	m.loaded = true
	return nil
}


func ensureDefaults(cfg AppConfig) AppConfig {
	if cfg.RoutingRules.Mode == "" {
		cfg.RoutingRules.Mode = "global"
	}
	if cfg.RoutingRules.Whitelist == nil {
		cfg.RoutingRules.Whitelist = []string{"localhost", "127.0.0.1"}
	}
	if cfg.RoutingRules.AppWhitelist == nil {
		cfg.RoutingRules.AppWhitelist = []string{}
	}
	if cfg.Proxies == nil {
		cfg.Proxies = []ProxyEntry{}
	}
	if cfg.Settings.Mode == "" {
		cfg.Settings.Mode = "proxy"
	}
	if cfg.Settings.Language == "" {
		cfg.Settings.Language = "ru"
	}
	if cfg.Settings.Theme == "" {
		cfg.Settings.Theme = "dark"
	}
	return cfg
}
