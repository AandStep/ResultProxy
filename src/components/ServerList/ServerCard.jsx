import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { FlagIcon } from '../ui/FlagIcon';

export const ServerCard = ({ node }) => {
    const { connectNode, disconnectNode, removeNode, activeNodeId, isConnecting } = useSubscription();
    const isActive = activeNodeId === node.id;

    const handleToggle = () => {
        if (isActive) {
            disconnectNode();
        } else {
            connectNode(node.id);
        }
    };

    const getPingColor = (delay) => {
        if (!delay) return 'neutral';
        if (delay === -1) return 'error';
        if (delay < 150) return 'success';
        if (delay < 300) return 'warning';
        return 'error';
    };

    return (
        <article className={`server-card ${isActive ? 'server-card--active' : ''}`}>
            <div className="server-card__header">
                <span className="server-card__country" title="Country">
                    <FlagIcon code={node.country || 'unknown'} />
                </span>
                <h3 className="server-card__name">{node.name}</h3>
            </div>

            <div className="server-card__body">
                <div className="server-card__tags">
                    <span className="server-card__tag server-card__tag--protocol">{node.protocol.toUpperCase()}</span>
                    <span className="server-card__tag server-card__tag--network">{node.network.toUpperCase()}</span>
                    {node.security && node.security !== 'none' && (
                        <span className="server-card__tag server-card__tag--security">{node.security.toUpperCase()}</span>
                    )}
                </div>

                <div className="server-card__stats">
                    <span className={`server-card__ping server-card__ping--${getPingColor(node.delay)}`}>
                        {node.delay ? (node.delay === -1 ? 'Timeout' : `${node.delay} ms`) : '---'}
                    </span>
                </div>
            </div>

            <div className="server-card__actions">
                <button
                    className={`server-card__btn ${isActive ? 'server-card__btn--disconnect' : 'server-card__btn--connect'}`}
                    onClick={handleToggle}
                    disabled={isConnecting}
                    aria-label={isActive ? 'Disconnect' : 'Connect'}
                >
                    {isActive ? 'Disconnect' : 'Connect'}
                </button>
                <button
                    className="server-card__btn server-card__btn--remove"
                    onClick={() => removeNode(node.id)}
                    disabled={isConnecting}
                    aria-label="Remove Node"
                    title="Remove Node"
                >
                    ✕
                </button>
            </div>
        </article>
    );
};
