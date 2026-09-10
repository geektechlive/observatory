import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * SPIKE — throwaway. A three.js globe to compare against the SVG Globe.
 *
 * Scope is deliberately the visual question plus the one constraint that
 * decides it: the SVG globe's markers are focusable DOM (role="group", not
 * role="img", so assistive tech can reach them). A canvas has no DOM to focus,
 * so this renders a parallel accessible layer over the canvas and keeps it in
 * sync with the projection.
 */

export interface ThreeMarker {
  lat: number
  lon: number
  label: string
  color: string
}

interface GlobeThreeProps {
  size?: number
  markers?: readonly ThreeMarker[]
  autoRotate?: boolean
  /** Equirectangular texture. GIBS is already CSP-allowed for img-src. */
  textureUrl?: string
}

const RADIUS = 1

function latLonToVec3(lat: number, lon: number, r = RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

/** Rim-light / atmosphere. The actual reason to reach for three.js at all. */
const ATMOSPHERE_VERT = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const ATMOSPHERE_FRAG = `
varying vec3 vNormal;
uniform vec3 glowColor;
void main() {
  float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
  gl_FragColor = vec4(glowColor, 1.0) * intensity;
}
`

export function GlobeThree({
  size = 460,
  markers = [],
  autoRotate = true,
  textureUrl = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&FORMAT=image/jpeg&WIDTH=2048&HEIGHT=1024&CRS=EPSG:4326&BBOX=-90,-180,90,180',
}: GlobeThreeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [screenPos, setScreenPos] = useState<{ x: number; y: number; visible: boolean }[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.z = 3.2

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')

    const globe = new THREE.Group()
    scene.add(globe)

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 96, 96),
      new THREE.MeshPhongMaterial({ color: 0x8a5a3a, shininess: 6 }),
    )
    globe.add(sphere)

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      textureUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        const mat = sphere.material
        mat.map = tex
        mat.color.setHex(0xffffff)
        mat.needsUpdate = true
        setStatus('ready')
      },
      undefined,
      () => {
        setStatus('error')
      },
    )

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.16, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0xd98c4a) } },
        vertexShader: ATMOSPHERE_VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
      }),
    )
    scene.add(atmosphere)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const sun = new THREE.DirectionalLight(0xffe6c4, 2.1)
    sun.position.set(3, 1.4, 2.4)
    scene.add(sun)

    // Markers as small emissive spheres pinned to the surface.
    const markerMeshes = markers.map((m) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 12, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(m.color) }),
      )
      mesh.position.copy(latLonToVec3(m.lat, m.lon, RADIUS * 1.012))
      globe.add(mesh)
      return mesh
    })

    let raf = 0
    const world = new THREE.Vector3()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (autoRotate) globe.rotation.y += 0.0016
      renderer.render(scene, camera)

      // Keep the accessible DOM layer aligned with what is drawn.
      setScreenPos(
        markerMeshes.map((mesh) => {
          mesh.getWorldPosition(world)
          const facing = world.clone().normalize().dot(camera.position.clone().normalize()) > 0
          const p = world.clone().project(camera)
          return {
            x: (p.x * 0.5 + 0.5) * size,
            y: (-p.y * 0.5 + 0.5) * size,
            visible: facing,
          }
        }),
      )
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      sphere.geometry.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [size, markers, autoRotate, textureUrl])

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div ref={mountRef} />
      {/*
        The accessibility answer: markers stay real, focusable DOM layered over
        the canvas, positioned from the same projection the renderer used.
      */}
      <div
        role="group"
        aria-label="Three.js globe"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {markers.map((m, i) => {
          const p = screenPos[i]
          if (!p?.visible) return null
          return (
            <button
              key={m.label}
              type="button"
              aria-label={m.label}
              style={{
                position: 'absolute',
                left: p.x - 9,
                top: p.y - 9,
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'transparent',
                pointerEvents: 'auto',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          )
        })}
      </div>
      <p style={{ position: 'absolute', bottom: -22, left: 0, fontSize: 11, opacity: 0.7 }}>
        three.js · texture {status}
      </p>
    </div>
  )
}
