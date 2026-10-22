/* =====================================================================
 *  experiments-grade9.js
 *  Phòng thí nghiệm ảo 3D - Vật lý lớp 9 (Three.js r128)
 *    9-1 : Hiện tượng khúc xạ ánh sáng
 *    9-2 : Đo tiêu cự thấu kính hội tụ
 *    9-3 : Định luật Ohm và mạch điện (có Khóa K đóng/mở)
 *  API công khai:
 *    window.renderGrade9(expId, expGroup, expState)
 *    window.updateGrade9(expId, expState, p1, p2, p3)
 *    window.animateGrade9(expId, expState, dt, p1, p2, p3)
 *    window.toggleSwitch9_3()
 *    createText3D / updateText3D / createGlyph3D (chỉ gán vào window nếu chưa tồn tại)
 * ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
   *  TIỆN ÍCH CHUNG
   * =================================================================== */
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function num(v, fb) { v = parseFloat(v); return isFinite(v) ? v : fb; }
  function fmt(v, d) {
    const lim = 0.5 * Math.pow(10, -d);
    return (Math.abs(v) < lim ? 0 : v).toFixed(d);
  }
  function readParam(id, fb) {
    try {
      const el = document.getElementById(id);
      if (!el) return fb;
      return num(el.value, fb);
    } catch (e) { return fb; }
  }

  function stdMat(color, metal, rough, extra) {
    return new THREE.MeshStandardMaterial(Object.assign(
      { color: color, metalness: metal, roughness: rough }, extra || {}));
  }
  function glassMat(color, opacity, extra) {
    return new THREE.MeshPhysicalMaterial(Object.assign({
      color: color, metalness: 0.0, roughness: 0.05, transparent: true,
      opacity: opacity, clearcoat: 1.0, clearcoatRoughness: 0.05,
      side: THREE.DoubleSide, depthWrite: false
    }, extra || {}));
  }
  function mk(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function box(w, h, d, mat, x, y, z) { return mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  function cyl(rt, rb, h, seg, mat, x, y, z) {
    return mk(new THREE.CylinderGeometry(rt, rb, h, seg || 32), mat, x, y, z);
  }
  function sph(r, mat, x, y, z) { return mk(new THREE.SphereGeometry(r, 24, 18), mat, x, y, z); }
  function addLights(group) {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4658, 0.45);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(6, 14, 10);
    group.add(hemi);
    group.add(dir);
    return [hemi, dir];
  }

  /* ===================================================================
   *  CHỮ 3D (CanvasTexture 896 x 128, viền bo góc phát sáng)
   * =================================================================== */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function setupTexture(tex) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
  }

  function paintText3D(mesh) {
    const d = mesh.userData.t3d;
    const cv = d.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, col = d.color;
    ctx.clearRect(0, 0, W, H);

    // nền bảng LED
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(10,22,42,0.95)');
    bg.addColorStop(1, 'rgba(3,8,18,0.95)');
    roundRectPath(ctx, 10, 10, W - 20, H - 20, 30);
    ctx.fillStyle = bg;
    ctx.fill();

    // viền phát sáng (glow)
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 6;
    ctx.strokeStyle = col;
    roundRectPath(ctx, 10, 10, W - 20, H - 20, 30);
    ctx.stroke();
    ctx.stroke();
    ctx.restore();

    // đường viền mảnh sắc nét bên trong
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    roundRectPath(ctx, 15, 15, W - 30, H - 30, 26);
    ctx.stroke();

    // chữ: tự co cỡ để vừa khung
    let size = 66;
    const family = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.font = 'bold ' + size + 'px ' + family;
    while (size > 18 && ctx.measureText(d.text).width > W - 90) {
      size -= 2;
      ctx.font = 'bold ' + size + 'px ' + family;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = col;
    ctx.fillText(d.text, W / 2, H / 2 + 3);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(d.text, W / 2, H / 2 + 3);

    d.texture.needsUpdate = true;
  }

  /** Tạo bảng chữ 3D. width = bề rộng theo đơn vị cảnh, chiều cao = width * 128/896 */
  function createText3D(text, color, width, opts) {
    color = color || '#00e5ff';
    width = width || 5;
    const canvas = document.createElement('canvas');
    canvas.width = 896;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    setupTexture(texture);
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 128 / 896), material);
    mesh.renderOrder = 20;
    mesh.userData.t3d = { canvas: canvas, texture: texture, text: String(text), color: color, opts: opts || {} };
    paintText3D(mesh);
    return mesh;
  }

  /** Cập nhật nội dung / màu của bảng chữ 3D (chỉ vẽ lại khi có thay đổi) */
  function updateText3D(mesh, text, color) {
    if (!mesh || !mesh.userData || !mesh.userData.t3d) return;
    const d = mesh.userData.t3d;
    text = String(text);
    if (color === undefined || color === null) color = d.color;
    if (d.text === text && d.color === color) return;
    d.text = text;
    d.color = color;
    paintText3D(mesh);
  }

  /* --- nhãn nhỏ (ký hiệu, số trên thang chia): canvas vuông 256x256, nền trong suốt --- */
  function paintGlyph(mesh) {
    const d = mesh.userData.glyph;
    const ctx = d.canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    let size = 190;
    const family = '"Segoe UI", Arial, sans-serif';
    ctx.font = 'bold ' + size + 'px ' + family;
    while (size > 24 && ctx.measureText(d.text).width > 236) {
      size -= 6;
      ctx.font = 'bold ' + size + 'px ' + family;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, 128, 134);
    d.texture.needsUpdate = true;
  }
  function createGlyph3D(text, color, size) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    setupTexture(texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
    );
    mesh.renderOrder = 15;
    mesh.userData.glyph = { canvas: canvas, texture: texture, text: String(text), color: color || '#111111' };
    paintGlyph(mesh);
    return mesh;
  }
  function updateGlyph3D(mesh, text, color) {
    const d = mesh.userData.glyph;
    text = String(text);
    if (color === undefined) color = d.color;
    if (d.text === text && d.color === color) return;
    d.text = text;
    d.color = color;
    paintGlyph(mesh);
  }

  /* --- đường xoắn (lò xo, dây tóc) --- */
  class HelixY extends THREE.Curve {
    constructor(turns, radius) { super(); this.turns = turns; this.radius = radius; }
    getPoint(t, target) {
      target = target || new THREE.Vector3();
      const a = t * this.turns * PI * 2;
      return target.set(Math.cos(a) * this.radius, -t, Math.sin(a) * this.radius);
    }
  }
  class HelixX extends THREE.Curve {
    constructor(turns, radius, length) { super(); this.turns = turns; this.radius = radius; this.length = length; }
    getPoint(t, target) {
      target = target || new THREE.Vector3();
      const a = t * this.turns * PI * 2;
      return target.set((t - 0.5) * this.length, Math.cos(a) * this.radius, Math.sin(a) * this.radius);
    }
  }

  /* ===================================================================
   *  TIA SÁNG DÙNG CHUNG (lõi sáng + quầng sáng cộng màu) & NÉT ĐỨT
   * =================================================================== */
  function makeRay(colorHex) {
    const g = new THREE.Group();
    g.core = cyl(1, 1, 1, 10, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false, depthWrite: false }), 0, 0, 0);
    g.glow = cyl(1, 1, 1, 12, new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }), 0, 0, 0);
    g.add(g.glow);
    g.add(g.core);
    g.visible = false;
    return g;
  }
  function setRay(g, ax, ay, bx, by, w, op, z) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4 || op <= 0.001) { g.visible = false; return; }
    g.visible = true;
    g.position.set((ax + bx) / 2, (ay + by) / 2, z || 0);
    g.rotation.z = Math.atan2(dy, dx) - PI / 2;
    g.core.scale.set(w * 0.35, len, w * 0.35);
    g.glow.scale.set(w, len, w);
    g.core.material.opacity = clamp(op, 0, 1);
    g.glow.material.opacity = clamp(op * 0.55, 0, 1);
  }
  function makeDashed(colorHex, count) {
    const g = new THREE.Group();
    g.dashes = [];
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.visible = false;
      g.add(m);
      g.dashes.push(m);
    }
    g.mat = mat;
    return g;
  }
  function setDashed(g, ax, ay, bx, by, op, z) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    const cnt = g.dashes.length;
    if (len < 0.05 || op <= 0.001) {
      for (let i = 0; i < cnt; i++) g.dashes[i].visible = false;
      return;
    }
    g.mat.opacity = op;
    const step = Math.max(0.28, len / cnt);
    const n = Math.min(cnt, Math.floor(len / step));
    const ux = dx / len, uy = dy / len, ang = Math.atan2(dy, dx);
    for (let i = 0; i < cnt; i++) {
      const m = g.dashes[i];
      if (i < n) {
        const s = i * step + step * 0.3;
        m.visible = true;
        m.position.set(ax + ux * s, ay + uy * s, z || 0);
        m.rotation.z = ang;
        m.scale.set(step * 0.45, 0.035, 0.035);
      } else m.visible = false;
    }
  }

  /* ===================================================================
   *  BÀI 9-1 : KHÚC XẠ ÁNH SÁNG (nội bộ: REFR)
   * =================================================================== */
  const RF = { PR: 4.25, RL: 4.75, MR: 3.9 };

  function mediumStyle(n) {
    const stops = [[1.0, 0xffffff], [1.33, 0x5fb4ff], [1.5, 0x4ff0cf], [2.42, 0xb66dff], [2.5, 0xc77dff]];
    const c = new THREE.Color(0xffffff);
    for (let i = 0; i < stops.length - 1; i++) {
      if (n <= stops[i + 1][0] || i === stops.length - 2) {
        const f = clamp((n - stops[i][0]) / (stops[i + 1][0] - stops[i][0]), 0, 1);
        c.setHex(stops[i][1]).lerp(new THREE.Color(stops[i + 1][1]), f);
        break;
      }
    }
    let name;
    if (n < 1.15) name = 'Không khí';
    else if (n < 1.42) name = 'Nước';
    else if (n < 1.62) name = 'Thủy tinh';
    else if (n < 2.1) name = 'Thủy tinh nặng';
    else name = 'Kim cương';
    const opacity = lerp(0.05, 0.42, clamp((n - 1) / 0.5, 0, 1)) + (n > 2 ? 0.08 : 0);
    return { color: c, name: name, opacity: opacity };
  }

  function buildRefr(group, st) {
    const g = { id: 'REFR', t: 0 };
    st.g9 = g;
    g.lights = addLights(group);
    const steel = stdMat(0xc9d1da, 0.7, 0.28);
    const darkSteel = stdMat(0x39424f, 0.75, 0.35);

    // ----- thước đo độ tròn 360° (nền tối, vạch sáng) -----
    group.add(mk(new THREE.CircleGeometry(RF.PR, 96), stdMat(0x0d1b2a, 0.1, 0.8), 0, 0, -0.3));
    const border = mk(new THREE.TorusGeometry(RF.PR, 0.07, 12, 96), steel, 0, 0, -0.3);
    group.add(border);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 1, 0.01),
      new THREE.MeshBasicMaterial({ color: 0xcfe8ff }), 360);
    const dm = new THREE.Object3D();
    for (let th = 0; th < 360; th++) {
      const a = th * PI / 180;
      const len = th % 10 === 0 ? 0.32 : (th % 5 === 0 ? 0.22 : 0.12);
      const rc = 4.15 - len / 2;
      dm.position.set(Math.sin(a) * rc, Math.cos(a) * rc, -0.27);
      dm.rotation.z = -a;
      dm.scale.set(1, len, 1);
      dm.updateMatrix();
      ticks.setMatrixAt(th, dm.matrix);
    }
    ticks.instanceMatrix.needsUpdate = true;
    group.add(ticks);
    // số đo 0°-90° ở cả 4 góc phần tư
    for (let th = 0; th < 360; th += 10) {
      let a;
      if (th <= 90) a = th; else if (th <= 180) a = 180 - th; else if (th <= 270) a = th - 180; else a = 360 - th;
      const rad = th * PI / 180;
      const lb = createGlyph3D(String(a), '#cfe8ff', 0.4);
      lb.position.set(Math.sin(rad) * 3.5, Math.cos(rad) * 3.5, -0.26);
      group.add(lb);
    }
    // chân đế
    group.add(box(2.6, 0.3, 1.2, darkSteel, 0, -4.65, -0.3));
    group.add(cyl(0.18, 0.18, 0.5, 20, steel, 0, -4.3, -0.3));

    // ----- môi trường 2: khối bán nguyệt (nửa dưới) -----
    g.medMat = new THREE.MeshPhysicalMaterial({
      color: 0x5fb4ff, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.0,
      clearcoat: 1, clearcoatRoughness: 0.05, reflectivity: 0.5, side: THREE.DoubleSide,
      depthWrite: false, emissive: 0x000000
    });
    g.medium = mk(new THREE.CylinderGeometry(RF.MR, RF.MR, 0.5, 96, 1, false, -PI / 2, PI), g.medMat, 0, 0, 0);
    g.medium.rotation.x = PI / 2;
    group.add(g.medium);
    const medTop = mk(new THREE.PlaneGeometry(RF.MR * 2, 0.5), g.medMat, 0, 0, 0);
    medTop.rotation.x = PI / 2;
    group.add(medTop);
    // lấp lánh kim cương
    g.sparkles = [];
    for (let i = 0; i < 9; i++) {
      const sp = sph(0.07, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
      }), 0, 0, 0.1);
      const ang = -PI + (i + 0.5) / 9 * PI;
      const rr = 1.0 + (i * 0.37) % 2.4;
      sp.position.set(Math.cos(ang) * rr, Math.sin(ang) * rr, 0.15);
      sp.userData.phase = i * 1.7;
      group.add(sp);
      g.sparkles.push(sp);
    }

    // ----- mặt phân cách P-Q, pháp tuyến N-N' (nét đứt) -----
    group.add(box(8.8, 0.045, 0.06, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0, 0.27));
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
    for (let i = 0; i < 40; i++) {
      const y = -4.2 + i * 0.21 + 0.08;
      group.add(box(0.035, 0.12, 0.03, dashMat, 0, y, 0.27));
    }
    const mkLab = function (t, col, x, y) {
      const l = createGlyph3D(t, col, 0.5);
      l.position.set(x, y, 0.3);
      group.add(l);
      return l;
    };
    mkLab('P', '#ffffff', -4.65, 0.3);
    mkLab('Q', '#ffffff', 4.65, 0.3);
    mkLab('N', '#ffd54f', 0.35, 4.55);
    mkLab("N'", '#ffd54f', 0.35, -4.55);
    mkLab('I', '#ffffff', 0.28, 0.3);

    // ----- tia sáng -----
    g.rayI = makeRay(0xff3b30);
    g.rayR = makeRay(0xff3b30);
    g.rayF = makeRay(0xff8a80);
    group.add(g.rayI);
    group.add(g.rayR);
    group.add(g.rayF);
    g.arcI = mk(new THREE.RingGeometry(1.3, 1.36, 8, 1, 0, 0.1), new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide }), 0, 0, 0.28);
    g.arcR = mk(new THREE.RingGeometry(1.3, 1.36, 8, 1, 0, 0.1), new THREE.MeshBasicMaterial({ color: 0x69f0ae, side: THREE.DoubleSide }), 0, 0, 0.28);
    group.add(g.arcI);
    group.add(g.arcR);
    g.lbI = createGlyph3D('i', '#ffeb3b', 0.5);
    g.lbR = createGlyph3D('r', '#69f0ae', 0.5);
    g.lbS = createGlyph3D('S', '#ff8a80', 0.5);
    g.lbRr = createGlyph3D('R', '#69f0ae', 0.5);
    g.lbRf = createGlyph3D("R'", '#ff8a80', 0.5);
    [g.lbI, g.lbR, g.lbS, g.lbRr, g.lbRf].forEach(function (l) { l.position.z = 0.3; group.add(l); });

    // ----- ray trượt dọc cung tròn + đèn Laser kim loại -----
    const rail = mk(new THREE.TorusGeometry(RF.RL, 0.06, 10, 160, PI), steel, 0, 0, -0.05);
    group.add(rail);
    g.laser = new THREE.Group();
    g.laser.add(box(0.8, 0.3, 0.55, darkSteel, 0, RF.RL, 0));
    g.laser.add(cyl(0.24, 0.24, 1.3, 32, stdMat(0x8f9aa8, 0.85, 0.25), 0, RF.RL + 0.8, 0));
    g.laser.add(cyl(0.27, 0.27, 0.12, 32, stdMat(0x2a2f38, 0.8, 0.3), 0, RF.RL + 1.2, 0));
    g.laser.add(cyl(0.27, 0.27, 0.12, 32, stdMat(0x2a2f38, 0.8, 0.3), 0, RF.RL + 0.4, 0));
    g.nozzleMat = stdMat(0xff3b30, 0.2, 0.3, { emissive: 0xff1a10, emissiveIntensity: 2.5 });
    g.laser.add(cyl(0.16, 0.2, 0.1, 24, g.nozzleMat, 0, RF.RL + 0.05, 0));
    group.add(g.laser);
    g.laserLight = new THREE.PointLight(0xff3b30, 1, 9, 2);
    g.laserLight.position.set(0, 0.4, 1.6);
    group.add(g.laserLight);

    // ----- bảng LED 3D (bên phải thước đo độ) -----
    group.add(box(7.6, 3.9, 0.12, stdMat(0x121820, 0.5, 0.5), 9.3, 0, -0.12));
    const cols = ['#00e5ff', '#ffd54f', '#69f0ae'];
    const ys = [1.2, 0, -1.2];
    g.leds = [];
    for (let i = 0; i < 3; i++) {
      const m = createText3D('...', cols[i], 7.2);
      m.position.set(9.3, ys[i], 0.03);
      group.add(m);
      g.leds.push(m);
    }
    g.title = createText3D('HIỆN TƯỢNG KHÚC XẠ ÁNH SÁNG', '#ffffff', 7.2);
    g.title.position.set(9.3, 2.8, 0.03);
    group.add(g.title);
    g.n = 1.33;
    return g;
  }

  function setArc(mesh, startA, len) {
    if (len < 0.01) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(1.3, 1.36, 40, 1, startA, len);
  }

  function updateRefr(st, iDeg, n2, p3) {
    const g = st.g9;
    if (!g || g.id !== 'REFR') return;
    iDeg = clamp(num(iDeg, 45), 0, 85);
    n2 = clamp(num(n2, 1.33), 1.0, 2.5);
    p3 = clamp(num(p3, 80), 10, 100);
    const i = iDeg * PI / 180;
    const sinR = Math.sin(i) / n2;                       // Snell: sin(r) = sin(i) / n2
    const r = Math.asin(clamp(sinR, -1, 1));
    const rDeg = r * 180 / PI;
    const b = p3 / 100;

    // phản xạ một phần (Fresnel, ánh sáng không phân cực)
    const ci = Math.cos(i), cr = Math.cos(r);
    const Rs = Math.pow((ci - n2 * cr) / (ci + n2 * cr), 2);
    const Rp = Math.pow((cr - n2 * ci) / (cr + n2 * ci), 2);
    const Rf = (Rs + Rp) / 2;

    // màu môi trường 2 theo chiết suất
    const ms = mediumStyle(n2);
    g.n = n2;
    g.medMat.color.copy(ms.color);
    g.medMat.opacity = ms.opacity;
    g.medMat.reflectivity = clamp((n2 - 1) / 1.5, 0, 1);
    g.medMat.emissive.copy(ms.color);
    g.medMat.emissiveIntensity = n2 > 2 ? 0.18 : 0.04;

    // đèn laser trượt trên cung tròn theo góc tới
    g.laser.rotation.z = i;
    g.nozzleMat.emissiveIntensity = 0.5 + b * 3;
    g.laserLight.intensity = b * 1.6;
    const Sx = -RF.RL * Math.sin(i), Sy = RF.RL * Math.cos(i);

    const wI = 0.05 + 0.08 * b;
    setRay(g.rayI, Sx, Sy, 0, 0, wI, 0.35 + 0.65 * b, 0);
    setRay(g.rayR, 0, 0, Math.sin(r) * RF.MR, -Math.cos(r) * RF.MR, wI, (0.25 + 0.75 * b) * (1 - Rf * 0.8), 0);
    const reflOp = b * clamp(Rf * 2.2, 0, 0.75);
    setRay(g.rayF, 0, 0, Math.sin(i) * RF.MR, Math.cos(i) * RF.MR, wI * 0.8, reflOp, 0);

    // cung góc i, r và nhãn
    setArc(g.arcI, PI / 2, i);
    setArc(g.arcR, -PI / 2, r);
    const ai = PI / 2 + i / 2, ar = -PI / 2 + r / 2;
    g.lbI.visible = i > 0.06;
    g.lbR.visible = r > 0.06;
    g.lbI.position.x = Math.cos(ai) * 1.8; g.lbI.position.y = Math.sin(ai) * 1.8;
    g.lbR.position.x = Math.cos(ar) * 1.8; g.lbR.position.y = Math.sin(ar) * 1.8;
    g.lbS.position.x = -(RF.RL + 1.7) * Math.sin(i) - 0.45;
    g.lbS.position.y = (RF.RL + 1.7) * Math.cos(i);
    g.lbRr.position.x = Math.sin(r) * (RF.MR + 0.35) + 0.2;
    g.lbRr.position.y = -Math.cos(r) * (RF.MR + 0.35);
    g.lbRf.position.x = Math.sin(i) * (RF.MR + 0.35) + 0.2;
    g.lbRf.position.y = Math.cos(i) * (RF.MR + 0.35);
    g.lbRf.visible = reflOp > 0.02;

    // bảng LED
    const ratio = Math.sin(r) > 1e-9 ? Math.sin(i) / Math.sin(r) : n2;
    updateText3D(g.leds[0], 'Góc tới i = ' + fmt(iDeg, 1) + '° | Góc khúc xạ r = ' + fmt(rDeg, 1) + '°');
    updateText3D(g.leds[1], 'Môi trường 1: Không khí (n1 = 1.00) → Môi trường 2: ' + ms.name + ' (n2 = ' + fmt(n2, 2) + ')');
    updateText3D(g.leds[2], 'Định luật khúc xạ: sin(i) / sin(r) = ' + fmt(ratio, 2) + ' = n2/n1');
    g.last = { i: iDeg, r: rDeg, n2: n2, ratio: ratio, R: Rf, medium: ms.name };
  }

  function animateRefr(st, dt) {
    const g = st.g9;
    if (!g || g.id !== 'REFR' || !g.last) return;
    g.t += dt;
    const t = g.t;
    // kim cương lấp lánh khi n >= 2
    const dia = g.n >= 2.0;
    for (let i = 0; i < g.sparkles.length; i++) {
      const sp = g.sparkles[i];
      sp.material.opacity = dia ? clamp(0.5 + 0.5 * Math.sin(t * 6 + sp.userData.phase), 0, 1) * 0.9 : 0;
    }
    g.medMat.emissiveIntensity = (g.n > 2 ? 0.18 + 0.1 * Math.sin(t * 4) : 0.04);
  }

  /* ===================================================================
   *  BÀI 9-2 : THẤU KÍNH HỘI TỤ (nội bộ: LENS)
   * =================================================================== */
  const LN = { SC: 0.1, A: 2.0, TOP: -2.9, XMAX: 10.8 };

  function lensGeometry(T) {
    const edge = 0.05, N = 24, A = LN.A, pts = [];
    for (let j = 0; j <= N; j++) {
      const rr = A * j / N;
      const h = edge / 2 + (T / 2 - edge / 2) * (1 - (rr / A) * (rr / A));
      pts.push(new THREE.Vector2(rr, -h));
    }
    pts.push(new THREE.Vector2(A, edge / 2));
    for (let j = N; j >= 0; j--) {
      const rr = A * j / N;
      const h = edge / 2 + (T / 2 - edge / 2) * (1 - (rr / A) * (rr / A));
      pts.push(new THREE.Vector2(rr, h));
    }
    return new THREE.LatheGeometry(pts, 48);
  }

  function makeArrow3D(colorHex, emissiveHex, opacity) {
    const g = new THREE.Group();
    const mat = stdMat(colorHex, 0.2, 0.4, { emissive: emissiveHex, emissiveIntensity: 0.7, transparent: opacity < 1, opacity: opacity });
    g.shaft = cyl(0.05, 0.05, 1, 12, mat, 0, 0, 0);
    g.head = cyl(0.0, 0.14, 0.3, 16, mat, 0, 0, 0);
    g.add(g.shaft);
    g.add(g.head);
    g.add(cyl(0.12, 0.12, 0.04, 16, mat, 0, 0, 0));
    return g;
  }
  function setArrow3D(g, h) {
    const len = Math.max(Math.abs(h), 0.02);
    const sgn = h >= 0 ? 1 : -1;
    const head = Math.min(0.3, len * 0.5);
    g.head.scale.y = head / 0.3;
    g.shaft.scale.y = Math.max(len - head, 0.001);
    g.shaft.position.y = sgn * (len - head) / 2;
    g.head.position.y = sgn * (len - head / 2);
    g.head.rotation.z = sgn > 0 ? 0 : PI;
  }

  function buildLens(group, st) {
    const g = { id: 'LENS', t: 0 };
    st.g9 = g;
    g.lights = addLights(group);
    const steel = stdMat(0xc9d1da, 0.7, 0.28);
    const darkSteel = stdMat(0x39424f, 0.75, 0.35);

    // ----- băng quang học + thước cm -----
    group.add(box(22.8, 0.5, 0.9, stdMat(0xcfd6dd, 0.6, 0.35), 0, -3.15, 0));
    group.add(box(0.3, 0.4, 1.1, darkSteel, -11.2, -3.15, 0));
    group.add(box(0.3, 0.4, 1.1, darkSteel, 11.2, -3.15, 0));
    group.add(box(1.0, 0.35, 1.3, darkSteel, -9.6, -3.6, 0));
    group.add(box(1.0, 0.35, 1.3, darkSteel, 9.6, -3.6, 0));
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 1, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x10151c }), 221);
    const dm = new THREE.Object3D();
    for (let c = -110; c <= 110; c++) {
      const a = Math.abs(c);
      const len = a % 10 === 0 ? 0.22 : (a % 5 === 0 ? 0.16 : 0.1);
      dm.position.set(c * LN.SC, LN.TOP - len / 2, 0.452);
      dm.scale.set(1, len, 1);
      dm.updateMatrix();
      ticks.setMatrixAt(c + 110, dm.matrix);
    }
    ticks.instanceMatrix.needsUpdate = true;
    group.add(ticks);
    for (let c = 10; c <= 100; c += 10) {
      const l1 = createGlyph3D(String(c), '#0b1220', 0.26);
      l1.position.set(-c * LN.SC, -3.22, 0.456);
      group.add(l1);
      const l2 = createGlyph3D(String(c), '#0b1220', 0.26);
      l2.position.set(c * LN.SC, -3.22, 0.456);
      group.add(l2);
    }
    const cm = createGlyph3D('cm', '#0b1220', 0.3);
    cm.position.set(0, -3.22, 0.456);
    group.add(cm);

    // trục chính
    group.add(box(22.4, 0.014, 0.014, new THREE.MeshBasicMaterial({ color: 0x9fb3c8 }), 0, 0, 0));

    // ----- thấu kính hội tụ rìa mỏng (độ phồng thay đổi theo f) -----
    g.lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xa8ecff, transparent: true, opacity: 0.3, roughness: 0.03, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.6, side: THREE.DoubleSide,
      depthWrite: false, emissive: 0x1a6b8a, emissiveIntensity: 0.15
    });
    g.lens = mk(lensGeometry(0.5), g.lensMat, 0, 0, 0);
    g.lens.rotation.z = -PI / 2;
    group.add(g.lens);
    const rim = mk(new THREE.TorusGeometry(LN.A + 0.04, 0.07, 12, 64), steel, 0, 0, 0);
    rim.rotation.y = PI / 2;
    group.add(rim);
    group.add(box(0.28, 0.9, 0.28, darkSteel, 0, LN.TOP + 0.45, 0));
    group.add(box(1.0, 0.18, 0.7, darkSteel, 0, LN.TOP + 0.09, 0));
    g.lblO = createGlyph3D('O', '#ffffff', 0.5);
    g.lblO.position.set(0.3, -0.35, 0.05);
    group.add(g.lblO);

    // ----- tiêu điểm F, F', 2F, 2F' -----
    g.marks = [];
    const defs = [['F', -1, '#00e5ff', 0x00e5ff], ["F'", 1, '#00e5ff', 0x00e5ff], ['2F', -2, '#ff80ab', 0xff4081], ["2F'", 2, '#ff80ab', 0xff4081]];
    defs.forEach(function (d) {
      const s = sph(0.1, stdMat(d[3], 0.3, 0.4, { emissive: d[3], emissiveIntensity: 0.9 }), 0, 0, 0);
      const tk = box(0.025, 0.5, 0.025, new THREE.MeshBasicMaterial({ color: d[3] }), 0, 0, 0);
      const lb = createGlyph3D(d[0], d[2], 0.5);
      group.add(s); group.add(tk); group.add(lb);
      g.marks.push({ sph: s, tick: tk, lab: lb, k: d[1] });
    });

    // ----- vật sáng AB (mũi tên phát sáng xanh lá) -----
    g.obj = makeArrow3D(0x39ff14, 0x16c60c, 1);
    group.add(g.obj);
    g.objStand = cyl(0.05, 0.05, 1, 12, darkSteel, 0, 0, 0);
    group.add(g.objStand);
    g.objBase = box(0.6, 0.18, 0.7, darkSteel, 0, LN.TOP + 0.09, 0);
    group.add(g.objBase);
    g.lblA = createGlyph3D('A', '#39ff14', 0.45);
    g.lblB = createGlyph3D('B', '#39ff14', 0.45);
    group.add(g.lblA); group.add(g.lblB);

    // ----- ảnh thật / ảnh ảo + màn hứng -----
    g.imgReal = makeArrow3D(0xff6d00, 0xff3d00, 1);
    g.imgVirt = makeArrow3D(0xffb74d, 0xff9100, 0.45);
    group.add(g.imgReal);
    group.add(g.imgVirt);
    g.lblA2 = createGlyph3D("A'", '#ff9100', 0.45);
    g.lblB2 = createGlyph3D("B'", '#ff9100', 0.45);
    group.add(g.lblA2); group.add(g.lblB2);
    g.screen = new THREE.Group();
    g.screen.add(box(0.08, 4.0, 2.2, stdMat(0xf5f7fa, 0.0, 0.7, { emissive: 0x3a3f46 }), 0, 0, 0));
    g.screen.add(box(0.14, 0.9, 0.14, darkSteel, 0, LN.TOP + 0.45, 0));
    g.screen.add(box(0.7, 0.18, 0.7, darkSteel, 0, LN.TOP + 0.09, 0));
    g.screen.visible = false;
    group.add(g.screen);

    // ----- 3 tia đặc trưng từ B -----
    g.in1 = makeRay(0xffd600); g.out1 = makeRay(0xffd600);
    g.in2 = makeRay(0xff3d3d); g.out2 = makeRay(0xff3d3d);
    g.in3 = makeRay(0xff9100); g.out3 = makeRay(0xff9100);
    [g.in1, g.out1, g.in2, g.out2, g.in3, g.out3].forEach(function (r) { group.add(r); });
    g.ext1 = makeDashed(0xffd600, 40); g.ext2 = makeDashed(0xff3d3d, 40); g.ext3 = makeDashed(0xff9100, 40);
    group.add(g.ext1); group.add(g.ext2); group.add(g.ext3);

    // ----- bảng LED -----
    group.add(box(8.8, 4.1, 0.12, stdMat(0x121820, 0.5, 0.5), 0, 5.5, -0.12));
    const cols = ['#00e5ff', '#ffb74d', '#69f0ae'];
    const ys = [6.8, 5.5, 4.2];
    g.leds = [];
    for (let i = 0; i < 3; i++) {
      const m = createText3D('...', cols[i], 8.4);
      m.position.set(0, ys[i], 0.03);
      group.add(m);
      g.leds.push(m);
    }
    g.title = createText3D('ĐO TIÊU CỰ THẤU KÍNH HỘI TỤ', '#ffffff', 5.4);
    g.title.position.set(0, 7.85, 0.03);
    group.add(g.title);
    return g;
  }

  function updateLens(st, d, f, h) {
    const g = st.g9;
    if (!g || g.id !== 'LENS') return;
    d = clamp(num(d, 30), 10, 100);
    f = clamp(num(f, 15), 5, 30);
    h = clamp(num(h, 3), 1, 10);
    const du = d * LN.SC, fu = f * LN.SC, hu = h * LN.SC;

    // độ phồng thấu kính theo f (f nhỏ -> dày, phồng hơn)
    const T = lerp(0.95, 0.2, (f - 5) / 25);
    g.lens.geometry.dispose();
    g.lens.geometry = lensGeometry(T);

    // các điểm đánh dấu F, F', 2F, 2F'
    for (let i = 0; i < g.marks.length; i++) {
      const m = g.marks[i];
      const x = m.k * fu;
      m.sph.position.set(x, 0, 0);
      m.tick.position.set(x, 0, 0);
      m.lab.position.set(x, -0.62, 0.05);
    }

    // vật AB
    g.obj.position.set(-du, 0, 0);
    setArrow3D(g.obj, hu);
    g.objStand.scale.y = -LN.TOP;
    g.objStand.position.set(-du, LN.TOP / 2, 0);
    g.objBase.position.x = -du;
    g.lblA.position.set(-du - 0.3, -0.35, 0.05);
    g.lblB.position.set(-du - 0.3, hu + 0.35, 0.05);

    const near = Math.abs(d - f) < 0.5;
    let dp = 0, k = 0, hp = 0, yI = 0, dpu = 0;
    let type;
    if (!near) {
      dp = d * f / (d - f);          // 1/f = 1/d + 1/d'
      k = -dp / d;
      hp = Math.abs(k) * h;
      dpu = dp * LN.SC;
      yI = k * hu;                   // toạ độ y của ảnh (đơn vị cảnh)
    }
    const XE = LN.XMAX;
    const real = !near && d > f;

    // --- tia 1: song song trục chính -> qua F' ---
    setRay(g.in1, -du, hu, 0, hu, 0.045, 0.95, 0);
    // --- tia 2: qua quang tâm O, truyền thẳng ---
    setRay(g.in2, -du, hu, 0, 0, 0.045, 0.95, 0);
    let endX = XE;
    if (real && dpu < XE) endX = dpu;
    setRay(g.out1, 0, hu, endX, hu * (1 - endX / fu), 0.045, 0.95, 0);
    setRay(g.out2, 0, 0, endX, -hu * endX / du, 0.045, 0.95, 0);
    // --- tia 3: đi qua F -> ló song song trục chính ---
    let y3 = 0, ray3 = false;
    if (!near) {
      y3 = hu * fu / (fu - du);
      ray3 = Math.abs(y3) <= LN.A - 0.1;
    }
    if (ray3) {
      setRay(g.in3, -du, hu, 0, y3, 0.045, 0.95, 0);
      setRay(g.out3, 0, y3, endX, y3, 0.045, 0.95, 0);
    } else { g.in3.visible = false; g.out3.visible = false; }

    // --- đường kéo dài nét đứt cho ảnh ảo ---
    const virt = !near && d < f;
    const virtVisible = virt && dpu > -XE && Math.abs(yI) < 3.6;
    if (virt) {
      const ex = Math.max(dpu, -XE);
      const t = ex / dpu;           // thu gọn để không vượt khỏi băng quang học
      setDashed(g.ext1, 0, hu, ex, hu + (yI - hu) * t, 0.85, 0);
      setDashed(g.ext2, 0, 0, ex, yI * t, 0.85, 0);
      if (ray3) setDashed(g.ext3, 0, y3, ex, y3 + (yI - y3) * t, 0.85, 0);
      else setDashed(g.ext3, 0, 0, 0, 0, 0, 0);
    } else {
      setDashed(g.ext1, 0, 0, 0, 0, 0, 0);
      setDashed(g.ext2, 0, 0, 0, 0, 0, 0);
      setDashed(g.ext3, 0, 0, 0, 0, 0, 0);
    }

    // --- ảnh thật: màn hứng + mũi tên cam quay xuống ---
    const realVisible = real && dpu <= XE - 0.2 && Math.abs(yI) <= 3.6;
    g.screen.visible = realVisible;
    g.imgReal.visible = realVisible;
    g.lblA2.visible = realVisible || virtVisible;
    g.lblB2.visible = realVisible || virtVisible;
    if (realVisible) {
      g.screen.position.set(dpu + 0.06, 0, 0);
      g.imgReal.position.set(dpu - 0.03, 0, 0.12);
      setArrow3D(g.imgReal, yI);
      g.lblA2.position.set(dpu - 0.3, 0.35, 0.15);
      g.lblB2.position.set(dpu - 0.3, yI - 0.35, 0.15);
    }
    // --- ảnh ảo: mũi tên bán trong suốt cùng chiều, lớn hơn vật ---
    g.imgVirt.visible = virtVisible;
    if (virtVisible) {
      g.imgVirt.position.set(dpu, 0, 0);
      setArrow3D(g.imgVirt, yI);
      g.lblA2.position.set(dpu - 0.3, -0.35, 0.05);
      g.lblB2.position.set(dpu - 0.3, yI + 0.35, 0.05);
    }

    // --- bảng LED ---
    updateText3D(g.leds[0], 'Vật cách TK: d = ' + fmt(d, 0) + ' cm | Tiêu cự: f = ' + fmt(f, 0) + ' cm');
    if (near) {
      updateText3D(g.leds[1], "Vị trí ảnh: d' = ∞ | Chiều cao ảnh: h' = ∞ (k = ∞)");
      updateText3D(g.leds[2], 'Tính chất ảnh: Ảnh ở vô cực (chùm tia ló song song)');
      type = 'Ảnh ở vô cực';
    } else {
      updateText3D(g.leds[1], "Vị trí ảnh: d' = " + fmt(dp, 1) + ' cm | Chiều cao ảnh: h\' = ' + fmt(hp, 1) + ' cm (k = ' + fmt(k, 2) + 'x)');
      const ak = Math.abs(k);
      const size = ak > 1.02 ? 'lớn hơn vật' : (ak < 0.98 ? 'nhỏ hơn vật' : 'bằng vật');
      type = real ? ('Ảnh thật, ngược chiều, ' + size) : ('Ảnh ảo, cùng chiều, ' + size);
      let suffix = '';
      if (real && !realVisible) suffix = ' (ngoài băng)';
      if (virt && !virtVisible) suffix = ' (ngoài khung)';
      updateText3D(g.leds[2], 'Tính chất ảnh: ' + type + suffix);
    }
    g.last = { d: d, f: f, h: h, dp: dp, k: k, hp: hp, type: type, real: real, virt: virt, near: near };
  }

  function animateLens(st, dt) {
    const g = st.g9;
    if (!g || g.id !== 'LENS' || !g.last) return;
    g.t += dt;
    g.lensMat.emissiveIntensity = 0.15 + 0.05 * Math.sin(g.t * 2.2);
    const p = 0.7 + 0.3 * Math.sin(g.t * 3);
    g.obj.shaft.material.emissiveIntensity = 0.5 + 0.4 * p;
  }

  /* ===================================================================
   *  BÀI 9-3 : ĐỊNH LUẬT OHM VÀ MẠCH ĐIỆN (nội bộ: OHM)
   * =================================================================== */
  const C = {
    ZC: 0.15,           // mặt trước bảng mạch
    ZW: 0.45,           // độ cao của dây dẫn
    PATH: [[-5.8, 6.0], [-5.8, 8.2], [7.3, 8.2], [7.3, 3.7], [5.1, 3.7], [5.1, 1.6], [-5.8, 1.6], [-5.8, 3.2]],
    WIRES: [
      [[-5.8, 6.0], [-5.8, 8.2], [-4.4, 8.2]],
      [[-2.4, 8.2], [-1.25, 8.2]],
      [[1.25, 8.2], [7.3, 8.2], [7.3, 3.7]],
      [[5.1, 3.7], [5.1, 1.6], [4.4, 1.6]],
      [[0.2, 1.6], [-5.8, 1.6], [-5.8, 3.2]],
      [[-5.8, 7.0], [-3.75, 7.0], [-3.75, 5.4]],
      [[-1.25, 5.4], [-1.25, 1.6]]
    ],
    RH_X0: 0.5, RH_X1: 4.1,   // khoảng trượt của con chạy (R: 5 -> 100 Ω)
    RINGS: 26,
    N_PART: 100,
    AMM_RANGES: [0.6, 3, 15, 30],
    VOLT_MAX: 30
  };

  function wireSeg(group, a, b, sheathMat, coreMat) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    const ang = Math.atan2(dy, dx) - PI / 2;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const sh = cyl(0.11, 0.11, len, 14, sheathMat, mx, my, C.ZW);
    sh.rotation.z = ang;
    group.add(sh);
    const co = cyl(0.045, 0.045, len, 10, coreMat, mx, my, C.ZW);
    co.rotation.z = ang;
    group.add(co);
  }

  function makeMeter(letter, accentHex, maxText, cx, cy, group) {
    const m = new THREE.Group();
    m.position.set(cx, cy, C.ZC);
    const caseM = cyl(1.12, 1.12, 0.5, 48, stdMat(0x1b1f27, 0.5, 0.45), 0, 0, 0.25);
    caseM.rotation.x = PI / 2;
    m.add(caseM);
    const bez = mk(new THREE.TorusGeometry(1.04, 0.07, 14, 48), stdMat(accentHex, 0.7, 0.3), 0, 0, 0.5);
    m.add(bez);
    const face = mk(new THREE.CircleGeometry(1.0, 48), stdMat(0xf6f3e8, 0.0, 0.7, { emissive: 0x2a2a24 }), 0, 0, 0.505);
    m.add(face);
    const px = 0, py = -0.3;
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    for (let i = 0; i <= 20; i++) {
      const alpha = 1.05 - 2.1 * i / 20;
      const major = i % 5 === 0;
      const len = major ? 0.22 : 0.12;
      const r = 0.95 - len / 2;
      const t = box(0.022, len, 0.01, tickMat, px - Math.sin(alpha) * r, py + Math.cos(alpha) * r, 0.512);
      t.rotation.z = alpha;
      m.add(t);
    }
    const lb0 = createGlyph3D('0', '#111111', 0.26);
    lb0.position.set(px - Math.sin(1.05) * 0.5, py + Math.cos(1.05) * 0.5, 0.514);
    m.add(lb0);
    const lbMax = createGlyph3D(maxText, '#111111', 0.3);
    lbMax.position.set(px + Math.sin(1.05) * 0.5, py + Math.cos(1.05) * 0.5, 0.514);
    m.add(lbMax);
    const lbLetter = createGlyph3D(letter, '#' + accentHex.toString(16).padStart(6, '0'), 0.5);
    lbLetter.position.set(0, -0.66, 0.514);
    m.add(lbLetter);
    // kim chỉ thị
    const needle = new THREE.Group();
    needle.position.set(px, py, 0.53);
    const nMat = stdMat(0xd50000, 0.2, 0.4, { emissive: 0x6a0000 });
    needle.add(box(0.03, 0.85, 0.014, nMat, 0, 0.425, 0));
    needle.add(box(0.05, 0.2, 0.014, nMat, 0, -0.1, 0));
    const hub = cyl(0.075, 0.075, 0.04, 16, stdMat(0x222222, 0.6, 0.3), 0, 0, 0);
    hub.rotation.x = PI / 2;
    needle.add(hub);
    m.add(needle);
    // kính phủ mặt đồng hồ
    m.add(mk(new THREE.CircleGeometry(1.0, 48), glassMat(0xffffff, 0.1), 0, 0, 0.56));
    // hai đầu nối
    const brass = stdMat(0xc9a227, 0.85, 0.3);
    m.add(sph(0.15, stdMat(0xd32f2f, 0.4, 0.4), -1.25, 0, 0.3));
    m.add(sph(0.15, stdMat(0x222222, 0.4, 0.4), 1.25, 0, 0.3));
    const nutL = cyl(0.07, 0.07, 0.2, 10, brass, -1.17, 0, 0.3);
    nutL.rotation.z = PI / 2;
    m.add(nutL);
    const nutR = cyl(0.07, 0.07, 0.2, 10, brass, 1.17, 0, 0.3);
    nutR.rotation.z = PI / 2;
    m.add(nutR);
    group.add(m);
    return { group: m, needle: needle, maxLabel: lbMax, maxText: maxText, cur: 1.05, tgt: 1.05 };
  }

  function buildOhm(group, st) {
    const g = { id: 'OHM', t: 0, pOffset: 0, speed: 0.3, jitter: 0.02, bright: 0, brightTgt: 0 };
    st.g9 = g;
    g.lights = addLights(group);
    const ZC = C.ZC;

    // ----- bảng lắp mạch + chân đế -----
    group.add(box(16, 10, 0.3, stdMat(0x2b3a4d, 0.25, 0.7), 0, 5, 0));
    group.add(box(16.6, 0.4, 2.6, stdMat(0x1c232c, 0.3, 0.7), 0, -0.2, 0.6));
    const screwMat = stdMat(0xb0b8c2, 0.85, 0.3);
    [[-7.5, 0.5], [7.5, 0.5], [-7.5, 9.5], [7.5, 9.5]].forEach(function (p) {
      const s = cyl(0.16, 0.16, 0.08, 16, screwMat, p[0], p[1], ZC + 0.04);
      s.rotation.x = PI / 2;
      group.add(s);
    });
    g.title = createText3D('MẠCH ĐIỆN - ĐỊNH LUẬT OHM', '#ffffff', 7.0);
    g.title.position.set(0, 10.75, 0.2);
    group.add(g.title);

    // ----- nguồn điện (pin/ắc quy): cực + đỏ, cực - xanh -----
    const bat = new THREE.Group();
    bat.position.set(-5.8, 4.6, ZC + 0.65);
    bat.add(cyl(0.65, 0.65, 2.4, 40, stdMat(0x2b2f3a, 0.55, 0.4), 0, 0, 0));
    bat.add(cyl(0.66, 0.66, 1.1, 40, stdMat(0xffb300, 0.3, 0.5), 0, 0, 0));
    bat.add(cyl(0.24, 0.24, 0.22, 24, stdMat(0xe53935, 0.7, 0.3, { emissive: 0x550000 }), 0, 1.3, 0));
    bat.add(cyl(0.24, 0.24, 0.22, 24, stdMat(0x1e88e5, 0.7, 0.3, { emissive: 0x002255 }), 0, -1.3, 0));
    const redM = new THREE.MeshBasicMaterial({ color: 0xe53935 });
    const bluM = new THREE.MeshBasicMaterial({ color: 0x1e88e5 });
    bat.add(box(0.34, 0.08, 0.02, redM, 0, 0.88, 0.66));
    bat.add(box(0.08, 0.34, 0.02, redM, 0, 0.88, 0.66));
    bat.add(box(0.34, 0.08, 0.02, bluM, 0, -0.88, 0.66));
    g.batLabel = createGlyph3D('12V', '#111111', 1.0);
    g.batLabel.position.set(0, 0, 0.675);
    bat.add(g.batLabel);
    group.add(bat);
    const plus = createText3D('Nguồn  +', '#ff6e6e', 1.7);
    plus.position.set(-6.1, 6.55, 0.2);
    group.add(plus);

    // ----- khóa K -----
    const brass = stdMat(0xc9a227, 0.85, 0.3);
    group.add(box(2.4, 0.25, 0.7, stdMat(0x3b2f2a, 0.2, 0.7), -3.4, 7.85, ZC + 0.35));
    const post1 = sph(0.17, brass, -4.4, 8.2, 0.5);
    const post2 = sph(0.17, brass, -2.4, 8.2, 0.5);
    group.add(post1);
    group.add(post2);
    // cần gạt + tay cầm đỏ nằm trong Group có tâm xoay tại chốt trái (-4.4, 8.2, 0.5)
    g.kGroup = new THREE.Group();
    g.kGroup.position.set(-4.4, 8.2, 0.5);
    g.kGroup.add(box(2.0, 0.1, 0.18, stdMat(0xd8dde3, 0.85, 0.25), 1.0, 0, 0.08));
    g.kGroup.add(cyl(0.05, 0.05, 0.55, 10, stdMat(0x1a1a1a, 0.2, 0.6), 1.3, 0.3, 0.08));
    g.kGroup.add(sph(0.14, stdMat(0xb71c1c, 0.3, 0.4), 1.3, 0.62, 0.08));
    group.add(g.kGroup);
    g.kLabel = createText3D('Khóa K (ĐÓNG)', '#00ff88', 3.1);
    g.kLabel.position.set(-3.4, 7.25, 0.5);
    group.add(g.kLabel);
    g.kCur = 0;
    g.kTgt = 0;

    // ----- ampe kế & vôn kế -----
    g.amm = makeMeter('A', 0xd32f2f, '3', 0, 8.2, group);
    g.volt = makeMeter('V', 0x1565c0, '30', -2.5, 5.4, group);
    const aLab = createText3D('Ampe kế', '#ff8a80', 1.7);
    aLab.position.set(0, 9.6, 0.5);
    group.add(aLab);
    const vLab = createText3D('Vôn kế', '#82b1ff', 1.5);
    vLab.position.set(-2.5, 6.75, 0.5);
    group.add(vLab);

    // ----- biến trở con chạy (rheostat) -----
    const tubeMat = stdMat(0xd9c7a3, 0.05, 0.85);
    const rt = cyl(0.32, 0.32, 4.2, 32, tubeMat, 2.3, 1.6, 0.55);
    rt.rotation.z = PI / 2;
    group.add(rt);
    const capMat = stdMat(0x3a3f47, 0.7, 0.35);
    group.add(box(0.3, 1.5, 0.9, capMat, 0.1, 2.05, 0.6));
    group.add(box(0.3, 1.5, 0.9, capMat, 4.5, 2.05, 0.6));
    const rail = cyl(0.045, 0.045, 4.6, 16, stdMat(0xdfe5ec, 0.9, 0.2), 2.3, 2.55, 0.55);
    rail.rotation.z = PI / 2;
    group.add(rail);
    g.rings = [];
    for (let i = 0; i < C.RINGS; i++) {
      const x = lerp(0.35, 4.25, i / (C.RINGS - 1));
      const mat = stdMat(0xb87333, 0.9, 0.3, { emissive: 0xff5a1a, emissiveIntensity: 0 });
      const ring = mk(new THREE.TorusGeometry(0.36, 0.055, 10, 30), mat, x, 1.6, 0.55);
      ring.rotation.y = PI / 2;
      group.add(ring);
      g.rings.push({ mesh: ring, mat: mat, x: x });
    }
    g.slider = new THREE.Group();
    g.slider.position.set(C.RH_X1, 0, 0.55);
    g.slider.add(box(0.5, 0.34, 0.5, stdMat(0x2a2f36, 0.7, 0.3), 0, 2.55, 0));
    g.slider.add(box(0.1, 0.62, 0.1, stdMat(0xdfe5ec, 0.9, 0.2), 0, 2.2, 0));
    g.slider.add(sph(0.14, stdMat(0xd50000, 0.2, 0.4), 0, 2.85, 0));
    group.add(g.slider);
    const rLab = createText3D('Biến trở R', '#ffcc80', 1.9);
    rLab.position.set(2.3, 0.8, 0.5);
    group.add(rLab);

    // ----- bóng đèn sợi đốt -----
    group.add(box(2.0, 0.8, 0.8, stdMat(0x1b1b1b, 0.2, 0.6), 6.2, 3.7, ZC + 0.4));
    group.add(sph(0.16, brass, 5.1, 3.7, 0.45));
    group.add(sph(0.16, brass, 7.3, 3.7, 0.45));
    group.add(cyl(0.42, 0.42, 0.6, 28, stdMat(0xd4af37, 0.85, 0.3), 6.2, 4.4, 0.55));
    const neck = cyl(0.8, 0.42, 0.35, 28, glassMat(0xffffff, 0.2), 6.2, 4.9, 0.55);
    group.add(neck);
    g.glass = mk(new THREE.SphereGeometry(0.95, 36, 28), glassMat(0xffffff, 0.16), 6.2, 5.6, 0.55);
    group.add(g.glass);
    g.halo = mk(new THREE.SphereGeometry(0.9, 28, 20), new THREE.MeshBasicMaterial({
      color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
    }), 6.2, 5.6, 0.55);
    group.add(g.halo);
    const supMat = stdMat(0x8a8f98, 0.9, 0.3);
    group.add(cyl(0.02, 0.02, 0.9, 8, supMat, 6.02, 5.15, 0.55));
    group.add(cyl(0.02, 0.02, 0.9, 8, supMat, 6.38, 5.15, 0.55));
    g.filMat = stdMat(0x6b5a4a, 0.8, 0.4, { emissive: 0xff6a00, emissiveIntensity: 0 });
    g.filament = mk(new THREE.TubeGeometry(new HelixX(9, 0.05, 0.36), 160, 0.017, 6, false), g.filMat, 6.2, 5.62, 0.55);
    group.add(g.filament);
    g.bulbLight = new THREE.PointLight(0xffb866, 0, 16, 2);
    g.bulbLight.position.set(6.2, 5.6, 1.6);
    group.add(g.bulbLight);
    const bLab = createText3D('Bóng đèn', '#fff59d', 1.7);
    bLab.position.set(6.2, 2.75, 0.5);
    group.add(bLab);

    // ----- dây dẫn nối thành mạch kín -----
    g.sheathMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0,
      clearcoat: 1, side: THREE.DoubleSide, depthWrite: false
    });
    g.coreMat = stdMat(0xb87333, 0.9, 0.3, { emissive: 0xff2a00, emissiveIntensity: 0 });
    C.WIRES.forEach(function (poly) {
      for (let i = 0; i < poly.length - 1; i++) wireSeg(group, poly[i], poly[i + 1], g.sheathMat, g.coreMat);
      for (let i = 1; i < poly.length - 1; i++) {
        group.add(sph(0.11, g.sheathMat, poly[i][0], poly[i][1], C.ZW));
      }
    });
    group.add(sph(0.14, brass, -5.8, 7.0, C.ZW));
    group.add(sph(0.14, brass, -1.25, 1.6, C.ZW));

    // ----- các hạt tải điện chạy dọc dây -----
    const pts = C.PATH.slice();
    g.seg = [];
    g.pathLen = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      g.seg.push({ a: a, b: b, len: len, start: g.pathLen });
      g.pathLen += len;
    }
    g.N = C.N_PART;
    g.parts = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      g.N
    );
    const cY = new THREE.Color(0xffe14d), cB = new THREE.Color(0x4dd9ff);
    for (let i = 0; i < g.N; i++) g.parts.setColorAt(i, i % 2 === 0 ? cY : cB);
    g.parts.instanceColor.needsUpdate = true;
    g.parts.frustumCulled = false;
    g.dummy = new THREE.Object3D();
    group.add(g.parts);

    // ----- bảng LED số liệu (đặt giữa bảng mạch) -----
    const cols = ['#ffee58', '#ffb74d', '#39ff14', '#ff5252', '#ff8a65'];
    const ys = [6.55, 5.77, 4.99, 4.21, 3.43];
    g.leds = [];
    for (let i = 0; i < 5; i++) {
      const m = createText3D('...', cols[i], 4.8);
      m.position.set(2.2, ys[i], 0.85);
      group.add(m);
      g.leds.push(m);
    }
    return g;
  }

  function pathPoint(g, d, out) {
    for (let i = 0; i < g.seg.length; i++) {
      const s = g.seg[i];
      if (d <= s.start + s.len || i === g.seg.length - 1) {
        const f = clamp((d - s.start) / s.len, 0, 1);
        out.x = lerp(s.a[0], s.b[0], f);
        out.y = lerp(s.a[1], s.b[1], f);
        return out;
      }
    }
    return out;
  }

  const _tmp = { x: 0, y: 0 };
  function placeParticlesOhm(g) {
    const L = g.pathLen, N = g.N, off = g.pOffset, amp = g.jitter, t = g.t;
    for (let i = 0; i < N; i++) {
      let d = (i * L / N + off) % L;
      if (d < 0) d += L;
      pathPoint(g, d, _tmp);
      const jx = Math.sin(t * 13 + i * 2.3) * amp;
      const jy = Math.cos(t * 11 + i * 1.9) * amp;
      g.dummy.position.set(_tmp.x + jx, _tmp.y + jy, C.ZW);
      g.dummy.updateMatrix();
      g.parts.setMatrixAt(i, g.dummy.matrix);
    }
    g.parts.instanceMatrix.needsUpdate = true;
  }

  function applyBulbOhm(g, b, flick) {
    const k = clamp(b * flick, 0, 1.2);
    g.filMat.emissiveIntensity = k * 3.2;
    g.filMat.color.setHex(0x6b5a4a).lerp(new THREE.Color(0xfff2c0), clamp(k, 0, 1));
    g.filMat.emissive.setHex(0xff5a00).lerp(new THREE.Color(0xffd27a), clamp(k, 0, 1));
    g.halo.material.opacity = clamp(k * 0.5, 0, 0.6);
    g.bulbLight.intensity = k * 3.4;
  }

  function updateOhm(st, U, R, T, closed) {
    const g = st.g9;
    if (!g || g.id !== 'OHM') return;
    U = clamp(num(U, 12), 1, 24);
    R = clamp(num(R, 20), 5, 100);
    T = clamp(num(T, 30), 20, 100);
    closed = closed !== false;
    const I = closed ? U / R : 0;          // khóa K mở -> I = 0
    const P = U * I;                       // P = U.I (mở -> 0 W)

    // con chạy biến trở trượt trên dải 5 -> 100 Ω (R lớn -> dùng nhiều vòng dây hơn)
    const tR = (R - 5) / 95;
    const xs = lerp(C.RH_X1, C.RH_X0, tR);
    g.slider.position.x = xs;
    const heat = 0.35 + clamp(I / 4, 0, 1) * 0.55;
    for (let i = 0; i < g.rings.length; i++) {
      const used = g.rings[i].x >= xs - 0.001;
      g.rings[i].mat.emissiveIntensity = (used && closed) ? heat : 0;   // mở mạch: dây biến trở nguội
      g.rings[i].mat.color.setHex(used ? 0xe08a3c : 0x8d5a2b);
    }

    // đồng hồ (ampe kế về 0 khi mở, vôn kế vẫn chỉ U nguồn)
    let range = C.AMM_RANGES[C.AMM_RANGES.length - 1];
    for (let i = 0; i < C.AMM_RANGES.length; i++) {
      if (I <= C.AMM_RANGES[i]) { range = C.AMM_RANGES[i]; break; }
    }
    if (g.amm.maxText !== String(range)) {
      g.amm.maxText = String(range);
      updateGlyph3D(g.amm.maxLabel, String(range));
    }
    g.amm.tgt = 1.05 - 2.1 * clamp(I / range, 0, 1);
    g.volt.tgt = 1.05 - 2.1 * clamp(U / C.VOLT_MAX, 0, 1);
    if (g.first !== true) {
      g.first = true;
      g.amm.cur = g.amm.tgt;
      g.volt.cur = g.volt.tgt;
      g.kCur = closed ? 0 : 0.6;
    }
    g.amm.needle.rotation.z = g.amm.cur;
    g.volt.needle.rotation.z = g.volt.cur;

    // khóa K: đóng -> cần gạt nằm ngang; mở -> xoay lên 0.6 rad (~35°)
    g.kTgt = closed ? 0 : 0.6;
    g.kGroup.rotation.z = g.kCur;
    if (closed) updateText3D(g.kLabel, 'Khóa K (ĐÓNG)', '#00ff88');
    else updateText3D(g.kLabel, 'Khóa K (MỞ - Mạch hở)', '#ff5252');

    // nhãn trên pin
    updateGlyph3D(g.batLabel, fmt(U, 1) + 'V');

    // tốc độ hạt & độ sáng đèn tỉ lệ thuận với I
    g.speed = closed ? Math.min(0.3 + I * 1.6, 10) : 0;
    g.brightTgt = closed ? clamp(I / 3, 0, 1) : 0;
    g.bright = g.brightTgt;
    applyBulbOhm(g, g.bright, 1);

    // nhiệt độ dây dẫn T (p3): lõi đồng ửng đỏ, hạt dao động nhiệt mạnh hơn
    const tn = (T - 20) / 80;
    g.coreMat.emissiveIntensity = tn * (closed ? 0.9 : 0.45);
    g.coreMat.color.setHex(0xb87333).lerp(new THREE.Color(0xff4a1a), tn * 0.6);
    g.jitter = closed ? 0.015 + tn * 0.07 : 0.008 + tn * 0.05;

    updateText3D(g.leds[0], 'Hiệu điện thế U = ' + fmt(U, 1) + ' V');
    updateText3D(g.leds[1], 'Điện trở R = ' + fmt(R, 0) + ' Ω');
    updateText3D(g.leds[2], 'Cường độ I = ' + fmt(I, 3) + ' A');
    updateText3D(g.leds[3], 'Công suất P = ' + fmt(P, 2) + ' W');
    updateText3D(g.leds[4], 'Nhiệt độ dây dẫn T = ' + fmt(T, 0) + ' °C');
    g.last = { U: U, R: R, I: I, P: P, T: T, closed: closed };
    placeParticlesOhm(g);
  }

  function animateOhm(st, dt) {
    const g = st.g9;
    if (!g || g.id !== 'OHM' || !g.last) return;
    dt = Math.min(dt, 0.05);
    g.t += dt;
    g.pOffset += g.speed * dt;
    placeParticlesOhm(g);
    // cần gạt khóa K xoay mượt
    g.kCur += (g.kTgt - g.kCur) * (1 - Math.exp(-14 * dt));
    g.kGroup.rotation.z = g.kCur;
    // kim đồng hồ chuyển động mượt
    const f = 1 - Math.exp(-9 * dt);
    g.amm.cur += (g.amm.tgt - g.amm.cur) * f;
    g.volt.cur += (g.volt.tgt - g.volt.cur) * f;
    g.amm.needle.rotation.z = g.amm.cur + Math.sin(g.t * 31) * 0.002;
    g.volt.needle.rotation.z = g.volt.cur;
    // dây tóc nhấp nháy rất nhẹ
    const flick = 1 + 0.035 * Math.sin(g.t * 37) * Math.sin(g.t * 11);
    applyBulbOhm(g, g.bright, flick);
  }

  /* ===================================================================
   *  API CÔNG KHAI
   *    '9-1' = Hiện tượng khúc xạ ánh sáng      (nội bộ: REFR)
   *    '9-2' = Đo tiêu cự thấu kính hội tụ       (nội bộ: LENS)
   *    '9-3' = Định luật Ohm và mạch điện        (nội bộ: OHM)
   * =================================================================== */
  const KIND = { '9-1': 'REFR', '9-2': 'LENS', '9-3': 'OHM' };

  // Dải thanh trượt (khớp SUBJECT_CONFIG): [min, max] của p1, p2, p3
  const SPEC = {
    REFR: [[0, 85], [1.0, 2.5], [10, 100]],
    LENS: [[10, 100], [5, 30], [1, 10]],
    OHM: [[1, 24], [5, 100], [20, 100]]
  };
  const DEFAULTS = {
    REFR: [45, 1.33, 80],
    LENS: [30, 15, 3],
    OHM: [12, 20, 30]
  };
  // Căn khung camera (nhìn vào (0,1,0), radius 11.2): scale + vị trí gốc của từng bài
  const FRAME = {
    REFR: { s: 0.68, x: -2.7, y: 0.7 },
    LENS: { s: 0.6, x: 0, y: -0.1 },
    OHM: { s: 0.65, x: 0, y: -2.4 }
  };

  /** Lấy min/max thật của thanh trượt i (1..3): ưu tiên input DOM, sau đó SUBJECT_CONFIG */
  function sliderRange(expId, i) {
    try {
      const el = document.getElementById('param' + i);
      if (el) {
        const mn = parseFloat(el.min), mx = parseFloat(el.max);
        if (isFinite(mn) && isFinite(mx) && mx > mn) return { min: mn, max: mx };
      }
    } catch (e) { /* bỏ qua */ }
    try {
      const cfg = window.SUBJECT_CONFIG && window.SUBJECT_CONFIG[expId];
      if (cfg) {
        const cands = [
          cfg['p' + i], cfg['param' + i],
          cfg.params && cfg.params[i - 1],
          cfg.sliders && cfg.sliders[i - 1],
          cfg.parameters && cfg.parameters[i - 1]
        ];
        for (let k = 0; k < cands.length; k++) {
          const c = cands[k];
          if (c && isFinite(parseFloat(c.min)) && isFinite(parseFloat(c.max)) && parseFloat(c.max) > parseFloat(c.min)) {
            return { min: parseFloat(c.min), max: parseFloat(c.max) };
          }
        }
      }
    } catch (e) { /* bỏ qua */ }
    return null;
  }

  /** Quy đổi giá trị thanh trượt về dải vật lý của mô hình (đồng nhất khi hai dải trùng nhau) */
  function normParam(expId, kind, i, v) {
    const spec = SPEC[kind][i - 1];
    v = num(v, DEFAULTS[kind][i - 1]);
    const r = sliderRange(expId, i);
    if (r && (Math.abs(r.min - spec[0]) > 1e-9 || Math.abs(r.max - spec[1]) > 1e-9)) {
      v = spec[0] + (v - r.min) / (r.max - r.min) * (spec[1] - spec[0]);
    }
    return clamp(v, spec[0], spec[1]);
  }

  /* ---------- thanh công cụ phụ cho bài 9-3 (Khóa K) ---------- */
  let ohmState = null;
  const TOOLBAR_WRAP_ID = 'g9-switch-wrap';

  function removeToolbar9() {
    try {
      const w = document.getElementById(TOOLBAR_WRAP_ID);
      if (w && w.parentNode) w.parentNode.removeChild(w);
    } catch (e) { /* bỏ qua */ }
  }

  function refreshSwitchState() {
    try {
      const el = document.getElementById('g9-switch-state');
      if (!el || !ohmState || !ohmState.g9) return;
      const closed = ohmState.g9.closed !== false;
      el.textContent = closed ? 'Khóa K (ĐÓNG)' : 'Khóa K (MỞ - Mạch hở)';
      el.style.color = closed ? '#00ff88' : '#ff5252';
    } catch (e) { /* bỏ qua */ }
  }

  function setupToolbar9() {
    removeToolbar9();
    try {
      const bar = document.getElementById('exp6-sub-toolbar');
      if (!bar) return;
      if (bar.style.display === 'none') bar.style.display = 'block';
      const wrap = document.createElement('div');
      wrap.id = TOOLBAR_WRAP_ID;
      wrap.innerHTML =
        '<button onclick="window.toggleSwitch9_3()" class="w-full py-1.5 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white font-bold">' +
        '🔌 ĐÓNG / MỞ KHÓA K (Công tắc mạch điện)</button>' +
        '<div id="g9-switch-state" style="margin-top:4px;text-align:center;font-weight:700;font-size:12px;color:#00ff88;">Khóa K (ĐÓNG)</div>';
      bar.appendChild(wrap);
      refreshSwitchState();
    } catch (e) { /* bỏ qua */ }
  }

  /** Đóng / mở khóa K (gọi từ nút bấm trên bảng điều khiển) */
  window.toggleSwitch9_3 = function () {
    if (!ohmState || !ohmState.g9 || ohmState.g9.id !== 'OHM') return;
    const g = ohmState.g9;
    g.closed = !(g.closed !== false);
    const raw = g.rawParams || DEFAULTS.OHM;
    updateOhm(ohmState,
      normParam('9-3', 'OHM', 1, raw[0]),
      normParam('9-3', 'OHM', 2, raw[1]),
      normParam('9-3', 'OHM', 3, raw[2]),
      g.closed);
    refreshSwitchState();
  };

  window.renderGrade9 = function (expId, expGroup, expState) {
    const kind = KIND[expId];
    if (!kind) return false;
    expState = expState || {};
    removeToolbar9();
    if (kind !== 'OHM') ohmState = null;

    // Group gốc đã căn tỷ lệ + hạ độ cao để mô hình nằm giữa khung camera mặc định
    const fr = FRAME[kind];
    const root = new THREE.Group();
    root.position.set(fr.x, fr.y, 0);
    root.scale.setScalar(fr.s);
    expGroup.add(root);
    expState.g9Root = root;

    if (kind === 'REFR') buildRefr(root, expState);
    else if (kind === 'LENS') buildLens(root, expState);
    else {
      buildOhm(root, expState);
      expState.g9.closed = true;
      ohmState = expState;
      setupToolbar9();
    }

    // đọc giá trị hiện tại của thanh trượt và cập nhật ngay
    const df = DEFAULTS[kind];
    const p1 = readParam('param1', df[0]);
    const p2 = readParam('param2', df[1]);
    const p3 = readParam('param3', df[2]);
    window.updateGrade9(expId, expState, p1, p2, p3);
    return true;
  };

  window.updateGrade9 = function (expId, expState, p1, p2, p3) {
    const kind = KIND[expId];
    if (!kind || !expState || !expState.g9) return;
    const a = normParam(expId, kind, 1, p1);
    const b = normParam(expId, kind, 2, p2);
    const c = normParam(expId, kind, 3, p3);
    if (kind === 'REFR') updateRefr(expState, a, b, c);
    else if (kind === 'LENS') updateLens(expState, a, b, c);
    else {
      const g = expState.g9;
      g.rawParams = [p1, p2, p3];
      updateOhm(expState, a, b, c, g.closed !== false);
      refreshSwitchState();
    }
  };

  window.animateGrade9 = function (expId, expState, dt, p1, p2, p3) {
    const kind = KIND[expId];
    if (!kind || !expState || !expState.g9) return;
    dt = (typeof dt === 'number' && isFinite(dt) && dt > 0) ? dt : 0.016;
    if (kind === 'REFR') animateRefr(expState, dt);
    else if (kind === 'LENS') animateLens(expState, dt);
    else animateOhm(expState, dt);
  };

  // Tiện ích chữ 3D: chỉ đăng ký toàn cục nếu file khác chưa định nghĩa (tránh ghi đè)
  if (typeof window.createText3D !== 'function') window.createText3D = createText3D;
  if (typeof window.updateText3D !== 'function') window.updateText3D = updateText3D;
  if (typeof window.createGlyph3D !== 'function') window.createGlyph3D = createGlyph3D;
  if (typeof window.updateGlyph3D !== 'function') window.updateGlyph3D = updateGlyph3D;
  window.createText3D_G9 = createText3D;
  window.updateText3D_G9 = updateText3D;
  window.createGlyph3D_G9 = createGlyph3D;
})();