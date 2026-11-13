export type PushDiagnostics = {
  configured: true;
  watchingCount: number;
  seriesCronLastSeenAt: string | null;
  deliveries: Array<{
    createdAt: string;
    status: "pending" | "sent" | "failed";
    outcome: "definitive" | "temporary" | "uncertain" | null;
    type: string;
    recipients: number | null;
    error: string | null;
  }>;
};

export type TestPushResult = {
  status: "sent" | "failed" | "duplicate" | "uncertain";
  recipients: number | null;
};

export class PushResponseError extends Error {
  constructor(message = "El diagnóstico de notificaciones no está disponible por ahora.") {
    super(message);
    this.name = "PushResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalDate(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isOptionalCount(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 0);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 401) {
      throw new PushResponseError("Tu sesión venció. Volvé a iniciar sesión para comprobar las notificaciones.");
    }
    if (response.status === 429) {
      throw new PushResponseError("Esperá un minuto antes de repetir la prueba.");
    }
    throw new PushResponseError();
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|\s*$)/.test(contentType)) {
    throw new PushResponseError();
  }

  try {
    return await response.json();
  } catch {
    throw new PushResponseError();
  }
}

export async function parsePushDiagnosticsResponse(response: Response): Promise<PushDiagnostics> {
  const payload = await readJsonResponse(response);
  if (!isRecord(payload) || payload.configured !== true || !Number.isInteger(payload.watchingCount) ||
      Number(payload.watchingCount) < 0 || !isOptionalDate(payload.seriesCronLastSeenAt) ||
      !Array.isArray(payload.deliveries)) {
    throw new PushResponseError();
  }

  const deliveries = payload.deliveries.map((value: unknown) => {
    if (!isRecord(value) || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) ||
        !["pending", "sent", "failed"].includes(String(value.status)) ||
        typeof value.type !== "string" || !value.type || !isOptionalCount(value.recipients) ||
        !(value.error === null || typeof value.error === "string") ||
        !(value.outcome === undefined || value.outcome === null ||
          ["definitive", "temporary", "uncertain"].includes(String(value.outcome)))) {
      throw new PushResponseError();
    }

    return {
      createdAt: value.createdAt as string,
      status: value.status as PushDiagnostics["deliveries"][number]["status"],
      outcome: (value.outcome ?? null) as PushDiagnostics["deliveries"][number]["outcome"],
      type: value.type as string,
      recipients: value.recipients as number | null,
      error: value.error as string | null
    };
  });

  return {
    configured: true,
    watchingCount: payload.watchingCount as number,
    seriesCronLastSeenAt: payload.seriesCronLastSeenAt as string | null,
    deliveries
  };
}

export async function parseTestPushResponse(response: Response): Promise<TestPushResult> {
  const payload = await readJsonResponse(response);
  if (!isRecord(payload) || !["sent", "failed", "duplicate", "uncertain"].includes(String(payload.status)) ||
      !isOptionalCount(payload.recipients)) {
    throw new PushResponseError();
  }

  return {
    status: payload.status as TestPushResult["status"],
    recipients: payload.recipients as number | null
  };
}
