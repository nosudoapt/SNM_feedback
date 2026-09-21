import { NextResponse } from "next/server";
import { requireCan, sameOriginOk, csrfError } from "../../../../lib/api-auth";
import { ACTIONS } from "../../../../lib/rbac";
import { recordAudit } from "../../../../lib/access-db";
import { listForms, createForm, countFormSubmissions } from "../../../../lib/cms-db";

// GET /api/cms/forms — list all forms (with submission counts) for the builder.
export async function GET() {
  const { error } = await requireCan(ACTIONS.MANAGE_FORMS);
  if (error) return error;
  const forms = await listForms();
  // Attach a submission count for CMS-native forms (legacy counts live in the
  // main dashboard, so we leave those null to avoid implying they're stored here).
  const withCounts = await Promise.all(
    forms.map(async (f) => ({
      ...f,
      submissionCount: f.managed === "legacy" ? null : await countFormSubmissions(f.slug),
    }))
  );
  return NextResponse.json({ forms: withCounts });
}

// POST /api/cms/forms — create a new draft form.
export async function POST(request) {
  const { identity, error } = await requireCan(ACTIONS.MANAGE_FORMS);
  if (error) return error;
  if (!sameOriginOk(request)) return csrfError();

  const body = await request.json().catch(() => null);
  const title = body?.title ? String(body.title).trim() : "";
  if (!title) return NextResponse.json({ error: "A form title is required" }, { status: 400 });

  const form = await createForm({
    title,
    description: body?.description ? String(body.description).trim() : "",
    category: body?.category ? String(body.category).trim() : "",
    createdBy: identity.email,
  });
  await recordAudit({
    actorEmail: identity.email,
    action: "form.create",
    target: form.slug,
    detail: { title: form.title },
  });
  return NextResponse.json({ form });
}
