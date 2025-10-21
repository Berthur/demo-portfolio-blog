import { DataTexture, DoubleSide, FloatType, GLSL3, Mesh, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Uniform, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { Demo } from "./demo";
import { ButtonSetting, Settings } from "../settings";
import { glsl, } from "../utils";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export class ClothDemo extends Demo {
    private readonly dimensions = new Vector2(1, 1);
    private readonly clothDimensions = new Vector2(10, 10);
    private mousePos = new Vector2();

    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private currStateTarget: WebGLRenderTarget;
    private nextStateTarget: WebGLRenderTarget;
    private readonly scene: Scene;
    private readonly camera: PerspectiveCamera;
    private readonly mesh: Mesh;
    private readonly material: ShaderMaterial;
    private readonly computePass: ShaderPass;
    private readonly composer: EffectComposer;

    private texture1: DataTexture;
    private texture2: DataTexture;

    constructor(container: HTMLElement) {
        super(container);
        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);

        this.canvas.addEventListener('pointermove', e => {
            this.mousePos.set(e.offsetX, e.offsetY).multiplyScalar(devicePixelRatio);
        });

        this.renderer = new WebGLRenderer({ canvas: this.canvas });
        this.currStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y);
        this.nextStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y);

        this.scene = new Scene();
        this.camera = new PerspectiveCamera(90);
        this.camera.position.set(0, 0, 1);
        const controls = new OrbitControls(this.camera, this.canvas);
        controls.zoomToCursor = true;

        this.initializeTextures();

        this.computePass = new ShaderPass(ComputeShader, 'prevState');
        this.computePass.uniforms.mousePos = new Uniform(this.mousePos);
        const renderPass = new RenderPass(this.scene, this.camera);
        renderPass.renderToScreen = true;
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(this.computePass);
        this.composer.addPass(renderPass);

        this.computePass.material.uniforms.viewSize = new Uniform(this.dimensions);
        this.computePass.material.uniforms.clothDimensions = new Uniform(this.clothDimensions);

        this.material = new ShaderMaterial({
            transparent: true,
            glslVersion: GLSL3,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: DoubleSide,
        });
        this.material.uniforms.viewSize = new Uniform(this.dimensions);
        this.material.uniforms.clothDimensions = new Uniform(this.clothDimensions);
        this.material.uniforms.currState = new Uniform(null);
        this.material.uniforms.delta = new Uniform(0);

        this.mesh = new Mesh();
        this.mesh.material = this.material;
        this.mesh.geometry = new PlaneGeometry(1, 1, this.clothDimensions.x - 1, this.clothDimensions.y - 1);
        this.scene.add(this.mesh);

        this.createSettings();
    }

    onResize(width: number, height: number) {
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(devicePixelRatio);
        this.renderer.getSize(this.dimensions).multiplyScalar(devicePixelRatio);

        // TODO: Update camera aspect
    }
    
    private initializeTextures(): void {
        const n = this.clothDimensions.x * this.clothDimensions.y;
        const data = new Float32Array(4 * n);

        for (let i=0; i<n; ++i) {
            data[4*i    ] = 2 * (i % this.clothDimensions.x) / this.clothDimensions.x - 1;
            data[4*i + 1] = 2 * ~~(i / this.clothDimensions.x) / this.clothDimensions.y - 1;
        }

        this.texture1 = new DataTexture(data, this.clothDimensions.x, this.clothDimensions.y);
        this.texture1.type = FloatType;
        this.texture1.format = RGBAFormat;
        this.texture1.needsUpdate = true;

        this.texture2 = this.texture1.clone();

        this.currStateTarget.texture = this.texture1;
        this.nextStateTarget.texture = this.texture2;
    }

    private updateUniforms(delta: number): void {
        this.computePass.uniforms.delta.value = delta;
        this.material.uniforms.currState.value = this.nextStateTarget.texture;
    }

    start(): void {
        (() => this.frame())();
    }

    restart(): void {
        console.log("Restarting!");

        this.texture1.dispose();
        this.texture2.dispose();
        this.currStateTarget.dispose();
        this.nextStateTarget.dispose();
        this.currStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y);
        this.nextStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y);
        this.initializeTextures();

        // TODO: Restart mesh geometry
    }

    private t0 = 0;
    frame(): void {
        const t1 = performance.now();
        const delta = Math.min(t1 - this.t0, 200);
        this.t0 = t1;

        const tmp = this.currStateTarget;
        this.currStateTarget = this.nextStateTarget;
        this.nextStateTarget = tmp;

        this.updateUniforms(delta);

        this.composer.readBuffer = this.currStateTarget;
        this.composer.writeBuffer = this.nextStateTarget;
        this.composer.render();
        
        requestAnimationFrame(() => { this.frame() });
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const expandButton = new ButtonSetting('Expand window', 'Minimize window', false);
        settings.add(expandButton);
        expandButton.subscribe(v => {
            if (v) this.container.classList.add('maximised');
            else this.container.classList.remove('maximised');
            settings.setDefaultExpansion();
        });
    }
}

