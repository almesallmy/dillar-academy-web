// src/pages/Volunteer.jsx
// Volunteer interest form (public).
// Notes:
// - Light structure: timezone dropdown + preferred time-of-day + free-text availability details.
// - Honeypot field ("website") is included to reduce bot spam.
// - Backend performs validation.

import { useMemo, useState } from "react";

const TIMEZONE_OPTIONS = [
  { value: "UTC-12:00", label: "UTC−12:00" },
  { value: "UTC-11:00", label: "UTC−11:00" },
  { value: "UTC-10:00", label: "UTC−10:00" },
  { value: "UTC-09:00", label: "UTC−09:00" },
  { value: "UTC-08:00", label: "UTC−08:00" },
  { value: "UTC-07:00", label: "UTC−07:00" },
  { value: "UTC-06:00", label: "UTC−06:00" },
  { value: "UTC-05:00", label: "UTC−05:00" },
  { value: "UTC-04:00", label: "UTC−04:00" },
  { value: "UTC-03:00", label: "UTC−03:00" },
  { value: "UTC-02:00", label: "UTC−02:00" },
  { value: "UTC-01:00", label: "UTC−01:00" },
  { value: "UTC+00:00", label: "UTC±00:00" },
  { value: "UTC+01:00", label: "UTC+01:00" },
  { value: "UTC+02:00", label: "UTC+02:00" },
  { value: "UTC+03:00", label: "UTC+03:00" },
  { value: "UTC+04:00", label: "UTC+04:00" },
  { value: "UTC+05:00", label: "UTC+05:00" },
  { value: "UTC+06:00", label: "UTC+06:00" },
  { value: "UTC+07:00", label: "UTC+07:00" },
  { value: "UTC+08:00", label: "UTC+08:00" },
  { value: "UTC+09:00", label: "UTC+09:00" },
  { value: "UTC+10:00", label: "UTC+10:00" },
  { value: "UTC+11:00", label: "UTC+11:00" },
  { value: "UTC+12:00", label: "UTC+12:00" },
  { value: "UTC+13:00", label: "UTC+13:00" },
  { value: "UTC+14:00", label: "UTC+14:00" },
];

