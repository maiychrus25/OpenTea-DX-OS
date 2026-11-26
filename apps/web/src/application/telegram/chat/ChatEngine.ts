// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomBytes } from 'node:crypto'
import { DomainError } from '@/domain/errors'
import { signCallbackDataV2 } from '@/domain/telegram/callback-data'
import type { TelegramConversation, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import { TELEGRAM_BUTTON, TELEGRAM_TEXT } from '../messages'
import type { OutboxReply, UpdateResponse } from '../TelegramUpdateHandler'
import { menuKeyboard, MENU_LABEL, type MenuKey } from './menu'
import { normalizeText } from './normalize'
import { commandOf, routeText } from './router'
import type {
  ActionName,
  ArgHint,
  Choice,
  ChatAction,
  ChatTool,
  ChatUser,
  Intent,
  PhotoStore,
  ToolName,
} from './types'

export const FLOW_TTL_MS = 30 * 60 * 1000
export const CARD_TTL_MS = 10 * 60 * 1000
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const CHOICE_BUTTON_LIMIT = 8
export const TOOL_LINE_MAX = 7
export const NO_DATA_VI = 'Chưa có dữ liệu.'
const SYSTEM_FAILURE_VI = 'Có lỗi hệ thống. Vui lòng thử lại sau.'
/** Shown instead of the step prompt when a choice list is too long for buttons (contract C6, parcel steps). */
const TYPED_CHOICE_PROMPT_VI = 'Nhập mã thửa, ví dụ TC-A1:'
const NOT_YET_COMMANDS: readonly string[] = ['/chiendich', '/tuvanhanh', '/dung']
const COMMAND_TOOL: Record<string, ToolName> = { '/tomtat': 'today', '/cho': 'pending' }
const COMMAND_ACTION: Record<string, ActionName> = { '/nhatky': 'journal.create', '/benh': 'disease.report' }
const MENU_KEYS = Object.keys(MENU_LABEL) as MenuKey[]

/** Keys of a flow state that are the engine's own bookkeeping, never answers (the payload is built without them). */
const CHOICES_KEY = '__choices'
const CARD_FIRST = -1
const CARD_SECOND = -2

type Buttons = { text: string; callback_data: string }[][]
type Meta = Record<string, unknown>

/** The conversation calls the engine makes; the handler passes the Prisma repository. */
export type ConversationStore = Pick<TelegramRepository, 'conversationOf' | 'setFlow' | 'deleteConversation' | 'auditEvent'>

/** Starts a request for the assistant; false when the cooperative's agent is offline or the text is too long. */
export interface AssistantSubmitter {
  submit(user: ChatUser, text: string, now: Date): Promise<boolean>
}

export interface ProposalMessage {
  text: string
  buttons: Buttons
}

export interface ChatEngineDeps {
  repo: ConversationStore
  tools: readonly ChatTool[]
  actions: readonly ChatAction[]
  photos: PhotoStore
  requests: AssistantSubmitter
  callbackKey: string
  /** Approver messages of open proposals, for the tool `pending` (built the way the notifier builds them). */
  proposalMessages: (htxCode: string, proposalIds: string[]) => Promise<ProposalMessage[]>
}

export interface CallbackPress {
  telegramUserId: string
  /** The step token from the button (or `menu`). */
  c: string
  /** The button step. */
  s: string
  chatId: number
  messageId: number
}

export type IncomingPhoto =
  | { kind: 'image'; bytes: Buffer; mimeType: 'image/jpeg' }
  | { kind: 'error'; reason: 'too_large' | 'download_failed' }

const send = (chatId: number, text: string, buttons?: Buttons): OutboxReply =>
  buttons ? { op: 'send', chat_id: chatId, text, buttons } : { op: 'send', chat_id: chatId, text }

const edit = (chatId: number, messageId: number, text: string, buttons?: Buttons): OutboxReply =>
  buttons
    ? { op: 'edit', chat_id: chatId, edit_message_id: messageId, text, buttons }
    : { op: 'edit', chat_id: chatId, edit_message_id: messageId, text }

const only = (replies: OutboxReply[]): UpdateResponse => ({ replies })

const callbackOnly = (replies: OutboxReply[], answer = '', alert = false): UpdateResponse => ({
  replies,
  answer_callback: { text: answer, show_alert: alert },
})

const newToken = (): string => randomBytes(8).toString('base64url')
const expired = (row: TelegramConversation, now: Date): boolean => row.expiresAt.getTime() <= now.getTime()
const withoutMeta = (state: Meta): Meta => Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith('__')))
/** The action's payload: no meta keys, and a skipped step (stored as null so it is not asked again) left out. */
const payloadOf = (state: Meta): Meta =>
  Object.fromEntries(Object.entries(state).filter(([key, value]) => !key.startsWith('__') && value !== null))

