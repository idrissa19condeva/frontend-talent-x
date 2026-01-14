import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { ActivityIndicator, Button, Switch, Text, TextInput } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { setNavigationResult } from "../../utils/navigationResults";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { buildTrainingSeriesSegment, trainingBlockCatalog } from "../../hooks/useTrainingForm";
import { createTrainingBlock, deleteTrainingBlock, getTrainingBlock, updateTrainingBlock } from "../../api/trainingBlockService";
import { TrainingBlockSegment } from "../../types/trainingBlock";
import { CustomBlockMetricKind, TrainingBlockType, TrainingRecoveryType, TrainingSeriesSegment } from "../../types/training";

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

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

const REPETITION_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

const clampRepetition = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(50, Math.round(value)));
};

const formatRepetitionLabel = (value?: number) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Choisir";
    return String(Math.round(value));
};

const START_EXIT_DISTANCE_OPTIONS = Array.from({ length: 100 }, (_, i) => i + 1);

const clampStartExitDistance = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(100, Math.round(value)));
};

const formatStartExitDistanceLabel = (value?: number) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Choisir";
    return `${Math.round(value)} m`;
};

const CUSTOM_METRIC_OPTIONS: { label: string; value: CustomBlockMetricKind }[] = [
    { label: "Distance", value: "distance" },
    { label: "Durée", value: "duration" },
    { label: "Répétitions", value: "reps" },
    { label: "Exos", value: "exo" },
];

