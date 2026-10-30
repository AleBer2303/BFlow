import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';
import { formatCop } from '../../domain';
import { GlassSurface } from '../../platform/glass/GlassSurface';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppText } from './Typography';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DynamicIslandPreviewProps {
  netCashFlowCop: number;
  receivedIncomeCop: number;
  paidExpensesCop: number;
  totalDebtCop: number;
  checklistCompleted: number;
  checklistTotal: number;
  monthLabel: string;
  testID?: string;
}

export function DynamicIslandPreview({
  netCashFlowCop,
  receivedIncomeCop,
  paidExpensesCop,
  totalDebtCop,
  checklistCompleted,
  checklistTotal,
  monthLabel,
  testID = 'dynamic-island-preview',
}: DynamicIslandPreviewProps): React.JSX.Element {
  const { colors, spacing, radius, mode } = useBFlowTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics safe fallback for web / non-supported environments
    }
  };

  const isPositive = netCashFlowCop >= 0;
  const flowColor = isPositive ? '#30D158' : '#FF453A';

  return (
    <GlassSurface
      elevated
      testID={testID}
      style={{
        backgroundColor: mode === 'dark' ? 'rgba(8, 11, 18, 0.92)' : 'rgba(15, 23, 42, 0.95)',
        borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.22)',
      }}
    >
      <View style={{ gap: spacing.sm }}>
        {/* Title row */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#0A84FF',
              }}
            />
            <AppText variant="headline">Dynamic Island (iOS 26)</AppText>
          </View>

          <AppText variant="micro" color={colors.text.secondary}>
            {isExpanded ? 'Toca para contraer' : 'Toca para expandir'}
          </AppText>
        </View>

        {/* Dynamic Island Physical Pill Simulator */}
        <Pressable
          testID="dynamic-island-pill"
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded
              ? 'Dynamic Island expandida. Toca para contraer.'
              : 'Dynamic Island compacta. Toca para expandir.'
          }
          onPress={handleToggle}
          style={[
            styles.pillBase,
            isExpanded ? styles.pillExpanded : styles.pillCompact,
            {
              backgroundColor: '#000000',
              borderColor: 'rgba(255, 255, 255, 0.16)',
            },
          ]}
        >
          {!isExpanded ? (
            /* Compact Mode */
            <View style={styles.compactRow}>
              {/* Left Monogram */}
              <View style={styles.monogramContainer}>
                <View style={styles.monogramDot} />
                <AppText style={styles.monogramText}>BF</AppText>
              </View>

              {/* Center Subtle Hint */}
              <AppText variant="micro" style={styles.compactHintText}>
                {monthLabel}
              </AppText>

              {/* Right Hero Amount */}
              <View style={styles.compactTrailing}>
                <AppText style={[styles.compactAmountText, { color: flowColor }]}>
                  {formatCop(netCashFlowCop)}
                </AppText>
              </View>
            </View>
          ) : (
            /* Expanded Mode */
            <View style={{ gap: spacing.md, width: '100%' }}>
              {/* Top Row: BF Monogram + Month + Checklist Pill */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={styles.monogramContainer}>
                  <View style={styles.monogramDot} />
                  <AppText style={styles.monogramText}>BF</AppText>
                  <AppText variant="micro" style={{ color: '#8E8E93', marginLeft: 4 }}>
                    {monthLabel}
                  </AppText>
                </View>

                <View style={styles.checklistCapsule}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: '#30D158',
                    }}
                  />
                  <AppText style={styles.checklistCapsuleText}>
                    {`${checklistCompleted}/${checklistTotal} Listos`}
                  </AppText>
                </View>
              </View>

              {/* Center: Net Cash Flow Hero */}
              <View style={{ alignItems: 'center', gap: 2 }}>
                <AppText variant="micro" style={{ color: '#98989D' }}>
                  Flujo Neto Disponible
                </AppText>
                <AppText style={[styles.heroAmountText, { color: flowColor }]}>
                  {formatCop(netCashFlowCop)}
                </AppText>
              </View>

              {/* Bottom: 3-column financial snapshot */}
              <View style={styles.metricsRow}>
                <View style={styles.metricColumn}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[styles.metricDot, { backgroundColor: '#30D158' }]} />
                    <AppText variant="micro" style={styles.metricLabel}>
                      Recibido
                    </AppText>
                  </View>
                  <AppText style={styles.metricValue}>
                    {formatCop(receivedIncomeCop)}
                  </AppText>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricColumn}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[styles.metricDot, { backgroundColor: '#AF52DE' }]} />
                    <AppText variant="micro" style={styles.metricLabel}>
                      Gastos
                    </AppText>
                  </View>
                  <AppText style={styles.metricValue}>
                    {formatCop(paidExpensesCop)}
                  </AppText>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricColumn}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[styles.metricDot, { backgroundColor: '#FF453A' }]} />
                    <AppText variant="micro" style={styles.metricLabel}>
                      Deuda
                    </AppText>
                  </View>
                  <AppText style={styles.metricValue}>
                    {formatCop(totalDebtCop)}
                  </AppText>
                </View>
              </View>
            </View>
          )}
        </Pressable>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  pillBase: {
    borderRadius: 28,
    borderWidth: 1,
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  pillCompact: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 46,
    justifyContent: 'center',
  },
  pillExpanded: {
    width: '100%',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monogramContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monogramDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#0A84FF',
  },
  monogramText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0A84FF',
    letterSpacing: 0.5,
  },
  compactHintText: {
    color: '#636366',
    fontSize: 11,
    fontWeight: '600',
  },
  compactTrailing: {
    alignItems: 'flex-end',
  },
  compactAmountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  checklistCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  checklistCapsuleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroAmountText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#8E8E93',
  },
  metricValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
