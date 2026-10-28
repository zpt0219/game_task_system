import { Command } from '../command/command';
import { CommandHandler } from '../command/commandHandler';
import { TaskStudioEvents } from '../command/events';
import { TaskDocument } from '../core/document';
import { EditorSession, StateChangeMeta } from '../core/session';
import { WorldState } from '../core/types';
import { EditorContext } from './editorContext';
import { StudioPrompts } from './ports';

export interface StudioContext {
  readonly doc: TaskDocument;
  readonly session: EditorSession;
  readonly context: EditorContext;
  readonly handler: CommandHandler;
  readonly prompts: StudioPrompts;
  readonly events: TaskStudioEvents;
  execute(cmd: Command): boolean;
  patchSession(patch: Partial<EditorSession>): void;
  updateWorldState(nextState: WorldState, meta?: StateChangeMeta): void;
  log(message: string, isHighlight?: boolean): void;
}
