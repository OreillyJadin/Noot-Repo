import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { auth } from '@noot/core';
import { Body, Button, Card, Field, H1, Muted, NavTop, Screen, Sub, useTheme } from '@noot/ui';
import type { TotpEnrollment } from '@noot/core';
import { useMe } from './useMe';

type GateState =
  | { state: 'checking' }
  | { state: 'error' }
  | { state: 'verified' }
  | { state: 'challenge'; factorId: string }
  | { state: 'enroll'; enrollment: TotpEnrollment };

export function AdminMfaGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAdmin, loading, me } = useMe();
  const [gate, setGate] = useState<GateState>({ state: 'checking' });
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const enrollmentPromise = useRef<{ userId: string; promise: Promise<TotpEnrollment> } | null>(null);

  useEffect(() => {
    if (loading || !isAdmin || !me?.id) return;
    const userId = me.id;
    let active = true;
    setGate({ state: 'checking' });
    setCheckedUserId(null);

    void auth.mfa
      .status()
      .then(async (next) => {
        if (next.state !== 'enroll') {
          if (active) {
            setGate(next);
            setCheckedUserId(userId);
          }
          return;
        }
        if (enrollmentPromise.current?.userId !== userId) {
          enrollmentPromise.current = {
            userId,
            promise: auth.mfa.enrollTotp().catch((error: unknown) => {
              if (enrollmentPromise.current?.userId === userId) enrollmentPromise.current = null;
              throw error;
            }),
          };
        }
        const enrollment = await enrollmentPromise.current.promise;
        if (active) {
          setGate({ state: 'enroll', enrollment });
          setCheckedUserId(userId);
        }
      })
      .catch(() => {
        if (active) {
          setGate({ state: 'error' });
          setCheckedUserId(userId);
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, isAdmin, loading, me?.id]);

  if (loading || !isAdmin) return <>{children}</>;
  if (gate.state === 'verified' && checkedUserId === me?.id) return <>{children}</>;
  if (gate.state === 'checking' || checkedUserId !== me?.id) return <Screen>{null}</Screen>;
  if (gate.state === 'verified') return <>{children}</>;

  const onBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  if (gate.state === 'error') {
    return (
      <Screen>
        <NavTop title="Noot Admin" onBack={onBack} />
        <Body>
          <Sub>Something went wrong. Check your connection and try again.</Sub>
          <Button label="Try again" onPress={() => setAttempt((value) => value + 1)} />
        </Body>
      </Screen>
    );
  }

  if (gate.state === 'enroll') {
    return (
      <EnrollView
        enrollment={gate.enrollment}
        onBack={onBack}
        onVerified={() => setGate({ state: 'verified' })}
      />
    );
  }

  return (
    <Screen>
      <NavTop title="Noot Admin" onBack={onBack} />
      <Body>
        <CodeForm
          title="Enter your code"
          description="Enter the 6-digit code from your authenticator app."
          buttonLabel="Continue"
          help="Lost your authenticator app? Ask another Noot admin to reset it for you."
          factorId={gate.factorId}
          onVerified={() => setGate({ state: 'verified' })}
        />
      </Body>
    </Screen>
  );
}

function EnrollView({
  enrollment,
  onBack,
  onVerified,
}: {
  enrollment: TotpEnrollment;
  onBack: () => void;
  onVerified: () => void;
}) {
  const t = useTheme();
  const [openError, setOpenError] = useState(false);

  return (
    <Screen>
      <NavTop title="Noot Admin" onBack={onBack} />
      <Body>
        <H1 style={styles.heading}>Protect admin access</H1>
        <Sub>
          Admin accounts need a second step. Add Noot to an authenticator app (like Google
          Authenticator, 1Password or Authy), then enter the 6-digit code it shows.
        </Sub>
        <Card style={styles.qrCard}>
          <SvgXml xml={enrollment.qrSvg} width={180} height={180} />
        </Card>
        <Muted style={styles.caption}>Scan this with your authenticator app</Muted>
        <Button
          label="Open in authenticator app"
          kind="secondary"
          onPress={() => {
            setOpenError(false);
            void Linking.openURL(enrollment.uri).catch(() => setOpenError(true));
          }}
        />
        {openError ? (
          <Sub>
            We couldn&apos;t find an authenticator app on this phone. Scan the code or type in the
            key below.
          </Sub>
        ) : null}
        <Muted>Or type in this key:</Muted>
        <Text selectable style={[styles.secret, { color: t.text }]}>
          {enrollment.secret}
        </Text>
        <CodeForm
          buttonLabel="Turn on"
          factorId={enrollment.factorId}
          onVerified={onVerified}
        />
      </Body>
    </Screen>
  );
}

function CodeForm({
  title,
  description,
  buttonLabel,
  help,
  factorId,
  onVerified,
}: {
  title?: string;
  description?: string;
  buttonLabel: string;
  help?: string;
  factorId: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await auth.mfa.verifyCode(factorId, code);
      if (result.ok) onVerified();
      else setError(result.error ?? 'Please try again.');
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {title ? <H1 style={styles.heading}>{title}</H1> : null}
      {description ? <Sub>{description}</Sub> : null}
      <Field
        label="6-digit code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        oneTimeCode
        maxLength={7}
      />
      {error ? <Sub style={styles.error}>{error}</Sub> : null}
      <Button label={buttonLabel} onPress={() => void verify()} disabled={busy} />
      {help ? <Muted>{help}</Muted> : null}
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 24 },
  qrCard: {
    alignSelf: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  caption: { textAlign: 'center' },
  secret: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 16, textAlign: 'center' },
  error: { color: '#C0392B' },
});
