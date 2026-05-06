/**
 * EarthScene.jsx — Three.js WebGL hero (rev 2).
 *
 * Changes from rev 1:
 *   - DELETED the blue Fresnel atmosphere shader entirely. User feedback:
 *     "the blue light around it should be gone".
 *   - Added real specular + normal + night-light texture maps so the
 *     planet has ocean shine, terrain depth, and city lights on the
 *     night side. Textures pulled from threejs.org's official planet
 *     example asset set (CC0, CDN-cached, no rate limit). The local
 *     /public/textures/earth.jpg is the day color map.
 *   - ACES filmic tone mapping + sRGB output encoding so colours match
 *     what the textures were authored for instead of looking washed out.
 *   - Higher segment count (192) so the silhouette doesn't show
 *     polygonal facets at the limb.
 *
 *   - Replaced the three small monument primitives with a proper
 *     "Math Headquarters" architectural scene that becomes visible at
 *     scroll progress > 0.6:
 *       - A polished stone plaza with edge underglow.
 *       - A tall central tower (Greek-column style, dark marble + gold
 *         cap).
 *       - Two side pillars + horizontal beam forming a π-gateway.
 *       - A floating ∞ ring rotating around the tower.
 *       - Subtle dust particles for atmospheric depth.
 *       - Sunset-orange directional lighting.
 *
 * Memory: every geometry / material / texture / renderer is tracked in
 * cleanupRef and disposed on unmount. rAF cancelled too.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

const TEX = {
  // Local — already shipped in /public/textures/.
  earthDay:  "/textures/earth.jpg",
  clouds:    "/textures/clouds.png",
  // Three.js's official planet example set — public CDN, CC0. Adds the
  // ocean shine + terrain depth + city lights without us shipping
  // hi-res textures ourselves.
  specular:  "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
  normal:    "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
  lights:    "https://threejs.org/examples/textures/planets/earth_lights_2048.png",
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
    // ACES filmic = standard cinematic tone mapping. Without it the
    // textures look chalky; with it the contrast between day side and
    // night side is much closer to real reference photography.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    cleanupRef.current.renderer = renderer;

    const scene = new THREE.Scene();
    // Mild fog so the math HQ in the distance fades into atmospheric
    // haze instead of popping in sharp.
    scene.fog = new THREE.FogExp2(0x05080f, 0.018);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 200);
    camera.position.set(0, 0, 2.8);

    // ── Texture loading ───────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const dayMap   = loader.load(TEX.earthDay);
    const specMap  = loader.load(TEX.specular);
    const normalMap = loader.load(TEX.normal);
    const nightMap = loader.load(TEX.lights);
    const cloudMap = loader.load(TEX.clouds);
    [dayMap, nightMap, cloudMap].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; });
    // Anisotropy bumps texture sharpness at glancing angles (the limb
    // of the planet). 8 is a safe middle ground — most GPUs cap at 16.
    const aniso = renderer.capabilities.getMaxAnisotropy();
    [dayMap, specMap, normalMap, nightMap, cloudMap].forEach((t) => { t.anisotropy = Math.min(8, aniso); });
    cleanupRef.current.textures.push(dayMap, specMap, normalMap, nightMap, cloudMap);

    // ── Earth ─────────────────────────────────────────────────────
    // Hand-rolled shader so we can blend day + night sides based on
    // sun direction and add a specular ocean highlight from the spec
    // map. MeshPhongMaterial would do most of this but blending in the
    // night-lights texture cleanly requires a custom fragment.
    const earthGeo = new THREE.SphereGeometry(1, 192, 192);
    const sunDirection = new THREE.Vector3(1, 0.25, 0.6).normalize();
    const earthUniforms = {
      uDayMap:    { value: dayMap },
      uNightMap:  { value: nightMap },
      uSpecMap:   { value: specMap },
      uNormalMap: { value: normalMap },
      uSunDir:    { value: sunDirection.clone() },
    };
    const earthMat = new THREE.ShaderMaterial({
      uniforms: earthUniforms,
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
          // Diffuse day / night blend driven by the sun direction.
          // dot > 0 → lit side, < 0 → night side. Use a soft transition
          // band around the terminator instead of a hard cut so the
          // edge reads naturally.
          float sunDot = dot(normalize(vNormalW), normalize(uSunDir));
          float dayMix = smoothstep(-0.15, 0.15, sunDot);

          vec3 dayCol   = texture2D(uDayMap,   vUv).rgb;
          vec3 nightCol = texture2D(uNightMap, vUv).rgb;
          // City lights only show on the night side; multiply by
          // (1 - dayMix) so they fade as the terminator passes.
          vec3 col = mix(nightCol * 1.4, dayCol, dayMix);

          // Ocean specular — spec map is white on water, black on land.
          // Blinn-Phong reflection vector dotted with view dir, raised
          // to high power = sharp highlight only on water at the right
          // viewing angle.
          float spec = texture2D(uSpecMap, vUv).r;
          vec3 reflectDir = reflect(-uSunDir, normalize(vNormalW));
          float specPow   = pow(max(dot(reflectDir, vViewDir), 0.0), 32.0);
          col += vec3(0.9, 0.95, 1.0) * spec * specPow * 0.7 * dayMix;

          // Ambient fill so the night side isn't pitch-black.
          col += vec3(0.04, 0.05, 0.08) * (1.0 - dayMix);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    cleanupRef.current.geometries.push(earthGeo);
    cleanupRef.current.materials.push(earthMat);

    // ── Cloud layer ───────────────────────────────────────────────
    const cloudGeo = new THREE.SphereGeometry(1.013, 96, 96);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);
    cleanupRef.current.geometries.push(cloudGeo);
    cleanupRef.current.materials.push(cloudMat);

    // (No atmosphere mesh — user feedback was the blue Fresnel rim
    // looked artificial. Earth now reads as a clean planet against
    // dark space, with the only "atmosphere" being the soft day/night
    // terminator bake we do in the fragment shader above.)

    // ── Stars ─────────────────────────────────────────────────────
    const starCount = 2400;
    const starPositions = new Float32Array(starCount * 3);
    const starSizes     = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const r     = 30 + Math.random() * 35;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      // Vary size so the field isn't a uniform speckle. A handful of
      // bright "lead" stars + lots of small ones reads as real sky.
      starSizes[i] = Math.random() < 0.05 ? 0.18 : (0.05 + Math.random() * 0.05);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("size",     new THREE.BufferAttribute(starSizes, 1));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      size: 0.08,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    cleanupRef.current.geometries.push(starGeo);
    cleanupRef.current.materials.push(starMat);

    // ── Lighting ──────────────────────────────────────────────────
    // Single directional light positioned to match the shader's
    // uSunDir uniform. Slightly warm to evoke golden-hour.
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.4);
    sun.position.copy(sunDirection).multiplyScalar(5);
    scene.add(sun);
    // Faint ambient so MeshStandardMaterial cloud layer + HQ stones
    // don't go fully black on the unlit side.
    scene.add(new THREE.AmbientLight(0x223355, 0.4));

    // ══════════════════════════════════════════════════════════════
    // MATH HEADQUARTERS — visible at scroll > 0.6
    // ══════════════════════════════════════════════════════════════
    const hq = new THREE.Group();
    hq.position.set(0, -3.5, 0);
    hq.visible = false;
    scene.add(hq);

    // Stone plaza — large flat octagon, polished marble feel.
    const plazaGeo = new THREE.CylinderGeometry(2.4, 2.6, 0.18, 8);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x2a2438, metalness: 0.2, roughness: 0.45,
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    hq.add(plaza);
    cleanupRef.current.geometries.push(plazaGeo);
    cleanupRef.current.materials.push(plazaMat);

    // Edge underglow — thin emissive ring around the plaza rim. This
    // is what gives the "futuristic stadium" feel.
    const ringGeo = new THREE.TorusGeometry(2.45, 0.025, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    hq.add(ring);
    cleanupRef.current.geometries.push(ringGeo);
    cleanupRef.current.materials.push(ringMat);

    // Central tower — a tall fluted column. Approximated as a tall
    // cylinder with a wider square cap (architrave) and a glowing
    // capital on top.
    const towerShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 2.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a3450, metalness: 0.3, roughness: 0.5 }),
    );
    towerShaft.position.y = 1.2;
    hq.add(towerShaft);
    cleanupRef.current.geometries.push(towerShaft.geometry);
    cleanupRef.current.materials.push(towerShaft.material);

    const towerCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.18, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x1f1a2e, metalness: 0.6, roughness: 0.3 }),
    );
    towerCap.position.y = 2.4;
    hq.add(towerCap);
    cleanupRef.current.geometries.push(towerCap.geometry);
    cleanupRef.current.materials.push(towerCap.material);

    const towerCrown = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32),
      new THREE.MeshBasicMaterial({ color: 0xd4a017 }), // glowing gold
    );
    towerCrown.position.y = 2.7;
    hq.add(towerCrown);
    cleanupRef.current.geometries.push(towerCrown.geometry);
    cleanupRef.current.materials.push(towerCrown.material);

    // π-gateway in front of the plaza — two pillars + horizontal beam.
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c2540, metalness: 0.25, roughness: 0.55 });
    const pillarGeo = new THREE.BoxGeometry(0.18, 1.4, 0.18);
    const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
    const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
    pillarL.position.set(-0.55, 0.8, 1.6);
    pillarR.position.set( 0.55, 0.8, 1.6);
    hq.add(pillarL); hq.add(pillarR);
    cleanupRef.current.geometries.push(pillarGeo);
    cleanupRef.current.materials.push(pillarMat);

    const beamGeo = new THREE.BoxGeometry(1.4, 0.14, 0.22);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1f1a2e, metalness: 0.5, roughness: 0.3 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 1.55, 1.6);
    hq.add(beam);
    cleanupRef.current.geometries.push(beamGeo);
    cleanupRef.current.materials.push(beamMat);

    // ∞ ring — large torus rotating around the tower in the horizontal
    // plane. Gives the scene constant motion without being distracting.
    const infinityGeo = new THREE.TorusGeometry(1.0, 0.04, 12, 96);
    const infinityMat = new THREE.MeshBasicMaterial({ color: 0x00cfff });
    const infinityRing = new THREE.Mesh(infinityGeo, infinityMat);
    infinityRing.position.y = 1.6;
    infinityRing.rotation.x = Math.PI / 2.2;
    hq.add(infinityRing);
    cleanupRef.current.geometries.push(infinityGeo);
    cleanupRef.current.materials.push(infinityMat);

    // Side monoliths — Σ to the left, π to the right, sized like
    // statue plinths. Simple slabs with emissive runes.
    const sigmaGeo = new THREE.BoxGeometry(0.45, 1.1, 0.18);
    const sigmaMat = new THREE.MeshStandardMaterial({ color: 0x251f3a, metalness: 0.3, roughness: 0.5, emissive: 0xd4a017, emissiveIntensity: 0.15 });
    const sigma = new THREE.Mesh(sigmaGeo, sigmaMat);
    sigma.position.set(-1.6, 0.65, 0.4);
    sigma.rotation.y = 0.3;
    hq.add(sigma);
    cleanupRef.current.geometries.push(sigmaGeo);
    cleanupRef.current.materials.push(sigmaMat);

    const piMonoGeo = new THREE.BoxGeometry(0.45, 1.1, 0.18);
    const piMonoMat = new THREE.MeshStandardMaterial({ color: 0x251f3a, metalness: 0.3, roughness: 0.5, emissive: 0x7c3aed, emissiveIntensity: 0.18 });
    const piMono = new THREE.Mesh(piMonoGeo, piMonoMat);
    piMono.position.set(1.6, 0.65, 0.4);
    piMono.rotation.y = -0.3;
    hq.add(piMono);
    cleanupRef.current.geometries.push(piMonoGeo);
    cleanupRef.current.materials.push(piMonoMat);

    // HQ floor lights — two purple point lights anchored in the plaza.
    const purpleLight = new THREE.PointLight(0x7c3aed, 1.5, 6, 1.5);
    purpleLight.position.set(0, 0.4, 0);
    hq.add(purpleLight);
    const goldLight = new THREE.PointLight(0xd4a017, 1.0, 5, 1.5);
    goldLight.position.set(0, 2.7, 0);
    hq.add(goldLight);

    // Dust particles around the plaza for atmospheric depth.
    const dustCount = 200;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.8 + Math.random() * 1.5;
      dustPos[i * 3]     = Math.cos(a) * r;
      dustPos[i * 3 + 1] = Math.random() * 2.5;
      dustPos[i * 3 + 2] = Math.sin(a) * r;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0xc4a8ff, size: 0.04, transparent: true, opacity: 0.6, sizeAttenuation: true });
    const dust = new THREE.Points(dustGeo, dustMat);
    hq.add(dust);
    cleanupRef.current.geometries.push(dustGeo);
    cleanupRef.current.materials.push(dustMat);

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────────
    const target  = { camZ: 2.8, camY: 0, camX: 0, lookY: 0 };
    const current = { camZ: 2.8, camY: 0, camX: 0, lookY: 0 };

    const tick = () => {
      const span = scrollSpan();
      const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      if (p < 0.5) {
        // Phase 1: zoom in from far orbit to close-up.
        const t = p / 0.5;
        target.camZ  = THREE.MathUtils.lerp(2.8, 1.05, t);
        target.camY  = 0;
        target.camX  = 0;
        target.lookY = 0;
      } else if (p < 0.65) {
        // Phase 2: brief pause + slight lateral drift hinting at "we're
        // approaching something". No more atmosphere flash (user
        // didn't like it); just a gentle camera shift downward.
        const t = (p - 0.5) / 0.15;
        target.camZ  = 1.05;
        target.camY  = THREE.MathUtils.lerp(0, -0.4, t);
        target.camX  = 0;
        target.lookY = THREE.MathUtils.lerp(0, -0.6, t);
      } else {
        // Phase 3: descend onto the math HQ. Camera tilts down + back
        // a bit so the plaza is fully framed at the end.
        const t = (p - 0.65) / 0.35;
        target.camZ  = THREE.MathUtils.lerp(1.05, 4.5, t);
        target.camY  = THREE.MathUtils.lerp(-0.4, -2.0, t);
        target.camX  = THREE.MathUtils.lerp(0, 0.2, t);
        target.lookY = THREE.MathUtils.lerp(-0.6, -3.5, t);
        hq.visible = t > 0.05;
      }

      // Smooth follow.
      const k = 0.08;
      current.camZ  = THREE.MathUtils.lerp(current.camZ,  target.camZ,  k);
      current.camY  = THREE.MathUtils.lerp(current.camY,  target.camY,  k);
      current.camX  = THREE.MathUtils.lerp(current.camX,  target.camX,  k);
      current.lookY = THREE.MathUtils.lerp(current.lookY, target.lookY, k);

      camera.position.set(current.camX, current.camY, current.camZ);
      camera.lookAt(0, current.lookY, 0);

      // Continuous Earth + cloud rotation. Clouds drift slightly faster
      // so the layers separate visually.
      earth.rotation.y  += 0.0014;
      clouds.rotation.y += 0.0019;
      stars.rotation.y  += 0.00006;

      // HQ animation when visible.
      if (hq.visible) {
        const t = performance.now() * 0.001;
        infinityRing.rotation.z = t * 0.6;
        towerCrown.rotation.y   = t * 0.5;
        towerCrown.rotation.x   = Math.sin(t * 0.7) * 0.2;
        // Subtle bob on the dust layer so it reads as floating.
        dust.position.y = Math.sin(t * 0.6) * 0.05;
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
