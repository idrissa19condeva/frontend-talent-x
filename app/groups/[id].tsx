import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

export default function GroupUniversalLinkRoute() {
    const params = useLocalSearchParams<{ id?: string }>();
    const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
    const id = rawId?.trim();

    if (!id) {
        return <Redirect href="/(main)/training/groups" />;
    }

    return <Redirect href={{ pathname: "/(main)/training/groups/[id]", params: { id } }} />;
}
