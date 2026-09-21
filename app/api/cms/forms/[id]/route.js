import { NextResponse } from "next/server";
import { requireCan, sameOriginOk, csrfError } from "../../../../../lib/api-auth";
import { ACTIONS } from "../../../../../lib/rbac";
import { recordAudit } from "../../../../../lib/access-db";
import { getFormById, updateForm, setFormStatus, deleteForm } from "../../../../../lib/cms-db";

// GET /api/cms/forms/[id] — full form (incl. schema) for the builder.
export async function GET(request, { params }) {
  const { error } = await requireCan(ACTIONS.MANAGE_FORMS);
  if (error) return error;
  const { id } = await params;
  const form = await getFormById(id);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  return NextResponse.json({ form });
}

// PATCH /api/cms/forms/[id] — update metadata/schema, or publish/unpublish via {status}.
export async function PATCH(request, { params }) {
  const { identity, error } = await requireCan(ACTIONS.MANAGE_FORMS);
  if (error) return error;
  if (!sameOriginOk(request)) return csrfError();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Status change (publish / unpublish) is handled separately from content edits.
  if (body.status !== undefined) {
    const result = await setFormStatus(id, body.status);
    if (!result.ok) return NextResponse.json({ error: result.errors.join(" ") }, { status: 400 });
    await recordAudit({
      actorEmail: identity.email,
      action: body.status === "published" ? "form.publish" : "form.unpublish",
      target: result.form.slug,
      detail: { version: result.form.version },
    });
    return NextResponse.json({ form: result.form });
  }

  const patch = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.category !== undefined) patch.category = body.category;
  if (body.schema !== undefined) patch.schema = body.schema;

  const result = await updateForm(id, patch);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" ") }, { status: 400 });
  await recordAudit({
    actorEmail: identity.email,
    action: "form.update",
    target: result.form.slug,
    detail: { fields: result.form.schema.length },
  });
  return NextResponse.json({ form: result.form });
}

// DELETE /api/cms/forms/[id] — delete a CMS form and its submissions (legacy forms are protected).
export async function DELETE(request, { params }) {
  const { identity, error } = await requireCan(ACTIONS.MANAGE_FORMS);
  if (error) return error;
  if (!sameOriginOk(request)) return csrfError();

  const { id } = await params;
  const existing = await getFormById(id);
  const result = await deleteForm(id);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" ") }, { status: 400 });
  await recordAudit({
    actorEmail: identity.email,
    action: "form.delete",
    target: existing?.slug || id,
  });
  return NextResponse.json({ success: true });
}
