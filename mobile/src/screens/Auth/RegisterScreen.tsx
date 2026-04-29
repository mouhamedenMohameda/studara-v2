import React, { useState } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList, Faculty, University } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Input, Button } from '../../components/common';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Gradients, Shadows } from '../../theme';
import {
  FacultyOrInstitut,
  Filiere,
  UniversityNode,
} from '../../constants/academicStructure';
import { useAcademicStructure } from '../../hooks/useAcademicStructure';
import { safeBack } from '../../utils/safeBack';

type Nav = StackNavigationProp<AuthStackParamList, 'Register'>;

const YEARS = [1, 2, 3, 4, 5, 6, 7];

const RegisterScreen = () => {
  const navigation = useNavigation<Nav>();
  const { register } = useAuth();
  const { structure } = useAcademicStructure();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  // 3-level cascade: University → Faculty/Institut → Filière
  const [selectedUniv, setSelectedUniv] = useState<UniversityNode | null>(null);
  const [selectedFac, setSelectedFac]   = useState<FacultyOrInstitut | null>(null);
  const [selectedFil, setSelectedFil]   = useState<Filiere | null>(null);
  const [year, setYear]                 = useState<number | null>(null);

  const pickUniversity = (u: UniversityNode) => {
    setSelectedUniv(u); setSelectedFac(null); setSelectedFil(null);
  };
  const pickFaculty = (f: FacultyOrInstitut) => {
    setSelectedFac(f); setSelectedFil(null);
  };

  const handleNext = () => {
    if (!fullName.trim()) return Alert.alert('خطأ', 'الرجاء إدخال الاسم الكامل');
    if (!email.includes('@')) return Alert.alert('خطأ', 'البريد الإلكتروني غير صحيح');
    if (password.length < 8) return Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    if (password !== confirm) return Alert.alert('خطأ', 'كلمتا المرور غير متطابقتين');
    setStep(2);
  };

  const handleRegister = async () => {
    if (!selectedUniv) return Alert.alert('خطأ', 'الرجاء اختيار الجامعة / المؤسسة');
    if (!selectedFac)  return Alert.alert('خطأ', 'الرجاء اختيار الكلية / المعهد');
    if (!selectedFil)  return Alert.alert('خطأ', 'الرجاء اختيار التخصص (الفليير)');
    if (!year)         return Alert.alert('خطأ', 'الرجاء اختيار السنة الدراسية');
    try {
      setLoading(true);
      const result = await register({
        fullName, email, password,
        university: selectedUniv.slug as University,
        faculty:    selectedFac.slug as Faculty,
        filiere:    selectedFil.slug,
        year,
        referralCode: referralCode.trim() || undefined,
      });
      if (result.pending) {
        Alert.alert(
          '✅ تم إنشاء حسابك',
          'حسابك قيد المراجعة. سيتم تفعيله قريباً وستتمكن من تسجيل الدخول بعد الموافقة.',
          [{ text: 'حسناً', onPress: () => navigation.navigate('Login') }],
        );
      }
    } catch (e: any) {
      Alert.alert('خطأ في التسجيل', e.message || 'حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={Gradients.brand as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.topRow}>
            <TouchableOpacity
              onPress={() => step === 1 ? safeBack(navigation as any, { name: 'Login' }) : setStep(1)}
              style={styles.backBtn}
            >
              <AppIcon name="arrowBack" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>إنشاء حساب</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.stepsRow}>
            {[1, 2].map(s => (
              <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
            ))}
          </View>
          <Text style={styles.stepLabel}>
            {step === 1 ? '✨ معلومات الحساب' : '🎓 التخصص الجامعي'}
          </Text>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.formContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        removeClippedSubviews={false}
      >
        <View style={styles.card}>
          {step === 1 ? (
            <>
              <Input labelAr="الاسم الكامل" placeholder="أحمد ولد محمد" value={fullName} onChangeText={setFullName} icon='personOutline' autoComplete="name" autoCapitalize="words" />
              <Input labelAr="البريد الإلكتروني" placeholder="example@una.mr" value={email} onChangeText={setEmail} icon='mailOutline' keyboardType="email-address" autoCapitalize="none" autoComplete="email" rtl={false} />
              <Input labelAr="كلمة المرور" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry icon='lockClosedOutline' autoComplete="new-password" />
              <Input labelAr="تأكيد كلمة المرور" placeholder="••••••••" value={confirm} onChangeText={setConfirm} secureTextEntry icon='lockClosedOutline' autoComplete="new-password" />
              <Button title="التالي" onPress={handleNext} fullWidth icon='arrowForward' />
            </>
          ) : (
            <>
              {/* ── Level 1: University ── */}
              <Text style={styles.sectionLabel}>الجامعة / المؤسسة</Text>
              <View style={styles.chipsWrap}>
                {structure.map(u => (
                  <TouchableOpacity key={u.slug} style={[styles.chip, selectedUniv?.slug === u.slug && styles.chipActive]} onPress={() => pickUniversity(u)}>
                    <Text style={[styles.chipText, selectedUniv?.slug === u.slug && styles.chipTextActive]}>{u.nameAr}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Level 2: Faculty / Institut ── */}
              {selectedUniv && (
                <>
                  <Text style={styles.sectionLabel}>الكلية / المعهد</Text>
                  <View style={styles.chipsWrap}>
                    {selectedUniv.faculties.map(f => (
                      <TouchableOpacity key={f.slug} style={[styles.chip, selectedFac?.slug === f.slug && styles.chipActive]} onPress={() => pickFaculty(f)}>
                        <Text style={[styles.chipText, selectedFac?.slug === f.slug && styles.chipTextActive]}>
                          {f.type === 'institute' ? '🏛️ ' : f.type === 'preparatory' ? '🎓 ' : ''}{f.nameAr}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ── Level 3: Filière ── */}
              {selectedFac && (
                <>
                  <Text style={styles.sectionLabel}>التخصص (الفليير)</Text>
                  <View style={styles.chipsWrap}>
                    {selectedFac.filieres.map(fi => (
                      <TouchableOpacity key={fi.slug} style={[styles.chip, selectedFil?.slug === fi.slug && styles.chipActive]} onPress={() => setSelectedFil(fi)}>
                        <Text style={[styles.chipText, selectedFil?.slug === fi.slug && styles.chipTextActive]}>{fi.nameAr}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ── Summary badge ── */}
              {selectedUniv && selectedFac && selectedFil && (
                <View style={styles.summaryBadge}>
                  <AppIcon name="checkmarkCircle" size={16} color={Colors.primary} />
                  <Text style={styles.summaryText} numberOfLines={2}>
                    {selectedFil.nameAr} • {selectedFac.nameAr} • {selectedUniv.nameAr}
                  </Text>
                </View>
              )}

              {/* ── Year ── */}
              <Text style={styles.sectionLabel}>السنة الدراسية</Text>
              <View style={styles.yearsRow}>
                {YEARS.map(y => (
                  <TouchableOpacity key={y} style={[styles.yearCircle, year === y && styles.yearCircleActive]} onPress={() => setYear(y)}>
                    <Text style={[styles.yearText, year === y && styles.yearTextActive]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>كود الإحالة (اختياري)</Text>
              <Input
                labelAr=""
                placeholder="مثال: AB12CD34 — إذا أحالك صديق"
                value={referralCode}
                onChangeText={v => setReferralCode(v.replace(/\s/g, '').toUpperCase().slice(0, 8))}
                icon='giftOutline'
                autoCapitalize="characters"
              />
              <Button title="إنشاء الحساب" onPress={handleRegister} loading={loading} fullWidth />
            </>
          )}
        </View>

        {step === 1 && (
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>لديك حساب بالفعل؟ </Text>
            <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Login' })}>
              <Text style={styles.loginLink}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  header: { paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 8 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
  stepDot: { width: 28, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  stepDotActive: { backgroundColor: '#fff', width: 48 },
  stepLabel: { textAlign: 'center', color: '#fff', marginTop: 10, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  formContainer: { flexGrow: 1, backgroundColor: Colors.background, padding: Spacing.lg, paddingTop: Spacing.xl, marginTop: -12 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 24, padding: Spacing.xl,
    ...Shadows.md,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  sectionLabel: {
    fontSize: 14, fontWeight: '800', color: Colors.textPrimary,
    textAlign: 'right', marginBottom: 10, marginTop: 10,
    letterSpacing: 0.2,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginBottom: Spacing.md },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: BorderRadius.full, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.surfaceVariant,
  },
  chipActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  chipText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  summaryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primarySurface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.primarySoft,
    padding: 12, marginBottom: Spacing.md,
  },
  summaryText: { flex: 1, fontSize: 12, color: Colors.primaryDark, textAlign: 'right', fontWeight: '700', lineHeight: 18 },
  yearsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: Spacing.xl, flexWrap: 'wrap' },
  yearCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  yearCircleActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
    ...Shadows.brand,
  },
  yearText: { fontSize: 17, fontWeight: '800', color: Colors.textSecondary },
  yearTextActive: { color: '#fff' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl, paddingBottom: Spacing.xl },
  loginText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  loginLink: { color: Colors.primary, fontSize: 14, fontWeight: '800' },
});

export default RegisterScreen;
