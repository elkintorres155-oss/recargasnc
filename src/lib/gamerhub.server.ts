// Cliente server-only de GamerHub.
// Mantiene la misma interfaz usada por provider.functions.ts.

type Creds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

type RequestResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export function getGamerHubCredentials(): Creds | null {
  const apiKey = process.env['GAMERHUB_API_KEY'];
  const apiSecret = process.env['GAMERHUB_API_SECRET'];

  const baseUrl =
    process.env['GAMERHUB_BASE_URL'] ??
    'https://portal.gamerhubstore.shop/v1';

  if (!apiKey || !apiSecret) {
    return null;
  }

  return {
    apiKey,
    apiSecret,
    baseUrl: baseUrl.replace(/\/$/, ''),
  };
}

async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function parseResponseBody(
  res: Response,
): Promise<unknown> {
  const text = await res.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  init?: {
    query?: Record<
      string,
      string | number | undefined
    >;
    body?: unknown;
  },
): Promise<RequestResult> {
  const creds = getGamerHubCredentials();

  if (!creds) {
    throw new Error('GamerHub no configurado');
  }

  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(
    init?.query ?? {},
  )) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }

  const queryString = qs.toString();

  const url = `${creds.baseUrl}${path}${
    queryString ? `?${queryString}` : ''
  }`;

  const rawBody =
    method === 'POST'
      ? JSON.stringify(init?.body ?? {})
      : '';

  const timestamp = Math.floor(
    Date.now() / 1000,
  ).toString();

  const signaturePayload =
    `${creds.apiKey}|${timestamp}|${rawBody}`;

  const signature = await hmacSha256Hex(
    creds.apiSecret,
    signaturePayload,
  );

  const headers: Record<string, string> = {
    'X-API-Key': creds.apiKey,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const proxyUrl =
    process.env['GAMERHUB_PROXY_URL'] ||
    process.env['TOPUP_PROXY_URL'];

  const proxySecret =
    process.env['GAMERHUB_PROXY_SECRET'] ||
    process.env['TOPUP_PROXY_SECRET'];

  /*
   * Si existe proxy, usamos el relay de GamerHub.
   */
  if (proxyUrl) {
    const proxyBase = proxyUrl.replace(/\/$/, '');

    const relayHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (proxySecret) {
      relayHeaders['X-Relay-Secret'] = proxySecret;
    }

    /*
     * El relay tiene endpoints directos para:
     *
     * POST /verify
     * POST /order
     *
     * Check ID usa /verify.
     * Los pedidos usan /order.
     */
    if (
      (path === '/verify' || path === '/orders') &&
      method === 'POST'
    ) {
      const relayPath =
        path === '/verify'
          ? '/verify'
          : '/order';

      const relayRes = await fetch(
        `${proxyBase}${relayPath}`,
        {
          method: 'POST',
          headers: relayHeaders,
          body: rawBody,
        },
      );

      const body =
        await parseResponseBody(relayRes);

      return {
        ok: relayRes.ok,
        status: relayRes.status,
        body,
      };
    }

    /*
     * Para GET y otros POST usamos el envelope
     * que espera el relay.
     */
    const envelope = JSON.stringify({
      url,
      method,
      headers,
      ...(method === 'POST'
        ? { body: rawBody }
        : {}),
    });

    const relayRes = await fetch(
      proxyBase,
      {
        method: 'POST',
        headers: relayHeaders,
        body: envelope,
      },
    );

    const body =
      await parseResponseBody(relayRes);

    return {
      ok: relayRes.ok,
      status: relayRes.status,
      body,
    };
  }

  /*
   * Sin proxy, conexión directa con GamerHub.
   */
  const res = await fetch(url, {
    method,
    headers,
    ...(method === 'POST'
      ? { body: rawBody }
      : {}),
  });

  const body =
    await parseResponseBody(res);

  return {
    ok: res.ok,
    status: res.status,
    body,
  };
}

export async function gamerHubGet(
  path: string,
  query?: Record<
    string,
    string | number | undefined
  >,
): Promise<RequestResult> {
  return request('GET', path, {
    query,
  });
}

