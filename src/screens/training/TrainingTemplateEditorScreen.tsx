import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Modal,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { ActivityIndicator, Button, Chip, IconButton, Switch, Text, TextInput } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { trainingBlockCatalog, trainingTypeOptions, buildTrainingSeriesBlock, buildTrainingSeriesSegment } from "../../hooks/useTrainingForm";
import { useTrainingTemplateForm } from "../../hooks/useTrainingTemplateForm";
import {
    createTrainingTemplate,
    deleteTrainingTemplate,
    getTrainingTemplate,
    updateTrainingTemplate,
} from "../../api/trainingTemplateService";
import { listTrainingBlocks } from "../../api/trainingBlockService";
import {
    DISTANCE_PACE_REFERENCE_OPTIONS,
    LOAD_PACE_REFERENCE_OPTIONS,
    PACE_REFERENCE_LABELS,
    isLoadReference,
    PaceReferenceValue,
    LoadPaceReferenceValue,
} from "../../constants/paceReferences";
import { LOAD_REFERENCE_PLACEHOLDER, LOAD_REFERENCE_SERIES_FIELD_MAP, LOAD_REFERENCE_UNITS } from "../../utils/paceTargets";
import { TrainingBlock } from "../../types/trainingBlock";
import { consumeNavigationResult, setNavigationResult } from "../../utils/navigationResults";
import {
    CustomBlockMetricKind,
    TrainingBlockType,
    TrainingDistanceUnit,
    TrainingRecoveryType,
    TrainingSeries,
    TrainingSeriesSegment,
} from "../../types/training";

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const toNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const normalized = trimmed.replace(/[^0-9]/g, "");
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const REPETITION_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

const DEFAULT_SERIES_PACE_PERCENT = 90;
const PACE_PERCENT_OPTIONS = Array.from({ length: 11 }, (_, index) => 50 + index * 5); // 50% -> 100%

const clampPacePercentValue = (value: number) => {
    const min = PACE_PERCENT_OPTIONS[0] ?? 50;
    const max = PACE_PERCENT_OPTIONS[PACE_PERCENT_OPTIONS.length - 1] ?? 100;
    return Math.max(min, Math.min(max, Math.round(value)));
};

const formatPacePercentLabel = (value?: number) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Choisir";
    return `${Math.round(value)}%`;
};

const formatPaceReferenceDistanceLabel = (value?: PaceReferenceValue) => {
    if (!value) return "Choisir";
    return PACE_REFERENCE_LABELS[value] ?? value;
};

const clampRepetition = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(50, Math.round(value)));
};

const formatRepetitionLabel = (value?: number) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Choisir";
    return String(Math.round(value));
};

const splitSeconds = (totalSeconds: number) => {
    const safe = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? Math.floor(totalSeconds) : 0;
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return { minutes, seconds };
};

