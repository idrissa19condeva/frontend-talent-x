import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, ActivityIndicator, Pressable } from "react-native";
import { Button, Dialog, Portal, Snackbar, Text, TextInput } from "react-native-paper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { joinTrainingGroup, searchTrainingGroups } from "../../api/groupService";
import { TrainingGroupSummary } from "../../types/trainingGroup";

export default function TrainingGroupSearchScreen() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<TrainingGroupSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searched, setSearched] = useState(false);
    const [autoSearchReady, setAutoSearchReady] = useState(false);
    const [systemDialogVisible, setSystemDialogVisible] = useState(false);
    const [systemDialogTitle, setSystemDialogTitle] = useState("");
    const [systemDialogMessage, setSystemDialogMessage] = useState("");
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const insets = useSafeAreaInsets();

    const showSystemDialog = useCallback((title: string, message: string) => {
        setSystemDialogTitle(title);
        setSystemDialogMessage(message);
        setSystemDialogVisible(true);
    }, []);

    const showToast = useCallback((message: string) => {
        setToastMessage(message);
        setToastVisible(true);
    }, []);

    const fetchResults = useCallback(
        async (term: string, options?: { showLoader?: boolean }) => {
            const trimmed = term.trim();
            const showLoader = options?.showLoader ?? true;
            try {
                if (showLoader) setLoading(true);
                const limit = trimmed.length === 0 ? 50 : 5;
                const data = await searchTrainingGroups(trimmed, limit);

                if (trimmed.length === 0) {
                    const topByMembers = [...data]
                        .sort((a, b) => {
                            const diff = (b.membersCount || 0) - (a.membersCount || 0);
                            if (diff !== 0) return diff;

                            const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                            const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                            if (bCreated !== aCreated) return bCreated - aCreated;

                            return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
                        })
                        .slice(0, 5);
                    setResults(topByMembers);
                } else {
                    setResults(data);
                }
                setSearched(true);
            } catch (error: any) {
                const message = error?.response?.data?.message || error?.message || "Recherche impossible";
                showSystemDialog("Erreur", message);
            } finally {
                if (showLoader) setLoading(false);
            }
        },
        [showSystemDialog]
    );

    useEffect(() => {
        fetchResults("", { showLoader: true }).finally(() => setAutoSearchReady(true));
    }, [fetchResults]);

    useEffect(() => {
        if (!autoSearchReady) return;
        const handler = setTimeout(() => {
            fetchResults(query, { showLoader: false });
        }, 300);
        return () => clearTimeout(handler);
    }, [autoSearchReady, fetchResults, query]);

    // When coming back from the group details screen, refresh so the CTA reflects
    // a join request that may have been sent there.
    useFocusEffect(
        useCallback(() => {
            if (!autoSearchReady) return;
            setRefreshing(true);
            fetchResults(query, { showLoader: false }).finally(() => setRefreshing(false));
        }, [autoSearchReady, fetchResults, query]),
    );

    const performSearch = useCallback(async () => {
        try {
            await fetchResults(query, { showLoader: true });
        } catch (error) {
            console.error(error);
        }
    }, [fetchResults, query]);

    const handleJoin = useCallback(async (group: TrainingGroupSummary) => {
        if (group.isMember || group.hasPendingRequest || group.hasPendingInvite) {
            return;
        }
        try {
            setRefreshing(true);
            const updated = await joinTrainingGroup(group.id);
            setResults((prev) =>
                prev.map((item) => (item.id === group.id ? { ...item, ...updated, hasPendingRequest: true } : item)),
            );
            showToast("Votre demande a été transmise au coach du groupe.");
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || "Impossible d'envoyer la demande";
            showSystemDialog("Erreur", message);
        } finally {
            setRefreshing(false);
        }
    }, [showSystemDialog, showToast]);

    const handleRefresh = useCallback(async () => {
        try {
            setRefreshing(true);
            await fetchResults(query, { showLoader: false });
        } finally {
            setRefreshing(false);
        }
    }, [fetchResults, query]);

    const handleOpen = useCallback(
        (group: TrainingGroupSummary) => {
            router.push({ pathname: "/(main)/training/groups/[id]", params: { id: group.id } });
        },
        [router]
    );

    const isSuggestionMode = query.trim().length === 0;

    return (
        <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
            <ScrollView
                contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#22d3ee" />}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Rejoindre un groupe</Text>
                    <Text style={styles.subtitle}>
                        Recherchez le nom partagé par votre coach. Si le groupe existe, vous pourrez le rejoindre en un
                        tap.
                    </Text>
                </View>
                <View style={styles.card}>
                    <TextInput
                        label="Nom du groupe"
                        value={query}
                        onChangeText={setQuery}
                        mode="outlined"
                        style={styles.input}
                        placeholder="Ex: Sprint Club Nancy"
                        returnKeyType="search"
                        onSubmitEditing={performSearch}
                        autoCapitalize="words"
                    />
                    <Button mode="contained" onPress={performSearch} loading={loading} disabled={loading} buttonColor="#22d3ee" textColor="#02111f">
                        Rechercher
                    </Button>
                </View>
                <View style={styles.resultsContainer}>
                    <View style={styles.resultsHeader}>
                        <Text style={styles.resultsTitle}>{isSuggestionMode ? "Suggestions" : "Résultats"}</Text>
                        <Text style={styles.resultsHint}>
                            {isSuggestionMode ? "Top 5 groupes" : `${results.length} résultat${results.length > 1 ? "s" : ""}`}
                        </Text>
                    </View>
                    {loading ? (
                        <ActivityIndicator size="small" color="#22d3ee" style={{ marginVertical: 12 }} />
                    ) : null}
                    {searched && !results.length && !loading ? (
                        <Text style={styles.emptyState}>Aucun groupe trouvé pour cette recherche.</Text>
                    ) : null}
                    {results.map((group) => (
                        <View key={group.id} style={styles.groupCard}>
                            <Pressable style={styles.groupHeaderRow} onPress={() => handleOpen(group)}>
                                <Text style={styles.groupName} numberOfLines={1} ellipsizeMode="tail">
                                    {group.name}
                                </Text>
                                <View style={styles.membersMeta}>
                                    <MaterialCommunityIcons name="account-group-outline" size={16} color="#94a3b8" />
                                    <Text style={styles.membersCount}>{group.membersCount}</Text>
                                </View>
                            </Pressable>
                            <View style={styles.groupActionRow}>
                                <Pressable onPress={() => handleOpen(group)} hitSlop={8}>
                                    <Text style={styles.groupLink}>Voir le groupe</Text>
                                </Pressable>
                                <Button
                                    mode={group.isMember || group.hasPendingRequest || group.hasPendingInvite ? "outlined" : "contained"}
                                    onPress={() => handleJoin(group)}
                                    disabled={group.isMember || group.hasPendingRequest || group.hasPendingInvite || refreshing}
                                    textColor={group.isMember || group.hasPendingRequest || group.hasPendingInvite ? "#94a3b8" : "#02111f"}
                                    buttonColor={group.isMember || group.hasPendingRequest || group.hasPendingInvite ? "transparent" : "#22d3ee"}
                                >
                                    {group.isMember
                                        ? "Dans le groupe"
                                        : group.hasPendingInvite
                                            ? "Invitation reçue"
                                            : group.hasPendingRequest
                                                ? "Demande envoyée"
                                                : "Demander"}
                                </Button>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>

            <Portal>
                <Dialog visible={systemDialogVisible} onDismiss={() => setSystemDialogVisible(false)} style={styles.dialog}>
                    <Dialog.Title>{systemDialogTitle}</Dialog.Title>
                    <Dialog.Content>
                        <Text>{systemDialogMessage}</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setSystemDialogVisible(false)}>OK</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Snackbar
                visible={toastVisible}
                onDismiss={() => setToastVisible(false)}
                duration={2500}
                action={{ label: "OK", onPress: () => setToastVisible(false) }}
            >
                {toastMessage}
            </Snackbar>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#020617",
    },
    container: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 0,
        gap: 16,
    },
    header: {
        gap: 6,
    },
    overline: {
        textTransform: "uppercase",
        letterSpacing: 1.6,
        color: "#38bdf8",
        fontSize: 12,
    },
    title: {
        fontSize: 26,
        fontWeight: "700",
        color: "#f8fafc",
    },
    subtitle: {
        color: "#94a3b8",
        fontSize: 14,
        lineHeight: 20,
    },
    card: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: "rgba(15,23,42,0.85)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        gap: 12,
    },
    input: {
        backgroundColor: "transparent",
    },
    resultsContainer: {
        gap: 10,
    },
    resultsHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    resultsTitle: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
    },
    resultsHint: {
        color: "#94a3b8",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    emptyState: {
        color: "#94a3b8",
        fontSize: 13,
        textAlign: "center",
        marginTop: 12,
    },
    groupCard: {
        borderRadius: 18,
        padding: 16,
        backgroundColor: "rgba(15,23,42,0.9)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.2)",
        gap: 10,
    },
    groupHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    groupName: {
        flex: 1,
        fontSize: 18,
        fontWeight: "600",
        color: "#f8fafc",
    },
    membersMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    membersCount: {
        color: "#94a3b8",
        fontSize: 12,
        fontWeight: "600",
    },
    groupLink: {
        color: "#38bdf8",
        fontSize: 12,
        marginTop: 2,
    },
    groupActionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    dialog: {
        borderRadius: 16,
    },
});
