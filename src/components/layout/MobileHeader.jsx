import React from "react";
import { useConnectionContext } from "../../context/ConnectionContext";
import logo from "../../assets/logo.png";

export const MobileHeader = () => {
  const { isConnected, isProxyDead } = useConnectionContext();

  return (
    <div className="md:hidden flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-10">
      <div className="flex items-center space-x-2">
        <img
          src={logo}
          alt="ResultProxy"
          className="w-6 h-6 drop-shadow-[0_0_8px_rgba(0,126,58,0.5)]"
        />
        <span className="text-lg font-bold text-white">ResultProxy</span>
      </div>
      {isConnected && (
        <div
          className={`w-3 h-3 rounded-full animate-pulse ${
            isProxyDead ? "bg-rose-500" : "bg-[#007E3A]"
          }`}
        ></div>
      )}
    </div>
  );
};
