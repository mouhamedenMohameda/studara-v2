/**
 * #57 Scan & Créer — Appareil photo → Deck
 * Pick an image (gallery or camera) → send base64 to API → Groq extracts Q&A pairs → deck created
 */
import React, { useState, useCallback, useMemo } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';
import { Colors, Spacing, BorderRadius } from '../../theme';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';
import { usePremiumFeature } from '../../hooks/usePremiumFeature';
import PremiumGate from '../../components/common/PremiumGate';
import { safeBack } from '../../utils/safeBack';
import { notifyWalletSpent } from '../../utils/walletUtils';
import { computePaygChargeMru } from '@/utils/paygCharge';

type ScanResult = { deck: { id: string; title: string; color: string }; cards: { front: string; back: string }[]; cards_count: number };

export default function ScanCreateScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const { lang } = useLanguage();
  const { colors: C } = useTheme();
  const qc = useQueryClient();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isAr = lang === 'ar';

  const { hasAccess, loading: premiumLoading, balanceMru } = usePremiumFeature('ai_flashcards');

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const pickImage = useCallback(async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(isAr ? 'إذن مرفوض' : 'Permission refusée', isAr ? 'يرجى السماح بالوصول' : 'Autorisation requise');
      return;
    }
    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!picked.canceled && picked.assets[0]) {
      setImageUri(picked.assets[0].uri);
      setImageBase64(picked.assets[0].base64 ?? null);
      setResult(null);
    }
  }, [isAr]);

  const handleScan = useCallback(async () => {
    if (!imageBase64) return;
    if (!token) { Alert.alert('', isAr ? 'يرجى تسجيل الدخول' : 'Veuillez vous connecter'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScanning(true);
    try {
      const data = await apiRequest<ScanResult>('/ai/scan-deck', {
        method: 'POST', token,
        body: {
          imageBase64,
          deckTitle: deckTitle.trim() || (isAr ? 'مجموعة من الصورة' : 'Deck depuis photo'),
          subject: subject.trim() || undefined,
        },
      });
      setResult(data);
      qc.invalidateQueries({ queryKey: queryKeys.flashcards.decks() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Notifier le débit PAYG (exactement selon la grille)
      const chargeMru = computePaygChargeMru({ featureKey: 'ai_flashcards', uses: 1 });
      if (chargeMru > 0) notifyWalletSpent('ai_flashcards', chargeMru);
    } catch (e: any) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', e.message ?? (isAr ? 'فشل المسح الضوئي' : 'Impossible de scanner'));
    } finally {
      setScanning(false);
    }
  }, [imageBase64, token, deckTitle, subject, isAr, qc]);

  return (
    <PremiumGate
      featureKey="ai_flashcards"
      loading={premiumLoading}
      hasAccess={hasAccess}
      balanceMru={balanceMru}
      navigation={navigation}
      lang={lang}
    >
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Hero header */}
      <LinearGradient colors={['#7C3AED', '#5B21B6']} style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.heroRow}>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Flashcards' } })} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{isAr ? '📸 مسح وإنشاء' : '📸 Scan & Créer'}</Text>
              <Text style={styles.heroSub}>{isAr ? 'صوّر ملاحظاتك → بطاقات تلقائياً' : 'Photo de tes notes → flashcards auto'}</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Image pick buttons */}
        {!imageUri ? (
          <View style={styles.pickArea}>
            <Text style={[styles.pickHint, { color: C.textSecondary }]}>
              {isAr ? 'اختر صورة لملاحظاتك أو امسحها بالكاميرا' : 'Choisissez ou prenez une photo de vos notes'}
            </Text>
            <View style={styles.pickBtnsRow}>
              <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage(true)} activeOpacity={0.82}>
                <AppIcon name="cameraOutline" size={32} color="#7C3AED" />
                <Text style={styles.pickBtnText}>{isAr ? 'الكاميرا' : 'Caméra'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage(false)} activeOpacity={0.82}>
                <AppIcon name="imagesOutline" size={32} color="#7C3AED" />
                <Text style={styles.pickBtnText}>{isAr ? 'المعرض' : 'Galerie'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Preview */}
            <View style={styles.previewWrap}>
              <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="cover" />
              <TouchableOpacity style={styles.changeImgBtn} onPress={() => { setImageUri(null); setImageBase64(null); setResult(null); }}>
                <AppIcon name='refresh' size={16} color="#fff" />
                <Text style={styles.changeImgText}>{isAr ? 'تغيير' : 'Changer'}</Text>
              </TouchableOpacity>
            </View>

            {/* Deck title + subject */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{isAr ? 'اسم المجموعة (اختياري)' : 'Nom du deck (optionnel)'}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.surface, color: C.textPrimary, borderColor: C.border }]}
              value={deckTitle}
              onChangeText={setDeckTitle}
              placeholder={isAr ? 'مجموعة من الصورة' : 'Deck depuis photo'}
              placeholderTextColor={C.textSecondary}
            />
            <Text style={[styles.label, { color: C.textSecondary }]}>{isAr ? 'المادة (اختياري)' : 'Matière (optionnel)'}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.surface, color: C.textPrimary, borderColor: C.border }]}
              value={subject}
              onChangeText={setSubject}
              placeholder={isAr ? 'مثل: الفيزياء' : 'ex: Physique'}
              placeholderTextColor={C.textSecondary}
            />

            {/* Scan button */}
            {!result && (
              <TouchableOpacity
                style={[styles.scanBtn, scanning && { opacity: 0.65 }]}
                onPress={handleScan}
                disabled={scanning}
                activeOpacity={0.82}
              >
                {scanning
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <AppIcon name="sparklesOutline" size={20} color="#fff" />
                }
                <Text style={styles.scanBtnText}>
                  {scanning
                    ? (isAr ? 'جارٍ التحليل بالذكاء الاصطناعي…' : 'Analyse IA en cours…')
                    : (isAr ? '✨ تحليل وإنشاء البطاقات' : '✨ Analyser & créer les flashcards')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Result */}
            {result && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultEmoji}>🎉</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle}>{isAr ? 'تم الإنشاء!' : 'Deck créé !'}</Text>
                    <Text style={styles.resultSub}>
                      {result.cards_count} {isAr ? 'بطاقة في' : 'cartes dans'} «{result.deck.title}»
                    </Text>
                  </View>
                </View>
                {result.cards.slice(0, 3).map((c, i) => (
                  <View key={i} style={styles.previewCard}>
                    <Text style={styles.previewCardQ} numberOfLines={1}>❓ {c.front}</Text>
                    <Text style={styles.previewCardA} numberOfLines={1}>✅ {c.back}</Text>
                  </View>
                ))}
                {result.cards.length > 3 && (
                  <Text style={[styles.resultSub, { marginTop: 4, textAlign: 'center' }]}>
                    + {result.cards.length - 3} {isAr ? 'بطاقة أخرى' : 'autres cartes'}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.goToDeckBtn}
                  onPress={() => navigation.navigate('Explore' as any, { screen: 'Flashcards' })}
                  activeOpacity={0.82}
                >
                  <AppIcon name="albumsOutline" size={18} color="#7C3AED" />
                  <Text style={styles.goToDeckText}>{isAr ? 'افتح مكتبة البطاقات' : 'Voir la bibliothèque'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
    </PremiumGate>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  hero: { paddingBottom: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  pickArea: { alignItems: 'center', paddingVertical: 40, gap: 20 },
  pickHint: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  pickBtnsRow: { flexDirection: 'row', gap: 16 },
  pickBtn: {
    width: 130, height: 130, borderRadius: BorderRadius.xl,
    backgroundColor: '#F3F0FF', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  pickBtnText: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },

  previewWrap: { borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: 16 },
  previewImg: { width: '100%', height: 240 },
  changeImgBtn: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  changeImgText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, marginBottom: 2,
  },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#7C3AED', borderRadius: BorderRadius.lg,
    paddingVertical: 14, marginTop: 20,
  },
  scanBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  resultCard: {
    backgroundColor: '#F3F0FF', borderRadius: BorderRadius.xl,
    padding: 16, marginTop: 20, gap: 8,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultEmoji: { fontSize: 36 },
  resultTitle: { fontSize: 18, fontWeight: '800', color: '#5B21B6' },
  resultSub: { fontSize: 13, color: '#7C3AED', marginTop: 2 },
  previewCard: {
    backgroundColor: '#fff', borderRadius: BorderRadius.md, padding: 10, gap: 4,
  },
  previewCardQ: { fontSize: 13, fontWeight: '700', color: '#111' },
  previewCardA: { fontSize: 12, color: '#6B7280' },
  goToDeckBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EDE9FE', borderRadius: BorderRadius.lg, paddingVertical: 12, marginTop: 8,
  },
  goToDeckText: { fontSize: 15, fontWeight: '700', color: '#7C3AED' },
});
