/* ================================================================== */
/* scene/sky — the starfield, constellations, bright stars and grid.   */
/*                                                                     */
/* These hang on a sphere far outside the planets. Their labels are    */
/* DOM, but they are owned here (not in ui/) because positioning them  */
/* needs the camera and the same projection as the body labels.        */
/* ================================================================== */
import * as THREE from 'three';

import { W, SKYBOX_RADIUS, STAR_COUNTS } from '../config.js';
import { lowPower, view } from '../state.js';
import { OBLIQUITY, radecToVector } from '../astronomy/coordinates.js';
import { CONSTELLATIONS, BRIGHT_STARS } from '../data/sky.js';
import { registerStar } from './star-paths.js';

const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

export const constellationGroup = new THREE.Group();
export const brightStarsGroup = new THREE.Group();
export const skyGridGroup = new THREE.Group();
export const constLabels = [];
export const brightStarLabels = [];

let hideTooltipImpl = () => {};
export function hideConstTooltip() { hideTooltipImpl(); }

const _proj = new THREE.Vector3();

export function initSky(deps) {
  const { scene, textureLoader, labelsRoot, onStarPathToggle } = deps;

  /* --- Starfield --- */
  const milkyWay = textureLoader.load(
    W + '0/0e/Solarsystemscope_texture_2k_stars_milky_way.jpg'
  );
  milkyWay.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(SKYBOX_RADIUS, 48, 24),
    new THREE.MeshBasicMaterial({ map: milkyWay, side: THREE.BackSide })
  ));

  const STAR_COUNT = lowPower ? STAR_COUNTS.low : STAR_COUNTS.high;
  const starGeo = new THREE.BufferGeometry();
  {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = SKYBOX_RADIUS * 0.95;
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3]     = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  }
  const starMat = new THREE.PointsMaterial({
    color: 0xf2efe6, size: lowPower ? 18 : 14, sizeAttenuation: true, transparent: true, opacity: 0.9,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  /* --- Constellations: famous stick figures on the celestial sphere --- */
  {
    const R = SKYBOX_RADIUS * 0.94;
    const linePos = [];
    const constTooltip = document.getElementById('const-tooltip');
    function showConstTooltip(name, intro, x, y) {
      if (!constTooltip) return;
      constTooltip.innerHTML = `<b>${name}</b><br><span style="color:rgba(242,239,230,0.85)">${intro}</span>`;
      constTooltip.style.left = Math.min(x + 12, window.innerWidth - 260) + 'px';
      constTooltip.style.top = Math.min(y + 12, window.innerHeight - 80) + 'px';
      constTooltip.classList.add('show');
    }
    hideTooltipImpl = () => { if (constTooltip) constTooltip.classList.remove('show'); };

    for (const c of CONSTELLATIONS) {
      const pts = c.stars.map((s) => v3(radecToVector(s[0], s[1], R)));
      for (const [a, b] of c.lines) {
        linePos.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
      }
      const lp = v3(radecToVector(c.label[0], c.label[1], R));
      const el = document.createElement('div');
      el.className = 'const-label';
      el.textContent = c.name;
      el.style.display = 'none';
      el.addEventListener('mouseenter', (e) => showConstTooltip(c.name, c.intro, e.clientX, e.clientY));
      el.addEventListener('mousemove', (e) => showConstTooltip(c.name, c.intro, e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideConstTooltip);
      el.addEventListener('click', (e) => { e.stopPropagation(); showConstTooltip(c.name, c.intro, e.clientX, e.clientY); });
      labelsRoot.appendChild(el);
      constLabels.push({ el, pos: lp });
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.22 });
    constellationGroup.add(new THREE.LineSegments(lineGeo, lineMat));
    scene.add(constellationGroup);
  }

  /* --- Bright stars & sky grid --- */
  {
    const R = SKYBOX_RADIUS * 0.93;
    const constTooltip = document.getElementById('const-tooltip');
    function showTip(name, intro, x, y) {
      if (!constTooltip) return;
      constTooltip.innerHTML = `<b>${name}</b><br><span style="color:rgba(242,239,230,0.85)">${intro}</span>`;
      constTooltip.style.left = Math.min(x + 12, window.innerWidth - 260) + 'px';
      constTooltip.style.top = Math.min(y + 12, window.innerHeight - 80) + 'px';
      constTooltip.classList.add('show');
    }
    const starGeoPts = new THREE.BufferGeometry();
    const posArr = [];
    BRIGHT_STARS.forEach((s) => {
      // keep in equatorial frame for consistency with constellations
      const pEq = v3(radecToVector(s.ra, s.dec, R));
      posArr.push(pEq.x, pEq.y, pEq.z);
      registerStar(s.name, pEq);
      const el = document.createElement('div');
      el.className = 'const-label';
      el.style.color = 'rgba(242,239,230,0.7)';
      el.textContent = s.name;
      el.style.display = 'none';
      el.addEventListener('mouseenter', (e) => showTip(s.name, s.info, e.clientX, e.clientY));
      el.addEventListener('mousemove', (e) => showTip(s.name, s.info, e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideConstTooltip);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        showTip(s.name, s.info, e.clientX, e.clientY);
        if (onStarPathToggle) onStarPathToggle(s.name);
      });
      labelsRoot.appendChild(el);
      brightStarLabels.push({ el, pos: pEq });
    });
    starGeoPts.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    brightStarsGroup.add(new THREE.Points(starGeoPts, new THREE.PointsMaterial({ color: 0xffffff, size: 22, sizeAttenuation: true })));
    scene.add(brightStarsGroup);

    // Grid: celestial equator and ecliptic (great circles)
    function circleLine(radius, yFunc, color, opacity = 0.18) {
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const a = i / 128 * Math.PI * 2;
        const x = Math.cos(a), z = Math.sin(a);
        const y = yFunc ? yFunc(a) : 0;
        pts.push(new THREE.Vector3(x * radius, y * radius, z * radius));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    }
    // Celestial equator in equatorial frame
    skyGridGroup.add(circleLine(R * 0.92, () => 0, 0x6aa7ff, 0.16));
    // Ecliptic: equator tilted by obliquity around X axis (approx in our coords)
    const eclPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), OBLIQUITY);
      eclPts.push(v.multiplyScalar(R * 0.92));
    }
    skyGridGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(eclPts),
      new THREE.LineBasicMaterial({ color: 0xd9b36a, transparent: true, opacity: 0.16 })
    ));
    scene.add(skyGridGroup);
  }

  return { constellationGroup, brightStarsGroup, skyGridGroup, constLabels, brightStarLabels };
}

