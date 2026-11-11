/**
 * src/features/auth/components/AccountTab.tsx
 *
 * Container of the Account tab. It is the only tab that reads the sync message and the
 * syncing flag, so status updates during a sync do not re-render the other tabs.
 */

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import {
  AccountProfileWorkspaceView,
  type AccountProfileWorkspaceViewProps,
} from './AccountProfileWorkspaceView';

export type AccountTabProps = Omit<
  AccountProfileWorkspaceViewProps,
  'authUser' | 'syncStatusMessage' | 'isSyncing'
>;

export const AccountTab = React.memo(function AccountTab(
  props: AccountTabProps
): React.JSX.Element | null {
  const { authUser, syncMessage, isSyncing } = useBudgetStore(
    useShallow((state) => ({
      authUser: state.authUser,
      syncMessage: state.syncMessage,
      isSyncing: state.isSyncing,
    }))
  );
  if (!authUser) {
    return null;
  }
  return (
    <AccountProfileWorkspaceView
      {...props}
      authUser={authUser}
      syncStatusMessage={syncMessage}
      isSyncing={isSyncing}
    />
  );
});
