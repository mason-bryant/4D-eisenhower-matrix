import {
  type App,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  type SettingDefinitionItem,
} from 'obsidian';
import type EisenhowerMatrixPlugin from '../../main.ts';
import { getDailyNotesFolder } from '../obsidian-adapter/dailyNotes.ts';
import { showError } from '../obsidian-adapter/toast.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import {
  PRIORITY_LEVELS,
  RULE_QUADRANTS,
  type PriorityLevel,
  type PriorityOp,
  type QuadrantRule,
  type RuleQuadrant,
} from '../core/quadrantRules.ts';
import { ConfirmModal } from '../obsidian-adapter/ConfirmModal.ts';
import { ExcludeFolderModal } from './ExcludeFolderModal.ts';
import { FolderSuggest } from './FolderSuggest.ts';

const DEFAULT_DAILY_HEADING = DEFAULT_SETTINGS.dailySectionHeading;

const DAILY_FOLDER_NAME = 'Daily folder';
const dailyFolderDesc = (coreLabel: string) =>
  `Folder where new daily notes are created. Leave empty to use the core "Daily notes" plugin config — currently ${coreLabel}.`;
const DAILY_FOLDER_PLACEHOLDER = 'e.g. Daily (or leave empty)';

const DAILY_HEADING_NAME = 'Daily section heading';
const DAILY_HEADING_DESC =
  "Heading in the daily note under which today's tasks are read and added. New tasks go below it; if missing, it is created automatically.";

const EXCLUDED_NAME = 'Excluded folders';
const EXCLUDED_DESC = 'Tasks from these folders are hidden from the matrix.';

const QUADRANT_MODE_NAME = 'Quadrant assignment';
const QUADRANT_MODE_DESC =
  'Tags: a task goes in the quadrant named by its first tag (#DO, #DECIDE, …); anything else is OPEN. Rules: that tag still wins (dragging adds one), and untagged tasks go to the first enabled rule they match, checked DO → DECIDE → DELEGATE → DELETE; no match = OPEN.';
const QUADRANT_MODE_OPTIONS: Record<string, string> = { tags: 'Tags', rules: 'Rules' };
const RESET_RULES_NAME = 'Reset quadrant rules';
const RESET_RULES_DESC = 'Restore the default rules for all four quadrants.';
const PRIORITY_OP_OPTIONS: Record<PriorityOp, string> = {
  any: 'Any priority',
  atLeast: 'At or above',
  atMost: 'At or below',
};
const PRIORITY_LEVEL_LABELS: Record<PriorityLevel, string> = {
  highest: 'Highest', high: 'High', medium: 'Medium', normal: 'Normal (none)', low: 'Low', lowest: 'Lowest',
};
const RULE_DUE_DESC =
  'Ticked options are OR\'ed; none ticked = any due date. N counts days from today (within = today … today+N).';

const WARN_BLOCKED_NAME = 'Warn when completing a blocked task';
const WARN_BLOCKED_DESC = 'Ask for confirmation before completing a task with unfinished dependencies.';
const RESPECT_DEPENDENCIES_NAME = 'Respect task dependencies when sorting';
const RESPECT_DEPENDENCIES_DESC = 'Place blocking tasks before the tasks that depend on them.';
const HIDE_BLOCKED_NAME = 'Hide blocked tasks';
const HIDE_BLOCKED_DESC = 'Hide tasks that have at least one unfinished dependency.';
const OPEN_SOURCE_NAME = 'Open note from task card';
const OPEN_SOURCE_DESC =
  "Click the 📁 note name on a task card to open that note — or switch to it if it's already open. Off = the note name isn't clickable.";
const STYLE_IN_PROGRESS_NAME = 'Show in-progress checkboxes as 🔄';
const STYLE_IN_PROGRESS_DESC =
  'Draw `- [/]` tasks across Obsidian (notes, Live Preview, Tasks queries) as a purple 🔄 without strikethrough, instead of a ticked box. Turn off if your theme already styles alternate checkboxes.';

const RESET_NAME = 'Reset to defaults';
const RESET_DESC =
  'Clears overrides — daily folder falls back to the core config, excluded folders are emptied.';
