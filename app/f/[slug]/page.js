import { getPublishedCmsFormBySlug } from "../../../lib/cms-db";
import PublicForm from "./PublicForm";

// Public dynamic form page: /f/[slug]. Server component loads the published
// schema (returns null for drafts/legacy/unknown) and hands it to the client
// renderer. This route is deliberately NOT matched by middleware, so it's public.
export default async function PublicFormPage({ params }) {
  const { slug } = await params;
  let form = null;
  try {
    form = await getPublishedCmsFormBySlug(slug);
  } catch {
    form = null;
  }

  if (!form) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ margin: "0 0 8px", color: "#3d556e", fontFamily: '"Space Grotesk", sans-serif' }}>
            Form not available
          </h1>
          <p style={{ margin: 0, color: "#7d93aa" }}>
            This form doesn&apos;t exist or isn&apos;t currently published.
          </p>
        </div>
      </div>
    );
  }

  return <PublicForm slug={form.slug} title={form.title} description={form.description} fields={form.schema} />;
}

const wrap = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  fontFamily: '"Inter", system-ui, sans-serif',
  padding: 16,
};
const card = {
  background: "rgba(255,255,255,0.9)",
  border: "1px solid #d9e5f1",
  borderRadius: 24,
  padding: "36px 30px",
  width: "min(440px, 100%)",
  textAlign: "center",
};
