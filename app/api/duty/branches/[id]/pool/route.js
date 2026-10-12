import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../lib/auth";
import { getBranchLocalPool, addToBranchPool } from "../../../../../../lib/duty-db";

export async function GET(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const rows = await getBranchLocalPool(id);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("Branch pool list error:", err);
    return NextResponse.json({ error: "Failed to load pool" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    if (!body || !body.pracharakId) {
      return NextResponse.json({ error: "Pracharak ID is required" }, { status: 400 });
    }
    const result = await addToBranchPool({
      branchId: id,
      pracharakId: String(body.pracharakId).trim(),
      priority: typeof body.priority === "number" ? body.priority : 0,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err.message || "Add to pool failed";
    const status = msg.includes("not found") ? 404 : msg.includes("already") ? 409 : 500;
    console.error("Branch pool add error:", err);
    return NextResponse.json({ error: msg }, { status });
  }
}
