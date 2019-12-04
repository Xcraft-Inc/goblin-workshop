module.exports = type => `'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: '${type}',
  kind: 'search',
  title: T("${type}"),
  hintText: 'par ${type}',
  list: "${type}",
  hinters: {
    ${type}: {
      onValidate: function*(quest, selection) {
        const desk = quest.getAPI(quest.goblin.getX('desktopId'));
        const ${type} = yield quest.me.getEntity({
          entityId: selection.value,
          privateState: true,
        });
        yield desk.addWorkitem({
          workitem: {
            id: ${type}.get('id'),
            name: '${type}-workitem',
            description: ${type}.get('meta.summaries.info'),
            view: 'default',
            kind: 'tab',
            icon: 'solid/pencil',
            isClosable: true,
          },
          navigate: true,
        });
      },
    },
  },
};

exports.xcraftCommands = function() {
  return buildWorkitem(config);
};`;
