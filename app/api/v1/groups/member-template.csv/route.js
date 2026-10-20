import { TEMPLATE_CSV } from "@/lib/members";

/** GET /api/v1/groups/member-template.csv: a starting point for a membership list. */
export function GET() {
  return new Response(`﻿${TEMPLATE_CSV}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="adc-membership-template.csv"' },
  });
}
