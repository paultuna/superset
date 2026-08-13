# plugin-chart-realtime-line

An Apache Superset chart plugin that renders an ECharts line chart with **incremental, near-real-time data fetching** — loading only new data points since the last refresh rather than reloading the full dataset on every cycle.

---

## What it does

This plugin provides a line chart that behaves similarly to the live view in Google Analytics: after an initial load, it polls the backend at a configurable interval and **appends only the new rows** to the existing chart, instead of replacing everything. This makes it practical for high-frequency data scenarios where re-running a full query every few seconds would be too expensive.

---

## How it differs from the standard ECharts Line chart

| Behaviour | Standard ECharts Line | Realtime Line |
|---|---|---|
| Data refresh | Full dataset reload | Append-only (new rows only) |
| Query filter | Controlled by `time_range` | `WHERE time_col > lastFetchedAt` after first load |
| ECharts merge mode | `notMerge: true` | `notMerge: false` (incremental) |
| Memory cap | None | Configurable `max_points` limit |
| Polling | Driven by dashboard refresh | Internal `setInterval` |

---

## Available controls

| Control | Description |
|---|---|
| **Time Column** | The datetime column used to identify new rows on each refresh cycle. |
| **Auto-refresh interval** | How often the chart polls for new data (1 s – 1 min). |
| **Max points in memory** | Maximum number of data points kept in the chart at once; the oldest are dropped to prevent memory growth. Default: 500. |
| **Metric** | The numeric measure to plot on the Y axis. |
| **Group By** | Optional dimension columns that split the data into multiple series. |
| **Time Range** | The initial time window used on the very first load (e.g. "Last hour"). Subsequent fetches use `lastFetchedAt` instead. |

---

## Architecture

```
Dashboard mount
      │
      ▼
Initial load (full time_range query)
      │
      ├──► POST /api/v1/chart/data
      │         { filters: [ time_range ] }
      │
      ▼
RealtimeLine renders full chart
lastFetchedAt = max timestamp in first batch
      │
      ▼
setInterval(refresh_interval_ms)
      │
      ├──► POST /api/v1/chart/data
      │         { filters: [ time_col > lastFetchedAt ] }
      │                         │
      │                         ▼
      │               new rows returned
      │                         │
      │                         ▼
      │               chart.setOption(
      │                 { series: updatedSeries },
      │                 { notMerge: false }     ← ECharts appends / animates
      │               )
      │               lastFetchedAt = max(newRows.timestamp)
      │
      └──► (repeat)
```

---

## How to register the plugin in Superset

1. Add the plugin package to your Superset frontend workspace (the package is located at `superset-frontend/plugins/plugin-chart-realtime-line`).

2. Import and register the plugin in your Superset frontend entry point (e.g. `superset-frontend/src/visualizations/presets/MainPreset.js`):

```typescript
import RealtimeLineChartPlugin from '@superset-ui/plugin-chart-realtime-line';

// Inside your preset's constructor plugins array:
new RealtimeLineChartPlugin().configure({ key: 'realtime_line' }),
```

3. Restart the frontend dev server. The **Realtime Line Chart** will appear in the chart type picker under the **Evolution** category.

---

## Limitations

- **Backend compatibility**: Because the plugin relies on a `WHERE time_col > <timestamp>` filter, the backend must support fast point-lookup on a datetime column. The plugin works best with:
  - **Apache Druid** — real-time ingestion, sub-second query latency
  - **ClickHouse** — near-real-time ingest with excellent range scan performance
  - **Apache Pinot** — real-time OLAP optimised for time-series workloads
- **Standard RDBMS** (PostgreSQL, MySQL) work but may struggle at high refresh rates on large tables without a covering index on the time column.
- The plugin manages its own polling loop via `setInterval`. Superset's dashboard-level auto-refresh is independent and will trigger a full reload if configured — consider disabling dashboard auto-refresh when using this plugin.
- The `max_points` cap prevents unbounded memory growth, but very high refresh rates on wide datasets can still increase DOM/canvas pressure over time.
- No WebSocket or server-push support; all communication is standard HTTPS polling.
