import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TrainingSessionScope, useTrainingSessionsList } from "../../hooks/useTrainingSessionsList";
import { useAuth } from "../../context/AuthContext";
import TrainingSessionCard from "../../components/training/TrainingSessionCard";
import { TrainingSession } from "../../types/training";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type SessionGroupingKey = "today" | "upcoming" | "past";

const SECTION_LABELS: Record<SessionGroupingKey, string> = {
    today: "Séances du jour",
    upcoming: "Séances à venir",
    past: "Séances passées",
};

const TIMEFRAME_OPTIONS: { key: SessionGroupingKey; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { key: "today", label: "Aujourd'hui", icon: "calendar-today" },
    { key: "upcoming", label: "À venir", icon: "calendar-arrow-right" },
    { key: "past", label: "Passées", icon: "history" },
];

const toValidDate = (value?: string) => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getSessionStartDate = (session: TrainingSession) => {
    const baseDate = toValidDate(session.date);
    if (!baseDate) {
        return null;
    }
    if (session.startTime && /^\d{2}:\d{2}$/.test(session.startTime)) {
        const [hours, minutes] = session.startTime.split(":").map((part) => Number(part));
        if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            const start = new Date(baseDate);
            start.setHours(hours, minutes, 0, 0);
            return start;
        }
    }
    const dayStart = new Date(baseDate);
    dayStart.setHours(0, 0, 0, 0);
    return dayStart;
};

const getSessionEndDate = (session: TrainingSession, startDate: Date | null) => {
    if (startDate) {
        const durationMinutes = Number(session.durationMinutes);
        if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
            return new Date(startDate.getTime() + durationMinutes * 60 * 1000);
        }
        const endOfDay = new Date(startDate);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay;
    }
    const baseDate = toValidDate(session.date);
    if (!baseDate) {
        return null;
    }
    baseDate.setHours(23, 59, 59, 999);
    return baseDate;
};

const getDayStart = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

const getSessionSortTimestamp = (session: TrainingSession) => {
    const startDate = getSessionStartDate(session);
    if (startDate) {
        return startDate.getTime();
    }
    const baseDate = toValidDate(session.date);
    return baseDate ? baseDate.getTime() : 0;
};

const categorizeSession = (session: TrainingSession): SessionGroupingKey => {
    const now = new Date();
    const todayStart = getDayStart(now);
    const baseDate = toValidDate(session.date);
    const startDate = getSessionStartDate(session);
    const endDate = getSessionEndDate(session, startDate);
    if (baseDate && isSameDay(baseDate, now)) {
        return "today";
    }
    if (startDate && startDate > now) {
        return "upcoming";
    }
    if (!startDate && baseDate && getDayStart(baseDate) > todayStart) {
        return "upcoming";
    }
    if (endDate && endDate < now) {
        return "past";
    }
    if (baseDate && getDayStart(baseDate) < todayStart) {
        return "past";
    }
    return "upcoming";
};

const groupSessionsByTimeframe = (sessions: TrainingSession[]) => {
    const groups: Record<SessionGroupingKey, TrainingSession[]> = {
        today: [],
        upcoming: [],
        past: [],
    };
    sessions.forEach((session) => {
        const bucket = categorizeSession(session);
        groups[bucket].push(session);
    });
    groups.today.sort((a, b) => getSessionSortTimestamp(a) - getSessionSortTimestamp(b));
    groups.upcoming.sort((a, b) => getSessionSortTimestamp(a) - getSessionSortTimestamp(b));
    groups.past.sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a));
    return groups;
};

