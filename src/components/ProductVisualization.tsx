import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ProductVisualizationProps {
  measurements: { measurement_type: string; value_cm: number }[];
  fitType?: string | null;
}

export function ProductVisualization({ measurements, fitType = 'regular' }: ProductVisualizationProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 360;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101722);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 12, 28);
    camera.lookAt(0, 10, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 20, 10);
    scene.add(light);

    const m = new Map(measurements.map((x) => [x.measurement_type, x.value_cm]));
    const chest = m.get('chest') ?? 100;
    const waist = m.get('waist') ?? chest * 0.9;
    const hip = m.get('hip') ?? chest * 0.98;
    const length = m.get('length') ?? 70;
    const shoulder = m.get('shoulder') ?? 44;
    const sleeve = m.get('sleeve') ?? 22;
    const scale = 0.12;

    const material = new THREE.MeshStandardMaterial({
      color: fitType === 'oversized' ? 0x7c3aed : 0x14b8a6,
      transparent: true,
      opacity: 0.72,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const wire = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });

    const torso = new THREE.Shape();
    const halfShoulder = shoulder * scale / 2;
    const halfChest = chest * scale / (2 * Math.PI);
    const halfWaist = waist * scale / (2 * Math.PI);
    const halfHip = hip * scale / (2 * Math.PI);
    const h = length * scale;
    torso.moveTo(-halfShoulder, h);
    torso.lineTo(halfShoulder, h);
    torso.lineTo(halfChest, h * 0.72);
    torso.lineTo(halfWaist, h * 0.45);
    torso.lineTo(halfHip, 0);
    torso.lineTo(-halfHip, 0);
    torso.lineTo(-halfWaist, h * 0.45);
    torso.lineTo(-halfChest, h * 0.72);
    torso.closePath();

    const geometry = new THREE.ExtrudeGeometry(torso, { depth: Math.max(0.8, chest * scale * 0.28), bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.05, bevelSegments: 2 });
    geometry.center();
    const garment = new THREE.Mesh(geometry, material);
    garment.position.y = 10;
    scene.add(garment);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), wire);
    edges.position.copy(garment.position);
    scene.add(edges);

    const sleeveGeo = new THREE.CapsuleGeometry(Math.max(0.35, sleeve * scale * 0.12), Math.max(1, sleeve * scale * 0.55), 6, 10);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(sleeveGeo, material);
      arm.rotation.z = side * -0.45;
      arm.position.set(side * (halfShoulder + 0.65), 10.7, 0);
      scene.add(arm);
    }

    const resize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 640;
      const hgt = mount.clientHeight || 360;
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
      renderer.setSize(w, hgt);
    };
    window.addEventListener('resize', resize);
    let frame = 0;
    const animate = () => {
      garment.rotation.y += 0.005;
      edges.rotation.y = garment.rotation.y;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      geometry.dispose();
      sleeveGeo.dispose();
      material.dispose();
      wire.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [measurements, fitType]);

  return <div ref={mountRef} className="w-full h-full min-h-[280px]" />;
}
