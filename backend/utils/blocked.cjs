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

const fs = require('fs');
const path = require('path');

// Базовый список ресурсов (как фолбэк)
const DEFAULT_BLOCKED = [
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "t.me",
  "discord.com",
  "netflix.com",
];

let blockedDomains = [...DEFAULT_BLOCKED];

/**
 * Загружает списки заблокированных ресурсов из текстовых файлов.
 */
function loadBlockedLists() {
  const rootDir = path.resolve(__dirname, '../../');
  const files = ['list-general.txt', 'list-google.txt'];
  
  files.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        let addedCount = 0;
        lines.forEach(line => {
          const domain = line.trim().toLowerCase();
          if (domain && !domain.startsWith('#') && !blockedDomains.includes(domain)) {
            blockedDomains.push(domain);
            addedCount++;
          }
        });
        console.log(`[BLOCKED] Загружен список: ${file} (добавлено ${addedCount} доменов)`);
      } catch (e) {
        console.error(`[BLOCKED] Ошибка чтения файла ${file}:`, e.message);
      }
    }
  });
}

// Загружаем при инициализации модуля
loadBlockedLists();

/**
 * Проверяет, заблокирован ли домен.
 * Использует проверку на вхождение подстроки (includes), 
 * чтобы охватывать поддомены (например "ytimg.com" заблокирует "i.ytimg.com").
 * 
 * @param {string} hostname
 * @returns {boolean}
 */
function isBlockedDomain(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return blockedDomains.some(d => h.includes(d));
}

module.exports = {
  isBlockedDomain,
  loadBlockedLists,
  getBlockedDomains: () => blockedDomains
};
