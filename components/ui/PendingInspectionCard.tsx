import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InspectionListItem } from '../../types/inspection.types';
import InspectionCard from './InspectionCard';

const ACTION_WIDTH = 104;
const OPEN_THRESHOLD = 42;
const DELETE_THRESHOLD = ACTION_WIDTH + 28;

interface Props {
  inspection: InspectionListItem;
  openCardId: string | null;
  onOpenCard: (id: string | null) => void;
  onPress: () => void;
  onRequestDelete: () => void;
  onTogglePinned: () => void;
  onMarkPending?: () => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function PendingInspectionCard({
  inspection,
  openCardId,
  onOpenCard,
  onPress,
  onRequestDelete,
  onTogglePinned,
  onMarkPending,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const gestureStartX = useRef(0);
  const gestureMoved = useRef(false);
  const hasPendingAction = inspection.status === 'draft' && Boolean(onMarkPending);
  const leftActionsWidth = hasPendingAction ? ACTION_WIDTH * 2 : ACTION_WIDTH;

  const animateTo = useCallback(
    (value: number) => {
      currentX.current = value;
      Animated.spring(translateX, {
        toValue: value,
        useNativeDriver: true,
        speed: 24,
        bounciness: 0,
      }).start();
    },
    [translateX]
  );

  const closeCard = useCallback(() => {
    animateTo(0);
  }, [animateTo]);

  useEffect(() => {
    if (openCardId !== inspection.id && currentX.current !== 0) closeCard();
  }, [closeCard, inspection.id, openCardId]);

  const requestDelete = useCallback(() => {
    closeCard();
    onOpenCard(null);
    onRequestDelete();
  }, [closeCard, onOpenCard, onRequestDelete]);

  const togglePinned = useCallback(() => {
    closeCard();
    onOpenCard(null);
    onTogglePinned();
  }, [closeCard, onOpenCard, onTogglePinned]);

  const markPending = useCallback(() => {
    if (!onMarkPending) return;
    closeCard();
    onOpenCard(null);
    onMarkPending();
  }, [closeCard, onMarkPending, onOpenCard]);

  const settleGesture = useCallback(() => {
    const finalX = currentX.current;
    if (finalX >= DELETE_THRESHOLD) {
      requestDelete();
    } else if (finalX >= OPEN_THRESHOLD) {
      animateTo(ACTION_WIDTH);
      onOpenCard(inspection.id);
    } else if (finalX <= -OPEN_THRESHOLD) {
      animateTo(-leftActionsWidth);
      onOpenCard(inspection.id);
    } else {
      closeCard();
      onOpenCard(null);
    }

    setTimeout(() => {
      gestureMoved.current = false;
    }, 120);
  }, [animateTo, closeCard, inspection.id, leftActionsWidth, onOpenCard, requestDelete]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderGrant: () => {
          gestureMoved.current = true;
          gestureStartX.current = currentX.current;
          translateX.stopAnimation((value) => {
            currentX.current = value;
            gestureStartX.current = value;
          });
          onOpenCard(inspection.id);
        },
        onPanResponderMove: (_, gestureState) => {
          const nextX = clamp(
            gestureStartX.current + gestureState.dx,
            -(leftActionsWidth + 44),
            ACTION_WIDTH + 44
          );
          currentX.current = nextX;
          translateX.setValue(nextX);
        },
        onPanResponderRelease: settleGesture,
        onPanResponderTerminate: () => {
          closeCard();
          onOpenCard(null);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [closeCard, inspection.id, leftActionsWidth, onOpenCard, settleGesture, translateX]
  );

  function handlePress() {
    if (gestureMoved.current) return;
    if (Math.abs(currentX.current) > 1) {
      closeCard();
      onOpenCard(null);
      return;
    }
    onPress();
  }

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.action, styles.deleteAction]}
        onPress={requestDelete}
        accessibilityRole="button"
        accessibilityLabel="Eliminar formulario"
        activeOpacity={0.82}
      >
        <Ionicons name="trash" size={22} color="#ffffff" />
        <Text style={styles.actionText}>Eliminar</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.action, styles.pinAction]}
        onPress={togglePinned}
        accessibilityRole="button"
        accessibilityLabel={inspection.pinned ? 'Desfijar formulario' : 'Fijar formulario'}
        activeOpacity={0.82}
      >
        <Ionicons
          name={inspection.pinned ? 'remove-circle-outline' : 'pin-outline'}
          size={22}
          color="#ffffff"
        />
        <Text style={styles.actionText}>{inspection.pinned ? 'Desfijar' : 'Fijar'}</Text>
      </TouchableOpacity>

      {hasPendingAction && (
        <TouchableOpacity
          style={[styles.action, styles.pendingAction]}
          onPress={markPending}
          accessibilityRole="button"
          accessibilityLabel="Dejar formulario pendiente"
          activeOpacity={0.82}
        >
          <Ionicons name="time-outline" size={22} color="#ffffff" />
          <Text style={styles.actionText}>Pendiente</Text>
        </TouchableOpacity>
      )}

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <InspectionCard
          inspection={inspection}
          onPress={handlePress}
          showPinnedIndicator
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  action: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  deleteAction: {
    left: 16,
    backgroundColor: '#dc2626',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  pinAction: {
    right: 16,
    backgroundColor: '#2563eb',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  pendingAction: {
    right: 120,
    backgroundColor: '#d97706',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
});
