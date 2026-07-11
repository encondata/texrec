// TexRec motion layer — three.js bubble fields + GSAP scroll effects.
// Degrades gracefully: every effect checks for its library and for reduced-motion.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // ---------------- three.js: rising bubbles in hero panels ----------------
  if (window.THREE) {
    $$('[data-bubbles]').forEach(host => {
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '0',
      });
      host.prepend(canvas);

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      camera.position.z = 30;
      const scene = new THREE.Scene();

      // soft round sprite
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,255,255,.9)');
      grad.addColorStop(0.65, 'rgba(255,255,255,.25)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
      // bubble rim highlight
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke();
      const sprite = new THREE.CanvasTexture(c);

      const N = 110;
      const SPREAD_X = 60, SPREAD_Y = 34, SPREAD_Z = 18;
      const pos = new Float32Array(N * 3);
      const speed = [], phase = [], amp = [];
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * SPREAD_X;
        pos[i * 3 + 1] = (Math.random() - 0.5) * SPREAD_Y;
        pos[i * 3 + 2] = (Math.random() - 0.5) * SPREAD_Z;
        speed.push(0.014 + Math.random() * 0.035);
        phase.push(Math.random() * Math.PI * 2);
        amp.push(0.2 + Math.random() * 0.9);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: 1.5, map: sprite, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      scene.add(new THREE.Points(geo, mat));

      let running = false, t = 0;
      function frame() {
        if (!running) return;
        t += 0.016;
        const p = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
          p[i * 3 + 1] += speed[i];                                   // rise
          p[i * 3] += Math.sin(t * 1.4 + phase[i]) * 0.004 * amp[i];  // wobble
          if (p[i * 3 + 1] > SPREAD_Y / 2 + 2) {                      // recycle at top
            p[i * 3 + 1] = -SPREAD_Y / 2 - 2;
            p[i * 3] = (Math.random() - 0.5) * SPREAD_X;
          }
        }
        geo.attributes.position.needsUpdate = true;
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
      }

      function resize() {
        const { clientWidth: w, clientHeight: h } = host;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      resize();
      new ResizeObserver(resize).observe(host);

      // only animate while on screen
      new IntersectionObserver(([e]) => {
        const was = running;
        running = e.isIntersecting;
        if (running && !was) frame();
      }).observe(host);
    });
  }

  // ---------------- GSAP: count-ups + parallax drift ----------------
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    document.body.classList.add('has-gsap');

    // stat count-up
    $$('[data-count]').forEach(el => {
      const end = +el.dataset.count;
      const suffix = el.dataset.suffix || '';
      const obj = { v: 0 };
      gsap.to(obj, {
        v: end, duration: 1.8, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString('en-US') + suffix; },
      });
    });

    // gentle parallax on hero copy and decorative art panels
    $$('.hero .inner, .page-hero .wrap').forEach(el => {
      gsap.to(el, {
        yPercent: 12, ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top top', end: 'bottom top', scrub: true },
      });
    });
    $$('.split .art').forEach(el => {
      gsap.fromTo(el, { y: 40 }, {
        y: -40, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }
})();
