// =========================================================================
// HỆ THỐNG MÔ PHỎNG 3D THREE.JS ĐỘC LẬP CHO 9 BÀI THÍ NGHIỆM KHỐI LỚP 6
// (Bản nâng cấp Đồ họa 3D Chi tiết Cao, Đổ bóng thật & Bảng Neon HUD V-LABS)
// =========================================================================

(function () {
  let vScene = null;
  let vCamera = null;
  let vRenderer = null;
  let exp6Group = null;
  let activeExp6Id = '6-1';
  let exp6State = {};
  let vClock = null;

  // Trạng thái góc nhìn Camera (Hỗ trợ xoay chuột trái, kéo rê chuột phải & thu phóng con lăn)
  const camSpherical = {
    radius: 11.5,
    theta: 0.0,
    phi: 1.15,
    targetRadius: 11.5,
    targetTheta: 0.0,
    targetPhi: 1.15
  };
  let camLookTarget = null;
  let camLookCurrent = null;
  let isMouseDown = false;
  let prevMouse = { x: 0, y: 0 };

  // Đảm bảo thư viện Three.js luôn sẵn sàng
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

  // Bật đổ bóng cho toàn bộ các khối con trong một Group
  function enableGroupShadows(obj, cast = true, receive = true) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = cast;
        child.receiveShadow = receive;
      }
    });
  }

  // Tạo mặt bàn thí nghiệm 3D chuẩn V-LABS có viền bo kim loại và 4 chân bàn chạm sàn lưới (y = -1.25)
  function createLabBench(width = 13.2, depth = 5.6, surfaceY = -0.35) {
    const benchGroup = new THREE.Group();
    const thickness = 0.28;
    const centerY = surfaceY - thickness / 2;

    // Mặt bàn chính
    const topGeo = new THREE.BoxGeometry(width, thickness, depth);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.55,
      metalness: 0.25
    });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(0, centerY, 0);
    topMesh.receiveShadow = true;
    topMesh.castShadow = true;
    benchGroup.add(topMesh);

    // Viền bo kim loại xung quanh mặt bàn
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.65
    });
    const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, thickness + 0.02, 0.08), trimMat);
    frontTrim.position.set(0, centerY, depth / 2);
    const backTrim = frontTrim.clone();
    backTrim.position.set(0, centerY, -depth / 2);
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.08, thickness + 0.02, depth + 0.08), trimMat);
    leftTrim.position.set(-width / 2, centerY, 0);
    const rightTrim = leftTrim.clone();
    rightTrim.position.set(width / 2, centerY, 0);
    benchGroup.add(frontTrim, backTrim, leftTrim, rightTrim);

    // 4 chân bàn kim loại nối từ gầm bàn xuống mặt lưới tọa độ (y = -1.25)
    const bottomY = -1.25;
    const bottomOfTop = surfaceY - thickness;
    const legHeight = Math.max(0.2, bottomOfTop - bottomY);
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.75
    });
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8
    });

    const offsetX = width / 2 - 0.55;
    const offsetZ = depth / 2 - 0.55;
    [
      [-offsetX, -offsetZ],
      [offsetX, -offsetZ],
      [-offsetX, offsetZ],
      [offsetX, offsetZ]
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, legHeight, 20), legMat);
      leg.position.set(lx, bottomY + legHeight / 2, lz);
      leg.castShadow = true;
      leg.receiveShadow = true;

      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 20), footMat);
      foot.position.set(lx, bottomY + 0.03, lz);
      benchGroup.add(leg, foot);
    });

    return benchGroup;
  }

  // Tạo cọc kim loại gắn bảng HUD nổi giống chuẩn V-LABS
  function createHudPost(x, bottomY, topY, z) {
    const h = Math.max(0.2, topY - bottomY);
    const postGroup = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.8,
      roughness: 0.25
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 12), poleMat);
    pole.position.set(x, bottomY + h / 2, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 16), poleMat);
    base.position.set(x, bottomY + 0.02, z);
    postGroup.add(pole, base);
    return postGroup;
  }

  // Khởi tạo khung vẽ 3D đè lên vùng hiển thị trung tâm
  function initThreeViewport() {
    if (vRenderer) return true;

    const hostEl = document.getElementById('canvas-3d-container');
    if (!hostEl) return false;
    const placeholder = document.getElementById('canvas-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    const oldCanvas = hostEl.querySelector('canvas');

    if (oldCanvas) {
      oldCanvas.style.display = 'none';
    }

    const computedPos = window.getComputedStyle(hostEl).position;
    if (computedPos === 'static') {
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
    vScene.fog = new THREE.FogExp2(0x050914, 0.022);

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
      vRenderer.toneMappingExposure = 1.12;
    }
    rootDiv.innerHTML = '';
    rootDiv.appendChild(vRenderer.domElement);

    // Hệ thống ánh sáng Phòng thí nghiệm 3D đa hướng + Đổ bóng thật
    const ambLight = new THREE.AmbientLight(0xffffff, 0.65);
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.45);
    hemiLight.position.set(0, 15, 0);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.05);
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

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.48);
    dirLight2.position.set(-7, 6, -6);

    const rimLight = new THREE.PointLight(0x818cf8, 0.35, 25);
    rimLight.position.set(0, 6, -8);

    vScene.add(ambLight, hemiLight, dirLight1, dirLight2, rimLight);

    // Lưới tọa độ không gian bên dưới bàn thí nghiệm
    const grid = new THREE.GridHelper(22, 22, 0x1e3a8a, 0x0b1329);
    grid.position.y = -1.25;
    grid.material.transparent = true;
    grid.material.opacity = 0.65;
    vScene.add(grid);

    exp6Group = new THREE.Group();
    vScene.add(exp6Group);
    vClock = new THREE.Clock();

    // Sự kiện Xoay bằng Chuột trái, Kéo rê bằng Chuột phải & Thu phóng bằng Con lăn
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

    vRenderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

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

  // Hàm vẽ khung bo góc tương thích mọi trình duyệt
  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Vẽ nội dung bảng thông số HUD phong cách Neon Glassmorphism V-LABS
  function renderHudCanvas(ctx, text, bgColor, textColor, fontSize) {
    ctx.clearRect(0, 0, 896, 128);

    // Đổ bóng phát sáng viền ngoài (Neon Glow)
    ctx.save();
    ctx.fillStyle = 'rgba(8, 15, 30, 0.92)';
    ctx.shadowColor = textColor;
    ctx.shadowBlur = 16;
    drawRoundedRect(ctx, 14, 14, 868, 100, 18);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = textColor;
    ctx.stroke();
    ctx.restore();

    // Viền phụ mảnh bên trong tạo hiệu ứng bảng điện tử
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    drawRoundedRect(ctx, 22, 22, 852, 84, 13);
    ctx.stroke();
    ctx.restore();

    // Chữ Monospace phát sáng sắc nét
    ctx.save();
    ctx.font = `bold ${fontSize}px "JetBrains Mono", "Fira Code", Consolas, monospace`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = textColor;
    ctx.shadowBlur = 8;
    ctx.fillText(text, 448, 64);
    ctx.restore();
  }

  // Tạo nhãn chữ 3D HUD hiển thị thông số trực tiếp trên mô hình
  function createTextSprite(text, bgColor = 'rgba(15, 23, 42, 0.92)', textColor = '#38bdf8', fontSize = 27) {
    const canvas = document.createElement('canvas');
    canvas.width = 896;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    renderHudCanvas(ctx, text, bgColor, textColor, fontSize);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 999;
    sprite.scale.set(4.15, 0.82, 1);
    return { sprite, canvas, ctx, texture };
  }

  function updateTextSprite(labelObj, text, bgColor = 'rgba(15, 23, 42, 0.92)', textColor = '#38bdf8', fontSize = 27) {
    if (!labelObj) return;
    const { ctx, texture } = labelObj;
    renderHudCanvas(ctx, text, bgColor, textColor, fontSize);
    texture.needsUpdate = true;
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

  // Tạo các nút bấm tương tác đặc thù dưới phần mô tả ở bảng điều khiển bên trái
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
        <button onclick="window.toggleExp6Shape('box')" class="px-2.5 py-1 text-xs rounded bg-sky-600 hover:bg-sky-500 text-white font-medium">Khối hộp chữ nhật</button>
        <button onclick="window.toggleExp6Shape('cylinder')" class="px-2.5 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium">Khối hình trụ</button>
        <button onclick="window.resetStopwatch6_1()" class="px-2.5 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium">Bấm giờ lại</button>
      `;
    } else if (expId === '6-3') {
      bar.innerHTML = `
        <button onclick="window.setFrictionSurface(0.1)" class="px-2 py-1 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white">Mặt kính (μ=0.1)</button>
        <button onclick="window.setFrictionSurface(0.35)" class="px-2 py-1 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white">Mặt gỗ (μ=0.35)</button>
        <button onclick="window.setFrictionSurface(0.65)" class="px-2 py-1 text-xs rounded bg-stone-700 hover:bg-stone-600 text-white">Mặt nhám (μ=0.65)</button>
        <button onclick="window.triggerPullBlock6_3()" class="w-full mt-1 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold">▶ BẤM KÉO LỰC & TRƯỢT KHỐI GỖ</button>
      `;
    } else if (expId === '6-5') {
      bar.innerHTML = `
        <button onclick="window.restartCandle6_5()" class="w-full py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-bold">🔥 ĐỐT NẾN & ÚP CHUÔNG THỦY TINH LẠI</button>
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
        <div class="w-full text-xs text-emerald-400 font-semibold mb-1">Bấm nút chú thích để Camera Zoom tới bộ phận:</div>
        <button onclick="window.zoomCellPart6_8('all')" class="px-2 py-1 text-[11px] rounded bg-slate-700 hover:bg-slate-600 text-white">Toàn cảnh</button>
        <button onclick="window.zoomCellPart6_8('wall')" class="px-2 py-1 text-[11px] rounded bg-emerald-700 hover:bg-emerald-600 text-white">Thành tế bào</button>
        <button onclick="window.zoomCellPart6_8('membrane')" class="px-2 py-1 text-[11px] rounded bg-teal-700 hover:bg-teal-600 text-white">Màng tế bào</button>
        <button onclick="window.zoomCellPart6_8('cytoplasm')" class="px-2 py-1 text-[11px] rounded bg-cyan-700 hover:bg-cyan-600 text-white">Tế bào chất</button>
        <button onclick="window.zoomCellPart6_8('nucleus')" class="px-2 py-1 text-[11px] rounded bg-purple-700 hover:bg-purple-600 text-white">Nhân tế bào</button>
        <button onclick="window.zoomCellPart6_8('chloroplast')" class="px-2 py-1 text-[11px] rounded bg-green-700 hover:bg-green-600 text-white">Lục lạp</button>
        <button onclick="window.zoomCellPart6_8('vacuole')" class="px-2 py-1 text-[11px] rounded bg-sky-700 hover:bg-sky-600 text-white">Không bào</button>
      `;
    }
  }

  // =======================================================================
  // KHỞI TẠO CHI TIẾT 9 MÔ HÌNH 3D KHỐI LỚP 6: initExperiment(expId)
  // =======================================================================
  window.initExperiment = function (expId) {
    if (!initThreeViewport()) return;
    activeExp6Id = expId;
    clearExp6Group();
    renderSubControlToolbar(expId);

    // Đặt lại góc nhìn chuẩn
    camSpherical.targetRadius = 11.2;
    camSpherical.targetTheta = 0.0;
    camSpherical.targetPhi = 1.15;
    camLookTarget.set(0, 1.0, 0);

    switch (expId) {
      // -------------------------------------------------------------------
      // BÀI 6-1: ĐO CHIỀU DÀI, KHỐI LƯỢNG, THỜI GIAN
      // -------------------------------------------------------------------
      case '6-1': {
        // Mặt bàn thí nghiệm 3D đặt tại y = -0.35 (chân bàn chạm lưới -1.25)
        const bench = createLabBench(13.2, 5.8, -0.35);
        exp6Group.add(bench);

        // Thước kẻ chia vạch 3D (0 - 100cm) sắc nét
        const rCanvas = document.createElement('canvas');
        rCanvas.width = 2048;
        rCanvas.height = 256;
        const rCtx = rCanvas.getContext('2d');
        const grad = rCtx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(1, '#eab308');
        rCtx.fillStyle = grad;
        rCtx.fillRect(0, 0, 2048, 256);

        // Rãnh kim loại dọc thân thước
        rCtx.fillStyle = 'rgba(15, 23, 42, 0.12)';
        rCtx.fillRect(0, 165, 2048, 18);

        rCtx.strokeStyle = '#0f172a';
        rCtx.fillStyle = '#0f172a';
        rCtx.font = 'bold 28px "JetBrains Mono", monospace';
        rCtx.textAlign = 'center';

        for (let i = 0; i <= 100; i++) {
          const x = 40 + (i / 100) * 1968;
          const isTen = i % 10 === 0;
          const isFive = i % 5 === 0;
          const tickH = isTen ? 92 : isFive ? 62 : 36;
          rCtx.lineWidth = isTen ? 5 : isFive ? 3 : 1.8;
          rCtx.beginPath();
          rCtx.moveTo(x, 0);
          rCtx.lineTo(x, tickH);
          rCtx.stroke();
          if (isTen) rCtx.fillText(`${i}`, x, 132);
        }
        rCtx.font = 'bold 32px sans-serif';
        rCtx.fillText('THƯỚC ĐO CHIỀU DÀI CHUẨN (0 - 100 cm)', 1024, 218);

        const rulerTex = new THREE.CanvasTexture(rCanvas);
        rulerTex.anisotropy = 4;
        const rulerGroup = new THREE.Group();
        const rulerBody = new THREE.Mesh(
          new THREE.BoxGeometry(8.2, 0.14, 1.0),
          new THREE.MeshStandardMaterial({ map: rulerTex, roughness: 0.35, metalness: 0.15 })
        );
        rulerBody.position.set(-1.2, -0.28, 1.25);
        // Vấu chặn mốc 0cm bằng kim loại đỏ ở đầu trái thước
        const zeroStopper = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.45, 1.15),
          new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.6, roughness: 0.3 })
        );
        zeroStopper.position.set(-5.17, -0.12, 1.25);
        rulerGroup.add(rulerBody, zeroStopper);
        enableGroupShadows(rulerGroup);
        exp6Group.add(rulerGroup);

        // Vật mẫu (Khối hộp chữ nhật & Khối hình trụ đặt khít trên mặt bàn y = -0.35)
        const sampleMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          metalness: 0.35,
          roughness: 0.22
        });
        const boxSample = new THREE.Mesh(new THREE.BoxGeometry(1, 0.65, 0.68), sampleMat);
        boxSample.castShadow = true;
        boxSample.receiveShadow = true;

        const cylSample = new THREE.Mesh(
          new THREE.CylinderGeometry(0.325, 0.325, 1, 36),
          new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.55, roughness: 0.2 })
        );
        cylSample.rotation.z = Math.PI / 2;
        cylSample.visible = false;
        cylSample.castShadow = true;
        cylSample.receiveShadow = true;
        exp6Group.add(boxSample, cylSample);

        // Cụm kim chỉ vạch đo trên thước (Mũi tên đỏ + vòng đế trượt)
        const pointer = new THREE.Group();
        const coneMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.16, 0.52, 24),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.35, roughness: 0.25 })
        );
        coneMesh.rotation.x = Math.PI;
        const pointerStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12),
          new THREE.MeshStandardMaterial({ color: 0xfef2f2, metalness: 0.8 })
        );
        pointerStem.position.y = 0.35;
        pointer.add(coneMesh, pointerStem);
        enableGroupShadows(pointer);
        exp6Group.add(pointer);

        // Cân điện tử phòng thí nghiệm 3D bên phải
        const scaleStation = new THREE.Group();
        const scaleBase = new THREE.Mesh(
          new THREE.BoxGeometry(2.3, 0.45, 2.3),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.35 })
        );
        scaleBase.position.set(4.2, -0.125, 0);

        // Bảng mặt trước cân điện tử (Màn hình LCD phát sáng)
        const lcdPanel = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.22, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x064e3b, emissive: 0x10b981, emissiveIntensity: 0.45 })
        );
        lcdPanel.position.set(4.2, -0.12, 1.14);

        const scaleNeck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 0.35, 24),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.2 })
        );
        scaleNeck.position.set(4.2, 0.18, 0);
        scaleStation.add(scaleBase, lcdPanel, scaleNeck);
        enableGroupShadows(scaleStation);
        exp6Group.add(scaleStation);

        // Đĩa cân inox
        const scalePan = new THREE.Group();
        scalePan.position.set(4.2, 0.35, 0);
        const panDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.88, 0.1, 36),
          new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.18 })
        );
        const panRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.92, 0.035, 12, 36),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 })
        );
        panRim.rotation.x = Math.PI / 2;
        panRim.position.y = 0.05;
        scalePan.add(panDisc, panRim);
        enableGroupShadows(scalePan);

        // Quả cân chuẩn bằng đồng có núm cầm
        const weightOnScale = new THREE.Group();
        weightOnScale.position.set(4.2, 0.75, 0);
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.75, roughness: 0.22 });
        const wBody = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.62, 32), brassMat);
        const wNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.15, 24), brassMat);
        wNeck.position.y = 0.36;
        const wKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.12, 24), brassMat);
        wKnob.position.y = 0.46;
        weightOnScale.add(wBody, wNeck, wKnob);
        enableGroupShadows(weightOnScale);
        exp6Group.add(scalePan, weightOnScale);

        // Đồng hồ bấm giờ cơ học 3D phía sau (có mặt vạch chia chi tiết & nút bấm đỉnh)
        const clockGroup = new THREE.Group();
        const cCanvas = document.createElement('canvas');
        cCanvas.width = 512;
        cCanvas.height = 512;
        const cCtx = cCanvas.getContext('2d');
        cCtx.fillStyle = '#f8fafc';
        cCtx.beginPath();
        cCtx.arc(256, 256, 248, 0, Math.PI * 2);
        cCtx.fill();

        cCtx.strokeStyle = '#0f172a';
        cCtx.fillStyle = '#0f172a';
        cCtx.font = 'bold 28px sans-serif';
        cCtx.textAlign = 'center';
        cCtx.textBaseline = 'middle';
        for (let s = 0; s < 60; s++) {
          const ang = (s / 60) * Math.PI * 2 - Math.PI / 2;
          const isFive = s % 5 === 0;
          const rOut = 232;
          const rIn = isFive ? 202 : 216;
          cCtx.lineWidth = isFive ? 5 : 2;
          cCtx.beginPath();
          cCtx.moveTo(256 + Math.cos(ang) * rIn, 256 + Math.sin(ang) * rIn);
          cCtx.lineTo(256 + Math.cos(ang) * rOut, 256 + Math.sin(ang) * rOut);
          cCtx.stroke();
          if (isFive) {
            const num = s === 0 ? 60 : s;
            cCtx.fillText(`${num}`, 256 + Math.cos(ang) * 172, 256 + Math.sin(ang) * 172);
          }
        }
        const clockTex = new THREE.CanvasTexture(cCanvas);

        // Giá đỡ đồng hồ đứng trên mặt bàn
        const clockStand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.14, 2.5, 16),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 })
        );
        clockStand.position.set(0, 0.9, -1.45);
        const clockStandBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.65, 0.12, 24),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 })
        );
        clockStandBase.position.set(0, -0.29, -1.45);

        const clockFace = new THREE.Mesh(
          new THREE.CylinderGeometry(1.12, 1.12, 0.22, 48),
          [
            new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.65, roughness: 0.25 }),
            new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.2 }),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 })
          ]
        );
        clockFace.rotation.x = Math.PI / 2;
        clockFace.position.set(0, 2.2, -1.4);

        const clockRim = new THREE.Mesh(
          new THREE.TorusGeometry(1.12, 0.11, 20, 48),
          new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.75, roughness: 0.2 })
        );
        clockRim.position.set(0, 2.2, -1.29);

        // Nút bấm giờ trên đỉnh đồng hồ
        const crownStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.25, 16),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
        );
        crownStem.position.set(0, 3.42, -1.35);
        const crownCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.1, 20),
          new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5 })
        );
        crownCap.position.set(0, 3.55, -1.35);

        const handGroup = new THREE.Group();
        handGroup.position.set(0, 2.2, -1.24);
        const handMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.86, 0.03),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.3 })
        );
        handMesh.position.y = 0.34;
        const centerPin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8 })
        );
        centerPin.rotation.x = Math.PI / 2;
        handGroup.add(handMesh, centerPin);

        clockGroup.add(clockStandBase, clockStand, clockFace, clockRim, crownStem, crownCap, handGroup);
        enableGroupShadows(clockGroup);
        exp6Group.add(clockGroup);

        // Cọc đỡ bảng HUD + Bảng thông số nổi
        exp6Group.add(
          createHudPost(-1.2, -0.35, 1.1, -0.15),
          createHudPost(4.2, -0.35, 1.55, -0.65)
        );

        const lblLength = createTextSprite('Chiều dài L = 25 cm', 'rgba(15,23,42,0.92)', '#38bdf8');
        lblLength.sprite.position.set(-1.2, 1.35, 0.2);
        const lblMass = createTextSprite('Khối lượng m = 150 g', 'rgba(15,23,42,0.92)', '#fbbf24');
        lblMass.sprite.position.set(4.2, 1.85, 0);
        const lblTime = createTextSprite('Đồng hồ: 0.0s / 10s', 'rgba(15,23,42,0.92)', '#34d399');
        lblTime.sprite.position.set(0, 4.05, -1.3);
        exp6Group.add(lblLength.sprite, lblMass.sprite, lblTime.sprite);

        exp6State = {
          boxSample, cylSample, pointer, scalePan, weightOnScale,
          handGroup, lblLength, lblMass, lblTime,
          elapsed: 0, startX: -5.13
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-2: BIẾN DẠNG LÒ XO (ĐỊNH LUẬT HOOKE)
      // -------------------------------------------------------------------
      case '6-2': {
        // Mặt bàn đặt tại y = -1.25 để khớp với đế giá đỡ tại y = -1.1
        const bench = createLabBench(10.5, 5.2, -1.25);
        exp6Group.add(bench);

        const standGroup = new THREE.Group();
        const standBase = new THREE.Mesh(
          new THREE.BoxGeometry(4.2, 0.3, 3.0),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.35 })
        );
        standBase.position.set(0, -1.1, 0);

        const rodCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, 0.25, 24),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 })
        );
        rodCollar.position.set(-1.4, -0.85, 0);

        const standRod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.13, 6.2, 24),
          new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.18 })
        );
        standRod.position.set(-1.4, 2.0, 0);

        // Khớp nối chữ thập (Bosshead clamp) và thanh ngang treo lò xo
        const bosshead = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.42, 0.42),
          new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.3 })
        );
        bosshead.position.set(-1.4, 4.9, 0);

        const standArm = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.18, 0.25),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.75, roughness: 0.25 })
        );
        standArm.position.set(-0.4, 4.9, 0);

        const topHook = new THREE.Mesh(
          new THREE.TorusGeometry(0.12, 0.035, 12, 24),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
        );
        topHook.position.set(0, 4.82, 0);

        standGroup.add(standBase, rodCollar, standRod, bosshead, standArm, topHook);
        enableGroupShadows(standGroup);
        exp6Group.add(standGroup);

        // Thước đo độ dãn đặt dọc có vạch chia cm chi tiết
        const vrCanvas = document.createElement('canvas');
        vrCanvas.width = 256;
        vrCanvas.height = 1024;
        const vrCtx = vrCanvas.getContext('2d');
        vrCtx.fillStyle = '#fef08a';
        vrCtx.fillRect(0, 0, 256, 1024);
        vrCtx.strokeStyle = '#0f172a';
        vrCtx.fillStyle = '#0f172a';
        vrCtx.font = 'bold 28px monospace';
        vrCtx.textAlign = 'left';
        for (let i = 0; i <= 50; i++) {
          const y = 30 + (i / 50) * 964;
          const isFive = i % 5 === 0;
          vrCtx.lineWidth = isFive ? 5 : 2;
          vrCtx.beginPath();
          vrCtx.moveTo(0, y);
          vrCtx.lineTo(isFive ? 95 : 55, y);
          vrCtx.stroke();
          if (isFive) vrCtx.fillText(`${i}cm`, 108, y + 8);
        }
        const vrTex = new THREE.CanvasTexture(vrCanvas);
        const vRuler = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 5.2, 0.1),
          new THREE.MeshStandardMaterial({ map: vrTex, roughness: 0.35 })
        );
        vRuler.position.set(1.25, 2.1, 0);
        vRuler.castShadow = true;
        exp6Group.add(vRuler);

        // Lò xo xoắn ốc 3D mạ crom bóng
        const springCoils = [];
        const coilCount = 75;
        const coilGroup = new THREE.Group();
        const coilMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.82, roughness: 0.15 });
        const coilGeo = new THREE.SphereGeometry(0.095, 16, 16);

        for (let i = 0; i < coilCount; i++) {
          const m = new THREE.Mesh(coilGeo, coilMat);
          m.castShadow = true;
          coilGroup.add(m);
          springCoils.push(m);
        }
        exp6Group.add(coilGroup);

        // Quả nặng treo dưới lò xo (kèm móc treo & kim chỉ vạch thước màu đỏ)
        const weightMesh = new THREE.Group();
        const wCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.48, 0.8, 32),
          new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.55, roughness: 0.25 })
        );
        const wRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.46, 0.04, 12, 32),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8 })
        );
        wRim.rotation.x = Math.PI / 2;
        wRim.position.y = 0.2;
        const wHook = new THREE.Mesh(
          new THREE.TorusGeometry(0.14, 0.035, 12, 24),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
        );
        wHook.position.y = 0.46;
        // Kim chỉ sang thước dọc
        const redIndicator = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.65, 16),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.4 })
        );
        redIndicator.rotation.z = -Math.PI / 2;
        redIndicator.position.set(0.65, 0.42, 0);
        weightMesh.add(wCylinder, wRim, wHook, redIndicator);
        enableGroupShadows(weightMesh);
        exp6Group.add(weightMesh);

        const lblHooke = createTextSprite('Δl = 0.0 cm | F = 0.0 N', 'rgba(15,23,42,0.92)', '#38bdf8');
        lblHooke.sprite.position.set(0.3, 5.65, 0);
        exp6Group.add(lblHooke.sprite);

        exp6State = {
          springCoils, weightMesh, lblHooke,
          topY: 4.8, naturalLen: 1.5,
          targetStretch: 0.5, oscAmp: 0.4, oscTime: 0
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-3: LỰC MA SÁT
      // -------------------------------------------------------------------
      case '6-3': {
        // Mặt bàn đỡ dưới máng trượt (máng trượt từ -0.4 đến 0.0 -> bàn ở -0.4)
        const bench = createLabBench(13.6, 4.8, -0.4);
        exp6Group.add(bench);

        const surfaceMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.5, metalness: 0.1 });
        const trackMesh = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.4, 3.2), surfaceMat);
        trackMesh.position.set(0, -0.2, 0);
        trackMesh.receiveShadow = true;
        trackMesh.castShadow = true;

        // Thành dẫn hướng 2 bên máng trượt
        const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
        const backRail = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.16, 0.12), railMat);
        backRail.position.set(0, 0.08, -1.55);
        const frontRail = backRail.clone();
        frontRail.position.set(0, 0.08, 1.55);
        exp6Group.add(trackMesh, backRail, frontRail);

        // Khối gỗ thí nghiệm có đế ma sát, quả gia trọng phía trên và móc kéo kim loại
        const blockMesh = new THREE.Group();
        blockMesh.position.set(-4.2, 0.45, 0);
        const woodBody = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.78, 1.1),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.1 })
        );
        woodBody.position.y = 0.06;
        const frictionPad = new THREE.Mesh(
          new THREE.BoxGeometry(1.62, 0.12, 1.12),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
        );
        frictionPad.position.y = -0.39;
        const topGrip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.32, 0.22, 24),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75 })
        );
        topGrip.position.y = 0.55;
        const hookRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.14, 0.035, 12, 24),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
        );
        hookRing.position.set(0.86, 0, 0);
        blockMesh.add(woodBody, frictionPad, topGrip, hookRing);
        enableGroupShadows(blockMesh);
        exp6Group.add(blockMesh);

        const pullArrow = new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(-3.4, 0.45, 0),
          2.0, 0x22c55e, 0.38, 0.26
        );
        const fricArrow = new THREE.ArrowHelper(
          new THREE.Vector3(-1, 0, 0),
          new THREE.Vector3(-4.2, 0.06, 0.65),
          1.2, 0xef4444, 0.32, 0.22
        );
        exp6Group.add(pullArrow, fricArrow);

        exp6Group.add(
          createHudPost(-2.4, 0.0, 2.7, -1.55),
          createHudPost(2.4, 0.0, 2.7, -1.55)
        );

        const lblFric = createTextSprite('F_kéo = 5.0N | F_ms = 1.47N', 'rgba(15,23,42,0.92)', '#34d399');
        lblFric.sprite.position.set(0, 2.75, -0.5);
        const lblSurface = createTextSprite('Bề mặt: Mặt gỗ (μ = 0.3)', 'rgba(15,23,42,0.92)', '#fbbf24');
        lblSurface.sprite.position.set(0, 1.8, -0.5);
        exp6Group.add(lblFric.sprite, lblSurface.sprite);

        exp6State = {
          surfaceMat, blockMesh, pullArrow, fricArrow,
          lblFric, lblSurface,
          posX: -4.2, velX: 0, accX: 0, isSliding: true
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-4: SỰ CHUYỂN THỂ CỦA CHẤT (RẮN - LỎNG - KHÍ)
      // -------------------------------------------------------------------
      case '6-4': {
        // Mặt bàn tại y = -1.18 để khớp với đáy bếp đun
        const bench = createLabBench(10.0, 5.2, -1.18);
        exp6Group.add(bench);

        // Đế bếp gia nhiệt hồng ngoại 3D
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

        // Cốc thủy tinh chịu nhiệt có vạch chia ml và nhiệt kế cắm bên trong
        const bCanvas = document.createElement('canvas');
        bCanvas.width = 512;
        bCanvas.height = 512;
        const bCtx = bCanvas.getContext('2d');
        bCtx.clearRect(0, 0, 512, 512);
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
        const beakerWall = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 4.4, 48, 1, true), glassMat);
        beakerWall.position.set(0, 1.4, 0);

        const beakerScaleOverlay = new THREE.Mesh(
          new THREE.CylinderGeometry(2.11, 2.11, 4.2, 48, 1, true),
          new THREE.MeshBasicMaterial({ map: beakerScaleTex, transparent: true, side: THREE.DoubleSide })
        );
        beakerScaleOverlay.position.set(0, 1.4, 0);

        const beakerBottom = new THREE.Mesh(
          new THREE.CylinderGeometry(2.1, 2.1, 0.08, 48),
          glassMat
        );
        beakerBottom.position.set(0, -0.76, 0);

        const beakerRim = new THREE.Mesh(
          new THREE.TorusGeometry(2.1, 0.07, 16, 48),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd, metalness: 0.3, roughness: 0.2 })
        );
        beakerRim.rotation.x = Math.PI / 2;
        beakerRim.position.set(0, 3.6, 0);

        // Nhiệt kế thủy ngân gắn thành bình
        const thermoGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 4.5, 16),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
        );
        thermoGlass.position.set(1.85, 1.85, 0);
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

        const lblPhase = createTextSprite('Trạng thái: LỎNG (25°C)', 'rgba(15,23,42,0.92)', '#38bdf8');
        lblPhase.sprite.position.set(0, 4.45, 0);
        exp6Group.add(lblPhase.sprite);

        exp6State = { heaterMat, pMat, particles, lblPhase };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-5: OXYGEN VÀ KHÔNG KHÍ
      // -------------------------------------------------------------------
      case '6-5': {
        // Mặt bàn tại y = -1.25 khớp với đáy chậu thủy tinh
        const bench = createLabBench(10.5, 5.5, -1.25);
        exp6Group.add(bench);

        // Chậu thủy tinh chứa nước
        const troughWall = new THREE.Mesh(
          new THREE.CylinderGeometry(3.4, 3.2, 1.1, 48, 1, true),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide })
        );
        troughWall.position.set(0, -0.7, 0);
        const troughRim = new THREE.Mesh(
          new THREE.TorusGeometry(3.4, 0.06, 16, 48),
          new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.2 })
        );
        troughRim.rotation.x = Math.PI / 2;
        troughRim.position.set(0, -0.15, 0);
        const troughWaterBase = new THREE.Mesh(
          new THREE.CylinderGeometry(3.28, 3.18, 0.45, 48),
          new THREE.MeshPhysicalMaterial({ color: 0x0284c7, transparent: true, opacity: 0.55, roughness: 0.15 })
        );
        troughWaterBase.position.set(0, -1.0, 0);
        exp6Group.add(troughWall, troughRim, troughWaterBase);

        // Đế đỡ nến và cây nến sáp có bấc
        const candleStand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.52, 0.62, 0.32, 24),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.65, roughness: 0.3 })
        );
        candleStand.position.set(0, -1.0, 0);
        const candleBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 1.6, 28),
          new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.35 })
        );
        candleBody.position.set(0, -0.1, 0);
        const wick = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12),
          new THREE.MeshStandardMaterial({ color: 0x1e293b })
        );
        wick.position.set(0, 0.75, 0);
        exp6Group.add(candleStand, candleBody, wick);

        // Ngọn lửa 3 lớp chân thực
        const flameGroup = new THREE.Group();
        flameGroup.position.set(0, 0.85, 0);
        const outerFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.68, 20),
          new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.88 })
        );
        const innerFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.11, 0.42, 16),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        const blueCore = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 })
        );
        blueCore.position.y = -0.2;
        const flameLight = new THREE.PointLight(0xf97316, 1.6, 7);
        flameGroup.add(outerFlame, innerFlame, blueCore, flameLight);
        exp6Group.add(flameGroup);

        // Chuông thủy tinh úp (có núm cầm trên đỉnh)
        const bellMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.26,
          roughness: 0.08,
          side: THREE.DoubleSide
        });
        const bellJar = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 4.2, 48, 1, true),
          bellMat
        );
        bellJar.position.set(0, 1.2, 0);
        const bellTop = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2),
          bellMat
        );
        bellTop.position.set(0, 3.3, 0);
        const bellKnob = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 24, 24),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.55, roughness: 0.1 })
        );
        bellKnob.position.set(0, 5.02, 0);
        exp6Group.add(bellJar, bellTop, bellKnob);

        // 5 vạch chia thể tích trên chuông (vạch 1 màu đỏ = 1/5 thể tích)
        for (let i = 1; i <= 5; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.61, 0.032, 12, 48),
            new THREE.MeshBasicMaterial({ color: i === 1 ? 0xef4444 : 0x94a3b8 })
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(0, -0.6 + i * 0.72, 0);
          exp6Group.add(ring);
        }

        const risingWater = new THREE.Mesh(
          new THREE.CylinderGeometry(1.56, 1.56, 1.0, 48),
          new THREE.MeshPhysicalMaterial({ color: 0x0284c7, transparent: true, opacity: 0.68, roughness: 0.12 })
        );
        risingWater.position.set(0, -0.6, 0);
        exp6Group.add(risingWater);

        const lblOxy = createTextSprite('O2 trong chuông: 21.0% | Nước dâng: 0%', 'rgba(15,23,42,0.92)', '#fbbf24');
        lblOxy.sprite.position.set(0, 5.65, 0);
        exp6Group.add(lblOxy.sprite);

        exp6State = {
          flameGroup, flameLight, risingWater, lblOxy,
          oxygenPct: 21.0, waterProgress: 0
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-6: TÁCH CHẤT (LỌC & CÔ CẠN)
      // -------------------------------------------------------------------
      case '6-6': {
        // Mặt bàn thí nghiệm tại y = -1.25 khớp với chân giá lọc & đèn cồn
        const bench = createLabBench(12.6, 5.4, -1.25);
        exp6Group.add(bench);

        // Cụm Trái: Phễu lọc giấy lọc tách cặn + Giá đỡ sắt phòng lab
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

        // Cụm Phải: Cô cạn dung dịch muối trên đèn cồn & Kiềng 3 chân
        const evapGroup = new THREE.Group();
        evapGroup.position.set(2.5, 0.2, 0);

        // Kiềng sắt 3 chân (Tripod) + Lưới amiang
        const tripodRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.05, 0.06, 12, 36),
          standMat
        );
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

        const lblSep = createTextSprite('Trái: Lọc tách cặn | Phải: Cô cạn kết tinh muối', 'rgba(15,23,42,0.92)', '#38bdf8');
        lblSep.sprite.position.set(0, 4.35, 0);
        exp6Group.add(lblSep.sprite);

        exp6State = {
          residues, drops, lampFlame, saltCrystals, steamParticles, lblSep
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-7: KÍNH HIỂN VI QUANG HỌC
      // -------------------------------------------------------------------
      case '6-7': {
        // Mặt bàn thí nghiệm tại y = -1.18 khớp với chân đế kính hiển vi
        const bench = createLabBench(12.2, 5.4, -1.18);
        exp6Group.add(bench);

        const micGroup = new THREE.Group();
        micGroup.position.set(-2.3, -1.0, 0);

        const metalMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.65, roughness: 0.25 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.5 });
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 });

        // Đế kính hiển vi vững chắc
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 2.7), darkMat);
        const subBase = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 2.1), metalMat);
        subBase.position.set(-0.15, 0.22, 0);

        // Thân kính uốn cong công thái học
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.52), metalMat);
        arm.position.set(-0.7, 1.7, 0);
        const armCurveTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 0.48), metalMat);
        armCurveTop.position.set(-0.25, 3.25, 0);

        // Mâm kính (Bàn để tiêu bản) + 2 kẹp tiêu bản kim loại
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

        // Lam kính tiêu bản + mẫu biểu bì vảy hành tím ở tâm
        const slideGlass = new THREE.Group();
        slideGlass.position.set(0.2, 1.7, 0);
        const glassStrip = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.04, 0.48),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.78, roughness: 0.1 })
        );
        const specimenSpot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.05, 20),
          new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.3 })
        );
        slideGlass.add(glassStrip, specimenSpot);

        // Mâm xoay vật kính (Revolving nosepiece) + 3 vật kính 4x, 10x, 40x
        const turretGroup = new THREE.Group();
        turretGroup.position.set(0.2, 2.55, 0);
        const turretDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.45, 0.22, 32), darkMat);
        turretGroup.add(turretDisc);

        const lensColors = [0xef4444, 0xeab308, 0x3b82f6];
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const objGroup = new THREE.Group();
          const objLen = 0.45 + i * 0.12;
          const objLens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.085, objLen, 20),
            metalMat
          );
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

        // Ốc đại cấp và vi cấp đồng trục
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

        // Thị trường kính hiển vi bên phải (Gắn trên khung màn hình hiển thị 3D)
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
        const viewportBack = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 0.14, 48),
          darkMat
        );
        viewportBack.rotation.x = Math.PI / 2;
        viewportBack.position.set(2.3, 1.35, -0.08);
        const viewportRim = new THREE.Mesh(
          new THREE.TorusGeometry(2.18, 0.11, 20, 64),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.75, roughness: 0.2 })
        );
        viewportRim.position.set(2.3, 1.35, 0);
        const viewportStand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.22, 1.4, 20),
          metalMat
        );
        viewportStand.position.set(2.3, -0.5, -0.08);
        exp6Group.add(viewportBack, viewportDisc, viewportRim, viewportStand);

        const lblMic = createTextSprite('Độ phóng đại: 100x | Ảnh RÕ NÉT', 'rgba(15,23,42,0.92)', '#38bdf8');
        lblMic.sprite.position.set(0, 4.4, 0);
        exp6Group.add(lblMic.sprite);

        exp6State = {
          stage, slideGlass, turretGroup, focusKnob, illuminatorMat,
          viewCanvas, viewCtx, viewTex, lblMic, focusOffset: 0
        };
        drawMicroscopeViewport6_7();
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-8: TẾ BÀO THỰC VẬT VÀ ĐỘNG VẬT (MÔ HÌNH 3D + CAMERA ZOOM)
      // -------------------------------------------------------------------
      case '6-8': {
        // Bệ đỡ trưng bày sinh học hiện đại đặt trên mặt bàn
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

        // 1. Thành tế bào (Khối lục giác xanh lá có viền khung cứng cáp)
        const wallMat = new THREE.MeshPhysicalMaterial({
          color: 0x15803d, transparent: true, opacity: 0.45, roughness: 0.28, side: THREE.DoubleSide
        });
        const cellWall = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.5, 6), wallMat);
        const wallRimTop = new THREE.Mesh(
          new THREE.RingGeometry(2.92, 3.2, 6),
          new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.4, side: THREE.DoubleSide })
        );
        wallRimTop.rotation.x = -Math.PI / 2;
        wallRimTop.rotation.z = Math.PI / 6;
        wallRimTop.position.y = 0.75;

        // 2. Màng tế bào
        const memMat = new THREE.MeshPhysicalMaterial({
          color: 0x84cc16, transparent: true, opacity: 0.52, roughness: 0.2
        });
        const cellMembrane = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 1.4, 24), memMat);

        // 3. Tế bào chất
        const cytoMat = new THREE.MeshPhysicalMaterial({
          color: 0xd9f99d, transparent: true, opacity: 0.65, roughness: 0.25
        });
        const cytoplasm = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 1.25, 24), cytoMat);

        // 4. Không bào trung tâm lớn
        const vacMat = new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8, transparent: true, opacity: 0.82, roughness: 0.08
        });
        const vacuole = new THREE.Mesh(new THREE.SphereGeometry(1.15, 36, 28), vacMat);
        vacuole.scale.set(1.3, 0.65, 0.95);
        vacuole.position.set(-0.65, 0.35, 0.2);

        // 5. Nhân tế bào (Màu tím nổi bật kèm Nhân con Nucleolus đậm màu bên trong)
        const nucMat = new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.22, metalness: 0.1 });
        const nucleus = new THREE.Group();
        nucleus.position.set(1.15, 0.45, -0.35);
        const nucSphere = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 32), nucMat);
        const nucleolus = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 24, 24),
          new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0x881337, emissiveIntensity: 0.35 })
        );
        nucleolus.position.set(0, 0.55, 0);
        nucleus.add(nucSphere, nucleolus);

        // 6. Các hạt Lục lạp (Kèm các đĩa Grana xếp chồng bên trong)
        const chloroplasts = new THREE.Group();
        const chloroMat = new THREE.MeshPhysicalMaterial({
          color: 0x16a34a, transparent: true, opacity: 0.82, roughness: 0.2
        });
        const granaMat = new THREE.MeshStandardMaterial({ color: 0xbbf7d0, roughness: 0.3 });
        const chloroPositions = [
          [0.3, 0.55, 1.4], [-1.6, 0.55, -1.1], [1.5, 0.55, 1.0],
          [-0.4, 0.55, -1.6], [-1.8, 0.55, 0.9]
        ];
        chloroPositions.forEach(([x, y, z]) => {
          const cGroup = new THREE.Group();
          const cShell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), chloroMat);
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

        // 7. Các Ti thể (Mitochondria) bổ trợ trực quan
        const mitoMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.25 });
        [[0.9, 0.55, 0.55], [-0.9, 0.55, -0.95]].forEach(([mx, my, mz]) => {
          const mito = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), mitoMat);
          mito.scale.set(1.5, 0.6, 0.75);
          mito.position.set(mx, my, mz);
          cellGroup.add(mito);
        });

        cellGroup.add(cellWall, wallRimTop, cellMembrane, cytoplasm, vacuole, nucleus, chloroplasts);
        enableGroupShadows(cellGroup);
        exp6Group.add(cellGroup);

        const lblCell = createTextSprite('Mô hình Tế bào 3D - Bấm chú thích bên trái để Zoom', 'rgba(15,23,42,0.92)', '#34d399');
        lblCell.sprite.position.set(0, 3.85, 0);
        exp6Group.add(lblCell.sprite);

        exp6State = {
          cellGroup, cytoMat, nucMat, lblCell
        };
        break;
      }

      // -------------------------------------------------------------------
      // BÀI 6-9: QUAN SÁT VI KHUẨN LACTIC (LÊN MEN SỮA CHUA)
      // -------------------------------------------------------------------
      case '6-9': {
        // Mặt bàn thí nghiệm + Tấm ủ nhiệt phòng sinh học
        const bench = createLabBench(10.8, 5.8, -0.35);
        exp6Group.add(bench);

        const incubatorPad = new THREE.Mesh(
          new THREE.CylinderGeometry(4.0, 4.2, 0.16, 48),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.3 })
        );
        incubatorPad.position.y = -0.24;

        // Đĩa Petri thủy tinh nuôi cấy có thành trong suốt và viền
        const petriRim = new THREE.Mesh(
          new THREE.TorusGeometry(3.6, 0.14, 20, 64),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.55, roughness: 0.2 })
        );
        petriRim.rotation.x = Math.PI / 2;
        petriRim.position.y = 0.25;

        const petriWall = new THREE.Mesh(
          new THREE.CylinderGeometry(3.6, 3.6, 0.55, 64, 1, true),
          new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide })
        );
        petriWall.position.y = 0.08;

        const yogurtMat = new THREE.MeshPhysicalMaterial({
          color: 0xfefce8, transparent: true, opacity: 0.58, roughness: 0.35
        });
        const yogurtMedium = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.55, 0.32, 64), yogurtMat);
        yogurtMedium.position.y = 0.0;
        yogurtMedium.receiveShadow = true;
        exp6Group.add(incubatorPad, petriRim, petriWall, yogurtMedium);

        const bacteriaList = [];
        const rodMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.2, metalness: 0.15 });
        const cocciMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.2, metalness: 0.15 });

        for (let i = 0; i < 60; i++) {
          const isRod = i % 2 === 0;
          let bMesh;
          if (isRod) {
            // Trực khuẩn Lactobacillus (Hình que bo tròn 2 đầu)
            bMesh = new THREE.Group();
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 16), rodMat);
            cyl.rotation.z = Math.PI / 2;
            const capL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), rodMat);
            capL.position.x = -0.18;
            const capR = capL.clone();
            capR.position.x = 0.18;
            bMesh.add(cyl, capL, capR);
          } else {
            // Liên cầu khuẩn Streptococcus (Chuỗi hạt cầu)
            bMesh = new THREE.Group();
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
          enableGroupShadows(bMesh);
          exp6Group.add(bMesh);

          bacteriaList.push({
            mesh: bMesh,
            vx: (Math.random() - 0.5) * 1.5,
            vz: (Math.random() - 0.5) * 1.5,
            rotSpeed: (Math.random() - 0.5) * 3
          });
        }

        const lblBac = createTextSprite('Vi khuẩn Lactic chuyển động Brown (40°C)', 'rgba(15,23,42,0.92)', '#f472b6');
        lblBac.sprite.position.set(0, 3.65, 0);
        exp6Group.add(lblBac.sprite);

        exp6State = { yogurtMat, bacteriaList, lblBac };
        break;
      }

      default: {
        // Tự động bóc tách tiền tố khối lớp (VD: '8-1' -> lấy số '8')
        const grade = expId.split('-')[0];
        const renderFunc = window['renderGrade' + grade];

        if (typeof renderFunc === 'function') {
          renderFunc(expId, exp6Group, exp6State);
        } else {
          const lblOther = createTextSprite(`Mô hình bài ${expId} (Khối ${grade}) đang được xây dựng...`);
          lblOther.sprite.position.set(0, 1.5, 0);
          exp6Group.add(lblOther.sprite);
        }
        break;
      }
    }

    updateExperiment6Params();
  };

  // =======================================================================
  // CẬP NHẬT MÔ HÌNH 3D KHI KÉO THANH TRƯỢT
  // =======================================================================
  function updateExperiment6Params() {
    if (!activeExp6Id) return;
    const { p1, p2, p3 } = getSliders();

    switch (activeExp6Id) {
      case '6-1': {
        const len3D = (p1 / 100) * 7.8;
        if (exp6State.boxSample && exp6State.cylSample) {
          exp6State.boxSample.scale.x = Math.max(0.1, len3D);
          exp6State.boxSample.position.set(exp6State.startX + len3D / 2, -0.025, 0.25);
          exp6State.cylSample.scale.y = Math.max(0.1, len3D);
          exp6State.cylSample.position.set(exp6State.startX + len3D / 2, -0.025, 0.25);
          exp6State.pointer.position.set(exp6State.startX + len3D, 0.18, 1.25);
        }
        if (exp6State.weightOnScale && exp6State.scalePan) {
          const mScale = 0.5 + (p2 / 1000) * 1.1;
          exp6State.weightOnScale.scale.set(mScale, mScale, mScale);
          const sink = (p2 / 1000) * 0.14;
          exp6State.scalePan.position.y = 0.35 - sink;
          exp6State.weightOnScale.position.y = 0.42 - sink + mScale * 0.31;
        }
        updateTextSprite(exp6State.lblLength, `Chiều dài L = ${p1} cm`, 'rgba(15,23,42,0.92)', '#38bdf8');
        updateTextSprite(exp6State.lblMass, `Khối lượng m = ${p2} g`, 'rgba(15,23,42,0.92)', '#fbbf24');
        break;
      }

      case '6-2': {
        const massKg = p1 / 1000;
        const forceN = massKg * 9.8;
        const deltaLMeters = forceN / p2;
        exp6State.targetStretch = Math.min(2.6, deltaLMeters * 4.5);
        exp6State.oscAmp = 0.45;
        exp6State.oscTime = 0;

        if (exp6State.weightMesh) {
          const s = 0.75 + (p1 / 500) * 0.65;
          exp6State.weightMesh.scale.set(s, s, s);
        }
        updateTextSprite(
          exp6State.lblHooke,
          `F = ${forceN.toFixed(2)}N | Δl = ${(deltaLMeters * 100).toFixed(1)}cm`,
          'rgba(15,23,42,0.92)',
          '#38bdf8'
        );
        break;
      }

      case '6-3': {
        if (!exp6State.surfaceMat) break;
        let surfName = 'Mặt gỗ phẳng';
        if (p2 <= 0.18) {
          exp6State.surfaceMat.color.setHex(0x38bdf8);
          exp6State.surfaceMat.roughness = 0.1;
          surfName = 'Mặt kính trơn';
        } else if (p2 <= 0.45) {
          exp6State.surfaceMat.color.setHex(0x92400e);
          exp6State.surfaceMat.roughness = 0.5;
          surfName = 'Mặt gỗ phẳng';
        } else {
          exp6State.surfaceMat.color.setHex(0x44403c);
          exp6State.surfaceMat.roughness = 0.95;
          surfName = 'Mặt nhám / Giấy ráp';
        }

        const massKg = p1 / 1000;
        const fMax = p2 * massKg * 9.8;
        const fActual = Math.min(p3, fMax);
        exp6State.accX = p3 > fMax ? (p3 - fMax) / massKg : 0;

        const scaleBlock = 0.8 + (p1 / 2000) * 0.6;
        exp6State.blockMesh.scale.set(scaleBlock, scaleBlock, scaleBlock);
        exp6State.blockMesh.position.y = 0.45 * scaleBlock;
        exp6State.pullArrow.setLength(0.6 + (p3 / 20) * 2.2, 0.35, 0.25);
        exp6State.fricArrow.setLength(0.4 + (fActual / 20) * 2.2, 0.3, 0.2);

        updateTextSprite(
          exp6State.lblFric,
          `F_kéo = ${p3.toFixed(1)}N | F_ms = ${fActual.toFixed(2)}N | a = ${exp6State.accX.toFixed(2)}m/s²`,
          'rgba(15,23,42,0.92)',
          '#34d399'
        );
        updateTextSprite(
          exp6State.lblSurface,
          `Bề mặt: ${surfName} (μ = ${p2})`,
          'rgba(15,23,42,0.92)',
          '#fbbf24'
        );
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
          updateTextSprite(exp6State.lblPhase, `Thể RẮN (${p1}°C): Dao động tại chỗ sát nhau`, 'rgba(15,23,42,0.92)', '#7dd3fc');
        } else if (p1 < 100) {
          exp6State.heaterMat.color.setHex(0xf59e0b);
          exp6State.heaterMat.emissive.setHex(0xd97706);
          exp6State.pMat.color.setHex(0x0284c7);
          updateTextSprite(exp6State.lblPhase, `Thể LỎNG (${p1}°C): Trượt tự do dưới đáy bình`, 'rgba(15,23,42,0.92)', '#fbbf24');
        } else {
          exp6State.heaterMat.color.setHex(0xef4444);
          exp6State.heaterMat.emissive.setHex(0xdc2626);
          exp6State.pMat.color.setHex(0xe0e7ff);
          updateTextSprite(exp6State.lblPhase, `Thể KHÍ (${p1}°C): Bay hỗn loạn va chạm thành bình`, 'rgba(15,23,42,0.92)', '#f87171');
        }
        break;
      }

      case '6-6': {
        if (!exp6State.residues) break;
        const resVisible = Math.max(3, Math.floor((p2 / 100) * exp6State.residues.length));
        exp6State.residues.forEach((r, i) => { r.visible = i < resVisible; });

        const saltVisible = Math.max(3, Math.floor((p1 / 35) * exp6State.saltCrystals.length));
        exp6State.saltCrystals.forEach((s, i) => { s.visible = i < saltVisible; });
        updateTextSprite(exp6State.lblSep, `Muối kết tinh: ${p1}% | Cặn giữ trên phễu: ${p2}g`, 'rgba(15,23,42,0.92)', '#38bdf8');
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
        const zoomScale = 0.8 + (p1 / 1000) * 0.6;
        exp6State.cellGroup.scale.set(zoomScale, zoomScale, zoomScale);
        const stainRatio = p2 / 2.0;
        exp6State.nucMat.color.setRGB(0.58 - stainRatio * 0.35, 0.2, 0.92);
        exp6State.cytoMat.opacity = Math.min(0.9, 0.35 + (p3 / 10) * 0.5);
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
          'rgba(15,23,42,0.92)',
          '#f472b6'
        );
        break;
      }

      default: {
        const grade = activeExp6Id.split('-')[0];
        const updateFunc = window['updateGrade' + grade];
        if (typeof updateFunc === 'function') {
          updateFunc(activeExp6Id, exp6State, p1, p2, p3);
        }
        break;
      }
    }
  }

  // =======================================================================
  // CÁC HÀM SỰ KIỆN NÚT BẤM PHỤ TRỢ
  // =======================================================================
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
    exp6State.posX = -4.2;
    exp6State.velX = 0;
    exp6State.isSliding = true;
    updateExperiment6Params();
  };

  window.restartCandle6_5 = function () {
    if (activeExp6Id !== '6-5') return;
    exp6State.oxygenPct = 21.0;
    exp6State.waterProgress = 0;
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
    const mag = p1 * p2;
    const brightness = p3 / 100;

    ctx.save();
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = `rgb(${Math.floor(220 * brightness)}, ${Math.floor(245 * brightness)}, ${Math.floor(230 * brightness)})`;
    ctx.fillRect(0, 0, 512, 512);

    ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    const cellW = Math.max(36, (mag / 100) * 55);
    const cellH = cellW * 0.6;
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 4;

    for (let y = -cellH; y < 512 + cellH; y += cellH) {
      for (let x = -cellW; x < 512 + cellW; x += cellW) {
        const offsetX = (Math.floor(y / cellH) % 2) * (cellW / 2);
        ctx.fillStyle = `rgba(134, 239, 172, ${0.45 * brightness})`;
        drawRoundedRect(ctx, x + offsetX, y, cellW - 4, cellH - 4, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#7e22ce';
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
    updateTextSprite(exp6State.lblMic, `Độ phóng đại: ${mag}x | ${statusText}`, 'rgba(15,23,42,0.92)', '#38bdf8');
  }

  window.zoomCellPart6_8 = function (part) {
    if (activeExp6Id !== '6-8' || !camLookTarget) return;
    const targets = {
      all: { look: [0, 0.8, 0], r: 10.5, theta: 0.0, phi: 1.05, text: 'Toàn cảnh Tế bào Thực vật 3D' },
      wall: { look: [0, 0.8, 2.7], r: 4.8, theta: 0.0, phi: 1.2, text: 'Thành tế bào: Quy định hình dạng & bảo vệ tế bào' },
      membrane: { look: [2.2, 0.8, 1.5], r: 4.8, theta: 0.6, phi: 1.1, text: 'Màng tế bào: Kiểm soát trao đổi chất' },
      cytoplasm: { look: [0.2, 1.0, 0.2], r: 4.5, theta: 0.2, phi: 0.7, text: 'Tế bào chất: Nơi diễn ra các hoạt động sống' },
      nucleus: { look: [1.15, 1.25, -0.35], r: 3.8, theta: 0.5, phi: 0.95, text: 'Nhân tế bào: Trung tâm điều khiển mọi hoạt động sống' },
      chloroplast: { look: [0.3, 1.35, 1.4], r: 3.8, theta: 0.15, phi: 0.95, text: 'Lục lạp: Chứa diệp lục thực hiện Quang hợp' },
      vacuole: { look: [-0.65, 1.15, 0.2], r: 4.2, theta: -0.5, phi: 0.9, text: 'Không bào: Chứa dịch tế bào & chất dự trữ' }
    };
    const t = targets[part] || targets.all;
    camLookTarget.set(...t.look);
    camSpherical.targetRadius = t.r;
    camSpherical.targetTheta = t.theta;
    camSpherical.targetPhi = t.phi;
    updateTextSprite(exp6State.lblCell, t.text, 'rgba(15,23,42,0.92)', '#34d399');
  };

  // =======================================================================
  // VÒNG LẶP RENDER 3D & CHUYỂN ĐỘNG VẬT LÝ THỜI GIAN THỰC
  // =======================================================================
  function animateGrade6Loop() {
    requestAnimationFrame(animateGrade6Loop);
    if (!vRenderer || !vScene || !vCamera || !vClock) return;

    const dt = Math.min(0.05, vClock.getDelta());
    const { p1, p2, p3 } = getSliders();

    // --- CẬP NHẬT CAMERA LUÔN CHẠY ĐỂ XOAY, ZOOM, KÉO RÊ ---
    camSpherical.radius += (camSpherical.targetRadius - camSpherical.radius) * 0.08;
    camSpherical.theta += (camSpherical.targetTheta - camSpherical.theta) * 0.08;
    camSpherical.phi += (camSpherical.targetPhi - camSpherical.phi) * 0.08;
    camLookCurrent.lerp(camLookTarget, 0.08);

    vCamera.position.x = camLookCurrent.x + camSpherical.radius * Math.sin(camSpherical.phi) * Math.sin(camSpherical.theta);
    vCamera.position.y = camLookCurrent.y + camSpherical.radius * Math.cos(camSpherical.phi);
    vCamera.position.z = camLookCurrent.z + camSpherical.radius * Math.sin(camSpherical.phi) * Math.cos(camSpherical.theta);
    vCamera.lookAt(camLookCurrent);

    // --- NẾU TẠM DỪNG: CHỈ DỪNG MÔ HÌNH BÊN DƯỚI, CAMERA VẪN XOAY/ZOOM BÌNH THƯỜNG ---
    if (typeof isSimRunning !== 'undefined' && !isSimRunning) {
      vRenderer.render(vScene, vCamera);
      return;
    }

    switch (activeExp6Id) {
      case '6-1': {
        if (exp6State.handGroup) {
          exp6State.elapsed = (exp6State.elapsed + dt) % Math.max(1, p3);
          exp6State.handGroup.rotation.z = -(exp6State.elapsed / 60) * Math.PI * 2;
          updateTextSprite(
            exp6State.lblTime,
            `Đồng hồ: ${exp6State.elapsed.toFixed(1)}s / ${p3}s`,
            'rgba(15,23,42,0.92)',
            '#34d399'
          );
        }
        break;
      }

      case '6-2': {
        if (!exp6State.springCoils) break;
        exp6State.oscTime += dt * p3 * 3.5;
        const omega = Math.sqrt(p2 / (p1 / 1000)) * 0.35;
        const damping = Math.exp(-0.45 * exp6State.oscTime);
        const currentStretch = exp6State.targetStretch + exp6State.oscAmp * damping * Math.cos(omega * exp6State.oscTime);
        const totalLen = exp6State.naturalLen + Math.max(0.1, currentStretch);

        const N = exp6State.springCoils.length;
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          const angle = t * Math.PI * 2 * 9;
          exp6State.springCoils[i].position.set(
            Math.cos(angle) * 0.38,
            exp6State.topY - t * totalLen,
            Math.sin(angle) * 0.38
          );
        }
        if (exp6State.weightMesh) {
          exp6State.weightMesh.position.set(0, exp6State.topY - totalLen - 0.45, 0);
        }
        break;
      }

      case '6-3': {
        if (!exp6State.blockMesh) break;
        if (exp6State.isSliding && exp6State.accX > 0) {
          exp6State.velX += exp6State.accX * dt;
          exp6State.posX += exp6State.velX * dt;
          if (exp6State.posX > 4.5) {
            exp6State.posX = -4.2;
            exp6State.velX = 0;
          }
        }
        exp6State.blockMesh.position.x = exp6State.posX;
        exp6State.pullArrow.position.x = exp6State.posX + 0.8;
        exp6State.fricArrow.position.x = exp6State.posX;
        break;
      }

      case '6-4': {
        if (!exp6State.particles) break;
        const speed = p3;
        const time = vClock.getElapsedTime();

        exp6State.particles.forEach(p => {
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
            if (p.mesh.position.y < -0.65 || p.mesh.position.y > 3.2) {
              p.vy *= -1;
              p.mesh.position.y = Math.max(-0.65, Math.min(3.2, p.mesh.position.y));
            }
          }
        });
        break;
      }

      case '6-5': {
        if (!exp6State.flameGroup) break;
        const burnRate = (p2 / (p1 / 500)) * 2.2 * (p3 >= 60 ? 1 : 0.2);
        if (exp6State.oxygenPct > 0) {
          exp6State.oxygenPct = Math.max(0, exp6State.oxygenPct - burnRate * dt);
          exp6State.waterProgress = (21 - exp6State.oxygenPct) / 21;

          const flameScale = Math.max(0.05, exp6State.oxygenPct / 21);
          exp6State.flameGroup.visible = true;
          exp6State.flameGroup.scale.set(
            flameScale * (0.95 + Math.random() * 0.1),
            flameScale * (0.9 + Math.random() * 0.2),
            flameScale
          );
          exp6State.flameLight.intensity = flameScale * 1.5;
        } else {
          exp6State.flameGroup.visible = false;
          exp6State.flameLight.intensity = 0;
        }

        const waterH = 0.2 + exp6State.waterProgress * 0.72;
        exp6State.risingWater.scale.y = waterH;
        exp6State.risingWater.position.y = -0.7 + waterH / 2;

        const status = exp6State.oxygenPct > 0
          ? `O2 còn: ${exp6State.oxygenPct.toFixed(1)}% | Nến đang cháy`
          : `Hết O2 -> Nến tắt | Nước dâng đúng 1/5 chuông!`;
        updateTextSprite(exp6State.lblOxy, status, 'rgba(15,23,42,0.92)', '#fbbf24');
        break;
      }

      case '6-6': {
        if (!exp6State.drops) break;
        const speed = p3;
        exp6State.drops.forEach(d => {
          d.position.y -= dt * 1.6 * speed;
          if (d.position.y < -0.9) d.position.y = 0.5;
        });

        exp6State.steamParticles.forEach(sp => {
          sp.position.y += dt * 1.2 * speed;
          if (sp.position.y > 2.6) sp.position.y = 0.6;
        });

        exp6State.lampFlame.scale.y = 0.85 + Math.random() * 0.3;
        break;
      }

      case '6-9': {
        if (!exp6State.bacteriaList) break;
        const tempSpeed = Math.max(0.2, 1.2 - Math.abs(p1 - 40) / 25);
        exp6State.bacteriaList.forEach(b => {
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
        const grade = activeExp6Id.split('-')[0];
        const animateFunc = window['animateGrade' + grade];
        if (typeof animateFunc === 'function') {
          animateFunc(activeExp6Id, exp6State, dt, p1, p2, p3);
        }
        break;
      }
    }

    vRenderer.render(vScene, vCamera);
  }

  // =======================================================================
  // GẮN KẾT TRỰC TIẾP VÀO HÀM selectSubject VÀ 3 THANH TRƯỢT
  // =======================================================================
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

      ['1', '2', '3'].forEach(idx => {
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

  // Lắng nghe sự kiện kéo thanh trượt
  ['param1', 'param2', 'param3'].forEach(id => {
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

  // Tự động chạy ngay khi tải trang
  ensureThreeJS(() => {
    setTimeout(() => {
      initThreeViewport();
      window.selectSubject('physics', '6-1');
      animateGrade6Loop();
    }, 150);
  });
})();