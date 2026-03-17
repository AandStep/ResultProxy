import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Lock, FileUp, ClipboardList } from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { useTranslation } from 'react-i18next';
import { useConfigStore, ProxyItem } from '../store/configStore';
import { useConnectionStore } from '../store/connectionStore';
import { useLogStore } from '../store/logStore';
import { colors } from '../theme';
import { parseProxies, ParsedProxy } from '../utils/proxyParser';
import { ProtocolSelectionModal } from '../components/ui/ProtocolSelectionModal';
import { ProtocolWarningModal } from '../components/ui/ProtocolWarningModal';

export const AddProxyScreen = ({ navigation }: any) => {
    const { t } = useTranslation();
    const editingProxy = useConfigStore(s => s.editingProxy);
    const setEditingProxy = useConfigStore(s => s.setEditingProxy);
    const handleSaveProxy = useConfigStore(s => s.handleSaveProxy);
    const handleBulkSaveProxies = useConfigStore(s => s.handleBulkSaveProxies);
    const routingRules = useConfigStore(s => s.routingRules);
    const settings = useConfigStore(s => s.settings);

    const activeProxy = useConnectionStore(s => s.activeProxy);
    const failedProxy = useConnectionStore(s => s.failedProxy);
    const setFailedProxy = useConnectionStore(s => s.setFailedProxy);
    const setActiveProxy = useConnectionStore(s => s.setActiveProxy);
    const isConnected = useConnectionStore(s => s.isConnected);
    const selectAndConnect = useConnectionStore(s => s.selectAndConnect);
    const addLog = useLogStore(s => s.addLog);

    const [formData, setFormData] = useState({
        name: '',
        ip: '',
        port: '',
        type: 'SOCKS5',
        username: '',
        password: '',
        country: '🌐',
    });

    const [importModalVisible, setImportModalVisible] = useState(false);
    const [warningVisible, setWarningVisible] = useState(false);
    const [proxiesToImport, setProxiesToImport] = useState<ParsedProxy[]>([]);

    useEffect(() => {
        if (!editingProxy) {
            setWarningVisible(true);
        }
    }, []);

    useEffect(() => {
        if (editingProxy) {
            setFormData({
                name: editingProxy.name || '',
                ip: editingProxy.ip || '',
                port: editingProxy.port || '',
                type: editingProxy.type || 'SOCKS5',
                username: editingProxy.username || '',
                password: editingProxy.password || '',
                country: editingProxy.country || '🌐',
            });
        } else {
            setFormData({ name: '', ip: '', port: '', type: 'SOCKS5', username: '', password: '', country: '🌐' });
        }
    }, [editingProxy]);

    const handleSubmit = useCallback(() => {
        if (!formData.ip || !formData.port) return;

        const proxyData = {
            ...formData,
            ...(editingProxy?.id ? { id: editingProxy.id } : {}),
            name: formData.name || t('add.newServer'),
        };

        handleSaveProxy(
            proxyData,
            activeProxy,
            failedProxy,
            setFailedProxy,
            setActiveProxy,
            isConnected,
            (proxy: ProxyItem, force?: boolean) =>
                selectAndConnect(proxy, routingRules, settings.killswitch, addLog, force),
            addLog,
        );
        navigation.goBack();
    }, [
        formData, editingProxy, handleSaveProxy, activeProxy, failedProxy,
        setFailedProxy, setActiveProxy, isConnected, selectAndConnect,
        routingRules, settings.killswitch, addLog, navigation, t,
    ]);

    const handleFileImport = async () => {
        try {
            const pickerResult = await DocumentPicker.pickSingle({
                type: [DocumentPicker.types.plainText, DocumentPicker.types.allFiles],
            });
            const content = await RNFS.readFile(pickerResult.uri, 'utf8');
            const parsed = parseProxies(content);
            if (parsed.length > 0) {
                setProxiesToImport(parsed);
                setImportModalVisible(true);
            } else {
                addLog(t('add.noProxiesFound'), 'error');
            }
        } catch (err) {
            if (!DocumentPicker.isCancel(err)) {
                addLog('Ошибка чтения файла', 'error');
            }
        }
    };

    const handleClipboardImport = async () => {
        const text = await Clipboard.getString();
        if (!text) {
            addLog(t('add.clipboardEmpty'), 'error');
            return;
        }
        const parsed = parseProxies(text);
        if (parsed.length > 0) {
            setProxiesToImport(parsed);
            setImportModalVisible(true);
        } else {
            addLog(t('add.noProxiesFound'), 'error');
        }
    };

    const confirmBulkImport = async (protocol: string) => {
        setImportModalVisible(false);
        await handleBulkSaveProxies(proxiesToImport, protocol, addLog);
        navigation.goBack();
    };

    const updateField = useCallback((key: string, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    }, []);

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
            <View style={styles.headerSection}>
                <Text style={styles.title}>
                    {editingProxy ? t('add.titleEdit') : t('add.titleAdd')}
                </Text>
                <Text style={styles.desc}>
                    {editingProxy ? t('add.descEdit') : t('add.descAdd')}
                </Text>
            </View>

            {!editingProxy && (
                <View style={styles.importSection}>
                    <Pressable
                        onPress={handleFileImport}
                        style={styles.importBtn}
                        android_ripple={{ color: colors.border }}>
                        <FileUp size={20} color={colors.textSecondary} />
                        <Text style={styles.importBtnText}>{t('add.fromFile')}</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleClipboardImport}
                        style={styles.importBtn}
                        android_ripple={{ color: colors.border }}>
                        <ClipboardList size={20} color={colors.textSecondary} />
                        <Text style={styles.importBtnText}>{t('add.fromClipboard')}</Text>
                    </Pressable>
                </View>
            )}

            <View style={styles.form}>
                <View>
                    <Text style={styles.label}>{t('add.profileName')}</Text>
                    <TextInput
                        placeholder={t('add.profilePlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        value={formData.name}
                        onChangeText={v => updateField('name', v)}
                    />
                </View>

                <View style={styles.row}>
                    <View style={styles.flex2}>
                        <Text style={styles.label}>{t('add.ip')}</Text>
                        <TextInput
                            placeholder="192.168.1.1"
                            placeholderTextColor={colors.textMuted}
                            style={styles.input}
                            value={formData.ip}
                            onChangeText={v => updateField('ip', v)}
                            autoCapitalize="none"
                        />
                    </View>
                    <View style={styles.flex1}>
                        <Text style={styles.label}>{t('add.port')}</Text>
                        <TextInput
                            placeholder="8000"
                            placeholderTextColor={colors.textMuted}
                            style={styles.input}
                            value={formData.port}
                            onChangeText={v => updateField('port', v)}
                            keyboardType="numeric"
                        />
                    </View>
                </View>

                <View>
                    <Text style={styles.label}>{t('add.protocol')}</Text>
                    <View style={styles.protocolRow}>
                        {['HTTP', 'HTTPS', 'SOCKS5'].map(type => (
                            <Pressable
                                key={type}
                                onPress={() => updateField('type', type)}
                                style={[
                                    styles.protocolBtn,
                                    formData.type === type && styles.protocolBtnActive,
                                ]}>
                                <Text
                                    style={[
                                        styles.protocolText,
                                        formData.type === type && styles.protocolTextActive,
                                    ]}>
                                    {type}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.authSection}>
                    <View style={styles.authHeader}>
                        <Lock size={16} color={colors.textSecondary} />
                        <Text style={styles.authLabel}>{t('add.auth')}</Text>
                    </View>
                    <View style={styles.authFields}>
                        <TextInput
                            placeholder={t('add.loginPlaceholder')}
                            placeholderTextColor={colors.textMuted}
                            style={[styles.input, styles.flex1]}
                            value={formData.username}
                            onChangeText={v => updateField('username', v)}
                            autoCapitalize="none"
                        />
                        <TextInput
                            placeholder={t('add.passPlaceholder')}
                            placeholderTextColor={colors.textMuted}
                            style={[styles.input, styles.flex1]}
                            value={formData.password}
                            onChangeText={v => updateField('password', v)}
                            secureTextEntry
                        />
                    </View>
                </View>

                <View style={styles.submitRow}>
                    {editingProxy && (
                        <Pressable
                            onPress={() => {
                                setEditingProxy(null);
                                navigation.goBack();
                            }}
                            style={styles.cancelBtn}
                            android_ripple={{ color: colors.border }}>
                            <Text style={styles.cancelText}>{t('add.cancel')}</Text>
                        </Pressable>
                    )}
                    <Pressable
                        onPress={handleSubmit}
                        style={[styles.saveBtn, !editingProxy && { flex: 1 }]}
                        android_ripple={{ color: colors.primaryDark }}>
                        <Text style={styles.saveText}>
                            {editingProxy ? t('add.saveChanges') : t('add.saveProxy')}
                        </Text>
                    </Pressable>
                </View>
            </View>

            <ProtocolSelectionModal
                visible={importModalVisible}
                count={proxiesToImport.length}
                onClose={() => setImportModalVisible(false)}
                onConfirm={confirmBulkImport}
            />

            <ProtocolWarningModal
                visible={warningVisible}
                onClose={() => setWarningVisible(false)}
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: { flex: 1, backgroundColor: colors.bg },
    container: { padding: 16, gap: 16, paddingBottom: 40 },
    headerSection: {},
    title: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: colors.text },
    desc: { fontSize: 16, lineHeight: 24, color: colors.textSecondary, marginTop: 6 },

    importSection: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    importBtn: {
        flex: 1,
        minWidth: 140,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 8,
    },
    importBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },

    form: {
        backgroundColor: colors.card,
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 18,
    },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 },
    input: {
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: colors.text,
        fontSize: 16,
        lineHeight: 24,
    },
    row: { flexDirection: 'row', gap: 14 },
    flex1: { flex: 1 },
    flex2: { flex: 2 },

    protocolRow: { flexDirection: 'row', gap: 10 },
    protocolBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    protocolBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    protocolText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.textSecondary },
    protocolTextActive: { color: colors.text },

    authSection: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    authHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    authLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
    authFields: { gap: 12 },

    submitRow: { flexDirection: 'row', gap: 12, paddingTop: 8 },
    cancelBtn: {
        flex: 1,
        backgroundColor: colors.border,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
    saveBtn: {
        flex: 2,
        backgroundColor: colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        elevation: 4,
    },
    saveText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
});
