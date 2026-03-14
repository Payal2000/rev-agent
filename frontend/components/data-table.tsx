"use client"

import * as React from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  IconMessageChatbot,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { KPI_COLORS } from "@/lib/kpi-colors"

function openNewChat(query: string) {
  const href = `/chat?new=1&q=${encodeURIComponent(query)}&run=${Date.now()}`
  window.location.assign(href)
}

export const schema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  tier: z.string(),
  mrr: z.number(),
  riskScore: z.number(),
  daysToChurn: z.number(),
  signals: z.union([z.string(), z.array(z.string())]),
})

type Account = z.infer<typeof schema>

function riskBadgeStyle(score: number) {
  if (score >= 85) return { bg: KPI_COLORS.red.bg, text: KPI_COLORS.red.text }
  if (score >= 70) return { bg: KPI_COLORS.orange.bg, text: KPI_COLORS.orange.text }
  if (score >= 55) return { bg: KPI_COLORS.yellow.bg, text: KPI_COLORS.yellow.text }
  return { bg: KPI_COLORS.blue.bg, text: KPI_COLORS.blue.text }
}

function riskLabel(score: number) {
  if (score >= 85) return "Critical"
  if (score >= 70) return "High"
  if (score >= 55) return "Medium"
  return "Low"
}

function tierColor(tier: string) {
  if (tier === "Enterprise") return KPI_COLORS.blue.text
  if (tier === "Growth") return KPI_COLORS.yellow.text
  return KPI_COLORS.green.text
}

function DragHandle({ id }: { id: UniqueIdentifier }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <IconGripVertical className="size-3 text-muted-foreground" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

const columns: ColumnDef<Account>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
  },
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Account",
    cell: ({ row }) => <TableCellViewer item={row.original} />,
    enableHiding: false,
  },
  {
    accessorKey: "tier",
    header: "Tier",
    cell: ({ row }) => (
      <span className="text-sm font-medium" style={{ color: tierColor(row.original.tier) }}>
        {row.original.tier}
      </span>
    ),
  },
  {
    accessorKey: "mrr",
    header: () => <div className="text-right">MRR</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        ${row.original.mrr.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "riskScore",
    header: "Risk",
    cell: ({ row }) => {
      const tone = riskBadgeStyle(row.original.riskScore)
      return (
        <Badge
          variant="outline"
          className="gap-1"
          style={{ background: tone.bg, color: tone.text, borderColor: `${tone.text}44` }}
        >
          <IconAlertTriangle className="size-3" />
          {row.original.riskScore} · {riskLabel(row.original.riskScore)}
        </Badge>
      )
    },
  },
  {
    accessorKey: "daysToChurn",
    header: "Est. Churn",
    cell: ({ row }) => {
      const d = row.original.daysToChurn
      const color = d <= 14 ? "text-red-400" : d <= 28 ? "text-amber-400" : "text-muted-foreground"
      return (
        <span className={`text-sm tabular-nums ${color}`}>
          {d}d
        </span>
      )
    },
  },
  {
    accessorKey: "signals",
    header: "Signals",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground line-clamp-1 max-w-[180px]">
        {Array.isArray(row.original.signals) ? row.original.signals.join(", ") : row.original.signals}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
          >
            <IconDotsVertical />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() =>
              openNewChat(
                `Investigate account risk: ${row.original.name} (${row.original.tier}). MRR $${row.original.mrr.toLocaleString()}, risk score ${row.original.riskScore}, estimated churn in ${row.original.daysToChurn} days. Signals: ${Array.isArray(row.original.signals) ? row.original.signals.join(", ") : row.original.signals}.`,
              )
            }
          >
            <IconMessageChatbot className="size-4 mr-2" />
            Ask AI about this
          </DropdownMenuItem>
          <DropdownMenuItem>View account</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Flag for review</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]

function DraggableRow({ row }: { row: Row<Account> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  })
  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )
}

