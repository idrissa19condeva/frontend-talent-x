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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuth } from "../../context/AuthContext";
import { useTraining } from "../../context/TrainingContext";
import { buildDefaultTrainingFormValues } from "../../hooks/useTrainingForm";
import { useTrainingTemplatesList } from "../../hooks/useTrainingTemplatesList";
import { createSessionFromTemplate, getTrainingTemplate } from "../../api/trainingTemplateService";
import { CreateTrainingSessionPayload } from "../../types/training";
import { TrainingTemplate } from "../../types/trainingTemplate";
import { formatDurationLabel } from "../../utils/trainingFormatter";

type TemplatePickerSectionKey = "personal" | "default";

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

const buildAutoTitle = (date: Date) => {
    const label = date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    return `Séance du ${label}`;
};

const formatTrainingTypeLabel = (value?: string) => {
    switch (value) {
        case "vitesse":
            return "Vitesse";
        case "endurance":
            return "Endurance";
        case "force":
            return "Force";
        case "technique":
            return "Technique";
        case "récupération":
            return "Récupération";
        default:
            return value || "—";
    }
};

const getGroupSortKey = (label: string) => {
    // Keep unknown types at the end.
    return label === "—" ? "~~~~" : label;
};

const groupTemplatesByType = (templates: TrainingTemplate[]) => {
    const list = [...templates];
    list.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;
        return (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" });
    });

    const groups = new Map<string, TrainingTemplate[]>();
    for (const template of list) {
        const key = template.type || "";
        const next = groups.get(key);
        if (next) next.push(template);
        else groups.set(key, [template]);
    }

    return Array.from(groups.entries())
        .map(([type, templates]) => {
            const label = formatTrainingTypeLabel(type);
            return {
                id: type || "unknown",
                type,
                label,
                templates,
            };
        })
        .sort((a, b) => getGroupSortKey(a.label).localeCompare(getGroupSortKey(b.label), "fr", { sensitivity: "base" }));
};

const formatTemplateSubtitle = (template: TrainingTemplate) => {
    const parts: string[] = [];
    if (template.isDefault) parts.push("Par défaut");
    if (template.type) parts.push(formatTrainingTypeLabel(template.type));
    if (typeof template.version === "number") parts.push(`v${template.version}`);
    return parts.join(" · ");
};

