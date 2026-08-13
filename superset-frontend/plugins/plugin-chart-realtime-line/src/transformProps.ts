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

/**
 * Converts the Superset query response into ECharts options.
 * On first load this produces a full chart; on incremental refreshes,
 * the component merges new series data via setOption (notMerge: false).
 */
export default function transformProps(chartProps: ChartProps) {
  const { queriesData, formData, width, height } = chartProps;
  const {
    smooth = true,
    show_legend = true,
    metric,
    groupby = [],
    time_column,
  } = formData;
  const data: Record<string, unknown>[] = queriesData[0]?.data ?? [];

  const seriesMap: Record<string, [string, number][]> = {};
  data.forEach(row => {
    const seriesName =
      (groupby as string[]).length > 0
        ? (groupby as string[]).map(col => row[col]).join(', ')
        : String(metric ?? 'value');
    if (!seriesMap[seriesName]) seriesMap[seriesName] = [];
    seriesMap[seriesName].push([
      String(row['__timestamp'] ?? row[time_column as string]),
      Number(row[String(metric)]),
    ]);
  });

  const series = Object.entries(seriesMap).map(([name, points]) => ({
    name,
    type: 'line',
    smooth,
    data: points,
    animation: false,
  }));

  const echartOptions = {
    grid: { top: 30, bottom: 50, left: 60, right: 20 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value' },
    legend: { show: show_legend },
    tooltip: { trigger: 'axis' },
    series,
  };

  return { echartOptions, width, height, formData, queriesData };
}
