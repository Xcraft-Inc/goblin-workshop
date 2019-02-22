// https://www.npmjs.com/package/react-markdown
// http://rexxars.github.io/react-markdown/

const {computeMessageId} = require('goblin-nabu/lib/helpers.js');

class MarkdownBuilder {
  constructor() {
    this._formatted = '';
    this._refs = {};
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
    return text ? `__${text}__` : null;
  }

  italic(text) {
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
      MarkdownBuilder._isMarkdownWithRefs(title)
    ) {
      throw new Error(`Markdown not accepted in title: ${title}`);
    }
    if (MarkdownBuilder._isNabu(title)) {
      this._addNabuRef(title);
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
    if (MarkdownBuilder._isMarkdownWithRefs(text)) {
      text = MarkdownBuilder._extractWithRefs(text);
    }
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
    }

    if (MarkdownBuilder._isNabu(text)) {
      this._addNabuRef(text);
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
    if (MarkdownBuilder._isMarkdownWithRefs(text)) {
      text = MarkdownBuilder._extractWithRefs(text);
    }
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
    }

    if (MarkdownBuilder._isNabu(text)) {
      this._formatted += `* `;
      this._addNabuRef(text);
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
    if (MarkdownBuilder._isMarkdownWithRefs(text)) {
      text = MarkdownBuilder._extractWithRefs(text);
    }
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
    }

    if (MarkdownBuilder._isNabu(text)) {
      this._formatted += `1. `;
      this._addNabuRef(text);
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
      if (this._refs.length === 0) {
        return '```' + this._formatted + '```';
      } else {
        return {
          _type: 'markdownWithRefs',
          _string: '```' + this._formatted + '```',
          _refs: this.refs,
        };
      }
    }
  }

  static _join(array, separator) {
    if (!array || array.length === 0) {
      return null;
    }
    return array
      .filter(item => !!item)
      .map(item => {
        if (MarkdownBuilder._isNabu(item)) {
          return this._addNabuRef(item, true);
        } else {
          return item;
        }
      })
      .join(separator);
  }

  _addNabuRef(text, doNotUpdate) {
    const msgId = computeMessageId(text.nabuId);
    return this._addRef(msgId, text, doNotUpdate);
  }

  _addRef(refId, referenced, doNotUpdate) {
    const refWrapper = `@{${refId}}`;

    if (!doNotUpdate) {
      this._formatted += refWrapper;
    }

    if (!this._refs[refId]) {
      this._refs[refId] = referenced;
    }

    return refWrapper;
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

  static _isMarkdownWithRefs(text) {
    return (
      text && typeof text === 'object' && text._type === 'markdownWithRefs'
    );
  }

  static _isNabu(text) {
    return typeof text === 'object' && text.nabuId;
  }

  static _extract(text) {
    return text.substring(3, text.length - 3);
  }

  static _extractWithRefs(text) {
    for (let refId of text._refs) {
      if (!this._refs[refId]) {
        this._refs[refId] = text._refs[refId];
      }
    }

    return MarkdownBuilder._extract(text._string);
  }
}

module.exports = MarkdownBuilder;
