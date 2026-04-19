/**
 * Razorpay checkout — lazy-loaded helper.
 *
 * The Razorpay SDK is a ~70 KB script we only need when a student
 * actually clicks "Pay" on a paid event. Loading it on app boot
 * would waste every other user's bandwidth (most don't register for
 * paid events). This helper injects the script on first use, caches
 * the loaded promise for the rest of the session, then opens the
 * checkout widget with the order the backend created.
 */

let scriptPromise = null;

/**
 * Load https://checkout.razorpay.com/v1/checkout.js exactly once
 * per page load. Subsequent calls return the same resolved promise.
 * Rejects if the script fails to load (network / CSP block) so the
 * caller can show a useful error.
 */
export function loadRazorpayCheckout() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout not available in this environment"));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src   = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload  = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay loaded but window.Razorpay is undefined"));
    };
    s.onerror = () => {
      scriptPromise = null; // allow retry on next click
      reject(new Error("Couldn't load Razorpay — check your network"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Open Razorpay checkout with a backend-created order.
 * Returns a promise that resolves on success (the webhook will
 * verify the payment server-side — this promise just reflects the
 * widget's dismissal) or rejects on user cancel / checkout error.
 *
 * @param {object} opts
 * @param {string} opts.keyId         — public Razorpay key id (rzp_test_... or rzp_live_...)
 * @param {string} opts.orderId       — order.id from POST /api/events/:id/registrations/:regId/razorpay-order
 * @param {number} opts.amountPaise   — amount in paise; only used for UI display
 * @param {string} opts.eventTitle    — shown in the checkout modal header
 * @param {object} [opts.prefill]     — { name, email } — auto-fills the payer form
 */
export async function openRazorpayCheckout(opts) {
  const Razorpay = await loadRazorpayCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key:      opts.keyId,
      order_id: opts.orderId,
      amount:   opts.amountPaise,
      currency: "INR",
      name:     "Math Collective",
      description: opts.eventTitle || "Event registration",
      prefill: {
        name:  opts.prefill?.name  || "",
        email: opts.prefill?.email || "",
      },
      theme: { color: "#7c3aed" },
      handler: (response) => {
        // response contains razorpay_payment_id, razorpay_order_id,
        // razorpay_signature. We don't use these client-side — the
        // webhook is the authoritative source of truth. Just resolve
        // so the caller can poll for updated payment_status.
        resolve(response);
      },
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled")),
      },
    });
    rzp.on("payment.failed", (resp) => {
      reject(new Error(resp?.error?.description || "Payment failed"));
    });
    rzp.open();
  });
}
