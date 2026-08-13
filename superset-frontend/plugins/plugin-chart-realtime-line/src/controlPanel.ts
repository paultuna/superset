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
import { t } from '@superset-ui/core';
import { ControlPanelConfig, sections } from '@superset-ui/chart-controls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    sections.legacyTimeseriesTime,
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'time_column',
            config: {
              type: 'SelectControl',
              label: t('Time Column'),
              description: t(
                'The datetime column used to filter for new rows on each refresh.',
              ),
              mapStateToProps: (state: { datasource?: { columns: { is_dttm: boolean; column_name: string }[] } }) => ({
                choices:
                  state.datasource?.columns
                    .filter(c => c.is_dttm)
                    .map(c => [c.column_name, c.column_name]) ?? [],
              }),
            },
          },
        ],
        ['metric'],
        ['groupby'],
        ['adhoc_filters'],
        ['row_limit'],
      ],
    },
    {
      label: t('Realtime Options'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'refresh_interval_ms',
            config: {
              type: 'SelectControl',
              label: t('Auto-refresh interval'),
              description: t('How often to fetch new data points.'),
              default: 5000,
              choices: [
                [1000, t('1 second')],
                [2000, t('2 seconds')],
                [5000, t('5 seconds')],
                [10000, t('10 seconds')],
                [30000, t('30 seconds')],
                [60000, t('1 minute')],
              ],
            },
          },
          {
            name: 'max_points',
            config: {
              type: 'TextControl',
              label: t('Max points in memory'),
              description: t(
                'Cap on how many data points to keep in the chart at once. Oldest are dropped to prevent memory bloat.',
              ),
              default: 500,
              isInt: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Chart Options'),
      expanded: false,
      controlSetRows: [
        ['color_scheme'],
        ['show_legend'],
        [
          {
            name: 'smooth',
            config: {
              type: 'CheckboxControl',
              label: t('Smooth line'),
              default: true,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
