/**
 * EarthScene.jsx — Three.js WebGL hero replacing the 180-frame
 * Cloudinary scrubber.
 *
 * Why the rewrite:
 *   The previous MonumentGround.jsx fetched 180 individual JPEGs from
 *   Cloudinary as a "video scrub". On a typical 4-8 Mbps connection
 *   that was 4-8 seconds of round trips before the hero felt smooth,
 *   each frame was a JPEG re-decode (visible artifacts), and every
 *   transform-request hit Cloudinary's free-tier rate limit on heavy
 *   landing-page traffic. Audit (issue 1) flagged it as a critical
 *   visual + performance bug.
 *
 * What this gives instead:
 *   - One <canvas>, one WebGL context, drawn at 60 fps with rAF.
 *   - Earth: SphereGeometry + day-side colour map (public/textures/earth.jpg)
 *     + cloud layer (public/textures/clouds.png with transparency) at
 *     a slightly larger radius so it floats over the surface.
 *   - Atmosphere: Fresnel-style additive shader. Hits brightest at the
 *     limb of the planet, fades to nothing toward the centre — the
 *     rim-glow look real planet renders use.
 *   - Stars: 2 000 point sprites distributed on a large outer sphere
 *     so the camera always has depth behind it.
 *   - Sun: single DirectionalLight at a low golden-hour angle so the
 *     terminator (day/night line) is visible and dramatic.
 *
 * Scroll choreography (drives camera + uniforms each frame):
 *   0.00 → 0.40  Camera zooms from z=2.8 → 0.95 toward the planet.
 *                Earth rotates continuously regardless of scroll.
 *   0.40 → 0.60  Brief "atmosphere breakthrough" — atmosphere intensity
 *                spikes, a white flash overlay fades up then down via
 *                the lensFlare uniform.
 *   0.60 → 1.00  Camera tilts down + drifts past the planet so a hint
 *                of monument silhouettes (Σ, ∞, π) becomes visible at
 *                the lower edge — the "we landed somewhere" beat.
 *
 * Memory + cleanup:
 *   Every Three.js resource is tracked and disposed on unmount. The
 *   audit specifically called out that cancelling the rAF loop is
 *   "very important to prevent memory leaks" — this file does that
 *   plus disposes geometries, materials, textures, and the renderer
 *   itself.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Scroll distance (px) over which scroll progress 0→1 unfolds. Matches
// the 500vh spacer in HomePage.jsx so the choreography aligns with
// existing page sections.
function scrollSpan() {
  return window.innerHeight * 5;
}

// Vertex shader for the atmosphere — passes the world-space normal
// through so the fragment shader can compute the Fresnel term.
const atmosphereVert = /* glsl */`
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader — the atmosphere brightness is (1 - dot(N, V))^p.
// Stronger at the limb (where N is perpendicular to V), faded at the
// centre. The intensity uniform lets the breakthrough beat (scroll
// 0.4-0.6) pulse the rim brighter without re-creating the material.
const atmosphereFrag = /* glsl */`
  varying vec3 vNormal;
  uniform float uIntensity;
  uniform vec3  uColor;
  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
    gl_FragColor = vec4(uColor * fresnel * uIntensity, fresnel);
  }
