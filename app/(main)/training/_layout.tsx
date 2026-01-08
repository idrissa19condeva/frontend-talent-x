import React from "react";
import { Pressable, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";

const BackToSessionsButton = ({ onPress }: { onPress: () => void }) => (
    <Pressable
        onPress={onPress}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Revenir aux séances"
    >
        <MaterialCommunityIcons name="chevron-left" size={22} color="#f8fafc" />
    </Pressable>
);

export default function TrainingLayout() {
    const router = useRouter();

    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: "#020617" },
                headerTintColor: "#f8fafc",
                headerTitleStyle: { fontSize: 16, fontWeight: "600" },
                contentStyle: { backgroundColor: "transparent" },
            }}
        >
            <Stack.Screen name="index" options={{ title: "Séances" }} />
            <Stack.Screen name="create-training" options={{ title: "Créer un entraînement" }} />
            <Stack.Screen name="create" options={{ title: "Planifier une séance" }} />
            <Stack.Screen name="list" options={{ title: "Mes séances" }} />
            <Stack.Screen name="groups/index" options={{ title: "Groupes d'entraînement" }} />
            <Stack.Screen name="groups/create" options={{ title: "Créer un groupe" }} />
            <Stack.Screen name="groups/join" options={{ title: "Rejoindre un groupe" }} />
            <Stack.Screen
                name="groups/[id]/index"
                options={({ navigation }) => ({
                    title: "Détails du groupe",
                    headerLeft: () => (
                        <BackToSessionsButton
                            onPress={() => {
                                if (navigation.canGoBack()) {
                                    navigation.goBack();
                                } else {
                                    router.replace("/(main)/training");
                                }
                            }}
                        />
                    ),
                })}
            />
            <Stack.Screen name="groups/[id]/edit" options={{ title: "Modifier un groupe" }} />
            <Stack.Screen name="edit/[id]" options={{ title: "Modifier la séance" }} />
            <Stack.Screen name="blocks/index" options={{ title: "Mes blocs" }} />
            <Stack.Screen name="blocks/new" options={{ title: "Nouveau bloc" }} />
            <Stack.Screen name="blocks/edit/[id]" options={{ title: "Modifier le bloc" }} />
            <Stack.Screen
                name="[id]"
                options={({ navigation }) => ({
                    title: "Détail de la séance",
                    headerLeft: () => (
                        <BackToSessionsButton
                            onPress={() => {
                                const state = navigation.getState?.();
                                const routes = state?.routes || [];
                                const previousRoute = routes[routes.length - 2];
                                if (previousRoute?.name === "create" || previousRoute?.name === "create-training") {
                                    router.replace("/(main)/training");
                                    return;
                                }
                                if (navigation.canGoBack()) {
                                    navigation.goBack();
                                } else {
                                    router.replace("/(main)/training");
                                }
                            }}
                        />
                    ),
                })}
            />
        </Stack>
    );
}
