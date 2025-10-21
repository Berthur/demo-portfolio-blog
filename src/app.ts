import * as siteJSON from "../html/site.json";
import { FractalDemo } from "./demos/fractalDemo";
import { ParticlesDemo } from "./demos/particlesDemo";
import { TrafficDemo } from "./demos/trafficDemo";
import { GameOfLifeDemo } from "./demos/gameOfLife";
import { ClothDemo } from "./demos/clothDemo";

interface BlogEntry {
    index: number;
    title: string;
    file: string;
    date: string;
}

export class App {
    siteJSON = siteJSON;
    private blogEntries = new Map<string, BlogEntry>();

    demos = Object.seal({
        particles: ParticlesDemo,
        fractal: FractalDemo,
        traffic: TrafficDemo,
        gameOfLife: GameOfLifeDemo,
        cloth: ClothDemo,
    });

    constructor() {
        let i=0;
        for (const be of this.siteJSON.blog.entries) {
            const entry: BlogEntry = Object.assign({ index: i++ }, be);
            this.blogEntries.set(be.file, entry);
        }
    }

    populateBlogLinks(): void {
        const blogPath = location.pathname.split('/').slice(-1)[0];
        const currEntry = this.getBlogEntry(blogPath);
        const prevEntry = this.getPrevBlogEntry(currEntry);
        const nextEntry = this.getNextBlogEntry(currEntry);

        const prevLink = document.createElement('div');
        if (prevEntry) {
            const link = document.createElement('a');
            link.innerText = "Prev: " + prevEntry.title;
            link.href = prevEntry.file;
            prevLink.append(link);
        }

        const nextLink = document.createElement('div');
        if (nextEntry) {
            const link = document.createElement('a');
            link.innerText = "Next: " + nextEntry.title;
            link.href = nextEntry.file;
            nextLink.append(link);
        }

        const linkContainers = document.getElementsByClassName('blogLinks');
        for (let i=0; i<linkContainers.length; ++i) {
            linkContainers[i].append(prevLink.cloneNode(true));
            linkContainers[i].append(nextLink.cloneNode(true));
        }
    }

    getBlogEntry(path: string): BlogEntry {
        const entry = this.blogEntries.get(path);
        if (!entry) throw new Error(`Could not find blog entry '${ path }'`);
        return entry;
    }

    getPrevBlogEntry(currEntry: BlogEntry): BlogEntry | undefined {
        const prevJSON = this.siteJSON.blog.entries[currEntry.index - 1];
        if (prevJSON) return this.blogEntries.get(prevJSON.file);
        else return undefined;
    }

    getNextBlogEntry(currEntry: BlogEntry): BlogEntry | undefined {
        const nextJSON = this.siteJSON.blog.entries[currEntry.index + 1];
        if (nextJSON) return this.blogEntries.get(nextJSON.file);
        else return undefined;
    }
}
