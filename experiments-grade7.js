/* =============================================================================
 * experiments-grade7.js
 * Phòng thí nghiệm ảo 3D - Vật lý khối 7 (Three.js r128)
 *
 *   7-1 : Đo tốc độ chuyển động      (p1 = s [m], p2 = t [s], p3 = hệ số cản gió)
 *   7-2 : Tần số và độ cao của âm    (p1 = f [Hz], p2 = A [cm], p3 = v âm [m/s])
 *   7-3 : Sự phản xạ ánh sáng        (p1 = góc tới i [°], p2 = chiết suất gương, p3 = cường độ [%])
 *
 * Hàm xuất ra window:
 *   window.createText3D(text, options)
 *   window.updateText3D(mesh, text, options)
 *   window.renderGrade7(expId, expGroup, expState)
 *   window.updateGrade7(expId, expState, p1, p2, p3)
 *   window.animateGrade7(expId, expState, dt, p1, p2, p3)
 * ========================================================================== */
(function () {
  'use strict';

  /* ===========================================================================
   * 1. TIỆN ÍCH CHUNG
   * ========================================================================= */
  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function toNumber(value, fallback) {
    var parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits);
  }

  function degToRad(degrees) {
    return degrees * Math.PI / 180;
  }

  /* Bản đồ môi trường nhỏ (gradient + softbox) để vật liệu kim loại PBR phản chiếu đẹp */
  var cachedEnvironment = null;
  function getEnvironment() {
    if (cachedEnvironment) {
      return cachedEnvironment;
    }
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0.0, '#bfe0ff');
    gradient.addColorStop(0.42, '#ffffff');
    gradient.addColorStop(0.5, '#69788c');
    gradient.addColorStop(1.0, '#161b25');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(50, 34, 110, 44);
    ctx.fillRect(290, 26, 140, 52);
    ctx.fillStyle = '#ffe9c4';
    ctx.fillRect(210, 60, 50, 30);
    var texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    cachedEnvironment = texture;
    return texture;
  }

  /* Texture từ canvas có kích thước bất kỳ (không cần lũy thừa của 2) */
  function canvasTexture(canvas) {
    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = 8;
    return texture;
  }

  function standardMaterial(color, metalness, roughness, extra) {
    var parameters = { color: color, metalness: metalness, roughness: roughness };
    if (metalness > 0.3) {
      parameters.envMap = getEnvironment();
      parameters.envMapIntensity = 1.0;
    }
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          parameters[key] = extra[key];
        }
      }
    }
    return new THREE.MeshStandardMaterial(parameters);
  }

  function physicalMaterial(color, metalness, roughness, extra) {
    var parameters = { color: color, metalness: metalness, roughness: roughness };
    if (metalness > 0.3) {
      parameters.envMap = getEnvironment();
      parameters.envMapIntensity = 1.0;
    }
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          parameters[key] = extra[key];
        }
      }
    }
    return new THREE.MeshPhysicalMaterial(parameters);
  }

  function addMesh(geometry, material, x, y, z, parent) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (parent) {
      parent.add(mesh);
    }
    return mesh;
  }

  /* Hộp bo góc: hình chữ nhật bo tròn trong mặt phẳng xy, đùn theo trục z, tâm ở gốc */
  function roundedBoxGeometry(width, height, depth, radius, bevel) {
    var b = bevel || 0.02;
    var w = width - 2 * b;
    var h = height - 2 * b;
    var r = Math.max(0.001, Math.min(radius, w / 2 - 0.001, h / 2 - 0.001));
    var x = -w / 2;
    var y = -h / 2;
    var shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    var extrudeDepth = Math.max(0.001, depth - 2 * b);
    var geometry = new THREE.ExtrudeGeometry(shape, {
      depth: extrudeDepth,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 3,
      curveSegments: 10
    });
    geometry.translate(0, 0, -extrudeDepth / 2);
    return geometry;
  }

  function addLights(group) {
    var hemisphere = new THREE.HemisphereLight(0xdfeaff, 0x303844, 0.55);
    group.add(hemisphere);
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(6, 12, 9);
    group.add(sun);
    var accent = new THREE.PointLight(0x88bbff, 0.6, 40);
    accent.position.set(-8, 6, 6);
    group.add(accent);
  }

  function makeWoodTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#9a6330';
    ctx.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 70; i++) {
      var y = Math.random() * 256;
      var shade = 60 + Math.floor(Math.random() * 40);
      ctx.strokeStyle = 'rgba(' + shade + ',35,10,' + (0.08 + Math.random() * 0.18) + ')';
      ctx.lineWidth = 0.6 + Math.random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + (Math.random() * 10 - 5), 170, y + (Math.random() * 10 - 5), 256, y + (Math.random() * 6 - 3));
      ctx.stroke();
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /* Mặt bàn thí nghiệm + chân bàn. Mặt trên của bàn nằm ở y = 0 */
  function makeBench(group, width, depth, centerX) {
    addMesh(new THREE.BoxGeometry(width, 0.3, depth), standardMaterial(0x2b3a4a, 0.2, 0.55), centerX, -0.15, 0, group);
    addMesh(new THREE.BoxGeometry(width + 0.14, 0.08, depth + 0.14), standardMaterial(0x9aa7b5, 0.9, 0.25), centerX, -0.34, 0, group);
    var legMaterial = standardMaterial(0x8892a0, 0.9, 0.3);
    var legX = width / 2 - 0.4;
    var legZ = depth / 2 - 0.4;
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var i = 0; i < corners.length; i++) {
      addMesh(new THREE.CylinderGeometry(0.12, 0.14, 3.0, 20), legMaterial,
        centerX + corners[i][0] * legX, -1.88, corners[i][1] * legZ, group);
    }
  }

  /* ===========================================================================
   * 2. NHÃN CHỮ 3D (CanvasTexture 896 x 128, viền bo góc phát sáng sắc nét)
   * ========================================================================= */
  var LABEL_WIDTH_PIXELS = 896;
  var LABEL_HEIGHT_PIXELS = 128;

  function roundedRectanglePath(ctx, x, y, w, h, r) {
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

  function normalizeLabelOptions(options) {
    var o = options || {};
    var mainColor = o.color || '#7dffb2';
    return {
      color: mainColor,
      background: o.background || 'rgba(6,16,28,0.88)',
      border: o.border || mainColor,
      fontSize: o.fontSize || 58,
      font: o.font || '"Segoe UI", Arial, sans-serif',
      width: o.width || 4,
      depthTest: o.depthTest !== false
    };
  }

  function drawLabel(canvas, text, o) {
    var W = LABEL_WIDTH_PIXELS;
    var H = LABEL_HEIGHT_PIXELS;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    var margin = 12;

    /* nền */
    roundedRectanglePath(ctx, margin, margin, W - 2 * margin, H - 2 * margin, 26);
    ctx.fillStyle = o.background;
    ctx.fill();

    /* viền phát sáng */
    ctx.save();
    ctx.shadowColor = o.border;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 6;
    ctx.strokeStyle = o.border;
    ctx.stroke();
    ctx.restore();

    /* viền trong sắc nét */
    roundedRectanglePath(ctx, margin + 6, margin + 6, W - 2 * margin - 12, H - 2 * margin - 12, 20);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();

    /* chữ tự co lại cho vừa nhãn */
    var size = o.fontSize;
    ctx.font = 'bold ' + size + 'px ' + o.font;
    while (ctx.measureText(text).width > W - 90 && size > 18) {
      size -= 2;
      ctx.font = 'bold ' + size + 'px ' + o.font;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = o.color;
    ctx.fillText(text, W / 2, H / 2 + 3);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.28;
    ctx.fillText(text, W / 2, H / 2 + 3);
    ctx.globalAlpha = 1;
  }

  function createText3D(text, options) {
    var o = normalizeLabelOptions(options);
    var canvas = document.createElement('canvas');
    canvas.width = LABEL_WIDTH_PIXELS;
    canvas.height = LABEL_HEIGHT_PIXELS;
    drawLabel(canvas, String(text), o);
    var texture = canvasTexture(canvas);
    var height = o.width * LABEL_HEIGHT_PIXELS / LABEL_WIDTH_PIXELS;
    var material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: o.depthTest,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.width, height), material);
    mesh.renderOrder = 10;
    mesh.userData.isText3D = true;
    mesh.userData.canvas = canvas;
    mesh.userData.options = o;
    mesh.userData.text = String(text);
    return mesh;
  }

  function updateText3D(mesh, text, options) {
    if (!mesh || !mesh.userData || !mesh.userData.isText3D) {
      return mesh;
    }
    var changed = false;
    if (options) {
      for (var key in options) {
        if (Object.prototype.hasOwnProperty.call(options, key) && mesh.userData.options[key] !== options[key]) {
          mesh.userData.options[key] = options[key];
          changed = true;
        }
      }
      if (options.color && !options.border && mesh.userData.options.border !== options.color) {
        mesh.userData.options.border = options.color;
        changed = true;
      }
    }
    var newText = String(text);
    if (!changed && newText === mesh.userData.text) {
      return mesh;
    }
    drawLabel(mesh.userData.canvas, newText, mesh.userData.options);
    mesh.material.map.needsUpdate = true;
    mesh.userData.text = newText;
    return mesh;
  }

  window.createText3D = createText3D;
  window.updateText3D = updateText3D;

  /* Bảng LED 3D: khung kim loại + nhãn + hai trụ đỡ */
  function addLedPanel(group, x, y, z, width, text, options, withPoles) {
    var o = options || {};
    o.width = width;
    var label = createText3D(text, o);
    label.position.set(x, y, z);
    var labelHeight = width * LABEL_HEIGHT_PIXELS / LABEL_WIDTH_PIXELS;
    addMesh(roundedBoxGeometry(width + 0.18, labelHeight + 0.16, 0.08, 0.08, 0.02),
      physicalMaterial(0x1a2230, 0.8, 0.3, { clearcoat: 0.6 }), x, y, z - 0.06, group);
    group.add(label);
    if (withPoles) {
      var poleMaterial = standardMaterial(0x7d8896, 0.9, 0.3);
      var poleHeight = y - labelHeight / 2 - 0.1;
      for (var side = -1; side <= 1; side += 2) {
        addMesh(new THREE.CylinderGeometry(0.04, 0.04, poleHeight, 12), poleMaterial,
          x + side * (width / 2 - 0.25), poleHeight / 2, z - 0.06, group);
      }
    }
    return label;
  }

  /* ===========================================================================
   * 3. BÀI 7-1: ĐO TỐC ĐỘ CHUYỂN ĐỘNG
   * ========================================================================= */
  var START_X_71 = -6;
  var SCALE_71 = 0.24;            /* đơn vị 3D trên mỗi mét */
  var CAR_LENGTH_71 = 0.9;
  var WHEEL_RADIUS_71 = 0.1;

  function makeRulerTexture() {
    var W = 3072;
    var H = 128;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#fff6bf');
    gradient.addColorStop(1, '#f2d96b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1a1a1a';
    ctx.fillStyle = '#1a1a1a';
    var half;
    for (half = 0; half <= 100; half++) {
      var meters = half / 2;
      var x = clamp(meters / 50 * W, 2, W - 2);
      var length = 16;
      var lineWidth = 2;
      if (half % 2 === 0) { length = 34; lineWidth = 2.5; }
      if (half % 10 === 0) { length = 50; lineWidth = 4; }
      if (half % 20 === 0) { length = 64; lineWidth = 5; }
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, length);
      ctx.stroke();
    }
    ctx.font = 'bold 36px Arial';
    ctx.textBaseline = 'top';
    var m;
    for (m = 0; m <= 50; m += 5) {
      var tx = clamp(m / 50 * W, 2, W - 2);
      ctx.textAlign = (m === 0) ? 'left' : (m === 50 ? 'right' : 'center');
      ctx.fillText(String(m), tx, 74);
    }
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7a1f00';
    ctx.fillText('m', 70, 80);
    return canvasTexture(canvas);
  }

  function buildPhotogate(ledColor) {
    var gate = new THREE.Group();
    var metal = standardMaterial(0xb8c2cf, 0.9, 0.25);
    var dark = standardMaterial(0x1c222b, 0.5, 0.4);
    var halfWidth = 0.52;
    var sensorOffset = 0.43;
    var beamHeight = 0.26;
    var side;

    for (side = -1; side <= 1; side += 2) {
      addMesh(new THREE.BoxGeometry(0.18, 0.05, 0.2), dark, 0, 0.025, side * halfWidth, gate);
      addMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 16), metal, 0, 0.45, side * halfWidth, gate);
      addMesh(new THREE.BoxGeometry(0.1, 0.14, 0.14), dark, 0, beamHeight, side * sensorOffset, gate);
      addMesh(new THREE.SphereGeometry(0.022, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2.5 }),
        0, beamHeight, side * (sensorOffset - 0.075), gate);
    }
    addMesh(new THREE.BoxGeometry(0.1, 0.07, halfWidth * 2 + 0.07), metal, 0, 0.84, 0, gate);
    addMesh(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 24), dark, 0, 0.92, 0, gate);

    var ledMaterial = new THREE.MeshStandardMaterial({
      color: ledColor,
      emissive: ledColor,
      emissiveIntensity: 2.2,
      roughness: 0.25
    });
    var led = addMesh(new THREE.SphereGeometry(0.065, 20, 16), ledMaterial, 0, 0.99, 0, gate);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), new THREE.MeshBasicMaterial({
      color: ledColor, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.position.set(0, 0.99, 0);
    gate.add(halo);

    var beamLength = (sensorOffset - 0.075) * 2;
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, beamLength, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, beamHeight, 0);
    gate.add(beam);
    var beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, beamLength, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff1010, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
      }));
    beamGlow.rotation.x = Math.PI / 2;
    beamGlow.position.set(0, beamHeight, 0);
    gate.add(beamGlow);

    return {
      group: gate,
      ledMaterial: ledMaterial,
      halo: halo,
      beam: beam,
      beamGlow: beamGlow,
      setLedColor: function (hex) {
        ledMaterial.color.setHex(hex);
        ledMaterial.emissive.setHex(hex);
        halo.material.color.setHex(hex);
      },
      setBeamVisible: function (visible) {
        beam.visible = visible;
        beamGlow.visible = visible;
      }
    };
  }

  function buildWheel() {
    var wheel = new THREE.Group();
    var tire = addMesh(new THREE.CylinderGeometry(WHEEL_RADIUS_71, WHEEL_RADIUS_71, 0.08, 32),
      standardMaterial(0x0d0d0f, 0.1, 0.9), 0, 0, 0, wheel);
    tire.rotation.x = Math.PI / 2;
    var rim = addMesh(new THREE.CylinderGeometry(0.062, 0.062, 0.084, 24),
      standardMaterial(0xd9dee6, 1.0, 0.18), 0, 0, 0, wheel);
    rim.rotation.x = Math.PI / 2;
    var spokeMaterial = standardMaterial(0xff3d00, 0.3, 0.4);
    var k;
    for (k = 0; k < 5; k++) {
      var spoke = addMesh(new THREE.BoxGeometry(0.11, 0.016, 0.09), spokeMaterial, 0, 0, 0, wheel);
      spoke.rotation.z = k * 2 * Math.PI / 5;
    }
    var hub = addMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 12), standardMaterial(0x222222, 0.9, 0.3), 0, 0, 0, wheel);
    hub.rotation.x = Math.PI / 2;
    return wheel;
  }

  function buildCar() {
    var car = new THREE.Group();
    var paint = physicalMaterial(0xff5a1f, 0.5, 0.28, { clearcoat: 1, clearcoatRoughness: 0.08 });
    var dark = standardMaterial(0x15181d, 0.2, 0.7);
    var glass = physicalMaterial(0xa8dcff, 0.0, 0.03, {
      transparent: true, opacity: 0.38, envMap: getEnvironment(), envMapIntensity: 1.4,
      side: THREE.DoubleSide, depthWrite: false
    });

    addMesh(roundedBoxGeometry(CAR_LENGTH_71, 0.18, 0.46, 0.07, 0.03), paint, 0, 0.2, 0, car);
    addMesh(new THREE.BoxGeometry(0.88, 0.006, 0.08), standardMaterial(0xffffff, 0.1, 0.4), 0, 0.294, 0, car);

    addMesh(roundedBoxGeometry(0.44, 0.17, 0.40, 0.05, 0.02), glass, -0.06, 0.375, 0, car);
    var windshield = addMesh(new THREE.BoxGeometry(0.012, 0.2, 0.4), glass, 0.14, 0.38, 0, car);
    windshield.rotation.z = 0.42;
    addMesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), dark, -0.16, 0.34, 0, car);
    addMesh(roundedBoxGeometry(0.46, 0.03, 0.42, 0.04, 0.01), paint, -0.06, 0.47, 0, car);

    var pillarX = [-0.26, 0.1];
    var pillarZ = [-0.19, 0.19];
    var a;
    var b;
    for (a = 0; a < 2; a++) {
      for (b = 0; b < 2; b++) {
        addMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 8), paint, pillarX[a], 0.375, pillarZ[b], car);
      }
    }

    addMesh(new THREE.BoxGeometry(0.03, 0.05, 0.4), dark, 0.46, 0.13, 0, car);
    addMesh(new THREE.BoxGeometry(0.03, 0.05, 0.4), dark, -0.46, 0.13, 0, car);

    var headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff7d0, emissive: 0xfff2b0, emissiveIntensity: 2.6, roughness: 0.2
    });
    var tailMaterial = new THREE.MeshStandardMaterial({
      color: 0x550000, emissive: 0xff2222, emissiveIntensity: 1.6
    });
    var s;
    for (s = -1; s <= 1; s += 2) {
      addMesh(new THREE.SphereGeometry(0.05, 20, 16), headlightMaterial, 0.455, 0.2, s * 0.15, car);
      var headHalo = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      headHalo.position.set(0.47, 0.2, s * 0.15);
      car.add(headHalo);
      addMesh(new THREE.BoxGeometry(0.02, 0.04, 0.09), tailMaterial, -0.465, 0.2, s * 0.15, car);
    }

    var wheels = [];
    var wheelPositions = [[0.29, 0.27], [0.29, -0.27], [-0.29, 0.27], [-0.29, -0.27]];
    var w;
    for (w = 0; w < wheelPositions.length; w++) {
      var wheel = buildWheel();
      wheel.position.set(wheelPositions[w][0], WHEEL_RADIUS_71, wheelPositions[w][1]);
      car.add(wheel);
      wheels.push(wheel);
    }
    return { group: car, wheels: wheels };
  }

  function buildFan() {
    var fan = new THREE.Group();
    var metal = standardMaterial(0xc3ccd8, 0.9, 0.22);
    var dark = standardMaterial(0x1c222b, 0.5, 0.4);
    addMesh(new THREE.CylinderGeometry(0.35, 0.4, 0.08, 32), dark, 0, 0.04, 0, fan);
    addMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 16), metal, 0, 0.5, 0, fan);
    var motor = addMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 24), standardMaterial(0x2a3646, 0.6, 0.35), 0, 0.98, 0, fan);
    motor.rotation.z = Math.PI / 2;
    var blades = new THREE.Group();
    blades.position.set(-0.2, 0.98, 0);
    fan.add(blades);
    var bladeMaterial = standardMaterial(0x4fc3ff, 0.1, 0.35, { transparent: true, opacity: 0.92 });
    var k;
    for (k = 0; k < 4; k++) {
      var pivot = new THREE.Group();
      pivot.rotation.x = k * Math.PI / 2;
      var blade = addMesh(new THREE.BoxGeometry(0.02, 0.4, 0.16), bladeMaterial, 0, 0.24, 0, pivot);
      blade.rotation.y = 0.45;
      blades.add(pivot);
    }
    addMesh(new THREE.SphereGeometry(0.05, 16, 12), metal, -0.02, 0, 0, blades);
    var guard = addMesh(new THREE.TorusGeometry(0.5, 0.018, 8, 48), metal, -0.26, 0.98, 0, fan);
    guard.rotation.y = Math.PI / 2;
    return { group: fan, blades: blades };
  }

  function render71(group) {
    var S = { id: '7-1', params: null };
    var x0 = START_X_71;
    addLights(group);
    makeBench(group, 15.6, 4.4, 0.4);

    /* đường chạy */
    addMesh(new THREE.BoxGeometry(12.6, 0.03, 1.0), standardMaterial(0x141b24, 0.6, 0.35), 0, 0.015, 0, group);
    var railMaterial = standardMaterial(0xaab4c2, 0.95, 0.2);
    addMesh(new THREE.BoxGeometry(12.6, 0.045, 0.04), railMaterial, 0, 0.03, -0.5, group);
    addMesh(new THREE.BoxGeometry(12.6, 0.045, 0.04), railMaterial, 0, 0.03, 0.5, group);

    /* thước đo chia vạch (CanvasTexture) */
    addMesh(new THREE.BoxGeometry(12.1, 0.04, 0.58), railMaterial, 0, 0.02, 1.2, group);
    var rulerTexture = makeRulerTexture();
    var ruler = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.5),
      new THREE.MeshStandardMaterial({ map: rulerTexture, roughness: 0.5, metalness: 0.0 }));
    ruler.rotation.x = -Math.PI / 2;
    ruler.position.set(x0 + 6, 0.045, 1.2);
    group.add(ruler);

    S.markStart = addMesh(new THREE.BoxGeometry(0.04, 0.012, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2e90ff }), x0, 0.054, 1.2, group);
    S.markFinish = addMesh(new THREE.BoxGeometry(0.04, 0.012, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x00e676 }), x0 + SCALE_71 * 10, 0.054, 1.2, group);

    /* hai cổng quang điện */
    S.gateStart = buildPhotogate(0x38b6ff);
    S.gateStart.group.position.set(x0, 0, 0);
    group.add(S.gateStart.group);
    S.gateFinish = buildPhotogate(0xff2a2a);
    S.gateFinish.group.position.set(x0 + SCALE_71 * 10, 0, 0);
    group.add(S.gateFinish.group);

    /* xe thí nghiệm */
    S.car = buildCar();
    S.car.group.position.set(x0 - CAR_LENGTH_71 / 2, 0, 0);
    group.add(S.car.group);

    /* quạt tạo gió ngược chiều xe */
    S.fan = buildFan();
    S.fan.group.position.set(7.1, 0, 0);
    group.add(S.fan.group);

    /* vệt gió */
    S.streaks = [];
    var i;
    for (i = 0; i < 16; i++) {
      var streak = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.5, 0.012, 0.012),
        new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0, depthWrite: false }));
      streak.position.set(x0 + Math.random() * 13, 0.15 + Math.random() * 0.8, -0.85 + Math.random() * 1.7);
      streak.userData.speed = 0.8 + Math.random() * 0.6;
      group.add(streak);
      S.streaks.push(streak);
    }

    /* ba bảng LED 3D + bảng phụ */
    S.labelDistance = addLedPanel(group, -4.4, 2.5, -1.4, 4.0, 's = 10.0 m',
      { color: '#7dffb2', font: '"Consolas","Courier New",monospace' }, true);
    S.labelTime = addLedPanel(group, 0, 2.5, -1.4, 4.0, 'Thời gian t = 0.00 s',
      { color: '#ffd54a', font: '"Consolas","Courier New",monospace' }, true);
    S.labelSpeed = addLedPanel(group, 4.4, 2.5, -1.4, 4.0, 'v = 0.00 m/s = 0.00 km/h',
      { color: '#4fc3ff', font: '"Consolas","Courier New",monospace' }, true);
    S.labelInfo = addLedPanel(group, 0, 1.55, -1.4, 6.2, 'k = 0.00',
      { color: '#ff9e80', fontSize: 52 }, false);

    S.simulation = { time: 0, phase: 'run', hold: 0, lastDistance: 0 };
    return S;
  }

  function computeParameters71(p1, p2, p3) {
    var s = clamp(toNumber(p1, 10), 1, 50);
    var t = clamp(toNumber(p2, 5), 1, 30);
    var k = clamp(toNumber(p3, 0), 0, 1);
    var actualTime = t * (1 + k * 0.5);
    var speed = s / actualTime;               /* v = s / (t * (1 + p3 * 0.5)) */
    return { s: s, t: t, k: k, actualTime: actualTime, speed: speed };
  }

  function refreshLabels71(S) {
    var P = S.params;
    updateText3D(S.labelDistance, 's = ' + fmt(P.s, 1) + ' m');
    updateText3D(S.labelTime, 'Thời gian t = ' + fmt(S.simulation.time, 2) + ' s');
    updateText3D(S.labelSpeed, 'v = ' + fmt(P.speed, 2) + ' m/s = ' + fmt(P.speed * 3.6, 2) + ' km/h');
    updateText3D(S.labelInfo, 'k = ' + fmt(P.k, 2) + ' | t đặt ' + fmt(P.t, 1) + ' s → t thực ' + fmt(P.actualTime, 2) + ' s');
  }

  function update71(S, p1, p2, p3) {
    var P = computeParameters71(p1, p2, p3);
    S.params = P;
    var finishX = START_X_71 + P.s * SCALE_71;
    S.gateFinish.group.position.x = finishX;
    S.markFinish.position.x = finishX;
    /* chạy lại thí nghiệm từ đầu khi đổi thông số */
    S.simulation.time = 0;
    S.simulation.phase = 'run';
    S.simulation.hold = 0;
    S.simulation.lastDistance = 0;
    S.car.group.position.x = START_X_71 - CAR_LENGTH_71 / 2;
    S.gateFinish.setLedColor(0xff2a2a);
    refreshLabels71(S);
  }

  function animate71(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters71(p1, p2, p3);
      if (!P || fresh.s !== P.s || fresh.t !== P.t || fresh.k !== P.k) {
        update71(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    var sim = S.simulation;
    var playback = Math.max(1, P.actualTime / 8);   /* tua nhanh nếu thí nghiệm quá dài */

    if (sim.phase === 'run') {
      sim.time += dt * playback;
      if (sim.time >= P.actualTime) {
        sim.time = P.actualTime;
        sim.phase = 'hold';
        sim.hold = 0;
      }
    } else {
      sim.hold += dt;
      if (sim.hold >= 1.8) {
        sim.phase = 'run';
        sim.time = 0;
        sim.lastDistance = 0;
        S.gateFinish.setLedColor(0xff2a2a);
      }
    }

    var distance = Math.min(P.speed * sim.time, P.s);
    var frontX = START_X_71 + distance * SCALE_71;
    S.car.group.position.x = frontX - CAR_LENGTH_71 / 2;

    /* bánh xe lăn không trượt */
    var deltaDistance = distance - sim.lastDistance;
    if (deltaDistance > 0) {
      var spin = deltaDistance * SCALE_71 / WHEEL_RADIUS_71;
      var w;
      for (w = 0; w < S.car.wheels.length; w++) {
        S.car.wheels[w].rotation.z -= spin;
      }
    }
    sim.lastDistance = distance;

    /* đèn LED cổng đích: đỏ -> xanh lá khi xe tới đích */
    var reachedFinish = (sim.time >= P.actualTime - 1e-6);
    S.gateFinish.setLedColor(reachedFinish ? 0x00e676 : 0xff2a2a);

    /* tia laser bị xe che khi xe đi qua cổng */
    var startBlocked = (START_X_71 <= frontX + 0.02) && (START_X_71 >= frontX - CAR_LENGTH_71 - 0.02);
    var finishX = START_X_71 + P.s * SCALE_71;
    var finishBlocked = (finishX <= frontX + 0.02) && (finishX >= frontX - CAR_LENGTH_71 - 0.02);
    S.gateStart.setBeamVisible(!startBlocked);
    S.gateFinish.setBeamVisible(!finishBlocked);
    var pulse = 0.3 + 0.12 * Math.sin(performance.now() * 0.012);
    S.gateStart.beamGlow.material.opacity = pulse;
    S.gateFinish.beamGlow.material.opacity = pulse;

    /* quạt và vệt gió phụ thuộc hệ số cản gió */
    S.fan.blades.rotation.x += dt * (2 + P.k * 30);
    var s;
    for (s = 0; s < S.streaks.length; s++) {
      var streak = S.streaks[s];
      streak.position.x -= dt * streak.userData.speed * (2 + P.k * 9);
      if (streak.position.x < START_X_71 - 0.8) {
        streak.position.x = 6.8 + Math.random() * 0.4;
        streak.position.y = 0.15 + Math.random() * 0.8;
        streak.position.z = -0.85 + Math.random() * 1.7;
      }
      streak.material.opacity = 0.6 * P.k;
    }

    updateText3D(S.labelTime, 'Thời gian t = ' + fmt(sim.time, 2) + ' s');
  }

  /* ===========================================================================
   * 4. BÀI 7-2: TẦN SỐ VÀ ĐỘ CAO CỦA ÂM
   * ========================================================================= */
  var WAVE_POINT_COUNT = 420;
  var WAVE_HALF_WIDTH = 1.8;
  var RING_POOL_SIZE = 22;
  var RING_START_X = -3.7;
  var RING_TRAVEL_LENGTH = 5.3;
  var SPEAKER_X = -4.3;
  var SCOPE_X = 4.3;
  var SCOPE_SCREEN_Y = 2.45;

  function makeScopeTexture() {
    var W = 1024;
    var H = 752;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var background = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
    background.addColorStop(0, '#08301f');
    background.addColorStop(1, '#010806');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    var divisionsX = 10;
    var divisionsY = 8;
    var i;
    ctx.strokeStyle = 'rgba(80,255,170,0.30)';
    ctx.lineWidth = 1.5;
    for (i = 0; i <= divisionsX; i++) {
      ctx.beginPath();
      ctx.moveTo(i * W / divisionsX, 0);
      ctx.lineTo(i * W / divisionsX, H);
      ctx.stroke();
    }
    for (i = 0; i <= divisionsY; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * H / divisionsY);
      ctx.lineTo(W, i * H / divisionsY);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = '#55ffaa';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(130,255,200,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(130,255,200,0.7)';
    ctx.lineWidth = 1.5;
    for (i = 0; i <= divisionsX * 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * W / (divisionsX * 5), H / 2 - 9);
      ctx.lineTo(i * W / (divisionsX * 5), H / 2 + 9);
      ctx.stroke();
    }
    for (i = 0; i <= divisionsY * 5; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 - 9, i * H / (divisionsY * 5));
      ctx.lineTo(W / 2 + 9, i * H / (divisionsY * 5));
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(80,255,170,0.55)';
    ctx.strokeRect(3, 3, W - 6, H - 6);
    return canvasTexture(canvas);
  }

  /* Dải ruy-băng đa giác dùng để vẽ đường sóng mượt, có độ dày */
  function createRibbon(pointCount, color, opacity, additive) {
    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(pointCount * 2 * 3);
    var indices = [];
    var i;
    for (i = 0; i < pointCount - 1; i++) {
      var a = i * 2;
      var b = a + 1;
      var c = a + 2;
      var d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    var material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh: mesh, geometry: geometry, positions: positions, count: pointCount };
  }

  function fillRibbon(ribbon, xs, ys, halfThickness) {
    var n = ribbon.count;
    var positions = ribbon.positions;
    var i;
    for (i = 0; i < n; i++) {
      var previous = Math.max(0, i - 1);
      var next = Math.min(n - 1, i + 1);
      var tangentX = xs[next] - xs[previous];
      var tangentY = ys[next] - ys[previous];
      var length = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
      var normalX = -tangentY / length;
      var normalY = tangentX / length;
      var base = i * 6;
      positions[base] = xs[i] + normalX * halfThickness;
      positions[base + 1] = ys[i] + normalY * halfThickness;
      positions[base + 2] = 0;
      positions[base + 3] = xs[i] - normalX * halfThickness;
      positions[base + 4] = ys[i] - normalY * halfThickness;
      positions[base + 5] = 0;
    }
    ribbon.geometry.attributes.position.needsUpdate = true;
  }

  function buildTuningFork(parent, centerX) {
    var fork = new THREE.Group();
    fork.position.set(centerX, 0, 0);
    parent.add(fork);

    var wood = standardMaterial(0xffffff, 0.0, 0.6, { map: makeWoodTexture() });
    addMesh(new THREE.BoxGeometry(1.5, 0.8, 0.8), wood, 0, 0.4, 0, fork);
    var opening = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ color: 0x0b0704 }));
    opening.rotation.y = Math.PI / 2;
    opening.position.set(0.752, 0.4, 0);
    fork.add(opening);
    addMesh(new THREE.TorusGeometry(0.28, 0.025, 8, 32), standardMaterial(0x4a2f17, 0.2, 0.6), 0.754, 0.4, 0, fork)
      .rotation.y = Math.PI / 2;

    var chrome = physicalMaterial(0xf2f5f9, 1.0, 0.08, { clearcoat: 1, envMapIntensity: 1.7 });
    addMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.65, 20), chrome, 0, 1.125, 0, fork);
    var bottom = addMesh(new THREE.TorusGeometry(0.18, 0.045, 14, 40, Math.PI), chrome, 0, 1.45, 0, fork);
    bottom.rotation.z = Math.PI;                  /* nửa cung phía dưới */

    var prongGeometry = new THREE.CylinderGeometry(0.045, 0.045, 1.6, 20);
    var left = new THREE.Group();
    left.position.set(-0.18, 1.45, 0);
    addMesh(prongGeometry, chrome, 0, 0.8, 0, left);
    fork.add(left);
    var right = new THREE.Group();
    right.position.set(0.18, 1.45, 0);
    addMesh(prongGeometry, chrome, 0, 0.8, 0, right);
    fork.add(right);

    /* búa cao su */
    addMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 16), standardMaterial(0x333a44, 0.8, 0.3), -1.4, 1.2, 0, fork);
    var mallet = new THREE.Group();
    mallet.position.set(-1.4, 2.4, 0);
    fork.add(mallet);
    var handle = addMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 14), standardMaterial(0xb07a3c, 0.0, 0.6), 0.55, 0, 0, mallet);
    handle.rotation.z = Math.PI / 2;
    var rubberHead = addMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 24), standardMaterial(0xd3322b, 0.0, 0.85), 1.2, 0, 0, mallet);
    rubberHead.rotation.z = Math.PI / 2;
    addMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 12), standardMaterial(0x7d8896, 0.9, 0.3), -1.4, 1.2, 0, fork);

    return { group: fork, left: left, right: right, mallet: mallet };
  }

  function buildSpeaker(parent, centerX) {
    var speaker = new THREE.Group();
    speaker.position.set(centerX, 0, 0);
    parent.add(speaker);
    addMesh(new THREE.BoxGeometry(0.9, 2.0, 1.3), physicalMaterial(0x14171c, 0.3, 0.5, { clearcoat: 0.5 }), 0, 1.0, 0, speaker);
    addMesh(new THREE.BoxGeometry(0.06, 1.9, 1.2), standardMaterial(0x232a34, 0.5, 0.45), 0.46, 1.0, 0, speaker);

    var surround = addMesh(new THREE.TorusGeometry(0.5, 0.05, 12, 48), standardMaterial(0xaab4c2, 0.95, 0.2), 0.5, 1.1, 0, speaker);
    surround.rotation.y = Math.PI / 2;
    var tweeterRing = addMesh(new THREE.TorusGeometry(0.17, 0.025, 10, 32), standardMaterial(0xaab4c2, 0.95, 0.2), 0.5, 1.72, 0, speaker);
    tweeterRing.rotation.y = Math.PI / 2;
    var tweeter = addMesh(new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), standardMaterial(0xe8e0c8, 0.2, 0.4), 0.5, 1.72, 0, speaker);
    tweeter.rotation.z = -Math.PI / 2;

    /* màng loa dao động */
    var coneGroup = new THREE.Group();
    coneGroup.position.set(0.46, 1.1, 0);
    speaker.add(coneGroup);
    var cone = addMesh(new THREE.CylinderGeometry(0.46, 0.14, 0.3, 40, 1, true),
      physicalMaterial(0x2b2f36, 0.4, 0.45, { side: THREE.DoubleSide }), -0.04, 0, 0, coneGroup);
    cone.rotation.z = -Math.PI / 2;
    var dustCap = addMesh(new THREE.SphereGeometry(0.16, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      standardMaterial(0x555c68, 0.7, 0.3), -0.12, 0, 0, coneGroup);
    dustCap.rotation.z = -Math.PI / 2;

    /* đèn báo nguồn */
    addMesh(new THREE.SphereGeometry(0.03, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x00ff66, emissiveIntensity: 2.5 }), 0.49, 0.32, 0.45, speaker);
    return { group: speaker, cone: coneGroup, restX: 0.46 };
  }

  function buildOscilloscope(parent, centerX) {
    var scope = new THREE.Group();
    scope.position.set(centerX, 0, 0);
    parent.add(scope);
    addMesh(roundedBoxGeometry(4.6, 3.8, 1.1, 0.18, 0.06), physicalMaterial(0x27303d, 0.6, 0.35, { clearcoat: 0.7 }), 0, 2.1, 0, scope);
    addMesh(roundedBoxGeometry(4.15, 3.1, 0.1, 0.12, 0.02), standardMaterial(0x07090c, 0.4, 0.5), 0, SCOPE_SCREEN_Y, 0.55, scope);

    var screen = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.8),
      new THREE.MeshBasicMaterial({ map: makeScopeTexture(), toneMapped: false }));
    screen.position.set(0, SCOPE_SCREEN_Y, 0.605);
    scope.add(screen);
    var glassCover = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.8),
      physicalMaterial(0xffffff, 0.0, 0.02, {
        transparent: true, opacity: 0.1, envMap: getEnvironment(), envMapIntensity: 1.5, depthWrite: false
      }));
    glassCover.position.set(0, SCOPE_SCREEN_Y, 0.625);
    scope.add(glassCover);

    /* núm điều chỉnh và đèn báo */
    var knobMaterial = standardMaterial(0xcfd6e0, 0.95, 0.2);
    var k;
    for (k = 0; k < 5; k++) {
      var knob = addMesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 24), knobMaterial, -1.6 + k * 0.8, 0.7, 0.62, scope);
      knob.rotation.x = Math.PI / 2;
      var marker = addMesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), standardMaterial(0xff3d00, 0.2, 0.4), -1.6 + k * 0.8, 0.74, 0.7, scope);
      marker.rotation.z = k * 0.6;
    }
    addMesh(new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x00ff66, emissiveIntensity: 2.5 }), 2.0, 0.7, 0.6, scope);
    addMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20), standardMaterial(0x15181d, 0.3, 0.6), -2.0, 0.2, 0.3, scope);
    addMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20), standardMaterial(0x15181d, 0.3, 0.6), 2.0, 0.2, 0.3, scope);
    return scope;
  }

  function render72(group) {
    var S = { id: '7-2', params: null, phase: 0, scopePhase: 0, time: 0, ringPhase: 0 };
    addLights(group);
    makeBench(group, 15.6, 4.2, -0.8);

    S.fork = buildTuningFork(group, -6.6);
    addMesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), standardMaterial(0x8892a0, 0.9, 0.3), -8.0, 0.025, 0, group);
    S.speaker = buildSpeaker(group, SPEAKER_X);
    S.scope = buildOscilloscope(group, SCOPE_X);

    /* các vòng sóng âm 3D */
    var ringGeometry = new THREE.TorusGeometry(0.55, 0.03, 12, 64);
    S.rings = [];
    var i;
    for (i = 0; i < RING_POOL_SIZE; i++) {
      var ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x66ddff, emissive: 0x22bbff, emissiveIntensity: 1.2,
        metalness: 0.2, roughness: 0.3, transparent: true, opacity: 0.8, depthWrite: false
      });
      var ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(RING_START_X, 1.1, 0);
      group.add(ring);
      S.rings.push(ring);
    }

    /* đường sóng sin trên màn hình máy hiện sóng */
    S.waveGlow = createRibbon(WAVE_POINT_COUNT, 0x33ff99, 0.28, true);
    S.waveGlow.mesh.position.set(SCOPE_X, SCOPE_SCREEN_Y, 0.63);
    group.add(S.waveGlow.mesh);
    S.waveCore = createRibbon(WAVE_POINT_COUNT, 0xc8ffe2, 1.0, false);
    S.waveCore.mesh.position.set(SCOPE_X, SCOPE_SCREEN_Y, 0.635);
    group.add(S.waveCore.mesh);
    S.waveX = new Float32Array(WAVE_POINT_COUNT);
    S.waveY = new Float32Array(WAVE_POINT_COUNT);
    for (i = 0; i < WAVE_POINT_COUNT; i++) {
      S.waveX[i] = -WAVE_HALF_WIDTH + 2 * WAVE_HALF_WIDTH * i / (WAVE_POINT_COUNT - 1);
    }

    /* bảng số liệu và tên thiết bị */
    var mono = '"Consolas","Courier New",monospace';
    S.labelFrequency = addLedPanel(group, -4.4, 4.6, 0, 4.4, 'Tần số f = 440 Hz', { color: '#ffd54a', font: mono }, false);
    S.labelAmplitude = addLedPanel(group, 0.2, 4.6, 0, 4.0, 'Biên độ A = 2.5 cm', { color: '#ff9e80', font: mono }, false);
    S.labelWavelength = addLedPanel(group, -4.4, 3.8, 0, 4.4, 'λ = v/f', { color: '#4fc3ff', font: mono }, false);
    S.labelPitch = addLedPanel(group, -0.2, 3.8, 0, 3.9, 'Phân loại: Âm trung', { color: '#7dffb2', font: mono }, false);

    var nameStyle = { color: '#dfe9f5', border: '#6f8196', fontSize: 52 };
    var nameFork = createText3D('ÂM THOA', { color: nameStyle.color, border: nameStyle.border, fontSize: 52, width: 2.2 });
    nameFork.position.set(-6.6, 0.4, 0.95);
    group.add(nameFork);
    var nameSpeaker = createText3D('LOA', { color: nameStyle.color, border: nameStyle.border, fontSize: 52, width: 1.6 });
    nameSpeaker.position.set(SPEAKER_X, 0.4, 0.95);
    group.add(nameSpeaker);
    var nameScope = createText3D('MÁY HIỆN SÓNG', { color: nameStyle.color, border: nameStyle.border, fontSize: 52, width: 2.8 });
    nameScope.position.set(SCOPE_X, 0.4, 0.95);
    group.add(nameScope);

    return S;
  }

  function computeParameters72(p1, p2, p3) {
    var f = clamp(toNumber(p1, 440), 50, 2000);
    var A = clamp(toNumber(p2, 2.5), 0.1, 5.0);
    var v = clamp(toNumber(p3, 343), 300, 1500);
    return { f: f, A: A, v: v, wavelength: v / f };
  }

  function classifyPitch(frequency) {
    if (frequency < 300) {
      return { name: 'Âm trầm', color: '#5aa9ff' };
    }
    if (frequency <= 1000) {
      return { name: 'Âm trung', color: '#7dffb2' };
    }
    return { name: 'Âm bổng', color: '#ff7ad9' };
  }

  function drawWave72(S) {
    var P = S.params;
    var amplitudeWorld = 0.1 + (P.A - 0.1) / 4.9 * 1.1;
    var cycles = 1 + 11 * Math.log(P.f / 50) / Math.log(40);
    var i;
    for (i = 0; i < WAVE_POINT_COUNT; i++) {
      var u = (S.waveX[i] + WAVE_HALF_WIDTH) / (2 * WAVE_HALF_WIDTH);
      S.waveY[i] = amplitudeWorld * Math.sin(2 * Math.PI * cycles * u - S.scopePhase);
    }
    fillRibbon(S.waveGlow, S.waveX, S.waveY, 0.055);
    fillRibbon(S.waveCore, S.waveX, S.waveY, 0.016);
    S.cycles = cycles;
    S.amplitudeWorld = amplitudeWorld;
  }

  function update72(S, p1, p2, p3) {
    var P = computeParameters72(p1, p2, p3);
    S.params = P;

    /* tần số hiển thị chậm hơn thực tế để mắt thường nhìn thấy dao động */
    S.visualFrequency = 2 + 12 * (P.f - 50) / 1950;
    S.prongAngle = 0.006 + 0.07 * (P.A - 0.1) / 4.9;
    S.coneAmplitude = 0.01 + 0.07 * (P.A - 0.1) / 4.9;
    var wavelengthRatio = clamp(Math.log(P.wavelength / 0.15) / Math.log(200), 0, 1);
    S.ringSpacing = 0.25 + 0.9 * wavelengthRatio;
    S.ringSpeed = 0.8 + 2.2 * (P.v - 300) / 1200;

    var pitch = classifyPitch(P.f);
    var wavelengthText = P.wavelength < 1 ? fmt(P.wavelength, 3) : fmt(P.wavelength, 2);
    updateText3D(S.labelFrequency, 'Tần số f = ' + fmt(P.f, 0) + ' Hz');
    updateText3D(S.labelAmplitude, 'Biên độ A = ' + fmt(P.A, 1) + ' cm');
    updateText3D(S.labelWavelength, 'λ = v/f = ' + fmt(P.v, 0) + '/' + fmt(P.f, 0) + ' = ' + wavelengthText + ' m');
    updateText3D(S.labelPitch, 'Phân loại: ' + pitch.name, { color: pitch.color, border: pitch.color });

    drawWave72(S);
  }

  function animate72(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters72(p1, p2, p3);
      if (!P || fresh.f !== P.f || fresh.A !== P.A || fresh.v !== P.v) {
        update72(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;
    S.phase += 2 * Math.PI * S.visualFrequency * dt;
    S.scopePhase += 2 * Math.PI * (0.6 + 0.15 * S.visualFrequency) * dt;
    var vibration = Math.sin(S.phase);

    /* hai nhánh âm thoa dao động ngược pha quanh chân nhánh */
    S.fork.left.rotation.z = S.prongAngle * vibration;
    S.fork.right.rotation.z = -S.prongAngle * vibration;

    /* búa cao su gõ định kỳ */
    var swing = 0.5 * Math.pow(Math.abs(Math.sin(S.time * 1.6)), 1.5);
    S.fork.mallet.rotation.z = swing;

    /* màng loa rung theo tần số */
    S.speaker.cone.position.x = S.speaker.restX + S.coneAmplitude * vibration;

    /* vòng sóng âm lan truyền: khoảng cách ~ bước sóng, tốc độ ~ tốc độ truyền âm */
    S.ringPhase += S.ringSpeed * dt;
    var activeRings = Math.min(RING_POOL_SIZE, Math.floor(RING_TRAVEL_LENGTH / S.ringSpacing) + 1);
    var amplitudeFactor = P.A / 5;
    var i;
    for (i = 0; i < S.rings.length; i++) {
      var ring = S.rings[i];
      if (i >= activeRings) {
        ring.visible = false;
        continue;
      }
      ring.visible = true;
      var travelled = (((S.ringPhase - i * S.ringSpacing) % RING_TRAVEL_LENGTH) + RING_TRAVEL_LENGTH) % RING_TRAVEL_LENGTH;
      var fraction = travelled / RING_TRAVEL_LENGTH;
      ring.position.x = RING_START_X + travelled;
      ring.scale.setScalar(0.4 + 0.25 * amplitudeFactor + fraction * 0.7);
      ring.material.opacity = 0.85 * Math.pow(1 - fraction, 0.8);
      ring.material.emissiveIntensity = 0.7 + 1.0 * amplitudeFactor;
    }

    drawWave72(S);
  }

  /* ===========================================================================
   * 5. BÀI 7-3: SỰ PHẢN XẠ ÁNH SÁNG
   * ========================================================================= */
  var PROTRACTOR_RADIUS = 3.4;
  var LASER_TIP_RADIUS = 3.75;
  var RAIL_RADIUS = 4.2;
  var PLANE_HEIGHT_73 = 0.04;

  function makeProtractorTexture() {
    var size = 1024;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var cx = size / 2;
    var cy = size / 2;
    var R = 500;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,210,255,0.16)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(210,244,255,0.95)';
    ctx.stroke();

    /* vòng tròn phụ */
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(210,244,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.45, Math.PI, 2 * Math.PI, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.2, Math.PI, 2 * Math.PI, false);
    ctx.stroke();

    /* vạch chia độ từ 0° đến 90° ở hai bên pháp tuyến */
    var degree;
    var side;
    for (degree = 0; degree <= 90; degree++) {
      var length = 24;
      var lineWidth = 1.5;
      if (degree % 5 === 0) { length = 40; lineWidth = 2.2; }
      if (degree % 10 === 0) { length = 58; lineWidth = 3.2; }
      var sine = Math.sin(degToRad(degree));
      var cosine = Math.cos(degToRad(degree));
      for (side = -1; side <= 1; side += 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(cx + side * sine * R, cy - cosine * R);
        ctx.lineTo(cx + side * sine * (R - length), cy - cosine * (R - length));
        ctx.stroke();
      }
    }
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe27a';
    for (degree = 0; degree <= 90; degree += 10) {
      var radius = R - 92;
      var sx = Math.sin(degToRad(degree));
      var cxs = Math.cos(degToRad(degree));
      for (side = -1; side <= 1; side += 2) {
        if (degree === 0 && side === 1) {
          continue;
        }
        var textY = cy - cxs * radius;
        if (degree === 90) {
          textY -= 20;
        }
        ctx.fillText(String(degree), cx + side * sx * radius, textY);
      }
    }

    /* đường pháp tuyến nét đứt + tâm */
    ctx.setLineDash([14, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - R * 0.62);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  /* Tia sáng: lõi trắng + hai lớp vỏ phát quang (hình trụ đơn vị, kéo dãn theo chiều dài) */
  function createRay(glowColor) {
    var group = new THREE.Group();
    var coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, toneMapped: false });
    var glowInnerMaterial = new THREE.MeshBasicMaterial({
      color: glowColor, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    var glowOuterMaterial = new THREE.MeshBasicMaterial({
      color: glowColor, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    var core = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 12, 1, true), coreMaterial);
    var glowInner = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 16, 1, true), glowInnerMaterial);
    var glowOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 16, 1, true), glowOuterMaterial);
    group.add(glowOuter);
    group.add(glowInner);
    group.add(core);
    return { group: group, core: coreMaterial, glowInner: glowInnerMaterial, glowOuter: glowOuterMaterial };
  }

  function placeRay(ray, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var length = Math.sqrt(dx * dx + dy * dy);
    ray.group.position.set((ax + bx) / 2, (ay + by) / 2, 0);
    ray.group.rotation.z = Math.atan2(-dx, dy);
    ray.group.scale.set(1, Math.max(length, 0.0001), 1);
  }

  function setRayIntensity(ray, intensity, pulse) {
    var factor = 1 + (pulse || 0);
    ray.core.opacity = clamp(0.55 + 0.45 * intensity, 0, 1);
    ray.glowInner.opacity = clamp((0.12 + 0.55 * intensity) * factor, 0, 1);
    ray.glowOuter.opacity = clamp((0.04 + 0.30 * intensity) * factor, 0, 1);
  }

  function buildLaser() {
    var laser = new THREE.Group();     /* trục +x cục bộ trùng hướng tia, đầu phát tại gốc */
    var housing = physicalMaterial(0x39424f, 1.0, 0.18, { clearcoat: 0.8, envMapIntensity: 1.5 });
    var brass = physicalMaterial(0xd8b24a, 1.0, 0.22, { envMapIntensity: 1.5 });
    var body = addMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 32), housing, -0.55, 0, 0, laser);
    body.rotation.z = Math.PI / 2;
    var frontRing = addMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 32), brass, -0.06, 0, 0, laser);
    frontRing.rotation.z = Math.PI / 2;
    var rearCap = addMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 32), brass, -1.05, 0, 0, laser);
    rearCap.rotation.z = Math.PI / 2;
    var lensMaterial = new THREE.MeshStandardMaterial({
      color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 3, roughness: 0.1
    });
    addMesh(new THREE.SphereGeometry(0.075, 20, 16), lensMaterial, 0.0, 0, 0, laser);
    var statusMaterial = new THREE.MeshStandardMaterial({
      color: 0x003300, emissive: 0x00ff66, emissiveIntensity: 2.5
    });
    addMesh(new THREE.SphereGeometry(0.03, 12, 12), statusMaterial, -0.75, 0.15, 0, laser);

    /* giá đỡ kẹp vào đường ray */
    addMesh(new THREE.BoxGeometry(0.5, 0.1, 0.36), standardMaterial(0x1a212b, 0.8, 0.3), -0.45, -0.2, 0, laser);
    addMesh(new THREE.BoxGeometry(0.2, 0.34, 0.3), standardMaterial(0xaab4c2, 0.95, 0.2), -0.45, -0.1, 0, laser);
    return { group: laser, lensMaterial: lensMaterial, statusMaterial: statusMaterial };
  }

  function render73(group) {
    var S = { id: '7-3', params: null, incidentAngle: 45, time: 0 };
    addLights(group);

    /* đế, khung và gương phẳng tráng bạc */
    addMesh(new THREE.BoxGeometry(11.4, 0.5, 5.0), standardMaterial(0x1b222c, 0.6, 0.4), 0, -0.55, 0, group);
    addMesh(new THREE.BoxGeometry(11.2, 0.12, 4.8), standardMaterial(0xaab4c2, 0.95, 0.2), 0, -0.2, 0, group);
    S.mirror = addMesh(new THREE.BoxGeometry(10.8, 0.16, 4.4),
      physicalMaterial(0xe8eef5, 1.0, 0.03, { clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }), 0, -0.08, 0, group);
    S.glassLayer = addMesh(new THREE.BoxGeometry(10.8, 0.04, 4.4),
      physicalMaterial(0xffffff, 0.0, 0.02, {
        transparent: true, opacity: 0.2, envMap: getEnvironment(), envMapIntensity: 1.2, depthWrite: false
      }), 0, 0.02, 0, group);

    /* mặt phẳng làm việc của tia sáng (mặt phẳng xy, nằm trên mặt gương) */
    var plane = new THREE.Group();
    plane.position.set(0, PLANE_HEIGHT_73, 0);
    group.add(plane);
    S.plane = plane;

    /* thước đo độ bán nguyệt 180° trong suốt */
    var protractor = new THREE.Mesh(new THREE.CircleGeometry(PROTRACTOR_RADIUS, 128, 0, Math.PI),
      new THREE.MeshPhysicalMaterial({
        map: makeProtractorTexture(), transparent: true, roughness: 0.12, metalness: 0.0,
        clearcoat: 1, side: THREE.DoubleSide, depthWrite: false
      }));
    protractor.position.set(0, 0, -0.03);
    plane.add(protractor);
    var rim = addMesh(new THREE.TorusGeometry(PROTRACTOR_RADIUS + 0.02, 0.035, 12, 128, Math.PI),
      physicalMaterial(0xcfeaff, 0.8, 0.15), 0, 0, -0.03, plane);
    addMesh(new THREE.BoxGeometry(PROTRACTOR_RADIUS * 2 + 0.2, 0.05, 0.14), standardMaterial(0xcfd6e0, 0.95, 0.2), 0, 0.025, -0.03, plane);

    /* đường ray cung tròn cho đèn laser trượt */
    var rail = addMesh(new THREE.TorusGeometry(RAIL_RADIUS, 0.04, 10, 160, Math.PI),
      standardMaterial(0x39424f, 0.9, 0.3), 0, 0, 0, plane);
    var endPost;
    for (endPost = -1; endPost <= 1; endPost += 2) {
      addMesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), standardMaterial(0xaab4c2, 0.95, 0.2), endPost * RAIL_RADIUS, 0.1, 0, plane);
    }

    /* đường pháp tuyến nét đứt */
    var dashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false });
    var dashY;
    for (dashY = 0.15; dashY < LASER_TIP_RADIUS + 0.4; dashY += 0.3) {
      var dash = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), dashMaterial);
      dash.position.set(0, dashY + 0.08, 0);
      plane.add(dash);
    }

    /* đèn laser kim loại */
    S.laser = buildLaser();
    plane.add(S.laser.group);

    /* tia tới, tia phản xạ */
    S.rayIncident = createRay(0xff2a1a);
    S.rayReflected = createRay(0xff2a1a);
    plane.add(S.rayIncident.group);
    plane.add(S.rayReflected.group);

    /* mũi tên chỉ chiều truyền sáng */
    var arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b2a, toneMapped: false });
    S.arrows = [];
    var a;
    for (a = 0; a < 4; a++) {
      var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 20), arrowMaterial);
      plane.add(arrow);
      S.arrows.push({ mesh: arrow, ray: a < 2 ? 'incident' : 'reflected', phase: (a % 2) * 0.5 });
    }

    /* điểm tới trên gương */
    var hitCore = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    hitCore.position.set(0, 0.01, 0);
    plane.add(hitCore);
    S.hitGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), new THREE.MeshBasicMaterial({
      color: 0xff3a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    S.hitGlow.position.set(0, 0.01, 0);
    plane.add(S.hitGlow);

    /* cung góc tới (vàng) và cung góc phản xạ (xanh lam) */
    S.arcIncidentFill = new THREE.Mesh(new THREE.RingGeometry(0.02, 1.15, 48, 1, Math.PI / 2, 0.0001),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    S.arcIncidentLine = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.19, 48, 1, Math.PI / 2, 0.0001),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    S.arcReflectedFill = new THREE.Mesh(new THREE.RingGeometry(0.02, 1.15, 48, 1, Math.PI / 2, 0.0001),
      new THREE.MeshBasicMaterial({ color: 0x54e1ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    S.arcReflectedLine = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.19, 48, 1, Math.PI / 2, 0.0001),
      new THREE.MeshBasicMaterial({ color: 0x54e1ff, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    var arcs = [S.arcIncidentFill, S.arcIncidentLine, S.arcReflectedFill, S.arcReflectedLine];
    var j;
    for (j = 0; j < arcs.length; j++) {
      arcs[j].position.set(0, 0, 0.02);
      plane.add(arcs[j]);
    }

    /* nhãn chữ 3D */
    S.labelIncident = createText3D('Góc tới i = 45.0°',
      { color: '#ffd54a', width: 2.4, fontSize: 60, depthTest: false });
    S.labelIncident.position.set(-2.0, 1.9, 0.2);
    plane.add(S.labelIncident);
    S.labelReflected = createText3D("Góc phản xạ i' = 45.0°",
      { color: '#54e1ff', width: 2.4, fontSize: 60, depthTest: false });
    S.labelReflected.position.set(2.0, 1.9, 0.2);
    plane.add(S.labelReflected);
    S.labelNormal = createText3D('Pháp tuyến N',
      { color: '#ffffff', border: '#9fb3c8', width: 1.5, fontSize: 56, depthTest: false });
    S.labelNormal.position.set(0.9, 3.1, 0.2);
    plane.add(S.labelNormal);
    S.labelTitle = createText3D("ĐỊNH LUẬT PHẢN XẠ ÁNH SÁNG:  i = i'",
      { color: '#ffffff', border: '#ff6a5a', width: 6.0, fontSize: 56 });
    S.labelTitle.position.set(0, 5.7, 0);
    group.add(S.labelTitle);
    S.labelInfo = createText3D('n = 1.50',
      { color: '#cfe8ff', border: '#7fb2e5', width: 6.2, fontSize: 54, depthTest: false });
    S.labelInfo.position.set(0, 0.55, 2.0);
    S.labelInfo.rotation.x = -0.9;
    group.add(S.labelInfo);

    return S;
  }

  /* Phản xạ Fresnel không phân cực (giá trị 0..1) */
  function fresnelReflectance(angleDegrees, refractiveIndex) {
    var incident = degToRad(angleDegrees);
    var sinTransmitted = clamp(Math.sin(incident) / refractiveIndex, -1, 1);
    var transmitted = Math.asin(sinTransmitted);
    var ci = Math.cos(incident);
    var ct = Math.cos(transmitted);
    var rs = (ci - refractiveIndex * ct) / (ci + refractiveIndex * ct);
    var rp = (refractiveIndex * ci - ct) / (refractiveIndex * ci + ct);
    return 0.5 * (rs * rs + rp * rp);
  }

  function computeParameters73(p1, p2, p3) {
    var incidentAngle = clamp(toNumber(p1, 45), 0, 85);
    var refractiveIndex = clamp(toNumber(p2, 1.5), 1.0, 2.5);
    var intensityPercent = clamp(toNumber(p3, 80), 10, 100);
    return { i: incidentAngle, n: refractiveIndex, intensityPercent: intensityPercent };
  }

  function setArcGeometry(mesh, innerRadius, outerRadius, thetaStart, thetaLength) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(innerRadius, outerRadius, 48, 1, thetaStart, Math.max(thetaLength, 0.0001));
  }

  function update73(S, p1, p2, p3) {
    var P = computeParameters73(p1, p2, p3);
    S.params = P;
    var i = P.i;
    var iRad = degToRad(i);
    var sine = Math.sin(iRad);
    var cosine = Math.cos(iRad);
    var tip = LASER_TIP_RADIUS;

    /* đèn laser trượt trên vòng cung, luôn hướng về tâm gương */
    S.laser.group.position.set(-tip * sine, tip * cosine, 0);
    S.laser.group.rotation.z = Math.atan2(-cosine, sine);

    /* tia tới và tia phản xạ đối xứng qua pháp tuyến (i' = i) */
    placeRay(S.rayIncident, -tip * sine, tip * cosine, 0, 0);
    placeRay(S.rayReflected, 0, 0, tip * sine, tip * cosine);

    var intensity = P.intensityPercent / 100;
    var fresnel = fresnelReflectance(i, P.n);
    var reflectivity = clamp(0.80 + 0.20 * Math.min(1, fresnel * 3), 0, 1);
    S.baseIntensity = intensity;
    S.reflectedIntensity = intensity * reflectivity;
    setRayIntensity(S.rayIncident, S.baseIntensity, 0);
    setRayIntensity(S.rayReflected, S.reflectedIntensity, 0);
    S.hitGlow.material.opacity = 0.2 + 0.5 * S.reflectedIntensity;

    /* vật liệu gương theo chiết suất */
    var surfaceReflectance = Math.pow((P.n - 1) / (P.n + 1), 2);
    S.glassLayer.material.reflectivity = clamp(surfaceReflectance * 4, 0, 1);
    S.glassLayer.material.opacity = 0.14 + 0.08 * (P.n - 1);
    S.glassLayer.material.envMapIntensity = 0.6 + 0.5 * P.n;

    /* mũi tên chỉ chiều truyền */
    var k;
    for (k = 0; k < S.arrows.length; k++) {
      var arrowInfo = S.arrows[k];
      if (arrowInfo.ray === 'incident') {
        arrowInfo.mesh.rotation.z = Math.atan2(-sine, -cosine);
        arrowInfo.ax = -tip * sine;
        arrowInfo.ay = tip * cosine;
        arrowInfo.bx = 0;
        arrowInfo.by = 0;
      } else {
        arrowInfo.mesh.rotation.z = Math.atan2(-sine, cosine);
        arrowInfo.ax = 0;
        arrowInfo.ay = 0;
        arrowInfo.bx = tip * sine;
        arrowInfo.by = tip * cosine;
      }
    }

    /* cung góc: góc tới ở bên trái, góc phản xạ ở bên phải, tính từ pháp tuyến */
    setArcGeometry(S.arcIncidentFill, 0.02, 1.15, Math.PI / 2, iRad);
    setArcGeometry(S.arcIncidentLine, 1.12, 1.19, Math.PI / 2, iRad);
    setArcGeometry(S.arcReflectedFill, 0.02, 1.15, Math.PI / 2 - iRad, iRad);
    setArcGeometry(S.arcReflectedLine, 1.12, 1.19, Math.PI / 2 - iRad, iRad);

    /* nhãn chữ 3D đặt ngay tại cung góc */
    var middle = iRad / 2;
    var labelX = 1.65 * Math.sin(middle) + 1.25;
    var labelY = 1.65 * Math.cos(middle) + 0.25;
    S.labelIncident.position.set(-labelX, labelY, 0.2);
    S.labelReflected.position.set(labelX, labelY, 0.2);
    updateText3D(S.labelIncident, 'Góc tới i = ' + fmt(i, 1) + '°');
    updateText3D(S.labelReflected, "Góc phản xạ i' = " + fmt(i, 1) + '°');
    updateText3D(S.labelInfo, 'Chiết suất n = ' + fmt(P.n, 2) + '  |  R = ' + fmt(reflectivity * 100, 0) +
      '%  |  Cường độ sáng = ' + fmt(P.intensityPercent, 0) + '%');
  }

  function animate73(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters73(p1, p2, p3);
      if (!P || fresh.i !== P.i || fresh.n !== P.n || fresh.intensityPercent !== P.intensityPercent) {
        update73(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;

    /* tia sáng lấp lánh nhẹ */
    var shimmer = 0.06 * Math.sin(S.time * 14);
    setRayIntensity(S.rayIncident, S.baseIntensity, shimmer);
    setRayIntensity(S.rayReflected, S.reflectedIntensity, shimmer);
    S.hitGlow.scale.setScalar(1 + 0.25 * Math.sin(S.time * 9));
    S.laser.statusMaterial.emissiveIntensity = 1.8 + 1.2 * Math.sin(S.time * 5);
    S.laser.lensMaterial.emissiveIntensity = 2 + 2 * S.baseIntensity;

    /* mũi tên chạy dọc theo tia để chỉ chiều truyền sáng */
    var k;
    for (k = 0; k < S.arrows.length; k++) {
      var info = S.arrows[k];
      var u = ((S.time * 0.35 + info.phase) % 1);
      var t = 0.1 + 0.8 * u;
      info.mesh.position.set(info.ax + (info.bx - info.ax) * t, info.ay + (info.by - info.ay) * t, 0);
      var strength = info.ray === 'incident' ? S.baseIntensity : S.reflectedIntensity;
      info.mesh.scale.setScalar(0.7 + 0.3 * strength);
    }
  }


  /* ===========================================================================
   * 7. DỮ LIỆU 20 NGUYÊN TỐ ĐẦU TIÊN + TIỆN ÍCH DÙNG CHUNG (7-4, 7-5)
   * ========================================================================= */
  var ELEMENTS_20 = [
    { z: 1, symbol: 'H', name: 'Hiđro', mass: 1.008, neutrons: 0, period: 1, group: 1, category: 'nonmetal', melting: -259.16, boiling: -252.87, color: 0xf2f2f2 },
    { z: 2, symbol: 'He', name: 'Heli', mass: 4.0026, neutrons: 2, period: 1, group: 18, category: 'noble', melting: -272.2, boiling: -268.93, color: 0xd9ffff },
    { z: 3, symbol: 'Li', name: 'Liti', mass: 6.94, neutrons: 4, period: 2, group: 1, category: 'alkali', melting: 180.5, boiling: 1342, color: 0xcc80ff },
    { z: 4, symbol: 'Be', name: 'Beri', mass: 9.0122, neutrons: 5, period: 2, group: 2, category: 'alkaline', melting: 1287, boiling: 2470, color: 0xc2ff00 },
    { z: 5, symbol: 'B', name: 'Bo', mass: 10.81, neutrons: 6, period: 2, group: 13, category: 'metalloid', melting: 2076, boiling: 3927, color: 0xffb5b5 },
    { z: 6, symbol: 'C', name: 'Cacbon', mass: 12.011, neutrons: 6, period: 2, group: 14, category: 'nonmetal', melting: 3550, boiling: 4027, color: 0x666666 },
    { z: 7, symbol: 'N', name: 'Nitơ', mass: 14.007, neutrons: 7, period: 2, group: 15, category: 'nonmetal', melting: -210.0, boiling: -195.79, color: 0x3050f8 },
    { z: 8, symbol: 'O', name: 'Oxi', mass: 15.999, neutrons: 8, period: 2, group: 16, category: 'nonmetal', melting: -218.79, boiling: -182.95, color: 0xff0d0d },
    { z: 9, symbol: 'F', name: 'Flo', mass: 18.998, neutrons: 10, period: 2, group: 17, category: 'nonmetal', melting: -219.67, boiling: -188.11, color: 0x90e050 },
    { z: 10, symbol: 'Ne', name: 'Neon', mass: 20.180, neutrons: 10, period: 2, group: 18, category: 'noble', melting: -248.59, boiling: -246.08, color: 0xb3e3f5 },
    { z: 11, symbol: 'Na', name: 'Natri', mass: 22.990, neutrons: 12, period: 3, group: 1, category: 'alkali', melting: 97.8, boiling: 883, color: 0xab5cf2 },
    { z: 12, symbol: 'Mg', name: 'Magie', mass: 24.305, neutrons: 12, period: 3, group: 2, category: 'alkaline', melting: 650, boiling: 1090, color: 0x8aff00 },
    { z: 13, symbol: 'Al', name: 'Nhôm', mass: 26.982, neutrons: 14, period: 3, group: 13, category: 'metal', melting: 660.3, boiling: 2519, color: 0xbfa6a6 },
    { z: 14, symbol: 'Si', name: 'Silic', mass: 28.085, neutrons: 14, period: 3, group: 14, category: 'metalloid', melting: 1414, boiling: 3265, color: 0xf0c8a0 },
    { z: 15, symbol: 'P', name: 'Photpho', mass: 30.974, neutrons: 16, period: 3, group: 15, category: 'nonmetal', melting: 44.15, boiling: 280.5, color: 0xff8000 },
    { z: 16, symbol: 'S', name: 'Lưu huỳnh', mass: 32.06, neutrons: 16, period: 3, group: 16, category: 'nonmetal', melting: 115.21, boiling: 444.6, color: 0xffff30 },
    { z: 17, symbol: 'Cl', name: 'Clo', mass: 35.45, neutrons: 18, period: 3, group: 17, category: 'nonmetal', melting: -101.5, boiling: -34.04, color: 0x1ff01f },
    { z: 18, symbol: 'Ar', name: 'Agon', mass: 39.948, neutrons: 22, period: 3, group: 18, category: 'noble', melting: -189.34, boiling: -185.85, color: 0x80d1e3 },
    { z: 19, symbol: 'K', name: 'Kali', mass: 39.098, neutrons: 20, period: 4, group: 1, category: 'alkali', melting: 63.38, boiling: 759, color: 0x8f40d4 },
    { z: 20, symbol: 'Ca', name: 'Canxi', mass: 40.078, neutrons: 20, period: 4, group: 2, category: 'alkaline', melting: 842, boiling: 1484, color: 0x3dff00 }
  ];

  var CATEGORY_INFO = {
    alkali: { label: 'Kim loại kiềm', color: 0xff5252, css: '#ff5252' },
    alkaline: { label: 'Kiềm thổ', color: 0xffb300, css: '#ffb300' },
    metal: { label: 'Kim loại khác', color: 0x90a4ae, css: '#b0bec5' },
    metalloid: { label: 'Á kim', color: 0x26c6da, css: '#26c6da' },
    nonmetal: { label: 'Phi kim', color: 0x66bb6a, css: '#81c784' },
    noble: { label: 'Khí hiếm', color: 0xab47bc, css: '#ce93d8' }
  };

  var CATEGORY_ORDER = ['alkali', 'alkaline', 'metal', 'metalloid', 'nonmetal', 'noble'];
  var GROUP_ROMAN = { 1: 'IA', 2: 'IIA', 13: 'IIIA', 14: 'IVA', 15: 'VA', 16: 'VIA', 17: 'VIIA', 18: 'VIIIA' };
  var SHELL_CAPACITY = [2, 8, 8, 2];
  var SHELL_NAMES = ['K', 'L', 'M', 'N'];

  /* Cấu hình electron theo quy tắc của chương trình: K tối đa 2, L tối đa 8, M tối đa 8, N tối đa 2 */
  function electronConfiguration(z) {
    var remaining = z;
    var result = [];
    var k;
    for (k = 0; k < SHELL_CAPACITY.length; k++) {
      var count = Math.min(SHELL_CAPACITY[k], remaining);
      result.push(count);
      remaining -= count;
    }
    return result;
  }

  function configurationText(config) {
    var parts = [];
    var k;
    for (k = 0; k < config.length; k++) {
      if (config[k] > 0) {
        parts.push(String(config[k]));
      }
    }
    return parts.join(' - ');
  }

  function seededRandom(index, salt) {
    var x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function gaussianNoise() {
    return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  }

  /* Nhãn nhỏ (kích thước canvas tuỳ chọn) dùng cho tiêu đề cột, chú giải... */
  function createTag(text, cssColor, canvasWidth, canvasHeight, worldWidth, fontSize) {
    var canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    var ctx = canvas.getContext('2d');
    roundedRectanglePath(ctx, 6, 6, canvasWidth - 12, canvasHeight - 12, 20);
    ctx.fillStyle = 'rgba(8,16,28,0.85)';
    ctx.fill();
    ctx.save();
    ctx.shadowColor = cssColor;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 4;
    ctx.strokeStyle = cssColor;
    ctx.stroke();
    ctx.restore();
    var size = fontSize || 60;
    ctx.font = 'bold ' + size + 'px "Segoe UI", Arial, sans-serif';
    while (ctx.measureText(text).width > canvasWidth - 36 && size > 14) {
      size -= 2;
      ctx.font = 'bold ' + size + 'px "Segoe UI", Arial, sans-serif';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2 + 2);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldWidth * canvasHeight / canvasWidth),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(canvas), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      }));
    mesh.renderOrder = 10;
    return mesh;
  }

  /* ===========================================================================
   * 8. BÀI 7-4: XÂY DỰNG MÔ HÌNH NGUYÊN TỬ BOHR
   * ========================================================================= */
  var BOHR_RADII = [1.2, 1.9, 2.6, 3.3];
  var NUCLEON_POOL_SIZE = 40;
  var ELECTRON_POOL_SIZE = 20;

  function render74(group) {
    var S = { id: '7-4', params: null, time: 0, shellAngles: [0, 0, 0, 0] };
    addLights(group);

    /* bệ đỡ phát sáng */
    addMesh(new THREE.CylinderGeometry(4.6, 4.9, 0.4, 64), standardMaterial(0x1b222c, 0.7, 0.35), 0, -0.2, 0, group);
    var baseRing = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.035, 12, 160),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false }));
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.01;
    group.add(baseRing);

    S.atom = new THREE.Group();
    S.atom.position.set(0, 2.6, 0);
    group.add(S.atom);

    /* hạt nhân: proton đỏ phát sáng, nơtron xám bạc */
    S.nucleus = new THREE.Group();
    S.atom.add(S.nucleus);
    S.protonMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1, clearcoat: 1
    });
    S.neutronMaterial = physicalMaterial(0xc9ced6, 0.8, 0.3, { clearcoat: 0.6 });
    var nucleonGeometry = new THREE.SphereGeometry(0.12, 20, 16);
    S.nucleons = [];
    var i;
    for (i = 0; i < NUCLEON_POOL_SIZE; i++) {
      var nucleon = new THREE.Mesh(nucleonGeometry, S.neutronMaterial);
      nucleon.castShadow = true;
      S.nucleus.add(nucleon);
      S.nucleons.push(nucleon);
    }
    S.nucleusHalo = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({
      color: 0xff5a3a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    S.atom.add(S.nucleusHalo);

    /* mặt phẳng quỹ đạo nghiêng để dễ quan sát */
    S.tilt = new THREE.Group();
    S.tilt.rotation.set(-0.95, 0, 0.18);
    S.atom.add(S.tilt);

    S.orbits = [];
    S.shellLabels = [];
    var k;
    for (k = 0; k < 4; k++) {
      var radius = BOHR_RADII[k];
      var ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 12, 160), new THREE.MeshStandardMaterial({
        color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.95
      }));
      var glow = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.07, 10, 160), new THREE.MeshBasicMaterial({
        color: 0x00cfff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      S.tilt.add(ring);
      S.tilt.add(glow);
      S.orbits.push({ ring: ring, glow: glow, radius: radius });

      var shellLabel = createText3D(SHELL_NAMES[k], { color: '#7df9ff', width: 1.5, fontSize: 70, depthTest: false });
      shellLabel.position.set(Math.cos(2.25) * (radius + 0.3), Math.sin(2.25) * (radius + 0.3), 0.05);
      S.tilt.add(shellLabel);
      S.shellLabels.push(shellLabel);
    }

    /* electron vàng phát sáng */
    var electronGeometry = new THREE.SphereGeometry(0.1, 20, 16);
    var electronHaloGeometry = new THREE.SphereGeometry(0.2, 16, 12);
    S.electronMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc400, emissive: 0xffa000, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.3
    });
    var haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd24a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
    });
    S.electrons = [];
    for (i = 0; i < ELECTRON_POOL_SIZE; i++) {
      var electron = new THREE.Mesh(electronGeometry, S.electronMaterial);
      electron.add(new THREE.Mesh(electronHaloGeometry, haloMaterial));
      electron.visible = false;
      S.tilt.add(electron);
      S.electrons.push({ mesh: electron, shell: 0, index: 0, count: 1 });
    }

    /* bảng thông tin lớn phía trên */
    S.labelName = addLedPanel(group, 0, 7.3, 0, 7.0, 'Natri (Na)  —  Z = 11',
      { color: '#ffd54a', fontSize: 64, font: '"Consolas","Courier New",monospace' }, false);
    S.labelParticles = addLedPanel(group, 0, 6.25, 0, 7.6, 'Proton p = 11  |  Electron e = 11  |  Nơtron n = 12',
      { color: '#ff8a80', fontSize: 56 }, false);
    S.labelConfig = addLedPanel(group, 0, 5.2, 0, 7.0, 'Cấu hình: 2 - 8 - 1',
      { color: '#7df9ff', fontSize: 62, font: '"Consolas","Courier New",monospace' }, false);
    return S;
  }

  function computeParameters74(p1, p2, p3) {
    var z = Math.round(clamp(toNumber(p1, 11), 1, 20));
    var shells = Math.round(clamp(toNumber(p2, 3), 1, 4));
    var speed = clamp(toNumber(p3, 1), 0.5, 5);
    return { z: z, shells: shells, speed: speed };
  }

  function update74(S, p1, p2, p3) {
    var P = computeParameters74(p1, p2, p3);
    var element = ELEMENTS_20[P.z - 1];
    var config = electronConfiguration(P.z);
    P.element = element;
    P.config = config;
    S.params = P;

    /* hạt nhân: số hạt thay đổi thực tế theo Z (proton = Z, nơtron = A - Z) */
    var total = P.z + element.neutrons;
    var nucleusRadius = 0.12 * Math.pow(total, 1 / 3) * 1.25;
    var accumulator = 0;
    var i;
    for (i = 0; i < S.nucleons.length; i++) {
      var nucleon = S.nucleons[i];
      if (i >= total) {
        nucleon.visible = false;
        continue;
      }
      nucleon.visible = true;
      if (total === 1) {
        nucleon.position.set(0, 0, 0);
      } else {
        var phi = Math.acos(1 - 2 * (i + 0.5) / total);
        var theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
        var r = nucleusRadius * Math.pow((i + 0.5) / total, 1 / 3);
        nucleon.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      }
      accumulator += P.z;
      if (accumulator >= total) {
        accumulator -= total;
        nucleon.material = S.protonMaterial;
      } else {
        nucleon.material = S.neutronMaterial;
      }
    }
    S.nucleusHalo.scale.setScalar(nucleusRadius + 0.22);

    /* quỹ đạo và nhãn lớp */
    var k;
    for (k = 0; k < 4; k++) {
      var visible = (k < P.shells);
      S.orbits[k].ring.visible = visible;
      S.orbits[k].glow.visible = visible;
      S.shellLabels[k].visible = visible;
      S.orbits[k].ring.material.opacity = config[k] > 0 ? 0.95 : 0.35;
      updateText3D(S.shellLabels[k], 'Lớp ' + SHELL_NAMES[k] + ': ' + config[k] + 'e');
    }

    /* electron: phân bố đúng số lượng trên từng lớp */
    var slot = 0;
    for (k = 0; k < P.shells; k++) {
      var j;
      for (j = 0; j < config[k]; j++) {
        if (slot < S.electrons.length) {
          S.electrons[slot].shell = k;
          S.electrons[slot].index = j;
          S.electrons[slot].count = config[k];
          S.electrons[slot].mesh.visible = true;
          slot++;
        }
      }
    }
    var e;
    for (e = slot; e < S.electrons.length; e++) {
      S.electrons[e].mesh.visible = false;
    }
    placeElectrons74(S);

    var usedShells = 0;
    for (k = 0; k < 4; k++) {
      if (config[k] > 0) {
        usedShells++;
      }
    }
    var configText = 'Cấu hình: ' + configurationText(config);
    if (P.shells < usedShells) {
      configText += '  (đang hiển thị ' + P.shells + '/' + usedShells + ' lớp)';
    }
    updateText3D(S.labelName, element.name + ' (' + element.symbol + ')  —  Z = ' + P.z);
    updateText3D(S.labelParticles, 'Proton p = ' + P.z + '  |  Electron e = ' + P.z + '  |  Nơtron n = ' + element.neutrons);
    updateText3D(S.labelConfig, configText);
  }

  function placeElectrons74(S) {
    var e;
    for (e = 0; e < S.electrons.length; e++) {
      var info = S.electrons[e];
      if (!info.mesh.visible) {
        continue;
      }
      var angle = S.shellAngles[info.shell] + info.index * 2 * Math.PI / info.count;
      var radius = BOHR_RADII[info.shell];
      info.mesh.position.set(radius * Math.cos(angle), radius * Math.sin(angle), 0);
    }
  }

  function animate74(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters74(p1, p2, p3);
      if (!P || fresh.z !== P.z || fresh.shells !== P.shells || fresh.speed !== P.speed) {
        update74(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;
    var k;
    for (k = 0; k < 4; k++) {
      S.shellAngles[k] += dt * (1.8 / (k + 1)) * P.speed;     /* lớp trong quay nhanh hơn */
    }
    placeElectrons74(S);
    var pulse = 1 + 0.12 * Math.sin(S.time * 4);
    var e;
    for (e = 0; e < S.electrons.length; e++) {
      S.electrons[e].mesh.scale.setScalar(pulse);
    }
    S.nucleus.rotation.y += dt * 0.35 * P.speed;
    S.nucleus.rotation.x += dt * 0.18 * P.speed;
    S.protonMaterial.emissiveIntensity = 0.85 + 0.3 * Math.sin(S.time * 3);
  }

  /* ===========================================================================
   * 9. BÀI 7-5: BẢNG TUẦN HOÀN MINI 3D (20 NGUYÊN TỐ ĐẦU)
   * ========================================================================= */
  var TABLE_CENTER_X = -2.6;
  var SAMPLE_X = 5.7;
  var SAMPLE_Y = 2.0;
  var SAMPLE_HALF = 1.1;
  var SAMPLE_PARTICLE_RADIUS = 0.13;

  function tableColumn(group) {
    return group <= 2 ? group - 1 : group - 11;
  }

  function makeElementCellTexture(element) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var css = CATEGORY_INFO[element.category].css;
    ctx.clearRect(0, 0, 256, 256);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillText(String(element.z), 18, 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = css;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.fillText(element.symbol, 128, 112);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText(element.name, 128, 188);
    ctx.fillStyle = css;
    ctx.font = '26px Arial, sans-serif';
    ctx.fillText(fmt(element.mass, element.mass < 10 ? 3 : 2), 128, 224);
    return canvasTexture(canvas);
  }

  function render75(group) {
    var S = { id: '7-5', params: null, time: 0, selected: 10, initialized: false, state: 'solid' };
    addLights(group);
    makeBench(group, 19.4, 4.6, 0.8);

    /* tấm nền + chân đỡ bảng tuần hoàn */
    addMesh(roundedBoxGeometry(9.2, 4.9, 0.18, 0.15, 0.04), physicalMaterial(0x161d28, 0.7, 0.35, { clearcoat: 0.5 }),
      TABLE_CENTER_X, 3.25, -0.3, group);
    var side;
    for (side = -1; side <= 1; side += 2) {
      addMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 16), standardMaterial(0x8892a0, 0.9, 0.3),
        TABLE_CENTER_X + side * 3.9, 0.4, -0.3, group);
    }

    /* 20 ô nguyên tố: hộp kính phát sáng theo phân loại */
    S.cells = [];
    var cellGeometry = roundedBoxGeometry(0.98, 0.98, 0.22, 0.1, 0.03);
    var edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.98, 0.22));
    var i;
    for (i = 0; i < ELEMENTS_20.length; i++) {
      var element = ELEMENTS_20[i];
      var info = CATEGORY_INFO[element.category];
      var cellGroup = new THREE.Group();
      var baseX = TABLE_CENTER_X + (tableColumn(element.group) - 3.5) * 1.1;
      var baseY = 1.6 + (4 - element.period) * 1.1;
      cellGroup.position.set(baseX, baseY, 0);
      var glass = new THREE.Mesh(cellGeometry, new THREE.MeshPhysicalMaterial({
        color: info.color, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.4,
        emissive: info.color, emissiveIntensity: 0.35, clearcoat: 1,
        envMap: getEnvironment(), envMapIntensity: 1.2, depthWrite: false
      }));
      cellGroup.add(glass);
      var edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: info.color, transparent: true, opacity: 0.9 }));
      cellGroup.add(edges);
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({
        map: makeElementCellTexture(element), transparent: true, depthWrite: false, toneMapped: false
      }));
      plane.position.z = 0.125;
      plane.renderOrder = 5;
      cellGroup.add(plane);
      group.add(cellGroup);
      S.cells.push({ group: cellGroup, glass: glass, baseX: baseX, baseY: baseY, z: 0, scale: 1, opacity: 0.4, emissive: 0.35 });
    }

    /* tiêu đề nhóm (cột) và chu kỳ (hàng) */
    var groups = [1, 2, 13, 14, 15, 16, 17, 18];
    var g;
    for (g = 0; g < groups.length; g++) {
      var headerTag = createTag(GROUP_ROMAN[groups[g]], '#6f8196', 256, 128, 0.9, 64);
      headerTag.position.set(TABLE_CENTER_X + (g - 3.5) * 1.1, 5.95, -0.1);
      group.add(headerTag);
    }
    var p;
    for (p = 1; p <= 4; p++) {
      var periodTag = createTag('Chu kỳ ' + p, '#6f8196', 384, 128, 1.3, 60);
      periodTag.position.set(TABLE_CENTER_X - 5.2, 1.6 + (4 - p) * 1.1, -0.1);
      group.add(periodTag);
    }

    /* chú giải phân loại */
    var c;
    for (c = 0; c < CATEGORY_ORDER.length; c++) {
      var key = CATEGORY_ORDER[c];
      var legend = createTag(CATEGORY_INFO[key].label, CATEGORY_INFO[key].css, 512, 128, 1.75, 62);
      legend.position.set(TABLE_CENTER_X + (c - 2.5) * 1.85, 0.4, 1.0);
      group.add(legend);
    }

    /* khu vực mẫu vật chất */
    addMesh(new THREE.CylinderGeometry(1.5, 1.7, 0.9, 48), standardMaterial(0x1b222c, 0.7, 0.35), SAMPLE_X, 0.45, 0, group);
    var plinthRing = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.03, 10, 96), new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false }));
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.set(SAMPLE_X, 0.91, 0);
    group.add(plinthRing);

    S.sample = new THREE.Group();
    S.sample.position.set(SAMPLE_X, SAMPLE_Y, 0);
    group.add(S.sample);
    S.container = new THREE.Mesh(new THREE.BoxGeometry(SAMPLE_HALF * 2, SAMPLE_HALF * 2, SAMPLE_HALF * 2),
      physicalMaterial(0xdff1ff, 0.0, 0.03, {
        transparent: true, opacity: 0.1, envMap: getEnvironment(), envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false
      }));
    S.sample.add(S.container);
    var containerEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SAMPLE_HALF * 2, SAMPLE_HALF * 2, SAMPLE_HALF * 2)),
      new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.7 }));
    S.sample.add(containerEdges);
    S.liquidBody = new THREE.Mesh(new THREE.BoxGeometry(SAMPLE_HALF * 2 - 0.1, 1.0, SAMPLE_HALF * 2 - 0.1),
      new THREE.MeshPhysicalMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.4, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    S.liquidBody.position.y = -SAMPLE_HALF + 0.55;
    S.sample.add(S.liquidBody);
    S.gasFog = new THREE.Mesh(new THREE.BoxGeometry(SAMPLE_HALF * 2 - 0.1, SAMPLE_HALF * 2 - 0.1, SAMPLE_HALF * 2 - 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
    S.sample.add(S.gasFog);

    /* 27 hạt cấu tạo nên mẫu vật chất */
    S.particleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xab5cf2, roughness: 0.25, metalness: 0.0, clearcoat: 1, envMap: getEnvironment(), envMapIntensity: 1.0
    });
    var particleGeometry = new THREE.SphereGeometry(SAMPLE_PARTICLE_RADIUS, 20, 16);
    S.particles = [];
    var a;
    var b;
    var d;
    var index = 0;
    for (a = 0; a < 3; a++) {
      for (b = 0; b < 3; b++) {
        for (d = 0; d < 3; d++) {
          var mesh = new THREE.Mesh(particleGeometry, S.particleMaterial);
          mesh.castShadow = true;
          S.sample.add(mesh);
          var homeSolid = new THREE.Vector3((a - 1) * 0.55, (b - 1) * 0.55, (d - 1) * 0.55);
          var homeLiquid = new THREE.Vector3(
            (seededRandom(index, 1) - 0.5) * 1.7,
            -0.95 + seededRandom(index, 2) * 0.7,
            (seededRandom(index, 3) - 0.5) * 1.7);
          S.particles.push({
            mesh: mesh, homeSolid: homeSolid, homeLiquid: homeLiquid,
            position: homeSolid.clone(), velocity: new THREE.Vector3(0, 0, 0)
          });
          mesh.position.copy(homeSolid);
          index++;
        }
      }
    }

    /* tia sáng nối ô được chọn với mẫu vật chất */
    S.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8, 1, true), new THREE.MeshBasicMaterial({
      color: 0x4fe3ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    group.add(S.beam);

    /* bảng thông số chi tiết */
    var mono = '"Consolas","Courier New",monospace';
    S.labelZ = addLedPanel(group, SAMPLE_X, 7.0, 0, 5.8, 'Z = 11 — Natri (Na)', { color: '#ffd54a', font: mono }, false);
    S.labelMass = addLedPanel(group, SAMPLE_X, 6.15, 0, 5.8, 'A = 22.990 đvC', { color: '#7dffb2', font: mono }, false);
    S.labelPosition = addLedPanel(group, SAMPLE_X, 5.3, 0, 5.8, 'Chu kỳ 3 | Nhóm IA', { color: '#4fc3ff', fontSize: 54 }, false);
    S.labelState = addLedPanel(group, SAMPLE_X, 4.45, 0, 5.8, 'Ở 25 °C: THỂ RẮN', { color: '#cfd8dc', font: mono }, false);
    S.labelPoints = addLedPanel(group, SAMPLE_X, 3.6, 0, 5.8, 'tnc = 97.8 °C | ts = 883 °C', { color: '#ff9e80', fontSize: 54 }, false);
    return S;
  }

  function computeParameters75(p1, p2, p3) {
    return {
      z: Math.round(clamp(toNumber(p1, 11), 1, 20)),
      temperature: clamp(toNumber(p2, 25), 0, 100),
      agility: clamp(toNumber(p3, 2), 1, 5)
    };
  }

  function update75(S, p1, p2, p3) {
    var P = computeParameters75(p1, p2, p3);
    var element = ELEMENTS_20[P.z - 1];
    var category = CATEGORY_INFO[element.category];
    var state = 'solid';
    if (P.temperature >= element.boiling) {
      state = 'gas';
    } else if (P.temperature >= element.melting) {
      state = 'liquid';
    }
    P.element = element;
    P.state = state;
    var previousState = S.state;
    S.params = P;
    S.state = state;
    S.selected = P.z - 1;

    /* lần đầu: đặt ngay vị trí, không bay từ trạng thái cũ */
    if (!S.initialized) {
      S.initialized = true;
      var i;
      for (i = 0; i < S.cells.length; i++) {
        var isSelected = (i === S.selected);
        S.cells[i].z = isSelected ? 1.5 : 0;
        S.cells[i].scale = isSelected ? 1.35 : 1;
        S.cells[i].opacity = isSelected ? 0.78 : 0.4;
        S.cells[i].emissive = isSelected ? 1.7 : 0.35;
      }
    }

    /* mẫu vật chất */
    var isMetal = (element.category === 'alkali' || element.category === 'alkaline' || element.category === 'metal');
    S.particleMaterial.color.setHex(element.color);
    S.particleMaterial.metalness = (isMetal && state === 'solid') ? 0.85 : 0.0;
    S.particleMaterial.roughness = (isMetal && state === 'solid') ? 0.22 : 0.3;
    S.liquidBody.visible = (state === 'liquid');
    S.liquidBody.material.color.setHex(element.color);
    S.gasFog.visible = (state === 'gas');
    S.gasFog.material.color.setHex(element.color);

    if (state !== previousState && state === 'gas') {
      var j;
      for (j = 0; j < S.particles.length; j++) {
        S.particles[j].velocity.set(gaussianNoise(), gaussianNoise(), gaussianNoise()).multiplyScalar(0.8);
      }
    }

    /* bảng thông số */
    var stateNames = { solid: 'THỂ RẮN', liquid: 'THỂ LỎNG', gas: 'THỂ KHÍ' };
    var stateColors = { solid: '#cfd8dc', liquid: '#4fc3ff', gas: '#ffb74d' };
    var roman = GROUP_ROMAN[element.group];
    updateText3D(S.labelZ, 'Z = ' + element.z + ' — ' + element.name + ' (' + element.symbol + ')');
    updateText3D(S.labelMass, 'A = ' + fmt(element.mass, element.mass < 10 ? 3 : 2) + ' đvC');
    updateText3D(S.labelPosition, 'Chu kỳ ' + element.period + ' | Nhóm ' + roman + ' | ' + category.label,
      { color: category.css });
    updateText3D(S.labelState, 'Ở ' + fmt(P.temperature, 0) + ' °C: ' + stateNames[state],
      { color: stateColors[state] });
    updateText3D(S.labelPoints, 'tnc = ' + fmt(element.melting, 1) + ' °C | ts = ' + fmt(element.boiling, 1) + ' °C');
  }

  function stepSample75(S, dt) {
    var P = S.params;
    var state = P.state;
    var agility = P.agility;
    var tn = P.temperature / 100;
    var limit = SAMPLE_HALF - SAMPLE_PARTICLE_RADIUS - 0.02;
    var step = Math.min(dt, 0.033);
    var spring = 0;
    var damping = 0;
    var noise = 0;
    if (state === 'solid') {
      spring = 60;
      damping = 4;
      noise = 0.6 * agility * (0.4 + 0.6 * tn);
    } else if (state === 'liquid') {
      spring = 3;
      damping = 2;
      noise = 0.8 * (0.5 + 0.5 * agility) * (0.5 + 0.5 * tn);
    }
    var gasSpeed = 1.0 + 0.45 * agility * (0.6 + 0.4 * tn);
    var sqrtStep = Math.sqrt(step);
    var i;
    for (i = 0; i < S.particles.length; i++) {
      var particle = S.particles[i];
      var p = particle.position;
      var v = particle.velocity;
      if (state === 'gas') {
        var speed = v.length() || 1;
        var correction = 1 + (gasSpeed / speed - 1) * Math.min(1, step * 3);
        v.multiplyScalar(correction);
      } else {
        var home = (state === 'liquid') ? particle.homeLiquid : particle.homeSolid;
        v.x += (-spring * (p.x - home.x) - damping * v.x) * step + noise * sqrtStep * gaussianNoise();
        v.y += (-spring * (p.y - home.y) - damping * v.y) * step + noise * sqrtStep * gaussianNoise();
        v.z += (-spring * (p.z - home.z) - damping * v.z) * step + noise * sqrtStep * gaussianNoise();
      }
      p.x += v.x * step;
      p.y += v.y * step;
      p.z += v.z * step;
      if (p.x > limit) { p.x = limit; v.x = -Math.abs(v.x) * 0.9; }
      if (p.x < -limit) { p.x = -limit; v.x = Math.abs(v.x) * 0.9; }
      if (p.y > limit) { p.y = limit; v.y = -Math.abs(v.y) * 0.9; }
      if (p.y < -limit) { p.y = -limit; v.y = Math.abs(v.y) * 0.9; }
      if (p.z > limit) { p.z = limit; v.z = -Math.abs(v.z) * 0.9; }
      if (p.z < -limit) { p.z = -limit; v.z = Math.abs(v.z) * 0.9; }
      particle.mesh.position.copy(p);
    }
  }

  function animate75(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters75(p1, p2, p3);
      if (!P || fresh.z !== P.z || fresh.temperature !== P.temperature || fresh.agility !== P.agility) {
        update75(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;
    var blend = 1 - Math.exp(-dt * 8);
    var i;
    for (i = 0; i < S.cells.length; i++) {
      var cell = S.cells[i];
      var isSelected = (i === S.selected);
      cell.z += ((isSelected ? 1.5 : 0) - cell.z) * blend;
      cell.scale += ((isSelected ? 1.35 : 1) - cell.scale) * blend;
      cell.opacity += ((isSelected ? 0.78 : 0.4) - cell.opacity) * blend;
      cell.emissive += ((isSelected ? 1.7 : 0.35) - cell.emissive) * blend;
      cell.group.position.z = cell.z;
      cell.group.position.y = cell.baseY + (isSelected ? 0.06 * Math.sin(S.time * 2) : 0);
      cell.group.scale.setScalar(cell.scale);
      cell.group.rotation.y = isSelected ? 0.18 * Math.sin(S.time * 1.6) : cell.group.rotation.y * (1 - blend);
      cell.glass.material.opacity = cell.opacity;
      cell.glass.material.emissiveIntensity = cell.emissive;
    }

    /* tia sáng từ ô được chọn tới mẫu vật chất */
    var selectedCell = S.cells[S.selected];
    var from = new THREE.Vector3(selectedCell.group.position.x, selectedCell.group.position.y, selectedCell.group.position.z);
    var to = new THREE.Vector3(SAMPLE_X, SAMPLE_Y + 1.5, 0);
    var direction = new THREE.Vector3().subVectors(to, from);
    var length = direction.length();
    if (length > 0.001) {
      S.beam.position.copy(from).addScaledVector(direction, 0.5);
      S.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      S.beam.scale.set(1, length, 1);
      S.beam.material.opacity = 0.18 + 0.1 * Math.sin(S.time * 3);
    }

    stepSample75(S, dt);
    S.sample.rotation.y += dt * 0.25;
  }

  /* ===========================================================================
   * 10. BÀI 7-6: TỐC ĐỘ PHẢN ỨNG HÓA HỌC (CaCO3 + HCl -> CO2)
   * ========================================================================= */
  var FLASK_NECK_RADIUS = 0.38;
  var FLASK_BASE_RADIUS = 1.2;
  var FLASK_LIQUID_LEVEL = 1.4;
  var STONE_POOL_SIZE = 64;
  var BUBBLE_POOL_SIZE = 90;
  var CALCIUM_CARBONATE_MASS_GRAMS = 5;
  var CALCIUM_CARBONATE_DENSITY = 2.71;

  function flaskInnerRadius(y) {
    if (y <= 0.15) {
      return FLASK_BASE_RADIUS;
    }
    if (y <= 2.0) {
      return FLASK_BASE_RADIUS - (FLASK_BASE_RADIUS - FLASK_NECK_RADIUS) * (y - 0.15) / 1.85;
    }
    return FLASK_NECK_RADIUS;
  }

  function buildFlaskGlassGeometry() {
    var points = [];
    var y;
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(0.9, 0));
    points.push(new THREE.Vector2(1.18, 0.05));
    points.push(new THREE.Vector2(1.24, 0.19));
    for (y = 0.3; y <= 2.0; y += 0.1) {
      points.push(new THREE.Vector2(flaskInnerRadius(y) + 0.04, y));
    }
    points.push(new THREE.Vector2(0.42, 2.05));
    points.push(new THREE.Vector2(0.42, 2.9));
    points.push(new THREE.Vector2(0.5, 2.96));
    points.push(new THREE.Vector2(0.5, 3.0));
    points.push(new THREE.Vector2(0.38, 3.0));
    points.push(new THREE.Vector2(0.38, 2.9));
    points.push(new THREE.Vector2(0.38, 2.05));
    for (y = 2.0; y >= 0.3; y -= 0.1) {
      points.push(new THREE.Vector2(flaskInnerRadius(y), y));
    }
    points.push(new THREE.Vector2(1.18, 0.14));
    points.push(new THREE.Vector2(1.1, 0.07));
    points.push(new THREE.Vector2(0.9, 0.05));
    points.push(new THREE.Vector2(0.001, 0.05));
    return new THREE.LatheGeometry(points, 64);
  }

  function buildLiquidGeometry() {
    var points = [];
    var y;
    points.push(new THREE.Vector2(0.001, 0.06));
    points.push(new THREE.Vector2(1.1, 0.07));
    points.push(new THREE.Vector2(flaskInnerRadius(0.17) - 0.01, 0.17));
    for (y = 0.3; y <= FLASK_LIQUID_LEVEL; y += 0.1) {
      points.push(new THREE.Vector2(flaskInnerRadius(y) - 0.01, y));
    }
    points.push(new THREE.Vector2(flaskInnerRadius(FLASK_LIQUID_LEVEL) - 0.01, FLASK_LIQUID_LEVEL));
    points.push(new THREE.Vector2(0.001, FLASK_LIQUID_LEVEL));
    return new THREE.LatheGeometry(points, 64);
  }

  function createRockGeometry() {
    var geometry = new THREE.IcosahedronGeometry(1, 1);
    var position = geometry.attributes.position;
    var i;
    for (i = 0; i < position.count; i++) {
      var x = position.getX(i);
      var y = position.getY(i);
      var z = position.getZ(i);
      var noise = seededRandom(x * 12.9898 + y * 78.233 + z * 37.719, 1);
      var factor = 0.82 + 0.3 * noise;
      position.setXYZ(i, x * factor, y * factor, z * factor);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function createRockBumpTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    var i;
    for (i = 0; i < 900; i++) {
      var shade = Math.floor(Math.random() * 255);
      ctx.fillStyle = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  function render76(group) {
    var S = { id: '7-6', params: null, time: 0 };
    addLights(group);
    makeBench(group, 15.4, 4.4, 0.2);

    /* bếp gia nhiệt điện tử */
    addMesh(roundedBoxGeometry(3.6, 0.36, 3.2, 0.12, 0.03), physicalMaterial(0x2a313c, 0.7, 0.35, { clearcoat: 0.6 }), 0, 0.18, 0, group);
    addMesh(new THREE.CylinderGeometry(1.55, 1.55, 0.08, 64), standardMaterial(0x14181e, 0.5, 0.3), 0, 0.4, 0, group);
    S.heatMaterials = [];
    var radii = [1.1, 0.75, 0.4];
    var r;
    for (r = 0; r < radii.length; r++) {
      var heatMaterial = new THREE.MeshStandardMaterial({
        color: 0x221008, emissive: 0x331100, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.5
      });
      var coil = new THREE.Mesh(new THREE.TorusGeometry(radii[r], 0.04, 10, 64), heatMaterial);
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.45;
      group.add(coil);
      S.heatMaterials.push(heatMaterial);
    }
    S.plateLabel = createText3D('T = 20 °C', { color: '#ff8a65', width: 1.8, fontSize: 70 });
    S.plateLabel.position.set(0, 0.18, 1.61);
    group.add(S.plateLabel);
    S.statusLedMaterial = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x00ff66, emissiveIntensity: 2.2 });
    addMesh(new THREE.SphereGeometry(0.07, 16, 12), S.statusLedMaterial, -1.35, 0.18, 1.62, group);
    var knob = addMesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 24), standardMaterial(0xcfd6e0, 0.95, 0.2), 1.3, 0.18, 1.64, group);
    knob.rotation.x = Math.PI / 2;
    addMesh(new THREE.BoxGeometry(0.03, 0.1, 0.02), standardMaterial(0xff3d00, 0.2, 0.4), 1.3, 0.22, 1.7, group);

    /* bình tam giác (Erlenmeyer) bằng thủy tinh */
    S.flask = new THREE.Group();
    S.flask.position.set(0, 0.44, 0);
    group.add(S.flask);
    var glass = new THREE.Mesh(buildFlaskGlassGeometry(), new THREE.MeshPhysicalMaterial({
      color: 0xdff4ff, metalness: 0.0, roughness: 0.02, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.02,
      envMap: getEnvironment(), envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false
    }));
    glass.renderOrder = 3;
    S.flask.add(glass);

    /* dung dịch acid */
    S.liquidMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa9dcff, transparent: true, opacity: 0.36, roughness: 0.05, clearcoat: 1, depthWrite: false
    });
    var liquid = new THREE.Mesh(buildLiquidGeometry(), S.liquidMaterial);
    liquid.renderOrder = 2;
    S.flask.add(liquid);
    var surface = new THREE.Mesh(new THREE.CircleGeometry(flaskInnerRadius(FLASK_LIQUID_LEVEL) - 0.01, 48),
      new THREE.MeshBasicMaterial({ color: 0xd8f1ff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = FLASK_LIQUID_LEVEL + 0.002;
    S.flask.add(surface);
    S.foam = new THREE.Mesh(new THREE.CircleGeometry(flaskInnerRadius(FLASK_LIQUID_LEVEL) - 0.05, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }));
    S.foam.rotation.x = -Math.PI / 2;
    S.foam.position.y = FLASK_LIQUID_LEVEL + 0.01;
    S.flask.add(S.foam);

    /* viên đá vôi CaCO3 */
    var rockGeometry = createRockGeometry();
    var rockMaterial = new THREE.MeshStandardMaterial({
      color: 0xe9e5da, roughness: 0.85, metalness: 0.0, bumpMap: createRockBumpTexture(), bumpScale: 1.5
    });
    S.stones = [];
    var i;
    for (i = 0; i < STONE_POOL_SIZE; i++) {
      var stoneMesh = new THREE.Mesh(rockGeometry, rockMaterial);
      stoneMesh.castShadow = true;
      stoneMesh.rotation.set(seededRandom(i, 4) * 6.28, seededRandom(i, 5) * 6.28, seededRandom(i, 6) * 6.28);
      S.flask.add(stoneMesh);
      S.stones.push({ mesh: stoneMesh, x: 0, y: 0, z: 0, r: 0.1 });
    }

    /* bọt khí CO2 */
    var bubbleGeometry = new THREE.SphereGeometry(1, 14, 10);
    var bubbleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.0, clearcoat: 1,
      envMap: getEnvironment(), envMapIntensity: 1.5, depthWrite: false
    });
    S.bubbles = [];
    for (i = 0; i < BUBBLE_POOL_SIZE; i++) {
      var bubbleMesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
      bubbleMesh.renderOrder = 4;
      bubbleMesh.visible = false;
      S.flask.add(bubbleMesh);
      S.bubbles.push({ mesh: bubbleMesh, x: 0, y: 0, z: 0, baseScale: 0.04, speed: 0.6, phase: seededRandom(i, 7) * 6.28, startY: 0 });
    }
    S.activeBubbles = 0;
    S.stoneCount = 4;

    /* bảng số liệu */
    var mono = '"Consolas","Courier New",monospace';
    S.labelTemperature = addLedPanel(group, 4.9, 4.1, 0, 5.0, 'Nhiệt độ: 40 °C', { color: '#ff8a65', font: mono }, false);
    S.labelSurface = addLedPanel(group, 4.9, 3.3, 0, 5.0, 'Diện tích tiếp xúc S = 0 cm²', { color: '#7dffb2', fontSize: 54 }, false);
    S.labelRate = addLedPanel(group, 4.9, 2.5, 0, 5.0, 'Tốc độ thoát khí CO₂ = 0 ml/s', { color: '#4fc3ff', fontSize: 54 }, false);
    S.labelConditions = addLedPanel(group, 4.9, 1.7, 0, 5.0, 'd = 2.0 mm | C = 1.00 mol/L', { color: '#ffd54a', fontSize: 54 }, false);
    S.labelFormula = addLedPanel(group, 4.9, 0.9, 0, 5.0, 'v = k·(1/d)·2^((T−20)/10)·(C+0,02)', { color: '#cfd8dc', fontSize: 46 }, false);
    return S;
  }

  function computeParameters76(p1, p2, p3) {
    var temperature = clamp(toNumber(p1, 40), 20, 90);
    var diameter = clamp(toNumber(p2, 2), 0.1, 5.0);
    var concentration = clamp(toNumber(p3, 1), 0.0, 2.0);

    /* diện tích bề mặt của khối CaCO3 cố định 5 g gồm các hạt cầu đường kính d: S = 6m / (ρ·d) */
    var surfaceCm2 = 6 * CALCIUM_CARBONATE_MASS_GRAMS / (CALCIUM_CARBONATE_DENSITY * (diameter / 10));
    var surfaceRelative = 1 / diameter;                                 /* so với hạt 1 mm */
    var temperatureFactor = Math.pow(2, (temperature - 20) / 10);      /* quy tắc Van't Hoff: +10 °C, tốc độ gấp đôi */
    var rate = 1.0 * surfaceRelative * temperatureFactor * (concentration + 0.02);
    var normalized = clamp(Math.log(rate / 0.004) / Math.LN10 / 5.81, 0, 1);
    return {
      temperature: temperature, diameter: diameter, concentration: concentration,
      surface: surfaceCm2, rate: rate, normalized: normalized
    };
  }

  function layoutStones76(S, diameter) {
    var t = (diameter - 0.1) / 4.9;
    var count = Math.round(clamp(4 + 56 * Math.pow(1 - t, 1.6), 4, 60));
    var radius = 0.045 + 0.2 * Math.pow(t, 0.8);
    var perLayer = Math.max(1, Math.floor(0.81 / (radius * radius * 1.6)));
    var pileRadius = Math.min(0.95 - radius, 0.2 + 0.5 * Math.sqrt(count) * radius * 3);
    var placed = 0;
    var layer = 0;
    while (placed < count) {
      var inLayer = Math.min(perLayer, count - placed);
      var layerRadius = Math.max(0.05, pileRadius * Math.pow(0.85, layer));
      var y = 0.07 + radius * 0.8 + layer * radius * 1.5;
      var j;
      for (j = 0; j < inLayer; j++) {
        var rho = layerRadius * Math.sqrt((j + 0.5) / inLayer);
        var angle = j * 2.39996 + layer * 0.7;
        var stone = S.stones[placed];
        stone.x = rho * Math.cos(angle);
        stone.z = rho * Math.sin(angle);
        stone.y = y;
        stone.r = radius;
        stone.mesh.position.set(stone.x, stone.y, stone.z);
        stone.mesh.scale.set(
          radius * (0.9 + 0.3 * seededRandom(placed, 8)),
          radius * (0.75 + 0.25 * seededRandom(placed, 9)),
          radius * (0.9 + 0.3 * seededRandom(placed, 10)));
        stone.mesh.visible = true;
        placed++;
      }
      layer++;
    }
    var k;
    for (k = count; k < S.stones.length; k++) {
      S.stones[k].mesh.visible = false;
    }
    S.stoneCount = count;
  }

  function respawnBubble76(S, bubble, randomHeight) {
    var stone = S.stones[Math.floor(Math.random() * S.stoneCount)];
    bubble.x = stone.x + (Math.random() - 0.5) * stone.r;
    bubble.z = stone.z + (Math.random() - 0.5) * stone.r;
    bubble.startY = stone.y + stone.r * 0.8;
    bubble.y = randomHeight ? bubble.startY + Math.random() * (FLASK_LIQUID_LEVEL - bubble.startY) : bubble.startY;
    bubble.baseScale = (0.025 + 0.035 * Math.random()) * (0.8 + 0.4 * S.params.normalized);
    bubble.speed = 0.45 + 0.9 * S.params.normalized + 0.4 * Math.random();
  }

  function update76(S, p1, p2, p3) {
    var P = computeParameters76(p1, p2, p3);
    S.params = P;
    layoutStones76(S, P.diameter);
    S.activeBubbles = Math.round(6 + 84 * P.normalized);
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      respawnBubble76(S, S.bubbles[i], true);
      S.bubbles[i].mesh.visible = (i < S.activeBubbles);
    }
    placeBubbles76(S);

    var rateText = P.rate < 10 ? fmt(P.rate, 2) : (P.rate < 100 ? fmt(P.rate, 1) : fmt(P.rate, 0));
    updateText3D(S.labelTemperature, 'Nhiệt độ: ' + fmt(P.temperature, 0) + ' °C');
    updateText3D(S.labelSurface, 'Diện tích tiếp xúc S = ' + fmt(P.surface, 1) + ' cm²');
    updateText3D(S.labelRate, 'Tốc độ thoát khí CO₂ = ' + rateText + ' ml/s');
    updateText3D(S.labelConditions, 'd = ' + fmt(P.diameter, 1) + ' mm | C = ' + fmt(P.concentration, 2) + ' mol/L');
    updateText3D(S.plateLabel, 'T = ' + fmt(P.temperature, 0) + ' °C');

    var heat = (P.temperature - 20) / 70;
    var ledColor = heat < 0.35 ? 0x00ff66 : (heat < 0.7 ? 0xffb300 : 0xff3322);
    S.statusLedMaterial.color.setHex(ledColor);
    S.statusLedMaterial.emissive.setHex(ledColor);
  }

  function placeBubbles76(S) {
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      var bubble = S.bubbles[i];
      var growth = 1 + 0.6 * (bubble.y - bubble.startY) / FLASK_LIQUID_LEVEL;
      bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
      bubble.mesh.scale.setScalar(bubble.baseScale * growth);
    }
  }

  function animate76(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters76(p1, p2, p3);
      if (!P || fresh.temperature !== P.temperature || fresh.diameter !== P.diameter || fresh.concentration !== P.concentration) {
        update76(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;

    /* bếp nóng dần lên theo nhiệt độ */
    var heat = (P.temperature - 20) / 70;
    var flicker = 0.92 + 0.08 * Math.sin(S.time * 5);
    var h;
    for (h = 0; h < S.heatMaterials.length; h++) {
      S.heatMaterials[h].emissive.setRGB(0.2 + 0.8 * heat, 0.05 + 0.15 * heat, 0.02);
      S.heatMaterials[h].emissiveIntensity = (0.3 + 2.2 * heat) * flicker;
    }

    /* bọt khí sủi lên mặt thoáng */
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      var bubble = S.bubbles[i];
      if (i >= S.activeBubbles) {
        bubble.mesh.visible = false;
        continue;
      }
      bubble.mesh.visible = true;
      bubble.y += bubble.speed * dt;
      bubble.x += Math.sin(S.time * 3 + bubble.phase) * 0.1 * dt;
      bubble.z += Math.cos(S.time * 2.6 + bubble.phase) * 0.1 * dt;
      var limit = flaskInnerRadius(bubble.y) - 0.07 - bubble.baseScale;
      var rho = Math.sqrt(bubble.x * bubble.x + bubble.z * bubble.z);
      if (rho > limit && rho > 0.0001) {
        bubble.x *= limit / rho;
        bubble.z *= limit / rho;
      }
      if (bubble.y >= FLASK_LIQUID_LEVEL) {
        respawnBubble76(S, bubble, false);
      }
    }
    placeBubbles76(S);

    /* đá vôi rung nhẹ khi sủi mạnh, lớp bọt trên mặt thoáng */
    var s;
    for (s = 0; s < S.stoneCount; s++) {
      var stone = S.stones[s];
      stone.mesh.position.x = stone.x + 0.006 * P.normalized * Math.sin(S.time * 17 + s);
      stone.mesh.position.z = stone.z + 0.006 * P.normalized * Math.cos(S.time * 15 + s);
    }
    S.foam.material.opacity = 0.05 + 0.3 * P.normalized * (0.8 + 0.2 * Math.sin(S.time * 6));
  }



  /* ===========================================================================
   * 11. TIỆN ÍCH CHUNG CHO NHÓM SINH HỌC
   * ========================================================================= */
  function lathe(pairs, segments) {
    var points = [];
    var i;
    for (i = 0; i < pairs.length; i++) {
      points.push(new THREE.Vector2(Math.max(pairs[i][0], 0.001), pairs[i][1]));
    }
    return new THREE.LatheGeometry(points, segments || 64);
  }

  function glassMaterial(opacity, tint) {
    return new THREE.MeshPhysicalMaterial({
      color: tint || 0xdff4ff, metalness: 0.0, roughness: 0.02, transparent: true, opacity: opacity || 0.2,
      clearcoat: 1, clearcoatRoughness: 0.02, envMap: getEnvironment(), envMapIntensity: 1.6,
      side: THREE.DoubleSide, depthWrite: false
    });
  }

  function randomBetween(low, high) {
    return low + Math.random() * (high - low);
  }

  /* ===========================================================================
   * 12. BÀI 7-7: QUANG HỢP Ở CÂY XANH (RONG ĐUÔI CHÓ THOÁT BỌT KHÍ O2)
   * ========================================================================= */
  var PH_X0 = 1.2;                    /* tâm cốc thủy tinh theo trục x */
  var BEAKER_RADIUS_77 = 1.6;
  var BEAKER_HEIGHT_77 = 3.6;
  var WATER_LEVEL_77 = 3.1;
  var FUNNEL_RIM_Y = 0.3;
  var FUNNEL_RIM_R = 1.0;
  var FUNNEL_NECK_Y = 2.2;
  var FUNNEL_TOP_Y = 3.3;
  var TUBE_MOUTH_Y = 2.95;
  var TUBE_INNER_TOP = 4.96;
  var TUBE_MAX_GAS = 1.45;            /* chiều dài tối đa cột khí O2 trong ống nghiệm */
  var BUBBLE_POOL_77 = 60;
  var BUBBLE_GAS_LENGTH = 0.02;       /* mỗi bọt khí làm cột khí dài thêm */
  var BUBBLE_TIME_SCALE = 4;          /* mô phỏng nhanh gấp 4 lần so với số bọt/phút hiển thị */
  var MAX_BUBBLES_PER_MINUTE = 60;
  var LEAF_WHORLS = 9;
  var LEAVES_PER_WHORL = 6;
  var LEAF_TILT = 0.5;

  function stemPosition77(y) {
    return { x: 0.06 * Math.sin(y * 3.1), y: y, z: 0.05 * Math.cos(y * 2.4) };
  }

  /* Hệ số theo từng yếu tố (0..1) */
  function lightFactor77(intensity) {
    var k = 35;
    return (1 - Math.exp(-intensity / k)) / (1 - Math.exp(-100 / k));
  }

  function co2Factor77(concentration) {
    return (concentration / (concentration + 0.1)) / (0.5 / 0.6);
  }

  function temperatureFactor77(temperature) {
    if (temperature <= 25) {
      return 0.3 + 0.7 * (temperature - 15) / 10;
    }
    if (temperature <= 35) {
      return 1;
    }
    if (temperature <= 38) {
      return 1 - 0.1 * (temperature - 35) / 3;
    }
    return Math.max(0.05, 0.9 - 0.55 * (temperature - 38) / 2);
  }

  function buildLamp77() {
    var lamp = new THREE.Group();
    var metal = physicalMaterial(0x39424f, 1.0, 0.2, { clearcoat: 0.7, envMapIntensity: 1.4 });
    var brass = physicalMaterial(0xd8b24a, 1.0, 0.22, { envMapIntensity: 1.4 });
    addMesh(new THREE.CylinderGeometry(0.62, 0.7, 0.15, 40), standardMaterial(0x1a212b, 0.8, 0.3), 0, 0.075, 0, lamp);
    addMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.75, 16), standardMaterial(0xaab4c2, 0.95, 0.2), 0, 1.0, 0, lamp);
    var head = new THREE.Group();
    head.position.set(0, 1.9, 0);
    lamp.add(head);
    var housing = addMesh(new THREE.CylinderGeometry(0.62, 0.34, 0.8, 40, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x39424f, metalness: 1.0, roughness: 0.2, envMap: getEnvironment(), envMapIntensity: 1.4, side: THREE.DoubleSide
      }), 0, 0, 0, head);
    housing.rotation.z = -Math.PI / 2;
    var rear = addMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 32), brass, -0.43, 0, 0, head);
    rear.rotation.z = Math.PI / 2;
    var ring = addMesh(new THREE.TorusGeometry(0.62, 0.035, 10, 48), brass, 0.4, 0, 0, head);
    ring.rotation.y = Math.PI / 2;
    var bulbMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff3c0, emissive: 0xffd54a, emissiveIntensity: 2.4, roughness: 0.2
    });
    addMesh(new THREE.SphereGeometry(0.2, 24, 18), bulbMaterial, 0.05, 0, 0, head);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), new THREE.MeshBasicMaterial({
      color: 0xffd54a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.position.set(0.05, 0, 0);
    head.add(halo);
    var front = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), new THREE.MeshBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    front.rotation.y = Math.PI / 2;
    front.position.set(0.41, 0, 0);
    head.add(front);
    var light = new THREE.PointLight(0xffe8a0, 1.0, 14);
    light.position.set(0.5, 0, 0);
    head.add(light);
    return { group: lamp, bulbMaterial: bulbMaterial, halo: halo, front: front, light: light };
  }

  function render77(group) {
    var S = {
      id: '7-7', params: null, time: 0, spawnAcc: 0, spawnRate: 0, gas: 0, refilling: false,
      leafTips: [], bubbles: []
    };
    addLights(group);
    makeBench(group, 17.4, 4.6, -0.6);

    /* ---- cụm thiết bị đặt trong một nhóm riêng ---- */
    var apparatus = new THREE.Group();
    apparatus.position.set(PH_X0, 0, 0);
    group.add(apparatus);
    S.apparatus = apparatus;

    /* cốc thủy tinh lớn + nước */
    var beaker = new THREE.Mesh(lathe([
      [0.001, 0], [1.52, 0], [1.6, 0.06], [1.6, BEAKER_HEIGHT_77], [1.67, BEAKER_HEIGHT_77 + 0.06],
      [1.62, BEAKER_HEIGHT_77 + 0.08], [1.54, BEAKER_HEIGHT_77], [1.54, 0.14], [0.001, 0.14]
    ], 72), glassMaterial(0.2));
    beaker.renderOrder = 3;
    apparatus.add(beaker);
    var waterHeight = WATER_LEVEL_77 - 0.14;
    S.water = new THREE.Mesh(new THREE.CylinderGeometry(1.535, 1.535, waterHeight, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0x8fd3ff, transparent: true, opacity: 0.2, roughness: 0.05, clearcoat: 1, depthWrite: false
      }));
    S.water.position.y = 0.14 + waterHeight / 2;
    S.water.renderOrder = 1;
    apparatus.add(S.water);
    var surface = new THREE.Mesh(new THREE.CircleGeometry(1.535, 48),
      new THREE.MeshBasicMaterial({ color: 0xd8f1ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = WATER_LEVEL_77 + 0.002;
    apparatus.add(surface);

    /* sỏi và đất sét ở đáy cốc */
    var pebbleMaterial = standardMaterial(0x8d7b68, 0.0, 0.9);
    var i;
    for (i = 0; i < 16; i++) {
      var pebble = addMesh(new THREE.SphereGeometry(0.1 + 0.08 * seededRandom(i, 3), 12, 10), pebbleMaterial,
        (seededRandom(i, 1) - 0.5) * 1.8, 0.2, (seededRandom(i, 2) - 0.5) * 1.8, apparatus);
      pebble.scale.y = 0.6;
    }

    /* cành rong đuôi chó: trục thân + các vòng lá */
    S.plant = new THREE.Group();
    apparatus.add(S.plant);
    var stemPoints = [];
    var y;
    for (y = 0.15; y <= 1.7; y += 0.1) {
      var sp = stemPosition77(y);
      stemPoints.push(new THREE.Vector3(sp.x, sp.y, sp.z));
    }
    var stem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stemPoints), 40, 0.035, 8, false),
      standardMaterial(0x2e7d32, 0.0, 0.6));
    stem.castShadow = true;
    S.plant.add(stem);

    var leafGeometry = new THREE.SphereGeometry(1, 12, 8);
    var leafMaterials = [
      standardMaterial(0x2fa63a, 0.0, 0.55, { emissive: 0x0a3a10, emissiveIntensity: 0.4 }),
      standardMaterial(0x43c04a, 0.0, 0.55, { emissive: 0x0a3a10, emissiveIntensity: 0.4 })
    ];
    S.leafMaterials = leafMaterials;
    var w;
    var l;
    for (w = 0; w < LEAF_WHORLS; w++) {
      var whorlY = 0.25 + w * 0.16;
      var base = stemPosition77(whorlY);
      var leafHalf = 0.17 - 0.006 * w;
      for (l = 0; l < LEAVES_PER_WHORL; l++) {
        var angle = l * 2 * Math.PI / LEAVES_PER_WHORL + w * 0.5;
        var pivot = new THREE.Group();
        pivot.position.set(base.x, base.y, base.z);
        pivot.rotation.y = angle;
        var tilt = new THREE.Group();
        tilt.rotation.z = LEAF_TILT;
        pivot.add(tilt);
        var leaf = addMesh(leafGeometry, leafMaterials[(w + l) % 2], leafHalf, 0, 0, tilt);
        leaf.scale.set(leafHalf, 0.018, 0.055);
        S.plant.add(pivot);
        var reach = 1.7 * leafHalf;
        S.leafTips.push({
          x: base.x + reach * Math.cos(LEAF_TILT) * Math.cos(angle),
          y: base.y + reach * Math.sin(LEAF_TILT),
          z: base.z - reach * Math.cos(LEAF_TILT) * Math.sin(angle)
        });
      }
    }

    /* phễu thủy tinh úp ngược phủ lên cành rong */
    var funnel = new THREE.Mesh(lathe([
      [FUNNEL_RIM_R, FUNNEL_RIM_Y], [0.12, FUNNEL_NECK_Y], [0.12, FUNNEL_TOP_Y], [0.07, FUNNEL_TOP_Y],
      [0.07, FUNNEL_NECK_Y], [FUNNEL_RIM_R - 0.04, FUNNEL_RIM_Y], [FUNNEL_RIM_R, FUNNEL_RIM_Y]
    ], 56), glassMaterial(0.3, 0xe6f7ff));
    funnel.renderOrder = 3;
    apparatus.add(funnel);

    /* ống nghiệm thu khí chụp trên cuống phễu */
    var tubePairs = [[0.34, TUBE_MOUTH_Y], [0.34, 4.66]];
    var a;
    for (a = 1; a <= 8; a++) {
      var capAngle = a / 8 * Math.PI / 2;
      tubePairs.push([0.34 * Math.cos(capAngle), 4.66 + 0.34 * Math.sin(capAngle)]);
    }
    for (a = 8; a >= 0; a--) {
      var innerAngle = a / 8 * Math.PI / 2;
      tubePairs.push([0.3 * Math.cos(innerAngle), 4.66 + 0.3 * Math.sin(innerAngle)]);
    }
    tubePairs.push([0.3, TUBE_MOUTH_Y]);
    tubePairs.push([0.34, TUBE_MOUTH_Y]);
    var tube = new THREE.Mesh(lathe(tubePairs, 48), glassMaterial(0.28));
    tube.renderOrder = 4;
    apparatus.add(tube);

    var markMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false });
    var m;
    for (m = 0; m < 8; m++) {
      var mark = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.005, 6, 40), markMaterial);
      mark.rotation.x = Math.PI / 2;
      mark.position.y = 3.5 + m * 0.2;
      apparatus.add(mark);
    }

    /* nước trong ống nghiệm (mực nước hạ xuống khi khí O2 tích tụ) và khoảng khí */
    S.tubeWater = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 1, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x8fd3ff, transparent: true, opacity: 0.3, roughness: 0.05, clearcoat: 1, depthWrite: false
      }));
    S.tubeWater.renderOrder = 2;
    apparatus.add(S.tubeWater);
    S.tubeGas = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.18, depthWrite: false }));
    S.tubeGas.renderOrder = 2;
    apparatus.add(S.tubeGas);
    S.meniscus = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.012, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, toneMapped: false }));
    S.meniscus.rotation.x = Math.PI / 2;
    apparatus.add(S.meniscus);

    /* giá đỡ ống nghiệm */
    var clampMaterial = standardMaterial(0x8892a0, 0.9, 0.3);
    addMesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 16), clampMaterial, 2.7, 2.7, 0, apparatus);
    addMesh(new THREE.CylinderGeometry(0.35, 0.4, 0.12, 24), standardMaterial(0x1a212b, 0.8, 0.3), 2.7, 0.06, 0, apparatus);
    addMesh(new THREE.BoxGeometry(2.4, 0.08, 0.1), clampMaterial, 1.55, 4.1, 0, apparatus);
    var clampRing = addMesh(new THREE.TorusGeometry(0.37, 0.03, 8, 32), clampMaterial, 0, 4.1, 0, apparatus);
    clampRing.rotation.x = Math.PI / 2;

    /* bọt khí O2 */
    var bubbleGeometry = new THREE.SphereGeometry(1, 14, 10);
    var bubbleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.0, clearcoat: 1,
      envMap: getEnvironment(), envMapIntensity: 1.5, depthWrite: false
    });
    for (i = 0; i < BUBBLE_POOL_77; i++) {
      var bubbleMesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
      bubbleMesh.renderOrder = 5;
      bubbleMesh.visible = false;
      apparatus.add(bubbleMesh);
      S.bubbles.push({ mesh: bubbleMesh, active: false, x: 0, y: 0, z: 0, x0: 0, z0: 0, y0: 0, size: 0.04, speed: 0.6, phase: 0 });
    }

    /* đèn chiếu sáng + chùm tia vàng */
    S.lamp = buildLamp77();
    group.add(S.lamp.group);
    S.beamOuter = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 0.4, 1, 40, 1, true), new THREE.MeshBasicMaterial({
      color: 0xffd54a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    }));
    S.beamInner = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.25, 1, 32, 1, true), new THREE.MeshBasicMaterial({
      color: 0xfff1b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    }));
    S.beamOuter.rotation.z = -Math.PI / 2;
    S.beamInner.rotation.z = -Math.PI / 2;
    group.add(S.beamOuter);
    group.add(S.beamInner);

    /* nhãn tên thiết bị */
    var tagFunnel = createTag('Phễu thủy tinh', '#9fb3c8', 384, 128, 1.9, 56);
    tagFunnel.position.set(PH_X0 - 2.2, 0.35, 2.3);
    group.add(tagFunnel);
    var tagPlant = createTag('Rong đuôi chó', '#7dffb2', 384, 128, 1.9, 56);
    tagPlant.position.set(PH_X0, 0.35, 2.3);
    group.add(tagPlant);
    var tagTube = createTag('Ống nghiệm thu O₂', '#ffd54a', 384, 128, 2.1, 52);
    tagTube.position.set(PH_X0 + 2.3, 0.35, 2.3);
    group.add(tagTube);

    /* bảng số liệu */
    var mono = '"Consolas","Courier New",monospace';
    S.labelLight = addLedPanel(group, -3.6, 7.0, -1.6, 5.4, 'Cường độ sáng: 80%', { color: '#ffd54a', font: mono }, false);
    S.labelCo2 = addLedPanel(group, -3.6, 6.2, -1.6, 5.4, 'Nồng độ CO₂: 0.10%', { color: '#b0bec5', font: mono }, false);
    S.labelTemp = addLedPanel(group, -3.6, 5.4, -1.6, 5.4, 'Nhiệt độ nước: 28 °C', { color: '#ff8a65', font: mono }, false);
    S.labelRate = addLedPanel(group, 3.4, 7.0, -1.6, 6.4, 'Tốc độ thoát bọt khí O₂: 0 bọt/phút', { color: '#7dffb2', fontSize: 54 }, false);
    S.labelLimit = addLedPanel(group, 3.4, 6.2, -1.6, 6.4, 'Yếu tố hạn chế: —', { color: '#cfd8dc', fontSize: 52 }, false);
    return S;
  }

  function computeParameters77(p1, p2, p3) {
    var light = clamp(toNumber(p1, 80), 10, 100);
    var co2 = clamp(toNumber(p2, 0.1), 0.01, 0.5);
    var temperature = clamp(toNumber(p3, 28), 15, 40);
    var fLight = lightFactor77(light);
    var fCo2 = co2Factor77(co2);
    var fTemp = temperatureFactor77(temperature);
    var rate = MAX_BUBBLES_PER_MINUTE * fLight * fCo2 * fTemp;

    var limit = 'Điều kiện tối ưu';
    var smallest = Math.min(fLight, fCo2, fTemp);
    if (smallest < 0.97) {
      if (smallest === fTemp) {
        limit = temperature > 35 ? 'nhiệt độ quá cao (enzim giảm hoạt tính)' : 'nhiệt độ thấp';
      } else if (smallest === fLight) {
        limit = 'ánh sáng yếu';
      } else {
        limit = 'thiếu CO₂';
      }
    }
    return {
      light: light, co2: co2, temperature: temperature,
      fLight: fLight, fCo2: fCo2, fTemp: fTemp, rate: rate, limit: limit
    };
  }

  function update77(S, p1, p2, p3) {
    var P = computeParameters77(p1, p2, p3);
    S.params = P;
    var intensity = P.light / 100;

    /* đèn dịch lại gần cốc khi cường độ sáng tăng */
    var lampX = -6.5 + 3.5 * (P.light - 10) / 90;
    S.lamp.group.position.set(lampX, 0, 0);
    var beamStart = lampX + 0.45;
    var beamEnd = PH_X0 - 0.3;
    var length = Math.max(0.5, beamEnd - beamStart);
    S.beamOuter.scale.set(1, length, 1);
    S.beamOuter.position.set(beamStart + length / 2, 1.9, 0);
    S.beamInner.scale.set(1, length, 1);
    S.beamInner.position.set(beamStart + length / 2, 1.9, 0);
    S.beamOuter.material.opacity = 0.03 + 0.14 * intensity;
    S.beamInner.material.opacity = 0.04 + 0.2 * intensity;
    S.lamp.light.intensity = 0.2 + 1.8 * intensity;
    S.lamp.halo.material.opacity = 0.1 + 0.3 * intensity;
    S.lamp.front.material.opacity = 0.15 + 0.35 * intensity;

    var m;
    for (m = 0; m < S.leafMaterials.length; m++) {
      S.leafMaterials[m].emissiveIntensity = 0.15 + 0.6 * intensity * Math.min(1, P.fCo2);
    }
    S.water.material.color.setRGB(0.56 - 0.05 * (P.temperature - 15) / 25, 0.82, 1.0);

    S.spawnRate = P.rate / 60 * BUBBLE_TIME_SCALE;

    updateText3D(S.labelLight, 'Cường độ sáng: ' + fmt(P.light, 0) + '%');
    updateText3D(S.labelCo2, 'Nồng độ CO₂: ' + fmt(P.co2, 2) + '%');
    updateText3D(S.labelTemp, 'Nhiệt độ nước: ' + fmt(P.temperature, 0) + ' °C',
      { color: P.temperature > 38 ? '#ff5252' : '#ff8a65' });
    updateText3D(S.labelRate, 'Tốc độ thoát bọt khí O₂: ' + fmt(P.rate, 0) + ' bọt/phút');
    updateText3D(S.labelLimit, 'Yếu tố hạn chế: ' + P.limit,
      { color: P.limit === 'Điều kiện tối ưu' ? '#7dffb2' : '#ffab40' });
  }

  function spawnBubble77(S) {
    var bubble = null;
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      if (!S.bubbles[i].active) {
        bubble = S.bubbles[i];
        break;
      }
    }
    if (!bubble) {
      return;
    }
    var tip = S.leafTips[Math.floor(Math.random() * S.leafTips.length)];
    bubble.active = true;
    bubble.x0 = tip.x;
    bubble.z0 = tip.z;
    bubble.y0 = tip.y;
    bubble.x = tip.x;
    bubble.y = tip.y;
    bubble.z = tip.z;
    bubble.size = randomBetween(0.03, 0.05);
    bubble.speed = randomBetween(0.55, 0.8);
    bubble.phase = Math.random() * 6.28;
    bubble.mesh.visible = true;
  }

  function animate77(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters77(p1, p2, p3);
      if (!P || fresh.light !== P.light || fresh.co2 !== P.co2 || fresh.temperature !== P.temperature) {
        update77(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;
    var intensity = P.light / 100;

    S.lamp.bulbMaterial.emissiveIntensity = (0.6 + 2.4 * intensity) * (0.97 + 0.03 * Math.sin(S.time * 40));
    S.plant.rotation.z = 0.02 * Math.sin(S.time * 1.3);
    S.plant.rotation.x = 0.015 * Math.sin(S.time * 0.9);

    /* sinh bọt khí theo tốc độ quang hợp */
    S.spawnAcc += dt * S.spawnRate;
    while (S.spawnAcc >= 1) {
      S.spawnAcc -= 1;
      spawnBubble77(S);
    }

    var waterTop = TUBE_INNER_TOP - S.gas;
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      var bubble = S.bubbles[i];
      if (!bubble.active) {
        continue;
      }
      bubble.y += bubble.speed * dt;
      var wobble = Math.sin(S.time * 7 + bubble.phase);
      if (bubble.y < FUNNEL_NECK_Y) {
        var t = clamp((bubble.y - bubble.y0) / (FUNNEL_NECK_Y - bubble.y0), 0, 1);
        bubble.x = bubble.x0 * (1 - t) + wobble * 0.012;
        bubble.z = bubble.z0 * (1 - t) + Math.cos(S.time * 6 + bubble.phase) * 0.012;
      } else if (bubble.y < FUNNEL_TOP_Y) {
        bubble.x = wobble * 0.03;
        bubble.z = Math.cos(S.time * 6 + bubble.phase) * 0.03;
      } else {
        bubble.x = wobble * 0.09;
        bubble.z = Math.cos(S.time * 5 + bubble.phase) * 0.09;
      }
      if (bubble.y >= waterTop - 0.03) {
        bubble.active = false;
        bubble.mesh.visible = false;
        if (!S.refilling) {
          S.gas = Math.min(TUBE_MAX_GAS, S.gas + BUBBLE_GAS_LENGTH);
        }
        continue;
      }
      var grow = 1 + 0.5 * clamp((bubble.y - bubble.y0) / 2.5, 0, 1);
      bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
      bubble.mesh.scale.setScalar(bubble.size * grow);
    }

    /* khi ống nghiệm đầy khí O2 thì thay nước để thí nghiệm tiếp tục */
    if (S.refilling) {
      S.gas -= dt * 1.1;
      if (S.gas <= 0) {
        S.gas = 0;
        S.refilling = false;
      }
    } else if (S.gas >= TUBE_MAX_GAS) {
      S.refilling = true;
    }

    waterTop = TUBE_INNER_TOP - S.gas;
    var waterLength = Math.max(0.001, waterTop - TUBE_MOUTH_Y);
    S.tubeWater.scale.set(1, waterLength, 1);
    S.tubeWater.position.y = TUBE_MOUTH_Y + waterLength / 2;
    S.tubeGas.visible = S.gas > 0.002;
    S.tubeGas.scale.set(1, Math.max(0.001, S.gas), 1);
    S.tubeGas.position.y = TUBE_INNER_TOP - S.gas / 2;
    S.meniscus.visible = S.gas > 0.002;
    S.meniscus.position.y = waterTop;
  }

  /* ===========================================================================
   * 13. BÀI 7-8: HÔ HẤP Ở THỰC VẬT (HẠT NẢY MẦM)
   * ========================================================================= */
  var JAR_X = -3.2;
  var LIMEWATER_X = 3.6;
  var SEED_POOL_78 = 80;
  var CO2_BUBBLE_POOL = 50;
  var LIMEWATER_SURFACE_Y = 1.95;
  var THERMOMETER_BASE_Y = 1.0;
  var THERMOMETER_SCALE = 0.06;           /* chiều cao cột đỏ (đơn vị 3D) cho mỗi 1 °C */
  var RESPIRATION_ML_PER_GRAM_HOUR = 0.3;
  var ENERGY_PER_ML_O2 = 20;              /* J giải phóng cho mỗi ml O2 tiêu thụ */
  var JAR_HEAT_LOSS = 0.045;              /* W/K, bình cách nhiệt tương đối tốt */

  function respirationTemperatureFactor(temperature) {
    if (temperature <= 38) {
      return Math.pow(2, (temperature - 20) / 10);
    }
    return Math.max(0.15, Math.pow(2, 1.8) * (1 - 0.1 * (temperature - 38)));
  }

  /* hạt càng nảy mầm lâu thì hô hấp càng mạnh (trong ~6 giờ đầu) */
  function respirationRamp(hours) {
    return 0.5 + 0.5 * Math.min(hours / 6, 1);
  }

  function respirationIntegral(hours) {
    var ramp = hours <= 6 ? hours * hours / 12 : 3 + (hours - 6);
    return 0.5 * hours + 0.5 * ramp;
  }

  /* Trạng thái hô hấp sau "hours" giờ theo dõi */
  function respirationState(mass, temperature, hours) {
    var factor = respirationTemperatureFactor(temperature);
    var oxygen = mass * RESPIRATION_ML_PER_GRAM_HOUR * factor * respirationIntegral(hours);
    var carbonDioxide = oxygen;                                    /* hệ số hô hấp RQ ≈ 1 với hạt giàu tinh bột */
    var rate = mass * RESPIRATION_ML_PER_GRAM_HOUR * factor * respirationRamp(hours);   /* ml/giờ */
    var power = rate * ENERGY_PER_ML_O2 / 3600;                    /* W */
    var steady = power / JAR_HEAT_LOSS;
    var heating = 12 * Math.tanh(steady / 12) * (1 - Math.exp(-hours / 3));
    var turbidity = 1 - Math.exp(-carbonDioxide / 250);
    var germination = clamp(hours / 24 * (0.35 + 0.65 * clamp(factor / 3.48, 0, 1)), 0, 1);
    return {
      oxygen: oxygen, carbonDioxide: carbonDioxide, rate: rate, heating: heating,
      turbidity: turbidity, germination: germination, factor: factor
    };
  }

  function polylinePoint(points, lengths, distance) {
    var total = lengths[lengths.length - 1];
    var d = clamp(distance, 0, total);
    var i;
    for (i = 1; i < lengths.length; i++) {
      if (d <= lengths[i]) {
        var segment = lengths[i] - lengths[i - 1];
        var t = segment > 0 ? (d - lengths[i - 1]) / segment : 0;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
          z: 0
        };
      }
    }
    return { x: points[points.length - 1].x, y: points[points.length - 1].y, z: 0 };
  }

  function render78(group) {
    var S = {
      id: '7-8', params: null, time: 0, progress: 0, labelTimer: 0, spawnAcc: 0, spawnRate: 0,
      seeds: [], bubbles: [], shownTemperature: 20, seedCount: 0
    };
    addLights(group);
    makeBench(group, 17.4, 4.6, 0.2);

    /* bình thủy tinh kín có cổ + nút cao su */
    var jar = new THREE.Mesh(lathe([
      [0.001, 0], [1.4, 0], [1.5, 0.12], [1.5, 2.35], [1.28, 2.8], [0.64, 3.15], [0.64, 3.6], [0.72, 3.66],
      [0.6, 3.66], [0.6, 3.15], [1.22, 2.75], [1.43, 2.33], [1.43, 0.2], [0.001, 0.2]
    ], 72), glassMaterial(0.22));
    jar.position.x = JAR_X;
    jar.renderOrder = 3;
    group.add(jar);
    var stopper = addMesh(new THREE.CylinderGeometry(0.66, 0.56, 0.6, 40), standardMaterial(0x8d2f1f, 0.0, 0.85),
      JAR_X, 3.45, 0, group);
    stopper.renderOrder = 6;
    addMesh(new THREE.TorusGeometry(0.66, 0.03, 8, 40), standardMaterial(0x6b2216, 0.0, 0.85), JAR_X, 3.75, 0, group)
      .rotation.x = Math.PI / 2;

    /* lớp hạt đậu đang nảy mầm */
    var seedGeometry = new THREE.SphereGeometry(1, 16, 12);
    var sproutGeometry = new THREE.CylinderGeometry(0.018, 0.034, 1, 8);
    sproutGeometry.translate(0, 0.5, 0);
    var seedMaterials = [
      standardMaterial(0xc9a46a, 0.0, 0.7), standardMaterial(0xb98f55, 0.0, 0.7), standardMaterial(0xd8b57d, 0.0, 0.7)
    ];
    var sproutMaterial = standardMaterial(0xfff4d6, 0.0, 0.55, { emissive: 0x332a10, emissiveIntensity: 0.3 });
    S.sproutMaterial = sproutMaterial;
    var i;
    for (i = 0; i < SEED_POOL_78; i++) {
      var seedGroup = new THREE.Group();
      var seed = addMesh(seedGeometry, seedMaterials[i % 3], 0, 0, 0, seedGroup);
      seed.scale.set(0.17, 0.11, 0.1);
      var sprout = new THREE.Mesh(sproutGeometry, sproutMaterial);
      sprout.position.set(0.15, 0.02, 0);
      sprout.rotation.z = -Math.PI / 2 + 0.5;
      sprout.castShadow = true;
      seedGroup.add(sprout);
      seedGroup.rotation.set(seededRandom(i, 11) * 6.28, seededRandom(i, 12) * 6.28, seededRandom(i, 13) * 6.28);
      seedGroup.visible = false;
      group.add(seedGroup);
      S.seeds.push({ group: seedGroup, sprout: sprout });
    }

    /* nhiệt kế 3D vạch đỏ treo trong bình, xuyên qua nút */
    var thermometerX = JAR_X - 0.3;
    var tubeGlass = addMesh(new THREE.CylinderGeometry(0.06, 0.06, 3.65, 16), glassMaterial(0.35, 0xffffff),
      thermometerX, 2.775, 0, group);
    tubeGlass.renderOrder = 7;
    addMesh(new THREE.SphereGeometry(0.1, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.8, roughness: 0.2 }),
      thermometerX, 0.95, 0, group);
    var columnGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1, 12);
    columnGeometry.translate(0, 0.5, 0);
    S.column = new THREE.Mesh(columnGeometry,
      new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.0, roughness: 0.2 }));
    S.column.position.set(thermometerX, THERMOMETER_BASE_Y, 0);
    S.column.renderOrder = 8;
    group.add(S.column);
    var tickMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    var temperature;
    for (temperature = 10; temperature <= 60; temperature += 5) {
      var tickY = THERMOMETER_BASE_Y + THERMOMETER_SCALE * (temperature - 10);
      var major = (temperature % 10 === 0);
      var tick = new THREE.Mesh(new THREE.BoxGeometry(major ? 0.2 : 0.12, 0.012, 0.012), tickMaterial);
      tick.position.set(thermometerX + 0.1, tickY, 0.07);
      tick.renderOrder = 9;
      group.add(tick);
      if (major && temperature <= 40) {
        var tag = createTag(temperature + '°C', '#ff8a80', 256, 128, 0.55, 64);
        tag.position.set(thermometerX - 0.45, tickY, 0.2);
        group.add(tag);
      }
    }

    /* ống dẫn khí hình chữ U (úp ngược) nối bình hạt sang cốc nước vôi trong */
    var tubeStartX = JAR_X + 0.28;
    S.pathPoints = [
      new THREE.Vector3(tubeStartX, 3.0, 0),
      new THREE.Vector3(tubeStartX, 5.0, 0),
      new THREE.Vector3(tubeStartX + 0.3, 5.35, 0),
      new THREE.Vector3(LIMEWATER_X - 0.3, 5.35, 0),
      new THREE.Vector3(LIMEWATER_X, 5.0, 0),
      new THREE.Vector3(LIMEWATER_X, 0.7, 0)
    ];
    var deliveryTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(S.pathPoints), 140, 0.075, 12, false),
      glassMaterial(0.4, 0xeaf8ff));
    deliveryTube.renderOrder = 7;
    group.add(deliveryTube);
    S.pathLengths = [0];
    var p;
    for (p = 1; p < S.pathPoints.length; p++) {
      var dx = S.pathPoints[p].x - S.pathPoints[p - 1].x;
      var dy = S.pathPoints[p].y - S.pathPoints[p - 1].y;
      S.pathLengths.push(S.pathLengths[p - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    S.tubeTotal = S.pathLengths[S.pathLengths.length - 1] - 4.3;   /* điểm bắt đầu rơi vào nước vôi */
    S.tubeEndLength = S.pathLengths[S.pathLengths.length - 1];

    /* cốc nước vôi trong Ca(OH)2 */
    var beaker = new THREE.Mesh(lathe([
      [0.001, 0], [1.05, 0], [1.1, 0.05], [1.1, 2.4], [1.16, 2.45], [1.12, 2.47], [1.05, 2.4], [1.05, 0.12], [0.001, 0.12]
    ], 64), glassMaterial(0.22));
    beaker.position.x = LIMEWATER_X;
    beaker.renderOrder = 3;
    group.add(beaker);
    S.limewater = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 1.04, LIMEWATER_SURFACE_Y - 0.12, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0xdff6ff, transparent: true, opacity: 0.14, roughness: 0.12, clearcoat: 1, depthWrite: false
      }));
    S.limewater.position.set(LIMEWATER_X, 0.12 + (LIMEWATER_SURFACE_Y - 0.12) / 2, 0);
    S.limewater.renderOrder = 2;
    group.add(S.limewater);
    var limeSurface = new THREE.Mesh(new THREE.CircleGeometry(1.04, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    limeSurface.rotation.x = -Math.PI / 2;
    limeSurface.position.set(LIMEWATER_X, LIMEWATER_SURFACE_Y + 0.002, 0);
    group.add(limeSurface);

    /* bọt khí CO2 */
    var bubbleGeometry = new THREE.SphereGeometry(1, 12, 10);
    var bubbleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.05, clearcoat: 1,
      envMap: getEnvironment(), envMapIntensity: 1.4, depthWrite: false
    });
    for (i = 0; i < CO2_BUBBLE_POOL; i++) {
      var bubbleMesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
      bubbleMesh.renderOrder = 9;
      bubbleMesh.visible = false;
      group.add(bubbleMesh);
      S.bubbles.push({ mesh: bubbleMesh, active: false, stage: 'tube', distance: 0, x: 0, y: 0, z: 0, phase: 0, speed: 1.5, size: 0.04 });
    }

    /* nhãn tên thiết bị */
    var tagJar = createTag('Hạt đậu nảy mầm', '#ffd54a', 384, 128, 2.1, 56);
    tagJar.position.set(JAR_X, 0.35, 2.3);
    group.add(tagJar);
    var tagLime = createTag('Nước vôi trong Ca(OH)₂', '#b0bec5', 512, 128, 2.6, 52);
    tagLime.position.set(LIMEWATER_X, 0.35, 2.3);
    group.add(tagLime);

    /* bảng số liệu */
    var mono = '"Consolas","Courier New",monospace';
    S.labelOxygen = addLedPanel(group, -2.2, 7.4, -1.4, 5.6, 'Lượng O₂ tiêu thụ: 0 ml', { color: '#4fc3ff', font: mono }, false);
    S.labelCarbon = addLedPanel(group, 3.6, 7.4, -1.4, 5.6, 'Lượng CO₂ thải ra: 0 ml', { color: '#cfd8dc', font: mono }, false);
    S.labelHeat = addLedPanel(group, -2.2, 6.6, -1.4, 5.6, 'Nhiệt độ tăng thêm: +0.0 °C', { color: '#ff8a65', font: mono }, false);
    S.labelTurbid = addLedPanel(group, 3.6, 6.6, -1.4, 5.6, 'Độ đục nước vôi trong: 0%', { color: '#ffffff', font: mono }, false);
    S.labelInfo = addLedPanel(group, 0.7, 5.8, -1.4, 8.0, 'm = 100 g | bình ủ 25 °C | theo dõi 12 giờ',
      { color: '#ffd54a', fontSize: 52 }, false);
    return S;
  }

  function computeParameters78(p1, p2, p3) {
    return {
      mass: clamp(toNumber(p1, 100), 10, 500),
      temperature: clamp(toNumber(p2, 25), 10, 45),
      hours: clamp(toNumber(p3, 12), 1, 24)
    };
  }

  function layoutSeeds78(S, mass) {
    var count = Math.round(8 + (mass - 10) / 490 * 72);
    var capacity = 24;
    var i;
    for (i = 0; i < S.seeds.length; i++) {
      var entry = S.seeds[i];
      if (i >= count) {
        entry.group.visible = false;
        continue;
      }
      var layer = Math.floor(i / capacity);
      var inLayer = i % capacity;
      var layerCount = Math.min(capacity, count - layer * capacity);
      var rho = 1.2 * Math.sqrt((inLayer + 0.5) / layerCount) * (1 - 0.05 * layer);
      var angle = i * 2.39996;
      entry.group.position.set(JAR_X + rho * Math.cos(angle), 0.3 + layer * 0.13 + 0.04 * seededRandom(i, 20), rho * Math.sin(angle));
      entry.group.visible = true;
    }
    S.seedCount = count;
  }

  function showValues78(S, state, hoursShown) {
    var P = S.params;
    updateText3D(S.labelOxygen, 'Lượng O₂ tiêu thụ: ' + fmt(state.oxygen, 0) + ' ml');
    updateText3D(S.labelCarbon, 'Lượng CO₂ thải ra: ' + fmt(state.carbonDioxide, 0) + ' ml');
    updateText3D(S.labelHeat, 'Nhiệt độ tăng thêm: +' + fmt(state.heating, 1) + ' °C');
    updateText3D(S.labelTurbid, 'Độ đục nước vôi trong: ' + fmt(state.turbidity * 100, 0) + '%');
    updateText3D(S.labelInfo, 'm = ' + fmt(P.mass, 0) + ' g | bình ủ ' + fmt(P.temperature, 0) +
      ' °C | theo dõi ' + fmt(hoursShown, 1) + '/' + fmt(P.hours, 0) + ' giờ');
  }

  function applyProgress78(S, progress) {
    var P = S.params;
    var hoursShown = P.hours * progress;
    var state = respirationState(P.mass, P.temperature, hoursShown);
    S.current = state;
    S.shownTemperature = P.temperature + state.heating;

    /* cột thủy ngân đỏ dâng cao */
    var columnHeight = clamp(THERMOMETER_SCALE * (S.shownTemperature - 10), 0.02, 3.1);
    S.column.scale.set(1, columnHeight, 1);

    /* nước vôi trong chuyển dần sang trắng đục */
    var turbidity = state.turbidity;
    S.limewater.material.opacity = 0.14 + 0.8 * turbidity;
    S.limewater.material.color.setRGB(0.87 + 0.13 * turbidity, 0.96 + 0.04 * turbidity, 1.0);
    S.limewater.material.emissive.setRGB(0.3 * turbidity, 0.3 * turbidity, 0.3 * turbidity);

    /* mầm trắng dài dần */
    var sproutLength = 0.03 + 0.24 * state.germination;
    var i;
    for (i = 0; i < S.seeds.length; i++) {
      S.seeds[i].sprout.scale.set(1, sproutLength * (0.8 + 0.4 * seededRandom(i, 30)), 1);
    }
    S.progressHours = hoursShown;
    return state;
  }

  function update78(S, p1, p2, p3) {
    var P = computeParameters78(p1, p2, p3);
    S.params = P;
    layoutSeeds78(S, P.mass);
    var finalState = respirationState(P.mass, P.temperature, P.hours);
    S.finalState = finalState;
    S.spawnRate = 0.6 + 7 * clamp(finalState.rate / 450, 0, 1);

    /* chạy lại quá trình theo dõi từ đầu mỗi khi đổi thông số */
    S.progress = 0;
    S.labelTimer = 0;
    var state = applyProgress78(S, 0);
    showValues78(S, state, 0);
  }

  function spawnBubble78(S) {
    var bubble = null;
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      if (!S.bubbles[i].active) {
        bubble = S.bubbles[i];
        break;
      }
    }
    if (!bubble) {
      return;
    }
    bubble.active = true;
    bubble.stage = 'tube';
    bubble.distance = 0;
    bubble.speed = randomBetween(1.3, 1.9);
    bubble.size = 0.05;
    bubble.phase = Math.random() * 6.28;
    bubble.mesh.visible = true;
  }

  function animate78(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters78(p1, p2, p3);
      if (!P || fresh.mass !== P.mass || fresh.temperature !== P.temperature || fresh.hours !== P.hours) {
        update78(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;

    /* tiến trình theo dõi mô phỏng: khoảng 6 giây thực cho toàn bộ thời gian theo dõi */
    if (S.progress < 1) {
      S.progress = Math.min(1, S.progress + dt / 6);
      var state = applyProgress78(S, S.progress);
      S.labelTimer += dt;
      if (S.labelTimer >= 0.1 || S.progress >= 1) {
        S.labelTimer = 0;
        showValues78(S, state, S.progressHours);
      }
    }

    /* bọt khí CO2: từ bình hạt, qua ống dẫn, sủi vào cốc nước vôi trong */
    var activity = S.progress > 0 ? 1 : 0.2;
    S.spawnAcc += dt * S.spawnRate * activity;
    while (S.spawnAcc >= 1) {
      S.spawnAcc -= 1;
      spawnBubble78(S);
    }
    var endX = S.pathPoints[S.pathPoints.length - 1].x;
    var endY = S.pathPoints[S.pathPoints.length - 1].y;
    var i;
    for (i = 0; i < S.bubbles.length; i++) {
      var bubble = S.bubbles[i];
      if (!bubble.active) {
        continue;
      }
      if (bubble.stage === 'tube') {
        bubble.distance += bubble.speed * dt;
        if (bubble.distance >= S.tubeEndLength) {
          bubble.stage = 'rise';
          bubble.x = endX;
          bubble.y = endY;
          bubble.z = 0;
          bubble.size = 0.07 + 0.04 * Math.random();
        } else {
          var point = polylinePoint(S.pathPoints, S.pathLengths, bubble.distance);
          bubble.x = point.x;
          bubble.y = point.y;
          bubble.z = 0;
        }
      } else {
        bubble.y += (0.7 + 0.3 * Math.sin(bubble.phase)) * dt;
        bubble.x = endX + Math.sin(S.time * 6 + bubble.phase) * 0.12 * (bubble.y - endY);
        bubble.z = Math.cos(S.time * 5 + bubble.phase) * 0.12 * (bubble.y - endY);
        if (bubble.y >= LIMEWATER_SURFACE_Y - 0.03) {
          bubble.active = false;
          bubble.mesh.visible = false;
          continue;
        }
      }
      bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
      bubble.mesh.scale.setScalar(bubble.size);
    }

    /* hạt hô hấp: đầu mầm ánh lên nhẹ */
    S.sproutMaterial.emissiveIntensity = 0.25 + 0.1 * Math.sin(S.time * 3);
  }

  /* ===========================================================================
   * 14. BÀI 7-9: VẬN CHUYỂN NƯỚC Ở THÂN VÀ THOÁT HƠI NƯỚC QUA KHÍ KHỔNG
   * ========================================================================= */
  var BRANCH_X = -4.4;
  var STOMA_X = 4.4;
  var STOMA_Y = 2.7;
  var STEM_BOTTOM_Y = 0.55;
  var STEM_TOP_Y = 5.25;
  var VESSEL_COUNT = 6;
  var WATER_PARTICLE_POOL = 72;
  var VAPOR_POOL_RIGHT = 110;
  var VAPOR_POOL_LEFT = 30;
  var WIND_STREAK_POOL = 18;
  var STOMA_HALF_LENGTH = 2.2;
  var STOMA_CELL_RADIUS = 0.5;
  var STOMA_MAX_APERTURE = 14;            /* μm */

  function makeEpidermisTexture() {
    var W = 1024;
    var H = 768;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#356b2f';
    ctx.fillRect(0, 0, W, H);
    var columns = 9;
    var rows = 7;
    var cw = W / columns;
    var ch = H / rows;
    var r;
    var c;
    for (r = -1; r <= rows; r++) {
      for (c = -1; c <= columns; c++) {
        var cx = (c + 0.5) * cw + (seededRandom(r * 31 + c, 5) - 0.5) * cw * 0.35 + (r % 2) * cw * 0.25;
        var cy = (r + 0.5) * ch + (seededRandom(r * 17 + c, 6) - 0.5) * ch * 0.35;
        ctx.beginPath();
        var k;
        for (k = 0; k < 8; k++) {
          var angle = k * Math.PI / 4 + 0.2;
          var radius = (0.46 + 0.1 * seededRandom(r * 7 + c * 13 + k, 8)) * cw;
          var px = cx + Math.cos(angle) * radius;
          var py = cy + Math.sin(angle) * radius * 0.82;
          if (k === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        var shade = 100 + Math.floor(seededRandom(r * 11 + c, 9) * 40);
        ctx.fillStyle = 'rgb(' + (shade - 35) + ',' + (shade + 55) + ',' + (shade - 45) + ')';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(20,60,20,0.8)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + cw * 0.08, cy, cw * 0.07, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(40,110,45,0.55)';
        ctx.fill();
      }
    }
    return canvasTexture(canvas);
  }

  function makeVesselTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8fd0ff';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = 'rgba(20,70,140,0.85)';
    var k;
    for (k = 0; k < 4; k++) {
      ctx.fillRect(0, k * 32 + 12, 64, 6);
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4);
    return texture;
  }

  /* Tế bào hạt đậu: ống tiết diện elip quét dọc theo cung tròn, hai đầu thu nhọn */
  function buildGuardCell(side, material) {
    var N = 30;
    var M = 14;
    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array((N + 1) * (M + 1) * 3);
    var indices = [];
    var i;
    var j;
    for (i = 0; i < N; i++) {
      for (j = 0; j < M; j++) {
        var a = i * (M + 1) + j;
        var b = a + 1;
        var c = a + (M + 1);
        var d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    var mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    return { mesh: mesh, geometry: geometry, positions: positions, N: N, M: M, side: side };
  }

  function updateGuardCell(cell, halfPore) {
    var HL = STOMA_HALF_LENGTH;
    var RM = STOMA_CELL_RADIUS;
    var B = halfPore + RM;
    var rho = (HL * HL + B * B) / (2 * B);
    var phi = Math.asin(clamp(HL / rho, 0, 1));
    var N = cell.N;
    var M = cell.M;
    var sign = cell.side;                 /* -1 = tế bào bên trái, +1 = bên phải */
    var i;
    var j;
    for (i = 0; i <= N; i++) {
      var s = i / N;
      var alpha = -phi + 2 * phi * s;
      var cx = -B + rho * (1 - Math.cos(alpha));     /* tâm đường cong của tế bào trái */
      var cy = rho * Math.sin(alpha);
      var nx = -Math.cos(alpha);
      var ny = Math.sin(alpha);
      var profile = Math.pow(Math.max(Math.sin(Math.PI * s), 0), 0.5);
      var radiusN = RM * profile;
      var radiusZ = 0.36 * profile;
      for (j = 0; j <= M; j++) {
        var angle = 2 * Math.PI * j / M;
        var along = Math.cos(angle) * radiusN;
        var px = cx + nx * along;
        var py = cy + ny * along;
        var pz = Math.sin(angle) * radiusZ;
        var index = (i * (M + 1) + j) * 3;
        cell.positions[index] = sign < 0 ? px : -px;
        cell.positions[index + 1] = py;
        cell.positions[index + 2] = pz;
      }
    }
    cell.geometry.attributes.position.needsUpdate = true;
    cell.geometry.computeVertexNormals();
  }

  function createLeafShape() {
    var shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.3, 0.3, 0.9, 0.34, 1.25, 0);
    shape.bezierCurveTo(0.9, -0.34, 0.3, -0.3, 0, 0);
    return shape;
  }

  function render79(group) {
    var S = {
      id: '7-9', params: null, time: 0, opening: 0, initialized: false,
      waterParticles: [], vaporRight: [], vaporLeft: [], streaks: [], leafPoints: [],
      spawnRight: 0, spawnLeft: 0, vaporRate: 0, flowSpeed: 0, windSpeed: 0, leaves: []
    };
    addLights(group);
    makeBench(group, 18.4, 5.0, 0.0);

    /* ======== CỤM TRÁI: cành cây cắm trong bình nước màu, thân cắt dọc ======== */
    var beaker = new THREE.Mesh(lathe([
      [0.001, 0], [1.12, 0], [1.2, 0.06], [1.2, 1.8], [1.26, 1.86], [1.22, 1.88], [1.14, 1.8], [1.14, 0.12], [0.001, 0.12]
    ], 64), glassMaterial(0.22));
    beaker.position.x = BRANCH_X;
    beaker.renderOrder = 3;
    group.add(beaker);
    var dyeLevel = 1.45;
    var dye = new THREE.Mesh(new THREE.CylinderGeometry(1.135, 1.135, dyeLevel - 0.12, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0xff5a6e, transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false
      }));
    dye.position.set(BRANCH_X, 0.12 + (dyeLevel - 0.12) / 2, 0);
    dye.renderOrder = 2;
    group.add(dye);

    /* nửa thân phía sau (bán trong suốt) + mặt cắt dọc */
    var stemLength = STEM_TOP_Y - STEM_BOTTOM_Y;
    var stemCenterY = (STEM_TOP_Y + STEM_BOTTOM_Y) / 2;
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.43, stemLength, 32, 1, true, Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({
        color: 0x6aa84f, roughness: 0.6, metalness: 0.0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false
      }));
    stem.position.set(BRANCH_X, stemCenterY, 0);
    stem.renderOrder = 4;
    group.add(stem);
    var cut = new THREE.Mesh(new THREE.PlaneGeometry(0.82, stemLength),
      new THREE.MeshStandardMaterial({
        color: 0xf1f8e0, roughness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
      }));
    cut.position.set(BRANCH_X, stemCenterY, 0);
    cut.renderOrder = 3;
    group.add(cut);

    /* các bó mạch gỗ (xylem) */
    var vesselTexture = makeVesselTexture();
    S.vesselX = [];
    var v;
    for (v = 0; v < VESSEL_COUNT; v++) {
      var vx = BRANCH_X + (v - (VESSEL_COUNT - 1) / 2) * 0.115;
      S.vesselX.push(vx);
      var vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, stemLength, 12),
        new THREE.MeshStandardMaterial({
          map: vesselTexture, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false
        }));
      vessel.position.set(vx, stemCenterY, 0.045);
      vessel.renderOrder = 5;
      group.add(vessel);
    }

    /* cành nhánh + lá xanh */
    var leafGeometry = new THREE.ShapeGeometry(createLeafShape(), 24);
    var leafMaterials = [
      standardMaterial(0x2f9e44, 0.0, 0.5, { side: THREE.DoubleSide, emissive: 0x0a3a10, emissiveIntensity: 0.3 }),
      standardMaterial(0x43b350, 0.0, 0.5, { side: THREE.DoubleSide, emissive: 0x0a3a10, emissiveIntensity: 0.3 })
    ];
    var veinMaterial = standardMaterial(0x1b5e20, 0.0, 0.6);
    var twigHeights = [3.3, 3.9, 4.5, 5.0];
    var t;
    for (t = 0; t < twigHeights.length; t++) {
      var direction = (t % 2 === 0) ? 1 : -1;
      var twigY = twigHeights[t];
      var twig = addMesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 8), standardMaterial(0x558b2f, 0.0, 0.7),
        BRANCH_X + direction * 0.3, twigY + 0.15, 0, group);
      twig.rotation.z = -direction * 1.0;
      var pivot = new THREE.Group();
      pivot.position.set(BRANCH_X + direction * 0.62, twigY + 0.33, 0);
      pivot.rotation.y = direction > 0 ? 0 : Math.PI;
      pivot.rotation.z = 0.35;
      var leaf = new THREE.Mesh(leafGeometry, leafMaterials[t % 2]);
      leaf.castShadow = true;
      leaf.scale.set(1.0, 1.0, 1.0);
      pivot.add(leaf);
      var rib = addMesh(new THREE.BoxGeometry(1.1, 0.014, 0.014), veinMaterial, 0.6, 0, 0.004, pivot);
      group.add(pivot);
      S.leaves.push({ pivot: pivot, baseZ: 0.35, phase: t * 1.7, direction: direction });
      var tipX = BRANCH_X + direction * (0.62 + 1.1 * Math.cos(0.35));
      S.leafPoints.push({ x: tipX, y: twigY + 0.33 + 1.1 * Math.sin(0.35), z: 0 });
      S.leafPoints.push({ x: BRANCH_X + direction * (0.62 + 0.6 * Math.cos(0.35)), y: twigY + 0.33 + 0.6 * Math.sin(0.35), z: 0.05 });
    }
    S.leafMaterials = leafMaterials;

    /* phân tử nước (hạt xanh dương) đi lên trong mạch gỗ */
    var waterGeometry = new THREE.SphereGeometry(1, 12, 10);
    var waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x2979ff, emissive: 0x1144cc, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.1
    });
    var i;
    for (i = 0; i < WATER_PARTICLE_POOL; i++) {
      var particle = new THREE.Mesh(waterGeometry, waterMaterial);
      particle.scale.setScalar(0.05);
      particle.renderOrder = 6;
      group.add(particle);
      S.waterParticles.push({
        mesh: particle, vessel: i % VESSEL_COUNT,
        y: STEM_BOTTOM_Y + 0.15 + (STEM_TOP_Y - STEM_BOTTOM_Y - 0.3) * ((i / VESSEL_COUNT | 0) / (WATER_PARTICLE_POOL / VESSEL_COUNT)),
        offset: seededRandom(i, 40) * 0.02
      });
    }

    /* hơi nước nhỏ bay ra từ lá bên trái + vệt gió */
    var vaporGeometry = new THREE.SphereGeometry(1, 10, 8);
    var vaporMaterial = new THREE.MeshBasicMaterial({
      color: 0xe8f6ff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false
    });
    for (i = 0; i < VAPOR_POOL_LEFT; i++) {
      var puff = new THREE.Mesh(vaporGeometry, vaporMaterial);
      puff.visible = false;
      group.add(puff);
      S.vaporLeft.push({ mesh: puff, active: false, x: 0, y: 0, z: 0, vy: 0.5, life: 0, size: 0.05 });
    }
    var streakMaterial = new THREE.MeshBasicMaterial({
      color: 0xcfeaff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false
    });
    for (i = 0; i < WIND_STREAK_POOL; i++) {
      var streak = new THREE.Mesh(new THREE.BoxGeometry(0.9 + Math.random() * 0.6, 0.012, 0.012), streakMaterial.clone());
      streak.position.set(BRANCH_X - 2.4 + Math.random() * 4.8, 2.8 + Math.random() * 3.0, -0.6 + Math.random() * 1.4);
      streak.userData.speed = 0.8 + Math.random() * 0.6;
      group.add(streak);
      S.streaks.push(streak);
    }

    /* ======== CỤM PHẢI: khí khổng phóng đại trên biểu bì lá ======== */
    S.stoma = new THREE.Group();
    S.stoma.position.set(STOMA_X, STOMA_Y, 0);
    S.stoma.rotation.x = -1.0;
    group.add(S.stoma);
    addMesh(roundedBoxGeometry(7.4, 5.4, 0.3, 0.2, 0.04), standardMaterial(0x2f5d2a, 0.0, 0.7), 0, 0, 0, S.stoma);
    var epidermis = new THREE.Mesh(new THREE.PlaneGeometry(7.1, 5.1),
      new THREE.MeshStandardMaterial({ map: makeEpidermisTexture(), roughness: 0.55, metalness: 0.0 }));
    epidermis.position.z = 0.152;
    epidermis.receiveShadow = true;
    S.stoma.add(epidermis);

    S.pore = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x03150a }));
    S.pore.position.z = 0.16;
    S.stoma.add(S.pore);
    var guardMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3dbb55, roughness: 0.35, metalness: 0.0, clearcoat: 0.6, emissive: 0x0a4d18, emissiveIntensity: 0.5,
      side: THREE.DoubleSide
    });
    S.guardLeft = buildGuardCell(-1, guardMaterial);
    S.guardRight = buildGuardCell(1, guardMaterial);
    S.guardLeft.mesh.position.z = 0.27;
    S.guardRight.mesh.position.z = 0.27;
    S.stoma.add(S.guardLeft.mesh);
    S.stoma.add(S.guardRight.mesh);

    /* lục lạp trong hai tế bào hạt đậu (đĩa xanh nhỏ) */
    S.chloroplasts = [];
    var chloroplastGeometry = new THREE.SphereGeometry(0.06, 10, 8);
    var chloroplastMaterial = new THREE.MeshStandardMaterial({ color: 0x1b8a2e, emissive: 0x0b5a18, emissiveIntensity: 0.6, roughness: 0.4 });
    var n;
    for (n = 0; n < 14; n++) {
      var chloroplast = new THREE.Mesh(chloroplastGeometry, chloroplastMaterial);
      chloroplast.scale.set(1.3, 1, 0.7);
      chloroplast.position.z = 0.55;
      S.stoma.add(chloroplast);
      S.chloroplasts.push({
        mesh: chloroplast, side: n % 2 === 0 ? -1 : 1,
        s: 0.15 + 0.7 * seededRandom(n, 50), lateral: (seededRandom(n, 51) - 0.5) * 0.5
      });
    }

    /* hơi nước thoát ra từ khe khí khổng */
    var vaporGeometryRight = new THREE.SphereGeometry(1, 12, 10);
    var vaporMaterialRight = new THREE.MeshBasicMaterial({
      color: 0xdff3ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false
    });
    for (i = 0; i < VAPOR_POOL_RIGHT; i++) {
      var vapor = new THREE.Mesh(vaporGeometryRight, vaporMaterialRight);
      vapor.visible = false;
      vapor.renderOrder = 8;
      S.stoma.add(vapor);
      S.vaporRight.push({ mesh: vapor, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 1, size: 0.1 });
    }

    /* nhãn */
    var tagBottle = createTag('Bình nước màu (rễ)', '#ff8a80', 448, 128, 2.3, 52);
    tagBottle.position.set(BRANCH_X - 1.4, 0.35, 2.4);
    group.add(tagBottle);
    var tagXylem = createTag('Mạch gỗ (xylem)', '#4fc3ff', 448, 128, 2.3, 52);
    tagXylem.position.set(BRANCH_X + 1.4, 0.35, 2.4);
    group.add(tagXylem);
    var tagGuard = createTag('Tế bào hạt đậu', '#7dffb2', 448, 128, 2.2, 52);
    tagGuard.position.set(STOMA_X - 2.4, 0.35, 2.4);
    group.add(tagGuard);
    var tagPore = createTag('Khe khí khổng', '#ffd54a', 448, 128, 2.2, 52);
    tagPore.position.set(STOMA_X, 0.35, 2.4);
    group.add(tagPore);
    var tagVapor = createTag('Hơi nước H₂O', '#e1f5fe', 448, 128, 2.2, 52);
    tagVapor.position.set(STOMA_X + 2.4, 0.35, 2.4);
    group.add(tagVapor);

    /* bảng số liệu */
    var mono = '"Consolas","Courier New",monospace';
    S.labelAperture = addLedPanel(group, 0.0, 7.7, -1.8, 6.4, 'Độ mở khí khổng: 0.0 μm', { color: '#7dffb2', font: mono }, false);
    S.labelFlow = addLedPanel(group, 0.0, 6.9, -1.8, 6.4, 'Tốc độ dòng mạch gỗ: 0.0 cm/giờ', { color: '#4fc3ff', font: mono }, false);
    S.labelTranspiration = addLedPanel(group, 0.0, 6.1, -1.8, 6.4, 'Tốc độ thoát hơi nước: 0.0 mg/giờ', { color: '#ffd54a', font: mono }, false);
    S.labelConditions = addLedPanel(group, 0.0, 5.3, -1.8, 6.4, 'Độ ẩm 60% | 25 °C | gió 1.0 m/s', { color: '#cfd8dc', fontSize: 52 }, false);
    return S;
  }

  function computeParameters79(p1, p2, p3) {
    var humidity = clamp(toNumber(p1, 60), 20, 95);
    var temperature = clamp(toNumber(p2, 25), 15, 40);
    var wind = clamp(toNumber(p3, 1), 0, 5);

    /* độ mở khí khổng: tăng theo nhiệt độ (đến ~30 °C), cao nhất khi độ ẩm vừa phải, gió làm mở thêm một chút */
    var fTemperature = temperature <= 30 ? 0.25 + 0.75 * (temperature - 15) / 15 : 1 - 0.55 * (temperature - 30) / 10;
    var fHumidity = 0.15 + 0.85 * Math.exp(-Math.pow((humidity - 60) / 32, 2));
    var fWind = 0.85 + 0.15 * Math.min(wind / 3, 1);
    var aperture = STOMA_MAX_APERTURE * fTemperature * fHumidity * fWind;

    /* thoát hơi nước ~ độ thiếu hụt áp suất hơi (VPD) × độ dẫn khí khổng × hiệu ứng gió */
    var saturation = 0.6108 * Math.exp(17.27 * temperature / (temperature + 237.3));       /* kPa */
    var deficit = saturation * (1 - humidity / 100);
    var transpiration = 40 * deficit * (0.1 + aperture / STOMA_MAX_APERTURE) * (1 + 0.55 * wind);   /* mg/giờ */
    var flow = 3 + 0.28 * transpiration;                                                   /* cm/giờ */
    return {
      humidity: humidity, temperature: temperature, wind: wind, aperture: aperture,
      deficit: deficit, transpiration: transpiration, flow: flow
    };
  }

  function halfPoreFromAperture(aperture) {
    return 0.03 + 0.62 * clamp(aperture / STOMA_MAX_APERTURE, 0, 1);
  }

  function applyStomaShape79(S, halfPore) {
    updateGuardCell(S.guardLeft, halfPore);
    updateGuardCell(S.guardRight, halfPore);
    S.pore.scale.set(halfPore + 0.03, STOMA_HALF_LENGTH * 0.93, 1);
    var c;
    for (c = 0; c < S.chloroplasts.length; c++) {
      var info = S.chloroplasts[c];
      var HL = STOMA_HALF_LENGTH;
      var y = (info.s - 0.5) * 2 * HL * 0.8;
      var yNorm = y / HL;
      var centerX = halfPore + STOMA_CELL_RADIUS * 0.15 + (halfPore + STOMA_CELL_RADIUS) * 0.0;
      var bow = (halfPore + STOMA_CELL_RADIUS) * (1 - yNorm * yNorm);
      info.mesh.position.set(info.side * (bow + info.lateral * 0.3 * (1 - yNorm * yNorm)), y, 0.42);
      void centerX;
    }
  }

  function update79(S, p1, p2, p3) {
    var P = computeParameters79(p1, p2, p3);
    S.params = P;
    S.windSpeed = P.wind;
    S.flowSpeed = P.flow;
    S.vaporRate = P.transpiration;
    S.targetHalfPore = halfPoreFromAperture(P.aperture);
    if (!S.initialized) {
      S.initialized = true;
      S.halfPore = S.targetHalfPore;
      applyStomaShape79(S, S.halfPore);
    }

    updateText3D(S.labelAperture, 'Độ mở khí khổng: ' + fmt(P.aperture, 1) + ' μm');
    updateText3D(S.labelFlow, 'Tốc độ dòng mạch gỗ: ' + fmt(P.flow, 1) + ' cm/giờ');
    updateText3D(S.labelTranspiration, 'Tốc độ thoát hơi nước: ' + fmt(P.transpiration, 1) + ' mg/giờ');
    updateText3D(S.labelConditions, 'Độ ẩm ' + fmt(P.humidity, 0) + '% | ' + fmt(P.temperature, 0) + ' °C | gió ' + fmt(P.wind, 1) + ' m/s');
  }

  function animate79(S, dt, p1, p2, p3) {
    var P = S.params;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      var fresh = computeParameters79(p1, p2, p3);
      if (!P || fresh.humidity !== P.humidity || fresh.temperature !== P.temperature || fresh.wind !== P.wind) {
        update79(S, p1, p2, p3);
        P = S.params;
      }
    }
    if (!P) {
      return;
    }
    S.time += dt;

    /* hai tế bào hạt đậu cong dần để mở / khép khe khí khổng */
    var blend = 1 - Math.exp(-dt * 3);
    var target = S.targetHalfPore + 0.012 * Math.sin(S.time * 1.5);
    if (Math.abs(target - S.halfPore) > 0.0015) {
      S.halfPore += (target - S.halfPore) * blend;
      applyStomaShape79(S, S.halfPore);
    }

    /* dòng phân tử nước đi lên trong mạch gỗ */
    var speed = clamp(S.flowSpeed * 0.03, 0.1, 3.4);
    var i;
    for (i = 0; i < S.waterParticles.length; i++) {
      var particle = S.waterParticles[i];
      particle.y += speed * dt;
      if (particle.y > STEM_TOP_Y - 0.1) {
        particle.y = STEM_BOTTOM_Y + 0.1;
      }
      particle.mesh.position.set(S.vesselX[particle.vessel] + particle.offset * Math.sin(S.time * 4 + i), particle.y, 0.05);
    }

    /* lá đung đưa theo gió */
    var sway = 0.03 + 0.09 * Math.min(S.windSpeed / 5, 1);
    var l;
    for (l = 0; l < S.leaves.length; l++) {
      var leaf = S.leaves[l];
      leaf.pivot.rotation.z = leaf.baseZ + sway * Math.sin(S.time * (1.5 + 0.5 * S.windSpeed) + leaf.phase);
    }

    /* vệt gió */
    var windVisible = S.windSpeed > 0.05;
    var s;
    for (s = 0; s < S.streaks.length; s++) {
      var streak = S.streaks[s];
      streak.position.x += dt * streak.userData.speed * (1.0 + 2.2 * S.windSpeed);
      if (streak.position.x > BRANCH_X + 3.0) {
        streak.position.x = BRANCH_X - 3.0;
        streak.position.y = 2.8 + Math.random() * 3.0;
        streak.position.z = -0.6 + Math.random() * 1.4;
      }
      streak.material.opacity = windVisible ? 0.55 * Math.min(S.windSpeed / 1.5, 1) : 0;
    }

    /* hơi nước nhỏ thoát ra từ lá bên trái */
    S.spawnLeft += dt * Math.min(S.vaporRate / 20, 10);
    while (S.spawnLeft >= 1) {
      S.spawnLeft -= 1;
      var slotLeft = null;
      var k;
      for (k = 0; k < S.vaporLeft.length; k++) {
        if (!S.vaporLeft[k].active) {
          slotLeft = S.vaporLeft[k];
          break;
        }
      }
      if (slotLeft) {
        var origin = S.leafPoints[Math.floor(Math.random() * S.leafPoints.length)];
        slotLeft.active = true;
        slotLeft.x = origin.x + (Math.random() - 0.5) * 0.3;
        slotLeft.y = origin.y + 0.05;
        slotLeft.z = origin.z + (Math.random() - 0.5) * 0.2;
        slotLeft.vy = randomBetween(0.35, 0.7);
        slotLeft.life = 0;
        slotLeft.size = randomBetween(0.04, 0.07);
        slotLeft.mesh.visible = true;
      }
    }
    for (k = 0; k < S.vaporLeft.length; k++) {
      var puff = S.vaporLeft[k];
      if (!puff.active) {
        continue;
      }
      puff.life += dt;
      puff.y += puff.vy * dt;
      puff.x += (0.2 + 0.9 * S.windSpeed) * dt;
      if (puff.life > 3.0) {
        puff.active = false;
        puff.mesh.visible = false;
        continue;
      }
      puff.mesh.position.set(puff.x, puff.y, puff.z);
      puff.mesh.scale.setScalar(puff.size * (1 + puff.life * 0.5));
    }

    /* hơi nước bay ra từ khe khí khổng (cụm phải) */
    var openFraction = clamp(P.aperture / STOMA_MAX_APERTURE, 0, 1);
    S.spawnRight += dt * Math.min(S.vaporRate / 8, 30) * (0.15 + openFraction);
    while (S.spawnRight >= 1) {
      S.spawnRight -= 1;
      var slot = null;
      var q;
      for (q = 0; q < S.vaporRight.length; q++) {
        if (!S.vaporRight[q].active) {
          slot = S.vaporRight[q];
          break;
        }
      }
      if (slot) {
        slot.active = true;
        slot.x = (Math.random() * 2 - 1) * S.halfPore * 0.9;
        slot.y = (Math.random() * 2 - 1) * STOMA_HALF_LENGTH * 0.8;
        slot.z = 0.2;
        slot.vz = randomBetween(0.8, 1.4);
        slot.vx = (Math.random() - 0.5) * 0.3;
        slot.vy = (Math.random() - 0.5) * 0.3;
        slot.size = randomBetween(0.07, 0.13);
        slot.mesh.visible = true;
      }
    }
    for (q = 0; q < S.vaporRight.length; q++) {
      var vapor = S.vaporRight[q];
      if (!vapor.active) {
        continue;
      }
      vapor.z += vapor.vz * dt;
      vapor.x += (vapor.vx + 0.6 * S.windSpeed) * dt;
      vapor.y += vapor.vy * dt;
      if (vapor.z > 3.4 || vapor.x > 3.4) {
        vapor.active = false;
        vapor.mesh.visible = false;
        continue;
      }
      vapor.mesh.position.set(vapor.x, vapor.y, vapor.z);
      vapor.mesh.scale.setScalar(vapor.size * (1 + 0.45 * vapor.z));
    }
  }


  /* ===========================================================================
   * 6. HÀM CHÍNH XUẤT RA window  (dạng switch-case, 9 bài)
   * ========================================================================= */
  function readSliderValue(elementId, fallback) {
    var element = document.getElementById(elementId);
    if (!element) {
      return fallback;
    }
    return toNumber(element.value, fallback);
  }

  window.renderGrade7 = function (expId, expGroup, expState) {
    var id = String(expId);
    var state = expState || {};
    var S = null;
    var defaults = [10, 5, 0];

    switch (id) {
      case '7-1':
        S = render71(expGroup);
        defaults = [10, 5, 0];
        break;
      case '7-2':
        S = render72(expGroup);
        defaults = [440, 2.5, 343];
        break;
      case '7-3':
        S = render73(expGroup);
        defaults = [45, 1.5, 80];
        break;
      case '7-4':
        S = render74(expGroup);
        defaults = [11, 3, 1];
        break;
      case '7-5':
        S = render75(expGroup);
        defaults = [11, 25, 2];
        break;
      case '7-6':
        S = render76(expGroup);
        defaults = [40, 2, 1];
        break;
      case '7-7':
        S = render77(expGroup);
        defaults = [80, 0.1, 28];
        break;
      case '7-8':
        S = render78(expGroup);
        defaults = [100, 25, 12];
        break;
      case '7-9':
        S = render79(expGroup);
        defaults = [60, 25, 1];
        break;
      default:
        return false;
    }
    state.grade7 = S;

    /* đọc giá trị hiện tại của các thanh trượt và cập nhật số liệu ngay khi mở bài */
    var p1 = readSliderValue('param1', defaults[0]);
    var p2 = readSliderValue('param2', defaults[1]);
    var p3 = readSliderValue('param3', defaults[2]);
    window.updateGrade7(expId, state, p1, p2, p3);
    return true;
  };

  window.updateGrade7 = function (expId, expState, p1, p2, p3) {
    var S = expState && expState.grade7;
    if (!S) {
      return;
    }
    switch (String(expId)) {
      case '7-1':
        update71(S, p1, p2, p3);
        break;
      case '7-2':
        update72(S, p1, p2, p3);
        break;
      case '7-3':
        update73(S, p1, p2, p3);
        break;
      case '7-4':
        update74(S, p1, p2, p3);
        break;
      case '7-5':
        update75(S, p1, p2, p3);
        break;
      case '7-6':
        update76(S, p1, p2, p3);
        break;
      case '7-7':
        update77(S, p1, p2, p3);
        break;
      case '7-8':
        update78(S, p1, p2, p3);
        break;
      case '7-9':
        update79(S, p1, p2, p3);
        break;
      default:
        break;
    }
  };

  window.animateGrade7 = function (expId, expState, dt, p1, p2, p3) {
    var S = expState && expState.grade7;
    if (!S) {
      return;
    }
    var step = clamp(toNumber(dt, 0.016), 0, 0.1);
    switch (String(expId)) {
      case '7-1':
        animate71(S, step, p1, p2, p3);
        break;
      case '7-2':
        animate72(S, step, p1, p2, p3);
        break;
      case '7-3':
        animate73(S, step, p1, p2, p3);
        break;
      case '7-4':
        animate74(S, step, p1, p2, p3);
        break;
      case '7-5':
        animate75(S, step, p1, p2, p3);
        break;
      case '7-6':
        animate76(S, step, p1, p2, p3);
        break;
      case '7-7':
        animate77(S, step, p1, p2, p3);
        break;
      case '7-8':
        animate78(S, step, p1, p2, p3);
        break;
      case '7-9':
        animate79(S, step, p1, p2, p3);
        break;
      default:
        break;
    }
  };
})();