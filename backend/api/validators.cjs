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

const net = require("net");

/**
 * Валидация IPv4/IPv6 адреса
 */
function validateIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  // Удаляем порт, если передан в формате ip:port
  const cleanIp = ip.split(":")[0];
  return net.isIP(cleanIp) !== 0;
}

/**
 * Валидация порта (1–65535)
 */
function validatePort(port) {
  const num = Number(port);
  return Number.isInteger(num) && num >= 1 && num <= 65535;
}

/**
 * Валидация учётных данных (опциональные строки, max 255 символов)
 */
function validateCredentials(username, password) {
  if (username !== undefined && username !== null && username !== "") {
    if (typeof username !== "string" || username.length > 255) return false;
  }
  if (password !== undefined && password !== null && password !== "") {
    if (typeof password !== "string" || password.length > 255) return false;
  }
  return true;
}

/**
 * Комплексная валидация прокси-объекта
 * Возвращает { valid: true } или { valid: false, error: "..." }
 */
function sanitizeProxy(proxy) {
  if (!proxy || typeof proxy !== "object") {
    return { valid: false, error: "Невалидный объект прокси" };
  }

  if (!validateIp(proxy.ip)) {
    return { valid: false, error: `Невалидный IP адрес: ${proxy.ip}` };
  }

  if (!validatePort(proxy.port)) {
    return {
      valid: false,
      error: `Невалидный порт: ${proxy.port}. Допустимый диапазон: 1-65535`,
    };
  }

  if (!validateCredentials(proxy.username, proxy.password)) {
    return {
      valid: false,
      error: "Невалидные учётные данные: максимум 255 символов",
    };
  }

  const validTypes = ["HTTP", "HTTPS", "SOCKS5", "ALL"];
  if (proxy.type && !validTypes.includes(proxy.type)) {
    return { valid: false, error: `Невалидный тип прокси: ${proxy.type}` };
  }

  return { valid: true };
}

/**
 * Валидация структуры rules
 */
function validateRules(rules) {
  if (!rules || typeof rules !== "object") {
    return { valid: false, error: "Невалидный объект правил" };
  }

  const validModes = ["global", "smart"];
  if (rules.mode && !validModes.includes(rules.mode)) {
    return { valid: false, error: `Невалидный режим: ${rules.mode}` };
  }

  if (rules.whitelist && !Array.isArray(rules.whitelist)) {
    return { valid: false, error: "whitelist должен быть массивом" };
  }

  if (rules.appWhitelist && !Array.isArray(rules.appWhitelist)) {
    return { valid: false, error: "appWhitelist должен быть массивом" };
  }

  return { valid: true };
}

module.exports = {
  validateIp,
  validatePort,
  validateCredentials,
  sanitizeProxy,
  validateRules,
};
