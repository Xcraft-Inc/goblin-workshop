const path = require('path');
const JsonViz = require('jsonviz');
const common = require('./workitems/common.js');
const {configurations} = require('goblin-workshop').buildEntity;

const buildLabel = (type, fgColor, bgColor) => {
  const label =
    `"${type}" [` +
    `  color="${fgColor}"` +
    `  fillcolor="${bgColor}" ` +
    `  label=""` +
    `  xlabel=<` +
    `    <table bgcolor="white"` +
    `           border="0"` +
    `           cellpadding="1"` +
    `           cellspacing="0"` +
    `           style="rounded">` +
    `      <tr><td>${type}</td></tr>"` +
    `    </table>` +
    `  >` +
    `]`;

  return label.replace(/>[ ]+/g, '>').replace(/[ ]{2,}/g, ' ');
};

const entry = (left, right) => `"${left}" -> "${right}"`;

module.exports = function*(quest, output, next) {
  const graphs = [];
  Object.values(configurations).forEach(c => {
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
      },
      edge: {
        fontname: 'Helvetica',
        color: '#888888',
      },
      statements: [],
    };

    //TODO
    graph.node.shape = 'circle';
    graph.node.width = 0.15;
    graph.node.height = 0.15;
    graph.node.fixedsize = true;
    graph.edge.arrowsize = '.2';
    graph.edge.penwidth = '.3';

    graph.statements.push(buildLabel(c.type, 'black', 'white'));
    if (c.references) {
      Object.entries(c.references).forEach(([p, r]) => {
        graph.statements.push(entry(c.type, common.getReferenceType(r)));
      });
    }

    if (c.values) {
      Object.entries(c.values).forEach(([p, v]) => {
        graph.statements.push(entry(c.type, common.getReferenceType(v)));
      });
    }

    graphs.push(new JsonViz(graph));
  });

  const graph = {
    name: 'Workshop - Entities',
    graph: {
      rankdir: 'LR',
      splines: 'polyline',
      fontname: 'Helvetica',
      style: 'dashed',
      margin: '50',
      layout: 'dot',
      dpi: '96',
      outputorder: 'edgesfirst',
    },
    statements: graphs,
  };

  const viz = new JsonViz(graph);

  try {
    yield viz.save(
      path.join(output, `entities.svg`),
      {
        totalMemory: 128e6,
      },
      next
    );
    const dot = viz.dot();
    console.dir(dot);
  } catch (ex) {
    quest.log.err(ex);
  }
};
