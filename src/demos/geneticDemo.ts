import { Color, MathUtils, Vector2 } from "three";
import { Demo } from "./demo";
import { NumberSetting, Settings } from "../settings";

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
    private readonly ctx: CanvasRenderingContext2D;

    private dimensions = new Vector2(500, 500);
    private n = 500;
    private stepCount = 200;
    private mutationAggressivity = 1.0;
    private mutationProbability = 0.1;
    private primitiveOpacity = 1;

    private currCollection: PrimitiveCollection;
    private mutatingCollection: PrimitiveCollection;
    private currError = 1;

    private targetImage: ImageData;

    constructor(container: HTMLElement) {
        super(container);
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
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

        this.currError = 1.0;

        this.createSettings();
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

    private render(collection: PrimitiveCollection): void {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.dimensions.x, this.dimensions.y);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, this.dimensions.x, this.dimensions.y);

        for (let i=0; i<this.n; ++i) {
            GeneticDemo.getPrimitive(collection, i, _primitive);
            ctx.globalAlpha = this.primitiveOpacity;
            ctx.fillStyle = '#' + _primitive.color.getHexString();
            ctx.beginPath();
            ctx.arc(
                _primitive.position.x * this.dimensions.x, _primitive.position.y * this.dimensions.y,
                _primitive.radius * this.dimensions.y,
                0, 2 * Math.PI
            );
            ctx.fill();
        }
    }

    private mutate(error: number): void {
        GeneticDemo.copyPrimitiveCollection(this.currCollection, this.mutatingCollection);
        for (let i=0; i<this.n; ++i) {
            if (Math.random() >= this.mutationProbability) continue;

            GeneticDemo.getPrimitive(this.mutatingCollection, i, _primitive);
            _primitive.position.x += GeneticDemo.getRandom(-1, 1) * this.mutationAggressivity * error;
            _primitive.position.y += GeneticDemo.getRandom(-1, 1) * this.mutationAggressivity * error;
            _primitive.position.clamp(ZERO_VEC, ONE_VEC); // TODO: May cause bias towards edges, is that a problem?

            _primitive.radius *= 1 + GeneticDemo.getRandom(-1, 1) * this.mutationAggressivity * error;
            _primitive.radius = Math.min(_primitive.radius, 0.05);

            _primitive.color.r = MathUtils.clamp(_primitive.color.r + GeneticDemo.getRandom(-1, 1) * 2.0 * this.mutationAggressivity * error, 0, 1);
            _primitive.color.g = MathUtils.clamp(_primitive.color.g + GeneticDemo.getRandom(-1, 1) * 2.0 * this.mutationAggressivity * error, 0, 1);
            _primitive.color.b = MathUtils.clamp(_primitive.color.b + GeneticDemo.getRandom(-1, 1) * 2.0 * this.mutationAggressivity * error, 0, 1);

            GeneticDemo.setPrimitive(this.mutatingCollection, i, _primitive);
        }

        // TODO: Sort?

        // TODO: Increase n?
    }

    private  async getTargetImage(): Promise<ImageData> {
        const canvas = document.createElement('canvas');
        canvas.width = this.dimensions.x;
        canvas.height = this.dimensions.y;
        const ctx = canvas.getContext('2d');

        // @ts-ignore
        const imageData: Promise<ImageData> = await new Promise((res) => {
            const image = new Image();
            image.src = '../resources/demo/wanderer.jpeg';

            image.onload = () => {
                ctx.drawImage(image, 0, 0);
                res(ctx.getImageData(0, 0, image.width, image.height));
            };
        });

        this.container.append(canvas);

        return imageData;
    }

    private getError(): number {
        const imageData = this.ctx.getImageData(0, 0, this.dimensions.x, this.dimensions.y);
        let sum = 0;
        for (let i=0; i<imageData.data.length; ++i) {
            if (i % 4 !== 3) // Ignore alpha channel
                sum += Math.abs(imageData.data[i] - this.targetImage.data[i]) / 255;
        }
        sum /= 0.75 * imageData.data.length;
        return sum;
    }

    private iterate(): void {
        this.mutate(this.currError);
        this.render(this.mutatingCollection);
        const mutatedError = this.getError();
        if (mutatedError <= this.currError) {
            GeneticDemo.copyPrimitiveCollection(this.mutatingCollection, this.currCollection);
            this.currError = mutatedError;
            console.log(this.currError);
        }
    }

    onResize(width: number, height: number): void {
        // TODO
    }

    start(): void {
        this.getTargetImage().then(imageData => {
            this.targetImage = imageData;
            (() => this.frame())();
        });
    }

    restart(): void {
        // TODO
    }

    private t0 = 0;
    frame(): void {
        const t1 = performance.now();
        const delta = Math.min(t1 - this.t0, 200);
        this.t0 = t1;

        for (let i=0; i<this.stepCount; ++i) this.iterate();
        
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
