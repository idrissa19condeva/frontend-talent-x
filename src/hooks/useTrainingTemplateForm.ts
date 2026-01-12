import { useCallback, useMemo, useState } from "react";
import { buildTrainingSeriesBlock } from "./useTrainingForm";
import { TrainingRestUnit, TrainingSeries, TrainingSeriesSegment } from "../types/training";
import { CreateTrainingTemplatePayload } from "../types/trainingTemplate";

export type TrainingTemplateFormValues = CreateTrainingTemplatePayload;

type FieldUpdater<K extends keyof TrainingTemplateFormValues> =
    | TrainingTemplateFormValues[K]
    | ((prevValue: TrainingTemplateFormValues[K]) => TrainingTemplateFormValues[K]);

export const buildDefaultTrainingTemplateFormValues = (
    overrides: Partial<TrainingTemplateFormValues> = {},
): TrainingTemplateFormValues => ({
    title: "",
    type: "vitesse",
    description: "",
    equipment: "",
    targetIntensity: 5,
    series: [{ ...buildTrainingSeriesBlock(), segments: [] }],
    seriesRestInterval: 120,
    seriesRestUnit: "s",
    visibility: "private",
    ...overrides,
});

const clampTargetIntensity = (value: number) => Math.max(1, Math.min(10, value));

const isSegmentValid = (segment: TrainingSeriesSegment, segments: TrainingSeriesSegment[]) => {
    const blockType = segment.blockType || "vitesse";

    // Keep frontend validation aligned with backend schema:
    // - distance is required for all blocks, but can be 0 for "custom" and "muscu".
    // - other block types require a positive distance (>= 1).
    const distanceValue = typeof segment.distance === "number" && !Number.isNaN(segment.distance) ? segment.distance : 0;
    const hasDistance = blockType === "custom" || blockType === "muscu" ? distanceValue >= 0 : distanceValue >= 1;
    const hasRest =
        typeof segment.restInterval === "number" &&
        !Number.isNaN(segment.restInterval) &&
        segment.restInterval >= 0;

    const requireReps = segments.length === 1;
    const repsValid = requireReps ? (segment.repetitions ?? 0) > 0 : true;

    const metricEnabled = Boolean(segment.customMetricEnabled);
    const metricKind = segment.customMetricKind;

    const exerciseCount = Array.isArray(segment.customExercises)
        ? segment.customExercises.filter((exercise) => Boolean(exercise && exercise.trim())).length
        : 0;

    const customMetricValid =
        blockType === "custom" && metricEnabled
            ? metricKind === "distance"
                ? (segment.customMetricDistance ?? 0) > 0
                : metricKind === "duration"
                    ? (segment.customMetricDurationSeconds ?? 0) > 0
                    : metricKind === "exo"
                        ? exerciseCount > 0
                        : true
            : true;

    return hasDistance && hasRest && repsValid && customMetricValid;
};

export const useTrainingTemplateForm = (defaults?: Partial<TrainingTemplateFormValues>) => {
    const buildDefaults = useCallback(
        () => buildDefaultTrainingTemplateFormValues(defaults),
        [defaults],
    );

    const [values, setValues] = useState<TrainingTemplateFormValues>(buildDefaults);

    const setField = useCallback(<K extends keyof TrainingTemplateFormValues>(key: K, value: FieldUpdater<K>) => {
        setValues((prev) => {
            const nextValue =
                typeof value === "function"
                    ? (value as (previous: TrainingTemplateFormValues[K]) => TrainingTemplateFormValues[K])(
                        prev[key],
                    )
                    : value;

            if (prev[key] === nextValue) {
                return prev;
            }

            return { ...prev, [key]: nextValue };
        });
    }, []);

    const reset = useCallback(() => {
        setValues(buildDefaults());
    }, [buildDefaults]);

    const hydrate = useCallback((nextValues: TrainingTemplateFormValues) => {
        setValues(nextValues);
    }, []);

    const canSubmit = useMemo(() => {
        const hasBasics = Boolean(values.type && (values.title ?? "").trim());
        const hasSeriesRest =
            typeof values.seriesRestInterval === "number" &&
            !Number.isNaN(values.seriesRestInterval) &&
            (values.seriesRestInterval ?? 0) >= 0;
        const hasSeries = Array.isArray(values.series) && values.series.length > 0;
        const seriesValid = hasSeries
            ? values.series.every((serie: TrainingSeries) => {
                if ((serie.repeatCount ?? 0) < 1 || !Array.isArray(serie.segments) || !serie.segments.length) {
                    return false;
                }
                return serie.segments.every((segment) => isSegmentValid(segment, serie.segments));
            })
            : false;

        const intensity = values.targetIntensity;
        const intensityValid =
            intensity == null || (typeof intensity === "number" && clampTargetIntensity(intensity) === intensity);

        return hasBasics && intensityValid && hasSeriesRest && seriesValid;
    }, [values]);

    const normalize = useCallback((input: TrainingTemplateFormValues): TrainingTemplateFormValues => {
        const nextIntensity =
            typeof input.targetIntensity === "number" ? clampTargetIntensity(input.targetIntensity) : input.targetIntensity;

        const nextRestUnit: TrainingRestUnit = input.seriesRestUnit || "s";
        const nextSeriesRest = typeof input.seriesRestInterval === "number" ? input.seriesRestInterval : 120;

        return {
            ...input,
            title: (input.title ?? "").trim(),
            description: input.description ? input.description.trim() : input.description,
            equipment: input.equipment ? input.equipment.trim() : input.equipment,
            targetIntensity: nextIntensity,
            seriesRestUnit: nextRestUnit,
            seriesRestInterval: nextSeriesRest,
        };
    }, []);

    return {
        values,
        setField,
        reset,
        hydrate,
        canSubmit,
        normalize,
    };
};
