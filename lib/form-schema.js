// lib/form-schema.js
// Pure, framework-free helpers for the Form CMS: slug/key normalization,
// validation of a form's field definitions (used when saving/publishing), and
// validation of a public submission against those field definitions (used by the
// public submit endpoint). No next/headers or DB imports, so this is unit-testable
// with `node --test`.

export const FIELD_TYPES = [
  "text",
  "textarea",
  "tel",
  "email",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
];

// Field types that present a fixed set of choices and therefore need `options`.
export const OPTION_TYPES = new Set(["select", "radio", "checkbox"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 5000;

// Slug for a whole form (used in the public URL /f/<slug> and as submission.category-like key).
export function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Key for a single field (safe as a JSON object key and CSV header). Must start with a letter.
export function slugifyKey(input) {
  let k = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (k && !/^[a-z]/.test(k)) k = `f_${k}`;
  return k;
}

function cleanOptions(options) {
  if (!Array.isArray(options)) return [];
  const seen = new Set();
  const out = [];
  for (const opt of options) {
    const val = String(opt == null ? "" : opt).trim();
    if (!val || seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

// Normalize + validate the ordered list of field definitions for a form.
// Returns { ok, errors: string[], fields: normalized[] }.
export function validateFormDefinition(fields) {
  const errors = [];
  if (!Array.isArray(fields)) {
    return { ok: false, errors: ["Form fields must be a list."], fields: [] };
  }

  const normalized = [];
  const usedKeys = new Set();

  fields.forEach((raw, index) => {
    const pos = index + 1;
    const field = raw && typeof raw === "object" ? raw : {};
    const label = String(field.label || "").trim();
    const type = String(field.type || "").trim();

    if (!label) errors.push(`Field ${pos}: label is required.`);
    if (!FIELD_TYPES.includes(type)) {
      errors.push(`Field ${pos} ("${label || "untitled"}"): unknown type "${type}".`);
    }

    let key = slugifyKey(field.key || label);
    if (!key) {
      errors.push(`Field ${pos} ("${label || "untitled"}"): could not derive a key.`);
      key = `field_${pos}`;
    }
    if (usedKeys.has(key)) {
      errors.push(`Field ${pos}: duplicate key "${key}". Field labels must be distinct.`);
    }
    usedKeys.add(key);

    const options = cleanOptions(field.options);
    if (OPTION_TYPES.has(type) && options.length === 0) {
      errors.push(`Field ${pos} ("${label || "untitled"}"): ${type} needs at least one option.`);
    }

    normalized.push({
      key,
      label,
      type: FIELD_TYPES.includes(type) ? type : "text",
      required: Boolean(field.required),
      help: String(field.help || "").trim() || undefined,
      placeholder: String(field.placeholder || "").trim() || undefined,
      options: OPTION_TYPES.has(type) ? options : undefined,
    });
  });

  return { ok: errors.length === 0, errors, fields: normalized };
}

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Validate a public submission's raw values against a form's normalized field list.
// Only known fields are kept (arbitrary extra keys are dropped). Returns
// { ok, errors: { [key]: message }, cleaned: { [key]: value } }.
export function validateSubmission(fields, values) {
  const errors = {};
  const cleaned = {};
  const list = Array.isArray(fields) ? fields : [];
  const input = values && typeof values === "object" ? values : {};

  for (const field of list) {
    const { key, type, required, label } = field;
    const options = Array.isArray(field.options) ? field.options : [];
    const name = label || key;
    const raw = input[key];

    if (isEmpty(raw)) {
      if (required) errors[key] = `${name} is required.`;
      continue;
    }

    if (type === "checkbox") {
      const arr = Array.isArray(raw) ? raw.map((v) => String(v)) : [String(raw)];
      const picked = arr.filter((v) => options.includes(v));
      if (picked.length === 0 && required) {
        errors[key] = `${name} is required.`;
      } else if (arr.length > 0 && picked.length !== arr.length) {
        errors[key] = `${name} has an invalid selection.`;
      } else {
        cleaned[key] = picked;
      }
      continue;
    }

    if (type === "select" || type === "radio") {
      const val = String(raw);
      if (!options.includes(val)) {
        errors[key] = `${name} has an invalid selection.`;
      } else {
        cleaned[key] = val;
      }
      continue;
    }

    if (type === "number") {
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        errors[key] = `${name} must be a number.`;
      } else {
        cleaned[key] = num;
      }
      continue;
    }

    if (type === "email") {
      const val = String(raw).trim();
      if (!EMAIL_RE.test(val)) {
        errors[key] = `${name} must be a valid email address.`;
      } else {
        cleaned[key] = val;
      }
      continue;
    }

    if (type === "tel") {
      const val = String(raw).trim();
      const digits = val.replace(/[^0-9]/g, "");
      if (digits.length < 7 || !/^[0-9+\-()\s]+$/.test(val)) {
        errors[key] = `${name} must be a valid phone number.`;
      } else {
        cleaned[key] = val;
      }
      continue;
    }

    if (type === "date") {
      const val = String(raw).trim();
      if (!DATE_RE.test(val) || Number.isNaN(Date.parse(val))) {
        errors[key] = `${name} must be a valid date.`;
      } else {
        cleaned[key] = val;
      }
      continue;
    }

    // text / textarea
    const val = String(raw).trim();
    if (val.length > MAX_TEXT) {
      errors[key] = `${name} is too long (max ${MAX_TEXT} characters).`;
    } else {
      cleaned[key] = val;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, cleaned };
}
