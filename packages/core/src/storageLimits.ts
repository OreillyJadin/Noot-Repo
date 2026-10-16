export type UploadBucket = 'avatars' | 'transcripts' | 'chat-attachments';

const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export const STORAGE_LIMITS: Record<UploadBucket, { maxBytes: number; mimeTypes: readonly string[] }> = {
  avatars: { maxBytes: 5242880, mimeTypes: PHOTO_MIME_TYPES },
  transcripts: { maxBytes: 10485760, mimeTypes: ['application/pdf', ...PHOTO_MIME_TYPES] },
  'chat-attachments': {
    maxBytes: 10485760,
    mimeTypes: [
      ...PHOTO_MIME_TYPES,
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
};

export const MAX_ATTACHMENT_BYTES = STORAGE_LIMITS['chat-attachments'].maxBytes;

export const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const UPLOAD_MESSAGES: Record<UploadBucket, { size: string; type: string }> = {
  avatars: {
    size: 'That photo is too big. Please pick one under 5 MB.',
    type: "That photo format isn't supported. Please pick a JPEG, PNG, WebP or HEIC photo.",
  },
  transcripts: {
    size: 'That file is too big. Please upload one under 10 MB.',
    type: "That file type isn't supported. Please upload a PDF or a photo (JPEG, PNG, WebP or HEIC).",
  },
  'chat-attachments': {
    size: 'That file is too big. Attachments can be up to 10 MB.',
    type: "That file type can't be sent. You can send photos, PDFs, and Word, Excel, PowerPoint or text files.",
  },
};

export function normalizeMime(t?: string | null): string {
  const mime = (t ?? '').split(';', 1)[0]!.trim().toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

export function resolveUploadType(
  bucket: UploadBucket,
  file: { declared?: string | null; ext: string; size: number },
): { ok: true; type: string } | { ok: false; message: string } {
  if (file.size > STORAGE_LIMITS[bucket].maxBytes) {
    return { ok: false, message: UPLOAD_MESSAGES[bucket].size };
  }

  let type = normalizeMime(file.declared);
  if (!type || type === 'application/octet-stream' || type === 'binary/octet-stream') {
    type = MIME_BY_EXT[file.ext.toLowerCase()] ?? '';
  }

  if (!STORAGE_LIMITS[bucket].mimeTypes.includes(type)) {
    return { ok: false, message: UPLOAD_MESSAGES[bucket].type };
  }

  return { ok: true, type };
}

export function friendlyStorageError(bucket: UploadBucket, err: unknown): Error | null {
  if (!err || typeof err !== 'object') return null;

  const error = err as { message?: unknown; status?: unknown; statusCode?: unknown };
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const statuses = [error.status, error.statusCode].map((status) => String(status ?? ''));

  if (statuses.includes('413') || message.includes('maximum allowed size')) {
    return new Error(UPLOAD_MESSAGES[bucket].size);
  }
  if (
    statuses.includes('415') ||
    (message.includes('mime') &&
      (message.includes('not supported') || message.includes('not allowed') || message.includes('invalid')))
  ) {
    return new Error(UPLOAD_MESSAGES[bucket].type);
  }
  return null;
}
