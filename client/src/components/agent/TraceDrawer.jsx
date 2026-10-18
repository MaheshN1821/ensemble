import { useEffect } from 'react';
import { useGovernor } from '../../hooks/useAgent.js';
import Sheet from '../ui/Sheet.jsx';
import Governor from './Governor.jsx';
import TracePanel from './TracePanel.jsx';

/** "Under the hood" from the header, on any page: the limits, then the live trace. Two clicks from anywhere. */
export default function TraceDrawer({ sessionId, open, onClose }) {
  const { governor, refresh } = useGovernor(sessionId);
  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const t = setInterval(refresh, 4000); // units change while looks are drawn
    return () => clearInterval(t);
  }, [open, refresh]);
  return (
    <Sheet open={open} onClose={onClose} title="Under the hood" labelId="hood-title">
      <Governor governor={governor} />
      <div className="mt-6"><TracePanel sessionId={sessionId} active={open} /></div>
    </Sheet>
  );
}
