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
import { buildQueryContext, QueryFormData } from '@superset-ui/core';

/**
 * buildQuery for realtime line chart.
 *
 * On each refresh cycle, the component writes `last_fetched_at` into
 * formData via extra_form_data before triggering a re-fetch. This function
 * reads that value and injects a `WHERE time_col > last_fetched_at` filter
 * so only NEW rows are returned.
 *
 * On the very first load, no `last_fetched_at` is present, so the normal
 * `time_range` from the control panel is used (e.g. "Last hour").
 */
export default function buildQuery(formData: QueryFormData) {
  const { time_column, last_fetched_at } = formData;

  return buildQueryContext(formData, baseQueryObject => {
    const incrementalFilter =
      last_fetched_at && time_column
        ? [
            {
              col: time_column as string,
              op: '>' as const,
              val: last_fetched_at as string,
            },
          ]
        : [];

    return [
      {
        ...baseQueryObject,
        is_timeseries: true,
        filters: [...(baseQueryObject.filters ?? []), ...incrementalFilter],
        orderby: [[time_column ?? '__time', true]] as [string, boolean][],
      },
    ];
  });
}
