import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PcbDesignerWorkspace } from '../../src/components/pcb-designer/PcbDesignerWorkspace.tsx';
import { fixture } from './pcbRecoveryServices.js';
import { pushWorkspaceHistory, watchWorkspaceHistory } from '../../src/lib/workspaceHistory.ts';

function Fixture() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    fixture.setVisible = setVisible;
    fixture.history = { accepted: [] };
    fixture.history.push = () => {
      const next = new URL(location.href);
      next.searchParams.set('view', 'second');
      pushWorkspaceHistory(next);
    };
    return watchWorkspaceHistory(() => fixture.history.accepted.push(location.href));
  }, []);
  return <main className="pcb-synthetic-host">
    <p className="pcb-synthetic-notice">Synthetic PCB session recovery fixture. No production service or data.</p>
    {visible ? <PcbDesignerWorkspace /> : <p data-testid="fixture-unmounted">Synthetic workspace closed</p>}
  </main>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