const RECOVERY_MODE_OPTIONS: { label: string; value: TrainingRecoveryType }[] = [
    { label: "Marche", value: "marche" },
    { label: "Footing", value: "footing" },
    { label: "Passive", value: "passive" },
    { label: "Active", value: "active" },
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

const CUSTOM_EXO_SUGGESTIONS: { discipline: string; exercises: string[] }[] = [
    { discipline: "Sprint", exercises: ["Départs 3 appuis", "Accélération 30m"] },
    { discipline: "Haies", exercises: ["Rythme haies (3 pas)", "Passage de haies basses"] },
    { discipline: "Relais", exercises: ["Passage témoin", "Départ lancé"] },
    { discipline: "Demi-fond", exercises: ["Gammes (A-skips)", "Lignes droites"] },
    { discipline: "Fond", exercises: ["Footing technique", "Côtes courtes"] },
    { discipline: "Saut en longueur", exercises: ["Appel + impulsion", "Foulées bondissantes"] },
    { discipline: "Triple saut", exercises: ["Cloches", "Bondissements"] },
    { discipline: "Hauteur", exercises: ["Courbe d’élan", "Impulsion hauteur"] },
    { discipline: "Perche", exercises: ["Course d’élan perche", "Planté perche"] },
    { discipline: "Poids", exercises: ["Lancer face", "Glissé"] },
    { discipline: "Disque", exercises: ["Tours disque (à vide)", "Lancer élan réduit"] },
    { discipline: "Javelot", exercises: ["Pas chassés", "Lancer élan réduit"] },
    { discipline: "Marteau", exercises: ["Tours marteau (à vide)", "Pivots"] },
];

const normalizeExerciseName = (value: string) => value.trim();

const buildDefaultSegment = (blockType: TrainingBlockType): TrainingBlockSegment => {
    const segmentWithId = buildTrainingSeriesSegment(blockType);
    const { id: _id, ...rest } = segmentWithId as TrainingSeriesSegment;
    return rest;
};

export default function TrainingBlockEditorScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const blockId = asString(params.id);
    const isEditing = Boolean(blockId);

    const returnKey = asString(params.returnKey);
    const returnSerieId = asString(params.returnSerieId);

    const [loading, setLoading] = useState(false);
    const [prefillLoading, setPrefillLoading] = useState(false);
    const [isDefaultBlock, setIsDefaultBlock] = useState(false);

    const [title, setTitle] = useState("");
    const [segment, setSegment] = useState<TrainingBlockSegment>(() => buildDefaultSegment("vitesse"));

    const [typePickerVisible, setTypePickerVisible] = useState(false);

    const [secondsPicker, setSecondsPicker] = useState<
        | { visible: true; label: string; field: keyof TrainingBlockSegment; minutes: number; seconds: number }
        | { visible: false }
    >({ visible: false });

    const [repetitionPicker, setRepetitionPicker] = useState<
        | { visible: true; label: string; field: keyof TrainingBlockSegment; value: number }
        | { visible: false }
    >({ visible: false });

    const [startExitDistancePicker, setStartExitDistancePicker] = useState<
        | { visible: true; label: string; value: number }
        | { visible: false }
    >({ visible: false });

    const [recoveryModePickerVisible, setRecoveryModePickerVisible] = useState(false);
    const [customMetricKindPickerVisible, setCustomMetricKindPickerVisible] = useState(false);

    const [ppgExercisePickerVisible, setPpgExercisePickerVisible] = useState(false);
    const [ppgCustomExercise, setPpgCustomExercise] = useState("");
    const [ppgSelectedExercises, setPpgSelectedExercises] = useState<Set<string>>(() => new Set());

    const [muscuExercisePickerVisible, setMuscuExercisePickerVisible] = useState(false);
    const [muscuCustomExercise, setMuscuCustomExercise] = useState("");
    const [muscuSelectedExercises, setMuscuSelectedExercises] = useState<Set<string>>(() => new Set());

    const [customExoPickerVisible, setCustomExoPickerVisible] = useState(false);
    const [customExoCustomExercise, setCustomExoCustomExercise] = useState("");
    const [customExoSelectedExercises, setCustomExoSelectedExercises] = useState<Set<string>>(() => new Set());

    const headerTitle = isEditing ? "Modifier le bloc" : "Nouveau bloc";

    const blockType: TrainingBlockType = (segment.blockType as TrainingBlockType) || "vitesse";

    const blockTypeLabel = useMemo(() => {
        const opt = trainingBlockCatalog.find((item) => item.type === blockType);
        return opt?.label || blockType;
    }, [blockType]);

    const canSubmit = useMemo(() => {
        if (!title.trim()) return false;
        if (!segment?.blockType) return false;
        if ((segment.restInterval ?? 0) < 0) return false;
        if ((segment.distance ?? 0) < 0) return false;
        return true;
    }, [segment, title]);

    const openSecondsPicker = useCallback((field: keyof TrainingBlockSegment, label: string, valueSeconds?: number) => {
        const { minutes, seconds } = splitSeconds(valueSeconds ?? 0);
        setSecondsPicker({ visible: true, label, field, minutes: Math.min(minutes, 59), seconds });
    }, []);

    const closeSecondsPicker = useCallback(() => setSecondsPicker({ visible: false }), []);

    const confirmSecondsPicker = useCallback(() => {
        if (!secondsPicker.visible) return;
        const total = Math.max(0, Math.min(59, secondsPicker.minutes)) * 60 + Math.max(0, Math.min(59, secondsPicker.seconds));
        setSegment((prev) => ({ ...prev, [secondsPicker.field]: total }));
        if (secondsPicker.field === "restInterval") {
            setSegment((prev) => ({ ...prev, restUnit: "s" }));
        }
        setSecondsPicker({ visible: false });
    }, [secondsPicker]);

    const openRepetitionPicker = useCallback((field: keyof TrainingBlockSegment, label: string, currentValue?: number) => {
        setRepetitionPicker({ visible: true, label, field, value: clampRepetition(currentValue ?? 1) });
    }, []);

    const closeRepetitionPicker = useCallback(() => setRepetitionPicker({ visible: false }), []);

    const confirmRepetitionPicker = useCallback(() => {
        if (!repetitionPicker.visible) return;
        const nextValue = clampRepetition(repetitionPicker.value);
        setSegment((prev) => ({ ...prev, [repetitionPicker.field]: nextValue as any }));
        setRepetitionPicker({ visible: false });
    }, [repetitionPicker]);

    const openStartExitDistancePicker = useCallback((label: string, currentValue?: number) => {
        setStartExitDistancePicker({ visible: true, label, value: clampStartExitDistance(currentValue ?? 1) });
    }, []);

    const closeStartExitDistancePicker = useCallback(() => setStartExitDistancePicker({ visible: false }), []);

    const confirmStartExitDistancePicker = useCallback(() => {
        if (!startExitDistancePicker.visible) return;
        const nextValue = clampStartExitDistance(startExitDistancePicker.value);
        setSegment((prev) => ({ ...prev, startExitDistance: nextValue }));
        setStartExitDistancePicker({ visible: false });
    }, [startExitDistancePicker]);

    const applyBlockType = useCallback((nextType: TrainingBlockType) => {
        const defaults = buildDefaultSegment(nextType);
        setSegment((prev) => ({
            ...defaults,
            blockType: nextType,
            // keep some user-entered values when it makes sense
            distanceUnit: prev.distanceUnit || defaults.distanceUnit,
            restUnit: "s",
        }));
    }, []);

    const addPpgExercise = useCallback((raw: string) => {
        const next = normalizeExerciseName(raw);
        if (!next) return;
        setSegment((prev) => {
            const existing = Array.isArray(prev.ppgExercises) ? prev.ppgExercises : [];
            if (existing.some((item) => item.trim().toLowerCase() === next.toLowerCase())) {
                return prev;
            }
            return { ...prev, ppgExercises: [...existing, next] };
        });
    }, []);

    const addMuscuExercise = useCallback((raw: string) => {
        const next = normalizeExerciseName(raw);
        if (!next) return;
        setSegment((prev) => {
            const existing = Array.isArray((prev as any).muscuExercises) ? (prev as any).muscuExercises : [];
            if (existing.some((item: string) => item.toLowerCase() === next.toLowerCase())) return prev;
            return { ...prev, muscuExercises: [...existing, next] } as any;
        });
    }, []);

    const removeMuscuExercise = useCallback((name: string) => {
        setSegment((prev) => {
            const existing = Array.isArray((prev as any).muscuExercises) ? (prev as any).muscuExercises : [];
            return { ...prev, muscuExercises: existing.filter((item: string) => item !== name) } as any;
        });
    }, []);

    const isMuscuExerciseSelected = useCallback(
        (name: string) => {
            const normalized = normalizeExerciseName(name);
            for (const item of muscuSelectedExercises) {
                if (item.toLowerCase() === normalized.toLowerCase()) return true;
            }
            return false;
        },
        [muscuSelectedExercises]
    );

    const toggleMuscuSelectedExercise = useCallback((name: string) => {
        const normalized = normalizeExerciseName(name);
        if (!normalized) return;
        setMuscuSelectedExercises((prev) => {
            const copy = new Set(prev);
            let existingMatch: string | undefined;
            for (const item of copy) {
                if (item.toLowerCase() === normalized.toLowerCase()) {
                    existingMatch = item;
                    break;
                }
            }
            if (existingMatch) {
                copy.delete(existingMatch);
            } else {
                copy.add(normalized);
            }
            return copy;
        });
    }, []);

    const closeMuscuExercisePicker = useCallback(() => {
        setMuscuExercisePickerVisible(false);
        setMuscuCustomExercise("");
        setMuscuSelectedExercises(new Set());
    }, []);

    const togglePpgSelectedExercise = useCallback((raw: string) => {
        const next = normalizeExerciseName(raw);
        if (!next) return;
        setPpgSelectedExercises((prev) => {
            const copy = new Set(prev);
            if (copy.has(next)) {
                copy.delete(next);
            } else {
                copy.add(next);
            }
            return copy;
        });
    }, []);

    const closePpgExercisePicker = useCallback(() => {
        setPpgExercisePickerVisible(false);
        setPpgCustomExercise("");
        setPpgSelectedExercises(new Set());
    }, []);

    const isPpgExerciseSelected = useCallback(
        (raw: string) => {
            const needle = normalizeExerciseName(raw).toLowerCase();
            for (const item of ppgSelectedExercises) {
                if (item.toLowerCase() === needle) return true;
            }
            return false;
        },
        [ppgSelectedExercises],
    );

    const removePpgExercise = useCallback((name: string) => {
        setSegment((prev) => {
            const existing = Array.isArray(prev.ppgExercises) ? prev.ppgExercises : [];
            return { ...prev, ppgExercises: existing.filter((item) => item !== name) };
        });
    }, []);

    const addCustomExo = useCallback((raw: string) => {
        const next = normalizeExerciseName(raw);
        if (!next) return;
        setSegment((prev) => {
            const existing = Array.isArray(prev.customExercises) ? prev.customExercises : [];
            if (existing.some((item) => item.trim().toLowerCase() === next.toLowerCase())) {
                return prev;
            }
            return { ...prev, customExercises: [...existing, next] };
        });
    }, []);

    const removeCustomExo = useCallback((name: string) => {
        setSegment((prev) => {
            const existing = Array.isArray(prev.customExercises) ? prev.customExercises : [];
            return { ...prev, customExercises: existing.filter((item) => item !== name) };
        });
    }, []);

    const toggleCustomExoSelected = useCallback((raw: string) => {
        const next = normalizeExerciseName(raw);
        if (!next) return;
        setCustomExoSelectedExercises((prev) => {
            const copy = new Set(prev);
            let existingMatch: string | undefined;
            for (const item of copy) {
                if (item.toLowerCase() === next.toLowerCase()) {
                    existingMatch = item;
                    break;
                }
            }
            if (existingMatch) {
                copy.delete(existingMatch);
                return copy;
            }
            copy.add(next);
            return copy;
        });
    }, []);

    const isCustomExoSelected = useCallback(
        (raw: string) => {
            const needle = normalizeExerciseName(raw).toLowerCase();
            for (const item of customExoSelectedExercises) {
                if (item.toLowerCase() === needle) return true;
            }
            return false;
        },
        [customExoSelectedExercises],
    );

    const closeCustomExoPicker = useCallback(() => {
        setCustomExoPickerVisible(false);
        setCustomExoCustomExercise("");
        setCustomExoSelectedExercises(new Set());
    }, []);

    const loadExisting = useCallback(async () => {
        if (!blockId) return;
        setPrefillLoading(true);
        try {
            const block = await getTrainingBlock(blockId);
            setIsDefaultBlock(Boolean((block as any)?.isDefault));
            setTitle(block.title || "");
            setSegment(block.segment || buildDefaultSegment("vitesse"));
        } catch (error) {
            console.error("Erreur chargement bloc:", error);
            Alert.alert("Erreur", "Impossible de charger ce bloc.");
        } finally {
            setPrefillLoading(false);
        }
    }, [blockId]);

    useEffect(() => {
        loadExisting();
    }, [loadExisting]);

    const handleSave = useCallback(async () => {
        if (!canSubmit) return;
        setLoading(true);
        try {
            // Default blocks are read-only server-side (403 on PUT). When editing a default block,
            // create a personal copy on save.
            if (isEditing && blockId) {
                if (isDefaultBlock) {
                    const created = await createTrainingBlock({ title: title.trim(), segment });
                    if (returnKey) {
                        setNavigationResult(returnKey, { block: created, serieId: returnSerieId });
                    } else {
                        router.replace(`/(main)/training/blocks/edit/${created.id}`);
                        return;
                    }
                } else {
                    await updateTrainingBlock(blockId, { title: title.trim(), segment });
                }
            } else {
                const created = await createTrainingBlock({ title: title.trim(), segment });
                if (returnKey) {
                    setNavigationResult(returnKey, { block: created, serieId: returnSerieId });
                }
            }
            if (router.canGoBack?.()) {
                router.back();
            } else {
                router.replace("/(main)/training/blocks");
            }
        } catch (error) {
            console.error("Erreur sauvegarde bloc:", error);
            const apiMessage = (error as any)?.response?.data?.message;
            const fallbackMessage = (error as any)?.message;
            Alert.alert(
                "Erreur",
                typeof apiMessage === "string" && apiMessage.trim()
                    ? apiMessage
                    : typeof fallbackMessage === "string" && fallbackMessage.trim()
                        ? fallbackMessage
                        : "Impossible d'enregistrer le bloc.",
            );
        } finally {
            setLoading(false);
        }
    }, [blockId, canSubmit, isDefaultBlock, isEditing, returnKey, returnSerieId, router, segment, title]);

    const handleDelete = useCallback(async () => {
        if (!blockId) return;
        Alert.alert("Supprimer", "Supprimer ce bloc ?", [
            { text: "Annuler", style: "cancel" },
            {
                text: "Supprimer",
                style: "destructive",
                onPress: async () => {
                    setLoading(true);
                    try {
                        await deleteTrainingBlock(blockId);
                        if (router.canGoBack?.()) {
                            router.back();
                        } else {
                            router.replace("/(main)/training/blocks");
                        }
                    } catch (error) {
                        console.error("Erreur suppression bloc:", error);
                        Alert.alert("Erreur", "Impossible de supprimer ce bloc.");
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    }, [blockId, router]);

    const contentPaddingBottom = Math.max(insets.bottom, 0) + 24;

    return (
        <SafeAreaView style={styles.safe} edges={["left", "right"]}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[styles.container, { paddingBottom: contentPaddingBottom }]}
                >
                    <Text style={styles.header}>{headerTitle}</Text>

                    {prefillLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator />
                        </View>
                    ) : null}

                    <TextInput
                        mode="outlined"
                        style={styles.input}
                        textColor="#f8fafc"
                        value={title}
                        onChangeText={setTitle}
                        label="Nom du bloc"
                        placeholder="Ex: 6×200m VMA"
                        placeholderTextColor="#64748b"
                    />

                    {blockType === "cotes" ? (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.sectionLabel}>Format</Text>
                            <View style={styles.chipRow}>
                                {[
                                    { label: "Distance", value: "distance" },
                                    { label: "Durée", value: "duration" },
                                ].map((option) => {
                                    const active = (segment.cotesMode || "distance") === option.value;
                                    return (
                                        <Pressable
                                            key={option.value}
                                            style={[styles.chip, active && styles.chipActive]}
                                            onPress={() =>
                                                setSegment((prev) => {
                                                    const nextMode = option.value as any;
                                                    if (nextMode === "duration") {
                                                        return { ...prev, cotesMode: nextMode, distance: 0, distanceUnit: "m" };
                                                    }
                                                    return { ...prev, cotesMode: nextMode };
                                                })
                                            }
                                        >
                                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>
                    ) : null}

                    <Text style={styles.sectionLabel}>Type</Text>
                    <Pressable style={styles.dropdown} onPress={() => setTypePickerVisible(true)} accessibilityRole="button">
                        <Text style={styles.dropdownValue}>{blockTypeLabel}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color="#94a3b8" />
                    </Pressable>

                    {blockType !== "ppg" && blockType !== "muscu" && blockType !== "start" && blockType !== "recup" && blockType !== "custom" ? (
                        <>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    {blockType === "cotes" && (segment.cotesMode || "distance") === "duration" ? (
                                        <>
                                            <Text style={styles.sectionLabel}>Temps cible (mm:ss)</Text>
                                            <Pressable
                                                style={styles.pickerTrigger}
                                                onPress={() => openSecondsPicker("durationSeconds", "Temps cible", segment.durationSeconds)}
                                                accessibilityRole="button"
                                            >
                                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.durationSeconds)}</Text>
                                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                            </Pressable>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.sectionLabel}>Distance (m)</Text>
                                            <TextInput
                                                mode="outlined"
                                                style={styles.input}
                                                textColor="#f8fafc"
                                                keyboardType="numeric"
                                                value={String(segment.distance ?? 0)}
                                                onChangeText={(txt) => {
                                                    const numeric = Number((txt || "").replace(/[^0-9]/g, ""));
                                                    setSegment((prev) => ({ ...prev, distance: Number.isFinite(numeric) ? numeric : 0 }));
                                                }}
                                            />
                                        </>
                                    )}
                                </View>
                                <View style={{ width: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sectionLabel}>Répétitions</Text>
                                    <Pressable
                                        style={styles.pickerTrigger}
                                        onPress={() => openRepetitionPicker("repetitions", "Répétitions", segment.repetitions)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.pickerValue}>{formatRepetitionLabel(segment.repetitions)}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                    </Pressable>
                                </View>
                            </View>

                            <Text style={styles.sectionLabel}>Récup (mm:ss)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openSecondsPicker("restInterval", "Récup", segment.restInterval)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.restInterval)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>
                        </>
                    ) : null}

                    {blockType === "ppg" ? (
                        <View style={{ marginTop: 8, gap: 10 }}>
                            <View>
                                <Text style={styles.sectionLabel}>Mode</Text>
                                <View style={styles.chipRow}>
                                    {[
                                        { label: "Au temps", value: "time" as const },
                                        { label: "Répétitions", value: "reps" as const },
                                    ].map((option) => {
                                        const active = (segment.ppgMode || "time") === option.value;
                                        return (
                                            <Pressable
                                                key={option.value}
                                                style={[styles.chip, active && styles.chipActive]}
                                                onPress={() =>
                                                    setSegment((prev) => ({
                                                        ...prev,
                                                        ppgMode: option.value,
                                                        ppgRepetitions:
                                                            option.value === "reps" ? Math.max(1, Number(prev.ppgRepetitions || 10)) : prev.ppgRepetitions,
                                                    }))
                                                }
                                            >
                                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            <View>
                                <Text style={styles.sectionLabel}>Exercices</Text>
                                {Array.isArray(segment.ppgExercises) && segment.ppgExercises.length ? (
                                    <View style={[styles.chipRow, { marginTop: 6 }]}>
                                        {segment.ppgExercises.map((exo) => (
                                            <Pressable
                                                key={exo}
                                                style={[styles.chip, { flexDirection: "row", alignItems: "center", gap: 8 }]}
                                                onPress={() => removePpgExercise(exo)}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Supprimer ${exo}`}
                                            >
                                                <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
                                                    {exo}
                                                </Text>
                                                <MaterialCommunityIcons name="close" size={16} color="#94a3b8" />
                                            </Pressable>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={{ color: "#94a3b8", marginTop: 6 }}>Ajoute des exercices pour composer ton circuit.</Text>
                                )}
                                <Button
                                    mode="outlined"
                                    onPress={() => {
                                        const existing = Array.isArray(segment.ppgExercises) ? segment.ppgExercises : [];
                                        setPpgSelectedExercises(new Set(existing.map((value) => normalizeExerciseName(value)).filter(Boolean)));
                                        setPpgExercisePickerVisible(true);
                                    }}
                                    textColor="#38bdf8"
                                    style={{ marginTop: 10, borderColor: "rgba(56,189,248,0.4)" }}
                                >
                                    Ajouter des exos
                                </Button>
                            </View>

                            {(segment.ppgMode || "time") === "reps" ? (
                                <>
                                    <Text style={styles.sectionLabel}>Répétitions par exo</Text>
                                    <Pressable
                                        style={styles.pickerTrigger}
                                        onPress={() =>
                                            openRepetitionPicker("ppgRepetitions", "Répétitions par exo", segment.ppgRepetitions)
                                        }
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.pickerValue}>{formatRepetitionLabel(segment.ppgRepetitions)}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                    </Pressable>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.sectionLabel}>Durée par exo (mm:ss)</Text>
                                    <Pressable
                                        style={styles.pickerTrigger}
                                        onPress={() => openSecondsPicker("ppgDurationSeconds", "Durée par exo", segment.ppgDurationSeconds)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.pickerValue}>{formatSecondsLabel(segment.ppgDurationSeconds)}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                    </Pressable>
                                </>
                            )}

                            <Text style={styles.sectionLabel}>Récup exos (mm:ss)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openSecondsPicker("ppgRestSeconds", "Récup exos", segment.ppgRestSeconds)}
                            >
                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.ppgRestSeconds)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>
                        </View>
                    ) : null}

                    {blockType === "muscu" ? (
                        <View style={{ marginTop: 8, gap: 10 }}>
                            <View>
                                <Text style={styles.sectionLabel}>Exercices</Text>
                                {Array.isArray((segment as any).muscuExercises) && (segment as any).muscuExercises.length ? (
                                    <View style={[styles.chipRow, { marginTop: 6 }]}>
                                        {(segment as any).muscuExercises.map((exo: string) => (
                                            <Pressable
                                                key={exo}
                                                style={[styles.chip, { flexDirection: "row", alignItems: "center", gap: 8 }]}
                                                onPress={() => removeMuscuExercise(exo)}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Supprimer ${exo}`}
                                            >
                                                <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
                                                    {exo}
                                                </Text>
                                                <MaterialCommunityIcons name="close" size={16} color="#94a3b8" />
                                            </Pressable>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={{ color: "#94a3b8", marginTop: 6 }}>Ajoute des exercices de musculation.</Text>
                                )}
                                <Button
                                    mode="outlined"
                                    onPress={() => {
                                        const existing = Array.isArray((segment as any).muscuExercises) ? (segment as any).muscuExercises : [];
                                        setMuscuSelectedExercises(new Set(existing.map((value: string) => normalizeExerciseName(value)).filter(Boolean)));
                                        setMuscuExercisePickerVisible(true);
                                    }}
                                    textColor="#38bdf8"
                                    style={{ marginTop: 10, borderColor: "rgba(56,189,248,0.4)" }}
                                >
                                    Ajouter des exos
                                </Button>
                            </View>

                            <Text style={styles.sectionLabel}>Répétitions par exo</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openRepetitionPicker("muscuRepetitions" as any, "Répétitions par exo", (segment as any).muscuRepetitions)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatRepetitionLabel((segment as any).muscuRepetitions)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>
                        </View>
                    ) : null}

                    {blockType === "recup" ? (
                        <View style={{ marginTop: 8 }}>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sectionLabel}>Mode de récup</Text>
                                    <Pressable
                                        style={styles.dropdown}
                                        onPress={() => setRecoveryModePickerVisible(true)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.dropdownValue}>
                                            {RECOVERY_MODE_OPTIONS.find((opt) => opt.value === segment.recoveryMode)?.label || "Choisir"}
                                        </Text>
                                        <MaterialCommunityIcons name="chevron-down" size={20} color="#94a3b8" />
                                    </Pressable>
                                </View>
                                <View style={{ width: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sectionLabel}>Répétitions</Text>
                                    <Pressable
                                        style={styles.pickerTrigger}
                                        onPress={() => openRepetitionPicker("repetitions", "Répétitions", segment.repetitions)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.pickerValue}>{formatRepetitionLabel(segment.repetitions)}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                    </Pressable>
                                </View>
                            </View>

                            <Text style={styles.sectionLabel}>Temps d’effort (mm:ss)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openSecondsPicker("durationSeconds", "Temps d’effort", segment.durationSeconds)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.durationSeconds)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>

                            <Text style={styles.sectionLabel}>Temps de récup (mm:ss)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openSecondsPicker("recoveryDurationSeconds", "Temps de récup", segment.recoveryDurationSeconds)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.recoveryDurationSeconds)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>
                        </View>
                    ) : null}

                    {blockType === "start" ? (
                        <View style={{ marginTop: 8 }}>
                            <Text style={styles.sectionLabel}>Nombre de départs</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openRepetitionPicker("startCount", "Départs", segment.startCount)}
                            >
                                <Text style={styles.pickerValue}>{formatRepetitionLabel(segment.startCount)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>

                            <Text style={styles.sectionLabel}>Récup (mm:ss)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openSecondsPicker("restInterval", "Récup", segment.restInterval)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.restInterval)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>

                            <Text style={styles.sectionLabel}>Sortie (sur quelle distance le départ se fait-il ?)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openStartExitDistancePicker("Sortie", segment.startExitDistance)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatStartExitDistanceLabel(segment.startExitDistance)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>
                        </View>
                    ) : null}

                    {blockType === "custom" ? (
                        <View style={{ marginTop: 10, gap: 10 }}>
                            <TextInput
                                mode="outlined"
                                style={styles.input}
                                textColor="#f8fafc"
                                value={segment.customGoal || ""}
                                onChangeText={(txt) => setSegment((prev) => ({ ...prev, customGoal: txt }))}
                                label="Objectif (texte)"
                                placeholder="Ex: technique, relâchement, posture..."
                                placeholderTextColor="#64748b"
                            />

                            <View style={styles.switchRow}>
                                <Text style={styles.sectionLabel}>Objectif métrique</Text>
                                <Switch
                                    value={Boolean(segment.customMetricEnabled)}
                                    onValueChange={(value) => setSegment((prev) => ({ ...prev, customMetricEnabled: value }))}
                                    color="#22d3ee"
                                />
                            </View>

                            {segment.customMetricEnabled ? (
                                <>
                                    <Text style={styles.sectionLabel}>Type de métrique</Text>
                                    <Pressable
                                        style={styles.dropdown}
                                        onPress={() => setCustomMetricKindPickerVisible(true)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.dropdownValue}>
                                            {CUSTOM_METRIC_OPTIONS.find((opt) => opt.value === segment.customMetricKind)?.label || "Choisir"}
                                        </Text>
                                        <MaterialCommunityIcons name="chevron-down" size={20} color="#94a3b8" />
                                    </Pressable>

                                    {segment.customMetricKind === "duration" ? (
                                        <>
                                            <Text style={styles.sectionLabel}>Durée (mm:ss)</Text>
                                            <Pressable
                                                style={styles.pickerTrigger}
                                                onPress={() =>
                                                    openSecondsPicker(
                                                        "customMetricDurationSeconds",
                                                        "Durée métrique",
                                                        segment.customMetricDurationSeconds,
                                                    )
                                                }
                                            >
                                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.customMetricDurationSeconds)}</Text>
                                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                            </Pressable>
                                        </>
                                    ) : null}

                                    {segment.customMetricKind === "reps" ? (
                                        <>
                                            <Text style={styles.sectionLabel}>Répétitions</Text>
                                            <Pressable
                                                style={styles.pickerTrigger}
                                                onPress={() =>
                                                    openRepetitionPicker(
                                                        "customMetricRepetitions",
                                                        "Répétitions métrique",
                                                        segment.customMetricRepetitions,
                                                    )
                                                }
                                            >
                                                <Text style={styles.pickerValue}>{formatRepetitionLabel(segment.customMetricRepetitions)}</Text>
                                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                                            </Pressable>
                                        </>
                                    ) : null}

                                    {segment.customMetricKind === "distance" ? (
                                        <>
                                            <Text style={styles.sectionLabel}>Distance (m)</Text>
                                            <TextInput
                                                mode="outlined"
                                                style={styles.input}
                                                textColor="#f8fafc"
                                                keyboardType="numeric"
                                                value={String(segment.customMetricDistance ?? 0)}
                                                onChangeText={(txt) => {
                                                    const numeric = Number((txt || "").replace(/[^0-9]/g, ""));
                                                    setSegment((prev) => ({
                                                        ...prev,
                                                        customMetricDistance: Number.isFinite(numeric) ? numeric : 0,
                                                    }));
                                                }}
                                            />
                                        </>
                                    ) : null}

                                    {segment.customMetricKind === "exo" ? (
                                        <View>
                                            <Text style={styles.sectionLabel}>Exercices</Text>
                                            {Array.isArray(segment.customExercises) && segment.customExercises.length ? (
                                                <View style={[styles.chipRow, { marginTop: 6 }]}>
                                                    {segment.customExercises.map((exo) => (
                                                        <Pressable
                                                            key={exo}
                                                            style={[styles.chip, { flexDirection: "row", alignItems: "center", gap: 8 }]}
                                                            onPress={() => removeCustomExo(exo)}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={`Supprimer ${exo}`}
                                                        >
                                                            <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
                                                                {exo}
                                                            </Text>
                                                            <MaterialCommunityIcons name="close" size={16} color="#94a3b8" />
                                                        </Pressable>
                                                    ))}
                                                </View>
                                            ) : (
                                                <Text style={{ color: "#94a3b8", marginTop: 6 }}>
                                                    Ajoute 1–2 exercices pour ce bloc.
                                                </Text>
                                            )}

                                            <Button
                                                mode="outlined"
                                                onPress={() => {
                                                    const existing = Array.isArray(segment.customExercises) ? segment.customExercises : [];
                                                    setCustomExoSelectedExercises(
                                                        new Set(existing.map((value) => normalizeExerciseName(value)).filter(Boolean)),
                                                    );
                                                    setCustomExoPickerVisible(true);
                                                }}
                                                textColor="#38bdf8"
                                                style={{ marginTop: 10, borderColor: "rgba(56,189,248,0.4)" }}
                                            >
                                                Ajouter un exercice
                                            </Button>
                                        </View>
                                    ) : null}
                                </>
                            ) : null}

                            <Text style={styles.sectionLabel}>Temps de récup (mm:ss)</Text>
                            <Pressable
                                style={styles.pickerTrigger}
                                onPress={() => openSecondsPicker("restInterval", "Temps de récup", segment.restInterval)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.pickerValue}>{formatSecondsLabel(segment.restInterval)}</Text>
                                <MaterialCommunityIcons name="chevron-down" size={18} color="#94a3b8" />
                            </Pressable>

                            <TextInput
                                mode="outlined"
                                style={styles.input}
                                textColor="#f8fafc"
                                value={segment.customNotes || ""}
                                onChangeText={(txt) => setSegment((prev) => ({ ...prev, customNotes: txt }))}
                                label="Notes (optionnel)"
                                placeholder="Ex: 2×/semaine, qualité > quantité"
                                placeholderTextColor="#64748b"
                                multiline
                            />
                        </View>
                    ) : null}

                    <View style={styles.footerRow}>
                        <Button
                            mode="contained"
                            onPress={handleSave}
                            disabled={!canSubmit || loading}
                            buttonColor="#22d3ee"
                            textColor="#021019"
                            style={{ flex: 1 }}
                        >
                            {loading ? "En cours..." : "Enregistrer"}
                        </Button>
                        {isEditing ? (
                            <Button
                                mode="outlined"
                                onPress={handleDelete}
                                disabled={loading}
                                textColor="#f87171"
                                style={{ borderColor: "rgba(248,113,113,0.5)" }}
                            >
                                Supprimer
                            </Button>
                        ) : null}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Type picker */}
            <Modal visible={typePickerVisible} transparent animationType="fade" onRequestClose={() => setTypePickerVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setTypePickerVisible(false)}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Type de bloc</Text>
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                            {trainingBlockCatalog
                                .filter((option) => option.type !== "custom")
                                .map((option) => {
                                    const active = option.type === blockType;
                                    return (
                                        <Pressable
                                            key={option.type}
                                            style={[styles.modalItem, active && styles.modalItemActive]}
                                            onPress={() => {
                                                applyBlockType(option.type);
                                                setTypePickerVisible(false);
                                            }}
                                        >
                                            <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{option.label}</Text>
                                        </Pressable>
                                    );
                                })}
                        </ScrollView>

                        <Text style={[styles.sectionLabel, { marginTop: 6 }]}>Personnalisation</Text>
                        <Pressable
                            style={[styles.modalItem, blockType === "custom" && styles.modalItemActive]}
                            onPress={() => {
                                applyBlockType("custom");
                                setTypePickerVisible(false);
                            }}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.modalItemText, blockType === "custom" && styles.modalItemTextActive]}>
                                Personnaliser un bloc
                            </Text>
                        </Pressable>
                        <Button mode="text" textColor="#38bdf8" onPress={() => setTypePickerVisible(false)}>
                            Fermer
                        </Button>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Seconds picker */}
            <Modal
                visible={secondsPicker.visible}
                transparent
                animationType="fade"
                onRequestClose={closeSecondsPicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closeSecondsPicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>{secondsPicker.visible ? secondsPicker.label : ""}</Text>
                        {secondsPicker.visible ? (
                            <View style={styles.timeRow}>
                                <View style={styles.timeCol}>
                                    <Text style={styles.timeLabel}>Min</Text>
                                    <ScrollView style={styles.timeWheel} contentContainerStyle={{ paddingVertical: 10 }}>
                                        {Array.from({ length: 60 }, (_, i) => i).map((m) => {
                                            const active = m === secondsPicker.minutes;
                                            return (
                                                <Pressable
                                                    key={`m-${m}`}
                                                    style={[styles.timeItem, active && styles.timeItemActive]}
                                                    onPress={() => setSecondsPicker((prev) => (prev.visible ? { ...prev, minutes: m } : prev))}
                                                >
                                                    <Text style={[styles.timeItemText, active && styles.timeItemTextActive]}>
                                                        {String(m).padStart(2, "0")}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                                <View style={styles.timeCol}>
                                    <Text style={styles.timeLabel}>Sec</Text>
                                    <ScrollView style={styles.timeWheel} contentContainerStyle={{ paddingVertical: 10 }}>
                                        {Array.from({ length: 60 }, (_, i) => i).map((s) => {
                                            const active = s === secondsPicker.seconds;
                                            return (
                                                <Pressable
                                                    key={`s-${s}`}
                                                    style={[styles.timeItem, active && styles.timeItemActive]}
                                                    onPress={() => setSecondsPicker((prev) => (prev.visible ? { ...prev, seconds: s } : prev))}
                                                >
                                                    <Text style={[styles.timeItemText, active && styles.timeItemTextActive]}>
                                                        {String(s).padStart(2, "0")}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            </View>
                        ) : null}

                        <View style={styles.modalFooter}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeSecondsPicker}>
                                Annuler
                            </Button>
                            <Button mode="contained" buttonColor="#22d3ee" textColor="#021019" onPress={confirmSecondsPicker}>
                                OK
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Repetition picker */}
            <Modal
                visible={repetitionPicker.visible}
                transparent
                animationType="fade"
                onRequestClose={closeRepetitionPicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closeRepetitionPicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>{repetitionPicker.visible ? repetitionPicker.label : ""}</Text>
                        {repetitionPicker.visible ? (
                            <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                                {REPETITION_OPTIONS.map((value) => {
                                    const active = value === repetitionPicker.value;
                                    return (
                                        <Pressable
                                            key={`rep-${value}`}
                                            style={[styles.modalItem, active && styles.modalItemActive]}
                                            onPress={() =>
                                                setRepetitionPicker((prev) => (prev.visible ? { ...prev, value } : prev))
                                            }
                                        >
                                            <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{value}</Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        ) : null}
                        <View style={styles.modalFooter}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeRepetitionPicker}>
                                Annuler
                            </Button>
                            <Button mode="contained" buttonColor="#22d3ee" textColor="#021019" onPress={confirmRepetitionPicker}>
                                OK
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Start exit distance picker */}
            <Modal
                visible={startExitDistancePicker.visible}
                transparent
                animationType="fade"
                onRequestClose={closeStartExitDistancePicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closeStartExitDistancePicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>{startExitDistancePicker.visible ? startExitDistancePicker.label : ""}</Text>
                        {startExitDistancePicker.visible ? (
                            <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                                {START_EXIT_DISTANCE_OPTIONS.map((value) => {
                                    const active = value === startExitDistancePicker.value;
                                    return (
                                        <Pressable
                                            key={`start-exit-${value}`}
                                            style={[styles.modalItem, active && styles.modalItemActive]}
                                            onPress={() =>
                                                setStartExitDistancePicker((prev) => (prev.visible ? { ...prev, value } : prev))
                                            }
                                        >
                                            <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{value} m</Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        ) : null}
                        <View style={styles.modalFooter}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeStartExitDistancePicker}>
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                buttonColor="#22d3ee"
                                textColor="#021019"
                                onPress={confirmStartExitDistancePicker}
                            >
                                OK
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Recovery mode picker */}
            <Modal
                visible={recoveryModePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setRecoveryModePickerVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setRecoveryModePickerVisible(false)}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Mode de récup</Text>
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                            {RECOVERY_MODE_OPTIONS.map((opt) => {
                                const active = opt.value === segment.recoveryMode;
                                return (
                                    <Pressable
                                        key={opt.value}
                                        style={[styles.modalItem, active && styles.modalItemActive]}
                                        onPress={() => {
                                            setSegment((prev) => ({ ...prev, recoveryMode: opt.value }));
                                            setRecoveryModePickerVisible(false);
                                        }}
                                    >
                                        <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{opt.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <Button mode="text" textColor="#38bdf8" onPress={() => setRecoveryModePickerVisible(false)}>
                            Fermer
                        </Button>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Custom metric kind picker */}
            <Modal
                visible={customMetricKindPickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setCustomMetricKindPickerVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setCustomMetricKindPickerVisible(false)}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Type de métrique</Text>
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                            {CUSTOM_METRIC_OPTIONS.map((opt) => {
                                const active = opt.value === segment.customMetricKind;
                                return (
                                    <Pressable
                                        key={opt.value}
                                        style={[styles.modalItem, active && styles.modalItemActive]}
                                        onPress={() => {
                                            setSegment((prev) => ({ ...prev, customMetricKind: opt.value }));
                                            setCustomMetricKindPickerVisible(false);
                                        }}
                                    >
                                        <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{opt.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <Button mode="text" textColor="#38bdf8" onPress={() => setCustomMetricKindPickerVisible(false)}>
                            Fermer
                        </Button>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* PPG exercise picker */}
            <Modal
                visible={ppgExercisePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={closePpgExercisePicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closePpgExercisePicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Ajouter un exercice</Text>

                        <TextInput
                            mode="outlined"
                            style={styles.input}
                            textColor="#f8fafc"
                            label="Exercice personnalisé"
                            placeholder="Ex: Medecine ball"
                            placeholderTextColor="#64748b"
                            value={ppgCustomExercise}
                            onChangeText={setPpgCustomExercise}
                        />

                        <Button
                            mode="contained"
                            buttonColor="#22d3ee"
                            textColor="#021019"
                            style={{ marginTop: 10 }}
                            onPress={() => {
                                const normalized = normalizeExerciseName(ppgCustomExercise);
                                if (!normalized) return;
                                addPpgExercise(normalized);
                                setPpgSelectedExercises((prev) => {
                                    const copy = new Set(prev);
                                    // keep it checked in this modal session
                                    // (also avoids case-sensitive duplicates)
                                    let existingMatch: string | undefined;
                                    for (const item of copy) {
                                        if (item.toLowerCase() === normalized.toLowerCase()) {
                                            existingMatch = item;
                                            break;
                                        }
                                    }
                                    if (existingMatch) copy.delete(existingMatch);
                                    copy.add(normalized);
                                    return copy;
                                });
                                setPpgCustomExercise("");
                            }}
                        >
                            Ajouter un exercice personnalisé
                        </Button>

                        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Suggestions</Text>
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                            {PPG_EXERCISE_LIBRARY.map((exo) => {
                                const selected = isPpgExerciseSelected(exo);
                                return (
                                    <Pressable
                                        key={exo}
                                        style={[styles.modalItem, selected && styles.modalItemActive]}
                                        onPress={() => togglePpgSelectedExercise(exo)}
                                        accessibilityRole="button"
                                        accessibilityLabel={selected ? `Décocher ${exo}` : `Cocher ${exo}`}
                                    >
                                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                            <Text style={[styles.modalItemText, selected && styles.modalItemTextActive]}>{exo}</Text>
                                            <MaterialCommunityIcons
                                                name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                                size={20}
                                                color={selected ? "#22d3ee" : "#94a3b8"}
                                            />
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Button mode="text" textColor="#94a3b8" onPress={closePpgExercisePicker}>
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                buttonColor="#22d3ee"
                                textColor="#021019"
                                disabled={(() => {
                                    const existing = Array.isArray(segment.ppgExercises) ? segment.ppgExercises : [];
                                    const existingLower = new Set(existing.map((value) => normalizeExerciseName(value).toLowerCase()));
                                    let newCount = 0;
                                    for (const item of ppgSelectedExercises) {
                                        if (!existingLower.has(item.toLowerCase())) newCount += 1;
                                    }
                                    return newCount === 0;
                                })()}
                                onPress={() => {
                                    const existing = Array.isArray(segment.ppgExercises) ? segment.ppgExercises : [];
                                    const existingLower = new Set(existing.map((value) => normalizeExerciseName(value).toLowerCase()));
                                    for (const exo of Array.from(ppgSelectedExercises)) {
                                        if (existingLower.has(exo.toLowerCase())) continue;
                                        addPpgExercise(exo);
                                    }
                                    closePpgExercisePicker();
                                }}
                            >
                                {(() => {
                                    const existing = Array.isArray(segment.ppgExercises) ? segment.ppgExercises : [];
                                    const existingLower = new Set(existing.map((value) => normalizeExerciseName(value).toLowerCase()));
                                    let newCount = 0;
                                    for (const item of ppgSelectedExercises) {
                                        if (!existingLower.has(item.toLowerCase())) newCount += 1;
                                    }
                                    return `Ajouter${newCount ? ` (${newCount})` : ""}`;
                                })()}
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Muscu exercise picker */}
            <Modal
                visible={muscuExercisePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={closeMuscuExercisePicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closeMuscuExercisePicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Ajouter un exercice</Text>

                        <TextInput
                            mode="outlined"
                            style={styles.input}
                            textColor="#f8fafc"
                            label="Exercice personnalisé"
                            placeholder="Ex: Développé couché"
                            placeholderTextColor="#64748b"
                            value={muscuCustomExercise}
                            onChangeText={setMuscuCustomExercise}
                        />

                        <Button
                            mode="contained"
                            buttonColor="#22d3ee"
                            textColor="#021019"
                            style={{ marginTop: 10 }}
                            onPress={() => {
                                const normalized = normalizeExerciseName(muscuCustomExercise);
                                if (!normalized) return;
                                addMuscuExercise(normalized);
                                setMuscuSelectedExercises((prev) => {
                                    const copy = new Set(prev);
                                    let existingMatch: string | undefined;
                                    for (const item of copy) {
                                        if (item.toLowerCase() === normalized.toLowerCase()) {
                                            existingMatch = item;
                                            break;
                                        }
                                    }
                                    if (existingMatch) copy.delete(existingMatch);
                                    copy.add(normalized);
                                    return copy;
                                });
                                setMuscuCustomExercise("");
                            }}
                        >
                            Ajouter un exercice personnalisé
                        </Button>

                        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Suggestions</Text>
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                            {MUSCU_EXERCISE_LIBRARY.map((exo) => {
                                const selected = isMuscuExerciseSelected(exo);
                                return (
                                    <Pressable
                                        key={exo}
                                        style={[styles.modalItem, selected && styles.modalItemActive]}
                                        onPress={() => toggleMuscuSelectedExercise(exo)}
                                        accessibilityRole="button"
                                        accessibilityLabel={selected ? `Décocher ${exo}` : `Cocher ${exo}`}
                                    >
                                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                            <Text style={[styles.modalItemText, selected && styles.modalItemTextActive]}>{exo}</Text>
                                            <MaterialCommunityIcons
                                                name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                                size={20}
                                                color={selected ? "#22d3ee" : "#94a3b8"}
                                            />
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeMuscuExercisePicker}>
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                buttonColor="#22d3ee"
                                textColor="#021019"
                                disabled={(() => {
                                    const existing = Array.isArray((segment as any).muscuExercises) ? (segment as any).muscuExercises : [];
                                    const existingLower = new Set(existing.map((value: string) => normalizeExerciseName(value).toLowerCase()));
                                    let newCount = 0;
                                    for (const item of muscuSelectedExercises) {
                                        if (!existingLower.has(item.toLowerCase())) newCount += 1;
                                    }
                                    return newCount === 0;
                                })()}
                                onPress={() => {
                                    const existing = Array.isArray((segment as any).muscuExercises) ? (segment as any).muscuExercises : [];
                                    const existingLower = new Set(existing.map((value: string) => normalizeExerciseName(value).toLowerCase()));
                                    for (const exo of Array.from(muscuSelectedExercises)) {
                                        if (existingLower.has(exo.toLowerCase())) continue;
                                        addMuscuExercise(exo);
                                    }
                                    closeMuscuExercisePicker();
                                }}
                            >
                                {(() => {
                                    const existing = Array.isArray((segment as any).muscuExercises) ? (segment as any).muscuExercises : [];
                                    const existingLower = new Set(existing.map((value: string) => normalizeExerciseName(value).toLowerCase()));
                                    let newCount = 0;
                                    for (const item of muscuSelectedExercises) {
                                        if (!existingLower.has(item.toLowerCase())) newCount += 1;
                                    }
                                    return `Ajouter${newCount ? ` (${newCount})` : ""}`;
                                })()}
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Custom (metric=exo) exercise picker */}
            <Modal
                visible={customExoPickerVisible}
                transparent
                animationType="fade"
                onRequestClose={closeCustomExoPicker}
            >
                <Pressable style={styles.modalOverlay} onPress={closeCustomExoPicker}>
                    <Pressable style={styles.modalCard} onPress={() => { }}>
                        <Text style={styles.modalTitle}>Ajouter un exercice</Text>

                        <TextInput
                            mode="outlined"
                            style={styles.input}
                            textColor="#f8fafc"
                            label="Exercice personnalisé"
                            placeholder="Ex: Travail de pied"
                            placeholderTextColor="#64748b"
                            value={customExoCustomExercise}
                            onChangeText={setCustomExoCustomExercise}
                        />

                        <Button
                            mode="contained"
                            buttonColor="#22d3ee"
                            textColor="#021019"
                            style={{ marginTop: 10 }}
                            onPress={() => {
                                const normalized = normalizeExerciseName(customExoCustomExercise);
                                if (!normalized) return;
                                addCustomExo(normalized);
                                setCustomExoSelectedExercises((prev) => {
                                    const copy = new Set(prev);
                                    let existingMatch: string | undefined;
                                    for (const item of copy) {
                                        if (item.toLowerCase() === normalized.toLowerCase()) {
                                            existingMatch = item;
                                            break;
                                        }
                                    }
                                    if (existingMatch) copy.delete(existingMatch);
                                    copy.add(normalized);
                                    return copy;
                                });
                                setCustomExoCustomExercise("");
                            }}
                        >
                            Ajouter un exercice personnalisé
                        </Button>

                        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Suggestions</Text>
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
                            {CUSTOM_EXO_SUGGESTIONS.map((section) => (
                                <View key={section.discipline}>
                                    <Text style={[styles.sectionLabel, { marginTop: 10 }]}>{section.discipline}</Text>
                                    {section.exercises.map((exo) => {
                                        const selected = isCustomExoSelected(exo);
                                        return (
                                            <Pressable
                                                key={`${section.discipline}-${exo}`}
                                                style={[styles.modalItem, selected && styles.modalItemActive]}
                                                onPress={() => toggleCustomExoSelected(exo)}
                                                accessibilityRole="button"
                                                accessibilityLabel={selected ? `Décocher ${exo}` : `Cocher ${exo}`}
                                            >
                                                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                                    <Text style={[styles.modalItemText, selected && styles.modalItemTextActive]}>{exo}</Text>
                                                    <MaterialCommunityIcons
                                                        name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                                        size={20}
                                                        color={selected ? "#22d3ee" : "#94a3b8"}
                                                    />
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ))}
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Button mode="text" textColor="#94a3b8" onPress={closeCustomExoPicker}>
                                Annuler
                            </Button>
                            <Button
                                mode="contained"
                                buttonColor="#22d3ee"
                                textColor="#021019"
                                disabled={(() => {
                                    const existing = Array.isArray(segment.customExercises) ? segment.customExercises : [];
                                    const existingLower = new Set(existing.map((value) => normalizeExerciseName(value).toLowerCase()));
                                    let newCount = 0;
                                    for (const item of customExoSelectedExercises) {
                                        if (!existingLower.has(item.toLowerCase())) newCount += 1;
                                    }
                                    return newCount === 0;
                                })()}
                                onPress={() => {
                                    const existing = Array.isArray(segment.customExercises) ? segment.customExercises : [];
                                    const existingLower = new Set(existing.map((value) => normalizeExerciseName(value).toLowerCase()));
                                    for (const exo of Array.from(customExoSelectedExercises)) {
                                        if (existingLower.has(exo.toLowerCase())) continue;
                                        addCustomExo(exo);
                                    }
                                    closeCustomExoPicker();
                                }}
                            >
                                {(() => {
                                    const existing = Array.isArray(segment.customExercises) ? segment.customExercises : [];
                                    const existingLower = new Set(existing.map((value) => normalizeExerciseName(value).toLowerCase()));
                                    let newCount = 0;
                                    for (const item of customExoSelectedExercises) {
                                        if (!existingLower.has(item.toLowerCase())) newCount += 1;
                                    }
                                    return `Ajouter${newCount ? ` (${newCount})` : ""}`;
                                })()}
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: "#020617",
    },
    scroll: {
        flex: 1,
        backgroundColor: "#020617",
    },
    container: {
        padding: 14,
        gap: 10,
    },
    header: {
        fontSize: 22,
        fontWeight: "700",
        color: "#f8fafc",
        marginBottom: 4,
    },
    input: {
        backgroundColor: "rgba(15,23,42,0.75)",
    },
    sectionLabel: {
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: "700",
        marginTop: 6,
    },
    dropdown: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(15,23,42,0.75)",
    },
    dropdownValue: {
        color: "#f8fafc",
        fontWeight: "700",
    },
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    pickerTrigger: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(15,23,42,0.75)",
        marginTop: 6,
    },
    pickerValue: {
        color: "#f8fafc",
        fontWeight: "700",
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginTop: 8,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.4)",
        backgroundColor: "rgba(2,6,23,0.35)",
        maxWidth: "100%",
    },
    chipActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    chipText: {
        color: "#cbd5e1",
        fontWeight: "700",
    },
    chipTextActive: {
        color: "#22d3ee",
    },
    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    footerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 8,
    },
    center: {
        paddingVertical: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    modalCard: {
        width: "100%",
        maxWidth: 420,
        maxHeight: "80%",
        backgroundColor: "#0b1220",
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    modalTitle: {
        color: "#f8fafc",
        fontWeight: "800",
        fontSize: 16,
        marginBottom: 10,
    },
    modalScroll: {
        maxHeight: 360,
    },
    modalItem: {
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(15,23,42,0.55)",
        marginBottom: 8,
    },
    modalItemActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    modalItemText: {
        color: "#e2e8f0",
        fontWeight: "700",
    },
    modalItemTextActive: {
        color: "#22d3ee",
    },
    modalFooter: {
        marginTop: 10,
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 10,
    },
    timeRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 6,
    },
    timeCol: {
        flex: 1,
        gap: 6,
    },
    timeLabel: {
        color: "#94a3b8",
        fontWeight: "800",
        fontSize: 12,
    },
    timeWheel: {
        maxHeight: 260,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    timeItem: {
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    timeItemActive: {
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    timeItemText: {
        color: "#e2e8f0",
        fontSize: 16,
        fontWeight: "700",
    },
    timeItemTextActive: {
        color: "#22d3ee",
    },
});
