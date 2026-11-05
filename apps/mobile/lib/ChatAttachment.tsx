import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ic, useTheme, type IconName } from '@noot/ui';

export interface ChatAttachmentViewItem {
  name: string;
  kind: 'image' | 'file';
  size?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatAttachmentView({
  attachment,
  mine,
  url,
}: {
  attachment: ChatAttachmentViewItem;
  mine: boolean;
  url?: string;
}) {
  const t = useTheme();
  const iconName: IconName = attachment.kind === 'image' ? 'image' : 'doc';

  const openAttachment = () => {
    if (!url) return;
    void WebBrowser.openBrowserAsync(url).catch(() => {
      Alert.alert('Could not open attachment', 'Please try again.');
    });
  };

  return (
    <Pressable
      onPress={openAttachment}
      disabled={!url}
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.name}`}
    >
      {attachment.kind === 'image' && url ? (
        <Image source={{ uri: url }} resizeMode="cover" style={[styles.attachImage, { backgroundColor: t.surface2 }]} />
      ) : (
        <View style={[styles.attachView, { backgroundColor: mine ? t.accent : t.surface2 }]}>
          <Ic name={iconName} size={20} color={mine ? t.onAccent : t.accent} strokeWidth={1.7} />
          <View style={{ minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.attachName, { color: mine ? t.onAccent : t.text }]}>{attachment.name}</Text>
            {attachment.size != null && (
              <Text style={[styles.attachSize, { color: mine ? t.onAccent : t.text }]}>{formatSize(attachment.size)}</Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attachView: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14 },
  attachName: { fontSize: 13.5, fontWeight: '600', maxWidth: 150 },
  attachSize: { fontSize: 11, opacity: 0.75 },
  attachImage: { width: 200, height: 200, borderRadius: 14 },
});
