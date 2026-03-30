/**
 * src/pages/Donate.jsx
 *
 * Donation landing page.
 * - Stripe stays on hosted Stripe Checkout.
 * - PayPal is handled with the PayPal JavaScript SDK + server-side order create/capture.
 * - Payment availability is controlled by the backend donation status endpoint.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MIN_DONATION_USD = 1;
const MAX_DONATION_USD = 10000;
const PRESET_AMOUNTS_USD = [10, 25, 50, 100];

const EMPTY_DONATION_STATUS = {
  loaded: false,
  enabled: false,
  providers: {
    stripe: false,
    paypal: false,
  },
  publicConfig: {
    paypalClientId: "",
  },
};

let paypalSdkPromise = null;

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

/**
 * Load the PayPal JavaScript SDK once.
 * @param {string} clientId
 * @returns {Promise<any>}
 */
function loadPayPalSdk(clientId) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PayPal SDK can only load in the browser."));
  }

  if (!clientId) {
    return Promise.reject(new Error("Missing PayPal client ID."));
  }

  if (window.paypal?.Buttons) {
    return Promise.resolve(window.paypal);
  }

  if (paypalSdkPromise) {
    return paypalSdkPromise;
  }

  paypalSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-paypal-sdk="true"]');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=USD&intent=capture&components=buttons`;
    script.async = true;
    script.dataset.paypalSdk = "true";
    script.dataset.paypalClientId = clientId;

    script.onload = () => {
      if (window.paypal?.Buttons) {
        resolve(window.paypal);
        return;
      }

      paypalSdkPromise = null;
      reject(new Error("PayPal SDK loaded, but buttons are unavailable."));
    };

    script.onerror = () => {
      paypalSdkPromise = null;
      reject(new Error("Failed to load the PayPal SDK."));
    };

    document.body.appendChild(script);
  });

  return paypalSdkPromise;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Donate() {
  const [selectedPreset, setSelectedPreset] = useState(25);
  const [customAmountInput, setCustomAmountInput] = useState("");
  const [donationStatus, setDonationStatus] = useState(EMPTY_DONATION_STATUS);
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [paypalReady, setPaypalReady] = useState(false);
  const [error, setError] = useState("");
  const paypalButtonRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    async function loadDonationStatus() {
      try {
        const resp = await fetch("/api/donate/status");
        const data = await resp.json().catch(() => ({}));

        if (!isActive) return;

        if (!resp.ok) {
          setDonationStatus(EMPTY_DONATION_STATUS);
          return;
        }

        setDonationStatus({
          loaded: true,
          enabled: Boolean(data?.enabled),
          providers: {
            stripe: Boolean(data?.providers?.stripe),
            paypal: Boolean(data?.providers?.paypal),
          },
          publicConfig: {
            paypalClientId: String(data?.publicConfig?.paypalClientId || "").trim(),
          },
        });
      } catch (_err) {
        if (!isActive) return;
        setDonationStatus(EMPTY_DONATION_STATUS);
      }
    }

    loadDonationStatus();

    return () => {
      isActive = false;
    };
  }, []);

  const amountUsd = useMemo(() => {
    const custom = customAmountInput.trim();
    if (custom.length > 0) return parseUsdAmount(custom);
    return selectedPreset;
  }, [customAmountInput, selectedPreset]);

  const amountOk = useMemo(() => isAmountValid(amountUsd), [amountUsd]);
  const donateLabel = amountOk ? `$${formatUsd(amountUsd)}` : "";
  const paypalClientId = donationStatus.publicConfig?.paypalClientId || "";

  const availabilityMessage = !donationStatus.loaded
    ? "Checking donation availability..."
    : !donationStatus.enabled
      ? "Online donations are currently unavailable."
      : null;

  useEffect(() => {
    let cancelled = false;

    async function bootstrapPayPal() {
      if (!donationStatus.providers.paypal || !paypalClientId) {
        setPaypalReady(false);
        return;
      }

      try {
        await loadPayPalSdk(paypalClientId);
        if (!cancelled) {
          setPaypalReady(true);
        }
      } catch (err) {
        console.error("Failed to load PayPal SDK:", err);
        if (!cancelled) {
          setPaypalReady(false);
          setError("PayPal is temporarily unavailable.");
        }
      }
    }

    bootstrapPayPal();

    return () => {
      cancelled = true;
    };
  }, [donationStatus.providers.paypal, paypalClientId]);

  useEffect(() => {
    const container = paypalButtonRef.current;

    if (!container) return;
    container.innerHTML = "";

    if (!donationStatus.providers.paypal || !paypalReady || !amountOk || !paypalClientId) {
      return;
    }

    if (!window.paypal?.Buttons) {
      return;
    }

    let cancelled = false;

    const buttons = window.paypal.Buttons({
      fundingSource: window.paypal.FUNDING.PAYPAL,
      style: {
        color: "gold",
        shape: "rect",
        label: "paypal",
        layout: "vertical",
        height: 50,
        tagline: false,
      },

      async createOrder() {
        setError("");
        setLoadingProvider("paypal");

        const resp = await fetch("/api/donate/paypal/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amountUsd }),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok || !data?.orderID) {
          setLoadingProvider(null);
          throw new Error(data?.error || "Unable to start PayPal checkout.");
        }

        return data.orderID;
      },

      async onApprove(data) {
        const resp = await fetch("/api/donate/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderID: data.orderID }),
        });

        const result = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          setLoadingProvider(null);
          throw new Error(result?.error || "Unable to complete PayPal donation.");
        }

        if (result?.status && result.status !== "COMPLETED") {
          setLoadingProvider(null);
          throw new Error("PayPal donation is not complete yet.");
        }

        window.location.assign(
          `/donate/thank-you?m=paypal&order_id=${encodeURIComponent(data.orderID)}`
        );
      },

      onCancel() {
        setLoadingProvider(null);
      },

      onError(err) {
        console.error("PayPal checkout error:", err);
        setLoadingProvider(null);
        setError("PayPal checkout failed. Please try again.");
      },
    });

    if (!buttons.isEligible()) {
      setError("PayPal is not available on this device or browser.");
      return;
    }

    buttons.render(container).catch((err) => {
      console.error("PayPal button render failed:", err);
      if (!cancelled) {
        setError("PayPal failed to load. Please try again.");
      }
    });

    return () => {
      cancelled = true;
      container.innerHTML = "";
      setLoadingProvider((current) => (current === "paypal" ? null : current));
    };
  }, [amountOk, amountUsd, donationStatus.providers.paypal, paypalClientId, paypalReady]);

  async function startDonation(provider) {
    try {
      setError("");
      setLoadingProvider(provider);

      if (!amountOk) {
        setError(`Enter a valid amount ($${MIN_DONATION_USD}–${MAX_DONATION_USD}).`);
        return;
      }

      if (!donationStatus.providers?.[provider]) {
        setError("This donation method is currently unavailable.");
        return;
      }

      const resp = await fetch("/api/donate/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, amount: amountUsd }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setError(data?.error || "Unable to start donation.");
        return;
      }

      if (!data?.url) {
        setError("Donation link unavailable.");
        return;
      }

      window.location.assign(data.url);
    } catch (_err) {
      setError("Network error. Please try again.");
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900">Support Dillar Academy</h1>
        <p className="mt-2 text-gray-700">
          Donations help us expand access to learning, support instructors, and keep
          classes running for students and families.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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
                    "rounded-full border px-4 py-2 text-sm font-semibold transition",
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
            Intended amount:{" "}
            <span className="font-semibold text-gray-900">{donateLabel || "—"}</span>
          </div>

          {!amountOk && customAmountInput.trim().length > 0 ? (
            <div className="mt-2 text-sm font-semibold text-red-600">
              Enter a valid amount (${MIN_DONATION_USD}–${MAX_DONATION_USD}).
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900">Your impact</h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">$10</div>
              <div className="mt-1 text-sm text-gray-700">
                Helps provide learning materials for a student.
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">$25</div>
              <div className="mt-1 text-sm text-gray-700">
                Helps support online class tools and infrastructure.
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">$50</div>
              <div className="mt-1 text-sm text-gray-700">
                Helps support instructor preparation and class quality.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900">Donate</h3>

          <div className="mt-3 grid gap-3">
            <button
              type="button"
              onClick={() => startDonation("stripe")}
              disabled={!donationStatus.providers.stripe || !amountOk || loadingProvider !== null}
              className={[
                "w-full rounded-lg border px-4 py-3 text-sm font-semibold",
                "border-indigo-600 bg-indigo-600 text-white",
                (!donationStatus.providers.stripe || !amountOk || loadingProvider !== null)
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-indigo-500",
              ].join(" ")}
            >
              {loadingProvider === "stripe"
                ? "Redirecting..."
                : `Donate ${donateLabel ? donateLabel : ""} with Card`}
            </button>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 text-sm font-semibold text-gray-900">
                Donate {donateLabel ? donateLabel : ""} with PayPal
              </div>

              {!donationStatus.providers.paypal ? (
                <div className="text-sm text-gray-600">PayPal is currently unavailable.</div>
              ) : !amountOk ? (
                <div className="text-sm text-gray-600">
                  Enter a valid amount to continue with PayPal.
                </div>
              ) : !paypalReady ? (
                <div className="text-sm text-gray-600">Loading secure PayPal checkout...</div>
              ) : null}

              <div ref={paypalButtonRef} />
            </div>
          </div>

          {availabilityMessage ? (
            <p className="mt-3 text-sm text-gray-600">{availabilityMessage}</p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
          ) : null}
        </div>
      </section>

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