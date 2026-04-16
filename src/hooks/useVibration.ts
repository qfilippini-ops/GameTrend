"use client";

export function useVibration() {
  const isSupported =
    typeof window !== "undefined" && "vibrate" in navigator;

  function vibrate(pattern: number | number[] = 50) {
    if (isSupported) navigator.vibrate(pattern);
  }

  function vibrateSuccess() {
    vibrate([50, 30, 100]);
  }

  function vibrateError() {
    vibrate([100, 50, 100, 50, 200]);
  }

  function vibrateLight() {
    vibrate(30);
  }

  function vibrateHeavy() {
    vibrate(200);
  }

  return { vibrate, vibrateSuccess, vibrateError, vibrateLight, vibrateHeavy, isSupported };
}
