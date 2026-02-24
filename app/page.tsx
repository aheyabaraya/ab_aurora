import { AuroraClient } from "../components/aurora/AuroraClient";

type SearchParamsValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamsValue>;

type HomePageProps = {
  searchParams?: Promise<SearchParams>;
};

function toSingleValue(value: SearchParamsValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function resolveUiModeFromEnv(raw: string | undefined): "guided" | "pro" {
  if (!raw) {
    return "guided";
  }
  if (raw === "chat_flat" || raw === "guided") {
    return "guided";
  }
  if (raw === "agent_stage" || raw === "pro") {
    return "pro";
  }
  return "guided";
}

export default async function HomePage(props: HomePageProps) {
  const resolvedSearchParams = (await props.searchParams) ?? {};
  const queryUi = toSingleValue(resolvedSearchParams.ui);

  const initialUiMode = queryUi === "guided" || queryUi === "pro" ? queryUi : resolveUiModeFromEnv(process.env.AGENT_UI_MODE);

  return <AuroraClient initialUiMode={initialUiMode} />;
}
