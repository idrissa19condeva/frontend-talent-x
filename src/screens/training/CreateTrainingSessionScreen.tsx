import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    KeyboardEvent,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { ActivityIndicator, Button, TextInput, Text, IconButton } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useTraining } from "../../context/TrainingContext";
import {
    PACE_REFERENCE_DISTANCE_OPTIONS,
    PACE_REFERENCE_LABELS,
    PaceReferenceValue,
    LoadPaceReferenceValue,
    isLoadReference,
} from "../../constants/paceReferences";
import {
    buildTrainingSeriesBlock,
    buildTrainingSeriesSegment,
    trainingBlockCatalog,
    useTrainingForm,
} from "../../hooks/useTrainingForm";
import {
    computeSegmentPacePreview,
    LOAD_REFERENCE_PLACEHOLDER,
    LOAD_REFERENCE_SERIES_FIELD_MAP,
    LOAD_REFERENCE_UNITS,
    PaceComputationProfile,
    formatLoadValue,
} from "../../utils/paceTargets";
import { TrainingTypeSelect } from "../../components/training/TrainingTypeSelect";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
    CreateTrainingSessionPayload,
    CustomBlockMetricKind,
    TrainingBlockType,
    TrainingSeries,
    TrainingSeriesSegment,
    TrainingSession,
    TrainingStatus,
} from "../../types/training";

const DEFAULT_SESSION_DATE = new Date();

