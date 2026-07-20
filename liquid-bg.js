// Holographic Iridescent Liquid Shader
// Flowing liquid with pink/purple/cyan/mint iridescence
// Large open folds, chromatic aberration, specular highlights

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_energy;
  uniform float u_bass;

  // ─── Noise ───────────────────────────────────────────────────────────────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Iridescent color palette
  vec3 iridescence(float angle, float intensity) {
    vec3 col;
    col.r = 0.5 + 0.5 * cos(6.28318 * (angle + 0.0));
    col.g = 0.5 + 0.5 * cos(6.28318 * (angle + 0.33));
    col.b = 0.5 + 0.5 * cos(6.28318 * (angle + 0.67));
    col = mix(col, vec3(col.r * 0.8 + col.b * 0.2, col.g * 0.6 + col.b * 0.4, col.b * 0.7 + col.r * 0.3), 0.4);
    return col * intensity;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = uv * vec2(aspect, 1.0);

    float t = u_time * 0.08;
    float energy = u_energy;
    float bass = u_bass;

    // ═══════════════════════════════════════════════════════════════════════════
    // DOMAIN WARPING - large open flow
    // ═══════════════════════════════════════════════════════════════════════════
    vec2 warp1 = vec2(
      snoise(p * 0.5 + vec2(t * 0.2, t * 0.15)),
      snoise(p * 0.5 + vec2(t * 0.15, -t * 0.2) + 50.0)
    ) * 0.3;

    vec2 warp2 = vec2(
      snoise((p + warp1 * 0.25) * 1.2 + vec2(-t * 0.15, t * 0.1) + 100.0),
      snoise((p + warp1 * 0.25) * 1.2 + vec2(t * 0.1, t * 0.15) + 150.0)
    ) * 0.12;

    vec2 warp3 = vec2(
      snoise((p + warp1 * 0.15 + warp2 * 0.2) * 2.2 + vec2(t * 0.1, -t * 0.08) + 200.0),
      snoise((p + warp1 * 0.15 + warp2 * 0.2) * 2.2 + vec2(-t * 0.08, t * 0.1) + 250.0)
    ) * 0.04;

    vec2 energyWarp = vec2(
      snoise(p * 4.0 + vec2(t * 1.2, t * 0.8) + 300.0),
      snoise(p * 4.0 + vec2(t * 0.9, -t * 1.1) + 350.0)
    ) * 0.06 * energy;

    vec2 bassWarp = vec2(
      snoise(p * 5.0 + vec2(t * 3.0, 0.0) + 400.0),
      snoise(p * 5.0 + vec2(0.0, t * 3.0) + 450.0)
    ) * 0.08 * bass;

    vec2 totalWarp = warp1 + warp2 + warp3 + energyWarp + bassWarp;
    vec2 warpedP = p + totalWarp;

    // ═══════════════════════════════════════════════════════════════════════════
    // DISPLACEMENT FIELD
    // ═══════════════════════════════════════════════════════════════════════════
    float disp = snoise(warpedP * 0.8 + vec2(t * 0.1, t * 0.08)) * 0.3
              + snoise(warpedP * 1.6 + vec2(-t * 0.08, t * 0.1) + 30.0) * 0.15;

    // ═══════════════════════════════════════════════════════════════════════════
    // SURFACE NORMAL
    // ═══════════════════════════════════════════════════════════════════════════
    float eps = 0.004;
    vec2 wpX = warpedP + vec2(eps, 0.0);
    vec2 wpY = warpedP + vec2(0.0, eps);

    float dispX = snoise(wpX * 0.8 + vec2(t * 0.1, t * 0.08)) * 0.3
               + snoise(wpX * 1.6 + vec2(-t * 0.08, t * 0.1) + 30.0) * 0.15;

    float dispY = snoise(wpY * 0.8 + vec2(t * 0.1, t * 0.08)) * 0.3
               + snoise(wpY * 1.6 + vec2(-t * 0.08, t * 0.1) + 30.0) * 0.15;

    vec3 normal = normalize(vec3(
      -(dispX - disp) / eps * 0.5,
      -(dispY - disp) / eps * 0.5,
      1.0
    ));

    // ═══════════════════════════════════════════════════════════════════════════
    // LIGHTING
    // ═══════════════════════════════════════════════════════════════════════════
    vec3 viewDir = vec3(0.0, 0.0, 1.0);

    vec3 L1 = normalize(vec3(-0.4, 0.6, 0.8));
    vec3 L2 = normalize(vec3(0.5, 0.5, 0.7));
    vec3 L3 = normalize(vec3(0.1, -0.5, 0.6));

    float diff1 = max(dot(normal, L1), 0.0);
    float diff2 = max(dot(normal, L2), 0.0);
    float diff3 = max(dot(normal, L3), 0.0);
    float totalDiff = diff1 * 0.45 + diff2 * 0.35 + diff3 * 0.2;

    vec3 H1 = normalize(viewDir + L1);
    vec3 H2 = normalize(viewDir + L2);
    vec3 H3 = normalize(viewDir + L3);

    float spec1 = pow(max(dot(normal, H1), 0.0), 80.0);
    float spec2 = pow(max(dot(normal, H2), 0.0), 80.0);
    float spec3 = pow(max(dot(normal, H3), 0.0), 60.0);

    float sheen1 = pow(max(dot(normal, H1), 0.0), 12.0);
    float sheen2 = pow(max(dot(normal, H2), 0.0), 12.0);
    float sheen3 = pow(max(dot(normal, H3), 0.0), 10.0);

    float totalSpec = spec1 * 0.9 + spec2 * 0.7 + spec3 * 0.4;
    float totalSheen = sheen1 * 0.35 + sheen2 * 0.3 + sheen3 * 0.2;

    float NdotV = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.0);

    // ═══════════════════════════════════════════════════════════════════════════
    // IRIDESCENT COLOR
    // ═══════════════════════════════════════════════════════════════════════════
    float iriAngle1 = atan(normal.y, normal.x) * 0.3 + disp * 1.5 + t * 0.1;
    float iriAngle2 = dot(normal.xy, vec2(0.7, 0.7)) * 2.0 + totalWarp.x * 3.0 + t * 0.05;

    vec3 iriColor1 = iridescence(iriAngle1, 1.0);
    vec3 iriColor2 = iridescence(iriAngle2 + 0.5, 1.0);

    float iriBlend = smoothstep(-0.2, 0.3, disp);
    vec3 iriColor = mix(iriColor1, iriColor2, iriBlend);

    // Palette: pastel tones
    vec3 palettePink = vec3(0.92, 0.82, 0.88);
    vec3 paletteLavender = vec3(0.85, 0.82, 0.94);
    vec3 paletteCyan = vec3(0.80, 0.91, 0.93);
    vec3 paletteWarm = vec3(0.94, 0.88, 0.82);

    float palMix1 = snoise(warpedP * 1.5 + vec2(t * 0.06, 0.0)) * 0.5 + 0.5;
    float palMix2 = snoise(warpedP * 2.0 + vec2(0.0, t * 0.05) + 500.0) * 0.5 + 0.5;

    vec3 basePalette = mix(
      mix(palettePink, paletteCyan, palMix1),
      mix(paletteLavender, paletteWarm, palMix2),
      smoothstep(0.3, 0.7, palMix1 * palMix2 + 0.2)
    );

    vec3 finalIri = mix(basePalette, iriColor, 0.4);

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPOSITE
    // ═══════════════════════════════════════════════════════════════════════════

    // Base: iridescent color - slightly darker than before
    vec3 color = mix(vec3(0.68), finalIri, 0.45) * (0.7 + totalDiff * 0.15);

    // Sheen
    color += finalIri * totalSheen * 0.6;

    // Sharp specular (white)
    vec3 specColor = mix(vec3(1.0), finalIri, 0.2);
    color += specColor * totalSpec;

    // Fresnel
    color += mix(finalIri, vec3(1.0), 0.6) * fresnel * 0.35;

    // ═══════════════════════════════════════════════════════════════════════════
    // CHROMATIC ABERRATION
    // ═══════════════════════════════════════════════════════════════════════════
    float curvature = length(vec2(dispX - disp, dispY - disp)) / eps;
    float caIntensity = smoothstep(0.3, 1.5, curvature) * 0.2;

    float caAngle = atan(normal.y, normal.x);
    vec3 caShift = vec3(
      0.5 + 0.5 * cos(caAngle),
      0.5 + 0.5 * cos(caAngle + 2.094),
      0.5 + 0.5 * cos(caAngle + 4.189)
    );
    color += caShift * caIntensity;

    // ═══════════════════════════════════════════════════════════════════════════
    // VALLEY DARKENING
    // ═══════════════════════════════════════════════════════════════════════════
    float ao = smoothstep(-0.3, 0.1, disp);
    color *= (0.87 + ao * 0.13);

    // ═══════════════════════════════════════════════════════════════════════════
    // SPARKLES
    // ═══════════════════════════════════════════════════════════════════════════
    vec2 sparkleGrid = floor(gl_FragCoord.xy / 2.5);
    float sparkleHash = hash(sparkleGrid + floor(t * 0.4));
    float sparkleThreshold = 0.994 - energy * 0.002;
    if (sparkleHash > sparkleThreshold) {
      float sparklePhase = hash(sparkleGrid * 1.7) * 6.28;
      float sparkle = pow(sin(u_time * 4.0 + sparklePhase) * 0.5 + 0.5, 10.0);
      sparkle *= smoothstep(0.2, 0.5, totalDiff + totalSheen);
      color += vec3(1.0, 0.97, 0.95) * sparkle * 2.0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BASS RESPONSE
    // ═══════════════════════════════════════════════════════════════════════════
    float ridgeMask = smoothstep(0.1, 0.4, disp);
    color += finalIri * ridgeMask * bass * 0.25;
    color *= (1.0 + bass * 0.1);

    // ═══════════════════════════════════════════════════════════════════════════
    // TONE MAPPING
    // ═══════════════════════════════════════════════════════════════════════════
    // Slightly darker than before
    // Reduce contrast: compress range toward midtones
    color = mix(vec3(0.5), color, 0.75);
    color = pow(color, vec3(0.95));

    gl_FragColor = vec4(color, 1.0);
  }
