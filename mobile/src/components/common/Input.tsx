import React, { useState, useRef } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import { Text } from '@/ui/Text';
import { applyAppFont } from '@/ui/applyAppFont';
import { View, TouchableOpacity, Pressable, StyleSheet, KeyboardTypeOptions, TextInput as RNTextInput } from 'react-native';

import { Colors, Spacing, BorderRadius } from '../../theme';

interface InputProps {
  label?: string;
  labelAr?: string;
  placeholder?: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  hint?: string;
  icon?: AppIconName;
  rtl?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'off' | 'email' | 'name' | 'password' | 'new-password' | 'username';
  onFocus?: () => void;
  onBlur?: () => void;
}

const Input: React.FC<InputProps> = ({
  label, labelAr, placeholder, value, onChangeText,
  secureTextEntry = false, keyboardType = 'default', error, hint, icon, rtl = true,
  autoCapitalize = 'none', autoComplete = 'off',
  onFocus, onBlur,
}) => {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<RNTextInput>(null);

  return (
    <View style={styles.container}>
      {(labelAr || label) && (
        <Text style={[styles.label, rtl ? { textAlign: 'right' } : { textAlign: 'left' }]}>
          {labelAr || label}
        </Text>
      )}
      <Pressable
        accessibilityRole="none"
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.inputWrap,
          focused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
      >
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppIcon
              name={showPassword ? 'eyeOffOutline' : 'eyeOutline'}
              size={20}
              color={focused ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
        <RNTextInput
          ref={inputRef}
          style={applyAppFont([styles.input, rtl && styles.rtl])}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          showSoftInputOnFocus
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          spellCheck={false}
          textAlign={rtl ? 'right' : 'left'}
          importantForAutofill={autoComplete === 'off' ? 'no' : 'yes'}
          collapsable={false}
        />
        {icon && (
          <View style={[styles.iconWrap, focused && styles.iconWrapFocused]} pointerEvents="none">
            <AppIcon
              name={icon}
              size={18}
              color={focused ? Colors.primary : Colors.textMuted}
            />
          </View>
        )}
      </Pressable>
      {error && (
        <View style={[styles.hintRow, rtl && styles.hintRowRtl]}>
          <AppIcon name="alertCircle" size={14} color={Colors.error} />
          <Text style={[styles.errorText, rtl ? { textAlign: 'right' } : { textAlign: 'left' }]}>{error}</Text>
        </View>
      )}
      {hint && !error && (
        <Text style={[styles.hintText, rtl ? { textAlign: 'right' } : { textAlign: 'left' }]}>{hint}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.base },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.base,
    minHeight: 54,
  },
  inputFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  inputError: {
    borderColor: Colors.error,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  rtl: { textAlign: 'right' },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    backgroundColor: Colors.surfaceVariant,
  },
  iconWrapFocused: {
    backgroundColor: Colors.primarySurface,
  },
  eyeBtn: {
    padding: 6,
    marginRight: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  hintRowRtl: {
    flexDirection: 'row-reverse',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.error,
    flex: 1,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
});

export default Input;
