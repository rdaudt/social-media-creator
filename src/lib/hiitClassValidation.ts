import type { CoachHiitClass } from "@/types";

type HiitSnapshot = {
  stationCount?: unknown;
  stationWorkoutTypes?: unknown;
};

export type HiitClassValidationCode =
  | "class_station_workout_types_required"
  | "class_station_workout_types_count_mismatch"
  | "class_station_workout_types_entry_invalid"
  | "class_schedule_fields_required";

export type HiitClassValidationResult = {
  ok: true;
} | {
  ok: false;
  code: HiitClassValidationCode;
  message: string;
};

function parseSnapshot(raw: string | null): HiitSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as HiitSnapshot;
  } catch {
    return null;
  }
}

function toStationCount(raw: unknown): number | null {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.trunc(num);
}

export function validateHiitClassForMediaGeneration(klass: CoachHiitClass): HiitClassValidationResult {
  if (!klass.startTime || !klass.endTime || !klass.locationId) {
    return {
      ok: false,
      code: "class_schedule_fields_required",
      message: "This HIIT class cannot be used for media generation until start time, end time, and location are set."
    };
  }

  const snapshot = parseSnapshot(klass.timerSnapshotJson);
  const stationWorkoutTypes = Array.isArray(snapshot?.stationWorkoutTypes)
    ? snapshot.stationWorkoutTypes
    : [];
  if (stationWorkoutTypes.length === 0) {
    return {
      ok: false,
      code: "class_station_workout_types_required",
      message: "This HIIT class cannot be used for media generation until station workout types are provided in the timer snapshot."
    };
  }

  const stationCount = toStationCount(snapshot?.stationCount);
  if (stationCount == null || stationWorkoutTypes.length !== stationCount) {
    return {
      ok: false,
      code: "class_station_workout_types_count_mismatch",
      message: "This HIIT class cannot be used for media generation until station workout types match the station count."
    };
  }

  const hasInvalidEntry = stationWorkoutTypes.some((entry) => String(entry ?? "").trim().length === 0);
  if (hasInvalidEntry) {
    return {
      ok: false,
      code: "class_station_workout_types_entry_invalid",
      message: "This HIIT class cannot be used for media generation until every station workout type is filled in."
    };
  }

  return { ok: true };
}

