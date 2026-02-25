import { AuroraClient } from "../components/aurora/AuroraClient";

type SearchParamsValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamsValue>;
type UiMode = "guided" | "pro";

type HomePageProps = {
  searchParams?: Promise<SearchParams>;
};

function toSingleValue(value: SearchParamsValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function resolveUiModeFromQuery(value: string | undefined): UiMode | null {
  if (value === "guided" || value === "pro") {
    return value;
  }
  return null;
}

function resolveUiModeFromLegacyEnv(value: string | undefined): UiMode | null {
  if (value === "chat_flat") {
    return "guided";
  }
  if (value === "agent_stage") {
    return "pro";
  }
  return null;
}

export default async function HomePage(props: HomePageProps) {
  const resolvedSearchParams = (await props.searchParams) ?? {};
  const queryUi = resolveUiModeFromQuery(toSingleValue(resolvedSearchParams.ui));
  const envUi = resolveUiModeFromLegacyEnv(process.env.AGENT_UI_MODE);
  const initialUiMode: UiMode = queryUi ?? envUi ?? "guided";

  return <AuroraClient initialUiMode={initialUiMode} />;
}
