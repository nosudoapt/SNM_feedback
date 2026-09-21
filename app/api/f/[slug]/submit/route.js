import { NextResponse } from "next/server";
import { getPublishedCmsFormBySlug, createFormSubmission } from "../../../../../lib/cms-db";
import { validateSubmission } from "../../../../../lib/form-schema";

// Public submit endpoint for dynamic CMS forms: POST /api/f/[slug]/submit
// Intentionally separate from /api/submissions (the 3 legacy forms) so nothing
// about the existing pipeline changes. Server-side validates against the form's
// published schema and stores only known, coerced values.
export async function POST(request, { params }) {
  try {
    const { slug } = await params;
    const form = await getPublishedCmsFormBySlug(slug);
    if (!form) {
      return NextResponse.json({ error: "This form is not available." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    }

    const { ok, errors, cleaned } = validateSubmission(form.schema, body.values || body);
    if (!ok) {
      return NextResponse.json({ error: "Please fix the highlighted fields.", fields: errors }, { status: 400 });
    }

    const result = await createFormSubmission(slug, cleaned);
    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    console.error("CMS submit error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
