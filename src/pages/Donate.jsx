/**
 * src/pages/Donate.jsx
 *
 * Donation landing page.
 * - UI is complete (mission, impact, amount selection).
 * - Payment actions are intentionally disabled until provider credentials are available.
 *
 * Enablement:
 * - Flip DONATIONS_ENABLED to true once providers are configured and wired.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MIN_DONATION_USD = 1;
const MAX_DONATION_USD = 10000;
const PRESET_AMOUNTS_USD = [10, 25, 50, 100];

const DONATIONS_ENABLED = false;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Parse a user-entered amount into a USD number with up to 2 decimals.
 * @param {string} raw
 * @returns {number|null}
 */
function parseUsdAmount(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;

  return Math.round(n * 100) / 100;
}

/**
 * Format USD for display (e.g., 25 -> "25", 25.5 -> "25.50").
 * @param {number|null} amount
 * @returns {string}
 */
function formatUsd(amount) {
  if (amount == null || !Number.isFinite(amount)) return "";
  return amount.toFixed(2).replace(/\.00$/, "");
}

/**
 * Validate amount against accepted range.
 * @param {number|null} amount
 * @returns {boolean}
 */
function isAmountValid(amount) {
  if (amount == null) return false;
  return amount >= MIN_DONATION_USD && amount <= MAX_DONATION_USD;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Donate() {
  const [selectedPreset, setSelectedPreset] = useState(25);
  const [customAmountInput, setCustomAmountInput] = useState("");

  const amountUsd = useMemo(() => {
    const custom = customAmountInput.trim();
    if (custom.length > 0) return parseUsdAmount(custom);
    return selectedPreset;
  }, [customAmountInput, selectedPreset]);

  const amountOk = useMemo(() => isAmountValid(amountUsd), [amountUsd]);
  const donateLabel = amountOk ? `$${formatUsd(amountUsd)}` : "";

  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900">Support Dillar Academy</h1>
        <p className="mt-2 text-gray-700">
          Donations help us expand access to learning, support instructors, and keep classes running for students and families.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Amount selection */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Choose an amount</h2>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            {PRESET_AMOUNTS_USD.map((amt) => {
              const active = customAmountInput.trim() === "" && selectedPreset === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setCustomAmountInput("");
                    setSelectedPreset(amt);
                  }}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold border transition",
                    active
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  ${amt}
                </button>
              );
            })}

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Custom</span>
              <input
                inputMode="decimal"
                placeholder="e.g., 20"
                value={customAmountInput}
                onChange={(e) => setCustomAmountInput(e.target.value)}
                className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Custom donation amount in USD"
              />
            </label>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            Intended amount: <span className="font-semibold text-gray-900">{donateLabel || "—"}</span>
          </div>

          {!amountOk && customAmountInput.trim().length > 0 ? (
            <div className="mt-2 text-sm font-semibold text-red-600">
              Enter a valid amount (${MIN_DONATION_USD}–${MAX_DONATION_USD}).
            </div>
          ) : null}
        </div>

        {/* Impact */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900">Your impact</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">$10</div>
              <div className="mt-1 text-sm text-gray-700">Helps provide learning materials for a student.</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">$25</div>
              <div className="mt-1 text-sm text-gray-700">Helps support online class tools and infrastructure.</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">$50</div>
              <div className="mt-1 text-sm text-gray-700">Helps support instructor preparation and class quality.</div>
            </div>
          </div>
        </div>

        {/* Payment actions (intentionally disabled) */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900">Donate</h3>

          <div className="mt-3 grid gap-3">
            <button
              type="button"
              disabled={!DONATIONS_ENABLED || !amountOk}
              className={[
                "w-full rounded-lg px-4 py-3 text-sm font-semibold border",
                "bg-indigo-600 text-white border-indigo-600",
                (!DONATIONS_ENABLED || !amountOk) ? "opacity-60 cursor-not-allowed" : "hover:bg-indigo-500",
              ].join(" ")}
            >
              Donate {donateLabel ? donateLabel : ""} with Card
            </button>

            <button
              type="button"
              disabled={!DONATIONS_ENABLED || !amountOk}
              className={[
                "w-full rounded-lg px-4 py-3 text-sm font-semibold border",
                "bg-white text-gray-900 border-gray-200",
                (!DONATIONS_ENABLED || !amountOk) ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50",
              ].join(" ")}
            >
              Donate {donateLabel ? donateLabel : ""} with PayPal
            </button>

            <button
              type="button"
              disabled={!DONATIONS_ENABLED || !amountOk}
              className={[
                "w-full rounded-lg px-4 py-3 text-sm font-semibold border",
                "bg-white text-gray-900 border-gray-200",
                (!DONATIONS_ENABLED || !amountOk) ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50",
              ].join(" ")}
            >
              Donate {donateLabel ? donateLabel : ""} with Crypto
            </button>
          </div>

          <p className="mt-3 text-sm text-gray-600">
            When enabled, donors will receive an email receipt from the payment provider for their records.
          </p>
        </div>
      </section>

      {/* Links */}
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/volunteer" className="font-semibold text-indigo-700 hover:underline">
          Volunteer
        </Link>
        <Link href="/contact" className="font-semibold text-indigo-700 hover:underline">
          Contact us
        </Link>
        <Link href="/" className="font-semibold text-indigo-700 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}