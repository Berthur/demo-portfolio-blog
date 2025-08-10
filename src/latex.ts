import katex from "katex";

export class LatexElement extends HTMLElement {
    constructor() {
        super();
        katex.render(this.innerText, this, LatexElement.options);
    }

    static readonly options = {
        //displayMode: true,
        macros: {
            '\\R': '\\mathbb{R}',
            '\\norm': '\\|#1\\|',
        },
    };
}

customElements.define('span-latex', LatexElement);
