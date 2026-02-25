import React from "react";
import { Server, Activity, Pencil, Trash2 } from "lucide-react";
import { FlagIcon } from "../components/ui/FlagIcon";
import { useConfigContext } from "../context/ConfigContext";
import { useConnectionContext } from "../context/ConnectionContext";
import { useTranslation } from "react-i18next";

export const ProxyListView = () => {
  const { t } = useTranslation();
  const { proxies, setProxies, setEditingProxy, setActiveTab } =
    useConfigContext();
  const {
    deleteProxy: performDelete,
    selectAndConnect,
    activeProxy,
    isConnected,
    pings,
  } = useConnectionContext();

  const editProxy = (proxy) => {
    setEditingProxy(proxy);
    setActiveTab("add");
  };

  const deleteProxy = (id) => performDelete(id, setProxies);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-3xl font-bold text-white">
          {t("proxyList.title")}
        </h2>
        <p className="text-zinc-400 mt-2">{t("proxyList.desc")}</p>
      </div>

      {proxies.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 rounded-3xl border border-zinc-800 border-dashed">
          <Server className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">{t("proxyList.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          {proxies.map((proxy) => {
            const isActive = isConnected && activeProxy?.id === proxy.id;
            return (
              <div
                key={proxy.id}
                onClick={() => selectAndConnect(proxy)}
                className={`bg-zinc-900 p-6 rounded-3xl border transition-all flex flex-col cursor-pointer group/card outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${isActive ? "border-[#00A819] shadow-[0_0_20px_rgba(0,168,25,0.1)]" : "border-zinc-800 hover:border-[#00A819] hover:bg-zinc-800/30"}`}
              >
                <div className="flex justify-between items-start mb-6 gap-4">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="shrink-0 flex items-center justify-center w-12 h-12 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                      <FlagIcon
                        code={proxy.country}
                        className="w-7 rounded-[2px]"
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white truncate group-hover/card:text-[#00A819] transition-colors">
                        {proxy.name}
                      </h3>
                      <p className="text-sm text-zinc-400 font-mono mt-1 truncate">
                        {proxy.ip}:{proxy.port}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-zinc-800 text-zinc-300 shrink-0">
                    {proxy.type}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2 flex-wrap gap-4">
                  <div
                    className={`text-sm flex items-center shrink-0 ${pings[proxy.id] === "Timeout" || pings[proxy.id] === "Error" ? "text-rose-500" : "text-zinc-500"}`}
                  >
                    <Activity className="w-4 h-4 mr-1 shrink-0" />{" "}
                    {pings[proxy.id] || t("proxyList.pinging")}
                  </div>
                  <div className="flex space-x-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editProxy(proxy);
                      }}
                      className="p-3 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl transition-colors shrink-0 border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProxy(proxy.id);
                      }}
                      className="p-3 bg-zinc-800 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0 border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAndConnect(proxy);
                      }}
                      className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${isActive ? "bg-[#00A819] text-zinc-950 font-bold" : "bg-[#007E3A]/10 text-[#00A819] hover:bg-[#007E3A]/20"}`}
                    >
                      {isActive
                        ? t("proxyList.status.connected")
                        : t("proxyList.status.connect")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
