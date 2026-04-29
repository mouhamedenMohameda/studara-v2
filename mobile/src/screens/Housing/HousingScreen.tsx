import React, { useState, useMemo, useCallback } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, FlatList, TouchableOpacity, StatusBar, Linking, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Shadows, Gradients } from '../../theme';
import { ORBIT_BAR_HEIGHT } from '../../navigation/OrbitBar';
import { apiRequest } from '../../utils/api';
import { safeBack } from '../../utils/safeBack';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

// ─── Types ───────────────────────────────────────────────────────────────────

type HousingType = 'studio' | 'chambre' | 'appartement' | 'colocation';
type HousingStatus = 'pending' | 'approved' | 'rejected';

interface HousingListing {
  id: string;
  user_id: string;
  title: string;
  title_ar?: string;
  type: HousingType;
  price: number;
  area?: string;
  description?: string;
  description_ar?: string;
  phone?: string;
  whatsapp?: string;
  furnished: boolean;
  features: string[];
  status: HousingStatus;
  reject_reason?: string;
  created_at: string;
}

type FormData = {
  title: string; titleAr: string; type: HousingType;
  price: string; area: string; description: string; descriptionAr: string;
  phone: string; whatsapp: string; furnished: boolean; features: string;
};
const EMPTY_FORM: FormData = {
  title: '', titleAr: '', type: 'studio', price: '', area: '',
  description: '', descriptionAr: '', phone: '', whatsapp: '',
  furnished: false, features: '',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<HousingType, string> = {
  studio: '#8B5CF6', chambre: '#3B82F6', appartement: Colors.primary, colocation: '#F97316',
};
const TYPE_ICONS: Record<HousingType, AppIconName> = {
  studio: 'homeOutline', chambre: 'bedOutline',
  appartement: 'businessOutline', colocation: 'peopleOutline',
};
const TYPE_LABELS_AR: Record<HousingType, string> = {
  studio: 'استوديو', chambre: 'غرفة', appartement: 'شقة', colocation: 'مشاركة',
};
const TYPE_LABELS_FR: Record<HousingType, string> = {
  studio: 'Studio', chambre: 'Chambre', appartement: 'Appartement', colocation: 'Colocation',
};
const TYPES: HousingType[] = ['studio', 'chambre', 'appartement', 'colocation'];

// ─── Housing Card ─────────────────────────────────────────────────────────────

interface CardProps {
  item: HousingListing;
  isAr: boolean;
  isOwner: boolean;
  onContact: (item: HousingListing, via: 'phone' | 'whatsapp') => void;
  onEdit: (item: HousingListing) => void;
  onDelete: (id: string) => void;
}

const HousingCard = React.memo(({ item, isAr, isOwner, onContact, onEdit, onDelete }: CardProps) => {
  const [expanded, setExpanded] = useState(false);
  const color = TYPE_COLORS[item.type];
  const typeLabel = isAr ? TYPE_LABELS_AR[item.type] : TYPE_LABELS_FR[item.type];
  const title = item.title;
  const desc  = isAr && item.description_ar ? item.description_ar : item.description;
  const furnished = item.furnished
    ? (isAr ? '🪑 مفروشة' : '🪑 Meublé')
    : (isAr ? '🚫 غير مفروشة' : '🚫 Non meublé');
  const days  = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
  const posted = days === 0 ? (isAr ? 'اليوم' : "Aujourd'hui")
    : days === 1 ? (isAr ? 'أمس' : 'Hier')
    : isAr ? `منذ ${days} أيام` : `Il y a ${days} j`;

  const isPending  = item.status === 'pending';
  const isRejected = item.status === 'rejected';

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.92} onPress={() => setExpanded(e => !e)}>
      {/* Owner status badge */}
      {isOwner && (
        <View style={[styles.ownerBadge, {
          backgroundColor: isPending ? '#FEF3C7' : isRejected ? '#FEF2F2' : '#ECFDF5',
        }]}>
          <AppIcon
            name={isPending ? 'timeOutline' : isRejected ? 'closeCircleOutline' : 'checkmarkCircleOutline'}
            size={12}
            color={isPending ? '#D97706' : isRejected ? '#DC2626' : Colors.primary}
          />
          <Text style={[styles.ownerBadgeText, {
            color: isPending ? '#D97706' : isRejected ? '#DC2626' : Colors.primary,
          }]}>
            {isPending ? (isAr ? 'قيد المراجعة' : 'En attente') : isRejected ? (isAr ? 'مرفوض' : 'Refusé') : (isAr ? 'مقبول' : 'Accepté')}
          </Text>
          {(isPending || isRejected) && (
            <TouchableOpacity onPress={() => onEdit(item)} style={{ marginLeft: 6 }}>
              <AppIcon name="pencilOutline" size={12} color="#6B7280" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onDelete(item.id)} style={{ marginLeft: 4 }}>
            <AppIcon name="trashOutline" size={12} color="#EF4444" />
          </TouchableOpacity>
        </View>
      )}
      {/* Rejection reason */}
      {isOwner && isRejected && item.reject_reason ? (
        <View style={styles.rejectNote}>
          <Text style={styles.rejectNoteText}>
            {isAr ? `سبب الرفض: ${item.reject_reason}` : `Motif: ${item.reject_reason}`}
          </Text>
        </View>
      ) : null}
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={[styles.typeChip, { backgroundColor: color + '18' }]}>
          <AppIcon name={TYPE_ICONS[item.type]} size={14} color={color} />
          <Text style={[styles.typeText, { color }]}>{typeLabel}</Text>
        </View>
        <Text style={styles.postedText}>{posted}</Text>
      </View>
      {/* Title + price */}
      <View style={styles.cardMain}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={expanded ? undefined : 1}>{title}</Text>
          {item.area ? (
            <View style={styles.areaRow}>
              <AppIcon name="locationOutline" size={13} color={Colors.textMuted} />
              <Text style={styles.areaText}>{item.area}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceNum}>{item.price.toLocaleString()}</Text>
          <Text style={styles.priceCur}>{isAr ? 'أ.م/ش' : 'Ouguiya/m'}</Text>
        </View>
      </View>
      {/* Tags */}
      <View style={styles.tagsRow}>
        <View style={[styles.tag, { backgroundColor: item.furnished ? '#ECFDF5' : '#FEF2F2' }]}>
          <Text style={[styles.tagText, { color: item.furnished ? Colors.primary : '#DC2626' }]}>{furnished}</Text>
        </View>
        {item.features.slice(0, 2).map((f, i) => (
          <View key={i} style={styles.tag}><Text style={styles.tagText}>{f}</Text></View>
        ))}
      </View>
      {/* Expanded */}
      {expanded && (
        <View style={styles.expandedBlock}>
          {desc ? <Text style={styles.descText}>{desc}</Text> : null}
          {!isOwner && (
            <View style={styles.contactRow}>
              {item.whatsapp ? (
                <TouchableOpacity
                  style={[styles.contactBtn, { backgroundColor: '#25D366' }]}
                  onPress={() => onContact(item, 'whatsapp')} activeOpacity={0.82}
                >
                  <AppIcon name="logoWhatsapp" size={18} color="#fff" />
                  <Text style={styles.contactBtnText}>{isAr ? 'واتساب' : 'WhatsApp'}</Text>
                </TouchableOpacity>
              ) : null}
              {item.phone ? (
                <TouchableOpacity
                  style={[styles.contactBtn, { backgroundColor: Colors.primary }]}
                  onPress={() => onContact(item, 'phone')} activeOpacity={0.82}
                >
                  <AppIcon name="callOutline" size={18} color="#fff" />
                  <Text style={styles.contactBtnText}>{isAr ? 'اتصال' : 'Appeler'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          {isOwner && (isPending || isRejected) && (
            <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(item)}>
              <AppIcon name="pencilOutline" size={15} color={Colors.primary} />
              <Text style={styles.editBtnText}>{isAr ? 'تعديل الإعلان' : 'Modifier'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View style={styles.chevronRow}>
        <AppIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
});

// ─── Post / Edit Modal ────────────────────────────────────────────────────────

interface PostModalProps {
  visible: boolean;
  editing: HousingListing | null;
  isAr: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function PostModal({ visible, editing, isAr, onClose, onSaved }: PostModalProps) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  React.useEffect(() => {
    if (editing) {
      setForm({
        title: editing.title, titleAr: editing.title_ar ?? '',
        type: editing.type, price: String(editing.price),
        area: editing.area ?? '', description: editing.description ?? '',
        descriptionAr: editing.description_ar ?? '', phone: editing.phone ?? '',
        whatsapp: editing.whatsapp ?? '', furnished: editing.furnished,
        features: editing.features.join(', '),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [editing, visible]);

  const set = (k: keyof FormData) => (v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) { setError(isAr ? 'العنوان مطلوب' : 'Titre requis'); return; }
    const price = parseInt(form.price, 10);
    if (!price || price <= 0) { setError(isAr ? 'السعر غير صالح' : 'Prix invalide'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        title: form.title.trim(), titleAr: form.titleAr.trim() || undefined,
        type: form.type, price,
        area: form.area.trim() || undefined,
        description: form.description.trim() || undefined,
        descriptionAr: form.descriptionAr.trim() || undefined,
        phone: form.phone.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        furnished: form.furnished,
        features: form.features.split(',').map(f => f.trim()).filter(Boolean),
      };
      if (editing) {
        await apiRequest(`/housing/${editing.id}`, { method: 'PUT', body, token: token ?? undefined });
      } else {
        await apiRequest('/housing', { method: 'POST', body, token: token ?? undefined });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <AppIcon name='close' size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editing ? (isAr ? 'تعديل الإعلان' : 'Modifier') : (isAr ? 'نشر إعلان سكن' : 'Publier une annonce')}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.modalSave}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.modalSaveText}>{isAr ? 'نشر' : 'Publier'}</Text>
              }
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {error ? <View style={[styles.errorBox, { marginBottom: 12 }]}><Text style={styles.errorText}>{error}</Text></View> : null}
            {editing ? (
              <View style={[styles.pendingNote, { marginBottom: 12 }]}>
                <AppIcon name="informationCircleOutline" size={16} color="#D97706" />
                <Text style={styles.pendingNoteText}>
                  {isAr ? 'بعد التعديل سيُعاد مراجعة الإعلان من قِبل الإدارة.' : "Après modification, l'annonce sera renvoyée pour validation."}
                </Text>
              </View>
            ) : null}
            <View style={[styles.fieldCard, { marginBottom: 12 }]}>
              <Text style={styles.fieldLabel}>{isAr ? 'العنوان *' : 'Titre *'}</Text>
              <TextInput style={styles.fieldInput} value={form.title} onChangeText={set('title')}
                placeholder={isAr ? 'مثال: استوديو مفروش قرب الجامعة' : "Ex: Studio meublé près de l'UNA"}
                placeholderTextColor="#9CA3AF" textAlign={isAr ? 'right' : 'left'} />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>{isAr ? 'العنوان بالعربية' : 'Titre en arabe'}</Text>
              <TextInput style={styles.fieldInput} value={form.titleAr} onChangeText={set('titleAr')}
                placeholder="العنوان بالعربية (اختياري)" placeholderTextColor="#9CA3AF" textAlign="right" />
            </View>
            <View style={[styles.fieldCard, { marginBottom: 12 }]}>
              <Text style={styles.fieldLabel}>{isAr ? 'نوع السكن *' : 'Type *'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, form.type === t && { backgroundColor: TYPE_COLORS[t] + '20', borderColor: TYPE_COLORS[t] }]}
                    onPress={() => set('type')(t)}
                  >
                    <AppIcon name={TYPE_ICONS[t]} size={14} color={form.type === t ? TYPE_COLORS[t] : '#9CA3AF'} />
                    <Text style={[styles.typeBtnText, form.type === t && { color: TYPE_COLORS[t], fontWeight: '700' }]}>
                      {isAr ? TYPE_LABELS_AR[t] : TYPE_LABELS_FR[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.fieldCard, { marginBottom: 12 }]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{isAr ? 'السعر (أوقية/شهر) *' : 'Prix (Ouguiya/mois) *'}</Text>
                  <TextInput style={styles.fieldInput} value={form.price} onChangeText={set('price')}
                    keyboardType="numeric" placeholder="8000" placeholderTextColor="#9CA3AF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{isAr ? 'الحي / المنطقة' : 'Quartier'}</Text>
                  <TextInput style={styles.fieldInput} value={form.area} onChangeText={set('area')}
                    placeholder="Tevragh Zeina" placeholderTextColor="#9CA3AF" />
                </View>
              </View>
            </View>
            <View style={[styles.fieldCard, { marginBottom: 12 }]}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                onPress={() => set('furnished')(!form.furnished)}
              >
                <View style={[styles.checkbox, form.furnished && styles.checkboxActive]}>
                  {form.furnished && <AppIcon name='checkmark' size={14} color="#fff" />}
                </View>
                <Text style={{ fontSize: 14, color: Colors.textPrimary, fontWeight: '600' }}>
                  {isAr ? 'مفروش' : 'Meublé'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.fieldCard, { marginBottom: 12 }]}>
              <Text style={styles.fieldLabel}>{isAr ? 'المميزات (مفصولة بفاصلة)' : 'Équipements (séparés par virgule)'}</Text>
              <TextInput style={styles.fieldInput} value={form.features} onChangeText={set('features')}
                placeholder={isAr ? 'واي فاي، مطبخ مشترك، حارس...' : 'wifi, cuisine, gardien...'}
                placeholderTextColor="#9CA3AF" textAlign={isAr ? 'right' : 'left'} />
            </View>
            <View style={[styles.fieldCard, { marginBottom: 12 }]}>
              <Text style={styles.fieldLabel}>{isAr ? 'الوصف' : 'Description'}</Text>
              <TextInput style={[styles.fieldInput, { height: 90, textAlignVertical: 'top' }]}
                value={form.description} onChangeText={set('description')} multiline
                placeholder={isAr ? 'وصف السكن...' : 'Décrivez le logement...'} placeholderTextColor="#9CA3AF"
                textAlign={isAr ? 'right' : 'left'} />
            </View>
            <View style={styles.fieldCard}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{isAr ? 'الهاتف' : 'Téléphone'}</Text>
                  <TextInput style={styles.fieldInput} value={form.phone} onChangeText={set('phone')}
                    keyboardType="phone-pad" placeholder="+222 XX XX XX XX" placeholderTextColor="#9CA3AF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>WhatsApp</Text>
                  <TextInput style={styles.fieldInput} value={form.whatsapp} onChangeText={set('whatsapp')}
                    keyboardType="phone-pad" placeholder="+222 XX XX XX XX" placeholderTextColor="#9CA3AF" />
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const FILTER_TYPES: Array<HousingType | 'all'> = ['all', 'studio', 'chambre', 'appartement', 'colocation'];

export default function HousingScreen() {
  const { lang } = useLanguage();
  const { user, token } = useAuth();
  const isAr = lang === 'ar';
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const goHomeTab = useCallback(() => {
    smoothGoHomeTab(navigation as any);
  }, [navigation]);

  const onBackPress = useCallback(() => {
    if ((navigation as any)?.canGoBack?.()) {
      (navigation as any).goBack?.();
      return;
    }
    goHomeTab();
  }, [navigation, goHomeTab]);

  const [search,     setSearch]     = useState('');
  const [activeType, setActiveType] = useState<HousingType | 'all'>('all');
  const [maxPrice,   setMaxPrice]   = useState<number>(999999);
  const [showModal,  setShowModal]  = useState(false);
  const [showMine,   setShowMine]   = useState(false);
  const [editing,    setEditing]    = useState<HousingListing | null>(null);

  const MAX_PRICE_STEPS  = [999999, 20000, 15000, 10000, 7000];
  const MAX_PRICE_LABELS = isAr
    ? ['الكل', '≤ 20,000', '≤ 15,000', '≤ 10,000', '≤ 7,000']
    : ['Tout',  '≤ 20 000', '≤ 15 000', '≤ 10 000', '≤ 7 000'];

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: listings = [], isLoading } = useQuery<HousingListing[]>({
    queryKey: ['housing', 'approved'],
    queryFn: () => apiRequest<HousingListing[]>('/housing'),
    staleTime: 3 * 60 * 1000,
  });

  const { data: mine = [] } = useQuery<HousingListing[]>({
    queryKey: ['housing', 'mine'],
    queryFn: () => apiRequest<HousingListing[]>('/housing/mine', { token: token ?? undefined }),
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  // ── Delete mutation ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/housing/${id}`, { method: 'DELETE', token: token ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['housing'] }),
  });

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      isAr ? 'حذف الإعلان' : "Supprimer l'annonce",
      isAr ? 'هل أنت متأكد من حذف هذا الإعلان؟' : 'Voulez-vous vraiment supprimer cette annonce ?',
      [
        { text: isAr ? 'إلغاء' : 'Annuler', style: 'cancel' },
        { text: isAr ? 'حذف' : 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  }, [isAr, deleteMutation]);

  const handleContact = useCallback((item: HousingListing, via: 'phone' | 'whatsapp') => {
    if (via === 'whatsapp' && item.whatsapp) {
      const num = item.whatsapp.replace(/[^0-9]/g, '');
      const url = `whatsapp://send?phone=${num}&text=${encodeURIComponent(
        isAr ? `مرحباً، رأيت إعلان "${item.title}" وأريد الاستفسار.`
             : `Bonjour, j'ai vu l'annonce "${item.title}" et je souhaite en savoir plus.`
      )}`;
      Linking.canOpenURL(url).then(can => {
        if (can) Linking.openURL(url);
        else Alert.alert(isAr ? 'واتساب غير مثبت' : 'WhatsApp non installé');
      });
    } else if (via === 'phone' && item.phone) {
      Linking.openURL(`tel:${item.phone}`);
    }
  }, [isAr]);

  const handleEdit = useCallback((item: HousingListing) => {
    setEditing(item);
    setShowModal(true);
  }, []);

  const handleSaved = useCallback(() => {
    setShowModal(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['housing'] });
    Alert.alert(
      isAr ? '✅ تم' : '✅ Envoyé',
      isAr ? 'سيُراجع إعلانك ويُنشر بعد الموافقة.' : "Votre annonce sera publiée après validation par l'équipe.",
    );
  }, [isAr, qc]);

  // Merged list: approved public + user's own (all statuses, deduped by id)
  const displayList = useMemo(() => {
    const map = new Map<string, HousingListing>();
    listings.forEach(l => map.set(l.id, l));
    mine.forEach(l => map.set(l.id, l));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [listings, mine]);

  const visibleList = useMemo(() => {
    const source = showMine ? mine : displayList;
    const q = search.toLowerCase();
    return source.filter(l => {
      if (activeType !== 'all' && l.type !== activeType) return false;
      if (l.price > maxPrice) return false;
      if (q) {
        const hay = `${l.title} ${l.title_ar ?? ''} ${l.area ?? ''} ${l.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [displayList, mine, showMine, search, activeType, maxPrice]);

  const typeLabel = (t: HousingType | 'all') => {
    if (t === 'all') return isAr ? 'الكل' : 'Tout';
    return isAr ? TYPE_LABELS_AR[t] : TYPE_LABELS_FR[t];
  };

  const myPendingCount = mine.filter(l => l.status === 'pending').length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#F59E0B', '#F97316', '#EC4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={onBackPress}
              activeOpacity={0.75}
            >
              <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={19} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>{isAr ? '🏠 سكن الطلاب' : '🏠 Logement Étudiant'}</Text>
              <Text style={styles.headerSub}>
                {visibleList.length} {isAr ? 'عرض متاح' : 'offre(s)'}
              </Text>
            </View>
            {mine.length > 0 && (
              <TouchableOpacity
                style={[styles.mineBtn, showMine && styles.mineBtnActive]}
                onPress={() => setShowMine(m => !m)}
              >
                <AppIcon name="personOutline" size={14} color={showMine ? Colors.primary : '#fff'} />
                <Text style={[styles.mineBtnText, showMine && { color: Colors.primary }]}>
                  {isAr ? 'إعلاناتي' : 'Mes annonces'}
                </Text>
                {myPendingCount > 0 && (
                  <View style={styles.pendingDot}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{myPendingCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
          {/* Search */}
          <View style={styles.searchWrap}>
            <AppIcon name="searchOutline" size={17} color="rgba(255,255,255,0.7)" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={isAr ? 'ابحث عن سكن...' : 'Rechercher un logement...'}
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={search} onChangeText={setSearch}
              textAlign={isAr ? 'right' : 'left'} returnKeyType='search'
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <AppIcon name="closeCircle" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Type filter */}
      <View style={styles.filterBar}>
        {FILTER_TYPES.map(t => (
          <TouchableOpacity
            key={t} style={[styles.filterChip, activeType === t && styles.filterChipActive]}
            onPress={() => setActiveType(t)}
          >
            <Text style={[styles.filterText, activeType === t && styles.filterTextActive]}>{typeLabel(t)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Price filter */}
      <View style={styles.priceFilterBar}>
        <Text style={styles.priceFilterLabel}>{isAr ? 'الحد الأقصى:' : 'Prix max :'}</Text>
        {MAX_PRICE_STEPS.map((step, i) => (
          <TouchableOpacity
            key={step} style={[styles.priceChip, maxPrice === step && styles.priceChipActive]}
            onPress={() => setMaxPrice(step)}
          >
            <Text style={[styles.priceChipText, maxPrice === step && styles.priceChipTextActive]}>
              {MAX_PRICE_LABELS[i]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 80 }} color={Colors.primary} size="large" />
      ) : (
        <FlatList
          data={visibleList}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <HousingCard
              item={item} isAr={isAr}
              isOwner={item.user_id === user?.id}
              onContact={handleContact}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: ORBIT_BAR_HEIGHT + 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🏠</Text>
              <Text style={styles.emptyTitle}>{isAr ? 'لا توجد نتائج' : 'Aucun résultat'}</Text>
              <Text style={styles.emptySub}>{isAr ? 'جرّب تغيير معايير البحث' : 'Essayez de modifier les filtres'}</Text>
            </View>
          }
        />
      )}

      {/* Post CTA */}
      <View style={styles.postCTA}>
        <TouchableOpacity
          style={styles.postBtn} activeOpacity={0.85}
          onPress={() => { setEditing(null); setShowModal(true); }}
        >
          <AppIcon name="addCircleOutline" size={19} color={Colors.primary} />
          <Text style={styles.postBtnText}>{isAr ? 'نشر إعلان سكن' : 'Publier une annonce'}</Text>
        </TouchableOpacity>
      </View>

      <PostModal
        visible={showModal} editing={editing} isAr={isAr}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSaved={handleSaved}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 8 },
  headerBackBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '700' },
  mineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
  },
  mineBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  mineBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  pendingDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: 16, marginHorizontal: Spacing.lg, marginBottom: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#fff', padding: 0, fontWeight: '500' },
  filterBar: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: 12, gap: 8, backgroundColor: Colors.surface },
  filterChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceVariant },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary, ...Shadows.brand },
  filterText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '700' },
  filterTextActive: { color: '#fff', fontWeight: '800' },
  priceFilterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: 8, paddingTop: 4, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 6, flexWrap: 'wrap' },
  priceFilterLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginRight: 2 },
  priceChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  priceChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  priceChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  priceChipTextActive: { color: '#D97706' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 16,
    ...Shadows.md,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 10 },
  ownerBadgeText: { fontSize: 11, fontWeight: '700' },
  rejectNote: { backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  rejectNoteText: { fontSize: 11, color: '#DC2626' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeText: { fontSize: 12, fontWeight: '700' },
  postedText: { fontSize: 11, color: Colors.textMuted },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  areaText: { fontSize: 12, color: Colors.textMuted },
  priceBox: { alignItems: 'flex-end', flexShrink: 0 },
  priceNum: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  priceCur: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tag: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: Colors.textSecondary },
  expandedBlock: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  descText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 14 },
  contactRow: { flexDirection: 'row', gap: 10 },
  contactBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  contactBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: Colors.primary + '50', borderRadius: 10, paddingVertical: 10, backgroundColor: Colors.primarySurface },
  editBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  chevronRow: { alignItems: 'center', marginTop: 6 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  emptySub: { fontSize: 14, color: Colors.textMuted },
  postCTA: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingHorizontal: Spacing.lg, paddingVertical: 12, paddingBottom: ORBIT_BAR_HEIGHT + 8 },
  postBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.primary + '50', borderRadius: 12, paddingVertical: 12, backgroundColor: Colors.primarySurface },
  postBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  // Modal
  modalHeader: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  modalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', alignItems: 'center', justifyContent: 'center' },
  modalSave: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  modalSaveText: { color: Colors.primary, fontWeight: '900', fontSize: 14 },
  fieldCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, ...Shadows.sm },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  typeBtnText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  pendingNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12 },
  pendingNoteText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
});
