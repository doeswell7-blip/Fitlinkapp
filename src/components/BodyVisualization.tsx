import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

export interface BodyVisualizationProps {
  measurements: { measurement_type: string; value_cm: number }[];
  heightCm: number | null;
  className?: string;
}

type ViewMode = 'front' | 'side' | 'back';

const VIEW_ANGLES: Record<ViewMode, number> = {
  front: 0,
  side: Math.PI / 2,
  back: Math.PI,
};

export function BodyVisualization({ measurements, heightCm, className }: BodyVisualizationProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameRef = useRef<number>(0);
  const [viewMode, setViewMode] = useState<ViewMode>('front');
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const isDark = document.documentElement.classList.contains('dark');
    scene.background = new THREE.Color(isDark ? 0x0a0e14 : 0xf5f7fb);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 15, 35);
    camera.lookAt(0, 10, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(isDark ? 0x404060 : 0x8080a0, 1.5);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(isDark ? 0x2dd4bf : 0x0d9488, 1.0);
    keyLight.position.set(5, 20, 10);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(isDark ? 0x4488ff : 0x6699cc, 0.5);
    fillLight.position.set(-10, 10, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 5, -15);
    scene.add(rimLight);

    const gridColor1 = isDark ? 0x1a2330 : 0xd0d8e0;
    const gridColor2 = isDark ? 0x121820 : 0xe8edf2;
    const gridHelper = new THREE.GridHelper(30, 30, gridColor1, gridColor2);
    scene.add(gridHelper);

    const bodyGroup = new THREE.Group();
    scene.add(bodyGroup);
    bodyGroupRef.current = bodyGroup;

    const m = new Map(measurements.map((m) => [m.measurement_type, m.value_cm]));
    const h = heightCm ?? 170;

    const shoulderW = (m.get('shoulder_width') ?? h * 0.25) / 2;
    const chestR = (m.get('chest') ?? h * 0.52) / (2 * Math.PI);
    const waistR = (m.get('waist') ?? h * 0.45) / (2 * Math.PI);
    const hipR = (m.get('hip') ?? h * 0.53) / (2 * Math.PI);
    const neckR = (m.get('neck') ?? h * 0.10) / (2 * Math.PI);
    const upperArmR = (m.get('upper_arm') ?? h * 0.19) / (2 * Math.PI);
    const thighR = (m.get('thigh') ?? h * 0.29) / (2 * Math.PI);
    const calfR = (m.get('calf') ?? h * 0.14) / (2 * Math.PI);

    const torsoLen = m.get('torso_length') ?? h * 0.30;
    const inseamLen = m.get('inseam') ?? h * 0.45;
    const calfLen = m.get('calf') ?? h * 0.14;
    const upperArmLen = m.get('upper_arm') ?? h * 0.19;
    const forearmLen = m.get('forearm') ?? h * 0.16;

    const accentColor = isDark ? 0x2dd4bf : 0x0d9488;
    const material = new THREE.MeshPhongMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.75,
      shininess: 30,
      flatShading: true,
    });

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: accentColor,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });

    const headGeo = new THREE.SphereGeometry(h * 0.06, 16, 16);
    const head = new THREE.Mesh(headGeo, material);
    head.position.set(0, h - h * 0.06, 0);
    bodyGroup.add(head);
    const headWire = new THREE.Mesh(headGeo, wireMaterial);
    headWire.position.copy(head.position);
    bodyGroup.add(headWire);

    const neckGeo = new THREE.CylinderGeometry(neckR, neckR, h * 0.05, 12);
    const neck = new THREE.Mesh(neckGeo, material);
    neck.position.set(0, h - h * 0.12, 0);
    bodyGroup.add(neck);

    const torsoGeo = new THREE.CylinderGeometry(shoulderW * 1.2, hipR, torsoLen, 16, 4, true);
    const torsoPos = torsoGeo.attributes.position;
    for (let i = 0; i < torsoPos.count; i++) {
      const y = torsoPos.getY(i);
      const t = (y + torsoLen / 2) / torsoLen;
      const x = torsoPos.getX(i);
      const z = torsoPos.getZ(i);
      const r = Math.sqrt(x * x + z * z);
      if (r > 0.001) {
        let targetR: number;
        if (t > 0.5) {
          targetR = THREE.MathUtils.lerp(waistR, shoulderW * 1.2, (t - 0.5) * 2);
        } else {
          targetR = THREE.MathUtils.lerp(hipR, waistR, t * 2);
        }
        const scale = targetR / r;
        torsoPos.setX(i, x * scale);
        torsoPos.setZ(i, z * scale);
      }
    }
    torsoGeo.computeVertexNormals();
    const torso = new THREE.Mesh(torsoGeo, material);
    torso.position.set(0, h - h * 0.12 - torsoLen / 2 - h * 0.05, 0);
    bodyGroup.add(torso);

    const shoulderGeo = new THREE.SphereGeometry(shoulderW * 0.4, 12, 12);
    const leftShoulder = new THREE.Mesh(shoulderGeo, material);
    leftShoulder.position.set(-shoulderW, h - h * 0.17, 0);
    bodyGroup.add(leftShoulder);
    const rightShoulder = new THREE.Mesh(shoulderGeo, material);
    rightShoulder.position.set(shoulderW, h - h * 0.17, 0);
    bodyGroup.add(rightShoulder);

    const upperArmGeo = new THREE.CylinderGeometry(upperArmR, upperArmR * 0.85, upperArmLen, 10);
    const leftUpperArm = new THREE.Mesh(upperArmGeo, material);
    leftUpperArm.position.set(-shoulderW - upperArmR, h - h * 0.17 - upperArmLen / 2, 0);
    bodyGroup.add(leftUpperArm);
    const rightUpperArm = new THREE.Mesh(upperArmGeo, material);
    rightUpperArm.position.set(shoulderW + upperArmR, h - h * 0.17 - upperArmLen / 2, 0);
    bodyGroup.add(rightUpperArm);

    const forearmGeo = new THREE.CylinderGeometry(upperArmR * 0.85, upperArmR * 0.6, forearmLen, 10);
    const leftForearm = new THREE.Mesh(forearmGeo, material);
    leftForearm.position.set(-shoulderW - upperArmR, h - h * 0.17 - upperArmLen - forearmLen / 2, 0);
    bodyGroup.add(leftForearm);
    const rightForearm = new THREE.Mesh(forearmGeo, material);
    rightForearm.position.set(shoulderW + upperArmR, h - h * 0.17 - upperArmLen - forearmLen / 2, 0);
    bodyGroup.add(rightForearm);

    const hipGeo = new THREE.SphereGeometry(hipR, 16, 12);
    const hip = new THREE.Mesh(hipGeo, material);
    hip.scale.set(1, 0.6, 0.8);
    hip.position.set(0, h - h * 0.12 - torsoLen - h * 0.05, 0);
    bodyGroup.add(hip);

    const thighGeo = new THREE.CylinderGeometry(thighR, thighR * 0.8, inseamLen - calfLen, 10);
    const legOffset = hipR * 0.45;
    const leftThigh = new THREE.Mesh(thighGeo, material);
    leftThigh.position.set(-legOffset, h - h * 0.12 - torsoLen - h * 0.05 - (inseamLen - calfLen) / 2, 0);
    bodyGroup.add(leftThigh);
    const rightThigh = new THREE.Mesh(thighGeo, material);
    rightThigh.position.set(legOffset, h - h * 0.12 - torsoLen - h * 0.05 - (inseamLen - calfLen) / 2, 0);
    bodyGroup.add(rightThigh);

    const calfGeo = new THREE.CylinderGeometry(calfR, calfR * 0.7, calfLen, 10);
    const leftCalf = new THREE.Mesh(calfGeo, material);
    leftCalf.position.set(-legOffset, calfLen / 2, 0);
    bodyGroup.add(leftCalf);
    const rightCalf = new THREE.Mesh(calfGeo, material);
    rightCalf.position.set(legOffset, calfLen / 2, 0);
    bodyGroup.add(rightCalf);

    bodyGroup.position.y = 0;

    // --- Mouse interaction (drag to rotate, scroll to zoom) ---
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let userRotationY = 0;
    let userRotationX = 0;
    let cameraDistance = 35;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      setAutoRotate(false);
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      userRotationY += dx * 0.01;
      userRotationX = Math.max(-0.5, Math.min(0.5, userRotationX + dy * 0.005));
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerUp = () => { isDragging = false; };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraDistance = Math.max(15, Math.min(60, cameraDistance + e.deltaY * 0.05));
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    function animate() {
      if (autoRotate && !isDragging) {
        userRotationY += 0.005;
      }

      bodyGroup.rotation.y = userRotationY;
      bodyGroup.rotation.x = userRotationX;

      // Update camera distance
      if (cameraRef.current) {
        cameraRef.current.position.z = cameraDistance;
        cameraRef.current.lookAt(0, 10, 0);
      }

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    }
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const hgt = mountRef.current.clientHeight;
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
      renderer.setSize(w, hgt);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    };
  }, [measurements, heightCm]);

  // Handle view mode changes
  useEffect(() => {
    if (!bodyGroupRef.current) return;
    // Animate to the target angle
    const targetAngle = VIEW_ANGLES[viewMode];
    const current = bodyGroupRef.current.rotation.y;
    const diff = targetAngle - current;

    // Smooth transition
    let frame = 0;
    const totalFrames = 30;
    const animateTransition = () => {
      frame++;
      if (frame >= totalFrames) {
        bodyGroupRef.current!.rotation.y = targetAngle;
        return;
      }
      const t = frame / totalFrames;
      const ease = 1 - Math.pow(1 - t, 3);
      bodyGroupRef.current!.rotation.y = current + diff * ease;
      requestAnimationFrame(animateTransition);
    };
    setAutoRotate(false);
    animateTransition();
  }, [viewMode]);

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />

      {/* View controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-elevated/80 backdrop-blur-md rounded-lg border border-app">
        {(['front', 'side', 'back'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
              viewMode === mode ? 'bg-accent text-white' : 'text-secondary hover:text-primary'
            }`}
          >
            {mode}
          </button>
        ))}
        <div className="w-px h-5 bg-app mx-0.5" />
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            autoRotate ? 'bg-accent text-white' : 'text-secondary hover:text-primary'
          }`}
          title="Toggle auto-rotate"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Hint */}
      <div className="absolute top-3 right-3 text-tertiary text-xs bg-elevated/80 backdrop-blur-md rounded-lg border border-app px-2.5 py-1.5">
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  );
}
