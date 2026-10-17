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
    version: 2,
    // Raw records (times are performance.now() milliseconds).
    frames: [], links: [], syncWaits: [], tasks: [], commits: [], loaf: [], longtasks: [], contexts: [], marks: [],
    renderers: [], draws: 0, tris: 0, gpuSupported: null, gpuDisjoint: 0, gpuEnabled: true,
    schedulerFramesSeen: 0,
    // `probeLite=1` keeps only what the app itself reports (measures the probe's own overhead by difference).
    lite: /[?&]probeLite=1/.test(search),
  };
  P.mark = name => { P.marks.push({ name, t: now() }); return now(); };
  P.now = now;

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
    if (context && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')) ctxId(context);
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
        for (const shader of this.getAttachedShaders(program) || []) {
          const text = this.getShaderSource(shader) || '';
          for (let index = 0; index < text.length; index += 1) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
          const named = text.match(/#define SHADER_NAME (\S+)/);
          const typed = text.match(/#define SHADER_TYPE (\S+)/);
          if (named) name = named[1]; else if (typed && !name) name = `(${typed[1]})`;
        }
        const started = now();
        const result = original.call(this, program);
        P.links.push({ ctx: ctxId(this), t: started, dur: now() - started, name, hash });
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
    };
    P.frames = []; P.links = []; P.syncWaits = []; P.tasks = []; P.commits = []; P.loaf = []; P.longtasks = []; P.marks = [];
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
