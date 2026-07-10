import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";
import { useState } from "react";

function formatNotional(value) {
  if (!value) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const COLUMNS = [
  { accessorKey: "strike", header: "Strike", sortingFn: "basic" },
  { accessorKey: "type", header: "Type" },
  { accessorKey: "dte", header: "DTE", sortingFn: "basic" },
  { accessorKey: "volume", header: "Volume", sortingFn: "basic" },
  { accessorKey: "open_interest", header: "OI", sortingFn: "basic" },
  { accessorKey: "volume_oi_ratio", header: "Vol/OI", sortingFn: "basic" },
  { accessorKey: "volume_zscore", header: "Z-Score", sortingFn: "basic" },
  {
    accessorKey: "notional_value",
    header: "Notional $",
    sortingFn: "basic",
    cell: (info) => formatNotional(info.getValue()),
  },
  { accessorKey: "uoa_score", header: "UOA Score", sortingFn: "basic" },
];

export default function UOATable({ contracts }) {
  const [sorting, setSorting] = useState([{ id: "uoa_score", desc: true }]);

  const table = useReactTable({
    data: contracts,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontSize: "0.85rem",
        }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{
                    padding: "0.6rem 0.8rem",
                    background: "#1a1a1a",
                    border: "1px solid #333",
                    cursor: "pointer",
                    userSelect: "none",
                    color: "#f59e0b",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {header.column.getIsSorted() === "asc"
                    ? " ↑"
                    : header.column.getIsSorted() === "desc"
                      ? " ↓"
                      : " ↕"}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              style={{ background: i % 2 === 0 ? "#111" : "#151515" }}
            >
              {row.getVisibleCells().map((cell) => {
                const colId = cell.column.id;
                const val = cell.getValue();
                let color = "#ddd";
                if (colId === "type")
                  color = val === "call" ? "#00d4aa" : "#ff6b6b";
                if (colId === "uoa_score") color = "#f59e0b";
                return (
                  <td
                    key={cell.id}
                    style={{
                      padding: "0.4rem 0.8rem",
                      border: "1px solid #222",
                      textAlign: "right",
                      color,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
