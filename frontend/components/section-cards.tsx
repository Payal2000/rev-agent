"use client"

import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { METRICS_SUMMARY } from "@/lib/mock-data"
import { KPI_COLORS } from "@/lib/kpi-colors"
import { useLiveData } from "@/lib/hooks"

function formatMrr(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  return `$${(value / 1000).toFixed(1)}K`
}

export function SectionCards({ inner }: { inner?: boolean } = {}) {
  const { data: metrics, source, error } = useLiveData(
    "/api/metrics/summary",
    METRICS_SUMMARY,
    { pollMs: 30000, allowFallback: false },
  )
  const churnUp = metrics.churnRate > metrics.churnRatePrev

  return (
    <>
      <div className={`${inner ? "px-4 pb-3 lg:px-5" : "px-4 pb-3 lg:px-6"}`}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`font-semibold ${source === "live" ? "text-green-700" : "text-amber-700"}`}>
            {source.toUpperCase()}
          </span>
          {error && <span>Backend fetch error: {error}</span>}
        </div>
      </div>
      <div className={`grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 ${inner ? "px-4 pb-5 lg:px-5" : "px-4 lg:px-6"}`}>
      {/* MRR */}
      <Card className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: KPI_COLORS.amber.bg }}>
        <CardHeader>
          <CardDescription>Monthly Recurring Revenue</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatMrr(metrics.mrr)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="border-black/25 bg-white/60 text-foreground">
              <IconTrendingUp />
              +{metrics.mrrDelta}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Up from {formatMrr(metrics.mrrPrev)} last month{" "}
            <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            ARR: {formatMrr(metrics.arr)}
          </div>
        </CardFooter>
      </Card>

      {/* Subscribers */}
      <Card className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: KPI_COLORS.blue.bg }}>
        <CardHeader>
          <CardDescription>Active Subscribers</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metrics.subscribers.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="border-black/25 bg-white/60 text-foreground">
              <IconTrendingDown />
              {metrics.subscribersDelta}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Net {Math.abs(metrics.subscribersDelta)} churned this month{" "}
            <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">
            ARPU: ${metrics.arpu}/mo
          </div>
        </CardFooter>
      </Card>

      {/* NRR */}
      <Card className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: KPI_COLORS.green.bg }}>
        <CardHeader>
          <CardDescription>Net Revenue Retention</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metrics.nrr}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="border-black/25 bg-white/60 text-foreground">
              <IconTrendingUp />
              +{(metrics.nrr - 100).toFixed(1)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Expansion driving growth <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Expansion MRR: +${metrics.expansionMrr.toLocaleString()}
          </div>
        </CardFooter>
      </Card>

      {/* Churn Rate */}
      <Card className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: KPI_COLORS.purple.bg }}>
        <CardHeader>
          <CardDescription>Monthly Churn Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metrics.churnRate}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="border-black/25 bg-white/60 text-foreground">
              {churnUp ? <IconTrendingUp /> : <IconTrendingDown />}
              {churnUp ? "+" : ""}
              {(metrics.churnRate - metrics.churnRatePrev).toFixed(1)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {churnUp ? "Churn accelerating — review at-risk" : "Churn stable"}{" "}
            {churnUp ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">
            Churned MRR: ${metrics.churnedMrr.toLocaleString()}
          </div>
        </CardFooter>
      </Card>
      </div>
    </>
  )
}
