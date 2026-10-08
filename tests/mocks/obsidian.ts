export { default as moment } from 'moment';

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
export class MarkdownView {}

/**
 * Minimální náhrada Obsidian API pro testy. Pokrývá jen to, co testovaný kód
 * skutečně volá — ne celé API.
 */

type MockEl = {
  createEl: (tag: string, options?: { text?: string }) => MockEl;
  empty: () => void;
  children: MockEl[];
  text?: string;
};

function createMockEl(text?: string): MockEl {
  const el: MockEl = {
    children: [],
    text,
    createEl(_tag, options) {
      const child = createMockEl(options?.text);
      el.children.push(child);
      return child;
    },
    empty() {
      el.children.length = 0;
    },
  };
  return el;
}

export class Modal {
  contentEl = createMockEl() as unknown as HTMLElement;
  private isOpen = false;

  constructor(public app: unknown) {}

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    (this as unknown as { onOpen?: () => void }).onOpen?.();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    (this as unknown as { onClose?: () => void }).onClose?.();
  }

  /** Jen pro testy: vynutí druhé `onClose()` bez ohledu na stav modalu. */
  forceCloseAgain(): void {
    (this as unknown as { onClose?: () => void }).onClose?.();
  }
}

export class ButtonComponent {
  label = '';
  destructive = false;
  warning = false;
  private handler: (() => void) | undefined;

  setButtonText(label: string): this {
    this.label = label;
    return this;
  }

  setDestructive(): this {
    this.destructive = true;
    return this;
  }

  setWarning(): this {
    this.warning = true;
    return this;
  }

  onClick(handler: () => void): this {
    this.handler = handler;
    return this;
  }

  /** Jen pro testy: simuluje klik uživatele. */
  click(): void {
    this.handler?.();
  }
}

export class Setting {
  /** Jen pro testy: každý vytvořený Setting, ať se testy dostanou k tlačítkům. */
  static instances: Setting[] = [];

  buttons: ButtonComponent[] = [];

  constructor(public containerEl: unknown) {
    Setting.instances.push(this);
  }

  addButton(build: (btn: ButtonComponent) => unknown): this {
    const btn = new ButtonComponent();
    build(btn);
    this.buttons.push(btn);
    return this;
  }
}

/** Testy běží proti nejnovějšímu API, takže guardy na verzi jsou splněné. */
export function requireApiVersion(_version: string): boolean {
  return true;
}
