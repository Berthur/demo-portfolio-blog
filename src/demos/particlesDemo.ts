import { Color, DataTexture, FloatType, GLSL3, OrthographicCamera, Points, RawShaderMaterial, RGBAFormat, Scene, Uniform, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { Demo } from "./demo";
import { BooleanSetting, ButtonSetting, ColorSchemeSetting, NumberSetting, Settings } from "../settings";
import { glsl, getMaxTextureSize, PseudoPointsGeometry } from "../utils";

const MAX_TEXTURE_DIM = getMaxTextureSize();

export class ParticlesDemo extends Demo {
    private readonly dimensions = new Vector2(1, 1);
    private mousePos = new Vector2();

    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private currStateTarget: WebGLRenderTarget;
    private nextStateTarget: WebGLRenderTarget;
    private readonly scene: Scene;
    private readonly camera: OrthographicCamera;
    private readonly points: Points;
    private readonly material: RawShaderMaterial;
    private readonly computePass: ShaderPass;
    private readonly composer: EffectComposer;

    private texture1: DataTexture;
    private texture2: DataTexture;

    constructor(container: HTMLElement, private n: number) {
        super(container);
        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);

        this.canvas.addEventListener('pointermove', e => {
            this.mousePos.set(e.offsetX, e.offsetY);
        });

        const texHeight = Math.ceil(this.n / MAX_TEXTURE_DIM);
        this.renderer = new WebGLRenderer({ canvas: this.canvas });
        this.currStateTarget = new WebGLRenderTarget(MAX_TEXTURE_DIM, texHeight);
        this.nextStateTarget = new WebGLRenderTarget(MAX_TEXTURE_DIM, texHeight);

        this.scene = new Scene();
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.camera.position.set(0, 0, 1);

        this.initializeTextures();

        this.computePass = new ShaderPass(ParticleShader, 'nextState');
        this.computePass.uniforms.mousePos = new Uniform(this.mousePos);
        const renderPass = new RenderPass(this.scene, this.camera);
        renderPass.renderToScreen = true;
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(this.computePass);
        this.composer.addPass(renderPass);

        this.material = new RawShaderMaterial({
            transparent: true,
            glslVersion: GLSL3,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
        });
        this.material.uniforms.viewSize = new Uniform(this.dimensions);
        this.material.uniforms.texWidth = new Uniform(MAX_TEXTURE_DIM);
        this.material.uniforms.pointSize = new Uniform(1);
        this.material.uniforms.pointState = new Uniform(null);
        this.material.uniforms.delta = new Uniform(0);
        this.material.uniforms.opacity = new Uniform(0.7);
        this.material.defines.SPHERE_PARTICLES = false;

        this.material.uniforms.c0 = new Uniform(new Color().setRGB(0.0, 0.3, 0.0));
        this.material.uniforms.c1 = new Uniform(new Color().setRGB(0.0, 0.7, 0.5));
        this.material.uniforms.c2 = new Uniform(new Color().setRGB(0.0, 0.0, 1.0));

        this.computePass.material.uniforms.viewSize = new Uniform(this.dimensions);
        
        this.points = new Points();
        this.points.material = this.material;
        this.points.geometry = new PseudoPointsGeometry(this.n);
        this.scene.add(this.points);

        this.createSettings();
    }

    onResize(width: number, height: number) {
        this.renderer.setSize(width, height);
        this.renderer.getSize(this.dimensions);
    }
    
    private initializeTextures(): void {
        if (this.n > MAX_TEXTURE_DIM * MAX_TEXTURE_DIM) throw new Error("Point size of " + this.n + " is too large for texture");

        const texHeight = Math.ceil(this.n / MAX_TEXTURE_DIM);
        const data = new Float32Array(4 * MAX_TEXTURE_DIM * texHeight);
        for (let i=0; i<this.n; ++i) {
            data[i*4    ] = 2 * Math.random() - 1;
            data[i*4 + 1] = 2 * Math.random() - 1;
            data[i*4 + 2] = 0.1 * (2 * Math.random() - 1);
            data[i*4 + 3] = 0.1 * (2 * Math.random() - 1);
        }

        this.texture1 = new DataTexture(data, MAX_TEXTURE_DIM, texHeight);
        this.texture1.type = FloatType;
        this.texture1.format = RGBAFormat;
        this.texture1.needsUpdate = true;

        this.texture2 = this.texture1.clone();

        this.currStateTarget.texture = this.texture1;
        this.nextStateTarget.texture = this.texture2;
    }

    private updateUniforms(delta: number): void {
        this.computePass.uniforms.delta.value = delta;
        this.material.uniforms.pointState.value = this.nextStateTarget.texture;
    }

    start(): void {
        (() => this.frame())();
    }

    restart(): void {
        const texHeight = Math.ceil(this.n / MAX_TEXTURE_DIM);

        this.texture1.dispose();
        this.texture2.dispose();
        this.currStateTarget.dispose();
        this.nextStateTarget.dispose();
        this.currStateTarget = new WebGLRenderTarget(MAX_TEXTURE_DIM, texHeight);
        this.nextStateTarget = new WebGLRenderTarget(MAX_TEXTURE_DIM, texHeight);
        this.initializeTextures();

        this.points.geometry.dispose();
        this.points.geometry = new PseudoPointsGeometry(this.n);

        this.material.uniforms.texWidth = new Uniform(MAX_TEXTURE_DIM);
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
        //this.composer.swapBuffers(); // TODO?
        this.composer.render();
        
        requestAnimationFrame(() => { this.frame() });
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const countsFormatter = (v: number) => {
            const n = Math.pow(10, v);
            if (v < 3) return n.toString();
            if (v < 6) return ~~(n / 1000) + 'k';
            else return ~~(n / 1000000) + 'm';
        };

        const particleCount = new NumberSetting('Particle count', ~~Math.log10(this.n), 0, 8, 1, countsFormatter);
        settings.add(particleCount);
        particleCount.subscribe(v => {
            this.n = ~~Math.pow(10, v);
            this.restart();
        });

        const pointSize = new NumberSetting('Particle size', 1, 1, 20, 1);
        settings.add(pointSize);
        pointSize.subscribe(v => {
            this.material.uniforms.pointSize.value = v;
            if (v === 1) {
                this.material.defines.SPHERE_PARTICLES = false;
                this.material.needsUpdate = true;
            } else {
                if (!this.material.defines.SPHERE_PARTICLES) {
                    this.material.defines.SPHERE_PARTICLES = true;
                    this.material.needsUpdate = true;
                }
            }
        });

        const viscosity = new NumberSetting('Viscosity', 1, 0.1, 30, 0.1, v => v.toFixed(1));
        settings.add(viscosity);
        viscosity.subscribe(v => {
            this.computePass.material.uniforms.damping.value = 0.01 * v;
        });

        const opacity = new NumberSetting('Opacity', 0.7, 0.01, 1, 0.01, v => v.toFixed(2));
        settings.add(opacity);
        opacity.subscribe(v => {
            this.material.uniforms.opacity.value = v;
        });

        const colorScheme = new ColorSchemeSetting(
            'Color scheme',
            `#${ new Color(0.0, 0.3, 0.0).getHexString() },#${ new Color(0.0, 0.7, 0.5).getHexString() },#${ new Color(0.0, 0.0, 1.0).getHexString() }`
        );
        settings.add(colorScheme);
        colorScheme.subscribe(v => {
            const colors = v.split(',');
            this.material.uniforms.c0.value.set(colors[0]);
            this.material.uniforms.c1.value.set(colors[1]);
            this.material.uniforms.c2.value.set(colors[2]);
        });

        const borderBounce = new BooleanSetting('Border bounce', false);
        settings.add(borderBounce);
        borderBounce.subscribe(v => {
            this.computePass.material.defines.BORDERS_REFLECT = v;
            this.computePass.material.needsUpdate = true;
        });

        const expandButton = new ButtonSetting('Expand window', 'Minimize window', false);
        settings.add(expandButton);
        expandButton.subscribe(v => {
            if (v) this.container.classList.add('maximised');
            else this.container.classList.remove('maximised');
            settings.setDefaultExpansion();
        });
    }
}

