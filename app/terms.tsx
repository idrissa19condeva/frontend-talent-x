import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function TermsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const handleBack = () => {
        if (router.canGoBack?.()) {
            router.back();
        } else {
            router.replace("/");
        }
    };

    const lastUpdated = useMemo(() => {
        try {
            return new Date().toLocaleDateString("fr-FR");
        } catch {
            return "";
        }
    }, []);

    return (
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: 10,
                    paddingBottom: Math.max(insets.bottom + 24, 36),
                }}
                stickyHeaderIndices={[0]}
            >
                {/* HEADER */}
                <View style={styles.stickyHeader}>
                    <View style={styles.headerCard}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={handleBack}
                            accessibilityRole="button"
                            accessibilityLabel="Retour"
                        >
                            <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
                        </TouchableOpacity>

                        <View style={styles.headerIconWrap}>
                            <Ionicons name="document-text-outline" size={22} color="#e2e8f0" />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>Mentions légales & CGU</Text>
                            <Text style={styles.headerSubtitle}>
                                Dernière mise à jour : {lastUpdated}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* CONTENT */}
                <View style={styles.card}>
                    <Section title="1. Mentions légales">
                        {`Nom de l’application : Talent-X

Éditeur :
Idrissa CONDE
Statut : Particulier – éditeur non professionnel

Adresse :
Conformément à l’article 6-III-2 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique, l’adresse personnelle de l’éditeur a été communiquée à l’hébergeur et peut être transmise aux autorités judiciaires sur réquisition.

Email de contact :
contact@talent-x.app

Directeur de la publication :
Idrissa CONDE

Hébergeur :
OVHcloud
OVH SAS
2 rue Kellermann, 59100 Roubaix, France`}
                    </Section>

                    <Section title="2. Conditions Générales d’Utilisation (CGU)">
                        {`1. Objet
Les présentes Conditions Générales d’Utilisation (ci-après « CGU ») ont pour objet de définir les modalités d’accès et d’utilisation de l’application mobile Talent-X (ci-après « l’Application »).

Toute utilisation de l’Application implique l’acceptation pleine et entière des présentes CGU.

2. Accès à l’Application
L’Application est gratuite et accessible sur appareils Android et iOS, sous réserve de disposer d’un accès à internet.

L’éditeur se réserve le droit de suspendre temporairement l’accès à l’Application pour maintenance, mise à jour ou amélioration.

3. Création de compte
L’accès à certaines fonctionnalités nécessite la création d’un compte utilisateur.

L’utilisateur s’engage à :
• fournir des informations exactes et à jour,
• maintenir la confidentialité de ses identifiants,
• ne pas usurper l’identité d’un tiers.

Toute utilisation du compte est réputée effectuée par l’utilisateur titulaire.

4. Utilisation autorisée
L’utilisateur s’engage à utiliser l’Application :
• conformément aux lois et règlements en vigueur,
• dans un cadre strictement personnel et non commercial,
• dans le respect des autres utilisateurs et de l’éditeur.

Sont strictement interdits :
• toute tentative d’accès frauduleux,
• toute extraction automatisée ou massive de données,
• toute atteinte au bon fonctionnement de l’Application.

5. Données sportives et sources tierces
L’Application permet à l’utilisateur de centraliser et visualiser ses données sportives.

Ces données peuvent provenir :
• de données saisies manuellement par l’utilisateur,
• de données issues de sources publiques accessibles en ligne, à la demande expresse de l’utilisateur.

Talent-X n’est pas propriétaire de ces bases de données tierces.
Les droits afférents à ces contenus restent la propriété exclusive de leurs ayants droit.

L’utilisateur reconnaît être à l’initiative de toute demande d’import de données externes et déclare disposer du droit de les utiliser.

Talent-X agit exclusivement comme outil technique de centralisation et de visualisation.

6. Propriété intellectuelle
L’ensemble des éléments de l’Application est protégé par le Code de la propriété intellectuelle.
Toute reproduction ou exploitation non autorisée est interdite.

7. Responsabilité
L’Application est fournie « en l’état ».

L’éditeur ne saurait être tenu responsable :
• d’une indisponibilité temporaire,
• d’erreurs issues de sources tierces,
• de pertes de données imputables à l’utilisateur ou à un tiers.

Les données sportives n’ont aucune valeur médicale.

8. Résiliation
L’utilisateur peut supprimer son compte à tout moment.
L’éditeur se réserve le droit de suspendre ou supprimer un compte en cas de violation des CGU.

9. Droit applicable
Les présentes CGU sont soumises au droit français.
Les tribunaux français sont seuls compétents.`}
                    </Section>

                    <Section title="3. Politique de confidentialité (RGPD)">
                        {`1. Responsable du traitement
Le responsable du traitement est :
Idrissa CONDÉ
Contact : contact@talent-x.app

2. Données collectées
• données d’identification (email, pseudo),
• données sportives (performances, entraînements),
• données techniques (adresse IP, logs).

3. Origine des données
Les données sont fournies par l’utilisateur ou issues de sources publiques accessibles en ligne à sa demande expresse.

Talent-X ne revendique aucun droit de propriété sur ces données tierces.

4. Finalités
• fonctionnement de l’Application,
• gestion des comptes,
• visualisation des performances,
• amélioration du service,
• sécurité.

5. Base légale
• exécution du service,
• consentement explicite,
• intérêt légitime pour la sécurité.

6. Consentement
Le consentement est donné lors de l’inscription et peut être retiré à tout moment.

7. Durée de conservation
• tant que le compte est actif,
• suppression sous 30 jours après clôture.

8. Partage
Aucune vente ni cession des données.
Partage uniquement si obligation légale ou hébergement.

9. Sécurité
Mesures techniques et organisationnelles adaptées mises en œuvre.

10. Droits
Accès, rectification, suppression, opposition, portabilité.

Contact :
contact@talent-x.app

11. Réclamation
L’utilisateur peut saisir la CNIL :
www.cnil.fr`}
                    </Section>

                    <Section title="4. Texte d’acceptation">
                        {`J’accepte les Conditions Générales d’Utilisation et la Politique de Confidentialité et je consens explicitement au traitement de mes données personnelles et sportives conformément au RGPD.`}
                    </Section>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionText}>{children}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: "#010617",
    },
    stickyHeader: {
        paddingTop: 6,
        paddingBottom: 10,
        backgroundColor: "#010617",
    },
    headerCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: 22,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
    },
    backButton: {
        width: 34,
        height: 34,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
        backgroundColor: "rgba(2,6,23,0.55)",
    },
    headerIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
        backgroundColor: "rgba(34,211,238,0.12)",
    },
    headerTitle: {
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "800",
    },
    headerSubtitle: {
        color: "#94a3b8",
        fontSize: 12,
        marginTop: 2,
    },
    card: {
        borderRadius: 22,
        padding: 16,
        backgroundColor: "rgba(15,23,42,0.75)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.2)",
        gap: 14,
    },
    section: {
        gap: 6,
    },
    sectionTitle: {
        color: "#e2e8f0",
        fontWeight: "800",
        fontSize: 13,
    },
    sectionText: {
        color: "#cbd5e1",
        fontSize: 13,
        lineHeight: 19,
    },
});
