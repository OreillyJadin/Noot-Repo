import { getSupabase } from '../supabase';
import type { SignInResult } from './index';

export type MfaStatus =
  | { state: 'verified' }
  | { state: 'challenge'; factorId: string }
  | { state: 'enroll' };

export interface TotpEnrollment {
  factorId: string;
  qrSvg: string;
  secret: string;
  uri: string;
}

export interface MfaFactor {
  id: string;
  type: string;
  status: 'verified' | 'unverified';
  friendlyName: string | null;
}

export const TOTP_CODE_FORMAT = 'Enter the 6-digit code from your authenticator app.';
export const BAD_TOTP_CODE = "That code didn't work. Check your authenticator app and try again.";

export function normalizeTotpCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

export function svgFromDataUri(dataUri: string): string {
  const comma = dataUri.indexOf(',');
  if (comma < 0) return dataUri;

  const header = dataUri.slice(0, comma);
  const content = dataUri.slice(comma + 1);
  const markup = (value: string) => {
    const svgStart = value.indexOf('<svg');
    return svgStart < 0 ? value : value.slice(svgStart);
  };
  if (/;base64(?:;|$)/i.test(header)) {
    const binary = atob(content);
    const encoded = Array.from(binary, (character) =>
      `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
    ).join('');
    return markup(decodeURIComponent(encoded));
  }
  if (/%3c/i.test(content)) return markup(decodeURIComponent(content));
  return markup(content);
}

export async function status(): Promise<MfaStatus> {
  const auth = getSupabase().auth;
  const { data: assurance, error: assuranceError } = await auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw new Error(assuranceError.message);
  if (assurance.currentLevel === 'aal2') return { state: 'verified' };

  const { data, error } = await auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const factor = data.all.find((item) => item.factor_type === 'totp' && item.status === 'verified');
  return factor ? { state: 'challenge', factorId: factor.id } : { state: 'enroll' };
}

export async function enrollTotp(): Promise<TotpEnrollment> {
  const auth = getSupabase().auth;
  const { data: factors, error: factorsError } = await auth.mfa.listFactors();
  if (factorsError) throw new Error(factorsError.message);

  for (const factor of factors.all) {
    if (factor.factor_type !== 'totp' || factor.status !== 'unverified') continue;
    const result = await unenroll(factor.id);
    if (!result.ok) throw new Error(result.error ?? 'Could not remove an unfinished setup.');
  }

  const { data, error } = await auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Noot',
    friendlyName: 'Noot admin',
  });
  if (error) throw new Error(error.message);
  if (data.type !== 'totp') throw new Error('Could not set up an authenticator app.');

  return {
    factorId: data.id,
    qrSvg: svgFromDataUri(data.totp.qr_code),
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyCode(factorId: string, code: string): Promise<SignInResult> {
  const token = normalizeTotpCode(code);
  if (!token) return { ok: false, error: TOTP_CODE_FORMAT };

  const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: token });
  return error ? { ok: false, error: BAD_TOTP_CODE } : { ok: true };
}

export async function listFactors(): Promise<MfaFactor[]> {
  const { data, error } = await getSupabase().auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.all.map((factor) => ({
    id: factor.id,
    type: factor.factor_type,
    status: factor.status,
    friendlyName: factor.friendly_name ?? null,
  }));
}

export async function unenroll(factorId: string): Promise<SignInResult> {
  const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
