/**
 * Conteo de renders por vista (Fase 5 de PERFORMANCE_AUDIT_2026-11-09, sección 2.3).
 *
 * Cada vista de pestaña se envuelve en un React Profiler y se cuentan sus commits; las filas
 * del checklist y los campos de texto se cuentan a través de AppPressable / AppTextInput.
 * Los milisegundos de Jest no son representativos del dispositivo, así que solo se cuentan
 * renders. Con BFLOW_RENDER_REPORT=1 imprime las cifras para PERF_BASELINE.md.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../app/index';
import { BFlowThemeProvider } from '../../design-system/theme/ThemeContext';
import { DEMO_OWNER_USER } from '../../platform/auth/authAdapter';
import { useBudgetStore } from '../budget/store/useBudgetStore';

type Counts = Record<string, number>;

function mockCounts(): Counts {
  const holder = globalThis as unknown as { __bflowRenderCounts?: Counts };
  holder.__bflowRenderCounts ??= {};
  return holder.__bflowRenderCounts;
}

function mockBump(id: string): void {
  const counts = mockCounts();
  counts[id] = (counts[id] ?? 0) + 1;
}

/** Replaces `exportName` with the same component wrapped in a Profiler named `id`. */
function mockProfiled(id: string, actual: Record<string, unknown>, exportName: string) {
  const ReactLib = jest.requireActual<typeof import('react')>('react');
  const Original = actual[exportName] as React.ComponentType<Record<string, unknown>>;
  function Profiled(props: Record<string, unknown>) {
    return ReactLib.createElement(
      ReactLib.Profiler,
      { id, onRender: () => mockBump(id) },
      ReactLib.createElement(Original, props)
    );
  }
  return { ...actual, [exportName]: Profiled };
}

jest.mock('../summary/components/SummaryOverview', () =>
  mockProfiled(
    'summary',
    jest.requireActual('../summary/components/SummaryOverview'),
    'SummaryOverview'
  )
);
jest.mock('../checklist/components/ChecklistWorkspaceView', () =>
  mockProfiled(
    'checklist',
    jest.requireActual('../checklist/components/ChecklistWorkspaceView'),
    'ChecklistWorkspaceView'
  )
);
jest.mock('../debts/components/DebtsWorkspaceView', () =>
  mockProfiled(
    'debts',
    jest.requireActual('../debts/components/DebtsWorkspaceView'),
    'DebtsWorkspaceView'
  )
);
jest.mock('../savings/components/SavingsAndProvisionsView', () =>
  mockProfiled(
    'savings',
    jest.requireActual('../savings/components/SavingsAndProvisionsView'),
    'SavingsAndProvisionsView'
  )
);
jest.mock('../analytics/components/AnalyticsAndHistoryView', () =>
  mockProfiled(
    'analytics',
    jest.requireActual('../analytics/components/AnalyticsAndHistoryView'),
    'AnalyticsAndHistoryView'
  )
);
jest.mock('../auth/components/AccountProfileWorkspaceView', () =>
  mockProfiled(
    'account',
    jest.requireActual('../auth/components/AccountProfileWorkspaceView'),
    'AccountProfileWorkspaceView'
  )
);
jest.mock('../../design-system', () => {
  const ReactLib = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<Record<string, unknown>>('../../design-system');
  const OriginalPressable = actual.AppPressable as React.ComponentType<Record<string, unknown>>;
  const OriginalInput = actual.AppTextInput as React.ComponentType<Record<string, unknown>>;
  const AppPressable = ReactLib.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    if (typeof props.testID === 'string' && props.testID.startsWith('checklist-workspace-item-')) {
      mockBump('row');
    }
    return ReactLib.createElement(OriginalPressable, { ...props, ref });
  });
  const AppTextInput = ReactLib.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    mockBump('textInput');
    return ReactLib.createElement(OriginalInput, { ...props, ref });
  });
  return { ...actual, AppPressable, AppTextInput };
});

const VIEW_IDS = ['summary', 'checklist', 'debts', 'savings', 'analytics', 'account'] as const;

