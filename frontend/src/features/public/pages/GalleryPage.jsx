import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import BackgroundEffects from "@/features/public/components/gallery/BackgroundEffects";
import GalleryHero from "@/features/public/components/gallery/GalleryHero";
import GallerySection from "@/features/public/components/gallery/GallerySection";
import TreasureHuntSection from "@/features/public/components/gallery/TreasureHuntSection";

const inaugFiles = [
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176825/in1_eiu6oo.jpg", type: "img", label: "The Stage" },
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176827/in2_hatyfb.jpg", type: "img", label: "Welcome" },
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176827/in3_lqbjms.jpg", type: "img", label: "Address" },
  { url: "https://res.cloudinary.com/dd0pler5u/video/upload/v1774176826/in4_aj7j6j.mp4", type: "vid", label: "Keynote" },
  { url: "https://res.cloudinary.com/dd0pler5u/video/upload/v1774176828/in5_l2hmqn.mp4", type: "vid", label: "Demo" },
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176829/in6_jwompu.jpg", type: "img", label: "Community" },
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176832/in7_ifldal.jpg", type: "img", label: "Together" },
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176832/in8_rohg3w.jpg", type: "img", label: "Cheers" },
  { url: "https://res.cloudinary.com/dd0pler5u/image/upload/v1774176833/in9_ag3kyr.jpg", type: "img", label: "Legacy" },
];

const allClickableImages = [
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175009/th1_yu7tlg.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175073/th2_m9gf5f.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175075/th6_k25h7p.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175075/th7_ozqiy1.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175075/th8_ms0yeh.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175079/th9_rzulny.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175081/th10_jdzplq.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175081/th11_erg6vl.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175081/th12_ktjb5x.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175083/th13_riqglx.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175093/th14_hyvufj.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175084/th15_w4bpxz.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175082/th16_cgq33i.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175082/th17_j56sfy.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175083/th18_qc2msf.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175084/th19_k1pfte.jpg",
  "https://res.cloudinary.com/dd0pler5u/image/upload/v1774175084/th20_l8mobt.jpg",
  ...inaugFiles.filter((f) => f.type === "img").map((f) => f.url),
];

export default function GalleryPage() {
  const [lightbox, setLightbox] = useState(null);
  const [lbIndex, setLbIndex] = useState(0);

  const openLightbox = (url) => {
    setLightbox(url);
    const idx = allClickableImages.indexOf(url);
    setLbIndex(idx >= 0 ? idx : 0);
  };

  const navigate = (dir) => {
    const next = (lbIndex + dir + allClickableImages.length) % allClickableImages.length;
    setLbIndex(next);
    setLightbox(allClickableImages[next]);
  };

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight" && lightbox) navigate(1);
      if (e.key === "ArrowLeft" && lightbox) navigate(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <>
      <BackgroundEffects />

      <div className="relative z-10 space-y-28 pb-20">
        <GalleryHero />

        {/* Treasure Hunt — trail/map layout */}
        <TreasureHuntSection onOpen={openLightbox} />

        {/* Divider */}
        <div className="flex items-center justify-center">
          <motion.div initial={{ width: 0 }} whileInView={{ width: 200 }} viewport={{ once: true }}
            transition={{ duration: 1.2 }} className="h-px bg-gradient-to-r from-transparent via-text-dim/20 to-transparent" />
        </div>

        {/* Inauguration — Canva-style collage */}
        <GallerySection
          title="Inauguration"
          subtitle="Where it all began — the first chapter of Math Collective"
          label="The Beginning"
          files={inaugFiles}
          variant="purple"
          onOpen={openLightbox}
        />
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/96"
            onClick={() => setLightbox(null)}
          >
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[50vh] w-[50vw] rounded-full bg-primary/4 blur-[100px]" />
            </div>

            <AnimatePresence mode="wait">
              <motion.img
                key={lightbox}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                src={lightbox}
                alt="Gallery"
                className="relative z-10 max-h-[88vh] max-w-[90vw] rounded-2xl object-contain shadow-[0_0_100px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
              />
            </AnimatePresence>

            <button onClick={(e) => { e.stopPropagation(); navigate(-1); }}
              className="absolute left-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/5 text-white/40 backdrop-blur transition hover:bg-white/10 hover:text-white sm:left-8">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); navigate(1); }}
              className="absolute right-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/5 text-white/40 backdrop-blur transition hover:bg-white/10 hover:text-white sm:right-8">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button onClick={() => setLightbox(null)}
              className="absolute right-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-xl text-white/50 backdrop-blur transition hover:bg-white/15 hover:text-white">
              &times;
            </button>
            <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/6 px-4 py-1.5 font-mono text-[10px] tracking-wider text-white/40 backdrop-blur">
              {lbIndex + 1} / {allClickableImages.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
