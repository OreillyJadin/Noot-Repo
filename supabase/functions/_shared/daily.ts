// Two participants can each use a phone and computer; unique IDs eject stale rejoins. Rooms stay private and token-only.
export const ROOM_ACCESS = { max_participants: 4, enforce_unique_user_ids: true };

export function videoWindow(scheduledAt: string, durationMinutes: number) {
  const start = new Date(scheduledAt).getTime();
  return { nbf: Math.floor((start - 3_600_000) / 1000), exp: Math.floor((start + (durationMinutes + 30) * 60_000) / 1000) };
}

export function newRoomName(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'noot-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % alphabet.length]).join('');
}

class DailyError extends Error {
  constructor(public status: number) { super(`Video provider request failed (${status})`); }
}

async function daily(path: string, method: string, body?: unknown) {
  const response = await fetch(`https://api.daily.co/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${Deno.env.get('DAILY_API_KEY')}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new DailyError(response.status);
  return response.status === 204 ? {} : await response.json();
}

export async function ensureVideoRoom(name: string, scheduledAt: string, duration: number, exists: boolean): Promise<string> {
  if (!/^noot-[a-z0-9]{8}$/.test(name)) throw new Error('Invalid video room name');
  if (!Deno.env.get('DAILY_API_KEY')) return `https://noot-sim.daily.co/${name}`;
  const properties = videoWindow(scheduledAt, duration);
  let room;
  if (exists) {
    room = await daily(`/rooms/${name}`, 'POST', { properties: { ...properties, ...ROOM_ACCESS } });
  } else {
    try {
      room = await daily('/rooms', 'POST', {
        name, privacy: 'private', properties: {
          ...properties, ...ROOM_ACCESS, eject_at_room_exp: true,
          enable_prejoin_ui: true, enable_chat: true, enable_screenshare: true,
        },
      });
    } catch (error) {
      if (!(error instanceof DailyError) || ![400, 409].includes(error.status)) throw error;
      room = await daily(`/rooms/${name}`, 'GET');
      if (room.privacy !== 'private') throw new Error('Video room must be private');
      room = await daily(`/rooms/${name}`, 'POST', { properties: { ...properties, ...ROOM_ACCESS } });
    }
  }
  const url = new URL(room.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.daily.co') || url.search || url.hash) {
    throw new Error('Invalid video room URL');
  }
  return url.toString();
}

export async function applyRoomAccess(name: string): Promise<void> {
  if (!/^noot-[a-z0-9]{8}$/.test(name)) throw new Error('Invalid video room name');
  if (!Deno.env.get('DAILY_API_KEY')) return;
  await daily(`/rooms/${name}`, 'POST', { properties: ROOM_ACCESS });
}

export type VideoDevice = 'phone' | 'computer';

export function tokenProperties(
  name: string,
  userId: string,
  firstName: string,
  exp: number,
  device: VideoDevice = 'phone',
) {
  return {
    room_name: name,
    user_name: device === 'computer' ? `${firstName} (computer)` : firstName,
    user_id: device === 'computer' ? `c-${userId.replace(/-/g, '')}` : userId,
    exp,
    eject_at_token_exp: true,
    is_owner: false,
    ...(device === 'computer' ? { start_audio_off: true, start_video_off: true } : {}),
  };
}

export async function deleteVideoRoom(name: string): Promise<void> {
  if (!Deno.env.get('DAILY_API_KEY')) return;
  try { await daily(`/rooms/${encodeURIComponent(name)}`, 'DELETE'); }
  catch (error) { if (!(error instanceof DailyError) || error.status !== 404) throw error; }
}

export async function videoJoinUrl(
  roomUrl: string,
  name: string,
  userId: string,
  firstName: string,
  exp: number,
  device: VideoDevice = 'phone',
): Promise<string> {
  const token = !Deno.env.get('DAILY_API_KEY') ? 'sim' : (await daily('/meeting-tokens', 'POST', {
    properties: tokenProperties(name, userId, firstName, exp, device),
  })).token;
  if (typeof token !== 'string' || !token) throw new Error('Video provider did not return a token');
  const url = new URL(roomUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.daily.co')) throw new Error('Invalid video room URL');
  url.searchParams.set('t', token);
  return url.toString();
}
