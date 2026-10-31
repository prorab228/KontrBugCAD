// meshseal web app — Web Worker.
//
// Loads the Emscripten module once, then repairs each posted STL on this
// off-main-thread context so the UI stays responsive. Forwards the
// pipeline's on_progress stage events to the main thread via postMessage,
// and returns the repaired bytes + RepairResult summary.

/* global importScripts, createMeshseal */
importScripts('meshseal.js');

// MODULARIZE factory. locateFile keeps the .wasm fetch relative to this
// worker's directory regardless of how the page is hosted.
const modulePromise = createMeshseal({
  locateFile: (path) => path,
});

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'repair') return;

  let Module;
  try {
    Module = await modulePromise;
  } catch (e) {
    self.postMessage({ type: 'error', message: 'Failed to load repair engine: ' + e });
    return;
  }

  const t0 = (self.performance && performance.now) ? performance.now() : Date.now();

  try {
    const onProgress = (e) => {
      // e is a plain JS object built by the embind shim.
      self.postMessage({
        type: 'progress',
        stage: e.stage,
        elapsedMs: e.elapsedMs,
        faceCount: e.faceCount,
        vertexCount: e.vertexCount,
        depth: e.depth,
      });
      return true; // MVP: never cancel cooperatively (cancel = terminate worker)
    };

    const res = (msg.format === '3mf')
      ? Module.repair3mf(msg.bytes, onProgress, msg.previewMax || 0)
      : Module.repairStl(msg.bytes, onProgress);

    if (!res || !res.ok) {
      self.postMessage({ type: 'error', message: (res && res.error) || 'repair failed' });
      return;
    }

    const ms = ((self.performance && performance.now) ? performance.now() : Date.now()) - t0;

    const summary = {
      watertight: res.watertight,
      isVolume: res.isVolume,
      components: res.components,
      volumes: res.volumes,
      selfIntersections: res.selfIntersections,
      confidence: res.confidence,
      partialFailure: res.partialFailure,
      inputFaces: res.inputFaces,
      outputFaces: res.outputFaces,
      notes: res.notes,
      stages: res.stages,
      ms,
    };

    // Transfer the output buffer (+ any 3MF preview geometry) back to the
    // main thread, zero-copy.
    const msgOut = { type: 'done', bytes: res.bytes, summary };
    const transfer = [res.bytes.buffer];
    if (res.beforePositions && res.afterPositions) {
      msgOut.beforePositions = res.beforePositions;
      msgOut.afterPositions = res.afterPositions;
      transfer.push(res.beforePositions.buffer, res.afterPositions.buffer);
    }
    self.postMessage(msgOut, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
