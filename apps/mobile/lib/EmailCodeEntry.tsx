// "Or enter the code from the email" — the other half of every auth email (ERR-023). The
// emailed link only opens the app on the phone it is installed on; someone reading the email
// on a laptop types the code here instead. Used on the "check your inbox" step of sign-up and
// of password reset; onVerified runs once a session exists.
import React, { useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Field } from '@noot/ui';
import { auth } from '@noot/core';

export function EmailCodeEntry({
  email,
  kind,
  onVerified,
}: {
  email: string;
  kind: 'signup' | 'recovery';
  /** Navigate on from here. Return a message to show if that couldn't be done. */
  onVerified: () => Promise<string | null | void>;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A code is spent by its first successful check, so a retry after onVerified failed must
  // not send it again — the session is already there.
  const [verified, setVerified] = useState(false);

  // State alone lets two quick taps both through before the re-render, and the second
  // would be refused as a used code.
  const inFlight = useRef(false);

  const handleVerify = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      if (!verified) {
        const res = await auth.verifyEmailCode(email, code, kind);
        if (!res.ok) { setError(res.error ?? auth.BAD_EMAIL_CODE); return; }
        setVerified(true);
      }
      const problem = await onVerified();
      if (problem) setError(problem);
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Field
        label="Code from the email"
        placeholder="12345678"
        value={code}
        onChangeText={(v) => { setCode(v); if (error) setError(null); }}
        keyboardType="number-pad"
        maxLength={12}
        oneTimeCode
        hint="Reading the email on another device? Type the code here instead of tapping the link."
      />
      {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}
      <Button
        label={busy ? 'Checking…' : verified ? 'Try again' : 'Verify code'}
        disabled={busy || (!verified && !auth.normalizeEmailCode(code))}
        onPress={handleVerify}
      />
    </>
  );
}
