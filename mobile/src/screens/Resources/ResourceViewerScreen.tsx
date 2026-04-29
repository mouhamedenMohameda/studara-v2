import React, { useState, useEffect, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ResourcesStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { smoothGoHomeTab } from '../../utils/smoothTabBack';

type Route    = RouteProp<ResourcesStackParamList, 'ResourceViewer'>;
type DlState  = 'checking' | 'downloading' | 'ready' | 'error';

const SERVER_BASE = 'https://api.radar-mr.com';

const normalizeUrl = (url: string): string => {
  const u = (url ?? '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('/')) return `${SERVER_BASE}${u}`;
  // Common backend links sometimes come without protocol
  if (u.startsWith('api.radar-mr.com')) return `https://${u}`;
  if (u.startsWith('5.189.153.144')) return `http://${u}`;
  if (u.includes('api.radar-mr.com') && !u.startsWith('http')) return `https://${u}`;
  if (u.includes('drive.google.com') && !u.startsWith('http')) return `https://${u}`;
  return `https://${u}`;
};

const toAbsolute = (url: string) => normalizeUrl(url);

/** Extract Google Drive file ID from any Drive URL format */
const driveId = (url: string): string | null => {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  return m ? m[1] : null;
};

/** Drive embedded viewer with zoom enabled */
const buildDriveHtml = (fileId: string): string => `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=yes,minimum-scale=0.5,maximum-scale=5">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#18181b;overflow:hidden}
    .wrap{position:fixed;top:0;left:0;right:0;bottom:0;overflow:hidden}
    iframe{position:absolute;top:-52px;left:0;width:100%;height:calc(100% + 52px);border:none}
  </style>
</head><body>
  <div class="wrap">
    <iframe src="https://drive.google.com/file/d/${fileId}/preview"
            allow="autoplay" allowfullscreen></iframe>
  </div>
</body></html>`;

/** Is this URL served by our own backend? */
const isServerFile = (url: string) =>
  url.startsWith('/') ||
  url.includes('5.189.153.144') ||
  url.includes('api.radar-mr.com');

/** Build a YouTube / Drive video embed URI */
const toVideoEmbed = (url: string): string => {
  const abs = toAbsolute(url);
  const id  = driveId(abs);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  const short = abs.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (short) return `https://www.youtube.com/embed/${short[1]}`;
  const watch = abs.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watch) {
    const list = abs.match(/[?&]list=([^&]+)/);
    return `https://www.youtube.com/embed/${watch[1]}${list ? `?list=${list[1]}` : ''}`;
  }
  if (abs.includes('youtube') || abs.includes('youtu')) {
    const pl = abs.match(/[?&]list=([^&]+)/);
    if (pl) return `https://www.youtube.com/embed/videoseries?list=${pl[1]}`;
  }
  return abs;
};

export default function ResourceViewerScreen() {
  const navigation = useNavigation();
  const { params: { resource } } = useRoute<Route>();
  const { token } = useAuth();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const backToHomeIfRoot = () => {
    const state = (navigation as any)?.getState?.();
    const routesLen = Array.isArray(state?.routes) ? state.routes.length : 0;
    if (routesLen > 1 && (navigation as any)?.goBack) {
      (navigation as any).goBack();
      return;
    }
    smoothGoHomeTab(navigation as any);
  };

  const rawUrl      = resource.fileUrl || '';
  const absUrl      = toAbsolute(rawUrl);
  const driveFileId = driveId(absUrl);

  const isServerCandidate = isServerFile(rawUrl);
  const isServer  = isServerCandidate && !!token;
  // All server files become PDFs (LibreOffice converts Office formats server-side)
  const cachePath = `${FileSystem.cacheDirectory}preview_${resource.id}.pdf`;

  // Use server preview URL with token in query (works cross-platform via Google Docs viewer).
  const previewUrlWithToken =
    isServer && token ? `${SERVER_BASE}/api/v1/resources/${resource.id}/preview?t=${encodeURIComponent(token)}` : null;

  const [dlState,   setDlState]   = useState<DlState>(isServer ? 'checking' : 'ready');
  const [localUri,  setLocalUri]  = useState<string | null>(null);
  const [wvLoading, setWvLoading] = useState(true);
  const [wvError,   setWvError]   = useState(false);
  const [retryKey,  setRetryKey]  = useState(0);
  const [openedExternal, setOpenedExternal] = useState(false);
  const [openAttempted, setOpenAttempted] = useState(false);
  const [lastHttpStatus, setLastHttpStatus] = useState<number | null>(null);
  const [lastErr, setLastErr] = useState<string | null>(null);

  // ── Download / cache check ─────────────────────────────────────────────
  useEffect(() => {
    if (!isServer) return;
    let cancelled = false;

    (async () => {
      try {
        setDlState('checking');
        setWvError(false);
        setLastHttpStatus(null);
        setLastErr(null);

        // Serve from cache when available
        const info = await FileSystem.getInfoAsync(cachePath);
        if (!cancelled && info.exists) {
          setLocalUri(cachePath);
          setDlState('ready');
          return;
        }
        if (cancelled) return;

        setDlState('downloading');

        // Some backends don't implement /preview (404). In that case, try direct fileUrl.
        // Order matters: preview first, then direct uploads URL.
        const candidates: { label: string; url: string; headers?: Record<string, string> }[] = [];
        if (previewUrlWithToken) candidates.push({ label: 'preview?t', url: previewUrlWithToken });
        candidates.push({
          label: 'preview(auth)',
          url: `${SERVER_BASE}/api/v1/resources/${resource.id}/preview`,
          headers: { Authorization: `Bearer ${token}` },
        });
        // Direct fileUrl (common: /uploads/...)
        if (rawUrl) {
          const directAbs = absUrl;
          if (directAbs) {
            candidates.push({ label: 'fileUrl', url: directAbs });
            candidates.push({ label: 'fileUrl?t', url: token ? `${directAbs}${directAbs.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}` : directAbs });
          }
        }

        let lastStatus: number | null = null;
        let lastMsg: string | null = null;
        let successUri: string | null = null;

        for (const c of candidates) {
          if (cancelled) return;
          try {
            const result = await FileSystem.downloadAsync(c.url, cachePath, c.headers ? { headers: c.headers } : undefined);
            lastStatus = result?.status ?? null;
            if (result && result.status === 200) {
              successUri = result.uri;
              lastMsg = null;
              break;
            }
          } catch (e: any) {
            lastMsg = `${c.label}: ${e?.message ? String(e.message) : 'download_failed'}`;
          }
        }

        if (cancelled) return;
        if (!successUri) {
          setLastHttpStatus(lastStatus);
          await FileSystem.deleteAsync(cachePath, { idempotent: true });
          throw new Error(lastMsg ?? `download_failed status=${lastStatus ?? 'none'}`);
        }

        setLastHttpStatus(200);
        setLocalUri(successUri);
        setDlState('ready');
      } catch (err: any) {
        console.warn('[ResourceViewer]', err?.message, { resourceId: resource.id, isServer, hasToken: !!token });
        if (cancelled) return;
        setLastErr(err?.message ? String(err.message) : 'unknown_error');
        setDlState('error');
      }
    })();

    return () => { cancelled = true; };
  }, [retryKey, previewUrlWithToken, isServer, token, resource.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNative = useCallback(async () => {
    if (!localUri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
      await Sharing.shareAsync(localUri, {
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
      });
      setOpenedExternal(true);
    } catch {
      setWvError(true);
    }
  }, [localUri]);

  // Once cached, open with native viewer (QuickLook iOS / chooser Android).
  useEffect(() => {
    if (!isServer) return;
    if (dlState !== 'ready' || !localUri) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        if (openAttempted) return;
        setOpenAttempted(true);
        await openNative();
      } catch {
        // User can still open in browser.
      }
    })();
    return () => { cancelled = true; };
  }, [dlState, localUri, isServer, openAttempted, openNative]);

  const androidExternalUrl =
    driveFileId
      ? `https://drive.google.com/file/d/${driveFileId}/preview`
      : previewUrlWithToken || null;

  const browserFallbackUrl = androidExternalUrl || absUrl || null;

  const openInBrowser = async () => {
    if (!browserFallbackUrl) return;
    try {
      setOpenedExternal(false);
      const can = await Linking.canOpenURL(browserFallbackUrl);
      if (!can) throw new Error('cannot_open_url');
      await Linking.openURL(browserFallbackUrl);
      setOpenedExternal(true);
    } catch {
      setWvError(true);
    }
  };

  const handleRetry = async () => {
    // Delete cached file so we re-download fresh
    const info = await FileSystem.getInfoAsync(cachePath);
    if (info.exists) await FileSystem.deleteAsync(cachePath, { idempotent: true });
    setWvError(false);
    setLocalUri(null);
    setDlState('checking');
    setRetryKey(k => k + 1);
  };

  // ── WebView source ─────────────────────────────────────────────────────
  const webViewSource = (() => {
    if (driveFileId)              return { html: buildDriveHtml(driveFileId) };
    // Server files: prefer native open (download + shareAsync). WebView PDF is unreliable.
    if (!isServer) {
      // Non-server resources can be video OR regular URLs (pdf/web).
      const u = absUrl || rawUrl;
      const isProbablyPdf =
        (resource.fileType?.toLowerCase?.() === 'pdf') ||
        /\.pdf(\?|#|$)/i.test(u);
      if (isProbablyPdf) return { uri: u };
      return { uri: toVideoEmbed(u) };
    }
    return null;
  })();

  const showLoader = dlState === 'checking' || dlState === 'downloading';
  const showError  = dlState === 'error' || wvError;

  return (
    <View style={{ flex: 1, backgroundColor: '#18181b' }}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={backToHomeIfRoot} style={styles.iconBtn}>
          <AppIcon name={isAr ? 'arrowForward' : 'arrowBack'} size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.title} numberOfLines={1}>
            {resource.titleAr || resource.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {resource.subject}
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {showError ? (
        <View style={styles.centerBox}>
          <AppIcon name="alertCircleOutline" size={56} color="#f87171" />
          <Text style={styles.errorTitle}>تعذّر تحميل الملف</Text>
          {!!lastHttpStatus && (
            <Text style={[styles.loadingText, { textAlign: 'center' }]}>
              {`HTTP ${lastHttpStatus}`}
            </Text>
          )}
          {!!lastErr && (
            <Text style={[styles.loadingText, { textAlign: 'center' }]}>
              {lastErr}
            </Text>
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <AppIcon name="refreshOutline" size={18} color="#fff" />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
          {!!browserFallbackUrl && (
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151' }]}
              onPress={openInBrowser}
            >
              <AppIcon name="openOutline" size={18} color="#fff" />
              <Text style={styles.retryText}>فتح في المتصفح</Text>
            </TouchableOpacity>
          )}
        </View>

      ) : showLoader ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>
            {dlState === 'downloading' ? 'جاري تحميل الملف…' : 'جاري تجهيز الملف…'}
          </Text>
        </View>

      ) : isServerCandidate && !token ? (
        <View style={styles.centerBox}>
          <AppIcon name="lockClosedOutline" size={56} color="#a1a1aa" />
          <Text style={styles.errorTitle}>تسجيل الدخول مطلوب</Text>
          {!!browserFallbackUrl && (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={openInBrowser}
            >
              <AppIcon name="openOutline" size={18} color="#fff" />
              <Text style={styles.retryText}>فتح في المتصفح</Text>
            </TouchableOpacity>
          )}
        </View>

      ) : isServer ? (
        <View style={styles.centerBox}>
          <Text style={styles.loadingText}>
            {openedExternal ? 'تم فتح الملف' : 'اضغط لفتح الملف'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={openNative}>
            <AppIcon name="documentTextOutline" size={18} color="#fff" />
            <Text style={styles.retryText}>فتح الملف</Text>
          </TouchableOpacity>
          {!!androidExternalUrl && (
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151' }]}
              onPress={openInBrowser}
            >
              <AppIcon name="openOutline" size={18} color="#fff" />
              <Text style={styles.retryText}>فتح في المتصفح</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#374151' }]}
            onPress={backToHomeIfRoot}
          >
            <Text style={styles.retryText}>رجوع</Text>
          </TouchableOpacity>
        </View>

      ) : webViewSource ? (
        <>
          <WebView
            key={retryKey}
            source={webViewSource}
            style={{ flex: 1, backgroundColor: '#18181b' }}
            onLoadStart={() => { setWvLoading(true);  setWvError(false); }}
            onLoadEnd={()   =>   setWvLoading(false)}
            onError={()     => { setWvLoading(false); setWvError(true); }}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            originWhitelist={['*']}
            mixedContentMode="always"
            scalesPageToFit
            pinchGestureEnabled
          />
          {wvLoading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#8B5CF6" />
              <Text style={styles.loadingText}>جاري فتح الملف…</Text>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 10, paddingBottom: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'right' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginTop: 2 },
  centerBox: {
    flex: 1, backgroundColor: '#18181b',
    alignItems: 'center', justifyContent: 'center',
    gap: 16, padding: 32,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#18181b',
    alignItems: 'center', justifyContent: 'center', gap: 14,
    top: 70,
  },
  loadingText: { fontSize: 14, color: '#a1a1aa' },
  errorTitle:  { fontSize: 18, fontWeight: '700', color: '#f4f4f5', textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#374151', paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14, marginTop: 4,
  },
  retryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
