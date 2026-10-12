import {
  PluggyHttpError,
  type PluggyAccount,
  type PluggyBill,
  type PluggyFetchBundle,
  type PluggyFetchWarning,
  type PluggyInvestment,
  type PluggyItemBundle,
  type PluggyLoan,
  type PluggyPage,
  type PluggyTransaction,
} from "./types";

const DEFAULT_BASE_URL = "https://api.pluggy.ai";
/** Renova a API key ~10 min antes do prazo oficial de 2h. */
const API_KEY_TTL_MS = 110 * 60 * 1000;

export interface PluggyClientOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ListTransactionsParams {
  accountId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateConnectTokenParams {
  /** Identificador do seu usuário (opcional; vai em options.clientUserId). */
  clientUserId?: string;
  /** Para atualizar uma conexão existente no widget. */
  itemId?: string;
  /** HTTPS público do receptor (ngrok etc.) — options.webhookUrl. */
  webhookUrl?: string;
}

export interface PluggyConnectToken {
  accessToken: string;
}

export interface PluggyClient {
  authenticate(): Promise<string>;
  createConnectToken(
    params?: CreateConnectTokenParams,
  ): Promise<PluggyConnectToken>;
  listAccounts(itemId: string): Promise<PluggyAccount[]>;
  listTransactions(params: ListTransactionsParams): Promise<PluggyTransaction[]>;
  listAllTransactions(
    accountId: string,
    opts?: { from?: string; to?: string },
  ): Promise<PluggyTransaction[]>;
  listInvestments(itemId: string): Promise<PluggyInvestment[]>;
  listBills(accountId: string): Promise<PluggyBill[]>;
  listLoans(itemId: string): Promise<PluggyLoan[]>;
  fetchItemsBundle(itemIds: string[]): Promise<PluggyFetchBundle>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pageResults<T>(payload: unknown): PluggyPage<T> {
  const obj = asRecord(payload);
  if (!obj) {
    return { total: 0, totalPages: 0, page: 1, results: [] };
  }
  const results = Array.isArray(obj.results)
    ? (obj.results as T[])
    : Array.isArray(payload)
      ? (payload as T[])
      : [];
  return {
    total: typeof obj.total === "number" ? obj.total : results.length,
    totalPages: typeof obj.totalPages === "number" ? obj.totalPages : 1,
    page: typeof obj.page === "number" ? obj.page : 1,
    results,
  };
}

/** Resposta de GET /v2/transactions (cursor). */
function cursorPageResults<T>(payload: unknown): {
  results: T[];
  next: string | null;
} {
  const obj = asRecord(payload);
  const results = Array.isArray(obj?.results) ? (obj!.results as T[]) : [];
  const next = typeof obj?.next === "string" && obj.next.length > 0 ? obj.next : null;
  return { results, next };
}

function v2TransactionsPath(nextCursor: string | null | undefined): string {
  if (!nextCursor) return "/v2/transactions";
  if (nextCursor.startsWith("/v2/transactions")) return nextCursor;
  if (nextCursor.startsWith("?")) return `/v2/transactions${nextCursor}`;
  return `/v2/transactions?${nextCursor}`;
}

export function createPluggyClient(options: PluggyClientOptions): PluggyClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  let apiKey: string | null = null;
  let apiKeyExpiresAt = 0;

