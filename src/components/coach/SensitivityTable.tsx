"use client";

import { formatCount, formatMoney, formatPercent } from "@/lib/format";
import { SENSITIVITY_BASE, workedSensitivity } from "@/lib/team-data";

/** SOS-16 worked base at 55/60/65%. Sensitivity cases, not confidence intervals. */
export function SensitivityTable() {
  const rows = workedSensitivity();
  return (
    <section aria-label="Sensitivity">
      <div className="mb-2 flex items-center justify-between text-[12px] text-fg-subtle">
        <span className="tabular">
          {SENSITIVITY_BASE.eligible} retained, {formatPercent(SENSITIVITY_BASE.currentRate, { digits: 0 })} now, {formatPercent(SENSITIVITY_BASE.downstreamRate, { digits: 0 })} downstream,{" "}
          {formatMoney(SENSITIVITY_BASE.avgNetCollected)} per win
        </span>
      </div>
      <div className="surface overflow-hidden">
        <table className="tabular w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11.5px] font-medium text-fg-subtle">
              <th className="px-4 py-2.5 font-medium">Show rate</th>
              <th className="px-3 py-2.5 text-right font-medium">Shows</th>
              <th className="px-3 py-2.5 text-right font-medium">Cash</th>
              <th className="px-4 py-2.5 text-right font-medium">Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ targetRate, scenario }) => (
              <tr key={targetRate}>
                <td className="px-4 py-2.5 font-medium text-fg">{formatPercent(targetRate, { digits: 0 })}</td>
                <td className="px-3 py-2.5 text-right text-fg">+{formatCount(scenario.additionalUnits)}</td>
                <td className="px-3 py-2.5 text-right text-fg">{formatMoney(scenario.modeledCash)}</td>
                <td className="px-4 py-2.5 text-right text-fg">{scenario.modeledCommission ? formatMoney(scenario.modeledCommission) : "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-subtle">
        <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 font-medium text-fg-muted">Hypothetical 5%</span>
        <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 font-medium text-fg-muted">Not a forecast</span>
        <span>Sensitivity cases, not confidence intervals</span>
      </div>
    </section>
  );
}
