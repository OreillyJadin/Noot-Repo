type Handler = (req: Request, info?: unknown) => Response | Promise<Response>;

export interface ReportingOptions {
  dsn?: string | null;
  environment?: string;
  fetch?: typeof fetch;
  waitUntil?: (p: Promise<unknown>) => void;
}

function env(name: string): string | undefined {
  return (globalThis as any).Deno?.env?.get(name);
}

function scrubText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/\b(?:sk|rk)_(?:test|live)_\w+/g, '[token]')
    .replace(/\b(?:pi|seti)_\w+_secret_\w+/g, '[token]')
    .replace(/\bwhsec_\w+/g, '[token]')
    .slice(0, 1000);
}

function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const parsed = new URL(dsn);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.username || parsed.search || parsed.hash) {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const projectId = segments.pop();
    if (!projectId) return null;

    const prefix = segments.length ? `/${segments.join('/')}` : '';
    return {
      url: `${parsed.protocol}//${parsed.host}${prefix}/api/${projectId}/envelope/`,
      key: decodeURIComponent(parsed.username),
    };
  } catch {
    return null;
  }
}

function stackFrames(stack: string | undefined): Array<Record<string, string | number>> {
  if (!stack) return [];

  return stack
    .split('\n')
    .flatMap((line) => {
      const match = line.match(/^\s*at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/);
      if (!match) return [];

      const filename = match[2].split(/[?#]/, 1)[0];
      const frame: Record<string, string | number> = {
        filename,
        lineno: Number(match[3]),
        colno: Number(match[4]),
      };
      if (match[1]) frame.function = match[1];
      return [frame];
    })
    .reverse();
}

export function withErrorReporting(
  name: string,
  handler: Handler,
  opts: ReportingOptions = {},
): Handler {
  const report = (req: Request, status: number, error?: unknown) => {
    try {
      const dsn = opts.dsn !== undefined ? opts.dsn : env('SENTRY_DSN');
      if (!dsn) return;

      const endpoint = parseDsn(dsn);
      if (!endpoint) return;

      const eventId = crypto.randomUUID().replace(/-/g, '');
      const method = req.method;
      const pathname = new URL(req.url).pathname;
      const exception =
        error instanceof Error
          ? {
              type: error.name || 'Error',
              value: scrubText(error.message),
              frames: stackFrames(error.stack),
            }
          : error === undefined
            ? undefined
            : {
                type: 'Error',
                value: scrubText(String(error)),
                frames: [],
              };
      const exceptionValue = exception
        ? {
            values: [
              {
                type: exception.type,
                value: exception.value,
                ...(exception.frames.length
                  ? { stacktrace: { frames: exception.frames } }
                  : {}),
              },
            ],
          }
        : undefined;
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: 'javascript',
        level: 'error',
        logger: 'edge-function',
        environment: opts.environment ?? env('SENTRY_ENVIRONMENT') ?? 'production',
        transaction: `${method} ${pathname}`,
        tags: { function: name, method, status: String(status) },
        ...(exceptionValue
          ? { exception: exceptionValue }
          : { message: `${name} responded ${status}` }),
      };
      const body = [
        JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
        JSON.stringify({ type: 'event' }),
        JSON.stringify(event),
        '',
      ].join('\n');
      const fetchFn = opts.fetch ?? fetch;
      const delivery = fetchFn(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${endpoint.key}, sentry_client=noot-edge/1.0`,
        },
        body,
        signal: AbortSignal.timeout(3000),
      })
        .then((response) => response.body?.cancel())
        .catch(() => console.error('observability: could not reach Sentry'));

      if (opts.waitUntil) {
        opts.waitUntil(delivery);
      } else {
        (globalThis as any).EdgeRuntime?.waitUntil?.(delivery);
      }
    } catch {
      console.error('observability: could not reach Sentry');
    }
  };

  return async (req, info) => {
    try {
      const response = await handler(req, info);
      if (response.status >= 500) report(req, response.status);
      return response;
    } catch (error) {
      console.error(`${name}: unhandled error`, error);
      report(req, 500, error);
      return Response.json({ error: 'Internal error' }, { status: 500 });
    }
  };
}

export function serveWithErrorReporting(name: string, handler: Handler): void {
  (globalThis as any).Deno.serve(withErrorReporting(name, handler));
}
