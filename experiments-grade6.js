/* =========================================================================
   experiments-grade6.js — HỆ THỐNG MÔ PHỎNG 3D V-LABS KHỐI 6 (Three.js r128)
   Bản nâng cấp Đồ họa PBR Cao cấp, Bảng LED 3D Sắc nét (createText3D)
   - Nâng cấp 6-8: Làm mờ bộ phận phụ, phát sáng + Mũi tên 3D chỉ điểm bộ phận đang Zoom.
   - Nâng cấp 6-5: Thay đổi kích thước Chuông/Chất đốt/Nhiệt độ kích hoạt & Hạt khí O2/N2.

   API Công khai:
     window.createText3D(text, width, height, options)
     window.updateText3D(mesh, text, options)
     window.renderGrade6(expId, expGroup, expState)
     window.updateGrade6(expId, expState, p1, p2, p3)
     window.animateGrade6(expId, expState, dt, p1, p2, p3)
   ========================================================================= */

(function (global) {
  'use strict';

  let vScene = null;
  let vCamera = null;
  let vRenderer = null;
  let exp6Group = null;
  let activeExp6Id = '6-1';
  let exp6State = {};
  let vClock = null;

  const TABLE_FLOOR_Y = -1.25;
  const CANVAS_W = 1024;
  const CANVAS_H = 160;

  const camSpherical = {
    radius: 11.2,
    theta: 0.0,
    phi: 1.15,
    targetRadius: 11.2,
    targetTheta: 0.0,
    targetPhi: 1.15
  };
  let camLookTarget = null;
  let camLookCurrent = null;
  let isMouseDown = false;
  let prevMouse = { x: 0, y: 0 };

  // =========================================================================
  // 1. TIỆN ÍCH CHỮ 3D ĐỘ PHÂN GIẢI CAO (createText3D & updateText3D)
  // =========================================================================
  const TEXT_DEFAULTS = {
    color: '#7dffb3',
    border: '#38bdf8',
    bg: 'rgba(6, 14, 28, 0.94)',
    fontSize: 68
  };

  function roundedRectPath(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
  }

  function paintText3D(canvas, text, o) {
    const ctx = canvas.getContext('2d');
    const vw = CANVAS_H * (o.aspect || 5.5);
    const margin = 10;
    const radius = 28;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.setTransform(CANVAS_W / vw, 0, 0, 1, 0, 0);

    roundedRectPath(ctx, margin, margin, vw - 2 * margin, CANVAS_H - 2 * margin, radius);
    ctx.fillStyle = o.bg;
    ctx.fill();

    ctx.save();
    ctx.shadowColor = o.border;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 5.5;
    ctx.strokeStyle = o.border;
    ctx.stroke();
    ctx.restore();

    roundedRectPath(ctx, margin + 5, margin + 5, vw - 2 * margin - 10, CANVAS_H - 2 * margin - 10, radius - 5);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.stroke();

    let fontSize = o.fontSize || 68;
    const maxWidth = vw - 2 * margin - 44;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    while (fontSize > 14) {
      ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Roboto, Arial, sans-serif';
      if (ctx.measureText(text).width <= maxWidth) break;
      fontSize -= 2;
    }

    ctx.shadowColor = o.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = o.color;
    ctx.fillText(text, vw / 2, CANVAS_H / 2 + 3);
    ctx.shadowBlur = 0;
  }

  function createText3D(text, width = 4.2, height = 0.56, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = 4;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.renderOrder = 999;

    const base = Object.assign({}, TEXT_DEFAULTS, options || {});
    mesh.userData.text3d = {
      canvas: canvas,
      texture: texture,
      aspect: width / height,
      base: base,
      key: ''
    };
    updateText3D(mesh, text, null);
    return mesh;
  }

  function updateText3D(mesh, text, options) {
    const d = mesh && mesh.userData && mesh.userData.text3d;
    if (!d) return;
    const o = Object.assign({}, d.base, options || {});
    o.aspect = d.aspect;
    const str = String(text);
    const key = str + '|' + o.color + '|' + o.border + '|' + o.bg + '|' + o.fontSize;
    if (key === d.key) return;
    d.key = key;
    paintText3D(d.canvas, str, o);
    d.texture.needsUpdate = true;
  }

  function buildPanel6(group, lineCount, topY = 4.25, zPos = -2.4) {
    const lineW = 9.2;
    const lineH = 0.54;
    const gap = 0.07;
    const totalH = lineCount * lineH + (lineCount - 1) * gap;
    const centerY = topY - totalH / 2;

    const backBoard = new THREE.Mesh(
      new THREE.BoxGeometry(lineW + 0.45, totalH + 0.28, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x06101e, metalness: 0.6, roughness: 0.4 })
    );
    backBoard.position.set(0, centerY, zPos - 0.05);
    group.add(backBoard);

    const lines = [];
    for (let i = 0; i < lineCount; i++) {
      const y = centerY + totalH / 2 - lineH / 2 - i * (lineH + gap);
      const lineMesh = createText3D('', lineW, lineH, { fontSize: 62 });
      lineMesh.position.set(0, y, zPos);
      group.add(lineMesh);
      lines.push(lineMesh);
    }
    return lines;
  }

  function createTextSprite(text, bgColor = 'rgba(6, 14, 28, 0.94)', textColor = '#38bdf8', fontSize = 64) {
    const mesh = createText3D(text, 5.2, 0.64, {
      bg: bgColor,
      color: textColor,
      border: textColor,
      fontSize: fontSize < 40 ? 64 : fontSize
    });
    return { sprite: mesh, mesh: mesh };
  }

  function updateTextSprite(labelObj, text, bgColor = 'rgba(6, 14, 28, 0.94)', textColor = '#38bdf8') {
    if (!labelObj) return;
    const targetMesh = labelObj.mesh || labelObj.sprite || labelObj;
    updateText3D(targetMesh, text, { bg: bgColor, color: textColor, border: textColor });
  }

  // =========================================================================
  // 2. CLASS ES6 HELIXCURVE CHUẨN ĐỂ VẼ LÒ XO 3D TUBEGEOMETRY KHÔNG LỖI
  // =========================================================================
  class HelixCurve6 extends THREE.Curve {
    constructor(radius = 0.36, turns = 11, height = 2.0) {
      super();
      this.radius = radius;
      this.turns = turns;
      this.height = height;
    }
    getPoint(t, optionalTarget) {
      const p = optionalTarget || new THREE.Vector3();
      const angle = t * this.turns * Math.PI * 2;
      return p.set(
        Math.cos(angle) * this.radius,
        -t * this.height,
        Math.sin(angle) * this.radius
      );
    }
  }

  // =========================================================================
  // 3. TIỆN ÍCH VẬT LIỆU PBR, TEXTURE BỀ MẶT & BÀN THÍ NGHIỆM
  // =========================================================================
  function ensureThreeJS(callback) {
    if (typeof window.THREE !== 'undefined') {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  }

  function enableGroupShadows(obj, cast = true, receive = true) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.isMesh && !child.userData.text3d) {
        child.castShadow = cast;
        child.receiveShadow = receive;
      }
    });
  }

  function addLocalPbrLights(group) {
    const localHemi = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.45);
    localHemi.position.set(0, 8, 0);

    const localDir = new THREE.DirectionalLight(0xffffff, 0.65);
    localDir.position.set(-5, 9, 6);

    group.add(localHemi, localDir);
  }

  function createLabBench(width = 13.0, depth = 5.6, surfaceY = -0.35) {
    const benchGroup = new THREE.Group();
    const thickness = 0.26;
    const centerY = surfaceY - thickness / 2;

    const topMesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, thickness, depth),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.35 })
    );
    topMesh.position.set(0, centerY, 0);
    topMesh.receiveShadow = true;
    topMesh.castShadow = true;
    benchGroup.add(topMesh);

    const trimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.25, metalness: 0.8 });
    const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, thickness + 0.02, 0.08), trimMat);
    frontTrim.position.set(0, centerY, depth / 2);
    const backTrim = frontTrim.clone();
    backTrim.position.set(0, centerY, -depth / 2);
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.08, thickness + 0.02, depth + 0.08), trimMat);
    leftTrim.position.set(-width / 2, centerY, 0);
    const rightTrim = leftTrim.clone();
    rightTrim.position.set(width / 2, centerY, 0);
    benchGroup.add(frontTrim, backTrim, leftTrim, rightTrim);

    const bottomOfTop = surfaceY - thickness;
    const legHeight = Math.max(0.15, bottomOfTop - TABLE_FLOOR_Y);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
    const footMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4, metalness: 0.6 });

    const ox = width / 2 - 0.55;
    const oz = depth / 2 - 0.55;
    [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, legHeight, 20), legMat);
      leg.position.set(lx, TABLE_FLOOR_Y + legHeight / 2, lz);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.05, 20), footMat);
      foot.position.set(lx, TABLE_FLOOR_Y + 0.025, lz);
      benchGroup.add(leg, foot);
    });

    enableGroupShadows(benchGroup);
    return benchGroup;
  }

  const surfaceTextures63 = {};
  function getSurfaceTexture63(mode) {
    if (surfaceTextures63[mode]) return surfaceTextures63[mode];
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');

    if (mode === 'ice') {
      const g = ctx.createLinearGradient(0, 0, 512, 256);
      g.addColorStop(0, '#bae6fd');
      g.addColorStop(0.5, '#e0f2fe');
      g.addColorStop(1, '#7dd3fc');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 512, Math.random() * 256);
        ctx.lineTo(Math.random() * 512, Math.random() * 256);
        ctx.stroke();
      }
    } else if (mode === 'wood') {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, 0, 512, 256);
      for (let y = 0; y < 256; y += 6) {
        ctx.fillStyle = y % 12 === 0 ? 'rgba(120, 53, 15, 0.45)' : 'rgba(251, 191, 36, 0.22)';
        ctx.fillRect(0, y, 512, 3);
      }
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 2200; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#475569';
        ctx.fillRect(Math.random() * 512, Math.random() * 256, 3, 3);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    surfaceTextures63[mode] = tex;
    return tex;
  }

  // =========================================================================
  // 4. KHỞI TẠO VIEWPORT 3D TRUNG TÂM
  // =========================================================================
  function initThreeViewport() {
    if (vRenderer) return true;

    const hostEl = document.getElementById('canvas-3d-container');
    if (!hostEl) return false;
    const placeholder = document.getElementById('canvas-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    const oldCanvas = hostEl.querySelector('canvas');
    if (oldCanvas) oldCanvas.style.display = 'none';

    if (window.getComputedStyle(hostEl).position === 'static') {
      hostEl.style.position = 'relative';
    }

    let rootDiv = document.getElementById('vlabs-exp6-viewport');
    if (!rootDiv) {
      rootDiv = document.createElement('div');
      rootDiv.id = 'vlabs-exp6-viewport';
      rootDiv.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; z-index:2; overflow:hidden;';
      if (oldCanvas) {
        oldCanvas.insertAdjacentElement('afterend', rootDiv);
      } else {
        hostEl.appendChild(rootDiv);
      }
    }

    const w = rootDiv.clientWidth || hostEl.clientWidth || 800;
    const h = rootDiv.clientHeight || hostEl.clientHeight || 550;

    vScene = new THREE.Scene();
    vScene.background = new THREE.Color(0x050914);
    vScene.fog = new THREE.FogExp2(0x050914, 0.02);

    vCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camLookTarget = new THREE.Vector3(0, 1.0, 0);
    camLookCurrent = new THREE.Vector3(0, 1.0, 0);

    vRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    vRenderer.setSize(w, h);
    vRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    vRenderer.shadowMap.enabled = true;
    vRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (typeof THREE.ACESFilmicToneMapping !== 'undefined') {
      vRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      vRenderer.toneMappingExposure = 1.15;
    }
    rootDiv.innerHTML = '';
    rootDiv.appendChild(vRenderer.domElement);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.68);
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.5);
    hemiLight.position.set(0, 15, 0);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight1.position.set(7, 14, 9);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 1;
    dirLight1.shadow.camera.far = 35;
    const d = 9.5;
    dirLight1.shadow.camera.left = -d;
    dirLight1.shadow.camera.right = d;
    dirLight1.shadow.camera.top = d;
    dirLight1.shadow.camera.bottom = -d;
    dirLight1.shadow.bias = -0.0005;

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.45);
    dirLight2.position.set(-7, 6, -6);

    vScene.add(ambLight, hemiLight, dirLight1, dirLight2);

    const grid = new THREE.GridHelper(22, 22, 0x1e3a8a, 0x0b1329);
    grid.position.y = TABLE_FLOOR_Y;
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    vScene.add(grid);

    exp6Group = new THREE.Group();
    vScene.add(exp6Group);
    vClock = new THREE.Clock();

    const dom = vRenderer.domElement;
    dom.style.cursor = 'grab';
    let isRightMouseDown = false;

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isMouseDown = true;
        isRightMouseDown = false;
        prevMouse.x = e.clientX;
        prevMouse.y = e.clientY;
        dom.style.cursor = 'grabbing';
      } else if (e.button === 2) {
        isRightMouseDown = true;
        isMouseDown = false;
        prevMouse.x = e.clientX;
        prevMouse.y = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
      isRightMouseDown = false;
      if (dom) dom.style.cursor = 'grab';
    });

    window.addEventListener('mousemove', (e) => {
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse.x = e.clientX;
      prevMouse.y = e.clientY;

      if (isRightMouseDown) {
        const panSpeed = 0.005 * (camSpherical.radius / 10);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camSpherical.theta);
        const up = new THREE.Vector3(0, 1, 0);
        camLookTarget.addScaledVector(right, -dx * panSpeed);
        camLookTarget.addScaledVector(up, dy * panSpeed);
      } else if (isMouseDown) {
        camSpherical.targetTheta -= dx * 0.008;
        camSpherical.targetPhi = Math.max(0.25, Math.min(1.5, camSpherical.targetPhi - dy * 0.008));
      }
    });

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      camSpherical.targetRadius = Math.max(3.2, Math.min(20, camSpherical.targetRadius + e.deltaY * 0.008));
    }, { passive: false });

    window.addEventListener('resize', () => {
      if (!rootDiv || !vRenderer || !vCamera) return;
      const nw = rootDiv.clientWidth || hostEl.clientWidth || 800;
      const nh = rootDiv.clientHeight || hostEl.clientHeight || 550;
      vCamera.aspect = nw / nh;
      vCamera.updateProjectionMatrix();
      vRenderer.setSize(nw, nh);
    });

    return true;
  }

  function clearExp6Group() {
    if (!exp6Group) return;
    while (exp6Group.children.length > 0) {
      const child = exp6Group.children[0];
      exp6Group.remove(child);
    }
    exp6State = {};
  }

  function getSliders() {
    const p1 = parseFloat(document.getElementById('param1')?.value || 25);
    const p2 = parseFloat(document.getElementById('param2')?.value || 50);
    const p3 = parseFloat(document.getElementById('param3')?.value || 10);
    return { p1, p2, p3 };
  }

  function renderSubControlToolbar(expId) {
    let bar = document.getElementById('exp6-sub-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'exp6-sub-toolbar';
      bar.className = 'mt-3 pt-3 border-t border-slate-700/60 flex flex-wrap gap-1.5';
      const descEl = document.getElementById('experiment-desc');
      if (descEl && descEl.parentNode) {
        descEl.parentNode.appendChild(bar);
      }
    }
    bar.innerHTML = '';

    if (expId === '6-1') {
      bar.innerHTML = `
        <button onclick="window.toggleExp6Shape('box')" class="px-2.5 py-1 text-xs rounded bg-sky-600 hover:bg-sky-500 text-white font-medium shadow">Khối hộp kim loại</button>
        <button onclick="window.toggleExp6Shape('cylinder')" class="px-2.5 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white font-medium shadow">Thanh trụ đồng</button>
        <button onclick="window.resetStopwatch6_1()" class="px-2.5 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow">⏱ Bấm giờ lại</button>
      `;
    } else if (expId === '6-3') {
      bar.innerHTML = `
        <button onclick="window.setFrictionSurface(0.08)" class="px-2 py-1 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white">Mặt băng (μ=0.08)</button>
        <button onclick="window.setFrictionSurface(0.3)" class="px-2 py-1 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white">Mặt gỗ (μ=0.3)</button>
        <button onclick="window.setFrictionSurface(0.75)" class="px-2 py-1 text-xs rounded bg-stone-700 hover:bg-stone-600 text-white">Mặt nhám (μ=0.75)</button>
        <button onclick="window.triggerPullBlock6_3()" class="w-full mt-1 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow">▶ KÉO LỰC KẾ & THỬ TRƯỢT LẠI</button>
      `;
    } else if (expId === '6-5') {
      bar.innerHTML = `
        <button onclick="window.restartCandle6_5()" class="w-full py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-bold shadow">🔥 ĐỐT NẾN & ÚP CHUÔNG THỦY TINH LẠI</button>
      `;
    } else if (expId === '6-6') {
      bar.innerHTML = `
        <button onclick="window.setExp6_6Mode('both')" class="px-2 py-1 text-xs rounded bg-sky-600 text-white">Toàn cảnh</button>
        <button onclick="window.setExp6_6Mode('filter')" class="px-2 py-1 text-xs rounded bg-indigo-600 text-white">Zoom Phễu Lọc</button>
        <button onclick="window.setExp6_6Mode('evap')" class="px-2 py-1 text-xs rounded bg-rose-600 text-white">Zoom Cô Cạn</button>
      `;
    } else if (expId === '6-7') {
      bar.innerHTML = `
        <div class="w-full text-xs text-amber-300 font-semibold mb-1">Xoay ốc vặn lấy nét tiêu bản:</div>
        <input id="focus-knob-6-7" type="range" min="-10" max="10" step="0.2" value="0" class="w-full accent-amber-400 cursor-pointer" oninput="window.onFocusKnobChange6_7(this.value)">
        <div class="w-full flex justify-between text-[10px] text-slate-400"><span>Mờ (Quá gần)</span><span class="text-emerald-400 font-bold">Nét căng (0)</span><span>Mờ (Quá xa)</span></div>
      `;
    } else if (expId === '6-8') {
      bar.innerHTML = `
        <div class="w-full text-xs text-emerald-400 font-semibold mb-1">Bấm nút chú thích để làm sáng & Zoom tới bộ phận:</div>
        <button id="btn-cell-all" onclick="window.zoomCellPart6_8('all')" class="px-2 py-1 text-[11px] rounded bg-slate-700 hover:bg-slate-600 text-white ring-2 ring-white font-bold transition">Toàn cảnh</button>
        <button id="btn-cell-wall" onclick="window.zoomCellPart6_8('wall')" class="px-2 py-1 text-[11px] rounded bg-emerald-700 hover:bg-emerald-600 text-white transition">Thành tế bào</button>
        <button id="btn-cell-membrane" onclick="window.zoomCellPart6_8('membrane')" class="px-2 py-1 text-[11px] rounded bg-teal-700 hover:bg-teal-600 text-white transition">Màng tế bào</button>
        <button id="btn-cell-cytoplasm" onclick="window.zoomCellPart6_8('cytoplasm')" class="px-2 py-1 text-[11px] rounded bg-cyan-700 hover:bg-cyan-600 text-white transition">Tế bào chất</button>
        <button id="btn-cell-nucleus" onclick="window.zoomCellPart6_8('nucleus')" class="px-2 py-1 text-[11px] rounded bg-purple-700 hover:bg-purple-600 text-white transition">Nhân tế bào</button>
        <button id="btn-cell-chloroplast" onclick="window.zoomCellPart6_8('chloroplast')" class="px-2 py-1 text-[11px] rounded bg-green-700 hover:bg-green-600 text-white transition">Lục lạp</button>
        <button id="btn-cell-vacuole" onclick="window.zoomCellPart6_8('vacuole')" class="px-2 py-1 text-[11px] rounded bg-sky-700 hover:bg-sky-600 text-white transition">Không bào</button>
      `;
    }
  }

  // =========================================================================
  // 5. THIẾT KẾ 3 BÀI VẬT LÝ KHỐI 6 (6-1, 6-2, 6-3) CHUẨN PBR
  // =========================================================================

  // BÀI 6-1: ĐO CHIỀU DÀI, KHỐI LƯỢNG, THỜI GIAN
  function build61(group, S) {
    addLocalPbrLights(group);
    const bench = createLabBench(12.2, 5.4, -0.45);
    group.add(bench);

    S.panel = buildPanel6(group, 2, 4.25, -2.3);

    const rCanvas = document.createElement('canvas');
    rCanvas.width = 2048;
    rCanvas.height = 256;
    const rCtx = rCanvas.getContext('2d');
    const rGrad = rCtx.createLinearGradient(0, 0, 0, 256);
    rGrad.addColorStop(0, '#f8fafc');
    rGrad.addColorStop(0.55, '#e2e8f0');
    rGrad.addColorStop(0.56, '#facc15');
    rGrad.addColorStop(1, '#eab308');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(0, 0, 2048, 256);

    rCtx.strokeStyle = '#0f172a';
    rCtx.fillStyle = '#0f172a';
    rCtx.font = 'bold 30px "Segoe UI", Roboto, monospace';
    rCtx.textAlign = 'center';

    for (let i = 0; i <= 100; i++) {
      const x = 48 + (i / 100) * 1952;
      const isTen = i % 10 === 0;
      const isFive = i % 5 === 0;
      const tickH = isTen ? 88 : isFive ? 58 : 34;
      rCtx.lineWidth = isTen ? 5.5 : isFive ? 3.2 : 1.8;
      rCtx.beginPath();
      rCtx.moveTo(x, 0);
      rCtx.lineTo(x, tickH);
      rCtx.stroke();
      if (isTen) rCtx.fillText(String(i), x, 124);
    }
    rCtx.font = 'bold 34px "Segoe UI", sans-serif';
    rCtx.fillText('THƯỚC THÉP ĐO CHIỀU DÀI CHUẨN (0 - 100 cm | ĐCNN: 1 cm)', 1024, 214);

    const rulerTex = new THREE.CanvasTexture(rCanvas);
    rulerTex.anisotropy = 4;

    const rulerGroup = new THREE.Group();
    const rulerBody = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.12, 0.95),
      new THREE.MeshStandardMaterial({ map: rulerTex, metalness: 0.65, roughness: 0.25 })
    );
    rulerBody.position.set(-1.35, -0.39, 1.35);

    const zeroStopper = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.48, 1.15),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8, roughness: 0.2 })
    );
    zeroStopper.position.set(-4.82, -0.22, 1.35);
    rulerGroup.add(rulerBody, zeroStopper);
    group.add(rulerGroup);

    const boxSample = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.56, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.78, roughness: 0.2 })
    );
    const cylSample = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1, 36),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.18 })
    );
    cylSample.rotation.z = Math.PI / 2;
    cylSample.visible = false;
    group.add(boxSample, cylSample);

    const pointer = new THREE.Group();
    const coneMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.2 })
    );
    coneMesh.rotation.x = Math.PI;
    const pointerBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.18, 1.02),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 })
    );
    pointerBracket.position.y = -0.35;
    pointer.add(coneMesh, pointerBracket);
    group.add(pointer);

    S.lblLength = createText3D('L = 25 cm', 2.4, 0.42, { color: '#38bdf8', border: '#38bdf8', fontSize: 66 });
    S.lblLength.position.set(-2.5, 0.68, 0.55);
    group.add(S.lblLength);

    const SX = 3.55;
    const scaleGroup = new THREE.Group();

    const scaleHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.32, 0.42, 40),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.65, roughness: 0.22 })
    );
    scaleHousing.position.set(SX, -0.24, 0.15);

    const scaleTrimRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.045, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 })
    );
    scaleTrimRing.rotation.x = Math.PI / 2;
    scaleTrimRing.position.set(SX, -0.05, 0.15);

    const frontConsole = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.34, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 })
    );
    frontConsole.position.set(SX, -0.26, 1.18);
    frontConsole.rotation.x = -0.25;

    S.scaleLcd = createText3D('150 g', 1.65, 0.28, {
      color: '#4ade80',
      border: '#10b981',
      bg: 'rgba(2, 24, 18, 0.96)',
      fontSize: 74
    });
    S.scaleLcd.position.set(SX, -0.23, 1.42);
    S.scaleLcd.rotation.x = -0.25;

    const scaleShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.28, 24),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.15 })
    );
    scaleShaft.position.set(SX, 0.08, 0.15);

    scaleGroup.add(scaleHousing, scaleTrimRing, frontConsole, S.scaleLcd, scaleShaft);
    group.add(scaleGroup);

    const scalePan = new THREE.Group();
    scalePan.position.set(SX, 0.24, 0.15);
    const panPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 0.94, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.92, roughness: 0.12 })
    );
    const panLip = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.038, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.1 })
    );
    panLip.rotation.x = Math.PI / 2;
    panLip.position.y = 0.04;
    scalePan.add(panPlate, panLip);

    const weightOnScale = new THREE.Group();
    weightOnScale.position.set(SX, 0.55, 0.15);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.18 });
    const wBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.32, 32), brassMat);
    const wGroove = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 32), brassMat);
    wGroove.position.y = 0.22;
    const wTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.22, 32), brassMat);
    wTop.position.y = 0.38;
    const wKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.18, 24), brassMat);
    wKnob.position.y = 0.56;
    weightOnScale.add(wBottom, wGroove, wTop, wKnob);
    group.add(scalePan, weightOnScale);

    S.lblMass = createText3D('m = 150 g', 2.3, 0.42, { color: '#fbbf24', border: '#f59e0b', fontSize: 66 });
    S.lblMass.position.set(SX, 1.75, 0.15);
    group.add(S.lblMass);

    const CX = -0.35;
    const CY = 1.45;
    const CZ = -0.85;
    const clockGroup = new THREE.Group();

    const cCanvas = document.createElement('canvas');
    cCanvas.width = 1024;
    cCanvas.height = 1024;
    const cCtx = cCanvas.getContext('2d');
    const cGrad = cCtx.createRadialGradient(512, 512, 40, 512, 512, 490);
    cGrad.addColorStop(0, '#ffffff');
    cGrad.addColorStop(0.85, '#f1f5f9');
    cGrad.addColorStop(1, '#cbd5e1');
    cCtx.fillStyle = cGrad;
    cCtx.beginPath();
    cCtx.arc(512, 512, 490, 0, Math.PI * 2);
    cCtx.fill();

    cCtx.strokeStyle = '#94a3b8';
    cCtx.lineWidth = 4;
    cCtx.beginPath();
    cCtx.arc(512, 330, 110, 0, Math.PI * 2);
    cCtx.stroke();

    cCtx.strokeStyle = '#0f172a';
    cCtx.fillStyle = '#0f172a';
    cCtx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
    cCtx.textAlign = 'center';
    cCtx.textBaseline = 'middle';
    for (let s = 0; s < 60; s++) {
      const ang = (s / 60) * Math.PI * 2 - Math.PI / 2;
      const isFive = s % 5 === 0;
      const rOut = 468;
      const rIn = isFive ? 408 : 438;
      cCtx.lineWidth = isFive ? 10 : 4;
      cCtx.beginPath();
      cCtx.moveTo(512 + Math.cos(ang) * rIn, 512 + Math.sin(ang) * rIn);
      cCtx.lineTo(512 + Math.cos(ang) * rOut, 512 + Math.sin(ang) * rOut);
      cCtx.stroke();
      if (isFive) {
        const num = s === 0 ? 60 : s;
        cCtx.fillText(String(num), 512 + Math.cos(ang) * 345, 512 + Math.sin(ang) * 345);
      }
    }
    cCtx.fillStyle = '#0284c7';
    cCtx.font = 'bold 36px "Segoe UI", sans-serif';
    cCtx.fillText('CHRONOMETER 1/10s', 512, 680);

    const clockTex = new THREE.CanvasTexture(cCanvas);
    clockTex.anisotropy = 4;

    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.16 });
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.78, roughness: 0.2 });

    const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.78, 0.14, 32), chromeMat);
    standBase.position.set(CX, -0.38, CZ);
    const standPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.85, 24), chromeMat);
    standPillar.position.set(CX, 0.05, CZ);

    const caseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.18, 0.28, 64),
      [chromeMat, new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.2 }), chromeMat]
    );
    caseMesh.rotation.x = Math.PI / 2;
    caseMesh.position.set(CX, CY, CZ);

    const bezelRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.1, 24, 64), bezelMat);
    bezelRing.position.set(CX, CY, CZ + 0.12);

    const glassDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.16, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.22),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 1.0
      })
    );
    glassDome.rotation.x = Math.PI / 2;
    glassDome.position.set(CX, CY, CZ - 0.92);

    const crownStem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 16), chromeMat);
    crownStem.position.set(CX, CY + 1.32, CZ);
    const crownCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 24), chromeMat);
    crownCap.position.set(CX, CY + 1.46, CZ);

    const pusherStart = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.28, 20),
      new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.6, roughness: 0.25 })
    );
    pusherStart.position.set(CX + 0.72, CY + 1.12, CZ);
    pusherStart.rotation.z = -0.52;

    const pusherReset = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.28, 20),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.6, roughness: 0.25 })
    );
    pusherReset.position.set(CX - 0.72, CY + 1.12, CZ);
    pusherReset.rotation.z = 0.52;

    const handGroup = new THREE.Group();
    handGroup.position.set(CX, CY, CZ + 0.16);
    const handNeedle = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.88, 0.025),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 0.4 })
    );
    handNeedle.position.y = 0.34;
    const handPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.15 })
    );
    handPin.rotation.x = Math.PI / 2;
    handGroup.add(handNeedle, handPin);

    clockGroup.add(standBase, standPillar, caseMesh, bezelRing, glassDome, crownStem, crownCap, pusherStart, pusherReset, handGroup);
    group.add(clockGroup);

    S.lblTime = createText3D('t = 0.0 s / 10 s', 2.6, 0.42, { color: '#34d399', border: '#10b981', fontSize: 66 });
    S.lblTime.position.set(CX, 2.98, CZ + 0.2);
    group.add(S.lblTime);

    enableGroupShadows(group);

    S.boxSample = boxSample;
    S.cylSample = cylSample;
    S.pointer = pointer;
    S.scalePan = scalePan;
    S.weightOnScale = weightOnScale;
    S.handGroup = handGroup;
    S.elapsed = 0;
    S.startX = -4.77;
  }

  // BÀI 6-2: BIẾN DẠNG LÒ XO (ĐỊNH LUẬT HOOKE)
  function build62(group, S) {
    addLocalPbrLights(group);
    const bench = createLabBench(10.8, 5.2, -1.25);
    group.add(bench);

    S.panel = buildPanel6(group, 2, 4.28, -2.1);

    const standGroup = new THREE.Group();
    const steelDarkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.25 });
    const inoxBrightMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.92, roughness: 0.14 });

    const standBase = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.24, 2.6), steelDarkMat);
    standBase.position.set(-0.3, -1.13, 0);

    const rodCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.24, 24), inoxBrightMat);
    rodCollar.position.set(-1.55, -0.92, 0);

    const standRod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.45, 28), inoxBrightMat);
    standRod.position.set(-1.55, 1.2, 0);

    const bosshead = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.38, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.7, roughness: 0.22 })
    );
    bosshead.position.set(-1.55, 3.2, 0);

    const standArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.85, 24), inoxBrightMat);
    standArm.rotation.z = Math.PI / 2;
    standArm.position.set(-0.68, 3.2, 0);

    const topHook = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 14, 28), inoxBrightMat);
    topHook.position.set(0, 3.1, 0);

    standGroup.add(standBase, rodCollar, standRod, bosshead, standArm, topHook);
    group.add(standGroup);

    const vrCanvas = document.createElement('canvas');
    vrCanvas.width = 256;
    vrCanvas.height = 1024;
    const vrCtx = vrCanvas.getContext('2d');
    vrCtx.fillStyle = '#fef08a';
    vrCtx.fillRect(0, 0, 256, 1024);
    vrCtx.strokeStyle = '#0f172a';
    vrCtx.fillStyle = '#0f172a';
    vrCtx.font = 'bold 30px "Segoe UI", monospace';
    vrCtx.textAlign = 'left';
    for (let i = 0; i <= 40; i++) {
      const y = 32 + (i / 40) * 960;
      const isFive = i % 5 === 0;
      vrCtx.lineWidth = isFive ? 5.5 : 2.2;
      vrCtx.beginPath();
      vrCtx.moveTo(0, y);
      vrCtx.lineTo(isFive ? 96 : 56, y);
      vrCtx.stroke();
      if (isFive) vrCtx.fillText(`${i}cm`, 106, y + 9);
    }
    const vrTex = new THREE.CanvasTexture(vrCanvas);
    vrTex.anisotropy = 4;

    const vRuler = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 3.9, 0.1),
      new THREE.MeshStandardMaterial({ map: vrTex, metalness: 0.4, roughness: 0.3 })
    );
    vRuler.position.set(1.38, 1.15, 0);
    group.add(vRuler);

    const springMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.88,
      roughness: 0.15
    });
    const initGeo = new THREE.TubeGeometry(new HelixCurve6(0.34, 12, 1.2), 220, 0.045, 14, false);
    const springMesh = new THREE.Mesh(initGeo, springMat);
    springMesh.position.set(0, 3.05, 0);
    group.add(springMesh);

    const weightGroup = new THREE.Group();
    const weightMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      metalness: 0.78,
      roughness: 0.22
    });
    const brassRingMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.9,
      roughness: 0.15
    });

    const wBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.32, 36), weightMat);
    wBottom.position.y = -0.18;
    const wWaist = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 32), brassRingMat);
    wWaist.position.y = 0.04;
    const wTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.26, 36), weightMat);
    wTop.position.y = 0.22;
    const wHook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.032, 14, 28), inoxBrightMat);
    wHook.position.y = 0.42;

    const redPointer = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.65, 16),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.45 })
    );
    redPointer.rotation.z = -Math.PI / 2;
    redPointer.position.set(0.68, 0.38, 0);

    weightGroup.add(wBottom, wWaist, wTop, wHook, redPointer);
    group.add(weightGroup);

    const forceArrowDown = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-0.75, 1.5, 0),
      1.1,
      0xef4444,
      0.28,
      0.18
    );
    const forceArrowUp = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-0.75, 1.5, 0),
      1.1,
      0x22c55e,
      0.28,
      0.18
    );
    group.add(forceArrowDown, forceArrowUp);

    S.lblDelta = createText3D('Δl = 0.025 m', 2.45, 0.42, { color: '#ffe27a', border: '#f59e0b', fontSize: 64 });
    S.lblDelta.position.set(2.85, 1.6, 0);
    group.add(S.lblDelta);

    enableGroupShadows(group);

    S.springMesh = springMesh;
    S.weightMesh = weightGroup;
    S.forceArrowDown = forceArrowDown;
    S.forceArrowUp = forceArrowUp;
    S.topY = 3.05;
    S.naturalLen = 1.05;
    S.targetStretch = 0.35;
    S.lastBuiltLen = -1;
    S.oscAmp = 0.28;
    S.oscTime = 0;
  }

  function rebuildSpringGeometry62(S, length, wireRadius) {
    if (!S.springMesh) return;
    if (Math.abs(length - S.lastBuiltLen) < 0.008 && S.lastWireRad === wireRadius) return;
    S.lastBuiltLen = length;
    S.lastWireRad = wireRadius;

    const newGeo = new THREE.TubeGeometry(new HelixCurve6(0.33, 12, length), 180, wireRadius, 12, false);
    if (S.springMesh.geometry) S.springMesh.geometry.dispose();
    S.springMesh.geometry = newGeo;
  }

  // BÀI 6-3: LỰC MA SÁT
  function build63(group, S) {
    addLocalPbrLights(group);
    const bench = createLabBench(13.2, 5.0, -0.45);
    group.add(bench);

    S.panel = buildPanel6(group, 2, 4.25, -2.2);

    const surfaceMat = new THREE.MeshStandardMaterial({
      map: getSurfaceTexture63('wood'),
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.08
    });
    const trackMesh = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.36, 3.0), surfaceMat);
    trackMesh.position.set(0, -0.27, 0);
    group.add(trackMesh);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.2 });
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.14, 0.12), railMat);
    backRail.position.set(0, -0.02, -1.45);
    const frontRail = backRail.clone();
    frontRail.position.set(0, -0.02, 1.45);
    group.add(backRail, frontRail);

    const blockGroup = new THREE.Group();
    blockGroup.position.set(-3.6, 0.35, 0);

    const blockBodyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.78, roughness: 0.22 });
    const blockBaseMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.5, roughness: 0.45 });
    const inoxMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });

    const blockBody = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.68, 1.05), blockBodyMat);
    blockBody.position.y = 0.06;
    const bottomShoe = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.14, 1.08), blockBaseMat);
    bottomShoe.position.y = -0.35;
    const topWeight = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.28, 28), inoxMat);
    topWeight.position.y = 0.54;
    const frontHook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.032, 12, 24), inoxMat);
    frontHook.position.set(0.84, 0, 0);

    const dynamoGroup = new THREE.Group();
    dynamoGroup.position.set(1.85, 0, 0);

    const dynRod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 12), inoxMat);
    dynRod.rotation.z = Math.PI / 2;
    dynRod.position.x = -0.55;

    const dynShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 1.25, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.38, roughness: 0.1 })
    );
    dynShell.rotation.z = Math.PI / 2;

    const dynSpring = new THREE.Mesh(
      new THREE.TubeGeometry(new HelixCurve6(0.1, 8, 0.85), 96, 0.02, 8, false),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.2 })
    );
    dynSpring.rotation.z = Math.PI / 2;
    dynSpring.position.x = -0.38;

    const dynCapR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.7, roughness: 0.25 })
    );
    dynCapR.rotation.z = Math.PI / 2;
    dynCapR.position.x = 0.62;

    const pullRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 12, 24), inoxMat);
    pullRing.position.x = 0.78;

    dynamoGroup.add(dynRod, dynShell, dynSpring, dynCapR, pullRing);
    blockGroup.add(blockBody, bottomShoe, topWeight, frontHook, dynamoGroup);
    group.add(blockGroup);

    const pullArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1.0, 0.35, 0),
      1.8,
      0xef4444,
      0.38,
      0.24
    );
    const fricArrow = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-3.6, -0.02, 0.65),
      1.3,
      0xf97316,
      0.34,
      0.22
    );
    group.add(pullArrow, fricArrow);

    S.lblPullVec = createText3D('F_kéo = 5.0 N', 2.0, 0.38, { color: '#ff8a8a', border: '#ef4444', fontSize: 64 });
    S.lblFricVec = createText3D('F_ms = 1.47 N', 2.0, 0.38, { color: '#fdba74', border: '#f97316', fontSize: 64 });
    group.add(S.lblPullVec, S.lblFricVec);

    const dustParticles = [];
    const dustGeo = new THREE.SphereGeometry(0.055, 8, 8);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 28; i++) {
      const dm = new THREE.Mesh(dustGeo, dustMat);
      dm.visible = false;
      group.add(dm);
      dustParticles.push({
        mesh: dm,
        age: Math.random(),
        vx: -1.5 - Math.random() * 2.2,
        vy: 0.4 + Math.random() * 1.1,
        vz: (Math.random() - 0.5) * 0.9
      });
    }

    enableGroupShadows(group);

    S.surfaceMat = surfaceMat;
    S.blockMesh = blockGroup;
    S.dynSpring = dynSpring;
    S.pullArrow = pullArrow;
    S.fricArrow = fricArrow;
    S.dustParticles = dustParticles;
    S.dustMat = dustMat;
    S.posX = -3.6;
    S.velX = 0;
    S.accX = 0;
    S.isSliding = true;
  }

  // =========================================================================
  // 6. KHỞI TẠO TOÀN BỘ 9 MÔ HÌNH KHỐI 6 & ĐỊNH TUYẾN SANG KHỐI 7, 8, 9
  // =========================================================================
  window.initExperiment = function (expId) {
    if (!initThreeViewport()) return;
    activeExp6Id = expId;
    clearExp6Group();
    renderSubControlToolbar(expId);

    camSpherical.targetRadius = 11.2;
    camSpherical.targetTheta = 0.0;
    camSpherical.targetPhi = 1.15;
    camLookTarget.set(0, 1.0, 0);

    switch (expId) {
      case '6-1':
        build61(exp6Group, exp6State);
        break;
      case '6-2':
        build62(exp6Group, exp6State);
        break;
      case '6-3':
        build63(exp6Group, exp6State);
        break;

      // BÀI 6-4: SỰ CHUYỂN THỂ CỦA CHẤT (RẮN - LỎNG - KHÍ)
      case '6-4': {
        addLocalPbrLights(exp6Group);
        const bench = createLabBench(10.0, 5.2, -1.18);
        exp6Group.add(bench);

        const stoveBase = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 2.8, 0.22, 36),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
        );
        stoveBase.position.set(0, -1.07, 0);

        const heaterMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0284c7,
          emissiveIntensity: 0.45,
          roughness: 0.25
        });
        const heaterMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.4, 0.28, 36), heaterMat);
        heaterMesh.position.set(0, -0.92, 0);
        exp6Group.add(stoveBase, heaterMesh);

        const bCanvas = document.createElement('canvas');
        bCanvas.width = 512;
        bCanvas.height = 512;
        const bCtx = bCanvas.getContext('2d');
        bCtx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
        bCtx.fillStyle = 'rgba(224, 242, 254, 0.9)';
        bCtx.font = 'bold 22px monospace';
        for (let ml = 100; ml <= 500; ml += 100) {
          const y = 440 - ((ml - 100) / 400) * 320;
          bCtx.lineWidth = 4;
          bCtx.beginPath();
          bCtx.moveTo(210, y);
          bCtx.lineTo(270, y);
          bCtx.stroke();
          bCtx.fillText(`${ml}ml`, 280, y + 7);
        }
        const beakerScaleTex = new THREE.CanvasTexture(bCanvas);

        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.24,
          roughness: 0.08,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
        const beakerWall = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 4.0, 48, 1, true), glassMat);
        beakerWall.position.set(0, 1.2, 0);

        const beakerScaleOverlay = new THREE.Mesh(
          new THREE.CylinderGeometry(2.11, 2.11, 3.8, 48, 1, true),
          new THREE.MeshBasicMaterial({ map: beakerScaleTex, transparent: true, side: THREE.DoubleSide })
        );
        beakerScaleOverlay.position.set(0, 1.2, 0);

        const beakerBottom = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.08, 48), glassMat);
        beakerBottom.position.set(0, -0.76, 0);

        const beakerRim = new THREE.Mesh(
          new THREE.TorusGeometry(2.1, 0.07, 16, 48),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd, metalness: 0.3, roughness: 0.2 })
        );
        beakerRim.rotation.x = Math.PI / 2;
        beakerRim.position.set(0, 3.2, 0);

        const thermoGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 4.1, 16),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
        );
        thermoGlass.position.set(1.85, 1.65, 0);
        const thermoBulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.4 })
        );
        thermoBulb.position.set(1.85, -0.42, 0);

        exp6Group.add(beakerWall, beakerScaleOverlay, beakerBottom, beakerRim, thermoGlass, thermoBulb);

        const particles = [];
        const pGeo = new THREE.SphereGeometry(0.165, 20, 20);
        const pMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.18, metalness: 0.25 });

        let idx = 0;
        for (let y = 0; y < 4; y++) {
          for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
              const mesh = new THREE.Mesh(pGeo, pMat);
              const homeX = x * 0.38;
              const homeY = -0.5 + y * 0.38;
              const homeZ = z * 0.38;
              mesh.position.set(homeX, homeY, homeZ);
              mesh.castShadow = true;
              exp6Group.add(mesh);
              particles.push({
                mesh, homeX, homeY, homeZ,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                vz: (Math.random() - 0.5) * 3,
                phase: idx * 0.3
              });
              idx++;
            }
          }
        }

        const lblPhase = createTextSprite('Trạng thái: LỎNG (25°C)', 'rgba(6,14,28,0.94)', '#38bdf8');
        lblPhase.sprite.position.set(0, 4.05, 0);
        exp6Group.add(lblPhase.sprite);

        exp6State = { heaterMat, pMat, particles, lblPhase };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-5: OXYGEN VÀ KHÔNG KHÍ (NÂNG CẤP TƯƠNG TÁC RÕ RỆT CẢ 3 THANH TRƯỢT)
      // -------------------------------------------------------------------
      case '6-5': {
        addLocalPbrLights(exp6Group);
        const bench = createLabBench(10.8, 5.6, -1.25);
        exp6Group.add(bench);

        const panel = buildPanel6(exp6Group, 2, 4.28, -2.2);

        // Chậu thủy tinh chứa nước lớn
        const troughWall = new THREE.Mesh(
          new THREE.CylinderGeometry(3.4, 3.2, 0.95, 48, 1, true),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })
        );
        troughWall.position.set(0, -0.75, 0);
        const troughRim = new THREE.Mesh(
          new THREE.TorusGeometry(3.4, 0.06, 16, 48),
          new THREE.MeshStandardMaterial({ color: 0xe0f2fe, metalness: 0.5, roughness: 0.2 })
        );
        troughRim.rotation.x = Math.PI / 2;
        troughRim.position.set(0, -0.28, 0);
        const troughWaterBase = new THREE.Mesh(
          new THREE.CylinderGeometry(3.28, 3.12, 0.42, 48),
          new THREE.MeshPhysicalMaterial({ color: 0x0284c7, transparent: true, opacity: 0.55, roughness: 0.15, depthWrite: false })
        );
        troughWaterBase.position.set(0, -1.0, 0);
        exp6Group.add(troughWall, troughRim, troughWaterBase);

        // Đế đỡ + Vòng dây mayso kích hoạt nhiệt (Đổi màu theo p3: 20 -> 400°C)
        const candleStand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.68, 0.26, 28),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.25 })
        );
        candleStand.position.set(0, -1.02, 0);

        const igniterMat = new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xea580c,
          emissiveIntensity: 0.5,
          roughness: 0.3,
          metalness: 0.5
        });
        const igniterCoil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 16, 36), igniterMat);
        igniterCoil.rotation.x = Math.PI / 2;
        igniterCoil.position.set(0, -0.86, 0);
        exp6Group.add(candleStand, igniterCoil);

        // Cụm Chất đốt / Nến (Thay đổi kích thước rõ rệt theo p2: 0.5g -> 10g)
        const fuelGroup = new THREE.Group();
        fuelGroup.position.set(0, -0.88, 0);

        const candleBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.28, 1.1, 28),
          new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.3 })
        );
        candleBody.position.y = 0.55;

        // Chén đựng Photpho đỏ / Than trên đỉnh trụ để minh họa lượng chất đốt p2
        const fuelBowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.24, 0.16, 24),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.2 })
        );
        fuelBowl.position.y = 1.12;

        const fuelHeap = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.75 })
        );
        fuelHeap.position.y = 1.16;

        const wick = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12),
          new THREE.MeshStandardMaterial({ color: 0x1e293b })
        );
        wick.position.y = 1.32;
        fuelGroup.add(candleBody, fuelBowl, fuelHeap, wick);
        exp6Group.add(fuelGroup);

        // Ngọn lửa 3 lớp đặt trên đỉnh chất đốt
        const flameGroup = new THREE.Group();
        flameGroup.position.set(0, 0.55, 0);
        const outerFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.62, 20),
          new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.88 })
        );
        const innerFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.11, 0.38, 16),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        const blueCore = new THREE.Mesh(
          new THREE.SphereGeometry(0.085, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 })
        );
        blueCore.position.y = -0.18;
        const flameLight = new THREE.PointLight(0xf97316, 1.6, 7);
        flameGroup.add(outerFlame, innerFlame, blueCore, flameLight);
        exp6Group.add(flameGroup);

        // Cụm Chuông Thủy Tinh (Phóng to / Thu nhỏ trực tiếp theo Thể tích bình chứa p1: 100 -> 2000 ml)
        const bellGroup = new THREE.Group();
        bellGroup.position.set(0, -0.75, 0);

        const bellMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.22,
          roughness: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const bellJar = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 2.5, 48, 1, true), bellMat);
        bellJar.position.set(0, 1.25, 0);
        const bellTop = new THREE.Mesh(new THREE.SphereGeometry(1.45, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
        bellTop.position.set(0, 2.5, 0);
        const bellKnob = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 24, 24),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd, metalness: 0.4, roughness: 0.2 })
        );
        bellKnob.position.set(0, 4.05, 0);
        bellGroup.add(bellJar, bellTop, bellKnob);

        for (let i = 1; i <= 5; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.46, 0.028, 12, 48),
            new THREE.MeshBasicMaterial({ color: i === 1 ? 0xef4444 : 0x94a3b8 })
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(0, i * 0.46, 0);
          bellGroup.add(ring);
        }

        const risingWater = new THREE.Mesh(
          new THREE.CylinderGeometry(1.42, 1.42, 1.0, 48),
          new THREE.MeshPhysicalMaterial({ color: 0x0284c7, transparent: true, opacity: 0.68, roughness: 0.12, depthWrite: false })
        );
        risingWater.position.set(0, 0.08, 0);
        bellGroup.add(risingWater);

        // Các hạt phân tử khí O2 (Đỏ - 21%) và N2 (Xanh lam - 78%) bay trong chuông
        const gasParticles = [];
        const o2Geo = new THREE.SphereGeometry(0.065, 10, 10);
        const o2Mat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const n2Mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });

        for (let i = 0; i < 45; i++) {
          const isO2 = i < 14; // ~21-30% số hạt đại diện cho O2
          const gm = new THREE.Mesh(o2Geo, isO2 ? o2Mat : n2Mat);
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random() * 1.15;
          gm.position.set(Math.cos(ang) * rad, 0.55 + Math.random() * 2.1, Math.sin(ang) * rad);
          bellGroup.add(gm);
          gasParticles.push({
            mesh: gm,
            isO2: isO2,
            vx: (Math.random() - 0.5) * 1.6,
            vy: (Math.random() - 0.5) * 1.2,
            vz: (Math.random() - 0.5) * 1.6
          });
        }

        exp6Group.add(bellGroup);

        // Nhãn nổi hiển thị trực tiếp bên cạnh chuông
        const lblBellVol = createText3D('Bình: 500 ml', 2.2, 0.4, { color: '#38bdf8', border: '#38bdf8', fontSize: 64 });
        lblBellVol.position.set(2.45, 1.4, 0);
        const lblFuelInfo = createText3D('Chất đốt: 2.0 g', 2.3, 0.4, { color: '#fbbf24', border: '#f59e0b', fontSize: 64 });
        lblFuelInfo.position.set(-2.45, 0.4, 0);
        const lblTempInfo = createText3D('Kích hoạt: 100°C', 2.4, 0.4, { color: '#ff8a8a', border: '#ef4444', fontSize: 64 });
        lblTempInfo.position.set(-2.45, -0.45, 0);
        exp6Group.add(lblBellVol, lblFuelInfo, lblTempInfo);

        exp6State = {
          panel, bellGroup, fuelGroup, fuelHeap, igniterMat,
          flameGroup, flameLight, risingWater, gasParticles,
          lblBellVol, lblFuelInfo, lblTempInfo,
          oxygenPct: 21.0, maxBurnableO2: 21.0, waterProgress: 0, isIgnited: true
        };
        break;
      }

      // BÀI 6-6: TÁCH CHẤT (LỌC & CÔ CẠN)
      case '6-6': {
        addLocalPbrLights(exp6Group);
        const bench = createLabBench(12.6, 5.4, -1.25);
        exp6Group.add(bench);

        const filterGroup = new THREE.Group();
        filterGroup.position.set(-2.5, 0.2, 0);

        const standMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75, roughness: 0.28 });
        const fBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 2.2), standMat);
        fBase.position.set(0, -1.38, 0);
        const fRod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.3, 20), standMat);
        fRod.position.set(-1.05, 0.75, 0);
        const fRingArm = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.1), standMat);
        fRingArm.position.set(-0.52, 1.85, 0);
        const fRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.05, 12, 32), standMat);
        fRing.rotation.x = Math.PI / 2;
        fRing.position.set(0, 1.85, 0);
        filterGroup.add(fBase, fRod, fRingArm, fRing);

        const funnelCone = new THREE.Mesh(
          new THREE.ConeGeometry(1.2, 1.6, 36, 1, true),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.42, roughness: 0.1, side: THREE.DoubleSide })
        );
        funnelCone.rotation.x = Math.PI;
        funnelCone.position.y = 2.2;
        const filterPaper = new THREE.Mesh(
          new THREE.ConeGeometry(1.12, 1.45, 36, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7, side: THREE.DoubleSide })
        );
        filterPaper.rotation.x = Math.PI;
        filterPaper.position.y = 2.23;
        const funnelStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 1.1, 20),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.48, roughness: 0.1 })
        );
        funnelStem.position.y = 1.0;
        filterGroup.add(funnelCone, filterPaper, funnelStem);

        const residues = [];
        const resGeo = new THREE.DodecahedronGeometry(0.09);
        const resMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
        for (let i = 0; i < 28; i++) {
          const rMesh = new THREE.Mesh(resGeo, resMat);
          const angle = (i / 28) * Math.PI * 2 * 3;
          const rad = 0.15 + (i / 28) * 0.65;
          rMesh.position.set(Math.cos(angle) * rad, 1.7 + (i / 28) * 0.55, Math.sin(angle) * rad);
          filterGroup.add(rMesh);
          residues.push(rMesh);
        }

        const drops = [];
        const dropGeo = new THREE.SphereGeometry(0.075, 14, 14);
        const dropMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15 });
        for (let i = 0; i < 4; i++) {
          const d = new THREE.Mesh(dropGeo, dropMat);
          d.position.set(0, 0.5 - i * 0.45, 0);
          filterGroup.add(d);
          drops.push(d);
        }

        const collectBeaker = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.1, 1.8, 36, 1, true),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.26, roughness: 0.1, side: THREE.DoubleSide })
        );
        collectBeaker.position.y = -0.5;
        const collectRim = new THREE.Mesh(
          new THREE.TorusGeometry(1.1, 0.04, 12, 36),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd })
        );
        collectRim.rotation.x = Math.PI / 2;
        collectRim.position.y = 0.4;
        const filtrateLiquid = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.05, 0.8, 36),
          new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.68, roughness: 0.12 })
        );
        filtrateLiquid.position.y = -0.95;
        filterGroup.add(collectBeaker, collectRim, filtrateLiquid);
        enableGroupShadows(filterGroup);
        exp6Group.add(filterGroup);

        const evapGroup = new THREE.Group();
        evapGroup.position.set(2.5, 0.2, 0);

        const tripodRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 12, 36), standMat);
        tripodRing.rotation.x = Math.PI / 2;
        tripodRing.position.y = 0.15;
        const wireGauze = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.15, 0.03, 32),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.6 })
        );
        wireGauze.position.y = 0.18;
        evapGroup.add(tripodRing, wireGauze);

        for (let k = 0; k < 3; k++) {
          const ang = (k / 3) * Math.PI * 2;
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.65, 12), standMat);
          leg.position.set(Math.cos(ang) * 0.98, -0.62, Math.sin(ang) * 0.98);
          evapGroup.add(leg);
        }

        const lampBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65, 0.88, 0.85, 28),
          new THREE.MeshPhysicalMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75, roughness: 0.2 })
        );
        lampBody.position.y = -1.02;
        const lampNeck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.22, 0.2, 20),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8 })
        );
        lampNeck.position.y = -0.52;
        const lampFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.25, 0.68, 20),
          new THREE.MeshBasicMaterial({ color: 0xf97316 })
        );
        lampFlame.position.y = -0.15;
        evapGroup.add(lampBody, lampNeck, lampFlame);

        const dishMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1.3, 36, 20, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, side: THREE.DoubleSide })
        );
        dishMesh.position.y = 1.3;
        const saltWater = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 0.5, 0.45, 36),
          new THREE.MeshPhysicalMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.62 })
        );
        saltWater.position.y = 0.45;
        evapGroup.add(dishMesh, saltWater);

        const saltCrystals = [];
        const saltGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
        const saltMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18 });
        for (let i = 0; i < 35; i++) {
          const sc = new THREE.Mesh(saltGeo, saltMat);
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.65;
          sc.position.set(Math.cos(a) * r, 0.22 + Math.random() * 0.1, Math.sin(a) * r);
          sc.rotation.set(Math.random(), Math.random(), Math.random());
          evapGroup.add(sc);
          saltCrystals.push(sc);
        }

        const steamParticles = [];
        const steamGeo = new THREE.SphereGeometry(0.09, 10, 10);
        const steamMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45 });
        for (let i = 0; i < 12; i++) {
          const sp = new THREE.Mesh(steamGeo, steamMat);
          sp.position.set((Math.random() - 0.5) * 1.2, 0.7 + (i / 12) * 1.8, (Math.random() - 0.5) * 1.2);
          evapGroup.add(sp);
          steamParticles.push(sp);
        }
        enableGroupShadows(evapGroup);
        exp6Group.add(evapGroup);

        const lblSep = createTextSprite('Trái: Lọc tách cặn | Phải: Cô cạn kết tinh muối', 'rgba(6,14,28,0.94)', '#38bdf8');
        lblSep.sprite.position.set(0, 4.15, 0);
        exp6Group.add(lblSep.sprite);

        exp6State = { residues, drops, lampFlame, saltCrystals, steamParticles, lblSep };
        break;
      }

      // BÀI 6-7: KÍNH HIỂN VI QUANG HỌC
      case '6-7': {
        addLocalPbrLights(exp6Group);
        const bench = createLabBench(12.2, 5.4, -1.18);
        exp6Group.add(bench);

        const micGroup = new THREE.Group();
        micGroup.position.set(-2.3, -1.0, 0);

        const metalMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.75, roughness: 0.2 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.35 });
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.18 });

        const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 2.7), darkMat);
        const subBase = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 2.1), metalMat);
        subBase.position.set(-0.15, 0.22, 0);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.52), metalMat);
        arm.position.set(-0.7, 1.7, 0);
        const armCurveTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 0.48), metalMat);
        armCurveTop.position.set(-0.25, 3.25, 0);

        const stage = new THREE.Group();
        stage.position.set(0.2, 1.6, 0);
        const stagePlate = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.15, 1.85), darkMat);
        const stageAperture = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.17, 24),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        const clipLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.7), metalMat);
        clipLeft.position.set(-0.45, 0.1, -0.2);
        const clipRight = clipLeft.clone();
        clipRight.position.set(0.45, 0.1, -0.2);
        stage.add(stagePlate, stageAperture, clipLeft, clipRight);

        const slideGlass = new THREE.Group();
        slideGlass.position.set(0.2, 1.7, 0);
        const glassStrip = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.04, 0.48),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.78, roughness: 0.15 })
        );
        const specimenSpot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.05, 20),
          new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.3 })
        );
        slideGlass.add(glassStrip, specimenSpot);

        const turretGroup = new THREE.Group();
        turretGroup.position.set(0.2, 2.55, 0);
        const turretDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.45, 0.22, 32), darkMat);
        turretGroup.add(turretDisc);

        const lensColors = [0xef4444, 0xeab308, 0x3b82f6];
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const objGroup = new THREE.Group();
          const objLen = 0.45 + i * 0.12;
          const objLens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, objLen, 20), metalMat);
          const colorBand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.115, 0.115, 0.08, 20),
            new THREE.MeshStandardMaterial({ color: lensColors[i], roughness: 0.2 })
          );
          colorBand.position.y = -0.05;
          objGroup.add(objLens, colorBand);
          objGroup.position.set(Math.cos(ang) * 0.26, -0.3, Math.sin(ang) * 0.26);
          turretGroup.add(objGroup);
        }

        const bodyTube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 1.3, 28), metalMat);
        bodyTube.position.set(0.2, 3.2, 0);
        const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, 0.85, 24), darkMat);
        eyepiece.position.set(0.45, 3.9, 0);
        eyepiece.rotation.z = -0.35;
        const eyeRim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 12, 24), brassMat);
        eyeRim.rotation.x = Math.PI / 2;
        eyeRim.position.set(0.58, 4.26, 0);
        eyeRim.rotation.y = -0.35;

        const focusKnob = new THREE.Group();
        focusKnob.position.set(-0.7, 1.4, 0);
        const coarseKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.92, 28), darkMat);
        coarseKnob.rotation.x = Math.PI / 2;
        const fineKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.12, 24), brassMat);
        fineKnob.rotation.x = Math.PI / 2;
        focusKnob.add(coarseKnob, fineKnob);

        const illuminatorMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const illuminator = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), illuminatorMat);
        illuminator.position.set(0.2, 0.5, 0);
        const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.28, 24), darkMat);
        lampHousing.position.set(0.2, 0.32, 0);

        micGroup.add(base, subBase, arm, armCurveTop, stage, slideGlass, turretGroup, bodyTube, eyepiece, eyeRim, focusKnob, lampHousing, illuminator);
        enableGroupShadows(micGroup);
        exp6Group.add(micGroup);

        const viewCanvas = document.createElement('canvas');
        viewCanvas.width = 512;
        viewCanvas.height = 512;
        const viewCtx = viewCanvas.getContext('2d');
        const viewTex = new THREE.CanvasTexture(viewCanvas);

        const viewportDisc = new THREE.Mesh(
          new THREE.CircleGeometry(2.15, 64),
          new THREE.MeshBasicMaterial({ map: viewTex })
        );
        viewportDisc.position.set(2.3, 1.35, 0);
        const viewportBack = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.14, 48), darkMat);
        viewportBack.rotation.x = Math.PI / 2;
        viewportBack.position.set(2.3, 1.35, -0.08);
        const viewportRim = new THREE.Mesh(
          new THREE.TorusGeometry(2.18, 0.11, 20, 64),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.75, roughness: 0.2 })
        );
        viewportRim.position.set(2.3, 1.35, 0);
        const viewportStand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.4, 20), metalMat);
        viewportStand.position.set(2.3, -0.5, -0.08);
        exp6Group.add(viewportBack, viewportDisc, viewportRim, viewportStand);

        const lblMic = createTextSprite('Độ phóng đại: 100x | Ảnh RÕ NÉT', 'rgba(6,14,28,0.94)', '#38bdf8');
        lblMic.sprite.position.set(0, 4.15, 0);
        exp6Group.add(lblMic.sprite);

        exp6State = {
          stage, slideGlass, turretGroup, focusKnob, illuminatorMat,
          viewCanvas, viewCtx, viewTex, lblMic, focusOffset: 0
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-8: TẾ BÀO THỰC VẬT & ĐỘNG VẬT (CÓ LÀM SÁNG + MŨI TÊN CHỈ ĐIỂM BỘ PHẬN)
      // -------------------------------------------------------------------
      case '6-8': {
        addLocalPbrLights(exp6Group);
        const bench = createLabBench(10.5, 5.5, -1.1);
        exp6Group.add(bench);

        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.6, 0.35, 36),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
        );
        pedestal.position.set(0, -0.92, 0);
        const pedestalRing = new THREE.Mesh(
          new THREE.TorusGeometry(2.25, 0.04, 12, 48),
          new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        pedestalRing.rotation.x = Math.PI / 2;
        pedestalRing.position.set(0, -0.75, 0);
        const pedestalPillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.35, 1.0, 24),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 })
        );
        pedestalPillar.position.set(0, -0.3, 0);
        exp6Group.add(pedestal, pedestalRing, pedestalPillar);

        const cellGroup = new THREE.Group();
        cellGroup.position.set(0, 0.8, 0);

        // 1. Thành tế bào (Wall)
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x15803d, transparent: true, opacity: 0.52, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false
        });
        const cellWall = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.5, 6), wallMat);
        const wallRimMat = new THREE.MeshStandardMaterial({
          color: 0x166534, transparent: true, opacity: 0.9, roughness: 0.4, side: THREE.DoubleSide
        });
        const wallRimTop = new THREE.Mesh(new THREE.RingGeometry(2.92, 3.2, 6), wallRimMat);
        wallRimTop.rotation.x = -Math.PI / 2;
        wallRimTop.rotation.z = Math.PI / 6;
        wallRimTop.position.y = 0.75;

        // Khung viền Wireframe phát sáng bao quanh thành tế bào khi được chọn
        const wallEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(cellWall.geometry),
          new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.45 })
        );
        cellWall.add(wallEdges);

        // 2. Màng tế bào (Membrane)
        const memMat = new THREE.MeshStandardMaterial({
          color: 0xfacc15, transparent: true, opacity: 0.55, roughness: 0.25, side: THREE.DoubleSide, depthWrite: false
        });
        const cellMembrane = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 1.42, 24), memMat);

        // 3. Tế bào chất (Cytoplasm)
        const cytoMat = new THREE.MeshStandardMaterial({
          color: 0xd9f99d, transparent: true, opacity: 0.65, roughness: 0.3, depthWrite: false
        });
        const cytoplasm = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 1.25, 24), cytoMat);

        // 4. Không bào trung tâm (Vacuole)
        const vacMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8, transparent: true, opacity: 0.85, roughness: 0.15
        });
        const vacuole = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24), vacMat);
        vacuole.scale.set(1.3, 0.65, 0.95);
        vacuole.position.set(-0.65, 0.35, 0.2);

        // 5. Nhân tế bào (Nucleus)
        const nucMat = new THREE.MeshStandardMaterial({
          color: 0x9333ea, transparent: true, opacity: 0.95, roughness: 0.22, metalness: 0.1
        });
        const nucleolusMat = new THREE.MeshStandardMaterial({
          color: 0xf43f5e, transparent: true, opacity: 1.0, emissive: 0x881337, emissiveIntensity: 0.35
        });
        const nucleus = new THREE.Group();
        nucleus.position.set(1.15, 0.45, -0.35);
        const nucSphere = new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 28), nucMat);
        const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), nucleolusMat);
        nucleolus.position.set(0, 0.55, 0);
        nucleus.add(nucSphere, nucleolus);

        // 6. Các hạt Lục lạp (Chloroplasts)
        const chloroplasts = new THREE.Group();
        const chloroMat = new THREE.MeshStandardMaterial({
          color: 0x16a34a, transparent: true, opacity: 0.9, roughness: 0.2
        });
        const granaMat = new THREE.MeshStandardMaterial({
          color: 0xbbf7d0, transparent: true, opacity: 0.95, roughness: 0.3
        });
        [
          [0.3, 0.55, 1.4], [-1.6, 0.55, -1.1], [1.5, 0.55, 1.0],
          [-0.4, 0.55, -1.6], [-1.8, 0.55, 0.9]
        ].forEach(([x, y, z]) => {
          const cGroup = new THREE.Group();
          const cShell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), chloroMat);
          cShell.scale.set(1.4, 0.55, 0.85);
          for (let g = -1; g <= 1; g++) {
            const granaStack = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 12), granaMat);
            granaStack.position.set(g * 0.16, 0, 0);
            cGroup.add(granaStack);
          }
          cGroup.add(cShell);
          cGroup.position.set(x, y, z);
          chloroplasts.add(cGroup);
        });

        // 7. CON TRỎ 3D CHỈ ĐIỂM + VÒNG HÀO QUANG BÁO HIỆU BỘ PHẬN ĐANG ZOOM
        const pointerBeacon = new THREE.Group();
        pointerBeacon.visible = false;

        const beaconRingMat = new THREE.MeshBasicMaterial({
          color: 0xffe27a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
          depthTest: false
        });
        const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 16, 48), beaconRingMat);
        beaconRing.rotation.x = Math.PI / 2;
        beaconRing.renderOrder = 990;

        const beaconArrowMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, depthTest: false });
        const beaconCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.52, 20), beaconArrowMat);
        beaconCone.rotation.x = Math.PI;
        beaconCone.position.y = 0.72;
        beaconCone.renderOrder = 990;

        const beaconStem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 16), beaconArrowMat);
        beaconStem.position.y = 1.15;
        beaconStem.renderOrder = 990;

        const beaconTag = createText3D('▼ BỘ PHẬN ĐANG CHỌN', 2.4, 0.38, {
          color: '#ffe27a',
          border: '#f59e0b',
          fontSize: 64
        });
        beaconTag.position.y = 1.62;

        pointerBeacon.add(beaconRing, beaconCone, beaconStem, beaconTag);
        cellGroup.add(cellWall, wallRimTop, cellMembrane, cytoplasm, vacuole, nucleus, chloroplasts, pointerBeacon);
        exp6Group.add(cellGroup);

        const lblCell = createTextSprite('Mô hình Tế bào 3D - Bấm chú thích bên trái để Zoom', 'rgba(6,14,28,0.94)', '#34d399');
        lblCell.sprite.position.set(0, 3.95, 0);
        exp6Group.add(lblCell.sprite);

        exp6State = {
          cellGroup, wallMat, wallRimMat, wallEdges, memMat, cytoMat, vacMat, nucMat, nucleolusMat, chloroMat, granaMat,
          pointerBeacon, beaconRing, beaconRingMat, beaconArrowMat, beaconTag,
          lblCell, selectedPart: 'all', highlightTime: 0
        };
        break;
      }

      // BÀI 6-9: VI KHUẨN LACTIC (LÊN MEN SỮA CHUA)
      case '6-9': {
        addLocalPbrLights(exp6Group);
        const bench = createLabBench(10.8, 5.8, -0.35);
        exp6Group.add(bench);

        const incubatorPad = new THREE.Mesh(
          new THREE.CylinderGeometry(4.0, 4.2, 0.16, 48),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.3 })
        );
        incubatorPad.position.y = -0.24;

        const petriRim = new THREE.Mesh(
          new THREE.TorusGeometry(3.6, 0.14, 20, 64),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.55, roughness: 0.2 })
        );
        petriRim.rotation.x = Math.PI / 2;
        petriRim.position.y = 0.25;

        const petriWall = new THREE.Mesh(
          new THREE.CylinderGeometry(3.6, 3.6, 0.55, 64, 1, true),
          new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })
        );
        petriWall.position.y = 0.08;

        const yogurtMat = new THREE.MeshStandardMaterial({ color: 0xfefce8, transparent: true, opacity: 0.65, roughness: 0.35 });
        const yogurtMedium = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.55, 0.32, 64), yogurtMat);
        yogurtMedium.position.y = 0.0;
        yogurtMedium.receiveShadow = true;
        exp6Group.add(incubatorPad, petriRim, petriWall, yogurtMedium);

        const bacteriaList = [];
        const rodMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.2, metalness: 0.15 });
        const cocciMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.2, metalness: 0.15 });

        for (let i = 0; i < 60; i++) {
          const isRod = i % 2 === 0;
          const bMesh = new THREE.Group();
          if (isRod) {
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 16), rodMat);
            cyl.rotation.z = Math.PI / 2;
            const capL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), rodMat);
            capL.position.x = -0.18;
            const capR = capL.clone();
            capR.position.x = 0.18;
            bMesh.add(cyl, capL, capR);
          } else {
            for (let k = -1; k <= 1; k++) {
              const sp = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 16), cocciMat);
              sp.position.x = k * 0.165;
              bMesh.add(sp);
            }
          }
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 2.9;
          bMesh.position.set(Math.cos(angle) * radius, 0.25 + Math.random() * 0.3, Math.sin(angle) * radius);
          bMesh.rotation.y = Math.random() * Math.PI * 2;
          exp6Group.add(bMesh);

          bacteriaList.push({
            mesh: bMesh,
            vx: (Math.random() - 0.5) * 1.5,
            vz: (Math.random() - 0.5) * 1.5,
            rotSpeed: (Math.random() - 0.5) * 3
          });
        }

        const lblBac = createTextSprite('Vi khuẩn Lactic chuyển động Brown (40°C)', 'rgba(6,14,28,0.94)', '#f472b6');
        lblBac.sprite.position.set(0, 3.65, 0);
        exp6Group.add(lblBac.sprite);

        exp6State = { yogurtMat, bacteriaList, lblBac };
        break;
      }

      default: {
        const grade = expId.split('-')[0];
        if (grade !== '6') {
          const renderFunc = window['renderGrade' + grade];
          if (typeof renderFunc === 'function') {
            renderFunc(expId, exp6Group, exp6State);
          } else {
            const lblOther = createTextSprite(`Mô hình bài ${expId} (Khối ${grade}) đang được xây dựng...`);
            lblOther.sprite.position.set(0, 1.5, 0);
            exp6Group.add(lblOther.sprite);
          }
        }
        break;
      }
    }

    updateExperiment6Params();
  };

  // =========================================================================
  // 7. CẬP NHẬT SỐ LIỆU & MÔ HÌNH KHI KÉO THANH TRƯỢT (ĐỦ CẢ 9 BÀI 6-1 -> 6-9)
  // =========================================================================
  function updateExperiment6Params() {
    if (!activeExp6Id) return;
    const { p1, p2, p3 } = getSliders();

    switch (activeExp6Id) {
      case '6-1': {
        if (!exp6State.boxSample) break;
        const len3D = (p1 / 100) * 6.8;
        exp6State.boxSample.scale.x = Math.max(0.08, len3D);
        exp6State.boxSample.position.set(exp6State.startX + len3D / 2, -0.15, 0.42);
        exp6State.cylSample.scale.y = Math.max(0.08, len3D);
        exp6State.cylSample.position.set(exp6State.startX + len3D / 2, -0.15, 0.42);
        exp6State.pointer.position.set(exp6State.startX + len3D, 0.08, 1.35);

        const mScale = 0.52 + (p2 / 1000) * 0.95;
        exp6State.weightOnScale.scale.set(mScale, mScale, mScale);
        const sink = (p2 / 1000) * 0.1;
        exp6State.scalePan.position.y = 0.24 - sink;
        exp6State.weightOnScale.position.y = 0.28 - sink + mScale * 0.34;

        updateText3D(exp6State.scaleLcd, `${p2} g`, { color: '#4ade80', border: '#10b981' });
        updateText3D(exp6State.lblLength, `L = ${p1} cm`, { color: '#38bdf8', border: '#38bdf8' });
        updateText3D(exp6State.lblMass, `m = ${p2} g`, { color: '#fbbf24', border: '#f59e0b' });

        if (exp6State.panel) {
          updateText3D(
            exp6State.panel[0],
            `Chiều dài: ${p1} cm | Khối lượng: ${p2} g | Thời gian: ${p3} s`,
            { color: '#7dffb3', border: '#38bdf8' }
          );
          updateText3D(
            exp6State.panel[1],
            `Đồng hồ bấm giờ: ${(exp6State.elapsed || 0).toFixed(1)} s / ${p3} s | Sai số ĐCNN: 1 cm ; 1 g ; 0.1 s`,
            { color: '#ffe27a', border: '#f59e0b' }
          );
        }
        break;
      }

      case '6-2': {
        if (!exp6State.springMesh) break;
        const massKg = p1 / 1000;
        const forceN = massKg * 9.8;
        const deltaLMeters = forceN / p2;
        const deltaLCm = deltaLMeters * 100;

        exp6State.targetStretch = Math.min(2.1, deltaLMeters * 4.2);
        exp6State.wireRadius = 0.032 + (p2 / 100) * 0.025;
        exp6State.oscAmp = Math.min(0.32, 0.08 + deltaLMeters * 0.6);
        exp6State.oscTime = 0;

        const wScale = 0.72 + (p1 / 500) * 0.65;
        exp6State.weightMesh.scale.set(wScale, wScale, wScale);

        const arrowLen = 0.55 + Math.min(1.4, forceN * 0.25);
        exp6State.forceArrowDown.setLength(arrowLen, 0.26, 0.18);
        exp6State.forceArrowUp.setLength(arrowLen, 0.26, 0.18);

        updateText3D(exp6State.lblDelta, `Δl = ${deltaLMeters.toFixed(3)} m (${deltaLCm.toFixed(1)} cm)`);

        if (exp6State.panel) {
          updateText3D(
            exp6State.panel[0],
            `P = F_đh = ${forceN.toFixed(2)} N | Độ cứng k = ${p2} N/m | Độ dãn Δl = ${deltaLMeters.toFixed(3)} m`,
            { color: '#7dffb3', border: '#38bdf8' }
          );
          updateText3D(
            exp6State.panel[1],
            `Khối lượng m = ${p1} g | Độ dãn cm: Δl = ${deltaLCm.toFixed(1)} cm | Tốc độ mô phỏng: ${p3}x`,
            { color: '#ffe27a', border: '#f59e0b' }
          );
        }
        break;
      }

      case '6-3': {
        if (!exp6State.surfaceMat) break;
        let surfName = 'Mặt gỗ vân sồi';
        if (p2 <= 0.2) {
          exp6State.surfaceMat.map = getSurfaceTexture63('ice');
          exp6State.surfaceMat.roughness = 0.1;
          exp6State.surfaceMat.metalness = 0.25;
          exp6State.dustMat.color.setHex(0xe0f2fe);
          surfName = 'Mặt băng bóng loáng';
        } else if (p2 <= 0.5) {
          exp6State.surfaceMat.map = getSurfaceTexture63('wood');
          exp6State.surfaceMat.roughness = 0.5;
          exp6State.surfaceMat.metalness = 0.08;
          exp6State.dustMat.color.setHex(0xfde047);
          surfName = 'Mặt gỗ vân vàng';
        } else {
          exp6State.surfaceMat.map = getSurfaceTexture63('rubber');
          exp6State.surfaceMat.roughness = 0.9;
          exp6State.surfaceMat.metalness = 0.05;
          exp6State.dustMat.color.setHex(0x94a3b8);
          surfName = 'Mặt nhám cao su đen';
        }
        exp6State.surfaceMat.needsUpdate = true;

        const massKg = p1 / 1000;
        const normalP = massKg * 9.8;
        const fSlideMax = p2 * normalP;
        const isMoving = p3 > fSlideMax;
        const fActual = isMoving ? fSlideMax : p3;
        exp6State.accX = isMoving ? (p3 - fSlideMax) / massKg : 0;

        const scaleBlock = 0.78 + (p1 / 2000) * 0.55;
        exp6State.blockMesh.scale.set(scaleBlock, scaleBlock, scaleBlock);
        exp6State.blockMesh.position.y = -0.09 + 0.42 * scaleBlock;

        if (exp6State.dynSpring) {
          exp6State.dynSpring.scale.y = 0.8 + (p3 / 20) * 0.55;
        }

        const pullLen = 0.75 + (p3 / 20) * 2.1;
        const fricLen = 0.65 + (fActual / 20) * 2.1;
        exp6State.pullArrow.setLength(pullLen, 0.36, 0.24);
        exp6State.fricArrow.setLength(fricLen, 0.34, 0.22);

        updateText3D(exp6State.lblPullVec, `F_kéo = ${p3.toFixed(1)} N`);
        updateText3D(exp6State.lblFricVec, `F_ms = ${fActual.toFixed(2)} N`);

        const stateStr = isMoving
          ? `Chuyển động (a = ${exp6State.accX.toFixed(2)} m/s²)`
          : 'Đứng yên (Ma sát nghỉ cân bằng)';

        if (exp6State.panel) {
          updateText3D(
            exp6State.panel[0],
            `Hệ số ma sát μ = ${p2} (${surfName}) | Trọng lượng P = ${normalP.toFixed(2)} N`,
            { color: '#9fe8ff', border: '#38bdf8' }
          );
          updateText3D(
            exp6State.panel[1],
            `F_kéo = ${p3.toFixed(2)} N | F_masát = ${fActual.toFixed(2)} N | Trạng thái: ${stateStr}`,
            isMoving ? { color: '#7dffb3', border: '#10b981' } : { color: '#ffc56b', border: '#f59e0b' }
          );
        }
        break;
      }

      case '6-4': {
        if (!exp6State.particles) break;
        const activeCount = Math.max(15, Math.floor((p2 / 200) * exp6State.particles.length));
        exp6State.particles.forEach((p, i) => {
          p.mesh.visible = i < activeCount;
        });

        if (p1 < 0) {
          exp6State.heaterMat.color.setHex(0x38bdf8);
          exp6State.heaterMat.emissive.setHex(0x0284c7);
          exp6State.pMat.color.setHex(0x7dd3fc);
          updateTextSprite(exp6State.lblPhase, `Thể RẮN (${p1}°C): Dao động tại chỗ sát nhau`, 'rgba(6,14,28,0.94)', '#7dd3fc');
        } else if (p1 < 100) {
          exp6State.heaterMat.color.setHex(0xf59e0b);
          exp6State.heaterMat.emissive.setHex(0xd97706);
          exp6State.pMat.color.setHex(0x0284c7);
          updateTextSprite(exp6State.lblPhase, `Thể LỎNG (${p1}°C): Trượt tự do dưới đáy bình`, 'rgba(6,14,28,0.94)', '#fbbf24');
        } else {
          exp6State.heaterMat.color.setHex(0xef4444);
          exp6State.heaterMat.emissive.setHex(0xdc2626);
          exp6State.pMat.color.setHex(0xe0e7ff);
          updateTextSprite(exp6State.lblPhase, `Thể KHÍ (${p1}°C): Bay hỗn loạn va chạm thành bình`, 'rgba(6,14,28,0.94)', '#f87171');
        }
        break;
      }

      // CẬP NHẬT BÀI 6-5: PHÓNG TO/THU NHỎ CHUÔNG (p1), CHẤT ĐỐT (p2), NHIỆT ĐỘ KÍCH HOẠT (p3) & TỰ CHẠY LẠI PHẢN ỨNG
      case '6-5': {
        if (!exp6State.bellGroup) break;

        // 1. Thay đổi kích thước Chuông thủy tinh theo Thể tích bình chứa p1 (100 -> 2000 ml)
        const vNorm = (p1 - 100) / 1900; // 0 -> 1
        const bellScaleXZ = 0.68 + vNorm * 0.64;
        const bellScaleY = 0.72 + vNorm * 0.36;
        exp6State.bellGroup.scale.set(bellScaleXZ, bellScaleY, bellScaleXZ);

        // 2. Thay đổi kích thước cây nến / chén chất đốt theo Lượng chất đốt p2 (0.5 -> 10 g)
        const fNorm = (p2 - 0.5) / 9.5; // 0 -> 1
        const fuelScaleXZ = 0.65 + fNorm * 0.95;
        const fuelScaleY = 0.65 + fNorm * 0.55;
        exp6State.fuelGroup.scale.set(fuelScaleXZ, fuelScaleY, fuelScaleXZ);
        exp6State.flameGroup.position.y = -0.88 + 1.38 * fuelScaleY;

        // 3. Thay đổi độ rực sáng của vòng kích hoạt nhiệt theo p3 (20 -> 400 °C)
        const tNorm = (p3 - 20) / 380;
        exp6State.isIgnited = p3 >= 80; // Cần tối thiểu 80°C để kích hoạt cháy Photpho/Nến
        if (exp6State.isIgnited) {
          exp6State.igniterMat.color.setHex(0xff5722);
          exp6State.igniterMat.emissive.setHex(0xff3d00);
          exp6State.igniterMat.emissiveIntensity = 0.4 + tNorm * 1.8;
        } else {
          exp6State.igniterMat.color.setHex(0x475569);
          exp6State.igniterMat.emissive.setHex(0x1e293b);
          exp6State.igniterMat.emissiveIntensity = 0.1;
        }

        // 4. Tính lượng O2 tối đa có thể bị đốt cháy theo tỉ lệ hợp thức giữa p2 (g) và p1 (ml)
        // Để đốt cháy hết 21% O2 trong 500ml không khí cần khoảng 0.6g chất đốt
        const requiredFuel = (p1 / 500) * 0.6;
        const burnRatio = Math.min(1.0, p2 / Math.max(0.05, requiredFuel));
        exp6State.maxBurnableO2 = 21.0 * burnRatio;

        // Tự động nạp lại 21% O2 mỗi khi người dùng kéo thanh trượt để quan sát phản ứng mới
        exp6State.oxygenPct = 21.0;
        exp6State.waterProgress = 0;

        // Cập nhật 3 nhãn 3D cạnh mô hình
        updateText3D(exp6State.lblBellVol, `Bình V = ${p1} ml (O2 = ${Math.round(p1 * 0.21)} ml)`);
        updateText3D(
          exp6State.lblFuelInfo,
          `Chất đốt = ${p2} g ${burnRatio < 1 ? '(Thiếu chất đốt)' : '(Đủ/Dư)'}`,
          burnRatio < 1 ? { color: '#fda4af', border: '#f43f5e' } : { color: '#fbbf24', border: '#f59e0b' }
        );
        updateText3D(
          exp6State.lblTempInfo,
          `Kích hoạt: ${p3}°C ${exp6State.isIgnited ? '(Đang cháy)' : '(Chưa cháy)'}`,
          exp6State.isIgnited ? { color: '#7dffb3', border: '#10b981' } : { color: '#fda4af', border: '#f43f5e' }
        );
        exp6State.lblBellVol.position.x = 1.65 * bellScaleXZ + 1.05;

        if (exp6State.panel) {
          updateText3D(
            exp6State.panel[0],
            `Thể tích chuông V = ${p1} ml | Lượng chất đốt = ${p2} g | Nhiệt độ kích hoạt = ${p3}°C`,
            { color: '#9fe8ff', border: '#38bdf8' }
          );
          if (!exp6State.isIgnited) {
            updateText3D(
              exp6State.panel[1],
              `Nhiệt độ ${p3}°C < 80°C: Chưa đủ nhiệt độ kích hoạt phản ứng cháy! (Tăng T ≥ 80°C)`,
              { color: '#fda4af', border: '#f43f5e' }
            );
          } else {
            updateText3D(
              exp6State.panel[1],
              `O2 còn: 21.0% | Đang đốt cháy O2 trong bình ${p1} ml...`,
              { color: '#ffe27a', border: '#f59e0b' }
            );
          }
        }
        break;
      }

      case '6-6': {
        if (!exp6State.residues) break;
        const resVisible = Math.max(3, Math.floor((p2 / 100) * exp6State.residues.length));
        exp6State.residues.forEach((r, i) => { r.visible = i < resVisible; });

        const saltVisible = Math.max(3, Math.floor((p1 / 35) * exp6State.saltCrystals.length));
        exp6State.saltCrystals.forEach((s, i) => { s.visible = i < saltVisible; });
        updateTextSprite(exp6State.lblSep, `Muối kết tinh: ${p1}% | Cặn giữ trên phễu: ${p2}g`, 'rgba(6,14,28,0.94)', '#38bdf8');
        break;
      }

      case '6-7': {
        if (!exp6State.turretGroup) break;
        exp6State.turretGroup.rotation.y = (p1 / 40) * Math.PI * 1.5;
        const bVal = Math.floor((p3 / 100) * 255);
        exp6State.illuminatorMat.color.setRGB(bVal / 255, bVal / 255, (bVal * 0.7) / 255);
        drawMicroscopeViewport6_7();
        break;
      }

      case '6-8': {
        if (!exp6State.cellGroup) break;
        const zoomScale = 0.78 + (p1 / 1000) * 0.58;
        exp6State.cellGroup.scale.set(zoomScale, zoomScale, zoomScale);
        const stainRatio = p2 / 2.0;
        exp6State.nucMat.color.setRGB(0.58 - stainRatio * 0.38, 0.22, 0.95);
        applyCellHighlight6_8(exp6State.selectedPart || 'all');
        break;
      }

      case '6-9': {
        if (!exp6State.bacteriaList) break;
        const tempFactor = Math.max(0.2, 1 - Math.abs(p1 - 40) / 20);
        const countRatio = Math.min(1, (p3 / 20) * 0.5 + (p2 / 24) * 0.5 * tempFactor);
        const visibleBac = Math.max(8, Math.floor(countRatio * exp6State.bacteriaList.length));

        exp6State.bacteriaList.forEach((b, idx) => {
          b.mesh.visible = idx < visibleBac;
        });
        exp6State.yogurtMat.opacity = Math.min(0.88, 0.4 + (p2 / 24) * 0.45);
        updateTextSprite(
          exp6State.lblBac,
          `Ủ ${p1}°C trong ${p2}h | Mật độ VK Lactic: ${visibleBac} tế bào`,
          'rgba(6,14,28,0.94)',
          '#f472b6'
        );
        break;
      }

      default: {
        const grade = activeExp6Id.split('-')[0];
        if (grade !== '6') {
          const updateFunc = window['updateGrade' + grade];
          if (typeof updateFunc === 'function') {
            updateFunc(activeExp6Id, exp6State, p1, p2, p3);
          }
        }
        break;
      }
    }
  }

  // =========================================================================
  // 8. CÁC HÀM TƯƠNG TÁC NÚT BẤM PHỤ TRỢ & LÀM NỔI BẬT BỘ PHẬN TẾ BÀO 6-8
  // =========================================================================
  window.toggleExp6Shape = function (shapeType) {
    if (activeExp6Id !== '6-1' || !exp6State.boxSample) return;
    exp6State.boxSample.visible = shapeType === 'box';
    exp6State.cylSample.visible = shapeType === 'cylinder';
  };

  window.resetStopwatch6_1 = function () {
    if (exp6State) exp6State.elapsed = 0;
  };

  window.setFrictionSurface = function (muVal) {
    const p2Input = document.getElementById('param2');
    const p2Val = document.getElementById('val-param2');
    if (p2Input) p2Input.value = muVal;
    if (p2Val) p2Val.textContent = muVal;
    window.triggerPullBlock6_3();
  };

  window.triggerPullBlock6_3 = function () {
    if (activeExp6Id !== '6-3' || !exp6State.blockMesh) return;
    exp6State.posX = -3.6;
    exp6State.velX = 0;
    exp6State.isSliding = true;
    updateExperiment6Params();
  };

  window.restartCandle6_5 = function () {
    if (activeExp6Id !== '6-5') return;
    exp6State.oxygenPct = 21.0;
    exp6State.waterProgress = 0;
    updateExperiment6Params();
  };

  window.setExp6_6Mode = function (mode) {
    if (!camLookTarget) return;
    if (mode === 'filter') {
      camLookTarget.set(-2.5, 0.8, 0);
      camSpherical.targetRadius = 6.5;
    } else if (mode === 'evap') {
      camLookTarget.set(2.5, 0.6, 0);
      camSpherical.targetRadius = 6.5;
    } else {
      camLookTarget.set(0, 1.0, 0);
      camSpherical.targetRadius = 11.2;
    }
  };

  window.onFocusKnobChange6_7 = function (val) {
    if (activeExp6Id !== '6-7') return;
    exp6State.focusOffset = parseFloat(val);
    if (exp6State.focusKnob) exp6State.focusKnob.rotation.x = exp6State.focusOffset * 0.6;
    if (exp6State.stage && exp6State.slideGlass) {
      exp6State.stage.position.y = 1.6 + exp6State.focusOffset * 0.025;
      exp6State.slideGlass.position.y = 1.7 + exp6State.focusOffset * 0.025;
    }
    drawMicroscopeViewport6_7();
  };

  function drawMicroscopeViewport6_7() {
    if (!exp6State.viewCtx) return;
    const { p1, p2, p3 } = getSliders();
    const ctx = exp6State.viewCtx;
    const blurPx = Math.abs(exp6State.focusOffset || 0) * 1.4;
    const mag = Math.max(20, (p1 || 10) * (p2 || 10));
    const brightness = (p3 || 50) / 100;

    ctx.save();
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = `rgb(${Math.floor(220 * brightness)}, ${Math.floor(245 * brightness)}, ${Math.floor(230 * brightness)})`;
    ctx.fillRect(0, 0, 512, 512);

    const cellW = Math.max(42, (mag / 100) * 55);
    const cellH = cellW * 0.62;
    const alpha = Math.max(0.15, (1 - blurPx / 18) * brightness);
    ctx.strokeStyle = `rgba(21, 128, 61, ${alpha})`;
    ctx.lineWidth = blurPx > 1.5 ? 6 : 3.5;

    for (let y = -cellH; y < 512 + cellH; y += cellH) {
      for (let x = -cellW; x < 512 + cellW; x += cellW) {
        const offsetX = (Math.floor(y / cellH) % 2) * (cellW / 2);
        ctx.fillStyle = `rgba(134, 239, 172, ${0.45 * alpha})`;
        roundedRectPath(ctx, x + offsetX, y, cellW - 4, cellH - 4, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = `rgba(126, 34, 206, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x + offsetX + cellW * 0.5, y + cellH * 0.5, Math.max(4, cellW * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(256, 256, 247, 0, Math.PI * 2);
    ctx.stroke();

    exp6State.viewTex.needsUpdate = true;
    const statusText = blurPx < 0.8 ? 'Ảnh RÕ NÉT' : `Ảnh ĐANG MỜ (Lệch ${blurPx.toFixed(1)})`;
    updateTextSprite(exp6State.lblMic, `Độ phóng đại: ${mag}x | ${statusText}`, 'rgba(6,14,28,0.94)', '#38bdf8');
  }

  // Hàm xử lý làm mờ các bộ phận phụ & làm sáng rực + gắn mũi tên chỉ điểm vào bộ phận đang chọn ở Bài 6-8
  function applyCellHighlight6_8(part) {
    const S = exp6State;
    if (!S || !S.cellGroup) return;
    const { p3 } = getSliders();
    const contrast = (p3 || 5) / 10;

    // Đặt toàn bộ emissive về mặc định trước
    [S.wallMat, S.wallRimMat, S.memMat, S.cytoMat, S.vacMat, S.nucMat, S.chloroMat].forEach((m) => {
      if (m) {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    });

    if (part === 'all') {
      S.wallMat.opacity = 0.52;
      S.wallRimMat.opacity = 0.9;
      S.wallEdges.material.opacity = 0.45;
      S.memMat.opacity = 0.55;
      S.cytoMat.opacity = Math.min(0.85, 0.4 + contrast * 0.45);
      S.vacMat.opacity = 0.85;
      S.nucMat.opacity = 0.95;
      S.nucleolusMat.opacity = 1.0;
      S.chloroMat.opacity = 0.9;
      S.granaMat.opacity = 0.95;
      if (S.pointerBeacon) S.pointerBeacon.visible = false;
      return;
    }

    // Khi chọn 1 bộ phận cụ thể: Làm mờ tất cả bộ phận khác xuống 0.12 để nhìn xuyên thấu rõ ràng
    S.wallMat.opacity = part === 'wall' ? 0.88 : 0.1;
    S.wallRimMat.opacity = part === 'wall' ? 1.0 : 0.15;
    S.wallEdges.material.opacity = part === 'wall' ? 1.0 : 0.15;
    S.memMat.opacity = part === 'membrane' ? 0.92 : 0.1;
    S.cytoMat.opacity = part === 'cytoplasm' ? 0.85 : 0.12;
    S.vacMat.opacity = part === 'vacuole' ? 0.98 : 0.14;
    S.nucMat.opacity = part === 'nucleus' ? 1.0 : 0.14;
    S.nucleolusMat.opacity = part === 'nucleus' ? 1.0 : 0.18;
    S.chloroMat.opacity = part === 'chloroplast' ? 1.0 : 0.14;
    S.granaMat.opacity = part === 'chloroplast' ? 1.0 : 0.15;

    // Cấu hình vị trí Mũi tên chỉ điểm 3D & màu phát sáng cho từng bộ phận
    const beaconCfg = {
      wall: { pos: [0, 0.78, 2.95], ringScale: 1.1, col: 0x4ade80, hex: '#4ade80', label: '▼ THÀNH TẾ BÀO' },
      membrane: { pos: [2.45, 0.72, 1.45], ringScale: 0.95, col: 0xfacc15, hex: '#facc15', label: '▼ MÀNG TẾ BÀO' },
      cytoplasm: { pos: [0.1, 0.65, 0.2], ringScale: 1.35, col: 0xa3e635, hex: '#a3e635', label: '▼ TẾ BÀO CHẤT' },
      nucleus: { pos: [1.15, 0.95, -0.35], ringScale: 1.3, col: 0xc084fc, hex: '#c084fc', label: '▼ NHÂN TẾ BÀO' },
      chloroplast: { pos: [0.3, 0.68, 1.4], ringScale: 0.82, col: 0x22c55e, hex: '#4ade80', label: '▼ LỤC LẠP' },
      vacuole: { pos: [-0.65, 0.82, 0.2], ringScale: 1.65, col: 0x38bdf8, hex: '#38bdf8', label: '▼ KHÔNG BÀO LỚN' }
    };

    const cfg = beaconCfg[part];
    if (cfg && S.pointerBeacon) {
      S.pointerBeacon.visible = true;
      S.pointerBeacon.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      S.beaconRing.scale.setScalar(cfg.ringScale);
      S.beaconRingMat.color.setHex(cfg.col);
      S.beaconArrowMat.color.setHex(cfg.col);
      updateText3D(S.beaconTag, cfg.label, { color: cfg.hex, border: cfg.hex });
    }
  }

  window.zoomCellPart6_8 = function (part) {
    if (activeExp6Id !== '6-8' || !camLookTarget) return;
    exp6State.selectedPart = part;
    exp6State.highlightTime = 0;

    // Làm nổi bật nút đang bấm trên giao diện bên trái
    ['all', 'wall', 'membrane', 'cytoplasm', 'nucleus', 'chloroplast', 'vacuole'].forEach((k) => {
      const btn = document.getElementById('btn-cell-' + k);
      if (btn) {
        if (k === part) {
          btn.classList.add('ring-2', 'ring-white', 'font-bold');
        } else {
          btn.classList.remove('ring-2', 'ring-white', 'font-bold');
        }
      }
    });

    const targets = {
      all: { look: [0, 0.8, 0], r: 10.5, theta: 0.0, phi: 1.05, text: 'Toàn cảnh Tế bào Thực vật 3D' },
      wall: { look: [0, 0.9, 2.6], r: 5.2, theta: 0.0, phi: 1.15, text: 'Thành tế bào: Quy định hình dạng & bảo vệ tế bào' },
      membrane: { look: [2.1, 0.9, 1.3], r: 5.0, theta: 0.75, phi: 1.08, text: 'Màng tế bào: Kiểm soát trao đổi chất ra vào tế bào' },
      cytoplasm: { look: [0.1, 0.9, 0.2], r: 5.0, theta: 0.15, phi: 0.82, text: 'Tế bào chất: Dịch keo chứa các bào quan & diễn ra trao đổi chất' },
      nucleus: { look: [1.15, 1.25, -0.35], r: 4.3, theta: 0.45, phi: 0.95, text: 'Nhân tế bào: Chứa NST, điều khiển mọi hoạt động sống' },
      chloroplast: { look: [0.3, 1.25, 1.4], r: 4.1, theta: 0.15, phi: 0.98, text: 'Lục lạp: Chứa diệp lục hấp thụ ánh sáng để Quang hợp' },
      vacuole: { look: [-0.65, 1.2, 0.2], r: 4.6, theta: -0.45, phi: 0.92, text: 'Không bào trung tâm: Chứa dịch tế bào & duy trì áp suất thẩm thấu' }
    };
    const t = targets[part] || targets.all;
    camLookTarget.set(...t.look);
    camSpherical.targetRadius = t.r;
    camSpherical.targetTheta = t.theta;
    camSpherical.targetPhi = t.phi;
    updateTextSprite(exp6State.lblCell, t.text, 'rgba(6,14,28,0.94)', '#34d399');

    applyCellHighlight6_8(part);
  };

  // =========================================================================
  // 9. VÒNG LẶP HOẠT ẢNH 3D THỜI GIAN THỰC (CÓ ĐỦ CASE 6-1 -> 6-9)
  // =========================================================================
  function animateGrade6Step(expId, S, dt, p1, p2, p3) {
    switch (expId) {
      case '6-1': {
        if (S.handGroup) {
          S.elapsed = (S.elapsed + dt) % Math.max(1, p3);
          S.handGroup.rotation.z = -(S.elapsed / 60) * Math.PI * 2;
          updateText3D(S.lblTime, `t = ${S.elapsed.toFixed(1)} s / ${p3} s`);
          if (S.panel && S.panel[1]) {
            updateText3D(
              S.panel[1],
              `Đồng hồ bấm giờ: ${S.elapsed.toFixed(1)} s / ${p3} s | Sai số ĐCNN: 1 cm ; 1 g ; 0.1 s`
            );
          }
        }
        break;
      }

      case '6-2': {
        if (!S.springMesh) break;
        S.oscTime += dt * p3 * 3.2;
        const omega = Math.sqrt(p2 / (p1 / 1000)) * 0.35;
        const damping = Math.exp(-0.5 * S.oscTime);
        const currentStretch = S.targetStretch + S.oscAmp * damping * Math.cos(omega * S.oscTime);
        const totalLen = Math.max(0.45, S.naturalLen + currentStretch);

        rebuildSpringGeometry62(S, totalLen, S.wireRadius || 0.042);

        const bottomY = S.topY - totalLen;
        if (S.weightMesh) {
          S.weightMesh.position.set(0, bottomY - 0.38, 0);
        }
        if (S.forceArrowDown && S.forceArrowUp) {
          S.forceArrowDown.position.set(-0.78, bottomY - 0.35, 0);
          S.forceArrowUp.position.set(-0.78, bottomY + 0.05, 0);
        }
        if (S.lblDelta) {
          S.lblDelta.position.y = Math.max(0.2, bottomY);
        }
        break;
      }

      case '6-3': {
        if (!S.blockMesh) break;
        const scaleBlock = S.blockMesh.scale.x || 1;
        const isMoving = S.isSliding && S.accX > 0;

        if (isMoving) {
          S.velX += S.accX * dt;
          S.posX += S.velX * dt;
          if (S.posX > 3.6) {
            S.posX = -3.6;
            S.velX = 0;
          }
        } else {
          S.velX = 0;
        }

        S.blockMesh.position.x = S.posX;
        const pullOriginX = S.posX + 2.55 * scaleBlock;
        S.pullArrow.position.set(pullOriginX, S.blockMesh.position.y, 0);
        S.fricArrow.position.set(S.posX, -0.04, 0.72);

        if (S.lblPullVec) S.lblPullVec.position.set(pullOriginX + 1.1, S.blockMesh.position.y + 0.52, 0);
        if (S.lblFricVec) S.lblFricVec.position.set(S.posX - 1.1, 0.45, 0.75);

        if (S.dustParticles) {
          S.dustParticles.forEach((d) => {
            if (!isMoving) {
              d.mesh.visible = false;
              return;
            }
            d.mesh.visible = true;
            d.age += dt * (1.4 + Math.min(S.velX * 0.4, 2.5));
            if (d.age > 1) {
              d.age = 0;
              d.mesh.position.set(S.posX - 0.75 * scaleBlock, -0.05, (Math.random() - 0.5) * 0.7);
            } else {
              d.mesh.position.x += d.vx * dt;
              d.mesh.position.y += (d.vy - d.age * 1.6) * dt;
              d.mesh.position.z += d.vz * dt;
              d.mesh.scale.setScalar(1.2 - d.age * 0.8);
            }
          });
        }
        break;
      }

      case '6-4': {
        if (!S.particles) break;
        const speed = p3;
        const time = vClock.getElapsedTime();

        S.particles.forEach((p) => {
          if (!p.mesh.visible) return;
          if (p1 < 0) {
            const vib = 0.03 * speed;
            p.mesh.position.set(
              p.homeX + Math.sin(time * 18 + p.phase) * vib,
              p.homeY + Math.cos(time * 16 + p.phase) * vib,
              p.homeZ + Math.sin(time * 20 + p.phase) * vib
            );
          } else if (p1 < 100) {
            const vScale = (0.4 + (p1 / 100) * 1.2) * speed;
            p.mesh.position.x += p.vx * dt * vScale;
            p.mesh.position.y += p.vy * dt * vScale * 0.5;
            p.mesh.position.z += p.vz * dt * vScale;

            const r = Math.hypot(p.mesh.position.x, p.mesh.position.z);
            if (r > 1.75) {
              p.vx *= -1;
              p.vz *= -1;
              p.mesh.position.x *= 1.74 / r;
              p.mesh.position.z *= 1.74 / r;
            }
            if (p.mesh.position.y < -0.65 || p.mesh.position.y > 0.85) {
              p.vy *= -1;
              p.mesh.position.y = Math.max(-0.65, Math.min(0.85, p.mesh.position.y));
            }
          } else {
            const vGas = 2.6 * speed;
            p.mesh.position.x += p.vx * dt * vGas;
            p.mesh.position.y += p.vy * dt * vGas;
            p.mesh.position.z += p.vz * dt * vGas;

            const r = Math.hypot(p.mesh.position.x, p.mesh.position.z);
            if (r > 1.8) {
              p.vx *= -1;
              p.vz *= -1;
              p.mesh.position.x *= 1.78 / r;
              p.mesh.position.z *= 1.78 / r;
            }
            if (p.mesh.position.y < -0.65 || p.mesh.position.y > 2.9) {
              p.vy *= -1;
              p.mesh.position.y = Math.max(-0.65, Math.min(2.9, p.mesh.position.y));
            }
          }
        });
        break;
      }

      // HOẠT ẢNH BÀI 6-5: TỐC ĐỘ CHÁY PHỤ THUỘC CẢ V (p1), m_chất_đốt (p2), T_kích_hoạt (p3) & HẠT KHÍ O2/N2
      case '6-5': {
        if (!S.flameGroup) break;
        const targetFloorO2 = Math.max(0, 21.0 - (S.maxBurnableO2 !== undefined ? S.maxBurnableO2 : 21.0));

        if (!S.isIgnited) {
          // Chưa đủ nhiệt độ kích hoạt (< 80°C) -> Không cháy
          S.flameGroup.visible = false;
          S.flameLight.intensity = 0;
        } else if (S.oxygenPct > targetFloorO2 + 0.02) {
          // Tốc độ tiêu thụ O2 tỉ lệ thuận với Lượng chất đốt p2, Nhiệt độ p3 và tỉ lệ nghịch với Thể tích bình p1
          const tempSpeedFactor = 0.6 + ((p3 - 80) / 320) * 1.8;
          const burnRate = (p2 / Math.max(0.25, p1 / 500)) * 2.4 * tempSpeedFactor;

          S.oxygenPct = Math.max(targetFloorO2, S.oxygenPct - burnRate * dt);
          S.waterProgress = (21.0 - S.oxygenPct) / 21.0;

          const o2Fraction = S.oxygenPct / 21.0;
          const fuelVisualBoost = 0.75 + Math.min(p2 / 10, 1.0) * 0.65;
          const flameScale = Math.max(0.08, o2Fraction * fuelVisualBoost);

          S.flameGroup.visible = true;
          S.flameGroup.scale.set(
            flameScale * (0.94 + Math.random() * 0.12),
            flameScale * (0.9 + Math.random() * 0.22),
            flameScale
          );
          S.flameLight.intensity = flameScale * 1.8;
        } else {
          S.flameGroup.visible = false;
          S.flameLight.intensity = 0;
        }

        // Cột nước dâng lên trong chuông tương ứng với lượng O2 đã phản ứng
        const waterH = 0.08 + S.waterProgress * 0.46;
        S.risingWater.scale.y = waterH;
        S.risingWater.position.y = waterH / 2;

        // Chuyển động của các hạt phân tử khí O2 (Đỏ - giảm dần khi cháy) và N2 (Xanh - giữ nguyên)
        if (S.gasParticles) {
          const o2KeepRatio = S.oxygenPct / 21.0;
          let o2Idx = 0;
          const totalO2 = 14;
          const speedGas = 0.6 + (p3 / 400) * 1.4;

          S.gasParticles.forEach((gp) => {
            if (gp.isO2) {
              gp.mesh.visible = o2Idx < Math.ceil(o2KeepRatio * totalO2);
              o2Idx++;
            }
            if (!gp.mesh.visible) return;

            gp.mesh.position.x += gp.vx * dt * speedGas;
            gp.mesh.position.y += gp.vy * dt * speedGas;
            gp.mesh.position.z += gp.vz * dt * speedGas;

            const r = Math.hypot(gp.mesh.position.x, gp.mesh.position.z);
            if (r > 1.22) {
              gp.vx *= -1;
              gp.vz *= -1;
              gp.mesh.position.x *= 1.2 / r;
              gp.mesh.position.z *= 1.2 / r;
            }
            const minY = waterH + 0.12;
            if (gp.mesh.position.y < minY || gp.mesh.position.y > 2.65) {
              gp.vy *= -1;
              gp.mesh.position.y = Math.max(minY, Math.min(2.65, gp.mesh.position.y));
            }
          });
        }

        if (S.panel && S.panel[1]) {
          let status;
          if (!S.isIgnited) {
            status = `Nhiệt độ ${p3}°C < 80°C: Chưa đủ nhiệt độ kích hoạt cháy! (Tăng T ≥ 80°C)`;
          } else if (S.oxygenPct > targetFloorO2 + 0.02) {
            status = `O2 còn: ${S.oxygenPct.toFixed(1)}% | Đang cháy mạnh (Nước dâng: ${(S.waterProgress * 20).toFixed(1)}% V_bình)`;
          } else if (targetFloorO2 > 0.5) {
            status = `Hết ${p2}g chất đốt! O2 còn dư ${S.oxygenPct.toFixed(1)}% -> Nước chỉ dâng ${(S.waterProgress * 20).toFixed(1)}% (< 1/5 bình)`;
          } else {
            status = `Hết sạch 21% O2 -> Lửa tắt | Nước dâng chạm vạch đỏ = đúng 1/5 (20%) thể tích bình!`;
          }
          updateText3D(S.panel[1], status);
        }
        break;
      }

      case '6-6': {
        if (!S.drops) break;
        const speed = p3;
        S.drops.forEach((d) => {
          d.position.y -= dt * 1.6 * speed;
          if (d.position.y < -0.9) d.position.y = 0.5;
        });
        S.steamParticles.forEach((sp) => {
          sp.position.y += dt * 1.2 * speed;
          if (sp.position.y > 2.6) sp.position.y = 0.6;
        });
        S.lampFlame.scale.y = 0.85 + Math.random() * 0.3;
        break;
      }

      case '6-7': {
        break;
      }

      // HOẠT ẢNH BÀI 6-8: NHẤP NHÁY PHÁT SÁNG BỘ PHẬN ĐANG CHỌN & MŨI TÊN 3D NHẤP NHÔ
      case '6-8': {
        if (!S.cellGroup) break;
        S.highlightTime = (S.highlightTime || 0) + dt * 4.5;
        const pulse = 0.5 + 0.5 * Math.sin(S.highlightTime);

        if (!S.selectedPart || S.selectedPart === 'all') {
          S.cellGroup.rotation.y += dt * 0.12;
        } else {
          // Đưa góc xoay của tế bào mượt mà về 0 để camera và mũi tên 3D khóa chính xác vào bộ phận đang chọn
          S.cellGroup.rotation.y += (0 - S.cellGroup.rotation.y) * Math.min(1, dt * 8);

          // Nhấp nhô mũi tên chỉ điểm & xoay vòng hào quang
          if (S.pointerBeacon && S.pointerBeacon.visible) {
            S.beaconRing.rotation.z += dt * 2.2;
            const sRing = (S.beaconRing.scale.x || 1);
            S.beaconRing.position.y = 0.04 * Math.sin(S.highlightTime * 1.5);
            S.pointerBeacon.children[1].position.y = 0.68 + 0.12 * pulse; // Cone
            S.pointerBeacon.children[2].position.y = 1.11 + 0.12 * pulse; // Stem
            S.beaconTag.position.y = 1.58 + 0.12 * pulse;
            void sRing;
          }

          // Hiệu ứng phát sáng nhấp nháy (Emissive Glow) trực tiếp trên bộ phận đang được chọn
          const glowIntensity = 0.35 + 0.55 * pulse;
          if (S.selectedPart === 'wall') {
            S.wallMat.emissive.setHex(0x22c55e);
            S.wallMat.emissiveIntensity = glowIntensity;
            S.wallRimMat.emissive.setHex(0x4ade80);
            S.wallRimMat.emissiveIntensity = glowIntensity;
          } else if (S.selectedPart === 'membrane') {
            S.memMat.emissive.setHex(0xfacc15);
            S.memMat.emissiveIntensity = glowIntensity;
          } else if (S.selectedPart === 'cytoplasm') {
            S.cytoMat.emissive.setHex(0x84cc16);
            S.cytoMat.emissiveIntensity = glowIntensity * 0.75;
          } else if (S.selectedPart === 'nucleus') {
            S.nucMat.emissive.setHex(0xa855f7);
            S.nucMat.emissiveIntensity = glowIntensity;
          } else if (S.selectedPart === 'chloroplast') {
            S.chloroMat.emissive.setHex(0x22c55e);
            S.chloroMat.emissiveIntensity = glowIntensity * 1.2;
          } else if (S.selectedPart === 'vacuole') {
            S.vacMat.emissive.setHex(0x0ea5e9);
            S.vacMat.emissiveIntensity = glowIntensity;
          }
        }
        break;
      }

      case '6-9': {
        if (!S.bacteriaList) break;
        const tempSpeed = Math.max(0.2, 1.2 - Math.abs(p1 - 40) / 25);
        S.bacteriaList.forEach((b) => {
          if (!b.mesh.visible) return;
          b.vx += (Math.random() - 0.5) * 2.5 * dt;
          b.vz += (Math.random() - 0.5) * 2.5 * dt;
          b.vx = Math.max(-1.2, Math.min(1.2, b.vx));
          b.vz = Math.max(-1.2, Math.min(1.2, b.vz));

          b.mesh.position.x += b.vx * dt * tempSpeed;
          b.mesh.position.z += b.vz * dt * tempSpeed;
          b.mesh.rotation.y += b.rotSpeed * dt * tempSpeed;

          const r = Math.hypot(b.mesh.position.x, b.mesh.position.z);
          if (r > 3.1) {
            b.vx *= -1;
            b.vz *= -1;
            const pPos = 3.05 / r;
            b.mesh.position.x *= pPos;
            b.mesh.position.z *= pPos;
          }
        });
        break;
      }

      default: {
        const grade = expId.split('-')[0];
        if (grade !== '6') {
          const animateFunc = window['animateGrade' + grade];
          if (typeof animateFunc === 'function') {
            animateFunc(expId, S, dt, p1, p2, p3);
          }
        }
        break;
      }
    }
  }

  function animateGrade6Loop() {
    requestAnimationFrame(animateGrade6Loop);
    if (!vRenderer || !vScene || !vCamera || !vClock) return;

    const dt = Math.min(0.05, vClock.getDelta());
    const { p1, p2, p3 } = getSliders();

    camSpherical.radius += (camSpherical.targetRadius - camSpherical.radius) * 0.08;
    camSpherical.theta += (camSpherical.targetTheta - camSpherical.theta) * 0.08;
    camSpherical.phi += (camSpherical.targetPhi - camSpherical.phi) * 0.08;
    camLookCurrent.lerp(camLookTarget, 0.08);

    vCamera.position.x = camLookCurrent.x + camSpherical.radius * Math.sin(camSpherical.phi) * Math.sin(camSpherical.theta);
    vCamera.position.y = camLookCurrent.y + camSpherical.radius * Math.cos(camSpherical.phi);
    vCamera.position.z = camLookCurrent.z + camSpherical.radius * Math.sin(camSpherical.phi) * Math.cos(camSpherical.theta);
    vCamera.lookAt(camLookCurrent);

    if (typeof isSimRunning !== 'undefined' && !isSimRunning) {
      vRenderer.render(vScene, vCamera);
      return;
    }

    animateGrade6Step(activeExp6Id, exp6State, dt, p1, p2, p3);
    vRenderer.render(vScene, vCamera);
  }

  // =========================================================================
  // 10. XUẤT API CHUẨN (renderGrade6, updateGrade6, animateGrade6) & KẾT NỐI UI
  // =========================================================================
  global.createText3D = createText3D;
  global.updateText3D = updateText3D;

  global.renderGrade6 = function (expId, targetGroup, targetState) {
    if (targetGroup && targetGroup !== exp6Group) {
      if (expId === '6-1') build61(targetGroup, targetState);
      else if (expId === '6-2') build62(targetGroup, targetState);
      else if (expId === '6-3') build63(targetGroup, targetState);
    } else {
      window.initExperiment(expId);
    }
  };

  global.updateGrade6 = function (expId, targetState, p1, p2, p3) {
    updateExperiment6Params();
  };

  global.animateGrade6 = function (expId, targetState, dt, p1, p2, p3) {
    animateGrade6Step(expId, targetState || exp6State, dt, p1, p2, p3);
  };

  window.selectSubject = function (subjectType, lessonId = '6-1') {
    if (typeof currentSubject !== 'undefined') {
      currentSubject = lessonId;
    }
    const cfg = (typeof SUBJECT_CONFIG !== 'undefined' && SUBJECT_CONFIG[lessonId])
      ? SUBJECT_CONFIG[lessonId]
      : null;

    if (cfg) {
      const badgeEl = document.getElementById('subject-badge');
      const titleEl = document.getElementById('canvas-title');
      const descEl = document.getElementById('experiment-desc');
      if (badgeEl) badgeEl.textContent = cfg.name;
      if (titleEl) titleEl.textContent = cfg.title;
      if (descEl) descEl.textContent = cfg.desc;

      ['1', '2', '3'].forEach((idx) => {
        const pCfg = cfg[`p${idx}`];
        const input = document.getElementById(`param${idx}`);
        const lbl = document.getElementById(`label-param${idx}`);
        const unit = document.getElementById(`unit-param${idx}`);
        const val = document.getElementById(`val-param${idx}`);
        if (lbl && pCfg) lbl.textContent = pCfg.label;
        if (unit && pCfg) unit.textContent = pCfg.unit;
        if (input && pCfg) {
          input.min = pCfg.min;
          input.max = pCfg.max;
          input.step = pCfg.step;
          input.value = pCfg.val;
        }
        if (val && pCfg) val.textContent = pCfg.val;
      });
    }

    window.initExperiment(lessonId);
  };

  ['param1', 'param2', 'param3'].forEach((id) => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.addEventListener('input', () => {
        const valSpan = document.getElementById(`val-${id}`);
        if (valSpan) valSpan.textContent = slider.value;
        updateExperiment6Params();
      });
      slider.addEventListener('change', () => {
        updateExperiment6Params();
      });
    }
  });

  ensureThreeJS(() => {
    setTimeout(() => {
      initThreeViewport();
      window.selectSubject('physics', '6-1');
      animateGrade6Loop();
    }, 150);
  });

})(window);