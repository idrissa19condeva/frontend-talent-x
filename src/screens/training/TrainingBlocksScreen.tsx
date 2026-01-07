import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listTrainingBlocks } from "../../api/trainingBlockService";
import { TrainingBlock } from "../../types/trainingBlock";
import { trainingBlockCatalog } from "../../hooks/useTrainingForm";

const getBlockTypeLabel = (blockType?: string) => {
    const match = trainingBlockCatalog.find((item) => item.type === blockType);
    return match?.label || blockType || "Bloc";
};

const formatDurationFr = (totalSeconds?: number) => {
    if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return null;
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;

    if (minutes <= 0) {
        return `${seconds}s`;
    }

    if (seconds === 0) {
        return `${minutes}min`;
    }

    return `${minutes}min${seconds}s`;
};

const formatDistance = (distance?: number, unit?: string) => {
    if (typeof distance !== "number" || !Number.isFinite(distance)) return null;
    const resolvedUnit = unit === "km" ? "km" : "m";
    if (resolvedUnit === "km") {
        const rounded = Math.round(distance * 100) / 100;
        return `${rounded} km`;
    }
    return `${Math.round(distance)} m`;
};

const buildBlockDetail = (block: TrainingBlock) => {
    const segment = block.segment;
    if (!segment) return null;

    const type = segment.blockType;
    if (type === "custom") {
        const goal = segment.customGoal ? String(segment.customGoal).trim() : null;
        const rest = formatDurationFr(segment.restInterval);

        const exos = Array.isArray(segment.customExercises) ? segment.customExercises.filter(Boolean) : [];
        const exosCount = exos.length ? `${exos.length} exo${exos.length > 1 ? "s" : ""}` : null;

        const notes = segment.customNotes ? String(segment.customNotes).trim() : null;

        let metric: string | null = null;
        if (segment.customMetricEnabled) {
            if (segment.customMetricKind === "distance") {
                metric = typeof segment.customMetricDistance === "number" ? `${Math.round(segment.customMetricDistance)} m` : null;
            } else if (segment.customMetricKind === "duration") {
                const duration = formatDurationFr(segment.customMetricDurationSeconds);
                metric = duration ? `durée ${duration}` : null;
            } else if (segment.customMetricKind === "reps") {
                metric = typeof segment.customMetricRepetitions === "number" ? `${Math.round(segment.customMetricRepetitions)} reps` : null;
            } else if (segment.customMetricKind === "exo") {
                metric = exosCount;
            }
        }

        const parts = [goal, metric, rest ? `récup ${rest}` : null, notes ? "notes" : null].filter(Boolean);
        return parts.length ? parts.join(" • ") : null;
    }

    if (type === "ppg") {
        const exosCount = Array.isArray(segment.ppgExercises) ? segment.ppgExercises.filter(Boolean).length : 0;
        const mode = segment.ppgMode || "time";
        const duration = formatDurationFr(segment.ppgDurationSeconds);
        const rest = formatDurationFr(segment.ppgRestSeconds);
        const reps = typeof segment.ppgRepetitions === "number" ? segment.ppgRepetitions : null;

        const modeLabel = mode === "reps" ? "répétitions" : "temps";
        const main =
            mode === "reps"
                ? reps && reps > 0
                    ? `${reps} reps/exo`
                    : null
                : duration
                    ? `durée ${duration}`
                    : null;

        const parts = [
            exosCount ? `${exosCount} exo${exosCount > 1 ? "s" : ""}` : null,
            modeLabel,
            main,
            rest ? `récup ${rest}` : null,
        ].filter(Boolean);
        return parts.length ? parts.join(" • ") : null;
    }

    if (type === "muscu") {
        const exosCount = Array.isArray(segment.muscuExercises) ? segment.muscuExercises.filter(Boolean).length : 0;
        const reps = typeof segment.muscuRepetitions === "number" ? segment.muscuRepetitions : null;
        const parts = [
            exosCount ? `${exosCount} exo${exosCount > 1 ? "s" : ""}` : null,
            reps && reps > 0 ? `${Math.round(reps)} reps/exo` : null,
        ].filter(Boolean);
        return parts.length ? parts.join(" • ") : null;
    }

    if (type === "recup") {
        const mode = segment.recoveryMode ? String(segment.recoveryMode) : null;
        const effort = formatDurationFr(segment.durationSeconds);
        const recovery = formatDurationFr(segment.recoveryDurationSeconds);
        const parts = [
            mode,
            effort ? `effort ${effort}` : null,
            recovery ? `récup ${recovery}` : null,
        ].filter(Boolean);
        return parts.length ? parts.join(" • ") : null;
    }

    if (type === "start") {
        const count = typeof segment.startCount === "number" ? segment.startCount : null;
        const exit = typeof segment.startExitDistance === "number" ? `${Math.round(segment.startExitDistance)} m` : null;
        const parts = [count ? `${count} départ${count > 1 ? "s" : ""}` : null, exit ? `sortie ${exit}` : null].filter(Boolean);
        return parts.length ? parts.join(" • ") : null;
    }

    if (type === "cotes" && segment.cotesMode === "duration") {
        const duration = formatDurationFr(segment.durationSeconds);
        const rest = formatDurationFr(segment.restInterval);
        const reps = typeof segment.repetitions === "number" ? segment.repetitions : null;
        const parts = [duration ? `temps ${duration}` : null, reps && reps > 1 ? `×${reps}` : null, rest ? `récup ${rest}` : null].filter(Boolean);
        return parts.length ? parts.join(" • ") : null;
    }

    // Default (vitesse, cotes distance, custom...)
    const distance = formatDistance(segment.distance, segment.distanceUnit);
    const reps = typeof segment.repetitions === "number" ? segment.repetitions : null;
    const rest = formatDurationFr(segment.restInterval);
    const parts = [distance, reps ? `×${reps}` : null, rest ? `récup ${rest}` : null].filter(Boolean);
    return parts.length ? parts.join(" • ") : null;
};

