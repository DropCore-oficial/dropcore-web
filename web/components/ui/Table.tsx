"use client";

import { cn } from "@/lib/utils";

export type TableProps = {
  children: React.ReactNode;
  className?: string;
};

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)]">
      <table
        className={cn(
          "w-full border-collapse text-sm",
          className
        )}
      >
        {children}
      </table>
    </div>
  );
}

export type TableHeaderProps = {
  children: React.ReactNode;
  className?: string;
};

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <thead>
      <tr className={cn("border-b border-[var(--border-subtle)] bg-[var(--background)]/50", className)}>
        {children}
      </tr>
    </thead>
  );
}

export type TableBodyProps = {
  children: React.ReactNode;
  className?: string;
};

export function TableBody({ children, className }: TableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

export type TableRowProps = {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
};

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--table-row-border)] last:border-b-0 transition-colors duration-150",
        "hover:bg-[var(--background)]/30",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export type TableHeadProps = {
  children: React.ReactNode;
  className?: string;
};

export function TableHead({ children, className }: TableHeadProps) {
  return (
    <th
      className={cn(
        "px-6 py-4 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider",
        className
      )}
    >
      {children}
    </th>
  );
}

export type TableCellProps = {
  children: React.ReactNode;
  className?: string;
};

export function TableCell({ children, className }: TableCellProps) {
  return (
    <td
      className={cn(
        "px-6 py-4 text-[var(--foreground)] text-sm",
        className
      )}
    >
      {children}
    </td>
  );
}
