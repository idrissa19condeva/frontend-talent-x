import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Button, IconButton, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useTrainingTemplatesList } from "../../hooks/useTrainingTemplatesList";
import { TrainingTemplate } from "../../types/trainingTemplate";

const formatTypeLabel = (value?: string) => {
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

const getTemplateSubtitle = (template: TrainingTemplate) => {
    const parts: string[] = [];
    const typeLabel = formatTypeLabel(template.type);
    if (typeLabel) parts.push(typeLabel);
    if (typeof template.version === "number") parts.push(`v${template.version}`);
    return parts.join(" · ");
};

export default function TrainingTemplatesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [scope, setScope] = useState<"personal" | "default">("personal");
    const isPersonalView = scope === "personal";

    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(() => new Set());

    const { templates, loading, error, refresh } = useTrainingTemplatesList("library");

    const visibleTemplates = useMemo(() => {
        const list = Array.isArray(templates) ? templates : [];
        return list.filter((t) => (isPersonalView ? !t.isDefault : Boolean(t.isDefault)));
    }, [isPersonalView, templates]);

    const groupedTemplates = useMemo(() => {
        const list = [...visibleTemplates];
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
                const label = formatTypeLabel(type);
                return {
                    id: type || "unknown",
                    type,
                    label,
                    templates,
                };
            })
            .sort((a, b) =>
                getGroupSortKey(a.label).localeCompare(getGroupSortKey(b.label), "fr", { sensitivity: "base" }),
            );
    }, [visibleTemplates]);

    const toggleExpandedType = (key: string) => {
        setExpandedTypes((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    useEffect(() => {
        // Keep expanded groups stable when switching scope / refreshing.
        if (!groupedTemplates.length) {
            setExpandedTypes(new Set());
            return;
        }

        const allowed = new Set(groupedTemplates.map((group) => `${scope}:${group.id}`));
        setExpandedTypes((prev) => {
            const next = new Set<string>();
            for (const key of prev) {
                if (allowed.has(key)) next.add(key);
            }
            if (next.size) return next;
            // Default: keep one group open.
            const first = groupedTemplates[0]?.id;
            return first ? new Set([`${scope}:${first}`]) : new Set();
        });
    }, [groupedTemplates, scope]);

    const handleUseTemplate = (templateId: string) => {
        router.push(`/(main)/training/templates/use/${templateId}`);
    };

    const handleCreateTemplate = () => {
        router.push("/(main)/training/templates/new");
    };

    const handleEditTemplate = async (template: TrainingTemplate) => {
        if (!template?.id) return;
        if (template.isDefault) {
            // Open the editor in "duplicate draft" mode: no API call until the user presses "Mettre à jour".
            router.push({
                pathname: "/(main)/training/templates/edit/[id]",
                params: { id: template.id, duplicate: "1" },
            } as any);
            return;
        }

        router.push(`/(main)/training/templates/edit/${template.id}`);
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.container, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#22d3ee" />}
            >
                <View style={styles.header}>
                    <Text style={styles.overline}>PLANS</Text>

                    <View style={styles.scopeSwitcher}>
                        <Button
                            mode={isPersonalView ? "contained" : "outlined"}
                            onPress={() => setScope("personal")}
                            style={[styles.scopeButton, isPersonalView && styles.scopeButtonActive]}
                            buttonColor={isPersonalView ? "#22d3ee" : "transparent"}
                            textColor={isPersonalView ? "#021019" : "#22d3ee"}
                            disabled={loading}
                        >
                            Mes plans
                        </Button>
                        <Button
                            mode={!isPersonalView ? "contained" : "outlined"}
                            onPress={() => setScope("default")}
                            style={[styles.scopeButton, !isPersonalView && styles.scopeButtonActive]}
                            buttonColor={!isPersonalView ? "#22d3ee" : "transparent"}
                            textColor={!isPersonalView ? "#021019" : "#22d3ee"}
                            disabled={loading}
                        >
                            Par défaut
                        </Button>
                    </View>

                    <View style={styles.headerTopRow}>
                        <View style={styles.headerTitleRow}>
                            <Text style={styles.title}>{isPersonalView ? "Mes plans d’entraînement" : "Plans par défaut"}</Text>
                        </View>

                        {isPersonalView ? (
                            <View style={styles.headerActions}>
                                <IconButton
                                    icon="plus"
                                    size={20}
                                    iconColor="#021019"
                                    containerColor="#22d3ee"
                                    onPress={handleCreateTemplate}
                                    accessibilityLabel="Ajouter un template"
                                />
                            </View>
                        ) : null}
                    </View>

                    <Text style={styles.subtitle}>
                        {isPersonalView
                            ? "Crée des plans d’entraînement réutilisables."
                            : "Duplique un plan par défaut pour créer ta version."}
                    </Text>
                </View>

                {error ? (
                    <View style={styles.stateContainer}>
                        <Text style={styles.stateTitle}>Impossible de charger</Text>
                        <Text style={styles.stateSubtitle}>{error}</Text>
                    </View>
                ) : null}

                {loading && !groupedTemplates.length ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="small" color="#22d3ee" />
                    </View>
                ) : null}

                {!loading && !groupedTemplates.length ? (
                    <View style={styles.stateContainer}>
                        <Text style={styles.stateTitle}>{isPersonalView ? "Aucun plan" : "Aucun plan par défaut"}</Text>
                        {isPersonalView ? (
                            <Button
                                mode="contained"
                                onPress={handleCreateTemplate}
                                buttonColor="#22d3ee"
                                textColor="#02111f"
                                disabled={loading}
                            >
                                Créer un plan
                            </Button>
                        ) : (
                            <Text style={styles.stateSubtitle}>Aucun template par défaut n’est disponible.</Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.list}>
                        {groupedTemplates.map((group) => {
                            const sectionKey = `${scope}:${group.id}`;
                            const expanded = expandedTypes.has(sectionKey);
                            return (
                                <View key={sectionKey} style={styles.section}>
                                    <Pressable
                                        style={styles.sectionHeaderRow}
                                        onPress={() => toggleExpandedType(sectionKey)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Afficher les templates ${group.label}`}
                                    >
                                        <View style={styles.sectionHeaderLeft}>
                                            <MaterialCommunityIcons
                                                name={expanded ? "chevron-down" : "chevron-right"}
                                                size={18}
                                                color="#94a3b8"
                                            />
                                            <Text style={styles.sectionTitle}>{group.label}</Text>
                                        </View>
                                        <View style={styles.sectionHeaderRight}>
                                            <View style={styles.countPill}>
                                                <Text style={styles.countText}>{group.templates.length}</Text>
                                            </View>
                                        </View>
                                    </Pressable>

                                    {expanded ? (
                                        <View style={styles.sectionBody}>
                                            {group.templates.map((template) => (
                                                <View key={template.id} style={styles.card}>
                                                    <View style={styles.cardHeader}>
                                                        <View style={styles.cardIcon}>
                                                            <MaterialCommunityIcons
                                                                name="bookmark-multiple-outline"
                                                                size={18}
                                                                color="#38bdf8"
                                                            />
                                                        </View>
                                                        <View style={styles.cardMain}>
                                                            <Text style={styles.cardTitle}>{template.title}</Text>
                                                            <Text style={styles.cardSubtitle}>{getTemplateSubtitle(template)}</Text>
                                                        </View>
                                                    </View>
                                                    <View style={styles.cardActions}>
                                                        <Button
                                                            mode="outlined"
                                                            onPress={() => handleEditTemplate(template)}
                                                            textColor="#cbd5e1"
                                                            disabled={loading}
                                                        >
                                                            {template.isDefault ? "Dupliquer" : "Modifier"}
                                                        </Button>
                                                        <Button
                                                            mode="contained"
                                                            onPress={() => handleUseTemplate(template.id)}
                                                            buttonColor="#22d3ee"
                                                            textColor="#02111f"
                                                            disabled={loading}
                                                        >
                                                            Planifier
                                                        </Button>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
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
    overline: {
        color: "#94a3b8",
        letterSpacing: 1.4,
        fontSize: 12,
        fontWeight: "700",
    },
    scopeSwitcher: {
        flexDirection: "row",
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
    },
    scopeButton: {
        flex: 1,
        borderRadius: 0,
        borderColor: "transparent",
    },
    scopeButtonActive: {
        borderColor: "transparent",
    },
    headerTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    headerTitleRow: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
        color: "#f8fafc",
    },
    subtitle: {
        color: "#cbd5e1",
        lineHeight: 20,
        fontSize: 13,
    },
    loadingBox: {
        paddingVertical: 16,
        alignItems: "center",
    },
    list: {
        gap: 12,
    },
    section: {
        gap: 10,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.22)",
        backgroundColor: "rgba(15,23,42,0.6)",
    },
    sectionHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 1,
    },
    sectionHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    sectionTitle: {
        color: "#94a3b8",
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
    },
    countPill: {
        minWidth: 32,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: "rgba(56,189,248,0.12)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.28)",
        alignItems: "center",
        justifyContent: "center",
    },
    countText: {
        color: "#38bdf8",
        fontSize: 12,
        fontWeight: "700",
    },
    sectionBody: {
        gap: 12,
    },
    card: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    cardHeader: {
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
    cardMain: {
        flex: 1,
        gap: 2,
    },
    cardTitle: {
        color: "#f8fafc",
        fontSize: 14,
        fontWeight: "700",
    },
    cardSubtitle: {
        color: "#94a3b8",
        fontSize: 11,
    },
    cardActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 12,
    },
    stateContainer: {
        borderRadius: 22,
        padding: 18,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        gap: 8,
    },
    stateTitle: {
        color: "#f8fafc",
        fontSize: 14,
        textAlign: "center",
        fontStyle: "italic"
    },
    stateSubtitle: {
        color: "#cbd5e1",
        lineHeight: 20,
    },
});
