import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AboutScreen() {
    const content = useMemo(
        () =>
            `Organise ton entraînement. Suis ta progression. Avance ensemble.\n\n` +
            `Talent-X est une application mobile pensée pour les athlètes et les coachs qui veulent gagner en clarté et en efficacité. Planifie tes séances en quelques secondes, retrouve ton historique d’entraînement et visualise ta progression sans effort.\n\n` +
            `Plus qu’un simple carnet d’entraînement, Talent-X facilite la collaboration : les coachs créent des groupes, partagent des séances et suivent leurs athlètes, tandis que chacun garde une vision claire de son travail et de ses objectifs.\n\n` +
            `Avec Talent-X, tout ton entraînement est au même endroit — pour t’entraîner mieux, ensemble, et progresser durablement.`,
        [],
    );

    return (
        <SafeAreaView style={styles.safe} edges={["left", "right"]}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: 12,
                    paddingTop: 14,
                    // The Tabs layout already adds bottom padding to avoid the tab bar.
                    // Keep this minimal to prevent a visible gap above the navigation bar.
                    paddingBottom: 24,
                }}
                contentInsetAdjustmentBehavior="never"
            >
                <View style={styles.card}>
                    <Text style={styles.title}>À propos de Talent-X</Text>
                    <Text style={styles.body}>{content}</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: "#010617",
    },
    card: {
        borderRadius: 22,
        padding: 16,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        gap: 12,
    },
    title: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "800",
    },
    body: {
        color: "#cbd5e1",
        fontSize: 13,
        lineHeight: 19,
    },
});
