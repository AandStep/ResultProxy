import React, { createContext, useContext, useState, useEffect } from 'react';
import { useConfigContext } from './ConfigContext';

const SubscriptionContext = createContext();

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider = ({ children }) => {
    const { routingRules } = useConfigContext();
    const [nodes, setNodes] = useState(() => {
        // Load from local storage
        const saved = localStorage.getItem('vless_nodes');
        return saved ? JSON.parse(saved) : [];
    });

    const [activeNodeId, setActiveNodeId] = useState(() => {
        return localStorage.getItem('vless_activeNodeId') || null;
    });

    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        localStorage.setItem('vless_nodes', JSON.stringify(nodes));
    }, [nodes]);

    useEffect(() => {
        if (activeNodeId) {
            localStorage.setItem('vless_activeNodeId', activeNodeId);
        } else {
            localStorage.removeItem('vless_activeNodeId');
        }
    }, [activeNodeId]);

    const addSubscription = async (input) => {
        setIsConnecting(true);
        setError(null);
        try {
            // Calls the IPC handler we created
            const result = await window.electronApiexec?.invoke('parse-subscription', input) ||
                await window.electronAPI?.invoke('parse-subscription', input);

            if (result && result.success) {
                // Merge with existing, avoid duplicates by ID or name
                const newNodes = result.nodes;
                setNodes(prev => {
                    const merged = [...prev];
                    newNodes.forEach(nn => {
                        if (!merged.find(m => m.name === nn.name && m.address === nn.address)) {
                            merged.push(nn);
                        }
                    });
                    return merged;
                });
            } else {
                setError(result?.error || 'Failed to parse subscription');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const pingAll = async () => {
        if (nodes.length === 0) return;
        try {
            const result = await window.electronApiexec?.invoke('ping-nodes', nodes) ||
                await window.electronAPI?.invoke('ping-nodes', nodes);
            if (result && result.success) {
                setNodes(prev => prev.map(node => {
                    const pingRes = result.results.find(r => r.id === node.id);
                    if (pingRes) {
                        return { ...node, delay: pingRes.delay };
                    }
                    return node;
                }));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const connectNode = async (nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        setIsConnecting(true);
        setError(null);
        try {
            // Disconnect standard proxy to enforce mutual exclusion
            try {
                await fetch('http://127.0.0.1:14080/api/disconnect', { method: 'POST' });
            } catch (ignore) { }

            const payload = { node, rules: routingRules };
            const result = await window.electronApiexec?.invoke('start-vless', payload) ||
                await window.electronAPI?.invoke('start-vless', payload);
            if (result && result.success) {
                setActiveNodeId(nodeId);
            } else {
                setError(result?.error || 'Failed to connect');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectNode = async () => {
        setIsConnecting(true);
        try {
            await window.electronApiexec?.invoke('stop-vless') ||
                await window.electronAPI?.invoke('stop-vless');
            setActiveNodeId(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const removeNode = (nodeId) => {
        if (activeNodeId === nodeId) {
            disconnectNode();
        }
        setNodes(prev => prev.filter(n => n.id !== nodeId));
    };

    const value = {
        nodes,
        activeNodeId,
        activeNode: nodes.find(n => n.id === activeNodeId),
        isConnecting,
        error,
        addSubscription,
        pingAll,
        connectNode,
        disconnectNode,
        removeNode,
    };

    return (
        <SubscriptionContext.Provider value={value}>
            {children}
        </SubscriptionContext.Provider>
    );
};

