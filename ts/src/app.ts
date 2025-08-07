import { FractalDemo } from "./fractalDemo";
import { ParticlesDemo } from "./particlesDemo";
import { TrafficDemo } from "./trafficDemo";

export class App {
    demos = Object.seal({
        particles: ParticlesDemo,
        fractal: FractalDemo,
        traffic: TrafficDemo,
    });
}