const RESET_GRAPH_NAME = 'Reset graph positions';
const RESET_GRAPH_DESC = 'Forget every manually placed card in the dependency graph.';
const RESET_GRAPH_QUESTION = 'Reset every manually placed graph card?';

export class MatrixSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: EisenhowerMatrixPlugin,
  ) {
    super(app, plugin);
  }

  // ==========================================================================
  // Deklarativní API (Obsidian 1.13+). Když vrátí neprázdné pole, `display()`
  // se vůbec nevolá — a nastavení se objeví i v globálním vyhledávání
  // v Settings.
  // ==========================================================================

  getSettingDefinitions(): SettingDefinitionItem[] {
    const coreFolder = getDailyNotesFolder(this.app, '');
    const coreLabel = coreFolder ? `\`${coreFolder}\`` : '(vault root)';
    const excluded = this.plugin.settings.excludedFolders;

    const definitions: SettingDefinitionItem[] = [
      {
        name: DAILY_FOLDER_NAME,
        desc: dailyFolderDesc(coreLabel),
        control: {
          type: 'folder',
          key: 'dailyFolderOverride',
          placeholder: DAILY_FOLDER_PLACEHOLDER,
        },
      },
      {
        name: DAILY_HEADING_NAME,
        desc: DAILY_HEADING_DESC,
        control: {
          type: 'text',
          key: 'dailySectionHeading',
          placeholder: DEFAULT_DAILY_HEADING,
        },
      },
      {
        name: WARN_BLOCKED_NAME,
        desc: WARN_BLOCKED_DESC,
        control: { type: 'toggle', key: 'warnWhenCompletingBlockedTask' },
      },
      {
        name: RESPECT_DEPENDENCIES_NAME,
        desc: RESPECT_DEPENDENCIES_DESC,
        control: { type: 'toggle', key: 'respectTaskDependenciesWhenSorting' },
      },
      {
        name: HIDE_BLOCKED_NAME,
        desc: HIDE_BLOCKED_DESC,
        control: { type: 'toggle', key: 'hideBlockedTasks' },
      },
      {
        name: OPEN_SOURCE_NAME,
        desc: OPEN_SOURCE_DESC,
        control: { type: 'toggle', key: 'openSourceOnClick' },
      },
      {
        name: STYLE_IN_PROGRESS_NAME,
        desc: STYLE_IN_PROGRESS_DESC,
        control: { type: 'toggle', key: 'styleInProgressCheckboxes' },
      },
      {
        type: 'list',
        heading: EXCLUDED_NAME,
        emptyState: `${EXCLUDED_DESC} None excluded yet.`,
        items: excluded.map((folder) => ({ name: folder, aliases: [EXCLUDED_NAME] })),
        onDelete: (index) => {
          const folder = excluded[index];
          if (folder === undefined) return;
          void this.removeExcludedFolder(folder, index).then(() => this.refreshDefinitions());
        },
        addItem: {
          name: 'Exclude a folder',
          action: () => {
            new ExcludeFolderModal(this.app, this.plugin.settings.excludedFolders, (path) => {
              void this.addExcludedFolder(path).then(() => this.refreshDefinitions());
            }).open();
          },
        },
      },
      {
        name: RESET_GRAPH_NAME,
        desc: RESET_GRAPH_DESC,
        render: (setting: Setting) => setting.addButton((btn) => {
          btn.setButtonText('Reset').onClick(() => {
            new ConfirmModal(this.app, RESET_GRAPH_QUESTION, 'Reset', (confirmed) => {
              if (confirmed) void this.resetGraphPositions().then(() => this.refreshDefinitions());
            }).open();
          });
          if (requireApiVersion('1.13.0')) btn.setDestructive();
        }),
      },
      {
        name: RESET_NAME,
        desc: RESET_DESC,
        render: (setting: Setting) => {
          setting.addButton((btn) => {
            btn.setButtonText('Reset').onClick(() => {
              void this.resetOverrides().then(() => this.refreshDefinitions());
            });
            // `setDestructive()` je 1.13+; sem se dostaneme jen na 1.13+, ale statická
            // kontrola to neví — guard drží nižší `minAppVersion` bez nálezu.
            // Bez `else`: nedosažitelná větev by přidala deprecated `setWarning()` navíc.
            if (requireApiVersion('1.13.0')) btn.setDestructive();
          });
        },
      },
    ];
    // Quadrant assignment right after the daily-note settings.
    definitions.splice(2, 0, ...this.quadrantDefinitions());
    return definitions;
  }

  private quadrantDefinitions(): SettingDefinitionItem[] {
    const isRules = () => this.plugin.settings.quadrantMode === 'rules';
    const items: SettingDefinitionItem[] = [
      {
        name: QUADRANT_MODE_NAME,
        desc: QUADRANT_MODE_DESC,
        control: { type: 'dropdown', key: 'quadrantMode', options: QUADRANT_MODE_OPTIONS },
      },
    ];
    for (const q of RULE_QUADRANTS) {
      items.push({
        type: 'group',
        heading: `${q} rule`,
        visible: isRules,
        items: [
          { name: 'Enabled', render: (setting: Setting) => { this.renderRuleEnabled(setting, q); } },
          { name: 'Priority', render: (setting: Setting) => { this.renderRulePriority(setting, q); } },
          { name: 'Due date', desc: RULE_DUE_DESC, render: (setting: Setting) => { this.renderRuleDue(setting, q); } },
        ],
      });
    }
    items.push({
      name: RESET_RULES_NAME,
      desc: RESET_RULES_DESC,
      visible: isRules,
      render: (setting: Setting) => {
        setting.addButton((btn) =>
          btn.setButtonText('Reset rules').onClick(() => {
            void this.resetQuadrantRules().then(() => this.refreshDefinitions());
          }),
        );
      },
    });
    return items;
  }

  // ==========================================================================
  // Quadrant rule rows — shared by the declarative and fallback UIs.
  // ==========================================================================

  private async setQuadrantMode(value: string): Promise<void> {
    if (value !== 'tags' && value !== 'rules') return;
    await this.mutate(() => {
      this.plugin.settings.quadrantMode = value;
    });
  }

  private async resetQuadrantRules(): Promise<void> {
    await this.mutate(() => {
      this.plugin.settings.quadrantRules = DEFAULT_SETTINGS.quadrantRules;
    });
  }

  private rule(q: RuleQuadrant): QuadrantRule {
    return this.plugin.settings.quadrantRules[q];
  }

  private async updateRule(q: RuleQuadrant, patch: Partial<QuadrantRule>): Promise<void> {
    await this.mutate(() => {
      const rules = this.plugin.settings.quadrantRules;
      this.plugin.settings.quadrantRules = { ...rules, [q]: { ...rules[q], ...patch } };
    });
  }

  private renderRuleEnabled(setting: Setting, q: RuleQuadrant): void {
    setting.addToggle((toggle) =>
      toggle.setValue(this.rule(q).enabled).onChange(async (enabled) => {
        await this.updateRule(q, { enabled });
      }),
    );
  }

  private renderRulePriority(setting: Setting, q: RuleQuadrant): void {
    let levelDropdown: { setDisabled: (d: boolean) => unknown } | null = null;
    setting.addDropdown((dropdown) =>
      dropdown
        .addOptions(PRIORITY_OP_OPTIONS)
        .setValue(this.rule(q).priorityOp)
        .onChange(async (value) => {
          levelDropdown?.setDisabled(value === 'any');
          await this.updateRule(q, { priorityOp: value as PriorityOp });
        }),
    );
    setting.addDropdown((dropdown) => {
      levelDropdown = dropdown;
      const options = Object.fromEntries(PRIORITY_LEVELS.map((l) => [l, PRIORITY_LEVEL_LABELS[l]]));
      dropdown
        .addOptions(options)
        .setValue(this.rule(q).priority)
        .setDisabled(this.rule(q).priorityOp === 'any')
        .onChange(async (value) => {
          await this.updateRule(q, { priority: value as PriorityLevel });
        });
    });
  }

  private renderRuleDue(setting: Setting, q: RuleQuadrant): void {
    const buckets = [
      ['dueOverdue', 'Overdue'],
      ['dueWithin', 'Within N days'],
      ['dueBeyond', 'Beyond N days'],
      ['dueNone', 'No due date'],
    ] as const;
    const wrap = setting.controlEl.createDiv({ cls: 'em-rule-due' });
    for (const [key, label] of buckets) {
      const labelEl = wrap.createEl('label', { cls: 'em-rule-due-option' });
      const box = labelEl.createEl('input', { type: 'checkbox' });
      box.checked = this.rule(q)[key];
      box.addEventListener('change', () => {
        void this.updateRule(q, { [key]: box.checked });
      });
      labelEl.appendText(label);
    }
    const nLabel = wrap.createEl('label', { cls: 'em-rule-due-option', text: 'N =' });
    const n = nLabel.createEl('input', { type: 'number', cls: 'em-rule-due-days' });
    n.min = '0';
    n.value = String(this.rule(q).dueDays);
    n.addEventListener('change', () => {
      const days = Math.floor(Number(n.value));
      if (!Number.isFinite(days) || days < 0) {
        n.value = String(this.rule(q).dueDays);
        return;
      }
      void this.updateRule(q, { dueDays: days });
    });
  }

  /**
   * Překreslení deklarativní karty. Volá se jen z definic, které konzumuje
   * Obsidian 1.13+, takže guard je pojistka — a hlavně to jediné, čím se dá
   * statické kontrole doložit, že se `update()` (1.13+) nezavolá na 1.8.0.
   */
  private refreshDefinitions(): void {
    if (requireApiVersion('1.13.0')) this.update();
  }

  /** Čtení hodnoty pro deklarativní `control` — protějšek `setControlValue`. */
  getControlValue(key: string): unknown {
    switch (key) {
      case 'dailyFolderOverride':
        return this.plugin.settings.dailyFolderOverride;
      case 'dailySectionHeading':
        return this.plugin.settings.dailySectionHeading;
      case 'quadrantMode':
        return this.plugin.settings.quadrantMode;
      case 'warnWhenCompletingBlockedTask':
        return this.plugin.settings.warnWhenCompletingBlockedTask;
      case 'respectTaskDependenciesWhenSorting':
        return this.plugin.settings.respectTaskDependenciesWhenSorting;
      case 'hideBlockedTasks':
        return this.plugin.settings.hideBlockedTasks;
      case 'openSourceOnClick':
        return this.plugin.settings.openSourceOnClick;
      case 'styleInProgressCheckboxes':
        return this.plugin.settings.styleInProgressCheckboxes;
      default:
        return undefined;
    }
  }

  /**
   * Zápis hodnoty z deklarativního `control`. Default implementace v
   * `PluginSettingTab` sice do `plugin.settings` zapíše, ale neví o
   * `notifyRepoConfigChanged()` — bez něj by otevřené view drželo starou
   * konfiguraci až do restartu.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case 'dailyFolderOverride':
        if (typeof value !== 'string') return;
        await this.setDailyFolderOverride(value);
        break;
      case 'dailySectionHeading':
        if (typeof value !== 'string') return;
        await this.setDailySectionHeading(value);
        break;
      case 'quadrantMode':
        if (typeof value !== 'string') return;
        await this.setQuadrantMode(value);
        this.refreshDefinitions();
        break;
      case 'warnWhenCompletingBlockedTask':
      case 'respectTaskDependenciesWhenSorting':
      case 'hideBlockedTasks':
      case 'openSourceOnClick':
      case 'styleInProgressCheckboxes':
        if (typeof value !== 'boolean') return;
        await this.setBooleanSetting(key, value);
        break;
      default:
        break;
    }
  }

  // ==========================================================================
  // Mutace stavu — sdílené oběma větvím. Překreslení si řeší každá větev sama
  // (`update()` deklarativně, `display()` ve fallbacku), protože `update()`
  // na Obsidianu < 1.13 neexistuje.
  // ==========================================================================

  /** Serializuje zápisy — dvojklik nesmí poslat na disk dva soubory najednou. */
  private saveQueue: Promise<void> = Promise.resolve();

  /**
   * Provede změnu nastavení, uloží ji a dá vědět otevřenému view. Běží až po
   * doběhnutí předchozí mutace; když zápis na disk selže, vrátí pole, která
   * tenhle tab vlastní, zpátky — jinak by UI ukazovalo hodnotu, která po
   * restartu zmizí.
   */
  private mutate(change: () => void): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      // Pole se vždy nahrazují novou instancí, takže stačí mělký snímek.
      const before = {
        dailyFolderOverride: this.plugin.settings.dailyFolderOverride,
        dailySectionHeading: this.plugin.settings.dailySectionHeading,
        excludedFolders: this.plugin.settings.excludedFolders,
        quadrantMode: this.plugin.settings.quadrantMode,
        quadrantRules: this.plugin.settings.quadrantRules,
        warnWhenCompletingBlockedTask: this.plugin.settings.warnWhenCompletingBlockedTask,
        respectTaskDependenciesWhenSorting: this.plugin.settings.respectTaskDependenciesWhenSorting,
        hideBlockedTasks: this.plugin.settings.hideBlockedTasks,
        openSourceOnClick: this.plugin.settings.openSourceOnClick,
        styleInProgressCheckboxes: this.plugin.settings.styleInProgressCheckboxes,
        graphPositions: this.plugin.settings.graphPositions,
      };
      try {
        change();
        await this.plugin.saveSettings();
      } catch (err) {
        Object.assign(this.plugin.settings, before);
        console.error('[4D Matrix] saving settings failed', err);
        showError('Could not save settings — the change was reverted.');
        return false;
      }

      try {
        this.plugin.notifyRepoConfigChanged();
      } catch (err) {
        // Uloženo je — spadlý listener nesmí shodit frontu ani vrátit stav zpět.
        console.error('[4D Matrix] repo config listener failed', err);
      }
      return true;
    };

    const result = this.saveQueue.then(run);
    // Fronta nesmí uváznout na odmítnutém promisu.
    this.saveQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async setDailyFolderOverride(value: string): Promise<void> {
    const trimmed = value.trim();
    await this.mutate(() => {
      this.plugin.settings.dailyFolderOverride = trimmed;
    });
  }

  private async setDailySectionHeading(value: string): Promise<void> {
    const trimmed = value.trim();
    await this.mutate(() => {
      // Fallback to default if the user clears it.
      this.plugin.settings.dailySectionHeading = trimmed || DEFAULT_DAILY_HEADING;
    });
  }

  private async setBooleanSetting(
    key:
      | 'warnWhenCompletingBlockedTask'
      | 'respectTaskDependenciesWhenSorting'
      | 'hideBlockedTasks'
      | 'openSourceOnClick'
      | 'styleInProgressCheckboxes',
    value: boolean,
  ): Promise<void> {
    await this.mutate(() => {
      this.plugin.settings[key] = value;
    });
  }

  private async addExcludedFolder(path: string): Promise<'added' | 'duplicate' | 'failed'> {
    const value = path.trim();
    if (!value) return 'failed';
    const existing = this.plugin.settings.excludedFolders;
    if (existing.some((f) => f.toLowerCase() === value.toLowerCase())) return 'duplicate';

    let duplicate = false;
    const saved = await this.mutate(() => {
      // Znovu proti čerstvému stavu — mezi kontrolou výš a frontou mohla projít jiná mutace.
      const current = this.plugin.settings.excludedFolders;
      if (current.some((f) => f.toLowerCase() === value.toLowerCase())) {
        duplicate = true;
        return;
      }
      this.plugin.settings.excludedFolders = [...current, value];
    });
    if (duplicate) return 'duplicate';
    return saved ? 'added' : 'failed';
  }

  /** Maže podle indexu (ne podle hodnoty), aby ruční duplicita v `data.json` nezmizela celá. */
  /**
   * Maže položku, na kterou uživatel klikl — index je jen z renderu, takže se
   * ověřuje proti hodnotě; fronta mohla mezitím indexy posunout. Podle indexu
   * (ne podle hodnoty) proto, aby ruční duplicita v `data.json` nezmizela celá.
   */
  private async removeExcludedFolder(folder: string, index: number): Promise<void> {
    await this.mutate(() => {
      const folders = this.plugin.settings.excludedFolders;
      const at = folders[index] === folder ? index : folders.indexOf(folder);
      if (at < 0) return;
      this.plugin.settings.excludedFolders = folders.filter((_, i) => i !== at);
    });
  }

  private async resetOverrides(): Promise<void> {
    await this.mutate(() => {
      this.plugin.settings.dailyFolderOverride = '';
      this.plugin.settings.excludedFolders = [];
      this.plugin.settings.warnWhenCompletingBlockedTask = DEFAULT_SETTINGS.warnWhenCompletingBlockedTask;
      this.plugin.settings.respectTaskDependenciesWhenSorting = DEFAULT_SETTINGS.respectTaskDependenciesWhenSorting;
      this.plugin.settings.hideBlockedTasks = DEFAULT_SETTINGS.hideBlockedTasks;
      this.plugin.settings.openSourceOnClick = DEFAULT_SETTINGS.openSourceOnClick;
      this.plugin.settings.styleInProgressCheckboxes = DEFAULT_SETTINGS.styleInProgressCheckboxes;
    });
  }

  private async resetGraphPositions(): Promise<void> {
    await this.mutate(() => { this.plugin.settings.graphPositions = {}; });
  }

  // ==========================================================================
  // Imperativní fallback pro Obsidian < 1.13, kde `getSettingDefinitions()`
  // neexistuje. Na 1.13+ se tahle větev nevolá. Smazat, až `minAppVersion`
  // v manifestu vyskočí na 1.13.0.
  // ==========================================================================

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // No plugin-name heading — Obsidian renders it itself.

    // === Daily folder override ===
    const coreFolder = getDailyNotesFolder(this.app, '');
    const coreLabel = coreFolder ? `\`${coreFolder}\`` : '(vault root)';

    new Setting(containerEl)
      .setName(DAILY_FOLDER_NAME)
      .setDesc(dailyFolderDesc(coreLabel))
      .addText((text) => {
        text
          .setPlaceholder(DAILY_FOLDER_PLACEHOLDER)
          .setValue(this.plugin.settings.dailyFolderOverride)
          .onChange(async (value) => {
            await this.setDailyFolderOverride(value);
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // === Daily section heading ===
    new Setting(containerEl)
      .setName(DAILY_HEADING_NAME)
      .setDesc(DAILY_HEADING_DESC)
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_DAILY_HEADING)
          .setValue(this.plugin.settings.dailySectionHeading)
          .onChange(async (value) => {
            await this.setDailySectionHeading(value);
          }),
      );

    this.renderQuadrantSection(containerEl);

    this.renderDependencyToggles(containerEl);

    // === Excluded folders ===
    this.renderExcludedFoldersSection(containerEl);

    new Setting(containerEl).setName(RESET_GRAPH_NAME).setDesc(RESET_GRAPH_DESC).addButton((btn) => btn.setButtonText('Reset').setWarning().onClick(() => {
      new ConfirmModal(this.app, RESET_GRAPH_QUESTION, 'Reset', (confirmed) => {
        if (confirmed) void this.resetGraphPositions().then(() => this.display());
      }).open();
    }));

    // === Reset ===
    new Setting(containerEl)
      .setName(RESET_NAME)
      .setDesc(RESET_DESC)
      .addButton((btn) =>
        btn
          .setButtonText('Reset')
          // `setDestructive()` je až od 1.13.0 — tahle větev běží na starších verzích.
          .setWarning()
          .onClick(async () => {
            await this.resetOverrides();
            this.display();
          }),
      );
  }

  private renderQuadrantSection(parent: HTMLElement): void {
    new Setting(parent)
      .setName(QUADRANT_MODE_NAME)
      .setDesc(QUADRANT_MODE_DESC)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(QUADRANT_MODE_OPTIONS)
          .setValue(this.plugin.settings.quadrantMode)
          .onChange(async (value) => {
            await this.setQuadrantMode(value);
            this.display();
          }),
      );
    if (this.plugin.settings.quadrantMode !== 'rules') return;
    for (const q of RULE_QUADRANTS) {
      new Setting(parent).setName(`${q} rule`).setHeading();
      this.renderRuleEnabled(new Setting(parent).setName('Enabled'), q);
      this.renderRulePriority(new Setting(parent).setName('Priority'), q);
      this.renderRuleDue(new Setting(parent).setName('Due date').setDesc(RULE_DUE_DESC), q);
    }
    new Setting(parent)
      .setName(RESET_RULES_NAME)
      .setDesc(RESET_RULES_DESC)
      .addButton((btn) =>
        btn.setButtonText('Reset rules').onClick(async () => {
          await this.resetQuadrantRules();
          this.display();
        }),
      );
  }

  private renderDependencyToggles(parent: HTMLElement): void {
    const toggles = [
      [WARN_BLOCKED_NAME, WARN_BLOCKED_DESC, 'warnWhenCompletingBlockedTask'],
      [RESPECT_DEPENDENCIES_NAME, RESPECT_DEPENDENCIES_DESC, 'respectTaskDependenciesWhenSorting'],
      [HIDE_BLOCKED_NAME, HIDE_BLOCKED_DESC, 'hideBlockedTasks'],
      [OPEN_SOURCE_NAME, OPEN_SOURCE_DESC, 'openSourceOnClick'],
      [STYLE_IN_PROGRESS_NAME, STYLE_IN_PROGRESS_DESC, 'styleInProgressCheckboxes'],
    ] as const;

    for (const [name, desc, key] of toggles) {
      new Setting(parent).setName(name).setDesc(desc).addToggle((toggle) =>
        toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
          await this.setBooleanSetting(key, value);
        }),
      );
    }
  }

  /**
   * Excluded folders — list of rows with × + an add input with a folder
   * suggester. Mirrors the native Obsidian "Excluded files" dialog.
   */
  private renderExcludedFoldersSection(parent: HTMLElement): void {
    new Setting(parent).setName(EXCLUDED_NAME).setHeading();

    const section = parent.createDiv({ cls: 'em-settings-excluded' });

    section.createEl('p', {
      text: `${EXCLUDED_DESC} Click × to remove, or add a new folder below.`,
      cls: 'setting-item-description',
    });

    const list = section.createDiv({ cls: 'em-excluded-list' });

    const folders = this.plugin.settings.excludedFolders;
    if (folders.length === 0) {
      list.createDiv({
        cls: 'em-excluded-empty',
        text: 'No excluded folders.',
      });
    } else {
      folders.forEach((folder, index) => {
        const row = list.createDiv({ cls: 'em-excluded-row' });
        row.createSpan({ text: folder, cls: 'em-excluded-path' });
        const removeBtn = row.createEl('button', {
          cls: 'em-excluded-remove',
          attr: { 'aria-label': `Remove ${folder}` },
          text: '×',
        });
        const removeFolder = async () => {
          await this.removeExcludedFolder(folder, index);
          this.display();
        };
        removeBtn.addEventListener('click', () => void removeFolder());
      });
    }

    // Add row
    const addRow = section.createDiv({ cls: 'em-excluded-add' });
    const addInput = addRow.createEl('input', {
      type: 'text',
      cls: 'em-excluded-input',
      attr: { placeholder: 'Add a folder…' },
    });
    new FolderSuggest(this.app, addInput);

    const addBtn = addRow.createEl('button', {
      cls: 'mod-cta em-excluded-add-btn',
      text: 'Add',
    });

    const tryAdd = async () => {
      const value = addInput.value.trim();
      if (!value) return;
      // Při selhání zápisu necháváme text v inputu, ať uživatel nepřijde o cestu.
      const result = await this.addExcludedFolder(value);
      if (result === 'failed') return;
      addInput.value = '';
      this.display();
    };

    addBtn.addEventListener('click', () => void tryAdd());
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void tryAdd();
      }
    });
  }
}
