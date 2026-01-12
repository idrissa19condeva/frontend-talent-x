import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Avatar, Button, Dialog, Portal, Switch, Text, TextInput } from "react-native-paper";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

import {
    PACE_REFERENCE_LABELS,
    isDistanceReference,
    isLoadReference,
    LoadPaceReferenceValue,
    PaceReferenceValue,
} from "../../constants/paceReferences";
import { useTrainingSession } from "../../hooks/useTrainingSession";
import { useTraining } from "../../context/TrainingContext";
import { useAuth } from "../../context/AuthContext";
import { computeSegmentPacePreview, PaceComputationProfile } from "../../utils/paceTargets";
import {
    ParticipantStatus,
    ParticipantUserRef,
    TrainingBlockType,
    TrainingChronoEntry,
    TrainingChronoInput,
    TrainingSeries,
    TrainingSeriesSegment,
    TrainingStatus,
} from "../../types/training";
import { User } from "../../types/User";
import {
    formatDurationLabel,
    getSegmentPlannedDistanceMeters,
    getSegmentPlannedRepetitions,
} from "../../utils/trainingFormatter";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { searchUsers, updateUserProfile, UserSearchResult } from "../../api/userService";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type PaceWarningPromptState = {
    reference: PaceReferenceValue;
    label: string;
    mode: "distance" | "load";
};

const UI_COLORS = {
    background: "#010617",
    surface: "rgba(2,6,23,0.92)",
    surfaceMuted: "rgba(4,9,24,0.9)",
    surfaceChip: "rgba(15,23,42,0.7)",
    border: "rgba(148,163,184,0.22)",
    borderStrong: "rgba(148,163,184,0.32)",
    text: "#f8fafc",
    textMuted: "#94a3b8",
    accent: "#22d3ee",
    danger: "#f87171",
} as const;

const formatDisplayDate = (value?: string) => {
    if (!value) return "Date non définie";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? value
        : parsed.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
};

const formatStatusLabel = (status?: string) => {
    switch (status) {
        case "planned":
            return "Planifiée";
        case "ongoing":
            return "En cours";
        case "canceled":
            return "Annulée";
        case "done":
            return "Terminée";
        case "postponed":
            return "Reportée";
        default:
            return status || "—";
    }
};

const STATUS_VISUALS: Record<
    string,
    { icon: MaterialIconName; color: string }
> = {
    planned: { icon: "calendar-check", color: UI_COLORS.accent },
    ongoing: { icon: "progress-clock", color: UI_COLORS.accent },
    done: { icon: "check-circle-outline", color: UI_COLORS.textMuted },
    canceled: { icon: "close-octagon", color: UI_COLORS.danger },
    postponed: { icon: "calendar-clock", color: UI_COLORS.textMuted },
};

const resolveStatusVisual = (status?: string) => STATUS_VISUALS[status || ""] || STATUS_VISUALS.planned;

const formatDistanceDisplay = (distance?: number, unit?: string) => {
    if (!distance) return "—";
    // Toujours afficher l'unité en 'm' minuscule
    return `${distance}m`;
};

const formatReferenceLabel = (value?: TrainingSeries["paceReferenceDistance"]) => {
    if (!value) return null;
    return PACE_REFERENCE_LABELS[value] ?? value;
};

