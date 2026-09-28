import type { FinancialImportDraft, ParsedDocument } from "../types";

/**
 * Sessão de importação em memória — descartada no bloqueio/troca de usuário.
 * Nunca persiste PDF nem draft no IndexedDB financeiro.
 */
export class ImportSessionManager {
  private draft: FinancialImportDraft | null = null;
  private parsed: ParsedDocument | null = null;
  private userSessionId: string | null = null;
  private fileName: string | null = null;

  start(userSessionId: string): void {
    this.clear();
    this.userSessionId = userSessionId;
  }

  getUserSessionId(): string | null {
    return this.userSessionId;
  }

  setParsed(doc: ParsedDocument, fileName: string): void {
    this.parsed = doc;
    this.fileName = fileName;
  }

  getParsed(): ParsedDocument | null {
    return this.parsed;
  }

  getFileName(): string | null {
    return this.fileName;
  }

  setDraft(draft: FinancialImportDraft): void {
    this.draft = draft;
  }

  getDraft(): FinancialImportDraft | null {
    return this.draft;
  }

  updateDraft(draft: FinancialImportDraft): void {
    this.draft = draft;
  }

  /** Invalida tudo — lock / troca de usuário. */
  clear(): void {
    this.draft = null;
    this.parsed = null;
    this.userSessionId = null;
    this.fileName = null;
  }

  assertUser(userSessionId: string): void {
    if (!this.userSessionId || this.userSessionId !== userSessionId) {
      this.clear();
      throw new Error("Sessão de importação inválida.");
    }
  }
}

let singleton: ImportSessionManager | null = null;

export function getImportSessionManager(): ImportSessionManager {
  if (!singleton) singleton = new ImportSessionManager();
  return singleton;
}
