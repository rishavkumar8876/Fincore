import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../src/store/store';
import { CustomerDashboardView } from '../src/components/CustomerDashboardView';

describe('FinCore Customer Dashboard (Assessment 01)', () => {
  test('renders unauthenticated welcome state', () => {
    render(
      <Provider store={store}>
        <CustomerDashboardView isAuthenticated={false} />
      </Provider>
    );
    expect(screen.getByText(/Welcome to FinCore Simulated Wallet/i)).toBeInTheDocument();
  });

  test('renders simulated wallet balance and validates invalid transfer input', () => {
    render(
      <Provider store={store}>
        <CustomerDashboardView
          isAuthenticated={true}
          initialWallets={[
            {
              id: '11111111-1111-1111-1111-111111111111',
              account_number: 'FC-1001-0001',
              currency: 'USD',
              balance: '2500.0000',
              available_balance: '2500.0000',
              status: 'active',
            },
          ]}
          initialTransactions={[
            {
              id: 'tx-1',
              reference: 'TX-ABC123',
              type: 'transfer',
              status: 'completed',
              amount: '100.0000',
              fee_amount: '0.2500',
              description: 'Test transfer',
              created_at: '2026-11-25T10:00:00Z',
            },
          ]}
        />
      </Provider>
    );

    expect(screen.getAllByText(/FC-1001-0001/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/active · SIMULATED/i)).toBeInTheDocument();
    expect(screen.getByText('TX-ABC123')).toBeInTheDocument();

    // Submit empty transfer form -> shows validation error
    fireEvent.click(screen.getByRole('button', { name: /Submit Transfer/i }));
    expect(screen.getByText(/Enter destination account number/i)).toBeInTheDocument();
  });
});