`;

class LiquidBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: 'low-power'
    });
    if (!this.gl) {
      console.error('WebGL not available');
      return;
    }

    // Fixed energy/bass for a constant smooth animation
    this.energy = 0.35;
    this.targetEnergy = 0.35;
    this.bass = 0.0;
    this.targetBass = 0.0;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.animId = null;
    this.isFrozen = false;
    // Render at reduced resolution for smooth performance on Retina displays
    this.renderScale = 0.5;

    // Re-render a single frame on window resize when frozen (static mode)
    this._onResize = () => {
      if (this.isFrozen) {
        this._renderOneFrame();
      }
    };
    window.addEventListener('resize', this._onResize);

    this.init();
  }

  init() {
    const gl = this.gl;

    const vs = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(this.program));
      return;
    }

    gl.useProgram(this.program);

    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uTime = gl.getUniformLocation(this.program, 'u_time');
    this.uEnergy = gl.getUniformLocation(this.program, 'u_energy');
    this.uBass = gl.getUniformLocation(this.program, 'u_bass');

    this.resize();
    this.render();
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  resize() {
    const dpr = (window.devicePixelRatio || 1) * this.renderScale;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  setEnergy(val) { /* no-op: animation is constant */ }
  setBass(val) { /* no-op: animation is constant */ }

  setPlaying(playing) {
    // Animation stays the same whether playing or stopped
  }

  pulse() {
    // No-op: animation is constant
  }

  render() {
    this.resize();
    const gl = this.gl;

    // Smooth interpolation with frame-rate independent lerp
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000.0, 0.1); // cap at 100ms
    this.lastFrameTime = now;
    const lerpFactor = 1.0 - Math.pow(0.001, dt);

    this.energy += (this.targetEnergy - this.energy) * lerpFactor;
    this.bass += (this.targetBass - this.bass) * lerpFactor * 1.5;

    const elapsed = (now - this.startTime) / 1000.0;

    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, elapsed);
    gl.uniform1f(this.uEnergy, this.energy);
    gl.uniform1f(this.uBass, this.bass);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.animId = requestAnimationFrame(() => this.render());
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  start() {
    this.isFrozen = false;
    if (!this.animId) {
      this.lastFrameTime = performance.now();
      this.render();
    }
  }

  freeze() {
    // Render one final frame then stop animation loop
    this.isFrozen = true;
    this._renderOneFrame();
    this.stop();
  }

  _renderOneFrame() {
    this.resize();
    const gl = this.gl;
    const now = performance.now();
    const elapsed = (now - this.startTime) / 1000.0;
    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, elapsed);
    gl.uniform1f(this.uEnergy, this.energy);
    gl.uniform1f(this.uBass, this.bass);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    // Remove resize listener
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    // Release WebGL resources
    const gl = this.gl;
    if (gl && this.program) {
      const shaders = gl.getAttachedShaders(this.program);
      if (shaders) {
        shaders.forEach(shader => {
          gl.detachShader(this.program, shader);
          gl.deleteShader(shader);
        });
      }
      gl.deleteProgram(this.program);
      this.program = null;
      // Delete buffer
      const buf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      if (buf) gl.deleteBuffer(buf);
    }
    // Lose context to free GPU memory
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    this.gl = null;
  }
}

window.LiquidBackground = LiquidBackground;
