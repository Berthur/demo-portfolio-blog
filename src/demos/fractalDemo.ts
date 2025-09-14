import { Uniform, Vector2, WebGLRenderer } from "three";
import { Demo } from "./demo";
import { glsl } from "../utils";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass";
import { ButtonSetting, DropdownSetting, NumberSetting, Settings } from "../settings";

enum FractalType { Mandelbrot, Julia }

export class FractalDemo extends Demo {
    private readonly dimensions = new Vector2();
    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly shaderPass: ShaderPass;
    private readonly composer: EffectComposer;
    private readonly outputPass: OutputPass;
    private dragging = false;
    private pinching = false;

    private zoomTarget = new Vector2(-0.5, 0);
    private zoomRadius = 1.5;

    private needsRender = true;

    constructor(container: HTMLElement) {
        super(container);
        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);

        this.renderer = new WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
        });

        this.shaderPass = new ShaderPass(FractalShader);
        this.outputPass = new OutputPass();

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(this.shaderPass);
        this.composer.addPass(this.outputPass);

        this.shaderPass.material.uniforms.viewSize = new Uniform(this.dimensions);
        this.shaderPass.material.uniforms.zoomTarget = new Uniform(this.zoomTarget);

        this.initializeListeners();

        this.createSettings();
    }

    private pan(d: Vector2): void {
        d.y = -d.y;
        d.multiplyScalar(2 * this.zoomRadius / this.dimensions.y);
        this.zoomTarget.sub(d);
        this.needsRender = true;
    }

    private zoom(target: Vector2, delta: number): void {
        target.divide(this.dimensions);
        target.y = 1 - target.y;
        target.subScalar(0.5).multiplyScalar(2 * this.zoomRadius);
        target.x *= this.dimensions.x / this.dimensions.y;
        target.add(this.zoomTarget);

        this.zoomRadius *= 1 - delta;
        this.zoomTarget.lerp(target, delta);

        this.needsRender = true;
    }

    private updateUniforms(): void {
        this.shaderPass.material.uniforms.zoomRadius.value = this.zoomRadius;
    }

    start(): void {
        (() => this.frame())();
    }

    frame(): void {
        if (this.needsRender) {
            this.updateUniforms();
            this.composer.render();
            this.needsRender = false;
        }
        
        requestAnimationFrame(() => { this.frame() });
    }

    onResize(width: number, height: number): void {
        if (this.dimensions.y) {
            const factor = height / this.dimensions.y;
            this.zoomRadius *= factor;
        }
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(devicePixelRatio);
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(devicePixelRatio);
        this.renderer.getSize(this.dimensions).multiplyScalar(devicePixelRatio);
        this.needsRender = true;
    }

    private initializeListeners(): void {
        this.canvas.addEventListener('mousedown', e => {
            this.dragging = true;
        });
        document.addEventListener('mouseup', e => {
            this.dragging = false;
        });
        const mouseMovement = new Vector2();
        this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            if (this.dragging) {
                mouseMovement.set(e.movementX, e.movementY).multiplyScalar(devicePixelRatio);
                this.pan(mouseMovement);
                e.preventDefault();
                e.stopPropagation();
            }
        });

        const newZoomTarget = new Vector2();
        this.canvas.addEventListener('wheel', (e: WheelEvent) => {
            const zoomDelta = -2.0 * (e.deltaY || 0) / this.dimensions.y * devicePixelRatio;
            newZoomTarget.set(e.offsetX, e.offsetY).multiplyScalar(devicePixelRatio);
            this.zoom(newZoomTarget, zoomDelta);
            e.preventDefault();
            e.stopPropagation();
        }, {passive: false});

        const touchPoint0 = new Vector2();
        const touchPoint1 = new Vector2();
        const dragPoint = new Vector2();
        const prevDragPoint = new Vector2();
        let touchPointDPrev = -1;
        this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
            if (!e.touches || !e.touches.length) return;

            const canvasRect = this.canvas.getBoundingClientRect();
            const touch0 = e.touches[0];
            touchPoint0.set(touch0.clientX - canvasRect.x, touch0.clientY - canvasRect.y).multiplyScalar(devicePixelRatio);

            if (e.touches.length === 1) {
                dragPoint.copy(touchPoint0);
                if (this.dragging) {
                    mouseMovement.copy(dragPoint).sub(prevDragPoint);
                    this.pan(mouseMovement);
                }
                prevDragPoint.copy(dragPoint);
                this.dragging = true;
                this.pinching = false;

            } else {
                const touch1 = e.touches[1];
                touchPoint1.set(touch1.clientX - canvasRect.x, touch1.clientY - canvasRect.y).multiplyScalar(devicePixelRatio);
                const d = touchPoint0.distanceTo(touchPoint1);

                dragPoint.lerpVectors(touchPoint0, touchPoint1, 0.5);
                if (this.pinching) {
                    mouseMovement.copy(dragPoint).sub(prevDragPoint);
                    this.pan(mouseMovement);

                    newZoomTarget.copy(dragPoint);
                    const ratio = touchPointDPrev / d;
                    this.zoom(newZoomTarget, 1 - ratio);
                }

                prevDragPoint.copy(dragPoint);
                touchPointDPrev = d;
                this.pinching = true;
            }
        });
        this.canvas.addEventListener('touchend', (e: TouchEvent) => {
            this.dragging = false;
            this.pinching = false;
        });
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const aaFormatter = (v: number) => {
            return v > 1 ? `${v}x${v}` : 'None';
        };

        const iterations = new NumberSetting('Iterations', 1000, 10, 10000, 10);
        settings.add(iterations);
        iterations.subscribe(v => {
            this.shaderPass.material.defines.MAX_ITERATIONS = v;
            this.shaderPass.material.needsUpdate = true;
            this.needsRender = true;
        });

        const aaSamples = new NumberSetting('Antialiasing', 2, 1, 5, 1, aaFormatter);
        settings.add(aaSamples);
        aaSamples.subscribe(v => {
            this.shaderPass.material.defines.AA = v;
            this.shaderPass.material.needsUpdate = true;
            this.needsRender = true;
        });

        const fractalType = new DropdownSetting('Fractal', 0, [
            'Mandelbrot',
            'Julia (c = -0.4 + 0.6i)',
            'Julia (c = -0.8 + 0.156i)'
        ]);
        settings.add(fractalType);
        fractalType.subscribe(v => {
            const uniforms = this.shaderPass.material.uniforms;
            const defines = this.shaderPass.material.defines;

            switch (v) {
                case 'Mandelbrot':
                    defines.FRACTAL_TYPE = FractalType.Mandelbrot;
                    break;
                case 'Julia (c = -0.4 + 0.6i)':
                    defines.FRACTAL_TYPE = FractalType.Julia;
                    uniforms.juliaC.value.set(-0.4, 0.6);
                    break;
                case 'Julia (c = -0.8 + 0.156i)':
                    defines.FRACTAL_TYPE = FractalType.Julia;
                    uniforms.juliaC.value.set(-0.8, 0.156);
                    break;
                default:
                    defines.FRACTAL_TYPE = FractalType.Mandelbrot;
            }

            this.shaderPass.material.needsUpdate = true;
            this.needsRender = true;
        });

        const expandButton = new ButtonSetting('Expand window', 'Minimize window', false);
        settings.add(expandButton);
        expandButton.subscribe(v => {
            if (v) this.container.classList.add('maximised');
            else this.container.classList.remove('maximised');
            this.needsRender = true;
            settings.setDefaultExpansion();
        });
    }
}

