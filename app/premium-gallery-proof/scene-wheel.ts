type SceneWheelInput = Readonly<{
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  viewportHeight: number;
  now: number;
  transitioning: boolean;
  canScroll: boolean;
}>;

const GESTURE_GAP_MS = 180;
const SCENE_THRESHOLD_PX = 36;
const CONTINUED_PULSES = 3;
const CONTINUED_DISTANCE_PX = 120;

/** Suppress decaying gesture tails while allowing continued deliberate input. */
export function createSceneWheelGate() {
  let lastTime: number | null = null;
  let lastDirection = 0;
  let distance = 0;
  let consumed = false;
  let pulseCount = 0;
  let pulseDistance = 0;
  let pulseAmount = 0;

  function clearPulses() {
    pulseCount = 0;
    pulseDistance = 0;
    pulseAmount = 0;
  }

  function reset() {
    lastTime = null;
    lastDirection = 0;
    distance = 0;
    consumed = false;
    clearPulses();
  }

  function accept(input: SceneWheelInput): -1 | 0 | 1 {
    const { deltaX, deltaY, deltaMode, viewportHeight, now, transitioning, canScroll } = input;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(now)
      || !deltaY || Math.abs(deltaX) > Math.abs(deltaY)) return 0;
    const scale = deltaMode === 0 ? 1 : deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 0;
    const amount = Math.abs(deltaY) * scale;
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const direction = deltaY > 0 ? 1 : -1;
    const fresh = lastTime === null || now - lastTime >= GESTURE_GAP_MS || now < lastTime;
    // A deliberate reversal can begin immediately after the transition finishes.
    const reversed = direction !== lastDirection && !transitioning;
    if (fresh || reversed) {
      distance = 0;
      consumed = false;
      clearPulses();
    }
    lastTime = now;

    if (transitioning) {
      // Do not queue input or overwrite the consumed direction during animation:
      // a new reverse input must still be recognized after the transition ends.
      distance = 0;
      consumed = true;
      clearPulses();
      return 0;
    }
    lastDirection = direction;
    if (canScroll) {
      distance = 0;
      consumed = true;
      clearPulses();
      return 0;
    }
    if (consumed) {
      // WheelEvent has no portable momentum flag. Require several strong,
      // non-decreasing inputs after the animation/content boundary before
      // treating continued scrolling as a new intent. A fading tail stays blocked.
      if (amount < SCENE_THRESHOLD_PX) { clearPulses(); return 0; }
      if (amount < pulseAmount) {
        clearPulses();
        pulseAmount = amount;
        return 0;
      }
      pulseCount += 1;
      pulseDistance += amount;
      pulseAmount = amount;
      if (pulseCount < CONTINUED_PULSES || pulseDistance < CONTINUED_DISTANCE_PX) return 0;
      clearPulses();
      return direction;
    }
    distance += amount;
    if (distance < SCENE_THRESHOLD_PX) return 0;
    consumed = true;
    distance = 0;
    return direction;
  }

  return { accept, reset };
}
