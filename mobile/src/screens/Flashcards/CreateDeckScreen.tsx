import React, { useState, useEffect } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { View, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FlashcardsStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Spacing, BorderRadius } from '../../theme';
import { safeBack } from '../../utils/safeBack';

import { apiRequest } from '../../utils/api';
type Nav   = StackNavigationProp<FlashcardsStackParamList, 'CreateDeck'>;
type Route = RouteProp<FlashcardsStackParamList, 'CreateDeck'>;

const ACCENT = '#06B6D4'; // cyan-500 (flashcards module)

const COLORS = [
  '#8B5CF6', '#0891B2', '#10B981', '#EF4444',
  '#F59E0B', '#EC4899', '#6366F1', '#14B8A6',
];

interface CardDraft { front: string; back: string; id: string }

export default function CreateDeckScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { token } = useAuth();

  const editingDeck = route.params?.deck;
  const isEdit = !!editingDeck;

  const [title, setTitle]     = useState(editingDeck?.title ?? '');
  const [subject, setSubject] = useState(editingDeck?.subject ?? '');
  const [color, setColor]     = useState(editingDeck?.color ?? '#8B5CF6');
  const [cards, setCards]     = useState<CardDraft[]>([
    { front: '', back: '', id: Math.random().toString() },
  ]);
  const [saving, setSaving] = useState(false);

  // Load existing cards when editing
  useEffect(() => {
    if (!isEdit || !token) return;
    (async () => {
      try {
        const d = await apiRequest<{ cards?: any[] }>(`/flashcards/decks/${editingDeck.id}`, { token });
        if (d.cards?.length) {
          setCards(d.cards.map((c: any) => ({ id: c.id, front: c.front, back: c.back })));
        }
      } catch (e) { console.error(e); }
    })();
  }, [isEdit, editingDeck?.id, token]);

  const addCard = () => {
    setCards(prev => [...prev, { front: '', back: '', id: Math.random().toString() }]);
  };

  const updateCard = (id: string, field: 'front' | 'back', value: string) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCard = (id: string) => {
    if (cards.length === 1) return;
    setCards(prev => prev.filter(c => c.id !== id));
  };

  const save = async () => {
    if (!title.trim()) { Alert.alert('خطأ', 'الرجاء إدخال عنوان للمجموعة'); return; }
    const validCards = cards.filter(c => c.front.trim() && c.back.trim());
    if (!isEdit && validCards.length === 0) {
      Alert.alert('خطأ', 'أضف بطاقة واحدة على الأقل بوجهين');
      return;
    }

    setSaving(true);
    try {
      let deckId: string;

      if (isEdit) {
        // Update deck metadata
        const d = await apiRequest<{ id: string }>(`/flashcards/decks/${editingDeck.id}`, {
          method: 'PUT', token,
          body: { title: title.trim(), subject: subject.trim() || undefined, color },
        });
        deckId = d.id;
      } else {
        // Create new deck
        const d = await apiRequest<{ id: string }>('/flashcards/decks', {
          method: 'POST', token,
          body: { title: title.trim(), subject: subject.trim() || undefined, color },
        });
        deckId = d.id;
      }

      // Add new cards (those with numeric-looking temp IDs / empty UUIDs)
      for (const card of validCards) {
        const isNewCard = !card.id.includes('-') || card.id.length < 30;
        if (isNewCard) {
          await apiRequest(`/flashcards/decks/${deckId}/cards`, {
            method: 'POST', token,
            body: { front: card.front.trim(), back: card.back.trim() },
          });
        } else {
          // Update existing card
          await apiRequest(`/flashcards/cards/${card.id}`, {
            method: 'PUT', token,
            body: { front: card.front.trim(), back: card.back.trim() },
          });
        }
      }

      safeBack(navigation as any, { name: 'Explore', params: { screen: 'Flashcards' } });
    } catch (e) {
      Alert.alert('خطأ', 'تعذّر الحفظ، حاول مجدداً');
      console.error('save deck:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F9FAFB' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={ACCENT} />

      {/* Header */}
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Flashcards' } })} style={styles.backBtn}>
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {isEdit ? 'تعديل المجموعة' : 'مجموعة جديدة'}
            </Text>
            <TouchableOpacity
              onPress={save}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>حفظ</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, gap: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Deck metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>عنوان المجموعة *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="مثال: الجبر الخطي — الفصل الأول"
            placeholderTextColor="#9CA3AF"
            textAlign="right"
          />

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>المادة (اختياري)</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="مثال: رياضيات S3"
            placeholderTextColor="#9CA3AF"
            textAlign="right"
          />

          {/* Color picker */}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>لون المجموعة</Text>
          <View style={styles.colorRow}>
            {COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                onPress={() => setColor(c)}
              >
                {color === c && <AppIcon name='checkmark' size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cards */}
        <Text style={styles.cardsHeader}>البطاقات ({cards.length})</Text>

        {cards.map((card, idx) => (
          <View key={card.id} style={styles.cardEditor}>
            <View style={styles.cardEditorHeader}>
              <Text style={styles.cardNum}>بطاقة {idx + 1}</Text>
              {cards.length > 1 && (
                <TouchableOpacity onPress={() => removeCard(card.id)}>
                  <AppIcon name="trashOutline" size={18} color="#F87171" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.cardFace}>
              <Text style={styles.faceLabel}>الوجه الأمامي (السؤال)</Text>
              <TextInput
                style={styles.faceInput}
                value={card.front}
                onChangeText={v => updateCard(card.id, 'front', v)}
                placeholder="اكتب السؤال أو المفهوم..."
                placeholderTextColor="#9CA3AF"
                multiline
                textAlign="right"
              />
            </View>

            <View style={[styles.cardFace, { backgroundColor: '#F0FDFE', borderColor: ACCENT + '44' }]}>
              <Text style={[styles.faceLabel, { color: ACCENT }]}>الوجه الخلفي (الإجابة)</Text>
              <TextInput
                style={[styles.faceInput, { color: '#0E7490' }]}
                value={card.back}
                onChangeText={v => updateCard(card.id, 'back', v)}
                placeholder="اكتب الإجابة أو الشرح..."
                placeholderTextColor="#7DD3E8"
                multiline
                textAlign="right"
              />
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addCardBtn} onPress={addCard}>
          <AppIcon name="addCircleOutline" size={20} color={ACCENT} />
          <Text style={styles.addCardText}>إضافة بطاقة</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: ACCENT, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: BorderRadius.full,
  },
  saveBtnText: { color: ACCENT, fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },

  section: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: BorderRadius.md,
    padding: 10, fontSize: 14, color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  colorDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  colorDotActive: {
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },

  cardsHeader: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'right' },

  cardEditor: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardEditorHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cardNum: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  cardFace: {
    padding: Spacing.md,
    backgroundColor: '#FFFBF0',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    borderTopColor: '#F3F4F6',
    borderWidth: 0,
  },
  faceLabel: { fontSize: 11, fontWeight: '600', color: '#D97706', marginBottom: 6, textAlign: 'right' },
  faceInput: {
    fontSize: 14, color: '#111827',
    minHeight: 60, textAlignVertical: 'top',
  },

  addCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 2, borderColor: ACCENT, borderStyle: 'dashed',
    borderRadius: BorderRadius.lg, paddingVertical: 14,
    backgroundColor: '#F0FDFE',
  },
  addCardText: { fontSize: 15, fontWeight: '700', color: ACCENT },
});
