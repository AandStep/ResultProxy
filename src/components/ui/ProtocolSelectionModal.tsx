import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Info, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme';

type Props = {
    visible: boolean;
    count: number;
    onClose: () => void;
    onConfirm: (protocol: string) => void;
};

const PROTOCOLS = ['HTTP', 'HTTPS', 'SOCKS5'];

export const ProtocolSelectionModal = ({ visible, count, onClose, onConfirm }: Props) => {
    const { t } = useTranslation();
    const [selectedType, setSelectedType] = useState('HTTP');

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    <View style={styles.header}>
                        <View style={styles.iconWrap}>
                            <Info size={32} color={colors.primary} />
                        </View>
                        <Text style={styles.title}>{t('add.protocolSelectionTitle')}</Text>
                        <Text style={styles.desc}>{t('add.protocolSelectionDesc')}</Text>
                    </View>

                    <View style={styles.protocolList}>
                        {PROTOCOLS.map(type => {
                            const isActive = selectedType === type;
                            return (
                                <Pressable
                                    key={type}
                                    onPress={() => setSelectedType(type)}
                                    style={[styles.protocolBtn, isActive && styles.protocolBtnActive]}>
                                    <Text style={[styles.protocolText, isActive && styles.protocolTextActive]}>
                                        {type}
                                    </Text>
                                    {isActive && <Check size={20} color={colors.primary} />}
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={styles.actions}>
                        <Pressable onPress={onClose} style={styles.cancelBtn}>
                            <Text style={styles.cancelBtnText}>{t('add.cancel')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => onConfirm(selectedType)}
                            style={styles.confirmBtn}>
                            <Text style={styles.confirmBtnText}>
                                {t('add.confirmImport', { count })}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modal: {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 32,
        width: '100%',
        maxWidth: 400,
        padding: 28,
        gap: 24,
        elevation: 20,
    },
    header: {
        alignItems: 'center',
        gap: 12,
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.primary + '15',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
    },
    desc: {
        fontSize: 14,
        lineHeight: 20,
        color: colors.textMuted,
        textAlign: 'center',
    },
    protocolList: {
        gap: 10,
    },
    protocolBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bg,
    },
    protocolBtnActive: {
        backgroundColor: colors.primary + '10',
        borderColor: colors.primary,
    },
    protocolText: {
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '700',
        color: colors.textMuted,
    },
    protocolTextActive: {
        color: colors.text,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        backgroundColor: colors.border,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        color: colors.text,
    },
    confirmBtn: {
        flex: 2,
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        elevation: 4,
    },
    confirmBtnText: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        color: colors.text,
    },
});
