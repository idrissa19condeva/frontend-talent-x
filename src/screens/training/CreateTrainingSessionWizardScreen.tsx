import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    KeyboardEvent,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";

import { useTraining } from "../../context/TrainingContext";
import { useTrainingTemplatesList } from "../../hooks/useTrainingTemplatesList";
import { createSessionFromTemplate, getTrainingTemplate } from "../../api/trainingTemplateService";
import { consumeNavigationResult } from "../../utils/navigationResults";
import { TrainingTemplate } from "../../types/trainingTemplate";
import { formatDurationLabel } from "../../utils/trainingFormatter";
import { TrainingSession } from "../../types/training";

type WizardStep = 1 | 2 | 3;

const normalizeTime = (value: string) => {
    const trimmed = value.trim();
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : null;
};

const parseTimeToDate = (value: string): Date | null => {
    const normalized = normalizeTime(value);
    if (!normalized) return null;
    const [hours, minutes] = normalized.split(":");
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);
    return date;
};

const formatTimeValue = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
};

const clampDurationMinutes = (value: number) => {
    if (!Number.isFinite(value)) return 60;
    return Math.max(1, Math.min(23 * 60 + 59, Math.round(value)));
};

const buildDurationDate = (durationMinutes: number): Date => {
    const safe = clampDurationMinutes(durationMinutes);
    const date = new Date();
    date.setHours(Math.floor(safe / 60), safe % 60, 0, 0);
    return date;
};

const minutesFromDate = (date: Date): number => clampDurationMinutes(date.getHours() * 60 + date.getMinutes());

const formatTemplateSubtitle = (template: TrainingTemplate) => {
    const parts: string[] = [];
    if (template.type) parts.push(template.type);
    if (typeof template.version === "number") parts.push(`v${template.version}`);
    return parts.join(" · ");
};

export default function CreateTrainingSessionWizardScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ templateId?: string; id?: string; groupId?: string }>();
    const segments = useSegments();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const isEditMode = useMemo(() => segments.join("/").includes("edit"), [segments]);
    const routeId = (params?.id || "").toString();
    const initialTemplateId = (params?.templateId || (!isEditMode ? routeId : "") || "").toString();
    const initialGroupId = (params?.groupId || "").toString();
    const editingSessionId = isEditMode ? routeId : "";

    const { fetchSession, updateSession } = useTraining();
    const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
    const [prefillLoading, setPrefillLoading] = useState(false);
    const [prefillError, setPrefillError] = useState<string | null>(null);

    const [step, setStep] = useState<WizardStep>(1);
    const [templatePickerEnabled, setTemplatePickerEnabled] = useState<boolean>(Boolean(initialTemplateId));
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId || "");
    const [selectedTemplateTitle, setSelectedTemplateTitle] = useState<string>("");
    const [pendingTemplateReturnKey, setPendingTemplateReturnKey] = useState<string>("");
    const pendingTemplateReturnKeyRef = useRef<string>("");
    const wasFocusedRef = useRef<boolean>(true);

    const [submitting, setSubmitting] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [placeFocused, setPlaceFocused] = useState(false);

    const scrollViewRef = useRef<ScrollView | null>(null);
    const placeFieldRef = useRef<View | null>(null);
    const scrollYRef = useRef(0);

    const [date, setDate] = useState<Date>(() => new Date());
    const [time, setTime] = useState("09:00");
    const [durationMinutes, setDurationMinutes] = useState<number>(60);
    const [place, setPlace] = useState("");

    const [datePickerVisible, setDatePickerVisible] = useState(false);
    const [durationPickerVisible, setDurationPickerVisible] = useState(false);
    const [timePickerVisible, setTimePickerVisible] = useState(false);

    const { templates, loading: templatesLoading, error: templatesError, refresh: refreshTemplates } = useTrainingTemplatesList();

    const loadSessionForEdit = useCallback(async () => {
        if (!isEditMode || !editingSessionId) return;
        setPrefillError(null);
        setPrefillLoading(true);
        try {
            const session = await fetchSession(editingSessionId);
            setEditingSession(session);
            setDate(new Date(session.date));
            setTime(session.startTime || "09:00");
            setDurationMinutes(session.durationMinutes || 60);
            setPlace(session.place || "");

            if (session.templateId) {
                setSelectedTemplateId(session.templateId);
                setSelectedTemplateTitle(session.templateSnapshot?.title || "");
            }
        } catch (e: any) {
            setPrefillError(e?.message || "Impossible de charger la séance");
        } finally {
            setPrefillLoading(false);
        }
    }, [editingSessionId, fetchSession, isEditMode]);

    useEffect(() => {
        if (!isEditMode) {
            setEditingSession(null);
            setPrefillError(null);
            setPrefillLoading(false);
            return;
        }
        loadSessionForEdit();
    }, [isEditMode, loadSessionForEdit]);

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

    const ensurePlaceFieldVisible = useCallback(() => {
        if (!keyboardHeight) return;
        if (step !== 1) return;
        if (!placeFieldRef.current) return;
        if (!scrollViewRef.current) return;

        placeFieldRef.current.measureInWindow((_x, y, _w, h) => {
            const windowHeight = Dimensions.get("window").height;
            const keyboardTop = windowHeight - keyboardHeight;
            const fieldBottom = y + h;
            const margin = 16;

            if (fieldBottom + margin <= keyboardTop) {
                return;
            }

            const delta = fieldBottom + margin - keyboardTop;
            const nextY = Math.max(0, scrollYRef.current + delta);
            scrollViewRef.current?.scrollTo({ y: nextY, animated: true });
        });
    }, [keyboardHeight, step]);

    useEffect(() => {
        if (!placeFocused) return;
        if (!keyboardHeight) return;
        if (step !== 1) return;
        const timer = setTimeout(() => {
            ensurePlaceFieldVisible();
        }, 50);
        return () => clearTimeout(timer);
    }, [ensurePlaceFieldVisible, keyboardHeight, placeFocused, step]);

    useEffect(() => {
        pendingTemplateReturnKeyRef.current = pendingTemplateReturnKey;
    }, [pendingTemplateReturnKey]);

    useEffect(() => {
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = isFocused;
        if (!isFocused || wasFocused) {
            return;
        }

        const returnKey = pendingTemplateReturnKeyRef.current;
        if (!returnKey) {
            return;
        }

        const result = consumeNavigationResult<{ templateId?: string; title?: string }>(returnKey);
        setPendingTemplateReturnKey("");

        if (!result?.templateId) {
            return;
        }

        setTemplatePickerEnabled(true);
        setSelectedTemplateId(result.templateId);
        setSelectedTemplateTitle(result.title || "");
        setStep(3);
    }, [isFocused]);

    const sortedTemplates = useMemo(() => {
        const list = [...templates];
        list.sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
        });
        return list;
    }, [templates]);

    const selectedTemplate = useMemo(
        () => (selectedTemplateId ? sortedTemplates.find((t) => t.id === selectedTemplateId) : undefined),
        [selectedTemplateId, sortedTemplates],
    );

    const canGoNextFromStep1 = useMemo(() => {
        if (!normalizeTime(time)) return false;
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return false;
        if (!place.trim()) return false;
        return true;
    }, [time, durationMinutes, place]);

    const canGoNextFromStep2 = useMemo(() => {
        return Boolean(selectedTemplateId);
    }, [selectedTemplateId]);

    const canSubmit = useMemo(() => {
        return canGoNextFromStep1 && canGoNextFromStep2;
    }, [canGoNextFromStep1, canGoNextFromStep2]);

    const ensureSelectedTemplateTitle = useCallback(async () => {
        if (!selectedTemplateId || selectedTemplateTitle) return;
        try {
            const fetched = await getTrainingTemplate(selectedTemplateId);
            setSelectedTemplateTitle(fetched.title);
        } catch {
            // silent; title will show as fallback
        }
    }, [selectedTemplateId, selectedTemplateTitle]);

    const handleUpdate = useCallback(async () => {
        if (!isEditMode || !editingSessionId || !editingSession) return;
        const normalizedTime = normalizeTime(time);
        const normalizedDuration = clampDurationMinutes(durationMinutes);
        const normalizedPlace = place.trim();
        if (!normalizedTime || !normalizedDuration || !normalizedPlace) {
            Alert.alert("Champs invalides", "Vérifie l'heure, la durée, et le lieu.");
            return;
        }
        if (!selectedTemplateId) {
            Alert.alert("Template requis", "Choisis un template.");
            setStep(2);
            return;
        }

        try {
            setSubmitting(true);
            const template = await getTrainingTemplate(selectedTemplateId);

            await updateSession(editingSessionId, {
                athleteId: editingSession.athleteId,
                date,
                startTime: normalizedTime,
                durationMinutes: normalizedDuration,
                type: template.type,
                title: template.title,
                place: normalizedPlace,
                description: template.description || "",
                series: template.series || [],
                seriesRestInterval: template.seriesRestInterval,
                seriesRestUnit: template.seriesRestUnit,
                targetIntensity: template.targetIntensity,
                coachNotes: editingSession.coachNotes,
                athleteFeedback: editingSession.athleteFeedback,
                equipment: template.equipment,
                templateId: template.id,
                templateSnapshot: template,
                status: editingSession.status,
                groupId: editingSession.group?.id || editingSession.groupId || undefined,
            } as any);

            router.replace(`/(main)/training/${editingSessionId}`);
        } catch (err: any) {
            Alert.alert("Erreur", err?.response?.data?.message || err?.message || "Impossible de mettre à jour la séance");
        } finally {
            setSubmitting(false);
        }
    }, [date, durationMinutes, editingSession, editingSessionId, isEditMode, place, router, selectedTemplateId, setStep, time, updateSession]);

    const goNext = useCallback(async () => {
        if (step === 1) {
            if (!canGoNextFromStep1) {
                Alert.alert("Champs invalides", "Renseigne la date, l'heure, la durée et le lieu.");
                return;
            }
            setStep(2);
            return;
        }
        if (step === 2) {
            if (!canGoNextFromStep2) {
                Alert.alert("Choix requis", "Choisis un template.");
                return;
            }
            await ensureSelectedTemplateTitle();
            setStep(3);
            return;
        }
    }, [canGoNextFromStep1, canGoNextFromStep2, ensureSelectedTemplateTitle, step]);

    const goBack = useCallback(() => {
        if (step === 1) {
            if (router.canGoBack?.()) {
                router.back();
            } else {
                router.replace("/(main)/training");
            }
            return;
        }
        setStep((prev) => (prev === 3 ? 2 : 1));
    }, [router, step]);

    const handleCreate = useCallback(async () => {
        const normalizedTime = normalizeTime(time);
        const normalizedDuration = clampDurationMinutes(durationMinutes);
        const normalizedPlace = place.trim();
        if (!normalizedTime || !normalizedDuration || !normalizedPlace) {
            Alert.alert("Champs invalides", "Vérifie l'heure, la durée, et le lieu.");
            return;
        }
        if (!selectedTemplateId) {
            Alert.alert("Template requis", "Choisis un template.");
            return;
        }

        try {
            setSubmitting(true);

            const session = await createSessionFromTemplate(selectedTemplateId, {
                date,
                startTime: normalizedTime,
                durationMinutes: normalizedDuration,
                groupId: initialGroupId ? initialGroupId : undefined,
                place: normalizedPlace,
            });
            router.replace(`/(main)/training/${session.id}`);
        } catch (err: any) {
            Alert.alert("Erreur", err?.response?.data?.message || err?.message || "Impossible de créer la séance");
        } finally {
            setSubmitting(false);
        }
    }, [date, durationMinutes, initialGroupId, place, router, selectedTemplateId, time]);

    if (isEditMode && prefillLoading) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateContainer}>
                    <ActivityIndicator color="#22d3ee" />
                    <Text style={styles.stateSubtitle}>Chargement de la séance...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (isEditMode && prefillError) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
                <View style={styles.stateContainer}>
                    <Text style={styles.stateTitle}>Impossible de charger</Text>
                    <Text style={styles.stateSubtitle}>{prefillError}</Text>
                    <Button
                        mode="contained"
                        onPress={loadSessionForEdit}
                        buttonColor="#22d3ee"
                        textColor="#02111f"
                        style={{ marginTop: 12 }}
                    >
                        Réessayer
                    </Button>
                </View>
            </SafeAreaView>
        );
    }

    const stepLabel = step === 1 ? "Planification" : step === 2 ? "Ajouter un plan d'entraînement" : "Finalisation";

    const bottomSpacing = Math.max(insets.bottom, 0);
    const keyboardVerticalOffset = Platform.OS === "ios" ? 64 : 0;
    const scrollBottomPadding = bottomSpacing + (keyboardHeight > 0 ? keyboardHeight + 32 : 0);

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={keyboardVerticalOffset}
            >
                <ScrollView
                    ref={(node) => {
                        scrollViewRef.current = node;
                    }}
                    style={styles.scroll}
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                        scrollYRef.current = event.nativeEvent.contentOffset.y;
                    }}
                    contentContainerStyle={[
                        styles.container,
                        { paddingTop: insets.top + 10, paddingBottom: scrollBottomPadding + 20 },
                    ]}
                    refreshControl={
                        step === 2 ? (
                            <RefreshControl refreshing={templatesLoading} onRefresh={refreshTemplates} tintColor="#22d3ee" />
                        ) : undefined
                    }
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>{isEditMode ? "Modifier une séance" : "Créer une séance"}</Text>
                        <Text style={styles.subtitle}>{stepLabel}</Text>
                    </View>

                    <View style={styles.card}>
                        {step === 1 ? (
                            <>
                                <View style={{ gap: 6 }}>
                                    <Text style={styles.fieldLabel}>Date</Text>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => setDatePickerVisible(true)}
                                        style={({ pressed }) => [styles.pickerTrigger, pressed && styles.pickerTriggerPressed]}
                                    >
                                        <Text style={styles.pickerValue}>
                                            {date.toLocaleDateString("fr-FR", {
                                                weekday: "long",
                                                day: "2-digit",
                                                month: "long",
                                                year: "numeric",
                                            })}
                                        </Text>
                                        <MaterialCommunityIcons name="pencil-outline" size={16} color="#94a3b8" />
                                    </Pressable>
                                </View>

                                {datePickerVisible ? (
                                    <DateTimePicker
                                        value={date}
                                        mode="date"
                                        display="default"
                                        onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                                            setDatePickerVisible(false);
                                            if (event.type === "set" && selectedDate) {
                                                setDate(selectedDate);
                                            }
                                        }}
                                    />
                                ) : null}

                                {durationPickerVisible ? (
                                    <DateTimePicker
                                        value={buildDurationDate(durationMinutes)}
                                        mode="time"
                                        display="default"
                                        is24Hour
                                        onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                                            setDurationPickerVisible(false);
                                            if (event.type === "set" && selectedDate) {
                                                setDurationMinutes(minutesFromDate(selectedDate));
                                            }
                                        }}
                                    />
                                ) : null}

                                {timePickerVisible ? (
                                    <DateTimePicker
                                        value={parseTimeToDate(time) ?? new Date()}
                                        mode="time"
                                        display="default"
                                        is24Hour
                                        onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                                            setTimePickerVisible(false);
                                            if (event.type === "set" && selectedDate) {
                                                setTime(formatTimeValue(selectedDate));
                                            }
                                        }}
                                    />
                                ) : null}

                                <View style={[styles.pickerRow, { marginTop: 14 }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cardTitle}>Heure de début</Text>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => setTimePickerVisible(true)}
                                            style={({ pressed }) => [styles.pickerTrigger, pressed && styles.pickerTriggerPressed]}
                                        >
                                            <Text style={styles.pickerValue}>{normalizeTime(time) ?? "Choisir"}</Text>
                                            <MaterialCommunityIcons name="pencil-outline" size={16} color="#94a3b8" />
                                        </Pressable>
                                    </View>

                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cardTitle}>Durée</Text>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => setDurationPickerVisible(true)}
                                            style={({ pressed }) => [styles.pickerTrigger, pressed && styles.pickerTriggerPressed]}
                                        >
                                            <Text style={styles.pickerValue}>
                                                {formatDurationLabel(durationMinutes) ?? `${durationMinutes}min`}
                                            </Text>
                                            <MaterialCommunityIcons name="pencil-outline" size={16} color="#94a3b8" />
                                        </Pressable>
                                    </View>
                                </View>

                                <View
                                    ref={(node) => {
                                        placeFieldRef.current = node;
                                    }}
                                    collapsable={false}
                                >
                                    <Text style={[styles.cardTitle, { marginTop: 14 }]}>Lieu</Text>
                                    <TextInput
                                        mode="outlined"
                                        value={place}
                                        onChangeText={setPlace}
                                        placeholder="Stade, piste, salle…"
                                        autoCapitalize="sentences"
                                        autoCorrect={false}
                                        onFocus={() => {
                                            setPlaceFocused(true);
                                            setTimeout(() => {
                                                ensurePlaceFieldVisible();
                                            }, 50);
                                        }}
                                        onBlur={() => setPlaceFocused(false)}
                                        style={styles.input}
                                    />
                                </View>
                            </>
                        ) : null}

                        {step === 2 ? (
                            <>
                                {templatesError ? (
                                    <View style={styles.stateContainer}>
                                        <Text style={styles.stateTitle}>Impossible de charger</Text>
                                        <Text style={styles.stateSubtitle}>{templatesError}</Text>
                                    </View>
                                ) : null}

                                <View style={styles.choiceRow}>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => {
                                            if (!canGoNextFromStep1) {
                                                Alert.alert("Planification requise", "Renseigne d'abord la date, l'heure, la durée et le lieu.");
                                                setStep(1);
                                                return;
                                            }

                                            const returnKey = `wizard-new-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                                            setPendingTemplateReturnKey(returnKey);
                                            router.push({
                                                pathname: "/(main)/training/templates/new",
                                                params: { returnKey } as any,
                                            });
                                        }}
                                        style={({ pressed }) => [
                                            styles.choiceCard,
                                            pressed && styles.choiceCardPressed,
                                        ]}
                                    >
                                        <View style={styles.choiceHeader}>
                                            <MaterialCommunityIcons name="file-outline" size={18} color="#38bdf8" />
                                            <Text style={styles.choiceTitle}>Nouvelle série</Text>
                                        </View>
                                        <Text style={styles.choiceSubtitle}>Créer un nouveau plan d&apos;entraînement</Text>
                                    </Pressable>

                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => setTemplatePickerEnabled(true)}
                                        style={({ pressed }) => [
                                            styles.choiceCard,
                                            templatePickerEnabled && styles.choiceCardActive,
                                            pressed && styles.choiceCardPressed,
                                        ]}
                                    >
                                        <View style={styles.choiceHeader}>
                                            <MaterialCommunityIcons name="bookmark-multiple-outline" size={18} color="#38bdf8" />
                                            <Text style={styles.choiceTitle}>Séries et blocs</Text>
                                        </View>
                                        <Text style={styles.choiceSubtitle}>Vos plans d&apos;entraînement</Text>
                                    </Pressable>
                                </View>

                                {templatePickerEnabled ? (
                                    <View style={{ marginTop: 10, gap: 10 }}>
                                        {templatesLoading && !sortedTemplates.length ? (
                                            <View style={styles.loadingBox}>
                                                <ActivityIndicator size="small" color="#22d3ee" />
                                            </View>
                                        ) : null}

                                        {!templatesLoading && !sortedTemplates.length ? (
                                            <View style={styles.stateContainer}>
                                                <Text style={styles.stateTitle}>Aucun template</Text>
                                                <Text style={styles.stateSubtitle}>Crée un template pour l&apos;utiliser ici.</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.list}>
                                                {sortedTemplates.map((template) => {
                                                    const active = selectedTemplateId === template.id;
                                                    return (
                                                        <Pressable
                                                            key={template.id}
                                                            accessibilityRole="button"
                                                            onPress={() => {
                                                                setSelectedTemplateId(template.id);
                                                                setSelectedTemplateTitle(template.title);
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.templateRow,
                                                                active && styles.templateRowActive,
                                                                pressed && styles.templateRowPressed,
                                                            ]}
                                                        >
                                                            <View style={styles.templateRowIcon}>
                                                                <MaterialCommunityIcons
                                                                    name={active ? "check-circle" : "checkbox-blank-circle-outline"}
                                                                    size={16}
                                                                    color={active ? "#22d3ee" : "#94a3b8"}
                                                                />
                                                            </View>
                                                            <View style={styles.templateRowMain}>
                                                                <Text style={styles.templateRowTitle}>{template.title}</Text>
                                                                <Text style={styles.templateRowSubtitle}>{formatTemplateSubtitle(template)}</Text>
                                                            </View>
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                ) : null}
                            </>
                        ) : null}

                        {step === 3 ? (
                            <>
                                <View style={styles.recapSection}>
                                    <View style={styles.recapHeader}>
                                        <Text style={styles.recapTitle}>Planification</Text>
                                        <Button mode="text" onPress={() => setStep(1)} textColor="#22d3ee">
                                            Modifier
                                        </Button>
                                    </View>
                                    <Text style={styles.recapLine}>
                                        {date.toLocaleDateString("fr-FR", {
                                            weekday: "long",
                                            day: "2-digit",
                                            month: "long",
                                            year: "numeric",
                                        })}
                                    </Text>
                                    <Text style={styles.recapLine}>
                                        {normalizeTime(time) ?? "—"} · {formatDurationLabel(durationMinutes) ?? `${durationMinutes}min`}
                                    </Text>
                                    <Text style={styles.recapLine}>{place.trim()}</Text>
                                </View>

                                <View style={styles.recapSection}>
                                    <View style={styles.recapHeader}>
                                        <Text style={styles.recapTitle}>Contenu</Text>
                                        <Button mode="text" onPress={() => setStep(2)} textColor="#22d3ee">
                                            Modifier
                                        </Button>
                                    </View>
                                    <>
                                        <Text style={styles.recapLine}>Template</Text>
                                        <Text style={styles.recapLineStrong}>
                                            {selectedTemplate?.title || selectedTemplateTitle || "Template sélectionné"}
                                        </Text>
                                    </>
                                </View>
                            </>
                        ) : null}

                        <View style={styles.footerRow}>
                            <Button mode="outlined" onPress={goBack} textColor="#cbd5e1" disabled={submitting}>
                                Retour
                            </Button>

                            {step < 3 ? (
                                <Button
                                    mode="contained"
                                    onPress={goNext}
                                    buttonColor="#22d3ee"
                                    textColor="#02111f"
                                    disabled={submitting || (step === 1 ? !canGoNextFromStep1 : !canGoNextFromStep2)}
                                >
                                    Suivant
                                </Button>
                            ) : isEditMode ? (
                                <Button
                                    mode="contained"
                                    onPress={handleUpdate}
                                    buttonColor="#22d3ee"
                                    textColor="#02111f"
                                    loading={submitting}
                                    disabled={!canSubmit || submitting}
                                >
                                    Mettre à jour
                                </Button>
                            ) : (
                                <Button
                                    mode="contained"
                                    onPress={handleCreate}
                                    buttonColor="#22d3ee"
                                    textColor="#02111f"
                                    loading={submitting}
                                    disabled={!canSubmit || submitting}
                                >
                                    Créer la séance
                                </Button>
                            )}
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
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
        paddingHorizontal: 12,
        gap: 18,
    },
    header: {
        gap: 8,
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
        borderRadius: 22,
        padding: 18,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        gap: 12,
    },
    cardTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "700",
    },
    pickerRow: {
        flexDirection: "row",
        gap: 12,
    },
    fieldLabel: {
        color: "#94a3b8",
        fontSize: 11,
        fontWeight: "800",
        marginBottom: 6,
    },
    pickerTrigger: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: "rgba(2,6,23,0.22)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    pickerTriggerPressed: {
        opacity: 0.9,
    },
    pickerValue: {
        color: "#e7e9f0ff",
        fontWeight: "700",
        flex: 1,
    },
    input: {
        backgroundColor: "rgba(2,6,23,0.2)",
    },
    footerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 4,
    },
    choiceRow: {
        flexDirection: "row",
        gap: 12,
    },
    choiceCard: {
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
        backgroundColor: "rgba(2,6,23,0.22)",
        padding: 14,
        gap: 6,
    },
    choiceCardActive: {
        borderColor: "rgba(34,211,238,0.7)",
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    choiceCardPressed: {
        opacity: 0.92,
    },
    choiceHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    choiceTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "800",
    },
    choiceSubtitle: {
        color: "#94a3b8",
        fontSize: 10,
        fontStyle: "italic",
    },
    loadingBox: {
        paddingVertical: 10,
        alignItems: "center",
    },
    list: {
        gap: 10,
    },
    templateRow: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.12)",
        backgroundColor: "rgba(2,6,23,0.16)",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    templateRowActive: {
        borderColor: "rgba(34,211,238,0.6)",
        backgroundColor: "rgba(34,211,238,0.08)",
    },
    templateRowPressed: {
        opacity: 0.92,
    },
    templateRowIcon: {
        width: 26,
        alignItems: "center",
        justifyContent: "center",
    },
    templateRowMain: {
        flex: 1,
        gap: 2,
    },
    templateRowTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "800",
    },
    templateRowSubtitle: {
        color: "#94a3b8",
        fontSize: 12,
    },
    stateContainer: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(2,6,23,0.22)",
        gap: 4,
    },
    stateTitle: {
        color: "#f8fafc",
        fontWeight: "800",
    },
    stateSubtitle: {
        color: "#94a3b8",
    },
    recapSection: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(2,6,23,0.16)",
        padding: 14,
        gap: 6,
    },
    recapHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    recapTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "900",
    },
    recapLine: {
        color: "#cbd5e1",
    },
    recapLineStrong: {
        color: "#f8fafc",
        fontWeight: "900",
    },
    recapLineMuted: {
        color: "#94a3b8",
    },
});
