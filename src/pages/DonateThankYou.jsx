/**
 * src/pages/DonateThankYou.jsx
 *
 * Post-donation confirmation page.
 * - Supports optional query param: ?m=stripe|paypal|crypto
 * - Keeps messaging provider-agnostic and tax-receipt-friendly
 */

import { useMemo } from "react";
import { Link } from "wouter";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Read a query param safely from the current URL.
 * @param {string} key
 * @returns {string}
 */
function getQueryParam(key) {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search || "");
  return String(params.get(key) || "");
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DonateThankYou() {
  const method = useMemo(() => getQueryParam("m").toLowerCase(), []);

  const methodLabel =
    method === "stripe"
      ? "Stripe"
      : method === "paypal"
      ? "PayPal"
      : method === "crypto"
      ? "the crypto provider"
      : "the payment provider";

  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-10">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-gray-900">Thank you for supporting Dillar Academy</h1>

        <p className="mt-3 text-gray-700">
          Your donation helps us expand access to learning, support instructors, and keep classes running for students and families.
        </p>

        <p className="mt-3 text-sm text-gray-600">
          You should receive a confirmation/receipt email from {methodLabel}. Please keep it for your records.
        </p>

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/donate" className="font-semibold text-indigo-700 hover:underline">
            Donate again
          </Link>
          <Link href="/" className="font-semibold text-indigo-700 hover:underline">
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}