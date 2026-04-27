import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

export interface CanvasPlayerProps {
  videoSrc: string;
  backgroundSrc: string;
  padding: number;
  rounding: number;
  onReady?: (video: HTMLVideoElement) => void;
}

export interface CanvasPlayerHandle {
  video: HTMLVideoElement | null;
}

export const CanvasPlayer = forwardRef<CanvasPlayerHandle, CanvasPlayerProps>(
  function CanvasPlayer(
    { videoSrc, backgroundSrc, padding, rounding, onReady },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const paddingRef = useRef(padding);
    const roundingRef = useRef(rounding);
    paddingRef.current = padding;
    roundingRef.current = rounding;

    useImperativeHandle(ref, () => ({ video: videoRef.current }), []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const video = document.createElement("video");
      video.src = videoSrc;
      video.playsInline = true;
      video.preload = "auto";
      video.muted = false;
      video.crossOrigin = "anonymous";
      videoRef.current = video;
      onReady?.(video);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      const bgTexture = new THREE.TextureLoader().load(backgroundSrc, (tex) => {
        const img = tex.image as HTMLImageElement | undefined;
        if (img) bgMaterial.uniforms.uImage.value.set(img.width, img.height);
      });
      bgTexture.colorSpace = THREE.SRGBColorSpace;
      const bgGeometry = new THREE.PlaneGeometry(2, 2);
      const bgMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: bgTexture },
          uViewport: { value: new THREE.Vector2(1, 1) },
          uImage: { value: new THREE.Vector2(16, 9) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uTex;
          uniform vec2 uViewport;
          uniform vec2 uImage;
          varying vec2 vUv;
          void main() {
            float viewportRatio = uViewport.x / uViewport.y;
            float imageRatio = uImage.x / uImage.y;
            vec2 uv = vUv;
            if (viewportRatio > imageRatio) {
              float scale = imageRatio / viewportRatio;
              uv.y = (uv.y - 0.5) * scale + 0.5;
            } else {
              float scale = viewportRatio / imageRatio;
              uv.x = (uv.x - 0.5) * scale + 0.5;
            }
            gl_FragColor = texture2D(uTex, uv);
          }
        `,
      });
      const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
      scene.add(bgMesh);

      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;

      const videoGeometry = new THREE.PlaneGeometry(1, 1);
      const videoMaterial = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTex: { value: videoTexture },
          uSize: { value: new THREE.Vector2(1, 1) },
          uRadius: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uTex;
          uniform vec2 uSize;
          uniform float uRadius;
          varying vec2 vUv;

          float sdRoundRect(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b + r;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
          }

          void main() {
            vec4 color = texture2D(uTex, vUv);
            vec2 pixel = (vUv - 0.5) * uSize;
            vec2 halfSize = uSize * 0.5;
            float d = sdRoundRect(pixel, halfSize, uRadius);
            float aa = 1.0 - smoothstep(-1.0, 1.0, d);
            gl_FragColor = vec4(color.rgb, color.a * aa);
          }
        `,
      });
      const videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
      scene.add(videoMesh);

      let viewportW = 1;
      let viewportH = 1;

      function resize() {
        const rect = container!.getBoundingClientRect();
        viewportW = Math.max(1, Math.floor(rect.width));
        viewportH = Math.max(1, Math.floor(rect.height));
        renderer.setSize(viewportW, viewportH, false);

        camera.left = -viewportW / 2;
        camera.right = viewportW / 2;
        camera.top = viewportH / 2;
        camera.bottom = -viewportH / 2;
        camera.updateProjectionMatrix();

        bgMaterial.uniforms.uViewport.value.set(viewportW, viewportH);

        layoutVideo();
      }

      function layoutVideo() {
        const vw = video.videoWidth || 16;
        const vh = video.videoHeight || 9;
        const videoAspect = vw / vh;

        const pad =
          (paddingRef.current / 100) * Math.min(viewportW, viewportH) * 0.6;
        const availW = Math.max(10, viewportW - pad * 2);
        const availH = Math.max(10, viewportH - pad * 2);

        let w = availW;
        let h = availW / videoAspect;
        if (h > availH) {
          h = availH;
          w = availH * videoAspect;
        }

        videoMesh.scale.set(w, h, 1);
        videoMaterial.uniforms.uSize.value.set(w, h);
        videoMaterial.uniforms.uRadius.value =
          (roundingRef.current / 100) * (Math.min(w, h) / 2);
      }

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(container);

      video.addEventListener("loadedmetadata", layoutVideo);

      let raf = 0;
      let lastPad = -1;
      let lastRound = -1;
      function tick() {
        if (
          paddingRef.current !== lastPad ||
          roundingRef.current !== lastRound
        ) {
          lastPad = paddingRef.current;
          lastRound = roundingRef.current;
          layoutVideo();
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      }
      tick();

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        video.pause();
        video.removeAttribute("src");
        video.load();
        videoTexture.dispose();
        bgTexture.dispose();
        videoGeometry.dispose();
        videoMaterial.dispose();
        bgGeometry.dispose();
        bgMaterial.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        videoRef.current = null;
      };
    }, [videoSrc, backgroundSrc, onReady]);

    return <div ref={containerRef} className="h-full w-full" />;
  },
);