/* Constellation labels track the sky dome, not the planets. */
export function updateConstellationLabels(camera) {
  if (!view.constellations) {
    for (const L of constLabels) L.el.style.display = 'none';
    hideConstTooltip();
    return;
  }
  for (const L of constLabels) {
    _proj.copy(L.pos).project(camera);
    if (_proj.z > 1 || _proj.z < -1) { L.el.style.display = 'none'; continue; }
    const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -40 || x > window.innerWidth + 40 || y < -20 || y > window.innerHeight + 20) {
      L.el.style.display = 'none'; continue;
    }
    L.el.style.display = 'block';
    L.el.style.left = x + 'px';
    L.el.style.top = y + 'px';
  }
}

export function updateBrightStarLabels(camera) {
  if (!view.brightStars) { for (const L of brightStarLabels) L.el.style.display = 'none'; return; }
  for (const L of brightStarLabels) {
    _proj.copy(L.pos).project(camera);
    if (_proj.z > 1 || _proj.z < -1) { L.el.style.display = 'none'; continue; }
    const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -40 || x > window.innerWidth + 40 || y < -20 || y > window.innerHeight + 20) { L.el.style.display = 'none'; continue; }
    L.el.style.display = 'block'; L.el.style.left = x + 'px'; L.el.style.top = y + 'px';
  }
}
