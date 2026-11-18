import React from 'react';
import { View } from 'react-native';
import type { BFlowWorkspaceTab } from '../../../features/budget/store/useBudgetStore';
import { AppText } from '../Typography';
import {
  AccountNavIcon,
  ChecklistNavIcon,
  CierreNavIcon,
  DebtsNavIcon,
  SavingsNavIcon,
  SummaryNavIcon,
  type WorkspaceNavIconProps,
} from '../WorkspaceNavIcons';

export interface DockTabContentProps {
  id: BFlowWorkspaceTab;
  label: string;
  focused: boolean;
  color: string;
  /** Icon size (pt). The iOS dock keeps one size and magnifies with a transform instead. */
  iconSize?: number;
}

/** Icon of one dock destination. */
export function DockTabIcon({
  id,
  focused,
  color,
  size,
  svgComponent,
  svgProps,
}: {
  id: BFlowWorkspaceTab;
  focused: boolean;
  color: string;
  size: number;
  svgComponent?: WorkspaceNavIconProps['svgComponent'];
  svgProps?: WorkspaceNavIconProps['svgProps'];
}): React.JSX.Element {
  const shared = { size, color, focused, svgComponent, svgProps };
  switch (id) {
    case 'summary':
      return <SummaryNavIcon {...shared} />;
    case 'checklist':
      return <ChecklistNavIcon {...shared} />;
    case 'debts':
      return <DebtsNavIcon {...shared} />;
    case 'savings':
      return <SavingsNavIcon {...shared} />;
    case 'analytics':
      return <CierreNavIcon {...shared} />;
    case 'account':
      return <AccountNavIcon {...shared} />;
  }
}

/** Icon and label of one dock destination (shared by the iOS and Android docks). */
export function DockTabContent({
  id,
  label,
  focused,
  color,
  iconSize = focused ? 20 : 19,
}: DockTabContentProps): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <DockTabIcon id={id} focused={focused} color={color} size={iconSize} />
      <AppText
        variant="micro"
        color={color}
        style={{
          fontSize: 10,
          lineHeight: 13,
          fontWeight: focused ? '600' : '500',
          letterSpacing: -0.2,
          textAlign: 'center',
        }}
      >
        {label}
      </AppText>
    </View>
  );
}
