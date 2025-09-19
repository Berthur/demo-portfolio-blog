import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";

/** Used for GLSL syntax highlighting for IDE extensions: */
export const glsl = String.raw;

export const getMaxTextureSize = (): number => {
    const ctx = document.createElement('canvas').getContext('webgl');
    if (!ctx) throw new Error("WebGL not supported");
    return ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
}

/**
 * Custom geometry class that disregards bounding box and sphere calculations, as they rely
 * on the 'positions' attribute, which this particle system does not use. This allows us to
 * define a smaller data type and vector size for this argument, while keeping Three.js happy.
 * A 'position' attribute is required by Three.js, but not used in this particle system.
 * We therefore make it as small as possible, with a vector size of 1 and datatype size of 1 byte.
 */
export class PseudoPointsGeometry extends BufferGeometry {
    constructor(n: number) {
        super();
        this.boundingBox = new Box3();
        this.boundingSphere = new Sphere(new Vector3(), 0);
        this.setAttribute('position', new BufferAttribute(new Uint8Array(n), 1, false));
    }
    override computeBoundingBox(): void { /* Do nothing */ }
    override computeBoundingSphere(): void { /* Do nothing */ }
}

export class FrameTimer {
    private t0: number;
    private running = false;

    constructor(private callback: (delta: number) => void, public delay = 0) { }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.t0 = performance.now();
        requestAnimationFrame(() => this.frame());
    }

    stop(): void {
        this.running = false;
    }

    private frame(): void {
        if (!this.running) return;
        requestAnimationFrame(() => this.frame());
        const t1 = performance.now();
        const delta = t1 - this.t0;
        if (delta < this.delay) return;
        this.callback(delta);
        this.t0 = t1;
    }
}
