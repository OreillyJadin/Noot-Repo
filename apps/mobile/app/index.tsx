// O1 Landing (placeholder). Port from design_handoff_noot_app/app/screens-shared.jsx
// (Landing). Screen keys map to screens-map.jsx (window.SCREENS).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button, useTheme } from '@noot/ui';

export default function Landing() {
  const t = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <Text style={[styles.wordmark, { color: t.text }]}>noot</Text>
      <Text style={[styles.tag, { color: t.text2 }]}>peer tutoring for campus life</Text>
      <View style={styles.cta}>
        <Button label="Log in / Sign up" onPress={() => { /* TODO: go to O2 signup */ }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  wordmark: { fontSize: 44, fontWeight: '700', letterSpacing: -1 },
  tag: { fontSize: 16 },
  cta: { marginTop: 32, alignSelf: 'stretch' },
});
