# RevAgent — Frontend Dashboard Prompt

Use this prompt with Claude, Cursor, or any AI coding tool to generate the complete Next.js frontend for RevAgent.

---

## THE PROMPT

```
You are building the frontend for RevAgent — a multi-agent AI revenue intelligence platform for SaaS companies. This is a real product, not a demo. The UI should feel like a tool that a VP of Finance at a Series B startup would trust with their revenue data.

## PRODUCT CONTEXT

RevAgent lets SaaS teams interact with their revenue data using natural language. A backend (FastAPI + LangGraph) orchestrates 6 AI agents that translate questions to SQL, detect anomalies, forecast metrics, and recommend actions. Your job is the frontend — the chat interface, the dashboard, and the experience layer that makes AI-generated financial insights feel trustworthy and actionable.

The target user is a revenue ops manager or finance lead at a 50–500 person SaaS company. They currently use Stripe dashboards, spreadsheets, and Metabase/Looker. They are not technical but they are data-literate. They care about accuracy, speed, and not looking stupid in front of their CFO.

## DESIGN DIRECTION

**Aesthetic:** Financial-grade clarity meets modern SaaS. Think Linear meets Stripe Dashboard meets Bloomberg Terminal — not playful, not corporate-boring. Clean, dense where it needs to be, spacious where it matters. The kind of interface that communicates "this tool knows what it's doing" before you even type a query.

**Theme:** Dark mode primary (slate-900/950 backgrounds, not pure black). Light mode as a toggle. The dark mode should feel like a premium command center. The light mode should feel like a clean financial report.

**Typography:**
- Display/headings: "Plus Jakarta Sans" or "Geist" — modern, geometric, confident
- Body text: "Geist" or "IBM Plex Sans" — excellent legibility at small sizes
- Monospace (for SQL, numbers, agent labels): "Geist Mono" or "IBM Plex Mono"
- Financial numbers should use tabular (monospace) figures so columns align

**Color Palette:**
- Background: slate-950 (#0a0a0f) → slate-900 (#0f172a)
- Card surfaces: slate-900/80 with subtle borders (slate-800/40)
- Primary accent: indigo-500 (#6366f1) — used sparingly for active states, CTAs
- Success/positive: emerald-500 (#10b981) — revenue up, healthy metrics
- Warning: amber-500 (#f59e0b) — anomalies, attention needed
- Danger/negative: rose-500 (#f43f5e) — churn, declining metrics, errors
- Text primary: slate-100 (#f1f5f9)
- Text secondary: slate-400 (#94a3b8)
- Text muted: slate-500 (#64748b)
- Borders: slate-800/40 — barely visible, structural not decorative

**Core Principles:**
1. Numbers are sacred — financial data gets prominent treatment with proper formatting ($42,380.00 not 42380), color-coded delta indicators (↑ 12.3% in green, ↓ 4.2% in rose), and tabular alignment
2. Trust through transparency — show the user what the AI is doing: which agent is active, what SQL was generated, confidence scores
3. Information density done right — this is a power tool, not a landing page. Dense but not cluttered. Every pixel earns its place.
4. Smooth but not flashy — subtle transitions (150-200ms), no bouncy animations, no gratuitous motion. The data is the hero, not the UI.

## PAGE STRUCTURE

### Layout Shell
- Left sidebar (collapsible, 240px expanded / 64px collapsed)
  - Logo + wordmark at top ("RevAgent" with a small signal/pulse icon)
  - Navigation: Dashboard, Chat, Insights, Forecasts, Settings
  - Active nav item has a subtle indigo-500/10 background with indigo-400 text and a 2px left border
  - Collapsed state shows only icons
  - Bottom: user avatar + company name + settings gear
- Main content area fills remaining space
- Top bar: breadcrumb, global search (⌘K), notification bell (anomaly alerts), theme toggle

### Page 1: Dashboard (Default Landing)

This is the "morning briefing" view — what the user sees when they open RevAgent at 8am.

**Top metrics row (4 cards in a grid):**
- Monthly Recurring Revenue (MRR): large number ($423,800), delta vs last month (+3.2% ↑ emerald), sparkline showing last 6 months trend
- Active Subscribers: count (1,284), delta (-12 from last month, ↓ rose if negative)
- Net Revenue Retention: percentage (108.4%), color-coded (green if >100%, amber if 95-100%, rose if <95%)
- Churn Rate: percentage (2.1%), inverse color (green if <3%, amber if 3-5%, rose if >5%), sparkline

Each metric card should have:
- A subtle icon (use Lucide icons)
- The metric label in text-xs uppercase tracking-wider text-slate-500
- The value in text-2xl or text-3xl font-semibold tabular-nums
- A delta badge showing change with directional arrow and color
- A tiny sparkline (7 data points, using a simple SVG path — no charting library needed for these)

**MRR Trend Chart (full width, below metrics):**
- Area chart showing MRR over the last 12 months using Recharts
- Stacked by component: New MRR (indigo), Expansion MRR (emerald), Contraction MRR (amber, shown as negative), Churned MRR (rose, shown as negative)
- Clean axis labels, grid lines at 25% opacity, tooltip on hover showing breakdown
- "Explore in Chat →" link in top-right corner

**Two-column section below:**

Left column — "Recent Anomalies" card:
- List of 3-5 anomaly alerts generated by the Insights Agent
- Each alert has: severity indicator (colored dot: rose=critical, amber=warning, emerald=info), title ("Enterprise churn spiked 42%"), timestamp ("2 hours ago"), one-line explanation
- "View all →" link at bottom
- If no anomalies: show a calm "All metrics within normal ranges" state with a checkmark

Right column — "Revenue by Tier" card:
- Horizontal stacked bar chart or donut chart showing MRR distribution by pricing tier (Starter, Growth, Enterprise)
- Legend with tier names, MRR amounts, and percentage of total
- Subtle hover effect revealing exact values

**Bottom section — "Recent Queries" card:**
- Table showing the last 5-7 queries asked via Chat
- Columns: Query text (truncated), Agent Used (small colored badge), Response Time, Timestamp
- Each row is clickable (navigates to Chat with that conversation)

### Page 2: Chat Interface

This is the core interaction surface — where users ask revenue questions in natural language.

**Layout:** Two-panel layout
- Left panel (65% width): Chat conversation
- Right panel (35% width): Context panel (shows data/charts from the latest response)

**Chat Panel:**
- Message input at the bottom: large textarea with placeholder "Ask about your revenue data..." 
- Send button (indigo-500) + keyboard shortcut hint (⌘↵)
- Suggested queries above the input when chat is empty (3-4 pill buttons):
  - "What's our MRR by tier?"
  - "Why did churn increase last month?"
  - "Forecast next quarter's revenue"
  - "Which accounts are at risk?"

**Message Bubbles:**
- User messages: right-aligned, indigo-500/10 background, indigo border
- Agent responses: left-aligned, slate-800/50 background
- Agent responses should show:
  - Which agent is responding (small colored badge: "Query Agent", "Insights Agent", etc.)
  - The response text with proper markdown rendering (tables, bold, code blocks)
  - If SQL was generated: collapsible "View SQL" section showing the query in a syntax-highlighted code block
  - If data was returned: inline mini-table or chart rendered within the message
  - Confidence score as a subtle indicator (e.g., small "92% confidence" text in slate-500)
  - Timestamp

**Streaming Indicators:**
- When the system is processing, show a step-by-step progress indicator:
  - "Routing query..." (Supervisor Agent badge)
  - "Retrieving schema..." (Query Agent badge)  
  - "Generating SQL..." (Query Agent badge)
  - "Executing query..." (Query Agent badge)
  - "Analyzing results..." (Insights Agent badge)
- Each step appears sequentially with a subtle fade-in. Completed steps get a checkmark. Active step has a pulsing dot.
- This is NOT a spinner. It's a transparent pipeline showing exactly what's happening.

**Context Panel (Right Side):**
- Shows supplementary data from the latest agent response
- Can contain: a data table (sortable), a Recharts chart (auto-generated based on query type), an anomaly summary card, or forecast projections
- Has a "Pin to Dashboard" action to save this view
- Has an "Export CSV" action for data tables
- Collapses to a thin strip on smaller screens

**Human-in-the-Loop Approval UI:**
- When the Action Agent recommends something, the chat shows a special "Recommendation" card:
  - Amber/indigo gradient border to stand out
  - Title: "Recommended Action"
  - Description of the recommendation
  - Expected impact (e.g., "$130K ARR saveable")
  - Two buttons: "Approve" (emerald) and "Reject" (slate) 
  - "View reasoning" expandable section

### Page 3: Insights

Dedicated view for the Insights Agent's anomaly detection output.

**Timeline view:**
- Vertical timeline showing detected anomalies over the past 30 days
- Each entry: date marker, severity badge, metric affected, explanation, recommended action
- Filter bar at top: severity (all/critical/warning/info), metric type (MRR/churn/expansion/all), time range
- Click any insight to open it in Chat for deeper analysis

### Page 4: Forecasts

**Projection charts:**
- MRR forecast: line chart with actual data (solid line) and projected data (dashed line) with confidence interval shading (80% and 95% bands)
- Churn prediction: table of at-risk accounts with risk score, MRR at risk, days until predicted churn
- Scenario selector: "If current trends continue" / "If we execute recommendations" toggle showing different projection lines

## COMPONENT SPECIFICATIONS

### MetricCard Component
Props: label, value, previousValue, format ('currency' | 'percent' | 'number'), sparklineData, icon
- Auto-calculates delta and chooses color
- Formats numbers with Intl.NumberFormat
- Renders SVG sparkline from data array

### AgentBadge Component
Props: agentName, size ('sm' | 'md')
- Maps agent name to color: Supervisor=#8B5CF6, Query=#0EA5E9, Insights=#F59E0B, Forecast=#10B981, Action=#EF4444, Validator=#6366F1
- Renders colored dot + label

### ChatMessage Component
Props: role ('user' | 'agent'), content, agentName?, sql?, data?, confidence?, timestamp
- Conditionally renders SQL block, data table, chart
- Handles markdown rendering

### StreamingSteps Component
Props: steps (array of {label, agent, status: 'pending' | 'active' | 'complete'})
- Animated vertical stepper showing agent pipeline progress

### AnomalyCard Component
Props: severity, metric, title, explanation, timestamp, actionLabel?
- Color-coded by severity
- Compact for list views, expandable for detail

## TECHNICAL REQUIREMENTS

- Framework: Next.js 14+ (App Router)
- Styling: Tailwind CSS only (no component libraries like shadcn — build from scratch for maximum control)
- Charts: Recharts for all data visualizations
- Icons: Lucide React
- State: React useState/useReducer (no external state management needed)
- API: Mock the backend responses with realistic static data for now. Create a /lib/mock-data.ts file with realistic SaaS metrics (use the seed data described in the RevAgent blueprint — 50 companies, MRR around $400K, 3 pricing tiers, 2.1% churn rate, 108% NRR)
- Streaming simulation: Use setTimeout chains to simulate the agent pipeline steps
- Responsive: Desktop-first but should not break on tablet. Sidebar collapses on mobile.
- Performance: No unnecessary re-renders. Memoize expensive chart components.

## MOCK DATA REQUIREMENTS

Create realistic SaaS revenue data that tells a coherent story:

- Current MRR: $423,800 (up from $410,500 last month)
- MRR breakdown: Starter $84,760 (20%), Growth $190,710 (45%), Enterprise $148,330 (35%)
- Active subscribers: 1,284 (Starter: 642, Growth: 514, Enterprise: 128)
- Net Revenue Retention: 108.4%
- Monthly churn rate: 2.1% (logo), 1.4% (revenue)
- Recent anomaly: Enterprise churn spiked 42% in February (23 cancellations vs 16 baseline)
- Expansion MRR last month: $18,200
- 12-month MRR trend: steady growth from $310K to $423K with a dip in month 8

## WHAT TO BUILD FIRST

Build these in order:
1. Layout shell (sidebar + topbar + main content area) with navigation
2. Dashboard page with metric cards and MRR chart
3. Chat interface with message rendering and streaming simulation
4. Insights timeline page
5. Forecasts page with projection charts

Each page should be fully functional with mock data. The goal is a portfolio piece that looks and feels like a real product — something you could demo in an interview and have the interviewer believe it's connected to a live backend.

## QUALITY BAR

Before considering this done:
- Every number is properly formatted (commas, decimals, currency symbols)
- Every delta has directional color (green=good, rose=bad, relative to the metric)
- The chat streaming simulation feels real (appropriate delays between steps, not too fast, not too slow)
- The dark mode looks premium, not muddy
- The light mode is clean, not washed out
- Transitions are subtle (150ms ease), no janky layout shifts
- The overall impression is: "this person builds real products, not tutorials"
```

