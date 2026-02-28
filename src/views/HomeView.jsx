import React, { useState } from "react";
import {
  Power,
  Plus,
  Globe,
  Pencil,
  ChevronDown,
  Activity,
} from "lucide-react";
import { FlagIcon } from "../components/ui/FlagIcon";
import { SpeedChart } from "../components/ui/SpeedChart";
import { useConfigContext } from "../context/ConfigContext";
import { useConnectionContext } from "../context/ConnectionContext";
import { useSubscription } from "../context/SubscriptionContext";
import { formatBytes, formatSpeed } from "../utils/formatters";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
export const HomeView = () => {
  const { t } = useTranslation();
  const { proxies, setEditingProxy, setActiveTab, connectionMode, setConnectionMode } = useConfigContext();
  const {
    isConnected,
    isProxyDead,
    failedProxy,
    setFailedProxy,
    toggleConnection,
    activeProxy,
    stats,
    speedHistory,
    pings,
    selectAndConnect,
  } = useConnectionContext();

  const {
    nodes: vlessNodes,
    activeNode: activeVlessNode,
    activeNodeId,
    connectNode: connectVlessNode,
    disconnectNode: disconnectVlessNode,
    isConnecting: isVlessConnecting,
    addSubscription,
    pingAll,
    removeNode
  } = useSubscription();

  const [subUrl, setSubUrl] = useState('');

  const handleAddVless = (e) => {
    e.preventDefault();
    if (subUrl.trim()) {
      addSubscription(subUrl);
      setSubUrl('');
    }
  };

  const handleModeSwitch = (mode) => {
    if (connectionMode === mode) return;

    // Disconnect active states when switching tabs to enforce mutual exclusion
    if (mode === "vless" && isConnected) {
      toggleConnection();
    }
    if (mode === "proxy" && activeNodeId) {
      disconnectVlessNode();
    }
    setConnectionMode(mode);
  };

  const isVlessMode = connectionMode === "vless";
  const isError = isVlessMode ? false : !!failedProxy;
  const isVlessConnected = !!activeNodeId;
  const isActiveConnected = isVlessMode ? isVlessConnected : isConnected;
  const isActiveProxyDead = isVlessMode ? false : isProxyDead;

  const [isProxyListOpen, setIsProxyListOpen] = useState(false);
  const hasItems = isVlessMode ? vlessNodes.length > 0 : proxies.length > 0;
  const lastVlessId = localStorage.getItem('vless_lastNodeId');
  const lastProxyId = localStorage.getItem('last_proxy_id');

  const displayProxy = isVlessMode
    ? (activeVlessNode || vlessNodes.find(n => n.id === lastVlessId) || vlessNodes[0])
    : (failedProxy || activeProxy || proxies.find(p => p.id === lastProxyId) || proxies[0]);

  useEffect(() => {
    if (activeVlessNode) localStorage.setItem('vless_lastNodeId', activeVlessNode.id);
  }, [activeVlessNode]);

  useEffect(() => {
    if (activeProxy) localStorage.setItem('last_proxy_id', activeProxy.id);
  }, [activeProxy]);

  const goToBuy = () => setActiveTab("buy");
  const goToAdd = () => {
    if (!isVlessMode) {
      setEditingProxy(null);
      setActiveTab("add");
    }
  };
  const onEditProxy = (proxy) => {
    if (!isVlessMode) {
      setEditingProxy(proxy);
      setActiveTab("add");
    }
  };
  const goToProxyList = () => setActiveTab(isVlessMode ? "vlesslist" : "list");

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] space-y-10 animate-in fade-in zoom-in-95 duration-300">
      <div className="text-center space-y-2">
        <h2
          className={`text-3xl font-bold ${isActiveConnected ? (isActiveProxyDead ? "text-rose-500" : "text-[#007E3A]") : isError ? "text-rose-500" : "text-zinc-400"}`}
        >
          {isActiveConnected
            ? isActiveProxyDead
              ? t("home.status.lost")
              : t("home.status.protected")
            : isError
              ? t("home.status.error")
              : t("home.status.unprotected")}
        </h2>
        <p className="text-zinc-500 text-md">
          {isActiveConnected
            ? isActiveProxyDead
              ? t("home.desc.lost")
              : t("home.desc.protected")
            : isError
              ? t("home.desc.error")
              : t("home.desc.unprotected")}
        </p>
      </div>

      <div className="flex items-center space-x-1 bg-zinc-900 border border-zinc-800 p-1 rounded-2xl w-full max-w-xs mx-auto">
        <button
          onClick={() => handleModeSwitch("proxy")}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${!isVlessMode ? "bg-zinc-800 text-white shadow-md text-[#007E3A]" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"}`}
        >
          Proxy
        </button>
        <button
          onClick={() => handleModeSwitch("vless")}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${isVlessMode ? "bg-zinc-800 text-white shadow-md text-[#007E3A]" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"}`}
        >
          VLESS
        </button>
      </div>

      <div className="relative group my-8">
        <div
          className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${isActiveConnected ? (isActiveProxyDead ? "bg-rose-500/40 animate-pulse" : "bg-[#007E3A]/40") : isError ? "bg-rose-500/20 animate-pulse" : hasItems ? "bg-zinc-800/10 group-hover:bg-zinc-800/20" : ""}`}
        ></div>
        <button
          disabled={!hasItems && !isActiveConnected}
          onClick={
            isVlessMode
              ? (isVlessConnected ? () => disconnectVlessNode() : () => { if (displayProxy) connectVlessNode(displayProxy.id); })
              : (isError
                ? () => {
                  setFailedProxy(null);
                  toggleConnection();
                }
                : toggleConnection)
          }
          className={`relative border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none flex items-center justify-center w-48 h-48 rounded-full transition-all duration-300 transform active:scale-95 ${!hasItems && !isActiveConnected
            ? "bg-zinc-900 border-4 border-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed"
            : isActiveConnected
              ? isActiveProxyDead
                ? "bg-rose-600 text-white shadow-2xl shadow-rose-500/50"
                : "bg-[#007E3A] text-zinc-950 shadow-2xl shadow-[#007E3A]/50"
              : isError
                ? "bg-zinc-900 border-4 border-rose-500/50 text-rose-500 shadow-2xl shadow-rose-500/20"
                : "bg-gradient-to-br from-zinc-800 to-zinc-900 border-4 border-zinc-800 text-zinc-400 hover:border-[#007E3A] hover:text-[#007E3A] shadow-2xl"
            }`}
        >
          <Power
            className={`w-20 h-20 ${isActiveConnected && !isActiveProxyDead ? "drop-shadow-none" : isActiveConnected || isError ? "drop-shadow-md" : ""}`}
          />
        </button>
      </div>

      {isVlessMode && (
        <form onSubmit={handleAddVless} className="w-full max-w-2xl flex gap-2 animate-in fade-in duration-300 mt-[-1rem] mb-4">
          <input
            type="text"
            value={subUrl}
            onChange={e => setSubUrl(e.target.value)}
            placeholder="vless://... or base64 subscription URL"
            className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-3xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#007E3A] transition-colors"
            disabled={isVlessConnecting}
          />
          <button
            type="submit"
            disabled={isVlessConnecting || !subUrl.trim()}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-3xl font-bold transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}

      {!hasItems ? (
        <div className="w-full max-w-2xl flex flex-col items-center animate-in fade-in duration-300">
          <p className="text-zinc-400 mb-4 text-center">
            {t("home.noProxies")}
            {!isVlessMode && (
              <span
                onClick={goToBuy}
                className="text-[#007E3A] hover:text-[#00A819] transition-colors cursor-pointer font-medium border-b border-transparent hover:border-[#00A819]"
              >
                {t("home.buyDiscount")}
              </span>
            )}
          </p>
          {!isVlessMode && (
            <div
              onClick={goToAdd}
              className="w-full bg-zinc-900 border border-dashed border-zinc-700 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[#007E3A] hover:bg-zinc-800/50 transition-all group outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
            >
              <div className="bg-zinc-800 p-4 rounded-full mb-4 text-zinc-400 group-hover:text-[#007E3A] transition-colors">
                <Plus className="w-8 h-8" />
              </div>
              <p className="text-lg font-bold text-white mb-1">
                {t("home.addServer")}
              </p>
              <p className="text-sm text-zinc-500">{t("home.addManual")}</p>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`w-full max-w-2xl bg-zinc-900 rounded-3xl border flex flex-col overflow-hidden transition-all outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${(isActiveProxyDead && isActiveConnected) || isError ? "border-rose-500/30" : isProxyListOpen ? "border-zinc-700" : "border-zinc-800 hover:border-[#007E3A] hover:bg-zinc-800/50"}`}
        >
          <div
            onClick={() => setIsProxyListOpen(!isProxyListOpen)}
            className="p-5 flex items-center justify-between cursor-pointer transition-all group"
          >
            <div className="flex items-center space-x-5 min-w-0">
              <div
                className={`w-14 h-14 flex items-center justify-center rounded-2xl shrink-0 transition-colors ${isActiveConnected ? (isActiveProxyDead ? "bg-rose-500/20 text-rose-500" : "bg-[#007E3A]/20 text-[#007E3A]") : isError ? "bg-rose-500/10 text-rose-500" : "bg-zinc-800 text-zinc-500 group-hover:bg-zinc-700"}`}
              >
                {displayProxy ? (
                  <FlagIcon
                    code={displayProxy.country || 'unknown'}
                    className="w-8 rounded-sm shadow-sm"
                  />
                ) : (
                  <Globe className="w-8 h-8" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-zinc-400 mb-1 truncate">
                  {t("home.currentServer")}
                </p>
                <p className="text-lg font-bold text-white truncate">
                  {displayProxy ? displayProxy.name : t("home.emptyServer")}
                </p>
                {displayProxy && (
                  <p className="text-sm text-zinc-500 font-mono mt-1 truncate">
                    {displayProxy.address || displayProxy.ip}:{displayProxy.port} ({displayProxy.type || (isVlessMode ? 'vless' : '')})
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1 shrink-0 ml-4">
              {!isVlessMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditProxy(displayProxy);
                  }}
                  className={`p-2 rounded-xl transition-colors border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${(isActiveProxyDead && isActiveConnected) || isError ? "text-rose-500/50 hover:text-rose-500 hover:bg-rose-500/10" : "text-zinc-600 hover:text-[#007E3A] hover:bg-[#007E3A]/10"}`}
                >
                  <Pencil className="w-5 h-5" />
                </button>
              )}
              <div
                className={`p-2 rounded-xl transition-colors text-zinc-500 group-hover:text-zinc-300`}
              >
                <ChevronDown
                  className={`w-5 h-5 transition-transform duration-300 ${isProxyListOpen ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </div>

          {isProxyListOpen && (
            <div className="bg-zinc-950/50 border-t border-zinc-800/50 p-2 max-h-[280px] overflow-y-auto scrollbar-hide space-y-2 animate-in slide-in-from-top-2 duration-200">
              {isVlessMode && Object.keys(vlessNodes).length > 0 && (
                <div className="flex justify-between items-center px-4 py-2 border-b border-zinc-800/50">
                  <span className="text-xs text-zinc-500 font-bold uppercase">Total Nodes: {vlessNodes.length}</span>
                  <button onClick={e => { e.stopPropagation(); pingAll(); }} className="text-xs font-bold text-[#007E3A] hover:text-[#00A819] transition-colors rounded-lg bg-[#007E3A]/10 hover:bg-[#00A819]/20 px-3 py-1">Ping All</button>
                </div>
              )}
              {Object.entries(
                (isVlessMode ? vlessNodes : proxies).reduce((acc, proxy) => {
                  const countryCode = proxy.country || "Unknown";
                  if (!acc[countryCode]) acc[countryCode] = [];
                  acc[countryCode].push(proxy);
                  return acc;
                }, {}),
              )
                .sort(([countryA], [countryB]) =>
                  countryA.localeCompare(countryB),
                )
                .map(([country, countryProxies]) => (
                  <div key={country} className="space-y-1 mb-2 last:mb-0">
                    <div className="flex items-center px-3 py-1 space-x-2">
                      <FlagIcon
                        code={country}
                        className="w-5 h-auto rounded-[2px] opacity-70"
                      />
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        {country}
                      </span>
                    </div>
                    {countryProxies.map((proxy) => {
                      const isActive = isVlessMode ? activeNodeId === proxy.id : activeProxy?.id === proxy.id;
                      return (
                        <div
                          key={proxy.id}
                          className="flex items-center group/card"
                        >
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isVlessMode) {
                                connectVlessNode(proxy.id);
                              } else {
                                selectAndConnect(proxy);
                              }
                              setIsProxyListOpen(false);
                            }}
                            className={`flex-1 flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${isActive ? "bg-[#007E3A]/10 border border-[#007E3A]/20" : "bg-zinc-900/50 border border-transparent hover:border-[#00A819]/50 hover:bg-zinc-800/80"}`}
                          >
                            <div className="flex items-center space-x-4 min-w-0">
                              <div className="shrink-0 flex items-center justify-center w-10 h-10 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                                <FlagIcon
                                  code={proxy.country}
                                  className="w-6 h-auto rounded-[2px]"
                                />
                              </div>
                              <div className="min-w-0">
                                <h4
                                  className={`text-sm font-bold truncate transition-colors ${isActive ? "text-[#00A819]" : "text-white"}`}
                                  title={proxy.name}
                                >
                                  {proxy.name}
                                </h4>
                                <div className="flex gap-2">
                                  <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                                    {proxy.address || proxy.ip}:{proxy.port}
                                  </p>
                                  {isVlessMode && proxy.protocol && (
                                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-md self-center capitalize">{proxy.protocol}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3 shrink-0 ml-3">
                              {!isVlessMode && (
                                <div
                                  className={`text-xs flex items-center ${pings[proxy.id] === "Timeout" || pings[proxy.id] === "Error" ? "text-rose-500" : "text-zinc-500"}`}
                                >
                                  <Activity className="w-3 h-3 mr-1" />{" "}
                                  {pings[proxy.id] || "..."}
                                </div>
                              )}
                              {isVlessMode && proxy.delay !== undefined && (
                                <div className="text-xs text-zinc-500 flex items-center">
                                  <Activity className="w-3 h-3 mr-1" /> {proxy.delay}ms
                                </div>
                              )}
                              {isActive ? (
                                <div className="w-2 h-2 rounded-full bg-[#00A819] shadow-[0_0_8px_rgba(0,168,25,0.8)] mx-1"></div>
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-zinc-700 mx-1"></div>
                              )}
                            </div>
                          </div>
                          {isVlessMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); removeNode(proxy.id); }}
                              className="ml-2 p-3 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover/card:opacity-100"
                              title="Remove Node"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToProxyList();
                }}
                className="w-full mt-2 py-3 text-sm text-zinc-400 hover:text-white transition-colors border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
              >
                {t("home.openList")}
              </button>
            </div>
          )}
        </div>
      )}

      {isError ? (
        <div className="flex space-x-4 w-full max-w-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
          <button
            onClick={() => onEditProxy(displayProxy)}
            className="flex-1 border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-white py-4 rounded-3xl font-bold transition-colors"
          >
            {t("home.editData")}
          </button>
          <button
            onClick={() => {
              setFailedProxy(null);
              goToProxyList();
            }}
            className="flex-1 border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-500 py-4 rounded-3xl font-bold transition-colors"
          >
            {t("home.chooseOther")}
          </button>
        </div>
      ) : (
        <div
          className={`w-full max-w-2xl grid grid-cols-2 gap-6 transition-all duration-500 ${isActiveConnected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
        >
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 flex flex-col min-w-0 relative">
            <div className="flex justify-between items-start w-full">
              <p className="text-sm text-zinc-500 mb-2 truncate font-bold uppercase tracking-widest">
                {t("home.download")}
              </p>
              <p
                className={`text-[10px] font-bold ${isActiveProxyDead ? "text-zinc-600" : "text-[#007E3A]"}`}
              >
                {formatSpeed(speedHistory.down[19])}
              </p>
            </div>
            <p
              className={`text-3xl font-bold truncate w-full ${isActiveProxyDead ? "text-zinc-600" : "text-[#007E3A]"}`}
            >
              {formatBytes(stats.download)}
            </p>
            <SpeedChart
              data={speedHistory.down}
              color={isActiveProxyDead ? "#52525b" : "#007E3A"}
            />
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 flex flex-col min-w-0 relative">
            <div className="flex justify-between items-start w-full">
              <p className="text-sm text-zinc-500 mb-2 truncate font-bold uppercase tracking-widest">
                {t("home.upload")}
              </p>
              <p
                className={`text-[10px] font-bold ${isActiveProxyDead ? "text-zinc-600" : "text-[#00A819]"}`}
              >
                {formatSpeed(speedHistory.up[19])}
              </p>
            </div>
            <p
              className={`text-3xl font-bold truncate w-full ${isActiveProxyDead ? "text-zinc-600" : "text-[#00A819]"}`}
            >
              {formatBytes(stats.upload)}
            </p>
            <SpeedChart
              data={speedHistory.up}
              color={isActiveProxyDead ? "#52525b" : "#00A819"}
            />
          </div>
        </div>
      )}
    </div>
  );
};
