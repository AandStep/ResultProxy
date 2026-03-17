import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLogStore } from '../store/logStore';
import { colors } from '../theme';

type LogEntry = {
    timestamp: number;
    time: string;
    msg: string;
    type: string;
};

const translateLog = (msg: string, t: any): string => {
    const nodeDeadMatch = msg.match(/Proxy ([\d.]+) became unreachable/);
    if (nodeDeadMatch) {
        return `${t('logs.msg.node_dead')} ${nodeDeadMatch[1]} ${t('logs.msg.stopped_responding')}`;
    }

    const nodeRestoredMatch = msg.match(/Proxy ([\d.]+) is back online/);
    if (nodeRestoredMatch) {
        return `${t('logs.msg.node_prefix', { defaultValue: 'Узел' })} ${nodeRestoredMatch[1]} ${t('logs.msg.node_restored')}`;
    }

    if (msg.includes('Интерфейс запущен. Загрузка конфигурации...'))
        return t('logs.msg.app_started');
    if (msg.includes('Служба недоступна.')) return t('logs.msg.daemon_offline');
    if (msg.includes('Отключено успешно.')) return t('logs.msg.disconnected');
    if (msg.includes('Отключение...')) return t('logs.msg.disconnecting');
    if (msg.startsWith('Подключение к '))
        return msg.replace('Подключение к', t('logs.msg.connecting_to'));
    if (msg.includes('Соединение установлено.')) return t('logs.msg.connected');
    if (msg.startsWith('Сбой подключения: '))
        return msg.replace('Сбой подключения:', t('logs.msg.conn_failed'));
    if (msg.startsWith('Сбой: '))
        return msg.replace('Сбой:', t('logs.msg.error'));
    if (msg.startsWith('Успешно переключено на '))
        return msg.replace('Успешно переключено на', t('logs.msg.switched_to'));
    if (msg.startsWith('Переключение на: '))
        return msg.replace('Переключение на:', t('logs.msg.switching_to'));
    if (msg.includes('Активный сервер удален. Разрыв соединения...'))
        return t('logs.msg.active_deleted');

    if (msg.startsWith('Внимание: Узел '))
        return msg
            .replace('Внимание: Узел', t('logs.msg.node_dead'))
            .replace('перестал отвечать!', t('logs.msg.stopped_responding'));
    if (msg.includes('Связь с узлом восстановлена.'))
        return t('logs.msg.node_restored');

    if (msg.includes('--- НОВЫЙ ЗАПРОС НА ПОДКЛЮЧЕНИЕ ---'))
        return t('logs.msg.new_conn_request');
    if (msg.startsWith('Ошибка подключения: '))
        return msg.replace('Ошибка подключения:', t('logs.msg.backend_conn_error'));
    if (msg.includes('--- ЗАПРОС НА ОТКЛЮЧЕНИЕ ---'))
        return t('logs.msg.disconnect_request');
    if (msg.startsWith('Ошибка отключения: '))
        return msg.replace('Ошибка отключения:', t('logs.msg.backend_disconn_error'));
    if (msg.includes('[KILL SWITCH] Отключен вручную. Снимаем блокировку.'))
        return t('logs.msg.killswitch_manual_off');

    const map: Record<string, string> = {
        'Конфигурация успешно загружена.': t('logs.configLoaded'),
        'Служба недоступна. Используются базовые настройки.': t('logs.serviceUnavailable'),
        'Kill Switch отключен пользователем.': t('logs.msg.killswitch_manual_off'),
        'Ссылка скопирована.': t('logs.linkCopied', { defaultValue: 'Ссылка скопирована.' }),
        'Промокод скопирован.': t('logs.promoCopied', { defaultValue: 'Промокод скопирован.' }),
    };
    for (const [key, value] of Object.entries(map)) {
        if (msg.includes(key)) return value;
    }

    if (typeof msg === 'string') {
        if (msg.startsWith('[ПРОКСИ] ')) {
            return msg.replace('[ПРОКСИ]', t('logs.msg.proxy_prefix'));
        }
        if (msg.startsWith('[APP DEBUG] ')) {
            return msg
                .replace('[APP DEBUG]', t('logs.msg.app_debug_prefix'))
                .replace('(Процесс:', t('logs.msg.process'))
                .replace(') не в белом списке. Идет в прокси.', t('logs.msg.not_in_whitelist'))
                .replace(') В БЕЛОМ СПИСКЕ. Идет напрямую.', t('logs.msg.in_whitelist'));
        }
        if (msg.startsWith('[СИСТЕМА] ')) {
            return msg.replace('[СИСТЕМА]', t('logs.msg.system_prefix'));
        }
    }

    return msg;
};