---

## HOW TO USE THIS PROMPT

**Option 1 — Single-file React artifact (Claude.ai):**
Paste the prompt into Claude and ask it to build a single-file React component (.jsx) that contains the full dashboard. This works well for a portfolio demo artifact.

**Option 2 — Multi-file Next.js project (Cursor / Claude Code):**
Paste the prompt into Cursor or Claude Code and ask it to scaffold the full Next.js project with proper file structure:
```
/app
  /layout.tsx          ← Shell with sidebar
  /page.tsx            ← Dashboard
  /chat/page.tsx       ← Chat interface
  /insights/page.tsx   ← Insights timeline
  /forecasts/page.tsx  ← Forecast charts
/components
  /ui/MetricCard.tsx
  /ui/AgentBadge.tsx
  /ui/StreamingSteps.tsx
  /ui/AnomalyCard.tsx
  /chat/ChatMessage.tsx
  /chat/ChatInput.tsx
  /charts/MRRChart.tsx
  /charts/SparkLine.tsx
/lib
  /mock-data.ts        ← All realistic SaaS data
  /constants.ts        ← Agent colors, metric configs
  /utils.ts            ← Number formatting, delta calculations
```

**Option 3 — Incremental build:**
Break the prompt into sections and feed them one at a time:
1. First: Layout shell + navigation only
2. Then: Dashboard page with metric cards
3. Then: Chat interface
4. Then: Insights + Forecasts pages

This gives you more control over each piece and lets you iterate.

## TIPS FOR BEST RESULTS

- If the output looks too "template-y", add: "Make it feel like it was designed by a senior product designer at Linear or Vercel. Every spacing choice should be intentional."
- If charts look basic, add: "Use Recharts with custom styling — no default colors, no default grid. Match the dashboard's color palette exactly."
- If the streaming simulation feels fake, add: "Add realistic delays: 300ms for routing, 800ms for schema retrieval, 1200ms for SQL generation, 600ms for execution, 1000ms for analysis. These should feel like real network calls."
- If you want to connect to the real FastAPI backend later, the mock data layer is already isolated in /lib/mock-data.ts — you just swap the imports for real API calls.
