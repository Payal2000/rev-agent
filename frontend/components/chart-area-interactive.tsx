"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { MRR_TREND } from "@/lib/mock-data"

export const description = "MRR growth components over time"

const chartConfig = {
  new: {
    label: "New MRR",
    color: "var(--chart-1)",
  },
  expansion: {
    label: "Expansion MRR",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

function formatK(value: number) {
  return `$${(value / 1000).toFixed(0)}K`
}

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("12m")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("3m")
    }
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    if (timeRange === "3m") return MRR_TREND.slice(-3)
    if (timeRange === "6m") return MRR_TREND.slice(-6)
    return MRR_TREND
  }, [timeRange])

  return (
    <Card className="@container/card bg-[#fcfcfd] dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl">
      <CardHeader>
        <CardTitle>MRR Growth Components</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            New MRR and Expansion MRR — Feb 2025 to Jan 2026
          </span>
          <span className="@[540px]/card:hidden">New &amp; Expansion MRR</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="3m">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="6m">Last 6 months</ToggleGroupItem>
            <ToggleGroupItem value="12m">Full year</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-36 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Full year" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="3m" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="6m" className="rounded-lg">
                Last 6 months
              </SelectItem>
              <SelectItem value="12m" className="rounded-lg">
                Full year
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillNew" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-new)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-new)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillExpansion" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-expansion)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-expansion)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={formatK}
              width={48}
              tickMargin={4}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => `${value} 2025`}
                  formatter={(value, name) => [
                    `$${Number(value).toLocaleString()}`,
                    name === "new" ? "New MRR" : "Expansion MRR",
                  ]}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="expansion"
              type="natural"
              fill="url(#fillExpansion)"
              stroke="var(--color-expansion)"
              stackId="a"
            />
            <Area
              dataKey="new"
              type="natural"
              fill="url(#fillNew)"
              stroke="var(--color-new)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
