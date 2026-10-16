import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTACHMENT_BYTES,
  MIME_BY_EXT,
  friendlyStorageError,
  normalizeMime,
  resolveUploadType,
  STORAGE_LIMITS,
  type UploadBucket,
} from '../src/storageLimits.ts';

const buckets: UploadBucket[] = ['avatars', 'transcripts', 'chat-attachments'];
const photoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const sizeMessages: Record<UploadBucket, string> = {
  avatars: 'That photo is too big. Please pick one under 5 MB.',
  transcripts: 'That file is too big. Please upload one under 10 MB.',
  'chat-attachments': 'That file is too big. Attachments can be up to 10 MB.',
};

test('storage limits mirror the migration', () => {
  assert.deepEqual(STORAGE_LIMITS, {
    avatars: { maxBytes: 5242880, mimeTypes: photoTypes },
    transcripts: { maxBytes: 10485760, mimeTypes: ['application/pdf', ...photoTypes] },
    'chat-attachments': {
      maxBytes: 10485760,
      mimeTypes: [
        ...photoTypes,
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
  });
  assert.equal(MAX_ATTACHMENT_BYTES, 10485760);
});

test('each bucket accepts PNG and rejects active content and SVG', () => {
  for (const bucket of buckets) {
    assert.deepEqual(resolveUploadType(bucket, { declared: 'image/png', ext: 'png', size: 1 }), {
      ok: true,
      type: 'image/png',
    });
    for (const declared of ['text/html', 'image/svg+xml']) {
      assert.equal(resolveUploadType(bucket, { declared, ext: 'html', size: 1 }).ok, false, bucket);
    }
  }
});

test('octet-stream falls back to a known extension but never accepts an unknown type', () => {
  for (const bucket of buckets) {
    assert.equal(
      resolveUploadType(bucket, { declared: 'application/octet-stream', ext: 'unknown', size: 1 }).ok,
      false,
    );
  }
  assert.deepEqual(
    resolveUploadType('transcripts', { declared: 'application/octet-stream', ext: 'pdf', size: 1 }),
    { ok: true, type: 'application/pdf' },
  );
  assert.deepEqual(
    resolveUploadType('chat-attachments', { declared: 'application/octet-stream', ext: 'pdf', size: 1 }),
    { ok: true, type: 'application/pdf' },
  );
  assert.equal(
    resolveUploadType('avatars', { declared: 'application/octet-stream', ext: 'pdf', size: 1 }).ok,
    false,
  );
  assert.equal(
    resolveUploadType('chat-attachments', { declared: 'binary/octet-stream', ext: 'txt', size: 1 }).ok,
    true,
  );
});

test('MIME normalization trims, lowercases, strips parameters and aliases image/jpg', () => {
  assert.equal(normalizeMime(' image/JPG; charset=x '), 'image/jpeg');
  assert.equal(normalizeMime(null), '');
  assert.equal(normalizeMime('   '), '');
});

test('a specific declared MIME type is not overridden by the extension', () => {
  for (const bucket of buckets) {
    assert.equal(
      resolveUploadType(bucket, { declared: 'text/html', ext: 'png', size: 1 }).ok,
      false,
      bucket,
    );
  }
});

test('each bucket accepts its exact maximum size and returns its exact size message above it', () => {
  for (const bucket of buckets) {
    const maxBytes = STORAGE_LIMITS[bucket].maxBytes;
    assert.equal(resolveUploadType(bucket, { declared: 'image/png', ext: 'png', size: maxBytes }).ok, true);
    assert.deepEqual(
      resolveUploadType(bucket, { declared: 'image/png', ext: 'png', size: maxBytes + 1 }),
      { ok: false, message: sizeMessages[bucket] },
    );
  }
});

test('GIF is accepted only for chat attachments', () => {
  assert.equal(resolveUploadType('chat-attachments', { declared: 'image/gif', ext: 'gif', size: 1 }).ok, true);
  assert.equal(resolveUploadType('avatars', { declared: 'image/gif', ext: 'gif', size: 1 }).ok, false);
  assert.equal(resolveUploadType('transcripts', { declared: 'image/gif', ext: 'gif', size: 1 }).ok, false);
});

test('document extensions map to their MIME types', () => {
  assert.deepEqual(
    Object.fromEntries(['txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].map((ext) => [ext, MIME_BY_EXT[ext]])),
    {
      txt: 'text/plain',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
  );
});

test('Storage size and MIME errors receive the matching bucket message', () => {
  assert.equal(
    friendlyStorageError('avatars', {
      status: 400,
      statusCode: '413',
      message: 'The object exceeded the maximum allowed size',
    })?.message,
    sizeMessages.avatars,
  );
  assert.equal(
    friendlyStorageError('transcripts', {
      status: 400,
      statusCode: '415',
      message: 'mime type text/html is not supported',
    })?.message,
    "That file type isn't supported. Please upload a PDF or a photo (JPEG, PNG, WebP or HEIC).",
  );
  assert.equal(friendlyStorageError('chat-attachments', new Error('network failure')), null);
});
