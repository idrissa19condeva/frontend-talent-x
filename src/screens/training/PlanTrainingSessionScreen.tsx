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
import { CreateTrainingSessionPayload } from "../../types/training";
import { formatDurationLabel } from "../../utils/trainingFormatter";

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

    const canSubmit = useMemo(() => {
        if (!athleteId) return false;
        if (!normalizeTime(time)) return false;
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return false;
        if (!place.trim()) return false;
        return true;
    }, [athleteId, time, durationMinutes, place]);

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

        const base = buildDefaultTrainingFormValues(athleteId, groupId ? { groupId } : undefined);
        const payload: CreateTrainingSessionPayload = {
            ...base,
            date: date.toISOString(),
            startTime: normalizedTime,
            durationMinutes: normalizedDuration,
            place: normalizedPlace,
            title: buildAutoTitle(date),
            status: "planned",
        };

        try {
            setSubmitting(true);
            const session = await createSession(payload);
            router.replace({ pathname: "/(main)/training/edit/[id]", params: { id: session.id } });
        } catch (err: any) {
            Alert.alert("Erreur", err?.response?.data?.message || err?.message || "Impossible de créer la séance");
        } finally {
            setSubmitting(false);
        }
    }, [athleteId, createSession, date, durationMinutes, groupId, place, router, time]);

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
    submit: {
        marginTop: 16,
    },
    submittingHint: {
        paddingTop: 12,
        alignItems: "center",
    },
});
