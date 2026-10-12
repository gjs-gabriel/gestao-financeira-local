import { Card, ListRow, Screen, Subtitle, Title } from "../../src/components/ui";

export default function IaScreen() {
  return (
    <Screen>
      <Title>Assistente local</Title>
      <Subtitle>
        Inteligência por regras e cálculos neste aparelho — sem enviar dados para
        a nuvem.
      </Subtitle>
      <Card>
        <ListRow
          title="Finn"
          subtitle="Insights numéricos do seu mês e tendências."
        />
        <ListRow
          title="Analista"
          subtitle="Alertas, portfólio, orçamento e oportunidades."
        />
        <ListRow
          title="Simulação"
          subtitle="Compare à vista, parcelas e poupar antes de comprar."
        />
        <ListRow
          title="Sincronizar"
          subtitle="Exporte ou importe o .gfin com o mesmo PIN entre aparelhos."
        />
      </Card>
    </Screen>
  );
}
