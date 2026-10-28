import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../design-system';
import { formatMonthKeyLabelEs } from '../domain/date/monthKey';
import { resolveRuntimeCapabilities } from '../platform/mode/runtimeMode';

export default function PhaseOneHomeScreen(): React.JSX.Element {
  const { colors, spacing, radius, mode, toggleTheme } = useBFlowTheme();
  const [pulseCount, setPulseCount] = useState(0);
  const runtime = resolveRuntimeCapabilities();
  const activeMonthLabel = formatMonthKeyLabelEs('2026-10');

  const handleTestHaptic = async () => {
    setPulseCount((prev) => prev + 1);
    if (Platform.OS !== 'web') {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore haptics errors in environments without Taptic Engine
      }
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background.primary }}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xxxl,
        paddingBottom: spacing.xxl,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <StatusBadge testID="runtime-mode-badge" label={runtime.label} status="info" />
          <AppText variant="title1">{`BFlow · ${activeMonthLabel}`}</AppText>
        </View>

        <Pressable
          testID="theme-toggle-button"
          accessibilityRole="button"
          accessibilityLabel="Cambiar tema claro u oscuro"
          onPress={toggleTheme}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption">{mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</AppText>
        </Pressable>
      </View>

      <GlassSurface elevated testID="net-flow-hero-card">
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Flujo Neto (En caja hoy · B6)
            </AppText>
            <StatusBadge label="Checklist 6 de 12" status="completed" />
          </View>
          <CurrencyText testID="golden-net-flow" amount={1_080_000} variant="heroCurrency" tone="income" />
          <AppText variant="caption" color={colors.text.secondary}>
            Flujo proyectado del mes: $ 2.630.000
          </AppText>
        </View>
      </GlassSurface>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <GlassSurface style={{ flex: 1 }} testID="income-summary-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Ingresos Recibidos (B2)
            </AppText>
            <CurrencyText amount={4_000_000} variant="title2" tone="income" />
            <AppText variant="micro" color={colors.text.muted}>
              Previstos: $ 6.000.000
            </AppText>
          </View>
        </GlassSurface>

        <GlassSurface style={{ flex: 1 }} testID="expense-summary-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Gastos Pagados (B4)
            </AppText>
            <CurrencyText amount={2_920_000} variant="title2" tone="expense" />
            <AppText variant="micro" color={colors.semantic.pending}>
              Pendientes (B5): $ 450.000
            </AppText>
          </View>
        </GlassSurface>
      </View>

      <GlassSurface testID="debt-summary-card">
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="headline">Control Deuda FUNFAMI (H6)</AppText>
            <StatusBadge label="Cuota $ 1.800.000 Pagada" status="debt" />
          </View>
          <CurrencyText amount={6_200_000} variant="title2" tone="debt" />
          <AppText variant="caption" color={colors.text.secondary}>
            CB300F - MOTO: $ 2.600.000 · ESP. IA: $ 3.600.000
          </AppText>
        </View>
      </GlassSurface>

      <GlassSurface testID="savings-summary-card">
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="headline">Control Ahorros y Moto (K6)</AppText>
            <StatusBadge label="IDEAL Moto: $ 872.667/mes" status="moto" />
          </View>
          <CurrencyText amount={4_380_000} variant="title2" tone="moto" />
          <AppText variant="caption" color={colors.text.secondary}>
            Moto Ahora: $ 2.300.000 · Ahorros Ahora: $ 2.080.000 (Tras pendientes: $ 1.630.000)
          </AppText>
        </View>
      </GlassSurface>

      <Pressable
        testID="haptic-verification-button"
        accessibilityRole="button"
        accessibilityLabel="Verificar respuesta táctil y tubería Fase 1"
        onPress={handleTestHaptic}
        style={{
          minHeight: MIN_TOUCH_TARGET_PT,
          borderRadius: radius.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.semantic.incomeSoft,
          borderWidth: 1,
          borderColor: colors.semantic.income,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText variant="headline" color={colors.semantic.income}>
          {pulseCount === 0
            ? 'Probar Haptics & Liquid Glass (Fase 1)'
            : `Tubería Verificada (${pulseCount} ${pulseCount === 1 ? 'toque' : 'toques'})`}
        </AppText>
      </Pressable>
    </ScrollView>
  );
}
