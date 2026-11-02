import React, { useMemo, useState } from 'react';
import { View, Text, PanResponder } from 'react-native';
import { useTheme } from '@noot/ui';
import { adjustedRate, rateAtPosition } from './rateSliderMath';

function createRateResponder(disabled: boolean, trackWidth: number, min: number, max: number, id: string, onChange: (id: string, value: number) => void) {
  let start = 0;
  const update = (position: number) => {
    const rate = rateAtPosition(position - 14, trackWidth, min, max);
    if (!disabled && rate !== null) onChange(id, rate);
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_, gesture) => !disabled && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: (event) => {
      start = event.nativeEvent.locationX;
      update(start);
    },
    onPanResponderMove: (_, gesture) => update(start + gesture.dx),
    onPanResponderTerminationRequest: () => true,
  });
}

export function RateSlider({ id, value, min, max, label, disabled = false, onChange }: {
  id: string;
  value: number;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  onChange: (id: string, value: number) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const trackWidth = Math.max(0, width - 28);
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const responder = useMemo(() => createRateResponder(disabled, trackWidth, min, max, id, onChange),
    [disabled, trackWidth, min, max, id, onChange]);

  return (
    <View>
      <View
        {...responder.panHandlers}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Swipe up or down to change the hourly rate by one dollar."
        accessibilityState={{ disabled }}
        accessibilityValue={{ min, max, now: value, text: `$${value.toFixed(2)} per hour` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (!disabled && (action === 'increment' || action === 'decrement')) onChange(id, adjustedRate(value, action, min, max));
        }}
        style={{ height: 48, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
      >
        <View pointerEvents="none" style={{ marginHorizontal: 14, height: 6, borderRadius: 3, backgroundColor: t.borderStrong }}>
          <View style={{ width: `${fraction * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: fraction * trackWidth, width: 28, height: 28,
          borderRadius: 14, borderWidth: 3, borderColor: t.accent, backgroundColor: t.surface }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: t.text3, fontSize: 12 }}>${min}/hr</Text>
        <Text style={{ color: t.text3, fontSize: 12 }}>${max}/hr</Text>
      </View>
    </View>
  );
}
