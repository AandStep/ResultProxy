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

/**
 * Сравнивает две версии в формате semver (major.minor.patch).
 * @param {string} v1 Текущая версия
 * @param {string} v2 Новая версия
 * @returns {number} 1 если v1 > v2, -1 если v1 < v2, 0 если равны
 */
export const compareVersions = (v1, v2) => {
  if (!v1 || !v2) return 0;

  const v1Parts = v1.split(".").map(Number);
  const v2Parts = v2.split(".").map(Number);

  const length = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < length; i++) {
    const p1 = v1Parts[i] || 0;
    const p2 = v2Parts[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
};