  async function authenticate(): Promise<string> {
    const now = Date.now();
    if (apiKey && now < apiKeyExpiresAt) return apiKey;

    const res = await fetchImpl(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
      }),
      cache: "no-store",
    });

    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const rec = asRecord(body);
      throw new PluggyHttpError(
        "Falha ao autenticar na Pluggy",
        res.status,
        typeof rec?.code === "string" ? rec.code : undefined,
        body,
      );
    }

    const rec = asRecord(body);
    const key = typeof rec?.apiKey === "string" ? rec.apiKey : null;
    if (!key) {
      throw new PluggyHttpError("Resposta de auth sem apiKey", 500);
    }
    apiKey = key;
    apiKeyExpiresAt = now + API_KEY_TTL_MS;
    return key;
  }

  async function request<T>(
    path: string,
    init?: RequestInit & { query?: Record<string, string | number | undefined> },
  ): Promise<T> {
    const key = await authenticate();
    const url = new URL(`${baseUrl}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === "") continue;
        url.searchParams.set(k, String(v));
      }
    }

    const { query: _q, ...rest } = init ?? {};
    const res = await fetchImpl(url.toString(), {
      ...rest,
      headers: {
        Accept: "application/json",
        "X-API-KEY": key,
        ...(rest.headers ?? {}),
      },
      cache: "no-store",
    });

    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const rec = asRecord(body);
      throw new PluggyHttpError(
        `Pluggy ${path} falhou (${res.status})`,
        res.status,
        typeof rec?.code === "string"
          ? rec.code
          : typeof rec?.codeDescription === "string"
            ? rec.codeDescription
            : undefined,
        body,
      );
    }
    return body as T;
  }

  async function createConnectToken(
    params?: CreateConnectTokenParams,
  ): Promise<PluggyConnectToken> {
    const body: Record<string, unknown> = {};
    if (params?.itemId?.trim()) {
      body.itemId = params.itemId.trim();
    }
    const options: Record<string, string> = {};
    if (params?.clientUserId?.trim()) {
      options.clientUserId = params.clientUserId.trim();
    }
    if (params?.webhookUrl?.trim()) {
      options.webhookUrl = params.webhookUrl.trim();
    }
    if (Object.keys(options).length > 0) {
      body.options = options;
    }

    const payload = await request<unknown>("/connect_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const rec = asRecord(payload);
    const accessToken =
      typeof rec?.accessToken === "string" ? rec.accessToken : null;
    if (!accessToken) {
      throw new PluggyHttpError("Resposta de connect_token sem accessToken", 502);
    }
    return { accessToken };
  }

  async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
    const page = pageResults<PluggyAccount>(
      await request<unknown>("/accounts", { query: { itemId } }),
    );
    return page.results;
  }

  async function listTransactions(
    params: ListTransactionsParams,
  ): Promise<PluggyTransaction[]> {
    // GET /transactions (paginado por page) retorna 410 — usar v2/cursor.
    const payload = await request<unknown>("/v2/transactions", {
      query: {
        accountId: params.accountId,
        dateFrom: params.from,
        dateTo: params.to,
      },
    });
    return cursorPageResults<PluggyTransaction>(payload).results;
  }

  async function listAllTransactions(
    accountId: string,
    opts?: { from?: string; to?: string },
  ): Promise<PluggyTransaction[]> {
    const all: PluggyTransaction[] = [];
    let next: string | null = null;
    let first = true;
    let guard = 0;

    while (guard < 40) {
      guard += 1;
      let payload: unknown;
      if (first) {
        first = false;
        payload = await request<unknown>("/v2/transactions", {
          query: {
            accountId,
            dateFrom: opts?.from,
            dateTo: opts?.to,
          },
        });
      } else if (next) {
        payload = await request<unknown>(v2TransactionsPath(next));
      } else {
        break;
      }

      const parsed = cursorPageResults<PluggyTransaction>(payload);
      all.push(...parsed.results);
      next = parsed.next;
      if (!next) break;
    }
    return all;
  }

  async function listInvestments(itemId: string): Promise<PluggyInvestment[]> {
    const page = pageResults<PluggyInvestment>(
      await request<unknown>("/investments", { query: { itemId } }),
    );
    return page.results;
  }

  async function listBills(accountId: string): Promise<PluggyBill[]> {
    try {
      const page = pageResults<PluggyBill>(
        await request<unknown>("/bills", { query: { accountId } }),
      );
      return page.results.map((b) => ({ ...b, accountId: b.accountId ?? accountId }));
    } catch (err) {
      if (err instanceof PluggyHttpError && (err.status === 404 || err.status === 400)) {
        return [];
      }
      throw err;
    }
  }

  async function listLoans(itemId: string): Promise<PluggyLoan[]> {
    try {
      const page = pageResults<PluggyLoan>(
        await request<unknown>("/loans", { query: { itemId } }),
      );
      return page.results;
    } catch (err) {
      if (err instanceof PluggyHttpError && (err.status === 404 || err.status === 400)) {
        return [];
      }
      throw err;
    }
  }

  async function fetchItemsBundle(itemIds: string[]): Promise<PluggyFetchBundle> {
    const unique = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
    const items: PluggyItemBundle[] = [];
    const warnings: PluggyFetchWarning[] = [];

    for (const itemId of unique) {
      const accounts = await listAccounts(itemId);
      const transactions: PluggyTransaction[] = [];
      const bills: PluggyBill[] = [];

      if (accounts.length === 0) {
        warnings.push({
          level: "warn",
          itemId,
          message: "Nenhuma conta retornada para este itemId.",
        });
      }

      for (const account of accounts) {
        try {
          const txs = await listAllTransactions(account.id);
          transactions.push(...txs);
          if (txs.length === 0) {
            warnings.push({
              level: "info",
              itemId,
              accountId: account.id,
              accountName: account.name,
              message: `Extrato vazio em “${account.name}” (${account.type}).`,
            });
          }
        } catch (err) {
          if (
            err instanceof PluggyHttpError &&
            (err.status === 404 || err.status === 400)
          ) {
            warnings.push({
              level: "warn",
              itemId,
              accountId: account.id,
              accountName: account.name,
              code: err.code ?? String(err.status),
              message: `Extrato não disponível para “${account.name}”: ${err.message}`,
            });
            continue;
          }
          throw err;
        }
        if (account.type === "CREDIT") {
          bills.push(...(await listBills(account.id)));
        }
      }

      let investments: PluggyInvestment[] = [];
      try {
        investments = await listInvestments(itemId);
        if (investments.length === 0) {
          warnings.push({
            level: "info",
            itemId,
            message: "Nenhum investimento retornado para este item.",
          });
        }
      } catch (err) {
        if (
          err instanceof PluggyHttpError &&
          (err.status === 404 || err.status === 400)
        ) {
          warnings.push({
            level: "warn",
            itemId,
            code: err.code ?? String(err.status),
            message: `Investimentos não disponíveis: ${err.message}`,
          });
        } else {
          throw err;
        }
      }

      let loans: PluggyLoan[] = [];
      try {
        loans = await listLoans(itemId);
        if (loans.length === 0) {
          warnings.push({
            level: "info",
            itemId,
            message: "Nenhum empréstimo (loans) retornado.",
          });
        }
      } catch (err) {
        if (
          err instanceof PluggyHttpError &&
          (err.status === 404 || err.status === 400)
        ) {
          warnings.push({
            level: "warn",
            itemId,
            code: err.code ?? String(err.status),
            message: `Empréstimos não disponíveis: ${err.message}`,
          });
        } else {
          throw err;
        }
      }

      items.push({
        itemId,
        accounts,
        transactions,
        investments,
        bills,
        loans,
      });
    }

    return {
      fetchedAt: new Date().toISOString(),
      items,
      warnings,
    };
  }

  return {
    authenticate,
    createConnectToken,
    listAccounts,
    listTransactions,
    listAllTransactions,
    listInvestments,
    listBills,
    listLoans,
    fetchItemsBundle,
  };
}
