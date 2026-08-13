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
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { SupersetClient } from '@superset-ui/core';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

interface RealtimeLineProps {
  echartOptions: echarts.EChartsOption;
  formData: Record<string, unknown>;
  queriesData: unknown[];
  width: number;
  height: number;
}

export default function RealtimeLine({
  echartOptions,
  formData,
  width,
  height,
}: RealtimeLineProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>();
  const lastFetchedAt = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const {
    refresh_interval_ms = 5000,
    max_points = 500,
    time_column,
    datasource,
    metric,
    groupby = [],
  } = formData;

  // Initialise the chart once on mount with the initial full dataset
  useEffect(() => {
    if (!divRef.current) return;
    chartRef.current = echarts.init(divRef.current);
    chartRef.current.setOption(echartOptions);

    // Record the timestamp of the latest point already rendered
    const seriesData = (echartOptions as { series?: { data?: [string, number][] }[] })
      ?.series?.[0]?.data ?? [];
    if (seriesData.length > 0) {
      const timestamps = seriesData.map(([ts]) => new Date(ts).getTime());
      lastFetchedAt.current = new Date(Math.max(...timestamps)).toISOString();
    } else {
      lastFetchedAt.current = new Date().toISOString();
    }

    return () => chartRef.current?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize when dimensions change
  useEffect(() => {
    chartRef.current?.resize({ width, height });
  }, [width, height]);

  /**
   * fetchNewData — POST /api/v1/chart/data with a time filter
   * so only rows newer than lastFetchedAt are returned.
   */
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
                {
                  col: time_column,
                  op: '>',
                  val: lastFetchedAt.current,
                },
              ],
              metrics: [metric],
              columns: groupby,
              orderby: [[time_column, true]],
              row_limit: 1000,
              is_timeseries: true,
            },
          ],
        },
      });

      const newRows: Record<string, unknown>[] =
        (response.json as { result?: { data?: Record<string, unknown>[] }[] })
          ?.result?.[0]?.data ?? [];

      if (newRows.length === 0) return;

      // Advance the cursor to the latest timestamp in this batch
      const maxTs = Math.max(
        ...newRows.map(r =>
          new Date(
            String(r['__timestamp'] ?? r[String(time_column)]),
          ).getTime(),
        ),
      );
      lastFetchedAt.current = new Date(maxTs).toISOString();

      const chart = chartRef.current;
      if (!chart) return;
      const currentOption = chart.getOption() as {
        series: { name: string; data: [string, number][] }[];
      };

      const updatedSeries = currentOption.series.map(series => {
        const newPoints: [string, number][] = newRows
          .filter(row => {
            if (!(groupby as string[]).length) return true;
            const rowName = (groupby as string[])
              .map(c => row[c])
              .join(', ');
            return rowName === series.name;
          })
          .map(row => [
            String(row['__timestamp'] ?? row[String(time_column)]),
            Number(row[String(metric)]),
          ]);

        const combined = [...(series.data ?? []), ...newPoints];
        const trimmed =
          combined.length > Number(max_points)
            ? combined.slice(combined.length - Number(max_points))
            : combined;

        return { ...series, data: trimmed };
      });

      // Incremental merge — ECharts animates only the new segment
      chart.setOption({ series: updatedSeries }, { notMerge: false });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[RealtimeLine] fetch error', err);
    }
  }, [formData, time_column, datasource, max_points, metric, groupby]);

  // Start / restart the polling interval when refresh_interval_ms changes
  useEffect(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchNewData, Number(refresh_interval_ms));
    return () => clearInterval(intervalRef.current);
  }, [fetchNewData, refresh_interval_ms]);

  return <div ref={divRef} style={{ width: Number(width), height: Number(height) }} />;
}
