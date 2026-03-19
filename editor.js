class Editor extends HTMLElement {
  #lang;
  #place;
  #tab;
  #timer;
  #parser;
  #style = `
    :host {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      background: rgba(255, 255, 255, 0.25);
      border-radius: 12px;
      border: 2px solid #c0c7d1;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: .1rem 1rem;
      background: #f8f8f8;
      border-radius: 12px 12px 0 0;
      user-select: none;
      height: 15%;

      display: flex;
    }
    .icons {
      display: flex;
      flex: 1;

      flex-direction: row-reverse;
      padding: .1rem .3rem;

      gap: .3rem;
      button {
        border: none;
        background: none;
        cursor: pointer;
      }
    }
    
    .flex {
      display: flex;
      width: 97.5%;
      flex: 1;
      border: 2px solid #c0c7d1;
      border-radius: 12px;
      margin: 0 auto;
      margin-bottom: .5rem;
    }
    
    .line {
      display: flex;
      flex-direction: column;
      min-width: 40px;
      max-width: 50%;
      height: 100%;
      resize: horizontal;
      overflow: hidden;
      color: rgba(0, 0, 0, 0.4);
      font-family: monospace;
      font-size: 14px;
      border-right: 1px solid #c0c7d1;
      line-height: 1.5;
      padding: .5rem .25rem;

      user-select: none;
    }
    .line p.active {
      color: #000;
    }
    
    .content {
      flex: 1;
      position: relative;
      height: 100%;
    }
    .content > * {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    
      border: none;
      border-radius: 12px;
      background: transparent;
    
      font-family: monospace;
      font-size: 14px;
      line-height: 1.5;
      color: #383a42;
    
      white-space: pre;
      overflow-x: scroll; overflow-y: hidden;
    
      min-height: 150px;

      padding: .5rem;
    }
    .highlight-view {
      pointer-events: none;
      user-select: none;
      cursor: text;
    }
    .highlight-text {
      resize: none;
      outline: none;
      color: transparent;
      caret-color: #000;
    
      background: transparent;
      border-radius: 12px;
    }
    .text::selection {
      color: transparent;
      background: #dbebff;
    }
    .whitespace {
    }
    .comment {
      color: var(--com-color,#a0a1a7);
      font-style: var(--com-style,italic);
    }
    .keyword {
      color: var(--key-color,#a626a4);
    }
    .identifier {
      color: var(--ident-color,#4078f2);
    }
    .number {
      color: var(--num-color,#986801);
    }
    .string {
      color: var(--str-color,#50a14f);
    }
    .regex {
      color: var(--reg-color,#c18401);
    }
    .punctuator {
      color: var(--punc-color,#383a42);
    }
    .templatestart,
    .templateend {
      color: var(--temp-color,#50a14f);
    }
    .templatechunk {
      color: var(--temp-color,#50a14f);
    }
    .templateexprstart,
    .templateexprend {
      color: var(--temp-expr-color,#383a42);
    }
    .tagopen, .tagclose, .selfclose { color: #e45649; }
    .tagname { color: #986801; }
    .attrname { color: #4078f2; }
    .equals { color: #383a42; }
    .attrvalue { color: #50a14f; }
    .text { color: #383a42; }
    .comment, .doctype { color: #a0a1a7; }
    .scriptcontent, .stylecontent { color: #50a14f; }
    .error {
      background: var(--err-bg,#ffdddd);
      color: var(--err-color,#e45649);
      border-bottom: var(--err-bottom,1px dashed #e45649);
    }
    .active {
      background: var(--act-bg, #f0f0f0);
    }
    .ms-icon {
      font-family: 'Material Symbols Outlined';
      font-variation-settings:
        'FILL' 0,
        'wght' 400,
        'GRAD' 0,
        'opsz' 24;
    }
  `;

  static get observedAttributes() {
    return ['lang', 'value', 'placeholder', 'tab'];
  }
  static langMap = [
    { regex: /^(javascript|js|node|nodejs|jsx|tsx)$/i, value: 'js' },
    { regex: /^(javascriptobjectnotation|)$/i, value: 'json' }
  ];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.buttonActions = {
      del: () => {
        this.#$('.text').value = '';
        this.#render();
      },
      copy: async () => {
        const t = this.#$('.text');
        const copysp = this.#$('#copyBtn span');
        t.select();
        try {
          await navigator?.clipboard?.writeText?.(t.value);
          copysp.textContent = 'check';
        } catch (e) {
          copysp.textContent = 'error';
        }
        setTimeout(() => copysp.textContent = 'content_copy', 3000);
      }
    }
  }

  async connectedCallback() {
    this.#updateLang(this.getAttribute('lang') ?? 'plain');
    this.#updatePlace(this.getAttribute('placeholder') ?? '');
    this.#updateTab(this.getAttribute('tab') ?? '2');

    await this.#loadParser();
    
    this.#render();
  }
  #$(s, r=this.shadowRoot) {
    return r.querySelector(s);
  }
  async attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected) return;

    switch (name) {
      case 'lang': {
        this.#updateLang(newValue);
        await this.#loadParser();
        this.#render();
        break;
      }
      case 'placeholder': {
        this.#updatePlace(newValue);
        this.#render();
        break;
      }
      case 'tab': {
        this.#updateTab(newValue);
        break;
      }
    }
  }

  async #loadParser() {
    try {
      const { tokenize } = await import(`/Editor/lexers/${this.#lang}.min.js`);
      this.#parser = tokenize;
    } catch (e) {
      console.warn(`Parser for "${this.#lang}" not found. Falling back to plain.`);
      this.#parser =v=>[{type: 'plain', value: v}];
      this.#lang = 'plain';
    }
  }
  #normalizeLang(lang) {
    const name = lang.toLowerCase().trim();
    for (const item of Editor.langMap) {
      if (item.regex.test(name)) {
        return item.value;
      }
    }
    return name;
  }
  #updateLang(v) {
    this.#lang = this.#normalizeLang(v);
  }
  #updatePlace(v) {
    this.#place = v;
  }
  #updateTab(v) {
    this.#tab = ' '.repeat(v);
  }
  #escapeHtml(html) {
    return html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  #render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${this.#style}
      </style>
      <header>
        <span>${this.#lang}</span>
        <div class="icons">
          <button data-action="del"><span class="ms-icon">delete</span></button>
          <button data-action="copy" id="copyBtn"><span class="ms-icon">content_copy</span></button>
          <button><span class="ms-icon">file_save</span></button>
          <button><span class="ms-icon">document_search</span></button>
        </div>
      </header>
      <div class="flex">
        <div class="line"></div>
        <div class="content">
          <textarea class="highlignt-text" placeholder="${this.#place}" spellcheck="false"></textarea>
          <div class="highlight-view"></div>
        </div>
      </div>
    `;
    this.#attachEvent();
    this.#updateLines(this.#$('.text'));
  }
  #autoResize(text, view) {
    text.style.height = 'auto';
    text.style.height = text.scrollHeight + 'px';
    view.style.height = text.style.height;

    const content = text.parentElement;
    content.style.height = text.style.height;

    const flex = content.parentElement;
    flex.style.height = text.style.height;
  }
  #update(view, text) {
    view.innerHTML = this.#parser(text.value).map(tok => `<span class="${tok.type}">${this.#escapeHtml(tok.value)}</span>`).join('');
    this.#autoResize(text, view);
  }
  #updateLines(text) {
    const line = this.#$('.line');
    const view = this.#$('.view');
    const count = text.value.split('\n').length;
    const index = text.value.slice(0, text.selectionStart).split('\n').length;
  
    let html = '';
    for (let i = 1; i <= count; i++) {
      html += `<p${index === i ? ' class="active"' : ""}>${i}</p>`;
    }
    line.innerHTML = html;
    
    line.style.height = text.scrollHeight + 'px';
  }
  #attachEvent() {
    const text = this.#$('.text');
    const view = this.#$('.view');
    const buttons = this.#$('.icons');
    buttons.addEventListener('click', async e => {
      const tg = e.target.closest('button');
      if (!tg) return;

      const ac = tg.dataset.action;

      await this.buttonActions[ac]?.();
    });
    text.addEventListener('keyup', () => this.#updateLines(text));
    text.addEventListener('click', () => this.#updateLines(text));
    text.addEventListener('select', () => this.#updateLines(text));
    text.addEventListener('input', () => {
      view.textContent = text.value;
      if (this.#timer) clearTimeout(this.#timer);

      this.#timer = setTimeout(() => {
        this.#update(view, text);
      }, 300);
    });
    text.addEventListener('keydown', e => {
      this.#updateLines(text);
      if (e.isComposing || e.key === 'Process') {
        return;
      }
      const k = e.code.toLowerCase();
    
      const start = text.selectionStart;
      const end   = text.selectionEnd;
      const value = text.value;
    
      const before = value.slice(0, start);
      const after  = value.slice(end);
    
      const lines = value.split('\n');
    
      const lineIndex = before.split('\n').length - 1;
    
      const isSingleLine = before.split('\n').length === value.slice(0, end).split('\n').length;
      const isMultiLine = !isSingleLine;
    
      switch (k) {
        case 'tab': {
          if (e.ctrlKey) return;
          e.preventDefault();
    
          const tab = this.#tab ?? '\t';
    
          if (isSingleLine) {
            text.value = before + tab + after;
            const pos = start + tab.length;
            text.selectionStart = text.selectionEnd = pos;
    
          } else {
            const startLine = before.split('\n').length - 1;
            const endLine = value.slice(0, end).split('\n').length - 1;
    
            for (let i = startLine; i <= endLine; i++) {
              lines[i] = tab + lines[i];
            }
    
            text.value = lines.join('\n');
    
            const added = tab.length;
            text.selectionStart = start + added;
            text.selectionEnd   = end   + added * (endLine - startLine + 1);
          }

          this.#update(view, text);
          break;
        }
        case 'enter': {
          e.preventDefault();
          const currentLine = lines[lineIndex];
        
          const indentMatch = currentLine.match(/^[\t ]*/);
          const indent = indentMatch ? indentMatch[0] : '';
        
          const insert = '\n' + indent;
        
          text.value = before + insert + after;
        
          const pos = start + insert.length;
          text.selectionStart = text.selectionEnd = pos;

          this.#update(view, text);
          break;
        }
      }
      this.#updateLines(text);
    });
    text.addEventListener('scroll', () => {
      view.scrollTop = text.scrollTop;
      view.scrollLeft = text.scrollLeft;
    });
  }
}

customElements.define('com-editor', Editor);
