import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { certificates } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

const typeColors = {
  participation: "text-secondary border-secondary/30 bg-secondary/10",
  winner: "text-warning border-warning/30 bg-warning/10",
  merit: "text-glow border-glow/30 bg-glow/10",
  completion: "text-success border-success/30 bg-success/10",
};

export default function CertificatesPage() {
  useMonument("sky");
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    fetchCertificates();
  }, []);

  async function fetchCertificates() {
    try {
      setLoading(true);
      setError(null);
      const { data } = await certificates.mine();
      setCerts(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load certificates");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(cert) {
    try {
      setDownloading(cert._id);
      const response = await certificates.download(cert._id);
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cert.eventName || "certificate"}-${cert._id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to download certificate");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.15} />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader variant="orbit" size="lg" label="Loading certificates..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.15} />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <p className="text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchCertificates}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="sky" intensity={0.15} />

      <div className="relative z-10 space-y-8 pb-16">
        {/* Header */}
        <motion.section initial="hidden" animate="visible">
          <motion.div custom={0} variants={fadeUp}>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-glow">
              Achievements
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em] text-white sm:text-5xl">
              Your Certificates
            </h1>
            <p className="mt-2 text-text-muted">
              Earned through competitions, events, and achievements.
            </p>
          </motion.div>
        </motion.section>

        {/* Stats Row */}
        <motion.section
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-3"
        >
          {[
            { label: "Total Earned", value: certs.length, color: "text-primary" },
            {
              label: "Winner Awards",
              value: certs.filter((c) => c.type === "winner").length,
              color: "text-warning",
            },
            {
              label: "Merit Awards",
              value: certs.filter((c) => c.type === "merit").length,
              color: "text-glow",
            },
          ].map((stat, i) => (
            <motion.div key={stat.label} custom={i + 1} variants={fadeUp}>
              <Card variant="glass" className="text-center">
                <p className={`math-text text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  {stat.label}
                </p>
              </Card>
            </motion.div>
          ))}
        </motion.section>

        {/* Certificates Grid */}
        {certs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card variant="solid" className="text-center">
              <div className="py-12">
                <p className="text-4xl">📜</p>
                <h3 className="mt-4 font-display text-xl font-bold text-white">
                  No Certificates Yet
                </h3>
                <p className="mt-2 text-sm text-text-muted">
                  Participate in events and competitions to earn certificates.
                </p>
              </div>
            </Card>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {certs.map((cert, i) => (
              <motion.div
                key={cert._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
              >
                <Card variant="glass" interactive>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-secondary/20 to-glow/20 text-2xl">
                      {cert.type === "winner" ? "🏆" : cert.type === "merit" ? "🏅" : "📜"}
                    </div>
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        typeColors[cert.type] || typeColors.participation
                      }`}
                    >
                      {cert.type || "Participation"}
                    </span>
                  </div>

                  <h3 className="mt-4 font-display text-lg font-bold tracking-[-0.02em] text-white">
                    {cert.eventName || cert.title || "Certificate"}
                  </h3>

                  {cert.description && (
                    <p className="mt-1 text-sm text-text-muted line-clamp-2">
                      {cert.description}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    {cert.issuedAt && (
                      <span className="font-mono text-[10px] text-text-dim">
                        {new Date(cert.issuedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center"
                      loading={downloading === cert._id}
                      onClick={() => handleDownload(cert)}
                    >
                      Download
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
