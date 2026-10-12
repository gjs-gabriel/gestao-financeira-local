import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Card, ListRow, Screen, Subtitle, Title } from "../../src/components/ui";
import { MAIS_ROUTES } from "../../src/nav";
import { colors, fonts } from "../../src/theme";
import { useVault } from "../../src/vault/VaultProvider";

export default function MaisScreen() {
  const router = useRouter();
  const vault = useVault();
  const groups = [...new Set(MAIS_ROUTES.map((r) => r.group))];

  return (
    <Screen>
      <Title>Mais</Title>
      <Subtitle>
        {`${vault.activeProfile?.name ?? "Usuário"} · dados locais neste aparelho`}
      </Subtitle>
      {groups.map((group) => (
        <Card key={group}>
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.sansBold,
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {group}
          </Text>
          {MAIS_ROUTES.filter((r) => r.group === group).map((r) => (
            <ListRow
              key={r.href}
              title={r.title}
              onPress={() =>
                router.push(
                  (r.href === "/" ? "/(app)" : `/(app)${r.href}`) as never,
                )
              }
            />
          ))}
        </Card>
      ))}
      <View style={{ height: 8 }} />
      <Card>
        <ListRow title="Bloquear cofre" onPress={() => vault.lock()} />
      </Card>
    </Screen>
  );
}
