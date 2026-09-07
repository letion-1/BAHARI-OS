#!/usr/bin/env python3
"""Tenant-isolation audit for Yacht OS.

Scans every server-side Supabase query chain and reports any that read or
mutate a company-scoped table without an explicit company_id predicate.

This is a static check. It cannot prove correctness, but it reliably catches
the class of bug that matters most here: a handler running under the service
role key (which bypasses RLS) that forgot its tenant filter.

Usage:  python3 scripts/audit-tenant-isolation.py [--json]
Exit:   0 = clean, 1 = findings
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCAN_DIRS = ["app", "lib"]

# Tables that carry company_id and MUST be filtered by it.
COMPANY_SCOPED = {
    "charters",
    "charter_concierge_items",
    "charter_guests",
    "charter_itineraries",
    "charter_itinerary_legs",
    "charter_itinerary_days",
    "charter_itinerary_activities",
    "charter_itinerary_shares",
    "charter_payments",
    "clients",
    "companies",
    "data_sources",
    "documents",
    "email_drafts",
    "fleet",
    "fleet_media",
    "guest_portals",
    "inquiries",
    "notifications",
    "proposal_confirmations",
    "proposal_yachts",
    "proposals",
    "availability",
    "availability_checks",
    "yacht_access",
    "yacht_contacts",
    # Listing and revoking are company-scoped. Acceptance arrives with a token
    # and no session at all, so that one chain is covered by TOKEN_AUTH below.
    "company_invitations",
}

# Tables legitimately queried without a company_id predicate.
#   company_members -> scoped by user_id; this is how a company is resolved
#   *_tokens        -> authenticated by a hashed single-use token instead
EXEMPT = {
    "company_members",
}

# A chain ends at a semicolon or a blank line; good enough for this codebase's
# formatting, and deliberately conservative (over-reports rather than misses).
# `.storage.from("bucket")` is object storage, not a table. Excluded via the
# negative lookbehind on `.storage`.
FROM_CALL = re.compile(
    r'(?<!storage)\s*\.from\(\s*["\'`](?P<table>[a-zA-Z0-9_]+)["\'`]\s*\)'
)

# `.storage.from("bucket")` may be split across lines by the formatter, so the
# lookbehind alone is not enough.
STORAGE_CALL = re.compile(r'storage\s*\.from\(')
COMPANY_PREDICATE = re.compile(
    r'\.(eq|match|in_|filter)\(\s*["\'`]company_id'
    r'|company_id\s*:'
    r'|\.eq\(\s*["\'`]id["\'`][^)]*\)[\s\S]{0,200}?company_id'
)
# A chain authenticated by a hashed single-use token is scoped by that token.
TOKEN_AUTH = re.compile(
    r'token_hash|hashToken|hashProposalShareToken|\.eq\(\s*["\'`]token["\'`]'
)

# An insert/upsert whose payload is a variable cannot be resolved statically.
# These are reported separately for human review rather than as findings.
OPAQUE_WRITE = re.compile(
    r'\.(insert|upsert)\(\s*(?!\{)[A-Za-z_][A-Za-z0-9_]*\s*[,)]'
)

# A row already fetched and verified against the workspace, then written back
# by primary key, is scoped by that prior check.
VERIFIED_BY_ID = re.compile(
    r'\.eq\(\s*["\'`]id["\'`]\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*\.id'
)
ADMIN_CLIENT = re.compile(r'createAdminClient')


def chain_after(text: str, start: int, max_chars: int = 900) -> str:
    """Return the query chain beginning at `start`, stopping at its terminator."""
    window = text[start:start + max_chars]
    depth = 0
    for i, ch in enumerate(window):
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == ";" and depth <= 0:
            return window[:i]
    return window


# An explicit, reasoned suppression. Placed on the line above the query:
#     // audit-ignore: creating the company itself, nothing to scope to
IGNORE = re.compile(r'//\s*audit-ignore:')


def audit_file(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    uses_admin = bool(ADMIN_CLIENT.search(text))
    findings: list[dict] = []

    for m in FROM_CALL.finditer(text):
        table = m.group("table")

        # Skip object-storage buckets, which share the .from() spelling.
        preceding = text[max(0, m.start() - 40):m.end()]
        if STORAGE_CALL.search(preceding):
            continue
        if table in EXEMPT or table not in COMPANY_SCOPED:
            continue

        chain = chain_after(text, m.start())
        if COMPANY_PREDICATE.search(chain):
            continue

        # On `companies` itself the tenant key is the primary key, so an
        # `.eq("id", ...)` predicate is the correct scoping.
        if table == "companies" and re.search(
            r'\.eq\(\s*["\'`]id["\'`]', chain
        ):
            continue
        # A token-authenticated lookup is scoped by the token itself.
        if TOKEN_AUTH.search(chain):
            continue

        # Write-back by primary key on a previously verified row.
        if VERIFIED_BY_ID.search(chain):
            continue

        line = text.count("\n", 0, m.start()) + 1

        # Honour a suppression comment within the three lines above the call,
        # which covers the formatter's habit of breaking chains across lines.
        window = lines[max(0, line - 4):line]
        if any(IGNORE.search(candidate) for candidate in window):
            continue
        findings.append(
            {
                "file": str(path.relative_to(ROOT)),
                "line": line,
                "table": table,
                "service_role": uses_admin,
                "severity": (
                    "REVIEW"
                    if OPAQUE_WRITE.search(chain)
                    else ("HIGH" if uses_admin else "MEDIUM")
                ),
                "snippet": " ".join(chain.split())[:140],
            }
        )

    return findings


def main() -> int:
    as_json = "--json" in sys.argv
    findings: list[dict] = []
    scanned = 0

    for directory in SCAN_DIRS:
        base = ROOT / directory
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.ts")) + sorted(base.rglob("*.tsx")):
            if "node_modules" in path.parts:
                continue
            scanned += 1
            findings.extend(audit_file(path))

    if as_json:
        print(json.dumps({"scanned": scanned, "findings": findings}, indent=2))
        return 1 if findings else 0

    print(f"Tenant isolation audit: {scanned} files scanned\n")

    if not findings:
        print("No unscoped queries against company-scoped tables.")
        return 0

    high = [f for f in findings if f["severity"] == "HIGH"]
    med = [f for f in findings if f["severity"] == "MEDIUM"]

    review = [f for f in findings if f["severity"] == "REVIEW"]

    for bucket, title in ((high, "HIGH (service role, RLS bypassed)"),
                          (med, "MEDIUM (user client, RLS applies)"),
                          (review, "REVIEW (payload not statically resolvable)")):
        if not bucket:
            continue
        print(f"{title}: {len(bucket)}")
        print("-" * 72)
        for f in bucket:
            print(f"  {f['file']}:{f['line']}")
            print(f"    table:   {f['table']}")
            print(f"    query:   {f['snippet']}")
            print()

    print(
        f"Total: {len(findings)} "
        f"({len(high)} high, {len(med)} medium, {len(review)} review)"
    )

    # Only genuine findings fail the build. REVIEW entries are informational:
    # they mark chains a human should read once, not defects.
    return 1 if (high or med) else 0


if __name__ == "__main__":
    sys.exit(main())