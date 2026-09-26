import { useId } from "react";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { WEIGHT_GROUPS } from "./rd2Standards.mjs";

/**
 * Categorical hues for the KPI / OKR / IDP identity, in fixed order.
 * Keep these category colors stable; the chart directly labels each segment,
 * so category identity is not conveyed by color alone.
 */
const CATEGORY_COLORS = {
  KPI: "var(--rd2-kpi, #c99b5e)",
  OKR: "var(--rd2-okr, #6da48a)",
  IDP: "var(--rd2-idp, #9eaba3)",
} as const;

const CATEGORY_ORDER = ["KPI", "OKR", "IDP"] as const;

/** Panel surface - doubles as the 2px spacer stroke between stacked fills. */
const SURFACE = "var(--rd2-panel, #1a191e)";


interface WeightRow {
  level: string;
  full: string;
  KPI: number;
  OKR: number;
  IDP: number;
}

function WeightTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: WeightRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rd2-chart-tooltip">
      <strong>{row.full}</strong>
      <ul>
        {CATEGORY_ORDER.map((key) => (
          <li key={key}>
            <span
              className="rd2-chart-swatch"
              style={{ background: CATEGORY_COLORS[key] }}
              aria-hidden="true"
            />
            <span>{key}</span>
            <b>{row[key]}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Composition of each level's appraisal weighting. A 100% stacked bar is the
 * right form here: the three parts always sum to 100, and the reader needs to
 * compare that split across levels.
 */
export function WeightDistributionChart() {
  const titleId = useId();
  const data: WeightRow[] = WEIGHT_GROUPS.map((weights) => {
    return {
      level: weights.label,
      full: weights.label,
      KPI: weights.KPI,
      OKR: weights.OKR,
      IDP: weights.IDP,
    };
  });

  return (
    <figure className="rd2-chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="rd2-chart-caption">
        <span>各數字職等評核權重組成</span>
        <ul className="rd2-chart-legend">
          {CATEGORY_ORDER.map((key) => (
            <li key={key}>
              <span
                className="rd2-chart-swatch"
                style={{ background: CATEGORY_COLORS[key] }}
                aria-hidden="true"
              />
              {key}
            </li>
          ))}
        </ul>
      </figcaption>
      <div className="rd2-chart-body">
        <ResponsiveContainer width="100%" height={196}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
            barCategoryGap="26%"
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="level"
              width={104}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#c2c4c1", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
              content={<WeightTooltip />}
            />
            {CATEGORY_ORDER.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="weight"
                fill={CATEGORY_COLORS[key]}
                stroke={SURFACE}
                strokeWidth={1}
                radius={
                  index === 0
                    ? [4, 0, 0, 4]
                    : index === CATEGORY_ORDER.length - 1
                      ? [0, 4, 4, 0]
                      : 0
                }
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={key}
                  position="center"
                  formatter={(value: number) => (value >= 15 ? `${value}%` : "")}
                  fill="#f2f2ef"
                  fontSize={12}
                  fontWeight={700}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "#a9b4aa" },
  "in-progress": { label: "填寫中", color: "#61cbbb" },
  submitted: { label: "待主管評分", color: "#c99b5e" },
  approved: { label: "已完成", color: "#6da48a" },
};

interface StatusRow {
  key: string;
  label: string;
  value: number;
}

/**
 * Composition by workflow state. The four counts always sum to the cohort, so
 * a single 100% stacked bar says it in one compact strip instead of four
 * separate rows. State uses the reserved status palette, and every visible
 * segment is labelled, so state never rides on colour alone.
 */
export function StatusBreakdownChart({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const titleId = useId();
  const data = Object.keys(STATUS_STYLE).map((key) => ({
    key,
    label: STATUS_STYLE[key].label,
    value: counts[key] ?? 0,
  }));
  const total = data.reduce((sum, row) => sum + row.value, 0);

  return (
    <figure className="rd2-chart rd2-status-chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="rd2-chart-caption">
        <span>考核狀態分佈</span>
        {total ? <span className="rd2-chart-total">共 {total} 筆</span> : null}
      </figcaption>
      {total ? (
        <>
          <div className="rd2-status-bar" role="img"
            aria-label={data.filter((d) => d.value).map((d) => `${d.label} ${d.value} 筆`).join("、")}
          >
            {data
              .filter((row) => row.value)
              .map((row) => (
                <span
                  key={row.key}
                  className="rd2-status-seg"
                  style={{
                    flexGrow: row.value,
                    background: STATUS_STYLE[row.key].color,
                  }}
                  title={`${row.label} ${row.value} 筆`}
                >
                  {row.value}
                </span>
              ))}
          </div>
          <ul className="rd2-chart-legend rd2-status-legend">
            {data.map((row) => (
              <li key={row.key} data-empty={row.value ? undefined : "true"}>
                <span
                  className="rd2-chart-swatch"
                  style={{ background: STATUS_STYLE[row.key].color }}
                  aria-hidden="true"
                />
                {row.label}
                <b>{row.value}</b>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rd2-hint">本期尚無考核紀錄。</p>
      )}
    </figure>
  );
}

/** A single headline number is a stat tile, not a chart. */
export function StatTile({
  label,
  value,
  suffix,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  tone?: "default" | "good" | "warning" | "info" | "score" | "progress";
}) {
  return (
    <div className="rd2-stat-tile" data-tone={tone}>
      <span className="rd2-stat-label">{label}</span>
      <strong className="rd2-stat-value">
        {value}
        {suffix ? <small>{suffix}</small> : null}
      </strong>
      {hint ? <span className="rd2-stat-hint">{hint}</span> : null}
    </div>
  );
}
