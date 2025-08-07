import { FractalDemo } from "./demos/fractalDemo";
import { ParticlesDemo } from "./demos/particlesDemo";
import { TrafficDemo } from "./demos/trafficDemo";

export class App {
    demos = Object.seal({
        particles: ParticlesDemo,
        fractal: FractalDemo,
        traffic: TrafficDemo,
    });
}
