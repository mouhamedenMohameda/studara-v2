import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { Colors, Spacing, BorderRadius, Shadows, Gradients } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { apiUpload } from '@/utils/api';
import { getPaygFeature } from '@/constants/paygFeatures';

type Picked = { uri: string; name: string; type: string; size?: number } | null;

export default function AISummaryImportScreen({ navigation }: any) {
  const { token } = useAuth();
  const [picked, setPicked] = useState<Picked>(null);
  const [loading, setLoading] = useState(false);
  const pricing = getPaygFeature('ai_summary_pdf');

  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
      ],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const f = r.assets[0];
    setPicked({
      uri: f.uri,
      name: f.name || 'document',
      type: f.mimeType || 'application/octet-stream',
      size: f.size,
    });
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission', "Autorise l'accès aux photos pour importer une image.");
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setPicked({
      uri: a.uri,
      name: 'image.jpg',
      type: 'image/jpeg',
    });
  };

  const upload = async () => {
    if (!token) return Alert.alert('Connexion', 'Connecte-toi pour continuer.');
    if (!picked) return Alert.alert('Fichier', 'Choisis un fichier ou une image.');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri: picked.uri, name: picked.name, type: picked.type } as any);
      const data = await apiUpload<{ documentId: string; status: string }>(
        '/ai/course-summaries/documents',
        fd,
        token,
      );
      navigation.navigate('AISummaryOptions', { documentId: data.documentId });
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : null;
      if (status === 404) {
        Alert.alert(
          'Upload échoué',
          "Endpoint introuvable (404). Ton app pointe probablement vers l’API prod qui n’a pas encore la feature.\n\nSolution: configure `EXPO_PUBLIC_API_BASE` vers ton serveur à jour (ex: `http://localhost:3000/api/v1`) et relance l’app + le backend.",
        );
      } else {
        Alert.alert('Upload échoué', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient colors={Gradients.brand as any} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Résumé intelligent</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AISummaryHistory')} style={styles.historyBtn} activeOpacity={0.85}>
              <AppIcon name="timeOutline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.content}>
        {!!pricing && (
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceTitle}>Tarification</Text>
              <TouchableOpacity onPress={() => navigation.navigate('BillingHub')} activeOpacity={0.85} style={styles.priceCta}>
                <Text style={styles.priceCtaText}>Wallet</Text>
                <AppIcon name="chevronForward" size={16} color="#7C3AED" />
              </TouchableOpacity>
            </View>
            <Text style={styles.priceBody}>{pricing.usageDefinitionFr}</Text>
            <Text style={styles.priceBody}>
              {pricing.pricing.map((p) => `${p.labelFr}: ${p.priceMru ?? '—'} MRU`).join(' · ')}
            </Text>
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Importer un cours</Text>
          <Text style={styles.cardSub}>
            PDF, Word, PowerPoint, image/scan ou texte.
          </Text>

          <View style={{ height: 12 }} />

          <TouchableOpacity style={styles.actionBtn} onPress={pickDocument} disabled={loading}>
            <AppIcon name="documentAttach" size={20} color="#7C3AED" />
            <Text style={styles.actionText}>Choisir un fichier</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={pickImage} disabled={loading}>
            <AppIcon name="imageOutline" size={20} color="#7C3AED" />
            <Text style={styles.actionText}>Choisir une image / scan</Text>
          </TouchableOpacity>

          {picked && (
            <View style={styles.filePill}>
              <AppIcon name="checkmarkCircle" size={18} color="#16A34A" />
              <Text style={styles.fileText} numberOfLines={1}>{picked.name}</Text>
              <TouchableOpacity onPress={() => setPicked(null)} disabled={loading}>
                <AppIcon name="closeCircle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 14 }} />

          <TouchableOpacity style={styles.primaryBtn} onPress={upload} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <AppIcon name="sparkles" size={18} color="#fff" />
                <Text style={styles.primaryText}>Continuer</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 10 },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff' },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  historyBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1, padding: Spacing.lg },
  priceCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 12,
    ...Shadows.sm,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceTitle: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  priceCta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceCtaText: { fontSize: 13, fontWeight: '900', color: '#7C3AED' },
  priceBody: { fontSize: 12, color: Colors.textMuted, marginTop: 6, lineHeight: 16, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
  },
  cardTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  cardSub: { fontSize: 13, color: Colors.textMuted, marginTop: 6, lineHeight: 18 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  actionText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  filePill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  fileText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#166534' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 6,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

