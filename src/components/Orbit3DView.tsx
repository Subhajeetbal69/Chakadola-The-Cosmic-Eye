import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Crosshair,
  ShieldAlert,
  Play,
  Pause,
  Info,
  X,
  Gauge,
  Target,
  MousePointerClick,
  Cloud,
  Sun,
  Radio,
  Trash2,
  Rocket,
  Focus,
  Sparkles
} from 'lucide-react';
import { TrackedObjectSummary, ConjunctionEvent, ConjunctionSyncState } from '../types';

interface Orbit3DViewProps {
  objects: TrackedObjectSummary[];
  selectedConjunction: ConjunctionEvent | null;
  selectedObject?: TrackedObjectSummary | null;
  syncState?: ConjunctionSyncState | null;
  onSelectObject?: (obj: TrackedObjectSummary) => void;
  onOpenDossier?: (obj: TrackedObjectSummary) => void;
  onResetSync?: () => void;
}

// Photorealistic NASA Earth Satellite Texture CDN Endpoints
const NASA_TEXTURES = {
  dayMap: 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg',
  dayMapFallback: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
  clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
  specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
  normal: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg'
};

export const Orbit3DView: React.FC<Orbit3DViewProps> = React.memo(({
  objects = [],
  selectedConjunction = null,
  selectedObject = null,
  syncState = null,
  onSelectObject,
  onOpenDossier,
  onResetSync
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Display & Simulation State
  const [filterMode, setFilterMode] = useState<'ALL' | 'DEBRIS_ONLY' | 'ACTIVE_ONLY' | 'HAZARDS_ONLY'>('ALL');
  const [showOrbitLines, setShowOrbitLines] = useState<boolean>(true);
  const [showClouds, setShowClouds] = useState<boolean>(false);
  const [globeBrightness, setGlobeBrightness] = useState<'NORMAL' | 'BRIGHT' | 'SUPER_BRIGHT'>('BRIGHT');
  const [simSpeed, setSimSpeed] = useState<number>(60);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFollowCam, setIsFollowCam] = useState<boolean>(false);
  const [showShiftScrollPrompt, setShowShiftScrollPrompt] = useState<boolean>(false);
  const shiftScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerShiftScrollPrompt = useCallback(() => {
    setShowShiftScrollPrompt(true);
    if (shiftScrollTimeoutRef.current) {
      clearTimeout(shiftScrollTimeoutRef.current);
    }
    shiftScrollTimeoutRef.current = setTimeout(() => {
      setShowShiftScrollPrompt(false);
    }, 1800);
  }, []);

  const triggerShiftScrollPromptRef = useRef<() => void>(triggerShiftScrollPrompt);
  triggerShiftScrollPromptRef.current = triggerShiftScrollPrompt;

  // Selected / Caught Object State (Starts untargeted by default)
  const [caughtObject, setCaughtObject] = useState<TrackedObjectSummary | null>(selectedObject || null);
  const [hoveredObject, setHoveredObject] = useState<TrackedObjectSummary | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [cameraPreset, setCameraPreset] = useState<string>('perspective');

  // Stable Refs for Animation Loop
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const simSpeedRef = useRef(simSpeed);
  simSpeedRef.current = simSpeed;

  const isFollowCamRef = useRef(isFollowCam);
  isFollowCamRef.current = isFollowCam;

  const caughtObjectRef = useRef(caughtObject);
  caughtObjectRef.current = caughtObject;

  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const simSecondsRef = useRef<number>(0);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const objectsGroupRef = useRef<THREE.Group | null>(null);
  const hazardGroupRef = useRef<THREE.Group | null>(null);
  const selectionIndicatorGroupRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const atmoGroupRef = useRef<THREE.Group | null>(null);

  const objectNodesMapRef = useRef<
    Map<string, { mesh: THREE.Object3D; hitBox: THREE.Mesh; objData: TrackedObjectSummary }>
  >(new Map());

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Camera Orbit & Smooth Inertia Damping State
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const previousMouseRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ theta: 0, phi: 0 });
  const targetRadiusRef = useRef(36);
  const targetLookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  const targetAnglesRef = useRef<{ theta: number | null; phi: number | null }>({ theta: null, phi: null });
  const syncStateRef = useRef<ConjunctionSyncState | null>(syncState);
  syncStateRef.current = syncState;
  const selectedConjunctionRef = useRef<ConjunctionEvent | null>(selectedConjunction);
  selectedConjunctionRef.current = selectedConjunction;

  const cameraSphericalRef = useRef({
    radius: 36,
    theta: Math.PI / 4,
    phi: Math.PI / 3,
    target: new THREE.Vector3(0, 0, 0)
  });

  const EARTH_RADIUS_SCALED = 6.378;

  // Update Camera Position
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { radius, theta, phi, target } = cameraSphericalRef.current;
    const camera = cameraRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  }, []);

  // Sync external selectedObject prop without rebuilding scene
  useEffect(() => {
    if (selectedObject) {
      if (selectedObject.id !== caughtObjectRef.current?.id) {
        setCaughtObject(selectedObject);
      }
    } else {
      setCaughtObject(null);
      setIsFollowCam(false);
      targetLookAtRef.current.set(0, 0, 0);
    }
  }, [selectedObject]);

  // Adjust Globe Brightness Dynamically
  useEffect(() => {
    if (!rendererRef.current || !earthMeshRef.current || !sunLightRef.current || !ambientLightRef.current) return;
    const earthMat = earthMeshRef.current.material as THREE.MeshStandardMaterial;

    if (globeBrightness === 'NORMAL') {
      rendererRef.current.toneMappingExposure = 1.35;
      sunLightRef.current.intensity = 3.2;
      ambientLightRef.current.intensity = 0.9;
      earthMat.emissiveIntensity = 0.35;
    } else if (globeBrightness === 'BRIGHT') {
      rendererRef.current.toneMappingExposure = 1.65;
      sunLightRef.current.intensity = 4.0;
      ambientLightRef.current.intensity = 1.35;
      earthMat.emissiveIntensity = 0.6;
    } else {
      // SUPER_BRIGHT
      rendererRef.current.toneMappingExposure = 1.95;
      sunLightRef.current.intensity = 4.8;
      ambientLightRef.current.intensity = 1.7;
      earthMat.emissiveIntensity = 0.85;
    }
  }, [globeBrightness]);

  // Helper to convert ECI (km) to Three.js coordinates
  const eciToThree = useCallback((x: number, y: number, z: number): THREE.Vector3 => {
    return new THREE.Vector3(x / 1000, z / 1000, -y / 1000);
  }, []);

  // Handle Conjunction Sync Zoom (Smooth glide into close-up encounter window)
  useEffect(() => {
    if (!syncState || !syncState.isActive) {
      if (cameraPreset === 'encounter') {
        targetLookAtRef.current.set(0, 0, 0);
        targetRadiusRef.current = 36;
        targetAnglesRef.current = { theta: Math.PI / 4, phi: Math.PI / 3 };
        setCameraPreset('perspective');
      }
      return;
    }

    // Convert encounter coordinates to Three.js coordinates
    const pA = eciToThree(syncState.positionA.x, syncState.positionA.y, syncState.positionA.z);
    const pB = eciToThree(syncState.positionB.x, syncState.positionB.y, syncState.positionB.z);
    const encounterMidpoint = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);

    // Smoothly guide camera look-at target directly to the encounter location
    targetLookAtRef.current.copy(encounterMidpoint);

    // True close-up inspection radius (2.8 units puts both objects and warning vector cleanly in frame)
    targetRadiusRef.current = 2.8;

    // Calculate spherical angles so camera views the close approach elevated above Earth
    const dir = encounterMidpoint.clone().normalize();
    const phi = Math.acos(Math.max(-0.95, Math.min(0.95, dir.y)));
    const theta = Math.atan2(dir.x, dir.z);
    targetAnglesRef.current = {
      theta: theta + 0.32,
      phi: Math.max(0.25, Math.min(Math.PI - 0.25, phi * 0.9))
    };

    // Set simulation time smoothly to the encounter moment
    simSecondsRef.current = syncState.tcaSecondsOffset;

    // Release single-object target follow lock to focus on encounter midpoint
    setIsFollowCam(false);
    setCameraPreset('encounter');
  }, [syncState?.timestamp, syncState?.isActive, eciToThree]);


  // Guaranteed safe 48-point orbital loop in Three.js coordinates
  const getSafeOrbitPoints = useCallback(
    (obj: TrackedObjectSummary): THREE.Vector3[] => {
      if (obj.orbitSample && Array.isArray(obj.orbitSample) && obj.orbitSample.length >= 3) {
        const pts = obj.orbitSample.map((pt) => eciToThree(pt.x, pt.y, pt.z));
        pts.push(pts[0]);
        return pts;
      }

      // Analytical 48-point ellipse fallback from orbital elements
      const pts: THREE.Vector3[] = [];
      const semiMajorKm = ((obj.perigeeKm || 400) + (obj.apogeeKm || 600)) / 2 + 6378.137;
      const incRad = ((obj.inclinationDeg || 51.6) * Math.PI) / 180;
      const noradNum = parseInt(obj.noradId?.replace(/\D/g, '') || '100', 10);
      const raanRad = ((noradNum * 37) % 360 * Math.PI) / 180;
      const rScaled = semiMajorKm / 1000;

      for (let i = 0; i <= 48; i++) {
        const theta = (i / 48) * Math.PI * 2;
        const x0 = rScaled * Math.cos(theta);
        const y0 = rScaled * Math.sin(theta);

        const x1 = x0;
        const y1 = y0 * Math.cos(incRad);
        const z1 = y0 * Math.sin(incRad);

        const x = x1 * Math.cos(raanRad) - y1 * Math.sin(raanRad);
        const y = x1 * Math.sin(raanRad) + y1 * Math.cos(raanRad);
        const z = z1;
        pts.push(new THREE.Vector3(x, z, -y));
      }
      return pts;
    },
    [eciToThree]
  );

  // Smooth position interpolation along orbital loop
  const getObjectInterpolatedPosition = useCallback(
    (obj: TrackedObjectSummary, elapsedSimSeconds: number): THREE.Vector3 => {
      const pathPoints = getSafeOrbitPoints(obj);
      if (pathPoints.length < 2) {
        const raw = obj.currentPosition || obj.positionKm;
        return raw && (raw.x !== 0 || raw.y !== 0 || raw.z !== 0)
          ? eciToThree(raw.x, raw.y, raw.z)
          : new THREE.Vector3(7.2, 0, 0);
      }

      const periodSec = Math.max(600, (obj.periodMin || 92) * 60);
      const noradNum = parseInt(obj.noradId?.replace(/\D/g, '') || '100', 10);
      const phaseOffset = (noradNum * 0.137) % 1;

      const progress = ((elapsedSimSeconds / periodSec) + phaseOffset) % 1;
      const totalPoints = pathPoints.length - 1;
      const exactIndex = progress * totalPoints;
      const idx0 = Math.floor(exactIndex) % totalPoints;
      const idx1 = (idx0 + 1) % totalPoints;
      const frac = exactIndex - Math.floor(exactIndex);

      const p0 = pathPoints[idx0];
      const p1 = pathPoints[idx1];

      if (!p0 || !p1) {
        return pathPoints[0] || new THREE.Vector3(7.2, 0, 0);
      }

      return new THREE.Vector3(
        p0.x + (p1.x - p0.x) * frac,
        p0.y + (p1.y - p0.y) * frac,
        p0.z + (p1.z - p0.z) * frac
      );
    },
    [eciToThree, getSafeOrbitPoints]
  );

  // Catch object handler (Smooth, zero lag, doesn't tear down 3D scene)
  const catchObject = useCallback(
    (obj: TrackedObjectSummary | null, shouldFollow: boolean = false) => {
      setCaughtObject(obj);
      setIsFollowCam(shouldFollow);
      if (onSelectObject) onSelectObject(obj as any);

      if (obj) {
        const currentPos = getObjectInterpolatedPosition(obj, simSecondsRef.current);
        if (currentPos.length() > 0.1) {
          targetLookAtRef.current.copy(shouldFollow ? currentPos : new THREE.Vector3(0, 0, 0));
          targetAnglesRef.current = {
            theta: Math.atan2(currentPos.x, currentPos.z),
            phi: Math.acos(Math.max(-0.95, Math.min(0.95, currentPos.y / Math.max(1, currentPos.length()))))
          };
          targetRadiusRef.current = Math.max(14, Math.min(26, cameraSphericalRef.current.radius));
        }
      } else {
        targetLookAtRef.current.set(0, 0, 0);
      }
    },
    [getObjectInterpolatedPosition, onSelectObject]
  );

  // Catch nearest object handler
  const catchNearestObject = useCallback(() => {
    const list = objectsRef.current || [];
    if (list.length === 0) return;
    let candidates = list;
    if (filterMode === 'DEBRIS_ONLY') {
      candidates = list.filter((o) => o.classification === 'DEBRIS');
    }
    if (candidates.length === 0) candidates = list;

    const currentIndex = candidates.findIndex((o) => o.id === caughtObjectRef.current?.id);
    const nextObj = candidates[(currentIndex + 1) % candidates.length];
    if (nextObj) {
      catchObject(nextObj, false);
    }
  }, [filterMode, catchObject]);

  // 1. INITIALIZE THREE.JS SCENE ONCE ON MOUNT WITH BRIGHT PHOTOREALISTIC EARTH
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01030a);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 2000);
    cameraRef.current = camera;
    updateCameraPosition();

    // High Precision WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.65;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Bright Space Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x475569, 1.35);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const sunLight = new THREE.DirectionalLight(0xfffef5, 4.0);
    sunLight.position.set(90, 45, 80);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const earthshineRim = new THREE.DirectionalLight(0x38bdf8, 1.1);
    earthshineRim.position.set(-90, -35, -80);
    scene.add(earthshineRim);

    // ==========================================
    // PHOTOREALISTIC NASA BLUE MARBLE EARTH
    // ==========================================
    const textureLoader = new THREE.TextureLoader();

    // Fallback Canvas Texture
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 2048;
    fallbackCanvas.height = 1024;
    const fbCtx = fallbackCanvas.getContext('2d');
    if (fbCtx) {
      const oceanGrad = fbCtx.createLinearGradient(0, 0, 0, 1024);
      oceanGrad.addColorStop(0, '#0a2e5c');
      oceanGrad.addColorStop(0.5, '#061c3b');
      oceanGrad.addColorStop(1, '#0a2e5c');
      fbCtx.fillStyle = oceanGrad;
      fbCtx.fillRect(0, 0, 2048, 1024);

      fbCtx.fillStyle = '#2d5a37';
      fbCtx.beginPath();
      fbCtx.ellipse(450, 300, 220, 150, -0.2, 0, Math.PI * 2);
      fbCtx.fill();
      fbCtx.beginPath();
      fbCtx.ellipse(620, 720, 130, 210, 0.2, 0, Math.PI * 2);
      fbCtx.fill();
      fbCtx.beginPath();
      fbCtx.ellipse(1350, 320, 380, 180, -0.1, 0, Math.PI * 2);
      fbCtx.fill();
      fbCtx.beginPath();
      fbCtx.ellipse(1100, 620, 160, 220, 0.1, 0, Math.PI * 2);
      fbCtx.fill();
      fbCtx.beginPath();
      fbCtx.ellipse(1680, 760, 130, 110, 0, 0, Math.PI * 2);
      fbCtx.fill();
      fbCtx.fillStyle = '#f1f5f9';
      fbCtx.beginPath();
      fbCtx.ellipse(1024, 990, 950, 80, 0, 0, Math.PI * 2);
      fbCtx.fill();
    }
    const fallbackTexture = new THREE.CanvasTexture(fallbackCanvas);

    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS_SCALED, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: fallbackTexture,
      roughness: 0.45,
      metalness: 0.18,
      emissive: 0x0f223d,
      emissiveIntensity: 0.6
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // Load High-Res NASA Satellite Imagery
    textureLoader.load(
      NASA_TEXTURES.dayMap,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
      undefined,
      () => {
        textureLoader.load(NASA_TEXTURES.dayMapFallback, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          earthMat.map = tex;
          earthMat.needsUpdate = true;
        });
      }
    );

    textureLoader.load(NASA_TEXTURES.specular, (specTex) => {
      earthMat.roughnessMap = specTex;
      earthMat.needsUpdate = true;
    });

    textureLoader.load(NASA_TEXTURES.normal, (normTex) => {
      earthMat.normalMap = normTex;
      earthMat.normalScale = new THREE.Vector2(0.4, 0.4);
      earthMat.needsUpdate = true;
    });

    // Atmospheric Clouds
    const cloudsGeo = new THREE.SphereGeometry(EARTH_RADIUS_SCALED * 1.012, 48, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.72,
      blending: THREE.NormalBlending,
      roughness: 0.95
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    cloudsMesh.visible = false;
    scene.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    textureLoader.load(NASA_TEXTURES.clouds, (cloudTex) => {
      cloudTex.colorSpace = THREE.SRGBColorSpace;
      cloudsMat.map = cloudTex;
      cloudsMat.needsUpdate = true;
    });

    // Subtle Atmospheric Glow Limb
    const atmoGroup = new THREE.Group();
    scene.add(atmoGroup);
    atmoGroupRef.current = atmoGroup;

    const innerAtmoGeo = new THREE.SphereGeometry(EARTH_RADIUS_SCALED * 1.026, 48, 48);
    const innerAtmoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.26,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    const innerAtmoMesh = new THREE.Mesh(innerAtmoGeo, innerAtmoMat);
    atmoGroup.add(innerAtmoMesh);

    const outerHaloGeo = new THREE.SphereGeometry(EARTH_RADIUS_SCALED * 1.065, 36, 36);
    const outerHaloMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    const outerHaloMesh = new THREE.Mesh(outerHaloGeo, outerHaloMat);
    atmoGroup.add(outerHaloMesh);

    // Deep Space Starfield
    const starCount = 750;
    const starGeo = new THREE.BufferGeometry();
    const starCoords = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 260 + Math.random() * 160;
      starCoords[i] = r * Math.sin(phi) * Math.cos(theta);
      starCoords[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      starCoords[i + 2] = r * Math.cos(phi);

      const brightness = 0.45 + Math.random() * 0.45;
      starColors[i] = 0.85 * brightness;
      starColors[i + 1] = 0.92 * brightness;
      starColors[i + 2] = 1.0 * brightness;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starCoords, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Dynamic Groups
    const objectsGroup = new THREE.Group();
    scene.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;

    const hazardGroup = new THREE.Group();
    scene.add(hazardGroup);
    hazardGroupRef.current = hazardGroup;

    // Persistent Selection Indicator Group (Updates without tearing down scene)
    const selGroup = new THREE.Group();
    scene.add(selGroup);
    selectionIndicatorGroupRef.current = selGroup;

    // Selection Lock Ring
    const lockRingGeo = new THREE.RingGeometry(0.55, 0.65, 32);
    const lockRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const lockRingMesh = new THREE.Mesh(lockRingGeo, lockRingMat);
    lockRingMesh.name = 'lockRing';
    selGroup.add(lockRingMesh);

    // Nadir Ground Pin
    const pinGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
    const pinMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.2,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.6
    });
    const groundLine = new THREE.Line(pinGeo, pinMat);
    groundLine.name = 'groundLine';
    selGroup.add(groundLine);

    const groundRingGeo = new THREE.RingGeometry(0.18, 0.26, 20);
    const groundRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
    groundRing.name = 'groundRing';
    selGroup.add(groundRing);

    selGroup.visible = false;

    // Mouse & Touch Controls with Smooth Inertia Damping
    const dom = renderer.domElement;

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      targetAnglesRef.current = { theta: null, phi: null };
      velocityRef.current = { theta: 0, phi: 0 };
      previousMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      if (isDraggingRef.current) {
        hasDraggedRef.current = true;
        const deltaX = e.clientX - previousMouseRef.current.x;
        const deltaY = e.clientY - previousMouseRef.current.y;

        const dTheta = -deltaX * 0.006;
        const dPhi = -deltaY * 0.006;

        velocityRef.current = { theta: dTheta, phi: dPhi };

        cameraSphericalRef.current.theta += dTheta;
        cameraSphericalRef.current.phi = Math.max(
          0.08,
          Math.min(Math.PI - 0.08, cameraSphericalRef.current.phi + dPhi)
        );

        updateCameraPosition();
        previousMouseRef.current = { x: e.clientX, y: e.clientY };
        setHoveredObject(null);
        dom.style.cursor = 'grabbing';
      } else {
        mouseRef.current.x = (clientX / rect.width) * 2 - 1;
        mouseRef.current.y = -(clientY / rect.height) * 2 + 1;

        if (cameraRef.current) {
          raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
          const hitBoxes: THREE.Object3D[] = [];
          objectNodesMapRef.current.forEach((val) => {
            if (val.hitBox.visible) hitBoxes.push(val.hitBox);
          });

          const intersects = raycasterRef.current.intersectObjects(hitBoxes, false);
          if (intersects.length > 0) {
            const hit = intersects[0].object;
            const objData = hit.userData.objectData as TrackedObjectSummary;
            if (objData) {
              setHoveredObject(objData);
              setTooltipPos({ x: clientX, y: clientY });
              dom.style.cursor = 'crosshair';
              return;
            }
          }
        }
        setHoveredObject(null);
        dom.style.cursor = 'grab';
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      isDraggingRef.current = false;
      dom.style.cursor = 'grab';

      if (!hasDraggedRef.current) {
        const rect = dom.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        mouseRef.current.x = (clientX / rect.width) * 2 - 1;
        mouseRef.current.y = -(clientY / rect.height) * 2 + 1;

        if (cameraRef.current) {
          raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
          const hitBoxes: THREE.Object3D[] = [];
          objectNodesMapRef.current.forEach((val) => {
            if (val.hitBox.visible) hitBoxes.push(val.hitBox);
          });

          const intersects = raycasterRef.current.intersectObjects(hitBoxes, false);
          if (intersects.length > 0) {
            const hit = intersects[0].object;
            const objData = hit.userData.objectData as TrackedObjectSummary;
            if (objData) {
              catchObject(objData, false);
            }
          } else {
            // Clicked on empty space or general background: release target
            setCaughtObject(null);
            setIsFollowCam(false);
            cameraSphericalRef.current.target.set(0, 0, 0);
            updateCameraPosition();
            if (onSelectObject) {
              onSelectObject(null as any);
            }
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        if (shiftScrollTimeoutRef.current) {
          clearTimeout(shiftScrollTimeoutRef.current);
        }
        setShowShiftScrollPrompt(false);

        // Normalize delta across browsers/trackpads (pixel vs line vs page delta modes)
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 20; // lines
        else if (e.deltaMode === 2) delta *= 80; // pages

        // Proportional exponential smooth multiplier
        const zoomScale = Math.exp(delta * 0.0011);
        targetRadiusRef.current = Math.max(8.5, Math.min(125, targetRadiusRef.current * zoomScale));
      } else {
        // Prompt user that Shift + Scroll is required for zooming the 3D model
        triggerShiftScrollPromptRef.current();
      }
    };

    // Touch Event Handlers for Mobile & Trackpad Pinch-to-Zoom
    let initialPinchDist = 0;
    let initialTargetRadius = targetRadiusRef.current;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        hasDraggedRef.current = false;
        velocityRef.current = { theta: 0, phi: 0 };
        previousMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.hypot(dx, dy);
        initialTargetRadius = targetRadiusRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDraggingRef.current) {
        hasDraggedRef.current = true;
        const deltaX = e.touches[0].clientX - previousMouseRef.current.x;
        const deltaY = e.touches[0].clientY - previousMouseRef.current.y;

        const dTheta = -deltaX * 0.006;
        const dPhi = -deltaY * 0.006;

        velocityRef.current = { theta: dTheta, phi: dPhi };

        cameraSphericalRef.current.theta += dTheta;
        cameraSphericalRef.current.phi = Math.max(
          0.08,
          Math.min(Math.PI - 0.08, cameraSphericalRef.current.phi + dPhi)
        );

        updateCameraPosition();
        previousMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2 && initialPinchDist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        const scale = initialPinchDist / Math.max(1, currentDist);
        targetRadiusRef.current = Math.max(8.5, Math.min(125, initialTargetRadius * scale));
      }
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      initialPinchDist = 0;
    };

    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Continuous 60fps Animation Loop
    let animId: number;
    let lastFrameTime = performance.now();

    const animate = (timeNow: number) => {
      animId = requestAnimationFrame(animate);

      const deltaMs = Math.min(100, timeNow - lastFrameTime);
      lastFrameTime = timeNow;

      // Realistic Earth rotation
      if (earthMeshRef.current) {
        earthMeshRef.current.rotation.y += 0.0003;
      }
      // Cloud layer rotation
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.00045;
      }

      // Continuous Smooth LookAt Target Lerping
      const currentTarget = cameraSphericalRef.current.target;
      const lookAtDist = targetLookAtRef.current.distanceTo(currentTarget);
      if (lookAtDist > 0.0005) {
        currentTarget.lerp(targetLookAtRef.current, 0.09);
        updateCameraPosition();
      }

      // Smooth Spherical Angles Transition (for presets & sync glide)
      if (!isDraggingRef.current) {
        if (targetAnglesRef.current.theta !== null) {
          const diffTheta = targetAnglesRef.current.theta - cameraSphericalRef.current.theta;
          if (Math.abs(diffTheta) > 0.001) {
            cameraSphericalRef.current.theta += diffTheta * 0.09;
            updateCameraPosition();
          } else {
            cameraSphericalRef.current.theta = targetAnglesRef.current.theta;
            targetAnglesRef.current.theta = null;
          }
        }
        if (targetAnglesRef.current.phi !== null) {
          const diffPhi = targetAnglesRef.current.phi - cameraSphericalRef.current.phi;
          if (Math.abs(diffPhi) > 0.001) {
            cameraSphericalRef.current.phi += diffPhi * 0.09;
            updateCameraPosition();
          } else {
            cameraSphericalRef.current.phi = targetAnglesRef.current.phi;
            targetAnglesRef.current.phi = null;
          }
        }

        // Smooth Camera Inertia Damping
        if (Math.abs(velocityRef.current.theta) > 0.00005 || Math.abs(velocityRef.current.phi) > 0.00005) {
          cameraSphericalRef.current.theta += velocityRef.current.theta;
          cameraSphericalRef.current.phi = Math.max(
            0.08,
            Math.min(Math.PI - 0.08, cameraSphericalRef.current.phi + velocityRef.current.phi)
          );
          velocityRef.current.theta *= 0.92;
          velocityRef.current.phi *= 0.92;
          updateCameraPosition();
        }
      }

      // Framerate-independent Smooth Zoom Lerp
      const zoomDiff = targetRadiusRef.current - cameraSphericalRef.current.radius;
      if (Math.abs(zoomDiff) > 0.002) {
        const zoomDamp = 1 - Math.exp(-0.015 * deltaMs);
        cameraSphericalRef.current.radius += zoomDiff * zoomDamp;
        updateCameraPosition();
      }

      // Advance Simulation Clock
      if (isPlayingRef.current) {
        const deltaSimSeconds = (deltaMs / 1000) * simSpeedRef.current;
        simSecondsRef.current += deltaSimSeconds;
      }

      const currentSimSeconds = simSecondsRef.current;

      // Dynamic Conjunction Hazard Line & Midpoint Tracking
      const activeConj = selectedConjunctionRef.current;
      if (activeConj) {
        const objA = objectsRef.current.find((o) => o.id === activeConj.objectA?.id);
        const objB = objectsRef.current.find((o) => o.id === activeConj.objectB?.id);
        if (objA && objB) {
          const posA = getObjectInterpolatedPosition(objA, currentSimSeconds);
          const posB = getObjectInterpolatedPosition(objB, currentSimSeconds);
          const midPos = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);

          const activeSync = syncStateRef.current;
          if (activeSync && activeSync.isActive) {
            targetLookAtRef.current.copy(midPos);
          }

          const hazardGroup = hazardGroupRef.current;
          if (hazardGroup) {
            const hLine = hazardGroup.getObjectByName('hazardLine') as THREE.Line;
            if (hLine && hLine.geometry) {
              const posAttr = hLine.geometry.attributes.position as THREE.BufferAttribute;
              if (posAttr) {
                posAttr.setXYZ(0, posA.x, posA.y, posA.z);
                posAttr.setXYZ(1, posB.x, posB.y, posB.z);
                posAttr.needsUpdate = true;
                hLine.computeLineDistances();
              }
            }

            const hRing = hazardGroup.getObjectByName('hazardRing');
            if (hRing) {
              hRing.position.copy(midPos);
              hRing.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 0, 0));
            }
          }
        }
      }

      // Update positions of objects smoothly (No blinking, steady rendering)
      objectNodesMapRef.current.forEach((val) => {
        const newPos = getObjectInterpolatedPosition(val.objData, currentSimSeconds);
        val.mesh.position.copy(newPos);
        val.hitBox.position.copy(newPos);

        // Keep active satellite solar panels oriented
        if (val.objData.classification === 'ACTIVE_SATELLITE') {
          val.mesh.lookAt(0, 0, 0);
        }
      });

      // Update Selection Indicator without re-allocating
      const currentCaught = caughtObjectRef.current;
      const indicatorGroup = selectionIndicatorGroupRef.current;
      if (indicatorGroup) {
        if (currentCaught) {
          const caughtPos = getObjectInterpolatedPosition(currentCaught, currentSimSeconds);
          indicatorGroup.visible = true;

          const ring = indicatorGroup.getObjectByName('lockRing');
          if (ring) {
            ring.position.copy(caughtPos);
            ring.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 0, 0));
          }

          const groundRing = indicatorGroup.getObjectByName('groundRing');
          const subSatPos = caughtPos.clone().normalize().multiplyScalar(EARTH_RADIUS_SCALED);
          if (groundRing) {
            groundRing.position.copy(subSatPos);
            groundRing.lookAt(new THREE.Vector3(0, 0, 0));
          }

          const groundLine = indicatorGroup.getObjectByName('groundLine') as THREE.Line;
          if (groundLine) {
            const posAttr = groundLine.geometry.attributes.position as THREE.BufferAttribute;
            if (posAttr) {
              posAttr.setXYZ(0, subSatPos.x, subSatPos.y, subSatPos.z);
              posAttr.setXYZ(1, caughtPos.x, caughtPos.y, caughtPos.z);
              posAttr.needsUpdate = true;
            }
          }
        } else {
          indicatorGroup.visible = false;
        }
      }

      // Follow Camera Mode
      if (isFollowCamRef.current && caughtObjectRef.current) {
        const caughtPos = getObjectInterpolatedPosition(caughtObjectRef.current, currentSimSeconds);
        cameraSphericalRef.current.target.lerp(caughtPos, 0.08);
        updateCameraPosition();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      if (shiftScrollTimeoutRef.current) {
        clearTimeout(shiftScrollTimeoutRef.current);
      }
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, []);

  // 2. SYNCHRONIZE 3D OBJECTS (Only when objects dataset or filter/visibility settings change)
  useEffect(() => {
    const objectsGroup = objectsGroupRef.current;
    const hazardGroup = hazardGroupRef.current;
    if (!objectsGroup || !hazardGroup) return;

    if (cloudsMeshRef.current) {
      cloudsMeshRef.current.visible = showClouds;
    }

    // Clear old meshes
    while (objectsGroup.children.length > 0) {
      objectsGroup.remove(objectsGroup.children[0]);
    }
    while (hazardGroup.children.length > 0) {
      hazardGroup.remove(hazardGroup.children[0]);
    }
    objectNodesMapRef.current.clear();

    const safeObjects = Array.isArray(objects) ? objects : [];

    // Shared Materials for Performance & Clean Matte Rendering
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.15
    });

    const satBusMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.5,
      metalness: 0.4
    });

    const satWingMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.6,
      metalness: 0.3
    });

    const rocketMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.5,
      metalness: 0.35
    });

    safeObjects.forEach((obj) => {
      if (!obj) return;

      const isDebris = obj.classification === 'DEBRIS';
      const isRocketBody = obj.classification === 'ROCKET_BODY';
      const isActiveSat = obj.classification === 'ACTIVE_SATELLITE';

      const isConjunctionPair =
        selectedConjunction &&
        (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);

      // Filter Visibility
      let isVisible = true;
      if (filterMode === 'DEBRIS_ONLY' && !isDebris) isVisible = false;
      if (filterMode === 'ACTIVE_ONLY' && !isActiveSat) isVisible = false;
      if (filterMode === 'HAZARDS_ONLY' && !isConjunctionPair) isVisible = false;

      let mainColor = 0x38bdf8; // Dimmer Cyan / Blue
      if (isDebris) mainColor = 0xe2e8f0; // Clean Off-White
      else if (isRocketBody) mainColor = 0xf59e0b; // Amber

      // 1. Clean, subtle orbit lines
      if (showOrbitLines) {
        const pathPoints = getSafeOrbitPoints(obj);
        if (pathPoints.length >= 3) {
          const orbitGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
          const orbitMat = new THREE.LineBasicMaterial({
            color: mainColor,
            transparent: true,
            opacity: !isVisible ? 0.02 : isDebris ? 0.25 : 0.35,
            linewidth: 1
          });
          const orbitLine = new THREE.Line(orbitGeo, orbitMat);
          orbitLine.visible = isVisible || !['DEBRIS_ONLY', 'ACTIVE_ONLY', 'HAZARDS_ONLY'].includes(filterMode);
          objectsGroup.add(orbitLine);
        }
      }

      // 2. High-Tech 3D Geometric Object Group
      const nodeGroup = new THREE.Group();

      if (isDebris) {
        // Small matte white sphere
        const sphereGeo = new THREE.SphereGeometry(0.11, 10, 10);
        const sphereMesh = new THREE.Mesh(sphereGeo, debrisMat);
        nodeGroup.add(sphereMesh);
      } else if (isRocketBody) {
        // Small cylindrical booster
        const boosterGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.42, 10);
        const boosterMesh = new THREE.Mesh(boosterGeo, rocketMat);
        boosterMesh.rotation.z = Math.PI / 2;
        nodeGroup.add(boosterMesh);
      } else {
        // Active Satellite: Sleek compact bus + solar wings
        const busGeo = new THREE.BoxGeometry(0.16, 0.16, 0.2);
        const busMesh = new THREE.Mesh(busGeo, satBusMat);
        nodeGroup.add(busMesh);

        // Wings
        const wingGeo = new THREE.BoxGeometry(0.48, 0.14, 0.02);
        const leftWing = new THREE.Mesh(wingGeo, satWingMat);
        leftWing.position.set(-0.34, 0, 0);
        nodeGroup.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeo, satWingMat);
        rightWing.position.set(0.34, 0, 0);
        nodeGroup.add(rightWing);
      }

      // Initial Position
      const initialPos = getObjectInterpolatedPosition(obj, simSecondsRef.current);
      nodeGroup.position.copy(initialPos);

      // 3. Wide Raycasting Hit Box (Effortless clicking)
      const hitBoxGeo = new THREE.SphereGeometry(1.6, 8, 8);
      const hitBoxMat = new THREE.MeshBasicMaterial({
        visible: false,
        wireframe: true
      });
      const hitBoxMesh = new THREE.Mesh(hitBoxGeo, hitBoxMat);
      hitBoxMesh.position.copy(initialPos);
      hitBoxMesh.userData = {
        isInteractiveObject: true,
        objectData: obj
      };
      hitBoxMesh.visible = isVisible;

      nodeGroup.visible = isVisible;
      objectsGroup.add(nodeGroup);
      objectsGroup.add(hitBoxMesh);

      objectNodesMapRef.current.set(obj.id, { mesh: nodeGroup, hitBox: hitBoxMesh, objData: obj });
    });

    // 4. Conjunction Hazard Laser Line
    if (selectedConjunction) {
      const objA = safeObjects.find((o) => o.id === selectedConjunction.objectA?.id);
      const objB = safeObjects.find((o) => o.id === selectedConjunction.objectB?.id);

      const posA = objA
        ? getObjectInterpolatedPosition(objA, simSecondsRef.current)
        : eciToThree(
            selectedConjunction.positionAAtTca.x,
            selectedConjunction.positionAAtTca.y,
            selectedConjunction.positionAAtTca.z
          );
      const posB = objB
        ? getObjectInterpolatedPosition(objB, simSecondsRef.current)
        : eciToThree(
            selectedConjunction.positionBAtTca.x,
            selectedConjunction.positionBAtTca.y,
            selectedConjunction.positionBAtTca.z
          );

      const lineGeo = new THREE.BufferGeometry().setFromPoints([posA, posB]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xf43f5e,
        dashSize: 0.4,
        gapSize: 0.2,
        linewidth: 2
      });
      const connectorLine = new THREE.Line(lineGeo, lineMat);
      connectorLine.name = 'hazardLine';
      connectorLine.computeLineDistances();
      hazardGroup.add(connectorLine);

      const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
      const dangerRingGeo = new THREE.RingGeometry(0.4, 0.55, 32);
      const dangerRingMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const dangerRing = new THREE.Mesh(dangerRingGeo, dangerRingMat);
      dangerRing.name = 'hazardRing';
      dangerRing.position.copy(midPoint);
      dangerRing.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 0, 0));
      hazardGroup.add(dangerRing);
    }
  }, [
    objects,
    selectedConjunction,
    filterMode,
    showOrbitLines,
    showClouds,
    eciToThree,
    getSafeOrbitPoints,
    getObjectInterpolatedPosition
  ]);

  // Set Preset Camera Views smoothly
  const setCameraView = (view: 'perspective' | 'north' | 'equator' | 'follow') => {
    setCameraPreset(view);
    if (!cameraRef.current) return;

    if (view === 'perspective') {
      setIsFollowCam(false);
      targetLookAtRef.current.set(0, 0, 0);
      targetRadiusRef.current = 36;
      targetAnglesRef.current = {
        theta: Math.PI / 4,
        phi: Math.PI / 3
      };
    } else if (view === 'north') {
      setIsFollowCam(false);
      targetLookAtRef.current.set(0, 0, 0);
      targetRadiusRef.current = 40;
      targetAnglesRef.current = {
        theta: 0,
        phi: 0.08
      };
    } else if (view === 'equator') {
      setIsFollowCam(false);
      targetLookAtRef.current.set(0, 0, 0);
      targetRadiusRef.current = 34;
      targetAnglesRef.current = {
        theta: Math.PI / 2,
        phi: Math.PI / 2
      };
    } else if (view === 'follow' && caughtObject) {
      setIsFollowCam(true);
      const pt = getObjectInterpolatedPosition(caughtObject, simSecondsRef.current);
      targetRadiusRef.current = 18;
      targetLookAtRef.current.copy(pt);
      targetAnglesRef.current = {
        theta: Math.atan2(pt.x, pt.z),
        phi: Math.acos(Math.max(-0.95, Math.min(0.95, pt.y / Math.max(1, pt.length()))))
      };
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 0.72 : 1.35;
    targetRadiusRef.current = Math.max(8.5, Math.min(125, targetRadiusRef.current * factor));
  };

  const activeCount = Array.isArray(objects)
    ? objects.filter((o) => o.classification === 'ACTIVE_SATELLITE').length
    : 0;
  const debrisCount = Array.isArray(objects)
    ? objects.filter((o) => o.classification === 'DEBRIS').length
    : 0;

  const inspectedObj = caughtObject || hoveredObject || null;
  const currentSpeedKmS = inspectedObj?.speedKmS ?? 0;
  const currentSpeedKmH = currentSpeedKmS * 3600;
  const currentMach = currentSpeedKmH / 1234.8;

  return (
    <div
      id="orbit-3d-panel"
      className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative"
    >
      {/* Top Header Overlay: Clean Organized Non-Overlapping Control Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
        {/* Left Side: Filter Tabs & Target Catching */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
          <div className="bg-slate-950/90 backdrop-blur-md px-1.5 py-1 border border-white/10 rounded-xl flex items-center gap-1 shadow-xl text-xs">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-2 py-1 rounded-lg font-mono text-[10px] font-bold transition-all ${
                filterMode === 'ALL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              All ({objects.length})
            </button>
            <button
              onClick={() => setFilterMode('DEBRIS_ONLY')}
              className={`px-2 py-1 rounded-lg font-mono text-[10px] font-bold flex items-center gap-1 transition-all ${
                filterMode === 'DEBRIS_ONLY'
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>Debris ({debrisCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('ACTIVE_ONLY')}
              className={`px-2 py-1 rounded-lg font-mono text-[10px] font-bold transition-all ${
                filterMode === 'ACTIVE_ONLY'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-blue-400 hover:text-white hover:bg-blue-500/20'
              }`}
            >
              Active ({activeCount})
            </button>
            {selectedConjunction && (
              <button
                onClick={() => setFilterMode('HAZARDS_ONLY')}
                className={`px-2 py-1 rounded-lg font-mono text-[10px] font-bold transition-all ${
                  filterMode === 'HAZARDS_ONLY'
                    ? 'bg-rose-600 text-white shadow shadow-rose-500/30'
                    : 'text-rose-400 hover:text-white hover:bg-rose-500/20'
                }`}
              >
                Hazard Pair
              </button>
            )}
          </div>

          {/* Catch Nearest Button */}
          <button
            onClick={catchNearestObject}
            className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold backdrop-blur-md transition-all flex items-center gap-1 shadow-lg active:scale-95"
            title="Auto-catch the nearest orbiting satellite or debris object"
          >
            <Target className="w-3.5 h-3.5 text-cyan-400" />
            <span>Catch Target</span>
          </button>
        </div>

        {/* Right Side: Visual Toggles & Camera Views (Neat, Never Overlapping) */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
          {/* Orbit Lines Toggle */}
          <button
            onClick={() => setShowOrbitLines(!showOrbitLines)}
            className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-mono font-semibold backdrop-blur-md transition-all flex items-center gap-1 ${
              showOrbitLines
                ? 'bg-blue-950/80 border-blue-500/40 text-blue-300'
                : 'bg-slate-950/80 border-white/10 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{showOrbitLines ? 'Orbits ON' : 'Orbits OFF'}</span>
          </button>

          {/* 3D Atmospheric Clouds Toggle */}
          <button
            onClick={() => setShowClouds(!showClouds)}
            className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-mono font-semibold backdrop-blur-md transition-all flex items-center gap-1 ${
              showClouds
                ? 'bg-slate-800/90 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-950/80 border-white/10 text-slate-400'
            }`}
            title="Toggle photorealistic 3D atmospheric cloud layer"
          >
            <Cloud className="w-3 h-3" />
            <span>{showClouds ? 'Clouds ON' : 'Clouds OFF'}</span>
          </button>

          {/* Globe Brightness Selector */}
          <div className="flex items-center gap-0.5 bg-slate-950/90 backdrop-blur-md p-1 border border-white/10 rounded-xl text-[10px]">
            <Sun className="w-3 h-3 text-amber-400 mx-1" />
            <button
              onClick={() => setGlobeBrightness('NORMAL')}
              className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all ${
                globeBrightness === 'NORMAL' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => setGlobeBrightness('BRIGHT')}
              className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all ${
                globeBrightness === 'BRIGHT' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bright
            </button>
            <button
              onClick={() => setGlobeBrightness('SUPER_BRIGHT')}
              className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all ${
                globeBrightness === 'SUPER_BRIGHT' ? 'bg-amber-400 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Vivid
            </button>
          </div>

          {/* Camera Presets */}
          <div className="flex items-center gap-0.5 bg-slate-950/90 backdrop-blur-md p-1 border border-white/10 rounded-xl text-[10px] shadow-xl">
            <button
              onClick={() => setCameraView('perspective')}
              title="3D Oblique Perspective"
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-all ${
                cameraPreset === 'perspective' && !isFollowCam
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              3D
            </button>
            <button
              onClick={() => setCameraView('north')}
              title="North Polar View"
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-all ${
                cameraPreset === 'north'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Polar
            </button>
            <button
              onClick={() => setCameraView('equator')}
              title="Equatorial View"
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-all ${
                cameraPreset === 'equator'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Equator
            </button>
            {caughtObject && (
              <button
                onClick={() => {
                  if (isFollowCam) {
                    setIsFollowCam(false);
                    cameraSphericalRef.current.target.set(0, 0, 0);
                    updateCameraPosition();
                  } else {
                    setCameraView('follow');
                  }
                }}
                title={isFollowCam ? "Disable follow tracking (free camera)" : "Lock camera to follow and track target"}
                className={`px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1 transition-all ${
                  isFollowCam
                    ? 'bg-cyan-600 text-white shadow shadow-cyan-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                <span>{isFollowCam ? 'Tracking ON' : 'Track Target'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Zoom Controls */}
      <div className="absolute right-3.5 top-16 z-20 flex flex-col gap-1.5 bg-slate-950/85 backdrop-blur-md p-1 border border-white/10 rounded-xl shadow-xl">
        <button
          onClick={() => handleZoom('in')}
          className="p-1.5 hover:bg-white/10 rounded text-slate-300 hover:text-white transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleZoom('out')}
          className="p-1.5 hover:bg-white/10 rounded text-slate-300 hover:text-white transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* SYNC ZOOM ACTIVE ENCOUNTER HUD BANNER */}
      {syncState && syncState.isActive && selectedConjunction && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-slate-950/95 backdrop-blur-md border border-cyan-500/60 px-4 py-2 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center gap-3 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
            <Focus className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="tracking-wide">SYNC ZOOM: TCA WINDOW</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-slate-300 text-[11px] border-l border-white/10 pl-3">
            <span className="text-white font-semibold">{selectedConjunction.objectA?.name}</span>
            <span className="text-slate-500">&harr;</span>
            <span className="text-white font-semibold">{selectedConjunction.objectB?.name}</span>
            <span className="text-red-400 font-bold bg-red-950/70 border border-red-500/40 px-2 py-0.5 rounded">
              {selectedConjunction.minDistanceKm.toFixed(2)} km
            </span>
          </div>
          {onResetSync && (
            <button
              onClick={onResetSync}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[10px] font-sans transition-colors border border-white/10"
              title="Reset view to normal Earth perspective"
            >
              Reset Focus
            </button>
          )}
        </div>
      )}

      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="w-full h-[520px] bg-[#01030a] cursor-grab active:cursor-grabbing" />

      {/* Shift + Scroll Instruction Overlay */}
      {showShiftScrollPrompt && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30 transition-opacity duration-300">
          <div className="bg-slate-950/90 backdrop-blur-xl border border-cyan-500/50 px-4 py-2.5 rounded-2xl shadow-[0_0_35px_rgba(6,182,212,0.35)] flex items-center gap-2.5 text-xs font-mono text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <kbd className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/50 text-cyan-300 font-bold text-[11px] shadow-sm tracking-wider">
              ⇧ Shift
            </kbd>
            <span className="text-slate-400 font-sans text-xs">+</span>
            <span className="text-white font-medium">Scroll to zoom 3D globe</span>
          </div>
        </div>
      )}


      {/* CAUGHT SATELLITE & DEBRIS INTEL HUD (Includes Integrated Velocity Speedometer) */}
      {caughtObject && (
        <div className="absolute bottom-16 left-3.5 z-20 max-w-sm w-full bg-slate-950/95 backdrop-blur-xl border border-cyan-500/30 p-4 rounded-2xl shadow-2xl text-xs font-mono text-slate-200">
          <div className="flex items-start gap-3 mb-2.5">
            {/* Clean Vector Icon Badge */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-slate-900/80 shrink-0 text-slate-300">
              {caughtObject.classification === 'DEBRIS' ? (
                <Trash2 className="w-5 h-5 text-slate-300" />
              ) : caughtObject.classification === 'ROCKET_BODY' ? (
                <Rocket className="w-5 h-5 text-amber-400" />
              ) : (
                <Radio className="w-5 h-5 text-cyan-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    caughtObject.classification === 'DEBRIS'
                      ? 'bg-white'
                      : caughtObject.classification === 'ROCKET_BODY'
                      ? 'bg-amber-400'
                      : 'bg-cyan-400'
                  }`}
                />
                <h4 className="font-bold text-white text-sm font-sans truncate">
                  {caughtObject.name}
                </h4>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                <span>NORAD #{caughtObject.noradId}</span>
                <span>&bull;</span>
                <span className="text-cyan-400 font-bold uppercase">
                  {caughtObject.classification.replace('_', ' ')}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setCaughtObject(null);
                setIsFollowCam(false);
                cameraSphericalRef.current.target.set(0, 0, 0);
                updateCameraPosition();
                if (onSelectObject) onSelectObject(null as any);
              }}
              className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white shrink-0"
              title="Release Target"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/5 p-2.5 rounded-xl border border-white/5 mb-3">
            <div>
              <span className="text-slate-400 text-[10px]">Speed (km/s):</span>
              <div className="font-bold text-cyan-300 text-sm">
                {(caughtObject.speedKmS ?? 7.68).toFixed(2)} km/s
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-[10px]">Speed (Mach):</span>
              <div className="font-bold text-amber-300 text-sm">
                Mach {(((caughtObject.speedKmS ?? 7.68) * 3600) / 1234.8).toFixed(1)}
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-[10px]">Altitude:</span>
              <div className="font-bold text-blue-400">
                {(caughtObject.altitudeKm ?? 0).toFixed(1)} km
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-[10px]">Inclination:</span>
              <div className="font-bold text-slate-200">
                {(caughtObject.inclinationDeg ?? 0).toFixed(1)}&deg;
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onOpenDossier) onOpenDossier(caughtObject);
              }}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-sans font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-500/20"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Full Intelligence Dossier</span>
            </button>
            <button
              onClick={() => {
                if (isFollowCam) {
                  setIsFollowCam(false);
                  cameraSphericalRef.current.target.set(0, 0, 0);
                  updateCameraPosition();
                } else {
                  setCameraView('follow');
                }
              }}
              className={`p-2 rounded-xl border transition-all ${
                isFollowCam
                  ? 'bg-cyan-600 text-white border-cyan-400'
                  : 'bg-white/5 hover:bg-white/10 text-cyan-300 border-white/10'
              }`}
              title={isFollowCam ? "Disable follow tracking (free camera)" : "Lock camera to follow and track target"}
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hover Tooltip */}
      {hoveredObject && tooltipPos && (
        <div
          className="absolute z-30 pointer-events-none bg-slate-950/95 backdrop-blur-xl border border-cyan-500/30 p-2.5 rounded-xl shadow-2xl text-xs font-mono text-slate-200 max-w-xs"
          style={{
            left: Math.min(tooltipPos.x + 15, (mountRef.current?.clientWidth || 800) - 240),
            top: Math.min(tooltipPos.y + 15, (mountRef.current?.clientHeight || 520) - 140)
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-slate-900 border border-white/10 shrink-0">
              {hoveredObject.classification === 'DEBRIS' ? (
                <span className="w-2 h-2 rounded-full bg-white" />
              ) : hoveredObject.classification === 'ROCKET_BODY' ? (
                <Rocket className="w-3 h-3 text-amber-400" />
              ) : (
                <Radio className="w-3 h-3 text-cyan-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white text-xs font-sans truncate">{hoveredObject.name}</div>
              <div className="text-slate-400 text-[9px]">
                NORAD #{hoveredObject.noradId} &bull; {hoveredObject.classification}
              </div>
            </div>
          </div>
          <div className="text-cyan-300 text-[10px] mt-1 font-bold flex items-center justify-between">
            <span>Speed: {(hoveredObject.speedKmS ?? 7.68).toFixed(2)} km/s</span>
            <span className="text-amber-300">
              Mach {(((hoveredObject.speedKmS ?? 7.68) * 3600) / 1234.8).toFixed(1)}
            </span>
          </div>
          <div className="text-blue-400 text-[10px]">
            Alt: {(hoveredObject.altitudeKm ?? 0).toFixed(1)} km &bull; Incl:{' '}
            {(hoveredObject.inclinationDeg ?? 0).toFixed(1)}&deg;
          </div>
          <div className="text-cyan-400 text-[9px] mt-1 font-bold flex items-center gap-1">
            <MousePointerClick className="w-3 h-3 text-cyan-400" />
            <span>Click to catch satellite!</span>
          </div>
        </div>
      )}

      {/* Bottom Control & Simulation Bar */}
      <div className="p-3 bg-slate-900/80 backdrop-blur-xl border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-all flex items-center gap-1.5 font-medium"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-950/70 p-1 border border-white/5 rounded-xl text-[10px]">
            <span className="px-1.5 text-slate-500 uppercase font-bold">Speed:</span>
            {[
              { label: '1x Real', val: 1 },
              { label: '10x', val: 10 },
              { label: '60x', val: 60 },
              { label: '300x', val: 300 }
            ].map((s) => (
              <button
                key={s.val}
                onClick={() => setSimSpeed(s.val)}
                className={`px-2 py-0.5 rounded font-mono font-bold transition-all ${
                  simSpeed === s.val
                    ? 'bg-cyan-600 text-white shadow shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <span>Fine:</span>
            <input
              type="range"
              min="1"
              max="300"
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="w-20 accent-cyan-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
            />
            <span className="text-cyan-300 font-bold w-10">{simSpeed}x</span>
          </div>
        </div>

        {/* Live Target Orbital Speed Readout in Bottom Bar */}
        {inspectedObj && (
          <div className="hidden lg:flex items-center gap-2 bg-slate-950/70 px-3 py-1 rounded-xl border border-cyan-500/20 text-xs font-mono text-cyan-300">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Velocity:</span>
            <span className="font-bold">{currentSpeedKmS.toFixed(2)} km/s</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-bold">Mach {currentMach.toFixed(1)}</span>
          </div>
        )}

        {selectedConjunction ? (
          <div className="flex items-center gap-2 font-mono text-[11px] text-rose-400 font-bold bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20 shadow-inner">
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              Hazard Pair: {(selectedConjunction.minDistanceKm ?? 0).toFixed(2)} km separation
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400">
            <span className="text-cyan-400 font-semibold flex items-center gap-1">
              <MousePointerClick className="w-3.5 h-3.5" />
              Click any satellite to Catch & Inspect
            </span>
            <span className="opacity-40">•</span>
            <span>Drag to Rotate</span>
            <span className="opacity-40">•</span>
            <span>Shift + Scroll to Zoom</span>
          </div>
        )}
      </div>
    </div>
  );
});
