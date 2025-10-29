import { DataTexture, DoubleSide, FloatType, GLSL3, Mesh, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Texture, Uniform, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { Demo } from "./demo";
import { BooleanSetting, ButtonSetting, NumberSetting, Settings } from "../settings";
import { glsl, } from "../utils";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export class ClothDemo extends Demo {
    private readonly dimensions = new Vector2(1, 1);
    private readonly clothDimensions = new Vector2(10, 10);
    private mousePos = new Vector2();

    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly scene: Scene;
    private readonly camera: PerspectiveCamera;
    private readonly mesh: Mesh;
    private readonly material: ShaderMaterial;
    private readonly computePass: ShaderPass;
    private readonly composer: EffectComposer;

    private currStateTarget: WebGLRenderTarget;
    private nextStateTarget: WebGLRenderTarget;
    private positionTexture0: Texture;
    private positionTexture1: Texture;
    private velocityTexture0: Texture;
    private velocityTexture1: Texture;

    constructor(container: HTMLElement) {
        super(container);
        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);

        this.canvas.addEventListener('pointermove', e => {
            this.mousePos.set(e.offsetX, e.offsetY).multiplyScalar(devicePixelRatio);
        });

        this.renderer = new WebGLRenderer({ canvas: this.canvas });
        this.currStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y, { count: 2 });
        this.nextStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y, { count: 2 });

        this.scene = new Scene();
        this.camera = new PerspectiveCamera(75, 1, 0.01, 50);
        this.camera.position.set(0, 0, 3);
        const controls = new OrbitControls(this.camera, this.canvas);
        controls.zoomToCursor = true;

        this.initializeTextures();

        this.computePass = new ShaderPass(ComputeShader, 'positionTexture');
        this.computePass.material.glslVersion = GLSL3;
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
        this.material.uniforms.positionTexture = new Uniform(null);
        this.material.uniforms.delta = new Uniform(0);

        this.mesh = new Mesh();
        this.mesh.material = this.material;
        this.mesh.geometry = new PlaneGeometry(1, 1, this.clothDimensions.x - 1, this.clothDimensions.y - 1);
        this.mesh.frustumCulled = false;
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
            data[4*i + 2] = 0.1 * Math.random() - 0.05;
        }

        this.positionTexture0 = new DataTexture(data, this.clothDimensions.x, this.clothDimensions.y);
        this.positionTexture0.type = FloatType;
        this.positionTexture0.format = RGBAFormat;
        this.positionTexture0.needsUpdate = true;

        this.positionTexture1 = this.createEmptyTexture();
        this.velocityTexture0 = this.createEmptyTexture();
        this.velocityTexture1 = this.createEmptyTexture();

        this.currStateTarget.textures = [this.positionTexture1, this.velocityTexture1];
        this.nextStateTarget.textures = [this.positionTexture0, this.velocityTexture0];
    }

    private createEmptyTexture(): Texture {
        const t = new Texture({ width: this.clothDimensions.x, height: this.clothDimensions.y } as any);
        t.type = FloatType;
        t.format = RGBAFormat;
        return t;
    }

    private updateUniforms(time: number, delta: number): void {
        this.computePass.uniforms.time.value = time;
        this.computePass.uniforms.delta.value = delta;
        this.computePass.uniforms.velocityTexture.value = this.currStateTarget.textures[1];
        this.material.uniforms.positionTexture.value = this.nextStateTarget.textures[0];
    }

    start(): void {
        (() => this.frame())();
    }

    restart(): void {
        console.warn("Restarting!");

        // TODO: Dispose of textures
        // this.currStateTarget.dispose();
        // this.nextStateTarget.dispose();
        // this.currStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y);
        // this.nextStateTarget = new WebGLRenderTarget(this.clothDimensions.x, this.clothDimensions.y);
        // this.initializeTextures();

        // TODO: Restart mesh geometry
    }

    private t0 = 0;
    frame(): void {
        const t1 = performance.now();
        const delta = Math.min(t1 - this.t0, 200);
        this.t0 = t1;

        // TODO: Prevent rendering between steps
        const steps = 10;
        for (let i=0; i<steps; ++i) {
            const d = delta / steps;
            const tmp = this.currStateTarget;
            this.currStateTarget = this.nextStateTarget;
            this.nextStateTarget = tmp;

            this.updateUniforms(t1 / 1000, d);

            this.composer.readBuffer = this.currStateTarget;
            this.composer.writeBuffer = this.nextStateTarget;
            this.composer.render();
        }

        requestAnimationFrame(() => { this.frame() });
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const windStrength = new NumberSetting('Wind', 30, -100, 100, 1);
        settings.add(windStrength);
        windStrength.subscribe(v => {
            this.computePass.uniforms.windStrength.value = v;
        });

        const windFluctuation = new BooleanSetting('Wind fluctuation', true);
        settings.add(windFluctuation);
        windFluctuation.subscribe(v => {
            this.computePass.uniforms.windFluctuation.value = v;
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

const ComputeShader = {
    name: 'ComputeShader',
    uniforms: {
        viewSize: { value: new Vector2(1, 1) },
        time: { value: 0 },
        delta: { value: 0 },
        damping: { value: 1 },
        windStrength: { value: 30 },
        windFluctuation: { value: true },
        clothDimensions: { value: new Vector2(1, 1) },
        positionTexture: { value: null },
        velocityTexture: { value: null },
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

        #define PI 3.14159265359
        #define SQRT_2 1.4142135623730951

        uniform float time;
        uniform float delta;
        uniform vec2 viewSize;
        uniform ivec2 clothDimensions;
        uniform float damping;
        uniform float windStrength;
        uniform bool windFluctuation;
        uniform vec2 mousePos;
        uniform sampler2D positionTexture;
        uniform sampler2D velocityTexture;

        layout(location = 0) out vec4 outPosition;
        layout(location = 1) out vec4 outVelocity;

        void main() {
            ivec2 fragCoord = ivec2(gl_FragCoord.xy);
            float maxViewSize = max(viewSize.x, viewSize.y);
            float springLength = 2.0 / float(clothDimensions.y);
            float springStrength = 400.0;
            vec3 g = vec3(0.0, -9.8, 0.0);
            vec3 windDir = normalize(vec3(0.3, 0.1, 1.0));

            vec2 corrMousePos = 2.0 * mousePos - viewSize;
            corrMousePos.y = -corrMousePos.y;
            corrMousePos /= maxViewSize;

            vec3 p = texelFetch(positionTexture, fragCoord, 0).rgb;
            vec3 v = texelFetch(velocityTexture, fragCoord, 0).rgb;
            float d = 0.001 * delta;

            vec3 v1 = v;
            vec3 p1 = p;

            // Hang from upper corners:
            if (!(fragCoord.y == clothDimensions.y - 1 && (fragCoord.x == 0 || fragCoord.x == clothDimensions.x - 1))) {

                float areaApprox = 0.0;
                vec3 f = g;

                for (int j=-1; j<=1; ++j) for (int i=-1; i<=1; ++i) if (!(i == 0 && j == 0)) {
                    ivec2 fragCoord1 = fragCoord + ivec2(i, j);
                    if (fragCoord1.x >= 0 && fragCoord1.x < clothDimensions.x && fragCoord1.y >= 0 && fragCoord1.y < clothDimensions.y) {
                        vec3 p1 = texelFetch(positionTexture, fragCoord1, 0).rgb;
                        vec3 dir = p1 - p;
                        float r = length(dir);
                        dir /= r;
                        float sr = springLength;
                        if (!(i == 0 || j == 0)) sr *= SQRT_2;
                        f += springStrength * (r - sr) * dir;
                        areaApprox += r;
                    }
                }

                areaApprox /= 8.0;
                areaApprox = areaApprox * areaApprox * PI;
                float wt = 1.0;
                if (windFluctuation) wt = clamp(0.5 * sin(0.3 * time + 0.2) + sin(time) + 0.3 * sin(3.0 * time + 2.0), 0.0, 1.0);
                f += areaApprox * windStrength * wt * windDir;

                float dmp = 0.01;

                vec3 a = f;
                p1 = p + (1.0 - dmp) * (d*v + 0.5*d*d*a);
                v1 = (1.0 - dmp) * (v + d * a);
            }

            outPosition = vec4(p1, 0.0);
            outVelocity = vec4(v1, 0.0);
        }
    `,
};

const vertexShader = glsl`
    precision highp float;

    uniform vec2 viewSize;
    uniform ivec2 clothDimensions;
    uniform sampler2D positionTexture;

    varying vec3 vPosition;
    varying vec3 vNormal;

    vec2 aspectCorrectInv(vec2 v, float aspect) {
        if (aspect < 1.0) v.x /= aspect;
        else v.y *= aspect;
        return v;
    }

    void main() {
        ivec2 coord = ivec2(gl_VertexID % clothDimensions.x, gl_VertexID / clothDimensions.x);
        vec3 p0 = texelFetch(positionTexture, coord, 0).rgb;

        vec3 pw = normalize(texelFetch(positionTexture, coord + ivec2(-1, 0), 0).rgb - p0);
        vec3 pe = normalize(texelFetch(positionTexture, coord + ivec2(1, 0), 0).rgb - p0);
        vec3 pn = normalize(texelFetch(positionTexture, coord + ivec2(0, -1), 0).rgb - p0);
        vec3 ps = normalize(texelFetch(positionTexture, coord + ivec2(0, 1), 0).rgb - p0);

        vec3 pHor = pw;
        if (coord.x < 2) pHor = -pe;
        vec3 pVer = pn;
        if (coord.y < 2) pVer = -ps;

        vec3 n = vec3(0.0);
        if (coord.x > 0)                        n += cross(pw, -pVer);
        if (coord.x < clothDimensions.x - 1)    n += cross(pe, pVer);
        if (coord.y > 0)                        n += cross(pn, pHor);
        if (coord.y < clothDimensions.y - 1)    n += cross(ps, -pHor);
        n = normalize(n);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
        vPosition = p0;
        vNormal = n;
    }
`;

const fragmentShader = glsl`
    precision highp float;

    varying vec3 vPosition;
    varying vec3 vNormal;

    out vec4 fragColor;

    void main() {
        float ambient = 0.2;
        float specHardness = 7.0;
        vec3 diffuse = vec3(0.82, 0.71, 0.41);
        vec3 lightPos = vec3(0.5, 0.5, 2.0);

        vec3 normal = vNormal;
        if (!gl_FrontFacing) normal = -normal;

        vec3 dirToLight = lightPos - vPosition;
        float distToLight = length(dirToLight);
        dirToLight /= distToLight;
        vec3 dirToCam = normalize(cameraPosition - vPosition);

        vec3 h = normalize(dirToLight + dirToCam);
        float dotValue = dot(normal, dirToLight);
        float blinnPhong = pow(clamp(dot(normal, h), 0.0, 1.0), specHardness);
        if (dotValue < 0.0) blinnPhong = 0.0;

        // TODO: Attenuate by distance?

        float light = ambient + (1.0 - ambient) * blinnPhong;
        fragColor = vec4(light * diffuse, 1.0);
    }
`;
