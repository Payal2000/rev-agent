"""SQL safety checking, read-only execution, and tenant-scoped querying."""
import hashlib
import logging
import re
from typing import Any

import sqlglot
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from data.database import get_readonly_session

logger = logging.getLogger(__name__)

# SQL operations that can modify data — never allowed from agents
BLOCKED_STATEMENT_TYPES = {
    sqlglot.exp.Insert, sqlglot.exp.Update, sqlglot.exp.Delete,
    sqlglot.exp.Drop, sqlglot.exp.Alter, sqlglot.exp.Create,
    sqlglot.exp.Grant, sqlglot.exp.Revoke, sqlglot.exp.TruncateTable,
    sqlglot.exp.Transaction, sqlglot.exp.Commit, sqlglot.exp.Rollback,
}

BLOCKED_PATTERNS = [
    r"--",                              # SQL comments (injection vector)
    r"/\*.*?\*/",                       # block comments
    r";\s*\w",                          # statement chaining
    r"\bxp_\w+",                        # SQL Server stored procs
    r"\bEXEC\s*\(",                     # execute
    r"\bCAST\s*\(.*?AS\s+TEXT\)",       # casting to bypass type checks
    r"\bPG_SLEEP\b",                    # timing attacks
    r"\bCOPY\b",                        # file system access
    r"\bPG_READ_FILE\b",
    r"\bLO_IMPORT\b",
    r"\bLO_EXPORT\b",
]


class SQLSafetyError(Exception):
    pass


def check_sql_safety(sql: str, tenant_id: str) -> tuple[bool, str]:
    """
    Returns (is_safe, reason).
    Raises SQLSafetyError if SQL is dangerous.
    """
    sql_stripped = sql.strip()

    # 1. Check for injection patterns
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, sql_stripped, re.IGNORECASE | re.DOTALL):
            return False, f"Blocked pattern detected: {pattern}"

    # 2. Parse with sqlglot and check statement types
    try:
        parsed = sqlglot.parse(sql_stripped, dialect="postgres")
    except Exception as e:
        return False, f"SQL parse error: {e}"

    if not parsed:
        return False, "Empty or unparseable SQL"

    for statement in parsed:
        if statement is None:
            continue
        for blocked_type in BLOCKED_STATEMENT_TYPES:
            if isinstance(statement, blocked_type):
                return False, f"Blocked statement type: {type(statement).__name__}"

    # 3. Verify tenant isolation — must reference company_id
    if "company_id" not in sql_stripped.lower():
        return False, "SQL must include company_id filter for tenant isolation"

    return True, "OK"


def inject_tenant_filter(sql: str, tenant_id: str) -> str:
    """
    Adds tenant context — the RLS policy handles enforcement,
    but we also annotate the SQL for audit purposes.
    """
    return sql  # RLS handles isolation at DB level


async def execute_safe_sql(
    sql: str,
    tenant_id: str,
    params: dict | None = None,
    max_rows: int = 1000,
) -> dict[str, Any]:
    """
    Safety-check and execute SQL against the read-only connection.
    Returns: {columns, rows, row_count, sql_hash}
    """
    is_safe, reason = check_sql_safety(sql, tenant_id)
    if not is_safe:
        raise SQLSafetyError(f"SQL safety check failed: {reason}")

    sql_hash = hashlib.sha256(sql.encode()).hexdigest()[:16]

    async with get_readonly_session() as session:
        # Set tenant context for RLS
        await session.execute(
            text("SELECT set_config('app.current_tenant', :tenant_id, true)"),
            {"tenant_id": tenant_id}
        )

        result = await session.execute(text(sql), params or {})
        rows = result.fetchmany(max_rows)
        columns = list(result.keys())

        return {
            "columns": columns,
            "rows": [dict(zip(columns, row)) for row in rows],
            "row_count": len(rows),
            "truncated": len(rows) == max_rows,
            "sql_hash": sql_hash,
        }


def _clean_cell(value) -> str:
    """Format a cell value for readable display."""
    if value is None:
        return "—"
    # datetime-like objects
    if hasattr(value, "strftime"):
        return value.strftime("%-m/%-d/%Y")
    s = str(value)
    # ISO datetime strings: 2026-03-09 00:00:00+00:00 → Mar 9, 2026
    import re
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})[ T]", s)
    if m:
        from datetime import datetime
        try:
            dt = datetime.strptime(f"{m.group(1)}-{m.group(2)}-{m.group(3)}", "%Y-%m-%d")
            return dt.strftime("%b %-d, %Y")
        except ValueError:
            pass
    # Large numbers → add commas
    try:
        f = float(s)
        if f == int(f) and abs(f) < 1e12:
            return f"{int(f):,}"
        # currency-like (decimal)
        if abs(f) >= 100:
            return f"{f:,.2f}"
    except (ValueError, OverflowError):
        pass
    return s


def _pretty_header(col: str) -> str:
    """Convert snake_case column name to Title Case label."""
    return col.replace("_", " ").title()


def format_results_for_llm(query_result: dict) -> str:
    """Format SQL results as a proper markdown table with clean values."""
    if not query_result["rows"]:
        return "Query returned no results."

    columns = query_result["columns"]
    rows = query_result["rows"]
    row_count = query_result["row_count"]
    display_rows = rows[:15]  # cap display at 15 rows

    headers = [_pretty_header(c) for c in columns]

    # Build cell strings
    cell_matrix = [
        [_clean_cell(row.get(col)) for col in columns]
        for row in display_rows
    ]

    # Compute column widths
    widths = [max(len(h), max((len(r[i]) for r in cell_matrix), default=0)) for i, h in enumerate(headers)]

    def row_line(cells):
        return "| " + " | ".join(c.ljust(widths[i]) for i, c in enumerate(cells)) + " |"

    sep = "| " + " | ".join("-" * w for w in widths) + " |"

    lines = [
        f"**{row_count} result{'s' if row_count != 1 else ''}**\n",
        row_line(headers),
        sep,
    ]
    for cells in cell_matrix:
        lines.append(row_line(cells))

    if row_count > 15:
        lines.append(f"\n_…and {row_count - 15} more rows_")

    return "\n".join(lines)
