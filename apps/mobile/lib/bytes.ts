// Getting real bytes out of a picked file, for Supabase Storage uploads. This matters because
// a React Native Blob is a handle to a native file, not its contents: hand one to Storage and
// it writes a 0-byte object with no error. Both helpers here return an exactly-sized
// ArrayBuffer, which is what supabase-js can actually serialize on native.
import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/**
 * Read a picked file's bytes. Native goes through expo-file-system (the picker only hands us
 * a `file://` URI); web falls back to fetch, where Blob/`blob:` URLs work normally and
 * expo-file-system's `File` is a stub.
 */
export async function readUriBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return await (await fetch(uri)).arrayBuffer();
  const bytes = await new File(uri).bytes();
  // Normally already exact, but never hand Storage a view's oversized backing buffer.
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUE = new Uint8Array(256);
const IS_B64 = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) {
  const code = ALPHABET.charCodeAt(i);
  VALUE[code] = i;
  IS_B64[code] = 1;
}

/**
 * Decode a base64 string (padding and whitespace tolerated, `data:` prefix not) into an
 * exactly-sized ArrayBuffer suitable for `supabase.storage.upload()`.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let clean = base64;
  const comma = clean.indexOf(',');
  if (clean.startsWith('data:') && comma !== -1) clean = clean.slice(comma + 1);

  // Count the real base64 characters first so the output buffer is exact (no trailing zeros).
  let chars = 0;
  for (let i = 0; i < clean.length; i++) if (IS_B64[clean.charCodeAt(i)]) chars++;

  const out = new Uint8Array(Math.floor((chars * 3) / 4));
  let pos = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (!IS_B64[code]) continue; // '=', newlines, stray whitespace
    buffer = (buffer << 6) | VALUE[code]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (buffer >> bits) & 0xff;
    }
  }
  return out.buffer;
}
