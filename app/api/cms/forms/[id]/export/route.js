import { NextResponse } from "next/server";
import { requireCan } from "../../../../../../lib/api-auth";
import { ACTIONS } from "../../../../../../lib/rbac";
import { getFormById, getAllFormSubmissions } from "../../../../../../lib/cms-db";

function csvCell(val) {
  if (val === null || val === undefined) return "";
  let str = Array.isArray(val) ? val.join(", ") : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCreatedAt(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// GET /api/cms/forms/[id]/export — CSV of all responses, columns driven by schema.
export async function GET(request, { params }) {
  const { error } = await requireCan(ACTIONS.EXPORT_SUBMISSIONS);
  if (error) return error;

  const { id } = await params;
  const form = await getFormById(id);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (form.readOnly) {
    return NextResponse.json({ error: "Export legacy forms from the main dashboard." }, { status: 400 });
  }

  const rows = await getAllFormSubmissions(form.slug);
  const schema = form.schema || [];
  const headers = ["ID", "Submitted At", ...schema.map((f) => f.label)];
  const lines = [headers.map(csvCell).join(",")];

  for (const row of rows) {
    const payload = row.payload || {};
    lines.push(
      [row.id, formatCreatedAt(row.created_at), ...schema.map((f) => payload[f.key])]
        .map(csvCell)
        .join(",")
    );
  }

  const csv = "﻿" + lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${form.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Export-Count": String(rows.length),
    },
  });
}
