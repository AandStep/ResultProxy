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
