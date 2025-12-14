import { useMemo, useState } from "react";

export default function Volunteer() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    roleInterest: "",
    weeklyHours: "",
    uyghurProficiency: "",
    startDate: "",
    subjects: "",
    availability: "",
    motivation: "",
    notes: "",
    website: "", // honeypot (hidden)
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const canSubmit = useMemo(() => {
    // Light client-side checks for UX only; backend performs full validation
    return (
      form.name.trim() &&
      form.email.trim() &&
      form.roleInterest &&
      form.weeklyHours &&
      form.uyghurProficiency &&
      form.startDate &&
      form.subjects.trim() &&
      form.availability.trim() &&
      form.motivation.trim() &&
      !submitting
    );
  }, [form, submitting]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    setFieldErrors((prev) => {
      if (!prev?.[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const setRadio = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev?.[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSuccess(false);
    setGeneralError("");
    setFieldErrors({});

    try {
      const res = await fetch("/api/volunteer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess(true);
        setForm({
          name: "",
          email: "",
          phone: "",
          roleInterest: "",
          weeklyHours: "",
          uyghurProficiency: "",
          startDate: "",
          subjects: "",
          availability: "",
          motivation: "",
          notes: "",
          website: "",
        });
        return;
      }

      if (res.status === 422 && data?.fieldErrors) {
        setGeneralError(data.message || "Please correct the highlighted fields.");
        setFieldErrors(data.fieldErrors);
        return;
      }

      setGeneralError(data?.message || "Something went wrong. Please try again.");
    } catch {
      setGeneralError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl px-4 py-10">
      <div className="w-full rounded-2xl border border-white/10 bg-[#0b1220] text-white shadow-sm">
        <div className="px-6 py-6 border-b border-white/10">
          <h1 className="text-2xl font-semibold">Dillar Academy Interest Form</h1>
          <p className="mt-2 text-sm text-white/75">
            Complete this form to learn more about volunteer opportunities and ways to make a difference.
            We’ll reach out with updates and next steps.
          </p>
        </div>

        <div className="px-6 py-6">
          {success && (
            <div className="mb-5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Thanks — your submission has been received.
            </div>
          )}

          {generalError && (
            <div className="mb-5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {generalError}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Honeypot (spam trap): hidden from real users */}
            <div style={{ position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }} aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={onChange}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            <Field label="Name" name="name" value={form.name} onChange={onChange} required error={fieldErrors.name} />
            <Field label="Email" name="email" type="email" value={form.email} onChange={onChange} required error={fieldErrors.email} />
            <Field label="Phone (optional)" name="phone" value={form.phone} onChange={onChange} error={fieldErrors.phone} />

            <RadioGroup
              label="How would you like to contribute?"
              name="roleInterest"
              value={form.roleInterest}
              onChange={setRadio}
              required
              error={fieldErrors.roleInterest}
              options={[
                { value: "teach", label: "Teaching" },
                { value: "admin", label: "Administrative / Board support" },
                { value: "both", label: "Both" },
              ]}
            />

            <RadioGroup
              label="How many hours per week can you commit?"
              name="weeklyHours"
              value={form.weeklyHours}
              onChange={setRadio}
              required
              error={fieldErrors.weeklyHours}
              options={[
                { value: "1", label: "1 hour" },
                { value: "2", label: "2 hours" },
                { value: "more", label: "More than 2 hours" },
              ]}
            />

            <RadioGroup
              label="Uyghur language proficiency"
              name="uyghurProficiency"
              value={form.uyghurProficiency}
              onChange={setRadio}
              required
              error={fieldErrors.uyghurProficiency}
              options={[
                { value: "fluent", label: "Fluent" },
                { value: "somewhat", label: "Somewhat" },
                { value: "no", label: "No" },
              ]}
            />

            <Field
              label="Earliest start date"
              name="startDate"
              type="date"
              value={form.startDate}
              onChange={onChange}
              required
              error={fieldErrors.startDate}
            />

            <Field
              label="Subjects or skills you can offer"
              name="subjects"
              value={form.subjects}
              onChange={onChange}
              required
              error={fieldErrors.subjects}
            />

            <Field
              label="Weekly availability (include timezone)"
              name="availability"
              value={form.availability}
              onChange={onChange}
              required
              error={fieldErrors.availability}
            />

            <TextArea
              label="Why do you want to volunteer with Dillar Academy?"
              name="motivation"
              value={form.motivation}
              onChange={onChange}
              required
              error={fieldErrors.motivation}
              rows={6}
            />

            <TextArea
              label="Additional notes (optional)"
              name="notes"
              value={form.notes}
              onChange={onChange}
              error={fieldErrors.notes}
              rows={4}
            />

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
                  canSubmit
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/20 text-white/60 cursor-not-allowed"
                }`}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
              <span className="text-xs text-white/60">* Required fields</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* --- Reusable inputs --- */

function Field({ label, name, value, onChange, type = "text", required, error }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/90">
        {label} {required && <span className="text-rose-300">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className={`mt-1 w-full rounded-xl border bg-black/20 px-3 py-2 text-sm outline-none ${
          error ? "border-rose-400/60" : "border-white/10"
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-200">{error}</p>}
    </div>
  );
}

function TextArea({ label, name, value, onChange, required, error, rows }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/90">
        {label} {required && <span className="text-rose-300">*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        className={`mt-1 w-full rounded-xl border bg-black/20 px-3 py-2 text-sm outline-none resize-y ${
          error ? "border-rose-400/60" : "border-white/10"
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-200">{error}</p>}
    </div>
  );
}

function RadioGroup({ label, name, value, onChange, options, required, error }) {
  return (
    <div>
      <div className="text-sm font-medium text-white/90">
        {label} {required && <span className="text-rose-300">*</span>}
      </div>
      <div className={`mt-2 rounded-xl border bg-black/20 px-3 py-2 ${error ? "border-rose-400/60" : "border-white/10"}`}>
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(name, opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-rose-200">{error}</p>}
    </div>
  );
}