const LOG_TEXT_COLOR: Record<string, string> = {
    info: '#d4d4d8',
    success: colors.primary,
    error: '#fb7185',
    warning: colors.primaryLight,
};

const LogItem = React.memo(({ item, t, isLast }: { item: LogEntry; t: any; isLast: boolean }) => (
    <View style={[styles.logRow, !isLast && styles.logRowBorder]}>
        <Text style={styles.logTime}>[{item.time}]</Text>
        <Text
            style={[
                styles.logMsg,
                { color: LOG_TEXT_COLOR[item.type] || LOG_TEXT_COLOR.info },
            ]}>
            {translateLog(item.msg, t)}
        </Text>
    </View>
));
LogItem.displayName = 'LogItem';

export const LogsScreen = () => {
    const { t } = useTranslation();
    const logs = useLogStore(s => s.logs);
    const backendLogs = useLogStore(s => s.backendLogs);

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        // В реальном приложении здесь был бы вызов загрузки логов с сервера
        await new Promise(resolve => setTimeout(resolve, 1000));
        setRefreshing(false);
    }, []);

    const allLogs = useMemo(() => {
        const bl = (backendLogs || []).map(l => ({ ...l, timestamp: l.timestamp || 0 }));
        return [...logs, ...bl].sort((a, b) => b.timestamp - a.timestamp).slice(0, 150);
    }, [logs, backendLogs]);

    const renderItem = useCallback(
        ({ item, index }: { item: LogEntry; index: number }) => (
            <LogItem item={item} t={t} isLast={index === allLogs.length - 1} />
        ),
        [t, allLogs.length],
    );

    const keyExtractor = useCallback(
        (item: LogEntry, index: number) => `${item.timestamp}-${index}`,
        [],
    );

    return (
        <View style={styles.container}>
            <View style={styles.headerSection}>
                <Text style={styles.title}>{t('logs.title')}</Text>
                <Text style={styles.desc}>
                    {t('logs.count', { count: allLogs.length })}
                </Text>
            </View>

            <View style={styles.terminalContainer}>
                <FlatList
                    data={allLogs}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.terminalContent}
                    removeClippedSubviews
                    initialNumToRender={20}
                    maxToRenderPerBatch={15}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[colors.primary]}
                            tintColor={colors.primary}
                        />
                    }
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
        padding: 16,
        gap: 16,
    },
    headerSection: {},
    title: {
        fontSize: 30,
        lineHeight: 36,
        fontWeight: '700',
        color: colors.text,
    },
    desc: {
        fontSize: 16,
        lineHeight: 24,
        color: colors.textSecondary,
        marginTop: 6,
    },
    terminalContainer: {
        flex: 1,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 24,
        overflow: 'hidden',
    },
    terminalContent: {
        padding: 20,
    },
    logRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        gap: 14,
    },
    logRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border + '50',
    },
    logTime: {
        fontSize: 12,
        lineHeight: 20,
        color: colors.textDark,
        fontFamily: 'monospace',
        flexShrink: 0,
    },
    logMsg: {
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'monospace',
        flex: 1,
    },
});
