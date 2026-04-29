import React from 'react';
import { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Phosphor from 'phosphor-react-native';
import type { IconProps as PhosphorIconProps } from 'phosphor-react-native';
import { ACTIVE_ICON_PACK, APP_ICON_SIZE_SCALE } from './config';
import { ION_ICON_MAP, type AppIconName } from './map.ionicons.auto';
import ionPhosphorName from './ionPhosphorName.json';

export type { AppIconName };

export interface AppIconProps {
  name: AppIconName;
  size: number;
  color?: string;
  style?: StyleProp<TextStyle | ViewStyle>;
}

type PhosphorRegistry = Record<string, React.ComponentType<PhosphorIconProps>>;

const PH_NAMES = ionPhosphorName as Record<string, string>;
const PH = Phosphor as unknown as PhosphorRegistry;

function PhosphorGlyph({
  ionGlyph,
  size,
  color,
  style,
}: {
  ionGlyph: string;
  size: number;
  color?: string;
  style?: StyleProp<TextStyle | ViewStyle>;
}) {
  const exportName = PH_NAMES[ionGlyph] ?? 'CircleIcon';
  const Comp = PH[exportName] ?? Phosphor.CircleIcon;
  return (
    <Comp
      size={size}
      color={color}
      weight="regular"
      style={style as PhosphorIconProps['style']}
    />
  );
}

export const AppIcon = React.memo(function AppIcon({
  name,
  size,
  color,
  style,
}: AppIconProps) {
  const glyph = ION_ICON_MAP[name];
  const scaled = Math.max(12, Math.round(size * APP_ICON_SIZE_SCALE));

  if (ACTIVE_ICON_PACK === 'phosphor') {
    return <PhosphorGlyph ionGlyph={glyph} size={scaled} color={color} style={style} />;
  }

  if (ACTIVE_ICON_PACK !== 'ionicons') {
    console.warn('[AppIcon] ACTIVE_ICON_PACK inconnu:', ACTIVE_ICON_PACK);
  }

  return <Ionicons name={glyph} size={scaled} color={color} style={style as TextStyle} />;
});