const ComputeShader = {
    name: 'ComputeShader',
    uniforms: {
        viewSize: { value: new Vector2(1, 1) },
        delta: { value: 0 },
        damping: { value: 1 },
        prevState: { value: null },
        clothDimensions: { value: new Vector2(1, 1) },
    },
    defines: {
        BORDERS_REFLECT: false,
    },
    vertexShader: glsl`
        precision highp float;

        void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: glsl`
        precision highp float;

        #define SQRT_2 1.4142135623730951

        uniform vec2 viewSize;
        uniform ivec2 clothDimensions;
        uniform float delta;
        uniform float damping;
        uniform vec2 mousePos;
        uniform sampler2D prevState;

        void main() {
            ivec2 fragCoord = ivec2(gl_FragCoord.xy);
            float maxViewSize = max(viewSize.x, viewSize.y);

            vec2 corrMousePos = 2.0 * mousePos - viewSize;
            corrMousePos.y = -corrMousePos.y;
            corrMousePos /= maxViewSize;

            vec4 state = texelFetch(prevState, fragCoord, 0);
            vec2 p = state.rg + vec2(0.0);
            vec2 v = state.ba;
            float d = 0.001 * delta;

            vec2 f = vec2(0.0, -0.3);

            for (int j=-1; j<=1; ++j) for (int i=-1; i<=1; ++i) if (!(i == 0 && j == 0)) {
                ivec2 coords = fragCoord + ivec2(i, j);
                if (coords.x >= 0 && coords.x < clothDimensions.x && coords.y >= 0 && coords.y < clothDimensions.y) {
                    vec4 state2 = texelFetch(prevState, coords, 0);
                    vec2 dir = state2.rg - p;
                    float r = length(dir);
                    dir /= r;
                    float restR = 0.2;
                    float k = 20.0;
                    //if (bool(i ^ j)) restR *= SQRT_2;
                    f += k * (r - restR) * dir;
                }
            }

            vec2 a = f;
            v += d * a;
            v *= max(0.5, (1.0 - d * damping));
            p += d * v;

            // Hang from upper corners:
            if (fragCoord.y == clothDimensions.y - 1 && (fragCoord.x == 0 || fragCoord.x == clothDimensions.x - 1)) p = state.rg;

            gl_FragColor = vec4(p, v);
        }
    `,
};

const vertexShader = glsl`
    precision highp float;

    uniform vec2 viewSize;
    uniform ivec2 clothDimensions;
    uniform sampler2D currState;

    vec2 aspectCorrectInv(vec2 v, float aspect) {
        if (aspect < 1.0) v.x /= aspect;
        else v.y *= aspect;
        return v;
    }

    void main() {
        float aspect = viewSize.x / viewSize.y;

        ivec2 coord = ivec2(gl_VertexID % clothDimensions.x, gl_VertexID / clothDimensions.x);
        vec4 state = texelFetch(currState, coord, 0);
        state.rg = aspectCorrectInv(state.rg, aspect);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(state.rg, 0.0, 1.0);
    }
`;

const fragmentShader = glsl`
    precision highp float;

    out vec4 fragColor;

    void main() {
        fragColor = vec4(0.0, 0.3, 0.1, 1.0);
    }
`;
