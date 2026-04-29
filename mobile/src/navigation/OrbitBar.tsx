/**
 * OrbitBar — Floating gradient command dock (v2, vibrant Gen-Z)
 * Tap `+` to fan out 6 satellite icons above; Home / Profile slide in from
 * the sides. Tap outside or on a satellite to close.
 */

import React, { useRef, useState, useCallback, memo } from 'react';
import { AppIcon, type AppIconName } from '@/icons';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '../theme';
import { useTheme } from '../context/ThemeContext';

// ── Arc geometry — computed ONCE at module level ─────────────────────────────
const RADIUS = 112;
const SAT_ANGLES = [162, 132, 102, 72, 42, 12];
const SAT_POSITIONS = SAT_ANGLES.map(deg => {
  const rad = (deg * Math.PI) / 180;
  return { x: RADIUS * Math.cos(rad), y: -RADIUS * Math.sin(rad) };
});

const EASE_OPEN_BTN  = Easing.out(Easing.back(1.6));
const EASE_OPEN_SAT  = Easing.out(Easing.back(1.7));
const EASE_OPEN_SIDE = Easing.out(Easing.quad);
const EASE_CLOSE     = Easing.in(Easing.quad);

export type OrbitTabName =
  | 'Home' | 'Resources' | 'Timetable' | 'Courses'
  | 'Flashcards' | 'Jobs' | 'Reminders' | 'Housing' | 'Profile';

const SATELLITES: { name: OrbitTabName; icon: AppIconName; color: string }[] = [
  { name: 'Resources',  icon: 'libraryOutline',   color: '#7C3AED' },
  { name: 'Timetable',  icon: 'calendarOutline',  color: '#0EA5E9' },
  { name: 'Flashcards', icon: 'albumsOutline',    color: '#06B6D4' },
  { name: 'Jobs',       icon: 'briefcaseOutline', color: '#F97316' },
  { name: 'Housing',    icon: 'homeOutline',      color: '#F59E0B' },
  { name: 'Reminders',  icon: 'alarmOutline',     color: '#EC4899' },
];

const SAFE_BOTTOM_FALLBACK = Platform.OS === 'ios' ? 20 : 12;
const CMD_SIZE    = 58;
const SIDE_BTN_W  = 70;

export const ORBIT_BAR_HEIGHT = CMD_SIZE + 34 + 16;

