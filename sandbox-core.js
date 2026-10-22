/**
 * ============================================================================
 * SANDBOX-CORE.JS — BẢN HOÀN CHỈNH (ĐÃ FIX NỀN DỊU MẮT, KÉO THẢ MƯỢT & XOAY 90°)
 * Nền tảng: Three.js r128
 * ============================================================================
 */

(function () {
  'use strict';

  // --- 1. TRẠNG THÁI TOÀN CỤC & HẰNG SỐ ---
  const SNAP_DISTANCE = 0.48; // Khoảng cách tự động hút giữa 2 chốt (Node)
  const TABLE_LIMIT_X = 15.5;
  const TABLE_LIMIT_Z = 10.5;
  let componentCounter = 0;

  const COLORS = {
    nodeDefault: 0xfacc15,   // Vàng kim loại (Chưa nối)
    nodeHover: 0x38bdf8,     // Xanh sáng (Khi trỏ chuột vào)
    nodeConnected: 0x10b981, // Xanh lá (Đã bắt dính nối điện)
    selectionRing: 0x38bdf8
  };

  const SandboxLab = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    clock: null,

    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    dragPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    planeIntersectPoint: new THREE.Vector3(),
    tableMesh: null,
    cursorRing: null,

    components: [],
    selectedComponent: null,
    isDragging: false,
    isSimRunning: true,
    isSaveWidgetOpen: true
  };

  window.SandboxLab = SandboxLab;

  // --- 2. KHỞI TẠO SÂN KHẤU 3D (NỀN TỐI DỊU MẮT, KHÔNG CHÓI) ---
  function initSandbox3D() {
    const container = document.getElementById('sandbox-3d-canvas');
    if (!container) return;

    const width = container.clientWidth || window.innerWidth - 544;
    const height = container.clientHeight || window.innerHeight;

    // 2.1. Scene với tông màu xanh đen sâu dịu mắt
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.015);
    SandboxLab.scene = scene;

    // 2.2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 13, 14);
    camera.lookAt(0, 0, 0);
    SandboxLab.camera = camera;

    // 2.3. Renderer (Không dùng sRGBEncoding để tránh bị bạc trắng mặt bàn)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    SandboxLab.renderer = renderer;

    setupLights(scene);
    setupLabTable(scene);
    setupOrbitControls(camera, renderer.domElement);
    setupInteractionEvents(renderer.domElement, container);

    SandboxLab.clock = new THREE.Clock();
    animateSandboxLoop();
  }

  // --- 3. ÁNH SÁNG DỊU MẮT, TƯƠNG PHẢN CAO CHO LINH KIỆN ---
  function setupLights(scene) {
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(10, 20, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 50;
    const d = 16;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);
  }

  // --- 4. BÀN THÍ NGHIỆM TỐI SÂU & 1 LỚP LƯỚI KHÔNG NHIỄU ---
  function setupLabTable(scene) {
    const tableGroup = new THREE.Group();

    // Mặt bàn màu xanh đen nhám (không phản xạ chói mắt)
    const tableGeo = new THREE.BoxGeometry(36, 0.5, 26);
    const tableMat = new THREE.MeshLambertMaterial({ color: 0x090e1a });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.set(0, -0.26, 0);
    tableMesh.receiveShadow = true;
    tableGroup.add(tableMesh);
    SandboxLab.tableMesh = tableMesh;

    // Viền bàn
    const borderGeo = new THREE.BoxGeometry(36.4, 0.54, 26.4);
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x162032 });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.set(0, -0.29, 0);
    tableGroup.add(borderMesh);

    // Chỉ dùng 1 lớp lưới duy nhất với độ mờ dịu mắt (Loại bỏ hiện tượng nhiễu Moiré)
    const mainGrid = new THREE.GridHelper(34, 34, 0x1d4ed8, 0x152238);
    mainGrid.position.y = 0.004;
    mainGrid.material.transparent = true;
    mainGrid.material.opacity = 0.4;
    tableGroup.add(mainGrid);

    // Vòng con trỏ chuột trên bàn
    const cursorGeo = new THREE.RingGeometry(0.16, 0.22, 32);
    cursorGeo.rotateX(-Math.PI / 2);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    const cursorRing = new THREE.Mesh(cursorGeo, cursorMat);
    cursorRing.position.set(0, 0.012, 0);
    scene.add(cursorRing);
    SandboxLab.cursorRing = cursorRing;

    scene.add(tableGroup);
  }

  // --- 5. CẤU HÌNH ORBITCONTROLS ---
  function setupOrbitControls(camera, domElement) {
    const controls = new THREE.OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.minDistance = 4;
    controls.maxDistance = 38;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.target.set(0, 0, 0);
    controls.update();
    SandboxLab.controls = controls;
  }

  // --- 6. TIỆN ÍCH VẼ NHÃN 3D (KHÔNG CHẶN TIA RAYCASTER) ---
  function createFloatingLabel(text, bgColor = 'rgba(15,23,42,0.92)', textColor = '#38bdf8') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.1, 0.52, 1);
    sprite.renderOrder = 30;
    // Cho phép bấm xuyên qua nhãn chữ để kéo linh kiện bên dưới dễ dàng
    sprite.raycast = function () {};

    sprite.userData.labelData = { canvas, texture, bgColor, textColor, text: '' };
    updateFloatingLabel(sprite, text, textColor);
    return sprite;
  }

  function updateFloatingLabel(sprite, text, textColor) {
    if (!sprite || !sprite.userData.labelData) return;
    const d = sprite.userData.labelData;
    if (textColor) d.textColor = textColor;
    if (d.text === text && !textColor) return;
    d.text = text;

    const ctx = d.canvas.getContext('2d');
    const W = d.canvas.width;
    const H = d.canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = d.bgColor;
    ctx.strokeStyle = d.textColor;
    ctx.lineWidth = 6;
    const r = 26;
    ctx.beginPath();
    ctx.moveTo(12 + r, 12);
    ctx.lineTo(W - 12 - r, 12);
    ctx.quadraticCurveTo(W - 12, 12, W - 12, 12 + r);
    ctx.lineTo(W - 12, H - 12 - r);
    ctx.quadraticCurveTo(W - 12, H - 12, W - 12 - r, H - 12);
    ctx.lineTo(12 + r, H - 12);
    ctx.quadraticCurveTo(12, H - 12, 12, H - 12 - r);
    ctx.lineTo(12, 12 + r);
    ctx.quadraticCurveTo(12, 12, 12 + r, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = d.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2 + 2);

    d.texture.needsUpdate = true;
  }

  // ============================================================================
  // 7. CLASS CIRCUIT NODE (CHỐT NỐI ĐIỆN 2 ĐẦU LINH KIỆN)
  // ============================================================================
  class CircuitNode {
    constructor(parentComponent, index, localPos) {
      this.id = `${parentComponent.id}_N${index}`;
      this.component = parentComponent;
      this.index = index;
      this.localPos = localPos.clone();
      this.connectedNodes = new Set();

      const geo = new THREE.SphereGeometry(0.26, 24, 24);
      this.material = new THREE.MeshStandardMaterial({
        color: COLORS.nodeDefault,
        metalness: 0.5,
        roughness: 0.3,
        emissive: 0xca8a04,
        emissiveIntensity: 0.3
      });
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.position.copy(this.localPos);
      this.mesh.castShadow = true;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.18, 16),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 })
      );
      collar.position.y = -0.12;
      collar.userData.isCircuitNode = true;
      collar.userData.nodeRef = this;
      collar.userData.componentRef = parentComponent;
      this.mesh.add(collar);

      this.mesh.userData.isCircuitNode = true;
      this.mesh.userData.nodeRef = this;
      this.mesh.userData.componentRef = parentComponent;

      parentComponent.group.add(this.mesh);
    }

    getWorldPosition(target = new THREE.Vector3()) {
      this.mesh.getWorldPosition(target);
      return target;
    }

    updateVisualState(isHovered = false) {
      if (this.connectedNodes.size > 0) {
        this.material.color.setHex(COLORS.nodeConnected);
        this.material.emissive.setHex(0x059669);
        this.material.emissiveIntensity = 0.7;
        this.mesh.scale.setScalar(1.12);
      } else if (isHovered) {
        this.material.color.setHex(COLORS.nodeHover);
        this.material.emissive.setHex(0x0284c7);
        this.material.emissiveIntensity = 0.6;
        this.mesh.scale.setScalar(1.2);
      } else {
        this.material.color.setHex(COLORS.nodeDefault);
        this.material.emissive.setHex(0xca8a04);
        this.material.emissiveIntensity = 0.3;
        this.mesh.scale.setScalar(1.0);
      }
    }
  }

  // ============================================================================
  // 8. CLASS BASE: CIRCUIT COMPONENT (CÓ HITBOX BẮT CHUỘT NHẠY 100%)
  // ============================================================================
  class CircuitComponent {
    constructor(type, title, iconClass) {
      componentCounter++;
      this.id = `${type.toUpperCase().slice(0, 3)}-${String(componentCounter).padStart(2, '0')}`;
      this.type = type;
      this.title = title;
      this.iconClass = iconClass;

      this.voltage = 0;
      this.resistance = 0.01;
      this.isClosed = true;

      this.current = 0;
      this.voltageDrop = 0;
      this.power = 0;

      this.group = new THREE.Group();
      this.group.userData.componentRef = this;

      // Vòng tròn sáng khi đang chọn linh kiện
      const ringGeo = new THREE.RingGeometry(1.45, 1.58, 48);
      ringGeo.rotateX(-Math.PI / 2);
      this.selectionRing = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: COLORS.selectionRing, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      );
      this.selectionRing.position.y = 0.02;
      this.selectionRing.visible = false;
      this.selectionRing.raycast = function () {};
      this.group.add(this.selectionRing);

      // Khối Hitbox trong suốt bao quanh thân linh kiện giúp bấm chuột & kéo thả cực nhạy
      if (type !== 'wire') {
        const hitGeo = new THREE.BoxGeometry(2.5, 1.3, 1.25);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        this.hitbox = new THREE.Mesh(hitGeo, hitMat);
        this.hitbox.position.y = 0.65;
        this.hitbox.userData.componentRef = this;
        this.group.add(this.hitbox);
      }

      this.nodes = [];
      this.labelSprite = null;
      this.electrons = [];
      this.electronPhase = 0;
    }

    initDefaultNodes(spanX = 1.45, yHeight = 0.35) {
      const nodeA = new CircuitNode(this, 0, new THREE.Vector3(-spanX, yHeight, 0));
      const nodeB = new CircuitNode(this, 1, new THREE.Vector3(spanX, yHeight, 0));
      this.nodes.push(nodeA, nodeB);
      this.createElectronParticles(spanX, yHeight);
    }

    createElectronParticles(spanX, yHeight) {
      const eGeo = new THREE.SphereGeometry(0.075, 12, 12);
      const eMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      for (let i = 0; i < 5; i++) {
        const eMesh = new THREE.Mesh(eGeo, eMat);
        eMesh.position.set(0, yHeight + 0.15, 0);
        eMesh.visible = false;
        eMesh.raycast = function () {};
        this.group.add(eMesh);
        this.electrons.push({ mesh: eMesh, offset: i / 5, spanX, yHeight });
      }
    }

    tagMeshesForRaycast() {
      this.group.traverse((child) => {
        if (child.isMesh && child !== this.selectionRing && !child.userData.isCircuitNode) {
          child.userData.componentRef = this;
        }
      });
    }

    setSelected(selected) {
      if (this.selectionRing) {
        this.selectionRing.visible = selected;
      }
    }

    onTick(dt) {
      const hasCurrent = Math.abs(this.current) > 0.005;
      const dir = this.current >= 0 ? 1 : -1;
      const speed = Math.min(Math.abs(this.current) * 0.85, 4.0);

      if (hasCurrent) {
        this.electronPhase = (this.electronPhase + dt * speed * dir) % 1;
      }

      this.electrons.forEach((e) => {
        e.mesh.visible = hasCurrent;
        if (hasCurrent) {
          let t = (e.offset + this.electronPhase) % 1;
          if (t < 0) t += 1;
          e.mesh.position.x = -e.spanX + t * (e.spanX * 2);
        }
      });
    }

    updateLabel() {}

    dispose(scene) {
      scene.remove(this.group);
    }
  }

  // ============================================================================
  // 9. CÁC CLASS LINH KIỆN CỤ THỂ
  // ============================================================================

  class Battery extends CircuitComponent {
    constructor() {
      super('battery', 'Nguồn Pin DC', 'fa-car-battery');
      this.voltage = 9.0;
      this.resistance = 0.5;
      this.buildMesh();
      this.initDefaultNodes(1.45, 0.38);
      this.tagMeshesForRaycast();
      this.labelSprite = createFloatingLabel(`Pin: ${this.voltage.toFixed(1)} V`, 'rgba(15,23,42,0.92)', '#38bdf8');
      this.labelSprite.position.set(0, 1.35, 0);
      this.group.add(this.labelSprite);
    }

    buildMesh() {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.16, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 })
      );
      base.position.y = 0.08;
      this.group.add(base);

      const bodyNeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 1.4, 32),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.6 })
      );
      bodyNeg.rotation.z = Math.PI / 2;
      bodyNeg.position.set(-0.35, 0.48, 0);
      this.group.add(bodyNeg);

      const bodyPos = new THREE.Mesh(
        new THREE.CylinderGeometry(0.385, 0.385, 0.75, 32),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.75 })
      );
      bodyPos.rotation.z = Math.PI / 2;
      bodyPos.position.set(0.72, 0.48, 0);
      this.group.add(bodyPos);

      const capPos = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.25, 24),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.8 })
      );
      capPos.rotation.z = Math.PI / 2;
      capPos.position.set(1.18, 0.48, 0);
      this.group.add(capPos);
    }

    updateLabel() {
      updateFloatingLabel(this.labelSprite, `Pin: ${this.voltage.toFixed(1)} V`, '#38bdf8');
    }
  }

  class Bulb extends CircuitComponent {
    constructor() {
      super('bulb', 'Bóng Đèn Sợi Đốt', 'fa-lightbulb');
      this.resistance = 10.0;
      this.buildMesh();
      this.initDefaultNodes(1.35, 0.35);
      this.tagMeshesForRaycast();
      this.labelSprite = createFloatingLabel(`Đèn: ${this.resistance.toFixed(0)} Ω`, 'rgba(15,23,42,0.92)', '#fbbf24');
      this.labelSprite.position.set(0, 1.85, 0);
      this.group.add(this.labelSprite);
    }

    buildMesh() {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.2, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 })
      );
      base.position.y = 0.1;
      this.group.add(base);

      const socket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.4, 0.42, 28),
        new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3, metalness: 0.85 })
      );
      socket.position.y = 0.41;
      this.group.add(socket);

      this.glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        metalness: 0.0
      });
      this.glassMesh = new THREE.Mesh(new THREE.SphereGeometry(0.56, 32, 32), this.glassMat);
      this.glassMesh.position.y = 0.98;
      this.group.add(this.glassMesh);

      this.filamentMat = new THREE.MeshStandardMaterial({
        color: 0x78716c,
        emissive: 0xffa000,
        emissiveIntensity: 0
      });
      this.filamentMesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.03, 12, 28, Math.PI),
        this.filamentMat
      );
      this.filamentMesh.position.y = 0.88;
      this.group.add(this.filamentMesh);

      this.haloMat = new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 24), this.haloMat);
      this.haloMesh.position.y = 0.98;
      this.haloMesh.raycast = function () {};
      this.group.add(this.haloMesh);

      this.bulbLight = new THREE.PointLight(0xfbbf24, 0, 8, 2);
      this.bulbLight.position.set(0, 1.1, 0);
      this.group.add(this.bulbLight);
    }

    onTick(dt) {
      super.onTick(dt);
      const brightness = Math.min(this.power / 8.0, 1.5);
      this.filamentMat.emissiveIntensity = brightness * 2.5;
      this.glassMat.emissive = new THREE.Color(0xf59e0b);
      this.glassMat.emissiveIntensity = brightness * 0.45;
      this.haloMat.opacity = Math.min(brightness * 0.45, 0.65);
      this.bulbLight.intensity = brightness * 2.2;
    }

    updateLabel() {
      const pTxt = this.power > 0.01 ? ` | ${this.power.toFixed(1)}W` : '';
      updateFloatingLabel(this.labelSprite, `Đèn: ${this.resistance.toFixed(0)} Ω${pTxt}`, '#fbbf24');
    }
  }

  class Resistor extends CircuitComponent {
    constructor() {
      super('resistor', 'Điện Trở Chuẩn', 'fa-wave-square');
      this.resistance = 20.0;
      this.buildMesh();
      this.initDefaultNodes(1.4, 0.35);
      this.tagMeshesForRaycast();
      this.labelSprite = createFloatingLabel(`R = ${this.resistance.toFixed(0)} Ω`, 'rgba(15,23,42,0.92)', '#34d399');
      this.labelSprite.position.set(0, 1.2, 0);
      this.group.add(this.labelSprite);
    }

    buildMesh() {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.14, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 })
      );
      base.position.y = 0.07;
      this.group.add(base);

      const lead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.6, 16),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 })
      );
      lead.rotation.z = Math.PI / 2;
      lead.position.y = 0.38;
      this.group.add(lead);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.45, 32),
        new THREE.MeshStandardMaterial({ color: 0xd6bfa3, roughness: 0.4, metalness: 0.1 })
      );
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.38;
      this.group.add(body);

      const bandColors = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b];
      bandColors.forEach((col, i) => {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.29, 0.29, 0.1, 24),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })
        );
        band.rotation.z = Math.PI / 2;
        band.position.set(-0.42 + i * 0.28, 0.38, 0);
        this.group.add(band);
      });
    }

    updateLabel() {
      updateFloatingLabel(this.labelSprite, `R = ${this.resistance.toFixed(0)} Ω`, '#34d399');
    }
  }

  class Switch extends CircuitComponent {
    constructor() {
      super('switch', 'Công Tắc (Khóa K)', 'fa-toggle-on');
      this.isClosed = true;
      this.resistance = 0.01;
      this.leverAngle = 0;
      this.buildMesh();
      this.initDefaultNodes(1.35, 0.35);
      this.tagMeshesForRaycast();
      this.labelSprite = createFloatingLabel('Khóa K: ĐÓNG', 'rgba(15,23,42,0.92)', '#34d399');
      this.labelSprite.position.set(0, 1.35, 0);
      this.group.add(this.labelSprite);
    }

    buildMesh() {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.18, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.3 })
      );
      base.position.y = 0.09;
      this.group.add(base);

      const postMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.24), postMat);
      postL.position.set(-0.75, 0.32, 0);
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.24), postMat);
      postR.position.set(0.75, 0.32, 0);
      this.group.add(postL, postR);

      this.bladePivot = new THREE.Group();
      this.bladePivot.position.set(-0.75, 0.46, 0);
      this.group.add(this.bladePivot);

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.65, 0.08, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 })
      );
      blade.position.set(0.82, 0, 0);
      this.bladePivot.add(blade);

      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 })
      );
      handle.position.set(1.65, 0.08, 0);
      this.bladePivot.add(handle);
    }

    toggleSwitch() {
      this.isClosed = !this.isClosed;
      this.updateLabel();
    }

    onTick(dt) {
      super.onTick(dt);
      const targetAngle = this.isClosed ? 0 : 0.62;
      this.leverAngle += (targetAngle - this.leverAngle) * Math.min(1, dt * 12);
      if (this.bladePivot) {
        this.bladePivot.rotation.z = this.leverAngle;
      }
    }

    updateLabel() {
      if (this.isClosed) {
        updateFloatingLabel(this.labelSprite, 'Khóa K: ĐÓNG', '#34d399');
      } else {
        updateFloatingLabel(this.labelSprite, 'Khóa K: MỞ (Hở)', '#fb7185');
      }
    }
  }

  class Ammeter extends CircuitComponent {
    constructor() {
      super('ammeter', 'Ampe Kế Đo Dòng', 'fa-gauge-high');
      this.resistance = 0.01;
      this.buildMesh();
      this.initDefaultNodes(1.35, 0.35);
      this.tagMeshesForRaycast();
      this.labelSprite = createFloatingLabel('I = 0.00 A', 'rgba(15,23,42,0.92)', '#c084fc');
      this.labelSprite.position.set(0, 1.4, 0);
      this.group.add(this.labelSprite);
    }

    buildMesh() {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.82, 0.88, 0.42, 36),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 })
      );
      body.position.y = 0.21;
      this.group.add(body);

      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.68, 0.04, 32),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      );
      dial.position.y = 0.43;
      this.group.add(dial);

      this.needlePivot = new THREE.Group();
      this.needlePivot.position.set(0, 0.46, 0.25);
      this.group.add(this.needlePivot);

      const needle = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.02, 0.68),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      needle.position.set(0, 0, -0.34);
      this.needlePivot.add(needle);
    }

    onTick(dt) {
      super.onTick(dt);
      const ratio = Math.min(Math.abs(this.current) / 3.0, 1.0);
      const targetRot = 0.85 - ratio * 1.7;
      if (this.needlePivot) {
        this.needlePivot.rotation.y += (targetRot - this.needlePivot.rotation.y) * Math.min(1, dt * 10);
      }
    }

    updateLabel() {
      updateFloatingLabel(this.labelSprite, `Ampe: ${Math.abs(this.current).toFixed(2)} A`, '#c084fc');
    }
  }

  class Wire extends CircuitComponent {
    constructor() {
      super('wire', 'Dây Dẫn Điện', 'fa-bezier-curve');
      this.resistance = 0.02;

      const nodeA = new CircuitNode(this, 0, new THREE.Vector3(-1.4, 0.35, 0));
      const nodeB = new CircuitNode(this, 1, new THREE.Vector3(1.4, 0.35, 0));
      this.nodes.push(nodeA, nodeB);

      this.tubeMaterial = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.35,
        metalness: 0.25
      });
      this.tubeMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.tubeMaterial);
      this.tubeMesh.castShadow = true;
      this.tubeMesh.userData.componentRef = this;
      this.group.add(this.tubeMesh);

      this.curve = null;
      const eGeo = new THREE.SphereGeometry(0.08, 12, 12);
      const eMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      for (let i = 0; i < 6; i++) {
        const eMesh = new THREE.Mesh(eGeo, eMat);
        eMesh.visible = false;
        eMesh.raycast = function () {};
        this.group.add(eMesh);
        this.electrons.push({ mesh: eMesh, offset: i / 6 });
      }

      this.updateWireGeometry();
    }

    updateWireGeometry() {
      const pA = this.nodes[0].mesh.position;
      const pB = this.nodes[1].mesh.position;
      const dist = pA.distanceTo(pB);

      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      mid.y = Math.max(pA.y, pB.y) + Math.min(0.4, dist * 0.1);

      this.curve = new THREE.QuadraticBezierCurve3(pA.clone(), mid, pB.clone());
      // Tăng bán kính ống dây lên 0.11 để dễ bấm chuột kéo cả sợi dây
      const newGeo = new THREE.TubeGeometry(this.curve, 24, 0.11, 12, false);

      if (this.tubeMesh.geometry) this.tubeMesh.geometry.dispose();
      this.tubeMesh.geometry = newGeo;

      if (this.selectionRing) {
        this.selectionRing.position.set(mid.x, 0.02, mid.z);
      }
    }

    onTick(dt) {
      const hasCurrent = Math.abs(this.current) > 0.005;
      const dir = this.current >= 0 ? 1 : -1;
      const speed = Math.min(Math.abs(this.current) * 0.85, 4.0);

      if (hasCurrent) {
        this.electronPhase = (this.electronPhase + dt * speed * dir) % 1;
      }

      this.electrons.forEach((e) => {
        e.mesh.visible = hasCurrent && !!this.curve;
        if (e.mesh.visible) {
          let t = (e.offset + this.electronPhase) % 1;
          if (t < 0) t += 1;
          this.curve.getPoint(t, e.mesh.position);
          e.mesh.position.y += 0.1;
        }
      });
    }
  }

  // ============================================================================
  // 10. THUẬT TOÁN BẮT DÍNH (SNAPPING) & ĐỒ THỊ MẠCH ĐIỆN
  // ============================================================================
  function disconnectNode(node) {
    node.connectedNodes.forEach((otherNode) => {
      otherNode.connectedNodes.delete(node);
      otherNode.updateVisualState();
    });
    node.connectedNodes.clear();
    node.updateVisualState();
  }

  function performSnappingForComponent(activeComp, activeWireNode = null) {
    if (activeComp.type === 'wire' && activeWireNode) {
      disconnectNode(activeWireNode);
      const worldPosA = activeWireNode.getWorldPosition();
      let bestTargetNode = null;
      let minDist = SNAP_DISTANCE;

      SandboxLab.components.forEach((otherComp) => {
        if (otherComp === activeComp) return;
        otherComp.nodes.forEach((targetNode) => {
          const worldPosB = targetNode.getWorldPosition();
          const d = worldPosA.distanceTo(worldPosB);
          if (d < minDist) {
            minDist = d;
            bestTargetNode = targetNode;
          }
        });
      });

      if (bestTargetNode) {
        const targetWorld = bestTargetNode.getWorldPosition();
        activeComp.group.worldToLocal(targetWorld);
        activeWireNode.mesh.position.copy(targetWorld);
        activeComp.updateWireGeometry();
      }
      rebuildAllSnapConnections();
      return;
    }

    activeComp.nodes.forEach((n) => disconnectNode(n));

    let bestSnapDelta = null;
    let minDistance = SNAP_DISTANCE;

    activeComp.nodes.forEach((myNode) => {
      const myPos = myNode.getWorldPosition();
      SandboxLab.components.forEach((otherComp) => {
        if (otherComp === activeComp) return;
        otherComp.nodes.forEach((otherNode) => {
          const otherPos = otherNode.getWorldPosition();
          const dist = myPos.distanceTo(otherPos);
          if (dist < minDistance) {
            minDistance = dist;
            bestSnapDelta = new THREE.Vector3().subVectors(otherPos, myPos);
          }
        });
      });
    });

    if (bestSnapDelta) {
      activeComp.group.position.add(new THREE.Vector3(bestSnapDelta.x, 0, bestSnapDelta.z));
      activeComp.group.updateMatrixWorld(true);
    }

    rebuildAllSnapConnections();
  }

  function rebuildAllSnapConnections() {
    SandboxLab.components.forEach((comp) => {
      comp.nodes.forEach((n) => n.connectedNodes.clear());
    });

    for (let i = 0; i < SandboxLab.components.length; i++) {
      for (let j = i + 1; j < SandboxLab.components.length; j++) {
        const compA = SandboxLab.components[i];
        const compB = SandboxLab.components[j];

        compA.nodes.forEach((nodeA) => {
          const posA = nodeA.getWorldPosition();
          compB.nodes.forEach((nodeB) => {
            const posB = nodeB.getWorldPosition();
            if (posA.distanceTo(posB) <= SNAP_DISTANCE) {
              nodeA.connectedNodes.add(nodeB);
              nodeB.connectedNodes.add(nodeA);
            }
          });
        });
      }
    }

    SandboxLab.components.forEach((comp) => {
      comp.nodes.forEach((n) => n.updateVisualState());
    });

    solveCircuitGraph();
  }

  function solveCircuitGraph() {
    SandboxLab.components.forEach((c) => {
      c.current = 0;
      c.voltageDrop = 0;
      c.power = 0;
    });

    const nodeToNet = new Map();
    let netCount = 0;

    SandboxLab.components.forEach((comp) => {
      comp.nodes.forEach((startNode) => {
        if (nodeToNet.has(startNode)) return;
        const netId = netCount++;
        const queue = [startNode];
        nodeToNet.set(startNode, netId);

        while (queue.length > 0) {
          const cur = queue.shift();
          cur.connectedNodes.forEach((neighbor) => {
            if (!nodeToNet.has(neighbor)) {
              nodeToNet.set(neighbor, netId);
              queue.push(neighbor);
            }
          });
        }
      });
    });

    let hasClosedLoop = false;

    if (netCount >= 2) {
      const batteries = SandboxLab.components.filter((c) => c.type === 'battery');

      batteries.forEach((bat) => {
        const netNeg = nodeToNet.get(bat.nodes[0]);
        const netPos = nodeToNet.get(bat.nodes[1]);
        if (netNeg === undefined || netPos === undefined || netNeg === netPos) return;

        const visitedComps = new Set([bat]);
        const pathComps = [];

        function dfsFindLoop(currentNet, targetNet) {
          if (currentNet === targetNet) return true;
          for (const comp of SandboxLab.components) {
            if (visitedComps.has(comp)) continue;
            if (comp.type === 'switch' && !comp.isClosed) continue;

            const n0 = nodeToNet.get(comp.nodes[0]);
            const n1 = nodeToNet.get(comp.nodes[1]);

            if (n0 === currentNet || n1 === currentNet) {
              const nextNet = n0 === currentNet ? n1 : n0;
              const direction = n0 === currentNet ? 1 : -1;
              visitedComps.add(comp);
              pathComps.push({ comp, direction });

              if (dfsFindLoop(nextNet, targetNet)) return true;

              pathComps.pop();
              visitedComps.delete(comp);
            }
          }
          return false;
        }

        if (dfsFindLoop(netPos, netNeg)) {
          hasClosedLoop = true;
          let totalR = bat.resistance;
          pathComps.forEach((item) => {
            totalR += item.comp.resistance;
          });

          const loopCurrent = bat.voltage / Math.max(totalR, 0.05);
          bat.current += loopCurrent;
          bat.voltageDrop = bat.voltage;
          bat.power = bat.voltage * loopCurrent;

          pathComps.forEach((item) => {
            item.comp.current += loopCurrent * item.direction;
            item.comp.voltageDrop = Math.abs(item.comp.current) * item.comp.resistance;
            item.comp.power = item.comp.current * item.comp.current * item.comp.resistance;
          });
        }
      });
    }

    SandboxLab.components.forEach((c) => c.updateLabel());
    updateInspectorReadouts();

    const stateEl = document.getElementById('stat-circuit-state');
    if (stateEl) {
      if (hasClosedLoop) {
        stateEl.textContent = 'Mạch kín (Có dòng điện)';
        stateEl.className = 'font-mono font-bold text-emerald-400';
      } else {
        stateEl.textContent = 'Mạch hở';
        stateEl.className = 'font-mono font-bold text-amber-400';
      }
    }
  }

  // ============================================================================
  // 11. HỆ THỐNG KÉO THẢ POINTER (CAPTURE PHASE - KHÔNG XUNG ĐỘT ORBITCONTROLS)
  // ============================================================================
  let draggingComponent = null;
  let draggingWireNode = null;
  let dragOffset = new THREE.Vector3();
  let pointerDownPos = new THREE.Vector2();
  let activePointerId = null;

  function updateMouseNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    SandboxLab.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    SandboxLab.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function getInteractableMeshes() {
    const list = [];
    SandboxLab.components.forEach((comp) => {
      comp.group.traverse((child) => {
        if (child.isMesh && child !== comp.selectionRing && child.userData.componentRef) {
          list.push(child);
        }
      });
    });
    return list;
  }

  function setupInteractionEvents(domElement, container) {
    // Sử dụng pointerdown ở pha Capture (true) để chặn OrbitControls ngay khi bấm trúng linh kiện
    domElement.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) return; // Chuột phải vẫn dùng để Pan mặt bàn bình thường

        updateMouseNDC(event, domElement);
        SandboxLab.raycaster.setFromCamera(SandboxLab.mouse, SandboxLab.camera);

        const meshes = getInteractableMeshes();
        const hits = SandboxLab.raycaster.intersectObjects(meshes, false);

        if (hits.length > 0) {
          // Ưu tiên chọn chốt Node nếu bấm gần Node
          const nodeHit = hits.find((h) => h.object.userData.isCircuitNode);
          const chosenHit = nodeHit || hits[0];
          const hitMesh = chosenHit.object;
          const comp = hitMesh.userData.componentRef;
          const node = hitMesh.userData.nodeRef;

          if (comp) {
            // Chặn sự kiện truyền tới OrbitControls để camera không bị xoay/kẹt
            event.stopImmediatePropagation();
            try {
              domElement.setPointerCapture(event.pointerId);
              activePointerId = event.pointerId;
            } catch (e) {}

            selectComponent(comp);
            draggingComponent = comp;
            SandboxLab.isDragging = true;
            pointerDownPos.set(event.clientX, event.clientY);

            if (comp.type === 'wire' && node) {
              draggingWireNode = node;
            } else {
              draggingWireNode = null;
            }

            if (SandboxLab.raycaster.ray.intersectPlane(SandboxLab.dragPlane, SandboxLab.planeIntersectPoint)) {
              dragOffset.subVectors(comp.group.position, SandboxLab.planeIntersectPoint);
            }
          }
        } else {
          // Bấm vào vùng bàn trống -> Bỏ chọn linh kiện và cho phép OrbitControls xoay 360 độ
          selectComponent(null);
        }
      },
      { capture: true }
    );

    // Di chuyển chuột (Kéo linh kiện trên mặt bàn XZ)
    window.addEventListener(
      'pointermove',
      (event) => {
        updateMouseNDC(event, domElement);
        SandboxLab.raycaster.setFromCamera(SandboxLab.mouse, SandboxLab.camera);

        // Cập nhật tọa độ con trỏ 3D trên mặt bàn
        if (SandboxLab.raycaster.ray.intersectPlane(SandboxLab.dragPlane, SandboxLab.planeIntersectPoint)) {
          const pt = SandboxLab.planeIntersectPoint;
          const clampedX = Math.max(-TABLE_LIMIT_X, Math.min(TABLE_LIMIT_X, pt.x));
          const clampedZ = Math.max(-TABLE_LIMIT_Z, Math.min(TABLE_LIMIT_Z, pt.z));

          if (SandboxLab.cursorRing) {
            SandboxLab.cursorRing.position.set(clampedX, 0.012, clampedZ);
          }
          const coordsEl = document.getElementById('cursor-coords-text');
          if (coordsEl) {
            coordsEl.textContent = `X: ${clampedX.toFixed(1)} | Z: ${clampedZ.toFixed(1)}`;
          }

          // Nếu đang giữ chuột kéo linh kiện
          if (SandboxLab.isDragging && draggingComponent) {
            event.stopImmediatePropagation();

            if (draggingComponent.type === 'wire' && draggingWireNode) {
              // Kéo 1 đầu chốt của Dây dẫn
              const targetWorld = new THREE.Vector3(clampedX, 0.35, clampedZ);
              draggingComponent.group.worldToLocal(targetWorld);
              draggingWireNode.mesh.position.copy(targetWorld);
              draggingComponent.updateWireGeometry();
              performSnappingForComponent(draggingComponent, draggingWireNode);
            } else {
              // Kéo cả linh kiện (hoặc cả sợi dây)
              const newX = Math.max(-TABLE_LIMIT_X, Math.min(TABLE_LIMIT_X, pt.x + dragOffset.x));
              const newZ = Math.max(-TABLE_LIMIT_Z, Math.min(TABLE_LIMIT_Z, pt.z + dragOffset.z));
              draggingComponent.group.position.set(newX, 0, newZ);
              draggingComponent.group.updateMatrixWorld(true);
              performSnappingForComponent(draggingComponent, null);
            }
            return;
          }
        }

        // Hiệu ứng sáng chốt Node khi rà chuột qua
        const meshes = getInteractableMeshes();
        const hits = SandboxLab.raycaster.intersectObjects(meshes, false);
        SandboxLab.components.forEach((c) => c.nodes.forEach((n) => n.updateVisualState(false)));

        const nodeHit = hits.find((h) => h.object.userData.isCircuitNode);
        if (nodeHit && nodeHit.object.userData.nodeRef) {
          nodeHit.object.userData.nodeRef.updateVisualState(true);
        }
      },
      { capture: true }
    );

    // Thả chuột
    window.addEventListener(
      'pointerup',
      (event) => {
        if (!SandboxLab.isDragging) return;
        event.stopImmediatePropagation();

        if (activePointerId !== null) {
          try {
            domElement.releasePointerCapture(activePointerId);
          } catch (e) {}
          activePointerId = null;
        }

        if (draggingComponent) {
          // Nếu click nhanh tại chỗ vào Khóa K (không kéo đi xa) -> Đảo trạng thái Đóng/Mở
          const moveDist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
          if (draggingComponent.type === 'switch' && moveDist < 6) {
            draggingComponent.toggleSwitch();
            updateInspectorUI(draggingComponent);
          }
          rebuildAllSnapConnections();
        }

        draggingComponent = null;
        draggingWireNode = null;
        SandboxLab.isDragging = false;
      },
      { capture: true }
    );

    // Phím tắt R (Xoay 90 độ) & Delete/Backspace (Xóa)
    window.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'INPUT') return;
      if (event.key === 'r' || event.key === 'R') {
        window.rotateSelectedComponent();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        window.deleteSelectedComponent();
      }
    });

    window.addEventListener('resize', () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (!nw || !nh) return;
      SandboxLab.camera.aspect = nw / nh;
      SandboxLab.camera.updateProjectionMatrix();
      SandboxLab.renderer.setSize(nw, nh);
    });
  }

  // --- 12. VÒNG LẶP RENDER ---
  function animateSandboxLoop() {
    requestAnimationFrame(animateSandboxLoop);
    const dt = Math.min(SandboxLab.clock.getDelta(), 0.1);

    if (SandboxLab.controls && !SandboxLab.isDragging) {
      SandboxLab.controls.update();
    }

    if (SandboxLab.isSimRunning) {
      SandboxLab.components.forEach((comp) => comp.onTick(dt));
    }

    if (SandboxLab.renderer && SandboxLab.scene && SandboxLab.camera) {
      SandboxLab.renderer.render(SandboxLab.scene, SandboxLab.camera);
    }
  }

  // ============================================================================
  // 13. CẬP NHẬT GIAO DIỆN & CÁC HÀM ĐIỀU KHIỂN GLOBAL
  // ============================================================================
  function selectComponent(comp) {
    if (SandboxLab.selectedComponent && SandboxLab.selectedComponent !== comp) {
      SandboxLab.selectedComponent.setSelected(false);
    }
    SandboxLab.selectedComponent = comp;
    if (comp) {
      comp.setSelected(true);
    }
    updateInspectorUI(comp);
  }

  function updateInspectorUI(comp) {
    const emptyEl = document.getElementById('inspector-empty');
    const ctrlEl = document.getElementById('inspector-controls');
    const badgeEl = document.getElementById('inspector-badge');

    if (!comp) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (ctrlEl) ctrlEl.classList.add('hidden');
      if (badgeEl) {
        badgeEl.textContent = 'Chưa chọn';
        badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono';
      }
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (ctrlEl) ctrlEl.classList.remove('hidden');
    if (badgeEl) {
      badgeEl.textContent = comp.id;
      badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono';
    }

    document.getElementById('insp-title').textContent = comp.title;
    document.getElementById('insp-id').textContent = `ID: #${comp.id}`;
    document.getElementById('insp-icon').className = `fa-solid ${comp.iconClass}`;

    const grpV = document.getElementById('control-group-voltage');
    const grpR = document.getElementById('control-group-resistance');
    const grpS = document.getElementById('control-group-switch');

    grpV.classList.toggle('hidden', comp.type !== 'battery');
    grpR.classList.toggle('hidden', comp.type !== 'bulb' && comp.type !== 'resistor');
    grpS.classList.toggle('hidden', comp.type !== 'switch');

    if (comp.type === 'battery') {
      document.getElementById('slider-voltage').value = comp.voltage;
      document.getElementById('val-voltage').textContent = comp.voltage.toFixed(1);
    }
    if (comp.type === 'bulb' || comp.type === 'resistor') {
      document.getElementById('slider-resistance').value = comp.resistance;
      document.getElementById('val-resistance').textContent = comp.resistance.toFixed(0);
    }
    if (comp.type === 'switch') {
      const swBtn = document.getElementById('btn-toggle-switch-state');
      if (comp.isClosed) {
        swBtn.textContent = 'ĐANG ĐÓNG (Kín)';
        swBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition';
      } else {
        swBtn.textContent = 'ĐANG MỞ (Hở)';
        swBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition';
      }
    }

    updateInspectorReadouts();
  }

  function updateInspectorReadouts() {
    const totalEl = document.getElementById('stat-total-components');
    if (totalEl) totalEl.textContent = String(SandboxLab.components.length);

    const comp = SandboxLab.selectedComponent;
    if (!comp) return;

    document.getElementById('readout-current').textContent = `${Math.abs(comp.current).toFixed(2)} A`;
    document.getElementById('readout-voltage').textContent = `${comp.voltageDrop.toFixed(2)} V`;
    document.getElementById('readout-power').textContent = `${comp.power.toFixed(2)} W`;
  }

  // Thêm linh kiện ra bàn (Cách đều nhau gọn gàng, không đè lên nhau)
  window.spawnComponent = function (type) {
    if (!SandboxLab.scene) return;
    let comp = null;

    switch (type) {
      case 'battery': comp = new Battery(); break;
      case 'bulb': comp = new Bulb(); break;
      case 'resistor': comp = new Resistor(); break;
      case 'switch': comp = new Switch(); break;
      case 'ammeter': comp = new Ammeter(); break;
      case 'wire': comp = new Wire(); break;
      default: return;
    }

    let spawnX = 0;
    let spawnZ = 0;
    let attempt = 0;
    while (
      SandboxLab.components.some((c) => Math.hypot(c.group.position.x - spawnX, c.group.position.z - spawnZ) < 2.6) &&
      attempt < 24
    ) {
      attempt++;
      const col = (attempt % 3) - 1;
      const row = Math.floor(attempt / 3);
      spawnX = col * 3.4;
      spawnZ = (row % 2 === 0 ? 1 : -1) * Math.ceil(row / 2) * 2.2;
    }

    comp.group.position.set(spawnX, 0, spawnZ);
    comp.group.updateMatrixWorld(true);
    SandboxLab.scene.add(comp.group);
    SandboxLab.components.push(comp);

    selectComponent(comp);
    rebuildAllSnapConnections();
  };

  // Xoay 90 độ cho TẤT CẢ linh kiện (Bao gồm cả Dây dẫn)
  window.rotateSelectedComponent = function () {
    const comp = SandboxLab.selectedComponent;
    if (!comp) return;

    if (comp.type === 'wire') {
      // Xoay 2 đầu chốt của dây dẫn 90 độ quanh tâm dây
      const pA = comp.nodes[0].mesh.position;
      const pB = comp.nodes[1].mesh.position;
      const midX = (pA.x + pB.x) * 0.5;
      const midZ = (pA.z + pB.z) * 0.5;

      comp.nodes.forEach((n) => {
        const dx = n.mesh.position.x - midX;
        const dz = n.mesh.position.z - midZ;
        n.mesh.position.x = midX - dz;
        n.mesh.position.z = midZ + dx;
      });
      comp.updateWireGeometry();
    } else {
      comp.group.rotation.y = (comp.group.rotation.y + Math.PI / 2) % (Math.PI * 2);
    }

    comp.group.updateMatrixWorld(true);
    rebuildAllSnapConnections();
  };

  window.updateSelectedComponentParam = function (param, value) {
    const val = parseFloat(value);
    const comp = SandboxLab.selectedComponent;
    if (!comp || isNaN(val)) return;

    if (param === 'voltage' && comp.type === 'battery') {
      comp.voltage = val;
      document.getElementById('val-voltage').textContent = val.toFixed(1);
    } else if (param === 'resistance' && (comp.type === 'bulb' || comp.type === 'resistor')) {
      comp.resistance = val;
      document.getElementById('val-resistance').textContent = val.toFixed(0);
    }

    solveCircuitGraph();
  };

  window.toggleSelectedSwitch = function () {
    const comp = SandboxLab.selectedComponent;
    if (!comp || comp.type !== 'switch') return;
    comp.toggleSwitch();
    updateInspectorUI(comp);
    solveCircuitGraph();
  };

  window.deleteSelectedComponent = function () {
    const comp = SandboxLab.selectedComponent;
    if (!comp) return;
    comp.nodes.forEach((n) => disconnectNode(n));
    comp.dispose(SandboxLab.scene);
    SandboxLab.components = SandboxLab.components.filter((c) => c !== comp);
    selectComponent(null);
    rebuildAllSnapConnections();
  };

  window.clearAllComponents = function () {
    SandboxLab.components.forEach((c) => c.dispose(SandboxLab.scene));
    SandboxLab.components = [];
    selectComponent(null);
    solveCircuitGraph();
  };

  window.resetCameraView = function () {
    if (!SandboxLab.camera || !SandboxLab.controls) return;
    SandboxLab.camera.position.set(0, 13, 14);
    SandboxLab.controls.target.set(0, 0, 0);
    SandboxLab.controls.update();
  };

  window.toggleSandboxSimulation = function () {
    SandboxLab.isSimRunning = !SandboxLab.isSimRunning;
    const btn = document.getElementById('btn-sim-toggle');
    const icon = document.getElementById('icon-sim-toggle');
    const text = document.getElementById('text-sim-toggle');
    const dot = document.getElementById('sim-status-indicator');
    const label = document.getElementById('sim-status-label');

    if (SandboxLab.isSimRunning) {
      btn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 transition';
      icon.className = 'fa-solid fa-pause';
      text.textContent = 'Tạm dừng';
      dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
      label.textContent = 'Mạch đang hoạt động';
    } else {
      btn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition';
      icon.className = 'fa-solid fa-play';
      text.textContent = 'Chạy mô phỏng';
      dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
      label.textContent = 'Đã tạm dừng';
    }
  };

  window.toggleSaveWidget = function () {
    SandboxLab.isSaveWidgetOpen = !SandboxLab.isSaveWidgetOpen;
    const body = document.getElementById('save-widget-body');
    const icon = document.getElementById('icon-toggle-save-widget');
    if (!body || !icon) return;

    if (SandboxLab.isSaveWidgetOpen) {
      body.classList.remove('hidden');
      icon.className = 'fa-solid fa-chevron-right text-xs';
    } else {
      body.classList.add('hidden');
      icon.className = 'fa-solid fa-chevron-left text-xs';
    }
  };

  window.saveCircuitDesign = function () {
    const nameInput = document.getElementById('circuit-save-name');
    const designName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Mạch điện tự do';
    alert(`Đã lưu thiết kế "${designName}" (${SandboxLab.components.length} linh kiện)!`);
  };

  window.addEventListener('DOMContentLoaded', initSandbox3D);
})();