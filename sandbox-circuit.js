/**
 * ============================================================================
 * V-LABS: MODULE PHÒNG THÍ NGHIỆM MẠCH ĐIỆN TỰ DO (sandbox-circuit.js)
 * ============================================================================
 */

(function () {
  const TABLE_Y = -2.49;
  const GRAVITY = -0.022;
  const SNAP_DISTANCE = 0.65;

  const sandboxState = {
    isActive: false,
    components: [],
    wires: [],
    selectedNode: null,
    draggedComponent: null,
    dragOffset: new THREE.Vector3(),
    isDragging: false,
    mouseDownPos: new THREE.Vector2(),
    eventsBound: false
  };

  const dragPlaneXZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y);
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const intersectPoint = new THREE.Vector3();

  // Lưu lại hàm render3DSimulation gốc của index.html
  const originalRender3DSimulation = window.render3DSimulation;

  // Ghi đè hàm render3DSimulation
  window.render3DSimulation = function (subject, params) {
    if (subject === 'sandbox-1' || subject === 'sandbox') {
      const container = document.getElementById('canvas-3d-container');
      if (!container) return;

      // Ẩn bảng chữ thông báo "đang được xây dựng"
      const placeholder = document.getElementById('canvas-placeholder');
      if (placeholder) placeholder.style.display = 'none';

      // 1. Khởi tạo Three.js nếu chưa có
      if (!window._vlabs3D) {
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x090d16, 0.035);

        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.set(0, 4.2, 8.5);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, TABLE_Y, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(6, 10, 7);
        scene.add(dirLight);

        // Mặt bàn thí nghiệm tròn
        const floor = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 7.5, 0.3, 64),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
        );
        floor.position.y = TABLE_Y - 0.16;
        scene.add(floor);

        const grid = new THREE.GridHelper(12, 24, 0x38bdf8, 0x1e293b);
        grid.position.y = TABLE_Y;
        grid.material.opacity = 0.25;
        grid.material.transparent = true;
        scene.add(grid);

        const subjectGroup = new THREE.Group();
        scene.add(subjectGroup);

        window._vlabs3D = { scene, camera, renderer, controls, subjectGroup, params: { ...params }, clock: new THREE.Clock() };

        // Vòng lặp render hoạt ảnh 3D
        const animate = () => {
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        bindPointerEvents(renderer.domElement);
        startSandboxPhysicsLoop();
      }

      sandboxState.isActive = true;

      // Hiển thị thanh khay dụng cụ HTML
      const toolbox = document.getElementById('sandbox-toolbox');
      if (toolbox) toolbox.classList.remove('hidden');

      // Tự động thả 1 Pin và 1 Bóng đèn mẫu lên bàn nếu bàn trống
      if (sandboxState.components.length === 0) {
        window.spawnItem('battery', new THREE.Vector3(-1.8, 1.5, 0));
        window.spawnItem('bulb', new THREE.Vector3(1.8, 1.5, 0));
      }

      window._vlabs3D.params = { ...params };
      calculateCircuit();
      return;
    } else {
      // Nếu không phải chế độ sandbox thì ẩn khay dụng cụ đi
      sandboxState.isActive = false;
      const toolbox = document.getElementById('sandbox-toolbox');
      if (toolbox) toolbox.classList.add('hidden');
    }

    // Nếu là các môn học khác (Vật lý, Hóa, Sinh khối 6-9) thì gọi lại hàm gốc
    if (typeof originalRender3DSimulation === 'function') {
      originalRender3DSimulation(subject, params);
    }
  };

  // ==========================================================================
  // HÀM SPAWN LINH KIỆN 3D (window.spawnItem)
  // ==========================================================================
  window.spawnItem = function (type, customPos = null) {
    const st = window._vlabs3D;
    if (!st) return;

    const compId = 'comp_' + Math.random().toString(36).substr(2, 7);
    const group = new THREE.Group();

    if (customPos) {
      group.position.copy(customPos);
    } else {
      group.position.set((Math.random() - 0.5) * 4.0, 2.0, (Math.random() - 0.5) * 3.0);
    }

    const componentObj = {
      id: compId,
      type: type,
      group: group,
      nodes: [],
      velocityY: 0,
      isLanded: false,
      isSwitchClosed: false,
      bulbMaterial: null,
      bulbLight: null,
      switchLeverPivot: null
    };

    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.18, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
    );
    baseMesh.position.y = 0.09;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    if (type === 'battery') {
      const bodyMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.1, 24).rotateZ(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 })
      );
      bodyMesh.position.set(-0.15, 0.42, 0);
      group.add(bodyMesh);

      const capMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.285, 0.285, 0.35, 24).rotateZ(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6 })
      );
      capMesh.position.set(0.45, 0.42, 0);
      group.add(capMesh);

      componentObj.nodes.push(
        createTerminalNode(componentObj, new THREE.Vector3(-0.95, 0.25, 0), '-'),
        createTerminalNode(componentObj, new THREE.Vector3(0.95, 0.25, 0), '+')
      );
    } else if (type === 'bulb') {
      const socketMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
      );
      socketMesh.position.y = 0.32;
      group.add(socketMesh);

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xfef9c3,
        transparent: true,
        opacity: 0.85,
        roughness: 0.1,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0
      });
      const glassMesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), glassMat);
      glassMesh.position.y = 0.72;
      group.add(glassMesh);

      const bulbLight = new THREE.PointLight(0xfde047, 0, 5);
      bulbLight.position.set(0, 0.85, 0);
      group.add(bulbLight);

      componentObj.bulbMaterial = glassMat;
      componentObj.bulbLight = bulbLight;

      componentObj.nodes.push(
        createTerminalNode(componentObj, new THREE.Vector3(-0.95, 0.25, 0), 'NONE'),
        createTerminalNode(componentObj, new THREE.Vector3(0.95, 0.25, 0), 'NONE')
      );
    } else if (type === 'resistor') {
      const resMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 1.0, 20).rotateZ(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd6b88d, roughness: 0.6 })
      );
      resMesh.position.y = 0.4;
      group.add(resMesh);

      componentObj.nodes.push(
        createTerminalNode(componentObj, new THREE.Vector3(-0.95, 0.25, 0), 'NONE'),
        createTerminalNode(componentObj, new THREE.Vector3(0.95, 0.25, 0), 'NONE')
      );
    } else if (type === 'switch') {
      const leverPivot = new THREE.Group();
      leverPivot.position.set(-0.55, 0.25, 0);

      const bladeGeo = new THREE.BoxGeometry(1.1, 0.08, 0.16);
      bladeGeo.translate(0.55, 0, 0);
      const bladeMesh = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 }));
      leverPivot.add(bladeMesh);

      const handleGeo = new THREE.BoxGeometry(0.24, 0.18, 0.26);
      handleGeo.translate(1.0, 0.06, 0);
      const handleMesh = new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color: 0xf43f5e }));
      leverPivot.add(handleMesh);

      leverPivot.rotation.z = Math.PI / 5;
      group.add(leverPivot);
      componentObj.switchLeverPivot = leverPivot;

      componentObj.nodes.push(
        createTerminalNode(componentObj, new THREE.Vector3(-0.95, 0.25, 0), 'NONE'),
        createTerminalNode(componentObj, new THREE.Vector3(0.95, 0.25, 0), 'NONE')
      );
    }

    group.traverse(child => {
      if (child.isMesh && !child.userData.isTerminalNode) {
        child.userData.isComponentBody = true;
        child.userData.componentObj = componentObj;
        child.castShadow = true;
      }
    });

    st.subjectGroup.add(group);
    sandboxState.components.push(componentObj);
  };

  function createTerminalNode(parentComponent, localPos, polarity) {
    let color = 0x38bdf8;
    if (polarity === '+') color = 0xef4444;
    if (polarity === '-') color = 0x64748b;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshStandardMaterial({ color: color, metalness: 0.4, roughness: 0.2, emissive: new THREE.Color(0x000000) })
    );
    mesh.position.copy(localPos);

    const nodeData = { id: 'node_' + Math.random().toString(36).substr(2, 7), parentComponent, polarity, mesh };
    mesh.userData = { isTerminalNode: true, nodeData: nodeData };

    parentComponent.group.add(mesh);
    return nodeData;
  }

  function createWireConnection(nodeA, nodeB) {
    const st = window._vlabs3D;
    if (!st || nodeA.parentComponent.id === nodeB.parentComponent.id) return;

    const exists = sandboxState.wires.some(
      w => (w.nodeA.id === nodeA.id && w.nodeB.id === nodeB.id) || (w.nodeA.id === nodeB.id && w.nodeB.id === nodeA.id)
    );
    if (exists) return;

    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    nodeA.mesh.getWorldPosition(posA);
    nodeB.mesh.getWorldPosition(posB);

    const lineMesh = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([posA, posB]),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 3 })
    );
    st.subjectGroup.add(lineMesh);

    sandboxState.wires.push({ id: 'wire_' + Math.random().toString(36).substr(2, 7), nodeA, nodeB, lineMesh });
    calculateCircuit();
  }

  function updateConnectedWires() {
    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    for (const wire of sandboxState.wires) {
      wire.nodeA.mesh.getWorldPosition(posA);
      wire.nodeB.mesh.getWorldPosition(posB);
      const arr = wire.lineMesh.geometry.attributes.position.array;
      arr[0] = posA.x; arr[1] = posA.y; arr[2] = posA.z;
      arr[3] = posB.x; arr[4] = posB.y; arr[5] = posB.z;
      wire.lineMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  function checkAutoSnapWires(movedComp) {
    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    for (const myNode of movedComp.nodes) {
      myNode.mesh.getWorldPosition(posA);
      for (const otherComp of sandboxState.components) {
        if (otherComp.id === movedComp.id) continue;
        for (const otherNode of otherComp.nodes) {
          otherNode.mesh.getWorldPosition(posB);
          if (posA.distanceTo(posB) <= SNAP_DISTANCE) {
            createWireConnection(myNode, otherNode);
          }
        }
      }
    }
  }

  window.clearSandbox = function () {
    const st = window._vlabs3D;
    if (!st) return;
    while (st.subjectGroup.children.length > 0) {
      st.subjectGroup.remove(st.subjectGroup.children[0]);
    }
    sandboxState.components = [];
    sandboxState.wires = [];
    sandboxState.selectedNode = null;
    sandboxState.draggedComponent = null;
  };

  function bindPointerEvents(domElement) {
    function updateMouse(e) {
      const rect = domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    domElement.addEventListener('pointerdown', (e) => {
      if (!sandboxState.isActive || e.button !== 0) return;
      const st = window._vlabs3D;
      if (!st) return;

      updateMouse(e);
      sandboxState.mouseDownPos.copy(mouse);
      raycaster.setFromCamera(mouse, st.camera);

      const meshes = [];
      sandboxState.components.forEach(c => {
        c.group.traverse(child => { if (child.isMesh) meshes.push(child); });
      });

      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        if (hitMesh.userData.isTerminalNode) {
          const clickedNode = hitMesh.userData.nodeData;
          if (!sandboxState.selectedNode) {
            sandboxState.selectedNode = clickedNode;
            clickedNode.mesh.material.emissive.setHex(0xfacc15);
          } else if (sandboxState.selectedNode.id === clickedNode.id) {
            sandboxState.selectedNode.mesh.material.emissive.setHex(0x000000);
            sandboxState.selectedNode = null;
          } else {
            createWireConnection(sandboxState.selectedNode, clickedNode);
            sandboxState.selectedNode.mesh.material.emissive.setHex(0x000000);
            sandboxState.selectedNode = null;
          }
          return;
        }

        if (hitMesh.userData.isComponentBody) {
          if (sandboxState.selectedNode) {
            sandboxState.selectedNode.mesh.material.emissive.setHex(0x000000);
            sandboxState.selectedNode = null;
          }
          const comp = hitMesh.userData.componentObj;
          sandboxState.draggedComponent = comp;
          sandboxState.isDragging = false;
          st.controls.enabled = false;

          if (raycaster.ray.intersectPlane(dragPlaneXZ, intersectPoint)) {
            sandboxState.dragOffset.subVectors(comp.group.position, intersectPoint);
          }
        }
      } else {
        if (sandboxState.selectedNode) {
          sandboxState.selectedNode.mesh.material.emissive.setHex(0x000000);
          sandboxState.selectedNode = null;
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!sandboxState.isActive || !sandboxState.draggedComponent) return;
      const st = window._vlabs3D;
      if (!st) return;

      updateMouse(e);
      if (mouse.distanceTo(sandboxState.mouseDownPos) > 0.01) {
        sandboxState.isDragging = true;
      }

      raycaster.setFromCamera(mouse, st.camera);
      if (raycaster.ray.intersectPlane(dragPlaneXZ, intersectPoint)) {
        sandboxState.draggedComponent.group.position.x = THREE.MathUtils.clamp(intersectPoint.x + sandboxState.dragOffset.x, -5.2, 5.2);
        sandboxState.draggedComponent.group.position.z = THREE.MathUtils.clamp(intersectPoint.z + sandboxState.dragOffset.z, -5.2, 5.2);
        updateConnectedWires();
        checkAutoSnapWires(sandboxState.draggedComponent);
      }
    });

    window.addEventListener('pointerup', () => {
      if (!sandboxState.isActive || !sandboxState.draggedComponent) return;
      const st = window._vlabs3D;
      const comp = sandboxState.draggedComponent;

      if (!sandboxState.isDragging && comp.type === 'switch') {
        comp.isSwitchClosed = !comp.isSwitchClosed;
        if (comp.switchLeverPivot) {
          comp.switchLeverPivot.rotation.z = comp.isSwitchClosed ? 0 : Math.PI / 5;
        }
        calculateCircuit();
      }

      sandboxState.draggedComponent = null;
      sandboxState.isDragging = false;
      if (st && st.controls) st.controls.enabled = true;
    });
  }

  function calculateCircuit() {
    for (const comp of sandboxState.components) {
      if (comp.type === 'bulb' && comp.bulbMaterial) {
        comp.bulbMaterial.emissive.setHex(0x000000);
        comp.bulbMaterial.emissiveIntensity = 0;
        if (comp.bulbLight) comp.bulbLight.intensity = 0;
      }
    }

    const batteries = sandboxState.components.filter(c => c.type === 'battery');
    if (batteries.length === 0 || sandboxState.wires.length === 0) return;

    const litBulbs = new Set();
    for (const battery of batteries) {
      const startPosNode = battery.nodes.find(n => n.polarity === '+');
      const targetNegNode = battery.nodes.find(n => n.polarity === '-');
      if (!startPosNode || !targetNegNode) continue;

      const visited = new Set();
      function dfs(currentNode, pathComponents) {
        if (currentNode.id === targetNegNode.id) {
          pathComponents.filter(c => c.type === 'bulb').forEach(b => litBulbs.add(b));
          return;
        }
        visited.add(currentNode.id);

        sandboxState.wires.filter(w => w.nodeA.id === currentNode.id || w.nodeB.id === currentNode.id).forEach(wire => {
          const nextNode = wire.nodeA.id === currentNode.id ? wire.nodeB : wire.nodeA;
          if (!visited.has(nextNode.id)) dfs(nextNode, pathComponents);
        });

        const comp = currentNode.parentComponent;
        if (comp.id !== battery.id) {
          const canPass = comp.type === 'bulb' || comp.type === 'resistor' || comp.type === 'battery' || (comp.type === 'switch' && comp.isSwitchClosed);
          if (canPass) {
            const otherNode = comp.nodes.find(n => n.id !== currentNode.id);
            if (otherNode && !visited.has(otherNode.id)) dfs(otherNode, [...pathComponents, comp]);
          }
        }
        visited.delete(currentNode.id);
      }
      dfs(startPosNode, []);
    }

    const st = window._vlabs3D;
    const voltageU = st && st.params ? st.params.param1 : 9;
    litBulbs.forEach(bulb => {
      if (bulb.bulbMaterial) {
        bulb.bulbMaterial.emissive.setHex(0xffea00);
        bulb.bulbMaterial.emissiveIntensity = Math.min(4.0, (voltageU / 9) * 2.0);
        if (bulb.bulbLight) bulb.bulbLight.intensity = Math.min(5.0, (voltageU / 9) * 3.0);
      }
    });
  }

  function startSandboxPhysicsLoop() {
    function updatePhysics() {
      requestAnimationFrame(updatePhysics);
      if (!sandboxState.isActive) return;

      let moved = false;
      for (const comp of sandboxState.components) {
        if (!comp.isLanded && comp !== sandboxState.draggedComponent) {
          comp.velocityY += GRAVITY;
          comp.group.position.y += comp.velocityY;
          if (comp.group.position.y <= TABLE_Y) {
            comp.group.position.y = TABLE_Y;
            if (Math.abs(comp.velocityY) > 0.06) {
              comp.velocityY = -comp.velocityY * 0.28;
            } else {
              comp.velocityY = 0;
              comp.isLanded = true;
            }
          }
          moved = true;
        }
      }
      if (moved) updateConnectedWires();
    }
    updatePhysics();
  }

  window.calculateCircuit = calculateCircuit;
})();