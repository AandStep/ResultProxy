/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Парсит строку или содержимое файла с прокси.
 * Поддерживает форматы:
 * 1. CSV с заголовками (ip,port,login,password)
 * 2. ip:port:login:password
 * 3. ip:port@login:password
 * 4. URI: ss://, vmess://, vless://, trojan://
 */
export const parseProxies = (content) => {
    if (!content || typeof content !== "string") return [];

    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length === 0) return [];

    // Проверка на CSV с заголовками
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes("ip") && firstLine.includes("port")) {
        return parseCSV(lines);
    }

    // Парсинг TXT форматов и URI
    return lines.map((line) => parseLine(line)).filter((p) => p !== null);
};

const parseCSV = (lines) => {
    const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/[;,]/).map((v) => v.trim());
        if (values.length < 2) continue;

        const proxy = {
            type: "HTTP", // Значение по умолчанию
        };

        headers.forEach((header, index) => {
            const val = values[index] || "";
            if (header === "ip") proxy.ip = val;
            else if (header === "port") proxy.port = parseInt(val, 10);
            else if (header === "login" || header === "username" || header === "user")
                proxy.username = val;
            else if (header === "password" || header === "pass") proxy.password = val;
            else if (header === "type" || header === "protocol")
                proxy.type = val.toUpperCase();
            else if (header === "name") proxy.name = val;
        });

        if (proxy.ip && proxy.port) {
            results.push(proxy);
        }
    }

    return results;
};

const parseLine = (line) => {
    // В первую очередь проверяем URI
    if (line.startsWith("ss://")) return parseShadowsocks(line);
    if (line.startsWith("vmess://")) return parseVMess(line);
    if (line.startsWith("vless://")) return parseVLESS(line);
    if (line.startsWith("trojan://")) return parseTrojan(line);

    // Формат ip:port@login:password
    if (line.includes("@")) {
        const [server, auth] = line.split("@");
        const [ip, port] = server.split(":");
        const [login, password] = (auth || "").split(":");
        if (ip && port) {
            return {
                ip,
                port: parseInt(port, 10),
                username: login || "",
                password: password || "",
                type: "HTTP",
                name: `${ip}:${port}`,
            };
        }
    }

    // Формат ip:port:login:password или ip:port
    const parts = line.split(":");
    if (parts.length >= 2) {
        return {
            ip: parts[0],
            port: parseInt(parts[1], 10),
            username: parts[2] || "",
            password: parts[3] || "",
            type: "HTTP",
            name: `${parts[0]}:${parts[1]}`,
        };
    }

    return null;
};

const safeB64Decode = (str) => {
    try {
        // Добавляем паддинг если нужно
        const padding = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
        return decodeURIComponent(escape(atob(str + padding)));
    } catch (e) {
        return "";
    }
};

const parseShadowsocks = (uri) => {
    try {
        const urlPart = uri.replace("ss://", "");
        let mainPart = urlPart.split("#")[0];
        const name = decodeURIComponent(urlPart.split("#")[1] || "Shadowsocks");

        let method = "";
        let password = "";
        let host = "";
        let port = 0;

        if (mainPart.includes("@")) {
            // SIP002 формат (начинается с base64-кодированного метода и пароля)
            const [b64Auth, serverInfo] = mainPart.split("@");
            const decodedAuth = safeB64Decode(b64Auth);
            if (decodedAuth) {
                [method, password] = decodedAuth.split(":");
            }
            [host, port] = serverInfo.split(":");
        } else {
            // Устаревший формат (base64 кодируется вся строка method:pass@host:port)
            const decoded = safeB64Decode(mainPart);
            if (decoded && decoded.includes("@")) {
                const [auth, serverInfo] = decoded.split("@");
                [method, password] = auth.split(":");
                [host, port] = serverInfo.split(":");
            }
        }

        if (host && port) {
            return {
                ip: host,
                port: parseInt(port, 10),
                type: "SS",
                name: name,
                username: "",
                password: password || "",
                extra: { method: method || "aes-256-gcm" },
            };
        }
    } catch (e) {
        console.error("SS parse error", e);
    }
    return null;
};

const parseVMess = (uri) => {
    try {
        const b64 = uri.replace("vmess://", "");
        const decoded = safeB64Decode(b64);
        const json = JSON.parse(decoded);

        if (json.add && json.port) {
            return {
                ip: json.add,
                port: parseInt(json.port, 10),
                type: "VMESS",
                name: json.ps || "VMess",
                username: "",
                password: "", // Not used in typical logic, UUID handles auth
                extra: {
                    uuid: json.id,
                    alterId: json.aid,
                    transport: json.net,
                    wsPath: json.path,
                    tls: json.tls === "tls",
                },
            };
        }
    } catch (e) {
        console.error("VMESS parse error", e);
    }
    return null;
};

const parseVLESS = (uri) => {
    try {
        const urlStr = uri.replace("vless://", "http://"); 
        const url = new URL(urlStr);
        const uuid = url.username;
        const host = url.hostname;
        const port = url.port;
        const typeStr = url.searchParams.get("type") || "tcp";
        const security = url.searchParams.get("security") || "none";
        const path = url.searchParams.get("path") || "";

        return {
            ip: host,
            port: parseInt(port, 10),
            type: "VLESS",
            name: decodeURIComponent(url.hash.replace("#", "") || "VLESS"),
            username: "",
            password: "",
            extra: {
                uuid: uuid,
                transport: typeStr,
                tls: security !== "none",
                wsPath: path,
            },
        };
    } catch (e) {
        console.error("VLESS parse error", e);
    }
    return null;
};

const parseTrojan = (uri) => {
    try {
        const urlStr = uri.replace("trojan://", "http://");
        const url = new URL(urlStr);
        const password = url.username;
        const host = url.hostname;
        const port = url.port;
        const security = url.searchParams.get("security") || "none";

        return {
            ip: host,
            port: parseInt(port, 10),
            type: "TROJAN",
            name: decodeURIComponent(url.hash.replace("#", "") || "Trojan"),
            username: "",
            password: password,
            extra: {
                tls: security !== "none",
            },
        };
    } catch (e) {
        console.error("Trojan parse error", e);
    }
    return null;
};
