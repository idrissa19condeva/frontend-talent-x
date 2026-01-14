import { useCallback, useMemo, useState } from "react";
import {
    CreateTrainingSessionPayload,
    TrainingBlockType,
    TrainingSeries,
    TrainingSeriesSegment,
    TrainingType,
} from "../types/training";

export const trainingTypeOptions: Array<{ label: string; value: TrainingType }> = [
    { label: "Endurance", value: "endurance" },
    { label: "Vitesse", value: "vitesse" },
    { label: "Force", value: "force" },
    { label: "Technique", value: "technique" },
    { label: "Récupération", value: "récupération" },
];

export const trainingBlockCatalog: Array<{ label: string; type: TrainingBlockType }> = [
    { label: "Vitesse", type: "vitesse" },
    { label: "Côtes", type: "cotes" },
    { label: "PPG", type: "ppg" },
    { label: "Muscu", type: "muscu" },
    { label: "Starting Block", type: "start" },
    { label: "Récup", type: "recup" },
    { label: "Bloc personnalisé", type: "custom" },
];

const createSeriesId = () => `serie-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
const createSegmentId = () => `segment-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
const formatNowToTimeValue = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
};

export const trainingBlockTypeDefaults: Record<TrainingBlockType, Partial<TrainingSeriesSegment>> = {
    vitesse: {
        blockName: "Vitesse",
        blockType: "vitesse",
        repetitions: 4,
    },
    cotes: {
        blockName: "Côtes",
        blockType: "cotes",
        cotesMode: "distance",
    },
    ppg: {
        blockName: "PPG",
        blockType: "ppg",
        distance: 0,
        repetitions: 1,
        ppgExercises: [],
        ppgMode: "time",
        ppgRepetitions: 10,
    },
    muscu: {
        blockName: "Muscu",
        blockType: "muscu",
        distance: 0,
        repetitions: 1,
        muscuExercises: [],
        muscuRepetitions: 10,
    },
    start: {
        blockName: "Starting Block",
        blockType: "start",
        distance: 0,
        repetitions: 1,
        startCount: 3,
    },
    recup: {
        blockName: "Récup",
        blockType: "recup",
        distance: 0,
        repetitions: 1,
        recoveryMode: "marche",
    },
    custom: {
        blockName: "Bloc personnalisé",
        blockType: "custom",
        distance: 0,
        repetitions: 1,
        customMetricEnabled: false,
        customMetricKind: "distance",
        customGoal: "",
        customNotes: "",
        customExercises: [],
    },
};

export const buildTrainingSeriesSegment = (
    blockType: TrainingBlockType = "vitesse",
    overrides: Partial<TrainingSeriesSegment> = {}
): TrainingSeriesSegment => ({
    id: createSegmentId(),
    distance: 200,
    distanceUnit: "m",
    restInterval: 90,
    restUnit: "s",
    repetitions: 4,
    targetPace: "",
    recordReferencePercent: 95,
    customExercises: [],
    ...trainingBlockTypeDefaults[blockType],
    ...overrides,
});

export const buildTrainingSeriesBlock = (index = 0): TrainingSeries => ({
    id: createSeriesId(),
    repeatCount: 1,
    enablePace: false,
    pacePercent: 95,
    paceReferenceDistance: "100m",
    segments: [
        buildTrainingSeriesSegment(
            trainingBlockCatalog[index % trainingBlockCatalog.length]?.type || "vitesse",
            index === 0
                ? { distance: 200, repetitions: 4 }
                : { distance: 150, repetitions: 3, restInterval: 75 }
        ),
    ],
});

export const buildDefaultTrainingFormValues = (
    athleteId: string,
    overrides: Partial<CreateTrainingSessionPayload> = {}
): CreateTrainingSessionPayload => ({
    athleteId,
    date: new Date().toISOString(),
    startTime: formatNowToTimeValue(),
    durationMinutes: 60,
    type: "vitesse", // valeur par défaut
    title: "",
    place: "",
    description: "",
    series: [buildTrainingSeriesBlock()],
    seriesRestInterval: 120,
    seriesRestUnit: "s",
    targetIntensity: 5,
    coachNotes: "",
    status: "planned",
    ...overrides,
});

type FieldUpdater<K extends keyof CreateTrainingSessionPayload> =
    | CreateTrainingSessionPayload[K]
    | ((prevValue: CreateTrainingSessionPayload[K]) => CreateTrainingSessionPayload[K]);

export const useTrainingForm = (athleteId: string, defaults?: Partial<CreateTrainingSessionPayload>) => {
    const buildDefaults = useCallback(() => buildDefaultTrainingFormValues(athleteId, defaults), [athleteId, defaults]);
    const [values, setValues] = useState<CreateTrainingSessionPayload>(buildDefaults);

    const setField = useCallback(
        <K extends keyof CreateTrainingSessionPayload>(key: K, value: FieldUpdater<K>) => {
            setValues((prev) => {
                const nextValue =
                    typeof value === "function"
                        ? (value as (previous: CreateTrainingSessionPayload[K]) => CreateTrainingSessionPayload[K])(
                            prev[key]
                        )
                        : value;
                if (prev[key] === nextValue) {
                    return prev;
                }
                return { ...prev, [key]: nextValue };
            });
        },
        []
    );

    const reset = useCallback(() => {
        setValues(buildDefaults());
    }, [buildDefaults]);

    const hydrate = useCallback((nextValues: CreateTrainingSessionPayload) => {
        setValues(nextValues);
    }, []);

    const canSubmit = useMemo(() => {
        const hasBasics = Boolean(
            values.date &&
            values.type &&
            (values.title ?? "").trim() &&
            (values.place ?? "").trim()
        );
        const hasTiming = Boolean((values.startTime ?? "").trim()) && (values.durationMinutes ?? 0) > 0;
        const hasSeriesRest = typeof values.seriesRestInterval !== "number" || Number.isNaN(values.seriesRestInterval)
            ? false
            : (values.seriesRestInterval ?? 0) >= 0;
        const hasSeries = values.series && values.series.length > 0;
        const seriesValid = hasSeries
            ? values.series.every((serie) => {
                if (serie.repeatCount < 1 || !serie.segments.length) {
                    return false;
                }
                return serie.segments.every((segment, _idx, segments) => {
                    const blockType = segment.blockType || "vitesse";
                    const metricEnabled = Boolean(segment.customMetricEnabled);
                    const metricKind = segment.customMetricKind;
                    const requiresDistance =
                        blockType !== "custom" || (metricEnabled && metricKind === "distance");
                    const hasDistance = requiresDistance ? segment.distance > 0 : true;
                    const hasRest = typeof segment.restInterval === "number" && !Number.isNaN(segment.restInterval) && segment.restInterval >= 0;
                    const requireReps = segments.length === 1;
                    const repsValid = requireReps ? (segment.repetitions ?? 0) > 0 : true;
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
                });
            })
            : false;
        return hasBasics && hasTiming && seriesValid && hasSeriesRest;
    }, [values]);

    return {
        values,
        setField,
        reset,
        hydrate,
        canSubmit,
    };
};
