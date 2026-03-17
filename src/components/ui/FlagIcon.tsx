import React, { useState, memo, useCallback } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { Globe, Server } from 'lucide-react-native';
import { colors } from '../../theme';

type Props = {
    code: string;
    size?: number;
};

const FLAG_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.3/flags/4x3';

const getIsoCode = (code: string): string | null => {
    if (!code) return null;
    if (/^[a-zA-Z]{2}$/.test(code)) return code.toLowerCase();

    const clean = code.replace(/[\uFE0F]/g, '').trim();
    if (clean.length > 0) {
        const cp1 = clean.codePointAt(0);
        if (cp1 && cp1 >= 0x1f1e6 && cp1 <= 0x1f1ff) {
            const cp2 = clean.codePointAt(2);
            if (cp2 && cp2 >= 0x1f1e6 && cp2 <= 0x1f1ff) {
                return (
                    String.fromCharCode(cp1 - 0x1f1e6 + 97) +
                    String.fromCharCode(cp2 - 0x1f1e6 + 97)
                );
            }
        }
    }
    return null;
};

export const FlagIcon = memo(({ code, size = 24 }: Props) => {
    const [imgError, setImgError] = useState(false);
    const onError = useCallback(() => setImgError(true), []);

    if (!code || code === 'unknown' || code === '🌐') {
        return <Globe size={size} color={colors.textMuted} />;
    }
    if (code === 'local' || code === '🏠' || code === 'LOCAL') {
        return <Server size={size} color={colors.textMuted} />;
    }

    const isoCode = getIsoCode(code);

    if (isoCode && !imgError) {
        return (
            <View style={[styles.flagFrame, { width: size, height: size * 0.75 }]}>
                <SvgUri
                    uri={`${FLAG_CDN}/${isoCode}.svg`}
                    width={size}
                    height={size * 0.75}
                    onError={onError}
                />
            </View>
        );
    }

    return (
        <View style={[styles.fallbackWrap, { width: size, height: size * 0.75 }]}>
            <Text style={styles.fallback}>{isoCode?.toUpperCase() || code.substring(0, 2).toUpperCase()}</Text>
        </View>
    );
});

FlagIcon.displayName = 'FlagIcon';

const styles = StyleSheet.create({
    flagFrame: {
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: colors.border + '40',
        alignItems: 'center',
        justifyContent: 'center',
    },
    flag: {
        borderRadius: 4,
    },
    fallbackWrap: {
        borderRadius: 4,
        backgroundColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallback: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
});
