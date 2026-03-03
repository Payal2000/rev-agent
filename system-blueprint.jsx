import { useState } from "react";

const sections = [
  {
    id: "overview",
    title: "Overview",
    subtitle: "The problem, the solution, and why it matters",
    icon: "⚡",
    content: {
      problem: {
        headline: "SaaS finance teams are drowning in manual work",
        stats: [
          { value: "8+ hrs/week", label: "pulling recurring metrics manually" },
          { value: "Days", label: "wait time for ad-hoc executive analysis" },
          { value: "1 analyst", label: "bottlenecked answering the same questions repeatedly" },
        ],
        description: "Revenue questions never stop coming. What's our MRR? Why did churn spike? How are enterprise trials converting? Every answer requires an analyst to write SQL, pull data, format a response — and repeat it next week.",
      },
      solution: {
        headline: "Ask revenue questions in plain English. Get answers instantly.",
        description: "An AI-powered revenue intelligence platform where anyone — not just SQL-fluent analysts — can interrogate subscription data. Under the hood, a multi-agent system translates natural language to SQL, validates queries, executes them against a live PostgreSQL database, and proactively surfaces revenue anomalies before anyone has to ask.",
        stack: [
          { layer: "Orchestration", tech: "LangGraph", detail: "Multi-agent pipeline with Supervisor → Query → Insights → Forecast → Action → Validator" },
          { layer: "Frontend", tech: "Vercel AI SDK", detail: "Streaming responses, real-time agent step visibility, SSE transport" },
          { layer: "Data", tech: "PostgreSQL + pgvector", detail: "Live Stripe data warehouse with semantic schema retrieval" },
          { layer: "Intelligence", tech: "OpenAI GPT-4o", detail: "SQL generation via function calling, anomaly narrative, LLM-as-judge validation" },
        ],
      },
      impact: {
        headline: "Build once, benefit forever",
        description: "This replaces recurring analyst work with a self-service tool. The agent runs scheduled briefings overnight, fires automatically when a metric breaches a threshold, and gives executives direct access to revenue data without scheduling a meeting.",
        outcomes: [
          { metric: "Recurring analyst work", before: "8 hrs/week", after: "Automated overnight briefing" },
          { metric: "Ad-hoc revenue questions", before: "2–3 day turnaround", after: "< 10 seconds" },
          { metric: "Anomaly detection", before: "Human-spotted in dashboards", after: "Agent-triggered, context-rich" },
          { metric: "SQL access", before: "Engineers and analysts only", after: "Any stakeholder, plain English" },
        ],
      },
    },
  },
  {
    id: "data",
    title: "Data Layer",
    subtitle: "Where does the data come from?",
    icon: "🗄️",
    content: {
      intro: "Two modes: Live Stripe API for real data, or synthetic seed for demo/portfolio. Both work with the same agent pipeline.",
      sources: [
        {
          name: "Stripe API (Live Mode)",
          how: "Real production data via Stripe's REST API. This is what makes it a real product, not a toy.",
          endpoints: [
            { api: "GET /v1/subscriptions", data: "All active/canceled/trialing subscriptions with plan, price, status, cancel_at" },
            { api: "GET /v1/invoices", data: "Payment history, amounts, payment status, line items" },
            { api: "GET /v1/customers", data: "Customer metadata, creation date, email, custom fields" },
            { api: "GET /v1/balance_transactions", data: "Net revenue, fees, refunds, disputes" },
            { api: "GET /v1/events (webhooks)", data: "Real-time: customer.subscription.updated, invoice.paid, customer.subscription.deleted" },
            { api: "GET /v1/prices + /v1/products", data: "Pricing tiers, plan details, product catalog" },
          ],
          note: "You already know Stripe's API from 3 roles. The key insight: use webhooks for real-time event streaming into your PostgreSQL, then agents query the local DB (not Stripe directly every time). This is exactly what you built at Peeker AI.",
        },
        {
          name: "Stripe Sigma (SQL Layer)",
          how: "Stripe's own SQL interface for querying billing data. Costs ~$0.027/charge but gives you direct SQL access to Stripe's data warehouse.",
          endpoints: [
            { api: "Sigma SQL queries", data: "MRR by product, churn by cohort, revenue movements, custom aggregations" },
          ],
          note: "This is the 'semantic layer' angle — you're building an AI interface ON TOP of Stripe Sigma. Your agents generate SQL that Sigma executes. Meta-level: an AI semantic layer over Stripe's existing SQL layer.",
        },
        {
          name: "Synthetic Seed Data (Demo Mode)",
          how: "Python script that generates 2 years of realistic SaaS subscription events. For the portfolio/GitHub version.",
          endpoints: [
            { api: "seed_data.py", data: "50 companies, 500+ subscriptions, 10K+ events, 3 pricing tiers, realistic churn patterns, seasonal trends, expansion events" },
          ],
          note: "Seed data should include deliberate anomalies for the Insights Agent to detect: a churn spike in month 14, an expansion surge in month 8, a pricing tier migration pattern. This makes demos compelling.",
        },
      ],
    },
  },
  {
    id: "automation",
    title: "Automation Layer",
    subtitle: "How does data flow without human intervention?",
    icon: "⚡",
    content: {
      intro: "This is the layer that separates a chatbot from a production system. Three automation patterns:",
      patterns: [
        {
          name: "Stripe Webhook Ingestion Pipeline",
          type: "Event-Driven (Real-Time)",
          description: "Stripe sends webhook events to your FastAPI endpoint. Each event is validated (signature check), classified, transformed, and written to PostgreSQL. This keeps your local DB in sync with Stripe without polling.",
          flow: "Stripe Event → FastAPI /webhook endpoint → Signature verification → Event classifier → PostgreSQL write → Trigger agent pipeline if anomaly threshold met",
          techDetail: "FastAPI webhook handler with Stripe signature verification (stripe.Webhook.construct_event). Events stored in an events table with type, timestamp, payload JSONB. A materialized view auto-computes MRR/churn/expansion from raw events. When new events arrive, a background task checks if any metric crossed an anomaly threshold — if so, it triggers the Insights Agent.",
          yourExperience: "This is literally what you built at Peeker AI — 'event-driven Stripe webhook pipeline with tiered logic.' Same architecture, now feeding AI agents instead of Tolt.",
        },
        {
          name: "Scheduled Agent Runs (Cron)",
          type: "Time-Based (Daily/Weekly)",
          description: "The Insights Agent runs on a schedule without any user interaction. It pulls yesterday's metrics, compares against baselines, and generates a daily briefing. Think of it as an AI analyst that works overnight.",
          flow: "Cron trigger (daily 6am) → Insights Agent → Query Agent (pull metrics) → Anomaly detection → Forecast Agent (projections) → Action Agent (recommendations) → Store briefing → Notify via Slack/email",
          techDetail: "Use APScheduler or Celery Beat for cron scheduling. The scheduled run creates a LangGraph invocation with a system-generated query: 'Generate daily revenue briefing for yesterday.' The full agent pipeline runs autonomously. Results stored in a briefings table. Optional: send Slack notification via webhook with key findings.",
          yourExperience: "Your Qatch ETL pipelines ran on schedules (Airflow). Same concept — scheduled data processing — but now the processing is done by AI agents instead of SQL transforms.",
        },
        {
          name: "Threshold-Based Triggers",
          type: "Conditional (Event-Driven)",
          description: "When a metric crosses a predefined threshold, an agent pipeline fires automatically. Example: if daily churn exceeds 2x the 30-day average, the Insights + Action agents activate without anyone asking.",
          flow: "New event ingested → Metric recomputed → Threshold check → If breached: Supervisor Agent triggered → Insights Agent analyzes → Action Agent recommends → Human-in-the-loop notification",
          techDetail: "PostgreSQL triggers or application-level checks after each webhook event. Thresholds stored in a config table (metric_name, threshold_type, threshold_value, lookback_days). When breached, a LangGraph run is enqueued via Redis/Celery with the context: which metric, current value, baseline, breach magnitude.",
          yourExperience: "Your Grafana observability dashboards at HPCL reduced mean-time-to-detection by 60%. This is the same principle — automated detection — but the response is now an AI agent, not a human looking at a dashboard.",
        },
      ],
    },
  },
  {
    id: "apis",
    title: "External APIs",
    subtitle: "What APIs does each agent call?",
    icon: "🔌",
    content: {
      intro: "Each agent has specific external dependencies. Here's the full API map:",
      agentApis: [
        {
          agent: "Query Agent",
          apis: [
            { name: "OpenAI API", purpose: "SQL generation via function calling (gpt-4o). Structured output with JSON mode for reliable SQL extraction.", cost: "~$0.005-0.02 per query" },
            { name: "pgvector (internal)", purpose: "Semantic schema retrieval — finds relevant tables/columns for each query using embedding similarity", cost: "Free (self-hosted)" },
            { name: "PostgreSQL", purpose: "Execute generated SQL against the SaaS data warehouse. Read-only connection.", cost: "Free (Supabase/Neon free tier)" },
          ],
        },
        {
          agent: "Insights Agent",
          apis: [
            { name: "OpenAI API", purpose: "Narrative generation — turns statistical anomaly data into human-readable explanations", cost: "~$0.01 per insight" },
            { name: "Internal (Query Agent)", purpose: "Delegates data fetching to Query Agent rather than hitting DB directly. Agent-to-agent communication via LangGraph state.", cost: "Free" },
          ],
        },
        {
          agent: "Forecast Agent",
          apis: [
            { name: "OpenAI API", purpose: "Business context interpretation of statistical projections", cost: "~$0.01 per forecast" },
            { name: "statsmodels / scipy (internal)", purpose: "Time-series analysis: exponential smoothing, linear regression, confidence intervals. No external API — runs in Python.", cost: "Free" },
          ],
        },
        {
          agent: "Action Agent",
          apis: [
            { name: "OpenAI API", purpose: "Generate specific recommendations from playbook context + anomaly data", cost: "~$0.01 per recommendation set" },
            { name: "pgvector (RAG)", purpose: "Retrieve relevant playbook entries (churn reduction tactics, expansion strategies, pricing optimization) via semantic search", cost: "Free" },
            { name: "Slack API (optional)", purpose: "Send automated alerts/recommendations to team Slack channels", cost: "Free" },
            { name: "SendGrid/Resend (optional)", purpose: "Email daily briefings or urgent alerts", cost: "Free tier" },
          ],
        },
        {
          agent: "Validator Agent",
          apis: [
            { name: "OpenAI API", purpose: "Score output quality and policy compliance using LLM-as-judge pattern", cost: "~$0.005 per validation" },
            { name: "PostgreSQL (audit log)", purpose: "Write every agent decision, SQL query, and validation result to audit_log table", cost: "Free" },
          ],
        },
        {
          agent: "Supervisor Agent",
          apis: [
            { name: "OpenAI API", purpose: "Intent classification via function calling. Routes queries to specialist agents.", cost: "~$0.002 per classification" },
            { name: "LangSmith API", purpose: "Full observability — traces every agent interaction, tool call, latency, token usage", cost: "Free tier (5K traces/month)" },
          ],
        },
      ],
    },
  },
  {
    id: "infra",
    title: "Additional Agentic Infra",
    subtitle: "What else can we add to make this production-grade?",
    icon: "🏗️",
    content: {
      intro: "These are the features that turn a demo into something you'd actually deploy at a company:",
      features: [
        {
          name: "MCP Server (Model Context Protocol)",
          category: "Tool Integration",
          description: "Expose your entire RevAgent system as an MCP server. This means any MCP-compatible client (Claude Desktop, Cursor, other agents) can use your revenue intelligence as a tool. Your agent becomes a building block for other agents.",
          techDetail: "LangGraph natively supports MCP endpoints since v0.2.3 — just deploy your graph and the /mcp endpoint is auto-exposed. Other agents can discover and call your tools dynamically at runtime without custom integration code.",
          whyItMatters: "This is the hottest skill in 2026 agentic AI. MCP is becoming the USB standard for AI agents. Building AND exposing MCP tools shows you understand the ecosystem, not just individual agents.",
          difficulty: "Medium",
        },
        {
          name: "Memory System (Short-term + Long-term)",
          category: "Agent Intelligence",
          description: "Short-term: conversation context within a session (LangGraph state). Long-term: agent remembers what it learned across sessions — which queries users ask most, which anomalies recurred, which recommendations worked.",
          techDetail: "LangGraph checkpointer for conversation persistence (langgraph-checkpoint-postgres). Long-term memory stored in a separate memory table: semantic embeddings of past interactions, outcomes of recommendations, user preference patterns. Agents use this to personalize responses over time.",
          whyItMatters: "Memory is what separates a tool from a teammate. If the agent remembers that 'churn spike in Enterprise' happened last quarter too, and the recommended action worked, it can say: 'This is recurring — the 90-day pricing lock worked last time, recommend repeating.'",
          difficulty: "Medium",
        },
        {
          name: "Human-in-the-Loop Approval Gates",
          category: "Governance",
          description: "Before the Action Agent executes any recommendation (send email, create Slack alert, flag account), it pauses and waits for human approval. The human sees the recommendation + reasoning + expected impact, then approves/rejects/modifies.",
          techDetail: "LangGraph interrupt() function pauses the graph at a specific node. The state is persisted to PostgreSQL via checkpointer. When the human approves via the UI, the graph resumes from exactly where it stopped. Rejected actions are logged with the reason for the AI to learn from.",
          whyItMatters: "This is non-negotiable for fintech. No AI should autonomously take financial actions without human oversight. This shows you understand governance — the exact 'AI compliance' differentiator the JD asks for.",
          difficulty: "Easy (LangGraph has this built-in)",
        },
        {
          name: "Evaluation & Testing Pipeline",
          category: "Reliability",
          description: "Automated testing for agent outputs. You create a test suite of questions + expected SQL + expected results. On every code change, the suite runs and validates that agents still produce correct answers.",
          techDetail: "LangSmith evaluation framework. Define test datasets: 50+ question/answer pairs covering MRR queries, churn analysis, edge cases. Run evaluations automatically in CI/CD. Score on: SQL correctness (execution accuracy), result accuracy (matches expected output), latency, cost per query. Block deployments if accuracy drops below 90%.",
          whyItMatters: "This is the 'CI/CD for prompts' that production AI teams need. Most portfolio projects have zero testing. Yours has an automated eval suite. That's a massive signal to hiring managers.",
          difficulty: "Medium",
        },
        {
          name: "Streaming + Real-time UI",
          category: "User Experience",
          description: "Agent responses stream token-by-token to the frontend. The user sees the agent 'thinking' — which agent is active, what tools it's calling, what SQL it generated — in real time.",
          techDetail: "LangGraph supports native token-by-token streaming. FastAPI SSE (Server-Sent Events) endpoint streams to the Next.js frontend. Show intermediate steps: 'Routing to Query Agent...' → 'Generating SQL...' → 'Executing query...' → 'Analyzing results...' → final answer. This is UX gold for interviews.",
          whyItMatters: "Shows you understand production UX for AI systems. Users need transparency — especially in financial tools where they need to trust the output. Seeing the agent's reasoning builds that trust.",
          difficulty: "Easy-Medium",
        },
        {
          name: "Multi-Tenant Data Isolation",
          category: "Production Architecture",
          description: "Each company's data is isolated. Company A can't see Company B's revenue data. Agents enforce row-level security automatically.",
          techDetail: "PostgreSQL Row-Level Security (RLS) policies. Each query generated by the Query Agent automatically includes a WHERE company_id = {current_tenant} clause. The Validator Agent checks every SQL for proper tenant isolation before execution. Auth via Supabase Auth or NextAuth.",
          whyItMatters: "Most portfolio projects are single-tenant toys. Adding multi-tenancy shows you think about production concerns — data isolation, security, compliance. This is especially critical for financial data.",
          difficulty: "Medium",
        },
        {
          name: "Feedback Loop (Agent Learning)",
          category: "Continuous Improvement",
          description: "Users can thumbs-up/down agent responses. Thumbs-down triggers: was the SQL wrong? was the insight irrelevant? was the recommendation bad? This feedback is stored and used to improve prompts and retrieval over time.",
          techDetail: "Feedback stored in a feedback table linked to the trace_id from LangSmith. Weekly automated analysis: which query types have the lowest accuracy? Which schema descriptions cause bad SQL generation? Use this to refine system prompts, add few-shot examples to the semantic schema store, and update the playbook RAG.",
          whyItMatters: "This closes the loop from 'AI tool' to 'AI system that improves.' It's the 'build systems that scale beyond yourself' requirement from the JD — the system gets smarter without you manually tuning it.",
          difficulty: "Easy",
        },
        {
          name: "Slack/Email MCP Integration",
          category: "Distribution",
          description: "Agents can be invoked directly from Slack. A user types '/revagent what's our churn this week?' in Slack and gets a response in-channel. Daily briefings auto-post to #revenue-ops.",
          techDetail: "Build a Slack bot that receives slash commands, forwards them to the LangGraph API, and posts the streaming response back. Or expose the agent as an MCP server and connect it to Claude Desktop — users can ask revenue questions inside their existing AI tools.",
          whyItMatters: "Distribution matters. A tool nobody opens is useless. Putting the agent where people already work (Slack, email, Claude) is the 'creating leverage' the JD asks for. Build once, accessible everywhere.",
          difficulty: "Easy-Medium",
        },
      ],
    },
  },
];

