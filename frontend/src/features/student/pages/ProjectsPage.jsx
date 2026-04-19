import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Loader from "@/components/ui/Loader";
import { projects } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function ProjectsPage() {
  useMonument("sky");
  const [projectList, setProjectList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Create team form — one slot per additional member (leader is
  // implicit). Backend requires 3-6 members total, so we surface 2-5
  // extra email slots.
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamMemberEmails, setTeamMemberEmails] = useState(["", "", ""]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Submit project form. The schema has two URL columns (github_url,
  // demo_url); the form now exposes both instead of stuffing one into
  // the other. A third slides URL would need a migration — deferred.
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectCategory, setProjectCategory] = useState("");
  const [projectGithub, setProjectGithub] = useState("");
  const [projectDemo, setProjectDemo] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  // Voting
  const [votingId, setVotingId] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const [projRes, catRes, teamRes] = await Promise.all([
        projects.list(),
        projects.categories(),
        projects.myTeam().catch(() => ({ data: null })),
      ]);
      setProjectList(projRes.data);
      setCategories(catRes.data);
      // Backend shape is { team: <team|null>, project: <project|null> }.
      // The UI previously stored the whole wrapper, so `myTeam` was
      // always truthy (even with no team), which hid the "Create Team"
      // button and showed "Submit Project" for users with no team —
      // producing the "Failed to submit project" crash because the
      // submit endpoint requires a teamId.
      setMyTeam(teamRes.data?.team || null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTeam(e) {
    e.preventDefault();
    try {
      setTeamLoading(true);
      // Backend validator (createTeamSchema) expects `memberEmails`.
      // Earlier this was sent as `members` which Zod silently stripped,
      // leaving the controller with zero emails and tripping its
      // "Minimum 3 members required" 400.
      const cleanedEmails = teamMemberEmails.map((e) => e.trim()).filter(Boolean);
      const { data } = await projects.createTeam({
        name: teamName,
        memberEmails: cleanedEmails,
      });
      setMyTeam(data?.team || data);
      setShowTeamForm(false);
      setTeamName("");
      setTeamMemberEmails(["", "", ""]);
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || "Failed to create team");
    } finally {
      setTeamLoading(false);
    }
  }

  function updateMemberEmail(idx, value) {
    setTeamMemberEmails((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function addMemberSlot() {
    // Backend cap is 6 total members (leader + 5 additional).
    setTeamMemberEmails((prev) => (prev.length >= 5 ? prev : [...prev, ""]));
  }

  function removeMemberSlot(idx) {
    // Keep at least 2 slots visible so the form never collapses below
    // a valid team size (leader + 2 = 3 minimum).
    setTeamMemberEmails((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function handleSubmitProject(e) {
    e.preventDefault();
    // Defensive: the button should already be hidden without a team,
    // but if something slips through we fail fast with a clear error.
    if (!myTeam?.id) {
      alert("Create a team before submitting a project.");
      return;
    }
    try {
      setSubmitLoading(true);
      await projects.submit({
        teamId: myTeam.id,
        title: projectTitle,
        description: projectDescription,
        category: projectCategory,
        github_url: projectGithub || "",
        demo_url:   projectDemo   || "",
      });
      setShowProjectForm(false);
      setProjectTitle("");
      setProjectDescription("");
      setProjectCategory("");
      setProjectGithub("");
      setProjectDemo("");
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || "Failed to submit project");
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleVote(id) {
    try {
      setVotingId(id);
      await projects.vote(id);
      setProjectList((prev) =>
        prev.map((p) =>
          p._id === id ? { ...p, votes: (p.votes || 0) + 1, hasVoted: true } : p
        )
      );
    } catch (err) {
      alert(err.response?.data?.message || "Failed to vote");
    } finally {
      setVotingId(null);
    }
  }

  const filteredProjects =
    selectedCategory === "All"
      ? projectList
      : projectList.filter((p) => p.category === selectedCategory);

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.13} />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader variant="orbit" size="lg" label="Loading projects..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.13} />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <p className="text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchAll}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="sky" intensity={0.13} />

      <div className="relative z-10 space-y-8 pb-16">
        {/* Header */}
        <motion.section initial="hidden" animate="visible">
          <motion.div
            custom={0}
            variants={fadeUp}
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-warning">
                Innovation Hub
              </p>
              <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em] text-white sm:text-5xl">
                Projects
              </h1>
              <p className="mt-2 text-text-muted">
                Browse, create, and vote on math projects.
              </p>
            </div>
            <div className="flex gap-3">
              {!myTeam && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowTeamForm(!showTeamForm)}
                >
                  {showTeamForm ? "Cancel" : "Create Team"}
                </Button>
              )}
              {myTeam && (
                <Button
                  size="sm"
                  onClick={() => setShowProjectForm(!showProjectForm)}
                >
                  {showProjectForm ? "Cancel" : "Submit Project"}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.section>

        {/* My Team Card */}
        {myTeam && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card variant="glow">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">
                Your Team
              </p>
              <h3 className="mt-2 font-display text-xl font-bold text-white">
                {myTeam.name}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(myTeam.members || []).map((m, i) => (
                  <span
                    key={i}
                    className="inline-block rounded-full border border-line/20 bg-white/[0.03] px-3 py-1 text-xs text-text-muted"
                  >
                    {m.name || m.email || m}
                  </span>
                ))}
              </div>
            </Card>
          </motion.section>
        )}

        {/* Create Team Form */}
        {showTeamForm && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card variant="solid">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                New Team
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">
                Create Your Team
              </h2>
              <form onSubmit={handleCreateTeam} className="mt-6 space-y-4">
                <InputField
                  label="Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Euler's Engineers"
                  required
                />
                <div>
                  <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.28em] text-text-muted">
                    Teammate Emails
                  </span>
                  <p className="mb-3 text-xs text-text-dim">
                    You are the team leader. Add 2–5 teammates by email (teams need 3–6 members in total).
                  </p>
                  <div className="space-y-2">
                    {teamMemberEmails.map((emailValue, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="email"
                          value={emailValue}
                          onChange={(e) => updateMemberEmail(idx, e.target.value)}
                          placeholder={`teammate${idx + 1}@example.com`}
                          className="flex-1 rounded-[1.5rem] border border-line/18 bg-panel/70 px-4 py-3 text-sm text-white outline-none transition duration-200 focus:border-primary/45"
                        />
                        {teamMemberEmails.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeMemberSlot(idx)}
                            aria-label={`Remove teammate ${idx + 1}`}
                            className="rounded-full border border-line/20 bg-black/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-text-dim transition hover:border-danger/40 hover:text-danger"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {teamMemberEmails.length < 5 && (
                    <button
                      type="button"
                      onClick={addMemberSlot}
                      className="mt-3 rounded-full border border-line/20 bg-white/[0.04] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-text-muted transition hover:border-primary/40 hover:text-white"
                    >
                      + Add teammate
                    </button>
                  )}
                </div>
                <Button type="submit" size="sm" loading={teamLoading}>
                  Create Team
                </Button>
              </form>
            </Card>
          </motion.section>
        )}

        {/* Submit Project Form */}
        {showProjectForm && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card variant="solid">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
                New Submission
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">
                Submit Your Project
              </h2>
              <form onSubmit={handleSubmitProject} className="mt-6 space-y-4">
                <InputField
                  label="Project Title"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="Enter project title"
                  required
                />
                <InputField
                  label="Description"
                  multiline
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Describe your project..."
                  required
                />
                <div>
                  <span className="mb-3 block font-mono text-[11px] uppercase tracking-[0.28em] text-text-muted">
                    Category
                  </span>
                  <select
                    value={projectCategory}
                    onChange={(e) => setProjectCategory(e.target.value)}
                    required
                    className="w-full rounded-[1.5rem] border border-line/18 bg-panel/70 px-4 py-3 text-sm text-white outline-none transition duration-200 focus:border-primary/45"
                  >
                    <option value="" disabled>
                      Select category
                    </option>
                    {categories.map((cat) => (
                      <option key={cat._id || cat.name} value={cat._id || cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <InputField
                  label="GitHub URL (optional)"
                  value={projectGithub}
                  onChange={(e) => setProjectGithub(e.target.value)}
                  placeholder="https://github.com/your-team/project"
                />
                <InputField
                  label="Live demo URL (optional)"
                  value={projectDemo}
                  onChange={(e) => setProjectDemo(e.target.value)}
                  placeholder="https://your-deployed-site.com"
                />
                <p className="-mt-2 text-xs text-text-dim">
                  Want to share slides or a video too? Put the link in the description for now — a dedicated field is coming next.
                </p>
                <Button type="submit" size="sm" loading={submitLoading}>
                  Submit Project
                </Button>
              </form>
            </Card>
          </motion.section>
        )}

        {/* Category Filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex flex-wrap items-center gap-3"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">
            Filter:
          </span>
          <Button
            variant={selectedCategory === "All" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setSelectedCategory("All")}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat._id || cat.name}
              variant={selectedCategory === (cat._id || cat.name) ? "primary" : "ghost"}
              size="sm"
              onClick={() => setSelectedCategory(cat._id || cat.name)}
            >
              {cat.name}
            </Button>
          ))}
        </motion.div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <Card variant="solid" className="text-center">
              <div className="py-12">
                <p className="text-4xl">🚀</p>
                <h3 className="mt-4 font-display text-xl font-bold text-white">
                  No Projects Found
                </h3>
                <p className="mt-2 text-sm text-text-muted">
                  Be the first to submit a project in this category.
                </p>
              </div>
            </Card>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project, i) => (
              <motion.div
                key={project._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.06 }}
              >
                <Card variant="glass" interactive>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-white">
                      {project.title}
                    </h3>
                    <span className="inline-block rounded-full border border-secondary/30 bg-secondary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-secondary">
                      {project.categoryName || project.category || "General"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-7 text-text-muted line-clamp-3">
                    {project.description}
                  </p>

                  {project.teamName && (
                    <p className="mt-3 font-mono text-[11px] text-primary/70">
                      Team: {project.teamName}
                    </p>
                  )}

                  {project.link && (
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block font-mono text-[11px] text-secondary underline underline-offset-4 hover:text-white"
                    >
                      View Project
                    </a>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <span className="math-text text-sm font-bold text-warning">
                      {project.votes ?? 0} votes
                    </span>
                    <Button
                      variant={project.hasVoted ? "ghost" : "secondary"}
                      size="sm"
                      disabled={project.hasVoted}
                      loading={votingId === project._id}
                      onClick={() => handleVote(project._id)}
                    >
                      {project.hasVoted ? "Voted" : "Vote"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
