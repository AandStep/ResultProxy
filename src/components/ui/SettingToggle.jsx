import React from "react";

export const SettingToggle = ({ title, description, isOn, onToggle }) => {
  return (
    <div
      className="flex items-center justify-between p-6 bg-zinc-900 rounded-3xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
      onClick={onToggle}
    >
      <div className="pr-6">
        <h4 className="text-white font-bold text-lg">{title}</h4>
        <p className="text-zinc-500 mt-1">{description}</p>
      </div>
      <div
        className={`relative w-14 h-7 rounded-full transition-colors duration-300 ease-in-out shrink-0 ${isOn ? "bg-[#007E3A]" : "bg-zinc-700"}`}
      >
        <div
          className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full transition-transform duration-300 ease-in-out ${isOn ? "transform translate-x-7" : ""}`}
        ></div>
      </div>
    </div>
  );
};