interface SatelliteProps {
  sat:      typeof SATELLITES[number];
  anim:     Animated.Value;
  tx:       Animated.AnimatedInterpolation<number>;
  ty:       Animated.AnimatedInterpolation<number>;
  sc:       Animated.AnimatedInterpolation<number>;
  isActive: boolean;
  onPress:  (name: OrbitTabName) => void;
}
const SatelliteButton = memo(({ sat, anim, tx, ty, sc, isActive, onPress }: SatelliteProps) => {
  const { colors: C } = useTheme();
  return (
    <Animated.View
      style={[
        styles.satellite,
        {
          opacity: anim,
          transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
          backgroundColor: isActive ? sat.color : C.surface,
          borderColor:     isActive ? sat.color : C.border,
          shadowColor:     sat.color,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.satelliteInner}
        onPress={() => onPress(sat.name)}
        activeOpacity={0.8}
      >
        <AppIcon name={sat.icon} size={24} color={isActive ? '#FFFFFF' : sat.color} />
      </TouchableOpacity>
    </Animated.View>
  );
});

interface OrbitBarProps {
  activeTab: OrbitTabName;
  onTabPress: (name: OrbitTabName) => void;
}

function OrbitBar({ activeTab, onTabPress }: OrbitBarProps) {
  const [open, setOpen] = useState(false);
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();

  const bottomInset = Math.max(insets.bottom, SAFE_BOTTOM_FALLBACK);
  const arcBottom   = bottomInset + CMD_SIZE / 2 + 4;

  const animsRef = useRef<Animated.Value[] | null>(null);
  if (!animsRef.current) animsRef.current = SATELLITES.map(() => new Animated.Value(0));
  const anims = animsRef.current;

  const rotateAnimRef = useRef<Animated.Value | null>(null);
  if (!rotateAnimRef.current) rotateAnimRef.current = new Animated.Value(0);
  const rotateAnim = rotateAnimRef.current;

  const sideAnimRef = useRef<Animated.Value | null>(null);
  if (!sideAnimRef.current) sideAnimRef.current = new Animated.Value(0);
  const sideAnim = sideAnimRef.current;

  const interpRef = useRef<{
    tx:      Animated.AnimatedInterpolation<number>[];
    ty:      Animated.AnimatedInterpolation<number>[];
    sc:      Animated.AnimatedInterpolation<number>[];
    plusRot: Animated.AnimatedInterpolation<string>;
    homeTX:  Animated.AnimatedInterpolation<number>;
    profTX:  Animated.AnimatedInterpolation<number>;
  } | null>(null);
  if (!interpRef.current) {
    interpRef.current = {
      tx:      anims.map((a, i) => a.interpolate({ inputRange: [0, 1], outputRange: [0, SAT_POSITIONS[i].x] })),
      ty:      anims.map((a, i) => a.interpolate({ inputRange: [0, 1], outputRange: [0, SAT_POSITIONS[i].y] })),
      sc:      anims.map(a      => a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })),
      plusRot: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }),
      homeTX:  sideAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }),
      profTX:  sideAnim.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }),
    };
  }
  const I = interpRef.current;

  const openArc = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(rotateAnim, { toValue: 1, duration: 260, easing: EASE_OPEN_BTN,  useNativeDriver: true }),
        Animated.timing(sideAnim,   { toValue: 1, duration: 220, easing: EASE_OPEN_SIDE, useNativeDriver: true }),
        ...anims.map((a, i) =>
          Animated.timing(a, { toValue: 1, delay: i * 32, duration: 240, easing: EASE_OPEN_SAT, useNativeDriver: true })
        ),
      ]).start();
    });
  }, [anims, rotateAnim, sideAnim]);

  const closeArc = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(rotateAnim, { toValue: 0, duration: 180, easing: EASE_CLOSE, useNativeDriver: true }),
      Animated.timing(sideAnim,   { toValue: 0, duration: 160, easing: EASE_CLOSE, useNativeDriver: true }),
      ...anims.map((a, i) =>
        Animated.timing(a, { toValue: 0, delay: i * 18, duration: 140, easing: EASE_CLOSE, useNativeDriver: true })
      ),
    ]).start(() => { setOpen(false); cb?.(); });
  }, [anims, rotateAnim, sideAnim]);

  const handleSatellite = useCallback((name: OrbitTabName) => {
    closeArc(() => onTabPress(name));
  }, [closeArc, onTabPress]);

  const handleToggle  = useCallback(() => { if (open) closeArc(); else openArc(); }, [open, openArc, closeArc]);
  const handleHome    = useCallback(() => { closeArc(() => onTabPress('Home'));    }, [closeArc, onTabPress]);
  const handleProfile = useCallback(() => { closeArc(() => onTabPress('Profile')); }, [closeArc, onTabPress]);

  const isHome    = activeTab === 'Home';
  const isProfile = activeTab === 'Profile';

  return (
    <View style={styles.wrapper} pointerEvents="box-none">

      {/* Backdrop */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => closeArc()}
        pointerEvents={open ? 'auto' : 'none'}
      />

      {open && (
        <View style={[styles.arcAnchor, { bottom: arcBottom }]} pointerEvents="box-none">
          {SATELLITES.map((sat, i) => (
            <SatelliteButton
              key={sat.name}
              sat={sat}
              anim={anims[i]}
              tx={I.tx[i]}
              ty={I.ty[i]}
              sc={I.sc[i]}
              isActive={activeTab === sat.name}
              onPress={handleSatellite}
            />
          ))}
        </View>
      )}

      {/* Floating dock row */}
      <View style={[styles.dockRow, { marginBottom: bottomInset }]}>

        {/* Home */}
        <Animated.View
          style={{ opacity: sideAnim, transform: [{ translateX: I.homeTX }] }}
          pointerEvents={open ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={[
              styles.sideBtn,
              { backgroundColor: C.surface, borderColor: C.border },
              isHome ? styles.sideBtnActive : undefined,
            ]}
            onPress={handleHome}
            activeOpacity={0.75}
          >
            <AppIcon
              name={isHome ? 'home' : 'homeOutline'}
              size={22}
              color={isHome ? Colors.primary : C.textMuted}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Command button — gradient violet → pink → sunset */}
        <TouchableOpacity
          onPress={handleToggle}
          activeOpacity={0.85}
          style={styles.commandBtnWrap}
        >
          <LinearGradient
            colors={Gradients.brand as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.commandBtn}
          >
            <Animated.View style={{ transform: [{ rotate: I.plusRot }] }}>
              <AppIcon name='add' size={30} color="#FFFFFF" />
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Profile */}
        <Animated.View
          style={{ opacity: sideAnim, transform: [{ translateX: I.profTX }] }}
          pointerEvents={open ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={[
              styles.sideBtn,
              { backgroundColor: C.surface, borderColor: C.border },
              isProfile ? styles.sideBtnActive : undefined,
            ]}
            onPress={handleProfile}
            activeOpacity={0.75}
          >
            <AppIcon
              name={isProfile ? 'personCircle' : 'personCircleOutline'}
              size={24}
              color={isProfile ? Colors.primary : C.textMuted}
            />
          </TouchableOpacity>
        </Animated.View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },

  arcAnchor: {
    position: 'absolute',
    alignSelf: 'center',
    width: 0,
    height: 0,
    zIndex: 998,
  },

  satellite: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -28,
    marginTop: -28,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  satelliteInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  sideBtn: {
    width: SIDE_BTN_W,
    height: CMD_SIZE,
    borderRadius: CMD_SIZE / 2,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F0A1F',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sideBtnActive: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primarySoft,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },

  commandBtnWrap: {
    borderRadius: CMD_SIZE / 2,
    shadowColor: Colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  commandBtn: {
    width: CMD_SIZE,
    height: CMD_SIZE,
    borderRadius: CMD_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});

export default memo(OrbitBar);
