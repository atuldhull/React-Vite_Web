/**
 * Central GSAP plugin registration.
 *
 * Import this once at app boot (or anywhere a feature needs a guarantee
 * that plugins are registered). Subsequent imports are cheap — registerPlugin
 * is idempotent.
 *
 * What's registered: the free + Webflow-acquired-then-freed plugin set.
 * Since GreenSock was acquired by Webflow in November 2024, every
 * "Club" plugin (SplitText, MorphSVG, DrawSVG, ScrollSmoother, Inertia,
 * Physics2D, ScrambleText, MotionPathHelper, GSDevTools, CustomEase,
 * CustomBounce, CustomWiggle) ships in the public `gsap` npm package.
 * No auth token required.
 *
 * Plugins NOT registered here:
 *   - PixiPlugin and EaselPlugin (require pixi.js / createjs runtime peers)
 *   - MotionPathHelper / GSDevTools (devtools — only useful at design time)
 * Add them on a per-feature basis when actually needed; loading them here
 * would bloat the initial bundle.
 */

import gsap from "gsap";
import { ScrollTrigger }     from "gsap/ScrollTrigger";
import { ScrollToPlugin }    from "gsap/ScrollToPlugin";
import { Observer }          from "gsap/Observer";
import { Draggable }         from "gsap/Draggable";
import { TextPlugin }        from "gsap/TextPlugin";
import { Flip }              from "gsap/Flip";
import { MotionPathPlugin }  from "gsap/MotionPathPlugin";
import { CustomEase }        from "gsap/CustomEase";
import { RoughEase, ExpoScaleEase, SlowMo } from "gsap/EasePack";

let registered = false;

export function registerGsapPlugins() {
  if (registered) return gsap;
  gsap.registerPlugin(
    ScrollTrigger,
    ScrollToPlugin,
    Observer,
    Draggable,
    TextPlugin,
    Flip,
    MotionPathPlugin,
    CustomEase,
    RoughEase,
    ExpoScaleEase,
    SlowMo,
  );
  // Reasonable global defaults — every tween starts from a slightly
  // softer ease unless the call site overrides. Keeps the whole site
  // visually consistent without each component re-specifying ease.
  gsap.defaults({ ease: "power3.out", duration: 0.7 });
  registered = true;
  return gsap;
}

// Register at import time so any module that pulls this file in is
// guaranteed plugins are ready before its first tween fires.
registerGsapPlugins();

export { gsap };
export default gsap;
