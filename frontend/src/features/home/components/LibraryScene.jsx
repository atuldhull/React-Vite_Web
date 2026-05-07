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

// Leather-bound palette — desaturated browns, oxblood, forest, navy
// with a few gold accents. No saturated rainbow colours: the corridor
// reads "ancient archive", not "kindergarten library".
const BOOK_COLOURS = [
  0x4a2c1a, 0x3d2515, 0x6b3e26, 0x8a4a2e, 0x5b2a2e,
  0x7d3a36, 0x2f3a26, 0x1f3a3a, 0x2a3550, 0x383042,
  0x533424, 0x6a523c, 0xb8893d, 0x8a6f3a,
];

const SHELF_DEPTH  = 30;   // along -Z
const SHELVES      = 5;    // vertical levels
const BOOKS_PER_LV = 110;  // along the shelf
// Total instances per side = 5 × 110 = 550. Two sides = 1100 books.

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
        const y = 0.5 + lv * 0.55;
        for (let i = 0; i < BOOKS_PER_LV; i++) {
          // Books packed along Z from z=0 backward.
          const zNominal = -i * (SHELF_DEPTH / BOOKS_PER_LV) - 0.05;
          const z = zNominal + (Math.random() - 0.5) * 0.02;
          const tilt = (Math.random() - 0.5) * 0.04; // tiny lean
          const heightJitter = 1 + (Math.random() - 0.5) * 0.18;
          dummy.position.set(side * 2.6, y, z);
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
        plank.position.set(side * 2.6, 0.32 + lv * 0.55, -SHELF_DEPTH / 2);
        scene.add(plank);
        cleanupRef.current.geometries.push(plankGeo);
      }
      // Vertical posts every 5m so the bookcase has structure.
      for (let z = 0; z >= -SHELF_DEPTH; z -= 5) {
        const postGeo = new THREE.BoxGeometry(0.36, SHELVES * 0.55 + 0.4, 0.07);
        const post = new THREE.Mesh(postGeo, shelfMat);
        post.position.set(side * 2.6, (SHELVES * 0.55) / 2 + 0.3, z);
        scene.add(post);
        cleanupRef.current.geometries.push(postGeo);
      }
    }

    // ── Candle-tone point lights along the corridor ─────────────
    // CRITICAL: light.position.set(...) — never Object.assign({ position: new Vector3 }).
    const candleLights = [];
    const flameVisuals = [];
    for (let i = 0; i < 7; i++) {
      const z = -i * 4.5;
      const light = new THREE.PointLight(0xffb15c, 4.0, 9, 1.6);
      light.position.set(0, 2.6, z);
      scene.add(light);
      candleLights.push(light);

      const flameGeo = new THREE.SphereGeometry(0.045, 12, 12);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(0, 2.6, z);
      scene.add(flame);
      flameVisuals.push(flame);
      cleanupRef.current.geometries.push(flameGeo);
      cleanupRef.current.materials.push(flameMat);

      const stemGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.16, 8);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0xe9d6a3, roughness: 0.7 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(0, 2.46, z);
      scene.add(stem);
      cleanupRef.current.geometries.push(stemGeo);
      cleanupRef.current.materials.push(stemMat);
    }

    scene.add(new THREE.AmbientLight(0x553322, 0.55));

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

    // ── Resize ───────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ───────────────────────────────────────────
    const target  = { camZ: 12, camY: 1.5, fogDensity: 0.045, glyphAlpha: 0, starAlpha: 0, candleI: 1.0 };
    const current = { camZ: 12, camY: 1.5, fogDensity: 0.045, glyphAlpha: 0, starAlpha: 0, candleI: 1.0 };

    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      if (p < 0.45) {
        // Phase 1 — drift down the corridor.
        const t = p / 0.45;
        target.camZ       = THREE.MathUtils.lerp(12, -2, t);
        target.camY       = 1.5;
        target.fogDensity = 0.045;
        target.glyphAlpha = 0;
        target.starAlpha  = 0;
        target.candleI    = 1.0;
      } else if (p < 0.75) {
        // Phase 2 — corridor dissolves; glyphs + stars bloom.
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
        l.intensity = 4.0 * current.candleI * (0.92 + 0.08 * Math.sin(t * 4 + i * 1.7));
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

      renderer.render(scene, camera);
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
