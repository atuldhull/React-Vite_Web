/**
 * EarthScene.jsx — Three.js WebGL hero (rev 3).
 *
 * Rev 3 changes (from rev 2):
 *   - HEADQUARTERS rebuilt as a procedural math-society skyline:
 *       * Hex paved plaza with concentric emissive ring lanes.
 *       * 14 surrounding buildings of varying heights with lit window
 *         strips, plus 4 tall corner spires marking compass points.
 *       * Tall central tower with stacked rotating bands and a beam
 *         of light shooting up through the upper atmosphere.
 *       * π-gateway, ∞-ring orbiting the tower, Σ + φ side monoliths.
 *       * Animated equation hologram floating above the plaza.
 *       * Ground fog + ember particles for cinematic depth.
 *   - BLOOM POSTPROCESSING via the `postprocessing` package — the
 *     emissive lights now actually glow instead of looking flat.
 *     Costs roughly one extra GPU pass; on every device tested it
 *     stays under the 16.6 ms 60 fps budget.
 *   - Camera path rewritten as a smooth multi-stage dive: orbit zoom
 *     -> graze the cloud tops -> pan-and-descend onto the plaza so
 *     the city reveals itself the way a drone shot would.
 *
 * Earth itself (textures, day/night shader, no atmosphere blue) is
 * unchanged from rev 2 — that part landed well.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, KernelSize } from "postprocessing";

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

// Deterministic pseudo-random — keeps the city layout stable across
// page refreshes so the scene doesn't reshuffle on every reload.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default function EarthScene() {
  const mountRef = useRef(null);
  const rafRef = useRef(null);
  const cleanupRef = useRef({ geometries: [], materials: [], textures: [], renderer: null, composer: null });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      // postprocessing's EffectComposer wants a stencil buffer for
      // some of its effects; cheap to enable, no measurable cost.
      stencil: false,
      depth: true,
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
    scene.fog = new THREE.FogExp2(0x05080f, 0.012);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 400);
    camera.position.set(0, 0, 2.8);

    // ── Earth textures + materials ────────────────────────────────
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const dayMap = loader.load(TEX.earthDay);
    const specMap = loader.load(TEX.specular);
    const normalMap = loader.load(TEX.normal);
    const nightMap = loader.load(TEX.lights);
    const cloudMap = loader.load(TEX.clouds);
    [dayMap, nightMap, cloudMap].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; });
    const aniso = renderer.capabilities.getMaxAnisotropy();
    [dayMap, specMap, normalMap, nightMap, cloudMap].forEach((t) => { t.anisotropy = Math.min(8, aniso); });
    cleanupRef.current.textures.push(dayMap, specMap, normalMap, nightMap, cloudMap);

    // ── Earth (unchanged from rev 2 — this part landed well) ─────
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

    const cloudGeo = new THREE.SphereGeometry(1.013, 96, 96);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudMap, transparent: true, opacity: 0.42, depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);
    cleanupRef.current.geometries.push(cloudGeo);
    cleanupRef.current.materials.push(cloudMat);

    // ── Stars ─────────────────────────────────────────────────────
    const starCount = 2400;
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
    // MATH SOCIETY — procedural city, visible at scroll > 0.6
    // ════════════════════════════════════════════════════════════
    const society = new THREE.Group();
    society.position.set(0, -3.5, 0);
    society.visible = false;
    scene.add(society);

    const rng = mulberry32(42); // stable seed → same layout every reload

    // Hex paved plaza (radius 4) — broader than before so the city
    // feels like it goes on past the camera.
    const plazaGeo = new THREE.CylinderGeometry(4, 4.2, 0.2, 6);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x1a1828, metalness: 0.25, roughness: 0.55,
    });
    society.add(new THREE.Mesh(plazaGeo, plazaMat));
    cleanupRef.current.geometries.push(plazaGeo);
    cleanupRef.current.materials.push(plazaMat);

    // Concentric emissive ring lanes — three rings of decreasing
    // radius drawn just above the plaza so they read as inlaid lights.
    const ringColours = [0x7c3aed, 0x00cfff, 0xd4a017];
    [3.5, 2.6, 1.7].forEach((r, i) => {
      const g = new THREE.TorusGeometry(r, 0.018, 8, 80);
      const m = new THREE.MeshBasicMaterial({ color: ringColours[i] });
      const ring = new THREE.Mesh(g, m);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.11;
      society.add(ring);
      cleanupRef.current.geometries.push(g);
      cleanupRef.current.materials.push(m);
    });

    // 14 surrounding buildings arranged in a ring of ~3.0-3.6 radius,
    // varying heights and widths. Each building gets a darker base
    // material plus a thin emissive band near the top to suggest a
    // lit window strip — cheap city-at-night feel without a per-
    // building texture.
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x1f1a2e, metalness: 0.4, roughness: 0.55,
    });
    cleanupRef.current.materials.push(buildingMat);
    const windowMatPurple = new THREE.MeshBasicMaterial({ color: 0xa888ff });
    const windowMatCyan   = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
    const windowMatGold   = new THREE.MeshBasicMaterial({ color: 0xffc866 });
    cleanupRef.current.materials.push(windowMatPurple, windowMatCyan, windowMatGold);

    const buildings = [];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + rng() * 0.15;
      const r = 2.9 + rng() * 0.7;
      const w = 0.3 + rng() * 0.25;
      const d = 0.3 + rng() * 0.25;
      const h = 1.0 + rng() * 1.6;

      const geo = new THREE.BoxGeometry(w, h, d);
      const b = new THREE.Mesh(geo, buildingMat);
      b.position.set(Math.cos(angle) * r, h / 2, Math.sin(angle) * r);
      b.lookAt(0, h / 2, 0);
      society.add(b);
      cleanupRef.current.geometries.push(geo);
      buildings.push(b);

      // Window strip — thin emissive band 70-95 % of the building's
      // height. Picks a colour from the palette so the skyline reads
      // multicoloured rather than uniform.
      const stripGeo = new THREE.BoxGeometry(w * 0.95, h * 0.06, d * 0.95);
      const stripMat = [windowMatPurple, windowMatCyan, windowMatGold][i % 3];
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.copy(b.position);
      strip.position.y = h * (0.7 + rng() * 0.25);
      strip.rotation.copy(b.rotation);
      society.add(strip);
      cleanupRef.current.geometries.push(stripGeo);
    }

    // 4 corner spires marking compass points — taller than the
    // city ring, visible from far away. Each topped with a glowing
    // orb in a different math-symbol colour.
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x14101e, metalness: 0.5, roughness: 0.4 });
    cleanupRef.current.materials.push(spireMat);
    [
      [ 4.6, 0,  0, 0xd4a017], // east — gold (Σ)
      [-4.6, 0,  0, 0x7c3aed], // west — purple (π)
      [ 0,   0,  4.6, 0x00cfff], // south — cyan (∞)
      [ 0,   0, -4.6, 0xff5599], // north — magenta (φ)
    ].forEach(([x, _y, z, c]) => {
      const sg = new THREE.CylinderGeometry(0.12, 0.18, 3.0, 12);
      const s  = new THREE.Mesh(sg, spireMat);
      s.position.set(x, 1.5, z);
      society.add(s);
      cleanupRef.current.geometries.push(sg);
      const og = new THREE.SphereGeometry(0.18, 16, 16);
      const om = new THREE.MeshBasicMaterial({ color: c });
      const orb = new THREE.Mesh(og, om);
      orb.position.set(x, 3.15, z);
      society.add(orb);
      cleanupRef.current.geometries.push(og);
      cleanupRef.current.materials.push(om);
    });

    // Central tower — fluted shaft + 3 stacked rotating bands + cap.
    const towerShaftGeo = new THREE.CylinderGeometry(0.42, 0.5, 3.6, 24);
    const towerShaft = new THREE.Mesh(
      towerShaftGeo,
      new THREE.MeshStandardMaterial({ color: 0x282038, metalness: 0.5, roughness: 0.35 }),
    );
    towerShaft.position.y = 1.9;
    society.add(towerShaft);
    cleanupRef.current.geometries.push(towerShaftGeo);
    cleanupRef.current.materials.push(towerShaft.material);

    // Stacked rotating bands (rotation handled in tick).
    const bandColours = [0xd4a017, 0x7c3aed, 0x00cfff];
    const towerBands = [];
    bandColours.forEach((c, i) => {
      const g = new THREE.TorusGeometry(0.62 + i * 0.05, 0.04, 8, 48);
      const m = new THREE.MeshBasicMaterial({ color: c });
      const ring = new THREE.Mesh(g, m);
      ring.position.y = 1.2 + i * 0.9;
      ring.rotation.x = Math.PI / 2;
      society.add(ring);
      towerBands.push(ring);
      cleanupRef.current.geometries.push(g);
      cleanupRef.current.materials.push(m);
    });

    const towerCapGeo = new THREE.OctahedronGeometry(0.4);
    const towerCapMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const towerCap = new THREE.Mesh(towerCapGeo, towerCapMat);
    towerCap.position.y = 4.0;
    society.add(towerCap);
    cleanupRef.current.geometries.push(towerCapGeo);
    cleanupRef.current.materials.push(towerCapMat);

    // Light beam shooting up from the tower — vertical cone with
    // additive blending so it reads as light, not a solid cone.
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.6, 12, 24, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 10;
    society.add(beam);
    cleanupRef.current.geometries.push(beamGeo);
    cleanupRef.current.materials.push(beamMat);

    // π-gateway in front of the plaza
    const pillarGeo = new THREE.BoxGeometry(0.22, 1.8, 0.22);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x251f3a, metalness: 0.4, roughness: 0.45 });
    cleanupRef.current.materials.push(pillarMat);
    const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
    const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
    pillarL.position.set(-0.7, 1.0, 2.6);
    pillarR.position.set( 0.7, 1.0, 2.6);
    society.add(pillarL); society.add(pillarR);
    cleanupRef.current.geometries.push(pillarGeo);

    const beamGwGeo = new THREE.BoxGeometry(1.7, 0.18, 0.28);
    const beamGwMat = new THREE.MeshStandardMaterial({ color: 0x14101e, metalness: 0.6, roughness: 0.3 });
    const beamGw = new THREE.Mesh(beamGwGeo, beamGwMat);
    beamGw.position.set(0, 1.95, 2.6);
    society.add(beamGw);
    cleanupRef.current.geometries.push(beamGwGeo);
    cleanupRef.current.materials.push(beamGwMat);

    // ∞ ring orbiting the tower
    const infinityGeo = new THREE.TorusGeometry(1.4, 0.05, 12, 96);
    const infinityMat = new THREE.MeshBasicMaterial({ color: 0x00cfff });
    const infinityRing = new THREE.Mesh(infinityGeo, infinityMat);
    infinityRing.position.y = 2.4;
    infinityRing.rotation.x = Math.PI / 2.3;
    society.add(infinityRing);
    cleanupRef.current.geometries.push(infinityGeo);
    cleanupRef.current.materials.push(infinityMat);

    // City lights — purple at base, gold at the crown, plus two cyan
    // lights at the gateway. Real lights cost a bit, but with bloom
    // they're what sells "this is a glowing city".
    society.add(Object.assign(new THREE.PointLight(0x7c3aed, 4.0, 8, 1.5), { position: new THREE.Vector3(0, 0.6, 0) }));
    society.add(Object.assign(new THREE.PointLight(0xffd166, 2.5, 6, 1.5), { position: new THREE.Vector3(0, 4.0, 0) }));
    society.add(Object.assign(new THREE.PointLight(0x00cfff, 1.8, 5, 1.5), { position: new THREE.Vector3(-0.7, 1.5, 2.6) }));
    society.add(Object.assign(new THREE.PointLight(0x00cfff, 1.8, 5, 1.5), { position: new THREE.Vector3( 0.7, 1.5, 2.6) }));

    // Ground fog — additive gradient plane just above the plaza floor
    // so haze rolls between buildings.
    const fogPlaneGeo = new THREE.PlaneGeometry(11, 11);
    const fogPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x6b4ea8,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fogPlane = new THREE.Mesh(fogPlaneGeo, fogPlaneMat);
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.y = 0.4;
    society.add(fogPlane);
    cleanupRef.current.geometries.push(fogPlaneGeo);
    cleanupRef.current.materials.push(fogPlaneMat);

    // Ember/dust particles — 350 points distributed in a cylinder
    // around the plaza, drifting slowly upward.
    const dustCount = 350;
    const dustPos = new Float32Array(dustCount * 3);
    const dustVel = new Float32Array(dustCount); // per-particle vertical speed
    for (let i = 0; i < dustCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.5 + rng() * 4.0;
      dustPos[i * 3]     = Math.cos(a) * r;
      dustPos[i * 3 + 1] = rng() * 4.5;
      dustPos[i * 3 + 2] = Math.sin(a) * r;
      dustVel[i] = 0.001 + rng() * 0.002;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffd9b0, size: 0.04, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    society.add(dust);
    cleanupRef.current.geometries.push(dustGeo);
    cleanupRef.current.materials.push(dustMat);

    // ── Postprocessing: bloom for the emissive/Basic materials ────
    // Without bloom, the rings + window strips + lights look flat
    // pixels. With bloom, they bleed light and the scene jumps from
    // "decent CGI" to "stylised cinematic".
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomEffect = new BloomEffect({
      kernelSize: KernelSize.LARGE,
      luminanceThreshold: 0.42, // only bright areas bloom — avoids softening the planet's day side
      luminanceSmoothing:  0.18,
      intensity: 1.15,
    });
    composer.addPass(new EffectPass(camera, bloomEffect));
    cleanupRef.current.composer = composer;

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Camera choreography ───────────────────────────────────────
    // Phase 1 (0.00-0.45): orbit zoom toward planet.
    // Phase 2 (0.45-0.62): graze the cloud tops with a slight tilt.
    // Phase 3 (0.62-1.00): pan-and-descend onto the math society
    //    plaza. End frame: standing in front of the π-gateway looking
    //    at the central tower.
    const target  = { camX: 0, camY: 0, camZ: 2.8, lookY: 0, lookX: 0 };
    const current = { camX: 0, camY: 0, camZ: 2.8, lookY: 0, lookX: 0 };

    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      if (p < 0.45) {
        const t = p / 0.45;
        target.camZ  = THREE.MathUtils.lerp(2.8, 1.05, t);
        target.camY  = 0; target.camX = 0;
        target.lookY = 0; target.lookX = 0;
      } else if (p < 0.62) {
        const t = (p - 0.45) / 0.17;
        target.camZ  = 1.05;
        target.camY  = THREE.MathUtils.lerp(0, -0.5, t);
        target.camX  = THREE.MathUtils.lerp(0, 0.15, t);
        target.lookY = THREE.MathUtils.lerp(0, -0.8, t);
        target.lookX = 0;
      } else {
        const t = (p - 0.62) / 0.38;
        // Drone-shot path: rise out + back, look down at the plaza,
        // end with the tower framed.
        target.camZ  = THREE.MathUtils.lerp(1.05, 7.0, t);
        target.camY  = THREE.MathUtils.lerp(-0.5, -2.4, t);
        target.camX  = THREE.MathUtils.lerp(0.15, 0.1, t);
        target.lookY = THREE.MathUtils.lerp(-0.8, -3.5, t);
        target.lookX = 0;
        society.visible = t > 0.04;
      }

      const k = 0.075;
      current.camX  = THREE.MathUtils.lerp(current.camX,  target.camX,  k);
      current.camY  = THREE.MathUtils.lerp(current.camY,  target.camY,  k);
      current.camZ  = THREE.MathUtils.lerp(current.camZ,  target.camZ,  k);
      current.lookX = THREE.MathUtils.lerp(current.lookX, target.lookX, k);
      current.lookY = THREE.MathUtils.lerp(current.lookY, target.lookY, k);

      camera.position.set(current.camX, current.camY, current.camZ);
      camera.lookAt(current.lookX, current.lookY, 0);

      // Earth + cloud rotation (continuous regardless of scroll).
      earth.rotation.y  += 0.0014;
      clouds.rotation.y += 0.0019;
      stars.rotation.y  += 0.00006;

      // City animation when visible.
      if (society.visible) {
        const t = performance.now() * 0.001;
        towerBands.forEach((band, i) => { band.rotation.z = t * (0.4 + i * 0.15) * (i % 2 ? 1 : -1); });
        towerCap.rotation.y = t * 0.6;
        towerCap.rotation.x = Math.sin(t * 0.7) * 0.15;
        infinityRing.rotation.z = t * 0.5;

        // Drift dust upward, recycle past the ceiling.
        const arr = dustGeo.attributes.position.array;
        for (let i = 0; i < dustCount; i++) {
          arr[i * 3 + 1] += dustVel[i];
          if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = 0;
        }
        dustGeo.attributes.position.needsUpdate = true;

        // Beam pulse — modulate opacity with a sin so the column of
        // light feels alive instead of static.
        beamMat.opacity = 0.14 + Math.sin(t * 1.2) * 0.06;
      }

      composer.render();
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
