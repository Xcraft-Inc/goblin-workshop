// https://www.npmjs.com/package/react-markdown
// http://rexxars.github.io/react-markdown/

class MarkdownBuilder {
  constructor() {
    this._formatted = '';
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
    return MarkdownBuilder._join(array, '\\\n');
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
    if (MarkdownBuilder._isMarkdown(title)) {
      throw new Error(`Markdown not accepted in title: ${title}`);
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
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
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
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
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
    for (let i = 0; i < this._level; i++) {
      this._formatted += '  ';
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
      return '```' + this._formatted + '```';
    }
  }

  static _join(array, separator) {
    if (!array || array.length === 0) {
      return null;
    }
    return array.filter(item => !!item).join(separator);
  }

  static _isEmpty(text) {
    return !text || !text.length === 0;
  }

  static _isMarkdown(text) {
    return text && text.startsWith('```') && text.endsWith('```');
  }

  static _extract(text) {
    return text.substring(3, text.length - 3);
  }
}

module.exports = MarkdownBuilder;