function takeCounts(): Counts {
  const counts = mockCounts();
  const snapshot = { ...counts };
  for (const key of Object.keys(counts)) {
    delete counts[key];
  }
  return snapshot;
}

describe('Fase 5: renders por acción', () => {
  beforeEach(() => {
    useBudgetStore.setState({ authUser: DEMO_OWNER_USER, needsOnboarding: false });
    useBudgetStore.getState().resetToOctober2026GoldenState();
    takeCounts();
  });

  it('mide los renders de cada acción de la sección 2.3', async () => {
    const report: Record<string, Counts> = {};
    let rootCommits = 0;

    render(
      <BFlowThemeProvider initialMode="dark">
        <React.Profiler id="root" onRender={() => (rootCommits += 1)}>
          <PhaseOneHomeScreen />
        </React.Profiler>
      </BFlowThemeProvider>
    );
    await act(async () => {});
    report.mount = { ...takeCounts(), root: rootCommits };

    const store = useBudgetStore;
    for (const tab of VIEW_IDS) {
      await act(async () => store.getState().setActiveTab(tab));
      rootCommits = 0;
      takeCounts();
      for (let i = 0; i < 5; i += 1) {
        await act(async () => store.getState().setSyncStatus(`mensaje ${i}`, i % 2 === 0));
      }
      report[`syncMessage_x5_on_${tab}`] = { ...takeCounts(), root: rootCommits };
    }

    await act(async () => store.getState().setActiveTab('checklist'));
    takeCounts();
    rootCommits = 0;
    const state = store.getState();
    await act(async () => {
      state.applyFullCloudAccount({
        activeMonthKey: state.activeMonthKey,
        availableMonths: state.availableMonths,
        concepts: [...state.concepts],
        entries: state.entries.map((entry) => ({ ...entry })),
        debtsByMonth: { ...state.debtsByMonth },
        debtPayments: [...state.debtPayments],
        savingsBucketsByMonth: { ...state.savingsBucketsByMonth },
        provisionPlan: state.idealMotoPlan,
        closedSnapshots: state.closedSnapshots,
        needsOnboarding: false,
      });
    });
    report.applyFullCloudAccount_identical = { ...takeCounts(), root: rootCommits };

    const entry = store
      .getState()
      .entries.find((e) => e.monthKey === store.getState().activeMonthKey);
    if (!entry) throw new Error('El seed de octubre debe tener movimientos');
    const visibleRows = store
      .getState()
      .entries.filter((e) => e.monthKey === store.getState().activeMonthKey).length;

    rootCommits = 0;
    await act(async () => {
      fireEvent.press(screen.getByTestId(`checklist-workspace-item-${entry.id}`));
    });
    report.toggle_one_row = { ...takeCounts(), root: rootCommits, visibleRows };

    await act(async () => {
      fireEvent.press(screen.getByTestId('open-add-movement-modal-button'));
    });
    takeCounts();
    rootCommits = 0;
    for (const text of ['1', '12', '123', '1234', '12345']) {
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('movement-amount-input'), text);
      });
    }
    report.type_5_chars_in_add_form = { ...takeCounts(), root: rootCommits };

    rootCommits = 0;
    await act(async () => store.setState({ pendingOfflineWritesCount: 3 }));
    report.pending_count_change_with_form_open = { ...takeCounts(), root: rootCommits };

    if (process.env.BFLOW_RENDER_REPORT === '1') {
      process.stdout.write(`\nRENDER_REPORT=${JSON.stringify(report)}\n`);
    }

    expect(report.mount?.root).toBeGreaterThan(0);
    expect(report.toggle_one_row?.row).toBeGreaterThan(0);

    // R-15: the sync message only re-renders the Account tab.
    for (const tab of VIEW_IDS.filter((id) => id !== 'account')) {
      expect(report[`syncMessage_x5_on_${tab}`]?.[tab] ?? 0).toBe(0);
    }
    expect(report.syncMessage_x5_on_account?.account).toBe(5);
  });
});
