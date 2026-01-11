import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider as PaperProvider } from "react-native-paper";

import TrainingGroupSearchScreen from "../../src/screens/training/TrainingGroupSearchScreen";

const mockSearchTrainingGroups = jest.fn();
const mockJoinTrainingGroup = jest.fn();

jest.mock("../../src/api/groupService", () => {
    return {
        searchTrainingGroups: (...args: any[]) => mockSearchTrainingGroups(...args),
        joinTrainingGroup: (...args: any[]) => mockJoinTrainingGroup(...args),
    };
});

jest.mock("expo-router", () => {
    const actual = jest.requireActual("expo-router");
    return {
        ...actual,
        useRouter: () => ({
            push: jest.fn(),
            replace: jest.fn(),
            back: jest.fn(),
            canGoBack: jest.fn(() => false),
        }),
        // Avoid focus side-effects in unit tests.
        useFocusEffect: () => { },
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

describe("TrainingGroupSearchScreen suggestions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("suggestions are sorted by membersCount desc (Top 5)", async () => {
        mockSearchTrainingGroups.mockResolvedValueOnce([
            { id: "g1", name: "Alpha", membersCount: 3, createdAt: "2025-01-01T10:00:00Z" },
            { id: "g2", name: "Bravo", membersCount: 20, createdAt: "2025-01-01T09:00:00Z" },
            { id: "g3", name: "Charlie", membersCount: 7, createdAt: "2025-01-01T11:00:00Z" },
            { id: "g4", name: "Delta", membersCount: 7, createdAt: "2025-01-02T11:00:00Z" },
            { id: "g5", name: "Echo", membersCount: 1, createdAt: "2024-12-31T11:00:00Z" },
            { id: "g6", name: "Foxtrot", membersCount: 9, createdAt: "2025-01-03T11:00:00Z" },
        ]);

        const { getAllByText } = renderWithShell(<TrainingGroupSearchScreen />);

        await waitFor(() => expect(mockSearchTrainingGroups).toHaveBeenCalled());
        // Initial call is suggestions mode.
        expect(mockSearchTrainingGroups).toHaveBeenCalledWith("", 50);

        // Names appear in the list in render order.
        const renderedNames = getAllByText(/Alpha|Bravo|Charlie|Delta|Echo|Foxtrot/).map((n) => n.props.children);
        // Top 5 by membersCount: Bravo (20), Foxtrot (9), Delta (7, newer), Charlie (7), Alpha (3)
        expect(renderedNames.slice(0, 5)).toEqual(["Bravo", "Foxtrot", "Delta", "Charlie", "Alpha"]);
    });
});
