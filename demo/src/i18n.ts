import type { AgentLabelsOverride } from '@dudko.dev/agent-web-react'

/** Russian plural: 1 шаг, 2 шага, 5 шагов. */
const ru = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10
  const m100 = n % 100
  const form =
    m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${form}`
}

/**
 * Every label of the chat, in Russian — what `labels` (or
 * `<AgentLabelsProvider>`) is for. Counted phrases are functions, so plurals
 * come out right.
 */
export const RU_LABELS: AgentLabelsOverride = {
  emptyState: 'Попросите агента что-нибудь сделать.',
  status: {
    idle: 'Ожидание',
    initializing: 'Загрузка модели…',
    ready: 'Готов',
    running: 'Работаю…',
    error: 'Не удалось запустить',
  },
  history: 'Чаты',
  newChat: 'Новый чат',
  files: 'Файлы',
  totalUsage: 'Токены за весь разговор, по видам',
  showHistory: 'Показать чаты',
  showFiles: 'Показать файлы',
  close: 'Закрыть',
  steps: (n) => ru(n, 'шаг', 'шага', 'шагов'),
  toolCalls: (n) => ru(n, 'вызов инструмента', 'вызова инструментов', 'вызовов инструментов'),
  subagents: (n) => ru(n, 'субагент', 'субагента', 'субагентов'),
  skillsUsed: (names) => `навыки: ${names}`,
  answerThoughts: 'Размышления над ответом',
  stepThoughts: 'Размышления',
  usageTitle: 'Токены на этот ответ, по видам',
  attachments: 'Вложения',
  planned: 'План',
  replanned: (mode, reason) => `План изменён (${mode}): ${reason}`,
  placeholder: 'Попросите агента о чём-нибудь…  ( / — команды, Ctrl+V — вставить картинку )',
  listening: 'Слушаю…',
  message: 'Сообщение',
  dropHint: 'Отпустите файлы или картинки, чтобы прикрепить',
  attach: 'Прикрепить файлы',
  attachTitle: 'Файлы и картинки (или Ctrl+V, или перетащите сюда)',
  commands: 'Команды',
  commandsTitle: 'Команды и навыки ( / )',
  send: 'Отправить',
  stop: 'Остановить',
  dismiss: 'Скрыть',
  remove: (name) => `Убрать ${name}`,
  dictate: 'Диктовка (речь в текст)',
  dictateTitle: 'Диктовка — распознавание речи в браузере',
  stopDictation: 'Остановить диктовку',
  microphone: 'Микрофон',
  model: 'Модель',
  thinking: 'Размышления',
  toolConsent: 'Согласие на инструменты',
  modes: {
    autopilot: { label: 'Авто', hint: 'Автопилот — запускать любые инструменты без вопросов' },
    'ask-writes': {
      label: 'Спрашивать',
      hint: 'Чтение — свободно, всё, что может что-то изменить, — после подтверждения',
    },
    'ask-all': { label: 'Спрашивать всё', hint: 'Спрашивать перед каждым вызовом' },
    'read-only': { label: 'Только чтение', hint: 'Только читающие инструменты; изменения — отказ' },
  },
  timerRunning: 'Этот запуск идёт',
  timerLast: 'Прошлый запуск занял',
  agents: (n) => ru(n, 'агент', 'агента', 'агентов'),
  agentsTitle: 'Субагенты этого запуска',
  notices: {
    limit: (kind, used, cap) =>
      `Достигнут лимит (${kind}): ${used}/${cap} — агент остановился и ответил тем, что успел`,
    compacted: (scope, before, after) => `Контекст сжат (${scope}): ${before} → ${after} токенов`,
  },
  attachmentsOnly: '(вложения)',
  seeAttachments: 'См. вложения.',
  tooLarge: (name, mb) => `${name} больше ${mb} МБ.`,
  binaryText: (name) => `${name} похож на двоичный файл — как текст его не прикрепить.`,
  commandGroups: { commands: 'Команды', consent: 'Согласие', skills: 'Навыки' },
  commandDescriptions: {
    compact: 'Сжать разговор, чтобы освободить контекст',
    new: 'Начать новый разговор',
    stop: 'Остановить текущий запуск',
    autopilot: 'Запускать инструменты без вопросов',
    ask: 'Спрашивать перед изменениями',
    askAll: 'Спрашивать перед каждым вызовом',
    readOnly: 'Только чтение, изменения — отказ',
    think: (levels) => `Уровень размышлений: ${levels}`,
  },
  thinkingLevels: {
    off: 'По умолчанию',
    none: 'Без размышлений',
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий',
  },
  filesEmpty: 'Пока пусто. Здесь появятся вложения и файлы, которые пишет агент.',
  upload: 'Загрузить',
  download: 'Скачать',
  delete: 'Удалить',
  preview: 'Просмотр',
  historyEmpty: 'Сохранённых чатов пока нет.',
  deleteChat: 'Удалить чат',
  messagesCount: (n) => ru(n, 'сообщение', 'сообщения', 'сообщений'),
  approvalLead: 'Агент хочет запустить',
  approve: 'Разрешить',
  alwaysAllow: 'Разрешать всегда',
  deny: 'Отклонить',
  declinedReason: 'пользователь отказал',
  readOnlyTool: 'только чтение',
  consentWaiting: 'ждёт вашего согласия',
  consentAllowed: 'разрешено',
  consentDenied: (reason) => `отклонено${reason ? ` — ${reason}` : ''}`,
  failed: 'ошибка',
  toolCostTitle: 'Оценка токенов аргументов и результата (символы / 4) и длительность вызова',
}
