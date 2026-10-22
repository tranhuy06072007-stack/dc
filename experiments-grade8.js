/* =====================================================================
   experiments-grade8.js  —  Phòng thí nghiệm ảo 3D, VẬT LÝ KHỐI 8 (Three.js r128)

   Bài 8-1: Xác định khối lượng riêng
   Bài 8-2: Áp suất chất lỏng và lực đẩy Archimedes
   Bài 8-3: Đo năng lượng nhiệt và đòn bẩy
   Bài 8-4: Định luật bảo toàn khối lượng (BaCl2 + Na2SO4)
   Bài 8-5: Dung dịch và độ tan (CuSO4)
   Bài 8-6: Acid - Base và thang đo pH
   Bài 8-7: Quan sát tế bào và mô cơ thể người (kính hiển vi)
   Bài 8-8: Tiêu hóa và hô hấp ở người
   Bài 8-9: Hệ sinh thái (chuỗi thức ăn, tháp sinh thái)

   API công khai:
     createText3D(text, width, height, options)   -> THREE.Mesh (CanvasTexture 896x128)
     updateText3D(mesh, text, options)
     window.renderGrade8(expId, expGroup, expState)
     window.updateGrade8(expId, expState, p1, p2, p3)
     window.animateGrade8(expId, expState, dt, p1, p2, p3)

   Quy ước tọa độ: camera nhìn vào (0, 1.0, 0), radius = 11.2, mặt bàn y = -1.25.
   Mọi mô hình nằm trong x ∈ [-5.5, 5.5], y ∈ [-1.2, 4.3].
   ===================================================================== */