export default function TrainingBlocksScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(() => new Set());

    const load = useCallback(async ({ showLoading }: { showLoading: boolean }) => {
        if (showLoading) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        try {
            const data = await listTrainingBlocks();
            setBlocks(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Erreur chargement blocs:", error);
            Alert.alert("Erreur", "Impossible de charger tes blocs.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load({ showLoading: true });
    }, [load]);

    useFocusEffect(
        useCallback(() => {
            // Ensure newly created/edited blocks appear immediately when returning to this screen.
            load({ showLoading: false });
        }, [load]),
    );

    const handleRefresh = () => {
        load({ showLoading: false });
    };

    const groupedBlocks = useMemo(() => {
        const buckets = new Map<string, TrainingBlock[]>();

        for (const block of blocks) {
            const rawType = block.segment?.blockType;
            const key = typeof rawType === "string" && rawType.trim() ? rawType.trim() : "__unknown__";
            const existing = buckets.get(key);
            if (existing) {
                existing.push(block);
            } else {
                buckets.set(key, [block]);
            }
        }

        for (const list of buckets.values()) {
            list.sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" }));
        }

        const order = new Map<string, number>(trainingBlockCatalog.map((item, index) => [item.type, index]));

        const keys = Array.from(buckets.keys());
        keys.sort((a, b) => {
            const aOrder = order.has(a) ? order.get(a)! : Number.POSITIVE_INFINITY;
            const bOrder = order.has(b) ? order.get(b)! : Number.POSITIVE_INFINITY;
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            const aLabel = a === "__unknown__" ? "Autres" : getBlockTypeLabel(a);
            const bLabel = b === "__unknown__" ? "Autres" : getBlockTypeLabel(b);
            return aLabel.localeCompare(bLabel, "fr", { sensitivity: "base" });
        });

        return keys
            .map((key) => ({
                key,
                title: key === "__unknown__" ? "Autres" : getBlockTypeLabel(key),
                blocks: buckets.get(key) ?? [],
            }))
            .filter((section) => section.blocks.length > 0);
    }, [blocks]);

    const toggleExpandedType = useCallback((key: string) => {
        setExpandedTypes((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    return (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#38bdf8" />}
        >
            <View style={styles.header}>
                <Text style={styles.overline}>BLOCS</Text>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTitleRow}>
                        <Text style={styles.title}>Mes blocs</Text>
                        {!loading ? (
                            <View style={styles.countPill}>
                                <Text style={styles.countText}>{blocks.length}</Text>
                            </View>
                        ) : null}
                    </View>
                    <View style={styles.headerActions}>
                        <Button
                            mode="contained"
                            onPress={() => router.push("/(main)/training/blocks/new")}
                            buttonColor="#22d3ee"
                            textColor="#021019"
                        >
                            Nouveau
                        </Button>
                    </View>
                </View>
                <Text style={styles.subtitle}>Crée des blocs réutilisables puis ajoute-les dans tes entraînements.</Text>
            </View>

            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator />
                </View>
            ) : blocks.length ? (
                <View style={styles.list}>
                    {groupedBlocks.map((section) => (
                        <View key={section.key} style={styles.section}>
                            <Pressable
                                style={styles.sectionHeaderRow}
                                onPress={() => toggleExpandedType(section.key)}
                                accessibilityRole="button"
                                accessibilityLabel={`Afficher les blocs ${section.title}`}
                            >
                                <View style={styles.sectionHeaderLeft}>
                                    <MaterialCommunityIcons
                                        name={expandedTypes.has(section.key) ? "chevron-down" : "chevron-right"}
                                        size={18}
                                        color="#94a3b8"
                                    />
                                    <Text style={styles.sectionTitle}>{section.title}</Text>
                                </View>
                                <View style={styles.sectionHeaderRight}>
                                    <View style={styles.countPill}>
                                        <Text style={styles.countText}>{section.blocks.length}</Text>
                                    </View>
                                </View>
                            </Pressable>
                            {expandedTypes.has(section.key) ? (
                                <View style={styles.sectionBody}>
                                    {section.blocks.map((block) => {
                                        const label = getBlockTypeLabel(block.segment?.blockType);
                                        const detail = buildBlockDetail(block);
                                        return (
                                            <Pressable
                                                key={block.id}
                                                style={styles.card}
                                                onPress={() => router.push(`/(main)/training/blocks/edit/${block.id}`)}
                                                accessibilityRole="button"
                                            >
                                                <View style={styles.cardRow}>
                                                    <View style={styles.cardIcon}>
                                                        <MaterialCommunityIcons name="puzzle" size={20} color="#38bdf8" />
                                                    </View>
                                                    <View style={styles.cardBody}>
                                                        <View style={styles.cardTitleRow}>
                                                            <Text style={styles.cardTitle} numberOfLines={1}>
                                                                {block.title}
                                                            </Text>
                                                            <View style={styles.typePill}>
                                                                <Text style={styles.typePillText}>{label}</Text>
                                                            </View>
                                                        </View>
                                                        {detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}
                                                    </View>
                                                    <MaterialCommunityIcons name="chevron-right" size={22} color="#94a3b8" />
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </View>
                    ))}
                </View>
            ) : (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>Aucun bloc</Text>
                    <Text style={styles.emptyText}>Crée ton premier bloc.</Text>
                    <Button
                        mode="contained"
                        onPress={() => router.push("/(main)/training/blocks/new")}
                        buttonColor="#22d3ee"
                        textColor="#021019"
                        style={{ marginTop: 12 }}
                    >
                        Créer un bloc
                    </Button>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        backgroundColor: "#020617",
    },
    container: {
        paddingHorizontal: 12,
        gap: 12,
    },
    header: {
        gap: 8,
        paddingTop: 4,
    },
    overline: {
        color: "#38bdf8",
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 1.4,
    },
    headerTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    headerTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flex: 1,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: "#f8fafc",
    },
    countPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(148,163,184,0.12)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
    },
    countText: {
        color: "#e2e8f0",
        fontWeight: "800",
        fontSize: 12,
    },
    subtitle: {
        marginTop: 2,
        color: "#94a3b8",
        lineHeight: 18,
    },
    center: {
        paddingVertical: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    list: {
        gap: 10,
    },
    section: {
        gap: 10,
        paddingTop: 6,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingHorizontal: 2,
        paddingVertical: 6,
    },
    sectionHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    sectionHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    sectionTitle: {
        color: "#e2e8f0",
        fontSize: 13,
        fontWeight: "800",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        flex: 1,
    },
    sectionBody: {
        gap: 10,
    },
    card: {
        borderRadius: 20,
        padding: 14,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    cardRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    cardIcon: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: "rgba(56,189,248,0.1)",
        alignItems: "center",
        justifyContent: "center",
    },
    cardBody: {
        flex: 1,
        gap: 6,
        minWidth: 0,
    },
    cardTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#f8fafc",
        flex: 1,
    },
    typePill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(34,211,238,0.12)",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    typePillText: {
        color: "#22d3ee",
        fontWeight: "800",
        fontSize: 11,
    },
    cardDetail: {
        color: "#94a3b8",
        fontSize: 12,
        lineHeight: 16,
    },
    empty: {
        padding: 18,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(15,23,42,0.55)",
    },
    emptyTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "700",
        textAlign: "center",
    },
    emptyText: {
        color: "#94a3b8",
        marginTop: 6,
        lineHeight: 18,
        textAlign: "center",
        fontStyle: "italic",
    },
});
