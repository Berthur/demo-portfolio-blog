import { App } from "./app";
import { LatexElement } from "./latex";
import * as THREE from "three";

(window as any).THREE = THREE;
(window as any).App = App;

void LatexElement; // Make sure class is included in bundle
