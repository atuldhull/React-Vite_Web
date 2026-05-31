/**
 * PortfolioSettingsCard — owner-side settings for /u/:handle.
 *
 * Designed to drop into the existing /profile page. Shows:
 *   • The current handle + the live URL (when public).
 *   • A toggle to make the portfolio public/private.
 *   • A 200-char headline ("Front-end + ML at BMSIT, looking for a
 *     summer internship.").
 *   • Social fields (github / linkedin / twitter / website / kaggle / youtube).
 *
 * Patches go through PATCH /api/portfolio/me. Handle collisions
 * surface as inline 409 errors.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { portfolio } from "@/lib/api";

const SOCIAL_KEYS = [
  { key: "github",   label: "GitHub",    placeholder: "github.com/atul-dhull" },
  { key: "linkedin", label: "LinkedIn",  placeholder: "linkedin.com/in/atul-dhull" },
  { key: "twitter",  label: "X / Twitter", placeholder: "twitter.com/atul_dhull" },
  { key: "website",  label: "Website",   placeholder: "atul.dev" },
  { key: "kaggle",   label: "Kaggle",    placeholder: "kaggle.com/atuld" },
  { key: "youtube",  label: "YouTube",   placeholder: "youtube.com/@atul-dhull" },
];

export default function PortfolioSettingsCard() {
  const [state, setState] = useState({ loading: true, error: null });
  const [form,  setForm]  = useState({
    handle: "",
    public_portfolio: false,
    portfolio_headline: "",
    portfolio_socials: {},
  });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    portfolio.mySettings({ signal: ctrl.signal })
      .then(({ data }) => {
        setForm({
          handle:                data.handle || "",
          public_portfolio:      Boolean(data.public_portfolio),
          portfolio_headline:    data.portfolio_headline || "",
          portfolio_socials:     data.portfolio_socials || {},
        });
        setState({ loading: false, error: null });
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setState({ loading: false, error: err?.response?.data?.error || "Couldn't load portfolio settings" });
      });
    return () => ctrl.abort();
  }, []);

  async function onSubmit(e) {
    e?.preventDefault();
    setSaving(true); setSaveErr(null); setSaved(false);
    try {
      const { data } = await portfolio.updateSettings({
        handle:                form.handle,
        public_portfolio:      form.public_portfolio,
        portfolio_headline:    form.portfolio_headline,
        portfolio_socials:     form.portfolio_socials,
      });
      setForm((f) => ({ ...f, ...data, portfolio_socials: data.portfolio_socials || {} }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveErr(err?.response?.data?.error || "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (state.loading) {
    return (
      <div className="rounded-2xl border border-line/15 bg-white/[0.02] p-6">
        <div className="h-24 animate-pulse rounded-lg bg-white/[0.03]" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/8 p-6 text-sm text-danger">
        {state.error}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line/15 bg-white/[0.025] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">Public portfolio</h3>
          <p className="mt-1 text-xs text-text-soft">
            A shareable, login-free URL that shows off your writeups, projects, and achievements. Paste it on LinkedIn / your résumé.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2">
          <input
            type="checkbox"
            checked={form.public_portfolio}
            onChange={(e) => setForm((f) => ({ ...f, public_portfolio: e.target.checked }))}
            className="h-5 w-5 accent-primary"
          />
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-soft">Public</span>
        </label>
      </div>

      {/* Handle */}
      <div className="mt-5">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-dim">Handle</label>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line/20 bg-bg/40 px-3 py-2">
          <span className="font-mono text-xs text-text-dim">mathcollective.bmsit.in/u/</span>
          <input
            type="text"
            value={form.handle}
            onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.toLowerCase() }))}
            placeholder="atul-dhull"
            maxLength={40}
            className="flex-1 bg-transparent font-mono text-sm text-white placeholder:text-text-dim focus:outline-none"
          />
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-text-dim">
          3-40 chars · lowercase letters, digits, hyphens · must start and end with a letter or digit
        </p>
      </div>

      {/* Headline */}
      <div className="mt-5">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-dim">Headline</label>
        <input
          type="text"
          value={form.portfolio_headline}
          onChange={(e) => setForm((f) => ({ ...f, portfolio_headline: e.target.value }))}
          placeholder="Front-end + ML at BMSIT, looking for a summer internship."
          maxLength={200}
          className="mt-1.5 w-full rounded-lg border border-line/20 bg-bg/40 px-3 py-2 text-sm text-white placeholder:text-text-dim focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Socials grid */}
      <div className="mt-5">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-dim">Socials</label>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {SOCIAL_KEYS.map((s) => (
            <div key={s.key}>
              <div className="flex items-center gap-2 rounded-lg border border-line/15 bg-bg/40 px-3 py-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim w-16">{s.label}</span>
                <input
                  type="text"
                  value={form.portfolio_socials[s.key] || ""}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    portfolio_socials: { ...f.portfolio_socials, [s.key]: e.target.value },
                  }))}
                  placeholder={s.placeholder}
                  maxLength={200}
                  className="flex-1 bg-transparent font-mono text-xs text-white placeholder:text-text-dim focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save row */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-xs text-text-soft">
          {form.public_portfolio && form.handle ? (
            <>Live at <Link to={`/u/${form.handle}`} target="_blank" className="font-mono text-primary hover:underline">/u/{form.handle}</Link></>
          ) : form.handle ? (
            <span className="text-text-dim">Toggle "Public" to make <span className="font-mono">/u/{form.handle}</span> shareable.</span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white transition hover:bg-primary/20 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {saved && <p className="mt-2 text-xs text-success">Saved ✓</p>}
      {saveErr && <p className="mt-2 text-xs text-danger">{saveErr}</p>}
    </form>
  );
}
