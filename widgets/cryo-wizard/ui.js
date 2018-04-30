import React from 'react';

import {date as DateConverters} from 'xcraft-core-converters';
import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Widget from 'laboratory/widget';
import Ripley from 'workshop/ripley/widget';
import Calendar from 'gadgets/calendar/widget';

function configure(props) {
  const WiredFromRipley = Widget.Wired(Ripley)(props.ripleyFromId);
  const WiredToRipley = Widget.Wired(Ripley)(props.ripleyToId);
  return (
    <Container kind="column" grow="1">
      <WiredFromRipley
        onSelect={id => props.setForm(`form.fromSelected`, id)}
        description="Actions store (from)"
        hasBranches={true}
      />
      <Calendar
        monthCount="1"
        navigator="standard"
        startDate={DateConverters.getNowCanonical()}
        endDate={DateConverters.getNowCanonical()}
        visibleDate={DateConverters.getNowCanonical()}
        dates={[]}
        readonly={true}
        dateClicked={() => {}}
        visibleDateChanged={() => {}}
      />
      <WiredToRipley
        onSelect={id => props.setForm(`form.toSelected`, id)}
        description="Actions store (to)"
      />
    </Container>
  );
}

/******************************************************************************/
export default {
  mapper: {
    configure: wizard => {
      return {
        ripleyFromId: wizard.get('form.ripleyFromId'),
        ripleyToId: wizard.get('form.ripleyToId'),
      };
    },
  },
  configure: configure,
};