const rowsOfTwo = <T>(items: T[]): T[][] => {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

/** Keeps only the hinted arguments whose type fits; anything else A7 sent is dropped (contract C6). */
export function sanitizeArgs(hints: readonly ArgHint[], args: Record<string, unknown>): Meta {
  const out: Meta = {}
  for (const hint of hints) {
    const value = args[hint.name]
    if (hint.type === 'string' && typeof value === 'string' && value.length <= 1000) out[hint.name] = value.trim()
    else if (hint.type === 'integer' && Number.isInteger(value)) out[hint.name] = value
    else if (hint.type === 'number' && typeof value === 'number' && Number.isFinite(value)) out[hint.name] = value
    else if (hint.type === 'enum' && typeof value === 'string' && hint.values?.includes(value)) out[hint.name] = value
  }
  return out
}

/**
 * The conversation of one linked Telegram user: menu, commands, routed sentences, flows that end in a card, and the
 * assistant hand-off. The web decides every step; tools and actions are injected and never see Telegram.
 */
export class ChatEngine {
  constructor(private readonly deps: ChatEngineDeps) {}

  async menu(user: ChatUser): Promise<UpdateResponse> {
    await this.deps.repo.deleteConversation(user.telegramUserId)
    return only([send(user.chatId, TELEGRAM_TEXT.menuPrompt, menuKeyboard(user.tenant.role, this.deps.callbackKey))])
  }

  /** A private text message from a linked user, after the M2 reject reason has had its turn in the handler. */
  async onText(user: ChatUser, rawText: string, now: Date): Promise<UpdateResponse> {
    const text = rawText.trim()
    const command = commandOf(text)
    const open = await this.deps.repo.conversationOf(user.telegramUserId)
    if (open?.kind === 'flow') {
      if (command) {
        // A command replaces the flow it interrupts.
        await this.deps.repo.deleteConversation(user.telegramUserId)
      } else if (expired(open, now)) {
        await this.deps.repo.deleteConversation(user.telegramUserId)
        return only([send(user.chatId, TELEGRAM_TEXT.flowExpired)])
      } else {
        return this.textInFlow(user, open, text, now)
      }
    }

    if (command) return this.command(user, command, text, now)
    const route = routeText(text)
    if (route?.kind === 'tool') return this.runTool(user, route.name, {}, now)
    if (route?.kind === 'action') return this.startAction(user, route.name, {}, now)
    return this.askAssistant(user, text, now)
  }

  async onPhoto(user: ChatUser, photo: IncomingPhoto, now: Date): Promise<UpdateResponse> {
    const chat = user.chatId
    const open = await this.deps.repo.conversationOf(user.telegramUserId)
    if (open?.kind !== 'flow' || open.flow === null) return only([send(chat, TELEGRAM_TEXT.photoOutsideFlow)])
    if (expired(open, now)) {
      await this.deps.repo.deleteConversation(user.telegramUserId)
      return only([send(chat, TELEGRAM_TEXT.flowExpired)])
    }
    if (open.flow === 'ask') return only([send(chat, TELEGRAM_TEXT.expectText)])
    const action = this.actionNamed(open.flow)
    if (!action || open.step === null) {
      await this.deps.repo.deleteConversation(user.telegramUserId)
      return only([send(chat, TELEGRAM_TEXT.flowExpired)])
    }
    if (open.step < 0) return only([send(chat, TELEGRAM_TEXT.expectChoice)])

    const step = action.steps[open.step]
    if (step.kind !== 'photo') {
      return only([send(chat, step.kind === 'choice' ? TELEGRAM_TEXT.expectChoice : TELEGRAM_TEXT.expectText)])
    }
    if (photo.kind === 'error') {
      return only([send(chat, photo.reason === 'too_large' ? TELEGRAM_TEXT.photoTooLarge : TELEGRAM_TEXT.photoFailed)])
    }
    if (photo.bytes.length > PHOTO_MAX_BYTES) return only([send(chat, TELEGRAM_TEXT.photoTooLarge)])

    const key = step.photoKey(user)
    await this.deps.photos.put(key, photo.bytes, photo.mimeType)
    return this.advance(user, action, { ...open.state, [step.slot]: key }, open.step + 1, now)
  }

  onLocation(user: ChatUser, latitude: number, longitude: number, now: Date): Promise<UpdateResponse> {
    return this.runTool(user, 'nearby', { latitude, longitude }, now)
  }

  /**
   * A button press. `user` is the live read of the presser (null when the link no longer grants a role); the token
   * must be the one the presser's conversation holds now, otherwise the button is stale.
   */
  async onCallback(user: ChatUser | null, press: CallbackPress, now: Date): Promise<UpdateResponse> {
    const chat = press.chatId
    if (press.c === 'menu') {
      if (!user) return callbackOnly([], TELEGRAM_TEXT.noPermission('Trợ lý Telegram'), true)
      return this.menuPress(user, press, now)
    }

    const row = await this.deps.repo.conversationOf(press.telegramUserId)
    if (!row || row.kind !== 'flow' || row.token !== press.c) return callbackOnly([], TELEGRAM_TEXT.staleButton, true)
    const action = this.actionNamed(row.flow)
    if (!action) return callbackOnly([], TELEGRAM_TEXT.staleButton, true)
    if (!user || !action.roles.includes(user.tenant.role)) {
      return callbackOnly([], TELEGRAM_TEXT.noPermission(action.titleVi), true)
    }

    const isCard = row.step !== null && row.step < 0
    if (expired(row, now)) {
      await this.deps.repo.deleteConversation(press.telegramUserId)
      const text = isCard ? TELEGRAM_TEXT.cardExpired : TELEGRAM_TEXT.flowExpired
      return callbackOnly([edit(chat, press.messageId, text)], text, true)
    }
    if (press.s === 'cancel') {
      await this.deps.repo.deleteConversation(press.telegramUserId)
      return callbackOnly([edit(chat, press.messageId, TELEGRAM_TEXT.flowCancelled)])
    }
    if (isCard) return this.cardPress(user, row, action, press, now)
    return this.stepPress(user, row, action, press, now)
  }

  /** Runs an intent the assistant returned (contract C7). The caller sends the replies through the outbox. */
  async applyIntent(user: ChatUser, intent: Intent, now: Date): Promise<OutboxReply[]> {
    if (intent.type === 'tool') {
      const tool = this.toolNamed(intent.name)
      if (!tool) return [this.notUnderstood(user)]
      return (await this.runTool(user, tool.name, sanitizeArgs(tool.args, intent.args), now)).replies
    }
    if (intent.type === 'action') {
      const action = this.actionNamed(intent.name)
      if (!action) return [this.notUnderstood(user)]
      return (await this.startAction(user, action.name, sanitizeArgs(action.args, intent.args), now)).replies
    }
    return [this.notUnderstood(user)]
  }

  private async command(user: ChatUser, command: string, text: string, now: Date): Promise<UpdateResponse> {
    if (command === '/menu') return this.menu(user)
    if (command === '/hoi') return this.startAsk(user, now)
    const tool = COMMAND_TOOL[command]
    if (tool) return this.runTool(user, tool, {}, now)
    const action = COMMAND_ACTION[command]
    if (action) return this.startAction(user, action, {}, now)
    if (NOT_YET_COMMANDS.includes(command)) return only([send(user.chatId, TELEGRAM_TEXT.notYet)])
    return this.askAssistant(user, text, now)
  }

  private async textInFlow(user: ChatUser, row: TelegramConversation, text: string, now: Date): Promise<UpdateResponse> {
    const chat = user.chatId
    if (row.flow === 'ask') {
      await this.deps.repo.deleteConversation(user.telegramUserId)
      return this.askAssistant(user, text, now)
    }
    const action = this.actionNamed(row.flow)
    if (!action || row.step === null) {
      await this.deps.repo.deleteConversation(user.telegramUserId)
      return only([send(chat, TELEGRAM_TEXT.flowExpired)])
    }
    if (row.step < 0) return only([send(chat, TELEGRAM_TEXT.expectChoice)])
    if (!action.roles.includes(user.tenant.role)) return only([send(chat, TELEGRAM_TEXT.noPermission(action.titleVi))])

    const step = action.steps[row.step]
    const state: Meta = { ...row.state }
    switch (step.kind) {
      case 'text':
        if (text.length > step.maxLength) return only([send(chat, TELEGRAM_TEXT.tooLong(step.maxLength))])
        state[step.slot] = text
        break
      case 'integer': {
        const value = /^-?\d+$/.test(text) ? Number(text) : NaN
        if (!(value >= step.min && value <= step.max)) {
          return only([send(chat, TELEGRAM_TEXT.invalidNumber(step.min, step.max))])
        }
        state[step.slot] = value
        break
      }
      case 'choice': {
        const choices = (row.state[CHOICES_KEY] as Choice[] | undefined) ?? []
        // Up to 8 choices are buttons only; a longer list is answered by typing a label.
        if (choices.length <= CHOICE_BUTTON_LIMIT) return only([send(chat, TELEGRAM_TEXT.expectChoice)])
        const wanted = normalizeText(text)
        const hit = choices.find((choice) => normalizeText(choice.label) === wanted)
        if (!hit) return only([send(chat, TELEGRAM_TEXT.noMatch)])
        state[step.slot] = hit.value
        break
      }
      case 'photo':
        return only([send(chat, TELEGRAM_TEXT.expectPhoto)])
    }
    return this.advance(user, action, state, row.step + 1, now)
  }

  private async stepPress(
    user: ChatUser,
    row: TelegramConversation,
    action: ChatAction,
    press: CallbackPress,
    now: Date
  ): Promise<UpdateResponse> {
    const step = action.steps[row.step!]
    const state: Meta = { ...row.state }
    if (press.s === 'skip' && step.kind === 'photo' && step.optional) {
      state[step.slot] = null
    } else {
      const index = /^o(\d+)$/.exec(press.s)
      const choices = (row.state[CHOICES_KEY] as Choice[] | undefined) ?? []
      const choice = index && step.kind === 'choice' ? choices[Number(index[1])] : undefined
      if (!choice) return callbackOnly([], TELEGRAM_TEXT.staleButton, true)
      state[step.slot] = choice.value
    }
    const next = await this.advance(user, action, state, row.step! + 1, now)
    return callbackOnly(next.replies)
  }

  private async cardPress(
    user: ChatUser,
    row: TelegramConversation,
    action: ChatAction,
    press: CallbackPress,
    now: Date
  ): Promise<UpdateResponse> {
    const chat = press.chatId
    if (press.s === 'next' && row.step === CARD_FIRST && action.risk === 'high') {
      // The second card of a high action gets its own token and its own 10 minutes.
      // The second card repeats the object (first preview line) so the final press names what it confirms.
      const payload = action.payloadSchema.safeParse(payloadOf(row.state))
      const preview = payload.success ? await action.preview(payload.data, user) : []
      const token = newToken()
      await this.deps.repo.setFlow({
        telegramUserId: press.telegramUserId,
        flow: action.name,
        step: CARD_SECOND,
        state: withoutMeta(row.state),
        token,
        cardMessageId: String(press.messageId),
        expiresAt: new Date(now.getTime() + CARD_TTL_MS),
      })
      const text = [
        TELEGRAM_TEXT.secondCardTitle,
        ...preview.slice(0, 1),
        action.consequenceVi ?? '',
        TELEGRAM_TEXT.secondCardFooter,
      ].join('\n')
      const buttons: Buttons = [[
        this.button(token, 'final', TELEGRAM_BUTTON.finalConfirm),
        this.button(token, 'cancel', TELEGRAM_BUTTON.cancel),
      ]]
      return callbackOnly([edit(chat, press.messageId, text, buttons)])
    }
    const confirmFirst = press.s === 'ok' && row.step === CARD_FIRST && action.risk !== 'high'
    const confirmSecond = press.s === 'final' && row.step === CARD_SECOND
    if (confirmFirst || confirmSecond) return this.confirm(user, row, action, press, now)
    return callbackOnly([], TELEGRAM_TEXT.staleButton, true)
  }

  /** Confirm: the card is used up before the action runs, so a repeated delivery of the press cannot run it twice. */
  private async confirm(
    user: ChatUser,
    row: TelegramConversation,
    action: ChatAction,
    press: CallbackPress,
    now: Date
  ): Promise<UpdateResponse> {
    const chat = press.chatId
    await this.deps.repo.deleteConversation(press.telegramUserId)
    const payload = action.payloadSchema.safeParse(payloadOf(row.state))
    if (!payload.success) {
      return callbackOnly([edit(chat, press.messageId, TELEGRAM_TEXT.executeFailed('Thiếu thông tin'))], '', true)
    }
    let line: string
    try {
      line = await action.execute(payload.data, user, { photos: this.deps.photos }, now)
    } catch (err) {
      const message = err instanceof DomainError ? err.message : SYSTEM_FAILURE_VI
      return callbackOnly([edit(chat, press.messageId, TELEGRAM_TEXT.executeFailed(message))], '', true)
    }
    await this.deps.repo.auditEvent(user.tenant.userId, 'telegram.action.executed', user.tenant.htxCode, {
      kind: action.name,
      htx_code: user.tenant.htxCode,
      channel: 'telegram',
    })
    return callbackOnly([edit(chat, press.messageId, line)])
  }

  private async menuPress(user: ChatUser, press: CallbackPress, now: Date): Promise<UpdateResponse> {
    if (!(MENU_KEYS as string[]).includes(press.s)) return callbackOnly([], TELEGRAM_TEXT.staleButton, true)
    await this.deps.repo.deleteConversation(press.telegramUserId)
    let result: UpdateResponse
    switch (press.s as MenuKey) {
      case 'today':
        result = await this.runTool(user, 'today', {}, now)
        break
      case 'pending':
        result = await this.runTool(user, 'pending', {}, now)
        break
      case 'journal':
        result = await this.startAction(user, 'journal.create', {}, now)
        break
      case 'disease':
        result = await this.startAction(user, 'disease.report', {}, now)
        break
      case 'ask':
        result = await this.startAsk(user, now)
        break
    }
    return callbackOnly(result.replies)
  }

  private async startAsk(user: ChatUser, now: Date): Promise<UpdateResponse> {
    await this.deps.repo.setFlow({
      telegramUserId: user.telegramUserId,
      flow: 'ask',
      step: null,
      state: {},
      token: null,
      cardMessageId: null,
      expiresAt: new Date(now.getTime() + FLOW_TTL_MS),
    })
    return only([send(user.chatId, TELEGRAM_TEXT.askPrompt)])
  }

  private async askAssistant(user: ChatUser, text: string, now: Date): Promise<UpdateResponse> {
    const accepted = await this.deps.requests.submit(user, text, now)
    if (!accepted) return only([this.notUnderstood(user)])
    return only([send(user.chatId, TELEGRAM_TEXT.thinking)])
  }

  private async runTool(user: ChatUser, name: ToolName, args: Meta, now: Date): Promise<UpdateResponse> {
    const chat = user.chatId
    const tool = this.toolNamed(name)
    if (!tool) return only([send(chat, TELEGRAM_TEXT.notYet)])
    if (!tool.roles.includes(user.tenant.role)) return only([send(chat, TELEGRAM_TEXT.noPermission(tool.titleVi))])

    const result = await tool.run(user, args, now)
    const body = result.lines.length ? result.lines.slice(0, TOOL_LINE_MAX) : [NO_DATA_VI]
    const replies: OutboxReply[] = [send(chat, [...body, `Nguồn: ${result.source}`].join('\n'))]
    if (result.proposalIds?.length) {
      const messages = await this.deps.proposalMessages(user.tenant.htxCode, result.proposalIds)
      for (const message of messages) replies.push(send(chat, message.text, message.buttons))
    }
    return only(replies)
  }

  private async startAction(user: ChatUser, name: ActionName, prefilled: Meta, now: Date): Promise<UpdateResponse> {
    const chat = user.chatId
    const action = this.actionNamed(name)
    if (!action) return only([send(chat, TELEGRAM_TEXT.notYet)])
    if (!action.roles.includes(user.tenant.role)) return only([send(chat, TELEGRAM_TEXT.noPermission(action.titleVi))])

    await this.deps.repo.deleteConversation(user.telegramUserId)
    const started = action.start ? await action.start(user, now) : { state: {} }
    if ('replyVi' in started) return only([send(chat, started.replyVi)])
    return this.promptFrom(user, action, started.state, 0, now, prefilled)
  }

  private advance(user: ChatUser, action: ChatAction, state: Meta, from: number, now: Date): Promise<UpdateResponse> {
    return this.promptFrom(user, action, state, from, now, {})
  }

  /**
   * Walks the steps from `from`: steps that do not apply are skipped, steps the intent prefilled with a valid value are
   * answered, and the first other step is prompted. Past the last step, the card is shown.
   */
  private async promptFrom(
    user: ChatUser,
    action: ChatAction,
    state: Meta,
    from: number,
    now: Date,
    prefilled: Meta
  ): Promise<UpdateResponse> {
    let index = from
    for (; index < action.steps.length; index++) {
      const step = action.steps[index]
      if (step.when && !step.when(withoutMeta(state))) continue
      if (step.slot in prefilled) {
        const value = await this.prefillValue(user, step, prefilled[step.slot], state)
        if (value !== undefined) {
          state[step.slot] = value
          continue
        }
      }
      break
    }
    if (index >= action.steps.length) return this.card(user, action, state, now)
    return this.prompt(user, action, index, state, now)
  }

  private async prompt(user: ChatUser, action: ChatAction, index: number, state: Meta, now: Date): Promise<UpdateResponse> {
    const step = action.steps[index]
    const token = newToken()
    const stored: Meta = withoutMeta(state)
    const rows: Buttons = []
    let promptVi = step.promptVi
    if (step.kind === 'choice') {
      const choices = await step.choices(user, withoutMeta(state))
      stored[CHOICES_KEY] = choices
      if (choices.length <= CHOICE_BUTTON_LIMIT) {
        rows.push(...rowsOfTwo(choices.map((choice, i) => this.button(token, `o${i}`, choice.label))))
      } else {
        promptVi = TYPED_CHOICE_PROMPT_VI
      }
    }
    if (step.kind === 'photo' && step.optional) rows.push([this.button(token, 'skip', TELEGRAM_BUTTON.skip)])
    rows.push([this.button(token, 'cancel', TELEGRAM_BUTTON.cancel)])

    await this.deps.repo.setFlow({
      telegramUserId: user.telegramUserId,
      flow: action.name,
      step: index,
      state: stored,
      token,
      cardMessageId: null,
      expiresAt: new Date(now.getTime() + FLOW_TTL_MS),
    })
    return only([send(user.chatId, promptVi, rows)])
  }

  private async card(user: ChatUser, action: ChatAction, state: Meta, now: Date): Promise<UpdateResponse> {
    const chat = user.chatId
    const payload = action.payloadSchema.safeParse(payloadOf(state))
    if (!payload.success) {
      await this.deps.repo.deleteConversation(user.telegramUserId)
      return only([send(chat, TELEGRAM_TEXT.executeFailed('Thiếu thông tin'))])
    }
    const preview = await action.preview(payload.data, user)
    const token = newToken()
    const buttons: Buttons =
      action.risk === 'high'
        ? [[this.button(token, 'next', TELEGRAM_BUTTON.next), this.button(token, 'cancel', TELEGRAM_BUTTON.cancel)]]
        : [[this.button(token, 'ok', TELEGRAM_BUTTON.confirm), this.button(token, 'cancel', TELEGRAM_BUTTON.cancel)]]

    await this.deps.repo.setFlow({
      telegramUserId: user.telegramUserId,
      flow: action.name,
      step: CARD_FIRST,
      state: withoutMeta(state),
      token,
      cardMessageId: null,
      expiresAt: new Date(now.getTime() + CARD_TTL_MS),
    })
    const text = [action.titleVi, ...preview, TELEGRAM_TEXT.cardFooter].join('\n')
    return only([send(chat, text, buttons)])
  }

  /** A prefilled value is kept only when the step accepts it; a choice matches its value or its label. */
  private async prefillValue(user: ChatUser, step: ChatAction['steps'][number], value: unknown, state: Meta): Promise<unknown> {
    switch (step.kind) {
      case 'text':
        return typeof value === 'string' && value.length > 0 && value.length <= step.maxLength ? value : undefined
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value) && value >= step.min && value <= step.max ? value : undefined
      case 'choice': {
        if (typeof value !== 'string') return undefined
        const choices = await step.choices(user, withoutMeta(state))
        const wanted = normalizeText(value)
        return choices.find((choice) => choice.value === value || normalizeText(choice.label) === wanted)?.value
      }
      default:
        return undefined
    }
  }

  private notUnderstood(user: ChatUser): OutboxReply {
    return send(user.chatId, TELEGRAM_TEXT.notUnderstood, menuKeyboard(user.tenant.role, this.deps.callbackKey))
  }

  private button(token: string, step: string, text: string): { text: string; callback_data: string } {
    return { text, callback_data: signCallbackDataV2(this.deps.callbackKey, token, step) }
  }

  private actionNamed(name: string | null): ChatAction | undefined {
    return name === null ? undefined : this.deps.actions.find((action) => action.name === name)
  }

  private toolNamed(name: string): ChatTool | undefined {
    return this.deps.tools.find((tool) => tool.name === name)
  }
}
