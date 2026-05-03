// Copyright (C) 2026 ResultV
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Package mobile is the gomobile-bind entrypoint for the Android client.
// All exported symbols become Java/Kotlin bindings via gomobile, so they
// must use only basic types (string, int64, bool, []byte) or
// JSON-serialised payloads. Maps, interface{}, and func parameters are
// not allowed in the public API.
package mobile

import (
	"encoding/json"

	"resultproxy-wails/internal/proxy"
)

// Version returns the libbox proof-of-concept version. Used as a smoke
// test that the AAR loads and the JNI bridge round-trips a string.
func Version() string {
	return "0.1.0-poc"
}

// ParseProxyURI parses a single proxy URI (vless://, vmess://, ss://,
// trojan://, hy2://, wg://, awg://) and returns a JSON-serialised
// ProxyEntry. The Kotlin side decodes the JSON via kotlinx.serialization.
func ParseProxyURI(uri string) (string, error) {
	entry, err := proxy.ParseProxyURI(uri)
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