export default function SystemArchitecture() {
  const [activeSection, setActiveSection] = useState("overview");
  const section = sections.find((s) => s.id === activeSection);

  return (
    <div
      className="min-h-screen text-gray-100"
      style={{
        background: "linear-gradient(155deg, #06070b 0%, #0b1018 50%, #090d16 100%)",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap');
        .display { font-family: 'Instrument Sans', sans-serif; }
        .card { transition: all 0.15s ease; }
        .card:hover { background: rgba(255,255,255,0.03); }
        .fade { animation: f 0.2s ease; }
        @keyframes f { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      `}</style>

      <div className="px-5 pt-7 pb-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs tracking-widest uppercase text-gray-500 mb-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          system deep-dive
        </div>
        <h1 className="display text-2xl font-bold text-white">
          RevAgent: Infrastructure Blueprint
        </h1>
        <p className="text-gray-500 text-sm mt-1">Data pipelines · Automation · APIs · Agentic infrastructure</p>
      </div>

      {/* Section tabs */}
      <div className="px-5 max-w-5xl mx-auto border-b border-gray-800/40 mb-5">
        <div className="flex gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-2.5 text-xs font-medium tracking-wide rounded-t-md ${
                activeSection === s.id
                  ? "text-white bg-gray-800/50 border-b-2 border-cyan-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="mr-1.5">{s.icon}</span>
              {s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8 max-w-5xl mx-auto">
        {section && (
          <div className="fade">
            <div className="mb-5">
              <h2 className="display text-xl font-bold text-white flex items-center gap-2">
                {section.icon} {section.title}
              </h2>
              <p className="text-xs text-gray-500 mt-1">{section.subtitle}</p>
              <p className="text-sm text-gray-400 mt-3 leading-relaxed">{section.content.intro}</p>
            </div>

            {/* OVERVIEW SECTION */}
            {activeSection === "overview" && section.content.problem && (() => {
              const { problem, solution, impact } = section.content;
              return (
                <div className="space-y-5">
                  {/* Problem */}
                  <div className="p-4 rounded-lg bg-gray-900/40 border border-gray-800/40">
                    <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">The Problem</div>
                    <h3 className="display text-base font-bold text-white mb-4">{problem.headline}</h3>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {problem.stats.map((s, i) => (
                        <div key={i} className="p-3 rounded bg-red-950/20 border border-red-800/20 text-center">
                          <div className="text-lg font-bold text-red-300 display">{s.value}</div>
                          <div className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{problem.description}</p>
                  </div>

                  {/* Solution */}
                  <div className="p-4 rounded-lg bg-gray-900/40 border border-gray-800/40">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">What I Built</div>
                    <h3 className="display text-base font-bold text-white mb-3">{solution.headline}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed mb-4">{solution.description}</p>
                    <div className="space-y-2">
                      {solution.stack.map((s, i) => (
                        <div key={i} className="flex items-start gap-3 p-2.5 rounded bg-gray-800/30">
                          <div className="w-28 shrink-0">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">{s.layer}</div>
                            <div className="text-xs font-bold text-cyan-400 mt-0.5">{s.tech}</div>
                          </div>
                          <span className="text-xs text-gray-400 leading-relaxed">{s.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Impact */}
                  <div className="p-4 rounded-lg bg-gray-900/40 border border-gray-800/40">
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Why It Matters</div>
                    <h3 className="display text-base font-bold text-white mb-3">{impact.headline}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed mb-4">{impact.description}</p>
                    <div className="space-y-2">
                      {impact.outcomes.map((o, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded bg-gray-800/30">
                          <div className="w-44 shrink-0 text-xs text-gray-400">{o.metric}</div>
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-red-400 line-through opacity-60">{o.before}</span>
                            <span className="text-gray-600">→</span>
                            <span className="text-xs text-emerald-300 font-medium">{o.after}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* DATA SECTION */}
            {activeSection === "data" && section.content.sources?.map((source, i) => (
              <div key={i} className="mb-5 p-4 rounded-lg bg-gray-900/40 border border-gray-800/40">
                <h3 className="display text-sm font-bold text-white mb-1">{source.name}</h3>
                <p className="text-xs text-gray-400 mb-3">{source.how}</p>
                <div className="space-y-1.5 mb-3">
                  {source.endpoints.map((ep, j) => (
                    <div key={j} className="flex items-start gap-3 p-2 rounded bg-gray-800/30">
                      <code className="text-xs text-cyan-400 font-semibold w-52 shrink-0 pt-0.5">{ep.api}</code>
                      <span className="text-xs text-gray-400">{ep.data}</span>
                    </div>
                  ))}
                </div>
                <div className="p-2.5 rounded bg-amber-950/20 border border-amber-800/20">
                  <span className="text-xs text-amber-300 leading-relaxed">{source.note}</span>
                </div>
              </div>
            ))}

            {/* AUTOMATION SECTION */}
            {activeSection === "automation" && section.content.patterns?.map((pattern, i) => (
              <div key={i} className="mb-5 p-4 rounded-lg bg-gray-900/40 border border-gray-800/40">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="display text-sm font-bold text-white">{pattern.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/30 text-cyan-400 border border-cyan-800/30">{pattern.type}</span>
                </div>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">{pattern.description}</p>
                
                <div className="p-3 rounded bg-gray-800/40 mb-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Flow</div>
                  <p className="text-xs text-cyan-300 leading-relaxed font-medium">{pattern.flow}</p>
                </div>

                <div className="p-3 rounded bg-gray-800/40 mb-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Technical Implementation</div>
                  <p className="text-xs text-gray-300 leading-relaxed">{pattern.techDetail}</p>
                </div>

                <div className="p-2.5 rounded bg-amber-950/20 border border-amber-800/20">
                  <div className="text-xs font-bold text-amber-400 mb-0.5">Resume Connection</div>
                  <span className="text-xs text-amber-200/70 leading-relaxed">{pattern.yourExperience}</span>
                </div>
              </div>
            ))}

            {/* APIs SECTION */}
            {activeSection === "apis" && section.content.agentApis?.map((agentApi, i) => (
              <div key={i} className="mb-4 p-4 rounded-lg bg-gray-900/40 border border-gray-800/40">
                <h3 className="display text-sm font-bold text-white mb-3">{agentApi.agent}</h3>
                <div className="space-y-2">
                  {agentApi.apis.map((api, j) => (
                    <div key={j} className="flex items-start gap-3 p-2.5 rounded bg-gray-800/30">
                      <div className="w-36 shrink-0">
                        <div className="text-xs font-semibold text-cyan-400">{api.name}</div>
                        <div className="text-xs text-gray-600 mt-0.5">{api.cost}</div>
                      </div>
                      <span className="text-xs text-gray-400 leading-relaxed">{api.purpose}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* INFRA SECTION */}
            {activeSection === "infra" && section.content.features?.map((feature, i) => (
              <div key={i} className="mb-4 p-4 rounded-lg bg-gray-900/40 border border-gray-800/40 card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="display text-sm font-bold text-white">{feature.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-300 border border-violet-800/30">{feature.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      feature.difficulty.includes("Easy") ? "bg-emerald-900/30 text-emerald-300 border-emerald-800/30" :
                      feature.difficulty.includes("Medium") ? "bg-amber-900/30 text-amber-300 border-amber-800/30" :
                      "bg-red-900/30 text-red-300 border-red-800/30"
                    }`}>{feature.difficulty}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">{feature.description}</p>
                
                <div className="p-2.5 rounded bg-gray-800/40 mb-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">How to build it</div>
                  <p className="text-xs text-gray-300 leading-relaxed">{feature.techDetail}</p>
                </div>
                
                <div className="p-2.5 rounded bg-cyan-950/20 border border-cyan-800/20">
                  <div className="text-xs font-bold text-cyan-400 mb-0.5">Why this matters for hiring</div>
                  <p className="text-xs text-cyan-200/70 leading-relaxed">{feature.whyItMatters}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
