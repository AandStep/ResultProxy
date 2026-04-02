// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"time"
)

// ProxyMode determines the operating mode.
type ProxyMode string

const (
	ProxyModeProxy  ProxyMode = "proxy"  // System proxy via mixed inbound
	ProxyModeTunnel ProxyMode = "tunnel" // TUN interface (all traffic)
)

// ProxyConfig describes the upstream proxy server to connect through.
type ProxyConfig struct {
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Type     string `json:"type"`     // "http", "socks5", "ss", "vmess", "vless", "trojan", etc.
	Username string `json:"username"`
	Password string `json:"password"`
	// Extended protocol fields.
	URI   string          `json:"uri,omitempty"`
	Extra json.RawMessage `json:"extra,omitempty"`
}

// EngineConfig holds all parameters for the proxy engine.
type EngineConfig struct {
	Proxy        ProxyConfig
	Mode         ProxyMode
	ListenAddr   string // e.g. "127.0.0.1:14081"
	RoutingMode  RoutingMode
	Whitelist    []string
	AppWhitelist []string
	AdBlock      bool
	KillSwitch   bool
}

// Engine is the interface for the proxy core.
// Implementations: SingBoxEngine (production), MockEngine (testing).
type Engine interface {
	// Start launches the proxy engine with the given configuration.
	Start(ctx context.Context, cfg EngineConfig) error
	// Stop gracefully shuts down the engine.
	Stop() error
	// IsRunning returns whether the engine is currently active.
	IsRunning() bool
	// GetTrafficStats returns current upload/download bytes.
	GetTrafficStats() (up, down int64)
}

// --- sing-box JSON config builder ---
// We build the config as a JSON-serializable struct that matches
// sing-box 1.12+ config format, then pass it programmatically.

// SingBoxConfig represents the top-level sing-box configuration (1.12+).
type SingBoxConfig struct {
	Log       *SBLog        `json:"log,omitempty"`
	DNS       *SBDNS        `json:"dns,omitempty"`
	Inbounds  []SBInbound   `json:"inbounds"`
	Outbounds []SBOutbound  `json:"outbounds"`
	Route     *SBRoute      `json:"route,omitempty"`
}

type SBLog struct {
	Level    string `json:"level"`
	Disabled bool   `json:"disabled"`
}

type SBDNS struct {
	Servers []SBDNSServer `json:"servers"`
	Rules   []SBDNSRule   `json:"rules,omitempty"`
}

type SBDNSServer struct {
	Tag             string `json:"tag"`
	Address         string `json:"address"`
	AddressResolver string `json:"address_resolver,omitempty"` // Нужен для DoH (sing-box 1.12+)
}

type SBDNSRule struct {
	Domain []string `json:"domain,omitempty"`
	Server string   `json:"server"`
	Action string   `json:"action,omitempty"` // 1.11+: "block", "reject"
}

type SBInbound struct {
	Type          string   `json:"type"`
	Tag           string   `json:"tag"`
	Listen        string   `json:"listen,omitempty"`
	ListenPort    int      `json:"listen_port,omitempty"`
	Address       []string `json:"address,omitempty"`       // TUN: CIDR addresses (1.12+)
	Stack         string   `json:"stack,omitempty"`          // TUN: "gvisor"
	AutoRoute     bool     `json:"auto_route,omitempty"`
	StrictRoute   bool     `json:"strict_route,omitempty"`
	Sniff         bool     `json:"sniff,omitempty"`          // 1.11+: in inbound
	SniffOverride bool     `json:"sniff_override_destination,omitempty"`
}

type SBOutbound struct {
	Type       string `json:"type"`
	Tag        string `json:"tag"`
	Server     string `json:"server,omitempty"`
	ServerPort int    `json:"server_port,omitempty"`
	Username   string `json:"username,omitempty"` // HTTP/SOCKS5
	Password   string `json:"password,omitempty"`
	Method     string `json:"method,omitempty"`   // shadowsocks
	Version    string `json:"version,omitempty"`  // socks
	UUID       string `json:"uuid,omitempty"`     // VMess/VLess/Trojan
	// TLS + транспорт для VMess/VLess/Trojan
	TLS       *SBOutboundTLS       `json:"tls,omitempty"`
	Transport *SBOutboundTransport `json:"transport,omitempty"`
}

// SBOutboundTLS описывает TLS-настройки для outbound.
type SBOutboundTLS struct {
	Enabled    bool   `json:"enabled"`
	ServerName string `json:"server_name,omitempty"`
	Insecure   bool   `json:"insecure,omitempty"`
}

// SBOutboundTransport описывает транспортный слой (WebSocket, gRPC, HTTP/2).
type SBOutboundTransport struct {
	Type        string `json:"type"`
	Path        string `json:"path,omitempty"`         // WebSocket path
	Host        string `json:"host,omitempty"`         // WebSocket Host header
	ServiceName string `json:"service_name,omitempty"` // gRPC service name
}

type SBRoute struct {
	Rules        []SBRouteRule `json:"rules,omitempty"`
	Final        string        `json:"final,omitempty"`
	AutoDetect   bool          `json:"auto_detect_interface,omitempty"`
}

