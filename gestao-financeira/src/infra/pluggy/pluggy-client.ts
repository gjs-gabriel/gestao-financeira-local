import {
  PluggyHttpError,
  type PluggyAccount,
  type PluggyBill,
  type PluggyFetchBundle,
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

export interface PluggyClient {
  authenticate(): Promise<string>;
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

  async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
    const page = pageResults<PluggyAccount>(
      await request<unknown>("/accounts", { query: { itemId } }),
    );
    return page.results;
  }

  async function listTransactions(
    params: ListTransactionsParams,
  ): Promise<PluggyTransaction[]> {
    const page = pageResults<PluggyTransaction>(
      await request<unknown>("/transactions", {
        query: {
          accountId: params.accountId,
          from: params.from,
          to: params.to,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 500,
        },
      }),
    );
    return page.results;
  }

  async function listAllTransactions(
    accountId: string,
    opts?: { from?: string; to?: string },
  ): Promise<PluggyTransaction[]> {
    const all: PluggyTransaction[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const payload = await request<unknown>("/transactions", {
        query: {
          accountId,
          from: opts?.from,
          to: opts?.to,
          page,
          pageSize: 500,
        },
      });
      const parsed = pageResults<PluggyTransaction>(payload);
      all.push(...parsed.results);
      totalPages = Math.max(1, parsed.totalPages);
      page += 1;
    } while (page <= totalPages && page <= 40);
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

    for (const itemId of unique) {
      const accounts = await listAccounts(itemId);
      const transactions: PluggyTransaction[] = [];
      const bills: PluggyBill[] = [];

      for (const account of accounts) {
        const txs = await listAllTransactions(account.id);
        transactions.push(...txs);
        if (account.type === "CREDIT") {
          bills.push(...(await listBills(account.id)));
        }
      }

      items.push({
        itemId,
        accounts,
        transactions,
        investments: await listInvestments(itemId),
        bills,
        loans: await listLoans(itemId),
      });
    }

    return {
      fetchedAt: new Date().toISOString(),
      items,
    };
  }

  return {
    authenticate,
    listAccounts,
    listTransactions,
    listAllTransactions,
    listInvestments,
    listBills,
    listLoans,
    fetchItemsBundle,
  };
}
