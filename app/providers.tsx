// app/providers.tsx
'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY!}
      projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID!}
      chain={base}
      config={{
        appearance: {
          name: 'X & O',
          mode: 'dark',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </OnchainKitProvider>
  );
}