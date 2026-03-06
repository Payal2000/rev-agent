import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"

import data from "./data.json"

export default function Page() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-5 md:py-6">
      {/* Welcome header + KPI metric cards — one container */}
      <div className="mx-4 lg:mx-6 rounded-2xl bg-[#fcfcfd] border-[3px] border-white shadow-sm">
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Hello, Payal 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor revenue performance and AI insights in real time.</p>
        </div>
        <SectionCards inner />
      </div>

      {/* MRR chart */}
      <div className="mx-4 lg:mx-6">
        <ChartAreaInteractive />
      </div>

      {/* At-risk accounts table */}
      <DataTable data={data} />
    </div>
  )
}