const TIME_OF_DAY_OPTIONS = [
  { value: "", label: "Select an option" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "flexible", label: "Flexible" },
];

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
    timezone: "",
    preferredTimeOfDay: "",
    availabilityDetails: "",
    motivation: "",
    notes: "",
    website: "", // honeypot (hidden)
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const canSubmit = useMemo(() => {
  return Boolean(
    form.name.trim() &&
      form.email.trim() &&
      form.roleInterest &&
      form.weeklyHours &&
      form.uyghurProficiency &&
      form.startDate &&
      form.subjects.trim() &&
      form.timezone &&
      form.preferredTimeOfDay &&
      form.availabilityDetails.trim() &&
      form.motivation.trim() &&
      !submitting
  );
}, [form, submitting]);

  const clearFieldError = (name) => {
    setFieldErrors((prev) => {
      if (!prev?.[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };

  const setRadio = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSuccess(false);
    setGeneralError("");
    setFieldErrors({});

    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      roleInterest: form.roleInterest,
      weeklyHours: form.weeklyHours,
      uyghurProficiency: form.uyghurProficiency,
      startDate: form.startDate,
      subjects: form.subjects,
      timezone: form.timezone,
      preferredTimeOfDay: form.preferredTimeOfDay,
      availabilityDetails: form.availabilityDetails,
      motivation: form.motivation,
      notes: form.notes,
      website: form.website, // honeypot
    };

    try {
      const res = await fetch("/api/volunteer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          timezone: "",
          preferredTimeOfDay: "",
          availabilityDetails: "",
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
    <div className="w-full px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-md">
        <div className="px-6 py-6 border-b border-gray-200">
          <h1 className="text-2xl font-semibold text-gray-900">Dillar Academy Interest Form</h1>
          <p className="mt-2 text-sm text-gray-600">
            Complete this form to learn more about volunteer opportunities and ways to make a difference.
            We’ll reach out with updates and next steps.
          </p>
        </div>

        <div className="px-6 py-6">
          {success && (
            <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Thanks — your submission has been received.
            </div>
          )}

          {generalError && (
            <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {generalError}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Honeypot: hidden from real users (bots often fill it) */}
            <div
              style={{ position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}
              aria-hidden="true"
            >
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

            <SelectField
              label="Weekly time commitment"
              name="weeklyHours"
              value={form.weeklyHours}
              onChange={onChange}
              required
              error={fieldErrors.weeklyHours}
              options={[
                { value: "", label: "Select an option" },
                { value: "lt1", label: "Less than 1 hour / week" },
                { value: "1_2", label: "1–2 hours / week" },
                { value: "3_5", label: "3–5 hours / week" },
                { value: "6_plus", label: "6+ hours / week" },
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
                { value: "fluent_native", label: "Fluent / Native" },
                { value: "professional", label: "Professional working proficiency" },
                { value: "conversational", label: "Conversational" },
                { value: "none", label: "Not proficient" },
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
              showPicker
            />

            <Field
              label="Subjects or skills you can offer"
              name="subjects"
              value={form.subjects}
              onChange={onChange}
              required
              error={fieldErrors.subjects}
              placeholder="e.g., IELTS, writing, conversation practice, admin support, curriculum help"
            />

            <SelectField
              label="Timezone (UTC/GMT offset)"
              name="timezone"
              value={form.timezone}
              onChange={onChange}
              required
              error={fieldErrors.timezone}
              options={[{ value: "", label: "Select your UTC offset" }, ...TIMEZONE_OPTIONS]}
            />

            <SelectField
              label="Preferred time of day"
              name="preferredTimeOfDay"
              value={form.preferredTimeOfDay}
              onChange={onChange}
              required
              error={fieldErrors.preferredTimeOfDay}
              options={TIME_OF_DAY_OPTIONS}
            />

            <Field
              label="Weekly availability"
              name="availabilityDetails"
              value={form.availabilityDetails}
              onChange={onChange}
              required
              error={fieldErrors.availabilityDetails}
              placeholder="e.g., Mon/Wed 7–9pm; Sat mornings"
            />

            <TextArea
              label="Motivation"
              name="motivation"
              value={form.motivation}
              onChange={onChange}
              required
              error={fieldErrors.motivation}
              rows={6}
              placeholder="Tell us why you’d like to volunteer and what you hope to contribute."
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
                className={`rounded-md px-5 py-2.5 text-sm font-medium transition ${
                  canSubmit
                    ? "bg-indigo-900 text-white hover:bg-indigo-800"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
              <span className="text-xs text-gray-500">* Required fields</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Inputs ---------------------------------- */

function Field({ label, name, value, onChange, type = "text", required, error, placeholder, showPicker }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={(e) => {
          if (showPicker) e.target.showPicker?.();
        }}
        onClick={(e) => {
          if (showPicker) e.target.showPicker?.();
        }}
        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none ${
          error ? "border-rose-400" : "border-gray-300"
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function TextArea({ label, name, value, onChange, required, error, rows, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none resize-y ${
          error ? "border-rose-400" : "border-gray-300"
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function RadioGroup({ label, name, value, onChange, options, required, error }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900">
        {label} {required && <span className="text-rose-600">*</span>}
      </div>
      <div className={`mt-2 rounded-md border px-3 py-2 ${error ? "border-rose-400" : "border-gray-300"}`}>
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer py-1">
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(name, opt.value)}
            />
            <span className="text-gray-800">{opt.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options, required, error }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none bg-white ${
          error ? "border-rose-400" : "border-gray-300"
        }`}
      >
        {options.map((o) => (
          <option key={o.value || o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}