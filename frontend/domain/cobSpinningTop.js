/**
 * Svarg — Cob spinning top (real 3D, not a flat image)
 *
 * A flat photo/APNG can't rotate around its vertical axis without
 * collapsing into a thin sliver at 90° — that's structural to animating
 * a 2D image, not something CSS or a better export can fix. This
 * renders an actual THREE.LatheGeometry top with real volume, in
 * Svarg's own brand color, so it looks like itself from every angle
 * through a full continuous spin.
 *
 * Decorative only — every failure path here (no WebGL, CDN unreachable,
 * canvas missing) degrades silently rather than affecting the rest of
 * the Opportunities screen.
 */

const HIDE_BREAKPOINT = 1100; // matches domain.css's .rp-spinning-top media query
const DISPLAY_SIZE = 130;      // matches the element's previous (image-era) display size
const SECONDS_PER_REVOLUTION = 3;

async function init() {
  const canvas = document.getElementById('rp-spinning-top-canvas');
  if (!canvas || window.innerWidth <= HIDE_BREAKPOINT) return;

  let THREE;
  try {
    THREE = await import('three');
  } catch (err) {
    console.warn('[cobSpinningTop] Three.js failed to load — skipping (decorative only):', err);
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (err) {
    console.warn('[cobSpinningTop] WebGL unavailable — skipping (decorative only):', err);
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(DISPLAY_SIZE, DISPLAY_SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
  camera.position.set(0, 0.25, 3.2);
  camera.lookAt(0, 0, 0);

  // ── Geometry: a real spinning-top silhouette, revolved into a solid
  // (points from the axis outward, spike tip down to the sharp point) ──
  const profile = [
    new THREE.Vector2(0,    1.15), // top spike tip
    new THREE.Vector2(0.05, 1.05),
    new THREE.Vector2(0.16, 0.92),
    new THREE.Vector2(0.55, 0.82), // widest point — the shoulder
    new THREE.Vector2(0.52, 0.68),
    new THREE.Vector2(0.32, 0.28),
    new THREE.Vector2(0.10, -0.15),
    new THREE.Vector2(0,   -0.65), // sharp bottom point
  ];
  const geometry = new THREE.LatheGeometry(profile, 48);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x5CC5A7, // Svarg's real accent — a controllable material color, not a photo needing a CSS tint
    metalness: 0.9,
    roughness: 0.28,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  });

  const top = new THREE.Mesh(geometry, material);
  top.position.y = -0.15;
  scene.add(top);

  // ── Lighting: key + a brand-blue rim light + a soft fill ────────────
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 2, 2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x3DAFD3, 1.8); // Svarg's secondary blue
  rim.position.set(-1.5, -0.5, -1.5);
  scene.add(rim);

  const fill = new THREE.HemisphereLight(0x8888aa, 0x111111, 0.6);
  scene.add(fill);

  // ── Animation: exactly one revolution per 3 seconds, frame-rate
  // independent, paused while the tab isn't visible ───────────────────
  let lastTime = performance.now();
  let rafId = null;
  let running = true;

  function tick(now) {
    if (!running) return;
    const delta = (now - lastTime) / 1000;
    lastTime = now;
    top.rotation.y += ((Math.PI * 2) / SECONDS_PER_REVOLUTION) * delta;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.warn('[cobSpinningTop] init failed (decorative only):', err));
});