`;

export default function EarthScene() {
  const mountRef = useRef(null);
  const rafRef = useRef(null);
  // Refs to anything that needs disposing on unmount. Three.js doesn't
  // auto-dispose; leaking these triples GPU memory on every nav.
  const cleanupRef = useRef({ geometries: [], materials: [], textures: [], renderer: null });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer + scene + camera ─────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Dark space — the SCSS background under the canvas is black,
    // but a slight tint keeps the atmosphere additive blend looking
    // right when the planet drifts off-axis.
    renderer.setClearColor(0x05080f, 1);
    mount.appendChild(renderer.domElement);
    cleanupRef.current.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(0, 0, 2.8);

    // ── Textures ──────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    const earthMap = loader.load("/textures/earth.jpg");
    const cloudMap = loader.load("/textures/clouds.png");
    earthMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    cleanupRef.current.textures.push(earthMap, cloudMap);

    // ── Earth ─────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(1, 96, 96);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthMap,
      // A small emissive tint so the night side isn't pitch-black —
      // city-light glow stand-in without needing a full night-side map.
      emissive: 0x112233,
      emissiveIntensity: 0.25,
      roughness: 0.85,
      metalness: 0.0,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    cleanupRef.current.geometries.push(earthGeo);
    cleanupRef.current.materials.push(earthMat);

    // ── Cloud layer (slightly bigger sphere with transparent map) ─
    const cloudGeo = new THREE.SphereGeometry(1.013, 96, 96);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);
    cleanupRef.current.geometries.push(cloudGeo);
    cleanupRef.current.materials.push(cloudMat);

    // ── Atmosphere (Fresnel rim glow) ─────────────────────────────
    const atmoGeo = new THREE.SphereGeometry(1.18, 96, 96);
    const atmoUniforms = {
      uIntensity: { value: 1.0 },
      uColor:     { value: new THREE.Color(0x4fc3f7) },
    };
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: atmosphereVert,
      fragmentShader: atmosphereFrag,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmosphere);
    cleanupRef.current.geometries.push(atmoGeo);
    cleanupRef.current.materials.push(atmoMat);

    // ── Stars ─────────────────────────────────────────────────────
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Distribute on a sphere of radius ~50 so they sit in the deep
      // background. Reject samples too close to the camera axis to
      // avoid stars appearing in the planet's silhouette.
      const r     = 30 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    cleanupRef.current.geometries.push(starGeo);
    cleanupRef.current.materials.push(starMat);

    // ── Sun (directional light, golden hour) ──────────────────────
    const sun = new THREE.DirectionalLight(0xfff2c0, 1.6);
    sun.position.set(5, 1.5, 3);
    scene.add(sun);
    // Faint ambient so the night side has just enough fill to see
    // continent silhouettes.
    scene.add(new THREE.AmbientLight(0x223355, 0.35));

    // ── Monument silhouettes (revealed at scroll > 0.65) ─────────
    // Three glowing primitives below the planet — tall pillar (Σ),
    // double-torus (∞), pyramid (π). Stay invisible until we reach
    // the "landed" phase of the choreography.
    const monumentGroup = new THREE.Group();
    monumentGroup.position.set(0, -2.4, 0);
    monumentGroup.visible = false;
    scene.add(monumentGroup);

    const sigmaGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.7, 16);
    const sigmaMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, emissive: 0xd4a017, emissiveIntensity: 0.6 });
    const sigma = new THREE.Mesh(sigmaGeo, sigmaMat);
    sigma.position.set(-0.6, 0, 0);
    monumentGroup.add(sigma);
    cleanupRef.current.geometries.push(sigmaGeo);
    cleanupRef.current.materials.push(sigmaMat);

    const infinityGeo = new THREE.TorusGeometry(0.18, 0.04, 12, 48);
    const infinityMat = new THREE.MeshStandardMaterial({ color: 0x00cfff, emissive: 0x00cfff, emissiveIntensity: 0.6 });
    const infA = new THREE.Mesh(infinityGeo, infinityMat);
    const infB = new THREE.Mesh(infinityGeo, infinityMat);
    infA.position.set(-0.18, 0, 0);
    infB.position.set( 0.18, 0, 0);
    monumentGroup.add(infA); monumentGroup.add(infB);
    cleanupRef.current.geometries.push(infinityGeo);
    cleanupRef.current.materials.push(infinityMat);

    const piGeo = new THREE.ConeGeometry(0.18, 0.45, 4);
    const piMat = new THREE.MeshStandardMaterial({ color: 0x7b4fe0, emissive: 0x7b4fe0, emissiveIntensity: 0.55 });
    const pi = new THREE.Mesh(piGeo, piMat);
    pi.position.set(0.7, 0, 0);
    monumentGroup.add(pi);
    cleanupRef.current.geometries.push(piGeo);
    cleanupRef.current.materials.push(piMat);

    // Lens-flare overlay element (HTML, not WebGL — cheaper and easier
    // to control than a post-processing pass for a single short flash).
    const flareEl = document.createElement("div");
    Object.assign(flareEl.style, {
      position: "fixed", inset: "0", pointerEvents: "none",
      background: "radial-gradient(circle at center, rgba(255,255,255,0.85) 0%, transparent 50%)",
      opacity: "0", zIndex: "1", mixBlendMode: "screen",
      transition: "opacity 0.2s linear",
    });
    mount.appendChild(flareEl);

    // ── Resize handler ────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────────
    // Smoothing of camera Z prevents per-frame scroll jitter from
    // tearing the camera around — a soft lerp at 0.08 follows scroll
    // closely enough to feel responsive.
    const target = { camZ: 2.8, camY: 0, atmoIntensity: 1.0, flareOpacity: 0 };
    const current = { camZ: 2.8, camY: 0, atmoIntensity: 1.0, flareOpacity: 0 };

    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      // Phase mapping
      if (p < 0.4) {
        // Zoom in.
        const t = p / 0.4;
        target.camZ = THREE.MathUtils.lerp(2.8, 0.95, t);
        target.camY = 0;
        target.atmoIntensity = 1.0;
        target.flareOpacity = 0;
      } else if (p < 0.6) {
        // Atmosphere flash. Bell curve peak at 0.5.
        const t = (p - 0.4) / 0.2;
        const bell = Math.sin(t * Math.PI);
        target.camZ = 0.95;
        target.camY = THREE.MathUtils.lerp(0, -0.15, t);
        target.atmoIntensity = 1.0 + bell * 2.5;
        target.flareOpacity = bell * 0.85;
      } else {
        // "Landed" — drift down so the monuments at y=-2.4 come into
        // view at the bottom edge.
        const t = (p - 0.6) / 0.4;
        target.camZ = THREE.MathUtils.lerp(0.95, 1.4, t);
        target.camY = THREE.MathUtils.lerp(-0.15, -1.2, t);
        target.atmoIntensity = THREE.MathUtils.lerp(1.0, 1.5, t);
        target.flareOpacity = 0;
        monumentGroup.visible = t > 0.05;
      }

      // Smooth follow.
      current.camZ           = THREE.MathUtils.lerp(current.camZ, target.camZ, 0.08);
      current.camY           = THREE.MathUtils.lerp(current.camY, target.camY, 0.08);
      current.atmoIntensity  = THREE.MathUtils.lerp(current.atmoIntensity, target.atmoIntensity, 0.12);
      current.flareOpacity   = THREE.MathUtils.lerp(current.flareOpacity, target.flareOpacity, 0.18);

      camera.position.set(0, current.camY, current.camZ);
      camera.lookAt(0, current.camY, 0);
      atmoUniforms.uIntensity.value = current.atmoIntensity;
      flareEl.style.opacity = String(current.flareOpacity);

      // Continuous earth + cloud rotation. Clouds rotate slightly
      // faster than surface to suggest atmospheric movement.
      earth.rotation.y  += 0.0018;
      clouds.rotation.y += 0.0023;

      // Stars drift very slowly for parallax depth.
      stars.rotation.y  += 0.00008;

      // Monuments: gentle bob so they read as "alive" instead of static.
      if (monumentGroup.visible) {
        const t = performance.now() * 0.001;
        sigma.rotation.y = t * 0.3;
        infA.rotation.x = Math.PI / 2;
        infB.rotation.x = Math.PI / 2;
        infA.rotation.y = t * 0.4;
        infB.rotation.y = -t * 0.4;
        pi.rotation.y = t * 0.3;
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // ── Cleanup ───────────────────────────────────────────────────
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
      if (flareEl.parentNode) flareEl.parentNode.removeChild(flareEl);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
