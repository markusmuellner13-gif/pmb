import { getBotConfig } from "../../../db/config";
import { isLiveTradingConfigured } from "../../../lib/execution/live";
import { SettingsForm } from "../../../components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await getBotConfig();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Risk limits the strategy engine enforces every cycle, plus trading mode.
        </p>
      </header>
      <SettingsForm config={config} liveTradingConfigured={isLiveTradingConfigured()} />
    </div>
  );
}
