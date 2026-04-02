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

import React from "react";

export const SpeedChart = ({ data, color }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1024);
  const points = data
    .map(
      (val, i) => `${(i / (data.length - 1)) * 100},${25 - (val / max) * 25}`,
    )
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 28"
      className="w-full h-8 mt-3 overflow-visible opacity-90"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="transition-all duration-500"
      />
    </svg>
  );
};
