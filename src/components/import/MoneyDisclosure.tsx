"use client";

import { Info, Prohibit, Receipt } from "@phosphor-icons/react";
import { IMPORT_MONEY_DISCLOSURE, type DryRunReport, type ImportEvidenceClass } from "@/domain/migration";
import { formatCount, formatMoneyMinor } from "@/lib/format";

/** The sentence that goes under each evidence class, so a label never stands alone. */
const MEANING: Record<ImportEvidenceClass, string> = {
  imported_record: "What the old system recorded. No processor confirmed it.",
  externally_recorded: IMPORT_MONEY_DISCLOSURE.externallyRecorded,
  manually_marked_paid: IMPORT_MONEY_DISCLOSURE.manuallyMarkedPaid,
};

export interface MoneyDisclosureProps {
  report: DryRunReport;
}

/**
 * What an import did and did not do to the money figures, in words.
 *
 * Rule this enforces: an imported money figure is never shown without this
 * block. Every line carries an icon and a text label, never colour alone, and
 * the one number that matters most is the zero at the bottom.
 */
export function MoneyDisclosure({ report }: MoneyDisclosureProps) {
  const { money, payments, contractedValue } = report;
  const currency = money.currency;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex gap-2 text-[13px] leading-snug text-fg-muted">
        <Info size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
        <span>
          <span className="block font-medium text-fg">Recorded, not collected</span>
          {money.statement}
        </span>
      </p>

      {payments.count > 0 ? (
        <section>
          <h3 className="text-[12px] font-medium text-fg-subtle">Payments the old system recorded</h3>
          <dl className="mt-2 divide-y divide-line border-t border-line">
            {money.byEvidence.map((b) => (
              <Line key={b.evidence} k={b.label} v={formatMoneyMinor(b.totalMinor, currency)} sub={`${formatCount(b.count)} ${b.count === 1 ? "record" : "records"}. ${MEANING[b.evidence]}`} />
            ))}
          </dl>
        </section>
      ) : null}

      {contractedValue.count > 0 ? (
        <section>
          <h3 className="flex items-center gap-1.5 text-[12px] font-medium text-fg-subtle">
            <Receipt size={13} weight="regular" aria-hidden />
            Contracted value
          </h3>
          <dl className="mt-2 divide-y divide-line border-t border-line">
            <Line k="Won deals" v={formatMoneyMinor(contractedValue.totalMinor, currency)} sub={`${formatCount(contractedValue.count)} ${contractedValue.count === 1 ? "deal" : "deals"}. ${IMPORT_MONEY_DISCLOSURE.contractedValue}`} />
          </dl>
        </section>
      ) : null}

      <section>
        <h3 className="text-[12px] font-medium text-fg-subtle">{IMPORT_MONEY_DISCLOSURE.title}</h3>
        <dl className="mt-2 divide-y divide-line border-t border-line">
          <Line
            k={
              <span className="flex items-center gap-1.5">
                <Prohibit size={13} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                Net collected cash
              </span>
            }
            v={formatMoneyMinor(money.netCollectedCashMinor, currency)}
            sub="Nothing imported counts toward net collected cash, commission, or the team race. Connect a payment processor to record collected cash."
          />
          {money.notRecorded > 0 ? <Line k="Not recorded" v={formatCount(money.notRecorded)} sub="Amounts we could not classify without guessing. Listed under Check." /> : null}
        </dl>
      </section>
    </div>
  );
}

function Line({ k, v, sub }: { k: React.ReactNode; v: string; sub: string }) {
  return (
    <div className="py-2.5 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-fg">{k}</dt>
        <dd className="tabular shrink-0 text-right text-fg">{v}</dd>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-fg-muted">{sub}</p>
    </div>
  );
}
