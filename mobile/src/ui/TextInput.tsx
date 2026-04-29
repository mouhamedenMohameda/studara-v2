import React, { useImperativeHandle, useRef } from 'react';
import {
  TextInput as RNTextInput,
  TextInputProps,
  StyleProp,
  TextStyle,
} from 'react-native';
import { applyAppFont } from './applyAppFont';

function mergeStyles(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  return applyAppFont(style);
}

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  function TextInput({ style, ...rest }, ref) {
    const innerRef = useRef<RNTextInput>(null);

    useImperativeHandle(ref, () => innerRef.current as RNTextInput);

    return (
      <RNTextInput
        ref={innerRef}
        {...rest}
        style={mergeStyles(style)}
      />
    );
  },
);
