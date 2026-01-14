import React, { useEffect, useMemo, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useTraining } from "../../context/TrainingContext";
import { TrainingSession } from "../../types/training";

const parseStart = (session: TrainingSession): number => {
    const rawDate = String(session.date || "").trim();
    const timePart = String(session.startTime || "00:00").trim() || "00:00";
    // `session.date` peut venir sous forme ISO (`YYYY-MM-DDT...Z`).
    // On garde uniquement la partie date et on applique `startTime` pour avoir un start fiable.
    const dateOnly = rawDate.includes("T") ? rawDate.split("T")[0] : rawDate;
    if (!dateOnly) return 0;

    const iso = `${dateOnly}T${timePart}`;
    const ts = new Date(iso).getTime();
    return Number.isNaN(ts) ? 0 : ts;
};

const computeEnd = (session: TrainingSession, startTs: number): number => {
    if (!startTs) return 0;
    const durationMinutes = Number(session.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
    return startTs + durationMinutes * 60 * 1000;
};

const formatStart = (session?: TrainingSession): string => {
    if (!session) return "Aucune";
    const ts = parseStart(session);
    if (!ts) return "Aucune";
    const d = new Date(ts);
    const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
    const timeLabel = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${dateLabel} · ${timeLabel}`;
};

export default function CoachProfilePanel() {
    const router = useRouter();
    const { sessions, ownedSessionIds, ownedSessionsLoaded, fetchAllSessions } = useTraining();

    useEffect(() => {
        if (!ownedSessionsLoaded) {
            fetchAllSessions().catch(() => null);
        }
    }, [ownedSessionsLoaded, fetchAllSessions]);

    useFocusEffect(
        useCallback(() => {
            fetchAllSessions().catch(() => null);
        }, [fetchAllSessions]),
    );

    const ownedSessions = useMemo(
        () => ownedSessionIds.map((id) => sessions[id]).filter(Boolean),
        [ownedSessionIds, sessions],
    );

    const plannedUpcoming = useMemo(() => {
        const now = Date.now();
        return ownedSessions
            .filter((s) => s.status === "planned" && parseStart(s) > now)
            .sort((a, b) => parseStart(a) - parseStart(b));
    }, [ownedSessions]);

    const activeNow = useMemo(() => {
        const now = Date.now();
        return ownedSessions
            .filter((s) => {
                if (s.status === "ongoing") return true;
                if (s.status !== "planned") return false;
                const startTs = parseStart(s);
                const endTs = computeEnd(s, startTs);
                if (!startTs || !endTs) return false;
                return startTs <= now && endTs > now;
            })
            .sort((a, b) => parseStart(b) - parseStart(a));
    }, [ownedSessions]);

    const activeThisWeek = useMemo(() => {
        const startOfWeek = (() => {
            const d = new Date();
            const day = (d.getDay() + 6) % 7; // Monday = 0
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - day);
            return d.getTime();
        })();
        const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000;
        return ownedSessions.filter((s) => {
            const ts = parseStart(s);
            return ts >= startOfWeek && ts < endOfWeek;
        }).length;
    }, [ownedSessions]);

    const nextSession = activeNow[0] || plannedUpcoming[0];

    const statBlocks: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }[] = [
        {
            label: "Séances prévues",
            value: plannedUpcoming.length.toString(),
            icon: "calendar-outline",
        },
        {
            label: "Semaine en cours",
            value: activeThisWeek.toString(),
            icon: "flash-outline",
        },
    ];

    return (
        <View style={styles.wrapper}>
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <TouchableOpacity
                        style={styles.cta}
                        onPress={() => router.push("/(main)/training/create" as never)}
                    >
                        <Ionicons name="add" size={16} color="#e0f2fe" />
                        <Text style={styles.ctaText}>Créer une séance</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.statsRow}>
                    {statBlocks.map((stat) => (
                        <View key={stat.label} style={styles.statCard}>
                            <View style={styles.statHeader}>
                                <Text style={styles.statLabel}>{stat.label}</Text>
                                <Ionicons name={stat.icon} size={16} color="#e2e8f0" />
                            </View>
                            <Text style={styles.statValue}>{stat.value}</Text>
                        </View>
                    ))}
                </View>
                <View style={styles.footerRow}>
                    <View style={styles.footerLabelRow}>
                        <Ionicons name="time-outline" size={16} color="#cbd5e1" />
                        <Text style={styles.footerLabel}>Prochaine séance</Text>
                    </View>
                    <Text style={styles.footerValue}>{activeNow.length ? "En cours" : formatStart(nextSession)}</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        marginTop: 12,
        marginBottom: 16,
    },
    card: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        backgroundColor: "rgba(11,17,30,0.9)",
        gap: 14,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    title: {
        color: "#e0f2fe",
        fontSize: 16,
        fontWeight: "800",
    },
    cta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: "rgba(34,211,238,0.14)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    ctaText: {
        color: "#e0f2fe",
        fontWeight: "700",
    },
    statsRow: {
        flexDirection: "row",
        gap: 10,
    },
    statCard: {
        flex: 1,
        borderRadius: 16,
        padding: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    statHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    statValue: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "800",
    },
    statLabel: {
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: "600",
    },
    footerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 4,
        borderTopWidth: 1,
        borderTopColor: "rgba(148,163,184,0.25)",
    },
    footerLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    footerLabel: {
        color: "#94a3b8",
        fontWeight: "700",
    },
    footerValue: {
        color: "#e2e8f0",
        fontSize: 13,
        fontWeight: "700",
    },
});
