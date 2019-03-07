// https://www.npmjs.com/package/react-markdown
// http://rexxars.github.io/react-markdown/

const uuidV4 = require('uuid/v4');
const StringBuilder = require('goblin-nabu/lib/string-builder.js');

class MarkdownBuilder {
  constructor() {
    this._formatted = '';
    this._refs = {};
    this._withRefs = false;
    this._level = -1;
  }

  joinWords(array) {
    return MarkdownBuilder._join(array, ' ');
  }

  joinSentences(array) {
    return MarkdownBuilder._join(array, ', ');
  }

  joinHyphen(array) {
    return MarkdownBuilder._join(array, ' — '); // U+2014: tiret cadratin
  }

  joinLines(array) {
    return MarkdownBuilder._join(array, '\n\n');
  }

  join(array, separator) {
    return MarkdownBuilder._join(array, separator);
  }

  bold(text) {
    if (MarkdownBuilder._isRef(text)) {
      const refId = this._addRef(text, true);
      return `__${refId}__`;
    }
    return text ? `__${text}__` : null;
  }

  italic(text) {
    if (MarkdownBuilder._isRef(text)) {
      const refId = this._addRef(text, true);
      return `_${refId}_`;
    }
    return text ? `_${text}_` : null;
  }

  flush() {
    this._formatted = '';
    this._level = -1;
  }

  addTitle(title) {
    if (MarkdownBuilder._isEmpty(title)) {
      return;
    }
    if (
      MarkdownBuilder._isMarkdown(title) ||
      MarkdownBuilder._isTranslatableMarkdown(title)
    ) {
      throw new Error(`Markdown not accepted in title: ${title}`);
    }
    if (MarkdownBuilder._isRef(title)) {
      this._formatted += `# `;
      this._addRef(title);
      this._formatted += `\n`;
      return;
    }
    this._formatted += `# ${title}\n`;
  }

  addBlock(text) {
    if (MarkdownBuilder._isEmpty(text)) {
      return;
    }
    if (MarkdownBuilder._isMarkdown(text)) {
      text = MarkdownBuilder._extract(text);
    }
    if (MarkdownBuilder._isTranslatableMarkdown(text)) {
      text = this._extractWithRefs(text);
    }
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
    }

    if (MarkdownBuilder._isRef(text)) {
      this._addRef(text);
      this._formatted += `\n\n`;
      return;
    }

    this._formatted += `${text}\n\n`;
  }

  addBlocks(list) {
    this.startList();
    list.forEach(text => {
      this.addBlock(text);
    });
    this.endList();
  }

  addUnorderedItem(text) {
    if (this._level < 0) {
      throw new Error(`Invalid level: ${this._level}`);
    }
    if (MarkdownBuilder._isEmpty(text)) {
      return;
    }
    if (MarkdownBuilder._isMarkdown(text)) {
      text = MarkdownBuilder._extract(text);
    }
    if (MarkdownBuilder._isTranslatableMarkdown(text)) {
      text = this._extractWithRefs(text);
    }
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
    }

    if (MarkdownBuilder._isRef(text)) {
      this._formatted += `* `;
      this._addRef(text);
      this._formatted += `\n`;
      return;
    }

    this._formatted += `* ${text}\n`;
  }

  addUnorderedList(list) {
    this.startList();
    list.forEach(text => {
      this.addUnorderedItem(text);
    });
    this.endList();
  }

  addOrderedItem(text) {
    if (this._level < 0) {
      throw new Error(`Invalid level: ${this._level}`);
    }
    if (MarkdownBuilder._isEmpty(text)) {
      return;
    }
    if (MarkdownBuilder._isMarkdown(text)) {
      text = MarkdownBuilder._extract(text);
    }
    if (MarkdownBuilder._isTranslatableMarkdown(text)) {
      text = this._extractWithRefs(text);
    }
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
    }

    if (MarkdownBuilder._isRef(text)) {
      this._formatted += `1. `;
      this._addRef(text);
      this._formatted += `\n`;
      return;
    }

    this._formatted += `1. ${text}\n`;
  }

  addOrderedList(list) {
    this.startList();
    list.forEach(text => {
      this.addOrderedItem(text);
    });
    this.endList();
  }

  startList() {
    this._level++;
  }

  endList() {
    this._level--;
  }

  toString() {
    //- console.log ('toString = ' + this._formatted);
    if (this._formatted === '') {
      return '';
    } else {
      if (!this._withRefs) {
        return '```' + this._formatted + '```';
      } else {
        return {
          _type: 'translatableMarkdown',
          _string: '```' + this._formatted + '```',
          _refs: this._refs,
        };
      }
    }
  }

  static _join(array, separator) {
    return StringBuilder.join(array, separator);
  }

  _addRef(referenced, doNotUpdate) {
    const refId = uuidV4().slice(0, 16);
    const refWrapper = `@{${refId}}`;

    if (!doNotUpdate) {
      this._formatted += refWrapper;
    }

    if (!this._refs[refId]) {
      this._refs[refId] = referenced;
      this._withRefs = true;
    }

    return refWrapper;
  }

  _extractWithRefs(text) {
    for (let refId of Object.keys(text._refs)) {
      if (!this._refs[refId]) {
        this._refs[refId] = text._refs[refId];
        this._withRefs = true;
      }
    }

    return MarkdownBuilder._extract(text._string);
  }

  static _isEmpty(text) {
    return !text || !text.length === 0;
  }

  static _isMarkdown(text) {
    return (
      text &&
      typeof text === 'string' &&
      text.startsWith('```') &&
      text.endsWith('```')
    );
  }

  static _isTranslatableMarkdown(text) {
    return (
      text && typeof text === 'object' && text._type === 'translatableMarkdown'
    );
  }

  static _isRef(text) {
    return (
      text &&
      typeof text === 'object' &&
      (text.nabuId || text._type === 'translatableString')
    );
  }

  static _extract(text) {
    return text.substring(3, text.length - 3);
  }
}

module.exports = MarkdownBuilder;
