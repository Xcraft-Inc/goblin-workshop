import React from 'react';
import Widget from 'laboratory/widget';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';

class Cryo extends Widget {
  constructor() {
    super(...arguments);
  }

  static get wiring() {
    return {
      id: 'id',
      available: 'cryo.available',
    };
  }

  render() {
    return (
      <Container kind="view" grow="1" spacing="large">
        <Container kind="pane-header">
          <Label text="Ripley" kind="pane-header" />
        </Container>
        {this.props.available ? (
          <Container kind="panes">
            <Label text="Machine temporelle" kind="title" />
          </Container>
        ) : (
          <Container kind="panes">
            <Label text="Le moteur cryo n'est pas disponible" />
          </Container>
        )}
      </Container>
    );
  }
}

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
    const CryoWidget = Widget.Wired(Cryo)('workshop');
    return <CryoWidget />;
  }
}

export default Ripley;
