import React, { createContext, useContext, useState, useRef } from "react";
import { useConfigContext } from "./ConfigContext";
import { useLogContext } from "./LogContext";
import { useDaemonPing } from "../hooks/useDaemonPing";
import { useDaemonStatus } from "../hooks/useDaemonStatus";
import { useDaemonControl } from "../hooks/useDaemonControl";

const ConnectionContext = createContext();

export const ConnectionProvider = ({ children }) => {
  const { proxies, routingRules, settings, isConfigLoaded } =
    useConfigContext();
  const { addLog } = useLogContext();

  const [isConnected, setIsConnected] = useState(false);
  const [failedProxy, setFailedProxy] = useState(null);
  const [activeProxy, setActiveProxy] = useState(null);

  const isSwitchingRef = useRef(false);

  const pings = useDaemonPing(proxies, isConfigLoaded);

  const { isProxyDead, stats, speedHistory, daemonStatus } = useDaemonStatus(
    isConnected,
    setIsConnected,
    proxies,
    failedProxy,
    setFailedProxy,
    setActiveProxy,
    isSwitchingRef,
    addLog,
  );

  const { toggleConnection, selectAndConnect, deleteProxy } = useDaemonControl(
    isConnected,
    setIsConnected,
    activeProxy,
    setActiveProxy,
    failedProxy,
    setFailedProxy,
    proxies,
    routingRules,
    settings,
    daemonStatus,
    isSwitchingRef,
    addLog,
  );

  const value = {
    isConnected,
    isProxyDead,
    failedProxy,
    setFailedProxy,
    activeProxy,
    setActiveProxy,
    stats,
    speedHistory,
    pings,
    daemonStatus,
    toggleConnection,
    selectAndConnect,
    deleteProxy,
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnectionContext = () => {
  const context = useContext(ConnectionContext);
  if (!context)
    throw new Error(
      "useConnectionContext must be used within ConnectionProvider",
    );
  return context;
};
