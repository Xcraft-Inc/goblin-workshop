'use strict';

const assert = require('assert');
const MarkdownBuilder = require('../lib/markdown-builder.js');
const T = require('goblin-nabu/widgets/helpers/t.js');

describe('MarkdownBuilder basis', function() {
  it('#Test title', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    assert.strictEqual(MD.toString(), '');

    MD.flush();
    MD.addTitle('hello');
    assert.strictEqual(MD.toString(), '```# hello\n```');
  });

  it('#Test blocks', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    MD.addBlock('hello');
    assert.strictEqual(MD.toString(), '```hello\n\n```');

    MD.flush();
    MD.addBlocks(['rouge', 'vert']);
    assert.strictEqual(MD.toString(), '```rouge\n\nvert\n\n```');
  });

  it('#Test bold and italic', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.bold('hello'), '__hello__');
    assert.strictEqual(MD.italic('hello'), '_hello_');
  });
});

describe('MarkdownBuilder join', function() {
  // prettier-ignore
  it('#Test parameters', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinWords([]        ), '');
    assert.strictEqual(MD.joinWords(['a']     ), 'a');
    assert.strictEqual(MD.joinWords( 'a'      ), 'a');
    assert.strictEqual(MD.joinWords(['a', 'b']), 'a b');
    assert.strictEqual(MD.joinWords( 'a', 'b' ), 'a b');
  });

  // prettier-ignore
  it('#Test join', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.join([],              'x'), '');
    assert.strictEqual(MD.join(['a'],           'x'), 'a');
    assert.strictEqual(MD.join(['a', 'b', 'c'], 'x'), 'axbxc');
  });

  // prettier-ignore
  it('#Test joinWords', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinWords(['a', 'b', 'c']), 'a b c');
    assert.strictEqual(MD.joinWords( 'a', 'b', 'c' ), 'a b c');
  });

  // prettier-ignore
  it('#Test joinSentences', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinSentences(['a', 'b', 'c']), 'a, b, c');
    assert.strictEqual(MD.joinSentences( 'a', 'b', 'c' ), 'a, b, c');
  });

  // prettier-ignore
  it('#Test joinHyphen', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinHyphen(['a', 'b', 'c']), 'a — b — c');
    assert.strictEqual(MD.joinHyphen( 'a', 'b', 'c' ), 'a — b — c');
  });

  // prettier-ignore
  it('#Test joinLines', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinLines(['a', 'b', 'c']), 'a\n\nb\n\nc');
    assert.strictEqual(MD.joinLines( 'a', 'b', 'c' ), 'a\n\nb\n\nc');
  });
});

describe('MarkdownBuilder list', function() {
  it('#Test parameters', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    MD.startList();
    MD.addUnorderedItem('');
    MD.endList();
    assert.strictEqual(MD.toString(), '');

    MD.flush();
    MD.startList();
    MD.addUnorderedItem('rouge');
    MD.endList();
    assert.strictEqual(MD.toString(), '```* rouge\n```');

    MD.flush();
    MD.startList();
    MD.addUnorderedItem('rouge');
    MD.addUnorderedItem('vert');
    MD.endList();
    assert.strictEqual(MD.toString(), '```* rouge\n* vert\n```');

    MD.flush();
    MD.addUnorderedList(['rouge', 'vert']);
    assert.strictEqual(MD.toString(), '```* rouge\n* vert\n```');

    MD.flush();
    MD.addOrderedList(['rouge', 'vert']);
    assert.strictEqual(MD.toString(), '```1. rouge\n1. vert\n```');
  });
});
