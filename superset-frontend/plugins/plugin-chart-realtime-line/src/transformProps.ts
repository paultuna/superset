/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { ChartProps } from '@superset-ui/core';

export interface RealtimeLineChartProps {
  echartOptions: any;
  width: number;
  height: number;
  formData: Record<string, any>;
  queriesData: any[];
}

function buildSeriesKey(
  groupbyValues: string[],
  metricName: string,
  hasMultipleMetrics: boolean,
): string {
  const groupPart = groupbyValues.length > 0 ? groupbyValues.join(', ') : null;
  if (groupPart && hasMultipleMetrics) return `${groupPart} \u2013 ${metricName}`;
  if (groupPart) return groupPart;
  return metricName;
}

export default function transformProps(
  chartProps: ChartProps,
): RealtimeLineChartProps {
  const { queriesData, formData, width, height } = chartProps;
  const {
    smooth = true,
    show_legend = true,
    metrics = [],
    metric,
    groupby = [],
    time_column,
    time_window_ms = 300_000,
  } = formData;

  // Normalise metrics to an array
  const metricList: string[] = (
    metrics.length > 0 ? metrics : metric ? [metric] : []
  ).map((m: any) =>
    typeof m === 'string' ? m : m?.label ?? m?.expressionType ?? String(m),
  );

  const data: Record<string, any>[] = queriesData[0]?.data ?? [];
  const hasMultipleMetrics = metricList.length > 1;

  // Build series map: seriesKey → [timestamp, value][]
  const seriesMap = new Map<string, [string, number][]>();

  data.forEach(row => {
    const groupbyValues: string[] = (groupby as string[]).map(col =>
      String(row[col] ?? ''),
    );
    metricList.forEach(metricName => {
      const key = buildSeriesKey(groupbyValues, metricName, hasMultipleMetrics);
      if (!seriesMap.has(key)) seriesMap.set(key, []);
      const ts = row['__timestamp'] ?? row[time_column];
      const val = row[metricName];
      if (ts !== undefined && val !== undefined) {
        seriesMap.get(key)!.push([ts, Number(val)]);
      }
    });
  });

  const series = Array.from(seriesMap.entries()).map(([name, points]) => ({
    name,
    type: 'line',
    smooth,
    data: points,
    animation: false,
    showSymbol: false,
  }));

  // Compute initial time window bounds from data (or now-window if no data)
  const now = Date.now();
  const allTimestamps = series.flatMap(s =>
    s.data.map(([t]) => new Date(t).getTime()),
  );
  const maxTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : now;
  const minTs = maxTs - time_window_ms;

  const echartOptions = {
    animation: false,
    grid: { top: 36, bottom: 52, left: 64, right: 24, containLabel: true },
    xAxis: {
      type: 'time',
      min: minTs,
      max: maxTs,
      axisLabel: {
        formatter: (val: number) => new Date(val).toLocaleTimeString(),
      },
    },
    yAxis: { type: 'value', scale: true },
    legend: { show: show_legend, type: 'scroll', bottom: 0 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        startValue: minTs,
        endValue: maxTs,
        zoomLock: true,
        moveOnMouseMove: false,
      },
    ],
    series,
  };

  return {
    echartOptions,
    width,
    height,
    formData: { ...formData, time_window_ms },
    queriesData,
  };
}
