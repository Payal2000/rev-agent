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

function formatMrr(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  return `$${(value / 1000).toFixed(1)}K`
}

export function SectionCards({ inner }: { inner?: boolean } = {}) {
  const churnUp = METRICS_SUMMARY.churnRate > METRICS_SUMMARY.churnRatePrev

  return (
    <div className={`grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 ${inner ? "px-4 pb-5 lg:px-5" : "px-4 lg:px-6"}`}>
      {/* MRR */}
      <Card className="@container/card rounded-2xl shadow-sm bg-[#fde8c4] border-0 dark:bg-white/5 dark:border-white/10">
        <CardHeader>
          <CardDescription>Monthly Recurring Revenue</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatMrr(METRICS_SUMMARY.mrr)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +{METRICS_SUMMARY.mrrDelta}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Up from {formatMrr(METRICS_SUMMARY.mrrPrev)} last month{" "}
            <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            ARR: {formatMrr(METRICS_SUMMARY.arr)}
          </div>
        </CardFooter>
      </Card>

      {/* Subscribers */}
      <Card className="@container/card rounded-2xl shadow-sm bg-[#dce4ff] border-0 dark:bg-white/5 dark:border-white/10">
        <CardHeader>
          <CardDescription>Active Subscribers</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {METRICS_SUMMARY.subscribers.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingDown />
              {METRICS_SUMMARY.subscribersDelta}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Net {Math.abs(METRICS_SUMMARY.subscribersDelta)} churned this month{" "}
            <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">
            ARPU: ${METRICS_SUMMARY.arpu}/mo
          </div>
        </CardFooter>
      </Card>

      {/* NRR */}
      <Card className="@container/card rounded-2xl shadow-sm bg-[#d4f0e4] border-0 dark:bg-white/5 dark:border-white/10">
        <CardHeader>
          <CardDescription>Net Revenue Retention</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {METRICS_SUMMARY.nrr}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +{(METRICS_SUMMARY.nrr - 100).toFixed(1)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Expansion driving growth <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Expansion MRR: +${METRICS_SUMMARY.expansionMrr.toLocaleString()}
          </div>
        </CardFooter>
      </Card>

      {/* Churn Rate */}
      <Card className="@container/card rounded-2xl shadow-sm bg-[#e8e4f4] border-0 dark:bg-white/5 dark:border-white/10">
        <CardHeader>
          <CardDescription>Monthly Churn Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {METRICS_SUMMARY.churnRate}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {churnUp ? <IconTrendingUp /> : <IconTrendingDown />}
              {churnUp ? "+" : ""}
              {(METRICS_SUMMARY.churnRate - METRICS_SUMMARY.churnRatePrev).toFixed(1)}%
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
            Churned MRR: ${METRICS_SUMMARY.churnedMrr.toLocaleString()}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
