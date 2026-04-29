import React from 'react';
import { Text as RNText, TextProps, StyleProp, TextStyle } from 'react-native';
import { applyAppFont } from './applyAppFont';

function mergeStyles(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  return applyAppFont(style);
}

export const Text = React.forwardRef<RNText, TextProps>(function Text(
  { style, ...rest },
  ref,
) {
  return <RNText ref={ref} {...rest} style={mergeStyles(style)} />;
});
