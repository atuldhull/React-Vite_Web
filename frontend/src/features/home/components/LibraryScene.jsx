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
const BOOKS_PER_LV = 130;  // along the shelf (was 110 — denser)
// Total instances per side = 9 × 130 = 1170. Two sides = 2340 books.
// Still one InstancedMesh per side, so just 2 draw calls for everything.
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
    const flameVisuals = [];
    const CANDLE_Y = TOP_OF_SHELVES - 1.4; // hangs below the ceiling beams
    const stemMatShared = new THREE.MeshStandardMaterial({ color: 0xe9d6a3, roughness: 0.7 });
    const flameMatShared = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    const chainMatShared = new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.4, metalness: 0.7 });
    const cupMatShared   = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.45, metalness: 0.5 });
    cleanupRef.current.materials.push(stemMatShared, flameMatShared, chainMatShared, cupMatShared);

    for (let i = 0; i < 10; i++) {
      const z = -i * 3.5 - 0.5;
      // Strong warm point light at the cluster centre.
      const light = new THREE.PointLight(0xffb15c, 6.5, 12, 1.5);
      light.position.set(0, CANDLE_Y, z);
      scene.add(light);
      candleLights.push(light);

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

        const flameGeo = new THREE.SphereGeometry(0.045, 12, 12);
        const flame = new THREE.Mesh(flameGeo, flameMatShared);
        flame.position.set(dx, CANDLE_Y + 0.18, z + dz);
        scene.add(flame);
        flameVisuals.push(flame);
        cleanupRef.current.geometries.push(flameGeo);
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
    const dustCount = 600;
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
    const starCount = 1500;
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

    // ── Mandelbrot fractal — 4th-phase backdrop ──────────────────
    // Fullscreen quad parented to the camera (so it always fills the
    // frame). depthTest/depthWrite disabled + renderOrder = -100 so
    // it draws BEHIND the rest of the scene; alpha-blended so the
    // library / glyphs / stars stay visible on top.
    //
    // Vertex shader emits a quad in clip space directly — bypasses
    // camera projection, so the plane never rotates with camera moves.
    // Fragment shader iterates the Mandelbrot map z = z² + c in a loop
    // capped at 180 iterations, with smooth-escape colouring driven by
    // a phase-shifted cosine palette so the whole thing looks like a
    // shifting oil-on-water rainbow rather than the standard rainbow LUT.
    //
    // uZoom is log-scale: at uZoom=0 we see the full set; uZoom=4 lands
    // deep in the seahorse-valley region (centre -0.74, 0.13). The
    // scroll handler animates uZoom 0 → 4 across phase 4.
    const fractalUniforms = {
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uTime:       { value: 0 },
      uZoom:       { value: 0 },
      uAlpha:      { value: 0 },
      uCenter:     { value: new THREE.Vector2(-0.74, 0.13) },
    };
    const fractalMat = new THREE.ShaderMaterial({
      uniforms: fractalUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // Direct clip-space output — the plane spans -1..+1 in both
          // axes regardless of camera projection.
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec2  uResolution;
        uniform float uTime;
        uniform float uZoom;
        uniform float uAlpha;
        uniform vec2  uCenter;
        varying vec2 vUv;
        void main() {
          // Map fragment to complex plane.
          vec2 px = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
          vec2 c  = px / exp(uZoom) + uCenter;

          vec2  z = vec2(0.0);
          float iter = 0.0;
          const float MAX = 180.0;
          for (float i = 0.0; i < MAX; i++) {
            if (dot(z, z) > 4.0) { iter = i; break; }
            z = vec2(z.x*z.x - z.y*z.y, 2.0 * z.x * z.y) + c;
            iter = i;
          }

          if (iter >= MAX - 1.0) {
            // Inside the set: very dark with a faint indigo tint so
            // the central body still has shape.
            gl_FragColor = vec4(vec3(0.04, 0.02, 0.08), uAlpha);
            return;
          }

          // Smooth-escape continuous iteration count for banding-free
          // colouring.
          float smooth_i = iter - log2(log2(max(dot(z, z), 1.0001))) + 4.0;
          float t = smooth_i / MAX;
          // Phase-shifted cosine palette — slow time drift so the
          // gradient breathes.
          vec3 col = 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67)) + uTime * 0.20);
          // Bias toward holographic blues + magenta at high t.
          col *= vec3(0.9, 0.95, 1.05);
          gl_FragColor = vec4(col, uAlpha);
        }
      `,
    });
    const fractalGeo = new THREE.PlaneGeometry(2, 2);
    const fractalMesh = new THREE.Mesh(fractalGeo, fractalMat);
    fractalMesh.frustumCulled = false;
    fractalMesh.renderOrder = -100;
    scene.add(fractalMesh);
    cleanupRef.current.geometries.push(fractalGeo);
    cleanupRef.current.materials.push(fractalMat);

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
        kernelSize:        KernelSize.LARGE,
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

    // ── Resize ───────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (composer) composer.setSize(window.innerWidth, window.innerHeight);
      fractalUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ───────────────────────────────────────────
    // Four phases now (rev 7): library → glyph cosmos → Mandelbrot
    // fractal zoom → calm celestial close.
    const target  = { camZ: 12, camY: 1.5, fogDensity: 0.045, glyphAlpha: 0, starAlpha: 0, candleI: 1.0, fractalA: 0, fractalZ: 0 };
    const current = { camZ: 12, camY: 1.5, fogDensity: 0.045, glyphAlpha: 0, starAlpha: 0, candleI: 1.0, fractalA: 0, fractalZ: 0 };

    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      if (p < 0.40) {
        // Phase 1 — drift down the library corridor.
        const t = p / 0.40;
        target.camZ       = THREE.MathUtils.lerp(12, -2, t);
        target.camY       = 1.5;
        target.fogDensity = 0.045;
        target.glyphAlpha = 0;
        target.starAlpha  = 0;
        target.candleI    = 1.0;
        target.fractalA   = 0;
        target.fractalZ   = 0;
      } else if (p < 0.62) {
        // Phase 2 — corridor dissolves into glyph cosmos.
        const t = (p - 0.40) / 0.22;
        target.camZ       = THREE.MathUtils.lerp(-2, -8, t);
        target.camY       = THREE.MathUtils.lerp(1.5, 1.9, t);
        target.fogDensity = THREE.MathUtils.lerp(0.045, 0.012, t);
        target.glyphAlpha = THREE.MathUtils.lerp(0, 0.85, t);
        target.starAlpha  = THREE.MathUtils.lerp(0, 0.65, t);
        target.candleI    = THREE.MathUtils.lerp(1.0, 0.0, t);
        target.fractalA   = 0;
        target.fractalZ   = 0;
      } else if (p < 0.85) {
        // Phase 3 — Mandelbrot fractal zoom takes over the backdrop.
        const t = (p - 0.62) / 0.23;
        target.camZ       = -8;
        target.camY       = 1.9;
        target.fogDensity = 0.005;
        target.glyphAlpha = THREE.MathUtils.lerp(0.85, 0.40, t);
        target.starAlpha  = THREE.MathUtils.lerp(0.65, 0.20, t);
        target.candleI    = 0.0;
        // Fractal alpha rises fast; zoom continues throughout the
        // phase (and we let it overshoot a touch into phase 4 for a
        // smooth ramp-down vs an abrupt freeze).
        target.fractalA   = THREE.MathUtils.smoothstep ? 0.95 : 0.95; // const
        target.fractalZ   = THREE.MathUtils.lerp(0, 4.0, t);
      } else {
        // Phase 4 — calm celestial close. Fractal fades, stars dominate.
        const t = (p - 0.85) / 0.15;
        target.camZ       = THREE.MathUtils.lerp(-8, -10, t);
        target.camY       = 1.9;
        target.fogDensity = 0.010;
        target.glyphAlpha = THREE.MathUtils.lerp(0.40, 0.55, t);
        target.starAlpha  = THREE.MathUtils.lerp(0.20, 0.95, t);
        target.candleI    = 0.0;
        target.fractalA   = THREE.MathUtils.lerp(0.95, 0.0, t);
        target.fractalZ   = THREE.MathUtils.lerp(4.0, 4.6, t);
      }

      const k = 0.07;
      current.camZ       = THREE.MathUtils.lerp(current.camZ,       target.camZ,       k);
      current.camY       = THREE.MathUtils.lerp(current.camY,       target.camY,       k);
      current.fogDensity = THREE.MathUtils.lerp(current.fogDensity, target.fogDensity, 0.04);
      current.glyphAlpha = THREE.MathUtils.lerp(current.glyphAlpha, target.glyphAlpha, 0.05);
      current.starAlpha  = THREE.MathUtils.lerp(current.starAlpha,  target.starAlpha,  0.05);
      current.candleI    = THREE.MathUtils.lerp(current.candleI,    target.candleI,    0.05);
      current.fractalA   = THREE.MathUtils.lerp(current.fractalA,   target.fractalA,   0.06);
      current.fractalZ   = THREE.MathUtils.lerp(current.fractalZ,   target.fractalZ,   0.04);

      fractalUniforms.uTime.value  = performance.now() * 0.001;
      fractalUniforms.uAlpha.value = current.fractalA;
      fractalUniforms.uZoom.value  = current.fractalZ;

      camera.position.set(0, current.camY, current.camZ);
      camera.lookAt(0, current.camY, current.camZ - 1);

      scene.fog.density = current.fogDensity;

      const t = performance.now() * 0.001;
      // Per-light flicker + master phase intensity.
      candleLights.forEach((l, i) => {
        l.intensity = 6.5 * current.candleI * (0.92 + 0.08 * Math.sin(t * 4 + i * 1.7));
      });
      flameVisuals.forEach((f) => {
        f.material.opacity = 1; // basic material ignores opacity unless transparent — kept for symmetry
        f.visible = current.candleI > 0.05;
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
    rafRef.current = requestAnimationFrame(tick);

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
