// Performance probe for the Own the Block 3D board. Injected before any page script (`context.addInitScript`).
// Observation only: it never changes application code, it wraps browser APIs to record what happens. The raw records
// are turned into numbers by `metrics.mjs`; the definitions are in `scripts/perf/README.md`.
//
// Needs an UNMINIFIED client build (`--minify false`): the frame scheduler is recognised by the source text of its
// callbacks (`this.advance(` + `pendingFrames` for the rAF callback, `this.requestFrame()` + `timeoutId` for its timer).
// If no scheduler frame is ever seen the driver fails loudly instead of reporting zeros.
(() => {
  if (window.__PROBE__) return;
  const now = () => performance.now();
  const search = location.search;
  const P = window.__PROBE__ = {
    version: 3,
    // Raw records (times are performance.now() milliseconds).
    frames: [], links: [], syncWaits: [], tasks: [], commits: [], loaf: [], longtasks: [], contexts: [], marks: [],
    // B3 gate (08D): context/renderer/visibility events, per-burst program owners, per-replay scene census.
    events: [], owners: [], censusLog: [],
    renderers: [], draws: 0, tris: 0, gpuSupported: null, gpuDisjoint: 0, gpuEnabled: true,
    schedulerFramesSeen: 0, ctxLost: 0, ctxRestored: 0, linkCount: 0, replay: null,
    // `probeLite=1` keeps only what the app itself reports (measures the probe's own overhead by difference).
    lite: /[?&]probeLite=1/.test(search),
  };
  P.mark = name => { P.marks.push({ name, t: now() }); return now(); };
  P.now = now;
  /** The driver labels the replay in progress (for example `soak:12`) so every first-use program carries it. */
  P.setReplay = label => { P.replay = label; };

  // ---- Identities, state snapshots and the events that would explain a program burst (08D step 1) -------------------
  const objIds = new WeakMap();
  let nextObj = 0;
  const idOf = object => {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return null;
    let id = objIds.get(object);
    if (id === undefined) { id = nextObj++; objIds.set(object, id); }
    return id;
  };
  const r3fState = () => {
    const root = P._r3fRoot;
    return root && root.containerInfo && typeof root.containerInfo.getState === 'function' ? root.containerInfo.getState() : null;
  };
  P.event = (kind, detail) => { P.events.push({ t: now(), kind, replay: P.replay, ...detail }); };
  document.addEventListener('visibilitychange', () => P.event('visibility', { state: document.visibilityState }));
  window.addEventListener('focus', () => P.event('focus', {}));
  window.addEventListener('blur', () => P.event('blur', {}));
  let lastRenderer = null;
  let lastCanvas = null;
  /** Records a renderer or canvas identity change (a recreated renderer shows here even without a context event). */
  const checkIdentity = () => {
    const state = r3fState();
    const renderer = state && state.gl;
    if (!renderer) return;
    const canvas = renderer.domElement;
    if (renderer !== lastRenderer) {
      P.event(lastRenderer ? 'renderer-changed' : 'renderer-first', { rendererId: idOf(renderer), canvasId: idOf(canvas) });
      lastRenderer = renderer;
    }
    if (canvas !== lastCanvas) {
      if (lastCanvas) P.event('canvas-changed', { canvasId: idOf(canvas) });
      lastCanvas = canvas;
    }
  };
  /** State at the moment of a link: tier, renderer/context identity, renderer settings, scene fog, loss counters, page state. */
  const stateNow = () => {
    const state = r3fState();
    const renderer = state && state.gl;
    const scene = state && state.scene;
    const fog = scene && scene.fog;
    return {
      replay: P.replay,
      tier: document.documentElement.dataset.graphicsQuality || null,
      rendererId: renderer ? idOf(renderer) : null,
      canvasId: renderer ? idOf(renderer.domElement) : null,
      toneMapping: renderer ? renderer.toneMapping : null,
      exposure: renderer ? renderer.toneMappingExposure : null,
      shadowMap: renderer && renderer.shadowMap ? { on: renderer.shadowMap.enabled, type: renderer.shadowMap.type, auto: renderer.shadowMap.autoUpdate } : null,
      fog: fog ? { type: fog.isFogExp2 ? 'exp2' : 'linear', density: fog.density ?? null, near: fog.near ?? null, far: fog.far ?? null } : null,
      dpr: renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : null,
      ctxLost: P.ctxLost, ctxRestored: P.ctxRestored,
      hidden: document.hidden, focus: document.hasFocus(),
    };
  };
  P.stateNow = stateNow;
  P._sigSeen = new Set();

  /**
   * Which scene objects and materials use the programs linked since the last capture. Runs in a timer right after the render
   * that linked them (three.js assigns `currentProgram` inside the same render), so a burst is attributed once. Programs no
   * scene object owns (shadow depth, post-processing, internal passes) are listed as unowned.
   */
  const reportedPrograms = new WeakSet();
  let capturePending = false;
  const captureOwners = () => {
    capturePending = false;
    const state = r3fState();
    const renderer = state && state.gl;
    const scene = state && state.scene;
    if (!renderer || !scene || !renderer.info || !renderer.info.programs) return;
    const fresh = renderer.info.programs.filter(entry => entry.program && !reportedPrograms.has(entry.program));
    if (fresh.length === 0) return;
    const bySig = new Map();
    for (const entry of fresh) {
      reportedPrograms.add(entry.program);
      const sig = P._programSigs && P._programSigs.get(entry.program);
      bySig.set(entry, { sig: sig ?? null, name: entry.name, cacheKey: String(entry.cacheKey).slice(0, 400), usedTimes: entry.usedTimes, owners: [], ownerCount: 0 });
    }
    scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        const properties = renderer.properties.get(material);
        const record = properties && bySig.get(properties.currentProgram);
        if (!record) continue;
        record.ownerCount += 1;
        if (record.owners.length < 6) {
          record.owners.push({
            object: object.name || null, type: object.type, instanced: Boolean(object.isInstancedMesh), skinned: Boolean(object.isSkinnedMesh),
            material: material.type, materialName: material.name || null, geometry: object.geometry ? { type: object.geometry.type, name: object.geometry.name || null, id: object.geometry.id } : null,
            parents: (() => { const chain = []; for (let parent = object.parent; parent && chain.length < 4; parent = parent.parent) chain.push(parent.name || parent.type); return chain; })(),
          });
        }
      }
    });
    P.owners.push({ t: now(), replay: P.replay, programs: [...bySig.values()] });
  };
  const scheduleOwnerCapture = () => {
    if (capturePending) return;
    capturePending = true;
    setTimeout(captureOwners, 0);
  };
  P.captureOwners = captureOwners;

  /** Scene census for the replay that just ended: objects by type, lights, materials, geometries new since the last census. */
  let knownGeometries = new Set();
  P.census = label => {
    const state = r3fState();
    const scene = state && state.scene;
    if (!scene) return;
    const types = {};
    const lights = {};
    const materials = {};
    const fresh = [];
    const seenGeometries = new Set();
    let objects = 0;
    scene.traverse(object => {
      objects += 1;
      types[object.type] = (types[object.type] ?? 0) + 1;
      if (object.isLight) lights[object.type] = (lights[object.type] ?? 0) + 1;
      if (object.geometry && !seenGeometries.has(object.geometry.id)) {
        seenGeometries.add(object.geometry.id);
        if (!knownGeometries.has(object.geometry.id) && knownGeometries.size > 0) {
          fresh.push({ id: object.geometry.id, type: object.geometry.type, name: object.geometry.name || null, object: object.name || object.type });
        }
      }
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        materials[material.type] = (materials[material.type] ?? 0) + 1;
      }
    });
    knownGeometries = seenGeometries;
    const info = state.gl && state.gl.info;
    P.censusLog.push({
      t: now(), label, objects, types, lights, materials, newSceneGeometries: fresh, sceneGeometries: seenGeometries.size,
      memory: info ? { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : null } : null,
      state: stateNow(),
    });
  };

  // ---- React commits and React tasks -------------------------------------------------------------------------
  // A minimal DevTools hook: React DOM and the @react-three/fiber reconciler both report every commit to it.
  if (!P.lite && !window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    let nextId = 1;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(), supportsFiber: true, isDisabled: false,
      inject(internals) {
        const id = nextId++;
        this.renderers.set(id, internals);
        P.renderers.push({ id, name: internals.rendererPackageName, version: internals.version, bundleType: internals.bundleType });
        return id;
      },
      checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
      onCommitFiberRoot(id, root) {
        const renderer = P.renderers.find(entry => entry.id === id);
        const kind = renderer && renderer.name === '@react-three/fiber' ? 'r3f' : 'dom';
        if (kind === 'r3f') P._r3fRoot = root;
        P.commits.push({ t: now(), kind });
      },
    };
  }

  // React's scheduler runs every render/commit inside a MessageChannel message handler: time each handler.
  if (!P.lite) {
    const portProto = window.MessagePort && window.MessagePort.prototype;
    const nativeOnMessage = portProto && Object.getOwnPropertyDescriptor(portProto, 'onmessage');
    const OriginalMessageChannel = window.MessageChannel;
    if (nativeOnMessage && nativeOnMessage.set && OriginalMessageChannel) {
      const timed = handler => function timedMessageHandler(...args) {
        const start = now();
        const commitsBefore = P.commits.length;
        try {
          return handler.apply(this, args);
        } finally {
          P.tasks.push({ start, dur: now() - start, commits: P.commits.length - commitsBefore });
        }
      };
      window.MessageChannel = function MessageChannelProbe(...args) {
        const channel = new OriginalMessageChannel(...args);
        Object.defineProperty(channel.port1, 'onmessage', {
          configurable: true,
          get() { return nativeOnMessage.get.call(this); },
          set(handler) { nativeOnMessage.set.call(this, typeof handler === 'function' ? timed(handler) : handler); },
        });
        return channel;
      };
      window.MessageChannel.prototype = OriginalMessageChannel.prototype;
    }
  }

  // ---- WebGL: program links, synchronous waits, draw calls, triangles ----------------------------------------
  const ctxIds = new WeakMap();
  let nextCtx = 0;
  const ctxId = gl => {
    let id = ctxIds.get(gl);
    if (id === undefined) {
      id = nextCtx++;
      ctxIds.set(gl, id);
      P.contexts.push({ id, t: now(), w: gl.canvas && gl.canvas.width, h: gl.canvas && gl.canvas.height,
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext });
    }
    return id;
  };
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContextProbe(type, ...rest) {
    const context = originalGetContext.call(this, type, ...rest);
    if (context && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') && !ctxIds.has(context)) {
      const id = ctxId(context);
      P.event('context-created', { ctx: id, canvasId: idOf(this) });
      this.addEventListener('webglcontextlost', () => { P.ctxLost += 1; P.event('context-lost', { ctx: id, canvasId: idOf(this) }); });
      this.addEventListener('webglcontextrestored', () => { P.ctxRestored += 1; P.event('context-restored', { ctx: id, canvasId: idOf(this) }); });
    }
    return context;
  };
  const TRIANGLES = 4;
  const TRIANGLE_STRIP = 5;
  const TRIANGLE_FAN = 6;
  const trianglesOf = (mode, count) => {
    if (mode === TRIANGLES) return count / 3;
    if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) return Math.max(0, count - 2);
    return 0;
  };
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const wrap = (name, make) => {
      const original = proto[name];
      if (typeof original !== 'function' || original.__probe) return;
      const wrapped = make(original);
      wrapped.__probe = true;
      proto[name] = wrapped;
    };
    if (!P.lite) {
      wrap('linkProgram', original => function linkProgramProbe(program) {
        // Identify the program by a hash of its attached shader sources: the same hash linked twice is a re-link.
        let name = '';
        let hash = 0;
        const stages = {};
        const defines = new Set();
        for (const shader of this.getAttachedShaders(program) || []) {
          const text = this.getShaderSource(shader) || '';
          let stageHash = 0;
          for (let index = 0; index < text.length; index += 1) {
            const code = text.charCodeAt(index);
            hash = (Math.imul(hash, 31) + code) | 0;
            stageHash = (Math.imul(stageHash, 31) + code) | 0;
          }
          const isVertex = this.getShaderParameter(shader, this.SHADER_TYPE) === this.VERTEX_SHADER;
          stages[isVertex ? 'vs' : 'fs'] = { hash: stageHash >>> 0, len: text.length };
          const named = text.match(/#define SHADER_NAME (\S+)/);
          const typed = text.match(/#define SHADER_TYPE (\S+)/);
          if (named) name = named[1]; else if (typed && !name) name = `(${typed[1]})`;
          // The defines/prefix that make the variant: every #define NAME[ value] line, hashed and kept as a list.
          for (const line of text.match(/^#define [^\r\n]+/gm) || []) defines.add(line.slice(8).trim());
        }
        const defineList = [...defines].sort();
        let defineHash = 0;
        for (const line of defineList) for (let index = 0; index < line.length; index += 1) defineHash = (Math.imul(defineHash, 31) + line.charCodeAt(index)) | 0;
        const started = now();
        const result = original.call(this, program);
        const dur = now() - started;
        const ctx = ctxId(this);
        checkIdentity();
        const has = prefix => defineList.some(line => line === prefix || line.startsWith(`${prefix} `));
        P.linkCount += 1;
        const record = {
          ctx, t: started, dur, name, hash, sig: `${(stages.vs ? stages.vs.hash : 0).toString(16)}-${(stages.fs ? stages.fs.hash : 0).toString(16)}`,
          vs: stages.vs, fs: stages.fs, defineHash: defineHash >>> 0, nth: P.linkCount, ...stateNow(),
          instanced: has('USE_INSTANCING'), skinned: has('USE_SKINNING'), shadows: has('USE_SHADOWMAP'), fogDefine: has('USE_FOG'),
          toneDefine: defineList.find(line => line.startsWith('TONE_MAPPING')) ?? null,
          lightsDefine: defineList.filter(line => /^NUM_(DIR|POINT|SPOT|HEMI|RECT_AREA)_LIGHTS/.test(line)),
        };
        // The full define list only for the first sighting of a signature in this context (keeps the report small).
        const seenKey = `${ctx}:${record.sig}`;
        if (!P._sigSeen.has(seenKey)) { P._sigSeen.add(seenKey); record.defines = defineList; }
        P.links.push(record);
        (P._programSigs || (P._programSigs = new WeakMap())).set(program, record.sig);
        scheduleOwnerCapture();
        return result;
      });
      for (const name of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog',
        'getActiveUniform', 'getUniformLocation', 'getActiveAttrib', 'getAttribLocation', 'readPixels', 'finish', 'getError']) {
        wrap(name, original => function syncWaitProbe(...args) {
          const started = now();
          const result = original.apply(this, args);
          const duration = now() - started;
          if (duration > 0.3) P.syncWaits.push({ ctx: ctxId(this), fn: name, t: started, dur: duration });
          return result;
        });
      }
      wrap('drawElements', original => function drawElementsProbe(mode, count, ...rest) {
        P.draws += 1; P.tris += trianglesOf(mode, count);
        return original.call(this, mode, count, ...rest);
      });
      wrap('drawArrays', original => function drawArraysProbe(mode, first, count) {
        P.draws += 1; P.tris += trianglesOf(mode, count);
        return original.call(this, mode, first, count);
      });
      wrap('drawElementsInstanced', original => function drawElementsInstancedProbe(mode, count, type, offset, instances) {
        P.draws += 1; P.tris += trianglesOf(mode, count) * instances;
        return original.call(this, mode, count, type, offset, instances);
      });
      wrap('drawArraysInstanced', original => function drawArraysInstancedProbe(mode, first, count, instances) {
        P.draws += 1; P.tris += trianglesOf(mode, count) * instances;
        return original.call(this, mode, first, count, instances);
      });
    }
  }

  // ---- The frame scheduler: rAF callbacks and timers, identified by source text --------------------------------
  const originalRAF = window.requestAnimationFrame.bind(window);
  const originalSetTimeout = window.setTimeout.bind(window);
  const sourceOf = fn => { try { return Function.prototype.toString.call(fn); } catch { return ''; } };
  const isSchedulerFrame = fn => { const text = sourceOf(fn); return text.includes('this.advance(') && text.includes('pendingFrames'); };
  const isSchedulerTimer = fn => { const text = sourceOf(fn); return text.includes('this.requestFrame()') && text.includes('timeoutId'); };
  let inScheduler = false;
  let continued = false;
  const pendingQueries = [];
  const pollGpu = () => {
    const gl = P._mainGl;
    const ext = P._ext;
    if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (disjoint) P.gpuDisjoint += 1;
    while (pendingQueries.length) {
      const { query, record } = pendingQueries[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      record.gpu = disjoint ? null : gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
      pendingQueries.shift();
    }
  };
  P.pollGpu = pollGpu;
  if (!P.lite) {
    window.requestAnimationFrame = function requestAnimationFrameProbe(callback) {
      if (typeof callback !== 'function' || !isSchedulerFrame(callback)) return originalRAF(callback);
      if (inScheduler) continued = true;
      return originalRAF(function schedulerFrameProbe(timestamp) {
        pollGpu();
        checkIdentity();
        const gl = P._mainGl;
        const ext = P._ext;
        let query = null;
        if (gl && ext && P.gpuEnabled) {
          query = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        }
        const drawsBefore = P.draws;
        const trisBefore = P.tris;
        const start = now();
        inScheduler = true;
        continued = false;
        try {
          callback(timestamp);
        } finally {
          inScheduler = false;
          const end = now();
          if (query) gl.endQuery(ext.TIME_ELAPSED_EXT);
          P.schedulerFramesSeen += 1;
          const record = {
            ts: timestamp, start, cpu: end - start, lag: start - timestamp, continued,
            rendered: P.draws > drawsBefore, draws: P.draws - drawsBefore, tris: P.tris - trisBefore, gpu: null,
          };
          P.frames.push(record);
          if (query) pendingQueries.push({ query, record });
        }
      });
    };
    window.setTimeout = function setTimeoutProbe(callback, delay, ...rest) {
      if (typeof callback === 'function' && isSchedulerTimer(callback)) {
        if (inScheduler) continued = true;
        return originalSetTimeout(callback, delay, ...rest);
      }
      return originalSetTimeout(callback, delay, ...rest);
    };
  }

  // ---- Boundary marks: any `performance.mark("otb:...")` (the harness turn start, a future warm-up start/done) is kept with its time ----
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (entry.name.startsWith("otb:")) P.marks.push({ name: entry.name, t: entry.startTime });
    }).observe({ type: "mark", buffered: true });
  } catch { /* unsupported */ }

  // ---- Long animation frames and long tasks ---------------------------------------------------------------------
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        P.loaf.push({ start: entry.startTime, dur: entry.duration, block: entry.blockingDuration });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) P.longtasks.push({ start: entry.startTime, dur: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }

  // ---- Attaching to the scene -------------------------------------------------------------------------------------
  /** Finds the board canvas, enables the GPU timer query when the browser offers it. Call once the board has mounted. */
  P.attachMain = () => {
    const canvas = document.querySelector('.game-scene canvas');
    const gl = canvas && originalGetContext.call(canvas, 'webgl2');
    if (!gl) return 'no-gl';
    P._mainGl = gl;
    P.mainCtx = ctxId(gl);
    P._ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    P.gpuSupported = Boolean(P._ext);
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    P.glRenderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null;
    P.drawingBuffer = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
    return 'ok';
  };

  /**
   * Returns the raw records collected so far and empties them. The driver drains after every replay so the probe's own
   * arrays never inflate the heap measurements of a soak run; the driver concatenates the drained batches.
   */
  P.drain = () => {
    pollGpu();
    const batch = {
      frames: P.frames, links: P.links, syncWaits: P.syncWaits, tasks: P.tasks, commits: P.commits,
      loaf: P.loaf, longtasks: P.longtasks, marks: P.marks,
      events: P.events, owners: P.owners, census: P.censusLog, contexts: P.contexts,
    };
    P.frames = []; P.links = []; P.syncWaits = []; P.tasks = []; P.commits = []; P.loaf = []; P.longtasks = []; P.marks = []; P.events = []; P.owners = []; P.censusLog = []; P.contexts = [];
    return batch;
  };

  /** Renderer resource counters of the board's three.js renderer, read through the R3F store (no app code needed). */
  P.resources = () => {
    const root = P._r3fRoot;
    const state = root && root.containerInfo && typeof root.containerInfo.getState === 'function'
      ? root.containerInfo.getState() : null;
    const info = state && state.gl && state.gl.info;
    if (!info) return null;
    return {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : null,
      dpr: state.viewport ? state.viewport.dpr : null,
    };
  };
})();
