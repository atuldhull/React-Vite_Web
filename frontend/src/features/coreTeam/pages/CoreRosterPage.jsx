import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import MessageButton from "@/components/social/MessageButton";
import { core } from "@/lib/api";
import { useCoreStore } from "@/store/core-store";
import CoreBadge from "@/features/coreTeam/components/CoreBadge";
import { ModalShell, Field, INPUT_CLS } from "@/features/coreTeam/components/FormBits";

const MEDALS = ["🥇", "🥈"];

function MemberRow({ m, rank }) {
  const top = rank < 2;
  return (
    <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
      top ? "border-warning/25 bg-warning/[0.06]" : "border-line/8 bg-black/15"
    }`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-6 text-center text-sm">
          {top ? MEDALS[rank] : <span className="font-mono text-[10px] text-text-dim">{rank + 1}</span>}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 font-display text-xs font-bold text-white">
          {(m.name || "?")[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{m.name}</p>
          <p className="truncate font-mono text-[10px] text-text-dim">{m.position}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {m.user_id && <MessageButton userId={m.user_id} size="sm" variant="ghost" label="" />}
        {!m.user_id && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-text-dim">code unused</span>
        )}
        <span className="math-text text-sm font-bold text-primary">{m.points}</span>
      </div>
    </div>
  );
}

export default function CoreRosterPage() {
  const { member } = useCoreStore();
  const isCouncil = member?.tier === "council";
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null); // 'team' | 'member' | null

  const load = useCallback(() => {
    core.teams().then((r) => setData(r.data || { council: [], teams: [] })).catch(() => setData({ council: [], teams: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) {
    return <div className="flex justify-center py-20"><Loader variant="orbit" size="lg" label="Loading roster…" /></div>;
  }

  return (
    <div className="space-y-6">
      {isCouncil && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" magnetic={false} onClick={() => setModal("team")}>+ Add Team</Button>
          <Button size="sm" variant="primary" magnetic={false} onClick={() => setModal("member")}>+ Add Member</Button>
        </div>
      )}

      {/* Council */}
      <Card variant="glow" spotlight={false}>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-bold text-white">Club Council</h2>
          <CoreBadge tier="council" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.council.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-line/8 bg-black/15 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20 font-display text-xs font-bold text-warning">
                  {(m.name || "?")[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{m.name}</p>
                  <p className="truncate font-mono text-[10px] text-text-dim">{m.position}</p>
                </div>
              </div>
              {m.user_id && <MessageButton userId={m.user_id} size="sm" variant="ghost" label="" />}
            </div>
          ))}
        </div>
      </Card>

      {/* Teams */}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.teams.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Card variant="solid" spotlight={false} noEntrance>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: t.accent }} />
                  <h3 className="font-display text-lg font-bold text-white">{t.name}</h3>
                </div>
                <span className="font-mono text-[10px] text-text-dim">{t.members.length} members</span>
              </div>
              {t.description && <p className="mt-1 text-xs text-text-muted">{t.description}</p>}
              <div className="mt-3 space-y-2">
                {t.members.length === 0 && (
                  <p className="py-3 text-center text-xs text-text-dim">No members yet.</p>
                )}
                {t.members.map((m, i) => <MemberRow key={m.id} m={m} rank={i} />)}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {modal === "team"   && <AddTeamModal   onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
        {modal === "member" && <AddMemberModal teams={data.teams} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

/* ── Add team ────────────────────────────────────────────── */
function AddTeamModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", description: "", accent: "#7c3aed" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (form.name.trim().length < 2) { setErr("Name the team."); return; }
    setBusy(true); setErr(null);
    try {
      await core.createTeam({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        accent: form.accent,
      });
      onDone();
    } catch (e) {
      setErr(e?.response?.data?.error || "Could not create team.");
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Add a team" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Team name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLS} />
        </Field>
        <Field label="Description (optional)">
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT_CLS} />
        </Field>
        <Field label="Accent colour">
          <input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })}
            className="h-10 w-full rounded-lg border border-line/20 bg-black/30" />
        </Field>
        {err && <p className="text-xs text-danger">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" magnetic={false} loading={busy} onClick={save}>Create team</Button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ── Add member ──────────────────────────────────────────── */
function AddMemberModal({ teams, onClose, onDone }) {
  const [form, setForm] = useState({ name: "", email: "", teamId: "", tier: "member", position: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [code, setCode] = useState(null);

  const save = async () => {
    if (form.name.trim().length < 2 || !form.email.trim()) { setErr("Name and email are required."); return; }
    setBusy(true); setErr(null);
    try {
      const { data } = await core.addMember({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        teamId: form.teamId || null,
        tier: form.tier,
        position: form.position.trim() || undefined,
      });
      setCode(data.accessCode);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.response?.data?.issues?.[0]?.message || "Could not add member.");
      setBusy(false);
    }
  };

  if (code) {
    return (
      <ModalShell title="Member added" onClose={onDone}>
        <p className="text-sm text-text-muted">Share this private access code with the new member:</p>
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-4 text-center">
          <p className="font-mono text-2xl tracking-[0.3em] text-white">{code}</p>
        </div>
        <p className="mt-2 text-xs text-text-dim">
          They redeem it inside the portal — it only works with the email you entered.
        </p>
        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="primary" magnetic={false} onClick={onDone}>Done</Button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Add a core member" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLS} />
        </Field>
        <Field label="Club email">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT_CLS}
            placeholder="name@bmsit.in" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tier">
            <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} className={INPUT_CLS}>
              <option value="member">Member</option>
              <option value="head">Head</option>
              <option value="council">Council</option>
            </select>
          </Field>
          <Field label="Position">
            <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
              className={INPUT_CLS} placeholder="Member / Head…" />
          </Field>
        </div>
        <Field label="Team (leave blank for council)">
          <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} className={INPUT_CLS}>
            <option value="">— no team (council) —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {err && <p className="text-xs text-danger">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" magnetic={false} loading={busy} onClick={save}>Add & issue code</Button>
        </div>
      </div>
    </ModalShell>
  );
}
