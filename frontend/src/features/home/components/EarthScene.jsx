/**
 * EarthScene.jsx — Three.js WebGL hero (rev 4).
 *
 * Rev 4 — what changed from the working rev 2:
 *   - The math monument is now ON the Earth's surface, not floating in
 *     a separate space below. It's parented as a child of the Earth
 *     mesh, anchored on the equator at longitude 0, oriented radial-up.
 *     As the Earth rotates, the monument rotates with it (because it's
 *     a child).
 *   - As the user scrolls into phase 2, the Earth's rotation eases to a
 *     stop with the monument's longitude facing the camera. So the
 *     "scroll-into-Earth" experience is:
 *       - Phase 1: planet spinning serenely in orbit, monument off-screen
 *         (currently on the far side or rotating past).
 *       - Phase 2: rotation locks; the monument arrives on the front
 *         face of the planet and the camera dives straight at it.
 *       - Phase 3: camera glides down past the surface, framing the
 *         monument with Earth curvature visible at the limb.
 *
 * Things deliberately NOT in rev 4 (because rev 3 broke the page):
 *   - postprocessing / EffectComposer / BloomEffect — needs a try/catch
 *     fallback path AND a smaller bloom budget; out of scope here.
 *   - Object.assign(new THREE.PointLight(...), { position: new Vector3 })
 *     — that pattern REPLACES the light's managed position and trips
 *     Three.js's matrix updates. We use light.position.set(x, y, z) now.
 *   - Procedural 14-building skyline. We're back to a focused monument
 *     (tower + gateway + ring + side stones) so the silhouette reads
 *     clearly from orbit instead of being a noisy speckle on the sphere.
 *
 * Earth itself (textures, day/night shader) is unchanged from rev 2.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

const TEX = {
  earthDay: "/textures/earth.jpg",
  clouds:   "/textures/clouds.png",
  specular: "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
  normal:   "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
  lights:   "https://threejs.org/examples/textures/planets/earth_lights_2048.png",
};

function scrollSpan() {
  return window.innerHeight * 5;
}

export default function EarthScene() {
  const mountRef = useRef(null);
  const rafRef = useRef(null);
  const cleanupRef = useRef({ geometries: [], materials: [], textures: [], renderer: null });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x05080f, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    cleanupRef.current.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05080f, 0.015);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.005, 100);
    camera.position.set(0, 0, 2.8);

    // ── Textures ──────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const dayMap   = loader.load(TEX.earthDay);
    const specMap  = loader.load(TEX.specular);
    const normalMap = loader.load(TEX.normal);
    const nightMap = loader.load(TEX.lights);
    const cloudMap = loader.load(TEX.clouds);
    [dayMap, nightMap, cloudMap].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; });
    const aniso = renderer.capabilities.getMaxAnisotropy();
    [dayMap, specMap, normalMap, nightMap, cloudMap].forEach((t) => { t.anisotropy = Math.min(8, aniso); });
    cleanupRef.current.textures.push(dayMap, specMap, normalMap, nightMap, cloudMap);

    // ── Earth ─────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(1, 192, 192);
    const sunDirection = new THREE.Vector3(1, 0.25, 0.6).normalize();
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDayMap:    { value: dayMap },
        uNightMap:  { value: nightMap },
        uSpecMap:   { value: specMap },
        uNormalMap: { value: normalMap },
        uSunDir:    { value: sunDirection.clone() },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uDayMap;
        uniform sampler2D uNightMap;
        uniform sampler2D uSpecMap;
        uniform vec3      uSunDir;
        varying vec2  vUv;
        varying vec3  vNormalW;
        varying vec3  vViewDir;
        void main() {
          float sunDot = dot(normalize(vNormalW), normalize(uSunDir));
          float dayMix = smoothstep(-0.15, 0.15, sunDot);
          vec3 dayCol   = texture2D(uDayMap,   vUv).rgb;
          vec3 nightCol = texture2D(uNightMap, vUv).rgb;
          vec3 col = mix(nightCol * 1.4, dayCol, dayMix);
          float spec = texture2D(uSpecMap, vUv).r;
          vec3 reflectDir = reflect(-uSunDir, normalize(vNormalW));
          float specPow   = pow(max(dot(reflectDir, vViewDir), 0.0), 32.0);
          col += vec3(0.9, 0.95, 1.0) * spec * specPow * 0.7 * dayMix;
          col += vec3(0.04, 0.05, 0.08) * (1.0 - dayMix);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    cleanupRef.current.geometries.push(earthGeo);
    cleanupRef.current.materials.push(earthMat);

    // ── Cloud layer (also a child of the planet so it co-rotates) ─
    const cloudGeo = new THREE.SphereGeometry(1.013, 96, 96);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudMap, transparent: true, opacity: 0.42, depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);
    cleanupRef.current.geometries.push(cloudGeo);
    cleanupRef.current.materials.push(cloudMat);

    // ── Stars ─────────────────────────────────────────────────────
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30 + Math.random() * 35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    cleanupRef.current.geometries.push(starGeo);
    cleanupRef.current.materials.push(starMat);

    // ── Lighting ──────────────────────────────────────────────────
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.4);
    sun.position.copy(sunDirection).multiplyScalar(5);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x223355, 0.4));

    // ════════════════════════════════════════════════════════════
    // MATH MONUMENT — anchored ON the Earth's surface
    // ════════════════════════════════════════════════════════════
    //
    // Anchor strategy:
    //   - The monument is a CHILD of the Earth mesh, so when Earth
    //     rotates, the monument rotates with it (no manual sync).
    //   - In Earth-local space, it's positioned at +Z = 1 (the equator,
    //     longitude 0). The Earth's geometry is a unit sphere.
    //   - Local rotation: we rotate the group so its local +Y axis
    //     points outward along that radial — a building stood up on
    //     the surface looks "up" away from the planet's centre.
    //
    // Scale:
    //   The monument has a footprint of ~0.18 in Earth-local units.
    //   Earth radius is 1. So the structure is enormous in real-world
    //   terms — it would be visible from orbit. That's the intended
    //   fantasy: a math monument so vast it's a planetary landmark.
    const monument = new THREE.Group();
    earth.add(monument);
    monument.position.set(0, 0, 1);          // surface point: lon 0, lat 0
    monument.lookAt(new THREE.Vector3(0, 0, 2)); // +Y now points radially out

    // Plaza — flat octagonal disk that hugs the surface.
    const plazaGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.012, 8);
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, metalness: 0.3, roughness: 0.45 });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.y = 0.006;
    monument.add(plaza);
    cleanupRef.current.geometries.push(plazaGeo);
    cleanupRef.current.materials.push(plazaMat);

    // Plaza rim glow.
    const ringGeo = new THREE.TorusGeometry(0.185, 0.003, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.013;
    monument.add(ring);
    cleanupRef.current.geometries.push(ringGeo);
    cleanupRef.current.materials.push(ringMat);

    // Central tower — fluted shaft + dark cap + gold crown octahedron.
    const shaftGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.16, 24);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3a3450, metalness: 0.4, roughness: 0.4 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 0.085;
    monument.add(shaft);
    cleanupRef.current.geometries.push(shaftGeo);
    cleanupRef.current.materials.push(shaftMat);

    const capGeo = new THREE.BoxGeometry(0.06, 0.012, 0.06);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1f1a2e, metalness: 0.6, roughness: 0.3 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.17;
    monument.add(cap);
    cleanupRef.current.geometries.push(capGeo);
    cleanupRef.current.materials.push(capMat);

    const crownGeo = new THREE.OctahedronGeometry(0.022);
    const crownMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = 0.195;
    monument.add(crown);
    cleanupRef.current.geometries.push(crownGeo);
    cleanupRef.current.materials.push(crownMat);

    // π-gateway — two pillars + crossbeam in front of the plaza.
    const pillarGeo = new THREE.BoxGeometry(0.012, 0.10, 0.012);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c2540, metalness: 0.3, roughness: 0.5 });
    cleanupRef.current.materials.push(pillarMat);
    const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
    const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
    pillarL.position.set(-0.04, 0.06, 0.12);
    pillarR.position.set( 0.04, 0.06, 0.12);
    monument.add(pillarL); monument.add(pillarR);
    cleanupRef.current.geometries.push(pillarGeo);

    const beamGwGeo = new THREE.BoxGeometry(0.10, 0.010, 0.014);
    const beamGwMat = new THREE.MeshStandardMaterial({ color: 0x14101e, metalness: 0.5, roughness: 0.3 });
    const beamGw = new THREE.Mesh(beamGwGeo, beamGwMat);
    beamGw.position.set(0, 0.115, 0.12);
    monument.add(beamGw);
    cleanupRef.current.geometries.push(beamGwGeo);
    cleanupRef.current.materials.push(beamGwMat);

    // ∞ ring orbiting the tower.
    const infinityGeo = new THREE.TorusGeometry(0.07, 0.003, 12, 64);
    const infinityMat = new THREE.MeshBasicMaterial({ color: 0x00cfff });
    const infinityRing = new THREE.Mesh(infinityGeo, infinityMat);
    infinityRing.position.y = 0.115;
    infinityRing.rotation.x = Math.PI / 2.2;
    monument.add(infinityRing);
    cleanupRef.current.geometries.push(infinityGeo);
    cleanupRef.current.materials.push(infinityMat);

    // Side monoliths — Σ + φ slabs.
    const slabGeo = new THREE.BoxGeometry(0.030, 0.075, 0.012);
    const sigmaMat = new THREE.MeshStandardMaterial({ color: 0x251f3a, metalness: 0.3, roughness: 0.5, emissive: 0xd4a017, emissiveIntensity: 0.25 });
    const phiMat   = new THREE.MeshStandardMaterial({ color: 0x251f3a, metalness: 0.3, roughness: 0.5, emissive: 0x7c3aed, emissiveIntensity: 0.30 });
    cleanupRef.current.materials.push(sigmaMat, phiMat);
    cleanupRef.current.geometries.push(slabGeo);
    const sigma = new THREE.Mesh(slabGeo, sigmaMat);
    const phi   = new THREE.Mesh(slabGeo, phiMat);
    sigma.position.set(-0.12, 0.045, 0.04);
    phi.position.set(  0.12, 0.045, 0.04);
    sigma.rotation.y =  0.3;
    phi.rotation.y   = -0.3;
    monument.add(sigma); monument.add(phi);

    // Two warm point lights so the monument reads "alive" against the
    // dark surface. CRITICAL: use light.position.set(...) here. The
    // previous rev shipped Object.assign(new PointLight(...), { position: new Vector3 })
    // which REPLACES the light's managed position vector with a new
    // instance — Three.js's Object3D matrix updates expect the original
    // and silently produce wrong transforms. .set() mutates the existing
    // Vector3 in place, which is what the engine wants.
    const purpleLight = new THREE.PointLight(0x7c3aed, 0.35, 0.6, 1.6);
    purpleLight.position.set(0, 0.025, 0);
    monument.add(purpleLight);
    const goldLight = new THREE.PointLight(0xffd166, 0.20, 0.5, 1.6);
    goldLight.position.set(0, 0.20, 0);
    monument.add(goldLight);

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────────
    const target  = { camZ: 2.8, camY: 0, camX: 0, lookY: 0, earthSpin: 0.002 };
    const current = { camZ: 2.8, camY: 0, camX: 0, lookY: 0, earthSpin: 0.002 };

    // Store the planet's rotation at the moment we lock it so the lock
    // converges smoothly to "monument facing camera" instead of any
    // arbitrary frame.
    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      // Camera path:
      //  Phase 1 (0–0.45) — orbit zoom toward the planet (z 2.8 → 1.5).
      //                     Earth still rotating, monument off the
      //                     visible face most of the time.
      //  Phase 2 (0.45–0.7) — spin slows and locks; camera dives from
      //                       z 1.5 → 1.18; monument arrives front and
      //                       centre.
      //  Phase 3 (0.7–1.0) — camera glides past + slightly down so the
      //                      monument is framed with planet curvature
      //                      visible at the bottom of the viewport.
      if (p < 0.45) {
        const t = p / 0.45;
        target.camZ      = THREE.MathUtils.lerp(2.8, 1.5, t);
        target.camY      = 0; target.camX = 0;
        target.lookY     = 0;
        target.earthSpin = 0.002;
      } else if (p < 0.7) {
        const t = (p - 0.45) / 0.25;
        target.camZ      = THREE.MathUtils.lerp(1.5, 1.18, t);
        target.camY      = 0; target.camX = 0;
        target.lookY     = 0;
        // Spin eases to 0 and the rotation Y settles at exactly 0
        // (modulo 2π) so the monument anchored at local (0,0,1) faces
        // the camera at +Z.
        target.earthSpin = THREE.MathUtils.lerp(0.002, 0, t);
        // Snap-pull rotation toward 0. Wrap so we always take the short
        // way around the circle.
        let yr = earth.rotation.y % (Math.PI * 2);
        if (yr >  Math.PI) yr -= Math.PI * 2;
        if (yr < -Math.PI) yr += Math.PI * 2;
        earth.rotation.y -= yr * 0.04 * t;
        clouds.rotation.y -= (clouds.rotation.y % (Math.PI * 2)) * 0.04 * t;
      } else {
        const t = (p - 0.7) / 0.30;
        target.camZ      = THREE.MathUtils.lerp(1.18, 1.04, t);
        target.camY      = THREE.MathUtils.lerp(0, -0.06, t);
        target.camX      = 0;
        target.lookY     = THREE.MathUtils.lerp(0, -0.02, t);
        target.earthSpin = 0;
        // Rotation stays locked.
        earth.rotation.y *= 0.92;
        clouds.rotation.y *= 0.92;
      }

      const k = 0.08;
      current.camZ      = THREE.MathUtils.lerp(current.camZ,      target.camZ,      k);
      current.camY      = THREE.MathUtils.lerp(current.camY,      target.camY,      k);
      current.camX      = THREE.MathUtils.lerp(current.camX,      target.camX,      k);
      current.lookY     = THREE.MathUtils.lerp(current.lookY,     target.lookY,     k);
      current.earthSpin = THREE.MathUtils.lerp(current.earthSpin, target.earthSpin, 0.05);

      camera.position.set(current.camX, current.camY, current.camZ);
      camera.lookAt(0, current.lookY, 0);

      // Continuous Earth + cloud rotation. In phase 1 it's full speed;
      // phase 2 eases toward zero; phase 3 holds at zero.
      earth.rotation.y  += current.earthSpin;
      clouds.rotation.y += current.earthSpin * 1.35;
      stars.rotation.y  += 0.00006;

      // Monument animation — only rotate the crown + infinity ring; the
      // base stays planted. Using a tiny scale so the motion reads
      // "alive but not distracting" at orbit zoom.
      const t = performance.now() * 0.001;
      crown.rotation.y = t * 0.6;
      crown.rotation.x = Math.sin(t * 0.7) * 0.18;
      infinityRing.rotation.z = t * 0.55;

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
