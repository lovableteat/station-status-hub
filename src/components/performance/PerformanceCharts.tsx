import { useId } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LEVELS, getLevelWeights } from "./rd2Assessment.mjs";

/**
 * Categorical hues for the KPI / OKR / IDP identity, in fixed order.
 * Validated against the #081C2D panel surface with the dataviz six-checks
 * (lightness band, chroma, CVD separation, normal-vision floor, contrast):
 * all pass. Do not cycle or re-order these - colour follows the category,
 * never its rank. Every segment is also directly labelled, so identity is
 * never carried by colour alone.
 */
const CATEGORY_COLORS = {
  KPI: "#4085F5",
  OKR: "#1AA167",
  IDP: "#7D5AE8",
} as const;

const CATEGORY_ORDER = ["KPI", "OKR", "IDP"] as const;

/** Panel surface - doubles as the 2px spacer stroke between stacked fills. */
const SURFACE = "#081c2d";

const shortLevelLabel = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, "");

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
  const data: WeightRow[] = LEVELS.map((level) => {
    const weights = getLevelWeights(level.value);
    return {
      level: shortLevelLabel(level.label),
      full: level.label,
      KPI: weights.KPI,
      OKR: weights.OKR,
      IDP: weights.IDP,
    };
  });

  return (
    <figure className="rd2-chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="rd2-chart-caption">
        <span>各職級評核權重組成</span>
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
              tick={{ fill: "#9fb4c9", fontSize: 12 }}
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
                  fill="#f2f4f8"
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
  draft: { label: "草稿", color: "#64748b" },
  "in-progress": { label: "填寫中", color: "#4085F5" },
  submitted: { label: "待主管評分", color: "#FBBD23" },
  approved: { label: "已完成", color: "#1AA167" },
};

interface StatusRow {
  key: string;
  label: string;
  value: number;
}

/**
 * Counts by workflow state. State is a reserved status palette, never the
 * categorical hues - and each bar is labelled, so the state never rides on
 * colour alone.
 */
export function StatusBreakdownChart({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const titleId = useId();
  const data: StatusRow[] = Object.keys(STATUS_STYLE).map((key) => ({
    key,
    label: STATUS_STYLE[key].label,
    value: counts[key] ?? 0,
  }));
  const total = data.reduce((sum, row) => sum + row.value, 0);

  if (!total) {
    return (
      <figure className="rd2-chart" aria-labelledby={titleId}>
        <figcaption id={titleId} className="rd2-chart-caption">
          <span>考核狀態分佈</span>
        </figcaption>
        <p className="rd2-hint">本期尚無考核紀錄。</p>
      </figure>
    );
  }

  return (
    <figure className="rd2-chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="rd2-chart-caption">
        <span>考核狀態分佈</span>
        <span className="rd2-chart-total">共 {total} 筆</span>
      </figcaption>
      <div className="rd2-chart-body">
        <ResponsiveContainer width="100%" height={168}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 28, bottom: 4, left: 8 }}
            barCategoryGap="24%"
          >
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={96}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#9fb4c9", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
              formatter={(value: number) => [`${value} 筆`, "數量"]}
              contentStyle={{
                background: "#0b2438",
                border: "1px solid rgb(74 124 158 / 0.6)",
                borderRadius: 10,
                color: "#f2f4f8",
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((row) => (
                <Cell key={row.key} fill={STATUS_STYLE[row.key].color} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                fill="#cfe0ee"
                fontSize={12}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
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
  tone?: "default" | "good" | "warning";
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