const formatSecondsLabel = (totalSeconds?: number) => {
    if (typeof totalSeconds !== "number" || totalSeconds < 0) return "Choisir";
    const { minutes, seconds } = splitSeconds(totalSeconds);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const formatDistanceLabel = (distance?: number, unit?: TrainingDistanceUnit) => {
    if (typeof distance !== "number" || Number.isNaN(distance)) return "Choisir";
    const safeUnit: TrainingDistanceUnit = unit || "m";
    if (safeUnit === "km") {
        // Keep at 2 decimals max for readability.
        const rounded = Math.round(distance * 100) / 100;
        return `${rounded} km`;
    }
    return `${Math.round(distance)} m`;
};

const distanceUnitOptions: { label: string; value: TrainingDistanceUnit }[] = [
    { label: "m", value: "m" },
    { label: "km", value: "km" },
];

// Note: series rest is now edited via a mm:ss picker (stored in seconds).

const recoveryModeOptions: { label: string; value: TrainingRecoveryType }[] = [
    { label: "Marche", value: "marche" },
    { label: "Footing", value: "footing" },
    { label: "Passive", value: "passive" },
    { label: "Active", value: "active" },
];

const customMetricOptions: { label: string; value: CustomBlockMetricKind }[] = [
    { label: "Distance", value: "distance" },
    { label: "Durée", value: "duration" },
    { label: "Répétitions", value: "reps" },
    { label: "Exos", value: "exo" },
];

const PPG_EXERCISE_LIBRARY: string[] = [
    "Squats",
    "Fentes",
    "Pompes",
    "Gainage",
    "Gainage latéral",
    "Burpees",
    "Jumping jacks",
    "Mountain climbers",
    "Dips",
    "Tractions",
    "Pont fessier",
    "Mollets",
    "Abdos",
    "Russian twist",
    "Dead bug",
    "Bird dog",
    "Hollow hold",
    "Superman",
    "Planche",
    "Chaise",
    "Corde à sauter",
    "Skippings",
    "Montées de genoux",
    "Talons-fesses",
    "Sauts verticaux",
    "Sauts en longueur",
];

const MUSCU_EXERCISE_LIBRARY: string[] = [
    "Demi-squats",
    "Squat",
    "Front squat",
    "Presse à cuisses",
    "Fentes",
    "Fentes bulgares",
    "Step-up",
    "Hip thrust",
    "Soulevé de terre",
    "Soulevé de terre jambes tendues",
    "Good morning",
    "Leg curl",
    "Nordic hamstring curl",
    "Glute ham raise",
    "Leg extension",
    "Mollets (standing calf raise)",
    "Développé couché",
    "Développé incliné",
    "Développé militaire",
    "Tractions",
    "Tirage horizontal",
    "Tirage vertical",
    "Rowing barre",
    "Rowing haltère",
    "Dips",
    "Gainage",
    "Gainage latéral",
    "Abdos",
    "Épaulé-jeté",
    "Épaulé",
    "Arraché",
    "Power clean",
    "Kettlebell swing",
];

const CUSTOM_EXO_SUGGESTIONS_FLAT: string[] = [
    "Départs 3 appuis",
    "Accélération 30m",
    "Rythme haies (3 pas)",
    "Passage de haies basses",
    "Passage témoin",
    "Départ lancé",
    "Gammes (A-skips)",
    "Lignes droites",
    "Footing technique",
    "Côtes courtes",
    "Appel + impulsion",
    "Foulées bondissantes",
    "Cloches",
    "Bondissements",
    "Courbe d’élan",
    "Impulsion hauteur",
    "Course d’élan perche",
    "Planté perche",
    "Lancer face",
    "Glissé",
    "Tours disque (à vide)",
    "Lancer élan réduit",
    "Pas chassés",
    "Pivots",
];

const normalizeExerciseName = (value: string) => value.trim();

type ExercisePickerKind = "ppg" | "muscu" | "customMetricExo";

type ExercisePickerState =
    | {
        visible: true;
        kind: ExercisePickerKind;
        title: string;
        serieId: string;
        segmentId: string;
        library: string[];
        selected: Set<string>;
        customDraft: string;
    }
    | { visible: false };

export default function TrainingTemplateEditorScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const templateId = asString(params.id);
    const returnKey = asString(params.returnKey);
    const duplicateParam = asString(params.duplicate);
    const isEditing = Boolean(templateId);

    const { values, setField, hydrate, canSubmit, normalize } = useTrainingTemplateForm();

    const [loading, setLoading] = useState(false);
    const [prefillLoading, setPrefillLoading] = useState(false);
    const [prefillError, setPrefillError] = useState<string | null>(null);
    const [isDefaultTemplate, setIsDefaultTemplate] = useState(false);
    const [duplicateDraftEnabled, setDuplicateDraftEnabled] = useState(false);
    const [submitArmed, setSubmitArmed] = useState(false);

    const [addBlockChooser, setAddBlockChooser] = useState<
        | { visible: true; serieId: string }
        | { visible: false }
    >({ visible: false });
    const [pendingCreateBlock, setPendingCreateBlock] = useState<{ returnKey: string; serieId: string } | null>(null);
    const pendingCreateBlockRef = useRef<{ returnKey: string; serieId: string } | null>(null);

    useEffect(() => {
        pendingCreateBlockRef.current = pendingCreateBlock;
    }, [pendingCreateBlock]);

    const [exercisePicker, setExercisePicker] = useState<ExercisePickerState>({ visible: false });

    const [secondsPicker, setSecondsPicker] = useState<
        | {
            visible: boolean;
            label: string;
            serieId: string;
            segmentId: string;
            field:
            | "restInterval"
            | "durationSeconds"
            | "ppgDurationSeconds"
            | "ppgRestSeconds"
            | "recoveryDurationSeconds"
            | "customMetricDurationSeconds";
            minutes: number;
            seconds: number;
        }
        | { visible: false }
    >({ visible: false });

    const [seriesRestPicker, setSeriesRestPicker] = useState<
        | { visible: true; minutes: number; seconds: number }
        | { visible: false }
    >({ visible: false });

    const [repetitionPicker, setRepetitionPicker] = useState<
        | {
            visible: true;
            label: string;
            field: "serieRepeatCount" | "segmentRepetitions" | "customMetricRepetitions" | "muscuRepetitions";
            serieId: string;
            segmentId?: string;
            value: number;
        }
        | { visible: false }
    >({ visible: false });

    const [distancePicker, setDistancePicker] = useState<
        | {
            visible: boolean;
            label: string;
            serieId: string;
            segmentId: string;
            metersHundreds: number;
            metersRemainder: number;
            kilometersWhole: number;
            kilometersHundredth: number;
            unit: TrainingDistanceUnit;
        }
        | { visible: false }
    >({ visible: false });

    const [typePickerVisible, setTypePickerVisible] = useState(false);

    const [pacePicker, setPacePicker] = useState<
        | { visible: true; serieId: string; value: number }
        | { visible: false }
    >({ visible: false });

    const [paceReferencePicker, setPaceReferencePicker] = useState<
        | { visible: true; serieId: string; value: PaceReferenceValue }
        | { visible: false }
    >({ visible: false });

    const [blockTypePicker, setBlockTypePicker] = useState<{ visible: boolean; serieId?: string; segmentId?: string }>({
        visible: false,
    });

    const [myBlocksPicker, setMyBlocksPicker] = useState<
        | { visible: true; serieId: string; loading: boolean; blocks: TrainingBlock[] }
        | { visible: false }
    >({ visible: false });

    const [myBlocksPickerExpandedSections, setMyBlocksPickerExpandedSections] = useState<Set<"personal" | "default">>(
        () => new Set(),
    );

    const [myBlocksPickerExpandedTypes, setMyBlocksPickerExpandedTypes] = useState<Set<string>>(() => new Set());

    const [expandedExerciseDropdowns, setExpandedExerciseDropdowns] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (myBlocksPicker.visible) {
            // Default state: everything collapsed.
            setMyBlocksPickerExpandedSections(new Set());
            setMyBlocksPickerExpandedTypes(new Set());
        }
    }, [myBlocksPicker.visible]);

    const isEditingDefault = isEditing && isDefaultTemplate;
    const title = isEditing ? "Modifier le template" : "Nouveau template";
    const submitLabel = isEditing ? "Mettre à jour" : "Créer";

    const typeLabel = useMemo(() => {
        const option = trainingTypeOptions.find((item) => item.value === values.type);
        return option?.label || values.type;
    }, [values.type]);

    const seriesRestSeconds = useMemo(() => {
        const raw = typeof values.seriesRestInterval === "number" && Number.isFinite(values.seriesRestInterval)
            ? values.seriesRestInterval
            : 0;
        const unit = values.seriesRestUnit || "s";
        if (unit === "min") {
            return Math.max(0, Math.round(raw * 60));
        }
        return Math.max(0, Math.round(raw));
    }, [values.seriesRestInterval, values.seriesRestUnit]);

    const shouldShowSeriesRest = useMemo(() => {
        const series = values.series || [];
        if (series.length > 1) return true;
        return series.some((serie) => (serie.repeatCount ?? 1) >= 2);
    }, [values.series]);

    const scrollPaddingBottom = Math.max(insets.bottom, 0) + 24;
    const fixedHeaderHeight = 56;

    const updateSeries = useCallback(
        (serieId: string, updater: (serie: TrainingSeries) => TrainingSeries) => {
            setField("series", (prev) =>
                (prev || []).map((serie) => (serie.id === serieId ? updater(serie) : serie)),
            );
        },
        [setField],
    );

    const updateSegment = useCallback(
        <K extends keyof TrainingSeriesSegment>(
            serieId: string,
            segmentId: string,
            field: K,
            value: TrainingSeriesSegment[K],
        ) => {
            updateSeries(serieId, (serie) => ({
                ...serie,
                segments: (serie.segments || []).map((segment) =>
                    segment.id === segmentId ? { ...segment, [field]: value } : segment,
                ),
            }));
        },
        [updateSeries],
    );

    const isExerciseDropdownExpanded = useCallback(
        (key: string) => expandedExerciseDropdowns.has(key),
        [expandedExerciseDropdowns],
    );

    const toggleExerciseDropdown = useCallback((key: string) => {
        setExpandedExerciseDropdowns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleMyBlocksPickerSection = useCallback((key: "personal" | "default") => {
        setMyBlocksPickerExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const toggleMyBlocksPickerType = useCallback((key: string) => {
        setMyBlocksPickerExpandedTypes((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const getSeriesPaceCapabilities = useCallback((serie: TrainingSeries) => {
        const segments = serie.segments || [];
        const hasDistanceBlock = segments.some((segment) => {
            const blockType = (segment.blockType || "vitesse") as TrainingBlockType;
            const metricEnabled = Boolean(segment.customMetricEnabled);
            const metricKind = segment.customMetricKind;

            if (blockType === "ppg" || blockType === "muscu" || blockType === "recup" || blockType === "start") {
                return false;
            }

            if (blockType === "cotes") {
                return (segment.cotesMode || "distance") === "distance";
            }

            if (blockType === "custom" && metricEnabled) {
                return metricKind === "distance";
            }

            return true;
        });

        const hasLoadBlock = segments.some((segment) => (segment.blockType || "vitesse") === "muscu");

        const allowedReferences: PaceReferenceValue[] = [];
        if (hasDistanceBlock) {
            allowedReferences.push(...(DISTANCE_PACE_REFERENCE_OPTIONS as unknown as PaceReferenceValue[]));
        }
        if (hasLoadBlock) {
            allowedReferences.push(...(LOAD_PACE_REFERENCE_OPTIONS as unknown as PaceReferenceValue[]));
        }

        return { hasDistanceBlock, hasLoadBlock, allowedReferences };
    }, []);

    const getDefaultPaceReference = useCallback((allowedReferences: PaceReferenceValue[]) => {
        if (allowedReferences.includes("100m")) return "100m";
        if (allowedReferences.includes("bodyweight")) return "bodyweight";
        return allowedReferences[0];
    }, []);

    const sanitizeSeriesPaceSettings = useCallback(() => {
        setField("series", (prev) => {
            const safePrev = prev || [];
            let changed = false;

            const next = safePrev.map((serie) => {
                const { allowedReferences } = getSeriesPaceCapabilities(serie);
                if (!allowedReferences.length) {
                    if (!serie.enablePace && !serie.pacePercent && !serie.paceReferenceDistance) {
                        return serie;
                    }
                    changed = true;
                    return {
                        ...serie,
                        enablePace: false,
                        pacePercent: undefined,
                        paceReferenceDistance: undefined,
                        paceReferenceBodyWeightKg: undefined,
                        paceReferenceMaxMuscuKg: undefined,
                        paceReferenceMaxChariotKg: undefined,
                    };
                }

                if (!serie.enablePace) {
                    return serie;
                }

                const currentRef = serie.paceReferenceDistance as PaceReferenceValue | undefined;
                const nextRef = currentRef && allowedReferences.includes(currentRef)
                    ? currentRef
                    : getDefaultPaceReference(allowedReferences);

                const shouldClearLoadValues = nextRef && !isLoadReference(nextRef);
                const needsUpdate = nextRef !== currentRef || (shouldClearLoadValues && (
                    serie.paceReferenceBodyWeightKg != null ||
                    serie.paceReferenceMaxMuscuKg != null ||
                    serie.paceReferenceMaxChariotKg != null
                ));

                if (!needsUpdate) {
                    return serie;
                }

                changed = true;
                return {
                    ...serie,
                    paceReferenceDistance: nextRef,
                    ...(shouldClearLoadValues
                        ? {
                            paceReferenceBodyWeightKg: undefined,
                            paceReferenceMaxMuscuKg: undefined,
                            paceReferenceMaxChariotKg: undefined,
                        }
                        : null),
                };
            });

            return changed ? next : safePrev;
        });
    }, [getDefaultPaceReference, getSeriesPaceCapabilities, setField]);

    useEffect(() => {
        sanitizeSeriesPaceSettings();
    }, [sanitizeSeriesPaceSettings, values.series]);

    const handleSeriesPaceToggle = useCallback(
        (serie: TrainingSeries) => {
            const { allowedReferences } = getSeriesPaceCapabilities(serie);
            if (!allowedReferences.length) return;

            updateSeries(serie.id, (current) => {
                const nextEnabled = !current.enablePace;
                if (!nextEnabled) {
                    return {
                        ...current,
                        enablePace: false,
                    };
                }

                const currentRef = current.paceReferenceDistance as PaceReferenceValue | undefined;
                const nextRef = currentRef && allowedReferences.includes(currentRef)
                    ? currentRef
                    : getDefaultPaceReference(allowedReferences);

                const shouldClearLoadValues = nextRef && !isLoadReference(nextRef);
                return {
                    ...current,
                    enablePace: true,
                    pacePercent: clampPacePercentValue(current.pacePercent ?? DEFAULT_SERIES_PACE_PERCENT),
                    paceReferenceDistance: nextRef,
                    ...(shouldClearLoadValues
                        ? {
                            paceReferenceBodyWeightKg: undefined,
                            paceReferenceMaxMuscuKg: undefined,
                            paceReferenceMaxChariotKg: undefined,
                        }
                        : null),
                };
            });
        },
        [getDefaultPaceReference, getSeriesPaceCapabilities, updateSeries],
    );

    const openPacePicker = useCallback((serie: TrainingSeries) => {
        setPacePicker({
            visible: true,
            serieId: serie.id,
            value: clampPacePercentValue(serie.pacePercent ?? DEFAULT_SERIES_PACE_PERCENT),
        });
    }, []);

    const closePacePicker = useCallback(() => {
        setPacePicker({ visible: false });
    }, []);

    const confirmPacePicker = useCallback(() => {
        if (!pacePicker.visible) return;
        updateSeries(pacePicker.serieId, (serie) => ({
            ...serie,
            pacePercent: clampPacePercentValue(pacePicker.value),
        }));
        closePacePicker();
    }, [closePacePicker, pacePicker, updateSeries]);

    const openPaceReferencePicker = useCallback(
        (serie: TrainingSeries) => {
            const { allowedReferences } = getSeriesPaceCapabilities(serie);
            if (!allowedReferences.length) return;
            const currentRef = serie.paceReferenceDistance as PaceReferenceValue | undefined;
            const value = currentRef && allowedReferences.includes(currentRef)
                ? currentRef
                : getDefaultPaceReference(allowedReferences);
            setPaceReferencePicker({ visible: true, serieId: serie.id, value });
        },
        [getDefaultPaceReference, getSeriesPaceCapabilities],
    );

    const closePaceReferencePicker = useCallback(() => {
        setPaceReferencePicker({ visible: false });
    }, []);

    const confirmPaceReferencePicker = useCallback(() => {
        if (!paceReferencePicker.visible) return;
        const nextRef = paceReferencePicker.value;
        const shouldClearLoadValues = !isLoadReference(nextRef);
        updateSeries(paceReferencePicker.serieId, (serie) => ({
            ...serie,
            paceReferenceDistance: nextRef,
            ...(shouldClearLoadValues
                ? {
                    paceReferenceBodyWeightKg: undefined,
                    paceReferenceMaxMuscuKg: undefined,
                    paceReferenceMaxChariotKg: undefined,
                }
                : null),
        }));
        closePaceReferencePicker();
    }, [closePaceReferencePicker, paceReferencePicker, updateSeries]);

    const handleAddSeries = useCallback(() => {
        setField("series", (prev) => {
            const next = prev || [];
            const series = buildTrainingSeriesBlock(next.length);
            return [...next, { ...series, segments: [] }];
        });
    }, [setField]);

    const handleRemoveSeries = useCallback(
        (serieId: string) => {
            setField("series", (prev) => {
                const next = (prev || []).filter((serie) => serie.id !== serieId);
                return next.length ? next : prev;
            });
        },
        [setField],
    );

    const openAddBlockChooser = useCallback((serieId: string) => {
        setAddBlockChooser({ visible: true, serieId });
    }, []);

    const closeAddBlockChooser = useCallback(() => {
        setAddBlockChooser({ visible: false });
    }, []);

    const startCreateBlockForSerie = useCallback(
        (serieId: string) => {
            const returnKey = `template-add-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            setPendingCreateBlock({ returnKey, serieId });
            router.push({
                pathname: "/(main)/training/blocks/new",
                params: { returnKey, returnSerieId: serieId } as any,
            });
        },
        [router],
    );

    const openMyBlocksPicker = useCallback(async (serieId: string) => {
        setMyBlocksPicker({ visible: true, serieId, loading: true, blocks: [] });
        try {
            const blocks = await listTrainingBlocks("library");
            setMyBlocksPicker({ visible: true, serieId, loading: false, blocks: Array.isArray(blocks) ? blocks : [] });
        } catch (error) {
            console.error("Erreur chargement blocs:", error);
            setMyBlocksPicker({ visible: true, serieId, loading: false, blocks: [] });
        }
    }, []);

    const closeMyBlocksPicker = useCallback(() => {
        setMyBlocksPicker({ visible: false });
    }, []);

    const handleAddSegmentFromBlock = useCallback(
        (serieId: string, block: TrainingBlock) => {
            const blockType = (block.segment?.blockType as TrainingBlockType) || "vitesse";
            const next = buildTrainingSeriesSegment(blockType, {
                ...block.segment,
                blockName: (block.title || "").trim() || block.segment?.blockName,
            });
            updateSeries(serieId, (serie) => ({
                ...serie,
                segments: [...(serie.segments || []), next],
            }));
        },
        [updateSeries],
    );

    const handleRemoveSegment = useCallback(
        (serieId: string, segmentId: string) => {
            updateSeries(serieId, (serie) => {
                const segments = serie.segments || [];
                return { ...serie, segments: segments.filter((seg) => seg.id !== segmentId) };
            });
        },
        [updateSeries],
    );

    useFocusEffect(
        useCallback(() => {
            const pending = pendingCreateBlockRef.current;
            if (!pending) return;

            const result = consumeNavigationResult<{ block?: TrainingBlock; serieId?: string }>(pending.returnKey);
            if (result?.block) {
                handleAddSegmentFromBlock(result.serieId || pending.serieId, result.block);
            }

            pendingCreateBlockRef.current = null;
            setPendingCreateBlock(null);
        }, [handleAddSegmentFromBlock]),
    );

    const handleSetBlockType = useCallback(
        (serieId: string, segment: TrainingSeriesSegment, blockType: TrainingBlockType) => {
            const catalogEntry = trainingBlockCatalog.find((entry) => entry.type === blockType);
            const next = buildTrainingSeriesSegment(blockType, {
                id: segment.id,
                blockName: catalogEntry?.label || segment.blockName,
            });
            updateSeries(serieId, (serie) => ({
                ...serie,
                segments: (serie.segments || []).map((seg) => (seg.id === segment.id ? { ...seg, ...next } : seg)),
            }));
        },
        [updateSeries],
    );

    const openBlockTypePicker = useCallback((serieId: string, segmentId: string) => {
        setBlockTypePicker({ visible: true, serieId, segmentId });
    }, []);

    const closeBlockTypePicker = useCallback(() => {
        setBlockTypePicker({ visible: false });
    }, []);

    const openSecondsPicker = useCallback(
        (
            serieId: string,
            segment: TrainingSeriesSegment,
            field:
                | "restInterval"
                | "durationSeconds"
                | "ppgDurationSeconds"
                | "ppgRestSeconds"
                | "recoveryDurationSeconds"
                | "customMetricDurationSeconds",
            label: string,
            valueSeconds?: number,
        ) => {
            const { minutes, seconds } = splitSeconds(valueSeconds ?? 0);
            setSecondsPicker({
                visible: true,
                label,
                serieId,
                segmentId: segment.id,
                field,
                minutes: Math.min(minutes, 59),
                seconds,
            });
        },
        [],
    );

    const confirmSecondsPicker = useCallback(() => {
        if (!secondsPicker.visible) return;
        const total = Math.max(0, Math.min(59, secondsPicker.minutes)) * 60 + Math.max(0, Math.min(59, secondsPicker.seconds));
        updateSegment(secondsPicker.serieId, secondsPicker.segmentId, secondsPicker.field, total as any);
        if (secondsPicker.field === "restInterval") {
            updateSegment(secondsPicker.serieId, secondsPicker.segmentId, "restUnit", "s" as any);
        }
        setSecondsPicker({ visible: false });
    }, [secondsPicker, updateSegment]);

    const closeSecondsPicker = useCallback(() => {
        setSecondsPicker({ visible: false });
    }, []);

    const openRepetitionPicker = useCallback(
        (input: {
            label: string;
            field: "serieRepeatCount" | "segmentRepetitions" | "customMetricRepetitions" | "muscuRepetitions";
            serieId: string;
            segmentId?: string;
            currentValue?: number;
        }) => {
            setRepetitionPicker({
                visible: true,
                label: input.label,
                field: input.field,
                serieId: input.serieId,
                segmentId: input.segmentId,
                value: clampRepetition(input.currentValue ?? 1),
            });
        },
        [],
    );

    const closeRepetitionPicker = useCallback(() => {
        setRepetitionPicker({ visible: false });
    }, []);

    const confirmRepetitionPicker = useCallback(() => {
        if (!repetitionPicker.visible) return;
        const nextValue = clampRepetition(repetitionPicker.value);

        if (repetitionPicker.field === "serieRepeatCount") {
            updateSeries(repetitionPicker.serieId, (current) => ({ ...current, repeatCount: nextValue }));
            setRepetitionPicker({ visible: false });
            return;
        }

        if (!repetitionPicker.segmentId) {
            setRepetitionPicker({ visible: false });
            return;
        }

        if (repetitionPicker.field === "segmentRepetitions") {
            updateSegment(repetitionPicker.serieId, repetitionPicker.segmentId, "repetitions", nextValue as any);
        }

        if (repetitionPicker.field === "customMetricRepetitions") {
            updateSegment(
                repetitionPicker.serieId,
                repetitionPicker.segmentId,
                "customMetricRepetitions",
                nextValue as any,
            );
        }

        if (repetitionPicker.field === "muscuRepetitions") {
            updateSegment(repetitionPicker.serieId, repetitionPicker.segmentId, "muscuRepetitions" as any, nextValue as any);
        }

        setRepetitionPicker({ visible: false });
    }, [repetitionPicker, updateSegment, updateSeries]);

    const openSeriesRestPicker = useCallback(() => {
        const { minutes, seconds } = splitSeconds(seriesRestSeconds);
        setSeriesRestPicker({
            visible: true,
            minutes: Math.min(minutes, 59),
            seconds,
        });
    }, [seriesRestSeconds]);

    const myBlocksPickerSerieId = myBlocksPicker.visible ? myBlocksPicker.serieId : undefined;

    const myBlocksPickerGroupedBlocks = useMemo(() => {
        if (!myBlocksPicker.visible) {
            return { personal: [] as TrainingBlock[], defaults: [] as TrainingBlock[] };
        }

        const sorted = [...(myBlocksPicker.blocks || [])].sort((a, b) =>
            (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" }),
        );

        return {
            personal: sorted.filter((block) => !block.isDefault),
            defaults: sorted.filter((block) => Boolean(block.isDefault)),
        };
    }, [myBlocksPicker]);

    const myBlocksPickerGroupedBlocksByType = useMemo(() => {
        const getTypeKey = (block: TrainingBlock) => {
            const rawType = block.segment?.blockType;
            return typeof rawType === "string" && rawType.trim() ? rawType.trim() : "__unknown__";
        };

        const getTypeLabel = (typeKey: string) => {
            if (typeKey === "__unknown__") return "Autres";
            return trainingBlockCatalog.find((c) => c.type === (typeKey as any))?.label || typeKey;
        };

        const group = (source: TrainingBlock[], scopeKey: "personal" | "default") => {
            const buckets = new Map<string, TrainingBlock[]>();
            for (const block of source) {
                const key = getTypeKey(block);
                const existing = buckets.get(key);
                if (existing) existing.push(block);
                else buckets.set(key, [block]);
            }

            for (const list of buckets.values()) {
                list.sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" }));
            }

            const order = new Map<string, number>(trainingBlockCatalog.map((item, index) => [item.type, index]));
            const keys = Array.from(buckets.keys());
            keys.sort((a, b) => {
                const aOrder = order.has(a) ? order.get(a)! : Number.POSITIVE_INFINITY;
                const bOrder = order.has(b) ? order.get(b)! : Number.POSITIVE_INFINITY;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return getTypeLabel(a).localeCompare(getTypeLabel(b), "fr", { sensitivity: "base" });
            });

            return keys
                .map((typeKey) => ({
                    key: `${scopeKey}:${typeKey}`,
                    title: getTypeLabel(typeKey),
                    blocks: buckets.get(typeKey) ?? [],
                }))
                .filter((section) => section.blocks.length > 0);
        };

        return {
            personal: group(myBlocksPickerGroupedBlocks.personal, "personal"),
            defaults: group(myBlocksPickerGroupedBlocks.defaults, "default"),
        };
    }, [myBlocksPickerGroupedBlocks.defaults, myBlocksPickerGroupedBlocks.personal]);

    const confirmSeriesRestPicker = useCallback(() => {
        if (!seriesRestPicker.visible) return;
        const total = Math.max(0, Math.min(59, seriesRestPicker.minutes)) * 60 + Math.max(0, Math.min(59, seriesRestPicker.seconds));
        setField("seriesRestUnit", "s" as any);
        setField("seriesRestInterval", total as any);
        setSeriesRestPicker({ visible: false });
    }, [seriesRestPicker, setField]);

    const closeSeriesRestPicker = useCallback(() => {
        setSeriesRestPicker({ visible: false });
    }, []);

    const openDistancePicker = useCallback(
        (
            serieId: string,
            segment: TrainingSeriesSegment,
            label: string,
        ) => {
            const unit: TrainingDistanceUnit = segment.distanceUnit || "m";
            const raw = typeof segment.distance === "number" && Number.isFinite(segment.distance) ? segment.distance : 0;

            const meters = Math.max(0, Math.min(9999, Math.round(unit === "km" ? raw * 1000 : raw)));
            const metersHundreds = Math.floor(meters / 100);
            const metersRemainder = meters % 100;

            const km = unit === "km" ? raw : raw / 1000;
            const kilometersWhole = Math.max(0, Math.min(99, Math.floor(km)));
            const kilometersHundredth = Math.max(0, Math.min(99, Math.round((km - kilometersWhole) * 100)));

            setDistancePicker({
                visible: true,
                label,
                serieId,
                segmentId: segment.id,
                metersHundreds,
                metersRemainder,
                kilometersWhole,
                kilometersHundredth,
                unit,
            });
        },
        [],
    );

    const closeDistancePicker = useCallback(() => {
        setDistancePicker({ visible: false });
    }, []);

    const confirmDistancePicker = useCallback(() => {
        if (!distancePicker.visible) return;
        if (distancePicker.unit === "km") {
            const nextDistance = Math.max(0, distancePicker.kilometersWhole + distancePicker.kilometersHundredth / 100);
            updateSegment(distancePicker.serieId, distancePicker.segmentId, "distanceUnit", "km" as any);
            updateSegment(distancePicker.serieId, distancePicker.segmentId, "distance", nextDistance as any);
        } else {
            const meters = Math.max(0, Math.min(9999, distancePicker.metersHundreds * 100 + distancePicker.metersRemainder));
            updateSegment(distancePicker.serieId, distancePicker.segmentId, "distanceUnit", "m" as any);
            updateSegment(distancePicker.serieId, distancePicker.segmentId, "distance", meters as any);
        }
        setDistancePicker({ visible: false });
    }, [distancePicker, updateSegment]);

    const openExercisePicker = useCallback(
        (kind: ExercisePickerKind, serieId: string, segment: TrainingSeriesSegment) => {
            const library =
                kind === "ppg" ? PPG_EXERCISE_LIBRARY : kind === "muscu" ? MUSCU_EXERCISE_LIBRARY : CUSTOM_EXO_SUGGESTIONS_FLAT;
            const existing =
                kind === "ppg"
                    ? segment.ppgExercises
                    : kind === "muscu"
                        ? (segment as any).muscuExercises
                        : segment.customExercises;

            const initial = Array.isArray(existing) ? existing.map((value) => normalizeExerciseName(value)).filter(Boolean) : [];

            setExercisePicker({
                visible: true,
                kind,
                title: kind === "ppg" ? "Exercices PPG" : kind === "muscu" ? "Exercices Muscu" : "Exercices",
                serieId,
                segmentId: segment.id,
                library,
                selected: new Set(initial),
                customDraft: "",
            });
        },
        [],
    );

    const closeExercisePicker = useCallback(() => {
        setExercisePicker({ visible: false });
    }, []);

    const toggleExercisePickerSelection = useCallback((label: string) => {
        setExercisePicker((prev) => {
            if (!prev.visible) return prev;
            const needle = normalizeExerciseName(label).toLowerCase();
            const next = new Set(prev.selected);

            let existingValue: string | undefined;
            for (const item of next) {
                if (normalizeExerciseName(item).toLowerCase() === needle) {
                    existingValue = item;
                    break;
                }
            }

            if (existingValue) {
                next.delete(existingValue);
            } else {
                const normalized = normalizeExerciseName(label);
                if (normalized) {
                    next.add(normalized);
                }
            }

            return { ...prev, selected: next };
        });
    }, []);

    const addCustomExerciseFromPicker = useCallback(() => {
        setExercisePicker((prev) => {
            if (!prev.visible) return prev;
            const normalized = normalizeExerciseName(prev.customDraft);
            if (!normalized) return prev;

            const needle = normalized.toLowerCase();
            const next = new Set(prev.selected);
            const existingLower = new Set(Array.from(next).map((value) => normalizeExerciseName(value).toLowerCase()));
            if (!existingLower.has(needle)) {
                next.add(normalized);
            }

            return { ...prev, selected: next, customDraft: "" };
        });
    }, []);

    const confirmExercisePicker = useCallback(() => {
        if (!exercisePicker.visible) return;

        const selectedLower = new Set(Array.from(exercisePicker.selected).map((value) => normalizeExerciseName(value).toLowerCase()));
        const libraryLower = new Set(exercisePicker.library.map((value) => normalizeExerciseName(value).toLowerCase()));
        const ordered: string[] = [];

        for (const exo of exercisePicker.library) {
            const key = normalizeExerciseName(exo).toLowerCase();
            if (selectedLower.has(key)) {
                ordered.push(exo);
            }
        }

        for (const exo of exercisePicker.selected) {
            const key = normalizeExerciseName(exo).toLowerCase();
            if (!libraryLower.has(key)) {
                ordered.push(exo);
            }
        }

        if (exercisePicker.kind === "ppg") {
            updateSegment(exercisePicker.serieId, exercisePicker.segmentId, "ppgExercises", ordered as any);
        }

        if (exercisePicker.kind === "muscu") {
            updateSegment(exercisePicker.serieId, exercisePicker.segmentId, "muscuExercises" as any, ordered as any);
        }

        if (exercisePicker.kind === "customMetricExo") {
            updateSegment(exercisePicker.serieId, exercisePicker.segmentId, "customExercises", ordered as any);
        }

        setExercisePicker({ visible: false });
    }, [exercisePicker, updateSegment]);

    const removeExerciseByValue = useCallback(
        (serieId: string, segmentId: string, field: "ppgExercises" | "customExercises" | "muscuExercises", value: string) => {
            const needle = normalizeExerciseName(value).toLowerCase();
            updateSeries(serieId, (serie) => ({
                ...serie,
                segments: (serie.segments || []).map((seg) => {
                    if (seg.id !== segmentId) return seg;
                    const current = Array.isArray((seg as any)[field]) ? ((seg as any)[field] as string[]) : [];
                    const next = current.filter((item) => normalizeExerciseName(item).toLowerCase() !== needle);
                    return { ...seg, [field]: next } as any;
                }),
            }));
        },
        [updateSeries],
    );

    const canEdit = useMemo(
        () => !loading && !prefillLoading && (!isDefaultTemplate || duplicateDraftEnabled),
        [duplicateDraftEnabled, isDefaultTemplate, loading, prefillLoading],
    );

    const loadTemplate = useCallback(async () => {
        if (!templateId) return;
        setPrefillLoading(true);
        setPrefillError(null);
        try {
            const template = await getTrainingTemplate(templateId);
            setIsDefaultTemplate(Boolean(template.isDefault));
            hydrate({
                title: template.title,
                type: template.type,
                description: template.description || "",
                equipment: template.equipment || "",
                targetIntensity: template.targetIntensity,
                series: template.series || [],
                seriesRestInterval: template.seriesRestInterval ?? 120,
                seriesRestUnit: template.seriesRestUnit ?? "s",
                visibility: template.visibility || "private",
            });
        } catch (e: any) {
            setPrefillError(e?.message || "Impossible de charger le template");
        } finally {
            setPrefillLoading(false);
        }
    }, [hydrate, templateId]);

    useEffect(() => {
        if (isEditing) {
            loadTemplate();
        } else {
            setIsDefaultTemplate(false);
        }
    }, [isEditing, loadTemplate]);

    useEffect(() => {
        // Prevent tap-through right after navigation (e.g. pressing "Dupliquer" then the same tap hits "Mettre à jour").
        // Arm submit shortly after the screen is stable.
        setSubmitArmed(false);
        const timer = setTimeout(() => setSubmitArmed(true), 350);
        return () => clearTimeout(timer);
    }, [templateId]);

    useEffect(() => {
        // If we arrived from a "Dupliquer" action, enable the draft mode immediately.
        setDuplicateDraftEnabled(duplicateParam === "1" || duplicateParam === "true");
    }, [duplicateParam]);

    const handleDuplicateDefault = useCallback(() => {
        // Draft mode: allow editing the default template without saving anything yet.
        // The actual copy will be created when the user presses "Mettre à jour".
        setDuplicateDraftEnabled(true);
    }, []);

    const handleDeleteTemplate = useCallback(() => {
        if (!templateId) return;
        if (isDefaultTemplate) {
            Alert.alert(
                "Template par défaut",
                "Tu ne peux pas supprimer un template par défaut. Duplique-le pour créer ta version.",
            );
            return;
        }

        Alert.alert("Supprimer", "Supprimer ce template ?", [
            { text: "Annuler", style: "cancel" },
            {
                text: "Supprimer",
                style: "destructive",
                onPress: async () => {
                    setLoading(true);
                    try {
                        await deleteTrainingTemplate(templateId);
                        router.replace("/(main)/training/templates");
                    } catch (e: any) {
                        Alert.alert("Erreur", e?.message || "Impossible de supprimer ce template");
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    }, [isDefaultTemplate, router, templateId]);

    const handleSubmit = useCallback(async () => {
        if (!submitArmed) return;
        if (!canSubmit || !canEdit) return;
        setLoading(true);
        try {
            const payload = normalize(values);
            if (isEditing && templateId && !(isDefaultTemplate && duplicateDraftEnabled)) {
                await updateTrainingTemplate(templateId, payload);
                if (returnKey) {
                    setNavigationResult(returnKey, { templateId, title: payload.title });
                    if (router.canGoBack?.()) {
                        router.back();
                    } else {
                        router.replace({ pathname: "/(main)/training/create", params: { templateId } } as never);
                    }
                    return;
                }

                Alert.alert("Template mis à jour", "Les modifications ont été enregistrées.");
                router.replace("/(main)/training/templates");
                return;
            } else {
                const created = await createTrainingTemplate(payload);
                if (returnKey) {
                    setNavigationResult(returnKey, { templateId: created.id, title: created.title });
                    if (router.canGoBack?.()) {
                        router.back();
                    } else {
                        router.replace({ pathname: "/(main)/training/create", params: { templateId: created.id } } as never);
                    }
                    return;
                }

                Alert.alert("Template créé", "Ton template est disponible dans la liste.");
            }
            router.replace("/(main)/training/templates");
        } catch (e: any) {
            Alert.alert("Erreur", e?.message || "Impossible d'enregistrer le template");
        } finally {
            setLoading(false);
        }
    }, [canEdit, canSubmit, duplicateDraftEnabled, isDefaultTemplate, isEditing, normalize, router, submitArmed, templateId, values, returnKey]);

    if (prefillLoading && isEditing) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateContainer}>
                    <ActivityIndicator size="small" color="#22d3ee" />
                    <Text style={styles.stateText}>Chargement du template…</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (prefillError && isEditing) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateContainer}>
                    <Text style={styles.stateText}>{prefillError}</Text>
                    <Button mode="contained" onPress={loadTemplate} buttonColor="#22d3ee" textColor="#02111f">
                        Réessayer
                    </Button>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <KeyboardAvoidingView
                style={styles.safeArea}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Math.max(insets.top, 16) + 56}
            >
                <View
                    style={[
                        styles.fixedHeader,
                        { paddingTop: 0, height: fixedHeaderHeight },
                    ]}
                >
                    <View style={styles.fixedHeaderActions}>
                        {isEditing && !isDefaultTemplate ? (
                            <Button
                                mode="outlined"
                                onPress={handleDeleteTemplate}
                                disabled={loading || prefillLoading}
                                textColor="#f87171"
                                style={styles.deleteHeaderButton}
                                compact
                                labelStyle={styles.fixedHeaderButtonLabel}
                            >
                                Supprimer
                            </Button>
                        ) : (
                            <View />
                        )}

                        <View style={styles.fixedHeaderPrimaryActions}>
                            <Button
                                mode="outlined"
                                onPress={() =>
                                    router.canGoBack?.() ? router.back() : router.replace("/(main)/training/templates")
                                }
                                textColor="#cbd5e1"
                                disabled={loading}
                                compact
                                style={styles.fixedHeaderButton}
                                labelStyle={styles.fixedHeaderButtonLabel}
                            >
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                onPress={isEditingDefault && !duplicateDraftEnabled ? handleDuplicateDefault : handleSubmit}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                disabled={loading || !submitArmed || (!canSubmit || !canEdit)}
                                loading={loading}
                                compact
                                style={styles.fixedHeaderButton}
                                contentStyle={styles.fixedHeaderPrimaryButtonContent}
                                labelStyle={styles.fixedHeaderPrimaryButtonLabel}
                            >
                                {submitLabel}
                            </Button>
                        </View>
                    </View>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[
                        styles.container,
                        {
                            paddingTop: fixedHeaderHeight + 10,
                            paddingBottom: scrollPaddingBottom,
                        },
                    ]}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.subtitle}>Crée un template que tu pourras réutiliser.</Text>
                    </View>

                    {isEditing && isDefaultTemplate && !duplicateDraftEnabled ? (
                        <View style={styles.defaultBanner}>
                            <Text style={styles.defaultBannerTitle}>Template par défaut</Text>
                            <Text style={styles.defaultBannerText}>
                                Ce template est en lecture seule. Duplique-le pour pouvoir le modifier.
                            </Text>
                            <Button
                                mode="contained"
                                onPress={handleDuplicateDefault}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                disabled={loading || prefillLoading}
                            >
                                Dupliquer pour modifier
                            </Button>
                        </View>
                    ) : null}

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Infos</Text>
                        <TextInput
                            label="Titre"
                            value={values.title}
                            onChangeText={(text) => setField("title", text)}
                            mode="outlined"
                            style={styles.input}
                            disabled={!canEdit}
                        />

                        <View>
                            <Text style={styles.fieldLabel}>Type</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => setTypePickerVisible(true)}
                                disabled={!canEdit}
                                accessibilityRole="button"
                                accessibilityLabel="Sélectionner le type du template"
                            >
                                <Text style={styles.pickerValue}>{typeLabel}</Text>
                                <Text style={styles.pickerChevron}>▼</Text>
                            </Pressable>
                        </View>

                        <TextInput
                            label="Note Coach (optionnel)"
                            value={values.description || ""}
                            onChangeText={(text) => setField("description", text)}
                            mode="outlined"
                            multiline
                            style={styles.input}
                            disabled={!canEdit}
                        />

                        <TextInput
                            label="Équipements (optionnel)"
                            value={values.equipment || ""}
                            onChangeText={(text) => setField("equipment", text)}
                            mode="outlined"
                            multiline
                            style={styles.input}
                            disabled={!canEdit}
                        />
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>Séries & blocs</Text>
                                <Text style={styles.cardSubtitle}>Construis ton plan d’entraînement</Text>
                            </View>
                            <Button
                                mode="outlined"
                                icon="plus"
                                onPress={handleAddSeries}
                                textColor="#22d3ee"
                                disabled={!canEdit}
                            >
                                Série
                            </Button>
                        </View>

                        {values.series.map((serie, serieIndex) => (
                            <View key={serie.id} style={styles.seriesCard}>
                                <View style={styles.seriesHeader}>
                                    {values.series.length > 1 ? (
                                        <View style={styles.seriesHeaderTop}>
                                            <IconButton
                                                icon="close"
                                                size={18}
                                                iconColor="#94a3b8"
                                                onPress={() => handleRemoveSeries(serie.id)}
                                                disabled={!canEdit}
                                                style={styles.seriesRemoveButton}
                                            />
                                        </View>
                                    ) : null}

                                    <View style={styles.seriesHeaderRow}>
                                        <Text style={styles.seriesTitle}>Série {serieIndex + 1}</Text>

                                        <View style={styles.seriesInlineTrigger}>
                                            <View style={styles.seriesRepeatControlRow}>
                                                <IconButton
                                                    icon="minus"
                                                    size={14}
                                                    iconColor="#cbd5e1"
                                                    disabled={!canEdit || (serie.repeatCount ?? 1) <= 1}
                                                    onPress={() =>
                                                        updateSeries(serie.id, (current) => ({
                                                            ...current,
                                                            repeatCount: clampRepetition((current.repeatCount ?? 1) - 1),
                                                        }))
                                                    }
                                                    style={styles.seriesRepeatIconButton}
                                                    accessibilityLabel="Diminuer le nombre de répétitions de la série"
                                                />

                                                <Text style={styles.seriesInlineValue}>{`${formatRepetitionLabel(
                                                    serie.repeatCount ?? 1,
                                                )} fois`}</Text>

                                                <IconButton
                                                    icon="plus"
                                                    size={14}
                                                    iconColor="#cbd5e1"
                                                    disabled={!canEdit}
                                                    onPress={() =>
                                                        updateSeries(serie.id, (current) => ({
                                                            ...current,
                                                            repeatCount: clampRepetition((current.repeatCount ?? 1) + 1),
                                                        }))
                                                    }
                                                    style={styles.seriesRepeatIconButton}
                                                    accessibilityLabel="Augmenter le nombre de répétitions de la série"
                                                />
                                            </View>
                                        </View>

                                        {shouldShowSeriesRest ? (
                                            <Pressable
                                                style={styles.seriesInlineTrigger}
                                                onPress={openSeriesRestPicker}
                                                disabled={!canEdit}
                                                accessibilityRole="button"
                                                accessibilityLabel="Choisir le repos entre séries"
                                            >
                                                <View style={styles.seriesInlineValueRow}>
                                                    <Text style={styles.seriesInlineValue}>{formatSecondsLabel(seriesRestSeconds)} récup entre séries</Text>
                                                    <MaterialCommunityIcons name="pencil-outline" size={10} color="#94a3b8" />
                                                </View>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                </View>

                                {(() => {
                                    const { allowedReferences } = getSeriesPaceCapabilities(serie);
                                    if (!allowedReferences.length) return null;

                                    const reference = serie.paceReferenceDistance as PaceReferenceValue | undefined;
                                    const isLoad = Boolean(reference && isLoadReference(reference));
                                    const loadReference = isLoad ? (reference as LoadPaceReferenceValue) : undefined;
                                    const loadField = loadReference ? LOAD_REFERENCE_SERIES_FIELD_MAP[loadReference] : undefined;
                                    const loadValue = loadField ? (serie as any)[loadField] as number | undefined : undefined;
                                    const loadUnit = loadReference ? LOAD_REFERENCE_UNITS[loadReference] : undefined;
                                    const loadPlaceholder = loadReference ? LOAD_REFERENCE_PLACEHOLDER[loadReference] : undefined;

                                    return (
                                        <View style={styles.seriesPaceCard}>
                                            <Pressable
                                                style={[styles.seriesPaceToggle, serie.enablePace && styles.seriesPaceToggleActive]}
                                                onPress={() => handleSeriesPaceToggle(serie)}
                                                disabled={!canEdit}
                                                accessibilityRole="button"
                                                accessibilityLabel="Activer l'intensité pour cette série"
                                            >
                                                <MaterialCommunityIcons
                                                    name={serie.enablePace ? "checkbox-marked" : "checkbox-blank-outline"}
                                                    size={20}
                                                    color={serie.enablePace ? "#22d3ee" : "#94a3b8"}
                                                />
                                                <View style={styles.seriesPaceToggleTexts}>
                                                    <Text style={styles.seriesPaceToggleLabel}>Intensité</Text>
                                                    <Text style={styles.seriesPaceToggleHint}>Cible effort / référence</Text>
                                                </View>
                                            </Pressable>

                                            {serie.enablePace ? (
                                                <View style={styles.seriesPaceSelectors}>
                                                    <Pressable
                                                        style={[styles.seriesInlineTrigger, styles.seriesPaceSelector]}
                                                        onPress={() => openPacePicker(serie)}
                                                        disabled={!canEdit}
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Sélectionner l'intensité"
                                                    >
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.seriesInlineLabel}>Intensité</Text>
                                                            <View style={styles.seriesInlineValueRow}>
                                                                <Text style={styles.seriesInlineValue}>{formatPacePercentLabel(serie.pacePercent)}</Text>
                                                                <MaterialCommunityIcons name="pencil-outline" size={10} color="#94a3b8" />
                                                            </View>
                                                        </View>
                                                    </Pressable>
                                                    <Pressable
                                                        style={[styles.seriesInlineTrigger, styles.seriesPaceSelector]}
                                                        onPress={() => openPaceReferencePicker(serie)}
                                                        disabled={!canEdit}
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Sélectionner la référence d'intensité"
                                                    >
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.seriesInlineLabel}>Référence</Text>
                                                            <View style={styles.seriesInlineValueRow}>
                                                                <Text style={styles.seriesInlineValue}>{formatPaceReferenceDistanceLabel(reference)}</Text>
                                                                <MaterialCommunityIcons name="pencil-outline" size={10} color="#94a3b8" />
                                                            </View>
                                                        </View>
                                                    </Pressable>
                                                </View>
                                            ) : null}

                                            {serie.enablePace && loadReference && loadField ? (
                                                <View style={styles.seriesLoadReferenceRow}>
                                                    <TextInput
                                                        label={`${PACE_REFERENCE_LABELS[loadReference]} (${loadUnit})`}
                                                        value={typeof loadValue === "number" && Number.isFinite(loadValue) ? String(loadValue) : ""}
                                                        onChangeText={(text) => {
                                                            const parsed = toNumber(text);
                                                            updateSeries(serie.id, (current) => ({
                                                                ...current,
                                                                [loadField]: parsed == null ? undefined : Math.max(0, parsed),
                                                            }));
                                                        }}
                                                        placeholder={loadPlaceholder}
                                                        mode="outlined"
                                                        keyboardType="numeric"
                                                        style={styles.input}
                                                        disabled={!canEdit}
                                                    />
                                                </View>
                                            ) : null}
                                        </View>
                                    );
                                })()}

                                <Button
                                    mode="outlined"
                                    icon="plus"
                                    onPress={() => openAddBlockChooser(serie.id)}
                                    textColor="#e1eaecff"
                                    style={styles.addDistanceButton}
                                    disabled={!canEdit}
                                >
                                    Ajouter un bloc
                                </Button>



                                <View style={styles.segmentList}>
                                    {!(serie.segments || []).length ? (
                                        <View style={styles.emptySeriesCard}>
                                            <Text style={styles.emptySeriesText}>Aucun bloc pour le moment.</Text>
                                        </View>
                                    ) : null}

                                    {(serie.segments || []).map((segment, segmentIndex) => {
                                        const blockType: TrainingBlockType = (segment.blockType || "vitesse") as TrainingBlockType;
                                        const blockName = segment.blockName || trainingBlockCatalog.find((x) => x.type === blockType)?.label || "Bloc";

                                        const customMetricEnabled = Boolean(segment.customMetricEnabled);

                                        const showDistance =
                                            blockType !== "ppg" &&
                                            blockType !== "muscu" &&
                                            blockType !== "recup" &&
                                            blockType !== "start" &&
                                            !(blockType === "custom" && customMetricEnabled) &&
                                            !(blockType === "cotes" && (segment.cotesMode || "distance") === "duration");

                                        const showRepetitions =
                                            blockType !== "ppg" &&
                                            blockType !== "muscu" &&
                                            blockType !== "start" &&
                                            blockType !== "recup" &&
                                            !(blockType === "custom" && customMetricEnabled);

                                        return (
                                            <View key={segment.id} style={styles.segmentCard}>
                                                <View style={styles.segmentHeader}>
                                                    <Text style={styles.segmentTitle}>{`Bloc ${segmentIndex + 1} : ${blockName}`}</Text>
                                                    {(serie.segments || []).length > 1 ? (
                                                        <IconButton
                                                            icon="close"
                                                            size={18}
                                                            iconColor="#94a3b8"
                                                            onPress={() => handleRemoveSegment(serie.id, segment.id)}
                                                            disabled={!canEdit}
                                                        />
                                                    ) : null}
                                                </View>

                                                <View style={styles.row}>
                                                    <View style={styles.rowItem}>
                                                        <Text style={styles.fieldLabel}>Type de bloc</Text>
                                                        <Pressable
                                                            style={styles.pickerTrigger}
                                                            onPress={() => openBlockTypePicker(serie.id, segment.id)}
                                                            disabled={!canEdit}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={`Choisir le type du bloc ${segmentIndex + 1}`}
                                                        >
                                                            <Text style={styles.pickerValue}>
                                                                {trainingBlockCatalog.find((x) => x.type === blockType)?.label || "Bloc"}
                                                            </Text>
                                                            <Text style={styles.pickerChevron}>▼</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>

                                                <TextInput
                                                    label="Nom (optionnel)"
                                                    value={segment.blockName || ""}
                                                    onChangeText={(text) => updateSegment(serie.id, segment.id, "blockName", text)}
                                                    mode="outlined"
                                                    style={styles.input}
                                                    disabled={!canEdit}
                                                />

                                                {showDistance || showRepetitions ? (
                                                    <View style={styles.row}>
                                                        {showDistance ? (
                                                            <View style={styles.rowItem}>
                                                                <Text style={styles.fieldLabel}>Distance</Text>
                                                                <Pressable
                                                                    style={styles.pickerTrigger}
                                                                    onPress={() => openDistancePicker(serie.id, segment, "Distance")}
                                                                    disabled={!canEdit}
                                                                >
                                                                    <Text style={styles.pickerValue}>
                                                                        {formatDistanceLabel(segment.distance, segment.distanceUnit)}
                                                                    </Text>
                                                                    <Text style={styles.pickerChevron}>▼</Text>
                                                                </Pressable>
                                                            </View>
                                                        ) : null}

                                                        {showRepetitions ? (
                                                            <View style={styles.rowItem}>
                                                                <Text style={styles.fieldLabel}>Répétitions</Text>
                                                                <Pressable
                                                                    style={styles.pickerTrigger}
                                                                    onPress={() =>
                                                                        openRepetitionPicker({
                                                                            label: "Répétitions",
                                                                            field: "segmentRepetitions",
                                                                            serieId: serie.id,
                                                                            segmentId: segment.id,
                                                                            currentValue: segment.repetitions ?? 1,
                                                                        })
                                                                    }
                                                                    disabled={!canEdit}
                                                                    accessibilityRole="button"
                                                                    accessibilityLabel={`Choisir les répétitions du bloc ${segmentIndex + 1}`}
                                                                >
                                                                    <Text style={styles.pickerValue}>
                                                                        {formatRepetitionLabel(segment.repetitions)}
                                                                    </Text>
                                                                    <Text style={styles.pickerChevron}>▼</Text>
                                                                </Pressable>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                ) : null}

                                                <View style={styles.row}>
                                                    <View style={styles.rowItem}>
                                                        <Text style={styles.fieldLabel}>Récup (mm:ss)</Text>
                                                        <Pressable
                                                            style={styles.pickerTrigger}
                                                            onPress={() =>
                                                                openSecondsPicker(serie.id, segment, "restInterval", "Récup", segment.restInterval)
                                                            }
                                                            disabled={!canEdit}
                                                        >
                                                            <Text style={styles.pickerValue}>{formatSecondsLabel(segment.restInterval)}</Text>
                                                            <Text style={styles.pickerChevron}>▼</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>

                                                {blockType === "cotes" ? (
                                                    <View style={styles.section}>
                                                        <Text style={styles.sectionLabel}>Format</Text>
                                                        <View style={styles.chipRow}>
                                                            <Chip
                                                                selected={(segment.cotesMode || "distance") === "distance"}
                                                                onPress={() => updateSegment(serie.id, segment.id, "cotesMode", "distance")}
                                                                disabled={!canEdit}
                                                                mode="outlined"
                                                                compact
                                                                style={styles.chip}
                                                            >
                                                                Distance
                                                            </Chip>
                                                            <Chip
                                                                selected={(segment.cotesMode || "distance") === "duration"}
                                                                onPress={() => updateSegment(serie.id, segment.id, "cotesMode", "duration")}
                                                                disabled={!canEdit}
                                                                mode="outlined"
                                                                compact
                                                                style={styles.chip}
                                                            >
                                                                Durée
                                                            </Chip>
                                                        </View>
                                                        {(segment.cotesMode || "distance") === "duration" ? (
                                                            <View>
                                                                <Text style={styles.fieldLabel}>Durée (mm:ss)</Text>
                                                                <Pressable
                                                                    style={styles.pickerTrigger}
                                                                    onPress={() =>
                                                                        openSecondsPicker(
                                                                            serie.id,
                                                                            segment,
                                                                            "durationSeconds",
                                                                            "Durée",
                                                                            segment.durationSeconds,
                                                                        )
                                                                    }
                                                                    disabled={!canEdit}
                                                                >
                                                                    <Text style={styles.pickerValue}>
                                                                        {formatSecondsLabel(segment.durationSeconds)}
                                                                    </Text>
                                                                    <Text style={styles.pickerChevron}>▼</Text>
                                                                </Pressable>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                ) : null}

                                                {blockType === "ppg" ? (
                                                    <View style={styles.section}>
                                                        {(() => {
                                                            const dropdownKey = `${serie.id}:${segment.id}:ppgExercises`;
                                                            const expanded = isExerciseDropdownExpanded(dropdownKey);
                                                            const exercises = segment.ppgExercises || [];
                                                            return (
                                                                <View>
                                                                    <Pressable
                                                                        style={styles.dropdownHeader}
                                                                        onPress={() => toggleExerciseDropdown(dropdownKey)}
                                                                        accessibilityRole="button"
                                                                        accessibilityLabel="Afficher les exercices"
                                                                    >
                                                                        <Text style={styles.dropdownHeaderText}>Exercices</Text>
                                                                        <View style={styles.dropdownHeaderRight}>
                                                                            <Text style={styles.dropdownCount}>{exercises.length}</Text>
                                                                            <MaterialCommunityIcons
                                                                                name={expanded ? "chevron-up" : "chevron-down"}
                                                                                size={18}
                                                                                color="#94a3b8"
                                                                            />
                                                                        </View>
                                                                    </Pressable>

                                                                    {expanded ? (
                                                                        exercises.length ? (
                                                                            <View style={styles.dropdownList}>
                                                                                {exercises.map((exercise) => (
                                                                                    <View
                                                                                        key={`${segment.id}-ppg-${exercise}`}
                                                                                        style={styles.dropdownItem}
                                                                                    >
                                                                                        <Text style={styles.dropdownItemText}>{exercise}</Text>
                                                                                        <IconButton
                                                                                            icon="close"
                                                                                            size={16}
                                                                                            iconColor="#94a3b8"
                                                                                            onPress={() =>
                                                                                                removeExerciseByValue(
                                                                                                    serie.id,
                                                                                                    segment.id,
                                                                                                    "ppgExercises",
                                                                                                    exercise,
                                                                                                )
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                            style={styles.dropdownRemoveButton}
                                                                                        />
                                                                                    </View>
                                                                                ))}
                                                                            </View>
                                                                        ) : (
                                                                            <Text style={styles.helperText}>Aucun exercice.</Text>
                                                                        )
                                                                    ) : null}
                                                                </View>
                                                            );
                                                        })()}

                                                        <Button
                                                            mode="outlined"
                                                            icon="plus"
                                                            onPress={() => openExercisePicker("ppg", serie.id, segment)}
                                                            disabled={!canEdit}
                                                            textColor="#22d3ee"
                                                            style={{ marginTop: 8 }}
                                                        >
                                                            Ajouter des exos
                                                        </Button>

                                                        <View style={styles.row}>
                                                            <View style={styles.rowItem}>
                                                                <Text style={styles.fieldLabel}>Durée (mm:ss)</Text>
                                                                <Pressable
                                                                    style={styles.pickerTrigger}
                                                                    onPress={() =>
                                                                        openSecondsPicker(
                                                                            serie.id,
                                                                            segment,
                                                                            "ppgDurationSeconds",
                                                                            "Durée PPG",
                                                                            segment.ppgDurationSeconds,
                                                                        )
                                                                    }
                                                                    disabled={!canEdit}
                                                                >
                                                                    <Text style={styles.pickerValue}>
                                                                        {formatSecondsLabel(segment.ppgDurationSeconds)}
                                                                    </Text>
                                                                    <Text style={styles.pickerChevron}>▼</Text>
                                                                </Pressable>
                                                            </View>
                                                            <View style={styles.rowItem}>
                                                                <Text style={styles.fieldLabel}>Récup (mm:ss)</Text>
                                                                <Pressable
                                                                    style={styles.pickerTrigger}
                                                                    onPress={() =>
                                                                        openSecondsPicker(
                                                                            serie.id,
                                                                            segment,
                                                                            "ppgRestSeconds",
                                                                            "Récup PPG",
                                                                            segment.ppgRestSeconds,
                                                                        )
                                                                    }
                                                                    disabled={!canEdit}
                                                                >
                                                                    <Text style={styles.pickerValue}>
                                                                        {formatSecondsLabel(segment.ppgRestSeconds)}
                                                                    </Text>
                                                                    <Text style={styles.pickerChevron}>▼</Text>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                    </View>
                                                ) : null}

                                                {blockType === "muscu" ? (
                                                    <View style={styles.section}>
                                                        <Text style={styles.sectionLabel}>Muscu</Text>

                                                        {(() => {
                                                            const dropdownKey = `${serie.id}:${segment.id}:muscuExercises`;
                                                            const expanded = isExerciseDropdownExpanded(dropdownKey);
                                                            const exercises = Array.isArray((segment as any).muscuExercises)
                                                                ? ((segment as any).muscuExercises as string[])
                                                                : [];

                                                            return (
                                                                <View>
                                                                    <Pressable
                                                                        style={styles.dropdownHeader}
                                                                        onPress={() => toggleExerciseDropdown(dropdownKey)}
                                                                        accessibilityRole="button"
                                                                        accessibilityLabel="Afficher les exercices"
                                                                    >
                                                                        <Text style={styles.dropdownHeaderText}>Exercices</Text>
                                                                        <View style={styles.dropdownHeaderRight}>
                                                                            <Text style={styles.dropdownCount}>{exercises.length}</Text>
                                                                            <MaterialCommunityIcons
                                                                                name={expanded ? "chevron-up" : "chevron-down"}
                                                                                size={18}
                                                                                color="#94a3b8"
                                                                            />
                                                                        </View>
                                                                    </Pressable>

                                                                    {expanded ? (
                                                                        exercises.length ? (
                                                                            <View style={styles.dropdownList}>
                                                                                {exercises.map((exercise) => (
                                                                                    <View
                                                                                        key={`${segment.id}-muscu-${exercise}`}
                                                                                        style={styles.dropdownItem}
                                                                                    >
                                                                                        <Text style={styles.dropdownItemText}>{exercise}</Text>
                                                                                        <IconButton
                                                                                            icon="close"
                                                                                            size={16}
                                                                                            iconColor="#94a3b8"
                                                                                            onPress={() =>
                                                                                                removeExerciseByValue(
                                                                                                    serie.id,
                                                                                                    segment.id,
                                                                                                    "muscuExercises",
                                                                                                    exercise,
                                                                                                )
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                            style={styles.dropdownRemoveButton}
                                                                                        />
                                                                                    </View>
                                                                                ))}
                                                                            </View>
                                                                        ) : (
                                                                            <Text style={styles.helperText}>Aucun exercice.</Text>
                                                                        )
                                                                    ) : null}
                                                                </View>
                                                            );
                                                        })()}

                                                        <Button
                                                            mode="outlined"
                                                            icon="plus"
                                                            onPress={() => openExercisePicker("muscu", serie.id, segment)}
                                                            disabled={!canEdit}
                                                            textColor="#22d3ee"
                                                            style={{ marginTop: 8 }}
                                                        >
                                                            Ajouter des exos
                                                        </Button>

                                                        <View style={{ marginTop: 10 }}>
                                                            <Text style={styles.fieldLabel}>Répétitions par exo</Text>
                                                            <Pressable
                                                                style={styles.pickerTrigger}
                                                                onPress={() =>
                                                                    openRepetitionPicker({
                                                                        label: "Répétitions par exo",
                                                                        field: "muscuRepetitions",
                                                                        serieId: serie.id,
                                                                        segmentId: segment.id,
                                                                        currentValue: (segment as any).muscuRepetitions ?? 10,
                                                                    })
                                                                }
                                                                disabled={!canEdit}
                                                            >
                                                                <Text style={styles.pickerValue}>
                                                                    {formatRepetitionLabel((segment as any).muscuRepetitions)}
                                                                </Text>
                                                                <Text style={styles.pickerChevron}>▼</Text>
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                ) : null}

                                                {blockType === "recup" ? (
                                                    <View style={styles.section}>
                                                        <Text style={styles.sectionLabel}>Récupération</Text>
                                                        <View style={styles.chipRow}>
                                                            {recoveryModeOptions.map((option) => (
                                                                <Chip
                                                                    key={`${segment.id}-recovery-${option.value}`}
                                                                    selected={(segment.recoveryMode || "marche") === option.value}
                                                                    onPress={() => updateSegment(serie.id, segment.id, "recoveryMode", option.value)}
                                                                    disabled={!canEdit}
                                                                    mode="outlined"
                                                                    compact
                                                                    style={styles.chip}
                                                                >
                                                                    {option.label}
                                                                </Chip>
                                                            ))}
                                                        </View>

                                                        <View>
                                                            <Text style={styles.fieldLabel}>Durée (mm:ss)</Text>
                                                            <Pressable
                                                                style={styles.pickerTrigger}
                                                                onPress={() =>
                                                                    openSecondsPicker(
                                                                        serie.id,
                                                                        segment,
                                                                        "recoveryDurationSeconds",
                                                                        "Durée récup",
                                                                        segment.recoveryDurationSeconds,
                                                                    )
                                                                }
                                                                disabled={!canEdit}
                                                            >
                                                                <Text style={styles.pickerValue}>
                                                                    {formatSecondsLabel(segment.recoveryDurationSeconds)}
                                                                </Text>
                                                                <Text style={styles.pickerChevron}>▼</Text>
                                                            </Pressable>
                                                        </View>

                                                        <View style={{ marginTop: 10 }}>
                                                            <Text style={styles.fieldLabel}>Répétitions</Text>
                                                            <Pressable
                                                                style={styles.pickerTrigger}
                                                                onPress={() =>
                                                                    openRepetitionPicker({
                                                                        label: "Répétitions",
                                                                        field: "segmentRepetitions",
                                                                        serieId: serie.id,
                                                                        segmentId: segment.id,
                                                                        currentValue: segment.repetitions ?? 1,
                                                                    })
                                                                }
                                                                disabled={!canEdit}
                                                            >
                                                                <Text style={styles.pickerValue}>
                                                                    {formatRepetitionLabel(segment.repetitions)}
                                                                </Text>
                                                                <Text style={styles.pickerChevron}>▼</Text>
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                ) : null}

                                                {blockType === "start" ? (
                                                    <View style={styles.section}>
                                                        <Text style={styles.sectionLabel}>Starting block</Text>
                                                        <View style={styles.row}>
                                                            <TextInput
                                                                label="Nombre"
                                                                value={segment.startCount != null ? String(segment.startCount) : ""}
                                                                onChangeText={(text) => {
                                                                    const parsed = toNumber(text);
                                                                    updateSegment(
                                                                        serie.id,
                                                                        segment.id,
                                                                        "startCount",
                                                                        parsed == null ? undefined : parsed,
                                                                    );
                                                                }}
                                                                mode="outlined"
                                                                keyboardType="numeric"
                                                                style={[styles.input, styles.rowItem]}
                                                                disabled={!canEdit}
                                                            />
                                                            <TextInput
                                                                label="Distance de sortie"
                                                                value={segment.startExitDistance != null ? String(segment.startExitDistance) : ""}
                                                                onChangeText={(text) => {
                                                                    const parsed = toNumber(text);
                                                                    updateSegment(
                                                                        serie.id,
                                                                        segment.id,
                                                                        "startExitDistance",
                                                                        parsed == null ? undefined : parsed,
                                                                    );
                                                                }}
                                                                mode="outlined"
                                                                keyboardType="numeric"
                                                                style={[styles.input, styles.rowItem]}
                                                                disabled={!canEdit}
                                                            />
                                                        </View>
                                                    </View>
                                                ) : null}

                                                {blockType === "custom" ? (
                                                    <View style={styles.section}>
                                                        <Text style={styles.sectionLabel}>Bloc personnalisé</Text>

                                                        <TextInput
                                                            label="Objectif (optionnel)"
                                                            value={segment.customGoal || ""}
                                                            onChangeText={(text) => updateSegment(serie.id, segment.id, "customGoal", text)}
                                                            mode="outlined"
                                                            style={styles.input}
                                                            disabled={!canEdit}
                                                        />

                                                        <TextInput
                                                            label="Notes (optionnel)"
                                                            value={segment.customNotes || ""}
                                                            onChangeText={(text) => updateSegment(serie.id, segment.id, "customNotes", text)}
                                                            mode="outlined"
                                                            style={styles.input}
                                                            multiline
                                                            disabled={!canEdit}
                                                        />

                                                        <View style={styles.switchRow}>
                                                            <Text style={styles.switchLabel}>Métrique personnalisée</Text>
                                                            <Switch
                                                                value={Boolean(segment.customMetricEnabled)}
                                                                onValueChange={(next) => updateSegment(serie.id, segment.id, "customMetricEnabled", next)}
                                                                disabled={!canEdit}
                                                                color="#22d3ee"
                                                            />
                                                        </View>

                                                        {segment.customMetricEnabled ? (
                                                            <>
                                                                <View style={styles.chipRow}>
                                                                    {customMetricOptions.map((option) => (
                                                                        <Chip
                                                                            key={`${segment.id}-metric-${option.value}`}
                                                                            selected={(segment.customMetricKind || "distance") === option.value}
                                                                            onPress={() => updateSegment(serie.id, segment.id, "customMetricKind", option.value)}
                                                                            disabled={!canEdit}
                                                                            mode="outlined"
                                                                            compact
                                                                            style={styles.chip}
                                                                        >
                                                                            {option.label}
                                                                        </Chip>
                                                                    ))}
                                                                </View>

                                                                {segment.customMetricKind === "distance" ? (
                                                                    <TextInput
                                                                        label="Distance (m)"
                                                                        value={segment.customMetricDistance != null ? String(segment.customMetricDistance) : ""}
                                                                        onChangeText={(text) => {
                                                                            const parsed = toNumber(text);
                                                                            updateSegment(
                                                                                serie.id,
                                                                                segment.id,
                                                                                "customMetricDistance",
                                                                                parsed == null ? undefined : parsed,
                                                                            );
                                                                        }}
                                                                        mode="outlined"
                                                                        keyboardType="numeric"
                                                                        style={styles.input}
                                                                        disabled={!canEdit}
                                                                    />
                                                                ) : null}

                                                                {segment.customMetricKind === "duration" ? (
                                                                    <View>
                                                                        <Text style={styles.fieldLabel}>Durée (mm:ss)</Text>
                                                                        <Pressable
                                                                            style={styles.pickerTrigger}
                                                                            onPress={() =>
                                                                                openSecondsPicker(
                                                                                    serie.id,
                                                                                    segment,
                                                                                    "customMetricDurationSeconds",
                                                                                    "Durée",
                                                                                    segment.customMetricDurationSeconds,
                                                                                )
                                                                            }
                                                                            disabled={!canEdit}
                                                                        >
                                                                            <Text style={styles.pickerValue}>
                                                                                {formatSecondsLabel(segment.customMetricDurationSeconds)}
                                                                            </Text>
                                                                            <Text style={styles.pickerChevron}>▼</Text>
                                                                        </Pressable>
                                                                    </View>
                                                                ) : null}

                                                                {segment.customMetricKind === "reps" ? (
                                                                    <View>
                                                                        <Text style={styles.fieldLabel}>Répétitions</Text>
                                                                        <Pressable
                                                                            style={styles.pickerTrigger}
                                                                            onPress={() =>
                                                                                openRepetitionPicker({
                                                                                    label: "Répétitions",
                                                                                    field: "customMetricRepetitions",
                                                                                    serieId: serie.id,
                                                                                    segmentId: segment.id,
                                                                                    currentValue: segment.customMetricRepetitions ?? 1,
                                                                                })
                                                                            }
                                                                            disabled={!canEdit}
                                                                        >
                                                                            <Text style={styles.pickerValue}>
                                                                                {formatRepetitionLabel(segment.customMetricRepetitions)}
                                                                            </Text>
                                                                            <Text style={styles.pickerChevron}>▼</Text>
                                                                        </Pressable>
                                                                    </View>
                                                                ) : null}

                                                                {segment.customMetricKind === "exo" ? (
                                                                    <View style={styles.section}>
                                                                        {(() => {
                                                                            const dropdownKey = `${serie.id}:${segment.id}:customExercises`;
                                                                            const expanded = isExerciseDropdownExpanded(dropdownKey);
                                                                            const exercises = segment.customExercises || [];
                                                                            return (
                                                                                <View>
                                                                                    <Pressable
                                                                                        style={styles.dropdownHeader}
                                                                                        onPress={() => toggleExerciseDropdown(dropdownKey)}
                                                                                        accessibilityRole="button"
                                                                                        accessibilityLabel="Afficher les exercices"
                                                                                    >
                                                                                        <Text style={styles.dropdownHeaderText}>Exercices</Text>
                                                                                        <View style={styles.dropdownHeaderRight}>
                                                                                            <Text style={styles.dropdownCount}>{exercises.length}</Text>
                                                                                            <MaterialCommunityIcons
                                                                                                name={expanded ? "chevron-up" : "chevron-down"}
                                                                                                size={18}
                                                                                                color="#94a3b8"
                                                                                            />
                                                                                        </View>
                                                                                    </Pressable>

                                                                                    {expanded ? (
                                                                                        exercises.length ? (
                                                                                            <View style={styles.dropdownList}>
                                                                                                {exercises.map((exercise) => (
                                                                                                    <View
                                                                                                        key={`${segment.id}-custom-${exercise}`}
                                                                                                        style={styles.dropdownItem}
                                                                                                    >
                                                                                                        <Text style={styles.dropdownItemText}>
                                                                                                            {exercise}
                                                                                                        </Text>
                                                                                                        <IconButton
                                                                                                            icon="close"
                                                                                                            size={16}
                                                                                                            iconColor="#94a3b8"
                                                                                                            onPress={() =>
                                                                                                                removeExerciseByValue(
                                                                                                                    serie.id,
                                                                                                                    segment.id,
                                                                                                                    "customExercises",
                                                                                                                    exercise,
                                                                                                                )
                                                                                                            }
                                                                                                            disabled={!canEdit}
                                                                                                            style={styles.dropdownRemoveButton}
                                                                                                        />
                                                                                                    </View>
                                                                                                ))}
                                                                                            </View>
                                                                                        ) : (
                                                                                            <Text style={styles.helperText}>Aucun exercice.</Text>
                                                                                        )
                                                                                    ) : null}
                                                                                </View>
                                                                            );
                                                                        })()}

                                                                        <Button
                                                                            mode="outlined"
                                                                            icon="plus"
                                                                            onPress={() => openExercisePicker("customMetricExo", serie.id, segment)}
                                                                            disabled={!canEdit}
                                                                            textColor="#22d3ee"
                                                                            style={{ marginTop: 8 }}
                                                                        >
                                                                            Ajouter des exos
                                                                        </Button>
                                                                    </View>
                                                                ) : null}
                                                            </>
                                                        ) : null}
                                                    </View>
                                                ) : null}
                                            </View>
                                        );
                                    })}

                                    {(serie.segments || []).length ? (
                                        <Button
                                            mode="outlined"
                                            icon="plus"
                                            onPress={() => openAddBlockChooser(serie.id)}
                                            textColor="#22d3ee"
                                            disabled={!canEdit}
                                            style={{ marginTop: 8 }}
                                        >
                                            Ajouter un bloc
                                        </Button>
                                    ) : null}
                                </View>
                            </View>
                        ))}
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            <Modal visible={secondsPicker.visible} transparent animationType="fade" onRequestClose={closeSecondsPicker}>
                <Pressable style={styles.modalOverlay} onPress={closeSecondsPicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>{secondsPicker.visible ? secondsPicker.label : ""}</Text>
                        <Text style={styles.modalSubtitle}>Choisis une durée (mm:ss)</Text>

                        {secondsPicker.visible ? (
                            <View style={styles.modalRow}>
                                <View style={styles.modalColumn}>
                                    <Text style={styles.modalColumnLabel}>Minutes</Text>
                                    <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                        {Array.from({ length: 60 }, (_, i) => i).map((value) => {
                                            const selected = value === secondsPicker.minutes;
                                            return (
                                                <Pressable
                                                    key={`min-${value}`}
                                                    style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                    onPress={() =>
                                                        setSecondsPicker((prev) =>
                                                            prev.visible ? { ...prev, minutes: value } : prev,
                                                        )
                                                    }
                                                >
                                                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                                        {value.toString().padStart(2, "0")}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                                <View style={styles.modalColumn}>
                                    <Text style={styles.modalColumnLabel}>Secondes</Text>
                                    <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                        {Array.from({ length: 60 }, (_, i) => i).map((value) => {
                                            const selected = value === secondsPicker.seconds;
                                            return (
                                                <Pressable
                                                    key={`sec-${value}`}
                                                    style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                    onPress={() =>
                                                        setSecondsPicker((prev) =>
                                                            prev.visible ? { ...prev, seconds: value } : prev,
                                                        )
                                                    }
                                                >
                                                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                                        {value.toString().padStart(2, "0")}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            </View>
                        ) : null}

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeSecondsPicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button mode="contained" onPress={confirmSecondsPicker} buttonColor="#22d3ee" textColor="#02111f">
                                Valider
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={seriesRestPicker.visible} transparent animationType="fade" onRequestClose={closeSeriesRestPicker}>
                <Pressable style={styles.modalOverlay} onPress={closeSeriesRestPicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>Repos entre séries</Text>
                        <Text style={styles.modalSubtitle}>Choisis une durée (mm:ss)</Text>

                        {seriesRestPicker.visible ? (
                            <View style={styles.modalRow}>
                                <View style={styles.modalColumn}>
                                    <Text style={styles.modalColumnLabel}>Min</Text>
                                    <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                        {Array.from({ length: 60 }, (_, i) => i).map((value) => {
                                            const selected = value === seriesRestPicker.minutes;
                                            return (
                                                <Pressable
                                                    key={`sr-min-${value}`}
                                                    style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                    onPress={() =>
                                                        setSeriesRestPicker((prev) =>
                                                            prev.visible ? { ...prev, minutes: value } : prev,
                                                        )
                                                    }
                                                >
                                                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                                        {value}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>
                                </View>

                                <View style={styles.modalColumn}>
                                    <Text style={styles.modalColumnLabel}>Sec</Text>
                                    <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                        {Array.from({ length: 60 }, (_, i) => i).map((value) => {
                                            const selected = value === seriesRestPicker.seconds;
                                            return (
                                                <Pressable
                                                    key={`sr-sec-${value}`}
                                                    style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                    onPress={() =>
                                                        setSeriesRestPicker((prev) =>
                                                            prev.visible ? { ...prev, seconds: value } : prev,
                                                        )
                                                    }
                                                >
                                                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                                        {value.toString().padStart(2, "0")}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            </View>
                        ) : null}

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeSeriesRestPicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button mode="contained" onPress={confirmSeriesRestPicker} buttonColor="#22d3ee" textColor="#02111f">
                                Valider
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={repetitionPicker.visible} transparent animationType="fade" onRequestClose={closeRepetitionPicker}>
                <Pressable style={styles.modalOverlay} onPress={closeRepetitionPicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>{repetitionPicker.visible ? repetitionPicker.label : "Répétitions"}</Text>
                        <Text style={styles.modalSubtitle}>Choisis une valeur entre 1 et 50</Text>

                        {repetitionPicker.visible ? (
                            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                {REPETITION_OPTIONS.map((option) => {
                                    const selected = option === repetitionPicker.value;
                                    return (
                                        <Pressable
                                            key={`rep-${option}`}
                                            style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                            onPress={() =>
                                                setRepetitionPicker((prev) =>
                                                    prev.visible ? { ...prev, value: option } : prev,
                                                )
                                            }
                                        >
                                            <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                                {option}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        ) : null}

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeRepetitionPicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button mode="contained" onPress={confirmRepetitionPicker} buttonColor="#22d3ee" textColor="#02111f">
                                Valider
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={distancePicker.visible} transparent animationType="fade" onRequestClose={closeDistancePicker}>
                <Pressable style={styles.modalOverlay} onPress={closeDistancePicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>{distancePicker.visible ? distancePicker.label : ""}</Text>
                        <Text style={styles.modalSubtitle}>Choisis une distance</Text>

                        {distancePicker.visible ? (
                            <>
                                <View style={styles.chipRow}>
                                    {distanceUnitOptions.map((option) => (
                                        <Chip
                                            key={`dist-unit-${option.value}`}
                                            selected={distancePicker.unit === option.value}
                                            onPress={() =>
                                                setDistancePicker((prev) =>
                                                    prev.visible ? { ...prev, unit: option.value } : prev,
                                                )
                                            }
                                            mode="outlined"
                                            compact
                                            style={styles.chip}
                                        >
                                            {option.label}
                                        </Chip>
                                    ))}
                                </View>

                                {distancePicker.unit === "km" ? (
                                    <View style={styles.modalRow}>
                                        <View style={styles.modalColumn}>
                                            <Text style={styles.modalColumnLabel}>Km</Text>
                                            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                                {Array.from({ length: 100 }, (_, i) => i).map((value) => {
                                                    const selected = value === distancePicker.kilometersWhole;
                                                    return (
                                                        <Pressable
                                                            key={`km-${value}`}
                                                            style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                            onPress={() =>
                                                                setDistancePicker((prev) =>
                                                                    prev.visible ? { ...prev, kilometersWhole: value } : prev,
                                                                )
                                                            }
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.modalOptionText,
                                                                    selected && styles.modalOptionTextSelected,
                                                                ]}
                                                            >
                                                                {value}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                        <View style={styles.modalColumn}>
                                            <Text style={styles.modalColumnLabel}>Cent.</Text>
                                            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                                {Array.from({ length: 100 }, (_, i) => i).map((value) => {
                                                    const selected = value === distancePicker.kilometersHundredth;
                                                    return (
                                                        <Pressable
                                                            key={`kmc-${value}`}
                                                            style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                            onPress={() =>
                                                                setDistancePicker((prev) =>
                                                                    prev.visible ? { ...prev, kilometersHundredth: value } : prev,
                                                                )
                                                            }
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.modalOptionText,
                                                                    selected && styles.modalOptionTextSelected,
                                                                ]}
                                                            >
                                                                {value.toString().padStart(2, "0")}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.modalRow}>
                                        <View style={styles.modalColumn}>
                                            <Text style={styles.modalColumnLabel}>Centaines</Text>
                                            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                                {Array.from({ length: 100 }, (_, i) => i).map((value) => {
                                                    const selected = value === distancePicker.metersHundreds;
                                                    return (
                                                        <Pressable
                                                            key={`mh-${value}`}
                                                            style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                            onPress={() =>
                                                                setDistancePicker((prev) =>
                                                                    prev.visible ? { ...prev, metersHundreds: value } : prev,
                                                                )
                                                            }
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.modalOptionText,
                                                                    selected && styles.modalOptionTextSelected,
                                                                ]}
                                                            >
                                                                {value}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                        <View style={styles.modalColumn}>
                                            <Text style={styles.modalColumnLabel}>+ mètres</Text>
                                            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                                                {Array.from({ length: 100 }, (_, i) => i).map((value) => {
                                                    const selected = value === distancePicker.metersRemainder;
                                                    return (
                                                        <Pressable
                                                            key={`mr-${value}`}
                                                            style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                                            onPress={() =>
                                                                setDistancePicker((prev) =>
                                                                    prev.visible ? { ...prev, metersRemainder: value } : prev,
                                                                )
                                                            }
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.modalOptionText,
                                                                    selected && styles.modalOptionTextSelected,
                                                                ]}
                                                            >
                                                                {value.toString().padStart(2, "0")}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                    </View>
                                )}
                            </>
                        ) : null}

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeDistancePicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button mode="contained" onPress={confirmDistancePicker} buttonColor="#22d3ee" textColor="#02111f">
                                Valider
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={blockTypePicker.visible} transparent animationType="fade" onRequestClose={closeBlockTypePicker}>
                <Pressable style={styles.modalOverlay} onPress={closeBlockTypePicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>Type de bloc</Text>
                        <Text style={styles.modalSubtitle}>Choisis le type du bloc</Text>

                        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                            {trainingBlockCatalog.map((entry) => {
                                const serieId = blockTypePicker.serieId;
                                const segmentId = blockTypePicker.segmentId;

                                const currentSerie = serieId ? (values.series || []).find((s) => s.id === serieId) : undefined;
                                const currentSegment = segmentId
                                    ? (currentSerie?.segments || []).find((s) => s.id === segmentId)
                                    : undefined;

                                const currentType = (currentSegment?.blockType || "vitesse") as TrainingBlockType;
                                const selected = entry.type === currentType;

                                return (
                                    <Pressable
                                        key={`blocktype-${entry.type}`}
                                        style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                        onPress={() => {
                                            if (serieId && currentSegment) {
                                                handleSetBlockType(serieId, currentSegment, entry.type);
                                            }
                                            closeBlockTypePicker();
                                        }}
                                    >
                                        <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                            {entry.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeBlockTypePicker} textColor="#cbd5e1">
                                Fermer
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={typePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setTypePickerVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setTypePickerVisible(false)}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>Type</Text>
                        <Text style={styles.modalSubtitle}>Sélectionne le type du template</Text>

                        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                            {trainingTypeOptions.map((option) => {
                                const selected = option.value === values.type;
                                return (
                                    <Pressable
                                        key={`type-${option.value}`}
                                        style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                        onPress={() => {
                                            setField("type", option.value);
                                            setTypePickerVisible(false);
                                        }}
                                    >
                                        <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                            {option.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={() => setTypePickerVisible(false)} textColor="#cbd5e1">
                                Fermer
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={addBlockChooser.visible}
                transparent
                animationType="fade"
                onRequestClose={closeAddBlockChooser}
            >
                <Pressable style={styles.modalOverlay} onPress={closeAddBlockChooser}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>Ajouter un bloc</Text>
                        <Text style={styles.modalSubtitle}>Choisis la source du bloc</Text>

                        <View style={{ gap: 10 }}>
                            <Button
                                mode="contained"
                                onPress={() => {
                                    if (!addBlockChooser.visible) return;
                                    const serieId = addBlockChooser.serieId;
                                    closeAddBlockChooser();
                                    openMyBlocksPicker(serieId);
                                }}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                disabled={!canEdit}
                            >
                                Depuis mes blocs
                            </Button>
                            <Button
                                mode="outlined"
                                onPress={() => {
                                    if (!addBlockChooser.visible) return;
                                    const serieId = addBlockChooser.serieId;
                                    closeAddBlockChooser();
                                    startCreateBlockForSerie(serieId);
                                }}
                                textColor="#22d3ee"
                                disabled={!canEdit}
                            >
                                Créer un nouveau bloc
                            </Button>
                        </View>

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeAddBlockChooser} textColor="#cbd5e1">
                                Annuler
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={exercisePicker.visible} transparent animationType="fade" onRequestClose={closeExercisePicker}>
                <Pressable style={styles.modalOverlay} onPress={closeExercisePicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>{exercisePicker.visible ? exercisePicker.title : ""}</Text>
                        <Text style={styles.modalSubtitle}>Sélectionne une ou plusieurs options</Text>

                        {exercisePicker.visible ? (
                            <View style={{ gap: 10 }}>
                                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                                    <TextInput
                                        mode="outlined"
                                        value={exercisePicker.customDraft}
                                        onChangeText={(text) =>
                                            setExercisePicker((prev) =>
                                                prev.visible ? { ...prev, customDraft: text } : prev,
                                            )
                                        }
                                        placeholder="Ajouter un exo (optionnel)"
                                        style={[styles.input, { flex: 1 }]}
                                        onSubmitEditing={addCustomExerciseFromPicker}
                                        disabled={!canEdit}
                                    />
                                    <Button
                                        mode="contained"
                                        icon="plus"
                                        onPress={addCustomExerciseFromPicker}
                                        disabled={!canEdit || !exercisePicker.customDraft.trim()}
                                        buttonColor="#22d3ee"
                                        textColor="#02111f"
                                    >
                                        {null}
                                    </Button>
                                </View>

                                <ScrollView style={{ maxHeight: 320 }}>
                                    {exercisePicker.library.map((exo) => {
                                        const selectedLower = new Set(
                                            Array.from(exercisePicker.selected).map((v) => normalizeExerciseName(v).toLowerCase()),
                                        );
                                        const selected = selectedLower.has(normalizeExerciseName(exo).toLowerCase());

                                        return (
                                            <Pressable
                                                key={`picker-${exercisePicker.kind}-${exo}`}
                                                style={[styles.modalOption, styles.modalOptionRow, selected && styles.modalOptionSelected]}
                                                onPress={() => toggleExercisePickerSelection(exo)}
                                                disabled={!canEdit}
                                            >
                                                <Text
                                                    style={[
                                                        styles.modalOptionText,
                                                        { flex: 1, textAlign: "left" },
                                                        selected && styles.modalOptionTextSelected,
                                                    ]}
                                                >
                                                    {exo}
                                                </Text>
                                                <MaterialCommunityIcons
                                                    name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                                    size={20}
                                                    color={selected ? "#02111f" : "#94a3b8"}
                                                />
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        ) : null}

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closeExercisePicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                onPress={confirmExercisePicker}
                                disabled={!canEdit}
                            >
                                {exercisePicker.visible ? `Ajouter (${exercisePicker.selected.size})` : "Ajouter"}
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={pacePicker.visible} transparent animationType="fade" onRequestClose={closePacePicker}>
                <Pressable style={styles.modalOverlay} onPress={closePacePicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>Intensité</Text>
                        <Text style={styles.modalSubtitle}>Sélectionne un pourcentage de référence</Text>

                        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                            {PACE_PERCENT_OPTIONS.map((option) => {
                                const selected = pacePicker.visible && option === pacePicker.value;
                                return (
                                    <Pressable
                                        key={`pace-${option}`}
                                        style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                        onPress={() =>
                                            setPacePicker((prev) =>
                                                prev.visible ? { ...prev, value: option } : prev,
                                            )
                                        }
                                        disabled={!canEdit}
                                    >
                                        <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                            {`${option}%`}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closePacePicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                onPress={confirmPacePicker}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                disabled={!canEdit}
                            >
                                OK
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={paceReferencePicker.visible}
                transparent
                animationType="fade"
                onRequestClose={closePaceReferencePicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closePaceReferencePicker}>
                    <Pressable style={styles.modalCard} onPress={() => null}>
                        <Text style={styles.modalTitle}>Référence</Text>
                        <Text style={styles.modalSubtitle}>Sélectionne la référence d&apos;intensité</Text>

                        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                            {(() => {
                                if (!paceReferencePicker.visible) return null;
                                const serie = values.series.find((item) => item.id === paceReferencePicker.serieId);
                                if (!serie) return null;
                                const segments = serie.segments || [];
                                const hasDistanceBlock = segments.some((segment) => {
                                    const blockType = (segment.blockType || "vitesse") as any;
                                    const metricEnabled = Boolean(segment.customMetricEnabled);
                                    const metricKind = segment.customMetricKind;

                                    if (blockType === "ppg" || blockType === "muscu" || blockType === "recup" || blockType === "start") {
                                        return false;
                                    }
                                    if (blockType === "cotes") {
                                        return (segment.cotesMode || "distance") === "distance";
                                    }
                                    if (blockType === "custom" && metricEnabled) {
                                        return metricKind === "distance";
                                    }
                                    return true;
                                });
                                const hasLoadBlock = segments.some((segment) => (segment.blockType || "vitesse") === "muscu");

                                const allowed: PaceReferenceValue[] = [
                                    ...(hasDistanceBlock ? (DISTANCE_PACE_REFERENCE_OPTIONS as unknown as PaceReferenceValue[]) : []),
                                    ...(hasLoadBlock ? (LOAD_PACE_REFERENCE_OPTIONS as unknown as PaceReferenceValue[]) : []),
                                ];

                                return allowed.map((option) => {
                                    const selected = option === paceReferencePicker.value;
                                    return (
                                        <Pressable
                                            key={`ref-${option}`}
                                            style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                            onPress={() =>
                                                setPaceReferencePicker((prev) =>
                                                    prev.visible ? { ...prev, value: option } : prev,
                                                )
                                            }
                                            disabled={!canEdit}
                                        >
                                            <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                                {formatPaceReferenceDistanceLabel(option)}
                                            </Text>
                                        </Pressable>
                                    );
                                });
                            })()}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={closePaceReferencePicker} textColor="#cbd5e1">
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                onPress={confirmPaceReferencePicker}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                disabled={!canEdit}
                            >
                                OK
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={myBlocksPicker.visible}
                transparent
                animationType="fade"
                onRequestClose={closeMyBlocksPicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closeMyBlocksPicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Mes blocs</Text>
                        {myBlocksPicker.visible && myBlocksPicker.loading ? (
                            <View style={{ paddingVertical: 24, alignItems: "center" }}>
                                <ActivityIndicator />
                            </View>
                        ) : null}
                        {myBlocksPicker.visible && !myBlocksPicker.loading ? (
                            <ScrollView
                                style={styles.modalScroll}
                                contentContainerStyle={[styles.modalScrollContent, { paddingBottom: 12 }]}
                            >
                                {myBlocksPickerGroupedBlocks.personal.length || myBlocksPickerGroupedBlocks.defaults.length ? (
                                    <>
                                        {myBlocksPickerGroupedBlocks.personal.length ? (
                                            <>
                                                <Pressable
                                                    style={styles.pickerSectionHeaderRow}
                                                    onPress={() => toggleMyBlocksPickerSection("personal")}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Afficher les blocs personnels"
                                                >
                                                    <View style={styles.pickerSectionHeaderLeft}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name={
                                                                myBlocksPickerExpandedSections.has("personal")
                                                                    ? "chevron-down"
                                                                    : "chevron-right"
                                                            }
                                                            size={18}
                                                            color="#94a3b8"
                                                        />
                                                        <Text style={styles.pickerSectionTitle}>Blocs personnels</Text>
                                                    </View>
                                                    <View style={styles.pickerSectionHeaderRight}>
                                                        <View style={styles.pickerCountPill}>
                                                            <Text style={styles.pickerCountText}>
                                                                {myBlocksPickerGroupedBlocks.personal.length}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </Pressable>

                                                {myBlocksPickerExpandedSections.has("personal")
                                                    ? myBlocksPickerGroupedBlocksByType.personal.map((section) => (
                                                        <View key={section.key} style={{ gap: 6 }}>
                                                            <Pressable
                                                                style={styles.pickerTypeHeaderRow}
                                                                onPress={() => toggleMyBlocksPickerType(section.key)}
                                                                accessibilityRole="button"
                                                                accessibilityLabel={`Afficher les blocs ${section.title}`}
                                                            >
                                                                <View style={styles.pickerTypeHeaderLeft}>
                                                                    <MaterialCommunityIcons
                                                                        name={
                                                                            myBlocksPickerExpandedTypes.has(section.key)
                                                                                ? "chevron-down"
                                                                                : "chevron-right"
                                                                        }
                                                                        size={18}
                                                                        color="#94a3b8"
                                                                    />
                                                                    <Text style={styles.pickerTypeTitle}>{section.title}</Text>
                                                                </View>
                                                                <View style={styles.pickerTypeHeaderRight}>
                                                                    <View style={styles.pickerTypeCountPill}>
                                                                        <Text style={styles.pickerTypeCountText}>{section.blocks.length}</Text>
                                                                    </View>
                                                                </View>
                                                            </Pressable>

                                                            {myBlocksPickerExpandedTypes.has(section.key)
                                                                ? section.blocks.map((block) => (
                                                                    <Pressable
                                                                        key={block.id}
                                                                        style={styles.modalItem}
                                                                        onPress={() => {
                                                                            const serieId = myBlocksPickerSerieId;
                                                                            if (serieId) {
                                                                                handleAddSegmentFromBlock(serieId, block);
                                                                            }
                                                                            closeMyBlocksPicker();
                                                                        }}
                                                                    >
                                                                        <Text style={styles.modalItemText}>{block.title}</Text>
                                                                    </Pressable>
                                                                ))
                                                                : null}
                                                        </View>
                                                    ))
                                                    : null}
                                            </>
                                        ) : null}

                                        {myBlocksPickerGroupedBlocks.defaults.length ? (
                                            <>
                                                {myBlocksPickerGroupedBlocks.personal.length ? (
                                                    <View style={{ height: 6 }} />
                                                ) : null}
                                                <Pressable
                                                    style={styles.pickerSectionHeaderRow}
                                                    onPress={() => toggleMyBlocksPickerSection("default")}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Afficher les blocs par défaut"
                                                >
                                                    <View style={styles.pickerSectionHeaderLeft}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name={
                                                                myBlocksPickerExpandedSections.has("default")
                                                                    ? "chevron-down"
                                                                    : "chevron-right"
                                                            }
                                                            size={18}
                                                            color="#94a3b8"
                                                        />
                                                        <Text style={styles.pickerSectionTitle}>Blocs par défaut</Text>
                                                    </View>
                                                    <View style={styles.pickerSectionHeaderRight}>
                                                        <View style={styles.pickerCountPill}>
                                                            <Text style={styles.pickerCountText}>
                                                                {myBlocksPickerGroupedBlocks.defaults.length}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </Pressable>

                                                {myBlocksPickerExpandedSections.has("default")
                                                    ? myBlocksPickerGroupedBlocksByType.defaults.map((section) => (
                                                        <View key={section.key} style={{ gap: 6 }}>
                                                            <Pressable
                                                                style={styles.pickerTypeHeaderRow}
                                                                onPress={() => toggleMyBlocksPickerType(section.key)}
                                                                accessibilityRole="button"
                                                                accessibilityLabel={`Afficher les blocs ${section.title}`}
                                                            >
                                                                <View style={styles.pickerTypeHeaderLeft}>
                                                                    <MaterialCommunityIcons
                                                                        name={
                                                                            myBlocksPickerExpandedTypes.has(section.key)
                                                                                ? "chevron-down"
                                                                                : "chevron-right"
                                                                        }
                                                                        size={18}
                                                                        color="#94a3b8"
                                                                    />
                                                                    <Text style={styles.pickerTypeTitle}>{section.title}</Text>
                                                                </View>
                                                                <View style={styles.pickerTypeHeaderRight}>
                                                                    <View style={styles.pickerTypeCountPill}>
                                                                        <Text style={styles.pickerTypeCountText}>{section.blocks.length}</Text>
                                                                    </View>
                                                                </View>
                                                            </Pressable>

                                                            {myBlocksPickerExpandedTypes.has(section.key)
                                                                ? section.blocks.map((block) => (
                                                                    <Pressable
                                                                        key={block.id}
                                                                        style={styles.modalItem}
                                                                        onPress={() => {
                                                                            const serieId = myBlocksPickerSerieId;
                                                                            if (serieId) {
                                                                                handleAddSegmentFromBlock(serieId, block);
                                                                            }
                                                                            closeMyBlocksPicker();
                                                                        }}
                                                                    >
                                                                        <Text style={styles.modalItemText}>{block.title}</Text>
                                                                    </Pressable>
                                                                ))
                                                                : null}
                                                        </View>
                                                    ))
                                                    : null}
                                            </>
                                        ) : null}
                                    </>
                                ) : (
                                    <Text style={{ color: "#94a3b8" }}>Aucun bloc enregistré.</Text>
                                )}
                            </ScrollView>
                        ) : null}
                        <Button mode="text" textColor="#38bdf8" onPress={closeMyBlocksPicker}>
                            Fermer
                        </Button>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#020617",
    },
    scroll: {
        flex: 1,
        backgroundColor: "#020617",
    },
    container: {
        paddingHorizontal: 8,
        gap: 18,
    },
    header: {
        gap: 8,
    },
    fixedHeader: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        paddingHorizontal: 8,
        justifyContent: "flex-end",
        backgroundColor: "#020617",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
    },
    fixedHeaderActions: {
        height: 56,
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 8,
        alignItems: "center",
    },
    fixedHeaderPrimaryActions: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    fixedHeaderButton: {
        flexShrink: 1,
        minWidth: 0,
    },
    fixedHeaderButtonLabel: {
        fontSize: 12,
        marginHorizontal: 10,
    },
    fixedHeaderPrimaryButtonContent: {
        paddingHorizontal: 10,
    },
    fixedHeaderPrimaryButtonLabel: {
        fontSize: 12,
        marginHorizontal: 0,
    },
    defaultBanner: {
        borderRadius: 20,
        padding: 14,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        gap: 10,
    },
    defaultBannerTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "700",
        textAlign: "center",
    },
    defaultBannerText: {
        color: "#cbd5e1",
        lineHeight: 20,
        textAlign: "center",
    },
    deleteButton: {
        borderColor: "rgba(248,113,113,0.5)",
        width: "100%",
    },
    deleteHeaderButton: {
        borderColor: "rgba(248,113,113,0.5)",
        flexShrink: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#f8fafc",
    },
    subtitle: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
    card: {
        borderRadius: 20,
        padding: 10,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        gap: 12,
    },
    cardHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    cardTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "700",
    },
    cardSubtitle: {
        color: "#94a3b8",
        marginTop: 2,
        fontSize: 11
    },
    input: {
        backgroundColor: "transparent",
    },
    seriesCard: {
        borderRadius: 18,
        padding: 12,
        backgroundColor: "rgba(2,6,23,0.4)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.04)",
        gap: 10,
    },
    seriesHeader: {
        gap: 6,
    },
    seriesHeaderTop: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    seriesHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    seriesRemoveButton: {
        margin: -10,
    },
    seriesTitle: {
        color: "#e2e8f0",
        fontSize: 15,
        fontWeight: "700",
    },
    seriesInlineTrigger: {
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: "rgba(11, 20, 56, 0.4)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
    },
    seriesInlineLabel: {
        color: "#94a3b8",
        fontSize: 11,
        fontWeight: "700",
    },
    seriesInlineValueRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    seriesRepeatControlRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        alignSelf: "stretch",
    },
    seriesRepeatIconButton: {
        margin: -10,
    },
    seriesInlineValue: {
        color: "#f8fafc",
        fontWeight: "700",
        fontSize: 11,
    },
    seriesPaceCard: {
        borderRadius: 16,
        padding: 10,
        backgroundColor: "rgba(2,6,23,0.25)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.04)",
        gap: 10,
    },
    seriesPaceToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.18)",
        backgroundColor: "rgba(15,23,42,0.35)",
    },
    seriesPaceToggleActive: {
        borderColor: "rgba(34,211,238,0.55)",
        backgroundColor: "rgba(34,211,238,0.10)",
    },
    seriesPaceToggleTexts: {
        flex: 1,
        gap: 2,
    },
    seriesPaceToggleLabel: {
        color: "#e2e8f0",
        fontWeight: "800",
    },
    seriesPaceToggleHint: {
        color: "#94a3b8",
        fontSize: 12,
    },
    seriesPaceSelectors: {
        flexDirection: "row",
        gap: 10,
    },
    seriesPaceSelector: {
        flex: 1,
        alignItems: "stretch",
    },
    seriesLoadReferenceRow: {
        gap: 8,
    },
    segmentList: {
        gap: 12,
        marginTop: 4,
    },
    emptySeriesCard: {
        borderRadius: 16,
        padding: 12,
        backgroundColor: "rgba(15,23,42,0.35)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.03)",
        gap: 10,
        alignItems: "center",
    },
    emptySeriesText: {
        color: "#94a3b8",
    },
    segmentCard: {
        borderRadius: 16,
        padding: 12,
        backgroundColor: "rgba(15,23,42,0.55)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.03)",
        gap: 10,
    },
    segmentHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    segmentTitle: {
        color: "#e2e8f0",
        fontSize: 14,
        fontWeight: "700",
        flex: 1,
    },
    row: {
        flexDirection: "row",
        gap: 12,
    },
    rowItem: {
        flex: 1,
        minWidth: 120,
    },
    fieldLabel: {
        color: "#94a3b8",
        fontSize: 11,
        fontWeight: "700",
        marginBottom: 6,
    },
    pickerTrigger: {
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: "rgba(2,6,23,0.4)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    pickerValue: {
        color: "#f8fafc",
        fontWeight: "700",
    },
    pickerChevron: {
        color: "#94a3b8",
        fontWeight: "900",
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    chip: {
        borderRadius: 999,
        borderWidth: 1,
    },
    section: {
        gap: 10,
    },
    sectionLabel: {
        color: "#cbd5e1",
        fontWeight: "700",
    },
    helperText: {
        color: "#94a3b8",
        marginTop: 4,
    },
    dropdownHeader: {
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "rgba(2,6,23,0.4)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    dropdownHeaderText: {
        color: "#cbd5e1",
        fontWeight: "800",
    },
    dropdownHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    dropdownCount: {
        color: "#94a3b8",
        fontWeight: "800",
        fontSize: 12,
    },
    dropdownList: {
        marginTop: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(2,6,23,0.28)",
        overflow: "hidden",
    },
    dropdownItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
    },
    dropdownItemText: {
        color: "#f8fafc",
        fontWeight: "600",
        flex: 1,
        paddingRight: 8,
    },
    dropdownRemoveButton: {
        margin: -10,
    },
    exerciseRow: {
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
    },
    exerciseList: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    exerciseChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(15,23,42,0.65)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
    },
    exerciseChipText: {
        color: "#f8fafc",
        fontWeight: "600",
    },
    exerciseChipRemove: {
        color: "#94a3b8",
        fontWeight: "900",
        paddingHorizontal: 4,
    },
    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    switchLabel: {
        color: "#cbd5e1",
        fontWeight: "700",
    },
    footer: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 4,
    },
    addDistanceButton: {
        borderColor: "rgba(34,211,238,0.4)",
        borderRadius: 999,
        alignSelf: "center",
        backgroundColor: "rgba(34,211,238,0.5)",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.72)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    modalCard: {
        borderRadius: 18,
        backgroundColor: "#0b1220",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        padding: 14,
        gap: 12,
        width: "100%",
        maxWidth: 420,
        maxHeight: "70%",
    },
    modalTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "800",
    },
    modalSubtitle: {
        color: "#94a3b8",
    },
    modalRow: {
        flexDirection: "row",
        gap: 12,
    },
    modalColumn: {
        flex: 1,
        gap: 8,
    },
    modalColumnLabel: {
        color: "#cbd5e1",
        fontWeight: "700",
    },
    modalScroll: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(2,6,23,0.35)",
        maxHeight: 280,
    },
    modalScrollContent: {
        padding: 8,
        gap: 6,
    },
    pickerSectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingHorizontal: 2,
        paddingVertical: 6,
    },
    pickerSectionHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    pickerSectionHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    pickerSectionTitle: {
        color: "#e2e8f0",
        fontSize: 13,
        fontWeight: "800",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        flex: 1,
    },
    pickerTypeTitle: {
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0,
        textTransform: "none",
        flex: 1,
    },
    pickerTypeHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginTop: 4,
        marginLeft: 16,
        borderRadius: 12,
        backgroundColor: "rgba(15,23,42,0.35)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    pickerTypeHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    pickerTypeHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    pickerTypeCountPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: "rgba(148,163,184,0.08)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.18)",
    },
    pickerTypeCountText: {
        color: "#94a3b8",
        fontWeight: "800",
        fontSize: 11,
    },
    pickerCountPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(148,163,184,0.12)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
    },
    pickerCountText: {
        color: "#e2e8f0",
        fontWeight: "800",
        fontSize: 12,
    },
    modalOption: {
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.18)",
    },
    modalOptionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    modalOptionSelected: {
        backgroundColor: "rgba(34,211,238,0.18)",
        borderColor: "rgba(34,211,238,0.6)",
    },
    modalOptionText: {
        color: "#cbd5e1",
        fontWeight: "700",
        textAlign: "center",
    },
    modalOptionTextSelected: {
        color: "#f8fafc",
    },
    modalItem: {
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.18)",
        backgroundColor: "rgba(15,23,42,0.55)",
        marginBottom: 8,
    },
    modalItemText: {
        color: "#e2e8f0",
        fontWeight: "700",
    },
    modalActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    stateContainer: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#020617",
    },
    stateText: {
        color: "#f8fafc",
    },
});
