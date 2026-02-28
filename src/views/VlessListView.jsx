import React, { useState, useMemo, useRef, useEffect } from "react";
import {
    Server,
    Activity,
    Trash2,
    Search,
    ChevronDown,
} from "lucide-react";
import { FlagIcon } from "../components/ui/FlagIcon";
import { useConfigContext } from "../context/ConfigContext";
import { useSubscription } from "../context/SubscriptionContext";
import { useTranslation } from "react-i18next";

export const VlessListView = () => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("default");
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortRef = useRef(null);

    const { setActiveTab } = useConfigContext();
    const { nodes: vlessNodes, activeNodeId, connectNode, removeNode, pingAll } = useSubscription();

    useEffect(() => {
        function handleClickOutside(event) {
            if (sortRef.current && !sortRef.current.contains(event.target)) {
                setIsSortOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredAndSortedNodes = useMemo(() => {
        let result = [...vlessNodes];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (n) =>
                    n.name.toLowerCase().includes(q) || n.address.toLowerCase().includes(q)
            );
        }
        if (sortBy === "country") {
            result.sort((a, b) => (a.country || "").localeCompare(b.country || ""));
        } else if (sortBy === "type") {
            result.sort((a, b) => (a.network || "").localeCompare(b.network || ""));
        } else if (sortBy === "newest") {
            result.reverse();
        }
        return result;
    }, [vlessNodes, searchQuery, sortBy]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold text-white">VLESS Servers</h2>
                    <p className="text-zinc-400 mt-2">Manage your VLESS proxy nodes</p>
                </div>
                {vlessNodes.length > 0 && (
                    <button
                        onClick={pingAll}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                    >
                        Ping All
                    </button>
                )}
            </div>

            {vlessNodes.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <div className="relative flex-1 text-white">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                        <input
                            type="text"
                            placeholder={t("proxyList.searchPlaceholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-800 border-none text-white rounded-xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-[#00A819]/50 transition-all placeholder:text-zinc-500"
                        />
                    </div>
                    <div className="flex items-center gap-3 shrink-0" ref={sortRef}>
                        <span className="text-zinc-400 text-sm font-medium whitespace-nowrap">
                            {t("proxyList.sortBy")}:
                        </span>
                        <div className="relative">
                            <button
                                onClick={() => setIsSortOpen(!isSortOpen)}
                                className="flex items-center justify-between bg-zinc-800 border-none text-white rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-[#00A819]/50 transition-all cursor-pointer min-w-[160px]"
                            >
                                <span>{t(`proxyList.sort.${sortBy}`)}</span>
                                <ChevronDown
                                    className={`w-4 h-4 text-zinc-400 transition-transform ${isSortOpen ? "rotate-180" : ""}`}
                                />
                            </button>

                            {isSortOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-xl overflow-hidden z-10 animate-in slide-in-from-top-2 duration-200">
                                    {["default", "newest", "oldest", "country", "type"].map(
                                        (option) => (
                                            <button
                                                key={option}
                                                onClick={() => {
                                                    setSortBy(option);
                                                    setIsSortOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-3 text-sm transition-colors ${sortBy === option ? "bg-[#00A819]/10 text-[#00A819]" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
                                            >
                                                {t(`proxyList.sort.${option}`)}
                                            </button>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {vlessNodes.length === 0 ? (
                <div className="text-center py-16 bg-zinc-900 rounded-3xl border border-zinc-800 border-dashed">
                    <Server className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-400 text-lg">No VLESS servers configured</p>
                    <button
                        onClick={() => setActiveTab("home")}
                        className="mt-4 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-colors"
                    >
                        Go to Home to Add
                    </button>
                </div>
            ) : filteredAndSortedNodes.length === 0 ? (
                <div className="text-center py-16 bg-zinc-900 rounded-3xl border border-zinc-800 border-dashed">
                    <Search className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-400 text-lg">{t("proxyList.noResults")}</p>
                </div>
            ) : (
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
                    {filteredAndSortedNodes.map((node) => {
                        const isActive = activeNodeId === node.id;
                        return (
                            <div
                                key={node.id}
                                onClick={() => connectNode(node.id)}
                                className={`bg-zinc-900 p-6 rounded-3xl border transition-all flex flex-col cursor-pointer group/card outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${isActive ? "border-[#00A819] shadow-[0_0_20px_rgba(0,168,25,0.1)]" : "border-zinc-800 hover:border-[#00A819] hover:bg-zinc-800/30"}`}
                            >
                                <div className="flex justify-between items-start mb-6 gap-4">
                                    <div className="flex items-center space-x-4 min-w-0">
                                        <div className="shrink-0 flex items-center justify-center w-12 h-12 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                                            <FlagIcon
                                                code={node.country}
                                                className="w-7 rounded-[2px]"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-bold text-white truncate group-hover/card:text-[#00A819] transition-colors">
                                                {node.name}
                                            </h3>
                                            <p className="text-sm text-zinc-400 font-mono mt-1 truncate">
                                                {node.address}:{node.port}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium px-2 py-1 rounded bg-zinc-800 text-zinc-300 shrink-0 capitalize">
                                        {node.network || node.protocol || "vless"}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between mt-auto pt-2 flex-wrap gap-4">
                                    <div
                                        className={`text-sm flex items-center shrink-0 text-zinc-500`}
                                    >
                                        <Activity className="w-4 h-4 mr-1 shrink-0" />
                                        {node.delay !== undefined ? `${node.delay}ms` : t("proxyList.pinging")}
                                    </div>
                                    <div className="flex space-x-2 shrink-0">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeNode(node.id);
                                            }}
                                            className="p-3 bg-zinc-800 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0 border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                connectNode(node.id);
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