export async function gamerHubBalance(): Promise<RequestResult> {
  return request('GET', '/balance');
}

export async function gamerHubProducts(): Promise<RequestResult> {
  return request('GET', '/products');
}

export async function gamerHubVerify(
  productCode: string,
  playerId: string,
): Promise<RequestResult> {
  const body = {
    product_code: productCode,
    payload: {
      input1: playerId,
    },
  };

  return request('POST', '/verify', {
    body,
  });
}

export function gamerHubProductCodeFor(
  productId?: string,
  serviceCode?: string,
): string | null {
  const values = [
    productId,
    serviceCode,
  ]
    .filter(Boolean)
    .map((value) =>
      String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''),
    );

  for (const value of values) {
    if (value.includes('freefire')) {
      return 'freefire-latam';
    }

    if (
      value.includes('bloodstrike') ||
      value.includes('bsglobal')
    ) {
      return 'bs-global';
    }

    if (
      value.includes('pubgmobile') ||
      value.includes('pubgmglobal')
    ) {
      return 'pubgm-global';
    }
  }

  return null;
}

export async function gamerHubCheckId(
  productCode: string,
  playerId: string,
): Promise<{
  ok: boolean;
  valid: boolean;
  nickname: string | null;
  region: string | null;
  status: number;
}> {
  const res = await gamerHubVerify(
    productCode,
    playerId,
  );

  const root =
    res.body &&
    typeof res.body === 'object'
      ? (res.body as Record<string, unknown>)
      : {};

  const candidates = [
    root,
    root.data,
    root.result,
    root.payload,
    root.player,
  ];

  let valid: boolean | null = null;
  let nickname: string | null = null;
  let region: string | null = null;

  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate !== 'object'
    ) {
      continue;
    }

    const obj =
      candidate as Record<string, unknown>;

    if (valid === null) {
      const possibleValid =
        obj.valid ??
        obj.verified ??
        obj.is_valid ??
        obj.isValid ??
        obj.success ??
        obj.ok;

      if (
        typeof possibleValid === 'boolean'
      ) {
        valid = possibleValid;
      }
    }

    if (!nickname) {
      const possibleName =
        obj.name ??
        obj.nickname ??
        obj.username ??
        obj.player_name ??
        obj.playerName ??
        obj.account_name ??
        obj.accountName;

      if (
        typeof possibleName === 'string' &&
        possibleName.trim()
      ) {
        nickname =
          possibleName.trim();
      }
    }

    if (!region) {
      const possibleRegion =
        obj.region ??
        obj.zone ??
        obj.server ??
        obj.country;

      if (
        typeof possibleRegion === 'string' &&
        possibleRegion.trim()
      ) {
        region =
          possibleRegion.trim();
      }
    }
  }

  if (valid === null) {
    const statusTexts = candidates
      .filter(
        (
          value,
        ): value is Record<
          string,
          unknown
        > =>
          Boolean(
            value &&
            typeof value === 'object',
          ),
      )
      .map((obj) => obj.status)
      .filter(
        (
          value,
        ): value is string =>
          typeof value === 'string',
      )
      .map((value) =>
        value.toLowerCase(),
      );

    if (
      statusTexts.some((value) =>
        /verified|valid|ok|success/.test(
          value,
        ),
      )
    ) {
      valid = true;
    }
  }

  if (valid === null && nickname) {
    valid = true;
  }

  return {
    ok: res.ok,
    valid: Boolean(valid),
    nickname: valid
      ? nickname
      : null,
    region: valid
      ? region
      : null,
    status: res.status,
  };
}

export async function gamerHubOrder(input: {
  product: string;
  sku: string;
  playerId: string;
  reference?: string;
}): Promise<RequestResult> {
  return request('POST', '/orders', {
    body: {
      product: input.product,
      sku: input.sku,
      player_id: input.playerId,
      ...(input.reference
        ? {
            reference: input.reference,
          }
        : {}),
    },
  });
  }
