
export abstract class Demo {
    constructor(protected container: HTMLElement) {
        const resizeObserver = new ResizeObserver(m => {
            this.onResize(m[0].contentRect.width, m[0].contentRect.height);
        });
        resizeObserver.observe(container);

        // document.addEventListener('keydown', e => {
        //     if (e.code === 'Escape') this.container.classList.remove('maximised');
        //     // TODO: Update setting?
        // });
    }

    abstract start(): void;

    abstract onResize(width: number, height: number);
}
