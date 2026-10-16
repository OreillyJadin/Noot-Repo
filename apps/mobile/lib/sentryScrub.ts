import type { Breadcrumb, Event } from '@sentry/react-native';

const sensitiveKey = /(e-?mail|password|passwd|token|secret|authorization|cookie|phone|first_?name|last_?name|full_?name|display_?name|^name$)/i;
const sensitiveParam = /([?#&](?:access_token|refresh_token|token|token_hash|code|password|email)=)[^&#\s]*/gi;

export function scrubText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/\b(?:sk|rk)_(?:test|live)_\w+/g, '[token]')
    .replace(/\b(?:pi|seti)_\w+_secret_\w+/g, '[token]')
    .replace(/\bwhsec_\w+/g, '[token]')
    .replace(sensitiveParam, '$1[redacted]');
}

export function stripUrl(url: string): string {
  const separator = url.search(/[?#]/);
  return separator === -1 ? url : url.slice(0, separator);
}

function sanitizeValue(value: unknown, stripUrlKeys = false): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, stripUrlKeys));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested]) => {
        if (sensitiveKey.test(key)) return [];
        if (stripUrlKeys && /^(url|to|from)$/i.test(key) && typeof nested === 'string') {
          return [[key, stripUrl(nested)]];
        }
        return [[key, sanitizeValue(nested, stripUrlKeys)]];
      }),
    );
  }
  return value;
}

function scrubStrings(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, scrubStrings(nested)]));
  }
  return value;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const result = breadcrumb as unknown as Record<string, unknown>;
  if (typeof result.message === 'string') result.message = scrubText(result.message);
  if (result.data && typeof result.data === 'object') {
    result.data = sanitizeValue(result.data, true);
  }
  return result as unknown as Breadcrumb;
}

export function scrubEvent<T extends Event>(event: T): T {
  const result = event as unknown as Record<string, unknown>;
  const user = result.user as { id?: unknown } | undefined;
  if (user) {
    if (user.id) result.user = { id: user.id };
    else delete result.user;
  }
  delete result.server_name;

  const request = result.request as Record<string, unknown> | undefined;
  if (request) {
    delete request.headers;
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (typeof request.url === 'string') {
      request.url = stripUrl(request.url);
    }
  }
  if (typeof result.message === 'string') result.message = scrubText(result.message);
  const logentry = result.logentry as Record<string, unknown> | undefined;
  if (typeof logentry?.message === 'string') {
    logentry.message = scrubText(logentry.message);
  }
  const exception = result.exception as { values?: Array<{ value?: unknown }> } | undefined;
  for (const value of exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = scrubText(value.value);
  }
  const breadcrumbs = result.breadcrumbs as Breadcrumb[] | undefined;
  if (breadcrumbs) {
    result.breadcrumbs = breadcrumbs.map(scrubBreadcrumb);
  }
  if (result.extra) result.extra = sanitizeValue(result.extra);
  const contexts = result.contexts as Record<string, unknown> | undefined;
  const device = contexts?.device as Record<string, unknown> | undefined;
  if (device) delete device.name;
  if (contexts) result.contexts = scrubStrings(contexts);
  return result as T;
}
