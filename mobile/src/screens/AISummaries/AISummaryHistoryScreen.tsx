import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Alert, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/ui/Text';
import { AppIcon } from '@/icons';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';
import { Colors, Spacing, BorderRadius, Shadows } from '../../theme';
import { safeBack } from '../../utils/safeBack';
import { useNavigation } from '@react-navigation/native';

const isRtl = I18nManager.isRTL;

type HistoryRow = {
  id: string;
  activity_type: 'ai_summary' | 'ai_exercise_correction';
  resource_id: string | null;
  correction_id: string | null;
  price_mru: number;
  meta_json: any;
  created_at: string;
  title?: string | null;
  title_ar?: string | null;
  subject?: string | null;
};

export default function AISummaryHistoryScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const { isAr } = useLanguage();
  const { colors: C } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<HistoryRow[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest<{ data: HistoryRow[] }>(`/ai/history?type=ai_summary&limit=60`, { token });
      setItems(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', e?.message ?? (isAr ? 'تعذّر تحميل السجل' : "Impossible de charger l'historique"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, isAr]);

  useEffect(() => {
    load(false);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const rows = useMemo(() => items.filter((x) => x.activity_type === 'ai_summary'), [items]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => safeBack(navigation)} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <AppIcon name={isRtl ? 'chevronForward' : 'chevronBack'} size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.textPrimary }]}>{isAr ? 'سجل الملخصات' : 'Historique des résumés'}</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {rows.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}>
              <Text style={{ color: C.textSecondary, textAlign: 'center' }}>
                {isAr ? 'لا يوجد ملخصات بعد.' : "Aucun résumé pour l’instant."}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {rows.map((r) => {
                const metaName =
                  r?.meta_json && typeof r.meta_json === 'object'
                    ? (r.meta_json.original_name as string | undefined)
                    : undefined;
                const title = isAr
                  ? (r.title_ar || r.title || metaName || '')
                  : (r.title || r.title_ar || metaName || '');
                const created = new Date(r.created_at);
                const when = created.toLocaleString(isAr ? 'ar-MR' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                return (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.8}
                    style={[s.item, { backgroundColor: C.surface, borderColor: C.border }, Shadows.sm]}
                    onPress={() => {
                      // If this history item is linked to a resource, open it. (Course-summaries items don't have resource_id)
                      if (!r.resource_id) return;
                      navigation.navigate('ResourceDetail', { resource: { id: r.resource_id } });
                    }}
                  >
                    <View style={s.iconWrap}>
                      <AppIcon name="documentText" size={18} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.textPrimary, fontWeight: '800' }} numberOfLines={2}>
                        {title || (isAr ? 'ملخص' : 'Résumé')}
                      </Text>
                      <Text style={{ color: C.textSecondary, fontSize: 12 }}>
                        {when}{r.price_mru ? ` · ${r.price_mru} ${isAr ? 'أوقية' : 'MRU'}` : ''}
                      </Text>
                    </View>
                    <AppIcon name={isRtl ? 'chevronBack' : 'chevronForward'} size={18} color={C.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '900' },
  emptyCard: { padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

