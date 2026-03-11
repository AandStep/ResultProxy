/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { apiFetch } from "../hooks/useLogs";

/**
 * Определяет страну по IP через бэкенд API.
 * Фронтенд НЕ обращается к внешним GEO-сервисам напрямую.
 */
export const detectCountry = async (ip) => {
  try {
    let cleanIp = ip.split(":")[0];
    if (
      cleanIp === "127.0.0.1" ||
      cleanIp === "localhost" ||
      cleanIp.startsWith("192.168.") ||
      cleanIp.startsWith("10.")
    ) {
      return "local";
    }

    const res = await apiFetch("/api/detect-country", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: cleanIp }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.country && data.country !== "🌐" && data.country !== "🏠") {
        return data.country;
      }
      if (data.country === "🏠") return "local";
    }
  } catch (error) {}

  return "unknown";
};
