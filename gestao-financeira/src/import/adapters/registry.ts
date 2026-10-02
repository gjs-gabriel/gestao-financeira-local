/**
 * Registry de adapters por instituição.
 * Adicionar banco novo = registrar detector + parser, sem tocar no núcleo.
 */

export type SupportedImportFormat = "pdf" | "csv" | "xlsx" | "xls" | "ofx";

export type AdapterDocumentType =
  | "bank_statement"
  | "income_report"
  | "investment_position"
  | "investment_statement";

export interface InstitutionAdapter {
  id: string;
  institutionName: string;
  supportedFormats: SupportedImportFormat[];
  supportedDocumentTypes: AdapterDocumentType[];
  version: string;
  /** Retorna score 0–1 se o texto/nome parecer desta instituição. */
  detect: (input: { fileName: string; textSample: string }) => number;
}

const adapters: InstitutionAdapter[] = [
  {
    id: "generic",
    institutionName: "Genérico",
    supportedFormats: ["pdf", "csv", "xlsx", "xls", "ofx"],
    supportedDocumentTypes: [
      "bank_statement",
      "income_report",
      "investment_position",
      "investment_statement",
    ],
    version: "1.0.0",
    detect: () => 0.1,
  },
  {
    id: "nubank",
    institutionName: "Nubank",
    supportedFormats: ["pdf", "ofx", "csv"],
    supportedDocumentTypes: ["bank_statement", "income_report"],
    version: "1.0.0",
    detect: ({ fileName, textSample }) =>
      /nubank|nu_/i.test(fileName) || /nubank|nu pagamentos/i.test(textSample)
        ? 0.95
        : 0,
  },
  {
    id: "inter",
    institutionName: "Banco Inter",
    supportedFormats: ["pdf", "ofx", "csv", "xlsx"],
    supportedDocumentTypes: [
      "bank_statement",
      "income_report",
      "investment_position",
    ],
    version: "1.0.0",
    detect: ({ fileName, textSample }) =>
      /inter/i.test(fileName) || /banco inter/i.test(textSample) ? 0.9 : 0,
  },
  {
    id: "itau",
    institutionName: "Itaú Unibanco",
    supportedFormats: ["pdf", "ofx", "csv"],
    supportedDocumentTypes: ["bank_statement", "income_report"],
    version: "1.0.0",
    detect: ({ textSample, fileName }) =>
      /ita[uú]/i.test(fileName) || /ita[uú]/i.test(textSample) ? 0.9 : 0,
  },
  {
    id: "bradesco",
    institutionName: "Bradesco",
    supportedFormats: ["pdf", "ofx", "csv"],
    supportedDocumentTypes: ["bank_statement", "income_report"],
    version: "1.0.0",
    detect: ({ textSample, fileName }) =>
      /bradesco/i.test(fileName) || /bradesco/i.test(textSample) ? 0.9 : 0,
  },
  {
    id: "santander",
    institutionName: "Santander",
    supportedFormats: ["pdf", "ofx", "csv"],
    supportedDocumentTypes: ["bank_statement", "income_report"],
    version: "1.0.0",
    detect: ({ textSample, fileName }) =>
      /santander/i.test(fileName) || /santander/i.test(textSample) ? 0.9 : 0,
  },
  {
    id: "bb",
    institutionName: "Banco do Brasil",
    supportedFormats: ["pdf", "ofx", "csv"],
    supportedDocumentTypes: ["bank_statement", "income_report"],
    version: "1.0.0",
    detect: ({ textSample, fileName }) =>
      /banco.?do.?brasil|\bbb\b/i.test(fileName) ||
      /banco do brasil/i.test(textSample)
        ? 0.85
        : 0,
  },
  {
    id: "caixa",
    institutionName: "Caixa Econômica Federal",
    supportedFormats: ["pdf", "ofx", "csv"],
    supportedDocumentTypes: ["bank_statement", "income_report"],
    version: "1.0.0",
    detect: ({ textSample, fileName }) =>
      /caixa/i.test(fileName) || /caixa econ/i.test(textSample) ? 0.85 : 0,
  },
];

export function listInstitutionAdapters(): InstitutionAdapter[] {
  return [...adapters];
}

export function detectInstitutionAdapter(input: {
  fileName: string;
  textSample: string;
}): InstitutionAdapter {
  let best = adapters[0];
  let bestScore = -1;
  for (const a of adapters) {
    const score = a.detect(input);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}
