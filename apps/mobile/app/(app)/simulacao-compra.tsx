import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CDI_ANNUAL,
  DEFAULT_IR_RATE,
  MAX_PURCHASE_ALTERNATIVES,
  PURCHASE_MODE_LABELS,
  PURCHASE_MODE_OPTIONS,
  accountBalance,
  cardLimitUsage,
  cashflowLastMonths,
  formatBrl,
  formatYieldAssumptionsForInputs,
  inferSourceYieldAssumptions,
  planPurchaseFromNaturalLanguage,
  recommendPurchaseStrategies,
  simulatePurchaseAlternatives,
  type PurchaseAltMode,
  type PurchaseSimulationResult,
  type PurchaseUrgency,
} from "@gf/core";
import { Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Label,
  ListRow,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import {
  URGENCY_OPTIONS,
  WIZARD_STEPS,
  altDisplayName,
  altFields,
  amountLabel,
  formatMoneyInput,
  installmentsLabel,
  monthlyLabel,
  newAlt,
  parseMoneyInput,
  seedAltForMode,
  type AltDraft,
  type WizardStep,
} from "../../src/lib/purchase-wizard";
import { colors, fonts } from "../../src/theme";
import { useVault } from "../../src/vault/VaultProvider";

type FundingSource = {
  key: string;
  kind: "investment" | "account";
  id: string;
  name: string;
  balance: number;
  classificationOrType?: string;
  notes?: string;
  rawName?: string;
  group: string;
};

function avgSavings(
  snapshot: NonNullable<ReturnType<typeof useVault>["snapshot"]>,
): number {
  const now = new Date();
  const series = cashflowLastMonths(
    snapshot,
    now.getFullYear(),
    now.getMonth() + 1,
    6,
  );
  if (series.length === 0) return 0;
  const sum = series.reduce((s, m) => s + (m.income - m.totalExpenses), 0);
  return Math.max(0, Math.round((sum / series.length) * 100) / 100);
}

export default function SimulacaoCompraScreen() {
  const { snapshot } = useVault();
  const [step, setStep] = useState<WizardStep>(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [nlStrategy, setNlStrategy] = useState("");
  const [cashPrice, setCashPrice] = useState("8000");
  const [financedTotal, setFinancedTotal] = useState("9000");
  const [maxInstallments, setMaxInstallments] = useState("10");
  const [urgency, setUrgency] = useState<PurchaseUrgency>("media");
  const [alternatives, setAlternatives] = useState<AltDraft[]>([]);
  const [sourceKey, setSourceKey] = useState("");
  const [pctOfCdi, setPctOfCdi] = useState("100");
  const [cdiAnnualPct, setCdiAnnualPct] = useState(
    String(Math.round(DEFAULT_CDI_ANNUAL * 10000) / 100).replace(".", ","),
  );
  const [irPct, setIrPct] = useState(
    String(Math.round(DEFAULT_IR_RATE * 1000) / 10).replace(".", ","),
  );
  const [monthlySavings, setMonthlySavings] = useState("750");
  const [sourceHint, setSourceHint] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseSimulationResult | null>(null);

  const fundingSources = useMemo((): FundingSource[] => {
    if (!snapshot) return [];
    const invs: FundingSource[] = (snapshot.investments ?? [])
      .filter((i) => (i.lifecycle ?? "active") !== "closed" && i.amount > 0)
      .map((i) => ({
        key: `inv:${i.id}`,
        kind: "investment" as const,
        id: i.id,
        name: i.name,
        balance: i.amount,
        classificationOrType: i.classification,
        notes: i.notes,
        rawName: i.rawName,
        group: "Aplicações",
      }));
    const accs: FundingSource[] = (snapshot.accounts ?? [])
      .filter((a) => a.status === "active")
      .map((a) => ({
        key: `acc:${a.id}`,
        kind: "account" as const,
        id: a.id,
        name: a.name,
        balance: accountBalance(a, snapshot.transactions ?? []),
        classificationOrType: a.type,
        notes: a.notes,
        group: "Contas",
      }))
      .filter((a) => a.balance > 0);
    return [...invs, ...accs];
  }, [snapshot]);

  const cardLiquidity = useMemo(() => {
    if (!snapshot) return [];
    return (snapshot.creditCards ?? [])
      .filter((c) => c.status === "active")
      .map((c) => {
        const usage = cardLimitUsage(c, snapshot);
        return {
          id: c.id,
          name: c.name,
          available: usage.available,
          limit: usage.limit,
        };
      });
  }, [snapshot]);

  function applySource(source: FundingSource) {
    setSourceKey(source.key);
    const assumptions = inferSourceYieldAssumptions(
      {
        kind: source.kind,
        name: source.name,
        notes: source.notes,
        rawName: source.rawName,
        classificationOrType: source.classificationOrType,
      },
      { cdiAnnual: DEFAULT_CDI_ANNUAL },
    );
    const formatted = formatYieldAssumptionsForInputs(assumptions);
    setPctOfCdi(formatted.pctOfCdi);
    setCdiAnnualPct(formatted.cdiAnnualPct);
    setIrPct(formatted.irPct);
    setSourceHint(assumptions.hint);
    if (snapshot) {
      const sav = avgSavings(snapshot);
      if (sav > 0) setMonthlySavings(String(sav).replace(".", ","));
    }
  }

  useEffect(() => {
    if (!snapshot || fundingSources.length === 0) return;
    const stillValid = fundingSources.some((s) => s.key === sourceKey);
    if (!sourceKey || !stillValid) {
      const preferred =
        fundingSources.find((s) => s.classificationOrType === "renda_fixa") ??
        [...fundingSources].sort((a, b) => b.balance - a.balance)[0];
      if (preferred) applySource(preferred);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.updatedAt, fundingSources.length]);

  useEffect(() => {
    if (!snapshot) return;
    const sav = avgSavings(snapshot);
    if (sav > 0) setMonthlySavings(String(sav).replace(".", ","));
  }, [snapshot?.updatedAt]);

  if (!snapshot) return null;

  const selectedSource = fundingSources.find((s) => s.key === sourceKey);
  const stepMeta = WIZARD_STEPS.find((s) => s.step === step)!;

  function goBack() {
    setMsg(null);
    setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s));
  }

  function goTo(next: WizardStep) {
    setMsg(null);
    setStep(next);
  }

  function updateAlt(id: string, patch: Partial<AltDraft>) {
    setAlternatives((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function toggleStrategyMode(mode: PurchaseAltMode, enabled: boolean) {
    if (enabled) {
      setAlternatives((prev) => {
        if (prev.some((a) => a.mode === mode)) return prev;
        if (prev.length >= MAX_PURCHASE_ALTERNATIVES) return prev;
        return [
          ...prev,
          seedAltForMode(mode, cashPrice, financedTotal, maxInstallments),
        ];
      });
      return;
    }
    setAlternatives((prev) => prev.filter((a) => a.mode !== mode));
  }

  function fillSuggestedStrategies() {
    setMsg(null);
    const vista = parseMoneyInput(cashPrice);
    const prazo = parseMoneyInput(financedTotal);
    const n = Math.max(
      1,
      Math.floor(Number(maxInstallments.replace(",", ".")) || 1),
    );
    if (vista <= 0) {
      setMsg("Informe o valor à vista para sugerir estratégias.");
      return;
    }
    const pct = Number(pctOfCdi.replace(",", "."));
    const cdi = Number(cdiAnnualPct.replace(",", ".")) / 100;
    const ir = Number(irPct.replace(",", ".")) / 100;
    const savings = parseMoneyInput(monthlySavings);
    const sim = recommendPurchaseStrategies({
      investmentName: selectedSource?.name ?? "Origem",
      investmentBalance:
        selectedSource?.balance ?? Math.max(vista * 3, 20_000),
      pctOfCdi: Number.isFinite(pct) && pct >= 0 ? pct : 100,
      cdiAnnual: Number.isFinite(cdi) && cdi > 0 ? cdi : DEFAULT_CDI_ANNUAL,
      irRate: Number.isFinite(ir) && ir >= 0 ? ir : DEFAULT_IR_RATE,
      monthlySavings: savings,
      horizonMonths: 12,
      cashPrice: vista,
      financedTotal: prazo > 0 ? prazo : vista,
      maxInstallments: n,
      urgency,
    });
    setAlternatives(
      sim.alternatives.map((a) => {
        const fields = altFields(a.mode);
        const fee = a.monthlyOutflow > 0 ? a.monthlyOutflow : a.amount;
        return newAlt({
          id: a.id,
          name: a.name,
          mode: a.mode,
          amount:
            a.mode === "financing_interest"
              ? cashPrice || formatMoneyInput(a.amount)
              : fields.amountMirrorsMonthly
                ? formatMoneyInput(fee)
                : formatMoneyInput(a.amount),
          installments: String(a.installments),
          monthlyOutflow: fields.showMonthly
            ? a.monthlyOutflow > 0
              ? formatMoneyInput(a.monthlyOutflow)
              : fields.amountMirrorsMonthly
                ? formatMoneyInput(fee)
                : ""
            : "",
          residualAmount:
            a.residualAmount > 0 ? formatMoneyInput(a.residualAmount) : "",
          monthlyRatePct:
            a.monthlyRatePct != null && a.monthlyRatePct > 0
              ? formatMoneyInput(a.monthlyRatePct)
              : "",
        });
      }),
    );
    setResult(null);
    setMsg(`${sim.alternatives.length} estratégias sugeridas — revise.`);
  }

  function applyNlText(): boolean {
    const text = nlStrategy.trim();
    if (text.length < 8) {
      setMsg(
        "Descreva a compra (ex.: “Pix de R$ 8.000 vs 10× de R$ 9.000”) ou pule.",
      );
      return false;
    }
    const plan = planPurchaseFromNaturalLanguage(text, {
      cashPrice: parseMoneyInput(cashPrice) || undefined,
      financedTotal: parseMoneyInput(financedTotal) || undefined,
      maxInstallments:
        Math.floor(Number(maxInstallments.replace(",", ".")) || 0) || undefined,
      urgency,
    });
    if (plan.cashPrice != null && plan.cashPrice > 0) {
      setCashPrice(formatMoneyInput(plan.cashPrice));
    }
    if (plan.financedTotal != null && plan.financedTotal > 0) {
      setFinancedTotal(formatMoneyInput(plan.financedTotal));
    }
    if (plan.maxInstallments != null && plan.maxInstallments >= 1) {
      setMaxInstallments(String(plan.maxInstallments));
    }
    if (plan.urgency) setUrgency(plan.urgency);
    setAlternatives(
      plan.alternatives.map((a) => {
        const fields = altFields(a.mode);
        const fee =
          a.monthlyOutflow != null && a.monthlyOutflow > 0
            ? String(a.monthlyOutflow)
            : String(a.amount);
        return newAlt({
          mode: a.mode,
          name: a.label?.trim() || PURCHASE_MODE_LABELS[a.mode],
          amount: fields.amountMirrorsMonthly
            ? formatMoneyInput(Number(fee))
            : formatMoneyInput(a.amount),
          installments: String(a.installments),
          monthlyOutflow: fields.showMonthly
            ? a.monthlyOutflow != null && a.monthlyOutflow > 0
              ? formatMoneyInput(a.monthlyOutflow)
              : fields.amountMirrorsMonthly
                ? formatMoneyInput(Number(fee))
                : ""
            : "",
          residualAmount:
            a.residualAmount != null && a.residualAmount > 0
              ? formatMoneyInput(a.residualAmount)
              : "",
          monthlyRatePct:
            a.monthlyRatePct != null && a.monthlyRatePct > 0
              ? formatMoneyInput(a.monthlyRatePct)
              : "",
        });
      }),
    );
    setResult(null);
    setMsg(
      plan.alternatives.length > 0
        ? `${plan.alternatives.length} estratégias lidas do texto.`
        : "Texto lido — ajuste valores na próxima tela.",
    );
    return true;
  }

  function runSimulation(): boolean {
    setMsg(null);
    const pct = Number(pctOfCdi.replace(",", "."));
    const cdi = Number(cdiAnnualPct.replace(",", ".")) / 100;
    const ir = Number(irPct.replace(",", ".")) / 100;
    const savings = parseMoneyInput(monthlySavings);
    const source = fundingSources.find((s) => s.key === sourceKey);

    if (!source) {
      setMsg("Selecione a aplicação ou conta de origem.");
      return false;
    }
    if (!Number.isFinite(pct) || pct < 0) {
      setMsg("Informe o % do CDI.");
      return false;
    }

    const parsedAlts = alternatives.map((a) => {
      const fields = altFields(a.mode);
      const amountRaw = parseMoneyInput(a.amount);
      const installments = Math.max(
        1,
        Math.floor(Number(a.installments.replace(",", ".")) || 1),
      );
      const monthlyRaw = a.monthlyOutflow.trim()
        ? parseMoneyInput(a.monthlyOutflow)
        : undefined;
      const residualRaw = a.residualAmount.trim()
        ? parseMoneyInput(a.residualAmount)
        : undefined;
      const rateRaw = a.monthlyRatePct.trim()
        ? Number(a.monthlyRatePct.replace(",", "."))
        : undefined;

      if (fields.amountMirrorsMonthly) {
        const fee = monthlyRaw && monthlyRaw > 0 ? monthlyRaw : amountRaw;
        return {
          id: a.id,
          name: altDisplayName(a),
          mode: a.mode,
          amount: fee,
          installments,
          monthlyOutflow: fee,
          residualAmount:
            a.mode === "leasing" && residualRaw && residualRaw > 0
              ? residualRaw
              : undefined,
        };
      }
      if (!fields.showMonthly) {
        return {
          id: a.id,
          name: altDisplayName(a),
          mode: a.mode,
          amount: amountRaw,
          installments,
          monthlyRatePct:
            fields.showRate &&
            rateRaw != null &&
            Number.isFinite(rateRaw) &&
            rateRaw > 0
              ? rateRaw
              : undefined,
        };
      }
      return {
        id: a.id,
        name: altDisplayName(a),
        mode: a.mode,
        amount: amountRaw,
        installments,
        monthlyOutflow: monthlyRaw,
      };
    });

    const invalid = parsedAlts.some((a) => {
      const fields = altFields(a.mode);
      if (fields.amountMirrorsMonthly) {
        return !(a.monthlyOutflow != null && a.monthlyOutflow > 0);
      }
      if (a.mode === "consortium") {
        return a.amount <= 0 || !(a.monthlyOutflow != null && a.monthlyOutflow > 0);
      }
      if (a.mode === "financing_interest") {
        return a.amount <= 0 || !(a.monthlyRatePct != null && a.monthlyRatePct > 0);
      }
      return a.amount <= 0;
    });
    if (invalid) {
      setMsg("Cada alternativa precisa dos valores obrigatórios (> 0).");
      return false;
    }
    if (parsedAlts.length < 1) {
      setMsg("Defina pelo menos uma alternativa.");
      return false;
    }

    const vista = parseMoneyInput(cashPrice);
    const prazo = parseMoneyInput(financedTotal);
    const sim = simulatePurchaseAlternatives(
      {
        investmentName: source.name,
        investmentBalance: source.balance,
        pctOfCdi: pct,
        cdiAnnual: Number.isFinite(cdi) && cdi > 0 ? cdi : DEFAULT_CDI_ANNUAL,
        irRate: Number.isFinite(ir) && ir >= 0 ? ir : DEFAULT_IR_RATE,
        monthlySavings: savings,
        horizonMonths: 12,
        referenceCashPrice: vista > 0 ? vista : undefined,
        referenceFinancedTotal: prazo > 0 ? prazo : undefined,
        maxInterestFreeInstallments: Math.max(
          1,
          Math.floor(Number(maxInstallments.replace(",", ".")) || 1),
        ),
        urgency,
        cards: cardLiquidity,
      },
      parsedAlts,
    );
    setResult(sim);
    return true;
  }

  return (
    <Screen>
      <Title>Simulação de compra</Title>
      <Subtitle>
        {`Passo ${step} de 5 · ${stepMeta.title}`}
      </Subtitle>

      <View style={styles.stepTrack}>
        {WIZARD_STEPS.map((s) => (
          <View
            key={s.step}
            style={[styles.stepDot, s.step <= step && styles.stepDotOn]}
          />
        ))}
      </View>

      <ErrorText>{msg}</ErrorText>

      {step === 1 ? (
        <Card>
          <Label>Descreva a compra (opcional)</Label>
          <TextInput
            value={nlStrategy}
            onChangeText={setNlStrategy}
            placeholder="Ex.: Quero comparar Pix de R$ 8.000 com 10× de R$ 9.000"
            multiline
            numberOfLines={4}
            style={styles.textarea}
            placeholderTextColor={colors.muted}
          />
          <Subtitle>
            Leitura local do texto — sem IA na nuvem. Você pode pular e preencher
            na próxima tela.
          </Subtitle>
          <Button
            title="Interpretar texto"
            onPress={() => {
              if (applyNlText()) goTo(2);
            }}
          />
          <Button title="Pular" variant="ghost" onPress={() => goTo(2)} />
        </Card>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <Label>Valor à vista (R$)</Label>
            <Field
              value={cashPrice}
              onChangeText={setCashPrice}
              keyboardType="decimal-pad"
            />
            <Label>Valor a prazo / total (R$)</Label>
            <Field
              value={financedTotal}
              onChangeText={setFinancedTotal}
              keyboardType="decimal-pad"
            />
            <Label>Máx. parcelas sem juros</Label>
            <Field
              value={maxInstallments}
              onChangeText={setMaxInstallments}
              keyboardType="number-pad"
            />
            <Label>Urgência</Label>
            <View style={styles.chipRow}>
              {URGENCY_OPTIONS.map((u) => (
                <Pressable
                  key={u.value}
                  onPress={() => setUrgency(u.value)}
                  style={[
                    styles.chip,
                    urgency === u.value && styles.chipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      urgency === u.value && styles.chipTextOn,
                    ]}
                  >
                    {u.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card>
            <Subtitle>Estratégias</Subtitle>
            {PURCHASE_MODE_OPTIONS.map((mode) => {
              const on = alternatives.some((a) => a.mode === mode);
              return (
                <Pressable
                  key={mode}
                  onPress={() => toggleStrategyMode(mode, !on)}
                  style={styles.modeRow}
                >
                  <Text style={styles.modeCheck}>{on ? "☑" : "☐"}</Text>
                  <Text style={styles.modeLabel}>
                    {PURCHASE_MODE_LABELS[mode]}
                  </Text>
                </Pressable>
              );
            })}
            <Button
              title="Sugerir estratégias"
              variant="ghost"
              onPress={fillSuggestedStrategies}
            />
          </Card>

          {alternatives.map((alt, index) => {
            const fields = altFields(alt.mode);
            return (
              <Card key={alt.id}>
                <View style={styles.altHeader}>
                  <Subtitle>{`Alternativa ${index + 1}`}</Subtitle>
                  <Button
                    title="Remover"
                    variant="ghost"
                    onPress={() =>
                      setAlternatives((prev) =>
                        prev.filter((a) => a.id !== alt.id),
                      )
                    }
                  />
                </View>
                <Label>Nome amigável</Label>
                <Field
                  value={alt.name}
                  onChangeText={(v) => updateAlt(alt.id, { name: v })}
                  placeholder={PURCHASE_MODE_LABELS[alt.mode]}
                />
                <Label>Estratégia</Label>
                <View style={styles.chipRow}>
                  {PURCHASE_MODE_OPTIONS.map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        const f = altFields(mode);
                        if (f.amountMirrorsMonthly) {
                          const fee =
                            alt.monthlyOutflow.trim() || alt.amount || "0";
                          updateAlt(alt.id, {
                            mode,
                            amount: fee,
                            monthlyOutflow: fee,
                          });
                          return;
                        }
                        updateAlt(alt.id, { mode });
                      }}
                      style={[
                        styles.chip,
                        alt.mode === mode && styles.chipOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          alt.mode === mode && styles.chipTextOn,
                        ]}
                        numberOfLines={1}
                      >
                        {PURCHASE_MODE_LABELS[mode].split("(")[0]?.trim()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {fields.showAmount ? (
                  <>
                    <Label>{amountLabel(alt.mode)}</Label>
                    <Field
                      value={alt.amount}
                      onChangeText={(v) => updateAlt(alt.id, { amount: v })}
                      keyboardType="decimal-pad"
                    />
                  </>
                ) : null}
                <Label>{installmentsLabel(alt.mode)}</Label>
                <Field
                  value={alt.installments}
                  onChangeText={(v) =>
                    updateAlt(alt.id, { installments: v })
                  }
                  keyboardType="number-pad"
                />
                {fields.showRate ? (
                  <>
                    <Label>Taxa a.m. (%)</Label>
                    <Field
                      value={alt.monthlyRatePct}
                      onChangeText={(v) =>
                        updateAlt(alt.id, { monthlyRatePct: v })
                      }
                      keyboardType="decimal-pad"
                      placeholder="Ex.: 1,79"
                    />
                  </>
                ) : null}
                {fields.showMonthly ? (
                  <>
                    <Label>{monthlyLabel(alt.mode)}</Label>
                    <Field
                      value={alt.monthlyOutflow}
                      onChangeText={(v) => {
                        if (fields.amountMirrorsMonthly) {
                          updateAlt(alt.id, {
                            monthlyOutflow: v,
                            amount: v,
                          });
                          return;
                        }
                        updateAlt(alt.id, { monthlyOutflow: v });
                      }}
                      keyboardType="decimal-pad"
                    />
                  </>
                ) : null}
                {fields.showResidual ? (
                  <>
                    <Label>Residual / opção de compra</Label>
                    <Field
                      value={alt.residualAmount}
                      onChangeText={(v) =>
                        updateAlt(alt.id, { residualAmount: v })
                      }
                      keyboardType="decimal-pad"
                    />
                  </>
                ) : null}
              </Card>
            );
          })}

          <Button
            title="Adicionar alternativa"
            variant="ghost"
            disabled={alternatives.length >= MAX_PURCHASE_ALTERNATIVES}
            onPress={() => {
              if (alternatives.length >= MAX_PURCHASE_ALTERNATIVES) return;
              setAlternatives((prev) => [
                ...prev,
                newAlt({
                  mode: "installments_markup",
                  amount: financedTotal || "10000",
                  installments: maxInstallments || "12",
                }),
              ]);
            }}
          />

          <View style={styles.navRow}>
            <Button title="Voltar" variant="ghost" onPress={goBack} />
            <Button
              title="Continuar"
              onPress={() => {
                if (alternatives.length < 1) {
                  setMsg("Marque ou sugira ao menos uma estratégia.");
                  return;
                }
                goTo(3);
              }}
            />
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card>
            <Subtitle>Origem (aplicação ou conta)</Subtitle>
            {fundingSources.length === 0 ? (
              <Subtitle>
                Nenhuma aplicação/conta com saldo. Cadastre em Aplicações ou
                Contas.
              </Subtitle>
            ) : (
              fundingSources.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => applySource(s)}
                  style={[
                    styles.sourceRow,
                    sourceKey === s.key && styles.sourceRowOn,
                  ]}
                >
                  <Text style={styles.sourceName}>{s.name}</Text>
                  <Text style={styles.sourceMeta}>
                    {`${s.group} · ${formatBrl(s.balance)}`}
                  </Text>
                </Pressable>
              ))
            )}
            {selectedSource && sourceHint ? (
              <Subtitle>{sourceHint}</Subtitle>
            ) : null}
          </Card>
          <Card>
            <Label>% do CDI</Label>
            <Field
              value={pctOfCdi}
              onChangeText={setPctOfCdi}
              keyboardType="decimal-pad"
            />
            <Label>CDI a.a. (%)</Label>
            <Field
              value={cdiAnnualPct}
              onChangeText={setCdiAnnualPct}
              keyboardType="decimal-pad"
            />
            <Label>IR efetivo (%)</Label>
            <Field
              value={irPct}
              onChangeText={setIrPct}
              keyboardType="decimal-pad"
            />
            <Label>Poupança mensal estimada</Label>
            <Field
              value={monthlySavings}
              onChangeText={setMonthlySavings}
              keyboardType="decimal-pad"
            />
          </Card>
          <View style={styles.navRow}>
            <Button title="Voltar" variant="ghost" onPress={goBack} />
            <Button
              title="Continuar"
              onPress={() => {
                if (!sourceKey) {
                  setMsg("Selecione a origem do dinheiro.");
                  return;
                }
                goTo(4);
              }}
            />
          </View>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <Card>
            <Subtitle>Intenção</Subtitle>
            <Subtitle>
              {`À vista ${formatBrl(parseMoneyInput(cashPrice))} · a prazo ${formatBrl(parseMoneyInput(financedTotal))} · até ${maxInstallments}× · urgência ${urgency}`}
            </Subtitle>
            {nlStrategy.trim() ? (
              <Subtitle>{`“${nlStrategy.trim()}”`}</Subtitle>
            ) : null}
          </Card>
          <Card>
            <Subtitle>{`Estratégias (${alternatives.length})`}</Subtitle>
            {alternatives.map((a) => (
              <ListRow
                key={a.id}
                title={altDisplayName(a)}
                subtitle={PURCHASE_MODE_LABELS[a.mode]}
              />
            ))}
          </Card>
          <Card>
            <Subtitle>Aplicação</Subtitle>
            <Subtitle>
              {selectedSource
                ? `${selectedSource.name} · saldo ${formatBrl(selectedSource.balance)} · ${pctOfCdi}% CDI · IR ${irPct}%`
                : "—"}
            </Subtitle>
          </Card>
          <View style={styles.navRow}>
            <Button title="Voltar" variant="ghost" onPress={goBack} />
            <Button
              title="Gerar análise"
              onPress={() => {
                if (runSimulation()) goTo(5);
              }}
            />
          </View>
        </>
      ) : null}

      {step === 5 && result ? (
        <>
          <Card>
            <Subtitle>{result.verdictTitle}</Subtitle>
            <Subtitle>{result.recommendedAction}</Subtitle>
          </Card>
          <Card>
            <Subtitle>Ranking</Subtitle>
            {result.ranking.map((r, i) => (
              <ListRow
                key={r.id}
                title={`${i + 1}. ${r.name}`}
                subtitle={
                  r.feasible
                    ? `Score ${formatBrl(r.scoreWealth)}${
                        r.gapToBest > 0
                          ? ` · −${formatBrl(r.gapToBest)} vs melhor`
                          : ""
                      }`
                    : "Inviável com saldo/crédito atual"
                }
                right={formatBrl(r.finalInvestment)}
              />
            ))}
          </Card>
          {result.liquidityAlerts.length > 0 ? (
            <Card>
              <Subtitle>Alertas de liquidez</Subtitle>
              {result.liquidityAlerts.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.title}
                  subtitle={a.message}
                />
              ))}
            </Card>
          ) : null}
          <Card>
            <Subtitle>Detalhe por estratégia</Subtitle>
            {result.alternatives.map((a) => (
              <ListRow
                key={a.id}
                title={a.name}
                subtitle={`${PURCHASE_MODE_LABELS[a.mode]} · ${a.installments}× ${formatBrl(a.monthlyOutflow)}${
                  a.feasible ? "" : ` · ${a.infeasibleReason ?? "Inviável"}`
                }`}
                right={formatBrl(a.finalInvestment)}
              />
            ))}
          </Card>
          <View style={styles.navRow}>
            <Button title="Voltar" variant="ghost" onPress={goBack} />
            <Button
              title="Nova simulação"
              variant="ghost"
              onPress={() => {
                setResult(null);
                goTo(1);
              }}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepTrack: {
    flexDirection: "row",
    gap: 6,
  },
  stepDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stepDotOn: { backgroundColor: colors.accent },
  textarea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    color: colors.fg,
    fontFamily: fonts.sans,
    fontSize: 15,
    textAlignVertical: "top",
    backgroundColor: colors.input,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  chipOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  chipTextOn: { color: colors.fg, fontFamily: fonts.sansBold },
  modeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modeCheck: { fontSize: 16, color: colors.fg },
  modeLabel: {
    flex: 1,
    color: colors.fg,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  altHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sourceRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 2,
  },
  sourceRowOn: {
    backgroundColor: colors.accentSoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  sourceName: {
    color: colors.fg,
    fontFamily: fonts.sansBold,
    fontSize: 15,
  },
  sourceMeta: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
});
