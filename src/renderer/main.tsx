import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { DialogHost } from './components/Dialog';
import { ToastHost } from './components/Toast';
import { PinHost } from './components/cases/pin';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <DialogHost />
      <PinHost />
      <ToastHost />
    </QueryClientProvider>
  </StrictMode>,
);