(function (global) {
  'use strict';

  var CANVAS_W = 896;
  var CANVAS_H = 128;
  var TABLE_Y = -1.25;

  var DEFAULT_PARAMS = {
    '8-1': [250, 100, 25],
    '8-2': [20, 150, 1.0],
    '8-3': [300, 30, 40],
    '8-4': [50, 73, 100],
    '8-5': [40, 45, 100],
    '8-6': [0.1, 7, 3],
    '8-7': [400, 0.8, 60],
    '8-8': [500, 1.0, 18],
    '8-9': [150, 3, 1000]
  };

  /* ------------------------------------------------------------------
     Tiện ích số học
     ------------------------------------------------------------------ */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, fallback) {
    var x = parseFloat(v);
    return isNaN(x) ? fallback : x;
  }
  function fmtTrim(v) { return String(parseFloat(Number(v).toFixed(2))); }

  /* ------------------------------------------------------------------
     Nhãn chữ 3D: CanvasTexture 896 x 128, viền bo góc phát sáng sắc nét.
     Mặt phẳng có thể có tỉ lệ bất kỳ (width/height); nội dung được vẽ trong
     "không gian ảo" có cùng tỉ lệ rồi co lại vào canvas 896x128, nên chữ và
     góc bo không bị méo khi hiển thị.
     ------------------------------------------------------------------ */
  var TEXT_DEFAULTS = {
    color: '#7dffb3',
    border: '#19e0ff',
    bg: 'rgba(4,12,26,0.92)',
    fontSize: 64
  };

  function roundedRectPath(ctx, x, y, w, h, r) {
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

  function paintText3D(canvas, text, o) {
    var ctx = canvas.getContext('2d');
    var vw = CANVAS_H * o.aspect;
    var margin = 7;
    var radius = 24;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.setTransform(CANVAS_W / vw, 0, 0, 1, 0, 0);

    // nền
    roundedRectPath(ctx, margin, margin, vw - 2 * margin, CANVAS_H - 2 * margin, radius);
    ctx.fillStyle = o.bg;
    ctx.fill();

    // viền phát sáng
    ctx.save();
    ctx.shadowColor = o.border;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 5;
    ctx.strokeStyle = o.border;
    ctx.stroke();
    ctx.restore();

    // đường viền mảnh sắc nét bên trong
    roundedRectPath(ctx, margin + 4, margin + 4, vw - 2 * margin - 8, CANVAS_H - 2 * margin - 8, radius - 4);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    // chữ (tự co cỡ chữ cho vừa khung)
    var fontSize = o.fontSize;
    var maxWidth = vw - 2 * margin - 40;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    while (fontSize > 10) {
      ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Roboto, Arial, sans-serif';
      if (ctx.measureText(text).width <= maxWidth) { break; }
      fontSize -= 2;
    }
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = o.color;
    ctx.fillText(text, vw / 2, CANVAS_H / 2 + 3);
    ctx.shadowBlur = 0;
  }

  function createText3D(text, width, height, options) {
    var canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = 4;

    var material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.renderOrder = 20;

    var base = Object.assign({}, TEXT_DEFAULTS, options || {});
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
    var d = mesh && mesh.userData && mesh.userData.text3d;
    if (!d) { return; }
    var o = Object.assign({}, d.base, options || {});
    o.aspect = d.aspect;
    var str = String(text);
    var key = str + '|' + o.color + '|' + o.border + '|' + o.bg + '|' + o.fontSize;
    if (key === d.key) { return; }
    d.key = key;
    paintText3D(d.canvas, str, o);
    d.texture.needsUpdate = true;
  }

  /* ------------------------------------------------------------------
     Vật liệu và hình học dùng chung
     ------------------------------------------------------------------ */
  function stdMat(color, metalness, roughness, extra) {
    var p = {
      color: color,
      metalness: metalness === undefined ? 0.2 : metalness,
      roughness: roughness === undefined ? 0.6 : roughness
    };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) { p[k] = extra[k]; } } }
    return new THREE.MeshStandardMaterial(p);
  }

  function glassMat(color, opacity) {
    return new THREE.MeshPhongMaterial({
      color: color === undefined ? 0xcfe8ff : color,
      transparent: true,
      opacity: opacity === undefined ? 0.22 : opacity,
      shininess: 100,
      specular: 0xffffff,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  function liquidMat(color, opacity) {
    return new THREE.MeshPhongMaterial({
      color: color,
      transparent: true,
      opacity: opacity === undefined ? 0.6 : opacity,
      shininess: 60,
      depthWrite: false
    });
  }

  function addMesh(parent, geometry, material, x, y, z) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x || 0, y || 0, z || 0);
    parent.add(mesh);
    return mesh;
  }

  function addLabel(parent, text, w, h, x, y, z, options) {
    var label = createText3D(text, w, h, options);
    label.position.set(x, y, z);
    parent.add(label);
    return label;
  }

  function cylBetween(parent, a, b, radius, material) {
    var dir = new THREE.Vector3().subVectors(b, a);
    var len = dir.length();
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
    return mesh;
  }

  /* Bảng LED 3D nằm phía sau mô hình, tối đa y = 4.3, rộng gọn trong x ∈ [-4.95, 4.95] */
  function buildPanel(group, lineCount) {
    var lineW = 9.4;
    var lineH = 0.52;
    var gap = 0.06;
    var total = lineCount * lineH + (lineCount - 1) * gap;
    var centerY = 4.3 - 0.15 - total / 2;
    var z = -3.2;

    addMesh(group, new THREE.BoxGeometry(lineW + 0.5, total + 0.3, 0.08),
      stdMat(0x07111c, 0.5, 0.5), 0, centerY, z - 0.06);

    var lines = [];
    for (var i = 0; i < lineCount; i++) {
      var y = centerY + total / 2 - lineH / 2 - i * (lineH + gap);
      var line = createText3D('', lineW, lineH, { fontSize: 60 });
      line.position.set(0, y, z);
      group.add(line);
      lines.push(line);
    }
    return lines;
  }

  /* Hạt (hơi nước, bọt khí) */
  var dotTexture = null;
  function getDotTexture() {
    if (!dotTexture) {
      var c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      var x = c.getContext('2d');
      var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      dotTexture = new THREE.CanvasTexture(c);
    }
    return dotTexture;
  }

  function makeParticles(parent, count, color, size) {
    var geometry = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var material = new THREE.PointsMaterial({
      color: color,
      size: size,
      map: getDotTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true
    });
    var points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    parent.add(points);

    var seed = new Float32Array(count * 3);
    var age = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
      age[i] = Math.random();
    }
    return { points: points, pos: pos, seed: seed, age: age, count: count };
  }

  function stepParticles(ps, dt, cx, cz, radius, baseY, rise, speed) {
    var a = ps.age;
    var p = ps.pos;
    var s = ps.seed;
    for (var i = 0; i < ps.count; i++) {
      a[i] += dt * speed * (0.6 + 0.8 * s[i * 3 + 2]);
      if (a[i] > 1) {
        a[i] -= 1;
        s[i * 3] = Math.random();
        s[i * 3 + 1] = Math.random();
      }
      var ang = s[i * 3] * 6.2832;
      var rr = Math.sqrt(s[i * 3 + 1]) * radius;
      p[i * 3] = cx + Math.cos(ang) * rr + Math.sin(a[i] * 6 + i) * 0.05;
      p[i * 3 + 1] = baseY + a[i] * rise;
      p[i * 3 + 2] = cz + Math.sin(ang) * rr;
    }
    ps.points.geometry.attributes.position.needsUpdate = true;
  }

  /* Nhiệt kế 3D có cột chất lỏng đỏ */
  function buildThermometer(group, x, z, yBottom, tubeLen, scaleLen, tMin, tMax) {
    var th = {
      x: x, z: z,
      bulbY: yBottom + 0.1,
      scaleLen: scaleLen,
      tMin: tMin,
      tMax: tMax
    };
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.06, tubeLen, 16), glassMat(0xe8f4ff, 0.35),
      x, yBottom + tubeLen / 2, z);
    addMesh(group, new THREE.SphereGeometry(0.11, 16, 16), stdMat(0xd62828, 0.1, 0.3, { emissive: 0x551010 }),
      x, th.bulbY, z);
    th.col = addMesh(group, new THREE.CylinderGeometry(0.032, 0.032, 1, 12),
      stdMat(0xe01e1e, 0.1, 0.3, { emissive: 0x7a0f0f }), x, th.bulbY, z);

    var tickMat = stdMat(0x111111, 0, 1);
    for (var t = tMin; t <= tMax + 0.001; t += 10) {
      var y = th.bulbY + scaleLen * (t - tMin) / (tMax - tMin);
      addMesh(group, new THREE.BoxGeometry(t % 20 === 0 ? 0.14 : 0.09, 0.012, 0.012), tickMat, x - 0.1, y, z + 0.03);
      if (t % 20 === 0) {
        addLabel(group, String(t), 0.26, 0.1, x - 0.3, y, z + 0.05, { fontSize: 70 });
      }
    }
    return th;
  }

  function setThermometer(th, T) {
    var frac = clamp((T - th.tMin) / (th.tMax - th.tMin), 0, 1);
    var h = 0.04 + th.scaleLen * frac;
    th.col.scale.y = h;
    th.col.position.y = th.bulbY + h / 2;
  }

  function easeKeys(c, t, keys, k) {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      c[key] += (t[key] - c[key]) * k;
    }
  }

  function cloneNumbers(src, keys) {
    var out = {};
    for (var i = 0; i < keys.length; i++) { out[keys[i]] = src[keys[i]]; }
    return out;
  }

  /* =====================================================================
     BÀI 8-1: XÁC ĐỊNH KHỐI LƯỢNG RIÊNG
     ===================================================================== */
  var KEYS_81 = ['level', 'size', 'vis', 'float'];

  function materialForDensity(D) {
    if (D < 1) { return { color: 0xe0a93b, metalness: 0.0, roughness: 0.85 }; }     // gỗ vàng
    if (D < 3) { return { color: 0x9aa4ad, metalness: 0.45, roughness: 0.5 }; }     // đá / nhôm xám
    if (D < 8) { return { color: 0xb4543a, metalness: 0.65, roughness: 0.4 }; }     // sắt / đồng đỏ
    return { color: 0xf0c230, metalness: 0.9, roughness: 0.25 };                    // vàng / chì
  }

  function build81(group, S) {
    var G = { id: '8-1', Y0: -1.15, ML: 0.002, CX: 2.2, SX: -2.5 };
    S.g8 = G;
    S.cur = null;
    S.t = null;
    S.time = 0;
    S.animated = false;
    var Y0 = G.Y0, ML = G.ML, CX = G.CX, SX = G.SX;

    G.panel = buildPanel(group, 3);

    // ---------- Cân điện tử (x = -2.5) ----------
    addMesh(group, new THREE.BoxGeometry(2.3, 0.36, 1.7), stdMat(0x2b3440, 0.5, 0.45), SX, -1.07, 0);
    addMesh(group, new THREE.BoxGeometry(2.3, 0.04, 1.7), stdMat(0xaab4c0, 0.7, 0.35), SX, -0.87, 0);
    addMesh(group, new THREE.CylinderGeometry(0.12, 0.14, 0.14, 20), stdMat(0x8d99a6, 0.9, 0.3), SX, -0.78, 0);
    G.pan = addMesh(group, new THREE.CylinderGeometry(0.85, 0.85, 0.06, 48), stdMat(0xd5dbe2, 0.9, 0.25), SX, -0.68, 0);
    addMesh(group, new THREE.BoxGeometry(1.9, 0.29, 0.02), stdMat(0x05080c, 0.2, 0.8), SX, -1.07, 0.85);
    G.scaleScreen = addLabel(group, '', 1.8, 0.23, SX, -1.07, 0.865, { fontSize: 70 });
    addLabel(group, 'CÂN ĐIỆN TỬ', 1.5, 0.26, SX, -1.5 + 0.0, 1.2, { fontSize: 56, color: '#cfe8ff' });

    // Chất liệu khối vật dùng chung cho khối trên cân và khối trong bình
    var cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    G.blockMat = stdMat(0x9aa4ad, 0.45, 0.5);
    G.panBlock = addMesh(group, cubeGeometry, G.blockMat, SX, -0.3, 0);
    G.cylBlock = addMesh(group, cubeGeometry, G.blockMat, CX - 0.1, 0, 0);

    // ---------- Bình chia độ (x = 2.2) ----------
    addMesh(group, new THREE.CylinderGeometry(0.95, 1.0, 0.08, 40), stdMat(0x3a4552, 0.4, 0.5), CX, -1.21, 0);
    addMesh(group, new THREE.CylinderGeometry(0.8, 0.8, 3.15, 40, 1, true), glassMat(0xcfe8ff, 0.2), CX, Y0 + 1.575, 0);
    var bottomDisc = addMesh(group, new THREE.CircleGeometry(0.8, 40), glassMat(0xcfe8ff, 0.3), CX, Y0 - 0.01, 0);
    bottomDisc.rotation.x = -Math.PI / 2;
    var rim = addMesh(group, new THREE.TorusGeometry(0.8, 0.025, 8, 40), glassMat(0xffffff, 0.6), CX, Y0 + 3.15, 0);
    rim.rotation.x = Math.PI / 2;

    G.water = addMesh(group, new THREE.CylinderGeometry(0.78, 0.78, 1, 40), liquidMat(0x3d9be9, 0.55), CX, Y0 + 0.5, 0);

    // vạch chia độ 100 → 1500 ml
    var tickMat = stdMat(0x111111, 0, 1);
    var a = -0.5;
    for (var ml = 100; ml <= 1500; ml += 100) {
      var major = (ml % 500 === 0);
      var yy = Y0 + ml * ML;
      var tick = addMesh(group, new THREE.BoxGeometry(major ? 0.3 : 0.18, 0.014, 0.014), tickMat,
        CX + 0.805 * Math.sin(a), yy, 0.805 * Math.cos(a));
      tick.rotation.y = a;
      if (major) {
        var lb = addLabel(group, String(ml), 0.4, 0.16,
          CX + 0.82 * Math.sin(a) - 0.42 * Math.cos(a), yy, 0.82 * Math.cos(a) + 0.42 * Math.sin(a),
          { fontSize: 78 });
        lb.rotation.y = a;
      }
    }
    addLabel(group, 'ml', 0.3, 0.16, CX - 0.55, Y0 + 3.3, 0.5, { fontSize: 80, color: '#cfe8ff' });

    // nhiệt kế gắn trong bình
    G.thermo = buildThermometer(group, CX + 0.55, 0, -0.95, 3.1, 2.6, 0, 100);
    G.thermoLabel = addLabel(group, '', 1.1, 0.3, CX + 0.55, 2.62, 0.3, { fontSize: 70, color: '#ffb3a0', border: '#ff6a4a' });
    G.levelLabel = addLabel(group, '', 2.0, 0.3, CX, 2.28, 0.4, { fontSize: 64, color: '#9fe8ff' });

    // hạt hơi nước (khi T > 60 °C)
    G.steam = makeParticles(group, 60, 0xffffff, 0.2);
  }

  function update81(S, p1, p2, p3) {
    var G = S.g8;
    var m = clamp(num(p1, 250), 10, 2000);
    var V = clamp(num(p2, 100), 5, 1000);
    var T = clamp(num(p3, 25), 10, 90);

    var D = m / V;                              // g/cm³
    var Dw = 1.0 - 0.0002 * (T - 20);           // khối lượng riêng của nước
    var floats = D < Dw;
    var ratio = floats ? D / Dw : 1;
    var levelMl = floats ? 400 + V * ratio : 400 + V;

    var size = 0.25 + 1.05 * Math.cbrt(V / 1000);
    var sizeCyl = Math.min(size, 0.9);

    // màu vật liệu theo D
    var spec = materialForDensity(D);
    G.blockMat.color.setHex(spec.color);
    G.blockMat.metalness = spec.metalness;
    G.blockMat.roughness = spec.roughness;

    // khối vật trên đĩa cân
    G.panBlock.scale.set(size, size, size);
    G.panBlock.position.y = -0.65 + size / 2;

    setThermometer(G.thermo, T);

    // chữ
    updateText3D(G.scaleScreen, 'm = ' + fmtTrim(m) + ' g', { color: '#7dffb3' });
    updateText3D(G.thermoLabel, fmtTrim(T) + ' °C');
    updateText3D(G.levelLabel, 'Mực nước: ' + Math.round(levelMl) + ' ml');

    var stateColor = floats ? '#7dffb3' : '#ffc56b';
    var stateBorder = floats ? '#2dff9a' : '#ff9d2e';
    updateText3D(G.panel[0], 'm = ' + fmtTrim(m) + ' g | V = ' + fmtTrim(V) + ' cm³ | T = ' + fmtTrim(T) + '°C');
    updateText3D(G.panel[1], 'Khối lượng riêng: D = m/V = ' + D.toFixed(2) + ' g/cm³ (' + Math.round(D * 1000) + ' kg/m³)',
      { color: '#ffe27a', border: '#ffc400' });
    updateText3D(G.panel[2], floats ? 'Vật NỔI trên mặt nước' : 'Vật CHÌM xuống đáy',
      { color: stateColor, border: stateBorder });

    S.t = {
      level: G.Y0 + levelMl * G.ML,
      size: sizeCyl,
      vis: floats ? Math.min(ratio, 0.96) : 1,
      float: floats ? 1 : 0,
      steam: T > 60 ? clamp((T - 60) / 30, 0, 1) : 0
    };
    if (!S.cur || !S.animated) {
      S.cur = cloneNumbers(S.t, KEYS_81);
      pose81(S);
    }
  }

  function pose81(S) {
    var G = S.g8;
    var c = S.cur;
    var h = Math.max(c.level - G.Y0, 0.001);
    G.water.scale.y = h;
    G.water.position.y = G.Y0 + h / 2;

    G.cylBlock.scale.set(c.size, c.size, c.size);
    var sinkY = G.Y0 + 0.03 + c.size / 2;
    var floatY = c.level - c.vis * c.size + c.size / 2 + Math.sin(S.time * 2.2) * 0.012 * c.float;
    floatY = Math.max(floatY, sinkY);
    G.cylBlock.position.set(G.CX - 0.1, lerp(sinkY, floatY, c.float), 0);
    G.cylBlock.rotation.y = Math.sin(S.time * 1.3) * 0.08 * c.float;
  }

  function animate81(S, dt) {
    var G = S.g8;
    var t = S.t;
    var c = S.cur;
    easeKeys(c, t, ['level', 'size', 'vis'], 1 - Math.exp(-6 * dt));
    easeKeys(c, t, ['float'], 1 - Math.exp(-5 * dt));
    pose81(S);

    if (t.steam > 0) {
      G.steam.points.visible = true;
      G.steam.points.material.opacity = 0.2 + 0.4 * t.steam;
      stepParticles(G.steam, dt, G.CX, 0, 0.55, c.level + 0.02, 1.0, 0.4 + 0.5 * t.steam);
    } else {
      G.steam.points.visible = false;
    }
  }

  /* =====================================================================
     BÀI 8-2: ÁP SUẤT CHẤT LỎNG VÀ LỰC ĐẨY ARCHIMEDES
     ===================================================================== */
  var KEYS_82 = ['F', 'hh', 'rr', 'surface', 'h', 'float', 'vis', 'pPa', 'cup', 'cr', 'cg', 'cb'];

  function liquidColorFor(D, out) {
    var a, b, f;
    if (D <= 1.0) { a = 0xe8c33f; b = 0x2f8fe6; f = (D - 0.8) / 0.2; }          // vàng dầu -> xanh nước biển
    else if (D <= 1.5) { a = 0x2f8fe6; b = 0x0b9a94; f = (D - 1.0) / 0.5; }     // xanh nước biển -> xanh ngọc đậm
    else { a = 0x0b9a94; b = 0x7b3fd0; f = (D - 1.5) / 0.5; }                   // xanh ngọc đậm -> tím
    out.set(a);
    return out.lerp(new THREE.Color(b), clamp(f, 0, 1));
  }

  /* Lò xo xoắn: đường xoắn ốc dựng bằng CatmullRomCurve3 (không phụ thuộc phiên bản Three.js) */
  function helixCurve(radius, turns) {
    var pts = [];
    var n = turns * 10;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var ang = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(radius * Math.cos(ang), -t, radius * Math.sin(ang)));
    }
    return new THREE.CatmullRomCurve3(pts);
  }

  function build82(group, S) {
    var G = {
      id: '8-2',
      BX: -2.3,          // tâm cốc thủy tinh và lực kế
      YB: -1.19,         // đáy trong của cốc
      SPOUT: 1.3,        // mực vòi tràn
      HS: 0.03,          // 1 cm độ sâu = 0.03 đơn vị
      CUPX: -0.6,        // cốc hứng nước tràn
      DX: 2.4, DY: 1.0   // tâm đồng hồ áp kế
    };
    S.g8 = G;
    S.cur = null;
    S.t = null;
    S.time = 0;
    S.animated = false;
    var BX = G.BX, YB = G.YB, SXP = BX;
    var metal = stdMat(0x9aa6b3, 0.85, 0.3);
    var darkMetal = stdMat(0x3a4450, 0.7, 0.4);

    G.panel = buildPanel(group, 4);

    // ---------- Giá đỡ kim loại ----------
    addMesh(group, new THREE.BoxGeometry(1.6, 0.1, 1.2), darkMetal, -4.6, TABLE_Y + 0.05, 0);
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.06, 4.2, 16), metal, -4.9, TABLE_Y + 2.1, 0);
    addMesh(group, new THREE.BoxGeometry(2.7, 0.08, 0.1), metal, -3.6, 2.95, 0);
    addMesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), metal, SXP, 2.87, 0);

    // ---------- Lực kế lò xo ----------
    addMesh(group, new THREE.CylinderGeometry(0.15, 0.15, 1.0, 24, 1, true), glassMat(0xe8f4ff, 0.25), SXP, 2.3, 0);
    addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), darkMetal, SXP, 2.82, 0);
    addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), darkMetal, SXP, 1.78, 0);

    var coilGeometry = new THREE.TubeGeometry(helixCurve(0.09, 14), 280, 0.012, 6, false);
    G.coil = addMesh(group, coilGeometry, stdMat(0xd9dee4, 0.9, 0.25), SXP, 2.8, 0);

    addMesh(group, new THREE.BoxGeometry(0.3, 1.0, 0.01), stdMat(0xf5f5f0, 0, 0.8), SXP, 2.3, 0.16);
    var scaleTickMat = stdMat(0x111111, 0, 1);
    for (var n = 0; n <= 6; n++) {
      var ty = 2.45 - 0.1 * n;
      addMesh(group, new THREE.BoxGeometry(0.14, 0.008, 0.012), scaleTickMat, SXP - 0.05, ty, 0.17);
      if (n % 2 === 0) {
        addLabel(group, String(n), 0.12, 0.1, SXP + 0.08, ty, 0.17, { fontSize: 80, color: '#111111', bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)' });
      }
    }
    addLabel(group, 'N', 0.14, 0.1, SXP + 0.08, 2.62, 0.17, { fontSize: 80, color: '#111111', bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)' });

    G.indicator = addMesh(group, new THREE.CylinderGeometry(0.115, 0.115, 0.03, 20), stdMat(0xb01818, 0.3, 0.5), SXP, 2.0, 0);
    G.pointer = addMesh(group, new THREE.BoxGeometry(0.3, 0.022, 0.012), stdMat(0xe01e1e, 0.2, 0.4, { emissive: 0x550000 }), SXP, 2.0, 0.18);
    G.rod = addMesh(group, new THREE.CylinderGeometry(0.02, 0.02, 1, 8), metal, SXP, 1.8, 0);
    G.hook = addMesh(group, new THREE.TorusGeometry(0.04, 0.01, 8, 16), metal, SXP, 1.5, 0);

    // ---------- Quả nặng hình trụ P = 6 N ----------
    G.obj = addMesh(group, new THREE.CylinderGeometry(1, 1, 1, 32), stdMat(0x8f9aa6, 0.75, 0.35), SXP, 0.5, 0);
    G.objRing = addMesh(group, new THREE.TorusGeometry(0.04, 0.01, 8, 16), metal, SXP, 1.0, 0);
    G.stringMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
    G.string = new THREE.Mesh(new THREE.BufferGeometry(), G.stringMat);
    group.add(G.string);

    // ---------- Cốc thủy tinh lớn chia vạch ml ----------
    addMesh(group, new THREE.CylinderGeometry(1.25, 1.25, 2.7, 48, 1, true), glassMat(0xcfe8ff, 0.18), BX, YB + 1.35, 0);
    var beakerBottom = addMesh(group, new THREE.CircleGeometry(1.25, 48), glassMat(0xcfe8ff, 0.3), BX, YB - 0.005, 0);
    beakerBottom.rotation.x = -Math.PI / 2;
    var beakerRim = addMesh(group, new THREE.TorusGeometry(1.25, 0.03, 8, 48), glassMat(0xffffff, 0.6), BX, YB + 2.7, 0);
    beakerRim.rotation.x = Math.PI / 2;

    G.liquidMat = liquidMat(0x2f8fe6, 0.6);
    G.liquid = addMesh(group, new THREE.CylinderGeometry(1.19, 1.19, 1, 48), G.liquidMat, BX, YB + 0.5, 0);

    var a = 0.55;
    for (var ml = 250; ml <= 1750; ml += 250) {
      var major = (ml % 500 === 0);
      var yy = YB + ml / 2000 * 2.6;
      var tick = addMesh(group, new THREE.BoxGeometry(major ? 0.3 : 0.18, 0.014, 0.014), scaleTickMat,
        BX + 1.255 * Math.sin(a), yy, 1.255 * Math.cos(a));
      tick.rotation.y = a;
      if (major) {
        var lb = addLabel(group, String(ml), 0.42, 0.16,
          BX + 1.27 * Math.sin(a) + 0.38 * Math.cos(a), yy, 1.27 * Math.cos(a) - 0.38 * Math.sin(a), { fontSize: 78 });
        lb.rotation.y = a;
      }
    }
    addLabel(group, 'ml', 0.3, 0.16, BX + 1.7, YB + 2.1, 0.7, { fontSize: 80, color: '#cfe8ff' });

    // vòi tràn + cốc hứng nước tràn
    var chute = addMesh(group, new THREE.BoxGeometry(0.55, 0.05, 0.25), glassMat(0xe8f4ff, 0.5), -0.8, 1.33, 0);
    chute.rotation.z = -0.12;
    addMesh(group, new THREE.CylinderGeometry(0.5, 0.5, 1.1, 32, 1, true), glassMat(0xcfe8ff, 0.2), G.CUPX, YB + 0.55, 0);
    var cupBottom = addMesh(group, new THREE.CircleGeometry(0.5, 32), glassMat(0xcfe8ff, 0.3), G.CUPX, YB - 0.005, 0);
    cupBottom.rotation.x = -Math.PI / 2;
    G.cupLiquid = addMesh(group, new THREE.CylinderGeometry(0.46, 0.46, 1, 32), G.liquidMat, G.CUPX, YB + 0.5, 0);
    G.stream = addMesh(group, new THREE.CylinderGeometry(0.03, 0.03, 1, 8), G.liquidMat, G.CUPX, 0.5, 0);
    G.cupLabel = addLabel(group, '', 1.75, 0.3, 0.95, -0.55, 0.3, { fontSize: 64, color: '#9fe8ff' });

    // ---------- Thước đo độ sâu thẳng đứng ----------
    addMesh(group, new THREE.BoxGeometry(0.09, 1.7, 0.03), stdMat(0xe8d9a8, 0, 0.7), -3.75, G.SPOUT + 0.05 - 0.85, 0.05);
    for (var cm = 0; cm <= 50; cm += 10) {
      var ry = G.SPOUT - cm * G.HS;
      addMesh(group, new THREE.BoxGeometry(0.16, 0.012, 0.012), scaleTickMat, -3.75, ry, 0.08);
      addLabel(group, String(cm), 0.3, 0.14, -4.0, ry, 0.08, { fontSize: 76 });
    }
    addLabel(group, 'cm', 0.3, 0.14, -4.0, G.SPOUT + 0.25, 0.08, { fontSize: 76, color: '#cfe8ff' });

    G.depthLine = addMesh(group, new THREE.BoxGeometry(1, 0.016, 0.016),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b }), -2.65, 0, 0.15);
    G.depthDot = addMesh(group, new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b }), -3.75, 0, 0.1);
    G.depthLabel = addLabel(group, '', 0.95, 0.24, -3.05, 0, 0.35, { fontSize: 64, color: '#ffb3b3', border: '#ff3b3b' });

    // ---------- Áp kế: đầu dò + đồng hồ ----------
    var probeX = -1.55;
    G.probeX = probeX;
    G.probeRod = addMesh(group, new THREE.CylinderGeometry(0.025, 0.025, 1, 8), metal, probeX, 1.0, 0);
    G.probeCapsule = addMesh(group, new THREE.SphereGeometry(0.085, 16, 16), stdMat(0xd0d6dd, 0.9, 0.25), probeX, 0, 0);
    G.probeMembrane = addMesh(group, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16), stdMat(0xc0392b, 0.3, 0.5), probeX, 0, 0.08);
    G.probeMembrane.rotation.x = Math.PI / 2;
    addMesh(group, new THREE.BoxGeometry(3.95, 0.04, 0.04), metal, 0.425, 1.75, 0);

    var DX = G.DX, DY = G.DY;
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.04, DY - 0.75 - TABLE_Y, 10), darkMetal, DX, (DY - 0.75 + TABLE_Y) / 2, 0);
    addMesh(group, new THREE.CylinderGeometry(0.5, 0.55, 0.08, 24), darkMetal, DX, TABLE_Y + 0.04, 0);
    var bezel = addMesh(group, new THREE.CylinderGeometry(0.75, 0.75, 0.14, 40), darkMetal, DX, DY, 0);
    bezel.rotation.x = Math.PI / 2;
    var face = addMesh(group, new THREE.CylinderGeometry(0.68, 0.68, 0.15, 40), stdMat(0xf7f7f2, 0, 0.8), DX, DY, 0);
    face.rotation.x = Math.PI / 2;
    for (var i = 0; i <= 10; i++) {
      var ang = 2.356 - 4.712 * i / 10;
      var dt = addMesh(group, new THREE.BoxGeometry(0.025, i % 5 === 0 ? 0.14 : 0.08, 0.01), scaleTickMat,
        DX - Math.sin(ang) * 0.58, DY + Math.cos(ang) * 0.58, 0.1);
      dt.rotation.z = ang;
      if (i % 5 === 0) {
        addLabel(group, i === 0 ? '0' : (i === 5 ? '5000' : '10000'), 0.4, 0.14,
          DX - Math.sin(ang) * 0.4, DY + Math.cos(ang) * 0.4, 0.1,
          { fontSize: 76, color: '#111111', bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)' });
      }
    }
    addLabel(group, 'Pa', 0.3, 0.14, DX, DY - 0.2, 0.1, { fontSize: 76, color: '#111111', bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)' });
    G.needle = new THREE.Group();
    G.needle.position.set(DX, DY, 0.11);
    addMesh(G.needle, new THREE.BoxGeometry(0.035, 0.52, 0.01), new THREE.MeshBasicMaterial({ color: 0xe01e1e }), 0, 0.26, 0);
    var hub = addMesh(G.needle, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), darkMetal, 0, 0, 0);
    hub.rotation.x = Math.PI / 2;
    group.add(G.needle);
    G.dialLabel = addLabel(group, '', 1.8, 0.3, DX, 2.05, 0.2, { fontSize: 64, color: '#ffe27a', border: '#ffc400' });
  }

  function rebuildString82(G, yTop, yBottom, slack) {
    if (yTop - yBottom < 0.02) { yBottom = yTop - 0.02; }
    var amplitude = 0.16 * slack;
    var points = [];
    var segments = 8;
    for (var i = 0; i <= segments; i++) {
      var f = i / segments;
      points.push(new THREE.Vector3(
        G.BX + amplitude * Math.sin(f * Math.PI * 3),
        lerp(yTop, yBottom, f),
        amplitude * 0.6 * Math.sin(f * Math.PI * 2)
      ));
    }
    var geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.012, 6, false);
    G.string.geometry.dispose();
    G.string.geometry = geometry;
  }

  function update82(S, p1, p2, p3) {
    var G = S.g8;
    var h = clamp(num(p1, 20), 1, 50);          // cm
    var V = clamp(num(p2, 150), 10, 500);       // cm³
    var Dl = clamp(num(p3, 1.0), 0.8, 2.0);     // g/cm³
    var P = 6.0;                                // N

    var d = Dl * 10000;                         // N/m³
    var pPa = d * (h / 100);                    // Pa
    var FA = d * (V / 1000000);                 // N
    var floats = FA >= P;
    var F = floats ? 0 : P - FA;

    var cubeRoot = Math.cbrt(V / 500);
    var hh = 0.3 + 0.6 * cubeRoot;
    var rr = 0.12 + 0.33 * cubeRoot;
    var surface = G.SPOUT - 0.12 * (1 - (V - 10) / 490);
    var vis = floats ? Math.min(P / FA, 0.92) : 0.92;
    var cupH = 0.05 + 0.8 * V / 500;
    var color = liquidColorFor(Dl, new THREE.Color());

    updateText3D(G.panel[0], 'Độ sâu h = ' + fmtTrim(h) + ' cm -> Áp suất p = d·h = ' + Math.round(pPa) + ' Pa',
      { color: '#9fe8ff' });
    updateText3D(G.panel[1], 'Thể tích chìm V = ' + fmtTrim(V) + ' cm³ | Chất lỏng D = ' + Dl.toFixed(2) + ' g/cm³ (d = ' + Math.round(d) + ' N/m³)',
      { color: '#ffe27a', border: '#ffc400' });
    updateText3D(G.panel[2], 'Trọng lượng vật P = 6.00 N | Lực đẩy F_A = d·V = ' + FA.toFixed(2) + ' N',
      { color: '#d9b3ff', border: '#a855f7' });
    updateText3D(G.panel[3], 'Số chỉ lực kế = ' + F.toFixed(2) + ' N | Trạng thái: ' + (floats ? 'Nổi trên mặt thoáng' : 'Chìm căng dây'),
      floats ? { color: '#7dffb3', border: '#2dff9a' } : { color: '#ffc56b', border: '#ff9d2e' });

    updateText3D(G.cupLabel, 'Nước tràn: ' + fmtTrim(V) + ' ml');
    updateText3D(G.depthLabel, 'h = ' + fmtTrim(h) + ' cm');
    updateText3D(G.dialLabel, 'p = ' + Math.round(pPa) + ' Pa');

    S.t = {
      F: F, hh: hh, rr: rr, surface: surface, h: h,
      float: floats ? 1 : 0,
      vis: vis,
      pPa: pPa,
      cup: cupH,
      cr: color.r, cg: color.g, cb: color.b
    };
    if (!S.cur || !S.animated) {
      S.cur = cloneNumbers(S.t, KEYS_82);
      pose82(S);
    }
  }

  function pose82(S) {
    var G = S.g8;
    var c = S.cur;
    var YB = G.YB;

    // lò xo lực kế: F = 0 -> 0.35, F = 6 N -> 0.95
    var L = 0.35 + 0.1 * c.F;
    var yInd = 2.8 - L;
    G.coil.scale.y = L;
    G.indicator.position.y = yInd;
    G.pointer.position.y = yInd;
    var rodLen = 0.4;
    G.rod.scale.y = rodLen;
    G.rod.position.y = yInd - rodLen / 2;
    var yHook = yInd - rodLen - 0.04;
    G.hook.position.y = yHook;

    // khối vật: chìm ở độ sâu h hoặc nổi trên mặt thoáng
    var sunkY = c.surface - c.h * G.HS - c.hh / 2;
    sunkY = Math.max(sunkY, -1.12 + c.hh / 2);
    var floatY = c.surface - c.vis * c.hh + c.hh / 2 + Math.sin(S.time * 2.0) * 0.012 * c.float;
    var objY = lerp(sunkY, floatY, c.float);
    G.obj.position.set(G.BX, objY, 0);
    G.obj.scale.set(c.rr, c.hh, c.rr);
    var topY = objY + c.hh / 2;
    G.objRing.position.set(G.BX, topY + 0.03, 0);
    rebuildString82(G, yHook - 0.04, topY + 0.05, c.float);

    // chất lỏng trong cốc lớn
    var liquidH = Math.max(c.surface - YB, 0.001);
    G.liquid.scale.y = liquidH;
    G.liquid.position.y = YB + liquidH / 2;
    G.liquidMat.color.setRGB(c.cr, c.cg, c.cb);

    // nước tràn sang cốc phụ
    var cupTop = YB + c.cup;
    G.cupLiquid.scale.y = Math.max(c.cup, 0.001);
    G.cupLiquid.position.y = YB + c.cup / 2;
    var streamTop = 1.27;
    var streamLen = Math.max(streamTop - cupTop, 0.01);
    G.stream.scale.y = streamLen;
    G.stream.position.y = cupTop + streamLen / 2;

    // đầu dò áp kế và thước đo độ sâu tại h
    var yp = c.surface - c.h * G.HS;
    var rodTop = 1.75;
    var rodLen2 = Math.max(rodTop - yp, 0.01);
    G.probeRod.scale.y = rodLen2;
    G.probeRod.position.y = yp + rodLen2 / 2;
    G.probeCapsule.position.y = yp;
    G.probeMembrane.position.y = yp;
    var lineLen = G.probeX - (-3.75);
    G.depthLine.scale.x = lineLen;
    G.depthLine.position.set(-3.75 + lineLen / 2, yp, 0.15);
    G.depthDot.position.y = yp;
    G.depthLabel.position.y = yp + 0.17;

    // kim đồng hồ áp kế (0 → 10000 Pa)
    var frac = clamp(c.pPa / 10000, 0, 1);
    G.needle.rotation.z = 2.356 - 4.712 * frac;
  }

  function animate82(S, dt) {
    easeKeys(S.cur, S.t, KEYS_82.filter(function (k) { return k !== 'float'; }), 1 - Math.exp(-6 * dt));
    easeKeys(S.cur, S.t, ['float'], 1 - Math.exp(-5 * dt));
    pose82(S);
  }

  /* =====================================================================
     BÀI 8-3: ĐO NĂNG LƯỢNG NHIỆT VÀ ĐÒN BẨY
     ===================================================================== */
  var KEYS_83 = ['wh', 'T', 'flameI', 'l1', 'br', 'bh', 'bubble', 'steam', 'cr', 'cg', 'cb'];

  function build83(group, S) {
    var G = {
      id: '8-3',
      LX: -2.4,        // cụm trái: đun nước
      PX: 2.2,         // cụm phải: đòn bẩy
      SC: 0.032,       // 1 cm trên thước = 0.032 đơn vị
      PIVOT_Y: 1.15,   // độ cao trục quay của thanh đòn bẩy
      WY: 0.02         // mặt đáy trong của cốc
    };
    S.g8 = G;
    S.cur = null;
    S.t = null;
    S.time = 0;
    S.animated = false;
    S.vel = 0;
    var LX = G.LX, PX = G.PX, SC = G.SC;
    var metal = stdMat(0x9aa6b3, 0.85, 0.3);
    var darkMetal = stdMat(0x3a4450, 0.7, 0.4);
    var tickMat = stdMat(0x111111, 0, 1);

    G.panel = buildPanel(group, 2);

    // ================= CỤM TRÁI: đèn cồn + kiềng + cốc nước + nhiệt kế =================
    addMesh(group, new THREE.CylinderGeometry(0.34, 0.44, 0.5, 28), glassMat(0xd9ecff, 0.3), LX, -1.0, 0);
    addMesh(group, new THREE.CylinderGeometry(0.3, 0.4, 0.3, 24), liquidMat(0xf2a6c0, 0.7), LX, -1.1, 0);
    addMesh(group, new THREE.CylinderGeometry(0.12, 0.2, 0.12, 16), metal, LX, -0.69, 0);
    addMesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), stdMat(0x3b2a1a, 0, 1), LX, -0.58, 0);

    // ngọn lửa
    G.flame = new THREE.Group();
    G.flame.position.set(LX, -0.5, 0);
    G.flameOuter = addMesh(G.flame, new THREE.ConeGeometry(0.12, 0.42, 16),
      new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.85 }), 0, 0.21, 0);
    G.flameCore = addMesh(G.flame, new THREE.ConeGeometry(0.06, 0.24, 12),
      new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.85 }), 0, 0.12, 0);
    group.add(G.flame);
    G.flameLight = new THREE.PointLight(0xff8833, 0.8, 3);
    G.flameLight.position.set(LX, -0.3, 0.3);
    group.add(G.flameLight);

    // kiềng ba chân + lưới tản nhiệt
    for (var k = 0; k < 3; k++) {
      var phi = k * Math.PI * 2 / 3 + 0.5;
      cylBetween(group,
        new THREE.Vector3(LX + 0.85 * Math.cos(phi), TABLE_Y, 0.85 * Math.sin(phi)),
        new THREE.Vector3(LX + 0.7 * Math.cos(phi), -0.01, 0.7 * Math.sin(phi)),
        0.03, darkMetal);
    }
    addMesh(group, new THREE.CylinderGeometry(0.78, 0.78, 0.03, 32), stdMat(0x6b7683, 0.8, 0.5), LX, 0.0, 0);
    var gauzeRing = addMesh(group, new THREE.TorusGeometry(0.78, 0.03, 8, 32), darkMetal, LX, 0.0, 0);
    gauzeRing.rotation.x = Math.PI / 2;

    // cốc thủy tinh + nước
    addMesh(group, new THREE.CylinderGeometry(0.62, 0.62, 1.5, 40, 1, true), glassMat(0xcfe8ff, 0.2), LX, 0.765, 0);
    var cupBottom = addMesh(group, new THREE.CircleGeometry(0.62, 40), glassMat(0xcfe8ff, 0.3), LX, 0.016, 0);
    cupBottom.rotation.x = -Math.PI / 2;
    var cupRim = addMesh(group, new THREE.TorusGeometry(0.62, 0.025, 8, 40), glassMat(0xffffff, 0.6), LX, 1.515, 0);
    cupRim.rotation.x = Math.PI / 2;
    G.waterMat = liquidMat(0x4aa3e8, 0.55);
    G.water = addMesh(group, new THREE.CylinderGeometry(0.6, 0.6, 1, 40), G.waterMat, LX, G.WY + 0.5, 0);

    // nhiệt kế cắm trong cốc
    G.thermo = buildThermometer(group, LX + 0.3, 0, 0.1, 2.1, 1.75, 0, 100);
    G.thermoLabel = addLabel(group, '', 1.3, 0.3, LX + 0.3, 2.55, 0.3, { fontSize: 66, color: '#ffb3a0', border: '#ff6a4a' });
    addLabel(group, 'ĐO NHIỆT LƯỢNG', 1.9, 0.28, LX, -1.0, 1.55, { fontSize: 56, color: '#cfe8ff' });

    // bọt sôi + hơi nước
    G.bubbles = makeParticles(group, 40, 0xd8f0ff, 0.07);
    G.steam = makeParticles(group, 50, 0xffffff, 0.22);

    // ================= CỤM PHẢI: đòn bẩy =================
    addMesh(group, new THREE.BoxGeometry(1.6, 0.06, 1.0), darkMetal, PX, TABLE_Y + 0.03, 0);
    var triShape = new THREE.Shape();
    var triH = G.PIVOT_Y - 0.05 - (TABLE_Y + 0.06);
    triShape.moveTo(-0.6, 0);
    triShape.lineTo(0.6, 0);
    triShape.lineTo(0, triH);
    triShape.lineTo(-0.6, 0);
    var triangle = new THREE.Mesh(new THREE.ExtrudeGeometry(triShape, { depth: 0.3, bevelEnabled: false }),
      stdMat(0x5a6572, 0.7, 0.4));
    triangle.position.set(PX, TABLE_Y + 0.06, -0.15);
    group.add(triangle);
    addLabel(group, 'O', 0.34, 0.34, PX, -0.55, 0.2, { fontSize: 90, color: '#ffe27a', border: '#ffc400' });
    addLabel(group, 'ĐÒN BẨY', 1.5, 0.28, PX, -1.0, 1.55, { fontSize: 56, color: '#cfe8ff' });

    // thanh đòn bẩy (nhóm xoay quanh O)
    G.lever = new THREE.Group();
    G.lever.position.set(PX, G.PIVOT_Y, 0);
    group.add(G.lever);
    G.barMat = stdMat(0x9aa7b4, 0.8, 0.35, { emissive: 0x000000 });
    addMesh(G.lever, new THREE.BoxGeometry(5.0, 0.1, 0.16), G.barMat, -0.8, 0, 0);
    var pin = addMesh(G.lever, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 16), darkMetal, 0, 0, 0);
    pin.rotation.x = Math.PI / 2;
    G.glowRing = addMesh(G.lever, new THREE.TorusGeometry(0.16, 0.025, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x22ff77 }), 0, 0, 0.1);
    G.glowRing.visible = false;

    // vạch chia cm: bên trái 10 → 100 cm, bên phải 10 → 50 cm
    var cm;
    for (cm = 10; cm <= 100; cm += 10) {
      addMesh(G.lever, new THREE.BoxGeometry(0.012, 0.1, 0.01), tickMat, -cm * SC, 0, 0.085);
      addLabel(G.lever, String(cm), 0.28, 0.13, -cm * SC, -0.17, 0.09, { fontSize: 76 });
    }
    for (cm = 10; cm <= 50; cm += 10) {
      addMesh(G.lever, new THREE.BoxGeometry(0.012, 0.1, 0.01), tickMat, cm * SC, 0, 0.085);
      addLabel(G.lever, String(cm), 0.28, 0.13, cm * SC, -0.17, 0.09, { fontSize: 76 });
    }

    // móc treo trái (di chuyển theo l1) và móc phải (cố định l2 = 50 cm)
    var markerGeometry = new THREE.ConeGeometry(0.06, 0.12, 12);
    G.markerL = addMesh(G.lever, markerGeometry, new THREE.MeshBasicMaterial({ color: 0xff4b4b }), -0.4, 0.11, 0);
    G.markerL.rotation.z = Math.PI;
    var markerR = addMesh(G.lever, markerGeometry, new THREE.MeshBasicMaterial({ color: 0xff4b4b }), 50 * SC, 0.11, 0);
    markerR.rotation.z = Math.PI;
    G.l1Label = addLabel(G.lever, '', 1.0, 0.24, -0.6, 0.27, 0.05, { fontSize: 64, color: '#ffd1d1', border: '#ff4b4b' });
    addLabel(G.lever, 'l2 = 50 cm', 1.0, 0.24, 0.8, 0.27, 0.05, { fontSize: 64, color: '#ffd1d1', border: '#ff4b4b' });

    // vật treo bên trái (bình nước, tỉ lệ với p1)
    G.hangL = new THREE.Group();
    group.add(G.hangL);
    addMesh(G.hangL, new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), new THREE.MeshBasicMaterial({ color: 0xeeeeee }), 0, -0.175, 0);
    addMesh(G.hangL, new THREE.TorusGeometry(0.04, 0.01, 8, 16), metal, 0, 0.0, 0);
    G.bottleCap = addMesh(G.hangL, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), darkMetal, 0, -0.36, 0);
    G.bottle = addMesh(G.hangL, new THREE.CylinderGeometry(1, 1, 1, 32), glassMat(0xcfe8ff, 0.3), 0, -0.8, 0);
    G.bottleWater = addMesh(G.hangL, new THREE.CylinderGeometry(1, 1, 1, 32), liquidMat(0x4aa3e8, 0.75), 0, -0.8, 0);
    G.f1Label = addLabel(G.hangL, '', 0.95, 0.26, 0, -0.8, 0.5, { fontSize: 64 });

    // đối trọng chuẩn bên phải F2 = 2.4 N
    G.hangR = new THREE.Group();
    group.add(G.hangR);
    addMesh(G.hangR, new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), new THREE.MeshBasicMaterial({ color: 0xeeeeee }), 0, -0.175, 0);
    addMesh(G.hangR, new THREE.TorusGeometry(0.04, 0.01, 8, 16), metal, 0, 0.0, 0);
    addMesh(G.hangR, new THREE.CylinderGeometry(0.2, 0.2, 0.4, 28), stdMat(0xd4a017, 0.9, 0.3), 0, -0.55, 0);
    addLabel(G.hangR, 'F2 = 2.4 N', 0.6, 0.2, 0, -0.55, 0.22, { fontSize: 66, color: '#3a2a00', bg: 'rgba(255,236,160,0.95)', border: '#ffc400' });
  }

  function update83(S, p1, p2, p3) {
    var G = S.g8;
    var m = clamp(num(p1, 300), 50, 1000);       // g
    var dT = clamp(num(p2, 30), 5, 80);          // °C
    var l1 = clamp(num(p3, 40), 10, 100);        // cm

    var T = 20 + dT;
    var Q = (m / 1000) * 4200 * dT;              // J
    var F1 = (m / 1000) * 9.8;                   // N
    var F2 = 2.4;                                // N
    var M1 = F1 * (l1 / 100);                    // N·m
    var M2 = F2 * 0.50;                          // N·m
    var balanced = Math.abs(M1 - M2) <= 0.03 * M2;
    var stateText = balanced ? 'Cân bằng' : (M1 > M2 ? 'Nghiêng trái, M1 > M2' : 'Nghiêng phải, M1 < M2');

    var theta = balanced ? 0 : 0.30 * Math.tanh((M1 - M2) / 0.5);   // θ > 0: đầu trái hạ xuống

    var cubeRoot = Math.cbrt(m / 1000);
    var warm = clamp((T - 25) / 75, 0, 1) * 0.6;
    var waterColor = new THREE.Color(0x4aa3e8).lerp(new THREE.Color(0xe0805a), warm);

    setThermometer(G.thermo, T);

    updateText3D(G.thermoLabel, 'T = ' + fmtTrim(T) + ' °C');
    updateText3D(G.l1Label, 'l1 = ' + fmtTrim(l1) + ' cm');
    updateText3D(G.f1Label, 'F1 = ' + F1.toFixed(2) + ' N');
    updateText3D(G.panel[0],
      'Nhiệt lượng thu vào: Q = m·c·Δt = ' + (Q / 1000).toFixed(2) + ' kJ (m = ' + fmtTrim(m) + 'g, Δt = ' + fmtTrim(dT) + '°C)',
      { color: '#ffd28a', border: '#ff9d2e' });
    updateText3D(G.panel[1],
      'Moment Đòn bẩy: M1 = ' + M1.toFixed(2) + ' N·m | M2 = ' + M2.toFixed(2) + ' N·m (Trạng thái: ' + stateText + ')',
      balanced ? { color: '#7dffb3', border: '#2dff9a' } : { color: '#ffc56b', border: '#ff9d2e' });

    S.t = {
      wh: 0.3 + 1.0 * (m - 50) / 950,
      T: T,
      flameI: dT / 80,
      l1: l1,
      br: 0.15 + 0.25 * cubeRoot,
      bh: 0.28 + 0.5 * cubeRoot,
      bubble: clamp((dT - 35) / 45, 0, 1),
      steam: clamp((dT - 50) / 30, 0, 1),
      cr: waterColor.r, cg: waterColor.g, cb: waterColor.b,
      theta: theta,
      balanced: balanced
    };
    if (!S.cur || !S.animated) {
      S.cur = cloneNumbers(S.t, KEYS_83);
      S.cur.theta = theta;
      S.vel = 0;
      pose83(S);
    }
  }

  function pose83(S) {
    var G = S.g8;
    var c = S.cur;

    // nước và nhiệt kế
    G.water.scale.y = c.wh;
    G.water.position.y = G.WY + c.wh / 2;
    G.waterMat.color.setRGB(c.cr, c.cg, c.cb);
    setThermometer(G.thermo, c.T);

    // đòn bẩy
    G.lever.rotation.z = c.theta;
    var lxLeft = -c.l1 * G.SC;
    G.markerL.position.x = lxLeft;
    G.l1Label.position.x = lxLeft / 2;

    var cosT = Math.cos(c.theta);
    var sinT = Math.sin(c.theta);
    var lxRight = 50 * G.SC;
    G.hangL.position.set(G.PX + lxLeft * cosT, G.PIVOT_Y + lxLeft * sinT - 0.05, 0);
    G.hangR.position.set(G.PX + lxRight * cosT, G.PIVOT_Y + lxRight * sinT - 0.05, 0);

    // bình nước treo bên trái: to / nhỏ theo p1
    G.bottle.scale.set(c.br, c.bh, c.br);
    G.bottle.position.y = -0.38 - c.bh / 2;
    G.bottleWater.scale.set(c.br * 0.92, c.bh * 0.8, c.br * 0.92);
    G.bottleWater.position.y = -0.38 - c.bh + 0.02 + c.bh * 0.4;
    G.f1Label.position.y = -0.38 - c.bh / 2;
    G.f1Label.position.z = c.br + 0.03;
  }

  function animate83(S, dt, time) {
    var G = S.g8;
    var t = S.t;
    var c = S.cur;

    easeKeys(c, t, KEYS_83, 1 - Math.exp(-6 * dt));

    // thanh đòn bẩy nghiêng mượt như lò xo giảm chấn
    var stiffness = 40;
    var damping = 7;
    var steps = Math.max(1, Math.ceil(dt / 0.016));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      var acc = -stiffness * (c.theta - t.theta) - damping * S.vel;
      S.vel += acc * h;
      c.theta += S.vel * h;
    }
    pose83(S);

    // ngọn lửa
    var flicker = 1 + 0.08 * Math.sin(time * 23) + 0.05 * Math.sin(time * 37);
    var sx = (0.7 + 0.5 * c.flameI) * (1 + 0.04 * Math.sin(time * 31));
    var sy = (0.55 + 0.6 * c.flameI) * flicker;
    G.flame.scale.set(sx, sy, sx);
    G.flameLight.intensity = 0.4 + 0.6 * c.flameI * flicker;

    // bọt sôi trong nước
    if (t.bubble > 0) {
      G.bubbles.points.visible = true;
      G.bubbles.points.material.opacity = 0.3 + 0.5 * t.bubble;
      stepParticles(G.bubbles, dt, G.LX, 0, 0.45, G.WY + 0.05, Math.max(c.wh - 0.08, 0.05), 0.5 + 1.2 * t.bubble);
    } else {
      G.bubbles.points.visible = false;
    }

    // hơi nước bay lên
    if (t.steam > 0) {
      G.steam.points.visible = true;
      G.steam.points.material.opacity = 0.2 + 0.4 * t.steam;
      stepParticles(G.steam, dt, G.LX, 0, 0.5, G.WY + c.wh, 1.0, 0.4 + 0.5 * t.steam);
    } else {
      G.steam.points.visible = false;
    }

    // phát sáng xanh lá khi cân bằng M1 ≈ M2
    if (t.balanced) {
      G.barMat.emissive.setHex(0x22ff77);
      G.barMat.emissiveIntensity = 0.55 + 0.35 * Math.sin(time * 4);
      G.glowRing.visible = true;
    } else {
      G.barMat.emissive.setHex(0x000000);
      G.barMat.emissiveIntensity = 0;
      G.glowRing.visible = false;
    }
  }

  /* =====================================================================
     TIỆN ÍCH DÙNG CHUNG CHO 6 BÀI HÓA HỌC / SINH HỌC (8-4 ... 8-9)
     ===================================================================== */
  function initState(S, id, G) {
    G.id = id;
    S.g8 = G;
    S.cur = null;
    S.t = null;
    S.time = 0;
    S.animated = false;
  }

  function commit(S, keys, poseFn) {
    if (!S.cur || !S.animated) {
      S.cur = cloneNumbers(S.t, keys);
      poseFn(S);
    }
  }

  function mixHex(a, b, f) {
    return new THREE.Color(a).lerp(new THREE.Color(b), clamp(f, 0, 1));
  }

  function easeAll(S, keys, dt, rate) {
    easeKeys(S.cur, S.t, keys, 1 - Math.exp(-(rate || 6) * dt));
  }

  function frac(v) { return v - Math.floor(v); }

  /* Hạt chuyển động ngẫu nhiên trong một vùng (ion, enzyme, chất tan...) */
  function makeJitter(parent, count, color, size, opacity) {
    var geometry = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setDrawRange(0, 0);
    var material = new THREE.PointsMaterial({
      color: color,
      size: size,
      map: getDotTexture(),
      transparent: true,
      opacity: opacity === undefined ? 0.8 : opacity,
      depthWrite: false,
      sizeAttenuation: true
    });
    var points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    parent.add(points);
    var seed = new Float32Array(count * 4);
    for (var i = 0; i < count * 4; i++) { seed[i] = Math.random(); }
    return { points: points, pos: pos, seed: seed, count: count };
  }

  function stepJitter(ps, time, cx, cy, cz, rx, ry, rz, speed, n) {
    var cnt = clamp(Math.round(n), 0, ps.count);
    ps.points.geometry.setDrawRange(0, cnt);
    for (var i = 0; i < cnt; i++) {
      var s0 = ps.seed[i * 4];
      var s1 = ps.seed[i * 4 + 1];
      var s2 = ps.seed[i * 4 + 2];
      var s3 = ps.seed[i * 4 + 3];
      var w = speed * (0.5 + s0);
      ps.pos[i * 3] = cx + rx * (0.65 * (2 * s1 - 1) + 0.35 * Math.sin(time * w + s2 * 6.283));
      ps.pos[i * 3 + 1] = cy + ry * (0.65 * (2 * s2 - 1) + 0.35 * Math.sin(time * w * 1.3 + s3 * 6.283));
      ps.pos[i * 3 + 2] = cz + rz * (0.65 * (2 * s3 - 1) + 0.35 * Math.sin(time * w * 0.8 + s1 * 6.283));
    }
    ps.points.geometry.attributes.position.needsUpdate = true;
  }

  /* Cốc thủy tinh (nhóm) có gốc ở tâm đáy cốc */
  function makeBeakerGroup(parent, x, y, radius, height) {
    var g = new THREE.Group();
    g.position.set(x, y, 0);
    parent.add(g);
    addMesh(g, new THREE.CylinderGeometry(radius, radius, height, 40, 1, true), glassMat(0xcfe8ff, 0.2), 0, height / 2, 0);
    var bottom = addMesh(g, new THREE.CircleGeometry(radius, 40), glassMat(0xcfe8ff, 0.3), 0, 0.005, 0);
    bottom.rotation.x = -Math.PI / 2;
    var rim = addMesh(g, new THREE.TorusGeometry(radius, 0.025, 8, 40), glassMat(0xffffff, 0.6), 0, height, 0);
    rim.rotation.x = Math.PI / 2;
    return g;
  }

  /* Nhãn nằm phẳng trên mặt bàn / đĩa cân */
  function addFlatLabel(parent, text, w, h, x, y, z, options) {
    var label = addLabel(parent, text, w, h, x, y, z, options);
    label.rotation.x = -Math.PI / 2;
    return label;
  }

  /* Vạch chia trên thành cốc */
  function addBeakerTicks(group, cx, baseY, radius, levels, labelEvery, heightOf, angle, tickMat) {
    for (var i = 0; i < levels.length; i++) {
      var v = levels[i];
      var major = (i % labelEvery === 0);
      var yy = baseY + heightOf(v);
      var tick = addMesh(group, new THREE.BoxGeometry(major ? 0.3 : 0.18, 0.014, 0.014), tickMat,
        cx + (radius + 0.005) * Math.sin(angle), yy, (radius + 0.005) * Math.cos(angle));
      tick.rotation.y = angle;
      if (major) {
        var lb = addLabel(group, String(v), 0.4, 0.16,
          cx + (radius + 0.02) * Math.sin(angle) - 0.42 * Math.cos(angle), yy,
          (radius + 0.02) * Math.cos(angle) + 0.42 * Math.sin(angle), { fontSize: 78 });
        lb.rotation.y = angle;
      }
    }
  }

  /* =====================================================================
     BÀI 8-4: ĐỊNH LUẬT BẢO TOÀN KHỐI LƯỢNG (NÂNG CẤP KẾT TỦA CHÂN THẬT)
     BaCl2 + Na2SO4 -> BaSO4↓ (kết tủa trắng) + 2NaCl
     ===================================================================== */
  var KEYS_84 = ['hA', 'hB', 'prog', 'precipH', 'milk'];
  var MM = { BaCl2: 208.23, Na2SO4: 142.04, BaSO4: 233.39, NaCl: 58.44 };

  function build84(group, S) {
    var G = {
      AX: -1.15,
      BX: 1.05,
      BASEY: -0.87,
      pourTime: 0,       // Đồng hồ diễn hoạt: 0 -> 1.8s (Rót), 1.8 -> 4.8s (Kết tủa lắng xuống đáy)
      isReplaying: true
    };
    initState(S, '8-4', G);
    G.panel = buildPanel(group, 3);

    // Chèn nút bấm "Thực hiện lại phản ứng" vào thanh công cụ bên trái
    var bar = document.getElementById('exp6-sub-toolbar');
    if (bar) {
      bar.innerHTML =
        '<button onclick="window.replayReaction8_4()" class="w-full py-1.5 px-3 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition">' +
        '🧪 RÓT DUNG DỊCH & QUAN SÁT KẾT TỦA LẮNG ĐỌNG LẠI</button>';
    }
    global.replayReaction8_4 = function () {
      if (S && S.g8 && S.g8.id === '8-4') {
        S.g8.pourTime = 0;
        S.g8.isReplaying = true;
      }
    };

    // ---------- Cân điện tử kỹ thuật số lớn ----------
    addMesh(group, new THREE.BoxGeometry(4.8, 0.34, 2.5), stdMat(0x1e293b, 0.5, 0.45), 0, -1.08, 0);
    addMesh(group, new THREE.BoxGeometry(4.3, 0.05, 2.1), stdMat(0xcbd5e1, 0.85, 0.25), 0, -0.885, 0);
    addMesh(group, new THREE.BoxGeometry(3.1, 0.27, 0.03), stdMat(0x020617, 0.2, 0.8), 0, -1.08, 1.25);
    G.scaleScreen = addLabel(group, '', 3.0, 0.24, 0, -1.08, 1.27, { fontSize: 66 });

    // ---------- Hai cốc thủy tinh chia vạch ----------
    G.cupA = makeBeakerGroup(group, G.AX, G.BASEY, 0.62, 1.6);
    G.cupB = makeBeakerGroup(group, G.BX, G.BASEY, 0.68, 1.75);

    // Vạch chia trên cốc B để nhìn rõ độ dày lớp kết tủa
    var tickMat = stdMat(0xe2e8f0, 0, 1);
    for (var k = 1; k <= 5; k++) {
      var ty = G.BASEY + k * 0.28;
      addMesh(group, new THREE.BoxGeometry(0.16, 0.012, 0.012), tickMat, G.BX - 0.67, ty, 0.15);
    }

    // Dung dịch BaCl2 trong cốc A
    G.liqAMat = liquidMat(0xbae6fd, 0.45);
    G.liqA = addMesh(G.cupA, new THREE.CylinderGeometry(0.59, 0.59, 1, 40), G.liqAMat, 0, 0.5, 0);

    // 1. LỚP KẾT TỦA TRẮNG BaSO4↓ DƯỚI ĐÁY CỐC B (Tách biệt hoàn toàn, trắng đục sắc nét)
    G.precipMat = stdMat(0xffffff, 0.02, 0.75, { emissive: 0x3b4252 });
    G.precip = addMesh(group, new THREE.CylinderGeometry(0.65, 0.65, 1, 48), G.precipMat, G.BX, G.BASEY + 0.02, 0);

    // Vòng viền phát sáng đánh dấu ranh giới mặt trên của lớp kết tủa
    G.precipRim = addMesh(group, new THREE.TorusGeometry(0.652, 0.016, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), G.BX, G.BASEY + 0.05, 0);
    G.precipRim.rotation.x = Math.PI / 2;

    // Bề mặt gồ ghề tinh thể trắng trên đỉnh lớp kết tủa
    G.sedimentBumps = new THREE.Group();
    G.sedimentBumps.position.set(G.BX, G.BASEY + 0.02, 0);
    group.add(G.sedimentBumps);
    var bumpGeo = new THREE.DodecahedronGeometry(0.065, 1);
    for (var b = 0; b < 36; b++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = Math.sqrt(Math.random()) * 0.56;
      var bm = addMesh(G.sedimentBumps, bumpGeo, G.precipMat, Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      bm.scale.set(1.2, 0.45 + Math.random() * 0.4, 1.2);
      bm.rotation.y = Math.random() * 3;
    }

    // 2. LỚP DUNG DỊCH PHÍA TRÊN LỚP KẾT TỦA (Nằm chồng lên trên lớp kết tủa, không vẽ đè)
    G.liqBMat = liquidMat(0x93c5fd, 0.38);
    G.liqB = addMesh(group, new THREE.CylinderGeometry(0.65, 0.65, 1, 48), G.liqBMat, G.BX, G.BASEY + 0.5, 0);

    // 3. HỆ THỐNG 75 HẠT TINH THỂ KẾT TỦA 3D RƠI LƠ LỬNG & LẮNG XUỐNG ĐÁY
    G.granules = [];
    var granGeo = new THREE.DodecahedronGeometry(0.036, 0);
    var granMat = stdMat(0xffffff, 0.0, 0.6, { emissive: 0x475569 });
    for (var i = 0; i < 75; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = Math.sqrt(Math.random()) * 0.55;
      var gr = addMesh(group, granGeo, granMat, G.BX + Math.cos(a) * r, G.BASEY + 0.3, Math.sin(a) * r);
      gr.visible = false;
      G.granules.push({
        mesh: gr,
        rx: Math.cos(a) * r,
        rz: Math.sin(a) * r,
        speed: 0.45 + Math.random() * 0.55,
        phase: Math.random() * 6.28,
        yNorm: Math.random()
      });
    }

    // Đám mây khói kết tủa trắng mịn lúc mới tiếp xúc
    G.cloud = makeParticles(group, 140, 0xffffff, 0.13);

    // Tia nước rót từ Cốc A sang Cốc B
    G.stream = addMesh(group, new THREE.CylinderGeometry(0.028, 0.042, 1, 12), liquidMat(0xe0f2fe, 0.85), 0, 0, 0);
    G.stream.visible = false;

    // Nhãn chú thích trực tiếp chỉ vào 2 tầng trong Cốc B
    G.lblSupernatant = addLabel(group, 'Dung dịch NaCl (trong suốt)', 2.25, 0.25, G.BX + 2.05, 0.45, 0.2,
      { fontSize: 60, color: '#9fe8ff', border: '#38bdf8' });
    G.lblPrecipTag = addLabel(group, '↓ Kết tủa trắng BaSO4: 0 g', 2.45, 0.28, G.BX + 2.15, -0.55, 0.2,
      { fontSize: 62, color: '#ffffff', border: '#7dffb3' });

    G.lblA = addFlatLabel(group, '', 1.8, 0.26, G.AX, -0.85, 0.84, { fontSize: 60 });
    G.lblB = addFlatLabel(group, '', 1.8, 0.26, G.BX, -0.85, 0.84, { fontSize: 60 });
  }

  function update84(S, p1, p2, p3) {
    var G = S.g8;
    var a = clamp(num(p1, 50), 5, 200);
    var b = clamp(num(p2, 73), 5, 200);
    var pc = clamp(num(p3, 100), 10, 100);
    var prog = pc / 100;

    var nA = a / MM.BaCl2;
    var nB = b / MM.Na2SO4;
    var nR = Math.min(nA, nB) * prog;
    var mBaSO4 = nR * MM.BaSO4;
    var mNaCl = 2 * nR * MM.NaCl;
    var leftA = Math.max(a - nR * MM.BaCl2, 0);
    var leftB = Math.max(b - nR * MM.Na2SO4, 0);
    var mBefore = a + b;
    var mAfter = mBefore; // Định luật bảo toàn khối lượng

    // Mỗi khi người dùng kéo thanh trượt, kích hoạt hiệu ứng rót và tạo kết tủa mới
    if (S.cur) {
      G.pourTime = 0.25;
      G.isReplaying = true;
    }

    updateText3D(G.scaleScreen, 'm_tổng = ' + mAfter.toFixed(1) + ' g (Bảo toàn)', { color: '#7dffb3' });
    updateText3D(G.lblA, 'Cốc A: BaCl2 (' + fmtTrim(a) + ' g)');
    updateText3D(G.lblB, 'Cốc B: Na2SO4 (' + fmtTrim(b) + ' g)');
    updateText3D(G.lblPrecipTag, '↓ Kết tủa trắng BaSO4: ' + mBaSO4.toFixed(2) + ' g',
      { color: '#ffffff', border: '#2dff9a' });

    updateText3D(G.panel[0], 'PT: BaCl2 + Na2SO4 → BaSO4↓ (trắng) + 2NaCl   (Hiệu suất: ' + fmtTrim(pc) + '%)',
      { color: '#9fe8ff' });
    updateText3D(G.panel[1], 'm_trước = ' + mBefore.toFixed(1) + ' g (' + fmtTrim(a) + 'g + ' + fmtTrim(b) + 'g)  =  m_sau = ' +
      mAfter.toFixed(1) + ' g (Bảo toàn tuyệt đối)', { color: '#7dffb3', border: '#2dff9a' });
    updateText3D(G.panel[2], 'Kết tủa trắng BaSO4↓ = ' + mBaSO4.toFixed(2) + ' g | Dung dịch NaCl = ' + mNaCl.toFixed(2) +
      ' g | Dư: ' + (leftA > leftB ? 'BaCl2 ' + leftA.toFixed(1) + 'g' : 'Na2SO4 ' + leftB.toFixed(1) + 'g'),
      { color: '#ffe27a', border: '#ffc400' });

    S.t = {
      hA: 0.18 + 0.62 * (a / 200),
      hB: 0.22 + 0.62 * (b / 200),
      prog: prog,
      precipH: 0.08 + 0.48 * Math.sqrt(clamp(mBaSO4 / 224.2, 0, 1)),
      milk: clamp(mBaSO4 / 45, 0.15, 1)
    };
    commit(S, KEYS_84, pose84);
  }

  function pose84(S) {
    var G = S.g8;
    var c = S.cur;
    var B0 = G.BASEY;

    // Tiến trình diễn hoạt:
    // pourFrac (0 -> 1 trong 1.8s đầu): Cốc A nghiêng rót sang Cốc B
    // settleFrac (0 -> 1 từ 1.5s -> 4.8s): Hạt kết tủa trắng lắng dần xuống đáy tạo lớp cặn dày
    var tAnim = G.isReplaying ? G.pourTime : 5.0;
    var pourFrac = clamp(tAnim / 1.8, 0, 1);
    var settleFrac = clamp((tAnim - 1.2) / 3.4, 0, 1);
    var effectiveProg = c.prog * pourFrac;

    // 1. Mực nước còn lại trong Cốc A
    var remA = Math.max(c.hA * (1 - effectiveProg), 0.02);
    G.liqA.scale.y = remA;
    G.liqA.position.y = 0.03 + remA / 2;

    // 2. Chuyển động nâng và nghiêng Cốc A khi đang rót
    var pourArc = tAnim < 2.2 ? Math.sin(clamp(tAnim / 2.2, 0, 1) * Math.PI) : 0;
    var tilt = 1.05 * pourArc;
    var lift = 1.35 * pourArc;
    var shiftX = 0.72 * pourArc;
    G.cupA.position.set(G.AX + shiftX, B0 + lift, 0);
    G.cupA.rotation.z = -tilt;

    // 3. Tính độ cao lớp kết tủa trắng đã lắng dưới đáy Cốc B
    var totalLvB = Math.max(c.hB + c.hA * effectiveProg, 0.08);
    var currentPrecipH = Math.max(0.015, Math.min(c.precipH * (0.15 + 0.85 * settleFrac) * pourFrac, totalLvB * 0.65));

    G.precip.visible = pourFrac > 0.05;
    G.precip.scale.y = currentPrecipH;
    G.precip.position.y = B0 + 0.02 + currentPrecipH / 2;

    var precipTopY = B0 + 0.02 + currentPrecipH;
    G.precipRim.visible = pourFrac > 0.1;
    G.precipRim.position.y = precipTopY;
    G.sedimentBumps.visible = pourFrac > 0.15;
    G.sedimentBumps.position.y = precipTopY;
    G.sedimentBumps.scale.y = 0.4 + 0.8 * settleFrac;

    // 4. Lớp dung dịch phía trên (Nằm từ đỉnh lớp kết tủa lên tới mặt thoáng -> Không bao giờ che khuất kết tủa!)
    var clearH = Math.max(totalLvB - currentPrecipH, 0.02);
    G.liqB.scale.y = clearH;
    G.liqB.position.y = precipTopY + clearH / 2;

    // Khi mới rót vào (settleFrac nhỏ), dung dịch đục trắng như sữa; khi lắng xong (settleFrac -> 1), dung dịch trong suốt trở lại
    var turbidity = (1 - settleFrac * 0.88) * pourFrac * c.milk;
    G.liqBMat.color.copy(mixHex(0xbae6fd, 0xffffff, turbidity));
    G.liqBMat.opacity = 0.28 + 0.52 * turbidity;

    // Vị trí nhãn chỉ thị kết tủa bám sát độ cao thực tế
    G.lblPrecipTag.position.y = B0 + 0.02 + currentPrecipH * 0.5;
    G.lblSupernatant.position.y = precipTopY + clearH * 0.6;

    // 5. Dòng chảy từ miệng Cốc A xuống mặt thoáng Cốc B
    var surfB = B0 + 0.02 + totalLvB;
    var lipX = (G.AX + shiftX) + 0.62 * Math.cos(tilt) + 1.55 * Math.sin(tilt);
    var lipY = (B0 + lift) - 0.62 * Math.sin(tilt) + 1.55 * Math.cos(tilt);
    var sLen = Math.max(lipY - surfB, 0.02);
    G.stream.scale.y = sLen;
    G.stream.position.set(lipX, surfB + sLen / 2, 0);
    G.stream.visible = pourArc > 0.35;

    G.cloudTop = surfB;
    G.cloudFloor = precipTopY;
  }

  function animate84(S, dt, time) {
    var G = S.g8;
    var c = S.cur;
    easeAll(S, KEYS_84, dt, 5.0);

    if (G.isReplaying) {
      G.pourTime += dt;
      if (G.pourTime >= 5.5) {
        G.pourTime = 5.5;
        G.isReplaying = false;
      }
    }
    pose84(S);

    // Hiệu ứng rung dòng nước đang chảy
    if (G.stream.visible) {
      var w = 0.85 + 0.25 * Math.sin(time * 45);
      G.stream.scale.x = w;
      G.stream.scale.z = w;
    }

    // Chuyển động rơi & lắng đọng của 75 hạt tinh thể kết tủa 3D
    var tAnim = G.pourTime;
    var settleFrac = clamp((tAnim - 1.2) / 3.4, 0, 1);
    var activeGranules = Math.round(G.granules.length * clamp(c.milk * 1.3, 0.3, 1));
    var spanH = Math.max(G.cloudTop - G.cloudFloor, 0.04);

    for (var i = 0; i < G.granules.length; i++) {
      var gr = G.granules[i];
      if (i >= activeGranules || tAnim < 0.4) {
        gr.mesh.visible = false;
        continue;
      }
      gr.mesh.visible = true;
      // Khi đang phản ứng thì hạt rơi từ mặt nước xuống đáy kết tủa; khi lắng xong các hạt nằm xếp lớp trên mặt kết tủa
      if (settleFrac < 0.98) {
        gr.yNorm -= dt * gr.speed * 0.45;
        if (gr.yNorm < 0) { gr.yNorm = 1.0 - settleFrac * 0.7; }
      } else {
        gr.yNorm = 0.02 * (i % 3);
      }
      var swirl = (1 - settleFrac) * 0.08 * Math.sin(time * 4 + gr.phase);
      gr.mesh.position.set(
        G.BX + gr.rx + swirl,
        G.cloudFloor + gr.yNorm * spanH * (1 - settleFrac * 0.85),
        gr.rz + swirl
      );
      gr.mesh.rotation.x += dt * 1.5;
      gr.mesh.rotation.y += dt * 1.2;
    }

    // Khói mây kết tủa trắng cuộn xoáy lúc mới đổ vào
    var cloudIntensity = (1 - settleFrac * 0.85) * clamp(tAnim / 0.8, 0, 1) * c.milk;
    if (cloudIntensity > 0.03 && spanH > 0.03) {
      G.cloud.points.visible = true;
      G.cloud.points.material.opacity = 0.25 + 0.65 * cloudIntensity;
      stepParticles(G.cloud, dt, G.BX, 0, 0.56, G.cloudTop, -spanH, 0.55);
    } else {
      G.cloud.points.visible = false;
    }
  }

  /* =====================================================================
     BÀI 8-5: DUNG DỊCH VÀ ĐỘ TAN (CuSO4)
     ===================================================================== */
  var KEYS_85 = ['wh', 'T', 'f', 'crystal'];

  function waterH85(m) { return 0.25 + 1.65 * (m - 50) / 450; }

  function build85(group, S) {
    var G = { BY: -0.85, R: 0.95, MAXC: 40 };
    initState(S, '8-5', G);
    var darkMetal = stdMat(0x3a4450, 0.7, 0.4);
    var tickMat = stdMat(0x111111, 0, 1);
    G.panel = buildPanel(group, 3);

    // bếp gia nhiệt kiêm máy khuấy từ
    addMesh(group, new THREE.BoxGeometry(3.0, 0.36, 2.4), stdMat(0x2b3440, 0.5, 0.45), 0, -1.07, 0);
    addMesh(group, new THREE.CylinderGeometry(1.25, 1.25, 0.04, 48), stdMat(0x1a1f26, 0.6, 0.4), 0, -0.87, 0);
    G.ringMat = stdMat(0x331008, 0.3, 0.5, { emissive: 0x000000 });
    var ring = addMesh(group, new THREE.TorusGeometry(1.15, 0.03, 8, 48), G.ringMat, 0, -0.84, 0);
    ring.rotation.x = Math.PI / 2;
    addMesh(group, new THREE.BoxGeometry(1.5, 0.26, 0.02), stdMat(0x05080c, 0.2, 0.8), -0.5, -0.98, 1.2);
    G.disp = addLabel(group, '', 1.4, 0.24, -0.5, -0.98, 1.215, { fontSize: 70, color: '#ff9d7a', border: '#ff6a4a' });
    var knob = addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 20), stdMat(0xb8c0c8, 0.9, 0.3), 0.9, -0.98, 1.22);
    knob.rotation.x = Math.PI / 2;
    G.lamp = addMesh(group, new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0x330000 }), 1.3, -0.98, 1.21);
    addLabel(group, 'MÁY KHUẤY TỪ GIA NHIỆT', 2.2, 0.18, 0, -1.18, 1.215, { fontSize: 60, color: '#cfe8ff' });

    // cốc thủy tinh chia vạch
    var beaker = makeBeakerGroup(group, 0, G.BY, G.R, 2.3);
    beaker.rotation.y = 0;
    var levels = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
    addBeakerTicks(group, 0, G.BY + 0.03, G.R, levels, 2, waterH85, -0.45, tickMat);
    addLabel(group, 'g (ml)', 0.5, 0.16, -0.75, G.BY + 2.4, 0.6, { fontSize: 70, color: '#cfe8ff' });

    G.waterMat = liquidMat(0xd6ecff, 0.4);
    G.water = addMesh(group, new THREE.CylinderGeometry(0.92, 0.92, 1, 40), G.waterMat, 0, G.BY + 0.5, 0);

    // viên cá từ
    G.stir = new THREE.Group();
    G.stir.position.set(0, G.BY + 0.07, 0);
    group.add(G.stir);
    var bar = addMesh(G.stir, new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12), stdMat(0xf2f2f2, 0.3, 0.4), 0, 0, 0);
    bar.rotation.z = Math.PI / 2;

    // tinh thể CuSO4 không tan
    G.crystalMat = stdMat(0x2f86f0, 0.2, 0.25, { emissive: 0x0a3a8a });
    G.crystals = [];
    var oct = new THREE.OctahedronGeometry(1, 0);
    for (var i = 0; i < G.MAXC; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rr = Math.sqrt(Math.random()) * 0.72;
      var cr = addMesh(group, oct, G.crystalMat, rr * Math.cos(ang), G.BY + 0.09, rr * Math.sin(ang));
      cr.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      cr.visible = false;
      G.crystals.push(cr);
    }

    // nhiệt kế
    G.thermo = buildThermometer(group, 0.6, 0.05, -0.8, 3.0, 2.4, 0, 100);

    // chất tan đang hòa tan, hơi nước
    G.dots = makeJitter(group, 60, 0x2a6fe0, 0.08, 0.75);
    G.steam = makeParticles(group, 40, 0xffffff, 0.22);

    // thông tin bên phải
    G.lblT = addLabel(group, '', 1.7, 0.3, 3.0, 1.3, 0.3, { fontSize: 66, color: '#ffb3a0', border: '#ff6a4a' });
    G.lblSolute = addLabel(group, '', 2.0, 0.3, 3.0, 0.9, 0.3, { fontSize: 62, color: '#9fe8ff' });
    G.lblSolvent = addLabel(group, '', 2.0, 0.3, 3.0, 0.5, 0.3, { fontSize: 62, color: '#9fe8ff' });
    addLabel(group, 'Chất tan: CuSO4 (xanh lam)', 2.4, 0.26, 3.0, 0.1, 0.3, { fontSize: 56, color: '#cfe8ff' });
  }

  function update85(S, p1, p2, p3) {
    var G = S.g8;
    var T = clamp(num(p1, 40), 10, 100);
    var mct = clamp(num(p2, 45), 1, 150);
    var mdm = clamp(num(p3, 100), 50, 500);

    var Sol = 14 + 0.65 * T;                   // g / 100 g nước
    var mmax = Sol * (mdm / 100);
    var mtan = Math.min(mct, mmax);
    var mcan = Math.max(mct - mmax, 0);
    var C = (mtan / (mdm + mtan)) * 100;
    var stateText;
    if (mcan > 0.0001) { stateText = 'Bão hòa, còn cặn'; }
    else if (mct >= mmax * 0.98) { stateText = 'Bão hòa'; }
    else { stateText = 'Chưa bão hòa'; }

    updateText3D(G.disp, fmtTrim(T) + ' °C');
    updateText3D(G.lblT, 'T = ' + fmtTrim(T) + ' °C');
    updateText3D(G.lblSolute, 'm_ct = ' + fmtTrim(mct) + ' g');
    updateText3D(G.lblSolvent, 'm_dm = ' + fmtTrim(mdm) + ' g H2O');
    updateText3D(G.panel[0], 'Độ tan ở ' + fmtTrim(T) + '°C: S = ' + Sol.toFixed(1) + ' g/100g H2O',
      { color: '#9fe8ff' });
    updateText3D(G.panel[1], 'Đã tan: ' + mtan.toFixed(1) + ' g | Cặn không tan: ' + mcan.toFixed(1) + ' g',
      mcan > 0.0001 ? { color: '#ffc56b', border: '#ff9d2e' } : { color: '#7dffb3', border: '#2dff9a' });
    updateText3D(G.panel[2], 'Nồng độ C% = ' + C.toFixed(1) + '% (' + stateText + ')',
      { color: '#ffe27a', border: '#ffc400' });

    S.t = {
      wh: waterH85(mdm),
      T: T,
      f: clamp(C / 40, 0, 1),
      crystal: mcan
    };
    commit(S, KEYS_85, pose85);
  }

  function pose85(S) {
    var G = S.g8;
    var c = S.cur;
    var h = Math.max(c.wh, 0.01);
    G.water.scale.y = h;
    G.water.position.y = G.BY + 0.03 + h / 2;

    var k = Math.sqrt(clamp(c.f, 0, 1));
    G.waterMat.color.copy(mixHex(0xd6ecff, 0x1a5fd0, k));
    G.waterMat.opacity = 0.35 + 0.45 * k;

    setThermometer(G.thermo, c.T);

    var heat = clamp((c.T - 10) / 90, 0, 1);
    G.ringMat.emissive.setRGB(0.95 * heat, 0.15 * heat, 0.04 * heat);
    G.lamp.material.color.setRGB(0.2 + 0.8 * heat, 0.05, 0.02);

    var count = c.crystal > 0.05 ? Math.min(G.MAXC, 4 + Math.floor(c.crystal * 0.6)) : 0;
    var size = 0.05 + 0.1 * Math.min(1, c.crystal / 60);
    for (var i = 0; i < G.MAXC; i++) {
      var cr = G.crystals[i];
      cr.visible = i < count;
      cr.scale.setScalar(size * (0.8 + 0.4 * ((i * 37) % 10) / 10));
    }
  }

  function animate85(S, dt, time) {
    var G = S.g8;
    var c = S.cur;
    easeAll(S, KEYS_85, dt, 6);
    pose85(S);

    G.stir.rotation.y += dt * (8 + c.T * 0.15);

    var dissolved = c.f > 0.01;
    if (dissolved) {
      var n = 8 + 52 * Math.sqrt(c.f);
      stepJitter(G.dots, time, 0, G.BY + 0.03 + c.wh / 2, 0, 0.6, Math.max(c.wh / 2 - 0.1, 0.05), 0.6,
        1.5 + c.T / 20, n);
      G.dots.points.visible = true;
    } else {
      G.dots.points.visible = false;
    }

    if (c.T >= 80) {
      G.steam.points.visible = true;
      G.steam.points.material.opacity = 0.15 + 0.4 * clamp((c.T - 80) / 20, 0, 1);
      stepParticles(G.steam, dt, 0, 0, 0.6, G.BY + 0.03 + c.wh, 1.0, 0.5);
    } else {
      G.steam.points.visible = false;
    }
  }

  /* =====================================================================
     BÀI 8-6: ACID - BASE VÀ THANG ĐO pH
     ===================================================================== */
  var KEYS_86 = ['ph', 'drops', 'lvl', 'conc'];
  var PH_COLORS = [0xe8142b, 0xea2a1e, 0xee4a1a, 0xf27a1a, 0xf5a81c, 0xf4cf1d, 0xd8e22a, 0x4bbf4b,
    0x1fb58a, 0x1d9ac9, 0x2a6fd6, 0x3a4ac9, 0x5a3ab8, 0x6c2fa6, 0x7a2a94];

  function phColor(ph) {
    var x = clamp(ph, 0, 14);
    var i = Math.min(13, Math.floor(x));
    return mixHex(PH_COLORS[i], PH_COLORS[i + 1], x - i);
  }

  function litmusColor(ph) {
    if (ph <= 5) { return new THREE.Color(0xe03b3b); }
    if (ph < 6.5) { return mixHex(0xe03b3b, 0x8a55c9, (ph - 5) / 1.5); }
    if (ph <= 8) { return mixHex(0x8a55c9, 0x2f63d9, (ph - 6.5) / 1.5); }
    return new THREE.Color(0x2f63d9);
  }

  function litmusName(ph) { return ph < 5 ? 'đỏ' : (ph <= 8 ? 'tím' : 'xanh'); }

  function phenolColor(ph) {
    if (ph < 8.2) { return { color: new THREE.Color(0xeef6ff), opacity: 0.25 }; }
    if (ph < 10) {
      var f = (ph - 8.2) / 1.8;
      return { color: mixHex(0xf7c6e0, 0xd81b7d, f), opacity: 0.25 + 0.55 * f };
    }
    return { color: new THREE.Color(0xd81b7d), opacity: 0.8 };
  }

  function phenolName(ph) { return ph < 8.2 ? 'không màu' : (ph < 10 ? 'hồng' : 'hồng đậm'); }

  function universalName(ph) {
    if (ph < 3) { return 'đỏ'; }
    if (ph < 5) { return 'cam'; }
    if (ph < 6.5) { return 'vàng'; }
    if (ph < 7.5) { return 'xanh lá'; }
    if (ph < 10) { return 'xanh lam'; }
    if (ph < 12) { return 'chàm'; }
    return 'tím';
  }

  function build86(group, S) {
    var G = { BX: -1.3, BY: -0.87, TIP: 0.95, DROP: 0 };
    initState(S, '8-6', G);
    var metal = stdMat(0x9aa6b3, 0.85, 0.3);
    var darkMetal = stdMat(0x3a4450, 0.7, 0.4);
    var tickMat = stdMat(0x111111, 0, 1);
    G.panel = buildPanel(group, 3);

    // cốc dung dịch trung tâm
    makeBeakerGroup(group, G.BX, G.BY, 0.85, 1.7);
    G.solMat = liquidMat(0xe9f3ff, 0.5);
    G.sol = addMesh(group, new THREE.CylinderGeometry(0.82, 0.82, 1, 40), G.solMat, G.BX, G.BY + 0.5, 0);
    G.ions = makeJitter(group, 60, 0xff6a5a, 0.09, 0.85);

    // giá đỡ + buret nhỏ giọt chỉ thị
    addMesh(group, new THREE.BoxGeometry(1.2, 0.08, 0.9), darkMetal, -2.55, TABLE_Y + 0.04, 0);
    addMesh(group, new THREE.CylinderGeometry(0.05, 0.05, 3.85, 12), metal, -2.55, TABLE_Y + 1.925, 0);
    cylBetween(group, new THREE.Vector3(-2.55, 2.2, 0), new THREE.Vector3(-1.42, 2.2, 0), 0.04, metal);
    addMesh(group, new THREE.CylinderGeometry(0.1, 0.1, 1.5, 16, 1, true), glassMat(0xe8f4ff, 0.3), G.BX, 1.8, 0);
    addMesh(group, new THREE.CylinderGeometry(0.075, 0.075, 1.1, 12), liquidMat(0x7a3fb0, 0.85), G.BX, 2.0, 0);
    addMesh(group, new THREE.ConeGeometry(0.1, 0.2, 12), glassMat(0xe8f4ff, 0.4), G.BX, 1.0, 0).rotation.x = Math.PI;
    addMesh(group, new THREE.BoxGeometry(0.22, 0.07, 0.07), stdMat(0x4a5560, 0.6, 0.4), G.BX, 1.15, 0);
    addLabel(group, 'BURET CHỈ THỊ', 1.2, 0.16, G.BX, 2.7, 0.2, { fontSize: 64, color: '#cfe8ff' });

    G.drop = addMesh(group, new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: 0x7a3fb0 }), G.BX, G.TIP, 0);
    G.ripple = addMesh(group, new THREE.TorusGeometry(1, 0.03, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }), G.BX, 0, 0);
    G.ripple.rotation.x = Math.PI / 2;

    // đầu dò + máy đo pH điện tử
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.06, 1.9, 12), stdMat(0xd8dde3, 0.4, 0.4), -0.85, 0.65, 0.2);
    addMesh(group, new THREE.SphereGeometry(0.09, 14, 14), glassMat(0xbfe3ff, 0.7), -0.85, -0.3, 0.2);
    addMesh(group, new THREE.BoxGeometry(1.3, 1.0, 0.7), stdMat(0x2b3440, 0.4, 0.5), -3.9, -0.75, 0);
    addMesh(group, new THREE.BoxGeometry(1.1, 0.4, 0.02), stdMat(0x05080c, 0.2, 0.8), -3.9, -0.55, 0.36);
    G.meter = addLabel(group, '', 1.0, 0.34, -3.9, -0.55, 0.375, { fontSize: 78 });
    addLabel(group, 'MÁY ĐO pH', 1.0, 0.18, -3.9, -0.98, 0.365, { fontSize: 60, color: '#cfe8ff' });
    var cable = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.85, 1.6, 0.2), new THREE.Vector3(-2.6, 2.3, 0.6), new THREE.Vector3(-3.9, -0.25, 0.1));
    addMesh(group, new THREE.TubeGeometry(cable, 32, 0.02, 6, false), stdMat(0x111111, 0.1, 0.8), 0, 0, 0);

    // giá 3 ống nghiệm đối chứng
    var rackX = [0.85, 2.0, 3.15];
    addMesh(group, new THREE.BoxGeometry(3.7, 0.1, 0.8), stdMat(0x7a5a3a, 0.1, 0.8), 2.0, -1.2, 0);
    addMesh(group, new THREE.BoxGeometry(3.7, 0.08, 0.7), stdMat(0x7a5a3a, 0.1, 0.8), 2.0, -0.2, 0);
    addMesh(group, new THREE.BoxGeometry(0.1, 1.05, 0.7), stdMat(0x7a5a3a, 0.1, 0.8), 0.2, -0.7, 0);
    addMesh(group, new THREE.BoxGeometry(0.1, 1.05, 0.7), stdMat(0x7a5a3a, 0.1, 0.8), 3.8, -0.7, 0);
    G.tubes = [];
    var names = ['Quỳ tím', 'Phenolphthalein', 'Vạn năng'];
    for (var i = 0; i < 3; i++) {
      addMesh(group, new THREE.CylinderGeometry(0.2, 0.2, 1.9, 20, 1, true), glassMat(0xcfe8ff, 0.2), rackX[i], -0.15, 0);
      addMesh(group, new THREE.SphereGeometry(0.2, 16, 12), glassMat(0xcfe8ff, 0.2), rackX[i], -1.1, 0);
      var mat = liquidMat(0xffffff, 0.8);
      addMesh(group, new THREE.CylinderGeometry(0.17, 0.17, 1.1, 20), mat, rackX[i], -0.55, 0);
      addMesh(group, new THREE.SphereGeometry(0.17, 16, 12), mat, rackX[i], -1.1, 0);
      G.tubes.push(mat);
      addLabel(group, names[i], 1.1, 0.2, rackX[i], 1.0, 0.1, { fontSize: 62, color: '#cfe8ff' });
    }

    // bảng thang 14 màu pH chuẩn phía sau
    G.cells = [];
    addMesh(group, new THREE.BoxGeometry(5.7, 0.5, 0.04), stdMat(0xf5f5f0, 0, 0.8), 0, 1.65, -1.43);
    for (var k = 0; k <= 14; k++) {
      var x = -2.52 + k * 0.36;
      addMesh(group, new THREE.BoxGeometry(0.34, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: PH_COLORS[k] }), x, 1.7, -1.4);
      addLabel(group, String(k), 0.3, 0.12, x, 1.5, -1.38, { fontSize: 80, color: '#111111', bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)' });
    }
    addLabel(group, 'THANG MÀU pH CHUẨN', 2.6, 0.22, 0, 2.08, -1.4, { fontSize: 60, color: '#cfe8ff' });
    G.marker = addMesh(group, new THREE.ConeGeometry(0.09, 0.2, 12), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 1.28, -1.38);
  }

  function update86(S, p1, p2, p3) {
    var G = S.g8;
    var conc = clamp(num(p1, 0.1), 0.001, 2.0);
    var ph = clamp(num(p2, 7), 0, 14);
    var drops = clamp(num(p3, 3), 1, 10);

    var env = Math.abs(ph - 7) < 0.25 ? 'Trung tính' : (ph < 7 ? 'Acid' : 'Base');
    var ion = ph < 7 ? 'H+' : 'OH-';
    var meterColor = env === 'Acid' ? '#ff8a7a' : (env === 'Base' ? '#7ab8ff' : '#7dffb3');

    updateText3D(G.meter, 'pH ' + ph.toFixed(1), { color: meterColor });
    updateText3D(G.panel[0], 'pH = ' + ph.toFixed(1) + ' | Nồng độ: ' + conc.toFixed(3) + ' mol/L (' + ion + ') | Chỉ thị: ' +
      fmtTrim(drops) + ' giọt', { color: '#9fe8ff' });
    updateText3D(G.panel[1], 'Môi trường: ' + env + (env === 'Acid' ? ' (pH < 7)' : (env === 'Base' ? ' (pH > 7)' : ' (pH = 7)')),
      env === 'Acid' ? { color: '#ff9a8a', border: '#ff5a4a' } :
        (env === 'Base' ? { color: '#8ac0ff', border: '#4a90ff' } : { color: '#7dffb3', border: '#2dff9a' }));
    updateText3D(G.panel[2], 'Quỳ tím: ' + litmusName(ph) + ' | Phenolphthalein: ' + phenolName(ph) +
      ' | Vạn năng: ' + universalName(ph), { color: '#ffe27a', border: '#ffc400' });

    S.t = { ph: ph, drops: drops, lvl: 0.9 + 0.03 * drops, conc: conc };
    commit(S, KEYS_86, pose86);
  }

  function pose86(S) {
    var G = S.g8;
    var c = S.cur;
    var lvl = c.lvl;
    G.sol.scale.y = lvl;
    G.sol.position.y = G.BY + 0.03 + lvl / 2;
    G.surface = G.BY + 0.03 + lvl;

    var tInd = clamp(0.15 + 0.085 * c.drops, 0, 1);
    G.solMat.color.copy(mixHex(0xe9f3ff, phColor(c.ph), tInd));
    G.solMat.opacity = 0.4 + 0.045 * c.drops;
    G.drop.material.color.setHex(0x7a3fb0);

    // ống nghiệm đối chứng
    G.tubes[0].color.copy(litmusColor(c.ph));
    G.tubes[0].opacity = 0.85;
    var pp = phenolColor(c.ph);
    G.tubes[1].color.copy(pp.color);
    G.tubes[1].opacity = pp.opacity;
    G.tubes[2].color.copy(phColor(c.ph));
    G.tubes[2].opacity = 0.85;

    // mũi tên chỉ trên thang pH
    G.marker.position.x = -2.52 + c.ph * 0.36;

    // ion H+ / OH-
    var neutral = Math.abs(c.ph - 7) < 0.25;
    G.ions.points.material.color.setHex(neutral ? 0xdddddd : (c.ph < 7 ? 0xff6a5a : 0x5aa8ff));
  }

  function animate86(S, dt, time) {
    var G = S.g8;
    var c = S.cur;
    easeAll(S, KEYS_86, dt, 6);
    pose86(S);

    // giọt chỉ thị rơi từ buret, tần suất theo số giọt
    var period = 1.2 - 0.07 * c.drops;
    G.DROP = frac(G.DROP + dt / Math.max(period, 0.3));
    var u = G.DROP;
    var surf = G.surface;
    if (u < 0.7) {
      var k = u / 0.7;
      G.drop.visible = true;
      G.drop.position.set(G.BX, G.TIP - (G.TIP - surf) * k * k, 0);
      G.ripple.material.opacity = 0;
    } else {
      G.drop.visible = false;
      var r = (u - 0.7) / 0.3;
      G.ripple.position.y = surf + 0.005;
      G.ripple.scale.set(0.08 + 0.45 * r, 0.08 + 0.45 * r, 1);
      G.ripple.material.opacity = 0.6 * (1 - r);
    }

    // ion trong dung dịch: nhiều/ít theo nồng độ
    var n = clamp(6 + 54 * Math.log(Math.max(c.conc, 0.001) / 0.001) / Math.log(2000), 6, 60);
    stepJitter(G.ions, time, G.BX, G.BY + 0.03 + c.lvl / 2, 0, 0.55, Math.max(c.lvl / 2 - 0.08, 0.1), 0.55, 1.4, n);
  }

  /* =====================================================================
     BÀI 8-7: QUAN SÁT TẾ BÀO VÀ MÔ CƠ THỂ NGƯỜI (KÍNH HIỂN VI)
     ===================================================================== */
  var KEYS_87 = ['s', 'stain', 'bright', 'rot'];
  var stripeTexture = null;

  function getStripeTexture() {
    if (!stripeTexture) {
      var c = document.createElement('canvas');
      c.width = 16;
      c.height = 64;
      var x = c.getContext('2d');
      for (var i = 0; i < 8; i++) {
        x.fillStyle = (i % 2 === 0) ? '#ffffff' : '#8c8c8c';
        x.fillRect(0, i * 8, 16, 8);
      }
      stripeTexture = new THREE.CanvasTexture(c);
      stripeTexture.wrapS = THREE.RepeatWrapping;
      stripeTexture.wrapT = THREE.RepeatWrapping;
      stripeTexture.repeat.set(1, 3);
    }
    return stripeTexture;
  }

  function litMat(hex, opacity, extra) {
    var p = { color: hex, metalness: 0.05, roughness: 0.55, emissive: 0x000000 };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) { p[k] = extra[k]; } } }
    var m = new THREE.MeshStandardMaterial(p);
    if (opacity !== undefined && opacity < 1) {
      m.transparent = true;
      m.opacity = opacity;
    }
    return m;
  }

  function tintMat(m, hex, b) {
    var c = new THREE.Color(hex);
    m.color.copy(c).multiplyScalar(0.22 + 0.78 * b);
    m.emissive.copy(c).multiplyScalar(0.3 * b);
  }

  function rbcGeometry() {
    var raw = [[0, 0.07], [0.12, 0.06], [0.25, 0.09], [0.37, 0.12], [0.46, 0.09], [0.5, 0],
      [0.46, -0.09], [0.37, -0.12], [0.25, -0.09], [0.12, -0.06], [0, -0.07]];
    var pts = [];
    for (var i = 0; i < raw.length; i++) { pts.push(new THREE.Vector2(raw[i][0], raw[i][1])); }
    return new THREE.LatheGeometry(pts, 24);
  }

  function addCellItem(G, g, bx, by, r, kind) {
    G.cells.add(g);
    G.items.push({ g: g, bx: bx, by: by, r: r, kind: kind, ph: Math.random() * 6.283 });
  }

  function buildNeuron(G) {
    var n = new THREE.Group();
    addMesh(n, new THREE.SphereGeometry(0.2, 20, 16), G.mats.soma, 0, 0, 0);
    addMesh(n, new THREE.SphereGeometry(0.09, 14, 12), G.mats.nuc, 0.02, 0.02, 0.12);
    var up = new THREE.Vector3(0, 1, 0);
    for (var k = 0; k < 7; k++) {
      var ang = k * Math.PI * 2 / 7 + 0.3;
      var dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
      var len = 0.34 + 0.08 * (k % 3);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, len, 8), G.mats.soma);
      cone.position.copy(dir).multiplyScalar(0.18 + len / 2);
      cone.quaternion.setFromUnitVectors(up, dir);
      n.add(cone);
      var br = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 6), G.mats.soma);
      var d2 = new THREE.Vector3(Math.cos(ang + 0.6), Math.sin(ang + 0.6), 0);
      br.position.copy(dir).multiplyScalar(0.18 + len * 0.8).add(d2.clone().multiplyScalar(0.07));
      br.quaternion.setFromUnitVectors(up, d2);
      n.add(br);
    }
    var curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, -0.15, 0), new THREE.Vector3(0.26, -0.27, 0.02),
      new THREE.Vector3(0.4, -0.33, 0), new THREE.Vector3(0.52, -0.36, 0)]);
    addMesh(n, new THREE.TubeGeometry(curve, 24, 0.03, 8, false), G.mats.soma, 0, 0, 0);
    var ts = [0.3, 0.55, 0.8];
    for (var m = 0; m < ts.length; m++) {
      var p = curve.getPoint(ts[m]);
      var my = addMesh(n, new THREE.SphereGeometry(0.06, 12, 10), G.mats.myelin, p.x, p.y, p.z);
      my.scale.set(1.5, 1, 1);
    }
    var end = curve.getPoint(1);
    addMesh(n, new THREE.SphereGeometry(0.05, 10, 10), G.mats.soma, end.x, end.y, end.z);
    G.pulse = addMesh(n, new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff27a }), 0, 0, 0.05);
    G.pulseCurve = curve;
    return n;
  }

  function buildMuscle(G) {
    var m = new THREE.Group();
    var ys = [-0.14, 0, 0.14, -0.07, 0.07];
    var zs = [0, 0, 0, 0.1, 0.1];
    for (var i = 0; i < 5; i++) {
      var f = addMesh(m, new THREE.CylinderGeometry(0.07, 0.07, 1.2, 14), G.mats.muscle, 0, ys[i], zs[i]);
      f.rotation.z = Math.PI / 2;
      for (var k = 0; k < 2; k++) {
        var nu = addMesh(m, new THREE.SphereGeometry(0.035, 10, 8), G.mats.nuc,
          (k === 0 ? -0.25 : 0.2) + 0.05 * i, ys[i], zs[i] + 0.06);
        nu.scale.set(1.8, 0.8, 0.8);
      }
    }
    return m;
  }

  function buildWbc(G) {
    var w = new THREE.Group();
    addMesh(w, new THREE.SphereGeometry(0.2, 20, 16), G.mats.wbc, 0, 0, 0);
    addMesh(w, new THREE.SphereGeometry(0.075, 12, 10), G.mats.nuc, -0.08, 0.04, 0.1);
    addMesh(w, new THREE.SphereGeometry(0.075, 12, 10), G.mats.nuc, 0.0, -0.06, 0.13);
    addMesh(w, new THREE.SphereGeometry(0.075, 12, 10), G.mats.nuc, 0.08, 0.05, 0.1);
    return w;
  }

  function build87(group, S) {
    var G = { MX: -2.6, FX: 1.2, FY: 0.95, R: 1.45, items: [] };
    initState(S, '8-7', G);
    var metal = stdMat(0x9aa6b3, 0.85, 0.3);
    var body = stdMat(0x20262e, 0.5, 0.45);
    G.panel = buildPanel(group, 3);
    var MX = G.MX;

    // ---------- Kính hiển vi quang học ----------
    addMesh(group, new THREE.BoxGeometry(1.7, 0.22, 1.5), body, MX, -1.14, 0);
    addMesh(group, new THREE.BoxGeometry(0.3, 2.6, 0.28), body, MX, 0.2, -0.55);
    cylBetween(group, new THREE.Vector3(MX, 1.4, -0.55), new THREE.Vector3(MX, 1.72, -0.28), 0.14, body);
    var p0 = new THREE.Vector3(MX, 0.85, 0.35);
    var p1 = new THREE.Vector3(MX, 1.75, -0.25);
    cylBetween(group, p0, p1, 0.16, stdMat(0xd9dee4, 0.8, 0.3));
    var dir = new THREE.Vector3().subVectors(p1, p0).normalize();
    var pe = p1.clone().add(dir.clone().multiplyScalar(0.5));
    cylBetween(group, p1, pe, 0.1, body);
    addMesh(group, new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16), stdMat(0x111111, 0.3, 0.5), pe.x, pe.y, pe.z)
      .quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    // mâm vật kính xoay
    G.nose = new THREE.Group();
    G.nose.position.set(MX, 0.78, 0.35);
    group.add(G.nose);
    addMesh(G.nose, new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24), body, 0, 0, 0);
    var lens = [0.4, 0.3, 0.22];
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI * 2 / 3;
      var ob = addMesh(G.nose, new THREE.CylinderGeometry(0.08, 0.06, lens[i], 12), metal,
        0.2 * Math.cos(a), -0.05 - lens[i] / 2, 0.2 * Math.sin(a));
      addMesh(G.nose, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), stdMat(0x88aaff, 0.9, 0.1),
        0.2 * Math.cos(a), -0.06 - lens[i], 0.2 * Math.sin(a));
      ob.userData.i = i;
    }

    // mâm kính + tiêu bản
    addMesh(group, new THREE.BoxGeometry(1.2, 0.07, 1.0), body, MX, -0.15, 0.2);
    addMesh(group, new THREE.BoxGeometry(0.5, 0.02, 0.18), glassMat(0xe8f4ff, 0.6), MX, -0.1, 0.2);
    addMesh(group, new THREE.BoxGeometry(0.2, 0.012, 0.08), liquidMat(0xc59ad8, 0.9), MX, -0.088, 0.2);
    addMesh(group, new THREE.BoxGeometry(0.4, 0.2, 0.3), body, MX, -0.25, -0.3);

    // núm chỉnh tiêu cự
    for (var s = -1; s <= 1; s += 2) {
      var kn = addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 18), metal, MX + s * 0.22, 0.1, -0.55);
      kn.rotation.z = Math.PI / 2;
    }

    // đèn chiếu sáng dưới đế
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.26, 0.2, 20), body, MX, -0.95, 0.2);
    G.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), G.lampMat, MX, -0.84, 0.2);
    G.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.2, depthWrite: false });
    addMesh(group, new THREE.CylinderGeometry(0.05, 0.2, 0.7, 20, 1, true), G.beamMat, MX, -0.48, 0.2);
    G.lampLight = new THREE.PointLight(0xfff1c9, 0.6, 4);
    G.lampLight.position.set(MX, -0.5, 0.6);
    group.add(G.lampLight);

    // ---------- Khung vi trường ----------
    var bezel = addMesh(group, new THREE.TorusGeometry(G.R + 0.04, 0.07, 12, 64), metal, G.FX, G.FY, 0);
    G.bgMat = new THREE.MeshBasicMaterial({ color: 0xffe9f1 });
    addMesh(group, new THREE.CircleGeometry(G.R, 64), G.bgMat, G.FX, G.FY, -0.02);
    addLabel(group, 'VI TRƯỜNG KÍNH HIỂN VI', 2.2, 0.22, G.FX, G.FY - G.R - 0.28, 0.1, { fontSize: 60, color: '#cfe8ff' });
    bezel.rotation.z = 0;

    // ---------- Vật liệu tế bào ----------
    G.mats = {
      rbc: litMat(0xc8202a, 1, { side: THREE.DoubleSide }),
      wbc: litMat(0xe9e4f5, 0.85),
      nuc: litMat(0xdccfee, 1),
      soma: litMat(0xeed0d8, 1),
      myelin: litMat(0xf4e9c8, 1),
      muscle: litMat(0xf0b8c0, 1, { map: getStripeTexture() })
    };
    G.cells = new THREE.Group();
    G.cells.position.set(G.FX, G.FY, 0);
    group.add(G.cells);

    var neuron = buildNeuron(G);
    addCellItem(G, neuron, 0, 0.1, 0.65, 'neuron');
    addCellItem(G, buildMuscle(G), 0.1, -0.8, 0.62, 'muscle');
    addCellItem(G, buildWbc(G), -0.85, 0.5, 0.3, 'wbc');
    addCellItem(G, buildWbc(G), 0.85, 0.55, 0.3, 'wbc');
    var rbcPos = [[-0.95, 0.15], [-0.5, 0.95], [0.15, 1.0], [0.7, 1.0], [1.05, 0.2], [1.0, -0.3],
      [-1.0, -0.45], [-0.9, -0.9], [-0.55, 0.45], [0.6, 0.45], [1.0, -0.75], [-0.2, -0.3]];
    var rbcGeo = rbcGeometry();
    for (var j = 0; j < rbcPos.length; j++) {
      var rg = new THREE.Group();
      var disc = addMesh(rg, rbcGeo, G.mats.rbc, 0, 0, 0);
      disc.scale.setScalar(0.34);
      disc.rotation.x = Math.PI / 2 - 0.5 + 0.15 * j;
      addCellItem(G, rg, rbcPos[j][0], rbcPos[j][1], 0.17, 'rbc');
    }

    // chú thích bên phải
    var leg = [['Hồng cầu', '#ff8a8a', '#ff4b4b'], ['Bạch cầu', '#e0d4ff', '#a98bff'],
      ['Neuron', '#ffe27a', '#ffc400'], ['Cơ vân', '#ffb3d0', '#ff6aa8']];
    for (var q = 0; q < leg.length; q++) {
      addLabel(group, leg[q][0], 1.5, 0.3, 4.55, 1.9 - q * 0.45, 0.3, { fontSize: 66, color: leg[q][1], border: leg[q][2] });
    }
  }

  function update87(S, p1, p2, p3) {
    var G = S.g8;
    var mag = clamp(num(p1, 400), 100, 1200);
    var dye = clamp(num(p2, 0.8), 0.1, 2.0);
    var light = clamp(num(p3, 60), 10, 100);

    updateText3D(G.panel[0], 'Độ phóng đại: ' + fmtTrim(mag) + 'x | Nhuộm: ' + fmtTrim(dye) + '% | Độ sáng: ' + fmtTrim(light) + '%',
      { color: '#9fe8ff' });
    updateText3D(G.panel[1], 'Tế bào máu: Hồng cầu (đĩa lõm 2 mặt) • Bạch cầu (nhân phân thùy)',
      { color: '#ffb3b3', border: '#ff6a6a' });
    updateText3D(G.panel[2], 'Mô: Neuron (phát xung điện) • Mô cơ vân (có vân ngang)',
      { color: '#ffe27a', border: '#ffc400' });

    S.t = {
      s: clamp(Math.pow(mag / 400, 0.9), 0.2, 3),
      stain: clamp((dye - 0.1) / 1.9, 0, 1),
      bright: clamp((light - 10) / 90, 0, 1),
      rot: (mag - 100) / 1100 * Math.PI * 2
    };
    commit(S, KEYS_87, pose87);
  }

  function pose87(S) {
    var G = S.g8;
    var c = S.cur;
    var b = 0.12 + 0.88 * c.bright;
    var st = c.stain;

    G.bgMat.color.copy(mixHex(0x0d0a12, 0xffe9f1, c.bright));
    G.lampMat.color.copy(mixHex(0x333028, 0xfff1c9, c.bright));
    G.beamMat.opacity = 0.04 + 0.3 * c.bright;
    G.lampLight.intensity = 0.15 + 1.2 * c.bright;
    G.nose.rotation.y = c.rot;

    tintMat(G.mats.rbc, 0xc8202a, b);
    tintMat(G.mats.wbc, mixHex(0xe9e4f5, 0xb9a9e0, st * 0.6), b);
    tintMat(G.mats.nuc, mixHex(0xdccfee, 0x2b1f86, Math.pow(st, 0.8)), b);
    tintMat(G.mats.soma, mixHex(0xeed0d8, 0x6a4cb0, st * 0.7), b);
    tintMat(G.mats.myelin, 0xf4e9c8, b);
    tintMat(G.mats.muscle, mixHex(0xf0b8c0, 0x8a5cc0, st * 0.7), b);

    var s = c.s;
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      var px = it.bx * s;
      var py = it.by * s;
      var d = Math.sqrt(px * px + py * py) + it.r * s;
      it.g.visible = d <= G.R * 1.05;
      it.g.position.set(px, py, 0);
      it.g.scale.setScalar(s);
    }
  }

  function animate87(S, dt, time) {
    var G = S.g8;
    easeAll(S, KEYS_87, dt, 6);
    pose87(S);

    var s = S.cur.s;
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (!it.g.visible) { continue; }
      if (it.kind === 'rbc') {
        it.g.position.x += Math.sin(time * 0.8 + it.ph) * 0.02 * s;
        it.g.position.y += Math.cos(time * 0.7 + it.ph) * 0.02 * s;
        it.g.rotation.y = time * 0.5 + it.ph;
      } else if (it.kind === 'wbc') {
        it.g.position.x += Math.sin(time * 0.5 + it.ph) * 0.015 * s;
        it.g.rotation.z = Math.sin(time * 0.6 + it.ph) * 0.3;
      }
    }

    // xung điện chạy dọc sợi trục neuron
    var u = frac(time * 0.6);
    var p = G.pulseCurve.getPoint(u);
    G.pulse.position.set(p.x, p.y, p.z + 0.05);
    G.pulse.scale.setScalar(0.8 + 0.5 * Math.sin(u * Math.PI));
    var flash = u < 0.15 ? (1 - u / 0.15) * 0.5 : 0;
    G.mats.soma.emissive.r += flash;
    G.mats.soma.emissive.g += flash * 0.9;
  }

  /* =====================================================================
     BÀI 8-8: TIÊU HÓA VÀ HÔ HẤP Ở NGƯỜI
     ===================================================================== */
  var KEYS_88 = ['v', 'f', 'enz'];

  function airPath(G, u, side, out) {
    // u = 0: miệng/khí quản trên, u = 1: sâu trong phổi
    if (u < 0.6) {
      out.x = G.LX;
      out.y = lerp(2.7, 0.95, u / 0.6);
    } else {
      var k = (u - 0.6) / 0.4;
      out.x = G.LX + side * lerp(0, 0.62, k);
      out.y = lerp(0.95, 0.45, k);
    }
    out.z = 0;
  }

  function tubeProfile(r, H) {
    var pts = [new THREE.Vector2(0, 0)];
    for (var a = 1; a <= 8; a++) {
      var ang = a / 8 * Math.PI / 2;
      pts.push(new THREE.Vector2(r * Math.sin(ang), r - r * Math.cos(ang)));
    }
    pts.push(new THREE.Vector2(r, H));
    return pts;
  }

  function makeAirParticles(parent, color) {
    var n = 20;
    var geometry = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var material = new THREE.PointsMaterial({
      color: color, size: 0.16, map: getDotTexture(), transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true
    });
    var points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    parent.add(points);
    var off = new Float32Array(n);
    var side = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      off[i] = i / n;
      side[i] = (i % 2 === 0) ? -1 : 1;
    }
    return { points: points, pos: pos, off: off, side: side, n: n };
  }

  function build88(group, S) {
    var G = { LX: -2.2, RX: 2.4, BY: -0.95, TOP: 2.6 };
    initState(S, '8-8', G);
    S.phase = 0;
    var tickMat = stdMat(0x111111, 0, 1);
    G.panel = buildPanel(group, 2);

    // ---------- CỤM TRÁI: HÔ HẤP ----------
    var trachea = stdMat(0xd9b8b0, 0.1, 0.6);
    addMesh(group, new THREE.CylinderGeometry(0.11, 0.11, 1.7, 16), trachea, G.LX, 1.75, 0);
    addMesh(group, new THREE.CylinderGeometry(0.17, 0.12, 0.22, 16), trachea, G.LX, 2.7, 0);
    for (var r = 0; r < 6; r++) {
      var ringc = addMesh(group, new THREE.TorusGeometry(0.115, 0.018, 6, 16), stdMat(0xf0e4de, 0.1, 0.5), G.LX, 1.0 + r * 0.28, 0);
      ringc.rotation.x = Math.PI / 2;
    }
    cylBetween(group, new THREE.Vector3(G.LX, 0.92, 0), new THREE.Vector3(G.LX - 0.5, 0.55, 0), 0.07, trachea);
    cylBetween(group, new THREE.Vector3(G.LX, 0.92, 0), new THREE.Vector3(G.LX + 0.5, 0.55, 0), 0.07, trachea);

    var lungMat = stdMat(0xf08a98, 0.05, 0.7, { emissive: 0x4a1018 });
    G.lungL = addMesh(group, new THREE.SphereGeometry(0.6, 28, 20), lungMat, G.LX - 0.62, 0.5, 0);
    G.lungR = addMesh(group, new THREE.SphereGeometry(0.6, 28, 20), lungMat, G.LX + 0.62, 0.5, 0);

    G.dome = addMesh(group, new THREE.SphereGeometry(1.25, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      stdMat(0xc96a5a, 0.1, 0.7, { side: THREE.DoubleSide }), G.LX, -0.8, 0);
    G.dome.scale.set(1, 0.25, 0.7);

    G.ribs = [];
    var ribMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, transparent: true, opacity: 0.45, roughness: 0.6 });
    for (var rb = 0; rb < 5; rb++) {
      var rib = addMesh(group, new THREE.TorusGeometry(1.2, 0.03, 8, 28, Math.PI), ribMat, G.LX, -0.1 + rb * 0.3, 0);
      rib.rotation.x = Math.PI / 2;
      rib.scale.set(1.0, 1.0, 0.6);
      G.ribs.push(rib);
    }

    G.o2 = makeAirParticles(group, 0x3aa0ff);
    G.co2 = makeAirParticles(group, 0xff8a3a);

    addLabel(group, 'HÔ HẤP', 1.4, 0.26, G.LX, -1.1, 1.4, { fontSize: 66, color: '#cfe8ff' });
    addLabel(group, 'Khí quản', 1.2, 0.24, -4.75, 2.0, 0.2, { fontSize: 64 });
    addLabel(group, 'Phổi', 1.2, 0.24, -4.75, 0.5, 0.2, { fontSize: 64 });
    addLabel(group, 'Cơ hoành', 1.2, 0.24, -4.75, -0.9, 0.2, { fontSize: 64 });
    addLabel(group, 'O2', 0.5, 0.24, -4.75, 1.3, 0.2, { fontSize: 64, color: '#7ab8ff', border: '#3aa0ff' });
    addLabel(group, 'CO2', 0.6, 0.24, -4.05, 1.3, 0.2, { fontSize: 64, color: '#ffb07a', border: '#ff8a3a' });

    // ---------- CỤM PHẢI: TIÊU HÓA ----------
    addMesh(group, new THREE.CylinderGeometry(0.7, 0.8, 0.22, 24), stdMat(0x4a5560, 0.6, 0.5), G.RX, -1.14, 0);
    var glass = new THREE.Mesh(new THREE.LatheGeometry(tubeProfile(0.85, 2.5), 40), glassMat(0xcfe8ff, 0.2));
    glass.position.set(G.RX, G.BY, 0);
    group.add(glass);
    G.fluidMat = liquidMat(0xe9e29a, 0.6);
    var fluid = new THREE.Mesh(new THREE.LatheGeometry(tubeProfile(0.8, 1.9), 40), G.fluidMat);
    fluid.position.set(G.RX, G.BY + 0.03, 0);
    group.add(fluid);
    var rim = addMesh(group, new THREE.TorusGeometry(0.85, 0.025, 8, 40), glassMat(0xffffff, 0.6), G.RX, G.BY + 2.5, 0);
    rim.rotation.x = Math.PI / 2;

    // khối thức ăn + hạt dinh dưỡng
    var foodColors = [0xc9a36b, 0xb5834a, 0xd8b98a, 0xa9743f, 0xc9a36b, 0xb5834a, 0xd8b98a];
    var spots = [[-0.3, 0.35, 0.1], [0.3, -0.1, -0.2], [0.0, 0.6, 0.2], [-0.35, -0.25, -0.15],
      [0.35, 0.4, -0.1], [0.0, 0.05, 0.05], [-0.05, -0.45, 0.2]];
    var sizes = [0.5, 0.42, 0.46, 0.4, 0.38, 0.5, 0.36];
    G.blocks = [];
    S.blocks = [];
    var grainMat = stdMat(0xf2e35a, 0.1, 0.4, { emissive: 0x6a5a10 });
    var cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    var sphGeo = new THREE.SphereGeometry(1, 8, 8);
    for (var b = 0; b < 7; b++) {
      var mesh = addMesh(group, cubeGeo, stdMat(foodColors[b], 0.05, 0.8), G.RX + spots[b][0], G.BY + 0.9 + spots[b][1], spots[b][2]);
      var bl = { mesh: mesh, x: G.RX + spots[b][0], y: G.BY + 0.9 + spots[b][1], z: spots[b][2], s0: sizes[b],
        ph: Math.random() * 6.283, grains: [] };
      for (var gI = 0; gI < 5; gI++) {
        var gm = addMesh(group, sphGeo, grainMat, bl.x, bl.y, bl.z);
        gm.scale.setScalar(0.0001);
        bl.grains.push({ mesh: gm, a: gI * 1.2566 + b });
      }
      G.blocks.push(bl);
      S.blocks.push({ d: Math.random() * 1.3 });
    }

    G.enz = makeJitter(group, 50, 0xff4dd2, 0.1, 0.9);
    addLabel(group, 'TIÊU HÓA', 1.4, 0.26, G.RX, -1.3, 1.4, { fontSize: 66, color: '#cfe8ff' });
    addLabel(group, 'Dịch tiêu hóa + enzyme', 2.0, 0.24, G.RX + 2.0, 1.6, 0.2, { fontSize: 60, color: '#ff9ae6', border: '#ff4dd2' });
    addLabel(group, 'Khối thức ăn', 1.6, 0.24, G.RX + 2.0, 1.2, 0.2, { fontSize: 60, color: '#e8c690', border: '#c9a36b' });
    addLabel(group, 'Hạt dinh dưỡng', 1.6, 0.24, G.RX + 2.0, 0.8, 0.2, { fontSize: 60, color: '#fff08a', border: '#f2e35a' });
  }

  function update88(S, p1, p2, p3) {
    var G = S.g8;
    var VT = clamp(num(p1, 500), 200, 1500);
    var enz = clamp(num(p2, 1.0), 0.1, 5.0);
    var f = clamp(num(p3, 18), 10, 40);

    var VE = (VT * f) / 1000;
    var rate = 4 * enz;
    var level = enz < 0.8 ? 'Chậm' : (enz < 2.5 ? 'Trung bình' : 'Nhanh');

    updateText3D(G.panel[0], 'Hô hấp: VT = ' + fmtTrim(VT) + ' ml × ' + fmtTrim(f) + ' lần/phút -> Thông khí phút = ' +
      VE.toFixed(2) + ' L/phút', { color: '#9fe8ff' });
    updateText3D(G.panel[1], 'Tiêu hóa: Enzyme = ' + fmtTrim(enz) + '% -> Tốc độ phân giải: ' + level + ' (' +
      rate.toFixed(1) + ' %/giây)', { color: '#ffe27a', border: '#ffc400' });

    S.t = { v: VT / 1500, f: f, enz: enz };
    commit(S, KEYS_88, pose88);
  }

  function pose88(S) {
    var G = S.g8;
    var c = S.cur;
    var ph = frac(S.phase || 0);
    var b = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
    var k = 0.78 + 0.55 * c.v * b;

    G.lungL.scale.set(0.8 * k, 1.2 * k, 0.7 * k);
    G.lungR.scale.set(0.8 * k, 1.2 * k, 0.7 * k);
    G.lungL.position.x = G.LX - (0.5 + 0.12 * k);
    G.lungR.position.x = G.LX + (0.5 + 0.12 * k);

    G.dome.position.y = -0.8 - 0.45 * c.v * b;
    G.dome.scale.y = 0.25 - 0.1 * c.v * b;
    for (var i = 0; i < G.ribs.length; i++) {
      var e = 1 + 0.06 * c.v * b;
      G.ribs[i].scale.set(e, e, 0.6 * e);
    }

    // khối thức ăn
    var time = S.time || 0;
    for (var j = 0; j < G.blocks.length; j++) {
      var bl = G.blocks[j];
      var d = S.blocks[j].d;
      var sc = d < 1 ? (1 - d) : 0;
      bl.mesh.visible = sc > 0.02;
      bl.mesh.scale.setScalar(Math.max(bl.s0 * sc, 0.0001));
      var by = bl.y + Math.sin(time * 1.2 + bl.ph) * 0.04;
      bl.mesh.position.set(bl.x, by, bl.z);
      bl.mesh.rotation.y = time * 0.3 + bl.ph;
      var gs = d < 1 ? clamp(d * 1.5, 0, 1) : clamp(1 - (d - 1) / 0.3, 0, 1);
      var rad = 0.12 + 0.12 * Math.min(d, 1);
      for (var q = 0; q < bl.grains.length; q++) {
        var gr = bl.grains[q];
        var a = gr.a + time * 0.8;
        gr.mesh.position.set(bl.x + rad * Math.cos(a), by + 0.08 * Math.sin(a * 1.7 + q), bl.z + rad * Math.sin(a));
        gr.mesh.scale.setScalar(Math.max(0.065 * gs, 0.0001));
      }
    }
    G.fluidMat.color.copy(mixHex(0xe9e29a, 0xd9a43a, c.enz / 5));
  }

  function animate88(S, dt, time) {
    var G = S.g8;
    var c = S.cur;
    easeAll(S, KEYS_88, dt, 5);
    S.phase += dt * c.f / 60;

    // tiến trình phân giải thức ăn tỉ lệ thuận với nồng độ enzyme
    var rate = 0.04 * c.enz;
    for (var i = 0; i < S.blocks.length; i++) {
      S.blocks[i].d += dt * rate;
      if (S.blocks[i].d > 1.3) { S.blocks[i].d = 0; }
    }
    pose88(S);

    // luồng khí O2 (hít vào) / CO2 (thở ra)
    var ph = frac(S.phase);
    var inhale = ph < 0.5;
    var tIn = ph * 2;
    var tEx = (ph - 0.5) * 2;
    var tmp = { x: 0, y: 0, z: 0 };
    G.o2.points.material.opacity = inhale ? 0.95 : 0;
    G.co2.points.material.opacity = inhale ? 0 : 0.95;
    for (var p = 0; p < G.o2.n; p++) {
      var uo = frac(G.o2.off[p] + tIn);
      airPath(G, uo, G.o2.side[p], tmp);
      G.o2.pos[p * 3] = tmp.x + Math.sin(p * 2.3) * (uo < 0.6 ? 0.05 : 0.0);
      G.o2.pos[p * 3 + 1] = tmp.y;
      G.o2.pos[p * 3 + 2] = Math.cos(p * 1.7) * 0.05;
      var ue = 1 - frac(G.co2.off[p] + Math.max(tEx, 0));
      airPath(G, ue, G.co2.side[p], tmp);
      G.co2.pos[p * 3] = tmp.x + Math.sin(p * 2.9) * (ue < 0.6 ? 0.05 : 0.0);
      G.co2.pos[p * 3 + 1] = tmp.y;
      G.co2.pos[p * 3 + 2] = Math.cos(p * 2.1) * 0.05;
    }
    G.o2.points.geometry.attributes.position.needsUpdate = true;
    G.co2.points.geometry.attributes.position.needsUpdate = true;

    // hạt enzyme hoạt động nhanh hơn khi tăng nồng độ
    stepJitter(G.enz, time, G.RX, G.BY + 0.95, 0, 0.55, 0.85, 0.55, 0.8 + 2.2 * c.enz, 6 + 44 * c.enz / 5);
  }

  /* =====================================================================
     BÀI 8-9: HỆ SINH THÁI - CHUỖI THỨC ĂN VÀ THÁP SINH THÁI
     ===================================================================== */
  var KEYS_89 = ['w1', 'v2', 'v3', 'v4', 'v5', 'sun', 'np'];
  var TIER_COLORS = [0x3fae49, 0xe6c53a, 0xf28c28, 0xe0502c, 0x9c2a5c];
  var TIER_CSS = ['#7dff9a', '#ffe27a', '#ffb870', '#ff8a6a', '#e08ab8'];
  var TIER_NAMES = ['Sinh vật sản xuất (thực vật)', 'Động vật ăn cỏ (tiêu thụ bậc 1)', 'Sinh vật tiêu thụ bậc 2',
    'Sinh vật tiêu thụ bậc 3', 'Sinh vật tiêu thụ đỉnh'];

  function fmtE(e) {
    if (e >= 100) { return String(Math.round(e)); }
    if (e >= 1) { return e.toFixed(1); }
    if (e >= 0.001) { return e.toFixed(3); }
    return e.toExponential(1);
  }

  function build89(group, S) {
    var G = { CX: -0.6, TY0: -1.2, TH: 0.55, TG: 0.04, NP: 60, tiers: [], arrows: [], tierLabels: [], plants: [] };
    initState(S, '8-9', G);
    G.panel = buildPanel(group, 2);
    var boxGeo = new THREE.BoxGeometry(1, G.TH, 1);
    var edgeGeo = new THREE.EdgesGeometry(boxGeo);
    var edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });

    // 5 tầng bậc dinh dưỡng
    for (var i = 0; i < 5; i++) {
      var g = new THREE.Group();
      g.position.set(G.CX, G.TY0 + i * (G.TH + G.TG), 0);
      group.add(g);
      var mesh = addMesh(g, boxGeo, stdMat(TIER_COLORS[i], 0.1, 0.6, { emissive: TIER_COLORS[i], emissiveIntensity: 0.12 }), 0, G.TH / 2, 0);
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      G.tiers.push(g);
      var lb = addLabel(group, '', 3.4, 0.34, 3.7, G.TY0 + i * (G.TH + G.TG) + G.TH / 2, 0.2,
        { fontSize: 62, color: TIER_CSS[i], border: TIER_CSS[i] });
      G.tierLabels.push(lb);
    }

    // mũi tên truyền năng lượng (10%)
    for (var a = 0; a < 4; a++) {
      var ag = new THREE.Group();
      var yMid = G.TY0 + a * (G.TH + G.TG) + G.TH / 2 + (G.TH + G.TG) / 2;
      ag.position.set(G.CX - 2.5, yMid, 0.3);
      group.add(ag);
      var gold = new THREE.MeshBasicMaterial({ color: 0xffd54a });
      addMesh(ag, new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), gold, 0, -0.04, 0);
      addMesh(ag, new THREE.ConeGeometry(0.09, 0.18, 10), gold, 0, 0.25, 0);
      addLabel(ag, '10%', 0.6, 0.22, -0.45, 0, 0, { fontSize: 70, color: '#ffe27a', border: '#ffc400' });
      G.arrows.push(ag);
    }

    // mặt trời
    G.sunGroup = new THREE.Group();
    G.sunGroup.position.set(G.CX, 2.35, 0);
    group.add(G.sunGroup);
    addMesh(G.sunGroup, new THREE.SphereGeometry(0.3, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffd23a }), 0, 0, 0);
    G.corona = addMesh(G.sunGroup, new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({
      color: 0xffc933, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, -0.05);
    G.rays = new THREE.Group();
    G.sunGroup.add(G.rays);
    for (var r = 0; r < 12; r++) {
      var ang = r * Math.PI / 6;
      var ray = addMesh(G.rays, new THREE.BoxGeometry(0.05, 0.28, 0.01), new THREE.MeshBasicMaterial({ color: 0xffe27a }),
        0.58 * Math.cos(ang), 0.58 * Math.sin(ang), 0);
      ray.rotation.z = ang - Math.PI / 2;
    }
    G.sunLabel = addLabel(group, '', 2.2, 0.3, G.CX + 1.9, 2.35, 0.2, { fontSize: 62, color: '#ffe27a', border: '#ffc400' });

    // cây xanh (sinh vật sản xuất) trước tháp
    var stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 6);
    var leafGeo = new THREE.ConeGeometry(0.11, 0.3, 8);
    var slots = [];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 20; col++) {
        slots.push({ x: G.CX + (col - 9.5) * 0.27 + (row % 2) * 0.1, z: 1.65 + 0.32 * row });
      }
    }
    slots.sort(function (p, q) {
      return (Math.abs(p.x - G.CX) + 0.3 * p.z) - (Math.abs(q.x - G.CX) + 0.3 * q.z);
    });
    for (var s = 0; s < G.NP; s++) {
      var pg = new THREE.Group();
      pg.position.set(slots[s].x, -1.25, slots[s].z);
      addMesh(pg, stemGeo, stdMat(0x5a3b1e, 0, 0.9), 0, 0.11, 0);
      addMesh(pg, leafGeo, stdMat(s % 2 ? 0x3cb043 : 0x2e9e3a, 0.05, 0.7), 0, 0.33, 0);
      pg.scale.setScalar(0.0001);
      pg.visible = false;
      group.add(pg);
      G.plants.push({ g: pg, s: 0 });
    }
  }

  function update89(S, p1, p2, p3) {
    var G = S.g8;
    var n1 = clamp(num(p1, 150), 10, 500);
    var n = Math.round(clamp(num(p2, 3), 2, 5));
    var E0 = clamp(num(p3, 1000), 100, 2000);

    var E1 = E0 * (n1 / 150);
    var Elast = E1 * Math.pow(0.1, n - 1);

    updateText3D(G.panel[0], 'Số bậc dinh dưỡng: ' + n + ' bậc | Sinh vật sản xuất: ' + fmtTrim(n1) + ' cá thể',
      { color: '#7dffb3', border: '#2dff9a' });
    updateText3D(G.panel[1], 'Năng lượng Bậc 1: ' + fmtE(E1) + ' kcal -> Bậc ' + n + ': ' + fmtE(Elast) +
      ' kcal (Hiệu suất 10%)', { color: '#ffe27a', border: '#ffc400' });
    updateText3D(G.sunLabel, 'Mặt trời: ' + fmtTrim(E0) + ' kcal');
    for (var i = 0; i < 5; i++) {
      var e = E1 * Math.pow(0.1, i);
      updateText3D(G.tierLabels[i], 'Bậc ' + (i + 1) + ': ' + TIER_NAMES[i] + ' - ' + fmtE(e) + ' kcal',
        { color: TIER_CSS[i], border: TIER_CSS[i] });
    }

    S.t = {
      w1: 1.6 + 2.2 * (n1 / 500),
      v2: n >= 2 ? 1 : 0,
      v3: n >= 3 ? 1 : 0,
      v4: n >= 4 ? 1 : 0,
      v5: n >= 5 ? 1 : 0,
      sun: clamp((E0 - 100) / 1900, 0, 1),
      np: clamp(Math.round(G.NP * n1 / 500), 3, G.NP)
    };
    commit(S, KEYS_89, pose89);
    if (!S.animated) {
      for (var k = 0; k < G.plants.length; k++) {
        G.plants[k].s = k < Math.round(S.cur.np) ? 1 : 0;
      }
      pose89(S);
    }
  }

  function pose89(S) {
    var G = S.g8;
    var c = S.cur;
    var w1 = c.w1;
    var vis = [1, c.v2, c.v3, c.v4, c.v5];

    G.sunGroup.scale.setScalar(0.85 + 0.6 * c.sun);
    G.corona.material.opacity = 0.18 + 0.35 * c.sun;

    for (var i = 0; i < 5; i++) {
      var wi = w1 * Math.pow(0.68, i);
      var v = vis[i];
      G.tiers[i].visible = v > 0.01;
      G.tiers[i].scale.set(wi, Math.max(v, 0.001), wi * 0.7);
      G.tierLabels[i].visible = v > 0.5;
    }
    for (var a = 0; a < 4; a++) {
      var va = vis[a + 1];
      G.arrows[a].visible = va > 0.01;
      G.arrows[a].scale.setScalar(Math.max(va, 0.001));
      G.arrows[a].position.x = G.CX - w1 / 2 - 0.55;
    }
    var target = Math.round(c.np);
    for (var p = 0; p < G.plants.length; p++) {
      var pl = G.plants[p];
      var tg = p < target ? 1 : 0;
      pl.s = S.animated ? pl.s + (tg - pl.s) * 0.2 : tg;
      pl.g.visible = pl.s > 0.02;
      pl.g.scale.setScalar(Math.max(pl.s, 0.0001));
    }
  }

  function animate89(S, dt, time) {
    var G = S.g8;
    easeAll(S, KEYS_89, dt, 6);
    pose89(S);
    G.rays.rotation.z = time * 0.3;
    var pulse = 1 + 0.04 * Math.sin(time * 2.0);
    G.sunGroup.scale.multiplyScalar(pulse);
    for (var i = 0; i < G.plants.length; i++) {
      if (G.plants[i].g.visible) {
        G.plants[i].g.rotation.z = Math.sin(time * 1.5 + i) * 0.06;
      }
    }
  }

  /* =====================================================================
     API CÔNG KHAI
     ===================================================================== */
  function readSlider(id, fallback) {
    var el = document.getElementById(id);
    return el ? num(el.value, fallback) : fallback;
  }

  var BUILDERS = { '8-1': build81, '8-2': build82, '8-3': build83, '8-4': build84, '8-5': build85,
    '8-6': build86, '8-7': build87, '8-8': build88, '8-9': build89 };
  var UPDATERS = { '8-1': update81, '8-2': update82, '8-3': update83, '8-4': update84, '8-5': update85,
    '8-6': update86, '8-7': update87, '8-8': update88, '8-9': update89 };

  global.renderGrade8 = function (expId, expGroup, expState) {
    if (!expState || !BUILDERS[expId]) { return; }
    BUILDERS[expId](expGroup, expState);

    // Đọc giá trị hiện tại của các thanh trượt rồi cập nhật ngay lập tức
    var d = DEFAULT_PARAMS[expId];
    var v1 = readSlider('param1', d[0]);
    var v2 = readSlider('param2', d[1]);
    var v3 = readSlider('param3', d[2]);
    global.updateGrade8(expId, expState, v1, v2, v3);
  };

  global.updateGrade8 = function (expId, expState, p1, p2, p3) {
    if (!expState || !expState.g8 || expState.g8.id !== expId || !UPDATERS[expId]) { return; }
    UPDATERS[expId](expState, p1, p2, p3);
  };

  global.animateGrade8 = function (expId, expState, dt, p1, p2, p3) {
    if (!expState || !expState.g8 || expState.g8.id !== expId || !expState.t || !expState.cur) { return; }
    var step = clamp(num(dt, 0.016), 0, 0.05);
    expState.animated = true;
    expState.time += step;
    var time = expState.time;
    if (expId === '8-1') { animate81(expState, step); }
    else if (expId === '8-2') { animate82(expState, step); }
    else if (expId === '8-3') { animate83(expState, step, time); }
    else if (expId === '8-4') { animate84(expState, step, time); }
    else if (expId === '8-5') { animate85(expState, step, time); }
    else if (expId === '8-6') { animate86(expState, step, time); }
    else if (expId === '8-7') { animate87(expState, step, time); }
    else if (expId === '8-8') { animate88(expState, step, time); }
    else if (expId === '8-9') { animate89(expState, step, time); }
  };

  // Xuất hàm tiện ích nhãn chữ 3D (không ghi đè nếu dự án đã có sẵn bản khác)
  if (!global.createText3D) { global.createText3D = createText3D; }
  if (!global.updateText3D) { global.updateText3D = updateText3D; }
  global.createText3DGrade8 = createText3D;
  global.updateText3DGrade8 = updateText3D;

})(window);