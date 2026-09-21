import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../lib/auth";
import { getListWithAssignments, recordDutyExportRun, getAllActiveBranches } from "../../../../../../lib/duty-db";
import { buildDutySheets, buildBranchSchedule, monthLabel } from "../../../../../../lib/duty-export";
import { buildXlsx } from "../../../../../../lib/xlsx-writer";

// GET /api/duty/lists/[id]/export — download the 4-sheet Excel workbook
// (By Location, By Pracharak, Summary, Branch Schedule) for a list.
export async function GET(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const data = await getListWithAssignments(id);
    if (!data) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const branches = await getAllActiveBranches();
    const sheets = buildDutySheets(data);
    const branchSheet = buildBranchSchedule({ ...data, branches });
    const allSheets = [...sheets, branchSheet];
    const buffer = buildXlsx(allSheets);

    const rowCount = (data.assignments || []).length;
    try {
      await recordDutyExportRun("workbook", id, rowCount);
    } catch (e) {
      // A failed audit-log write must not block the download.
      console.error("recordDutyExportRun failed:", e.message);
    }

    const safeMonth = monthLabel(data.list.month, data.list.year).replace(/\s+/g, "-");
    const filename = `duty-${safeMonth}-v${data.list.version}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Duty list export error:", err);
    return NextResponse.json({ error: "Export failed: " + err.message }, { status: 500 });
  }
}
