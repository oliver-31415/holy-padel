import type { NewMatchDefaults } from "@holy-padel/db";
import type { ReactNode } from "react";
import { XStack } from "tamagui";
import { Button, Chip } from "@/components/controls.tsx";
import { Card, Display } from "@/components/ui.tsx";
import { setupSummary, setupTitle } from "@/lib/format.ts";

/**
 * The collapsed rules card: the current sport and format, one Edit affordance,
 * and a wrap of chips describing every rule. Keeps the setup screen short
 * while a tap opens the full editor.
 */
export function RulesSummaryCard({
  setup,
  onEdit,
}: {
  readonly setup: NewMatchDefaults;
  readonly onEdit: () => void;
}): ReactNode {
  return (
    <Card padding={20} paddingTop={12} gap={8} testID="rules-summary">
      <XStack alignItems="center" justifyContent="space-between">
        <Display fontSize={22} fontWeight="600">
          {setupTitle(setup)}
        </Display>
        <Button
          label="Edit"
          aria-label="Edit match rules"
          variant="text"
          size="sm"
          icon="tune"
          marginRight={-12}
          onPress={onEdit}
        />
      </XStack>
      <XStack flexWrap="wrap" gap={8}>
        {setupSummary(setup).map((label) => (
          <Chip key={label} label={label} />
        ))}
      </XStack>
    </Card>
  );
}
