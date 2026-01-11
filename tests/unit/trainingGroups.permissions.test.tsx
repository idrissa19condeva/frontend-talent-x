import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider as PaperProvider } from "react-native-paper";

import TrainingGroupsScreen from "../../src/screens/training/TrainingGroupsScreen";
import TrainingGroupCreateScreen from "../../src/screens/training/TrainingGroupCreateScreen";

let mockUser: any = { id: "u1", role: "athlete" };

jest.mock("../../src/context/AuthContext", () => {
    return {
        useAuth: () => ({
            user: mockUser,
        }),
    };
});

const mockReplace = jest.fn();

jest.mock("expo-router", () => {
    const actual = jest.requireActual("expo-router");
    return {
        ...actual,
        useRouter: () => ({
            push: jest.fn(),
            replace: mockReplace,
            back: jest.fn(),
            canGoBack: jest.fn(() => false),
        }),
        useLocalSearchParams: () => ({}),
        // In unit tests we don't need to trigger focus lifecycle.
        // Calling the callback synchronously during render can cause infinite rerenders.
        useFocusEffect: () => { },
    };
});

jest.mock("../../src/api/groupService", () => {
    return {
        listMyTrainingGroups: jest.fn(async () => []),
    };
});

const wrapperMetrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderWithShell = (ui: React.ReactElement) =>
    render(
        <SafeAreaProvider initialMetrics={wrapperMetrics as any}>
            <PaperProvider>{ui}</PaperProvider>
        </SafeAreaProvider>,
    );

describe("Training groups permissions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = { id: "u1", role: "athlete" };
    });

    test("athlete does not see 'Créer un groupe' button", async () => {
        const { queryByText, getByText } = renderWithShell(<TrainingGroupsScreen />);

        // The join action is always available.
        expect(getByText("Rejoindre")).toBeTruthy();
        // The create action is coach-only.
        expect(queryByText("Créer un groupe")).toBeNull();

        // Coach-only section / stats must be hidden for athletes.
        expect(queryByText("Groupes créés")).toBeNull();
        expect(queryByText("Créés par vous")).toBeNull();
    });

    test("coach sees 'Créer un groupe' button", async () => {
        mockUser = { id: "c1", role: "coach" };

        const { getByText } = renderWithShell(<TrainingGroupsScreen />);

        expect(getByText("Créer un groupe")).toBeTruthy();
        expect(getByText("Rejoindre")).toBeTruthy();
        expect(getByText("Groupes créés")).toBeTruthy();
        expect(getByText("Créés par vous")).toBeTruthy();
    });

    test("athlete opening create screen gets redirected", async () => {
        mockUser = { id: "u1", role: "athlete" };

        renderWithShell(<TrainingGroupCreateScreen />);

        await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
        expect(mockReplace).toHaveBeenCalledWith({
            pathname: "/(main)/training/groups",
            params: { toast: "La création de groupe est réservée aux coachs." },
        });
    });
});
