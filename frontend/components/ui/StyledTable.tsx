import React from "react";

export interface StyledColumn<T> {
  label: string;
  render: (row: T, i: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
}

interface Props<T> {
  columns: StyledColumn<T>[];
  rows: T[];
  footer?: React.ReactNode;
  minWidth?: number;
}

export function StatusCell({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ color, fontWeight: 600, fontSize: 13 }}>{label}</span>
    </span>
  );
}

export function StyledTable<T>({ columns, rows, footer, minWidth = 500 }: Props<T>) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                style={{
                  textAlign: (col.align ?? "left") as React.CSSProperties["textAlign"],
                  width: col.width,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  background: "rgba(255,255,255,0.7)",
                  borderBottom: "none",
                  borderRadius: i === 0 ? "8px 0 0 8px" : i === columns.length - 1 ? "0 8px 8px 0" : undefined,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((col, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: (col.align ?? "left") as React.CSSProperties["textAlign"],
                    padding: "14px 16px",
                    fontSize: 14,
                    color: "var(--text-primary)",
                    borderBottom: ri < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    verticalAlign: "middle",
                  }}
                >
                  {col.render(row, ri)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          {footer}
        </div>
      )}
    </div>
  );
}
