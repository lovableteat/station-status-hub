// The real comparison page with a signed-in stand-in account and a stand-in backend (comparisonFailureMock.ts).
// The comparison engine is the real one, so a failure here is a real engine failure.
import React from 'react';
import {createRoot} from 'react-dom/client';
import ComparisonWorkspace from '../../src/components/comparison/ComparisonWorkspace';
import {Toaster} from '../../src/components/ui/sonner';
import '../../src/index.css';

createRoot(document.getElementById('root')).render(<div className="min-h-screen bg-background p-4 text-foreground"><ComparisonWorkspace /><Toaster /></div>);
