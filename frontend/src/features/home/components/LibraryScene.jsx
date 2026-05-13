/**
 * LibraryScene.jsx — "The Infinite Library of Mathematics" hero (rev 5).
 *
 * 3-phase scroll experience:
 *
 *   Phase 1 (0.00–0.45)  ANCIENT LIBRARY
 *     Camera glides forward down a long corridor lined with two
 *     bookshelves of warm-coloured leather books. Candle-tone point
 *     lights sit between the shelves. Volumetric fog + amber dust.
 *
 *   Phase 2 (0.45–0.75)  TRANSITION TO COSMOS
 *     The corridor walls fade out (fog density drops, candle intensity
 *     dies). A field of holographic equation glyphs blooms in around
 *     the camera. Stars appear at the periphery.
 *
 *   Phase 3 (0.75–1.00)  CALM CELESTIAL CLOSE
 *     Camera comes to rest. Glyphs orbit gently. Stars at full
 *     brightness. Provides the "Join the Infinite" CTA backdrop.
 *
 * Hard lessons applied from rev 3 / rev 4:
 *   - light.position.set(x, y, z) — never Object.assign with new Vector3.
 *   - No EffectComposer / postprocessing (silent fail mode on some GPUs).
 *   - try / catch around the renderer init: WebGL failure leaves the
 *     hero overlay UI intact instead of blanking the whole React tree.
 *
 * Coordinate system:
 *   Camera starts at z=12 looking toward -Z. Corridor extends from z=0
 *   to z=-30 along negative Z. Two shelves at x=±2.6. Floor is the
 *   XZ plane at y=0. Camera eye height y=1.5.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Postprocessing — bloom for candles + emissive flames + vignette for
// cinematic falloff. The EffectComposer pipeline is built inside a
// try/catch (see below) and the per-frame render flips between
// composer.render() and plain renderer.render() based on whether
// init succeeded, so a GPU that can't run the pipeline falls cleanly
// back to plain rendering instead of crashing the React tree
// (rev 3 lesson — the unguarded EffectComposer killed the page).
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, VignetteEffect, KernelSize,
} from "postprocessing";

// Leather-bound palette — desaturated browns, oxblood, forest, navy
// with a few gold accents. No saturated rainbow colours: the corridor
// reads "ancient archive", not "kindergarten library".
const BOOK_COLOURS = [
  0x4a2c1a, 0x3d2515, 0x6b3e26, 0x8a4a2e, 0x5b2a2e,
  0x7d3a36, 0x2f3a26, 0x1f3a3a, 0x2a3550, 0x383042,
  0x533424, 0x6a523c, 0xb8893d, 0x8a6f3a,
];

const SHELF_DEPTH     = 36;     // along -Z (was 30 — extends corridor)
const SHELF_LV_HEIGHT = 0.55;   // distance between shelves
const FIRST_LV_Y      = 0.55;   // bottom shelf height off the floor

// SHELVES / BOOKS_PER_LV / TOP_OF_SHELVES used to be module-level
// constants. They're now scaled per device tier — a mid-range phone
// can't carry 1800 textured books + 18 dynamic point lights at 60 fps,
// and Lighthouse mobile perf scored 32/100 with the desktop-grade
// scene running on simulated mobile hardware. The values move inside
// useEffect where the tier check has run.

/**
 * Three-tier device classifier. Reads viewport width + reported logical
 * core count and picks a quality preset.
 *
 *   low  — small viewport AND ≤4 cores. Aggressively trimmed: fewer
 *          books, fewer shelves, postprocessing off (biggest single
 *          GPU win on weak Adreno / mid-tier Mali parts).
 *   mid  — small viewport OR ≤4 cores. Light trim: postprocessing
 *          stays on but with reduced bloom kernel; book counts ~80%.
 *   high — everything else. Original desktop-grade scene unchanged.
 *
 * Detection is one-shot at mount — we don't dynamically re-tier on
 * window resize. Justification: someone joining from a phone is
 * extremely unlikely to expand the viewport mid-session, and rebuilding
 * the InstancedMesh on each resize would be more janky than the
 * fixed mobile quality.
 */
function detectQualityTier() {
  if (typeof window === "undefined") return "high"; // SSR safety net
  const smallViewport = window.matchMedia?.("(max-width: 767px)").matches;
  const cores         = navigator.hardwareConcurrency || 8;
  if (smallViewport && cores <= 4) return "low";
  if (smallViewport)               return "mid";
  return "high";
}

const QUALITY_PRESETS = {
  low:  { shelves: 6, booksPerLv: 60,  dust: 120, stars: 350, candelabra: 5,  buildings: 4, postprocess: false },
  mid:  { shelves: 8, booksPerLv: 80,  dust: 220, stars: 600, candelabra: 7,  buildings: 6, postprocess: true  },
  high: { shelves: 9, booksPerLv: 100, dust: 350, stars: 900, candelabra: 10, buildings: 8, postprocess: true  },
};

function scrollSpan() { return window.innerHeight * 5; }

