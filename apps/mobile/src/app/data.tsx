import type { BackupData } from "@holy-padel/db";
import {
  countMatches,
  databaseSizeBytes,
  deleteMatch,
  exportBackup,
  importBackup,
  listMatches,
  parseBackup,
} from "@holy-padel/db";
import { File, Paths } from "expo-file-system";
import { shareAsync, isAvailableAsync as sharingAvailable } from "expo-sharing";
import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Platform, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack } from "tamagui";
import { ConfirmSheet } from "@/components/confirm-sheet.tsx";
import { Button, ListItem, TextField } from "@/components/controls.tsx";
import { ModalHeader } from "@/components/modal-header.tsx";
import { Display, Label } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { megabytesLabel } from "@/lib/format.ts";
import { goBack } from "@/lib/navigation.ts";
import { colors } from "@/theme/colors.ts";

/**
 * Local data controls — everything lives in on-device SQLite, so this is where
 * you back it up or wipe it. Export produces a JSON backup (matches, point
 * ledgers, players, settings); Import restores one, replacing what's here.
 * Reached from the "On this phone" row on Profile.
 */

function backupFileName(exportedAt: number): string {
  const date = new Date(exportedAt);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `holy-padel-backup-${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}.json`;
}

export default function DataScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const count = useDbQuery(countMatches);
  const sizeBytes = useDbQuery(databaseSizeBytes);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  /** A parsed backup awaiting the themed "replace everything" confirmation. */
  const [pendingBackup, setPendingBackup] = useState<BackupData | undefined>(undefined);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

  const exportAll = (): void => {
    mutate((driver) => {
      const backup = exportBackup(driver);
      const json = JSON.stringify(backup);
      const fileName = backupFileName(backup.exportedAt);
      void (async () => {
        try {
          if (Platform.OS === "web" || !(await sharingAvailable())) {
            await Share.share({ message: json });
            return;
          }
          // Native: write the backup to the cache dir and hand the real file
          // to the share sheet (AirDrop, Drive, mail — a .json attachment).
          const file = new File(Paths.cache, fileName);
          file.write(json);
          await shareAsync(file.uri, {
            mimeType: "application/json",
            dialogTitle: "Export Holy Padel backup",
          });
        } catch {
          await Share.share({ message: json });
        }
      })();
    });
  };

  const importAll = (): void => {
    if (Platform.OS !== "web") {
      // Native: let the user pick the exported .json from their files.
      void (async () => {
        try {
          const result = await File.pickFileAsync({
            mimeTypes: ["application/json", "text/plain"],
          });
          if (!result.canceled) {
            restore(await result.result.text());
          }
        } catch {
          // Picker unavailable — fall back to the paste area.
          setImportOpen(true);
        }
      })();
      return;
    }
    setImportOpen((open) => !open);
  };

  const restore = (raw: string): void => {
    let backup: BackupData;
    try {
      backup = parseBackup(JSON.parse(raw));
    } catch (error) {
      Alert.alert(
        "Import failed",
        error instanceof Error ? error.message : "That doesn't look like a Holy Padel backup.",
      );
      return;
    }
    setPendingBackup(backup);
  };

  const restoreConfirmed = (): void => {
    if (pendingBackup === undefined) {
      return;
    }
    const n = pendingBackup.matches.length;
    mutate((driver) => {
      importBackup(driver, pendingBackup);
    });
    setImportOpen(false);
    setImportText("");
    setPendingBackup(undefined);
    Alert.alert("Backup restored", `${String(n)} matches are back on this phone.`);
  };

  const deleteAllConfirmed = (): void => {
    mutate((driver) => {
      for (const match of listMatches(driver)) {
        deleteMatch(driver, match.id);
      }
    });
    setConfirmingDeleteAll(false);
    goBack();
  };

  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      paddingTop={insets.top + 8}
      paddingBottom={insets.bottom + 16}
      paddingHorizontal={16}
      gap={16}
    >
      <ModalHeader title="Your data" onClose={goBack} label="Close" />

      <YStack backgroundColor={colors.primaryContainer} borderRadius={36} padding={24} gap={2}>
        <Label color={colors.onPrimaryContainer}>On this phone</Label>
        <Display fontSize={36} letterSpacing={-0.5} color={colors.onPrimaryContainer}>
          {`${String(count)} matches`}
        </Display>
        <Label color={colors.onPrimaryContainer}>
          {`SQLite · ${megabytesLabel(sizeBytes)} · never leaves your device`}
        </Label>
      </YStack>

      <YStack gap={2}>
        <ListItem
          icon="upload"
          headline="Export backup"
          supporting="Full JSON backup — matches, points, players and settings"
          chevron={false}
          index={0}
          count={3}
          onPress={exportAll}
          testID="export-data"
        />
        <ListItem
          icon="download"
          headline="Import backup"
          supporting={
            Platform.OS === "web"
              ? "Paste an exported backup to restore it"
              : "Pick an exported backup file to restore it"
          }
          chevron={false}
          index={1}
          count={3}
          onPress={importAll}
          testID="import-data"
        />

        {importOpen ? (
          <YStack
            gap={8}
            padding={16}
            backgroundColor={colors.card}
            borderRadius={6}
            testID="import-sheet"
          >
            <TextField
              style={{ fontSize: 12, minHeight: 112, textAlignVertical: "top" }}
              value={importText}
              onChangeText={setImportText}
              placeholder="Paste the backup JSON here…"
              multiline={true}
              autoCapitalize="none"
              autoCorrect={false}
              testID="import-input"
            />
            <XStack gap={8}>
              {/* Not `disabled`: an empty paste leaves the tap a no-op, as before. */}
              <Button
                flex={1}
                label="Restore"
                size="sm"
                opacity={importText.trim() === "" ? 0.4 : 1}
                onPress={() => {
                  if (importText.trim() !== "") {
                    restore(importText.trim());
                  }
                }}
                testID="import-restore"
              />
              <Button
                label="Cancel"
                variant="outlined"
                size="sm"
                onPress={() => {
                  setImportText("");
                  setImportOpen(false);
                }}
              />
            </XStack>
          </YStack>
        ) : null}

        <ListItem
          icon="trash"
          headline="Delete all matches"
          supporting="Wipe every match from this phone"
          chevron={false}
          danger={true}
          index={2}
          count={3}
          onPress={() => {
            setConfirmingDeleteAll(true);
          }}
          testID="delete-all-data"
        />
      </YStack>

      {pendingBackup === undefined ? null : (
        <ConfirmSheet
          title="Restore backup?"
          message={`Replaces everything on this phone with the backup's ${String(
            pendingBackup.matches.length,
          )} matches. This can't be undone.`}
          confirmLabel="Restore"
          onConfirm={restoreConfirmed}
          onCancel={() => {
            setPendingBackup(undefined);
          }}
        />
      )}

      {confirmingDeleteAll ? (
        <ConfirmSheet
          title="Delete all matches?"
          message="Removes every match and its points from this phone. This can't be undone."
          confirmLabel="Delete all"
          onConfirm={deleteAllConfirmed}
          onCancel={() => {
            setConfirmingDeleteAll(false);
          }}
        />
      ) : null}
    </YStack>
  );
}
