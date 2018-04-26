import React from 'react';
import Widget from 'laboratory/widget';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';

class Ripley extends Widget {
  constructor() {
    super(...arguments);
  }

  static get wiring() {
    return {
      id: 'id',
    };
  }

  render() {
    return (
      <Container kind="view" grow="1" spacing="large">
        <Container kind="pane-header">
          <Label text="Ripley" kind="pane-header" />
        </Container>
        <Container kind="panes" />
      </Container>
    );
  }
}

export default Ripley;
