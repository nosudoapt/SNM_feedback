import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../lib/auth";
import { getSubmissions, recordExportRun } from "../../../lib/db";

const PRACHARAK_COLUMNS = [
  { question: "Age group(s) participated", keys: ["mahilaAge", "balAge", "emsAge"] },
  { question: "Where was the Satsang arranged?", keys: ["mahilaLocation", "balLocation", "emsLocation"] },
  { question: "How many Saints were present?", keys: ["mahilaSaints", "balSaints", "emsSaints"] },
  { question: "Ratio - Geet", keys: ["mahilaRatioGeet", "balRatioGeet", "emsRatioGeet"] },
  { question: "Ratio - Vichar", keys: ["mahilaRatioVichar", "balRatioVichar", "emsRatioVichar"] },
  { question: "Ratio - Skit", keys: ["mahilaRatioSkit", "balRatioSkit", "emsRatioSkit"] },
  { question: "Ratio - Dance", keys: ["mahilaRatioDance", "balRatioDance", "emsRatioDance"] },
  { question: "Ratio - Kavita", keys: ["mahilaRatioKavita", "balRatioKavita", "emsRatioKavita"] },
  { question: "Were speakers able to convey the message effectively?", keys: ["mahilaSpeaker", "balSpeaker", "emsSpeaker"] },
  { question: "If other, please share more elaborately ji", keys: ["mahilaSpeakerReason", "balSpeakerReason", "emsSpeakerReason"] },
  { question: "How many saints performed Manch Sanchalan sewa?", keys: ["mahilaAnchoring", "balAnchoring", "emsAnchoring"] },
  { question: "Time allotted for discourse", keys: ["mahilaTime", "balTime", "emsTime"] },
  { question: "Actual time (min)", keys: ["mahilaActualTime", "balActualTime", "emsActualTime"] },
  { question: "Did the Samagam start and conclude on schedule?", keys: ["mahilaSchedule", "balSchedule", "emsSchedule"] },
  { question: "If no, reason", keys: ["mahilaScheduleReason", "balScheduleReason", "emsScheduleReason"] },
  { question: "Language(s) used", keys: ["emsLanguage"] },
  { question: "Feedback", keys: ["mahilaFeedback", "balFeedback", "emsFeedback"] },
];

const BRANCH_INCHARGE_COLUMNS = [
  { question: "Pracharak Mahatma name", keys: ["pracharakName"] },
  { question: "Arrival Time of Pracharak Saint", keys: ["arrivalTime"] },
  { question: "If late, at what time did they arrive?", keys: ["arrivalTimeActual"] },
  { question: "Content of Pracharak Saint", keys: ["content"] },
  { question: "How was the conduct of Pracharak Saint?", keys: ["conduct"] },
  { question: "Other - scope of improvements", keys: ["improvements"] },
];

const FORM_TYPES = {
  all: {
    label: "All types",
    categories: null,
    columns: [
      ...PRACHARAK_COLUMNS.filter(
        (col) => !BRANCH_INCHARGE_COLUMNS.some((b) => b.question === col.question)
      ),
      ...BRANCH_INCHARGE_COLUMNS,
    ],
  },
  "pracharak-mahatma": {
    label: "Pracharak Mahatma",
    categories: ["mahila", "bal", "ems"],
    columns: PRACHARAK_COLUMNS,
  },
  "branch-incharge": {
    label: "Branch Incharge",
    categories: ["branch-incharge"],
    columns: BRANCH_INCHARGE_COLUMNS,
  },
};

const VALUE_MAP = {
  yes: "Yes",
  no: "No",
  other: "Other",
  indoor: "Indoor",
  outdoor: "Outdoor",
  "only-youth": "Only Youth",
  "only-kids": "Only Kids",
  "youth-kids": "Youth and Kids",
  "youth-adults": "Youth and Adults",
  mixed: "Mixed",
  lt25: "Less than 25 min",
  hindi: "Hindi",
  english: "English",
  "30": "30 min",
  "25": "25 min",
  general: "General",
  special: "Special",
  mahila: "Mahila Samagam",
  bal: "Bal Samagam",
  ems: "EMS - English Medium Samagam",
  "branch-incharge": "Branch Incharge",
  "on-time": "On time",
  late: "Late",
  excellent: "Excellent",
  "very-good": "Very Good",
  good: "Good",
  average: "Average",
  poor: "Poor",
};

function presentableValue(value) {
  if (value === null || value === undefined) return "";
  const key = String(value).trim();
  return VALUE_MAP[key] !== undefined ? VALUE_MAP[key] : String(value);
}

function formatCreatedAt(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function valueToCsv(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function payloadValue(payload, keys) {
  for (const key of keys) {
    if (payload && payload[key] !== undefined && payload[key] !== null && String(payload[key]) !== "") {
      return presentableValue(payload[key]);
    }
  }
  return "";
}

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "all";
    const type = searchParams.get("type") || "all";

    const formType = FORM_TYPES[type] || FORM_TYPES.all;
    const rows = await getSubmissions(range, formType.categories);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No submissions found" }, { status: 404 });
    }

    const headers = [
      "ID", "Created At", "Name", "Phone",
      "Zone No", "Zone Name", "Zone Type",
      "Sector No", "Sector Name",
      "Zonal Incharge", "Sector Incharge",
      "Category",
      ...formType.columns.map((col) => col.question),
    ];

    const csvLines = [headers.map(valueToCsv).join(",")];

    for (const row of rows) {
      const payload = row.payload || {};
      csvLines.push([
        row.id,
        formatCreatedAt(row.created_at),
        row.name,
        row.phone,
        row.zone_no,
        row.zone_name,
        presentableValue(row.zone_type),
        row.sector_no,
        row.sector_name,
        row.zonal_incharge_name,
        row.sector_incharge_name,
        presentableValue(row.category),
        ...formType.columns.map((col) => payloadValue(payload, col.keys)),
      ].map(valueToCsv).join(","));
    }

    await recordExportRun(range, rows.length);

    const csvContent = "\uFEFF" + csvLines.join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="submissions-${type}-${range}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "X-Export-Count": String(rows.length),
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
