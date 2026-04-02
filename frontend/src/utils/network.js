/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import wailsAPI from "./wailsAPI";

/**
 * Определяет страну по IP через бэкенд API (Go).
 * Фронтенд НЕ обращается к внешним GEO-сервисам напрямую.
 */
export const detectCountry = async (ip) => {
    try {
        let cleanIp = ip.split(":")[0];
        if (
            cleanIp === "127.0.0.1" ||
            cleanIp === "localhost" ||
            cleanIp.startsWith("192.168.") ||
            cleanIp.startsWith("10.") // Basic private IP check
        ) {
            return "local";
        }

        const countryCode = await wailsAPI.detectCountry(cleanIp);
        if (countryCode && countryCode !== "Unknown" && countryCode !== "🌐" && countryCode !== "🏠") {
            return countryCode; // E.g., 'us', 'ru'
        }
    } catch (error) {
        console.error("DetectCountry error:", error);
    }
    return "unknown";
};
