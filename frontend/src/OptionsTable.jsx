import {
  useReactTable, getCoreRowModel,
  getSortedRowModel, flexRender,
} from "@tanstack/react-table";
import { useState } from "react";

const COLUMNS = [
  { accessorKey: "strike",        header: "Strike",   sortingFn: "basic" },
  { accessorKey: "type",          header: "Type" },
  { accessorKey: "expiration",    header: "Expiry" },
  { accessorKey: "bid",           header: "Bid",      sortingFn: "basic" },
  { accessorKey: "ask",           header: "Ask",      sortingFn: "basic" },
  { accessorKey: "volume",        header: "Volume",   sortingFn: "basic" },
  { accessorKey: "open_interest", header: "OI",       sortingFn: "basic" },
  { accessorKey: "iv",            header: "IV",       sortingFn: "basic" },
  { accessorKey: "delta",         header: "Δ Delta",  sortingFn: "basic" },
  { accessorKey: "gamma",         header: "Γ Gamma",  sortingFn: "basic" },
  { accessorKey: "theta",         header: "Θ Theta",  sortingFn: "basic" },
  { accessorKey: "vega",          header: "V Vega",   sortingFn: "basic" },
];

export default function OptionsTable({ contracts, spotPrice = 0 }) {
  const [sorting, setSorting] = useState([]);

  const table = useReactTable({
    data: contracts,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Find the row closest to spot price to highlight as ATM
  const atmStrike = contracts.reduce((closest, c) => {
    return Math.abs(c.strike - spotPrice) < Math.abs(closest - spotPrice)
      ? c.strike : closest;
  }, contracts[0]?.strike ?? 0);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => (
                <th key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{
                    padding: "0.6rem 0.8rem", background: "#1a1a1a",
                    border: "1px solid #333", cursor: "pointer",
                    userSelect: "none", color: "#00d4aa",
                    textAlign: "right", whiteSpace: "nowrap"
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === "asc" ? " ↑"
                    : header.column.getIsSorted() === "desc" ? " ↓" : " ↕"}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => {
            const isATM = row.original.strike === atmStrike;
            return (
              <tr key={row.id} style={{
                background: isATM ? "#1a2a1a"
                  : i % 2 === 0 ? "#111" : "#151515",
                borderLeft: isATM ? "3px solid #00d4aa" : "3px solid transparent"
              }}>
                {row.getVisibleCells().map(cell => {
                  const colId = cell.column.id;
                  const val = cell.getValue();
                  let color = "#ddd";
                  if (colId === "type") color = val === "call" ? "#00d4aa" : "#ff6b6b";
                  if (colId === "delta") color = "#a78bfa";
                  if (colId === "gamma") color = "#60a5fa";
                  if (colId === "theta") color = "#f87171";
                  if (colId === "vega")  color = "#34d399";
                  if (isATM && colId === "strike") color = "#00d4aa";
                  return (
                    <td key={cell.id} style={{
                      padding: "0.4rem 0.8rem", border: "1px solid #222",
                      textAlign: "right", color
                    }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}