const path = require('path');
const watt = require('gigawatts');
const common = require('./workitems/common.js');
const fs = require('fs');
const {jsify} = require('xcraft-core-utils/lib/string.js');
const {configurations} = require('goblin-workshop').buildEntity;

class MermaidLink {
  constructor(arrow, left, right, prop) {
    this._arrow = arrow;
    this._left = left;
    this._right = right;
    this._prop = prop;
  }

  toString(space = '') {
    return `${space}${this._left} ${this._arrow} ${this._right} : ${this._prop}`;
  }
}

class Mermaid {
  constructor() {
    this._links = [];
    this._classes = [];
  }

  pushClass(mermaidClass) {
    this._classes.push(mermaidClass);
  }

  setReference(left, right, prop) {
    this._links.push(new MermaidLink('..>', left, right, prop));
  }

  setValue(left, right, prop) {
    this._links.push(new MermaidLink('-->', left, right, prop));
  }

  toString(space = '    ') {
    let output = `classDiagram\n${space}direction LR\n`;
    output += `\n` + this._links.map((lnk) => lnk.toString(space)).join('\n');
    output += `\n` + this._classes.map((cl) => cl.toString(space)).join('\n');
    return output;
  }
}

class MermaidClass {
  constructor(entity) {
    this._entity = entity;
  }

  toString(space = '') {
    const {type, properties, ...other} = this._entity;
    return `${space}class ${jsify(type)}{\n${Object.entries(properties)
      .map(([prop, config]) => `${space}    +${config.type} ${prop}`)
      .join('\n')}\n${space}}\n`;
  }
}

function mermaidRender(output) {
  const mermaid = new Mermaid();

  for (const config of Object.values(configurations)) {
    if (config.transient) {
      continue;
    }

    const mermaidClass = new MermaidClass(config);

    if (config.references) {
      Object.entries(config.references).forEach(([p, r]) => {
        mermaid.setReference(jsify(config.type), common.getReferenceType(r), p);
      });
    }

    if (config.values) {
      Object.entries(config.values).forEach(([p, v]) => {
        mermaid.setValue(jsify(config.type), common.getReferenceType(v), p);
      });
    }

    mermaid.pushClass(mermaidClass);
  }

  const out = mermaid.toString();
  fs.writeFileSync(path.join(output, `entities.mermaid`), out);
}

const graphvizRender = watt(function* (output, next) {
  const JsonViz = require('jsonviz');

  const val = (left, right, prop) =>
    `"${left}" -> "${right}" [label="${prop}"]`;
  const ref = (left, right, prop) =>
    `"${left}" -> "${right}" [label="${prop}" style=dashed]`;

  const graphs = [];
  Object.values(configurations)
    .filter((c) => !c.transient)
    .forEach((c) => {
      const graph = {
        type: 'subgraph',
        name: c.type,
        graph: {
          label: c.type,
          fontname: 'Helvetica',
        },
        node: {
          fontname: 'Helvetica',
          fontsize: '6',
          style: 'filled',
          fillcolor: '#ffcccc',
          shape: 'plaintext',
        },
        edge: {
          fontname: 'Helvetica',
          fontsize: '8',
          color: '#888888',
          arrowsitze: '.6',
        },
        statements: [],
      };

      graph.statements.push(
        `"${
          c.type
        }" [style="" label=<<table bgcolor="#eeeeee" color="#eeeeee" border="5" style="rounded" cellpadding="1" cellborder="0"><tr><td colspan="2" bgcolor="#dddddd"><font point-size="9" color="#222222">${
          c.type
        }</font></td></tr><tr><td colspan="2"></td></tr>${Object.entries(
          c.properties
        )
          .sort(([a], [b]) => a < b)
          .map(
            ([prop, config]) =>
              `<tr><td align="left">${prop}</td><td align="left">${config.type}</td></tr>`
          )
          .join('')}${
          c.quests && Object.keys(c.quests).length
            ? `<tr><td colspan="2" bgcolor="#dddddd" height="1" cellpadding="0"></td></tr>` +
              Object.keys(c.quests)
                .sort()
                .map((quest) => `<tr><td align="left">${quest}()</td></tr>`)
                .join('')
            : ''
        }</table>>]`
      );
      if (c.references) {
        Object.entries(c.references).forEach(([p, r]) => {
          graph.statements.push(ref(c.type, common.getReferenceType(r), p));
        });
      }

      if (c.values) {
        Object.entries(c.values).forEach(([p, v]) => {
          graph.statements.push(val(c.type, common.getReferenceType(v), p));
        });
      }

      graphs.push(new JsonViz(graph));
    });

  const graph = {
    name: 'Workshop - Entities',
    graph: {
      rankdir: 'LR',
    },
    statements: graphs,
  };

  const viz = new JsonViz(graph);

  yield viz.save(path.join(output, `entities.svg`), {totalMemory: 128e6}, next);
  fs.writeFileSync(path.join(output, `entities.dot`), viz.dot());
});

module.exports = function* (quest, output, next) {
  try {
    mermaidRender(output);
    yield graphvizRender(output, next);
  } catch (ex) {
    quest.log.err(ex.stack || ex.message || ex);
  }
};
