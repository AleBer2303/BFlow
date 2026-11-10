/**
 * src/design-system/components/navigation/workspaceTabs.tsx
 *
 * The six workspace destinations, shared by every navigation pattern (iOS floating dock,
 * Android navigation bar, Web header and tab bar). One list, one set of testIDs
 * (`workspace-tab-<id>`), so functional tests run unchanged on the three skins.
 */

import React from 'react';
import type { BFlowWorkspaceTab } from '../../../features/budget/store/useBudgetStore';
import {
  AccountNavIcon,
  ChecklistNavIcon,
  CierreNavIcon,
  DebtsNavIcon,
  SavingsNavIcon,
  SummaryNavIcon,
} from '../WorkspaceNavIcons';

export interface WorkspaceTabConfig {
  id: BFlowWorkspaceTab;
  label: string;
}

export const WORKSPACE_TABS: ReadonlyArray<WorkspaceTabConfig> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'debts', label: 'Deudas' },
  { id: 'savings', label: 'Ahorros' },
  { id: 'analytics', label: 'Cierre' },
  { id: 'account', label: 'Cuenta' },
];

export interface WorkspaceNavigationProps {
  activeTab: BFlowWorkspaceTab;
  onSelectTab: (tab: BFlowWorkspaceTab) => void;
  testID?: string;
}

export interface WorkspaceTabIconProps {
  id: BFlowWorkspaceTab;
  size: number;
  color: string;
  focused: boolean;
}

export function WorkspaceTabIcon({
  id,
  size,
  color,
  focused,
}: WorkspaceTabIconProps): React.JSX.Element {
  switch (id) {
    case 'summary':
      return <SummaryNavIcon size={size} color={color} focused={focused} />;
    case 'checklist':
      return <ChecklistNavIcon size={size} color={color} focused={focused} />;
    case 'debts':
      return <DebtsNavIcon size={size} color={color} focused={focused} />;
    case 'savings':
      return <SavingsNavIcon size={size} color={color} focused={focused} />;
    case 'analytics':
      return <CierreNavIcon size={size} color={color} focused={focused} />;
    case 'account':
      return <AccountNavIcon size={size} color={color} focused={focused} />;
  }
}
