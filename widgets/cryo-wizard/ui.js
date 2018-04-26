import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Widget from 'laboratory/widget';
import Ripley from 'workshop/ripley/widget';
import Field from 'gadgets/field/widget';

function configure(props) {
  const WiredRipley = Widget.Wired(Ripley)(props.ripleyId);
  return (
    <Container kind="column" grow="1">
      <WiredRipley onSelect={id => props.setForm(`form.selected`, id)} />
    </Container>
  );
}

/******************************************************************************/
export default {
  mapper: {
    configure: wizard => {
      return {
        ripleyId: wizard.get('form.ripleyId'),
      };
    },
  },
  configure: configure,
};