const formatRestDisplay = (interval?: number, unit?: string) => {
    if (!interval && interval !== 0) return "—";
    if (unit === "min") {
        return `${interval} min`;
    }
    const minutes = Math.floor((interval ?? 0) / 60);
    const seconds = (interval ?? 0) % 60;
    if (minutes === 0) {
        return `${seconds}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

const formatVolumeLabel = (meters: number) => {
    if (meters >= 1000) {
        const kmValue = meters / 1000;
        return `${kmValue.toFixed(kmValue >= 10 ? 1 : 2)} km`;
    }
    return `${Math.round(meters)} m`;
};

const BLOCK_TYPE_LABELS: Record<TrainingBlockType, string> = {
    vitesse: "Vitesse",
    cotes: "Côtes",
    ppg: "PPG",
    start: "Départs",
    muscu: "Muscu",
    recup: "Récupération",
    custom: "Bloc personnalisé",
};

const NON_DISTANCE_BLOCK_TYPES: TrainingBlockType[] = ["ppg", "muscu", "start", "recup"];

const isDistanceDrivenSegment = (segment: TrainingSeriesSegment, blockType: TrainingBlockType) => {
    if (blockType === "cotes" && segment.cotesMode === "duration") {
        return false;
    }
    return !NON_DISTANCE_BLOCK_TYPES.includes(blockType);
};

const resolveBlockType = (segment?: TrainingSeriesSegment): TrainingBlockType => {
    if (!segment || !segment.blockType) {
        return "vitesse";
    }
    const type = segment.blockType as TrainingBlockType;
    return BLOCK_TYPE_LABELS[type] ? type : "vitesse";
};

const getSegmentBlockLabel = (segment: TrainingSeriesSegment): string => {
    const type = resolveBlockType(segment);
    return segment.blockName?.trim() || BLOCK_TYPE_LABELS[type] || BLOCK_TYPE_LABELS.vitesse;
};

const formatCustomMetricChip = (segment: TrainingSeriesSegment): string | null => {
    if (!segment.customMetricEnabled) {
        return null;
    }
    if (segment.customMetricKind === "duration") {
        return `Repère durée ${formatRestDisplay(segment.customMetricDurationSeconds, "s")}`;
    }
    if (segment.customMetricKind === "exo") {
        const exercises = Array.isArray(segment.customExercises)
            ? segment.customExercises.filter((exercise) => Boolean(exercise && exercise.trim()))
            : [];
        const count = exercises.length;
        if (!count) {
            return "Repère exercices";
        }
        const suffix = count > 1 ? "s" : "";
        return `${count} exercice${suffix}`;
    }
    if (segment.customMetricKind === "reps") {
        const reps = segment.customMetricRepetitions ?? 0;
        if (!reps) {
            return "Objectif répétitions";
        }
        return `Objectif ${reps} rép`;
    }
    return `Repère distance ${formatDistanceDisplay(segment.customMetricDistance, segment.distanceUnit)}`;
};

const formatOptionalRepetitions = (value?: number) => {
    if (!value) {
        return null;
    }
    const suffix = value > 1 ? "s" : "";
    return `${value} répétition${suffix}`;
};

const formatRecoveryModeLabel = (value?: string) => {
    switch (value) {
        case "marche":
            return "Marche";
        case "footing":
            return "Footing";
        case "passive":
            return "Passive";
        case "active":
            return "Active";
        default:
            return value || "—";
    }
};

const normalizeExercises = (value?: string[]) => {
    return Array.isArray(value) ? value.map((item) => (item || "").trim()).filter(Boolean) : [];
};

const toParticipantRef = (value?: ParticipantUserRef | string): ParticipantUserRef | null => {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        return { id: value };
    }
    return value;
};

const getUserIdFromRef = (value?: ParticipantUserRef | string | null) => {
    if (!value) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    return value.id || value._id;
};

const buildFallbackLabel = (id?: string) => {
    if (!id) {
        return "Athlète";
    }
    return `#${id.slice(-4)}`;
};

const getParticipantDisplayName = (value?: ParticipantUserRef | string | null) => {
    if (!value) {
        return "Athlète";
    }
    if (typeof value === "string") {
        return buildFallbackLabel(value);
    }
    return value.fullName?.trim() || value.username?.trim() || buildFallbackLabel(value.id || value._id);
};

// Keep variety for participant differentiation, but within a single hue family.
const PARTICIPANT_COLORS = ["#22d3ee", "#38bdf8", "#0ea5e9", "#7dd3fc", "#0284c7"];

const getParticipantColor = (seed?: string) => {
    if (!seed) {
        return PARTICIPANT_COLORS[0];
    }
    const index = seed
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % PARTICIPANT_COLORS.length;
    return PARTICIPANT_COLORS[index];
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? "";

const resolveProfilePhoto = (value?: string | null): string | undefined => {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    if (!API_BASE_URL) {
        return undefined;
    }
    const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${API_BASE_URL}${normalized}`;
};

const getInitialsFromLabel = (label?: string) => {
    if (!label) {
        return "?";
    }
    const parts = label
        .split(" ")
        .filter(Boolean)
        .slice(0, 2);
    if (!parts.length) {
        return label.slice(0, 2).toUpperCase();
    }
    const initials = parts.map((part) => part[0]?.toUpperCase() || "").join("");
    return initials || label.slice(0, 2).toUpperCase();
};

const getProfilePhotoUri = (value?: string | null) => resolveProfilePhoto(value);

const normalizeParticipantStatus = (status?: ParticipantStatus): ParticipantStatus =>
    status === "pending" ? "pending" : "confirmed";

const formatParticipantStatusLabel = (status: ParticipantStatus) =>
    status === "pending" ? "Invitation" : "Confirmée";

const isSessionStatusLocked = (status?: TrainingStatus) => status === "done" || status === "canceled";

type DistanceBlockDescriptor = {
    key: string;
    seriesId: string;
    seriesIndex: number;
    repeatIndex: number;
    segmentId: string;
    segmentIndex: number;
    repetitionIndex: number;
    distance?: number;
    distanceLabel: string;
    blockName: string;
    serieLabel: string;
};

const buildChronoKey = (params: {
    seriesId?: string;
    seriesIndex?: number;
    repeatIndex?: number;
    segmentId?: string;
    segmentIndex?: number;
    repetitionIndex?: number;
}) => {
    const serie = params.seriesId || `serie-${params.seriesIndex ?? 0}`;
    const segment = params.segmentId || `segment-${params.segmentIndex ?? 0}`;
    const repeat = params.repeatIndex ?? 0;
    const repetition = params.repetitionIndex ?? 0;
    return `${serie}::${repeat}::${segment}::${repetition}`;
};

export default function TrainingSessionDetailScreen() {
    const params = useLocalSearchParams<{ id?: string | string[] }>();
    const sessionId = Array.isArray(params.id) ? params.id[0] : params.id || "";
    const router = useRouter();
    const pathname = usePathname();
    const isFocused = useIsFocused();
    const { session, loading, error, refresh } = useTrainingSession(sessionId);
    const {
        deleteSession: deleteSessionFromContext,
        joinSession: joinSessionFromContext,
        leaveSession: leaveSessionFromContext,
        addParticipantToSession: addParticipantToSessionFromContext,
        removeParticipantFromSession: removeParticipantFromSessionFromContext,
        saveSessionChronos: saveSessionChronosFromContext,
    } = useTraining();
    const { user, setUser } = useAuth();
    const currentUserId = user?.id || user?._id;
    const paceProfile = useMemo<PaceComputationProfile>(
        () => ({
            records: user?.records ?? undefined,
            performances: user?.performances ?? undefined,
            bodyWeightKg: user?.bodyWeightKg ?? undefined,
            maxMuscuKg: user?.maxMuscuKg ?? undefined,
            maxChariotKg: user?.maxChariotKg ?? undefined,
        }),
        [user?.records, user?.performances, user?.bodyWeightKg, user?.maxMuscuKg, user?.maxChariotKg],
    );
    const getSegmentPacePreview = useCallback(
        (serie: TrainingSeries, segment: TrainingSeriesSegment) => computeSegmentPacePreview(serie, segment, paceProfile),
        [paceProfile],
    );
    const hasRecordForReference = useCallback(
        (reference: PaceReferenceValue) => {
            const declaredRecord = paceProfile.records?.[reference]?.trim();
            if (declaredRecord) {
                return true;
            }
            return (
                paceProfile.performances?.some(
                    (performance) =>
                        performance?.epreuve?.toLowerCase() === reference.toLowerCase() &&
                        Boolean(performance?.record?.trim()),
                ) ?? false
            );
        },
        [paceProfile.performances, paceProfile.records],
    );
    const getProfileLoadValue = useCallback(
        (reference: LoadPaceReferenceValue) => {
            switch (reference) {
                case "bodyweight":
                    return paceProfile.bodyWeightKg;
                case "max-muscu":
                    return paceProfile.maxMuscuKg;
                case "max-chariot":
                    return paceProfile.maxChariotKg;
                default:
                    return undefined;
            }
        },
        [paceProfile.bodyWeightKg, paceProfile.maxChariotKg, paceProfile.maxMuscuKg],
    );

    const [recapExpanded, setRecapExpanded] = useState(false);
    const [flowExpanded, setFlowExpanded] = useState(false);
    const [participantsExpanded, setParticipantsExpanded] = useState(false);
    const [coachNotesExpanded, setCoachNotesExpanded] = useState(false);
    const [athleteFeedbackExpanded, setAthleteFeedbackExpanded] = useState(false);
    const [expandedSeriesKeys, setExpandedSeriesKeys] = useState<Set<string>>(() => new Set());

    const getSeriesKey = useCallback((serie: TrainingSeries, index: number) => {
        return serie.id ? `id:${serie.id}` : `idx:${index}`;
    }, []);

    const toggleSeriesExpanded = useCallback(
        (key: string) => {
            setExpandedSeriesKeys((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                }
                return next;
            });
        },
        [setExpandedSeriesKeys],
    );

    useEffect(() => {
        if (isFocused) {
            refresh();
        }
    }, [isFocused, refresh]);
    const shouldWarnAboutPace = useCallback(
        (serie: TrainingSeries) => {
            if (!serie.enablePace || !serie.paceReferenceDistance) {
                return false;
            }
            const reference = serie.paceReferenceDistance;
            if (isDistanceReference(reference)) {
                return !hasRecordForReference(reference);
            }
            if (isLoadReference(reference)) {
                const loadValue = getProfileLoadValue(reference);
                return !(typeof loadValue === "number" && loadValue > 0);
            }
            return false;
        },
        [getProfileLoadValue, hasRecordForReference],
    );
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [joinLoading, setJoinLoading] = useState(false);
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [participantDialogVisible, setParticipantDialogVisible] = useState(false);
    const [participantInput, setParticipantInput] = useState("");
    const [participantSaving, setParticipantSaving] = useState(false);
    const [participantSuggestions, setParticipantSuggestions] = useState<UserSearchResult[]>([]);
    const [participantSearchLoading, setParticipantSearchLoading] = useState(false);
    const [selectedParticipant, setSelectedParticipant] = useState<UserSearchResult | null>(null);
    const [removingParticipantIds, setRemovingParticipantIds] = useState<Record<string, boolean>>({});
    const [paceWarningDialog, setPaceWarningDialog] = useState<PaceWarningPromptState | null>(null);
    const [paceWarningInput, setPaceWarningInput] = useState("");
    const [paceWarningSaving, setPaceWarningSaving] = useState(false);
    const [chronoValues, setChronoValues] = useState<Record<string, Record<string, string>>>({});
    const [chronoSaving, setChronoSaving] = useState(false);
    const [chronosVisible, setChronosVisible] = useState(false);
    const insets = useSafeAreaInsets();

    const openPaceWarningPrompt = useCallback(
        (reference: PaceReferenceValue) => {
            if (!reference) {
                return;
            }
            const label = formatReferenceLabel(reference) ?? reference;
            const mode: PaceWarningPromptState["mode"] = isLoadReference(reference) ? "load" : "distance";
            let initialValue = "";
            if (mode === "distance") {
                initialValue = user?.records?.[reference] ?? "";
            } else {
                const loadValue = getProfileLoadValue(reference as LoadPaceReferenceValue);
                initialValue = typeof loadValue === "number" ? String(loadValue) : "";
            }
            setPaceWarningInput(initialValue);
            setPaceWarningDialog({ reference, label, mode });
        },
        [getProfileLoadValue, user?.records],
    );

    const handleClosePaceWarningDialog = useCallback(() => {
        if (paceWarningSaving) {
            return;
        }
        setPaceWarningDialog(null);
        setPaceWarningInput("");
    }, [paceWarningSaving]);

    const handleSubmitPaceWarning = useCallback(async () => {
        if (!paceWarningDialog) {
            return;
        }
        const trimmed = paceWarningInput.trim();
        if (!trimmed) {
            Alert.alert("Valeur requise", "Merci de renseigner une valeur pour débloquer cette référence.");
            return;
        }
        let parsedLoadValue: number | null = null;
        if (paceWarningDialog.mode === "load") {
            const sanitized = trimmed.replace(",", ".");
            const parsed = Number(sanitized);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                Alert.alert("Valeur invalide", "Entrez un nombre positif en kilogrammes.");
                return;
            }
            parsedLoadValue = parsed;
        }
        try {
            setPaceWarningSaving(true);
            const updates: Partial<User> = {};
            if (paceWarningDialog.mode === "distance") {
                const nextRecords = { ...(user?.records || {}) };
                nextRecords[paceWarningDialog.reference] = trimmed;
                updates.records = nextRecords;
            } else if (parsedLoadValue !== null) {
                switch (paceWarningDialog.reference) {
                    case "bodyweight":
                        updates.bodyWeightKg = parsedLoadValue;
                        break;
                    case "max-muscu":
                        updates.maxMuscuKg = parsedLoadValue;
                        break;
                    case "max-chariot":
                        updates.maxChariotKg = parsedLoadValue;
                        break;
                    default:
                        break;
                }
            }
            const updatedUser = await updateUserProfile(updates);
            setUser(updatedUser);
            Alert.alert("Profil mis à jour", "Merci, vos données d'intensité sont enregistrées.");
            setPaceWarningDialog(null);
            setPaceWarningInput("");
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || "Impossible de mettre à jour le profil";
            Alert.alert("Erreur", message);
        } finally {
            setPaceWarningSaving(false);
        }
    }, [paceWarningDialog, paceWarningInput, setUser, user?.records]);

    const rebuildChronoStateFromSession = useCallback(
        (entries?: TrainingChronoEntry[] | null) => {
            if (!entries || !entries.length) {
                return {} as Record<string, Record<string, string>>;
            }
            return entries.reduce<Record<string, Record<string, string>>>((acc, entry) => {
                const participantId = typeof entry.participantId === "string" ? entry.participantId : undefined;
                if (!participantId) {
                    return acc;
                }
                const key = buildChronoKey({
                    seriesId: entry.seriesId,
                    seriesIndex: entry.seriesIndex,
                    repeatIndex: entry.repeatIndex,
                    segmentId: entry.segmentId,
                    segmentIndex: entry.segmentIndex,
                    repetitionIndex: entry.repetitionIndex,
                });
                if (!key) {
                    return acc;
                }
                if (!acc[participantId]) {
                    acc[participantId] = {};
                }
                acc[participantId][key] = entry.time || "";
                return acc;
            }, {});
        },
        [],
    );

    useEffect(() => {
        setChronoValues(rebuildChronoStateFromSession(session?.chronos));
    }, [rebuildChronoStateFromSession, session?.chronos]);

    const handleRefresh = useCallback(() => {
        refresh();
    }, [refresh]);

    const performDeleteSession = useCallback(async () => {
        if (!sessionId) {
            return;
        }
        try {
            setDeleteLoading(true);
            await deleteSessionFromContext(sessionId);
            Alert.alert("Séance supprimée", "La séance a été supprimée.");
            if (router.canGoBack?.()) {
                router.back();
            } else {
                router.replace("/(main)/training");
            }
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible de supprimer la séance";
            Alert.alert("Erreur", message);
        } finally {
            setDeleteLoading(false);
        }
    }, [deleteSessionFromContext, router, sessionId]);

    const confirmDeleteSession = useCallback(() => {
        if (!sessionId) {
            return;
        }
        Alert.alert("Supprimer la séance", "Cette action est définitive.", [
            { text: "Annuler", style: "cancel" },
            { text: "Supprimer", style: "destructive", onPress: () => performDeleteSession() },
        ]);
    }, [performDeleteSession, sessionId]);

    const handleEditSession = useCallback(() => {
        if (!sessionId) {
            return;
        }
        if (isSessionStatusLocked(session?.status)) {
            const reasonLabel = session?.status === "canceled" ? "annulée" : "terminée";
            Alert.alert("Séance clôturée", `Impossible de modifier une séance ${reasonLabel}.`);
            return;
        }
        router.push({ pathname: "/(main)/training/edit/[id]", params: { id: sessionId } });
    }, [router, session?.status, sessionId]);

    const handleJoinSession = useCallback(async () => {
        if (!sessionId) {
            return;
        }
        if (isSessionStatusLocked(session?.status)) {
            const reasonLabel = session?.status === "canceled" ? "annulée" : "terminée";
            Alert.alert("Séance clôturée", `Impossible de rejoindre une séance ${reasonLabel}.`);
            return;
        }
        try {
            setJoinLoading(true);
            await joinSessionFromContext(sessionId);
        } catch (error: any) {
            const message =
                error?.response?.data?.message || error?.message || "Impossible de vous inscrire à la séance";
            Alert.alert("Erreur", message);
        } finally {
            setJoinLoading(false);
        }
    }, [joinSessionFromContext, session?.status, sessionId]);

    const handleLeaveSession = useCallback(async () => {
        if (!sessionId) {
            return;
        }
        if (isSessionStatusLocked(session?.status)) {
            const reasonLabel = session?.status === "canceled" ? "annulée" : "terminée";
            Alert.alert("Séance clôturée", `Les désinscriptions sont verrouillées car la séance est ${reasonLabel}.`);
            return;
        }
        try {
            setLeaveLoading(true);
            await leaveSessionFromContext(sessionId);
        } catch (error: any) {
            const message =
                error?.response?.data?.message || error?.message || "Impossible d'annuler votre participation";
            Alert.alert("Erreur", message);
        } finally {
            setLeaveLoading(false);
        }
    }, [leaveSessionFromContext, session?.status, sessionId]);

    const sessionReturnPath = useMemo(() => {
        const slug = sessionId ? sessionId.toString() : "";
        const query = slug ? `?id=${slug}` : "";
        return `${pathname}${query}`;
    }, [pathname, sessionId]);

    const handleOpenUserProfile = useCallback(
        (targetUserId?: string | null) => {
            if (!targetUserId) {
                return;
            }
            if (currentUserId && targetUserId === currentUserId) {
                router.push("/(main)/user-profile");
                return;
            }
            const profileParams = sessionReturnPath
                ? { id: targetUserId, from: sessionReturnPath }
                : { id: targetUserId };
            router.push({ pathname: "/(main)/profiles/[id]", params: profileParams });
        },
        [currentUserId, router, sessionReturnPath],
    );

    const handleOpenParticipantDialog = useCallback(() => {
        setParticipantDialogVisible(true);
        setParticipantInput("");
        setParticipantSuggestions([]);
        setSelectedParticipant(null);
    }, []);

    const closeParticipantDialog = useCallback(() => {
        if (participantSaving) {
            return;
        }
        setParticipantDialogVisible(false);
        setParticipantInput("");
        setParticipantSuggestions([]);
        setSelectedParticipant(null);
    }, [participantSaving]);

    const handleSelectParticipantSuggestion = useCallback((suggestion: UserSearchResult) => {
        setSelectedParticipant(suggestion);
        setParticipantInput(suggestion.fullName?.trim() || suggestion.username?.trim() || buildFallbackLabel(suggestion.id));
        setParticipantSuggestions([]);
        setParticipantSearchLoading(false);
    }, []);

    const handleAddParticipant = useCallback(async () => {
        if (!sessionId) {
            return;
        }
        const trimmed = participantInput.trim();
        const manualIdAllowed = /^[a-f\d]{8,}$/i.test(trimmed);
        const targetUserId = selectedParticipant?.id || (manualIdAllowed ? trimmed : "");
        if (!targetUserId) {
            Alert.alert("Sélection requise", "Choisissez un athlète dans la liste ou renseignez son identifiant complet.");
            return;
        }
        try {
            setParticipantSaving(true);
            await addParticipantToSessionFromContext(sessionId, targetUserId);
            setParticipantDialogVisible(false);
            setParticipantInput("");
            setParticipantSuggestions([]);
            setSelectedParticipant(null);
            Alert.alert("Participant ajouté", "L'athlète a été inscrit à la séance.");
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Ajout impossible";
            Alert.alert("Erreur", message);
        } finally {
            setParticipantSaving(false);
        }
    }, [addParticipantToSessionFromContext, participantInput, selectedParticipant, sessionId]);

    const performRemoveParticipant = useCallback(
        async (participantId: string) => {
            if (!sessionId || !participantId) {
                return;
            }
            if (isSessionStatusLocked(session?.status)) {
                const reasonLabel = session?.status === "canceled" ? "annulée" : "terminée";
                Alert.alert("Séance clôturée", `Impossible de retirer un athlète d'une séance ${reasonLabel}.`);
                return;
            }
            setRemovingParticipantIds((prev) => ({ ...prev, [participantId]: true }));
            try {
                await removeParticipantFromSessionFromContext(sessionId, participantId);
            } catch (error: any) {
                const message =
                    error?.response?.data?.message || error?.message || "Impossible de retirer cet athlète";
                Alert.alert("Erreur", message);
            } finally {
                setRemovingParticipantIds((prev) => {
                    if (!prev[participantId]) return prev;
                    const next = { ...prev };
                    delete next[participantId];
                    return next;
                });
            }
        },
        [removeParticipantFromSessionFromContext, session?.status, sessionId],
    );

    const confirmRemoveParticipant = useCallback(
        (participantId: string, label?: string) => {
            if (!participantId) {
                return;
            }
            Alert.alert(
                "Retirer l'athlète",
                label ? `Retirer ${label} de cette séance ?` : "Retirer cet athlète de cette séance ?",
                [
                    { text: "Annuler", style: "cancel" },
                    { text: "Retirer", style: "destructive", onPress: () => performRemoveParticipant(participantId) },
                ],
            );
        },
        [performRemoveParticipant],
    );

    const handleChangeChronoValue = useCallback((participantId: string, blockKey: string, value: string) => {
        if (!participantId || !blockKey) {
            return;
        }
        setChronoValues((prev) => ({
            ...prev,
            [participantId]: {
                ...(prev[participantId] || {}),
                [blockKey]: value,
            },
        }));
    }, []);

    useEffect(() => {
        if (!participantDialogVisible) {
            setParticipantSuggestions([]);
            setParticipantSearchLoading(false);
            return;
        }
        const trimmed = participantInput.trim();
        if (trimmed.length < 2) {
            setParticipantSuggestions([]);
            setParticipantSearchLoading(false);
            return;
        }
        let isActive = true;
        setParticipantSearchLoading(true);
        const debounce = setTimeout(() => {
            searchUsers(trimmed)
                .then((results) => {
                    if (!isActive) return;
                    setParticipantSuggestions(results);
                })
                .catch(() => {
                    if (!isActive) return;
                    setParticipantSuggestions([]);
                })
                .finally(() => {
                    if (!isActive) return;
                    setParticipantSearchLoading(false);
                });
        }, 250);
        return () => {
            isActive = false;
            clearTimeout(debounce);
        };
    }, [participantDialogVisible, participantInput]);

    const series = useMemo(() => session?.series || [], [session?.series]);

    const distanceBlocks = useMemo<DistanceBlockDescriptor[]>(() => {
        const items: DistanceBlockDescriptor[] = [];
        series.forEach((serie, seriesIndex) => {
            const repeatCount = Math.max(serie.repeatCount ?? 1, 1);
            const segments = serie.segments || [];
            for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
                segments.forEach((segment, segmentIndex) => {
                    const blockType = resolveBlockType(segment);
                    if (!isDistanceDrivenSegment(segment, blockType)) {
                        return;
                    }
                    const meters = getSegmentPlannedDistanceMeters(segment, blockType);
                    if (!meters || meters <= 0) {
                        return;
                    }
                    const repetitions = segment.repetitions && segment.repetitions > 0 ? segment.repetitions : 1;
                    const distanceLabel =
                        formatDistanceDisplay(segment.distance, segment.distanceUnit) || `${Math.round(meters)}m`;
                    for (let repetitionIndex = 0; repetitionIndex < repetitions; repetitionIndex += 1) {
                        const key = buildChronoKey({
                            seriesId: serie.id,
                            seriesIndex,
                            repeatIndex,
                            segmentId: segment.id,
                            segmentIndex,
                            repetitionIndex,
                        });
                        items.push({
                            key,
                            seriesId: serie.id || `serie-${seriesIndex}`,
                            seriesIndex,
                            repeatIndex,
                            segmentId: segment.id || `segment-${segmentIndex}`,
                            segmentIndex,
                            repetitionIndex,
                            distance: segment.distance ?? meters,
                            distanceLabel,
                            blockName: getSegmentBlockLabel(segment),
                            serieLabel: `Série ${seriesIndex + 1}${repeatCount > 1 ? ` · passage ${repeatIndex + 1}` : ""}`,
                        });
                    }
                });
            }
        });
        return items;
    }, [series]);

    const hasDistanceBlocks = distanceBlocks.length > 0;
    const participants = useMemo(() => session?.participants || [], [session?.participants]);
    const sessionOwnerRef = session?.athlete || toParticipantRef(session?.athleteId);
    const sessionOwnerId = getUserIdFromRef(sessionOwnerRef) || session?.athleteId;
    const isOwner = Boolean(currentUserId && sessionOwnerId && sessionOwnerId === currentUserId);
    const canEditChronos = Boolean(isOwner && hasDistanceBlocks);

    const isCoachParticipantRef = useCallback((value?: ParticipantUserRef | string | null) => {
        if (!value || typeof value === "string") {
            return false;
        }
        return value.role === "coach";
    }, []);

    const hasChronoEligibleParticipants = useMemo(() => {
        if (!hasDistanceBlocks) {
            return false;
        }
        if (sessionOwnerId && !isCoachParticipantRef(sessionOwnerRef)) {
            return true;
        }
        return participants.some((participant) => !isCoachParticipantRef(toParticipantRef(participant.user)));
    }, [hasDistanceBlocks, isCoachParticipantRef, participants, sessionOwnerId, sessionOwnerRef]);

    const handleSaveChronos = useCallback(async () => {
        if (!sessionId) {
            return;
        }
        if (!hasDistanceBlocks) {
            Alert.alert("Aucun bloc mesurable", "Cette séance ne contient pas de blocs avec distance mesurée.");
            return;
        }
        if (!canEditChronos) {
            Alert.alert("Action non autorisée", "Seul l'entraîneur peut enregistrer les chronos de la séance.");
            return;
        }
        const participantIds = new Set<string>();
        if (sessionOwnerId && !isCoachParticipantRef(sessionOwnerRef)) {
            participantIds.add(sessionOwnerId);
        }
        participants.forEach((participant) => {
            const participantRef = toParticipantRef(participant.user);
            if (isCoachParticipantRef(participantRef)) {
                return;
            }
            const pid = getUserIdFromRef(participantRef);
            if (pid) {
                participantIds.add(pid);
            }
        });

        const entries: TrainingChronoInput[] = [];
        participantIds.forEach((participantId) => {
            distanceBlocks.forEach((block) => {
                const raw = chronoValues[participantId]?.[block.key];
                const trimmed = (raw || "").trim();
                const timeValue = trimmed || "0"; // valeurs vides envoyées à 0
                entries.push({
                    participantId,
                    seriesId: block.seriesId,
                    seriesIndex: block.seriesIndex,
                    repeatIndex: block.repeatIndex,
                    segmentId: block.segmentId,
                    segmentIndex: block.segmentIndex,
                    repetitionIndex: block.repetitionIndex,
                    distance: block.distance,
                    time: timeValue,
                });
            });
        });

        try {
            setChronoSaving(true);
            const updated = await saveSessionChronosFromContext(sessionId, entries);
            setChronoValues(rebuildChronoStateFromSession(updated.chronos));
            Alert.alert("Chronos enregistrés", "Les temps ont été sauvegardés pour cette séance.");
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible d'enregistrer les chronos";
            Alert.alert("Erreur", message);
        } finally {
            setChronoSaving(false);
        }
    }, [canEditChronos, chronoValues, distanceBlocks, hasDistanceBlocks, isCoachParticipantRef, participants, rebuildChronoStateFromSession, saveSessionChronosFromContext, sessionId, sessionOwnerId, sessionOwnerRef]);

    if (loading && !session) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateContainer}>
                    <ActivityIndicator color={UI_COLORS.accent} />
                </View>
            </SafeAreaView>
        );
    }

    if (!session) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateContainer}>
                    <Text style={styles.stateText}>{error || "Séance introuvable"}</Text>
                    <Button onPress={handleRefresh} style={{ marginTop: 12 }} textColor="#f8fafc">
                        Réessayer
                    </Button>
                </View>
            </SafeAreaView>
        );
    }

    const formattedDate = formatDisplayDate(session.date);
    const statusLabel = formatStatusLabel(session.status);
    const statusVisual = resolveStatusVisual(session.status);
    const sessionLocked = isSessionStatusLocked(session.status);
    const lockReasonLabel = session.status === "canceled" ? "annulée" : session.status === "done" ? "terminée" : null;
    const sessionTimeLabel = session.startTime?.trim() ? session.startTime.trim() : "—";
    const sessionDurationLabel = formatDurationLabel(session.durationMinutes) ?? "Durée inconnue";
    const participantIds = new Set<string>();
    const ownerIdForCount = sessionOwnerId || session.athleteId;
    if (ownerIdForCount) {
        participantIds.add(ownerIdForCount);
    }
    participants.forEach((participant) => {
        const id = getUserIdFromRef(participant.user);
        if (id) {
            participantIds.add(id);
        }
    });
    const participantCount = participantIds.size || participants.length;
    const participantCountLabel = `${participantCount} participant${participantCount > 1 ? "s" : ""}`;
    const participantRecord = currentUserId
        ? participants.find((participant) => getUserIdFromRef(participant.user) === currentUserId)
        : undefined;
    const participantStatus = participantRecord
        ? normalizeParticipantStatus(participantRecord.status as ParticipantStatus | undefined)
        : undefined;
    const isParticipantConfirmed = participantStatus === "confirmed";
    const hasPendingInvite = participantStatus === "pending";
    const canJoin = Boolean(currentUserId && !isOwner && (!participantRecord || hasPendingInvite) && !sessionLocked);
    const canLeave = Boolean(currentUserId && !isOwner && isParticipantConfirmed && !sessionLocked);
    const participantsDescription = sessionLocked
        ? lockReasonLabel
            ? `Séance ${lockReasonLabel}.`
            : "Cette séance est clôturée."
        : isOwner
            ? "Ajoutez vos athlètes."
            : hasPendingInvite
                ? "Vous avez été invité à cette séance. Confirmez votre participation."
                : isParticipantConfirmed
                    ? "Vous participez à cette séance. Vous pouvez vous désinscrire si besoin."
                    : "Rejoignez cette séance pour apparaître ici.";
    const joinButtonLabel = hasPendingInvite ? "Confirmer ma participation" : "Je participe";
    const joinButtonIcon = hasPendingInvite ? "check-circle-outline" : "account-check";
    const leaveButtonLabel = "Je n'y vais plus";
    const leaveButtonIcon = "account-cancel";
    const resolvedOwnerDisplayName = sessionOwnerRef
        ? getParticipantDisplayName(sessionOwnerRef)
        : getParticipantDisplayName(sessionOwnerId);
    const ownerNameLabel = isOwner
        ? user?.fullName || user?.username || "Vous"
        : resolvedOwnerDisplayName || "Athlète principal";
    const ownerRowInteractive = Boolean(sessionOwnerId);
    const ownerInitials = getInitialsFromLabel(ownerNameLabel);
    const ownerAvatarColor = getParticipantColor(sessionOwnerId);
    const ownerPhotoUrl = getProfilePhotoUri(sessionOwnerRef?.photoUrl);
    const aggregate = series.reduce(
        (acc, serie) => {
            const repeatCount = serie.repeatCount ?? 1;
            const segments = serie.segments || [];
            acc.segments += segments.length;
            acc.seriesRepeats += repeatCount;
            if (serie.enablePace) {
                acc.paceEnabled += 1;
            }
            const serieVolume = segments.reduce((segmentSum, segment) => {
                const blockType = resolveBlockType(segment);
                const reps = getSegmentPlannedRepetitions(segment, blockType);
                const segmentMeters = getSegmentPlannedDistanceMeters(segment, blockType);
                return segmentSum + segmentMeters * reps;
            }, 0);
            acc.volume += serieVolume * repeatCount;
            return acc;
        },
        { segments: 0, seriesRepeats: 0, volume: 0, paceEnabled: 0 }
    );

    const seriesCount = series.length;
    const totalSeriesExecutions = aggregate.seriesRepeats || 0;
    const seriesMetricValue =
        seriesCount > 0 && totalSeriesExecutions !== seriesCount
            ? `${totalSeriesExecutions}`
            : String(totalSeriesExecutions || 0);
    // Vérifie s'il existe au moins un segment avec une distance > 0
    const hasDistanceInAnySegment = series.some(serie =>
        (serie.segments || []).some(segment => {
            const blockType = resolveBlockType(segment);
            const meters = getSegmentPlannedDistanceMeters(segment, blockType);
            return typeof meters === "number" && meters > 0;
        })
    );
    const hasVolumePlanned = aggregate.volume > 0 && hasDistanceInAnySegment;
    const expressMetrics: { label: string; value: string }[] = [
        { label: "Séries", value: seriesMetricValue },
        { label: "Blocs", value: String(aggregate.segments) },
    ];
    if (hasVolumePlanned) {
        expressMetrics.push({ label: "Volume", value: formatVolumeLabel(aggregate.volume) });
    }

    // Affiche le repos entre séries dans le récap express si au moins 2 séries (en tenant compte des répétitions)
    const restBetweenSeriesLabel = typeof session.seriesRestInterval === "number"
        ? formatRestDisplay(session.seriesRestInterval, session.seriesRestUnit)
        : "—";
    if (totalSeriesExecutions >= 2) {
        expressMetrics.push({ label: "Repos séries", value: restBetweenSeriesLabel });
    }

    const renderChronoInputsForParticipant = (participantId?: string | null) => {
        if (!chronosVisible || !participantId || !hasDistanceBlocks) {
            return null;
        }

        const values = chronoValues[participantId] || {};
        const grouped = distanceBlocks.reduce<Record<string, DistanceBlockDescriptor[]>>((acc, block) => {
            const key = block.serieLabel;
            acc[key] = acc[key] ? [...acc[key], block] : [block];
            return acc;
        }, {});

        return (
            <View style={styles.participantChronoList}>
                {Object.entries(grouped).map(([serieLabel, blocks]) => (
                    <View key={`${participantId}-${serieLabel}`} style={styles.participantChronoRow}>
                        <View style={styles.participantChronoLabelWrapper}>
                            <Text style={styles.participantChronoLabel}>{serieLabel}</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.participantChronoInputsRow}
                        >
                            {blocks.map((block) => {
                                const currentValue = values[block.key] ?? "";
                                const repLabel = typeof block.repetitionIndex === "number"
                                    ? `${block.distanceLabel || block.distance || ""} · rep ${block.repetitionIndex + 1}`
                                    : block.distanceLabel || null;
                                return (
                                    <View key={`${participantId}-${block.key}`} style={styles.participantChronoInputWrapper}>
                                        {repLabel ? (
                                            <Text style={styles.participantChronoSubLabel}>{repLabel}</Text>
                                        ) : null}
                                        <TextInput
                                            value={currentValue}
                                            onChangeText={(text) => handleChangeChronoValue(participantId, block.key, text)}
                                            mode="outlined"
                                            dense
                                            style={styles.participantChronoInput}
                                            placeholder="00:00.00"
                                            placeholderTextColor="#64748b"
                                            keyboardType="numeric"
                                            editable={canEditChronos}
                                        />
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                ))}
            </View>
        );
    };

    const renderStandardSegmentDetails = (segment: TrainingSeriesSegment, blockType: TrainingBlockType) => {
        const chipsToShow: string[] = [];
        const extraExercises =
            blockType === "ppg"
                ? normalizeExercises(segment.ppgExercises)
                : blockType === "muscu"
                    ? normalizeExercises(segment.muscuExercises)
                    : [];

        // Primary metric line (distance or duration depending on block).
        const showDurationForCotes = blockType === "cotes" && segment.cotesMode === "duration";
        const isDistanceDriven = isDistanceDrivenSegment(segment, blockType);
        const showDistance = isDistanceDriven && typeof segment.distance === "number" && segment.distance > 0;

        if (blockType === "ppg") {
            const mode = segment.ppgMode || "time";
            chipsToShow.push(mode === "reps" ? "Mode: répétitions" : "Mode: temps");
            if (mode === "reps") {
                if (segment.ppgRepetitions) {
                    chipsToShow.push(`Rép/exo: ${segment.ppgRepetitions}`);
                }
            } else {
                chipsToShow.push(`Durée/exo: ${formatRestDisplay(segment.ppgDurationSeconds, "s")}`);
            }
            chipsToShow.push(`Récup/exo: ${formatRestDisplay(segment.ppgRestSeconds, "s")}`);

            // Optional: if restInterval is used as between-round rest, surface it when relevant.
            if (segment.restInterval || segment.restInterval === 0) {
                if (segment.restInterval > 0) {
                    chipsToShow.push(`Repos: ${formatRestDisplay(segment.restInterval, segment.restUnit)}`);
                }
            }
        } else if (blockType === "muscu") {
            if (segment.muscuRepetitions) {
                chipsToShow.push(`Rép/exo: ${segment.muscuRepetitions}`);
            }
            chipsToShow.push(`Repos: ${formatRestDisplay(segment.restInterval, segment.restUnit)}`);
        } else if (blockType === "start") {
            if (typeof segment.startCount === "number" && segment.startCount > 0) {
                chipsToShow.push(`Départs: ${segment.startCount}`);
            }
            if (typeof segment.startExitDistance === "number" && segment.startExitDistance > 0) {
                chipsToShow.push(`Sortie: ${formatDistanceDisplay(segment.startExitDistance, segment.distanceUnit)}`);
            }
            chipsToShow.push(`Repos: ${formatRestDisplay(segment.restInterval, segment.restUnit)}`);
            if (segment.targetPace) {
                chipsToShow.push(`Allure: ${segment.targetPace}`);
            }
        } else if (blockType === "recup") {
            if (segment.recoveryMode) {
                chipsToShow.push(`Mode: ${formatRecoveryModeLabel(segment.recoveryMode)}`);
            }
            if (segment.durationSeconds) {
                chipsToShow.push(`Effort: ${formatRestDisplay(segment.durationSeconds, "s")}`);
            }
            if (segment.recoveryDurationSeconds) {
                chipsToShow.push(`Récup: ${formatRestDisplay(segment.recoveryDurationSeconds, "s")}`);
            }
            if (segment.restInterval || segment.restInterval === 0) {
                if (segment.restInterval > 0) {
                    chipsToShow.push(`Repos: ${formatRestDisplay(segment.restInterval, segment.restUnit)}`);
                }
            }
        } else {
            // vitesse / cotes / other
            chipsToShow.push(`Repos: ${formatRestDisplay(segment.restInterval, segment.restUnit)}`);
            if (segment.targetPace) {
                chipsToShow.push(`Allure: ${segment.targetPace}`);
            }
            if (blockType === "cotes") {
                chipsToShow.push(`Format: ${(segment.cotesMode || "distance") === "duration" ? "durée" : "distance"}`);
            }
        }

        return (
            <>
                {showDurationForCotes ? (
                    <Text style={styles.segmentDistance}>{`Durée ${formatRestDisplay(segment.durationSeconds, "s")}`}</Text>
                ) : showDistance ? (
                    <Text style={styles.segmentDistance}>{formatDistanceDisplay(segment.distance, segment.distanceUnit)}</Text>
                ) : null}
                <View style={styles.segmentMetaRow}>
                    {chipsToShow.map((chip, idx) => (
                        <View key={`${segment.id}-chip-${idx}`} style={styles.segmentMetaChip}>
                            <Text style={styles.segmentMetaChipText}>{chip}</Text>
                        </View>
                    ))}
                </View>
                {extraExercises.length ? (
                    <>
                        <Text style={styles.segmentNote}>{`Exercices (${extraExercises.length})`}</Text>
                        <View style={styles.segmentExtraList}>
                            {extraExercises.map((exercise, idx) => (
                                <View key={`${segment.id}-exercise-${idx}`} style={styles.segmentExtraChip}>
                                    <Text style={styles.segmentExtraChipText}>{exercise}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                ) : null}
            </>
        );
    };

    const renderCustomSegmentDetails = (segment: TrainingSeriesSegment) => {
        const chips: string[] = [];
        const primaryChip = formatCustomMetricChip(segment);
        if (primaryChip) {
            chips.push(primaryChip);
        }
        const optionalReps = formatOptionalRepetitions(segment.customMetricRepetitions);
        const isExerciseMetric = segment.customMetricKind === "exo";
        if (isExerciseMetric && segment.customMetricRepetitions) {
            const tours = segment.customMetricRepetitions;
            const suffix = tours > 1 ? "s" : "";
            chips.push(`${tours} tour${suffix}`);
        } else if (optionalReps) {
            chips.push(optionalReps);
        }
        if (isExerciseMetric && segment.customMetricDurationSeconds) {
            chips.push(`Durée ${formatRestDisplay(segment.customMetricDurationSeconds, "s")}`);
        }
        chips.push(`Repos ${formatRestDisplay(segment.restInterval, segment.restUnit)}`);

        const goalText = segment.customGoal?.trim() || "Objectif libre";
        const notes = segment.customNotes?.trim();
        const exercises =
            isExerciseMetric && Array.isArray(segment.customExercises)
                ? segment.customExercises.filter((exercise) => Boolean(exercise && exercise.trim()))
                : [];

        return (
            <>
                <Text style={segment.customGoal ? styles.segmentGoal : styles.segmentGoalMuted}>{goalText}</Text>
                <View style={styles.segmentMetaRow}>
                    {chips.map((chip, idx) => (
                        <View key={`${segment.id}-custom-chip-${idx}`} style={styles.segmentMetaChip}>
                            <Text style={styles.segmentMetaChipText}>{chip}</Text>
                        </View>
                    ))}
                </View>
                {exercises.length ? (
                    <View style={styles.segmentExtraList}>
                        {exercises.map((exercise, idx) => (
                            <View key={`${segment.id}-custom-exercise-${idx}`} style={styles.segmentExtraChip}>
                                <Text style={styles.segmentExtraChipText}>{exercise}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}
                {notes ? <Text style={styles.segmentNote}>{notes}</Text> : null}
            </>
        );
    };


    const navClearance = 68 + Math.max(insets.bottom, 10);
    const contentPaddingBottom = navClearance + 24;

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            {isOwner ? (
                <View style={[styles.topActionsBar, { paddingTop: Math.max(insets.top, 8) }]}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Modifier la séance"
                        onPress={handleEditSession}
                        disabled={sessionLocked}
                        style={({ pressed }) => [
                            styles.heroActionButton,
                            sessionLocked && styles.heroActionButtonDisabled,
                            pressed && !sessionLocked && styles.heroActionButtonPressed,
                        ]}
                    >
                        <MaterialCommunityIcons name="pencil" size={14} color={UI_COLORS.background} />
                        <Text style={styles.heroActionButtonLabel}>Modifier</Text>
                    </Pressable>

                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Supprimer la séance"
                        onPress={confirmDeleteSession}
                        disabled={deleteLoading}
                        style={({ pressed }) => [
                            styles.heroActionButton,
                            styles.heroActionButtonDanger,
                            deleteLoading && styles.heroActionButtonDisabled,
                            pressed && !deleteLoading && styles.heroActionButtonPressed,
                        ]}
                    >
                        {deleteLoading ? (
                            <ActivityIndicator size="small" color={UI_COLORS.danger} />
                        ) : (
                            <MaterialCommunityIcons name="delete-outline" size={14} color={UI_COLORS.danger} />
                        )}
                        <Text style={[styles.heroActionButtonLabel, styles.heroActionButtonLabelDanger]}>Supprimer</Text>
                    </Pressable>
                </View>
            ) : null}
            <ScrollView
                contentContainerStyle={[styles.container, { paddingBottom: contentPaddingBottom }]}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={handleRefresh}
                        tintColor={UI_COLORS.accent}
                        colors={[UI_COLORS.accent]}
                    />
                }
            >
                {isOwner && sessionLocked ? (
                    <View style={styles.sessionLockedBanner}>
                        <MaterialCommunityIcons name="lock-outline" size={16} color="#f8fafc" />
                        <Text style={styles.sessionLockedText}>
                            {lockReasonLabel
                                ? `Séance ${lockReasonLabel}. Modification impossible.`
                                : "Cette séance est clôturée. Modification impossible."}
                        </Text>
                    </View>
                ) : null}
                {/* HERO CARD */}
                <View style={[styles.card, styles.heroCard]}>
                    <View style={styles.heroHeaderRow}>
                        {/* Date à gauche, Type à droite */}
                        <View style={{ flex: 1 }}>
                            <View style={styles.heroHeaderItemRow}>
                                <MaterialCommunityIcons name="calendar-range" size={14} color={UI_COLORS.accent} style={{ marginRight: 3 }} />
                                <Text style={styles.heroHeaderDate}>{formattedDate}</Text>
                            </View>
                            <View style={styles.heroHeaderItemRow}>
                                <MaterialCommunityIcons name="map-marker" size={13} color={UI_COLORS.danger} style={{ marginRight: 3 }} />
                                <Text style={styles.heroHeaderPlace}>{session.place?.trim() || "—"}</Text>
                            </View>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <View style={styles.heroHeaderItemRow}>
                                <MaterialCommunityIcons name="run-fast" size={14} color={UI_COLORS.text} style={{ marginRight: 3 }} />
                                <Text style={styles.heroHeaderType}>{session.type}</Text>
                            </View>
                            <View
                                style={[
                                    styles.statusPill,
                                    statusVisual.color === UI_COLORS.danger
                                        ? styles.statusPillDanger
                                        : statusVisual.color === UI_COLORS.accent
                                            ? styles.statusPillAccent
                                            : null,
                                ]}
                            >
                                <MaterialCommunityIcons name={statusVisual.icon} size={13} color={statusVisual.color} />
                                <Text style={[styles.statusPillText, { color: statusVisual.color }]}>{statusLabel}</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.heroTimeRow}>
                        <View style={styles.heroHeaderItemRow}>
                            <MaterialCommunityIcons name="clock-outline" size={13} color={UI_COLORS.accent} style={{ marginRight: 3 }} />
                            <Text style={styles.heroHeaderDate}>{sessionTimeLabel}</Text>
                        </View>
                        <View style={styles.heroHeaderItemRow}>
                            <MaterialCommunityIcons name="timer-outline" size={13} color={UI_COLORS.accent} style={{ marginRight: 3 }} />
                            <Text style={styles.heroHeaderDate}>{sessionDurationLabel}</Text>
                        </View>
                    </View>
                    <Text style={styles.heroTitle}>{session.title}</Text>
                    {session.description ? <Text style={styles.heroSubtitle}>{session.description}</Text> : null}
                    {/* Affichage des équipements supprimé */}
                </View>

                {/* METRICS CARD */}
                <View style={[styles.card, styles.metricsCard]}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={recapExpanded ? "Replier le récap" : "Déplier le récap"}
                        onPress={() => setRecapExpanded((value) => !value)}
                        style={({ pressed }) => [styles.accordionHeaderRow, recapExpanded && styles.accordionHeaderRowActive, pressed && styles.accordionHeaderRowPressed]}
                    >
                        <Text style={styles.sectionHeading}>Récap express</Text>
                        <MaterialCommunityIcons
                            name={recapExpanded ? "chevron-up" : "chevron-down"}
                            size={18}
                            color={recapExpanded ? UI_COLORS.accent : UI_COLORS.textMuted}
                        />
                    </Pressable>
                    {recapExpanded ? (
                        <View style={styles.metricsGrid}>
                            {expressMetrics.map((metric) => (
                                <View key={metric.label} style={styles.metricItem}>
                                    <Text style={styles.metricValue}>{metric.value}</Text>
                                    <Text style={styles.metricLabel}>{metric.label}</Text>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>

                {/* SÉRIES ET BLOCS */}
                {series.length ? (
                    <View style={[styles.card, styles.blockCard]}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={flowExpanded ? "Replier le déroulement" : "Déplier le déroulement"}
                            onPress={() => setFlowExpanded((value) => !value)}
                            style={({ pressed }) => [styles.accordionHeaderRow, flowExpanded && styles.accordionHeaderRowActive, pressed && styles.accordionHeaderRowPressed]}
                        >
                            <Text style={styles.sectionHeading}>Déroulement</Text>
                            <MaterialCommunityIcons
                                name={flowExpanded ? "chevron-up" : "chevron-down"}
                                size={18}
                                color={flowExpanded ? UI_COLORS.accent : UI_COLORS.textMuted}
                            />
                        </Pressable>

                        {flowExpanded ? (
                            <View style={styles.seriesList}>
                                {series.map((serie, index) => {
                                    const seriesKey = getSeriesKey(serie, index);
                                    const seriesExpanded = expandedSeriesKeys.has(seriesKey);
                                    const referenceLabel = formatReferenceLabel(serie.paceReferenceDistance);
                                    const showPaceWarning = shouldWarnAboutPace(serie);
                                    const canShowPaceWarningButton = Boolean(showPaceWarning && serie.paceReferenceDistance);
                                    const segmentsCount = (serie.segments || []).length || 1;
                                    const repeatCount = Math.max(serie.repeatCount ?? 1, 1);

                                    return (
                                        <View key={serie.id ?? index} style={styles.seriesCard}>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel={seriesExpanded ? `Replier la série ${index + 1}` : `Déplier la série ${index + 1}`}
                                                onPress={() => toggleSeriesExpanded(seriesKey)}
                                                style={({ pressed }) => [styles.seriesHeaderPressable, pressed && styles.seriesHeaderPressablePressed]}
                                            >
                                                <View>
                                                    <Text style={styles.seriesBadge}>Série {index + 1}</Text>
                                                    <Text style={styles.seriesTitle}>
                                                        {segmentsCount} {segmentsCount === 1 ? "bloc" : "blocs"}
                                                    </Text>
                                                </View>
                                                <View style={styles.seriesHeaderRight}>
                                                    {repeatCount > 1 ? (
                                                        <View style={styles.seriesRepeatPill}>
                                                            <Text style={styles.seriesRepeatValue}>×{repeatCount}</Text>
                                                        </View>
                                                    ) : null}
                                                    <MaterialCommunityIcons
                                                        name={seriesExpanded ? "chevron-up" : "chevron-down"}
                                                        size={18}
                                                        color={seriesExpanded ? UI_COLORS.accent : UI_COLORS.textMuted}
                                                    />
                                                </View>
                                            </Pressable>

                                            {seriesExpanded ? (
                                                <>
                                                    {serie.enablePace ? (
                                                        <View style={styles.paceRow}>
                                                            <View style={styles.paceChip}>
                                                                <Text style={styles.paceChipText}>
                                                                    Intensité: {serie.pacePercent ?? "—"}%
                                                                </Text>
                                                            </View>
                                                            {referenceLabel ? (
                                                                <>
                                                                    <View style={styles.paceChip}>
                                                                        <Text style={styles.paceChipText}>Réf {referenceLabel}</Text>
                                                                    </View>
                                                                    {canShowPaceWarningButton ? (
                                                                        <Pressable
                                                                            onPress={() =>
                                                                                openPaceWarningPrompt(
                                                                                    serie.paceReferenceDistance as PaceReferenceValue,
                                                                                )
                                                                            }
                                                                            accessibilityRole="button"
                                                                            accessibilityLabel={`Compléter votre profil pour ${referenceLabel}`}
                                                                            style={({ pressed }) => [
                                                                                styles.paceWarningButton,
                                                                                pressed && styles.paceWarningButtonPressed,
                                                                            ]}
                                                                            hitSlop={6}
                                                                        >
                                                                            <MaterialCommunityIcons
                                                                                name="alert-circle"
                                                                                size={16}
                                                                                color={UI_COLORS.danger}
                                                                            />
                                                                        </Pressable>
                                                                    ) : null}
                                                                </>
                                                            ) : null}
                                                        </View>
                                                    ) : null}

                                                    <View style={styles.segmentList}>
                                                        {(serie.segments || []).map((segment, segmentIndex) => {
                                                            const blockType = resolveBlockType(segment);
                                                            const blockLabel = getSegmentBlockLabel(segment);
                                                            const isCustom = blockType === "custom";
                                                            const pacePreview = serie.enablePace
                                                                ? getSegmentPacePreview(serie, segment)
                                                                : null;
                                                            const repetitionLabel = (() => {
                                                                if (blockType === "start" && typeof segment.startCount === "number") {
                                                                    const suffix = segment.startCount > 1 ? "s" : "";
                                                                    return `${segment.startCount} départ${suffix}`;
                                                                }
                                                                const canShowRepetitions =
                                                                    blockType === "vitesse" || blockType === "cotes" || blockType === "custom";
                                                                if (canShowRepetitions && segment.repetitions && segment.repetitions > 1) {
                                                                    return `×${segment.repetitions} fois`;
                                                                }
                                                                return null;
                                                            })();
                                                            return (
                                                                <View key={segment.id ?? segmentIndex} style={styles.segmentItem}>
                                                                    <View style={styles.segmentItemRow}>
                                                                        <Text style={styles.segmentBadge}>
                                                                            {blockLabel}
                                                                        </Text>
                                                                        {repetitionLabel ? (
                                                                            <Text style={styles.segmentRepeat}>{repetitionLabel}</Text>
                                                                        ) : null}
                                                                    </View>
                                                                    {isCustom
                                                                        ? renderCustomSegmentDetails(segment)
                                                                        : renderStandardSegmentDetails(segment, blockType)}
                                                                    {pacePreview ? (
                                                                        <View style={styles.segmentPacePreview}>
                                                                            <Text style={styles.segmentPacePreviewLabel}>
                                                                                {`${pacePreview.mode === "load" ? "Charge" : "Temps"} cible (${pacePreview.distanceLabel})`}
                                                                            </Text>
                                                                            <Text style={styles.segmentPacePreviewValue}>{pacePreview.value}</Text>
                                                                            <Text style={styles.segmentPacePreviewHint}>{pacePreview.detail}</Text>
                                                                        </View>
                                                                    ) : null}
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                </>
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {/* NOTES */}
                {session.coachNotes ? (
                    <View style={[styles.card, styles.noteCard]}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={coachNotesExpanded ? "Replier les notes coach" : "Déplier les notes coach"}
                            onPress={() => setCoachNotesExpanded((value) => !value)}
                            style={({ pressed }) => [styles.accordionHeaderRow, coachNotesExpanded && styles.accordionHeaderRowActive, pressed && styles.accordionHeaderRowPressed]}
                        >
                            <Text style={styles.sectionHeading}>Notes coach</Text>
                            <MaterialCommunityIcons
                                name={coachNotesExpanded ? "chevron-up" : "chevron-down"}
                                size={18}
                                color={coachNotesExpanded ? UI_COLORS.accent : UI_COLORS.textMuted}
                            />
                        </Pressable>
                        {coachNotesExpanded ? <Text style={styles.noteBody}>{session.coachNotes}</Text> : null}
                    </View>
                ) : null}

                {/* PARTICIPANTS */}
                <View style={[styles.card, styles.participantsCard]}>
                    <View style={styles.participantsHeader}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={participantsExpanded ? "Replier les participants" : "Déplier les participants"}
                            onPress={() => setParticipantsExpanded((value) => !value)}
                            style={({ pressed }) => [styles.participantsHeaderToggle, pressed && styles.participantsHeaderTogglePressed]}
                        >
                            <Text style={styles.sectionHeading}>{participantCountLabel}</Text>
                            <MaterialCommunityIcons
                                name={participantsExpanded ? "chevron-up" : "chevron-down"}
                                size={18}
                                color={participantsExpanded ? UI_COLORS.accent : UI_COLORS.textMuted}
                            />
                        </Pressable>
                        {isOwner && !sessionLocked ? (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.participantsActionButton,
                                    pressed && styles.participantsActionButtonPressed,
                                ]}
                                accessibilityRole="button"
                                onPress={handleOpenParticipantDialog}
                            >
                                <MaterialCommunityIcons name="account-plus" size={16} color={UI_COLORS.background} />
                                <Text style={styles.participantsActionButtonLabel}>Ajouter</Text>
                            </Pressable>
                        ) : canJoin ? (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.participantsJoinButton,
                                    pressed && styles.participantsJoinButtonPressed,
                                    (joinLoading || !currentUserId) && styles.participantsJoinButtonDisabled,
                                ]}
                                accessibilityRole="button"
                                onPress={handleJoinSession}
                                disabled={joinLoading || !currentUserId}
                            >
                                {joinLoading ? (
                                    <ActivityIndicator size="small" color={UI_COLORS.background} />
                                ) : (
                                    <>
                                        <MaterialCommunityIcons name={joinButtonIcon} size={14} color={UI_COLORS.background} />
                                        <Text
                                            style={styles.participantsJoinButtonLabel}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                        >
                                            {joinButtonLabel}
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        ) : canLeave ? (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.participantsLeaveButton,
                                    pressed && styles.participantsLeaveButtonPressed,
                                    (leaveLoading || !currentUserId) && styles.participantsLeaveButtonDisabled,
                                ]}
                                accessibilityRole="button"
                                onPress={handleLeaveSession}
                                disabled={leaveLoading || !currentUserId}
                            >
                                {leaveLoading ? (
                                    <ActivityIndicator size="small" color="#fecaca" />
                                ) : (
                                    <>
                                        <MaterialCommunityIcons name={leaveButtonIcon} size={14} color="#fecaca" />
                                        <Text
                                            style={styles.participantsLeaveButtonLabel}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                        >
                                            {leaveButtonLabel}
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        ) : null}
                    </View>

                    {participantsExpanded ? (
                        <>
                            <Text style={styles.participantsHint}>{participantsDescription}</Text>
                            {hasChronoEligibleParticipants ? (
                                <View style={styles.chronoHeaderRow}>
                                    <Text style={styles.chronoHint}>
                                        {chronosVisible ? "Masquer les chronos" : "Afficher les chronos"}
                                    </Text>
                                    <Switch
                                        value={chronosVisible}
                                        onValueChange={setChronosVisible}
                                        color={UI_COLORS.accent}
                                        accessibilityRole="switch"
                                        accessibilityLabel={chronosVisible ? "Masquer les chronos" : "Afficher les chronos"}
                                    />
                                </View>
                            ) : null}
                            <View style={styles.participantsList}>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.participantRow,
                                        ownerRowInteractive && styles.participantRowInteractive,
                                        pressed && ownerRowInteractive && styles.participantRowPressed,
                                    ]}
                                    accessibilityRole={ownerRowInteractive ? "button" : undefined}
                                    onPress={ownerRowInteractive ? () => handleOpenUserProfile(sessionOwnerId) : undefined}
                                    disabled={!ownerRowInteractive}
                                >
                                    {ownerPhotoUrl ? (
                                        <Avatar.Image
                                            size={36}
                                            source={{ uri: ownerPhotoUrl }}
                                            style={[styles.participantAvatar, styles.participantAvatarImage]}
                                        />
                                    ) : (
                                        <Avatar.Text
                                            size={36}
                                            label={ownerInitials}
                                            style={[styles.participantAvatar, { backgroundColor: ownerAvatarColor }]}
                                            color={UI_COLORS.background}
                                        />
                                    )}
                                    <View style={styles.participantContent}>
                                        <View style={styles.participantMeta}>
                                            <Text style={styles.participantName}>{ownerNameLabel}</Text>
                                            <Text style={styles.participantAdded}>a créé la séance</Text>
                                        </View>
                                    </View>
                                </Pressable>
                                {!isCoachParticipantRef(sessionOwnerRef) ? renderChronoInputsForParticipant(sessionOwnerId) : null}
                                {participants.length ? (
                                    participants.map((participant, index) => {
                                        const userRef = toParticipantRef(participant.user);
                                        const participantUserId = getUserIdFromRef(userRef);
                                        const participantKey = participantUserId || `participant-${index}`;
                                        const hideChronosForParticipant = isCoachParticipantRef(userRef);
                                        const isCurrent = Boolean(
                                            currentUserId && participantUserId && participantUserId === currentUserId,
                                        );
                                        const displayName = getParticipantDisplayName(userRef);
                                        const avatarColor = getParticipantColor(participantUserId || String(index));
                                        const participantPhotoUrl = getProfilePhotoUri(userRef?.photoUrl);
                                        const normalizedStatus = normalizeParticipantStatus(
                                            participant.status as ParticipantStatus | undefined,
                                        );
                                        const confirmationDate = (() => {
                                            if (normalizedStatus !== "confirmed") {
                                                return null;
                                            }
                                            const source = participant.confirmedAt || participant.addedAt;
                                            return source ? new Date(source) : null;
                                        })();
                                        const confirmationLabel = confirmationDate
                                            ? confirmationDate.toLocaleTimeString("fr-FR", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })
                                            : null;
                                        const canRemoveParticipant = Boolean(
                                            isOwner &&
                                            participantUserId &&
                                            participantUserId !== sessionOwnerId &&
                                            !sessionLocked,
                                        );
                                        const isRemovingParticipant = Boolean(
                                            participantUserId && removingParticipantIds[participantUserId],
                                        );
                                        return (
                                            <View key={`${participantKey}-${index}`} style={styles.participantBlock}>
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.participantRow,
                                                        participantUserId && styles.participantRowInteractive,
                                                        pressed && participantUserId && styles.participantRowPressed,
                                                    ]}
                                                    accessibilityRole={participantUserId ? "button" : undefined}
                                                    onPress={participantUserId ? () => handleOpenUserProfile(participantUserId) : undefined}
                                                    disabled={!participantUserId}
                                                >
                                                    {participantPhotoUrl ? (
                                                        <Avatar.Image
                                                            size={36}
                                                            source={{ uri: participantPhotoUrl }}
                                                            style={[styles.participantAvatar, styles.participantAvatarImage]}
                                                        />
                                                    ) : (
                                                        <Avatar.Text
                                                            size={36}
                                                            label={getInitialsFromLabel(displayName)}
                                                            style={[styles.participantAvatar, { backgroundColor: avatarColor }]}
                                                            color={UI_COLORS.background}
                                                        />
                                                    )}
                                                    <View style={styles.participantContent}>
                                                        <View style={styles.participantMeta}>
                                                            <Text style={styles.participantName}>
                                                                {displayName}
                                                                {isCurrent ? " (vous)" : ""}
                                                            </Text>
                                                            <View style={styles.participantStatusRow}>
                                                                <View
                                                                    style={[
                                                                        styles.participantStatusChip,
                                                                        normalizedStatus === "confirmed"
                                                                            ? styles.participantStatusChipConfirmed
                                                                            : styles.participantStatusChipPending,
                                                                    ]}
                                                                >
                                                                    <Text style={styles.participantStatusChipText}>
                                                                        {formatParticipantStatusLabel(normalizedStatus)}
                                                                    </Text>
                                                                </View>
                                                                {confirmationLabel ? (
                                                                    <Text style={styles.participantAdded}>
                                                                        à {confirmationLabel}
                                                                    </Text>
                                                                ) : null}
                                                            </View>
                                                        </View>
                                                    </View>
                                                    {canRemoveParticipant && participantUserId ? (
                                                        <Pressable
                                                            style={({ pressed }) => [
                                                                styles.participantRemoveButton,
                                                                pressed && styles.participantRemoveButtonPressed,
                                                                isRemovingParticipant && styles.participantRemoveButtonDisabled,
                                                            ]}
                                                            accessibilityRole="button"
                                                            onPress={(event) => {
                                                                event.stopPropagation();
                                                                confirmRemoveParticipant(participantUserId, displayName);
                                                            }}
                                                            disabled={isRemovingParticipant}
                                                        >
                                                            {isRemovingParticipant ? (
                                                                <ActivityIndicator size="small" color="#fecaca" />
                                                            ) : (
                                                                <MaterialCommunityIcons name="account-remove" size={16} color="#fca5a5" />
                                                            )}
                                                        </Pressable>
                                                    ) : null}
                                                </Pressable>
                                                {!hideChronosForParticipant
                                                    ? renderChronoInputsForParticipant(participantUserId)
                                                    : null}
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.participantsEmpty}>Aucun participant inscrit pour le moment.</Text>
                                )}
                            </View>
                            {hasChronoEligibleParticipants && isOwner && chronosVisible ? (
                                <View style={styles.chronoSaveBottomRow}>
                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.chronoSaveButton,
                                            pressed && styles.chronoSaveButtonPressed,
                                            (!canEditChronos || chronoSaving) && styles.chronoSaveButtonDisabled,
                                        ]}
                                        accessibilityRole="button"
                                        onPress={handleSaveChronos}
                                        disabled={!canEditChronos || chronoSaving}
                                    >
                                        {chronoSaving ? (
                                            <ActivityIndicator size="small" color={UI_COLORS.background} />
                                        ) : (
                                            <>
                                                <MaterialCommunityIcons
                                                    name="content-save"
                                                    size={16}
                                                    color={UI_COLORS.background}
                                                />
                                                <Text style={styles.chronoSaveButtonLabel}>Enregistrer les chronos</Text>
                                            </>
                                        )}
                                    </Pressable>
                                </View>
                            ) : null}
                        </>
                    ) : null}
                </View>

                {session.athleteFeedback ? (
                    <View style={[styles.card, styles.noteCard]}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={athleteFeedbackExpanded ? "Replier le feedback athlète" : "Déplier le feedback athlète"}
                            onPress={() => setAthleteFeedbackExpanded((value) => !value)}
                            style={({ pressed }) => [styles.accordionHeaderRow, athleteFeedbackExpanded && styles.accordionHeaderRowActive, pressed && styles.accordionHeaderRowPressed]}
                        >
                            <Text style={styles.sectionHeading}>Feedback athlète</Text>
                            <MaterialCommunityIcons
                                name={athleteFeedbackExpanded ? "chevron-up" : "chevron-down"}
                                size={18}
                                color={athleteFeedbackExpanded ? UI_COLORS.accent : UI_COLORS.textMuted}
                            />
                        </Pressable>
                        {athleteFeedbackExpanded ? (
                            <Text style={styles.noteBody}>{session.athleteFeedback}</Text>
                        ) : null}
                    </View>
                ) : null}

            </ScrollView>
            <Portal>
                <Dialog visible={participantDialogVisible} onDismiss={closeParticipantDialog}>
                    <Dialog.Title>Ajouter un participant</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            label="Rechercher un athlète"
                            value={participantInput}
                            onChangeText={(value) => {
                                setParticipantInput(value);
                                setSelectedParticipant(null);
                            }}
                            autoCapitalize="none"
                            autoCorrect={false}
                            mode="outlined"
                            style={styles.dialogTextInput}
                            placeholder="Nom, pseudo ou identifiant"
                            returnKeyType="done"
                            onSubmitEditing={handleAddParticipant}
                            disabled={participantSaving}
                        />
                        {participantInput.trim().length >= 2 ? (
                            <View style={styles.participantSuggestionList}>
                                {participantSearchLoading ? (
                                    <View style={styles.participantSuggestionLoading}>
                                        <ActivityIndicator size="small" color={UI_COLORS.accent} />
                                    </View>
                                ) : participantSuggestions.length ? (
                                    participantSuggestions.map((suggestion, index) => {
                                        const displayName =
                                            suggestion.fullName?.trim() ||
                                            suggestion.username?.trim() ||
                                            buildFallbackLabel(suggestion.id);
                                        const isSelected = selectedParticipant?.id === suggestion.id;
                                        return (
                                            <Pressable
                                                key={suggestion.id}
                                                style={[
                                                    styles.participantSuggestionRow,
                                                    index === participantSuggestions.length - 1 && styles.participantSuggestionRowLast,
                                                    isSelected && styles.participantSuggestionRowSelected,
                                                ]}
                                                onPress={() => handleSelectParticipantSuggestion(suggestion)}
                                            >
                                                {suggestion.photoUrl ? (
                                                    <Avatar.Image size={32} source={{ uri: suggestion.photoUrl }} style={styles.participantSuggestionAvatar} />
                                                ) : (
                                                    <Avatar.Text
                                                        size={32}
                                                        label={getInitialsFromLabel(displayName)}
                                                        style={[styles.participantSuggestionAvatar, { backgroundColor: getParticipantColor(suggestion.id) }]}
                                                        color="#010617"
                                                    />
                                                )}
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.participantSuggestionName}>{displayName}</Text>
                                                    {suggestion.username ? (
                                                        <Text style={styles.participantSuggestionHandle}>@{suggestion.username}</Text>
                                                    ) : null}
                                                </View>
                                                {isSelected ? (
                                                    <MaterialCommunityIcons name="check-circle" size={18} color={UI_COLORS.accent} />
                                                ) : null}
                                            </Pressable>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.participantSuggestionEmpty}>Aucun athlète correspondant pour le moment.</Text>
                                )}
                            </View>
                        ) : (
                            <Text style={styles.participantSuggestionHint}>Tapez au moins 2 lettres pour lancer la recherche.</Text>
                        )}
                        <Text style={styles.dialogHint}>L&apos;athlète peut trouver son identifiant dans son profil.</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={closeParticipantDialog} disabled={participantSaving} textColor="#94a3b8">
                            Annuler
                        </Button>
                        <Button
                            onPress={handleAddParticipant}
                            loading={participantSaving}
                            disabled={!participantInput.trim() || participantSaving}
                            textColor={UI_COLORS.accent}
                        >
                            Ajouter
                        </Button>
                    </Dialog.Actions>
                </Dialog>
                <Dialog visible={Boolean(paceWarningDialog)} onDismiss={handleClosePaceWarningDialog}>
                    <Dialog.Title>Compléter votre profil</Dialog.Title>
                    <Dialog.Content>
                        {paceWarningDialog ? (
                            <>
                                <Text style={styles.paceWarningDialogText}>
                                    {paceWarningDialog.mode === "distance"
                                        ? `Ajoutez votre record sur ${paceWarningDialog.label} pour personnaliser les intensités.`
                                        : `Ajoutez ${paceWarningDialog.label} (kg) pour débloquer les charges personnalisées.`}
                                </Text>
                                <TextInput
                                    label={
                                        paceWarningDialog.mode === "distance"
                                            ? `Record ${paceWarningDialog.label}`
                                            : `${paceWarningDialog.label} (kg)`
                                    }
                                    value={paceWarningInput}
                                    onChangeText={setPaceWarningInput}
                                    keyboardType={paceWarningDialog.mode === "load" ? "numeric" : "default"}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    mode="outlined"
                                    style={styles.dialogTextInput}
                                    placeholder={paceWarningDialog.mode === "distance" ? "ex: 10.52s" : "ex: 80"}
                                    editable={!paceWarningSaving}
                                />
                                <Text style={styles.dialogHint}>
                                    Ces données restent privées et éviteront ce warning sur vos prochaines séances.
                                </Text>
                            </>
                        ) : null}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={handleClosePaceWarningDialog} disabled={paceWarningSaving} textColor="#94a3b8">
                            Annuler
                        </Button>
                        <Button
                            onPress={handleSubmitPaceWarning}
                            loading={paceWarningSaving}
                            disabled={paceWarningSaving}
                            textColor={UI_COLORS.accent}
                        >
                            Enregistrer
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 14,
        padding: 9,
        backgroundColor: UI_COLORS.surface,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
    },
    accordionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 4,
        paddingHorizontal: 2,
        borderRadius: 10,
    },
    accordionHeaderRowActive: {
        backgroundColor: "rgba(34,211,238,0.06)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.22)",
        paddingHorizontal: 8,
    },
    accordionHeaderRowPressed: {
        opacity: 0.9,
    },
    participantsHeaderToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 1,
        paddingVertical: 4,
        paddingHorizontal: 2,
        borderRadius: 10,
    },
    participantsHeaderTogglePressed: {
        opacity: 0.9,
    },
    seriesHeaderPressable: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingVertical: 2,
    },
    seriesHeaderPressablePressed: {
        opacity: 0.9,
    },
    seriesHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    equipmentListRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginLeft: 8,
    },
    equipmentChip: {
        backgroundColor: 'rgba(34,211,238,0.10)',
        borderColor: 'rgba(34,211,238,0.35)',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 2,
        color: UI_COLORS.text,
        fontSize: 11,
        marginBottom: 4,
    },
    heroHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
        gap: 8,
    },
    heroTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        gap: 12,
    },
    topActionsBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingHorizontal: 14,
        paddingBottom: 8,
        backgroundColor: UI_COLORS.background,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(148,163,184,0.12)",
    },
    heroActionButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        minHeight: 30,
        backgroundColor: UI_COLORS.accent,
    },
    heroActionButtonDanger: {
        backgroundColor: "rgba(248,113,113,0.12)",
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.45)",
    },
    heroActionButtonPressed: {
        opacity: 0.9,
    },
    heroActionButtonDisabled: {
        opacity: 0.55,
    },
    heroActionButtonLabel: {
        color: UI_COLORS.background,
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0.4,
    },
    heroActionButtonLabelDanger: {
        color: UI_COLORS.danger,
    },
    heroHeaderItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginBottom: 1,
    },
    heroHeaderDate: {
        color: UI_COLORS.accent,
        fontSize: 10,
        fontWeight: '600',
    },
    heroHeaderPlace: {
        color: UI_COLORS.textMuted,
        fontSize: 10,
        fontWeight: '500',
    },
    heroHeaderType: {
        color: UI_COLORS.text,
        fontSize: 10,
        fontWeight: '600',
        textAlign: 'right',
    },
    heroHeaderStatus: {
        color: UI_COLORS.textMuted,
        fontSize: 10,
        fontWeight: '500',
        textAlign: 'right',
    },
    statusPill: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-end",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: UI_COLORS.surfaceChip,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        marginTop: 2,
    },
    statusPillAccent: {
        borderColor: "rgba(34,211,238,0.35)",
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    statusPillDanger: {
        borderColor: "rgba(248,113,113,0.35)",
        backgroundColor: "rgba(248,113,113,0.10)",
    },
    statusPillText: {
        fontSize: 10,
        fontWeight: "700",
        color: UI_COLORS.text,
    },
    safeArea: {
        flex: 1,
        backgroundColor: UI_COLORS.background,
    },
    container: {
        paddingHorizontal: 14,
        paddingVertical: 16,
        flexGrow: 1,
        gap: 12,
        backgroundColor: UI_COLORS.background,
    },
    heroCard: {
        borderRadius: 16,
        padding: 10,
        backgroundColor: UI_COLORS.surface,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        shadowColor: "#000000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 8 },
        gap: 3,
    },
    heroOverline: {
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: UI_COLORS.textMuted,
    },
    heroTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: UI_COLORS.text,
    },
    heroSubtitle: {
        color: "#cbd5e1",
        lineHeight: 16,
        fontSize: 11,
    },
    heroMetaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: 6,
        marginTop: 6,

    },
    metaChip: {
        flexGrow: 1,
        minWidth: 90,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
        gap: 1,
    },
    metaLabel: {
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "#94a3b8",
    },
    metaValue: {
        color: "#f8fafc",
        fontWeight: "600",
        fontSize: 12,
    },
    metricsCard: {
        borderRadius: 14,
        padding: 7,
        backgroundColor: UI_COLORS.surfaceMuted,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 6,
    },
    participantsCard: {
        borderRadius: 14,
        padding: 9,
        backgroundColor: UI_COLORS.surfaceMuted,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 6,
    },
    participantsHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    participantsActionButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        backgroundColor: UI_COLORS.accent,
        paddingHorizontal: 12,
        paddingVertical: 5,
        minHeight: 32,
    },
    participantsActionButtonPressed: {
        opacity: 0.9,
    },
    participantsActionButtonLabel: {
        color: UI_COLORS.background,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
    participantSuggestionList: {
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
        backgroundColor: "rgba(2,6,23,0.9)",
        overflow: "hidden",
    },
    participantSuggestionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(15,23,42,0.5)",
    },
    participantSuggestionRowLast: {
        borderBottomWidth: 0,
    },
    participantSuggestionRowSelected: {
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    participantSuggestionName: {
        color: "#f8fafc",
        fontSize: 13,
        fontWeight: "600",
    },
    participantSuggestionHandle: {
        color: "#94a3b8",
        fontSize: 11,
    },
    participantSuggestionEmpty: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#94a3b8",
        fontSize: 12,
        textAlign: "center",
    },
    participantSuggestionLoading: {
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    participantSuggestionHint: {
        marginTop: 12,
        color: "#94a3b8",
        fontSize: 12,
    },
    participantSuggestionAvatar: {
        backgroundColor: "rgba(34,211,238,0.2)",
    },
    participantsJoinButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        backgroundColor: UI_COLORS.accent,
        paddingHorizontal: 12,
        paddingVertical: 4,
        minHeight: 30,
    },
    participantsJoinButtonPressed: {
        opacity: 0.9,
    },
    participantsJoinButtonDisabled: {
        opacity: 0.55,
    },
    participantsJoinButtonLabel: {
        color: UI_COLORS.background,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
    participantsLeaveButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        backgroundColor: "rgba(239,68,68,0.12)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.45)",
        paddingHorizontal: 12,
        paddingVertical: 4,
        minHeight: 30,
    },
    participantsLeaveButtonPressed: {
        opacity: 0.9,
    },
    participantsLeaveButtonDisabled: {
        opacity: 0.55,
    },
    participantsLeaveButtonLabel: {
        color: "#fecaca",
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
    participantsHint: {
        color: "#94a3b8",
        fontSize: 11,
    },
    chronoHeaderRow: {
        marginTop: 12,
        marginBottom: 6,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    chronoHint: {
        color: "#e2e8f0",
        fontSize: 12,
        fontWeight: "700",
    },
    chronoSaveButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: UI_COLORS.accent,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    chronoSaveButtonPressed: {
        opacity: 0.9,
    },
    chronoSaveButtonDisabled: {
        opacity: 0.55,
    },
    chronoSaveButtonLabel: {
        color: UI_COLORS.background,
        fontWeight: "700",
        fontSize: 12,
    },
    chronoSaveBottomRow: {
        marginTop: 16,
        alignItems: "flex-end",
    },
    participantsList: {
        marginTop: 6,
        gap: 8,
    },
    participantBlock: {
        gap: 6,
    },
    participantRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(15,23,42,0.6)",
    },
    participantRowInteractive: {
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 18,
        marginHorizontal: -6,
    },
    participantRowPressed: {
        backgroundColor: "rgba(15,23,42,0.45)",
    },
    participantAvatar: {
        backgroundColor: "rgba(34,211,238,0.22)",
    },
    participantAvatarImage: {
        backgroundColor: "rgba(2,6,23,0.4)",
    },
    participantContent: {
        flex: 1,
        gap: 6,
    },
    participantMeta: {
        flex: 1,
    },
    participantName: {
        color: "#f8fafc",
        fontSize: 13,
        fontWeight: "600",
    },
    participantAdded: {
        color: "#94a3b8",
        fontSize: 11,
        marginTop: 1,
    },
    participantRemoveButton: {
        padding: 6,
        borderRadius: 999,
        backgroundColor: "rgba(248,113,113,0.08)",
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.35)",
    },
    participantRemoveButtonPressed: {
        opacity: 0.85,
    },
    participantRemoveButtonDisabled: {
        opacity: 0.5,
    },
    participantStatusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 4,
    },
    participantStatusChip: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginTop: 4,
        borderWidth: 1,
    },
    participantStatusChipConfirmed: {
        backgroundColor: "rgba(34,211,238,0.10)",
        borderColor: "rgba(34,211,238,0.32)",
    },
    participantStatusChipPending: {
        backgroundColor: "rgba(15,23,42,0.6)",
        borderColor: UI_COLORS.border,
    },
    participantChronoList: {
        gap: 2,
        marginTop: 6,
        marginBottom: 4,
    },
    participantChronoRow: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
    },
    participantChronoLabelWrapper: {
        flex: 1,
    },
    participantChronoLabel: {
        color: "#e2e8f0",
        fontSize: 10,
        fontWeight: "700",
        marginBottom: 2,
    },
    participantChronoSubLabel: {
        color: "#94a3b8",
        fontSize: 9,
        marginTop: 0,
        textAlign: "center",
    },
    participantChronoInputsRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 3,
        paddingRight: 0,
    },
    participantChronoInputWrapper: {
        width: "auto",
    },
    participantChronoInput: {
        backgroundColor: "rgba(15,23,42,0.7)",
        fontSize: 9,
    },
    participantStatusChipText: {
        color: "#f8fafc",
        fontSize: 7,
        fontWeight: "600",
    },
    participantsEmpty: {
        color: "#64748b",
        fontSize: 12,
        paddingVertical: 4,
    },
    sectionHeading: {
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.2,
        color: UI_COLORS.text,
    },
    metricsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 5,
    },
    metricItem: {
        flexGrow: 1,
        minWidth: 70,
        padding: 6,
        borderRadius: 8,
        backgroundColor: UI_COLORS.surfaceChip,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 2,
    },
    metricValue: {
        fontSize: 14,
        fontWeight: "700",
        color: UI_COLORS.text,
    },
    metricLabel: {
        color: UI_COLORS.textMuted,
        fontSize: 10,
    },
    blockCard: {
        borderRadius: 14,
        padding: 7,
        backgroundColor: UI_COLORS.surfaceMuted,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 6,
    },
    blockHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 2,
    },
    blockHint: {
        color: "#94a3b8",
        fontSize: 10,
    },
    seriesList: {
        gap: 5,
    },
    seriesCard: {
        borderRadius: 10,
        padding: 5,
        backgroundColor: "rgba(3,7,18,0.7)",
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 4,
    },
    seriesHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    seriesBadge: {
        fontSize: 9,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: "#94a3b8",
    },
    seriesTitle: {
        fontSize: 12,
        fontWeight: "600",
        color: "#f8fafc",
        marginTop: 1,
    },
    seriesRepeatPill: {
        backgroundColor: "rgba(15,23,42,0.6)",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        alignItems: "center",
    },
    seriesRepeatValue: {
        fontSize: 11,
        fontWeight: "700",
        color: UI_COLORS.text,
    },
    seriesRepeatHint: {
        fontSize: 9,
        color: UI_COLORS.textMuted,
    },
    paceRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-start",
        marginTop: 6,
    },
    paceChip: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(15,23,42,0.6)",
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
        marginRight: 6,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 4,
    },
    paceChipText: {
        color: UI_COLORS.text,
        fontWeight: "600",
        fontSize: 10,
    },
    paceWarningButton: {
        width: 20,
        height: 20,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.5)",
        backgroundColor: "rgba(248,113,113,0.12)",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 6,
        marginBottom: 6,
    },
    paceWarningButtonPressed: {
        opacity: 0.85,
    },
    segmentList: {
        gap: 3,
    },
    segmentItem: {
        padding: 5,
        borderRadius: 8,
        backgroundColor: "rgba(2,8,23,0.8)",
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 3,
    },
    segmentItemRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    segmentBadge: {
        fontSize: 9,
        color: "#94a3b8",
        letterSpacing: 0.3,
    },
    segmentRepeat: {
        color: UI_COLORS.textMuted,
        fontWeight: "700",
        fontSize: 10,
    },
    segmentTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    segmentTitle: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        backgroundColor: UI_COLORS.surfaceChip,
        color: UI_COLORS.text,
        fontSize: 10,
        fontWeight: "600",
    },
    segmentTypeChip: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        backgroundColor: UI_COLORS.surfaceChip,
        color: UI_COLORS.text,
        fontSize: 10,
        fontWeight: "600",
    },
    segmentDistance: {
        fontSize: 13,
        fontWeight: "700",
        color: "#f8fafc",
    },
    segmentMetaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    segmentMetaChip: {
        backgroundColor: "rgba(15,23,42,0.6)",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        paddingHorizontal: 7,
        paddingVertical: 2,
        marginRight: 6,
        marginBottom: 6,
    },
    segmentMetaChipText: {
        color: UI_COLORS.text,
        fontSize: 10,
        fontWeight: "600",
    },
    segmentPacePreview: {
        marginTop: 6,
        padding: 8,
        borderRadius: 10,
        backgroundColor: "rgba(8,25,43,0.85)",
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        gap: 2,
    },
    segmentPacePreviewLabel: {
        color: UI_COLORS.textMuted,
        fontSize: 10,
        letterSpacing: 0.4,
        textTransform: "uppercase",
    },
    segmentPacePreviewValue: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "700",
    },
    segmentPacePreviewHint: {
        color: UI_COLORS.textMuted,
        fontSize: 11,
    },
    segmentGoal: {
        fontSize: 11,
        fontWeight: "600",
        color: UI_COLORS.text,
    },
    segmentGoalMuted: {
        fontSize: 11,
        fontWeight: "500",
        color: UI_COLORS.textMuted,
    },
    segmentNote: {
        color: UI_COLORS.textMuted,
        lineHeight: 14,
        fontSize: 10,
    },
    segmentExtraList: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    segmentExtraChip: {
        backgroundColor: "rgba(15,23,42,0.7)",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: UI_COLORS.border,
        paddingHorizontal: 7,
        paddingVertical: 2,
        marginRight: 6,
        marginBottom: 6,
    },
    segmentExtraChipText: {
        color: "#e2e8f0",
        fontSize: 10,
        fontWeight: "600",
    },
    noteCard: {
        borderRadius: 12,
        padding: 8,
        backgroundColor: UI_COLORS.surfaceMuted,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 3,
    },
    noteBody: {
        color: "#e2e8f0",
        lineHeight: 14,
        fontSize: 10,
    },
    refreshButton: {
        alignSelf: "flex-start",
        borderColor: "rgba(148,163,184,0.4)",
        minHeight: 28,
        paddingVertical: 2,
        paddingHorizontal: 8,
    },
    footerActions: {
        flexDirection: "column",
        gap: 6,
        marginTop: 4,
    },
    footerButton: {
        alignSelf: "stretch",
        minHeight: 28,
        paddingVertical: 2,
        paddingHorizontal: 8,
        fontSize: 12,
    },
    sessionLockedBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.4)",
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "rgba(248,113,113,0.12)",
    },
    sessionLockedText: {
        color: "#fecaca",
        fontSize: 12,
        fontWeight: "600",
    },
    deleteButton: {
        borderRadius: 10,
    },
    stateContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        gap: 6,
    },
    stateText: {
        color: "#f8fafc",
        textAlign: "center",
        fontSize: 12,
    },
    dialogTextInput: {
        marginBottom: 6,
        backgroundColor: "#010617",
    },
    dialogHint: {
        color: "#94a3b8",
        fontSize: 10,
    },
    paceWarningDialogText: {
        color: "#f8fafc",
        fontSize: 12,
        lineHeight: 16,
        marginBottom: 10,
    },
});
