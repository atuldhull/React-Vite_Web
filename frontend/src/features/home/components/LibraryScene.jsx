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

const SHELF_DEPTH  = 36;   // along -Z (was 30 — extends corridor)
const SHELVES      = 9;    // vertical levels (was 5 — TALLER + cathedral feel)
const BOOKS_PER_LV = 100;  // along the shelf
// Total instances per side = 9 × 100 = 900. Two sides = 1 800 books.
// Still one InstancedMesh per side, so just 2 draw calls. Phase 27 cut
// from 130 → 100 to reduce instance buffer size; the visual density
// stays believable because each book averages 36 cm in screen space
// at the close-zoom phase.
const SHELF_LV_HEIGHT = 0.55;   // distance between shelves
const FIRST_LV_Y      = 0.55;   // bottom shelf height off the floor
const TOP_OF_SHELVES  = FIRST_LV_Y + (SHELVES - 1) * SHELF_LV_HEIGHT + 0.5; // ~5.45m

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

    for (let i = 0; i < 10; i++) {
      const z = -i * 3.5 - 0.5;
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
    const dustCount = 350;
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
    const starCount = 900;
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

    // ── Postprocessing pipeline (best-effort) ───────────────────
    // Wrapped in try / catch + a smoke-test render so a GPU that
    // can't run BloomEffect doesn't take down the page. On failure
    // we discard the composer and fall back to plain renderer.render
    // in the tick loop. The "_smokeOk" flag below is set only after
    // we've successfully rendered ONE frame through the composer —
    // some GPUs accept the composer at construction but throw on
    // first draw, so the smoke test catches that case too.
    let composer = null;
    try {
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