const parseSessionDate = (value?: string): Date | null => {
    if (!value) return null;
    const normalized = value.includes("T") ? value : `${value}T00:00:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatSessionDateDisplay = (value?: string): string => {
    const parsed = parseSessionDate(value);
    if (!parsed) return "Choisir";
    return parsed.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
};
const formatSessionDatePayload = (date: Date): string => date.toISOString();

const parseSessionTimeValue = (value?: string): Date | null => {
    if (!value) return null;
    const [hours, minutes] = value.split(":");
    const parsedHours = Number(hours);
    const parsedMinutes = Number(minutes);
    if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) {
        return null;
    }
    const date = new Date();
    date.setHours(parsedHours, parsedMinutes, 0, 0);
    return date;
};

const formatSessionTimePayload = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
};

const formatSessionTimeDisplay = (value?: string): string => {
    const trimmed = value?.trim();
    return trimmed && /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : "Choisir";
};

const DEFAULT_DURATION_MINUTES = 60;

const clampDurationMinutesValue = (value: number) => Math.max(0, Math.min(value, 23 * 60 + 59));

const buildDurationDate = (minutes?: number): Date => {
    const safeMinutes = clampDurationMinutesValue(
        typeof minutes === "number" && minutes >= 0 ? minutes : DEFAULT_DURATION_MINUTES,
    );
    const date = new Date();
    date.setHours(Math.floor(safeMinutes / 60), safeMinutes % 60, 0, 0);
    return date;
};

const minutesFromDate = (value: Date): number => clampDurationMinutesValue(value.getHours() * 60 + value.getMinutes());

const formatSessionDurationDisplay = (value?: number, fallback: string = "Choisir"): string => {
    if (typeof value !== "number" || value < 0) {
        return fallback;
    }
    const safeMinutes = clampDurationMinutesValue(value);
    const hours = Math.floor(safeMinutes / 60)
        .toString()
        .padStart(2, "0");
    const minutes = (safeMinutes % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
};

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const SESSION_STATUS_OPTIONS: { value: TrainingStatus; label: string; icon: MaterialIconName }[] = [
    { value: "planned", label: "Planifiée", icon: "calendar-check" },
    { value: "ongoing", label: "En cours", icon: "progress-clock" },
    { value: "done", label: "Terminée", icon: "check-circle" },
    { value: "postponed", label: "Reportée", icon: "calendar-clock" },
    { value: "canceled", label: "Annulée", icon: "close-octagon" },
];
const MAX_SERIES = 11;
const MAX_REST_MINUTES = 59;
const REST_MINUTE_OPTIONS = Array.from({ length: MAX_REST_MINUTES + 1 }, (_, index) => index);
const REST_SECOND_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const DISTANCE_HUNDRED_OPTIONS = Array.from({ length: 10 }, (_, index) => index);
const DISTANCE_REMAINDER_OPTIONS = Array.from({ length: 100 }, (_, index) => index);
const MAX_DISTANCE_METERS = DISTANCE_HUNDRED_OPTIONS[DISTANCE_HUNDRED_OPTIONS.length - 1] * 100 + 99; // 999m
const MAX_DISTANCE_KILOMETERS =
    DISTANCE_HUNDRED_OPTIONS[DISTANCE_HUNDRED_OPTIONS.length - 1] + 99 / 100; // 9.99km
const DISTANCE_UNIT_OPTIONS = ["m", "km"] as const;
const REPETITION_MAX = 50;
const REPETITION_OPTIONS = Array.from({ length: REPETITION_MAX }, (_, index) => index + 1);
const SERIES_REPEAT_MAX = 50;
const SERIES_REPEAT_OPTIONS = Array.from({ length: SERIES_REPEAT_MAX }, (_, index) => index + 1);
const DEFAULT_SERIES_PACE_PERCENT = 90;
const PACE_PERCENT_OPTIONS = Array.from({ length: 11 }, (_, index) => 50 + index * 5); // 50% -> 100%
type PaceReferenceDistanceValue = PaceReferenceValue;
const DEFAULT_PACE_REFERENCE_DISTANCE: PaceReferenceDistanceValue = "100m";
const CUSTOM_BLOCK_PLACEHOLDER = "Bloc personnalisé";
type CustomMetricSelectableKind = Extract<CustomBlockMetricKind, "distance" | "duration" | "exo">;
const CUSTOM_BLOCK_METRIC_OPTIONS: { label: string; value: CustomMetricSelectableKind }[] = [
    { label: "Distance", value: "distance" },
    { label: "Durée", value: "duration" },
    { label: "Exercices", value: "exo" },
];

const sessionToFormValues = (session: TrainingSession): CreateTrainingSessionPayload => {
    const { id: _id, status, participants: _participants, group, groupId, ...rest } = session;
    const safeStartTime = rest.startTime?.trim() || formatSessionTimePayload(parseSessionTimeValue(rest.startTime) ?? DEFAULT_SESSION_DATE);
    const safeDuration =
        typeof rest.durationMinutes === "number" && rest.durationMinutes > 0
            ? rest.durationMinutes
            : DEFAULT_DURATION_MINUTES;
    return {
        ...rest,
        startTime: safeStartTime,
        durationMinutes: safeDuration,
        status,
        groupId: groupId ?? group?.id ?? null,
    };
};

type DistanceUnit = (typeof DISTANCE_UNIT_OPTIONS)[number];

type SegmentNumberField = Extract<
    {
        [K in keyof TrainingSeriesSegment]: TrainingSeriesSegment[K] extends number | undefined ? K : never;
    }[keyof TrainingSeriesSegment],
    string
>;

type TimePickerTarget =
    | { scope: "series"; field: "seriesRestInterval" }
    | { scope: "segment"; field: SegmentNumberField; serieId: string; segmentId: string };

type TimePickerState = {
    visible: boolean;
    label: string;
    target?: TimePickerTarget;
    minutes: number;
    seconds: number;
};

type DistancePickerTarget = {
    serieId: string;
    segmentId: string;
    field: SegmentNumberField;
    mirrorToDistance?: boolean;
};

type DistancePickerState = {
    visible: boolean;
    hundreds: number;
    remainder: number;
    unit: DistanceUnit;
    target?: DistancePickerTarget;
};

type BlockPickerState = {
    visible: boolean;
    serieId?: string;
    segmentId?: string;
    selectedType: TrainingBlockType;
    label: string;
};

type RepetitionPickerState = {
    visible: boolean;
    serieId?: string;
    segmentId?: string;
    value: number;
    field: SegmentNumberField;
};

type SeriesRepeatPickerState = {
    visible: boolean;
    serieId?: string;
    value: number;
};

type PacePickerState = {
    visible: boolean;
    serieId?: string;
    value: number;
};

type PaceReferencePickerState = {
    visible: boolean;
    serieId?: string;
    value: PaceReferenceDistanceValue;
};

const clampRestMinutes = (value: number) => Math.max(0, Math.min(MAX_REST_MINUTES, value));
const clampRestSeconds = (value: number) => Math.max(0, Math.min(59, value));
const clampDistanceHundreds = (value: number) => Math.max(0, Math.min(DISTANCE_HUNDRED_OPTIONS.length - 1, value));
const clampDistanceRemainder = (value: number) => Math.max(0, Math.min(99, value));
const clampRepetitionValue = (value: number) => Math.max(1, Math.min(REPETITION_MAX, value));
const clampSeriesRepeatValue = (value: number) => Math.max(1, Math.min(SERIES_REPEAT_MAX, value));
const clampPacePercentValue = (value: number) => {
    if (!PACE_PERCENT_OPTIONS.length) return value;
    const min = PACE_PERCENT_OPTIONS[0];
    const max = PACE_PERCENT_OPTIONS[PACE_PERCENT_OPTIONS.length - 1];
    return Math.max(min, Math.min(max, value));
};

const splitRestInterval = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
        return { minutes: 0, seconds: 0 };
    }
    const totalSeconds = Math.min(value, MAX_REST_MINUTES * 60 + 59);
    const minutes = clampRestMinutes(Math.floor(totalSeconds / 60));
    const seconds = clampRestSeconds(totalSeconds % 60);
    return { minutes, seconds };
};

const formatRestIntervalLabel = (value?: number) => {
    const { minutes, seconds } = splitRestInterval(value);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const computePickerValues = (value: number, unit: DistanceUnit) => {
    if (unit === "km") {
        const kmValue = Math.min(value / 1000, MAX_DISTANCE_KILOMETERS);
        let hundreds = clampDistanceHundreds(Math.floor(kmValue));
        let remainder = clampDistanceRemainder(Math.round((kmValue - hundreds) * 100));
        if (remainder === 100) {
            remainder = 0;
            hundreds = clampDistanceHundreds(hundreds + 1);
        }
        return { hundreds, remainder };
    }
    const meters = Math.min(value, MAX_DISTANCE_METERS);
    let hundreds = clampDistanceHundreds(Math.floor(meters / 100));
    let remainder = clampDistanceRemainder(Math.round(meters % 100));
    if (remainder === 100) {
        remainder = 0;
        hundreds = clampDistanceHundreds(hundreds + 1);
    }
    return { hundreds, remainder };
};

const splitDistanceValue = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
        return { hundreds: 0, remainder: 0, unit: "m" as DistanceUnit };
    }
    if (value > MAX_DISTANCE_METERS) {
        const picker = computePickerValues(value, "km");
        return { ...picker, unit: "km" as DistanceUnit };
    }
    const picker = computePickerValues(value, "m");
    return { ...picker, unit: "m" as DistanceUnit };
};

const formatDistanceLabel = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
        return "Choisir";
    }
    const { hundreds, remainder, unit } = splitDistanceValue(value);
    if (unit === "km") {
        const remainderLabel = remainder.toString().padStart(2, "0");
        return `${hundreds}.${remainderLabel} km`;
    }
    const meters = hundreds * 100 + remainder;
    return `${meters} m`;
};

const combineDistanceValue = (hundreds: number, remainder: number, unit: DistanceUnit) => {
    if (unit === "km") {
        const kmValue = clampDistanceHundreds(hundreds) + clampDistanceRemainder(remainder) / 100;
        return Math.round(kmValue * 1000);
    }
    return clampDistanceHundreds(hundreds) * 100 + clampDistanceRemainder(remainder);
};

const formatRepetitionLabel = (value?: number) => {
    if (!value || Number.isNaN(value)) {
        return "Choisir";
    }
    return `${value}`;
};

const formatSeriesRepeatLabel = (value?: number) => {
    if (!value || Number.isNaN(value)) {
        return "Choisir";
    }
    return `${value}`;
};

const formatPacePercentLabel = (value?: number) => {
    if (!value || Number.isNaN(value)) {
        return "Choisir";
    }
    return `${value} %`;
};

const formatPaceReferenceDistanceLabel = (value?: TrainingSeries["paceReferenceDistance"]) => {
    if (!value) {
        return "Choisir";
    }
    return PACE_REFERENCE_LABELS[value] ?? value;
};

export default function CreateTrainingSessionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string | string[]; groupId?: string | string[] }>();
    const sessionIdParam = params?.id;
    const groupParam = params?.groupId;
    const editingSessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam;
    const groupContextId = Array.isArray(groupParam) ? groupParam[0] : groupParam;
    const isEditing = Boolean(editingSessionId);
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const athleteId = useMemo(() => user?._id || user?.id || "", [user]);
    const paceProfile = useMemo<PaceComputationProfile>(
        () => ({
            records: user?.records ?? undefined,
            performances: user?.performances ?? undefined,
            bodyWeightKg: user?.bodyWeightKg ?? undefined,
            maxMuscuKg: user?.maxMuscuKg ?? undefined,
            maxChariotKg: user?.maxChariotKg ?? undefined,
        }),
        [user],
    );
    const formDefaults = useMemo(() => (groupContextId ? { groupId: groupContextId } : undefined), [groupContextId]);
    const inputTheme = useMemo(
        () => ({
            colors: {
                primary: "#22d3ee",
                onSurface: "#f8fafc",
                onSurfaceVariant: "#94a3b8",
                surface: "rgba(15,23,42,0.75)",
                background: "rgba(15,23,42,0.75)",
                outline: "rgba(148,163,184,0.35)",
            },
        }),
        []
    );
    const { createSession, updateSession, fetchSession } = useTraining();
    const { values, setField, reset, hydrate, canSubmit } = useTrainingForm(athleteId, formDefaults);
    const [loading, setLoading] = useState(false);
    const [prefillLoading, setPrefillLoading] = useState(isEditing);
    const [prefillError, setPrefillError] = useState<string | null>(null);
    const initialEditValuesRef = useRef<CreateTrainingSessionPayload | null>(null);
    const [datePickerVisible, setDatePickerVisible] = useState(false);
    const [tempSessionDate, setTempSessionDate] = useState<Date>(parseSessionDate(values.date) ?? DEFAULT_SESSION_DATE);
    const [sessionTimePickerVisible, setSessionTimePickerVisible] = useState(false);
    const [tempSessionTime, setTempSessionTime] = useState<Date>(parseSessionTimeValue(values.startTime) ?? DEFAULT_SESSION_DATE);
    const [sessionDurationPickerVisible, setSessionDurationPickerVisible] = useState(false);
    const [tempSessionDuration, setTempSessionDuration] = useState<Date>(buildDurationDate(values.durationMinutes));
    const [timePickerState, setTimePickerState] = useState<TimePickerState>({
        visible: false,
        label: "",
        minutes: 0,
        seconds: 30,
    });
    const [distancePickerState, setDistancePickerState] = useState<DistancePickerState>({
        visible: false,
        hundreds: 0,
        remainder: 0,
        unit: "m",
    });
    const [repetitionPickerState, setRepetitionPickerState] = useState<RepetitionPickerState>({
        visible: false,
        value: 1,
        field: "repetitions",
    });
    const [seriesRepeatPickerState, setSeriesRepeatPickerState] = useState<SeriesRepeatPickerState>({
        visible: false,
        value: 1,
    });
    const [pacePickerState, setPacePickerState] = useState<PacePickerState>({
        visible: false,
        value: DEFAULT_SERIES_PACE_PERCENT,
    });
    const [paceReferencePickerState, setPaceReferencePickerState] = useState<PaceReferencePickerState>({
        visible: false,
        value: DEFAULT_PACE_REFERENCE_DISTANCE,
    });
    const [blockPickerState, setBlockPickerState] = useState<BlockPickerState>({
        visible: false,
        selectedType: trainingBlockCatalog[0]?.type ?? "vitesse",
        label: trainingBlockCatalog[0]?.label ?? "Bloc",
    });
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [ppgExerciseDrafts, setPpgExerciseDrafts] = useState<Record<string, string>>({});
    const [muscuExerciseDrafts, setMuscuExerciseDrafts] = useState<Record<string, string>>({});
    const [customExerciseDrafts, setCustomExerciseDrafts] = useState<Record<string, string>>({});
    const sessionDateDisplay = useMemo(() => formatSessionDateDisplay(values.date), [values.date]);
    const sessionTimeDisplay = useMemo(() => formatSessionTimeDisplay(values.startTime), [values.startTime]);
    const sessionDurationDisplay = useMemo(
        () => formatSessionDurationDisplay(values.durationMinutes),
        [values.durationMinutes],
    );
    const screenTitle = isEditing ? "Modifier la séance" : "Nouvelle séance";
    const submitButtonLabel = isEditing ? "Mettre à jour" : "Enregistrer";
    const bottomSpacing = Math.max(insets.bottom, 0);
    const keyboardVerticalOffset = Math.max(insets.top, 16) + 48;
    const scrollBottomPadding = bottomSpacing + (keyboardHeight > 0 ? keyboardHeight + 32 : 0);
    const modalActionPadding = bottomSpacing + 12;

    useEffect(() => {
        const syncedDate = parseSessionDate(values.date);
        if (syncedDate) {
            setTempSessionDate(syncedDate);
        }
    }, [values.date]);

    useEffect(() => {
        const syncedTime = parseSessionTimeValue(values.startTime);
        if (syncedTime) {
            setTempSessionTime(syncedTime);
        }
    }, [values.startTime]);

    useEffect(() => {
        setTempSessionDuration(buildDurationDate(values.durationMinutes));
    }, [values.durationMinutes]);

    useEffect(() => {
        const showEvent = Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
        const hideEvent = Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

        const handleShow = (event: KeyboardEvent) => {
            const height = event.endCoordinates?.height ?? 0;
            setKeyboardHeight(height);
        };

        const handleHide = () => setKeyboardHeight(0);

        const showSub = Keyboard.addListener(showEvent, handleShow);
        const hideSub = Keyboard.addListener(hideEvent, handleHide);

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const loadSessionForEdit = useCallback(async () => {
        if (!isEditing || !editingSessionId) {
            return;
        }
        setPrefillError(null);
        setPrefillLoading(true);
        try {
            const fetched = await fetchSession(editingSessionId);
            const normalized = sessionToFormValues(fetched);
            initialEditValuesRef.current = normalized;
            hydrate(normalized);
        } catch (error: any) {
            setPrefillError(error?.message || "Impossible de charger la séance");
        } finally {
            setPrefillLoading(false);
        }
    }, [editingSessionId, fetchSession, hydrate, isEditing]);

    useEffect(() => {
        if (!isEditing) {
            return;
        }
        loadSessionForEdit();
    }, [isEditing, loadSessionForEdit]);

    const handleResetForm = () => {
        if (isEditing) {
            if (initialEditValuesRef.current) {
                hydrate(initialEditValuesRef.current);
            }
            return;
        }
        reset();
    };

    const handleSubmit = async () => {
        if (!canSubmit || loading) return;
        setLoading(true);
        const payload: CreateTrainingSessionPayload = isEditing
            ? {
                ...values,
                status: values.status || initialEditValuesRef.current?.status || "planned",
                seriesRestInterval: values.seriesRestInterval ?? 0,
                seriesRestUnit: values.seriesRestUnit || "s",
            }
            : {
                ...values,
                status: "planned",
                seriesRestInterval: values.seriesRestInterval ?? 0,
                seriesRestUnit: values.seriesRestUnit || "s",
            };
        try {
            if (isEditing && editingSessionId) {
                await updateSession(editingSessionId, payload);
                Alert.alert("Séance mise à jour", "Les modifications ont été enregistrées.");
                router.replace(`/(main)/training/${editingSessionId}`);
            } else {
                const session = await createSession(payload);
                Alert.alert("Séance créée", "La séance a été enregistrée.");
                reset();
                router.push(`/(main)/training/${session.id}`);
            }
        } catch (error: any) {
            const fallbackMessage = isEditing
                ? "Impossible de mettre à jour la séance"
                : "Impossible de créer la séance";
            Alert.alert("Erreur", error?.message || fallbackMessage);
        } finally {
            setLoading(false);
        }
    };

    const updateSeries = (serieId: string, updater: (serie: TrainingSeries) => TrainingSeries) => {
        setField("series", (prevSeries) =>
            (prevSeries || []).map((serie) => (serie.id === serieId ? updater(serie) : serie))
        );
    };

    const openSeriesRepeatPicker = (serie: TrainingSeries) => {
        setSeriesRepeatPickerState({
            visible: true,
            serieId: serie.id,
            value: clampSeriesRepeatValue(serie.repeatCount),
        });
    };

    const closeSeriesRepeatPicker = () => {
        setSeriesRepeatPickerState((prev) => ({
            ...prev,
            visible: false,
            serieId: undefined,
        }));
    };

    const handleSeriesRepeatValueChange = (value: number) => {
        setSeriesRepeatPickerState((prev) => ({ ...prev, value: clampSeriesRepeatValue(value) }));
    };

    const handleSeriesRepeatPickerConfirm = () => {
        if (!seriesRepeatPickerState.serieId) {
            closeSeriesRepeatPicker();
            return;
        }
        updateSeries(seriesRepeatPickerState.serieId, (serie) => ({
            ...serie,
            repeatCount: clampSeriesRepeatValue(seriesRepeatPickerState.value),
        }));
        closeSeriesRepeatPicker();
    };

    const handleSeriesPaceToggle = (serie: TrainingSeries) => {
        updateSeries(serie.id, (current) => {
            const nextEnabled = !current.enablePace;
            return {
                ...current,
                enablePace: nextEnabled,
                pacePercent: nextEnabled ? current.pacePercent ?? DEFAULT_SERIES_PACE_PERCENT : undefined,
                paceReferenceDistance: nextEnabled
                    ? current.paceReferenceDistance ?? DEFAULT_PACE_REFERENCE_DISTANCE
                    : undefined,
            };
        });
    };

    const openPacePicker = (serie: TrainingSeries) => {
        const baseValue = clampPacePercentValue(serie.pacePercent ?? DEFAULT_SERIES_PACE_PERCENT);
        setPacePickerState({
            visible: true,
            serieId: serie.id,
            value: baseValue,
        });
    };

    const closePacePicker = () => {
        setPacePickerState((prev) => ({ ...prev, visible: false, serieId: undefined }));
    };

    const handlePacePickerValueChange = (value: number) => {
        setPacePickerState((prev) => ({ ...prev, value: clampPacePercentValue(value) }));
    };

    const handlePacePickerConfirm = () => {
        if (!pacePickerState.serieId) {
            closePacePicker();
            return;
        }
        updateSeries(pacePickerState.serieId, (serie) => ({
            ...serie,
            pacePercent: clampPacePercentValue(pacePickerState.value),
        }));
        closePacePicker();
    };

    const getSeriesLoadBaseValue = (serie: TrainingSeries, reference: LoadPaceReferenceValue) => {
        const profileValue = (() => {
            switch (reference) {
                case "bodyweight":
                    return user?.bodyWeightKg;
                case "max-muscu":
                    return user?.maxMuscuKg;
                case "max-chariot":
                    return user?.maxChariotKg;
                default:
                    return undefined;
            }
        })();
        const field = LOAD_REFERENCE_SERIES_FIELD_MAP[reference];
        const customValue = serie[field] as number | undefined;
        return {
            value: profileValue ?? customValue,
            profileValue,
            customValue,
        };
    };

    const getSegmentPacePreview = useCallback(
        (serie: TrainingSeries, segment: TrainingSeriesSegment) =>
            computeSegmentPacePreview(serie, segment, paceProfile, {
                allowSeriesFallback: true,
                distanceLabelFormatter: (currentSegment) =>
                    typeof currentSegment.distance === "number" && currentSegment.distance > 0
                        ? formatDistanceLabel(currentSegment.distance)
                        : undefined,
            }),
        [paceProfile],
    );

    const openPaceReferencePicker = (serie: TrainingSeries) => {
        setPaceReferencePickerState({
            visible: true,
            serieId: serie.id,
            value: serie.paceReferenceDistance ?? DEFAULT_PACE_REFERENCE_DISTANCE,
        });
    };

    const closePaceReferencePicker = () => {
        setPaceReferencePickerState((prev) => ({ ...prev, visible: false, serieId: undefined }));
    };

    const handlePaceReferencePickerValueChange = (value: PaceReferenceDistanceValue) => {
        setPaceReferencePickerState((prev) => ({ ...prev, value }));
    };

    const handlePaceReferencePickerConfirm = () => {
        if (!paceReferencePickerState.serieId) {
            closePaceReferencePicker();
            return;
        }
        updateSeries(paceReferencePickerState.serieId, (serie) => ({
            ...serie,
            paceReferenceDistance: paceReferencePickerState.value,
        }));
        closePaceReferencePicker();
    };

    const handleLoadReferenceValueChange = (
        serieId: string,
        reference: LoadPaceReferenceValue,
        text: string
    ) => {
        const normalized = text.replace(/,/g, ".").replace(/[^0-9.]/g, "");
        const numeric = normalized ? Number.parseFloat(normalized) : undefined;
        const nextValue = numeric != null && Number.isFinite(numeric) ? Math.max(0, numeric) : undefined;
        const field = LOAD_REFERENCE_SERIES_FIELD_MAP[reference];
        updateSeries(serieId, (serie) => ({
            ...serie,
            [field]: nextValue,
        }));
    };

    const handleSegmentFieldChange = <K extends keyof TrainingSeriesSegment>(
        serieId: string,
        segmentId: string,
        key: K,
        value: TrainingSeriesSegment[K]
    ) => {
        updateSeries(serieId, (serie) => ({
            ...serie,
            segments: serie.segments.map((segment) =>
                segment.id === segmentId ? { ...segment, [key]: value } : segment
            ),
        }));
    };

    const getBlockLabelFromCatalog = (type: TrainingBlockType) => {
        const entry = trainingBlockCatalog.find((item) => item.type === type);
        return entry?.label || type;
    };

    const normalizeSegmentForBlockType = (
        segment: TrainingSeriesSegment,
        blockType: TrainingBlockType,
        label: string
    ): TrainingSeriesSegment => {
        const cleared: TrainingSeriesSegment = {
            ...segment,
            blockType,
            blockName: label,
            cotesMode: undefined,
            durationSeconds: undefined,
            ppgExercises: [],
            ppgDurationSeconds: undefined,
            ppgRestSeconds: undefined,
            muscuExercises: [],
            muscuRepetitions: undefined,
            recoveryMode: undefined,
            recoveryDurationSeconds: undefined,
            startCount: undefined,
            startExitDistance: undefined,
            customGoal: undefined,
            customMetricEnabled: undefined,
            customMetricKind: undefined,
            customMetricDistance: undefined,
            customMetricDurationSeconds: undefined,
            customMetricRepetitions: undefined,
            customNotes: undefined,
            customExercises: [],
        };

        switch (blockType) {
            case "cotes":
                cleared.cotesMode = "distance";
                break;
            case "ppg":
                cleared.distance = 0;
                cleared.repetitions = 1;
                cleared.ppgExercises = [];
                break;
            case "muscu":
                cleared.distance = 0;
                cleared.repetitions = 1;
                cleared.muscuExercises = [];
                cleared.muscuRepetitions = segment.muscuRepetitions ?? 10;
                break;
            case "recup":
                cleared.distance = 0;
                cleared.repetitions = 1;
                cleared.recoveryMode = "marche";
                cleared.recoveryDurationSeconds = cleared.recoveryDurationSeconds ?? 60;
                break;
            case "start":
                cleared.distance = 0;
                cleared.repetitions = 1;
                cleared.startCount = cleared.startCount ?? 3;
                cleared.startExitDistance = cleared.startExitDistance ?? 10;
                break;
            case "custom":
                cleared.distance = 0;
                cleared.repetitions = 1;
                cleared.customGoal = segment.customGoal ?? "";
                cleared.customMetricEnabled = Boolean(segment.customMetricEnabled);
                if (cleared.customMetricEnabled) {
                    const selectableKind: CustomMetricSelectableKind =
                        segment.customMetricKind === "duration"
                            ? "duration"
                            : segment.customMetricKind === "exo"
                                ? "exo"
                                : "distance";
                    cleared.customMetricKind = selectableKind;
                    cleared.customMetricDistance = segment.customMetricDistance;
                    cleared.customMetricDurationSeconds = segment.customMetricDurationSeconds;
                    if (selectableKind === "distance") {
                        cleared.distance = segment.customMetricDistance ?? 0;
                    }
                    if (selectableKind === "exo") {
                        cleared.customExercises = segment.customExercises ?? [];
                    }
                } else {
                    cleared.customMetricKind = undefined;
                    cleared.customMetricDistance = undefined;
                    cleared.customMetricDurationSeconds = undefined;
                    cleared.customExercises = [];
                }
                cleared.customMetricRepetitions = segment.customMetricRepetitions;
                cleared.customNotes = segment.customNotes ?? "";
                if (!cleared.customExercises) {
                    cleared.customExercises = [];
                }
                break;
            default:
                break;
        }
        return cleared;
    };

    const openBlockPicker = (serieId: string, segment: TrainingSeriesSegment) => {
        const selectedType = segment.blockType || "vitesse";
        const currentLabel = segment.blockName || getBlockLabelFromCatalog(selectedType);
        setBlockPickerState({
            visible: true,
            serieId,
            segmentId: segment.id,
            selectedType,
            label: currentLabel,
        });
    };

    const closeBlockPicker = () => {
        setBlockPickerState((prev) => ({
            ...prev,
            visible: false,
            serieId: undefined,
            segmentId: undefined,
        }));
    };

    const handleBlockTypeSelect = (type: TrainingBlockType) => {
        setBlockPickerState((prev) => {
            const previousDefault = getBlockLabelFromCatalog(prev.selectedType || "vitesse");
            const nextDefault = getBlockLabelFromCatalog(type);
            const trimmedLabel = prev.label.trim();
            const shouldReplaceLabel = !trimmedLabel || trimmedLabel === previousDefault;
            return {
                ...prev,
                selectedType: type,
                label: shouldReplaceLabel ? nextDefault : prev.label,
            };
        });
    };

    const handleBlockLabelChange = (value: string) => {
        setBlockPickerState((prev) => ({ ...prev, label: value }));
    };

    const handleBlockPickerConfirm = () => {
        if (!blockPickerState.serieId || !blockPickerState.segmentId) {
            closeBlockPicker();
            return;
        }
        const resolvedLabel =
            blockPickerState.label.trim() || getBlockLabelFromCatalog(blockPickerState.selectedType);
        updateSeries(blockPickerState.serieId, (serie) => ({
            ...serie,
            segments: serie.segments.map((segment) =>
                segment.id === blockPickerState.segmentId
                    ? normalizeSegmentForBlockType(segment, blockPickerState.selectedType, resolvedLabel)
                    : segment
            ),
        }));
        closeBlockPicker();
    };

    const handlePpgExerciseDraftChange = (segmentId: string, value: string) => {
        setPpgExerciseDrafts((prev) => ({ ...prev, [segmentId]: value }));
    };

    const resetPpgExerciseDraft = (segmentId: string) => {
        setPpgExerciseDrafts((prev) => {
            if (!(segmentId in prev)) return prev;
            const next = { ...prev };
            delete next[segmentId];
            return next;
        });
    };

    const handleAddPpgExercise = (serieId: string, segment: TrainingSeriesSegment) => {
        const draft = (ppgExerciseDrafts[segment.id] || "").trim();
        if (!draft) {
            return;
        }
        const currentExercises = segment.ppgExercises || [];
        handleSegmentFieldChange(serieId, segment.id, "ppgExercises", [...currentExercises, draft]);
        resetPpgExerciseDraft(segment.id);
    };

    const handleRemovePpgExercise = (serieId: string, segment: TrainingSeriesSegment, index: number) => {
        const currentExercises = segment.ppgExercises || [];
        if (index < 0 || index >= currentExercises.length) {
            return;
        }
        const nextExercises = currentExercises.filter((_, idx) => idx !== index);
        handleSegmentFieldChange(serieId, segment.id, "ppgExercises", nextExercises);
    };

    const handleMuscuExerciseDraftChange = (segmentId: string, value: string) => {
        setMuscuExerciseDrafts((prev) => ({ ...prev, [segmentId]: value }));
    };

    const resetMuscuExerciseDraft = (segmentId: string) => {
        setMuscuExerciseDrafts((prev) => {
            if (!(segmentId in prev)) return prev;
            const next = { ...prev };
            delete next[segmentId];
            return next;
        });
    };

    const handleAddMuscuExercise = (serieId: string, segment: TrainingSeriesSegment) => {
        const draft = (muscuExerciseDrafts[segment.id] || "").trim();
        if (!draft) {
            return;
        }
        const currentExercises = (segment as any).muscuExercises || [];
        handleSegmentFieldChange(serieId, segment.id, "muscuExercises" as any, [...currentExercises, draft] as any);
        resetMuscuExerciseDraft(segment.id);
    };

    const handleRemoveMuscuExercise = (serieId: string, segment: TrainingSeriesSegment, index: number) => {
        const currentExercises = (segment as any).muscuExercises || [];
        if (index < 0 || index >= currentExercises.length) {
            return;
        }
        const nextExercises = currentExercises.filter((_: any, idx: number) => idx !== index);
        handleSegmentFieldChange(serieId, segment.id, "muscuExercises" as any, nextExercises as any);
    };

    const handleCustomExerciseDraftChange = (segmentId: string, value: string) => {
        setCustomExerciseDrafts((prev) => ({ ...prev, [segmentId]: value }));
    };

    const resetCustomExerciseDraft = (segmentId: string) => {
        setCustomExerciseDrafts((prev) => {
            if (!(segmentId in prev)) return prev;
            const next = { ...prev };
            delete next[segmentId];
            return next;
        });
    };

    const handleAddCustomExercise = (serieId: string, segment: TrainingSeriesSegment) => {
        const draft = (customExerciseDrafts[segment.id] || "").trim();
        if (!draft) {
            return;
        }
        const currentExercises = segment.customExercises || [];
        handleSegmentFieldChange(serieId, segment.id, "customExercises", [...currentExercises, draft]);
        resetCustomExerciseDraft(segment.id);
    };

    const handleRemoveCustomExercise = (serieId: string, segment: TrainingSeriesSegment, index: number) => {
        const currentExercises = segment.customExercises || [];
        if (index < 0 || index >= currentExercises.length) {
            return;
        }
        const nextExercises = currentExercises.filter((_, idx) => idx !== index);
        handleSegmentFieldChange(serieId, segment.id, "customExercises", nextExercises);
    };

    const openSegmentTimePicker = (
        serieId: string,
        segment: TrainingSeriesSegment,
        field: SegmentNumberField,
        label: string,
        value?: number
    ) => {
        const { minutes, seconds } = splitRestInterval(value ?? 0);
        setTimePickerState({
            visible: true,
            label,
            target: { scope: "segment", field, serieId, segmentId: segment.id },
            minutes,
            seconds,
        });
    };

    const openSeriesRestPicker = () => {
        const { minutes, seconds } = splitRestInterval(values.seriesRestInterval);
        setTimePickerState({
            visible: true,
            label: "Repos entre les séries (mm:ss)",
            target: { scope: "series", field: "seriesRestInterval" },
            minutes,
            seconds,
        });
    };

    const closeTimePicker = () => {
        setTimePickerState((prev) => ({ ...prev, visible: false, target: undefined }));
    };

    const handleTimePickerValueChange = (type: "minutes" | "seconds", value: number) => {
        setTimePickerState((prev) => ({
            ...prev,
            [type]: type === "minutes" ? clampRestMinutes(value) : clampRestSeconds(value),
        }));
    };

    const handleTimePickerConfirm = () => {
        if (!timePickerState.target) {
            closeTimePicker();
            return;
        }
        const totalSeconds = timePickerState.minutes * 60 + timePickerState.seconds;
        if (timePickerState.target.scope === "series") {
            setField("seriesRestInterval", totalSeconds);
            setField("seriesRestUnit", "s");
        } else {
            handleSegmentFieldChange(
                timePickerState.target.serieId,
                timePickerState.target.segmentId,
                timePickerState.target.field,
                totalSeconds
            );
        }
        closeTimePicker();
    };

    const openDistancePicker = (
        serieId: string,
        segment: TrainingSeriesSegment,
        options?: { baseValue?: number; field?: SegmentNumberField; mirrorToDistance?: boolean }
    ) => {
        const field = options?.field ?? "distance";
        const rawValue =
            typeof options?.baseValue === "number"
                ? options.baseValue
                : (segment[field] as number | undefined) ?? segment.distance;
        const selection = splitDistanceValue(rawValue);
        setDistancePickerState({
            visible: true,
            hundreds: selection.hundreds,
            remainder: selection.remainder,
            unit: selection.unit,
            target: {
                serieId,
                segmentId: segment.id,
                field,
                mirrorToDistance: options?.mirrorToDistance,
            },
        });
    };

    const closeDistancePicker = () => {
        setDistancePickerState((prev) => ({
            ...prev,
            visible: false,
            target: undefined,
        }));
    };

    const handleDistancePickerValueChange = (type: "hundreds" | "remainder", value: number) => {
        setDistancePickerState((prev) => ({
            ...prev,
            [type]: type === "hundreds" ? clampDistanceHundreds(value) : clampDistanceRemainder(value),
        }));
    };

    const handleDistanceUnitChange = (unit: DistanceUnit) => {
        setDistancePickerState((prev) => {
            const currentMeters = combineDistanceValue(prev.hundreds, prev.remainder, prev.unit);
            const nextPicker = computePickerValues(currentMeters, unit);
            return {
                ...prev,
                unit,
                ...nextPicker,
            };
        });
    };

    const handleDistancePickerConfirm = () => {
        if (!distancePickerState.target) {
            closeDistancePicker();
            return;
        }
        const { serieId, segmentId, field, mirrorToDistance } = distancePickerState.target;
        const numericDistance = combineDistanceValue(
            distancePickerState.hundreds,
            distancePickerState.remainder,
            distancePickerState.unit
        );
        handleSegmentFieldChange(serieId, segmentId, field, numericDistance as TrainingSeriesSegment[SegmentNumberField]);
        if (field !== "distance" && mirrorToDistance) {
            handleSegmentFieldChange(serieId, segmentId, "distance", numericDistance);
        }
        closeDistancePicker();
    };

    const openRepetitionPicker = (
        serieId: string,
        segment: TrainingSeriesSegment,
        field: SegmentNumberField = "repetitions"
    ) => {
        const rawValue = segment[field];
        const baseValue = clampRepetitionValue(typeof rawValue === "number" ? rawValue : 1);
        setRepetitionPickerState({
            visible: true,
            serieId,
            segmentId: segment.id,
            value: baseValue,
            field,
        });
    };

    const closeRepetitionPicker = () => {
        setRepetitionPickerState((prev) => ({
            ...prev,
            visible: false,
            serieId: undefined,
            segmentId: undefined,
        }));
    };

    const handleRepetitionValueChange = (value: number) => {
        setRepetitionPickerState((prev) => ({ ...prev, value: clampRepetitionValue(value) }));
    };

    const handleRepetitionPickerConfirm = () => {
        if (!repetitionPickerState.serieId || !repetitionPickerState.segmentId) {
            closeRepetitionPicker();
            return;
        }
        const numericValue = clampRepetitionValue(repetitionPickerState.value);
        const field = repetitionPickerState.field || "repetitions";
        handleSegmentFieldChange(
            repetitionPickerState.serieId,
            repetitionPickerState.segmentId,
            field,
            numericValue
        );
        closeRepetitionPicker();
    };

    const handleAddSegment = (serieId: string) => {
        updateSeries(serieId, (serie) => {
            const nextIndex = serie.segments.length;
            const catalogEntry = trainingBlockCatalog[nextIndex % trainingBlockCatalog.length] || trainingBlockCatalog[0];
            const newSegment = buildTrainingSeriesSegment(catalogEntry.type, { blockName: catalogEntry.label });
            return {
                ...serie,
                segments: [...serie.segments, newSegment],
            };
        });
    };

    const handleRemoveSegment = (serieId: string, segmentId: string) => {
        updateSeries(serieId, (serie) => {
            if (serie.segments.length <= 1) {
                Alert.alert("Impossible", "Chaque série doit contenir au moins une distance.");
                return serie;
            }
            return {
                ...serie,
                segments: serie.segments.filter((segment) => segment.id !== segmentId),
            };
        });
    };

    const handleAddSeries = () => {
        if (values.series.length >= MAX_SERIES) {
            Alert.alert("Limite atteinte", `Tu peux ajouter jusqu'à ${MAX_SERIES} séries.`);
            return;
        }
        setField("series", (prevSeries) => {
            const nextSeries = prevSeries || [];
            return [...nextSeries, buildTrainingSeriesBlock(nextSeries.length)];
        });
    };

    const handleRemoveSeries = (serieId: string) => {
        if (values.series.length <= 1) {
            Alert.alert("Impossible", "Il doit rester au moins une série.");
            return;
        }
        setField("series", (prevSeries) => (prevSeries || []).filter((serie) => serie.id !== serieId));
    };

    const renderLoadReferencePanel = (serie: TrainingSeries) => {
        if (!serie.enablePace) {
            return null;
        }
        const reference = serie.paceReferenceDistance as PaceReferenceDistanceValue | undefined;
        if (!reference || !isLoadReference(reference)) {
            return null;
        }
        const loadMeta = getSeriesLoadBaseValue(serie, reference);
        const needsInput = loadMeta.profileValue == null;
        const customField = LOAD_REFERENCE_SERIES_FIELD_MAP[reference];
        const customValue = serie[customField] as number | undefined;
        const label = PACE_REFERENCE_LABELS[reference];
        const unit = LOAD_REFERENCE_UNITS[reference];
        const helperValue = loadMeta.value;
        return (
            <View style={styles.loadReferenceCard}>
                <View style={styles.loadReferenceCardHeader}>
                    <Text style={styles.loadReferenceTitle}>{label}</Text>
                    {needsInput ? (
                        <Text style={styles.loadReferenceBadgeMuted}>Profil non défini</Text>
                    ) : (
                        <Text style={styles.loadReferenceBadge}>{`Profil · ${formatLoadValue(loadMeta.profileValue!)} ${unit}`}</Text>
                    )}
                </View>
                {needsInput ? (
                    <TextInput
                        mode="outlined"
                        value={customValue != null ? `${customValue}` : ""}
                        onChangeText={(text) => handleLoadReferenceValueChange(serie.id, reference, text)}
                        keyboardType="decimal-pad"
                        placeholder={LOAD_REFERENCE_PLACEHOLDER[reference]}
                        placeholderTextColor="#94a3b8"
                        style={styles.loadReferenceInput}
                        theme={inputTheme}
                        textColor="#f8fafc"
                    />
                ) : null}
                <Text style={styles.loadReferenceHint}>
                    {helperValue != null
                        ? `La charge cible sera calculée avec ${formatLoadValue(helperValue)} ${unit}.`
                        : `Renseigne une valeur pour utiliser ${label.toLowerCase()} comme référence.`}
                </Text>
            </View>
        );
    };

    const renderSegmentBlock = (serie: TrainingSeries, segment: TrainingSeriesSegment, segmentIndex: number) => {
        const pacePreview = getSegmentPacePreview(serie, segment);
        const blockType = segment.blockType || "vitesse";
        const blockLabel = segment.blockName || getBlockLabelFromCatalog(blockType);

        const blockHint = (() => {
            switch (blockType) {
                case "cotes":
                    return "Alterner distance ou durée selon la séance.";
                case "ppg":
                    return "Liste les exercices de préparation physique.";
                case "muscu":
                    return "Ajoute tes exercices et tes répétitions par exo.";
                case "recup":
                    return "Configure le type et la durée de récupération.";
                case "start":
                    return "Paramètre tes départs et la distance de sortie.";
                case "custom":
                    return "Crée un atelier sur mesure avec tes propres repères.";
                default:
                    return "Associe un exercice ou un atelier à ce bloc.";
            }
        })();

        const renderDistanceInput = (
            label = "Distance",
            config?: { value?: number; field?: SegmentNumberField; mirrorToDistance?: boolean }
        ) => {
            const resolvedField = config?.field ?? "distance";
            const displayValue =
                typeof config?.value === "number"
                    ? config.value
                    : (segment[resolvedField] as number | undefined) ?? segment.distance;
            return (
                <View style={styles.segmentField}>
                    <Text style={styles.segmentFieldLabel}>{label}</Text>
                    <Pressable
                        style={styles.distancePickerTrigger}
                        onPress={() =>
                            openDistancePicker(serie.id, segment, {
                                baseValue: displayValue,
                                field: resolvedField,
                                mirrorToDistance: config?.mirrorToDistance,
                            })
                        }
                        accessibilityLabel={`Sélectionner ${label.toLowerCase()}`}
                    >
                        <Text style={styles.distancePickerValue}>{formatDistanceLabel(displayValue)}</Text>
                    </Pressable>
                </View>
            );
        };

        const renderRepetitionInput = (
            label = "Répétitions",
            field: SegmentNumberField = "repetitions",
            value?: number
        ) => {
            const resolvedValue =
                typeof value === "number"
                    ? value
                    : (segment[field] as number | undefined) ??
                    (field === "repetitions" ? segment.repetitions : undefined);
            return (
                <View style={styles.segmentField}>
                    <Text style={styles.segmentFieldLabel}>{label}</Text>
                    <Pressable
                        style={styles.repetitionPickerTrigger}
                        onPress={() => openRepetitionPicker(serie.id, segment, field)}
                    >
                        <View style={styles.repetitionPickerContent}>
                            <View style={styles.repetitionPickerTextBlock}>
                                <Text style={styles.repetitionPickerValue}>
                                    {formatRepetitionLabel(resolvedValue)}
                                </Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-down" size={20} color="#94a3b8" />
                        </View>
                    </Pressable>
                </View>
            );
        };

        const renderTimeInput = (
            label: string,
            field: SegmentNumberField,
            value?: number
        ) => (
            <View style={styles.segmentField}>
                <Text style={styles.segmentFieldLabel}>{label}</Text>
                <Pressable
                    style={styles.restPickerTrigger}
                    onPress={() => openSegmentTimePicker(serie.id, segment, field, label, value)}
                >
                    <Text style={styles.restPickerValue}>{formatRestIntervalLabel(value)}</Text>
                </Pressable>
            </View>
        );

        const renderChipOptions = <T extends string>(
            label: string,
            options: { label: string; value: T }[],
            current: T,
            onSelect: (value: T) => void
        ) => (
            <View style={styles.segmentField}>
                <Text style={styles.segmentFieldLabel}>{label}</Text>
                <View style={styles.chipRow}>
                    {options.map((option) => {
                        const active = option.value === current;
                        return (
                            <Pressable
                                key={option.value}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => onSelect(option.value)}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        );

        const renderVitesseContent = () => (
            <>
                <View style={styles.segmentFieldsRow}>
                    {renderDistanceInput()}
                    {renderRepetitionInput()}
                    {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                </View>
            </>
        );

        const renderCotesContent = () => (
            <>
                {renderChipOptions(
                    "Format",
                    [
                        { label: "Distance", value: "distance" },
                        { label: "Durée", value: "duration" },
                    ],
                    (segment.cotesMode as "distance" | "duration") || "distance",
                    (mode) => {
                        if (segment.cotesMode !== mode) {
                            handleSegmentFieldChange(serie.id, segment.id, "cotesMode", mode);
                            if (mode === "duration" && !segment.durationSeconds) {
                                handleSegmentFieldChange(serie.id, segment.id, "durationSeconds", 90);
                            }
                        }
                    }
                )}
                <View style={styles.segmentFieldsRow}>
                    {segment.cotesMode === "duration"
                        ? renderTimeInput("Temps cible (mm:ss)", "durationSeconds", segment.durationSeconds)
                        : renderDistanceInput()}
                    {renderRepetitionInput()}
                    {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                </View>
            </>
        );

        const renderPpgContent = () => {
            const exercises = segment.ppgExercises || [];
            const draftValue = ppgExerciseDrafts[segment.id] ?? "";
            const canAddExercise = Boolean(draftValue.trim());
            return (
                <View style={styles.segmentStack}>
                    <Text style={styles.segmentFieldLabel}>Exercices</Text>
                    <View style={styles.ppgInputRow}>
                        <TextInput
                            mode="outlined"
                            style={[styles.input, styles.ppgExerciseInput]}
                            textColor="#f8fafc"
                            value={draftValue}
                            onChangeText={(text) => handlePpgExerciseDraftChange(segment.id, text)}
                            placeholder="Ex: Squat jump"
                            placeholderTextColor="#64748b"
                            returnKeyType="done"
                            onSubmitEditing={() => handleAddPpgExercise(serie.id, segment)}
                        />
                        <Button
                            mode="contained"
                            icon="plus"
                            compact
                            onPress={() => handleAddPpgExercise(serie.id, segment)}
                            disabled={!canAddExercise}
                            style={styles.ppgAddButton}
                            contentStyle={styles.ppgAddButtonContent}
                            buttonColor="#22d3ee"
                            textColor="#02111f"
                            accessibilityLabel="Ajouter un exercice"
                        >
                            {null}
                        </Button>
                    </View>
                    <View style={styles.ppgExerciseList}>
                        {exercises.length ? (
                            exercises.map((exercise, idx) => (
                                <View key={`${segment.id}-exercise-${idx}`} style={styles.ppgExerciseChip}>
                                    <Text style={styles.ppgExerciseChipText}>{exercise}</Text>
                                    <Pressable
                                        style={styles.ppgExerciseChipRemove}
                                        onPress={() => handleRemovePpgExercise(serie.id, segment, idx)}
                                        accessibilityLabel={`Retirer ${exercise}`}
                                    >
                                        <MaterialCommunityIcons name="close" size={16} color="#f8fafc" />
                                    </Pressable>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.ppgExerciseEmptyText}>Ajoute ton premier exercice.</Text>
                        )}
                    </View>
                    <View style={styles.segmentFieldsRow}>
                        {renderTimeInput("Durée exo (mm:ss)", "ppgDurationSeconds", segment.ppgDurationSeconds)}
                        {renderTimeInput("Récup (mm:ss)", "ppgRestSeconds", segment.ppgRestSeconds)}
                        {renderRepetitionInput("Tours", "repetitions")}
                    </View>
                </View>
            );
        };

        const renderMuscuContent = () => {
            const exercises = Array.isArray((segment as any).muscuExercises) ? ((segment as any).muscuExercises as string[]) : [];
            const draftValue = muscuExerciseDrafts[segment.id] ?? "";
            const canAddExercise = Boolean(draftValue.trim());
            return (
                <View style={styles.segmentStack}>
                    <Text style={styles.segmentFieldLabel}>Exercices</Text>
                    <View style={styles.ppgInputRow}>
                        <TextInput
                            mode="outlined"
                            style={[styles.input, styles.ppgExerciseInput]}
                            textColor="#f8fafc"
                            value={draftValue}
                            onChangeText={(text) => handleMuscuExerciseDraftChange(segment.id, text)}
                            placeholder="Ex: Développé couché"
                            placeholderTextColor="#64748b"
                            returnKeyType="done"
                            onSubmitEditing={() => handleAddMuscuExercise(serie.id, segment)}
                        />
                        <Button
                            mode="contained"
                            icon="plus"
                            compact
                            onPress={() => handleAddMuscuExercise(serie.id, segment)}
                            disabled={!canAddExercise}
                            style={styles.ppgAddButton}
                            contentStyle={styles.ppgAddButtonContent}
                            buttonColor="#22d3ee"
                            textColor="#02111f"
                            accessibilityLabel="Ajouter un exercice muscu"
                        >
                            {null}
                        </Button>
                    </View>
                    <View style={styles.ppgExerciseList}>
                        {exercises.length ? (
                            exercises.map((exercise, idx) => (
                                <View key={`${segment.id}-muscu-exercise-${idx}`} style={styles.ppgExerciseChip}>
                                    <Text style={styles.ppgExerciseChipText}>{exercise}</Text>
                                    <Pressable
                                        style={styles.ppgExerciseChipRemove}
                                        onPress={() => handleRemoveMuscuExercise(serie.id, segment, idx)}
                                        accessibilityLabel={`Retirer ${exercise}`}
                                    >
                                        <MaterialCommunityIcons name="close" size={16} color="#f8fafc" />
                                    </Pressable>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.ppgExerciseEmptyText}>Ajoute ton premier exercice.</Text>
                        )}
                    </View>
                    <View style={styles.segmentFieldsRow}>
                        {renderRepetitionInput("Rép/exo", "muscuRepetitions", (segment as any).muscuRepetitions)}
                        {renderTimeInput("Repos (mm:ss)", "restInterval", segment.restInterval)}
                    </View>
                </View>
            );
        };

        const renderRecupContent = () => (
            <View style={styles.segmentStack}>
                {renderChipOptions(
                    "Type de récupération",
                    [
                        { label: "Marche", value: "marche" },
                        { label: "Footing", value: "footing" },
                        { label: "Passive", value: "passive" },
                        { label: "Active", value: "active" },
                    ],
                    (segment.recoveryMode as "marche" | "footing" | "passive" | "active") || "marche",
                    (mode) => handleSegmentFieldChange(serie.id, segment.id, "recoveryMode", mode)
                )}
                <View style={styles.segmentFieldsRow}>
                    {renderTimeInput("Durée (mm:ss)", "recoveryDurationSeconds", segment.recoveryDurationSeconds)}
                    {renderRepetitionInput()}
                    {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                </View>
            </View>
        );

        const renderStartContent = () => (
            <View style={styles.segmentStack}>
                <View style={styles.segmentFieldsRow}>
                    {renderRepetitionInput("Nombre", "startCount", segment.startCount)}
                    {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                </View>
                <View style={styles.segmentFieldsRow}>
                    {renderDistanceInput("Distance de sortie", {
                        field: "startExitDistance",
                        value: segment.startExitDistance ?? segment.distance,
                        mirrorToDistance: true,
                    })}
                </View>
            </View>
        );

        const renderCustomContent = () => {
            const metricEnabled = Boolean(segment.customMetricEnabled);
            const resolvedMetricKind: CustomMetricSelectableKind =
                segment.customMetricKind === "duration"
                    ? "duration"
                    : segment.customMetricKind === "exo"
                        ? "exo"
                        : "distance";

            const handleMetricToggle = () => {
                const nextValue = !metricEnabled;
                updateSeries(serie.id, (currentSerie) => ({
                    ...currentSerie,
                    segments: currentSerie.segments.map((currentSegment) => {
                        if (currentSegment.id !== segment.id) {
                            return currentSegment;
                        }
                        if (!nextValue) {
                            return {
                                ...currentSegment,
                                customMetricEnabled: false,
                                customMetricKind: undefined,
                                customMetricDistance: undefined,
                                customMetricDurationSeconds: undefined,
                                distance: 0,
                                customExercises: [],
                            };
                        }
                        const nextKind: CustomMetricSelectableKind =
                            currentSegment.customMetricKind === "duration"
                                ? "duration"
                                : currentSegment.customMetricKind === "exo"
                                    ? "exo"
                                    : "distance";
                        const mirroredDistance =
                            nextKind === "distance"
                                ? currentSegment.customMetricDistance ?? currentSegment.distance ?? 0
                                : 0;
                        const nextRepetitions =
                            nextKind === "exo"
                                ? currentSegment.customMetricRepetitions && currentSegment.customMetricRepetitions > 0
                                    ? currentSegment.customMetricRepetitions
                                    : 1
                                : currentSegment.customMetricRepetitions;
                        return {
                            ...currentSegment,
                            customMetricEnabled: true,
                            customMetricKind: nextKind,
                            distance: mirroredDistance,
                            customExercises: nextKind === "exo" ? currentSegment.customExercises ?? [] : [],
                            customMetricRepetitions: nextRepetitions,
                        };
                    }),
                }));
            };

            const handleCustomMetricKindChange = (kind: CustomMetricSelectableKind) => {
                updateSeries(serie.id, (currentSerie) => ({
                    ...currentSerie,
                    segments: currentSerie.segments.map((currentSegment) => {
                        if (currentSegment.id !== segment.id) {
                            return currentSegment;
                        }
                        return {
                            ...currentSegment,
                            customMetricKind: kind,
                            distance:
                                kind === "distance"
                                    ? currentSegment.customMetricDistance ?? currentSegment.distance ?? 0
                                    : 0,
                            customExercises: kind === "exo" ? currentSegment.customExercises ?? [] : [],
                            customMetricRepetitions:
                                kind === "exo"
                                    ? currentSegment.customMetricRepetitions && currentSegment.customMetricRepetitions > 0
                                        ? currentSegment.customMetricRepetitions
                                        : 1
                                    : currentSegment.customMetricRepetitions,
                        };
                    }),
                }));
            };

            const renderExerciseMetricControl = () => {
                const exercises = (segment.customExercises || []).filter((exercise) => Boolean(exercise && exercise.trim()));
                const draftValue = customExerciseDrafts[segment.id] ?? "";
                const canAddExercise = Boolean(draftValue.trim());
                return (
                    <View style={styles.customExerciseBuilder}>
                        <Text style={styles.segmentFieldLabel}>Exercices repère</Text>
                        <View style={styles.ppgInputRow}>
                            <TextInput
                                mode="outlined"
                                style={[styles.input, styles.ppgExerciseInput]}
                                textColor="#f8fafc"
                                value={draftValue}
                                onChangeText={(text) => handleCustomExerciseDraftChange(segment.id, text)}
                                placeholder="Ex: Fentes sautées"
                                placeholderTextColor="#64748b"
                                returnKeyType="done"
                                onSubmitEditing={() => handleAddCustomExercise(serie.id, segment)}
                            />
                            <Button
                                mode="contained"
                                icon="plus"
                                compact
                                onPress={() => handleAddCustomExercise(serie.id, segment)}
                                disabled={!canAddExercise}
                                style={styles.ppgAddButton}
                                contentStyle={styles.ppgAddButtonContent}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                            >
                                {null}
                            </Button>
                        </View>
                        <View style={styles.ppgExerciseList}>
                            {exercises.length ? (
                                exercises.map((exercise, idx) => (
                                    <View key={`${segment.id}-custom-exo-${idx}`} style={styles.ppgExerciseChip}>
                                        <Text style={styles.ppgExerciseChipText}>{exercise}</Text>
                                        <Pressable
                                            style={styles.ppgExerciseChipRemove}
                                            onPress={() => handleRemoveCustomExercise(serie.id, segment, idx)}
                                            accessibilityLabel={`Retirer ${exercise}`}
                                        >
                                            <MaterialCommunityIcons name="close" size={16} color="#f8fafc" />
                                        </Pressable>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.ppgExerciseEmptyText}>Ajoute un exercice repère.</Text>
                            )}
                        </View>
                    </View>
                );
            };

            const renderMetricControl = () => {
                if (!metricEnabled) return null;
                switch (resolvedMetricKind) {
                    case "duration":
                        return renderTimeInput("Durée (mm:ss)", "customMetricDurationSeconds", segment.customMetricDurationSeconds);
                    case "exo":
                        return renderExerciseMetricControl();
                    case "distance":
                    default:
                        return renderDistanceInput("Distance cible", {
                            field: "customMetricDistance",
                            value: segment.customMetricDistance,
                            mirrorToDistance: true,
                        });
                }
            };

            const metricToggleIcon = metricEnabled ? "checkbox-marked" : "checkbox-blank-outline";
            const metricControl = metricEnabled ? renderMetricControl() : null;
            const isExerciseMetric = metricEnabled && resolvedMetricKind === "exo";
            const shouldShowOptionalReps = !metricEnabled || !isExerciseMetric;

            return (
                <View style={styles.segmentStack}>
                    <Text style={styles.segmentFieldLabel}>Objectif du bloc</Text>
                    <TextInput
                        mode="outlined"
                        style={styles.input}
                        textColor="#f8fafc"
                        value={segment.customGoal ?? ""}
                        onChangeText={(text) => handleSegmentFieldChange(serie.id, segment.id, "customGoal", text)}
                        placeholder="Ex: Travail technique sur les appuis"
                        placeholderTextColor="#64748b"
                    />
                    <Pressable
                        style={[styles.customMetricToggle, metricEnabled && styles.customMetricToggleActive]}
                        onPress={handleMetricToggle}
                    >
                        <MaterialCommunityIcons name={metricToggleIcon} size={22} color={metricEnabled ? "#22d3ee" : "#94a3b8"} />
                        <View style={styles.customMetricToggleTexts}>
                            <Text style={styles.customMetricToggleTitle}>Définir les repères</Text>
                            <Text style={styles.customMetricToggleSubtitle}>
                                Active un repère distance, durée ou exercices pour cadrer le bloc.
                            </Text>
                        </View>
                    </Pressable>
                    {metricEnabled ? (
                        <>
                            {renderChipOptions("Type de repère", CUSTOM_BLOCK_METRIC_OPTIONS, resolvedMetricKind, (kind) =>
                                handleCustomMetricKindChange(kind)
                            )}
                            {isExerciseMetric ? (
                                <>
                                    {metricControl}
                                    <View style={styles.segmentFieldsRow}>
                                        {renderTimeInput(
                                            "Durée (mm:ss)",
                                            "customMetricDurationSeconds",
                                            segment.customMetricDurationSeconds
                                        )}
                                        {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                                        {renderRepetitionInput("Tours", "customMetricRepetitions", segment.customMetricRepetitions)}
                                    </View>
                                </>
                            ) : (
                                <View style={styles.segmentFieldsRow}>
                                    {metricControl}
                                    {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                                </View>
                            )}
                        </>
                    ) : (
                        <View style={styles.segmentFieldsRow}>
                            {renderTimeInput("Récup (mm:ss)", "restInterval", segment.restInterval)}
                        </View>
                    )}
                    {shouldShowOptionalReps ? (
                        <View style={styles.segmentFieldsRow}>
                            {renderRepetitionInput(
                                "Répétitions (optionnel)",
                                "customMetricRepetitions",
                                segment.customMetricRepetitions
                            )}
                        </View>
                    ) : null}
                    <Text style={styles.segmentFieldLabel}>Notes</Text>
                    <TextInput
                        mode="outlined"
                        style={styles.input}
                        textColor="#f8fafc"
                        value={segment.customNotes ?? ""}
                        onChangeText={(text) => handleSegmentFieldChange(serie.id, segment.id, "customNotes", text)}
                        placeholder="Consignes particulières, matériel, etc."
                        placeholderTextColor="#64748b"
                        multiline
                    />
                </View>
            );
        };

        const renderBody = () => {
            switch (blockType) {
                case "cotes":
                    return renderCotesContent();
                case "ppg":
                    return renderPpgContent();
                case "muscu":
                    return renderMuscuContent();
                case "recup":
                    return renderRecupContent();
                case "start":
                    return renderStartContent();
                case "custom":
                    return renderCustomContent();
                case "vitesse":
                default:
                    return renderVitesseContent();
            }
        };

        return (
            <View key={segment.id} style={styles.segmentBlock}>
                <View style={styles.segmentHeader}>
                    <Pressable
                        style={styles.blockHeaderButton}
                        onPress={() => openBlockPicker(serie.id, segment)}
                        accessibilityRole="button"
                        accessibilityLabel={`Choisir le type du bloc ${segmentIndex + 1}`}
                    >
                        <Text style={styles.segmentTitle}>{`Bloc ${segmentIndex + 1} : ${blockLabel}`}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                    </Pressable>
                    {serie.segments.length > 1 ? (
                        <IconButton
                            icon="close"
                            size={18}
                            iconColor="#94a3b8"
                            onPress={() => handleRemoveSegment(serie.id, segment.id)}
                        />
                    ) : null}
                </View>
                <Text style={styles.blockHeaderHint}>{blockHint}</Text>
                {renderBody()}
                {pacePreview ? (
                    <View style={styles.segmentPaceField}>
                        <Text style={styles.segmentFieldLabel}>
                            {`${pacePreview.mode === "load" ? "Charge" : "Temps"} cible (${pacePreview.distanceLabel})`}
                        </Text>
                        <Text style={styles.segmentPaceValue}>{pacePreview.value}</Text>
                        <Text style={styles.segmentPaceHint}>{pacePreview.detail}</Text>
                    </View>
                ) : null}
            </View>
        );
    };

    const openSessionDatePicker = () => {
        const currentDate = parseSessionDate(values.date) ?? DEFAULT_SESSION_DATE;

        if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
                value: currentDate,
                mode: "date",
                display: "calendar",
                onChange: (event, selectedDate) => {
                    if (event.type === "dismissed" || !selectedDate) return;
                    setField("date", formatSessionDatePayload(selectedDate));
                },
            });
            return;
        }

        setTempSessionDate(currentDate);
        setDatePickerVisible(true);
    };

    const handleSessionDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (selectedDate) {
            setTempSessionDate(selectedDate);
        }
    };

    const handleSessionDateConfirm = () => {
        setField("date", formatSessionDatePayload(tempSessionDate));
        setDatePickerVisible(false);
    };

    const openSessionTimePicker = () => {
        const currentTime = parseSessionTimeValue(values.startTime) ?? DEFAULT_SESSION_DATE;
        if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
                value: currentTime,
                mode: "time",
                is24Hour: true,
                onChange: (event, selectedDate) => {
                    if (event.type === "dismissed" || !selectedDate) return;
                    setField("startTime", formatSessionTimePayload(selectedDate));
                },
            });
            return;
        }
        setTempSessionTime(currentTime);
        setSessionTimePickerVisible(true);
    };

    const handleSessionTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (selectedDate) {
            setTempSessionTime(selectedDate);
        }
    };

    const handleSessionTimeConfirm = () => {
        setField("startTime", formatSessionTimePayload(tempSessionTime));
        setSessionTimePickerVisible(false);
    };

    const openSessionDurationPicker = () => {
        const currentDuration = buildDurationDate(values.durationMinutes);
        if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
                value: currentDuration,
                mode: "time",
                is24Hour: true,
                onChange: (event, selectedDate) => {
                    if (event.type === "dismissed" || !selectedDate) return;
                    setField("durationMinutes", minutesFromDate(selectedDate));
                },
            });
            return;
        }
        setTempSessionDuration(currentDuration);
        setSessionDurationPickerVisible(true);
    };

    const handleSessionDurationChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (selectedDate) {
            setTempSessionDuration(selectedDate);
        }
    };

    const handleSessionDurationConfirm = () => {
        setField("durationMinutes", minutesFromDate(tempSessionDuration));
        setSessionDurationPickerVisible(false);
    };

    if (isEditing && prefillLoading) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateWrapper}>
                    <ActivityIndicator color="#22d3ee" />
                    <Text style={styles.stateText}>Chargement de la séance...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (isEditing && prefillError) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateWrapper}>
                    <Text style={styles.stateText}>{prefillError}</Text>
                    <Button
                        mode="contained"
                        onPress={loadSessionForEdit}
                        buttonColor="#22d3ee"
                        textColor="#02111f"
                    >
                        Réessayer
                    </Button>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <>
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={keyboardVerticalOffset}
                    style={styles.keyboardAvoider}
                >
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                        automaticallyAdjustKeyboardInsets
                        contentContainerStyle={[styles.container, { paddingBottom: scrollBottomPadding }]}
                        contentInsetAdjustmentBehavior="never"
                    >
                        <View style={styles.panel}>
                            <Text style={styles.title}>{screenTitle}</Text>
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>Informations</Text>
                                </View>
                                <View style={styles.cardContent}>
                                    <Pressable
                                        onPress={openSessionDatePicker}
                                        accessibilityRole="button"
                                        accessibilityLabel="Choisir la date de séance"
                                        style={styles.pickerFieldWrapper}
                                    >
                                        <TextInput
                                            label="Date de séance"
                                            value={sessionDateDisplay}
                                            placeholder="Choisir une date"
                                            placeholderTextColor="#94a3b8"
                                            mode="outlined"
                                            style={styles.input}
                                            theme={inputTheme}
                                            textColor="#f8fafc"
                                            editable={false}
                                            pointerEvents="none"
                                            right={<TextInput.Icon icon="calendar-range" />}
                                        />
                                    </Pressable>
                                    <View style={styles.inlineFieldRow}>
                                        <Pressable
                                            onPress={openSessionTimePicker}
                                            accessibilityRole="button"
                                            accessibilityLabel="Choisir l'heure de la séance"
                                            style={styles.inlineField}
                                        >
                                            <TextInput
                                                label="Heure de séance"
                                                value={sessionTimeDisplay}
                                                placeholder="Choisir l'heure"
                                                placeholderTextColor="#94a3b8"
                                                mode="outlined"
                                                style={[styles.input, styles.inlineInput]}
                                                theme={inputTheme}
                                                textColor="#f8fafc"
                                                editable={false}
                                                pointerEvents="none"
                                                right={<TextInput.Icon icon="clock-outline" />}
                                            />
                                        </Pressable>
                                        <Pressable
                                            onPress={openSessionDurationPicker}
                                            accessibilityRole="button"
                                            accessibilityLabel="Choisir la durée de la séance"
                                            style={[styles.inlineField, styles.inlineFieldSpacing]}
                                        >
                                            <TextInput
                                                label="Durée (HH:MM)"
                                                value={sessionDurationDisplay}
                                                placeholder="Choisir la durée"
                                                placeholderTextColor="#94a3b8"
                                                mode="outlined"
                                                style={[styles.input, styles.inlineInput]}
                                                theme={inputTheme}
                                                textColor="#f8fafc"
                                                editable={false}
                                                pointerEvents="none"
                                                right={<TextInput.Icon icon="timer-outline" />}
                                            />
                                        </Pressable>
                                    </View>
                                    <TextInput
                                        label="Titre"
                                        value={values.title}
                                        onChangeText={(text) => setField("title", text)}
                                        mode="outlined"
                                        style={styles.input}
                                        theme={inputTheme}
                                        textColor="#f8fafc"
                                    />
                                    <TextInput
                                        label="Lieu"
                                        value={values.place}
                                        onChangeText={(text) => setField("place", text)}
                                        mode="outlined"
                                        style={styles.input}
                                        theme={inputTheme}
                                        textColor="#f8fafc"
                                        placeholder="Stade, salle, etc."
                                        placeholderTextColor="#64748b"
                                    />
                                    <TextInput
                                        label="Description"
                                        value={values.description}
                                        onChangeText={(text) => setField("description", text)}
                                        mode="outlined"
                                        multiline
                                        style={styles.input}
                                        theme={inputTheme}
                                        textColor="#f8fafc"
                                    />
                                    <TrainingTypeSelect value={values.type} onChange={(type) => setField("type", type)} />
                                    <View style={styles.statusSelector}>
                                        <Text style={styles.statusSelectorLabel}>Statut</Text>
                                        <View style={styles.statusOptionsRow}>
                                            {SESSION_STATUS_OPTIONS.map((option) => {
                                                const isActive = (values.status || "planned") === option.value;
                                                return (
                                                    <Pressable
                                                        key={option.value}
                                                        style={[styles.statusOptionChip, isActive && styles.statusOptionChipActive]}
                                                        onPress={() => setField("status", option.value)}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name={option.icon}
                                                            size={14}
                                                            color={isActive ? "#010617" : "#38bdf8"}
                                                        />
                                                        <Text
                                                            style={[styles.statusOptionText, isActive && styles.statusOptionTextActive]}
                                                        >
                                                            {option.label}
                                                        </Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>Séries & blocs</Text>
                                    <Text style={styles.cardSubtitle}>Construis ta séance</Text>
                                </View>
                                <View style={styles.cardContent}>
                                    <View style={styles.seriesSectionHeader}>
                                        <View>
                                            <Text style={styles.sectionTitle}>Séries</Text>
                                        </View>
                                        <Button
                                            mode="text"
                                            textColor="#22d3ee"
                                            icon="plus"
                                            onPress={handleAddSeries}
                                            compact
                                        >
                                            Série
                                        </Button>
                                    </View>
                                    {values.series.map((serie, index) => (
                                        <View key={serie.id} style={styles.seriesCard}>
                                            <View style={styles.seriesCardHeader}>
                                                <Text style={styles.seriesTitle}>Série {index + 1}</Text>
                                                <View style={styles.seriesHeaderActions}>
                                                    <Pressable
                                                        style={styles.seriesRepeatControl}
                                                        onPress={() => openSeriesRepeatPicker(serie)}
                                                    >
                                                        <View style={styles.seriesRepeatContent}>
                                                            <View style={styles.seriesRepeatTextBlock}>
                                                                <Text style={styles.seriesRepeatLabel}>
                                                                    {formatSeriesRepeatLabel(serie.repeatCount)} fois
                                                                </Text>
                                                            </View>
                                                            <MaterialCommunityIcons name="chevron-down" size={22} color="#94a3b8" />
                                                        </View>
                                                    </Pressable>
                                                    {values.series.length > 1 ? (
                                                        <IconButton
                                                            icon="close"
                                                            size={18}
                                                            iconColor="#94a3b8"
                                                            onPress={() => handleRemoveSeries(serie.id)}
                                                        />
                                                    ) : null}
                                                </View>
                                            </View>
                                            <View style={styles.seriesPaceRow}>
                                                <Pressable
                                                    style={[styles.seriesPaceToggle, serie.enablePace && styles.seriesPaceToggleActive]}
                                                    onPress={() => handleSeriesPaceToggle(serie)}
                                                    accessibilityLabel="Activer la définition de l'allure pour cette série"
                                                >
                                                    <MaterialCommunityIcons
                                                        name={serie.enablePace ? "checkbox-marked" : "checkbox-blank-outline"}
                                                        size={22}
                                                        color={serie.enablePace ? "#22d3ee" : "#94a3b8"}
                                                    />
                                                    <View style={styles.seriesPaceToggleTexts}>
                                                        <Text style={styles.seriesPaceToggleLabel}>Intensité</Text>
                                                        <Text style={styles.seriesPaceToggleHint}>Cible effort / temps de référence</Text>
                                                    </View>
                                                </Pressable>
                                                {serie.enablePace ? (
                                                    <View style={styles.seriesPaceSelectors}>
                                                        <Pressable
                                                            style={[styles.pacePickerTrigger, styles.pacePickerTriggerGrow]}
                                                            onPress={() => openPacePicker(serie)}
                                                            accessibilityLabel="Sélectionner le pourcentage de référence"
                                                        >
                                                            <Text style={styles.pacePickerLabel}>Intensité</Text>
                                                            <View style={styles.pacePickerValueRow}>
                                                                <Text style={styles.pacePickerValue}>
                                                                    {formatPacePercentLabel(serie.pacePercent)}
                                                                </Text>
                                                                <MaterialCommunityIcons
                                                                    name="chevron-down"
                                                                    size={20}
                                                                    color="#94a3b8"
                                                                />
                                                            </View>
                                                        </Pressable>
                                                        <Pressable
                                                            style={[styles.pacePickerTrigger, styles.pacePickerTriggerGrow]}
                                                            onPress={() => openPaceReferencePicker(serie)}
                                                            accessibilityLabel="Sélectionner la référence d'intensité"
                                                        >
                                                            <Text style={styles.pacePickerLabel}>Référence</Text>
                                                            <View style={styles.pacePickerValueRow}>
                                                                <Text style={[styles.pacePickerValue, styles.pacePickerReferenceValue]}>
                                                                    {formatPaceReferenceDistanceLabel(serie.paceReferenceDistance)}
                                                                </Text>
                                                                <MaterialCommunityIcons
                                                                    name="chevron-down"
                                                                    size={20}
                                                                    color="#94a3b8"
                                                                />
                                                            </View>
                                                        </Pressable>
                                                    </View>
                                                ) : null}
                                            </View>
                                            {renderLoadReferencePanel(serie)}
                                            {serie.segments.map((segment, segmentIndex) =>
                                                renderSegmentBlock(serie, segment, segmentIndex)
                                            )}
                                            <Button
                                                mode="outlined"
                                                icon="plus"
                                                onPress={() => handleAddSegment(serie.id)}
                                                textColor="#22d3ee"
                                                style={styles.addDistanceButton}
                                            >
                                                Bloc supplémentaire
                                            </Button>
                                        </View>
                                    ))}
                                    {values.series.reduce((acc, serie) => acc + (serie.repeatCount || 1), 0) > 1 && (
                                        <View style={styles.sessionRestField}>
                                            <Text style={styles.sessionRestLabel}>Repos entre les séries (mm:ss)</Text>
                                            <Pressable
                                                style={styles.restPickerTrigger}
                                                onPress={openSeriesRestPicker}
                                                accessibilityLabel="Sélectionner le repos entre les séries"
                                            >
                                                <Text style={styles.restPickerValue}>
                                                    {formatRestIntervalLabel(values.seriesRestInterval)}
                                                </Text>
                                            </Pressable>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>Préparation</Text>
                                    <Text style={styles.cardSubtitle}>Équipements & notes coach</Text>
                                </View>
                                <View style={styles.cardContent}>
                                    <TextInput
                                        label="Équipements nécessaires"
                                        value={values.equipment || ""}
                                        onChangeText={(text) => setField("equipment", text)}
                                        mode="outlined"
                                        multiline
                                        style={styles.input}
                                        theme={inputTheme}
                                        textColor="#f8fafc"
                                        placeholder="Ex : pointes, corde à sauter..."
                                        placeholderTextColor="#64748b"
                                    />
                                    <TextInput
                                        label="Notes coach"
                                        value={values.coachNotes}
                                        onChangeText={(text) => setField("coachNotes", text)}
                                        mode="outlined"
                                        multiline
                                        style={styles.input}
                                        theme={inputTheme}
                                        textColor="#f8fafc"
                                    />
                                </View>
                            </View>
                            <View style={styles.panelSpacer} />
                            <View style={[styles.buttonRow, { marginBottom: bottomSpacing }]}>
                                <Button
                                    mode="outlined"
                                    onPress={handleResetForm}
                                    disabled={loading}
                                    style={{ flex: 1 }}
                                    textColor="#f8fafc"
                                >
                                    Réinitialiser
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleSubmit}
                                    loading={loading}
                                    disabled={!canSubmit || loading || !athleteId}
                                    style={{ flex: 1 }}
                                    buttonColor="#22d3ee"
                                    textColor="#02111f"
                                >
                                    {submitButtonLabel}
                                </Button>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={distancePickerState.visible}
                onRequestClose={closeDistancePicker}
            >
                <View style={styles.distancePickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeDistancePicker} />
                    <View style={styles.distancePickerModal}>
                        <Text style={styles.distancePickerTitle}>Distance</Text>
                        <Text style={styles.distancePickerSubtitle}>Compose la valeur exacte</Text>
                        <View style={styles.distancePickerColumns}>
                            <View style={styles.distancePickerColumn}>
                                <Text style={styles.distancePickerColumnLabel}>
                                    {distancePickerState.unit === "km" ? "Kilomètres" : "Centaines (x100m)"}
                                </Text>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.distancePickerOptionList}
                                    style={styles.distancePickerColumnScroll}
                                >
                                    {DISTANCE_HUNDRED_OPTIONS.map((option) => {
                                        const isSelected = option === distancePickerState.hundreds;
                                        return (
                                            <Pressable
                                                key={`hundreds-${option}`}
                                                onPress={() => handleDistancePickerValueChange("hundreds", option)}
                                                style={[
                                                    styles.distancePickerOption,
                                                    isSelected && styles.distancePickerOptionSelected,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.distancePickerOptionText,
                                                        isSelected && styles.distancePickerOptionTextSelected,
                                                    ]}
                                                >
                                                    {option}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                            <View style={styles.distancePickerColumn}>
                                <Text style={styles.distancePickerColumnLabel}>
                                    {distancePickerState.unit === "km" ? "Décimales" : "Complément (m)"}
                                </Text>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.distancePickerOptionList}
                                    style={styles.distancePickerColumnScroll}
                                >
                                    {DISTANCE_REMAINDER_OPTIONS.map((option) => {
                                        const isSelected = option === distancePickerState.remainder;
                                        const optionLabel = distancePickerState.unit === "km"
                                            ? `.${option.toString().padStart(2, "0")}`
                                            : option.toString().padStart(2, "0");
                                        return (
                                            <Pressable
                                                key={`remainder-${option}`}
                                                onPress={() => handleDistancePickerValueChange("remainder", option)}
                                                style={[
                                                    styles.distancePickerOption,
                                                    isSelected && styles.distancePickerOptionSelected,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.distancePickerOptionText,
                                                        isSelected && styles.distancePickerOptionTextSelected,
                                                    ]}
                                                >
                                                    {optionLabel}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                            <View style={styles.distancePickerColumn}>
                                <Text style={styles.distancePickerColumnLabel}>Unité</Text>
                                <View style={styles.distancePickerUnitList}>
                                    {DISTANCE_UNIT_OPTIONS.map((unit) => {
                                        const isSelected = unit === distancePickerState.unit;
                                        return (
                                            <Pressable
                                                key={`unit-${unit}`}
                                                onPress={() => handleDistanceUnitChange(unit)}
                                                style={[
                                                    styles.distancePickerOption,
                                                    isSelected && styles.distancePickerOptionSelected,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.distancePickerOptionText,
                                                        isSelected && styles.distancePickerOptionTextSelected,
                                                    ]}
                                                >
                                                    {unit}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                        <View style={[styles.distancePickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeDistancePicker} style={{ flex: 1 }}>
                                Fermer
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleDistancePickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={repetitionPickerState.visible}
                onRequestClose={closeRepetitionPicker}
            >
                <View style={styles.repetitionPickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeRepetitionPicker} />
                    <View style={styles.repetitionPickerModal}>
                        <Text style={styles.repetitionPickerTitle}>Répétitions</Text>
                        <Text style={styles.repetitionPickerSubtitle}>Choisis entre 1 et 50 répétitions</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.repetitionPickerOptionList}
                            style={styles.repetitionPickerScroll}
                        >
                            {REPETITION_OPTIONS.map((option) => {
                                const isSelected = option === repetitionPickerState.value;
                                return (
                                    <Pressable
                                        key={`repetition-${option}`}
                                        onPress={() => handleRepetitionValueChange(option)}
                                        style={[
                                            styles.repetitionPickerOption,
                                            isSelected && styles.repetitionPickerOptionSelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.repetitionPickerOptionText,
                                                isSelected && styles.repetitionPickerOptionTextSelected,
                                            ]}
                                        >
                                            {option}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <View style={[styles.repetitionPickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeRepetitionPicker} style={{ flex: 1 }}>
                                Fermer
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleRepetitionPickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={seriesRepeatPickerState.visible}
                onRequestClose={closeSeriesRepeatPicker}
            >
                <View style={styles.repetitionPickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSeriesRepeatPicker} />
                    <View style={styles.repetitionPickerModal}>
                        <Text style={styles.repetitionPickerTitle}>Répétitions de série</Text>
                        <Text style={styles.repetitionPickerSubtitle}>Définis entre 1 et 50 fois la répétition de la série</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.repetitionPickerOptionList}
                            style={styles.repetitionPickerScroll}
                        >
                            {SERIES_REPEAT_OPTIONS.map((option) => {
                                const isSelected = option === seriesRepeatPickerState.value;
                                return (
                                    <Pressable
                                        key={`series-repeat-${option}`}
                                        onPress={() => handleSeriesRepeatValueChange(option)}
                                        style={[
                                            styles.repetitionPickerOption,
                                            isSelected && styles.repetitionPickerOptionSelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.repetitionPickerOptionText,
                                                isSelected && styles.repetitionPickerOptionTextSelected,
                                            ]}
                                        >
                                            {formatSeriesRepeatLabel(option)}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <View style={[styles.repetitionPickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button
                                mode="text"
                                textColor="#94a3b8"
                                onPress={closeSeriesRepeatPicker}
                                style={{ flex: 1 }}
                            >
                                Fermer
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleSeriesRepeatPickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={pacePickerState.visible}
                onRequestClose={closePacePicker}
            >
                <View style={styles.repetitionPickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closePacePicker} />
                    <View style={styles.repetitionPickerModal}>
                        <Text style={styles.repetitionPickerTitle}>Allure cible</Text>
                        <Text style={styles.repetitionPickerSubtitle}>Sélectionne un pourcentage de référence</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.repetitionPickerOptionList}
                            style={styles.repetitionPickerScroll}
                        >
                            {PACE_PERCENT_OPTIONS.map((option) => {
                                const isSelected = option === pacePickerState.value;
                                return (
                                    <Pressable
                                        key={`pace-${option}`}
                                        onPress={() => handlePacePickerValueChange(option)}
                                        style={[
                                            styles.repetitionPickerOption,
                                            isSelected && styles.repetitionPickerOptionSelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.repetitionPickerOptionText,
                                                isSelected && styles.repetitionPickerOptionTextSelected,
                                            ]}
                                        >
                                            {option} %
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <View style={[styles.repetitionPickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button mode="text" textColor="#94a3b8" onPress={closePacePicker} style={{ flex: 1 }}>
                                Fermer
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handlePacePickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={paceReferencePickerState.visible}
                onRequestClose={closePaceReferencePicker}
            >
                <View style={styles.repetitionPickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closePaceReferencePicker} />
                    <View style={styles.repetitionPickerModal}>
                        <Text style={styles.repetitionPickerTitle}>Référence</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.repetitionPickerOptionList}
                            style={styles.repetitionPickerScroll}
                        >
                            {PACE_REFERENCE_DISTANCE_OPTIONS.map((option) => {
                                const isSelected = option === paceReferencePickerState.value;
                                return (
                                    <Pressable
                                        key={`pace-ref-${option}`}
                                        onPress={() => handlePaceReferencePickerValueChange(option)}
                                        style={[
                                            styles.repetitionPickerOption,
                                            isSelected && styles.repetitionPickerOptionSelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.repetitionPickerOptionText,
                                                isSelected && styles.repetitionPickerOptionTextSelected,
                                            ]}
                                        >
                                            {PACE_REFERENCE_LABELS[option] ?? option}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <View style={[styles.repetitionPickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button mode="text" textColor="#94a3b8" onPress={closePaceReferencePicker} style={{ flex: 1 }}>
                                Fermer
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handlePaceReferencePickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={timePickerState.visible}
                onRequestClose={closeTimePicker}
            >
                <View style={styles.restPickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeTimePicker} />
                    <View style={styles.restPickerModal}>
                        <Text style={styles.restPickerTitle}>{timePickerState.label || "Durée (mm:ss)"}</Text>
                        <Text style={styles.restPickerSubtitle}>Ajuste les minutes et secondes</Text>
                        <View style={styles.restPickerColumns}>
                            <View style={styles.restPickerColumn}>
                                <Text style={styles.restPickerColumnLabel}>Minutes</Text>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.restPickerOptionList}
                                    style={styles.restPickerColumnScroll}
                                >
                                    {REST_MINUTE_OPTIONS.map((option) => {
                                        const isSelected = option === timePickerState.minutes;
                                        return (
                                            <Pressable
                                                key={`minutes-${option}`}
                                                onPress={() => handleTimePickerValueChange("minutes", option)}
                                                style={[
                                                    styles.restPickerOption,
                                                    isSelected && styles.restPickerOptionSelected,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.restPickerOptionText,
                                                        isSelected && styles.restPickerOptionTextSelected,
                                                    ]}
                                                >
                                                    {option.toString().padStart(2, "0")}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                            <Text style={styles.restPickerSeparator}>:</Text>
                            <View style={styles.restPickerColumn}>
                                <Text style={styles.restPickerColumnLabel}>Secondes</Text>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.restPickerOptionList}
                                    style={styles.restPickerColumnScroll}
                                >
                                    {REST_SECOND_OPTIONS.map((option) => {
                                        const isSelected = option === timePickerState.seconds;
                                        return (
                                            <Pressable
                                                key={`seconds-${option}`}
                                                onPress={() => handleTimePickerValueChange("seconds", option)}
                                                style={[
                                                    styles.restPickerOption,
                                                    isSelected && styles.restPickerOptionSelected,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.restPickerOptionText,
                                                        isSelected && styles.restPickerOptionTextSelected,
                                                    ]}
                                                >
                                                    {option.toString().padStart(2, "0")}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </View>
                        <View style={[styles.restPickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button
                                mode="text"
                                textColor="#94a3b8"
                                onPress={closeTimePicker}
                                style={{ flex: 1 }}
                            >
                                Fermer
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleTimePickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                statusBarTranslucent
                animationType="fade"
                visible={blockPickerState.visible}
                onRequestClose={closeBlockPicker}
            >
                <View style={styles.blockPickerBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeBlockPicker} />
                    <View style={styles.blockPickerModal}>
                        <Text style={styles.blockPickerTitle}>Type de bloc</Text>
                        <Text style={styles.blockPickerSubtitle}>
                            Choisis un exercice du catalogue ou crée ton propre bloc.
                        </Text>
                        <View style={styles.blockPickerOptions}>
                            {trainingBlockCatalog.map((option) => {
                                const isSelected = option.type === blockPickerState.selectedType;
                                return (
                                    <Pressable
                                        key={`block-${option.type}`}
                                        onPress={() => handleBlockTypeSelect(option.type)}
                                        style={[styles.blockPickerOptionRow, isSelected && styles.blockPickerOptionActive]}
                                    >
                                        <Text style={styles.blockPickerOptionText}>{option.label}</Text>
                                        {isSelected ? (
                                            <MaterialCommunityIcons name="check" size={18} color="#22d3ee" />
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                        <Text style={styles.blockPickerSubtitle}>Nom affiché pour ce bloc</Text>
                        <TextInput
                            mode="outlined"
                            value={blockPickerState.label}
                            onChangeText={handleBlockLabelChange}
                            placeholder={CUSTOM_BLOCK_PLACEHOLDER}
                            placeholderTextColor="#475569"
                            style={styles.blockPickerInput}
                            theme={inputTheme}
                            textColor="#f8fafc"
                        />
                        <View style={[styles.blockPickerActions, { paddingBottom: modalActionPadding }]}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeBlockPicker} style={{ flex: 1 }}>
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleBlockPickerConfirm}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                style={{ flex: 1 }}
                            >
                                Valider
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            {Platform.OS === "ios" && (
                <Modal
                    transparent
                    statusBarTranslucent
                    animationType="fade"
                    visible={datePickerVisible}
                    onRequestClose={() => setDatePickerVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDatePickerVisible(false)} />
                        <View style={styles.modalContent}>
                            <View style={styles.modalGrabber} />
                            <Text style={styles.pickerTitle}>Choisis la date de séance</Text>
                            <View style={styles.pickerPreview}>
                                <Text style={styles.pickerPreviewLabel}>Date sélectionnée</Text>
                                <Text style={styles.pickerPreviewValue}>
                                    {formatSessionDateDisplay(formatSessionDatePayload(tempSessionDate))}
                                </Text>
                            </View>
                            <DateTimePicker
                                value={tempSessionDate}
                                mode="date"
                                display="spinner"
                                onChange={handleSessionDateChange}
                                themeVariant="dark"
                            />
                            <View style={[styles.pickerActions, { paddingBottom: modalActionPadding }]}>
                                <Button
                                    mode="outlined"
                                    onPress={() => setDatePickerVisible(false)}
                                    textColor="#e2e8f0"
                                    style={styles.pickerCancel}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleSessionDateConfirm}
                                    buttonColor="#22d3ee"
                                    textColor="#0f172a"
                                    style={styles.pickerButton}
                                >
                                    Confirmer
                                </Button>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
            {Platform.OS === "ios" && (
                <Modal
                    transparent
                    statusBarTranslucent
                    animationType="fade"
                    visible={sessionTimePickerVisible}
                    onRequestClose={() => setSessionTimePickerVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSessionTimePickerVisible(false)} />
                        <View style={styles.modalContent}>
                            <View style={styles.modalGrabber} />
                            <Text style={styles.pickerTitle}>Choisis l&apos;heure de séance</Text>
                            <View style={styles.pickerPreview}>
                                <Text style={styles.pickerPreviewLabel}>Heure sélectionnée</Text>
                                <Text style={styles.pickerPreviewValue}>{formatSessionTimeDisplay(formatSessionTimePayload(tempSessionTime))}</Text>
                            </View>
                            <DateTimePicker
                                value={tempSessionTime}
                                mode="time"
                                display="spinner"
                                onChange={handleSessionTimeChange}
                                themeVariant="dark"
                                is24Hour
                            />
                            <View style={[styles.pickerActions, { paddingBottom: modalActionPadding }]}>
                                <Button
                                    mode="outlined"
                                    onPress={() => setSessionTimePickerVisible(false)}
                                    textColor="#e2e8f0"
                                    style={styles.pickerCancel}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleSessionTimeConfirm}
                                    buttonColor="#22d3ee"
                                    textColor="#0f172a"
                                    style={styles.pickerButton}
                                >
                                    Confirmer
                                </Button>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
            {Platform.OS === "ios" && (
                <Modal
                    transparent
                    statusBarTranslucent
                    animationType="fade"
                    visible={sessionDurationPickerVisible}
                    onRequestClose={() => setSessionDurationPickerVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <Pressable
                            style={StyleSheet.absoluteFillObject}
                            onPress={() => setSessionDurationPickerVisible(false)}
                        />
                        <View style={styles.modalContent}>
                            <View style={styles.modalGrabber} />
                            <Text style={styles.pickerTitle}>Choisis la durée de séance</Text>
                            <View style={styles.pickerPreview}>
                                <Text style={styles.pickerPreviewLabel}>Durée sélectionnée</Text>
                                <Text style={styles.pickerPreviewValue}>
                                    {formatSessionDurationDisplay(minutesFromDate(tempSessionDuration), "00:00")}
                                </Text>
                            </View>
                            <DateTimePicker
                                value={tempSessionDuration}
                                mode="time"
                                display="spinner"
                                onChange={handleSessionDurationChange}
                                themeVariant="dark"
                                is24Hour
                            />
                            <View style={[styles.pickerActions, { paddingBottom: modalActionPadding }]}>
                                <Button
                                    mode="outlined"
                                    onPress={() => setSessionDurationPickerVisible(false)}
                                    textColor="#e2e8f0"
                                    style={styles.pickerCancel}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleSessionDurationConfirm}
                                    buttonColor="#22d3ee"
                                    textColor="#0f172a"
                                    style={styles.pickerButton}
                                >
                                    Confirmer
                                </Button>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#030816",
    },
    keyboardAvoider: {
        flex: 1,
    },
    stateWrapper: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 32,
        gap: 12,
        backgroundColor: "rgba(3,8,22,0.85)",
    },
    stateText: {
        color: "#f8fafc",
        textAlign: "center",
    },
    container: {
        paddingHorizontal: 10,
        paddingVertical: 0,
        flexGrow: 1,
        backgroundColor: "transparent",
    },
    panel: {
        borderRadius: 28,
        shadowOpacity: 0.4,
        gap: 16,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        flexGrow: 1,
        backgroundColor: "rgba(255,255,255,0.02)",
        paddingTop: 4,
    },
    title: {
        fontSize: 20,
        fontWeight: "700",
        color: "#f8fafc",
        marginBottom: 4,
    },
    card: {
        backgroundColor: "rgba(6, 11, 28, 0.78)",
        borderRadius: 24,
        padding: 18,
        gap: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.04)",
    },
    cardHeader: {
        gap: 1,
    },
    cardTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "700",
    },
    cardSubtitle: {
        color: "#94a3b8",
        fontSize: 13,
    },
    cardContent: {
        gap: 12,
    },
    panelSpacer: {
        flexGrow: 1,
        minHeight: 0,
    },
    sessionRestField: {
        gap: 6,
    },
    sessionRestLabel: {
        color: "#94a3b8",
        fontSize: 14,
    },
    sessionRestHelper: {
        color: "#64748b",
        fontSize: 12,
    },
    input: {
        backgroundColor: "rgba(15,23,42,0.55)",
        borderRadius: 16,
    },
    pickerFieldWrapper: {
        width: "100%",
    },
    inlineFieldRow: {
        flexDirection: "row",
        width: "100%",
    },
    inlineField: {
        flex: 1,
    },
    inlineFieldSpacing: {
        marginLeft: 12,
    },
    inlineInput: {
        marginBottom: 0,
    },
    statusSelector: {
        gap: 8,
    },
    statusSelectorLabel: {
        color: "#cbd5e1",
        fontSize: 13,
        fontWeight: "600",
    },
    statusOptionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    statusOptionChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.35)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    statusOptionChipActive: {
        backgroundColor: "#22d3ee",
        borderColor: "#22d3ee",
    },
    statusOptionText: {
        color: "#38bdf8",
        fontSize: 12,
        fontWeight: "600",
    },
    statusOptionTextActive: {
        color: "#010617",
    },
    ppgInputRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    ppgExerciseInput: {
        flex: 1,
    },
    ppgAddButton: {
        borderRadius: 16,
    },
    ppgAddButtonContent: {
        height: 52,
        paddingHorizontal: 14,
    },
    customExerciseBuilder: {
        gap: 12,
        width: "100%",
    },
    restPickerTrigger: {
        backgroundColor: "rgba(15,23,42,0.55)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 56,
        justifyContent: "center",
    },
    distancePickerTrigger: {
        backgroundColor: "rgba(15,23,42,0.55)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 56,
        justifyContent: "center",
    },
    repetitionPickerTrigger: {
        backgroundColor: "rgba(15,23,42,0.55)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 56,
        justifyContent: "center",
    },
    repetitionPickerContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    repetitionPickerTextBlock: {
        flex: 1,
        gap: 2,
    },
    repetitionPickerLabel: {
        fontSize: 10,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    restPickerValue: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "600",
        letterSpacing: 0.5,
    },
    distancePickerValue: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "600",
        letterSpacing: 0.5,
    },
    repetitionPickerValue: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "600",
        letterSpacing: 0.5,
    },
    restPickerHint: {
        color: "#94a3b8",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginTop: 2,
    },
    distancePickerHint: {
        color: "#94a3b8",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginTop: 2,
    },
    seriesSectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#f8fafc",
    },
    sectionSubtitle: {
        fontSize: 12,
        color: "#94a3b8",
        marginTop: 2,
    },
    seriesCard: {
        backgroundColor: "rgba(10, 17, 35, 0.7)",
        borderRadius: 22,
        padding: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    seriesCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    seriesTitle: {
        fontSize: 15,
        fontWeight: "600",
        color: "#f8fafc",
    },
    seriesHeaderActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    seriesRepeatControl: {
        backgroundColor: "rgba(15,23,42,0.7)",
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        minWidth: 120,
    },
    seriesRepeatContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    seriesRepeatTextBlock: {
        flex: 1,
        gap: 2,
    },
    seriesRepeatControlLabel: {
        fontSize: 10,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    seriesRepeatLabel: {
        color: "#f8fafc",
        fontWeight: "600",
        fontSize: 16,
    },
    seriesPaceRow: {
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12,
    },
    seriesPaceSelectors: {
        flexDirection: "row",
        gap: 12,
        flexWrap: "wrap",
        width: "100%",
    },
    loadReferenceCard: {
        marginTop: 4,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
        backgroundColor: "rgba(3,7,18,0.6)",
        gap: 10,
    },
    loadReferenceCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    loadReferenceTitle: {
        color: "#f8fafc",
        fontWeight: "600",
        fontSize: 14,
    },
    loadReferenceBadge: {
        color: "#22d3ee",
        fontSize: 12,
        fontWeight: "600",
    },
    loadReferenceBadgeMuted: {
        color: "#94a3b8",
        fontSize: 12,
        fontWeight: "500",
    },
    loadReferenceInput: {
        backgroundColor: "rgba(15,23,42,0.55)",
        fontSize: 10,
    },
    loadReferenceHint: {
        fontSize: 12,
        color: "#94a3b8",
    },
    seriesPaceToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "rgba(15,23,42,0.55)",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        alignSelf: "stretch",
    },
    seriesPaceToggleActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    seriesPaceToggleTexts: {
        flex: 1,
        gap: 2,
    },
    seriesPaceToggleLabel: {
        color: "#f8fafc",
        fontWeight: "600",
    },
    seriesPaceToggleHint: {
        color: "#94a3b8",
        fontSize: 12,
    },
    pacePickerTrigger: {
        backgroundColor: "rgba(15,23,42,0.55)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        paddingHorizontal: 14,
        paddingVertical: 10,
        minWidth: 140,
        flexShrink: 0,
        gap: 4,
    },
    pacePickerTriggerGrow: {
        flex: 1,
        minWidth: 0,
    },
    pacePickerLabel: {
        fontSize: 10,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    pacePickerValueRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    pacePickerValue: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "600",
    },
    pacePickerReferenceValue: {
        fontSize: 12,
    },
    seriesHelperText: {
        fontSize: 12,
        color: "#94a3b8",
        marginBottom: 4,
    },
    segmentBlock: {
        backgroundColor: "rgba(4,9,20,0.55)",
        borderRadius: 16,
        padding: 12,
        gap: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.03)",
    },
    segmentHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    blockHeaderButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flex: 1,
    },
    segmentTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#e2e8f0",
    },
    blockHeaderHint: {
        fontSize: 11,
        color: "#64748b",
    },
    segmentFieldsRow: {
        flexDirection: "row",
        gap: 12,
        flexWrap: "wrap",
    },
    segmentStack: {
        gap: 12,
    },
    customMetricToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    customMetricToggleActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    customMetricToggleTexts: {
        flex: 1,
        gap: 2,
    },
    customMetricToggleTitle: {
        color: "#f8fafc",
        fontWeight: "600",
    },
    customMetricToggleSubtitle: {
        color: "#94a3b8",
        fontSize: 12,
    },
    segmentField: {
        flex: 1,
        minWidth: 120,
        gap: 6,
    },
    segmentFieldLabel: {
        fontSize: 12,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    ppgExerciseList: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 4,
    },
    ppgExerciseChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(15,23,42,0.65)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
    },
    ppgExerciseChipText: {
        color: "#f8fafc",
        fontWeight: "500",
    },
    ppgExerciseChipRemove: {
        padding: 2,
    },
    ppgExerciseEmptyText: {
        color: "#64748b",
        fontSize: 12,
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    chipActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    chipText: {
        color: "#cbd5f5",
        fontWeight: "500",
    },
    chipTextActive: {
        color: "#22d3ee",
        fontWeight: "600",
    },
    segmentPaceField: {
        marginTop: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        backgroundColor: "rgba(4,8,20,0.55)",
        gap: 4,
    },
    segmentPaceValue: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "600",
        letterSpacing: 0.5,
    },
    segmentPaceHint: {
        color: "#94a3b8",
        fontSize: 12,
    },
    addDistanceButton: {
        borderColor: "rgba(34,211,238,0.4)",
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    buttonRow: {
        flexDirection: "row",
        gap: 12,
        marginTop: 12,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.85)",
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: "#020617",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 20,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        gap: 16,
    },
    modalGrabber: {
        alignSelf: "center",
        width: 60,
        height: 5,
        borderRadius: 999,
        backgroundColor: "rgba(148,163,184,0.45)",
    },
    pickerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#f8fafc",
        textAlign: "center",
    },
    pickerDescription: {
        fontSize: 14,
        color: "#94a3b8",
        textAlign: "center",
    },
    pickerPreview: {
        backgroundColor: "rgba(15,23,42,0.6)",
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        gap: 4,
    },
    pickerPreviewLabel: {
        fontSize: 12,
        textTransform: "uppercase",
        color: "#94a3b8",
        letterSpacing: 0.8,
    },
    pickerPreviewValue: {
        fontSize: 16,
        fontWeight: "600",
        color: "#f8fafc",
    },
    pickerActions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 12,
    },
    pickerCancel: {
        flex: 1,
        borderColor: "rgba(148,163,184,0.3)",
    },
    pickerButton: {
        flex: 1,
    },
    distancePickerBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.85)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    distancePickerModal: {
        backgroundColor: "#020617",
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 18,
        width: "100%",
        maxWidth: 520,
        maxHeight: "70%",
    },
    distancePickerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#f8fafc",
        textAlign: "center",
    },
    distancePickerSubtitle: {
        fontSize: 13,
        color: "#94a3b8",
        textAlign: "center",
    },
    distancePickerColumns: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    distancePickerColumn: {
        flex: 1,
        backgroundColor: "rgba(15,23,42,0.6)",
        borderRadius: 20,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
    },
    distancePickerColumnLabel: {
        fontSize: 12,
        color: "#94a3b8",
        textAlign: "center",
        letterSpacing: 1,
        textTransform: "uppercase",
        marginBottom: 8,
    },
    distancePickerOptionList: {
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    distancePickerColumnScroll: {
        maxHeight: 220,
        flexGrow: 0,
    },
    distancePickerOption: {
        paddingVertical: 10,
        borderRadius: 14,
        alignItems: "center",
        marginBottom: 8,
    },
    distancePickerOptionSelected: {
        backgroundColor: "rgba(34,211,238,0.15)",
    },
    distancePickerOptionText: {
        fontSize: 16,
        color: "#cbd5f5",
        fontWeight: "500",
    },
    distancePickerOptionTextSelected: {
        color: "#22d3ee",
        fontWeight: "700",
    },
    distancePickerUnitList: {
        paddingHorizontal: 12,
    },
    distancePickerActions: {
        flexDirection: "row",
        gap: 12,
    },
    repetitionPickerBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.85)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    repetitionPickerModal: {
        backgroundColor: "#020617",
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 18,
        width: "100%",
        maxWidth: 420,
        maxHeight: "70%",
    },
    repetitionPickerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#f8fafc",
        textAlign: "center",
    },
    repetitionPickerSubtitle: {
        fontSize: 13,
        color: "#94a3b8",
        textAlign: "center",
    },
    repetitionPickerScroll: {
        maxHeight: 260,
    },
    repetitionPickerOptionList: {
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    repetitionPickerOption: {
        paddingVertical: 10,
        borderRadius: 14,
        alignItems: "center",
        marginBottom: 8,
    },
    repetitionPickerOptionSelected: {
        backgroundColor: "rgba(34,211,238,0.15)",
    },
    repetitionPickerOptionText: {
        fontSize: 16,
        color: "#cbd5f5",
        fontWeight: "500",
    },
    repetitionPickerOptionTextSelected: {
        color: "#22d3ee",
        fontWeight: "700",
    },
    repetitionPickerActions: {
        flexDirection: "row",
        gap: 12,
    },
    restPickerBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.85)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    restPickerModal: {
        backgroundColor: "#020617",
        borderRadius: 32,
        padding: 24,
        gap: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        width: "100%",
        maxWidth: 420,
        maxHeight: "70%",
    },
    restPickerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#f8fafc",
        textAlign: "center",
    },
    restPickerSubtitle: {
        fontSize: 13,
        color: "#94a3b8",
        textAlign: "center",
    },
    restPickerColumns: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 16,
    },
    restPickerColumn: {
        flex: 1,
        backgroundColor: "rgba(15,23,42,0.6)",
        borderRadius: 20,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
    },
    restPickerColumnLabel: {
        fontSize: 12,
        color: "#94a3b8",
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 8,
    },
    restPickerOptionList: {
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    restPickerColumnScroll: {
        maxHeight: 220,
        flexGrow: 0,
    },
    restPickerOption: {
        paddingVertical: 10,
        borderRadius: 14,
        alignItems: "center",
        marginBottom: 8,
    },
    restPickerOptionSelected: {
        backgroundColor: "rgba(34,211,238,0.15)",
    },
    restPickerOptionText: {
        fontSize: 16,
        color: "#cbd5f5",
        fontWeight: "500",
    },
    restPickerOptionTextSelected: {
        color: "#22d3ee",
        fontWeight: "700",
    },
    restPickerSeparator: {
        alignSelf: "stretch",
        textAlign: "center",
        fontSize: 24,
        fontWeight: "700",
        color: "#f8fafc",
        paddingTop: 44,
    },
    restPickerActions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 4,
    },
    blockPickerBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2,6,23,0.9)",
        justifyContent: "center",
        padding: 24,
    },
    blockPickerModal: {
        backgroundColor: "#020617",
        borderRadius: 28,
        padding: 20,
        gap: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
    },
    blockPickerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#f8fafc",
        textAlign: "center",
    },
    blockPickerSubtitle: {
        fontSize: 13,
        color: "#94a3b8",
        textAlign: "center",
    },
    blockPickerOptions: {
        gap: 8,
    },
    blockPickerOptionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    blockPickerOptionActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    blockPickerOptionText: {
        color: "#f8fafc",
        fontSize: 15,
        fontWeight: "600",
    },
    blockPickerInput: {
        backgroundColor: "rgba(15,23,42,0.55)",
        borderRadius: 16,
    },
    blockPickerActions: {
        flexDirection: "row",
        gap: 12,
    },
});