export default function PlanTrainingSessionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ groupId?: string | string[] }>();
    const groupParam = params?.groupId;
    const groupId = Array.isArray(groupParam) ? groupParam[0] : groupParam;
    const insets = useSafeAreaInsets();

    const { user } = useAuth();
    const athleteId = useMemo(() => user?._id || user?.id || "", [user]);
    const { createSession } = useTraining();

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

    const [templatePickerEnabled, setTemplatePickerEnabled] = useState<boolean>(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
    const [selectedTemplateTitle, setSelectedTemplateTitle] = useState<string>("");
    const [templatePickerExpandedSections, setTemplatePickerExpandedSections] = useState<Set<TemplatePickerSectionKey>>(
        () => new Set(),
    );
    const [templatePickerExpandedTypes, setTemplatePickerExpandedTypes] = useState<Set<string>>(() => new Set());

    const {
        templates,
        loading: templatesLoading,
        error: templatesError,
        refresh: refreshTemplates,
    } = useTrainingTemplatesList("library");

    const sortedTemplates = useMemo(() => {
        const list = [...templates];
        list.sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
        });
        return list;
    }, [templates]);

    const templatePickerSections = useMemo(() => {
        const personalTemplates = sortedTemplates.filter((t) => !t.isDefault);
        const defaultTemplates = sortedTemplates.filter((t) => Boolean(t.isDefault));

        return [
            {
                key: "personal" as const,
                title: "Plans personnels",
                count: personalTemplates.length,
                groups: groupTemplatesByType(personalTemplates),
            },
            {
                key: "default" as const,
                title: "Plans par défaut",
                count: defaultTemplates.length,
                groups: groupTemplatesByType(defaultTemplates),
            },
        ];
    }, [sortedTemplates]);

    const canSubmit = useMemo(() => {
        if (!athleteId) return false;
        if (!normalizeTime(time)) return false;
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return false;
        if (!place.trim()) return false;
        if (templatePickerEnabled && !selectedTemplateId) return false;
        return true;
    }, [athleteId, durationMinutes, place, selectedTemplateId, templatePickerEnabled, time]);

    useEffect(() => {
        if (!templatePickerEnabled) return;
        // UX: keep everything collapsed by default when enabling the picker.
        setTemplatePickerExpandedSections(new Set());
        setTemplatePickerExpandedTypes(new Set());
    }, [templatePickerEnabled]);

    const ensureSelectedTemplateTitle = useCallback(async () => {
        if (!selectedTemplateId || selectedTemplateTitle) return;
        try {
            const fetched = await getTrainingTemplate(selectedTemplateId);
            setSelectedTemplateTitle(fetched.title);
        } catch {
            // silent
        }
    }, [selectedTemplateId, selectedTemplateTitle]);

    const toggleTemplatePickerSection = useCallback((key: TemplatePickerSectionKey) => {
        setTemplatePickerExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleTemplatePickerType = useCallback((key: string) => {
        setTemplatePickerExpandedTypes((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

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
    }, [keyboardHeight]);

    useEffect(() => {
        if (!placeFocused) return;
        if (!keyboardHeight) return;
        const timer = setTimeout(() => {
            ensurePlaceFieldVisible();
        }, 50);
        return () => clearTimeout(timer);
    }, [ensurePlaceFieldVisible, keyboardHeight, placeFocused]);

    const handleSubmit = useCallback(async () => {
        if (!athleteId) return;
        const normalizedTime = normalizeTime(time);
        const normalizedDuration = clampDurationMinutes(durationMinutes);
        const normalizedPlace = place.trim();
        if (!normalizedTime || !normalizedDuration || !normalizedPlace) {
            Alert.alert("Champs invalides", "Vérifie l'heure, la durée, et le lieu.");
            return;
        }

        if (templatePickerEnabled) {
            if (!selectedTemplateId) {
                Alert.alert("Template requis", "Choisis un template.");
                return;
            }
        }

        const base = buildDefaultTrainingFormValues(athleteId, groupId ? { groupId } : undefined);
        try {
            setSubmitting(true);

            if (templatePickerEnabled && selectedTemplateId) {
                await ensureSelectedTemplateTitle();
                const session = await createSessionFromTemplate(selectedTemplateId, {
                    date,
                    startTime: normalizedTime,
                    durationMinutes: normalizedDuration,
                    groupId: groupId ? groupId : undefined,
                    place: normalizedPlace,
                });
                router.replace({ pathname: "/(main)/training/edit/[id]", params: { id: session.id } });
                return;
            }

            const payload: CreateTrainingSessionPayload = {
                ...base,
                date: date.toISOString(),
                startTime: normalizedTime,
                durationMinutes: normalizedDuration,
                place: normalizedPlace,
                title: buildAutoTitle(date),
                status: "planned",
            };

            const session = await createSession(payload);
            router.replace({ pathname: "/(main)/training/edit/[id]", params: { id: session.id } });
        } catch (err: any) {
            Alert.alert("Erreur", err?.response?.data?.message || err?.message || "Impossible de créer la séance");
        } finally {
            setSubmitting(false);
        }
    }, [
        athleteId,
        createSession,
        date,
        durationMinutes,
        ensureSelectedTemplateTitle,
        groupId,
        place,
        router,
        selectedTemplateId,
        templatePickerEnabled,
        time,
    ]);

    const bottomSpacing = Math.max(insets.bottom, 0);
    const keyboardVerticalOffset = Math.max(insets.top, 16) + 48;
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
                        templatePickerEnabled ? (
                            <RefreshControl refreshing={templatesLoading} onRefresh={refreshTemplates} tintColor="#22d3ee" />
                        ) : undefined
                    }
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Planifier une séance</Text>
                        <Text style={styles.subtitle}>Date, horaire, durée et lieu.</Text>
                    </View>

                    <View style={styles.card}>
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

                        <Text style={[styles.cardTitle, { marginTop: 14 }]}>Plan d’entraînement</Text>
                        <View style={styles.choiceRow}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    setTemplatePickerEnabled(false);
                                    setSelectedTemplateId("");
                                    setSelectedTemplateTitle("");
                                }}
                                style={({ pressed }) => [
                                    styles.choiceCard,
                                    !templatePickerEnabled && styles.choiceCardActive,
                                    pressed && styles.choiceCardPressed,
                                ]}
                            >
                                <View style={styles.choiceHeader}>
                                    <MaterialCommunityIcons name="file-outline" size={18} color="#38bdf8" />
                                    <Text style={styles.choiceTitle}>Sans template</Text>
                                </View>
                                <Text style={styles.choiceSubtitle}>Créer une séance vide</Text>
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
                                    <Text style={styles.choiceTitle}>Depuis un plan</Text>
                                </View>
                                <Text style={styles.choiceSubtitle}>Choisir un template existant</Text>
                            </Pressable>
                        </View>

                        {templatePickerEnabled ? (
                            <View style={{ marginTop: 10, gap: 10 }}>
                                {templatesError ? (
                                    <View style={styles.stateContainer}>
                                        <Text style={styles.stateTitle}>Impossible de charger</Text>
                                        <Text style={styles.stateSubtitle}>{templatesError}</Text>
                                    </View>
                                ) : null}

                                {templatesLoading && !sortedTemplates.length ? (
                                    <View style={styles.loadingBox}>
                                        <ActivityIndicator size="small" color="#22d3ee" />
                                    </View>
                                ) : null}

                                {!templatesLoading && !sortedTemplates.length ? (
                                    <View style={styles.stateContainer}>
                                        <Text style={styles.stateTitle}>Aucun template</Text>
                                        <Text style={styles.stateSubtitle}>Crée un template pour l’utiliser ici.</Text>
                                    </View>
                                ) : (
                                    <View style={styles.list}>
                                        {templatePickerSections.map((section) => {
                                            const sectionExpanded = templatePickerExpandedSections.has(section.key);
                                            return (
                                                <View key={section.key} style={{ gap: 10 }}>
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        onPress={() => toggleTemplatePickerSection(section.key)}
                                                        style={({ pressed }) => [
                                                            styles.templatePickerSectionHeader,
                                                            pressed && styles.templatePickerSectionHeaderPressed,
                                                        ]}
                                                    >
                                                        <View style={styles.templatePickerSectionHeaderLeft}>
                                                            <MaterialCommunityIcons
                                                                name={sectionExpanded ? "chevron-down" : "chevron-right"}
                                                                size={18}
                                                                color="#94a3b8"
                                                            />
                                                            <Text style={styles.templatePickerSectionTitle}>{section.title}</Text>
                                                        </View>
                                                        <View style={styles.templatePickerCountPill}>
                                                            <Text style={styles.templatePickerCountPillText}>{section.count}</Text>
                                                        </View>
                                                    </Pressable>

                                                    {sectionExpanded ? (
                                                        section.count ? (
                                                            <View style={{ gap: 10 }}>
                                                                {section.groups.map((group) => {
                                                                    const typeKey = `${section.key}:${group.id}`;
                                                                    const typeExpanded = templatePickerExpandedTypes.has(typeKey);
                                                                    return (
                                                                        <View key={typeKey} style={{ gap: 10 }}>
                                                                            <Pressable
                                                                                accessibilityRole="button"
                                                                                onPress={() => toggleTemplatePickerType(typeKey)}
                                                                                style={({ pressed }) => [
                                                                                    styles.templatePickerTypeHeader,
                                                                                    pressed && styles.templatePickerTypeHeaderPressed,
                                                                                ]}
                                                                            >
                                                                                <View style={styles.templatePickerTypeHeaderLeft}>
                                                                                    <MaterialCommunityIcons
                                                                                        name={typeExpanded ? "chevron-down" : "chevron-right"}
                                                                                        size={16}
                                                                                        color="#94a3b8"
                                                                                    />
                                                                                    <Text style={styles.templatePickerTypeTitle}>{group.label}</Text>
                                                                                </View>
                                                                                <View style={styles.templatePickerTypeCountPill}>
                                                                                    <Text style={styles.templatePickerTypeCountPillText}>
                                                                                        {group.templates.length}
                                                                                    </Text>
                                                                                </View>
                                                                            </Pressable>

                                                                            {typeExpanded ? (
                                                                                <View style={{ gap: 10 }}>
                                                                                    {group.templates.map((template) => {
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
                                                                                                    styles.templateRowIndented,
                                                                                                    active && styles.templateRowActive,
                                                                                                    pressed && styles.templateRowPressed,
                                                                                                ]}
                                                                                            >
                                                                                                <View style={styles.templateRowIcon}>
                                                                                                    <MaterialCommunityIcons
                                                                                                        name={
                                                                                                            active
                                                                                                                ? "check-circle"
                                                                                                                : "checkbox-blank-circle-outline"
                                                                                                        }
                                                                                                        size={16}
                                                                                                        color={active ? "#22d3ee" : "#94a3b8"}
                                                                                                    />
                                                                                                </View>
                                                                                                <View style={styles.templateRowMain}>
                                                                                                    <View style={styles.templateRowTitleRow}>
                                                                                                        <Text style={styles.templateRowTitle}>
                                                                                                            {template.title}
                                                                                                        </Text>
                                                                                                        {template.isDefault ? (
                                                                                                            <View style={styles.templateDefaultBadge}>
                                                                                                                <Text
                                                                                                                    style={
                                                                                                                        styles.templateDefaultBadgeText
                                                                                                                    }
                                                                                                                >
                                                                                                                    Par défaut
                                                                                                                </Text>
                                                                                                            </View>
                                                                                                        ) : null}
                                                                                                    </View>
                                                                                                    <Text style={styles.templateRowSubtitle}>
                                                                                                        {formatTemplateSubtitle(template)}
                                                                                                    </Text>
                                                                                                </View>
                                                                                            </Pressable>
                                                                                        );
                                                                                    })}
                                                                                </View>
                                                                            ) : null}
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        ) : (
                                                            <View style={styles.stateContainer}>
                                                                <Text style={styles.stateTitle}>Aucun plan</Text>
                                                                <Text style={styles.stateSubtitle}>Rien ici pour l’instant.</Text>
                                                            </View>
                                                        )
                                                    ) : null}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        ) : null}

                        <Button
                            mode="contained"
                            onPress={handleSubmit}
                            disabled={!canSubmit || submitting}
                            loading={submitting}
                            buttonColor="#22d3ee"
                            textColor="#02111f"
                            style={styles.submit}
                        >
                            Créer la séance
                        </Button>

                        {submitting ? (
                            <View style={styles.submittingHint}>
                                <ActivityIndicator size="small" color="#22d3ee" />
                            </View>
                        ) : null}
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
        gap: 8,
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
    choiceRow: {
        flexDirection: "row",
        gap: 12,
        marginTop: 6,
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
    templatePickerSectionHeader: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
        backgroundColor: "rgba(2,6,23,0.22)",
        paddingVertical: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    templatePickerSectionHeaderPressed: {
        opacity: 0.92,
    },
    templatePickerSectionHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flex: 1,
    },
    templatePickerSectionTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "900",
        flex: 1,
    },
    templatePickerCountPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
        backgroundColor: "rgba(2,6,23,0.22)",
        minWidth: 34,
        alignItems: "center",
    },
    templatePickerCountPillText: {
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: "900",
    },
    templatePickerTypeHeader: {
        marginLeft: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.12)",
        backgroundColor: "rgba(2,6,23,0.12)",
        paddingVertical: 10,
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    templatePickerTypeHeaderPressed: {
        opacity: 0.92,
    },
    templatePickerTypeHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },
    templatePickerTypeTitle: {
        color: "#e7e9f0ff",
        fontSize: 13,
        fontWeight: "800",
        flex: 1,
    },
    templatePickerTypeCountPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.16)",
        backgroundColor: "rgba(2,6,23,0.16)",
        minWidth: 30,
        alignItems: "center",
    },
    templatePickerTypeCountPillText: {
        color: "#94a3b8",
        fontSize: 11,
        fontWeight: "900",
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
    templateRowIndented: {
        marginLeft: 28,
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
    templateRowTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    templateRowTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "800",
        flex: 1,
    },
    templateDefaultBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    templateDefaultBadgeText: {
        color: "#22d3ee",
        fontSize: 11,
        fontWeight: "800",
    },
    templateRowSubtitle: {
        color: "#94a3b8",
        fontSize: 12,
    },
    submit: {
        marginTop: 16,
    },
    submittingHint: {
        paddingTop: 12,
        alignItems: "center",
    },
});
