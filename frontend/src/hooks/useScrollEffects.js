import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function useScrollEffects(enabled) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.utils.toArray("[data-reveal]").forEach((element) => {
        const delay = Number(element.dataset.revealDelay || 0);

        gsap.fromTo(
          element,
          {
            autoAlpha: 0,
            y: 44,
            scale: 0.985,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.95,
            delay,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 88%",
              once: true,
            },
          },
        );
      });

      gsap.utils.toArray("[data-parallax]").forEach((element) => {
        const depth = Number(element.dataset.parallax || 0.16);

        gsap.to(element, {
          yPercent: depth * 100,
          ease: "none",
          scrollTrigger: {
            trigger: element,
            start: "top bottom",
            end: "bottom top",
            scrub: 1.2,
          },
        });
      });
    });

    ScrollTrigger.refresh();

    return () => {
      ctx.revert();
    };
  }, [enabled]);
}
