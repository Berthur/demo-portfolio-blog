import katex from "katex";

export class LatexElement extends HTMLElement {
    constructor() {
        super();
        katex.render(this.innerText, this);
    }
}

customElements.define('span-latex', LatexElement);