const ParticleShader = {
    name: 'ParticleShader',
    uniforms: {
        viewSize: { value: new Vector2(1, 1) },
        delta: { value: 0 },
        damping: { value: 0.01 },
        nextState: { value: null },
        texWidth: { value: MAX_TEXTURE_DIM },
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

        uniform vec2 viewSize;
        uniform int texWidth;
        uniform float delta;
        uniform float damping;
        uniform vec2 mousePos;
        uniform sampler2D nextState;

        vec2 aspectCorrect(vec2 v, float aspect) {
            if (aspect < 1.0) v.x *= aspect;
            else v.y /= aspect;
            return v;
        }

        void main() {
            float aspect = viewSize.x / viewSize.y;
            float maxViewSize = max(viewSize.x, viewSize.y);

            vec2 corrMousePos = 2.0 * mousePos - viewSize;
            corrMousePos.y = -corrMousePos.y;
            corrMousePos /= maxViewSize;

            float d = 0.001 * delta;
            int i = int(gl_FragCoord.x);
            int j = int(gl_FragCoord.y);
            vec4 state = texelFetch(nextState, ivec2(i, j), 0);
            vec2 p = state.xy;
            vec2 v = state.zw;
            float dist = distance(p, corrMousePos);
            vec2 dir = normalize(corrMousePos - p);
            vec2 a = 0.1 / clamp((dist * dist), 0.01, 4.0) * dir;
            v += d * a;
            v *= (1.0 - damping);

            vec2 p1 = p + d * v;

            #ifdef BORDERS_REFLECT
                vec2 borders = aspectCorrect(vec2(1.0, 1.0), aspect);
                if (p1.x < -borders.x || p1.x > borders.x) v.x = -v.x;
                if (p1.y < -borders.y || p1.y > borders.y) v.y = -v.y;
            #endif

            gl_FragColor = vec4(p + d * v, v);
        }
    `,
};



const vertexShader = glsl`
    precision highp float;

    uniform vec2 viewSize;
    uniform int texWidth;
    uniform float pointSize;
    uniform sampler2D pointState;

    flat out vec2 v;

    vec2 aspectCorrectInv(vec2 v, float aspect) {
        if (aspect < 1.0) v.x /= aspect;
        else v.y *= aspect;
        return v;
    }

    void main() {
        float aspect = viewSize.x / viewSize.y;

        vec4 state = texelFetch(pointState, ivec2(gl_VertexID % texWidth, gl_VertexID / texWidth), 0);
        state.xy = aspectCorrectInv(state.xy, aspect);

        gl_PointSize = pointSize;
        gl_Position = vec4(state.xy, 0.0, 1.0);
        v = state.zw;
    }
`;

const fragmentShader = glsl`
    precision highp float;

    uniform float opacity;
    uniform vec3 c0;
    uniform vec3 c1;
    uniform vec3 c2;

    flat in vec2 v;
    out vec4 fragColor;

    void main() {
        float localAlpha = 1.0;
    
        #ifdef SPHERE_PARTICLES
            vec2 relFragPos = 2.0 * (gl_PointCoord - 0.5);
            float r = dot(relFragPos, relFragPos);
            if (r > 1.0) discard;
            localAlpha = 1.0 - r;
        #endif

        float a = length(v);
        fragColor = vec4(c0 + a * c1 + a * a * c2, opacity * localAlpha);
    }
`;
