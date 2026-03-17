import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    Linking,
    StyleSheet,
    ScrollView,
    Image,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Copy, ExternalLink, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useLogStore } from '../store/logStore';
import { colors } from '../theme';

const PARTNERS = [
    {
        id: 'proxy6' as const,
        link: 'https://proxy6.net/?r=833290',
        promoCode: 'resultproxy',
        logo: require('../assets/p6logo.png'),
    },
    {
        id: 'proxy_market' as const,
        link: 'https://ru.dashboard.proxy.market/?ref=resultproxy',
        promoCode: 'resultproxy',
        logo: require('../assets/pmlogo.png'),
    },
];

type PartnerId = typeof PARTNERS[number]['id'];

export const BuyProxyScreen = () => {
    const { t } = useTranslation();
    const addLog = useLogStore(s => s.addLog);

    const [copiedLink, setCopiedLink] = useState<PartnerId | null>(null);
    const [copiedPromo, setCopiedPromo] = useState<PartnerId | null>(null);

    const handleCopyAndGo = useCallback((link: string, partnerId: PartnerId) => {
        Clipboard.setString(link);
        addLog('Ссылка скопирована.', 'success');
        setCopiedLink(partnerId);
        setTimeout(() => setCopiedLink(null), 2000);
        Linking.openURL(link);
    }, [addLog]);

    const handleCopyPromo = useCallback((promoCode: string, partnerId: PartnerId) => {
        Clipboard.setString(promoCode);
        addLog('Промокод скопирован.', 'success');
        setCopiedPromo(partnerId);
        setTimeout(() => setCopiedPromo(null), 2000);
    }, [addLog]);

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
            <View style={styles.headerSection}>
                <Text style={styles.title}>{t('buy.title')}</Text>
                <Text style={styles.desc}>{t('buy.desc')}</Text>
            </View>

            <View style={styles.partnerList}>
                {PARTNERS.map(partner => (
                    <View key={partner.id} style={styles.card}>
                        <View style={styles.cardTop}>
                            <View style={styles.logoContainer}>
                                <Image
                                    source={partner.logo}
                                    style={styles.logoImage}
                                    resizeMode="contain"
                                />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={styles.cardTitle}>
                                    {t(`buy.${partner.id}.discount`)}
                                </Text>
                                <Text style={styles.cardDesc} numberOfLines={3}>
                                    {t(`buy.${partner.id}.discount_desc`)}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.actionsRow}>
                            <Pressable
                                onPress={() => handleCopyAndGo(partner.link, partner.id)}
                                style={({ pressed }) => [
                                    styles.primaryBtn,
                                    pressed && styles.primaryBtnPressed,
                                ]}>
                                {copiedLink === partner.id ? (
                                    <Check size={16} color={colors.text} />
                                ) : (
                                    <ExternalLink size={16} color={colors.text} />
                                )}
                                <Text style={styles.primaryBtnText}>
                                    {copiedLink === partner.id ? t('buy.copied') : t('buy.go')}
                                </Text>
                            </Pressable>

                            <Pressable
                                onPress={() => handleCopyPromo(partner.promoCode, partner.id)}
                                style={({ pressed }) => [
                                    styles.secondaryBtn,
                                    pressed && styles.secondaryBtnPressed,
                                ]}>
                                {copiedPromo === partner.id ? (
                                    <Check size={16} color={colors.primaryLight} />
                                ) : (
                                    <Copy size={16} color={colors.textSecondary} />
                                )}
                                <View style={styles.promoBtnContent}>
                                    <Text style={styles.promoLabel}>
                                        {t(`buy.${partner.id}.promo_title`)}
                                    </Text>
                                    <Text style={styles.promoCode}>
                                        {copiedPromo === partner.id
                                            ? t('buy.copied')
                                            : partner.promoCode}
                                    </Text>
                                </View>
                            </Pressable>
                        </View>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: { flex: 1, backgroundColor: colors.bg },
    container: { padding: 16, gap: 24, paddingBottom: 32 },
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
        marginTop: 8,
    },

    partnerList: { gap: 16 },

    card: {
        backgroundColor: colors.card,
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 20,
    },
    cardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
    },
    logoContainer: {
        backgroundColor: colors.bg,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    logoImage: {
        width: 40,
        height: 40,
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 14,
        lineHeight: 20,
        color: colors.textSecondary,
    },

    actionsRow: {
        gap: 10,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 14,
        elevation: 4,
    },
    primaryBtnPressed: {
        backgroundColor: colors.primaryLight,
    },
    primaryBtnText: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        color: colors.text,
    },
    secondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.border,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.borderLight + '50',
    },
    secondaryBtnPressed: {
        borderColor: colors.primaryLight + '50',
        backgroundColor: colors.primaryLight + '08',
    },
    promoBtnContent: {
        flex: 1,
    },
    promoLabel: {
        fontSize: 11,
        lineHeight: 14,
        color: colors.textMuted,
        fontWeight: '500',
    },
    promoCode: {
        fontSize: 13,
        lineHeight: 18,
        color: '#d4d4d8',
        fontWeight: '700',
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 2,
    },
});