export function DataTable({ data: initialData }: { data: Account[] }) {
  const [data, setData] = React.useState(() => initialData)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [activeTab, setActiveTab] = React.useState("all")
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })
  const [expanded, setExpanded] = React.useState(true)
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  React.useEffect(() => {
    setData(initialData)
  }, [initialData])

  const filteredByTab = React.useMemo(() => {
    if (activeTab === "enterprise") return data.filter((r) => r.tier === "Enterprise")
    if (activeTab === "growth") return data.filter((r) => r.tier === "Growth")
    if (activeTab === "starter") return data.filter((r) => r.tier === "Starter")
    return data
  }, [data, activeTab])

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => filteredByTab.map(({ id }) => id),
    [filteredByTab]
  )

  const table = useReactTable({
    data: filteredByTab,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      setData((prev) => {
        const oldIndex = prev.findIndex((r) => r.id === active.id)
        const newIndex = prev.findIndex((r) => r.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const enterpriseCount = data.filter((r) => r.tier === "Enterprise").length
  const growthCount = data.filter((r) => r.tier === "Growth").length
  const starterCount = data.filter((r) => r.tier === "Starter").length

  return (
    <div className="mx-4 lg:mx-6 rounded-2xl bg-white/65 backdrop-blur-sm dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm overflow-hidden">
      {/* Collapsible section header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 lg:px-6 py-4 bg-transparent border-none cursor-pointer"
        style={{ borderBottom: expanded ? "1px solid var(--border-subtle)" : "none" }}
      >
        <div style={{ textAlign: "left" }}>
          <p className="text-sm font-semibold text-foreground">At-Risk Accounts</p>
          <p className="text-xs text-muted-foreground">{data.length} accounts flagged · drag to reorder · filter by tier</p>
        </div>
        <span className="flex items-center justify-center size-6 rounded-full border bg-muted text-muted-foreground shrink-0">
          {expanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
        </span>
      </button>

    {expanded && (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6">
        <Label htmlFor="view-selector" className="sr-only">
          View
        </Label>
        <div className="flex min-w-0 flex-1 items-center">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger
              className="flex w-fit @4xl/main:hidden"
              size="sm"
              id="view-selector"
            >
              <SelectValue placeholder="Select a view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All At-Risk</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
            </SelectContent>
          </Select>
          <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
            <TabsTrigger value="all">
              All At-Risk <Badge variant="secondary">{data.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="enterprise">
              Enterprise <Badge variant="secondary">{enterpriseCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="growth">
              Growth <Badge variant="secondary">{growthCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="starter">
              Starter <Badge variant="secondary">{starterCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" && column.getCanHide()
                )
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TabsContent
        value={activeTab}
        className="relative flex flex-col gap-4 px-4 lg:px-6 pb-4"
      >
        <div className="overflow-x-auto">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No at-risk accounts in this tier.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} account(s) selected.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
    )}
    </div>
  )
}

function TableCellViewer({ item }: { item: Account }) {
  const isMobile = useIsMobile()

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="w-fit px-0 text-left text-foreground">
          {item.name}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle className="flex items-center gap-2">
            {item.name}
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                background: riskBadgeStyle(item.riskScore).bg,
                color: riskBadgeStyle(item.riskScore).text,
                borderColor: `${riskBadgeStyle(item.riskScore).text}44`,
              }}
            >
              {riskLabel(item.riskScore)} Risk
            </Badge>
          </DrawerTitle>
          <DrawerDescription>
            {item.tier} · ${item.mrr.toLocaleString()}/mo · Est. churn in {item.daysToChurn} days
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {/* Risk Score */}
          <div className="flex flex-col gap-2">
            <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs">Risk Score</p>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-300"
                  style={{ width: `${item.riskScore}%` }}
                />
              </div>
              <span className="tabular-nums font-semibold text-lg">{item.riskScore}</span>
            </div>
          </div>

          {/* Signals */}
          <div className="flex flex-col gap-2">
            <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs">Churn Signals</p>
            <div className="flex flex-wrap gap-1.5">
              {(Array.isArray(item.signals) ? item.signals : item.signals.split(",")).map((s: string) => (
                <Badge key={s.trim()} variant="secondary" className="text-xs">
                  {s.trim()}
                </Badge>
              ))}
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">MRR at Risk</p>
              <p className="font-semibold tabular-nums">${item.mrr.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Est. Days to Churn</p>
              <p className={`font-semibold tabular-nums ${item.daysToChurn <= 14 ? "text-red-400" : item.daysToChurn <= 28 ? "text-amber-400" : ""}`}>
                {item.daysToChurn} days
              </p>
            </div>
          </div>

          {/* Recommended action */}
          <div className="flex flex-col gap-2">
            <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs">Recommended Action</p>
            <p className="text-sm text-muted-foreground">
              {item.riskScore >= 85
                ? "Immediate executive outreach required. Schedule a business review within 48 hours."
                : item.riskScore >= 70
                ? "Assign CSM for proactive check-in. Address stated objections and review contract terms."
                : "Monitor usage trend. Set up automated re-engagement campaign."}
            </p>
          </div>
        </div>
        <DrawerFooter>
          <Button
            className="bg-[#18181b] hover:bg-[#27272a] text-white border-0"
            onClick={() =>
              openNewChat(
                `Investigate account risk: ${item.name} (${item.tier}). MRR $${item.mrr.toLocaleString()}, risk score ${item.riskScore}, estimated churn in ${item.daysToChurn} days. Signals: ${Array.isArray(item.signals) ? item.signals.join(", ") : item.signals}.`,
              )
            }
          >
            <IconMessageChatbot className="size-4 mr-2" />
            Ask AI about this account
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