type SBRouteRule struct {
	Protocol    []string `json:"protocol,omitempty"`
	Domain      []string `json:"domain,omitempty"`
	DomainSuffix []string `json:"domain_suffix,omitempty"`
	ProcessName []string `json:"process_name,omitempty"`
	Outbound    string   `json:"outbound,omitempty"`
	Action      string   `json:"action,omitempty"` // 1.11+: "block", "hijack-dns"
}

// BuildProxyModeConfig creates a sing-box config for system proxy mode.
// Mixed inbound (HTTP+SOCKS5) on the listen address.
func BuildProxyModeConfig(cfg EngineConfig) SingBoxConfig {
	host, port := splitHostPort(cfg.ListenAddr, "127.0.0.1", 14081)

	config := SingBoxConfig{
		Log: &SBLog{Level: "warn"},
		DNS: buildDNS(cfg),
		Inbounds: []SBInbound{{
			Type:       "mixed",
			Tag:        "mixed-in",
			Listen:     host,
			ListenPort: port,
			Sniff:      true,
			SniffOverride: true,
		}},
		Outbounds: buildOutbounds(cfg.Proxy),
		Route:     buildRoute(cfg),
	}

	return config
}

// BuildTunnelModeConfig creates a sing-box config for TUN mode.
// TUN interface captures all system traffic.
func BuildTunnelModeConfig(cfg EngineConfig) SingBoxConfig {
	config := SingBoxConfig{
		Log: &SBLog{Level: "warn"},
		DNS: buildDNS(cfg),
		Inbounds: []SBInbound{{
			Type:        "tun",
			Tag:         "tun-in",
			Address:     []string{"172.19.0.1/30", "fdfe:dcba:9876::1/126"}, // 1.12+: CIDR
			Stack:       "gvisor",
			AutoRoute:   true,
			StrictRoute: true,
			Sniff:       true,
			SniffOverride: true,
		}},
		Outbounds: buildOutbounds(cfg.Proxy),
		Route:     buildRoute(cfg),
	}

	return config
}

func buildOutbounds(proxy ProxyConfig) []SBOutbound {
	outbounds := []SBOutbound{
		{Type: "direct", Tag: "direct"},
		{Type: "block", Tag: "block"}, // Для AdBlock и блокировки DNS
		buildProxyOutbound(proxy),
	}
	return outbounds
}



func buildDNS(cfg EngineConfig) *SBDNS {
	if cfg.Mode == ProxyModeTunnel {
		// В режиме туннеля — шифрованный DNS через DoH.
		// udp служит bootstrap-резолвером для DoH-серверов.
		return &SBDNS{
			Servers: []SBDNSServer{
				{Tag: "udp",        Address: "8.8.8.8"},
				{Tag: "google",     Address: "tls://8.8.8.8",     AddressResolver: "udp"},
				{Tag: "cloudflare", Address: "tls://1.1.1.1",     AddressResolver: "udp"},
				{Tag: "local",      Address: "local"},
			},
		}
	}

	// В режиме прокси — простой UDP DNS, без DoH.
	// DoH требует https-транспорта который может отсутствовать в конкретной сборке sing-box.
	return &SBDNS{
		Servers: []SBDNSServer{
			{Tag: "google",     Address: "8.8.8.8"},
			{Tag: "cloudflare", Address: "1.1.1.1"},
			{Tag: "local",      Address: "local"},
		},
	}
}

func buildRoute(cfg EngineConfig) *SBRoute {
	route := &SBRoute{
		Final:      "proxy", // default: all traffic through proxy
		AutoDetect: true,
	}

	var rules []SBRouteRule

	// DNS hijacking rule (1.11+ action-based).
	rules = append(rules, SBRouteRule{
		Protocol: []string{"dns"},
		Action:   "hijack-dns",
	})

	// App whitelist: bypass by process name (native sing-box support!).
	if len(cfg.AppWhitelist) > 0 {
		rules = append(rules, SBRouteRule{
			ProcessName: cfg.AppWhitelist,
			Outbound:    "direct",
		})
	}

	// Domain whitelist: bypass these domains.
	if len(cfg.Whitelist) > 0 {
		var suffixes []string
		var exact []string
		for _, w := range cfg.Whitelist {
			n := normalizeRule(w)
			if n != "" {
				suffixes = append(suffixes, n)
				exact = append(exact, n)
			}
		}
		if len(suffixes) > 0 {
			rules = append(rules, SBRouteRule{
				DomainSuffix: suffixes,
				Outbound:     "direct",
			})
		}
	}

	route.Rules = rules
	return route
}

func splitHostPort(addr, defaultHost string, defaultPort int) (string, int) {
	if addr == "" {
		return defaultHost, defaultPort
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return defaultHost, defaultPort
	}
	port := defaultPort
	if n, err := net.LookupPort("tcp", portStr); err == nil {
		port = n
	}
	return host, port
}

// PingProxy tests TCP connectivity to a proxy server.
func PingProxy(ip string, port int) (latencyMs int64, reachable bool) {
	start := time.Now()
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, port), 5*time.Second)
	if err != nil {
		return 0, false
	}
	conn.Close()
	return time.Since(start).Milliseconds(), true
}
