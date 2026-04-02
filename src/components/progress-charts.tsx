"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatDateShort } from "@/lib/utils";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
} from "@heroicons/react/24/solid";

interface ChartEntry {
  date: string;
  weight: number;
}

interface LiftData {
  name: string;
  data: ChartEntry[];
}

interface WorkingWeightEntry {
  exerciseName: string;
  currentWeight: number;
  previousWeight: number | null;
  lastUsed: string;
  trend: "up" | "same" | "down";
}

interface ProgressChartsProps {
  lifts: LiftData[];
  workingWeights: WorkingWeightEntry[];
}

function TrendIcon({ trend }: { trend: "up" | "same" | "down" }) {
  if (trend === "up")
    return <ArrowUpIcon className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === "down")
    return <ArrowDownIcon className="w-3.5 h-3.5 text-red-400" />;
  return <MinusIcon className="w-3.5 h-3.5 text-stone-500" />;
}

export default function ProgressCharts({
  lifts,
  workingWeights,
}: ProgressChartsProps) {
  return (
    <div className="space-y-8">
      {/* Working Weights */}
      {workingWeights.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
            Working Weights
          </h3>
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-4 py-2">
                    Exercise
                  </th>
                  <th className="text-right text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-4 py-2">
                    Weight
                  </th>
                  <th className="text-right text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-4 py-2 w-10">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {workingWeights.map((ww) => (
                  <tr
                    key={ww.exerciseName}
                    className="border-b border-stone-800/40 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-stone-300">
                      {ww.exerciseName}
                      <span className="text-[10px] text-stone-600 block">
                        {formatDateShort(ww.lastUsed)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-stone-100">
                      {ww.currentWeight}kg
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <TrendIcon trend={ww.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      {(() => {
        const chartsWithData = lifts.filter((l) => l.data.length > 1);
        if (chartsWithData.length === 0) return null;
        return (
        <div>
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
            Strength Over Time
          </h3>
          <div className="space-y-6">
            {chartsWithData.map((lift) => (
                <div key={lift.name} className="card">
                  <p className="text-sm font-semibold text-stone-200 mb-3">
                    {lift.name}
                  </p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lift.data}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#292524"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDateShort}
                          stroke="#57534e"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#57534e"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={35}
                          domain={["dataMin - 5", "dataMax + 5"]}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#1c1917",
                            border: "1px solid #292524",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "#fafaf9",
                          }}
                          labelFormatter={(label) => formatDateShort(String(label))}
                          formatter={(value) => [
                            `${value}kg`,
                            "Weight",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="weight"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "#f59e0b" }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
          </div>
        </div>
        );
      })()}

      {lifts.every((l) => l.data.length <= 1) &&
        workingWeights.length === 0 && (
          <div className="text-center py-16">
            <p className="text-stone-500 text-sm">
              No progress data yet.
            </p>
            <p className="text-stone-600 text-xs mt-1">
              Log a few sessions to see charts here.
            </p>
          </div>
        )}
    </div>
  );
}