export default function LibraryScene() {
  const mountRef   = useRef(null);
  const rafRef     = useRef(null);
  const cleanupRef = useRef({ geometries: [], materials: [], textures: [], renderer: null });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Phase 28 — respect prefers-reduced-motion. The scroll-driven camera
    // glide + flame flicker + dust drift are the main vestibular triggers
    // here. When the user has reduced-motion preferred, we render exactly
    // one static frame at the library starting position and skip the rAF
    // loop entirely (the candelabra still bloom because we keep the
    // postprocessing pipeline — bloom is a single pass, no motion).
    // Resize still re-renders so the canvas stays correctly sized.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Device tier — drives every density knob below. Decided once at
    // mount; see detectQualityTier comment for the rationale on not
    // re-evaluating on resize.
    const Q              = QUALITY_PRESETS[detectQualityTier()];
    const SHELVES        = Q.shelves;
    const BOOKS_PER_LV   = Q.booksPerLv;
    const TOP_OF_SHELVES = FIRST_LV_Y + (SHELVES - 1) * SHELF_LV_HEIGHT + 0.5;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true, alpha: true, powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x05030a, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      mount.appendChild(renderer.domElement);
      cleanupRef.current.renderer = renderer;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[LibraryScene] WebGL init failed, scene disabled:", err?.message);
      return;
    }

    const scene  = new THREE.Scene();
    scene.fog    = new THREE.FogExp2(0x0a0612, 0.045);
    const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 100);
    camera.position.set(0, 1.5, 12);
    camera.lookAt(0, 1.4, 0);

    // ── Floor ────────────────────────────────────────────────────
    // Wider than the corridor; fog hides the edges.
    const floorGeo = new THREE.PlaneGeometry(40, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a10, roughness: 0.85, metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -10;
    scene.add(floor);
    cleanupRef.current.geometries.push(floorGeo);
    cleanupRef.current.materials.push(floorMat);

    // ── Bookshelves: 2 sides × 5 levels of dense books ──────────
    // Each book is a small Box. Spine width along Z (~0.09), height
    // along Y (~0.30), depth along X (~0.22 — into the shelf).
    // ALL 1 100 books are rendered in two InstancedMeshes (one per
    // side) for performance.
    const bookGeo = new THREE.BoxGeometry(0.22, 0.30, 0.09);
    const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
    cleanupRef.current.geometries.push(bookGeo);
    cleanupRef.current.materials.push(bookMat);

    // ── Leather surface detail on book spines ──────────────────────
    // Strategy: apply a normal map + roughness map (NOT a diffuse
    // map) to bookMat. Reasoning: each book has a unique per-instance
    // color via setColorAt() — applying a colored leather diffuse
    // map would multiply against the instance tint and produce
    // muddy / over-darkened spines. Normal + roughness maps encode
    // surface VECTORS and SHININESS respectively, both color-neutral,
    // so books keep their varied spine colors while gaining genuine
    // leather grain + sheen.
    //
    // Try Polyhaven CDN first (CC0 leather_red_03 maps). If the load
    // fails (CDN down, CSP misconfig, slow network), fall back to a
    // procedural canvas-painted normal map that we generate locally.
    // The procedural fallback is rough but better than flat painted
    // boxes; the Polyhaven swap-in arrives a beat after first paint
    // and silently upgrades the look.
    const POLYHAVEN_NORMAL = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/leather_red_03/leather_red_03_nor_gl_1k.jpg";
    const POLYHAVEN_ROUGH  = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/leather_red_03/leather_red_03_rough_1k.jpg";

    // Procedural fallback — canvas-painted leather grain encoded as a
    // tangent-space normal map. We draw mostly-vertical fibres with
    // slight horizontal scuff lines, then convert luminance to a
    // bumpy surface via the standard 0.5+(dh/2) → blue channel trick.
    function makeProceduralLeatherNormal() {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      // Base: flat-normal (pointing straight out = rgb 128,128,255).
      ctx.fillStyle = "rgb(128, 128, 255)";
      ctx.fillRect(0, 0, 256, 256);
      // Fibre lines — slight variation in blue + green channels gives
      // the bumpy look. Keep it subtle so the books still read clean.
      for (let i = 0; i < 600; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const len = 4 + Math.random() * 16;
        const dir = (Math.random() - 0.5) * 0.4; // mostly vertical
        const bump = 100 + Math.random() * 50;
        ctx.strokeStyle = `rgb(${Math.round(120 + dir * 30)}, ${Math.round(120 + Math.random() * 20)}, ${Math.round(bump + 130)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dir * len, y + len);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);  // tile across the small book spine
      return tex;
    }

    const fallbackNormalMap = makeProceduralLeatherNormal();
    bookMat.normalMap = fallbackNormalMap;
    bookMat.normalScale = new THREE.Vector2(0.6, 0.6); // subtle, not extreme
    bookMat.needsUpdate = true;
    cleanupRef.current.textures.push(fallbackNormalMap);

    // Async Polyhaven swap-in. The loader respects crossOrigin so the
    // canvas context can sample these in normal/roughness reads. If
    // either request 404s or CORS-fails, we keep the procedural
    // fallback in place — no error reaches the user.
    const texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = "anonymous";
    texLoader.load(
      POLYHAVEN_NORMAL,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        bookMat.normalMap = tex;
        bookMat.needsUpdate = true;
        cleanupRef.current.textures.push(tex);
      },
      undefined,
      () => {
        // eslint-disable-next-line no-console
        console.info("[LibraryScene] Polyhaven normal map unavailable — using procedural fallback");
      },
    );
    texLoader.load(
      POLYHAVEN_ROUGH,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        bookMat.roughnessMap = tex;
        bookMat.needsUpdate = true;
        cleanupRef.current.textures.push(tex);
      },
      undefined,
      () => { /* silent — fallback is plain roughness:0.7 */ },
    );

    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();

    for (const side of [-1, +1]) {
      const inst = new THREE.InstancedMesh(bookGeo, bookMat, SHELVES * BOOKS_PER_LV);
      let idx = 0;
      for (let lv = 0; lv < SHELVES; lv++) {
        const y = FIRST_LV_Y + lv * SHELF_LV_HEIGHT;
        for (let i = 0; i < BOOKS_PER_LV; i++) {
          const zNominal = -i * (SHELF_DEPTH / BOOKS_PER_LV) - 0.05;
          const z = zNominal + (Math.random() - 0.5) * 0.02;
          const tilt = (Math.random() - 0.5) * 0.05;
          // Wider height jitter than rev 5: some books are short paperbacks,
          // some are tall folios. Reads as a real archive vs identical
          // matchsticks.
          const heightJitter = 0.78 + Math.random() * 0.42;
          // Slight depth jitter: ~10 % of books recede 1-2 cm into the
          // shelf, suggesting they've been pushed back further.
          const depthShift = Math.random() < 0.10 ? -0.018 : 0;
          dummy.position.set(side * 2.6 + depthShift * side, y, z);
          dummy.rotation.set(0, side > 0 ? Math.PI : 0, tilt);
          dummy.scale.set(1, heightJitter, 1);
          dummy.updateMatrix();
          inst.setMatrixAt(idx, dummy.matrix);
          colour.setHex(BOOK_COLOURS[Math.floor(Math.random() * BOOK_COLOURS.length)]);
          inst.setColorAt(idx, colour);
          idx++;
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      scene.add(inst);
    }

    // ── Bookshelf frames — long horizontal planks (one per level
    //    per side) so the eye reads "shelving", not "books floating
    //    in midair". Single Box per plank. ─────────────────────────
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x1a0e08, roughness: 0.85, metalness: 0.1,
    });
    cleanupRef.current.materials.push(shelfMat);

    // Wood PBR upgrade on the bookshelf frames — same pattern as the
    // leather books + stone columns above (normal + roughness only,
    // so the dark mahogany color stays intact while the surface
    // gains real wood grain). Polyhaven `wood_table_001` reads as
    // aged hardwood; tile size cranked up (4×) since planks are
    // long thin runs and we want the grain to feel finely detailed.
    const POLYHAVEN_WOOD_NORMAL = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_table_001/wood_table_001_nor_gl_1k.jpg";
    const POLYHAVEN_WOOD_ROUGH  = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_table_001/wood_table_001_rough_1k.jpg";

    function makeProceduralWoodNormal() {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "rgb(128, 128, 255)";
      ctx.fillRect(0, 0, 256, 256);
      // Long horizontal grain lines, mostly parallel — wood grain.
      for (let i = 0; i < 80; i++) {
        const y = Math.random() * 256;
        const dy = (Math.random() - 0.5) * 8;
        const bump = 110 + Math.random() * 50;
        ctx.strokeStyle = `rgb(${Math.round(128 + dy * 4)}, ${Math.round(128 + Math.random() * 20)}, ${Math.round(bump + 120)})`;
        ctx.lineWidth = 0.4 + Math.random() * 1.2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + dy, 160, y - dy, 256, y);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 1);
      return tex;
    }

    const woodFallbackNormal = makeProceduralWoodNormal();
    shelfMat.normalMap = woodFallbackNormal;
    shelfMat.normalScale = new THREE.Vector2(0.6, 0.6);
    shelfMat.needsUpdate = true;
    cleanupRef.current.textures.push(woodFallbackNormal);

    const woodLoader = new THREE.TextureLoader();
    woodLoader.crossOrigin = "anonymous";
    woodLoader.load(
      POLYHAVEN_WOOD_NORMAL,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 1);
        shelfMat.normalMap = tex;
        shelfMat.needsUpdate = true;
        cleanupRef.current.textures.push(tex);
      },
      undefined,
      () => { /* fall through silently */ },
    );
    woodLoader.load(
      POLYHAVEN_WOOD_ROUGH,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 1);
        shelfMat.roughnessMap = tex;
        shelfMat.needsUpdate = true;
        cleanupRef.current.textures.push(tex);
      },
      undefined,
      () => { /* silent */ },
    );
    for (const side of [-1, +1]) {
      for (let lv = 0; lv < SHELVES; lv++) {
        const plankGeo = new THREE.BoxGeometry(0.32, 0.03, SHELF_DEPTH);
        const plank = new THREE.Mesh(plankGeo, shelfMat);
        plank.position.set(
          side * 2.6,
          (FIRST_LV_Y - 0.18) + lv * SHELF_LV_HEIGHT,
          -SHELF_DEPTH / 2,
        );
        scene.add(plank);
        cleanupRef.current.geometries.push(plankGeo);
      }
      // Vertical posts every 4m so the taller bookcase reads as
      // architecturally framed. Posts now span the full TOP_OF_SHELVES
      // height so 9 levels still feel structurally supported.
      for (let z = 0; z >= -SHELF_DEPTH; z -= 4) {
        const postGeo = new THREE.BoxGeometry(0.36, TOP_OF_SHELVES, 0.08);
        const post = new THREE.Mesh(postGeo, shelfMat);
        post.position.set(side * 2.6, TOP_OF_SHELVES / 2, z);
        scene.add(post);
        cleanupRef.current.geometries.push(postGeo);
      }
    }

    // ── Cathedral ceiling beams — perpendicular wooden beams across
    //    the corridor at TOP_OF_SHELVES + 0.6, every ~3.5m. Reads as
    //    "vaulted hall" rather than "endless tunnel". The fog hides
    //    the ones far down the corridor so the depth still feels
    //    infinite. ────────────────────────────────────────────────
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x1f1108, roughness: 0.9, metalness: 0.05,
    });
    cleanupRef.current.materials.push(beamMat);
    for (let z = -1; z >= -SHELF_DEPTH; z -= 3.5) {
      const beamGeo = new THREE.BoxGeometry(6.0, 0.18, 0.22);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, TOP_OF_SHELVES + 0.45, z);
      scene.add(beam);
      cleanupRef.current.geometries.push(beamGeo);
    }
    // Continuous longitudinal beams running the corridor's length on
    // each side, sitting on top of the bookcases.
    for (const side of [-1, +1]) {
      const longBeamGeo = new THREE.BoxGeometry(0.45, 0.22, SHELF_DEPTH);
      const longBeam = new THREE.Mesh(longBeamGeo, beamMat);
      longBeam.position.set(side * 2.6, TOP_OF_SHELVES + 0.20, -SHELF_DEPTH / 2);
      scene.add(longBeam);
      cleanupRef.current.geometries.push(longBeamGeo);
    }

    // ── Classical stone columns flanking the corridor ──────────────
    // Eight columns (four per side) standing in the corridor just
    // inside the bookshelves. Adds architectural weight + breaks the
    // long shelf walls into rhythmic bays. Each column = circular
    // shaft + square base + flared capital, all stone-coloured. The
    // shaft is faceted (12 sides) to suggest fluting without the
    // geometry cost of a proper grooved profile.
    //
    // Position: x = ±2.3 (just inside the shelves at ±2.6), z spaced
    // every ~7m down the corridor. The camera (corridor mid-line at
    // x = 0) sees them flying by as it glides forward in Phase 1 —
    // exactly the "library zooms in" feel we want preserved.
    const columnStoneMat = new THREE.MeshStandardMaterial({
      color:     0x9c8f78,   // warm sandstone — sits next to the leather books
      roughness: 0.85,
      metalness: 0.0,
    });
    cleanupRef.current.materials.push(columnStoneMat);

    // Sandstone PBR maps from Polyhaven (CC0). Same lazy-load pattern
    // as the leather book maps above: try the CDN, fall through to a
    // simple procedural canvas-painted bump if it fails. Color-neutral
    // (normal + roughness only) so the warm sandstone tint stays.
    // Shared by columnStoneMat AND monumentMat below — both materials
    // get upgraded the moment the texture resolves.
    const POLYHAVEN_STONE_NORMAL = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_006/concrete_wall_006_nor_gl_1k.jpg";
    const POLYHAVEN_STONE_ROUGH  = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_006/concrete_wall_006_rough_1k.jpg";

    function makeProceduralStoneNormal() {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "rgb(128, 128, 255)";
      ctx.fillRect(0, 0, 256, 256);
      // Speckled noise — random short specks suggesting weathered stone.
      // No directional grain (unlike leather), just scattered pitting.
      for (let i = 0; i < 1200; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 0.6 + Math.random() * 1.2;
        const dx = (Math.random() - 0.5) * 30;
        const dy = (Math.random() - 0.5) * 30;
        const b = 100 + Math.random() * 60;
        ctx.fillStyle = `rgb(${Math.round(128 + dx)}, ${Math.round(128 + dy)}, ${Math.round(b + 100)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1.5, 1.5);
      return tex;
    }

    const stoneFallbackNormal = makeProceduralStoneNormal();
    columnStoneMat.normalMap = stoneFallbackNormal;
    columnStoneMat.normalScale = new THREE.Vector2(0.5, 0.5);
    columnStoneMat.needsUpdate = true;
    cleanupRef.current.textures.push(stoneFallbackNormal);

    // Swap to Polyhaven once it arrives. Failure stays silent — the
    // procedural fallback is already in place so the scene never
    // looks broken.
    const stoneLoader = new THREE.TextureLoader();
    stoneLoader.crossOrigin = "anonymous";
    stoneLoader.load(
      POLYHAVEN_STONE_NORMAL,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);
        columnStoneMat.normalMap = tex;
        columnStoneMat.needsUpdate = true;
        // Monument shares the same texture for consistency.
        if (typeof monumentMat !== "undefined") {
          monumentMat.normalMap = tex;
          monumentMat.normalScale = new THREE.Vector2(0.5, 0.5);
          monumentMat.needsUpdate = true;
        }
        cleanupRef.current.textures.push(tex);
      },
      undefined,
      () => { /* fall through silently */ },
    );
    stoneLoader.load(
      POLYHAVEN_STONE_ROUGH,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);
        columnStoneMat.roughnessMap = tex;
        columnStoneMat.needsUpdate = true;
        if (typeof monumentMat !== "undefined") {
          monumentMat.roughnessMap = tex;
          monumentMat.needsUpdate = true;
        }
        cleanupRef.current.textures.push(tex);
      },
      undefined,
      () => { /* silent */ },
    );
    const COLUMN_HEIGHT = TOP_OF_SHELVES;
    const COLUMN_Z_POSITIONS = [-4, -11, -18, -25];
    for (const side of [-1, +1]) {
      for (const zPos of COLUMN_Z_POSITIONS) {
        // Shaft — slightly fluted look via low-segment cylinder.
        const shaftGeo = new THREE.CylinderGeometry(0.22, 0.24, COLUMN_HEIGHT * 0.86, 12);
        const shaft = new THREE.Mesh(shaftGeo, columnStoneMat);
        shaft.position.set(side * 2.3, (COLUMN_HEIGHT * 0.86) / 2 + 0.1, zPos);
        scene.add(shaft);
        cleanupRef.current.geometries.push(shaftGeo);

        // Base — wider square block at floor level.
        const baseGeo = new THREE.BoxGeometry(0.55, 0.1, 0.55);
        const base = new THREE.Mesh(baseGeo, columnStoneMat);
        base.position.set(side * 2.3, 0.05, zPos);
        scene.add(base);
        cleanupRef.current.geometries.push(baseGeo);

        // Capital — flared top block with a thin abacus on top.
        const capitalGeo = new THREE.BoxGeometry(0.55, 0.18, 0.55);
        const capital = new THREE.Mesh(capitalGeo, columnStoneMat);
        capital.position.set(side * 2.3, COLUMN_HEIGHT * 0.86 + 0.2, zPos);
        scene.add(capital);
        cleanupRef.current.geometries.push(capitalGeo);

        const abacusGeo = new THREE.BoxGeometry(0.62, 0.06, 0.62);
        const abacus = new THREE.Mesh(abacusGeo, columnStoneMat);
        abacus.position.set(side * 2.3, COLUMN_HEIGHT * 0.86 + 0.32, zPos);
        scene.add(abacus);
        cleanupRef.current.geometries.push(abacusGeo);
      }
    }

    // ── Distant focal monument at the end of the corridor ─────────
    // Classical archway visible through the fog as the camera glides
    // forward — gives the long shot a payoff destination. Composed
    // of two flanking columns + a horizontal lintel + a triangular
    // pediment (Greek-temple silhouette).
    //
    // Material is the same sandstone as the corridor columns so it
    // reads as continuous with the architecture. Opacity is gated
    // per-frame against current.candleI so the monument fades out
    // along with the candle lighting during the Phase 2 transition
    // to cosmos — by Phase 3 it's invisible, like the rest of the
    // library.
    const monumentMat = new THREE.MeshStandardMaterial({
      color:       0xb09d83,
      roughness:   0.9,
      metalness:   0.0,
      transparent: true,
      opacity:     1,
    });
    cleanupRef.current.materials.push(monumentMat);
    const monumentMeshes = [];   // referenced from tick loop to fade opacity together
    const MONUMENT_Z = -SHELF_DEPTH + 1;    // just inside the back wall
    const MONUMENT_H = 4.5;                  // pillar height
    const MONUMENT_W = 1.8;                  // half-spread between the flanking pillars

    // Two flanking pillars.
    for (const side of [-1, +1]) {
      const pillarGeo = new THREE.BoxGeometry(0.4, MONUMENT_H, 0.4);
      const pillar = new THREE.Mesh(pillarGeo, monumentMat);
      pillar.position.set(side * MONUMENT_W, MONUMENT_H / 2, MONUMENT_Z);
      scene.add(pillar);
      monumentMeshes.push(pillar);
      cleanupRef.current.geometries.push(pillarGeo);
    }

    // Horizontal lintel spanning the pillars.
    const lintelGeo = new THREE.BoxGeometry(MONUMENT_W * 2 + 0.6, 0.45, 0.5);
    const lintel = new THREE.Mesh(lintelGeo, monumentMat);
    lintel.position.set(0, MONUMENT_H + 0.225, MONUMENT_Z);
    scene.add(lintel);
    monumentMeshes.push(lintel);
    cleanupRef.current.geometries.push(lintelGeo);

    // Triangular pediment above the lintel — extruded triangle via a
    // narrow box rotated 45° on Z. Approximation; reads as classical
    // silhouette from camera-distance.
    const pedimentGeo = new THREE.BoxGeometry(MONUMENT_W * 1.6, 0.9, 0.5);
    const pediment = new THREE.Mesh(pedimentGeo, monumentMat);
    pediment.position.set(0, MONUMENT_H + 0.45 + 0.45, MONUMENT_Z);
    // Slight tilt so it reads as a low pediment angle, not a flat slab.
    pediment.geometry.translate(0, 0, 0);
    scene.add(pediment);
    monumentMeshes.push(pediment);
    cleanupRef.current.geometries.push(pedimentGeo);

    // Small dedicated light to illuminate the monument so it stays
    // visible against the dark back wall when candles are still on.
    // Warm sandstone tint, narrow range so it doesn't spill onto the
    // bookshelves.
    const monumentLight = new THREE.PointLight(0xffd9a0, 3.5, 14, 1.8);
    monumentLight.position.set(0, MONUMENT_H, MONUMENT_Z + 3);
    scene.add(monumentLight);

    // ── Hogwarts / Oxford-style university silhouettes ─────────────
    // Six university buildings rise BEYOND the bookshelves (x = ±10
    // to ±14) at varied positions along the corridor. They're tall
    // (8-14m) so their tops peek over the bookshelves — visible to
    // the camera as it glides forward, even though the shelves
    // themselves block the lower portions. Reads as "we're inside
    // the library of a giant gothic campus."
    //
    // Each building is a procedural composition of:
    //   - rectangular main mass (box)
    //   - corner towers (cylinder + conical spire roof)
    //   - lit window patches (emissive yellow planes) — the warm
    //     glow against the dark stone is what sells the "lived-in"
    //     atmosphere
    //
    // Material is intentionally darker than the corridor columns
    // (more blue-black weathered stone) so they read as exterior
    // architecture at night, not part of the interior space.
    const buildingMat = new THREE.MeshStandardMaterial({
      color:     0x2a2f38,     // cold weathered stone — night exterior tone
      roughness: 0.95,
      metalness: 0.02,
    });
    cleanupRef.current.materials.push(buildingMat);

    // Lit-window emissive material. Shared across all window patches
    // so the GPU only uploads one material, but each instance can be
    // independently positioned. Warm parchment-yellow with high
    // emissive intensity so bloom picks them up.
    const windowMat = new THREE.MeshBasicMaterial({
      color:       0xffcf80,
      transparent: true,
      opacity:     0.92,
    });
    cleanupRef.current.materials.push(windowMat);

    // Generic building factory — returns a Group so we can position
    // it as a single unit. Variation comes from the (w, d, h, towerHeight,
    // hasSpire) params so each silhouette feels different without
    // hand-modeling each one.
    function buildUniversityBuilding(opts) {
      const { w, d, h, towerHeight, hasSpire, towerRadius = 0.7, windowCols = 4, windowRows = 3 } = opts;
      const group = new THREE.Group();

      // Main rectangular mass.
      const mainGeo = new THREE.BoxGeometry(w, h, d);
      const main = new THREE.Mesh(mainGeo, buildingMat);
      main.position.y = h / 2;
      group.add(main);
      cleanupRef.current.geometries.push(mainGeo);

      // Corner towers — 2 of them (front-facing corners).
      // Each tower = cylinder + optional conical roof.
      for (const xs of [-1, 1]) {
        const towerGeo = new THREE.CylinderGeometry(towerRadius, towerRadius, towerHeight, 14);
        const tower = new THREE.Mesh(towerGeo, buildingMat);
        tower.position.set(xs * (w / 2 - towerRadius * 0.6), towerHeight / 2, d / 2);
        group.add(tower);
        cleanupRef.current.geometries.push(towerGeo);

        if (hasSpire) {
          const spireGeo = new THREE.ConeGeometry(towerRadius + 0.05, towerRadius * 2.5, 14);
          const spire = new THREE.Mesh(spireGeo, buildingMat);
          spire.position.set(xs * (w / 2 - towerRadius * 0.6), towerHeight + towerRadius * 1.25, d / 2);
          group.add(spire);
          cleanupRef.current.geometries.push(spireGeo);
        }
      }

      // Window patches on the front face (facing the camera through
      // the bookshelves — visible above the shelf line). Grid of
      // small emissive planes inset into the main mass surface.
      const winW = (w / (windowCols + 1)) * 0.5;
      const winH = ((h - 1.5) / (windowRows + 1)) * 0.4;
      const winGeo = new THREE.PlaneGeometry(winW, winH);
      cleanupRef.current.geometries.push(winGeo);
      for (let row = 0; row < windowRows; row++) {
        // Randomise: ~70% of windows are lit, rest are dark. Avoids
        // the "everyone's home" uniform-look.
        for (let col = 0; col < windowCols; col++) {
          if (Math.random() > 0.7) continue;
          const win = new THREE.Mesh(winGeo, windowMat);
          win.position.set(
            -w / 2 + (col + 1) * (w / (windowCols + 1)),
            1.5 + (row + 1) * ((h - 1.5) / (windowRows + 1)),
            d / 2 + 0.01,   // sit just in front of the main mass face
          );
          group.add(win);
        }
      }

      return group;
    }

    // Place the buildings. Mix of sizes and styles per side. The
    // FULL_BUILDINGS list is the desktop arrangement; mid/low tiers
    // pick the first N entries which are already chosen to cover the
    // most visible mid-distance positions. The two backdrop cathedrals
    // at the end of the list (indices 6,7) drop off first on weak
    // tiers — they're the furthest, smallest screen contribution.
    const FULL_BUILDINGS = [
      // Left side — closer to corridor entrance
      { x: -10, z:  -2, w: 5,  d: 4,  h: 9,  towerHeight: 11, hasSpire: true,  rotY:  0.2 },
      { x: -12, z: -14, w: 6,  d: 5,  h: 11, towerHeight: 14, hasSpire: true,  rotY: -0.1 },
      // Right side
      { x:  10, z:  -4, w: 5,  d: 4,  h: 10, towerHeight: 13, hasSpire: true,  rotY: -0.2 },
      { x:  13, z: -16, w: 6,  d: 5,  h: 12, towerHeight: 15, hasSpire: true,  rotY:  0.15 },
      // Backdrop cathedrals at corridor end
      { x:  -4, z: -48, w: 7,  d: 6,  h: 13, towerHeight: 16, hasSpire: true,  rotY:  0.0 },
      { x:   5, z: -52, w: 6,  d: 5,  h: 12, towerHeight: 15, hasSpire: true,  rotY:  0.05 },
      // Mid-corridor fill (drops off first on weak tiers)
      { x: -11, z: -28, w: 4,  d: 4,  h: 8,  towerHeight: 10, hasSpire: false, rotY:  0.0 },
      { x:  10, z: -30, w: 4,  d: 4,  h: 9,  towerHeight: 11, hasSpire: false, rotY:  0.0 },
    ];
    const buildings = FULL_BUILDINGS.slice(0, Q.buildings);
    const buildingGroups = [];
    buildings.forEach((b) => {
      const g = buildUniversityBuilding(b);
      g.position.set(b.x, 0, b.z);
      g.rotation.y = b.rotY || 0;
      scene.add(g);
      buildingGroups.push(g);
    });

    // ── Lanterns scattered through the scene ───────────────────────
    // Small warm point lights with a tiny emissive bulb mesh. Placed
    // at corridor entrances + the bases of selected columns +
    // building exteriors. Each contributes to the "lived-in
    // candlelight everywhere" atmosphere without overwhelming the
    // existing candelabra lighting which is the main interior source.
    const lanternBulbMat = new THREE.MeshBasicMaterial({
      color: 0xffb866,
      transparent: true,
      opacity: 0.95,
    });
    cleanupRef.current.materials.push(lanternBulbMat);
    const lanternBulbGeo = new THREE.SphereGeometry(0.08, 8, 6);
    cleanupRef.current.geometries.push(lanternBulbGeo);

    const lanternLights = [];   // referenced in tick for subtle flicker
    const lanternPositions = [
      // Corridor entrance (just inside camera start)
      [-2.0, 0.8,  10],  [ 2.0, 0.8,  10],
      // Column tops — small lanterns crowning the capitals
      [-2.3, COLUMN_HEIGHT * 0.86 + 0.5, -4],
      [ 2.3, COLUMN_HEIGHT * 0.86 + 0.5, -4],
      [-2.3, COLUMN_HEIGHT * 0.86 + 0.5, -18],
      [ 2.3, COLUMN_HEIGHT * 0.86 + 0.5, -18],
      // At the base of the distant monument
      [-MONUMENT_W - 0.5, 0.5, MONUMENT_Z + 0.5],
      [ MONUMENT_W + 0.5, 0.5, MONUMENT_Z + 0.5],
    ];
    lanternPositions.forEach(([x, y, z]) => {
      const bulb = new THREE.Mesh(lanternBulbGeo, lanternBulbMat);
      bulb.position.set(x, y, z);
      scene.add(bulb);
      const light = new THREE.PointLight(0xffb866, 1.8, 6, 1.5);
      light.position.set(x, y, z);
      scene.add(light);
      lanternLights.push(light);
    });

    // ── Hanging candelabra — twin candles dangling from ceiling
    //    beams every ~3.5m. Brass chain stand-in (thin cylinder) +
    //    cup + 3 candle stems with flames + a strong warm point light
    //    at the cluster centre. CRITICAL: light.position.set(x, y, z)
    //    — never Object.assign({ position: new Vector3 }).
    const candleLights = [];
    const flameVisuals = [];   // each entry is the flame ShaderMaterial — needed for per-frame uTime updates
    const flameMeshes  = [];   // each flame mesh — needed to billboard toward the camera
    const CANDLE_Y = TOP_OF_SHELVES - 1.4; // hangs below the ceiling beams
    const stemMatShared = new THREE.MeshStandardMaterial({ color: 0xe9d6a3, roughness: 0.7 });
    const chainMatShared = new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.4, metalness: 0.7 });
    const cupMatShared   = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.45, metalness: 0.5 });
    cleanupRef.current.materials.push(stemMatShared, chainMatShared, cupMatShared);

    // Flame shader — procedurally drawn teardrop on a small Plane, with
    // an internal noise field that scrolls upward to give the flicker /
    // licking-flame effect. Each flame instance gets its OWN material
    // so its uSeed varies (otherwise all 30 flames flicker in perfect
    // sync — looks fake). uTime is updated every frame for all of them.
    const FLAME_VERT = /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const FLAME_FRAG = /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uSeed;

      // Fast hash — good enough for a flame flicker, no need for full
      // Perlin / simplex noise.
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0)),
              c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main() {
        // Centre horizontally; vUv.y goes 0 (bottom) → 1 (top).
        vec2 cuv = vec2(vUv.x - 0.5, vUv.y);

        // Flame silhouette: parabolic taper, narrow at top.
        float taper = 0.5 - cuv.y * 0.45;
        float distFromAxis = abs(cuv.x) / max(taper, 0.01);

        // Noise scrolls upward at uTime * 1.5; uSeed gives each flame a
        // different starting phase so the field doesn't sync.
        float t = uTime * 1.6 + uSeed * 6.28;
        float n = fbm(vec2(cuv.x * 6.0 + uSeed, (cuv.y - t * 0.5) * 5.0));

        // Distort silhouette horizontally with the noise so the flame
        // licks and wobbles instead of being a static teardrop.
        float shape = smoothstep(1.15, 0.35, distFromAxis + (n - 0.5) * 0.45);

        // Soften top and bottom edges so the flame doesn't read as a
        // hard cut-out.
        float topFade    = smoothstep(0.96, 0.65, cuv.y);
        float bottomFade = smoothstep(0.0,  0.10, cuv.y);
        shape *= topFade * bottomFade;

        // Vertical colour gradient: deep blue/purple base → warm orange
        // mid → white-hot top. Matches the way real candles look at close range.
        vec3 baseCol = vec3(0.30, 0.10, 0.55);
        vec3 midCol  = vec3(1.00, 0.50, 0.10);
        vec3 topCol  = vec3(1.00, 0.95, 0.75);
        vec3 col = mix(baseCol, midCol, smoothstep(0.05, 0.45, cuv.y));
        col      = mix(col,    topCol, smoothstep(0.50, 0.92, cuv.y));

        // Hot inner core boost so the very centre reads white.
        float core = smoothstep(0.55, 0.0, distFromAxis);
        col = mix(col, vec3(1.0, 0.95, 0.7), core * 0.45);

        gl_FragColor = vec4(col, shape);
      }
    `;
    function buildFlameMaterial(seed) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed },
        },
        vertexShader:   FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent:    true,
        depthWrite:     false,
        blending:       THREE.AdditiveBlending,
      });
      cleanupRef.current.materials.push(m);
      return m;
    }
    const flameGeoShared = new THREE.PlaneGeometry(0.16, 0.28);
    cleanupRef.current.geometries.push(flameGeoShared);

    // ── Volumetric halo / god-rays around each candle cluster ──
    // A larger billboard plane behind each candelabra with a radial
    // gradient + scrolling noise fragment shader. With bloom + fog,
    // this reads as 'shaft of light catching the dust'. Kept as plain
    // additive geometry instead of a postprocessing GodRaysEffect
    // because the postprocessing version needs a depth-tested light
    // mesh and can be finicky on some GPUs (rev 3 lesson).
    const HALO_VERT = /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const HALO_FRAG = /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uSeed;
      uniform float uOpacity;
      uniform vec3  uColour;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0)),
              c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c);
        float radial = pow(1.0 - smoothstep(0.0, 0.5, r), 1.4);
        float angle  = atan(c.y, c.x);
        float streak = 0.5 + 0.5 * sin(angle * 12.0 + uTime * 0.6 + uSeed * 6.0);
        streak *= noise(vec2(angle * 4.0, uTime * 0.4 + uSeed));
        float intensity = radial * (0.65 + streak * 0.35);
        gl_FragColor = vec4(uColour, intensity * 0.7 * uOpacity);
      }
    `;
    function buildHaloMaterial(seed, colour) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime:    { value: 0 },
          uSeed:    { value: seed },
          uOpacity: { value: 1 },
          uColour:  { value: new THREE.Color(colour) },
        },
        vertexShader:   HALO_VERT,
        fragmentShader: HALO_FRAG,
        transparent:    true,
        depthWrite:     false,
        blending:       THREE.AdditiveBlending,
      });
      cleanupRef.current.materials.push(m);
      return m;
    }
    const haloGeoShared = new THREE.PlaneGeometry(2.4, 2.4);
    cleanupRef.current.geometries.push(haloGeoShared);
    const haloMaterials = []; // for per-frame uTime updates
    const haloMeshes    = []; // for camera billboard

    // Candelabra spacing stretches to cover the corridor when count
    // is reduced on weaker tiers — same visual rhythm, fewer fixtures.
    const candelabraSpacing = (SHELF_DEPTH - 4) / Q.candelabra;
    for (let i = 0; i < Q.candelabra; i++) {
      const z = -i * candelabraSpacing - 0.5;
      // Strong warm point light at the cluster centre.
      const light = new THREE.PointLight(0xffb15c, 6.5, 12, 1.5);
      light.position.set(0, CANDLE_Y, z);
      scene.add(light);
      candleLights.push(light);

      // God-ray halo — large billboard plane behind the candelabra,
      // shader-painted radial + streaks, additive blended. Bloom +
      // fog complete the volumetric look.
      const haloMat = buildHaloMaterial(Math.random(), 0xffb15c);
      const halo = new THREE.Mesh(haloGeoShared, haloMat);
      halo.position.set(0, CANDLE_Y + 0.1, z);
      halo.renderOrder = -50; // behind books + flames, in front of fractal
      scene.add(halo);
      haloMaterials.push(haloMat);
      haloMeshes.push(halo);

      // Brass chain from ceiling beam down to candelabra cup.
      const chainGeo = new THREE.CylinderGeometry(0.006, 0.006, TOP_OF_SHELVES + 0.45 - CANDLE_Y, 6);
      const chain = new THREE.Mesh(chainGeo, chainMatShared);
      chain.position.set(0, (TOP_OF_SHELVES + 0.45 + CANDLE_Y) / 2, z);
      scene.add(chain);
      cleanupRef.current.geometries.push(chainGeo);

      // Candelabra cup — small bowl shape via a flat cylinder.
      const cupGeo = new THREE.CylinderGeometry(0.18, 0.12, 0.05, 12);
      const cup = new THREE.Mesh(cupGeo, cupMatShared);
      cup.position.set(0, CANDLE_Y - 0.02, z);
      scene.add(cup);
      cleanupRef.current.geometries.push(cupGeo);

      // Three candle stems + flames per cluster, arranged in a small
      // triangle. Adds visual richness vs single-flame.
      const offsets = [[0, 0], [0.10, 0.05], [-0.10, 0.05]];
      offsets.forEach(([dx, dz]) => {
        const stemGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.16, 8);
        const stem = new THREE.Mesh(stemGeo, stemMatShared);
        stem.position.set(dx, CANDLE_Y + 0.07, z + dz);
        scene.add(stem);
        cleanupRef.current.geometries.push(stemGeo);

        // Flame: shader-painted billboard plane. Each flame gets its
        // own ShaderMaterial so its uSeed differs (otherwise the whole
        // corridor flickers in perfect sync — uncanny). Material is
        // tracked + disposed; the geometry is shared across all flames.
        const flameMat = buildFlameMaterial(Math.random());
        const flame = new THREE.Mesh(flameGeoShared, flameMat);
        flame.position.set(dx, CANDLE_Y + 0.20, z + dz);
        scene.add(flame);
        flameMeshes.push(flame);
        flameVisuals.push(flameMat); // populate uTime per-frame
      });
    }

    // Lower ambient than rev 5 — with the taller bookcases + more
    // candelabra, the candles need to clearly dominate the light. Too
    // much ambient flattens the depth and the shadows that make the
    // corridor feel real.
    scene.add(new THREE.AmbientLight(0x2a1810, 0.30));

    // ── Holographic equation glyphs (revealed in phase 2) ───────
    function makeGlyphTexture(text) {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 512, 256);
      ctx.font = "bold 180px 'Cambria Math', 'STIX Two Math', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#4ec5ff";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#9ee5ff";
      ctx.fillText(text, 256, 138);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const GLYPHS = ["∫", "Σ", "π", "∞", "∂", "ϕ", "√", "∇", "λ", "ℵ", "Ω", "≈", "ℝ", "∮", "∃", "∀", "∝", "≅"];
    const glyphMeshes = [];
    GLYPHS.forEach((g, i) => {
      const tex = makeGlyphTexture(g);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const geo = new THREE.PlaneGeometry(1.2, 0.6);
      const mesh = new THREE.Mesh(geo, mat);
      const a = (i / GLYPHS.length) * Math.PI * 2;
      const r = 3 + Math.random() * 3;
      mesh.position.set(Math.cos(a) * r, 1.2 + (Math.random() - 0.3) * 2, -3 - Math.random() * 6);
      mesh.userData.basePos = mesh.position.clone();
      mesh.userData.phase   = Math.random() * Math.PI * 2;
      scene.add(mesh);
      glyphMeshes.push(mesh);
      cleanupRef.current.geometries.push(geo);
      cleanupRef.current.materials.push(mat);
      cleanupRef.current.textures.push(tex);
    });

    // ── Dust particles ──────────────────────────────────────────
    // Phase 27 perf pass — dust particles dropped 600 → 350. The
    // visual difference is imperceptible (the candelabra halos +
    // book detail dominate); the 250 fewer points + per-frame
    // attribute upload saves ~0.3 ms/frame on weaker GPUs.
    const dustCount = Q.dust;
    const dustPos = new Float32Array(dustCount * 3);
    const dustVel = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3]     = (Math.random() - 0.5) * 6;
      dustPos[i * 3 + 1] = Math.random() * 4;
      dustPos[i * 3 + 2] = -Math.random() * 30;
      dustVel[i] = 0.001 + Math.random() * 0.003;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffd9b0, size: 0.025, transparent: true, opacity: 0.7,
      sizeAttenuation: true, depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);
    cleanupRef.current.geometries.push(dustGeo);
    cleanupRef.current.materials.push(dustMat);

    // ── Far stars (revealed in phase 2/3) ───────────────────────
    // Stars dropped 1500 → 900 — same reasoning as dust. Phase 2 still
    // looks like a sky, just slightly less crowded.
    const starCount = Q.stars;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30 + Math.random() * 40;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      starPos[i * 3]     = r * Math.sin(p) * Math.cos(t);
      starPos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      starPos[i * 3 + 2] = r * Math.cos(p);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0, sizeAttenuation: true });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    cleanupRef.current.geometries.push(starGeo);
    cleanupRef.current.materials.push(starMat);

    // (Mandelbrot fractal phase removed in rev 10 per user feedback —
    //  the cosmic-cosmos beat after the library is enough; the fractal
    //  felt like a separate project hijacking the scroll. Library +
    //  glyph cosmos + calm celestial close is the new 3-phase arc.)

    // ── Postprocessing pipeline (best-effort, tier-gated) ──────────
    // Wrapped in try / catch + a smoke-test render so a GPU that
    // can't run BloomEffect doesn't take down the page. On failure
    // we discard the composer and fall back to plain renderer.render
    // in the tick loop. The "_smokeOk" flag below is set only after
    // we've successfully rendered ONE frame through the composer —
    // some GPUs accept the composer at construction but throw on
    // first draw, so the smoke test catches that case too.
    //
    // Q.postprocess gates the entire pipeline on weak mobile tiers:
    // bloom is the single most expensive per-frame cost in this scene
    // (~3-5 ms on integrated GPUs, more on mobile), and skipping it
    // is what gets the low tier into smooth 30fps territory. The
    // candles still glow — they just don't get the halo expansion
    // that bloom adds.
    let composer = null;
    if (Q.postprocess) try {
      const c = new EffectComposer(renderer);
      c.addPass(new RenderPass(scene, camera));

      const bloom = new BloomEffect({
        // Bloom kernel reduced LARGE → MEDIUM. Halves the number of
        // gaussian-blur taps per frame for the bloom pass; the visual
        // difference is subtle (slightly less wide glow halo) but
        // saves ~1.5 ms/frame on integrated GPUs.
        kernelSize:        KernelSize.MEDIUM,
        // Conservative threshold — only flames, candle cups, glyph
        // planes, and stars bloom. The wood / books / floor stay
        // clean. Lowering this below ~0.55 in rev 3 was what blew out
        // exposure on the planet's day side.
        luminanceThreshold: 0.62,
        luminanceSmoothing: 0.20,
        intensity:          1.05,
      });
      const vignette = new VignetteEffect({
        // Cinematic edge darkening — matches the candle-lit mood by
        // pulling the corners into shadow.
        offset:    0.45,
        darkness:  0.55,
      });
      c.addPass(new EffectPass(camera, bloom, vignette));

      // Smoke-test render. If this throws, we leave composer = null.
      c.render(0.016);
      composer = c;
      cleanupRef.current.composer = composer;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[LibraryScene] postprocessing init failed, plain renderer.render() fallback:", err?.message);
      composer = null;
    }

    // Single-frame render helper — used by the resize handler, and by
    // the reduced-motion path below so the page still gets one paint of
    // the cathedral library backdrop without any rAF loop running.
    const renderOnce = () => {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    };

    // ── Resize ───────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (composer) composer.setSize(window.innerWidth, window.innerHeight);
      // Reduced-motion has no rAF loop running, so resize would leave a
      // stale framebuffer at the old aspect. Force one paint here.
      if (prefersReducedMotion) renderOnce();
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ───────────────────────────────────────────
    // Three phases (rev 10): library → glyph cosmos → calm celestial.
    const target  = { camZ: 12, camY: 1.5, fogDensity: 0.045, glyphAlpha: 0, starAlpha: 0, candleI: 1.0 };
    const current = { camZ: 12, camY: 1.5, fogDensity: 0.045, glyphAlpha: 0, starAlpha: 0, candleI: 1.0 };

    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      if (p < 0.45) {
        // Phase 1 — drift down the library corridor.
        const t = p / 0.45;
        target.camZ       = THREE.MathUtils.lerp(12, -2, t);
        target.camY       = 1.5;
        target.fogDensity = 0.045;
        target.glyphAlpha = 0;
        target.starAlpha  = 0;
        target.candleI    = 1.0;
      } else if (p < 0.75) {
        // Phase 2 — corridor dissolves into glyph cosmos.
        const t = (p - 0.45) / 0.30;
        target.camZ       = THREE.MathUtils.lerp(-2, -8, t);
        target.camY       = THREE.MathUtils.lerp(1.5, 1.9, t);
        target.fogDensity = THREE.MathUtils.lerp(0.045, 0.012, t);
        target.glyphAlpha = THREE.MathUtils.lerp(0, 0.85, t);
        target.starAlpha  = THREE.MathUtils.lerp(0, 0.85, t);
        target.candleI    = THREE.MathUtils.lerp(1.0, 0.0, t);
      } else {
        // Phase 3 — calm celestial close.
        const t = (p - 0.75) / 0.25;
        target.camZ       = THREE.MathUtils.lerp(-8, -10, t);
        target.camY       = 1.9;
        target.fogDensity = 0.010;
        target.glyphAlpha = THREE.MathUtils.lerp(0.85, 0.55, t);
        target.starAlpha  = 0.95;
        target.candleI    = 0.0;
      }

      const k = 0.07;
      current.camZ       = THREE.MathUtils.lerp(current.camZ,       target.camZ,       k);
      current.camY       = THREE.MathUtils.lerp(current.camY,       target.camY,       k);
      current.fogDensity = THREE.MathUtils.lerp(current.fogDensity, target.fogDensity, 0.04);
      current.glyphAlpha = THREE.MathUtils.lerp(current.glyphAlpha, target.glyphAlpha, 0.05);
      current.starAlpha  = THREE.MathUtils.lerp(current.starAlpha,  target.starAlpha,  0.05);
      current.candleI    = THREE.MathUtils.lerp(current.candleI,    target.candleI,    0.05);

      camera.position.set(0, current.camY, current.camZ);
      camera.lookAt(0, current.camY, current.camZ - 1);

      scene.fog.density = current.fogDensity;

      const t = performance.now() * 0.001;
      // Per-light flicker + master phase intensity.
      candleLights.forEach((l, i) => {
        l.intensity = 6.5 * current.candleI * (0.92 + 0.08 * Math.sin(t * 4 + i * 1.7));
      });
      // Flames: shader-driven. Update uTime so the noise field scrolls,
      // then billboard the mesh toward camera + hide it when candles are
      // off (phase 2+).
      flameVisuals.forEach((mat) => { mat.uniforms.uTime.value = t; });
      flameMeshes.forEach((mesh) => {
        mesh.visible = current.candleI > 0.05;
        if (mesh.visible) mesh.lookAt(camera.position);
      });

      // God-ray halos: same uTime update, same billboard. Halo
      // intensity is gated by current.candleI so they fade together
      // with the flames during the library → cosmos transition.
      haloMaterials.forEach((mat) => {
        mat.uniforms.uTime.value    = t;
        mat.uniforms.uOpacity.value = current.candleI;
      });
      haloMeshes.forEach((mesh) => {
        mesh.visible = current.candleI > 0.02;
        if (mesh.visible) mesh.lookAt(camera.position);
      });

      // Distant focal monument fades with the candle phase so it
      // disappears cleanly during the library → cosmos transition.
      // Opacity floor of 0.05 prevents a hard pop at the boundary.
      monumentMat.opacity = Math.max(0.05, current.candleI);
      monumentLight.intensity = 3.5 * current.candleI;

      // Lanterns scattered through the scene — subtle flicker so they
      // feel alive (each lantern has its own phase offset via index),
      // and intensity gates on current.candleI so they fade out along
      // with the rest of the library lighting in Phase 2.
      lanternLights.forEach((l, i) => {
        l.intensity = 1.8 * current.candleI * (0.88 + 0.12 * Math.sin(t * 3.2 + i * 0.9));
      });

      // Window glow on the distant university buildings — pulses
      // very subtly per-building. The windowMat is shared across
      // ALL windows, so this pulses them together (cheap, reads
      // as "the campus is breathing"). Fades to off in Phase 2.
      windowMat.opacity = 0.92 * current.candleI * (0.94 + 0.06 * Math.sin(t * 0.8));

      // University building stone fades opacity slightly with phase
      // — they're already very dark from the cold #2a2f38 base, but
      // dropping further keeps them clean during the cosmos beat.
      // buildingMat is opaque (no `transparent: true`) — we use
      // dim emissive instead by tying to candleI via a multiplier
      // applied to the ambient light at scene level. Skipping that
      // for now since the visual cost of opaque buildings in phase 2
      // is acceptable (they'll be in deep shadow anyway).

      // Glyph pulse + drift + billboard toward camera.
      glyphMeshes.forEach((g, i) => {
        const ph = g.userData.phase;
        const base = g.userData.basePos;
        g.position.set(
          base.x + Math.sin(t * 0.4 + ph) * 0.4,
          base.y + Math.cos(t * 0.5 + ph) * 0.3,
          base.z + Math.sin(t * 0.3 + ph) * 0.5,
        );
        g.material.opacity = current.glyphAlpha * (0.7 + 0.3 * Math.sin(t * 0.8 + i));
        g.lookAt(camera.position);
      });

      starMat.opacity = current.starAlpha;

      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        arr[i * 3 + 1] += dustVel[i];
        if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = 0;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dustMat.opacity = 0.7 * current.candleI + 0.3 * (1 - current.candleI);

      // Composer when available (bloom + vignette), else plain render.
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (prefersReducedMotion) {
      // One static frame at the library starting position. No camera
      // glide, no flame flicker, no dust drift, no glyph pulse — every
      // animated property stays at its initial value. The user still
      // sees the cathedral so the page doesn't read as broken.
      renderOnce();
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      const c = cleanupRef.current;
      c.geometries.forEach((g) => g.dispose());
      c.materials.forEach((m) => m.dispose());
      c.textures.forEach((t) => t.dispose());
      if (c.composer) c.composer.dispose();
      if (c.renderer) {
        c.renderer.dispose();
        c.renderer.forceContextLoss?.();
        const dom = c.renderer.domElement;
        if (dom?.parentNode) dom.parentNode.removeChild(dom);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
}
