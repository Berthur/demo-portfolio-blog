import { Box3, BufferAttribute, BufferGeometry, Camera, Color, DynamicDrawUsage, FloatType, GLSL3, LinearMipmapLinearFilter, MathUtils, OrthographicCamera, Points, RedFormat, Scene, ShaderMaterial, Sphere, Texture, TextureLoader, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { Demo } from "./demo";
import { NumberSetting, Settings } from "../settings";
import { glsl } from "../utils";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass";

interface Primitive {
    position: Vector2;
    radius: number;
    color: Color;
}

interface PrimitiveCollection {
    n: number;
    posr: Float32Array;
    color: Uint8Array;
}

const MAX_PRIMITIVE_COUNT = 1000;
const ZERO_VEC = new Vector2(0, 0);
const ONE_VEC = new Vector2(1, 1);

const _primitive = {
    position: new Vector2(),
    radius: 0,
    color: new Color(),
} as Primitive;

export class GeneticDemo extends Demo {
    private readonly canvas: HTMLCanvasElement;

    private readonly dimensions = new Vector2(512, 512);
    private n = 500;
    private stepCount = 1;
    private mutationAggressivity = 1.0;
    private mutationProbability = 0.1;
    private primitiveOpacity = 1;

    private readonly currCollection: PrimitiveCollection;
    private readonly mutatingCollection: PrimitiveCollection;
    private currError = 1;
    private iterationCounter = 0;

    private readonly renderer: WebGLRenderer;
    private readonly scene: Scene;
    private readonly camera: Camera;
    private readonly points: Points;

    private renderTarget: WebGLRenderTarget;
    private diffRenderTarget: WebGLRenderTarget;
    private downsampleRenderTarget: WebGLRenderTarget;
    private composer: EffectComposer;
    private copyPass: ShaderPass;
    private diffPass: ShaderPass;
    private textureLoader = new TextureLoader();
    private targetTexture: Texture;

    private statsContainer: HTMLElement;

    private imgdata: Float32Array = new Float32Array(this.dimensions.x * this.dimensions.y);

    constructor(container: HTMLElement) {
        super(container);
        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);
        this.canvas.width = this.dimensions.x;
        this.canvas.height = this.dimensions.y;

        this.currCollection = {
            n: this.n,
            posr: new Float32Array(3 * MAX_PRIMITIVE_COUNT),
            color: new Uint8Array(3 * MAX_PRIMITIVE_COUNT),
        } as PrimitiveCollection;

        this.mutatingCollection = {
            n: this.n,
            posr: new Float32Array(3 * MAX_PRIMITIVE_COUNT),
            color: new Uint8Array(3 * MAX_PRIMITIVE_COUNT),
        } as PrimitiveCollection;

        for (let i=0; i<this.n; ++i) {
            _primitive.position.x = Math.random();
            _primitive.position.y = Math.random();
            _primitive.radius = 0.01;
            _primitive.color.r = Math.random();
            _primitive.color.g = Math.random();
            _primitive.color.b = Math.random();
            GeneticDemo.setPrimitive(this.currCollection, i, _primitive);
        }

        this.scene = new Scene();
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.camera.position.set(0, 0, 1);
        this.renderer = new WebGLRenderer({ canvas: this.canvas });
        this.points = this.createPoints();
        this.scene.add(this.points);

        this.renderTarget = new WebGLRenderTarget(this.dimensions.x, this.dimensions.y);
        this.diffRenderTarget = new WebGLRenderTarget(this.dimensions.x, this.dimensions.y, {
            format: RedFormat,
            type: FloatType,
            generateMipmaps: true,
            minFilter: LinearMipmapLinearFilter,
        });
        this.downsampleRenderTarget = new WebGLRenderTarget(1, 1, {
            format: RedFormat,
            type: FloatType,
            generateMipmaps: true,
            minFilter: LinearMipmapLinearFilter,
        });
        this.composer = new EffectComposer(this.renderer);
        this.diffPass = new ShaderPass(DiffShader, 'texture1');
        this.composer.addPass(this.diffPass);
        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
        this.composer.readBuffer = this.renderTarget;
        this.composer.writeBuffer = this.diffRenderTarget;

        this.copyPass = new ShaderPass(CopyShader);
        this.copyPass.renderToScreen = false;

        this.currError = 1.0;

        this.createSettings();

        this.statsContainer = document.createElement('div');
        this.container.append(this.statsContainer);
    }

    private createPoints(): Points {
        const g = new BufferGeometry();
        const posrAttribute = new BufferAttribute(new Float32Array(3 * this.n), 3, false);
        const colorAttribute = new BufferAttribute(new Uint8Array(3 * this.n), 3, true);
        posrAttribute.usage = DynamicDrawUsage; // TODO: Test
        colorAttribute.usage = DynamicDrawUsage;
        g.setAttribute('position', posrAttribute);
        g.setAttribute('color', colorAttribute);

        g.boundingBox = new Box3();
        g.boundingSphere = new Sphere();

        const m = new ShaderMaterial({
            glslVersion: GLSL3,
            vertexShader,
            fragmentShader,
        });

        const points = new Points(g, m);
        points.frustumCulled = false;
        return points;
    }

    private static getRandom(min: number, max: number): number {
        const x = (2 * (Math.random() - 0.5)) ** 3;
        return MathUtils.lerp(min, max, 0.5 + 0.5 * x);
        //return MathUtils.lerp(min, max, Math.random());
    }

    private static getPrimitive(collection: PrimitiveCollection, i: number, target: Primitive): Primitive {
        target.position.x = collection.posr[3 * i    ];
        target.position.y = collection.posr[3 * i + 1];
        target.radius = collection.posr[3 * i + 2];
        target.color.r = collection.color[3 * i    ] / 255;
        target.color.g = collection.color[3 * i + 1] / 255;
        target.color.b = collection.color[3 * i + 2] / 255;
        return target;
    }

    private static setPrimitive(collection: PrimitiveCollection, i: number, primitive: Primitive): void {
        collection.posr[3 * i    ] = primitive.position.x;
        collection.posr[3 * i + 1] = primitive.position.y;
        collection.posr[3 * i + 2] = primitive.radius;
        collection.color[3 * i    ] = primitive.color.r * 255;
        collection.color[3 * i + 1] = primitive.color.g * 255;
        collection.color[3 * i + 2] = primitive.color.b * 255;
    }

    private static copyPrimitiveCollection(src: PrimitiveCollection, dst: PrimitiveCollection): void {
        dst.n = src.n;
        for (let i=0; i<src.n; ++i) {
            dst.posr[3*i    ] = src.posr[3*i    ];
            dst.posr[3*i + 1] = src.posr[3*i + 1];
            dst.posr[3*i + 2] = src.posr[3*i + 2];
            dst.color[3*i    ] = src.color[3*i    ];
            dst.color[3*i + 1] = src.color[3*i + 1];
            dst.color[3*i + 2] = src.color[3*i + 2];
        }
    }

    private renderMutation(collection: PrimitiveCollection): void {

        // Update primitives on the attribute buffers:
        const psrAttr = this.points.geometry.attributes.position;
        const colorAttr = this.points.geometry.attributes.color;
        for (let i=0; i<this.n; ++i) {
            psrAttr.array[3 * i    ] = collection.posr[3 * i    ];
            psrAttr.array[3 * i + 1] = collection.posr[3 * i + 1];
            psrAttr.array[3 * i + 2] = collection.posr[3 * i + 2];
            colorAttr.array[3 * i    ] = collection.color[3 * i    ];
            colorAttr.array[3 * i + 1] = collection.color[3 * i + 1];
            colorAttr.array[3 * i + 2] = collection.color[3 * i + 2];
        }
        psrAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;

        // Render mutation:
        this.renderer.setClearColor(0xffffff);
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);

        // Compute mutation diff:
        this.composer.renderToScreen = false;
        this.composer.render();

        // Compute total error as average of diffs by downscaling:
        this.copyPass.render(this.renderer, this.downsampleRenderTarget, this.diffRenderTarget, 0, false);
    }

    private renderToScreen(): void {
        // TODO: Instead of rendering twice, render to target and copy to screen
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }

    private mutate(error: number): void {
        GeneticDemo.copyPrimitiveCollection(this.currCollection, this.mutatingCollection);
        for (let i=0; i<this.n; ++i) {
            if (Math.random() >= this.mutationProbability) continue;

            GeneticDemo.getPrimitive(this.mutatingCollection, i, _primitive);
            _primitive.position.x += GeneticDemo.getRandom(-1, 1) * this.mutationAggressivity * error;
            _primitive.position.y += GeneticDemo.getRandom(-1, 1) * this.mutationAggressivity * error;
            _primitive.position.clamp(ZERO_VEC, ONE_VEC); // TODO: May cause bias towards edges, is that a problem?

            const scale = GeneticDemo.getRandom(-1, 1) * this.mutationAggressivity * error;
            _primitive.radius *= scale < 0 ? 1 + 0.5 * scale : 1 + scale;
            _primitive.radius = Math.min(_primitive.radius, 0.05);

            _primitive.color.r = MathUtils.clamp(_primitive.color.r + GeneticDemo.getRandom(-1, 1) * 2.0 * this.mutationAggressivity * error, 0, 1);
            _primitive.color.g = MathUtils.clamp(_primitive.color.g + GeneticDemo.getRandom(-1, 1) * 2.0 * this.mutationAggressivity * error, 0, 1);
            _primitive.color.b = MathUtils.clamp(_primitive.color.b + GeneticDemo.getRandom(-1, 1) * 2.0 * this.mutationAggressivity * error, 0, 1);

            GeneticDemo.setPrimitive(this.mutatingCollection, i, _primitive);
        }

        // TODO: Sort?

        // TODO: Increase n?
    }

    private  async getTargetImage(): Promise<void> {
        const url = '../resources/demo/wanderer.jpeg';
        const texture = await this.textureLoader.loadAsync(url);
        this.targetTexture = texture;
        this.diffPass.uniforms.texture2.value = texture;
        this.container.append(texture.image);
    }

    private errorArray = new Float32Array(1);
    private getError(): number {
        this.renderer.readRenderTargetPixels(this.downsampleRenderTarget, 0, 0, 1, 1, this.errorArray);
        return this.errorArray[0];

        // this.renderer.readRenderTargetPixels(this.diffRenderTarget, 0, 0, this.dimensions.x, this.dimensions.y, this.imgdata);
        // let sum = 0;
        // for (let i=0; i<this.imgdata.length; ++i)
        //     sum += this.imgdata[i];
        // sum /= this.imgdata.length;
        // return sum;
    }

    private iterate(): void {
        this.mutate(this.currError);
        this.renderMutation(this.mutatingCollection);
        const mutatedError = this.getError();
        if (mutatedError <= this.currError) {
            GeneticDemo.copyPrimitiveCollection(this.mutatingCollection, this.currCollection);
            this.currError = mutatedError;
            this.renderToScreen();
        }
        ++this.iterationCounter;
    }

    onResize(width: number, height: number): void {
        // TODO
    }

    start(): void {
        this.getTargetImage().then(() => {
            (() => this.frame())();
        });
    }

    restart(): void {
        // TODO
    }

    private t0 = 0;
    frame(): void {
        const t1 = performance.now();
        const delta = t1 - this.t0;
        this.t0 = t1;

        for (let i=0; i<this.stepCount; ++i) this.iterate();

        const iterationFreq = this.stepCount / (0.001 * delta);
        this.statsContainer.innerHTML = `
            Error: ${ this.currError.toFixed(6) } &nbsp;
            Iterations/s: ${ ~~iterationFreq } &nbsp;
            Iterations total: ${ this.iterationCounter < 1000 ? this.iterationCounter : ~~(this.iterationCounter / 1000) + 'k' }
        `;
        
        requestAnimationFrame(() => { this.frame() });
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const stepCount = new NumberSetting('Step count', this.stepCount, 1, 1000, 1);
        settings.add(stepCount);
        stepCount.subscribe(v => {
            this.stepCount = v;
        });

        const mutationAggressivity = new NumberSetting('Aggressivity', this.mutationAggressivity, 0, 3, 0.01, v => v.toFixed(2));
        settings.add(mutationAggressivity);
        mutationAggressivity.subscribe(v => {
            this.mutationAggressivity = v;
        });

        const mutationProbability = new NumberSetting('Mutation probability', this.mutationProbability, 0, 1, 0.01, v => v.toFixed(2));
        settings.add(mutationProbability);
        mutationProbability.subscribe(v => {
            this.mutationProbability = v;
        });

        const opacity = new NumberSetting('Primitive opacity', this.primitiveOpacity, 0, 1, 0.01, v => v.toFixed(2));
        settings.add(opacity);
        opacity.subscribe(v => {
            this.primitiveOpacity = v;
        });
    }
}

