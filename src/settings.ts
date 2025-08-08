
const arrowSEChar = '&#8690;';
const arrowNWChar = '&#8689;';
const gearChar = '&#9881;';

export class Settings {

    element: HTMLElement;
    private innerContainer: HTMLElement;
    private expandButton: HTMLElement;
    private collapsed = false;

    constructor() {
        this.element = document.createElement('div');
        this.element.id = 'settingsContainer';

        this.innerContainer = document.createElement('div');
        this.innerContainer.classList.add('innerContainer');
        this.element.append(this.innerContainer);

        this.expandButton = document.createElement('div');
        this.expandButton.classList.add('expandButton');
        this.element.append(this.expandButton);
        this.expandButton.addEventListener('click', () => {
            if (this.collapsed) this.expand();
            else this.collapse();
        });

        if (window.innerWidth < 800 || window.innerHeight < 800) this.collapse();
        else this.expand();
    }

    add<T>(setting: Setting<T>) {
        this.innerContainer.append(setting.element);
    }

    private expand(): void {
        this.expandButton.innerHTML = arrowNWChar;
        this.innerContainer.style.display = 'block';
        this.collapsed = false;
    }

    private collapse(): void {
        this.expandButton.innerHTML = gearChar;
        this.innerContainer.style.display = 'none';
        this.collapsed = true;
    }
}

export abstract class Setting<T> {
    private val: T;
    private subscriptions: Set<(value: T) => void> = new Set();
    element: HTMLElement;

    constructor(protected defaultValue: T) {
        this.val = defaultValue;

        this.element = document.createElement('div');
        this.element.classList.add('demoSetting');
    }

    get value(): T {
        return this.val;
    }

    set value(v: T) {
        if (this.val === v) return;
        this.val = v;
        for (const s of this.subscriptions)
            s(this.val);
    }

    reset(): void {
        this.value = this.defaultValue;
    }

    subscribe(f: (value: T) => void): void {
        this.subscriptions.add(f);
    }

    unsubscribe(f: (value: T) => void): void {
        this.subscriptions.delete(f);
    }

    protected createLabel(text: string): HTMLLabelElement {
        const label = document.createElement('label');
        label.innerText = text;
        return label;
    }

}

export class NumberSetting extends Setting<number> {
    element: HTMLDivElement;

    constructor(
        label: string, defaultValue: number,
        min: number, max: number, step: number,
        private labelTransform?: (v: number) => string
    ) {
        super(defaultValue);

        const leftCol = document.createElement('div');
        const rightCol = document.createElement('div');
        this.element.append(leftCol, rightCol);

        const slider = document.createElement('input');
        leftCol.append(slider);
        slider.type = 'range';
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = step.toString();
        slider.value = this.value.toString();
        const displayValue = this.labelTransform ? this.labelTransform(this.value) : slider.value;
        slider.setAttribute('data-value', displayValue);

        rightCol.append(this.createLabel(label));

        // NB: Use change instead of input if the value should only be applied on mouseup
        slider.addEventListener('input', e => {
            this.value = +slider.value;
            const displayValue = this.labelTransform ? this.labelTransform(this.value) : slider.value;
            slider.setAttribute('data-value', displayValue);
        });
    }
}

export class BooleanSetting extends Setting<boolean> {
    element: HTMLDivElement;

    constructor(label: string, defaultValue: boolean) {
        super(defaultValue);

        const leftCol = document.createElement('div');
        const rightCol = document.createElement('div');
        this.element.append(leftCol, rightCol);

        const checkbox = document.createElement('input');
        leftCol.append(checkbox);
        checkbox.type = 'checkbox';
        if (defaultValue) checkbox.checked = true;

        rightCol.append(this.createLabel(label));

        checkbox.addEventListener('input', e => {
            this.value = checkbox.checked;
        });
    }
}

export class ButtonSetting extends Setting<boolean> {
    element: HTMLDivElement;

    constructor(label1: string, label2: string, defaultValue: boolean) {
        super(defaultValue);

        const leftCol = document.createElement('div');
        const rightCol = document.createElement('div');
        this.element.append(leftCol, rightCol);

        const button = document.createElement('button');
        rightCol.append(button);
        button.innerText = label1;
        if (this.value) button.classList.add('active');
        else button.classList.remove('active');

        button.addEventListener('click', e => {
            this.value = !this.value;
            if (this.value) button.classList.add('active');
            else button.classList.remove('active');
            if (this.value === this.defaultValue) button.innerText = label1;
            else button.innerText = label2;
            button.blur();
        });
    }
}

export class ColorSetting extends Setting<string> {
    element: HTMLDivElement;

    constructor(label: string, defaultValue: string) {
        super(defaultValue);

        const leftCol = document.createElement('div');
        const rightCol = document.createElement('div');
        this.element.append(leftCol, rightCol);

        const picker = document.createElement('input');
        leftCol.append(picker);
        picker.type = 'color';
        picker.value = this.value;

        rightCol.append(this.createLabel(label));

        picker.addEventListener('input', e => {
            this.value = picker.value;
        });
    }
}

export class ColorSchemeSetting extends Setting<string> {
    element: HTMLElement;

    constructor(label: string, defaultValue: string) {
        super(defaultValue);
        const values = defaultValue.split(',');

        const leftCol = document.createElement('div');
        const rightCol = document.createElement('div');
        this.element.append(leftCol, rightCol);

        const pickers = [];
        for (let i=0; i<values.length; ++i) {
            const picker = document.createElement('input');
            pickers.push(picker);
            leftCol.append(picker);
            picker.type = 'color';
            picker.value = values[i];

            picker.addEventListener('input', e => {
                this.value = pickers.map(p => p.value).join(',');
            });
        }

        rightCol.append(this.createLabel(label));
    }
}
