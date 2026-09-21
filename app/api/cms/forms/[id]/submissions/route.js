import { NextResponse } from "next/server";
import { requireCan } from "../../../../../../lib/api-auth";
import { ACTIONS } from "../../../../../../lib/rbac";
import { getFormById, getFormSubmissionsPage } from "../../../../../../lib/cms-db";

// GET /api/cms/forms/[id]/submissions?page=&limit= — paginated responses for a
// CMS form, plus the form's field schema so the UI can render dynamic columns.
export async function GET(request, { params }) {
  const { error } = await requireCan(ACTIONS.VIEW_SUBMISSIONS);
  if (error) return error;

  const { id } = await params;
  const form = await getFormById(id);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (form.readOnly) {
    return NextResponse.json(
      { error: "This is a legacy form — view its responses from the main dashboard." },
      { status: 400 }
    );
  }

  const url = request.nextUrl.searchParams;
  const page = Number(url.get("page")) || 1;
  const limit = Number(url.get("limit")) || 20;
  const { rows, total } = await getFormSubmissionsPage(form.slug, { page, limit });

  return NextResponse.json({
    form: { id: form.id, slug: form.slug, title: form.title, schema: form.schema },
    rows,
    total,
    page,
    limit,
  });
}
