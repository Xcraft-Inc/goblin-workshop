'use strict';

const assert = require('assert');
const MarkdownBuilder = require('../lib/markdown-builder.js');

describe('goblin.workshop', function () {
  describe('MarkdownBuilder basis', function () {
    it('title', function () {
      const MD = new MarkdownBuilder();

      MD.flush();
      assert.strictEqual(MD.toString(), '');

      MD.flush();
      MD.addTitle('hello');
      assert.strictEqual(MD.toString(), '```# hello\n```');
    });

    it('blocks', function () {
      const MD = new MarkdownBuilder();

      MD.flush();
      MD.addBlock('');
      assert.strictEqual(MD.toString(), '');

      MD.flush();
      MD.addBlock('hello');
      assert.strictEqual(MD.toString(), '```hello\n\n```');

      MD.flush();
      MD.addBlocks(['rouge', 'vert']);
      assert.strictEqual(MD.toString(), '```rouge\n\nvert\n\n```');

      MD.flush();
      MD.addBlocks('rouge', 'vert');
      assert.strictEqual(MD.toString(), '```rouge\n\nvert\n\n```');
    });

    it('bold and italic', function () {
      const MD = new MarkdownBuilder();
      assert.strictEqual(MD.bold(''), '');
      assert.strictEqual(MD.bold('hello'), '**hello**');
      assert.strictEqual(MD.italic('hello'), '*hello*');
    });
  });

  describe('MarkdownBuilder join', function () {
    // prettier-ignore
    it('parameters', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinWords([]        ), '');
    assert.strictEqual(MD.joinWords(['a']     ), 'a');
    assert.strictEqual(MD.joinWords( 'a'      ), 'a');
    assert.strictEqual(MD.joinWords(['a', 'b']), 'a b');
    assert.strictEqual(MD.joinWords( 'a', 'b' ), 'a b');
  });

    // prettier-ignore
    it('join', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.join([],              'x'), '');
    assert.strictEqual(MD.join(['a'],           'x'), 'a');
    assert.strictEqual(MD.join(['a', 'b', 'c'], 'x'), 'axbxc');
  });

    // prettier-ignore
    it('joinWords', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinWords(['a', 'b', 'c']), 'a b c');
    assert.strictEqual(MD.joinWords( 'a', 'b', 'c' ), 'a b c');
  });

    // prettier-ignore
    it('joinSentences', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinSentences(['a', 'b', 'c']), 'a, b, c');
    assert.strictEqual(MD.joinSentences( 'a', 'b', 'c' ), 'a, b, c');
  });

    // prettier-ignore
    it('joinHyphen', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinHyphen(['a', 'b', 'c']), 'a — b — c');
    assert.strictEqual(MD.joinHyphen( 'a', 'b', 'c' ), 'a — b — c');
  });

    // prettier-ignore
    it('joinLines', function() {
    const MD = new MarkdownBuilder();
    assert.strictEqual(MD.joinLines(['a', 'b', 'c']), 'a\n\nb\n\nc');
    assert.strictEqual(MD.joinLines( 'a', 'b', 'c' ), 'a\n\nb\n\nc');
  });
  });

  describe('MarkdownBuilder list', function () {
    // prettier-ignore
    it('unordered', function() {
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
    MD.addUnorderedList('rouge', 'vert');
    assert.strictEqual(MD.toString(), '```* rouge\n* vert\n```');
  });

    it('ordered', function () {
      const MD = new MarkdownBuilder();

      MD.flush();
      MD.addOrderedList(['rouge', 'vert']);
      assert.strictEqual(MD.toString(), '```1. rouge\n1. vert\n```');

      MD.flush();
      MD.addOrderedList('rouge', 'vert');
      assert.strictEqual(MD.toString(), '```1. rouge\n1. vert\n```');
    });
  });

  describe('MarkdownBuilder mix', function () {
    // prettier-ignore
    it('mix titles', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    MD.addTitle('hello');
    const x = MD.toString();

    MD.flush();
    MD.addTitle('world');
    const y = MD.toString();

    MD.flush();
    MD.addBlocks(x,y);
    assert.strictEqual(MD.toString(), '```# hello\n\n\n# world\n\n\n```');
  });

    // prettier-ignore
    it('mix lists', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    MD.startList();
      MD.addUnorderedItem('lundi');
      MD.addUnorderedItem('mardi');
    MD.endList();
    const x = MD.toString();

    MD.flush();
    MD.startList();
      MD.addUnorderedItem('mercredi');
      MD.addUnorderedItem('jeudi');
    MD.endList();
    const y = MD.toString();

    MD.flush();
    MD.addBlocks(x, y);
    assert.strictEqual(
      MD.toString(),
      '```* lundi\n* mardi\n\n\n* mercredi\n* jeudi\n\n\n```'
    );
  });
  });

  describe('MarkdownBuilder full', function () {
    // prettier-ignore
    it('one level', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    MD.addTitle('Titre');
    MD.startList();
      MD.addUnorderedItem('rouge');
      MD.addUnorderedItem('vert');
    MD.endList();
    MD.startList();
      MD.addOrderedItem('lundi');
      MD.addOrderedItem('mardi');
    MD.endList();
    MD.addBlock('fin');
    assert.strictEqual(MD.toString(), '```# Titre\n* rouge\n* vert\n1. lundi\n1. mardi\nfin\n\n```');
  });

    // prettier-ignore
    it('two levels', function() {
    const MD = new MarkdownBuilder();

    MD.flush();
    MD.addTitle('Titre');
    MD.startList();
      MD.addUnorderedItem('rouge');
      MD.startList();
        MD.addUnorderedItem('rouge.a');
        MD.addUnorderedItem('rouge.b');
      MD.endList();
    MD.endList();
    MD.startList();
    MD.addUnorderedItem('vert');
      MD.startList();
        MD.addUnorderedItem('vert.a');
        MD.addUnorderedItem('vert.b');
      MD.endList();
    MD.endList();
    MD.addBlock('fin');
    assert.strictEqual(MD.toString(), '```# Titre\n* rouge\n  * rouge.a\n  * rouge.b\n* vert\n  * vert.a\n  * vert.b\nfin\n\n```');
  });

    it('two levels array', function () {
      const MD = new MarkdownBuilder();

      MD.flush();
      MD.addTitle('Titre');
      MD.addUnorderedList([
        'rouge',
        ['rouge.a', 'rouge.b'],
        'vert',
        ['vert.a', 'vert.b'],
      ]);
      MD.addBlock('fin');
      assert.strictEqual(
        MD.toString(),
        '```# Titre\n* rouge\n  * rouge.a\n  * rouge.b\n* vert\n  * vert.a\n  * vert.b\nfin\n\n```'
      );
    });
  });
});
