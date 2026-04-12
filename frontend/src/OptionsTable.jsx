import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";
import { useState } from "react";

const COLUMNS = [
  { accessorKey: "strike",        header: "Strike" },
  { accessorKey: "type",          header: "Type" },
  { accessorKey: "expiration",    header: "Expiry" },
  { accessorKey: "bid",           header: "Bid" },
  { accessorKey: "ask",           header: "Ask" },
  { accessorKey: "volume",        header: "Volume" },
  { accessorKey: "open_interest", header: "OI" },
  { accessorKey: "iv",            header: "IV" },
  { accessorKey: "delta",         header: "Δ Delta" },
  { accessorKey: "gamma",         header: "Γ Gamma" },
  { accessorKey: "theta",         header: "Θ Theta" },
  { accessorKey: "vega",          header: "V Vega" },
];

export default function OptionsTable({ contracts }) {
  const [sorting, setSorting] = useState([]);

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
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
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
                    color: "#00d4aa",
                    textAlign: "right",
                    whiteSpace: "nowrap"
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
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              style={{ background: i % 2 === 0 ? "#111" : "#151515" }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{
                    padding: "0.4rem 0.8rem",
                    border: "1px solid #222",
                    textAlign: "right",
                    color: cell.column.id === "type"
                      ? (cell.getValue() === "call" ? "#00d4aa" : "#ff6b6b")
                      : "#ddd"
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}