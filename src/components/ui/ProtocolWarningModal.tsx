import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Info } from 'lucide-react-native';
import { colors } from '../../theme';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export const ProtocolWarningModal = ({ visible, onClose }: Props) => {
    const { t } = useTranslation();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <Info size={24} color={colors.primary} />
                        </View>
                        <Text style={styles.title}>{t('add.protocolWarningTitle')}</Text>
                    </View>
                    
                    <Text style={styles.desc}>
                        {t('add.protocolWarningDesc')}
                    </Text>

                    <Pressable
                        style={styles.confirmBtn}
                        onPress={onClose}
                        android_ripple={{ color: colors.primaryDark }}>
                        <Text style={styles.confirmText}>{t('common.gotIt')}</Text>
                    </Pressable>
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
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.border,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    desc: {
        fontSize: 14,
        lineHeight: 22,
        color: colors.textSecondary,
        marginBottom: 24,
    },
    confirmBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    confirmText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
});