const FractalShader = {
    name: 'FractalShader',
    uniforms: {
        viewSize: { value: new Vector2() },
        zoomTarget: { value: new Vector2() },
        zoomRadius: { value: 0 },
        juliaC: { value: new Vector2() },
    },
    defines: {
        FRACTAL_TYPE: 0,
        MAX_ITERATIONS: 1000,
        AA: 2,
    },
    vertexShader: glsl`
        void main() {
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: glsl`
        precision highp float;

        uniform vec2 viewSize;
        uniform vec2 zoomTarget;
        uniform float zoomRadius;
        uniform vec2 juliaC;

        // Colour scheme by Bernstein polynomials:
        vec3 getFractalColor(int i) {
            float a = float(i + 1) / float(MAX_ITERATIONS + 1); // TODO: Make independent of max iterations?
            float b = 1.0 - a;
            return vec3(
                3.0 *   b * a * a * a,
                20.0 *  b * b * a * a,
                8.5 *   b * b * b * a
            );
        }

        vec2 squareComplex(vec2 c) {
            return vec2(c.x * c.x - c.y * c.y, 2.0 * c.x * c.y);
        }

        vec3 julia(vec2 z, vec2 c, float R) {
            float R2 = R * R;
            int i = 0;
            for (; i<MAX_ITERATIONS; ++i) {
                float r = dot(z, z);
                if (r <= R2) z = squareComplex(z) + c;
                else break;
            }
            return getFractalColor(i);
        }

        vec3 mandelbrot(vec2 c) {
            return julia(vec2(0.0), c, 2.0);
        }

        void main() {
            float aspect = viewSize.x / viewSize.y;

            vec3 color = vec3(0.0);
            for (int i=0; i<AA; ++i) {
                for (int j=0; j<AA; ++j) {

                    vec2 virtualCoord = (float(AA) * vec2(gl_FragCoord) + vec2(i, j)) / (float(AA) * viewSize);
                    virtualCoord -= 0.5;
                    virtualCoord *= 2.0;
                    vec2 c = zoomTarget + zoomRadius * virtualCoord * vec2(aspect, 1.0);

                    #if FRACTAL_TYPE == 0
                        color += mandelbrot(c);
                    #elif FRACTAL_TYPE == 1
                        color += julia(c, juliaC, 2.0);
                    #endif
                }
            }
            color /= float(AA * AA);

            gl_FragColor = vec4(color, 1.0);
        }
    `,
};
