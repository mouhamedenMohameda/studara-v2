import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKaTeXHtml } from './MathHtml';

type Props = {
  content: string;
  textColor?: string;
  backgroundColor?: string;
};

export function MathText({ content, textColor, backgroundColor }: Props) {
  const html = useMemo(
    () => buildKaTeXHtml({ content, textColor, backgroundColor, title: 'Studara Math' }),
    [content, textColor, backgroundColor],
  );
  const [height, setHeight] = useState(1);

  const onMessage = useCallback((ev: any) => {
    const n = Number(ev?.nativeEvent?.data);
    if (Number.isFinite(n) && n > 0) setHeight(Math.min(2400, Math.max(20, n)));
  }, []);

  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={[styles.web, { height }]}
        scrollEnabled={false}
        javaScriptEnabled
        automaticallyAdjustContentInsets={false}
        onMessage={onMessage}
        injectedJavaScript={`
          (function() {
            function postHeight() {
              var el = document.body;
              var h = Math.max(
                el.scrollHeight,
                el.offsetHeight,
                document.documentElement ? document.documentElement.scrollHeight : 0
              );
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(h));
            }
            setTimeout(postHeight, 50);
            setTimeout(postHeight, 250);
            setTimeout(postHeight, 700);
            window.addEventListener('resize', postHeight);
          })();
          true;
        `}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  web: { backgroundColor: 'transparent' },
});