const vertexShader = glsl`
    precision highp float;

    attribute vec3 color;

    flat out vec3 vColor;

    void main() {
        gl_PointSize = position.z * 512.0; // TODO: get viewSize
        gl_Position = vec4(2.0 * position.xy - 1.0, 0.0, 1.0);
        vColor = color;
    }
`;

const fragmentShader = glsl`
    precision highp float;

    flat in vec3 vColor;
    out vec4 fragColor;

    void main() {
        vec2 relFragPos = 2.0 * (gl_PointCoord - 0.5);
        float r = dot(relFragPos, relFragPos);
        if (r > 1.0) discard;
        fragColor = vec4(vColor, 1.0);
    }
`;

const DiffShader = {
	name: 'DiffShader',
	uniforms: {
		'texture1': { value: null },
        'texture2': { value: null },
	},
	vertexShader: glsl`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
    `,
	fragmentShader: glsl`
        #define SQRT_3 1.732050807568877

		uniform sampler2D texture1;
        uniform sampler2D texture2;
		varying vec2 vUv;

		void main() {
	        vec3 color1 = texture2D(texture1, vUv).rgb;
            vec3 color2 = texture2D(texture2, vUv).rgb;
            float distL2 = length(color1 - color2) / SQRT_3;
			gl_FragColor = vec4(distL2, 0.0, 0.0, 1.0);
		}
    `
};
