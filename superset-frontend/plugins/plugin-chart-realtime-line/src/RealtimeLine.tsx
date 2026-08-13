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
import React, { useEffect, useRef, useCallback } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { SupersetClient } from '@superset-ui/core';
import { RealtimeLineChartProps } from './transformProps';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

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

export default function RealtimeLine({
  echartOptions,
  formData,
  width,
  height,
}: RealtimeLineChartProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>();
  const lastFetchedAt = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const {
    refresh_interval_ms = 5000,
    max_points = 500,
    time_window_ms = 300_000,
    time_column,
    datasource,
    metrics = [],
    metric,
    groupby = [],
  } = formData;

  const metricList: string[] = (
    metrics.length > 0 ? metrics : metric ? [metric] : []
  ).map((m: any) =>
    typeof m === 'string' ? m : m?.label ?? String(m),
  );

  const hasMultipleMetrics = metricList.length > 1;

  // Mount: initialise chart and set lastFetchedAt cursor
  useEffect(() => {
    if (!divRef.current) return;
    chartRef.current = echarts.init(divRef.current);
    chartRef.current.setOption(echartOptions);

    const existingData: [string, number][] =
      (echartOptions as any)?.series?.[0]?.data ?? [];
    if (existingData.length > 0) {
      const timestamps = existingData.map(([t]) => new Date(t).getTime());
      lastFetchedAt.current = new Date(Math.max(...timestamps)).toISOString();
    } else {
      lastFetchedAt.current = new Date().toISOString();
    }

    return () => chartRef.current?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize
  useEffect(() => {
    chartRef.current?.resize({ width, height });
  }, [width, height]);

  const fetchNewData = useCallback(async () => {
    if (!lastFetchedAt.current || !datasource) return;
    const [datasource_id, datasource_type] = String(datasource).split('__');

    try {
      const response = await SupersetClient.post({
        endpoint: '/api/v1/chart/data',
        jsonPayload: {
          datasource: {
            id: Number(datasource_id),
            type: datasource_type ?? 'table',
          },
          queries: [
            {
              time_column,
              filters: [
                { col: time_column, op: '>', val: lastFetchedAt.current },
              ],
              metrics: metricList,
              columns: groupby,
              orderby: [[time_column, true]],
              row_limit: 1000,
              is_timeseries: true,
            },
          ],
        },
      });

      const newRows: Record<string, any>[] =
        (response.json as any)?.result?.[0]?.data ?? [];
      if (newRows.length === 0) return;

      // Advance the cursor
      const maxNewTs = Math.max(
        ...newRows.map(r =>
          new Date(r['__timestamp'] ?? r[time_column]).getTime(),
        ),
      );
      lastFetchedAt.current = new Date(maxNewTs).toISOString();

      const chart = chartRef.current;
      if (!chart) return;
      const currentOption = chart.getOption() as any;

      // Append new points to matching series, trim to max_points
      const updatedSeries = (currentOption.series as any[]).map(series => {
        const newPoints: [string, number][] = [];
        newRows.forEach(row => {
          const groupbyValues: string[] = (groupby as string[]).map(col =>
            String(row[col] ?? ''),
          );
          metricList.forEach(metricName => {
            const key = buildSeriesKey(
              groupbyValues,
              metricName,
              hasMultipleMetrics,
            );
            if (key !== series.name) return;
            const ts = row['__timestamp'] ?? row[time_column];
            const val = row[metricName];
            if (ts !== undefined && val !== undefined) {
              newPoints.push([ts, Number(val)]);
            }
          });
        });

        const combined = [...(series.data ?? []), ...newPoints];
        const trimmed =
          combined.length > max_points
            ? combined.slice(combined.length - max_points)
            : combined;
        return { ...series, data: trimmed };
      });

      // Slide the X-axis window to follow the latest timestamp
      const windowEnd = maxNewTs;
      const windowStart = windowEnd - time_window_ms;

      chart.setOption(
        {
          series: updatedSeries,
          xAxis: { min: windowStart, max: windowEnd },
          dataZoom: [{ startValue: windowStart, endValue: windowEnd }],
        },
        { notMerge: false },
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[RealtimeLine] fetch error', err);
    }
  }, [
    formData,
    time_column,
    datasource,
    max_points,
    time_window_ms,
    metricList,
    groupby,
    hasMultipleMetrics,
  ]);

  // Polling
  useEffect(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchNewData, refresh_interval_ms);
    return () => clearInterval(intervalRef.current);
  }, [fetchNewData, refresh_interval_ms]);

  return <div ref={divRef} style={{ width, height }} />;
}
