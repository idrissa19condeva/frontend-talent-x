// app/(main)/_layout.tsx
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/context/AuthContext";

export default function MainLayout() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user } = useAuth();
    const role = user?.role ? String(user.role).toLowerCase() : "";
    const isCoach = role === "coach";
    const hideStatsTab = isCoach;
    const baseTabHeight = 68;
    const navLiftOffset = Math.max(insets.bottom, 10);
    const tabBarPaddingBottom = Math.max(insets.bottom / 2, 6);
    const scrollGuardPadding = baseTabHeight + Math.max(insets.bottom, 4);

    const settingsBackButton = (
        <TouchableOpacity onPress={() => router.replace("/(main)/account")} style={{ marginLeft: 10 }}>
            <Ionicons name="arrow-back-outline" size={24} color="#0ea5e9" />
        </TouchableOpacity>
    );

    const aboutBackButton = (
        <TouchableOpacity onPress={() => router.replace("/(main)/account")} style={{ marginLeft: 10 }}>
            <Ionicons name="arrow-back-outline" size={24} color="#0ea5e9" />
        </TouchableOpacity>
    );

    return (
        <Tabs
            screenOptions={{
                sceneStyle: {
                    backgroundColor: "transparent",
                    paddingBottom: scrollGuardPadding,
                },
                headerShown: false,
                tabBarActiveTintColor: "#22d3ee",
                tabBarInactiveTintColor: "#94a3b8",
                tabBarStyle: {
                    backgroundColor: "rgba(15,23,42,0.85)",
                    borderTopWidth: 0,
                    height: baseTabHeight,
                    marginHorizontal: 16,
                    marginBottom: navLiftOffset,
                    borderRadius: 22,
                    position: "absolute",
                    shadowColor: "#000",
                    shadowOpacity: 0.2,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 8,
                    paddingBottom: tabBarPaddingBottom,
                    paddingTop: 6,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: "600",
                },
                tabBarItemStyle: {
                    marginTop: 8,
                },
            }}
        >

            <Tabs.Screen
                name="home"
                options={{
                    title: "Accueil",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="training"
                options={{
                    title: "Séances",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="barbell-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile-stats"
                options={{
                    title: "Perfs",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="stats-chart-outline" size={size} color={color} />
                    ),
                    href: hideStatsTab ? null : undefined,
                }}
            />
            <Tabs.Screen
                name="user-profile"
                options={{
                    title: "Profil",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="account"
                options={{
                    title: "Compte",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="settings-outline" size={size} color={color} />
                    ),
                    sceneStyle: { paddingBottom: 50, backgroundColor: "#000" },
                }}
            />


            {/* 🧩 Masquer le dossier edit-profile */}
            <Tabs.Screen
                name="edit-profile"
                options={{
                    href: null, // 👈 Cache complètement ce dossier du Tab principal
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    href: null,
                    headerShown: true,
                    title: "Préférences & réseaux",
                    headerTitleAlign: "center",
                    headerTintColor: "#0ea5e9",
                    headerStyle: { backgroundColor: "rgba(15,23,42,0.6)" },
                    headerTransparent: false,
                    headerLeft: () => settingsBackButton,
                }}
            />
            <Tabs.Screen
                name="about"
                options={{
                    href: null,
                    headerShown: true,
                    title: "À propos",
                    headerTitleAlign: "center",
                    headerTintColor: "#0ea5e9",
                    headerStyle: { backgroundColor: "rgba(15,23,42,0.6)" },
                    headerTransparent: false,
                    headerLeft: () => aboutBackButton,
                }}
            />
            <Tabs.Screen
                name="profiles/[id]"
                options={{
                    href: null,
                }}
            />
        </Tabs>
    );
}