export default function TrainingSessionsListScreen() {
    const router = useRouter();
    const [scope, setScope] = useState<TrainingSessionScope>("owned");
    const [timeframe, setTimeframe] = useState<SessionGroupingKey>("today");
    const { sessions, loading, error, refresh } = useTrainingSessionsList(scope);
    const { user } = useAuth();
    const currentUserId = user?.id || user?._id;
    const tabBarHeight = useBottomTabBarHeight();
    const insets = useSafeAreaInsets();
    const bottomSpacing = tabBarHeight + Math.max(insets.bottom, 10);
    const isOwnedView = scope === "owned";

    const headerTitle = isOwnedView ? "Mes séances personnelles" : "Mes séances en participation";
    const headerSubtitle = isOwnedView
        ? sessions.length
            ? "Dernières mises à jour."
            : "Aucune séance encore planifiée."
        : sessions.length
            ? "Invitations reçues et séances confirmées."
            : "Aucune invitation reçue pour le moment.";

    const groupedSessions = useMemo(() => groupSessionsByTimeframe(sessions), [sessions]);

    const filteredSessions = groupedSessions[timeframe] || [];
    const timeframeTitle = SECTION_LABELS[timeframe];

    const handleOpen = (id: string) => {
        router.push(`/(main)/training/${id}`);
    };

    const handleCreate = () => router.push("/(main)/training/create");

    const renderEmptyState = () => (
        <View style={styles.stateContainer}>
            <Text style={styles.stateTitle}>{isOwnedView ? "Planifiez votre première séance" : "Aucune participation"}</Text>
            <Text style={styles.stateSubtitle}>
                {isOwnedView
                    ? "Créez un programme."
                    : "Quand un coach vous ajoute à une séance, elle apparaîtra ici."}
            </Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <ScrollView
                contentContainerStyle={[styles.container, { paddingBottom: bottomSpacing }]}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#22d3ee" />}
            >
                <View style={styles.scopeSwitcher}>
                    <Button
                        mode={isOwnedView ? "contained" : "outlined"}
                        onPress={() => setScope("owned")}
                        style={[styles.scopeButton, isOwnedView && styles.scopeButtonActive]}
                        buttonColor={isOwnedView ? "#22d3ee" : "transparent"}
                        textColor={isOwnedView ? "#02111f" : "#22d3ee"}
                    >
                        Mes séances
                    </Button>
                    <Button
                        mode={!isOwnedView ? "contained" : "outlined"}
                        onPress={() => setScope("participating")}
                        style={[styles.scopeButton, !isOwnedView && styles.scopeButtonActive]}
                        buttonColor={!isOwnedView ? "#22d3ee" : "transparent"}
                        textColor={!isOwnedView ? "#02111f" : "#22d3ee"}
                    >
                        Je participe
                    </Button>
                </View>
                <View style={styles.header}>
                    <Text style={styles.title}>{headerTitle}</Text>
                    <Text style={styles.subtitle}>{headerSubtitle}</Text>
                </View>

                {sessions.length ? (
                    <View style={styles.timeframeSwitcher}>
                        {TIMEFRAME_OPTIONS.map((option) => {
                            const isActive = timeframe === option.key;
                            const count = groupedSessions[option.key].length;
                            return (
                                <Pressable
                                    key={option.key}
                                    style={[styles.timeframeChip, isActive && styles.timeframeChipActive]}
                                    onPress={() => setTimeframe(option.key)}
                                    accessibilityRole="button"
                                >
                                    <MaterialCommunityIcons
                                        name={option.icon}
                                        size={18}
                                        color={isActive ? "#010617" : "#38bdf8"}
                                    />
                                    <View style={styles.timeframeChipLabels}>
                                        <Text style={[styles.timeframeChipLabel, isActive && styles.timeframeChipLabelActive]}>
                                            {option.label}
                                        </Text>
                                        <Text style={[styles.timeframeChipCount, isActive && styles.timeframeChipCountActive]}>
                                            {count} séance{count > 1 ? "s" : ""}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {loading && !sessions.length ? (
                    <View style={styles.stateContainer}>
                        <ActivityIndicator color="#22d3ee" />
                    </View>
                ) : null}

                {sessions.length ? (
                    filteredSessions.length ? (
                        <View style={styles.sectionBlock}>
                            <Text style={styles.sectionTitle}>{timeframeTitle}</Text>
                            {filteredSessions.map((session) => (
                                <TrainingSessionCard
                                    key={session.id}
                                    session={session}
                                    onPress={() => handleOpen(session.id)}
                                    currentUserId={currentUserId}
                                />
                            ))}
                        </View>
                    ) : (
                        <View style={styles.timeframeEmptyState}>
                            <MaterialCommunityIcons name="emoticon-neutral-outline" size={26} color="#94a3b8" />
                            <Text style={styles.timeframeEmptyTitle}>Aucune séance ici</Text>
                            <Text style={styles.timeframeEmptySubtitle}>
                                {"Explorez les autres onglets pour voir vos autres séances."}
                            </Text>
                        </View>
                    )
                ) : (
                    !loading && renderEmptyState()
                )}

                {isOwnedView ? (
                    <Button
                        mode="contained"
                        onPress={handleCreate}
                        style={styles.createButton}
                        buttonColor="#22d3ee"
                        textColor="#02111f"
                    >
                        Nouvelle séance
                    </Button>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#010617",
    },
    container: {
        padding: 20,
        gap: 16,
        backgroundColor: "#010617",
        flexGrow: 1,
    },
    header: {
        gap: 8,
    },
    scopeSwitcher: {
        flexDirection: "row",
        gap: 8,
        backgroundColor: "rgba(14,165,233,0.08)",
        borderRadius: 999,
        padding: 4,
    },
    scopeButton: {
        flex: 1,
        borderRadius: 999,
    },
    scopeButtonActive: {
        elevation: 0,
    },
    title: {
        fontSize: 24,
        fontWeight: "700",
        color: "#f8fafc",
    },
    subtitle: {
        color: "#94a3b8",
    },
    error: {
        color: "#f87171",
    },
    createButton: {
        marginTop: 16,
    },
    stateContainer: {
        paddingVertical: 40,
        gap: 12,
        alignItems: "center",
    },
    stateTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "600",
    },
    stateSubtitle: {
        color: "#94a3b8",
        fontSize: 13,
        textAlign: "center",
        paddingHorizontal: 12,
    },
    timeframeSwitcher: {
        flexDirection: "row",
        gap: 10,
        marginTop: 16,
        marginBottom: 12,
    },
    timeframeChip: {
        flex: 1,
        backgroundColor: "rgba(14,165,233,0.12)",
        borderRadius: 18,
        paddingVertical: 10,
        paddingHorizontal: 5,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.35)",
    },
    timeframeChipActive: {
        backgroundColor: "#38bdf8",
        borderColor: "#38bdf8",
    },
    timeframeChipLabels: {
        flex: 1,
    },
    timeframeChipLabel: {
        color: "#94a3b8",
        fontSize: 10,
        fontWeight: "600",
    },
    timeframeChipLabelActive: {
        color: "#010617",
    },
    timeframeChipCount: {
        color: "#94a3b8",
        fontSize: 10,
    },
    timeframeChipCountActive: {
        color: "#010617",
    },
    sectionBlock: {
        gap: 8,
        marginTop: 12,
    },
    sectionTitle: {
        color: "#e2e8f0",
        fontSize: 16,
        fontWeight: "600",
        paddingLeft: 4,
    },
    sectionSubtitleExpanded: {
        color: "#94a3b8",
        fontSize: 13,
        paddingLeft: 4,
        marginBottom: 6,
    },
    timeframeEmptyState: {
        marginTop: 24,
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(15,23,42,0.6)",
    },
    timeframeEmptyTitle: {
        color: "#f8fafc",
        fontWeight: "600",
    },
    timeframeEmptySubtitle: {
        color: "#94a3b8",
        fontSize: 13,
        textAlign: "center",
    },
});
