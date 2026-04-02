// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package proxy

import (
	"encoding/json"
)

// parseExtra safely decodes the proxy.Extra JSON blob into a map.
func parseExtra(proxy ProxyConfig) map[string]interface{} {
	var extra map[string]interface{}
	if proxy.Extra != nil {
		json.Unmarshal(proxy.Extra, &extra) //nolint:errcheck — best-effort
	}
	if extra == nil {
		extra = make(map[string]interface{})
	}
	return extra
}

func getStringField(extra map[string]interface{}, key, defaultVal string) string {
	if val, ok := extra[key].(string); ok && val != "" {
		return val
	}
	return defaultVal
}

// getBoolField returns a bool field from an extra map.
// Bug #6 fix: parameter was `key bool` — corrected to `key string`.
func getBoolField(extra map[string]interface{}, key string) bool {
	if val, ok := extra[key].(bool); ok {
		return val
	}
	return false
}

// buildProxyOutbound constructs the sing-box outbound config for the upstream proxy.
// Supports: HTTP, SOCKS5, Shadowsocks, VMess (with TLS+transport), VLess, Trojan.
func buildProxyOutbound(proxy ProxyConfig) SBOutbound {
	extra := parseExtra(proxy)

	switch proxy.Type {
	case "SOCKS5", "SOCKS", "socks", "socks5":
		return SBOutbound{
			Type:       "socks",
			Tag:        "proxy",
			Server:     proxy.IP,
			ServerPort: proxy.Port,
			Username:   proxy.Username,
			Password:   proxy.Password,
			Version:    "5",
		}

	case "SS", "shadowsocks", "ss":
		method := getStringField(extra, "method", "aes-256-gcm")
		return SBOutbound{
			Type:       "shadowsocks",
			Tag:        "proxy",
			Server:     proxy.IP,
			ServerPort: proxy.Port,
			Password:   proxy.Password,
			Method:     method,
		}

	case "VMESS", "vmess":
		// Bug #3 fix: UUID must be in the `uuid` JSON field, not `username`.
		uuid := getStringField(extra, "uuid", "")
		out := SBOutbound{
			Type:       "vmess",
			Tag:        "proxy",
			Server:     proxy.IP,
			ServerPort: proxy.Port,
			UUID:       uuid,
		}
		applyTLSAndTransport(&out, extra, proxy.IP)
		return out

	case "VLESS", "vless":
		uuid := getStringField(extra, "uuid", "")
		out := SBOutbound{
			Type:       "vless",
			Tag:        "proxy",
			Server:     proxy.IP,
			ServerPort: proxy.Port,
			UUID:       uuid,
		}
		applyTLSAndTransport(&out, extra, proxy.IP)
		return out

	case "TROJAN", "trojan":
		out := SBOutbound{
			Type:       "trojan",
			Tag:        "proxy",
			Server:     proxy.IP,
			ServerPort: proxy.Port,
			Password:   proxy.Password,
		}
		// Trojan всегда использует TLS — включаем по умолчанию.
		sni := getStringField(extra, "sni", proxy.IP)
		insecure := getBoolField(extra, "insecure")
		out.TLS = &SBOutboundTLS{
			Enabled:    true,
			ServerName: sni,
			Insecure:   insecure,
		}
		applyTransportOnly(&out, extra)
		return out

	default: // "HTTP", "http"
		return SBOutbound{
			Type:       "http",
			Tag:        "proxy",
			Server:     proxy.IP,
			ServerPort: proxy.Port,
			Username:   proxy.Username,
			Password:   proxy.Password,
		}
	}
}

// applyTLSAndTransport применяет TLS и транспорт на основе extra-полей.
// Используется для VMess и VLess.
func applyTLSAndTransport(out *SBOutbound, extra map[string]interface{}, defaultSNI string) {
	if getBoolField(extra, "tls") {
		sni := getStringField(extra, "sni", defaultSNI)
		insecure := getBoolField(extra, "insecure")
		out.TLS = &SBOutboundTLS{
			Enabled:    true,
			ServerName: sni,
			Insecure:   insecure,
		}
	}
	applyTransportOnly(out, extra)
}

// applyTransportOnly применяет транспортный слой (WS, gRPC) без TLS.
func applyTransportOnly(out *SBOutbound, extra map[string]interface{}) {
	network := getStringField(extra, "network", "tcp")
	switch network {
	case "ws", "websocket":
		out.Transport = &SBOutboundTransport{
			Type: "ws",
			Path: getStringField(extra, "ws-path", "/"),
			Host: getStringField(extra, "ws-host", ""),
		}
	case "grpc":
		out.Transport = &SBOutboundTransport{
			Type:        "grpc",
			ServiceName: getStringField(extra, "grpc-service-name", ""),
		}
	case "http", "h2":
		out.Transport = &SBOutboundTransport{
			Type: "http",
			Host: getStringField(extra, "http-host", ""),
			Path: getStringField(extra, "http-path", "/"),
		}
	}
}
