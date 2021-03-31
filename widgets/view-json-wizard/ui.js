//T:2019-02-27
import React from 'react';
import C from 'goblin-laboratory/widgets/connect-helpers/c';
import withC from 'goblin-laboratory/widgets/connect-helpers/with-c';
import Container from 'goblin-gadgets/widgets/container/widget';
import ScrollableContainer from 'goblin-gadgets/widgets/scrollable-container/widget';
import Widget from 'goblin-laboratory/widgets/widget';

function JsonViewNC({data}) {
  const json = JSON.stringify(data, null, 2);
  const copyToClipBoard = () => {
    Widget.copyTextToClipboard(json);
  };
  return <pre style={{userSelect: 'text'}}>{json}</pre>;
}
const JsonView = withC(JsonViewNC);

function view(props) {
  return (
    <Container kind="column" grow="1" height="100%">
      <JsonView data={C('.form')} />
    </Container>
  );
}

/******************************************************************************/

export default {
  view,
};
