import React, { useState, useCallback } from 'react';
import { AppIcon } from '@/icons';
import { Text } from '@/ui/Text';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Linking, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import YoutubePlayer from 'react-native-youtube-iframe';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { CoursesStackParamList } from '../../types';
import { safeBack } from '../../utils/safeBack';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PLAYER_HEIGHT = Math.round((SCREEN_WIDTH * 9) / 16);

type Route = RouteProp<CoursesStackParamList, 'CourseViewer'>;

// ─── YouTube helpers ───────────────────────────────────────────────────────────

const isYouTube = (url: string) =>
  url.includes('youtube.com') || url.includes('youtu.be');

const getYouTubeVideoId = (url: string): string | null => {
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  return null;
};

const getYouTubePlaylistId = (url: string): string | null => {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

// ─── Non-YouTube WebView URL ───────────────────────────────────────────────────

const toWebViewUrl = (url: string): string => {
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  if (url.startsWith('/')) return `https://api.radar-mr.com${url}`;
  return url;
};

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ─── Inline YouTube player ─────────────────────────────────────────────────────

const YouTubeSection = ({ title, subject, url }: { title: string; subject: string; url: string }) => {
  const [playing, setPlaying] = useState(false);
  const videoId    = getYouTubeVideoId(url);
  const listId     = getYouTubePlaylistId(url);
  const isPlaylist = !!listId && !videoId;

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false);
  }, []);

  const openYouTube = () => Linking.openURL(url).catch(() => {});

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0A0714' }}
      contentContainerStyle={styles.previewScroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Inline player */}
      <View style={styles.playerWrap}>
        <YoutubePlayer
          height={PLAYER_HEIGHT}
          videoId={videoId ?? undefined}
          playList={!videoId && listId ? listId : undefined}
          play={playing}
          onChangeState={onStateChange}
          webViewStyle={{ opacity: 0.99 }}
          webViewProps={{
            androidLayerType: 'hardware',
            allowsFullscreenVideo: true,
            allowsInlineMediaPlayback: true,
          }}
        />
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        {isPlaylist && (
          <View style={styles.playlistBadge}>
            <AppIcon name='list' size={12} color="#818CF8" />
            <Text style={styles.playlistBadgeText}>قائمة تشغيل</Text>
          </View>
        )}
        <Text style={styles.previewTitle}>{title}</Text>
        {!!subject && <Text style={styles.previewSubject}>{subject}</Text>}
        <View style={styles.infoRows}>
          <View style={styles.infoRow}>
            <AppIcon name="logoYoutube" size={16} color="#FF4444" />
            <Text style={styles.infoText}>YouTube</Text>
          </View>
          {isPlaylist && (
            <View style={styles.infoRow}>
              <AppIcon name="albumsOutline" size={16} color="#818CF8" />
              <Text style={styles.infoText}>سلسلة دروس كاملة</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <AppIcon name="lockOpenOutline" size={16} color="#34D399" />
            <Text style={styles.infoText}>مجاني بالكامل</Text>
          </View>
        </View>
      </View>

      {/* Fallback: open in YouTube app */}
      <TouchableOpacity style={styles.openExternalBtn} onPress={openYouTube} activeOpacity={0.8}>
        <AppIcon name="openOutline" size={16} color="#818CF8" />
        <Text style={styles.openExternalText}>
          {isPlaylist ? 'فتح في تطبيق YouTube' : 'فتح في تطبيق YouTube'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function CourseViewerScreen() {
  const navigation = useNavigation();
  const { params: { title, url, subject } } = useRoute<Route>();
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const yt = isYouTube(url);
  const openExternal = () => Linking.openURL(url).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0714' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0714" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(navigation as any, { name: 'Explore', params: { screen: 'Courses' } })} style={styles.backBtn}>
          <AppIcon name="arrowBack" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
          {!!subject && <Text style={styles.headerSubtitle} numberOfLines={1}>{subject}</Text>}
        </View>
        <TouchableOpacity onPress={openExternal} style={styles.openBtn}>
          <AppIcon name={yt ? 'logoYoutube' : 'openOutline'} size={20} color={yt ? '#FF4444' : '#818CF8'} />
        </TouchableOpacity>
      </SafeAreaView>

      {yt ? (
        <YouTubeSection title={title} subject={subject ?? ''} url={url} />
      ) : !error ? (
        <WebView
          source={{ uri: toWebViewUrl(url) }}
          userAgent={MOBILE_UA}
          style={{ flex: 1, backgroundColor: '#000' }}
          onLoadStart={() => { setLoading(true); setError(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
        />
      ) : (
        <View style={styles.errorBox}>
          <AppIcon name="wifiOutline" size={56} color="#f87171" />
          <Text style={styles.errorTitle}>تعذّر تحميل الصفحة</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={openExternal}>
            <AppIcon name="openOutline" size={18} color="#fff" />
            <Text style={styles.errorBtnText}>فتح في المتصفح</Text>
          </TouchableOpacity>
        </View>
      )}

      {!yt && loading && !error && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>جارٍ التحميل...</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0A0714',
    paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(124,58,237,0.3)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  openBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  headerTitle:    { fontSize: 14, fontWeight: '700', color: '#E0E7FF', textAlign: 'right' },
  headerSubtitle: { fontSize: 11, color: '#818CF8', marginTop: 2, textAlign: 'right' },

  // YouTube inline player
  previewScroll: { paddingBottom: 48, gap: 16 },
  playerWrap: {
    width: '100%', backgroundColor: '#000',
    overflow: 'hidden',
  },
  infoCard: {
    backgroundColor: '#1a1a2e', borderRadius: 16, padding: 18, gap: 10,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
    marginHorizontal: 16,
  },
  playlistBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(129,140,248,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  playlistBadgeText: { fontSize: 11, color: '#818CF8', fontWeight: '600' },
  previewTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'right', lineHeight: 24 },
  previewSubject: { fontSize: 13, color: '#818CF8', textAlign: 'right', fontWeight: '500' },
  infoRows: { gap: 8, marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  infoText: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  openExternalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(129,140,248,0.3)',
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  openExternalText: { fontSize: 13, color: '#818CF8', fontWeight: '600' },

  // WebView / error states
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0714',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  errorBox: {
    flex: 1, backgroundColor: '#0A0714',
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  errorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1E1B4B', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
  },
  errorBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
